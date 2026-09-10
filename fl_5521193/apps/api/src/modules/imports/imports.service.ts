import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Readable } from 'node:stream';
import { AcquisitionSource, ImportRowStatus } from '@astrostone/contracts';
import { importBatches, importRows, type Db } from '@astrostone/db';
import { JobName, retryFailedRows } from '@astrostone/core';
import { PgBossQueue } from '@astrostone/queue';
import { CONFIG, DB, QUEUE } from '../../infrastructure.module';
import type { AppConfig } from '../../config';

const ALLOWED_EXTENSIONS = ['.csv', '.txt', '.xlsx', '.xlsm'];

@Injectable()
export class ImportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(QUEUE) private readonly queue: PgBossQueue,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Файл сохраняется на диск потоком, разбор уходит в очередь: HTTP-запрос
   * не должен ждать обработку десятков тысяч строк.
   */
  async createBatch(input: {
    filename: string;
    stream: Readable;
    source: AcquisitionSource;
    createdBy?: string;
    columnMapping?: Record<string, string>;
  }): Promise<{ batchId: string }> {
    const extension = input.filename.slice(input.filename.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException(`Поддерживаются только файлы: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }

    await mkdir(this.config.UPLOAD_DIR, { recursive: true });

    const storedName = `${Date.now()}-${createHash('sha1').update(input.filename).digest('hex').slice(0, 8)}${extension}`;
    const path = join(this.config.UPLOAD_DIR, storedName);
    const hash = createHash('sha256');

    input.stream.on('data', (chunk: Buffer) => hash.update(chunk));
    await pipeline(input.stream, createWriteStream(path));

    const fileHash = hash.digest('hex');

    const [batch] = await this.db
      .insert(importBatches)
      .values({
        filename: input.filename,
        fileHash,
        source: input.source,
        createdBy: input.createdBy ?? null,
      })
      .returning({ id: importBatches.id });

    if (!batch) throw new Error('import batch insert returned no row');

    await this.queue.enqueue(
      JobName.PARSE_IMPORT_BATCH,
      { batchId: batch.id, filePath: path, columnMapping: input.columnMapping ?? null },
      { singletonKey: `parse:${batch.id}` },
    );

    return { batchId: batch.id };
  }

  async getBatch(id: string) {
    const [batch] = await this.db.select().from(importBatches).where(eq(importBatches.id, id));
    if (!batch) throw new NotFoundException(`Импорт ${id} не найден`);
    return batch;
  }

  async listBatches(limit = 50) {
    return this.db
      .select()
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(limit);
  }

  /** Ошибочные строки с номером и причиной: требование к готовности из плана. */
  async listRows(batchId: string, status?: ImportRowStatus, limit = 200) {
    const where = status
      ? and(eq(importRows.batchId, batchId), eq(importRows.status, status))
      : eq(importRows.batchId, batchId);

    return this.db
      .select({
        id: importRows.id,
        rowNumber: importRows.rowNumber,
        status: importRows.status,
        errorCode: importRows.errorCode,
        errorMessage: importRows.errorMessage,
        contactId: importRows.contactId,
        dealId: importRows.dealId,
      })
      .from(importRows)
      .where(where)
      .orderBy(importRows.rowNumber)
      .limit(limit);
  }

  async retryFailed(batchId: string): Promise<{ requeued: number }> {
    await this.getBatch(batchId);
    const requeued = await retryFailedRows(this.db, batchId, this.queue);
    return { requeued };
  }
}

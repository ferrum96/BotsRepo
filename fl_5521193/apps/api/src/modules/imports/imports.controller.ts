import { BadRequestException, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AcquisitionSource, ImportRowStatus } from '@astrostone/contracts';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly imports: ImportsService) {}

  @Post()
  async upload(@Req() request: FastifyRequest) {
    const file = await request.file();
    if (!file) throw new BadRequestException('Файл не передан');

    const source = (file.fields.source as { value?: string } | undefined)?.value;

    return this.imports.createBatch({
      filename: file.filename,
      stream: file.file,
      source: (source as AcquisitionSource) ?? AcquisitionSource.PARSING_TELEGRAM,
    });
  }

  @Get()
  list() {
    return this.imports.listBatches();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.imports.getBatch(id);
  }

  @Get(':id/rows')
  rows(@Param('id') id: string, @Query('status') status?: ImportRowStatus) {
    return this.imports.listRows(id, status);
  }

  @Get(':id/errors')
  errors(@Param('id') id: string) {
    return this.imports.listRows(id, ImportRowStatus.FAILED);
  }

  @Post(':id/retry-failed')
  retry(@Param('id') id: string) {
    return this.imports.retryFailed(id);
  }
}

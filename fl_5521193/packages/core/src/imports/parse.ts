import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import ExcelJS from 'exceljs';
import type { RawImportRow } from '@astrostone/contracts';

export interface ParsedRow {
  rowNumber: number;
  raw: RawImportRow;
}

export interface ParseOptions {
  /** Предохранитель: файл на миллион строк не должен положить воркер. */
  maxRows?: number;
  onRow: (row: ParsedRow) => Promise<void> | void;
}

export interface ParseResult {
  headers: string[];
  totalRows: number;
  truncated: boolean;
}

const DEFAULT_MAX_ROWS = 200_000;

const cellToPrimitive = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const rich = value as { text?: unknown; result?: unknown; hyperlink?: unknown };
    return rich.text ?? rich.result ?? rich.hyperlink ?? null;
  }
  return value;
};

/**
 * Потоковый разбор CSV. Файл не читается в память целиком: XLSX на 50 тысяч строк
 * при полной загрузке роняет воркер по OOM (docs/04-stack-adr.md, ADR-009).
 */
export async function parseCsv(path: string, options: ParseOptions): Promise<ParseResult> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const parser = createReadStream(path).pipe(
    parse({
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }),
  );

  let totalRows = 0;
  let truncated = false;
  let headers: string[] = [];

  for await (const record of parser) {
    const raw = record as RawImportRow;
    if (headers.length === 0) headers = Object.keys(raw);

    totalRows += 1;
    if (totalRows > maxRows) {
      truncated = true;
      break;
    }

    await options.onRow({ rowNumber: totalRows, raw });
  }

  return { headers, totalRows: truncated ? maxRows : totalRows, truncated };
}

export async function parseXlsx(path: string, options: ParseOptions): Promise<ParseResult> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    entries: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    worksheets: 'emit',
  });

  let headers: string[] = [];
  let totalRows = 0;
  let truncated = false;

  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      const values = (row.values as unknown[]).slice(1).map(cellToPrimitive);

      if (headers.length === 0) {
        headers = values.map((value, index) => String(value ?? `column_${index + 1}`).trim());
        continue;
      }

      const raw: RawImportRow = {};
      headers.forEach((header, index) => {
        raw[header] = values[index] ?? null;
      });

      totalRows += 1;
      if (totalRows > maxRows) {
        truncated = true;
        break;
      }

      await options.onRow({ rowNumber: totalRows, raw });
    }

    // Обрабатываем только первый лист: остальные листы в выгрузках — служебные.
    break;
  }

  return { headers, totalRows: truncated ? maxRows : totalRows, truncated };
}

export async function parseFile(
  path: string,
  filename: string,
  options: ParseOptions,
): Promise<ParseResult> {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCsv(path, options);
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return parseXlsx(path, options);

  throw new Error(`Неподдерживаемый формат файла: ${filename}`);
}

import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export type ExportFormat = 'csv' | 'xlsx';

export type ExportColumn<T> = {
  key: keyof T;
  header: string;
  format?: (value: T[keyof T], row: T) => string | number | null;
};

type ExportCell = string | number | null;

export const parseExportFormat = (value?: string): ExportFormat => {
  if (!value) return 'csv';
  const normalized = value.toLowerCase();
  if (normalized === 'csv' || normalized === 'xlsx') {
    return normalized as ExportFormat;
  }
  throw new BadRequestException('format must be csv or xlsx');
};

const pad = (value: number) => String(value).padStart(2, '0');

export const buildExportStamp = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${m}${d}_${h}${min}${s}`;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const escapeCsv = (value: string): string => {
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const normalizeCell = (value: unknown): ExportCell => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
};

const buildTable = <T,>(items: T[], columns: ExportColumn<T>[]) => {
  const headers = columns.map((column) => column.header);
  const rows: ExportCell[][] = items.map((item) =>
    columns.map((column) => {
      const raw = item[column.key];
      const value = column.format ? column.format(raw, item) : raw;
      return normalizeCell(value);
    }),
  );
  return { headers, rows };
};

const toCsvBuffer = (headers: string[], rows: ExportCell[][]): Buffer => {
  const lines = [
    headers.map((header) => escapeCsv(formatValue(header))).join(','),
    ...rows.map((row) => row.map((cell) => escapeCsv(formatValue(cell))).join(',')),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8');
};

const toXlsxBuffer = async (
  sheetName: string,
  headers: string[],
  rows: ExportCell[][],
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row.map((cell) => cell ?? '')));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
};

export const exportTable = async <T,>(
  sheetName: string,
  items: T[],
  columns: ExportColumn<T>[],
  format: ExportFormat,
): Promise<{ buffer: Buffer; contentType: string; extension: ExportFormat }> => {
  const { headers, rows } = buildTable(items, columns);
  if (format === 'csv') {
    return {
      buffer: toCsvBuffer(headers, rows),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv',
    };
  }
  return {
    buffer: await toXlsxBuffer(sheetName, headers, rows),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  };
};

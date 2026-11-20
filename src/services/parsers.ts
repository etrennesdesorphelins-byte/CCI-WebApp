/**
 * Excel（.xlsx）／CSV の読込。ブラウザ内で完結し、外部へ送信しない。
 */
import Papa from 'papaparse';

/** Excel の式セルで計算済みキャッシュ値が存在しないもの */
export interface UncomputedFormula {
  kind: 'uncomputedFormula';
  formula: string;
}

/** Excel のエラー値（#DIV/0! など） */
export interface CellError {
  kind: 'error';
  error: string;
}

export type RawCell = number | string | boolean | null | UncomputedFormula | CellError;

export interface RawSheet {
  name: string;
  rows: RawCell[][];
  /** 最大列数 */
  columnCount: number;
}

export interface RawWorkbook {
  fileName: string;
  fileType: 'csv' | 'xlsx';
  sheets: RawSheet[];
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class ParseError extends Error {}

function sheetFromRows(name: string, rows: RawCell[][]): RawSheet {
  // 末尾の完全な空行を除去
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((c) => c === null || c === '')) end--;
  const trimmed = rows.slice(0, end);
  const columnCount = trimmed.reduce((m, r) => Math.max(m, r.length), 0);
  return { name, rows: trimmed, columnCount };
}

/** バイト列を文字列化。UTF-8 として不正なら Shift_JIS（Windows 版 Excel の CSV）で再解釈 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

export function parseCsvText(text: string, fileName = 'data.csv'): RawWorkbook {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    skipEmptyLines: false,
    dynamicTyping: false,
  });
  const fatal = res.errors.find((e) => e.type === 'Quotes');
  if (fatal) throw new ParseError(`CSV の解析に失敗しました（${fatal.row ?? '?'}行目付近：${fatal.message}）`);
  const rows: RawCell[][] = res.data.map((r) => r.map((c) => (c === '' ? null : c)));
  const sheet = sheetFromRows('CSV', rows);
  if (sheet.rows.length === 0) throw new ParseError('CSV にデータがありません。');
  return { fileName, fileType: 'csv', sheets: [sheet] };
}

/** ExcelJS のセル値を RawCell に変換 */
function convertExcelValue(v: unknown): RawCell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) {
      const result = o.result;
      if (result === undefined || result === null) {
        return { kind: 'uncomputedFormula', formula: String(o.formula ?? o.sharedFormula ?? '') };
      }
      if (typeof result === 'object' && result !== null && 'error' in result) {
        return { kind: 'error', error: String((result as { error: unknown }).error) };
      }
      return convertExcelValue(result);
    }
    if ('error' in o) return { kind: 'error', error: String(o.error) };
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((r) => r.text).join('');
    }
    if ('text' in o) return String(o.text);
  }
  return String(v);
}

export async function parseXlsxBuffer(buffer: ArrayBuffer, fileName = 'data.xlsx'): Promise<RawWorkbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    throw new ParseError(
      `Excel ファイルを読み込めませんでした（破損しているか .xlsx 形式ではありません）：${(e as Error).message}`,
    );
  }
  const sheets: RawSheet[] = [];
  wb.eachSheet((ws) => {
    const rows: RawCell[][] = [];
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const cells: RawCell[] = [];
      for (let c = 1; c <= colCount; c++) cells.push(convertExcelValue(row.getCell(c).value));
      while (cells.length && cells[cells.length - 1] === null) cells.pop();
      rows.push(cells);
    }
    sheets.push(sheetFromRows(ws.name, rows));
  });
  if (sheets.length === 0) throw new ParseError('Excel ファイルにシートがありません。');
  return { fileName, fileType: 'xlsx', sheets };
}

/** ファイル拡張子を判定して読み込む */
export async function parseFile(file: File): Promise<RawWorkbook> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ParseError(
      `ファイルが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)} MB）。上限は ${MAX_FILE_BYTES / 1024 / 1024} MB です。`,
    );
  }
  const name = file.name;
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return parseCsvText(decodeText(bytes), name);
  }
  if (lower.endsWith('.xlsx')) {
    return parseXlsxBuffer(await file.arrayBuffer(), name);
  }
  if (lower.endsWith('.xls')) {
    throw new ParseError('旧形式の .xls には対応していません。Excel で .xlsx 形式に保存し直してください。');
  }
  throw new ParseError('対応形式は .xlsx と .csv です。');
}

/** 0 始まりの列番号 → Excel 列記号（0→A） */
export function columnLetter(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** RawCell を表示用文字列に */
export function cellToString(c: RawCell | undefined): string {
  if (c === null || c === undefined) return '';
  if (typeof c === 'object') return c.kind === 'error' ? c.error : `=${c.formula}`;
  return String(c);
}

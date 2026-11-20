/**
 * 入力データの検証と解析用データセットへの変換。
 */
import { MUSCLES, type EmgDataset, type MuscleKey } from '../domain/types';
import { cellToString, columnLetter, type RawCell, type RawSheet } from './parsers';

/** 列対応（0 始まりの列番号）。time=null は時間列なし */
export interface ColumnMapping {
  time: number | null;
  RF: number;
  BF: number;
  TA: number;
  Gas: number;
}

/** 初期列対応：A=時間（任意）、B=RF、C=BF、D=TA、E=Gas */
export const DEFAULT_MAPPING: Readonly<ColumnMapping> = Object.freeze({
  time: 0,
  RF: 1,
  BF: 2,
  TA: 3,
  Gas: 4,
});

/**
 * 時間軸の決定方法
 * - auto：時間列が有効な 0〜100% ならそれを採用。無効または列なしで 101 点なら行順で 0〜100% を割当
 * - column：時間列を必ず使用（不正ならエラー）
 * - rowOrder：時間列を無視し、101 点を行順で 0〜100% とする
 */
export type TimeMode = 'auto' | 'column' | 'rowOrder';

export interface InputSettings {
  hasHeader: boolean;
  mapping: ColumnMapping;
  timeMode: TimeMode;
}

export const DEFAULT_SETTINGS: Readonly<InputSettings> = Object.freeze({
  hasHeader: true,
  mapping: DEFAULT_MAPPING,
  timeMode: 'auto',
});

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ValidationResult {
  dataset: EmgDataset | null;
  issues: Issue[];
  /** データ行数（ヘッダー除く） */
  rowCount: number;
  /** 列見出し（ヘッダーありの場合） */
  headers: string[];
}

export const STANDARD_POINTS = 101;
const MAX_LISTED = 10;

type NumParse = { ok: true; value: number } | { ok: false; reason: string };

function toNumber(c: RawCell | undefined): NumParse {
  if (c === null || c === undefined) return { ok: false, reason: '欠損（空欄）' };
  if (typeof c === 'number') {
    return Number.isFinite(c) ? { ok: true, value: c } : { ok: false, reason: '無限大または非数' };
  }
  if (typeof c === 'boolean') return { ok: false, reason: `非数値（${c}）` };
  if (typeof c === 'object') {
    if (c.kind === 'uncomputedFormula') {
      return {
        ok: false,
        reason: `Excel の式が未計算（=${c.formula}）。Excel で開いて保存し直すか、値として貼り付けてください`,
      };
    }
    return { ok: false, reason: `Excel のエラー値（${c.error}）` };
  }
  const s = c.trim();
  if (s === '') return { ok: false, reason: '欠損（空欄）' };
  // 数値リテラルとして厳密に解釈（"12abc" 等を拒否）
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return { ok: false, reason: `非数値（"${s}"）` };
  const v = Number(s);
  return Number.isFinite(v) ? { ok: true, value: v } : { ok: false, reason: '無限大' };
}

/** 同種のメッセージをまとめて上限件数までにする */
function pushLimited(issues: Issue[], list: string[], header: string) {
  if (!list.length) return;
  const shown = list.slice(0, MAX_LISTED).join('\n');
  const more = list.length > MAX_LISTED ? `\n…ほか ${list.length - MAX_LISTED} 件` : '';
  issues.push({ severity: 'error', message: `${header}\n${shown}${more}` });
}

/** 時間列の検証。問題がなければ null、あればメッセージ一覧 */
function checkTimeAxis(t: number[], excelRow: (i: number) => number): string[] {
  const errs: string[] = [];
  const outOfRange = t
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v < 0 || v > 100)
    .map(({ v, i }) => `${excelRow(i)}行目：${v}`);
  if (outOfRange.length) {
    errs.push(
      `歩行周期が 0〜100% の範囲外です：` +
        outOfRange.slice(0, MAX_LISTED).join('、') +
        (outOfRange.length > MAX_LISTED ? ` ほか${outOfRange.length - MAX_LISTED}件` : ''),
    );
  }
  const order: string[] = [];
  for (let i = 1; i < t.length; i++) {
    if (t[i] === t[i - 1]) order.push(`${excelRow(i)}行目：${t[i]}% が重複`);
    else if (t[i] < t[i - 1]) order.push(`${excelRow(i)}行目：${t[i - 1]} → ${t[i]} で降順`);
  }
  if (order.length) {
    errs.push(
      '歩行周期が単調増加ではありません：' +
        order.slice(0, MAX_LISTED).join('、') +
        (order.length > MAX_LISTED ? ` ほか${order.length - MAX_LISTED}件` : ''),
    );
  }
  if (!errs.length && (t[0] !== 0 || t[t.length - 1] !== 100)) {
    errs.push(`歩行周期の両端は 0% と 100% を含む必要があります（現在 ${t[0]}〜${t[t.length - 1]}%）。`);
  }
  return errs;
}

export function validateSheet(sheet: RawSheet, settings: InputSettings): ValidationResult {
  const { hasHeader, mapping, timeMode } = settings;
  const issues: Issue[] = [];
  const headerRow = hasHeader ? (sheet.rows[0] ?? []) : [];
  const headers = Array.from({ length: sheet.columnCount }, (_, i) => cellToString(headerRow[i]));
  const dataRows = hasHeader ? sheet.rows.slice(1) : sheet.rows;
  const offset = hasHeader ? 2 : 1; // データ i 番目 → Excel 行番号 i+offset
  const excelRow = (i: number) => i + offset;
  const n = dataRows.length;
  const base = { rowCount: n, headers };

  if (n === 0) {
    return { ...base, dataset: null, issues: [{ severity: 'error', message: 'データ行がありません。' }] };
  }
  if (n < 2) {
    return { ...base, dataset: null, issues: [{ severity: 'error', message: 'データ行が2行以上必要です。' }] };
  }

  // 列不足・重複割当
  const missing = MUSCLES.filter((m) => {
    const col = mapping[m];
    return col >= sheet.columnCount || dataRows.every((r) => r[col] === null || r[col] === undefined);
  });
  if (missing.length) {
    issues.push({
      severity: 'error',
      message:
        '筋電データの列が不足しています：' +
        missing.map((m) => `${m}（${columnLetter(mapping[m])}列）`).join('、'),
    });
  }
  const used = new Map<number, string>();
  for (const key of ['time', ...MUSCLES] as const) {
    const col = mapping[key];
    if (col === null || (key === 'time' && timeMode === 'rowOrder')) continue;
    const label = key === 'time' ? '歩行周期' : key;
    if (used.has(col)) {
      issues.push({
        severity: 'error',
        message: `${columnLetter(col)}列が ${used.get(col)} と ${label} に重複して割り当てられています。`,
      });
    }
    used.set(col, label);
  }
  if (issues.length) return { ...base, dataset: null, issues };

  // 筋電値の検証
  const muscles = {} as Record<MuscleKey, number[]>;
  const cellErrors: string[] = [];
  const negatives: string[] = [];
  for (const m of MUSCLES) {
    const col = mapping[m];
    const values: number[] = [];
    dataRows.forEach((row, i) => {
      const p = toNumber(row[col]);
      if (!p.ok) {
        cellErrors.push(`${excelRow(i)}行目 ${m}（${columnLetter(col)}列）：${p.reason}`);
        values.push(NaN);
      } else {
        if (p.value < 0) negatives.push(`${excelRow(i)}行目 ${m}（${columnLetter(col)}列）：${p.value}`);
        values.push(p.value);
      }
    });
    muscles[m] = values;
  }
  pushLimited(issues, cellErrors, '数値として読めないセルがあります：');
  pushLimited(issues, negatives, '負の値が含まれています（正規化後の活動値は0以上である必要があります）：');

  // 時間軸の決定
  let percent: number[] | null = null;
  let timeSource: EmgDataset['timeSource'] = 'rowOrder';
  const rowOrderAxis = () => Array.from({ length: n }, (_, i) => (100 * i) / (n - 1));
  const timeCol = mapping.time;
  // 自動モードで時間列が完全に空（または列が存在しない）なら「時間列なし」と同じ扱い
  const timeColEmpty =
    timeCol !== null &&
    timeMode === 'auto' &&
    dataRows.every((r) => r[timeCol] === null || r[timeCol] === undefined);

  if (timeMode === 'rowOrder' || timeCol === null || timeColEmpty) {
    if (n === STANDARD_POINTS) {
      percent = rowOrderAxis();
      issues.push({ severity: 'info', message: `時間列を使用せず、${n} 行を行順に 0〜100%（1%刻み）として割り当てました。` });
    } else {
      issues.push({
        severity: 'error',
        message: `データが ${n} 行です。時間列なしで解析できるのは ${STANDARD_POINTS} 点（0〜100%）の場合のみです。歩行周期（0〜100%）の時間列を指定してください。`,
      });
    }
  } else {
    const parsed = dataRows.map((r) => toNumber(r[timeCol]));
    const bad = parsed
      .map((p, i) => (p.ok ? null : `${excelRow(i)}行目：${p.reason}`))
      .filter((x): x is string => x !== null);
    const t = parsed.map((p) => (p.ok ? p.value : NaN));
    const timeErrs = bad.length
      ? [`歩行周期列（${columnLetter(timeCol)}列）に数値でないセルがあります：${bad.slice(0, MAX_LISTED).join('、')}`]
      : checkTimeAxis(t, excelRow);

    if (!timeErrs.length) {
      percent = t;
      timeSource = 'column';
      issues.push({ severity: 'info', message: `${columnLetter(timeCol)}列を歩行周期（%）として使用しました。` });
    } else if (timeMode === 'auto' && n === STANDARD_POINTS) {
      percent = rowOrderAxis();
      issues.push({
        severity: 'warning',
        message: `${columnLetter(timeCol)}列は歩行周期 0〜100% として解釈できないため（${timeErrs[0]}）、${n} 行を行順に 0〜100% として割り当てました。行番号などの場合は問題ありません。`,
      });
    } else {
      for (const msg of timeErrs) issues.push({ severity: 'error', message: msg });
      if (timeMode === 'auto') {
        issues.push({
          severity: 'error',
          message: `データが ${n} 行のため、行順による 0〜100% の自動割当（${STANDARD_POINTS} 点のみ）も行えません。`,
        });
      }
    }
  }

  const hasError = issues.some((i) => i.severity === 'error');
  if (hasError || !percent) return { ...base, dataset: null, issues };
  return { ...base, dataset: { percent, muscles, timeSource }, issues };
}

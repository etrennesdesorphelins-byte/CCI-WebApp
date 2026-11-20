/**
 * 結果出力（CSV / Excel）。ファイルはブラウザ内で生成しダウンロードさせる。
 */
import Papa from 'papaparse';
import {
  CALCULATION_METHOD,
  INTEGRATION_METHOD,
  MUSCLE_LABELS,
  MUSCLES,
  NORMALIZATION_METHOD,
  type PairDef,
} from '../domain/types';
import type { PhaseBoundaries, PhaseRange } from '../domain/phases';
import type { PairPhaseResult } from './cci';
import { columnLetter } from './parsers';
import type { ColumnMapping } from './validation';

export interface ExportMeta {
  sourceFile: string;
  sheetName: string;
  pairs: readonly PairDef[];
  phases: readonly PhaseRange[];
  boundaries: PhaseBoundaries;
  mapping: ColumnMapping;
  hasHeader: boolean;
  timeSource: 'column' | 'rowOrder';
  pointCount: number;
  /** 解析実行日時（利用端末時刻） */
  analyzedAt: Date;
  appVersion: string;
}

export const CSV_COLUMNS = [
  'source_file',
  'sheet',
  'pair',
  'phase',
  'start_percent',
  'end_percent',
  'cci_percent',
  'na_reason',
  'calculation_method',
  'integration_method',
  'normalization_method',
  'analyzed_at',
] as const;

/** 端末ローカル時刻（タイムゾーンオフセット付き ISO 8601） */
export function localIsoString(d: Date): string {
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/**
 * CCI 結果 CSV。cci_percent は丸めない値（再現性のため）。N/A は空欄とし、理由を na_reason に記載。
 */
export function buildResultsCsv(results: readonly PairPhaseResult[], meta: ExportMeta): string {
  const at = localIsoString(meta.analyzedAt);
  const rows = results.map((r) => ({
    source_file: meta.sourceFile,
    sheet: meta.sheetName,
    pair: r.pair.label.replace('–', '-'),
    phase: r.phase.key,
    start_percent: r.phase.start,
    end_percent: r.phase.end,
    cci_percent: r.result.value === null ? '' : r.result.value,
    na_reason: r.result.value === null ? 'N/A: ' + (r.result.reason ?? '') : '',
    calculation_method: CALCULATION_METHOD,
    integration_method: INTEGRATION_METHOD,
    normalization_method: NORMALIZATION_METHOD,
    analyzed_at: at,
  }));
  // Excel で文字化けしないよう BOM 付きは呼出側で付与
  return Papa.unparse({ fields: [...CSV_COLUMNS], data: rows.map((r) => CSV_COLUMNS.map((c) => r[c])) });
}

/** Settings シートに記録する項目（Excel 出力・画面表示共通） */
export function settingsRows(meta: ExportMeta): [string, string | number][] {
  const rows: [string, string | number][] = [
    ['入力ファイル名', meta.sourceFile],
    ['シート', meta.sheetName],
    ['解析実行日時（端末時刻）', localIsoString(meta.analyzedAt)],
    ['計算式', CALCULATION_METHOD],
    ['積分法', INTEGRATION_METHOD],
    ['振幅正規化', NORMALIZATION_METHOD],
    ['分母0の扱い', 'N/A（0% とはしない）'],
    ['表示丸め', '表示のみ小数第2位（内部計算・出力値は丸めない）'],
    ['筋ペア', meta.pairs.map((p) => p.label).join(', ')],
    ['データ点数', meta.pointCount],
    [
      '時間軸',
      meta.timeSource === 'column'
        ? `時間列（${meta.mapping.time === null ? '-' : columnLetter(meta.mapping.time) + '列'}）の値を使用`
        : '行順に 0〜100% を等間隔で割当',
    ],
    ['ヘッダー行', meta.hasHeader ? 'あり（1行目）' : 'なし'],
  ];
  for (const m of MUSCLES) rows.push([`列対応：${MUSCLE_LABELS[m]}`, `${columnLetter(meta.mapping[m])}列`]);
  rows.push(['相境界：LR終了 (%)', meta.boundaries.lrEnd]);
  rows.push(['相境界：SLS終了 (%)', meta.boundaries.slsEnd]);
  rows.push(['相境界：PSw終了 (%)', meta.boundaries.pswEnd]);
  for (const p of meta.phases) rows.push([`区間：${p.key}（${p.name}）`, `${p.start}–${p.end}%`]);
  rows.push([
    '注意',
    '相境界の%は標準的な時間配分の便宜的な初期値であり、実際の接地・離地イベントから判定した区間ではない。',
  ]);
  rows.push(['アプリバージョン', meta.appVersion]);
  return rows;
}

export async function buildResultsXlsx(
  results: readonly PairPhaseResult[],
  meta: ExportMeta,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CCI WebApp';
  wb.created = meta.analyzedAt;

  // --- CCI_Results ---
  const ws = wb.addWorksheet('CCI_Results');
  ws.addRow(['歩行相', '名称', '開始 (%)', '終了 (%)', ...meta.pairs.map((p) => `${p.label} CCI (%)`), 'N/A 理由']);
  ws.getRow(1).font = { bold: true };
  for (const phase of meta.phases) {
    const cells = meta.pairs.map((pair) => {
      const r = results.find((x) => x.pair.id === pair.id && x.phase.key === phase.key)!.result;
      return r.value === null ? 'N/A' : r.value;
    });
    const reasons = meta.pairs
      .map((pair) => {
        const r = results.find((x) => x.pair.id === pair.id && x.phase.key === phase.key)!.result;
        return r.value === null ? `${pair.label}: ${r.reason}` : null;
      })
      .filter(Boolean)
      .join('; ');
    ws.addRow([phase.key, phase.name, phase.start, phase.end, ...cells, reasons]);
  }
  for (let i = 0; i < meta.pairs.length; i++) ws.getColumn(5 + i).numFmt = '0.00';
  ws.columns.forEach((c, i) => (c.width = i === 1 ? 24 : 16));
  ws.addRow([]);
  ws.addRow(['入力ファイル', meta.sourceFile]);
  ws.addRow(['注記', 'セルの表示は小数第2位。セル値は丸めていない。']);

  // --- Settings ---
  const st = wb.addWorksheet('Settings');
  st.addRow(['項目', '値']);
  st.getRow(1).font = { bold: true };
  for (const r of settingsRows(meta)) st.addRow(r);
  st.getColumn(1).width = 30;
  st.getColumn(2).width = 90;

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** ファイル名の拡張子を除去して安全化 */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'cci';
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

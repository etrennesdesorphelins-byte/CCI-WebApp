import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { columnLetter, decodeText, parseCsvText, parseXlsxBuffer, ParseError, type RawSheet } from '../services/parsers';
import { DEFAULT_SETTINGS, validateSheet, type InputSettings } from '../services/validation';
import { computeAll, computeCci, interpolate } from '../services/cci';
import { buildResultsCsv, buildResultsXlsx, CSV_COLUMNS, type ExportMeta } from '../services/export';
import { DEFAULT_BOUNDARIES, phaseRanges } from '../domain/phases';
import { DEFAULT_PAIRS } from '../domain/types';

const root = resolve(__dirname, '../..');
const sampleCsv = readFileSync(resolve(root, 'public/sample_synthetic.csv'), 'utf-8');
const sampleXlsx = readFileSync(resolve(root, 'public/sample_synthetic.xlsx'));

function csv(lines: (string | number)[][]): string {
  return lines.map((l) => l.join(',')).join('\n');
}
function sheetOf(lines: (string | number)[][]): RawSheet {
  return parseCsvText(csv(lines)).sheets[0];
}
const header = ['pct', 'RF', 'BF', 'TA', 'Gas'];
const rows101 = (f: (i: number) => (string | number)[]) => Array.from({ length: 101 }, (_, i) => f(i));
const ok101 = rows101((i) => [i, 1, 2, 3, 4]);
const errorsOf = (s: RawSheet, settings: InputSettings = DEFAULT_SETTINGS) =>
  validateSheet(s, settings).issues.filter((i) => i.severity === 'error').map((i) => i.message).join('\n');

describe('列記号', () => {
  it('A, B, ..., Z, AA', () => {
    expect([0, 1, 4, 25, 26, 27].map(columnLetter)).toEqual(['A', 'B', 'E', 'Z', 'AA', 'AB']);
  });
});

describe('CSV 読込と時間軸', () => {
  it('ヘッダーあり・A列 0〜100% → 時間列を採用', () => {
    const r = validateSheet(sheetOf([header, ...ok101]), DEFAULT_SETTINGS);
    expect(r.dataset).not.toBeNull();
    expect(r.dataset!.timeSource).toBe('column');
    expect(r.dataset!.percent).toHaveLength(101);
    expect(r.dataset!.muscles.RF[0]).toBe(1);
    expect(r.dataset!.muscles.Gas[100]).toBe(4);
    expect(r.headers).toEqual(header);
  });

  it('ヘッダーなし', () => {
    const r = validateSheet(sheetOf(ok101), { ...DEFAULT_SETTINGS, hasHeader: false });
    expect(r.dataset!.percent[100]).toBe(100);
  });

  it('A列が行番号（1〜101）で101行 → 行順で 0〜100% を割当（警告）', () => {
    const r = validateSheet(sheetOf([header, ...rows101((i) => [i + 1, 1, 2, 3, 4])]), DEFAULT_SETTINGS);
    expect(r.dataset!.timeSource).toBe('rowOrder');
    expect(r.dataset!.percent[50]).toBe(50);
    expect(r.issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('時間列なし（列割当を外す）・101行 → 0〜100%', () => {
    const lines = [['RF', 'BF', 'TA', 'Gas'], ...rows101(() => [1, 2, 3, 4])];
    const r = validateSheet(sheetOf(lines), {
      ...DEFAULT_SETTINGS,
      mapping: { time: null, RF: 0, BF: 1, TA: 2, Gas: 3 },
    });
    expect(r.dataset!.percent).toEqual(Array.from({ length: 101 }, (_, i) => i));
  });

  it('101点以外：時間列 0〜100% が単調増加かつ両端を含めば受理', () => {
    const t = [0, 2.5, 10, 40, 70, 100];
    const r = validateSheet(sheetOf([header, ...t.map((p) => [p, 1, 2, 3, 4])]), DEFAULT_SETTINGS);
    expect(r.dataset!.percent).toEqual(t);
  });

  it('101点未満で時間列なし → 時間列の指定を促す', () => {
    const lines = [header, ...Array.from({ length: 51 }, () => ['', 1, 2, 3, 4])];
    const e = errorsOf(sheetOf(lines));
    expect(e).toMatch(/時間列を指定してください|自動割当/);
  });

  it('Shift_JIS の CSV を読める', () => {
    // "歩行周期" を Shift_JIS で
    const sjis = new Uint8Array([0x95, 0xe0, 0x8d, 0x73, 0x8e, 0xfc, 0x8a, 0xfa, 0x2c, 0x31]);
    expect(decodeText(sjis)).toBe('歩行周期,1');
  });
});

describe('AT-09 異常系', () => {
  it('列不足：不足筋名と列を示す', () => {
    const lines = [['pct', 'RF', 'BF'], ...rows101((i) => [i, 1, 2])];
    const e = errorsOf(sheetOf(lines));
    expect(e).toMatch(/TA（D列）/);
    expect(e).toMatch(/Gas（E列）/);
  });

  it('非数値・欠損：行番号と筋名を示す', () => {
    const lines = [header, ...ok101];
    lines[6] = [5, 'abc', 2, 3, 4]; // Excel 7行目
    lines[11] = [10, 1, '', 3, 4]; // Excel 12行目
    const e = errorsOf(sheetOf(lines));
    expect(e).toMatch(/7行目 RF（B列）：非数値/);
    expect(e).toMatch(/12行目 BF（C列）：欠損/);
  });

  it('負値：行番号と筋名を示す', () => {
    const lines = [header, ...ok101];
    lines[21] = [20, 1, 2, -0.5, 4];
    expect(errorsOf(sheetOf(lines))).toMatch(/22行目 TA（D列）：-0.5/);
  });

  it('時間列の降順・重複（時間列モード）', () => {
    const lines = [header, ...ok101];
    lines[31] = [29, 1, 2, 3, 4]; // 30 の位置に 29 → 重複
    const e = errorsOf(sheetOf(lines), { ...DEFAULT_SETTINGS, timeMode: 'column' });
    expect(e).toMatch(/重複/);
    lines[31] = [28, 1, 2, 3, 4];
    expect(errorsOf(sheetOf(lines), { ...DEFAULT_SETTINGS, timeMode: 'column' })).toMatch(/降順/);
  });

  it('時間列が 0〜100% を逸脱', () => {
    const t = [0, 50, 120];
    const e = errorsOf(sheetOf([header, ...t.map((p) => [p, 1, 2, 3, 4])]));
    expect(e).toMatch(/範囲外/);
  });

  it('両端 0, 100 を含まない', () => {
    const t = [5, 50, 100];
    expect(errorsOf(sheetOf([header, ...t.map((p) => [p, 1, 2, 3, 4])]))).toMatch(/両端/);
  });

  it('同じ列を重複して割り当て', () => {
    const e = errorsOf(sheetOf([header, ...ok101]), {
      ...DEFAULT_SETTINGS,
      mapping: { time: 0, RF: 1, BF: 1, TA: 3, Gas: 4 },
    });
    expect(e).toMatch(/重複して割り当て/);
  });

  it('壊れた xlsx → ParseError（例外で落ちない）', async () => {
    await expect(parseXlsxBuffer(new Uint8Array([1, 2, 3, 4]).buffer)).rejects.toBeInstanceOf(ParseError);
  });

  it('Excel の未計算の式 → 変換を促すエラー', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.addRow(header);
    for (let i = 0; i <= 100; i++) ws.addRow([i, 1, 2, 3, 4]);
    ws.getCell('C10').value = { formula: 'B10*2' } as ExcelJS.CellFormulaValue;
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const book = await parseXlsxBuffer(buf, 'f.xlsx');
    expect(errorsOf(book.sheets[0])).toMatch(/10行目 BF（C列）：Excel の式が未計算/);
  });

  it('Excel の計算済みの式はキャッシュ値を使う', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.addRow(header);
    for (let i = 0; i <= 100; i++) ws.addRow([i, 1, 2, 3, 4]);
    ws.getCell('C10').value = { formula: 'B10*2', result: 2 } as ExcelJS.CellFormulaValue;
    const book = await parseXlsxBuffer((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const r = validateSheet(book.sheets[0], DEFAULT_SETTINGS);
    expect(r.dataset!.muscles.BF[8]).toBe(2);
  });
});

describe('AT-10 / FR-19 サンプルデータ', () => {
  const phases = phaseRanges(DEFAULT_BOUNDARIES);

  it('CSV と xlsx で同一結果', async () => {
    const c = validateSheet(parseCsvText(sampleCsv).sheets[0], DEFAULT_SETTINGS).dataset!;
    const x = validateSheet((await parseXlsxBuffer(sampleXlsx.buffer.slice(
      sampleXlsx.byteOffset, sampleXlsx.byteOffset + sampleXlsx.byteLength) as ArrayBuffer)).sheets[0],
      DEFAULT_SETTINGS).dataset!;
    expect(x).toEqual(c);
    expect(computeAll(x, DEFAULT_PAIRS, phases)).toEqual(computeAll(c, DEFAULT_PAIRS, phases));
  });

  it('サンプルの CCI が既知値（独立した数値積分）と一致', () => {
    const d = validateSheet(parseCsvText(sampleCsv).sheets[0], DEFAULT_SETTINGS).dataset!;
    for (const pair of DEFAULT_PAIRS) {
      for (const ph of phases) {
        const a = d.muscles[pair.a];
        const b = d.muscles[pair.b];
        const n = 100000;
        const h = (ph.end - ph.start) / n;
        let num = 0;
        let den = 0;
        for (let i = 0; i < n; i++) {
          const x = ph.start + (i + 0.5) * h;
          const av = interpolate(d.percent, a, x);
          const bv = interpolate(d.percent, b, x);
          num += 2 * Math.min(av, bv);
          den += av + bv;
        }
        const r = computeCci(d.percent, a, b, ph.start, ph.end);
        expect(r.value!).toBeCloseTo((100 * num) / den, 3);
      }
    }
  });
});

describe('結果出力', () => {
  const d = validateSheet(parseCsvText(sampleCsv).sheets[0], DEFAULT_SETTINGS).dataset!;
  const meta = (lrEnd = 10): ExportMeta => ({
    sourceFile: 'sample_synthetic.csv',
    sheetName: 'CSV',
    pairs: DEFAULT_PAIRS,
    phases: phaseRanges({ ...DEFAULT_BOUNDARIES, lrEnd }),
    boundaries: { ...DEFAULT_BOUNDARIES, lrEnd },
    mapping: DEFAULT_SETTINGS.mapping,
    hasHeader: true,
    timeSource: 'column',
    pointCount: 101,
    analyzedAt: new Date(2026, 10, 20, 9, 0, 0),
    appVersion: 'test',
  });

  it('CSV：必須列・10行（2ペア×5区間）・境界を含む', () => {
    const m = meta();
    const text = buildResultsCsv(computeAll(d, DEFAULT_PAIRS, m.phases), m);
    const lines = text.trim().split(/\r?\n/);
    expect(lines[0].split(',')).toEqual([...CSV_COLUMNS]);
    expect(lines).toHaveLength(11);
    expect(text).toMatch(/sample_synthetic\.csv,CSV,RF-BF,SLS,10,50,/);
  });

  it('AT-06 境界変更が出力に反映', () => {
    const m = meta(12);
    const text = buildResultsCsv(computeAll(d, DEFAULT_PAIRS, m.phases), m);
    expect(text).toMatch(/RF-BF,LR,0,12,/);
    expect(text).toMatch(/RF-BF,SLS,12,50,/);
  });

  it('N/A は空欄＋理由', () => {
    const zero = { ...d, muscles: { ...d.muscles, RF: d.muscles.RF.map(() => 0), BF: d.muscles.BF.map(() => 0) } };
    const m = meta();
    const text = buildResultsCsv(computeAll(zero, DEFAULT_PAIRS, m.phases), m);
    expect(text).toMatch(/RF-BF,GC,0,100,,N\/A: 分母0/);
  });

  it('Excel：CCI_Results と Settings シート', async () => {
    const m = meta();
    const buf = await buildResultsXlsx(computeAll(d, DEFAULT_PAIRS, m.phases), m);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const res = wb.getWorksheet('CCI_Results')!;
    const st = wb.getWorksheet('Settings')!;
    expect(res.getRow(1).values).toContain('RF–BF CCI (%)');
    expect(res.getCell('A4').value).toBe('SLS');
    expect(res.getCell('C4').value).toBe(10);
    expect(res.getCell('D4').value).toBe(50);
    const settingsText = JSON.stringify(st.getSheetValues());
    expect(settingsText).toContain('sample_synthetic.csv');
    expect(settingsText).toContain('台形則');
    expect(settingsText).toContain('2026-11-20T09:00:00');
  });
});

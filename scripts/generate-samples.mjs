/**
 * 合成サンプルデータ（実在の被験者データではない）を生成する。
 *   node scripts/generate-samples.mjs
 * 出力：public/sample_synthetic.csv, public/sample_synthetic.xlsx（同一データ）
 *
 * 各筋をガウス型バーストの和で表し、各筋の歩行周期平均値で除して正規化する。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import ExcelJS from 'exceljs';

const g = (t, mu, sd, amp) => amp * Math.exp(-0.5 * ((t - mu) / sd) ** 2);
// 周期境界をまたぐバーストも滑らかにするため ±100% の像を加える
const burst = (t, mu, sd, amp) => g(t, mu, sd, amp) + g(t, mu - 100, sd, amp) + g(t, mu + 100, sd, amp);

const raw = {
  RF: (t) => 0.05 + burst(t, 5, 6, 1.0) + burst(t, 55, 6, 0.6) + burst(t, 95, 5, 0.5),
  BF: (t) => 0.05 + burst(t, 2, 7, 0.9) + burst(t, 90, 6, 1.1),
  TA: (t) => 0.05 + burst(t, 3, 6, 1.0) + burst(t, 70, 9, 0.8),
  Gas: (t) => 0.05 + burst(t, 40, 9, 1.2),
};

const pct = Array.from({ length: 101 }, (_, i) => i);
const cols = {};
for (const [m, f] of Object.entries(raw)) {
  const v = pct.map(f);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  cols[m] = v.map((x) => Number((x / mean).toFixed(6)));
}

const header = ['GaitCycle_%', 'RF', 'BF', 'TA', 'Gas'];
const rows = pct.map((p, i) => [p, cols.RF[i], cols.BF[i], cols.TA[i], cols.Gas[i]]);

mkdirSync('public', { recursive: true });
writeFileSync('public/sample_synthetic.csv', [header, ...rows].map((r) => r.join(',')).join('\n') + '\n');

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('EMG');
ws.addRow(header);
rows.forEach((r) => ws.addRow(r));
await wb.xlsx.writeFile('public/sample_synthetic.xlsx');
console.log('generated public/sample_synthetic.csv, public/sample_synthetic.xlsx');

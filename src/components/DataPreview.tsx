import { MUSCLES } from '../domain/types';
import type { Analysis } from '../hooks/useAnalysis';
import { cellToString, columnLetter } from '../services/parsers';

const PREVIEW_ROWS = 8;
const ICON = { error: '⛔', warning: '⚠️', info: 'ℹ️' } as const;
const LABEL = { error: 'エラー', warning: '注意', info: '情報' } as const;

export function DataPreview({ an }: { an: Analysis }) {
  const { sheet, validation, settings } = an;
  if (!sheet || !validation) return null;
  const d = validation.dataset;
  const startRow = settings.hasHeader ? 1 : 0;
  const rows = sheet.rows.slice(startRow, startRow + PREVIEW_ROWS);
  const cols = Math.min(Math.max(sheet.columnCount, 5), 12);
  const roleOf = (c: number) => {
    if (settings.timeMode !== 'rowOrder' && settings.mapping.time === c) return '歩行周期';
    return MUSCLES.find((m) => settings.mapping[m] === c) ?? '';
  };

  return (
    <section className="card" aria-labelledby="sec-preview">
      <h2 id="sec-preview">3. 入力プレビュー</h2>
      <dl className="stats">
        <div>
          <dt>データ行数</dt>
          <dd>{validation.rowCount}</dd>
        </div>
        <div>
          <dt>歩行周期の範囲</dt>
          <dd>{d ? `${d.percent[0]}〜${d.percent[d.percent.length - 1]}%` : '—'}</dd>
        </div>
        <div>
          <dt>時間軸</dt>
          <dd>{d ? (d.timeSource === 'column' ? '時間列の値' : '行順で割当') : '—'}</dd>
        </div>
        <div>
          <dt>検証結果</dt>
          <dd className={d ? 'ok' : 'ng'}>{d ? '✔ 解析可能' : '✖ 解析不可'}</dd>
        </div>
      </dl>
      {d && (
        <table className="mini">
          <caption>4筋の値の範囲</caption>
          <thead>
            <tr>
              <th>筋</th>
              <th>最小</th>
              <th>最大</th>
              <th>平均</th>
            </tr>
          </thead>
          <tbody>
            {MUSCLES.map((m) => {
              const v = d.muscles[m];
              const mean = v.reduce((s, x) => s + x, 0) / v.length;
              return (
                <tr key={m}>
                  <th>{m}</th>
                  <td>{Math.min(...v).toFixed(3)}</td>
                  <td>{Math.max(...v).toFixed(3)}</td>
                  <td>{mean.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <ul className="issues">
        {validation.issues.map((i, k) => (
          <li key={k} className={`issue ${i.severity}`} role={i.severity === 'error' ? 'alert' : undefined}>
            <span aria-hidden>{ICON[i.severity]}</span> <strong>{LABEL[i.severity]}：</strong>
            <span className="pre">{i.message}</span>
          </li>
        ))}
      </ul>
      <div className="scroll-x">
        <table className="preview">
          <caption>先頭 {rows.length} 行（全 {validation.rowCount} 行）</caption>
          <thead>
            <tr>
              <th>行</th>
              {Array.from({ length: cols }, (_, c) => (
                <th key={c}>
                  {columnLetter(c)}
                  {validation.headers[c] && <div className="muted small">{validation.headers[c]}</div>}
                  {roleOf(c) && <div className="role">→ {roleOf(c)}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th>{i + startRow + 1}</th>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}>{cellToString(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

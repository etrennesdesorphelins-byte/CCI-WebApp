import type { Analysis } from '../hooks/useAnalysis';
import { formatCci } from '../services/cci';

export function ResultsTable({ an }: { an: Analysis }) {
  const { results, phases, pairs } = an;
  if (!results || !phases) return null;
  const get = (pairId: string, phase: string) =>
    results.find((r) => r.pair.id === pairId && r.phase.key === phase)!.result;
  const naNotes = results.filter((r) => r.result.value === null);

  return (
    <section className="card" aria-labelledby="sec-results">
      <h2 id="sec-results">5. CCI 結果</h2>
      <table className="results">
        <caption className="small muted">行をクリックすると、グラフでその区間を強調表示します。</caption>
        <thead>
          <tr>
            <th scope="col">歩行相</th>
            <th scope="col">範囲</th>
            {pairs.map((p) => (
              <th key={p.id} scope="col" className="num">
                {p.label} CCI (%)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {phases.map((ph) => {
            const selected = an.selectedPhase === ph.key;
            return (
              <tr
                key={ph.key}
                className={selected ? 'selected' : undefined}
                aria-selected={selected}
                tabIndex={0}
                onClick={() => an.setSelectedPhase(ph.key)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && an.setSelectedPhase(ph.key)}
              >
                <th scope="row">
                  {selected ? '▶ ' : ''}
                  {ph.key} <span className="muted small">{ph.name}</span>
                </th>
                <td>
                  {ph.start}–{ph.end}%
                </td>
                {pairs.map((p) => {
                  const r = get(p.id, ph.key);
                  return (
                    <td key={p.id} className="num" title={r.reason}>
                      {formatCci(r)}
                      {r.value === null && <sup>*</sup>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {naNotes.length > 0 && (
        <ul className="small">
          {naNotes.map((r) => (
            <li key={r.pair.id + r.phase.key}>
              * {r.pair.label} / {r.phase.key}：N/A — {r.result.reason}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        表示は小数第2位に丸めています（内部計算・出力ファイルの値は丸めていません）。各区間は直接積分で算出し、GC は相別CCIの平均ではありません。
      </p>
    </section>
  );
}

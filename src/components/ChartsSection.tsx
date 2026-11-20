import { useRef } from 'react';
import type { Analysis } from '../hooks/useAnalysis';
import { baseName } from '../services/export';
import { downloadChartPng, EmgChart } from './EmgChart';

export function ChartsSection({ an }: { an: Analysis }) {
  const divs = useRef<Record<string, HTMLDivElement | null>>({});
  const data = an.validation?.dataset;
  if (!an.results || !an.phases || !data || !an.workbook) return null;
  const phases = an.phases;
  const results = an.results;
  const selected = phases.find((p) => p.key === an.selectedPhase) ?? phases[0];
  const file = an.workbook.fileName;

  return (
    <section className="card" aria-labelledby="sec-charts">
      <h2 id="sec-charts">6. 筋活動波形</h2>
      <div className="row gap" role="radiogroup" aria-label="強調表示する区間">
        <span className="muted">強調区間：</span>
        {phases.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={p.key === selected.key}
            className={p.key === selected.key ? 'chip active' : 'chip'}
            onClick={() => an.setSelectedPhase(p.key)}
          >
            {p.key}（{p.start}–{p.end}%）
          </button>
        ))}
      </div>
      <div className="charts">
        {an.pairs.map((pair) => (
          <div key={pair.id}>
            <EmgChart
              data={data}
              pair={pair}
              phases={phases}
              selected={selected}
              results={results}
              sourceFile={file}
              onReady={(d) => (divs.current[pair.id] = d)}
            />
            <button
              type="button"
              onClick={() => {
                const d = divs.current[pair.id];
                if (d) void downloadChartPng(d, `${baseName(file)}_CCI_${pair.id}_${selected.key}`);
              }}
            >
              {pair.label} のグラフをPNG保存
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

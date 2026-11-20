import { useEffect, useMemo, useRef } from 'react';
import Plotly from 'plotly.js-basic-dist-min';
import type { Data, Layout, Shape, Annotations } from 'plotly.js';
import type { EmgDataset, MuscleKey, PairDef } from '../domain/types';
import type { PhaseRange } from '../domain/phases';
import { formatCci, interpolate, overlapCurve, type PairPhaseResult } from '../services/cci';

/** 色覚多様性に配慮した色（Okabe–Ito）＋線種で区別 */
const STYLE: Record<MuscleKey, { color: string; dash: 'solid' | 'dash' }> = {
  RF: { color: '#0072B2', dash: 'solid' },
  BF: { color: '#D55E00', dash: 'dash' },
  TA: { color: '#009E73', dash: 'solid' },
  Gas: { color: '#CC79A7', dash: 'dash' },
};

/** 区分線形曲線を [s,e] で切り出す（端点は補間） */
function clipCurve(t: number[], y: number[], s: number, e: number) {
  const ts = [s];
  const ys = [interpolate(t, y, s)];
  t.forEach((x, i) => {
    if (x > s && x < e) {
      ts.push(x);
      ys.push(y[i]);
    }
  });
  ts.push(e);
  ys.push(interpolate(t, y, e));
  return { t: ts, y: ys };
}

interface Props {
  data: EmgDataset;
  pair: PairDef;
  phases: readonly PhaseRange[];
  selected: PhaseRange;
  results: readonly PairPhaseResult[];
  sourceFile: string;
  onReady?: (div: HTMLDivElement | null) => void;
}

export function EmgChart({ data, pair, phases, selected, results, sourceFile, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const a = data.muscles[pair.a];
  const b = data.muscles[pair.b];
  const t = data.percent;
  const result = results.find((r) => r.pair.id === pair.id && r.phase.key === selected.key)!.result;
  const cciText = formatCci(result) + (result.value === null ? '' : '%');

  const { traces, layout } = useMemo(() => {
    const ov = overlapCurve(t, a, b);
    const sel = clipCurve(ov.t, ov.y, selected.start, selected.end);
    const traces: Data[] = [
      {
        x: ov.t,
        y: ov.y,
        type: 'scatter',
        mode: 'lines',
        name: '重複 min(a,b)（全周期）',
        line: { width: 0 },
        fill: 'tozeroy',
        fillcolor: 'rgba(120,120,120,0.18)',
        hoverinfo: 'skip',
      },
      {
        x: sel.t,
        y: sel.y,
        type: 'scatter',
        mode: 'lines',
        name: `重複 min(a,b)（${selected.key}）`,
        line: { width: 0 },
        fill: 'tozeroy',
        fillcolor: 'rgba(80,80,80,0.42)',
        hoverinfo: 'skip',
      },
      ...[pair.a, pair.b].map(
        (m): Data => ({
          x: t,
          y: data.muscles[m],
          type: 'scatter',
          mode: 'lines',
          name: m,
          line: { color: STYLE[m].color, dash: STYLE[m].dash, width: 2.5 },
          hovertemplate: `${m}: %{y:.3f}<br>%{x:.1f}%<extra></extra>`,
        }),
      ),
    ];
    const yMax = Math.max(...a, ...b, 1e-9);
    const shapes: Partial<Shape>[] = [
      {
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: selected.start,
        x1: selected.end,
        y0: 0,
        y1: 1,
        fillcolor: 'rgba(255,200,0,0.12)',
        line: { width: 0 },
        layer: 'below',
      },
      ...[selected.start, selected.end].map(
        (x): Partial<Shape> => ({
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: x,
          x1: x,
          y0: 0,
          y1: 1,
          line: { color: '#333', width: 1.5 },
        }),
      ),
    ];
    // 歩行相の境界（点線）とラベル
    const subPhases = phases.filter((p) => p.key !== 'GC');
    for (const p of subPhases.slice(1)) {
      shapes.push({
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: p.start,
        x1: p.start,
        y0: 0,
        y1: 1,
        line: { color: '#999', width: 1, dash: 'dot' },
      });
    }
    const annotations: Partial<Annotations>[] = subPhases.map((p) => ({
      x: (p.start + p.end) / 2,
      y: 1.0,
      xref: 'x',
      yref: 'paper',
      yanchor: 'bottom',
      text: p.key,
      showarrow: false,
      font: { size: 11, color: p.key === selected.key ? '#000' : '#777' },
    }));
    const layout: Partial<Layout> = {
      title: {
        text:
          `${pair.label}　選択区間：${selected.key} ${selected.start}–${selected.end}%　CCI = ${cciText}` +
          `<br><span style="font-size:11px;color:#666">${sourceFile}</span>`,
        font: { size: 15 },
      },
      xaxis: { title: { text: '歩行周期 (%)' }, range: [0, 100], dtick: 10, zeroline: false },
      yaxis: { title: { text: '正規化筋活動 (a.u.)' }, range: [0, yMax * 1.08], rangemode: 'tozero' },
      shapes,
      annotations,
      legend: { orientation: 'h', y: -0.22 },
      margin: { t: 80, r: 20, b: 90, l: 60 },
      paper_bgcolor: '#fff',
      plot_bgcolor: '#fff',
      height: 400,
    };
    return { traces, layout };
  }, [t, a, b, data.muscles, pair, phases, selected, cciText, sourceFile]);

  useEffect(() => {
    const div = ref.current;
    if (!div) return;
    void Plotly.react(div, traces, layout, {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['select2d', 'lasso2d'],
      toImageButtonOptions: { format: 'png', filename: `CCI_${pair.id}_${selected.key}`, scale: 2 },
    });
  }, [traces, layout, pair.id, selected.key]);

  useEffect(() => {
    const div = ref.current;
    onReady?.(div);
    return () => {
      if (div) Plotly.purge(div);
    };
  }, []); // マウント時のみ（onReady の再生成で再登録しない）

  return (
    <figure className="chart">
      <div ref={ref} role="img" aria-label={`${pair.label} の筋活動波形と重複領域。${selected.key} の CCI は ${cciText}`} />
      <figcaption>
        <strong>{pair.label}</strong>：選択区間 {selected.key}（{selected.start}–{selected.end}%）の CCI ={' '}
        <strong>{cciText}</strong>
        {result.value === null && `（${result.reason}）`}
        <span className="muted small">
          {' '}
          ／ 実線={pair.a}、破線={pair.b}、濃い灰色の塗り=選択区間の重複 min({pair.a},{pair.b})
        </span>
      </figcaption>
    </figure>
  );
}

/** 表示中のグラフを PNG で保存（筋名・軸名・対象区間がタイトル・凡例として残る） */
export function downloadChartPng(div: HTMLDivElement, filename: string) {
  return Plotly.downloadImage(div, { format: 'png', filename, width: 1000, height: 520, scale: 2 } as never);
}

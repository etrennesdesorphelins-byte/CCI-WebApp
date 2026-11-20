/**
 * CCI（Co-Contraction Index）計算モジュール
 *
 * React 等の UI に依存しない純粋関数のみで構成する。
 *
 *   CCI_[s,e] = 100 × 2∫_s^e min(a,b) dt / ∫_s^e (a+b) dt
 *
 * - 入力サンプル間は線形補間（区分線形関数）とみなし、台形則で厳密に積分する。
 * - 2波形がサンプル間で交差する場合は交点を挿入して min(a,b) を積分する。
 * - 区間端点がサンプル間にある場合は線形補間点を挿入する。
 * - 分母が 0 の場合は N/A（null）を返す。
 * - 内部計算では丸めない。
 */
import type { CciResult, EmgDataset, PairDef } from '../domain/types';
import type { PhaseRange } from '../domain/phases';

/** 区分線形補間。t は [t[0], t[n-1]] 内であること */
export function interpolate(t: readonly number[], y: readonly number[], x: number): number {
  const n = t.length;
  if (n === 0) throw new Error('空の系列は補間できません');
  if (x <= t[0]) return y[0];
  if (x >= t[n - 1]) return y[n - 1];
  // 二分探索で t[lo] <= x < t[hi]
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= x) lo = mid;
    else hi = mid;
  }
  if (t[lo] === x) return y[lo];
  const f = (x - t[lo]) / (t[hi] - t[lo]);
  return y[lo] + (y[hi] - y[lo]) * f;
}

interface Sample {
  t: number;
  a: number;
  b: number;
}

/** 区間 [start,end] に含まれるサンプル列を、端点の補間点込みで返す */
function clipSamples(
  t: readonly number[],
  a: readonly number[],
  b: readonly number[],
  start: number,
  end: number,
): Sample[] {
  const out: Sample[] = [{ t: start, a: interpolate(t, a, start), b: interpolate(t, b, start) }];
  for (let i = 0; i < t.length; i++) {
    if (t[i] > start && t[i] < end) out.push({ t: t[i], a: a[i], b: b[i] });
  }
  out.push({ t: end, a: interpolate(t, a, end), b: interpolate(t, b, end) });
  return out;
}

/**
 * min(a,b) の区分線形曲線を、交点を挿入した点列として返す（グラフの塗り表示にも使用）。
 */
export function overlapCurve(
  t: readonly number[],
  a: readonly number[],
  b: readonly number[],
): { t: number[]; y: number[] } {
  const ts: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (i > 0) {
      const c = crossing(t[i - 1], a[i - 1], b[i - 1], t[i], a[i], b[i]);
      if (c) {
        ts.push(c.t);
        ys.push(c.v);
      }
    }
    ts.push(t[i]);
    ys.push(Math.min(a[i], b[i]));
  }
  return { t: ts, y: ys };
}

/** 隣接2サンプル間で a-b の符号が反転する場合、その交点を返す */
function crossing(
  t0: number,
  a0: number,
  b0: number,
  t1: number,
  a1: number,
  b1: number,
): { t: number; v: number } | null {
  const d0 = a0 - b0;
  const d1 = a1 - b1;
  if (!(d0 * d1 < 0)) return null;
  const f = d0 / (d0 - d1); // 0 < f < 1
  return { t: t0 + (t1 - t0) * f, v: a0 + (a1 - a0) * f };
}

const trap = (dt: number, y0: number, y1: number) => (dt * (y0 + y1)) / 2;

/**
 * 区間 [start,end] における 2∫min(a,b) と ∫(a+b) を返す。
 */
export function integratePair(
  t: readonly number[],
  a: readonly number[],
  b: readonly number[],
  start: number,
  end: number,
): { overlap: number; total: number } {
  if (t.length !== a.length || t.length !== b.length) {
    throw new Error('時間軸と筋活動の系列長が一致しません');
  }
  if (t.length < 2) throw new Error('2点以上のデータが必要です');
  if (!(start < end)) throw new Error(`区間が不正です（開始 ${start} ≥ 終了 ${end}）`);
  if (start < t[0] || end > t[t.length - 1]) {
    throw new Error(`区間 ${start}–${end}% がデータ範囲 ${t[0]}–${t[t.length - 1]}% の外です`);
  }

  const s = clipSamples(t, a, b, start, end);
  let minArea = 0;
  let total = 0;
  for (let i = 1; i < s.length; i++) {
    const p = s[i - 1];
    const q = s[i];
    const dt = q.t - p.t;
    if (dt <= 0) continue;
    total += trap(dt, p.a + p.b, q.a + q.b);
    const c = crossing(p.t, p.a, p.b, q.t, q.a, q.b);
    if (c) {
      minArea += trap(c.t - p.t, Math.min(p.a, p.b), c.v);
      minArea += trap(q.t - c.t, c.v, Math.min(q.a, q.b));
    } else {
      minArea += trap(dt, Math.min(p.a, p.b), Math.min(q.a, q.b));
    }
  }
  return { overlap: 2 * minArea, total };
}

export const NA_REASON_ZERO_DENOMINATOR = '分母0（区間内で両筋の活動面積がともに0）';

/** 区間 [start,end] の CCI（%）を計算する */
export function computeCci(
  t: readonly number[],
  a: readonly number[],
  b: readonly number[],
  start: number,
  end: number,
): CciResult {
  const { overlap, total } = integratePair(t, a, b, start, end);
  if (!(total > 0)) {
    return { value: null, reason: NA_REASON_ZERO_DENOMINATOR, numerator: overlap, denominator: total };
  }
  return { value: (100 * overlap) / total, numerator: overlap, denominator: total };
}

export interface PairPhaseResult {
  pair: PairDef;
  phase: PhaseRange;
  result: CciResult;
}

/** 全ペア × 全区間の CCI を計算する（各区間は直接積分。相の平均で全周期を求めない） */
export function computeAll(
  data: EmgDataset,
  pairs: readonly PairDef[],
  phases: readonly PhaseRange[],
): PairPhaseResult[] {
  const out: PairPhaseResult[] = [];
  for (const pair of pairs) {
    const a = data.muscles[pair.a];
    const b = data.muscles[pair.b];
    for (const phase of phases) {
      out.push({ pair, phase, result: computeCci(data.percent, a, b, phase.start, phase.end) });
    }
  }
  return out;
}

/** 表示用：小数第2位に丸めた文字列。N/A は 'N/A' */
export function formatCci(r: CciResult): string {
  return r.value === null ? 'N/A' : r.value.toFixed(2);
}

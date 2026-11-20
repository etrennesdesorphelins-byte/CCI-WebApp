import { describe, expect, it } from 'vitest';
import {
  computeAll,
  computeCci,
  formatCci,
  integratePair,
  interpolate,
  overlapCurve,
} from '../services/cci';
import { DEFAULT_BOUNDARIES, phaseRanges, validateBoundaries } from '../domain/phases';
import { DEFAULT_PAIRS, type EmgDataset } from '../domain/types';

const pct101 = Array.from({ length: 101 }, (_, i) => i);
const constant = (v: number) => pct101.map(() => v);

function dataset(rf: number[], bf: number[], ta = constant(1), gas = constant(1)): EmgDataset {
  return { percent: pct101, muscles: { RF: rf, BF: bf, TA: ta, Gas: gas }, timeSource: 'rowOrder' };
}

/** 区分線形補間関数を非常に細かい格子で数値積分する（独立した検算用） */
function bruteForceCci(t: number[], a: number[], b: number[], s: number, e: number, n = 200000) {
  let num = 0;
  let den = 0;
  const h = (e - s) / n;
  for (let i = 0; i < n; i++) {
    const x = s + (i + 0.5) * h; // 中点則
    const av = interpolate(t, a, x);
    const bv = interpolate(t, b, x);
    num += 2 * Math.min(av, bv) * h;
    den += (av + bv) * h;
  }
  return (100 * num) / den;
}

describe('受入試験：定数入力', () => {
  it('AT-01 RF=BF=2 → 100.00%', () => {
    const r = computeCci(pct101, constant(2), constant(2), 0, 100);
    expect(r.value).toBeCloseTo(100, 10);
    expect(formatCci(r)).toBe('100.00');
  });

  it('AT-02 RF=1, BF=3 → 50.00%', () => {
    const r = computeCci(pct101, constant(1), constant(3), 0, 100);
    expect(r.value).toBeCloseTo(50, 10);
    expect(formatCci(r)).toBe('50.00');
  });

  it('AT-03 RF=0, BF=3 → 0.00%', () => {
    const r = computeCci(pct101, constant(0), constant(3), 0, 100);
    expect(r.value).toBe(0);
    expect(formatCci(r)).toBe('0.00');
  });

  it('AT-04 RF=BF=0 → N/A（0やNaNにしない）', () => {
    const r = computeCci(pct101, constant(0), constant(0), 0, 100);
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/分母0/);
    expect(formatCci(r)).toBe('N/A');
  });

  it('AT-04 分母0は該当ペア・相のみ N/A、他は計算される', () => {
    // RF, BF は LR（0–10%）でのみ両方0
    const rf = pct101.map((p) => (p <= 10 ? 0 : 2));
    const bf = pct101.map((p) => (p <= 10 ? 0 : 2));
    const res = computeAll(dataset(rf, bf), DEFAULT_PAIRS, phaseRanges(DEFAULT_BOUNDARIES));
    const get = (pair: string, phase: string) =>
      res.find((x) => x.pair.id === pair && x.phase.key === phase)!.result;
    expect(get('RF-BF', 'LR').value).toBeNull();
    expect(get('RF-BF', 'SLS').value).toBeCloseTo(100, 10);
    expect(get('TA-Gas', 'LR').value).toBeCloseTo(100, 10);
  });
});

describe('受入試験：歩行相', () => {
  it('AT-05 初期境界は GC 0–100, LR 0–10, SLS 10–50, PSw 50–60, Sw 60–100', () => {
    const ranges = phaseRanges(DEFAULT_BOUNDARIES).map((p) => [p.key, p.start, p.end]);
    expect(ranges).toEqual([
      ['GC', 0, 100],
      ['LR', 0, 10],
      ['SLS', 10, 50],
      ['PSw', 50, 60],
      ['Sw', 60, 100],
    ]);
    expect(validateBoundaries(DEFAULT_BOUNDARIES)).toEqual([]);
  });

  it('AT-06 LR終了 10→12 で LR=0–12、SLS=12–50 となり CCI が更新される', () => {
    const rf = pct101.map((p) => p);
    const bf = constant(50);
    const d = dataset(rf, bf);
    const before = computeAll(d, DEFAULT_PAIRS, phaseRanges(DEFAULT_BOUNDARIES));
    const changed = phaseRanges({ ...DEFAULT_BOUNDARIES, lrEnd: 12 });
    expect(changed.find((p) => p.key === 'LR')).toMatchObject({ start: 0, end: 12 });
    expect(changed.find((p) => p.key === 'SLS')).toMatchObject({ start: 12, end: 50 });
    const after = computeAll(d, DEFAULT_PAIRS, changed);
    const lr = (r: typeof before) => r.find((x) => x.pair.id === 'RF-BF' && x.phase.key === 'LR')!.result.value!;
    expect(lr(after)).not.toBeCloseTo(lr(before), 6);
    // 解析解：a=t, b=50, [0,12] → 2·(12²/2) / (12²/2 + 600)
    expect(lr(after)).toBeCloseTo((100 * 144) / (72 + 600), 10);
  });

  it('AT-07 サンプル間で交差する2波形：交点分割が解析解と一致', () => {
    // a: 0→2, b: 2→0。交点 t=0.5, 値1。∫min = 0.5、∫(a+b) = 2 → CCI = 100·2·0.5/2 = 50%
    const r = computeCci([0, 1], [0, 2], [2, 0], 0, 1);
    expect(r.value).toBeCloseTo(50, 12);
    // 交点を挿入しない単純な台形則では 0% になってしまうことの確認
    expect(overlapCurve([0, 1], [0, 2], [2, 0])).toEqual({ t: [0, 0.5, 1], y: [0, 1, 0] });
  });

  it('AT-07 101点・非整数位置の交差：解析解と一致', () => {
    // a = t, b = 50.5 - t ... 交点 t=25.25（サンプル間）
    const a = pct101.map((p) => p);
    const b = pct101.map((p) => Math.max(0, 50.5 - p));
    // [0, 50] で：min = a (t<25.25), b (t>25.25)
    // ∫min = 25.25²/2 + ∫_{25.25}^{50} (50.5-t) dt
    const tc = 25.25;
    const minInt = (tc * tc) / 2 + (50.5 * (50 - tc) - (50 * 50 - tc * tc) / 2);
    const sumInt = (50 * 50) / 2 + (50.5 * 50 - (50 * 50) / 2);
    const r = computeCci(pct101, a, b, 0, 50);
    expect(r.value).toBeCloseTo((100 * 2 * minInt) / sumInt, 10);
  });

  it('AT-08 境界 12.5%：線形補間で 12.5% で区切られる', () => {
    const a = pct101.map((p) => p); // a(t)=t
    const b = constant(100);
    const r = computeCci(pct101, a, b, 0, 12.5);
    const minInt = (12.5 * 12.5) / 2;
    expect(r.numerator).toBeCloseTo(2 * minInt, 12);
    expect(r.denominator).toBeCloseTo(minInt + 1250, 12);
    // 隣接区間で面積を重複計上しない（加法性）
    const left = integratePair(pct101, a, b, 0, 12.5);
    const right = integratePair(pct101, a, b, 12.5, 50);
    const whole = integratePair(pct101, a, b, 0, 50);
    expect(left.overlap + right.overlap).toBeCloseTo(whole.overlap, 10);
    expect(left.total + right.total).toBeCloseTo(whole.total, 10);
  });
});

describe('計算の性質', () => {
  const a = pct101.map((p) => 1 + Math.sin((2 * Math.PI * p) / 100) + 0.3 * Math.cos((6 * Math.PI * p) / 100));
  const b = pct101.map((p) => 1 + Math.cos((2 * Math.PI * p) / 37) * 0.8);

  it('区分線形補間の高精度数値積分と一致する', () => {
    for (const [s, e] of [
      [0, 100],
      [0, 10],
      [10, 50],
      [12.34, 56.78],
    ]) {
      const r = computeCci(pct101, a, b, s, e);
      expect(r.value!).toBeCloseTo(bruteForceCci(pct101, a, b, s, e), 4);
    }
  });

  it('対称性：CCI(a,b) = CCI(b,a)', () => {
    expect(computeCci(pct101, a, b, 0, 100).value).toBeCloseTo(computeCci(pct101, b, a, 0, 100).value!, 12);
  });

  it('全周期 CCI は相別 CCI の単純平均ではなく直接積分で求める', () => {
    const res = computeAll(dataset(a, b), DEFAULT_PAIRS, phaseRanges(DEFAULT_BOUNDARIES));
    const rfbf = res.filter((x) => x.pair.id === 'RF-BF');
    const gc = rfbf.find((x) => x.phase.key === 'GC')!.result;
    const sub = rfbf.filter((x) => x.phase.key !== 'GC').map((x) => x.result);
    expect(gc.numerator).toBeCloseTo(sub.reduce((s, r) => s + r.numerator, 0), 10);
    expect(gc.denominator).toBeCloseTo(sub.reduce((s, r) => s + r.denominator, 0), 10);
  });

  it('再現性：同一入力なら同一結果', () => {
    expect(computeCci(pct101, a, b, 3, 77)).toEqual(computeCci(pct101, a, b, 3, 77));
  });

  it('CCI は 0〜100% の範囲', () => {
    const r = computeCci(pct101, a, b, 0, 100).value!;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });

  it('不等間隔の時間軸にも対応', () => {
    const t = [0, 5, 20, 21, 60, 100];
    const x = [1, 3, 0, 2, 5, 1];
    const y = [2, 1, 1, 4, 0, 1];
    expect(computeCci(t, x, y, 0, 100).value!).toBeCloseTo(bruteForceCci(t, x, y, 0, 100), 4);
  });

  it('区間がデータ範囲外ならエラー', () => {
    expect(() => computeCci(pct101, a, b, -1, 50)).toThrow();
    expect(() => computeCci(pct101, a, b, 50, 50)).toThrow();
  });
});

describe('境界バリデーション', () => {
  it('順序違反・範囲外を検出', () => {
    expect(validateBoundaries({ lrEnd: 0, slsEnd: 50, pswEnd: 60 })).not.toEqual([]);
    expect(validateBoundaries({ lrEnd: 50, slsEnd: 50, pswEnd: 60 })).not.toEqual([]);
    expect(validateBoundaries({ lrEnd: 10, slsEnd: 70, pswEnd: 60 })).not.toEqual([]);
    expect(validateBoundaries({ lrEnd: 10, slsEnd: 50, pswEnd: 100 })).not.toEqual([]);
    expect(validateBoundaries({ lrEnd: NaN, slsEnd: 50, pswEnd: 60 })).not.toEqual([]);
    expect(validateBoundaries({ lrEnd: 12.5, slsEnd: 50, pswEnd: 60 })).toEqual([]);
  });
});

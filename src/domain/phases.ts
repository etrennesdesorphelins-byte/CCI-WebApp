/** 歩行相の定義と境界 */
export type PhaseKey = 'GC' | 'LR' | 'SLS' | 'PSw' | 'Sw';

export const PHASE_KEYS: readonly PhaseKey[] = ['GC', 'LR', 'SLS', 'PSw', 'Sw'];

export const PHASE_NAMES: Record<PhaseKey, string> = {
  GC: '歩行周期全体',
  LR: '荷重応答期',
  SLS: '単脚支持期（MSt＋TSt）',
  PSw: '前遊脚期',
  Sw: '遊脚期',
};

/** 編集可能な3境界（GC開始=0、Sw終了=100は固定） */
export interface PhaseBoundaries {
  lrEnd: number;
  slsEnd: number;
  pswEnd: number;
}

/** 初期値（確定仕様）：LR 0–10、SLS 10–50、PSw 50–60、Sw 60–100 */
export const DEFAULT_BOUNDARIES: Readonly<PhaseBoundaries> = Object.freeze({
  lrEnd: 10,
  slsEnd: 50,
  pswEnd: 60,
});

export interface PhaseRange {
  key: PhaseKey;
  name: string;
  start: number;
  end: number;
}

export function phaseRanges(b: PhaseBoundaries): PhaseRange[] {
  const r = (key: PhaseKey, start: number, end: number): PhaseRange => ({
    key,
    name: PHASE_NAMES[key],
    start,
    end,
  });
  return [
    r('GC', 0, 100),
    r('LR', 0, b.lrEnd),
    r('SLS', b.lrEnd, b.slsEnd),
    r('PSw', b.slsEnd, b.pswEnd),
    r('Sw', b.pswEnd, 100),
  ];
}

/** 0 < LR終了 < SLS終了 < PSw終了 < 100 を検証。問題があればメッセージ配列を返す */
export function validateBoundaries(b: PhaseBoundaries): string[] {
  const errors: string[] = [];
  const entries: [string, number][] = [
    ['LR終了', b.lrEnd],
    ['SLS終了', b.slsEnd],
    ['PSw終了', b.pswEnd],
  ];
  for (const [name, v] of entries) {
    if (!Number.isFinite(v)) errors.push(`${name}が数値ではありません。`);
  }
  if (errors.length) return errors;
  if (!(b.lrEnd > 0)) errors.push('LR終了は0%より大きくしてください。');
  if (!(b.lrEnd < b.slsEnd)) errors.push('LR終了 < SLS終了 となるようにしてください。');
  if (!(b.slsEnd < b.pswEnd)) errors.push('SLS終了 < PSw終了 となるようにしてください。');
  if (!(b.pswEnd < 100)) errors.push('PSw終了は100%より小さくしてください。');
  return errors;
}

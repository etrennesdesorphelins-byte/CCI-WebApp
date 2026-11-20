/** 対象4筋 */
export const MUSCLES = ['RF', 'BF', 'TA', 'Gas'] as const;
export type MuscleKey = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<MuscleKey, string> = {
  RF: 'RF（大腿直筋）',
  BF: 'BF（大腿二頭筋）',
  TA: 'TA（前脛骨筋）',
  Gas: 'Gas（腓腹筋）',
};

/** 筋ペア定義（将来、任意ペア追加に拡張可能な構造） */
export interface PairDef {
  id: string;
  label: string;
  a: MuscleKey;
  b: MuscleKey;
}

export const DEFAULT_PAIRS: readonly PairDef[] = [
  { id: 'RF-BF', label: 'RF–BF', a: 'RF', b: 'BF' },
  { id: 'TA-Gas', label: 'TA–Gas', a: 'TA', b: 'Gas' },
];

/** 時間正規化済みの1試行データ */
export interface EmgDataset {
  /** 歩行周期 %（0〜100、単調増加） */
  percent: number[];
  muscles: Record<MuscleKey, number[]>;
  /** 時間軸の由来 */
  timeSource: 'column' | 'rowOrder';
}

/** CCI 計算結果。value=null は N/A */
export interface CciResult {
  value: number | null;
  /** N/A の理由 */
  reason?: string;
  /** 2∫min(a,b) */
  numerator: number;
  /** ∫(a+b) */
  denominator: number;
}

export const CALCULATION_METHOD =
  'CCI = 100 × 2∫min(a,b)dt / ∫(a+b)dt（重複面積型）';
export const INTEGRATION_METHOD =
  '線形補間に基づく台形則（波形交点・相境界の補間点を挿入）';
export const NORMALIZATION_METHOD =
  '入力値をそのまま使用（各筋の歩行周期平均値で正規化済みを前提。アプリでの再正規化・平滑化・整流なし）';

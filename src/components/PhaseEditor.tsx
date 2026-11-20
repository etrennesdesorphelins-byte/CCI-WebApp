import { DEFAULT_BOUNDARIES } from '../domain/phases';
import type { Analysis, BoundaryDraft } from '../hooks/useAnalysis';

const FIELDS: { key: keyof BoundaryDraft; label: string }[] = [
  { key: 'lrEnd', label: 'LR終了（= SLS開始）' },
  { key: 'slsEnd', label: 'SLS終了（= PSw開始）' },
  { key: 'pswEnd', label: 'PSw終了（= Sw開始）' },
];

export function PhaseEditor({ an }: { an: Analysis }) {
  const canAnalyze = !!an.validation?.dataset && an.boundaryErrors.length === 0;
  return (
    <section className="card" aria-labelledby="sec-phase">
      <h2 id="sec-phase">4. 解析設定</h2>
      <p className="muted small">
        計算式：CCI = 100 × 2∫min(a,b)dt / ∫(a+b)dt（初期版では固定）／ 対象ペア：RF–BF、TA–Gas
      </p>
      <fieldset className="phase-fields">
        <legend>歩行相の境界（%）— GC開始 0%、Sw終了 100% は固定</legend>
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={100}
              value={an.draft[f.key]}
              aria-invalid={an.boundaryErrors.length > 0}
              onChange={(e) => an.setDraft({ ...an.draft, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <button type="button" onClick={an.resetBoundaries}>
          初期値に戻す（{DEFAULT_BOUNDARIES.lrEnd}, {DEFAULT_BOUNDARIES.slsEnd}, {DEFAULT_BOUNDARIES.pswEnd}%）
        </button>
      </fieldset>
      {an.phases && (
        <p className="small">
          {an.phases
            .filter((p) => p.key !== 'GC')
            .map((p) => `${p.key} ${p.start}–${p.end}%`)
            .join(' ／ ')}
        </p>
      )}
      {an.boundaryErrors.map((e) => (
        <p key={e} className="issue error" role="alert">
          ⛔ {e}
        </p>
      ))}
      <p className="note small">
        ※ 境界の%は標準的な時間配分による便宜的な初期値です。被験者の実際の接地・離地イベントから判定した区間ではありません。
        病的歩行（脳卒中など）では実測イベントに合わせて変更してください。
      </p>
      <button type="button" className="primary" disabled={!canAnalyze} onClick={an.analyze}>
        {an.analyzed ? '解析済み（設定変更は自動で再計算されます）' : '解析'}
      </button>
      {!an.validation?.dataset && an.workbook && (
        <span className="muted small"> 入力エラーを解消すると解析できます。</span>
      )}
    </section>
  );
}

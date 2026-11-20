import { MUSCLE_LABELS, MUSCLES } from '../domain/types';
import type { Analysis } from '../hooks/useAnalysis';
import { columnLetter } from '../services/parsers';
import { DEFAULT_MAPPING, type ColumnMapping as Mapping, type TimeMode } from '../services/validation';

const TIME_MODES: { value: TimeMode; label: string }[] = [
  { value: 'auto', label: '自動（時間列が0〜100%なら採用、無効で101行なら行順）' },
  { value: 'column', label: '時間列の値を使用' },
  { value: 'rowOrder', label: '行順に0〜100%を割当（101行）' },
];

export function ColumnMapping({ an }: { an: Analysis }) {
  const { workbook, sheet, settings, setSettings } = an;
  if (!workbook || !sheet) return null;
  const headers = an.validation?.headers ?? [];
  const colCount = Math.max(sheet.columnCount, 5);
  const options = Array.from({ length: colCount }, (_, i) => ({
    value: i,
    label: `${columnLetter(i)}列${headers[i] ? `（${headers[i]}）` : ''}`,
  }));

  const setMap = (key: keyof Mapping, v: number | null) =>
    setSettings({ ...settings, mapping: { ...settings.mapping, [key]: v } });

  return (
    <section className="card" aria-labelledby="sec-mapping">
      <h2 id="sec-mapping">2. シート・列の対応</h2>
      <div className="grid-form">
        {workbook.sheets.length > 1 && (
          <label>
            対象シート
            <select value={an.sheetIndex} onChange={(e) => an.setSheetIndex(Number(e.target.value))}>
              {workbook.sheets.map((s, i) => (
                <option key={i} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.hasHeader}
            onChange={(e) => setSettings({ ...settings, hasHeader: e.target.checked })}
          />
          先頭行はヘッダー（列名）
        </label>
        <label>
          時間軸
          <select
            value={settings.timeMode}
            onChange={(e) => setSettings({ ...settings, timeMode: e.target.value as TimeMode })}
          >
            {TIME_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          歩行周期（%）列
          <select
            value={settings.mapping.time ?? ''}
            disabled={settings.timeMode === 'rowOrder'}
            onChange={(e) => setMap('time', e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">なし</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {MUSCLES.map((m) => (
          <label key={m}>
            {MUSCLE_LABELS[m]}
            <select value={settings.mapping[m]} onChange={(e) => setMap(m, Number(e.target.value))}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="link"
        onClick={() => setSettings({ ...settings, mapping: { ...DEFAULT_MAPPING } })}
      >
        列対応を初期値（A=歩行周期, B=RF, C=BF, D=TA, E=Gas）に戻す
      </button>
    </section>
  );
}

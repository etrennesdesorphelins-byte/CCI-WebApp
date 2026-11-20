import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_PAIRS } from '../domain/types';
import {
  DEFAULT_BOUNDARIES,
  phaseRanges,
  validateBoundaries,
  type PhaseBoundaries,
  type PhaseKey,
} from '../domain/phases';
import { computeAll, type PairPhaseResult } from '../services/cci';
import { parseFile, parseCsvText, parseXlsxBuffer, type RawWorkbook } from '../services/parsers';
import { DEFAULT_SETTINGS, validateSheet, type InputSettings } from '../services/validation';

export type BoundaryDraft = Record<keyof PhaseBoundaries, string>;

const toDraft = (b: PhaseBoundaries): BoundaryDraft => ({
  lrEnd: String(b.lrEnd),
  slsEnd: String(b.slsEnd),
  pswEnd: String(b.pswEnd),
});

function parseDraft(d: BoundaryDraft): PhaseBoundaries {
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  return { lrEnd: num(d.lrEnd), slsEnd: num(d.slsEnd), pswEnd: num(d.pswEnd) };
}

/** 画面状態と解析ロジックの接続。計算自体は services の純粋関数に委ねる */
export function useAnalysis() {
  const [workbook, setWorkbook] = useState<RawWorkbook | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [settings, setSettings] = useState<InputSettings>({ ...DEFAULT_SETTINGS });
  const [draft, setDraft] = useState<BoundaryDraft>(toDraft(DEFAULT_BOUNDARIES));
  const [analyzed, setAnalyzed] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<PhaseKey>('GC');

  const accept = useCallback((wb: RawWorkbook) => {
    setWorkbook(wb);
    setSheetIndex(0);
    setAnalyzed(false);
    setLoadError(null);
  }, []);

  const load = useCallback(
    async (job: () => Promise<RawWorkbook>) => {
      setLoading(true);
      setLoadError(null);
      try {
        accept(await job());
      } catch (e) {
        setWorkbook(null);
        setAnalyzed(false);
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [accept],
  );

  const loadFile = useCallback((file: File) => load(() => parseFile(file)), [load]);

  const loadSample = useCallback(
    (kind: 'csv' | 'xlsx') =>
      load(async () => {
        const url = `${import.meta.env.BASE_URL}sample_synthetic.${kind}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`サンプルを取得できませんでした（${res.status}）`);
        return kind === 'csv'
          ? parseCsvText(await res.text(), 'sample_synthetic.csv')
          : parseXlsxBuffer(await res.arrayBuffer(), 'sample_synthetic.xlsx');
      }),
    [load],
  );

  const sheet = workbook?.sheets[sheetIndex] ?? null;
  const validation = useMemo(() => (sheet ? validateSheet(sheet, settings) : null), [sheet, settings]);

  const boundaries = useMemo(() => parseDraft(draft), [draft]);
  const boundaryErrors = useMemo(() => validateBoundaries(boundaries), [boundaries]);
  const phases = useMemo(
    () => (boundaryErrors.length ? null : phaseRanges(boundaries)),
    [boundaries, boundaryErrors],
  );

  const computed = useMemo((): { results: PairPhaseResult[] | null; error: string | null; at: Date } => {
    const at = new Date();
    if (!analyzed || !validation?.dataset || !phases) return { results: null, error: null, at };
    try {
      return { results: computeAll(validation.dataset, DEFAULT_PAIRS, phases), error: null, at };
    } catch (e) {
      return { results: null, error: e instanceof Error ? e.message : String(e), at };
    }
  }, [analyzed, validation, phases]);

  return {
    workbook,
    loading,
    loadError,
    loadFile,
    loadSample,
    sheetIndex,
    setSheetIndex,
    sheet,
    settings,
    setSettings,
    validation,
    draft,
    setDraft,
    resetBoundaries: () => setDraft(toDraft(DEFAULT_BOUNDARIES)),
    boundaries,
    boundaryErrors,
    phases,
    analyzed,
    analyze: () => setAnalyzed(true),
    results: computed.results,
    computeError: computed.error,
    analyzedAt: computed.at,
    selectedPhase,
    setSelectedPhase,
    pairs: DEFAULT_PAIRS,
  };
}

export type Analysis = ReturnType<typeof useAnalysis>;

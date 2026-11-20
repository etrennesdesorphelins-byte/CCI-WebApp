import { ChartsSection } from './components/ChartsSection';
import { ColumnMapping } from './components/ColumnMapping';
import { DataPreview } from './components/DataPreview';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExportPanel } from './components/ExportPanel';
import { FileUpload } from './components/FileUpload';
import { PhaseEditor } from './components/PhaseEditor';
import { ResultsTable } from './components/ResultsTable';
import { useAnalysis } from './hooks/useAnalysis';

export default function App() {
  const an = useAnalysis();
  return (
    <>
      <header className="app-header">
        <h1>歩行筋電図 共同収縮指数（CCI）解析</h1>
        <p>
          RF–BF・TA–Gas の CCI を歩行周期全体（GC）と LR / SLS / PSw / Sw で算出します。
          <span className="formula">CCI = 100 × 2∫min(a,b)dt / ∫(a+b)dt</span>
        </p>
      </header>
      <main>
        <ErrorBoundary label="データ読込">
          <FileUpload an={an} />
        </ErrorBoundary>
        <ErrorBoundary label="列対応">
          <ColumnMapping an={an} />
        </ErrorBoundary>
        <ErrorBoundary label="入力プレビュー">
          <DataPreview an={an} />
        </ErrorBoundary>
        {an.workbook && (
          <ErrorBoundary label="解析設定">
            <PhaseEditor an={an} />
          </ErrorBoundary>
        )}
        {an.computeError && (
          <p className="card issue error" role="alert">
            ⛔ 計算エラー：{an.computeError}
          </p>
        )}
        {an.analyzed && an.validation?.dataset && an.boundaryErrors.length > 0 && (
          <p className="card issue warning" role="status">
            ⚠️ 歩行相の境界が不正なため、結果を表示できません。境界を修正してください。
          </p>
        )}
        <ErrorBoundary label="結果表">
          <ResultsTable an={an} />
        </ErrorBoundary>
        <ErrorBoundary label="グラフ">
          <ChartsSection an={an} />
        </ErrorBoundary>
        <ErrorBoundary label="保存">
          <ExportPanel an={an} />
        </ErrorBoundary>
      </main>
      <footer className="app-footer small muted">
        入力は各筋の歩行周期平均値で正規化済みの波形を前提とし、アプリ側で再正規化・平滑化・整流は行いません。
        研究報告では使用した計算式と相境界を明記してください。
      </footer>
    </>
  );
}

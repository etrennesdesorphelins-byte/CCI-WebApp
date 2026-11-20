import { useRef, useState } from 'react';
import type { Analysis } from '../hooks/useAnalysis';

export function FileUpload({ an }: { an: Analysis }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const base = import.meta.env.BASE_URL;

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void an.loadFile(f);
  };

  return (
    <section className="card" aria-labelledby="sec-upload">
      <h2 id="sec-upload">1. データ読込</h2>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <strong>Excel（.xlsx）または CSV をドラッグ＆ドロップ</strong>
        <span>またはクリックしてファイルを選択</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <p className="privacy">
        🔒 ファイルはこのブラウザ内でのみ処理され、サーバーや外部サービスへは送信されません。
      </p>
      <div className="row gap">
        <span className="muted">合成サンプル：</span>
        <button type="button" className="link" onClick={() => void an.loadSample('csv')}>
          CSVを読み込む
        </button>
        <button type="button" className="link" onClick={() => void an.loadSample('xlsx')}>
          xlsxを読み込む
        </button>
        <a href={`${base}sample_synthetic.csv`} download>
          CSVをダウンロード
        </a>
        <a href={`${base}sample_synthetic.xlsx`} download>
          xlsxをダウンロード
        </a>
      </div>
      {an.loading && <p role="status">読み込み中…</p>}
      {an.loadError && (
        <p className="issue error" role="alert">
          ⛔ {an.loadError}
        </p>
      )}
      {an.workbook && !an.loading && (
        <p className="muted">
          読込済み：<strong>{an.workbook.fileName}</strong>（{an.workbook.sheets.length} シート）
        </p>
      )}
    </section>
  );
}

import { useState } from 'react';
import pkg from '../../package.json';
import type { Analysis } from '../hooks/useAnalysis';
import { baseName, buildResultsCsv, buildResultsXlsx, downloadBlob, type ExportMeta } from '../services/export';

export function ExportPanel({ an }: { an: Analysis }) {
  const [error, setError] = useState<string | null>(null);
  const data = an.validation?.dataset;
  if (!an.results || !an.phases || !data || !an.workbook || !an.sheet) return null;
  const results = an.results;

  const meta: ExportMeta = {
    sourceFile: an.workbook.fileName,
    sheetName: an.sheet.name,
    pairs: an.pairs,
    phases: an.phases,
    boundaries: an.boundaries,
    mapping: an.settings.mapping,
    hasHeader: an.settings.hasHeader,
    timeSource: data.timeSource,
    pointCount: data.percent.length,
    analyzedAt: an.analyzedAt,
    appVersion: pkg.version,
  };
  const name = baseName(meta.sourceFile);

  const run = async (fn: () => Promise<void> | void) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveCsv = () =>
    run(() =>
      downloadBlob(
        // Excel で開いても文字化けしないよう BOM を付与
        new Blob(['﻿' + buildResultsCsv(results, meta)], { type: 'text/csv;charset=utf-8' }),
        `${name}_CCI_results.csv`,
      ),
    );

  const saveXlsx = () =>
    run(async () => {
      const buf = await buildResultsXlsx(results, meta);
      downloadBlob(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${name}_CCI_results.xlsx`,
      );
    });

  return (
    <section className="card" aria-labelledby="sec-export">
      <h2 id="sec-export">7. 結果の保存</h2>
      <div className="row gap">
        <button type="button" onClick={saveCsv}>
          CCI結果をCSV保存
        </button>
        <button type="button" onClick={saveXlsx}>
          CCI結果をExcel保存（CCI_Results / Settings）
        </button>
      </div>
      <p className="muted small">グラフのPNGは各グラフ下のボタンから保存できます。</p>
      {error && (
        <p className="issue error" role="alert">
          ⛔ 保存に失敗しました：{error}
        </p>
      )}
    </section>
  );
}

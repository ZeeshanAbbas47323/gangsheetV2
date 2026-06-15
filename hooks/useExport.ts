"use client";

import { useCallback } from "react";
import { exportPdf } from "@/lib/export/pdf";
import { exportPng } from "@/lib/export/png";
import { ExportError, type ExportContext, type ExportSettings } from "@/lib/export/types";
import { uid } from "@/lib/id";
import { useBuilder } from "@/lib/store";
import type { ExportJob } from "@/lib/types";

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Build an export context for every sheet in the project. */
function allSheetContexts(): ExportContext[] {
  const { sheets, assets } = useBuilder.getState();
  return sheets.map((sh) => ({
    elements: sh.elements,
    assets,
    sheet: sh.config,
  }));
}

export function useExport() {
  const runExport = useCallback(async (settings: ExportSettings) => {
    const { upsertExportJob, removeExportJob, pushToast } = useBuilder.getState();
    // UPDATED: export every sheet in the project, not just the active one.
    const contexts = allSheetContexts();
    const sheetCount = contexts.length;

    const baseName = `gangsheet-${settings.dpi}dpi`;
    const fileName =
      settings.format === "pdf"
        ? `${baseName}.pdf`
        : sheetCount > 1
          ? `${baseName}-${sheetCount}-sheets.zip-less` // placeholder; per-sheet names below
          : `${baseName}.png`;

    const job: ExportJob = {
      id: uid(),
      format: settings.format,
      dpi: settings.dpi,
      fileName:
        settings.format === "png" && sheetCount > 1
          ? `${sheetCount} PNG sheets`
          : fileName,
      stage: "queued",
      progress: 0,
    };
    upsertExportJob(job);

    const onProgress = (stage: ExportJob["stage"], progress: number) =>
      upsertExportJob({ ...job, stage, progress: Math.round(progress) });

    try {
      if (settings.format === "pdf") {
        // single multi-page document
        const blob = await exportPdf(
          contexts,
          {
            dpi: settings.dpi,
            cropMarks: settings.cropMarks,
            includeBleed: settings.includeBleed,
          },
          onProgress
        );
        upsertExportJob({ ...job, stage: "done", progress: 100 });
        downloadBlob(blob, `${baseName}.pdf`);
        if (process.env.NODE_ENV === "development") {
          (window as unknown as { __lastExport?: object }).__lastExport = {
            blob,
            fileName: `${baseName}.pdf`,
            format: "pdf",
            dpi: settings.dpi,
            sheets: sheetCount,
          };
        }
        pushToast(
          "success",
          `Exported ${sheetCount}-page PDF (${sheetCount} sheet${sheetCount === 1 ? "" : "s"})`
        );
      } else {
        // one PNG per sheet, downloaded sequentially
        const blobs: Blob[] = [];
        for (let i = 0; i < contexts.length; i++) {
          const blob = await exportPng(contexts[i], settings.dpi, (stage, p) =>
            onProgress(stage, ((i + p / 100) / contexts.length) * 100)
          );
          blobs.push(blob);
          const name =
            sheetCount > 1 ? `${baseName}-sheet-${i + 1}.png` : `${baseName}.png`;
          downloadBlob(blob, name);
        }
        upsertExportJob({ ...job, stage: "done", progress: 100 });
        if (process.env.NODE_ENV === "development") {
          (window as unknown as { __lastExport?: object }).__lastExport = {
            blobs,
            format: "png",
            dpi: settings.dpi,
            sheets: sheetCount,
          };
        }
        pushToast(
          "success",
          `Exported ${sheetCount} PNG sheet${sheetCount === 1 ? "" : "s"}`
        );
      }
      setTimeout(() => removeExportJob(job.id), 4000);
      return true;
    } catch (err) {
      const message =
        err instanceof ExportError
          ? `${err.message}${err.suggestion ? ` ${err.suggestion}` : ""}`
          : "Export failed unexpectedly.";
      upsertExportJob({ ...job, stage: "error", progress: 0, error: message });
      pushToast("error", message);
      setTimeout(() => removeExportJob(job.id), 8000);
      return false;
    }
  }, []);

  /** Sequential batch export (e.g. PNG + PDF together). */
  const runBatch = useCallback(
    async (batch: ExportSettings[]) => {
      for (const settings of batch) {
        await runExport(settings);
      }
    },
    [runExport]
  );

  return { runExport, runBatch };
}

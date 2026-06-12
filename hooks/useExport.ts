"use client";

import { useCallback } from "react";
import { exportPdf } from "@/lib/export/pdf";
import { exportPng } from "@/lib/export/png";
import { ExportError, type ExportSettings } from "@/lib/export/types";
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

export function useExport() {
  const runExport = useCallback(async (settings: ExportSettings) => {
    const { sheet, elements, assets, upsertExportJob, removeExportJob, pushToast } =
      useBuilder.getState();

    const fileName = `gangsheet-${sheet.widthIn}x${sheet.heightIn}-${settings.dpi}dpi.${settings.format}`;
    const job: ExportJob = {
      id: uid(),
      format: settings.format,
      dpi: settings.dpi,
      fileName,
      stage: "queued",
      progress: 0,
    };
    upsertExportJob(job);

    const onProgress = (stage: ExportJob["stage"], progress: number) =>
      upsertExportJob({ ...job, stage, progress: Math.round(progress) });

    try {
      const ctx = { elements, assets, sheet };
      const blob =
        settings.format === "png"
          ? await exportPng(ctx, settings.dpi, onProgress)
          : await exportPdf(
              ctx,
              {
                dpi: settings.dpi,
                cropMarks: settings.cropMarks,
                includeBleed: settings.includeBleed,
              },
              onProgress
            );

      upsertExportJob({ ...job, stage: "done", progress: 100 });
      downloadBlob(blob, fileName);
      if (process.env.NODE_ENV === "development") {
        (window as unknown as { __lastExport?: object }).__lastExport = {
          blob,
          fileName,
          format: settings.format,
          dpi: settings.dpi,
        };
      }
      pushToast("success", `Exported ${fileName}`);
      setTimeout(() => removeExportJob(job.id), 4000);
      return blob;
    } catch (err) {
      const message =
        err instanceof ExportError
          ? `${err.message}${err.suggestion ? ` ${err.suggestion}` : ""}`
          : "Export failed unexpectedly.";
      upsertExportJob({ ...job, stage: "error", progress: 0, error: message });
      pushToast("error", message);
      setTimeout(() => removeExportJob(job.id), 8000);
      return null;
    }
  }, []);

  /** Sequential batch export (PNG + PDF, multiple DPIs, …). */
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

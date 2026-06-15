"use client";

import { useMemo, useState } from "react";
import { useExport } from "@/hooks/useExport";
import { outputPixelSize, validateOutputSize } from "@/lib/export/render";
import {
  estimateFileSize,
  formatBytes,
  runQualityChecks,
} from "@/lib/export/quality";
import type { ExportSettings } from "@/lib/export/types";
import { useBuilder } from "@/lib/store";

const DPI_CHOICES = [150, 300, 600];

export default function ExportModal() {
  const show = useBuilder((s) => s.showExportModal);
  const setShow = useBuilder((s) => s.setShowExportModal);
  // UPDATED: export covers every sheet, so the summary aggregates all of them.
  const sheets = useBuilder((s) => s.sheets);
  const assets = useBuilder((s) => s.assets);
  const jobs = useBuilder((s) => s.exportJobs);
  const { runBatch } = useExport();

  const [formats, setFormats] = useState<{ png: boolean; pdf: boolean }>({
    png: true,
    pdf: false,
  });
  const [dpi, setDpi] = useState(300);
  const [cropMarks, setCropMarks] = useState(false);
  const [includeBleed, setIncludeBleed] = useState(false);

  const sheetCount = sheets.length;

  // pre-flight checks run across every sheet
  const issues = useMemo(() => {
    if (!show) return [];
    const all = sheets.flatMap((sh) =>
      runQualityChecks(sh.elements, assets, sh.config)
    );
    // de-dupe by code, keeping the most severe
    const byCode = new Map<string, (typeof all)[number]>();
    for (const i of all) {
      const prev = byCode.get(i.code);
      if (!prev || (prev.severity !== "error" && i.severity === "error")) {
        byCode.set(i.code, i);
      }
    }
    return [...byCode.values()];
  }, [show, sheets, assets]);

  // validate the tallest sheet (worst case) against canvas limits
  const sizeError = useMemo(() => {
    if (!formats.png) return null;
    try {
      for (const sh of sheets) {
        const p = outputPixelSize(sh.config.widthIn, sh.config.heightIn, dpi);
        validateOutputSize(p.width, p.height);
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Output too large.";
    }
  }, [formats.png, sheets, dpi]);

  const totalDesigns = useMemo(
    () =>
      sheets.reduce(
        (n, sh) => n + sh.elements.filter((e) => e.visible).length,
        0
      ),
    [sheets]
  );

  const estBytes = useMemo(() => {
    let png = 0;
    let pdf = 0;
    for (const sh of sheets) {
      png += estimateFileSize("png", dpi, sh.config, sh.elements, assets);
      pdf += estimateFileSize("pdf", dpi, sh.config, sh.elements, assets);
    }
    return { png, pdf };
  }, [sheets, dpi, assets]);

  if (!show) return null;

  const hasErrors =
    issues.some((i) => i.severity === "error") || sizeError !== null;
  const anyFormat = formats.png || formats.pdf;
  const running = jobs.some(
    (j) => j.stage !== "done" && j.stage !== "error"
  );

  const startExport = () => {
    const batch: ExportSettings[] = [];
    if (formats.png) batch.push({ format: "png", dpi, cropMarks: false, includeBleed: false });
    if (formats.pdf) batch.push({ format: "pdf", dpi, cropMarks, includeBleed });
    void runBatch(batch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => setShow(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Export gang sheet"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-surface-3 bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-3 px-5 py-3.5">
          <h2 className="text-base font-semibold text-white">
            Export {sheetCount > 1 ? `all ${sheetCount} sheets` : "gang sheet"}
          </h2>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {/* format + dpi */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Format
              </span>
              <div className="flex gap-1.5">
                {(["png", "pdf"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormats((p) => ({ ...p, [f]: !p[f] }))}
                    className={`rounded border px-3 py-1.5 text-xs font-medium uppercase transition-colors ${
                      formats[f]
                        ? "border-accent bg-accent/15 text-white"
                        : "border-surface-3 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Resolution
              </span>
              <div className="flex overflow-hidden rounded border border-surface-3">
                {DPI_CHOICES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDpi(d)}
                    className={`px-2.5 py-1.5 text-xs ${
                      dpi === d ? "bg-accent text-white" : "text-gray-300 hover:bg-surface-3"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {formats.pdf && (
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={cropMarks}
                  onChange={(e) => setCropMarks(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#4f8ef7]"
                />
                Crop marks
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={includeBleed}
                  onChange={(e) => setIncludeBleed(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#4f8ef7]"
                />
                Include 0.125″ bleed
              </label>
            </div>
          )}

          {/* summary — aggregated across all sheets */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-surface-2 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Sheets</span>
              <span className="text-gray-100 tabular-nums">
                {sheetCount}
                {formats.pdf ? " (PDF pages)" : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">DPI</span>
              <span className="text-gray-100 tabular-nums">{dpi}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Width</span>
              <span className="text-gray-100 tabular-nums">
                {sheets[0]?.config.widthIn}″
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total designs</span>
              <span className="text-gray-100 tabular-nums">{totalDesigns}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">PNG output</span>
              <span className="text-gray-100 tabular-nums">
                {sheetCount > 1 ? `${sheetCount} files` : "1 file"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Est. file size</span>
              <span className="text-gray-100 tabular-nums">
                {[
                  formats.png && `PNG ~${formatBytes(estBytes.png)}`,
                  formats.pdf && `PDF ~${formatBytes(estBytes.pdf)}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </div>
          </div>

          {/* quality checks */}
          {(issues.length > 0 || sizeError) && (
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Pre-flight checks
              </span>
              {sizeError && (
                <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-950/40 px-2.5 py-1.5 text-xs text-red-300">
                  <span>✕</span>
                  {sizeError}
                </div>
              )}
              {issues.map((issue) => (
                <div
                  key={issue.code}
                  className={`flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs ${
                    issue.severity === "error"
                      ? "border-red-500/40 bg-red-950/40 text-red-300"
                      : "border-amber-500/40 bg-amber-950/40 text-amber-200"
                  }`}
                >
                  <span>{issue.severity === "error" ? "✕" : "⚠"}</span>
                  {issue.message}
                </div>
              ))}
            </div>
          )}

          {/* active jobs */}
          {jobs.length > 0 && (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-lg bg-surface-2 p-2.5 text-xs">
                  <div className="mb-1 flex justify-between">
                    <span className="truncate text-gray-200">{job.fileName}</span>
                    <span className="capitalize text-gray-400">
                      {job.stage === "error" ? "Failed" : job.stage}{" "}
                      {job.stage !== "done" && job.stage !== "error"
                        ? `${job.progress}%`
                        : ""}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full transition-all ${
                        job.stage === "error"
                          ? "bg-red-500"
                          : job.stage === "done"
                            ? "bg-emerald-500"
                            : "bg-accent"
                      }`}
                      style={{ width: `${job.stage === "done" ? 100 : job.progress}%` }}
                    />
                  </div>
                  {job.error && (
                    <p className="mt-1 text-red-400">{job.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-3 px-5 py-3.5">
          <button
            type="button"
            onClick={() => setShow(false)}
            className="rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-3"
          >
            {running ? "Continue in background" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={hasErrors || !anyFormat || running}
            onClick={startExport}
            className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

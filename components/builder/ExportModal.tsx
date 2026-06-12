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
  const sheet = useBuilder((s) => s.sheet);
  const elements = useBuilder((s) => s.elements);
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

  const issues = useMemo(
    () => (show ? runQualityChecks(elements, assets, sheet) : []),
    [show, elements, assets, sheet]
  );

  const px = outputPixelSize(sheet.widthIn, sheet.heightIn, dpi);
  const sizeError = useMemo(() => {
    if (!formats.png) return null;
    try {
      validateOutputSize(px.width, px.height);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Output too large.";
    }
  }, [formats.png, px.width, px.height]);

  const utilization = useMemo(() => {
    const used = elements
      .filter((e) => e.visible)
      .reduce((sum, e) => sum + e.widthIn * e.heightIn, 0);
    return Math.min(1, used / (sheet.widthIn * sheet.heightIn));
  }, [elements, sheet]);

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
          <h2 className="text-base font-semibold text-white">Export gang sheet</h2>
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

          {/* summary */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-surface-2 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Sheet size</span>
              <span className="text-gray-100 tabular-nums">
                {sheet.widthIn}″ × {sheet.heightIn}″
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">DPI</span>
              <span className="text-gray-100 tabular-nums">{dpi}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Output pixels</span>
              <span className="text-gray-100 tabular-nums">
                {px.width.toLocaleString()} × {px.height.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Utilization</span>
              <span className="text-gray-100 tabular-nums">
                {(utilization * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Designs</span>
              <span className="text-gray-100 tabular-nums">
                {elements.filter((e) => e.visible).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Est. file size</span>
              <span className="text-gray-100 tabular-nums">
                {[
                  formats.png &&
                    `PNG ~${formatBytes(estimateFileSize("png", dpi, sheet, elements, assets))}`,
                  formats.pdf &&
                    `PDF ~${formatBytes(estimateFileSize("pdf", dpi, sheet, elements, assets))}`,
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

"use client";

import { useMemo, useState } from "react";
import { runQualityChecks } from "@/lib/export/quality";
import { useBuilder } from "@/lib/store";

// Confirmation gate shown when the user clicks Export. It surfaces the live
// pre-flight status for the three key checks and requires a rights/terms
// acknowledgement before continuing to the Export Gang Sheet modal.
export default function QualityCheckModal() {
  const show = useBuilder((s) => s.showQualityCheck);
  const setShow = useBuilder((s) => s.setShowQualityCheck);
  const setShowExport = useBuilder((s) => s.setShowExportModal);
  const sheets = useBuilder((s) => s.sheets);
  const assets = useBuilder((s) => s.assets);

  const [agreed, setAgreed] = useState(false);

  // aggregate pre-flight issues across every sheet
  const issueCodes = useMemo(() => {
    if (!show) return new Set<string>();
    const codes = new Set<string>();
    for (const sh of sheets) {
      for (const issue of runQualityChecks(sh.elements, assets, sh.config)) {
        codes.add(issue.code);
      }
    }
    return codes;
  }, [show, sheets, assets]);

  if (!show) return null;

  const checklist = [
    { label: "No overlapping images.", failCode: "overlap" },
    { label: "No low-resolution images.", failCode: "low-dpi" },
    { label: "No items overlapping the artboard.", failCode: "out-of-bounds" },
  ];

  const accept = () => {
    setShow(false);
    setAgreed(false);
    setShowExport(true);
  };

  const close = () => {
    setShow(false);
    setAgreed(false);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Quality check"
    >
      <div
        className="w-full max-w-md rounded-xl border border-surface-3 bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-3 px-5 py-3.5">
          <h2 className="text-base font-semibold text-white">Quality Check</h2>
          <button
            type="button"
            onClick={close}
            className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          <ul className="space-y-2">
            {checklist.map((item) => {
              const failed = issueCodes.has(item.failCode);
              return (
                <li key={item.failCode} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      failed ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {failed ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 9v4M12 17h.01" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </span>
                  <span className={failed ? "text-amber-200" : "text-gray-200"}>
                    {item.label}
                    {failed && (
                      <span className="ml-1 text-[11px] text-amber-400/80">
                        (issues detected — review before exporting)
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-surface-3 bg-surface-2 p-3 text-xs leading-relaxed text-gray-300">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#4f8ef7]"
            />
            <span>
              By checking this box, you confirm that you own or have full rights
              to use this artwork. You also acknowledge that the uploaded images
              are correct and that the printer is not responsible for any
              differences in color, print quality, or artwork quality.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-3 px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            className="rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-3"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!agreed}
            onClick={accept}
            className="rounded bg-accent px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

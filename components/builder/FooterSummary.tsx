"use client";

import {
  formatLengthFt,
  projectTotals,
} from "@/lib/sheetStats";
import { useBuilder } from "@/lib/store";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums text-gray-200">
        {value}
      </span>
    </div>
  );
}

/** Project-wide totals across every sheet. */
export default function FooterSummary() {
  const sheets = useBuilder((s) => s.sheets);
  const prevSheet = useBuilder((s) => s.prevSheet);
  const nextSheet = useBuilder((s) => s.nextSheet);
  const activeSheetId = useBuilder((s) => s.activeSheetId);

  const totals = projectTotals(sheets);
  const idx = sheets.findIndex((sh) => sh.id === activeSheetId);

  return (
    <div className="flex h-9 shrink-0 items-center gap-5 overflow-x-auto border-t border-surface-3 bg-surface-1 px-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={prevSheet}
          disabled={idx <= 0}
          title="Previous sheet"
          aria-label="Previous sheet"
          className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white disabled:opacity-30"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span className="text-[11px] tabular-nums text-gray-400">
          {idx + 1} / {sheets.length}
        </span>
        <button
          type="button"
          onClick={nextSheet}
          disabled={idx >= sheets.length - 1}
          title="Next sheet"
          aria-label="Next sheet"
          className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white disabled:opacity-30"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div className="h-4 w-px bg-surface-3" />

      <Stat label="Sheets" value={`${totals.sheetCount}`} />
      <Stat label="Images" value={`${totals.images}`} />
      <Stat label="Copies" value={`${totals.copies}`} />
      <Stat label="Print length" value={formatLengthFt(totals.printLengthIn)} />
      <Stat label="Material" value={`${totals.materialSqFt.toFixed(1)} ft²`} />
    </div>
  );
}

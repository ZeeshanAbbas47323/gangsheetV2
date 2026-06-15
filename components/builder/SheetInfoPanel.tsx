"use client";

import { sheetStats } from "@/lib/sheetStats";
import { useBuilder } from "@/lib/store";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="tabular-nums text-gray-100">{value}</span>
    </div>
  );
}

/** Live utilization + counts for the active sheet. */
export default function SheetInfoPanel() {
  const sheets = useBuilder((s) => s.sheets);
  const activeSheetId = useBuilder((s) => s.activeSheetId);
  const active = sheets.find((sh) => sh.id === activeSheetId);
  if (!active) return null;
  const st = sheetStats(active);

  return (
    <div className="border-b border-surface-3 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {active.name}
      </h3>
      <div className="mb-2 space-y-1">
        <div className="flex justify-between text-xs text-gray-300">
          <span>Used area</span>
          <span className="font-semibold tabular-nums text-white">
            {(st.usedPct * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${st.usedPct * 100}%` }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Row label="Sheet size" value={`${st.widthIn}″ × ${st.heightIn}″`} />
        <Row label="Unused area" value={`${(st.unusedPct * 100).toFixed(1)}%`} />
        <Row label="Designs" value={`${st.designs}`} />
        <Row label="Copies" value={`${st.copies}`} />
      </div>
    </div>
  );
}

"use client";

import {
  MAX_SHEET_IN,
  SHEET_HEIGHTS,
  SHEET_WIDTH_IN,
} from "@/lib/presets";
import { useBuilder } from "@/lib/store";
import type { Dpi } from "@/lib/types";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-surface-3 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1 text-xs text-gray-300">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-3"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}

export default function SheetConfigPanel() {
  const sheet = useBuilder((s) => s.sheet);
  const setSheet = useBuilder((s) => s.setSheet);
  const addSheet = useBuilder((s) => s.addSheet);

  const heightIndex = SHEET_HEIGHTS.indexOf(sheet.heightIn);
  const atMax = sheet.heightIn >= MAX_SHEET_IN;

  const stepHeight = (dir: 1 | -1) => {
    const idx = heightIndex === -1 ? 0 : heightIndex;
    const next = SHEET_HEIGHTS[Math.min(SHEET_HEIGHTS.length - 1, Math.max(0, idx + dir))];
    if (next !== undefined) setSheet({ heightIn: next });
  };

  return (
    <div>
      <Section title="Sheet size">
        <div className="mb-2 flex items-center justify-between rounded border border-surface-3 bg-surface-2 px-2.5 py-1.5 text-xs">
          <span className="text-gray-400">Width (fixed)</span>
          <span className="font-semibold tabular-nums text-gray-100">
            {SHEET_WIDTH_IN}&quot;
          </span>
        </div>

        <label className="mb-1.5 block text-[10px] uppercase tracking-wide text-gray-500">
          Height
        </label>
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => stepHeight(-1)}
            disabled={heightIndex <= 0}
            aria-label="Shorter sheet"
            className="flex w-8 shrink-0 items-center justify-center rounded border border-surface-3 text-gray-300 hover:border-gray-500 disabled:opacity-30"
          >
            −
          </button>
          <select
            value={sheet.heightIn}
            onChange={(e) => setSheet({ heightIn: parseFloat(e.target.value) })}
            className="flex-1 rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-accent"
          >
            {SHEET_HEIGHTS.map((h) => (
              <option key={h} value={h}>
                {SHEET_WIDTH_IN}&quot; × {h}&quot;
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => stepHeight(1)}
            disabled={atMax}
            aria-label="Taller sheet"
            className="flex w-8 shrink-0 items-center justify-center rounded border border-surface-3 text-gray-300 hover:border-gray-500 disabled:opacity-30"
          >
            +
          </button>
        </div>

        {atMax && (
          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/40 p-2.5 text-[11px] text-amber-200">
            <p className="mb-2">
              This sheet is at the {MAX_SHEET_IN}&quot; maximum. Need more room?
            </p>
            <button
              type="button"
              onClick={addSheet}
              className="w-full rounded bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30"
            >
              + Create additional sheet
            </button>
          </div>
        )}
      </Section>

      <Section title="Print settings">
        <div className="mb-2 flex items-center justify-between text-xs text-gray-300">
          <span>Resolution</span>
          <div className="flex overflow-hidden rounded border border-surface-3">
            {([150, 300] as Dpi[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSheet({ dpi: d })}
                className={`px-2.5 py-1 text-xs ${
                  sheet.dpi === d
                    ? "bg-accent text-white"
                    : "text-gray-300 hover:bg-surface-3"
                }`}
              >
                {d} DPI
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between py-1 text-xs text-gray-300">
          <span>Background</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSheet({ background: null })}
              title="Transparent background"
              className={`h-6 w-6 rounded border bg-[conic-gradient(#e3e6ea_90deg,#fff_90deg_180deg,#e3e6ea_180deg_270deg,#fff_270deg)] bg-[length:8px_8px] ${
                sheet.background === null ? "border-accent ring-1 ring-accent" : "border-surface-3"
              }`}
            />
            <input
              type="color"
              value={sheet.background ?? "#ffffff"}
              onChange={(e) => setSheet({ background: e.target.value })}
              title="Pick background color"
              className={`h-6 w-8 cursor-pointer rounded border bg-transparent p-0.5 ${
                sheet.background !== null ? "border-accent" : "border-surface-3"
              }`}
            />
          </div>
        </div>
      </Section>

      <Section title="Guides & snapping">
        <ToggleRow
          label="Snap to edges & centers"
          checked={sheet.snapToEdges}
          onChange={(v) => setSheet({ snapToEdges: v })}
        />
        <ToggleRow
          label="Snap to grid"
          checked={sheet.snapToGrid}
          onChange={(v) => setSheet({ snapToGrid: v })}
        />
        {sheet.snapToGrid && (
          <div className="flex items-center justify-between py-1 text-xs text-gray-300">
            <span>Grid size</span>
            <select
              value={sheet.gridSizeIn}
              onChange={(e) => setSheet({ gridSizeIn: parseFloat(e.target.value) })}
              className="rounded border border-surface-3 bg-surface-2 px-1.5 py-1 text-xs text-gray-200 outline-none focus:border-accent"
            >
              <option value={0.25}>0.25&quot;</option>
              <option value={0.5}>0.5&quot;</option>
              <option value={1}>1&quot;</option>
            </select>
          </div>
        )}
        <ToggleRow
          label="Show bleed line (0.125″)"
          checked={sheet.showBleed}
          onChange={(v) => setSheet({ showBleed: v })}
        />
        <ToggleRow
          label="Show safe zone (0.25″)"
          checked={sheet.showSafeZone}
          onChange={(v) => setSheet({ showSafeZone: v })}
        />
      </Section>
    </div>
  );
}

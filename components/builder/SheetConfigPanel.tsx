"use client";

import {
  calculatePrice,
  formatMoney,
  MAX_SHEET_IN,
  MIN_SHEET_IN,
  SHEET_PRESETS,
} from "@/lib/presets";
import { useBuilder } from "@/lib/store";
import type { Dpi } from "@/lib/types";
import NumField from "./NumField";

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
  const swapOrientation = useBuilder((s) => s.swapOrientation);
  const quantity = useBuilder((s) => s.quantity);
  const setQuantity = useBuilder((s) => s.setQuantity);
  const elementCount = useBuilder((s) => s.elements.length);

  const price = calculatePrice(sheet.widthIn, sheet.heightIn, quantity);
  const isLandscape = sheet.widthIn > sheet.heightIn;

  return (
    <div>
      <Section title="Sheet size">
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          {SHEET_PRESETS.map((p) => {
            const active =
              (sheet.widthIn === p.widthIn && sheet.heightIn === p.heightIn) ||
              (sheet.widthIn === p.heightIn && sheet.heightIn === p.widthIn);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  setSheet({ widthIn: p.widthIn, heightIn: p.heightIn })
                }
                className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-accent bg-accent/15 text-white"
                    : "border-surface-3 text-gray-300 hover:border-gray-500"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-1.5">
          <NumField
            label="W"
            value={sheet.widthIn}
            min={MIN_SHEET_IN}
            max={MAX_SHEET_IN}
            suffix="in"
            onCommit={(v) => setSheet({ widthIn: v })}
          />
          <NumField
            label="H"
            value={sheet.heightIn}
            min={MIN_SHEET_IN}
            max={MAX_SHEET_IN}
            suffix="in"
            onCommit={(v) => setSheet({ heightIn: v })}
          />
          <button
            type="button"
            onClick={swapOrientation}
            title={`Switch to ${isLandscape ? "portrait" : "landscape"}`}
            className="flex h-[26px] w-8 shrink-0 items-center justify-center rounded border border-surface-3 text-gray-300 hover:border-gray-500"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-2-2h-8" /><path d="m15 10 4-4-4-4" /><path d="M3 8v8a2 2 0 0 0 2 2h8" /><path d="m9 14-4 4 4 4" /></svg>
          </button>
        </div>
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

      <Section title="Price estimate">
        <div className="mb-2 flex items-center justify-between text-xs text-gray-300">
          <span>Sheets</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setQuantity(quantity - 1)}
              className="h-6 w-6 rounded border border-surface-3 text-gray-300 hover:border-gray-500"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center tabular-nums text-gray-100">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              className="h-6 w-6 rounded border border-surface-3 text-gray-300 hover:border-gray-500"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>
              {sheet.widthIn}″ × {sheet.heightIn}″ sheet
            </span>
            <span className="tabular-nums">{formatMoney(price.unitPrice)}</span>
          </div>
          {price.discount > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>Quantity discount</span>
              <span className="tabular-nums">
                −{Math.round(price.discount * 100)}%
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-surface-3 pt-1.5 text-sm font-semibold text-white">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(price.total)}</span>
          </div>
          <p className="pt-1 text-[10px] text-gray-500">
            {elementCount} design{elementCount === 1 ? "" : "s"} on sheet ·{" "}
            {sheet.dpi} DPI
          </p>
        </div>
      </Section>
    </div>
  );
}

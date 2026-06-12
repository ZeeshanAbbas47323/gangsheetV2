"use client";

import { useImageTools } from "@/hooks/useImageTools";
import { usePlacement } from "@/hooks/usePlacement";
import { useBuilder } from "@/lib/store";
import type { AlignType, CanvasElement } from "@/lib/types";
import {
  effectiveDpi,
  fromInches,
  LOW_DPI_THRESHOLD,
  toInches,
} from "@/lib/units";
import NumField from "./NumField";

function IconButton({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 flex-1 items-center justify-center rounded border text-gray-300 transition-colors
        ${active ? "border-accent bg-accent/15 text-white" : "border-surface-3 hover:border-gray-500"}
        disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

const ALIGN_BUTTONS: { type: AlignType; title: string; d: string }[] = [
  { type: "left", title: "Align left", d: "M4 3v18M8 8h12v3H8zM8 14h8v3H8z" },
  { type: "centerX", title: "Align horizontal center", d: "M12 3v18M6 8h12v3H6zM8 14h8v3H8z" },
  { type: "right", title: "Align right", d: "M20 3v18M4 8h12v3H4zM8 14h8v3H8z" },
  { type: "top", title: "Align top", d: "M3 4h18M8 8h3v12H8zM14 8h3v8h-3z" },
  { type: "centerY", title: "Align vertical center", d: "M3 12h18M8 6h3v12H8zM14 8h3v8h-3z" },
  { type: "bottom", title: "Align bottom", d: "M3 20h18M8 4h3v12H8zM14 8h3v8h-3z" },
];

export default function PropertiesPanel() {
  const elements = useBuilder((s) => s.elements);
  const assets = useBuilder((s) => s.assets);
  const selectedIds = useBuilder((s) => s.selectedIds);
  const unit = useBuilder((s) => s.unit);
  const dpi = useBuilder((s) => s.sheet.dpi);
  const aspectLock = useBuilder((s) => s.aspectLock);
  const updateElements = useBuilder((s) => s.updateElements);
  const updateElementsTransient = useBuilder((s) => s.updateElementsTransient);
  const beginTransient = useBuilder((s) => s.beginTransient);
  const endTransient = useBuilder((s) => s.endTransient);
  const alignSelected = useBuilder((s) => s.alignSelected);
  const distributeSelected = useBuilder((s) => s.distributeSelected);
  const reorderSelected = useBuilder((s) => s.reorderSelected);
  const duplicateSelected = useBuilder((s) => s.duplicateSelected);
  const deleteSelected = useBuilder((s) => s.deleteSelected);
  const { autoFill, busy: fillBusy } = usePlacement();
  const { processAsset, processing } = useImageTools();

  const selected = elements.filter((e) => selectedIds.includes(e.id));
  if (selected.length === 0) return null;

  const single: CanvasElement | null = selected.length === 1 ? selected[0] : null;
  const suffix = unit;
  const toUnit = (v: number) => fromInches(v, unit, dpi);
  const fromUnit = (v: number) => toInches(v, unit, dpi);

  const patchSelected = (patch: Partial<CanvasElement>) =>
    updateElements(selected.map((e) => ({ id: e.id, patch })));

  const asset = single ? assets.find((a) => a.id === single.assetId) : null;
  const elDpi =
    single && asset ? effectiveDpi(asset.naturalWidth, single.widthIn) : null;
  const lowDpi = elDpi !== null && elDpi < LOW_DPI_THRESHOLD;

  return (
    <div className="border-b border-surface-3">
      <div className="flex items-center justify-between p-3 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {single ? single.name : `${selected.length} elements`}
        </h3>
        {single?.locked && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
            Locked
          </span>
        )}
      </div>

      {single && (
        <div className="space-y-2 px-3 pb-3">
          <div className="grid grid-cols-2 gap-1.5">
            <NumField
              label="X"
              value={toUnit(single.x)}
              suffix={suffix}
              disabled={single.locked}
              onCommit={(v) => patchSelected({ x: fromUnit(v) })}
            />
            <NumField
              label="Y"
              value={toUnit(single.y)}
              suffix={suffix}
              disabled={single.locked}
              onCommit={(v) => patchSelected({ y: fromUnit(v) })}
            />
            <NumField
              label="W"
              value={toUnit(single.widthIn)}
              min={toUnit(0.1)}
              suffix={suffix}
              disabled={single.locked}
              onCommit={(v) => {
                const w = fromUnit(v);
                const patch: Partial<CanvasElement> = { widthIn: w };
                if (aspectLock) {
                  patch.heightIn = (w / single.widthIn) * single.heightIn;
                }
                patchSelected(patch);
              }}
            />
            <NumField
              label="H"
              value={toUnit(single.heightIn)}
              min={toUnit(0.1)}
              suffix={suffix}
              disabled={single.locked}
              onCommit={(v) => {
                const h = fromUnit(v);
                const patch: Partial<CanvasElement> = { heightIn: h };
                if (aspectLock) {
                  patch.widthIn = (h / single.heightIn) * single.widthIn;
                }
                patchSelected(patch);
              }}
            />
          </div>

          {elDpi !== null && (
            <div
              className={`rounded px-2 py-1 text-[10px] ${
                lowDpi
                  ? "bg-red-500/15 text-red-400"
                  : "bg-surface-2 text-gray-500"
              }`}
            >
              {lowDpi ? "⚠ Low print quality: " : "Print quality: "}
              {Math.round(elDpi)} DPI at this size
              {lowDpi ? ` (minimum ${LOW_DPI_THRESHOLD})` : ""}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <NumField
              label="∠"
              value={((single.rotation % 360) + 360) % 360}
              min={0}
              max={360}
              step={1}
              decimals={1}
              suffix="°"
              disabled={single.locked}
              onCommit={(v) => patchSelected({ rotation: v })}
            />
            <IconButton
              title="Rotate −90°"
              disabled={single.locked}
              onClick={() => patchSelected({ rotation: single.rotation - 90 })}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
            </IconButton>
            <IconButton
              title="Rotate +90°"
              disabled={single.locked}
              onClick={() => patchSelected({ rotation: single.rotation + 90 })}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>
            </IconButton>
          </div>
        </div>
      )}

      <div className="space-y-2 px-3 pb-3">
        <div className="flex gap-1.5">
          <IconButton
            title="Flip horizontal"
            onClick={() =>
              updateElements(
                selected.map((e) => ({ id: e.id, patch: { flipX: !e.flipX } }))
              )
            }
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18" strokeDasharray="3 3" /><path d="M8 7 3 12l5 5" /><path d="m16 7 5 5-5 5" /></svg>
          </IconButton>
          <IconButton
            title="Flip vertical"
            onClick={() =>
              updateElements(
                selected.map((e) => ({ id: e.id, patch: { flipY: !e.flipY } }))
              )
            }
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18" strokeDasharray="3 3" /><path d="M7 8 12 3l5 5" /><path d="m7 16 5 5 5-5" /></svg>
          </IconButton>
          <IconButton
            title={selected.every((e) => e.locked) ? "Unlock" : "Lock"}
            active={selected.every((e) => e.locked)}
            onClick={() => {
              const allLocked = selected.every((e) => e.locked);
              updateElements(
                selected.map((e) => ({ id: e.id, patch: { locked: !allLocked } }))
              );
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </IconButton>
          <IconButton title="Duplicate (Ctrl+D)" onClick={duplicateSelected}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          </IconButton>
          <IconButton title="Delete (Del)" onClick={deleteSelected}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
          </IconButton>
        </div>

        <div>
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
            Opacity · {Math.round((single?.opacity ?? selected[0].opacity) * 100)}%
          </span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round((single?.opacity ?? selected[0].opacity) * 100)}
            onPointerDown={beginTransient}
            onPointerUp={endTransient}
            onChange={(e) =>
              updateElementsTransient(
                selected.map((el) => ({
                  id: el.id,
                  patch: { opacity: parseInt(e.target.value, 10) / 100 },
                }))
              )
            }
            className="w-full accent-[#4f8ef7]"
          />
        </div>

        {single && asset && (
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={fillBusy}
              onClick={() => void autoFill(single.id)}
              title="Fill the remaining sheet area with copies of this design"
              className="flex-1 rounded border border-accent/60 px-2 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
            >
              {fillBusy ? "Filling…" : "Auto Fill sheet"}
            </button>
            <button
              type="button"
              disabled={!!processing[asset.id] || asset.bgRemoved}
              onClick={() => void processAsset(asset.id, "remove-bg")}
              title={asset.bgRemoved ? "Background already removed" : "Remove background"}
              className="flex-1 rounded border border-surface-3 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {processing[asset.id] === "remove-bg"
                ? "Removing…"
                : asset.bgRemoved
                  ? "BG removed ✓"
                  : "Remove BG"}
            </button>
            <button
              type="button"
              disabled={!!processing[asset.id] || asset.upscaled}
              onClick={() => void processAsset(asset.id, "upscale")}
              title={asset.upscaled ? "Already upscaled" : "Upscale source image (print size unchanged)"}
              className="flex-1 rounded border border-surface-3 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {processing[asset.id] === "upscale"
                ? "Upscaling…"
                : asset.upscaled
                  ? "Upscaled ✓"
                  : "Upscale"}
            </button>
          </div>
        )}

        <div>
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
            Layer order
          </span>
          <div className="flex gap-1.5">
            <IconButton title="Send to back" onClick={() => reorderSelected("back")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7M19 12H5" transform="rotate(-90 12 12)" /></svg>
            </IconButton>
            <IconButton title="Send backward" onClick={() => reorderSelected("backward")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14m7-7-7 7-7-7" /></svg>
            </IconButton>
            <IconButton title="Bring forward" onClick={() => reorderSelected("forward")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-7 7 7-7 7 7" /></svg>
            </IconButton>
            <IconButton title="Bring to front" onClick={() => reorderSelected("front")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 5 7 7-7 7M5 12h14" transform="rotate(-90 12 12)" /></svg>
            </IconButton>
          </div>
        </div>

        <div>
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
            Align {selected.length > 1 ? "selection" : "to sheet"}
          </span>
          <div className="flex gap-1.5">
            {ALIGN_BUTTONS.map((b) => (
              <IconButton key={b.type} title={b.title} onClick={() => alignSelected(b.type)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d={b.d} /></svg>
              </IconButton>
            ))}
          </div>
        </div>

        {selected.length >= 3 && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => distributeSelected("horizontal")}
              className="flex-1 rounded border border-surface-3 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-500"
            >
              Distribute ↔
            </button>
            <button
              type="button"
              onClick={() => distributeSelected("vertical")}
              className="flex-1 rounded border border-surface-3 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-500"
            >
              Distribute ↕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

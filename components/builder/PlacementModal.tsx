"use client";

import { useEffect, useState } from "react";
import { useImageTools } from "@/hooks/useImageTools";
import { usePlacement } from "@/hooks/usePlacement";
import { DEFAULT_ASSET_DPI } from "@/lib/files";
import { uid } from "@/lib/id";
import { useBuilder } from "@/lib/store";
import type { PlacementSpec } from "@/lib/types";
import { effectiveDpi } from "@/lib/units";
import ImageEditModal from "./ImageEditModal";
import NumField from "./NumField";

// A single size/quantity row. An asset can have several rows so the same image
// can be placed at different dimensions (e.g. 4"×4" and a 2"×2" duplicate).
interface Row {
  rowId: string;
  assetId: string;
  widthIn: number;
  heightIn: number;
  quantity: number;
  aspectLocked: boolean;
}

/** Small on/off toggle (with a busy spinner) used for the image-tool switches. */
function Toggle({
  on,
  busy,
  onClick,
  label,
}: {
  on: boolean;
  busy: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy || on}
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
        on ? "bg-accent" : "bg-surface-3"
      } ${busy ? "opacity-70" : ""}`}
    >
      {busy ? (
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border border-white/70 border-t-transparent" />
      ) : (
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      )}
    </button>
  );
}

/** Vertical +/- stepper attached to a numeric field. */
function Stepper({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <span className="flex flex-col">
      <button
        type="button"
        tabIndex={-1}
        onClick={onUp}
        aria-label="Increase"
        className="flex h-[13px] w-5 items-center justify-center rounded-t border border-surface-3 text-gray-400 hover:bg-surface-3 hover:text-white"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={onDown}
        aria-label="Decrease"
        className="flex h-[13px] w-5 items-center justify-center rounded-b border border-t-0 border-surface-3 text-gray-400 hover:bg-surface-3 hover:text-white"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </span>
  );
}

export default function PlacementModal() {
  const pending = useBuilder((s) => s.pendingPlacement);
  const assets = useBuilder((s) => s.assets);
  const sheet = useBuilder((s) => s.sheet);
  const dequeuePlacement = useBuilder((s) => s.dequeuePlacement);
  const clearPlacementQueue = useBuilder((s) => s.clearPlacementQueue);
  const setCroppingAsset = useBuilder((s) => s.setCroppingAsset);
  const { placeAssets, autoBuild, busy } = usePlacement();
  const { processAsset, processing } = useImageTools();

  const [rows, setRows] = useState<Row[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const defaultRow = (assetId: string): Row | null => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return null;
    const dpi = asset.dpi ?? DEFAULT_ASSET_DPI;
    let w = asset.naturalWidth / dpi;
    let h = asset.naturalHeight / dpi;
    const fit = Math.min(1, (sheet.widthIn * 0.9) / w, (sheet.heightIn * 0.9) / h);
    w = Math.max(0.25, w * fit);
    h = Math.max(0.25, h * fit);
    return { rowId: uid(), assetId, widthIn: w, heightIn: h, quantity: 1, aspectLocked: true };
  };

  useEffect(() => {
    setRows((prev) => {
      let next = prev.filter((r) => pending.includes(r.assetId));
      for (const id of pending) {
        if (next.some((r) => r.assetId === id)) continue;
        const row = defaultRow(id);
        if (row) next = [...next, row];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, assets]);

  const visibleRows = rows.filter((r) => assets.some((a) => a.id === r.assetId));
  if (visibleRows.length === 0) return null;

  const patchRow = (rowId: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const duplicateRow = (rowId: string) =>
    setRows((prev) => {
      const i = prev.findIndex((r) => r.rowId === rowId);
      if (i === -1) return prev;
      const src = prev[i];
      const dup: Row = {
        ...src,
        rowId: uid(),
        widthIn: Math.max(0.25, +(src.widthIn / 2).toFixed(2)),
        heightIn: Math.max(0.25, +(src.heightIn / 2).toFixed(2)),
        quantity: 1,
      };
      return [...prev.slice(0, i + 1), dup, ...prev.slice(i + 1)];
    });

  const removeRow = (row: Row) => {
    const remaining = rows.filter((r) => r.rowId !== row.rowId);
    setRows(remaining);
    if (!remaining.some((r) => r.assetId === row.assetId)) dequeuePlacement(row.assetId);
    if (remaining.length === 0) clearPlacementQueue();
  };

  const toPlacementSpecs = (): PlacementSpec[] =>
    visibleRows.map((r) => ({
      assetId: r.assetId,
      widthIn: r.widthIn,
      heightIn: r.heightIn,
      quantity: r.quantity,
    }));

  const close = () => clearPlacementQueue();

  const confirm = async (mode: "place" | "autobuild") => {
    const list = toPlacementSpecs();
    clearPlacementQueue();
    if (mode === "place") await placeAssets(list);
    else await autoBuild(list);
  };

  const totalCopies = visibleRows.reduce((n, r) => n + r.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Set size and quantity"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-surface-3 bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-3 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-white">Size &amp; quantity</h2>
            <p className="text-xs text-gray-500">
              Set the print size for each design — use Duplicate to add another size
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {visibleRows.map((row) => {
            const asset = assets.find((a) => a.id === row.assetId)!;
            const ratio = asset.naturalHeight / asset.naturalWidth;
            const dpi = effectiveDpi(asset.naturalWidth, row.widthIn);
            const quality =
              dpi >= 300
                ? { label: "Optimal", color: "#22c55e" }
                : dpi >= 150
                  ? { label: "Good", color: "#eab308" }
                  : { label: "Low resolution", color: "#ef4444" };
            const proc = processing[asset.id];

            const setWidth = (v: number) =>
              patchRow(row.rowId, {
                widthIn: v,
                ...(row.aspectLocked ? { heightIn: +(v * ratio).toFixed(2) } : {}),
              });
            const setHeight = (v: number) =>
              patchRow(row.rowId, {
                heightIn: v,
                ...(row.aspectLocked ? { widthIn: +(v / ratio).toFixed(2) } : {}),
              });

            return (
              <div
                key={row.rowId}
                className="overflow-hidden rounded-lg border border-surface-3 bg-surface-2"
              >
                <div className="flex flex-col gap-4 p-3 sm:flex-row">
                  {/* big preview for easy checking */}
                  <div className="flex h-44 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[conic-gradient(#e3e6ea_90deg,#f7f8fa_90deg_180deg,#e3e6ea_180deg_270deg,#f7f8fa_270deg)] bg-[length:18px_18px] sm:w-44">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.src}
                      alt={asset.name}
                      className="max-h-full max-w-full object-contain"
                      draggable={false}
                    />
                  </div>

                  {/* controls */}
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <p className="truncate text-xs font-medium text-gray-300">{asset.name}</p>

                    {/* Width */}
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-xs text-gray-400">Width</span>
                      <div className="w-28">
                        <NumField
                          label=""
                          value={row.widthIn}
                          min={0.25}
                          max={sheet.widthIn}
                          onCommit={setWidth}
                        />
                      </div>
                      <Stepper
                        onUp={() => setWidth(+(row.widthIn + 0.1).toFixed(2))}
                        onDown={() => setWidth(Math.max(0.25, +(row.widthIn - 0.1).toFixed(2)))}
                      />
                      <span className="text-xs text-gray-500">in</span>
                    </div>

                    {/* Height */}
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-xs text-gray-400">Height</span>
                      <div className="w-28">
                        <NumField
                          label=""
                          value={row.heightIn}
                          min={0.25}
                          max={240}
                          onCommit={setHeight}
                        />
                      </div>
                      <Stepper
                        onUp={() => setHeight(+(row.heightIn + 0.1).toFixed(2))}
                        onDown={() => setHeight(Math.max(0.25, +(row.heightIn - 0.1).toFixed(2)))}
                      />
                      <span className="text-xs text-gray-500">in</span>
                    </div>

                    {/* Lock aspect ratio */}
                    <button
                      type="button"
                      onClick={() => patchRow(row.rowId, { aspectLocked: !row.aspectLocked })}
                      className="flex w-fit items-center gap-2 text-xs text-gray-300"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          row.aspectLocked ? "border-accent bg-accent text-white" : "border-surface-3"
                        }`}
                      >
                        {row.aspectLocked && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        )}
                      </span>
                      Lock Aspect Ratio
                    </button>

                    {/* DPI / quality indicator */}
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: quality.color }}
                      />
                      <span style={{ color: quality.color }}>{quality.label}</span>
                      <span className="ml-auto tabular-nums text-gray-500">
                        ({Math.round(dpi)} DPI)
                      </span>
                    </div>

                    {/* Remove Background toggle */}
                    <div className="flex items-center justify-between text-xs text-gray-300">
                      <span>
                        Remove Background
                        {asset.bgRemoved && <span className="ml-1 text-emerald-400">✓</span>}
                      </span>
                      <Toggle
                        on={!!asset.bgRemoved}
                        busy={proc === "remove-bg"}
                        onClick={() => void processAsset(asset.id, "remove-bg")}
                        label="Remove background"
                      />
                    </div>

                    {/* Upscale toggle */}
                    <div className="flex items-center justify-between text-xs text-gray-300">
                      <span>
                        Upscale
                        {asset.upscaled && <span className="ml-1 text-emerald-400">✓</span>}
                      </span>
                      <Toggle
                        on={!!asset.upscaled}
                        busy={proc === "upscale"}
                        onClick={() => void processAsset(asset.id, "upscale")}
                        label="Upscale"
                      />
                    </div>

                    {/* secondary edit tools */}
                    <div className="flex items-center gap-3 pt-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setCroppingAsset(asset.id)}
                        className="inline-flex items-center gap-1 text-gray-400 hover:text-accent"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" /></svg>
                        Crop
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(asset.id)}
                        className="inline-flex items-center gap-1 text-gray-400 hover:text-accent"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                        More edits
                      </button>
                    </div>
                  </div>
                </div>

                {/* footer row: quantity + duplicate + remove */}
                <div className="flex items-center justify-between border-t border-surface-3 bg-surface-1/40 px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => patchRow(row.rowId, { quantity: Math.max(1, row.quantity - 1) })}
                      className="flex h-7 w-7 items-center justify-center rounded border border-surface-3 text-gray-300 hover:border-gray-500"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={row.quantity}
                      onChange={(e) =>
                        patchRow(row.rowId, {
                          quantity: Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)),
                        })
                      }
                      className="h-7 w-14 rounded border border-surface-3 bg-surface-2 text-center text-xs tabular-nums text-gray-100 outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Quantity"
                    />
                    <button
                      type="button"
                      onClick={() => patchRow(row.rowId, { quantity: Math.min(500, row.quantity + 1) })}
                      className="flex h-7 w-7 items-center justify-center rounded border border-surface-3 text-gray-300 hover:border-gray-500"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => duplicateRow(row.rowId)}
                      className="flex items-center gap-1.5 rounded bg-surface-3 px-3 py-1.5 text-xs font-medium text-gray-100 hover:bg-surface-3/70"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(row)}
                      className="flex items-center gap-1.5 rounded bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-3 px-5 py-3.5">
          <p className="text-[11px] text-gray-500">
            {totalCopies} cop{totalCopies === 1 ? "y" : "ies"} total · Auto Build
            extends the sheet to fit everything
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-3"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm("autobuild")}
              className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
            >
              {busy ? "Working…" : "Auto Build"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm("place")}
              className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {busy ? "Placing…" : "Place on sheet"}
            </button>
          </div>
        </div>
      </div>

      {editingId && (
        <ImageEditModal assetId={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

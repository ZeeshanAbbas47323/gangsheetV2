"use client";

import { useEffect, useState } from "react";
import { usePlacement } from "@/hooks/usePlacement";
import { DEFAULT_ASSET_DPI } from "@/lib/files";
import { uid } from "@/lib/id";
import { useBuilder } from "@/lib/store";
import type { PlacementSpec } from "@/lib/types";
import { effectiveDpi, LOW_DPI_THRESHOLD } from "@/lib/units";
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

export default function PlacementModal() {
  const pending = useBuilder((s) => s.pendingPlacement);
  const assets = useBuilder((s) => s.assets);
  const sheet = useBuilder((s) => s.sheet);
  const dequeuePlacement = useBuilder((s) => s.dequeuePlacement);
  const clearPlacementQueue = useBuilder((s) => s.clearPlacementQueue);
  const { placeAssets, autoBuild, busy } = usePlacement();

  const [rows, setRows] = useState<Row[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // default size for an asset: natural size at its DPI, capped to ~90% of sheet
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

  // keep rows in sync with the pending queue: drop removed assets, add one
  // default row for each newly queued asset (existing rows are preserved).
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

  // NEW CHANGE: duplicate a row at a different (default: half) size so the same
  // image can be placed at multiple sizes independently.
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
    // if that asset has no rows left, drop it from the batch entirely
    if (!remaining.some((r) => r.assetId === row.assetId)) {
      dequeuePlacement(row.assetId);
    }
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
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-surface-3 bg-surface-1 shadow-2xl"
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

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {visibleRows.map((row) => {
            const asset = assets.find((a) => a.id === row.assetId)!;
            const ratio = asset.naturalHeight / asset.naturalWidth;
            const dpiAtSize = effectiveDpi(asset.naturalWidth, row.widthIn);
            const lowDpi = dpiAtSize < LOW_DPI_THRESHOLD;
            return (
              <div
                key={row.rowId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-surface-3 bg-surface-2 p-2.5 sm:flex-nowrap"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-[conic-gradient(#e3e6ea_90deg,#f7f8fa_90deg_180deg,#e3e6ea_180deg_270deg,#f7f8fa_270deg)] bg-[length:12px_12px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.src}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-200">{asset.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {asset.naturalWidth}×{asset.naturalHeight}px ·{" "}
                    {asset.dpi ? `${asset.dpi} DPI (file)` : `${DEFAULT_ASSET_DPI} DPI (assumed)`}
                  </p>
                  {lowDpi && (
                    <p className="text-[10px] text-red-400">
                      ⚠ {Math.round(dpiAtSize)} DPI at this size
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingId(asset.id)}
                    className="mt-1 inline-flex items-center gap-1 rounded border border-surface-3 px-1.5 py-0.5 text-[10px] text-gray-300 hover:border-accent hover:text-white"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                    Edit Image
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="w-[88px]">
                    <NumField
                      label="W"
                      value={row.widthIn}
                      min={0.25}
                      max={sheet.widthIn}
                      suffix="in"
                      onCommit={(v) =>
                        patchRow(row.rowId, {
                          widthIn: v,
                          ...(row.aspectLocked ? { heightIn: v * ratio } : {}),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    title={row.aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                    onClick={() => patchRow(row.rowId, { aspectLocked: !row.aspectLocked })}
                    className={`flex h-[26px] w-6 shrink-0 items-center justify-center rounded border text-gray-300 ${
                      row.aspectLocked ? "border-accent bg-accent/15" : "border-surface-3"
                    }`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {row.aspectLocked ? (
                        <>
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </>
                      ) : (
                        <>
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                        </>
                      )}
                    </svg>
                  </button>
                  <div className="w-[88px]">
                    <NumField
                      label="H"
                      value={row.heightIn}
                      min={0.25}
                      max={240}
                      suffix="in"
                      onCommit={(v) =>
                        patchRow(row.rowId, {
                          heightIn: v,
                          ...(row.aspectLocked ? { widthIn: v / ratio } : {}),
                        })
                      }
                    />
                  </div>
                  <div className="w-[72px]">
                    <NumField
                      label="×"
                      value={row.quantity}
                      min={1}
                      max={500}
                      step={1}
                      decimals={0}
                      onCommit={(v) => patchRow(row.rowId, { quantity: Math.round(v) })}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {/* NEW CHANGE: duplicate this image at a different size */}
                  <button
                    type="button"
                    onClick={() => duplicateRow(row.rowId)}
                    title="Duplicate at a different size"
                    aria-label={`Duplicate ${asset.name} at a different size`}
                    className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-accent"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(row)}
                    title="Remove this row"
                    aria-label={`Remove ${asset.name} row`}
                    className="rounded p-1 text-gray-500 hover:bg-surface-3 hover:text-red-400"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
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

"use client";

import { useEffect, useState } from "react";
import { usePlacement } from "@/hooks/usePlacement";
import { DEFAULT_ASSET_DPI } from "@/lib/files";
import { useBuilder } from "@/lib/store";
import type { PlacementSpec } from "@/lib/types";
import { effectiveDpi, LOW_DPI_THRESHOLD } from "@/lib/units";
import ImageEditModal from "./ImageEditModal";
import NumField from "./NumField";

interface RowSpec {
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

  const [specs, setSpecs] = useState<Record<string, RowSpec>>({});
  // NEW CHANGE: which asset (if any) is open in the Edit Image modal
  const [editingId, setEditingId] = useState<string | null>(null);

  // each batch starts from fresh defaults
  useEffect(() => {
    if (pending.length === 0) setSpecs({});
  }, [pending.length]);

  // initialize a row for every newly queued asset (natural size at source DPI)
  useEffect(() => {
    setSpecs((prev) => {
      const next = { ...prev };
      for (const id of pending) {
        if (next[id]) continue;
        const asset = assets.find((a) => a.id === id);
        if (!asset) continue;
        const dpi = asset.dpi ?? DEFAULT_ASSET_DPI;
        let w = asset.naturalWidth / dpi;
        let h = asset.naturalHeight / dpi;
        const fit = Math.min(1, (sheet.widthIn * 0.9) / w, (sheet.heightIn * 0.9) / h);
        w = Math.max(0.25, w * fit);
        h = Math.max(0.25, h * fit);
        next[id] = { widthIn: w, heightIn: h, quantity: 1, aspectLocked: true };
      }
      return next;
    });
  }, [pending, assets, sheet.widthIn, sheet.heightIn]);

  const queued = pending
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a && !!specs[a.id]);

  if (queued.length === 0) return null;

  const toPlacementSpecs = (): PlacementSpec[] =>
    queued.map((a) => ({
      assetId: a.id,
      widthIn: specs[a.id].widthIn,
      heightIn: specs[a.id].heightIn,
      quantity: specs[a.id].quantity,
    }));

  const patchSpec = (id: string, patch: Partial<RowSpec>) =>
    setSpecs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const close = () => clearPlacementQueue();

  const confirm = async (mode: "place" | "autobuild") => {
    const list = toPlacementSpecs();
    clearPlacementQueue();
    if (mode === "place") await placeAssets(list);
    else await autoBuild(list);
  };

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
            <h2 className="text-base font-semibold text-white">
              Size &amp; quantity
            </h2>
            <p className="text-xs text-gray-500">
              Set the print size for each design before it goes on the sheet
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
          {queued.map((asset) => {
            const spec = specs[asset.id];
            const ratio = asset.naturalHeight / asset.naturalWidth;
            const dpiAtSize = effectiveDpi(asset.naturalWidth, spec.widthIn);
            const lowDpi = dpiAtSize < LOW_DPI_THRESHOLD;
            return (
              <div
                key={asset.id}
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
                  <p className="truncate text-xs font-medium text-gray-200">
                    {asset.name}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {asset.naturalWidth}×{asset.naturalHeight}px ·{" "}
                    {asset.dpi ? `${asset.dpi} DPI (file)` : `${DEFAULT_ASSET_DPI} DPI (assumed)`}
                  </p>
                  {lowDpi && (
                    <p className="text-[10px] text-red-400">
                      ⚠ {Math.round(dpiAtSize)} DPI at this size
                    </p>
                  )}
                  {/* NEW CHANGE: open the Edit Image (Remove BG / Upscale / Crop) modal */}
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
                      value={spec.widthIn}
                      min={0.25}
                      max={sheet.widthIn}
                      suffix="in"
                      onCommit={(v) =>
                        patchSpec(asset.id, {
                          widthIn: v,
                          ...(spec.aspectLocked ? { heightIn: v * ratio } : {}),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    title={spec.aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                    onClick={() => patchSpec(asset.id, { aspectLocked: !spec.aspectLocked })}
                    className={`flex h-[26px] w-6 shrink-0 items-center justify-center rounded border text-gray-300 ${
                      spec.aspectLocked
                        ? "border-accent bg-accent/15"
                        : "border-surface-3"
                    }`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {spec.aspectLocked ? (
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
                      value={spec.heightIn}
                      min={0.25}
                      max={240}
                      suffix="in"
                      onCommit={(v) =>
                        patchSpec(asset.id, {
                          heightIn: v,
                          ...(spec.aspectLocked ? { widthIn: v / ratio } : {}),
                        })
                      }
                    />
                  </div>
                  <div className="w-[72px]">
                    <NumField
                      label="×"
                      value={spec.quantity}
                      min={1}
                      max={500}
                      step={1}
                      decimals={0}
                      onCommit={(v) => patchSpec(asset.id, { quantity: Math.round(v) })}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => dequeuePlacement(asset.id)}
                  title="Remove from this batch (stays in library)"
                  aria-label={`Remove ${asset.name} from batch`}
                  className="shrink-0 rounded p-1 text-gray-500 hover:bg-surface-3 hover:text-red-400"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-3 px-5 py-3.5">
          <p className="text-[11px] text-gray-500">
            {queued.reduce((n, a) => n + specs[a.id].quantity, 0)} cop
            {queued.reduce((n, a) => n + specs[a.id].quantity, 0) === 1 ? "y" : "ies"} total ·
            Auto Build extends the sheet to fit everything
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

      {/* NEW CHANGE: Edit Image modal (Remove BG / Upscale / Crop) */}
      {editingId && (
        <ImageEditModal assetId={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

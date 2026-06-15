"use client";

// NEW CHANGE: "Edit Image" modal opened from the placement (size & quantity)
// modal. Offers three clear actions — Remove Background, Upscale, Crop.
// Remove BG / Upscale call the ClipDrop-backed image service; Crop opens the
// custom canvas cropper.

import { useImageTools } from "@/hooks/useImageTools";
import { useBuilder } from "@/lib/store";

interface Props {
  assetId: string;
  onClose: () => void;
}

export default function ImageEditModal({ assetId, onClose }: Props) {
  const asset = useBuilder((s) => s.assets.find((a) => a.id === assetId));
  const processing = useBuilder((s) => s.assetProcessing[assetId]);
  const setCroppingAsset = useBuilder((s) => s.setCroppingAsset);
  const { processAsset } = useImageTools();

  if (!asset) return null;

  // UPDATED: ClipDrop services (Remove BG / Upscale / Remove Text) + custom Crop.
  const actions = [
    {
      key: "remove-bg" as const,
      label: "Remove Background",
      desc: "Strip the background to transparency.",
      done: asset.bgRemoved,
      doneLabel: "Background removed",
      busyKey: "remove-bg",
      icon: "M4 4h16v16H4z M8 8l8 8 M16 8l-8 8",
      onClick: () => void processAsset(assetId, "remove-bg"),
    },
    {
      key: "upscale" as const,
      label: "Upscale",
      desc: "Increase resolution for crisp large prints.",
      done: asset.upscaled,
      doneLabel: "Upscaled",
      busyKey: "upscale",
      icon: "M3 3h7v2H5v5H3zM21 21h-7v-2h5v-5h2z M9 15l6-6",
      onClick: () => void processAsset(assetId, "upscale"),
    },
    {
      key: "remove-text" as const,
      label: "Remove Text",
      desc: "Erase text/watermarks from the image.",
      done: asset.textRemoved,
      doneLabel: "Text removed",
      busyKey: "remove-text",
      icon: "M4 7V4h16v3 M9 20h6 M12 4v16",
      onClick: () => void processAsset(assetId, "remove-text"),
    },
    {
      key: "crop" as const,
      label: "Crop",
      desc: "Trim the image with a custom selection.",
      done: asset.cropped,
      doneLabel: "Cropped",
      busyKey: null,
      icon: "M6 2v14a2 2 0 0 0 2 2h14 M2 6h14a2 2 0 0 1 2 2v14",
      onClick: () => {
        setCroppingAsset(assetId); // opens the global custom crop tool
        onClose();
      },
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit image"
    >
        <div
          className="w-full max-w-md rounded-xl border border-surface-3 bg-surface-1 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-surface-3 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded bg-[conic-gradient(#e3e6ea_90deg,#f7f8fa_90deg_180deg,#e3e6ea_180deg_270deg,#f7f8fa_270deg)] bg-[length:10px_10px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.src} alt={asset.name} className="max-h-full max-w-full object-contain" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Edit image</h2>
                <p className="text-[11px] text-gray-500">
                  {asset.name} · {asset.naturalWidth}×{asset.naturalHeight}px
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="space-y-2 p-4">
            {actions.map((a) => {
              const busy = processing === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  disabled={!!processing || a.done}
                  onClick={a.onClick}
                  className="flex w-full items-center gap-3 rounded-lg border border-surface-3 p-3 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
                    {busy ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-accent" />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={a.icon} /></svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-100">
                      {a.label}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {busy ? "Working…" : a.done ? a.doneLabel + " ✓" : a.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
    </div>
  );
}

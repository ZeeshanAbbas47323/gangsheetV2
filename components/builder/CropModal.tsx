"use client";

// NEW CHANGE: custom HTML5-canvas crop tool (no external crop package).
// The crop rectangle is stored as fractions of the image (0..1) so it is
// resolution-independent; on apply we draw the selected region from the
// full-resolution source onto a canvas and replace the asset.

import { useEffect, useMemo, useRef, useState } from "react";
import { useBuilder } from "@/lib/store";
import type { LibraryAsset } from "@/lib/types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Handle = "move" | "nw" | "ne" | "sw" | "se";

const MIN_FRAC = 0.05; // smallest crop is 5% of a side
const MAX_DISPLAY = 460;

interface Props {
  asset: LibraryAsset;
  onClose: () => void;
}

export default function CropModal({ asset, onClose }: Props) {
  const updateAsset = useBuilder((s) => s.updateAsset);
  const pushToast = useBuilder((s) => s.pushToast);

  const [crop, setCrop] = useState<Rect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    start: Rect;
  } | null>(null);

  // display size preserving aspect ratio, capped to MAX_DISPLAY
  const display = useMemo(() => {
    const ratio = asset.naturalWidth / asset.naturalHeight;
    let w = MAX_DISPLAY;
    let h = MAX_DISPLAY / ratio;
    if (h > MAX_DISPLAY) {
      h = MAX_DISPLAY;
      w = MAX_DISPLAY * ratio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [asset.naturalWidth, asset.naturalHeight]);

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  // pointer drag handling for move + corner resize
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ctx = dragRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!ctx || !rect) return;
      const dx = (e.clientX - ctx.startX) / rect.width;
      const dy = (e.clientY - ctx.startY) / rect.height;
      const s = ctx.start;

      setCrop(() => {
        if (ctx.handle === "move") {
          return {
            ...s,
            x: clamp01(Math.min(s.x + dx, 1 - s.w)),
            y: clamp01(Math.min(s.y + dy, 1 - s.h)),
          };
        }
        let { x, y, w, h } = s;
        const right = s.x + s.w;
        const bottom = s.y + s.h;
        if (ctx.handle === "nw") {
          x = clamp01(Math.min(s.x + dx, right - MIN_FRAC));
          y = clamp01(Math.min(s.y + dy, bottom - MIN_FRAC));
          w = right - x;
          h = bottom - y;
        } else if (ctx.handle === "ne") {
          y = clamp01(Math.min(s.y + dy, bottom - MIN_FRAC));
          w = clamp01(Math.max(MIN_FRAC, Math.min(s.w + dx, 1 - s.x)));
          h = bottom - y;
        } else if (ctx.handle === "sw") {
          x = clamp01(Math.min(s.x + dx, right - MIN_FRAC));
          w = right - x;
          h = clamp01(Math.max(MIN_FRAC, Math.min(s.h + dy, 1 - s.y)));
        } else {
          // se
          w = clamp01(Math.max(MIN_FRAC, Math.min(s.w + dx, 1 - s.x)));
          h = clamp01(Math.max(MIN_FRAC, Math.min(s.h + dy, 1 - s.y)));
        }
        return { x, y, w, h };
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, start: crop };
  };

  const apply = async () => {
    const sx = Math.round(crop.x * asset.naturalWidth);
    const sy = Math.round(crop.y * asset.naturalHeight);
    const sw = Math.max(1, Math.round(crop.w * asset.naturalWidth));
    const sh = Math.max(1, Math.round(crop.h * asset.naturalHeight));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      pushToast("error", "Could not crop this image.");
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const src = canvas.toDataURL("image/png");
      updateAsset(asset.id, {
        src,
        naturalWidth: sw,
        naturalHeight: sh,
        mimeType: "image/png",
        cropped: true,
      });
      pushToast("success", `Cropped "${asset.name}" to ${sw}×${sh}px`);
      onClose();
    };
    img.onerror = () => pushToast("error", "Could not load the image to crop.");
    img.src = asset.src;
  };

  const handles: { id: Exclude<Handle, "move">; cls: string; cursor: string }[] = [
    { id: "nw", cls: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
    { id: "ne", cls: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
    { id: "sw", cls: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
    { id: "se", cls: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
    >
      <div
        className="rounded-xl border border-surface-3 bg-surface-1 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Crop image</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div
          ref={containerRef}
          className="relative mx-auto select-none touch-none bg-[conic-gradient(#e3e6ea_90deg,#f7f8fa_90deg_180deg,#e3e6ea_180deg_270deg,#f7f8fa_270deg)] bg-[length:16px_16px]"
          style={{ width: display.w, height: display.h }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.src}
            alt={asset.name}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
          {/* dim overlay */}
          <div className="pointer-events-none absolute inset-0 bg-black/45" />
          {/* crop window (clear) */}
          <div
            onPointerDown={startDrag("move")}
            className="absolute cursor-move border border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0)]"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            }}
          >
            {handles.map((h) => (
              <span
                key={h.id}
                onPointerDown={startDrag(h.id)}
                style={{ cursor: h.cursor }}
                className={`absolute h-3 w-3 rounded-sm border border-white bg-accent ${h.cls}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}
            className="rounded px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-3"
          >
            Reset selection
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-surface-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Apply crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

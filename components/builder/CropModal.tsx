"use client";

// Custom HTML5-canvas crop tool (no external crop package). The crop rectangle
// is stored as fractions of the image (0..1) so it is resolution-independent.
// NEW CHANGE: zoom in/out + slider with panning, for precise cropping. The
// image is scaled/panned inside a fixed viewport while the crop overlay is
// drawn in viewport coordinates so its handles stay crisp at any zoom.

import { useEffect, useMemo, useRef, useState } from "react";
import { useBuilder } from "@/lib/store";
import type { LibraryAsset } from "@/lib/types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Handle = "move" | "nw" | "ne" | "sw" | "se" | "pan";

const MIN_FRAC = 0.05;
const MAX_DISPLAY = 460;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

interface Props {
  asset: LibraryAsset;
  onClose: () => void;
}

export default function CropModal({ asset, onClose }: Props) {
  const updateAsset = useBuilder((s) => s.updateAsset);
  const pushToast = useBuilder((s) => s.pushToast);

  const [crop, setCrop] = useState<Rect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // live mirrors so the global pointer handler reads current zoom/pan
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startCrop: Rect;
    startPan: { x: number; y: number };
  } | null>(null);

  // base display size (fit to MAX_DISPLAY at zoom 1), preserving aspect ratio
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

  const imgW = display.w * zoom;
  const imgH = display.h * zoom;

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const clampPan = (p: { x: number; y: number }, z: number) => ({
    x: Math.min(0, Math.max(display.w - display.w * z, p.x)),
    y: Math.min(0, Math.max(display.h - display.h * z, p.y)),
  });

  const setZoomAround = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    // keep the viewport centre stable while zooming
    const cx = display.w / 2;
    const cy = display.h / 2;
    setPan((p) => {
      const ratio = z / zoomRef.current;
      const np = { x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio };
      return clampPan(np, z);
    });
    setZoom(z);
    if (z === 1) setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const z = zoomRef.current;
      if (d.handle === "pan") {
        setPan(
          clampPan(
            { x: d.startPan.x + (e.clientX - d.startX), y: d.startPan.y + (e.clientY - d.startY) },
            z
          )
        );
        return;
      }
      // crop edits: convert screen delta → image fraction (account for zoom)
      const dx = (e.clientX - d.startX) / (display.w * z);
      const dy = (e.clientY - d.startY) / (display.h * z);
      const s = d.startCrop;
      setCrop(() => {
        if (d.handle === "move") {
          return {
            ...s,
            x: clamp01(Math.min(s.x + dx, 1 - s.w)),
            y: clamp01(Math.min(s.y + dy, 1 - s.h)),
          };
        }
        let { x, y, w, h } = s;
        const right = s.x + s.w;
        const bottom = s.y + s.h;
        if (d.handle === "nw") {
          x = clamp01(Math.min(s.x + dx, right - MIN_FRAC));
          y = clamp01(Math.min(s.y + dy, bottom - MIN_FRAC));
          w = right - x;
          h = bottom - y;
        } else if (d.handle === "ne") {
          y = clamp01(Math.min(s.y + dy, bottom - MIN_FRAC));
          w = clamp01(Math.max(MIN_FRAC, Math.min(s.w + dx, 1 - s.x)));
          h = bottom - y;
        } else if (d.handle === "sw") {
          x = clamp01(Math.min(s.x + dx, right - MIN_FRAC));
          w = right - x;
          h = clamp01(Math.max(MIN_FRAC, Math.min(s.h + dy, 1 - s.y)));
        } else {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display.w, display.h]);

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    if (handle !== "pan") e.stopPropagation();
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: crop,
      startPan: panRef.current,
    };
  };

  const apply = () => {
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
      updateAsset(asset.id, {
        src: canvas.toDataURL("image/png"),
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

  // crop window in viewport (screen) coordinates
  const cw = {
    left: pan.x + crop.x * imgW,
    top: pan.y + crop.y * imgH,
    width: crop.w * imgW,
    height: crop.h * imgH,
  };

  const handles: { id: Exclude<Handle, "move" | "pan">; cls: string; cursor: string }[] = [
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

        {/* viewport */}
        <div
          onPointerDown={zoom > 1 ? startDrag("pan") : undefined}
          className="relative mx-auto select-none overflow-hidden touch-none bg-[conic-gradient(#e3e6ea_90deg,#f7f8fa_90deg_180deg,#e3e6ea_180deg_270deg,#f7f8fa_270deg)] bg-[length:16px_16px]"
          style={{ width: display.w, height: display.h, cursor: zoom > 1 ? "grab" : "default" }}
        >
          {/* scaled/panned image */}
          <div
            className="absolute left-0 top-0"
            style={{ width: imgW, height: imgH, transform: `translate(${pan.x}px, ${pan.y}px)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.src}
              alt={asset.name}
              className="pointer-events-none h-full w-full object-fill"
              draggable={false}
            />
          </div>

          {/* crop window (screen coords), dims everything outside it */}
          <div
            onPointerDown={startDrag("move")}
            className="absolute cursor-move border border-accent"
            style={{
              left: cw.left,
              top: cw.top,
              width: cw.width,
              height: cw.height,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
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

        {/* zoom controls */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomAround(zoom / 1.25)}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded border border-surface-3 text-gray-300 hover:border-gray-500 disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoomAround(parseFloat(e.target.value))}
            className="flex-1 accent-[#4f8ef7]"
            aria-label="Zoom"
          />
          <button
            type="button"
            onClick={() => setZoomAround(zoom * 1.25)}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded border border-surface-3 text-gray-300 hover:border-gray-500 disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <span className="w-10 text-right text-xs tabular-nums text-gray-400">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setCrop({ x: 0, y: 0, w: 1, h: 1 });
              setZoomAround(1);
            }}
            className="rounded px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-3"
          >
            Reset
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
              onClick={apply}
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

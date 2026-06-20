"use client";

import { useEffect, useRef } from "react";
import { useBuilder } from "@/lib/store";

// Draggable horizontal/vertical scrollbars overlaid on the canvas. They map the
// scroll thumb to the stage pan offset, making large gang sheets easy to
// navigate without relying solely on space-drag panning.

const PAD_IN = 2; // scrollable padding around the sheet, inches
const THUMB_MIN = 28; // px
const BAR = 10; // scrollbar thickness, px

interface Props {
  /** Canvas viewport size in screen px. */
  width: number;
  height: number;
}

interface Axis {
  show: boolean;
  thumbStart: number; // px along the track
  thumbSize: number; // px
  trackLen: number; // px (viewport length)
  worldPerTrackPx: number; // world px per 1px of track movement
  visStart: number; // world px at viewport start (= -pan)
}

export default function CanvasScrollbars({ width, height }: Props) {
  const pan = useBuilder((s) => s.pan);
  const viewScale = useBuilder((s) => s.viewScale);
  const sheet = useBuilder((s) => s.sheet);
  const setPan = useBuilder((s) => s.setPan);

  const drag = useRef<{ axis: "x" | "y"; startPos: number; startVis: number; wpt: number } | null>(
    null
  );

  // compute one axis's scrollbar geometry
  const axisGeom = (
    viewport: number,
    panOffset: number,
    sheetLenIn: number
  ): Axis => {
    const scale = viewScale;
    const padPx = PAD_IN * scale;
    const contentStart = -padPx;
    const contentEnd = sheetLenIn * scale + padPx;
    const visStart = -panOffset;
    const visEnd = viewport - panOffset;
    const trackStart = Math.min(contentStart, visStart);
    const trackEnd = Math.max(contentEnd, visEnd);
    const track = trackEnd - trackStart;
    const show = contentEnd - contentStart > viewport + 1;
    const thumbSize = Math.max(THUMB_MIN, (viewport / track) * viewport);
    const maxThumb = viewport - thumbSize;
    const thumbStart =
      track > viewport ? ((visStart - trackStart) / (track - viewport)) * maxThumb : 0;
    return {
      show,
      thumbStart: Math.max(0, Math.min(maxThumb, thumbStart)),
      thumbSize,
      trackLen: viewport,
      worldPerTrackPx: (track - viewport) / Math.max(1, maxThumb),
      visStart,
    };
  };

  const x = axisGeom(width, pan.x, sheet.widthIn);
  const y = axisGeom(height, pan.y, sheet.heightIn);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const pos = d.axis === "x" ? e.clientX : e.clientY;
      const deltaVis = (pos - d.startPos) * d.wpt;
      const newVis = d.startVis + deltaVis;
      // pan = -visStart; update only the dragged axis
      const s = useBuilder.getState();
      s.setPan(
        d.axis === "x" ? { x: -newVis, y: s.pan.y } : { x: s.pan.x, y: -newVis }
      );
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startDrag = (axis: "x" | "y", a: Axis) => (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = {
      axis,
      startPos: axis === "x" ? e.clientX : e.clientY,
      startVis: a.visStart,
      wpt: a.worldPerTrackPx,
    };
  };

  return (
    <>
      {x.show && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 z-10"
          style={{ height: BAR, width: width - (y.show ? BAR : 0) }}
        >
          <div
            onPointerDown={startDrag("x", x)}
            className="pointer-events-auto absolute top-1/2 h-1.5 -translate-y-1/2 cursor-grab rounded-full bg-gray-500/60 hover:bg-gray-400/80 active:cursor-grabbing"
            style={{ left: x.thumbStart, width: x.thumbSize }}
          />
        </div>
      )}
      {y.show && (
        <div
          className="pointer-events-none absolute right-0 top-0 z-10"
          style={{ width: BAR, height: height - (x.show ? BAR : 0) }}
        >
          <div
            onPointerDown={startDrag("y", y)}
            className="pointer-events-auto absolute left-1/2 w-1.5 -translate-x-1/2 cursor-grab rounded-full bg-gray-500/60 hover:bg-gray-400/80 active:cursor-grabbing"
            style={{ top: y.thumbStart, height: y.thumbSize }}
          />
        </div>
      )}
    </>
  );
}

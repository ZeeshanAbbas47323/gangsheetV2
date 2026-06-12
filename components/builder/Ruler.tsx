"use client";

import { useEffect, useRef } from "react";
import { useBuilder } from "@/lib/store";

export const RULER_THICKNESS = 26;

const STEP_CANDIDATES = [
  0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500,
  1000, 2000, 5000,
];

interface Props {
  orientation: "horizontal" | "vertical";
}

export default function Ruler({ orientation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewScale = useBuilder((s) => s.viewScale);
  const pan = useBuilder((s) => s.pan);
  const unit = useBuilder((s) => s.unit);
  const dpi = useBuilder((s) => s.sheet.dpi);
  const sheetWidthIn = useBuilder((s) => s.sheet.widthIn);
  const sheetHeightIn = useBuilder((s) => s.sheet.heightIn);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
      const horizontal = orientation === "horizontal";
      const length = horizontal ? parent.clientWidth : parent.clientHeight;
      if (length === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = (horizontal ? length : RULER_THICKNESS) * dpr;
      canvas.height = (horizontal ? RULER_THICKNESS : length) * dpr;
      canvas.style.width = `${horizontal ? length : RULER_THICKNESS}px`;
      canvas.style.height = `${horizontal ? RULER_THICKNESS : length}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#15181d";
      ctx.fillRect(
        0,
        0,
        horizontal ? length : RULER_THICKNESS,
        horizontal ? RULER_THICKNESS : length
      );

      const unitsPerInch = unit === "in" ? 1 : unit === "cm" ? 2.54 : dpi;
      const pxPerUnit = viewScale / unitsPerInch;
      const panOffset = horizontal ? pan.x : pan.y;
      const sheetLenUnits =
        (horizontal ? sheetWidthIn : sheetHeightIn) * unitsPerInch;

      // sheet extent band
      const bandStart = panOffset;
      const bandLen = sheetLenUnits * pxPerUnit;
      ctx.fillStyle = "#222731";
      if (horizontal) ctx.fillRect(bandStart, 0, bandLen, RULER_THICKNESS);
      else ctx.fillRect(0, bandStart, RULER_THICKNESS, bandLen);

      const step =
        STEP_CANDIDATES.find((s) => s * pxPerUnit >= 56) ??
        STEP_CANDIDATES[STEP_CANDIDATES.length - 1];
      const minor = step / (step * pxPerUnit >= 110 ? 10 : 5);

      const startUnits = -panOffset / pxPerUnit;
      const endUnits = startUnits + length / pxPerUnit;

      ctx.strokeStyle = "#4b5563";
      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textBaseline = "top";

      ctx.beginPath();
      const firstMinor = Math.floor(startUnits / minor) * minor;
      for (let v = firstMinor; v <= endUnits; v += minor) {
        const screen = v * pxPerUnit + panOffset;
        // avoid float drift on major detection
        const isMajor = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        const tickLen = isMajor ? RULER_THICKNESS : 7;
        if (horizontal) {
          ctx.moveTo(screen + 0.5, RULER_THICKNESS - tickLen);
          ctx.lineTo(screen + 0.5, RULER_THICKNESS);
        } else {
          ctx.moveTo(RULER_THICKNESS - tickLen, screen + 0.5);
          ctx.lineTo(RULER_THICKNESS, screen + 0.5);
        }
        if (isMajor) {
          const label = `${parseFloat(v.toFixed(2))}`;
          if (horizontal) {
            ctx.fillText(label, screen + 3, 3);
          } else {
            ctx.save();
            ctx.translate(3, screen + 3);
            ctx.rotate(Math.PI / 2);
            ctx.fillText(label, 0, -12);
            ctx.restore();
          }
        }
      }
      ctx.stroke();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [orientation, viewScale, pan, unit, dpi, sheetWidthIn, sheetHeightIn]);

  return <canvas ref={canvasRef} className="block" />;
}

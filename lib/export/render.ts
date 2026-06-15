import { fontStack } from "../text";
import type { LibraryAsset, TextElement } from "../types";
import { ExportError, type ExportContext, type ProgressCallback } from "./types";

/** Conservative cross-browser canvas ceilings (Chrome allows more). */
const MAX_CANVAS_DIM = 32767;
const MAX_CANVAS_AREA = 268_000_000; // ~16384² (Chrome's area limit)

/**
 * Draw a text element centered at the current (already translated/rotated)
 * origin. Font size is in points → pixels at `dpi/72`.
 */
function drawText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  dpi: number
): void {
  const pxPerPt = dpi / 72;
  const fontPx = el.fontSize * pxPerPt;
  ctx.font = `${el.italic ? "italic " : ""}${el.fontWeight} ${fontPx}px ${fontStack(el.fontFamily)}`;
  ctx.textAlign = el.align === "left" ? "left" : el.align === "right" ? "right" : "center";
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) {
    try {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${el.letterSpacing * pxPerPt}px`;
    } catch {
      /* not supported — ignore */
    }
  }

  const lines = el.text.split("\n");
  const lineH = fontPx * el.lineHeight;
  const totalH = lineH * lines.length;
  const halfW = (el.widthIn / 2) * dpi;
  const startX = el.align === "left" ? -halfW : el.align === "right" ? halfW : 0;

  lines.forEach((line, i) => {
    const y = -totalH / 2 + lineH * (i + 0.5);
    if (el.outlineWidth > 0) {
      ctx.lineWidth = el.outlineWidth * pxPerPt;
      ctx.strokeStyle = el.outlineColor;
      ctx.lineJoin = "round";
      ctx.strokeText(line, startX, y);
    }
    ctx.fillStyle = el.color;
    ctx.fillText(line, startX, y);
    if (el.underline) {
      const w = ctx.measureText(line).width;
      const ux = el.align === "left" ? startX : el.align === "right" ? startX - w : -w / 2;
      ctx.fillRect(ux, y + fontPx * 0.34, w, Math.max(1, fontPx * 0.06));
    }
  });
  if ("letterSpacing" in ctx) {
    try {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
    } catch {
      /* ignore */
    }
  }
}

export function outputPixelSize(
  widthIn: number,
  heightIn: number,
  dpi: number
): { width: number; height: number } {
  return {
    width: Math.round(widthIn * dpi),
    height: Math.round(heightIn * dpi),
  };
}

export function validateOutputSize(width: number, height: number): void {
  if (
    width > MAX_CANVAS_DIM ||
    height > MAX_CANVAS_DIM ||
    width * height > MAX_CANVAS_AREA
  ) {
    throw new ExportError(
      `Output of ${width} × ${height}px exceeds what this browser can render.`,
      "Lower the export DPI or reduce the sheet length."
    );
  }
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export async function loadAssetImages(
  assets: LibraryAsset[],
  neededIds: Set<string>,
  onProgress?: (loaded: number, total: number) => void
): Promise<Map<string, HTMLImageElement>> {
  const needed = assets.filter((a) => neededIds.has(a.id));
  const images = new Map<string, HTMLImageElement>();
  let loaded = 0;
  await Promise.all(
    needed.map(
      (asset) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            images.set(asset.id, img);
            loaded++;
            onProgress?.(loaded, needed.length);
            resolve();
          };
          img.onerror = () =>
            reject(new ExportError(`Failed to load image "${asset.name}".`));
          img.src = asset.src;
        })
    )
  );
  return images;
}

/**
 * Rasterize the sheet to a canvas at exact physical resolution
 * (widthIn × dpi). Preserves transparency, rotation, flips, opacity, and
 * layer order. Yields to the event loop periodically so the UI stays alive.
 */
export async function renderSheetToCanvas(
  ctx2: ExportContext,
  dpi: number,
  onProgress?: ProgressCallback
): Promise<HTMLCanvasElement> {
  const { elements, assets, sheet } = ctx2;
  const { width, height } = outputPixelSize(sheet.widthIn, sheet.heightIn, dpi);
  validateOutputSize(width, height);

  onProgress?.("preparing", 0);
  const visible = elements.filter((e) => e.visible);
  const neededAssetIds = new Set(
    visible.filter((e) => e.type === "image").map((e) => e.assetId)
  );
  const images = await loadAssetImages(
    assets,
    neededAssetIds,
    (loaded, total) => onProgress?.("preparing", (loaded / Math.max(1, total)) * 20)
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ExportError(
      "The browser refused to allocate the export canvas.",
      "Lower the export DPI or reduce the sheet size."
    );
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (sheet.background) {
    ctx.fillStyle = sheet.background;
    ctx.fillRect(0, 0, width, height);
  }

  for (let i = 0; i < visible.length; i++) {
    const el = visible[i];
    ctx.save();
    ctx.translate(el.x * dpi, el.y * dpi);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
    ctx.globalAlpha = el.opacity;

    if (el.type === "text") {
      drawText(ctx, el, dpi);
    } else {
      const img = images.get(el.assetId);
      if (img) {
        ctx.drawImage(
          img,
          (-el.widthIn / 2) * dpi,
          (-el.heightIn / 2) * dpi,
          el.widthIn * dpi,
          el.heightIn * dpi
        );
      }
    }
    ctx.restore();

    if (i % 20 === 19) {
      onProgress?.("rendering", 20 + ((i + 1) / visible.length) * 60);
      await yieldToUi();
    }
  }
  onProgress?.("rendering", 80);
  return canvas;
}

/**
 * Rasterize a text element to standalone PNG bytes (transparent background,
 * upright, flips baked in) so the PDF exporter can embed it as an image.
 */
export async function rasterizeTextElement(
  el: TextElement,
  dpi: number
): Promise<Uint8Array> {
  const w = Math.max(1, Math.round(el.widthIn * dpi));
  const h = Math.max(1, Math.round(el.heightIn * dpi));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ExportError("Could not rasterize text for the PDF.");
  ctx.translate(w / 2, h / 2);
  ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  // opacity is applied by the PDF drawImage call, not baked into the raster
  drawText(ctx, el, dpi);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new ExportError("Could not rasterize text for the PDF.");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Rasterize a single asset (optionally flipped) to PNG bytes — used by the
 * PDF exporter for SVG/WEBP sources and mirrored placements that PDF images
 * can't express directly.
 */
export async function rasterizeAsset(
  asset: LibraryAsset,
  targetWidthPx: number,
  targetHeightPx: number,
  flipX: boolean,
  flipY: boolean
): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () =>
      reject(new ExportError(`Failed to load image "${asset.name}".`));
    i.src = asset.src;
  });

  const w = Math.max(1, Math.min(8192, Math.round(targetWidthPx)));
  const h = Math.max(1, Math.min(8192, Math.round(targetHeightPx)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(flipX ? w : 0, flipY ? h : 0);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new ExportError(`Failed to rasterize "${asset.name}".`);
  return new Uint8Array(await blob.arrayBuffer());
}

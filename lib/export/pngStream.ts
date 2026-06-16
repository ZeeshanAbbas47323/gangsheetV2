import pako from "pako";
import { elementAABB } from "../units";
import {
  drawElement,
  loadAssetImages,
  outputPixelSize,
} from "./render";
import {
  ExportError,
  type ExportContext,
  type ProgressCallback,
} from "./types";

// Browsers cap a single <canvas> at ~32767px per side, so a full-resolution
// gang sheet (e.g. 22.5"×264" @300DPI = 6750×79200px) can't be rendered in one
// canvas. This module renders the sheet in horizontal bands and stream-encodes
// them into ONE full-resolution PNG via a zlib (pako) stream — we never hold a
// canvas (or RGBA buffer) larger than a single band.

const MAX_SIDE = 32767;
/** Hard ceiling on total output pixels (memory/time guard). ~1.6 GP. */
const MAX_TOTAL_PIXELS = 1_600_000_000;
/** Target band area in pixels (keeps each band's RGBA buffer ~110MB max). */
const BAND_AREA = 27_000_000;

/** Whether a PNG of this size can be produced (tall sheets are streamed). */
export function validatePngOutput(width: number, height: number): void {
  if (width > MAX_SIDE) {
    throw new ExportError(
      `Output width of ${width}px exceeds the ${MAX_SIDE}px limit.`,
      "Lower the export DPI."
    );
  }
  if (width * height > MAX_TOTAL_PIXELS) {
    throw new ExportError(
      `Output of ${width} × ${height}px is too large to export in the browser.`,
      "Lower the export DPI or split the design across more sheets."
    );
  }
}

// ---- PNG chunk helpers ----------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function ihdr(width: number, height: number): Uint8Array {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = 8; // bit depth
  d[9] = 6; // color type RGBA
  d[10] = 0; // compression
  d[11] = 0; // filter
  d[12] = 0; // interlace
  return chunk("IHDR", d);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Export a sheet as a single full-resolution PNG, regardless of height, by
 * tiling the render and streaming scanlines through a deflate stream.
 */
export async function exportLargePng(
  ctx2: ExportContext,
  dpi: number,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const { elements, assets, sheet } = ctx2;
  const { width, height } = outputPixelSize(sheet.widthIn, sheet.heightIn, dpi);
  validatePngOutput(width, height);

  onProgress?.("preparing", 0);
  const visible = elements.filter((e) => e.visible);
  const images = await loadAssetImages(
    assets,
    new Set(visible.filter((e) => e.type === "image").map((e) => e.assetId)),
    (loaded, total) => onProgress?.("preparing", (loaded / Math.max(1, total)) * 15)
  );

  // pre-compute each element's pixel AABB so bands only draw what they touch
  const boxes = visible.map((e) => {
    const b = elementAABB(e);
    return { el: e, top: b.top * dpi, bottom: b.bottom * dpi };
  });

  const bandRows = Math.max(256, Math.min(MAX_SIDE, Math.floor(BAND_AREA / width)));
  const stride = width * 4;
  const rowBuf = new Uint8Array(1 + stride); // filter byte + one scanline

  const deflate = new pako.Deflate({ level: 6 });

  // reusable band canvas (full width × bandRows)
  const canvas = document.createElement("canvas");
  canvas.width = width;
  const bg = sheet.background;

  for (let bandTop = 0; bandTop < height; bandTop += bandRows) {
    const bandH = Math.min(bandRows, height - bandTop);
    const bandBottom = bandTop + bandH;
    canvas.height = bandH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new ExportError("The browser refused to allocate the export canvas.");
    }
    ctx.clearRect(0, 0, width, bandH);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, bandH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(0, -bandTop); // map this band's top to canvas y=0
    for (const { el, top, bottom } of boxes) {
      if (bottom <= bandTop || top >= bandBottom) continue; // outside band
      drawElement(ctx, el, dpi, images);
    }
    ctx.restore();

    const data = ctx.getImageData(0, 0, width, bandH).data;
    for (let r = 0; r < bandH; r++) {
      rowBuf[0] = 0; // filter: None
      rowBuf.set(data.subarray(r * stride, r * stride + stride), 1);
      deflate.push(rowBuf, false);
    }

    onProgress?.("rendering", 15 + (bandBottom / height) * 70);
    await yieldToUi();
  }

  deflate.push(new Uint8Array(0), true);
  if (deflate.err) {
    throw new ExportError("Failed to compress the PNG.");
  }
  onProgress?.("encoding", 90);

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = concat([
    signature,
    ihdr(width, height),
    chunk("IDAT", deflate.result as Uint8Array),
    chunk("IEND", new Uint8Array(0)),
  ]);
  onProgress?.("encoding", 100);
  // copy into a fresh ArrayBuffer-backed view to satisfy the Blob typing
  return new Blob([new Uint8Array(png)], { type: "image/png" });
}

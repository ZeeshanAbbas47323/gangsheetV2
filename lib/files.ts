import { uid } from "./id";
import type { LibraryAsset } from "./types";

// Any browser-decodable raster/vector image is accepted. We no longer reject
// by file size — large images are downscaled to a workable resolution instead.
export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "image/bmp",
  "image/avif",
];

const ACCEPTED_EXT = /\.(png|jpe?g|webp|svg|gif|bmp|avif)$/i;

export const ACCEPT_ATTR = "image/*,.svg";

/** Last-resort cap so a pathological upload can't crash the tab (browser OOM). */
const MAX_FILE_BYTES = 300 * 1024 * 1024;

/**
 * Images above this many pixels are downscaled on import. 40 MP (≈6300²) keeps
 * memory, autosave, and export fast while preserving excellent DTF print
 * quality (a 40 MP image is ~21" at 300 DPI).
 */
const MAX_IMPORT_PIXELS = 40_000_000;

export class FileValidationError extends Error {}

function isAcceptedFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return ACCEPTED_EXT.test(file.name);
}

function isSvg(file: File): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new FileValidationError("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/** Cheap intrinsic-dimension read from a PNG/JPEG header (no full decode). */
async function headerDims(
  file: File
): Promise<{ width: number; height: number } | null> {
  try {
    const b = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    // PNG: 8-byte sig, then IHDR chunk → width@16, height@20
    if (b[0] === 0x89 && b[1] === 0x50) {
      const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
      const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
      return w > 0 && h > 0 ? { width: w >>> 0, height: h >>> 0 } : null;
    }
    // JPEG: scan for a Start-Of-Frame marker
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length && b[o] === 0xff) {
        const marker = b[o + 1];
        const len = (b[o + 2] << 8) | b[o + 3];
        // SOF0..SOF15 except DHT/DAC/RST markers carry dimensions
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const h = (b[o + 5] << 8) | b[o + 6];
          const w = (b[o + 7] << 8) | b[o + 8];
          return w > 0 && h > 0 ? { width: w, height: h } : null;
        }
        o += 2 + len;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

interface Decoded {
  /** Final dimensions (after any downscale). */
  width: number;
  height: number;
  /** Original source dimensions (for computing the downscale factor). */
  originalWidth: number;
  originalHeight: number;
  /** Downscaled data URL if the source was huge; null to keep the original. */
  downscaledSrc: string | null;
}

/**
 * Decode an image (off the main thread via createImageBitmap when available)
 * and, if it is enormous, downscale it to MAX_IMPORT_PIXELS. Falls back to an
 * <img> decode for SVG and older browsers.
 */
async function decodeAndMaybeDownscale(
  file: File,
  src: string
): Promise<Decoded> {
  // SVG is vector — never rasterize/downscale; just read its intrinsic size.
  if (isSvg(file)) {
    const dims = await imageDims(src);
    return {
      ...dims,
      originalWidth: dims.width,
      originalHeight: dims.height,
      downscaledSrc: null,
    };
  }

  // Try a cheap header read first. If the image is huge AND the browser
  // supports resize-on-decode, decode it directly at the reduced size so we
  // never hold a full-resolution bitmap in memory.
  const header = await headerDims(file);
  if (
    header &&
    header.width * header.height > MAX_IMPORT_PIXELS &&
    typeof createImageBitmap === "function"
  ) {
    const scale = Math.sqrt(MAX_IMPORT_PIXELS / (header.width * header.height));
    const w = Math.max(1, Math.round(header.width * scale));
    const h = Math.max(1, Math.round(header.height * scale));
    try {
      const bmp = await createImageBitmap(file, {
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: "high",
      });
      const out = bitmapToDataUrl(bmp, file.type);
      bmp.close();
      return {
        width: w,
        height: h,
        originalWidth: header.width,
        originalHeight: header.height,
        downscaledSrc: out,
      };
    } catch {
      /* resize-decode unsupported — fall through to the normal path */
    }
  }

  let bitmap: ImageBitmap | null = null;
  let width = 0;
  let height = 0;
  try {
    bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    // fallback: decode via <img> (no off-thread, but works everywhere)
    const dims = await imageDims(src);
    width = dims.width;
    height = dims.height;
  }

  if (!width || !height) {
    bitmap?.close();
    throw new FileValidationError("could not determine image dimensions.");
  }

  const pixels = width * height;
  if (pixels <= MAX_IMPORT_PIXELS) {
    bitmap?.close();
    return {
      width,
      height,
      originalWidth: width,
      originalHeight: height,
      downscaledSrc: null,
    };
  }

  // downscale, preserving aspect ratio
  const scale = Math.sqrt(MAX_IMPORT_PIXELS / pixels);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const source: CanvasImageSource = bitmap ?? (await loadImg(src));
  const downscaledSrc = drawToDataUrl(source, w, h, file.type);
  bitmap?.close();
  return {
    width: w,
    height: h,
    originalWidth: width,
    originalHeight: height,
    downscaledSrc,
  };
}

/** Draw a decoded source to a w×h canvas and return a data URL. */
function drawToDataUrl(
  source: CanvasImageSource,
  w: number,
  h: number,
  mimeType: string
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new FileValidationError("could not process the image.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  // PNG keeps transparency (critical for DTF); JPEG sources stay JPEG to save space
  const mime = mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  return canvas.toDataURL(mime, 0.92);
}

/** ImageBitmap → data URL (used by the resize-on-decode fast path). */
function bitmapToDataUrl(bmp: ImageBitmap, mimeType: string): string {
  return drawToDataUrl(bmp, bmp.width, bmp.height, mimeType);
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new FileValidationError("invalid image."));
    img.src = src;
  });
}

async function imageDims(src: string): Promise<{ width: number; height: number }> {
  const img = await loadImg(src);
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

/** DTF artwork is conventionally prepared at 300 DPI. */
export const DEFAULT_ASSET_DPI = 300;

function readU32BE(b: Uint8Array, o: number): number {
  return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
}

/** PNG pHYs chunk → DPI (pixels-per-meter → inch). */
function pngDpi(bytes: Uint8Array): number | null {
  if (bytes.length < 8) return null;
  let o = 8; // skip signature
  while (o + 8 <= bytes.length) {
    const len = readU32BE(bytes, o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    if (type === "pHYs" && len >= 9) {
      const ppuX = readU32BE(bytes, o + 8);
      const unit = bytes[o + 16];
      if (unit === 1 && ppuX > 0) return ppuX * 0.0254;
      return null;
    }
    if (type === "IDAT" || type === "IEND") return null;
    o += 12 + len;
  }
  return null;
}

/** JPEG JFIF APP0 density → DPI. */
function jpegDpi(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let o = 2;
  while (o + 4 <= bytes.length && bytes[o] === 0xff) {
    const marker = bytes[o + 1];
    if (marker === 0xda) return null; // start of scan
    const len = (bytes[o + 2] << 8) | bytes[o + 3];
    if (marker === 0xe0 && len >= 14) {
      const d = o + 4;
      const isJfif =
        bytes[d] === 0x4a && bytes[d + 1] === 0x46 && bytes[d + 2] === 0x49 &&
        bytes[d + 3] === 0x46 && bytes[d + 4] === 0x00;
      if (isJfif) {
        const units = bytes[d + 7];
        const xDensity = (bytes[d + 8] << 8) | bytes[d + 9];
        if (xDensity > 0) {
          if (units === 1) return xDensity;
          if (units === 2) return xDensity * 2.54;
        }
      }
      return null;
    }
    o += 2 + len;
  }
  return null;
}

/** Best-effort DPI from file metadata; null when the file doesn't say. */
export async function readImageDpi(file: File): Promise<number | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const dpi =
      file.type === "image/png"
        ? pngDpi(bytes)
        : file.type === "image/jpeg"
          ? jpegDpi(bytes)
          : null;
    // ignore absurd values some editors write
    return dpi && dpi >= 36 && dpi <= 2400 ? Math.round(dpi) : null;
  } catch {
    return null;
  }
}

/**
 * Read any droppable image into a LibraryAsset. Accepts every browser-decodable
 * format, never rejects by size, and downscales enormous images so the app
 * stays responsive — without changing the design's physical print size (the
 * DPI is scaled to match, so a downscaled image just prints at a lower, honest
 * resolution). Heavy decoding runs off the main thread via createImageBitmap.
 */
export async function fileToAsset(file: File): Promise<LibraryAsset> {
  if (!isAcceptedFile(file)) {
    throw new FileValidationError(
      `"${file.name}" isn't a supported image. Use PNG, JPG, WEBP, GIF, BMP, AVIF, or SVG.`
    );
  }
  // safety net only — prevents a multi-hundred-MB file from crashing the tab
  if (file.size > MAX_FILE_BYTES) {
    throw new FileValidationError(
      `"${file.name}" is too large to open in the browser (over ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`
    );
  }

  const originalSrc = await readDataUrl(file).catch(() => {
    throw new FileValidationError(`Could not read "${file.name}".`);
  });

  let decoded: Decoded;
  try {
    decoded = await decodeAndMaybeDownscale(file, originalSrc);
  } catch (err) {
    throw new FileValidationError(
      `"${file.name}" ${err instanceof Error ? err.message : "could not be opened."}`
    );
  }

  // If we downscaled, scale DPI by the same factor so the default placement
  // size on the sheet is unchanged (origW/origDpi === newW/newDpi).
  const fileDpi = await readImageDpi(file);
  let dpi = fileDpi ?? undefined;
  let { width, height } = decoded;
  let src = decoded.downscaledSrc ?? originalSrc;

  if (decoded.downscaledSrc) {
    const factor =
      decoded.originalWidth > 0 ? width / decoded.originalWidth : 1;
    dpi = Math.max(1, Math.round((fileDpi ?? DEFAULT_ASSET_DPI) * factor));
  } else {
    src = originalSrc;
  }

  return {
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, ""),
    src,
    naturalWidth: width,
    naturalHeight: height,
    sizeBytes: src.length, // approximate stored size (data URL length)
    mimeType: file.type || "image/png",
    createdAt: Date.now(),
    dpi,
  };
}

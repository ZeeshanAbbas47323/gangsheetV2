import { uid } from "./id";
import type { LibraryAsset } from "./types";

export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,.svg";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export class FileValidationError extends Error {}

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

/** Read a file into a LibraryAsset (data URL + natural dimensions). */
export async function fileToAsset(file: File): Promise<LibraryAsset> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new FileValidationError(
      `Unsupported file type "${file.type || file.name.split(".").pop()}". Use PNG, JPG, WEBP, or SVG.`
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new FileValidationError(
      `"${file.name}" is larger than 50 MB.`
    );
  }

  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new FileValidationError(`Could not read "${file.name}".`));
    reader.readAsDataURL(file);
  });

  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      img.onerror = () =>
        reject(new FileValidationError(`"${file.name}" is not a valid image.`));
      img.src = src;
    }
  );

  if (!width || !height) {
    throw new FileValidationError(
      `Could not determine dimensions for "${file.name}".`
    );
  }

  const dpi = await readImageDpi(file);

  return {
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, ""),
    src,
    naturalWidth: width,
    naturalHeight: height,
    sizeBytes: file.size,
    mimeType: file.type,
    createdAt: Date.now(),
    dpi: dpi ?? undefined,
  };
}

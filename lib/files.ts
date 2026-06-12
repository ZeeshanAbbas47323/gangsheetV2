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

  return {
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, ""),
    src,
    naturalWidth: width,
    naturalHeight: height,
    sizeBytes: file.size,
    mimeType: file.type,
    createdAt: Date.now(),
  };
}

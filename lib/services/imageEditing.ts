import type { ImageToolOp } from "../types";

/**
 * Centralized client-side image-editing service. Every operation calls one of
 * our own API routes (keys stay server-side) and returns a processed data URL
 * plus its dimensions. Adapt server routes — not this file — to switch
 * providers.
 */

const ROUTES: Record<ImageToolOp, string> = {
  "remove-bg": "/api/image/remove-bg",
  upscale: "/api/image/upscale",
  "remove-text": "/api/image/remove-text",
};

export const TOOL_LABELS: Record<ImageToolOp, string> = {
  "remove-bg": "Remove background",
  upscale: "Upscale",
  "remove-text": "Remove text",
};

/** Asset flag set once an operation has succeeded (prevents re-processing). */
export const TOOL_DONE_FLAG: Record<
  ImageToolOp,
  "bgRemoved" | "upscaled" | "textRemoved"
> = {
  "remove-bg": "bgRemoved",
  upscale: "upscaled",
  "remove-text": "textRemoved",
};

export interface EditedImage {
  image: string;
  width: number;
  height: number;
  mimeType: string;
}

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Processed image could not be read."));
    img.src = src;
  });
}

export class ImageEditingError extends Error {}

export async function editImage(
  op: ImageToolOp,
  dataUrl: string,
  fileName: string,
  extra?: Record<string, number | string>
): Promise<EditedImage> {
  let res: Response;
  // console.log(JSON.stringify({ image: dataUrl, fileName, ...extra }));
  console.log(ROUTES[op]);
  
  try {
    res = await fetch(ROUTES[op], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, fileName, ...extra }),
    });
  } catch {
    throw new ImageEditingError("Network error reaching the image service.");
  }

  const data = (await res.json().catch(() => ({}))) as {
    image?: string;
    error?: string;
  };
  if (!res.ok || !data.image) {
    throw new ImageEditingError(data.error ?? "The image service failed.");
  }

  const dims = await measure(data.image);
  const mimeType = data.image.slice(5, data.image.indexOf(";"));
  return { image: data.image, width: dims.width, height: dims.height, mimeType };
}

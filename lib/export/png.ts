import { renderSheetToCanvas } from "./render";
import {
  ExportError,
  type ExportContext,
  type ProgressCallback,
} from "./types";

/**
 * Export the sheet as a transparency-preserving PNG at exact physical
 * resolution (e.g. 22"×60" @300 DPI → 6600×18000 px).
 */
export async function exportPng(
  ctx: ExportContext,
  dpi: number,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const canvas = await renderSheetToCanvas(ctx, dpi, onProgress);
  onProgress?.("encoding", 85);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  // release the (potentially huge) backing store promptly
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) {
    throw new ExportError(
      "PNG encoding failed — the image may be too large for this browser.",
      "Lower the export DPI."
    );
  }
  onProgress?.("encoding", 100);
  return blob;
}

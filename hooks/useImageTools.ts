"use client";

import { useCallback } from "react";
import {
  editImage,
  ImageEditingError,
  TOOL_DONE_FLAG,
  TOOL_LABELS,
} from "@/lib/services/imageEditing";
import { useBuilder } from "@/lib/store";
import type { ImageToolOp } from "@/lib/types";

/**
 * Background removal, upscaling, and smart cropping for library assets.
 * Calls the centralized image-editing service (keys stay server-side),
 * replaces the asset in place — every placed copy updates — and keeps each
 * element's physical print size on the canvas unchanged.
 */
export function useImageTools() {
  const processing = useBuilder((s) => s.assetProcessing);

  const processAsset = useCallback(async (assetId: string, op: ImageToolOp) => {
    const store = useBuilder.getState();
    const asset = store.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (store.assetProcessing[assetId]) return; // already running
    if (asset[TOOL_DONE_FLAG[op]]) {
      store.pushToast("info", `${TOOL_LABELS[op]} was already applied to this image.`);
      return;
    }

    store.setAssetProcessing(assetId, op);
    try {
      // upscaling: ask for ~2× (capped) so print quality improves meaningfully
      const extra =
        op === "upscale"
          ? {
              targetWidth: Math.min(4096, asset.naturalWidth * 2),
              targetHeight: Math.min(4096, asset.naturalHeight * 2),
            }
          : undefined;

      const result = await editImage(op, asset.src, asset.name, extra);
      useBuilder.getState().updateAsset(assetId, {
        src: result.image,
        naturalWidth: result.width,
        naturalHeight: result.height,
        mimeType: result.mimeType,
        [TOOL_DONE_FLAG[op]]: true,
      });
      const detail =
        op === "upscale"
          ? `${result.width}×${result.height}px`
          : op === "remove-text"
            ? "text removed"
            : "background removed";
      useBuilder
        .getState()
        .pushToast("success", `"${asset.name}" — ${detail}`);
    } catch (err) {
      useBuilder
        .getState()
        .pushToast(
          "error",
          err instanceof ImageEditingError ? err.message : "Image processing failed."
        );
    } finally {
      useBuilder.getState().setAssetProcessing(assetId, undefined);
    }
  }, []);

  return { processAsset, processing };
}

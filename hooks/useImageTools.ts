"use client";

import { useCallback } from "react";
import { useBuilder } from "@/lib/store";
import type { ImageToolOp } from "@/lib/types";

const ROUTES: Record<ImageToolOp, string> = {
  "remove-bg": "/api/image/remove-bg",
  upscale: "/api/image/upscale",
};

const DONE_FLAGS: Record<ImageToolOp, "bgRemoved" | "upscaled"> = {
  "remove-bg": "bgRemoved",
  upscale: "upscaled",
};

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Processed image could not be read."));
    img.src = src;
  });
}

/**
 * Background removal & upscaling. Calls our own API routes (keys stay on the
 * server), replaces the asset in place — every placed copy updates, and
 * physical print sizes on the canvas are untouched.
 */
export function useImageTools() {
  const processing = useBuilder((s) => s.assetProcessing);

  const processAsset = useCallback(async (assetId: string, op: ImageToolOp) => {
    const store = useBuilder.getState();
    const asset = store.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (store.assetProcessing[assetId]) return; // already running
    if (asset[DONE_FLAGS[op]]) {
      store.pushToast(
        "info",
        op === "remove-bg"
          ? "Background was already removed for this image."
          : "This image was already upscaled."
      );
      return;
    }

    store.setAssetProcessing(assetId, op);
    try {
      const res = await fetch(ROUTES[op], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: asset.src, fileName: asset.name }),
      });
      const data = (await res.json()) as { image?: string; error?: string };
      if (!res.ok || !data.image) {
        throw new Error(data.error ?? "The image service failed.");
      }
      const dims = await measure(data.image);
      useBuilder.getState().updateAsset(assetId, {
        src: data.image,
        naturalWidth: dims.width,
        naturalHeight: dims.height,
        mimeType: data.image.slice(5, data.image.indexOf(";")),
        [DONE_FLAGS[op]]: true,
      });
      useBuilder
        .getState()
        .pushToast(
          "success",
          op === "remove-bg"
            ? `Background removed from "${asset.name}"`
            : `"${asset.name}" upscaled to ${dims.width}×${dims.height}px`
        );
    } catch (err) {
      useBuilder
        .getState()
        .pushToast(
          "error",
          err instanceof Error ? err.message : "Image processing failed."
        );
    } finally {
      useBuilder.getState().setAssetProcessing(assetId, undefined);
    }
  }, []);

  return { processAsset, processing };
}

"use client";

import { useCallback, useState } from "react";
import {
  nestInWorker,
  requiredHeightInWorker,
} from "@/lib/nesting/client";
import type {
  NestOptions,
  NestRequest,
  ObstacleRect,
} from "@/lib/nesting/types";
import { useBuilder } from "@/lib/store";
import { elementAABB, LOW_DPI_THRESHOLD } from "@/lib/units";

export type NestScope = "all" | "selected";

/** Build the nest request from current store state. */
function buildRequest(
  scope: NestScope,
  options: NestOptions
): NestRequest | null {
  const { elements, sheet, selectedIds } = useBuilder.getState();
  const visible = elements.filter((e) => e.visible);

  const packable = visible.filter((e) =>
    scope === "selected"
      ? selectedIds.includes(e.id) && !e.locked
      : !e.locked
  );
  if (packable.length === 0) return null;

  const fixed = visible.filter((e) => !packable.some((p) => p.id === e.id));
  const obstacles: ObstacleRect[] = fixed.map((e) => {
    const box = elementAABB(e);
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  });

  return {
    items: packable.map((e) => {
      const box = elementAABB(e);
      return {
        id: e.id,
        w: box.width,
        h: box.height,
        hash: `${e.type === "image" ? e.assetId : "text:" + e.id}|${box.width.toFixed(3)}x${box.height.toFixed(3)}`,
      };
    }),
    sheetWidth: sheet.widthIn,
    sheetHeight: sheet.heightIn,
    options,
    obstacles,
  };
}

/** Warn when auto-scaling pushed any placed design below the DPI floor. */
function warnLowDpi(scale: number): void {
  if (scale >= 1) return;
  const { elements, assets, pushToast } = useBuilder.getState();
  const low = elements.filter((e) => {
    if (e.type !== "image") return false;
    const asset = assets.find((a) => a.id === e.assetId);
    return asset && asset.naturalWidth / e.widthIn < LOW_DPI_THRESHOLD;
  });
  if (low.length > 0) {
    pushToast(
      "warning",
      `Auto-scale left ${low.length} design${low.length === 1 ? "" : "s"} below ${LOW_DPI_THRESHOLD} DPI`
    );
  }
}

export function useAutoNest() {
  const [busy, setBusy] = useState(false);

  const nest = useCallback(async (scope: NestScope, options: NestOptions) => {
    const request = buildRequest(scope, options);
    const s = useBuilder.getState();
    if (!request) {
      s.pushToast("warning", "Nothing to nest — add or select designs first.");
      return;
    }
    setBusy(true);
    try {
      const result = await nestInWorker(request);
      const store = useBuilder.getState();
      store.applyNestResult(
        result.placements,
        result.overflowIds,
        result.stats.scale
      );
      store.setNestStats(result.stats);
      warnLowDpi(result.stats.scale);
      if (result.overflowIds.length === 0) {
        store.pushToast(
          "success",
          `Nested ${result.stats.placed} designs — ${(result.stats.utilization * 100).toFixed(1)}% utilization`
        );
      }
    } catch (err) {
      useBuilder
        .getState()
        .pushToast(
          "error",
          err instanceof Error ? err.message : "Auto-nest failed"
        );
    } finally {
      setBusy(false);
    }
  }, []);

  /** Overflow action: grow the sheet just enough, then re-nest everything. */
  const extendSheetAndNest = useCallback(
    async (options: NestOptions) => {
      const request = buildRequest("all", options);
      if (!request) return;
      setBusy(true);
      try {
        const height = await requiredHeightInWorker(request);
        const store = useBuilder.getState();
        const newHeight = Math.min(240, Math.ceil(height));
        store.setSheet({ heightIn: newHeight });
        store.pushToast(
          "info",
          `Sheet extended to ${store.sheet.widthIn}" × ${newHeight}"`
        );
      } finally {
        setBusy(false);
      }
      await nest("all", { ...options, allowScale: false });
    },
    [nest]
  );

  return { nest, extendSheetAndNest, busy };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBuilder } from "@/lib/store";
import type {
  NestOptions,
  NestRequest,
  NestResult,
  ObstacleRect,
} from "@/lib/nesting/types";
import { elementAABB, LOW_DPI_THRESHOLD } from "@/lib/units";
import type {
  WorkerRequest,
  WorkerResponse,
} from "@/workers/nesting.worker";

export type NestScope = "all" | "selected";

interface Pending {
  resolve: (msg: WorkerResponse) => void;
  reject: (err: Error) => void;
}

/** Build the worker request from current store state. */
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
        hash: `${e.assetId}|${box.width.toFixed(3)}x${box.height.toFixed(3)}`,
      };
    }),
    sheetWidth: sheet.widthIn,
    sheetHeight: sheet.heightIn,
    options,
    obstacles,
  };
}

export function useAutoNest() {
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const seqRef = useRef(0);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const callWorker = useCallback(
    (kind: "nest" | "requiredHeight", payload: NestRequest) =>
      new Promise<WorkerResponse>((resolve, reject) => {
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL("../workers/nesting.worker.ts", import.meta.url)
          );
          workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const pending = pendingRef.current.get(e.data.requestId);
            if (!pending) return;
            pendingRef.current.delete(e.data.requestId);
            if (e.data.kind === "error") {
              pending.reject(new Error(e.data.message));
            } else {
              pending.resolve(e.data);
            }
          };
          workerRef.current.onerror = () => {
            // worker is unusable — fail everything in flight, drop the worker
            pendingRef.current.forEach((p) =>
              p.reject(new Error("Nesting worker crashed"))
            );
            pendingRef.current.clear();
            workerRef.current?.terminate();
            workerRef.current = null;
          };
        }
        const requestId = ++seqRef.current;
        pendingRef.current.set(requestId, { resolve, reject });
        const msg: WorkerRequest = { kind, requestId, payload };
        workerRef.current.postMessage(msg);
      }),
    []
  );

  const runNestRequest = useCallback(
    async (request: NestRequest): Promise<NestResult> => {
      try {
        const res = await callWorker("nest", request);
        if (res.kind !== "nest") throw new Error("Unexpected worker reply");
        return res.result;
      } catch {
        // graceful degradation: run on the main thread
        const { runNest } = await import("@/lib/nesting/engine");
        return runNest(request);
      }
    },
    [callWorker]
  );

  /** Warn when auto-scaling pushed any placed design below the DPI floor. */
  const warnLowDpi = useCallback((scale: number) => {
    if (scale >= 1) return;
    const { elements, assets, pushToast } = useBuilder.getState();
    const low = elements.filter((e) => {
      const asset = assets.find((a) => a.id === e.assetId);
      return asset && asset.naturalWidth / e.widthIn < LOW_DPI_THRESHOLD;
    });
    if (low.length > 0) {
      pushToast(
        "warning",
        `Auto-scale left ${low.length} design${low.length === 1 ? "" : "s"} below ${LOW_DPI_THRESHOLD} DPI`
      );
    }
  }, []);

  const nest = useCallback(
    async (scope: NestScope, options: NestOptions) => {
      const request = buildRequest(scope, options);
      const s = useBuilder.getState();
      if (!request) {
        s.pushToast("warning", "Nothing to nest — add or select designs first.");
        return;
      }
      setBusy(true);
      try {
        const result = await runNestRequest(request);
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
    },
    [runNestRequest, warnLowDpi]
  );

  /** Overflow action: grow the sheet just enough, then re-nest everything. */
  const extendSheetAndNest = useCallback(
    async (options: NestOptions) => {
      const request = buildRequest("all", options);
      if (!request) return;
      setBusy(true);
      try {
        let height: number;
        try {
          const res = await callWorker("requiredHeight", request);
          if (res.kind !== "requiredHeight") throw new Error("Unexpected reply");
          height = res.height;
        } catch {
          const { requiredSheetHeight } = await import("@/lib/nesting/engine");
          height = requiredSheetHeight(request);
        }
        const store = useBuilder.getState();
        const newHeight = Math.min(240, Math.ceil(height));
        store.setSheet({ heightIn: newHeight });
        store.pushToast("info", `Sheet extended to ${store.sheet.widthIn}" × ${newHeight}"`);
      } finally {
        setBusy(false);
      }
      await nest("all", { ...options, allowScale: false });
    },
    [callWorker, nest]
  );

  return { nest, extendSheetAndNest, busy };
}

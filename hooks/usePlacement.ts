"use client";

import { useCallback, useState } from "react";
import { uid } from "@/lib/id";
import { nestInWorker, requiredHeightInWorker } from "@/lib/nesting/client";
import type {
  NestItem,
  NestPlacement,
  NestRequest,
  ObstacleRect,
} from "@/lib/nesting/types";
import { MAX_SHEET_IN } from "@/lib/presets";
import { useBuilder } from "@/lib/store";
import type { CanvasElement, PlacementSpec } from "@/lib/types";
import { elementAABB } from "@/lib/units";

const PLACE_SPACING_IN = 0.125;

function defaultNestOptions(margin = 0) {
  return {
    mode: "compact" as const,
    optimization: "balanced" as const,
    allowRotation: true,
    spacing: PLACE_SPACING_IN,
    margin,
    allowScale: false,
    minScale: 1,
  };
}

/** Expand specs into one nest item per copy. */
function specsToItems(specs: PlacementSpec[]): NestItem[] {
  const items: NestItem[] = [];
  for (const spec of specs) {
    for (let i = 0; i < spec.quantity; i++) {
      items.push({
        id: `${spec.assetId}#${i}`,
        w: spec.widthIn,
        h: spec.heightIn,
        hash: `${spec.assetId}|${spec.widthIn.toFixed(3)}x${spec.heightIn.toFixed(3)}`,
      });
    }
  }
  return items;
}

function visibleObstacles(): ObstacleRect[] {
  const { elements } = useBuilder.getState();
  return elements
    .filter((e) => e.visible)
    .map((e) => {
      const box = elementAABB(e);
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      };
    });
}

/** Materialize nest placements into canvas elements for their specs. */
function placementsToElements(
  placements: NestPlacement[],
  specs: PlacementSpec[]
): CanvasElement[] {
  const { assets } = useBuilder.getState();
  const els: CanvasElement[] = [];
  for (const p of placements) {
    const assetId = p.id.split("#")[0];
    const spec = specs.find((s) => s.assetId === assetId);
    const asset = assets.find((a) => a.id === assetId);
    if (!spec || !asset) continue;
    els.push({
      id: uid(),
      type: "image",
      assetId,
      name: asset.name,
      x: p.x + p.w / 2,
      y: p.y + p.h / 2,
      widthIn: spec.widthIn,
      heightIn: spec.heightIn,
      rotation: p.rotated ? 90 : 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      locked: false,
      visible: true,
    });
  }
  return els;
}

/** Stack elements that did not fit in a column beside the sheet. */
function overflowElements(
  overflowIds: string[],
  specs: PlacementSpec[]
): CanvasElement[] {
  const { assets, sheet } = useBuilder.getState();
  const els: CanvasElement[] = [];
  let y = 0.5;
  for (const id of overflowIds) {
    const assetId = id.split("#")[0];
    const spec = specs.find((s) => s.assetId === assetId);
    const asset = assets.find((a) => a.id === assetId);
    if (!spec || !asset) continue;
    els.push({
      id: uid(),
      type: "image",
      assetId,
      name: asset.name,
      x: sheet.widthIn + 1 + spec.widthIn / 2,
      y: y + spec.heightIn / 2,
      widthIn: spec.widthIn,
      heightIn: spec.heightIn,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      locked: false,
      visible: true,
    });
    y += spec.heightIn + 0.5;
  }
  return els;
}

export function usePlacement() {
  const [busy, setBusy] = useState(false);

  /**
   * Place the requested copies on the current sheet, nesting them around
   * everything already there. Sheet size is untouched.
   */
  const placeAssets = useCallback(async (specs: PlacementSpec[]) => {
    const items = specsToItems(specs);
    if (items.length === 0) return;
    setBusy(true);
    try {
      const { sheet } = useBuilder.getState();
      const request: NestRequest = {
        items,
        sheetWidth: sheet.widthIn,
        sheetHeight: sheet.heightIn,
        options: defaultNestOptions(),
        obstacles: visibleObstacles(),
      };
      const result = await nestInWorker(request);
      const els = [
        ...placementsToElements(result.placements, specs),
        ...overflowElements(result.overflowIds, specs),
      ];
      const store = useBuilder.getState();
      store.addElements(els);
      if (result.overflowIds.length > 0) {
        store.pushToast(
          "warning",
          `${result.overflowIds.length} cop${result.overflowIds.length === 1 ? "y" : "ies"} did not fit and were placed beside the sheet. Try Auto Build.`
        );
      } else {
        store.pushToast(
          "success",
          `Placed ${els.length} design${els.length === 1 ? "" : "s"}`
        );
      }
    } catch (err) {
      useBuilder
        .getState()
        .pushToast(
          "error",
          err instanceof Error ? err.message : "Placement failed"
        );
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * DripApps-style Auto Build: fixed sheet width, height extended exactly as
   * far as needed, everything nested. Existing artwork stays where it is and
   * is packed around. One undo step.
   */
  const autoBuild = useCallback(async (specs: PlacementSpec[]) => {
    const items = specsToItems(specs);
    if (items.length === 0) return;
    setBusy(true);
    try {
      const { sheet } = useBuilder.getState();
      const obstacles = visibleObstacles();
      const base: NestRequest = {
        items,
        sheetWidth: sheet.widthIn,
        sheetHeight: sheet.heightIn,
        options: defaultNestOptions(),
        obstacles,
      };
      const needed = await requiredHeightInWorker(base);
      const targetHeight = Math.min(
        MAX_SHEET_IN,
        Math.max(sheet.heightIn, Math.ceil(needed * 4) / 4)
      );
      const result = await nestInWorker({
        ...base,
        sheetHeight: targetHeight,
      });
      const els = [
        ...placementsToElements(result.placements, specs),
        ...overflowElements(result.overflowIds, specs),
      ];
      const store = useBuilder.getState();
      store.applyAutoBuild(els, targetHeight);
      store.setNestStats(result.stats);
      store.requestFit();
      store.pushToast(
        result.overflowIds.length > 0
          ? "warning"
          : "success",
        result.overflowIds.length > 0
          ? `Sheet maxed out at ${MAX_SHEET_IN}" — ${result.overflowIds.length} copies did not fit`
          : `Auto-built ${store.sheet.widthIn}" × ${targetHeight}" sheet with ${result.placements.length} designs`
      );
    } catch (err) {
      useBuilder
        .getState()
        .pushToast(
          "error",
          err instanceof Error ? err.message : "Auto Build failed"
        );
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Fill the remaining free sheet area with as many copies of the given
   * element as fit, using standard spacing. One undo step.
   */
  const autoFill = useCallback(async (elementId: string) => {
    const { elements, sheet, pushToast } = useBuilder.getState();
    const source = elements.find((e) => e.id === elementId);
    if (!source) return;
    setBusy(true);
    try {
      const box = elementAABB(source);
      const itemArea = Math.max(0.01, box.width * box.height);
      const maxCopies = Math.min(
        800,
        Math.floor((sheet.widthIn * sheet.heightIn) / itemArea) + 4
      );
      if (maxCopies <= 0) {
        pushToast("warning", "The design is larger than the sheet.");
        return;
      }
      const spec: PlacementSpec = {
        assetId: source.assetId,
        widthIn: box.width,
        heightIn: box.height,
        quantity: maxCopies,
      };
      const result = await nestInWorker({
        items: specsToItems([spec]),
        sheetWidth: sheet.widthIn,
        sheetHeight: sheet.heightIn,
        options: { ...defaultNestOptions(), allowRotation: false },
        obstacles: visibleObstacles(),
      });
      // copies inherit the source's look (rotation/flips/opacity)
      const els: CanvasElement[] = result.placements.map((p) => ({
        ...source,
        id: uid(),
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
        locked: false,
      }));
      if (els.length === 0) {
        pushToast("warning", "No room left on the sheet for more copies.");
        return;
      }
      const store = useBuilder.getState();
      store.addElements(els);
      store.pushToast("success", `Filled the sheet with ${els.length} more cop${els.length === 1 ? "y" : "ies"}`);
    } catch (err) {
      useBuilder
        .getState()
        .pushToast(
          "error",
          err instanceof Error ? err.message : "Auto Fill failed"
        );
    } finally {
      setBusy(false);
    }
  }, []);

  return { placeAssets, autoBuild, autoFill, busy };
}

"use client";

import { useCallback, useState } from "react";
import { uid } from "@/lib/id";
import { nestInWorker } from "@/lib/nesting/client";
import type {
  NestItem,
  NestOptions,
  NestPlacement,
  ObstacleRect,
} from "@/lib/nesting/types";
import {
  MAX_SHEET_IN,
  SHEET_WIDTH_IN,
  smallestHeightFor,
} from "@/lib/presets";
import { useBuilder, type SheetBuild } from "@/lib/store";
import type { CanvasElement, ImageElement, PlacementSpec } from "@/lib/types";
import { elementAABB } from "@/lib/units";

const PLACE_SPACING_IN = 0.125;
/** Safety ceiling so a pathological batch can't spawn unbounded sheets. */
const MAX_SHEETS = 40;

function nestOptions(margin = 0): NestOptions {
  return {
    mode: "compact",
    optimization: "balanced",
    allowRotation: true,
    spacing: PLACE_SPACING_IN,
    margin,
    allowScale: false,
    minScale: 1,
  };
}

/** Expand placement specs into one nest item per copy. */
function specsToItems(specs: PlacementSpec[]): NestItem[] {
  const items: NestItem[] = [];
  for (const spec of specs) {
    for (let i = 0; i < spec.quantity; i++) {
      items.push({
        id: `${spec.assetId}#${uid()}`,
        w: spec.widthIn,
        h: spec.heightIn,
        hash: `${spec.assetId}|${spec.widthIn.toFixed(3)}x${spec.heightIn.toFixed(3)}`,
      });
    }
  }
  return items;
}

function obstaclesFrom(elements: CanvasElement[]): ObstacleRect[] {
  return elements
    .filter((e) => e.visible)
    .map((e) => {
      const b = elementAABB(e);
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
}

/** Turn nest placements into image elements, resolving each item's spec. */
function placementsToElements(
  placements: NestPlacement[],
  specByAsset: Map<string, PlacementSpec>
): ImageElement[] {
  const { assets } = useBuilder.getState();
  const els: ImageElement[] = [];
  for (const p of placements) {
    const assetId = p.id.split("#")[0];
    const spec = specByAsset.get(assetId);
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

interface PackedSheet {
  heightIn: number;
  placements: NestPlacement[];
}

/**
 * Greedy multi-sheet packer. Fills one sheet at a time at the maximum height,
 * spilling overflow onto fresh sheets, until every item is placed (or the
 * sheet ceiling is hit). The first sheet may use a fixed height (Place on
 * Sheet) or auto-size to the smallest fit (Auto Build).
 */
async function packIntoSheets(
  items: NestItem[],
  opts: { firstHeightFixed?: number; firstObstacles?: ObstacleRect[] }
): Promise<{ sheets: PackedSheet[]; unplaceable: string[] }> {
  const out: PackedSheet[] = [];
  let remaining = items;
  let first = true;

  while (remaining.length > 0 && out.length < MAX_SHEETS) {
    const fixed = first ? opts.firstHeightFixed : undefined;
    const workingHeight = fixed ?? MAX_SHEET_IN;
    const obstacles = first ? opts.firstObstacles ?? [] : [];

    const res = await nestInWorker({
      items: remaining,
      sheetWidth: SHEET_WIDTH_IN,
      sheetHeight: workingHeight,
      options: nestOptions(),
      obstacles,
    });

    if (res.placements.length === 0) {
      // nothing fits on a fresh max-height sheet → genuinely unplaceable
      return { sheets: out, unplaceable: remaining.map((i) => i.id) };
    }

    // Determine the sheet's final height: fixed, or the smallest size that
    // holds the packed content (plus any first-sheet obstacles).
    let usedBottom = 0;
    for (const p of res.placements) usedBottom = Math.max(usedBottom, p.y + p.h);
    if (first && opts.firstObstacles) {
      for (const o of opts.firstObstacles) usedBottom = Math.max(usedBottom, o.bottom);
    }
    const heightIn = fixed ?? Math.min(MAX_SHEET_IN, smallestHeightFor(usedBottom));

    out.push({ heightIn, placements: res.placements });

    const overflow = new Set(res.overflowIds);
    remaining = remaining.filter((i) => overflow.has(i.id));
    first = false;
  }

  return { sheets: out, unplaceable: remaining.map((i) => i.id) };
}

export function usePlacement() {
  const [busy, setBusy] = useState(false);

  /**
   * Place copies onto the current sheet, packing around existing artwork.
   * Overflow spills onto new sheets (each capped at the maximum height).
   */
  const placeAssets = useCallback(async (specs: PlacementSpec[]) => {
    const items = specsToItems(specs);
    if (items.length === 0) return;
    setBusy(true);
    try {
      const { elements } = useBuilder.getState();
      const existing = elements;
      const specByAsset = new Map(specs.map((s) => [s.assetId, s]));

      // UPDATED: fit as much as possible onto ONE sheet by letting the active
      // sheet grow up to the 300" maximum; only spill the genuine overflow.
      // (Previously the first sheet was pinned to its current height, which
      // forced unnecessary extra sheets.)
      const { sheets, unplaceable } = await packIntoSheets(items, {
        firstObstacles: obstaclesFrom(existing),
      });

      commitPacked(sheets, specByAsset, existing, undefined, unplaceable.length);
    } catch (err) {
      reportError(err, "Placement failed");
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * DripApps-style Auto Build: auto-size sheets to the smallest fit and split
   * into multiple sheets when the batch exceeds the maximum height.
   */
  const autoBuild = useCallback(async (specs: PlacementSpec[]) => {
    const items = specsToItems(specs);
    if (items.length === 0) return;
    setBusy(true);
    try {
      const { elements } = useBuilder.getState();
      const existing = elements;
      const specByAsset = new Map(specs.map((s) => [s.assetId, s]));

      const { sheets, unplaceable } = await packIntoSheets(items, {
        firstObstacles: obstaclesFrom(existing),
      });

      commitPacked(sheets, specByAsset, existing, undefined, unplaceable.length);
    } catch (err) {
      reportError(err, "Auto Build failed");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Fill the remaining free space of the current sheet with copies of one design. */
  const autoFill = useCallback(async (elementId: string) => {
    const { elements, sheet, pushToast } = useBuilder.getState();
    const source = elements.find((e) => e.id === elementId);
    if (!source || source.type !== "image") return;
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
      const res = await nestInWorker({
        items: specsToItems([spec]),
        sheetWidth: sheet.widthIn,
        sheetHeight: sheet.heightIn,
        options: { ...nestOptions(), allowRotation: false },
        obstacles: obstaclesFrom(elements),
      });
      const els: CanvasElement[] = res.placements.map((p) => ({
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
      store.pushToast(
        "success",
        `Filled the sheet with ${els.length} more cop${els.length === 1 ? "y" : "ies"}`
      );
    } catch (err) {
      reportError(err, "Auto Fill failed");
    } finally {
      setBusy(false);
    }
  }, []);

  return { placeAssets, autoBuild, autoFill, busy };
}

// ---------------------------------------------------------------------------
// shared commit + error helpers
// ---------------------------------------------------------------------------
function commitPacked(
  packed: PackedSheet[],
  specByAsset: Map<string, PlacementSpec>,
  existing: CanvasElement[],
  fixedActiveHeight: number | undefined,
  unplaceableCount: number
) {
  const store = useBuilder.getState();
  if (packed.length === 0) {
    store.pushToast("warning", "Nothing could be placed — the designs are larger than a sheet.");
    return;
  }

  const activeEls = [
    ...existing,
    ...placementsToElements(packed[0].placements, specByAsset),
  ];
  const activeHeight = fixedActiveHeight ?? packed[0].heightIn;
  const extra: SheetBuild[] = packed.slice(1).map((s) => ({
    heightIn: s.heightIn,
    elements: placementsToElements(s.placements, specByAsset),
  }));

  store.commitBuild(activeEls, activeHeight, extra);

  const placedCount = packed.reduce((n, s) => n + s.placements.length, 0);
  const sheetWord = packed.length === 1 ? "sheet" : "sheets";
  if (unplaceableCount > 0) {
    store.pushToast(
      "warning",
      `Placed ${placedCount} designs across ${packed.length} ${sheetWord}; ${unplaceableCount} could not fit even at ${MAX_SHEET_IN}".`
    );
  } else {
    store.pushToast(
      "success",
      `Placed ${placedCount} designs across ${packed.length} ${sheetWord}.`
    );
  }
}

function reportError(err: unknown, fallback: string) {
  useBuilder
    .getState()
    .pushToast("error", err instanceof Error ? err.message : fallback);
}

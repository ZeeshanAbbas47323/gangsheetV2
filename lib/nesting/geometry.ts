import type { CanvasElement } from "../types";
import { elementAABB } from "../units";
import type { ObstacleRect } from "./types";

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsIntersect(a: FreeRect, b: FreeRect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function rectContains(outer: FreeRect, inner: FreeRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * Subtract an obstacle from a free rect, returning the up-to-4 remaining
 * sub-rects (guillotine subtraction).
 */
export function subtractRect(free: FreeRect, hole: FreeRect): FreeRect[] {
  if (!rectsIntersect(free, hole)) return [free];
  const out: FreeRect[] = [];
  // left strip
  if (hole.x > free.x) {
    out.push({ x: free.x, y: free.y, w: hole.x - free.x, h: free.h });
  }
  // right strip
  if (hole.x + hole.w < free.x + free.w) {
    out.push({
      x: hole.x + hole.w,
      y: free.y,
      w: free.x + free.w - (hole.x + hole.w),
      h: free.h,
    });
  }
  // top strip
  if (hole.y > free.y) {
    out.push({ x: free.x, y: free.y, w: free.w, h: hole.y - free.y });
  }
  // bottom strip
  if (hole.y + hole.h < free.y + free.h) {
    out.push({
      x: free.x,
      y: hole.y + hole.h,
      w: free.w,
      h: free.y + free.h - (hole.y + hole.h),
    });
  }
  return out;
}

/** Initial free-rect set: the bin interior minus all obstacles. */
export function freeRectsForBin(
  width: number,
  height: number,
  obstacles: ObstacleRect[]
): FreeRect[] {
  let free: FreeRect[] = [{ x: 0, y: 0, w: width, h: height }];
  for (const ob of obstacles) {
    const hole: FreeRect = {
      x: ob.left,
      y: ob.top,
      w: ob.right - ob.left,
      h: ob.bottom - ob.top,
    };
    free = free.flatMap((f) => subtractRect(f, hole));
  }
  return pruneContained(free);
}

export function pruneContained(rects: FreeRect[]): FreeRect[] {
  const out: FreeRect[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.w <= 1e-9 || r.h <= 1e-9) continue;
    let contained = false;
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue;
      if (rectContains(rects[j], r) && !(rectContains(r, rects[j]) && j > i)) {
        contained = true;
        break;
      }
    }
    if (!contained) out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Oriented-box collision (rotated elements) for real-time overlap detection
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

function obbCorners(el: CanvasElement): Pt[] {
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = el.widthIn / 2;
  const hh = el.heightIn / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({
    x: el.x + p.x * cos - p.y * sin,
    y: el.y + p.x * sin + p.y * cos,
  }));
}

/** Separating-axis test between two oriented boxes. */
function obbsIntersect(a: Pt[], b: Pt[]): boolean {
  for (const corners of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const p1 = corners[i];
      const p2 = corners[i + 1];
      // axis normal to this edge
      const ax = p2.y - p1.y;
      const ay = p1.x - p2.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of a) {
        const proj = p.x * ax + p.y * ay;
        minA = Math.min(minA, proj);
        maxA = Math.max(maxA, proj);
      }
      for (const p of b) {
        const proj = p.x * ax + p.y * ay;
        minB = Math.min(minB, proj);
        maxB = Math.max(maxB, proj);
      }
      if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
    }
  }
  return true;
}

/**
 * Ids of all elements overlapping at least one other element.
 * Sweep-line broadphase on AABBs, SAT narrowphase for rotated boxes.
 */
export function findOverlaps(elements: CanvasElement[]): Set<string> {
  const visible = elements.filter((e) => e.visible);
  const boxes = visible.map((e) => ({
    el: e,
    aabb: elementAABB(e),
    corners: null as Pt[] | null,
  }));
  boxes.sort((a, b) => a.aabb.left - b.aabb.left);

  const overlapping = new Set<string>();
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (b.aabb.left >= a.aabb.right) break; // sweep cutoff
      if (b.aabb.top >= a.aabb.bottom || b.aabb.bottom <= a.aabb.top) continue;
      a.corners ??= obbCorners(a.el);
      b.corners ??= obbCorners(b.el);
      if (obbsIntersect(a.corners, b.corners)) {
        overlapping.add(a.el.id);
        overlapping.add(b.el.id);
      }
    }
  }
  return overlapping;
}

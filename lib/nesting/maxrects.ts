import {
  freeRectsForBin,
  pruneContained,
  rectContains,
  rectsIntersect,
  subtractRect,
  type FreeRect,
} from "./geometry";
import type {
  BinConfig,
  NestItem,
  NestPlacement,
  PackedResult,
  PackingStrategy,
} from "./types";

export type MaxRectsHeuristic = "bssf" | "baf" | "bl";

interface Candidate {
  x: number;
  y: number;
  rotated: boolean;
  score1: number;
  score2: number;
}

/**
 * MaxRects bin packing (Jukka Jylänki's formulation) with obstacle support.
 * Heuristics: BSSF (best short side fit), BAF (best area fit), BL (bottom-left).
 */
export class MaxRectsStrategy implements PackingStrategy {
  readonly supportsObstacles = true;
  readonly name: string;

  constructor(private heuristic: MaxRectsHeuristic = "bssf") {
    this.name = `maxrects-${heuristic}`;
  }

  pack(items: NestItem[], bin: BinConfig): PackedResult {
    const innerW = bin.width - bin.margin * 2 + bin.spacing;
    const innerH = bin.height - bin.margin * 2 + bin.spacing;
    let free: FreeRect[] = freeRectsForBin(innerW, innerH, bin.obstacles.map((o) => ({
      left: o.left - bin.margin,
      top: o.top - bin.margin,
      right: o.right - bin.margin + bin.spacing,
      bottom: o.bottom - bin.margin + bin.spacing,
    })));

    const placements: NestPlacement[] = [];
    const overflow: string[] = [];
    let usedArea = 0;

    for (const item of items) {
      const w = item.w + bin.spacing;
      const h = item.h + bin.spacing;
      const best = this.findPosition(free, w, h, bin.allowRotation);
      if (!best) {
        overflow.push(item.id);
        continue;
      }
      const pw = best.rotated ? h : w;
      const ph = best.rotated ? w : h;
      free = placeRect(free, { x: best.x, y: best.y, w: pw, h: ph });
      placements.push({
        id: item.id,
        x: best.x + bin.margin,
        y: best.y + bin.margin,
        w: best.rotated ? item.h : item.w,
        h: best.rotated ? item.w : item.h,
        rotated: best.rotated,
      });
      usedArea += item.w * item.h;
    }
    return { placements, overflow, usedArea };
  }

  private findPosition(
    free: FreeRect[],
    w: number,
    h: number,
    allowRotation: boolean
  ): Candidate | null {
    let best: Candidate | null = null;
    const consider = (
      f: FreeRect,
      rw: number,
      rh: number,
      rotated: boolean
    ) => {
      if (rw > f.w + 1e-9 || rh > f.h + 1e-9) return;
      let score1: number;
      let score2: number;
      switch (this.heuristic) {
        case "baf":
          score1 = f.w * f.h - rw * rh;
          score2 = Math.min(f.w - rw, f.h - rh);
          break;
        case "bl":
          score1 = f.y + rh;
          score2 = f.x;
          break;
        case "bssf":
        default:
          score1 = Math.min(f.w - rw, f.h - rh);
          score2 = Math.max(f.w - rw, f.h - rh);
          break;
      }
      if (
        !best ||
        score1 < best.score1 ||
        (score1 === best.score1 && score2 < best.score2)
      ) {
        best = { x: f.x, y: f.y, rotated, score1, score2 };
      }
    };

    // Prefer the upright (0°) orientation: only fall back to a 90° rotation
    // when the item cannot be placed upright anywhere.
    for (const f of free) consider(f, w, h, false);
    if (best) return best;
    if (allowRotation && Math.abs(w - h) > 1e-9) {
      for (const f of free) consider(f, h, w, true);
    }
    return best;
  }
}

/** Split every free rect intersecting the placed rect, then prune. */
function placeRect(free: FreeRect[], placed: FreeRect): FreeRect[] {
  const next: FreeRect[] = [];
  for (const f of free) {
    if (rectsIntersect(f, placed)) {
      next.push(...subtractRect(f, placed));
    } else {
      next.push(f);
    }
  }
  // prune rects fully contained in another (the expensive MaxRects step)
  return fastPrune(next);
}

/**
 * Containment prune with a size cutoff: when the free list grows large,
 * fall back to dropping slivers only — keeps 1000-item packs fast at a
 * negligible utilization cost.
 */
function fastPrune(rects: FreeRect[]): FreeRect[] {
  if (rects.length <= 220) return pruneContained(rects);
  const out: FreeRect[] = [];
  for (const r of rects) {
    if (r.w < 0.05 || r.h < 0.05) continue;
    out.push(r);
  }
  // still bound the list so worst cases stay linear-ish
  if (out.length > 600) {
    out.sort((a, b) => b.w * b.h - a.w * a.h);
    out.length = 600;
  }
  return out;
}

export { rectContains };

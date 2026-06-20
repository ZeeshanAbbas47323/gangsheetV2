import type {
  BinConfig,
  NestItem,
  NestPlacement,
  PackedResult,
  PackingStrategy,
} from "./types";

interface SkylineNode {
  x: number;
  y: number;
  w: number;
}

/**
 * Skyline bottom-left packing — very fast, great for large batches.
 * Does not support obstacles (the engine falls back to MaxRects when
 * locked elements are present).
 */
export class SkylineStrategy implements PackingStrategy {
  readonly name = "skyline-bl";
  readonly supportsObstacles = false;

  pack(items: NestItem[], bin: BinConfig): PackedResult {
    const innerW = bin.width - bin.margin * 2 + bin.spacing;
    const innerH = bin.height - bin.margin * 2 + bin.spacing;
    let skyline: SkylineNode[] = [{ x: 0, y: 0, w: innerW }];

    const placements: NestPlacement[] = [];
    const overflow: string[] = [];
    let usedArea = 0;

    for (const item of items) {
      const w = item.w + bin.spacing;
      const h = item.h + bin.spacing;
      let best: { x: number; y: number; rotated: boolean; index: number } | null =
        null;

      const tryFit = (rw: number, rh: number, rotated: boolean) => {
        for (let i = 0; i < skyline.length; i++) {
          const y = fitY(skyline, i, rw, innerW);
          if (y === null || y + rh > innerH + 1e-9) continue;
          if (
            !best ||
            y + rh < best.y + (best.rotated ? w : h) - 1e-9 ||
            (Math.abs(y + rh - (best.y + (best.rotated ? w : h))) < 1e-9 &&
              skyline[i].x < best.x)
          ) {
            best = { x: skyline[i].x, y, rotated, index: i };
          }
        }
      };

      // Prefer upright (0°); only try a 90° rotation if upright doesn't fit.
      tryFit(w, h, false);
      if (!best && bin.allowRotation && Math.abs(w - h) > 1e-9) tryFit(h, w, true);

      if (!best) {
        overflow.push(item.id);
        continue;
      }
      const b: { x: number; y: number; rotated: boolean; index: number } = best;
      const rw = b.rotated ? h : w;
      const rh = b.rotated ? w : h;
      skyline = addLevel(skyline, b.x, b.y + rh, rw);
      placements.push({
        id: item.id,
        x: b.x + bin.margin,
        y: b.y + bin.margin,
        w: b.rotated ? item.h : item.w,
        h: b.rotated ? item.w : item.h,
        rotated: b.rotated,
      });
      usedArea += item.w * item.h;
    }
    return { placements, overflow, usedArea };
  }
}

/** Lowest y at which a width-`w` item fits starting at skyline node `i`. */
function fitY(
  skyline: SkylineNode[],
  i: number,
  w: number,
  binW: number
): number | null {
  const x = skyline[i].x;
  if (x + w > binW + 1e-9) return null;
  let y = skyline[i].y;
  let remaining = w;
  let j = i;
  while (remaining > 1e-9) {
    if (j >= skyline.length) return null;
    y = Math.max(y, skyline[j].y);
    remaining -= skyline[j].w;
    j++;
  }
  return y;
}

/** Raise the skyline over [x, x+w) to height `top` and merge equal levels. */
function addLevel(
  skyline: SkylineNode[],
  x: number,
  top: number,
  w: number
): SkylineNode[] {
  const out: SkylineNode[] = [];
  const right = x + w;
  for (const node of skyline) {
    const nRight = node.x + node.w;
    if (nRight <= x + 1e-9 || node.x >= right - 1e-9) {
      out.push(node);
      continue;
    }
    if (node.x < x) out.push({ x: node.x, y: node.y, w: x - node.x });
    if (nRight > right) out.push({ x: right, y: node.y, w: nRight - right });
  }
  out.push({ x, y: top, w });
  out.sort((a, b) => a.x - b.x);
  // merge adjacent nodes at the same height
  const merged: SkylineNode[] = [];
  for (const node of out) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - node.y) < 1e-9) {
      last.w += node.w;
    } else {
      merged.push({ ...node });
    }
  }
  return merged;
}

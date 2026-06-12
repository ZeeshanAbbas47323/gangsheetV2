import { freeRectsForBin, type FreeRect } from "./geometry";
import type {
  BinConfig,
  NestItem,
  NestPlacement,
  PackedResult,
  PackingStrategy,
} from "./types";

/**
 * Guillotine packing with best-area-fit selection and shorter-axis splits.
 * Cheap and produces clean rectangular cut lines; used as one candidate in
 * maximum-utilization ensembles.
 */
export class GuillotineStrategy implements PackingStrategy {
  readonly name = "guillotine-baf";
  readonly supportsObstacles = true;

  pack(items: NestItem[], bin: BinConfig): PackedResult {
    const innerW = bin.width - bin.margin * 2 + bin.spacing;
    const innerH = bin.height - bin.margin * 2 + bin.spacing;
    const free: FreeRect[] = freeRectsForBin(
      innerW,
      innerH,
      bin.obstacles.map((o) => ({
        left: o.left - bin.margin,
        top: o.top - bin.margin,
        right: o.right - bin.margin + bin.spacing,
        bottom: o.bottom - bin.margin + bin.spacing,
      }))
    );

    const placements: NestPlacement[] = [];
    const overflow: string[] = [];
    let usedArea = 0;

    for (const item of items) {
      const w = item.w + bin.spacing;
      const h = item.h + bin.spacing;

      let bestIdx = -1;
      let bestRotated = false;
      let bestWaste = Infinity;
      for (let i = 0; i < free.length; i++) {
        const f = free[i];
        if (w <= f.w + 1e-9 && h <= f.h + 1e-9) {
          const waste = f.w * f.h - w * h;
          if (waste < bestWaste) {
            bestWaste = waste;
            bestIdx = i;
            bestRotated = false;
          }
        }
        if (
          bin.allowRotation &&
          Math.abs(w - h) > 1e-9 &&
          h <= f.w + 1e-9 &&
          w <= f.h + 1e-9
        ) {
          const waste = f.w * f.h - w * h;
          if (waste < bestWaste) {
            bestWaste = waste;
            bestIdx = i;
            bestRotated = true;
          }
        }
      }

      if (bestIdx === -1) {
        overflow.push(item.id);
        continue;
      }

      const f = free[bestIdx];
      const pw = bestRotated ? h : w;
      const ph = bestRotated ? w : h;
      placements.push({
        id: item.id,
        x: f.x + bin.margin,
        y: f.y + bin.margin,
        w: bestRotated ? item.h : item.w,
        h: bestRotated ? item.w : item.h,
        rotated: bestRotated,
      });
      usedArea += item.w * item.h;

      // split the chosen free rect along its shorter leftover axis
      free.splice(bestIdx, 1);
      const rightW = f.w - pw;
      const bottomH = f.h - ph;
      if (rightW < bottomH) {
        if (rightW > 1e-9) free.push({ x: f.x + pw, y: f.y, w: rightW, h: ph });
        if (bottomH > 1e-9)
          free.push({ x: f.x, y: f.y + ph, w: f.w, h: bottomH });
      } else {
        if (rightW > 1e-9)
          free.push({ x: f.x + pw, y: f.y, w: rightW, h: f.h });
        if (bottomH > 1e-9)
          free.push({ x: f.x, y: f.y + ph, w: pw, h: bottomH });
      }
    }
    return { placements, overflow, usedArea };
  }
}

import { GuillotineStrategy } from "./guillotine";
import { MaxRectsStrategy } from "./maxrects";
import { GridStrategy, RowStrategy } from "./rows";
import { SkylineStrategy } from "./skyline";
import type {
  BinConfig,
  NestItem,
  NestOptions,
  NestRequest,
  NestResult,
  ObstacleRect,
  PackedResult,
  PackingStrategy,
} from "./types";

type SortOrder = "area" | "height" | "width" | "maxside" | "perimeter";

function sortItems(items: NestItem[], order: SortOrder): NestItem[] {
  const sorted = [...items];
  const key = (i: NestItem): number => {
    switch (order) {
      case "height": return i.h;
      case "width": return i.w;
      case "maxside": return Math.max(i.w, i.h);
      case "perimeter": return i.w + i.h;
      case "area":
      default: return i.w * i.h;
    }
  };
  // primary: size desc; secondary: duplicate-hash grouping for coherent runs
  sorted.sort((a, b) => key(b) - key(a) || a.hash.localeCompare(b.hash));
  return sorted;
}

interface Attempt {
  strategy: PackingStrategy;
  order: SortOrder;
}

/** Strategy ensemble for a request. Larger batches get cheaper plans. */
function attemptsFor(
  options: NestOptions,
  itemCount: number,
  hasObstacles: boolean
): Attempt[] {
  if (options.mode === "grid") return [{ strategy: new GridStrategy(), order: "area" }];
  if (options.mode === "rows") return [{ strategy: new RowStrategy(), order: "height" }];

  // compact / production
  switch (options.optimization) {
    case "fast":
      return hasObstacles
        ? [{ strategy: new MaxRectsStrategy("bl"), order: "area" }]
        : [{ strategy: new SkylineStrategy(), order: "height" }];
    case "maximum": {
      // very large batches: a small ensemble that must keep skyline, which
      // outperforms list-capped MaxRects at this scale
      if (itemCount > 600) {
        const capped: Attempt[] = [
          { strategy: new MaxRectsStrategy("bssf"), order: "area" },
          { strategy: new GuillotineStrategy(), order: "area" },
        ];
        if (!hasObstacles) {
          capped.push({ strategy: new SkylineStrategy(), order: "height" });
        }
        return capped;
      }
      const attempts: Attempt[] = [
        { strategy: new MaxRectsStrategy("bssf"), order: "area" },
        { strategy: new MaxRectsStrategy("baf"), order: "area" },
        { strategy: new MaxRectsStrategy("bssf"), order: "height" },
        { strategy: new MaxRectsStrategy("bl"), order: "maxside" },
        { strategy: new GuillotineStrategy(), order: "area" },
      ];
      if (!hasObstacles) {
        attempts.push(
          { strategy: new SkylineStrategy(), order: "height" },
          { strategy: new SkylineStrategy(), order: "area" }
        );
      }
      return attempts;
    }
    case "balanced":
    default:
      if (!hasObstacles && itemCount > 400) {
        return [{ strategy: new SkylineStrategy(), order: "height" }];
      }
      return [
        { strategy: new MaxRectsStrategy("bssf"), order: "area" },
        ...(hasObstacles
          ? []
          : [{ strategy: new SkylineStrategy(), order: "height" } as Attempt]),
      ];
  }
}

function runAttempts(
  items: NestItem[],
  bin: BinConfig,
  attempts: Attempt[]
): { result: PackedResult; strategy: string } {
  let best: { result: PackedResult; strategy: string } | null = null;
  for (const attempt of attempts) {
    const result = attempt.strategy.pack(sortItems(items, attempt.order), bin);
    const better =
      !best ||
      result.overflow.length < best.result.overflow.length ||
      (result.overflow.length === best.result.overflow.length &&
        packedHeight(result) < packedHeight(best.result));
    if (better) best = { result, strategy: attempt.strategy.name };
    if (result.overflow.length === 0 && attempts.length === 1) break;
  }
  return best!;
}

function packedHeight(result: PackedResult): number {
  let max = 0;
  for (const p of result.placements) max = Math.max(max, p.y + p.h);
  return max;
}

function scaleItems(items: NestItem[], scale: number): NestItem[] {
  return items.map((i) => ({ ...i, w: i.w * scale, h: i.h * scale }));
}

function countRows(result: PackedResult): number {
  const tops = result.placements
    .map((p) => Math.round(p.y * 4) / 4)
    .sort((a, b) => a - b);
  let rows = 0;
  let lastTop = -Infinity;
  for (const t of tops) {
    if (t - lastTop > 0.24) {
      rows++;
      lastTop = t;
    }
  }
  return rows;
}

/** Main entry: pure + synchronous so it runs identically in a Web Worker. */
export function runNest(request: NestRequest): NestResult {
  const start = Date.now();
  const { items, sheetWidth, sheetHeight, options, obstacles } = request;

  const bin: BinConfig = {
    width: sheetWidth,
    height: sheetHeight,
    spacing: Math.max(0, options.spacing),
    margin: Math.max(0, options.margin),
    allowRotation: options.allowRotation,
    obstacles,
  };
  const attempts = attemptsFor(options, items.length, obstacles.length > 0);

  let { result, strategy } = runAttempts(items, bin, attempts);
  let appliedScale = 1;

  // Auto-scale: find the largest uniform scale (>= minScale) that fits all.
  if (result.overflow.length > 0 && options.allowScale && options.minScale < 1) {
    const fitsAt = (scale: number) =>
      runAttempts(scaleItems(items, scale), bin, attempts);

    const atMin = fitsAt(options.minScale);
    if (atMin.result.overflow.length === 0) {
      // binary search the highest scale that still fits everything
      let lo = options.minScale;
      let hi = 1;
      let best = atMin;
      let bestScale = options.minScale;
      for (let iter = 0; iter < 7; iter++) {
        const mid = (lo + hi) / 2;
        const attempt = fitsAt(mid);
        if (attempt.result.overflow.length === 0) {
          best = attempt;
          bestScale = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      result = best.result;
      strategy = best.strategy;
      appliedScale = bestScale;
    }
    // if even minScale overflows, keep the unscaled result + overflow queue
  }

  const printableArea =
    (sheetWidth - options.margin * 2) * (sheetHeight - options.margin * 2);
  const utilization = printableArea > 0 ? result.usedArea / printableArea : 0;

  return {
    placements: result.placements,
    overflowIds: result.overflow,
    stats: {
      utilization: Math.min(1, utilization),
      placed: result.placements.length,
      overflow: result.overflow.length,
      rows: countRows(result),
      scale: appliedScale,
      durationMs: Date.now() - start,
      strategy,
    },
  };
}

/**
 * Required sheet height (width fixed) to fit every item — powers the
 * one-click "extend sheet" overflow action.
 */
export function requiredSheetHeight(request: NestRequest): number {
  const tall = runNest({
    ...request,
    sheetHeight: 100000,
    options: { ...request.options, allowScale: false },
  });
  let maxBottom = 0;
  for (const p of tall.placements) maxBottom = Math.max(maxBottom, p.y + p.h);
  return maxBottom + request.options.margin;
}

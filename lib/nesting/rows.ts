import type {
  BinConfig,
  NestItem,
  NestPlacement,
  PackedResult,
  PackingStrategy,
} from "./types";

/**
 * Shelf/row packing: items flow left→right into rows whose height is the
 * tallest member. Predictable, DTF-cut-friendly layouts. Items should be
 * pre-sorted tallest-first by the engine for best results.
 */
export class RowStrategy implements PackingStrategy {
  readonly name = "rows";
  readonly supportsObstacles = false;

  pack(items: NestItem[], bin: BinConfig): PackedResult {
    const innerW = bin.width - bin.margin * 2 + bin.spacing;
    const innerH = bin.height - bin.margin * 2 + bin.spacing;

    const placements: NestPlacement[] = [];
    const overflow: string[] = [];
    let usedArea = 0;

    let cursorX = 0;
    let cursorY = 0;
    let rowH = 0;

    for (const item of items) {
      let w = item.w + bin.spacing;
      let h = item.h + bin.spacing;
      let rotated = false;
      // lay wide-short when rotation helps row density
      if (bin.allowRotation && h > w) {
        [w, h] = [h, w];
        rotated = true;
      }

      if (cursorX + w > innerW + 1e-9) {
        cursorX = 0;
        cursorY += rowH;
        rowH = 0;
      }
      if (w > innerW + 1e-9 || cursorY + h > innerH + 1e-9) {
        overflow.push(item.id);
        continue;
      }

      placements.push({
        id: item.id,
        x: cursorX + bin.margin,
        y: cursorY + bin.margin,
        w: rotated ? item.h : item.w,
        h: rotated ? item.w : item.h,
        rotated,
      });
      usedArea += item.w * item.h;
      cursorX += w;
      rowH = Math.max(rowH, h);
    }
    return { placements, overflow, usedArea };
  }
}

/**
 * Uniform grid: every cell is sized to the largest item (per duplicate-hash
 * group ordering); items are centered in their cells. Ideal for sheets of
 * identical transfers.
 */
export class GridStrategy implements PackingStrategy {
  readonly name = "grid";
  readonly supportsObstacles = false;

  pack(items: NestItem[], bin: BinConfig): PackedResult {
    if (items.length === 0) return { placements: [], overflow: [], usedArea: 0 };

    const innerW = bin.width - bin.margin * 2;
    const innerH = bin.height - bin.margin * 2;
    const cellW = Math.max(...items.map((i) => i.w));
    const cellH = Math.max(...items.map((i) => i.h));

    const cols = Math.max(
      1,
      Math.floor((innerW + bin.spacing) / (cellW + bin.spacing))
    );
    const rows = Math.max(
      1,
      Math.floor((innerH + bin.spacing) / (cellH + bin.spacing))
    );
    const capacity = cellW <= innerW && cellH <= innerH ? cols * rows : 0;

    const placements: NestPlacement[] = [];
    const overflow: string[] = [];
    let usedArea = 0;

    items.forEach((item, idx) => {
      if (idx >= capacity) {
        overflow.push(item.id);
        return;
      }
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      placements.push({
        id: item.id,
        // center the item inside its uniform cell
        x: bin.margin + col * (cellW + bin.spacing) + (cellW - item.w) / 2,
        y: bin.margin + row * (cellH + bin.spacing) + (cellH - item.h) / 2,
        w: item.w,
        h: item.h,
        rotated: false,
      });
      usedArea += item.w * item.h;
    });
    return { placements, overflow, usedArea };
  }
}

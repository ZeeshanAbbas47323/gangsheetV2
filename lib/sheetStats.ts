import type { Sheet } from "./types";
import { elementAABB } from "./units";

export interface SheetStats {
  widthIn: number;
  heightIn: number;
  area: number;
  usedArea: number;
  usedPct: number;
  unusedPct: number;
  designs: number;
  copies: number;
}

/**
 * Per-sheet utilization. "Designs" counts distinct artwork (unique image
 * assets + each text), "copies" counts every placed element instance.
 */
export function sheetStats(sheet: Sheet): SheetStats {
  const visible = sheet.elements.filter((e) => e.visible);
  const area = sheet.config.widthIn * sheet.config.heightIn;
  let usedArea = 0;
  const distinct = new Set<string>();
  for (const el of visible) {
    const b = elementAABB(el);
    usedArea += b.width * b.height;
    distinct.add(el.type === "image" ? `img:${el.assetId}` : `txt:${el.id}`);
  }
  const usedPct = area > 0 ? Math.min(1, usedArea / area) : 0;
  return {
    widthIn: sheet.config.widthIn,
    heightIn: sheet.config.heightIn,
    area,
    usedArea,
    usedPct,
    unusedPct: 1 - usedPct,
    designs: distinct.size,
    copies: visible.length,
  };
}

export interface ProjectTotals {
  sheetCount: number;
  /** Distinct image assets used across all sheets. */
  images: number;
  /** Total placed element instances across all sheets. */
  copies: number;
  /** Sum of sheet heights in inches. */
  printLengthIn: number;
  /** Total sheet material in square feet (width × height). */
  materialSqFt: number;
}

export function projectTotals(sheets: Sheet[]): ProjectTotals {
  const distinctImages = new Set<string>();
  let copies = 0;
  let printLengthIn = 0;
  let materialSqIn = 0;
  for (const sh of sheets) {
    printLengthIn += sh.config.heightIn;
    materialSqIn += sh.config.widthIn * sh.config.heightIn;
    for (const el of sh.elements) {
      if (!el.visible) continue;
      copies++;
      if (el.type === "image") distinctImages.add(el.assetId);
    }
  }
  return {
    sheetCount: sheets.length,
    images: distinctImages.size,
    copies,
    printLengthIn,
    materialSqFt: materialSqIn / 144,
  };
}

export function formatLengthFt(inches: number): string {
  const ft = Math.floor(inches / 12);
  const rem = Math.round(inches % 12);
  if (ft === 0) return `${Math.round(inches)}"`;
  return rem > 0 ? `${ft}' ${rem}"` : `${ft}'`;
}

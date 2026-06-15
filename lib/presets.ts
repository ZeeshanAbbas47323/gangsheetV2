import type { SheetConfig } from "./types";

/** DTF roll width — fixed for every sheet. */
export const SHEET_WIDTH_IN = 22.5;

/** Discrete sheet heights, 24"→300" in 12" steps. */
export const SHEET_HEIGHTS: number[] = Array.from(
  { length: (300 - 24) / 12 + 1 },
  (_, i) => 24 + i * 12
);

export const MIN_SHEET_IN = SHEET_HEIGHTS[0]; // 24
export const MAX_SHEET_IN = SHEET_HEIGHTS[SHEET_HEIGHTS.length - 1]; // 300

/** Smallest discrete height that holds `requiredIn`, capped at the maximum. */
export function smallestHeightFor(requiredIn: number): number {
  return (
    SHEET_HEIGHTS.find((h) => h >= requiredIn - 1e-6) ?? MAX_SHEET_IN
  );
}

/** Clamp/round any height to the nearest valid discrete size. */
export function normalizeHeight(heightIn: number): number {
  if (heightIn <= MIN_SHEET_IN) return MIN_SHEET_IN;
  if (heightIn >= MAX_SHEET_IN) return MAX_SHEET_IN;
  return smallestHeightFor(heightIn);
}

export const DEFAULT_SHEET: SheetConfig = {
  widthIn: SHEET_WIDTH_IN,
  heightIn: 36,
  dpi: 300,
  background: null,
  showBleed: false,
  showSafeZone: false,
  snapToGrid: false,
  snapToEdges: true,
  gridSizeIn: 0.5,
};

/** Bleed allowance drawn outside the trim line, in inches. */
export const BLEED_IN = 0.125;
/** Safe-zone inset from the trim line, in inches. */
export const SAFE_ZONE_IN = 0.25;

const PRICE_PER_SQ_IN = 0.014;
const MIN_SHEET_PRICE = 5;

export interface QuantityTier {
  minQty: number;
  discount: number;
}

export const QUANTITY_TIERS: QuantityTier[] = [
  { minQty: 25, discount: 0.15 },
  { minQty: 10, discount: 0.1 },
  { minQty: 5, discount: 0.05 },
];

export interface PriceBreakdown {
  unitPrice: number;
  discount: number;
  discountedUnitPrice: number;
  total: number;
}

export function calculatePrice(
  widthIn: number,
  heightIn: number,
  quantity: number
): PriceBreakdown {
  const area = widthIn * heightIn;
  const unitPrice = Math.max(MIN_SHEET_PRICE, area * PRICE_PER_SQ_IN);
  const tier = QUANTITY_TIERS.find((t) => quantity >= t.minQty);
  const discount = tier?.discount ?? 0;
  const discountedUnitPrice = unitPrice * (1 - discount);
  return {
    unitPrice,
    discount,
    discountedUnitPrice,
    total: discountedUnitPrice * quantity,
  };
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

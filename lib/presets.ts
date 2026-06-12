import type { SheetConfig } from "./types";

export interface SheetPreset {
  label: string;
  widthIn: number;
  heightIn: number;
}

export const SHEET_PRESETS: SheetPreset[] = [
  { label: '22" × 35"', widthIn: 22, heightIn: 35 },
  { label: '22" × 60"', widthIn: 22, heightIn: 60 },
  { label: '22" × 96"', widthIn: 22, heightIn: 96 },
  { label: '22" × 120"', widthIn: 22, heightIn: 120 },
];

export const MIN_SHEET_IN = 4;
export const MAX_SHEET_IN = 240;

export const DEFAULT_SHEET: SheetConfig = {
  widthIn: 22,
  heightIn: 35,
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

import type { CanvasElement, Unit } from "./types";

export const CM_PER_INCH = 2.54;

/** Convert a length in inches to the given display unit. */
export function fromInches(valueIn: number, unit: Unit, dpi: number): number {
  switch (unit) {
    case "in":
      return valueIn;
    case "cm":
      return valueIn * CM_PER_INCH;
    case "px":
      return valueIn * dpi;
  }
}

/** Convert a length in the given display unit back to inches. */
export function toInches(value: number, unit: Unit, dpi: number): number {
  switch (unit) {
    case "in":
      return value;
    case "cm":
      return value / CM_PER_INCH;
    case "px":
      return value / dpi;
  }
}

export function formatLength(valueIn: number, unit: Unit, dpi: number): string {
  const v = fromInches(valueIn, unit, dpi);
  const decimals = unit === "px" ? 0 : 2;
  return `${v.toFixed(decimals)}${unit === "px" ? "px" : ` ${unit}`}`;
}

export interface AABB {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/** Axis-aligned bounding box of a (possibly rotated) element, in inches. */
export function elementAABB(el: CanvasElement): AABB {
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (el.widthIn * cos + el.heightIn * sin) / 2;
  const halfH = (el.widthIn * sin + el.heightIn * cos) / 2;
  return {
    left: el.x - halfW,
    top: el.y - halfH,
    right: el.x + halfW,
    bottom: el.y + halfH,
    cx: el.x,
    cy: el.y,
    width: halfW * 2,
    height: halfH * 2,
  };
}

export function aabbsIntersect(a: AABB, b: AABB): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Effective print DPI for an element given its source pixel width. */
export function effectiveDpi(naturalWidth: number, widthIn: number): number {
  if (widthIn <= 0) return 0;
  return naturalWidth / widthIn;
}

export const LOW_DPI_THRESHOLD = 150;

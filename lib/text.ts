import type { TextElement } from "./types";

export interface FontDef {
  family: string;
  /** CSS stack used for rendering/measuring. */
  stack: string;
  /** Google Fonts family name to load, or null for system fonts. */
  google: string | null;
}

export const FONTS: FontDef[] = [
  { family: "Arial", stack: "Arial, sans-serif", google: null },
  { family: "Helvetica", stack: "Helvetica, Arial, sans-serif", google: null },
  { family: "Impact", stack: "Impact, Haettenschweiler, sans-serif", google: null },
  { family: "Montserrat", stack: "'Montserrat', sans-serif", google: "Montserrat:wght@400;600;700;800" },
  { family: "Roboto", stack: "'Roboto', sans-serif", google: "Roboto:wght@400;500;700;900" },
  { family: "Oswald", stack: "'Oswald', sans-serif", google: "Oswald:wght@400;500;700" },
  { family: "Bebas Neue", stack: "'Bebas Neue', sans-serif", google: "Bebas+Neue" },
  { family: "Poppins", stack: "'Poppins', sans-serif", google: "Poppins:wght@400;600;700;800" },
];

export const DEFAULT_FONT = "Montserrat";

export function fontStack(family: string): string {
  return FONTS.find((f) => f.family === family)?.stack ?? `'${family}', sans-serif`;
}

/** Google Fonts stylesheet URL covering every web font in the library. */
export function googleFontsHref(): string {
  const families = FONTS.filter((f) => f.google).map((f) => `family=${f.google}`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

const PT_PER_IN = 72;

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  return measureCtx;
}

export interface TextMetrics {
  widthIn: number;
  heightIn: number;
}

/**
 * Measure a text element's physical bounding box in inches. Font size is in
 * points, so 1pt → 1/72in; we measure at `fontSize` CSS px and divide by 72.
 * Falls back to a width estimate when no DOM canvas is available (SSR).
 */
export function measureText(
  t: Pick<
    TextElement,
    "text" | "fontFamily" | "fontSize" | "fontWeight" | "italic" | "letterSpacing" | "lineHeight"
  >
): TextMetrics {
  const lines = (t.text || " ").split("\n");
  const lineHeightIn = (t.fontSize * t.lineHeight) / PT_PER_IN;
  const heightIn = Math.max(lineHeightIn * lines.length, lineHeightIn);

  const c = ctx();
  if (!c) {
    // rough average glyph width ≈ 0.55em when we can't measure
    const longest = Math.max(...lines.map((l) => l.length), 1);
    const widthIn = (longest * t.fontSize * 0.55 + (longest - 1) * t.letterSpacing) / PT_PER_IN;
    return { widthIn: Math.max(0.1, widthIn), heightIn };
  }

  const style = t.italic ? "italic " : "";
  c.font = `${style}${t.fontWeight} ${t.fontSize}px ${fontStack(t.fontFamily)}`;
  let maxW = 0;
  for (const line of lines) {
    let w = c.measureText(line).width;
    if (t.letterSpacing) w += Math.max(0, line.length - 1) * t.letterSpacing;
    maxW = Math.max(maxW, w);
  }
  return { widthIn: Math.max(0.1, maxW / PT_PER_IN), heightIn };
}

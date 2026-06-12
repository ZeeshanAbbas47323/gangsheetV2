/** All linear units are inches unless noted otherwise. */

export interface NestItem {
  id: string;
  /** Axis-aligned bounding-box size of the artwork as it sits on the sheet. */
  w: number;
  h: number;
  /** Identity hash (asset + size) used for duplicate grouping. */
  hash: string;
}

export interface NestPlacement {
  id: string;
  /** Top-left of the placed bounding box. */
  x: number;
  y: number;
  /** Final placed size (post-scale, pre-rotation swap). */
  w: number;
  h: number;
  /** True when the packer rotated the item 90°. */
  rotated: boolean;
}

export interface ObstacleRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Bin geometry handed to a strategy. Items are pre-inflated by spacing. */
export interface BinConfig {
  width: number;
  height: number;
  /** Gap enforced between items. */
  spacing: number;
  /** Inset from every sheet edge (safe-zone aware). */
  margin: number;
  allowRotation: boolean;
  /** Fixed regions (locked elements) the packer must avoid. */
  obstacles: ObstacleRect[];
}

export interface PackedResult {
  placements: NestPlacement[];
  /** Ids that did not fit. */
  overflow: string[];
  /** Σ placed item area. */
  usedArea: number;
}

export interface PackingStrategy {
  readonly name: string;
  /** Obstacles unsupported by a strategy must be declared, not ignored. */
  readonly supportsObstacles: boolean;
  pack(items: NestItem[], bin: BinConfig): PackedResult;
}

export type ArrangeMode = "compact" | "grid" | "rows" | "production";
export type OptimizationMode = "fast" | "balanced" | "maximum";

export interface NestOptions {
  mode: ArrangeMode;
  optimization: OptimizationMode;
  allowRotation: boolean;
  /** Gap between items, inches. */
  spacing: number;
  /** Inset from sheet edges, inches. */
  margin: number;
  allowScale: boolean;
  /** 0..1 — lowest uniform scale auto-scaling may apply. */
  minScale: number;
}

export interface NestStats {
  /** 0..1 of printable area covered by artwork. */
  utilization: number;
  placed: number;
  overflow: number;
  /** Distinct horizontal bands occupied (approximate for free-form packs). */
  rows: number;
  /** Uniform scale that was applied (1 = none). */
  scale: number;
  durationMs: number;
  strategy: string;
}

export interface NestResult {
  placements: NestPlacement[];
  overflowIds: string[];
  stats: NestStats;
}

export interface NestRequest {
  items: NestItem[];
  sheetWidth: number;
  sheetHeight: number;
  options: NestOptions;
  obstacles: ObstacleRect[];
}

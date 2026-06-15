export type Unit = "in" | "cm" | "px";

export type Dpi = 150 | 300;

export interface SheetConfig {
  /** Physical sheet width in inches. */
  widthIn: number;
  /** Physical sheet height in inches. */
  heightIn: number;
  dpi: Dpi;
  /** null = transparent (checkerboard preview). */
  background: string | null;
  showBleed: boolean;
  showSafeZone: boolean;
  snapToGrid: boolean;
  snapToEdges: boolean;
  /** Grid cell size in inches. */
  gridSizeIn: number;
}

export interface LibraryAsset {
  id: string;
  name: string;
  /** Data URL of the original file. */
  src: string;
  /** Natural pixel dimensions of the source image. */
  naturalWidth: number;
  naturalHeight: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
  /** Source resolution from file metadata; DTF default 300 when absent. */
  dpi?: number;
  /** Set after a successful background-removal pass. */
  bgRemoved?: boolean;
  /** Set after a successful upscale pass. */
  upscaled?: boolean;
  /** Set after a successful (client-side canvas) crop. */
  cropped?: boolean;
  /** Set after a successful ClipDrop remove-text pass. */
  textRemoved?: boolean;
}

// UPDATED: ClipDrop server-side ops (crop is handled client-side, not here).
export type ImageToolOp = "remove-bg" | "upscale" | "remove-text";

/** Per-asset size/quantity chosen in the pre-placement modal. */
export interface PlacementSpec {
  assetId: string;
  widthIn: number;
  heightIn: number;
  quantity: number;
}

/** Geometry + behaviour shared by every element type on a sheet. */
export interface BaseElement {
  id: string;
  name: string;
  /** Center position on the sheet, in inches. */
  x: number;
  y: number;
  /** Axis-aligned physical size in inches (the transform box). */
  widthIn: number;
  heightIn: number;
  /** Degrees, clockwise. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** 0..1 */
  opacity: number;
  locked: boolean;
  visible: boolean;
}

export interface ImageElement extends BaseElement {
  type: "image";
  assetId: string;
}

export type TextAlign = "left" | "center" | "right";

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  /** Font size in points (1pt = 1/72 inch). */
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  /** Fill colour. */
  color: string;
  /** Outline/stroke colour. */
  outlineColor: string;
  /** Outline width in points; 0 = no outline. */
  outlineWidth: number;
  /** Extra letter spacing in points. */
  letterSpacing: number;
  /** Line height multiplier. */
  lineHeight: number;
}

export type CanvasElement = ImageElement | TextElement;

export function isImageElement(el: CanvasElement): el is ImageElement {
  return el.type === "image";
}

export function isTextElement(el: CanvasElement): el is TextElement {
  return el.type === "text";
}

/** One gang sheet: its own configuration and stack of elements. */
export interface Sheet {
  id: string;
  name: string;
  config: SheetConfig;
  elements: CanvasElement[];
}

export type AlignType =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "centerY"
  | "bottom";

export interface Toast {
  id: string;
  kind: "success" | "error" | "warning" | "info";
  message: string;
}

export interface UploadProgress {
  id: string;
  fileName: string;
  status: "processing" | "done" | "error";
  error?: string;
}

export type ExportFormat = "png" | "pdf";

export type ExportStage =
  | "queued"
  | "preparing"
  | "rendering"
  | "encoding"
  | "done"
  | "error";

export interface ExportJob {
  id: string;
  format: ExportFormat;
  dpi: number;
  fileName: string;
  stage: ExportStage;
  /** 0..100 */
  progress: number;
  error?: string;
}

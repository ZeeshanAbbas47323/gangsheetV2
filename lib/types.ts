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
}

export interface ImageElement {
  id: string;
  type: "image";
  assetId: string;
  name: string;
  /** Center position on the sheet, in inches. */
  x: number;
  y: number;
  /** Physical size in inches. */
  widthIn: number;
  heightIn: number;
  /** Degrees. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** 0..1 */
  opacity: number;
  locked: boolean;
  visible: boolean;
}

export type CanvasElement = ImageElement;

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

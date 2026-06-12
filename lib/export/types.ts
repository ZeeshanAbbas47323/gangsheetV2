import type { CanvasElement, LibraryAsset, SheetConfig } from "../types";

export interface ExportSettings {
  format: "png" | "pdf";
  dpi: number;
  /** PDF: draw registration/crop marks outside the trim box. */
  cropMarks: boolean;
  /** PDF: extend the page by the bleed allowance. */
  includeBleed: boolean;
}

export interface ExportContext {
  elements: CanvasElement[];
  assets: LibraryAsset[];
  sheet: SheetConfig;
}

export type ProgressCallback = (
  stage: "preparing" | "rendering" | "encoding",
  /** overall 0..100 */
  progress: number
) => void;

export class ExportError extends Error {
  constructor(
    message: string,
    public readonly suggestion?: string
  ) {
    super(message);
  }
}

export interface QualityIssue {
  severity: "error" | "warning";
  code:
    | "missing-asset"
    | "low-dpi"
    | "overlap"
    | "out-of-bounds"
    | "empty-sheet";
  message: string;
}

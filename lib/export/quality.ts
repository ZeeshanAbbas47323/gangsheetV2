import { findOverlaps } from "../nesting/geometry";
import type { CanvasElement, LibraryAsset, SheetConfig } from "../types";
import { effectiveDpi, elementAABB, LOW_DPI_THRESHOLD } from "../units";
import type { QualityIssue } from "./types";

export function runQualityChecks(
  elements: CanvasElement[],
  assets: LibraryAsset[],
  sheet: SheetConfig
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const visible = elements.filter((e) => e.visible);

  if (visible.length === 0) {
    issues.push({
      severity: "error",
      code: "empty-sheet",
      message: "The sheet has no visible designs to export.",
    });
    return issues;
  }

  const missing = visible.filter(
    (e) => !assets.some((a) => a.id === e.assetId)
  );
  if (missing.length > 0) {
    issues.push({
      severity: "error",
      code: "missing-asset",
      message: `${missing.length} design${missing.length === 1 ? " is" : "s are"} missing their source image.`,
    });
  }

  const lowDpi = visible.filter((e) => {
    const asset = assets.find((a) => a.id === e.assetId);
    return asset && effectiveDpi(asset.naturalWidth, e.widthIn) < LOW_DPI_THRESHOLD;
  });
  if (lowDpi.length > 0) {
    issues.push({
      severity: "warning",
      code: "low-dpi",
      message: `${lowDpi.length} design${lowDpi.length === 1 ? " prints" : "s print"} below ${LOW_DPI_THRESHOLD} DPI at the current size.`,
    });
  }

  const overlapping = findOverlaps(visible);
  if (overlapping.size > 0) {
    issues.push({
      severity: "warning",
      code: "overlap",
      message: `${overlapping.size} designs overlap each other.`,
    });
  }

  const outOfBounds = visible.filter((e) => {
    const box = elementAABB(e);
    return (
      box.left < -1e-6 ||
      box.top < -1e-6 ||
      box.right > sheet.widthIn + 1e-6 ||
      box.bottom > sheet.heightIn + 1e-6
    );
  });
  if (outOfBounds.length > 0) {
    issues.push({
      severity: "warning",
      code: "out-of-bounds",
      message: `${outOfBounds.length} design${outOfBounds.length === 1 ? " extends" : "s extend"} past the sheet edge and will be clipped.`,
    });
  }

  return issues;
}

/** Rough output size estimate shown in the export preview. */
export function estimateFileSize(
  format: "png" | "pdf",
  dpi: number,
  sheet: SheetConfig,
  elements: CanvasElement[],
  assets: LibraryAsset[]
): number {
  if (format === "png") {
    // empirical PNG compression on transparent gang sheets ≈ 15–25% of raw RGBA
    const px = sheet.widthIn * dpi * sheet.heightIn * dpi;
    return px * 4 * 0.18;
  }
  const usedAssetIds = new Set(
    elements.filter((e) => e.visible).map((e) => e.assetId)
  );
  let bytes = 60_000; // structure overhead
  for (const a of assets) {
    if (usedAssetIds.has(a.id)) bytes += a.sizeBytes * 1.05;
  }
  return bytes;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

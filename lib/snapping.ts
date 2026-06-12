import type { AABB } from "./units";

export interface SnapGuide {
  orientation: "v" | "h";
  /** Position in inches (x for vertical guides, y for horizontal). */
  position: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

interface Candidate {
  delta: number;
  line: number;
  fromGrid: boolean;
}

function bestCandidate(
  edges: number[],
  lines: number[],
  gridSize: number | null,
  threshold: number
): Candidate | null {
  let best: Candidate | null = null;
  for (const edge of edges) {
    for (const line of lines) {
      const delta = line - edge;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, line, fromGrid: false };
      }
    }
    if (gridSize) {
      const line = Math.round(edge / gridSize) * gridSize;
      const delta = line - edge;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, line, fromGrid: true };
      }
    }
  }
  return best;
}

/**
 * Compute the snap adjustment for a moving bounding box.
 *
 * @param moving       AABB of the dragged selection, in inches.
 * @param verticalLines   x positions of snap targets (sheet/element edges & centers).
 * @param horizontalLines y positions of snap targets.
 * @param gridSize     grid cell in inches, or null when grid snap is off.
 * @param threshold    max snap distance in inches (derived from screen px / scale).
 */
export function computeSnap(
  moving: AABB,
  verticalLines: number[],
  horizontalLines: number[],
  gridSize: number | null,
  threshold: number
): SnapResult {
  const xEdges = [moving.left, moving.cx, moving.right];
  const yEdges = [moving.top, moving.cy, moving.bottom];

  const vBest = bestCandidate(xEdges, verticalLines, gridSize, threshold);
  const hBest = bestCandidate(yEdges, horizontalLines, gridSize, threshold);

  const guides: SnapGuide[] = [];
  if (vBest && !vBest.fromGrid) guides.push({ orientation: "v", position: vBest.line });
  if (hBest && !hBest.fromGrid) guides.push({ orientation: "h", position: hBest.line });

  return { dx: vBest?.delta ?? 0, dy: hBest?.delta ?? 0, guides };
}

/** Snap target lines contributed by the sheet itself: edges + center. */
export function sheetSnapLines(widthIn: number, heightIn: number) {
  return {
    vertical: [0, widthIn / 2, widthIn],
    horizontal: [0, heightIn / 2, heightIn],
  };
}

/** Snap target lines contributed by one element's AABB: edges + center. */
export function elementSnapLines(box: AABB) {
  return {
    vertical: [box.left, box.cx, box.right],
    horizontal: [box.top, box.cy, box.bottom],
  };
}

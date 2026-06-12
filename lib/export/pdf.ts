import { degrees, PDFDocument, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { BLEED_IN } from "../presets";
import type { LibraryAsset } from "../types";
import { rasterizeAsset } from "./render";
import {
  ExportError,
  type ExportContext,
  type ProgressCallback,
} from "./types";

const PT_PER_IN = 72;
/** Distance from trim edge to the start of a crop mark, and mark length. */
const MARK_GAP_IN = 0.0625;
const MARK_LEN_IN = 0.25;

interface PdfOptions {
  dpi: number;
  cropMarks: boolean;
  includeBleed: boolean;
}

async function dataUrlBytes(src: string): Promise<Uint8Array> {
  const res = await fetch(src);
  return new Uint8Array(await res.arrayBuffer());
}

/** Embed an asset, rasterizing when PDF can't take the source directly. */
async function embedAsset(
  doc: PDFDocument,
  asset: LibraryAsset,
  flipX: boolean,
  flipY: boolean,
  targetPx: { w: number; h: number }
): Promise<PDFImage> {
  const direct =
    !flipX &&
    !flipY &&
    (asset.mimeType === "image/png" || asset.mimeType === "image/jpeg");
  if (direct) {
    const bytes = await dataUrlBytes(asset.src);
    return asset.mimeType === "image/png"
      ? doc.embedPng(bytes)
      : doc.embedJpg(bytes);
  }
  const bytes = await rasterizeAsset(asset, targetPx.w, targetPx.h, flipX, flipY);
  return doc.embedPng(bytes);
}

function drawCropMarks(
  page: PDFPage,
  trimX: number,
  trimY: number,
  trimW: number,
  trimH: number
): void {
  const gap = MARK_GAP_IN * PT_PER_IN;
  const len = MARK_LEN_IN * PT_PER_IN;
  const corners = [
    { x: trimX, y: trimY, dx: -1, dy: -1 }, // bottom-left
    { x: trimX + trimW, y: trimY, dx: 1, dy: -1 }, // bottom-right
    { x: trimX, y: trimY + trimH, dx: -1, dy: 1 }, // top-left
    { x: trimX + trimW, y: trimY + trimH, dx: 1, dy: 1 }, // top-right
  ];
  for (const c of corners) {
    // horizontal mark
    page.drawLine({
      start: { x: c.x + c.dx * gap, y: c.y },
      end: { x: c.x + c.dx * (gap + len), y: c.y },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    // vertical mark
    page.drawLine({
      start: { x: c.x, y: c.y + c.dy * gap },
      end: { x: c.x, y: c.y + c.dy * (gap + len) },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
  }
}

/**
 * Print-ready PDF: one page per sheet at exact physical size, original
 * PNG/JPG bytes embedded losslessly where possible, optional bleed box and
 * crop marks. (Color stays RGB; a CMYK pass belongs in a server-side RIP
 * step — the geometry here is already RIP-ready.)
 */
export async function exportPdf(
  ctx: ExportContext,
  options: PdfOptions,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const { elements, assets, sheet } = ctx;
  const visible = elements.filter((e) => e.visible);
  onProgress?.("preparing", 0);

  const doc = await PDFDocument.create();
  doc.setTitle(`Gang sheet ${sheet.widthIn}x${sheet.heightIn}`);
  doc.setCreator("Gangsheet Builder by ModFirst");

  const bleed = options.includeBleed ? BLEED_IN : 0;
  const markSpace = options.cropMarks ? MARK_GAP_IN + MARK_LEN_IN + 0.0625 : 0;
  const offsetIn = bleed + markSpace; // trim-box offset from page edge
  const pageW = (sheet.widthIn + offsetIn * 2) * PT_PER_IN;
  const pageH = (sheet.heightIn + offsetIn * 2) * PT_PER_IN;
  const page = doc.addPage([pageW, pageH]);

  // background fills trim + bleed
  if (sheet.background) {
    const m = markSpace * PT_PER_IN;
    const hex = sheet.background.replace("#", "");
    const n = parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
    page.drawRectangle({
      x: m,
      y: m,
      width: pageW - m * 2,
      height: pageH - m * 2,
      color: rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255),
    });
  }

  // embed unique (asset, flip) combinations once
  const cache = new Map<string, PDFImage>();
  let done = 0;
  for (const el of visible) {
    const asset = assets.find((a) => a.id === el.assetId);
    if (!asset) continue;
    const key = `${asset.id}|${el.flipX}|${el.flipY}`;
    if (!cache.has(key)) {
      try {
        cache.set(
          key,
          await embedAsset(doc, asset, el.flipX, el.flipY, {
            w: el.widthIn * options.dpi,
            h: el.heightIn * options.dpi,
          })
        );
      } catch (err) {
        throw err instanceof ExportError
          ? err
          : new ExportError(`Could not embed "${asset.name}" into the PDF.`);
      }
    }
    done++;
    onProgress?.("preparing", (done / visible.length) * 40);
  }

  onProgress?.("rendering", 40);
  for (let i = 0; i < visible.length; i++) {
    const el = visible[i];
    const image = cache.get(`${el.assetId}|${el.flipX}|${el.flipY}`);
    if (!image) continue;

    const w = el.widthIn * PT_PER_IN;
    const h = el.heightIn * PT_PER_IN;
    // element center in PDF coordinates (y-up)
    const cx = (offsetIn + el.x) * PT_PER_IN;
    const cy = (offsetIn + (sheet.heightIn - el.y)) * PT_PER_IN;
    // canvas rotation is clockwise; PDF rotation is counterclockwise
    const theta = (-el.rotation * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // pdf-lib rotates around the drawn image's bottom-left anchor
    const ax = cx - ((w / 2) * cos - (h / 2) * sin);
    const ay = cy - ((w / 2) * sin + (h / 2) * cos);

    page.drawImage(image, {
      x: ax,
      y: ay,
      width: w,
      height: h,
      rotate: degrees(-el.rotation),
      opacity: el.opacity,
    });
    onProgress?.("rendering", 40 + ((i + 1) / visible.length) * 40);
  }

  if (options.cropMarks) {
    drawCropMarks(
      page,
      offsetIn * PT_PER_IN,
      offsetIn * PT_PER_IN,
      sheet.widthIn * PT_PER_IN,
      sheet.heightIn * PT_PER_IN
    );
  }

  onProgress?.("encoding", 85);
  const bytes = await doc.save();
  onProgress?.("encoding", 100);
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

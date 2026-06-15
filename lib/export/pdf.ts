import { degrees, PDFDocument, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { BLEED_IN } from "../presets";
import type { LibraryAsset } from "../types";
import { rasterizeAsset, rasterizeTextElement } from "./render";
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

// UPDATED: draw one sheet onto its own PDF page. Extracted so a single
// document can hold many pages (one per gang sheet).
async function addSheetPage(
  doc: PDFDocument,
  ctx: ExportContext,
  options: PdfOptions,
  onProgress: ((fraction: number) => void) | undefined
): Promise<void> {
  const { elements, assets, sheet } = ctx;
  const visible = elements.filter((e) => e.visible);

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

  // embed unique image (asset, flip) combinations once; rasterize text per element
  const cache = new Map<string, PDFImage>();
  const textImages = new Map<string, PDFImage>();
  let done = 0;
  for (const el of visible) {
    if (el.type === "text") {
      try {
        textImages.set(
          el.id,
          await doc.embedPng(await rasterizeTextElement(el, options.dpi))
        );
      } catch (err) {
        throw err instanceof ExportError
          ? err
          : new ExportError(`Could not embed text "${el.text}" into the PDF.`);
      }
      done++;
      continue;
    }
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
    onProgress?.((done / Math.max(1, visible.length)) * 0.5);
  }

  for (let i = 0; i < visible.length; i++) {
    const el = visible[i];
    const image =
      el.type === "text"
        ? textImages.get(el.id)
        : cache.get(`${el.assetId}|${el.flipX}|${el.flipY}`);
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
    onProgress?.(0.5 + ((i + 1) / Math.max(1, visible.length)) * 0.5);
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
}

/**
 * Print-ready PDF for one or more sheets: one page per sheet at exact physical
 * size, original PNG/JPG bytes embedded losslessly where possible, optional
 * bleed box and crop marks. (Color stays RGB; a CMYK pass belongs in a
 * server-side RIP step — the geometry here is already RIP-ready.)
 *
 * UPDATED: accepts an array of sheet contexts so every gang sheet in the
 * project is exported together as a multi-page document.
 */
export async function exportPdf(
  contexts: ExportContext[],
  options: PdfOptions,
  onProgress?: ProgressCallback
): Promise<Blob> {
  if (contexts.length === 0) {
    throw new ExportError("There are no sheets to export.");
  }
  onProgress?.("preparing", 0);

  const doc = await PDFDocument.create();
  doc.setTitle(
    contexts.length === 1
      ? `Gang sheet ${contexts[0].sheet.widthIn}x${contexts[0].sheet.heightIn}`
      : `Gang sheets (${contexts.length} pages)`
  );
  doc.setCreator("Gangsheet Builder by ModFirst");

  // Render each sheet to its own page, mapping per-page progress onto the
  // overall 0→80% rendering span.
  for (let i = 0; i < contexts.length; i++) {
    await addSheetPage(doc, contexts[i], options, (fraction) => {
      const overall = ((i + fraction) / contexts.length) * 80;
      onProgress?.(fraction < 0.5 ? "preparing" : "rendering", overall);
    });
  }

  onProgress?.("encoding", 85);
  const bytes = await doc.save();
  onProgress?.("encoding", 100);
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

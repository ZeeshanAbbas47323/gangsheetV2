#!/usr/bin/env python
"""Builds the Gangsheet Builder user-guide PDF from captured screenshots."""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image,
    Table, TableStyle, PageBreak, KeepTogether, ListFlowable, ListItem,
    HRFlowable,
)
from reportlab.pdfgen import canvas as canvas_mod
from PIL import Image as PILImage

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "screenshots")
OUT = os.path.join(HERE, "Gangsheet-Builder-User-Guide.pdf")

# ---- palette (matches the app) -------------------------------------------
ACCENT = colors.HexColor("#4f8ef7")
ACCENT_DK = colors.HexColor("#2f6fd6")
INK = colors.HexColor("#1d2127")
SUB = colors.HexColor("#5b6473")
LINE = colors.HexColor("#d9dee6")
SOFT = colors.HexColor("#f3f5f9")
DARKBG = colors.HexColor("#0d0f12")

PAGE_W, PAGE_H = letter
MARGIN = 0.85 * inch
CONTENT_W = PAGE_W - 2 * MARGIN

# ---- styles ---------------------------------------------------------------
styles = getSampleStyleSheet()


def style(name, **kw):
    kw.setdefault("parent", styles["Normal"])
    return ParagraphStyle(name, **kw)


H1 = style("H1", fontName="Helvetica-Bold", fontSize=20, textColor=INK,
           spaceBefore=4, spaceAfter=10, leading=24)
H2 = style("H2", fontName="Helvetica-Bold", fontSize=13.5, textColor=ACCENT_DK,
           spaceBefore=14, spaceAfter=6, leading=17)
BODY = style("Body", fontName="Helvetica", fontSize=10.5, textColor=INK,
             leading=16, spaceAfter=7, alignment=TA_LEFT)
BODY_SUB = style("BodySub", parent=BODY, textColor=SUB)
CAPTION = style("Caption", fontName="Helvetica-Oblique", fontSize=9,
                textColor=SUB, alignment=TA_CENTER, spaceBefore=5, spaceAfter=4)
BULLET = style("Bullet", fontName="Helvetica", fontSize=10.5, textColor=INK,
               leading=15)
STEP = style("Step", fontName="Helvetica", fontSize=10.5, textColor=INK,
             leading=15, leftIndent=2)
TOC_ITEM = style("Toc", fontName="Helvetica", fontSize=11, textColor=INK,
                 leading=20)
KBD = style("Kbd", fontName="Courier-Bold", fontSize=9, textColor=INK)
TBL = style("Tbl", fontName="Helvetica", fontSize=9.5, textColor=INK, leading=13)
LEAD = style("Lead", fontName="Helvetica", fontSize=12, textColor=SUB,
             leading=18, spaceAfter=10)


def framed_image(path, max_w=CONTENT_W, border=True):
    """Image scaled to width, with a thin border, kept on one piece."""
    iw, ih = PILImage.open(path).size
    w = max_w
    h = w * ih / iw
    # cap height so an image never overruns a page
    max_h = PAGE_H - 2 * MARGIN - 60
    if h > max_h:
        h = max_h
        w = h * iw / ih
    img = Image(path, width=w, height=h)
    if border:
        img.hAlign = "CENTER"
        t = Table([[img]], colWidths=[w])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.75, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        t.hAlign = "CENTER"
        return t
    return img


def figure(path, caption):
    return KeepTogether([framed_image(path), Paragraph(caption, CAPTION)])


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, BULLET), leftIndent=12, value="•") for t in items],
        bulletType="bullet", bulletColor=ACCENT, start="•",
        leftIndent=14, spaceBefore=2, spaceAfter=8,
    )


def steps(items):
    return ListFlowable(
        [ListItem(Paragraph(t, STEP), leftIndent=14) for t in items],
        bulletType="1", bulletFormat="%s.", bulletColor=ACCENT_DK,
        leftIndent=18, spaceBefore=2, spaceAfter=8,
    )


# ---- page furniture -------------------------------------------------------
def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(DARKBG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # accent band
    canvas.setFillColor(ACCENT)
    canvas.rect(0, PAGE_H - 4.2 * inch, PAGE_W, 0.16 * inch, fill=1, stroke=0)
    canvas.restoreState()


def on_content(canvas, doc):
    canvas.saveState()
    # header rule
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.75)
    canvas.line(MARGIN, PAGE_H - MARGIN + 18, PAGE_W - MARGIN, PAGE_H - MARGIN + 18)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SUB)
    canvas.drawString(MARGIN, PAGE_H - MARGIN + 24, "Gangsheet Builder by ModFirst")
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN + 24, "User Guide")
    # footer
    canvas.line(MARGIN, MARGIN - 14, PAGE_W - MARGIN, MARGIN - 14)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SUB)
    canvas.drawString(MARGIN, MARGIN - 26, "© ModFirst")
    canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 26, "Page %d" % (doc.page - 1))
    canvas.restoreState()


# ---- document -------------------------------------------------------------
def build():
    doc = BaseDocTemplate(
        OUT, pagesize=letter,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
        title="Gangsheet Builder by ModFirst — User Guide",
        author="ModFirst",
    )
    frame = Frame(MARGIN, MARGIN, CONTENT_W, PAGE_H - 2 * MARGIN, id="body")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame], onPage=on_cover),
        PageTemplate(id="content", frames=[frame], onPage=on_content),
    ])

    s = []  # story

    # ---------------- COVER ----------------
    def white(**k):
        k.setdefault("textColor", colors.white)
        return style("w", **k)
    s.append(Spacer(1, 1.6 * inch))
    s.append(Paragraph("Gangsheet Builder",
             white(fontName="Helvetica-Bold", fontSize=40, leading=44)))
    s.append(Paragraph("by ModFirst",
             white(fontName="Helvetica", fontSize=18, leading=24,
                   textColor=colors.HexColor("#9fb6df"))))
    s.append(Spacer(1, 0.3 * inch))
    s.append(Paragraph("Complete User Guide",
             white(fontName="Helvetica-Bold", fontSize=15,
                   textColor=ACCENT)))
    s.append(Spacer(1, 0.25 * inch))
    s.append(Paragraph(
        "Design, nest, and export print-ready DTF gang sheets — right in your browser.",
        white(fontName="Helvetica", fontSize=11.5, leading=17,
              textColor=colors.HexColor("#c3ccda"))))
    s.append(Spacer(1, 0.45 * inch))
    s.append(framed_image(os.path.join(SHOTS, "03_nested_final.png"),
                          max_w=CONTENT_W, border=False))
    s.append(Spacer(1, 0.3 * inch))
    s.append(Paragraph("Version 1.0  ·  June 2026",
             white(fontName="Helvetica", fontSize=9.5,
                   textColor=colors.HexColor("#8b94a5"))))
    s.append(PageBreak())

    # ---------------- TOC ----------------
    s.append(Paragraph("Contents", H1))
    s.append(HRFlowable(width="100%", color=LINE, thickness=0.75,
                        spaceBefore=2, spaceAfter=12))
    toc = [
        ("1", "Welcome", "What the builder does and who it's for"),
        ("2", "The Workspace", "A tour of the interface"),
        ("3", "Adding Images & Setting Size", "Upload, DPI, dimensions, quantity"),
        ("4", "Auto Build & Auto Fill", "One-click sheet generation"),
        ("5", "Smart Auto-Nest", "Packing modes and utilization"),
        ("6", "Editing & Arranging Designs", "The properties panel"),
        ("7", "Background Removal & Upscaling", "AI image tools"),
        ("8", "Overlap Detection", "Real-time collision warnings"),
        ("9", "Exporting Print-Ready Files", "PNG & PDF output"),
        ("10", "Keyboard Shortcuts", "Work faster"),
        ("11", "Tips & Troubleshooting", "Get the best results"),
    ]
    rows = [[Paragraph(f"<b>{n}</b>", TOC_ITEM),
             Paragraph(f"<b>{t}</b>  <font color='#5b6473'>— {d}</font>", TOC_ITEM)]
            for n, t, d in toc]
    tt = Table(rows, colWidths=[0.4 * inch, CONTENT_W - 0.4 * inch])
    tt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, SOFT),
    ]))
    s.append(tt)
    s.append(PageBreak())

    # ---------------- 1. WELCOME ----------------
    s.append(Paragraph("1 · Welcome", H1))
    s.append(Paragraph(
        "Gangsheet Builder by ModFirst is a browser-based tool for laying out "
        "<b>DTF (Direct-to-Film) gang sheets</b> — single print sheets packed with "
        "many designs. It is built for print shops and creators who need to fit as "
        "much artwork as possible onto a sheet, with zero wasted film and "
        "print-ready output.", LEAD))
    s.append(Paragraph("What you can do", H2))
    s.append(bullets([
        "Upload PNG, JPG, WEBP, or SVG artwork and set the exact physical print size of each design.",
        "Pack designs automatically with a smart nesting engine that minimises wasted sheet area.",
        "Generate a full sheet in one click with <b>Auto Build</b>, or flood the free space with <b>Auto Fill</b>.",
        "Clean up artwork with one-click <b>background removal</b> and <b>upscaling</b>.",
        "Catch problems early with live overlap detection and low-resolution warnings.",
        "Export pixel-accurate, transparent <b>PNG</b> or print-ready <b>PDF</b> at 150, 300, or 600 DPI.",
    ]))
    s.append(Paragraph("Everything is measured in real, physical units (inches), "
                       "so what you arrange on screen is exactly what prints.", BODY))
    s.append(PageBreak())

    # ---------------- 2. WORKSPACE ----------------
    s.append(Paragraph("2 · The Workspace", H1))
    s.append(Paragraph(
        "The builder is split into four areas. Open it from the home screen by "
        "clicking <b>Open the builder</b>.", BODY))
    s.append(figure(os.path.join(SHOTS, "01_overview_empty_final.png"),
                    "The builder workspace: image library (left), canvas with rulers (centre), tools panel (right)."))
    s.append(Paragraph("Layout at a glance", H2))
    s.append(bullets([
        "<b>Top toolbar</b> — undo/redo, zoom, measurement units, snapping toggles, duplicate/delete, and the <b>Export</b> button.",
        "<b>Image Library (left)</b> — your uploaded designs, with a drag-and-drop upload zone and per-image tools.",
        "<b>Canvas (centre)</b> — the gang sheet shown at true scale with rulers, a checkerboard for transparency, and pan/zoom.",
        "<b>Tools panel (right)</b> — Auto-Nest, sheet size and print settings, guides &amp; snapping, and a live price estimate.",
    ]))
    s.append(Paragraph(
        "Pan the canvas by holding <b>Space</b> and dragging (or middle-mouse drag); "
        "zoom with the mouse wheel. Press <b>?</b> at any time to see all keyboard shortcuts.",
        BODY))
    s.append(PageBreak())

    # ---------------- 3. ADDING IMAGES ----------------
    s.append(Paragraph("3 · Adding Images &amp; Setting Size", H1))
    s.append(Paragraph(
        "Drag image files onto the upload zone (or click <b>browse</b>). After "
        "uploading, the <b>Size &amp; quantity</b> window opens so you can set the "
        "real print dimensions before anything lands on the sheet.", BODY))
    s.append(figure(os.path.join(SHOTS, "02_placement_modal.png"),
                    "The Size & quantity window — set width, height, and number of copies for each design before placing."))
    s.append(Paragraph("How sizing works", H2))
    s.append(bullets([
        "The builder reads the <b>DPI from the file</b> when available and shows the resulting print size. If the file has no DPI, it assumes <b>300 DPI</b> (the DTF standard).",
        "Type a new <b>width</b> or <b>height</b> in inches. With the <b>lock</b> enabled, the aspect ratio is preserved automatically.",
        "Set a <b>quantity</b> to place several copies at once.",
        "A red warning appears if a design would print below <b>150 DPI</b> at the chosen size.",
    ]))
    s.append(Paragraph("Then choose how to place them:", BODY))
    s.append(bullets([
        "<b>Place on sheet</b> — nests the copies onto the current sheet, around anything already there.",
        "<b>Auto Build</b> — builds a complete sheet, extending its length to fit everything (see next section).",
    ]))
    s.append(Paragraph(
        "<i>Tip:</i> dragging a file directly onto the canvas skips this window and "
        "drops the image at its natural size where you release it.", BODY_SUB))
    s.append(PageBreak())

    # ---------------- 4. AUTO BUILD / FILL ----------------
    s.append(Paragraph("4 · Auto Build &amp; Auto Fill", H1))
    s.append(Paragraph("Auto Build", H2))
    s.append(Paragraph(
        "<b>Auto Build</b> turns a batch of designs into a finished sheet in one step. "
        "It keeps the sheet <b>width fixed</b> and extends the <b>height</b> only as far "
        "as needed to fit every copy, packing them tightly with your spacing rules.", BODY))
    s.append(steps([
        "Upload one or more designs and set each one's size and quantity.",
        "Click <b>Auto Build</b> in the Size &amp; quantity window.",
        "The sheet resizes and all copies are nested automatically — as a single undo step.",
    ]))
    s.append(Paragraph("Auto Fill", H2))
    s.append(Paragraph(
        "<b>Auto Fill</b> takes one selected design and floods the remaining free area "
        "of the current sheet with as many copies as will fit, respecting spacing. "
        "Select a design on the canvas, then click <b>Auto Fill sheet</b> in the "
        "properties panel.", BODY))
    s.append(bullets([
        "Copies inherit the look of the selected design (rotation, flips, opacity).",
        "Existing artwork is left untouched — only the empty space is filled.",
        "Both actions are fully covered by <b>Undo</b> (Ctrl+Z) and <b>Redo</b>.",
    ]))
    s.append(PageBreak())

    # ---------------- 5. AUTO-NEST ----------------
    s.append(Paragraph("5 · Smart Auto-Nest", H1))
    s.append(Paragraph(
        "The nesting engine packs designs to maximise sheet utilisation and minimise "
        "wasted film. Use <b>Nest all</b> to repack the whole sheet, or <b>Nest "
        "selected</b> to pack only the chosen designs around everything else.", BODY))
    s.append(figure(os.path.join(SHOTS, "03_nested_final.png"),
                    "A nested sheet. The Auto-Nest panel reports utilisation, placed count, and rows."))
    s.append(Paragraph("Arrangement modes", H2))
    s.append(bullets([
        "<b>Compact</b> — densest free-form packing for the most efficient use of film.",
        "<b>Rows</b> — even rows, the friendliest layout for cutting DTF transfers apart.",
        "<b>Grid</b> — uniform cells, ideal for sheets of identical designs.",
        "<b>Production</b> — runs a multi-pass search for the best achievable utilisation.",
    ]))
    s.append(Paragraph("Options &amp; results", H2))
    s.append(bullets([
        "<b>Effort</b> (Fast / Balanced / Maximum) trades speed for tighter packing.",
        "<b>Allow 90° rotation</b> lets the packer turn designs when it helps them fit.",
        "<b>Spacing</b> sets the minimum gap between designs.",
        "<b>Allow auto-scale to fit</b> shrinks designs uniformly (down to your minimum) when they would otherwise overflow — with a warning if it drops below 150 DPI.",
        "The panel reports live <b>utilisation %</b>, empty area, placed count, and rows.",
    ]))
    s.append(Paragraph(
        "If some designs don't fit, an overflow notice offers one-click <b>Extend "
        "sheet</b> or <b>Auto scale</b> actions.", BODY_SUB))
    s.append(PageBreak())

    # ---------------- 6. EDITING ----------------
    s.append(Paragraph("6 · Editing &amp; Arranging Designs", H1))
    s.append(Paragraph(
        "Click any design to select it; its properties appear in the right panel. "
        "Drag to move, use the corner handles to resize, and the top handle to rotate. "
        "Smart guides snap designs to edges, centres, and each other.", BODY))
    s.append(figure(os.path.join(SHOTS, "04_properties_final.png"),
                    "A selected design with its properties panel: position, size, rotation, and arrangement tools."))
    s.append(Paragraph("The properties panel", H2))
    s.append(bullets([
        "<b>Position &amp; size</b> — exact X/Y and width/height in your chosen unit, with an aspect-ratio lock.",
        "<b>Rotation &amp; flip</b> — free rotation, 90° snap buttons, and horizontal/vertical mirroring.",
        "<b>Opacity, lock, duplicate, delete</b> — quick per-design controls.",
        "<b>Layer order</b> — send to front/back or step forward/backward.",
        "<b>Align &amp; distribute</b> — line designs up to the sheet or to each other, and space them evenly.",
        "<b>Auto Fill, Remove BG, Upscale</b> — one-click actions for the selected design.",
    ]))
    s.append(Paragraph(
        "Select multiple designs with <b>Shift+click</b> or by dragging a box around "
        "them, then move, align, or distribute the whole group at once.", BODY))
    s.append(PageBreak())

    # ---------------- 7. IMAGE TOOLS ----------------
    s.append(Paragraph("7 · Background Removal &amp; Upscaling", H1))
    s.append(Paragraph(
        "Every image in the library — and every selected design — has <b>Remove BG</b> "
        "and <b>Upscale</b> buttons that clean up artwork without leaving the builder.", BODY))
    s.append(Paragraph("Remove background", H2))
    s.append(Paragraph(
        "Strips the background to transparency, ideal for DTF where only the artwork "
        "should print. A spinner shows progress; when it finishes, every placed copy of "
        "that image updates automatically.", BODY))
    s.append(Paragraph("Upscale", H2))
    s.append(Paragraph(
        "Increases the source resolution so a design stays crisp at larger print sizes. "
        "Its physical size on the sheet is unchanged — upscaling simply raises the "
        "effective print DPI.", BODY))
    s.append(bullets([
        "Processing runs through a secure server route, so API keys are never exposed in the browser.",
        "Results are cached — repeating the same operation does not re-process the image.",
        "Each tool runs once per image; a checkmark shows when it's already been applied.",
        "If a tool isn't configured yet, a clear message explains what's needed.",
    ]))
    s.append(PageBreak())

    # ---------------- 8. COLLISION ----------------
    s.append(Paragraph("8 · Overlap Detection", H1))
    s.append(Paragraph(
        "The builder checks for overlapping designs in real time — while you drag, "
        "resize, place, or nest. Overlapping designs are outlined in red and a warning "
        "appears at the bottom of the canvas.", BODY))
    s.append(figure(os.path.join(SHOTS, "06_collision_final.png"),
                    "Overlapping designs are highlighted in red, with a count shown in the corner."))
    s.append(Paragraph(
        "Overlaps are detected precisely, even for rotated designs. To resolve them, "
        "move the designs apart manually or simply run <b>Nest all</b> — the packer "
        "guarantees a layout with no overlaps.", BODY))
    s.append(PageBreak())

    # ---------------- 9. EXPORT ----------------
    s.append(Paragraph("9 · Exporting Print-Ready Files", H1))
    s.append(Paragraph(
        "Click <b>Export</b> in the toolbar to open the export window. It previews the "
        "output and runs pre-flight checks before producing your file.", BODY))
    s.append(figure(os.path.join(SHOTS, "05_export_modal.png"),
                    "The export window: choose format and resolution, review the summary, then export."))
    s.append(Paragraph("Formats &amp; resolution", H2))
    s.append(bullets([
        "<b>PNG</b> — transparent, pixel-accurate raster at the exact physical size (e.g. 22″ × 35″ at 300 DPI = 6,600 × 10,500 px).",
        "<b>PDF</b> — print-ready, with original images embedded losslessly; optional crop marks and bleed.",
        "<b>Resolution</b> — 150, 300, or 600 DPI. You can export several formats at once.",
    ]))
    s.append(Paragraph("Pre-flight summary", H2))
    s.append(Paragraph(
        "Before exporting, the window shows the sheet size, output pixel dimensions, "
        "utilisation, design count, and an estimated file size. It also flags low-DPI "
        "designs, overlaps, off-sheet artwork, and missing images so you can fix them "
        "first. A progress bar tracks each export, and finished files download "
        "automatically.", BODY))
    s.append(PageBreak())

    # ---------------- 10. SHORTCUTS ----------------
    s.append(Paragraph("10 · Keyboard Shortcuts", H1))
    s.append(Paragraph("Press <b>?</b> in the builder to open this list at any time.", BODY))
    sc = [
        ("Ctrl + Z", "Undo"),
        ("Ctrl + Y  /  Ctrl + Shift + Z", "Redo"),
        ("Ctrl + D", "Duplicate selection"),
        ("Ctrl + A", "Select all"),
        ("Delete  /  Backspace", "Delete selection"),
        ("Escape", "Clear selection"),
        ("Arrow keys", "Nudge 0.05″"),
        ("Shift + Arrow keys", "Nudge 0.5″"),
        ("Shift + Click", "Add / remove from selection"),
        ("Mouse wheel", "Zoom at cursor"),
        ("Space + Drag  /  Middle drag", "Pan canvas"),
        ("Ctrl + =  /  Ctrl + −", "Zoom in / out"),
        ("Ctrl + 0", "Fit sheet to view"),
        ("?", "Show shortcuts"),
    ]
    rows = [[Paragraph(k, KBD), Paragraph(v, TBL)] for k, v in sc]
    kt = Table(rows, colWidths=[2.5 * inch, CONTENT_W - 2.5 * inch])
    kt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (0, -1), 10),
        ("BACKGROUND", (0, 0), (0, -1), SOFT),
        ("ROWBACKGROUNDS", (1, 0), (1, -1), [colors.white, colors.white]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEAFTER", (0, 0), (0, -1), 0.6, LINE),
    ]))
    s.append(kt)
    s.append(PageBreak())

    # ---------------- 11. TIPS ----------------
    s.append(Paragraph("11 · Tips &amp; Troubleshooting", H1))
    s.append(Paragraph("Get the best print results", H2))
    s.append(bullets([
        "Keep every design at <b>150 DPI or higher</b> at its print size — watch for the red low-DPI warning and use <b>Upscale</b> if needed.",
        "Remove backgrounds before nesting so transparent edges pack tightly together.",
        "Use <b>Rows</b> mode when the sheet will be cut by hand, and <b>Compact</b> or <b>Production</b> to save the most film.",
        "Turn on <b>Show safe zone</b> and <b>Show bleed line</b> in Guides &amp; Snapping to keep artwork clear of the edges.",
    ]))
    s.append(Paragraph("Common questions", H2))
    s.append(bullets([
        "<b>A design won't fit.</b> Use the overflow <b>Extend sheet</b> action, enable auto-scale, or reduce the design size.",
        "<b>Designs overlap.</b> Run <b>Nest all</b> for a guaranteed overlap-free layout.",
        "<b>The export is very large.</b> Very long sheets at 600 DPI can exceed the browser's limits — lower the DPI or shorten the sheet, and the export window will warn you in advance.",
        "<b>Something went wrong.</b> <b>Undo</b> (Ctrl+Z) reverses any action, including Auto Build and Auto Fill.",
    ]))
    s.append(Spacer(1, 0.3 * inch))
    s.append(HRFlowable(width="100%", color=LINE, thickness=0.75, spaceAfter=10))
    s.append(Paragraph(
        "<b>Gangsheet Builder by ModFirst</b> — thank you for using the builder. "
        "Happy printing!", BODY_SUB))

    # switch to content template after the cover
    def first_page_then_content(canvas, doc):
        pass

    # build: cover uses 'cover' template, rest 'content'
    s.insert(1, _NextTemplate("content"))  # after cover content, before pagebreak handled
    doc.build(s)
    print("WROTE", OUT, f"({os.path.getsize(OUT)//1024} KB)")


# helper flowable to switch templates after the cover
from reportlab.platypus.doctemplate import NextPageTemplate as _NextTemplate


if __name__ == "__main__":
    build()

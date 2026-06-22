#!/usr/bin/env python
"""Builds the Gangsheet Builder product-walkthrough MP4 from captured scenes.

Pillow composes each 1920x1080 frame (branded background, framed screenshot
with Ken Burns motion, on-screen feature title + description, progress bar).
Frames are streamed as raw RGB to the bundled ffmpeg and encoded to H.264.
"""

import os
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
OUT = os.path.join(HERE, "Gangsheet-Builder-Walkthrough.mp4")

W, H, FPS = 1920, 1080, 30

# ---- palette --------------------------------------------------------------
BG_TOP = (13, 15, 18)
BG_BOT = (22, 26, 33)
ACCENT = (79, 142, 247)
ACCENT_DK = (47, 111, 214)
WHITE = (244, 246, 250)
GRAY = (150, 160, 176)
SUBGRAY = (110, 120, 136)
CARD_BORDER = (54, 60, 72)

# ---- fonts ----------------------------------------------------------------
def font(names, size):
    for n in names:
        for p in (n, os.path.join("C:/Windows/Fonts", n)):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()

BOLD = ["segoeuib.ttf", "arialbd.ttf", "Arialbd.ttf"]
SEMI = ["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"]
REG = ["segoeui.ttf", "arial.ttf", "Arial.ttf"]

f_brand = font(SEMI, 26)
f_kicker = font(BOLD, 20)
f_title = font(BOLD, 50)
f_desc = font(REG, 28)
f_huge = font(BOLD, 104)
f_sub = font(REG, 40)
f_tag = font(SEMI, 30)
f_small = font(REG, 24)

# ---- scenes ---------------------------------------------------------------
SCENES = [
    ("s01_workspace_final.png", "The Workspace",
     "Image library, a live canvas with rulers, and tool panels — all in one screen."),
    ("s02_placement.png", "Smart Upload & Sizing",
     "Set the exact print size and quantity for every design before it goes on the sheet."),
    ("s03_editimage.png", "Built-in Image Tools",
     "Remove background, upscale, or remove text in one click — powered by ClipDrop."),
    ("s04_crop.png", "Precision Crop",
     "Crop with zoom and pan for pixel-perfect framing — no external tools required."),
    ("s05_nested_final.png", "True Auto-Nest",
     "Bin-packing nests dozens of designs to maximise sheet use and cut film waste."),
    ("s06_properties_final.png", "Full Design Control",
     "Resize, rotate, align, layer and fine-tune any design, with live print-quality checks."),
    ("s07_text_final.png", "Text Tool",
     "Add headlines with Google Fonts, outlines, spacing and full typography control."),
    ("s08_multisheet_final.png", "Multi-Sheet Builder",
     "Auto-creates new sheets at the 300\" limit, with sheet tabs and live project totals."),
    ("s09_qualitycheck.png", "Pre-Flight Quality Check",
     "A guided checklist and rights confirmation before every export."),
    ("s10_export.png", "Print-Ready Export",
     "Export all sheets together as a multi-page PDF or full-resolution PNG."),
]

CARD_X, CARD_Y, CARD_W, CARD_H = 320, 70, 1280, 800
RADIUS = 18

# durations (seconds)
INTRO = 3.4
SCENE = 5.0
TRANS = 0.55
OUTRO = 3.6
TOTAL = INTRO + len(SCENES) * SCENE + (len(SCENES) + 1) * TRANS + OUTRO


# ---- helpers --------------------------------------------------------------
def gradient_bg():
    bg = Image.new("RGB", (W, H))
    px = bg.load()
    for y in range(H):
        t = y / H
        px_row = (
            int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
            int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
            int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
        )
        for x in range(W):
            px[x, y] = px_row
    # subtle accent glow top-left
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-300, -400, 700, 400], fill=(79, 142, 247, 22))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    bg = Image.alpha_composite(bg.convert("RGBA"), glow).convert("RGB")
    return bg


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return m


def text_spaced(draw, xy, text, fnt, fill, spacing=0, anchor_left=True):
    x, y = xy
    if not anchor_left:  # center
        total = sum(draw.textlength(c, font=fnt) + spacing for c in text) - spacing
        x = x - total / 2
    for c in text:
        draw.text((x, y), c, font=fnt, fill=fill)
        x += draw.textlength(c, font=fnt) + spacing


def shared_base():
    """Background + brand + card shadow + card frame (static across scenes)."""
    base = gradient_bg().convert("RGBA")
    d = ImageDraw.Draw(base)
    # brand wordmark
    d.text((CARD_X, 28), "Gangsheet Builder", font=f_brand, fill=WHITE)
    bw = d.textlength("Gangsheet Builder", font=f_brand)
    d.text((CARD_X + bw + 12, 30), "by ModFirst", font=font(REG, 24), fill=GRAY)

    # card drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [CARD_X - 6, CARD_Y + 12, CARD_X + CARD_W + 6, CARD_Y + CARD_H + 22],
        RADIUS + 6, fill=(0, 0, 0, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    base = Image.alpha_composite(base, shadow)

    d = ImageDraw.Draw(base)
    # card backing + border
    d.rounded_rectangle(
        [CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_H], RADIUS, fill=(18, 21, 27, 255)
    )
    return base


BASE = shared_base()
CARD_MASK = rounded_mask((CARD_W, CARD_H), RADIUS)

# preload screenshots
SHOT_IMGS = {}
for fn, _, _ in SCENES:
    SHOT_IMGS[fn] = Image.open(os.path.join(SHOTS, fn)).convert("RGB")


def ken_burns(img, p):
    """Center-crop a zoomed copy of img to the card size (zoom 1.0->1.06)."""
    z = 1.0 + 0.06 * p
    tw, th = int(CARD_W * z), int(CARD_H * z)
    scaled = img.resize((tw, th), Image.LANCZOS)
    left = (tw - CARD_W) // 2
    top = (th - CARD_H) // 2
    return scaled.crop((left, top, left + CARD_W, top + CARD_H))


def draw_progress(d, frac):
    y = H - 6
    d.rectangle([0, y, W, H], fill=(30, 34, 42))
    d.rectangle([0, y, int(W * frac), H], fill=ACCENT)


def render_feature(idx, p, cap_alpha, frac):
    fn, title, desc = SCENES[idx]
    frame = BASE.copy()
    # screenshot with Ken Burns into the card
    shot = ken_burns(SHOT_IMGS[fn], p)
    frame.paste(shot, (CARD_X, CARD_Y), CARD_MASK)
    d = ImageDraw.Draw(frame)
    # card border on top of screenshot
    d.rounded_rectangle(
        [CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_H], RADIUS,
        outline=CARD_BORDER, width=2,
    )

    # caption (fades/slides in)
    a = int(255 * cap_alpha)
    dy = int((1 - cap_alpha) * 14)
    cap = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cap)
    ky = CARD_Y + CARD_H + 26 + dy
    text_spaced(cd, (CARD_X, ky), f"FEATURE {idx + 1:02d} / {len(SCENES)}",
                f_kicker, ACCENT + (a,), spacing=2)
    cd.text((CARD_X, ky + 30), title, font=f_title, fill=WHITE + (a,))
    cd.text((CARD_X, ky + 92), desc, font=f_desc, fill=GRAY + (a,))
    frame = Image.alpha_composite(frame, cap)

    d = ImageDraw.Draw(frame)
    draw_progress(d, frac)
    return frame.convert("RGB")


def render_intro(p):
    frame = gradient_bg().convert("RGBA")
    # animated accent bar grows
    d = ImageDraw.Draw(frame)
    cx = W // 2
    barw = int(520 * min(1, p * 1.6))
    a = int(255 * min(1, p * 2))
    cap = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cap)
    cd.text((cx, 360), "Gangsheet Builder", font=f_huge, fill=WHITE + (a,), anchor="mm")
    cd.text((cx, 452), "by ModFirst", font=f_sub, fill=(159, 182, 223, a), anchor="mm")
    frame = Image.alpha_composite(frame, cap)
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([cx - barw // 2, 516, cx + barw // 2, 524], 4, fill=ACCENT)
    cap2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd2 = ImageDraw.Draw(cap2)
    cd2.text((cx, 576), "PRODUCT WALKTHROUGH", font=f_tag,
             fill=(150, 160, 176, int(255 * min(1, max(0, (p - 0.3) * 2)))), anchor="mm")
    frame = Image.alpha_composite(frame, cap2)
    return frame.convert("RGB")


def render_outro(p):
    frame = gradient_bg().convert("RGBA")
    cx = W // 2
    a = int(255 * min(1, p * 2))
    cap = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cap)
    cd.text((cx, 392), "Production-Ready DTF Gang Sheets",
            font=font(BOLD, 64), fill=WHITE + (a,), anchor="mm")
    d2 = ImageDraw.Draw(frame)
    barw = 420
    cap = Image.alpha_composite(cap, Image.new("RGBA", (W, H), (0, 0, 0, 0)))
    frame = Image.alpha_composite(frame, cap)
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([cx - barw // 2, 470, cx + barw // 2, 478], 4, fill=ACCENT)
    cap2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd2 = ImageDraw.Draw(cap2)
    aa = int(255 * min(1, max(0, (p - 0.25) * 2)))
    cd2.text((cx, 540), "Design  ·  Nest  ·  Export", font=f_sub, fill=(150, 160, 176, aa), anchor="mm")
    cd2.text((cx, 612), "Gangsheet Builder by ModFirst", font=f_small, fill=(110, 120, 136, aa), anchor="mm")
    frame = Image.alpha_composite(frame, cap2)
    return frame.convert("RGB")


# ---- timeline -------------------------------------------------------------
def main():
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        exe, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-crf", "19", "-preset", "medium", "-movflags", "+faststart", OUT,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)

    elapsed = [0.0]  # mutable for closures

    def write(img):
        proc.stdin.write(img.tobytes())
        elapsed[0] += 1.0 / FPS

    def frac():
        return min(1.0, elapsed[0] / TOTAL)

    def crossfade(a_img, b_img, n):
        for i in range(n):
            t = (i + 1) / (n + 1)
            write(Image.blend(a_img, b_img, t))

    nt = int(TRANS * FPS)

    # build an ordered list of (kind, index) segments
    intro_frames = int(INTRO * FPS)
    for i in range(intro_frames):
        write(render_intro(i / intro_frames))

    prev_last = render_intro(1.0)
    for idx in range(len(SCENES)):
        first = render_feature(idx, 0.0, 0.0, frac())
        crossfade(prev_last, first, nt)
        body = int(SCENE * FPS)
        for f in range(body):
            p = f / body
            cap_alpha = min(1.0, p / 0.08)  # caption fades in over first 8%
            write(render_feature(idx, p, cap_alpha, frac()))
        prev_last = render_feature(idx, 1.0, 1.0, frac())

    # transition into outro
    outro_first = render_outro(0.0)
    crossfade(prev_last, outro_first, nt)
    outro_frames = int(OUTRO * FPS)
    for i in range(outro_frames):
        write(render_outro(i / outro_frames))

    proc.stdin.close()
    err = proc.stderr.read().decode("utf-8", "ignore")
    proc.wait()
    if proc.returncode != 0:
        print("FFMPEG ERROR:\n", err[-2000:])
    else:
        size = os.path.getsize(OUT) / 1024 / 1024
        print(f"WROTE {OUT} ({size:.1f} MB, ~{TOTAL:.0f}s)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Generates high-resolution supersampled 256x256 botanical & culinary item icons,
sprite sheets, and real WAV audio assets for SPUDSTEAD.
"""

import math
import os
import random
import struct
import wave
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART_DIR = os.path.join(ROOT, "public", "assets", "art")
AUDIO_DIR = os.path.join(ROOT, "public", "assets", "audio")

os.makedirs(ART_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)


def generate_wav(filename: str, duration: float, sample_fn, sample_rate: int = 22050):
    filepath = os.path.join(AUDIO_DIR, filename)
    num_samples = int(duration * sample_rate)
    with wave.open(filepath, "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for i in range(num_samples):
            t = i / sample_rate
            val = max(-1.0, min(1.0, sample_fn(t, duration)))
            frames.extend(struct.pack("<h", int(val * 32767)))
        wav_file.writeframes(frames)


def build_audio_assets():
    rng = random.Random(42)

    notes = [
        (0.0, 261.63, 0.9),   # C4
        (0.5, 329.63, 0.8),   # E4
        (1.0, 392.00, 0.85),  # G4
        (1.5, 440.00, 0.75),  # A4
        (2.0, 392.00, 1.1),   # G4
        (3.0, 329.63, 0.9),   # E4
        (3.5, 293.66, 0.8),   # D4
        (4.0, 220.00, 0.9),   # A3
        (4.5, 261.63, 0.8),   # C4
        (5.0, 329.63, 0.85),  # E4
        (5.5, 392.00, 0.8),   # G4
        (6.0, 349.23, 0.9),   # F4
        (6.5, 329.63, 0.8),   # E4
        (7.0, 293.66, 1.0),   # D4
    ]
    bass = [
        (0.0, 130.81, 2.0),   # C3
        (2.0, 98.00, 2.0),    # G2
        (4.0, 110.00, 2.0),   # A2
        (6.0, 87.31, 2.0),    # F2
    ]

    def bgm_fn(t, dur):
        s = 0.0
        for start, freq, length in notes:
            dt = t - start
            if 0 <= dt < length * 1.4:
                env = math.exp(-dt * 4.2) * min(1.0, dt * 60.0)
                s += env * (
                    0.22 * math.sin(2 * math.pi * freq * dt)
                    + 0.08 * math.sin(2 * math.pi * freq * 2 * dt)
                    + 0.03 * math.sin(2 * math.pi * freq * 3 * dt)
                )
        for start, freq, length in bass:
            dt = t - start
            if 0 <= dt < length:
                env = math.exp(-dt * 1.8) * min(1.0, dt * 35.0)
                s += env * 0.18 * math.sin(2 * math.pi * freq * dt)
        return s * 0.85

    generate_wav("bgm-pastoral.wav", 8.0, bgm_fn)

    def amb_day(t, dur):
        breeze = (math.sin(t * 2.1) * 0.5 + 0.5) * (rng.uniform(-1, 1) * 0.025)
        chirp = 0.0
        for ct, f0 in [(0.8, 1760), (1.05, 2093), (2.6, 1567), (2.8, 1975)]:
            dt = t - ct
            if 0 <= dt < 0.16:
                env = math.sin(math.pi * dt / 0.16)
                freq = f0 + 280 * math.sin(dt * 35)
                chirp += env * 0.09 * math.sin(2 * math.pi * freq * dt)
        return breeze + chirp

    generate_wav("ambience-day.wav", 4.0, amb_day)

    def amb_rain(t, dur):
        fade = 1.0
        if t < 0.15:
            fade = t / 0.15
        elif t > dur - 0.15:
            fade = (dur - t) / 0.15
        drop = 0.04 * math.sin(2 * math.pi * (620 + (int(t * 17) % 7) * 90) * t) * math.exp(-((t * 17) % 1.0) * 9.0)
        return fade * (rng.uniform(-0.11, 0.11) + drop)

    generate_wav("ambience-rain.wav", 3.0, amb_rain)

    def sfx_dig(t, dur):
        thud = math.exp(-t * 26.0) * math.sin(2 * math.pi * (145 - t * 280) * t) * 0.55
        crumble = math.exp(-max(0.0, t - 0.04) * 14.0) * rng.uniform(-0.35, 0.35) if t >= 0.03 else 0.0
        return thud + crumble

    generate_wav("sfx-dig.wav", 0.28, sfx_dig)

    def sfx_plant(t, dur):
        pat = math.exp(-t * 32.0) * math.sin(2 * math.pi * 240 * t) * 0.35
        pop = math.exp(-max(0.0, t - 0.07) * 28.0) * math.sin(2 * math.pi * 520 * (t - 0.07)) * 0.35 if t >= 0.07 else 0.0
        return pat + pop

    generate_wav("sfx-plant.wav", 0.22, sfx_plant)

    def sfx_water(t, dur):
        env = math.sin(math.pi * t / dur)
        bubble = math.sin(2 * math.pi * (380 + 180 * math.sin(t * 42)) * t) * 0.22
        spray = rng.uniform(-0.2, 0.2)
        return env * (bubble + spray)

    generate_wav("sfx-water.wav", 0.38, sfx_water)

    def sfx_hill(t, dur):
        scrape = math.exp(-t * 12.0) * rng.uniform(-0.28, 0.28)
        mound = math.exp(-t * 16.0) * math.sin(2 * math.pi * (180 + t * 240) * t) * 0.35
        return scrape + mound

    generate_wav("sfx-hill.wav", 0.26, sfx_hill)

    def sfx_harvest(t, dur):
        pop = math.exp(-t * 25.0) * math.sin(2 * math.pi * (310 + t * 1200) * t) * 0.45
        chime1 = math.exp(-max(0, t - 0.06) * 14.0) * math.sin(2 * math.pi * 659.25 * t) * 0.3 if t >= 0.06 else 0.0
        chime2 = math.exp(-max(0, t - 0.13) * 11.0) * math.sin(2 * math.pi * 880.0 * t) * 0.35 if t >= 0.13 else 0.0
        return pop + chime1 + chime2

    generate_wav("sfx-harvest.wav", 0.36, sfx_harvest)

    def sfx_coin(t, dur):
        c1 = math.exp(-t * 22.0) * math.sin(2 * math.pi * 1046.5 * t) * 0.38
        c2 = math.exp(-max(0, t - 0.065) * 16.0) * math.sin(2 * math.pi * 1567.98 * t) * 0.42 if t >= 0.065 else 0.0
        return c1 + c2

    generate_wav("sfx-coin.wav", 0.32, sfx_coin)

    def sfx_ui(t, dur):
        return math.exp(-t * 55.0) * math.sin(2 * math.pi * 480 * t) * 0.35

    generate_wav("sfx-ui.wav", 0.09, sfx_ui)

    def sfx_fanfare(t, dur):
        chord = [(0.0, 523.25), (0.11, 659.25), (0.22, 783.99), (0.34, 1046.50)]
        s = 0.0
        for st, freq in chord:
            if t >= st:
                dt = t - st
                s += math.exp(-dt * 4.5) * (0.25 * math.sin(2 * math.pi * freq * dt) + 0.1 * math.sin(4 * math.pi * freq * dt))
        return s

    generate_wav("sfx-fanfare.wav", 0.95, sfx_fanfare)


def create_badge_canvas(bg_top, bg_bot, border_col=(184, 138, 68, 255)):
    """Creates a 512x512 supersampled warm botanical card icon canvas with rounded border."""
    S = 512
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded badge background with vertical gradient
    grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad)
    for y in range(20, S - 20):
        t = (y - 20) / float(S - 40)
        r = int(bg_top[0] * (1 - t) + bg_bot[0] * t)
        g = int(bg_top[1] * (1 - t) + bg_bot[1] * t)
        b = int(bg_top[2] * (1 - t) + bg_bot[2] * t)
        gdraw.line([(20, y), (S - 20, y)], fill=(r, g, b, 255))

    mask = Image.new("L", (S, S), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([20, 20, S - 20, S - 20], radius=84, fill=255)
    img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)
    # Soft inner glow ring & crisp botanical frame
    draw.rounded_rectangle([20, 20, S - 20, S - 20], radius=84, outline=(58, 34, 16, 255), width=12)
    draw.rounded_rectangle([30, 30, S - 30, S - 30], radius=74, outline=border_col, width=6)
    return img, draw


def draw_organic_tuber(
    img: Image.Image,
    lobes,
    base_col,
    shadow_col,
    hi_col,
    outline_col,
    eyes,
    leaf_pos=None,
    sparkle=False,
    netting=False
):
    """Renders a multi-layered shaded botanical potato illustration onto img."""
    S = img.width
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)

    # 1. Soft ground shadow
    ldraw.ellipse([110, 340, 402, 435], fill=(28, 16, 8, 95))
    layer = layer.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(layer)

    # 2. Outer dark outline
    body = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(body)
    for x1, y1, x2, y2 in lobes:
        bdraw.ellipse([x1 - 12, y1 - 12, x2 + 12, y2 + 12], fill=outline_col)

    # 3. Shadow underside fill
    for x1, y1, x2, y2 in lobes:
        bdraw.ellipse([x1, y1, x2, y2], fill=shadow_col)

    # 4. Main warm body fill shifted slightly up-left
    inner = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(inner)
    for x1, y1, x2, y2 in lobes:
        idraw.ellipse([x1 + 6, y1 + 4, x2 - 14, y2 - 18], fill=base_col)
    inner = inner.filter(ImageFilter.GaussianBlur(6))
    body.alpha_composite(inner)

    # 5. Optional russet netting texture
    if netting:
        ndraw = ImageDraw.Draw(body)
        rng = random.Random(101)
        for _ in range(36):
            nx = rng.randint(155, 345)
            ny = rng.randint(155, 335)
            ndraw.arc([nx - 22, ny - 14, nx + 22, ny + 14], 15, 165, fill=(112, 72, 38, 95), width=3)

    # 6. Soft specular highlight
    spec = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(spec)
    lx1, ly1, lx2, ly2 = lobes[0]
    w = lx2 - lx1
    h = ly2 - ly1
    sdraw.ellipse(
        [lx1 + int(w * 0.16), ly1 + int(h * 0.12), lx1 + int(w * 0.62), ly1 + int(h * 0.48)],
        fill=(*hi_col[:3], 190)
    )
    sdraw.ellipse(
        [lx1 + int(w * 0.24), ly1 + int(h * 0.18), lx1 + int(w * 0.44), ly1 + int(h * 0.32)],
        fill=(255, 255, 245, 210)
    )
    spec = spec.filter(ImageFilter.GaussianBlur(10))
    body.alpha_composite(spec)

    # 7. Potato eyes (botanical dimples with subtle brow highlight)
    edraw = ImageDraw.Draw(body)
    for ex, ey in eyes:
        edraw.ellipse([ex - 12, ey - 7, ex + 12, ey + 7], fill=outline_col)
        edraw.arc([ex - 14, ey - 10, ex + 14, ey + 8], 190, 350, fill=hi_col, width=3)

    # 8. Little green botanical leaf/sprout accent at top
    if leaf_pos:
        lx, ly = leaf_pos
        edraw.polygon(
            [(lx, ly), (lx - 38, ly - 52), (lx - 8, ly - 64), (lx + 6, ly - 24)],
            fill=(74, 168, 52, 255),
            outline=(32, 82, 20, 255)
        )
        edraw.polygon(
            [(lx + 4, ly - 4), (lx + 46, ly - 46), (lx + 26, ly - 68), (lx - 4, ly - 28)],
            fill=(106, 198, 68, 255),
            outline=(32, 82, 20, 255)
        )

    # 9. Sparkle stars for rare/frost varieties
    if sparkle:
        for sx, sy, sr in [(120, 128, 22), (390, 148, 18), (370, 340, 16)]:
            pts = [
                (sx, sy - sr),
                (sx + sr // 4, sy - sr // 4),
                (sx + sr, sy),
                (sx + sr // 4, sy + sr // 4),
                (sx, sy + sr),
                (sx - sr // 4, sy + sr // 4),
                (sx - sr, sy),
                (sx - sr // 4, sy - sr // 4),
            ]
            edraw.polygon(pts, fill=(255, 248, 196, 245))

    img.alpha_composite(body)


def save_supersampled(img: Image.Image, filename: str):
    out = img.resize((256, 256), Image.Resampling.LANCZOS)
    out.save(os.path.join(ART_DIR, filename), optimize=True)


def build_high_res_item_icons():
    # 1. Yukon Sunburst (Warm golden-yellow oval potato)
    img, _ = create_badge_canvas((255, 246, 218), (236, 208, 152), (198, 142, 54, 255))
    draw_organic_tuber(
        img,
        lobes=[(126, 118, 386, 388), (156, 98, 346, 310)],
        base_col=(242, 194, 68, 255),
        shadow_col=(188, 132, 28, 255),
        hi_col=(255, 238, 158, 255),
        outline_col=(92, 56, 12, 255),
        eyes=[(210, 210), (310, 245), (235, 310), (295, 165)],
        leaf_pos=(256, 118)
    )
    save_supersampled(img, "icon-sunburst.png")

    # 2. Crimson Rose (Deep ruby-red waxy potato)
    img, _ = create_badge_canvas((255, 238, 232), (238, 198, 182), (186, 92, 82, 255))
    draw_organic_tuber(
        img,
        lobes=[(122, 128, 390, 382), (170, 104, 368, 320)],
        base_col=(214, 68, 72, 255),
        shadow_col=(148, 32, 38, 255),
        hi_col=(252, 158, 158, 255),
        outline_col=(78, 16, 20, 255),
        eyes=[(205, 225), (308, 205), (255, 305), (325, 285)],
        leaf_pos=(268, 118)
    )
    save_supersampled(img, "icon-crimson.png")

    # 3. Ironclad Russet (Oblong textured brown baker potato)
    img, _ = create_badge_canvas((248, 238, 220), (222, 196, 162), (156, 112, 68, 255))
    draw_organic_tuber(
        img,
        lobes=[(104, 146, 408, 372), (144, 132, 368, 356)],
        base_col=(172, 118, 72, 255),
        shadow_col=(118, 74, 38, 255),
        hi_col=(218, 172, 124, 255),
        outline_col=(64, 38, 18, 255),
        eyes=[(185, 235), (275, 215), (335, 265), (225, 305)],
        leaf_pos=None,
        netting=True
    )
    save_supersampled(img, "icon-russet.png")

    # 4. Violet Majesty (Regal deep purple heirloom fingerling)
    img, _ = create_badge_canvas((246, 236, 255), (218, 194, 238), (138, 88, 178, 255))
    draw_organic_tuber(
        img,
        lobes=[(138, 108, 352, 392), (178, 92, 378, 298), (118, 208, 318, 396)],
        base_col=(136, 68, 184, 255),
        shadow_col=(82, 32, 122, 255),
        hi_col=(198, 148, 242, 255),
        outline_col=(46, 16, 72, 255),
        eyes=[(225, 195), (285, 255), (210, 305), (265, 145)],
        leaf_pos=(268, 104)
    )
    save_supersampled(img, "icon-violet.png")

    # 5. Glacier Finger (Slender crystalline alpine frost-sweetened fingerling)
    img, _ = create_badge_canvas((234, 248, 255), (188, 222, 246), (96, 158, 204, 255))
    draw_organic_tuber(
        img,
        lobes=[(152, 98, 344, 398), (182, 86, 366, 286), (134, 218, 316, 404)],
        base_col=(224, 238, 252, 255),
        shadow_col=(142, 176, 208, 255),
        hi_col=(255, 255, 255, 255),
        outline_col=(52, 82, 112, 255),
        eyes=[(238, 185), (268, 255), (215, 315)],
        leaf_pos=None,
        sparkle=True
    )
    save_supersampled(img, "icon-frostbite.png")

    # 6. Golden Truffle Spud (Knobby, shimmering multi-lobed crown jewel tuber)
    img, _ = create_badge_canvas((255, 244, 204), (238, 192, 98), (212, 148, 24, 255))
    draw_organic_tuber(
        img,
        lobes=[
            (124, 134, 388, 386),
            (164, 96, 348, 282),
            (108, 194, 284, 368),
            (228, 192, 404, 366),
            (172, 238, 342, 404),
        ],
        base_col=(236, 176, 42, 255),
        shadow_col=(168, 104, 14, 255),
        hi_col=(255, 236, 138, 255),
        outline_col=(88, 48, 6, 255),
        eyes=[(215, 185), (305, 195), (195, 285), (315, 285), (256, 335)],
        leaf_pos=(256, 102),
        sparkle=True
    )
    save_supersampled(img, "icon-truffle.png")

    # 7. Rich Farm Compost (Burlap sack overflowing with dark humus & green sprout)
    img, draw = create_badge_canvas((244, 236, 216), (216, 194, 158), (128, 96, 54, 255))
    draw.ellipse([116, 356, 396, 426], fill=(28, 16, 8, 90))
    # Burlap bag body
    draw.rounded_rectangle([136, 168, 376, 396], radius=58, fill=(186, 142, 88, 255), outline=(78, 48, 20, 255), width=10)
    # Dark rich compost mound at top of open sack
    draw.ellipse([148, 132, 364, 224], fill=(68, 42, 22, 255), outline=(42, 24, 12, 255), width=8)
    draw.ellipse([172, 144, 340, 206], fill=(92, 58, 32, 255))
    # Green leaf emblem on sack front
    draw.ellipse([212, 248, 300, 336], fill=(82, 168, 58, 255), outline=(38, 88, 24, 255), width=6)
    save_supersampled(img, "icon-compost.png")


def draw_potato_icon(draw: ImageDraw.ImageDraw, cx: int, cy: int, rx: int, ry: int, body_col, hi_col, shadow_col, eye_col, gold_aura=False):
    if gold_aura:
        for r in range(4, 0, -1):
            draw.ellipse([cx - rx - r * 2, cy - ry - r * 2, cx + rx + r * 2, cy + ry + r * 2], fill=(255, 215, 70, 35 * (5 - r)))
    draw.ellipse([cx - rx + 2, cy + ry - 5, cx + rx + 3, cy + ry + 4], fill=(28, 18, 10, 120))
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=body_col, outline=shadow_col, width=2)
    draw.ellipse([cx - rx + 3, cy - ry + 2, cx + rx - 4, cy + ry - 3], fill=body_col)
    draw.ellipse([cx - rx // 2 - 2, cy - ry // 2 - 2, cx + rx // 4, cy - 1], fill=hi_col)
    for ex, ey in [(-rx // 3, -ry // 5), (rx // 3, ry // 5), (-rx // 5, ry // 3), (rx // 4, -ry // 3)]:
        draw.ellipse([cx + ex - 2, cy + ey - 1, cx + ex + 2, cy + ey + 1], fill=eye_col)


def build_sprite_sheets():
    varieties = [
        ("sunburst", (232, 188, 74, 255), (250, 224, 130, 255), (145, 102, 28, 255), (120, 82, 20, 255), (255, 248, 210, 255)),
        ("crimson", (204, 72, 68, 255), (238, 125, 118, 255), (122, 32, 30, 255), (95, 22, 22, 255), (255, 182, 205, 255)),
        ("russet", (164, 112, 68, 255), (198, 148, 102, 255), (98, 62, 34, 255), (78, 48, 24, 255), (245, 245, 250, 255)),
        ("violet", (126, 68, 168, 255), (168, 114, 212, 255), (68, 32, 98, 255), (52, 20, 78, 255), (205, 150, 255, 255)),
        ("frostbite", (218, 232, 245, 255), (245, 252, 255, 255), (118, 145, 172, 255), (92, 118, 145, 255), (175, 235, 255, 255)),
        ("truffle", (218, 158, 42, 255), (255, 218, 110, 255), (128, 78, 16, 255), (96, 56, 10, 255), (255, 225, 95, 255)),
    ]

    sheet = Image.new("RGBA", (512, 384), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sheet)

    for row, (name, body, hi, shd, eye, flw) in enumerate(varieties):
        y0 = row * 64
        cx, cy = 32, y0 + 36
        draw.chord([cx - 14, cy - 12, cx + 14, cy + 12], 180, 360, fill=(242, 228, 188, 255), outline=shd, width=2)
        draw.arc([cx - 14, cy - 12, cx + 14, cy + 12], 0, 180, fill=body, width=3)
        draw.polygon([(cx - 2, cy - 10), (cx + 1, cy - 22), (cx + 5, cy - 10)], fill=(126, 198, 74, 255))
        draw.ellipse([cx - 1, cy - 24, cx + 5, cy - 18], fill=flw)

        draw_potato_icon(draw, 64 + 32, y0 + 34, 16, 12, body, hi, shd, eye, gold_aura=False)
        draw_potato_icon(draw, 128 + 25, y0 + 36, 12, 9, body, hi, shd, eye, gold_aura=False)
        draw_potato_icon(draw, 128 + 37, y0 + 32, 16, 12, body, hi, shd, eye, gold_aura=False)
        draw_potato_icon(draw, 192 + 24, y0 + 36, 13, 10, body, hi, shd, eye, gold_aura=True)
        draw_potato_icon(draw, 192 + 37, y0 + 33, 17, 13, body, hi, shd, eye, gold_aura=True)

    sheet.save(os.path.join(ART_DIR, "potato-varieties.png"))


if __name__ == "__main__":
    build_audio_assets()
    build_sprite_sheets()
    print("Generated audio and sprite sheets successfully.")

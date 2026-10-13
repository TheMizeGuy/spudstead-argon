#!/usr/bin/env python3
"""
Generates production sprite sheets, item icons, and real WAV audio assets for SPUDSTEAD.
Works alongside the AI-generated visual targets, title banner, and NPC portrait illustrations.
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

    # 1. Warm pastoral marimba/guitar loop (8.0s seamless loop at 90 BPM)
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

    # 2. Ambience Day (soft breeze + subtle bird chirp)
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

    # 3. Ambience Rain
    def amb_rain(t, dur):
        fade = 1.0
        if t < 0.15:
            fade = t / 0.15
        elif t > dur - 0.15:
            fade = (dur - t) / 0.15
        drop = 0.04 * math.sin(2 * math.pi * (620 + (int(t * 17) % 7) * 90) * t) * math.exp(-((t * 17) % 1.0) * 9.0)
        return fade * (rng.uniform(-0.11, 0.11) + drop)

    generate_wav("ambience-rain.wav", 3.0, amb_rain)

    # 4. SFX Dig / Till
    def sfx_dig(t, dur):
        thud = math.exp(-t * 26.0) * math.sin(2 * math.pi * (145 - t * 280) * t) * 0.55
        crumble = math.exp(-max(0.0, t - 0.04) * 14.0) * rng.uniform(-0.35, 0.35) if t >= 0.03 else 0.0
        return thud + crumble

    generate_wav("sfx-dig.wav", 0.28, sfx_dig)

    # 5. SFX Plant
    def sfx_plant(t, dur):
        pat = math.exp(-t * 32.0) * math.sin(2 * math.pi * 240 * t) * 0.35
        pop = math.exp(-max(0.0, t - 0.07) * 28.0) * math.sin(2 * math.pi * 520 * (t - 0.07)) * 0.35 if t >= 0.07 else 0.0
        return pat + pop

    generate_wav("sfx-plant.wav", 0.22, sfx_plant)

    # 6. SFX Water
    def sfx_water(t, dur):
        env = math.sin(math.pi * t / dur)
        bubble = math.sin(2 * math.pi * (380 + 180 * math.sin(t * 42)) * t) * 0.22
        spray = rng.uniform(-0.2, 0.2)
        return env * (bubble + spray)

    generate_wav("sfx-water.wav", 0.38, sfx_water)

    # 7. SFX Hill
    def sfx_hill(t, dur):
        scrape = math.exp(-t * 12.0) * rng.uniform(-0.28, 0.28)
        mound = math.exp(-t * 16.0) * math.sin(2 * math.pi * (180 + t * 240) * t) * 0.35
        return scrape + mound

    generate_wav("sfx-hill.wav", 0.26, sfx_hill)

    # 8. SFX Harvest
    def sfx_harvest(t, dur):
        pop = math.exp(-t * 25.0) * math.sin(2 * math.pi * (310 + t * 1200) * t) * 0.45
        chime1 = math.exp(-max(0, t - 0.06) * 14.0) * math.sin(2 * math.pi * 659.25 * t) * 0.3 if t >= 0.06 else 0.0
        chime2 = math.exp(-max(0, t - 0.13) * 11.0) * math.sin(2 * math.pi * 880.0 * t) * 0.35 if t >= 0.13 else 0.0
        return pop + chime1 + chime2

    generate_wav("sfx-harvest.wav", 0.36, sfx_harvest)

    # 9. SFX Coin
    def sfx_coin(t, dur):
        c1 = math.exp(-t * 22.0) * math.sin(2 * math.pi * 1046.5 * t) * 0.38
        c2 = math.exp(-max(0, t - 0.065) * 16.0) * math.sin(2 * math.pi * 1567.98 * t) * 0.42 if t >= 0.065 else 0.0
        return c1 + c2

    generate_wav("sfx-coin.wav", 0.32, sfx_coin)

    # 10. SFX UI tap
    def sfx_ui(t, dur):
        return math.exp(-t * 55.0) * math.sin(2 * math.pi * 480 * t) * 0.35

    generate_wav("sfx-ui.wav", 0.09, sfx_ui)

    # 11. SFX Fanfare
    def sfx_fanfare(t, dur):
        chord = [(0.0, 523.25), (0.11, 659.25), (0.22, 783.99), (0.34, 1046.50)]
        s = 0.0
        for st, freq in chord:
            if t >= st:
                dt = t - st
                s += math.exp(-dt * 4.5) * (0.25 * math.sin(2 * math.pi * freq * dt) + 0.1 * math.sin(4 * math.pi * freq * dt))
        return s

    generate_wav("sfx-fanfare.wav", 0.95, sfx_fanfare)


def draw_potato_icon(draw: ImageDraw.ImageDraw, cx: int, cy: int, rx: int, ry: int, body_col, hi_col, shadow_col, eye_col, gold_aura=False):
    if gold_aura:
        for r in range(4, 0, -1):
            draw.ellipse([cx - rx - r * 2, cy - ry - r * 2, cx + rx + r * 2, cy + ry + r * 2], fill=(255, 215, 70, 35 * (5 - r)))
    # Drop shadow
    draw.ellipse([cx - rx + 2, cy + ry - 5, cx + rx + 3, cy + ry + 4], fill=(28, 18, 10, 120))
    # Main tuber body (organic multi-lobe shape)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=body_col, outline=shadow_col, width=2)
    draw.ellipse([cx - rx + 3, cy - ry + 2, cx + rx - 4, cy + ry - 3], fill=body_col)
    # Highlight
    draw.ellipse([cx - rx // 2 - 2, cy - ry // 2 - 2, cx + rx // 4, cy - 1], fill=hi_col)
    # Potato eyes (indentations)
    for ex, ey in [(-rx // 3, -ry // 5), (rx // 3, ry // 5), (-rx // 5, ry // 3), (rx // 4, -ry // 3)]:
        draw.ellipse([cx + ex - 2, cy + ey - 1, cx + ex + 2, cy + ey + 1], fill=eye_col)


def build_sprite_sheets():
    # Create potato varieties icon & crop stage sheet (6 rows x 8 cols, 64x64 per cell = 512x384)
    # Cols: 0=Seed Eye, 1=Standard Tuber, 2=Prime Tuber, 3=Artisan Tuber, 4=Stage1 Sprout, 5=Stage2 Haulm, 6=Stage3 Blossom, 7=Stage4 Mature Ridge
    varieties = [
        # (name, body_col, hi_col, shadow_col, eye_col, flower_col)
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
        # Col 0: Cut Seed Eye with little white/green sprout chit
        cx, cy = 32, y0 + 36
        draw.chord([cx - 14, cy - 12, cx + 14, cy + 12], 180, 360, fill=(242, 228, 188, 255), outline=shd, width=2)
        draw.arc([cx - 14, cy - 12, cx + 14, cy + 12], 0, 180, fill=body, width=3)
        # Sprout chit
        draw.polygon([(cx - 2, cy - 10), (cx + 1, cy - 22), (cx + 5, cy - 10)], fill=(126, 198, 74, 255))
        draw.ellipse([cx - 1, cy - 24, cx + 5, cy - 18], fill=flw)

        # Col 1: Standard Tuber
        draw_potato_icon(draw, 64 + 32, y0 + 34, 16, 12, body, hi, shd, eye, gold_aura=False)

        # Col 2: Prime Tuber (larger + dual tuber cluster + silver sparkle)
        draw_potato_icon(draw, 128 + 25, y0 + 36, 12, 9, body, hi, shd, eye, gold_aura=False)
        draw_potato_icon(draw, 128 + 37, y0 + 32, 16, 12, body, hi, shd, eye, gold_aura=False)
        draw.polygon([(128 + 48, y0 + 12), (128 + 50, y0 + 18), (128 + 56, y0 + 20), (128 + 50, y0 + 22), (128 + 48, y0 + 28), (128 + 46, y0 + 22), (128 + 40, y0 + 20), (128 + 46, y0 + 18)], fill=(230, 242, 255, 255))

        # Col 3: Artisan Tuber (Golden aura + ribbon crown)
        draw_potato_icon(draw, 192 + 24, y0 + 36, 13, 10, body, hi, shd, eye, gold_aura=True)
        draw_potato_icon(draw, 192 + 37, y0 + 33, 17, 13, body, hi, shd, eye, gold_aura=True)
        # Gold star
        sx, sy = 192 + 48, y0 + 16
        draw.polygon([(sx, sy - 7), (sx + 2, sy - 2), (sx + 7, sy), (sx + 2, sy + 2), (sx, sy + 7), (sx - 2, sy + 2), (sx - 7, sy), (sx - 2, sy - 2)], fill=(255, 215, 40, 255))

        # Col 4: Stage 1 Emerging Chits
        cx, cy = 256 + 32, y0 + 46
        draw.ellipse([cx - 18, cy - 6, cx + 18, cy + 6], fill=(92, 60, 34, 220))
        for ox in [-7, 0, 7]:
            draw.line([(cx + ox, cy), (cx + ox, cy - 13)], fill=(96, 168, 54, 255), width=2)
            draw.ellipse([cx + ox - 4, cy - 16, cx + ox + 4, cy - 10], fill=(124, 198, 68, 255))

        # Col 5: Stage 2 Leafy Haulm
        cx, cy = 320 + 32, y0 + 46
        draw.ellipse([cx - 22, cy - 8, cx + 22, cy + 7], fill=(86, 55, 30, 235))
        for lx, ly, r in [(-12, -12, 8), (12, -12, 8), (-6, -20, 9), (6, -20, 9), (0, -14, 10), (0, -25, 8)]:
            draw.ellipse([cx + lx - r, cy + ly - r + 2, cx + lx + r, cy + ly + r - 2], fill=(64, 148, 46, 255), outline=(40, 96, 28, 255))
            draw.ellipse([cx + lx - r + 2, cy + ly - r + 3, cx + lx + r - 3, cy + ly], fill=(104, 188, 66, 255))

        # Col 6: Stage 3 Flowering Canopy
        cx, cy = 384 + 32, y0 + 46
        draw.ellipse([cx - 24, cy - 9, cx + 24, cy + 8], fill=(82, 52, 28, 240))
        for lx, ly, r in [(-15, -12, 9), (15, -12, 9), (-10, -22, 10), (10, -22, 10), (0, -16, 11), (0, -28, 9)]:
            draw.ellipse([cx + lx - r, cy + ly - r + 2, cx + lx + r, cy + ly + r - 2], fill=(54, 138, 42, 255), outline=(34, 86, 24, 255))
            draw.ellipse([cx + lx - r + 2, cy + ly - r + 3, cx + lx + r - 3, cy + ly], fill=(92, 178, 58, 255))
        for fx, fy in [(-9, -27), (9, -25), (0, -33)]:
            draw.ellipse([cx + fx - 5, cy + fy - 5, cx + fx + 5, cy + fy + 5], fill=flw, outline=shd)
            draw.ellipse([cx + fx - 2, cy + fy - 2, cx + fx + 2, cy + fy + 2], fill=(255, 210, 45, 255))

        # Col 7: Stage 4 Mature Bulking Ridge (peeking tubers & golden haulm)
        cx, cy = 448 + 32, y0 + 46
        draw.ellipse([cx - 26, cy - 11, cx + 26, cy + 9], fill=(76, 48, 25, 245))
        # Peeking tubers at base of ridge
        draw_potato_icon(draw, cx - 11, cy - 3, 8, 6, body, hi, shd, eye)
        draw_potato_icon(draw, cx + 12, cy - 2, 9, 6, body, hi, shd, eye)
        draw_potato_icon(draw, cx + 1, cy + 1, 8, 6, body, hi, shd, eye)
        # Golden-green mature foliage
        for lx, ly, r in [(-14, -15, 8), (14, -15, 8), (-7, -23, 9), (7, -23, 9), (0, -19, 9)]:
            draw.ellipse([cx + lx - r, cy + ly - r + 2, cx + lx + r, cy + ly + r - 2], fill=(118, 158, 48, 255), outline=(68, 92, 24, 255))
            draw.ellipse([cx + lx - r + 2, cy + ly - r + 3, cx + lx + r - 2, cy + ly], fill=(176, 198, 72, 255))

    sheet.save(os.path.join(ART_DIR, "potato-varieties.png"))


if __name__ == "__main__":
    build_audio_assets()
    build_sprite_sheets()
    print("Generated audio and sprite sheets successfully.")

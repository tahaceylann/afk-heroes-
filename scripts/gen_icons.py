#!/usr/bin/env python3
"""Efsane Çağrısı ikonlarını üretir. Yalnızca Python stdlib (zlib + struct)
kullanır, Pillow gerekmez. Koyu mor arkaplan üzerinde altın->mor gradyanlı,
parıldayan bir mücevher (gem) ikonu çizer.
"""
import os
import struct
import zlib
import math

SIZES = [512, 192, 180, 32, 16]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

BG1 = (13, 11, 23)     # #0d0b17
BG2 = (28, 24, 48)     # #1c1830
GOLD = (255, 210, 77)  # #ffd24d
PURPLE = (199, 123, 255)  # #c77bff
RIM = (10, 8, 18)

# Mücevher dış hattı (birim koordinat, merkez 0,0; y aşağı pozitif)
GEM_POINTS = [
    (0.0, -0.42), (0.32, -0.18), (0.40, 0.03),
    (0.0, 0.42), (-0.40, 0.03), (-0.32, -0.18),
]
# Üst parlaklık facet üçgeni (highlight)
FACET_POINTS = [(0.0, -0.42), (0.32, -0.18), (0.0, -0.02), (-0.32, -0.18)]


def lerp(a, b, t): return a + (b - a) * t
def lerp_color(c1, c2, t): return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def point_in_convex_polygon(px, py, pts):
    sign = None
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
        if cross == 0:
            continue
        s = cross > 0
        if sign is None:
            sign = s
        elif s != sign:
            return False
    return True


def make_pixels(size):
    cx = cy = size / 2
    gem_scale = size * 0.92
    gem_pts = [(x * gem_scale, y * gem_scale) for x, y in GEM_POINTS]
    facet_pts = [(x * gem_scale, y * gem_scale) for x, y in FACET_POINTS]

    pixels = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            bt = (x + y) / (2 * size)
            r, g, b = lerp_color(BG1, BG2, bt)
            a = 255

            px, py = x - cx, y - cy
            if point_in_convex_polygon(px, py, gem_pts):
                t = max(0.0, min(1.0, (py / gem_scale) + 0.42))
                gc = lerp_color(GOLD, PURPLE, t)
                if point_in_convex_polygon(px, py, facet_pts):
                    gc = lerp_color(gc, (255, 255, 255), 0.35)
                dist_edge = gem_scale * 0.5 - math.hypot(px, py)
                if dist_edge < size * 0.01:
                    gc = lerp_color(gc, RIM, 0.5)
                r, g, b = gc
                a = 255

            pixels[idx + 0] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b
            pixels[idx + 3] = a
    return pixels


def write_png(path, size, pixels):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw.extend(pixels[y * stride:(y + 1) * stride])
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        pixels = make_pixels(size)
        out_path = os.path.join(OUT_DIR, f"icon-{size}.png")
        write_png(out_path, size, pixels)
        print("yazildi:", out_path)


if __name__ == "__main__":
    main()

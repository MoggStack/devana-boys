#!/usr/bin/env python3
"""Remove the plain black background from a face image and trim it.
usage: python3 scripts/cut-face.py input.jpg output.png [threshold=16, lower it if dark hair gets cut]"""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
w, h = im.size
px = im.load()
TH = int(sys.argv[3]) if len(sys.argv) > 3 else 16  # darker than this (connected to the border) = background
seen = bytearray(w * h)
q = deque()
for x in range(w):
    q.append((x, 0)); q.append((x, h - 1))
for y in range(h):
    q.append((0, y)); q.append((w - 1, y))
while q:
    x, y = q.popleft()
    i = y * w + x
    if seen[i]:
        continue
    r, g, b, a = px[x, y]
    if max(r, g, b) >= TH:
        continue
    seen[i] = 1
    if x > 0: q.append((x - 1, y))
    if x < w - 1: q.append((x + 1, y))
    if y > 0: q.append((x, y - 1))
    if y < h - 1: q.append((x, y + 1))
mask = Image.new("L", (w, h), 0)
mp = mask.load()
for y in range(h):
    for x in range(w):
        if not seen[y * w + x]:
            mp[x, y] = 255
mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
im.putalpha(mask)
bbox = mask.point(lambda v: 255 if v > 20 else 0).getbbox()
im = im.crop(bbox)
im.thumbnail((512, 512))
im.save(dst)
print(dst, im.size)

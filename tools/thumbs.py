#!/usr/bin/env python3
"""Small, fast thumbnails for the TV page: public/videos/<name>.jpg -> <name>-sm.webp (480 px wide,
for cards) and <name>-md.webp (960 px, for Raisina TV's full-screen promo and "Coming up" card).

The app asks for the -sm.webp first and falls back to the .jpg if it isn't there, so run this
after adding videos (python3 tools/thumbs.py); it only makes the ones that are missing.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / "public" / "videos"
made = 0
for jpg in sorted(root.glob("*.jpg")):
    for suffix, wide, tall, q in (("-sm", 480, 300, 72), ("-md", 960, 540, 70)):
        out = jpg.with_name(jpg.stem + suffix + ".webp")
        if out.exists() and out.stat().st_mtime >= jpg.stat().st_mtime:
            continue
        im = Image.open(jpg).convert("RGB")
        w = wide if im.width >= im.height else tall
        im.thumbnail((w, w * 2 if im.height > im.width else w))
        im.save(out, "WEBP", quality=q, method=6)
        made += 1
print(f"{made} thumbnails made in {root}")

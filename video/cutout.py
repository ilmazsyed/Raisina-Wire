"""Raisina Wire video engine: photo cut-outs.

python3 video/cutout.py <in-image> <out.png> [model]

Removes the background so the subject can be animated on its own layer (sticker outlines,
parallax, a headline behind the subject). Writes an RGBA PNG trimmed to the subject, and
<out>.json with where that crop sits in the (downscaled) original, so the cut-out can be laid
exactly over the photo for 2.5D parallax. Specks are dropped: only regions at least 8% the size
of the largest one are kept. Models (rembg): `u2net_human_seg` (people, default) or
`isnet-general-use` (any subject)."""
import json, sys
import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
model = sys.argv[3] if len(sys.argv) > 3 else "u2net_human_seg"
im = Image.open(src).convert("RGB")
im.thumbnail((1800, 1800))
cut = np.array(remove(im, session=new_session(model), post_process_mask=True))
alpha = cut[..., 3]
labels, n = ndimage.label(alpha > 40)
if n > 1:
    sizes = ndimage.sum(np.ones_like(alpha), labels, range(1, n + 1))
    keep = np.isin(labels, 1 + np.where(sizes >= sizes.max() * 0.08)[0])
    alpha = np.where(ndimage.binary_dilation(keep, iterations=2), alpha, 0)
cut[..., 3] = alpha
ys, xs = np.where(alpha > 16)
m = int(max(im.size) * 0.02)
box = tuple(int(v) for v in (max(0, xs.min() - m), max(0, ys.min() - m), min(im.width, xs.max() + m), min(im.height, ys.max() + m))) if len(xs) else (0, 0, im.width, im.height)
Image.fromarray(cut).crop(box).save(out)
json.dump({"x": box[0], "y": box[1], "w": box[2] - box[0], "h": box[3] - box[1], "W": im.width, "H": im.height}, open(out + ".json", "w"))
print(f"{out}: {box[2] - box[0]}x{box[3] - box[1]} of {im.width}x{im.height}")

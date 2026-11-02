"""Fast face sharpening for a still-headed anchor: the face is found once, then every frame's fixed
face crop goes straight through GFPGAN (no per-frame detection), and only the lower face is blended
back. python sharpen2.py <in.mp4> <out.mp4> [max_frames]"""
import sys, time, subprocess, cv2, numpy as np, torch
from gfpgan import GFPGANer
from basicsr.utils import img2tensor, tensor2img
from torchvision.transforms.functional import normalize
torch.set_num_threads(4)
src, out = sys.argv[1], sys.argv[2]; lim = int(sys.argv[3]) if len(sys.argv) > 3 else 10**9
r = GFPGANer(model_path="gfpgan/weights/GFPGANv1.4.pth", upscale=1, arch="clean", channel_multiplier=2, bg_upsampler=None)
cap = cv2.VideoCapture(src); fps = cap.get(cv2.CAP_PROP_FPS) or 25
W, H = int(cap.get(3)), int(cap.get(4))
ok, f0 = cap.read(); cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
r.face_helper.clean_all(); r.face_helper.read_image(f0)
r.face_helper.get_face_landmarks_5(only_center_face=True, eye_dist_threshold=5)
r.face_helper.align_warp_face()
M = r.face_helper.affine_matrices[0]; IM = cv2.invertAffineTransform(M)
# Paste mask: lower face (mouth, jaw) in the 512 crop, feathered.
pm = np.zeros((512, 512), np.float32); cv2.ellipse(pm, (256, 360), (150, 120), 0, 0, 360, 1, -1); pm = cv2.GaussianBlur(pm, (0, 0), 18)
p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
n, t = 0, time.time()
with torch.no_grad():
    while n < lim:
        ok, f = cap.read()
        if not ok: break
        crop = cv2.warpAffine(f, M, (512, 512), borderMode=cv2.BORDER_REFLECT)
        x = img2tensor(crop / 255., bgr2rgb=True, float32=True); normalize(x, (0.5,) * 3, (0.5,) * 3, inplace=True)
        y = tensor2img(r.gfpgan(x.unsqueeze(0), return_rgb=False, weight=0.5)[0].squeeze(0), rgb2bgr=True, min_max=(-1, 1)).astype(np.float32)
        y = crop * (1 - pm[..., None]) + y * pm[..., None]
        back = cv2.warpAffine(y, IM, (W, H)); mk = cv2.warpAffine(pm, IM, (W, H))[..., None]
        p.stdin.write((f * (1 - mk) + back * mk).clip(0, 255).astype(np.uint8).tobytes()); n += 1
p.stdin.close(); p.wait()
print(f"{n} frames, {(time.time() - t) / max(n, 1):.2f} s/frame")

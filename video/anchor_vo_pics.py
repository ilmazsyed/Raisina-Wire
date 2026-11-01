"""Pictures for the Raisina TV anchor's voice-over before each explainer (4 per explainer).

python3 video/anchor_vo_pics.py

For every explainer with an intro in src/tv-intros.js: the photos its script uses first, then, to
make up four, stills from the film itself (cropped above its burned-in captions, skipping near-blank
frames). Writes public/anchors/vo/<film>-<n>.webp (960 px wide) and src/tv-intro-pics.js."""
import json, os, re, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT, N = os.path.join(root, "public/anchors/vo"), 4
os.makedirs(OUT, exist_ok=True)

def ff(*a): subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)
def duration(f): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout or 0)
def busy(f):  # a frame worth showing: not a near-flat card
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-", "-f", "null", "-"], capture_output=True, text=True)
    r = subprocess.run(["ffprobe", "-v", "error", "-f", "lavfi", "-i", f"movie={f},signalstats", "-show_entries", "frame_tags=lavfi.signalstats.YMAX,lavfi.signalstats.YMIN", "-of", "json"], capture_output=True, text=True)
    try: t = json.loads(r.stdout)["frames"][0]["tags"]; return int(t["lavfi.signalstats.YMAX"]) - int(t["lavfi.signalstats.YMIN"]) > 120
    except Exception: return True

manifest = {}
for src in re.findall(r'"(/videos/[^"]+-16x9\.mp4)"', open(os.path.join(root, "src/tv-intros.js")).read()):
    film = src.split("/")[-1].replace("-16x9.mp4", "")
    spec = os.path.join(root, "video/scripts", film.replace("-v2", "") + ".json")
    photos = []
    if os.path.exists(spec):
        for s in json.load(open(spec))["scenes"]:
            p = s.get("src")
            if isinstance(p, str) and p not in photos and os.path.exists(os.path.join(root, "video/scripts", p)): photos.append(p)
    outs = []
    for i, p in enumerate(photos[:N]):
        o = f"{film}-{i + 1}.webp"
        ff("-i", os.path.join(root, "video/scripts", p), "-vf", "scale=960:540:force_original_aspect_ratio=increase,crop=960:540", "-q:v", "72", os.path.join(OUT, o)); outs.append(o)
    mp4 = os.path.join(root, "public", src.lstrip("/"))
    d = duration(mp4) if os.path.exists(mp4) else 0
    t = 0.12
    while len(outs) < N and d and t < 0.95:
        o = f"{film}-{len(outs) + 1}.webp"; tmp = os.path.join(OUT, ".frame.png")
        # Above the captions: the top 76% of the frame, full width, on a blurred fill to 16:9.
        ff("-ss", f"{d * t:.2f}", "-i", mp4, "-frames:v", "1", "-filter_complex",
           "[0]crop=iw:ih*0.76:0:0,split[a][b];[a]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,boxblur=18[bg];"
           "[b]scale=960:-2[fg];[bg][fg]overlay=0:(H-h)/2", tmp)
        if busy(tmp): ff("-i", tmp, "-q:v", "72", os.path.join(OUT, o)); outs.append(o)
        os.remove(tmp); t += 0.17
    manifest[src] = [f"/anchors/vo/{o}" for o in outs]
    print(len(outs), film, f"({min(len(photos), N)} photos)")
with open(os.path.join(root, "src/tv-intro-pics.js"), "w") as f:
    f.write("// Written by `python3 video/anchor_vo_pics.py`: the pictures under the anchor's voice-over, per explainer.\n")
    f.write("export const TV_INTRO_PICS = " + json.dumps(manifest, indent=1) + ";\n")

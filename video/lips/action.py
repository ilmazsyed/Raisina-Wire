"""Raisina TV lip sync, run by the GitHub Action "Raisina TV lip sync" (or by hand).

Asks the site which anchor lines need a lip-synced clip (GET /api/admin/tv/lips-todo), renders each
one (Wav2Lip on the anchor's resting loop with the line's recording; lines shown full screen get the
lower face sharpened with GFPGAN, video/lips/sharpen.py) and uploads it (PUT /api/admin/tv/lip/<id>).
The channel plays an intro on camera as soon as both its clips are in.

  RW_PUBLISH_TOKEN=... WAV2LIP=<Wav2Lip checkout with checkpoints/wav2lip.pth> \\
  GFPGAN_HOME=<folder holding gfpgan/weights/> python video/lips/action.py [minutes]

Stops starting new clips after `minutes` (default 45), so a run stays short; the next run carries on.
"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = os.environ.get("RW_SITE", "https://raisinawire.calibrex.org").rstrip("/")
TOKEN = os.environ.get("RW_PUBLISH_TOKEN", "")
WAV2LIP = Path(os.environ["WAV2LIP"]); GFPGAN_HOME = Path(os.environ["GFPGAN_HOME"])
BUDGET = float(sys.argv[1] if len(sys.argv) > 1 else 45) * 60
FACES = json.loads((ROOT / "video/lips/faces.json").read_text())

def api(method, path, body=None, ctype=None):
    req = urllib.request.Request(SITE + path, data=body, method=method, headers={"authorization": f"Bearer {TOKEN}", "user-agent": "raisina-lips", **({"content-type": ctype} if ctype else {})})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b"{}")

def run(cmd, cwd=None, log=None):
    r = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if r.returncode: raise RuntimeError(f"{cmd[0]} failed:\n{r.stdout[-2000:]}")
    return r.stdout

def render(job, tmp):
    face = FACES.get(job["anchor"])
    if not face: raise RuntimeError(f"no face settings for {job['anchor']} in video/lips/faces.json")
    voice = ROOT / "public/anchors/voice" / f"{job['id']}.mp3"
    if not voice.exists():   # recorded after this checkout: take it from the site
        voice = tmp / "voice.mp3"; urllib.request.urlretrieve(SITE + job["audio"], voice)
    wav, raw, lip, out = tmp / "a.wav", tmp / "raw.mp4", tmp / "lip.mp4", tmp / "out.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(voice), "-ar", "16000", "-ac", "1", str(wav)])
    run([sys.executable, "inference.py", "--checkpoint_path", "checkpoints/wav2lip.pth", "--face", str(ROOT / f"public/anchors/{job['anchor']}-idle.mp4"),
         "--audio", str(wav), "--outfile", str(raw), "--box", *map(str, face["box"]), "--nosmooth", "--wav2lip_batch_size", "32"], cwd=WAV2LIP)
    if job.get("pip"): lip = raw   # the small window: no sharpening needed
    else: run([sys.executable, str(ROOT / "video/lips/sharpen.py"), str(raw), str(lip)], cwd=GFPGAN_HOME)
    run(["ffmpeg", "-v", "error", "-y", "-i", str(lip), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)])
    return out.read_bytes()

def main():
    if not TOKEN: print("::warning::Add the repository secret RW_PUBLISH_TOKEN to render lip sync."); return
    todo = api("GET", "/api/admin/tv/lips-todo")["todo"]
    print(f"{len(todo)} clips to render", flush=True)
    start, done = time.time(), 0
    for job in todo:
        if time.time() - start > BUDGET: print("Time's up for this run; the next one carries on."); break
        t = time.time()
        try:
            with tempfile.TemporaryDirectory() as d: clip = render(job, Path(d))
            api("PUT", f"/api/admin/tv/lip/{job['id']}", clip, "video/mp4"); done += 1
            print(f"done {job['id']} ({job['anchor']}, {len(clip) // 1024} KB, {time.time() - t:.0f} s): {job['text'][:70]}", flush=True)
        except Exception as e:  # one bad line shouldn't stop the rest
            print(f"::warning::{job['id']}: {e}", flush=True)
    print(f"{done} clips uploaded")

main()

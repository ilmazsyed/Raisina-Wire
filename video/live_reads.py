"""Raisina TV live reads: records the anchor reading the lines the channel is waiting for (the
headlines on air, breaking lines, live-input captions) with Kokoro, the explainers' voice engine,
and uploads them. Run every few minutes by the GitHub Action "Raisina TV live reads".

RW_PUBLISH_TOKEN=… python video/live_reads.py        (RW_SITE defaults to the live site)

Needs kokoro-onnx, soundfile, numpy, ffmpeg, and the Kokoro model files in ~/.cache/rw-video
(or RW_VIDEO_MODELS)."""
import json, os, subprocess, sys, urllib.request
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audio import MODEL_DIR, SR, anchor_chain, style_of, trim  # noqa: E402

SITE = os.environ.get("RW_SITE", "https://raisinawire.calibrex.org").rstrip("/")
TOKEN = os.environ.get("RW_PUBLISH_TOKEN", "")
SPEED, LIMIT = 1.06, int(os.environ.get("RW_READS_LIMIT", "80"))
if not TOKEN:   # not set up yet: say so in the run's summary, without failing every ten minutes
    print("::warning::Add the repository secret RW_PUBLISH_TOKEN (the Worker's PUBLISH_TOKEN) to record Raisina TV live reads.")
    sys.exit(0)

def call(method, path, body=None, ctype=None):
    req = urllib.request.Request(SITE + path, data=body, method=method, headers={"authorization": f"Bearer {TOKEN}", "user-agent": "raisina-live-reads", **({"content-type": ctype} if ctype else {})})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b"{}")

todo = call("GET", "/api/admin/tv/voice-todo").get("todo", [])[:LIMIT]
print(f"{len(todo)} lines to record")
if not todo: sys.exit(0)
from kokoro_onnx import Kokoro  # noqa: E402
k = Kokoro(os.path.join(MODEL_DIR, "kokoro-v1.0.onnx"), os.path.join(MODEL_DIR, "voices-v1.0.bin"))
ok = 0
for j in todo:
    try:
        a, _ = k.create(j["text"], voice=style_of(k, j["voice"]), speed=SPEED, lang="en-gb")
        a = anchor_chain(trim(np.asarray(a, dtype=np.float32)), natural=True)
        a = np.concatenate([np.zeros(int(0.12 * SR), np.float32), a, np.zeros(int(0.25 * SR), np.float32)])
        mp3 = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "-"], input=a.tobytes(), capture_output=True, check=True).stdout
        call("PUT", f"/api/admin/tv/voice/{j['id']}", mp3, "audio/mpeg"); ok += 1
        print(f"ok {len(a) / SR:.1f}s {j['text'][:70]}")
    except Exception as e:  # one bad line shouldn't stop the rest
        print(f"failed: {j['text'][:70]}: {e}")
print(f"{ok} of {len(todo)} recorded")

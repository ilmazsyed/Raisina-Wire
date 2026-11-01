"""Raisina TV anchor lines, voiced with Kokoro (called by video/anchor-voices.mjs).

python video/anchor_voices.py <jobs.json> <out_dir>

Each job is {id, voice, text}; writes <out_dir>/<id>.mp3 with the explainers' voice processing."""
import json, os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audio import MODEL_DIR, SR, anchor_chain, style_of, trim  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402

SPEED = 1.06  # the explainer narrator's pace
jobs, out = json.load(open(sys.argv[1])), sys.argv[2]
k = Kokoro(os.path.join(MODEL_DIR, "kokoro-v1.0.onnx"), os.path.join(MODEL_DIR, "voices-v1.0.bin"))
for n, j in enumerate(jobs, 1):
    a, sr = k.create(j["text"], voice=style_of(k, j["voice"]), speed=SPEED, lang="en-gb")
    a = anchor_chain(trim(np.asarray(a, dtype=np.float32)), natural=True)
    a = np.concatenate([np.zeros(int(0.12 * SR), np.float32), a, np.zeros(int(0.25 * SR), np.float32)])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", "80k", os.path.join(out, f"{j['id']}.mp3")], input=a.tobytes(), check=True)
    print(f"{n}/{len(jobs)} {j['id']} {len(a) / SR:.1f}s {j['text'][:50]}")

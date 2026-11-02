"""Raisina TV anchors' voices with Chatterbox (Resemble AI, MIT), on CPU: each anchor speaks in the
voice of their reference clip (public/anchors/<key>-ref.wav), expressively, sentence by sentence
with a short breath between sentences, levelled for broadcast. Used by the GitHub Actions "Raisina TV
live reads" and "Raisina TV anchor voices"."""
import os, re, subprocess, tempfile
import numpy as np, torch
from chatterbox.tts import ChatterboxTTS

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXAGGERATION, CFG = 0.7, 0.35   # "expressive", the editor's choice for Tara
torch.set_num_threads(os.cpu_count() or 4)
_m, _ref = None, None

def _model():
    global _m
    if _m is None: _m = ChatterboxTTS.from_pretrained(device="cpu")
    return _m

def speak(text, ref):
    """MP3 bytes of `text` in the voice of `ref` (a path under the site, e.g. /anchors/tara-ref.wav)."""
    global _ref
    m = _model(); path = os.path.join(ROOT, "public", ref.lstrip("/"))
    if _ref != path: m.prepare_conditionals(path, exaggeration=EXAGGERATION); _ref = path
    parts = [p for p in re.split(r"(?<=[.!?])\s+", text.strip()) if p]
    gap = np.zeros(int(0.32 * m.sr), np.float32); out = []
    for i, p in enumerate(parts):
        torch.manual_seed(7)
        out.append(m.generate(p, exaggeration=EXAGGERATION, cfg_weight=CFG).squeeze(0).numpy().astype(np.float32))
        if i < len(parts) - 1: out.append(gap)
    a = np.concatenate([np.zeros(int(0.12 * m.sr), np.float32), *out, np.zeros(int(0.25 * m.sr), np.float32)])
    return subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(m.sr), "-ac", "1", "-i", "-", "-af", "loudnorm=I=-17:TP=-1.5",
                           "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "80k", "-f", "mp3", "-"], input=a.tobytes(), capture_output=True, check=True).stdout

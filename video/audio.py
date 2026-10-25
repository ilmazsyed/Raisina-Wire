"""Raisina Wire video engine: narration and score.

python3 video/audio.py <spec.json> <out_dir>

Reads each scene's `say` line, voices it with Kokoro (offline), lays the lines end to end with
a short breath between scenes, then writes:
  timing.json  when each scene starts and how long it lasts, and the caption chunks
  audio.m4a    the narration over an original score (pads, a soft pulse and a whoosh on each cut),
               with the music ducked under the voice
The visuals (engine.js) follow timing.json, so picture and sound stay locked."""
import json, os, re, subprocess, sys
import numpy as np, soundfile as sf

SR = 24000
MODEL_DIR = os.environ.get("RW_VIDEO_MODELS", os.path.expanduser("~/.cache/rw-video"))
LEAD, TAIL, GAP, MIN_SCENE = 0.6, 2.4, 0.55, 2.8      # seconds


def voice_lines(spec):
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(MODEL_DIR, "kokoro-v1.0.onnx"), os.path.join(MODEL_DIR, "voices-v1.0.bin"))
    voice, speed = spec.get("voice", "bf_emma"), float(spec.get("speed", 1.0))
    lang = "en-gb" if voice.startswith("b") else "hi" if voice.startswith("h") else "en-us"
    out = []
    for sc in spec["scenes"]:
        text = sc.get("say", "").strip()
        if not text:
            out.append(np.zeros(0, dtype=np.float32)); continue
        # `speak` overrides the spoken form (spellings that help pronunciation); captions use `say`
        a, sr = k.create(sc.get("speak", text), voice=voice, speed=float(sc.get("speed", speed)), lang=lang)
        assert sr == SR, sr
        a = trim(a.astype(np.float32))
        out.append(a / (np.max(np.abs(a)) + 1e-9) * 0.89)
    return out


def trim(a, thr=0.01):
    idx = np.where(np.abs(a) > thr)[0]
    return a[max(0, idx[0] - 240): idx[-1] + 2400] if len(idx) else a


def chunks(text, max_chars):
    """Split narration into caption-sized pieces at punctuation, then at word boundaries."""
    parts, out = re.split(r"(?<=[.,;:?!—])\s+", text.strip()), []
    for p in parts:
        words, line = p.split(), ""
        for w in words:
            if len(line) + len(w) + 1 > max_chars and line:
                out.append(line); line = w
            else:
                line = f"{line} {w}".strip()
        if line: out.append(line)
    # fold very short pieces into their neighbour
    merged = []
    for c in out:
        if merged and (len(c) < 12 or len(merged[-1]) < 12) and len(merged[-1]) + len(c) + 1 <= max_chars * 1.25:
            merged[-1] += " " + c
        else:
            merged.append(c)
    return merged


def build_timing(spec, lines):
    # brisk pieces (pace > 1.2) breathe less between scenes
    fast = float(spec.get("pace", 1)) > 1.2
    gap, min_scene = (0.25, 2.2) if fast else (GAP, MIN_SCENE)
    t, scenes, caps = LEAD, [], []
    for sc, a in zip(spec["scenes"], lines):
        vdur = len(a) / SR
        dur = max(min_scene, vdur + gap + float(sc.get("hold", 0)))
        scenes.append({"start": round(t, 3), "dur": round(dur, 3), "voiceAt": round(t + 0.15, 3), "voiceDur": round(vdur, 3), "type": sc["type"]})
        text = sc.get("say", "").strip()
        if text:
            pieces = chunks(text, int(spec.get("captionChars", 44)))
            total = sum(len(p) for p in pieces)
            c0 = t + 0.15
            for p in pieces:
                d = vdur * len(p) / total
                caps.append({"t0": round(c0, 3), "t1": round(c0 + d, 3), "text": p}); c0 += d
        t += dur
    return {"total": round(t + TAIL, 3), "scenes": scenes, "captions": caps}


# ---------------------------------------------------------------- score
def hz(n): return 440.0 * 2 ** ((n - 69) / 12)


def lowpass(x, cut):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (f / cut) ** 4), len(x))


def score(timing, seed=11, bpm=92):
    rng = np.random.default_rng(seed)
    N = int(timing["total"] * SR); T = np.arange(N) / SR
    L = np.zeros(N); R = np.zeros(N)
    # pads: one chord per scene, cycling a calm minor progression, crossfaded
    prog = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]]
    for i, sc in enumerate(timing["scenes"]):
        s0, s1 = sc["start"] - 0.8, sc["start"] + sc["dur"] + 0.8
        i0, i1 = max(0, int(s0 * SR)), min(N, int(s1 * SR)); tt = T[i0:i1]
        env = np.clip((tt - s0) / 1.2, 0, 1) * np.clip((s1 - tt) / 1.2, 0, 1)
        for j, n in enumerate(prog[i % len(prog)]):
            f = hz(n); det = 1 + (j - 2) * 0.0009
            w = np.sin(2 * np.pi * f * det * tt + j) + 0.35 * np.sin(2 * np.pi * f * 2.002 * tt) + 0.12 * np.sin(2 * np.pi * f * 3.01 * tt)
            breath = 0.75 + 0.25 * np.sin(2 * np.pi * (0.07 + j * 0.013) * tt + j)
            pan = (j - 2) * 0.18
            L[i0:i1] += w * env * breath * 0.035 * (1 - pan); R[i0:i1] += w * env * breath * 0.035 * (1 + pan)
    # a soft pulse (low tom + tick) at 92 bpm, from the first scene to the outro
    beat = 60 / bpm
    start, stop = timing["scenes"][0]["start"] + 1.0, timing["scenes"][-1]["start"]
    b = start
    k = 0
    while b < stop:
        i = int(b * SR); d = int(0.35 * SR); tt = np.arange(min(d, N - i)) / SR
        thump = np.sin(2 * np.pi * (58 + 40 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9) * (0.11 if k % 4 == 0 else 0.06)
        L[i:i + len(tt)] += thump; R[i:i + len(tt)] += thump
        if k % 2 == 1:
            n = rng.standard_normal(len(tt)) * np.exp(-tt * 60) * 0.012
            L[i:i + len(tt)] += n * 0.7; R[i:i + len(tt)] += n
        b += beat; k += 1
    # whoosh into every scene after the first
    for sc in timing["scenes"][1:]:
        s = sc["start"] - 0.45; i = max(0, int(s * SR)); d = int(0.7 * SR); tt = np.arange(min(d, N - i)) / SR
        noise = lowpass(rng.standard_normal(len(tt)), 2400) * np.sin(np.pi * tt / 0.7) ** 2 * 0.05
        L[i:i + len(tt)] += noise; R[i:i + len(tt)] += noise[::-1] if len(noise) else noise
    # a closing swell and low hit on the outro
    o = timing["scenes"][-1]["start"]; i = int(o * SR); tt = np.arange(min(int(3 * SR), N - i)) / SR
    hit = np.sin(2 * np.pi * 49 * tt) * np.exp(-tt * 1.6) * 0.16
    L[i:i + len(tt)] += hit; R[i:i + len(tt)] += hit
    return np.stack([L, R], 1)


def main():
    spec_path, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    spec = json.load(open(spec_path))
    lines = voice_lines(spec)
    timing = build_timing(spec, lines)
    N = int(timing["total"] * SR)
    vo = np.zeros(N)
    for sc, a in zip(timing["scenes"], lines):
        i = int(sc["voiceAt"] * SR); vo[i:i + len(a)] += a[: max(0, N - i)]
    music = score(timing, int(spec.get("seed", 11)), 112 if float(spec.get("pace", 1)) > 1.2 else 92)
    # duck the music under the voice (smoothed envelope)
    env = np.convolve(np.abs(vo), np.ones(int(0.25 * SR)) / int(0.25 * SR), "same")
    duck = 1 - 0.55 * np.clip(env / 0.05, 0, 1)
    duck = np.convolve(duck, np.ones(int(0.3 * SR)) / int(0.3 * SR), "same")
    mix = music * duck[:, None] + np.stack([vo, vo], 1) * 0.95
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix *= 0.9 / (np.max(np.abs(mix)) + 1e-9)
    sf.write(os.path.join(out, "audio.wav"), mix.astype(np.float32), SR)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(out, "audio.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "48000", "-c:a", "aac", "-b:a", "160k", os.path.join(out, "audio.m4a")], check=True)
    json.dump(timing, open(os.path.join(out, "timing.json"), "w"), indent=1)
    print(f"{len(timing['scenes'])} scenes, {timing['total']:.1f}s → {out}")


if __name__ == "__main__":
    main()

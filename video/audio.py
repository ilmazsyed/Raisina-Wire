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
# Two anchors who take turns, scene by scene: Kokoro's liveliest female and male voices, read briskly.
ANCHORS = ["af_bella", "am_michael"]
ANCHOR_SPEED = {"af_bella": 1.12, "am_michael": 1.22}   # matched so both read at an anchor's clip


def voices_for(spec):
    """The voice for each scene: a scene's own `voice`, else the spec's `voices` taken in turn
    (two anchors by default), else a single `voice` only when `alternate` is false."""
    if spec.get("voices"): pool = spec["voices"]
    elif spec.get("alternate") is False and spec.get("voice"): pool = [spec["voice"]]
    else: pool = ANCHORS
    out, k = [], 0
    for sc in spec["scenes"]:
        if sc.get("voice"): out.append(sc["voice"])
        else: out.append(pool[k % len(pool)]); k += 1
    return out


def voice_lines(spec):
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(MODEL_DIR, "kokoro-v1.0.onnx"), os.path.join(MODEL_DIR, "voices-v1.0.bin"))
    out = []
    for sc, voice in zip(spec["scenes"], voices_for(spec)):
        text = sc.get("say", "").strip()
        if not text:
            out.append(np.zeros(0, dtype=np.float32)); continue
        lang = "en-gb" if voice.startswith("b") else "hi" if voice.startswith("h") else "en-us"
        # `speak` overrides the spoken form (spellings that help pronunciation); captions use `say`
        a, sr = k.create(sc.get("speak", text), voice=voice, speed=float(sc.get("speed", spec.get("anchorSpeed", ANCHOR_SPEED.get(voice, 1.15)))), lang=lang)
        assert sr == SR, sr
        out.append(anchor_chain(trim(a.astype(np.float32))))
    return out


def anchor_chain(a):
    """Broadcast voice processing: cut rumble, lift presence (2–6 kHz) and air, compress, level."""
    if not len(a): return a
    X = np.fft.rfft(a); f = np.fft.rfftfreq(len(a), 1 / SR)
    X *= 1 - 1 / (1 + (f / 90) ** 4)                                  # high-pass ~90 Hz
    X *= 1 + 0.55 * np.exp(-((f - 3800) / 1600) ** 2)                 # presence, about +4 dB
    X *= 1 + 0.25 / (1 + (8000 / np.maximum(f, 1)) ** 4)              # a little air
    X *= 1 - 0.18 * np.exp(-((f - 350) / 180) ** 2)                   # less boxiness
    y = np.fft.irfft(X, len(a))
    # compressor: 10 ms RMS follower, 3:1 above the threshold
    win = int(0.01 * SR); env = np.sqrt(np.convolve(y ** 2, np.ones(win) / win, "same")) + 1e-6
    thr = np.percentile(env, 70) * 0.8
    gain = np.where(env > thr, (env / thr) ** (1 / 3 - 1), 1.0)
    gain = np.convolve(gain, np.ones(win) / win, "same")
    y = y * gain
    y = np.tanh(y / (np.max(np.abs(y)) + 1e-9) * 1.4) / np.tanh(1.4)   # gentle saturation for density
    rms = np.sqrt(np.mean(y[np.abs(y) > 0.02] ** 2)) if np.any(np.abs(y) > 0.02) else 0.1
    return (y * (0.2 / rms)).clip(-0.98, 0.98).astype(np.float32)


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
        if bpm >= 110:   # news-bed drive: off-beat hats and a pulsing bass on every beat
            h = int((b + beat / 2) * SR); hd = min(int(0.06 * SR), N - h)
            if hd > 0:
                hat = lowpass(rng.standard_normal(hd), 9000) * np.exp(-np.arange(hd) / SR * 70) * 0.02
                L[h:h + hd] += hat * 0.8; R[h:h + hd] += hat
            root = [45, 41, 43, 40][(k // 8) % 4] - 12; bd = min(int(beat * 0.9 * SR), N - i); bt = np.arange(bd) / SR
            bass = np.sin(2 * np.pi * hz(root) * bt) * np.exp(-bt * 5) * 0.05
            L[i:i + bd] += bass; R[i:i + bd] += bass
        b += beat; k += 1
    # whoosh into every scene after the first
    for sc in timing["scenes"][1:]:
        s = sc["start"] - 0.45; i = max(0, int(s * SR)); d = int(0.7 * SR); tt = np.arange(min(d, N - i)) / SR
        noise = lowpass(rng.standard_normal(len(tt)), 2400 if bpm < 110 else 5200) * np.sin(np.pi * tt / 0.7) ** 2 * (0.05 if bpm < 110 else 0.07)
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
    music = score(timing, int(spec.get("seed", 11)), 120 if float(spec.get("pace", 1)) > 1.2 else 92)
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

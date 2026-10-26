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
# Two British anchors who take turns, scene by scene: Kokoro's best British female and male voices,
# each sped so both read at about 2.7 words a second, a brisk news pace.
ANCHORS = ["bf_emma", "bm_george"]
# The Vox-style narrator: one Indian-English female voice (Kokoro's Hindi voice blended with a
# British one, reading English), chosen by the editor.
NARRATOR = "hf_beta:0.6+bf_isabella:0.4"
ANCHOR_SPEED = {NARRATOR: 1.06, "bf_emma": 1.15, "bm_george": 1.3, "af_bella": 1.12, "am_michael": 1.22}


def voices_for(spec):
    """The voice for each scene: a scene's own `voice`, else the spec's `voices` taken in turn
    (two anchors by default), else a single `voice` only when `alternate` is false."""
    if spec.get("voices"): pool = spec["voices"]
    elif spec.get("style") == "vox": pool = [spec.get("voice") or NARRATOR]
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
        # English is phonemised as British English whatever the voice (an Indian voice reads English
        # with its own accent); `lang` in the spec overrides
        lang = spec.get("lang") or ("en-us" if voice.startswith("a") else "en-gb")
        speed = float(sc.get("speed", spec.get("anchorSpeed", ANCHOR_SPEED.get(voice, 1.15))))
        # `speak` overrides the spoken form (spellings that help pronunciation); captions use `say`
        a, sr = k.create(sc.get("speak", text), voice=style_of(k, voice), speed=speed, lang=lang)
        assert sr == SR, sr
        out.append(anchor_chain(trim(a.astype(np.float32)), natural=spec.get("style") == "vox"))
    return out


def style_of(k, voice):
    """A voice name, or a blend such as "hf_beta:0.6+bf_isabella:0.4"."""
    if "+" not in voice and ":" not in voice: return voice
    mix = None
    for part in voice.split("+"):
        name, _, w = part.partition(":"); v = k.get_voice_style(name.strip()) * float(w or 1)
        mix = v if mix is None else mix + v
    return mix


def anchor_chain(a, natural=False):
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
    gain = np.where(env > thr, (env / thr) ** ((1 / 2 if natural else 1 / 3) - 1), 1.0)
    gain = np.convolve(gain, np.ones(win) / win, "same")
    y = y * gain
    if not natural:   # gentle saturation for density (the Vox style keeps the voice clean and open)
        y = np.tanh(y / (np.max(np.abs(y)) + 1e-9) * 1.4) / np.tanh(1.4)
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
    vox = spec.get("style") == "vox"
    gap, min_scene = (0.25, 2.2) if fast else (GAP, MIN_SCENE)
    if vox: min_scene = 1.3
    t, scenes, caps = LEAD, [], []
    for sc, a in zip(spec["scenes"], lines):
        vdur = len(a) / SR
        g = (0.42 if sc.get("para") else 0.08) if vox else gap   # Vox: shots run on; a breath only between paragraphs
        dur = max(min_scene, vdur + g + float(sc.get("hold", 0)))
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


# ---------------------------------------------------------------- Vox sound design
def word_times(text, vd, lead=0.15):
    """When each word is spoken (the engine's wordTimes): weighted by length, pauses after punctuation."""
    ws = [w for w in str(text or "").split() if w]
    wt = [len(re.sub(r"[^\w]", "", w)) + 2 + (5 if re.search(r"[.!?…][\"”’]?$", w) else 3 if re.search(r"[,;:—–]$", w) else 0) for w in ws]
    tot = sum(wt) or 1; acc = 0; out = []
    for w in wt: out.append(lead + vd * 0.97 * acc / tot); acc += w
    return out


def time_of(sc, at, vd, fallback=0.5):
    if isinstance(at, (int, float)): return 0.15 + vd * at
    if isinstance(at, str):
        ws = str(sc.get("say", "")).split(); n = lambda w: re.sub(r"[^\w]", "", w.lower())
        for i, w in enumerate(ws):
            if n(w).startswith(n(at)): return word_times(sc.get("say"), vd)[i]
    return 0.15 + vd * fallback


def cut_of(spec, i):
    return spec["scenes"][i].get("cut") or ("cut" if i == 0 else ["cut", "whip", "cut", "zoom"][i % 4])


def sfx_track(spec, timing, N, rng):
    L = np.zeros(N); R = np.zeros(N)
    def put(t, x, pan=0.0, g=1.0):
        i = int(t * SR)
        if i < 0 or i >= N: return
        x = x[: N - i] * g; L[i:i + len(x)] += x * (1 - pan); R[i:i + len(x)] += x * (1 + pan)
    def env(d, a=0.005, r=None):
        n = int(d * SR); tt = np.arange(n) / SR; e = np.clip(tt / a, 0, 1)
        return tt, e * (np.exp(-tt * (r or 8)))
    def whoosh(d=0.34):
        n = int(d * SR); tt = np.arange(n) / SR
        x = lowpass(rng.standard_normal(n), 5000) * np.sin(np.pi * tt / d) ** 2
        return x * 0.12
    def pop():
        tt, e = env(0.09, 0.002, 45); return np.sin(2 * np.pi * (900 - 500 * tt / 0.09) * tt) * e * 0.12
    def tick():
        tt, e = env(0.03, 0.001, 140); return (rng.standard_normal(len(tt)) * 0.5 + np.sin(2 * np.pi * 2400 * tt)) * e * 0.05
    def thump():
        tt, e = env(0.4, 0.003, 9); return np.sin(2 * np.pi * (52 + 70 * np.exp(-tt * 28)) * tt) * e * 0.3
    def scratch(d=0.42):
        n = int(d * SR); tt = np.arange(n) / SR
        x = rng.standard_normal(n); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR); X *= np.exp(-((f - 3200) / 1800) ** 2); x = np.fft.irfft(X, n)
        am = 0.6 + 0.4 * np.sin(2 * np.pi * 14 * tt + rng.uniform(0, 6))
        return x / (np.max(np.abs(x)) + 1e-9) * am * np.sin(np.pi * tt / d) * 0.05
    for i, (sc, tm) in enumerate(zip(spec["scenes"], timing["scenes"])):
        s0, vd, typ = tm["start"], tm["voiceDur"], sc["type"]
        c = cut_of(spec, i)
        if i > 0:
            if c == "whip": put(s0 - 0.12, whoosh(), pan=0.3)
            elif c == "zoom": put(s0 - 0.15, whoosh(0.3) * 0.8); put(s0 + 0.05, thump() * 0.5)
            else: put(s0, tick())
        if typ == "kinetic":
            same = not sc.get("text") or sc.get("text") == sc.get("say")
            hl = {re.sub(r"[^\w]", "", h.lower()) for h in sc.get("hl", [])}
            if same and hl:
                for w, t in zip(str(sc.get("say", "")).split(), word_times(sc.get("say"), vd)):
                    if re.sub(r"[^\w]", "", w.lower()) in hl: put(s0 + t + 0.02, pop())
        elif typ in ("number", "versus"):
            starts = [0.12] + ([time_of(sc, sc.get("at"), vd)] if typ == "versus" else [])
            for st in starts:
                for k in range(14): put(s0 + st + k * 0.045, tick() * 0.6, pan=(k % 2 - 0.5) * 0.3)
                put(s0 + st + 0.66, thump())
        elif typ == "snap":
            for mi, m in enumerate(sc.get("marks", [])):
                t = time_of(sc, m.get("at"), vd, (mi + 1) / (len(sc["marks"]) + 1))
                put(s0 + t, pop() if m.get("kind") == "label" else scratch(), pan=0.15 * (mi % 2 * 2 - 1))
        elif typ == "doc" and sc.get("hl"):
            put(s0 + time_of(sc, sc.get("at") if sc.get("at") is not None else str(sc["hl"]).split()[0], vd, 0.4), scratch(0.5) * 0.8)
    return np.stack([L, R], 1)


def vox_bed(timing, rng, bpm=100):
    """A driving news bed: kick, off-beat hats, a moving bass and a low pad; a stop before the outro."""
    N = int(timing["total"] * SR); T = np.arange(N) / SR; L = np.zeros(N); R = np.zeros(N)
    beat = 60 / bpm; start, stop = timing["scenes"][0]["start"], timing["scenes"][-1]["start"]
    roots = [45, 41, 48, 43]; b = start; k = 0
    while b < stop:
        i = int(b * SR); bar = k // 4; root = roots[bar % 4]
        d = min(int(0.3 * SR), N - i); tt = np.arange(d) / SR
        if k % 2 == 0:
            kick = np.sin(2 * np.pi * (48 + 90 * np.exp(-tt * 35)) * tt) * np.exp(-tt * 11) * 0.16
            L[i:i + d] += kick; R[i:i + d] += kick
        h = int((b + beat / 2) * SR); hd = min(int(0.05 * SR), N - h)
        if hd > 0:
            hat = lowpass(rng.standard_normal(hd), 11000) * np.exp(-np.arange(hd) / SR * 80) * 0.025
            L[h:h + hd] += hat * 0.7; R[h:h + hd] += hat
        bd = min(int(beat * 0.95 * SR), N - i); bt = np.arange(bd) / SR
        note = root - 24 + (7 if k % 4 == 3 else 0)
        bass = np.sin(2 * np.pi * hz(note) * bt) * np.exp(-bt * 3.5) * 0.07
        L[i:i + bd] += bass; R[i:i + bd] += bass
        if k % 16 == 0:   # a low pad per four bars
            pd = min(int(beat * 16 * SR), N - i); pt = np.arange(pd) / SR; pe = np.clip(pt / 0.8, 0, 1) * np.clip((pd / SR - pt) / 0.8, 0, 1)
            for j, n in enumerate([root - 12, root - 5, root, root + 3]):
                w = np.sin(2 * np.pi * hz(n) * pt + j) * pe * 0.02
                L[i:i + pd] += w * (1 - (j - 1.5) * 0.2); R[i:i + pd] += w * (1 + (j - 1.5) * 0.2)
        b += beat; k += 1
    o = timing["scenes"][-1]["start"]; i = int(o * SR); tt = np.arange(min(int(2.5 * SR), N - i)) / SR
    hit = np.sin(2 * np.pi * 45 * tt) * np.exp(-tt * 1.8) * 0.2; L[i:i + len(tt)] += hit; R[i:i + len(tt)] += hit
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
    if spec.get("style") == "vox":
        rng = np.random.default_rng(int(spec.get("seed", 11)))
        music, fx = vox_bed(timing, rng, int(spec.get("bpm", 100))), sfx_track(spec, timing, N, rng)
    else:
        music, fx = score(timing, int(spec.get("seed", 11)), 120 if float(spec.get("pace", 1)) > 1.2 else 92), 0
    # duck the music under the voice (smoothed envelope)
    env = np.convolve(np.abs(vo), np.ones(int(0.25 * SR)) / int(0.25 * SR), "same")
    duck = 1 - 0.55 * np.clip(env / 0.05, 0, 1)
    duck = np.convolve(duck, np.ones(int(0.3 * SR)) / int(0.3 * SR), "same")
    mix = music * duck[:, None] + fx + np.stack([vo, vo], 1) * 0.95   # effects sit on top, not ducked
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix *= 0.9 / (np.max(np.abs(mix)) + 1e-9)
    sf.write(os.path.join(out, "audio.wav"), mix.astype(np.float32), SR)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(out, "audio.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "48000", "-c:a", "aac", "-b:a", "160k", os.path.join(out, "audio.m4a")], check=True)
    json.dump(timing, open(os.path.join(out, "timing.json"), "w"), indent=1)
    print(f"{len(timing['scenes'])} scenes, {timing['total']:.1f}s → {out}")


if __name__ == "__main__":
    main()

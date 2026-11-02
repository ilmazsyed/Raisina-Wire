"""Voice lab: Tara's Iran line with Chatterbox (MIT), for comparison with Kokoro.
Run by .github/workflows/voice-lab.yml; writes MP3s to video/voice-lab/out/."""
import os, subprocess, time, torch, torchaudio
from chatterbox.tts import ChatterboxTTS
torch.set_num_threads(os.cpu_count() or 4)
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
TEXT = "Strike Iran again, and the answer will have no limits. That is the order Iran's new supreme leader, Mojtaba Khamenei, has given his generals."
REF = os.path.join(HERE, "tara-reference.wav")
m = ChatterboxTTS.from_pretrained(device="cpu")
for name, kw in [
    ("chatterbox-tara", dict(audio_prompt_path=REF, exaggeration=0.5, cfg_weight=0.5)),
    ("chatterbox-tara-expressive", dict(audio_prompt_path=REF, exaggeration=0.7, cfg_weight=0.35)),
    ("chatterbox-builtin", dict(exaggeration=0.5, cfg_weight=0.5)),
]:
    t = time.time(); torch.manual_seed(7)
    wav = m.generate(TEXT, **kw)
    w = os.path.join(OUT, f"{name}.wav"); torchaudio.save(w, wav, m.sr)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", w, "-af", "loudnorm=I=-17:TP=-1", "-ar", "24000", "-ac", "1", "-b:a", "128k", w[:-4] + ".mp3"], check=True); os.remove(w)
    print(f"{name}: {wav.shape[-1] / m.sr:.1f}s audio in {time.time() - t:.0f}s", flush=True)

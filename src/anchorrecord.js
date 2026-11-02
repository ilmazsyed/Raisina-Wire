// Raisina TV live reads, recorded in the editor's browser with Kokoro, the explainers' voice engine.
// When the control room is open, the lines the channel needs read in full ("Breaking news. …",
// "We're bringing you live visuals of …") are generated here in the anchor's own voice, given the
// explainers' broadcast polish, and uploaded; viewers then hear them on Raisina TV. The first
// time, the browser downloads the voice model (about 90 MB, then kept in its cache).
const KOKORO = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const SPEED = 1.06; // the explainer narrator's pace
let tts = null, running = null;

async function engine(status) {
  if (tts) return tts;
  status("Loading the anchor's voice (the first time takes a minute)…");
  const { KokoroTTS } = await import(/* @vite-ignore */ KOKORO);
  tts = await KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm" });
  // Our anchors' voices are blends served by the site; the first letter sets the accent
  // ("b": British English, as in the explainers).
  tts._validate_voice = v => v.at(0);
  return tts;
}
// kokoro-js fetches a voice from Hugging Face by name; ours come from the site instead.
async function withVoice(name, file, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = (u, o) => (String(u?.url || u).endsWith(`/voices/${name}.bin`) ? real(file, o) : real(u, o));
  try { return await fn(); } finally { globalThis.fetch = real; }
}

export function trim(a, thr = 0.01) {
  let s = 0, e = a.length - 1;
  while (s < e && Math.abs(a[s]) < thr) s++;
  while (e > s && Math.abs(a[e]) < thr) e--;
  return a.slice(Math.max(0, s - 240), Math.min(a.length, e + 2400));
}
// The explainers' voice polish (video/audio.py anchor_chain, natural): rumble cut, presence and
// air, a little less boxiness, gentle compression, levelled; a breath of silence either side.
export async function polish(samples, sr) {
  const lead = Math.round(0.12 * sr), len = samples.length + lead + Math.round(0.25 * sr);
  const ctx = new OfflineAudioContext(1, len, sr);
  const buf = ctx.createBuffer(1, samples.length, sr); buf.copyToChannel(samples, 0);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = (type, freq, gain = 0, Q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.gain.value = gain; b.Q.value = Q; return b; };
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -22; comp.knee.value = 6; comp.ratio.value = 2; comp.attack.value = 0.005; comp.release.value = 0.12;
  let node = src;
  for (const n of [f("highpass", 90), f("peaking", 3800, 4, 1.2), f("highshelf", 8000, 2), f("peaking", 350, -1.6, 1.4), comp]) { node.connect(n); node = n; }
  node.connect(ctx.destination);
  src.start(lead / sr);
  const out = (await ctx.startRendering()).getChannelData(0);
  let s = 0, n = 0;
  for (const v of out) if (Math.abs(v) > 0.02) { s += v * v; n++; }
  const g = 0.2 / (Math.sqrt(s / Math.max(n, 1)) || 0.1);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-0.98, Math.min(0.98, out[i] * g));
  return out;
}
export function wav(samples, sr) {
  const b = new DataView(new ArrayBuffer(44 + samples.length * 2)), w = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); b.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt "); b.setUint32(16, 16, true);
  b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true);
  w(36, "data"); b.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) b.setInt16(44 + i * 2, Math.round(samples[i] * 32767), true);
  return new Uint8Array(b.buffer);
}

// Records every live read the channel is waiting for; `status` gets progress lines for the page.
export function recordLiveReads(status = () => {}) {
  return (running ||= (async () => {
    const r = await fetch("/api/admin/tv/voice-todo", { cache: "no-store" });
    if (!r.ok) return 0;
    const { todo } = await r.json();
    if (!todo?.length) return 0;
    const t = await engine(status);
    for (const [i, job] of todo.entries()) {
      status(`Recording the anchor's live read ${i + 1} of ${todo.length}: “${job.text}”`);
      const voice = `b_rw_${job.anchor}_1`; // bump the number when a voice blend changes (the browser caches voices by name)
      const a = await withVoice(voice, job.voiceFile, () => t.generate(job.say || job.text, { voice, speed: SPEED }));
      const body = wav(await polish(trim(a.audio), a.sampling_rate), a.sampling_rate);
      const up = await fetch(`/api/admin/tv/voice/${job.id}`, { method: "PUT", body, headers: { "content-type": "audio/wav" } });
      if (!up.ok) throw new Error((await up.json().catch(() => ({}))).error || "Upload failed.");
    }
    status(`Recorded ${todo.length} live read${todo.length > 1 ? "s" : ""}. Raisina TV will use ${todo.length > 1 ? "them" : "it"} within a few seconds.`);
    return todo.length;
  })().catch(e => { status(`The anchor's voice couldn't be recorded here: ${e.message}. Raisina TV uses her standard line meanwhile.`); return 0; })
    .finally(() => { running = null; }));
}

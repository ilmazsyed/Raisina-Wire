// Raisina TV music: four original news themes and a breaking-news theme, synthesised in the
// browser with Web Audio (no files, no licences), plus the desk's own tracks from the control
// room. Each theme has a stinger (a riser into an impact and a chord) and a bed for headline
// sets and the promo. A rotation never plays the same track twice in a row.
let ctx = null, master = null, verb = null;

export const THEMES = {
  pulse: { name: "Pulse (urgent)", bpm: 124, root: 57, minor: true, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
  bright: { name: "Bright (morning)", bpm: 112, root: 62, minor: false, chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]] },
  cinema: { name: "Cinema (big)", bpm: 78, root: 48, minor: true, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]] },
  beat: { name: "Beat (clockwork)", bpm: 128, root: 52, minor: true, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-1, 3, 6]] }
};
const hz = m => 440 * 2 ** ((m - 69) / 12);

export function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = 0.55;
  master.connect(comp).connect(ctx.destination);
  // A short hall: decaying noise as the impulse.
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
  verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.28; verb.connect(wet).connect(master);
  return ctx;
}
export const suspend = () => ctx?.state === "running" && ctx.suspend();
// The music dips under the anchor's voice and comes back after (the desk's tracks too).
let duckK = 1;
export function duck(on) {
  duckK = on ? 0.22 : 1;
  if (master) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.55 * duckK, t + (on ? 0.25 : 0.6)); }
  playing.forEach(a => { a.volume = on ? Math.min(a.volume, 0.7 * duckK) : a.volume > 0.05 ? 0.7 : a.volume; });
}
export const resume = () => ctx?.state === "suspended" && ctx.resume();

let noiseBuf = null;
const noise = () => { if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
// One voice: an oscillator (or noise) through a filter and an envelope, into a bus.
function voice(bus, t, { type = "sine", f = 220, f2, dur = 0.3, a = 0.005, gain = 0.3, filter, q = 1, fEnd, isNoise = false, send = 0.2, detune = 0 }) {
  const src = isNoise ? noise() : ctx.createOscillator();
  if (!isNoise) { src.type = type; src.frequency.setValueAtTime(f, t); src.detune.value = detune; if (f2) src.frequency.exponentialRampToValueAtTime(f2, t + dur); }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = src;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = filter[0]; fl.frequency.setValueAtTime(filter[1], t); if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur); fl.Q.value = q; node.connect(fl); node = fl; }
  node.connect(g); g.connect(bus);
  if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb); }
  src.start(t); src.stop(t + dur + 0.05);
}
const kick = (b, t, v = 0.9) => voice(b, t, { f: 130, f2: 42, dur: 0.42, gain: v, send: 0 });
const boom = (b, t) => { voice(b, t, { f: 75, f2: 28, dur: 1.6, gain: 1, send: 0.4 }); voice(b, t, { isNoise: true, dur: 1.2, gain: 0.5, filter: ["lowpass", 900], fEnd: 120, send: 0.5 }); };
const clap = (b, t) => voice(b, t, { isNoise: true, dur: 0.16, gain: 0.35, filter: ["bandpass", 1600], q: 0.8, send: 0.3 });
const hat = (b, t, v = 0.12) => voice(b, t, { isNoise: true, dur: 0.05, gain: v, filter: ["highpass", 8000], send: 0 });
const pluck = (b, t, m, v = 0.18) => voice(b, t, { type: "triangle", f: hz(m), dur: 0.35, gain: v, filter: ["lowpass", 4000], fEnd: 600, send: 0.35 });
const tick = (b, t, m) => voice(b, t, { type: "square", f: hz(m), dur: 0.06, gain: 0.07, filter: ["highpass", 1200], send: 0.1 });
const bass = (b, t, m, d) => voice(b, t, { type: "sawtooth", f: hz(m), dur: d, gain: 0.32, a: 0.01, filter: ["lowpass", 420], q: 6, send: 0 });
function pad(b, t, notes, d, v = 0.07) { for (const m of notes) for (const det of [-8, 0, 7]) voice(b, t, { type: "sawtooth", f: hz(m), dur: d, a: Math.min(0.6, d / 3), gain: v, filter: ["lowpass", 1400], detune: det, send: 0.5 }); }
function stab(b, t, notes, v = 0.16) { for (const m of notes) voice(b, t, { type: "sawtooth", f: hz(m), dur: 0.5, gain: v, filter: ["lowpass", 3200], fEnd: 500, q: 2, send: 0.45 }); }
function riser(b, t, d) { voice(b, t, { isNoise: true, dur: d, a: d * 0.9, gain: 0.32, filter: ["bandpass", 300], fEnd: 7000, q: 2, send: 0.4 }); voice(b, t, { type: "sine", f: 180, f2: 900, dur: d, a: d * 0.9, gain: 0.08, send: 0.3 }); }

// A bus that can be faded and stopped.
function bus() { const g = ctx.createGain(); g.gain.value = 1; g.connect(master); return { g, stop: (fade = 0.6) => { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade); setTimeout(() => g.disconnect(), (fade + 0.2) * 1000); } }; }

// Stinger: a one-second riser into an impact and the theme's first chord (about 2 seconds).
export function sting(name) {
  if (!audio()) return () => {};
  const th = THEMES[name] || THEMES.pulse, b = bus(), t = ctx.currentTime + 0.05;
  riser(b.g, t, 0.9);
  boom(b.g, t + 0.9);
  stab(b.g, t + 0.9, th.chords[0].map(i => th.root + 12 + i), 0.2);
  pad(b.g, t + 0.9, th.chords[0].map(i => th.root + i), 1.4, 0.05);
  return b.stop;
}
// Bed: the theme's groove for `secs` seconds (headline sets, the promo, short transitions).
export function bed(name, secs) {
  if (!audio()) return () => {};
  const th = THEMES[name] || THEMES.pulse, b = bus(), t0 = ctx.currentTime + 0.05, beat = 60 / th.bpm, bar = beat * 4;
  const bars = Math.ceil(secs / bar);
  for (let k = 0; k < bars; k++) {
    const t = t0 + k * bar, ch = th.chords[k % th.chords.length], r = th.root;
    if (name === "cinema") {
      pad(b.g, t, ch.map(i => r + i), bar, 0.06);
      bass(b.g, t, r + ch[0] - 12, bar * 0.9);
      if (k % 2 === 0) boom(b.g, t);
      for (let s = 0; s < 4; s++) if (s % 2) voice(b.g, t + s * beat, { f: 110, f2: 70, dur: 0.5, gain: 0.35, send: 0.4 });
      pluck(b.g, t + beat * 2.5, r + 24 + ch[2], 0.08);
    } else if (name === "bright") {
      pad(b.g, t, ch.map(i => r + i), bar, 0.035);
      for (let s = 0; s < 16; s++) pluck(b.g, t + s * beat / 4, r + 12 + ch[s % 3] + (s % 6 > 2 ? 12 : 0), 0.11);
      for (let s = 0; s < 4; s++) { if (s % 2 === 0) kick(b.g, t + s * beat, 0.7); else clap(b.g, t + s * beat); }
      bass(b.g, t, r + ch[0] - 12, beat * 1.8); bass(b.g, t + beat * 2, r + ch[0] - 12, beat * 1.8);
    } else if (name === "beat") {
      for (let s = 0; s < 8; s++) tick(b.g, t + s * beat / 2, r + 24 + (s % 2 ? 7 : 12));
      for (let s = 0; s < 4; s++) { kick(b.g, t + s * beat, 0.85); hat(b.g, t + s * beat + beat / 2, 0.14); bass(b.g, t + s * beat + beat / 2, r + ch[0] - 12, beat * 0.4); }
      stab(b.g, t, ch.map(i => r + 12 + i), 0.12);
    } else { // pulse
      pad(b.g, t, ch.map(i => r + i), bar, 0.045);
      for (let s = 0; s < 8; s++) bass(b.g, t + s * beat / 2, r + ch[0] - 12, beat * 0.42);
      for (let s = 0; s < 4; s++) kick(b.g, t + s * beat, 0.8);
      for (let s = 0; s < 16; s++) hat(b.g, t + s * beat / 4, s % 4 === 2 ? 0.16 : 0.07);
      if (k % 2 === 0) stab(b.g, t, ch.map(i => r + 12 + i), 0.13);
    }
  }
  // End on a gentle fade at the requested length.
  const end = setTimeout(() => b.stop(0.8), Math.max(0, secs - 0.8) * 1000);
  return (fade) => { clearTimeout(end); b.stop(fade); };
}
// Breaking news: staccato strings, timpani roll and brass hits, rising (about `secs` seconds).
export function breaking(secs = 4.5) {
  if (!audio()) return () => {};
  const b = bus(), t0 = ctx.currentTime + 0.05, r = 50, beat = 60 / 140, steps = Math.floor(secs / (beat / 4));
  for (let s = 0; s < steps; s++) {
    const t = t0 + s * beat / 4, up = Math.floor(s / 16);
    voice(b.g, t, { type: "sawtooth", f: hz(r + 12 + [0, 0, 3, 0, 7, 0, 3, 0][s % 8] + up), dur: 0.09, gain: 0.09, filter: ["lowpass", 2600], send: 0.2 });
    if (s % 2 === 0) voice(b.g, t, { f: 98 + (s % 4) * 6, f2: 70, dur: 0.25, gain: 0.28, send: 0.3 });
    if (s % 16 === 0) { boom(b.g, t); stab(b.g, t, [r + 12, r + 15, r + 19, r + 24].map(m => m + up), 0.2); }
  }
  riser(b.g, t0 + secs - 1.4, 1.3);
  return b.stop;
}

// The desk's own tracks: an <audio> element, faded in and out (paused with the player).
const playing = new Set();
export const pauseTracks = () => playing.forEach(a => a.pause());
export const resumeTracks = () => playing.forEach(a => a.play().catch(() => {}));
export function track(src, secs) {
  const a = new Audio(src); a.volume = 0; a.play().catch(() => {}); playing.add(a);
  let v = 0; const up = setInterval(() => { v = Math.min(0.7, v + 0.07); a.volume = v * duckK; if (v >= 0.7) clearInterval(up); }, 80);
  const stop = () => { clearInterval(up); const down = setInterval(() => { v = Math.max(0, v - 0.08); a.volume = v * duckK; if (v <= 0) { clearInterval(down); a.pause(); a.removeAttribute("src"); playing.delete(a); } }, 70); };
  const end = setTimeout(stop, secs * 1000);
  return () => { clearTimeout(end); stop(); };
}

// Rotation: the next track from what's switched on, never the one just played.
let last = "";
export function nextTrack(pool) {
  const options = pool.filter(p => p.key !== last);
  const pick = (options.length ? options : pool)[Math.floor(Math.random() * (options.length || pool.length))];
  if (pick) last = pick.key;
  return pick;
}

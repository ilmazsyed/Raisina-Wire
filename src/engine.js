// Rashtrix TV program engine. One renderer for every screen:
//   - the OBS / vMix outputs (tv.html?ch=h|v&key=…): the clean picture, with sound;
//   - the PCR's preview and program monitors (a given scene, or what is on air, muted);
//   - the app's own player (Watch), muted until the viewer taps;
//   - the guests' return feed in the live studio.
// It follows the channel's realtime state (src/control.js, over WebSocket, about a second) and
// the channel's running order and headlines (/api/tv/<ch>), and draws:
//   scenes in nine layouts (full, PiP, 2-up, 1 big + 2, 3 equal, host + 4, 6-grid, L-band, full
//   graphic) from YouTube (controls hidden, clicks blocked), app clips, HLS / WHEP streams, live
//   guests (Cloudflare Realtime or VDO.Ninja) and pictures; transitions (cut, mix, red slash wipe,
//   stinger); the channel jacket with each graphics layer on or off; overlays (poll bar,
//   viewer comments, results board); breaking news with music; the standby slate.
// Outputs apply changes after the broadcast delay; DUMP throws away what is waiting and puts the
// standby slate up. Outputs report their health every five seconds.
// On-air graphics are in Bengali whatever the reader's language.
import { LAYOUTS } from "./scenes.js";

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bnDigits = s => String(s).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
const DESK_BN = { Kolkata: "কলকাতা", "West Bengal": "পশ্চিমবঙ্গ", India: "ভারত", "Probashi Bangali": "প্রবাসী বাঙালি", World: "বিশ্ব" };
const SIZE = { h: [1920, 1080], v: [1080, 1920] };
const LOGO = "/brand/logo.webp";

// Slot rectangles (percent of the frame: x, y, w, h) for each layout and orientation.
const RECTS = {
  h: {
    full: [[0, 0, 100, 100]], lband: [[25, 0, 75, 75]], graphic: [],
    pip: [[0, 0, 100, 100], [66, 50, 30, 30]],
    "2up": [[2, 12, 47.5, 66], [50.5, 12, 47.5, 66]],
    "1big2": [[2, 8, 62, 74], [66, 8, 32, 36], [66, 46, 32, 36]],
    "3eq": [[1.5, 18, 31.5, 54], [34.25, 18, 31.5, 54], [67, 18, 31.5, 54]],
    host4: [[2, 8, 46, 74], [50, 8, 23.5, 36], [74.5, 8, 23.5, 36], [50, 46, 23.5, 36], [74.5, 46, 23.5, 36]],
    grid6: [[2, 8, 31, 36], [34.5, 8, 31, 36], [67, 8, 31, 36], [2, 46, 31, 36], [34.5, 46, 31, 36], [67, 46, 31, 36]]
  },
  v: {
    full: [[0, 0, 100, 100]], lband: [[0, 0, 100, 68]], graphic: [],
    pip: [[0, 0, 100, 100], [52, 62, 44, 24]],
    "2up": [[3, 13, 94, 37], [3, 51, 94, 37]],
    "1big2": [[3, 13, 94, 42], [3, 56, 46, 30], [51, 56, 46, 30]],
    "3eq": [[3, 13, 94, 24], [3, 38.5, 94, 24], [3, 64, 94, 24]],
    host4: [[3, 13, 94, 36], [3, 50, 46, 18], [51, 50, 46, 18], [3, 69, 46, 18], [51, 69, 46, 18]],
    grid6: [[3, 13, 46, 24], [51, 13, 46, 24], [3, 38, 46, 24], [51, 38, 46, 24], [3, 63, 46, 24], [51, 63, 46, 24]]
  }
};

/* ---------- YouTube ---------- */
let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise(res => {
    if (window.YT?.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => res(null);
    document.head.append(s);
    setTimeout(() => res(window.YT?.Player ? window.YT : null), 8000);
  });
  return ytReady;
}

/* ---------- Music: original stings made in the browser (nothing licensed) ---------- */
export function breakingSting(ctx, seconds = 6) {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05, out = ctx.createGain(); out.gain.value = 0.22; out.connect(ctx.destination);
  const tone = (f, at, len, type = "sawtooth", vol = 0.5) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = 2400;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + len);
    o.connect(lp).connect(g).connect(out); o.start(at); o.stop(at + len + 0.05);
  };
  [0, 0.32, 0.64].forEach((d, i) => { tone(110, t0 + d, 0.28, "square", 0.6); tone(220 * (i === 2 ? 1.19 : 1), t0 + d, 0.25, "sawtooth", 0.35); });
  [220, 261.6, 329.6, 440].forEach(f => tone(f, t0 + 1.0, seconds - 1.2, "sawtooth", 0.18));
  for (let b = 1.0; b < seconds - 0.3; b += 0.5) tone(55, t0 + b, 0.3, "triangle", 0.7);
}
// The news bed under the headline flash, the "up next" card and the bulletin: a driving
// newsroom track (kick, snare, ticking hats, a pumping bass, brass-like stabs and a running
// arpeggio) through a compressor, so it sits loud and even. Notes are scheduled a second ahead
// as it plays, so a two-minute bed costs no more than a short one. Returns a function that fades
// it out at once.
let noiseBuf = null;
const noise = ctx => { if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; };
export function newsBed(ctx, seconds = 10, { bpm = 128, level = 0.9 } = {}) {
  if (!ctx) return () => {};
  const t0 = ctx.currentTime + 0.05, end = t0 + Math.min(seconds, 185), s16 = 60 / bpm / 4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 8; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.12;
  const out = ctx.createGain(), make = ctx.createGain(); make.gain.value = 1.6;
  out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(level, t0 + 0.06);
  out.gain.setValueAtTime(level, Math.max(t0 + 0.1, end - 0.7)); out.gain.linearRampToValueAtTime(0, end);
  out.connect(comp).connect(make).connect(ctx.destination);
  const osc = (type, f, at, len, vol, cut = 3000, glide = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(f, at); if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + len * 0.6);
    lp.type = "lowpass"; lp.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(lp).connect(g).connect(out); o.start(at); o.stop(at + len + 0.02);
  };
  const hiss = (at, len, vol, type, f, q = 0.8) => {
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise(ctx); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(fl).connect(g).connect(out); src.start(at, Math.random() * 0.5, len + 0.02);
  };
  const kick = at => osc("sine", 160, at, 0.32, 1, 800, 42);
  const snare = at => { hiss(at, 0.2, 0.55, "bandpass", 1900, 0.7); osc("triangle", 200, at, 0.1, 0.35, 2000); };
  const hat = (at, accent) => hiss(at, accent ? 0.07 : 0.035, accent ? 0.22 : 0.12, "highpass", 8000);
  const crash = at => hiss(at, 1.4, 0.35, "highpass", 5000, 0.5);
  // A minor, F, C, G: a bar each.
  const roots = [55, 43.65, 65.41, 49], chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
  let step = 0, next = t0;
  const plan = () => {
    while (next < ctx.currentTime + 0.8 && next < end - 0.05) {
      const at = next, k = step % 16, bar = Math.floor(step / 16), c = bar % 4, ch = chords[c];
      if (k === 0 && bar % 4 === 0) { crash(at); ch.forEach(f => osc("sawtooth", f, at, 0.9, 0.11, 2600)); }
      if ([0, 6, 8, 11].includes(k)) kick(at);
      if (k === 4 || k === 12) snare(at);
      hat(at, k % 4 === 2);
      if (k % 2 === 0) osc("sawtooth", roots[c] * (k % 4 === 2 ? 2 : 1), at, s16 * 1.6, 0.42, 520);
      if (k === 0 || k === 10) ch.forEach(f => osc("sawtooth", f, at, 0.22, 0.08, 2400));
      osc("square", ch[(step >> 1) % 3] * 2, at, s16 * 0.8, 0.045, 3200);
      next += s16; step++;
    }
  };
  plan(); const timer = setInterval(plan, 200);
  setTimeout(() => clearInterval(timer), (end - ctx.currentTime + 1) * 1000);
  return () => { clearInterval(timer); try { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.3); setTimeout(() => { try { out.disconnect(); } catch { /* done */ } }, 1500); } catch { /* none */ } };
}
// A rising swoosh and a hit, for the "up next" card.
function riser(ctx) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise(ctx); bp.type = "bandpass"; bp.Q.value = 1.4; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(6000, t + 0.7);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.65); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(bp).connect(g).connect(ctx.destination); src.start(t, 0, 0.95);
  const o = ctx.createOscillator(), og = ctx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(140, t + 0.7); o.frequency.exponentialRampToValueAtTime(40, t + 1.1);
  og.gain.setValueAtTime(0.9, t + 0.7); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); o.connect(og).connect(ctx.destination); o.start(t + 0.7); o.stop(t + 1.25);
}
function whoosh(ctx) {
  if (!ctx) return;
  const t = ctx.currentTime, len = 0.5, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; bp.type = "bandpass"; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3000, t + len); g.gain.value = 0.25;
  src.connect(bp).connect(g).connect(ctx.destination); src.start(t);
}

/* ---------- Live guests over Cloudflare Realtime (pull their published tracks) ---------- */
async function pullGuest(video, guest, auth) {
  const q = new URLSearchParams(auth).toString();
  const ice = await fetch(`/api/rtc/ice?${q}`).then(r => r.json()).catch(() => ({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] }));
  const pc = new RTCPeerConnection({ iceServers: ice.iceServers, bundlePolicy: "max-bundle" });
  const stream = new MediaStream(); video.srcObject = stream;
  pc.ontrack = e => { stream.addTrack(e.track); video.play().catch(() => {}); };
  const s = await fetch(`/api/rtc/session?${q}`, { method: "POST" }).then(r => r.json());
  if (!s.sessionId) throw new Error(s.error || "no session");
  const tracks = Object.values(guest.tracks || {}).filter(Boolean).map(trackName => ({ location: "remote", sessionId: guest.sessionId, trackName }));
  const r = await fetch(`/api/rtc/${s.sessionId}/tracks?${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tracks }) }).then(r => r.json());
  if (r.requiresImmediateRenegotiation && r.sessionDescription) {
    await pc.setRemoteDescription(r.sessionDescription);
    const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
    await fetch(`/api/rtc/${s.sessionId}/renegotiate?${q}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionDescription: { type: "answer", sdp: answer.sdp } }) });
  }
  return pc;
}
// A WHEP stream (low-latency WebRTC, e.g. MediaMTX on the Oracle Cloud VM).
async function playWhep(video, url) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  pc.addTransceiver("video", { direction: "recvonly" }); pc.addTransceiver("audio", { direction: "recvonly" });
  const stream = new MediaStream(); video.srcObject = stream; pc.ontrack = e => { stream.addTrack(e.track); video.play().catch(() => {}); };
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/sdp" }, body: offer.sdp });
  if (!r.ok) throw new Error(`WHEP ${r.status}`);
  await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
  return pc;
}
async function playHls(video, url, delay = 0) {
  if (video.canPlayType("application/vnd.apple.mpegurl")) { video.src = url; return null; }
  const { default: Hls } = await import("hls.js");
  if (!Hls.isSupported()) { video.src = url; return null; }
  const hls = new Hls({ liveSyncDuration: 3 + delay, lowLatencyMode: !delay });
  hls.loadSource(url); hls.attachMedia(video);
  return hls;
}

/* ---------- The engine ---------- */
// mode: "program" (follow the channel), "scene" (draw a given scene: PCR preview), "app" (program
// in the app, muted until tapped). key: an output key (outputs) – sends heartbeats.
export function mountTV(host, { channel = "h", output = false, mode, key = "", scene: fixedScene = null, guestToken = "", onState, muted } = {}) {
  mode ||= output ? "program" : "app";
  const [W, H] = SIZE[channel];
  host.innerHTML = `<div class="tvp-fit"><div class="tvp tvp-${channel}${mode === "app" ? " tvp-app" : ""}" style="width:${W}px;height:${H}px">
      <div class="tvp-bg"><i class="dots"></i><i class="arc a1"></i><i class="arc a2"></i><i class="sheen"></i></div>
      ${mode === "app" ? `<div class="tvp-ytlayer" hidden><div class="tvs-ytwrap"><div class="tvs-yt"></div></div><div class="tvp-shield"></div></div>` : ""}
      <div class="tvp-stage"></div>
      <div class="tvp-gfx"></div><div class="tvp-ovl"></div>
      <div class="tvp-standby" hidden><img src="${LOGO}" alt=""><b>অনুষ্ঠান একটু পরেই</b><small>আমাদের সঙ্গে থাকুন</small></div>
      <div class="tvp-off" hidden><img src="${LOGO}" alt=""><b>শিগগির ফিরছি</b></div>
    </div></div>${mode === "app" ? `<button class="tvp-sound" type="button" hidden>🔇 শব্দ চালু করতে ট্যাপ করুন</button><span class="tvp-taphint" hidden>▶ ভিডিওতে একবার ট্যাপ করুন</span>
      <div class="tvp-bar"><button type="button" class="tvp-like" aria-label="Like" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h1C12.3 6.1 13.6 5 15.6 5 19 5 21.1 8.4 19.6 11.8 17.5 16.4 12 21 12 21z"/></svg><b>ভালো লাগা</b><span>০</span></button><button type="button" class="tvp-share" aria-label="Share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.8-3.4a3 3 0 0 0 0-1.6l6.8-3.4A3 3 0 1 0 15 7l-6.8 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z"/></svg><b>শেয়ার করুন</b></button></div>` : ""}`;
  const fit = host.querySelector(".tvp-fit"), stage = host.querySelector(".tvp");
  const $ = s => stage.querySelector(s);
  const scale = () => { const k = Math.min(fit.clientWidth / W, (output ? fit.clientHeight : fit.clientWidth * H / W) / H); stage.style.transform = `scale(${k})`; stage.style.setProperty("--k", String(k || 1)); if (!output) fit.style.height = `${H * (fit.clientWidth / W)}px`; };
  const ro = new ResizeObserver(scale); ro.observe(fit); scale();

  const st = { tv: null, ctl: null, queue: [], skew: 0, alive: true, muted: muted ?? (mode === "app" ? false : !output), audio: null, current: null, shownBreaking: "", flash: 0, stalledSince: 0, playing: false, ws: null, dumpUntil: 0, pkgTimer: null };
  const now = () => Date.now() + st.skew;
  const auth = key ? { ch: channel, key } : guestToken ? { t: guestToken } : mode === "app" ? { viewer: 1 } : {};

  /* sound */
  // Browsers let a page start sound only after the viewer has touched it (some, for sites the
  // viewer visits often, at once). The app starts with sound where it may; otherwise it plays
  // muted and turns sound on at the first tap or key press anywhere on the page.
  const soundBtn = host.querySelector(".tvp-sound"), tapHint = host.querySelector(".tvp-taphint");
  // On iPhone, page sound otherwise counts as a game sound and is silenced by the ringer switch.
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* older Safari */ }
  try { st.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* none */ }
  const wake = () => { try { if (st.audio && st.audio.state !== "running") st.audio.resume(); } catch { /* none */ } };
  const unmute = () => {
    if (!st.alive) return;
    st.muted = false; if (soundBtn) soundBtn.hidden = true;
    wake();
    st.current?.slots.forEach(sl => { sl.setMuted?.(false); sl.play?.(); });
    startBed(st.current?.scene);
  };
  const firstTouch = () => { wake(); if (st.muted) unmute(); };
  if (mode === "app") { ["pointerdown", "keydown", "touchend", "click"].forEach(ev => document.addEventListener(ev, firstTouch, { passive: true })); }
  // Music under the headline flash, the "up next" card and the bulletin (faster for the bulletin).
  const BEDS = { flash: { bpm: 128 }, upnext: { bpm: 132 }, bulletin: { bpm: 140 } };
  function startBed(sc) {
    const kind = sc?.graphic?.kind;
    if (!BEDS[kind] || st.muted || !st.audio || mode !== "app" || st.bed) return;
    wake();
    st.bed = newsBed(st.audio, Math.max(2, (sc.dur || 10) - (now() - (sc.startAt || now())) / 1000), BEDS[kind]);
  }
  soundBtn?.addEventListener("click", unmute);
  const soundOff = () => { st.muted = true; if (soundBtn) soundBtn.hidden = false; };
  // Some phones (iPhone in Low Power Mode) start a YouTube video only from a tap inside it: the
  // cover over it is lifted, with a hint, until it plays. The one player then plays every video.
  const needTap = on => { host.querySelector(".tvp-ytlayer")?.classList.toggle("tap", on); host.querySelector(".tvp")?.classList.toggle("yt-tap", on); if (tapHint) tapHint.hidden = !on; };

  /* like and share (app) */
  const likeBtn = host.querySelector(".tvp-like"), shareBtn = host.querySelector(".tvp-share");
  const liked = () => { try { return JSON.parse(localStorage.getItem("rw-tv-liked") || "[]"); } catch { return []; } };
  function showLike() {
    if (!likeBtn) return;
    const id = st.nowYt?.id; likeBtn.hidden = !id; if (!id) return;
    likeBtn.classList.toggle("on", liked().includes(id)); likeBtn.dataset.id = id;
    fetch(`/api/tv/like?id=${encodeURIComponent(id)}`).then(r => r.json()).then(d => { if (likeBtn.dataset.id === id) likeBtn.querySelector("span").textContent = bnDigits(d.likes || 0); }).catch(() => {});
  }
  likeBtn?.addEventListener("click", async () => {
    const id = likeBtn.dataset.id; if (!id) return;
    const list = liked(), undo = list.includes(id);
    try { localStorage.setItem("rw-tv-liked", JSON.stringify(undo ? list.filter(x => x !== id) : [...list, id].slice(-500))); } catch { /* private mode */ }
    likeBtn.classList.toggle("on", !undo);
    const d = await fetch("/api/tv/like", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, undo }) }).then(r => r.json()).catch(() => null);
    if (d && likeBtn.dataset.id === id) likeBtn.querySelector("span").textContent = bnDigits(d.likes || 0);
  });
  shareBtn?.addEventListener("click", async () => {
    const url = `${location.origin}/watch`, title = st.nowYt?.title ? `${st.nowYt.title} · রাষ্ট্রিক্স টিভি` : "রাষ্ট্রিক্স টিভি · লাইভ";
    try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); const lb = shareBtn.querySelector("b"); lb.textContent = "লিংক কপি হয়েছে"; setTimeout(() => { lb.textContent = "শেয়ার করুন"; }, 2000); } } catch { /* cancelled */ }
  });

  /* ---------- sources ---------- */
  // In the app one YouTube player stays for the whole visit and each video is loaded into it:
  // a phone that needs a tap to start video then needs it only once, and there is only ever
  // one video player on the page.
  function sharedYT(el, src, offset) {
    // Each video starts from its first second (a viewer who joins mid-video sees it whole).
    const layer = $(".tvp-ytlayer"), token = {}, start = Math.floor(src.in || 0);
    el.classList.add("tvs-shared");
    el.innerHTML = `<img class="tvs-poster" src="https://i.ytimg.com/vi/${esc(src.id)}/hqdefault.jpg" alt="" onerror="this.hidden=true">`;
    st.ytOwner = token; st.ytPoster = el; st.nowYt = { id: src.id, title: src.title || "" }; layer.hidden = false; layer.classList.remove("pre"); showLike();
    const load = () => {
      const y = st.yt;
      if (!y?.ready || st.ytOwner !== token) return;
      try {
        y.ended = false;
        if (y.pre === src.id) { y.pre = null; y.preloading = false; y.player.seekTo(start, true); st.muted ? y.player.mute() : y.player.unMute(); y.player.playVideo(); }
        else { y.pre = null; y.player.loadVideoById({ videoId: src.id, startSeconds: start }); st.muted ? y.player.mute() : y.player.unMute(); }
      } catch { /* none */ }
      checkStart();
    };
    // Not playing after a moment: try again muted (allowed nearly everywhere), then ask for a tap.
    const checkStart = () => {
      setTimeout(() => { const y = st.yt; if (!st.alive || st.ytOwner !== token || !y?.ready || [1, 3].includes(y.state)) return; if (!st.muted) { soundOff(); try { y.player.mute(); y.player.playVideo(); } catch { /* none */ } } }, 1800);
      setTimeout(() => { const y = st.yt; if (st.alive && st.ytOwner === token && y && ![1, 3].includes(y.state)) needTap(true); }, 4500);
    };
    loadYT().then(YT => {
      if (!YT || !st.alive || st.ytOwner !== token) return;
      if (st.yt) return load();
      st.yt = { state: -1, since: Date.now(), ready: false };
      st.yt.player = new YT.Player(layer.querySelector(".tvs-yt"), { width: "100%", height: "100%", videoId: src.id,
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1, fs: 0, autoplay: 1, mute: st.muted ? 1 : 0, start, origin: location.origin },
        events: {
          onReady: e => { st.yt.ready = true; st.muted ? e.target.mute() : e.target.unMute(); if (st.ytOwner === token) { e.target.playVideo(); checkStart(); } else st.ytLoad?.(); },
          onStateChange: e => {
            st.yt.state = e.data; st.yt.since = Date.now();
            // A video loaded in advance waits, paused and buffering, until its turn.
            if (st.yt.preloading && !st.ytOwner) { if (e.data === 1) { e.target.pauseVideo(); st.yt.preloading = false; } return; }
            if (e.data === 0) st.yt.ended = true; if (e.data === 1) { st.ytPoster?.querySelector(".tvs-poster")?.remove(); needTap(false); }
          },
          onError: () => { st.yt.state = 0; st.yt.ended = true; }
        } });
    });
    st.ytLoad = load;
    return {
      el, src,
      destroy() { if (st.ytOwner !== token) return; st.ytOwner = null; st.nowYt = null; showLike(); layer.hidden = true; try { st.yt?.player?.pauseVideo(); } catch { /* none */ } needTap(false); },
      play() { try { st.yt?.player?.playVideo(); } catch { /* none */ } },
      setMuted(m) { try { m ? st.yt?.player?.mute() : st.yt?.player?.unMute(); } catch { /* none */ } },
      stalled: () => st.yt?.state === 3 && Date.now() - st.yt.since > 10000,
      playing: () => st.yt?.state === 1, shared: true
    };
  }
  // The next video is loaded into the one player while the flash or the "up next" card is on
  // (the player is invisible then), so it plays the moment its turn comes, without a wait.
  function preloadYT(want) {
    const y = st.yt;
    if (!want || !y?.ready || st.ytOwner || y.pre === want.id) return;
    y.pre = want.id; y.preloading = true;
    $(".tvp-ytlayer")?.classList.add("pre");
    try { y.player.mute(); y.player.loadVideoById({ videoId: want.id, startSeconds: Math.floor(want.at || 0) }); } catch { y.pre = null; y.preloading = false; }
  }
  const ytPos = id => { try { return st.nowYt?.id === id ? st.yt?.player?.getCurrentTime?.() || 0 : 0; } catch { return 0; } };
  function makeSource(el, src, offset, isMain, solo) {
    const slot = { el, src, destroy() {}, setMuted() {}, stalled: () => false };
    const mute = () => st.muted || !isMain;
    if (src.kind === "yt" && src.id && mode === "app" && isMain && solo) return sharedYT(el, src, offset);
    if (src.kind === "yt" && src.id) {
      // The YouTube player is laid out at the size it is seen at (the stage is 1080 or 1920 wide
      // and scaled down), so phones do not draw a full-HD video layer and run out of memory.
      el.innerHTML = `<div class="tvs-ytwrap"><div class="tvs-yt"></div></div><img class="tvs-poster" src="https://i.ytimg.com/vi/${esc(src.id)}/hqdefault.jpg" alt="" onerror="this.hidden=true"><div class="tvp-shield"></div>`;
      let player = null, state = -1, since = Date.now();
      loadYT().then(YT => {
        if (!YT || !st.alive || !el.isConnected) return;
        player = new YT.Player(el.querySelector(".tvs-yt"), { width: "100%", height: "100%", videoId: src.id,
          playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1, fs: 0, autoplay: 1, mute: mute() ? 1 : 0, start: Math.floor((src.in || 0) + offset), ...(src.out ? { end: Math.floor(src.out) } : {}), origin: location.origin },
          events: { onStateChange: e => { state = e.data; since = Date.now(); if (e.data === 1) { el.querySelector(".tvs-poster")?.remove(); played(); } }, onReady: e => { mute() ? e.target.mute() : e.target.unMute(); e.target.playVideo(); } } });
      });
      // If the phone blocks autoplay (iPhone Low Power Mode, data saver), the cover that keeps
      // viewers off YouTube's controls is lifted after a few seconds so YouTube's own play button
      // can be tapped; it comes back once the video plays.
      const blocked = setTimeout(() => {
        if (!st.alive || !el.isConnected || state === 1 || !isMain || output) return;
        el.classList.add("tap-play");
        el.insertAdjacentHTML("beforeend", `<span class="tvs-hint">▶ ভিডিও চালাতে ট্যাপ করুন</span>`);
      }, 5000);
      const played = () => { el.classList.remove("tap-play"); el.querySelector(".tvs-hint")?.remove(); };
      slot.destroy = () => { clearTimeout(blocked); try { player?.destroy(); } catch { /* none */ } };
      slot.play = () => { try { player?.playVideo(); } catch { /* none */ } };
      slot.setMuted = m => { try { m || !isMain ? player?.mute() : player?.unMute(); } catch { /* none */ } };
      slot.stalled = () => state === 3 && Date.now() - since > 10000;
      slot.playing = () => state === 1;
    } else if (["clip", "hls", "whep", "guest"].includes(src.kind)) {
      el.innerHTML = `<video playsinline autoplay ${mute() ? "muted" : ""}></video><div class="tvp-shield"></div>${src.kind === "guest" && src.name ? `<span class="tvs-name"><b>${esc(src.name)}</b>${src.title ? `<small>${esc(src.title)}</small>` : ""}</span>` : ""}`;
      const v = el.querySelector("video"); let extra = null, last = 0, lastT = Date.now();
      v.muted = mute();
      if (src.kind === "clip") { v.src = src.url; v.addEventListener("loadedmetadata", () => { v.currentTime = (src.in || 0) + offset; v.play().catch(() => {}); }, { once: true }); }
      if (src.kind === "hls") playHls(v, src.url, st.ctl?.delay || 0).then(x => { extra = x; v.play().catch(() => {}); }).catch(() => {});
      if (src.kind === "whep") playWhep(v, src.url).then(x => { extra = x; }).catch(() => {});
      if (src.kind === "guest") {
        const known = st.room?.guests?.[src.id]?.sessionId ? st.room.guests[src.id] : src.sessionId ? src : null;
        // Rundown items know only the guest's id: ask for their tracks (or VDO.Ninja link).
        const look = known ? Promise.resolve(known) : fetch(`/api/rtc/guest/${encodeURIComponent(src.id)}?${new URLSearchParams(auth)}`).then(r => r.ok ? r.json() : null);
        look.then(g => {
          if (!g || !st.alive || !el.isConnected) return;
          if (g.vdo && !g.sessionId) { el.querySelector("video").outerHTML = `<iframe src="${esc(g.vdo)}" allow="autoplay; fullscreen" title=""></iframe>`; return; }
          if (g.sessionId) pullGuest(v, g, auth).then(x => { extra = x; }).catch(() => {});
        }).catch(() => {});
      }
      if (src.kind === "clip" && src.out) v.addEventListener("timeupdate", () => { if (v.currentTime >= src.out) v.pause(); });
      slot.destroy = () => { try { extra?.destroy?.(); extra?.close?.(); } catch { /* none */ } v.pause(); v.removeAttribute("src"); v.srcObject = null; };
      slot.setMuted = m => { v.muted = m || !isMain; };
      slot.stalled = () => { if (v.currentTime !== last) { last = v.currentTime; lastT = Date.now(); } return src.kind !== "clip" && Date.now() - lastT > 10000; };
      slot.playing = () => !v.paused && v.readyState >= 2;
    } else if (src.kind === "vdo" && src.url) {
      el.innerHTML = `<iframe src="${esc(src.url)}" allow="autoplay; camera; microphone; fullscreen" title=""></iframe><div class="tvp-shield"></div>${src.name ? `<span class="tvs-name"><b>${esc(src.name)}</b></span>` : ""}`;
    } else if (src.kind === "image" && src.url) {
      el.innerHTML = `<img class="tvs-img" src="${esc(src.url)}" alt="">`;
    } else if (src.kind === "continuity") {
      const seg = continuitySeg();
      if (seg?.type === "video") return makeSource(el, { kind: "yt", id: seg.ytId, in: (now() - seg.start) / 1000 }, 0, isMain);
      el.innerHTML = `<div class="tvs-logo"><img src="${LOGO}" alt=""></div>`;
    } else el.innerHTML = `<div class="tvs-logo"><img src="${LOGO}" alt=""></div>`;
    return slot;
  }

  /* ---------- the channel's own running order (no rundown on air) ---------- */
  function continuitySeg() { if (mode === "app") return localSeg(); const t = now(); return st.tv?.schedule?.find(x => x.start <= t && t < x.start + x.dur * 1000) || null; }
  // In the app each viewer has their own running order: it starts at the newest video when the
  // viewer opens the channel and goes down the list; a video moves on only when it has played
  // to its end; a headline flash (with the stinger) comes after every video, and an animated
  // "up next" card before the next one. The bulletin is on the clock, the same for everyone: two
  // minutes from every :00 and :30 (a viewer who opens the channel at 4:01 joins it a minute in).
  // It cuts into whatever is playing, and that video is picked up again after it, where it was
  // left. What the control room puts on air (live, manual takes, rundowns, standby, breaking) is
  // also the same for every viewer at the same moment.
  const BULLETIN_MS = 120e3, UPNEXT = 6;
  const upnext = v => ({ type: "upnext", video: v, dur: UPNEXT, sting: false });
  function localSeg() {
    const loop = st.tv?.loop || []; if (!loop.length) return null;
    const t = now(), q = st.seq ||= { i: 0, item: null, seg: null, start: 0, n: 0, head: loop[0]?.ytId || "" };
    const slot = Math.floor(t / 1800e3) * 1800e3;
    if (t - slot < BULLETIN_MS && (st.tv?.bulletin || []).length) {
      if (q.item?.type !== "bulletin" || q.start !== slot) {
        // Whatever was on stops for the bulletin; a video is picked up again afterwards.
        if (q.item?.type === "video") { const at = (q.item.in || 0) + ytPos(q.item.ytId); q.resume = at < q.item.dur - 8 ? { ...q.item, at, resumed: true } : null; }
        else if (q.item?.type === "upnext") q.resume = q.item.video;
        q.item = { type: "bulletin", dur: BULLETIN_MS / 1000, sting: true }; q.start = slot; q.n++;
        q.seg = { ...q.item, start: slot, in: 0 };
      }
      st.preWant = null;
      return q.seg;
    }
    if (q.item) {
      const it = q.item, age = t - q.start;
      const done = it.type === "video"
        ? (st.yt?.ended && st.nowYt?.id === it.ytId) || age > (it.dur - (it.in || 0) + 45) * 1000 || (!st.yt && age > (it.dur - (it.in || 0)) * 1000)
        : age >= it.dur * 1000;
      if (!done) return q.seg;
    }
    if (q.restart && !["video", "upnext"].includes(q.item?.type)) { q.i = 0; q.restart = false; }
    const take = () => { const x = loop[q.i % loop.length]; q.i = (q.i + 1) % loop.length; return x; };
    let next;
    if (q.item?.type === "upnext") {
      const v = q.item.video;
      next = { type: "video", ytId: v.ytId, title: v.title, line: v.line, dur: v.dur, in: v.at || 0 };
      if (!v.resumed) take();
    } else if (q.resume) { next = upnext(q.resume); q.resume = null; }
    else {
      let x = loop[q.i % loop.length];
      // No flash straight after the bulletin.
      if (x.type === "flash" && q.item?.type === "bulletin" && loop.length > 1) { take(); x = loop[q.i % loop.length]; }
      if (x.type === "video" && q.item?.type === "video") next = { type: "flash", dur: 10, sting: true, n: q.n };
      else if (x.type === "video" && q.item) next = upnext({ ...x, at: 0 });
      else next = take();
    }
    q.n++; q.item = next; q.start = t;
    q.seg = { ...next, start: t, in: next.in || 0, n: next.n ?? q.n };
    // While a flash or the "up next" card is on, the video after it is loaded in advance.
    const after = next.type === "upnext" ? next.video : next.type !== "video" ? loop.slice(q.i).concat(loop.slice(0, q.i)).find(x => x.type === "video") : null;
    st.preWant = after ? { id: after.ytId, at: after.at || 0 } : null;
    return q.seg;
  }
  function continuityScene() {
    const s = st.tv; if (!s) return null;
    if (s.live) return { layout: "full", sources: [{ kind: "yt", id: s.live.ytId }], label: s.live.title, key: `live:${s.live.ytId}` };
    const seg = continuitySeg(); if (!seg) return { layout: "graphic", graphic: { kind: "headlines" }, key: "c:none" };
    const transition = seg.sting ? { type: "stinger", ms: 1200 } : { type: "mix", ms: 500 };
    if (seg.type === "video") return { layout: "full", sources: [{ kind: "yt", id: seg.ytId, in: seg.in || 0, title: seg.line || seg.title }], label: seg.line || seg.title, startAt: seg.start, key: `c:${seg.ytId}:${seg.start}`, transition };
    if (seg.type === "flash") return { layout: "graphic", graphic: { kind: "flash", n: seg.n || 0 }, startAt: seg.start, dur: seg.dur, key: `c:flash:${seg.start}`, transition };
    if (seg.type === "upnext") return { layout: "graphic", graphic: { kind: "upnext", video: seg.video }, startAt: seg.start, dur: seg.dur, key: `c:upnext:${seg.start}`, transition: { type: "mix", ms: 250 }, full: true };
    if (seg.type === "bulletin") return { layout: "graphic", graphic: { kind: "bulletin" }, startAt: seg.start, dur: seg.dur, key: `c:bulletin:${seg.start}`, transition, full: true };
    if (seg.type === "news") return { layout: "graphic", graphic: { kind: "news" }, startAt: seg.start, dur: seg.dur, key: `c:news:${seg.start}`, transition };
    if (seg.type === "promo") return { layout: "graphic", graphic: { kind: "promo", image: seg.image }, key: `c:promo:${seg.start}`, full: true };
    return null;
  }

  /* ---------- what is on air now ---------- */
  // In the app, live-studio segments play the studio's own stream when there is one, so each
  // viewer does not connect to every guest.
  function forApp(sc) {
    if (mode !== "app" || !sc?.sources?.some(s => s.kind === "guest" || s.kind === "vdo") || !st.tv?.appStream) return sc;
    return { ...sc, layout: "full", sources: [{ kind: st.tv.appStream.kind, url: st.tv.appStream.url }], key: `${sc.key}:app` };
  }
  function resolve() { return forApp(resolveRaw()); }
  function resolveRaw() {
    const c = st.ctl;
    if (mode === "scene") return fixedScene ? { ...fixedScene, key: JSON.stringify(fixedScene) } : null;
    if (st.tv && !st.tv.on && !(c && (c.mode === "manual" || c.rundown))) return { off: true, key: "off" };
    if (now() < st.dumpUntil || c?.standby?.on) return { standby: true, key: "standby" };
    if (c?.mode === "manual" && c.program) {
      // "Running order" taken to air follows the channel's own schedule, Short by Short: the
      // scene is rebuilt whenever the segment changes (and once the schedule has loaded).
      const cont = c.program.sources?.some(x => x.kind === "continuity");
      if (cont && c.program.sources.length === 1) { const sc = continuityScene(); if (sc) return { ...sc, key: `m:${c.program.takenAt}:${sc.key}` }; }
      const seg = cont ? continuitySeg() : null;
      return { ...c.program, startAt: c.program.takenAt, key: `m:${c.program.takenAt}${cont ? `:${seg ? `${seg.ytId || seg.type}:${seg.start}` : "none"}` : ""}` };
    }
    const r = c?.rundown;
    if (r && r.items?.[r.index]) { const it = r.items[r.index]; return { ...it.scene, startAt: r.pausedAt ? now() - (r.pausedAt - r.itemStartedAt) : r.itemStartedAt, key: `r:${r.id}:${r.index}:${r.itemStartedAt}` }; }
    return continuityScene();
  }

  /* ---------- drawing a scene, with a transition ---------- */
  function drawScene(sc) {
    const old = st.current;
    st.bed?.(); st.bed = null;
    old?.slots.forEach(s => { if (s.shared) s.destroy(); });
    const box = document.createElement("div"); box.className = "tvp-scene";
    const slots = [];
    $(".tvp-standby").hidden = !sc?.standby; $(".tvp-off").hidden = !sc?.off;
    if (sc && !sc.standby && !sc.off) {
      const offset = sc.startAt ? Math.max(0, (now() - sc.startAt) / 1000) : 0;
      const rects = RECTS[channel][sc.layout] || RECTS[channel].full;
      (sc.sources || []).slice(0, rects.length || 1).forEach((src, i) => {
        const r = rects[i] || rects[0]; if (!r) return;
        const el = document.createElement("div"); el.className = `tvs ${rects.length > 1 ? "multi" : ""}`;
        el.style.cssText = `left:${r[0]}%;top:${r[1]}%;width:${r[2]}%;height:${r[3]}%`;
        box.append(el); slots.push(makeSource(el, src, offset, i === 0, (sc.sources || []).length === 1 && r[0] === 0 && r[1] === 0 && r[2] === 100 && r[3] === 100));
      });
      if (sc.graphic) box.append(graphic(sc));
    }
    startBed(sc);
    stage.querySelector(".tvp-stage").append(box);
    const leftVideo = old?.scene?.sources?.some(x => x.kind === "yt") && !old?.scene?.graphic;
    const t = !old ? { type: "cut", ms: 0 } : leftVideo ? { type: "stinger", ms: 1200 } : (sc?.transition || st.ctl?.transition || { type: "mix", ms: 600 });
    const finish = () => { old?.box.remove(); old?.slots.forEach(s => { if (!s.shared) s.destroy(); }); };
    if (!old || t.type === "cut" || mode === "scene") finish();
    else if (t.type === "mix") { box.style.animation = `tvmix ${t.ms}ms ease both`; setTimeout(finish, t.ms); }
    else if (t.type === "wipe" || t.type === "stinger") {
      const w = document.createElement("div"); w.className = t.type === "wipe" ? "tvp-wipe" : "tvp-stinger";
      if (t.type === "stinger") w.innerHTML = `<img src="${LOGO}" alt="">`;
      stage.append(w); box.style.visibility = "hidden";
      if (!st.muted) whoosh(st.audio);
      setTimeout(() => { box.style.visibility = ""; finish(); }, t.type === "wipe" ? 450 : 700);
      setTimeout(() => w.remove(), t.type === "wipe" ? 1000 : 1400);
    }
    st.current = { key: sc?.key, scene: sc, box, slots, drawnAt: Date.now() };
    stage.classList.toggle("lband", sc?.layout === "lband");
    stage.classList.toggle("vid", !sc?.graphic && sc?.layout === "full" && (sc?.sources || []).length === 1);
    stage.classList.toggle("full-gfx", !!sc?.full || sc?.graphic?.kind === "promo" || sc?.graphic?.kind === "ads");
  }

  /* ---------- graphics ---------- */
  const istParts = d => { const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number); return { h, m }; };
  function slotWords(d) {
    const { h, m } = istParts(d), h12 = h % 12 || 12;
    const part = h < 4 ? "রাত" : h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকেল" : h < 20 ? "সন্ধ্যা" : "রাত";
    const tail = n => `${bnDigits(n)}${n === 2 ? "টো" : n === 3 || n === 4 ? "টে" : "টা"}`;
    if (m < 30) return `${part} ${tail(h12)}`;
    return `${part} ${h12 === 1 ? "দেড়টা" : h12 === 2 ? "আড়াইটে" : `সাড়ে ${tail(h12)}`}`;
  }
  const bnDate = d => { try { return bnDigits(d.toLocaleDateString("bn-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" })); } catch { return ""; } };
  const ist = () => bnDigits(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }));
  const tickerHTML = all => { const list = mode === "app" ? all.slice(0, 12) : all, items = list.map(t => `<span>${esc(t)}</span>`).join("<i>◆</i>"); return `<div class="tk-move" style="--dur:${Math.max(40, list.length * 9)}s"><div>${items}<i>◆</i></div><div aria-hidden="true">${items}<i>◆</i></div></div>`; };
  const adBox = ad => ad?.image ? `<div class="tv-ad img"><img src="${esc(ad.image)}" alt=""></div>` : `<div class="tv-ad"><b>${esc(ad?.line1 || "")}</b><hr><small>${esc(ad?.line2 || "")}</small><hr><small>${esc(ad?.line3 || "")}</small></div>`;
  const vJacket = (inner, band) => `<div class="vj"><img class="vj-strip" src="/brand/jacket-strip.webp" alt=""><div class="vj-logo"><img src="${LOGO}" alt=""></div><div class="vj-frame">${inner}</div><div class="vj-band"><b>${esc(band)}</b>${adBox(sponsorAd())}</div></div>`;
  const sponsorAd = () => st.ctl?.sponsor ? { image: st.ctl.sponsor.image, line1: st.ctl.sponsor.line1, line2: st.ctl.sponsor.line2, line3: st.ctl.sponsor.line3 } : st.tv?.ad;
  function headlineSets() {
    const Hs = st.tv?.headlines || [], sets = [], used = new Set();
    const take = (pred, label) => { const l = Hs.filter(h => !used.has(h.text) && pred(h)).slice(0, 5); l.forEach(h => used.add(h.text)); if (l.length >= 3) sets.push({ label, items: l.map(h => h.text) }); };
    take(() => true, "সর্বশেষ"); take(h => h.desk === "Kolkata" || h.desk === "West Bengal", "কলকাতা ও রাজ্য"); take(h => h.desk === "India" || h.desk === "Probashi Bangali", "দেশ"); take(h => h.desk === "World", "বিশ্ব"); take(() => true, "আরও খবর");
    return sets.slice(0, st.tv?.sets || 3);
  }
  const setHTML = (name, label, items, step) => `<div class="nu-set"><div class="nu-head"><span>${esc(name)}</span><b>${esc(label)}</b><i style="--d:${step}s"></i></div><ol>${items.map((h, n) => `<li style="--n:${n}"><em>${bnDigits(n + 1)}</em><span>${esc(h)}</span></li>`).join("")}</ol></div>`;
  function graphic(sc) {
    const g = sc.graphic, el = document.createElement("div"); el.className = "tvp-pkg";
    const wrapV = (inner, band) => channel === "v" ? vJacket(inner, band) : inner;
    if (g.kind === "news") {   // News Update / Bulletin from the latest headlines
      const name = new Date(sc.startAt || now()).getMinutes() < 5 ? "বুলেটিন" : "নিউজ আপডেট", sets = headlineSets(), step = st.tv?.setSeconds || 7;
      const card = () => wrapV(`<div class="nu-title${channel === "v" ? " v" : ""}"><img src="${LOGO}" alt=""><b>${name}</b><small>${ist()}</small></div>`, name);
      const draw = () => { if (!el.isConnected && st.current) return; const e = (now() - (sc.startAt || now())) / 1000, k = Math.floor((e - 5) / step), x = sets[Math.min(sets.length - 1, k)]; el.innerHTML = e < 5 || !x ? card() : wrapV(setHTML(name, x.label, x.items, step), x.label); };
      draw(); const t = setInterval(() => el.isConnected ? draw() : clearInterval(t), 1000);
    } else if (g.kind === "flash") {   // 10 seconds between videos: the breaking story, or the headlines
      const br = st.ctl?.breaking || st.tv?.breaking;
      if (br?.text) el.innerHTML = channel === "h" ? `<div class="tv-breaking static"><div class="br-slash"></div><div class="br-in"><span class="br-tag">এইমাত্র পাওয়া খবর</span><b>${esc(br.text)}</b><img src="${LOGO}" alt=""></div><div class="br-bar"></div></div>` : vJacket(`<div class="br-v"><span class="br-tag">এইমাত্র পাওয়া খবর</span><b>${esc(br.text)}</b></div>`, "এইমাত্র পাওয়া খবর");
      else {
        const Hs = st.tv?.headlines || [], per = 4, from = Hs.length > per ? (g.n * per) % Hs.length : 0;
        const items = [...Hs.slice(from), ...Hs.slice(0, from)].slice(0, per).map(h => h.text);
        el.innerHTML = wrapV(setHTML("শিরোনাম", "সর্বশেষ", items, sc.dur || 10), "শিরোনাম");
      }
    } else if (g.kind === "upnext") {   // the coming video, in one Bengali line
      const v = g.video || {}, dur = sc.dur || 6, line = String(v.line || v.title || "").trim();
      const thumb = `https://i.ytimg.com/vi/${esc(v.ytId)}/hqdefault.jpg`;
      el.innerHTML = `<div class="un${channel === "v" ? " v" : ""}"><div class="un-bg" style="background-image:url('${thumb}')"></div><i class="un-shade"></i>
        <i class="un-slab s1"></i><i class="un-slab s2"></i><i class="un-slab s3"></i>
        <div class="un-kick"><span data-no-tr>UP NEXT</span><b>এরপর</b></div>
        <div class="un-card"><img src="${thumb}" alt=""><i class="un-play"></i><i class="un-shine"></i></div>
        <h2 class="un-line">${line.split(/\s+/).map((w, i) => `<span style="--i:${i}">${esc(w)}</span>`).join(" ")}</h2>
        <div class="un-count"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" style="--d:${dur}s"/></svg><b></b></div>
        <i class="un-bar" style="--d:${dur}s"></i></div>`;
      if (!st.muted && mode === "app") riser(st.audio);
      const count = () => { if (!el.isConnected && st.current) return; const left = Math.max(1, Math.ceil(dur - (now() - (sc.startAt || now())) / 1000)); const b = el.querySelector(".un-count b"); if (b && b.textContent !== bnDigits(left)) b.textContent = bnDigits(left); };
      count(); const t = setInterval(() => el.isConnected ? count() : clearInterval(t), 250);
    } else if (g.kind === "bulletin") {   // two minutes from :00 and :30, the same for everyone
      const total = sc.dur || 120, list = (st.tv?.bulletin || []).slice(0, 8), intro = 7, per = list.length ? (total - intro) / list.length : total;
      const at = new Date(sc.startAt || now()), when = slotWords(at), day = bnDate(at);
      const opening = () => `<div class="nb${channel === "v" ? " v" : ""}"><i class="nb-ray"></i><i class="nb-ray r2"></i><i class="nb-ring"></i><i class="nb-ring b"></i>
        <div class="nb-logo"><img src="${LOGO}" alt="রাষ্ট্রিক্স"></div>
        <div class="nb-word" data-no-tr><b class="w1">NEWS</b><b class="w2">BULLETIN</b></div><i class="nb-line"></i>
        <div class="nb-bn">সংবাদ বুলেটিন · ${esc(when)}</div><div class="nb-when"><span>${esc(day)}</span></div></div>`;
      const story = (x, k) => `<div class="bs${channel === "v" ? " v" : ""}"><i class="bs-bg"></i><i class="bs-glow"></i>
        <div class="bs-side"><em>${bnDigits(k + 1)}</em><small>/ ${bnDigits(list.length)}</small><span>${esc(DESK_BN[x.desk] || x.desk || "খবর")}</span></div>
        <div class="bs-main"><h2>${String(x.title || "").split(/\s+/).map((w, i) => `<span style="--i:${i}">${esc(w)}</span>`).join(" ")}</h2><p>${esc(x.text || "")}</p></div>
        <div class="bs-strap"><b data-no-tr>NEWS BULLETIN</b><span>${esc(when)}</span><div class="bs-steps">${list.map((_, j) => `<i class="${j < k ? "done" : j === k ? "on" : ""}" style="--d:${per}s"></i>`).join("")}</div><img src="${LOGO}" alt=""></div></div>`;
      let shown = -2;
      const draw = () => { if (!el.isConnected && st.current) return; const e = (now() - (sc.startAt || now())) / 1000, k = e < intro || !list.length ? -1 : Math.min(list.length - 1, Math.floor((e - intro) / per)); if (k === shown) return; const first = shown === -2; shown = k;
        const paint = () => { el.innerHTML = k < 0 ? opening() : story(list[k], k); };
        if (first || !el.isConnected) return paint();
        // A quick red slash between stories.
        const w = document.createElement("div"); w.className = "bs-wipe"; w.innerHTML = "<i></i><i></i><i></i>";
        stage.append(w); if (!st.muted) whoosh(st.audio);
        setTimeout(paint, 330); setTimeout(() => w.remove(), 900); };
      draw(); const t = setInterval(() => el.isConnected ? draw() : clearInterval(t), 250);
    } else if (g.kind === "headlines") {
      const items = g.lines?.length ? g.lines : (st.tv?.headlines || []).slice(0, 5).map(h => h.text);
      el.innerHTML = wrapV(setHTML("শিরোনাম", g.title || "সর্বশেষ", items, sc.dur || 10), g.title || "শিরোনাম");
    } else if (g.kind === "breaking") {
      el.innerHTML = channel === "h" ? `<div class="tv-breaking static"><div class="br-slash"></div><div class="br-in"><span class="br-tag">এইমাত্র পাওয়া খবর</span><b>${esc(g.text)}</b><img src="${LOGO}" alt=""></div><div class="br-bar"></div></div>` : vJacket(`<div class="br-v"><span class="br-tag">এইমাত্র পাওয়া খবর</span><b>${esc(g.text)}</b></div>`, "এইমাত্র পাওয়া খবর");
      if (g.music && !st.muted) breakingSting(st.audio, Math.min(8, sc.dur || 8));
    } else if (g.kind === "slate") {
      el.innerHTML = g.image ? `<div class="tv-promo"><img src="${esc(g.image)}" alt=""></div>` : wrapV(`<div class="nu-title${channel === "v" ? " v" : ""}"><img src="${LOGO}" alt=""><b>${esc(g.text || "রাষ্ট্রিক্স")}</b></div>`, g.text || "");
    } else if (g.kind === "promo") {
      el.innerHTML = `<div class="tv-promo"><img src="${esc(g.image)}" alt=""></div>`;
    } else if (g.kind === "ads") {   // an ad break: each card for its seconds
      const items = g.items || []; let i = -1;
      const next = () => { if (!el.isConnected && i >= 0) return; i++; const x = items[i % Math.max(1, items.length)]; if (!x) return; el.innerHTML = `<div class="tv-promo"><img src="${esc(x.image)}" alt=""></div>`; setTimeout(next, (x.seconds || 10) * 1000); };
      next();
    } else if (g.kind === "lband") {
      el.className = "tvp-lband";
      const lines = g.lines?.length ? g.lines : (st.tv?.headlines || []).slice(0, 5).map(h => h.text);
      el.innerHTML = channel === "h"
        ? `<div class="lb-side"><span class="lb-kicker">শিরোনাম</span>${lines.map(t => `<p>${esc(t)}</p>`).join("")}</div><div class="lb-bottom"><b>${esc(g.text || lines[0] || "")}</b>${adBox(sponsorAd())}</div>`
        : `<div class="lbv-bottom"><b>${esc(g.text || lines[0] || "")}</b>${lines.slice(0, 3).map(t => `<p>${esc(t)}</p>`).join("")}</div>`;
    } else if (g.kind === "results") el.innerHTML = resultsHTML(g.id, true);
    else if (g.kind === "poll") el.innerHTML = pollHTML(g.id, true);
    return el;
  }
  function resultsHTML(id, full) {
    const b = (st.tv?.boards || []).find(x => x.id === id); if (!b) return "";
    if (b.blackout) return full ? `<div class="res-full"><div class="res-head"><b>${esc(b.title)}</b></div><p class="res-block">ফল প্রকাশের সময় হয়নি। নির্বাচন কমিশনের নির্দেশ অনুযায়ী এখন কোনও ফল বা বুথফেরত সমীক্ষা দেখানো যাবে না।</p></div>` : "";
    const max = Math.max(1, ...b.rows.map(r => (r.won || 0) + (r.leading || 0)));
    const rows = b.rows.map(r => `<li style="--c:${esc(r.colour || "#AA0404")}"><b>${esc(r.party)}</b><span class="res-bar"><i style="width:${100 * ((r.won || 0) + (r.leading || 0)) / max}%"></i></span><em>${bnDigits(r.won || 0)}${b.kind === "seats" ? ` <small>+${bnDigits(r.leading || 0)}</small>` : ""}</em></li>`).join("");
    return `<div class="${full ? "res-full" : "res-bar-ovl"}"><div class="res-head"><b>${esc(b.title)}</b><small>${b.kind === "seats" ? `জয়ী + এগিয়ে · মোট আসন ${bnDigits(b.total)}` : "প্রাপ্ত ভোট"}</small></div><ol>${rows}</ol><p class="res-src">সূত্র: ${esc(b.source || "নির্বাচন কমিশন")} · শুধু সরকারি তথ্য</p></div>`;
  }
  function pollHTML(id, full) {
    const p = (st.tv?.polls || []).find(x => x.id === id); if (!p) return "";
    const total = p.counts.reduce((a, b) => a + b, 0) || 1;
    return `<div class="${full ? "poll-full" : "poll-bar"}"><div class="poll-q"><span>জনমত</span><b>${esc(p.question)}</b></div><div class="poll-opts">${p.options.map((o, i) => `<span><b>${esc(o)}</b><i style="width:${Math.round(100 * p.counts[i] / total)}%"></i><em>${bnDigits(Math.round(100 * p.counts[i] / total))}%</em></span>`).join("")}</div><small class="poll-note">অ্যাপে ভোট দিন · এটি বৈজ্ঞানিক সমীক্ষা নয় · মোট ${bnDigits(p.counts.reduce((a, b) => a + b, 0))} ভোট</small></div>`;
  }
  // Writes a layer only when its content changed, so its animations are not restarted.
  const put = (sel, html) => { const el = $(sel); if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } };
  function drawJacket() {
    let gfx = "", ovl = "";
    const c = st.ctl || {}, L = c.layers || { bug: true, live: true, clock: true, lower: true, ticker: true, ad: true, weather: true }, s = st.tv || {};
    const sc = st.current?.scene, fullGfx = stage.classList.contains("full-gfx");
    if (!sc || sc.off || sc.standby || mode === "scene" && !sc.sources?.length && !sc.graphic) { put(".tvp-gfx", ""); put(".tvp-ovl", ""); return; }
    // Full-screen graphics (the bulletin, promos): LIVE and the clock stay on screen.
    if (fullGfx) { put(".tvp-gfx", `<div class="tv-liveclock">${L.live ? `<span class="tv-live"><i></i>LIVE</span>` : ""}${L.clock ? `<span class="tv-clock">${ist()}</span>` : ""}</div>`); put(".tvp-ovl", ""); return; }
    const isVideo = (sc.sources || []).length && !sc.graphic, lband = sc.layout === "lband";
    const ticker = [...(c.ticker || []), ...(sc.ticker || []), ...(L.weather && s.weather ? [s.weather] : []), ...(s.ticker || [])];
    const strap = c.lower && L.lower ? c.lower : sc.lower && L.lower ? sc.lower : null;
    if (channel === "h") {
      gfx = `
        ${L.bug ? `<div class="tv-bug"><img src="${LOGO}" alt=""></div>` : ""}
        ${L.live ? `<div class="tv-live"><i></i>LIVE</div>` : ""}${L.clock ? `<div class="tv-clock">${ist()}${s.bangabda ? `<small>${esc(s.bangabda)}</small>` : ""}</div>` : ""}
        ${!lband && L.lower && (strap || isVideo) ? `<div class="tv-l3"><span class="lt-tag">${strap ? esc(strap.title ? "রাষ্ট্রিক্স" : "রাষ্ট্রিক্স") : "রাষ্ট্রিক্স"}</span><span class="lt-text">${strap ? `${esc(strap.name)}${strap.title ? `<small>${esc(strap.title)}</small>` : ""}` : esc(s.lowerThird || sc.label || "")}</span></div>` : ""}
        ${!lband && L.ad && isVideo ? adBox(sponsorAd()) : ""}
        ${L.ticker ? `<div class="tv-ticker"><span class="tk-label">শিরোনাম</span><div class="tk-track">${tickerHTML(ticker)}</div></div>` : ""}`;
    } else {
      const flash = s.band || (s.headlines || [])[st.flash % Math.max(1, (s.headlines || []).length)]?.text || "";
      gfx = `
        ${isVideo && L.lower ? `<div class="v-flash"><i class="vf-wipe"></i><span>${strap ? "রাষ্ট্রিক্স" : s.band ? "রাষ্ট্রিক্স" : "শিরোনাম"}</span><b>${esc(strap ? `${strap.name}${strap.title ? ` · ${strap.title}` : ""}` : flash)}</b></div>` : ""}
        ${L.live ? `<div class="tv-live v"><i></i>LIVE</div>` : ""}${L.clock ? `<div class="tv-clock v">${ist()}</div>` : ""}
        ${L.ticker ? `<div class="tv-ticker v"><span class="tk-label">খবর</span><div class="tk-track">${tickerHTML(ticker)}</div></div>` : ""}`;
    }
    // Overlays: poll bar, results bar, curated comments.
    const o = c.overlay || {};
    ovl = `${o.poll ? pollHTML(o.poll, false) : ""}<div class="ovl-right">${o.results ? resultsHTML(o.results, false) : ""}${o.comments?.length ? `<div class="cm-box">${o.comments.slice(0, 3).map(x => `<p><b>${esc(x.author)}</b><span>${esc(x.text)}</span><small>${x.platform === "youtube" ? "ইউটিউব" : x.platform === "facebook" ? "ফেসবুক" : "রাষ্ট্রিক্স অ্যাপ"}</small></p>`).join("")}</div>` : ""}</div>`;

    put(".tvp-gfx", gfx); put(".tvp-ovl", ovl);
  }
  function showBreaking(b) {
    const el = document.createElement("div"); el.className = "tv-breaking";
    el.innerHTML = channel === "h"
      ? `<div class="br-slash"></div><div class="br-in"><span class="br-tag">এইমাত্র পাওয়া খবর</span><b>${esc(b.text)}</b><img src="${LOGO}" alt=""></div><div class="br-bar"></div>`
      : vJacket(`<div class="br-v"><span class="br-tag">এইমাত্র পাওয়া খবর</span><b>${esc(b.text)}</b></div>`, "এইমাত্র পাওয়া খবর");
    stage.append(el);
    if (b.music && !st.muted) breakingSting(st.audio, Math.min(b.seconds, 8));
    st.current?.slots.forEach(s => s.setMuted(true));
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 600); st.current?.slots.forEach(s => s.setMuted(st.muted)); }, b.seconds * 1000);
  }

  /* ---------- the clock ---------- */
  function wholeVideos(sc) {
    const cur = st.current, onOrder = k => String(k || "").startsWith("c:") || String(k || "").startsWith("local:");
    if (st.localScene && now() < st.localUntil && onOrder(sc?.key)) return st.localScene;
    st.localScene = null;
    const curVideo = cur?.slots?.some(x => x.shared);
    if (!curVideo || sc?.key === cur.key || !onOrder(sc?.key) || !onOrder(cur.key)) return sc;
    const y = st.yt, startedAt = cur.drawnAt || 0;
    // Still playing (or loading in its first minute): keep it on.
    if (y && !y.ended && ([1, 3].includes(y.state) || ([-1, 5].includes(y.state) && Date.now() - startedAt < 60e3 && !host.querySelector(".tvp.yt-tap")))) return cur.scene;
    // Finished: if the order now says another video, the headline flash comes first.
    if (sc?.sources?.some(x => x.kind === "yt") && !sc.graphic) {
      st.localScene = { layout: "graphic", graphic: { kind: "flash", n: Math.floor(Date.now() / 10e3) }, startAt: now(), dur: 10, key: `local:flash:${Date.now()}`, transition: { type: "stinger", ms: 1200 } };
      st.localUntil = now() + 10e3;
      return st.localScene;
    }
    return sc;
  }
  function tick() {
    if (!st.alive) return;
    // Outputs apply realtime changes after the broadcast delay.
    while (st.queue.length && st.queue[0].at <= Date.now()) { st.ctl = st.queue.shift().state; onState?.(st.ctl); }
    let sc = resolve();
    if (sc?.key !== st.current?.key) drawScene(sc);
    if (mode === "app") preloadYT(st.preWant);
    const b = st.ctl?.breaking || st.tv?.breaking;
    if (mode !== "scene" && b && st.shownBreaking !== b.at && now() - Date.parse(b.at) < 90e3) { st.shownBreaking = b.at; showBreaking(b); }
    drawJacket();
    // Health: a source that has not moved for ten seconds is reported (outputs only).
    const stalled = st.current?.slots.some(s => s.stalled());
    st.stalledSince = stalled ? st.stalledSince || Date.now() : 0;
  }
  /* ---------- data ---------- */
  async function loadTv() {
    if (mode === "scene" && !fixedScene?.needsTv) { /* the PCR preview still wants headlines for graphics */ }
    try { const r = await fetch(`/api/tv/${channel}`, { cache: "no-store" }); if (r.ok) { const s = await r.json(); st.skew = s.serverTime - Date.now(); st.tv = s; const head = s.loop?.find(x => x.type === "video")?.ytId; if (st.seq && head && head !== st.seq.head) { st.seq.head = head; st.seq.restart = true; } } } catch { /* keep */ }
  }
  function applyCtl(state, serverTime) {
    if (serverTime) st.skew = serverTime - Date.now();
    const delay = mode === "program" && output ? (state.delay || 0) * 1000 : 0;
    if (state.dumpAt && state.dumpAt !== st.ctl?.dumpAt && Date.now() - state.dumpAt < 15000) { st.queue = []; st.dumpUntil = now() + delay; st.ctl = state; return; }
    if (!delay) { st.queue = []; st.ctl = state; onState?.(state); }
    else st.queue.push({ at: Date.now() + delay, state });
  }
  function connect() {
    if (mode === "scene" || !st.alive) return;
    const q = new URLSearchParams({ ...(key ? { key } : {}), ...(guestToken ? { t: guestToken } : {}) });
    let ws; try { ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws/ctl/${channel}?${q}`); } catch { return setTimeout(connect, 5000); }
    st.ws = ws;
    ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === "state") applyCtl(m.state, m.serverTime); if (m.type === "room") st.room = m.state; } catch { /* bad message */ } };
    ws.onclose = () => { st.ws = null; if (st.alive) setTimeout(connect, 3000); };
  }
  // Without WebSockets the state is read every five seconds.
  async function poll() { if (st.ws?.readyState === 1 || mode === "scene") return; try { const r = await fetch(`/api/ctl/${channel}/state`, { cache: "no-store" }); if (r.ok) { const d = await r.json(); applyCtl(d.state, d.serverTime); } } catch { /* offline */ } }
  function heartbeat() { if (!output || st.ws?.readyState !== 1) return; st.ws.send(JSON.stringify({ type: "hb", playing: st.current?.slots.some(s => s.playing?.()) || !!st.current?.scene?.graphic, stalledFor: st.stalledSince ? Math.round((Date.now() - st.stalledSince) / 1000) : 0, item: st.current?.scene?.label || "", ua: navigator.userAgent })); }

  loadTv().then(tick); connect(); poll();
  const timers = [setInterval(loadTv, 15000), setInterval(tick, 500), setInterval(() => { st.flash++; }, 8000), setInterval(poll, 5000), setInterval(heartbeat, 5000)];
  return {
    destroy() { st.alive = false; ["pointerdown", "keydown", "touchend", "click"].forEach(ev => document.removeEventListener(ev, firstTouch)); timers.forEach(clearInterval); ro.disconnect(); st.ws?.close(); st.current?.slots.forEach(s => s.destroy()); host.innerHTML = ""; },
    unmute, setScene(sc) { fixedScene = sc; tick(); }, get state() { return st.ctl; }
  };
}

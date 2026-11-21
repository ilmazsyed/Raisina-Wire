// An AVO story made straight into a video file (no screen recording): each frame is drawn on a
// canvas in the channel's look and encoded in this browser (WebCodecs), with the sound mixed
// beforehand (the sting, the newsreader's voice, the music, each byte's own sound). MP4 (H.264 and
// AAC) where the browser can encode it, otherwise WebM. For stories whose pictures, videos and
// bytes are files the app holds; a story with a YouTube link is recorded instead (src/avorec.js),
// since YouTube's video cannot be read into a file.
//
// The file's own order: the NEWS NOW opener (3 s); the story (its pictures and uploaded videos
// moving slowly, the headline, then each line of the script as a caption while it is read); each
// byte in full with its name super; the Rashtrix end card.
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import { newsBed, stingerSound } from "./engine.js";

// (some browsers give the first chunk no colour space; the MP4 needs one: the usual HD one)
const fixMeta = m => { if (m?.decoderConfig && !m.decoderConfig.colorSpace?.primaries) m = { ...m, decoderConfig: { ...m.decoderConfig, colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false } } }; return m; };
const FPS = 30, SR = 48000, INTRO = 3, WIPE = 0.8, OUTRO = 2.8;
const BN = "'Hind Siliguri', 'Noto Serif Bengali', sans-serif", SERIF = "'Noto Serif Bengali', 'Hind Siliguri', serif", LAT = "Montserrat, 'Hind Siliguri', sans-serif";
const RED = "#c8100f", GOLD = "#D4A017", HI = "#f2c14e";
const REGION = { bengal: "পশ্চিমবঙ্গ", kolkata: "কলকাতা", india: "ভারত", world: "বিশ্ব", bangladesh: "বাংলাদেশ", sports: "খেলা", entertainment: "বিনোদন", lifestyle: "জীবনধারা", diaspora: "প্রবাসী বাঙালি" };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), pr = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
const eo = x => 1 - Math.pow(1 - x, 3), eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// A story can be made into a file when nothing in it is on YouTube.
export const hasYouTube = x => [...(x.videos || []), ...(x.bytes || [])].some(v => v?.kind === "yt" || /youtu\.?be/.test(v?.url || ""));

// What this browser can encode: MP4 (H.264 + AAC) first, then WebM (VP9 + Opus); null if neither.
export async function fileSupport(W = 1920, H = 1080) {
  if (!window.VideoEncoder || !window.AudioEncoder || !window.OfflineAudioContext) return null;
  const ok = async (E, c) => { try { return (await E.isConfigSupported(c)).supported; } catch { return false; } };
  const a = { sampleRate: SR, numberOfChannels: 2, bitrate: 160000 };
  for (const [kind, vc, ac] of [["mp4", "avc1.640028", "mp4a.40.2"], ["mp4", "avc1.4d0028", "mp4a.40.2"], ["webm", "vp09.00.40.08", "opus"], ["webm", "vp8", "opus"]]) {
    const v = { codec: vc, width: W, height: H, bitrate: 6e6, framerate: FPS };
    if (await ok(VideoEncoder, v) && await ok(AudioEncoder, { ...a, codec: ac })) return { kind, video: v, audio: { ...a, codec: ac } };
  }
  return null;
}

/* ---------- loading ---------- */
const loadImg = src => new Promise(res => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const loadVideo = src => new Promise(res => {
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
  const done = ok => { clearTimeout(tm); res(ok && v.videoWidth ? v : null); }, tm = setTimeout(() => done(false), 20000);
  v.onloadeddata = () => done(true); v.onerror = () => done(false); v.src = src; v.load();
});
const seek = (v, t) => new Promise(res => {
  t = clamp(t, 0, Math.max(0, (v.duration || 0) - 0.05));
  if (Math.abs(v.currentTime - t) < 0.004 && v.readyState >= 2) return res();
  const done = () => { clearTimeout(tm); v.removeEventListener("seeked", done); res(); }, tm = setTimeout(done, 2500);
  v.addEventListener("seeked", done); v.currentTime = t;
});
async function decode(ctx, url) { try { const b = await (await fetch(url)).arrayBuffer(); return await ctx.decodeAudioData(b); } catch { return null; } }

/* ---------- drawing ---------- */
const font = (c, w, px, fam = BN) => { c.font = `${w} ${Math.round(px)}px ${fam}`; };
function wrap(c, text, maxW) { const out = []; let cur = ""; for (const w of String(text || "").split(/\s+/).filter(Boolean)) { const nx = cur ? `${cur} ${w}` : w; if (c.measureText(nx).width > maxW && cur) { out.push(cur); cur = w; } else cur = nx; } if (cur) out.push(cur); return out; }
function fit(c, text, maxW, px, lines, w = 800, fam = BN) { for (let s = px; s > px * .45; s -= px * .04) { font(c, w, s, fam); const L = wrap(c, text, maxW); if (L.length <= lines) return { L, px: s }; } font(c, w, px * .45, fam); return { L: wrap(c, text, maxW).slice(0, lines), px: px * .45 }; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// A picture or a video frame filling its box (cover), drifting slowly.
function cover(c, el, x, y, w, h, k = 0, zoom = .1) {
  const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight; if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih) * (1 + zoom * k), dw = iw * s, dh = ih * s;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(el, x + (w - dw) / 2 + (k - .5) * w * .03, y + (h - dh) / 2, dw, dh); c.restore();
}
function backdrop(c, W, H, t, map) {
  const g = c.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, "#5a0a10"); g.addColorStop(.55, "#2a0405"); g.addColorStop(1, "#120203");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (map) { const s = Math.max(W / map.naturalWidth, H / map.naturalHeight) * 1.15, dw = map.naturalWidth * s, dh = map.naturalHeight * s; c.save(); c.globalAlpha = .15; c.drawImage(map, (W - dw) / 2 - (t * 6) % 60, (H - dh) / 2, dw, dh); c.restore(); }
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.5)"); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
function wipe(c, W, H, k) { if (k <= 0 || k >= 1) return; const x = (eio(k) * 2 - 1) * W * 1.35; c.save(); c.translate(x, 0); c.transform(1, 0, -.25, 1, 0, 0); c.fillStyle = RED; c.fillRect(-W * .1, 0, W * .62, H); c.fillStyle = GOLD; c.fillRect(W * .52, 0, W * .05, H); c.restore(); }
function logoAt(c, img, x, y, h, a = 1) { if (!img) return; const w = h * img.naturalWidth / img.naturalHeight; c.save(); c.globalAlpha = a; c.shadowColor = "rgba(0,0,0,.45)"; c.shadowBlur = h * .08; c.drawImage(img, x, y, w, h); c.restore(); }

// The whole film as a list of parts with their times, and a frame drawn for any moment of it.
function build(x, A, V) {
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080, pad = V ? 56 : 80;
  const parts = []; let t = 0;
  const add = (kind, dur, extra = {}) => { parts.push({ kind, a: t, b: t + dur, ...extra }); t += dur; };
  add("intro", INTRO);
  add("story", A.narr + 1.2);
  A.bytes.forEach(b => add("byte", b.dur, { byte: b }));
  add("outro", OUTRO);
  const total = t, story = parts[1];
  // The script's lines as captions, each for its share of the reading.
  const lines = (x.lines || []).map(s => String(s).trim()).filter(Boolean), chars = lines.reduce((n, l) => n + l.length, 0) || 1;
  let lt = story.a + 2.6; const span = Math.max(4, A.narr - 2.2);
  const caps = lines.map(l => { const d = span * l.length / chars, o = { l, a: lt, b: lt + d }; lt += d; return o; });
  // The story's pictures and uploaded videos in turn, each at least four seconds.
  const media = A.media, slots = Math.max(1, Math.min(media.length, Math.floor((story.b - story.a) / 4))), each = (story.b - story.a) / slots;
  const kick = REGION[x.region] || "";

  function strap(c, tt, a) {
    // NEWS UPDATE and the headline, on the white bar; the gold line under it shows the story's progress.
    const h = V ? 108 : 96, y = V ? H - 300 : H - 150, tagW = V ? 190 : 200, w = W - pad * 2;
    c.save(); c.globalAlpha = a; c.translate(0, (1 - a) * 30);
    c.shadowColor = "rgba(0,0,0,.4)"; c.shadowBlur = 18; c.fillStyle = "#fff"; rr(c, pad, y, w, h, 8); c.fill(); c.shadowBlur = 0;
    c.fillStyle = RED; rr(c, pad, y, tagW, h, 8); c.fill(); c.fillRect(pad + tagW - 10, y, 10, h);
    c.fillStyle = "#fff"; c.textBaseline = "middle"; font(c, 900, V ? 30 : 30, LAT); c.fillText("NEWS", pad + 22, y + h * .33); c.fillText("UPDATE", pad + 22, y + h * .68);
    const F = fit(c, x.title, w - tagW - 44, V ? 40 : 44, V ? 2 : 1, 700); c.fillStyle = "#111";
    F.L.forEach((l, i) => c.fillText(l, pad + tagW + 22, y + h / 2 + (i - (F.L.length - 1) / 2) * F.px * 1.25));
    c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(pad, y + h + 12, w, 5); c.fillStyle = GOLD; c.fillRect(pad, y + h + 12, w * pr(tt, story.a, parts[parts.length - 1].a), 5);
    c.restore(); return y;
  }
  function jacket(c, a) {
    logoAt(c, A.logo, W - pad - (V ? 110 : 118), V ? 60 : 44, V ? 158 : 170, a);
    font(c, 800, V ? 34 : 32); const w1 = c.measureText("খবর").width, w2 = kick ? c.measureText(kick).width + 34 : 0, h = V ? 62 : 58, y = V ? 150 : 56;
    c.save(); c.globalAlpha = a; c.fillStyle = RED; rr(c, pad, y, w1 + 48 + w2 + (kick ? 14 : 0), h, h / 2); c.fill();
    c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText("খবর", pad + 24, y + h / 2 + 2);
    if (kick) { c.fillStyle = HI; rr(c, pad + w1 + 40, y + 9, w2, h - 18, (h - 18) / 2); c.fill(); c.fillStyle = "#1a0405"; font(c, 800, V ? 28 : 26); c.fillText(kick, pad + w1 + 57, y + h / 2 + 2); }
    c.restore();
  }

  async function prepare(tt) {   // the video frames this moment needs
    const p = parts.find(q => tt >= q.a && tt < q.b) || parts[parts.length - 1];
    if (p.kind === "byte") await seek(p.byte.el, tt - p.a - WIPE * .5);
    if (p.kind === "story" && media.length) { const m = media[Math.min(slots - 1, Math.floor((tt - p.a) / each)) % media.length]; if (m.videoWidth) await seek(m, (tt - p.a) % Math.max(1, m.duration - .1)); }
  }
  function draw(c, tt) {
    const p = parts.find(q => tt >= q.a && tt < q.b) || parts[parts.length - 1], lt2 = tt - p.a;
    c.save(); c.textAlign = "left"; c.textBaseline = "top";
    if (p.kind === "intro") {
      backdrop(c, W, H, tt, A.map);
      const a = eo(pr(lt2, .15, .8)), cx = W / 2, cy = H / 2;
      logoAt(c, A.logo, cx - (V ? 90 : 80), cy - (V ? 420 : 330) + (1 - a) * 40, V ? 258 : 228, a);
      font(c, 900, V ? 120 : 150, LAT); const w1 = c.measureText("NEWS").width, w2 = c.measureText("NOW").width, gap = 40, bw = w2 + 70, tw = w1 + gap + bw, bx = cx - tw / 2 + w1 + gap, by = cy - (V ? 80 : 70), bh = V ? 160 : 190, k = eo(pr(lt2, .5, 1.1));
      c.globalAlpha = a; c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText("NEWS", cx - tw / 2, by + bh / 2 + 6);
      c.globalAlpha = k; c.fillStyle = RED; rr(c, bx, by, bw * k, bh, 14); c.fill(); c.fillStyle = "#fff"; c.fillText("NOW", bx + 35, by + bh / 2 + 6);
      c.globalAlpha = eo(pr(lt2, 1, 1.6)); font(c, 700, V ? 56 : 60, SERIF); c.fillStyle = HI; c.textAlign = "center"; c.fillText("এই মুহূর্তের খবর", cx, by + bh + (V ? 90 : 80));
      c.globalAlpha = 1; c.fillStyle = GOLD; const lw = W * .5 * eo(pr(lt2, .9, 2)); c.fillRect(cx - lw / 2, by + bh + (V ? 170 : 150), lw, 5);
    } else if (p.kind === "story") {
      const i = Math.min(slots - 1, Math.floor(lt2 / each)), m = media.length ? media[i % media.length] : null, k = (lt2 - i * each) / each;
      if (m) { cover(c, m, 0, 0, W, H, k, .12); const sh = c.createLinearGradient(0, H * .3, 0, H); sh.addColorStop(0, "rgba(10,2,3,0)"); sh.addColorStop(1, "rgba(10,2,3,.92)"); c.fillStyle = sh; c.fillRect(0, 0, W, H);
        const top = c.createLinearGradient(0, 0, 0, H * .22); top.addColorStop(0, "rgba(10,2,3,.6)"); top.addColorStop(1, "rgba(10,2,3,0)"); c.fillStyle = top; c.fillRect(0, 0, W, H * .22);
        if (false && m.credit) { font(c, 500, 22); c.fillStyle = "rgba(255,255,255,.7)"; c.textAlign = "right"; c.fillText(m.credit, W - pad, (V ? H - 330 : H - 180) - 34); c.textAlign = "left"; }
      } else backdrop(c, W, H, tt, A.map);
      const a = eo(pr(lt2, .2, .9)), sy = strap(c, tt, a), tw = W - pad * 2, bottom = sy - (V ? 50 : 40);
      jacket(c, a);
      const cap = caps.find(q => tt >= q.a && tt < q.b);
      if (!cap) {   // the headline, large, until the first line is read (and for a story with no script)
        const F = fit(c, x.title, tw, V ? 92 : 96, V ? 5 : 3, 800, SERIF), lh = F.px * 1.28, y0 = m ? bottom - F.L.length * lh : (H - F.L.length * lh) / 2 - 40, out = caps.length ? 1 - pr(tt, caps[0].a - .3, caps[0].a) : 1;
        c.fillStyle = "#fff"; c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 16; let n = 0; const all = F.L.join(" ").split(" ").length;
        F.L.forEach((ln, li) => { let cx = pad; ln.split(" ").forEach(w => { const q = eo(pr(lt2, .5 + 1.2 * n / all, .95 + 1.2 * n / all)); c.globalAlpha = q * out; c.fillText(w, cx, y0 + li * lh + (1 - q) * 30); cx += c.measureText(w + " ").width; n++; }); });
        c.globalAlpha = 1; c.shadowBlur = 0;
      } else {      // the line being read, as a caption
        const F = fit(c, cap.l, tw - 60, V ? 58 : 56, V ? 6 : 3, 600), lh = F.px * 1.36, bh = F.L.length * lh + 44, y0 = m ? bottom - bh : (H - bh) / 2 - 40, q = Math.min(eo(pr(tt, cap.a, cap.a + .35)), 1 - pr(tt, cap.b - .2, cap.b));
        c.globalAlpha = q; c.fillStyle = "rgba(10,2,3,.72)"; rr(c, pad, y0, tw, bh, 14); c.fill(); c.fillStyle = GOLD; c.fillRect(pad, y0, 8, bh);
        c.fillStyle = "#fff"; F.L.forEach((ln, li) => c.fillText(ln, pad + 34, y0 + 24 + li * lh + (1 - q) * 12)); c.globalAlpha = 1;
      }
    } else if (p.kind === "byte") {
      const v = p.byte.el;
      c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
      // (a byte of another shape: its own picture whole, over a dimmed, enlarged copy of itself)
      const iw = v.videoWidth, ih = v.videoHeight, same = Math.abs(iw / ih - W / H) < .25;
      if (same) cover(c, v, 0, 0, W, H, 0, 0);
      else { c.save(); c.filter = "blur(30px) brightness(.45)"; cover(c, v, -60, -60, W + 120, H + 120, 0, 0); c.restore(); const s = Math.min(W / iw, H / ih); c.drawImage(v, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s); }
      const a = eo(pr(lt2, WIPE * .5 + .3, WIPE * .5 + .9)) * (1 - pr(tt, p.b - .5, p.b)), sy = strap(c, tt, 1);
      jacket(c, 1);
      const b = p.byte;
      if (b.name || b.title) {   // the name super
        font(c, 800, V ? 46 : 48); const nw = c.measureText(b.name || "").width; font(c, 600, V ? 30 : 30); const tw2 = c.measureText(b.title || "").width, bw = Math.max(nw, tw2) + 60, bh = b.title ? (V ? 128 : 126) : (V ? 84 : 84), y0 = sy - bh - (V ? 70 : 44);
        c.save(); c.globalAlpha = a; c.translate((1 - a) * -40, 0);
        c.fillStyle = RED; rr(c, pad, y0 - 46, 150, 46, 6); c.fill(); c.fillStyle = "#fff"; c.textBaseline = "middle"; font(c, 700, 26); c.fillText("বক্তব্য", pad + 20, y0 - 22);
        c.fillStyle = "#fff"; rr(c, pad, y0, bw, bh, 6); c.fill(); c.fillStyle = GOLD; c.fillRect(pad, y0, 8, bh);
        c.fillStyle = "#111"; font(c, 800, V ? 46 : 48); c.fillText(b.name || "", pad + 30, y0 + (b.title ? bh * .34 : bh / 2) + 2);
        if (b.title) { c.fillStyle = "#555"; font(c, 600, 30); c.fillText(b.title, pad + 30, y0 + bh * .74); }
        c.restore();
      }
    } else {   // the end card
      backdrop(c, W, H, tt, A.map);
      const a = eo(pr(lt2, .3, 1)), cx = W / 2, lh = V ? 430 : 380;
      logoAt(c, A.logo, cx - lh * (A.logo ? A.logo.naturalWidth / A.logo.naturalHeight : .7) / 2, H / 2 - lh * .72 + (1 - a) * 30, lh, a);
      c.textAlign = "center"; c.globalAlpha = eo(pr(lt2, .7, 1.3)); font(c, 800, V ? 64 : 68, SERIF); c.fillStyle = "#fff"; c.fillText("খবর দেখুন, শুনুন, পড়ুন", cx, H / 2 + lh * .36);
      c.globalAlpha = eo(pr(lt2, 1.1, 1.7)); font(c, 800, V ? 36 : 38, LAT); c.fillStyle = HI; c.fillText("rashtrix.live", cx, H / 2 + lh * .36 + (V ? 110 : 110));
      c.globalAlpha = 1; c.fillStyle = GOLD; const lw = W * .4 * eo(pr(lt2, .8, 1.8)); c.fillRect(cx - lw / 2, H / 2 + lh * .36 + (V ? 86 : 88), lw, 4);
      if (tt > total - .4) { c.globalAlpha = pr(tt, total - .4, total); c.fillStyle = "#000"; c.fillRect(0, 0, W, H); }
    }
    c.globalAlpha = 1;
    // the red and gold wipe across each change of part
    for (const q of parts.slice(1)) wipe(c, W, H, pr(tt, q.a - WIPE * .5, q.a + WIPE * .5));
    c.restore();
  }
  return { W, H, total, parts, prepare, draw };
}

/* ---------- the sound, mixed whole before the picture is made ---------- */
async function mix(x, A, film) {
  const ctx = new OfflineAudioContext(2, Math.ceil(film.total * SR), SR), story = film.parts[1];
  stingerSound(ctx, { at: 0.05, keep: true });
  newsBed(ctx, story.b - story.a + 0.6, { style: "avo", duck: A.voices.length ? 0.5 : 0.85, delay: story.a - 0.3, all: true });
  let at = story.a + 0.5;
  for (const buf of A.voices) { const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; g.gain.value = 1; s.connect(g).connect(ctx.destination); s.start(at); at += buf.duration + 0.3; }
  for (const p of film.parts) {
    if (p.kind !== "byte") continue;
    stingerSound(ctx, { at: p.a - WIPE * .5, keep: true });
    if (p.byte.audio) { const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = p.byte.audio; g.gain.setValueAtTime(0.0001, p.a); g.gain.linearRampToValueAtTime(1, p.a + WIPE * .5 + .1); s.connect(g).connect(ctx.destination); s.start(p.a + WIPE * .5); }
  }
  const out = film.parts[film.parts.length - 1];
  stingerSound(ctx, { at: out.a - WIPE * .5, keep: true });
  newsBed(ctx, OUTRO, { style: "headlines", duck: 0.7, delay: out.a, all: true });
  // (the whole mix brought to a peak of -1 dB, never clipping)
  const buf = await ctx.startRendering();
  let peak = 0; for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
  const k = peak > 0.89 ? 0.89 / peak : 1;
  if (k < 1) for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= k; }
  return buf;
}

// Make the file. onProgress(0..1, label). Returns { blob, ext }.
export async function makeAvoFile(x, { orient = "h", onProgress = () => {}, cancelled = () => false } = {}) {
  const V = orient === "v", sup = await fileSupport(V ? 1080 : 1920, V ? 1920 : 1080);
  if (!sup) throw new Error("This browser cannot make video files. Use Chrome or Edge on a computer.");
  onProgress(0, "Loading the story’s pictures, videos and voice");
  await Promise.all(['800 40px "Noto Serif Bengali"', '700 40px "Hind Siliguri"', '600 40px "Hind Siliguri"', '900 40px Montserrat'].map(f => document.fonts.load(f, "অআকখ RX").catch(() => {})));
  const dec = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
  const [logo, map, imgs, vids, voices, bytes] = await Promise.all([
    loadImg("/brand/logo.webp"), loadImg("/brand/worldmap-dots.webp"),
    Promise.all((x.images || []).map(async i => { const im = await loadImg(i.src); if (im) im.credit = i.credit || ""; return im; })),
    Promise.all((x.videos || []).filter(v => v.kind !== "yt").map(v => loadVideo(v.url))),
    Promise.all((x.voice || []).map(u => decode(dec, u))),
    Promise.all((x.bytes || []).map(async b => { const el = await loadVideo(b.url); if (!el) return null; return { el, audio: await decode(dec, b.url), name: b.name || "", title: b.title || "", dur: WIPE * .5 + Math.max(2, el.duration || Number(b.secs) || 10) }; }))
  ]);
  try { dec.close(); } catch { /* closed */ }
  const vo = voices.filter(Boolean), narr = vo.length ? vo.reduce((n, b) => n + b.duration + 0.3, 0) + 0.6 : Math.max(10, (x.lines || []).join(" ").length / 13);
  // (uploaded videos first, then the pictures, as on air)
  const A = { logo, map, media: [...vids.filter(Boolean), ...imgs.filter(Boolean)], voices: vo, bytes: bytes.filter(Boolean), narr: Math.max(8, narr) };
  const film = build(x, A, V), { W, H, total } = film;
  onProgress(0.03, "Mixing the sound");
  const audio = await mix(x, A, film);

  const mp4 = sup.kind === "mp4", target = mp4 ? new Mp4Target() : new WebmTarget();
  const muxer = mp4
    ? new Mp4Muxer({ target, fastStart: "in-memory", video: { codec: "avc", width: W, height: H, frameRate: FPS }, audio: { codec: "aac", numberOfChannels: 2, sampleRate: SR } })
    : new WebmMuxer({ target, video: { codec: sup.video.codec.startsWith("vp09") ? "V_VP9" : "V_VP8", width: W, height: H, frameRate: FPS }, audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: SR } });
  let failed = null;
  const venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, fixMeta(meta)), error: e => { failed = e; } });
  venc.configure({ ...sup.video, ...(mp4 ? { avc: { format: "avc" } } : {}), latencyMode: "quality" });
  const aenc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: e => { failed = e; } });
  aenc.configure(sup.audio);
  // the sound, in tenths of a second
  { const L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L, step = SR / 10;
    for (let o = 0; o < L.length; o += step) { const n = Math.min(step, L.length - o), data = new Float32Array(n * 2); data.set(L.subarray(o, o + n), 0); data.set(R.subarray(o, o + n), n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(o / SR * 1e6), data }); aenc.encode(ad); ad.close(); } }
  // the picture, frame by frame
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H; const c = canvas.getContext("2d", { alpha: false });
  const frames = Math.ceil(total * FPS);
  for (let i = 0; i < frames; i++) {
    if (failed) throw failed; if (cancelled()) { try { venc.close(); aenc.close(); } catch { /* closed */ } throw new Error("Stopped."); }
    const tt = i / FPS; await film.prepare(tt); film.draw(c, tt);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(tt * 1e6), duration: Math.round(1e6 / FPS) }); venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
    while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
    if (i % 10 === 0) { onProgress(0.06 + 0.92 * i / frames, "Making the video"); await new Promise(r => setTimeout(r, 0)); }
  }
  await venc.flush(); await aenc.flush(); if (failed) throw failed;
  muxer.finalize(); venc.close(); aenc.close();
  A.bytes.forEach(b => { b.el.removeAttribute("src"); b.el.load(); }); A.media.forEach(m => { if (m.videoWidth) { m.removeAttribute("src"); m.load(); } });
  onProgress(1, "Done");
  return { blob: new Blob([target.buffer], { type: mp4 ? "video/mp4" : "video/webm" }), ext: mp4 ? "mp4" : "webm", seconds: total, W, H };
}

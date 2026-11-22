// The long-form explainer (the Explainer desk, src/xpldesk.js): a Vox-style film of 1.5 to 2.5
// minutes drawn on one canvas, every frame a pure function of time, so the desk's preview, the
// channel's playout (src/engine.js, kind "explainer") and the downloaded MP4 are the same film.
//
// A film is a list of shots, one sentence of narration each, in one of four looks:
//   politics (navy and red, punchy), crime (charcoal and amber, a case file), govt (white paper and
//   teal, documents and charts), soft (cream and saffron, photo-led).
// Shot types: kinetic (big words, a highlighter on the key ones), number (counts up), versus, bars,
// timeline, list, quote (lights up as it is read), doc (a clipping, a highlighter sweeps the key
// phrase), map (places in India and the world, pins and lines from the first), photo, video (a
// clip under the narration) and byte (a person's clip in full, with their name and designation).
// The film opens on a title card and ends on the Rashtrix card; a NEWS UPDATE band carries the
// headline throughout, the narration runs as a caption above it (the app is often watched muted).
import { newsBed } from "./engine.js";

export const STYLES = {
  politics: { name: "Hard Politics", bg: "#0a1428", bg2: "#13244a", ink: "#ffffff", mute: "rgba(255,255,255,.62)", acc: "#e3172b", acc2: "#f2c14e", hl: "#e3172b", hlInk: "#ffffff", paper: "#f4efe6", bed: "bulletin", kicker: "রাজনীতি" },
  crime: { name: "Crime", bg: "#0e0f12", bg2: "#1d1f25", ink: "#f5f5f4", mute: "rgba(245,245,244,.6)", acc: "#f59e0b", acc2: "#dc2626", hl: "#f59e0b", hlInk: "#111111", paper: "#ece6d6", bed: "avo", kicker: "অপরাধ" },
  govt: { name: "Official Govt Reports", bg: "#f5f3ee", bg2: "#e6efed", ink: "#0f172a", mute: "rgba(15,23,42,.6)", acc: "#0f766e", acc2: "#1d4ed8", hl: "#fde047", hlInk: "#0f172a", paper: "#ffffff", bed: "weather", kicker: "সরকারি রিপোর্ট" },
  soft: { name: "Good / Soft Stories", bg: "#fff7ec", bg2: "#ffe7cc", ink: "#3b2414", mute: "rgba(59,36,20,.62)", acc: "#ea580c", acc2: "#db2777", hl: "#fdba74", hlInk: "#3b2414", paper: "#ffffff", bed: "upnext", kicker: "ভালো খবর" }
};
export const SHOT_TYPES = { kinetic: "Big words", number: "Number", versus: "Versus", bars: "Bar chart", timeline: "Timeline", list: "List", quote: "Quote", doc: "Document", map: "Map", photo: "Photo", video: "Video", byte: "Byte (in full)" };
export const INTRO = 2.6, OUTRO = 3.2, GAP = 0.3;
const BN = "'Hind Siliguri', 'Noto Serif Bengali', sans-serif", SERIF = "'Noto Serif Bengali', 'Hind Siliguri', serif", LAT = "Montserrat, 'Hind Siliguri', sans-serif";
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const eo = x => 1 - Math.pow(1 - clamp(x), 3), eio = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = x => { x = clamp(x); const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
export const bnNum = v => String(v).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
const fmtNum = (v, dec = 0) => bnNum(Number(v).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const isYT = u => /youtu\.?be/.test(String(u || ""));

// How long a shot runs: its voice and a breath; a byte, its own length in full.
export function shotSecs(s) {
  if (s.t === "byte") return Math.max(3, Number(s.secs) || 20) + 0.8;
  if (s.voice?.secs) return s.voice.secs + GAP;
  return Math.max(2.4, String(s.say || "").length / 13 + GAP);   // (before it is voiced: an estimate)
}
// The film's timeline: when each shot starts and ends.
export function timeline(x) {
  let t = INTRO; const shots = (x.shots || []).map(s => { const d = shotSecs(s), o = { ...s, t0: t, t1: t + d, d }; t += d; return o; });
  return { shots, total: t + OUTRO };
}

/* ---------- loading what a film draws ---------- */
const loadImg = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.crossOrigin = "anonymous"; i.decoding = "async"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const loadVid = src => new Promise(res => { if (!src || isYT(src)) return res(null); const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = src;
  const ok = () => res(v); v.addEventListener("loadeddata", ok, { once: true }); v.addEventListener("error", () => res(null), { once: true }); setTimeout(() => res(v.readyState >= 2 ? v : null), 15000); });
export async function loadAssets(x) {
  await Promise.all(['800 60px "Noto Serif Bengali"', '700 40px "Hind Siliguri"', '600 30px "Hind Siliguri"', '900 40px Montserrat', '800 30px Montserrat'].map(f => document.fonts?.load(f, "অআকখ RX ০১২").catch(() => {})));
  const urls = new Set(), vids = new Set();
  for (const s of x.shots || []) { const m = s.media; if (!m) continue; if (s.t === "video" || s.t === "byte" || /\.(mp4|webm|mov)(\?|$)/i.test(m)) vids.add(m); else urls.add(m); }
  const [logo, map] = await Promise.all([loadImg("/brand/logo.webp"), loadImg("/brand/worldmap-dots.webp")]);
  // (the map's dots, read once: a 12-pixel grid on the 1920 × 900 dotted map)
  let dots = [];
  if (map) { try { const k = document.createElement("canvas"); k.width = map.width; k.height = map.height; const kc = k.getContext("2d", { willReadFrequently: true }); kc.drawImage(map, 0, 0);
    const d = kc.getImageData(0, 0, k.width, k.height).data, sx = k.width / 1920; for (let y = 6; y < 900; y += 12) for (let x = 6; x < 1920; x += 12) { const i = (Math.round(y * sx) * k.width + Math.round(x * sx)) * 4 + 3; if (d[i] > 100) dots.push([x, y]); } } catch { dots = []; } }
  const img = new Map(await Promise.all([...urls].map(async u => [u, await loadImg(u)])));
  const vid = new Map(await Promise.all([...vids].map(async u => [u, await loadVid(u)])));
  return { logo, map, dots, img, vid, tint: new Map() };
}

/* ---------- drawing helpers ---------- */
function wrap(c, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean), lines = []; let line = "";
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
// Text set as large as fits the box (down to a floor), wrapped.
function fitText(c, text, family, weight, maxW, maxH, start, floor, lh = 1.22) {
  let size = start, lines;
  for (; size > floor; size *= .93) { c.font = `${weight} ${Math.round(size)}px ${family}`; lines = wrap(c, text, maxW); if (lines.length * size * lh <= maxH) break; }
  c.font = `${weight} ${Math.round(size)}px ${family}`; lines = wrap(c, text, maxW);
  return { size, lines, lh: size * lh };
}
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function cover(c, im, x, y, w, h, zoom = 1, dx = 0, dy = 0) {
  const iw = im.videoWidth || im.naturalWidth || im.width, ih = im.videoHeight || im.naturalHeight || im.height; if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih) * zoom, sw = w / k, sh = h / k;
  const sx = clamp((iw - sw) / 2 + dx * (iw - sw) / 2, 0, Math.max(0, iw - sw)), sy = clamp((ih - sh) / 2 + dy * (ih - sh) / 2, 0, Math.max(0, ih - sh));
  try { c.drawImage(im, sx, sy, sw, sh, x, y, w, h); } catch { /* not ready */ }
}

/* ---------- the film ---------- */
export function film(x, A, { orient = "h" } = {}) {
  const V = orient === "v", W = V ? 1080 : 1920, H = V ? 1920 : 1080, M = 1080;
  const S = STYLES[x.style] || STYLES.politics, { shots, total } = timeline(x);
  const PAD = V ? 70 : 120;
  // the area the shots draw in (above the caption and the band)
  const BAND = V ? 150 : 104, CAP = V ? 170 : 96;
  const area = { x: PAD, y: V ? 250 : 110, w: W - PAD * 2, h: H - (V ? 250 : 110) - BAND - CAP - (V ? 40 : 30) };
  const shotAt = t => shots.find(s => t >= s.t0 && t < s.t1) || null;

  function background(c, t) {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, S.bg); g.addColorStop(1, S.bg2); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // a slow grid and two turning rings, always moving one way (never pulsing)
    c.save(); c.globalAlpha = x.style === "govt" || x.style === "soft" ? .06 : .07; c.strokeStyle = S.ink; c.lineWidth = 1;
    const step = 80, off = (t * 12) % step;
    for (let gx = -step + off; gx < W + step; gx += step) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); }
    for (let gy = -step + off * .6; gy < H + step; gy += step) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }
    c.restore();
    c.save(); c.globalAlpha = .12; c.strokeStyle = S.acc; c.lineWidth = 2; c.translate(W * .86, H * .2); c.rotate(t * .05);
    c.beginPath(); c.arc(0, 0, M * .32, 0, Math.PI * 1.4); c.stroke(); c.rotate(-t * .12); c.setLineDash([6, 14]); c.beginPath(); c.arc(0, 0, M * .42, 0, Math.PI * 2); c.stroke(); c.restore();
    if (x.style === "crime") { c.save(); c.globalAlpha = .08; c.fillStyle = S.acc; for (let i = -2; i < 12; i++) { c.beginPath(); const sx = i * 180 + (t * 20) % 180; c.moveTo(sx, H); c.lineTo(sx + 60, H); c.lineTo(sx + 60 + H * .35, 0); c.lineTo(sx + H * .35, 0); c.fill(); } c.restore(); }
  }
  // the Rashtrix logo, top right; the explainer tag, top left
  function chrome(c, t) {
    const lw = V ? 120 : 110;
    if (A.logo) { const lh = lw * A.logo.height / A.logo.width; c.save(); c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 16; c.fillStyle = "#fff"; rrect(c, W - PAD - lw - 10, (V ? 70 : 34) - 8, lw + 20, lh + 16, 10); c.fill(); c.restore(); c.drawImage(A.logo, W - PAD - lw, V ? 70 : 34, lw, lh); }
    c.save(); c.font = `800 ${V ? 30 : 24}px ${BN}`; const tag = x.kicker || S.kicker, tw = c.measureText(tag).width;
    c.fillStyle = S.acc; rrect(c, PAD, V ? 84 : 44, tw + 70, V ? 52 : 44, 8); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(PAD + 22, (V ? 84 : 44) + (V ? 26 : 22), 7, 0, Math.PI * 2); c.globalAlpha = .55 + .45 * Math.abs(Math.sin(t * 2.4)); c.fill(); c.globalAlpha = 1;
    c.fillText(tag, PAD + 42, (V ? 84 : 44) + (V ? 37 : 31)); c.restore();
  }
  // the NEWS UPDATE band with the headline, and the narration as a caption above it
  function band(c, t, s) {
    const by = H - BAND, p = eo((t - .3) / .6);
    c.save(); c.globalAlpha = p;
    c.fillStyle = "rgba(0,0,0,.86)"; c.fillRect(0, by, W, BAND);
    c.fillStyle = S.acc; const tagW = V ? 230 : 230; c.fillRect(0, by, tagW, BAND);
    c.fillStyle = "#fff"; c.font = `900 ${V ? 30 : 26}px ${LAT}`; c.fillText("NEWS", 26, by + BAND * .45); c.fillText("UPDATE", 26, by + BAND * .45 + (V ? 34 : 28));
    c.fillStyle = S.acc2; c.fillRect(tagW, by, 6, BAND);
    const hx = tagW + 30, hw = W - hx - 30; const f = fitText(c, x.title || "", SERIF, 800, hw, BAND * .78, V ? 44 : 40, 22, 1.18);
    c.fillStyle = "#fff"; c.textBaseline = "middle"; const top = by + BAND / 2 - (f.lines.length - 1) * f.lh / 2;
    f.lines.slice(0, 2).forEach((l, i) => c.fillText(l, hx, top + i * f.lh)); c.textBaseline = "alphabetic";
    c.restore();
    if (!s || s.t === "byte" || !s.say) return;
    const u = t - s.t0, cp = eo(u / .35) * (1 - eo((u - s.d + .25) / .25));
    c.save(); c.globalAlpha = cp; const cf = fitText(c, s.say, BN, 600, W - PAD * 2 - 40, CAP - 22, V ? 38 : 32, 22, 1.25);
    const lines = cf.lines.slice(0, 3), bh = lines.length * cf.lh + 22, cy = by - bh - 12;
    const dark = x.style === "govt" || x.style === "soft";
    c.fillStyle = dark ? "rgba(15,23,42,.88)" : "rgba(0,0,0,.6)"; rrect(c, W / 2 - Math.min(W - PAD * 2, Math.max(...lines.map(l => c.measureText(l).width)) + 50) / 2, cy, Math.min(W - PAD * 2, Math.max(...lines.map(l => c.measureText(l).width)) + 50), bh, 12); c.fill();
    c.fillStyle = "#fff"; c.textAlign = "center"; lines.forEach((l, i) => c.fillText(l, W / 2, cy + 11 + cf.size * .95 + i * cf.lh)); c.restore();
  }

  /* ---- the shots ---- */
  const D = {};
  D.kinetic = (c, s, u) => {
    const text = s.text || s.say || "", hl = (s.hl || []).map(w => String(w).trim()).filter(Boolean);
    const f = fitText(c, text.replace(/\|/g, " "), SERIF, 800, area.w * .92, area.h * .9, V ? 120 : 112, 48, 1.24);
    const top = area.y + area.h / 2 - f.lines.length * f.lh / 2 + f.size * .85; let k = 0;
    f.lines.forEach((line, li) => {
      const words = line.split(" "), widths = words.map(w => c.measureText(`${w} `).width), tot = widths.reduce((a, b) => a + b, 0) - c.measureText(" ").width;
      let cx = W / 2 - tot / 2;
      words.forEach((w, wi) => {
        const p = eo((u - k++ * .06) / .5), y = top + li * f.lh, hot = hl.some(h => w.replace(/[,।.!?]/g, "").includes(h) || h.includes(w.replace(/[,।.!?]/g, "")));
        if (hot) { const hp = eio((u - .35 - k * .04) / .45); c.save(); c.fillStyle = S.hl; c.globalAlpha = .95; rrect(c, cx - 8, y - f.size * .9, (widths[wi] - c.measureText(" ").width + 16) * hp, f.size * 1.12, 8); c.fill(); c.restore(); }
        c.save(); c.globalAlpha = p; c.fillStyle = hot && eio((u - .35 - k * .04) / .45) > .4 ? S.hlInk : S.ink; c.fillText(w, cx, y + (1 - p) * f.size * .5); c.restore();
        cx += widths[wi];
      });
    });
  };
  D.number = (c, s, u) => {
    const val = Number(s.value) || 0, dec = String(s.value).includes(".") ? 1 : 0, p = eio(u / 1.2);
    const txt = `${s.prefix || ""}${fmtNum(val * p, dec)}${s.suffix || ""}`;
    // (one line, as large as fits the width with room for the spring-in)
    let size = V ? 230 : 250; for (; size > 50; size *= .94) { c.font = `900 ${Math.round(size)}px ${BN}`; if (c.measureText(`${s.prefix || ""}${fmtNum(val, dec)}${s.suffix || ""}`).width <= area.w * .82) break; }
    c.save(); c.textAlign = "center"; c.fillStyle = S.acc; c.font = `900 ${Math.round(size)}px ${BN}`;
    const cy = area.y + area.h * .48; c.translate(W / 2, cy); const sc = .8 + .2 * back(u / .6); c.scale(sc, sc); c.fillText(txt, 0, 0); c.restore();
    c.save(); c.textAlign = "center"; c.fillStyle = S.ink; c.globalAlpha = eo((u - .5) / .5);
    const lf = fitText(c, s.label || s.text || "", SERIF, 700, area.w * .8, area.h * .3, V ? 60 : 54, 30, 1.25); lf.lines.slice(0, 3).forEach((l, i) => c.fillText(l, W / 2, cy + (V ? 120 : 110) + i * lf.lh)); c.restore();
  };
  D.versus = (c, s, u) => {
    const a = s.a || {}, b = s.b || {}, cols = V ? [[W / 2, area.y + area.h * .25], [W / 2, area.y + area.h * .75]] : [[W * .3, area.y + area.h * .5], [W * .7, area.y + area.h * .5]];
    [[a, 0], [b, .5]].forEach(([o, delay], i) => {
      const p = eo((u - delay) / .5), [cx, cy] = cols[i], v = Number(o.value) || 0, dec = String(o.value).includes(".") ? 1 : 0;
      c.save(); c.globalAlpha = p; c.textAlign = "center";
      c.fillStyle = i ? S.acc2 : S.acc; let fs = 150; const full = `${o.prefix || ""}${fmtNum(v, dec)}${o.suffix || ""}`; for (; fs > 50; fs *= .94) { c.font = `900 ${Math.round(fs)}px ${BN}`; if (c.measureText(full).width <= (V ? area.w * .86 : area.w * .42)) break; } c.font = `900 ${Math.round(fs)}px ${BN}`; c.fillText(`${o.prefix || ""}${fmtNum(v * eio((u - delay) / 1), dec)}${o.suffix || ""}`, cx, cy);
      c.fillStyle = S.ink; const lf = fitText(c, o.label || "", SERIF, 700, V ? area.w * .9 : area.w * .38, 160, 50, 28); lf.lines.slice(0, 2).forEach((l, k) => c.fillText(l, cx, cy + 70 + k * lf.lh));
      c.restore();
    });
    const p = back((u - .3) / .5); c.save(); c.translate(W / 2, area.y + area.h * (V ? .5 : .44)); c.scale(p, p); c.fillStyle = S.ink; c.beginPath(); c.arc(0, 0, 58, 0, Math.PI * 2); c.fill();
    c.fillStyle = S.bg; c.font = `800 38px ${BN}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("বনাম", 0, 2); c.restore();
  };
  D.bars = (c, s, u) => {
    const items = (s.items || []).slice(0, 6).map(i => typeof i === "string" ? { label: i, value: 0 } : i), max = Math.max(1, ...items.map(i => Number(i.value) || 0));
    const title = s.text || ""; let y0 = area.y;
    if (title) { c.save(); c.fillStyle = S.ink; c.globalAlpha = eo(u / .4); const f = fitText(c, title, SERIF, 800, area.w, 140, V ? 64 : 58, 32); f.lines.slice(0, 2).forEach((l, i) => c.fillText(l, area.x, area.y + f.size + i * f.lh)); y0 += f.lines.slice(0, 2).length * f.lh + 30; c.restore(); }
    const rowH = Math.min(V ? 150 : 110, (area.y + area.h - y0) / Math.max(1, items.length)), lw = V ? area.w : area.w * .3;
    items.forEach((it, i) => {
      const p = eio((u - .3 - i * .22) / .8), y = y0 + i * rowH, bx = V ? area.x : area.x + lw + 20, bw = (V ? area.w - 200 : area.w - lw - 220) * (Number(it.value) || 0) / max * p, bh = rowH * (V ? .34 : .52);
      c.save(); c.globalAlpha = clamp(p * 3); c.fillStyle = S.ink; c.font = `700 ${V ? 40 : 38}px ${BN}`; c.fillText(it.label || "", area.x, y + (V ? 40 : rowH * .55)); c.restore();
      c.save(); c.fillStyle = i === 0 ? S.acc : S.acc2; rrect(c, bx, y + (V ? 56 : rowH * .2), Math.max(4, bw), bh, 8); c.fill();
      c.globalAlpha = clamp(p * 2 - 1); c.fillStyle = S.ink; c.font = `800 ${V ? 40 : 38}px ${BN}`; c.fillText(`${it.prefix || ""}${fmtNum((Number(it.value) || 0) * p, String(it.value).includes(".") ? 1 : 0)}${it.suffix || ""}`, bx + bw + 16, y + (V ? 56 : rowH * .2) + bh * .78); c.restore();
    });
  };
  D.timeline = (c, s, u, sd) => {
    const items = (s.items || []).slice(0, 6).map(i => typeof i === "string" ? { when: "", what: i } : i), n = Math.max(1, items.length);
    const cur = Math.min(n - 1, Math.floor(u / Math.max(.8, (sd - .3) / n)));
    c.save(); c.strokeStyle = S.mute; c.lineWidth = 4;
    if (V) { const x0 = area.x + 40, y0 = area.y + 30, y1 = area.y + area.h - 30, step = (y1 - y0) / Math.max(1, n - 1 || 1);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y0 + (y1 - y0) * eio(u / .8)); c.stroke();
      items.forEach((it, i) => { const p = eo((u - .3 - i * .25) / .45), y = y0 + i * (n > 1 ? step : 0), on = i === cur; c.globalAlpha = p;
        c.fillStyle = on ? S.acc : S.ink; c.beginPath(); c.arc(x0, y, on ? 20 : 13, 0, Math.PI * 2); c.fill();
        c.font = `800 38px ${BN}`; c.fillStyle = S.acc; c.fillText(bnNum(it.when || ""), x0 + 44, y - 8);
        c.font = `${on ? 700 : 600} 36px ${BN}`; c.fillStyle = S.ink; wrap(c, it.what || "", area.w - 110).slice(0, 2).forEach((l, k) => c.fillText(l, x0 + 44, y + 36 + k * 42)); });
    } else { const y0 = area.y + area.h * .45, x0 = area.x + 30, x1 = area.x + area.w - 30, step = (x1 - x0) / Math.max(1, n - 1 || 1);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + (x1 - x0) * eio(u / .8), y0); c.stroke();
      items.forEach((it, i) => { const p = eo((u - .3 - i * .25) / .45), x = x0 + i * (n > 1 ? step : 0), on = i === cur; c.globalAlpha = p; c.textAlign = "center";
        c.fillStyle = on ? S.acc : S.ink; c.beginPath(); c.arc(x, y0, on ? 22 : 14, 0, Math.PI * 2); c.fill();
        c.font = `800 40px ${BN}`; c.fillStyle = S.acc; c.fillText(bnNum(it.when || ""), x, y0 - 46);
        c.font = `${on ? 700 : 600} 32px ${BN}`; c.fillStyle = S.ink; wrap(c, it.what || "", Math.min(380, step * .92 || 380)).slice(0, 3).forEach((l, k) => c.fillText(l, x, y0 + 70 + k * 40)); });
    }
    c.restore();
  };
  D.list = (c, s, u, sd) => {
    const items = (s.items || []).slice(0, 5).map(String), n = Math.max(1, items.length), cur = Math.min(n - 1, Math.floor(u / Math.max(.8, (sd - .3) / n)));
    let y = area.y; if (s.text) { c.save(); c.fillStyle = S.ink; const f = fitText(c, s.text, SERIF, 800, area.w, 140, V ? 66 : 60, 34); f.lines.slice(0, 2).forEach((l, i) => c.fillText(l, area.x, y + f.size + i * f.lh)); y += f.lines.slice(0, 2).length * f.lh + 34; c.restore(); }
    const rowH = Math.min(V ? 190 : 120, (area.y + area.h - y) / n);
    items.forEach((it, i) => { const p = eo((u - .2 - i * .3) / .45), on = i === cur; c.save(); c.globalAlpha = p * (on ? 1 : .55); c.translate((1 - p) * 60, 0);
      c.fillStyle = on ? S.acc : S.mute; rrect(c, area.x, y + i * rowH + 6, 64, 64, 14); c.fill(); c.fillStyle = "#fff"; c.font = `900 38px ${BN}`; c.textAlign = "center"; c.fillText(bnNum(i + 1), area.x + 32, y + i * rowH + 51);
      c.textAlign = "left"; c.fillStyle = S.ink; c.font = `${on ? 700 : 600} ${V ? 42 : 42}px ${BN}`; wrap(c, it, area.w - 100).slice(0, 2).forEach((l, k) => c.fillText(l, area.x + 92, y + i * rowH + 50 + k * 50)); c.restore(); });
  };
  D.quote = (c, s, u, sd) => {
    const text = s.text || s.say || "", f = fitText(c, `“${text}”`, SERIF, 700, area.w * .86, area.h * .7, V ? 84 : 80, 36, 1.3);
    const words = f.lines.join(" ").split(" ").length, lit = (u - .2) / Math.max(1, sd * .85) * words; let k = 0;
    c.save(); c.globalAlpha = .18 * eo(u / .4); c.fillStyle = S.acc; c.font = `900 ${V ? 420 : 380}px Georgia, serif`; c.fillText("“", area.x - 20, area.y + (V ? 330 : 300)); c.restore();
    const top = area.y + area.h * .45 - f.lines.length * f.lh / 2 + f.size;
    f.lines.forEach((line, li) => { let cx = area.x + area.w * .07;
      for (const w of line.split(" ")) { const p = eo((u - k * .025) / .4); c.save(); c.globalAlpha = p; c.fillStyle = k < lit ? S.ink : S.mute; c.fillText(w, cx, top + li * f.lh); c.restore(); cx += c.measureText(`${w} `).width; k++; } });
    if (s.who) { c.save(); c.globalAlpha = eo((u - .6) / .5); c.fillStyle = S.acc; c.font = `800 ${V ? 44 : 40}px ${BN}`; c.fillText(`— ${s.who}`, area.x + area.w * .07, top + f.lines.length * f.lh + 40); c.restore(); }
  };
  D.doc = (c, s, u) => {
    const text = s.text || s.say || "", hl = String((s.hl || [])[0] || "").trim(), pw = V ? area.w : area.w * .72, ph = Math.min(area.h * .9, V ? 900 : 620);
    const px = W / 2 - pw / 2, py = area.y + area.h / 2 - ph / 2, p = eo(u / .55), tilt = (x.style === "crime" ? -2.2 : -1.2) * (1 - p) - 1;
    c.save(); c.translate(W / 2, py + ph / 2); c.rotate(tilt * Math.PI / 180); c.translate(-W / 2, -(py + ph / 2)); c.translate(0, (1 - p) * 120); c.globalAlpha = p;
    c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 40; c.shadowOffsetY = 18; c.fillStyle = S.paper; c.fillRect(px, py, pw, ph); c.shadowColor = "transparent";
    c.fillStyle = S.acc; c.fillRect(px, py, pw, 12);
    c.fillStyle = "#6b7280"; c.font = `700 ${V ? 28 : 24}px ${LAT}`; c.fillText(String(s.source || "DOCUMENT").toUpperCase(), px + 40, py + 60);
    const f = fitText(c, text, SERIF, 600, pw - 80, ph - 150, V ? 50 : 46, 26, 1.42); c.fillStyle = "#111";
    // (the phrase's words, found in the text, are swept one after another)
    const all = f.lines.join(" ").split(" "), hw = hl ? hl.split(/\s+/) : [], strip = w => w.replace(/[,।.!?“”"']/g, "");
    let from = -1; if (hw.length) for (let i = 0; i <= all.length - hw.length && from < 0; i++) if (hw.every((w, k) => strip(all[i + k]) === strip(w))) from = i;
    if (from < 0 && hw.length) from = all.findIndex(w => strip(w) === strip(hw[0]));
    let wi = 0; const sweep = eio((u - .8) / .8) * hw.length;
    f.lines.forEach((l, i) => { const y = py + 120 + i * f.lh; let cx = px + 40;
      for (const w of l.split(" ")) { const ww = c.measureText(w).width, sp = c.measureText(" ").width, k = wi - from;
        if (from >= 0 && k >= 0 && k < hw.length && sweep > k) { c.save(); c.fillStyle = S.hl; c.globalAlpha = .75; c.fillRect(cx - 4, y - f.size * .85, (ww + sp) * clamp(sweep - k) + 4, f.size * 1.1); c.restore(); }
        c.fillStyle = "#111"; c.fillText(w, cx, y); cx += ww + sp; wi++; } });
    if (x.style === "crime") { c.save(); c.globalAlpha = eo((u - 1) / .3) * .9; c.translate(px + pw - 170, py + ph - 110); c.rotate(-.18); c.strokeStyle = S.acc2; c.lineWidth = 6; rrect(c, -110, -40, 220, 80, 8); c.stroke(); c.fillStyle = S.acc2; c.font = `900 34px ${BN}`; c.textAlign = "center"; c.fillText("তদন্তাধীন", 0, 12); c.restore(); }
    c.restore();
  };
  D.map = (c, s, u) => {
    const places = (s.places || []).filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lon)).slice(0, 6);
    const P = (lon, lat) => [(lon + 180) / 360 * 1920, (84 - lat) / 142 * 900];
    let lo0 = 68, lo1 = 98, la0 = 6, la1 = 36;   // India by default
    if (places.length) { lo0 = Math.min(...places.map(p => +p.lon)); lo1 = Math.max(...places.map(p => +p.lon)); la0 = Math.min(...places.map(p => +p.lat)); la1 = Math.max(...places.map(p => +p.lat));
      const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2, span = Math.max(26, (lo1 - lo0) * 1.7, (la1 - la0) * 1.7 * (area.w / area.h)); lo0 = cx - span / 2; lo1 = cx + span / 2; const vs = span * area.h / area.w; la0 = cy - vs / 2; la1 = cy + vs / 2; }
    const [sx0, sy0] = P(lo0, la1), [sx1, sy1] = P(lo1, la0), z = 1 + .05 * eio(u / 4);
    const toS = (lon, lat) => { const [mx, my] = P(lon, lat); return [area.x + (mx - sx0) / (sx1 - sx0) * area.w, area.y + (my - sy0) / (sy1 - sy0) * area.h]; };
    if (A.dots?.length) {
      const k = area.w / (sx1 - sx0), r = clamp(12 * k * .28, 2.5, 14);
      c.save(); c.globalAlpha = .42 * eo(u / .5); c.beginPath(); c.rect(area.x, area.y, area.w, area.h); c.clip();
      c.translate(W / 2, area.y + area.h / 2); c.scale(z, z); c.translate(-W / 2, -(area.y + area.h / 2)); c.fillStyle = S.ink; c.beginPath();
      for (const [mx, my] of A.dots) { if (mx < sx0 - 12 || mx > sx1 + 12 || my < sy0 - 12 || my > sy1 + 12) continue; const px = area.x + (mx - sx0) * k, py = area.y + (my - sy0) / (sy1 - sy0) * area.h; c.moveTo(px + r, py); c.arc(px, py, r, 0, Math.PI * 2); }
      c.fill(); c.restore();
    }
    const pts = places.map(p => ({ ...p, xy: toS(+p.lon, +p.lat) }));
    pts.forEach((p, i) => {
      const at = .5 + i * .45, pp = back((u - at) / .5), [px, py] = p.xy;
      if (i > 0) { const [ax, ay] = pts[0].xy, lp = eio((u - at + .3) / .6); c.save(); c.strokeStyle = S.acc2; c.lineWidth = 4; c.setLineDash([10, 10]); c.beginPath(); const mx = (ax + px) / 2, my = Math.min(ay, py) - 120; c.moveTo(ax, ay); for (let k = 1; k <= 24 * lp; k++) { const q = k / 24; c.lineTo((1 - q) * (1 - q) * ax + 2 * (1 - q) * q * mx + q * q * px, (1 - q) * (1 - q) * ay + 2 * (1 - q) * q * my + q * q * py); } c.stroke(); c.restore(); }
      c.save(); c.translate(px, py); c.scale(pp, pp);
      const ring = (u * .8 + i * .3) % 1; c.strokeStyle = S.acc; c.globalAlpha = (1 - ring) * .8; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 18 + ring * 50, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = S.acc; c.beginPath(); c.arc(0, 0, 16, 0, Math.PI * 2); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.fill();
      c.font = `800 ${V ? 40 : 38}px ${BN}`; const tw = c.measureText(p.name || "").width; c.fillStyle = "rgba(0,0,0,.78)"; rrect(c, 24, -30, tw + 28, 54, 10); c.fill(); c.fillStyle = "#fff"; c.fillText(p.name || "", 38, 10);
      c.restore();
    });
    if (s.text) { c.save(); c.fillStyle = S.ink; c.globalAlpha = eo(u / .5); c.font = `800 ${V ? 58 : 52}px ${SERIF}`; wrap(c, s.text, area.w).slice(0, 2).forEach((l, i) => c.fillText(l, area.x, area.y + 50 + i * 62)); c.restore(); }
  };
  const photo = (c, s, u, sd, el) => {
    const p = eo(u / .5), z = 1.04 + .08 * (u / Math.max(1, sd)), dx = Math.sin((s.t0 || 0) * 1.7) * .4 * (u / Math.max(1, sd));
    c.save(); c.globalAlpha = p;
    if (el) cover(c, el, 0, 0, W, H, z, dx, 0); else { c.fillStyle = S.bg2; c.fillRect(0, 0, W, H); }
    const g = c.createLinearGradient(0, H * .35, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.72)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // a light sweep as the shot comes in
    const sw = eio((u - .2) / .9); if (sw > 0 && sw < 1) { const gx = -W * .3 + sw * W * 1.6, lg = c.createLinearGradient(gx - 200, 0, gx + 200, 0); lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(.5, "rgba(255,255,255,.18)"); lg.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = lg; c.fillRect(0, 0, W, H); }
    c.restore();
    if (s.text) { c.save(); c.globalAlpha = eo((u - .3) / .5); c.fillStyle = "#fff"; c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 18; const f = fitText(c, s.text, SERIF, 800, area.w, 220, V ? 72 : 64, 34); f.lines.slice(0, 3).forEach((l, i) => c.fillText(l, area.x, area.y + f.size + i * f.lh)); c.restore(); }
    if (s.credit) { c.save(); c.fillStyle = "rgba(255,255,255,.75)"; c.font = `600 22px ${BN}`; c.textAlign = "right"; c.fillText(s.credit, W - PAD, area.y + area.h + 20); c.restore(); }
  };
  D.photo = (c, s, u, sd) => photo(c, s, u, sd, A.img.get(s.media) || null);
  D.video = (c, s, u, sd) => photo(c, s, u, sd, A.vid.get(s.media) || A.img.get(s.media) || null);
  D.byte = (c, s, u) => {
    const el = A.vid.get(s.media); c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    if (el) cover(c, el, 0, 0, W, H, 1);
    else if (isYT(s.media)) { c.save(); c.fillStyle = S.bg2; c.fillRect(0, 0, W, H); c.fillStyle = S.mute; c.font = `700 40px ${BN}`; c.textAlign = "center"; c.fillText("বাইট", W / 2, H / 2); c.restore(); }
    // the super: name and designation
    const p = eo((u - .4) / .5), sy = H - BAND - (V ? 230 : 180);
    c.save(); c.globalAlpha = p; c.translate((1 - p) * -80, 0);
    c.font = `800 ${V ? 52 : 48}px ${SERIF}`; const nw = c.measureText(s.name || "").width; c.font = `600 ${V ? 34 : 30}px ${BN}`; const rw = c.measureText(s.role || "").width, bw = Math.max(nw, rw) + 70;
    c.fillStyle = S.acc; c.fillRect(PAD, sy, 12, V ? 150 : 130); c.fillStyle = "rgba(0,0,0,.82)"; c.fillRect(PAD + 12, sy, bw, V ? 150 : 130);
    c.fillStyle = "#fff"; c.font = `800 ${V ? 52 : 48}px ${SERIF}`; c.fillText(s.name || "", PAD + 44, sy + (V ? 64 : 58)); c.fillStyle = S.acc2; c.font = `600 ${V ? 34 : 30}px ${BN}`; c.fillText(s.role || "", PAD + 44, sy + (V ? 118 : 104));
    c.restore();
  };

  function intro(c, t) {
    const p = eo(t / .6), out = eio((t - INTRO + .45) / .45);
    c.save(); c.globalAlpha = 1 - out;
    c.fillStyle = S.acc; c.fillRect(0, H * .5 + 40 - (V ? 360 : 230), W * eio(t / .5), 10);
    c.textAlign = "center"; c.fillStyle = S.ink; const f = fitText(c, x.title || "", SERIF, 900, W - PAD * 2.4, V ? 560 : 330, V ? 104 : 96, 44, 1.2);
    const lines = f.lines.slice(0, 4), top = H * .5 + 40 - lines.length * f.lh / 2;   // (the block's top; the red rule runs through the middle)
    lines.forEach((l, i) => { const q = eo((t - .25 - i * .12) / .5); c.globalAlpha = (1 - out) * q; c.fillText(l, W / 2, top + f.size + i * f.lh + (1 - q) * 40); });
    c.fillStyle = S.acc2; c.font = `800 ${V ? 46 : 40}px ${BN}`; c.globalAlpha = (1 - out) * p; c.fillText(`ব্যাখ্যা · ${x.kicker || S.kicker}`, W / 2, top - (V ? 40 : 30));
    c.restore();
  }
  function outro(c, t) {
    const u = t - (total - OUTRO), p = eo(u / .6);
    c.save(); c.fillStyle = S.bg; c.globalAlpha = p; c.fillRect(0, 0, W, H); c.globalAlpha = p;
    if (A.logo) { const lw = V ? 380 : 300, lh = lw * A.logo.height / A.logo.width, sc = .7 + .3 * back(u / .7); c.save(); c.translate(W / 2, H * .44); c.scale(sc, sc); c.fillStyle = "#fff"; rrect(c, -lw / 2 - 18, -lh / 2 - 18, lw + 36, lh + 36, 18); c.fill(); c.drawImage(A.logo, -lw / 2, -lh / 2, lw, lh); c.restore(); }
    c.textAlign = "center"; c.fillStyle = S.ink; c.font = `800 ${V ? 52 : 46}px ${BN}`; c.globalAlpha = eo((u - .5) / .5); c.fillText("রাষ্ট্রিক্স ব্যাখ্যা", W / 2, H * .44 + (V ? 330 : 270));
    c.fillStyle = S.acc; c.font = `800 ${V ? 34 : 30}px ${LAT}`; c.fillText("RASHTRIX.LIVE", W / 2, H * .44 + (V ? 390 : 322));
    c.restore();
  }
  // A cut: a coloured wipe across the frame between shots (every other shot), a quick fade otherwise.
  function cut(c, t) {
    for (const s of shots) { const k = t - s.t0; if (k < -.18 || k > .22 || s === shots[0]) continue;
      const i = shots.indexOf(s); if (i % 2) { const q = (k + .18) / .4; c.save(); c.fillStyle = i % 4 === 1 ? S.acc : S.acc2; c.beginPath(); const x0 = -W * .3 + q * W * 1.6; c.moveTo(x0 - 260, 0); c.lineTo(x0, 0); c.lineTo(x0 - 160, H); c.lineTo(x0 - 420, H); c.fill(); c.restore(); } }
  }

  function draw(c, t) {
    c.save(); c.textAlign = "left"; c.textBaseline = "alphabetic";
    background(c, t);
    const s = shotAt(t);
    if (t < INTRO) intro(c, t);
    else if (s) { const u = t - s.t0; (D[s.t] || D.kinetic)(c, s, u, s.d); }
    if (t >= INTRO - .3 && t < total - OUTRO + .2 && (!s || s.t !== "byte")) chrome(c, t);
    if (t >= INTRO - .2 && t < total - OUTRO + .3) band(c, t, s);
    cut(c, t);
    if (t >= total - OUTRO) outro(c, t);
    c.restore();
  }
  // Before a frame is drawn for a file: the video under it seeks to its time.
  async function prepare(t) {
    const s = shotAt(t); if (!s || !["video", "byte"].includes(s.t)) return;
    const el = A.vid.get(s.media); if (!el) return;
    const want = s.t === "byte" ? Math.max(0, t - s.t0 - .3) : (t - s.t0) % Math.max(1, el.duration || 1);
    if (Math.abs(el.currentTime - want) < .02) return;
    await new Promise(r => { const done = () => { el.removeEventListener("seeked", done); r(); }; el.addEventListener("seeked", done); el.currentTime = want; setTimeout(done, 1500); });
  }
  return { W, H, total, shots, draw, prepare, shotAt, style: S };
}

/* ---------- playing a film live (the desk's preview, the channel's playout) ---------- */
// host: an element; returns { destroy(), total, film }. The canvas fills the host (16:9 or 9:16),
// the voice plays line by line, bytes play with their own sound (an uploaded clip on the canvas,
// a YouTube byte in its player over the canvas), the style's music bed runs underneath.
export async function playExplainer(host, x, { orient = "h", startAt = Date.now(), muted = false, audio = null, onEnd = null } = {}) {
  const A = await loadAssets(x), F = film(x, A, { orient });
  const cv = document.createElement("canvas"); cv.width = F.W; cv.height = F.H; cv.className = "xpl-canvas";
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(cv); const c = cv.getContext("2d");
  let alive = true, raf = 0, cur = null, voiceEl = null, ytEl = null, bed = null;
  // (every line's voice loaded ahead, so each starts on its cue; a line still finishing its last word when
  //  the next shot comes is let end, unless more than a second of it is left)
  const voices = new Map(); if (!muted) for (const s of F.shots) if (s.voice?.url && !voices.has(s.voice.url)) { const a = new Audio(); a.preload = "auto"; a.src = s.voice.url; voices.set(s.voice.url, a); }
  const stopVoice = (all = false) => { const v = voiceEl; voiceEl = null; if (!v) return; try { if (all || !(v.duration - v.currentTime < 1.0)) v.pause(); } catch { /* none */ } };
  const ctx = audio || (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } })();
  if (ctx && !muted) { try { if (ctx.state !== "running") ctx.resume(); bed = newsBed(ctx, F.total, { style: F.style.bed, duck: 0.45 }); } catch { /* no music */ } }
  const frame = () => {
    if (!alive) return;
    if (!host.isConnected) { destroy(); return; }
    const t = (Date.now() - startAt) / 1000;
    if (t >= F.total) { destroy(); onEnd?.(); return; }
    const s = F.shotAt(t);
    if (s !== cur) {
      cur = s; stopVoice(); if (ytEl) { ytEl.remove(); ytEl = null; }
      A.vid.forEach(v => { if (v && !v.paused) v.pause(); });
      if (s?.voice?.url && !muted) { voiceEl = voices.get(s.voice.url) || new Audio(s.voice.url); try { voiceEl.currentTime = Math.max(0, t - s.t0); } catch { /* not loaded yet */ } voiceEl.play().catch(() => {}); }
      if (s && (s.t === "video" || s.t === "byte")) {
        const v = A.vid.get(s.media);
        if (v) { v.muted = s.t !== "byte" || muted; v.currentTime = Math.max(0, t - s.t0 - (s.t === "byte" ? .3 : 0)); v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
        else if (isYT(s.media)) {
          const id = (String(s.media).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1];
          if (id) { ytEl = document.createElement("iframe"); ytEl.allow = "autoplay; encrypted-media"; ytEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none";
            ytEl.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1&start=${Math.floor(Math.max(0, t - s.t0))}&mute=${s.t === "byte" && !muted ? 0 : 1}`;
            host.append(ytEl); }
        }
      }
    }
    F.draw(c, t);
    raf = requestAnimationFrame(frame);
  };
  function destroy() { alive = false; cancelAnimationFrame(raf); stopVoice(true); voices.forEach(a => { a.pause(); a.removeAttribute("src"); }); try { bed?.(); } catch { /* none */ } ytEl?.remove(); A.vid.forEach(v => { if (v) { v.pause(); v.removeAttribute("src"); v.load(); } }); cv.remove(); if (!audio) try { ctx?.close(); } catch { /* closed */ } }
  frame();
  return { destroy, total: F.total, film: F };
}

/* ---------- making the film into a file (in this browser) ---------- */
// MP4 (H.264 + AAC) where the browser can encode it, otherwise WebM. A YouTube video or byte cannot
// be read into a file: the desk says so and offers the channel's playout instead.
export async function makeExplainerFile(x, { orient = "h", onProgress = () => {}, cancelled = () => false } = {}) {
  const { fileSupport } = await import("./avofile.js");
  const { Muxer: Mp4Muxer, ArrayBufferTarget: Mp4Target } = await import("mp4-muxer");
  const { Muxer: WebmMuxer, ArrayBufferTarget: WebmTarget } = await import("webm-muxer");
  const V = orient === "v", sup = await fileSupport(V ? 1080 : 1920, V ? 1920 : 1080);
  if (!sup) throw new Error("This browser cannot make video files. Use Chrome or Edge on a computer.");
  onProgress(0, "Loading the pictures, videos and voice");
  const A = await loadAssets(x), F = film(x, A, { orient }), FPS = 30, SR = 48000;
  // the sound: the voice line by line, each byte's own sound, the music bed under it all
  onProgress(.02, "Mixing the sound");
  const off = new OfflineAudioContext(2, Math.ceil(F.total * SR), SR);
  const dec = async u => { try { const r = await fetch(u); return await off.decodeAudioData(await r.arrayBuffer()); } catch { return null; } };
  for (const s of F.shots) {
    const u = s.t === "byte" ? s.media : s.voice?.url; if (!u || isYT(u)) continue;
    const b = await dec(u); if (!b) continue; const src = off.createBufferSource(); src.buffer = b; src.connect(off.destination); src.start(s.t0 + (s.t === "byte" ? .3 : 0), 0, s.d);
  }
  newsBed(off, F.total, { style: F.style.bed, duck: 0.45, all: true });
  const mix = await off.startRendering();
  const mp4 = sup.kind === "mp4", target = mp4 ? new Mp4Target() : new WebmTarget();
  const muxer = mp4 ? new Mp4Muxer({ target, fastStart: "in-memory", video: { codec: "avc", width: F.W, height: F.H, frameRate: FPS }, audio: { codec: "aac", numberOfChannels: 2, sampleRate: SR } })
    : new WebmMuxer({ target, video: { codec: sup.video.codec.startsWith("vp09") ? "V_VP9" : "V_VP8", width: F.W, height: F.H, frameRate: FPS }, audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: SR } });
  let failed = null;
  const fix = m => (m?.decoderConfig && !m.decoderConfig.colorSpace?.primaries ? { ...m, decoderConfig: { ...m.decoderConfig, colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false } } } : m);
  const venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, fix(meta)), error: e => { failed = e; } });
  venc.configure({ ...sup.video, ...(mp4 ? { avc: { format: "avc" } } : {}), latencyMode: "quality" });
  const aenc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: e => { failed = e; } });
  aenc.configure(sup.audio);
  { const L = mix.getChannelData(0), R = mix.getChannelData(1), step = SR / 10;
    for (let o = 0; o < L.length; o += step) { const n = Math.min(step, L.length - o), data = new Float32Array(n * 2); data.set(L.subarray(o, o + n), 0); data.set(R.subarray(o, o + n), n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(o / SR * 1e6), data }); aenc.encode(ad); ad.close(); } }
  const cv = document.createElement("canvas"); cv.width = F.W; cv.height = F.H; const c = cv.getContext("2d", { alpha: false });
  const frames = Math.ceil(F.total * FPS);
  for (let i = 0; i < frames; i++) {
    if (failed) throw failed; if (cancelled()) { try { venc.close(); aenc.close(); } catch { /* closed */ } throw new Error("Stopped."); }
    const tt = i / FPS; await F.prepare(tt); F.draw(c, tt);
    const vf = new VideoFrame(cv, { timestamp: Math.round(tt * 1e6), duration: Math.round(1e6 / FPS) }); venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
    while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
    if (i % 10 === 0) { onProgress(.05 + .94 * i / frames, "Making the video"); await new Promise(r => setTimeout(r, 0)); }
  }
  await venc.flush(); await aenc.flush(); if (failed) throw failed;
  muxer.finalize(); venc.close(); aenc.close();
  A.vid.forEach(v => { if (v) { v.removeAttribute("src"); v.load(); } });
  onProgress(1, "Done");
  return { blob: new Blob([target.buffer], { type: mp4 ? "video/mp4" : "video/webm" }), ext: mp4 ? "mp4" : "webm", seconds: F.total };
}
// A film with a YouTube video or byte cannot be made into a file.
export const xplHasYouTube = x => (x.shots || []).some(s => (s.t === "video" || s.t === "byte") && isYT(s.media));

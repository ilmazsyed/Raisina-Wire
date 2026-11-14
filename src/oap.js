// The OAP desk's graphics engine: animated show promos, news infographics, market price boards,
// daily commodity prices, weather boards and tile graphics, horizontal (1920×1080) and vertical
// (1080×1920), drawn on a canvas in the channel's look (its reds and golds, its fonts, the full
// Rashtrix logo). draw(ctx, spec, t) paints the frame at time t (seconds) of a graphic `spec.dur`
// seconds long; the desk plays it, and records it into a video file (src/oapdesk.js).

// The styles the desk offers, each inside the channel's look.
export const STYLES = {
  red: { name: "Rashtrix red", bg: ["#2a0405", "#5a0a10", "#120203"], acc: "#c8100f", gold: "#D4A017", hi: "#f2c14e", ink: "#ffffff", sub: "rgba(255,255,255,.78)", card: "rgba(0,0,0,.34)", line: "rgba(242,193,78,.55)", dots: "rgba(242,193,78,.16)" },
  gold: { name: "Royal gold", bg: ["#17110a", "#2b1d08", "#0b0703"], acc: "#AA0404", gold: "#f2c14e", hi: "#ffe08a", ink: "#fff7e3", sub: "rgba(255,240,205,.8)", card: "rgba(242,193,78,.08)", line: "rgba(242,193,78,.7)", dots: "rgba(242,193,78,.2)" },
  night: { name: "Night blue", bg: ["#071226", "#0d2a4a", "#040a16"], acc: "#c8100f", gold: "#D4A017", hi: "#f2c14e", ink: "#ffffff", sub: "rgba(220,232,255,.8)", card: "rgba(255,255,255,.06)", line: "rgba(242,193,78,.5)", dots: "rgba(160,200,255,.16)" },
  paper: { name: "Paper white", bg: ["#fbf7ef", "#f1e9da", "#e9dfcb"], acc: "#c4121a", gold: "#AA7A04", hi: "#c4121a", ink: "#1a0405", sub: "rgba(26,4,5,.72)", card: "rgba(196,18,26,.06)", line: "rgba(170,122,4,.55)", dots: "rgba(170,4,4,.12)" },
  breaking: { name: "Breaking red", bg: ["#c8100f", "#8e0a0a", "#5a0606"], acc: "#1a0405", gold: "#ffd76a", hi: "#ffe08a", ink: "#ffffff", sub: "rgba(255,255,255,.88)", card: "rgba(0,0,0,.24)", line: "rgba(255,215,106,.7)", dots: "rgba(255,255,255,.12)" }
};
// The music under each kind (src/engine.js newsBed styles).
export const MUSIC = { promo: "upnext", info: "headlines", market: "market", commodity: "market", weather: "weather", tile: "avo" };
export const KINDS = { promo: "Show promo", info: "News infographic", market: "Market price board", commodity: "Daily commodity prices", weather: "Weather board", tile: "Tile graphic" };
export const SKIES = { sun: "Sunny", partly: "Partly cloudy", cloud: "Cloudy", rain: "Rain", storm: "Thunderstorm", fog: "Fog" };

// Where the channel's jacket sits over a graphic on air (measured from the player: src/engine.js,
// src/tv.css), in percent of the frame (x, y, w, h). Graphics keep these places clear (only the
// background shows there), so the logo, the LIVE dock with the clock, the reel's headline box and
// the ticker never sit on top of words or pictures.
export const JACKET = {
  h: [["LIVE · clock", 0, 0, 21, 11.5], ["Logo", 89, 0, 11, 19.5], ["Ticker", 0, 92, 100, 8]],
  v: [["Headline · LIVE · clock", 0, 0, 58, 22], ["Logo", 85, 0, 15, 10.5], ["Ticker", 0, 95.5, 100, 4.5]]
};
// The clear area: content starts below the top of the jacket and ends above the ticker.
const TOP = V => V ? 1920 * .23 : 1080 * .13, FOOT = (V, H, u) => (V ? H * .955 : H * .92) - 86 * u;
// The jacket's places drawn over the preview (never into the video).
export function guides(ctx, orient) {
  const V = orient === "v", W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  ctx.save(); ctx.setLineDash([14, 10]); ctx.lineWidth = 3; ctx.font = "700 26px 'Hind Siliguri', sans-serif"; ctx.textBaseline = "top";
  for (const [name, x, y, w, h] of JACKET[V ? "v" : "h"]) {
    const X = x / 100 * W, Y = y / 100 * H, Ww = w / 100 * W, Hh = h / 100 * H;
    ctx.fillStyle = "rgba(0,200,255,.18)"; ctx.fillRect(X, Y, Ww, Hh); ctx.strokeStyle = "rgba(0,220,255,.95)"; ctx.strokeRect(X + 2, Y + 2, Ww - 4, Hh - 4);
    ctx.fillStyle = "#fff"; ctx.fillText(name, X + 12, Y + 10);
  }
  ctx.restore();
}
const BN = "'Hind Siliguri', 'Noto Serif Bengali', sans-serif", SERIF = "'Noto Serif Bengali', 'Hind Siliguri', serif", LAT = "Montserrat, 'Hind Siliguri', sans-serif";
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const pr = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
const eo = x => 1 - Math.pow(1 - x, 3), eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, eb = x => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

// ---------- drawing helpers ----------
function font(ctx, w, px, fam = BN) { ctx.font = `${w} ${Math.round(px)}px ${fam}`; }
function wrap(ctx, text, maxW, maxLines = 3) {
  const words = String(text || "").split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) { const nx = cur ? `${cur} ${w}` : w; if (ctx.measureText(nx).width > maxW && cur) { lines.push(cur); cur = w; } else cur = nx; }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}
// Text that shrinks to fit its box (never cut), at most `lines` lines.
function fitText(ctx, text, maxW, px, lines, w = 800, fam = BN) {
  for (let s = px; s > px * .45; s -= px * .04) { font(ctx, w, s, fam); const L = wrap(ctx, text, maxW, 99); if (L.length <= lines) return { lines: L, px: s }; }
  font(ctx, w, px * .45, fam); return { lines: wrap(ctx, text, maxW, lines), px: px * .45 };
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// A picture or a video, filling its box (cover), drifting slowly (a slow zoom and pan).
function media(ctx, m, x, y, w, h, t, D, { zoom = .1 } = {}) {
  if (!m?.el) return false;
  const el = m.el, iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight;
  if (!iw || !ih) return false;
  const k = pr(t, 0, D), s = Math.max(w / iw, h / ih) * (1 + zoom * k), dw = iw * s, dh = ih * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(el, x + (w - dw) / 2 + (k - .5) * w * .03, y + (h - dh) / 2, dw, dh);
  ctx.restore(); return true;
}
// The background: the style's gradient, the dotted world map drifting, light sweeping across.
function backdrop(ctx, S, W, H, t, map) {
  const g = ctx.createLinearGradient(0, 0, W * .4, H);
  g.addColorStop(0, S.bg[1]); g.addColorStop(.55, S.bg[0]); g.addColorStop(1, S.bg[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (map?.naturalWidth) {
    const s = Math.max(W / map.naturalWidth, H / map.naturalHeight) * 1.15, dw = map.naturalWidth * s, dh = map.naturalHeight * s;
    ctx.save(); ctx.globalAlpha = S === STYLES.paper ? .1 : .16; ctx.drawImage(map, (W - dw) / 2 - (t * 6) % 60, (H - dh) / 2, dw, dh); ctx.restore();
  }
  // fine diagonal lines
  ctx.save(); ctx.globalAlpha = .06; ctx.strokeStyle = S.ink; ctx.lineWidth = 1;
  for (let x = -H + ((t * 24) % 48); x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
  ctx.restore();
  // a slow sweep of light
  const sx = ((t * .18) % 1.6 - .3) * W, lg = ctx.createLinearGradient(sx - W * .2, 0, sx + W * .2, 0);
  lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(.5, S === STYLES.paper ? "rgba(255,255,255,.35)" : "rgba(255,230,170,.07)"); lg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, S === STYLES.paper ? "rgba(80,40,0,.18)" : "rgba(0,0,0,.45)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
// Floating specks of light.
function specks(ctx, S, W, H, t) {
  ctx.save(); ctx.fillStyle = S.hi;
  for (let i = 0; i < 40; i++) {
    const r = (Math.sin(i * 91.7) + 1) / 2, q = (Math.sin(i * 37.3) + 1) / 2;
    const x = (r * W + t * (10 + 20 * q)) % W, y = (q * H - t * (6 + 14 * r) + H * 10) % H;
    ctx.globalAlpha = .12 + .25 * ((Math.sin(t * 2 + i) + 1) / 2) * q; ctx.beginPath(); ctx.arc(x, y, 1.2 + 2.4 * r, 0, 7); ctx.fill();
  }
  ctx.restore();
}
// The full Rashtrix logo (never a crop), with a soft gold edge.
function logo(ctx, img, x, y, h, alpha = 1) {
  if (!img?.naturalWidth) return 0;
  const w = h * img.naturalWidth / img.naturalHeight;
  ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = h * .08; ctx.drawImage(img, x, y, w, h); ctx.restore();
  return w;
}
// A heading with its kicker: the kicker on a red tab, the title in white, words rising in.
function kickerTab(ctx, S, text, x, y, u, t, at) {
  if (!text) return 0;
  font(ctx, 700, 30 * u); const w = ctx.measureText(text).width + 44 * u, p = eo(pr(t, at, at + .5));
  ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = S.acc; rrect(ctx, x, y, w * (0.4 + .6 * p), 52 * u, 6 * u); ctx.fill();
  ctx.fillStyle = S === STYLES.breaking ? S.gold : "#fff"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 22 * u, y + 27 * u); ctx.restore();
  return w;
}
function words(ctx, lines, x, y, lh, t, at, span, color, align = "left") {
  let n = 0; const all = lines.flatMap(l => l.split(" ")).length;
  lines.forEach((ln, li) => {
    let cx = x; const ws = ln.split(" "), tw = ctx.measureText(ln).width;
    if (align === "center") cx = x - tw / 2;
    ws.forEach(w => {
      const a = at + span * n / Math.max(1, all), p = eo(pr(t, a, a + .45));
      ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = color; ctx.fillText(w, cx, y + li * lh + (1 - p) * lh * .4); ctx.restore();
      cx += ctx.measureText(w + " ").width; n++;
    });
  });
}
// The channel strip at the foot: the logo's gold line, the channel's name and the date.
function footer(ctx, S, W, H, u, t, V, label) {
  const h = 70 * u, y = FOOT(V, H, u) + 16 * u, p = eo(pr(t, .3, 1));
  ctx.save(); ctx.globalAlpha = p;
  ctx.fillStyle = S.line; ctx.fillRect(60 * u, y, (W - 120 * u) * p, 3 * u);
  font(ctx, 800, 26 * u, LAT); ctx.fillStyle = S.gold; ctx.textBaseline = "top"; ctx.fillText("RASHTRIX 24×7 NEWS", 60 * u, y + 18 * u);
  if (label) { font(ctx, 600, 28 * u); ctx.fillStyle = S.sub; ctx.textAlign = "right"; ctx.fillText(label, W - 60 * u, y + 14 * u); }
  ctx.restore();
}
const arrow = (ctx, x, y, s, up, col) => { ctx.save(); ctx.fillStyle = col; ctx.beginPath(); if (up) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * .6); ctx.lineTo(x - s, y + s * .6); } else { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y - s * .6); ctx.lineTo(x - s, y - s * .6); } ctx.closePath(); ctx.fill(); ctx.restore(); };
const num = v => { const m = String(v ?? "").replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d)).replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const sign = v => { const s = String(v ?? "").trim(); if (/^[-−▼↓]/.test(s)) return -1; if (/^[+▲↑]/.test(s)) return 1; const n = num(s); return n > 0 ? 1 : n < 0 ? -1 : 0; };
// A weather sign, drawn.
function sky(ctx, kind, x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = "round";
  const sun = (r, ox = 0, oy = 0) => { ctx.save(); ctx.translate(ox, oy); ctx.rotate(t * .4); ctx.strokeStyle = "#ffcc33"; ctx.lineWidth = r * .16; for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(r * 1.25, 0); ctx.lineTo(r * 1.6, 0); ctx.stroke(); } ctx.fillStyle = "#ffcc33"; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore(); };
  const cloud = (r, ox = 0, oy = 0, c = "#e8eef7") => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ox - r * .8, oy + r * .2, r * .6, 0, 7); ctx.arc(ox, oy - r * .15, r * .8, 0, 7); ctx.arc(ox + r * .85, oy + r * .2, r * .55, 0, 7); ctx.rect(ox - r * .8, oy + r * .2, r * 1.65, r * .6); ctx.fill(); };
  if (kind === "sun") sun(s * .5);
  else if (kind === "partly") { sun(s * .38, -s * .25, -s * .2); cloud(s * .45, s * .12, s * .15); }
  else if (kind === "cloud") { cloud(s * .4, -s * .2, -s * .1, "#b9c4d4"); cloud(s * .5, s * .1, s * .12); }
  else if (kind === "fog") { ctx.strokeStyle = "#d9e0ea"; ctx.lineWidth = s * .08; for (let i = 0; i < 4; i++) { const o = Math.sin(t * 1.5 + i) * s * .08; ctx.beginPath(); ctx.moveTo(-s * .5 + o, -s * .3 + i * s * .2); ctx.lineTo(s * .5 + o, -s * .3 + i * s * .2); ctx.stroke(); } }
  else {
    cloud(s * .5, 0, -s * .15, kind === "storm" ? "#9aa6b8" : "#d6deea");
    if (kind === "storm") { ctx.fillStyle = "#ffd23f"; ctx.globalAlpha = .6 + .4 * Math.abs(Math.sin(t * 5)); ctx.beginPath(); ctx.moveTo(0, s * .2); ctx.lineTo(-s * .14, s * .5); ctx.lineTo(s * .02, s * .48); ctx.lineTo(-s * .08, s * .78); ctx.lineTo(s * .16, s * .4); ctx.lineTo(0, s * .42); ctx.closePath(); ctx.fill(); }
    else { ctx.strokeStyle = "#7fb4ff"; ctx.lineWidth = s * .06; for (let i = 0; i < 4; i++) { const k = ((t * 1.6 + i * .25) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); const xx = -s * .3 + i * s * .2; ctx.moveTo(xx, s * .25 + k * s * .4); ctx.lineTo(xx - s * .05, s * .38 + k * s * .4); ctx.stroke(); } }
  }
  ctx.restore();
}

// The in and out of every graphic: a red and gold wipe across the frame.
function wipe(ctx, S, W, H, t, D) {
  const a = pr(t, 0, .55), b = pr(t, D - .7, D);
  const draw = k => { if (k <= 0 || k >= 1) return; const x = (eio(k) * 2 - 1) * W * 1.3; ctx.save(); ctx.translate(x, 0); ctx.transform(1, 0, -.25, 1, 0, 0);
    ctx.fillStyle = S.acc; ctx.fillRect(-W * .05, 0, W * .5, H); ctx.fillStyle = S.gold; ctx.fillRect(W * .45, 0, W * .05, H); ctx.restore(); };
  draw(a); draw(b);
  if (t > D - .35) { ctx.save(); ctx.globalAlpha = pr(t, D - .35, D); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

// ---------- the six kinds ----------
function promo(ctx, s, A, W, H, u, V, t, D) {
  const S = A.S;
  if (!media(ctx, A.media, 0, 0, W, H, t, D, { zoom: .14 })) {
    backdrop(ctx, S, W, H, t, A.map);
    // No picture: the channel's emblem: gold rings turning round the full logo, large.
    const cx = V ? W / 2 : W * .74, cy = V ? H * .38 : H * .5, R = (V ? 260 : 300) * u, p = eo(pr(t, .5, 1.6));
    ctx.save(); ctx.globalAlpha = p; ctx.translate(cx, cy);
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate((i % 2 ? -1 : 1) * t * (.25 + i * .1) + i); ctx.strokeStyle = i % 2 ? S.acc : S.gold; ctx.lineWidth = (6 - i) * u; ctx.globalAlpha = p * (.75 - i * .14);
      ctx.beginPath(); ctx.arc(0, 0, R * (1 - i * .16) * (0.8 + .2 * p), 0, Math.PI * (1.1 + i * .2)); ctx.stroke(); ctx.restore();
    }
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R); glow.addColorStop(0, "rgba(242,193,78,.22)"); glow.addColorStop(1, "rgba(242,193,78,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); ctx.restore();
    const lh2 = R * 1.05; if (A.logo?.naturalWidth) logo(ctx, A.logo, cx - lh2 * A.logo.naturalWidth / A.logo.naturalHeight / 2, cy - lh2 / 2 + (1 - p) * 30 * u, lh2, p);
  }
  // a shade over the picture so the words read
  const g = ctx.createLinearGradient(0, V ? H * .35 : 0, V ? 0 : W * .75, V ? H : H * .4);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, S === STYLES.paper ? "rgba(251,247,239,.92)" : "rgba(10,2,3,.86)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  specks(ctx, S, W, H, t);
  const x = V ? 70 * u : 110 * u, maxW = V ? W - 140 * u : W * .6, top = V ? H * .56 : H * .3;
  kickerTab(ctx, S, s.kicker, x, top, u, t, .6);
  const T = fitText(ctx, s.title, maxW, (V ? 120 : 130) * u, 2, 800, SERIF);
  ctx.textBaseline = "top"; words(ctx, T.lines, x, top + 80 * u, T.px * 1.22, t, .9, .8, S.ink);
  let y = top + 80 * u + T.lines.length * T.px * 1.22 + 20 * u;
  if (s.tagline) { const G = fitText(ctx, s.tagline, maxW, 48 * u, 2, 500); ctx.textBaseline = "top"; words(ctx, G.lines, x, y, G.px * 1.3, t, 1.6, .7, S.sub); y += G.lines.length * G.px * 1.3 + 26 * u; }
  if (s.when) {
    font(ctx, 800, 46 * u); const w = ctx.measureText(s.when).width + 60 * u, p = eb(pr(t, 2.2, 2.9));
    ctx.save(); ctx.globalAlpha = clamp(p); ctx.translate(x, y); ctx.scale(clamp(p, 0, 1.2), 1); ctx.fillStyle = S.gold; rrect(ctx, 0, 0, w, 76 * u, 10 * u); ctx.fill();
    ctx.fillStyle = S === STYLES.gold ? "#1a0405" : "#1a0405"; ctx.textBaseline = "middle"; ctx.fillText(s.when, 30 * u, 40 * u); ctx.restore(); y += 100 * u;
  }
  if (s.host) { font(ctx, 600, 36 * u); ctx.save(); ctx.globalAlpha = eo(pr(t, 2.8, 3.4)); ctx.fillStyle = S.sub; ctx.textBaseline = "top"; ctx.fillText(s.host, x, y); ctx.restore(); }
}

function info(ctx, s, A, W, H, u, V, t, D) {
  const S = A.S; backdrop(ctx, S, W, H, t, A.map); specks(ctx, S, W, H, t);
  const pad = V ? 70 * u : 100 * u, hasPic = !!A.media?.el;
  kickerTab(ctx, S, s.kicker, pad, TOP(V), u, t, .5);
  const tw = V ? W - pad * 2 : (hasPic ? W * .56 : W - pad * 2 - 160 * u);
  const T = fitText(ctx, s.title, tw, (V ? 82 : 72) * u, 3, 800, SERIF); ctx.textBaseline = "top";
  const ty = TOP(V) + 72 * u; words(ctx, T.lines, pad, ty, T.px * 1.24, t, .8, .7, S.ink);
  let y = ty + T.lines.length * T.px * 1.24 + 36 * u;
  // the picture: a framed panel (right, or under the title when vertical)
  if (hasPic) {
    const pw = V ? W - pad * 2 : W * .3, ph = V ? 480 * u : FOOT(V, H, u) - 20 * u - Math.max(250 * u, y), px = V ? pad : W - pad - pw, py = V ? y : Math.max(250 * u, y), p = eo(pr(t, 1, 1.8));
    ctx.save(); ctx.globalAlpha = p; ctx.translate(0, (1 - p) * 40 * u); rrect(ctx, px, py, pw, ph, 14 * u); ctx.clip(); media(ctx, A.media, px, py, pw, ph, t, D); ctx.restore();
    ctx.save(); ctx.globalAlpha = p; ctx.strokeStyle = S.gold; ctx.lineWidth = 4 * u; rrect(ctx, px, py, pw, ph, 14 * u); ctx.stroke(); ctx.restore();
    if (V) y += ph + 40 * u;
  }
  // the figures: bars that grow, the numbers counting up
  const rows = (s.rows || []).filter(r => r.label || r.value).slice(0, 6), max = Math.max(1, ...rows.map(r => Math.abs(num(r.value)) || 0));
  const area = FOOT(V, H, u) - 20 * u - y, rh = Math.min(120 * u, area / Math.max(1, rows.length)), bw = (V ? W - pad * 2 : (hasPic ? W * .56 : W - pad * 2)) ;
  rows.forEach((r, i) => {
    const at = 1.4 + i * .35, p = eo(pr(t, at, at + .9)), yy = y + i * rh, n = num(r.value);
    font(ctx, 700, Math.min(36 * u, rh * .34)); ctx.fillStyle = S.sub; ctx.textBaseline = "top"; ctx.globalAlpha = eo(pr(t, at - .2, at + .3)); ctx.fillText(r.label || "", pad, yy); ctx.globalAlpha = 1;
    const BF = V ? .6 : .78, by = yy + rh * .38, bh = rh * .38, full = bw * BF * (isNaN(n) ? 1 : Math.abs(n) / max);
    ctx.fillStyle = S.card; rrect(ctx, pad, by, bw * BF, bh, bh / 2); ctx.fill();
    const g = ctx.createLinearGradient(pad, 0, pad + full, 0); g.addColorStop(0, S.acc); g.addColorStop(1, S.gold);
    ctx.fillStyle = g; rrect(ctx, pad, by, Math.max(bh, full * p), bh, bh / 2); ctx.fill();
    const shown = isNaN(n) ? r.value : String(r.value).replace(/-?[\d০-৯,]+(\.[\d০-৯]+)?/, m => { const v = n * p; const dec = (String(m).split(".")[1] || "").length; const out = v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec }); return /[০-৯]/.test(m) ? out.replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]) : out; });
    font(ctx, 800, Math.min(44 * u, rh * .4), LAT); ctx.fillStyle = S.hi; ctx.textBaseline = "middle"; ctx.globalAlpha = eo(pr(t, at, at + .4));
    ctx.fillText(`${shown}${r.unit ? " " + r.unit : ""}`, pad + bw * BF + 22 * u, by + bh / 2); ctx.globalAlpha = 1;
  });
  footer(ctx, S, W, H, u, t, V, s.note);
}

function board(ctx, s, A, W, H, u, V, t, D, kind) {
  const S = A.S; backdrop(ctx, S, W, H, t, A.map); specks(ctx, S, W, H, t);
  const pad = V ? 60 * u : 100 * u;
  kickerTab(ctx, S, s.kicker || (kind === "market" ? "বাজার" : kind === "weather" ? "আবহাওয়া" : "বাজারদর"), pad, TOP(V), u, t, .5);
  const T = fitText(ctx, s.title, V ? W - pad * 2 : W - pad * 2 - 200 * u, (V ? 84 : 70) * u, 2, 800, SERIF); ctx.textBaseline = "top";
  const ty = TOP(V) + 70 * u; words(ctx, T.lines, pad, ty, T.px * 1.2, t, .8, .6, S.ink);
  let y = ty + T.lines.length * T.px * 1.2 + (s.date ? 0 : 30 * u);
  if (s.date) { font(ctx, 600, 34 * u); ctx.fillStyle = S.gold; ctx.globalAlpha = eo(pr(t, 1.2, 1.7)); ctx.fillText(s.date, pad, y + 6 * u); ctx.globalAlpha = 1; y += 70 * u; }
  const rows = (s.rows || []).filter(r => Object.values(r).some(Boolean)).slice(0, kind === "commodity" ? 10 : 8);
  const bottom = FOOT(V, H, u) - 16 * u, rh = Math.min(V ? 200 * u : 128 * u, (bottom - y) / Math.max(1, rows.length)), gap = rh * .12, w = W - pad * 2;
  // weather in two columns when horizontal and many
  const cols = kind === "weather" && !V && rows.length > 4 ? 2 : 1, cw = (w - (cols - 1) * 30 * u) / cols, perCol = Math.ceil(rows.length / cols), rH = cols > 1 ? Math.min(150 * u, (bottom - y) / perCol) : rh;
  rows.forEach((r, i) => {
    const c = cols > 1 ? Math.floor(i / perCol) : 0, k = cols > 1 ? i % perCol : i, x = pad + c * (cw + 30 * u), yy = y + k * rH, h = rH - gap;
    const at = 1.3 + i * .22, p = eo(pr(t, at, at + .6));
    ctx.save(); ctx.globalAlpha = p; ctx.translate((1 - p) * -60 * u, 0);
    ctx.fillStyle = S.card; rrect(ctx, x, yy, cw, h, 10 * u); ctx.fill();
    ctx.fillStyle = i % 2 ? S.gold : S.acc; ctx.fillRect(x, yy, 8 * u, h);
    const mid = yy + h / 2, fs = Math.min(V ? 62 * u : 54 * u, h * .46); ctx.textBaseline = "middle";
    if (kind === "weather") {
      const ix = x + 30 * u + h * .42, tx2 = ix + h * .5 + 24 * u; sky(ctx, r.sky || "sun", ix, mid, h * .62, t + i);
      font(ctx, 700, fs); ctx.fillStyle = S.ink; ctx.fillText(r.city || "", tx2, mid - (r.note ? fs * .32 : 0));
      if (r.note) { font(ctx, 500, fs * .55); ctx.fillStyle = S.sub; ctx.fillText(r.note, tx2, mid + fs * .5); }
      font(ctx, 800, fs * 1.05, LAT); ctx.textAlign = "right";
      ctx.fillStyle = S.hi; ctx.fillText(r.max ? `${r.max}°` : "", x + cw - (r.min ? 150 * u : 30 * u), mid);
      if (r.min) { ctx.fillStyle = S.sub; font(ctx, 700, fs * .8, LAT); ctx.fillText(`${r.min}°`, x + cw - 30 * u, mid); }
      ctx.textAlign = "left";
    } else {
      const name = kind === "market" ? r.name : r.item, val = kind === "market" ? r.value : r.price, ch = r.change, sg = sign(ch);
      font(ctx, 700, fs); ctx.fillStyle = S.ink; ctx.fillText(name || "", x + 34 * u, mid - (r.unit ? fs * .28 : 0));
      if (r.unit) { font(ctx, 500, fs * .55); ctx.fillStyle = S.sub; ctx.fillText(r.unit, x + 34 * u, mid + fs * .5); }
      ctx.textAlign = "right"; font(ctx, 800, fs * 1.02, LAT); ctx.fillStyle = S.ink;
      const chW = ch ? (V ? 230 : 260) * u : 0; ctx.fillText(val || "", x + cw - 34 * u - chW, mid);
      if (ch) {
        const col = sg > 0 ? "#22c55e" : sg < 0 ? "#ff4d4d" : S.sub; const cht = String(ch).replace(/^[▲▼↑↓]\s*/, ""); let cf = fs * .8; font(ctx, 800, cf, LAT); while (ctx.measureText(cht).width > chW - fs * .9 && cf > fs * .4) { cf *= .92; font(ctx, 800, cf, LAT); } ctx.fillStyle = col; ctx.fillText(cht, x + cw - 34 * u, mid);
        if (sg) arrow(ctx, x + cw - 34 * u - chW + fs * .42, mid, fs * .28, sg > 0, col);
      }
      ctx.textAlign = "left";
    }
    ctx.restore();
  });
  footer(ctx, S, W, H, u, t, V, s.note);
}

function tile(ctx, s, A, W, H, u, V, t, D) {
  const S = A.S; backdrop(ctx, S, W, H, t, A.map); specks(ctx, S, W, H, t);
  const hasPic = !!A.media?.el, pad = V ? 60 * u : 90 * u;
  // the picture tile: in from the side (horizontal) or the top (vertical), framed in gold
  const pw = V ? W - pad * 2 : W * .46, py = TOP(V), ph = V ? H * .3 : FOOT(V, H, u) - 24 * u - py, px = pad;
  if (hasPic) {
    const p = eo(pr(t, .5, 1.3));
    ctx.save(); ctx.translate(V ? 0 : (1 - p) * -W * .3, V ? (1 - p) * -H * .2 : 0); ctx.globalAlpha = p;
    rrect(ctx, px, py, pw, ph, 18 * u); ctx.save(); ctx.clip(); media(ctx, A.media, px, py, pw, ph, t, D, { zoom: .12 }); ctx.restore();
    ctx.strokeStyle = S.gold; ctx.lineWidth = 5 * u; ctx.stroke(); ctx.restore();
  }
  const tx = hasPic && !V ? pad + pw + 70 * u : pad, tw = hasPic && !V ? W - tx - pad : W - pad * 2;
  let y = hasPic ? (V ? py + ph + 60 * u : TOP(V) + 30 * u) : (V ? H * .3 : H * .26);
  kickerTab(ctx, S, s.kicker, tx, y, u, t, .9); y += 82 * u;
  const T = fitText(ctx, s.title, tw, (V ? 92 : 84) * u, 3, 800, SERIF); ctx.textBaseline = "top";
  words(ctx, T.lines, tx, y, T.px * 1.24, t, 1.1, .8, S.ink); y += T.lines.length * T.px * 1.24 + 24 * u;
  ctx.save(); ctx.fillStyle = S.gold; ctx.fillRect(tx, y, 160 * u * eo(pr(t, 1.8, 2.4)), 5 * u); ctx.restore(); y += 34 * u;
  if (s.text) { const B = fitText(ctx, s.text, tw, 44 * u, V ? 6 : 5, 500); ctx.textBaseline = "top"; words(ctx, B.lines, tx, y, B.px * 1.42, t, 2, 1.2, S.sub); y += B.lines.length * B.px * 1.42 + 20 * u; }
  if (s.byline) { font(ctx, 700, 36 * u); ctx.save(); ctx.globalAlpha = eo(pr(t, 3, 3.5)); ctx.fillStyle = S.hi; ctx.textBaseline = "top"; ctx.fillText(`— ${s.byline}`, tx, y); ctx.restore(); }
  footer(ctx, S, W, H, u, t, V, s.note);
}

// A frame of the graphic at time t. spec: { kind, orient: "h"|"v", style, dur, ...fields }.
// assets: { logo: <img>, map: <img>, media: { el } }.
export function draw(ctx, spec, assets, t) {
  const V = spec.orient === "v", W = V ? 1080 : 1920, H = V ? 1920 : 1080, u = V ? 1 : 1, D = Math.max(3, spec.dur || 10);
  const A = { ...assets, S: STYLES[spec.style] || STYLES.red };
  ctx.save(); ctx.clearRect(0, 0, W, H); ctx.textAlign = "left"; ctx.textBaseline = "top";
  if (spec.kind === "promo") promo(ctx, spec, A, W, H, u, V, t, D);
  else if (spec.kind === "info") info(ctx, spec, A, W, H, u, V, t, D);
  else if (spec.kind === "tile") tile(ctx, spec, A, W, H, u, V, t, D);
  else board(ctx, spec, A, W, H, u, V, t, D, spec.kind);
  wipe(ctx, A.S, W, H, t, D);
  ctx.restore();
}
export const sizeOf = orient => orient === "v" ? [1080, 1920] : [1920, 1080];

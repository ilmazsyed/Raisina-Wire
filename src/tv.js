// Raisina TV: the desk's explainers playing one after another, newest first, around the clock.
// One player for the whole app: it sits on the TV page and follows the reader as a floating
// mini-player when they move on. Broadcast look: an animated Raisina Wire logo, LIVE badge and
// India time, a lower third, and a ticker of live updates, stories and the wire (led by a red
// BREAKING band when the desk turns one on).
// Between explainers: a 5–7 second transition (four styles in rotation), and every few videos the
// full package: a stinger, a 15-second Raisina Wire promo montage and a News Update (full-screen
// headline sets by topic, 7 seconds each). Music comes from src/tvaudio.js. The control room can
// break in (a BREAKING NEWS sting with its own music, then a chosen video), cut to a livestream or
// video link at once, and set everything else (src/channel.js).
import { markDome } from "./brand.js";
import { tr, lang, LOCALE, withLang } from "./i18n.js";
import * as music from "./tvaudio.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const IST = { timeZone: "Asia/Kolkata" };
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const icon = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  muted: icon('<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>'),
  sound: icon('<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  full: icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  cast: icon('<path d="M3 17a4 4 0 0 1 4 4M3 13a8 8 0 0 1 8 8M3 9a12 12 0 0 1 12 12"/><path d="M7 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2"/>'),
  share: icon('<path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
  expand: icon('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  play: icon('<path d="M7 5v14l11-7z" fill="currentColor"/>'),
  pause: icon('<path d="M8 5v14M16 5v14" stroke-width="3"/>')
};
const DOME = (cls = "sq-dome") => markDome(cls, 3.4);
const TRI = `<span class="sq-tri"><i></i><i></i><i></i></span>`;
const clockNow = () => new Date().toLocaleTimeString(LOCALE, { ...IST, hour: "2-digit", minute: "2-digit", hour12: false });

let deps = {};           // beacon, share, navigate: supplied by main.js
let feed = null, root = null, video = null;
let idx = 0, mode = "idle", engaged = false, sinceAd = 0, adQueue = [], adIdx = ls.get("rw-tv-ad", 0);
let lastTick = 0, unsent = 0, pollTimer = 0, clockTimer = 0, wasPaused = false, startedAt = 0;
let seqToken = 0, paused = false, sinceFull = 0, setCursor = 0, shortCursor = 0, stingCursor = 0, lastBulletin = -1, inputOn = null;
// Tests only (localStorage rw-tv-debug): make the next switch an ad break, poll at once, inspect.
if (ls.get("rw-tv-debug", false)) window.__tv = { adNow: () => { sinceAd = 1e9; }, fullNext: () => { sinceFull = 99; }, poll: () => load(), state: () => ({ mode, idx, paused, src: video?.currentSrc, seq: root?.querySelector(".tv-seq")?.dataset.kind || "", input: inputOn?.id || null }) };

export function initTV(d) { deps = d; }
export const tvFeed = () => feed;
export const tvNow = () => (feed && mode !== "ad" ? feed.playlist[idx] : null);

async function load() {
  try {
    const r = await fetch(`/api/tv${lang !== "en" ? `?lang=${lang}` : ""}`, { cache: "no-store" });
    if (!r.ok) throw new Error();
    const next = await r.json(), current = feed?.playlist[idx];
    feed = next;
    // New explainers join without interrupting the one on air.
    if (current) { const k = feed.playlist.findIndex(v => v.id === current.id); if (k >= 0) idx = k; }
    renderTicker();
    if (root && mode !== "idle") { syncInput(); checkForce(); }
    document.dispatchEvent(new CustomEvent("tvchange"));
  } catch { /* keep what we have */ }
  return feed;
}
export const loadTV = () => feed ? Promise.resolve(feed) : load();

/* ---------- Building the player ---------- */
function build() {
  if (root) return root;
  root = document.createElement("div");
  root.className = "tv"; root.id = "tvPlayer";
  root.innerHTML = `<div class="tv-screen">
      <video class="tv-video" playsinline muted preload="auto" x-webkit-airplay="allow"></video>
      <div class="tv-input" hidden></div>
      <div class="tv-seq" hidden aria-live="polite"></div>
      <div class="tv-top"><span class="tv-logo" aria-label="Raisina Wire TV">${markDome("tv-dome", 4)}<span class="tv-word">RAISINA<b> WIRE</b></span><span class="tv-tri"><i></i><i></i><i></i></span></span>
        <span class="tv-grow"></span><span class="tv-live"><span class="pulse"></span>LIVE</span><span class="tv-clock" aria-hidden="true"></span></div>
      <div class="tv-lower" hidden><span class="tv-cat"></span><b class="tv-title"></b></div>
      <div class="tv-ad" hidden><span class="tv-ad-k">${esc(tr("Advertisement"))}</span><span class="tv-ad-n"></span><button type="button" class="tv-ad-skip" hidden>${esc(tr("Skip ad"))} ›</button></div>
      <div class="tv-paused" aria-hidden="true">${ICONS.pause}</div>
      <button type="button" class="tv-sound">${ICONS.muted}<span>${esc(tr("Tap for sound"))}</span></button>
      <div class="tv-ctrls">
        <button type="button" data-tv="pause" aria-label="${esc(tr("Pause"))}">${ICONS.pause}</button>
        <button type="button" data-tv="mute" aria-label="${esc(tr("Sound"))}">${ICONS.muted}</button>
        <button type="button" data-tv="cast" aria-label="${esc(tr("Play on TV"))}" hidden>${ICONS.cast}</button>
        <button type="button" data-tv="share" aria-label="${esc(tr("Share"))}">${ICONS.share}</button>
        <button type="button" data-tv="full" aria-label="${esc(tr("Full screen"))}">${ICONS.full}</button>
      </div>
      <div class="tv-mini-ctrls"><button type="button" data-tv="open" aria-label="${esc(tr("Open Raisina TV"))}">${ICONS.expand}</button><button type="button" data-tv="close" aria-label="${esc(tr("Close"))}">${ICONS.close}</button></div>
      <div class="tv-off" hidden><b>${esc(tr("Raisina TV is off air"))}</b><span>${esc(tr("Back soon."))}</span></div>
    </div>
    <div class="tv-ticker" aria-label="${esc(tr("Latest headlines"))}"><span class="tv-tk-break" hidden></span><div class="tv-tk-run"><div class="tv-tk-track"></div></div></div>`;
  video = root.querySelector("video");
  video.addEventListener("ended", onEnded);
  video.addEventListener("error", () => { if (mode === "ad") nextAd(); else if (mode === "story") setTimeout(() => advance(), 600); });
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("playing", () => root.classList.add("is-playing"));
  video.addEventListener("pause", () => root.classList.remove("is-playing"));
  root.addEventListener("click", onClick);
  // Cast: Chrome's remote playback (Chromecast) or Safari's AirPlay picker.
  const cast = root.querySelector('[data-tv="cast"]');
  if (video.remote?.watchAvailability) video.remote.watchAvailability(a => { cast.hidden = !a; }).catch(() => { cast.hidden = true; });
  else if (window.WebKitPlaybackTargetAvailabilityEvent) video.addEventListener("webkitplaybacktargetavailabilitychanged", e => { cast.hidden = e.availability !== "available"; });
  // In the background TV pauses (and saves data); it picks up where it was when it comes back.
  document.addEventListener("visibilitychange", () => {
    if (!video || mode === "idle") return;
    if (document.hidden) { wasPaused = paused; if (!paused) setPaused(true); flushWatch(); }
    else { if (!wasPaused) setPaused(false); load(); }
  });
  addEventListener("pagehide", flushWatch);
  return root;
}

function onClick(e) {
  const b = e.target.closest("[data-tv], .tv-sound, .tv-ad-skip, .tv-tk-item");
  if (!b) {
    if (!e.target.closest(".tv-screen")) return;
    if (root.classList.contains("mini")) return deps.navigate?.("/tv");
    if (!e.target.closest("iframe")) togglePause(); // tap the picture to pause or play
    return;
  }
  if (b.classList.contains("tv-tk-item")) { if (b.dataset.href) { e.preventDefault(); deps.navigate?.(b.dataset.href); } return; }
  if (b.classList.contains("tv-sound")) return unmute();
  if (b.classList.contains("tv-ad-skip")) return nextAd();
  const k = b.dataset.tv;
  if (k === "pause") togglePause();
  if (k === "mute") { if (video.muted) unmute(); else { video.muted = true; inputMute(true); syncSound(); } }
  if (k === "full") { const s = root.querySelector(".tv-screen"); (s.requestFullscreen ? s.requestFullscreen() : video.webkitEnterFullscreen?.())?.catch?.(() => {}); }
  if (k === "cast") { if (video.remote?.prompt) video.remote.prompt().catch(() => {}); else video.webkitShowPlaybackTargetPicker?.(); }
  if (k === "share") deps.share?.(tr("Raisina TV — live"), `${location.origin}${withLang("/tv")}`);
  if (k === "open") deps.navigate?.("/tv");
  if (k === "close") stopTV();
}
function unmute() {
  engaged = true; video.muted = false; music.audio(); music.resume();
  if (mode === "story" && !paused) video.play().catch(() => {});
  inputMute(false); syncSound();
}
function syncSound() {
  root.querySelector(".tv-sound").hidden = !video.muted;
  root.querySelector('[data-tv="mute"]').innerHTML = video.muted ? ICONS.muted : ICONS.sound;
}
const soundOn = () => engaged && video && !video.muted && feed?.seq?.music !== false;

/* ---------- Pause ---------- */
function togglePause() { setPaused(!paused); }
function setPaused(p) {
  if (p && mode === "ad" && !feed?.skippable) return; // non-skippable ads play through
  paused = p;
  root.classList.toggle("paused", p);
  const btn = root.querySelector('[data-tv="pause"]');
  btn.innerHTML = p ? ICONS.play : ICONS.pause; btn.setAttribute("aria-label", tr(p ? "Play" : "Pause"));
  if (p) { video.pause(); inputPause(true); music.suspend(); music.pauseTracks(); }
  else { if (["story", "ad"].includes(mode)) video.play().catch(() => {}); inputPause(false); music.resume(); music.resumeTracks(); }
}
// A timer that stops while paused and ends early if a newer sequence takes over.
function wait(ms, tok) {
  return new Promise(res => {
    let left = ms, last = performance.now();
    const step = () => {
      if (tok !== seqToken) return res(false);
      const now = performance.now(); if (!paused) left -= now - last; last = now;
      if (left <= 0) res(true); else setTimeout(step, 60);
    };
    step();
  });
}

/* ---------- Ticker, clock, lower third ---------- */
function renderTicker() {
  if (!root || !feed) return;
  const br = root.querySelector(".tv-tk-break"), track = root.querySelector(".tv-tk-track");
  br.hidden = !feed.breaking.length;
  br.textContent = tr("BREAKING");
  const label = { live: tr("LIVE"), story: "RAISINA WIRE", wire: "" };
  const items = [
    ...feed.breaking.map(t => `<span class="tv-tk-item brk">${esc(t)}</span>`),
    ...feed.ticker.map(t => `<span class="tv-tk-item ${t.kind}"${t.href ? ` data-href="${esc(t.href)}"` : ""}>${t.kind === "wire" ? `<em>${esc(t.source || "")}</em>` : `<em>${esc(label[t.kind])}</em>`}${esc(t.text)}</span>`)
  ].join(`<span class="tv-tk-sep" aria-hidden="true">●</span>`);
  if (track.dataset.sig === items) return;
  track.dataset.sig = items;
  track.innerHTML = `<span class="tv-tk-loop">${items}<span class="tv-tk-sep">●</span></span><span class="tv-tk-loop" aria-hidden="true">${items}<span class="tv-tk-sep">●</span></span>`;
  requestAnimationFrame(() => { const w = track.firstElementChild?.scrollWidth || 1000; track.style.setProperty("--tk-dur", `${Math.max(30, w / 70)}s`); });
}
function renderClock() { const c = root?.querySelector(".tv-clock"); if (c) c.textContent = `${clockNow()} IST`; }
function lowerThird(cat, title, { live = false, stay = false } = {}) {
  const l = root.querySelector(".tv-lower");
  l.classList.toggle("live", live);
  l.querySelector(".tv-cat").textContent = cat;
  l.querySelector(".tv-title").textContent = title;
  l.hidden = false; l.classList.remove("out"); void l.offsetWidth; l.classList.add("in");
  clearTimeout(lowerThird.t); if (!stay) lowerThird.t = setTimeout(() => l.classList.add("out"), 9000);
}
function mediaSession(title, art) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Raisina TV · LIVE", album: "Raisina Wire", artwork: [{ src: art || "/icon-512.png", sizes: "512x512" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] });
    navigator.mediaSession.setActionHandler?.("play", () => setPaused(false));
    navigator.mediaSession.setActionHandler?.("pause", () => setPaused(true));
    navigator.mediaSession.setActionHandler?.("nexttrack", () => { if (mode === "story") advance(); });
  } catch { /* older browsers */ }
}

/* ---------- Stories and ads ---------- */
function playStory(i) {
  if (!feed?.playlist.length) return offAir(true);
  idx = ((i % feed.playlist.length) + feed.playlist.length) % feed.playlist.length;
  const v = feed.playlist[idx];
  mode = "story";
  hideSeq();
  root.querySelector(".tv-ad").hidden = true;
  root.querySelector(".tv-lower").hidden = true;
  video.src = v.src; video.poster = v.thumb || "";
  video.addEventListener("playing", () => lowerThird(v.category || tr("Explainer"), v.title), { once: true });
  if (!paused) video.play().catch(() => {});
  mediaSession(v.title, v.thumb);
  deps.beacon?.({ t: "play", id: v.id, src: "tv" });
  document.dispatchEvent(new CustomEvent("tvchange"));
}
function onEnded() { if (mode === "ad") nextAd(); else if (mode === "story") advance(); }
// Between explainers: the short transition, or the full package every few videos (or the
// top-of-the-hour bulletin), then an ad break if one is due, then the next explainer.
async function advance() {
  if (!feed?.playlist.length || !["story"].includes(mode)) return;
  const tok = ++seqToken, s = feed.seq || {}, next = feed.playlist[(idx + 1) % feed.playlist.length];
  mode = "seq"; video.pause(); root.querySelector(".tv-lower").hidden = true;
  preload(next);
  sinceFull++;
  const bulletin = s.hourly && bulletinDue();
  const full = bulletin || (sinceFull >= (s.fullEvery || 2) && (s.stinger || s.promo || s.news));
  if (full) {
    sinceFull = 0;
    if (s.stinger !== false) await stinger(tok);
    if (bulletin) await countdown(tok);
    else if (s.promo !== false) await promo(tok);
    if (s.news !== false) await newsUpdate(tok, bulletin);
  } else await shortTransition(tok, next);
  if (tok !== seqToken) return;
  if (feed.ads.length && sinceAd >= feed.every * 60) return startBreak();
  playStory(idx + 1);
}
function preload(v) { if (!v) return; const p = document.createElement("link"); p.rel = "preload"; p.as = "video"; p.href = v.src; document.head.append(p); setTimeout(() => p.remove(), 60e3); }
function startBreak() {
  sinceAd = 0; hideSeq();
  adQueue = Array.from({ length: Math.min(feed.perBreak, 4) }, (_, k) => feed.ads[(adIdx + k) % feed.ads.length]);
  adIdx = (adIdx + adQueue.length) % Math.max(feed.ads.length, 1); ls.set("rw-tv-ad", adIdx);
  mode = "ad"; nextAd(true);
}
function nextAd(first = false) {
  const ad = first ? adQueue[0] : (adQueue.shift(), adQueue[0]);
  if (!first && mode === "ad" && root.dataset.adId) deps.beacon?.({ t: "ad", id: root.dataset.adId, done: video.ended });
  if (!ad) { root.querySelector(".tv-ad").hidden = true; delete root.dataset.adId; mode = "story"; return playStory(idx + 1); }
  root.dataset.adId = ad.id;
  root.querySelector(".tv-lower").hidden = true;
  const box = root.querySelector(".tv-ad"), skip = box.querySelector(".tv-ad-skip");
  box.hidden = false; skip.hidden = true;
  if (paused && !feed.skippable) setPaused(false);
  video.src = ad.src; video.poster = ""; video.play().catch(() => {});
  deps.beacon?.({ t: "ad", id: ad.id, done: false });
  clearTimeout(nextAd.skipT);
  if (feed.skippable) nextAd.skipT = setTimeout(() => { if (root.dataset.adId === ad.id) skip.hidden = false; }, 5000);
}
function onTime() {
  const now = video.currentTime;
  if (mode === "story" && !video.paused) {
    const d = now - lastTick;
    if (d > 0 && d < 2) { sinceAd += d; unsent += d; }
    if (unsent >= 60) flushWatch();
  }
  lastTick = now;
  if (mode === "ad") {
    const left = Math.max(0, Math.ceil((video.duration || 0) - now));
    root.querySelector(".tv-ad-n").textContent = video.duration ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "";
  }
}
function flushWatch() {
  if (unsent < 1) return;
  const today = new Date().toISOString().slice(0, 10), first = ls.get("rw-tv-day", "") !== today;
  if (first) ls.set("rw-tv-day", today);
  deps.beacon?.({ t: "tv", s: Math.round(unsent), first });
  unsent = 0;
}
function offAir(off) {
  root.querySelector(".tv-off").hidden = !off;
  if (off) { video.pause(); mode = "idle"; }
}

/* ---------- Music for a segment: one track for its stinger and bed, never the last one ---------- */
function score({ sting = false, bed = 0, breaking = false } = {}) {
  if (!soundOn()) return () => {};
  if (breaking) return music.breaking(bed || 4.5);
  const s = feed.seq || {}, themes = Object.keys(music.THEMES).filter(k => s.themes?.[k] !== false);
  const pool = [...themes.map(k => ({ key: k })), ...(feed.music || []).map(m => ({ key: `m:${m.id}`, src: m.src }))];
  const pick = music.nextTrack(pool.length ? pool : [{ key: "pulse" }]);
  if (pick.src) return music.track(pick.src, (sting ? 2 : 0) + bed);
  const stops = [];
  if (sting) stops.push(music.sting(pick.key));
  if (bed) { const t = setTimeout(() => stops.push(music.bed(pick.key, bed)), sting ? 1700 : 0); stops.push(() => clearTimeout(t)); }
  return f => stops.forEach(x => x(f));
}

/* ---------- Sequences ---------- */
const seqEl = () => root.querySelector(".tv-seq");
function showSeq(kind, html) {
  const el = seqEl(); el.dataset.kind = kind; el.className = `tv-seq sq-${kind}`; el.innerHTML = html; el.hidden = false;
  void el.offsetWidth; el.classList.add("on");
  return el;
}
function hideSeq() { const el = seqEl(); if (!el) return; el.hidden = true; el.innerHTML = ""; el.dataset.kind = ""; }
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// Full-screen pictures: the 960 px WebP copy first (tools/thumbs.py), the original underneath.
// Background image (the small WebP first where there is one); extra CSS goes in the same style attribute.
const bg = (u, css = "") => { const q = x => `url('${esc(String(x).replace(/'/g, "%27"))}')`; const md = u && /^\/videos\/[\w.-]+\.jpg$/.test(u) ? u.replace(/\.jpg$/, "-md.webp") : ""; const img = u ? `background-image:${md ? `${q(md)},` : ""}${q(u)};` : ""; return img || css ? ` style="${img}${css}"` : ""; };

// Stinger (about 2 s), three looks in rotation.
async function stinger(tok) {
  const v = ["dome", "tricolour", "shutter"][stingCursor++ % 3];
  const stop = score({ sting: true });
  showSeq(`sting-${v}`, `<span class="sq-panels"><i></i><i></i><i></i></span>${TRI}<span class="sq-mark">${DOME()}<b>RAISINA <em>WIRE</em></b><small>TV</small></span><span class="sq-flash"></span>`);
  await wait(2100, tok); stop(0.5);
}
// The Raisina Wire promo: 15 s of story pictures, slow zooms and quick cuts on the beat, with
// tagline cards and an end card.
async function promo(tok) {
  const pics = shuffle(feed.promo || []).slice(0, 8);
  const stop = score({ bed: 15 });
  showSeq("promo", `${pics.map((p, i) => `<span class="pm-slide"${bg(p, `--d:${(i * 1.75).toFixed(2)}s`)}></span>`).join("")}
    <span class="pm-shade"></span>
    <span class="pm-card" style="--d:.4s"><b>${esc(tr("India’s strategic briefing"))}</b></span>
    <span class="pm-card" style="--d:5s"><b>English · हिन्दी · বাংলা</b></span>
    <span class="pm-card" style="--d:9.4s"><b>${esc(tr("Live · Explainers · Markets · Analysis"))}</b></span>
    <span class="pm-end" style="--d:12.6s">${DOME("pm-dome")}<b>RAISINA <em>WIRE</em></b><span>raisinawire.calibrex.org</span>${TRI}</span>`);
  await wait(15000, tok); stop(0.8);
}
// Top of the hour: a 5-second countdown into the bulletin.
async function countdown(tok) {
  const stop = score({ sting: true });
  showSeq("count", `<span class="cd-k">${esc(tr("Raisina TV"))} · ${esc(hourLabel())}</span><b class="cd-n">5</b>`);
  for (let n = 5; n >= 1; n--) { const b = seqEl().querySelector(".cd-n"); if (b) { b.textContent = n; b.classList.remove("tick"); void b.offsetWidth; b.classList.add("tick"); } if (!await wait(1000, tok)) break; }
  stop(0.4);
}
function bulletinDue() {
  const d = new Date(Date.now() + 5.5 * 3600e3), h = d.getUTCHours(), m = d.getUTCMinutes();
  if (h !== lastBulletin && m < 20) { lastBulletin = h; return true; }
  return false;
}
const hourLabel = () => { const h = new Date(Date.now() + 5.5 * 3600e3).getUTCHours(); return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };
// News Update: a title card, then 3–5 full-screen sets of five headlines, one topic each.
function pickSets() {
  const s = feed.seq || {}, want = s.sets || 3, out = [];
  if (feed.pinset) out.push({ topic: feed.pinset.title || tr("Latest"), items: feed.pinset.items.map(t => ({ text: t })), pin: true });
  const live = feed.sets.find(x => x.live); if (live && out.length < want) out.push(live);
  const topics = feed.sets.filter(x => !x.live);
  if (feed.markets?.length >= 4 && out.length < want && setCursor % 2 === 0) out.push({ topic: "Markets", markets: feed.markets });
  for (let k = 0; out.length < want && k < topics.length; k++) out.push(topics[(setCursor + k) % topics.length]);
  setCursor++;
  // Not enough topics yet: the ticker's latest headlines, five at a time.
  for (let k = 0; out.length < want && k * 5 < feed.ticker.length; k++) out.push({ topic: "Latest", items: feed.ticker.slice(k * 5, k * 5 + 5).map(t => ({ text: t.text, source: t.source })) });
  return out.slice(0, want);
}
async function newsUpdate(tok, bulletin) {
  const sets = pickSets(), per = (feed.seq?.setSeconds || 7) * 1000;
  if (!sets.length) return;
  const stop = score({ sting: true, bed: 2.2 + sets.length * per / 1000 });
  showSeq("nu", `<span class="nu-title">${DOME("nu-dome")}<b>${bulletin ? esc(tr("BULLETIN")) : esc(tr("NEWS UPDATE"))}</b><span>${bulletin ? `${esc(hourLabel())} · ` : ""}${esc(clockNow())} IST</span></span>`);
  if (!await wait(2200, tok)) return stop(0.3);
  for (let i = 0; i < sets.length; i++) {
    const st = sets[i];
    showSeq("nu", `<span class="nu-head"><span class="nu-topic${st.live ? " live" : ""}">${st.live ? `<span class="pulse"></span>` : ""}${esc(tr(st.topic))}</span><span class="nu-n">${i + 1} / ${sets.length}</span></span>
      ${st.markets ? `<span class="nu-mkts">${st.markets.map((q, k) => `<span class="nu-mkt" style="--i:${k}"><small>${esc(tr(q.label))}</small><b>${Number(q.value).toLocaleString(LOCALE, { maximumFractionDigits: q.value < 100 ? 2 : 0 })}</b><em class="${q.pct >= 0 ? "up" : "down"}">${q.pct >= 0 ? "▲" : "▼"} ${Math.abs(q.pct ?? 0).toFixed(2)}%</em></span>`).join("")}</span>`
      : `<ol class="nu-list">${st.items.slice(0, 5).map((h, k) => `<li style="--i:${k}"><b>${esc(h.text)}</b>${h.source ? `<small>${esc(h.source)}</small>` : ""}</li>`).join("")}</ol>`}
      <span class="nu-bar" style="--t:${per}ms"></span>`);
    if (!await wait(per, tok)) return stop(0.3);
  }
  stop(0.8);
}
// The 5–7 second transition between explainers, four styles in rotation.
async function shortTransition(tok, next) {
  const v = ["coming", "flash", "ident", "slash"][shortCursor++ % 4];
  const ms = { coming: 6000, flash: 6200, ident: 5500, slash: 5200 }[v];
  const stop = score({ sting: true, bed: ms / 1000 - 1.6 });
  const cat = esc(next?.category || tr("Explainer")), title = esc(next?.title || "");
  if (v === "coming") showSeq("coming", `<span class="cm-img"${bg(next?.thumb)}></span><span class="cm-shade"></span><span class="cm-text"><span class="cm-k">${esc(tr("Coming up"))}</span><span class="cm-cat">${cat}</span><b>${title}</b></span>${DOME("cm-dome")}`);
  if (v === "flash") {
    const heads = shuffle(feed.ticker.filter(t => t.kind !== "live")).slice(0, 3);
    showSeq("flash", `${heads.map((h, k) => `<span class="fl-h" style="--i:${k}"><small>${esc(h.source || "Raisina Wire")}</small><b>${esc(h.text)}</b></span>`).join("")}<span class="fl-next" style="--i:3"><small>${esc(tr("Next"))} · ${cat}</small><b>${title}</b></span>`);
  }
  if (v === "ident") showSeq("ident", `${TRI}<span class="id-mark">${DOME("id-dome")}<b>RAISINA <em>TV</em></b><span>${esc(tr("India’s strategic briefing"))} · ${esc(clockNow())} IST</span></span><span class="id-next"><small>${esc(tr("Next"))}</small>${title}</span>`);
  if (v === "slash") showSeq("slash", `<span class="sl-a"></span><span class="sl-b"></span><span class="sl-c"></span><span class="sl-text"><span class="sl-cat">${cat}</span><b>${title}</b></span>`);
  await wait(ms, tok); stop(0.5);
}

/* ---------- Break in now: BREAKING NEWS, with its own music, then a chosen explainer ---------- */
async function checkForce() {
  const f = feed?.force;
  if (!f || inputOn) return;
  const seen = ls.get("rw-tv-force", "");
  if (f.at <= seen) return;
  ls.set("rw-tv-force", f.at);
  // Viewers already watching are cut in; someone tuning in later than two minutes after the
  // break-in just starts with the newest explainer, as usual.
  if (Date.now() - Date.parse(f.at) > (startedAt && Date.parse(f.at) > startedAt ? 2 * 3600e3 : 120e3)) return;
  const tok = ++seqToken, resumeAt = mode === "story" ? video.currentTime : null;
  const k = f.id ? feed.playlist.findIndex(v => v.id === f.id) : -1;
  if (f.breaking) {
    mode = "seq"; video.pause(); root.querySelector(".tv-lower").hidden = true;
    const stop = score({ breaking: true, bed: 4.8 });
    showSeq("breaking", `<span class="br-flash"></span><span class="br-band"><span>${esc(tr("BREAKING NEWS"))}</span></span>${f.text || feed.breaking[0] ? `<b class="br-text">${esc(f.text || feed.breaking[0])}</b>` : ""}${DOME("br-dome")}`);
    await wait(4800, tok); stop(0.6);
    if (tok !== seqToken) return;
  }
  if (k >= 0) return playStory(k);
  // Sting only: back to the explainer that was on.
  hideSeq(); mode = "story";
  if (resumeAt != null) video.currentTime = resumeAt;
  if (!paused) video.play().catch(() => {});
}

/* ---------- Live input: the desk cuts every viewer to a livestream or video link ---------- */
function syncInput() {
  const want = feed?.input || null;
  if (want && want.id !== inputOn?.id) cutToInput(want);
  else if (!want && inputOn) endInput();
}
let hlsLoad = null;
async function cutToInput(inp) {
  ++seqToken; hideSeq();
  if (mode === "ad") root.querySelector(".tv-ad").hidden = true;
  video.pause(); mode = "input"; inputOn = inp;
  const box = root.querySelector(".tv-input"), muted = !soundOn() && video.muted;
  if (inp.kind === "youtube") box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(inp.src)}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&controls=0&rel=0&modestbranding=1&enablejsapi=1" title="${esc(inp.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  else {
    box.innerHTML = `<video class="tv-input-video" playsinline autoplay${muted ? " muted" : ""}></video>`;
    const v = box.querySelector("video");
    if (inp.kind === "hls" && !v.canPlayType("application/vnd.apple.mpegurl")) {
      hlsLoad ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"; s.onload = () => res(window.Hls); s.onerror = rej; document.head.append(s); });
      try { const Hls = await hlsLoad; if (Hls?.isSupported()) { const h = new Hls(); h.loadSource(inp.src); h.attachMedia(v); box.hls = h; } } catch { /* the stream can't play here */ }
    } else v.src = inp.src;
    v.play().catch(() => {});
  }
  box.hidden = false;
  lowerThird(tr("LIVE"), inp.title, { live: true, stay: true });
  mediaSession(inp.title);
}
function endInput() {
  const box = root.querySelector(".tv-input");
  box.hls?.destroy?.(); box.innerHTML = ""; box.hidden = true; inputOn = null;
  root.querySelector(".tv-lower").hidden = true;
  // Back to the channel where it left off.
  mode = "story";
  if (!video.src) return playStory(idx);
  if (!paused) video.play().catch(() => {});
}
function inputMute(m) {
  const box = root?.querySelector(".tv-input"); if (!box || box.hidden) return;
  const v = box.querySelector("video"); if (v) v.muted = m;
  box.querySelector("iframe")?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: m ? "mute" : "unMute", args: [] }), "*");
}
function inputPause(p) {
  const box = root?.querySelector(".tv-input"); if (!box || box.hidden) return;
  const v = box.querySelector("video"); if (v) { if (p) v.pause(); else v.play().catch(() => {}); }
  box.querySelector("iframe")?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: p ? "pauseVideo" : "playVideo", args: [] }), "*");
}

/* ---------- Where the player sits ---------- */
// Called after every page change: into the page's TV slot if there is one, otherwise a
// floating mini-player while it's playing with sound (or stopped if nobody was watching).
export async function dockTV() {
  const slot = document.getElementById("tvSlot");
  if (slot) {
    build();
    root.classList.remove("mini"); document.body.classList.remove("tv-mini-on");
    if (root.parentElement !== slot) slot.append(root);
    if (mode === "idle") await startTV();
    else if (!paused && mode === "story" && video.paused && !document.hidden) video.play().catch(() => {});
    return;
  }
  if (root && mode !== "idle" && engaged && !paused) {
    root.classList.add("mini"); document.body.classList.add("tv-mini-on");
    if (root.parentElement !== document.body) document.body.append(root);
  } else if (root && mode !== "idle") stopTV();
}
async function startTV() {
  startedAt = Date.now();
  lastBulletin = new Date(Date.now() + 5.5 * 3600e3).getUTCHours(); // no bulletin the moment TV opens
  await load();
  if (!feed || !feed.on) return offAir(true);
  offAir(false);
  renderClock(); clearInterval(clockTimer); clockTimer = setInterval(renderClock, 15e3);
  // Every 10 seconds: new explainers, the ticker, break-ins and the live input.
  clearInterval(pollTimer); pollTimer = setInterval(() => { if (!document.hidden && mode !== "idle") load(); }, 10e3);
  syncSound();
  // Viewers start with the newest explainer, then go back in time.
  playStory(0);
  syncInput();
}
export function stopTV() {
  if (!root) return;
  flushWatch();
  ++seqToken; hideSeq();
  if (inputOn) { const box = root.querySelector(".tv-input"); box.hls?.destroy?.(); box.innerHTML = ""; box.hidden = true; inputOn = null; }
  video.pause(); video.removeAttribute("src"); video.load();
  if (paused) setPaused(false);
  mode = "idle"; engaged = false;
  clearInterval(pollTimer); clearInterval(clockTimer);
  root.classList.remove("mini"); document.body.classList.remove("tv-mini-on");
  root.remove();
}

/* ---------- The muted preview on the home page ---------- */
// Plays silently only while on screen, for at most 90 seconds a visit, then rests on a still.
// Data-saver and reduced-motion get the still picture with a play button.
let previewSpent = 0;
export async function mountPreview(host) {
  const f = await loadTV(); if (!f?.on || !f.playlist.length || !host.isConnected) { host.hidden = true; return; }
  const v = f.playlist[0];
  const still = navigator.connection?.saveData || matchMedia("(prefers-reduced-motion: reduce)").matches || previewSpent >= 90;
  host.hidden = false;
  host.innerHTML = `<a class="tv-preview" href="/tv" aria-label="${esc(tr("Watch Raisina TV live"))}">
    <span class="tvp-media">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : ""}${still ? "" : `<video muted playsinline loop preload="none" src="${esc(v.src)}"></video>`}
      <span class="tv-live"><span class="pulse"></span>LIVE</span><span class="tvp-logo">${markDome("tv-dome", 4)}<b>Raisina TV</b></span>${still ? `<span class="tvp-play">${ICONS.play}</span>` : ""}</span>
    <span class="tvp-body"><span class="tvp-k">${esc(tr("On Raisina TV now"))}</span><b>${esc(v.title)}</b><span class="tvp-go">${ICONS.play}<span>${esc(tr("Watch live"))}</span></span></span></a>`;
  const pv = host.querySelector("video"); if (!pv) return;
  let started = 0;
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && previewSpent < 90 && !document.hidden) { started = Date.now(); pv.play().then(() => host.classList.add("playing")).catch(() => {}); }
    else if (!pv.paused) { pv.pause(); previewSpent += (Date.now() - started) / 1000; if (previewSpent >= 90) { pv.remove(); host.classList.remove("playing"); } }
  }, { threshold: 0.5 });
  io.observe(pv);
  setTimeout(() => { if (pv.isConnected && !pv.paused) { previewSpent = 90; pv.pause(); pv.remove(); host.classList.remove("playing"); } }, 90e3);
}

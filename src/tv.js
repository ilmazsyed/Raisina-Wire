// Raisina TV: the desk's explainers playing one after another, newest first, around the clock.
// One player for the whole app: it sits on the TV page or the Watch page, and follows the reader
// as a floating mini-player when they move on. Broadcast look: an animated Raisina Wire logo,
// LIVE badge and India time, a lower third, a ticker of live updates, stories and the wire (with
// a red BREAKING band when the desk turns one on), an "Up next" card between stories, ad breaks,
// and the control room's "break in now" switch (src/channel.js).
import { markDome } from "./brand.js";
import { tr, lang, LOCALE, withLang } from "./i18n.js";

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
  play: icon('<path d="M7 5v14l11-7z" fill="currentColor"/>')
};

let deps = {};           // beacon, share, navigate: supplied by main.js
let feed = null, root = null, video = null;
let idx = 0, mode = "idle", engaged = false, sinceAd = 0, adQueue = [], adIdx = ls.get("rw-tv-ad", 0);
let lastTick = 0, unsent = 0, pollTimer = 0, clockTimer = 0, wasPlaying = false, forcing = false;
// Tests only (localStorage rw-tv-debug): make the next switch an ad break, and poll at once.
if (ls.get("rw-tv-debug", false)) window.__tv = { adNow: () => { sinceAd = 1e9; }, poll: () => load(), state: () => ({ mode, idx, src: video?.currentSrc }) };

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
    checkForce();
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
      <div class="tv-top"><span class="tv-logo" aria-label="Raisina Wire TV">${markDome("tv-dome", 4)}<span class="tv-word">RAISINA<b> WIRE</b></span><span class="tv-tri"><i></i><i></i><i></i></span></span>
        <span class="tv-grow"></span><span class="tv-live"><span class="pulse"></span>LIVE</span><span class="tv-clock" aria-hidden="true"></span></div>
      <div class="tv-lower" hidden><span class="tv-cat"></span><b class="tv-title"></b></div>
      <div class="tv-card" hidden aria-hidden="true"><span class="tv-card-img"></span><span class="tv-card-text"><span class="tv-card-k">${esc(tr("Up next"))}</span><b></b></span>${markDome("tv-card-dome", 4)}</div>
      <div class="tv-sting" hidden role="alert"><span class="tv-sting-k">${esc(tr("BREAKING NEWS"))}</span><b></b></div>
      <div class="tv-ad" hidden><span class="tv-ad-k">${esc(tr("Advertisement"))}</span><span class="tv-ad-n"></span><button type="button" class="tv-ad-skip" hidden>${esc(tr("Skip ad"))} ›</button></div>
      <button type="button" class="tv-sound">${ICONS.muted}<span>${esc(tr("Tap for sound"))}</span></button>
      <div class="tv-ctrls">
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
  document.addEventListener("visibilitychange", () => {
    if (!video || mode === "idle") return;
    if (document.hidden) { wasPlaying = !video.paused; video.pause(); flushWatch(); }
    else { if (wasPlaying) video.play().catch(() => {}); load(); }
  });
  addEventListener("pagehide", flushWatch);
  return root;
}

function onClick(e) {
  const b = e.target.closest("[data-tv], .tv-sound, .tv-ad-skip, .tv-tk-item");
  if (!b) { if (e.target.closest(".tv-screen") && root.classList.contains("mini")) deps.navigate?.("/tv"); return; }
  if (b.classList.contains("tv-tk-item")) { if (b.dataset.href) { e.preventDefault(); deps.navigate?.(b.dataset.href); } return; }
  if (b.classList.contains("tv-sound")) return unmute();
  if (b.classList.contains("tv-ad-skip")) return nextAd();
  const k = b.dataset.tv;
  if (k === "mute") { if (video.muted) unmute(); else { video.muted = true; syncSound(); } }
  if (k === "full") { const s = root.querySelector(".tv-screen"); (s.requestFullscreen ? s.requestFullscreen() : video.webkitEnterFullscreen?.())?.catch?.(() => {}); }
  if (k === "cast") { if (video.remote?.prompt) video.remote.prompt().catch(() => {}); else video.webkitShowPlaybackTargetPicker?.(); }
  if (k === "share") deps.share?.(tr("Raisina TV — live"), `${location.origin}${withLang("/tv")}`);
  if (k === "open") deps.navigate?.("/tv");
  if (k === "close") stopTV();
}
function unmute() { engaged = true; video.muted = false; video.play().catch(() => {}); syncSound(); }
function syncSound() {
  root.querySelector(".tv-sound").hidden = !video.muted;
  root.querySelector('[data-tv="mute"]').innerHTML = video.muted ? ICONS.muted : ICONS.sound;
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
function renderClock() { const c = root?.querySelector(".tv-clock"); if (c) c.textContent = `${new Date().toLocaleTimeString(LOCALE, { ...IST, hour: "2-digit", minute: "2-digit", hour12: false })} IST`; }
function lowerThird(v) {
  const l = root.querySelector(".tv-lower");
  l.querySelector(".tv-cat").textContent = v.category || tr("Explainer");
  l.querySelector(".tv-title").textContent = v.title;
  l.hidden = false; l.classList.remove("out"); void l.offsetWidth; l.classList.add("in");
  clearTimeout(lowerThird.t); lowerThird.t = setTimeout(() => l.classList.add("out"), 9000);
}
function mediaSession(v) {
  if (!("mediaSession" in navigator) || !v) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: v.title, artist: "Raisina TV · LIVE", album: "Raisina Wire", artwork: [{ src: v.thumb || "/icon-512.png", sizes: "512x512" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] });
    navigator.mediaSession.setActionHandler?.("play", () => video.play());
    navigator.mediaSession.setActionHandler?.("pause", () => video.pause());
    navigator.mediaSession.setActionHandler?.("nexttrack", () => { if (mode === "story") advance(); });
  } catch { /* older browsers */ }
}

/* ---------- Playing stories, transitions and ads ---------- */
function playStory(i, { card = false } = {}) {
  if (!feed?.playlist.length) return offAir(true);
  idx = ((i % feed.playlist.length) + feed.playlist.length) % feed.playlist.length;
  const v = feed.playlist[idx];
  mode = "story";
  root.querySelector(".tv-ad").hidden = true;
  const go = () => {
    root.querySelector(".tv-lower").hidden = true;
    video.src = v.src; video.poster = v.thumb || "";
    const start = () => { root.querySelector(".tv-card").hidden = true; lowerThird(v); };
    video.addEventListener("playing", start, { once: true });
    video.play().catch(() => { root.classList.add("needs-tap"); start(); });
    mediaSession(v);
    deps.beacon?.({ t: "play", id: v.id, src: "tv" });
    document.dispatchEvent(new CustomEvent("tvchange"));
  };
  if (!card) return go();
  // "Up next": the next story's picture zooms in behind the logo while its video loads.
  const c = root.querySelector(".tv-card");
  c.querySelector(".tv-card-img").style.backgroundImage = v.thumb ? `url("${String(v.thumb).replace(/"/g, "%22")}")` : "";
  c.querySelector("b").textContent = v.title;
  c.hidden = false; c.classList.remove("on"); void c.offsetWidth; c.classList.add("on");
  setTimeout(go, 1400);
}
function advance() {
  if (feed?.ads.length && sinceAd >= feed.every * 60) return startBreak();
  playStory(idx + 1, { card: true });
}
function onEnded() { if (mode === "ad") nextAd(); else if (mode === "story") advance(); }
function startBreak() {
  sinceAd = 0;
  adQueue = Array.from({ length: Math.min(feed.perBreak, 4) }, (_, k) => feed.ads[(adIdx + k) % feed.ads.length]);
  adIdx = (adIdx + adQueue.length) % Math.max(feed.ads.length, 1); ls.set("rw-tv-ad", adIdx);
  mode = "ad"; nextAd(true);
}
function nextAd(first = false) {
  const ad = first ? adQueue[0] : (adQueue.shift(), adQueue[0]);
  if (!first && mode === "ad" && root.dataset.adId) deps.beacon?.({ t: "ad", id: root.dataset.adId, done: video.ended });
  if (!ad) { root.querySelector(".tv-ad").hidden = true; delete root.dataset.adId; return playStory(idx + 1, { card: true }); }
  root.dataset.adId = ad.id;
  root.querySelector(".tv-lower").hidden = true;
  const box = root.querySelector(".tv-ad"), skip = box.querySelector(".tv-ad-skip");
  box.hidden = false; skip.hidden = true;
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

/* ---------- Break in now ---------- */
function checkForce() {
  const f = feed?.force;
  if (!f || !root || mode === "idle" || forcing) return;
  const seen = ls.get("rw-tv-force", "");
  if (f.at <= seen) return;
  ls.set("rw-tv-force", f.at);
  // Viewers already watching are cut in; someone tuning in later than two minutes after the
  // break-in just starts with the newest explainer, as usual.
  if (Date.now() - Date.parse(f.at) > (startedAt && Date.parse(f.at) > startedAt ? 2 * 3600e3 : 120e3)) return;
  forcing = true;
  const go = () => { forcing = false; const k = f.id ? feed.playlist.findIndex(v => v.id === f.id) : -1; if (k >= 0) playStory(k); else if (mode === "story" && video.paused) video.play().catch(() => {}); };
  if (!f.breaking) return go();
  const s = root.querySelector(".tv-sting");
  s.querySelector("b").textContent = f.text || feed.breaking[0] || "";
  s.hidden = false; s.classList.remove("on"); void s.offsetWidth; s.classList.add("on");
  if (f.id) video.pause();
  setTimeout(() => { s.hidden = true; go(); }, 3200);
}

/* ---------- Where the player sits ---------- */
// Called after every page change: into the page's TV slot if there is one, otherwise a
// floating mini-player while it's playing with sound (or stopped if nobody was watching).
export async function dockTV() {
  const slot = document.getElementById("tvSlot");
  if (slot) {
    build();
    root.classList.remove("mini"); document.body.classList.remove("tv-mini-on");
    slot.append(root);
    if (mode === "idle") await startTV();
    else if (video.paused && !document.hidden) video.play().catch(() => {});
    return;
  }
  if (root && mode !== "idle" && engaged && !video.paused) {
    root.classList.add("mini"); document.body.classList.add("tv-mini-on");
    if (root.parentElement !== document.body) document.body.append(root);
  } else if (root && mode !== "idle") stopTV();
}
let startedAt = 0;
async function startTV() {
  startedAt = Date.now();
  await load();
  if (!feed) return offAir(true);
  if (!feed.on) return offAir(true);
  offAir(false);
  renderClock(); clearInterval(clockTimer); clockTimer = setInterval(renderClock, 15e3);
  clearInterval(pollTimer); pollTimer = setInterval(() => { if (!document.hidden && mode !== "idle") load(); }, 15e3);
  syncSound();
  // Viewers start with the newest explainer, then go back in time.
  playStory(0);
}
export function stopTV() {
  if (!root) return;
  flushWatch();
  video.pause(); video.removeAttribute("src"); video.load();
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

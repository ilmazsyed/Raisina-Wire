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
import { createAnchor, prefetchLines } from "./tvanchor.js";
import { TV_INTRO_PICS } from "./tv-intro-pics.js";

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
// The on-screen bug, in the style of the shorts' logo: the app icon, RAISINA WIRE, and LIVE under it.
// It sits exactly over the logo printed in the explainers and stays on screen through everything.
const BUG = `<span class="tv-logo" aria-label="Raisina Wire, live"><span class="tv-app">${markDome("tv-dome", 4)}<span class="tv-app-tri"><i></i><i></i><i></i></span></span><span class="tv-bug-live"><span class="pulse"></span><b>LIVE</b></span></span>`;
// A broadcast studio backdrop: deep crimson and navy, slow light ribbons and a turning globe grid.
const GLOBE = `<svg class="bx-globe" viewBox="-100 -100 200 200" aria-hidden="true"><circle r="96"/>${[20, 45, 70, 90].map(r => `<ellipse rx="${r}" ry="96"/>`).join("")}${[-64, -32, 0, 32, 64].map(y => `<ellipse cy="${y}" rx="${Math.round(Math.sqrt(96 * 96 - y * y))}" ry="${Math.round(Math.sqrt(96 * 96 - y * y) * 0.18)}"/>`).join("")}</svg>`;
const STUDIO = `<span class="bx-bg" aria-hidden="true"><i class="bx-r1"></i><i class="bx-r2"></i><i class="bx-r3"></i>${GLOBE}<i class="bx-grain"></i></span>`;
const dateNow = () => new Date().toLocaleDateString(LOCALE, { ...IST, weekday: "long", day: "numeric", month: "long" });
const TRI = `<span class="sq-tri"><i></i><i></i><i></i></span>`;
const clockNow = () => new Date().toLocaleTimeString(LOCALE, { ...IST, hour: "2-digit", minute: "2-digit", hour12: false });

let deps = {};           // beacon, share, navigate: supplied by main.js
let feed = null, root = null, video = null;
let idx = 0, mode = "idle", engaged = false, sinceAd = 0, adQueue = [], adIdx = ls.get("rw-tv-ad", 0);
let lastTick = 0, unsent = 0, pollTimer = 0, clockTimer = 0, wasPaused = false, startedAt = 0;
let anchor = null;      // the AI anchor on screen (src/tvanchor.js)
// Sound: the viewer's choice (wantSound), and the explainer kept silent under the anchor's voice
// (voMute). TV starts only from a click, so it starts with sound (armed).
let wantSound = false, voMute = false, armed = false;
let seqToken = 0, paused = false, sinceFull = 0, setCursor = 0, shortCursor = 0, stingCursor = 0, lastBulletin = -1, inputOn = null;
// Tests only (localStorage rw-tv-debug): make the next switch an ad break, poll at once, inspect.
if (ls.get("rw-tv-debug", false)) window.__tv = { adNow: () => { sinceAd = 1e9; }, fullNext: () => { sinceFull = 99; }, bulletinNext: () => { forceBulletin = true; sinceFull = 99; }, poll: () => load(), openerNext: () => ls.set("rw-tv-last", 0), state: () => ({ mode, idx, paused, src: video?.currentSrc, seq: root?.querySelector(".tv-seq")?.dataset.kind || "", input: inputOn?.id || null }) };

export function initTV(d) {
  deps = d;
  // Raisina TV never plays by itself: it starts when a live TV icon or link is clicked (header,
  // menu, shorts, the home page), and that click also lets it play with sound.
  document.addEventListener("click", e => {
    const a = e.target.closest?.("a[href]");
    if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    let path = ""; try { path = new URL(a.href, location.href).pathname; } catch { return; }
    if (/^\/(?:hi\/|bn\/)?tv\/?$/.test(path) && (!root || mode === "idle")) arm();
  }, true);
}
// A click is starting TV: switch the sound on and unlock the players while the click lasts.
function arm() {
  build();
  armed = true; engaged = true; wantSound = true;
  // iPhones: this is media playback, so the silent switch doesn't mute the channel's sound.
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* older Safari */ }
  music.audio(); music.resume();
  video.muted = false;
  if (!video.getAttribute("src")) { video.src = "/tv-unlock.mp4"; video.play().then(() => video.pause()).catch(() => {}); }
  anchor.unlock();
}
// Opened without a click (a shared link, a reload): a big play button over the newest explainer.
async function showStart() {
  const b = root.querySelector(".tv-start"); b.hidden = false;
  const f = await loadTV().catch(() => null), v = f?.playlist?.[0];
  if (v?.thumb) b.querySelector(".tv-start-i").style.backgroundImage = `url('${String(v.thumb).replace(/'/g, "%27")}')`;
}
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
      <div class="tv-top">${BUG}<span class="tv-clock" aria-hidden="true"></span></div>
      <div class="tv-lower" hidden><span class="tv-cat"></span><b class="tv-title"></b></div>
      <div class="tv-ad" hidden><span class="tv-ad-k">${esc(tr("Advertisement"))}</span><span class="tv-ad-n"></span><button type="button" class="tv-ad-skip" hidden>${esc(tr("Skip ad"))} ›</button></div>
      <div class="tv-cut" aria-hidden="true"><i></i><i></i>${DOME("cut-dome")}</div>
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
      <button type="button" class="tv-start" hidden><span class="tv-start-i"></span><span class="tv-start-p">${ICONS.play}</span><b>${esc(tr("Watch Raisina TV live"))}</b></button>
      <div class="tv-off" hidden><b>${esc(tr("Raisina TV is off air"))}</b><span>${esc(tr("Back soon."))}</span></div>
    </div>
    <div class="tv-ticker" aria-label="${esc(tr("Latest headlines"))}"><span class="tv-tk-break" hidden></span><div class="tv-tk-run"><div class="tv-tk-track"></div></div></div>`;
  video = root.querySelector("video");
  anchor = createAnchor(root.querySelector(".tv-screen"), { isPaused: () => paused, hearing: () => engaged && wantSound, label: tr, onSpeak: on => music.duck(on), onBlocked: () => { wantSound = false; applyMute(); syncSound(); } });
  new Image().src = IDENT; // the ident, ready when it's due
  video.addEventListener("ended", onEnded);
  video.addEventListener("error", () => { if (mode === "ad") nextAd(); else if (mode === "story") setTimeout(() => advance(), 600); });
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("playing", () => root.classList.add("is-playing"));
  video.addEventListener("pause", () => root.classList.remove("is-playing"));
  root.addEventListener("click", onClick);
  const screen = root.querySelector(".tv-screen");
  screen.addEventListener("pointerdown", e => { tapWasHidden = e.pointerType !== "mouse" && !root.classList.contains("ctl-on"); showCtl(); });
  screen.addEventListener("pointermove", e => { if (e.pointerType === "mouse") showCtl(); });
  screen.addEventListener("focusin", showCtl);
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

// Controls fade out after 3 seconds and come back on a mouse move or a tap (they stay while paused).
let ctlTimer = 0, tapWasHidden = false;
function showCtl() {
  root.classList.add("ctl-on"); clearTimeout(ctlTimer);
  ctlTimer = setTimeout(() => { if (!root.querySelector(".tv-ctrls:hover")) root.classList.remove("ctl-on"); }, 3000);
}
function onClick(e) {
  const b = e.target.closest("[data-tv], .tv-sound, .tv-start, .tv-ad-skip, .tv-tk-item");
  if (!b) {
    if (!e.target.closest(".tv-screen")) return;
    if (root.classList.contains("mini")) return deps.navigate?.("/tv");
    if (tapWasHidden) return; // on a phone, the first tap only brings the controls back
    if (!e.target.closest("iframe")) togglePause(); // tap the picture to pause or play
    return;
  }
  if (b.classList.contains("tv-tk-item")) { if (b.dataset.href) { e.preventDefault(); deps.navigate?.(b.dataset.href); } return; }
  if (b.classList.contains("tv-sound")) return unmute();
  if (b.classList.contains("tv-start")) { arm(); return dockTV(); }
  if (b.classList.contains("tv-ad-skip")) return nextAd();
  const k = b.dataset.tv;
  if (k === "pause") togglePause();
  if (k === "mute") { if (wantSound) { wantSound = false; applyMute(); syncSound(); } else unmute(); }
  if (k === "full") { const s = root.querySelector(".tv-screen"); (s.requestFullscreen ? s.requestFullscreen() : video.webkitEnterFullscreen?.())?.catch?.(() => {}); }
  if (k === "cast") { if (video.remote?.prompt) video.remote.prompt().catch(() => {}); else video.webkitShowPlaybackTargetPicker?.(); }
  if (k === "share") deps.share?.(tr("Raisina TV — live"), `${location.origin}${withLang("/tv")}`);
  if (k === "open") deps.navigate?.("/tv");
  if (k === "close") stopTV();
}
function unmute() {
  engaged = true; wantSound = true; music.audio(); music.resume(); anchor?.unlock();
  applyMute();
  if (mode === "story" && !paused) video.play().catch(() => {});
  syncSound();
}
// The video's own sound: on when the viewer wants sound, except under the anchor's voice-over.
function applyMute() { if (video) video.muted = !wantSound || voMute; inputMute(!wantSound); anchor?.setHearing(engaged && wantSound); }
function syncSound() {
  root.querySelector(".tv-sound").hidden = wantSound;
  root.querySelector('[data-tv="mute"]').innerHTML = wantSound ? ICONS.sound : ICONS.muted;
}
const soundOn = () => engaged && wantSound && feed?.seq?.music !== false;

/* ---------- Pause ---------- */
function togglePause() { setPaused(!paused); }
function setPaused(p) {
  if (p && mode === "ad" && !feed?.skippable) return; // non-skippable ads play through
  paused = p;
  root.classList.toggle("paused", p);
  const btn = root.querySelector('[data-tv="pause"]');
  btn.innerHTML = p ? ICONS.play : ICONS.pause; btn.setAttribute("aria-label", tr(p ? "Play" : "Pause"));
  anchor?.pause(p);
  if (p) { video.pause(); inputPause(true); music.suspend(); music.pauseTracks(); }
  else { if (["story", "ad"].includes(mode) || anchor?.shotNow() === "vo") video.play().catch(() => {}); inputPause(false); music.resume(); music.resumeTracks(); }
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

/* ---------- The cut: a Raisina Wire wipe over every change of shot ---------- */
// A crimson panel and a navy one (with the dome) sweep across, the change happens under cover, and
// they sweep off the other side; the direction alternates. Anchor to headlines, headlines to
// anchor, anchor to pictures, to live visuals and into the explainer all go through it. It never
// stays on screen: if a sequence is overtaken or stalls under it, it clears itself.
let cutDir = 0, cutT = 0;
const cutEl = () => root?.querySelector(".tv-cut");
async function cover(tok) {
  const w = cutEl(); if (!w) return tok === seqToken;
  clearTimeout(cutT); cutT = setTimeout(reveal, 2500);
  if (w.classList.contains("in")) return tok === seqToken;
  w.className = `tv-cut d${cutDir++ % 2}`; void w.offsetWidth; w.classList.add("in");
  return wait(340, tok);
}
function reveal() { clearTimeout(cutT); const w = cutEl(); if (w?.classList.contains("in")) w.classList.replace("in", "out"); }
// A full-screen segment brought in under the wipe. Resolves false if a newer sequence took over.
async function swapSeq(tok, kind, html) {
  if (!await cover(tok)) return false;
  showSeq(kind, html); reveal();
  return true;
}

/* ---------- Ticker, clock, lower third ---------- */
function renderTicker() {
  if (!root || !feed) return;
  const br = root.querySelector(".tv-tk-break"), track = root.querySelector(".tv-tk-track");
  br.hidden = false;
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
function renderClock() { const c = root?.querySelector(".tv-clock"); if (c) c.textContent = `${new Date().toLocaleDateString(LOCALE, { ...IST, weekday: "short", day: "numeric", month: "short" })} · ${clockNow()} IST`; }
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
  anchor?.hide(); voMute = false; applyMute();
  if (video.getAttribute("src") !== v.src) { video.src = v.src; video.poster = v.thumb || ""; } else video.currentTime = 0;
  video.addEventListener("playing", () => lowerThird(v.category || tr("Explainer"), v.title), { once: true });
  if (!paused) video.play().catch(() => {});
  mediaSession(v.title, v.thumb);
  deps.beacon?.({ t: "play", id: v.id, src: "tv" });
  document.dispatchEvent(new CustomEvent("tvchange"));
}
// The anchor's intro before an explainer, cut like a bulletin: on camera for the hook, her voice
// over the explainer's opening pictures (muted), back on camera for the hand-off, then the film
// from the start. Without an intro (or with anchors off) the explainer just plays.
const anchorsOn = () => Boolean(anchor && feed?.anchors && feed.seq?.anchors !== false);
// The anchor introduces herself ("Hello and welcome… My name is Tara, and you're watching Raisina
// Wire Live") when TV starts, when a new anchor takes over, and when she's back on screen after
// half an hour. Resolves false if a newer sequence took over.
let helloWho = "", helloAt = 0;
async function hello(key, tok) {
  const h = feed?.anchors?.lines?.hello;
  if (!anchorsOn() || !h || h.anchor !== key || (helloWho === key && Date.now() - helloAt < 30 * 60e3)) return true;
  helloWho = key; helloAt = Date.now();
  return anchor.say(h, () => tok === seqToken);
}
async function introStory(i) {
  if (!feed?.playlist.length) return playStory(i);
  const n = ((i % feed.playlist.length) + feed.playlist.length) % feed.playlist.length, v = feed.playlist[n];
  const it = anchorsOn() && feed.anchors.intros?.[v.id];
  if (!it) return playStory(n);
  const tok = ++seqToken, alive = () => tok === seqToken;
  idx = n; mode = "seq";
  if (!await cover(tok)) return;
  hideSeq();
  root.querySelector(".tv-ad").hidden = true; root.querySelector(".tv-lower").hidden = true;
  video.pause(); video.src = v.src; video.poster = v.thumb || "";
  prefetchLines([it.vo, it.out]);
  const who = { key: it.anchor, roster: feed.anchors.roster, pick: it.pick ? tr("EDITOR’S PICK") : "" };
  // Voice over: the explainer's pictures one after another with a Raisina Wire wipe (the film
  // itself waits at its first frame, so it starts cleanly afterwards).
  const pics = TV_INTRO_PICS[String(v.src || "").split("?")[0]] || [v.thumb].filter(Boolean);
  // A voice-only intro (chosen for this explainer, or until the anchor's lip-synced clips for it are
  // ready): all three parts over the pictures, no anchor on screen, no self-introduction.
  if (it.mode === "voice") {
    anchor.shot("vo", { pics, pick: who.pick });
    lowerThird(v.category || tr("Explainer"), v.title, { stay: true }); reveal();
    for (const l of [it.cam, it.vo, it.out]) if (!await anchor.say(l, alive)) return;
    if (await cover(tok)) { playStory(n); reveal(); }
    return;
  }
  anchor.shot("cam", who); reveal();
  if (!await hello(it.anchor, tok) || !await anchor.say(it.cam, alive)) return;
  if (!await cover(tok)) return;
  anchor.shot("vo", { ...who, pics });
  lowerThird(v.category || tr("Explainer"), v.title, { stay: true }); reveal();
  if (!await anchor.say(it.vo, alive)) return;
  if (!await cover(tok)) return;
  root.querySelector(".tv-lower").hidden = true;
  anchor.shot("cam", { ...who, aston: false }); reveal(); // the aston has had its turn at the top
  if (!await anchor.say(it.out, alive)) return;
  if (await cover(tok)) { playStory(n); reveal(); }
}
function onEnded() { if (mode === "ad") nextAd(); else if (mode === "story") advance(); }
// Between explainers: the short transition, or the full package every few videos (or the
// top-of-the-hour bulletin), then an ad break if one is due, then the next explainer.
async function advance() {
  if (!feed?.playlist.length || !["story"].includes(mode)) return;
  const tok = ++seqToken, s = feed.seq || {}, next = feed.playlist[(idx + 1) % feed.playlist.length];
  mode = "seq"; video.pause(); root.querySelector(".tv-lower").hidden = true;
  preload(next);
  sinceFull++; sincePoster++;
  const bulletin = s.hourly && bulletinDue();
  const full = bulletin || (sinceFull >= (s.fullEvery || 2) && (s.stinger || s.promo || s.news));
  if (full) {
    sinceFull = 0;
    if (s.stinger !== false) await stinger(tok);
    if (bulletin) await countdown(tok);
    else if (s.promo !== false) await promo(tok);
    if (s.news !== false) await newsUpdate(tok, bulletin);
  } else await shortTransition(tok, next);
  if (tok === seqToken && sincePoster >= 2) await posterIdent(tok);
  if (tok !== seqToken) return;
  if (feed.ads.length && sinceAd >= feed.every * 60) return startBreak();
  introStory(idx + 1);
}
function preload(v) { if (!v) return; const it = feed?.anchors?.intros?.[v.id]; if (it) prefetchLines([it.cam, it.vo, it.out]); const p = document.createElement("link"); p.rel = "preload"; p.as = "video"; p.href = v.src; document.head.append(p); setTimeout(() => p.remove(), 60e3); }
function startBreak() {
  sinceAd = 0; hideSeq();
  adQueue = Array.from({ length: Math.min(feed.perBreak, 4) }, (_, k) => feed.ads[(adIdx + k) % feed.ads.length]);
  adIdx = (adIdx + adQueue.length) % Math.max(feed.ads.length, 1); ls.set("rw-tv-ad", adIdx);
  mode = "ad"; nextAd(true);
}
function nextAd(first = false) {
  const ad = first ? adQueue[0] : (adQueue.shift(), adQueue[0]);
  if (!first && mode === "ad" && root.dataset.adId) deps.beacon?.({ t: "ad", id: root.dataset.adId, done: video.ended });
  if (!ad) { root.querySelector(".tv-ad").hidden = true; delete root.dataset.adId; mode = "story"; return introStory(idx + 1); }
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
  anchor?.hide();
  const el = seqEl(); el.dataset.kind = kind; el.className = `tv-seq sq-${kind}`; el.innerHTML = html; el.hidden = false;
  void el.offsetWidth; el.classList.add("on");
  return el;
}
function hideSeq() { anchor?.hide(); root?.classList.remove("anchor-pip"); const el = seqEl(); if (!el) return; el.hidden = true; el.innerHTML = ""; el.dataset.kind = ""; }
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// Full-screen pictures: the 960 px WebP copy first (tools/thumbs.py), the original underneath.
// Background image (the small WebP first where there is one); extra CSS goes in the same style attribute.
const bg = (u, css = "") => { const q = x => `url('${esc(String(x).replace(/'/g, "%27"))}')`; const md = u && /^\/videos\/[\w.-]+\.jpg$/.test(u) ? u.replace(/\.jpg$/, "-md.webp") : ""; const img = u ? `background-image:${md ? `${q(md)},` : ""}${q(u)};` : ""; return img || css ? ` style="${img}${css}"` : ""; };

// Stinger (about 2 s), three looks in rotation.
async function stinger(tok) {
  const v = ["dome", "tricolour", "shutter"][stingCursor++ % 3];
  const stop = score({ sting: true });
  if (!await swapSeq(tok, `sting-${v}`, `<span class="sq-panels"><i></i><i></i><i></i></span>${TRI}<span class="sq-mark">${DOME()}<b>RAISINA <em>WIRE</em></b><small>TV</small></span><span class="sq-flash"></span>`)) return stop(0.3);
  await wait(2100, tok); stop(0.5);
}
// The Raisina Wire promo: 15 s of story pictures, slow zooms and quick cuts on the beat, with
// tagline cards and an end card.
// The short version (8 s) opens TV; the full 15 s plays in the breaks between explainers.
async function promo(tok, secs = 15) {
  const k = secs / 15, pics = shuffle(feed.promo || []).slice(0, Math.ceil(8 * k) + 1);
  const stop = score({ bed: secs });
  const d = t => `--d:${(t * k).toFixed(2)}s`;
  if (!await swapSeq(tok, "promo", `${pics.map((p, i) => `<span class="pm-slide"${bg(p, `${d(i * 1.75)};animation-duration:${(2.3 * Math.max(k, 0.75)).toFixed(2)}s`)}></span>`).join("")}
    <span class="pm-shade"></span>
    <span class="pm-card" style="${d(0.4)}"><b>${esc(tr("India’s strategic briefing"))}</b></span>
    <span class="pm-card" style="${d(5)}"><b>English · हिन्दी · বাংলা</b></span>
    ${secs >= 12 ? `<span class="pm-card" style="${d(9.4)}"><b>${esc(tr("Live · Explainers · Markets · Analysis"))}</b></span>` : ""}
    <span class="pm-end" style="${d(12.6)}">${DOME("pm-dome")}<b>RAISINA <em>WIRE</em></b><span>raisinawire.calibrex.org</span>${TRI}</span>`)) return stop(0.3);
  await wait(secs * 1000, tok); stop(0.8);
}
// Top of the hour: a 5-second countdown into the bulletin, a ring of 60 ticks filling up.
async function countdown(tok) {
  const stop = score({ sting: true });
  const ticks = Array.from({ length: 60 }, (_, k) => `<line x1="0" y1="-92" x2="0" y2="${k % 5 ? -84 : -78}" transform="rotate(${k * 6})" style="--k:${k}"/>`).join("");
  if (!await swapSeq(tok, "count", `${STUDIO}<span class="cd-wrap"><svg class="cd-ring" viewBox="-100 -100 200 200" aria-hidden="true">${ticks}</svg>
    <span class="cd-c"><small>RAISINA WIRE</small><b>${esc(hourLabel())}</b><em>${esc(tr("BULLETIN"))}</em></span></span>
    <span class="cd-sub">${esc(dateNow())} · <b class="cd-n">5</b></span>`)) return stop(0.3);
  for (let n = 5; n >= 1; n--) { const b = seqEl().querySelector(".cd-n"); if (b) { b.textContent = n; b.classList.remove("tick"); void b.offsetWidth; b.classList.add("tick"); } if (!await wait(1000, tok)) break; }
  stop(0.4);
}
let forceBulletin = false;
function bulletinDue() {
  if (forceBulletin) { forceBulletin = false; return true; }
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
// A picture for a set: its first story picture, else one of the site's own (as a fallback layer).
function setPic(st, i) {
  const own = feed.promo || [], img = st.items?.find(h => h.img)?.img;
  const fallback = own.length ? own[(setCursor * 3 + i) % own.length] : "";
  return [img, fallback].filter(Boolean);
}
const picStyle = (urls, css = "") => urls.length ? ` style="background-image:${urls.map(u => `url('${esc(String(u).replace(/'/g, "%27"))}')`).join(",")};${css}"` : (css ? ` style="${css}"` : "");
const listHtml = (its, start, slot, measure = false) => `<ol class="bx-list${measure ? " measure" : ""}" style="--slot:${Math.round(slot)}ms">${its.map((h, k) => `<li style="--i:${k}"><span class="bx-no">${start + k + 1}</span><span class="bx-h"><b>${esc(h.text)}</b>${h.source || h.at ? `<small>${esc([h.source, h.at ? ago(h.at) : ""].filter(Boolean).join(" · "))}</small>` : ""}</span></li>`).join("")}</ol>`;
// Shrinks the headline text in small steps (to 77%, or 85% on phones) until the list fits; false if it never does.
function fitList(ol) {
  const panel = ol?.closest(".bx-panel"); if (!panel) return true;
  const floor = ol.clientWidth < 460 ? 0.85 : 0.77; // phones: shrink a little, then split
  for (let fs = 1; fs >= floor; fs -= 0.04) { panel.style.setProperty("--fs", fs.toFixed(2)); if (ol.scrollHeight <= ol.clientHeight + 1) return true; }
  return false;
}
// Splits a set's headlines into screens that each fit in full, measured on a hidden list in the
// real layout, so viewers only ever see the final screen.
function paginate(items) {
  const pages = []; let rest = items.slice();
  while (rest.length) {
    let n = rest.length;
    for (; n > 1; n--) { const ol = seqEl().querySelector(".bx-list"); if (!ol) break; ol.outerHTML = listHtml(rest.slice(0, n), 0, 1000, true); if (fitList(seqEl().querySelector(".bx-list"))) break; }
    pages.push(rest.slice(0, n)); rest = rest.slice(n);
  }
  // No lone headline on the last screen: even out 4 + 1 as 3 + 2.
  const k = pages.length;
  if (k > 1 && pages[k - 1].length === 1 && pages[k - 2].length > 2) pages[k - 1].unshift(pages[k - 2].pop());
  return pages;
}
async function newsUpdate(tok, bulletin, over = null) {
  const sets = over?.sets || pickSets(), per = (feed.seq?.setSeconds || 7) * 1000;
  if (!sets.length) return;
  const stop = score({ sting: true, bed: Infinity }); // the bed runs until the segment ends, however long she reads
  const label = over?.label || (bulletin ? tr("BULLETIN") : tr("NEWS UPDATE"));
  // Title card.
  if (!await swapSeq(tok, "nu", `${STUDIO}<span class="bx-card"><span class="bx-k"><span class="pulse"></span>RAISINA WIRE · ${esc(tr("LIVE"))}</span>
    <b class="bx-big">${esc(over?.card || label)}${bulletin ? ` <em>${esc(hourLabel())}</em>` : ""}</b><span class="bx-line"></span>
    <span class="bx-meta">${esc(dateNow())} · ${esc(clockNow())} IST</span></span>`)) return stop(0.3);
  // The anchor introduces it from a window beside the title card.
  const al = feed.anchors?.lines, aLine = !anchorsOn() ? null : over ? al?.headlines : bulletin ? al?.bulletin : al?.news;
  if (aLine) { root.classList.add("anchor-pip"); anchor.shot("pip", { key: aLine.anchor, roster: feed.anchors.roster }); }
  const ok = (await Promise.all([wait(3000, tok), aLine ? hello(aLine.anchor, tok).then(h => h && anchor.say(aLine, () => tok === seqToken)) : true])).every(Boolean);
  const unpip = () => { if (aLine) { anchor.hide(); root.classList.remove("anchor-pip"); } };
  if (!ok) { unpip(); return stop(0.3); }
  for (let i = 0; i < sets.length; i++) {
    const st = sets[i], items = (st.items || []).slice(0, 5), slot = Math.max(700, (per - 1000) / Math.max(items.length, 1));
    const pic = st.markets ? [] : setPic(st, i);
    const prog = sets.map((_, k) => `<i class="${k < i ? "done" : k === i ? "on" : ""}"${k === i ? ` style="--t:${per}ms"` : ""}></i>`).join("");
    const body = st.markets
      ? `<span class="bx-mkts">${st.markets.map((q, k) => `<span class="bx-mkt" style="--i:${k}"><small>${esc(tr(q.label))}</small><b>${Number(q.value).toLocaleString(LOCALE, { maximumFractionDigits: q.value < 100 ? 2 : 0 })}</b><em class="${q.pct >= 0 ? "up" : "down"}">${q.pct >= 0 ? "▲" : "▼"} ${Math.abs(q.pct ?? 0).toFixed(2)}%</em></span>`).join("")}</span>`
      : listHtml(items, 0, slot, true); // measured hidden first, then drawn once (no flicker)
    if (!await cover(tok)) return stop(0.3);
    if (i === 0) unpip();
    showSeq("nu", `${STUDIO}${pic.length ? `<span class="bx-pic"><span class="bx-pic-i"${picStyle(pic)}></span></span>` : ""}
      <span class="bx-panel${pic.length ? "" : " wide"}"><span class="bx-head">
        <span class="bx-strap"><span class="bx-seg">${esc(label)}</span><span class="bx-topic${st.live ? " live" : ""}${st.pin ? " pin" : ""}">${st.live ? `<span class="pulse"></span>` : ""}${esc(tr(st.topic))}</span></span>
        <span class="bx-prog">${prog}</span></span>${body}</span>`);
    reveal();
    if (st.markets) { if (!await wait(per, tok)) return stop(0.3); continue; }
    // Every headline in full: the text steps down a little if it must, and if five still don't
    // fit (phones) the set splits into screens that share the set's time.
    // Live updates are long sentences: one to a screen, each for its reading time, at a steady
    // pace (rather than uneven splits). Other sets show together, split only if they must be.
    const pages = st.live && items.some(h => String(h.text).length > 110) ? items.map(h => [h]) : paginate(items);
    for (let pg = 0, start = 0; pg < pages.length; start += pages[pg].length, pg++) {
      const n = pages[pg].length, chars = pages[pg].reduce((t, h) => t + String(h.text).length, 0);
      // Its share of the set's time, but never less than it takes to read the screen.
      const ms = pages.length > 1 ? Math.min(9000, Math.max(per * n / items.length, 1500 + chars * 22)) : per;
      const ol = seqEl().querySelector(".bx-list");
      if (ol) { ol.outerHTML = listHtml(pages[pg], start, Math.max(600, (ms - 900) / n)); fitList(seqEl().querySelector(".bx-list")); }
      // The anchor reads the headlines (each highlighted as she reads it) when they're recorded
      // and the sound is on; the screen stays up for as long as she takes.
      const reads = feed.anchors?.reads || {}, voiced = anchorsOn() && engaged && wantSound && pages[pg].every(h => reads[h.text]);
      if (voiced) {
        const list = seqEl().querySelector(".bx-list"), rows = [...(list?.querySelectorAll("li") || [])];
        list?.classList.add("voiced");
        if (!await wait(700, tok)) return stop(0.3);
        for (let k = 0; k < pages[pg].length; k++) {
          const h = pages[pg][k];
          rows.forEach((r, j) => r.classList.toggle("reading", j === k));
          if (!await anchor.say({ text: h.text, audio: reads[h.text] }, () => tok === seqToken)) return stop(0.3);
          if (!await wait(250, tok)) return stop(0.3);
        }
        continue;
      }
      if (!await wait(ms, tok)) return stop(0.3);
    }
  }
  stop(0.8);
}
// The 5–7 second transition between explainers, four styles in rotation.
async function shortTransition(tok, next) {
  const v = ["coming", "flash", "ident", "slash"][shortCursor++ % 4];
  const ms = { coming: 6000, flash: 6200, ident: 5500, slash: 5200 }[v];
  const stop = score({ sting: true, bed: ms / 1000 - 1.6 });
  const cat = esc(next?.category || tr("Explainer")), title = esc(next?.title || "");
  if (!await cover(tok)) return stop(0.3);
  if (v === "coming") showSeq("coming", `<span class="cm-img"${bg(next?.thumb)}></span><span class="cm-shade"></span><span class="cm-text"><span class="cm-k">${esc(tr("Coming up"))}</span><span class="cm-cat">${cat}</span><b>${title}</b></span>${DOME("cm-dome")}`);
  if (v === "flash") {
    const heads = shuffle(feed.ticker.filter(t => t.kind !== "live")).slice(0, 3);
    showSeq("flash", `${heads.map((h, k) => `<span class="fl-h" style="--i:${k}"><small>${esc(h.source || "Raisina Wire")}</small><b>${esc(h.text)}</b></span>`).join("")}<span class="fl-next" style="--i:3"><small>${esc(tr("Next"))} · ${cat}</small><b>${title}</b></span>`);
  }
  if (v === "ident") showSeq("ident", `${TRI}<span class="id-mark">${DOME("id-dome")}<b>RAISINA <em>TV</em></b><span>${esc(tr("India’s strategic briefing"))} · ${esc(clockNow())} IST</span></span><span class="id-next"><small>${esc(tr("Next"))}</small>${title}</span>`);
  if (v === "slash") showSeq("slash", `<span class="sl-a"></span><span class="sl-b"></span><span class="sl-c"></span><span class="sl-text"><span class="sl-cat">${cat}</span><b>${title}</b></span>`);
  reveal();
  await wait(ms, tok); stop(0.5);
}
// The Raisina TV ident: the channel poster (its anchors, "The world. Decoded."), pushing in
// slowly with a sheen across it, about 2.6 s between the wipes. When TV starts it comes after the
// headlines, before the first explainer; then after every two explainers, just before the next
// one (after any News Update), so it is never seen twice in a row.
const IDENT = "/tv/raisina-tv-ident.webp";
let sincePoster = 0;
async function posterIdent(tok) {
  sincePoster = 0;
  const stop = score({ sting: true });
  if (!await swapSeq(tok, "poster", `<span class="ps-img" style="background-image:url('${IDENT}')"></span><span class="ps-shine"></span>`)) return stop(0.3);
  await wait(2600, tok); stop(0.5);
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
    const bl = anchorsOn() && feed.anchors.lines?.breaking;
    if (bl) { anchor.shot("cam", { key: bl.anchor, roster: feed.anchors.roster, pick: tr("BREAKING NEWS") }); await anchor.say(bl, () => tok === seqToken); anchor.hide(); if (tok !== seqToken) return; }
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
  const tok = ++seqToken;
  await cover(tok); // under the wipe, whatever was on air gives way
  hideSeq();
  if (mode === "ad") root.querySelector(".tv-ad").hidden = true;
  video.pause(); mode = "input"; inputOn = inp;
  // "We're bringing you live visuals of …", on camera, then the cut.
  const ll = anchorsOn() && feed.anchors.lines?.live;
  if (ll) {
    root.querySelector(".tv-lower").hidden = true; anchor.shot("cam", { key: ll.anchor, roster: feed.anchors.roster, pick: tr("LIVE") }); reveal();
    await anchor.say(ll, () => tok === seqToken && inputOn === inp);
    if (inputOn !== inp) return;
    await cover(tok); anchor.hide(); if (inputOn !== inp) return reveal();
  }
  const box = root.querySelector(".tv-input"), muted = !wantSound;
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
  lowerThird(tr("LIVE"), inp.title, { live: true, stay: true }); reveal();
  mediaSession(inp.title);
}
async function endInput() {
  inputOn = null; // ended: the wipe comes over the last of the live visuals
  await cover(seqToken);
  if (inputOn) return; // a new live input came on meanwhile (it takes over the screen and the wipe)
  anchor?.hide();
  const box = root.querySelector(".tv-input");
  box.hls?.destroy?.(); box.innerHTML = ""; box.hidden = true;
  root.querySelector(".tv-lower").hidden = true;
  // Back to the channel where it left off.
  mode = "story";
  if (!video.src) playStory(idx);
  else if (!paused) video.play().catch(() => {});
  reveal();
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
const ago = at => { const m = Math.round((Date.now() - Date.parse(at)) / 6e4); if (!(m >= 0)) return ""; return m < 2 ? tr("just now") : m < 60 ? `${m} ${tr("min ago")}` : `${Math.round(m / 60)} ${tr("hr ago")}`; };
// Breaking Headlines: the editor's breaking lines, then the newest across live coverage and the wire.
function breakingSets() {
  const now = new Date().toISOString(), seen = new Set();
  const items = [...feed.breaking.map(t => ({ text: t, at: now })), ...(feed.recent || []),
    ...(feed.recent?.length ? [] : feed.ticker.map(t => ({ text: t.text, source: t.source, at: t.at })))]
    .filter(h => h.text && !seen.has(h.text) && seen.add(h.text)).slice(0, 10);
  const sets = [];
  for (let i = 0; i < items.length; i += 5) sets.push({ topic: tr("BREAKING"), live: true, items: items.slice(i, i + 5) });
  return sets.filter(st => st.items.length >= 3);
}
// Opening TV (every time it's started): the stinger, Breaking Headlines introduced by the anchor,
// then the anchor's intro and the newest explainer.
async function opener() {
  const tok = ++seqToken;
  mode = "seq"; root.querySelector(".tv-lower").hidden = true;
  ls.set("rw-tv-last", Date.now());
  preload(feed.playlist[0]);
  await stinger(tok);
  const sets = breakingSets();
  if (tok === seqToken && sets.length) await newsUpdate(tok, false, { sets, label: tr("HEADLINES"), card: tr("BREAKING HEADLINES") });
  if (tok === seqToken) await posterIdent(tok);
  if (tok === seqToken) introStory(0);
}
export async function dockTV() {
  const slot = document.getElementById("tvSlot");
  if (slot) {
    build();
    root.classList.remove("mini"); document.body.classList.remove("tv-mini-on");
    if (root.parentElement !== slot) slot.append(root);
    if (mode === "idle") { if (armed) await (starting ||= startTV().finally(() => { starting = null; })); else showStart(); } // one start, however many redraws
    else if (!paused && mode === "story" && video.paused && !document.hidden) video.play().catch(() => {});
    return;
  }
  if (root && mode !== "idle" && engaged && !paused) {
    root.classList.add("mini"); document.body.classList.add("tv-mini-on");
    if (root.parentElement !== document.body) document.body.append(root);
  } else if (root && mode !== "idle") stopTV();
}
let starting = null;
async function startTV() {
  startedAt = Date.now();
  lastBulletin = new Date(Date.now() + 5.5 * 3600e3).getUTCHours(); // no bulletin the moment TV opens
  await load();
  if (!feed || !feed.on) return offAir(true);
  offAir(false);
  renderClock(); clearInterval(clockTimer); clockTimer = setInterval(renderClock, 15e3);
  // Every 10 seconds: new explainers, the ticker, break-ins and the live input.
  clearInterval(pollTimer); pollTimer = setInterval(() => { if (!document.hidden && mode !== "idle") { load(); if (!paused) ls.set("rw-tv-last", Date.now()); } }, 10e3);
  root.querySelector(".tv-start").hidden = true;
  applyMute(); syncSound();
  // Viewers start with the opener, then the newest explainer, going back in time.
  const fresh = feed.playlist.length && feed.seq?.stinger !== false;
  syncInput();
  if (inputOn) return; // a live input is on air: viewers join it straight away
  if (fresh && !(feed.force && Date.now() - Date.parse(feed.force.at) < 120e3)) opener(); else introStory(0);
}
export function stopTV() {
  if (!root) return;
  flushWatch();
  ++seqToken; hideSeq(); anchor?.hide();
  if (inputOn) { const box = root.querySelector(".tv-input"); box.hls?.destroy?.(); box.innerHTML = ""; box.hidden = true; inputOn = null; }
  video.pause(); video.removeAttribute("src"); video.load();
  if (paused) setPaused(false);
  mode = "idle"; engaged = false; wantSound = false; armed = false; helloWho = ""; // a fresh start says hello again
  clearInterval(pollTimer); clearInterval(clockTimer);
  root.classList.remove("mini"); document.body.classList.remove("tv-mini-on");
  root.remove();
}

/* ---------- The preview on the home page ---------- */
// No autoplay: the newest explainer's picture with a play button; a tap starts Raisina TV with sound.
export async function mountPreview(host) {
  const f = await loadTV(); if (!f?.on || !f.playlist.length || !host.isConnected) { host.hidden = true; return; }
  const v = f.playlist[0];
  host.hidden = false;
  host.innerHTML = `<a class="tv-preview" href="/tv" aria-label="${esc(tr("Watch Raisina TV live"))}">
    <span class="tvp-media">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : ""}
      <span class="tv-live"><span class="pulse"></span>LIVE</span><span class="tvp-logo">${markDome("tv-dome", 4)}<b>Raisina TV</b></span><span class="tvp-play">${ICONS.play}</span></span>
    <span class="tvp-body"><span class="tvp-k">${esc(tr("On Raisina TV now"))}</span><b>${esc(v.title)}</b><span class="tvp-go">${ICONS.play}<span>${esc(tr("Watch live"))}</span></span></span></a>`;
}

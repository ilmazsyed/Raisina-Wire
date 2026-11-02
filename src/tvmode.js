// TV mode (/t): Raisina TV for smart-TV browsers, without an app. The channel fills the screen;
// one press of OK starts the channel with sound and goes full screen (TV browsers need one press before they
// allow sound); the remote's arrows, OK, Play/Pause and Back work the controls. A small QR code
// in the corner opens what is on screen on a phone. The screen is kept awake, and the page
// refreshes itself every few hours so a TV left on all day stays smooth.
import { tr, lang, withLang } from "./i18n.js";
import { tvStatus, tvControl, tvStart } from "./tv.js";
import { qrSvg } from "./qr.js";
import { markDome } from "./brand.js";
import * as music from "./tvaudio.js";

const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LANGS = [["en", "EN"], ["hi", "हिं"], ["bn", "বাং"]];
const tvPath = l => (l === "en" ? "/t" : `/${l}/t`);
const RESTART_AFTER = 12 * 3600e3;   // within this, a refreshed TV page starts again without the card
const REFRESH_EVERY = 4 * 3600e3;    // quiet page refresh for TVs left on all day

// Smart-TV browsers (Samsung, LG, Sony, Fire TV, Android TV, Hisense, Panasonic, Philips…).
export const isSmartTV = () => /SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|BRAVIA|HbbTV|\bAFT[A-Z]|CrKey|GoogleTV|Android ?TV|VIDAA|Hisense|Viera|PhilipsTV|NETTV|Roku/i.test(navigator.userAgent) && !/Mobile|Watch/i.test(navigator.userAgent);
export const shortAddress = () => `${location.host}${tvPath(lang)}`;

export function tvModeHTML() {
  return `<section class="tvm" id="tvm">
    <div class="tvm-stage"><div id="tvSlot" class="tv-slot"></div><div class="tvm-qr" id="tvmQr" hidden></div></div>
    <div class="tvm-bar" id="tvmBar" role="toolbar" aria-label="${esc(tr("Raisina TV"))}" hidden>
      <button type="button" data-tvm="pause"><span class="tvm-ic">❚❚</span><span class="tvm-t">${esc(tr("Pause"))}</span></button>
      <button type="button" data-tvm="sound"><span class="tvm-ic">🔊</span><span class="tvm-t">${esc(tr("Sound"))}</span></button>
      <span class="tvm-langs">${LANGS.map(([l, t]) => `<a href="${tvPath(l)}" data-lang="${l}" lang="${l}"${l === lang ? ' class="on" aria-current="true"' : ""}>${t}</a>`).join("")}</span>
      <button type="button" data-tvm="exit"><span class="tvm-ic">✕</span><span class="tvm-t">${esc(tr("Exit"))}</span></button>
    </div>
    <div class="tvm-start" id="tvmStart">
      <div class="tvm-card">
        <span class="tvm-brand"><span class="tvm-app">${markDome("tvm-dome", 4)}<span class="tvm-tri"><i></i><i></i><i></i></span></span><b>RAISINA <em>TV</em></b><span class="tvm-live"><i></i>LIVE</span></span>
        <button type="button" class="tvm-go" data-tvm="start">${esc(tr("Press OK to start"))}</button>
        <small>${esc(tr("Sound on and full screen. Use the arrows and OK on your remote."))}</small>
      </div>
    </div>
  </section>`;
}

let active = null;
export function unmountTVMode() {
  if (!active) return;
  active.stop();
  active = null;
}
export function mountTVMode({ navigate }) {
  unmountTVMode();
  document.body.classList.add("tvmode");
  const tvm = document.getElementById("tvm"), bar = tvm.querySelector("#tvmBar"), card = tvm.querySelector("#tvmStart"), qr = tvm.querySelector("#tvmQr");
  const timers = [], loadedAt = Date.now();
  let barTimer = 0, lock = null, started = false, lastQr = "";

  const items = () => [...bar.querySelectorAll("button, a")];
  function labels() {
    const st = tvStatus();
    bar.querySelector('[data-tvm="pause"] .tvm-t').textContent = tr(st.paused ? "Play" : "Pause");
    bar.querySelector('[data-tvm="pause"] .tvm-ic').textContent = st.paused ? "▶" : "❚❚";
    bar.querySelector('[data-tvm="sound"] .tvm-ic').textContent = st.muted ? "🔇" : "🔊";
  }
  function showBar() {
    if (!started) return;
    bar.hidden = false; tvm.classList.add("bar-on"); labels();
    if (!bar.contains(document.activeElement)) items()[0]?.focus();
    clearTimeout(barTimer);
    barTimer = setTimeout(() => { if (!tvStatus().paused) hideBar(); }, 5000);
  }
  function hideBar() { bar.hidden = true; tvm.classList.remove("bar-on"); if (bar.contains(document.activeElement)) document.activeElement.blur(); }
  function move(d) {
    const list = items(), i = list.indexOf(document.activeElement);
    list[Math.min(Math.max(i < 0 ? 0 : i + d, 0), list.length - 1)]?.focus();
  }
  async function wake() { try { lock = await navigator.wakeLock?.request("screen"); } catch { lock = null; } }
  async function start(auto = false) {
    if (started) return;
    started = true; card.hidden = true;
    if (!auto) { try { await document.documentElement.requestFullscreen?.({ navigationUI: "hide" }); } catch { /* not allowed here */ } }
    tvStart(); // the press of OK lets TV play with sound
    ls.set("rw-tvm-started", Date.now());
    wake(); renderQr();
    if (!auto) showBar();
  }
  // After the page refreshes itself, start again without the card when the TV still allows sound.
  async function resume() {
    if (Date.now() - ls.get("rw-tvm-started", 0) > RESTART_AFTER) return;
    const ctx = music.audio();
    try { await ctx?.resume(); } catch { /* blocked */ }
    if (ctx?.state === "running") start(true);
  }
  function renderQr() {
    const st = tvStatus();
    qr.hidden = !started || !st.qr;
    if (qr.hidden) return;
    const url = st.now ? `${location.origin}${withLang("/tv")}?v=${encodeURIComponent(st.now.id)}` : `${location.origin}${withLang("/")}`;
    if (url === lastQr) return;
    lastQr = url;
    qr.innerHTML = `${qrSvg(url, { label: tr("QR code") })}<span>${esc(tr(st.now ? "Scan to watch on your phone" : "Scan for the latest on Raisina Wire"))}</span>`;
  }

  const BACK = new Set(["Escape", "Backspace", "GoBack", "BrowserBack"]);
  const PLAY = new Set(["MediaPlayPause", "MediaPlay", "MediaPause"]);
  function onKey(e) {
    const k = e.key, c = e.keyCode;
    if (!started) {
      if (k === "Enter" || k === " " || c === 13 || PLAY.has(k) || c === 415) { e.preventDefault(); start(); }
      return;
    }
    if (PLAY.has(k) || c === 415 || c === 19 || c === 179) { e.preventDefault(); tvControl("pause"); showBar(); return; }
    if (BACK.has(k) || c === 10009 || c === 461) { if (!bar.hidden) { e.preventDefault(); hideBar(); } return; }
    if (k.startsWith("Arrow") || k === "Enter") {
      if (bar.hidden) { e.preventDefault(); showBar(); return; } // the first press only brings the controls back
      if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); move(k === "ArrowRight" ? 1 : -1); }
      showBar();
    }
  }
  function onClick(e) {
    const b = e.target.closest("[data-tvm]"); if (!b) return;
    const k = b.dataset.tvm;
    if (k === "start") return start();
    if (k === "pause") tvControl("pause");
    if (k === "sound") tvControl("sound");
    if (k === "exit") {
      try { sessionStorage.setItem("rw-web", "1"); } catch { /* private mode */ }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      return navigate("/tv");
    }
    labels(); showBar();
  }
  const onMove = () => showBar();
  const onVis = () => { if (!document.hidden && started) wake(); };

  document.addEventListener("keydown", onKey, true);
  tvm.addEventListener("click", onClick);
  tvm.addEventListener("pointermove", onMove);
  document.addEventListener("visibilitychange", onVis);
  timers.push(setInterval(renderQr, 2000));
  // The quiet refresh: only between explainers' starts, never during a sequence or an ad.
  timers.push(setInterval(() => {
    const st = tvStatus();
    if (Date.now() - loadedAt > REFRESH_EVERY && st.mode === "story" && !st.seq && !st.paused && !document.hidden) location.reload();
  }, 60e3));
  card.querySelector(".tvm-go").focus({ preventScroll: true });
  resume();

  active = {
    stop() {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVis);
      timers.forEach(clearInterval); clearTimeout(barTimer);
      lock?.release?.().catch(() => {});
      document.body.classList.remove("tvmode");
    }
  };
}

// "Watch on your TV": the short address, three ways to get Raisina TV onto a TV, and a QR code.
export function openWatchOnTV() {
  let d = document.getElementById("tvOnDialog");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "tvOnDialog"; d.className = "tvon glass";
    document.body.append(d);
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
  }
  const addr = shortAddress();
  d.innerHTML = `<div class="tvon-in">
    <button type="button" class="tvon-x" data-close aria-label="${esc(tr("Close"))}">✕</button>
    <span class="kicker">${esc(tr("Raisina TV"))} · LIVE</span>
    <h2>${esc(tr("Watch Raisina TV on your TV"))}</h2>
    <p class="tvon-k">${esc(tr("On your TV's web browser, go to"))}</p>
    <p class="tvon-addr" data-no-tr>${esc(addr)}</p>
    <p class="tvon-note">${esc(tr("It opens in TV mode: full screen, with the remote."))}</p>
    <div class="tvon-grid">
      <ol class="tvon-ways">
        <li><b>${esc(tr("Smart TV"))}</b><span>${esc(tr("Samsung, LG, Sony and most TVs: open the web browser and type the address above."))}</span></li>
        <li><b>${esc(tr("Chromecast or Google TV"))}</b><span>${esc(tr("In Chrome on a computer, open Raisina TV, then menu → Cast → Cast tab."))}</span></li>
        <li><b>${esc(tr("Apple TV or an AirPlay TV"))}</b><span>${esc(tr("On iPhone or Mac, turn on Screen Mirroring and open Raisina TV in Safari."))}</span></li>
      </ol>
      <figure class="tvon-qr">${qrSvg(`${location.origin}${withLang("/tv")}`, { label: tr("QR code") })}<figcaption>${esc(tr("Scan to watch on a phone"))}</figcaption></figure>
    </div>
  </div>`;
  d.showModal();
}

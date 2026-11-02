// TV mode (/t): Raisina TV for smart-TV browsers, without an app, laid out like a streaming
// service. The live channel is the hero (top right, playing); below it, rows the remote browses:
// breaking headlines, live coverage, the latest explainers, shorts, a row per category and
// markets. Moving onto a card shows its picture, title and summary in the hero; OK plays an
// explainer or short full screen, or opens a headline or live coverage to read. "Watch live" (or
// a minute without a key press) puts the channel full screen; Back returns to the home screen.
// One press of OK on the start card starts the channel with sound (TV browsers need one press
// before they allow sound). Built for weak TV processors: one video at a time, small pictures,
// and only movement and fades (no blur, no colour animation).
import { tr, lang, withLang } from "./i18n.js";
import { tvStatus, tvControl, tvStart, loadTV, tvFeed } from "./tv.js";
import { qrSvg } from "./qr.js";
import { markDome } from "./brand.js";
import * as music from "./tvaudio.js";

const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LANGS = [["en", "EN"], ["hi", "हिं"], ["bn", "বাং"]];
const tvPath = l => (l === "en" ? "/t" : `/${l}/t`);
const RESTART_AFTER = 12 * 3600e3;   // within this, a refreshed TV page starts again without the card
const REFRESH_EVERY = 4 * 3600e3;    // quiet page refresh for TVs left on all day
const IDLE_TO_LIVE = 60e3;           // a minute without a key press on the home screen: full-screen live
const LANGQ = lang !== "en" ? `?lang=${lang}` : "";

// Smart-TV browsers (Samsung, LG, Sony, Fire TV, Android TV, Hisense, Panasonic, Philips…).
export const isSmartTV = () => /SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|BRAVIA|HbbTV|\bAFT[A-Z]|CrKey|GoogleTV|Android ?TV|VIDAA|Hisense|Viera|PhilipsTV|NETTV|Roku/i.test(navigator.userAgent) && !/Mobile|Watch/i.test(navigator.userAgent);
export const shortAddress = () => `${location.host}${tvPath(lang)}`;

// Pictures: the small WebP copies for cards, the medium ones for the hero (the .jpg is the fallback).
const pic = (u, size) => (u && /^\/videos\/[\w.-]+\.jpg$/.test(u) ? u.replace(/\.jpg$/, `-${size}.webp`) : u || "");
const ago = at => { const m = Math.round((Date.now() - Date.parse(at)) / 6e4); if (!(m >= 0)) return ""; return m < 2 ? tr("just now") : m < 60 ? `${m} ${tr("min ago")}` : m < 1440 ? `${Math.round(m / 60)} ${tr("hr ago")}` : ""; };
const dur = s => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "");

export function tvModeHTML() {
  return `<section class="tvm home" id="tvm">
    <div class="tvh-hero">
      <div class="tvh-bg"><i class="tvh-bg-a"></i><i class="tvh-bg-b"></i></div>
      <div class="tvh-info" id="tvhInfo"></div>
      <div class="tvh-btns" id="tvhBtns">
        <button type="button" data-hb="live" class="tvh-btn primary"><span class="tvm-ic">▶</span>${esc(tr("Watch live"))}</button>
        <button type="button" data-hb="sound" class="tvh-btn"><span class="tvm-ic">🔊</span><span class="tvh-bt">${esc(tr("Sound"))}</span></button>
        ${LANGS.map(([l, t]) => `<a href="${tvPath(l)}" data-lang="${l}" lang="${l}" data-hb="lang" class="tvh-btn lang${l === lang ? " on" : ""}">${t}</a>`).join("")}
      </div>
    </div>
    <div class="tvm-stage"><div id="tvSlot" class="tv-slot"></div><div class="tvm-qr" id="tvmQr" hidden></div></div>
    <div class="tvh-rows" id="tvhRows"><div class="tvh-rail" id="tvhRail"></div></div>
    <div class="tvm-bar" id="tvmBar" role="toolbar" aria-label="${esc(tr("Raisina TV"))}" hidden>
      <button type="button" data-tvm="home"><span class="tvm-ic">⌂</span><span class="tvm-t">${esc(tr("Home"))}</span></button>
      <button type="button" data-tvm="pause"><span class="tvm-ic">❚❚</span><span class="tvm-t">${esc(tr("Pause"))}</span></button>
      <button type="button" data-tvm="sound"><span class="tvm-ic">🔊</span><span class="tvm-t">${esc(tr("Sound"))}</span></button>
      <span class="tvm-langs">${LANGS.map(([l, t]) => `<a href="${tvPath(l)}" data-lang="${l}" lang="${l}"${l === lang ? ' class="on" aria-current="true"' : ""}>${t}</a>`).join("")}</span>
      <button type="button" data-tvm="exit"><span class="tvm-ic">✕</span><span class="tvm-t">${esc(tr("Exit"))}</span></button>
    </div>
    <div class="tvh-vod" id="tvhVod" hidden></div>
    <div class="tvh-read" id="tvhRead" hidden></div>
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
  const tvm = document.getElementById("tvm"), $ = s => tvm.querySelector(s);
  const bar = $("#tvmBar"), card = $("#tvmStart"), qr = $("#tvmQr"), rail = $("#tvhRail"), rowsBox = $("#tvhRows");
  const info = $("#tvhInfo"), btns = $("#tvhBtns"), vod = $("#tvhVod"), reader = $("#tvhRead");
  const timers = [], loadedAt = Date.now();
  let barTimer = 0, lock = null, started = false, lastQr = "", view = "start", lastKey = Date.now(), dead = false;
  let rows = [], focus = { r: -1, c: 0 }; const colMem = {};
  let media = [], live = [];

  /* ---------- rows ---------- */
  async function loadData() {
    const [m, l, f] = await Promise.all([
      fetch(`/api/media${LANGQ}`).then(r => r.json()).then(d => d.items || []).catch(() => media),
      fetch(`/api/live${LANGQ}`).then(r => r.json()).then(d => d.items || []).catch(() => live),
      loadTV().catch(() => null)
    ]);
    media = m; live = l;
    const feed = f || tvFeed() || {};
    const films = media.filter(x => x.mediaType === "video"), shorts = media.filter(x => x.mediaType === "short");
    const heads = (feed.recent?.length ? feed.recent : (feed.ticker || []).map(t => ({ text: t.text, source: t.source, at: t.at })))
      .filter(h => h.text).slice(0, 12).map(h => ({ kind: "head", title: h.text, sub: [h.source, h.at ? ago(h.at) : ""].filter(Boolean).join(" · "), img: h.img || "", live: !!h.live }));
    const byCat = {};
    films.forEach(v => (byCat[v.category || "More"] ||= []).push(v));
    const vid = v => ({ kind: "video", id: v.id, title: v.title, sub: v.category || tr("Explainer"), desc: v.description || "", img: v.thumbnailUrl, src: v.mediaUrl });
    rows = [
      heads.length && { key: "heads", title: tr("Breaking headlines"), type: "head", items: heads },
      live.length && { key: "live", title: tr("Live coverage"), type: "head", items: live.map(c => ({ kind: "live", slug: c.slug, title: c.title, sub: tr("Live coverage"), desc: c.summary || "", img: "", live: true })) },
      films.length && { key: "latest", title: tr("Latest explainers"), type: "video", items: films.slice(0, 14).map(vid) },
      shorts.length && { key: "shorts", title: tr("Shorts"), type: "short", items: shorts.slice(0, 16).map(s => ({ ...vid(s), kind: "short" })) },
      ...Object.entries(byCat).filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length).map(([cat, l]) => ({ key: `cat:${cat}`, title: tr(cat), type: "video", items: l.map(vid) })),
      feed.markets?.length && { key: "markets", title: tr("Markets"), type: "mkt", items: feed.markets.map(q => ({ kind: "mkt", title: tr(q.label), value: q.value, pct: q.pct })) }
    ].filter(Boolean);
    renderRows();
  }
  function cardHTML(it, r, c, type) {
    const at = `data-r="${r}" data-c="${c}"`;
    if (type === "mkt") return `<button type="button" class="tvh-card mkt" ${at}><small>${esc(it.title)}</small><b>${Number(it.value).toLocaleString("en-IN", { maximumFractionDigits: it.value < 100 ? 2 : 0 })}</b><em class="${it.pct >= 0 ? "up" : "down"}">${it.pct >= 0 ? "▲" : "▼"} ${Math.abs(it.pct ?? 0).toFixed(2)}%</em></button>`;
    if (type === "head") return `<button type="button" class="tvh-card head${it.live ? " is-live" : ""}" ${at}><b>${esc(it.title)}</b><small>${it.live ? `<span class="tvh-livetag"><i></i>${esc(tr("LIVE"))}</span>` : ""}${esc(it.sub)}</small></button>`;
    return `<button type="button" class="tvh-card ${type}" ${at}><img src="${esc(pic(it.img, "sm"))}" data-full="${esc(it.img || "")}" alt="" loading="${c < 6 ? "eager" : "lazy"}" decoding="async"><span class="tvh-cap"><small>${esc(it.sub)}</small><b>${esc(it.title)}</b></span></button>`;
  }
  function renderRows() {
    rail.innerHTML = rows.map((row, r) => `<section class="tvh-row ${row.type}" data-r="${r}"><h3>${esc(row.title)}</h3><div class="tvh-track">${row.items.map((it, c) => cardHTML(it, r, c, row.type)).join("")}</div></section>`).join("");
    if (focus.r >= rows.length) focus = { r: rows.length - 1, c: 0 };
    applyFocus(false);
  }
  // Pictures that fail fall back to the full-size picture, then to the card's own colour.
  rail.addEventListener("error", e => { const im = e.target; if (im.tagName !== "IMG") return; if (im.dataset.full && im.src.indexOf(im.dataset.full) < 0) im.src = im.dataset.full; else im.remove(); }, true);

  /* ---------- focus and the hero ---------- */
  const heroBtns = () => [...btns.querySelectorAll(".tvh-btn")];
  let bgFlip = false, bgNow = "";
  function setBg(u) {
    if (u === bgNow) return; bgNow = u;
    const layers = tvm.querySelectorAll(".tvh-bg i"), next = layers[bgFlip ? 0 : 1], prev = layers[bgFlip ? 1 : 0]; bgFlip = !bgFlip;
    next.style.backgroundImage = u ? `url('${String(u).replace(/'/g, "%27")}'),url('${String(u).replace(/\.\w+$/, ".jpg").replace(/'/g, "%27")}')` : "";
    next.classList.add("on"); prev.classList.remove("on");
  }
  function heroLive() {
    const st = tvStatus(), now = st.now;
    tvm.classList.add("hero-live");
    info.innerHTML = `<span class="tvh-k live"><i></i>${esc(tr("On Raisina TV now"))}</span><h1>${esc(now?.title || tr("Raisina TV"))}</h1><p>${esc(now?.description || tr("India’s strategic briefing"))}</p>`;
    setBg("");
  }
  function heroCard(it) {
    tvm.classList.remove("hero-live");
    if (it.kind === "mkt") { info.innerHTML = `<span class="tvh-k">${esc(tr("Markets"))}</span><h1>${esc(it.title)}</h1><p class="tvh-big">${Number(it.value).toLocaleString("en-IN", { maximumFractionDigits: 2 })} <em class="${it.pct >= 0 ? "up" : "down"}">${it.pct >= 0 ? "▲" : "▼"} ${Math.abs(it.pct ?? 0).toFixed(2)}%</em></p>`; setBg(""); return; }
    const hint = it.kind === "video" || it.kind === "short" ? tr("OK to play") : tr("OK to read");
    info.innerHTML = `<span class="tvh-k${it.live ? " live" : ""}">${it.live ? "<i></i>" : ""}${esc(it.sub)}</span><h1${it.title.length > 110 ? ' class="long"' : ""}>${esc(it.title)}</h1>${it.desc ? `<p>${esc(it.desc)}</p>` : ""}<span class="tvh-hint">${esc(hint)}</span>`;
    setBg(it.img ? pic(it.img, "md") : "");
  }
  function applyFocus(scroll = true) {
    tvm.querySelectorAll(".tvh-card.focus, .tvh-btn.focus").forEach(e => e.classList.remove("focus"));
    if (focus.r < 0) {
      const b = heroBtns()[focus.c] || heroBtns()[0]; b?.classList.add("focus");
      rail.style.transform = "translateY(0)"; heroLive(); return;
    }
    const row = rows[focus.r]; if (!row) return;
    focus.c = Math.min(Math.max(focus.c, 0), row.items.length - 1);
    const sec = rail.querySelector(`.tvh-row[data-r="${focus.r}"]`), el = sec?.querySelector(`.tvh-card[data-c="${focus.c}"]`);
    if (!el) return;
    el.classList.add("focus");
    // Keep the card in view: its row slides sideways, the rows slide up.
    const track = sec.querySelector(".tvh-track"), pad = innerWidth * 0.045;
    const maxX = Math.max(0, track.scrollWidth - innerWidth + pad * 2);
    const x = Math.min(Math.max(el.offsetLeft - pad, 0), maxX);
    track.style.transform = `translateX(${-x}px)`;
    rail.style.transform = `translateY(${-sec.offsetTop}px)`;
    heroCard(row.items[focus.c]);
    if (!scroll) return;
  }
  function moveFocus(dr, dc) {
    if (dr) {
      if (focus.r >= 0) colMem[focus.r] = focus.c;
      const r = Math.min(Math.max(focus.r + dr, -1), rows.length - 1);
      if (r === focus.r) return;
      focus = { r, c: r < 0 ? 0 : colMem[r] ?? 0 };
    } else {
      const n = focus.r < 0 ? heroBtns().length : rows[focus.r].items.length;
      focus.c = Math.min(Math.max(focus.c + dc, 0), n - 1);
    }
    applyFocus();
  }
  function activate() {
    if (focus.r < 0) {
      const b = heroBtns()[focus.c];
      if (b?.dataset.hb === "live") return goLive();
      if (b?.dataset.hb === "sound") { tvControl("sound"); soundLabel(); return; }
      if (b?.dataset.hb === "lang") return b.click();
      return;
    }
    const it = rows[focus.r]?.items[focus.c]; if (!it) return;
    if (it.kind === "video" || it.kind === "short") return playVod(it);
    if (it.kind === "head" || it.kind === "live") return openRead(it);
  }
  function soundLabel() {
    const m = tvStatus().muted, b = btns.querySelector('[data-hb="sound"]');
    if (b) { b.querySelector(".tvm-ic").textContent = m ? "🔇" : "🔊"; b.querySelector(".tvh-bt").textContent = tr(m ? "Sound off" : "Sound on"); }
  }

  /* ---------- full-screen live ---------- */
  const barItems = () => [...bar.querySelectorAll("button, a")];
  function labels() {
    const st = tvStatus();
    bar.querySelector('[data-tvm="pause"] .tvm-t').textContent = tr(st.paused ? "Play" : "Pause");
    bar.querySelector('[data-tvm="pause"] .tvm-ic').textContent = st.paused ? "▶" : "❚❚";
    bar.querySelector('[data-tvm="sound"] .tvm-ic').textContent = st.muted ? "🔇" : "🔊";
  }
  function showBar() {
    if (view !== "live") return;
    bar.hidden = false; tvm.classList.add("bar-on"); labels();
    if (!bar.contains(document.activeElement)) barItems()[1]?.focus();
    clearTimeout(barTimer);
    barTimer = setTimeout(() => { if (!tvStatus().paused) hideBar(); }, 5000);
  }
  function hideBar() { bar.hidden = true; tvm.classList.remove("bar-on"); if (bar.contains(document.activeElement)) document.activeElement.blur(); }
  function barMove(d) { const list = barItems(), i = list.indexOf(document.activeElement); list[Math.min(Math.max(i < 0 ? 0 : i + d, 0), list.length - 1)]?.focus(); }
  function goLive() { view = "live"; tvm.classList.remove("home"); tvm.classList.add("full"); renderQr(); }
  function goHome() {
    hideBar(); view = "home"; lastKey = Date.now();
    tvm.classList.remove("full"); tvm.classList.add("home"); lastQr = ""; renderQr();
    if (tvStatus().paused) tvControl("pause");
    applyFocus(false); soundLabel();
  }

  /* ---------- an explainer or short, full screen ---------- */
  let wasPaused = false, vodTimer = 0;
  function playVod(it) {
    view = "vod"; wasPaused = tvStatus().paused;
    if (!wasPaused) tvControl("pause"); // one video at a time
    vod.hidden = false; vod.className = `tvh-vod ${it.kind}`;
    vod.innerHTML = `<video src="${esc(it.src)}" poster="${esc(pic(it.img, "md"))}" autoplay playsinline preload="auto"></video>
      <div class="tvh-vod-ui"><span class="tvh-k">${esc(it.sub)}</span><b>${esc(it.title)}</b><span class="tvh-prog"><i></i></span><span class="tvh-time"></span><small>${esc(tr("OK: pause · ◀ ▶: 10 seconds · Back: home"))}</small></div>`;
    const v = vod.querySelector("video"), bar_ = vod.querySelector(".tvh-prog i"), time = vod.querySelector(".tvh-time");
    v.addEventListener("timeupdate", () => { if (v.duration) { bar_.style.transform = `scaleX(${v.currentTime / v.duration})`; time.textContent = `${dur(v.currentTime)} / ${dur(v.duration)}`; } });
    v.addEventListener("ended", closeVod);
    v.play().catch(() => {});
    vodUi();
  }
  function vodUi() { vod.classList.add("ui"); clearTimeout(vodTimer); vodTimer = setTimeout(() => { const v = vod.querySelector("video"); if (v && !v.paused) vod.classList.remove("ui"); }, 4000); }
  function closeVod() {
    const v = vod.querySelector("video"); if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
    vod.hidden = true; vod.innerHTML = ""; clearTimeout(vodTimer);
    view = "home"; lastKey = Date.now();
    if (!wasPaused && tvStatus().paused) tvControl("pause");
  }

  /* ---------- a headline or live coverage, to read ---------- */
  let readY = 0;
  async function openRead(it) {
    view = "read"; readY = 0; reader.hidden = false;
    const url = it.kind === "live" ? `${location.origin}${withLang(`/coverage/${encodeURIComponent(it.slug)}`)}` : `${location.origin}${withLang("/live")}`;
    reader.innerHTML = `<div class="tvh-read-in"><div class="tvh-read-text" id="tvhReadText"><span class="tvh-k${it.live ? " live" : ""}">${it.live ? "<i></i>" : ""}${esc(it.sub)}</span><h1>${esc(it.title)}</h1>${it.desc ? `<p class="tvh-lead">${esc(it.desc)}</p>` : ""}<div class="tvh-ups"></div></div>
      <aside class="tvh-read-qr">${qrSvg(url, { label: tr("QR code") })}<span>${esc(tr("Scan to read on your phone"))}</span><small>${esc(tr("▲ ▼ to scroll · Back: home"))}</small></aside></div>`;
    if (it.kind === "live") {
      try {
        const d = await (await fetch(`/api/live/${encodeURIComponent(it.slug)}${LANGQ}`)).json();
        const box = reader.querySelector(".tvh-ups"); if (!box) return;
        box.innerHTML = (d.updates || []).slice(0, 12).map(u => `<div class="tvh-up"><time>${esc(ago(String(u.createdAt).includes("T") ? u.createdAt : `${String(u.createdAt).replace(" ", "T")}Z`) || "")}</time><p>${esc(String(u.body || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`|^#+\s*/gm, "").trim())}</p></div>`).join("");
      } catch { /* the headline stays */ }
    }
  }
  function scrollRead(d) {
    const t = reader.querySelector("#tvhReadText"); if (!t) return;
    const max = Math.max(0, t.scrollHeight - t.parentElement.clientHeight + 40);
    readY = Math.min(Math.max(readY + d * innerHeight * 0.25, 0), max);
    t.style.transform = `translateY(${-readY}px)`;
  }
  function closeRead() { reader.hidden = true; reader.innerHTML = ""; view = "home"; lastKey = Date.now(); }

  /* ---------- starting, sound, the QR, staying awake ---------- */
  async function wake() { try { lock = await navigator.wakeLock?.request("screen"); } catch { lock = null; } }
  async function start(auto = false) {
    if (started) return;
    started = true; card.hidden = true;
    if (!auto) { try { await document.documentElement.requestFullscreen?.({ navigationUI: "hide" }); } catch { /* not allowed here */ } }
    tvStart(); // the press of OK lets TV play with sound
    ls.set("rw-tvm-started", Date.now());
    wake(); lastKey = Date.now();
    if (auto) goLive(); else { view = "home"; focus = { r: -1, c: 0 }; applyFocus(false); setTimeout(soundLabel, 800); }
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
    qr.hidden = !started || !st.qr || view !== "live";
    if (qr.hidden) return;
    const url = st.now ? `${location.origin}${withLang("/tv")}?v=${encodeURIComponent(st.now.id)}` : `${location.origin}${withLang("/")}`;
    if (url === lastQr) return;
    lastQr = url;
    qr.innerHTML = `${qrSvg(url, { label: tr("QR code") })}<span>${esc(tr(st.now ? "Scan to watch on your phone" : "Scan for the latest on Raisina Wire"))}</span>`;
  }

  /* ---------- the remote ---------- */
  const BACK = new Set(["Escape", "Backspace", "GoBack", "BrowserBack"]);
  const PLAY = new Set(["MediaPlayPause", "MediaPlay", "MediaPause"]);
  const isOk = (k, c) => k === "Enter" || k === " " || c === 13;
  function onKey(e) {
    const k = e.key, c = e.keyCode, back = BACK.has(k) || c === 10009 || c === 461, play = PLAY.has(k) || c === 415 || c === 19 || c === 179;
    lastKey = Date.now();
    if (!started) { if (isOk(k, c) || play) { e.preventDefault(); start(); } return; }
    if (view === "vod") {
      const v = vod.querySelector("video"); e.preventDefault(); vodUi();
      if (back) return closeVod();
      if (isOk(k, c) || play) { if (v.paused) v.play().catch(() => {}); else v.pause(); return; }
      if (k === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 10);
      if (k === "ArrowRight") v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
      return;
    }
    if (view === "read") {
      e.preventDefault();
      if (back || isOk(k, c)) return closeRead();
      if (k === "ArrowDown") scrollRead(1);
      if (k === "ArrowUp") scrollRead(-1);
      return;
    }
    if (view === "live") {
      if (play) { e.preventDefault(); tvControl("pause"); showBar(); return; }
      if (back) { e.preventDefault(); if (!bar.hidden) hideBar(); else goHome(); return; }
      if (k.startsWith("Arrow") || isOk(k, c)) {
        if (bar.hidden) { e.preventDefault(); showBar(); return; } // the first press only brings the controls back
        if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); barMove(k === "ArrowRight" ? 1 : -1); }
        showBar();
      }
      return;
    }
    // the home screen
    if (play) { e.preventDefault(); tvControl("pause"); return; }
    if (back) { e.preventDefault(); if (focus.r >= 0) { focus = { r: -1, c: 0 }; applyFocus(); } return; }
    if (k === "ArrowUp") { e.preventDefault(); moveFocus(-1, 0); }
    else if (k === "ArrowDown") { e.preventDefault(); moveFocus(1, 0); }
    else if (k === "ArrowLeft") { e.preventDefault(); moveFocus(0, -1); }
    else if (k === "ArrowRight") { e.preventDefault(); moveFocus(0, 1); }
    else if (isOk(k, c)) { e.preventDefault(); activate(); }
  }
  // Pointer remotes (LG Magic Remote) and mice: pointing focuses, clicking chooses.
  function onClick(e) {
    lastKey = Date.now();
    const t = e.target.closest("[data-tvm], .tvh-card, .tvh-btn"); if (!t) return;
    if (t.dataset.tvm === "start") return start();
    if (t.classList.contains("tvh-card")) { focus = { r: +t.dataset.r, c: +t.dataset.c }; applyFocus(); return activate(); }
    if (t.classList.contains("tvh-btn")) { if (t.dataset.hb === "lang") return; focus = { r: -1, c: heroBtns().indexOf(t) }; e.preventDefault(); return activate(); }
    const k = t.dataset.tvm;
    if (k === "home") return goHome();
    if (k === "pause") tvControl("pause");
    if (k === "sound") tvControl("sound");
    if (k === "exit") {
      try { sessionStorage.setItem("rw-web", "1"); } catch { /* private mode */ }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      return navigate("/tv");
    }
    labels(); showBar();
  }
  const onMove = () => { lastKey = Date.now(); if (view === "live") showBar(); };
  const onVis = () => { if (!document.hidden && started) wake(); };

  document.addEventListener("keydown", onKey, true);
  tvm.addEventListener("click", onClick);
  tvm.addEventListener("pointermove", onMove);
  document.addEventListener("visibilitychange", onVis);
  timers.push(setInterval(renderQr, 2000));
  // The hero follows the channel while the hero buttons are focused.
  timers.push(setInterval(() => { if (view === "home" && focus.r < 0) heroLive(); }, 5000));
  // A minute without a key press on the home screen: the channel goes full screen.
  timers.push(setInterval(() => { if (started && view === "home" && Date.now() - lastKey > IDLE_TO_LIVE) goLive(); }, 5000));
  // New headlines, explainers and coverage every three minutes (the focused card stays put).
  timers.push(setInterval(() => { if (!dead && view !== "read") loadData(); }, 180e3));
  // The quiet refresh: only between explainers' starts, never during a sequence or an ad.
  timers.push(setInterval(() => {
    const st = tvStatus();
    if (Date.now() - loadedAt > REFRESH_EVERY && view === "live" && st.mode === "story" && !st.seq && !st.paused && !document.hidden) location.reload();
  }, 60e3));
  card.querySelector(".tvm-go").focus({ preventScroll: true });
  loadData();
  resume();

  active = {
    stop() {
      dead = true;
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVis);
      timers.forEach(clearInterval); clearTimeout(barTimer); clearTimeout(vodTimer);
      const v = vod.querySelector("video"); if (v) { v.pause(); v.removeAttribute("src"); }
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

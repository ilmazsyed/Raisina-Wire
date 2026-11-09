import "./style.css";
import "./tv.css";
import { mountTV } from "./tvplayer.js";
import { brandMark, fullLogo, BRAND } from "./brand.js";
import { WRITERS, writer, setGuestWriters } from "./writers.js";
import { ABOUT, LEGAL, LEGAL_ORDER, LEGAL_UPDATED } from "./legal.js";
import { lang, LOCALE, LANGUAGES, DEFAULT_LANG, stripLang, withLang, tr, ago, digits, loadLanguage, startTranslator, languageLinks } from "./i18n.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const IST = { timeZone: "Asia/Kolkata" };

const state = { articles: [], media: null, coverage: [], coverageAll: [], coverageLead: null, user: null, community: null, events: null, installPrompt: null, topics: [] };
// The five desks. Stories carry the English name as their category; the interface translates it.
const DESKS = ["Kolkata", "West Bengal", "India", "Probashi Bangali", "World"];
const DESK_SLUG = { Kolkata: "kolkata", "West Bengal": "west-bengal", India: "india", "Probashi Bangali": "probashi-bangali", World: "world" };
const deskOf = slug => DESKS.find(d => DESK_SLUG[d] === slug);
const deskHref = d => `/desk/${DESK_SLUG[d] || "world"}`;
const isWire = a => a?.kind === "rewrite" || a?.kind === "brief";
const kindLabel = a => a?.kind === "brief" ? "Brief" : a?.kind === "rewrite" ? "Rashtrix Wire" : "";

/* ---------- Formatting ---------- */
const toDate = d => new Date(String(d).length === 10 ? `${d}T00:00:00+05:30` : d);
const editionDate = d => toDate(d).toLocaleDateString(LOCALE, { ...IST, day: "numeric", month: "short", year: "numeric" });
const shortDate = d => toDate(d).toLocaleDateString(LOCALE, { ...IST, day: "numeric", month: "short" });
const clock = iso => iso ? new Date(iso).toLocaleTimeString(LOCALE, { ...IST, hour: "2-digit", minute: "2-digit", hour12: false }) : "";
const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ICON_CHECK = `<svg class="ck" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>`;
const ICON_LOCK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-ink)" stroke-width="2" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const ICON_REFRESH = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5"/></svg>`;
const ICON_INFO = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-ink)" stroke-width="2" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>`;
// Explainer and short covers have a small WebP copy (tools/thumbs.py); cards ask for it first.
const thumbImg = (src, eager = false) => src ? `<img class="img-cover" src="${esc(src)}" alt="" loading="${eager ? "eager" : "lazy"}" decoding="async" data-hide-on-error>` : "";
const img = (src, alt = "") => src ? `<img class="img-cover" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-hide-on-error>` : "";
// Wire rewrites, briefs and stories without a photo show a branded text card instead: the
// maroon jacket frame, the logo card and the desk, with the headline set large.
function textCard(a, { big = false } = {}) {
  return `<span class="text-card${big ? " big" : ""}" aria-hidden="true"><span class="tc-top"><img src="/brand/${big ? "logo-sm" : "logo-xs"}.webp" alt="" width="24" height="34"><span class="tc-desk">${esc(tr(a.category || ""))}</span>${kindLabel(a) ? `<span class="tc-kind">${esc(tr(kindLabel(a)))}</span>` : ""}</span><span class="tc-head">${esc(a.title)}</span><span class="tc-foot">RASHTRIX <b>24X7 NEWS</b></span></span>`;
}
// A story's picture, or its text card.
const pic = (a, opts) => a.image ? img(a.image) : textCard(a, opts);

/* ---------- Storage (per device conveniences only) ---------- */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
};
/* ---------- Audience: anonymous daily counts for the control room (src/audience.js) ----------
   Returning readers, app installs, reading time and where readers arrive from. The browser
   remembers only its first and last visit dates; the server keeps daily totals, nothing else. */
const beacon = b => { try { const body = JSON.stringify(b); if (!navigator.sendBeacon?.("/api/m", new Blob([body], { type: "application/json" }))) fetch("/api/m", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {}); } catch { /* never in the way */ } };
const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
const dayNum = d => Math.round(Date.parse(d) / 864e5);
const platformOf = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop";
const REFERRERS = [["whatsapp", /whatsapp|^wa\.me/], ["email", /^mail\.|outlook\.|webmail/], ["news", /news\.google/], ["facebook", /facebook\.|^fb\.|^m\.me$/], ["instagram", /instagram\./], ["x", /^t\.co$|twitter\.|^x\.com$/],
  ["linkedin", /linkedin\.|^lnkd\.in$/], ["telegram", /^t\.me$|telegram\./], ["youtube", /youtube\.|^youtu\.be$/], ["reddit", /reddit\./], ["google", /(^|\.)google\./], ["bing", /bing\.|duckduckgo\.|yahoo\./]];
function arrivalSource() {
  const tag = new URLSearchParams(location.search).get("utm_source");
  if (tag) { const t = tag.toLowerCase(); return ["twitter"].includes(t) ? "x" : t; }
  let host = "";
  try { const ref = new URL(document.referrer); host = ref.protocol === "android-app:" ? ref.hostname.replace(/^com\./, "") : ref.hostname.replace(/^www\./, ""); } catch { return "direct"; }
  if (!host || host === location.hostname) return "direct";
  return (REFERRERS.find(([, re]) => re.test(host)) || ["other"])[0];
}
function trackVisit() {
  const pending = store.get("rw-read-pending", null);
  if (pending) { beacon(pending); try { localStorage.removeItem("rw-read-pending"); } catch { /* storage off */ } }
  const today = istDay(), first = store.get("rw-first", null), last = store.get("rw-last-day", null);
  const src = arrivalSource(), tagged = new URLSearchParams(location.search).has("utm_source");
  let fresh = false; try { fresh = !sessionStorage.getItem("rw-arrived"); sessionStorage.setItem("rw-arrived", "1"); } catch { fresh = true; }
  if (fresh || tagged) beacon({ t: "arrive", src });
  if (tagged) { const u = new URL(location.href); [...u.searchParams.keys()].filter(k => k.startsWith("utm_")).forEach(k => u.searchParams.delete(k)); history.replaceState(history.state, "", u.pathname + u.search + u.hash); }
  if (last !== today) {
    const firstDay = first || today, monday = istDay(Date.parse(firstDay) - ((new Date(firstDay).getUTCDay() + 6) % 7) * 864e5);
    const week = Math.floor((dayNum(today) - dayNum(monday)) / 7), weekly = store.get("rw-last-week", -1) !== week;
    beacon({ t: "visit", returning: !!first, gap: last ? dayNum(today) - dayNum(last) : 0, app: isStandaloneApp(), lang,
      dev: /iPad|Tablet/i.test(navigator.userAgent) ? "tablet" : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop", ...(weekly ? { cohort: monday, week } : {}) });
    store.set("rw-last-day", today); store.set("rw-last-week", week); if (!first) store.set("rw-first", today);
  }
  // An installed app's first launch counts as an install (iPhone has no install event).
  if (isStandaloneApp() && !store.get("rw-installed", false)) { store.set("rw-installed", true); beacon({ t: "install", platform: platformOf() }); }
}
const isStandaloneApp = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// Reading time: seconds while the page is visible and the reader has moved in the last 30 s.
// The read in progress is also kept on the device, and sent on the next visit if the page was
// closed before it could be sent (phones often close tabs without warning).
let reading = null;
function startRead(kind, slug, el) {
  endRead();
  reading = { kind, slug, el, s: 0, done: false, last: Date.now() };
  reading.timer = setInterval(() => {
    if (!reading || document.visibilityState !== "visible" || Date.now() - reading.last > 30e3) return;
    reading.s++;
    const box = typeof reading.el === "string" ? document.querySelector(reading.el) : null;
    if (box && box.getBoundingClientRect().bottom <= innerHeight + 40) reading.done = true;
    if (reading.s >= 5 && reading.s % 3 === 0) store.set("rw-read-pending", { t: "read", kind: reading.kind, slug: reading.slug, s: reading.s, done: reading.done });
  }, 1000);
}
function endRead() {
  if (!reading) return;
  clearInterval(reading.timer);
  if (reading.s >= 5) beacon({ t: "read", kind: reading.kind, slug: reading.slug, s: reading.s, done: reading.done });
  try { localStorage.removeItem("rw-read-pending"); } catch { /* storage off */ }
  reading = null;
}
["scroll", "pointerdown", "keydown", "touchstart", "mousemove", "wheel"].forEach(ev => addEventListener(ev, () => { if (reading) reading.last = Date.now(); }, { passive: true }));
addEventListener("pagehide", endRead);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") endRead(); });

function saveForLater(item) {
  const saved = store.get("rw-saved", []);
  if (!saved.some(s => s.href === item.href)) saved.unshift({ ...item, savedAt: new Date().toISOString() });
  store.set("rw-saved", saved.slice(0, 100));
  // Members: the save follows them to every device.
  if (state.user) fetch("/api/me/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) }).catch(() => {});
  const slug = item.href.match(/^\/(?:article|edition)\/([^/?#]+)/)?.[1];
  if (slug) navigator.serviceWorker?.controller?.postMessage({ type: "SAVE_ARTICLE", url: `/api/articles/${slug}?lang=${lang}` });
  toast("Saved. You’ll find it in Saved stories.");
}
function setTextScale(delta) {
  const scale = Math.round(Math.min(1.5, Math.max(0.8, (Number(store.get("rw-text", 1)) || 1) + delta)) * 100) / 100;
  store.set("rw-text", scale);
  document.documentElement.style.setProperty("--text-scale", scale);
  toast(`Text size ${Math.round(scale * 100)}%`);
}
document.documentElement.style.setProperty("--text-scale", store.get("rw-text", 1));
// Light or dark: follows the device until the reader picks one (index.html applies it before paint).
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const pref = store.get("rw-theme", "auto");
  document.documentElement.dataset.theme = pref === "dark" || (pref === "auto" && darkQuery.matches) ? "dark" : "light";
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  store.set("rw-theme", next === (darkQuery.matches ? "dark" : "light") ? "auto" : next); applyTheme();
}
darkQuery.addEventListener?.("change", applyTheme); applyTheme();

/* ---------- Shell ---------- */
const NAV = [
  ["Home", "/", r => r.page === "home"],
  ...DESKS.map(d => [d, deskHref(d), r => r.page === "desk" && deskOf(r.arg) === d]),
  ["Latest", "/live", r => r.page === "live"],
  ["Briefs", "/briefs", r => r.page === "briefs"],
  ["Shorts", "/shorts", r => r.page === "shorts"],
  ["Watch", "/watch", r => r.page === "watch"],
  ["Community", "/community", r => r.page === "community" || r.page === "discussion"]
];

function renderShell() {
  document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#view">Skip to content</a>`);
  $("#app").innerHTML = `
  <div class="ticker" role="region" aria-label="Latest headlines"><div class="wrap ticker-in">
    <span class="ticker-label"><span class="pulse"></span><span id="tickerLabel">Breaking</span></span>
    <div class="ticker-track"><div class="ticker-move" id="tickerMove"><span class="ticker-item muted">Loading the latest news…</span></div></div>
    <button class="ticker-toggle" type="button" data-action="ticker-toggle" aria-label="Pause headlines" aria-pressed="false"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path class="i-pause" d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor"/><path class="i-play" d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg></button>
    <div class="clocks" id="clocks" aria-label="World clocks"></div>
  </div></div>
  <header class="wrap">
    <div class="utility">
      <div class="utility-left"><span id="today"></span><button class="fresh-btn" id="freshBtn" type="button" data-action="refresh-all" aria-label="Refresh the news">${ICON_REFRESH}<span id="freshText">Updated just now</span></button></div>
      <div class="utility-right">
        <a class="live-tv-btn" href="/watch" aria-label="LIVE TV" data-no-tr><span class="live-dot" aria-hidden="true"></span><span class="live-word">LIVE</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M8 2.5l4 3.5 4-3.5"/></svg><span class="live-tv-word">TV</span></a>
        <details class="lang-menu" id="langMenu"><summary class="icon-btn lang-btn" aria-label="Language" title="Language">${ICON_GLOBE}<span lang="${lang}">${LANGUAGES[lang].short}</span></summary>
          <div class="lang-pop glass" id="langPop" data-no-tr role="menu">${languageLinks()}</div></details>
        <button class="icon-btn" type="button" data-action="theme" aria-label="Switch between light and dark" title="Light or dark"><svg class="i-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg><svg class="i-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
        <span class="alerts-wrap"><button class="icon-btn" type="button" data-action="alerts" aria-label="Alerts" aria-haspopup="dialog" aria-controls="alertsPanel">${ICON_BELL}</button>
          <div class="alerts-panel glass" id="alertsPanel" role="dialog" aria-label="Alerts" hidden></div></span>
        <span class="guest" id="guestActions"><button class="text-btn" type="button" id="signInBtn">Sign in</button><button class="btn btn-red btn-sm" type="button" id="joinBtn">Join free</button></span>
        <div class="account hidden" id="account"><button class="avatar" type="button" id="avatarBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="accountMenu"></button>
          <div class="account-menu glass" id="accountMenu" role="menu" hidden></div></div>
      </div>
    </div>
    <div class="masthead" id="masthead">
      <div class="nameplate"><a class="nameplate-link" href="/" aria-label="Rashtrix 24×7 News home">${fullLogo("mast-logo")}</a>
        <div class="nameplate-tag"><p class="tagline" lang="bn" data-no-tr>${BRAND.tagline.split("।").map((x, i, all) => `<span class="tl-part">${x.trim()}${i < all.length - 1 ? " ।" : ""}</span>`).join(" ")}</p><p class="tag-sub"><span class="l">Kolkata</span> <span class="l">·</span> <span class="l">West Bengal</span> <span class="l">·</span> <span class="l">India</span> <span class="l">·</span> <span class="l">World</span></p></div></div>
      <span class="mast-rule" aria-hidden="true"></span>
    </div>
  </header>
  <div class="nav-dock"><div class="wrap"><nav class="site-nav glass" id="siteNav" aria-label="Sections"></nav></div></div>
  <div class="read-progress" id="readProgress" aria-hidden="true"></div>
  <main id="view" tabindex="-1"></main>
  <footer class="site-footer"><div class="sf-glow" aria-hidden="true"></div><div class="wrap">
    <div class="sf-brand">
      <a class="footer-brand" href="/" aria-label="Rashtrix 24×7 News home">${fullLogo("footer-logo")}</a>
      <div class="sf-brand-text">
        <p class="sf-tagline" lang="bn" data-no-tr>${BRAND.tagline.split("।").map((x, i, all) => `<span>${x.trim()}${i < all.length - 1 ? " ।" : ""}</span>`).join("")}</p>
        <p class="sf-sub"><span>Kolkata</span><i aria-hidden="true">·</i><span>West Bengal</span><i aria-hidden="true">·</i><span>India</span><i aria-hidden="true">·</i><span>World</span></p>
        <div class="sf-cta"><a class="live-tv-btn" href="/watch" data-no-tr><span class="live-dot" aria-hidden="true"></span><span class="live-word">LIVE</span><span class="live-tv-word">TV</span></a><a class="sf-install install-link" href="#" data-action="install">Install the app</a></div>
      </div>
    </div>
    <div class="sf-grid">
      <nav class="sf-col" aria-label="Sections"><h3>Sections</h3>${DESKS.map(d => `<a href="${deskHref(d)}">${d}</a>`).join("")}<a href="/live">Latest</a><a href="/briefs">Briefs</a><a href="/shorts">Shorts</a><a href="/watch">Watch</a></nav>
      <nav class="sf-col" aria-label="Rashtrix"><h3>Rashtrix</h3><a href="/about">About Rashtrix</a><a href="/community">Community</a><a href="/corrections">Corrections Policy</a><a href="/grievance">Grievance Redressal</a><a href="https://www.rashtrix.live" target="_blank" rel="noopener">rashtrix.live ↗</a></nav>
      <form class="lead-form sf-form" id="leadForm"><h3 class="kicker">Advertising &amp; contact</h3>
        <label class="sr-only" for="leadName">Your name</label><input id="leadName" name="name" placeholder="Your name" required minlength="2" autocomplete="name">
        <label class="sr-only" for="leadEmail">Work email</label><input id="leadEmail" name="email" type="email" placeholder="Work email" required autocomplete="email">
        <label class="sr-only" for="leadOrg">Organisation</label><input id="leadOrg" name="organisation" placeholder="Organisation (optional)" autocomplete="organization">
        <label class="sr-only" for="leadInterest">Interest</label><select id="leadInterest" name="interest"><option>Advertising</option><option>News tip</option><option>Correction</option><option>Partnership</option><option>Other</option></select>
        <button class="btn sf-send" type="submit">Request contact</button><small id="leadMessage" aria-live="polite"></small></form>
    </div>
    <div class="sf-rule" aria-hidden="true"></div>
    <div class="sf-bottom">
      <p class="credits"><span class="cr-item"><span>Founder and Editor-in-Chief</span> <b data-no-tr>Ilmaz Syed</b></span><span class="sep" aria-hidden="true">·</span><span class="cr-item"><span>Powered by</span> <a href="https://calibrex.org" target="_blank" rel="noopener" data-no-tr>Calibrex</a></span></p>
      <nav class="lang-foot" id="langFoot" data-no-tr aria-label="Language">${languageLinks()}</nav>
    </div>
    <nav class="legal-links" aria-label="Legal">${LEGAL_ORDER.map(([k, t]) => `<a href="/${k}">${t}</a>`).join("")}</nav>
    <p class="copyright">© ${new Date().getFullYear()} Rashtrix 24×7 News. All rights reserved. Wire reports are written by the Rashtrix wire desk with AI assistance from several published reports; see the Disclaimer.</p>
  </div></footer>
  <div class="modal-backdrop hidden" id="modalBackdrop"><section class="modal glass" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <button class="modal-close" id="modalClose" type="button" aria-label="Close">×</button>
    <div class="kicker">Rashtrix membership</div><h2 id="modalTitle">Welcome back.</h2>
    <p class="modal-intro">A free account lets you join community discussions and members’ briefings.</p>
    <ul class="auth-perks" id="authPerks">${PERKS.map(([icon, title]) => `<li><span class="perk-icon">${PERK_ICONS[icon]}</span>${title}</li>`).join("")}</ul>
    <div id="authMessage" class="auth-message" aria-live="polite"></div>
    <form id="authForm"><label id="nameField" class="hidden">Your name<input name="displayName" autocomplete="name" minlength="2"></label>
      <label>Email address<input name="email" type="email" autocomplete="email" required></label>
      <label>Password <small>(12+ characters)</small><input name="password" type="password" minlength="12" autocomplete="current-password" required></label>
      <button class="btn btn-dark" type="submit" id="authSubmit">Sign in</button></form>
    <p class="consent-note" id="consentNote">By creating an account you agree to our <a href="/terms">Terms</a> and consent to the use of your name and email as set out in our <a href="/privacy">Privacy Notice</a>. You can withdraw consent by deleting your account.</p>
    <div class="auth-switch"><span id="authSwitchText">New to Rashtrix?</span><button id="authSwitch" type="button">Create an account</button></div>
  </section></div>
  <dialog class="form-dialog glass" id="formDialog" aria-labelledby="formDialogTitle"><form method="dialog" id="dialogForm">
    <button class="modal-close" type="button" data-close-dialog aria-label="Close">×</button>
    <div class="kicker" id="formDialogKicker"></div><h2 id="formDialogTitle"></h2><div id="formDialogFields"></div>
    <p class="auth-message" id="formDialogMessage" aria-live="polite"></p>
    <div class="dialog-actions"><button class="btn btn-dark" type="submit" id="formDialogSubmit">Save</button><button class="btn btn-light" type="button" data-close-dialog>Cancel</button></div>
  </form></dialog>
  <dialog class="search-dialog glass" id="searchDialog" aria-label="Search"><div class="search-box">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input id="searchInput" type="search" placeholder="Search Rashtrix" aria-label="Search" autocomplete="off"><button class="btn btn-light btn-sm" type="button" data-close-dialog>Esc</button></div>
    <div id="searchResults" class="search-results"></div></dialog>
  <div class="toast" id="toast" role="status"></div>
  <div class="alert-banner glass" id="alertBanner" role="status" hidden></div>
  <section class="sheet" id="alertsSheet" role="dialog" aria-labelledby="alertsSheetTitle" hidden>
    <span class="sheet-grip" aria-hidden="true"></span>
    <button class="sheet-x" type="button" data-action="alerts-later" aria-label="Close">${ICON_X}</button>
    <div class="sheet-hero alerts"><span class="sheet-icon bell">${ICON_BELL}</span><span class="sheet-ping" aria-hidden="true"></span></div>
    <span class="kicker">Breaking news, as it happens</span><h2 id="alertsSheetTitle">Turn on Rashtrix alerts</h2>
    <ul class="sheet-list">${ALERT_TYPES.map(t => `<li>${ICON_CHECK}<span>${t}</span></li>`).join("")}</ul>
    <div class="sheet-actions"><button class="btn btn-red sheet-primary" type="button" data-action="alerts-allow">Allow alerts</button><button class="sheet-secondary" type="button" data-action="alerts-later">Not now</button></div>
    <p class="sheet-note">Your browser asks you to confirm once. Turn them off any time from the bell.</p>
  </section>
  <div class="offline-bar" id="offlineBar" role="status" hidden><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.3-1.6M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg><span>You’re offline. Stories you opened recently and saved stories still open.</span></div>
  <div class="update-bar lang-suggest" id="langSuggest" role="status" hidden></div>
  <div class="update-bar" id="updateBar" role="status" hidden>
    <span class="ub-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg></span>
    <span class="ub-text"><b>A new version is ready</b><small>Update for the latest stories and fixes.</small></span>
    <button class="btn btn-red btn-sm" type="button" data-action="apply-update">Update</button>
    <button class="ub-close" type="button" data-action="update-later" aria-label="Later">${ICON_X}</button>
  </div>
  <section class="install-sheet" id="installSheet" role="dialog" aria-modal="true" aria-labelledby="installTitle" hidden>
    <div class="install-panel">
      <button class="install-close" type="button" data-action="install-dismiss" aria-label="Close">${ICON_X}</button>
      <header class="install-brand">
        <img class="install-brand-icon" src="/icon-192.png" alt="Rashtrix app icon" width="76" height="76">
        <span class="install-brand-divider" aria-hidden="true"></span>
        <span class="install-brand-copy"><b>RASHTRIX <i>24X7</i></b><small>KOLKATA <em>·</em> BENGAL <em>·</em> INDIA <em>·</em> WORLD</small></span>
      </header>
      <div class="install-intro">
        <div class="install-copy">
          <span class="install-eyebrow">THE RASHTRIX APP</span>
          <h2 id="installTitle">Install the<br>Rashtrix <span>App</span></h2>
          <p>A fast, secure and lightweight news experience — without the app-store download.</p>
          <div class="install-benefits">
            <span><b aria-hidden="true">ϟ</b>Lightweight<br>&amp; fast</span>
            <span><b aria-hidden="true">◇</b>Safe<br>&amp; secure</span>
            <span><b aria-hidden="true">⌁</b>Read<br>offline</span>
            <span><b aria-hidden="true">▣</b>Phone, tablet<br>&amp; desktop</span>
          </div>
        </div>
        <div class="install-device" aria-hidden="true">
          <div class="install-device-frame"><div class="install-device-notch"></div><div class="install-device-screen">
            <img src="/icon-192.png" alt="" width="100" height="100"><b>Rashtrix</b><span class="install-globe"></span>
          </div></div>
        </div>
      </div>
      <div class="install-platforms">
        <div class="install-platform install-ios">
          <h3><span class="platform-symbol">●</span> iPhone / iPad <small>(Safari)</small></h3>
          <ol>
            <li><span class="step">1</span><span>Tap <b>Share</b> <span class="install-inline-icon">↥</span></span></li>
            <li><span class="step">2</span><span>Choose <b>Add to Home Screen</b> <span class="install-inline-icon">⊞</span></span></li>
            <li><span class="step">3</span><span>Open Rashtrix from your home screen</span></li>
          </ol>
        </div>
        <div class="install-platform install-android">
          <h3><span class="platform-symbol android-symbol">●</span> Android <small>(Chrome &amp; other browsers)</small></h3>
          <div class="install-actions">
            <button class="btn btn-red sheet-primary" type="button" data-action="install"><span aria-hidden="true">↓</span> Install App</button>
            <button class="btn btn-red sheet-primary" type="button" data-action="install-open" hidden>Open Rashtrix</button>
          </div>
          <p class="install-other" hidden>Or tap <b>⋮</b> in your browser and choose <b>Install app / Add to Home Screen</b>.</p>
          <p class="install-installed" hidden>Already installed? Open Rashtrix from your app list or home screen.</p>
        </div>
      </div>
      <div class="install-bottom">
        <span><b>ϟ</b> Instant access<br><small>Live news &amp; analysis</small></span>
        <span><b>♧</b> Real-time<br><small>alerts</small></span>
        <span><b>▱</b> No app store<br><small>required</small></span>
        <span><b>▣</b> One experience<br><small>across devices</small></span>
      </div>
      <p class="install-storage">Uses a small amount of device storage for the app and cached content. Offline saves may use more.</p>
      <button class="sheet-secondary install-later" type="button" data-action="install-dismiss">Not now</button>
    </div>
  </section>`;

  $("#today").textContent = new Date().toLocaleDateString(LOCALE, { ...IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#signInBtn").addEventListener("click", () => openAuth("login"));
  $("#joinBtn").addEventListener("click", () => openAuth("register"));
  $("#avatarBtn").addEventListener("click", () => toggleAccountMenu());
  document.addEventListener("click", e => { if (!e.target.closest("#langMenu")) $("#langMenu").open = false; if (!e.target.closest("#account")) toggleAccountMenu(false); if (!e.target.closest(".alerts-wrap") && $("#alertsPanel") && !$("#alertsPanel").hidden) toggleAlertsPanel(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") toggleAccountMenu(false); });
  $("#modalClose").addEventListener("click", closeAuth);
  $("#modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") closeAuth(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modalBackdrop").classList.contains("hidden")) closeAuth(); });
  $("#authSwitch").addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));
  $("#authForm").addEventListener("submit", submitAuth);
  $("#leadForm").addEventListener("submit", submitLead);
  window.addEventListener("online", syncOnline); window.addEventListener("offline", syncOnline); syncOnline();
  $$("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close-dialog]")) d.close(); }));
  $("#searchInput").addEventListener("input", renderSearchResults);
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); $("#searchDialog").close(); return; }
    if (e.key === "Enter" && e.target.value.trim()) { $("#searchDialog").close(); navigate(`/search?q=${encodeURIComponent(e.target.value.trim())}`); } });
  // One delegated handler for every action button rendered by the views.
  document.addEventListener("click", onAction);
  // Hide images from feeds that fail to load rather than showing a broken icon.
  document.addEventListener("error", e => {
    if (!e.target?.matches?.("img[data-hide-on-error]")) return;
    // A small thumbnail that isn't there yet: fall back to the full picture.
    if (e.target.dataset.full && !e.target.dataset.fellBack) { e.target.dataset.fellBack = "1"; e.target.src = e.target.dataset.full; return; }
    (e.target.closest(".thumb, .reader-hero") || e.target).classList.add("hidden");
  }, true);
}

function renderNav(route) {
  $("#siteNav").innerHTML = NAV.map(([label, href, active]) => `<a href="${href}"${active(route) ? ' aria-current="page"' : ""}>${label === "Latest" && state.coverage.length ? `<span class="nav-live" aria-label="Live coverage running"></span>` : ""}${label}</a>`).join("")
    + `<button class="search-btn" type="button" data-action="search" aria-label="Search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>`;
  { const nav = $("#siteNav"), cur = nav.querySelector("[aria-current=page]"); if (cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2); }
  $("#siteNav").dispatchEvent(new Event("scroll"));
}

/* ---------- Router ---------- */
// Clean URLs (/edition/slug, /live/India …) so every page can be indexed and shared.
function parseRoute() {
  const [page = "", ...rest] = stripLang(location.pathname).split("/").filter(Boolean);
  return { page: page || "home", arg: rest.length ? decodeURIComponent(rest.join("/")) : "", params: new URLSearchParams(location.search) };
}
// New pages open at the top; Back and Forward return to where the reader was.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const jump = y => window.scrollTo({ top: y, left: 0, behavior: "instant" });
function navigate(href, { replace = false } = {}) {
  href = withLang(href); // stay in the reader's language
  if (href === location.pathname + location.search) { jump(0); return route(); }
  if (!replace) history.replaceState({ ...(history.state || {}), rw: true, y: scrollY }, "");
  history[replace ? "replaceState" : "pushState"]({ rw: true, y: 0 }, "", href);
  route();
}
// Links inside the app change the view without a page load; files and other sites load normally.
function interceptLinks(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a[href]"); if (!a || a.target || a.hasAttribute("download")) return;
  if (a.dataset.lang) { setLanguagePreference(a.dataset.lang); return; } // other language: full page load
  const href = a.getAttribute("href");
  if (!href.startsWith("/") || href.startsWith("//") || /^\/(api|admin|media)\b|\.(html|xml|txt|json|webmanifest|jpg|png|webp|pdf)$/i.test(href.split("?")[0])) return;
  e.preventDefault();
  a.closest("dialog")?.close();
  navigate(href);
}
const views = { about: viewAbout, ...Object.fromEntries(LEGAL_ORDER.map(([k]) => [k, viewLegal])), coverage: viewCoverage, home: viewHome, desk: viewDesk, briefs: viewBriefs, editions: viewLive, edition: viewStory, article: viewStory, author: viewAuthor, tag: viewTag, my: viewMy, live: viewLive, community: viewCommunity, discussion: viewDiscussion, events: viewEvents, watch: viewWatch, tv: viewWatch, shorts: viewShorts, account: viewAccount, saved: viewSaved, search: viewSearch };
const DEFAULT_TITLE = "Rashtrix 24×7 News";
let routeSeq = 0;
async function route({ restoreY = null } = {}) {
  const r = parseRoute(), seq = ++routeSeq;
  endRead();
  if (state.pendingArticles) { state.articles = state.pendingArticles; state.pendingArticles = null; }
  hideNewPill();
  if (restoreY === null) jump(0);
  document.title = DEFAULT_TITLE;
  renderNav(r);
  $("#langPop").innerHTML = languageLinks(); $("#langFoot").innerHTML = languageLinks(); $("#langMenu").open = false; // same page, other language
  const view = views[r.page] || viewNotFound;
  // Lists that mix in control-room articles wait briefly for them, so the lead story doesn't flash.
  stopListening();
  if (!["watch", "tv"].includes(r.page) && tvInstance) { tvInstance.destroy(); tvInstance = null; }
  if (r.page !== "shorts" && shortsObserver) { shortsObserver.disconnect(); shortsObserver = null; }
  if (["home", "editions", "search", "author", "edition", "article", "tag", "my", "desk", "briefs", "live"].includes(r.page)) {
    await Promise.race([Promise.all([articlesReady, writersReady]), new Promise(res => setTimeout(res, 1200))]);
    if (!articlesSettled && ["home", "desk", "briefs", "live", "author"].includes(r.page)) state.drewWithoutArticles = true;
  }
  if (["account", "discussion", "community", "my", "saved", "tag"].includes(r.page)) await Promise.race([userReady, new Promise(res => setTimeout(res, 2500))]);
  document.body.classList.toggle("is-reading", ["edition", "article"].includes(r.page));
  const main = $("#view");
  main.classList.remove("view-enter"); void main.offsetWidth; main.classList.add("view-enter");
  await view(r);
  if (seq !== routeSeq) return; // a newer navigation took over
  updateProgress();
  if (restoreY !== null) requestAnimationFrame(() => jump(restoreY)); else jump(0);
}

/* ---------- Scroll effects ---------- */
function updateProgress() {
  const bar = $("#readProgress"); if (!bar) return;
  if (!document.body.classList.contains("is-reading")) { bar.style.transform = "scaleX(0)"; return; }
  const article = $(".reader-article"); if (!article) return;
  const top = article.getBoundingClientRect().top + window.scrollY, height = article.offsetHeight - window.innerHeight * 0.6;
  bar.style.transform = `scaleX(${Math.min(1, Math.max(0, (window.scrollY - top + 120) / Math.max(1, height)))})`;
}
function watchScroll() {
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { ticking = false; updateProgress(); });
  }, { passive: true });
  // The menu gets its pinned look once the masthead has scrolled away (no logo in it: the full
  // logo stays in the masthead, never shrunk into the menu).
  new IntersectionObserver(([entry]) => document.body.classList.toggle("nav-stuck", !entry.isIntersecting), { rootMargin: "-20px 0px 0px 0px" }).observe($("#masthead"));
  // On narrow screens the menu scrolls sideways; fade its edge until the end is reached.
  const nav = $("#siteNav");
  const edge = () => nav.classList.toggle("at-end", nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4);
  nav.addEventListener("scroll", edge, { passive: true }); window.addEventListener("resize", edge); edge();
}

/* ---------- Shared pieces ---------- */
const edHref = e => e.href || `/article/${e.slug}`;
const metaLine = e => `${esc(e.author)} · ${ago(e.publishedAt || e.date)}${e.readMinutes && !isWire(e) ? ` · ${e.readMinutes} min` : ""}`;
function edCard(e, { dek = false } = {}) {
  // A story without a photo is a text card (headline and standfirst); the logo panel is not repeated.
  if (!e.image) dek = true;
  return `<a class="ed-card glass${e.image ? "" : " no-photo text-only"}" href="${edHref(e)}">${e.image ? `<div class="thumb">${pic(e)}</div>` : ""}<span class="body"><span class="kicker">${newTag(e)}${esc(e.category)}${kindLabel(e) ? ` · ${kindLabel(e)}` : ""}</span><h3>${esc(e.title)}</h3>${dek && e.dek ? `<p>${esc(e.dek)}</p>` : ""}<span class="meta">${metaLine(e)}</span></span></a>`;
}
// A line in the latest-news stream: time, desk, headline (no picture).
function streamItem(e) {
  return `<a class="stream-item" href="${edHref(e)}"><time>${clock(e.publishedAt)}</time><span><span class="kicker">${esc(e.category)}${kindLabel(e) ? ` · ${kindLabel(e)}` : ""}</span><b>${esc(e.title)}</b>${e.kind === "brief" && e.dek ? `<small>${esc(e.dek)}</small>` : ""}</span></a>`;
}
const wireItems = () => stories().filter(isWire);
function wireEmpty() {
  return articlesSettled ? `<div class="empty">No stories yet. New ones appear here as soon as they are published.</div>` : `<div class="skeleton" style="height:220px"></div>`;
}

/* ---------- Home ---------- */
// Rashtrix's own stories (with photos) lead; the wire desk's rewrites and briefs run in the
// latest-news stream as text. Then a section per desk.
function viewHome() {
  const all = stories().sort((x, y) => (Date.parse(y.publishedAt) || 0) - (Date.parse(x.publishedAt) || 0));
  if (!all.length && !(state.coverageAll || []).length) { $("#view").innerHTML = `<div class="wrap home"><section id="liveBanner" class="band-tight" hidden></section>${articlesSettled ? `<div class="empty" style="margin-top:30px">No stories yet.</div>` : `<div class="skeleton" style="height:420px;margin-top:20px"></div>`}</div>`; renderLiveBanner(); return; }
  // The top-stories column keeps the desk's own stories (with photos); the carousel beside it
  // carries only live coverage and the wire (renderLeadCarousel).
  const used = new Set(all.filter(isWire).slice(0, 7).map(a => a.id));
  const side = all.filter(a => !isWire(a)).slice(0, 4); side.forEach(a => used.add(a.id));
  $("#view").innerHTML = `
  <div class="wrap home">
    <section id="liveBanner" class="band-tight" aria-label="Live coverage" hidden></section>
    <div class="lead-grid">
      ${side.length ? `<section class="side-stack" aria-label="More top stories"><div class="kicker">Top stories</div>
        ${side.map(e => `<a class="side-item" href="${edHref(e)}"><div class="thumb">${pic(e)}</div><span class="kicker">${newTag(e)}${esc(e.category)}</span><h3>${esc(e.title)}</h3><span class="meta">${ago(e.publishedAt)}</span></a>`).join("")}
      </section>` : ""}
      <section class="lead-carousel" id="leadCarousel" aria-roledescription="carousel" aria-label="Latest stories"></section>
      <div class="latest-col"><section id="shortsRail" class="shorts-rail" aria-label="Shorts" hidden></section>
      <aside class="live-rail glass" aria-label="Latest news"><div class="live-title"><b><span class="dot-live"></span>Latest</b><a class="link-gold" href="/live" style="font-size:13px">All →</a></div><div id="rail"></div></aside></div>
    </div>

    <section id="briefBand" class="band briefs-band" aria-labelledby="briefTitle"></section>

    ${DESKS.map(d => `<section class="band desk-band" data-desk="${esc(d)}"><div class="section-head"><h2><a href="${deskHref(d)}">${esc(d)}</a></h2><a class="link-gold" href="${deskHref(d)}">More →</a></div><div class="card-grid" id="desk-${DESK_SLUG[d]}"></div></section>`).join("")}

    <section id="videoBand" class="band band-explainers" aria-labelledby="videoBandTitle" hidden></section>
    ${joinBand()}
  </div>`;
  renderLeadCarousel(); renderRail(); renderHomeDesks(used); renderBriefBand(); renderCommunity(); renderLiveBanner(); renderHomeMedia();
}
// The swipe cards at the top: seven compact text cards, no photos. Running live coverage comes
// first, headed by its newest update; then the wire's own reports and briefs, newest first.
function renderLeadCarousel() {
  const host = $("#leadCarousel"); if (!host) return;
  const live = (state.coverageAll || []).filter(d => d?.item).map(d => {
    const u = d.updates?.[0];
    return { live: true, href: withLang(`/coverage/${encodeURIComponent(d.item.slug)}`), title: u ? (u.title || firstLine(u.body)) : d.item.title, cov: d.item.title, at: u?.createdAt || d.item.startedAt };
  });
  const wire = stories().filter(isWire).sort((x, y) => (Date.parse(y.publishedAt) || 0) - (Date.parse(x.publishedAt) || 0))
    .map(e => ({ href: edHref(e), title: e.title, dek: e.dek, desk: e.category, kind: kindLabel(e), at: e.publishedAt }));
  const cards = [...live, ...wire].slice(0, 7);
  host.hidden = !cards.length;
  host.innerHTML = cards.length ? `<div class="lc-track" id="lcTrack" tabindex="0">${cards.map((c, i) => `<article class="lc-card lc-mini glass${c.live ? " lc-live" : ""}" aria-roledescription="slide" aria-label="${digits(i + 1)} / ${digits(cards.length)}"><a class="lc-link" href="${c.href}">
      <div class="lc-meta">${c.live ? `<span class="tag tag-live"><i class="dot-live"></i>Live</span><span class="kicker" data-no-tr>${esc(c.cov)}</span>` : `<span class="tag tag-red">${esc(c.desk)}</span>${c.kind ? `<span class="kicker">${c.kind}</span>` : ""}`}<span class="lc-ago">${c.at ? ago(c.at) : ""}</span></div>
      <h${i ? 2 : 1} class="lc-title" ${c.live ? "data-no-tr" : ""}>${esc(c.title)}</h${i ? 2 : 1}>${c.dek ? `<p class="lc-dek">${esc(c.dek)}</p>` : ""}</a></article>`).join("")}</div>
    <div class="lc-nav"><button class="carousel-btn" type="button" data-action="lead-step" data-dir="-1" aria-label="Previous story">‹</button><span class="lc-dots" id="lcDots">${cards.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</span><span class="lc-count" id="lcCount">${digits(1)} / ${digits(cards.length)}</span><button class="carousel-btn" type="button" data-action="lead-step" data-dir="1" aria-label="Next story">›</button></div>` : "";
  // The dots and the count follow the card in view.
  const track = document.getElementById("lcTrack");
  if (track) track.addEventListener("scroll", () => {
    const list = track.children; if (!list.length) return;
    const i = Math.min(Math.round(track.scrollLeft / (list[0].offsetWidth + 16)), list.length - 1);
    document.querySelectorAll("#lcDots i").forEach((d, k) => d.classList.toggle("on", k === i));
    const c = document.getElementById("lcCount"); if (c) c.textContent = `${digits(i + 1)} / ${digits(list.length)}`;
  }, { passive: true });
}
// The latest-updates column: running live coverage first, each headed by its newest update, then
// the wire's own reports and briefs, newest first; seven cards in all, no photos.
const firstLine = t => { const x = String(t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return (x.split(/(?<=[।.!?])\s/)[0] || x).slice(0, 160); };
function renderRail() {
  const host = $("#rail"); if (!host) return;
  const live = (state.coverageAll || []).filter(d => d?.item).map(d => {
    const u = d.updates?.[0], text = u ? (u.title || firstLine(u.body)) : d.item.title;
    return `<a class="tl-live" href="${withLang(`/coverage/${encodeURIComponent(d.item.slug)}`)}"><span class="when"><i class="dot-live"></i>Live · <span data-no-tr>${esc(d.item.title)}</span></span><b>${esc(text)}</b></a>`;
  }).slice(0, 7);
  const wire = stories().filter(isWire).sort((x, y) => (Date.parse(y.publishedAt) || 0) - (Date.parse(x.publishedAt) || 0)).slice(0, 7 - live.length)
    .map(i => `<a href="${edHref(i)}"><span class="when">${clock(i.publishedAt)} · ${esc(i.category)}</span><b>${esc(i.title)}</b></a>`);
  const items = [...live, ...wire];
  host.innerHTML = items.length ? `<div class="timeline compact">${items.join("")}</div>` : wireEmpty();
}
function renderHomeDesks(used = new Set()) {
  for (const d of DESKS) {
    const host = $(`#desk-${DESK_SLUG[d]}`); if (!host) continue;
    const list = stories().filter(a => a.category === d && !used.has(a.id));
    // The four newest on each desk, wire briefs and reports included.
    const pickd = list.sort((x, y) => (Date.parse(y.publishedAt) || 0) - (Date.parse(x.publishedAt) || 0)).slice(0, 4);
    host.closest(".desk-band").hidden = !pickd.length;
    host.innerHTML = pickd.map(e => edCard(e)).join("");
  }
}
function renderBriefBand() {
  const host = $("#briefBand"); if (!host) return;
  const briefs = stories().filter(a => a.kind === "brief").slice(0, 6);
  host.hidden = !briefs.length;
  host.innerHTML = briefs.length ? `<div class="section-head"><h2 id="briefTitle">Briefs</h2><span class="meta">The news in 100 words</span><a class="link-gold" href="/briefs">All briefs →</a></div>
    <div class="brief-row">${briefs.map(b => `<a class="brief-card glass" href="${edHref(b)}"><span class="kicker">${esc(b.category)} · ${ago(b.publishedAt)}</span><b>${esc(b.title)}</b></a>`).join("")}</div>` : "";
}
/* ---------- Desks, briefs and the latest stream ---------- */
function viewDesk(r) {
  const d = deskOf(r.arg); if (!d) return viewNotFound();
  const list = stories().filter(a => a.category === d);
  document.title = `${tr(d)} · ${tr("Rashtrix 24×7 News")}`;
  const own = list.filter(a => !isWire(a)), wire = list.filter(isWire);
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Desk</div><h1>${esc(d)}</h1></div>${followBtn(d)}</div>
    ${list.length ? `<div class="desk-layout"><div class="archive-grid">${own.map(e => edCard(e, { dek: true })).join("") || wire.slice(0, 6).map(e => edCard(e, { dek: true })).join("")}</div>
      <aside class="aside-card glass"><div class="kicker"><span class="dot-live"></span> Latest from the desk</div><div class="stream">${wire.slice(own.length ? 0 : 6, 40).map(streamItem).join("") || `<p class="muted">Nothing new right now.</p>`}</div></aside></div>`
    : articlesSettled ? `<div class="empty">No stories on this desk yet.</div>` : `<div class="skeleton" style="height:300px"></div>`}</div>`;
}
function viewBriefs() {
  document.title = `${tr("Briefs")} · ${tr("Rashtrix 24×7 News")}`;
  const list = stories().filter(a => a.kind === "brief");
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Briefs</div><h1>The news in 100 words</h1><p>Short reports on the day’s news from India and the world, written by the Rashtrix wire desk.</p></div></div>
    <div class="brief-grid">${list.map(b => `<a class="brief-card glass big" href="${edHref(b)}"><span class="kicker">${esc(b.category)} · ${ago(b.publishedAt)}</span><b>${esc(b.title)}</b></a>`).join("") || (articlesSettled ? `<div class="empty">No briefs yet.</div>` : `<div class="skeleton" style="height:300px"></div>`)}</div></div>`;
}
/* ---------- Community: the join band on the front page ---------- */
const PERK_ICONS = {
  talk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>`,
  brief: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  voice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`
};
const PERKS = [
  ["talk", "Moderated discussions", "Start threads and reply on any story. Sourced, civil, moderated by the desk."],
  ["brief", "Your own front page", "Follow the desks and topics you care about, and keep saved stories on every device."],
  ["voice", "Your name on your ideas", "A member profile for your contributions, and a direct line to the Rashtrix desk."]
];
function joinBand() {
  return `<section class="band join" id="community" aria-labelledby="joinTitle"><div class="join-panel">
    <div class="join-copy">
      <span class="join-eyebrow"><span class="pulse"></span>The Rashtrix community</span>
      <h2 id="joinTitle">Nation first. <em>Sacrifice is the highest duty.</em></h2>
      <p class="join-lede">Tell us what is happening where you live, discuss the news with other readers and follow the desks you care about. Membership is free and takes thirty seconds.</p>
      <ul class="perks">${PERKS.map(([icon, title, text]) => `<li><span class="perk-icon">${PERK_ICONS[icon]}</span><span><b>${title}</b><span>${text}</span></span></li>`).join("")}</ul>
      <div class="join-actions" id="joinActions"></div>
      <p class="join-stats" id="joinStats" hidden></p>
    </div>
    <div class="join-side">
      <div class="join-card"><div class="kicker">Latest discussions</div><div id="discussions"></div><a class="join-link" href="/community">All discussions →</a></div>
      <div class="join-card"><div class="kicker">Upcoming briefings</div><ol class="agenda" id="agenda"></ol><a class="join-link" href="/events">All events →</a></div>
    </div>
  </div></section>`;
}
function communityAside() {
  return `<div class="aside-card glass join-aside"><span class="join-eyebrow"><span class="pulse"></span>Community</span><b>Join the conversation</b><p class="muted">Discuss this story with other readers in moderated threads.</p>${state.user ? `<a class="btn btn-dark btn-sm" href="/community">Open the community</a>` : `<button class="btn btn-dark btn-sm" type="button" data-action="join">Join free</button>`}</div>`;
}
function renderJoin() {
  const actions = $("#joinActions"); if (!actions) return;
  actions.innerHTML = state.user
    ? `<button class="btn btn-red" type="button" data-action="discuss">Start a discussion</button><a class="btn btn-ghost" href="/community">Open the community</a><span class="join-note">Signed in as ${esc(state.user.displayName)}</span>`
    : `<button class="btn btn-red" type="button" data-action="join">Create a free account</button><button class="btn btn-ghost" type="button" data-action="signin">Sign in</button><span class="join-note">Free · No card · Leave any time</span>`;
  const st = state.communityStats, stats = $("#joinStats");
  if (stats && st && st.members >= 25) { stats.hidden = false; stats.textContent = `${st.members.toLocaleString(LOCALE)} members · ${st.discussions.toLocaleString(LOCALE)} discussions · ${st.replies.toLocaleString(LOCALE)} replies`; }
}
function renderCommunity() {
  renderJoin();
  const agenda = $("#agenda"), talk = $("#discussions"); if (!agenda) return;
  const upcoming = (state.events || []).filter(e => !e.startsAt || new Date(e.startsAt) > Date.now() - 6 * 3600e3).slice(0, 3);
  agenda.innerHTML = upcoming.length ? upcoming.map(e => { const d = new Date(e.startsAt); return `<li><span class="date"><b>${d.toLocaleDateString(LOCALE, { ...IST, day: "2-digit" })}</b><small>${d.toLocaleDateString(LOCALE, { ...IST, month: "short" })}</small></span><span><b>${esc(e.title)}</b><span class="meta">${esc(e.eventType)} · ${d.toLocaleTimeString(LOCALE, { ...IST, hour: "2-digit", minute: "2-digit" })} IST · ${esc(e.access)}</span></span></li>`; }).join("")
    : `<li class="agenda-empty"><span class="date"><b>—</b><small>Soon</small></span><span><b>Expert briefings and debates</b><span class="meta">New events are announced here first</span></span></li>`;
  const posts = (state.community || []).slice(0, 3);
  if (talk) talk.innerHTML = posts.length ? posts.map(p => `<a class="talk" href="/discussion/${encodeURIComponent(p.id)}"><span class="avatar avatar-sm" aria-hidden="true">${esc(initials(p.author))}</span><span><b>${esc(p.title)}</b><span class="meta">${esc(p.topic)} · ${esc(p.author)} · ${p.replies || 0} repl${p.replies === 1 ? "y" : "ies"} · ${ago(p.createdAt)}</span></span></a>`).join("")
    : `<div class="talk"><span class="avatar avatar-sm" aria-hidden="true">RX</span><span><b>Be the first to start a conversation</b><span class="meta">Members can open a discussion on any story</span></span></div>`;
}

// "Hard-Kill: The DRDO …" -> <b>Hard-Kill:</b> The DRDO …, as print sets list lead-ins.
const leadIn = x => { const m = x.match(/^([^:]{2,34}):\s+(.+)$/); return m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(x); };
function proseHTML(blocks, { pull } = {}) {
  let html = "", list = [], paragraphs = 0;
  const pullAt = Math.max(3, Math.floor(blocks.filter(b => b.t === "p").length * 0.45));
  const flush = () => {
    if (!list.length) return;
    const numbered = list.every(x => /^\d+\.\s/.test(x));
    const items = list.map(x => `<li>${leadIn(numbered ? x.replace(/^\d+\.\s+/, "") : x)}</li>`).join("");
    html += numbered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`; list = [];
  };
  for (const b of blocks) {
    if (b.t === "li") { list.push(b.x); continue; }
    flush();
    html += b.t === "h" ? `<h2>${esc(b.x)}</h2>` : `<p>${esc(b.x)}</p>`;
    if (b.t === "p" && ++paragraphs === pullAt && pull) html += `<blockquote class="pull">${esc(pull)}</blockquote>`;
  }
  flush();
  return html;
}
// A short, quotable sentence from the closing paragraphs, used as the pull quote.
function pullQuote(blocks) {
  const paras = blocks.filter(b => b.t === "p").map(b => b.x);
  for (const p of paras.slice(-3).reverse()) {
    const first = (p.match(/^[^.!?]+[.!?]/) || [])[0]?.trim();
    if (first && first.length >= 40 && first.length <= 190) return first;
  }
  return "";
}
const ICON = {
  listen: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>`,
  pause: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
  save: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`,
  share: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5"/></svg>`
};
function readerBar({ badge, original, originalLabel, saveItem }) {
  return `<div class="reader-bar glass"><a class="btn btn-light btn-sm" href="/" data-action="back" aria-label="Back">${ICON.back}<span class="lbl">Back</span></a><span class="badge">${esc(badge)}</span><span class="grow"></span>
    <button class="btn btn-light btn-sm" type="button" data-action="text-smaller" aria-label="Smaller text">A−</button><button class="btn btn-light btn-sm" type="button" data-action="text-larger" aria-label="Larger text">A+</button>
    ${"speechSynthesis" in window || "Audio" in window ? `<span class="listen-group"><button class="btn btn-light btn-sm listen-btn" type="button" data-action="listen" aria-label="Listen to this story" aria-pressed="false">${ICON.listen}<span class="lbl">Listen</span></button><button class="btn btn-light btn-sm voice-btn" type="button" data-action="voice" aria-label="Choose the voice" title="Choose the voice">${voicePref() === "male" ? "Male voice" : "Female voice"}</button></span>` : ""}
    <button class="btn btn-light btn-sm" type="button" data-action="save" aria-label="Save" data-item='${esc(JSON.stringify(saveItem))}'>${ICON.save}<span class="lbl">Save</span></button><button class="btn btn-light btn-sm" type="button" data-action="share" aria-label="Share" data-title="${esc(saveItem.title)}">${ICON.share}<span class="lbl">Share</span></button>
    ${original ? `<a class="btn btn-dark btn-sm original-btn" href="${esc(original)}" target="_blank" rel="noreferrer"><span class="lbl">${esc(originalLabel)}</span><span class="lbl-short">Original</span> ↗</a>` : ""}</div>`;
}
function viewNotFound() {
  document.title = `404 · ${tr("Rashtrix 24×7 News")}`;
  $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><span class="kicker">404</span><h1>We couldn’t find that page</h1><p class="muted">It may have moved. Try the latest stories or search.</p><div class="blocked-actions"><a class="btn btn-dark" href="/">Go to today’s front page</a><button class="btn btn-light" type="button" data-action="search">Search</button></div></div></div>`;
}

/* ---------- Stories ---------- */
const storyNotFound = () => { $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><h1>Story not found</h1><p class="muted">It may have been unpublished or moved.</p><div class="blocked-actions"><a class="btn btn-dark" href="/live">See the latest news</a></div></div></div>`; };
async function viewStory(r) {
  const slug = r.arg;
  $("#view").innerHTML = `<div class="wrap"><div class="reader-layout"><article class="reader-article"><div class="skeleton" style="height:60px"></div><div class="skeleton" style="height:420px;margin-top:20px"></div></article></div></div>`;
  let a = null;
  try { const res = await fetch(`/api/articles/${encodeURIComponent(slug)}?lang=${lang}`); if (res.ok) a = (await res.json()).article; }
  catch { /* offline: the service worker answers with the last copy, or nothing */ }
  if (parseRoute().arg !== slug) return;
  if (!a) return storyNotFound();
  if (a.href && withLang(a.href) !== location.pathname) history.replaceState({ rw: true }, "", withLang(a.href) + location.search);
  const w = writer(a.writer), blocks = articleBlocks(a.body);
  const words = blocks.reduce((n, b) => n + b.x.split(/\s+/).length, 0);
  const list = stories(), i = list.findIndex(x => x.slug === a.slug), newer = list[i - 1], older = i >= 0 ? list[i + 1] : null;
  const hero = a.heroUrl || a.imageUrl;
  document.title = `${a.title} · ${tr("Rashtrix 24×7 News")}`;
  const pub = a.status === "published";
  $("#view").innerHTML = `<div class="wrap">${readerBar({ badge: pub ? `${a.category}${kindLabel(a) ? ` · ${kindLabel(a)}` : ""}` : `Preview · ${a.status}`, saveItem: { href: a.href, title: a.title, source: "Rashtrix" } })}
  <div class="reader-layout"><article class="reader-article" data-lang="${a.lang || "bn"}" lang="${LANGUAGES[a.lang]?.locale || "bn-IN"}">
    <div class="kicker"><a href="${deskHref(a.category)}">${esc(a.category)}</a>${kindLabel(a) ? ` · ${kindLabel(a)}` : ""}</div><h1>${esc(a.title)}</h1>${a.dek ? `<p class="dek">${esc(a.dek)}</p>` : ""}${translationNote(a)}
    ${a.correctedAt ? `<p class="correction-note"><b>Correction</b> · ${esc(a.correctionNote)} <time>${new Date(a.correctedAt).toLocaleString(LOCALE, { ...IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></p>` : ""}
    <div class="reader-byline"><a href="/author/${w.key}" class="byline-link"><img src="${w.photo}" alt="" class="${w.isDesk ? "desk" : ""}"><span><b>${esc(w.name)}</b><span class="muted" style="display:block;font-size:13px">${esc(w.role)}</span></span></a><span class="grow"></span><span class="meta">${a.publishedAt ? editionDate(a.publishedAt) + " · " + clock(a.publishedAt) : "Not yet published"}${isWire(a) ? "" : ` · ${Math.max(1, Math.round(words / 200))} min read`}</span></div>
    ${a.videoUrl ? `<figure class="reader-hero reader-video"><video controls playsinline preload="metadata" src="${esc(a.videoUrl)}"${hero ? ` poster="${esc(hero)}"` : ""}></video>${a.heroCaption ? `<figcaption>${esc(a.heroCaption)}</figcaption>` : ""}</figure>` : hero ? `<figure class="reader-hero">${img(hero, a.heroCaption || "")}${a.heroCaption ? `<figcaption>${esc(a.heroCaption)}</figcaption>` : ""}</figure>` : ""}
    <div class="prose${isWire(a) ? "" : " dropcap"}" data-no-tr>${blocks.length ? proseHTML(blocks, { pull: isWire(a) ? "" : pullQuote(blocks) }) : `<p>This story could not be loaded.</p>`}</div>
    ${isWire(a) ? `<p class="wire-note">${ICON_INFO}<span>Written by the Rashtrix wire desk with AI assistance from several published reports, checked against each other. <a href="/disclaimer">How we write wire reports</a> · <a href="/corrections">Report an error</a></span></p>` : ""}
    ${(a.tags || []).length ? `<div class="story-tags"><span class="meta">Topics</span>${a.tags.map((t, i) => `<a class="tag-chip" href="/tag/${tagSlug(t)}">${esc(a.tagLabels?.[i] || t)}</a>`).join("")}</div>` : ""}
    ${shareBlock(a.title, a.href)}
    ${(a.corrections || []).length > 1 ? `<details class="corrections-log"><summary>Earlier corrections</summary><ul>${a.corrections.slice(1).map(c => `<li>${esc(c.note)} <time>${esc(String(c.at).slice(0, 16).replace("T", " "))}</time></li>`).join("")}</ul></details>` : ""}
    <div class="author-box"><img src="${w.photo}" alt="" class="${w.isDesk ? "desk" : ""}"><div><span class="kicker">${w.isDesk ? "From the desk" : "About the author"}</span><b><a href="/author/${w.key}">${esc(w.name)}</a></b><p>${esc(w.bio)}</p></div></div>
    <div class="reader-end glass discuss-end"><div><span class="kicker">Community</span><b style="display:block;font-size:17px;margin-top:4px">What do you make of this?</b><div class="muted" style="font-size:14px;margin-top:4px">Members discuss every story in moderated threads. Free to join.</div></div><button class="btn btn-dark" type="button" data-action="discuss" data-title="${esc(a.title)}">Discuss this story</button></div>
    ${relatedBlock(a, list)}
    <div class="prev-next">${newer ? `<a class="glass" href="${edHref(newer)}"><span class="meta">Newer</span><b>${esc(newer.title)}</b></a>` : "<span></span>"}${older ? `<a class="glass" href="${edHref(older)}"><span class="meta">Older</span><b>${esc(older.title)}</b></a>` : ""}</div>
  </article>
  <aside class="reader-aside">${communityAside()}<div class="aside-card glass"><div class="kicker">More from ${esc(a.category)}</div>
    ${list.filter(x => x.slug !== a.slug && x.category === a.category).slice(0, 6).map(x => `<a class="aside-link" href="${edHref(x)}"><span class="thumb">${pic(x)}</span><span><b>${esc(x.title)}</b><span class="meta" style="display:block;margin-top:5px;font-size:10px">${ago(x.publishedAt)}</span></span></a>`).join("")}
  </div></aside></div></div>`;
  countView(a);
}
// When the story is shown in a language other than the one it was written in, or isn't
// available in the reader's language yet.
function translationNote(a) {
  const own = a.original || a.lang, name = l => LANGUAGES[l]?.name || l;
  const origHref = withLang(a.href, own);
  if (a.lang !== lang) return `<p class="tr-note">${tr("This story is not available in your language yet. Here it is in the original.")} <span lang="${own}" data-no-tr>(${name(own)})</span></p>`;
  if (own !== a.lang) return `<p class="tr-note">${tr(a.machine ? "Translated automatically" : "Translated")} · <a href="${origHref}" data-lang="${own}" data-no-tr lang="${own}">${name(own)}</a></p>`;
  return "";
}
// One view per story per browser session; nothing is stored about the reader.
function countView(a) {
  if (a.status !== "published" || a.scheduled) return;
  startRead("story", a.slug, ".reader-article .prose");
  try { const k = `rw-v:${a.slug}`; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* storage off: still count */ }
  fetch(`/api/views/${encodeURIComponent(a.slug)}`, { method: "POST", keepalive: true }).catch(() => {});
}
const tagSlug = t => String(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Related: shared topics count most, then the same category, then recency.
function relatedBlock(a, list) {
  const tags = new Set((a.tags || []).map(t => t.toLowerCase()));
  const scored = list.filter(x => x.slug !== a.slug).map((x, i) => ({ x, score: (x.tags || []).filter(t => tags.has(t.toLowerCase())).length * 3 + (x.category === a.category ? 1 : 0) - i * 0.001 }))
    .filter(r => r.score > 0).sort((p, q) => q.score - p.score).slice(0, 3).map(r => r.x);
  if (!scored.length) return "";
  return `<section class="related"><div class="kicker">Related stories</div><div class="related-list">${scored.map(x => `<a class="related-row" href="${edHref(x)}"><span class="kicker">${esc(x.category)}${kindLabel(x) ? ` · ${kindLabel(x)}` : ""}</span><b>${esc(x.title)}</b><span class="meta">${ago(x.publishedAt)}</span></a>`).join("")}</div></section>`;
}

/* ---------- Sharing ---------- */
const SHARE_ICONS = {
  whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 .9c.3.2.5.2.5.3.1.2.1.7-.1 1.2Z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.3l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.1c.5-1 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6v5.4h-4v-4.8c0-1.2 0-2.6-1.6-2.6s-1.8 1.2-1.8 2.5v4.9h-4v-11Z"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.7 19.5c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.3 1.8 11.8c-1-.3-1-1 .2-1.5L20.5 3.2c.9-.3 1.6.2 1.4 1.1Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.2H7.5V12h2.8v10h3.7V12h2.8l.4-3.5H14Z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`
};
// Shared links carry utm_source, so visits from WhatsApp (which hides where readers came from)
// are counted in the control room. The site removes the tag from the address on arrival.
function tagged(url, src) { try { const u = new URL(url, location.origin); if (u.origin !== location.origin) return url; u.searchParams.set("utm_source", src); u.searchParams.set("utm_medium", "share"); return u.href; } catch { return url; } }
function shareLinks(text, raw) {
  const t = encodeURIComponent(text), link = src => encodeURIComponent(tagged(raw, src)), tu = src => encodeURIComponent(`${text} ${tagged(raw, src)}`);
  return [["whatsapp", "WhatsApp", `https://wa.me/?text=${tu("whatsapp")}`], ["x", "X", `https://twitter.com/intent/tweet?text=${t}&url=${link("x")}`], ["facebook", "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${link("facebook")}`], ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${link("linkedin")}`],
    ["telegram", "Telegram", `https://t.me/share/url?url=${link("telegram")}&text=${t}`], ["mail", "Email", `mailto:?subject=${t}&body=${tu("email")}`]];
}
// Where a video or short is shared to: the Watch page opens it (a short in the player).
const mediaUrl = m => `${location.origin}${withLang("/watch")}?v=${encodeURIComponent(m.id)}`;
const shareBtn = (title, url, cls = "update-share") => `<button class="${cls}" type="button" data-action="share-native" data-title="${esc(title)}" data-url="${esc(url)}" aria-label="Share">${SHARE_ICONS.share}<span>Share</span></button>`;
// No share sheet (most desktop browsers): a small panel with the social buttons instead.
function openSharePop(title, url) {
  let pop = $("#sharePop");
  if (!pop) {
    pop = document.createElement("div"); pop.id = "sharePop"; pop.className = "share-pop glass"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Share");
    document.body.append(pop);
    pop.addEventListener("click", e => { if (e.target.closest("[data-pop-close]") || e.target.closest("a.share-btn")) closeSharePop(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { e.stopPropagation(); closeSharePop(); } }, true);
    document.addEventListener("pointerdown", e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest("[data-action=share-native],[data-sv=share]")) closeSharePop(); });
  }
  pop.innerHTML = `<div class="share-pop-head"><b>${esc(title)}</b><button class="modal-close" type="button" data-pop-close aria-label="Close">×</button></div>${shareBlock(title, "", url).replace(/<button class="share-btn share-native"[^]*?<\/button>/, "")}`;
  pop.hidden = false;
  pop.querySelector("a.share-btn")?.focus({ preventScroll: true });
}
function closeSharePop() { const p = $("#sharePop"); if (p) p.hidden = true; }
async function shareOut(title, url) {
  if (navigator.share) { try { await navigator.share({ title, text: title, url: tagged(url, "share") }); } catch { /* cancelled */ } return; }
  openSharePop(title, url);
}
function shareBlock(title, href, url = location.origin + withLang(href)) {
  return `<div class="share-row"><span class="meta">Share</span><button class="share-btn share-native" type="button" data-action="share-native" data-title="${esc(title)}" data-url="${esc(url)}" aria-label="Share">${SHARE_ICONS.share}</button>${shareLinks(title, url).map(([k, label, link]) => `<a class="share-btn share-${k}" href="${link}" target="_blank" rel="noopener" aria-label="Share on ${label}">${SHARE_ICONS[k]}</a>`).join("")}<button class="share-btn" type="button" data-action="copy-link" data-url="${esc(tagged(url, "link"))}" aria-label="Copy link">${SHARE_ICONS.link}</button></div>`;
}
// Select text in a story to share it as a quote, with a link that jumps to that passage.
function quoteShare() {
  const bubble = document.createElement("div");
  bubble.className = "quote-bubble glass"; bubble.hidden = true; bubble.setAttribute("role", "toolbar"); bubble.setAttribute("aria-label", "Share this quote");
  document.body.append(bubble);
  const hide = () => { bubble.hidden = true; };
  const show = () => {
    const sel = getSelection(); if (!sel || sel.isCollapsed) return hide();
    const prose = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest(".reader-article .prose");
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!prose || text.length < 12 || text.length > 400) return hide();
    const title = $(".reader-article h1")?.textContent || "Rashtrix";
    const words = text.split(" "), frag = words.length > 8 ? `${encodeURIComponent(words.slice(0, 4).join(" "))},${encodeURIComponent(words.slice(-4).join(" "))}` : encodeURIComponent(text);
    const url = `${location.origin}${location.pathname}#:~:text=${frag}`, quote = `“${text.length > 240 ? text.slice(0, 237) + "…" : text}” — ${title}`;
    bubble.innerHTML = `<span class="meta">Share quote</span>${shareLinks(quote, url).filter(([k]) => k !== "mail").map(([k, label, link]) => `<a class="share-btn share-${k}" href="${link}" target="_blank" rel="noopener" aria-label="Share quote on ${label}">${SHARE_ICONS[k]}</a>`).join("")}<button class="share-btn" type="button" data-action="copy-quote" aria-label="Copy quote">${SHARE_ICONS.link}</button>`;
    bubble.dataset.quote = `${quote} ${url}`;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    bubble.hidden = false;
    const w = bubble.offsetWidth, below = matchMedia("(pointer: coarse)").matches;
    bubble.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + scrollX}px`;
    bubble.style.top = `${(below ? r.bottom + 12 : r.top - bubble.offsetHeight - 10) + scrollY}px`;
  };
  let t; document.addEventListener("selectionchange", () => { clearTimeout(t); t = setTimeout(show, 250); });
  window.addEventListener("scroll", () => { if (!bubble.hidden) show(); }, { passive: true });
}

/* ---------- Listen ----------
   Stories are read by a natural voice generated on the server (Google Chirp 3 HD, Bengali,
   English or Hindi as the story is shown), male or female as the reader picks, paragraph by
   paragraph with lock-screen controls. If that voice is not set up, the device's own voice is
   used, read sentence by sentence with natural pauses. */
const voicePref = () => store.get("rw-voice", "female") === "male" ? "male" : "female";
function toggleVoice() {
  const next = voicePref() === "male" ? "female" : "male";
  store.set("rw-voice", next);
  $$(".voice-btn").forEach(b => { b.textContent = tr(next === "male" ? "Male voice" : "Female voice"); });
  const wasOn = speech.active; stopListening();
  toast(next === "male" ? "The male voice will read stories." : "The female voice will read stories.");
  if (wasOn) toggleListening();
}
const speech = { queue: [], i: 0, active: false, mode: null, audio: null, parts: null, slug: null, timer: null, lang: "en" };
let ttsStatus = null;
const ttsAvailable = async () => (ttsStatus ??= fetch("/api/tts/status").then(r => r.ok ? r.json() : { enabled: false }).catch(() => ({ enabled: false }))).then(x => x.enabled);
// Device voices: female Indian English first (names used by Edge, Windows, Android, iOS and macOS).
const FEMALE_IN = /neerja|heera|veena|isha|kajal|ananya|aashi|swara|en-in-x-(ena|cxx|ahp)|female/i, MALE = /rishi|ravi|prabhat|male\b|kunal|aarav/i;
function voice() {
  const vs = speechSynthesis.getVoices();
  const male = voicePref() === "male";
  if (speech.lang !== "en") { // Bengali or Hindi: the device's voice for that language, the chosen sex first
    const own = vs.filter(v => new RegExp(`^${speech.lang}[-_]`, "i").test(v.lang));
    const fem = v => FEMALE_IN.test(v.name) || /lekha|kalpana|swara|tanishaa|female/i.test(v.name) ? 1 : 0;
    return own.sort((x, y) => male ? fem(x) - fem(y) : fem(y) - fem(x))[0] || null;
  }
  const en = vs.filter(v => /^en[-_]/i.test(v.lang));
  const ind = en.filter(v => /en[-_]IN/i.test(v.lang));
  const score = v => (/en[-_]IN/i.test(v.lang) ? 40 : /en[-_]GB/i.test(v.lang) ? 10 : 0) + (male ? (MALE.test(v.name) ? 50 : 0) - (FEMALE_IN.test(v.name) ? 30 : 0) : (FEMALE_IN.test(v.name) ? 30 : 0) - (MALE.test(v.name) ? 50 : 0)) + (/natural|online|enhanced|premium|neural/i.test(v.name) ? 20 : 0);
  return [...(ind.length ? ind : en)].sort((x, y) => score(y) - score(x))[0] || null;
}
function setListenButton(state_) {
  const b = $(".listen-btn"); if (!b) return;
  b.setAttribute("aria-pressed", String(state_ === "playing" || state_ === "loading"));
  b.innerHTML = `${state_ === "playing" ? ICON.pause : ICON.listen}<span class="lbl">${state_ === "loading" ? "Loading…" : state_ === "playing" ? "Pause" : state_ === "paused" ? "Resume" : "Listen"}</span>`;
}
function highlight(el) {
  $$(".speaking").forEach(x => x.classList.remove("speaking"));
  if (!el) return;
  el.classList.add("speaking");
  const r = el.getBoundingClientRect();
  if (r.top > innerHeight * 0.7 || r.bottom < 120) el.scrollIntoView({ behavior: "smooth", block: "center" });
}
// Elements in reading order, matching the server's parts: headline, standfirst, then the text
// (the pull quote repeats a sentence, so it is skipped).
const readingElements = art => $$("h1, .dek, .prose > p, .prose > h2, .prose li", art).filter(el => el.innerText.trim());

// Natural voice: one audio element plays each part in turn; the next part is fetched ahead.
async function playNatural(slug, art) {
  const r = await fetch(`/api/tts/${encodeURIComponent(slug)}?lang=${speech.lang}&voice=${voicePref()}`);
  if (!r.ok) throw new Error("tts");
  speech.parts = (await r.json()).parts; speech.slug = slug; speech.mode = "natural";
  speech.queue = readingElements(art);
  speech.audio ||= Object.assign(new Audio(), { preload: "auto" });
  speech.audio.onended = () => { speech.i++; playPart(); };
  speech.audio.onerror = () => { speech.i++; playPart(); };
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: $("h1", art)?.innerText || "Rashtrix", artist: "Rashtrix 24×7 News", album: "Listen", artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] });
    navigator.mediaSession.setActionHandler("play", () => { speech.audio.play(); setListenButton("playing"); });
    navigator.mediaSession.setActionHandler("pause", () => { speech.audio.pause(); setListenButton("paused"); });
    navigator.mediaSession.setActionHandler("nexttrack", () => { speech.i++; playPart(); });
    navigator.mediaSession.setActionHandler("previoustrack", () => { speech.i = Math.max(0, speech.i - 1); playPart(); });
  }
  speech.i = 0; await playPart();
}
const partUrl = n => `/api/tts/${encodeURIComponent(speech.slug)}/${n}.mp3?v=${speech.parts[n].v}&lang=${speech.lang}&voice=${voicePref()}`;
async function playPart() {
  if (!speech.active) return;
  if (speech.i >= speech.parts.length) return stopListening();
  highlight(speech.queue.length === speech.parts.length ? speech.queue[speech.i] : null);
  speech.audio.src = partUrl(speech.i);
  if (speech.parts[speech.i + 1]) fetch(partUrl(speech.i + 1)).catch(() => {}); // warm the next part
  try { await speech.audio.play(); setListenButton("playing"); }
  catch { setListenButton("paused"); } // autoplay blocked: the reader taps Resume
}

// Device voice: sentence by sentence, slightly slower, with pauses between paragraphs.
function speakNext() {
  const el = speech.queue[speech.i];
  if (!el || !speech.active) { stopListening(); return; }
  highlight(el);
  const sentences = el.innerText.match(/[^.!?…।]+[.!?…।]+["’”)]*|\S[^.!?…।]*$/g) || [el.innerText];
  const isHeading = el.matches("h1, h2");
  const v = voice();
  sentences.forEach((text, k) => {
    const u = new SpeechSynthesisUtterance(text.trim());
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = LANGUAGES[speech.lang]?.locale || "bn-IN";
    u.rate = isHeading ? 0.9 : 0.94; u.pitch = isHeading ? 1.02 : 1.06;
    if (/\?\s*$/.test(text)) u.pitch += 0.06;          // a lift for questions
    if (k === sentences.length - 1) u.onend = () => { speech.timer = setTimeout(() => { speech.i++; speakNext(); }, isHeading ? 650 : 420); };
    u.onerror = () => { if (k === sentences.length - 1) { speech.i++; speakNext(); } };
    speechSynthesis.speak(u);
  });
}
async function toggleListening() {
  if (speech.active && speech.mode === "natural") {
    if (speech.audio.paused) { speech.audio.play(); setListenButton("playing"); } else { speech.audio.pause(); setListenButton("paused"); }
    return;
  }
  if (speech.active && speech.mode === "device") {
    if (speechSynthesis.speaking && !speechSynthesis.paused) { speechSynthesis.pause(); setListenButton("paused"); }
    else { speechSynthesis.resume(); setListenButton("playing"); }
    return;
  }
  const art = $(".reader-article"); if (!art) return;
  speech.active = true; speech.i = 0; speech.lang = art.dataset.lang || "bn"; // the language the story is shown in
  const pg = parseRoute(), slug = ["edition", "article"].includes(pg.page) ? pg.arg : null;
  if (slug && await ttsAvailable()) {
    setListenButton("loading");
    try { await playNatural(slug, art); return; } catch { /* fall back to the device voice */ }
  }
  if (!("speechSynthesis" in window)) { speech.active = false; setListenButton("idle"); toast("This device can’t read aloud."); return; }
  speech.mode = "device"; speech.queue = readingElements(art);
  speechSynthesis.cancel(); setListenButton("playing"); speakNext();
}
function stopListening() {
  speech.active = false; speech.mode = null; clearTimeout(speech.timer);
  if (speech.audio) { speech.audio.pause(); speech.audio.removeAttribute("src"); }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  highlight(null); setListenButton("idle");
}
// Some browsers load their voice list late.
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};

/* ---------- Topics: tag pages and My Rashtrix ---------- */
function allTagsFromStories() {
  const m = new Map();
  for (const x of stories()) for (const t of x.tags || []) { const k = tagSlug(t); const c = m.get(k) || { name: t, slug: k, count: 0 }; c.count++; m.set(k, c); }
  return [...m.values()].sort((p, q) => q.count - p.count || p.name.localeCompare(q.name));
}
const CATEGORY_TOPICS = DESKS;
const followBtn = name => `<button class="btn btn-sm ${state.topics?.includes(name) ? "btn-dark" : "btn-light"} follow-btn" type="button" data-action="follow" data-topic="${esc(name)}" aria-pressed="${!!state.topics?.includes(name)}">${state.topics?.includes(name) ? "Following" : "+ Follow"}</button>`;
function viewTag(r) {
  const t = allTagsFromStories().find(x => x.slug === r.arg) || (CATEGORY_TOPICS.find(c => tagSlug(c) === r.arg) && { name: CATEGORY_TOPICS.find(c => tagSlug(c) === r.arg), slug: r.arg });
  if (!t) return viewNotFound();
  const list = stories().filter(x => (x.tags || []).some(y => tagSlug(y) === t.slug) || tagSlug(x.category || "") === t.slug);
  document.title = `${t.name} · ${tr("Rashtrix 24×7 News")}`;
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Topic</div><h1>${esc(t.name)}</h1><p>${list.length} stor${list.length === 1 ? "y" : "ies"}, newest first. Follow the topic to see it on your own front page, My Rashtrix.</p></div>${followBtn(t.name)}</div>
    <div class="archive-grid">${list.map(e => edCard(e, { dek: true })).join("") || `<div class="empty">No stories on this topic yet.</div>`}</div></div>`;
}
async function loadTopics() {
  if (!state.user) { state.topics = []; return; }
  try { state.topics = (await fetch("/api/topics").then(r => r.json())).topics || []; } catch { state.topics = []; }
}
async function toggleFollow(name) {
  if (!state.user) { openAuth("register"); toast("Create a free account to follow topics."); return; }
  const on = state.topics.includes(name);
  try {
    const r = await fetch(on ? `/api/topics/${encodeURIComponent(name)}` : "/api/topics", { method: on ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: on ? undefined : JSON.stringify({ topic: name }) });
    if (!r.ok) throw new Error();
    state.topics = on ? state.topics.filter(x => x !== name) : [...state.topics, name].sort();
    toast(on ? `Stopped following ${tr(name)}.` : `Following ${tr(name)}. It’s on My Rashtrix.`);
    const pg = parseRoute(); if (pg.page === "tag") viewTag(pg); else if (pg.page === "my") viewMy();
  } catch { toast("That didn’t save. Try again."); }
}
async function viewMy() {
  document.title = `${tr("My Rashtrix")} · ${tr("Rashtrix 24×7 News")}`;
  if (!state.user) {
    $("#view").innerHTML = `<div class="wrap"><section class="join-panel my-invite"><div class="join-copy"><span class="join-eyebrow"><span class="pulse"></span>My Rashtrix</span><h2>Your own front page.</h2><p class="join-lede">Follow the desks and topics you care about, from Kolkata to the world, and keep your saved stories on every device. Free for members.</p><div class="join-actions"><button class="btn btn-red" type="button" data-action="join">Create a free account</button><button class="btn btn-ghost" type="button" data-action="signin">Sign in</button></div></div></section></div>`;
    return;
  }
  const followed = state.topics || [], fl = new Set(followed.map(x => x.toLowerCase()));
  const mine = stories().filter(x => fl.has(String(x.category).toLowerCase()) || (x.tags || []).some(t => fl.has(t.toLowerCase())));
  const suggest = [...CATEGORY_TOPICS.map(name => ({ name })), ...allTagsFromStories().slice(0, 18)].filter((x, i, arr) => arr.findIndex(y => y.name.toLowerCase() === x.name.toLowerCase()) === i);
  const saved = await savedItems();
  if (parseRoute().page !== "my") return;
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">My Rashtrix</div><h1>${esc(state.user.displayName.split(" ")[0])}’s front page</h1><p>Stories on the topics you follow, newest first, and your saved stories. Synced to your account.</p></div><button class="btn btn-light" type="button" data-action="alerts">${ICON_BELL} Alerts</button></div>
    <section class="my-topics glass"><div class="kicker">Topics you follow</div><div class="chips">${suggest.map(x => `<button type="button" class="chip" data-action="follow" data-topic="${esc(x.name)}" aria-pressed="${fl.has(x.name.toLowerCase())}">${fl.has(x.name.toLowerCase()) ? "✓ " : "+ "}${esc(x.name)}</button>`).join("")}</div></section>
    ${followed.length ? `<section class="band"><div class="section-head"><h2>For you</h2></div><div class="archive-grid">${mine.slice(0, 12).map(e => edCard(e, { dek: true })).join("") || `<div class="empty">Nothing new on your topics yet.</div>`}</div></section>
`
      : `<div class="empty" style="margin-top:22px">Pick a few topics above and your stories will appear here.</div>`}
    <section class="band"><div class="section-head"><h2>Saved stories</h2><a class="link-gold" href="/saved">All saved →</a></div><div class="live-list">${saved.slice(0, 6).map(x => `<a class="live-item glass" href="${esc(x.href)}" style="grid-template-columns:88px minmax(0,1fr)"><span class="when">${ago(x.savedAt)}</span><span><b>${esc(x.title)}</b><span class="src">${esc(x.source)}</span></span></a>`).join("") || `<div class="empty">Nothing saved yet.</div>`}</div></section></div>`;
}

/* ---------- Breaking-news alerts (Web Push) ---------- */
const ICON_GLOBE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.8 5.8 3.8 9s-1.2 6.2-3.8 9c-2.6-2.8-3.8-5.8-3.8-9S9.4 5.8 12 3Z"/></svg>`;
const ICON_BELL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>`;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64ToBytes = s => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function currentPush() { try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; } }
// Alerts are on by default. Everyone gets them inside the site (the bell's inbox and a banner
// for new ones); phone and desktop notifications need the reader's one-time "Allow", which
// browsers require, so the site asks for it automatically and re-subscribes silently.
const ALERT_TYPES = ["Major breaking news", "Live coverage as it starts", "New Rashtrix stories", "Morning brief at 9 am, evening wrap at 9 pm"];
async function syncAlertsButton() {
  const on = pushSupported() && Notification.permission === "granted" && !!(await currentPush());
  state.pushOn = on;
  $$(".icon-btn[data-action=alerts]").forEach(b => { b.classList.toggle("is-on", on); b.title = on ? "Alerts are on on this device" : "Alerts"; });
  renderAlertsPanel();
  return on;
}
async function enableAlerts({ silent = false } = {}) {
  if (!pushSupported()) {
    if (silent) return false;
    if (isIOS() && !isStandalone()) { showInstallSheet({ force: true }); toast("On iPhone, add Rashtrix to your Home Screen, open it from there, and alerts will be offered."); }
    else toast("This browser can’t show notifications. You’ll still see alerts here on the site.");
    return false;
  }
  if (Notification.permission === "denied") { if (!silent) toast("Notifications are blocked for this site. Allow them in your browser’s site settings to get alerts on this device."); return false; }
  if (Notification.permission !== "granted" && (silent || await Notification.requestPermission() !== "granted")) { if (!silent) toast("Not turned on. You’ll still see alerts here on the site."); return false; }
  try {
    const { publicKey } = await fetch("/api/push/key").then(r => r.json());
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error);
    if (!silent) toast("Alerts are on for this device.");
  } catch (e) { if (!silent) toast(e.message || "Alerts couldn’t be turned on. Try again."); }
  return syncAlertsButton();
}
async function disableAlerts() {
  const existing = await currentPush();
  if (existing) {
    await fetch("/api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) }).catch(() => {});
    await existing.unsubscribe().catch(() => {});
  }
  store.set("rw-alerts-optout", Date.now());
  toast("Notifications are off on this device. Alerts still appear here on the site."); syncAlertsButton();
}
// The bell: an inbox of recent alerts, unread count, and the device switch.
async function loadAlerts() {
  try {
    const list = (await fetch("/api/alerts").then(r => r.json())).alerts || [];
    const known = state.alerts?.[0]?.id, fresh = list[0];
    state.alerts = list;
    // A new alert while the site is open: show it as a banner.
    if (known && fresh && fresh.id !== known && !document.hidden) showAlertBanner(fresh);
  } catch { state.alerts = state.alerts || []; }
  renderAlertsPanel();
}
const alertTime = d => new Date(String(d).replace(" ", "T") + (/[zZ+]/.test(String(d)) ? "" : "Z"));
function unreadAlerts() { const seen = store.get("rw-alerts-seen", 0); return (state.alerts || []).filter(a => alertTime(a.createdAt) > seen).length; }
function renderAlertsPanel() {
  const n = unreadAlerts();
  $$(".icon-btn[data-action=alerts]").forEach(b => { b.dataset.count = n > 9 ? "9+" : n || ""; b.setAttribute("aria-label", n ? `Alerts, ${n} new` : "Alerts"); });
  // The unread count on the home-screen icon of the installed app, where the phone supports it.
  try { (n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.())?.catch?.(() => {}); } catch { /* not supported */ }
  const panel = $("#alertsPanel"); if (!panel || panel.hidden) return;
  const device = state.pushOn ? ""
    : `<div class="ap-device"><span><b>Get these on your ${isIOS() || /Android/i.test(navigator.userAgent) ? "phone" : "device"}</b><small>${pushSupported() ? "One tap to allow notifications." : isIOS() && !isStandalone() ? "Add Rashtrix to your Home Screen first." : "This browser can’t show notifications."}</small></span><button class="btn btn-red btn-sm" type="button" data-action="alerts-on">Turn on</button></div>`;
  panel.innerHTML = `<div class="ap-head"><b>Alerts</b><button class="modal-close" type="button" data-action="alerts-close" aria-label="Close">×</button></div>${device}
    <ol class="ap-list">${(state.alerts || []).map(a => `<li class="${alertTime(a.createdAt) > store.get("rw-alerts-seen", 0) ? "unread" : ""}"><a href="${esc(a.url || "/")}" data-action="alerts-close"><b>${esc(a.title)}</b>${a.body ? `<span>${esc(a.body)}</span>` : ""}<small>${ago(alertTime(a.createdAt).toISOString())}</small></a></li>`).join("") || `<li class="ap-empty">No alerts yet. New stories, live coverage, briefings and the 9 am and 9 pm briefs will appear here.</li>`}</ol>
    ${state.pushOn ? `<p class="ap-foot">Notifications are on for this device · <button type="button" data-action="alerts-off">Turn off</button></p>` : ""}`;
}
function toggleAlertsPanel(force) {
  const panel = $("#alertsPanel"), open = force ?? panel.hidden;
  panel.hidden = !open;
  if (open) { renderAlertsPanel(); store.set("rw-alerts-seen", Date.now()); setTimeout(renderAlertsPanel, 1500); loadAlerts(); }
  else renderAlertsPanel();
}
function showAlertBanner(a) {
  const el = $("#alertBanner");
  el.innerHTML = `<span class="live-badge"><span class="pulse"></span>Alert</span><a href="${esc(a.url || "/")}" data-action="banner-close"><b>${esc(a.title)}</b>${a.body ? ` <span>${esc(a.body)}</span>` : ""}</a><button class="modal-close" type="button" data-action="banner-close" aria-label="Dismiss">×</button>`;
  el.hidden = false; clearTimeout(showAlertBanner.t); showAlertBanner.t = setTimeout(() => { el.hidden = true; }, 12000);
}
// Ask for notifications automatically: once on a first visit, and again after three days if
// the reader said "Not now". Readers who turned them off themselves are not asked again.
function maybeAskForAlerts() {
  if (!pushSupported() || Notification.permission !== "default" || store.get("rw-alerts-optout", 0)) return;
  if (Date.now() - (store.get("rw-alerts-asked", 0) || 0) < 3 * 864e5) return;
  setTimeout(() => {
    if (Notification.permission !== "default" || !$("#installSheet").hidden || !$("#modalBackdrop").classList.contains("hidden")) return;
    $("#alertsSheet").hidden = false; store.set("rw-alerts-asked", Date.now());
  }, 5000);
}
/* ---------- About and legal pages ---------- */
function docPage({ kicker, title, html, nav, updated }) {
  return `<div class="wrap"><div class="doc-layout">${nav ? `<aside class="doc-nav glass"><span class="kicker">Legal</span>${nav}</aside>` : ""}
    <article class="doc glass"><span class="kicker">${kicker}</span><h1>${title}</h1>${updated ? `<p class="meta">Last updated ${updated}</p>` : ""}${html}</article></div></div>`;
}
// In Hindi or Bengali the page comes translated from the server (English until it is ready).
async function localPage(key, fallback) {
  if (lang === "en") return { ...fallback, lang: "en" };
  try { const r = await fetch(`/api/pages/${key}?lang=${lang}`); if (r.ok) return (await r.json()).page; } catch { /* offline */ }
  // Offline: the Bengali bundled with the app, else the English.
  return fallback[lang] ? { ...fallback, ...fallback[lang], lang } : { ...fallback, lang: "en" };
}
function pageNote(p, legal) {
  if (lang === "en") return "";
  if (p.lang !== lang) return `<p class="tr-note">${tr("This page is not available in your language yet. Here it is in English.")}</p>`;
  return legal ? `<p class="tr-note">${tr("This is a translation for your convenience. If it differs from the English version, the English version prevails.")}</p>` : "";
}
async function viewAbout() {
  const p = await localPage("about", ABOUT);
  if (parseRoute().page !== "about") return;
  document.title = `${p.title} · ${tr("Rashtrix 24×7 News")}`;
  $("#view").innerHTML = docPage({ kicker: "About", title: `<span data-no-tr>${esc(p.title)}</span>`, html: pageNote(p) + `<div data-no-tr${p.lang === "en" ? ' lang="en"' : ""}>${p.html}</div>` });
}
async function viewLegal(r) {
  const doc = LEGAL[r.page];
  const p = await localPage(r.page, doc);
  if (parseRoute().page !== r.page) return;
  document.title = `${p.title} · ${tr("Rashtrix 24×7 News")}`;
  const nav = LEGAL_ORDER.map(([k, t]) => `<a href="/${k}"${k === r.page ? ' aria-current="page"' : ""}>${t}</a>`).join("") + `<a href="/about">About Rashtrix</a>`;
  $("#view").innerHTML = docPage({ kicker: "Rashtrix", title: `<span data-no-tr>${esc(p.title)}</span>`, html: pageNote(p, true) + `<div data-no-tr${p.lang === "en" ? ' lang="en"' : ""}>${p.html}</div>`, nav, updated: LEGAL_UPDATED });
}

/* ---------- Writers ---------- */
function viewAuthor(r) {
  const w = WRITERS.find(x => x.key === r.arg);
  if (!w) return viewNotFound();
  const list = stories().filter(x => x.writer === w.key);
  document.title = `${w.name} · ${tr("Rashtrix 24×7 News")}`;
  $("#view").innerHTML = `<div class="wrap"><section class="author-hero glass">
    <img class="author-portrait${w.isDesk ? " desk" : ""}" src="${w.portrait}" alt="${w.isDesk ? "" : `Portrait of ${esc(w.name)}`}">
    <div><span class="kicker">${w.isDesk ? "Desk" : "Writer"}</span><h1>${esc(w.name)}</h1><p class="author-role">${esc(w.role)}</p><p>${esc(w.bio)}</p><span class="meta">${list.length} stor${list.length === 1 ? "y" : "ies"} on Rashtrix</span></div></section>
    <div class="archive-grid">${list.map(e => edCard(e, { dek: true })).join("") || `<div class="empty">No published stories yet.</div>`}</div></div>`;
}

/* ---------- Latest: every story, newest first, with live coverage on top ---------- */
function viewLive(r) {
  if (r.page === "editions") history.replaceState(history.state, "", withLang("/live"));
  document.title = `${tr("Latest news")} · ${tr("Rashtrix 24×7 News")}`;
  $("#view").innerHTML = `<div class="wrap"><section id="liveNow" class="live-now" aria-label="Live now" hidden></section><div class="page-head"><div><div class="kicker" style="display:flex;align-items:center;gap:8px"><span class="dot-live"></span>Latest</div><h1>Latest news</h1><p>Everything from Rashtrix, newest first: our reporters’ stories, wire reports and briefs.</p></div></div>
    <div class="chips" style="margin-top:20px"><a class="chip" href="/live" aria-pressed="true">All</a>${DESKS.map(d => `<a class="chip" href="${deskHref(d)}">${esc(d)}</a>`).join("")}<a class="chip" href="/briefs">Briefs</a></div>
    <div class="stream stream-page" id="liveList"></div></div>`;
  renderLiveNow(); renderLiveList();
}
function renderLiveList() {
  const host = $("#liveList"); if (!host) return;
  const items = stories().slice(0, 120);
  host.innerHTML = items.length ? items.map(streamItem).join("") : wireEmpty();
}

/* ---------- Saved & search ---------- */
// Saved stories: this device's list, merged with the member's synced list when signed in.
async function savedItems() {
  const local = store.get("rw-saved", []);
  if (!state.user) return local;
  try {
    const r = await fetch("/api/me/saved"); if (!r.ok) return local;
    const remote = (await r.json()).items || [], seen = new Set(remote.map(x => x.href));
    return [...remote, ...local.filter(x => !seen.has(x.href))].sort((x, y) => new Date(y.savedAt) - new Date(x.savedAt));
  } catch { return local; }
}
async function viewSaved() {
  const saved = await savedItems();
  if (parseRoute().page !== "saved") return;
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Saved</div><h1>Saved for later</h1><p>${state.user ? "Your saved stories, on every device where you’re signed in." : "Stories you save are kept on this device. <a href=\"#\" data-action=\"join\">Join free</a> to have them on all your devices."}</p></div></div>
  <div class="live-list">${saved.length ? saved.map(s => `<div class="live-item glass saved-row" style="grid-template-columns:88px minmax(0,1fr) auto"><span class="when">${ago(s.savedAt)}</span><a href="${esc(s.href)}"><b>${esc(s.title)}</b><span class="src">${esc(s.source)}</span></a><button class="btn btn-light btn-sm" type="button" data-action="unsave" data-href="${esc(s.href)}">Remove</button></div>`).join("") : `<div class="empty">Nothing saved yet. Use Save in the reader to keep a story here.</div>`}</div></div>`;
}
async function unsave(href) {
  store.set("rw-saved", store.get("rw-saved", []).filter(x => x.href !== href));
  if (state.user) await fetch(`/api/me/saved?href=${encodeURIComponent(href)}`, { method: "DELETE" }).catch(() => {});
  toast("Removed from saved."); viewSaved();
}
// On sign-in, this device's saves join the member's synced list.
function mergeLocalSaves() {
  const local = store.get("rw-saved", []).filter(x => x.href?.startsWith("/"));
  if (state.user && local.length) fetch("/api/me/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: local }) }).catch(() => {});
}
const matches = (e, ql) => `${e.title} ${e.dek} ${e.category} ${tr(e.category)} ${(e.tags || []).join(" ")}`.toLowerCase().includes(ql);
function viewSearch(r) {
  const q = (r.params.get("q") || "").trim(), ql = q.toLowerCase();
  const found = stories().filter(e => matches(e, ql));
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Search</div><h1>“${esc(q)}”</h1><p>${found.length} stor${found.length === 1 ? "y" : "ies"}</p></div></div>
  ${found.length ? `<div class="stream stream-page">${found.slice(0, 100).map(streamItem).join("")}</div>` : `<div class="empty" style="margin-top:22px">Nothing matched. Try a place, a topic or a name.</div>`}</div>`;
}

/* ---------- Actions ---------- */
async function onAction(e) {
  const el = e.target.closest("[data-action]"); if (!el) return;
  const a = el.dataset.action;
  if (a === "back") { e.preventDefault(); history.state?.rw ? history.back() : navigate("/"); }
  if (a === "text-smaller") setTextScale(-0.1);
  if (a === "text-larger") setTextScale(0.1);
  if (a === "save") { try { saveForLater(JSON.parse(el.dataset.item)); } catch { /* malformed */ } }
  if (a === "refresh-all") { e.preventDefault(); refreshAll(); }
  if (a === "apply-new") {
    e.preventDefault(); hideNewPill();
    if (state.pendingArticles) { state.articles = state.pendingArticles; state.pendingArticles = null; }
    rerenderStories(); scrollTo({ top: 0, behavior: "smooth" });
  }
  if (a === "dismiss-new") { e.preventDefault(); hideNewPill(); }
  if (a === "share-native") {
    e.preventDefault();
    await shareOut(el.dataset.title, el.dataset.url);
  }
  if (a === "share") {
    const data = { title: el.dataset.title, url: tagged(location.href, "share") };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(tagged(location.href, "link")); toast("Link copied."); } } catch { /* cancelled */ }
  }
  if (a === "ticker-toggle") { const paused = $(".ticker").classList.toggle("paused"); el.setAttribute("aria-pressed", String(paused)); el.setAttribute("aria-label", paused ? "Play headlines" : "Pause headlines"); }
  if (a === "search") openSearch();
  if (a === "ics") downloadIcs(el.dataset.event);
  if (a === "install") { e.preventDefault(); installPWA(); }
  if (a === "install-open") { e.preventDefault(); openInstalledPWA(); }
  if (a === "install-dismiss") { store.set("rw-install-dismissed", Date.now()); $("#installSheet").hidden = true; }
  if (a === "update-later") $("#updateBar").hidden = true;
  if (a === "lang-later") { $("#langSuggest").hidden = true; setLanguagePreference(lang); }
  if (a === "apply-update") { waitingWorker?.postMessage({ type: "SKIP_WAITING" }); $("#updateBar").hidden = true; }
  if (a === "signin") openAuth("login");
  if (a === "join") openAuth("register");
  if (a === "signout") { toggleAccountMenu(false); signOut(); }
  if (a === "listen") toggleListening();
  if (a === "voice") toggleVoice();
  if (a === "tv-ch") { store.set("rw-tv-ch", el.dataset.ch); $$("[data-action=tv-ch]").forEach(b => b.setAttribute("aria-selected", String(b === el))); $("#tvWatch")?.classList.toggle("is-v", el.dataset.ch === "v"); mountWatchTV(); }
  if (a === "short") openShorts(Number(el.dataset.index) || 0);
  if (a === "play-video") playInline(el.dataset.id);
  if (a === "lead-step") { const t = document.getElementById("lcTrack"), c = t?.children[0]; if (t && c) t.scrollBy({ left: Number(el.dataset.dir) * (c.offsetWidth + 16), behavior: "smooth" }); }
  if (a === "carousel") { const c = el.closest("section")?.querySelector(".vcarousel"); c?.scrollBy({ left: Number(el.dataset.dir) * c.clientWidth * .85, behavior: "smooth" }); }
  if (a === "copy-link" || a === "copy-quote") { e.preventDefault(); const text = a === "copy-link" ? el.dataset.url : el.closest(".quote-bubble")?.dataset.quote; try { await navigator.clipboard.writeText(text); toast(a === "copy-link" ? "Link copied." : "Quote copied with a link."); } catch { toast("Couldn’t copy. Select and copy instead."); } }
  if (a === "unsave") unsave(el.dataset.href);
  if (a === "vote") { e.preventDefault(); vote(el.dataset.id, el); }
  if (a === "follow") toggleFollow(el.dataset.topic);
  if (a === "alerts") { e.stopPropagation(); toggleAccountMenu(false); toggleAlertsPanel(); }
  if (a === "alerts-close") toggleAlertsPanel(false);
  if (a === "alerts-on" || a === "alerts-allow") { $("#alertsSheet").hidden = true; enableAlerts(); }
  if (a === "alerts-later") { $("#alertsSheet").hidden = true; store.set("rw-alerts-asked", Date.now()); }
  if (a === "alerts-off") disableAlerts();
  if (a === "banner-close") $("#alertBanner").hidden = true;
  if (a === "theme") toggleTheme();
  if (a === "discuss") { if (!state.user) { openAuth("register"); toast("Create a free account to start a discussion."); } else openDiscussionDialog(el.dataset.title ? `On “${el.dataset.title}”` : ""); }
}

/* ---------- Ticker, clock, live coverage ---------- */
function renderClocks() {
  const host = $("#clocks"); if (!host) return;
  host.innerHTML = `<span><b>${tr("Kolkata")}</b> ${digits(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }))}</span>`;
}
function renderTicker() {
  const host = $("#tickerMove"); if (!host) return;
  const live = state.coverage.slice(0, 2).map(c => `<a class="ticker-item is-live" href="/coverage/${encodeURIComponent(c.slug)}"><b>Live</b>${esc(c.title)}</a>`);
  // News from the last 36 hours runs under "Breaking"; with none, the latest headlines run
  // under "Headlines", so the ticker is never empty.
  const fresh = stories().filter(a => Date.now() - Date.parse(a.publishedAt) < 36 * 3600e3);
  const pick = fresh.length ? fresh : stories().slice(0, 10);
  const wire = pick.slice(0, 14).map(i => `<a class="ticker-item" href="${edHref(i)}"><time>${fresh.length ? clock(i.publishedAt) : ago(i.publishedAt)}</time>${esc(i.title)}</a>`);
  const label = $("#tickerLabel"); if (label) label.textContent = live.length || fresh.length ? "Breaking" : "Headlines";
  const items = [...live, ...wire];
  if (!items.length) { host.innerHTML = `<span class="ticker-item muted">${articlesSettled ? "Rashtrix 24×7 News" : "Loading the latest news…"}</span>`; host.classList.remove("moving"); return; }
  // Two copies make the loop seamless; the second is hidden from assistive tech.
  host.innerHTML = `<div class="ticker-set">${items.join("")}</div><div class="ticker-set" aria-hidden="true">${items.join("").replaceAll("<a ", '<a tabindex="-1" ')}</div>`;
  host.style.setProperty("--ticker-duration", `${Math.max(24, items.length * 4.5)}s`);
  host.classList.add("moving");
}
async function loadCoverage() {
  try {
    const d = await fetch(`/api/live?lang=${lang}`).then(r => r.ok ? r.json() : null);
    if (!d) throw new Error("live");
    // Only coverage that went live after this page opened counts as new (a first answer from the
    // offline copy, or one that failed, must not make running coverage look new).
    const before = state.coverageSeen && new Set(state.coverage.map(c => c.id));
    state.coverage = d.items || []; state.coverageSeen = true;
    const started = before ? state.coverage.filter(c => !before.has(c.id) && Date.parse(c.startedAt) > PAGE_OPENED - 60e3) : [];
    if (started.length) { state.newLive = started[0]; showNewPill(); }
    // Every coverage that is live right now (up to eight), each with its updates and counter.
    const all = await Promise.all(state.coverage.slice(0, 8).map(async c => {
      return fetch(`/api/live/${encodeURIComponent(c.slug)}?lang=${lang}`).then(r => r.ok ? r.json() : null).catch(() => null);
    }));
    state.coverageAll = all.filter(d => d?.item && d.item.status === "live");
    state.coverageLead = state.coverageAll[0] || null;
  } catch { state.coverage ||= []; } // keep what is shown when a refresh fails
  renderTicker(); renderLiveBanner(); renderLiveNow(); renderRail(); renderLeadCarousel(); renderNav(parseRoute());
}
let bannerTimer;
// One live coverage as a broadcast tile: the coverage photo with a blinking LIVE tab, the headline,
// then either the results counter (election or war coverage) or the latest update, and a button.
function liveTile(lead) {
  const href = `/coverage/${encodeURIComponent(lead.item.slug)}`, latest = lead.updates[0];
  const pic = lead.item.imageUrl && /^(https?:|\/media\/)/.test(lead.item.imageUrl) ? lead.item.imageUrl : "";
  return `<a class="live-banner ${pic ? "has-img" : "no-img"}" href="${href}">
    <span class="lb-media" aria-hidden="true">${pic ? `<img src="${esc(pic)}" alt="" decoding="async">` : `<span class="lb-glow"></span>`}<span class="live-tab"><span class="pulse"></span>Live</span></span>
    <span class="lb-body">
      <span class="lb-meta">Live coverage · ${lead.updates.length} update${lead.updates.length === 1 ? "" : "s"}${latest ? ` · ${ago(latest.createdAt)}` : ""}</span>
      <span class="lb-title">${esc(lead.item.title)}</span>
      ${(latest ? `<span class="lb-latest"><time>${clock(latest.createdAt)}</time>${esc(String(latest.body).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`|^#+\s*/gm, ""))}</span>` : "")}
    </span>
    <span class="lb-go">Follow live <span aria-hidden="true">→</span></span></a>`;
}
// Home: one live coverage is a single tile; several become a swipeable carousel (the next one
// peeks in), with dots, "1 / 3", and a gentle advance every 8 s that stops once the reader touches it.
let liveSlide = 0, liveAuto = true;
function renderLiveBanner() {
  const host = $("#liveBanner"); if (!host) return;
  const all = state.coverageAll || [];
  if (!all.length) { host.innerHTML = ""; host.hidden = true; return; }
  host.hidden = false;
  if (all.length === 1) { host.innerHTML = liveTile(all[0]); return; }
  const keep = host.querySelector(".lb-track")?.scrollLeft || 0;
  host.innerHTML = `<div class="lb-carousel" aria-roledescription="carousel" aria-label="Live now">
    <div class="lb-head"><span class="lb-now"><span class="dot-live"></span>${all.length} live now</span><span class="lb-count" aria-live="polite">${Math.min(liveSlide, all.length - 1) + 1} / ${all.length}</span></div>
    <div class="lb-track">${all.map((d, i) => `<div class="lb-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${all.length}">${liveTile(d)}</div>`).join("")}</div>
    <div class="lb-dots">${all.map((_, i) => `<button type="button" class="${i === liveSlide ? "on" : ""}" data-slide="${i}" aria-label="Live coverage ${i + 1}"></button>`).join("")}</div></div>`;
  const track = host.querySelector(".lb-track");
  track.scrollLeft = keep;
  const slideW = () => track.querySelector(".lb-slide").getBoundingClientRect().width + 12;
  const show = i => { liveSlide = (i + all.length) % all.length; track.scrollTo({ left: liveSlide * slideW(), behavior: "smooth" }); };
  const sync = () => {
    liveSlide = Math.min(all.length - 1, Math.round(track.scrollLeft / slideW()));
    host.querySelectorAll(".lb-dots button").forEach((b, i) => b.classList.toggle("on", i === liveSlide));
    const c = host.querySelector(".lb-count"); if (c) c.textContent = `${liveSlide + 1} / ${all.length}`;
  };
  track.addEventListener("scroll", () => { clearTimeout(track.t); track.t = setTimeout(sync, 80); }, { passive: true });
  ["pointerdown", "touchstart", "wheel", "keydown"].forEach(ev => track.addEventListener(ev, () => { liveAuto = false; }, { passive: true }));
  host.querySelectorAll("[data-slide]").forEach(b => b.addEventListener("click", () => { liveAuto = false; show(+b.dataset.slide); }));
  clearInterval(renderLiveBanner.auto);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) renderLiveBanner.auto = setInterval(() => {
    const r = track.getBoundingClientRect();
    if (liveAuto && !document.hidden && track.isConnected && r.top < innerHeight && r.bottom > 0) show(liveSlide + 1);
  }, 8000);
}
// The Live page: every live coverage first, then the live wire.
function renderLiveNow() {
  const host = $("#liveNow"); if (!host) return;
  const all = state.coverageAll || [];
  host.hidden = !all.length;
  host.innerHTML = all.length ? `<div class="section-head"><h2><span class="dot-live"></span>Live now</h2><span class="meta">${all.length === 1 ? "1 live coverage" : `${all.length} live coverages`}</span></div>
    <div class="live-now-grid">${all.map(liveTile).join("")}</div>` : "";
}
let coverageTimer;
async function viewCoverage(r) {
  clearInterval(coverageTimer);
  const slug = r.arg;
  const render = async (first) => {
    let d;
    try { const res = await fetch(`/api/live/${encodeURIComponent(slug)}?lang=${lang}`); d = res.ok ? await res.json() : null; } catch { d = null; }
    if (parseRoute().page !== "coverage" || parseRoute().arg !== slug) return clearInterval(coverageTimer);
    if (!d) { if (first) $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><h1>This live coverage isn’t available</h1><p class="muted">It may have ended or been removed.</p><div class="blocked-actions"><a class="btn btn-dark" href="/live">See the latest news</a></div></div></div>`; return; }
    const isLive = d.item.status === "live";
    document.title = `${isLive ? `${tr("Live")}: ` : ""}${d.item.title} · ${tr("Rashtrix 24×7 News")}`;
    $("#view").innerHTML = `<div class="wrap"><div class="coverage">
      <header class="coverage-head">${isLive ? `<span class="live-badge"><span class="pulse"></span>Live</span>` : `<span class="tag">Coverage ended</span>`}
        <h1>${esc(d.item.title)}</h1>${d.item.summary ? `<p class="dek">${esc(d.item.summary)}</p>` : ""}
        ${d.item.imageUrl && /^(https?:|\/media\/)/.test(d.item.imageUrl) ? `<figure class="coverage-hero">${img(d.item.imageUrl)}${isLive ? `<span class="live-tab" aria-hidden="true"><span class="pulse"></span>Live</span>` : ""}${d.item.heroCaption ? `<figcaption>${esc(d.item.heroCaption)}</figcaption>` : ""}</figure>` : ""}
        <div class="meta">Started ${new Date(d.item.startedAt).toLocaleString(LOCALE, { ...IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST · ${d.updates.length} update${d.updates.length === 1 ? "" : "s"}${isLive ? " · refreshes every 30 seconds" : ""}</div>
        ${shareBlock(`${isLive ? "LIVE: " : ""}${d.item.title}`, `/coverage/${encodeURIComponent(slug)}`)}</header>
      <ol class="coverage-feed">${d.updates.map((u, i) => `<li id="u-${Date.parse(u.createdAt) || i}" class="${i === 0 && isLive ? "latest" : ""}"><time datetime="${esc(u.createdAt)}"><b>${clock(u.createdAt)}</b><span>${ago(u.createdAt)}</span>${u.editedAt ? `<span class="edited">Updated ${clock(u.editedAt)}</span>` : ""}</time>
        <div class="glass">${i === 0 && isLive ? `<span class="tag tag-live">Latest</span>` : ""}${articleBlocks(u.body).map(b => `<p>${esc(b.x)}</p>`).join("")}${u.mediaUrl && /^(https?:|\/media\/)/.test(u.mediaUrl) ? `<div class="reader-hero">${img(u.mediaUrl)}</div>` : ""}<button class="update-share" type="button" data-action="share-native" data-title="${esc(`${d.item.title}: ${String(u.body).slice(0, 110)}${String(u.body).length > 110 ? "…" : ""}`)}" data-url="${esc(`${location.origin}${withLang(`/coverage/${encodeURIComponent(slug)}`)}#u-${Date.parse(u.createdAt) || i}`)}" aria-label="Share this update">${SHARE_ICONS.share}<span>Share</span></button></div></li>`).join("") || `<li><div class="glass"><p class="muted">The first update will appear here shortly.</p></div></li>`}</ol>
    </div></div>`;
  };
  await render(true);
  if (parseRoute().arg === slug) startRead("live", `live:${slug}`, ".coverage-feed");
  coverageTimer = setInterval(() => { if (!document.hidden) render(false); }, 30e3);
}

/* ---------- Stories from the CMS, newest first ---------- */
function stories() {
  return (state.articles || []).map(a => ({ ...a, date: a.publishedAt, topic: a.topic || a.category }));
}
// Guest writers come from the control room; bylines wait briefly for them.
const writersReady = fetch("/api/writers").then(r => r.ok ? r.json() : null).then(d => { if (d?.writers) setGuestWriters(d.writers.filter(w => w.guest)); }).catch(() => {});
let articlesSettled = false;
// Background refreshes never swap stories under the reader: new ones wait behind the "new
// stories" pill (or the next page change); corrections to stories already shown apply quietly.
async function loadArticles({ apply = false } = {}) {
  let list = null;
  try { const r = await fetch(`/api/articles?lang=${lang}`); if (r.ok) list = (await r.json()).articles || []; } catch { /* keep what we have */ }
  const first = !articlesSettled; articlesSettled = true;
  if (list) markFresh();
  if (first) {
    if (list) state.articles = list;
    // A slow first answer: the page was already drawn without stories, so draw it again.
    if (state.drewWithoutArticles) { state.drewWithoutArticles = false; rerenderStories(); }
    renderTicker();
    return;
  }
  if (!list) return;
  const known = new Set((state.articles || []).map(a => a.id));
  const fresh = list.filter(a => !known.has(a.id) && !(state.dismissedNew || new Set()).has(a.id));
  if (apply || !state.articles?.length) { state.articles = list; state.pendingArticles = null; rerenderStories(); return; }
  if (fresh.length) { state.pendingArticles = list; showNewPill(); return; }
  state.articles = list; // same stories, maybe newly translated: shown on the next page change
}
function rerenderStories() {
  const r = parseRoute(); // refresh lists that show stories
  if (r.page === "home") viewHome(); else if (r.page === "desk") viewDesk(r); else if (r.page === "briefs") viewBriefs(); else if (["live", "editions"].includes(r.page)) viewLive(r); else if (r.page === "author") viewAuthor(r);
  renderTicker();
}
// Article text from the control room: blank lines separate paragraphs; "## " starts a heading;
// "- " or "• " lines are bullets; "1. " lines are numbered points.
function articleBlocks(text) {
  const blocks = [];
  for (const chunk of String(text || "").replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every(l => /^([-•*]|\d+\.)\s+/.test(l))) { lines.forEach(l => blocks.push({ t: "li", x: l.replace(/^[-•*]\s+/, "") })); continue; }
    if (/^#{1,3}\s+/.test(lines[0])) { blocks.push({ t: "h", x: lines[0].replace(/^#{1,3}\s+/, "") }); if (lines.length > 1) blocks.push({ t: "p", x: lines.slice(1).join(" ") }); continue; }
    blocks.push({ t: "p", x: lines.join(" ") });
  }
  return blocks;
}
/* ---------- Form dialog (replaces browser prompts) ---------- */
function openFormDialog({ kicker = "", title, fields, submitLabel = "Save", onSubmit }) {
  const dlg = $("#formDialog");
  $("#formDialogKicker").textContent = kicker;
  $("#formDialogTitle").textContent = title;
  $("#formDialogSubmit").textContent = submitLabel;
  $("#formDialogMessage").textContent = "";
  $("#formDialogFields").innerHTML = fields.map(f => `<label>${esc(f.label)}${f.hint ? ` <small>${esc(f.hint)}</small>` : ""}${
    f.type === "textarea" ? `<textarea name="${f.name}" rows="${f.rows || 5}" ${f.required ? "required" : ""} minlength="${f.minlength || 0}" maxlength="${f.maxlength || 5000}">${esc(f.value || "")}</textarea>`
    : f.type === "select" ? `<select name="${f.name}">${f.options.map(o => { const [val, label] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${val === f.value ? " selected" : ""}>${esc(label)}</option>`; }).join("")}</select>`
    : `<input name="${f.name}" type="${f.type || "text"}" value="${esc(f.value || "")}" ${f.required ? "required" : ""} minlength="${f.minlength || 0}" maxlength="${f.maxlength || 300}" ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ""}>`}</label>`).join("");
  const form = $("#dialogForm");
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $("#formDialogSubmit"); btn.disabled = true; $("#formDialogMessage").textContent = "";
    try { await onSubmit(Object.fromEntries(new FormData(form))); dlg.close(); }
    catch (err) { $("#formDialogMessage").textContent = err.message; }
    finally { btn.disabled = false; }
  };
  dlg.showModal();
  form.querySelector("input, textarea, select")?.focus();
}
async function apiJSON(path, body, method = "POST") {
  const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong. Try again.");
  return d;
}

/* ---------- Community ---------- */
const TOPICS = [...DESKS, "General"];
function openDiscussionDialog(title = "") {
  openFormDialog({ kicker: "Community", title: "Start a discussion", submitLabel: "Publish discussion", fields: [
    { name: "title", label: "Title", required: true, minlength: 5, maxlength: 180, value: title.slice(0, 180) },
    { name: "topic", label: "Topic", type: "select", options: TOPICS, value: "Kolkata" },
    { name: "lang", label: "Language", type: "select", options: Object.entries(LANGUAGES).map(([k, x]) => [k, x.name]), value: lang },
    { name: "body", label: "Your opening post", type: "textarea", rows: 7, required: true, minlength: 10 }
  ], onSubmit: async v => { const d = await apiJSON("/api/community/posts", v); toast("Discussion published."); await loadCommunity(); navigate(`/discussion/${d.id}`); } });
}
// Avatars: initials on a colour picked from the name, so each member is recognisable.
const AVATAR_COLOURS = ["#AA0404", "#0f5c8c", "#137a55", "#7a530f", "#6b3fa0", "#b4570e", "#1f6f78", "#8c2155"];
const avatarColour = name => AVATAR_COLOURS[[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLOURS.length];
const avatar = (name, cls = "") => `<span class="av ${cls}" style="--av:${avatarColour(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
const TOPIC_COLOURS = { Kolkata: "#AA0404", "West Bengal": "#A43F44", India: "#b4570e", "Probashi Bangali": "#6b3fa0", World: "#0f5c8c", General: "#596173" };
const topicChip = t => `<span class="topic-chip" style="--tc:${TOPIC_COLOURS[t] || "#596173"}">${esc(t)}</span>`;
// Discussions are held in English, Hindi or Bengali; the language shows on each one.
const langChip = l => l && l !== "en" && LANGUAGES[l] ? `<span class="lang-chip" lang="${l}">${LANGUAGES[l].name}</span>` : "";
const langAttr = l => LANGUAGES[l] ? ` lang="${LANGUAGES[l].locale}"` : "";
const sqlTime = d => new Date(String(d).replace(" ", "T") + (/[zZ+]/.test(String(d)) ? "" : "Z")).toISOString();
function voteButton(p) {
  return `<button class="vote${p.voted ? " on" : ""}" type="button" data-action="vote" data-id="${esc(p.id)}" aria-pressed="${!!p.voted}" aria-label="Useful (${p.votes || 0})"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4l8 10h-5v6H9v-6H4z"/></svg><b>${p.votes || 0}</b></button>`;
}
function threadCard(p) {
  const last = p.lastReplyAt ? `last reply ${ago(sqlTime(p.lastReplyAt))}` : `posted ${ago(sqlTime(p.createdAt))}`;
  return `<article class="thread-card glass">${voteButton(p)}
    <a class="thread-main" href="/discussion/${encodeURIComponent(p.id)}">
      <span class="thread-top">${topicChip(p.topic)}${langChip(p.lang)}${p.replies >= 3 || p.votes >= 3 ? `<span class="hot">Active</span>` : ""}</span>
      <h3${langAttr(p.lang)}>${esc(p.title)}</h3>
      <p${langAttr(p.lang)}>${esc(p.body.length > 220 ? p.body.slice(0, 217) + "…" : p.body)}</p>
      <span class="thread-foot">${avatar(p.author, "sm")}<span class="who"><b>${esc(p.author)}</b> · ${last}</span>
        <span class="talkers">${(p.repliers || []).slice(0, 3).map(n => avatar(n, "xs")).join("")}</span>
        <span class="count"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/></svg>${p.replies || 0}</span></span>
    </a></article>`;
}
async function viewCommunity(r = parseRoute()) {
  const sort = r.params.get("sort") === "top" ? "top" : "latest", topic = TOPICS.includes(r.params.get("topic")) ? r.params.get("topic") : "";
  const inLang = LANGUAGES[r.params.get("in")] ? r.params.get("in") : ""; // discussions in one language
  const q = (o = {}) => { const p = new URLSearchParams(); const s_ = o.sort ?? sort, t = o.topic ?? topic, l = o.in ?? inLang; if (s_ === "top") p.set("sort", "top"); if (t) p.set("topic", t); if (l) p.set("in", l); const qs = p.toString(); return `/community${qs ? "?" + qs : ""}`; };
  const st = state.communityStats;
  $("#view").innerHTML = `<div class="wrap">
    <section class="community-hero"><div><span class="join-eyebrow"><span class="pulse"></span>The Rashtrix community</span><h1>Your say</h1>
      <p>Moderated discussions on the news from Kolkata, Bengal and beyond. Be specific, cite sources and keep it civil. <a href="/community-guidelines">Guidelines</a></p>
      ${st ? `<div class="community-stats"><span><b>${st.discussions}</b> discussions</span><span><b>${st.replies}</b> replies</span>${st.members >= 25 ? `<span><b>${st.members}</b> members</span>` : ""}</div>` : ""}</div>
      <div class="hero-avatars" id="heroAvatars"></div></section>
    <div class="community-page"><div>
      <button class="composer glass" type="button" data-action="discuss">${state.user ? avatar(state.user.displayName) : `<span class="av" style="--av:#596173">+</span>`}<span>${state.user ? `What’s your take, ${esc(state.user.displayName.split(" ")[0])}? Start a discussion…` : "Join free to start a discussion…"}</span><span class="btn btn-red btn-sm">Post</span></button>
      <div class="community-tools"><div class="pill-tabs" role="tablist"><a role="tab" href="${q({ sort: "latest" })}" aria-selected="${sort === "latest"}">Latest</a><a role="tab" href="${q({ sort: "top" })}" aria-selected="${sort === "top"}">Top</a></div>
        <div class="chips topic-filter"><a class="chip" href="${q({ topic: "" })}" aria-pressed="${!topic}">All topics</a>${TOPICS.map(t => `<a class="chip" href="${q({ topic: t })}" aria-pressed="${t === topic}">${t}</a>`).join("")}</div>
        <div class="chips lang-filter" aria-label="Language"><a class="chip" href="${q({ in: "" })}" aria-pressed="${!inLang}">All languages</a>${Object.entries(LANGUAGES).map(([k, x]) => `<a class="chip" href="${q({ in: k })}" aria-pressed="${k === inLang}" lang="${k}" data-no-tr>${x.name}</a>`).join("")}</div></div>
      <div class="thread-list" id="threadList">${Array.from({ length: 3 }, () => `<div class="skeleton" style="height:150px;border-radius:20px"></div>`).join("")}</div></div>
    <aside><div class="aside-card glass"><div class="kicker">Upcoming</div><ol class="agenda" id="agenda"></ol><a class="link-gold" href="/events" style="display:block;margin-top:12px;font-size:13px">All events →</a></div></aside></div></div>`;
  renderCommunity();
  let posts = [];
  try { posts = (await fetch(`/api/community/posts?${new URLSearchParams(Object.entries({ sort, topic, lang: inLang }).filter(([, v]) => v && v !== "latest"))}`).then(x => x.json())).posts || []; } catch { /* offline */ }
  if (parseRoute().page !== "community") return;
  $("#threadList").innerHTML = posts.length ? posts.map(threadCard).join("") : `<div class="empty-state glass"><span class="empty-icon">${PERK_ICONS.talk}</span><b>${topic ? `No ${topic.toLowerCase()} discussions yet` : "No discussions yet"}</b><p>Start the first one. Ask a question, share a source, or challenge a story.</p><button class="btn btn-red" type="button" data-action="discuss">Start a discussion</button></div>`;
  const people = [...new Set(posts.flatMap(p => [p.author, ...(p.repliers || [])]))].slice(0, 7);
  if ($("#heroAvatars")) $("#heroAvatars").innerHTML = people.map(n => avatar(n)).join("") + (people.length ? `<small>${people.length === 7 ? "and more" : ""} recently active</small>` : "");
}
async function viewDiscussion(r) {
  const id = r.arg;
  $("#view").innerHTML = `<div class="wrap"><div class="coverage"><div class="skeleton" style="height:300px"></div></div></div>`;
  let d;
  try { const res = await fetch(`/api/community/posts/${encodeURIComponent(id)}`); d = res.ok ? await res.json() : null; } catch { d = null; }
  if (parseRoute().arg !== id) return;
  if (!d) { $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><h1>Discussion not found</h1><p class="muted">It may have been removed by a moderator.</p><div class="blocked-actions"><a class="btn btn-dark" href="/community">Back to the community</a></div></div></div>`; return; }
  document.title = `${d.post.title} · ${tr("Rashtrix 24×7 News")}`;
  const p = d.post;
  $("#view").innerHTML = `<div class="wrap"><div class="discussion">
    <a class="back-link" href="/community">← All discussions</a>
    <article class="thread-post glass">
      <header>${topicChip(p.topic)}${langChip(p.lang)}<h1${langAttr(p.lang)}>${esc(p.title)}</h1><div class="post-by">${avatar(p.author)}<span><b>${esc(p.author)}</b><small>${ago(sqlTime(p.createdAt))}</small></span></div></header>
      <p class="post-body"${langAttr(p.lang)}>${esc(p.body)}</p>
      <footer>${voteButton(p)}<span class="muted">${d.replies.length} repl${d.replies.length === 1 ? "y" : "ies"}</span>${shareBlock(p.title, `/discussion/${encodeURIComponent(p.id)}`)}</footer>
    </article>
    <h2 class="thread-count">${d.replies.length ? `${d.replies.length} repl${d.replies.length === 1 ? "y" : "ies"}` : "No replies yet"}</h2>
    <ol class="reply-list">${d.replies.map(x => `<li>${avatar(x.author)}<div class="bubble glass"><div class="reply-head"><b>${esc(x.author)}</b><span class="meta">${ago(sqlTime(x.createdAt))}</span></div><p>${esc(x.body)}</p></div></li>`).join("") || `<li class="no-replies">Be the first to reply. A source, a counter-argument or a question all move a discussion on.</li>`}</ol>
    ${state.user ? `<form class="reply-composer glass" id="replyForm">${avatar(state.user.displayName)}<label for="replyBody" class="sr-only">Your reply</label><textarea id="replyBody" name="body" rows="2" required minlength="2" maxlength="5000" placeholder="Add your reply…"></textarea><button class="btn btn-red" type="submit">Reply</button><p class="auth-message" id="replyMessage" aria-live="polite"></p></form>`
      : `<div class="reply-composer glass guest"><p>Join the conversation: it’s free.</p><button class="btn btn-red" type="button" data-action="join">Join free</button><button class="btn btn-light" type="button" data-action="signin">Sign in</button></div>`}
  </div></div>`;
  $("#replyBody")?.addEventListener("input", e => { e.target.style.height = "auto"; e.target.style.height = Math.min(220, e.target.scrollHeight) + "px"; });
  $("#replyForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector("button"); btn.disabled = true;
    try { await apiJSON(`/api/community/posts/${encodeURIComponent(id)}/replies`, { body: $("#replyBody").value }); toast("Reply posted."); await viewDiscussion(parseRoute()); jump(document.documentElement.scrollHeight); loadCommunity(); }
    catch (err) { $("#replyMessage").textContent = err.message; btn.disabled = false; }
  });
}
async function vote(id, el) {
  if (!state.user) { openAuth("register"); toast("Join free to vote on discussions."); return; }
  try {
    const d = await apiJSON(`/api/community/posts/${encodeURIComponent(id)}/vote`, {});
    $$(`[data-action=vote][data-id="${CSS.escape(id)}"]`).forEach(b => { b.classList.toggle("on", d.voted); b.setAttribute("aria-pressed", String(d.voted)); b.querySelector("b").textContent = d.votes; });
  } catch (e) { toast(e.message); }
}

/* ---------- Events ---------- */
function icsDate(iso) { return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function downloadIcs(id) {
  const ev = (state.events || []).find(x => x.id === id); if (!ev) return;
  const end = new Date(new Date(ev.startsAt).getTime() + 60 * 60e3).toISOString();
  const text = (s = "") => String(s).replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rashtrix//Events//EN", "BEGIN:VEVENT", `UID:${ev.id}@rashtrix`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(ev.startsAt)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${text(ev.title)}`, `DESCRIPTION:${text(ev.description)}`, `URL:${location.origin}/events`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${ev.title.replace(/[^\w]+/g, "-").slice(0, 60)}.ics`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function viewEvents() {
  const evs = state.events;
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Events</div><h1>Upcoming</h1><p>Programmes, debates and events. Times are shown in India Standard Time.</p></div></div>
  <div class="live-list">${evs === null ? `<div class="skeleton" style="height:200px"></div>` : evs.length ? evs.map(e => { const d = new Date(e.startsAt); return `<article class="live-item glass event-item"><span class="date-block"><b>${d.toLocaleDateString(LOCALE, { ...IST, day: "2-digit" })}</b><small>${d.toLocaleDateString(LOCALE, { ...IST, month: "short" })}</small></span>
    <span><b>${esc(e.title)}</b>${e.description ? `<p>${esc(e.description)}</p>` : ""}<span class="src"><span class="tag">${esc(e.eventType)}</span>${d.toLocaleString(LOCALE, { ...IST, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST · ${esc(e.access === "public" ? "Open to all" : e.access === "member" ? "Members" : "Premium members")}</span></span>
    <button class="btn btn-light btn-sm" type="button" data-action="ics" data-event="${esc(e.id)}">Add to calendar</button></article>`; }).join("") : `<div class="empty">No events are scheduled right now.</div>`}</div></div>`;
}

/* ---------- Watch & listen (multimedia from the control room) ---------- */
/* ---------- Shorts: YouTube Shorts from the vertical channel, in a swipe-up feed ---------- */
async function loadYtShorts() {
  try { const r = await fetch("/api/shorts"); state.ytShorts = r.ok ? (await r.json()).shorts || [] : []; } catch { state.ytShorts = []; }
  if (parseRoute().page === "home") renderHomeMedia();
}
const ytThumb = s => s.thumb || `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`;
let shortsObserver = null;
async function viewShorts() {
  document.title = `${tr("Shorts")} · ${tr("Rashtrix 24×7 News")}`;
  if (!state.ytShorts) await loadYtShorts();
  const list = state.ytShorts || [], want = parseRoute().params.get("v");
  $("#view").innerHTML = `<div class="shorts-page"><h1 class="sr-only">Shorts</h1>${list.length ? `<div class="shorts-feed" id="shortsFeed">${list.map(s => `<section class="sf-item" data-yt="${esc(s.id)}" id="s-${esc(s.id)}">
      <div class="sf-frame"><img src="${esc(ytThumb(s))}" alt="" loading="lazy"><span class="play-badge" aria-hidden="true"></span></div>
      <div class="sf-info"><b data-no-tr>${esc(s.title)}</b><span class="sf-tools">${shareBtn(s.title, `${location.origin}${withLang("/shorts")}?v=${encodeURIComponent(s.id)}`)}</span></div></section>`).join("")}</div>
      <p class="sf-hint muted">Swipe up for the next one</p>` : `<div class="empty" style="margin-top:30px">No shorts yet.</div>`}</div>`;
  if (!list.length) return;
  const feed = $("#shortsFeed");
  // The short in view plays (muted until the viewer turns the sound on); the others stop.
  shortsObserver?.disconnect();
  const play = el => { const id = el.dataset.yt, f = el.querySelector(".sf-frame"); if (f.querySelector("iframe")) return;
    { const seen = seenShorts(); seen.add(`yt:${id}`); store.set("rw-seen-shorts", [...seen].slice(-200)); }
    f.insertAdjacentHTML("beforeend", `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&rel=0&modestbranding=1" title="" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`); };
  const stop = el => el.querySelector(".sf-frame iframe")?.remove();
  shortsObserver = new IntersectionObserver(es => es.forEach(e => e.intersectionRatio >= 0.6 ? play(e.target) : stop(e.target)), { threshold: [0, 0.6] });
  feed.querySelectorAll(".sf-item").forEach(el => shortsObserver.observe(el));
  if (want) document.getElementById(`s-${want}`)?.scrollIntoView({ block: "start" });
}
async function loadMedia() {
  const [media, tv] = await Promise.all([
    fetch("/api/media").then(r => r.ok ? r.json() : null).then(d => d?.items || []).catch(() => []),
    fetch("/api/tv/videos").then(r => r.ok ? r.json() : null).then(d => d?.videos || []).catch(() => [])
  ]);
  // The channel's long YouTube videos sit with the desk's own videos, filed by desk.
  const yt = tv.filter(v => !v.short).map(v => ({ id: `yt-${v.id}`, title: v.title, mediaType: "video", mediaUrl: `https://www.youtube.com/watch?v=${v.id}`,
    thumbnailUrl: v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, category: v.category, publishedAt: v.publishedAt, duration: v.duration, plays: 0, fromChannel: true }));
  state.media = [...media, ...yt.filter(v => !media.some(m => String(m.mediaUrl || "").includes(v.id.slice(3))))];
  state.tvShorts = tv.filter(v => v.short);
  if (["tv", "watch"].includes(parseRoute().page)) viewWatch();
  renderHomeMedia();
}
// Photo-free story pages and the home page show videos the desk publishes (control room → Multimedia).
// Vertical (9:16) videos are "shorts": story bubbles on the homepage, a row on Watch, and a
// full-screen player. Landscape videos sit in a carousel on the homepage.
const isShort = m => m.mediaType === "short";
const isFilm = m => m.mediaType === "video" && /\.(mp4|webm)(\?|$)|youtube\.com|youtu\.be/i.test(m.mediaUrl || "");
const shorts = () => (state.media || []).filter(isShort);
const seenShorts = () => new Set(store.get("rw-seen-shorts", []));
function shortBubbles(list) {
  const seen = seenShorts();
  return list.map((m, i) => `<button class="short-bubble${seen.has(m.id) ? " seen" : ""}" type="button" data-action="short" data-index="${i}" aria-label="Play: ${esc(m.title)}">
    <span class="short-ring"><span class="short-face">${thumbImg(m.thumbnailUrl, i < 5)}</span></span><span class="short-name">${esc(m.title)}</span></button>`).join("");
}
function videoCard(m) {
  return `<article class="vcard"><div class="vcard-media" data-video="${esc(m.id)}"><button class="vcard-play" type="button" data-action="play-video" data-id="${esc(m.id)}" aria-label="Play: ${esc(m.title)}">${thumbImg(m.thumbnailUrl)}<span class="play-badge" aria-hidden="true"></span></button></div>
    <div class="vcard-body"><span class="kicker">${esc(m.category || "Video")}</span><h3>${esc(m.title)}</h3>${m.description ? `<p>${esc(m.description)}</p>` : ""}${shareBtn(m.title, mediaUrl(m))}</div></article>`;
}
// The first bubble in the Shorts row opens the live Shorts channel (Rashtrix Shorts on the Watch page).
const liveBubble = () => `<a class="short-bubble live-bubble" href="${withLang("/watch?ch=v")}" aria-label="Rashtrix Shorts live"><span class="short-ring"><span class="short-face"><img src="/brand/logo-sm.webp" alt=""></span></span><span class="live-pill" data-no-tr><i></i>LIVE</span><span class="short-name">Shorts live</span></a>`;
function renderHomeMedia() {
  const rail = $("#shortsRail"), band = $("#videoBand");
  if (rail) {
    // One row, newest upload first: the Shorts uploaded here and the channel's YouTube Shorts.
    const list = shorts(), seen = seenShorts(), when = x => Date.parse(x.publishedAt || "") || 0;
    const items = [...list.map((m, i) => ({ t: when(m), html: j => shortBubbles([m]).replace(/data-index="0"/, `data-index="${i}"`).replace(/loading="lazy"/, j < 5 ? "" : 'loading="lazy"') })),
      ...(state.ytShorts || []).slice(0, 30).map(s => ({ t: when(s), html: j => `<a class="short-bubble${seen.has(`yt:${s.id}`) ? " seen" : ""}" href="${withLang(`/shorts?v=${encodeURIComponent(s.id)}`)}" aria-label="Play: ${esc(s.title)}"><span class="short-ring"><span class="short-face"><img src="${esc(ytThumb(s))}" alt="" ${j < 5 ? "" : 'loading="lazy"'}></span></span><span class="short-name" data-no-tr>${esc(s.title)}</span></a>` }))]
      .sort((a, b) => b.t - a.t).slice(0, 30);
    rail.hidden = !items.length;
    rail.innerHTML = items.length ? `<div class="shorts-head"><span class="kicker">Shorts</span><a class="link-gold" href="${withLang("/shorts")}">All shorts →</a></div><div class="shorts-row">${liveBubble()}${items.map((x, j) => x.html(j)).join("")}</div>` : "";
  }
  if (band) {
    const films = (state.media || []).filter(isFilm);
    band.hidden = !films.length;
    band.innerHTML = films.length ? `<div class="section-head"><h2 id="videoBandTitle">Videos</h2><div class="carousel-nav"><button class="carousel-btn" type="button" data-action="carousel" data-dir="-1" aria-label="Previous videos">‹</button><button class="carousel-btn" type="button" data-action="carousel" data-dir="1" aria-label="Next videos">›</button><a class="link-gold" href="/watch">Watch all →</a></div></div>
      <div class="vcarousel" tabindex="0" aria-label="Videos">${films.map(videoCard).join("")}</div>` : "";
  }
}
function playInline(id) {
  const m = (state.media || []).find(x => x.id === id), host = document.querySelector(`[data-video="${CSS.escape(id)}"]`);
  if (!m || !host) return;
  const yt = String(m.mediaUrl).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  host.innerHTML = yt ? `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1" title="${esc(m.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
    : `<video controls autoplay playsinline src="${esc(m.mediaUrl)}"${m.thumbnailUrl ? ` poster="${esc(m.thumbnailUrl)}"` : ""}></video>`;
  host.querySelector("video")?.play().catch(() => {});
}
/* The shorts player: full screen, one after another, tap the sides to skip, swipe down or Esc to close. */
let shortsState = null;
function openShorts(index) {
  const list = shorts(); if (!list.length) return;
  let el = $("#shortsViewer");
  if (!el) {
    el = document.createElement("div"); el.id = "shortsViewer"; el.className = "shorts-viewer"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Shorts");
    el.innerHTML = `<div class="sv-stage"><div class="sv-bars"></div><div class="sv-top"><b class="sv-title sr-only" aria-live="polite"></b><span class="sv-grow"></span><button class="sv-btn sv-share" type="button" data-sv="share" aria-label="Share this short">${SHARE_ICONS.share}</button><button class="sv-btn" type="button" data-sv="mute" aria-label="Mute">🔊</button><button class="sv-btn" type="button" data-sv="close" aria-label="Close">✕</button></div>
      <video class="sv-video" playsinline preload="auto"></video><button class="sv-zone sv-prev" type="button" data-sv="prev" aria-label="Previous short"></button><button class="sv-zone sv-next" type="button" data-sv="next" aria-label="Next short"></button>
      <div class="sv-paused" aria-hidden="true">❚❚</div><div class="sv-end" hidden></div></div>`;
    document.body.append(el);
    const v = el.querySelector("video");
    v.addEventListener("timeupdate", () => { const bar = el.querySelectorAll(".sv-bars i")[shortsState?.i]; if (bar && v.duration) bar.style.width = `${(v.currentTime / v.duration) * 100}%`; });
    v.addEventListener("ended", () => { if (!showFullOffer()) stepShort(1); });
    el.addEventListener("click", e => {
      if (el.dataset.held) { delete el.dataset.held; return; }   // a press-and-hold pause is not a tap
      const b = e.target.closest("[data-sv]"); if (!b) return;
      const k = b.dataset.sv;
      if (k === "share") { const m = shortsState?.list[shortsState.i]; if (m) { v.pause(); shareOut(m.title, mediaUrl(m)).then(() => { if (!$("#sharePop") || $("#sharePop").hidden) v.play().catch(() => {}); }); } }
      else if (k === "full") { const full = fullOf(shortsState?.list[shortsState.i]); closeShorts(); if (full) { openedShared = null; navigate(withLang(`/watch?v=${encodeURIComponent(full.id)}&play=1`)); } }
      else if (k === "replay") { el.querySelector(".sv-end").hidden = true; v.currentTime = 0; v.play().catch(() => {}); }
      else if (k === "close") closeShorts(); else if (k === "prev") stepShort(-1); else if (k === "next") stepShort(1);
      else if (k === "mute") { v.muted = !v.muted; b.textContent = v.muted ? "🔇" : "🔊"; b.setAttribute("aria-label", v.muted ? "Unmute" : "Mute"); }
    });
    // hold to pause, swipe down to close
    let y0 = null, held = null;
    el.addEventListener("pointerdown", e => { if (e.target.closest(".sv-top")) return; y0 = e.clientY; held = setTimeout(() => { v.pause(); el.classList.add("held"); }, 220); });
    const release = e => { if (e.target.closest?.(".sv-top")) { clearTimeout(held); y0 = null; return; } clearTimeout(held); if (el.classList.contains("held")) { el.classList.remove("held"); el.dataset.held = "1"; v.play().catch(() => {}); } if (y0 != null && e.clientY - y0 > 90) closeShorts(); y0 = null; };
    el.addEventListener("pointerup", release); el.addEventListener("pointercancel", release);
    document.addEventListener("keydown", e => { if (el.hidden) return; if (e.key === "Escape") closeShorts(); if (e.key === "ArrowRight") stepShort(1); if (e.key === "ArrowLeft") stepShort(-1); if (e.key === " ") { e.preventDefault(); v.paused ? v.play() : v.pause(); } });
  }
  document.querySelectorAll("video").forEach(x => { if (!el.contains(x)) x.pause(); });   // stop a carousel video
  shortsState = { i: index, list, opener: document.activeElement };
  el.querySelector(".sv-bars").innerHTML = list.map(() => `<span><i></i></span>`).join("");
  el.hidden = false; document.body.classList.add("sv-open");
  showShort();
  el.querySelector('[data-sv="close"]').focus({ preventScroll: true });
}
// A short linked to its full-length video ends on a card offering it; the card stays until the
// viewer picks something (watch the full video, replay, the next short, or close).
const fullOf = m => m?.fullId ? (state.media || []).find(x => x.id === m.fullId && !isShort(x)) : null;
function showFullOffer() {
  const el = $("#shortsViewer"), m = shortsState?.list[shortsState.i], full = fullOf(m);
  if (!full) return false;
  const end = el.querySelector(".sv-end"), more = shortsState.i < shortsState.list.length - 1;
  end.innerHTML = `<div class="sv-end-card">${full.thumbnailUrl ? `<span class="sv-end-thumb">${img(full.thumbnailUrl, "")}<span class="play-badge" aria-hidden="true"></span></span>` : ""}
    <span class="kicker">Full video</span><b>${esc(full.title)}</b>
    <button class="btn sv-end-go" type="button" data-sv="full">▶ Watch the full video</button>
    <span class="sv-end-row"><button type="button" data-sv="replay">↺ Replay</button>${more ? `<button type="button" data-sv="next">Next short →</button>` : ""}</span></div>`;
  end.hidden = false;
  end.querySelector(".sv-end-go").focus({ preventScroll: true });
  return true;
}
function showShort() {
  const el = $("#shortsViewer"), { i, list } = shortsState, m = list[i], v = el.querySelector("video");
  el.querySelector(".sv-end").hidden = true;
  el.querySelectorAll(".sv-bars i").forEach((b, k) => { b.style.width = k < i ? "100%" : "0%"; });
  el.querySelector(".sv-title").textContent = m.title;
  v.poster = m.thumbnailUrl || ""; v.src = m.mediaUrl; v.currentTime = 0; v.play().catch(() => {});
  const seen = seenShorts(); seen.add(m.id); store.set("rw-seen-shorts", [...seen].slice(-200));
}
function stepShort(d) {
  if (!shortsState) return;
  const n = shortsState.i + d;
  if (n < 0) { $("#shortsViewer video").currentTime = 0; return; }
  if (n >= shortsState.list.length) return closeShorts();
  shortsState.i = n; showShort();
}
function closeShorts() {
  const el = $("#shortsViewer"); if (!el || el.hidden) return;
  const v = el.querySelector("video"); v.pause(); v.removeAttribute("src"); v.load();
  el.hidden = true; document.body.classList.remove("sv-open");
  shortsState?.opener?.focus?.({ preventScroll: true }); shortsState = null;
  renderHomeMedia(); if (["tv", "watch"].includes(parseRoute().page)) viewWatch();
}
function mediaEmbed(m) {
  const u = String(m.mediaUrl || "");
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `<div class="media-frame"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="${esc(m.title)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  if (m.mediaType === "image" || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) return `<div class="media-frame">${img(u, m.title)}</div>`;
  if (m.mediaType === "audio" || /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(u)) return `<audio controls preload="none" src="${esc(u)}" style="width:100%"></audio>`;
  if (/\.(mp4|webm)(\?|$)/i.test(u)) return `<div class="media-frame"><video controls preload="none" src="${esc(u)}"${m.thumbnailUrl ? ` poster="${esc(m.thumbnailUrl)}"` : ""}></video></div>`;
  return `${m.thumbnailUrl ? `<div class="media-frame">${img(m.thumbnailUrl, m.title)}</div>` : ""}<a class="btn btn-light btn-sm" href="${esc(u)}" target="_blank" rel="noreferrer">Open ↗</a>`;
}
/* ---------- Watch: the video library (the TV channels come in Phase 2) ---------- */
let openedShared = null;
const CAT_NAMES = {};
const progressOf = () => store.get("rw-watch-progress", {});
const durations = () => store.get("rw-durations", {});
const fmtDur = s => s ? (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`) : "";
const ytId = m => String(m?.mediaUrl || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)?.[1];
const thumbOf = m => m.thumbnailUrl || (ytId(m) ? `https://i.ytimg.com/vi/${ytId(m)}/hqdefault.jpg` : "");
function wCard(m, list, i = 9) {
  const p = progressOf()[m.id], d = durations()[m.id];
  return `<button class="w-card" type="button" data-action="w-open" data-id="${esc(m.id)}" data-list="${esc(list)}">
    <span class="w-thumb">${thumbImg(thumbOf(m), i < 4)}${d ? `<span class="w-dur">${fmtDur(d)}</span>` : ytId(m) ? "" : `<span class="w-dur" data-dur="${esc(m.id)}" hidden></span>`}${p && p.d ? `<span class="w-prog"><i style="width:${Math.min(100, 100 * p.t / p.d).toFixed(1)}%"></i></span>` : ""}<span class="w-play" aria-hidden="true"></span></span>
    <span class="w-meta"><span class="kicker">${esc(CAT_NAMES[m.category] || m.category || "Video")}</span><b>${esc(m.title)}</b></span></button>`;
}
function wRow(key, title, items, extra = "") {
  if (!items.length) return "";
  state.wLists[key] = items.map(m => m.id);
  return `<section class="w-row" data-row="${esc(key)}"${extra}><div class="w-row-head"><h2>${esc(title)}</h2><span class="meta">${items.length}</span></div>
    <div class="w-rail">${items.map((m, i) => wCard(m, key, i)).join("")}</div></section>`;
}
function viewWatch() {
  { const want = parseRoute().params.get("ch"); if (want === "v" || want === "h") store.set("rw-tv-ch", want); }
  if (parseRoute().page === "tv") history.replaceState(history.state, "", withLang("/watch") + location.search + location.hash);
  document.title = `${tr("Watch")} · ${tr("Rashtrix 24×7 News")}`;
  const all = state.media, sh = all ? shorts() : [], films = all ? all.filter(isFilm) : [], others = all ? all.filter(m => !isShort(m) && !isFilm(m)) : [];
  state.wLists = {};
  const prog = progressOf();
  const cont = films.filter(m => prog[m.id] && prog[m.id].d && prog[m.id].t / prog[m.id].d > 0.04 && prog[m.id].t / prog[m.id].d < 0.94).sort((a, b) => prog[b.id].at - prog[a.id].at);
  const lastId = Object.entries(prog).sort((a, b) => b[1].at - a[1].at)[0]?.[0], last = films.find(m => m.id === lastId);
  const because = last ? films.filter(m => m.id !== last.id && m.category === last.category && !(prog[m.id]?.t / prog[m.id]?.d > 0.94)) : [];
  const byCat = {};
  films.forEach(m => (byCat[m.category || "More"] ||= []).push(m));
  // A row per desk, in the site's desk order; anything without a desk goes under More videos.
  const cats = [...DESKS.filter(d => byCat[d]?.length).map(d => [d, byCat[d]]), ...Object.entries(byCat).filter(([c, l]) => !DESKS.includes(c) && c !== "More" && l.length >= 2)];
  const more = Object.entries(byCat).filter(([c, l]) => !cats.some(([k]) => k === c)).flatMap(([, l]) => l);
  const popular = films.filter(m => m.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 12);
  $("#view").innerHTML = `<div class="watch">
    <div class="wrap"><section class="tv-watch"><div class="tv-watch-head"><div><div class="kicker"><span class="dot-live"></span> Rashtrix TV</div><h1>Watch live</h1></div>
      <div class="pill-tabs" role="tablist" aria-label="Channel">${[["h", "Rashtrix TV"], ["v", "Rashtrix Shorts"]].map(([k, l]) => `<button type="button" role="tab" data-action="tv-ch" data-ch="${k}" aria-selected="${k === tvChannel()}">${l}</button>`).join("")}</div></div>
      <div class="tv-watch-player ${tvChannel() === "v" ? "is-v" : ""}" id="tvWatch" data-no-tr></div><div id="tvInteract" class="tv-interact"></div></section>
      <div class="page-head"><div><div class="kicker">Watch</div><h2>Videos</h2><p>Videos and shorts from Rashtrix.</p></div></div>
      ${all == null ? `<div class="skeleton" style="height:260px;margin-top:30px"></div>` : `
      <div class="w-tools"><div class="chips" role="tablist">${["All", ...cats.map(([c]) => c)].map(c => `<button class="chip" type="button" data-action="w-cat" data-cat="${esc(c)}" aria-pressed="${c === "All"}">${esc(c === "All" ? "All" : CAT_NAMES[c] || c)}</button>`).join("")}</div>
        <label class="w-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="wSearch" placeholder="Search videos" aria-label="Search videos"></label></div>
      <div id="wRows">
        ${sh.length ? `<section class="w-row w-shorts" id="shorts"><div class="w-row-head"><h2>Shorts</h2><span class="meta">${sh.length}</span></div><div class="w-rail">${sh.map((m, i) => `<button class="w-short" type="button" data-action="short" data-index="${i}" aria-label="Play: ${esc(m.title)}">${thumbImg(m.thumbnailUrl, i < 5)}<span class="play-badge" aria-hidden="true"></span><b>${esc(m.title)}</b></button>`).join("")}</div></section>` : ""}
        ${(state.tvShorts || []).length ? `<section class="w-row w-shorts" data-row="ytshorts"><div class="w-row-head"><h2>Rashtrix Shorts</h2><a class="link-gold" href="${withLang("/shorts")}">All shorts →</a></div><div class="w-rail">${state.tvShorts.slice(0, 30).map(v => `<a class="w-short" href="${withLang(`/shorts?v=${encodeURIComponent(v.id)}`)}"><span class="w-short-face"><img src="${esc(v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}" alt="" loading="lazy"></span><b data-no-tr>${esc(v.title)}</b></a>`).join("")}</div></section>` : ""}
        ${wRow("continue", "Continue watching", cont)}
        ${wRow("latest", "Latest videos", films.slice(0, 14))}
        ${last && because.length ? wRow("because", `Because you watched ${last.title.length > 40 ? last.title.slice(0, 38) + "…" : last.title}`, because) : ""}
        ${cats.map(([c, l]) => wRow(`cat:${c}`, CAT_NAMES[c] || c, l, ` data-cat="${esc(c)}"`)).join("")}
        ${wRow("popular", "Most watched", popular)}
        ${wRow("more", "More videos", more)}
        ${others.length ? `<section class="w-row" data-row="other"><div class="w-row-head"><h2>Audio, images and more</h2><span class="meta">${others.length}</span></div><div class="media-grid">${others.map(m => `<article class="glass media-card" id="m-${esc(m.id)}">${mediaEmbed(m)}<div class="body"><span class="kicker">${esc(m.category || m.mediaType)}</span><h3>${esc(m.title)}</h3>${m.description ? `<p>${esc(m.description)}</p>` : ""}${shareBtn(m.title, mediaUrl(m))}</div></article>`).join("")}</div></section>` : ""}
      </div><div id="wResults" class="w-results" hidden></div>
      ${!films.length && !sh.length && !others.length ? `<div class="empty">Nothing published yet. Videos will appear here.</div>` : ""}`}
    </div></div>`;
  $("#wSearch")?.addEventListener("input", e => filterWatch(e.target.value));
  watchDurations(); watchHover();
  // A shared link (/watch?v=id) opens that short in the player, or plays that explainer.
  const want = parseRoute().params.get("v");
  if (want && all && openedShared !== want) {
    openedShared = want;
    const k = sh.findIndex(m => m.id === want);
    if (k >= 0) openShorts(k);
    else if (films.some(m => m.id === want)) openCinema(want, "latest");
  }
  mountWatchTV();
}
// Rashtrix TV in the app: the channel's own player (not the YouTube page of the stream).
const tvChannel = () => store.get("rw-tv-ch", "h") === "v" ? "v" : "h";
let tvInstance = null;
function mountWatchTV() {
  const host = $("#tvWatch"); if (!host) return;
  tvInstance?.destroy(); tvInstance = mountTV(host, { channel: tvChannel() });
  drawTvInteract();
}
// Under the player: the channel's open poll (one vote per device a day) and a comment box
// (signed-in readers; the desk chooses which comments go on screen).
async function drawTvInteract() {
  const box = $("#tvInteract"); if (!box) return;
  const { polls = [] } = await fetch("/api/polls", { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
  const voted = store.get("rw-voted", {}), p = polls[0];
  const total = p ? p.counts.reduce((a, b) => a + b, 0) : 0;
  box.innerHTML = `${p ? `<div class="tvi-poll glass"><span class="kicker">Poll</span><b data-no-tr>${esc(p.question)}</b>
      <div class="tvi-opts">${p.options.map((o, i) => voted[p.id] != null ? `<div class="tvi-res"><span data-no-tr>${esc(o)}</span><i style="width:${total ? Math.round(100 * p.counts[i] / total) : 0}%"></i><em>${digits(total ? Math.round(100 * p.counts[i] / total) : 0)}%</em></div>` : `<button type="button" class="btn btn-sm" data-vote="${i}" data-no-tr>${esc(o)}</button>`).join("")}</div>
      <small class="muted">Not a scientific survey. One vote per device a day.</small></div>` : ""}
    <form class="tvi-comment glass" id="tviC"><span class="kicker">Comment on the channel</span>${state.user ? `<div class="tvi-row"><input name="text" maxlength="300" placeholder="Write a comment for Rashtrix TV" required><button class="btn btn-dark btn-sm">Send</button></div><small class="muted">The newsroom reads every comment; some are shown on screen with your name.</small>` : `<p class="muted">Sign in to send a comment to the channel.</p><button class="btn btn-dark btn-sm" type="button" data-action="join">Sign in</button>`}</form>`;
  box.querySelectorAll("[data-vote]").forEach(b => b.addEventListener("click", async () => {
    try { await apiJSON(`/api/polls/${p.id}/vote`, { choice: Number(b.dataset.vote) }); voted[p.id] = Number(b.dataset.vote); store.set("rw-voted", voted); toast("Thank you. Your vote is counted."); drawTvInteract(); } catch (e) { toast(e.message); }
  }));
  $("#tviC")?.addEventListener("submit", async e => { e.preventDefault(); const t = e.target.elements.text; if (!t) return;
    try { await apiJSON("/api/comments", { text: t.value }); t.value = ""; toast("Sent to the newsroom."); } catch (x) { toast(x.message); } });
}
function filterWatch(q, cat) {
  const rows = $("#wRows"), res = $("#wResults"); if (!rows) return;
  q = (q || "").trim().toLowerCase();
  const films = (state.media || []).filter(isFilm);
  if (!q && (!cat || cat === "All")) { rows.hidden = false; res.hidden = true; return; }
  const hits = films.filter(m => (!cat || cat === "All" || m.category === cat) && (!q || `${m.title} ${m.description || ""}`.toLowerCase().includes(q)));
  state.wLists.results = hits.map(m => m.id);
  rows.hidden = true; res.hidden = false;
  res.innerHTML = hits.length ? `<div class="w-grid">${hits.map((m, i) => wCard(m, "results", i)).join("")}</div>` : `<div class="empty">No videos match.</div>`;
  watchDurations(); watchHover();
}
// Lengths are read from each video file once (only its header) and remembered on the device.
function watchDurations() {
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    const id = e.target.dataset.dur, m = (state.media || []).find(x => x.id === id); if (!m) return;
    const v = document.createElement("video"); v.preload = "metadata"; v.muted = true; v.src = m.mediaUrl;
    v.addEventListener("loadedmetadata", () => { const d = durations(); d[id] = Math.round(v.duration); store.set("rw-durations", d); document.querySelectorAll(`[data-dur="${CSS.escape(id)}"]`).forEach(x => { x.textContent = fmtDur(d[id]); x.hidden = false; }); v.removeAttribute("src"); v.load(); }, { once: true });
  }), { rootMargin: "200px" });
  document.querySelectorAll(".w-dur[data-dur]").forEach(x => io.observe(x));
}
// Computers: hovering a card enlarges it and plays a silent preview.
function watchHover() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  document.querySelectorAll(".w-card:not([data-hover])").forEach(c => {
    c.dataset.hover = "1";
    let t;
    c.addEventListener("mouseenter", () => { t = setTimeout(() => {
      const m = (state.media || []).find(x => x.id === c.dataset.id); if (!m || ytId(m) || c.querySelector("video")) return;
      const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.loop = true; v.src = m.mediaUrl; v.className = "w-hover-vid";
      c.querySelector(".w-thumb").append(v); v.play().catch(() => {});
    }, 550); });
    c.addEventListener("mouseleave", () => { clearTimeout(t); c.querySelector(".w-hover-vid")?.remove(); });
  });
}
// Phones: a tap opens a detail panel first; computers play straight away.
function openDetail(id, list) {
  const m = (state.media || []).find(x => x.id === id); if (!m) return;
  let el = $("#wDetail");
  if (!el) { el = document.createElement("dialog"); el.id = "wDetail"; el.className = "w-detail glass"; document.body.append(el); el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-close]")) el.close(); }); }
  const d = durations()[id];
  el.innerHTML = `<div class="w-detail-media">${img(thumbOf(m), "")}<button class="modal-close" type="button" data-close aria-label="Close">×</button></div>
    <div class="w-detail-body"><span class="kicker">${esc(CAT_NAMES[m.category] || m.category || "Video")}${d ? ` · ${fmtDur(d)}` : ""}</span><h2>${esc(m.title)}</h2>${m.description ? `<p>${esc(m.description)}</p>` : ""}
    <div class="w-detail-actions"><button class="btn btn-red" type="button" data-action="w-play" data-id="${esc(id)}" data-list="${esc(list)}">▶ Play</button>${shareBtn(m.title, mediaUrl(m), "btn btn-light")}</div></div>`;
  el.showModal();
}
// The cinema player: big, dark, with "Up next in 5…" at the end like a streaming service.
function openCinema(id, list) {
  const m = (state.media || []).find(x => x.id === id); if (!m) return;
  $("#wDetail")?.close?.();
  let el = $("#cinema");
  if (!el) {
    el = document.createElement("div"); el.id = "cinema"; el.className = "cinema"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="cin-top"><span class="cin-title"></span><button class="cin-x" type="button" aria-label="Close">×</button></div><video class="cin-video" controls playsinline></video><div class="cin-next" hidden></div>`;
    document.body.append(el);
    const v = el.querySelector("video");
    el.querySelector(".cin-x").addEventListener("click", closeCinema);
    document.addEventListener("keydown", e => { if (!el.hidden && e.key === "Escape") closeCinema(); });
    let saved = 0;
    v.addEventListener("timeupdate", () => {
      const c = state.cinema; if (!c || !v.duration) return;
      if (Date.now() - saved > 3000) { saved = Date.now(); const p = progressOf(); p[c.id] = { t: Math.round(v.currentTime), d: Math.round(v.duration), at: Date.now() }; store.set("rw-watch-progress", Object.fromEntries(Object.entries(p).sort((a, b) => b[1].at - a[1].at).slice(0, 60))); }
      if (v.duration - v.currentTime < 7 && !c.offered) offerNext();
    });
    v.addEventListener("loadedmetadata", () => { const d = durations(); d[state.cinema.id] = Math.round(v.duration); store.set("rw-durations", d); });
  }
  const v = el.querySelector("video"), ids = (state.wLists?.[list] || (state.media || []).filter(isFilm).map(x => x.id));
  state.cinema = { id, list, ids, offered: false };
  el.querySelector(".cin-title").textContent = m.title;
  el.querySelector(".cin-next").hidden = true;
  el.querySelector(".cin-frame")?.remove();
  if (ytId(m)) { // YouTube plays in its own player
    v.pause(); v.removeAttribute("src"); v.hidden = true;
    v.insertAdjacentHTML("afterend", `<iframe class="cin-frame" src="https://www.youtube-nocookie.com/embed/${ytId(m)}?autoplay=1" title="${esc(m.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`);
    el.hidden = false; document.body.classList.add("cin-open");
    beacon({ t: "play", id, src: "watch" });
    return;
  }
  v.hidden = false;
  const p = progressOf()[id];
  v.poster = m.thumbnailUrl || ""; v.src = m.mediaUrl;
  if (p && p.d && p.t / p.d < 0.94 && p.t > 5) v.currentTime = p.t;
  el.hidden = false; document.body.classList.add("cin-open");
  v.play().catch(() => {});
  beacon({ t: "play", id, src: "watch" });
}
function offerNext() {
  const c = state.cinema, el = $("#cinema"); c.offered = true;
  const nid = c.ids[(c.ids.indexOf(c.id) + 1) % c.ids.length], n = (state.media || []).find(x => x.id === nid);
  if (!n || nid === c.id) return;
  const box = el.querySelector(".cin-next");
  let left = 5;
  box.innerHTML = `<span class="thumb">${img(n.thumbnailUrl, "")}</span><span><span class="meta">Up next in <b class="cin-n">5</b></span><b>${esc(n.title)}</b></span><span class="cin-next-btns"><button class="btn btn-red btn-sm" type="button" data-go>▶ Play now</button><button class="btn btn-light btn-sm" type="button" data-stay>Cancel</button></span>`;
  box.hidden = false;
  clearInterval(offerNext.t);
  offerNext.t = setInterval(() => { left--; const k = box.querySelector(".cin-n"); if (k) k.textContent = left; if (left <= 0) { clearInterval(offerNext.t); openCinema(nid, c.list); } }, 1000);
  box.querySelector("[data-go]").onclick = () => { clearInterval(offerNext.t); openCinema(nid, c.list); };
  box.querySelector("[data-stay]").onclick = () => { clearInterval(offerNext.t); box.hidden = true; };
}
function closeCinema() {
  const el = $("#cinema"); if (!el || el.hidden) return;
  clearInterval(offerNext.t);
  const v = el.querySelector("video"); v.pause(); v.removeAttribute("src"); v.load();
  el.querySelector(".cin-frame")?.remove();
  el.hidden = true; document.body.classList.remove("cin-open"); state.cinema = null;
  if (["tv", "watch"].includes(parseRoute().page)) viewWatch();
}

/* ---------- Account ---------- */
function viewAccount() {
  if (!state.user) {
    $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><h1>Sign in to see your account</h1><div class="blocked-actions"><button class="btn btn-dark" type="button" data-action="signin">Sign in</button><button class="btn btn-light" type="button" data-action="join">Create an account</button></div></div></div>`;
    return;
  }
  const u = state.user, saved = store.get("rw-saved", []);
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">My account</div><h1>${esc(u.displayName)}</h1><p>${esc(u.email || "")} · ${esc(u.role)}</p></div></div>
  <div class="mgrid">
    <form class="mgroup glass account-form" id="nameForm"><h2>Your name</h2><label>Display name<input name="displayName" value="${esc(u.displayName)}" required minlength="2" maxlength="80" autocomplete="name"></label><p class="auth-message" aria-live="polite"></p><button class="btn btn-dark" type="submit">Save name</button></form>
    <form class="mgroup glass account-form" id="passwordForm"><h2>Password</h2><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>New password <small>(12+ characters)</small><input name="newPassword" type="password" required minlength="12" autocomplete="new-password"></label><p class="auth-message" aria-live="polite"></p><button class="btn btn-dark" type="submit">Change password</button></form>
    <div class="mgroup glass"><h2>Saved stories</h2><p class="muted">${saved.length} saved on this device.</p><a class="btn btn-light" href="/saved">Open saved stories</a></div>
    <div class="mgroup glass"><h2>Session</h2><p class="muted">Signing out ends this session on this device.</p><button class="btn btn-light" type="button" data-action="signout">Sign out</button>${["admin", "editor"].includes(u.role) ? ` <a class="btn btn-dark" href="/admin.html">Open the control room</a>` : ""}</div>
    <form class="mgroup glass account-form danger-zone" id="deleteForm"><h2>Delete account</h2><p class="muted">Erases your account, saved stories, followed topics, discussions and replies. This can’t be undone. See our <a href="/privacy">Privacy Policy</a>.</p><label>Type DELETE to confirm<input name="confirm" required pattern="DELETE" autocomplete="off"></label><p class="auth-message" aria-live="polite"></p><button class="btn btn-light" type="submit">Delete my account</button></form>
  </div></div>`;
  const wire = (id, fn) => $(id).addEventListener("submit", async e => {
    e.preventDefault(); const f = e.currentTarget, msg = f.querySelector(".auth-message"), btn = f.querySelector("button");
    btn.disabled = true; msg.textContent = "";
    try { await fn(Object.fromEntries(new FormData(f))); }
    catch (err) { msg.textContent = err.message; }
    finally { btn.disabled = false; }
  });
  wire("#nameForm", async v => { const d = await apiJSON("/api/auth/me", v, "PUT"); state.user = { ...state.user, displayName: d.user.displayName }; showUser(); toast("Name updated."); viewAccount(); });
  wire("#deleteForm", async v => { if (v.confirm !== "DELETE") throw new Error("Type DELETE to confirm."); await apiJSON("/api/auth/me", {}, "DELETE"); store.set("rw-saved", []); state.user = null; state.topics = []; showUser(); toast("Your account has been deleted."); navigate("/"); });
  wire("#passwordForm", async v => { await apiJSON("/api/auth/password", v); toast("Password changed. Other devices have been signed out."); $("#passwordForm").reset(); });
}

/* ---------- Search ---------- */
function openSearch() { $("#searchInput").value = ""; renderSearchResults(); $("#searchDialog").showModal(); $("#searchInput").focus(); }
function renderSearchResults() {
  const q = $("#searchInput").value.trim().toLowerCase(), host = $("#searchResults");
  if (q.length < 2) { host.innerHTML = `<p class="muted">Try a place, a topic or a name. Press Enter for all results.</p>`; return; }
  const found = stories().filter(e => matches(e, q)).slice(0, 10);
  host.innerHTML = found.length ? found.map(e => `<a href="${edHref(e)}" data-close-dialog><b>${esc(e.title)}</b><span class="meta">${esc(tr(e.category))} · ${shortDate(e.date)}</span></a>`).join("") : `<p class="muted">Nothing matched “${esc(q)}”.</p>`;
}

/* ---------- Data loading ---------- */
async function loadCommunity() {
  try { state.community = (await fetch("/api/community/posts").then(r => r.json())).posts || []; } catch { state.community = []; }
  try { state.events = (await fetch(`/api/events?lang=${lang}`).then(r => r.json())).events || []; } catch { state.events = []; }
  try { state.communityStats = await fetch("/api/community/stats").then(r => r.ok ? r.json() : null); } catch { /* optional */ }
  renderCommunity();
  if (parseRoute().page === "community" && !$("#threadList")) viewCommunity();
  if (parseRoute().page === "events") viewEvents();
}

/* ---------- Accounts ---------- */
let authMode = "login";
function openAuth(mode = "register") { setAuthMode(mode); $("#modalBackdrop").classList.remove("hidden"); $("#authForm input[name=email]").focus(); }
function closeAuth() { $("#modalBackdrop").classList.add("hidden"); }
function setAuthMode(mode) {
  authMode = mode;
  $("#modalTitle").textContent = mode === "login" ? "Welcome back." : "Make the world make sense.";
  $("#nameField").classList.toggle("hidden", mode === "login");
  $("#authPerks").hidden = mode === "login";
  $("#nameField input").required = mode === "register";
  $("#authForm input[name=password]").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#authSubmit").textContent = mode === "login" ? "Sign in" : "Create free account";
  $("#authSwitchText").textContent = mode === "login" ? "New to Rashtrix?" : "Already have an account?";
  $("#consentNote").hidden = mode === "login";
  $("#authSwitch").textContent = mode === "login" ? "Create an account" : "Sign in instead";
  $("#authMessage").textContent = "";
}
const initials = name => (name || "").trim().split(/\s+/).slice(0, 2).map(w => [...w][0]?.toUpperCase() || "").join("") || "RX";
function showUser() {
  const u = state.user;
  $("#guestActions").classList.toggle("hidden", !!u);
  $("#account").classList.toggle("hidden", !u);
  renderJoin();
  if (!u) { toggleAccountMenu(false); return; }
  $("#avatarBtn").textContent = initials(u.displayName);
  $("#avatarBtn").setAttribute("aria-label", `Account: ${u.displayName}`);
  const staff = ["admin", "editor"].includes(u.role);
  $("#accountMenu").innerHTML = `<div class="account-head"><b>${esc(u.displayName)}</b><span class="meta">${esc(u.role)}</span></div>
    <a role="menuitem" href="/my">My Rashtrix</a><a role="menuitem" href="/saved">Saved stories</a><a role="menuitem" href="/account">My account</a><button role="menuitem" type="button" data-action="alerts">Breaking-news alerts</button>${staff ? `<a role="menuitem" href="/admin.html">Control room</a>` : ""}
    ${isStandalone() ? "" : `<button role="menuitem" type="button" data-action="install">Install the app</button>`}
    <button role="menuitem" type="button" data-action="signout">Sign out</button>`;
}
function toggleAccountMenu(force) {
  const menu = $("#accountMenu"), btn = $("#avatarBtn"); if (!menu) return;
  const open = force ?? menu.hidden;
  menu.hidden = !open; btn.setAttribute("aria-expanded", String(open));
}
async function submitAuth(e) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const payload = { email: form.get("email"), password: form.get("password"), displayName: form.get("displayName") };
  $("#authSubmit").disabled = true; $("#authMessage").textContent = "Connecting securely…";
  try {
    const r = await fetch(`/api/auth/${authMode === "login" ? "login" : "register"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Request failed.");
    if (authMode === "register") { setAuthMode("login"); $("#authMessage").textContent = "Account created. Sign in to continue."; }
    else { state.user = d.user; showUser(); mergeLocalSaves(); loadTopics(); toast(`Welcome, ${d.user.displayName}.`); closeAuth(); const pg = parseRoute().page; if (["my", "saved", "tag"].includes(pg)) route(); }
  } catch (err) { $("#authMessage").textContent = err.message; }
  finally { $("#authSubmit").disabled = false; }
}
async function signOut() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* offline */ }
  state.user = null; state.topics = []; showUser(); toast("Signed out.");
}
async function submitLead(e) {
  e.preventDefault();
  const form = e.currentTarget, msg = $("#leadMessage");
  msg.textContent = "Submitting…";
  try {
    const r = await fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not submit");
    msg.textContent = d.message || "Request received."; form.reset();
  } catch (err) { msg.textContent = err.message; }
}
/* ---------- Fresh news: the "new stories" pill, pull to refresh, "Updated … ago" ---------- */
// Stories published since the reader's previous visit get a small "New" tag.
const PAGE_OPENED = Date.now();
const prevSeen = store.get("rw-seen-stories", 0); store.set("rw-seen-stories", Date.now());
const isNewStory = e => prevSeen > 0 && Date.parse(e.publishedAt || e.date) > prevSeen;
const newTag = e => isNewStory(e) ? `<span class="new-tag">New</span>` : "";
function markFresh() { state.freshAt = Date.now(); renderFresh(); }
function renderFresh() {
  const el = $("#freshText"); if (!el || !state.freshAt) return;
  const m = Math.floor((Date.now() - state.freshAt) / 60e3), at = clock(new Date(state.freshAt).toISOString());
  const full = m < 1 ? "Updated just now" : m < 60 ? `Updated ${m} min ago` : `Updated at ${at}`;
  // Phones have room for only a few characters next to the buttons.
  el.textContent = matchMedia("(max-width: 760px)").matches ? (m < 1 ? "Now" : m < 60 ? `${m}m` : at) : full;
  $("#freshBtn").title = tr(full);
}
function showNewPill() {
  const known = new Set((state.articles || []).map(a => a.id));
  const n = (state.pendingArticles || []).filter(a => !known.has(a.id)).length, live = state.newLive;
  if (!n && !live) return;
  let pill = $("#newPill");
  if (!pill) {
    pill = document.createElement("div"); pill.id = "newPill"; pill.className = "new-pill"; pill.setAttribute("role", "status");
    document.body.append(pill);
  }
  const label = n ? (n === 1 ? "1 new story" : `${n} new stories`) : "Live coverage started";
  pill.innerHTML = `<button type="button" class="np-go" data-action="apply-new">${live && !n ? `<span class="dot-live"></span>` : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`}<span><b>${label}</b><small>Refresh</small></span></button><button type="button" class="np-x" data-action="dismiss-new" aria-label="Dismiss">×</button>`;
  pill.hidden = false; requestAnimationFrame(() => pill.classList.add("show"));
  clearTimeout(showNewPill.timer); showNewPill.timer = setTimeout(hideNewPill, 60e3);
}
function hideNewPill() { const p = $("#newPill"); if (!p) return; p.classList.remove("show"); state.newLive = null; }
async function refreshAll({ quiet = false } = {}) {
  const btn = $("#freshBtn"); btn?.classList.add("spin");
  await Promise.allSettled([loadArticles({ apply: true }), loadCoverage(), loadMedia(), loadAlerts()]);
  btn?.classList.remove("spin");
  if (!quiet) toast("You’re up to date.");
}
// The installed app has no browser pull-to-refresh, so it gets its own, with the Rashtrix mark.
function pullToRefresh() {
  if (!isStandaloneApp() || !("ontouchstart" in window)) return;
  const el = document.createElement("div"); el.className = "ptr"; el.setAttribute("aria-hidden", "true"); el.innerHTML = brandMark("ptr-mark");
  document.body.append(el);
  let y0 = null, dy = 0, busy = false;
  const pull = () => Math.min(dy * 0.5, 96);
  const reset = () => { el.classList.remove("spin", "ready"); el.style.transform = ""; el.style.opacity = ""; };
  addEventListener("touchstart", e => { if (busy || scrollY > 2 || e.touches.length > 1 || document.body.classList.contains("sv-open") || e.target.closest("dialog,.modal,.sheet,.alerts-panel")) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  addEventListener("touchmove", e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (scrollY > 2) { y0 = null; reset(); return; }
    el.style.transform = `translate(-50%, ${pull()}px) rotate(${dy * 1.6}deg)`; el.style.opacity = Math.min(1, pull() / 48); el.classList.toggle("ready", pull() >= 64);
  }, { passive: true });
  addEventListener("touchend", async () => {
    if (y0 == null) return; y0 = null;
    if (pull() < 64) return reset();
    busy = true; el.classList.add("spin"); el.style.transform = "translate(-50%, 64px)";
    await refreshAll(); busy = false; reset();
  });
}
function toast(message) { const t = $("#toast"); t.textContent = message; t.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 3200); }

/* ---------- PWA ---------- */
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const recentlyDismissed = () => Date.now() - (store.get("rw-install-dismissed", 0) || 0) < 14 * 864e5;
function showInstallSheet({ force = false } = {}) {
  if (isStandalone() || (!force && recentlyDismissed())) return;
  const ios = isIOS() && !state.installPrompt;
  const installed = store.get("rw-installed", false);
  const button = $(".install-actions [data-action=install]");
  const openButton = $(".install-actions [data-action=install-open]");
  $(".install-ios").hidden = !ios || installed;
  $(".install-android").hidden = ios;
  $(".install-other").hidden = ios || installed || !!state.installPrompt;
  $(".install-installed").hidden = !installed;
  button.hidden = installed;
  openButton.hidden = !installed;
  button.textContent = ios ? "How to add Rashtrix" : state.installPrompt ? "Install Rashtrix" : "Install / Add to Home Screen";
  $("#installTitle").innerHTML = installed ? tr("Your Rashtrix app is ready") : `${tr("Install the")}<br>Rashtrix <span>${tr("App")}</span>`;
  $("#installSheet").hidden = false;
}
function openInstalledPWA() {
  if (isIOS()) return toast("Open Rashtrix from its home-screen icon to launch the app.");
  // Re-open the same origin in a fresh top-level tab. Android browsers that support
  // installed-web-app link capture can hand this URL to the installed app.
  const target = new URL(location.href);
  const opened = window.open(target.href, "_blank", "noopener");
  if (!opened) toast("If the app doesn't open automatically, launch Rashtrix from your app list.");
  else toast("Opening Rashtrix. If it stays in the browser, use the app icon.");
}
async function installPWA() {
  if (isStandalone()) return toast("Rashtrix is already installed on this device.");
  if (store.get("rw-installed", false)) return openInstalledPWA();
  if (isIOS()) {
    showInstallSheet({ force: true });
    return toast("Follow the steps above: Share, then Add to Home Screen.");
  }
  if (!state.installPrompt) {
    showInstallSheet({ force: true });
    return toast("Use your browser menu to choose Install app or Add to Home screen.");
  }
  $("#installSheet").hidden = true;
  const promptEvent = state.installPrompt;
  state.installPrompt = null;
  promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  if (outcome !== "accepted") store.set("rw-install-dismissed", Date.now());
}
// The automatic offer waits while a video is playing.
const videoBusy = () => [...document.querySelectorAll("video")].some(v => !v.paused);
function offerInstall(opts) { if (videoBusy()) setTimeout(() => offerInstall(opts), 15e3); else showInstallSheet(opts); }
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  state.installPrompt = e;
  offerInstall();
});
window.addEventListener("appinstalled", () => {
  if (!store.get("rw-installed", false)) { store.set("rw-installed", true); beacon({ t: "install", platform: platformOf() }); }
  $("#installSheet").hidden = true;
  toast("Rashtrix is installed. Find it on your home screen.");
});
// Offer installation on every supported device/browser, not just iOS or browsers that fire
// beforeinstallprompt. Native installation is used where available; otherwise the sheet explains
// the browser's Add to Home Screen / Install menu.
if (!isStandalone()) {
  const installLanding = location.pathname.replace(/\/+$/, "") === "/install";
  setTimeout(() => offerInstall({ force: installLanding }), installLanding ? 900 : 6500);
}
document.documentElement.classList.toggle("standalone", isStandalone());

function syncOnline(event) {
  const off = !navigator.onLine;
  document.body.classList.toggle("is-offline", off);
  $("#offlineBar").hidden = !off;
  if (event?.type === "online") { loadArticles(); loadCoverage(); }
}

// Updates: a new service worker waits until the reader taps Update, then the page reloads once.
let waitingWorker = null;
function offerUpdate(worker) { waitingWorker = worker; $("#updateBar").hidden = false; }
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60e3);
    } catch { /* unsupported or blocked */ }
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (waitingWorker && !reloading) { reloading = true; location.reload(); } });
}

/* ---------- Language ---------- */
function setLanguagePreference(l) { store.set("rw-lang", l); }
// Readers whose device is set to Hindi are offered Hindi once. (English is not offered: most
// Bengali readers' phones are set to English, and the site is Bengali first.)
function maybeSuggestLanguage() {
  if (lang !== DEFAULT_LANG || store.get("rw-lang", null)) return;
  const want = (navigator.languages || [navigator.language]).map(x => String(x).slice(0, 2).toLowerCase()).find(x => ["bn", "hi"].includes(x));
  if (want !== "hi") return;
  const box = $("#langSuggest"), here = stripLang(location.pathname) + location.search;
  box.innerHTML = want === "hi"
    ? `<span lang="hi-IN"><b>राष्ट्रिक्स अब हिन्दी में भी</b><small>पूरी साइट और खबरें हिन्दी में पढ़ें।</small></span><a class="btn btn-red btn-sm lang-link" href="${withLang(here, "hi")}" data-lang="hi" lang="hi-IN">हिन्दी में पढ़ें</a>`
    : `<span lang="en-IN"><b>Rashtrix is also in English</b><small>Read the whole site and its stories in English.</small></span><a class="btn btn-red btn-sm lang-link" href="${withLang(here, "en")}" data-lang="en" lang="en-IN">Read in English</a>`;
  box.setAttribute("data-no-tr", "");
  box.insertAdjacentHTML("beforeend", `<button class="ub-close" type="button" data-action="lang-later" aria-label="Close">${ICON_X}</button>`);
  setTimeout(() => { box.hidden = false; }, 2500);
}

/* ---------- Boot ---------- */
// Readers who chose a language get it on every visit, also from links in another language.
const langPref = store.get("rw-lang", null);
const langTarget = LANGUAGES[langPref] && langPref !== lang && lang === DEFAULT_LANG ? withLang(location.pathname, langPref) : null;
if (langTarget && langTarget !== location.pathname) location.replace(langTarget + location.search + location.hash);
else loadLanguage().catch(() => {}).then(boot);
let articlesReady, userReady;
function boot() {
articlesReady = loadArticles();
// The session is checked once at start; pages that depend on it wait for the answer.
userReady = fetch("/api/auth/me").then(r => r.json()).then(async d => { state.user = d.user || null; if (state.user) await loadTopics(); }).catch(() => {});
renderShell();
startTranslator(document.body); // draws the interface in Bengali or Hindi
trackVisit();
watchScroll();
maybeSuggestLanguage();
// Links from before clean URLs (#/edition/slug) still work.
const fromHash = () => { if (location.hash.startsWith("#/")) { history.replaceState({ rw: true }, "", location.hash.slice(1) || "/"); return true; } return false; };
fromHash();
window.addEventListener("hashchange", () => { if (fromHash()) route(); });
window.addEventListener("popstate", e => route({ restoreY: e.state?.y ?? 0 }));
userReady.then(() => { if (state.user) { showUser(); loadTopics().then(() => { const pg = parseRoute(); if (pg.page === "tag") viewTag(pg); }); } });
quoteShare();
navigator.serviceWorker?.ready.then(async () => { if (pushSupported() && Notification.permission === "granted" && !store.get("rw-alerts-optout", 0)) await enableAlerts({ silent: true }); else await syncAlertsButton(); maybeAskForAlerts(); }).catch(() => {});
loadAlerts(); setInterval(() => { if (!document.hidden) loadAlerts(); }, 60e3);
document.addEventListener("click", interceptLinks);
route();
loadCommunity(); loadCoverage(); loadMedia(); loadYtShorts();
renderClocks(); setInterval(renderClocks, 20e3);
setInterval(() => { if (!document.hidden) loadCoverage(); }, 60e3);
setInterval(() => { if (!document.hidden) loadArticles(); }, 2 * 60e3);
// Back on screen after a while (a phone woken up, the app reopened): fetch the news at once.
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (Date.now() - hiddenAt > 30e3) { loadArticles(); loadCoverage(); loadAlerts(); }
});
pullToRefresh();
setInterval(renderFresh, 30e3);
}

import "./style.css";
import { editions, NEWSLETTER_URL, AUTHOR } from "./editions.js";
import { brandMark, skyline, tribar, wordmark } from "./brand.js";
import { WRITERS, writer } from "./writers.js";
import { ABOUT, LEGAL, LEGAL_ORDER, LEGAL_UPDATED } from "./legal.js";
import { lang, LOCALE, LANGUAGES, stripLang, withLang, tr, ago, digits, loadLanguage, startTranslator, languageLinks } from "./i18n.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const IST = { timeZone: "Asia/Kolkata" };

const state = { articles: [], media: null, coverage: [], coverageLead: null, user: null, wire: null, wireError: false, markets: null, marketsError: false, community: null, events: null, installPrompt: null, homeGroup: "india", topics: [] };
const wireIndex = new Map(); // url -> wire item, so the reader can show a headline while it loads

/* ---------- Formatting ---------- */
const toDate = d => new Date(String(d).length === 10 ? `${d}T00:00:00+05:30` : d);
const editionDate = d => toDate(d).toLocaleDateString(LOCALE, { ...IST, day: "numeric", month: "short", year: "numeric" });
const shortDate = d => toDate(d).toLocaleDateString(LOCALE, { ...IST, day: "numeric", month: "short" });
const clock = iso => iso ? new Date(iso).toLocaleTimeString(LOCALE, { ...IST, hour: "2-digit", minute: "2-digit", hour12: false }) : "";
const num = (v, d = 2) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const isYield = q => /^\^(TNX|FVX|TYX)$/.test(q?.symbol || "");
function quoteValue(q) {
  if (!q || q.value == null) return "—";
  if (isYield(q)) return `${num(q.value)}%`;
  return num(q.value, q.value >= 1000 ? 1 : 2);
}
function quoteChange(q) {
  if (!q || q.changePct == null) return { text: q?.status === "unavailable" ? "Unavailable" : "—", cls: "flat" };
  const cls = q.change > 0 ? "up" : q.change < 0 ? "down" : "flat";
  if (isYield(q)) return { text: `${q.change > 0 ? "+" : q.change < 0 ? "−" : ""}${Math.abs(q.change * 100).toFixed(1)}bp`, cls };
  return { text: `${q.changePct > 0 ? "+" : q.changePct < 0 ? "−" : ""}${Math.abs(q.changePct).toFixed(2)}%`, cls };
}
function sparkline(points = [], cls = "flat", w = 120, h = 26) {
  if (points.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1) * w).toFixed(1)},${(h - 2 - (p - min) / span * (h - 4)).toFixed(1)}`).join(" ");
  const color = cls === "up" ? "var(--up)" : cls === "down" ? "var(--down)" : "var(--muted)";
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${d}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}
const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ICON_CHECK = `<svg class="ck" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>`;
const ICON_LOCK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-ink)" stroke-width="2" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const ICON_INFO = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-ink)" stroke-width="2" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>`;
const img = (src, alt = "") => src ? `<img class="img-cover" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-hide-on-error>` : "";

/* ---------- Storage (per device conveniences only) ---------- */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
};
function saveForLater(item) {
  const saved = store.get("rw-saved", []);
  if (!saved.some(s => s.href === item.href)) saved.unshift({ ...item, savedAt: new Date().toISOString() });
  store.set("rw-saved", saved.slice(0, 100));
  // Members: the save follows them to every device.
  if (state.user) fetch("/api/me/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) }).catch(() => {});
  const target = new URLSearchParams(item.href.split("?")[1] || "").get("u");
  if (target) navigator.serviceWorker?.controller?.postMessage({ type: "SAVE_ARTICLE", url: `/api/read?url=${encodeURIComponent(target)}` });
  toast(target ? "Saved. It will be readable offline too." : "Saved. Raisina Wire editions are always available offline.");
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

/* ---------- Calibrex: platform credit and OSINT Studio ---------- */
const CX = "utm_source=raisinawire&utm_medium=referral";
const cxLink = (path, campaign) => `https://calibrex.org${path}?${CX}&utm_campaign=${campaign}`;
const STUDIO_APP = campaign => `https://app.calibrex.org/?${CX}&utm_campaign=${campaign}`;
const cxWordmark = `<span class="cx-word">CALIBRE<span>X</span></span>`;
function poweredByCalibrex() {
  return `<a class="powered-cx" href="${cxLink("/", "powered_by")}" target="_blank" rel="noopener" aria-label="Powered by Calibrex (opens calibrex.org)"><span>Powered by</span><img src="/partners/calibrex-mark.svg" alt="" width="20" height="20">${cxWordmark}<span class="cx-arrow">↗</span></a>`;
}
function studioAd(campaign = "footer_ad") {
  return `<aside class="studio-ad" aria-label="Advertisement: Calibrex OSINT Studio">
    <div class="sa-copy"><span class="sa-eyebrow"><img src="/partners/calibrex-mark.svg" alt="" width="18" height="18">From Calibrex<span class="sa-ad">Ad</span></span>
      <h3>Calibrex OSINT Studio</h3><p class="sa-line">Make research defensible.</p>
      <p>OSINT software for teams who investigate, verify and analyse public information: source discovery, entity research, timelines, link analysis and sourced briefs.</p>
      <ul class="sa-facts"><li>50+ live sources</li><li>5-minute refresh</li><li>India-first, globally aware</li><li>Web, iPhone, Android, desktop</li></ul>
      <div class="sa-actions"><a class="btn sa-cta" href="${STUDIO_APP(campaign)}" target="_blank" rel="noopener sponsored">Try OSINT Studio free ↗</a><a class="sa-more" href="${cxLink("/osint-studio/", campaign)}" target="_blank" rel="noopener sponsored">Learn more ↗</a></div></div>
    <div class="sa-phone" aria-hidden="true"><img src="/partners/osint-studio.webp" alt="" loading="lazy" width="640" height="975"></div>
  </aside>`;
}
function studioMiniAd(campaign = "community_ad") {
  return `<aside class="studio-mini" aria-label="Advertisement: Calibrex OSINT Studio"><span class="sa-eyebrow"><img src="/partners/calibrex-mark.svg" alt="" width="16" height="16">From Calibrex<span class="sa-ad">Ad</span></span>
    <b>Check the claims yourself.</b><p>Calibrex OSINT Studio: discover sources, verify evidence and turn public information into a sourced brief.</p>
    <a class="btn sa-cta btn-sm" href="${STUDIO_APP(campaign)}" target="_blank" rel="noopener sponsored">Try OSINT Studio free ↗</a></aside>`;
}

/* ---------- Shell ---------- */
const NAV = [
  ["Today", "/", r => r.page === "home"],
  ["Raisina Wire", "/editions", r => ["editions", "edition", "article"].includes(r.page)],
  ["Live", "/live", r => r.page === "live" && !r.arg],
  ["India", "/live/India", r => r.page === "live" && r.arg === "India"],
  ["Security", "/live/Security", r => r.page === "live" && r.arg === "Security"],
  ["Markets", "/markets", r => r.page === "markets"],
  ["Community", "/community", r => r.page === "community" || r.page === "discussion"],
  ["Events", "/events", r => r.page === "events"],
  ["Watch", "/watch", r => r.page === "watch"],
  ["Saved", "/saved", r => r.page === "saved"]
];

function renderShell() {
  document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#view">Skip to content</a>`);
  $("#app").innerHTML = `
  <div class="ticker" role="region" aria-label="Latest headlines"><div class="wrap ticker-in">
    <span class="ticker-label"><span class="pulse"></span>Live</span>
    <div class="ticker-track"><div class="ticker-move" id="tickerMove"><span class="ticker-item muted">Connecting to the live wire…</span></div></div>
    <button class="ticker-toggle" type="button" data-action="ticker-toggle" aria-label="Pause headlines" aria-pressed="false"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path class="i-pause" d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor"/><path class="i-play" d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg></button>
    <div class="clocks" id="clocks" aria-label="World clocks"></div>
  </div></div>
  <header class="wrap">
    <div class="utility">
      <div class="utility-left"><span id="today"></span><span id="wireStatus"><span class="dot-ok"></span>Connecting to the live wire…</span></div>
      <div class="utility-right">
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
      <div class="nameplate"><a class="nameplate-link" href="/" aria-label="Raisina Wire home">${brandMark()}<span class="wordmark">${wordmark()}</span></a>
        <div class="nameplate-tag">${tribar()}<p><span class="l">An Indian perspective</span> <span class="l">on a changing world</span> <span class="l gold">New Delhi · Est. 2026</span></p></div></div>
      ${skyline("skyline-band", true)}
    </div>
  </header>
  <div class="nav-dock"><div class="wrap"><nav class="site-nav glass" id="siteNav" aria-label="Sections"></nav></div></div>
  <div class="read-progress" id="readProgress" aria-hidden="true"></div>
  <main id="view" tabindex="-1"></main>
  <footer class="site-footer"><div class="wrap">
    <div class="footer-top"><a class="footer-brand" href="/" aria-label="Raisina Wire home">${brandMark()}<span class="wordmark">${wordmark()}</span></a>
      <div class="footer-links"><a href="/editions">All editions</a><a href="/live">Live wire</a><a href="/markets">Markets</a><a href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer" id="linkedinLink">Newsletter on LinkedIn ↗</a><a href="/about">About</a><a href="#" data-action="install" class="install-link">Install the app</a></div></div>
    <form class="lead-form glass" id="leadForm"><span class="kicker">Briefings &amp; partnerships</span>
      <label class="sr-only" for="leadName">Your name</label><input id="leadName" name="name" placeholder="Your name" required minlength="2" autocomplete="name">
      <label class="sr-only" for="leadEmail">Work email</label><input id="leadEmail" name="email" type="email" placeholder="Work email" required autocomplete="email">
      <label class="sr-only" for="leadOrg">Organisation</label><input id="leadOrg" name="organisation" placeholder="Organisation (optional)" autocomplete="organization">
      <label class="sr-only" for="leadInterest">Interest</label><select id="leadInterest" name="interest"><option>Daily briefing</option><option>Academy training</option><option>Calibrex enterprise enquiry</option><option>Speaking / partnership</option></select>
      <button class="btn btn-dark" type="submit">Request contact</button><small id="leadMessage" aria-live="polite"></small></form>
    ${studioAd()}
    <nav class="lang-foot" id="langFoot" data-no-tr aria-label="Language">${languageLinks()}</nav>
    <nav class="legal-links" aria-label="Legal"><a href="/about">About Raisina Wire</a>${LEGAL_ORDER.map(([k, t]) => `<a href="/${k}">${t}</a>`).join("")}</nav>
    <div class="footer-base">${poweredByCalibrex()}</div>
    <p class="copyright">© ${new Date().getFullYear()} Raisina Wire. All rights reserved. An independent publication, not affiliated with the Government of India. Headlines and excerpts from other publishers are credited and linked, and remain their property. Market data is delayed and is not investment advice.</p>
  </div></footer>
  <div class="modal-backdrop hidden" id="modalBackdrop"><section class="modal glass" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <button class="modal-close" id="modalClose" type="button" aria-label="Close">×</button>
    <div class="kicker">Raisina Wire membership</div><h2 id="modalTitle">Welcome back.</h2>
    <p class="modal-intro">A free account lets you join community discussions and members’ briefings.</p>
    <ul class="auth-perks" id="authPerks">${PERKS.map(([icon, title]) => `<li><span class="perk-icon">${PERK_ICONS[icon]}</span>${title}</li>`).join("")}</ul>
    <div id="authMessage" class="auth-message" aria-live="polite"></div>
    <form id="authForm"><label id="nameField" class="hidden">Your name<input name="displayName" autocomplete="name" minlength="2"></label>
      <label>Email address<input name="email" type="email" autocomplete="email" required></label>
      <label>Password <small>(12+ characters)</small><input name="password" type="password" minlength="12" autocomplete="current-password" required></label>
      <button class="btn btn-dark" type="submit" id="authSubmit">Sign in</button></form>
    <div class="auth-switch"><span id="authSwitchText">New to Raisina Wire?</span><button id="authSwitch" type="button">Create an account</button></div>
  </section></div>
  <dialog class="form-dialog glass" id="formDialog" aria-labelledby="formDialogTitle"><form method="dialog" id="dialogForm">
    <button class="modal-close" type="button" data-close-dialog aria-label="Close">×</button>
    <div class="kicker" id="formDialogKicker"></div><h2 id="formDialogTitle"></h2><div id="formDialogFields"></div>
    <p class="auth-message" id="formDialogMessage" aria-live="polite"></p>
    <div class="dialog-actions"><button class="btn btn-dark" type="submit" id="formDialogSubmit">Save</button><button class="btn btn-light" type="button" data-close-dialog>Cancel</button></div>
  </form></dialog>
  <dialog class="search-dialog glass" id="searchDialog" aria-label="Search"><div class="search-box">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input id="searchInput" type="search" placeholder="Search Raisina Wire and the live wire" aria-label="Search" autocomplete="off"><button class="btn btn-light btn-sm" type="button" data-close-dialog>Esc</button></div>
    <div id="searchResults" class="search-results"></div></dialog>
  <div class="toast" id="toast" role="status"></div>
  <div class="alert-banner glass" id="alertBanner" role="status" hidden></div>
  <section class="sheet" id="alertsSheet" role="dialog" aria-labelledby="alertsSheetTitle" hidden>
    <span class="sheet-grip" aria-hidden="true"></span>
    <button class="sheet-x" type="button" data-action="alerts-later" aria-label="Close">${ICON_X}</button>
    <div class="sheet-hero alerts"><span class="sheet-icon bell">${ICON_BELL}</span><span class="sheet-ping" aria-hidden="true"></span></div>
    <span class="kicker">Breaking news, as it happens</span><h2 id="alertsSheetTitle">Turn on Raisina Wire alerts</h2>
    <ul class="sheet-list">${ALERT_TYPES.map(t => `<li>${ICON_CHECK}<span>${t}</span></li>`).join("")}</ul>
    <div class="sheet-actions"><button class="btn btn-red sheet-primary" type="button" data-action="alerts-allow">Allow alerts</button><button class="sheet-secondary" type="button" data-action="alerts-later">Not now</button></div>
    <p class="sheet-note">Your browser asks you to confirm once. Turn them off any time from the bell.</p>
  </section>
  <div class="offline-bar" id="offlineBar" role="status" hidden><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.3-1.6M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg><span>You’re offline. Editions and saved stories still open; live data shows the last copy.</span></div>
  <div class="update-bar lang-suggest" id="langSuggest" role="status" hidden></div>
  <div class="update-bar" id="updateBar" role="status" hidden>
    <span class="ub-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg></span>
    <span class="ub-text"><b>A new version is ready</b><small>Update for the latest stories and fixes.</small></span>
    <button class="btn btn-red btn-sm" type="button" data-action="apply-update">Update</button>
    <button class="ub-close" type="button" data-action="update-later" aria-label="Later">${ICON_X}</button>
  </div>
  <section class="sheet install-sheet" id="installSheet" role="dialog" aria-labelledby="installTitle" hidden>
    <span class="sheet-grip" aria-hidden="true"></span>
    <button class="sheet-x" type="button" data-action="install-dismiss" aria-label="Close">${ICON_X}</button>
    <div class="sheet-hero install"><img class="sheet-app" src="/icon-192.png" alt="" width="72" height="72"></div>
    <span class="kicker">The Raisina Wire app</span><h2 id="installTitle">Add Raisina Wire to your home screen</h2>
    <ul class="sheet-list"><li>${ICON_CHECK}<span>Every edition readable offline</span></li><li>${ICON_CHECK}<span>Live wire, markets and live coverage in one tap</span></li><li>${ICON_CHECK}<span>Alerts and full-screen reading, like any app</span></li></ul>
    <ol class="install-ios" hidden>
      <li><span class="step">1</span><span>Tap <b>Share</b> <svg class="ios-share" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5"/></svg> in Safari’s toolbar</span></li>
      <li><span class="step">2</span><span>Choose <b>Add to Home Screen</b> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg></span></li>
      <li><span class="step">3</span><span>Open Raisina Wire from your home screen</span></li>
    </ol>
    <div class="sheet-actions install-actions"><button class="btn btn-red sheet-primary" type="button" data-action="install">Install the app</button><button class="sheet-secondary" type="button" data-action="install-dismiss">Not now</button></div>
  </section>`;

  $("#today").textContent = new Date().toLocaleDateString(LOCALE, { ...IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#signInBtn").addEventListener("click", () => openAuth("login"));
  $("#joinBtn").addEventListener("click", () => openAuth("register"));
  $("#avatarBtn").addEventListener("click", () => toggleAccountMenu());
  document.addEventListener("click", e => { if (!e.target.closest("#langMenu")) $("#langMenu").open = false; if (!e.target.closest("#account")) toggleAccountMenu(false); if (!e.target.closest(".alerts-wrap") && $("#alertsPanel") && !$("#alertsPanel").hidden) toggleAlertsPanel(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") toggleAccountMenu(false); });
  renderClocks(); setInterval(renderClocks, 20e3);
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
    (e.target.closest(".thumb, .reader-hero") || e.target).classList.add("hidden");
  }, true);
}

function renderNav(route) {
  $("#siteNav").innerHTML = `<a class="nav-brand" href="/" aria-label="Raisina Wire home" tabindex="-1">${brandMark()}<span class="wordmark">${wordmark()}</span></a>` + NAV.map(([label, href, active]) => `<a href="${href}"${active(route) ? ' aria-current="page"' : ""}>${label === "Live" && state.coverage.length ? `<span class="nav-live" aria-label="Live coverage running"></span>` : ""}${label}</a>`).join("")
    + `<button class="search-btn" type="button" data-action="search" aria-label="Search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>`;
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
const views = { about: viewAbout, ...Object.fromEntries(LEGAL_ORDER.map(([k]) => [k, viewLegal])), coverage: viewCoverage, home: viewHome, editions: viewEditions, edition: viewStory, article: viewStory, author: viewAuthor, tag: viewTag, my: viewMy, read: viewExternal, live: viewLive, markets: viewMarkets, community: viewCommunity, discussion: viewDiscussion, events: viewEvents, watch: viewWatch, account: viewAccount, saved: viewSaved, search: viewSearch };
const DEFAULT_TITLE = "Raisina Wire — India’s strategic briefing on geopolitics, security and markets";
let routeSeq = 0;
async function route({ restoreY = null } = {}) {
  const r = parseRoute(), seq = ++routeSeq;
  if (restoreY === null) jump(0);
  document.title = DEFAULT_TITLE;
  renderNav(r);
  $("#langPop").innerHTML = languageLinks(); $("#langFoot").innerHTML = languageLinks(); $("#langMenu").open = false; // same page, other language
  const view = views[r.page] || viewNotFound;
  // Lists that mix in control-room articles wait briefly for them, so the lead story doesn't flash.
  stopListening();
  if (["home", "editions", "search", "author", "edition", "article", "tag", "my"].includes(r.page)) await Promise.race([articlesReady, new Promise(res => setTimeout(res, 1200))]);
  if (["account", "discussion", "community", "my", "saved", "tag"].includes(r.page)) await Promise.race([userReady, new Promise(res => setTimeout(res, 2500))]);
  document.body.classList.toggle("is-reading", ["edition", "article", "read"].includes(r.page));
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
  // The compact wordmark appears in the pinned menu once the masthead has scrolled away.
  new IntersectionObserver(([entry]) => document.body.classList.toggle("nav-stuck", !entry.isIntersecting), { rootMargin: "-20px 0px 0px 0px" }).observe($("#masthead"));
  // On narrow screens the menu scrolls sideways; fade its edge until the end is reached.
  const nav = $("#siteNav");
  const edge = () => nav.classList.toggle("at-end", nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4);
  nav.addEventListener("scroll", edge, { passive: true }); window.addEventListener("resize", edge); edge();
}

/* ---------- Shared pieces ---------- */
const edHref = e => e.href || `/edition/${e.slug}`;
const wireHref = i => `/read?u=${encodeURIComponent(i.url)}`;
function edCard(e, { dek = false } = {}) {
  return `<a class="ed-card glass" href="${edHref(e)}"><div class="thumb">${img(e.image)}</div><span class="body"><span class="kicker">${esc(e.topic)}</span><h3>${esc(e.title)}</h3>${dek ? `<p>${esc(e.dek)}</p>` : ""}<span class="meta">${esc(e.author || AUTHOR.name)} · ${shortDate(e.date)} · ${e.readMinutes} min</span></span></a>`;
}
function marketRow(q) {
  const ch = quoteChange(q);
  return `<div class="mrow"><span><b>${esc(q.label)}</b><small>${esc(q.symbol)}${q.currency ? ` · ${esc(q.currency)}` : ""}</small></span><span class="num">${quoteValue(q)}</span><span class="num ${ch.cls}">${ch.text}</span><span class="spark-cell">${sparkline(q.spark, ch.cls, 64, 22)}</span></div>`;
}
function wireLink(i) {
  return `<a class="wire-link" href="${wireHref(i)}"><b>${esc(i.title)}</b><span class="when">${clock(i.publishedAt)} · ${esc(i.source)}</span></a>`;
}
const wireItems = () => state.wire?.items || [];
function wireEmpty() {
  return state.wireError ? `<div class="empty">The live wire could not be reached just now. It retries automatically.</div>` : `<div class="skeleton" style="height:220px"></div>`;
}

/* ---------- Home ---------- */
function viewHome() {
  const [lead, ...rest] = stories();
  $("#view").innerHTML = `
  <div class="wrap home">
    <section id="shortsRail" class="shorts-rail" aria-label="Shorts" hidden></section>
    <section class="dock glass" aria-label="Market pulse"><div class="dock-head"><b>Market pulse</b><span class="muted" id="dockStatus" style="font-size:12px">Loading quotes…</span><a class="link-gold" href="/markets" style="font-size:13px">All markets →</a></div><div class="dock-grid" id="dock"></div></section>

    <section id="liveBanner" class="band-tight" aria-label="Live coverage" hidden></section>

    <div class="lead-grid">
      <section class="side-stack" aria-label="More from Raisina Wire"><div class="kicker">Raisina Wire · Newest</div>
        ${rest.slice(0, 3).map(e => `<a class="side-item" href="${edHref(e)}"><div class="thumb">${img(e.image)}</div><span class="kicker">${esc(e.topic)}</span><h3>${esc(e.title)}</h3><span class="meta">${esc(e.author)} · ${shortDate(e.date)}</span></a>`).join("")}
      </section>
      <article class="hero">${img(lead.image, "")}
        <div class="hero-card glass">
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><span class="tag tag-dark">Raisina Wire · Latest</span><span class="kicker">${esc(lead.topic)}</span></div>
          <h1><a href="${edHref(lead)}">${esc(lead.title)}</a></h1><p>${esc(lead.dek)}</p>
          <div class="hero-foot"><span class="byline"><img src="${writer(lead.writer).photo}" alt="" class="${writer(lead.writer).isDesk ? "desk" : ""}"><span><b>${esc(lead.author)}</b> <span class="muted">· ${editionDate(lead.date)} · ${lead.readMinutes} min read</span></span></span><a class="btn btn-red hero-read" href="${edHref(lead)}">Read now <span aria-hidden="true">→</span></a></div>
        </div>
      </article>
      <aside class="live-rail glass" aria-label="Live wire"><div class="live-title"><b><span class="dot-live"></span>Live wire</b><span class="muted" style="font-size:12px" id="railUpdated"></span></div><div id="rail"></div><a class="link-gold" href="/live" style="display:block;margin-top:16px;font-size:13px">All live updates →</a></aside>
    </div>

    <section class="briefing glass band" aria-labelledby="briefingTitle"><div class="briefing-head"><span class="kicker">The Briefing</span><h2 id="briefingTitle">What you need to know</h2><span class="meta">${new Date().toLocaleDateString(LOCALE, { ...IST, weekday: "long", day: "numeric", month: "long" })} · From the live wire</span></div><ol class="briefing-list" id="briefingList"></ol></section>

    <section class="band"><div class="section-head"><h2>From the Raisina Wire desk</h2><a class="link-gold" href="/editions">All stories →</a></div>
      <div class="card-grid">${rest.slice(3, 7).map(e => edCard(e)).join("")}</div></section>

    <section id="videoBand" class="band" aria-labelledby="videoBandTitle" hidden></section>

    ${joinBand()}

    <section class="band editor" aria-labelledby="editorTitle">
      <a class="editor-portrait" href="/author/ilmaz-syed"><img src="${AUTHOR.portrait}" alt="Portrait of ${esc(AUTHOR.name)}" loading="lazy"></a>
      <div class="editor-body"><span class="kicker" id="editorTitle">From the Editor</span>
        <blockquote id="editorQuote">“${esc(lead.dek)}”</blockquote><span class="meta" id="editorQuoteSource">From “${esc(lead.title)}”</span>
        <div class="signature"><span>${esc(AUTHOR.name)}</span><small>${esc(AUTHOR.role)}, Raisina Wire</small></div>
        <div class="editor-actions"><a class="btn btn-dark" href="${edHref(lead)}">Read the latest</a><a class="btn btn-light" href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer">Subscribe on LinkedIn ↗</a></div></div>
      <div class="editor-picks"><span class="kicker">Start here</span><ol>${EDITOR_PICKS.map(slug => stories().find(x => x.slug === slug)).filter(Boolean).map(x => `<li><a href="${edHref(x)}"><span class="kicker">${esc(x.topic)}</span><b>${esc(x.title)}</b></a></li>`).join("")}</ol></div>
    </section>

    <section class="band split">
      <div><div class="section-head"><h2>India &amp; the World</h2></div>
        ${rest[7] ? `<a class="feature glass" href="${edHref(rest[7])}"><div class="thumb">${img(rest[7].image)}</div><span class="body"><span class="kicker">${esc(rest[7].topic)}</span><h3>${esc(rest[7].title)}</h3><p>${esc(rest[7].dek)}</p></span></a>` : ""}
        <div class="pair">${rest.slice(8, 10).map(e => `<a href="${edHref(e)}"><span class="kicker">${esc(e.topic)}</span><h3>${esc(e.title)}</h3><span class="meta">${esc(e.author)} · ${shortDate(e.date)}</span></a>`).join("")}</div>
      </div>
      <div class="markets-panel glass"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h2>Markets</h2><a class="link-gold" href="/markets" style="font-size:13px">Full board →</a></div>
        <div class="pill-tabs" role="tablist" aria-label="Market groups" id="homeTabs" style="margin-top:12px"></div><div id="homeMarkets" style="margin-top:8px"></div>
        <p class="muted" style="margin:12px 0 0;font-size:12px">Delayed quotes from public feeds · Not investment advice</p></div>
    </section>

    <section class="band"><div class="section-head"><h2>Live coverage</h2><a class="link-gold" href="/live">Live wire →</a></div><div class="topic-cols" id="topicCols"></div></section>

  </div>`;
  renderDock(); renderRail(); renderHomeMarkets(); renderTopicCols(); renderCommunity(); renderLiveBanner(); renderBriefing(); renderHomeMedia();
  loadBodies().then(bodies => { const q = pullQuote(bodies[lead.slug]?.blocks || []); if (q && $("#editorQuote")) $("#editorQuote").textContent = `“${q}”`; }).catch(() => {});
}
const EDITOR_PICKS = ["iran-500m-masterstroke", "himalayan-tunnel", "cia-invisible-front"];
function renderBriefing() {
  const host = $("#briefingList"); if (!host) return;
  const used = new Set(), picks = [];
  for (const cat of ["India", "Security", "Diplomacy", "Markets", "World", "Energy"]) {
    const item = wireItems().find(i => i.category === cat && !used.has(i.url));
    if (item) { used.add(item.url); picks.push(item); }
    if (picks.length === 5) break;
  }
  host.innerHTML = picks.length ? picks.map(i => `<li><a href="${wireHref(i)}"><span class="kicker">${esc(i.category)}</span><b>${esc(i.title)}</b><span class="meta">${clock(i.publishedAt)} · ${esc(i.source)}</span></a></li>`).join("")
    : Array.from({ length: 5 }, () => `<li><div class="skeleton" style="height:96px"></div></li>`).join("");
}

function renderDock() {
  const host = $("#dock"); if (!host) return;
  if (!state.markets) { host.innerHTML = Array.from({ length: 8 }, () => `<div class="skeleton" style="height:78px"></div>`).join(""); $("#dockStatus").textContent = state.marketsError ? "Quotes unavailable · retrying" : "Loading quotes…"; return; }
  host.innerHTML = state.markets.overview.map(q => { const ch = quoteChange(q); return `<a class="tile" href="/markets"><div class="tile-label">${esc(q.label)}</div><div class="tile-row"><span class="tile-value">${quoteValue(q)}</span><span class="tile-change ${ch.cls}">${ch.text}</span></div>${sparkline(q.spark, ch.cls)}</a>`; }).join("");
  $("#dockStatus").textContent = `${state.markets.offline ? "Offline copy" : "Delayed"} · updated ${clock(state.markets.updatedAt)} IST`;
}
function renderRail() {
  const host = $("#rail"); if (!host) return;
  const items = wireItems().slice(0, 7);
  host.innerHTML = items.length ? `<div class="timeline">${items.map(i => `<a href="${wireHref(i)}"><span class="when">${clock(i.publishedAt)} · ${esc(i.source)}</span><b>${esc(i.title)}</b></a>`).join("")}</div>` : wireEmpty();
  if ($("#railUpdated")) $("#railUpdated").textContent = state.wire ? `Updated ${clock(state.wire.updatedAt)}` : "";
}
function renderHomeMarkets() {
  const tabs = $("#homeTabs"), host = $("#homeMarkets"); if (!tabs) return;
  const groups = state.markets?.groups || [];
  tabs.innerHTML = (groups.length ? groups : [{ id: "india", name: "India" }]).map(g => `<button type="button" role="tab" data-action="home-group" data-group="${g.id}" aria-selected="${g.id === state.homeGroup}">${esc(g.name)}</button>`).join("");
  const g = groups.find(x => x.id === state.homeGroup);
  host.innerHTML = g ? g.items.map(marketRow).join("") : (state.marketsError ? `<div class="empty">Quotes are unavailable right now.</div>` : `<div class="skeleton" style="height:260px"></div>`);
}
function renderTopicCols() {
  const host = $("#topicCols"); if (!host) return;
  if (!wireItems().length) { host.innerHTML = `<div style="grid-column:1/-1">${wireEmpty()}</div>`; return; }
  host.innerHTML = ["India", "Security", "Diplomacy", "Markets"].map(cat => {
    const list = wireItems().filter(i => i.category === cat).slice(0, 4);
    const top = list.find(i => i.image);
    return `<div class="topic-col"><h3>${cat}<a class="link-gold" href="/live/${cat}" style="font-size:12px;letter-spacing:0;text-transform:none">More →</a></h3>${top ? `<a class="thumb" href="${wireHref(top)}" style="display:block">${img(top.image)}</a>` : ""}${list.length ? list.map(wireLink).join("") : `<p class="muted" style="font-size:14px">No ${cat.toLowerCase()} items in the last few hours.</p>`}</div>`;
  }).join("");
}
/* ---------- Community: the join band on the front page ---------- */
const PERK_ICONS = {
  talk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>`,
  brief: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  voice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`
};
const PERKS = [
  ["talk", "Moderated discussions", "Start threads and reply on any story. Sourced, civil, moderated by the desk."],
  ["brief", "Briefings and members’ events", "Invitations to expert briefings, debates and members-only events, added to your calendar in one tap."],
  ["voice", "Your name on your ideas", "A member profile for your contributions, and a direct line to the Raisina Wire desk."]
];
function joinBand() {
  return `<section class="band join" id="community" aria-labelledby="joinTitle"><div class="join-panel">
    <div class="join-copy">
      <span class="join-eyebrow"><span class="pulse"></span>The Raisina Wire community</span>
      <h2 id="joinTitle">Don’t just read the news. <em>Argue it out.</em></h2>
      <p class="join-lede">Join readers who follow India’s strategic questions closely: security, diplomacy, the neighbourhood and markets. Membership is free and takes thirty seconds.</p>
      <ul class="perks">${PERKS.map(([icon, title, text]) => `<li><span class="perk-icon">${PERK_ICONS[icon]}</span><span><b>${title}</b><span>${text}</span></span></li>`).join("")}</ul>
      <div class="join-actions" id="joinActions"></div>
      <p class="join-stats" id="joinStats" hidden></p>
    </div>
    <div class="join-side">
      <div class="join-card"><div class="kicker">Latest discussions</div><div id="discussions"></div><a class="join-link" href="/community">All discussions →</a></div>
      ${studioMiniAd("community_band")}
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
    : `<div class="talk"><span class="avatar avatar-sm" aria-hidden="true">RW</span><span><b>Be the first to start a conversation</b><span class="meta">Members can open a discussion on any story</span></span></div>`;
}

/* ---------- Editions ---------- */
function viewEditions() {
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Raisina Wire</div><h1>Every story</h1><p>Editions and analysis from ${WRITERS.map(w => `<a href="/author/${w.key}">${esc(w.name)}</a>`).join(" and ")}, newest first. Every story reads in full here; editions link to the original on LinkedIn.</p></div><a class="btn btn-light" href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer">Subscribe on LinkedIn ↗</a></div>
  <div class="archive-grid">${stories().map(e => edCard(e, { dek: true })).join("")}</div></div>`;
}

let bodiesPromise;
const loadBodies = () => (bodiesPromise ||= import("./edition-bodies.json").then(m => m.default));
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
    ${"speechSynthesis" in window || "Audio" in window ? `<button class="btn btn-light btn-sm listen-btn" type="button" data-action="listen" aria-label="Listen to this story" aria-pressed="false">${ICON.listen}<span class="lbl">Listen</span></button>` : ""}
    <button class="btn btn-light btn-sm" type="button" data-action="save" aria-label="Save" data-item='${esc(JSON.stringify(saveItem))}'>${ICON.save}<span class="lbl">Save</span></button><button class="btn btn-light btn-sm" type="button" data-action="share" aria-label="Share" data-title="${esc(saveItem.title)}">${ICON.share}<span class="lbl">Share</span></button>
    ${original ? `<a class="btn btn-dark btn-sm original-btn" href="${esc(original)}" target="_blank" rel="noreferrer"><span class="lbl">${esc(originalLabel)}</span><span class="lbl-short">Original</span> ↗</a>` : ""}</div>`;
}
function viewNotFound() {
  $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><span class="kicker">404</span><h1>We couldn’t find that page</h1><p class="muted">It may have moved. Try the latest stories or search.</p><div class="blocked-actions"><a class="btn btn-dark" href="/">Go to today’s front page</a><button class="btn btn-light" type="button" data-action="search">Search</button></div></div></div>`;
}

/* ---------- Stories (editions and articles) ---------- */
const storyNotFound = () => { $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><h1>Story not found</h1><p class="muted">It may have been unpublished or moved.</p><div class="blocked-actions"><a class="btn btn-dark" href="/editions">See all stories</a></div></div></div>`; };
// An edition from the copy bundled with the app, used when the reader is offline.
function bundledStory(e, body) {
  return { kind: "edition", slug: e.slug, href: `/edition/${e.slug}`, title: e.title, dek: e.dek, topic: e.topic, category: e.topic, image: e.image, imageUrl: e.image, heroUrl: "", heroCaption: "",
    sourceUrl: e.url, publishedAt: e.date, writer: "ilmaz-syed", author: AUTHOR.name, status: "published", blocks: body?.blocks || [] };
}
async function viewStory(r) {
  const slug = r.arg;
  $("#view").innerHTML = `<div class="wrap"><div class="reader-layout"><article class="reader-article"><div class="skeleton" style="height:60px"></div><div class="skeleton" style="height:420px;margin-top:20px"></div></article></div></div>`;
  let a = null, reachable = true;
  const original = r.params.has("orig"); // ?orig: the English original of a translated story
  try { const res = await fetch(`/api/articles/${encodeURIComponent(slug)}${lang !== "en" && !original ? `?lang=${lang}` : ""}`); if (res.ok) a = (await res.json()).article; else if (res.status !== 404) reachable = false; }
  catch { reachable = false; }
  if (parseRoute().arg !== slug) return;
  if (!a && !reachable) {
    const e = editions.find(x => x.slug === slug);
    if (e) a = bundledStory(e, (await loadBodies().catch(() => ({})))[slug]);
  }
  if (!a) return storyNotFound();
  if (a.href && withLang(a.href) !== location.pathname) history.replaceState({ rw: true }, "", withLang(a.href) + location.search);
  const w = writer(a.writer), blocks = a.blocks || articleBlocks(a.body);
  const words = blocks.reduce((n, b) => n + b.x.split(/\s+/).length, 0);
  const list = stories(), i = list.findIndex(x => x.slug === a.slug), newer = list[i - 1], older = i >= 0 ? list[i + 1] : null;
  const linkedin = /linkedin\.com/.test(a.sourceUrl || ""), edition = a.kind === "edition";
  const hero = a.heroUrl || a.imageUrl || genericImage(a.category);
  document.title = `${a.title} · Raisina Wire`;
  $("#view").innerHTML = `<div class="wrap">${readerBar({ badge: a.status === "published" ? (edition ? "Raisina Wire · Edition" : `Raisina Wire · ${a.category}`) : `Preview · ${a.status}`, original: a.sourceUrl, originalLabel: linkedin ? "Original on LinkedIn" : "Original", saveItem: { href: a.href, title: a.title, source: "Raisina Wire" } })}
  <div class="reader-layout"><article class="reader-article" data-lang="${a.lang || "en"}"${lang !== "en" && (a.lang || "en") === "en" ? ' lang="en"' : ""}>
    <div class="kicker">${esc(a.topic || a.category)}</div><h1>${esc(a.title)}</h1>${a.dek ? `<p class="dek">${esc(a.dek)}</p>` : ""}${translationNote(a, original)}
    <div class="reader-byline"><a href="/author/${w.key}" class="byline-link"><img src="${w.photo}" alt="" class="${w.isDesk ? "desk" : ""}"><span><b>${esc(w.name)}</b><span class="muted" style="display:block;font-size:13px">${esc(w.role)}</span></span></a><span class="grow"></span><span class="meta">${a.publishedAt ? editionDate(a.publishedAt) : "Not yet published"} · ${Math.max(1, Math.round(words / 220))} min read</span></div>
    <figure class="reader-hero">${img(hero, a.heroCaption || "")}${a.heroCaption ? `<figcaption>${esc(a.heroCaption)}</figcaption>` : ""}</figure>
    <div class="prose dropcap">${blocks.length ? proseHTML(blocks, { pull: pullQuote(blocks) }) : `<p>This story could not be loaded.${a.sourceUrl ? ` <a href="${esc(a.sourceUrl)}" target="_blank" rel="noreferrer">Read the original ↗</a>` : ""}</p>`}</div>
    ${(a.tags || []).length ? `<div class="story-tags"><span class="meta">Topics</span>${a.tags.map((t, i) => `<a class="tag-chip" href="/tag/${tagSlug(t)}">${esc(a.tagLabels?.[i] || t)}</a>`).join("")}</div>` : ""}
    ${shareBlock(a.title, a.href)}
    <div class="author-box"><img src="${w.photo}" alt="" class="${w.isDesk ? "desk" : ""}"><div><span class="kicker">${w.isDesk ? "From the desk" : "About the author"}</span><b><a href="/author/${w.key}">${esc(w.name)}</a></b><p>${esc(w.bio)}</p><a class="link-gold" href="/author/${w.key}" style="font-size:13px">More from ${esc(w.name)} →</a></div></div>
    <div class="reader-end glass discuss-end"><div><span class="kicker">Community</span><b style="display:block;font-size:17px;margin-top:4px">What do you make of this?</b><div class="muted" style="font-size:14px;margin-top:4px">Members discuss every story in moderated threads. Free to join.</div></div><button class="btn btn-dark" type="button" data-action="discuss" data-title="${esc(a.title)}">Discuss this story</button></div>
    ${linkedin ? `<div class="reader-end glass"><div><b style="font-size:16px">Follow Raisina Wire on LinkedIn</b><div class="muted" style="font-size:14px;margin-top:4px">${edition ? "First published in the Raisina Wire newsletter." : "New editions every week."}</div></div><a class="btn btn-light" href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer">Subscribe ↗</a></div>` : ""}
    ${relatedBlock(a, list)}
    <div class="prev-next">${newer ? `<a class="glass" href="${edHref(newer)}"><span class="meta">Newer</span><b>${esc(newer.title)}</b></a>` : "<span></span>"}${older ? `<a class="glass" href="${edHref(older)}"><span class="meta">Older</span><b>${esc(older.title)}</b></a>` : ""}</div>
  </article>
  <aside class="reader-aside">${communityAside()}<div class="aside-card glass"><div class="kicker">More from Raisina Wire</div>
    ${list.filter(x => x.slug !== a.slug).slice(0, 5).map(x => `<a class="aside-link" href="${edHref(x)}"><span class="thumb">${img(x.image)}</span><span><b>${esc(x.title)}</b><span class="meta" style="display:block;margin-top:5px;font-size:10px">${shortDate(x.date)}</span></span></a>`).join("")}
  </div></aside></div></div>`;
  countView(a);
}
// In Hindi or Bengali: says whether the story is translated, with a link to the other version.
function translationNote(a, original) {
  if (lang === "en") return "";
  const here = withLang(a.href || location.pathname);
  if (original) return `<p class="tr-note" lang="${LOCALE}">${tr("You are reading the English original.")} <a href="${here}">${tr(lang === "hi" ? "Read this story in Hindi" : "Read this story in Bengali")}</a></p>`;
  if (a.lang === lang) return `<p class="tr-note" lang="${LOCALE}">${tr(a.machine ? "Translated automatically from English" : "Translated from English")} · <a href="${here}?orig=1">${tr("Read the English original")}</a></p>`;
  return `<p class="tr-note" lang="${LOCALE}">${tr(lang === "hi" ? "This story is not available in Hindi yet. Here it is in English." : "This story is not available in Bengali yet. Here it is in English.")}</p>`;
}
// One view per story per browser session; nothing is stored about the reader.
function countView(a) {
  if (a.status !== "published" || a.scheduled) return;
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
  return `<section class="related"><div class="kicker">Related stories</div><div class="related-grid">${scored.map(x => `<a class="related-card glass" href="${edHref(x)}"><span class="thumb">${img(x.image)}</span><span class="body"><span class="kicker">${esc(x.topic)}</span><b>${esc(x.title)}</b><span class="meta">${esc(x.author)} · ${shortDate(x.date)}</span></span></a>`).join("")}</div></section>`;
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
function shareLinks(text, url) {
  const t = encodeURIComponent(text), u = encodeURIComponent(url), tu = encodeURIComponent(`${text} ${url}`);
  return [["whatsapp", "WhatsApp", `https://wa.me/?text=${tu}`], ["x", "X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`], ["facebook", "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`], ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ["telegram", "Telegram", `https://t.me/share/url?url=${u}&text=${t}`], ["mail", "Email", `mailto:?subject=${t}&body=${tu}`]];
}
function shareBlock(title, href, url = location.origin + withLang(href)) {
  return `<div class="share-row"><span class="meta">Share</span><button class="share-btn share-native" type="button" data-action="share-native" data-title="${esc(title)}" data-url="${esc(url)}" aria-label="Share">${SHARE_ICONS.share}</button>${shareLinks(title, url).map(([k, label, link]) => `<a class="share-btn share-${k}" href="${link}" target="_blank" rel="noopener" aria-label="Share on ${label}">${SHARE_ICONS[k]}</a>`).join("")}<button class="share-btn" type="button" data-action="copy-link" data-url="${esc(url)}" aria-label="Copy link">${SHARE_ICONS.link}</button></div>`;
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
    const title = $(".reader-article h1")?.textContent || "Raisina Wire";
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
   Raisina Wire stories are read by a natural Indian English woman's voice generated on the
   server (paragraph by paragraph, with lock-screen controls). Elsewhere, or if that voice is
   not set up, the device's own voice is used, choosing a female Indian English voice when the
   device has one, read sentence by sentence with natural pauses. */
const speech = { queue: [], i: 0, active: false, mode: null, audio: null, parts: null, slug: null, timer: null, lang: "en" };
let ttsStatus = null;
const ttsAvailable = async () => (ttsStatus ??= fetch("/api/tts/status").then(r => r.ok ? r.json() : { enabled: false }).catch(() => ({ enabled: false }))).then(x => x.enabled);
// Device voices: female Indian English first (names used by Edge, Windows, Android, iOS and macOS).
const FEMALE_IN = /neerja|heera|veena|isha|kajal|ananya|aashi|swara|en-in-x-(ena|cxx|ahp)|female/i, MALE = /rishi|ravi|prabhat|male\b|kunal|aarav/i;
function voice() {
  const vs = speechSynthesis.getVoices();
  if (speech.lang !== "en") { // Hindi or Bengali: the device's voice for that language, female first
    const own = vs.filter(v => new RegExp(`^${speech.lang}[-_]`, "i").test(v.lang));
    return own.sort((x, y) => (FEMALE_IN.test(y.name) || /lekha|kalpana|swara|tanishaa|female/i.test(y.name) ? 1 : 0) - (FEMALE_IN.test(x.name) || /lekha|kalpana|swara|tanishaa|female/i.test(x.name) ? 1 : 0))[0] || null;
  }
  const en = vs.filter(v => /^en[-_]/i.test(v.lang));
  const ind = en.filter(v => /en[-_]IN/i.test(v.lang));
  const score = v => (/en[-_]IN/i.test(v.lang) ? 40 : /en[-_]GB/i.test(v.lang) ? 10 : 0) + (FEMALE_IN.test(v.name) ? 30 : 0) - (MALE.test(v.name) ? 50 : 0) + (/natural|online|enhanced|premium|neural/i.test(v.name) ? 20 : 0);
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
  const r = await fetch(`/api/tts/${encodeURIComponent(slug)}${speech.lang !== "en" ? `?lang=${speech.lang}` : ""}`);
  if (!r.ok) throw new Error("tts");
  speech.parts = (await r.json()).parts; speech.slug = slug; speech.mode = "natural";
  speech.queue = readingElements(art);
  speech.audio ||= Object.assign(new Audio(), { preload: "auto" });
  speech.audio.onended = () => { speech.i++; playPart(); };
  speech.audio.onerror = () => { speech.i++; playPart(); };
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: $("h1", art)?.innerText || "Raisina Wire", artist: "Raisina Wire", album: "Listen", artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] });
    navigator.mediaSession.setActionHandler("play", () => { speech.audio.play(); setListenButton("playing"); });
    navigator.mediaSession.setActionHandler("pause", () => { speech.audio.pause(); setListenButton("paused"); });
    navigator.mediaSession.setActionHandler("nexttrack", () => { speech.i++; playPart(); });
    navigator.mediaSession.setActionHandler("previoustrack", () => { speech.i = Math.max(0, speech.i - 1); playPart(); });
  }
  speech.i = 0; await playPart();
}
const partUrl = n => `/api/tts/${encodeURIComponent(speech.slug)}/${n}.mp3?v=${speech.parts[n].v}${speech.lang !== "en" ? `&lang=${speech.lang}` : ""}`;
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
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = LANGUAGES[speech.lang]?.locale || "en-IN";
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
  speech.active = true; speech.i = 0; speech.lang = art.dataset.lang || "en"; // the language the story is shown in
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

/* ---------- Topics: tag pages and My Raisina ---------- */
function allTagsFromStories() {
  const m = new Map();
  for (const x of stories()) for (const t of x.tags || []) { const k = tagSlug(t); const c = m.get(k) || { name: t, slug: k, count: 0 }; c.count++; m.set(k, c); }
  return [...m.values()].sort((p, q) => q.count - p.count || p.name.localeCompare(q.name));
}
const CATEGORY_TOPICS = ["India", "Security", "Diplomacy", "Geopolitics", "Markets", "Energy", "Analysis"];
const followBtn = name => `<button class="btn btn-sm ${state.topics?.includes(name) ? "btn-dark" : "btn-light"} follow-btn" type="button" data-action="follow" data-topic="${esc(name)}" aria-pressed="${!!state.topics?.includes(name)}">${state.topics?.includes(name) ? "Following" : "+ Follow"}</button>`;
function viewTag(r) {
  const t = allTagsFromStories().find(x => x.slug === r.arg) || (CATEGORY_TOPICS.find(c => tagSlug(c) === r.arg) && { name: CATEGORY_TOPICS.find(c => tagSlug(c) === r.arg), slug: r.arg });
  if (!t) return viewNotFound();
  const list = stories().filter(x => (x.tags || []).some(y => tagSlug(y) === t.slug) || tagSlug(x.category || "") === t.slug);
  document.title = `${t.name} · Raisina Wire`;
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Topic</div><h1>${esc(t.name)}</h1><p>${list.length} Raisina Wire stor${list.length === 1 ? "y" : "ies"}, newest first. Follow the topic to see it on your own front page, My Raisina.</p></div>${followBtn(t.name)}</div>
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
    toast(on ? `Stopped following ${name}.` : `Following ${name}. It’s on My Raisina.`);
    const pg = parseRoute(); if (pg.page === "tag") viewTag(pg); else if (pg.page === "my") viewMy();
  } catch { toast("That didn’t save. Try again."); }
}
async function viewMy() {
  document.title = "My Raisina · Raisina Wire";
  if (!state.user) {
    $("#view").innerHTML = `<div class="wrap"><section class="join-panel my-invite"><div class="join-copy"><span class="join-eyebrow"><span class="pulse"></span>My Raisina</span><h2>Your own front page.</h2><p class="join-lede">Follow the topics you care about, from Pakistan to the Navy to markets, and keep your saved stories on every device. Free for members.</p><div class="join-actions"><button class="btn btn-red" type="button" data-action="join">Create a free account</button><button class="btn btn-ghost" type="button" data-action="signin">Sign in</button></div></div></section></div>`;
    return;
  }
  const followed = state.topics || [], fl = new Set(followed.map(x => x.toLowerCase()));
  const mine = stories().filter(x => fl.has(String(x.category).toLowerCase()) || (x.tags || []).some(t => fl.has(t.toLowerCase())));
  const wire = wireItems().filter(i => fl.has(String(i.category).toLowerCase())).slice(0, 8);
  const suggest = [...CATEGORY_TOPICS.map(name => ({ name })), ...allTagsFromStories().slice(0, 18)].filter((x, i, arr) => arr.findIndex(y => y.name.toLowerCase() === x.name.toLowerCase()) === i);
  const saved = await savedItems();
  if (parseRoute().page !== "my") return;
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">My Raisina</div><h1>${esc(state.user.displayName.split(" ")[0])}’s front page</h1><p>Stories on the topics you follow, newest first, and your saved stories. Synced to your account.</p></div><button class="btn btn-light" type="button" data-action="alerts">${ICON_BELL} Alerts</button></div>
    <section class="my-topics glass"><div class="kicker">Topics you follow</div><div class="chips">${suggest.map(x => `<button type="button" class="chip" data-action="follow" data-topic="${esc(x.name)}" aria-pressed="${fl.has(x.name.toLowerCase())}">${fl.has(x.name.toLowerCase()) ? "✓ " : "+ "}${esc(x.name)}</button>`).join("")}</div></section>
    ${followed.length ? `<section class="band"><div class="section-head"><h2>For you</h2></div><div class="archive-grid">${mine.slice(0, 12).map(e => edCard(e, { dek: true })).join("") || `<div class="empty">Nothing new on your topics yet.</div>`}</div></section>
      ${wire.length ? `<section class="band"><div class="section-head"><h2>On the wire for you</h2><a class="link-gold" href="/live">Live wire →</a></div><div class="live-list">${wire.map(i => `<a class="live-item glass" href="${wireHref(i)}" style="grid-template-columns:88px minmax(0,1fr)"><span class="when">${clock(i.publishedAt)}</span><span><b>${esc(i.title)}</b><span class="src"><span class="tag">${esc(i.category)}</span>${esc(i.source)}</span></span></a>`).join("")}</div></section>` : ""}`
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
const ALERT_TYPES = ["Every new Raisina Wire story", "Live coverage as it starts", "New briefings and events", "Morning brief at 9 am, evening wrap at 9 pm", "Major breaking news"];
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
    if (isIOS() && !isStandalone()) { showInstallSheet({ force: true }); toast("On iPhone, add Raisina Wire to your Home Screen, open it from there, and alerts will be offered."); }
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
  const panel = $("#alertsPanel"); if (!panel || panel.hidden) return;
  const device = state.pushOn ? ""
    : `<div class="ap-device"><span><b>Get these on your ${isIOS() || /Android/i.test(navigator.userAgent) ? "phone" : "device"}</b><small>${pushSupported() ? "One tap to allow notifications." : isIOS() && !isStandalone() ? "Add Raisina Wire to your Home Screen first." : "This browser can’t show notifications."}</small></span><button class="btn btn-red btn-sm" type="button" data-action="alerts-on">Turn on</button></div>`;
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
  try { const r = await fetch(`/api/pages/${key}?lang=${lang}`); if (r.ok) return (await r.json()).page; } catch { /* offline: English */ }
  return { ...fallback, lang: "en" };
}
function pageNote(p, legal) {
  if (lang === "en") return "";
  if (p.lang !== lang) return `<p class="tr-note">${tr(lang === "hi" ? "This page is not available in Hindi yet. Here it is in English." : "This page is not available in Bengali yet. Here it is in English.")}</p>`;
  return legal ? `<p class="tr-note">${tr("This is a translation for your convenience. If it differs from the English version, the English version prevails.")}</p>` : "";
}
async function viewAbout() {
  document.title = `${ABOUT.title} · Raisina Wire`;
  const p = await localPage("about", ABOUT);
  if (parseRoute().page !== "about") return;
  document.title = `${p.title} · Raisina Wire`;
  $("#view").innerHTML = docPage({ kicker: "About", title: `<span data-no-tr>${esc(p.title)}</span>`, html: pageNote(p) + `<div data-no-tr${p.lang === "en" ? ' lang="en"' : ""}>${p.html}</div>` });
}
async function viewLegal(r) {
  const doc = LEGAL[r.page];
  document.title = `${doc.title} · Raisina Wire`;
  const p = await localPage(r.page, doc);
  if (parseRoute().page !== r.page) return;
  document.title = `${p.title} · Raisina Wire`;
  const nav = LEGAL_ORDER.map(([k, t]) => `<a href="/${k}"${k === r.page ? ' aria-current="page"' : ""}>${t}</a>`).join("") + `<a href="/about">About Raisina Wire</a>`;
  $("#view").innerHTML = docPage({ kicker: "Raisina Wire", title: `<span data-no-tr>${esc(p.title)}</span>`, html: pageNote(p, true) + `<div data-no-tr${p.lang === "en" ? ' lang="en"' : ""}>${p.html}</div>`, nav, updated: LEGAL_UPDATED });
}

/* ---------- Writers ---------- */
function viewAuthor(r) {
  const w = WRITERS.find(x => x.key === r.arg);
  if (!w) return viewNotFound();
  const list = stories().filter(x => (x.writer || "ilmaz-syed") === w.key);
  document.title = `${w.name} · Raisina Wire`;
  $("#view").innerHTML = `<div class="wrap"><section class="author-hero glass">
    <img class="author-portrait${w.isDesk ? " desk" : ""}" src="${w.portrait}" alt="${w.isDesk ? "" : `Portrait of ${esc(w.name)}`}">
    <div><span class="kicker">${w.isDesk ? "Desk" : "Writer"}</span><h1>${esc(w.name)}</h1><p class="author-role">${esc(w.role)}</p><p>${esc(w.bio)}</p><span class="meta">${list.length} stor${list.length === 1 ? "y" : "ies"} on Raisina Wire</span></div></section>
    <div class="archive-grid">${list.map(e => edCard(e, { dek: true })).join("") || `<div class="empty">No published stories yet.</div>`}</div></div>`;
}

/* ---------- External reader ---------- */
async function viewExternal(r) {
  const url = r.params.get("u") || "";
  const known = wireIndex.get(url) || {};
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (!host) { navigate("/live", { replace: true }); return; }
  const source = known.source || host;
  const saveItem = { href: wireHref({ url }), title: known.title || url, source };
  $("#view").innerHTML = `<div class="wrap">${readerBar({ badge: `${source} · Reader view`, original: url, originalLabel: `Original on ${source}`, saveItem })}
    <div class="reader-layout"><article class="reader-article" id="extArticle">
      <div class="kicker">${esc(known.category || "Live wire")}</div><h1>${esc(known.title || "Loading article…")}</h1>
      <div class="prose"><div class="skeleton" style="height:360px"></div></div></article>
    <aside class="reader-aside" id="extAside"></aside></div></div>`;
  renderExtAside();
  let data;
  try { data = await fetch(`/api/read?url=${encodeURIComponent(url)}${lang !== "en" ? `&lang=${lang}` : ""}`).then(res => res.json()); }
  catch { data = { blocked: true, reason: "unreachable" }; }
  if (parseRoute().params.get("u") !== url) return; // navigated away meanwhile
  const title = data.title || known.title || "Article";
  document.title = `${title} · Raisina Wire`;
  const site = data.site || source;
  if (!data.ok) {
    $("#view").innerHTML = `<div class="wrap"><section class="blocked glass" role="region" aria-labelledby="blockedTitle">
      <div class="byline"><span class="tag tag-dark">${esc(site)}</span><span class="meta">${known.publishedAt ? `${clock(known.publishedAt)} IST · ` : ""}${esc(known.category || "")}</span></div>
      <h1 id="blockedTitle">${esc(title)}</h1>
      ${(known.summary || data.description) ? `<p style="margin:14px 0 0;font-size:16px;line-height:1.65;color:var(--ink-2)">${esc(known.summary || data.description)}</p>` : ""}
      <div class="notice">${ICON_LOCK}<span>${data.reason === "publisher-limits" ? `${esc(site)} asks that its stories are not excerpted, so here is the headline and summary.` : `An excerpt of this story isn’t available.`} Read the full story on ${esc(site)}.</span></div>
      <div class="blocked-actions"><a class="btn btn-dark" href="${esc(url)}" target="_blank" rel="noreferrer">Read original on ${esc(site)} ↗</a><button class="btn btn-light" type="button" data-action="save" data-item='${esc(JSON.stringify(saveItem))}'>Save for later</button><a class="btn btn-light" href="/" data-action="back">Back</a></div>
    </section></div>`;
    return;
  }
  $(".reader-bar .badge").textContent = `${site} · Excerpt`;
  $(".reader-bar .original-btn .lbl").textContent = `Original on ${site}`;
  $("#extArticle").innerHTML = `<div class="kicker">${esc(known.category || site)}</div><h1>${esc(title)}</h1>
    ${data.description ? `<p class="dek">${esc(data.description)}</p>` : ""}
    <div class="reader-byline"><div><b>${esc(data.byline || site)}</b><div class="muted" style="font-size:13px">${esc(site)}</div></div><span class="grow"></span><span class="meta">${data.publishedAt ? new Date(data.publishedAt).toLocaleString(LOCALE, { ...IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : known.publishedAt ? `${clock(known.publishedAt)} IST` : ""}</span></div>
    ${data.mt ? `<p class="tr-note" lang="${LOCALE}">${tr("Translated automatically from English")} · <a href="${esc(data.url || url)}" target="_blank" rel="noopener">${tr("Read the English original")}</a></p>` : ""}
    <div class="notice">${ICON_INFO}<span>An excerpt from ${esc(site)}, shown with credit for news reporting. The story and its copyright belong to ${esc(site)}. <a href="/copyright">How we use other publishers’ work</a></span></div>
    ${data.image ? `<figure class="reader-hero">${img(data.image)}<figcaption>Image: ${esc(site)}</figcaption></figure>` : ""}
    <div class="prose excerpt">${proseHTML(data.blocks || [])}<p class="excerpt-fade" aria-hidden="true"></p></div>
    <a class="continue-card" href="${esc(data.url || url)}" target="_blank" rel="noopener"><span><span class="kicker">Continue reading</span><b>The full story is on ${esc(site)}</b><small>${data.readMinutes ? `${data.readMinutes} min read · ` : ""}Opens the publisher’s site</small></span><span class="btn btn-red">Read on ${esc(site)} ↗</span></a>
    ${shareBlock(title, "", location.href)}`;
}
function renderExtAside() {
  const host = $("#extAside"); if (!host) return;
  host.innerHTML = `<div class="aside-card glass"><div class="kicker">Raisina Wire analysis</div>${stories().slice(0, 4).map(x => `<a class="aside-link" href="${edHref(x)}"><span class="thumb">${img(x.image)}</span><span><b>${esc(x.title)}</b></span></a>`).join("")}</div>
  <div class="aside-card glass"><div class="kicker" style="color:var(--muted)">Latest on the wire</div>${wireItems().slice(0, 5).map(wireLink).join("") || wireEmpty()}</div>`;
}

/* ---------- Live ---------- */
const CATS = ["All", "India", "Security", "Diplomacy", "Markets", "Energy", "World"];
function viewLive(r) {
  const cat = CATS.includes(r.arg) ? r.arg : "All";
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker" style="display:flex;align-items:center;gap:8px"><span class="dot-live"></span>Live wire</div><h1>${cat === "All" ? "Latest from the wire" : cat}</h1><p>Headlines from named publishers, newest first. Open any story in the reader, with a link to the original.</p></div><span class="muted" id="liveUpdated" style="font-size:13px"></span></div>
    <div class="chips" style="margin-top:20px">${CATS.map(c => `<a class="chip" href="/live${c === "All" ? "" : `/${c}`}" aria-pressed="${c === cat}">${c}</a>`).join("")}</div>
    <div class="live-list" id="liveList" data-cat="${cat}"></div><div class="sources" id="liveSources"></div></div>`;
  renderLiveList();
}
function renderLiveList() {
  const host = $("#liveList"); if (!host) return;
  const cat = host.dataset.cat;
  const items = wireItems().filter(i => cat === "All" || i.category === cat).slice(0, 60);
  host.innerHTML = items.length ? items.map(i => `<a class="live-item glass" href="${wireHref(i)}"><span class="when">${clock(i.publishedAt)}<br><span style="font-size:11px">${ago(i.publishedAt)}</span></span><span><b>${esc(i.title)}</b>${i.summary ? `<p>${esc(i.summary)}</p>` : ""}<span class="src"><span class="tag">${esc(i.category)}</span>${esc(i.source)} · Opens in reader</span></span>${i.image ? `<span class="thumb">${img(i.image)}</span>` : "<span></span>"}</a>`).join("") : (state.wire ? `<div class="empty">No ${cat === "All" ? "" : cat.toLowerCase() + " "}stories on the wire in the last few hours.</div>` : wireEmpty());
  if (state.wire) {
    $("#liveUpdated").textContent = `Updated ${clock(state.wire.updatedAt)} IST · refreshes every 2 minutes`;
    const ok = state.wire.sources.filter(s => s.ok).map(s => s.name), down = state.wire.sources.filter(s => !s.ok).map(s => s.name);
    $("#liveSources").textContent = `Sources: ${[...new Set(ok)].join(", ") || "none reachable"}.${down.length ? ` Temporarily unavailable: ${[...new Set(down)].join(", ")}.` : ""}`;
  }
}

/* ---------- Markets ---------- */
function viewMarkets() {
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Markets</div><h1>Market board</h1><p>India and global indices, Indian stocks including defence, currencies, commodities, bond yields and crypto. Quotes are delayed or last available and refresh every minute. Not investment advice.</p></div><span class="muted" id="boardUpdated" style="font-size:13px"></span></div>
  <div class="mgrid" id="board"></div></div>`;
  renderBoard();
}
function renderBoard() {
  const host = $("#board"); if (!host) return;
  if (!state.markets) { host.innerHTML = state.marketsError ? `<div class="empty">Quotes are unavailable right now. Retrying automatically.</div>` : Array.from({ length: 4 }, () => `<div class="skeleton" style="height:300px"></div>`).join(""); return; }
  host.innerHTML = state.markets.groups.map(g => `<section class="mgroup glass"><h2>${esc(g.name)}</h2>${g.items.map(marketRow).join("")}</section>`).join("");
  $("#boardUpdated").textContent = `${esc(state.markets.source)} · updated ${clock(state.markets.updatedAt)} IST`;
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
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Saved</div><h1>Saved for later</h1><p>${state.user ? "Your saved stories, on every device where you’re signed in." : "Stories you save are kept on this device. <a href=\"#\" data-action=\"join\">Join free</a> to have them on all your devices."} Raisina Wire editions are always available offline in the app.</p></div></div>
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
function viewSearch(r) {
  const q = (r.params.get("q") || "").trim(), ql = q.toLowerCase();
  const eds = stories().filter(e => `${e.title} ${e.dek} ${e.topic}`.toLowerCase().includes(ql));
  const wire = wireItems().filter(i => `${i.title} ${i.summary} ${i.source}`.toLowerCase().includes(ql)).slice(0, 30);
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Search</div><h1>“${esc(q)}”</h1><p>${eds.length} Raisina Wire edition${eds.length === 1 ? "" : "s"} · ${wire.length} live stor${wire.length === 1 ? "y" : "ies"}</p></div></div>
  ${eds.length ? `<div class="archive-grid">${eds.map(e => edCard(e, { dek: true })).join("")}</div>` : ""}
  <div class="live-list">${wire.map(i => `<a class="live-item glass" href="${wireHref(i)}" style="grid-template-columns:88px minmax(0,1fr)"><span class="when">${clock(i.publishedAt)}</span><span><b>${esc(i.title)}</b><span class="src">${esc(i.source)}</span></span></a>`).join("")}</div>
  ${!eds.length && !wire.length ? `<div class="empty" style="margin-top:22px">Nothing matched. Try a country, a topic or a name.</div>` : ""}</div>`;
}

/* ---------- Actions ---------- */
async function onAction(e) {
  const el = e.target.closest("[data-action]"); if (!el) return;
  const a = el.dataset.action;
  if (a === "back") { e.preventDefault(); history.state?.rw ? history.back() : navigate("/"); }
  if (a === "text-smaller") setTextScale(-0.1);
  if (a === "text-larger") setTextScale(0.1);
  if (a === "save") { try { saveForLater(JSON.parse(el.dataset.item)); } catch { /* malformed */ } }
  if (a === "share-native") {
    e.preventDefault();
    const data = { title: el.dataset.title, text: el.dataset.title, url: el.dataset.url };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.title} ${data.url}`); toast("Link copied."); } } catch { /* cancelled */ }
  }
  if (a === "share") {
    const data = { title: el.dataset.title, url: location.href };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); toast("Link copied."); } } catch { /* cancelled */ }
  }
  if (a === "ticker-toggle") { const paused = $(".ticker").classList.toggle("paused"); el.setAttribute("aria-pressed", String(paused)); el.setAttribute("aria-label", paused ? "Play headlines" : "Pause headlines"); }
  if (a === "home-group") { state.homeGroup = el.dataset.group; renderHomeMarkets(); }
  if (a === "search") openSearch();
  if (a === "ics") downloadIcs(el.dataset.event);
  if (a === "install") { e.preventDefault(); installPWA(); }
  if (a === "install-dismiss") { store.set("rw-install-dismissed", Date.now()); $("#installSheet").hidden = true; }
  if (a === "update-later") $("#updateBar").hidden = true;
  if (a === "lang-later") { $("#langSuggest").hidden = true; setLanguagePreference("en"); }
  if (a === "apply-update") { waitingWorker?.postMessage({ type: "SKIP_WAITING" }); $("#updateBar").hidden = true; }
  if (a === "signin") openAuth("login");
  if (a === "join") openAuth("register");
  if (a === "signout") { toggleAccountMenu(false); signOut(); }
  if (a === "listen") toggleListening();
  if (a === "short") openShorts(Number(el.dataset.index) || 0);
  if (a === "play-video") playInline(el.dataset.id);
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

/* ---------- Ticker, clocks, live coverage ---------- */
const CLOCKS = [["New Delhi", "Asia/Kolkata"], ["Washington", "America/New_York"], ["London", "Europe/London"], ["Beijing", "Asia/Shanghai"], ["Moscow", "Europe/Moscow"]];
function renderClocks() {
  const host = $("#clocks"); if (!host) return;
  host.innerHTML = CLOCKS.map(([city, tz]) => `<span><b>${city}</b> ${new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}</span>`).join("");
}
function renderTicker() {
  const host = $("#tickerMove"); if (!host) return;
  const live = state.coverage.slice(0, 2).map(c => `<a class="ticker-item is-live" href="/coverage/${encodeURIComponent(c.slug)}"><b>Live</b>${esc(c.title)}</a>`);
  const wire = wireItems().slice(0, 12).map(i => `<a class="ticker-item" href="${wireHref(i)}"><time>${clock(i.publishedAt)}</time>${esc(i.title)}<span class="src">${esc(i.source)}</span></a>`);
  const items = [...live, ...wire];
  if (!items.length) { host.innerHTML = `<span class="ticker-item muted">${state.wireError ? "Live wire unavailable · retrying" : "Connecting to the live wire…"}</span>`; host.classList.remove("moving"); return; }
  // Two copies make the loop seamless; the second is hidden from assistive tech.
  host.innerHTML = `<div class="ticker-set">${items.join("")}</div><div class="ticker-set" aria-hidden="true">${items.join("").replaceAll("<a ", '<a tabindex="-1" ')}</div>`;
  host.style.setProperty("--ticker-duration", `${Math.max(40, items.length * 7)}s`);
  host.classList.add("moving");
}
async function loadCoverage() {
  try {
    const d = await fetch(`/api/live${lang !== "en" ? `?lang=${lang}` : ""}`).then(r => r.ok ? r.json() : { items: [] });
    state.coverage = d.items || [];
    state.coverageLead = state.coverage[0] ? await fetch(`/api/live/${encodeURIComponent(state.coverage[0].slug)}${lang !== "en" ? `?lang=${lang}` : ""}`).then(r => r.ok ? r.json() : null) : null;
    if (state.coverageLead?.item?.hasResults) state.coverageLead.results = await fetch(`/api/live/${encodeURIComponent(state.coverageLead.item.slug)}/results`).then(r => r.ok ? r.json() : null).catch(() => null);
  } catch { state.coverage = []; state.coverageLead = null; }
  renderTicker(); renderLiveBanner(); renderNav(parseRoute());
}
let bannerTimer;
function renderLiveBanner() {
  const host = $("#liveBanner"); if (!host) return;
  const lead = state.coverageLead;
  clearInterval(bannerTimer);
  if (!lead?.item) { host.innerHTML = ""; host.hidden = true; return; }
  host.hidden = false;
  const href = `/coverage/${encodeURIComponent(lead.item.slug)}`, latest = lead.updates[0], r = lead.results;
  const pic = lead.item.imageUrl && /^(https?:|\/media\/)/.test(lead.item.imageUrl) ? lead.item.imageUrl : "";
  // A compact broadcast tile: the coverage photo with a blinking LIVE tab, the headline, then either
  // the results race (election coverage) or the latest update, and a button. The full coverage is one tap away.
  const race = r?.candidates?.length ? `<span class="lb-race">
      <span class="lb-race-names">${r.candidates.slice(0, 2).map(c => `<span style="--c:${esc(c.color || "#fff")}"><b>${esc(c.name)}</b> ${c.pct.toFixed(2)}%</span>`).join("")}</span>
      ${r.candidates.length >= 2 ? `<span class="lb-split">${r.candidates.slice(0, 2).map(c => `<i style="flex-basis:${c.pct}%;background:${esc(c.color || "#fff")}"></i>`).join("")}<em></em></span>` : ""}
      <small>${r.winner ? `${esc(r.winner)} wins` : `${r.reporting.toFixed(1)}% counted${r.source ? ` · ${esc(r.source.replace(/\s*\(.*\)/, ""))}` : ""}`}</small></span>` : "";
  host.innerHTML = `<a class="live-banner ${pic ? "has-img" : "no-img"}" href="${href}">
    <span class="lb-media" aria-hidden="true">${pic ? `<img src="${esc(pic)}" alt="" decoding="async">` : `<span class="lb-glow"></span>`}<span class="live-tab"><span class="pulse"></span>Live</span></span>
    <span class="lb-body">
      <span class="lb-meta">Live coverage · ${lead.updates.length} update${lead.updates.length === 1 ? "" : "s"}${latest ? ` · ${ago(latest.createdAt)}` : ""}</span>
      <span class="lb-title">${esc(lead.item.title)}</span>
      ${race || (latest ? `<span class="lb-latest"><time>${clock(latest.createdAt)}</time>${esc(latest.body)}</span>` : "")}
    </span>
    <span class="lb-go">Follow live <span aria-hidden="true">→</span></span></a>`;
  if (lead.item.hasResults) bannerTimer = setInterval(async () => {
    if (!$("#liveBanner") || document.hidden) return;
    const fresh = await fetch(`/api/live/${encodeURIComponent(lead.item.slug)}/results`).then(x => x.ok ? x.json() : null).catch(() => null);
    if (fresh && state.coverageLead === lead) { lead.results = fresh; renderLiveBanner(); }
  }, 20e3);
}
/* Live results counter (election coverage): its own 10-second poll, numbers tween between counts. */
let resultsTimer, resultsHTML = "", resultsPrev = {};
const fmtN = n => Math.round(n).toLocaleString("en-IN");
function resultsCard(d) {
  const lead = d.candidates[0], time = d.updatedAt ? new Date(d.updatedAt).toLocaleTimeString(LOCALE, { ...IST, hour: "numeric", minute: "2-digit" }) : "";
  const head2 = d.candidates.length === 2 && d.candidates.every(c => c.pct);
  const status = d.winner ? `${esc(d.winner)} wins` : lead?.votes ? `${esc(lead.name)} is leading` : "Waiting for the first results";
  const sub = d.winner ? `${esc(d.source || "Officials")} ${d.final ? "final result" : "has called the race"}` : `${d.source ? `${esc(d.source)} hasn’t called this race` : "Race not called"}${d.note ? ` · ${esc(d.note)}` : ""}`;
  const face = c => c.photo && /^(https?:|\/media\/)/.test(c.photo) ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : `<span>${esc(c.name.split(/\s+/).map(w => w[0]).slice(0, 2).join(""))}</span>`;
  return `<div class="rc glass">
    <div class="rc-top">${d.final ? `<span class="tag">Final</span>` : `<span class="live-badge"><span class="pulse"></span>Live</span>`}<span class="meta">${time ? `Updated at ${time} IST` : ""}${d.stale ? " · reconnecting" : ""}</span></div>
    <h2>${esc(d.title)}</h2>${d.source ? `<p class="rc-src">From ${esc(d.source)}${d.final ? "" : " · Preliminary results"}</p>` : ""}
    <div class="rc-lead"><b>${status}</b><span>${sub}</span>
      <div class="rc-rep"><span><b data-to="${d.reporting}" data-from="${resultsPrev.rep ?? 0}" data-dec="2">${d.reporting.toFixed(2)}</b>% reporting</span><span class="rc-bar"><i style="width:${Math.min(100, d.reporting)}%"></i></span></div></div>
    ${head2 ? `<div class="rc-split" role="img" aria-label="${esc(d.candidates.map(c => `${c.name} ${c.pct.toFixed(2)}%`).join(", "))}">${d.candidates.map(c => `<i style="flex-basis:${c.pct}%;background:${esc(c.color || "var(--muted)")}"></i>`).join("")}<em></em></div>` : ""}
    <ol class="rc-list">${d.candidates.map((c, i) => `<li class="${d.winner === c.name ? "won" : ""}" style="--c:${esc(c.color || "var(--muted)")}">
      <span class="rc-face">${face(c)}</span><span class="rc-who"><b>${esc(c.name)}${d.winner === c.name ? ` <span class="rc-tick" aria-label="Winner">✓</span>` : ""}</b><small>${esc([c.party, c.tag].filter(Boolean).join(" · "))}</small></span>
      <span class="rc-num"><b><span data-to="${c.pct}" data-from="${resultsPrev[c.name]?.pct ?? 0}" data-dec="2">${c.pct.toFixed(2)}</span>%</b><small><span data-to="${c.votes}" data-from="${resultsPrev[c.name]?.votes ?? 0}" data-dec="0">${fmtN(c.votes)}</span> votes</small></span>
      <span class="rc-row-bar"><i style="width:${Math.min(100, c.pct)}%"></i></span></li>`).join("")}
      ${d.nulls || d.blanks ? `<li class="rc-other"><span class="rc-face"><span>✕</span></span><span class="rc-who"><b>Null and blank</b><small>Not counted as valid votes</small></span><span class="rc-num"><b>–</b><small>${fmtN(d.nulls + d.blanks)} votes</small></span></li>` : ""}</ol>
  </div>`;
}
function tweenResults(host) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = [...host.querySelectorAll("[data-to]")].filter(el => +el.dataset.from !== +el.dataset.to), t0 = performance.now();
  if (!els.length) return;
  const step = now => {
    const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3);
    for (const el of els) { const v = +el.dataset.from + (+el.dataset.to - +el.dataset.from) * e, dec = +el.dataset.dec; el.textContent = dec ? v.toFixed(dec) : fmtN(v); }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
async function loadResults(slug) {
  let d; try { const res = await fetch(`/api/live/${encodeURIComponent(slug)}/results`); d = res.ok ? await res.json() : null; } catch { d = null; }
  const host = $("#resultsCounter");
  if (!d || !host) return;
  resultsHTML = resultsCard(d); host.innerHTML = resultsHTML; tweenResults(host);
  resultsPrev = { rep: d.reporting, ...Object.fromEntries(d.candidates.map(c => [c.name, { pct: c.pct, votes: c.votes }])) };
}
let coverageTimer;
async function viewCoverage(r) {
  clearInterval(coverageTimer); clearInterval(resultsTimer); resultsHTML = ""; resultsPrev = {};
  const slug = r.arg;
  const render = async (first) => {
    let d;
    try { const res = await fetch(`/api/live/${encodeURIComponent(slug)}${lang !== "en" ? `?lang=${lang}` : ""}`); d = res.ok ? await res.json() : null; } catch { d = null; }
    if (parseRoute().page !== "coverage" || parseRoute().arg !== slug) return clearInterval(coverageTimer);
    if (!d) { if (first) $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><h1>This live coverage isn’t available</h1><p class="muted">It may have ended or been removed.</p><div class="blocked-actions"><a class="btn btn-dark" href="/live">Go to the live wire</a></div></div></div>`; return; }
    const isLive = d.item.status === "live";
    document.title = `${isLive ? "LIVE: " : ""}${d.item.title} · Raisina Wire`;
    $("#view").innerHTML = `<div class="wrap"><div class="coverage">
      <header class="coverage-head">${isLive ? `<span class="live-badge"><span class="pulse"></span>Live</span>` : `<span class="tag">Coverage ended</span>`}
        <h1>${esc(d.item.title)}</h1>${d.item.summary ? `<p class="dek">${esc(d.item.summary)}</p>` : ""}
        ${d.item.imageUrl && /^(https?:|\/media\/)/.test(d.item.imageUrl) ? `<figure class="coverage-hero">${img(d.item.imageUrl)}${isLive ? `<span class="live-tab" aria-hidden="true"><span class="pulse"></span>Live</span>` : ""}${d.item.heroCaption ? `<figcaption>${esc(d.item.heroCaption)}</figcaption>` : ""}</figure>` : ""}
        <div class="meta">Started ${new Date(d.item.startedAt).toLocaleString(LOCALE, { ...IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST · ${d.updates.length} update${d.updates.length === 1 ? "" : "s"}${isLive ? " · refreshes every 30 seconds" : ""}</div>
        ${shareBlock(`${isLive ? "LIVE: " : ""}${d.item.title}`, `/coverage/${encodeURIComponent(slug)}`)}</header>
      ${d.item.hasResults ? `<section id="resultsCounter" aria-live="polite" aria-label="Live results">${resultsHTML || `<div class="rc glass"><div class="skeleton" style="height:260px"></div></div>`}</section>` : ""}
      <ol class="coverage-feed">${d.updates.map((u, i) => `<li id="u-${Date.parse(u.createdAt) || i}" class="${i === 0 && isLive ? "latest" : ""}"><time datetime="${esc(u.createdAt)}"><b>${clock(u.createdAt)}</b><span>${ago(u.createdAt)}</span></time>
        <div class="glass">${i === 0 && isLive ? `<span class="tag tag-live">Latest</span>` : ""}${articleBlocks(u.body).map(b => `<p>${esc(b.x)}</p>`).join("")}${u.mediaUrl && /^(https?:|\/media\/)/.test(u.mediaUrl) ? `<div class="reader-hero">${img(u.mediaUrl)}</div>` : ""}${u.sourceUrl && /^https?:/.test(u.sourceUrl) ? `<a class="link-gold" href="${esc(u.sourceUrl)}" target="_blank" rel="noreferrer">Source ↗</a>` : ""}<button class="update-share" type="button" data-action="share-native" data-title="${esc(`${d.item.title}: ${String(u.body).slice(0, 110)}${String(u.body).length > 110 ? "…" : ""}`)}" data-url="${esc(`${location.origin}${withLang(`/coverage/${encodeURIComponent(slug)}`)}#u-${Date.parse(u.createdAt) || i}`)}" aria-label="Share this update">${SHARE_ICONS.share}<span>Share</span></button></div></li>`).join("") || `<li><div class="glass"><p class="muted">The first update will appear here shortly.</p></div></li>`}</ol>
    </div></div>`;
  };
  await render(true);
  coverageTimer = setInterval(() => { if (!document.hidden) render(false); }, 30e3);
  if ($("#resultsCounter")) {
    await loadResults(slug);
    resultsTimer = setInterval(() => {
      if (parseRoute().page !== "coverage" || parseRoute().arg !== slug) return clearInterval(resultsTimer);
      if (!document.hidden) loadResults(slug);
    }, 10e3);
  }
}

/* ---------- Stories: editions and articles from the CMS, newest first ---------- */
const GENERIC_ART = { security: "security", diplomacy: "diplomacy", markets: "markets", india: "india", energy: "energy" };
const genericImage = category => `/editions/generic-${GENERIC_ART[String(category || "").toLowerCase()] || "analysis"}.webp`;
// The bundled editions stand in until the CMS answers, and when the reader is offline.
const EDITION_STORIES = editions.map(e => ({ kind: "edition", slug: e.slug, href: `/edition/${e.slug}`, title: e.title, dek: e.dek, topic: e.topic, date: e.date, image: e.image, readMinutes: e.readMinutes, author: AUTHOR.name, writer: "ilmaz-syed", url: e.url }));
function stories() {
  if (!state.articles?.length) return EDITION_STORIES;
  return state.articles.map(a => ({ ...a, date: a.publishedAt, topic: a.topic || a.category, url: a.sourceUrl }));
}
let articlesSettled = false;
async function loadArticles() {
  try { const r = await fetch(`/api/articles${lang !== "en" ? `?lang=${lang}` : ""}`); if (r.ok) state.articles = (await r.json()).articles || []; } catch { /* keep what we have */ }
  const first = !articlesSettled; articlesSettled = true;
  if (first) return; // the first load is awaited by route() instead
  const page = parseRoute().page; // refresh lists that show stories, without moving the reader
  if (page === "home") viewHome(); else if (page === "editions") viewEditions(); else if (page === "author") viewAuthor(parseRoute());
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
const TOPICS = ["Geopolitics", "Security", "India", "Diplomacy", "Markets", "Energy", "General"];
function openDiscussionDialog(title = "") {
  openFormDialog({ kicker: "Community", title: "Start a discussion", submitLabel: "Publish discussion", fields: [
    { name: "title", label: "Title", required: true, minlength: 5, maxlength: 180, value: title.slice(0, 180) },
    { name: "topic", label: "Topic", type: "select", options: TOPICS, value: "Geopolitics" },
    { name: "lang", label: "Language", type: "select", options: Object.entries(LANGUAGES).map(([k, x]) => [k, x.name]), value: lang },
    { name: "body", label: "Your opening post", type: "textarea", rows: 7, required: true, minlength: 10 }
  ], onSubmit: async v => { const d = await apiJSON("/api/community/posts", v); toast("Discussion published."); await loadCommunity(); navigate(`/discussion/${d.id}`); } });
}
// Avatars: initials on a colour picked from the name, so each member is recognisable.
const AVATAR_COLOURS = ["#b8141f", "#0f5c8c", "#137a55", "#7a530f", "#6b3fa0", "#b4570e", "#1f6f78", "#8c2155"];
const avatarColour = name => AVATAR_COLOURS[[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLOURS.length];
const avatar = (name, cls = "") => `<span class="av ${cls}" style="--av:${avatarColour(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
const TOPIC_COLOURS = { Geopolitics: "#0f5c8c", Security: "#b8141f", India: "#b4570e", Diplomacy: "#6b3fa0", Markets: "#137a55", Energy: "#7a530f", General: "#596173" };
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
    <section class="community-hero"><div><span class="join-eyebrow"><span class="pulse"></span>The Raisina Wire community</span><h1>Ideas in conversation</h1>
      <p>Moderated discussions on India’s strategic questions. Be specific, cite sources and keep it civil. <a href="/community-guidelines">Guidelines</a></p>
      ${st ? `<div class="community-stats"><span><b>${st.discussions}</b> discussions</span><span><b>${st.replies}</b> replies</span>${st.members >= 25 ? `<span><b>${st.members}</b> members</span>` : ""}</div>` : ""}</div>
      <div class="hero-avatars" id="heroAvatars"></div></section>
    <div class="community-page"><div>
      <button class="composer glass" type="button" data-action="discuss">${state.user ? avatar(state.user.displayName) : `<span class="av" style="--av:#596173">+</span>`}<span>${state.user ? `What’s your take, ${esc(state.user.displayName.split(" ")[0])}? Start a discussion…` : "Join free to start a discussion…"}</span><span class="btn btn-red btn-sm">Post</span></button>
      <div class="community-tools"><div class="pill-tabs" role="tablist"><a role="tab" href="${q({ sort: "latest" })}" aria-selected="${sort === "latest"}">Latest</a><a role="tab" href="${q({ sort: "top" })}" aria-selected="${sort === "top"}">Top</a></div>
        <div class="chips topic-filter"><a class="chip" href="${q({ topic: "" })}" aria-pressed="${!topic}">All topics</a>${TOPICS.map(t => `<a class="chip" href="${q({ topic: t })}" aria-pressed="${t === topic}">${t}</a>`).join("")}</div>
        <div class="chips lang-filter" aria-label="Language"><a class="chip" href="${q({ in: "" })}" aria-pressed="${!inLang}">All languages</a>${Object.entries(LANGUAGES).map(([k, x]) => `<a class="chip" href="${q({ in: k })}" aria-pressed="${k === inLang}" lang="${k}" data-no-tr>${x.name}</a>`).join("")}</div></div>
      <div class="thread-list" id="threadList">${Array.from({ length: 3 }, () => `<div class="skeleton" style="height:150px;border-radius:20px"></div>`).join("")}</div></div>
    <aside>${studioMiniAd("community_page")}<div class="aside-card glass"><div class="kicker">Upcoming</div><ol class="agenda" id="agenda"></ol><a class="link-gold" href="/events" style="display:block;margin-top:12px;font-size:13px">All events →</a></div></aside></div></div>`;
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
  document.title = `${d.post.title} · Raisina Wire community`;
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
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Raisina Wire//Events//EN", "BEGIN:VEVENT", `UID:${ev.id}@raisinawire`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(ev.startsAt)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${text(ev.title)}`, `DESCRIPTION:${text(ev.description)}`, `URL:${location.origin}/events`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${ev.title.replace(/[^\w]+/g, "-").slice(0, 60)}.ics`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function viewEvents() {
  const evs = state.events;
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Events &amp; briefings</div><h1>Upcoming</h1><p>Expert briefings, debates and workshops. Times are shown in India Standard Time.</p></div></div>
  <div class="live-list">${evs === null ? `<div class="skeleton" style="height:200px"></div>` : evs.length ? evs.map(e => { const d = new Date(e.startsAt); return `<article class="live-item glass event-item"><span class="date-block"><b>${d.toLocaleDateString(LOCALE, { ...IST, day: "2-digit" })}</b><small>${d.toLocaleDateString(LOCALE, { ...IST, month: "short" })}</small></span>
    <span><b>${esc(e.title)}</b>${e.description ? `<p>${esc(e.description)}</p>` : ""}<span class="src"><span class="tag">${esc(e.eventType)}</span>${d.toLocaleString(LOCALE, { ...IST, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST · ${esc(e.access === "public" ? "Open to all" : e.access === "member" ? "Members" : "Premium members")}</span></span>
    <button class="btn btn-light btn-sm" type="button" data-action="ics" data-event="${esc(e.id)}">Add to calendar</button></article>`; }).join("") : `<div class="empty">No events are scheduled right now. New briefings are announced here first.</div>`}</div></div>`;
}

/* ---------- Watch & listen (multimedia from the control room) ---------- */
async function loadMedia() {
  try { const r = await fetch("/api/media"); state.media = r.ok ? (await r.json()).items || [] : []; } catch { state.media = []; }
  if (parseRoute().page === "watch") viewWatch();
  renderHomeMedia();
}
// Vertical (9:16) videos are "shorts": story bubbles on the homepage, a row on Watch, and a
// full-screen player. Landscape videos sit in a carousel on the homepage.
const isShort = m => m.mediaType === "short";
const isFilm = m => m.mediaType === "video" && /\.(mp4|webm)(\?|$)|youtube\.com|youtu\.be/i.test(m.mediaUrl || "");
const shorts = () => (state.media || []).filter(isShort);
const seenShorts = () => new Set(store.get("rw-seen-shorts", []));
function shortBubbles(list) {
  const seen = seenShorts();
  return list.map((m, i) => `<button class="short-bubble${seen.has(m.id) ? " seen" : ""}" type="button" data-action="short" data-index="${i}" aria-label="Play: ${esc(m.title)}">
    <span class="short-ring"><span class="short-face">${img(m.thumbnailUrl, "")}</span></span><span class="short-name">${esc(m.title)}</span></button>`).join("");
}
function videoCard(m) {
  return `<article class="vcard"><div class="vcard-media" data-video="${esc(m.id)}"><button class="vcard-play" type="button" data-action="play-video" data-id="${esc(m.id)}" aria-label="Play: ${esc(m.title)}">${img(m.thumbnailUrl, "")}<span class="play-badge" aria-hidden="true"></span></button></div>
    <div class="vcard-body"><span class="kicker">${esc(m.category || "Explainer")}</span><h3>${esc(m.title)}</h3>${m.description ? `<p>${esc(m.description)}</p>` : ""}</div></article>`;
}
function renderHomeMedia() {
  const rail = $("#shortsRail"), band = $("#videoBand");
  if (rail) {
    const list = shorts();
    rail.hidden = !list.length;
    rail.innerHTML = list.length ? `<div class="shorts-head"><span class="kicker">Shorts</span><a class="link-gold" href="/watch#shorts">All shorts →</a></div><div class="shorts-row">${shortBubbles(list)}</div>` : "";
  }
  if (band) {
    const films = (state.media || []).filter(isFilm);
    band.hidden = !films.length;
    band.innerHTML = films.length ? `<div class="section-head"><h2 id="videoBandTitle">Explainers</h2><div class="carousel-nav"><button class="carousel-btn" type="button" data-action="carousel" data-dir="-1" aria-label="Previous videos">‹</button><button class="carousel-btn" type="button" data-action="carousel" data-dir="1" aria-label="Next videos">›</button><a class="link-gold" href="/watch">Watch all →</a></div></div>
      <div class="vcarousel" tabindex="0" aria-label="Explainer videos">${films.map(videoCard).join("")}</div>` : "";
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
    el.innerHTML = `<div class="sv-stage"><div class="sv-bars"></div><div class="sv-top"><b class="sv-title sr-only" aria-live="polite"></b><span class="sv-grow"></span><button class="sv-btn" type="button" data-sv="mute" aria-label="Mute">🔊</button><button class="sv-btn" type="button" data-sv="close" aria-label="Close">✕</button></div>
      <video class="sv-video" playsinline preload="auto"></video><button class="sv-zone sv-prev" type="button" data-sv="prev" aria-label="Previous short"></button><button class="sv-zone sv-next" type="button" data-sv="next" aria-label="Next short"></button>
      <div class="sv-paused" aria-hidden="true">❚❚</div></div>`;
    document.body.append(el);
    const v = el.querySelector("video");
    v.addEventListener("timeupdate", () => { const bar = el.querySelectorAll(".sv-bars i")[shortsState?.i]; if (bar && v.duration) bar.style.width = `${(v.currentTime / v.duration) * 100}%`; });
    v.addEventListener("ended", () => stepShort(1));
    el.addEventListener("click", e => {
      if (el.dataset.held) { delete el.dataset.held; return; }   // a press-and-hold pause is not a tap
      const b = e.target.closest("[data-sv]"); if (!b) return;
      const k = b.dataset.sv;
      if (k === "close") closeShorts(); else if (k === "prev") stepShort(-1); else if (k === "next") stepShort(1);
      else if (k === "mute") { v.muted = !v.muted; b.textContent = v.muted ? "🔇" : "🔊"; b.setAttribute("aria-label", v.muted ? "Unmute" : "Mute"); }
    });
    // hold to pause, swipe down to close
    let y0 = null, held = null;
    el.addEventListener("pointerdown", e => { if (e.target.closest(".sv-top")) return; y0 = e.clientY; held = setTimeout(() => { v.pause(); el.classList.add("held"); }, 220); });
    const release = e => { clearTimeout(held); if (el.classList.contains("held")) { el.classList.remove("held"); el.dataset.held = "1"; v.play().catch(() => {}); } if (y0 != null && e.clientY - y0 > 90) closeShorts(); y0 = null; };
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
function showShort() {
  const el = $("#shortsViewer"), { i, list } = shortsState, m = list[i], v = el.querySelector("video");
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
  renderHomeMedia(); if (parseRoute().page === "watch") viewWatch();
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
function viewWatch() {
  const all = state.media, list = all && shorts(), items = all && all.filter(m => !isShort(m));
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Watch &amp; listen</div><h1>Video, audio and images</h1><p>Briefings and explainers from the Raisina Wire desk.</p></div></div>
  ${list && list.length ? `<section class="watch-shorts" id="shorts" aria-labelledby="shortsTitle"><div class="section-head"><h2 id="shortsTitle">Vertical shorts</h2></div><div class="shorts-grid">${list.map((m, i) => `<button class="short-tile" type="button" data-action="short" data-index="${i}" aria-label="Play: ${esc(m.title)}">${img(m.thumbnailUrl, "")}<span class="play-badge" aria-hidden="true"></span><span class="short-tile-title">${esc(m.title)}</span></button>`).join("")}</div></section>
  <div class="section-head" style="margin-top:34px"><h2>Videos, audio and images</h2></div>` : ""}
  <div class="media-grid">${items == null ? `<div class="skeleton" style="height:300px"></div>` : items.length ? items.map(m => `<article class="glass media-card">${mediaEmbed(m)}<div class="body"><span class="kicker">${esc(m.category || m.mediaType)}</span><h3>${esc(m.title)}</h3>${m.description ? `<p>${esc(m.description)}</p>` : ""}<span class="meta">${m.publishedAt ? shortDate(m.publishedAt) : ""}</span></div></article>`).join("") : `<div class="empty">Nothing published yet. Video and audio briefings will appear here.</div>`}</div></div>`;
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
  if (q.length < 2) { host.innerHTML = `<p class="muted">Try a country, a topic or a name. Press Enter for all results.</p>`; return; }
  const eds = stories().filter(e => `${e.title} ${e.dek} ${e.topic}`.toLowerCase().includes(q)).slice(0, 5);
  const wire = wireItems().filter(i => `${i.title} ${i.summary} ${i.source}`.toLowerCase().includes(q)).slice(0, 6);
  host.innerHTML = (eds.length ? `<div class="kicker">Raisina Wire</div>${eds.map(e => `<a href="${edHref(e)}" data-close-dialog><b>${esc(e.title)}</b><span class="meta">${esc(e.topic)} · ${shortDate(e.date)}</span></a>`).join("")}` : "")
    + (wire.length ? `<div class="kicker">Live wire</div>${wire.map(i => `<a href="${wireHref(i)}" data-close-dialog><b>${esc(i.title)}</b><span class="meta">${esc(i.source)} · ${clock(i.publishedAt)}</span></a>`).join("")}` : "")
    || `<p class="muted">Nothing matched “${esc(q)}”.</p>`;
}

/* ---------- Data loading ---------- */
async function loadWire() {
  try {
    const r = await fetch(`/api/wire${lang !== "en" ? `?lang=${lang}` : ""}`); if (!r.ok) throw new Error();
    state.wire = await r.json(); state.wireError = false;
    state.wire.items.forEach(i => wireIndex.set(i.url, i));
    $("#wireStatus").innerHTML = r.headers.get("x-rw-offline")
      ? `<span class="dot-live"></span>Offline copy · live wire as of ${clock(state.wire.updatedAt)} IST`
      : `<span class="dot-ok"></span>Live wire · ${state.wire.items.length} stories · updated ${clock(state.wire.updatedAt)} IST`;
  } catch {
    state.wireError = true;
    $("#wireStatus").innerHTML = `<span class="dot-live"></span>Live wire unavailable · retrying`;
  }
  renderRail(); renderTopicCols(); renderLiveList(); renderExtAside(); renderTicker(); renderBriefing();
}
async function loadMarkets() {
  try { const r = await fetch("/api/markets"); if (!r.ok) throw new Error(); state.markets = await r.json(); state.markets.offline = !!r.headers.get("x-rw-offline"); state.marketsError = false; }
  catch { state.marketsError = true; }
  renderDock(); renderHomeMarkets(); renderBoard();
}
async function loadCommunity() {
  try { state.community = (await fetch("/api/community/posts").then(r => r.json())).posts || []; } catch { state.community = []; }
  try { state.events = (await fetch(`/api/events${lang !== "en" ? `?lang=${lang}` : ""}`).then(r => r.json())).events || []; } catch { state.events = []; }
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
  $("#authSwitchText").textContent = mode === "login" ? "New to Raisina Wire?" : "Already have an account?";
  $("#authSwitch").textContent = mode === "login" ? "Create an account" : "Sign in instead";
  $("#authMessage").textContent = "";
}
const initials = name => (name || "").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "RW";
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
    <a role="menuitem" href="/my">My Raisina</a><a role="menuitem" href="/saved">Saved stories</a><a role="menuitem" href="/account">My account</a><button role="menuitem" type="button" data-action="alerts">Breaking-news alerts</button>${staff ? `<a role="menuitem" href="/admin.html">Control room</a>` : ""}
    <a role="menuitem" href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer">Newsletter on LinkedIn ↗</a>${isStandalone() ? "" : `<button role="menuitem" type="button" data-action="install">Install the app</button>`}
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
function toast(message) { const t = $("#toast"); t.textContent = message; t.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 3200); }

/* ---------- PWA ---------- */
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const recentlyDismissed = () => Date.now() - (store.get("rw-install-dismissed", 0) || 0) < 14 * 864e5;
function showInstallSheet({ force = false } = {}) {
  if (isStandalone() || (!force && recentlyDismissed())) return;
  const ios = isIOS() && !state.installPrompt;
  $(".install-ios").hidden = !ios;
  $(".install-actions [data-action=install]").hidden = ios;
  $("#installSheet").hidden = false;
}
async function installPWA() {
  if (isStandalone()) return toast("Raisina Wire is already installed on this device.");
  if (!state.installPrompt) {
    if (!$("#installSheet").hidden && !isIOS()) return toast("Use your browser menu and choose “Install app” or “Add to Home screen”.");
    return showInstallSheet({ force: true });
  }
  $("#installSheet").hidden = true;
  state.installPrompt.prompt();
  const { outcome } = await state.installPrompt.userChoice;
  state.installPrompt = null;
  if (outcome !== "accepted") store.set("rw-install-dismissed", Date.now());
}
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); state.installPrompt = e; setTimeout(() => showInstallSheet(), 8000); });
window.addEventListener("appinstalled", () => { $("#installSheet").hidden = true; toast("Raisina Wire is installed. Find it on your home screen."); });
if (isIOS() && !isStandalone()) setTimeout(() => showInstallSheet(), 15000);
document.documentElement.classList.toggle("standalone", isStandalone());

function syncOnline(event) {
  const off = !navigator.onLine;
  document.body.classList.toggle("is-offline", off);
  $("#offlineBar").hidden = !off;
  if (event?.type === "online") { loadWire(); loadMarkets(); }
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
// Readers whose device is set to Hindi or Bengali are offered the site in that language once.
function maybeSuggestLanguage() {
  if (lang !== "en" || store.get("rw-lang", null)) return;
  const want = (navigator.languages || [navigator.language]).map(x => String(x).slice(0, 2).toLowerCase()).find(x => x === "hi" || x === "bn");
  if (!want) return;
  const box = $("#langSuggest"), here = stripLang(location.pathname) + location.search;
  box.innerHTML = want === "hi"
    ? `<span lang="hi-IN"><b>रायसीना वायर अब हिन्दी में</b><small>पूरी साइट और सभी लेख हिन्दी में पढ़ें।</small></span><a class="btn btn-red btn-sm lang-link" href="${withLang(here, "hi")}" data-lang="hi" lang="hi-IN">हिन्दी में पढ़ें</a>`
    : `<span lang="bn-IN"><b>রাইসিনা ওয়্যার এখন বাংলায়</b><small>গোটা সাইট আর সব লেখা বাংলায় পড়ুন।</small></span><a class="btn btn-red btn-sm lang-link" href="${withLang(here, "bn")}" data-lang="bn" lang="bn-IN">বাংলায় পড়ুন</a>`;
  box.insertAdjacentHTML("beforeend", `<button class="ub-close" type="button" data-action="lang-later" aria-label="Close">${ICON_X}</button>`);
  setTimeout(() => { box.hidden = false; }, 2500);
}

/* ---------- Boot ---------- */
// Readers who chose Hindi or Bengali get it on every visit, also from English links.
const langPref = store.get("rw-lang", null);
const langTarget = lang === "en" && LANGUAGES[langPref] && langPref !== "en" && !new URLSearchParams(location.search).has("orig") ? withLang(location.pathname, langPref) : null;
if (langTarget && langTarget !== location.pathname) location.replace(langTarget + location.search + location.hash);
else loadLanguage().catch(() => {}).then(boot);
let articlesReady, userReady;
function boot() {
articlesReady = loadArticles();
// The session is checked once at start; pages that depend on it wait for the answer.
userReady = fetch("/api/auth/me").then(r => r.json()).then(async d => { state.user = d.user || null; if (state.user) await loadTopics(); }).catch(() => {});
renderShell();
startTranslator(document.body); // draws the interface in Hindi or Bengali
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
loadWire(); loadMarkets(); loadCommunity(); loadCoverage(); loadMedia();
setInterval(() => { if (!document.hidden) loadCoverage(); }, 60e3);
setInterval(() => { if (!document.hidden) loadArticles(); }, 5 * 60e3);

fetch("/api/config").then(r => r.json()).then(c => { if (c.linkedinUrl) $("#linkedinLink").href = c.linkedinUrl; }).catch(() => {});
setInterval(() => { if (!document.hidden) loadWire(); }, 120e3);
setInterval(() => { if (!document.hidden) loadMarkets(); }, 60e3);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadWire(); loadMarkets(); } });
}

import "./style.css";
import { editions, NEWSLETTER_URL, AUTHOR } from "./editions.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const IST = { timeZone: "Asia/Kolkata" };

const state = { user: null, wire: null, wireError: false, markets: null, marketsError: false, community: null, events: null, installPrompt: null, homeGroup: "india" };
const wireIndex = new Map(); // url -> wire item, so the reader can show a headline while it loads

/* ---------- Formatting ---------- */
const editionDate = iso => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" });
const shortDate = iso => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short" });
const clock = iso => iso ? new Date(iso).toLocaleTimeString("en-IN", { ...IST, hour: "2-digit", minute: "2-digit", hour12: false }) : "";
function ago(iso) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short" });
}
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
  toast("Saved on this device.");
}
function setTextScale(delta) {
  const scale = Math.min(1.3, Math.max(0.85, (store.get("rw-text", 1) + delta)));
  store.set("rw-text", Math.round(scale * 100) / 100);
  document.documentElement.style.setProperty("--text-scale", scale);
}
document.documentElement.style.setProperty("--text-scale", store.get("rw-text", 1));

/* ---------- Shell ---------- */
const NAV = [
  ["Today", "#/", r => r.page === "home"],
  ["Raisina Wire", "#/editions", r => r.page === "editions" || r.page === "edition"],
  ["Live", "#/live", r => r.page === "live" && !r.arg],
  ["India", "#/live/India", r => r.page === "live" && r.arg === "India"],
  ["Security", "#/live/Security", r => r.page === "live" && r.arg === "Security"],
  ["Diplomacy", "#/live/Diplomacy", r => r.page === "live" && r.arg === "Diplomacy"],
  ["Markets", "#/markets", r => r.page === "markets"],
  ["Community", "#/community", r => r.page === "community"],
  ["Saved", "#/saved", r => r.page === "saved"]
];

function renderShell() {
  document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#view">Skip to content</a>`);
  $("#app").innerHTML = `
  <header class="wrap">
    <div class="utility">
      <div class="utility-left"><span id="today"></span><span id="wireStatus"><span class="dot-ok"></span>Connecting to the live wire…</span></div>
      <div class="utility-right"><button class="text-btn" type="button" id="signInBtn">Sign in</button><button class="btn btn-gold btn-sm" type="button" id="joinBtn">Join free</button></div>
    </div>
    <div class="masthead" id="masthead"><a href="#/" aria-label="Raisina Wire home">Raisina <i>Wire</i></a><div class="meta">An Indian perspective on a changing world</div></div>
  </header>
  <div class="nav-dock"><div class="wrap"><nav class="site-nav glass" id="siteNav" aria-label="Sections"></nav></div></div>
  <div class="read-progress" id="readProgress" aria-hidden="true"></div>
  <main id="view" tabindex="-1"></main>
  <footer class="site-footer"><div class="wrap">
    <div class="footer-top"><a class="footer-brand" href="#/">Raisina <i>Wire</i></a>
      <div class="footer-links"><a href="#/editions">All editions</a><a href="#/live">Live wire</a><a href="#/markets">Markets</a><a href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer" id="linkedinLink">Newsletter on LinkedIn ↗</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div></div>
    <form class="lead-form glass" id="leadForm"><span class="kicker">Briefings &amp; partnerships</span>
      <label class="sr-only" for="leadName">Your name</label><input id="leadName" name="name" placeholder="Your name" required minlength="2" autocomplete="name">
      <label class="sr-only" for="leadEmail">Work email</label><input id="leadEmail" name="email" type="email" placeholder="Work email" required autocomplete="email">
      <label class="sr-only" for="leadOrg">Organisation</label><input id="leadOrg" name="organisation" placeholder="Organisation (optional)" autocomplete="organization">
      <label class="sr-only" for="leadInterest">Interest</label><select id="leadInterest" name="interest"><option>Daily briefing</option><option>Academy training</option><option>Calibrex enterprise enquiry</option><option>Speaking / partnership</option></select>
      <button class="btn btn-dark" type="submit">Request contact</button><small id="leadMessage" aria-live="polite"></small></form>
    <p class="copyright">© ${new Date().getFullYear()} Raisina Wire. Independent editorial platform. Live headlines and quotes come from the named publishers and public feeds.</p>
  </div></footer>
  <div class="modal-backdrop hidden" id="modalBackdrop"><section class="modal glass" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <button class="modal-close" id="modalClose" type="button" aria-label="Close">×</button>
    <div class="kicker">Raisina Wire membership</div><h2 id="modalTitle">Welcome back.</h2>
    <p class="modal-intro">A free account lets you follow topics and join community discussions.</p>
    <div id="authMessage" class="auth-message" aria-live="polite"></div>
    <form id="authForm"><label id="nameField" class="hidden">Your name<input name="displayName" autocomplete="name" minlength="2"></label>
      <label>Email address<input name="email" type="email" autocomplete="email" required></label>
      <label>Password <small>(12+ characters)</small><input name="password" type="password" minlength="12" autocomplete="current-password" required></label>
      <button class="btn btn-dark" type="submit" id="authSubmit">Sign in</button></form>
    <div class="auth-switch"><span id="authSwitchText">New to Raisina Wire?</span><button id="authSwitch" type="button">Create an account</button></div>
  </section></div>
  <div class="toast" id="toast" role="status"></div>
  <button class="btn btn-gold install-pill hidden" id="installPill" type="button">Install Raisina Wire</button>`;

  $("#today").textContent = new Date().toLocaleDateString("en-IN", { ...IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#signInBtn").addEventListener("click", () => state.user ? signOut() : openAuth("login"));
  $("#joinBtn").addEventListener("click", () => state.user ? (location.hash = "#/saved") : openAuth("register"));
  $("#modalClose").addEventListener("click", closeAuth);
  $("#modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") closeAuth(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modalBackdrop").classList.contains("hidden")) closeAuth(); });
  $("#authSwitch").addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));
  $("#authForm").addEventListener("submit", submitAuth);
  $("#leadForm").addEventListener("submit", submitLead);
  $("#installPill").addEventListener("click", installPWA);
  // One delegated handler for every action button rendered by the views.
  document.addEventListener("click", onAction);
  // Hide images from feeds that fail to load rather than showing a broken icon.
  document.addEventListener("error", e => {
    if (!e.target?.matches?.("img[data-hide-on-error]")) return;
    (e.target.closest(".thumb, .reader-hero") || e.target).classList.add("hidden");
  }, true);
}

function renderNav(route) {
  $("#siteNav").innerHTML = `<a class="nav-brand" href="#/" aria-label="Raisina Wire home" tabindex="-1">Raisina <i>Wire</i></a>` + NAV.map(([label, href, active]) => `<a href="${href}"${active(route) ? ' aria-current="page"' : ""}>${label}</a>`).join("")
    + `<button class="search-btn" type="button" data-action="search" aria-label="Search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>`;
  $("#siteNav").dispatchEvent(new Event("scroll"));
}

/* ---------- Router ---------- */
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [page = "", ...rest] = path.split("/").filter(Boolean);
  return { page: page || "home", arg: rest.length ? decodeURIComponent(rest.join("/")) : "", params: new URLSearchParams(query) };
}
const views = { home: viewHome, editions: viewEditions, edition: viewEdition, read: viewExternal, live: viewLive, markets: viewMarkets, community: viewHome, saved: viewSaved, search: viewSearch };
async function route() {
  const r = parseRoute();
  renderNav(r);
  const view = views[r.page] || viewHome;
  document.body.classList.toggle("is-reading", r.page === "edition" || r.page === "read");
  const main = $("#view");
  main.classList.remove("view-enter"); void main.offsetWidth; main.classList.add("view-enter");
  await view(r);
  updateProgress();
  if (r.page === "community") $("#community")?.scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
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
const edHref = e => `#/edition/${e.slug}`;
const wireHref = i => `#/read?u=${encodeURIComponent(i.url)}`;
function edCard(e, { dek = false } = {}) {
  return `<a class="ed-card glass" href="${edHref(e)}"><div class="thumb">${img(e.image)}</div><span class="body"><span class="kicker">${esc(e.topic)}</span><h3>${esc(e.title)}</h3>${dek ? `<p>${esc(e.dek)}</p>` : ""}<span class="meta">${esc(AUTHOR.name)} · ${shortDate(e.date)} · ${e.readMinutes} min</span></span></a>`;
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
  const [lead, ...rest] = editions;
  $("#view").innerHTML = `
  <div class="wrap">
    <section class="dock glass" aria-label="Market pulse"><div class="dock-head"><b>Market pulse</b><span class="muted" id="dockStatus" style="font-size:12px">Loading quotes…</span><a class="link-gold" href="#/markets" style="font-size:13px">All markets →</a></div><div class="dock-grid" id="dock"></div></section>

    <div class="lead-grid">
      <section class="side-stack" aria-label="More from Raisina Wire"><div class="kicker">Raisina Wire · Newest</div>
        ${rest.slice(0, 3).map(e => `<a class="side-item" href="${edHref(e)}"><div class="thumb">${img(e.image)}</div><span class="kicker">${esc(e.topic)}</span><h3>${esc(e.title)}</h3><span class="meta">${esc(AUTHOR.name)} · ${shortDate(e.date)}</span></a>`).join("")}
      </section>
      <article class="hero">${img(lead.image, "")}
        <div class="hero-card glass">
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><span class="tag tag-dark">Raisina Wire · Latest</span><span class="kicker">${esc(lead.topic)}</span></div>
          <h1><a href="${edHref(lead)}">${esc(lead.title)}</a></h1><p>${esc(lead.dek)}</p>
          <div class="hero-foot"><span class="byline"><img src="${AUTHOR.photo}" alt=""><span><b>${esc(AUTHOR.name)}</b> <span class="muted">· ${editionDate(lead.date)} · ${lead.readMinutes} min read</span></span></span><a class="btn btn-dark" href="${edHref(lead)}">Read now</a></div>
        </div>
      </article>
      <aside class="live-rail glass" aria-label="Live wire"><div class="live-title"><b><span class="dot-live"></span>Live wire</b><span class="muted" style="font-size:12px" id="railUpdated"></span></div><div id="rail"></div><a class="link-gold" href="#/live" style="display:block;margin-top:16px;font-size:13px">All live updates →</a></aside>
    </div>

    <section class="band"><div class="section-head"><h2>From the Raisina Wire desk</h2><a class="link-gold" href="#/editions">All ${editions.length} editions →</a></div>
      <div class="card-grid">${rest.slice(3, 7).map(e => edCard(e)).join("")}</div></section>

    <section class="band split">
      <div><div class="section-head"><h2>India &amp; the World</h2></div>
        ${rest[7] ? `<a class="feature glass" href="${edHref(rest[7])}"><div class="thumb">${img(rest[7].image)}</div><span class="body"><span class="kicker">${esc(rest[7].topic)}</span><h3>${esc(rest[7].title)}</h3><p>${esc(rest[7].dek)}</p></span></a>` : ""}
        <div class="pair">${rest.slice(8, 10).map(e => `<a href="${edHref(e)}"><span class="kicker">${esc(e.topic)}</span><h3>${esc(e.title)}</h3><span class="meta">Raisina Wire · ${shortDate(e.date)}</span></a>`).join("")}</div>
      </div>
      <div class="markets-panel glass"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h2>Markets</h2><a class="link-gold" href="#/markets" style="font-size:13px">Full board →</a></div>
        <div class="pill-tabs" role="tablist" aria-label="Market groups" id="homeTabs" style="margin-top:12px"></div><div id="homeMarkets" style="margin-top:8px"></div>
        <p class="muted" style="margin:12px 0 0;font-size:12px">Delayed quotes from public feeds · Not investment advice</p></div>
    </section>

    <section class="band"><div class="section-head"><h2>Live coverage</h2><a class="link-gold" href="#/live">Live wire →</a></div><div class="topic-cols" id="topicCols"></div></section>

    <section class="band" id="community"><div class="community glass">
      <div><div class="kicker">Community</div><h2>Ideas in conversation.</h2><p class="muted" style="margin:10px 0 0;font-size:15px;line-height:1.7">Moderated discussions, expert briefings and research missions.</p>
        <button class="btn btn-dark" type="button" data-action="discuss" style="margin-top:16px">Start a discussion</button></div>
      <div class="community-cards" id="communityCards"></div>
    </div></section>
  </div>`;
  renderDock(); renderRail(); renderHomeMarkets(); renderTopicCols(); renderCommunity();
}

function renderDock() {
  const host = $("#dock"); if (!host) return;
  if (!state.markets) { host.innerHTML = Array.from({ length: 8 }, () => `<div class="skeleton" style="height:78px"></div>`).join(""); $("#dockStatus").textContent = state.marketsError ? "Quotes unavailable · retrying" : "Loading quotes…"; return; }
  host.innerHTML = state.markets.overview.map(q => { const ch = quoteChange(q); return `<a class="tile" href="#/markets"><div class="tile-label">${esc(q.label)}</div><div class="tile-row"><span class="tile-value">${quoteValue(q)}</span><span class="tile-change ${ch.cls}">${ch.text}</span></div>${sparkline(q.spark, ch.cls)}</a>`; }).join("");
  $("#dockStatus").textContent = `Delayed · updated ${clock(state.markets.updatedAt)} IST`;
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
    return `<div class="topic-col"><h3>${cat}<a class="link-gold" href="#/live/${cat}" style="font-size:12px;letter-spacing:0;text-transform:none">More →</a></h3>${top ? `<a class="thumb" href="${wireHref(top)}" style="display:block">${img(top.image)}</a>` : ""}${list.length ? list.map(wireLink).join("") : `<p class="muted" style="font-size:14px">No ${cat.toLowerCase()} items in the last few hours.</p>`}</div>`;
  }).join("");
}
function renderCommunity() {
  const host = $("#communityCards"); if (!host) return;
  const posts = (state.community || []).slice(0, 2).map(p => `<div class="mini-card"><div class="kicker" style="font-size:10px">Discussion · ${esc(p.topic)}</div><b>${esc(p.title)}</b><span class="muted">${esc(p.author)} · ${ago(p.createdAt)}</span></div>`);
  const ev = (state.events || [])[0];
  const cards = [...posts];
  cards.push(ev ? `<div class="mini-card"><div class="kicker" style="font-size:10px">Event · ${esc(ev.eventType)}</div><b>${esc(ev.title)}</b><span class="muted">${new Date(ev.startsAt).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short" })} · ${esc(ev.access)}</span></div>` : `<div class="mini-card"><div class="kicker" style="font-size:10px">Events</div><b>Expert briefings and debates</b><span class="muted">New events are announced here.</span></div>`);
  cards.push(`<a class="mini-card" href="https://calibrex.org/academy/" target="_blank" rel="noreferrer"><div class="kicker" style="font-size:10px">Academy</div><b>OSINT for strategic professionals</b><span class="muted">With Calibrex Academy ↗</span></a>`);
  if (!posts.length) cards.unshift(`<div class="mini-card"><div class="kicker" style="font-size:10px">Discussion</div><b>Be the first to start a conversation</b><span class="muted">Members can open a discussion on any edition.</span></div>`);
  host.innerHTML = cards.slice(0, 3).join("");
}

/* ---------- Editions ---------- */
function viewEditions() {
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Raisina Wire</div><h1>Every edition</h1><p>Open-source analysis of India’s strategic questions by ${esc(AUTHOR.name)}, newest first. Each edition reads in full here and links to the original on LinkedIn.</p></div><a class="btn btn-light" href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer">Subscribe on LinkedIn ↗</a></div>
  <div class="archive-grid">${editions.map(e => edCard(e, { dek: true })).join("")}</div></div>`;
}

let bodiesPromise;
const loadBodies = () => (bodiesPromise ||= import("./edition-bodies.json").then(m => m.default));
function proseHTML(blocks) {
  let html = "", list = [];
  const flush = () => { if (list.length) { html += `<ul>${list.join("")}</ul>`; list = []; } };
  for (const b of blocks) {
    if (b.t === "li") { list.push(`<li>${esc(b.x)}</li>`); continue; }
    flush();
    html += b.t === "h" ? `<h2>${esc(b.x)}</h2>` : `<p>${esc(b.x)}</p>`;
  }
  flush();
  return html;
}
const ICON = {
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
  save: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`,
  share: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5"/></svg>`
};
function readerBar({ badge, original, originalLabel, saveItem }) {
  return `<div class="reader-bar glass"><a class="btn btn-light btn-sm" href="#/" data-action="back" aria-label="Back">${ICON.back}<span class="lbl">Back</span></a><span class="badge">${esc(badge)}</span><span class="grow"></span>
    <button class="btn btn-light btn-sm" type="button" data-action="text-smaller" aria-label="Smaller text">A−</button><button class="btn btn-light btn-sm" type="button" data-action="text-larger" aria-label="Larger text">A+</button>
    <button class="btn btn-light btn-sm" type="button" data-action="save" aria-label="Save" data-item='${esc(JSON.stringify(saveItem))}'>${ICON.save}<span class="lbl">Save</span></button><button class="btn btn-light btn-sm" type="button" data-action="share" aria-label="Share" data-title="${esc(saveItem.title)}">${ICON.share}<span class="lbl">Share</span></button>
    <a class="btn btn-dark btn-sm original-btn" href="${esc(original)}" target="_blank" rel="noreferrer"><span class="lbl">${esc(originalLabel)}</span><span class="lbl-short">Original</span> ↗</a></div>`;
}
async function viewEdition(r) {
  const i = editions.findIndex(e => e.slug === r.arg);
  if (i < 0) { $("#view").innerHTML = `<div class="wrap"><div class="blocked glass"><h1>Edition not found</h1><div class="blocked-actions"><a class="btn btn-dark" href="#/editions">See all editions</a></div></div></div>`; return; }
  const e = editions[i], newer = editions[i - 1], older = editions[i + 1];
  document.title = `${e.title} · Raisina Wire`;
  $("#view").innerHTML = `<div class="wrap">${readerBar({ badge: "Raisina Wire · Native article", original: e.url, originalLabel: "Original on LinkedIn", saveItem: { href: edHref(e), title: e.title, source: "Raisina Wire" } })}
  <div class="reader-layout"><article class="reader-article">
    <div class="kicker">${esc(e.topic)}</div><h1>${esc(e.title)}</h1><p class="dek">${esc(e.dek)}</p>
    <div class="reader-byline"><img src="${AUTHOR.photo}" alt=""><div><b>${esc(AUTHOR.name)}</b><div class="muted" style="font-size:13px">${esc(AUTHOR.role)}, Raisina Wire</div></div><span class="grow"></span><span class="meta">${editionDate(e.date)} · ${e.readMinutes} min read</span></div>
    <div class="reader-hero">${img(e.image, "")}</div>
    <div class="prose" id="prose"><div class="skeleton" style="height:420px"></div></div>
    <div class="reader-end glass"><div><b style="font-size:16px">Follow Raisina Wire</b><div class="muted" style="font-size:14px;margin-top:4px">First published in the Raisina Wire newsletter on LinkedIn.</div></div><a class="btn btn-dark" href="${NEWSLETTER_URL}" target="_blank" rel="noreferrer">Subscribe ↗</a></div>
    <div class="prev-next">${newer ? `<a class="glass" href="${edHref(newer)}"><span class="meta">Newer edition</span><b>${esc(newer.title)}</b></a>` : "<span></span>"}${older ? `<a class="glass" href="${edHref(older)}"><span class="meta">Older edition</span><b>${esc(older.title)}</b></a>` : ""}</div>
  </article>
  <aside class="reader-aside"><div class="aside-card glass"><div class="kicker">More from Raisina Wire</div>
    ${editions.filter(x => x !== e).slice(0, 5).map(x => `<a class="aside-link" href="${edHref(x)}"><span class="thumb">${img(x.image)}</span><span><b>${esc(x.title)}</b><span class="meta" style="display:block;margin-top:5px;font-size:10px">${shortDate(x.date)}</span></span></a>`).join("")}
  </div></aside></div></div>`;
  try { const bodies = await loadBodies(); if (parseRoute().arg === e.slug) $("#prose").innerHTML = proseHTML(bodies[e.slug]?.blocks || []); }
  catch { $("#prose").innerHTML = `<p>This edition could not be loaded. <a href="${esc(e.url)}" target="_blank" rel="noreferrer">Read it on LinkedIn ↗</a></p>`; }
}

/* ---------- External reader ---------- */
async function viewExternal(r) {
  const url = r.params.get("u") || "";
  const known = wireIndex.get(url) || {};
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (!host) { location.hash = "#/live"; return; }
  const source = known.source || host;
  const saveItem = { href: wireHref({ url }), title: known.title || url, source };
  $("#view").innerHTML = `<div class="wrap">${readerBar({ badge: `${source} · Reader view`, original: url, originalLabel: `Original on ${source}`, saveItem })}
    <div class="reader-layout"><article class="reader-article" id="extArticle">
      <div class="kicker">${esc(known.category || "Live wire")}</div><h1>${esc(known.title || "Loading article…")}</h1>
      <div class="prose"><div class="skeleton" style="height:360px"></div></div></article>
    <aside class="reader-aside" id="extAside"></aside></div></div>`;
  renderExtAside();
  let data;
  try { data = await fetch(`/api/read?url=${encodeURIComponent(url)}`).then(res => res.json()); }
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
      <div class="notice">${ICON_LOCK}<span>${esc(site)} doesn’t allow its full story to be shown inside Raisina Wire. You can read it on their site.</span></div>
      <div class="blocked-actions"><a class="btn btn-dark" href="${esc(url)}" target="_blank" rel="noreferrer">Read original on ${esc(site)} ↗</a><button class="btn btn-light" type="button" data-action="save" data-item='${esc(JSON.stringify(saveItem))}'>Save for later</button><a class="btn btn-light" href="#/" data-action="back">Back</a></div>
    </section></div>`;
    return;
  }
  $(".reader-bar .badge").textContent = `${site} · Reader view`;
  $(".reader-bar .original-btn .lbl").textContent = `Original on ${site}`;
  $("#extArticle").innerHTML = `<div class="kicker">${esc(known.category || site)}</div><h1>${esc(title)}</h1>
    ${data.description ? `<p class="dek">${esc(data.description)}</p>` : ""}
    <div class="reader-byline"><div><b>${esc(data.byline || site)}</b><div class="muted" style="font-size:13px">${esc(site)}</div></div><span class="grow"></span><span class="meta">${data.publishedAt ? new Date(data.publishedAt).toLocaleString("en-IN", { ...IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : known.publishedAt ? `${clock(known.publishedAt)} IST` : ""}</span></div>
    <div class="notice">${ICON_INFO}<span>Reader view of an article from ${esc(site)}. The text belongs to the publisher. <a href="${esc(data.url || url)}" target="_blank" rel="noreferrer" style="color:var(--gold-ink);font-weight:800">Read the original ↗</a></span></div>
    ${data.image ? `<div class="reader-hero">${img(data.image)}</div>` : ""}
    <div class="prose">${proseHTML(data.blocks || [])}</div>
    <div class="reader-end glass"><div><b style="font-size:16px">Continue on ${esc(site)}</b><div class="muted" style="font-size:14px;margin-top:4px">Pictures, video and comments are on the original page.</div></div><a class="btn btn-dark" href="${esc(data.url || url)}" target="_blank" rel="noreferrer">Open original ↗</a></div>`;
}
function renderExtAside() {
  const host = $("#extAside"); if (!host) return;
  host.innerHTML = `<div class="aside-card glass"><div class="kicker">Raisina Wire analysis</div>${editions.slice(0, 4).map(x => `<a class="aside-link" href="${edHref(x)}"><span class="thumb">${img(x.image)}</span><span><b>${esc(x.title)}</b></span></a>`).join("")}</div>
  <div class="aside-card glass"><div class="kicker" style="color:var(--muted)">Latest on the wire</div>${wireItems().slice(0, 5).map(wireLink).join("") || wireEmpty()}</div>`;
}

/* ---------- Live ---------- */
const CATS = ["All", "India", "Security", "Diplomacy", "Markets", "Energy", "World"];
function viewLive(r) {
  const cat = CATS.includes(r.arg) ? r.arg : "All";
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker" style="display:flex;align-items:center;gap:8px"><span class="dot-live"></span>Live wire</div><h1>${cat === "All" ? "Latest from the wire" : cat}</h1><p>Headlines from named publishers, newest first. Open any story in the reader, with a link to the original.</p></div><span class="muted" id="liveUpdated" style="font-size:13px"></span></div>
    <div class="chips" style="margin-top:20px">${CATS.map(c => `<a class="chip" href="#/live${c === "All" ? "" : `/${c}`}" aria-pressed="${c === cat}">${c}</a>`).join("")}</div>
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
function viewSaved() {
  const saved = store.get("rw-saved", []);
  $("#view").innerHTML = `<div class="wrap"><div class="page-head"><div><div class="kicker">Saved</div><h1>Saved for later</h1><p>Stories you save are kept on this device.</p></div></div>
  <div class="live-list">${saved.length ? saved.map(s => `<a class="live-item glass" href="${esc(s.href)}" style="grid-template-columns:88px minmax(0,1fr)"><span class="when">${ago(s.savedAt)}</span><span><b>${esc(s.title)}</b><span class="src">${esc(s.source)}</span></span></a>`).join("") : `<div class="empty">Nothing saved yet. Use Save in the reader to keep a story here.</div>`}</div></div>`;
}
function viewSearch(r) {
  const q = (r.params.get("q") || "").trim(), ql = q.toLowerCase();
  const eds = editions.filter(e => `${e.title} ${e.dek} ${e.topic}`.toLowerCase().includes(ql));
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
  if (a === "back") { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = "#/"); }
  if (a === "text-smaller") setTextScale(-0.08);
  if (a === "text-larger") setTextScale(0.08);
  if (a === "save") { try { saveForLater(JSON.parse(el.dataset.item)); } catch { /* malformed */ } }
  if (a === "share") {
    const data = { title: el.dataset.title, url: location.href };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); toast("Link copied."); } } catch { /* cancelled */ }
  }
  if (a === "home-group") { state.homeGroup = el.dataset.group; renderHomeMarkets(); }
  if (a === "search") { const q = prompt("Search Raisina Wire and the live wire"); if (q?.trim()) location.hash = `#/search?q=${encodeURIComponent(q.trim())}`; }
  if (a === "discuss") { if (!state.user) { openAuth("register"); toast("Create a free account to start a discussion."); } else openDiscussionForm(); }
}

/* ---------- Data loading ---------- */
async function loadWire() {
  try {
    const r = await fetch("/api/wire"); if (!r.ok) throw new Error();
    state.wire = await r.json(); state.wireError = false;
    state.wire.items.forEach(i => wireIndex.set(i.url, i));
    $("#wireStatus").innerHTML = `<span class="dot-ok"></span>Live wire · ${state.wire.items.length} stories · updated ${clock(state.wire.updatedAt)} IST`;
  } catch {
    state.wireError = true;
    $("#wireStatus").innerHTML = `<span class="dot-live"></span>Live wire unavailable · retrying`;
  }
  renderRail(); renderTopicCols(); renderLiveList(); renderExtAside();
}
async function loadMarkets() {
  try { const r = await fetch("/api/markets"); if (!r.ok) throw new Error(); state.markets = await r.json(); state.marketsError = false; }
  catch { state.marketsError = true; }
  renderDock(); renderHomeMarkets(); renderBoard();
}
async function loadCommunity() {
  try { state.community = (await fetch("/api/community/posts").then(r => r.json())).posts || []; } catch { state.community = []; }
  try { state.events = (await fetch("/api/events").then(r => r.json())).events || []; } catch { state.events = []; }
  renderCommunity();
}

/* ---------- Accounts ---------- */
let authMode = "login";
function openAuth(mode = "register") { setAuthMode(mode); $("#modalBackdrop").classList.remove("hidden"); $("#authForm input[name=email]").focus(); }
function closeAuth() { $("#modalBackdrop").classList.add("hidden"); }
function setAuthMode(mode) {
  authMode = mode;
  $("#modalTitle").textContent = mode === "login" ? "Welcome back." : "Make the world make sense.";
  $("#nameField").classList.toggle("hidden", mode === "login");
  $("#nameField input").required = mode === "register";
  $("#authForm input[name=password]").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#authSubmit").textContent = mode === "login" ? "Sign in" : "Create free account";
  $("#authSwitchText").textContent = mode === "login" ? "New to Raisina Wire?" : "Already have an account?";
  $("#authSwitch").textContent = mode === "login" ? "Create an account" : "Sign in instead";
  $("#authMessage").textContent = "";
}
function showUser() {
  $("#signInBtn").textContent = state.user ? "Sign out" : "Sign in";
  $("#joinBtn").textContent = state.user ? state.user.displayName.split(" ")[0] : "Join free";
  if (state.user && ["admin", "editor"].includes(state.user.role) && !$("#adminLink")) {
    $(".utility-right").insertAdjacentHTML("afterbegin", `<a id="adminLink" class="text-btn" href="/admin.html" style="font-weight:700;padding:10px 6px">Control room</a>`);
  }
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
    else { state.user = d.user; showUser(); toast(`Welcome, ${d.user.displayName}.`); closeAuth(); }
  } catch (err) { $("#authMessage").textContent = err.message; }
  finally { $("#authSubmit").disabled = false; }
}
async function signOut() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* offline */ }
  state.user = null; $("#adminLink")?.remove(); showUser(); toast("Signed out.");
}
function openDiscussionForm() {
  const title = prompt("Discussion title (at least 5 characters)"); if (!title) return;
  const body = prompt("Your opening post (at least 10 characters)"); if (!body) return;
  const topic = prompt("Topic: Geopolitics, Security, Markets, India or General", "Geopolitics") || "General";
  fetch("/api/community/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body, topic }) })
    .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not post"); toast("Discussion sent for publishing."); loadCommunity(); })
    .catch(err => toast(err.message));
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
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); state.installPrompt = e; $("#installPill")?.classList.remove("hidden"); });
async function installPWA() {
  if (!state.installPrompt) return toast("On iPhone: tap Share, then Add to Home Screen.");
  state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $("#installPill").classList.add("hidden");
}
window.addEventListener("appinstalled", () => toast("Raisina Wire installed."));

/* ---------- Boot ---------- */
renderShell();
watchScroll();
window.addEventListener("hashchange", () => { document.title = "Raisina Wire — Ideas. Intelligence. Impact."; route(); });
route();
loadWire(); loadMarkets(); loadCommunity();
fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.user) { state.user = d.user; showUser(); } }).catch(() => {});
fetch("/api/config").then(r => r.json()).then(c => { if (c.linkedinUrl) $("#linkedinLink").href = c.linkedinUrl; }).catch(() => {});
setInterval(() => { if (!document.hidden) loadWire(); }, 120e3);
setInterval(() => { if (!document.hidden) loadMarkets(); }, 60e3);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadWire(); loadMarkets(); } });
window.addEventListener("online", () => { loadWire(); loadMarkets(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

// Shared by the control-room screens (producer, PCR, prompter, studio desk): the header with the
// full Rashtrix logo, the staff check, the language switch, a clock in India time and helpers.
import "./control.css";
// The control room is in English only (its words are not translated, and its numbers are
// Western digits); what goes on air stays in Bengali.
import { digits, setLang } from "./i18n.js";
export function englishOnly() { setLang("en"); document.documentElement.lang = "en"; document.documentElement.dataset.lang = "en"; }
englishOnly();
import { mountPhoneNav, foldPanels } from "./crmobile.js";

export const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export async function api(path, { method = "GET", body, raw } = {}) {
  const r = await fetch(path, { method, cache: "no-store", headers: body !== undefined && !raw ? { "content-type": "application/json" } : {}, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}
let toastTimer;
export function toast(msg, isErr = false) {
  let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.append(t); }
  t.textContent = msg; t.classList.toggle("err", isErr); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 2500);
}
export const fail = e => toast(e.message || String(e), true);
export const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
export const istClock = (t = Date.now(), sec = true) => new Date(t).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", ...(sec ? { second: "2-digit" } : {}) });
export const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);

const PAGES = [["/breaking.html", "Breaking desk"], ["/livefeed.html", "LiveFeed desk"], ["/headlines.html", "Headlines desk"], ["/liverundown.html", "Live Rundown"], ["/producer.html", "Producer"], ["/avodesk.html", "AVO desk"], ["/explainer.html", "Explainer desk"], ["/progdesk.html", "Segment & bulletin desk"], ["/library.html", "Content Library"], ["/adsdesk.html", "Ad library desk"], ["/oapdesk.html", "OAP desk"], ["/newsprint.html", "Newsprint desk"], ["/charter.html", "Editorial Charter"], ["/pcr.html", "PCR"], ["/studio.html", "Studio"], ["/onair.html", "On-air desk"], ["/prompter.html", "Prompter"], ["/admin.html", "Control room"]];
// Draws the header and checks the person is staff. Returns the user, or null (with a message).
export async function shell(title, { staff = true } = {}) {
  englishOnly();
  const head = document.createElement("header");
  head.className = "cr-head";
  head.innerHTML = `<a class="cr-brand cx-brand" href="/admin.html" aria-label="Control room · Calibrex"><img src="/partners/calibrex-mark.svg" alt="" width="26" height="26"><span class="cx-word">CALIBRE<span>X</span></span></a><h1>${esc(title)}</h1>
    <div class="cr-navw"><button class="cr-nb l" type="button" aria-label="Earlier desks" hidden>‹</button><nav class="cr-nav">${PAGES.map(([h, n]) => `<a href="${h}"${location.pathname.replace(/\.html$/, "") === h.replace(/\.html$/, "") ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav><button class="cr-nb r" type="button" aria-label="More desks" hidden>›</button></div>
    <span class="spacer"></span><span class="cr-clock" data-no-tr></span>`;
  document.body.prepend(head);
  // (the desk open now, in view in the line of desks)
  // The line of desks scrolls sideways: the mouse wheel, the arrows at its ends (shown when there
  // is more that way), a drag of the thin scrollbar, or a swipe.
  {
    const nav = head.querySelector(".cr-nav"), cur = nav?.querySelector("a[aria-current]"), [bl, br] = head.querySelectorAll(".cr-nb");
    const arrows = () => { bl.hidden = nav.scrollLeft < 4; br.hidden = nav.scrollLeft + nav.clientWidth > nav.scrollWidth - 4; };
    if (nav) {
      if (cur) nav.scrollLeft = cur.offsetLeft - nav.clientWidth / 2 + cur.offsetWidth / 2;
      nav.addEventListener("wheel", e => { if (nav.scrollWidth <= nav.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; e.preventDefault(); nav.scrollLeft += e.deltaY; }, { passive: false });
      nav.addEventListener("scroll", arrows, { passive: true });
      bl.onclick = () => nav.scrollBy({ left: -nav.clientWidth * 0.7, behavior: "smooth" });
      br.onclick = () => nav.scrollBy({ left: nav.clientWidth * 0.7, behavior: "smooth" });
      new ResizeObserver(arrows).observe(nav); arrows();
    }
  }
  const clock = $(".cr-clock", head);
  const tick = () => { clock.textContent = `${digits(istClock())} IST`; };
  tick(); setInterval(tick, 1000);
  if (!staff) return null;
  const me = await api("/api/auth/me").catch(() => ({}));
  // On a phone: the bottom tab bar and the menu of every screen (with the language switch), and
  // panels that fold. (The prompter is full screen: no tab bar.)
  if (location.pathname !== "/prompter.html") {
    const nav = mountPhoneNav({ owner: !!me.user?.owner, hidden: me.user?.role === "admin" ? [] : ["members", "sales", "social"] });
    const main = $("main"); if (main) foldPanels(main);
  }
  if (!me.user || !["admin", "editor"].includes(me.user.role)) {
    const main = $("main"); if (main) main.innerHTML = `<div class="cr-denied"><h2>Sign in first</h2><p>This screen is for the Rashtrix newsroom (editors and administrators). Sign in on the website with your newsroom account, then open this page again.</p><p><a href="/en/">Go to sign in</a></p></div>`;
    return null;
  }
  return me.user;
}
// Seconds ↔ "m:ss".
export const fmt = s => { s = Math.round(Math.abs(Number(s) || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(x).padStart(2, "0")}`; };
export const parseTime = v => { const p = String(v || "").trim().split(":").map(Number); if (p.some(isNaN)) return 0; return p.reduce((a, x) => a * 60 + x, 0); };
// Print a document (the browser's own PDF): Bengali is shaped correctly because the browser draws it.
export function printDoc(title, html) {
  let box = $(".print-only"); if (!box) { box = document.createElement("div"); box.className = "print-only"; document.body.append(box); }
  box.innerHTML = `<header><h1>${esc(title)}</h1><img src="/brand/logo-sm.webp" alt="Rashtrix 24×7 News"></header>${html}<p style="font-size:8pt;color:#666;margin-top:14px">Rashtrix 24×7 News · ${esc(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</p>`;
  const img = $("img", box);
  const go = () => { const old = document.title; document.title = title; window.print(); document.title = old; };
  img.complete ? go() : (img.onload = img.onerror = go);
}

// Bengali first, then English and Hindi. Bengali lives at the bare addresses (/, /article/…);
// English at /en/…, Hindi at /hi/…, so search engines index each and shared links open in the
// reader's language. The interface is written in English in the code and translated as it is
// drawn: every text, label and placeholder is looked up in the dictionary for the language
// (src/i18n/bn.js, src/i18n/hi.js). Stories come in their own language from the server.

export const LANGUAGES = {
  bn: { name: "বাংলা", short: "বাং", locale: "bn-IN" },
  en: { name: "English", short: "EN", locale: "en-IN" },
  hi: { name: "हिन्दी", short: "हिं", locale: "hi-IN" }
};
export const DEFAULT_LANG = "bn";
const PREFIX = /^\/(en|hi)(?=\/|$)/;
export const langOf = path => path.match(PREFIX)?.[1] || DEFAULT_LANG;
export const lang = langOf(location.pathname);
export const LOCALE = LANGUAGES[lang].locale;
export const stripLang = path => path.replace(PREFIX, "") || "/";
const isAppPath = href => href.startsWith("/") && !href.startsWith("//") && !/^\/(api|admin|media|cdn-cgi)(\/|$)|\.(html|xml|txt|json|js|css|webmanifest|jpe?g|png|gif|avif|webp|svg|ico|pdf|ics|mp3)(\?|#|$)/i.test(href);
// "/article/x" -> "/en/article/x" while reading in English.
export function withLang(href, l = lang) {
  if (typeof href !== "string" || !isAppPath(href)) return href;
  const [path, rest = ""] = href.split(/(?=[?#])/);
  const bare = stripLang(path);
  return l === DEFAULT_LANG ? bare + rest : `/${l}${bare === "/" ? "" : bare}${rest}`;
}

let dict = new Map(), patterns = [];
const norm = s => s.replace(/\s+/g, " ").trim();
// Development aid: with localStorage "rw-i18n-collect" set, the English site records every
// interface string it draws in window.__i18nSeen, to find strings missing from the dictionaries.
const COLLECT = lang === "en" && (() => { try { return !!localStorage.getItem("rw-i18n-collect"); } catch { return false; } })();
if (COLLECT) window.__i18nSeen = new Set();
// Translate one interface string (English when there is no entry).
export function tr(s) {
  if (s == null || (lang === "en" && !COLLECT)) return s;
  const str = String(s), key = norm(str);
  if (!key || !/[A-Za-z]/.test(key)) return s;
  if (COLLECT) { window.__i18nSeen.add(key); return s; }
  const out = lookup(key);
  if (out === undefined) { if (!/[\u0900-\u09FF]/.test(key)) (window.__i18nMissing ||= new Set()).add(key); return s; }
  return str.match(/^\s*/)[0] + out + str.match(/\s*$/)[0]; // keep surrounding spaces
}
function lookup(key) {
  const hit = dict.get(key);
  if (hit !== undefined) return hit;
  for (const [re, fn] of patterns) { const m = key.match(re); if (m) { const r = fn(m, x => lookup(x) ?? x); if (r !== undefined) return r; } }
  // Arrows and signs around a known phrase: "All stories →", "← Back", "+ Follow", "Loading…"
  const deco = key.match(/^(← |\+ )?(.+?)( →| ↗| ↓|…)?$/);
  if (deco && (deco[1] || deco[3])) { const inner = lookup(deco[2]); if (inner !== undefined) return (deco[1] || "") + inner + (deco[3] || ""); }
  // Lines made of parts: "Security · Asha Rao · 1 reply · 2 min ago"
  if (key.includes("·")) {
    const parts = key.split(/\s*·\s*/);
    let any = false;
    const done = parts.map(p => { if (!p || !/[A-Za-z]/.test(p)) return p; const r = lookup(p); if (r !== undefined) { any = true; return r; } return p; });
    if (any) return done.join(" · ").trim();
  }
  return undefined;
}
// Numbers in the reader's script (Bengali uses its own digits).
export const digits = n => lang === "bn" ? String(n).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]) : String(n);
export function ago(iso) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  const T = AGO[lang];
  if (m < 1) return T.now;
  if (m < 60) return T.min(digits(m));
  if (m < 1440) return T.hour(digits(Math.floor(m / 60)));
  return new Date(iso).toLocaleDateString(LOCALE, { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}
const AGO = {
  en: { now: "just now", min: n => `${n} min ago`, hour: n => `${n} h ago` },
  hi: { now: "अभी-अभी", min: n => `${n} मिनट पहले`, hour: n => `${n} घंटे पहले` },
  bn: { now: "এইমাত্র", min: n => `${n} মিনিট আগে`, hour: n => `${n} ঘণ্টা আগে` }
};

/* ---------- Drawing the interface in the reader's language ---------- */
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);
const ATTRS = ["placeholder", "aria-label", "title", "data-tip"];
const skipped = el => el.closest?.("[data-no-tr], [contenteditable]");
function translateNode(node) {
  if (node.nodeType === 3) {
    const p = node.parentElement;
    if (!p || SKIP.has(p.tagName) || skipped(p)) return;
    const out = tr(node.nodeValue); if (out !== node.nodeValue) node.nodeValue = out;
    return;
  }
  if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
  if (skipped(node)) { // content left as it is, but its links stay in the reader's language
    for (const a of [node, ...node.querySelectorAll("a[href]")]) if (a.tagName === "A") localiseHref(a);
    return;
  }
  translateAttrs(node);
  for (const el of node.querySelectorAll("*")) translateAttrs(el);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) translateNode(t);
}
function localiseHref(a) {
  const h = a.getAttribute("href");
  if (h && !a.hasAttribute("data-lang")) { const out = withLang(h); if (out !== h) a.setAttribute("href", out); }
}
function translateAttrs(el) {
  if (el.tagName === "A") localiseHref(el);
  if (el.closest("[data-no-tr]")) return;
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const out = tr(v); if (out !== v) el.setAttribute(a, out); } }
  if (el.tagName === "INPUT" && /^(submit|button)$/i.test(el.type) && el.value) el.value = tr(el.value);
}
export function startTranslator(root = document.body) {
  if (lang === "en" && !COLLECT) return;
  translateNode(root);
  const title = document.querySelector("title");
  const doTitle = () => { const parts = document.title.split(" · "); const out = parts.map(p => tr(p)).join(" · "); if (out !== document.title) document.title = out; };
  doTitle();
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === "childList") m.addedNodes.forEach(translateNode);
      else if (m.type === "characterData") translateNode(m.target);
      else if (m.type === "attributes") translateAttrs(m.target);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, "href"] });
  if (title) new MutationObserver(doTitle).observe(title, { childList: true, characterData: true, subtree: true });
}

// Load the dictionary and fonts for the language, and mark the page with it.
export async function loadLanguage() {
  document.documentElement.lang = lang === "en" ? "en-IN" : LOCALE;
  document.documentElement.dataset.lang = lang;
  if (lang === "en") return;
  // Bengali fonts load with the page (index.html); Hindi adds its own.
  if (lang === "hi") {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi:ital@0;1&family=Hind:wght@400;500;600;700&display=swap";
    document.head.append(link);
  }
  const mod = await (lang === "hi" ? import("./i18n/hi.js") : import("./i18n/bn.js"));
  dict = new Map(Object.entries(mod.default).map(([k, v]) => [norm(k), v]));
  patterns = mod.patterns || [];
}

// The language menu: same page, other language.
export function languageLinks(cls = "lang-link") {
  const here = stripLang(location.pathname) + location.search;
  return Object.entries(LANGUAGES).map(([l, x]) => `<a class="${cls}" href="${withLang(here, l)}" data-lang="${l}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ""}>${x.name}</a>`).join("");
}

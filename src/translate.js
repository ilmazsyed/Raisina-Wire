// Other-language versions of stories and site pages. A story is written in one language (its
// `lang`, Bengali by default); versions in the other two are kept in D1 (`translations`) and
// shown when the reader switches language. Where there is none, the original is shown with a
// note. Site pages are written in English (src/legal.js) with Bengali and Hindi versions.
import { ABOUT, LEGAL } from "./legal.js";
import { textHash } from "./store.js";

export const LANGS = ["bn", "en", "hi"];
export const PAGE_LANGS = ["bn", "hi"];   // site pages are written in English
export const isLang = l => LANGS.includes(l);

/* ---------- Site pages: About and the legal pages ---------- */
export const PAGES = { about: ABOUT, ...LEGAL };
const pageVers = new Map();
export async function pageVer(key) {
  if (!pageVers.has(key)) pageVers.set(key, await textHash({ title: PAGES[key].title, body: PAGES[key].html }));
  return pageVers.get(key);
}

/* ---------- Reading translations ---------- */
// src_ver records which English text a translation was written from, so the control room can
// say when the English has changed since; the translation stays on the site until it is updated.
export async function articleTranslations(env, lang, articles) {
  if (!isLang(lang) || !articles.some(a => (a.lang || "bn") !== lang)) return new Map();
  const ids = articles.filter(a => (a.lang || "bn") !== lang).map(a => a.id);
  const results = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    results.push(...(await env.DB.prepare(`SELECT ref,src_ver,title,dek,topic,hero_caption,tags,body,model FROM translations WHERE kind='article' AND lang=? AND title<>'' AND ref IN (${chunk.map(() => "?").join(",")})`).bind(lang, ...chunk).all()).results);
  }
  const byId = new Map(results.map(r => [r.ref, r])), out = new Map();
  for (const a of articles) { const t = byId.get(a.id); if (t) out.set(a.id, t); }
  return out;
}
export function overlay(a, t, lang) {
  const own = a.lang || "bn";
  if (!t || own === lang) return { ...a, lang: own, original: own };
  let tagLabels = []; try { tagLabels = JSON.parse(t.tags || "[]"); } catch { /* keep English */ }
  const out = { ...a, title: t.title, dek: t.dek, topic: t.topic || a.topic, heroCaption: t.hero_caption || a.heroCaption, lang, original: own, machine: t.model === "gemini" || t.model === "indictrans2",
    tagLabels: (a.tags || []).map((x, i) => tagLabels[i] || x) };
  if (a.body !== undefined) out.body = t.body;
  return out;
}
export async function localiseArticles(env, lang, articles) {
  const map = await articleTranslations(env, lang, articles);
  return articles.map(a => overlay(a, map.get(a.id), lang));
}
export async function localisePage(env, lang, key) {
  const page = PAGES[key];
  if (!page || !PAGE_LANGS.includes(lang)) return { ...page, lang: "en" };
  const t = await env.DB.prepare("SELECT src_ver,title,body FROM translations WHERE kind='page' AND ref=? AND lang=? AND title<>''").bind(key, lang).first().catch(() => null);
  if (t) return { ...page, title: t.title, html: t.body, lang };
  // The Bengali versions bundled in src/legal.js.
  if (page[lang]) return { ...page, title: page[lang].title, html: page[lang].html, lang };
  return { ...page, lang: "en" };
}

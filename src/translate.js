// Hindi and Bengali editions of stories and site pages. The editor writes them in the control
// room, next to the English (the story editor's हिन्दी and বাংলা tabs, or Translations for the
// About and legal pages). They are kept in D1 and shown when the reader switches language;
// where there is none, the English is shown with a note.
import { ABOUT, LEGAL } from "./legal.js";
import { textHash } from "./store.js";

export const LANGS = ["hi", "bn"];
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
  if (!isLang(lang) || !articles.length) return new Map();
  const { results } = await env.DB.prepare("SELECT ref,src_ver,title,dek,topic,hero_caption,tags,body FROM translations WHERE kind='article' AND lang=? AND title<>''").bind(lang).all();
  const byId = new Map(results.map(r => [r.ref, r])), out = new Map();
  for (const a of articles) { const t = byId.get(a.id); if (t) out.set(a.id, t); }
  return out;
}
export function overlay(a, t, lang) {
  if (!t) return { ...a, lang: "en" };
  let tagLabels = []; try { tagLabels = JSON.parse(t.tags || "[]"); } catch { /* keep English */ }
  const out = { ...a, title: t.title, dek: t.dek, topic: t.topic || a.topic, heroCaption: t.hero_caption || a.heroCaption, lang,
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
  if (!page || !isLang(lang)) return { ...page, lang: "en" };
  const t = await env.DB.prepare("SELECT src_ver,title,body FROM translations WHERE kind='page' AND ref=? AND lang=? AND title<>''").bind(key, lang).first().catch(() => null);
  return t ? { ...page, title: t.title, html: t.body, lang } : { ...page, lang: "en" };
}

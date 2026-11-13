// The share card: the picture a story shows when it is shared on WhatsApp, Facebook or X. A
// 1200×630 card with the story's photo (or, for wire copy and stories without one, its desk's
// colours), the headline in its own script, the desk and the full Rashtrix logo.
//
// Social apps need a real picture (not HTML or SVG), and Bengali needs proper shaping, so the
// card is drawn as a web page (/og/card/<slug>) and photographed once by Cloudflare's headless
// browser (Browser Rendering, free tier) from the minute cron. The JPEG is kept in D1 and served
// at /og/<slug>.jpg; until it exists that address sends the story's photo or the site card.
import puppeteer from "@cloudflare/puppeteer";
import { getBySlug, isPublic } from "./store.js";

import { cardHTML, siteCardHTML } from "./ogcard-html.js";
import { bulletinRank } from "./labels.js";

// ---- The site's own card (/og/site.jpg): Rashtrix TV live as the hero, with what is on now. It
// is the picture for the home page, the desks, Watch and every page without its own card.
const SITE_SLUG = "__site";
async function siteData(env) {
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { results } = await env.DB.prepare("SELECT title, dek, category, published_at FROM articles WHERE status='published' AND lang='bn' AND pulled_at IS NULL AND published_at>=? AND published_at<=? ORDER BY published_at DESC LIMIT 40")
    .bind(since, new Date().toISOString()).all().catch(() => ({ results: [] }));
  // The top headlines in the channel's order (West Bengal politics first), newest first within it.
  const heads = results.map(r => ({ t: r.title, p: bulletinRank(r.category, `${r.title} ${r.dek || ""}`), at: r.published_at }))
    .sort((a, b) => a.p - b.p || String(b.at).localeCompare(String(a.at))).map(x => x.t).slice(0, 3);
  // On the screen: the newest AVO story's first checked photo, else the studio.
  const avo = await env.DB.prepare("SELECT article_id FROM avo_stories WHERE status='ready' AND json_array_length(images)>0 AND published_at>=? ORDER BY published_at DESC LIMIT 1").bind(since).first().catch(() => null);
  return { headlines: heads, photo: avo ? `/api/tv/aimg/${encodeURIComponent(avo.article_id)}/0` : "/brand/studio-wide.webp" };
}
// The card's version (its time), for the address pages give it: share previews are cached by
// address, so a new picture gets a new one.
export async function siteCardVersion(env) {
  const r = await env.DB.prepare("SELECT created_at FROM og_cards WHERE slug=?").bind(SITE_SLUG).first().catch(() => null);
  return r ? String(Math.floor(Date.parse(r.created_at) / 1000) || "") : "";
}
// The cron: the card is drawn again when the top headline changes (at most every 20 minutes).
export async function renderSiteCard(env, origin) {
  if (!env.BROWSER || !origin) return { skipped: true };
  const rest = await env.DB.prepare("SELECT value FROM settings WHERE key='og_rest_until'").first().catch(() => null);
  if (rest && Date.parse(rest.value) > Date.now()) return { resting: rest.value };
  const d = await siteData(env), key = (d.headlines[0] || "-") + "|" + d.photo;
  const row = await env.DB.prepare("SELECT title, created_at FROM og_cards WHERE slug=?").bind(SITE_SLUG).first().catch(() => null);
  if (row && (row.title === key || Date.now() - Date.parse(row.created_at) < 20 * 60e3)) return { kept: true };
  const made = await renderSlugs(env, origin, [{ slug: SITE_SLUG, title: key }]);
  return { done: !!made[0] };
}

// /og/card/<slug> (the page to photograph) and /og/<slug>.jpg (the picture). A card that has
// not been made yet is made on the spot when it is first asked for (a share, or WhatsApp
// fetching the preview); if that fails, the story's photo or the site card is sent as a picture
// (not a redirect, which some apps do not follow).
export async function ogRoute(url, env, ctx) {
  if (url.pathname === `/og/card/${SITE_SLUG}`) {
    return new Response(siteCardHTML({ ...await siteData(env), at: Date.now() }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  if (url.pathname === "/og/site.jpg") {
    const row = await env.DB.prepare("SELECT img FROM og_cards WHERE slug=?").bind(SITE_SLUG).first().catch(() => null);
    if (row?.img) return new Response(new Uint8Array(row.img), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=900" } });
    const site = await env.ASSETS.fetch(new Request(new URL("/og-image.jpg", url.origin)));
    return new Response(site.body, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=600" } });
  }
  const m = url.pathname.match(/^\/og\/card\/([^/]+)$/);
  if (m) {
    const a = await getBySlug(env, decodeURIComponent(m[1]));
    if (!isPublic(a)) return new Response("Not found", { status: 404 });
    return new Response(cardHTML(a), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  const j = url.pathname.match(/^\/og\/([^/]+)\.jpg$/);
  if (!j) return null;
  const slug = decodeURIComponent(j[1]);
  const jpeg = (bytes, age = 86400) => new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": `public, max-age=${age}` } });
  const row = await env.DB.prepare("SELECT img FROM og_cards WHERE slug=?").bind(slug).first().catch(() => null);
  if (row?.img) return jpeg(new Uint8Array(row.img));
  const a = await getBySlug(env, slug).catch(() => null);
  if (isPublic(a) && env.BROWSER) {
    const made = await renderSlugs(env, url.origin, [{ slug: a.slug, title: a.title }]).catch(() => null);
    if (made?.[0]) return jpeg(made[0]);
  }
  // Not possible now: the story's photo, else the site card, as a picture.
  try {
    if (a?.image) { const r = await fetch(new URL(a.heroUrl || a.image, url.origin)); if (r.ok) return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=600" } }); }
  } catch { /* fall through */ }
  const site = await env.ASSETS.fetch(new Request(new URL("/og-image.jpg", url.origin)));
  return new Response(site.body, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=600" } });
}

// Photographs the cards of the given stories in one browser session; returns their JPEGs.
async function renderSlugs(env, origin, rows) {
  const browser = await puppeteer.launch(env.BROWSER), out = [], now = new Date().toISOString();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    for (const r of rows) {
      try {
        await page.goto(`${origin}/og/card/${encodeURIComponent(r.slug)}`, { waitUntil: "networkidle0", timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        const shot = await page.screenshot({ type: "jpeg", quality: 84 });
        const bytes = shot instanceof Uint8Array ? shot : new Uint8Array(shot);
        await env.DB.prepare("INSERT INTO og_cards (slug,title,img,created_at) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,img=excluded.img,created_at=excluded.created_at")
          .bind(r.slug, r.title, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), now).run();
        out.push(bytes);
      } catch (e) { console.error("og card", r.slug, e?.message || e); out.push(null); }
    }
  } finally { await browser.close().catch(() => {}); }
  return out;
}

// The minute cron: cards for stories published in the last two hours that have none (or whose
// headline changed). The window is kept short on purpose: every row the query passes counts
// against D1's free daily allowance of rows read, and a month-long scan every minute used it up
// and took the site down. Older stories get their card on demand, the first time it is asked
// for (ogRoute). A run that cannot open the browser (daily allowance used) rests for an hour.
export async function renderCards(env, origin, n = 3) {
  if (!env.BROWSER || !origin) return { done: 0, skipped: !env.BROWSER ? "no browser binding" : "no site address" };
  const rest = await env.DB.prepare("SELECT value FROM settings WHERE key='og_rest_until'").first().catch(() => null);
  if (rest && Date.parse(rest.value) > Date.now()) return { done: 0, resting: rest.value };
  const now = new Date(), since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const { results } = await env.DB.prepare(`SELECT a.slug, a.title FROM articles a LEFT JOIN og_cards c ON c.slug=a.slug
    WHERE a.status='published' AND a.published_at<=? AND a.published_at>=? AND (c.slug IS NULL OR c.title<>a.title)
    ORDER BY a.published_at DESC LIMIT ?`).bind(now.toISOString(), since, n).all();
  if (!results.length) return { done: 0 };
  let made;
  try { made = await renderSlugs(env, origin, results); }
  catch (e) {
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('og_rest_until',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(new Date(Date.now() + 3600e3).toISOString()).run().catch(() => {});
    throw e;
  }
  return { done: made.filter(Boolean).length };
}

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

import { cardHTML } from "./ogcard-html.js";

// /og/card/<slug> (the page to photograph) and /og/<slug>.jpg (the picture).
export async function ogRoute(url, env) {
  const m = url.pathname.match(/^\/og\/card\/([^/]+)$/);
  if (m) {
    const a = await getBySlug(env, decodeURIComponent(m[1]));
    if (!isPublic(a)) return new Response("Not found", { status: 404 });
    return new Response(cardHTML(a), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  const j = url.pathname.match(/^\/og\/([^/]+)\.jpg$/);
  if (!j) return null;
  const slug = decodeURIComponent(j[1]);
  const row = await env.DB.prepare("SELECT img FROM og_cards WHERE slug=?").bind(slug).first().catch(() => null);
  if (row?.img) return new Response(new Uint8Array(row.img), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  // Not made yet: the story's photo, or the site's card.
  const a = await getBySlug(env, slug).catch(() => null);
  const to = a?.image ? new URL(a.heroUrl || a.image, url.origin).href : `${url.origin}/og-image.jpg`;
  return Response.redirect(to, 302);
}

// The minute cron: cards for the newest stories that have none (or whose headline changed).
// A few at a time, inside the free browser allowance (ten minutes a day).
export async function renderCards(env, origin, n = 3) {
  if (!env.BROWSER || !origin) return { done: 0, skipped: !env.BROWSER ? "no browser binding" : "no site address" };
  const now = new Date(), since = new Date(Date.now() - 3 * 864e5).toISOString();
  const { results } = await env.DB.prepare(`SELECT a.slug, a.title FROM articles a LEFT JOIN og_cards c ON c.slug=a.slug
    WHERE a.status='published' AND a.published_at<=? AND a.published_at>=? AND (c.slug IS NULL OR c.title<>a.title)
    ORDER BY a.published_at DESC LIMIT ?`).bind(now.toISOString(), since, n).all();
  if (!results.length) return { done: 0 };
  const browser = await puppeteer.launch(env.BROWSER);
  let done = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    for (const r of results) {
      try {
        await page.goto(`${origin}/og/card/${encodeURIComponent(r.slug)}`, { waitUntil: "networkidle0", timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        const shot = await page.screenshot({ type: "jpeg", quality: 84 });
        const bytes = shot instanceof Uint8Array ? shot : new Uint8Array(shot);
        await env.DB.prepare("INSERT INTO og_cards (slug,title,img,created_at) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,img=excluded.img,created_at=excluded.created_at")
          .bind(r.slug, r.title, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), now.toISOString()).run();
        done++;
      } catch (e) { console.error("og card", r.slug, e?.message || e); }
    }
  } finally { await browser.close().catch(() => {}); }
  return { done };
}

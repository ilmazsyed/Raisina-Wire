// Articles and editions as stored in D1, shared by the API (worker.js) and the HTML pages (seo.js).
import { WRITERS, DEFAULT_WRITER, writer } from "./writers.js";

export const ARTICLE_COLS = "id,slug,kind,title,dek,topic,category,status,image_url,hero_url,hero_caption,source_url,published_at,updated_at,writer,tags,alert_state,length(body) AS body_length";
export const storyPath = row => `/${row.kind === "edition" ? "edition" : "article"}/${encodeURIComponent(row.slug)}`;
export const readMinutes = chars => Math.max(2, Math.round((chars || 0) / 1300));

// Category artwork used when a story has no image of its own.
const GENERIC = { security: "security", diplomacy: "diplomacy", markets: "markets", india: "india", energy: "energy" };
export const genericImage = category => `/editions/generic-${GENERIC[String(category || "").toLowerCase()] || "analysis"}.webp`;

export function toArticle(row, { body = false } = {}) {
  const w = writer(row.writer);
  const out = {
    id: row.id, slug: row.slug, kind: row.kind || "article", href: storyPath(row),
    title: row.title, dek: row.dek || "", topic: row.topic || row.category, category: row.category,
    imageUrl: row.image_url || "", heroUrl: row.hero_url || "", heroCaption: row.hero_caption || "",
    image: row.image_url || row.hero_url || genericImage(row.category),
    sourceUrl: row.source_url || "", publishedAt: row.published_at, updatedAt: row.updated_at,
    writer: w.key, author: w.name, status: row.status, tags: splitTags(row.tags), alertState: row.alert_state || "",
    scheduled: row.status === "published" && !!row.published_at && row.published_at > new Date().toISOString(),
    bodyLength: row.body_length ?? (row.body || "").length, readMinutes: readMinutes(row.body_length ?? (row.body || "").length)
  };
  if (body) out.body = row.body || "";
  return out;
}

export function splitTags(v) {
  const seen = new Map(); // case-insensitive: "Navy" and "navy" are one tag
  for (const t of String(v || "").split(",").map(x => x.trim().replace(/\s+/g, " ")).filter(Boolean)) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].slice(0, 12);
}
export const tagSlug = t => String(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Public = published and not scheduled for later.
export const isPublic = a => a && a.status === "published" && !a.scheduled;

export async function listPublished(env, { limit = 200, writerKey = null, since = null, tag = null } = {}) {
  let sql = `SELECT ${ARTICLE_COLS} FROM articles WHERE status='published' AND published_at<=?`;
  const args = [new Date().toISOString()];
  if (tag) { sql += " AND (','||lower(replace(tags,', ',','))||',') LIKE ?"; args.push(`%,${String(tag).toLowerCase()},%`); }
  if (writerKey) { sql += " AND writer=?"; args.push(writerKey); }
  if (since) { sql += " AND published_at>=?"; args.push(since); }
  sql += " ORDER BY published_at DESC LIMIT ?"; args.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return results.map(r => toArticle(r));
}

export async function getBySlug(env, slug) {
  const row = await env.DB.prepare(`SELECT ${ARTICLE_COLS},body FROM articles WHERE slug=?`).bind(slug).first();
  return row ? toArticle(row, { body: true }) : null;
}

// Story text: blank lines separate paragraphs; "## " starts a heading; "- " lines are bullets;
// "1. " lines are numbered points. Same rules as the site's reader.
export function textBlocks(text) {
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

// Edition blocks ({t:"p"|"h"|"li", x}) as CMS text, so editions edit like any article.
export function blocksToText(blocks) {
  const out = []; let list = [];
  const flush = () => { if (list.length) { out.push(list.join("\n")); list = []; } };
  for (const b of blocks || []) {
    if (b.t === "li") { list.push(`- ${b.x}`); continue; }
    flush();
    out.push(b.t === "h" ? `## ${b.x}` : b.x);
  }
  flush();
  return out.join("\n\n");
}

export { WRITERS, DEFAULT_WRITER, writer };

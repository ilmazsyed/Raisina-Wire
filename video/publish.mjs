#!/usr/bin/env node
// Register the two outputs of the Raisina Wire explainer engine in Watch.
// The horizontal master becomes a video; the vertical cut becomes a Short linked to it.
// Both are drafts by default. Use --status published only after editorial approval.
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [slug, ...args] = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const fail = message => { console.error(`Error: ${message}`); process.exit(1); };
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail("Usage: npm run video:publish -- <slug> [--status draft|published] [--title \"Headline\"] [--category Geopolitics]");
}
const status = option("status", "draft");
if (!["draft", "published"].includes(status)) fail("--status must be draft or published.");
const root = resolve("public/videos");
const files = {
  landscape: resolve(root, `${slug}-16x9.mp4`),
  vertical: resolve(root, `${slug}-9x16.mp4`),
  landscapePoster: resolve(root, `${slug}-16x9.jpg`),
  verticalPoster: resolve(root, `${slug}-9x16.jpg`)
};
for (const [name, file] of Object.entries(files)) {
  if (!existsSync(file) || statSync(file).size === 0) fail(`Missing ${name} output: ${file}`);
}
const specPath = resolve("video/scripts", `${slug}.json`);
let spec = {};
if (existsSync(specPath)) spec = JSON.parse(readFileSync(specPath, "utf8"));
const title = option("title", spec.title || slug.replace(/-/g, " "));
const category = option("category", "Geopolitics");
const description = option("description", spec.series ? `${spec.series} · Raisina Wire` : "Raisina Wire explainer");
const site = (process.env.RW_SITE || "https://raisinawire.calibrex.org").replace(/\/+$/, "");
const token = process.env.RW_PUBLISH_TOKEN;
if (!token) fail("RW_PUBLISH_TOKEN is not set.");
async function api(method, path, body) {
  const response = await fetch(site + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = { error: raw.slice(0, 500) }; }
  if (!response.ok) fail(`${method} ${path} → HTTP ${response.status}: ${data.error || raw}`);
  return data;
}
async function create(mediaType, mediaUrl, thumbnailUrl, itemTitle, fullId = "") {
  return api("POST", "/api/admin/media", {
    title: itemTitle, mediaUrl, mediaType, category, thumbnailUrl, description,
    status, fullId
  });
}
console.log(`Registering ${slug} on ${site} as ${status}…`);
const video = await create("video", `/videos/${slug}-16x9.mp4`, `/videos/${slug}-16x9.jpg`, title);
const short = await create("short", `/videos/${slug}-9x16.mp4`, `/videos/${slug}-9x16.jpg`, `${title} · Short`, video.id);
if (short.id && video.id) {
  // Older Worker versions may ignore fullId on create; set it explicitly and safely.
  await api("PUT", `/api/admin/media/${encodeURIComponent(short.id)}`, { fullId: video.id });
}
console.log(JSON.stringify({
  status,
  video: { id: video.id, title, url: `${site}/watch` },
  short: { id: short.id, title: `${title} · Short`, linkedTo: video.id, url: `${site}/watch` }
}, null, 2));

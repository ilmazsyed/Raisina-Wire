// Rashtrix TV, Phase 2: two channels, each on or off, each with its own secret output address
// for OBS / vMix.
//   h  horizontal 1920×1080: long videos, with the full designable jacket (bug, LIVE, clock,
//      lower third, ad box, ticker), the L-band, full-screen breaking with music, and News
//      Update / Bulletin packages made from the latest Rashtrix headlines.
//   v  vertical 1080×1920: Shorts (they carry their own jacket; our graphics stay in its safe
//      zones), app-made items in an app-drawn jacket in the same positions, and full-screen 9:16
//      promo cards with their own repeat rule.
// Every viewer and output computes the same running order from the channel's clock (epoch), so
// the app's player and the OBS output show the same thing at the same moment. Control changes
// (on/off, break-in, live on air, L-band) reach every screen within about five seconds.
import { listPublished } from "./store.js";
import { localiseArticles } from "./translate.js";

export const CHANNELS = ["h", "v"];
const SHORT_MAX = 180;          // seconds: a Short (vertical channel)
const LONG_MIN = 61;            // seconds: the horizontal channel skips Shorts
const now = () => new Date().toISOString();
const randomKey = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 28);

const DEFAULTS = {
  h: { on: true, key: "", newsEvery: 3, sets: 3, setSeconds: 7, lowerThird: "", lband: { on: false, text: "" }, breaking: null,
    ticker: [], ad: { image: "", line1: "YOUR AD HERE", line2: "ADVERTISE WITH RASHTRIX", line3: "DM OR MAIL: CONTACT@RASHTRIX.IN" }, epoch: 0 },
  v: { on: true, key: "", newsEvery: 0, sets: 2, setSeconds: 6, promosOn: true, promoEvery: 3, band: "", breaking: null,
    ticker: [], ad: { image: "", line1: "YOUR AD HERE", line2: "ADVERTISE WITH RASHTRIX", line3: "DM OR MAIL: CONTACT@RASHTRIX.IN" }, epoch: 0 }
};

export async function tvSettings(env, ch) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(`tv:${ch}`).first();
  let s = {}; try { s = JSON.parse(row?.value || "{}"); } catch { /* defaults */ }
  const out = { ...structuredClone(DEFAULTS[ch]), ...s, ad: { ...DEFAULTS[ch].ad, ...(s.ad || {}) } };
  if (!out.key || !out.epoch) {   // first use: a secret output key and the channel clock
    out.key ||= randomKey(); out.epoch ||= Date.now();
    await putSettings(env, ch, out);
  }
  return out;
}
async function putSettings(env, ch, s) {
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(`tv:${ch}`, JSON.stringify(s)).run();
}
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
export async function saveTvSettings(env, ch, b) {
  const s = await tvSettings(env, ch);
  if (b.on !== undefined) s.on = !!b.on;
  if (b.newsEvery !== undefined) s.newsEvery = int(b.newsEvery, 0, 20, s.newsEvery);
  if (b.sets !== undefined) s.sets = int(b.sets, 1, 5, s.sets);
  if (b.setSeconds !== undefined) s.setSeconds = int(b.setSeconds, 4, 20, s.setSeconds);
  if (b.lowerThird !== undefined) s.lowerThird = clean(b.lowerThird, 140);
  if (b.band !== undefined) s.band = clean(b.band, 80);
  if (b.lband !== undefined) s.lband = { on: !!b.lband?.on, text: clean(b.lband?.text, 160) };
  if (b.promosOn !== undefined) s.promosOn = !!b.promosOn;
  if (b.promoEvery !== undefined) s.promoEvery = int(b.promoEvery, 1, 20, s.promoEvery);
  if (Array.isArray(b.ticker)) s.ticker = b.ticker.map(x => clean(x, 160)).filter(Boolean).slice(0, 20);
  if (b.ad) s.ad = { image: /^(https:\/\/|\/media\/|\/brand\/)/.test(b.ad.image || "") ? clean(b.ad.image, 1500) : "", line1: clean(b.ad.line1, 40), line2: clean(b.ad.line2, 60), line3: clean(b.ad.line3, 80) };
  // The studio's own stream for the app (OBS → the media server on the Oracle Cloud VM): HLS
  // (.m3u8) or WebRTC (WHEP). When set, the app plays it for live-studio segments instead of
  // pulling each guest, so the media relay carries only the studio.
  if (b.appStream !== undefined) { const u = clean(b.appStream, 500); s.appStream = /^https:\/\//.test(u) ? { url: u, kind: /\.m3u8(\?|$)/.test(u) ? "hls" : "whep" } : null; }
  // A change to what plays restarts the channel clock, so every screen picks up the new order.
  if (b.restart) s.epoch = Date.now();
  await putSettings(env, ch, s);
  return s;
}
export async function newOutputKey(env, ch) { const s = await tvSettings(env, ch); s.key = randomKey(); await putSettings(env, ch, s); return s.key; }
export async function setBreaking(env, ch, b) {
  const s = await tvSettings(env, ch);
  s.breaking = b?.clear ? null : { text: clean(b?.text, 160), at: now(), seconds: int(b?.seconds, 8, 60, 20), music: b?.music !== false };
  if (s.breaking && !s.breaking.text) throw new Error("Write the breaking headline.");
  await putSettings(env, ch, s);
  return s.breaking;
}

/* ---------- The Shorts tab: the vertical channel's YouTube Shorts, newest first ---------- */
export async function shortsList(env, limit = 60) {
  const { results } = await env.DB.prepare(`SELECT i.yt_id AS id, i.title, i.thumb, i.duration, i.published_at AS publishedAt FROM tv_items i JOIN tv_sources s ON s.id=i.source_id
    WHERE i.channel='v' AND i.excluded=0 AND i.playable=1 AND s.active=1 AND i.duration>0 AND i.duration<=${SHORT_MAX} ORDER BY i.published_at DESC LIMIT ?`).bind(limit).all();
  return results;
}

/* ---------- The running order ---------- */
async function playable(env, ch) {
  const { results } = await env.DB.prepare(`SELECT i.yt_id AS ytId, i.title, i.duration, i.thumb FROM tv_items i JOIN tv_sources s ON s.id=i.source_id
    WHERE i.channel=? AND i.excluded=0 AND i.playable=1 AND s.active=1 AND i.duration>0 ${ch === "v" ? `AND i.duration<=${SHORT_MAX}` : `AND i.duration>=${LONG_MIN}`}
    ORDER BY i.published_at DESC LIMIT 300`).bind(ch).all();
  return results;
}
export async function promos(env, all = false) {
  const { results } = await env.DB.prepare(`SELECT id,title,image_url AS image,seconds,active,sort FROM tv_promos ${all ? "" : "WHERE active=1"} ORDER BY sort, created_at`).all();
  return results;
}
// The running order (both channels):
// - videos newest first, on a loop; a newly sourced video restarts the loop (src/youtube.js);
// - a 10-second full-screen flash of the headlines (or the breaking story) after every video, so
//   two videos never play back to back; vertical promo cards keep their own repeat rule;
// - a stinger, picked at random but the same on every screen, on about one change in three;
// - at the top of every hour and at every half hour, a three-minute bulletin of the latest
//   stories with their details. The loop stops for it and carries on where it stopped.
export const FLASH_SECONDS = 10;
export const BULLETIN_MS = 180e3, HALF_HOUR = 1800e3;
const hash = str => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export function buildLoop(s, videos, cards = []) {
  const loop = []; let k = 0, slot = 0;
  for (const v of videos) {
    loop.push({ type: "video", ytId: v.ytId, title: v.title, dur: v.duration, thumb: v.thumb });
    loop.push({ type: "flash", dur: FLASH_SECONDS, n: k });
    k++;
    if (s.promosOn && cards.length && s.promoEvery && k % s.promoEvery === 0) { const p = cards[slot++ % cards.length]; loop.push({ type: "promo", id: p.id, image: p.image, title: p.title, dur: p.seconds }); }
  }
  if (!videos.length && cards.length && s.promosOn) cards.forEach(p => loop.push({ type: "promo", id: p.id, image: p.image, title: p.title, dur: p.seconds }));
  if (!loop.length) loop.push({ type: "flash", dur: FLASH_SECONDS, n: 0 });
  loop.forEach((x, i) => { x.sting = hash(`${x.ytId || x.type}:${i}`) % 3 === 0; });
  return loop;
}
// Bulletin time in [0, x): three minutes at the start of every half hour.
const bulletinMs = x => Math.floor(x / HALF_HOUR) * BULLETIN_MS + Math.min(x % HALF_HOUR, BULLETIN_MS);
// Where the channel is now, and what follows for the next `ahead` seconds. Loop time runs only
// outside bulletins, so after a bulletin the loop resumes where it stopped (a video cut by the
// bulletin carries on from the same second).
export function scheduleAt(loop, epoch, t = Date.now(), ahead = 5400) {
  const total = loop.reduce((n, x) => n + x.dur, 0) * 1000;
  if (!total) return [];
  const out = [], end = t + ahead * 1000, bulletin = start => ({ type: "bulletin", start, dur: BULLETIN_MS / 1000, sting: true });
  let at = t;
  const ws = Math.floor(at / HALF_HOUR) * HALF_HOUR;
  if (at - ws < BULLETIN_MS) { out.push(bulletin(ws)); at = ws + BULLETIN_MS; }
  // Position in the loop (loop time leaves the bulletins out).
  let lt = ((at - epoch - (bulletinMs(at) - bulletinMs(epoch))) % total + total) % total, i = 0;
  while (lt >= loop[i].dur * 1000) { lt -= loop[i].dur * 1000; i = (i + 1) % loop.length; }
  let into = lt;
  // Each piece keeps a fixed start: an item cut by a bulletin resumes as a new piece that starts
  // when the bulletin ends, from the second it stopped at ("in").
  const lastEnd = Math.floor(at / HALF_HOUR) * HALF_HOUR + BULLETIN_MS;
  let runStart = at - into < lastEnd ? lastEnd : at - into, inMs = at - into < lastEnd ? into - (at - lastEnd) : 0;
  for (let n = 0; at < end && n < 500; n++) {
    const x = loop[i], left = x.dur * 1000 - into, next = Math.floor(at / HALF_HOUR) * HALF_HOUR + HALF_HOUR;
    if (at + left <= next) {
      out.push({ ...x, start: runStart, in: inMs / 1000, dur: (at + left - runStart) / 1000 });
      at += left; into = 0; i = (i + 1) % loop.length; runStart = at; inMs = 0;
    } else {
      out.push({ ...x, start: runStart, in: inMs / 1000, dur: (next - runStart) / 1000, cut: true });
      into += next - at; out.push(bulletin(next)); at = next + BULLETIN_MS; runStart = at; inMs = into;
    }
  }
  return out;
}

/* ---------- What every screen reads ---------- */
// The bulletin: the six newest Bengali stories (wire briefs and reports, and the desk's own),
// each with about a hundred words of its text.
async function bulletinStories(env) {
  const { results } = await env.DB.prepare("SELECT title, category, kind, body FROM articles WHERE status='published' AND lang='bn' AND pulled_at IS NULL ORDER BY published_at DESC LIMIT 6").all().catch(() => ({ results: [] }));
  return results.map(r => {
    const words = String(r.body || "").replace(/<[^>]+>/g, " ").replace(/[#*_>]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
    return { title: r.title, desk: r.category, kind: r.kind, text: words.slice(0, 100).join(" ") + (words.length > 100 ? "…" : "") };
  });
}
const memo = new Map();
export async function tvState(env, ch) {
  const hit = memo.get(ch);
  if (hit && Date.now() - hit.at < 4000) return hit.value;
  const s = await tvSettings(env, ch);
  const [videos, cards, live, stories] = await Promise.all([
    playable(env, ch), ch === "v" ? promos(env) : [],
    env.DB.prepare("SELECT CASE WHEN live_video<>'' THEN live_video ELSE yt_id END AS ytId, title FROM tv_sources WHERE channel=? AND kind='live' AND active=1 AND on_air=1 AND live_now=1 LIMIT 1").bind(ch).first(),
    listPublished(env, { limit: 30 }).then(l => localiseArticles(env, "bn", l))
  ]);
  const headlines = stories.filter(a => a.lang === "bn").map(a => ({ text: a.title, desk: a.category, kind: a.kind }));
  const bulletin = await bulletinStories(env);
  const value = {
    channel: ch, on: s.on, serverTime: Date.now(),
    live: live || null,
    schedule: s.on ? scheduleAt(buildLoop(s, videos, cards), s.epoch) : [],
    breaking: s.breaking && Date.now() - Date.parse(s.breaking.at) < (s.breaking.seconds + 90) * 1000 ? s.breaking : null,
    lband: ch === "h" ? s.lband : null, lowerThird: s.lowerThird || "", band: s.band || "", appStream: s.appStream || null,
    ad: s.ad, sets: s.sets, setSeconds: s.setSeconds,
    ticker: [...s.ticker, ...headlines.slice(0, 14).map(h => h.text)],
    headlines, bulletin
  };
  memo.set(ch, { at: Date.now(), value });
  return value;
}
export const clearTvCache = () => memo.clear();
export async function checkKey(env, ch, key) { const s = await tvSettings(env, ch); return !!key && key === s.key; }

/* ---------- Pictures pasted as Google Drive links are copied into the app's storage ---------- */
export function driveId(u) {
  const s = String(u || "");
  return s.match(/drive\.google\.com\/file\/d\/([\w-]{20,})/)?.[1] || s.match(/[?&]id=([\w-]{20,})/)?.[1] || null;
}
function imageMime(b) {
  const at = (i, ...v) => v.every((x, j) => b[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  return null;
}
// A Drive "anyone with the link" picture or an https image → /media/<id>.<ext> (kept in D1).
export async function copyImage(env, url, userId) {
  const id = driveId(url);
  const src = id ? `https://drive.google.com/uc?export=download&id=${id}` : String(url || "");
  if (!/^https:\/\//.test(src)) throw new Error("Paste a Google Drive share link or an https:// picture address.");
  let r;
  try { r = await fetch(src, { redirect: "follow", signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("That picture address could not be reached. Check the link (for Drive, share it as “Anyone with the link”)."); }
  if (!r.ok) throw new Error(`The picture could not be fetched (HTTP ${r.status}). For Drive, share it as “Anyone with the link”.`);
  const bytes = new Uint8Array(await r.arrayBuffer()), mime = imageMime(bytes);
  if (!mime) throw new Error("That link is not a JPEG, PNG, WebP or GIF picture. For Drive, share it as “Anyone with the link”.");
  if (bytes.length > 1_800_000) throw new Error("That picture is over 1.8 MB. Make it smaller (a 1080×1920 JPEG is usually 300–600 KB).");
  const key = crypto.randomUUID().replace(/-/g, "").slice(0, 20), ext = mime.split("/")[1].replace("jpeg", "jpg");
  await env.DB.prepare("INSERT INTO images (id,mime,data,bytes,alt,uploaded_by) VALUES (?,?,?,?,?,?)").bind(key, mime, bytes.buffer, bytes.length, "TV promo", userId || null).run();
  return `/media/${key}.${ext}`;
}

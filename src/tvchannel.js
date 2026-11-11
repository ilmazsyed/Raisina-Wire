import { readyVoices } from "./bulletinvoice.js";
import { cleanCredit } from "./bulletinimg.js";
import { avoForScreens } from "./avo.js";
import { bnLine } from "./bnline.js";
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

export const CHANNELS = ["h", "v"];
const SHORT_MAX = 180;          // seconds: a Short (vertical channel)
const now = () => new Date().toISOString();
const randomKey = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 28);

const DEFAULTS = {
  h: { on: true, key: "", newsEvery: 3, sets: 3, setSeconds: 7, lowerThird: "", lband: { on: false, text: "" }, otherSources: false, breaking: null,
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
  if (b.avoOn !== undefined) s.avoOn = !!b.avoOn;
  if (b.otherSources !== undefined) s.otherSources = !!b.otherSources;
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
// The vertical channel plays Shorts (up to three minutes). The horizontal channel plays every
// landscape video of its own playlists (a portrait video, by YouTube's player size, never goes
// on the horizontal screen). With "other playlists" on in the control room
// (or while its own playlists have nothing yet), the long videos (over three minutes) of the
// vertical channel's sources join in. Either way the newest video plays first.
// Freshness (a news channel): today's uploads (India time) play, newest first; when there are
// fewer than ten, the most recent of the day before fill in up to ten. Nothing older than 30
// hours goes on air, except videos the control room marks "keep running" (and, when nothing at
// all is that new, the most recent ten).
export const VIDEO_FRESH_HOURS = 30, DAILY_MIN = 10;
export function freshOnly(list, now = Date.now()) {
  const t = v => Date.parse(v.publishedAt || "") || 0;
  const ist = new Date(now + 5.5 * 3600e3), midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600e3;
  const recent = list.filter(v => !v.keep && t(v) >= now - VIDEO_FRESH_HOURS * 3600e3).sort((a, b) => t(b) - t(a));
  const today = recent.filter(v => t(v) >= midnight), earlier = recent.filter(v => t(v) < midnight);
  let pick = [...today, ...earlier.slice(0, Math.max(0, DAILY_MIN - today.length))];
  // Nothing new in 30 hours: the most recent videos there are play (up to ten), so the channel
  // never runs without pictures.
  if (!pick.length) pick = list.filter(v => !v.keep).sort((a, b) => t(b) - t(a)).slice(0, DAILY_MIN);
  const kept = list.filter(v => v.keep);
  return [...pick, ...kept].sort((a, b) => t(b) - t(a));
}
async function playable(env, ch, s = {}) {
  // By shape, whichever channel's source brought the video in: portrait videos play only on the
  // vertical channel, landscape videos only on the horizontal one (YouTube's player size says
  // which). A video in both channels' sources counts once.
  const rows = (await env.DB.prepare(`SELECT i.yt_id AS ytId, i.title, i.duration, i.thumb, i.headline, i.description, i.published_at AS publishedAt, i.keep, i.channel AS src FROM tv_items i JOIN tv_sources s ON s.id=i.source_id
    WHERE i.vertical=? AND i.excluded=0 AND i.playable=1 AND s.active=1 AND i.duration>0 ORDER BY (i.channel=?) DESC, i.published_at DESC LIMIT 400`).bind(ch === "v" ? 1 : 0, ch).all()).results;
  const seen = new Set(), list = rows.filter(v => !seen.has(v.ytId) && seen.add(v.ytId));
  // Safety net for the vertical channel: if YouTube reports no portrait video at all, its own
  // Shorts play as before.
  if (ch === "v" && !list.length) return freshOnly((await env.DB.prepare(`SELECT i.yt_id AS ytId, i.title, i.duration, i.thumb, i.headline, i.description, i.published_at AS publishedAt, i.keep FROM tv_items i JOIN tv_sources s ON s.id=i.source_id
    WHERE i.channel='v' AND i.duration<=${SHORT_MAX} AND i.excluded=0 AND i.playable=1 AND s.active=1 AND i.duration>0 ORDER BY i.published_at DESC LIMIT 300`).all()).results);
  return freshOnly(list);
}

/* ---------- Scheduled cut-ins (control room > Scheduler) ---------- */
// Each active cut-in's coming times (India time) as moments, from an hour ago to a day ahead,
// with the videos to play; the screens put them on air (src/engine.js), after any bulletin,
// weather and market update that is on at that moment. Scheduled videos ignore the 30-hour
// freshness rule: scheduling them is the control room's choice.
const IST = 5.5 * 3600e3;
export function cutinTimes(row, now = Date.now()) {
  const out = [], times = (() => { try { return JSON.parse(row.times || "[]"); } catch { return []; } })();
  const today = new Date(now + IST).toISOString().slice(0, 10), tomorrow = new Date(now + IST + 86400e3).toISOString().slice(0, 10);
  const days = row.day ? [row.day] : [today, tomorrow];
  for (const d of days) for (const t of times) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim()); if (!m) continue;
    const at = Date.parse(`${d}T${m[1].padStart(2, "0")}:${m[2]}:00Z`) - IST;
    if (at > now - 3600e3 && at < now + 86400e3) out.push(at);
  }
  return out.sort((a, b) => a - b);
}
export async function cutins(env, ch, all = false) {
  const { results } = await env.DB.prepare(`SELECT * FROM tv_cutins WHERE channel=? ${all ? "" : "AND active=1"} ORDER BY created_at DESC`).bind(ch).all().catch(() => ({ results: [] }));
  return results.map(r => { let videos = []; try { videos = JSON.parse(r.videos || "[]"); } catch { /* none */ } let times = []; try { times = JSON.parse(r.times || "[]"); } catch { /* none */ }
    return { id: r.id, channel: r.channel, title: r.title, videos, times, day: r.day, active: !!r.active, createdAt: r.created_at }; });
}
async function cutinsOnAir(env, ch) {
  const now = Date.now(), out = [];
  for (const c of await cutins(env, ch)) {
    const videos = c.videos.filter(v => v.ytId && v.dur > 0); if (!videos.length) continue;
    const dur = videos.reduce((n, v) => n + v.dur, 0);
    for (const at of cutinTimes({ times: JSON.stringify(c.times), day: c.day }, now)) if (at + dur * 1000 > now) out.push({ id: c.id, title: c.title, at, dur, videos });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 24);
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
// - at the top of every hour and at every half hour, a two-minute bulletin of the latest
//   stories with their details, and at :15 and :45 a 65-second one. The loop stops for it and
//   carries on where it stopped.
export const FLASH_SECONDS = 10;
export const QUARTER = 900e3;
export const bulletinMs = due => (Math.round(due / 60e3) % 30 === 0 ? 120e3 : 65e3);
const hash = str => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export function buildLoop(s, videos, cards = []) {
  const loop = []; let k = 0, slot = 0;
  for (const v of videos) {
    loop.push({ type: "video", ytId: v.ytId, title: v.title, line: (v.headline || "").trim() || bnLine(v.title, v.description), dur: v.duration, thumb: v.thumb });
    loop.push({ type: "flash", dur: FLASH_SECONDS, n: k });
    k++;
    if (s.promosOn && cards.length && s.promoEvery && k % s.promoEvery === 0) { const p = cards[slot++ % cards.length]; loop.push({ type: "promo", id: p.id, image: p.image, title: p.title, dur: p.seconds }); }
  }
  if (!videos.length && cards.length && s.promosOn) cards.forEach(p => loop.push({ type: "promo", id: p.id, image: p.image, title: p.title, dur: p.seconds }));
  if (!loop.length) loop.push({ type: "flash", dur: FLASH_SECONDS, n: 0 });
  // The Rashtrix stinger between every video: going into the flash after it and into the next.
  loop.forEach((x, i) => { x.sting = x.type === "flash" || x.type === "video" ? true : x.type === "promo" ? hash(`${x.id}:${i}`) % 3 === 0 : false; });
  return loop;
}
// Every video plays whole, from its first second to its last. The schedule is walked from the
// channel's start (or a saved point on the way): items follow one another, and once a half hour
// has passed the bulletin goes on at the next break, never in the middle of a video. What was on
// air when the loop restarted for a new video ("hold") plays out first.
const nextHalf = x => Math.floor(x / QUARTER) * QUARTER + QUARTER;
export function scheduleAt(loop, epoch, t = Date.now(), ahead = 5400, opts = {}) {
  const out = [], end = t + ahead * 1000;
  for (const h of opts.hold || []) if (h.start + h.dur * 1000 > t && h.start < end) out.push(h);
  const total = loop.reduce((n, x) => n + x.dur, 0) * 1000;
  if (!total) return out;
  const a = opts.anchor && opts.anchor.epoch === epoch && opts.anchor.len === loop.length && opts.anchor.at <= t ? opts.anchor : null;
  let at = a ? a.at : epoch, i = a ? a.i % loop.length : 0, due = a ? a.due : nextHalf(epoch), steps = 0, mark = null;
  while (at < end && steps < 400000) {
    steps++;
    if (at >= due) {
      // Every 30 minutes: 45 seconds of weather (then the markets) after the two-minute bulletins
      // at :00 and :30; none after the short ones at :15 and :45.
      const len = bulletinMs(due), wx = opts.weather && len === 120e3 ? 45e3 : 0;
      if (at + len > t) out.push({ type: "bulletin", start: at, dur: len / 1000, sting: true });
      // The weather briefing straight after it (horizontal channel).
      if (wx && at + len + wx > t) out.push({ type: "weather", start: at + len, dur: wx / 1000, sting: true });
      // Then the 20-second market update.
      const mk = wx ? 20e3 : 0;
      if (mk && at + len + wx + mk > t) out.push({ type: "market", start: at + len + wx, dur: mk / 1000, sting: true });
      due = nextHalf(at); at += len + wx + mk; continue;
    }
    const x = loop[i], next = at + x.dur * 1000;
    if (next > t) out.push({ ...x, start: at, in: 0 });
    else if (steps % 500 === 0) mark = { epoch, len: loop.length, at: next, i: (i + 1) % loop.length, due };
    at = next; i = (i + 1) % loop.length;
  }
  // A saved point near now, so the next walk is short.
  out.anchor = mark && steps > 1500 ? mark : null;
  return out;
}

/* ---------- What every screen reads ---------- */
// The bulletin: the eight newest Bengali stories (wire briefs and reports, and the desk's own),
// each with about a hundred words of its text.
// What the channel's headlines, flashes and bulletins show: the wire's stories (reports and
// briefs) from the last twelve hours, newest first. Older stories never go on air.
const FRESH_HOURS = 12;
async function wireStories(env, limit = 20) {
  const pick = hours => env.DB.prepare(`SELECT id, title, category, kind, body FROM articles WHERE status='published' AND lang='bn' AND pulled_at IS NULL
    AND kind IN ('rewrite','brief') AND published_at>=? ORDER BY published_at DESC LIMIT ?`).bind(new Date(Date.now() - hours * 3600e3).toISOString(), limit).all().then(r => r.results).catch(() => []);
  // A quiet night: look back a day rather than show an empty screen, never further.
  const fresh = await pick(FRESH_HOURS);
  return fresh.length >= 4 ? fresh : pick(24);
}
const firstWords = (body, n = 100) => {
  const words = String(body || "").replace(/<[^>]+>/g, " ").replace(/[#*_>]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
};
const memo = new Map();
export async function tvState(env, ch) {
  const hit = memo.get(ch);
  if (hit && Date.now() - hit.at < 4000) return hit.value;
  const s = await tvSettings(env, ch);
  const [videos, cards, live, stories, cuts, avo] = await Promise.all([
    playable(env, ch, s), ch === "v" ? promos(env) : [],
    env.DB.prepare("SELECT CASE WHEN live_video<>'' THEN live_video ELSE yt_id END AS ytId, title FROM tv_sources WHERE channel=? AND kind='live' AND active=1 AND on_air=1 AND live_now=1 LIMIT 1").bind(ch).first(),
    wireStories(env), cutinsOnAir(env, ch).catch(() => []), s.avoOn === false ? [] : avoForScreens(env).catch(() => [])
  ]);
  const headlines = stories.map(a => ({ text: a.title, desk: a.category, kind: a.kind }));
  // Each bulletin story's picture and its credit (src/bulletinimg.js), when one was found.
  const top = stories.slice(0, 8), pics = new Map();
  if (top.length) (await env.DB.prepare(`SELECT article_id, url, credit FROM bulletin_images WHERE url<>'' AND article_id IN (${top.map(() => "?").join(",")})`).bind(...top.map(r => r.id)).all().catch(() => ({ results: [] }))).results.forEach(r => pics.set(r.article_id, r));
  const bulletin = top.map(r => ({ title: r.title, desk: r.category, kind: r.kind, text: firstWords(r.body), image: pics.has(r.id) ? `/api/tv/bimg/${encodeURIComponent(r.id)}?v=${encodeURIComponent(pics.get(r.id).url.length + (pics.get(r.id).url.split("/").pop() || "").slice(-12))}` : "", credit: cleanCredit(pics.get(r.id)?.credit) }));
  // The newsreader's line for each story, when it is ready (src/bulletinvoice.js).
  const voices = await readyVoices(env, bulletin).catch(() => new Map());
  bulletin.forEach(b => { const v = voices.get(b); if (v) { b.voice = `/api/tv/voice/${v.key}.mp3`; b.secs = v.secs; } });
  const loop = buildLoop(s, videos, cards);
  const schedule = s.on ? scheduleAt(loop, s.epoch, Date.now(), 5400, { hold: s.hold, anchor: s.anchor, weather: ch === "h" }) : [];
  // Keep a point near now (and drop a hold that has played out), so the walk stays short.
  const holdOver = (s.hold || []).length && (s.hold || []).every(h => h.start + h.dur * 1000 < Date.now());
  if (schedule.anchor || holdOver) { const fresh = await tvSettings(env, ch); if (schedule.anchor && fresh.epoch === s.epoch) fresh.anchor = schedule.anchor; if (holdOver) delete fresh.hold; await putSettings(env, ch, fresh); }
  const value = {
    channel: ch, on: s.on, serverTime: Date.now(),
    live: live || null,
    schedule: s.on ? schedule : [],
    breaking: s.breaking && Date.now() - Date.parse(s.breaking.at) < (s.breaking.seconds + 90) * 1000 ? s.breaking : null,
    lband: ch === "h" ? s.lband : null,
    // The horizontal channel's automatic L-band during videos: every 40 seconds, for 7 seconds.
    lbandAuto: ch === "h" ? { on: s.lbandAuto?.on !== false, every: s.lbandAuto?.every || 40, seconds: s.lbandAuto?.seconds || 10 } : null, lowerThird: s.lowerThird || "", band: s.band || "", appStream: s.appStream || null,
    ad: s.ad, sets: s.sets, setSeconds: s.setSeconds,
    ticker: [...s.ticker, ...headlines.slice(0, 14).map(h => h.text)],
    headlines, bulletin,
    // The app plays its own copy of the order for each viewer, newest video first (src/engine.js).
    loop: s.on ? loop : [],
    // Scheduled cut-ins (the control room's Scheduler): at each time, these videos go on air.
    cutins: s.on ? cuts : [],
    // The AVO engine's stories in rotation (src/avo.js); empty when the control room turns it off.
    avoOn: s.avoOn !== false, avo: s.on ? avo : []
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

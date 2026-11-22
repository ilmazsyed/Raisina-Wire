// The Content Library desk (library.html): everything the channels can air, in one place.
//   - YouTube, playlist by playlist (playlists are added here, and only here), every video with
//     its preview, Keep and Delete;
//   - the lives (YouTube and Facebook);
//   - every AVO story (AVO, AVO + byte, phone-in, explainer, full video, breaking, desk-written);
//   - the uploaded clips (MP4s and audio).
// The library holds the last 36 hours: a video counts from when it came into the library (not its
// upload date), an AVO from when it was made, a clip from when it was uploaded or last used.
// Anything older goes, unless it is kept: a kept item, every video of a "keep everything" playlist,
// a clip an ad uses, and anything in a rundown or the Live Rundown still to come. Videos are not
// deleted from YouTube (that cannot be done from here): "Delete" takes one off the channels and
// out of the library, for good.
// Every desk that picks something to air (Producer, PCR, Live Rundown, Breaking, AVO, Headlines)
// reads the same list (GET /api/admin/library), so all of them see the same 36 hours.
import { LIB_HOURS } from "./tvchannel.js";
import { screenStory, avoManualDelete } from "./avo.js";
import { adClips } from "./ads.js";

const iso = t => new Date(t).toISOString();
const ms = v => { if (!v) return 0; const s = String(v); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`) || 0; };
const j = (v, d) => { try { return JSON.parse(v || d); } catch { return JSON.parse(d); } };
const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);

// What an AVO story is, by its parts.
export function avoKind(x) {
  const bytes = (x.bytes || []).length, phone = !!x.phone?.url;
  if (x.origin === "breaking") return "breaking";
  if (x.full?.url) return "full";
  if (bytes && phone) return "byte-phone";
  if (bytes) return "byte";
  if (phone) return "phone";
  if (x.scene === "explainer" || x.ex === true) return "explainer";
  return "avo";
}

// What is still to air: the rundowns of today and later, and the Live Rundown's coming slots.
// Returns a list of {title, text} where text is everything those items carry (ids and links).
async function upcoming(env) {
  const day = istDay();
  const { results: items } = await env.DB.prepare(`SELECT r.title AS rt, r.slot_start, r.day, i.title, i.data FROM rundown_items i JOIN rundowns r ON r.id=i.rundown_id
    WHERE r.day>=? AND r.status<>'archived' AND i.status='ready' LIMIT 3000`).bind(day).all().catch(() => ({ results: [] }));
  const out = items.map(x => ({ title: `${x.rt}${x.slot_start ? ` ${x.slot_start}` : ""}${x.day !== day ? ` (${x.day})` : ""}`, text: x.data || "" }));
  const { results: lr } = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('lrd:h','lrd:v')").all().catch(() => ({ results: [] }));
  for (const r of lr) out.push({ title: r.key === "lrd:v" ? "Live Rundown (Shorts)" : "Live Rundown (TV)", text: r.value || "" });
  return out;
}
const usedIn = (up, needle) => needle ? [...new Set(up.filter(u => u.text.includes(needle)).map(u => u.title))].slice(0, 4) : [];

// GET /api/admin/library: the whole library, with how each item has been used.
export async function libraryData(env) {
  const now = Date.now(), cut = now - LIB_HOURS * 3600e3, cutIso = iso(cut);
  const [sources, vids, avoRows, clipRows, runs, up, ads] = await Promise.all([
    env.DB.prepare("SELECT * FROM tv_sources ORDER BY channel, kind, created_at").all().then(r => r.results),
    env.DB.prepare(`SELECT i.channel, i.yt_id, i.source_id, i.title, i.duration, i.thumb, i.published_at, i.added_at, i.keep, i.evergreen, i.playable, i.excluded, i.vertical, s.keep_all
      FROM tv_items i JOIN tv_sources s ON s.id=i.source_id WHERE i.keep=1 OR i.evergreen=1 OR s.keep_all=1 OR i.added_at>=? ORDER BY i.added_at DESC, i.published_at DESC LIMIT 2000`).bind(cutIso).all().then(r => r.results),
    env.DB.prepare("SELECT * FROM avo_stories WHERE status<>'deleted' AND (keep=1 OR created_at>=datetime('now','-4 days')) ORDER BY created_at DESC LIMIT 600").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM clips WHERE status='ready' ORDER BY created_at DESC LIMIT 600").all().then(r => r.results).catch(() => []),
    env.DB.prepare("SELECT type, title, at FROM asrun WHERE at>=? AND type IN ('video','avo','clip','ad') ORDER BY at DESC LIMIT 6000").bind(cutIso).all().then(r => r.results).catch(() => []),
    upcoming(env), adClips(env).catch(() => [])
  ]);
  // (aired: from the as-run log, by title, in the library's 36 hours)
  const airs = new Map();
  for (const r of runs) { const k = `${r.type === "ad" ? "clip" : r.type}|${String(r.title || "").trim()}`; const a = airs.get(k) || { n: 0, last: r.at }; a.n++; airs.set(k, a); }
  const aired = (type, title) => airs.get(`${type}|${String(title || "").trim()}`) || { n: 0, last: null };
  const clearsAt = t => iso(ms(t) + LIB_HOURS * 3600e3);

  const videos = vids.map(v => {
    const a = aired("video", v.title), kept = !!(v.keep || v.evergreen || v.keep_all);
    return { ch: v.channel, ytId: v.yt_id, sourceId: v.source_id, title: v.title, dur: v.duration, thumb: v.thumb || `https://i.ytimg.com/vi/${v.yt_id}/mqdefault.jpg`,
      publishedAt: v.published_at, addedAt: v.added_at || v.published_at, keep: !!v.keep, evergreen: !!v.evergreen, keepAll: !!v.keep_all, playable: !!v.playable,
      deleted: !!v.excluded, vertical: !!v.vertical, aired: a.n, lastAired: a.last, inRundowns: usedIn(up, v.yt_id), clearsAt: kept ? null : clearsAt(v.added_at || v.published_at) };
  });
  const playlists = sources.filter(s => s.kind !== "live").map(s => ({ id: s.id, ch: s.channel, kind: s.kind, ytId: s.yt_id, title: s.title || s.yt_id, active: !!s.active, keepAll: !!s.keep_all,
    count: s.item_count, lastRefresh: s.last_refresh, error: s.last_error || "", videos: videos.filter(v => v.sourceId === s.id) }));
  const lives = sources.filter(s => s.kind === "live").map(s => ({ id: s.id, ch: s.channel, title: s.title || "", fb: String(s.yt_id).startsWith("fb:"), ref: String(s.yt_id).replace(/^fb:/, ""),
    active: !!s.active, onAir: !!s.on_air, liveNow: !!s.live_now, liveVideo: s.live_video || "", lastRefresh: s.last_refresh, error: s.last_error || "" }));

  const avo = avoRows.filter(r => r.keep || Math.max(ms(r.created_at), ms(r.published_at)) >= cut).map(r => {
    const x = screenStory(r), a = { n: r.aired || 0, last: r.last_aired || null }, made = Math.max(ms(r.created_at), ms(r.published_at));
    return { ...x, kind: avoKind(x), status: r.status, keep: !!r.keep, desk: r.desk, made: iso(made || now), aired: a.n, views: r.views || 0, lastAired: a.last,
      inRundowns: usedIn(up, r.article_id), clearsAt: r.keep ? null : iso(made + LIB_HOURS * 3600e3) };
  });

  const adSet = new Set(ads);
  const clips = clipRows.map(c => {
    const t = Math.max(ms(c.created_at), ms(c.last_used_at)), url = `/${c.r2_key}`, ad = adSet.has(c.r2_key);
    const a = aired("clip", c.title);
    return { id: c.id, title: c.title, url, mime: c.mime, bytes: c.bytes, dur: c.duration, keep: !!c.keep, ad, audio: /^audio\//.test(c.mime || ""),
      at: iso(t || now), aired: a.n, lastAired: a.last, inRundowns: usedIn(up, url), clearsAt: c.keep || ad ? null : iso(t + LIB_HOURS * 3600e3) };
  }).filter(c => c.keep || c.ad || ms(c.at) >= cut || c.inRundowns.length);

  return { hours: LIB_HOURS, now: iso(now), playlists, lives, avo, clips };
}

// Hourly: what is older than 36 hours and not kept leaves the library (and the clip store). Nothing
// a rundown or the Live Rundown still has to air goes, nor anything an ad uses.
export async function libraryPurge(env) {
  const hour = new Date().toISOString().slice(0, 13);
  const done = await env.DB.prepare("SELECT value FROM settings WHERE key='lib_purge'").first().catch(() => null);
  if (done?.value === hour) return null;
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('lib_purge',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(hour).run();
  const cut = Date.now() - LIB_HOURS * 3600e3, up = await upcoming(env), busy = needle => up.some(u => u.text.includes(needle));
  // AVO stories (made more than 36 hours ago, not kept)
  const { results: avo } = await env.DB.prepare("SELECT article_id, created_at, published_at, videos, bytes, extra FROM avo_stories WHERE status<>'deleted' AND keep=0 AND created_at<datetime('now','-36 hours') LIMIT 200").all().catch(() => ({ results: [] }));
  let avoGone = 0;
  for (const r of avo) {
    if (Math.max(ms(r.created_at), ms(r.published_at)) >= cut || busy(r.article_id)) continue;
    await avoManualDelete(env, r.article_id).catch(() => {}); avoGone++;
  }
  // Clips (uploaded or last used more than 36 hours ago, not kept, no ad, no AVO still here uses them)
  let clipGone = 0;
  if (env.CLIPS) {
    const ads = new Set(await adClips(env).catch(() => []));
    const live = new Set();
    const { results: keepAvo } = await env.DB.prepare("SELECT videos, bytes, extra FROM avo_stories WHERE status<>'deleted'").all().catch(() => ({ results: [] }));
    for (const r of keepAvo) for (const t of [r.videos, r.bytes, r.extra]) for (const m of String(t || "").matchAll(/\/clips\/[\w./-]+/g)) live.add(m[0].slice(1));
    const { results: clips } = await env.DB.prepare("SELECT id, r2_key, created_at, last_used_at FROM clips WHERE keep=0 AND status='ready' LIMIT 300").all().catch(() => ({ results: [] }));
    for (const c of clips) {
      if (Math.max(ms(c.created_at), ms(c.last_used_at)) >= cut || ads.has(c.r2_key) || live.has(c.r2_key) || busy(`/${c.r2_key}`)) continue;
      await env.CLIPS.delete(c.r2_key).catch(() => {}); await env.DB.prepare("DELETE FROM clips WHERE id=?").bind(c.id).run(); clipGone++;
    }
  }
  return { avo: avoGone, clips: clipGone };
}

// PUT /api/admin/library/avo/<id> {keep}
export async function libraryAvoKeep(env, id, keep) {
  await env.DB.prepare("UPDATE avo_stories SET keep=? WHERE article_id=?").bind(keep ? 1 : 0, id).run();
  return { ok: true };
}

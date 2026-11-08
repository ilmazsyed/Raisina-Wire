// Rashtrix TV sources from the YouTube Data API v3 (key: YOUTUBE_API_KEY, free quota of 10,000
// units a day). Only cheap calls are used: playlistItems.list and videos.list cost 1 unit per 50
// videos. search.list (100 units) is never used: lives are added by their address, and their
// state is read with videos.list. Every source is refreshed at most every 10 minutes (or at once
// with "Refresh now"), which keeps a dozen playlists well under 3,000 units a day.

const now = () => new Date().toISOString();
const pacificDay = (t = Date.now()) => new Date(t - 8 * 3600e3).toISOString().slice(0, 10);
export const ytReady = env => Boolean(env.YOUTUBE_API_KEY);
export const YT_DAILY_UNITS = env => Number(env.YOUTUBE_DAILY_UNITS || 8000);

// A playlist, video, short or live address (or a bare id) → { kind, id }.
export function parseYouTubeRef(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  let u = null; try { u = new URL(/^https?:/i.test(s) ? s : `https://${s}`); } catch { /* bare id */ }
  if (u && /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(u.hostname)) {
    const list = u.searchParams.get("list");
    const v = u.searchParams.get("v") || (u.hostname.endsWith("youtu.be") ? u.pathname.slice(1, 12) : u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1]);
    if (v && /^[\w-]{11}$/.test(v)) return { kind: /\/live\//.test(u.pathname) ? "live" : "video", id: v, list: list || "" };
    if (list) return { kind: "playlist", id: list };
    return null;
  }
  if (/^(PL|UU|FL|OL|RD|LL)[\w-]{10,}$/.test(s)) return { kind: "playlist", id: s };
  if (/^[\w-]{11}$/.test(s)) return { kind: "video", id: s };
  return null;
}

// "PT1H2M10S" → 3730
export function isoSeconds(d) {
  const m = String(d || "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
}

async function spend(env, units) {
  await env.DB.prepare("INSERT INTO yt_usage (day,units) VALUES (?,?) ON CONFLICT(day) DO UPDATE SET units=units+excluded.units").bind(pacificDay(), units).run();
}
export async function ytUsage(env) {
  const r = await env.DB.prepare("SELECT units FROM yt_usage WHERE day=?").bind(pacificDay()).first();
  return { day: pacificDay(), units: r?.units || 0, limit: YT_DAILY_UNITS(env) };
}

export async function ytCall(env, path, params, units = 1) { return call(env, path, params, units); }
async function call(env, path, params, units = 1) {
  const base = env.YOUTUBE_ENDPOINT || "https://www.googleapis.com/youtube/v3";
  const url = new URL(`${base.replace(/\/$/, "")}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", env.YOUTUBE_API_KEY);
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  await spend(env, units);
  if (!r.ok) { const t = await r.text(); throw new Error(`YouTube ${r.status}: ${(t.match(/"message":\s*"([^"]+)/)?.[1] || t).slice(0, 160)}`); }
  return r.json();
}

// Details for up to 50 videos per call.
async function videoDetails(env, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await call(env, "videos", { part: "snippet,contentDetails,status,liveStreamingDetails", id: ids.slice(i, i + 50).join(","), maxResults: "50" });
    out.push(...(d.items || []));
  }
  return out;
}
const thumbOf = sn => sn?.thumbnails?.maxres?.url || sn?.thumbnails?.high?.url || sn?.thumbnails?.medium?.url || sn?.thumbnails?.default?.url || "";

// Refresh one source: its videos (a playlist's newest 100) and, for lives, whether it is on.
export async function refreshSource(env, src) {
  let ids = [];
  if (src.kind === "playlist") {
    let page = "";
    for (let n = 0; n < 2; n++) {
      const d = await call(env, "playlistItems", { part: "contentDetails,snippet", playlistId: src.yt_id, maxResults: "50", ...(page ? { pageToken: page } : {}) });
      ids.push(...(d.items || []).map(i => i.contentDetails?.videoId).filter(Boolean));
      page = d.nextPageToken; if (!page) break;
    }
  } else ids = [src.yt_id];
  const vids = await videoDetails(env, ids);
  const at = now(), stmts = [];
  const order = new Map(ids.map((id, i) => [id, i]));
  let liveNow = 0;
  for (const v of vids) {
    const live = v.snippet?.liveBroadcastContent;   // none | upcoming | live
    if (src.kind === "live") { liveNow = live === "live" ? 1 : 0; continue; }
    const playable = v.status?.embeddable !== false && v.status?.privacyStatus !== "private" && live === "none" ? 1 : 0;
    stmts.push(env.DB.prepare(`INSERT INTO tv_items (channel,yt_id,source_id,title,duration,thumb,published_at,position,playable,seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(channel,yt_id) DO UPDATE SET source_id=excluded.source_id,title=excluded.title,duration=excluded.duration,thumb=excluded.thumb,published_at=excluded.published_at,position=excluded.position,playable=excluded.playable,seen_at=excluded.seen_at`)
      .bind(src.channel, v.id, src.id, String(v.snippet?.title || "").slice(0, 300), isoSeconds(v.contentDetails?.duration), thumbOf(v.snippet), v.snippet?.publishedAt || null, order.get(v.id) ?? 0, playable, at));
  }
  // Videos that left the playlist leave the channel.
  if (src.kind === "playlist") stmts.push(env.DB.prepare("DELETE FROM tv_items WHERE source_id=? AND seen_at<>?").bind(src.id, at));
  const title = src.kind === "playlist" ? src.title : (vids[0]?.snippet?.title || src.title || "");
  stmts.push(env.DB.prepare("UPDATE tv_sources SET last_refresh=?, last_error='', item_count=?, live_now=?, title=CASE WHEN title='' THEN ? ELSE title END WHERE id=?").bind(at, src.kind === "live" ? 0 : vids.length, liveNow, String(title).slice(0, 200), src.id));
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  return { videos: vids.length, liveNow };
}

// Playlist title (1 unit), for a source added without one.
export async function playlistTitle(env, id) {
  try { const d = await call(env, "playlists", { part: "snippet", id }); return d.items?.[0]?.snippet?.title || ""; } catch { return ""; }
}

// Cron (and "Refresh now"): every active source older than ten minutes, inside the daily cap.
export async function refreshSources(env, { force = false, channel = null } = {}) {
  if (!ytReady(env)) return { skipped: "YOUTUBE_API_KEY not set" };
  const { results } = await env.DB.prepare(`SELECT * FROM tv_sources WHERE active=1 ${channel ? "AND channel=?" : ""} ORDER BY last_refresh`).bind(...(channel ? [channel] : [])).all();
  let done = 0, failed = 0;
  for (const src of results) {
    if (!force && src.last_refresh && Date.now() - Date.parse(src.last_refresh) < 9.5 * 60e3) continue;
    const u = await ytUsage(env);
    if (u.units + 4 > u.limit) break;
    try { await refreshSource(env, src); done++; }
    catch (e) { failed++; await env.DB.prepare("UPDATE tv_sources SET last_refresh=?, last_error=? WHERE id=?").bind(now(), String(e.message || e).slice(0, 200), src.id).run(); }
  }
  return { done, failed };
}

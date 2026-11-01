// Raisina TV: a 24×7 channel of the desk's explainers, newest first, with ad breaks, a breaking
// ticker and a "break in now" switch for the control room. Settings live in the settings table
// under tv_* keys; the order, ads and breaking lines in their own tables (migration 0018).
const DEFAULTS = { on: true, every: 12, perBreak: 1, skippable: false, manual: false, force: null, seq: {}, pinset: null };
// Between videos: a short 5–7 s transition, and every `fullEvery` videos the full package
// (stinger, 15 s promo, News Update). Built-in music themes can be switched off one by one.
export const SEQ_DEFAULTS = { stinger: true, promo: true, news: true, fullEvery: 2, sets: 3, setSeconds: 7, music: true, hourly: true, anchors: true, themes: { pulse: true, bright: true, cinema: true, beat: true } };
const cleanSeq = v => {
  const o = { ...SEQ_DEFAULTS, ...(v && typeof v === "object" ? v : {}) };
  return { stinger: !!o.stinger, promo: !!o.promo, news: !!o.news, fullEvery: Math.min(Math.max(Math.round(Number(o.fullEvery)) || 2, 1), 6),
    sets: Math.min(Math.max(Math.round(Number(o.sets)) || 3, 3), 5), setSeconds: Math.min(Math.max(Math.round(Number(o.setSeconds)) || 7, 5), 12),
    music: !!o.music, hourly: !!o.hourly, anchors: o.anchors !== false, themes: Object.fromEntries(Object.keys(SEQ_DEFAULTS.themes).map(k => [k, o.themes?.[k] !== false])) };
};
// A headline set the desk writes itself (e.g. "Election results"); it leads the next News Update.
const cleanPinset = v => {
  if (!v || typeof v !== "object") return null;
  const items = (Array.isArray(v.items) ? v.items : String(v.items || "").split("\n")).map(x => String(x).replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean).slice(0, 5);
  return { on: !!v.on, title: String(v.title || "").trim().slice(0, 60), items };
};
const randomId = () => crypto.randomUUID();

export async function tvSettings(env) {
  const { results } = await env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'tv_%'").all();
  const s = { ...DEFAULTS };
  for (const r of results) {
    const k = r.key.slice(3);
    try { s[k] = JSON.parse(r.value); } catch { s[k] = r.value; }
  }
  s.every = Math.min(Math.max(Number(s.every) || 12, 3), 60);
  s.perBreak = Math.min(Math.max(Number(s.perBreak) || 1, 1), 4);
  s.on = s.on !== false; s.skippable = !!s.skippable; s.manual = !!s.manual;
  s.seq = cleanSeq(s.seq); s.pinset = cleanPinset(s.pinset);
  return s;
}
export async function saveTvSettings(env, patch) {
  const allowed = { on: v => !!v, every: v => Math.min(Math.max(Math.round(Number(v)) || 12, 3), 60), perBreak: v => Math.min(Math.max(Math.round(Number(v)) || 1, 1), 4), skippable: v => !!v, manual: v => !!v, seq: cleanSeq, pinset: cleanPinset };
  const writes = Object.entries(patch).filter(([k]) => allowed[k]).map(([k, v]) =>
    env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(`tv_${k}`, JSON.stringify(allowed[k](v))));
  if (writes.length) await env.DB.batch(writes);
}
// "Break in now": every viewer cuts to this video (or to a breaking sting) within ~15 seconds.
export async function setForce(env, force) {
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('tv_force',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(force)).run();
}

// A Google Drive share link -> a link the video player can stream. Other https links pass as they are.
export function driveDirect(link) {
  const s = String(link || "").trim();
  const id = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{20,})/)?.[1];
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return /^https:\/\//i.test(s) ? s : "";
}

const VIDEO_COLS = "id,title,description,media_url AS mediaUrl,thumbnail_url AS thumbnailUrl,category,published_at AS publishedAt";
// The channel's running order: newest first; with "Use my order" on, pinned stories take their
// positions, "play next" goes first, and excluded ones are left out. Shorts never play on TV.
export async function tvPlaylist(env, settings) {
  const { results: vids } = await env.DB.prepare(`SELECT ${VIDEO_COLS} FROM media_items WHERE status='published' AND media_type='video' AND (media_url LIKE '%.mp4%' OR media_url LIKE '%.webm%') ORDER BY published_at DESC LIMIT 200`).all();
  if (!settings.manual) return vids;
  const { results: ord } = await env.DB.prepare("SELECT media_id,pin,play_next,excluded FROM tv_order").all();
  const o = new Map(ord.map(r => [r.media_id, r]));
  const keep = vids.filter(v => !o.get(v.id)?.excluded);
  const next = keep.filter(v => o.get(v.id)?.play_next);
  const pinned = keep.filter(v => !o.get(v.id)?.play_next && o.get(v.id)?.pin).sort((a, b) => o.get(a.id).pin - o.get(b.id).pin);
  const rest = keep.filter(v => !next.includes(v) && !pinned.includes(v));
  const out = [...next, ...rest];
  for (const v of pinned) out.splice(Math.min(Math.max(o.get(v.id).pin - 1, 0), out.length), 0, v);
  return out;
}
export async function tvAds(env, all = false) {
  const { results } = await env.DB.prepare(`SELECT id,title,link,on_air AS onAir,created_at AS createdAt FROM tv_ads ${all ? "" : "WHERE on_air=1"} ORDER BY created_at`).all();
  return results.map(a => ({ ...a, onAir: !!a.onAir, src: driveDirect(a.link) }));
}
export async function tvBreaking(env, all = false) {
  const { results } = await env.DB.prepare(`SELECT id,text,on_air AS onAir,sort FROM tv_breaking ${all ? "" : "WHERE on_air=1"} ORDER BY sort, created_at`).all();
  return results.map(b => ({ ...b, onAir: !!b.onAir }));
}

// Control room writes for ads, breaking lines and the order.
export async function saveAd(env, id, b) {
  const title = String(b.title || "").trim().slice(0, 120), link = String(b.link || "").trim().slice(0, 600);
  if (!id) {
    if (title.length < 2) throw new Error("Give the ad a name.");
    if (!driveDirect(link)) throw new Error("Paste a Google Drive share link (Anyone with the link) or an https video link.");
    const nid = randomId();
    await env.DB.prepare("INSERT INTO tv_ads (id,title,link,on_air) VALUES (?,?,?,1)").bind(nid, title, link).run();
    return nid;
  }
  const sets = [], args = [];
  if (b.title !== undefined) { if (title.length < 2) throw new Error("Give the ad a name."); sets.push("title=?"); args.push(title); }
  if (b.link !== undefined) { if (!driveDirect(link)) throw new Error("That link can't be played."); sets.push("link=?"); args.push(link); }
  if (b.onAir !== undefined) { sets.push("on_air=?"); args.push(b.onAir ? 1 : 0); }
  if (sets.length) await env.DB.prepare(`UPDATE tv_ads SET ${sets.join(",")} WHERE id=?`).bind(...args, id).run();
  return id;
}
export async function saveBreaking(env, id, b) {
  const text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 220);
  if (!id) {
    if (text.length < 4) throw new Error("Write the breaking line.");
    const { n } = await env.DB.prepare("SELECT COALESCE(MIN(sort),0) AS n FROM tv_breaking").first();
    const nid = randomId();
    await env.DB.prepare("INSERT INTO tv_breaking (id,text,on_air,sort) VALUES (?,?,1,?)").bind(nid, text, n - 1).run();
    return nid;
  }
  const sets = [], args = [];
  if (b.text !== undefined) { if (text.length < 4) throw new Error("Write the breaking line."); sets.push("text=?"); args.push(text); }
  if (b.onAir !== undefined) { sets.push("on_air=?"); args.push(b.onAir ? 1 : 0); }
  if (b.sort !== undefined) { sets.push("sort=?"); args.push(Math.round(Number(b.sort)) || 0); }
  if (sets.length) await env.DB.prepare(`UPDATE tv_breaking SET ${sets.join(",")} WHERE id=?`).bind(...args, id).run();
  return id;
}
export async function saveOrder(env, rows) {
  const writes = [env.DB.prepare("DELETE FROM tv_order")];
  for (const r of rows.slice(0, 300)) {
    const pin = Number(r.pin) >= 1 ? Math.round(Number(r.pin)) : null;
    if (!pin && !r.next && !r.excluded) continue;
    writes.push(env.DB.prepare("INSERT INTO tv_order (media_id,pin,play_next,excluded) VALUES (?,?,?,?)").bind(String(r.id).slice(0, 64), pin, r.next ? 1 : 0, r.excluded ? 1 : 0));
  }
  await env.DB.batch(writes);
}
export async function tvOrderRows(env) {
  const { results } = await env.DB.prepare("SELECT media_id AS id,pin,play_next AS next,excluded FROM tv_order").all();
  return results;
}

/* ---------- Live input: a livestream or video link the channel cuts to at once ---------- */
// YouTube (live or video), an HLS .m3u8 livestream, or a direct .mp4/.webm (Drive links too).
export function inputSource(url) {
  const s = String(url || "").trim();
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1];
  if (yt) return { kind: "youtube", src: yt };
  if (!/^https:\/\//i.test(s)) return null;
  if (/\.m3u8(\?|$)/i.test(s)) return { kind: "hls", src: s };
  const d = driveDirect(s);
  if (/drive\.google\.com/.test(s) || /\.(mp4|webm|mov)(\?|$)/i.test(s)) return { kind: "video", src: d };
  return null;
}
export async function tvInputs(env) {
  const { results } = await env.DB.prepare("SELECT id,title,url,on_air AS onAir,created_at AS createdAt FROM tv_inputs ORDER BY created_at DESC").all();
  return results.map(r => ({ ...r, onAir: !!r.onAir, source: inputSource(r.url) }));
}
export async function saveInput(env, id, b) {
  if (!id) {
    const title = String(b.title || "").trim().slice(0, 100), url = String(b.url || "").trim().slice(0, 800);
    if (title.length < 2) throw new Error("Give the stream a title.");
    if (!inputSource(url)) throw new Error("Paste a YouTube link, an .m3u8 livestream, or an .mp4 / Google Drive video link.");
    await env.DB.prepare("INSERT INTO tv_inputs (id,title,url,on_air) VALUES (?,?,?,0)").bind(randomId(), title, url).run();
    return;
  }
  // Only one input is on air at a time; switching one on cuts every viewer to it.
  if (b.onAir) await env.DB.batch([env.DB.prepare("UPDATE tv_inputs SET on_air=0"), env.DB.prepare("UPDATE tv_inputs SET on_air=1 WHERE id=?").bind(id)]);
  else await env.DB.prepare("UPDATE tv_inputs SET on_air=0 WHERE id=?").bind(id).run();
}

/* ---------- Music: the desk's own tracks join the built-in themes ---------- */
export async function tvMusic(env, all = false) {
  const { results } = await env.DB.prepare(`SELECT id,title,link,on_air AS onAir FROM tv_music ${all ? "" : "WHERE on_air=1"} ORDER BY created_at`).all();
  return results.map(m => ({ ...m, onAir: !!m.onAir, src: driveDirect(m.link) }));
}
export async function saveMusic(env, id, b) {
  if (!id) {
    const title = String(b.title || "").trim().slice(0, 100), link = String(b.link || "").trim().slice(0, 600);
    if (title.length < 2) throw new Error("Give the track a name.");
    if (!driveDirect(link)) throw new Error("Paste a Google Drive share link (Anyone with the link) or an https audio link.");
    await env.DB.prepare("INSERT INTO tv_music (id,title,link,on_air) VALUES (?,?,?,1)").bind(randomId(), title, link).run();
    return;
  }
  await env.DB.prepare("UPDATE tv_music SET on_air=? WHERE id=?").bind(b.onAir ? 1 : 0, id).run();
}

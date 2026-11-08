// Bulletin producer: daily rundowns per channel, their items, templates that make rundowns every
// day, the midnight (India time) archive with its as-run log, and proof-of-play reports.
// Rundowns are kept for ARCHIVE_DAYS (default 90) and then deleted.
import { ITEM_TYPES, itemScene, itemDuration, timings } from "./scenes.js";

const now = () => new Date().toISOString();
export const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const CH = ["h", "v"];

// Item settings are kept as given, within limits: strings are trimmed, nothing executable.
function cleanData(type, d = {}) {
  const out = {};
  const s = (k, n = 300) => { if (d[k] !== undefined) out[k] = String(d[k]).slice(0, n); };
  const n = k => { if (d[k] !== undefined && d[k] !== "") out[k] = Math.max(0, Number(d[k]) || 0); };
  ["lowerThird", "lowerTitle"].forEach(k => s(k, 140)); s("ticker", 2000);
  if (type === "video") { const id = String(d.ytId || "").match(/(?:v=|youtu\.be\/|shorts\/|live\/|^)([\w-]{11})(?:\b|$)/)?.[1]; out.ytId = id || ""; n("in"); n("out"); }
  if (type === "clip") { s("clipId", 64); s("url", 500); n("in"); n("out"); }
  if (type === "live") { out.layout = String(d.layout || "full").slice(0, 10); out.sources = (Array.isArray(d.sources) ? d.sources : []).slice(0, 6).map(x => ({ kind: String(x.kind || "").slice(0, 12), id: String(x.id || "").slice(0, 64), url: String(x.url || "").slice(0, 800), name: String(x.name || "").slice(0, 80), title: String(x.title || "").slice(0, 120) })); }
  if (type === "breaking") { s("text", 160); out.music = d.music !== false; }
  if (type === "headlines") { s("title", 80); s("lines", 2000); }
  if (type === "lband") { s("text", 160); s("lines", 2000); if (d.source) out.source = { kind: String(d.source.kind || "").slice(0, 12), id: String(d.source.id || "").slice(0, 64), url: String(d.source.url || "").slice(0, 800) }; }
  if (type === "promo" || type === "slate") { s("image", 800); s("text", 160); }
  if (type === "adbreak") out.items = (Array.isArray(d.items) ? d.items : []).slice(0, 20).map(x => ({ image: String(x.image || "").slice(0, 800), seconds: Math.max(3, Math.min(120, Number(x.seconds) || 10)), sponsorId: String(x.sponsorId || "").slice(0, 64) || null }));
  return out;
}
const rowItem = r => ({ id: r.id, pos: r.pos, type: r.type, title: r.title, duration: r.duration, data: parse(r.data, {}), script: r.script, status: r.status });

export async function getRundown(env, id) {
  const r = await env.DB.prepare("SELECT * FROM rundowns WHERE id=?").bind(id).first();
  if (!r) return null;
  const { results } = await env.DB.prepare("SELECT * FROM rundown_items WHERE rundown_id=? ORDER BY pos, created_at").bind(id).all();
  const items = results.map(rowItem);
  const [hh, mm] = (r.slot_start || "").split(":").map(Number);
  return { ...r, items, timing: timings(items, r.slot_minutes * 60), startsAt: Number.isFinite(hh) ? `${r.day}T${String(hh).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}:00+05:30` : null };
}
// The rundown in the form the control room puts on air: each item with its scene.
export async function rundownForAir(env, id) {
  const r = await getRundown(env, id); if (!r) return null;
  return { id: r.id, title: r.title, items: r.items.filter(i => i.status !== "skipped").map(i => ({ id: i.id, type: i.type, title: i.title, dur: itemDuration(i), scene: itemScene(i) })) };
}

async function makeFromTemplate(env, t, day, userId = null) {
  const id = crypto.randomUUID(), items = parse(t.items, []);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO rundowns (id,channel,day,title,slot_start,slot_minutes,template_id,created_by) VALUES (?,?,?,?,?,?,?,?)").bind(id, t.channel, day, t.title, t.slot_start, t.slot_minutes, t.id, userId),
    ...items.map((it, i) => env.DB.prepare("INSERT INTO rundown_items (id,rundown_id,pos,type,title,duration,data,script) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, i, it.type, clean(it.title, 200), Math.max(1, Number(it.duration) || 30), JSON.stringify(cleanData(it.type, it.data)), String(it.script || "").slice(0, 20000)))
  ]);
  return id;
}

// Cron, every minute (cheap): at midnight India time the day's rundowns are archived and today's
// rundowns are made from the templates; archives past the retention period are deleted.
export async function rundownHousekeeping(env) {
  const today = istDay();
  const done = await env.DB.prepare("SELECT value FROM settings WHERE key='rundown_day'").first();
  if (done?.value === today) return null;
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('rundown_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(today).run();
  await env.DB.prepare("UPDATE rundowns SET status='archived', archived_at=? WHERE status='working' AND day<?").bind(now(), today).run();
  const keep = Number(env.ARCHIVE_DAYS || 90), cut = istDay(Date.now() - keep * 864e5);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rundown_items WHERE rundown_id IN (SELECT id FROM rundowns WHERE status='archived' AND day<?)").bind(cut),
    env.DB.prepare("DELETE FROM rundowns WHERE status='archived' AND day<?").bind(cut),
    env.DB.prepare("DELETE FROM asrun WHERE day<?").bind(cut)
  ]);
  const weekday = String(new Date(Date.parse(`${today}T12:00:00+05:30`)).getUTCDay());
  const { results } = await env.DB.prepare("SELECT * FROM rundown_templates WHERE active=1").all();
  let made = 0;
  for (const t of results) {
    if (!t.weekdays.includes(weekday)) continue;
    if (await env.DB.prepare("SELECT 1 FROM rundowns WHERE template_id=? AND day=?").bind(t.id, today).first()) continue;
    await makeFromTemplate(env, t, today); made++;
  }
  return { archived: true, made };
}

// /api/admin/rundowns…, /api/admin/templates…, /api/admin/asrun, /api/admin/proof
export async function handleRundowns(request, env, url, user, { json, err, audit, control }) {
  const p = url.pathname.split("/").slice(3).map(decodeURIComponent);   // ["rundowns", id, "items", itemId]
  const method = request.method, b = ["GET", "DELETE"].includes(method) ? {} : await request.json().catch(() => ({}));
  const ok = (x = {}) => json({ ok: true, ...x }, 200, { "cache-control": "no-store" });
  // Changes to a rundown that is on air reach the control room at once.
  const refresh = async id => { const r = await rundownForAir(env, id); if (r) for (const ch of CH) await control(ch, "rundown.refresh", { rundown: r }).catch(() => {}); };

  if (p[0] === "rundowns") {
    const [, id, sub, itemId] = p;
    if (!id && method === "GET") {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("day") || "") ? url.searchParams.get("day") : istDay();
      const archived = url.searchParams.get("archived") === "1";
      const { results } = await env.DB.prepare(`SELECT r.*, (SELECT COUNT(*) FROM rundown_items i WHERE i.rundown_id=r.id) AS items, (SELECT COALESCE(SUM(duration),0) FROM rundown_items i WHERE i.rundown_id=r.id) AS seconds FROM rundowns r WHERE ${archived ? "r.status='archived' AND r.day>=? AND r.day<=?" : "r.day=?"} ORDER BY r.day DESC, r.slot_start, r.created_at LIMIT 300`)
        .bind(...(archived ? [url.searchParams.get("from") || istDay(Date.now() - 30 * 864e5), url.searchParams.get("to") || istDay()] : [day])).all();
      return json({ day, rundowns: results, types: ITEM_TYPES }, 200, { "cache-control": "no-store" });
    }
    if (!id && method === "POST") {
      if (b.templateId) { const t = await env.DB.prepare("SELECT * FROM rundown_templates WHERE id=?").bind(b.templateId).first(); if (!t) return err("Template not found.", 404); return ok({ id: await makeFromTemplate(env, t, b.day || istDay(), user.id) }); }
      const title = clean(b.title, 120); if (title.length < 2) return err("Give the rundown a name (the show).");
      const id2 = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO rundowns (id,channel,day,title,slot_start,slot_minutes,created_by) VALUES (?,?,?,?,?,?,?)").bind(id2, CH.includes(b.channel) ? b.channel : "h", /^\d{4}-\d{2}-\d{2}$/.test(b.day || "") ? b.day : istDay(), title, /^\d{2}:\d{2}$/.test(b.slotStart || "") ? b.slotStart : "", Math.max(1, Math.min(720, Number(b.slotMinutes) || 30)), user.id).run();
      await audit("rundown.create", "rundown", id2, { title });
      return ok({ id: id2 });
    }
    const r = await env.DB.prepare("SELECT * FROM rundowns WHERE id=?").bind(id).first();
    if (!r) return err("Rundown not found.", 404);
    if (!sub && method === "GET") return json({ rundown: await getRundown(env, id) }, 200, { "cache-control": "no-store" });
    if (r.status === "archived" && method !== "GET" && sub !== "copy") return err("This rundown is archived. Make a copy to use it again.");
    if (!sub && method === "PUT") {
      await env.DB.prepare("UPDATE rundowns SET title=?,slot_start=?,slot_minutes=?,channel=?,updated_at=? WHERE id=?").bind(clean(b.title ?? r.title, 120) || r.title, b.slotStart !== undefined ? (/^\d{2}:\d{2}$/.test(b.slotStart) ? b.slotStart : "") : r.slot_start, b.slotMinutes ? Math.max(1, Math.min(720, Number(b.slotMinutes) || 30)) : r.slot_minutes, CH.includes(b.channel) ? b.channel : r.channel, now(), id).run();
      await refresh(id); return ok();
    }
    if (!sub && method === "DELETE") { await env.DB.batch([env.DB.prepare("DELETE FROM rundown_items WHERE rundown_id=?").bind(id), env.DB.prepare("DELETE FROM rundowns WHERE id=?").bind(id)]); await audit("rundown.delete", "rundown", id, { title: r.title }); return ok(); }
    if (sub === "copy" && method === "POST") {
      const full = await getRundown(env, id), nid = crypto.randomUUID();
      await env.DB.batch([env.DB.prepare("INSERT INTO rundowns (id,channel,day,title,slot_start,slot_minutes,created_by) VALUES (?,?,?,?,?,?,?)").bind(nid, r.channel, b.day || istDay(), `${r.title}`, r.slot_start, r.slot_minutes, user.id),
        ...full.items.map((it, i) => env.DB.prepare("INSERT INTO rundown_items (id,rundown_id,pos,type,title,duration,data,script) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), nid, i, it.type, it.title, it.duration, JSON.stringify(it.data), it.script))]);
      return ok({ id: nid });
    }
    if (sub === "template" && method === "POST") {
      const full = await getRundown(env, id), tid = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO rundown_templates (id,channel,title,slot_start,slot_minutes,weekdays,items) VALUES (?,?,?,?,?,?,?)").bind(tid, r.channel, r.title, r.slot_start, r.slot_minutes, /^[0-6]{1,7}$/.test(b.weekdays || "") ? b.weekdays : "0123456", JSON.stringify(full.items.map(({ type, title, duration, data, script }) => ({ type, title, duration, data, script })))).run();
      return ok({ id: tid });
    }
    if (sub === "order" && method === "PUT") {
      const ids = (b.ids || []).map(String);
      await env.DB.batch(ids.map((x, i) => env.DB.prepare("UPDATE rundown_items SET pos=? WHERE id=? AND rundown_id=?").bind(i, x, id)));
      await env.DB.prepare("UPDATE rundowns SET updated_at=? WHERE id=?").bind(now(), id).run();
      await refresh(id); return ok();
    }
    if (sub === "onair" && method === "POST") {   // put the rundown on air (from item `index`)
      const air = await rundownForAir(env, id); if (!air?.items.length) return err("Add items to the rundown first.");
      const out = await control(r.channel, "rundown.load", { rundown: air, index: Number(b.index) || 0, auto: b.auto !== false });
      await audit("rundown.onair", "rundown", id, { index: b.index || 0 }); return ok(out);
    }
    if (sub === "items") {
      if (!itemId && method === "POST") {
        if (!ITEM_TYPES[b.type]) return err("Choose an item type.");
        const { n } = await env.DB.prepare("SELECT COALESCE(MAX(pos),-1)+1 AS n FROM rundown_items WHERE rundown_id=?").bind(id).first();
        const iid = crypto.randomUUID(), data = cleanData(b.type, b.data);
        const item = { type: b.type, data, duration: Math.max(1, Math.min(7200, Number(b.duration) || 30)) };
        await env.DB.prepare("INSERT INTO rundown_items (id,rundown_id,pos,type,title,duration,data,script) VALUES (?,?,?,?,?,?,?,?)").bind(iid, id, b.pos ?? n, b.type, clean(b.title, 200), itemDuration(item), JSON.stringify(data), String(b.script || "").slice(0, 20000)).run();
        await refresh(id); return ok({ id: iid });
      }
      const it = await env.DB.prepare("SELECT * FROM rundown_items WHERE id=? AND rundown_id=?").bind(itemId, id).first();
      if (!it) return err("Item not found.", 404);
      if (method === "PUT") {
        const data = b.data !== undefined ? cleanData(it.type, b.data) : parse(it.data, {});
        const dur = itemDuration({ type: it.type, data, duration: b.duration ?? it.duration });
        await env.DB.prepare("UPDATE rundown_items SET title=?,duration=?,data=?,script=?,status=? WHERE id=?").bind(b.title !== undefined ? clean(b.title, 200) : it.title, dur, JSON.stringify(data), b.script !== undefined ? String(b.script).slice(0, 20000) : it.script, ["ready", "played", "skipped"].includes(b.status) ? b.status : it.status, itemId).run();
        await refresh(id); return ok();
      }
      if (method === "DELETE") { await env.DB.prepare("DELETE FROM rundown_items WHERE id=?").bind(itemId).run(); await refresh(id); return ok(); }
    }
    return err("Not found.", 404);
  }
  if (p[0] === "templates") {
    const id = p[1];
    if (!id && method === "GET") { const { results } = await env.DB.prepare("SELECT id,channel,title,slot_start,slot_minutes,weekdays,active,json_array_length(items) AS items FROM rundown_templates ORDER BY channel, slot_start").all(); return json({ templates: results }, 200, { "cache-control": "no-store" }); }
    if (id && method === "PUT") { await env.DB.prepare("UPDATE rundown_templates SET active=?, weekdays=?, title=? WHERE id=?").bind(b.active === false ? 0 : 1, /^[0-6]{1,7}$/.test(b.weekdays || "") ? b.weekdays : "0123456", clean(b.title, 120) || "Show", id).run(); return ok(); }
    if (id && method === "DELETE") { await env.DB.prepare("DELETE FROM rundown_templates WHERE id=?").bind(id).run(); return ok(); }
  }
  if (p[0] === "asrun" && method === "GET") {
    const day = url.searchParams.get("day") || istDay(), ch = CH.includes(url.searchParams.get("channel")) ? url.searchParams.get("channel") : null;
    const { results } = await env.DB.prepare(`SELECT * FROM asrun WHERE day=? ${ch ? "AND channel=?" : ""} ORDER BY at LIMIT 3000`).bind(...(ch ? [day, ch] : [day])).all();
    return json({ day, asrun: results }, 200, { "cache-control": "no-store" });
  }
  if (p[0] === "proof" && method === "GET") {   // proof of play for a sponsor
    const from = url.searchParams.get("from") || istDay(Date.now() - 30 * 864e5), to = url.searchParams.get("to") || istDay(), sid = url.searchParams.get("sponsor") || "";
    const { results } = await env.DB.prepare(`SELECT a.day,a.at,a.channel,a.type,a.title,a.planned,a.actual,s.name AS sponsor FROM asrun a LEFT JOIN sponsors s ON s.id=a.sponsor_id WHERE a.sponsor_id IS NOT NULL ${sid ? "AND a.sponsor_id=?" : ""} AND a.day>=? AND a.day<=? ORDER BY a.at LIMIT 20000`).bind(...(sid ? [sid, from, to] : [from, to])).all();
    if (url.searchParams.get("format") === "csv") {
      const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = ["Date,Time (IST),Channel,Sponsor,What,Seconds", ...results.map(r => [r.day, new Date(Date.parse(r.at) + 5.5 * 3600e3).toISOString().slice(11, 19), r.channel === "h" ? "Horizontal" : "Vertical", r.sponsor, r.type === "adbox" ? "Ad box" : r.title, r.actual || r.planned].map(q).join(","))].join("\r\n");
      return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="proof-of-play-${from}-${to}.csv"` } });
    }
    return json({ from, to, rows: results }, 200, { "cache-control": "no-store" });
  }
  return err("Not found.", 404);
}

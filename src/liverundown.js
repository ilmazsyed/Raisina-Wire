// The Live Rundown (liverundown.html): each channel's day as 48 half-hour wheels, India time.
//   - The plan: the fixed items of the channel's clock in each half-hour (the bulletins at :00, :15,
//     :30 and :45, HEADLINES at the Headlines desk's minutes, the segments at :08, :22 and after the
//     quick bulletins), with the desk's changes: a fixed item skipped, or an AVO story, a video or a
//     segment put in at a time. Autopilot follows them (src/engine.js, st.tv.lrd).
//   - What aired: the as-run log. The broadcast output logs every autopilot item (POST
//     /api/tv/asrun), the control room logs what it puts on air (src/control.js).
//   - The as-run report: the day's log as a printable page or a CSV file (the desk).
// The changes are kept in settings under `lrd:<channel>`; a change whose time has passed is dropped.
import { clockOf, SEG_NAMES } from "./segments.js";
import { headsSettings } from "./headlines.js";

const IST = 5.5 * 3600e3;
export const istDayOf = (t = Date.now()) => new Date(t + IST).toISOString().slice(0, 10);
const dayStart = day => Date.parse(`${day}T00:00:00+05:30`);
const key = ch => `lrd:${ch}`;

export async function lrdEdits(env, ch) {
  let v = {};
  try { v = JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key(ch)).first())?.value || "{}"); } catch { /* none */ }
  const cut = Date.now() - 3 * 3600e3, live = k => Number(String(k).split(":")[1]) > cut;
  return { skip: (v.skip || []).filter(live), adds: (v.adds || []).filter(a => a.daily || a.at > cut),
    shift: Object.fromEntries(Object.entries(v.shift || {}).filter(([k]) => live(k))), notes: Object.fromEntries(Object.entries(v.notes || {}).filter(([k]) => !/^[bhsc]:/.test(k) || live(k))) };
}
// An item repeated daily, at its time of day: today's and tomorrow's.
const DAY = 864e5;
function expandDaily(adds) {
  const out = [];
  for (const a of adds) {
    if (!a.daily) { out.push(a); continue; }
    const tod = ((a.at + IST) % DAY + DAY) % DAY, d0 = dayStart(istDayOf());
    for (const at of [d0 + tod - DAY, d0 + tod, d0 + tod + DAY]) out.push({ ...a, at, id: `${a.id}@${istDayOf(at)}` });
  }
  return out;
}
// What the screens get with the channel's state: the changes still to come (and the last hour's).
export async function lrdForScreens(env, ch) {
  const e = await lrdEdits(env, ch), cut = Date.now() - 3600e3;
  return { skip: e.skip.filter(k => Number(String(k).split(":")[1]) > cut), adds: expandDaily(e.adds).filter(a => a.at > cut), shift: e.shift };
}

// The channel's clock for a day: each fixed item with its time (ms), kind and key.
function plan(day, clock, headMins) {
  const t0 = dayStart(day), out = [];
  const dpOf = h => { const order = Object.entries(clock).sort((a, b) => a[1].from - b[1].from); let dp = order[order.length - 1]; for (const e of order) if (h >= e[1].from) dp = e; return dp?.[1]; };
  for (let half = 0; half < 48; half++) {
    const at0 = t0 + half * 1800e3, h = Math.floor(half / 2), dp = dpOf(h) || {};
    for (const q of [0, 15]) {
      const at = at0 + q * 60e3, full = q === 0;
      out.push({ at, kind: "bulletin", key: `b:${at}`, title: full ? "সংবাদ বুলেটিন" : "খবর সংক্ষেপে", dur: full ? 120 : 65 });
      // (slot c: a fixed turn through the daypart's list, one for each half-hour of the day)
      if (!full) { const list = dp.c || [], name = list[half % Math.max(1, list.length)]; if (name) out.push({ at: at + 65e3, kind: "segment", key: `c:${at}`, title: SEG_NAMES[name] || name, name, dur: 70, after: true }); }
    }
    for (const [k, m] of [["a", 8], ["b", 22]]) {
      const at = at0 + m * 60e3, list = dp[k] || [], name = list[Math.floor(at / 1800e3) % Math.max(1, list.length)];
      if (name) out.push({ at, kind: "segment", key: `s:${at}`, title: SEG_NAMES[name] || name, name, dur: 70 });
    }
  }
  for (let h = 0; h < 24; h++) for (const m of headMins) { const at = t0 + h * 3600e3 + m * 60e3; out.push({ at, kind: "heads", key: `h:${at}`, title: "HEADLINES", dur: 125 }); }
  return out.sort((a, b) => a.at - b.at);
}

// /api/admin/lrd?ch=&day=  GET: the day (plan, changes, as-run); PUT {ch, skip, adds}: the changes.
// /api/admin/lrd/report?ch=&day=&format=csv: the as-run report.
export async function handleLrd(request, env, url, user, { json, err, audit, settingsOf }) {
  const ch = ["h", "v"].includes(url.searchParams.get("ch")) ? url.searchParams.get("ch") : "h";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("day") || "") ? url.searchParams.get("day") : istDayOf();
  if (url.pathname.endsWith("/report") && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT at, ended_at, type, title, planned, actual, how FROM asrun WHERE channel=? AND day=? ORDER BY at LIMIT 5000").bind(ch, day).all().catch(() => ({ results: [] }));
    if (url.searchParams.get("format") === "csv") {
      const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const t = v => v ? new Date(Date.parse(v) + IST).toISOString().slice(11, 19) : "";
      const rows = [["Time (IST)", "Ended", "Type", "Title", "Planned (s)", "Actual (s)", "How"], ...results.map(r => [t(r.at), t(r.ended_at), r.type, r.title, r.planned, r.actual, r.how])];
      return new Response("﻿" + rows.map(r => r.map(q).join(",")).join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="rashtrix-asrun-${ch}-${day}.csv"`, "cache-control": "no-store" } });
    }
    return json({ day, ch, rows: results }, 200, { "cache-control": "no-store" });
  }
  if (request.method === "GET") {
    const s = await settingsOf(ch), heads = await headsSettings(env).catch(() => null);
    const items = plan(day, clockOf(s), heads?.on === false ? [] : heads?.mins || [58, 28]);
    const edits = await lrdEdits(env, ch); edits.adds = expandDaily(edits.adds).filter(a => a.at >= dayStart(day) - 3600e3 && a.at < dayStart(day) + DAY + 3600e3);
    let log = []; try { log = JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(`lrdlog:${ch}`).first())?.value || "[]"); } catch { /* none */ }
    const { results } = await env.DB.prepare("SELECT at, ended_at, type, title, planned, actual, how FROM asrun WHERE channel=? AND day=? ORDER BY at LIMIT 5000").bind(ch, day).all().catch(() => ({ results: [] }));
    return json({ day, ch, now: Date.now(), items, edits, asrun: results, log }, 200, { "cache-control": "no-store" });
  }
  if (request.method === "PUT") {
    const b = await request.json().catch(() => ({})), c = ["h", "v"].includes(b.ch) ? b.ch : ch, cut = Date.now() - 3600e3;
    const skip = [...new Set((Array.isArray(b.skip) ? b.skip : []).map(String).filter(k => /^[bhsc]:\d{12,14}$/.test(k) && Number(k.split(":")[1]) > cut))].slice(0, 500);
    // (an item repeated daily keeps its first id; the copies the screens see carry the day after "@")
    const adds = (Array.isArray(b.adds) ? b.adds : []).map(a => ({ id: /^[\w-]{6,40}$/.test(String(a?.id || "").split("@")[0]) ? String(a.id).split("@")[0] : crypto.randomUUID(), at: Math.round(Number(a?.at) || 0), kind: ["avo", "video", "seg", "card"].includes(a?.kind) ? a.kind : "", ref: String(a?.ref || "").slice(0, 200), title: String(a?.title || "").replace(/\s+/g, " ").trim().slice(0, 160), dur: Math.max(0, Math.min(7200, Math.round(Number(a?.dur) || 0))), daily: !!a?.daily }))
      .filter((a, i, all) => a.kind && a.ref && (a.daily || a.at > cut) && (a.kind !== "seg" || SEG_NAMES[a.ref]) && all.findIndex(x => x.id === a.id) === i).sort((x, y) => x.at - y.at).slice(0, 200);
    const shift = Object.fromEntries(Object.entries(b.shift && typeof b.shift === "object" ? b.shift : {}).filter(([k, v]) => /^[bhs]:\d{12,14}$/.test(k) && Number(k.split(":")[1]) > cut && Number(v) > 0).slice(0, 200).map(([k, v]) => [k, Math.min(10, Math.round(Number(v)))]));
    const notes = Object.fromEntries(Object.entries(b.notes && typeof b.notes === "object" ? b.notes : {}).map(([k, v]) => [String(k).slice(0, 60), String(v || "").replace(/\s+/g, " ").trim().slice(0, 300)]).filter(([, v]) => v).slice(0, 300));
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key(c), JSON.stringify({ skip, adds, shift, notes })).run();
    // The history: who changed what, the last 60 changes.
    let log = []; try { log = JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(`lrdlog:${c}`).first())?.value || "[]"); } catch { /* none */ }
    log = [{ at: new Date().toISOString(), by: user.display_name || user.email || "", what: String(b.what || "Changed the rundown").slice(0, 160) }, ...log].slice(0, 60);
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(`lrdlog:${c}`, JSON.stringify(log)).run();
    await audit("lrd.update", "settings", key(c), { skip: skip.length, adds: adds.length, what: String(b.what || "").slice(0, 80) });
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  return err("Not found.", 404);
}

// POST /api/tv/asrun {ch, key, type, title, dur}: an autopilot item the broadcast output put on air.
export async function asrunPost(env, b, outputOk) {
  if (!outputOk) return { ok: false };
  const type = String(b.type || "").slice(0, 20); if (!type) return { ok: false };
  const at = new Date().toISOString();
  await env.DB.prepare("INSERT INTO asrun (id,channel,day,at,type,title,planned,how) VALUES (?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), b.ch, istDayOf(), at, type, String(b.title || "").replace(/\s+/g, " ").trim().slice(0, 200), Math.max(0, Math.round(Number(b.dur) || 0)), "autopilot").run().catch(() => {});
  return { ok: true };
}

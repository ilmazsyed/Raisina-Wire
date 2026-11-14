// The Segment & bulletin desk (progdesk.html): every news bulletin and segment the broadcast
// output airs is recorded here with its stories (src/engine.js progRecord). The desk lists the last
// two days (today and yesterday), and each can be edited (headlines and lines; a story whose words
// change loses its recorded voice), played at once on TV and/or Shorts, archived (kept, and out of
// the two-day list) or deleted. Unarchived records go after seven days (cron).
const KINDS = ["bulletin", "segment"];
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// From the broadcast output (checked by its key).
export async function progPlayed(env, b, outputOk) {
  if (!outputOk || !KINDS.includes(b.kind) || !Array.isArray(b.items) || !b.items.length) return { ok: false };
  const slot = new Date(Date.parse(b.slot) || Date.now()).toISOString(), items = JSON.stringify(b.items.slice(0, 20));
  if (items.length > 200000) return { ok: false };
  await env.DB.prepare("INSERT OR IGNORE INTO programmes (id,kind,name,title,channel,slot_at,short,items) VALUES (?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), b.kind, clip(b.name, 40), clip(b.title, 120), b.ch, slot, b.short ? 1 : 0, items).run();
  return { ok: true };
}

export async function progHousekeeping(env) {
  await env.DB.prepare("DELETE FROM programmes WHERE status<>'archived' AND slot_at < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString()).run().catch(() => {});
}

const row = r => ({ id: r.id, kind: r.kind, name: r.name, title: r.title, channel: r.channel, slot: r.slot_at, short: !!r.short, status: r.status, edited: !!r.edited, plays: r.plays, items: JSON.parse(r.items || "[]"), updatedAt: r.updated_at });

// An item's length on air (the bulletin's stories; a segment's items).
export function progDuration(p) {
  if (p.kind === "bulletin") return Math.min(300, Math.round(12 + p.items.reduce((n, x) => n + (x.secs ? Math.max(8, x.secs + 1) : 12), 0)));
  return Math.min(600, Math.round(4 + p.items.reduce((n, x) => n + (Number(x.d0) || 8), 0)));
}

// The desk's API: /api/admin/progs[/:id[/play|/archive]]
export async function handleProgs(request, env, url, user, { json, err, audit, play }) {
  const [, , , , id, sub] = url.pathname.split("/").map(decodeURIComponent), m = request.method, b = m === "GET" ? {} : await request.json().catch(() => ({}));
  if (!id && m === "GET") {
    const archived = url.searchParams.get("archived") === "1";
    // Today and yesterday (India time), or everything archived.
    const ist = new Date(Date.now() + 5.5 * 3600e3), since = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - 1) - 5.5 * 3600e3).toISOString();
    const { results } = archived
      ? await env.DB.prepare("SELECT * FROM programmes WHERE status='archived' ORDER BY slot_at DESC LIMIT 300").all()
      : await env.DB.prepare("SELECT * FROM programmes WHERE status<>'archived' AND slot_at>=? ORDER BY slot_at DESC, channel LIMIT 600").bind(since).all();
    return json({ progs: results.map(row) }, 200, { "cache-control": "no-store" });
  }
  const r = id ? await env.DB.prepare("SELECT * FROM programmes WHERE id=?").bind(id).first() : null;
  if (!r) return err("Not found.", 404);
  const p = row(r);
  if (!sub && m === "PUT") {
    // The stories as edited: each keeps its fields; a headline or line that changed loses its voice.
    const old = new Map(p.items.map((x, i) => [i, x]));
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 20).map(x => {
      const o = old.get(Number(x.i)); if (!o) return null;
      const n = { ...o };
      if (p.kind === "bulletin") { const t = clip(x.title ?? o.title, 300), tx = clip(x.text ?? o.text, 600); if (t !== o.title || tx !== (o.text || "")) { n.title = t; n.text = tx; delete n.voice; delete n.secs; } }
      else if (!o.lead && !o.map && !o.wx && !o.timeline && !o.pts && !o.photo) { const t = clip(x.title ?? o.t, 300), l = clip(x.text ?? o.line, 600); if (t !== (o.t || "") || l !== (o.line || "")) { n.t = t; n.line = l; delete n.voice; } }
      return n;
    }).filter(Boolean);
    if (!items.length) return err("Keep at least one story.");
    await env.DB.prepare("UPDATE programmes SET items=?, title=?, edited=1, updated_at=? WHERE id=?").bind(JSON.stringify(items), clip(b.title ?? p.title, 120), new Date().toISOString(), id).run();
    await audit("prog.edit", "prog", id, { kind: p.kind, items: items.length });
    return json({ ok: true });
  }
  if (sub === "archive" && m === "POST") {
    await env.DB.prepare("UPDATE programmes SET status=?, updated_at=? WHERE id=?").bind(b.on === false ? "active" : "archived", new Date().toISOString(), id).run();
    await audit(b.on === false ? "prog.unarchive" : "prog.archive", "prog", id, {}); return json({ ok: true });
  }
  if (!sub && m === "DELETE") { await env.DB.prepare("DELETE FROM programmes WHERE id=?").bind(id).run(); await audit("prog.delete", "prog", id, { kind: p.kind }); return json({ ok: true }); }
  if (sub === "play" && m === "POST") {
    const chs = (Array.isArray(b.channels) ? b.channels : [p.channel]).filter(c => ["h", "v"].includes(c));
    if (!chs.length) return err("Choose a channel.");
    const dur = progDuration(p), title = p.kind === "bulletin" ? "News bulletin" : `Segment: ${p.title || p.name}`;
    const scene = { label: title, layout: "graphic", sources: [], full: true, dur,
      graphic: p.kind === "bulletin" ? { kind: "bulletin", stories: p.items, replay: 1 } : { kind: "seg", name: p.name, head: 4, items: p.items, replay: 1 } };
    for (const ch of chs) await play(ch, { id: `prog:${id}:${Date.now()}`, title: `${title} (again)`.slice(0, 120), items: [{ id: `prog:${id}`, type: p.kind === "bulletin" ? "bulletin" : "segment", title, dur, scene }] });
    await env.DB.prepare("UPDATE programmes SET plays=plays+1 WHERE id=?").bind(id).run();
    await audit("prog.play", "prog", id, { channels: chs });
    return json({ ok: true, seconds: dur });
  }
  return err("Not found.", 404);
}

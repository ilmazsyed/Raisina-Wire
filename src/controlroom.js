// The control room's server side: realtime control (WebSockets to the channel's Durable Object),
// commands from the PCR and from Bitfocus Companion, rundowns, clips, macros.
import { checkKey, copyImage } from "./tvchannel.js";
import { handleRundowns } from "./rundown.js";
import { handleClips, markClipUsed } from "./clips.js";

const CH = ["h", "v"];
// Commands that change what goes on air are written to the audit log (who did what, when).
const QUIET = new Set(["preview", "rundown.refresh"]);

export const ctlStub = (env, name) => env.CONTROL.get(env.CONTROL.idFromName(name));
// Send one command to a channel's control and return its answer.
export async function control(env, ch, cmd, args = {}, by = "", how = "") {
  if (!env.CONTROL) return { ok: false, error: "Realtime control is not set up." };
  const r = await ctlStub(env, `ctl:${ch}`).fetch("https://ctl/cmd", { method: "POST", headers: { "x-ctl-name": `ctl:${ch}`, "content-type": "application/json" }, body: JSON.stringify({ cmd, args, by, how }) });
  return r.json();
}

// Who is this connection? An output key → output; a staff session → pcr; otherwise a viewer.
async function roleFor(request, env, url, ch, currentUser, isStaff) {
  if (url.searchParams.get("key") && await checkKey(env, ch, url.searchParams.get("key"))) return { role: "output", who: `out-${crypto.randomUUID().slice(0, 8)}` };
  if ((request.headers.get("cookie") || "").includes("rw_session")) { const u = await currentUser(request, env).catch(() => null); if (isStaff(u)) return { role: "pcr", who: `pcr-${u.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 4)}`, user: u }; }
  return { role: "viewer", who: `v-${crypto.randomUUID().slice(0, 8)}` };
}

async function companionToken(env, make = false) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='companion_token'").first();
  if (row?.value && !make) return row.value;
  if (!make) return null;
  const t = [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('companion_token',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(t).run();
  return t;
}
// Bitfocus Companion ("Generic HTTP" buttons) and Stream Deck: one address per action.
//   /api/companion/<h|v>/<action>?token=…          take, auto, next, prev, skip, dump, standby, standby-off,
//   cut, mix, wipe, stinger, breaking-clear, lower-clear, ticker-on/off, bug-on/off, delay-<0..10>,
//   macro-<id>
async function companion(env, ch, action, audit) {
  const map = {
    take: ["take", {}], auto: ["auto", {}], next: ["rundown.next", {}], prev: ["rundown.prev", {}], skip: ["rundown.skip", {}],
    dump: ["dump", {}], standby: ["standby", { on: true }], "standby-off": ["standby", { on: false }],
    cut: ["transition", { type: "cut", ms: 0 }], mix: ["transition", { type: "mix", ms: 600 }], wipe: ["transition", { type: "wipe", ms: 700 }], stinger: ["transition", { type: "stinger", ms: 1200 }],
    "breaking-clear": ["breaking", { clear: true }], "lower-clear": ["lower", {}]
  };
  let step = map[action];
  const layer = action.match(/^(bug|live|clock|lower|ticker|ad|weather)-(on|off)$/);
  if (layer) step = ["layers", { [layer[1]]: layer[2] === "on" }];
  const delay = action.match(/^delay-(\d{1,2})$/);
  if (delay) step = ["delay", { seconds: Number(delay[1]) }];
  const macro = action.match(/^macro-([\w-]{4,64})$/);
  if (macro) {
    const m = await env.DB.prepare("SELECT * FROM macros WHERE id=?").bind(macro[1]).first();
    if (!m) return { ok: false, error: "No such macro." };
    step = ["macro", { actions: JSON.parse(m.actions || "[]").filter(a => a.cmd !== "macro") }];
  }
  if (!step) return { ok: false, error: "Unknown action." };
  const out = await control(env, ch, step[0], step[1], "companion", "companion");
  if (!QUIET.has(step[0])) await audit({ id: "companion" }, `ctl.${step[0]}`, "channel", ch, { args: step[1], via: "companion" }).catch(() => {});
  return out;
}

// Returns a Response, or null when the path is not the control room's.
export async function handleControlRoom(request, env, url, { json, err, currentUser, isStaff, auditFn }) {
  const p = url.pathname;
  // Realtime: /api/ws/ctl/<h|v>
  const ws = p.match(/^\/api\/ws\/ctl\/(h|v)$/);
  if (ws) {
    if (request.headers.get("upgrade") !== "websocket") return err("WebSocket expected.", 426);
    if (!env.CONTROL) return err("Realtime control is not set up.", 503);
    const { role, who } = await roleFor(request, env, url, ws[1], currentUser, isStaff);
    const h = new Headers(request.headers); h.set("x-ctl-name", `ctl:${ws[1]}`); h.set("x-ctl-role", role); h.set("x-ctl-who", who);
    return ctlStub(env, `ctl:${ws[1]}`).fetch(new Request("https://ctl/ws", { headers: h }));
  }
  // The channel's control state, for screens without WebSockets (public: it is what is on air).
  const st = p.match(/^\/api\/ctl\/(h|v)\/state$/);
  if (st && request.method === "GET") {
    if (!env.CONTROL) return json({ state: null, serverTime: Date.now() }, 200, { "cache-control": "no-store" });
    const r = await ctlStub(env, `ctl:${st[1]}`).fetch("https://ctl/state", { headers: { "x-ctl-name": `ctl:${st[1]}` } });
    const d = await r.json();
    const user = (request.headers.get("cookie") || "").includes("rw_session") ? await currentUser(request, env).catch(() => null) : null;
    if (!isStaff(user)) delete d.health;   // output health is for the control room
    return json(d, 200, { "cache-control": "no-store" });
  }
  const comp = p.match(/^\/api\/companion\/(h|v)\/([\w-]{2,80})$/);
  if (comp && ["GET", "POST"].includes(request.method)) {
    const t = await companionToken(env);
    if (!t || url.searchParams.get("token") !== t) return err("Wrong or missing token.", 403);
    return json(await companion(env, comp[1], comp[2], (u, ...a) => auditFn(u, ...a)), 200, { "cache-control": "no-store" });
  }

  const staffPaths = /^\/api\/(ctl\/(h|v)\/cmd|admin\/(rundowns|templates|asrun|proof|clips|macros|companion|copy-image|inputs)(\/|$))/;
  if (!staffPaths.test(p)) return null;
  const user = await currentUser(request, env);
  if (!isStaff(user)) return err("Editor access required.", 403);
  const audit = (action, type, id, details) => auditFn(user, action, type, id, details);
  const helpers = { json, err, audit, control: (ch, cmd, args) => control(env, ch, cmd, args, user.display_name || user.email) };

  const cmd = p.match(/^\/api\/ctl\/(h|v)\/cmd$/);
  if (cmd && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (b.cmd === "rundown.load") return err("Put a rundown on air from the producer.");
    if (b.cmd === "macro" && b.args?.id) {
      const m = await env.DB.prepare("SELECT * FROM macros WHERE id=?").bind(b.args.id).first();
      if (!m) return err("No such macro.", 404);
      b.args = { actions: JSON.parse(m.actions || "[]").filter(a => !["macro", "rundown.load"].includes(a.cmd)) };
    }
    for (const s of [b.args?.scene, ...(b.args?.actions || []).map(a => a.args?.scene)].filter(Boolean))
      for (const src of s.sources || []) if (src.kind === "clip" && src.url) await markClipUsed(env, src.url);
    if (!env.CONTROL) return err("Realtime control is not set up. Deploy with the Durable Object (see the README).", 503);
    const out = await control(env, cmd[1], String(b.cmd || ""), b.args || {}, user.display_name || user.email, b.how || "");
    if (!QUIET.has(b.cmd) && out.ok) await audit(`ctl.${b.cmd}`, "channel", cmd[1], { args: b.cmd === "take" ? { label: b.args?.scene?.label || "preview" } : b.args });
    return json(out, out.ok ? 200 : 400, { "cache-control": "no-store" });
  }
  if (p.startsWith("/api/admin/clips")) return handleClips(request, env, url, user, helpers);
  // A picture pasted as a Google Drive link (or any https address) is copied into the app once.
  if (p === "/api/admin/copy-image" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (/^\/(media|brand)\/[\w.-]+$/.test(b.url || "")) return json({ url: b.url });
    try { return json({ url: await copyImage(env, b.url, user.id) }, 200, { "cache-control": "no-store" }); }
    catch (e) { return err(e.message); }
  }
  // The PCR's live inputs (HLS / WHEP streams, VDO.Ninja links, cameras) for each channel.
  const inp = p.match(/^\/api\/admin\/inputs\/(h|v)$/);
  if (inp) {
    const key = `pcr_inputs:${inp[1]}`;
    if (request.method === "PUT") {
      const b = await request.json().catch(() => ({}));
      const list = (Array.isArray(b.inputs) ? b.inputs : []).slice(0, 24).map(x => ({ id: String(x.id || crypto.randomUUID()).slice(0, 40), kind: ["hls", "whep", "vdo", "image", "yt"].includes(x.kind) ? x.kind : "hls", name: String(x.name || "").slice(0, 60), url: String(x.url || "").slice(0, 800) })).filter(x => /^https:\/\/|^\/(media|clips)\//.test(x.url) || x.kind === "yt");
      await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, JSON.stringify(list)).run();
      await audit("pcr.inputs", "channel", inp[1], { n: list.length });
      return json({ ok: true, inputs: list });
    }
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
    return json({ inputs: row ? JSON.parse(row.value) : [] }, 200, { "cache-control": "no-store" });
  }
  if (p.startsWith("/api/admin/companion")) {
    const t = request.method === "POST" ? await companionToken(env, true) : await companionToken(env);
    if (request.method === "POST") await audit("companion.token", "settings", "companion_token", {});
    return json({ token: t, base: `${url.origin}/api/companion/` }, 200, { "cache-control": "no-store" });
  }
  if (p.startsWith("/api/admin/macros")) {
    const id = p.split("/")[4], m = request.method, b = ["GET", "DELETE"].includes(m) ? {} : await request.json().catch(() => ({}));
    const clean = a => (Array.isArray(a) ? a : []).slice(0, 20).map(x => ({ cmd: String(x.cmd || "").slice(0, 30), args: x.args && typeof x.args === "object" ? x.args : {} })).filter(x => x.cmd && !["macro", "rundown.load"].includes(x.cmd));
    if (!id && m === "GET") { const { results } = await env.DB.prepare("SELECT * FROM macros ORDER BY sort, title").all(); return json({ macros: results.map(x => ({ ...x, actions: JSON.parse(x.actions) })) }, 200, { "cache-control": "no-store" }); }
    if (!id && m === "POST") { const nid = crypto.randomUUID(); await env.DB.prepare("INSERT INTO macros (id,title,hotkey,channel,actions,sort) VALUES (?,?,?,?,?,?)").bind(nid, String(b.title || "Macro").slice(0, 60), String(b.hotkey || "").slice(0, 20), CH.includes(b.channel) ? b.channel : "h", JSON.stringify(clean(b.actions)), Number(b.sort) || 0).run(); return json({ ok: true, id: nid }); }
    if (id && m === "PUT") { await env.DB.prepare("UPDATE macros SET title=?,hotkey=?,channel=?,actions=?,sort=? WHERE id=?").bind(String(b.title || "Macro").slice(0, 60), String(b.hotkey || "").slice(0, 20), CH.includes(b.channel) ? b.channel : "h", JSON.stringify(clean(b.actions)), Number(b.sort) || 0, id).run(); return json({ ok: true }); }
    if (id && m === "DELETE") { await env.DB.prepare("DELETE FROM macros WHERE id=?").bind(id).run(); return json({ ok: true }); }
    return err("Not found.", 404);
  }
  return handleRundowns(request, env, url, user, helpers);
}

// Realtime control for Rashtrix TV: one Durable Object per channel ("ctl:h", "ctl:v") and one per
// live-studio room ("room:<id>"). Screens connect over WebSocket and get every change in about a
// second: the OBS/vMix outputs, the PCR, the producer, the app's players and the studio's guests.
//
// A channel's state is what is on air and how:
//   mode       "auto"  the rundown (or, with no rundown running, the channel's running order)
//              "manual" a scene the PCR took, until it resumes the rundown or skips on
//   program    the scene on air in manual mode; preview: the scene waiting in preview
//   rundown    { id, title, index, itemStartedAt, auto, items:[{id,type,title,dur,scene}] }
//   transition { type: cut | mix | wipe | stinger, ms }
//   layers     which graphics are on: bug, live, clock, lower, ticker, ad, weather
//   lower      a name strap { name, title } (from a guest or typed in)
//   breaking   { text, music, seconds, at }
//   delay      seconds of broadcast delay on the outputs (0–10); dumpAt: the last DUMP
//   standby    { on, auto, reason }: the emergency slate
//   overlay    { poll, results, comments } on screen
//   sponsor    the ad-box sponsor now (rotated by weight)
// The Worker checks who may do what before it forwards anything here.

const now = () => Date.now();
const iso = (t = now()) => new Date(t).toISOString();
const istDay = (t = now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
const DEFAULT = {
  mode: "auto", program: null, preview: null, rundown: null,
  transition: { type: "mix", ms: 600 },
  layers: { bug: true, live: true, clock: true, lower: true, ticker: true, ad: true, weather: true },
  lower: null, breaking: null, delay: 0, dumpAt: 0, standby: { on: false, auto: false, reason: "" },
  overlay: { poll: null, results: null, comments: null }, sponsor: null, ticker: [], split: null, version: 0, updatedAt: 0
};

export class TvControl {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.state = null; this.health = {};
    this.ctx.blockConcurrencyWhile(async () => {
      this.state = { ...structuredClone(DEFAULT), ...((await this.ctx.storage.get("state")) || {}) };
      this.health = (await this.ctx.storage.get("health")) || {};
      this.name = (await this.ctx.storage.get("name")) || "";
    });
  }
  get channel() { return this.name.startsWith("ctl:") ? this.name.slice(4) : null; }
  get isRoom() { return this.name.startsWith("room:"); }

  async fetch(request) {
    const url = new URL(request.url);
    const name = request.headers.get("x-ctl-name");
    if (name && name !== this.name) { this.name = name; await this.ctx.storage.put("name", name); }
    if (request.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair(), [client, server] = Object.values(pair);
      const role = request.headers.get("x-ctl-role") || "viewer", who = request.headers.get("x-ctl-who") || crypto.randomUUID();
      this.ctx.acceptWebSocket(server, [role, who]);
      server.send(JSON.stringify(this.isRoom ? { type: "room", state: this.state.room || {} } : { type: "state", state: this.state, serverTime: now() }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/state") return Response.json({ state: this.isRoom ? this.state.room || {} : this.state, health: this.health, serverTime: now() });
    if (url.pathname === "/cmd" && request.method === "POST") {
      const b = await request.json();
      try { const out = this.isRoom ? await this.roomCommand(b) : await this.command(b.cmd, b.args || {}, b.by || "", b.how || ""); return Response.json({ ok: true, ...(out || {}) }); }
      catch (e) { return Response.json({ ok: false, error: e.message }, { status: 400 }); }
    }
    return new Response("not found", { status: 404 });
  }

  /* ---------- fan-out ---------- */
  broadcast(msg, roles = null) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (roles) { const tags = this.ctx.getTags(ws); if (!roles.some(r => tags.includes(r))) continue; }
      try { ws.send(text); } catch { /* closed */ }
    }
  }
  async save(push = true) {
    this.state.version++; this.state.updatedAt = now();
    await this.ctx.storage.put("state", this.state);
    if (push) this.broadcast({ type: "state", state: this.state, serverTime: now() });
    await this.armAlarm();
  }

  /* ---------- as-run log (proof of play) ---------- */
  async asrun(scene, how) {
    const db = this.env.DB, ch = this.channel; if (!db || !ch) return;
    const open = await this.ctx.storage.get("asrunOpen");
    const t = now();
    if (open) await db.prepare("UPDATE asrun SET ended_at=?, actual=? WHERE id=?").bind(iso(t), Math.round((t - open.at) / 1000), open.id).run().catch(() => {});
    if (!scene) { await this.ctx.storage.delete("asrunOpen"); return; }
    const id = crypto.randomUUID(), type = scene.graphic?.kind || scene.sources?.[0]?.kind || scene.layout || "scene";
    await db.prepare("INSERT INTO asrun (id,channel,day,at,rundown_id,item_id,type,title,planned,how) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, ch, istDay(t), iso(t), this.state.rundown?.id || null, scene.itemId || null, String(type), String(scene.label || "").slice(0, 200), Math.round(scene.dur || 0), how || "auto").run().catch(() => {});
    await this.ctx.storage.put("asrunOpen", { id, at: t });
  }
  // Which scene is on air now (auto mode: the rundown item, or the running order).
  onAir() {
    const s = this.state;
    if (s.mode === "manual" && s.program) return s.program;
    const r = s.rundown; if (r && r.items[r.index]) return r.items[r.index].scene;
    return { layout: "full", sources: [{ kind: "continuity" }], label: "Running order", dur: 0 };
  }

  /* ---------- commands ---------- */
  async command(cmd, a, by, how) {
    const s = this.state;
    switch (cmd) {
      case "preview": s.preview = a.scene || null; break;
      case "take": {   // cut to a scene now (pauses a running rundown)
        const scene = a.scene || s.preview; if (!scene) throw new Error("Nothing in preview to take.");
        if (s.rundown && s.mode === "auto") s.rundown.pausedAt = now();
        s.program = { ...scene, takenAt: now() }; s.mode = "manual"; s.standby = { on: false, auto: false, reason: "" };
        if (a.transition) s.transition = a.transition;
        await this.asrun(s.program, how || "take"); break;
      }
      case "auto": {   // back to the rundown where it paused (or the running order)
        if (s.rundown?.pausedAt) { s.rundown.itemStartedAt += now() - s.rundown.pausedAt; s.rundown.pausedAt = null; }
        s.mode = "auto"; s.program = null; s.standby = { on: false, auto: false, reason: "" };
        await this.asrun(this.onAir(), "auto"); break;
      }
      case "autopilot": {   // AUTOPILOT on: the channel's own running order goes on air (any rundown stops)
        if (a.on === false) break;   // switching it off happens by taking something else on air
        s.rundown = null; s.mode = "auto"; s.program = null; s.standby = { on: false, auto: false, reason: "" };
        await this.asrun(this.onAir(), how || "autopilot"); break;
      }
      case "transition": s.transition = { type: ["cut", "mix", "wipe", "stinger"].includes(a.type) ? a.type : "mix", ms: Math.max(0, Math.min(3000, Number(a.ms) || 600)) }; break;
      case "layers": s.layers = { ...s.layers, ...Object.fromEntries(Object.entries(a).filter(([k]) => k in DEFAULT.layers).map(([k, v]) => [k, !!v])) }; break;
      case "lower": s.lower = a && a.name ? { name: String(a.name).slice(0, 80), title: String(a.title || "").slice(0, 120) } : null; break;
      case "ticker": s.ticker = (a.lines || []).map(x => String(x).slice(0, 160)).filter(Boolean).slice(0, 20); break;
      case "breaking": {
        s.breaking = a.clear ? null : { text: String(a.text || "").slice(0, 160), music: a.music !== false, seconds: Math.max(5, Math.min(60, Number(a.seconds) || 20)), at: a.at && !isNaN(Date.parse(a.at)) ? a.at : iso() };
        if (s.breaking && !s.breaking.text) throw new Error("Write the breaking headline.");
        if (s.breaking) await this.asrun({ label: s.breaking.text, graphic: { kind: "breaking" }, dur: s.breaking.seconds }, "breaking");
        break;
      }
      // The live split (Breaking desk): a YouTube live at 60, the desk's pointers at 40, in sets of
      // three that take turns on screen.
      case "split": s.split = a && a.on ? { on: true, every: Math.max(6, Math.min(30, Math.round(Number(a.every) || 10))), title: String(a.title || "").slice(0, 80),
          sets: (Array.isArray(a.sets) ? a.sets : []).slice(0, 8).map(x => (Array.isArray(x) ? x : []).map(t => String(t || "").slice(0, 160)).filter(Boolean).slice(0, 3)).filter(x => x.length) } : null; break;
      case "delay": s.delay = Math.max(0, Math.min(10, Math.round(Number(a.seconds) || 0))); break;
      case "dump": s.dumpAt = now(); s.standby = { on: true, auto: false, reason: "dump" }; await this.asrun({ label: "DUMP", graphic: { kind: "standby" } }, "dump"); break;
      case "standby": s.standby = { on: !!a.on, auto: !!a.auto, reason: String(a.reason || "").slice(0, 120) }; if (a.on) await this.asrun({ label: "Standby", graphic: { kind: "standby" } }, "standby"); break;
      case "overlay": s.overlay = { ...s.overlay, ...Object.fromEntries(["poll", "results", "comments"].filter(k => k in a).map(k => [k, a[k] || null])) }; break;
      case "rundown.load": {   // a rundown with its items as scenes (from the Worker)
        const r = a.rundown; if (!r?.items?.length) throw new Error("This rundown has no items.");
        s.rundown = { id: r.id, title: r.title, items: r.items, index: Math.max(0, Math.min(r.items.length - 1, Number(a.index) || 0)), itemStartedAt: now(), auto: a.auto !== false, pausedAt: null };
        s.mode = "auto"; s.program = null;
        await this.asrun(this.onAir(), "auto"); break;
      }
      case "rundown.refresh": {   // the producer changed items: keep the position by item id
        if (!s.rundown || s.rundown.id !== a.rundown?.id) return { ignored: true };
        const cur = s.rundown.items[s.rundown.index]?.id, items = a.rundown.items, i = items.findIndex(x => x.id === cur);
        s.rundown.items = items; s.rundown.title = a.rundown.title;
        if (i >= 0) s.rundown.index = i; else s.rundown.index = Math.min(s.rundown.index, items.length - 1);
        break;
      }
      case "rundown.goto": case "rundown.next": case "rundown.prev": case "rundown.skip": {
        const r = s.rundown; if (!r) throw new Error("No rundown is running.");
        const to = cmd === "rundown.goto" ? Number(a.index) : r.index + (cmd === "rundown.prev" ? -1 : 1);
        if (cmd === "rundown.skip" && r.items[r.index]) r.items[r.index].skipped = true;
        if (to >= r.items.length) { s.rundown = null; s.mode = "auto"; s.program = null; await this.asrun(this.onAir(), "auto"); break; }
        r.index = Math.max(0, to); r.itemStartedAt = now(); r.pausedAt = null; s.mode = "auto"; s.program = null;
        await this.asrun(this.onAir(), how || "auto"); break;
      }
      case "rundown.auto": if (s.rundown) { s.rundown.auto = !!a.on; if (a.on) s.rundown.itemStartedAt = now(); } break;
      case "rundown.stop": s.rundown = null; s.mode = "auto"; s.program = null; await this.asrun(this.onAir(), "auto"); break;
      case "sponsor": s.sponsor = a.sponsor || null; break;
      case "macro": for (const step of (a.actions || []).slice(0, 20)) await this.command(step.cmd, step.args || {}, by, "macro"); return { ran: (a.actions || []).length };
      default: throw new Error(`Unknown command: ${cmd}`);
    }
    await this.save();
    return { version: s.version };
  }

  /* ---------- the clock: rundown items end, sponsors rotate, outputs are watched ---------- */
  async armAlarm() {
    const s = this.state; let next = now() + 15000;
    const r = s.rundown;
    if (r && s.mode === "auto" && r.auto && !r.pausedAt && r.items[r.index]) next = Math.min(next, r.itemStartedAt + r.items[r.index].dur * 1000);
    if (this.channel) next = Math.min(next, (s.sponsorUntil || 0) || next);
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > next || cur < now()) await this.ctx.storage.setAlarm(Math.max(now() + 200, next));
  }
  async alarm() {
    if (this.isRoom) return;
    const s = this.state, t = now();
    let changed = false;
    const r = s.rundown;
    if (r && s.mode === "auto" && r.auto && !r.pausedAt && r.items[r.index] && t >= r.itemStartedAt + r.items[r.index].dur * 1000 - 150) {
      if (r.index + 1 < r.items.length) { r.index++; r.itemStartedAt = t; }
      else s.rundown = null;
      await this.asrun(this.onAir(), "auto"); changed = true;
    }
    if (t >= (s.sponsorUntil || 0)) { await this.rotateSponsor(); changed = true; }
    if (this.checkHealth()) changed = true;
    if (changed) await this.save(); else await this.armAlarm();
  }
  async rotateSponsor() {
    const s = this.state, db = this.env.DB; if (!db) return;
    const day = iso();
    const { results } = await db.prepare("SELECT id,name,image,line1,line2,line3,weight,seconds FROM sponsors WHERE active=1 AND (starts IS NULL OR starts<=?) AND (ends IS NULL OR ends>=?)").bind(day, day).all().catch(() => ({ results: [] }));
    if (!results.length) { s.sponsor = null; s.sponsorUntil = now() + 60000; return; }
    const total = results.reduce((n, x) => n + Math.max(1, x.weight), 0);
    let pick = Math.random() * total, chosen = results[0];
    for (const x of results) { pick -= Math.max(1, x.weight); if (pick <= 0) { chosen = x; break; } }
    s.sponsor = chosen; s.sponsorUntil = now() + Math.max(5, chosen.seconds) * 1000;
    // Proof of play: every ad-box showing is logged.
    await db.prepare("INSERT INTO asrun (id,channel,day,at,ended_at,type,title,planned,actual,sponsor_id,how) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), this.channel, istDay(), iso(), iso(s.sponsorUntil), "adbox", chosen.name, chosen.seconds, chosen.seconds, chosen.id, "auto").run().catch(() => {});
  }
  // Outputs report every 5 s. One silent for 30 s, or a source stalled for 10 s, raises the alarm:
  // the standby slate goes up and staff get a push alert.
  checkHealth() {
    const s = this.state, t = now(); let changed = false;
    // (an output closed on purpose, the tab shut or the page reloaded, never counts as gone quiet)
    const outs = Object.entries(this.health).filter(([, h]) => h.role === "output" && !h.closed);
    const stalled = outs.find(([, h]) => t - h.seen < 30000 && h.stalledFor >= 10);
    const silent = outs.find(([, h]) => t - h.seen >= 30000 && t - h.seen < 120000);
    if (stalled && !s.standby.on) { s.standby = { on: true, auto: true, reason: "A source stopped for 10 seconds" }; changed = true; this.alertStaff(`Rashtrix TV ${this.channel}: standby slate is up`, `A source stopped on output ${stalled[0]}.`); }
    if (!stalled && s.standby.on && s.standby.auto) { s.standby = { on: false, auto: false, reason: "" }; changed = true; }
    // An output that went quiet only matters when no other output of the channel is on (a reload
    // or a restart comes back as a new one at once): then staff get one alert, in plain words.
    const alive = outs.some(([, h]) => t - h.seen < 30000);
    if (silent && !this.health[silent[0]].alerted) {
      this.health[silent[0]].alerted = true;
      if (!alive) { const name = this.channel === "v" ? "Rashtrix Shorts" : "Rashtrix TV"; this.alertStaff(`${name}: the broadcast output stopped`, `The ${name} output page (OBS or the streaming machine) has not reported for 30 seconds. Check that it is open and online.`); }
    }
    for (const [id, h] of Object.entries(this.health)) if (t - h.seen > 6 * 3600e3) delete this.health[id];
    this.ctx.storage.put("health", this.health);
    return changed;
  }
  alertStaff(title, body) {
    if (!this.env.DB) return;
    this.ctx.waitUntil(import("./push.js").then(m => m.staffAlert(this.env, { title, body, url: "/pcr.html" })).catch(() => {}));
  }

  /* ---------- WebSocket messages ---------- */
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const [role, who] = this.ctx.getTags(ws);
    if (m.type === "hb") {   // output and viewer heartbeats
      const prev = this.health[who] || {};
      this.health[who] = { role, seen: now(), playing: !!m.playing, stalledFor: Number(m.stalledFor) || 0, item: String(m.item || "").slice(0, 120), ua: String(m.ua || "").slice(0, 80), alerted: prev.alerted && now() - prev.seen > 30000 };
      if (role === "output" && (m.stalledFor >= 10) !== (prev.stalledFor >= 10) && this.checkHealth()) await this.save();
      return;
    }
    if (this.isRoom) return this.roomMessage(ws, role, who, m);
  }
  async webSocketClose(ws, code) {
    const [role, who] = this.ctx.getTags(ws);
    if (this.isRoom) { if (role === "guest") await this.roomPresence(who, false); return; }
    // An output whose page was closed or reloaded on purpose (a clean close) is not a failure; a
    // dropped connection (no clean close) still raises the alarm after 30 seconds.
    if (role === "output" && this.health[who] && (code === 1000 || code === 1001)) { this.health[who].closed = true; this.ctx.storage.put("health", this.health); }
  }
  async webSocketError() { /* the client reconnects */ }

  /* ---------- live-studio rooms ---------- */
  room() { return (this.state.room ||= { guests: {}, onair: [], talkback: null }); }
  async roomCommand(b) {   // from the producer, through the Worker
    const room = this.room();
    const g = b.guestId ? (room.guests[b.guestId] ||= {}) : null;
    switch (b.cmd) {
      case "guest.update": Object.assign(g, b.guest || {}); break;
      case "mute": g.muted = !!b.on; this.toGuest(b.guestId, { type: "mute", on: g.muted }); break;
      case "talkback": room.talkback = b.on ? b.guestId : null; this.broadcast({ type: "talkback", guestId: room.talkback }, ["guest", "producer"]); break;
      case "message": this.toGuest(b.guestId, { type: "message", text: String(b.text || "").slice(0, 300), at: now() }); break;
      case "countdown": this.toGuest(b.guestId || "*", { type: "countdown", seconds: Math.max(0, Math.min(600, Number(b.seconds) || 10)), at: now() }); break;
      case "state": g.state = b.state; this.toGuest(b.guestId, { type: "state", state: b.state }); break;
      case "remove": delete room.guests[b.guestId]; this.toGuest(b.guestId, { type: "removed" }); break;
      // The producer's talkback microphone (a Realtime track); only the guest named in talkback hears it.
      case "talkback.track": room.talkbackTrack = b.track && b.track.sessionId ? { sessionId: String(b.track.sessionId).slice(0, 80), trackName: String(b.track.trackName || "").slice(0, 80) } : null; this.broadcast({ type: "room", state: room }, ["guest"]); break;
      default: throw new Error("Unknown studio command.");
    }
    await this.ctx.storage.put("state", this.state);
    this.broadcast({ type: "room", state: room }, ["producer", "output", "guest"]);
    return { room };
  }
  toGuest(guestId, msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets("guest")) { const [, who] = this.ctx.getTags(ws); if (guestId === "*" || who === guestId) try { ws.send(text); } catch { /* gone */ } }
  }
  async roomPresence(guestId, online) {
    const room = this.room(), g = (room.guests[guestId] ||= {});
    g.online = online; g.seen = now();
    await this.ctx.storage.put("state", this.state);
    this.broadcast({ type: "room", state: room }, ["producer", "output", "guest"]);
  }
  async roomMessage(ws, role, who, m) {
    const room = this.room();
    if (role === "guest") {
      const g = (room.guests[who] ||= {});
      if (m.type === "hello") Object.assign(g, { online: true, seen: now() });
      if (m.type === "reply") this.broadcast({ type: "reply", guestId: who, text: String(m.text || "").slice(0, 300) }, ["producer"]);
      await this.ctx.storage.put("state", this.state);
      this.broadcast({ type: "room", state: room }, ["producer", "output", "guest"]);
    }
  }
}

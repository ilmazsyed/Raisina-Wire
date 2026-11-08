// The live studio's server side (Phase 4). Guests join from a link in their phone or computer's
// browser (no install): they see a camera preview, write their name and title (which fill the
// name strap), tick the broadcast consent and are advised to wear headphones. Video goes through
// Cloudflare Realtime (SFU + TURN: CALLS_APP_ID / CALLS_APP_SECRET, TURN_KEY_ID / TURN_KEY_TOKEN
// secrets); without those, or when a room is set to it, through VDO.Ninja. Each room has a
// Durable Object (src/control.js, "room:<id>") that carries the producer's controls to guests:
// mute, private talkback, messages, the countdown, green room / ready / on air.
import { ctlStub, control } from "./controlroom.js";
import { checkKey } from "./tvchannel.js";

const CF = "https://rtc.live.cloudflare.com/v1";
const now = () => new Date().toISOString();
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const rand = (n = 24) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(36).padStart(2, "0")).join("").slice(0, n);
export const CONSENT_TEXT = "আমি রাষ্ট্রিক্স ২৪×৭ নিউজ-কে আমার ছবি, কণ্ঠ, নাম ও পরিচয় সরাসরি সম্প্রচার, রেকর্ড এবং পরে টিভি, অ্যাপ, ওয়েবসাইট ও সমাজমাধ্যমে প্রকাশের অনুমতি দিচ্ছি। আমি জানি, অনুষ্ঠান চলাকালীন যে কোনও সময় আমি সরে যেতে পারি।";
export const CONSENT_TEXT_EN = "I allow Rashtrix 24×7 News to broadcast live, record, and later publish my picture, voice, name and description on TV, the app, the website and social media. I know I can leave at any time during the programme.";
export const rtcReady = env => Boolean(env.CALLS_APP_ID && env.CALLS_APP_SECRET);

async function roomCmd(env, roomId, body) {
  const r = await ctlStub(env, `room:${roomId}`).fetch("https://ctl/cmd", { method: "POST", headers: { "x-ctl-name": `room:${roomId}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
const guestOut = (g, room, origin) => ({ id: g.id, name: g.name, title: g.title, role: g.role, state: g.state, consent: !!g.consent, consentAt: g.consent_at, checks: parse(g.checks, {}), sessionId: g.session_id, tracks: parse(g.tracks, {}), link: `${origin}/guest.html?t=${g.token}`, vdo: room.mode === "vdo" || g.vdo_id ? vdoView(room, g) : "", updatedAt: g.updated_at });
const vdoView = (room, g) => g.vdo_id ? `https://vdo.ninja/?room=${room.vdo_room}&view=${g.vdo_id}&solo&cleanoutput&autoplay&noheader` : "";
const vdoPush = (room, g) => `https://vdo.ninja/?room=${room.vdo_room}&push=${g.vdo_id}&label=${encodeURIComponent(g.name || "Guest")}&webcam&autostart&quality=1&cleanish`;
const roomMode = (env, room) => room.mode === "auto" ? (rtcReady(env) ? "realtime" : "vdo") : room.mode === "realtime" && !rtcReady(env) ? "vdo" : room.mode;

async function guestByToken(env, t) {
  if (!t || t.length < 16) return null;
  const g = await env.DB.prepare("SELECT g.*, r.title AS room_title, r.channel, r.mode, r.vdo_room, r.status AS room_status FROM studio_guests g JOIN studio_rooms r ON r.id=g.room_id WHERE g.token=?").bind(t).first();
  return g && g.room_status === "open" ? g : null;
}

/* ---------- Cloudflare Realtime (proxied so the app secret never leaves the Worker) ---------- */
async function iceServers(env) {
  const stun = [{ urls: ["stun:stun.cloudflare.com:3478"] }];
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return stun;
  try {
    const r = await fetch(`${CF}/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, { method: "POST", headers: { authorization: `Bearer ${env.TURN_KEY_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ ttl: 86400 }) });
    const d = await r.json(); return d.iceServers ? [].concat(d.iceServers) : stun;
  } catch { return stun; }
}
const sfu = (env, path, method, body) => fetch(`${CF}/apps/${env.CALLS_APP_ID}${path}`, { method, headers: { authorization: `Bearer ${env.CALLS_APP_SECRET}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async r => new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } }));

// Who may use the media relay: staff, an output (channel key) or a guest with a live link.
async function rtcAllowed(request, env, url, { currentUser, isStaff }) {
  if (url.searchParams.get("t") && await guestByToken(env, url.searchParams.get("t"))) return true;
  const ch = url.searchParams.get("ch"), key = url.searchParams.get("key");
  if (key && ["h", "v"].includes(ch) && await checkKey(env, ch, key)) return true;
  if ((request.headers.get("cookie") || "").includes("rw_session") && isStaff(await currentUser(request, env).catch(() => null))) return true;
  // The app's own players may only receive (never send), and only guests who are on air.
  if (url.searchParams.get("viewer") === "1") return "viewer";
  return false;
}

export async function handleStudio(request, env, url, { json, err, currentUser, isStaff, auditFn }) {
  const p = url.pathname, m = request.method;
  const ok = (x = {}) => json({ ok: true, ...x }, 200, { "cache-control": "no-store" });

  /* ---- media relay ---- */
  if (p.startsWith("/api/rtc/")) {
    const allowed = await rtcAllowed(request, env, url, { currentUser, isStaff });
    if (!allowed) return err("Not allowed.", 403);
    const viewer = allowed === "viewer";
    if (p === "/api/rtc/ice") return json({ iceServers: await iceServers(env) }, 200, { "cache-control": "no-store" });
    // A guest's published tracks, for screens that only know the guest's id (rundown items).
    const gm = p.match(/^\/api\/rtc\/guest\/([\w-]{8,64})$/);
    if (gm) {
      const g = await env.DB.prepare("SELECT g.*, r.vdo_room, r.mode FROM studio_guests g JOIN studio_rooms r ON r.id=g.room_id WHERE g.id=? AND r.status='open'").bind(gm[1]).first();
      if (!g || (viewer && g.state !== "onair")) return err("Guest not found.", 404);
      return json({ sessionId: g.session_id, tracks: parse(g.tracks, {}), name: g.name, title: g.title, vdo: g.vdo_id ? vdoView(g, g) : "" }, 200, { "cache-control": "no-store" });
    }
    if (!rtcReady(env)) return err("Cloudflare Realtime is not set up.", 503);
    if (p === "/api/rtc/session" && m === "POST") { const t = await request.text(); return sfu(env, "/sessions/new", "POST", t ? JSON.parse(t) : undefined); }
    const sm = p.match(/^\/api\/rtc\/([\w-]{8,80})\/(tracks|renegotiate|close)$/);
    if (sm) {
      const body = await request.json().catch(() => ({}));
      if (viewer && (body.sessionDescription?.type === "offer" || (body.tracks || []).some(t => t.location !== "remote"))) return err("Viewers can only receive.", 403);
      if (sm[2] === "tracks" && m === "POST") return sfu(env, `/sessions/${sm[1]}/tracks/new`, "POST", body);
      if (sm[2] === "renegotiate" && m === "PUT") return sfu(env, `/sessions/${sm[1]}/renegotiate`, "PUT", body);
      if (sm[2] === "close" && m === "PUT") return sfu(env, `/sessions/${sm[1]}/tracks/close`, "PUT", body);
    }
    return err("Not found.", 404);
  }

  /* ---- realtime room connection: producers (staff) and guests (token) ---- */
  const wsm = p.match(/^\/api\/ws\/room\/([\w-]{8,64})$/);
  if (wsm) {
    if (request.headers.get("upgrade") !== "websocket") return err("WebSocket expected.", 426);
    let role = null, who = "";
    const g = url.searchParams.get("t") ? await guestByToken(env, url.searchParams.get("t")) : null;
    if (g && g.room_id === wsm[1]) { role = "guest"; who = g.id; }
    else { const u = await currentUser(request, env).catch(() => null); if (isStaff(u)) { role = "producer"; who = `p-${u.id.slice(0, 8)}-${rand(4)}`; } }
    if (!role) return err("Not allowed.", 403);
    const h = new Headers(request.headers); h.set("x-ctl-name", `room:${wsm[1]}`); h.set("x-ctl-role", role); h.set("x-ctl-who", who);
    return ctlStub(env, `room:${wsm[1]}`).fetch(new Request("https://ctl/ws", { headers: h }));
  }

  /* ---- the guest's own page (token in the link) ---- */
  if (p.startsWith("/api/studio/guest")) {
    const b = m === "GET" ? {} : await request.json().catch(() => ({}));
    const g = await guestByToken(env, url.searchParams.get("t") || b.t);
    if (!g) return err("This link has ended or is not valid. Ask the producer for a new one.", 404);
    const mode = roomMode(env, g);
    if (p === "/api/studio/guest" && m === "GET")
      return json({ guest: { id: g.id, name: g.name, title: g.title, consent: !!g.consent, state: g.state }, room: { id: g.room_id, title: g.room_title, channel: g.channel, mode }, consent: { bn: CONSENT_TEXT, en: CONSENT_TEXT_EN }, vdo: mode === "vdo" && g.consent && g.vdo_id ? vdoPush(g, g) : "" }, 200, { "cache-control": "no-store" });
    if (p === "/api/studio/guest/join" && m === "POST") {
      if (b.consent !== true) return err("Please tick the consent box to join the broadcast.");
      const name = clean(b.name, 80), title = clean(b.title, 120);
      if (name.length < 2) return err("Write your name as it should appear on screen.");
      const vdoId = g.vdo_id || `rx${rand(10)}`;
      await env.DB.prepare("UPDATE studio_guests SET name=?, title=?, consent=1, consent_at=?, consent_text=?, state=CASE WHEN state='invited' THEN 'green' ELSE state END, vdo_id=?, updated_at=? WHERE id=?")
        .bind(name, title, now(), b.lang === "en" ? CONSENT_TEXT_EN : CONSENT_TEXT, vdoId, now(), g.id).run();
      // Remembered in the guest directory for next time.
      if (g.directory_id) await env.DB.prepare("UPDATE guest_directory SET name=?, title=? WHERE id=?").bind(name, title, g.directory_id).run();
      else { const did = crypto.randomUUID(); await env.DB.prepare("INSERT INTO guest_directory (id,name,title) VALUES (?,?,?)").bind(did, name, title).run(); await env.DB.prepare("UPDATE studio_guests SET directory_id=? WHERE id=?").bind(did, g.id).run(); }
      await roomCmd(env, g.room_id, { cmd: "guest.update", guestId: g.id, guest: { name, title, consent: true, state: g.state === "invited" ? "green" : g.state, vdo: mode === "vdo" ? vdoView(g, { vdo_id: vdoId }) : "" } }).catch(() => {});
      return ok({ mode, vdo: mode === "vdo" ? vdoPush(g, { ...g, name, vdo_id: vdoId }) : "" });
    }
    if (p === "/api/studio/guest/tracks" && m === "POST") {   // the guest published camera and microphone
      const tracks = { video: clean(b.tracks?.video, 80), audio: clean(b.tracks?.audio, 80) };
      await env.DB.prepare("UPDATE studio_guests SET session_id=?, tracks=?, updated_at=? WHERE id=?").bind(clean(b.sessionId, 80), JSON.stringify(tracks), now(), g.id).run();
      await roomCmd(env, g.room_id, { cmd: "guest.update", guestId: g.id, guest: { sessionId: clean(b.sessionId, 80), tracks } }).catch(() => {});
      return ok();
    }
    if (p === "/api/studio/guest/checks" && m === "POST") {
      const checks = { camera: !!b.checks?.camera, mic: !!b.checks?.mic, level: Math.round(Number(b.checks?.level) || 0), network: clean(b.checks?.network, 40), rtt: Math.round(Number(b.checks?.rtt) || 0), headphones: !!b.checks?.headphones, device: clean(b.checks?.device, 80) };
      await env.DB.prepare("UPDATE studio_guests SET checks=?, updated_at=? WHERE id=?").bind(JSON.stringify(checks), now(), g.id).run();
      await roomCmd(env, g.room_id, { cmd: "guest.update", guestId: g.id, guest: { checks } }).catch(() => {});
      return ok();
    }
    return err("Not found.", 404);
  }

  /* ---- the producer's studio desk (staff) ---- */
  if (!p.startsWith("/api/admin/studio")) return null;
  const user = await currentUser(request, env);
  if (!isStaff(user)) return err("Editor access required.", 403);
  const audit = (...a) => auditFn(user, ...a);
  const parts = p.split("/").slice(4);   // after /api/admin/studio
  const b = ["GET", "DELETE"].includes(m) ? {} : await request.json().catch(() => ({}));

  if (parts[0] === "live" && m === "GET") {   // for the PCR's sources: guests who joined, by channel
    const ch = ["h", "v"].includes(url.searchParams.get("channel")) ? url.searchParams.get("channel") : "h";
    const { results } = await env.DB.prepare("SELECT g.*, r.vdo_room, r.mode, r.channel FROM studio_guests g JOIN studio_rooms r ON r.id=g.room_id WHERE r.status='open' AND r.channel=? AND g.consent=1 AND g.state IN ('green','ready','onair') ORDER BY g.state='onair' DESC, g.updated_at DESC").bind(ch).all();
    return json({ guests: results.map(g => ({ id: g.id, name: g.name, title: g.title, state: g.state, sessionId: g.session_id, tracks: parse(g.tracks, {}), vdo: roomMode(env, g) === "vdo" ? vdoView(g, g) : "", online: Date.parse(g.updated_at.replace(" ", "T") + (g.updated_at.includes("Z") ? "" : "Z")) > Date.now() - 6 * 3600e3 })) }, 200, { "cache-control": "no-store" });
  }
  if (parts[0] === "directory") {
    const id = parts[1];
    if (!id && m === "GET") { const q = `%${clean(url.searchParams.get("q"), 60)}%`; const { results } = await env.DB.prepare("SELECT * FROM guest_directory WHERE name LIKE ? OR title LIKE ? ORDER BY last_appeared DESC, name LIMIT 200").bind(q, q).all(); return json({ guests: results }, 200, { "cache-control": "no-store" }); }
    if (!id && m === "POST") { const nid = crypto.randomUUID(); await env.DB.prepare("INSERT INTO guest_directory (id,name,title,phone,email,notes) VALUES (?,?,?,?,?,?)").bind(nid, clean(b.name, 80), clean(b.title, 120), clean(b.phone, 30), clean(b.email, 120), String(b.notes || "").slice(0, 1000)).run(); return ok({ id: nid }); }
    if (id && m === "PUT") { await env.DB.prepare("UPDATE guest_directory SET name=?,title=?,phone=?,email=?,notes=? WHERE id=?").bind(clean(b.name, 80), clean(b.title, 120), clean(b.phone, 30), clean(b.email, 120), String(b.notes || "").slice(0, 1000), id).run(); return ok(); }
    if (id && m === "DELETE") { await env.DB.prepare("DELETE FROM guest_directory WHERE id=?").bind(id).run(); await audit("guest.directory.delete", "guest", id, {}); return ok(); }
    return err("Not found.", 404);
  }
  if (parts[0] === "rooms") {
    const [, id, sub, gid, act] = parts;
    if (!id && m === "GET") {
      const { results: rooms } = await env.DB.prepare("SELECT * FROM studio_rooms WHERE status='open' OR created_at > datetime('now','-2 days') ORDER BY status='open' DESC, created_at DESC LIMIT 50").all();
      const { results: guests } = await env.DB.prepare(`SELECT * FROM studio_guests WHERE room_id IN (${rooms.map(() => "?").join(",") || "''"}) ORDER BY created_at`).bind(...rooms.map(r => r.id)).all();
      return json({ rooms: rooms.map(r => ({ ...r, effectiveMode: roomMode(env, r), guests: guests.filter(g => g.room_id === r.id).map(g => guestOut(g, r, url.origin)) })), realtime: rtcReady(env), turn: Boolean(env.TURN_KEY_ID) }, 200, { "cache-control": "no-store" });
    }
    if (!id && m === "POST") {
      const rid = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO studio_rooms (id,title,channel,mode,vdo_room,created_by) VALUES (?,?,?,?,?,?)").bind(rid, clean(b.title, 100) || "Studio", ["h", "v"].includes(b.channel) ? b.channel : "h", ["auto", "realtime", "vdo"].includes(b.mode) ? b.mode : "auto", `rashtrix${rand(10)}`, user.id).run();
      await audit("studio.room", "room", rid, { title: b.title }); return ok({ id: rid });
    }
    const room = await env.DB.prepare("SELECT * FROM studio_rooms WHERE id=?").bind(id).first();
    if (!room) return err("Room not found.", 404);
    if (!sub && m === "PUT") { await env.DB.prepare("UPDATE studio_rooms SET title=?, mode=?, status=? WHERE id=?").bind(clean(b.title ?? room.title, 100), ["auto", "realtime", "vdo"].includes(b.mode) ? b.mode : room.mode, b.status === "closed" ? "closed" : "open", id).run(); if (b.status === "closed") await roomCmd(env, id, { cmd: "countdown", guestId: "*", seconds: 0 }).catch(() => {}); return ok(); }
    if (sub === "guests" && !gid && m === "POST") {
      const dir = b.directoryId ? await env.DB.prepare("SELECT * FROM guest_directory WHERE id=?").bind(b.directoryId).first() : null;
      const ngid = crypto.randomUUID(), token = rand(32);
      await env.DB.prepare("INSERT INTO studio_guests (id,room_id,token,directory_id,name,title,role) VALUES (?,?,?,?,?,?,?)").bind(ngid, id, token, dir?.id || null, clean(b.name ?? dir?.name, 80), clean(b.title ?? dir?.title, 120), ["guest", "reporter", "host"].includes(b.role) ? b.role : "guest").run();
      await audit("studio.invite", "room", id, { guest: ngid });
      return ok({ id: ngid, link: `${url.origin}/guest.html?t=${token}` });
    }
    if (sub === "guests" && gid) {
      const g = await env.DB.prepare("SELECT * FROM studio_guests WHERE id=? AND room_id=?").bind(gid, id).first();
      if (!g) return err("Guest not found.", 404);
      if (!act && m === "PUT") {
        const state = ["invited", "green", "ready", "onair", "left"].includes(b.state) ? b.state : g.state;
        await env.DB.prepare("UPDATE studio_guests SET name=?, title=?, state=?, updated_at=? WHERE id=?").bind(clean(b.name ?? g.name, 80), clean(b.title ?? g.title, 120), state, now(), gid).run();
        if (state !== g.state) {
          await roomCmd(env, id, { cmd: "state", guestId: gid, state }).catch(() => {});
          if (state === "onair" && g.directory_id) await env.DB.prepare("UPDATE guest_directory SET appearances=appearances+1, last_appeared=? WHERE id=?").bind(now(), g.directory_id).run();
          await audit(`studio.${state}`, "guest", gid, { name: g.name });
        }
        return ok();
      }
      if (act === "cmd" && m === "POST") {   // mute, talkback, message, countdown
        if (!["mute", "talkback", "message", "countdown", "remove"].includes(b.cmd)) return err("Unknown command.");
        const out = await roomCmd(env, id, { ...b, guestId: gid });
        if (b.cmd === "remove") await env.DB.prepare("UPDATE studio_guests SET state='left', token=? WHERE id=?").bind(`ended-${rand(20)}`, gid).run();
        return json(out);
      }
      if (act === "strap" && m === "POST") return json(await control(env, room.channel, "lower", { name: g.name, title: g.title }, user.display_name || user.email));
      if (!act && m === "DELETE") { await roomCmd(env, id, { cmd: "remove", guestId: gid }).catch(() => {}); await env.DB.prepare("DELETE FROM studio_guests WHERE id=?").bind(gid).run(); return ok(); }
    }
    if (sub === "talkback" && m === "POST") return json(await roomCmd(env, id, { cmd: "talkback.track", track: b.track || null }));
    if (sub === "countdown" && m === "POST") return json(await roomCmd(env, id, { cmd: "countdown", guestId: "*", seconds: b.seconds }));
  }
  return err("Not found.", 404);
}

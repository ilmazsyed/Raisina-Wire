// The live studio desk (studio.html): rooms, guest invitations (a link for the guest's phone or
// computer), each guest's picture and green-room checks, and the producer's controls: mute,
// private talkback, messages, the countdown, green room / ready / on air, the name strap, and the
// guest directory.
import { shell, api, toast, fail, esc, $, $$ } from "./crshell.js";
import { publish, pull } from "./rtc.js";
import { digits } from "./i18n.js";

const S = { rooms: [], room: null, ws: null, live: {}, pulls: {}, talk: null, replies: [], realtime: false, dir: [] };
const STATES = { invited: "Invited", green: "Green room", ready: "Ready", onair: "On air", left: "Left" };
const room = () => S.rooms.find(r => r.id === S.room);

async function load() {
  const d = await api("/api/admin/studio/rooms");
  S.rooms = d.rooms; S.realtime = d.realtime; S.turn = d.turn;
  if (!S.room && S.rooms[0]) S.room = S.rooms.find(r => r.status === "open")?.id || null;
  draw();
}
function draw() {
  const r = room();
  $("main").innerHTML = `<div class="pr" style="grid-template-columns:260px minmax(0,1fr) 320px">
    <aside class="panel"><h2>Rooms</h2>${S.rooms.map(x => `<button class="rd" data-room="${x.id}" ${x.id === S.room ? 'aria-current="true"' : ""} style="display:block;width:100%;text-align:left;background:none;border:1px solid transparent;border-radius:8px;padding:8px;color:inherit"><b data-no-tr>${esc(x.title)}</b><small style="display:block;color:var(--mute)">${x.channel === "h" ? "Rashtrix TV" : "Rashtrix Shorts"} · ${x.effectiveMode === "vdo" ? "VDO.Ninja" : "Cloudflare Realtime"} · ${digits(x.guests.length)} guests${x.status === "closed" ? " · closed" : ""}</small></button>`).join("") || `<p class="muted">No rooms yet.</p>`}
      <form id="newRoom" class="stack" style="margin-top:10px"><input name="title" placeholder="Room name (e.g. সন্ধ্যার আলোচনা)" required data-no-tr><div class="grid2"><select name="channel"><option value="h">Rashtrix TV</option><option value="v">Rashtrix Shorts</option></select><select name="mode"><option value="auto">Automatic</option><option value="realtime">Cloudflare Realtime</option><option value="vdo">VDO.Ninja</option></select></div><button class="btn green">+ New room</button></form>
      <p class="muted" style="font-size:12px;margin-top:10px">${S.realtime ? `Cloudflare Realtime is set up${S.turn ? " (with TURN)" : " (no TURN key: some office networks may fail)"}.` : "Cloudflare Realtime is not set up yet, so rooms use VDO.Ninja (free, no account). Add the Realtime keys to switch (README)."} Last resort: put the guest on a Google Meet call and capture the window in OBS.</p></aside>
    <section class="panel">${r ? roomView(r) : `<div class="pr-empty">Make a room, then invite guests.</div>`}</section>
    <aside class="panel stack"><h2>Guest directory</h2><input id="dirQ" placeholder="Search names" data-no-tr><div id="dirList" class="clips-list"></div>
      <form id="dirAdd" class="stack"><input name="name" placeholder="Name" required data-no-tr><input name="title" placeholder="Title" data-no-tr><div class="grid2"><input name="phone" placeholder="Phone (WhatsApp)"><input name="email" placeholder="Email"></div><button class="btn">+ Add to directory</button></form></aside></div>`;
  $$("[data-room]").forEach(b => b.onclick = () => { S.room = b.dataset.room; connect(); draw(); });
  $("#newRoom").onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { const d = await api("/api/admin/studio/rooms", { method: "POST", body: f }); S.room = d.id; await load(); connect(); } catch (x) { fail(x); } };
  $("#dirQ").oninput = e => loadDir(e.target.value);
  $("#dirAdd").onsubmit = async e => { e.preventDefault(); try { await api("/api/admin/studio/directory", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); loadDir(); } catch (x) { fail(x); } };
  drawDir();
  if (r) bindRoom(r);
}
function roomView(r) {
  const open = r.status === "open";
  return `<div class="rd-head"><div class="title" data-no-tr>${esc(r.title)}</div><span class="tag ${r.effectiveMode === "vdo" ? "amber" : "green"}">${r.effectiveMode === "vdo" ? "VDO.Ninja" : "Cloudflare Realtime"}</span>${open ? `<button class="btn" id="closeRoom">Close room</button>` : `<span class="tag">Closed</span>`}</div>
    ${open ? `<form id="invite" class="row" style="margin-bottom:10px"><select name="directoryId" style="max-width:200px"><option value="">New guest…</option>${S.dir.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select><input name="name" placeholder="Name" data-no-tr><input name="title" placeholder="Title" data-no-tr><select name="role"><option value="guest">Guest</option><option value="reporter">Reporter</option><option value="host">Host</option></select><button class="btn green">Invite</button></form>
    <div class="row" style="margin-bottom:10px"><button class="btn" id="cdAll">Countdown 10 to everyone</button>${r.effectiveMode !== "vdo" ? `<button class="btn ${S.talk ? "on" : ""}" id="talkMic">${S.talk ? "Talkback mic on" : "Start talkback mic"}</button>` : ""}<a class="btn" href="/pcr.html?ch=${r.channel}" target="_blank">PCR ↗</a></div>` : ""}
    <div class="grid2" id="guests">${r.guests.map(g => guestCard(r, g)).join("") || `<p class="muted">No guests yet. Invite one: they get a link for their phone or computer.</p>`}</div>
    <div class="panel" style="margin-top:10px"><h2>Replies from guests</h2><div id="replies" class="stack">${S.replies.filter(x => x.room === r.id).map(x => `<div class="clip"><span data-no-tr><b>${esc(x.name)}:</b> ${esc(x.text)}</span></div>`).join("") || `<p class="muted">None.</p>`}</div></div>`;
}
function guestCard(r, g) {
  const live = S.live.guests?.[g.id] || {}, c = live.checks || g.checks || {};
  const online = live.online, muted = live.muted, talking = S.live.talkback === g.id;
  const wa = `https://wa.me/?text=${encodeURIComponent(`রাষ্ট্রিক্স ২৪×৭ নিউজ স্টুডিওর লিংক: ${g.link}\nহেডফোন পরে, ফোনটি স্থির রেখে যোগ দিন।`)}`;
  return `<div class="panel stack" data-g="${g.id}" style="padding:10px">
    <div class="row" style="justify-content:space-between"><b data-no-tr>${esc(g.name || "(name when they join)")}</b><span class="tag ${g.state === "onair" ? "red" : g.state === "ready" ? "amber" : g.state === "green" ? "green" : ""}">${STATES[g.state] || g.state}</span></div>
    <small class="muted" data-no-tr>${esc(g.title || "")}</small>
    ${g.vdo && r.effectiveMode === "vdo" ? `<iframe src="${esc(g.vdo)}" allow="autoplay" style="width:100%;aspect-ratio:16/9;border:0;background:#000;border-radius:6px"></iframe>` : `<video data-v="${g.id}" autoplay playsinline muted style="width:100%;aspect-ratio:16/9;background:#000;border-radius:6px;object-fit:cover"></video>`}
    <div style="font-size:12px">${online ? "🟢 Online" : "⚪ Offline"} · ${g.consent ? `✅ Consent ${esc(new Date(g.consentAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }))}` : "⏳ No consent yet"}<br>${c.camera ? "✅" : "❌"} Camera · ${c.mic ? "✅" : "❌"} Mic${c.level ? ` (${digits(c.level)})` : ""} · ${c.rtt ? `${c.rtt < 150 ? "✅" : c.rtt < 350 ? "⚠️" : "❌"} ${digits(c.rtt)} ms` : "… network"} · ${c.headphones ? "✅" : "⚠️"} Headphones</div>
    <div class="row"><input readonly value="${esc(g.link)}" style="flex:1;font-size:11px" onclick="this.select()"><button class="btn sm" data-copy="${esc(g.link)}">Copy</button><a class="btn sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a></div>
    <div class="row"><select data-state="${g.id}">${Object.entries(STATES).map(([k, n]) => `<option value="${k}" ${g.state === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      <button class="btn sm ${muted ? "red" : ""}" data-cmd="mute" data-id="${g.id}" data-on="${muted ? 0 : 1}">${muted ? "Unmute" : "Mute"}</button>
      ${r.effectiveMode !== "vdo" ? `<button class="btn sm ${talking ? "on" : ""}" data-cmd="talkback" data-id="${g.id}" data-on="${talking ? 0 : 1}">${talking ? "End talkback" : "Talk"}</button>` : ""}
      <button class="btn sm" data-msg="${g.id}">Message</button><button class="btn sm" data-cmd="countdown" data-id="${g.id}">Count 10</button>
      <button class="btn sm" data-strap="${g.id}" ${g.name ? "" : "disabled"}>Name strap</button><button class="btn sm" data-rm="${g.id}">Remove</button></div></div>`;
}
function bindRoom(r) {
  $("#closeRoom")?.addEventListener("click", async () => { if (!confirm("Close this room? Guests' links stop working.")) return; await api(`/api/admin/studio/rooms/${r.id}`, { method: "PUT", body: { status: "closed" } }).catch(fail); load(); });
  $("#invite")?.addEventListener("submit", async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (!f.directoryId) delete f.directoryId; if (f.directoryId && !f.name) { delete f.name; delete f.title; }
    try { const d = await api(`/api/admin/studio/rooms/${r.id}/guests`, { method: "POST", body: f }); await navigator.clipboard?.writeText(d.link).catch(() => {}); toast("Invited. The link is copied: send it to the guest."); load(); } catch (x) { fail(x); } });
  $("#cdAll")?.addEventListener("click", () => api(`/api/admin/studio/rooms/${r.id}/countdown`, { method: "POST", body: { seconds: 10 } }).then(() => toast("Countdown sent.")).catch(fail));
  $("#talkMic")?.addEventListener("click", () => talkMic(r));
  $$("[data-copy]").forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast("Copied.")).catch(() => {}));
  $$("[data-state]").forEach(s => s.onchange = () => api(`/api/admin/studio/rooms/${r.id}/guests/${s.dataset.state}`, { method: "PUT", body: { state: s.value } }).then(load).catch(fail));
  $$("[data-cmd]").forEach(b => b.onclick = () => {
    if (b.dataset.cmd === "talkback" && b.dataset.on === "1" && !S.talk) return toast("Start the talkback mic first.", true);
    api(`/api/admin/studio/rooms/${r.id}/guests/${b.dataset.id}/cmd`, { method: "POST", body: { cmd: b.dataset.cmd, on: b.dataset.on === "1", seconds: 10 } }).catch(fail);
  });
  $$("[data-msg]").forEach(b => b.onclick = () => { const text = prompt("Message to the guest's screen:"); if (text) api(`/api/admin/studio/rooms/${r.id}/guests/${b.dataset.msg}/cmd`, { method: "POST", body: { cmd: "message", text } }).then(() => toast("Sent.")).catch(fail); });
  $$("[data-strap]").forEach(b => b.onclick = () => api(`/api/admin/studio/rooms/${r.id}/guests/${b.dataset.strap}/strap`, { method: "POST" }).then(() => toast("Name strap is on air.")).catch(fail));
  $$("[data-rm]").forEach(b => b.onclick = async () => { if (!confirm("Remove this guest? Their link stops working.")) return; await api(`/api/admin/studio/rooms/${r.id}/guests/${b.dataset.rm}/cmd`, { method: "POST", body: { cmd: "remove" } }).catch(fail); load(); });
  pullVideos(r);
}
// Each guest's picture on the desk (Cloudflare Realtime).
function pullVideos(r) {
  if (r.effectiveMode === "vdo") return;
  for (const g of r.guests) {
    const live = S.live.guests?.[g.id] || {}, sid = live.sessionId || g.sessionId, tr = live.tracks || g.tracks || {};
    const v = $(`[data-v="${g.id}"]`); if (!v || !sid || !tr.video) continue;
    const have = S.pulls[g.id];
    if (have?.sessionId === sid && have.stream) { v.srcObject = have.stream; continue; }
    if (have?.sessionId === sid) continue;
    S.pulls[g.id] = { sessionId: sid };
    pull([{ sessionId: sid, trackName: tr.video }, { sessionId: sid, trackName: tr.audio }], {}).then(x => { S.pulls[g.id] = { ...x, sessionId: sid }; const el = $(`[data-v="${g.id}"]`); if (el) el.srcObject = x.stream; }).catch(() => { delete S.pulls[g.id]; });
  }
}
async function talkMic(r) {
  if (S.talk) { S.talk.stream.getTracks().forEach(x => x.stop()); S.talk.pc.close(); S.talk = null; await api(`/api/admin/studio/rooms/${r.id}/talkback`, { method: "POST", body: { track: null } }).catch(() => {}); draw(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    const pub = await publish(stream, {}, "talkback");
    S.talk = { ...pub, stream };
    await api(`/api/admin/studio/rooms/${r.id}/talkback`, { method: "POST", body: { track: { sessionId: pub.sessionId, trackName: pub.tracks.audio } } });
    toast("Talkback mic is ready. Press “Talk” on a guest to talk to them alone."); draw();
  } catch (e) { fail(e); }
}
function connect() {
  S.ws?.close(); S.live = {};
  if (!S.room) return;
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws/room/${S.room}`);
  S.ws = ws;
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "room") { S.live = m.state || {}; const r = room(); if (r) { $("#guests") && ($("#guests").innerHTML = r.guests.map(g => guestCard(r, g)).join("")); bindRoom(r); } }
    if (m.type === "reply") { const g = room()?.guests.find(x => x.id === m.guestId); S.replies.unshift({ room: S.room, name: g?.name || "Guest", text: m.text }); toast(`${g?.name || "Guest"}: ${m.text}`); draw(); }
  };
  ws.onclose = () => { if (S.ws === ws) setTimeout(connect, 3000); };
}
async function loadDir(q = "") { try { S.dir = (await api(`/api/admin/studio/directory?q=${encodeURIComponent(q)}`)).guests; } catch { S.dir = []; } drawDir(); }
function drawDir() {
  const L = $("#dirList"); if (!L) return;
  L.innerHTML = S.dir.map(g => `<div class="clip"><div><b data-no-tr>${esc(g.name)}</b><br><small data-no-tr>${esc(g.title)}</small><br><small>${g.appearances ? `${digits(g.appearances)} appearances` : "Not on air yet"}${g.phone ? ` · ${esc(g.phone)}` : ""}</small></div><div class="row">${room()?.status === "open" ? `<button class="btn sm" data-inv="${g.id}">Invite</button>` : ""}<button class="btn sm" data-ddel="${g.id}">✕</button></div></div>`).join("") || `<p class="muted">No one yet. Guests are added when they join.</p>`;
  $$("[data-inv]", L).forEach(b => b.onclick = async () => { try { const d = await api(`/api/admin/studio/rooms/${S.room}/guests`, { method: "POST", body: { directoryId: b.dataset.inv } }); await navigator.clipboard?.writeText(d.link).catch(() => {}); toast("Invited. The link is copied."); load(); } catch (x) { fail(x); } });
  $$("[data-ddel]", L).forEach(b => b.onclick = async () => { if (!confirm("Delete this person from the directory?")) return; await api(`/api/admin/studio/directory/${b.dataset.ddel}`, { method: "DELETE" }).catch(fail); loadDir(); });
}

(async () => {
  const user = await shell("Live studio");
  if (!user) return;
  await loadDir();
  await load().catch(fail);
  connect();
  setInterval(() => load().catch(() => {}), 15000);
})();

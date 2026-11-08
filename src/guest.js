// A studio guest's page (guest.html?t=…), opened from the link the producer sends. Nothing to
// install. The guest sees their camera, writes their name and title (they fill the name strap),
// ticks the broadcast consent and is advised to wear headphones. Then: the green-room checks
// (camera, microphone, network, headphones), the other guests, the on-air return feed, messages
// and the countdown from the producer, and the producer's private talkback.
import "./control.css";
import "./tv.css";
import { initUiLang, langSwitch } from "./uilang.js";
import { lang } from "./i18n.js";
import { publish, pull, netStats } from "./rtc.js";
import { mountTV } from "./engine.js";

const $ = s => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const t = new URLSearchParams(location.search).get("t") || "";
const main = $("main");
const G = { info: null, stream: null, pub: null, ws: null, room: {}, pulls: {}, talk: null, muted: false, level: 0, headphones: false };
const STATE = { invited: "Invited", green: "Green room", ready: "Ready — stand by", onair: "ON AIR", left: "Left" };

function say(msg, big = false) {
  const el = document.createElement("div"); el.className = `toast ${big ? "big" : ""}`; el.style.cssText = big ? "font-size:22px;padding:18px 24px;bottom:auto;top:20px" : "";
  el.textContent = msg; document.body.append(el); setTimeout(() => el.remove(), big ? 12000 : 4000);
}
const HEADPHONE = /head(phone|set)|earbud|earphone|airpods|buds|bluetooth|hands-free|হেডফোন/i;

async function camera(deviceId = {}) {
  G.stream?.getTracks().forEach(x => x.stop());
  G.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user", ...(deviceId.video ? { deviceId: { exact: deviceId.video } } : {}) }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId.audio ? { deviceId: { exact: deviceId.audio } } : {}) } });
  $("#me").srcObject = G.stream;
  meter();
  const devs = await navigator.mediaDevices.enumerateDevices();
  const opt = (k, cur) => devs.filter(d => d.kind === k).map(d => `<option value="${d.deviceId}" ${d.deviceId === cur ? "selected" : ""}>${esc(d.label || k)}</option>`).join("");
  const v = G.stream.getVideoTracks()[0]?.getSettings().deviceId, a = G.stream.getAudioTracks()[0]?.getSettings().deviceId;
  $("#camSel").innerHTML = opt("videoinput", v); $("#micSel").innerHTML = opt("audioinput", a);
  G.headphones = $("#hp")?.checked || devs.some(d => (d.kind === "audiooutput" || d.kind === "audioinput") && HEADPHONE.test(d.label) && !/default/i.test(d.deviceId));
}
let meterCtx;
function meter() {
  try {
    meterCtx?.close(); meterCtx = new AudioContext();
    const an = meterCtx.createAnalyser(); an.fftSize = 512; meterCtx.createMediaStreamSource(G.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => { if (meterCtx.state === "closed") return; an.getByteTimeDomainData(buf); let peak = 0; for (const x of buf) peak = Math.max(peak, Math.abs(x - 128)); G.level = Math.max(G.level * 0.9, peak / 128 * 100); const bar = $("#lvl i"); if (bar) bar.style.width = `${Math.min(100, G.level * 1.6)}%`; requestAnimationFrame(loop); };
    loop();
  } catch { /* no audio meter */ }
}

function welcome() {
  const g = G.info.guest, consent = lang === "bn" ? G.info.consent.bn : `${G.info.consent.en}\n\n${G.info.consent.bn}`;
  main.innerHTML = `<div style="max-width:720px;margin:0 auto;padding:14px" class="stack">
    <div class="row" style="justify-content:space-between;align-items:center"><img src="/brand/logo-sm.webp" alt="Rashtrix 24×7 News" style="height:64px;width:auto"><span id="ls"></span></div>
    <h2 style="margin:0">Welcome to the Rashtrix studio</h2><p class="muted" style="margin:0" data-no-tr>${esc(G.info.room.title)}</p>
    <video id="me" autoplay playsinline muted style="width:100%;background:#000;border-radius:10px;transform:scaleX(-1);aspect-ratio:16/9;object-fit:cover"></video>
    <div class="bar" id="lvl" title="Microphone level"><i></i></div><small class="muted">Say something: the bar should move.</small>
    <div class="grid2"><label>Camera<select id="camSel" data-no-tr></select></label><label>Microphone<select id="micSel" data-no-tr></select></label></div>
    <div class="panel" style="border-color:var(--amber)"><b>🎧 Please wear headphones or earphones.</b><p class="muted" style="margin:4px 0 0">Without them, the programme sound comes back through your microphone and everyone hears an echo. Sit facing a window or a lamp, and keep the phone steady (lying sideways for TV).</p><label style="display:flex;gap:6px;align-items:center;margin-top:6px;color:var(--ink)"><input type="checkbox" id="hp"> I am wearing headphones</label></div>
    <form id="join" class="stack"><div class="grid2"><label>Your name (as it should appear on screen)<input name="name" required value="${esc(g.name)}" data-no-tr></label><label>Your title (e.g. Professor, Jadavpur University)<input name="title" value="${esc(g.title)}" data-no-tr></label></div>
      <div class="panel"><b>Broadcast consent</b><p style="white-space:pre-line;margin:6px 0" data-no-tr>${esc(consent)}</p><label style="display:flex;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" name="consent" required> I agree</label></div>
      <button class="btn green" style="font-size:18px;padding:12px">Join the studio</button></form>
    <p class="muted" style="font-size:12px">Your camera and microphone are used only for this programme. Rashtrix keeps your name, title and consent (with its time) as the record of your appearance. Privacy policy: <a href="/privacy" target="_blank">rashtrix</a>.</p></div>`;
  $("#ls").append(langSwitch(false));
  $("#camSel").onchange = () => camera({ video: $("#camSel").value, audio: $("#micSel").value }).catch(e => say(e.message));
  $("#micSel").onchange = () => camera({ video: $("#camSel").value, audio: $("#micSel").value }).catch(e => say(e.message));
  $("#hp").onchange = e => { G.headphones = e.target.checked; };
  camera().catch(() => say("Allow the camera and microphone for this page (the icon in the address bar), then reload.", true));
  $("#join").onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector("button"); btn.disabled = true;
    try {
      const r = await fetch("/api/studio/guest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t, name: f.name, title: f.title, consent: !!f.consent, lang }) }).then(r => r.json());
      if (!r.ok) throw new Error(r.error || "Could not join.");
      G.mode = r.mode; G.vdo = r.vdo; G.info.guest.name = f.name; G.info.guest.title = f.title;
      await studio();
    } catch (x) { say(x.message, true); btn.disabled = false; }
  };
}

async function studio() {
  main.innerHTML = `<div style="max-width:1100px;margin:0 auto;padding:10px" class="stack">
    <div class="row" style="justify-content:space-between;align-items:center"><img src="/brand/logo-xs.webp" alt="Rashtrix 24×7 News" style="height:44px;width:auto"><span id="state" class="tag">${STATE.green}</span><span id="ls"></span></div>
    <div id="cd" class="countdown" hidden></div>
    <div class="grid2" style="align-items:start"><div class="stack"><h3 style="margin:0">You</h3>${G.mode === "vdo" ? `<iframe id="vdo" src="${esc(G.vdo)}" allow="camera; microphone; autoplay; fullscreen; display-capture" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;background:#000"></iframe>` : `<video id="me" autoplay playsinline muted style="width:100%;background:#000;border-radius:10px;transform:scaleX(-1);aspect-ratio:16/9;object-fit:cover"></video><div class="bar" id="lvl"><i></i></div>`}
        <div class="row"><button class="btn" id="mic">🎤 Microphone on</button><button class="btn" id="leave">Leave</button></div><div id="checks" class="muted" style="font-size:13px"></div></div>
      <div class="stack"><h3 style="margin:0">On air now <small class="muted">(return feed)</small></h3><div id="ret" data-no-tr></div><label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="hear"> Hear the programme (only with headphones)</label></div></div>
    ${G.mode === "vdo" ? "" : `<h3 style="margin:0">With you in the studio</h3><div id="others" class="grid3"></div>`}
    <div class="panel"><h2>Messages from the producer</h2><div id="msgs" class="stack" style="max-height:30vh;overflow:auto"></div><form id="reply" class="row"><input name="text" placeholder="Reply to the producer" style="flex:1" data-no-tr><button class="btn">Send</button></form></div>
    <audio id="talk" autoplay></audio></div>`;
  $("#ls").append(langSwitch(false));
  // Return feed: what is on air (muted unless the guest asks).
  G.ret = mountTV($("#ret"), { channel: G.info.room.channel, mode: "app", guestToken: t, muted: true });
  $("#hear").onchange = e => { if (e.target.checked) { if (!G.headphones && !confirm("Are you wearing headphones? Without them everyone hears an echo.")) { e.target.checked = false; return; } G.ret.unmute(); } else { G.ret.destroy(); G.ret = mountTV($("#ret"), { channel: G.info.room.channel, mode: "app", guestToken: t, muted: true }); } };
  $("#leave").onclick = () => { if (confirm("Leave the studio?")) { G.stream?.getTracks().forEach(x => x.stop()); G.pub?.pc.close(); G.ws?.close(); main.innerHTML = `<div class="cr-denied"><h2>Thank you</h2><p>You have left the studio.</p></div>`; } };
  $("#mic").onclick = () => setMic(!micOn());
  $("#reply").onsubmit = e => { e.preventDefault(); const v = e.target.text.value.trim(); if (!v || G.ws?.readyState !== 1) return; G.ws.send(JSON.stringify({ type: "reply", text: v })); addMsg(`You: ${v}`); e.target.reset(); };
  if (G.mode !== "vdo") {
    $("#me").srcObject = G.stream; meter();
    try {
      G.pub = await publish(G.stream, { t }, G.info.guest.id.slice(0, 8));
      await fetch("/api/studio/guest/tracks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t, sessionId: G.pub.sessionId, tracks: G.pub.tracks }) });
    } catch (e) { say(`Could not send your video: ${e.message}`, true); }
  } else G.stream?.getTracks().forEach(x => x.stop());   // VDO.Ninja takes the camera itself
  connect(); checks(); setInterval(checks, 10000);
}
const micOn = () => G.stream?.getAudioTracks()[0]?.enabled !== false;
function setMic(on, byProducer = false) {
  G.stream?.getAudioTracks().forEach(x => { x.enabled = on; });
  const b = $("#mic"); if (b) { b.textContent = on ? "🎤 Microphone on" : "🔇 Microphone off"; b.classList.toggle("red", !on); }
  if (byProducer) say(on ? "The producer turned your microphone on." : "The producer muted your microphone.", true);
}
function addMsg(text) { const m = $("#msgs"); if (!m) return; const d = document.createElement("div"); d.className = "clip"; d.textContent = text; d.dataset.noTr = ""; m.prepend(d); }

function connect() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws/room/${G.info.room.id}?t=${encodeURIComponent(t)}`);
  G.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello" }));
  ws.onclose = () => setTimeout(connect, 3000);
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "room") { G.room = m.state || {}; roomChanged(); }
    if (m.type === "mute") setMic(!m.on, true);
    if (m.type === "message") { addMsg(`Producer: ${m.text}`); say(m.text, true); navigator.vibrate?.(200); }
    if (m.type === "countdown") countdown(m.seconds);
    if (m.type === "state") setState(m.state);
    if (m.type === "talkback") roomChanged();
    if (m.type === "removed") { G.stream?.getTracks().forEach(x => x.stop()); G.pub?.pc.close(); ws.onclose = null; ws.close(); main.innerHTML = `<div class="cr-denied"><h2>Thank you</h2><p>The producer has closed your link.</p></div>`; }
  };
}
function setState(s) { const el = $("#state"); if (!el) return; el.textContent = STATE[s] || s; el.className = `tag ${s === "onair" ? "red" : s === "ready" ? "amber" : "green"}`; if (s === "onair") navigator.vibrate?.([100, 50, 100]); }
let cdTimer;
function countdown(sec) {
  const el = $("#cd"); clearInterval(cdTimer); if (!sec) { el.hidden = true; return; }
  const end = Date.now() + sec * 1000; el.hidden = false;
  const tick = () => { const left = Math.ceil((end - Date.now()) / 1000); el.textContent = left > 0 ? `On air in ${left}` : "ON AIR"; el.className = `countdown ${left <= 3 ? "out" : "warn"}`; if (left <= -3) { el.hidden = true; clearInterval(cdTimer); } };
  tick(); cdTimer = setInterval(tick, 250);
}
async function roomChanged() {
  const me = G.room.guests?.[G.info.guest.id];
  if (me?.state) setState(me.state);
  if (me && typeof me.muted === "boolean" && me.muted === micOn()) setMic(!me.muted);
  // Other guests (up to five), pulled from the media relay.
  if (G.mode !== "vdo") {
    const others = Object.entries(G.room.guests || {}).filter(([id, g]) => id !== G.info.guest.id && g.sessionId && g.tracks?.video && g.state !== "left").slice(0, 5);
    for (const [id, g] of others) if (!G.pulls[id] || G.pulls[id].sessionId !== g.sessionId) {
      G.pulls[id] = { sessionId: g.sessionId };
      pull([{ sessionId: g.sessionId, trackName: g.tracks.video }, { sessionId: g.sessionId, trackName: g.tracks.audio }], { t }).then(x => { G.pulls[id] = { ...x, sessionId: g.sessionId }; drawOthers(); }).catch(() => {});
    }
    for (const id of Object.keys(G.pulls)) if (!others.some(([x]) => x === id)) { G.pulls[id].pc?.close(); delete G.pulls[id]; }
    drawOthers();
  }
  // Private talkback: only the guest the producer is talking to hears it.
  const tb = G.room.talkbackTrack, mine = G.room.talkback === G.info.guest.id;
  if (tb && mine && G.talk?.key !== tb.trackName) { G.talk?.pc?.close(); G.talk = { key: tb.trackName }; pull([tb], { t }).then(x => { G.talk = { ...x, key: tb.trackName }; $("#talk").srcObject = x.stream; $("#talk").play().catch(() => {}); say("The producer is talking to you (talkback).", false); }).catch(() => {}); }
  if (!mine && G.talk) { G.talk.pc?.close(); G.talk = null; $("#talk").srcObject = null; }
}
function drawOthers() {
  const box = $("#others"); if (!box) return;
  const ids = Object.keys(G.pulls);
  for (const el of [...box.children]) if (!ids.includes(el.dataset.id)) el.remove();
  for (const id of ids) {
    let el = box.querySelector(`[data-id="${id}"]`);
    if (!el) { el = document.createElement("div"); el.dataset.id = id; el.innerHTML = `<video autoplay playsinline style="width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;object-fit:cover"></video><small data-no-tr></small>`; box.append(el); }
    const v = el.querySelector("video"); if (G.pulls[id].stream && v.srcObject !== G.pulls[id].stream) { v.srcObject = G.pulls[id].stream; v.muted = !$("#hear")?.checked; v.play().catch(() => {}); }
    el.querySelector("small").textContent = G.room.guests?.[id]?.name || "";
  }
}
async function checks() {
  const v = G.stream?.getVideoTracks()[0], a = G.stream?.getAudioTracks()[0];
  const { rtt } = await netStats(G.pub?.pc).catch(() => ({}));
  const conn = navigator.connection?.effectiveType || "";
  const c = { camera: G.mode === "vdo" || v?.readyState === "live", mic: G.mode === "vdo" || a?.readyState === "live", level: Math.round(G.level), network: conn, rtt: rtt || 0, headphones: G.headphones || $("#hp")?.checked || false, device: navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.slice(0, 60) || "" };
  const el = $("#checks"); if (el) el.innerHTML = `<i>${c.camera ? "✅" : "❌"}</i> <span>Camera</span> · <i>${c.mic ? "✅" : "❌"}</i> <span>Microphone</span> · <i>${rtt ? (rtt < 150 ? "✅" : rtt < 350 ? "⚠️" : "❌") : "…"}</i> <span>Network</span>${rtt ? ` <span data-no-tr>${rtt} ms</span>` : ""} · <i>${c.headphones ? "✅" : "⚠️"}</i> <span>Headphones</span>`;
  fetch("/api/studio/guest/checks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t, checks: c }) }).catch(() => {});
}

(async () => {
  await initUiLang({ account: false });
  const r = await fetch(`/api/studio/guest?t=${encodeURIComponent(t)}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { main.innerHTML = `<div class="cr-denied"><img src="/brand/logo-sm.webp" alt="Rashtrix 24×7 News" style="height:64px"><h2>This link is not active</h2><p>${esc(d.error || "Ask the producer for a new link.")}</p></div>`; return; }
  G.info = d;
  welcome();
})();

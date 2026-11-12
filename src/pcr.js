// The PCR (pcr.html?ch=h|v): the vision mixer for a channel. Preview and program monitors, a
// source grid with tally (red: on air, green: in preview), nine layouts, four transitions, TAKE
// and AUTO, graphics layers, name straps, the ticker, "Breaking in now", the running rundown
// (auto or manual; cut in anything at any time, then resume or skip), broadcast delay with DUMP,
// the standby slate, macros, output health and keyboard shortcuts (and Bitfocus Companion).
import "./tv.css";
import { shell, api, toast, fail, esc, $, $$, fmt, istClock } from "./crshell.js";
import { mountTV } from "./engine.js";
import { LAYOUTS, TRANSITIONS, autopilotOn } from "./scenes.js";
import { digits } from "./i18n.js";

const ch = new URLSearchParams(location.search).get("ch") === "v" ? "v" : "h";
const S = { ctl: null, health: {}, pv: { layout: "full", sources: [], label: "" }, slot: 0, sources: [], clips: [], inputs: [], guests: [], macros: [], skew: 0 };
const LAYER_NAMES = { bug: "Logo", live: "LIVE", clock: "Clock", lower: "Name strap", ticker: "Ticker", ad: "Ad box", weather: "Weather & date" };
const MACRO_STEPS = {
  "take": "TAKE preview", "auto": "AUTO (back to the rundown)", "rundown.next": "Next item", "rundown.skip": "Skip item",
  "transition:cut": "Transition: cut", "transition:mix": "Transition: mix", "transition:wipe": "Transition: red slash wipe", "transition:stinger": "Transition: stinger",
  "layers:ticker:0": "Ticker off", "layers:ticker:1": "Ticker on", "layers:lower:0": "Name strap off", "layers:lower:1": "Name strap on", "layers:ad:0": "Ad box off", "layers:ad:1": "Ad box on",
  "lower:clear": "Clear the name strap", "breaking:clear": "Clear breaking", "standby:1": "Standby slate on", "standby:0": "Standby slate off"
};
const stepToCmd = k => { const [c, a, b] = k.split(":");
  if (c === "transition") return { cmd: c, args: { type: a, ms: a === "cut" ? 0 : a === "stinger" ? 1200 : 600 } };
  if (c === "layers") return { cmd: c, args: { [a]: b === "1" } };
  if (c === "lower") return { cmd: "lower", args: {} };
  if (c === "breaking") return { cmd: "breaking", args: { clear: true } };
  if (c === "standby") return { cmd: "standby", args: { on: a === "1" } };
  return { cmd: c, args: {} }; };

const cmd = async (c, args = {}, quiet = false) => { try { const d = await api(`/api/ctl/${ch}/cmd`, { method: "POST", body: { cmd: c, args } }); if (!quiet) flash(c); return d; } catch (e) { fail(e); } };
const flash = c => { const b = $(`[data-cmd="${c}"]`); if (b) { b.classList.add("on"); setTimeout(() => b.classList.remove("on"), 300); } };
const sceneOf = src => ({ layout: "full", sources: [src], label: src.name || src.title || "" });
const same = (a, b) => a && b && a.kind === b.kind && (a.id || a.url || "") === (b.id || b.url || "");

/* ---------- sources for the grid ---------- */
function buildSources() {
  const list = [{ key: "cont", name: "Running order", kind: "continuity", own: true, src: { kind: "continuity" } }];
  S.inputs.forEach(x => list.push({ key: `in:${x.id}`, name: x.name || x.kind.toUpperCase(), kind: x.kind, src: x.kind === "yt" ? { kind: "yt", id: x.url } : { kind: x.kind, url: x.url, name: x.name } }));
  S.guests.forEach(g => list.push({ key: `g:${g.id}`, name: g.name || "Guest", kind: "guest", src: { kind: g.vdo ? "vdo" : "guest", id: g.id, url: g.vdo || "", name: g.name, title: g.title, sessionId: g.sessionId, tracks: g.tracks }, lower: { name: g.name, title: g.title }, live: g.online }));
  S.clips.filter(c => c.status === "ready").slice(0, 30).forEach(c => list.push({ key: `c:${c.id}`, name: c.title, kind: "clip", src: { kind: "clip", url: c.url } }));
  list.push({ key: "gfx:headlines", name: "Headlines", kind: "graphic", own: true, scene: { layout: "graphic", sources: [], graphic: { kind: "headlines" }, label: "Headlines" } });
  list.push({ key: "gfx:slate", name: "Slate", kind: "graphic", own: true, scene: { layout: "graphic", sources: [], graphic: { kind: "slate", text: "" }, label: "Slate" } });
  S.sources = list;
}
function drawSources() {
  const pg = S.ctl?.mode === "manual" ? S.ctl.program : null;
  $(".sources").innerHTML = S.sources.map((s, i) => {
    const inPv = s.scene ? S.pv.graphic?.kind === s.scene.graphic.kind && !S.pv.sources?.length : S.pv.sources?.some(x => same(x, s.src));
    const inPg = pg && (s.scene ? pg.graphic?.kind === s.scene.graphic.kind : pg.sources?.some(x => same(x, s.src)));
    return `<button class="srcbtn ${inPg ? "pg" : ""} ${inPv ? "pv" : ""}" data-i="${i}" title="${esc(s.name)}">${s.kind === "yt" ? `<img src="https://i.ytimg.com/vi/${esc(s.src.id)}/default.jpg" alt="">` : ""}<span class="k">${i < 9 ? digits(i + 1) : ""}</span><b ${s.own ? "" : "data-no-tr"}>${esc(s.name)}</b><small>${s.kind === "continuity" ? "Channel" : s.kind}${s.live === false ? " · offline" : ""}</small></button>`;
  }).join("");
  $$(".srcbtn").forEach(b => b.onclick = () => pickSource(Number(b.dataset.i)));
}
function pickSource(i) {
  const s = S.sources[i]; if (!s) return;
  if (s.scene) { S.pv = structuredClone(s.scene); S.slot = 0; }
  else {
    if (S.pv.layout === "graphic") S.pv = { layout: "full", sources: [], label: "" };
    const n = Math.max(1, LAYOUTS[S.pv.layout].slots);
    S.pv.sources = (S.pv.sources || []).slice(0, n);
    S.pv.sources[S.slot] = structuredClone(s.src);
    for (let k = 0; k < S.slot; k++) S.pv.sources[k] ||= { kind: "continuity" };
    if (S.slot === 0) { S.pv.label = s.name; if (s.lower) S.pv.lower = s.lower; }
    S.slot = Math.min(n - 1, S.slot + (n > 1 ? 1 : 0));
  }
  updatePreview();
}
function updatePreview() {
  S.preview?.setScene(S.pv.sources?.length || S.pv.graphic ? S.pv : null);
  const n = LAYOUTS[S.pv.layout]?.slots || 0;
  $(".layouts").innerHTML = Object.entries(LAYOUTS).map(([k, l]) => `<button class="btn sm ${S.pv.layout === k ? "on" : ""}" data-layout="${k}">${l.name}</button>`).join("");
  $(".slots").innerHTML = n > 1 ? `<span class="muted">Next source goes to:</span>${Array.from({ length: n }, (_, i) => `<button class="btn sm ${S.slot === i ? "sel" : ""}" data-slot="${i}">${i === 0 ? "Main" : `Box ${digits(i + 1)}`}</button>`).join("")}` : "";
  $$("[data-layout]").forEach(b => b.onclick = () => setLayout(b.dataset.layout));
  $$("[data-slot]").forEach(b => b.onclick = () => { S.slot = Number(b.dataset.slot); updatePreview(); });
  $("#pvLabel").textContent = S.pv.label || "";
  drawSources();
}
function setLayout(k) {
  S.pv.layout = k;
  if (k === "graphic") { S.pv.sources = []; S.pv.graphic ||= { kind: "headlines" }; }
  else { S.pv.graphic = k === "lband" ? { kind: "lband", text: S.pv.label || "", lines: [] } : null; const n = LAYOUTS[k].slots; S.pv.sources = (S.pv.sources || []).slice(0, n); if (!S.pv.sources.length) S.pv.sources = [{ kind: "continuity" }]; }
  S.slot = Math.min(S.slot, Math.max(0, LAYOUTS[k].slots - 1)); updatePreview();
}
async function take() {
  if (!S.pv.sources?.length && !S.pv.graphic) return toast("Put something in preview first.", true);
  const scene = { ...S.pv, label: S.pv.label || "PCR" };
  await cmd("take", { scene });
}

/* ---------- the right side: rundown, graphics, delay ---------- */
function drawAutopilot(c) {
  const b = $("#apSwitch"); if (!b) return; const on = autopilotOn(c);
  b.classList.toggle("on", on);
  $("#apState").textContent = on ? "ON: the channel runs itself" : c.standby?.on ? "OFF: standby on air" : c.rundown && c.mode === "auto" ? `OFF: rundown "${c.rundown.title || ""}" on air` : "OFF: a PCR take is on air";
  b.title = on ? "To go off autopilot, take a scene or put a rundown on air." : "Back to the channel's own running order";
}
function drawState() {
  const c = S.ctl; if (!c) return;
  drawAutopilot(c);
  $("#mode").innerHTML = c.standby?.on ? `<span class="tag amber">STANDBY${c.standby.auto ? " (auto)" : ""}</span>` : c.mode === "manual" ? `<span class="tag red">PCR</span>` : c.rundown ? `<span class="tag green">RUNDOWN${c.rundown.auto ? "" : " · manual"}</span>` : `<span class="tag">RUNNING ORDER</span>`;
  $(".trans").innerHTML = Object.entries(TRANSITIONS).map(([k, n]) => `<button class="btn sm ${c.transition?.type === k ? "on" : ""}" data-tr="${k}">${n}</button>`).join("");
  $$("[data-tr]").forEach(b => b.onclick = () => cmd("transition", { type: b.dataset.tr, ms: b.dataset.tr === "cut" ? 0 : b.dataset.tr === "stinger" ? 1200 : b.dataset.tr === "wipe" ? 700 : 600 }));
  $(".layers").innerHTML = Object.entries(LAYER_NAMES).map(([k, n]) => `<button class="btn sm ${c.layers?.[k] ? "on" : ""}" data-layer="${k}">${n}</button>`).join("");
  $$("[data-layer]").forEach(b => b.onclick = () => cmd("layers", { [b.dataset.layer]: !c.layers?.[b.dataset.layer] }));
  $("#delay").value = String(c.delay || 0);
  $("#standby").classList.toggle("on", !!c.standby?.on);
  $("#lowerNow").innerHTML = c.lower ? `On air: <b data-no-tr>${esc(c.lower.name)}</b>` : "";
  $("#breakNow").innerHTML = c.breaking && Date.now() - Date.parse(c.breaking.at) < 90e3 ? `<span class="tag red">BREAKING</span> <span data-no-tr>${esc(c.breaking.text)}</span>` : "";
  const r = c.rundown;
  $("#rdTitle").innerHTML = r ? `<b data-no-tr>${esc(r.title)}</b>` : `<span class="muted">No rundown running. The channel plays its running order.</span>`;
  $("#rdAuto").classList.toggle("on", !!r?.auto); $("#rdAuto").disabled = !r;
  ["#rdPrev", "#rdNext", "#rdSkip", "#rdStop"].forEach(s => { $(s).disabled = !r; });
  $(".rdlist").innerHTML = r ? r.items.map((it, i) => `<div class="rdi ${i === r.index && c.mode === "auto" ? "now" : ""} ${i === r.index + 1 ? "next" : ""} ${it.skipped ? "skipped" : ""}"><span class="t">${digits(i + 1)}</span><span data-no-tr>${esc(it.title || it.type)}</span><span class="row"><span class="t">${digits(fmt(it.dur))}</span><button class="btn sm" data-goto="${i}" title="Go to this item">▶</button><button class="btn sm" data-pv="${i}" title="Load in preview">PV</button></span></div>`).join("") : "";
  $$("[data-goto]").forEach(b => b.onclick = () => cmd("rundown.goto", { index: Number(b.dataset.goto) }));
  $$("[data-pv]").forEach(b => b.onclick = () => { S.pv = structuredClone(r.items[Number(b.dataset.pv)].scene); S.slot = 0; updatePreview(); });
  drawSources();
}
function tickClock() {
  const c = S.ctl, r = c?.rundown, el = $(".countdown");
  if (r && c.mode === "auto" && r.items[r.index]) {
    const end = (r.pausedAt ? r.pausedAt : Date.now() + S.skew) - r.itemStartedAt, left = r.items[r.index].dur - end / 1000;
    el.textContent = `${left < 0 ? "+" : ""}${digits(fmt(left))}`; el.className = `countdown ${left < 0 ? "out" : left < 10 ? "warn" : ""}`;
    const rest = r.items.slice(r.index + 1).reduce((a, x) => a + (x.skipped ? 0 : x.dur), 0) + Math.max(0, left);
    $("#rdLeft").textContent = `Show ends ${digits(istClock(Date.now() + rest * 1000, false))} · ${digits(fmt(rest))} left`;
  } else if (c?.mode === "manual" && c.program?.takenAt) { el.textContent = digits(fmt((Date.now() + S.skew - c.program.takenAt) / 1000)); el.className = "countdown"; $("#rdLeft").textContent = "PCR on air · AUTO goes back to the rundown"; }
  else { el.textContent = "—"; el.className = "countdown"; $("#rdLeft").textContent = ""; }
}
async function pollHealth() {
  try {
    const d = await api(`/api/ctl/${ch}/state`); S.health = d.health || {}; S.skew = d.serverTime - Date.now();
    if (!S.ctl) { S.ctl = d.state; drawState(); }
    const outs = Object.entries(S.health).filter(([, h]) => h.role === "output"), t = d.serverTime;
    $(".health").innerHTML = outs.length ? outs.map(([id, h]) => { const age = (t - h.seen) / 1000, bad = age > 30 || h.stalledFor >= 10;
      return `<div><span>${esc(id)}</span><span class="tag ${bad ? "red" : "green"}">${age > 30 ? `silent ${digits(Math.round(age))}s` : h.stalledFor >= 10 ? `stalled ${digits(h.stalledFor)}s` : "OK"}</span></div>`; }).join("") : `<p class="muted">No output is connected. Open the output page in OBS (control room → TV channels).</p>`;
    const viewers = Object.values(S.health).filter(h => h.role === "viewer" && t - h.seen < 60000).length;
    $("#viewers").textContent = viewers ? digits(viewers) : "";
  } catch { /* offline: try again */ }
}
async function loadGuests() {
  try { const d = await api(`/api/admin/studio/live?channel=${ch}`); S.guests = d.guests || []; } catch { S.guests = []; }
  buildSources(); drawSources();
}

/* ---------- inputs and macros ---------- */
function inputsDialog() {
  const d = document.createElement("dialog");
  const row = x => `<div class="src-row"><select data-k="kind">${["hls", "whep", "vdo", "yt", "image"].map(k => `<option value="${k}" ${x.kind === k ? "selected" : ""}>${{ hls: "HLS stream (.m3u8)", whep: "WebRTC (WHEP)", vdo: "VDO.Ninja view link", yt: "YouTube video ID or link", image: "Picture" }[k]}</option>`).join("")}</select><input data-k="url" value="${esc(x.url || "")}" placeholder="https://…"><input class="full" data-k="name" value="${esc(x.name || "")}" placeholder="Name (e.g. Studio camera, Reporter Howrah)"></div>`;
  d.innerHTML = `<div class="stack"><h3>Live inputs</h3><p class="muted">Streams the PCR can cut to: the studio's own stream from OBS through the media server (HLS or WHEP), VDO.Ninja view links, YouTube lives, pictures.</p><div class="stack" id="inl">${S.inputs.map(row).join("")}</div><div class="row"><button class="btn" id="inAdd">+ Add input</button><button class="btn green" id="inSave">Save</button><button class="btn" id="inClose">Close</button></div></div>`;
  document.body.append(d); d.showModal();
  $("#inAdd", d).onclick = () => $("#inl", d).insertAdjacentHTML("beforeend", row({ kind: "hls" }));
  $("#inClose", d).onclick = () => d.close(); d.addEventListener("close", () => d.remove());
  $("#inSave", d).onclick = async () => {
    const inputs = $$("#inl .src-row", d).map(r => ({ kind: $("[data-k=kind]", r).value, url: $("[data-k=kind]", r).value === "yt" ? ($("[data-k=url]", r).value.match(/(?:v=|youtu\.be\/|live\/)([\w-]{11})/)?.[1] || $("[data-k=url]", r).value.trim()) : $("[data-k=url]", r).value.trim(), name: $("[data-k=name]", r).value.trim() })).filter(x => x.url);
    try { S.inputs = (await api(`/api/admin/inputs/${ch}`, { method: "PUT", body: { inputs } })).inputs; buildSources(); drawSources(); d.close(); toast("Inputs saved."); } catch (e) { fail(e); }
  };
}
function drawMacros() {
  $(".macros").innerHTML = S.macros.filter(m => m.channel === ch).map(m => `<button class="btn sm" data-macro="${m.id}" title="${esc(m.actions.map(a => a.cmd).join(" → "))}">${esc(m.title)}${m.hotkey ? ` <kbd>${esc(m.hotkey)}</kbd>` : ""}</button>`).join("") + `<button class="btn sm" id="macroNew">+ Macro</button>`;
  $$("[data-macro]").forEach(b => b.onclick = () => cmd("macro", { id: b.dataset.macro }));
  $("#macroNew").onclick = macroDialog;
}
function macroDialog() {
  const d = document.createElement("dialog");
  d.innerHTML = `<div class="stack"><h3>New macro</h3><p class="muted">One button (or key) that does several things in order.</p><div class="grid2"><label>Name<input id="mT" placeholder="e.g. Ad break out"></label><label>Key (optional, e.g. F2, Shift+A)<input id="mK"></label></div>
    <div id="mSteps" class="stack"></div><div class="row"><select id="mAdd">${Object.entries(MACRO_STEPS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select><button class="btn" id="mAddB">+ Step</button></div>
    <div class="row"><button class="btn green" id="mSave">Save</button><button class="btn" id="mClose">Close</button></div>
    <h4>Macros</h4><div class="clips-list">${S.macros.filter(m => m.channel === ch).map(m => `<div class="clip"><span>${esc(m.title)}</span><button class="btn sm" data-mdel="${m.id}">Delete</button></div>`).join("") || `<p class="muted">None yet.</p>`}</div></div>`;
  document.body.append(d); d.showModal();
  const steps = [];
  const draw = () => { $("#mSteps", d).innerHTML = steps.map((k, i) => `<div class="clip"><span>${digits(i + 1)}. ${MACRO_STEPS[k]}</span><button class="btn sm" data-rm="${i}">✕</button></div>`).join(""); $$("[data-rm]", d).forEach(b => b.onclick = () => { steps.splice(Number(b.dataset.rm), 1); draw(); }); };
  $("#mAddB", d).onclick = () => { steps.push($("#mAdd", d).value); draw(); };
  $("#mClose", d).onclick = () => d.close(); d.addEventListener("close", () => d.remove());
  $("#mSave", d).onclick = async () => { if (!steps.length) return toast("Add a step.", true); try { await api("/api/admin/macros", { method: "POST", body: { title: $("#mT", d).value || "Macro", hotkey: $("#mK", d).value.trim(), channel: ch, actions: steps.map(stepToCmd) } }); S.macros = (await api("/api/admin/macros")).macros; drawMacros(); d.close(); } catch (e) { fail(e); } };
  $$("[data-mdel]", d).forEach(b => b.onclick = async () => { await api(`/api/admin/macros/${b.dataset.mdel}`, { method: "DELETE" }).catch(fail); S.macros = (await api("/api/admin/macros")).macros; drawMacros(); d.close(); });
}
async function companionDialog() {
  const d = document.createElement("dialog"); document.body.append(d);
  const draw = async (make = false) => {
    const t = await api("/api/admin/companion", { method: make ? "POST" : "GET" }).catch(e => ({ error: e.message }));
    const base = t.token ? `${t.base}${ch}/ACTION?token=${t.token}` : "";
    d.innerHTML = `<div class="stack"><h3>Bitfocus Companion and Stream Deck</h3><p class="muted">In Companion, add the “Generic HTTP” connection and make each button send a GET request to the address below, with ACTION replaced by one of: take, auto, next, prev, skip, dump, standby, standby-off, cut, mix, wipe, stinger, breaking-clear, lower-clear, ticker-on, ticker-off, bug-on, bug-off, ad-on, ad-off, delay-0 … delay-10, macro-&lt;id&gt;. Keep the address private.</p>
      ${base ? `<input readonly value="${esc(base)}" onclick="this.select()">` : `<p>No token yet.</p>`}
      <p class="muted">Macro ids: ${S.macros.filter(m => m.channel === ch).map(m => `${esc(m.title)} = <code>${m.id}</code>`).join(", ") || "none"}</p>
      <div class="row"><button class="btn" id="cNew">${base ? "Make a new token (the old one stops)" : "Make a token"}</button><button class="btn" id="cClose">Close</button></div></div>`;
    $("#cNew", d).onclick = () => draw(true); $("#cClose", d).onclick = () => d.close();
  };
  await draw(); d.showModal(); d.addEventListener("close", () => d.remove());
}

/* ---------- keyboard ---------- */
function keyName(e) { return `${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key.length === 1 ? e.key.toUpperCase() : e.key}`; }
function onKey(e) {
  if (e.target.closest("input, textarea, select, dialog")) return;
  const k = keyName(e);
  const m = S.macros.find(x => x.channel === ch && x.hotkey && x.hotkey.toLowerCase() === k.toLowerCase());
  if (m) { e.preventDefault(); return cmd("macro", { id: m.id }); }
  const map = {
    " ": take, Enter: () => cmd("auto"), N: () => cmd("rundown.next"), B: () => cmd("rundown.prev"), K: () => cmd("rundown.skip"),
    X: () => cmd("transition", { type: "cut", ms: 0 }), M: () => cmd("transition", { type: "mix", ms: 600 }), W: () => cmd("transition", { type: "wipe", ms: 700 }), G: () => cmd("transition", { type: "stinger", ms: 1200 }),
    "Shift+D": () => dump(), "Shift+S": () => cmd("standby", { on: !S.ctl?.standby?.on }), L: () => $("#lowerShow").click(), "Shift+L": () => cmd("lower", {}),
    Escape: () => { S.pv = { layout: "full", sources: [], label: "" }; S.slot = 0; updatePreview(); }
  };
  const f = map[e.key === " " ? " " : k];
  if (f) { e.preventDefault(); return f(); }
  if (/^[1-9]$/.test(e.key) && !e.shiftKey) { e.preventDefault(); return pickSource(Number(e.key) - 1); }
  if (/^Shift\+[1-9]$/.test(k) || /^[!@#$%^&*(]$/.test(e.key)) { const i = "!@#$%^&*(".indexOf(e.key); const idx = i >= 0 ? i : Number(k.slice(-1)) - 1; const L = Object.keys(LAYOUTS)[idx]; if (L) { e.preventDefault(); setLayout(L); } }
}
async function dump() { await cmd("dump"); toast("DUMP: the outputs threw away the delayed picture. The standby slate is up; press AUTO or TAKE to go back.", false); }

/* ---------- start ---------- */
(async () => {
  const user = await shell(ch === "h" ? "PCR · Rashtrix TV" : "PCR · Rashtrix Shorts");
  if (!user) return;
  $("main").innerHTML = `<div class="pcr ${ch === "v" ? "vert" : ""}"><section>
    <div class="status-strip" style="margin-bottom:8px"><a class="btn sm" href="?ch=${ch === "h" ? "v" : "h"}">Switch to ${ch === "h" ? "Rashtrix Shorts" : "Rashtrix TV"}</a><span id="mode"></span><span class="muted">App viewers on the control link: <b id="viewers"></b></span><span class="spacer" style="flex:1"></span><button class="btn sm" id="inputsBtn">Live inputs</button><button class="btn sm" id="compBtn">Companion</button><a class="btn sm" href="/tv.html?ch=${ch}" target="_blank" title="Needs the output key">Output page</a></div>
    <div class="monitors"><div class="mon pv"><header><span>PREVIEW</span><span id="pvLabel" data-no-tr></span></header><div class="host" id="pvHost" data-no-tr></div></div>
      <div class="mon pg"><header><span>PROGRAM</span><span>before delay</span></header><div class="host" id="pgHost" data-no-tr></div></div></div>
    <div class="switcher"><div class="stack">
      <div class="panel" data-open><h2>Sources <small class="muted">(1–9)</small></h2><div class="sources"></div></div>
      <div class="panel"><h2>Layout <small class="muted">(Shift+1–9)</small></h2><div class="layouts"></div><div class="slots" style="margin-top:6px"></div></div>
      <div class="panel"><h2>Transition <small class="muted">(X M W G)</small></h2><div class="trans"></div></div>
      <div class="panel"><h2>Graphics</h2><div class="layers"></div>
        <div class="row" style="margin-top:8px"><input id="lowerName" placeholder="Name strap: name" data-no-tr><input id="lowerTitle" placeholder="Title" data-no-tr><button class="btn" id="lowerShow">Show (L)</button><button class="btn" id="lowerClear">Clear</button><span id="lowerNow" class="muted"></span></div>
        <div class="row" style="margin-top:8px"><textarea id="ticker" rows="2" placeholder="Ticker lines (one a line). Empty = the latest headlines." data-no-tr></textarea><button class="btn" id="tickerSet">Set ticker</button></div></div>
      <div class="panel"><h2>Macros</h2><div class="macros row"></div></div>
    </div><div class="tbar"><button class="btn red take" id="take" data-cmd="take">TAKE</button><button class="btn green auto" id="auto" data-cmd="auto">AUTO</button><p class="muted" style="max-width:150px;font-size:12px">TAKE puts preview on air. AUTO goes back to the rundown (or the running order).</p></div></div>
  </section><aside class="side">
    <div class="panel ap-panel"><button class="ap-switch" id="apSwitch" type="button"><i></i><span><b>AUTOPILOT</b><small id="apState">…</small></span></button></div>
    <div class="panel" data-open><h2>Breaking in now</h2><div class="stack"><input id="brText" placeholder="Breaking headline (Bengali)" data-no-tr><div class="row"><label>Seconds<input id="brSec" type="number" value="20" min="5" max="60" style="width:70px"></label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="brMusic" checked> Music</label><button class="btn red" id="brGo">Breaking in now</button><button class="btn" id="brClear">Clear</button></div><div id="breakNow"></div></div></div>
    <div class="panel" data-open><h2>Rundown</h2><div id="rdTitle"></div><div class="countdown">—</div><p class="muted" id="rdLeft" style="text-align:center;margin:0 0 6px"></p>
      <div class="row" style="margin-bottom:6px"><button class="btn sm" id="rdPrev">◀ Prev (B)</button><button class="btn sm" id="rdNext">Next ▶ (N)</button><button class="btn sm" id="rdSkip">Skip (K)</button><button class="btn sm" id="rdAuto">Auto advance</button><button class="btn sm" id="rdStop">Stop</button><a class="btn sm" href="/producer.html">Producer</a></div><div class="rdlist"></div></div>
    <div class="panel"><h2>Delay and safety</h2><div class="row"><label>Broadcast delay<select id="delay">${Array.from({ length: 11 }, (_, i) => `<option value="${i}" data-no-tr>${digits(i)} s</option>`).join("")}</select></label><button class="btn red dump" id="dump" title="Shift+D">DUMP</button><button class="btn amber" id="standby" title="Shift+S">Standby slate</button></div>
      <p class="muted" style="font-size:12px">With a delay, the outputs run behind the PCR. DUMP throws away what is waiting and puts the standby slate up. If an output's source stops for 10 seconds, the standby slate goes up by itself and the newsroom gets an alert.</p></div>
    <div class="panel"><h2>Outputs</h2><div class="health"></div></div>
    <div class="panel pc-keys"><h2>Keys</h2><div class="keys"><div><kbd>Space</kbd> TAKE</div><div><kbd>Enter</kbd> AUTO</div><div><kbd>1–9</kbd> source</div><div><kbd>Shift+1–9</kbd> layout</div><div><kbd>N</kbd> next</div><div><kbd>B</kbd> previous</div><div><kbd>K</kbd> skip</div><div><kbd>X M W G</kbd> transitions</div><div><kbd>L</kbd> name strap</div><div><kbd>Shift+L</kbd> strap off</div><div><kbd>Shift+D</kbd> DUMP</div><div><kbd>Shift+S</kbd> standby</div><div><kbd>Esc</kbd> clear preview</div></div></div>
  </aside></div>`;
  S.preview = mountTV($("#pvHost"), { channel: ch, mode: "scene", scene: null, muted: true });
  S.program = mountTV($("#pgHost"), { channel: ch, mode: "program", muted: true, onState: st => { S.ctl = st; drawState(); } });
  const [inp, clips, macros] = await Promise.all([api(`/api/admin/inputs/${ch}`).catch(() => ({ inputs: [] })), api("/api/admin/clips").catch(() => ({ clips: [] })), api("/api/admin/macros").catch(() => ({ macros: [] }))]);
  S.inputs = inp.inputs; S.clips = clips.clips; S.macros = macros.macros;
  buildSources(); updatePreview(); drawMacros();
  $("#take").onclick = take; $("#auto").onclick = () => cmd("auto");
  $("#apSwitch").onclick = () => { if (autopilotOn(S.ctl)) return; if (confirm("Switch AUTOPILOT on? The channel's own running order goes on air now (any rundown stops).")) cmd("autopilot", { on: true }); };
  $("#rdPrev").onclick = () => cmd("rundown.prev"); $("#rdNext").onclick = () => cmd("rundown.next"); $("#rdSkip").onclick = () => cmd("rundown.skip");
  $("#rdAuto").onclick = () => cmd("rundown.auto", { on: !S.ctl?.rundown?.auto }); $("#rdStop").onclick = () => { if (confirm("Stop the rundown? The channel goes back to its running order.")) cmd("rundown.stop"); };
  $("#lowerShow").onclick = () => { const name = $("#lowerName").value.trim() || S.pv.lower?.name; if (!name) return toast("Type a name for the strap.", true); cmd("lower", { name, title: $("#lowerTitle").value.trim() || (name === S.pv.lower?.name ? S.pv.lower.title : "") }); };
  $("#lowerClear").onclick = () => cmd("lower", {});
  $("#tickerSet").onclick = () => cmd("ticker", { lines: $("#ticker").value.split("\n").map(x => x.trim()).filter(Boolean) });
  $("#brGo").onclick = () => { const text = $("#brText").value.trim(); if (!text) return toast("Write the breaking headline.", true); cmd("breaking", { text, seconds: Number($("#brSec").value), music: $("#brMusic").checked }); };
  $("#brClear").onclick = () => cmd("breaking", { clear: true });
  $("#delay").onchange = e => cmd("delay", { seconds: Number(e.target.value) });
  $("#dump").onclick = dump;
  $("#standby").onclick = () => cmd("standby", { on: !S.ctl?.standby?.on });
  $("#inputsBtn").onclick = inputsDialog; $("#compBtn").onclick = companionDialog;
  document.addEventListener("keydown", onKey);
  pollHealth(); setInterval(pollHealth, 5000); setInterval(tickClock, 250);
  loadGuests(); setInterval(loadGuests, 5000);
})();

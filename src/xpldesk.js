// The Explainer desk: long-form Vox-style explainers of 1.5 to 2.5 minutes (src/explainer.js,
// drawn by src/xpl.js). The desk gives the source (pasted text, links, or a published story), the
// style, the length, the voice (the channel's newsreader, or recorded here line by line) and the
// pictures, videos and bytes; the free Gemini models write the shot list from the source alone; an
// editor reads and changes every shot, previews the film in TV and Shorts, voices it, downloads it
// as an MP4 and sends it on air.
import { shell, api, toast, fail, esc, $, $$, fmt } from "./crshell.js";
import { libraryPicker } from "./libpick.js";
import { STYLES, SHOT_TYPES, timeline, playExplainer, makeExplainerFile, xplHasYouTube, loadAssets, film } from "./xpl.js";
// (for the desk's own checks: ?rxdebug exposes the drawing engine)
if (/[?&]rxdebug/.test(location.search)) window.__xpl = { loadAssets, film };
import "./xpldesk.css";

const S = { list: [], cfg: {}, cur: null, dirty: false, media: [], orient: "h", pv: null, stories: null, form: { style: "politics", minutes: 2, sex: "f" } };
const ago = t => { const h = (Date.now() - Date.parse(String(t).replace(" ", "T") + (/[zZ]$/.test(t) ? "" : "Z"))) / 3600e3; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`; };
const mmss = s => fmt(Math.round(s || 0));

async function uploadImage(file) {
  const bmp = await createImageBitmap(file);
  for (const [max, q] of [[1920, .86], [1600, .8], [1400, .72]]) {
    const k = Math.min(1, max / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", q));
    if (blob && blob.size < 1_700_000) { const r = await fetch("/api/admin/images", { method: "POST", headers: { "content-type": blob.type, "x-image-width": String(w), "x-image-height": String(h) }, body: blob }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Upload failed."); return d.url; }
  }
  throw new Error("The picture is too large.");
}

async function load() {
  try { const d = await api("/api/admin/explainers"); S.list = d.explainers; S.cfg = d; drawList(); } catch (e) { fail(e); }
}
async function open(id) {
  try { const d = await api(`/api/admin/explainers/${encodeURIComponent(id)}`); S.cur = d.explainer; S.dirty = false; history.replaceState(null, "", `#${id}`); drawEditor(); } catch (e) { fail(e); }
}

/* ---------- left: new explainer and the list ---------- */
function drawList() {
  const f = S.form;
  $(".xd-side").innerHTML = `<section class="panel xd-new"><h2>New explainer</h2>
      ${S.cfg.writer === false ? `<p class="xd-warn">The Gemini key is not set, so shot lists cannot be written.</p>` : ""}
      <label>Working headline (optional)<input id="nTitle" value="${esc(f.title || "")}" data-no-tr></label>
      <label>Paste the report's text<textarea id="nText" rows="6" placeholder="The full text of the report, notes, figures…" data-no-tr>${esc(f.text || "")}</textarea></label>
      <label>Or links to articles (one a line)<textarea id="nLinks" rows="2" placeholder="https://…" data-no-tr>${esc(f.links || "")}</textarea></label>
      <label>Or a published Rashtrix story<div class="row"><input id="nStoryQ" placeholder="Search stories" value="${esc(f.storyQ || "")}"><button class="btn sm" type="button" id="nStoryFind">Find</button></div></label>
      <div id="nStories" class="xd-stories">${f.story ? `<div class="xd-pick on"><b data-no-tr>${esc(f.story.title)}</b><button class="btn sm" type="button" id="nStoryX">✕</button></div>` : ""}</div>
      <div class="xd-styles">${Object.entries(STYLES).map(([k, s]) => `<button type="button" class="xd-style${f.style === k ? " on" : ""}" data-style="${k}" style="--a:${s.acc};--b:${s.bg};--i:${s.ink}"><i></i><b>${esc(s.name)}</b></button>`).join("")}</div>
      <div class="row xd-opts"><label>Length<select id="nMin">${[1.5, 2, 2.5].map(m => `<option value="${m}" ${f.minutes == m ? "selected" : ""}>${m} min</option>`).join("")}</select></label>
        <label>Voice<select id="nSex"><option value="f" ${f.sex === "f" ? "selected" : ""}>Newsreader (woman)</option><option value="m" ${f.sex === "m" ? "selected" : ""}>Newsreader (man)</option><option value="rec" ${f.sex === "rec" ? "selected" : ""}>Recorded here</option></select></label></div>
      <div class="xd-media"><b>Pictures, videos and bytes</b>
        <div class="xd-mlist">${S.media.map((m, i) => `<div class="xd-m"><span class="tag">${m.kind === "byte" ? "BYTE" : m.kind === "video" ? "VIDEO" : "PICTURE"}</span><small data-no-tr>${esc(m.kind === "byte" ? `${m.name || "—"}${m.role ? `, ${m.role}` : ""} · ${m.secs || "?"} s` : m.note || m.url.split("/").pop())}</small><button class="btn sm" type="button" data-mx="${i}">✕</button></div>`).join("") || `<p class="muted">None yet. The film is made from graphics alone without them.</p>`}</div>
        <div class="row"><label class="btn sm">Upload picture<input type="file" id="nImg" accept="image/*" multiple hidden></label><button class="btn sm" type="button" id="nLib">Video from the library</button><button class="btn sm" type="button" id="nByte">Add a byte</button><button class="btn sm" type="button" id="nLink">Picture or video link</button></div></div>
      <button class="btn red xd-go" type="button" id="nGo">Write the explainer</button>
      <p class="muted" style="font-size:12px;margin:0">The shot list is written from your source alone, in the house style. Nothing is voiced or aired before you have read it.</p></section>
    <section class="panel xd-list"><h2>Explainers</h2>${S.list.map(x => `<button type="button" class="xd-item${S.cur?.id === x.id ? " on" : ""}" data-open="${esc(x.id)}" style="--a:${(STYLES[x.style] || STYLES.politics).acc}">
      <b data-no-tr>${esc(x.title || "Untitled")}</b><small>${esc((STYLES[x.style] || {}).name || "")} · ${mmss(x.secs)} · ${x.status === "voiced" ? "voiced" : "draft"}${x.aired ? ` · aired ${x.aired}×` : ""} · ${ago(x.createdAt)}</small></button>`).join("") || `<p class="muted">None yet.</p>`}</section>`;
  const keepForm = () => { f.title = $("#nTitle").value; f.text = $("#nText").value; f.links = $("#nLinks").value; f.storyQ = $("#nStoryQ").value; f.minutes = $("#nMin").value; f.sex = $("#nSex").value; };
  $$("[data-style]").forEach(b => b.onclick = () => { keepForm(); f.style = b.dataset.style; drawList(); });
  $$("[data-open]").forEach(b => b.onclick = () => open(b.dataset.open));
  $$("[data-mx]").forEach(b => b.onclick = () => { keepForm(); S.media.splice(+b.dataset.mx, 1); drawList(); });
  $("#nStoryX")?.addEventListener("click", () => { keepForm(); f.story = null; drawList(); });
  $("#nStoryFind").onclick = async () => {
    keepForm(); const q = f.storyQ.trim().toLowerCase();
    if (!S.stories) S.stories = (await api("/api/articles").catch(() => ({ articles: [] }))).articles || [];
    const hits = S.stories.filter(a => !q || `${a.title} ${a.dek || ""}`.toLowerCase().includes(q)).slice(0, 8);
    $("#nStories").innerHTML = hits.map(a => `<button type="button" class="xd-pick" data-story="${esc(a.id)}"><b data-no-tr>${esc(a.title)}</b><small>${esc(a.category || "")}</small></button>`).join("") || `<p class="muted">No story found.</p>`;
    $$("[data-story]").forEach(b => b.onclick = () => { const a = S.stories.find(x => x.id === b.dataset.story); f.story = { id: a.id, title: a.title }; drawList(); });
  };
  $("#nImg").onchange = async e => { keepForm(); for (const file of e.target.files) { try { toast("Uploading the picture…"); S.media.push({ kind: "image", url: await uploadImage(file), note: file.name.replace(/\.\w+$/, "") }); } catch (err) { fail(err); } } drawList(); };
  $("#nLib").onclick = () => { keepForm(); libraryPicker({ title: "A video for the explainer", types: ["clip", "video"], onPick: x => { S.media.push({ kind: "video", url: x.url, note: x.title }); drawList(); } }); };
  $("#nLink").onclick = () => { keepForm(); const u = prompt("Paste a picture or video link (https://…)"); if (!u) return; if (!/^https:\/\//.test(u.trim())) return toast("The link must start with https://", true); S.media.push({ kind: /\.(mp4|webm|mov)(\?|$)|youtu\.?be/i.test(u) ? "video" : "image", url: u.trim(), note: u.trim().split("/").pop().slice(0, 60) }); drawList(); };
  $("#nByte").onclick = () => { keepForm(); byteDialog(m => { S.media.push(m); drawList(); }); };
  $("#nGo").onclick = async e => {
    keepForm(); const b = e.currentTarget;
    if (!f.text.trim() && !f.links.trim() && !f.story) return toast("Give the source: paste the text, a link, or pick a story.", true);
    b.disabled = true; b.textContent = "Writing the shot list… (up to a minute)";
    try {
      const d = await api("/api/admin/explainers", { method: "POST", body: { title: f.title, text: f.text, links: f.links.split(/\s+/).filter(Boolean), storyId: f.story?.id || "", style: f.style, minutes: Number(f.minutes), sex: f.sex === "rec" ? "f" : f.sex, media: S.media } });
      if (f.sex === "rec") await api(`/api/admin/explainers/${d.id}`, { method: "PUT", body: { voiceMode: "rec" } });
      S.form = { style: f.style, minutes: f.minutes, sex: f.sex }; S.media = [];
      toast("Written. Read every shot before you voice it."); await load(); await open(d.id);
    } catch (err) { fail(err); }
    b.disabled = false; b.textContent = "Write the explainer";
  };
}
// A byte: from the Content Library or a link, with the speaker's name, designation and length.
function byteDialog(use, cur = {}) {
  const d = document.createElement("dialog"); d.className = "xd-dlg";
  d.innerHTML = `<div class="stack"><h3>A byte (played in full)</h3>
    <div class="row"><input id="bUrl" placeholder="Video link (an uploaded clip or YouTube)" value="${esc(cur.url || "")}" style="flex:1" data-no-tr><button class="btn sm" type="button" id="bLib">From the library</button></div>
    <label>Name (Bengali)<input id="bName" value="${esc(cur.name || "")}" data-no-tr></label>
    <label>Designation (Bengali)<input id="bRole" value="${esc(cur.role || "")}" data-no-tr></label>
    <div class="row"><label>Length in seconds<input id="bSecs" type="number" min="3" max="600" value="${cur.secs || 20}"></label><label style="flex:1">What it is about (helps place it)<input id="bNote" value="${esc(cur.note || "")}" data-no-tr></label></div>
    <div class="row"><span class="spacer" style="flex:1"></span><button class="btn" type="button" data-close>Cancel</button><button class="btn green" type="button" id="bOk">Add the byte</button></div></div>`;
  document.body.append(d); d.showModal(); d.addEventListener("close", () => d.remove());
  $("[data-close]", d).onclick = () => d.close();
  $("#bLib", d).onclick = () => libraryPicker({ title: "A byte from the library", types: ["clip", "video"], onPick: x => { $("#bUrl", d).value = x.url; if (x.dur) $("#bSecs", d).value = Math.round(x.dur); } });
  $("#bOk", d).onclick = () => { const url = $("#bUrl", d).value.trim(); if (!/^(https:\/\/|\/clips\/)/.test(url)) return toast("Give the byte's video link.", true); if (!$("#bName", d).value.trim()) return toast("Give the speaker's name.", true);
    use({ kind: "byte", url, name: $("#bName", d).value.trim(), role: $("#bRole", d).value.trim(), secs: Math.max(3, Number($("#bSecs", d).value) || 20), note: $("#bNote", d).value.trim() }); d.close(); };
}

/* ---------- right: the editor ---------- */
const lines = a => (a || []).map(i => typeof i === "string" ? i : [i.label ?? i.when ?? "", i.value ?? i.what ?? ""].join(" | ")).join("\n");
function fields(s, i) {
  const F = (k, label, v, w = "") => `<label class="${w}">${label}<input data-f="${k}" data-i="${i}" value="${esc(v ?? "")}" data-no-tr></label>`;
  switch (s.t) {
    case "kinetic": return F("text", "On screen (| breaks a line)", s.text, "wide") + F("hl", "Highlight (comma between)", (s.hl || []).join(", "));
    case "number": return F("value", "Number", s.value) + F("prefix", "Before (₹)", s.prefix) + F("suffix", "After ( কোটি, %)", s.suffix) + F("label", "What it is", s.label, "wide");
    case "versus": return F("a.value", "A: number", s.a?.value) + F("a.label", "A: label", s.a?.label) + F("b.value", "B: number", s.b?.value) + F("b.label", "B: label", s.b?.label);
    case "bars": return F("text", "Title", s.text, "wide") + `<label class="wide">Bars, one a line: label | number<textarea data-f="items" data-i="${i}" rows="3" data-no-tr>${esc((s.items || []).map(x => `${x.label} | ${x.value}`).join("\n"))}</textarea></label>`;
    case "timeline": return `<label class="wide">Events, one a line: when | what<textarea data-f="items" data-i="${i}" rows="3" data-no-tr>${esc((s.items || []).map(x => `${x.when} | ${x.what}`).join("\n"))}</textarea></label>`;
    case "list": return F("text", "Title", s.text, "wide") + `<label class="wide">Points, one a line<textarea data-f="items" data-i="${i}" rows="3" data-no-tr>${esc((s.items || []).join("\n"))}</textarea></label>`;
    case "quote": return F("text", "The quote", s.text, "wide") + F("who", "Who said it", s.who);
    case "doc": return F("text", "The document's line", s.text, "wide") + F("hl", "Phrase to highlight", (s.hl || []).join(", ")) + F("source", "Document", s.source);
    case "map": return `<label class="wide">Places, one a line: name | lat | lon (the first is where it happened)<textarea data-f="places" data-i="${i}" rows="3" data-no-tr>${esc((s.places || []).map(p => `${p.name} | ${p.lat} | ${p.lon}`).join("\n"))}</textarea></label>` + F("text", "Title (optional)", s.text);
    case "photo": case "video": return F("media", s.t === "photo" ? "Picture link" : "Video link", s.media, "wide") + `<button class="btn sm" type="button" data-mpick="${i}">${s.t === "photo" ? "Upload" : "Library"}</button>` + F("text", "Caption", s.text) + F("credit", "Credit", s.credit);
    case "byte": return F("media", "Byte video", s.media, "wide") + `<button class="btn sm" type="button" data-mpick="${i}">Library</button>` + F("name", "Name", s.name) + F("role", "Designation", s.role) + F("secs", "Seconds", s.secs);
  }
  return "";
}
function drawEditor() {
  const x = S.cur; if (!x) { $(".xd-main").innerHTML = `<div class="xd-empty"><h2>Explainer desk</h2><p>Write a new explainer on the left, or open one from the list.</p></div>`; return; }
  const tl = timeline(x), voiced = x.shots.filter(s => s.t !== "byte" && s.say).every(s => s.voice?.url), yt = xplHasYouTube(x);
  $(".xd-main").innerHTML = `<section class="panel xd-head">
      <div class="row" style="flex-wrap:wrap;gap:10px"><label style="flex:1;min-width:260px">Headline (on the NEWS UPDATE band)<input id="eTitle" value="${esc(x.title)}" data-no-tr></label><label>Kicker<input id="eKicker" value="${esc(x.kicker)}" data-no-tr style="width:150px"></label>
        <label>Style<select id="eStyle">${Object.entries(STYLES).map(([k, s]) => `<option value="${k}" ${x.style === k ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
        <label>Voice<select id="eVoice"><option value="f" ${x.voiceMode === "tts" && x.sex === "f" ? "selected" : ""}>Newsreader (woman)</option><option value="m" ${x.voiceMode === "tts" && x.sex === "m" ? "selected" : ""}>Newsreader (man)</option><option value="rec" ${x.voiceMode === "rec" ? "selected" : ""}>Recorded here</option></select></label></div>
      <div class="xd-stats"><span><b>${mmss(tl.total)}</b> in all</span><span><b>${x.shots.length}</b> shots</span><span class="${voiced ? "ok" : "warn"}">${voiced ? "Every line voiced" : `${x.shots.filter(s => s.t !== "byte" && s.say && !s.voice?.url).length} lines without a voice`}</span>${S.dirty ? `<span class="warn">Not saved</span>` : ""}${yt ? `<span class="warn" title="YouTube does not let a browser put its videos in a file">YouTube video: plays on air, not in the download</span>` : ""}</div>
      <div class="row xd-acts"><button class="btn green" id="eSave">Save</button>${x.voiceMode === "tts" ? `<button class="btn" id="eVoiceAll"${S.cfg.voice === false ? " disabled title=\"The newsreader's voice is not set up\"" : ""}>Voice every line</button>` : ""}
        <span class="xd-sep"></span><button class="btn" id="eDlH">Download TV (16:9)</button><button class="btn" id="eDlV">Download Shorts (9:16)</button>
        <span class="xd-sep"></span><button class="btn red" id="ePlay">Play on air now</button>
        <span class="spacer" style="flex:1"></span><label class="chk"><input type="checkbox" id="eKeep" ${x.keep ? "checked" : ""}> Keep</label><button class="btn" id="eDel">Delete</button></div>
      <div class="xd-prog" hidden><i></i><span></span></div></section>
    <section class="xd-body">
      <div class="panel xd-preview"><div class="row"><button class="btn sm${S.orient === "h" ? " on" : ""}" data-or="h">TV 16:9</button><button class="btn sm${S.orient === "v" ? " on" : ""}" data-or="v">Shorts 9:16</button><span class="spacer" style="flex:1"></span><button class="btn sm green" id="pPlay">▶ Play from the start</button><button class="btn sm" id="pStop">■ Stop</button></div>
        <div class="xd-screen ${S.orient}"></div><p class="muted" style="font-size:12px;margin:6px 0 0">The preview is the film itself: what airs and what downloads is drawn the same way.</p></div>
      <div class="xd-shots">${x.shots.map((s, i) => `<article class="panel xd-shot" data-k="${i}">
        <header><span class="xd-n">${i + 1}</span><select data-type="${i}">${Object.entries(SHOT_TYPES).map(([k, n]) => `<option value="${k}" ${s.t === k ? "selected" : ""}>${n}</option>`).join("")}</select>
          <small class="muted">${mmss(tl.shots[i]?.t0 || 0)} · ${(tl.shots[i]?.d || 0).toFixed(1)} s</small><span class="spacer" style="flex:1"></span>
          ${s.t !== "byte" ? (s.voice?.url ? `<button class="btn sm" data-listen="${i}" title="Listen">▶ ${s.voice.rec ? "Recorded" : "Voice"} ${s.voice.secs.toFixed(1)} s</button>` : `<span class="tag amber">no voice</span>`) : ""}
          ${x.voiceMode === "rec" && s.t !== "byte" ? `<button class="btn sm red" data-rec="${i}">● Record</button>` : ""}
          <button class="btn sm" data-from="${i}" title="Preview from here">▶ Preview</button><button class="btn sm" data-up="${i}" ${i ? "" : "disabled"}>↑</button><button class="btn sm" data-down="${i}" ${i < x.shots.length - 1 ? "" : "disabled"}>↓</button><button class="btn sm" data-add="${i}">+ After</button><button class="btn sm" data-del="${i}">✕</button></header>
        ${s.t !== "byte" ? `<label class="wide">Narration (read aloud)<textarea data-f="say" data-i="${i}" rows="2" data-no-tr>${esc(s.say || "")}</textarea></label>` : `<label class="wide">Lead-in (the narration before the byte, optional)<textarea data-f="say" data-i="${i}" rows="1" data-no-tr>${esc(s.say || "")}</textarea></label>`}
        <div class="xd-f">${fields(s, i)}</div></article>`).join("")}</div>
    </section>`;
  wireEditor();
}
const split = v => String(v || "").split("\n").map(l => l.split("|").map(p => p.trim())).filter(p => p[0]);
function setField(s, k, v) {
  if (k === "hl") s.hl = String(v).split(",").map(x => x.trim()).filter(Boolean);
  else if (k === "items") s.items = s.t === "list" ? String(v).split("\n").map(x => x.trim()).filter(Boolean) : s.t === "bars" ? split(v).map(p => ({ label: p[0], value: Number(String(p[1] || "").replace(/[^\d.]/g, "")) || 0 })) : split(v).map(p => ({ when: p[0], what: p[1] || "" }));
  else if (k === "places") s.places = split(v).map(p => ({ name: p[0], lat: Number(p[1]) || 0, lon: Number(p[2]) || 0 }));
  else if (k.includes(".")) { const [a, b] = k.split("."); s[a] = { ...(s[a] || {}), [b]: b === "value" ? Number(v) || 0 : v }; }
  else if (["value", "secs"].includes(k)) s[k] = Number(v) || 0;
  else s[k] = v;
  if (k === "say" && s.voice && !s.voice.rec) delete s.voice;
}
function wireEditor() {
  const x = S.cur, mark = () => { if (!S.dirty) { S.dirty = true; const st = $(".xd-stats"); if (st && !st.querySelector(".nsv")) st.insertAdjacentHTML("beforeend", `<span class="warn nsv">Not saved</span>`); } };
  $("#eTitle").oninput = e => { x.title = e.target.value; mark(); };
  $("#eKicker").oninput = e => { x.kicker = e.target.value; mark(); };
  $("#eStyle").onchange = e => { x.style = e.target.value; mark(); drawEditor(); };
  $("#eVoice").onchange = e => { const v = e.target.value; x.voiceMode = v === "rec" ? "rec" : "tts"; if (v !== "rec") x.sex = v; mark(); drawEditor(); };
  $$("[data-f]").forEach(el => el.oninput = () => { setField(x.shots[+el.dataset.i], el.dataset.f, el.value); mark(); });
  $$("[data-type]").forEach(el => el.onchange = () => { x.shots[+el.dataset.type].t = el.value; mark(); drawEditor(); });
  $$("[data-up]").forEach(b => b.onclick = () => { const i = +b.dataset.up; [x.shots[i - 1], x.shots[i]] = [x.shots[i], x.shots[i - 1]]; mark(); drawEditor(); });
  $$("[data-down]").forEach(b => b.onclick = () => { const i = +b.dataset.down; [x.shots[i + 1], x.shots[i]] = [x.shots[i], x.shots[i + 1]]; mark(); drawEditor(); });
  $$("[data-add]").forEach(b => b.onclick = () => { x.shots.splice(+b.dataset.add + 1, 0, { t: "kinetic", say: "", text: "" }); mark(); drawEditor(); });
  $$("[data-del]").forEach(b => b.onclick = () => { if (!confirm("Remove this shot?")) return; x.shots.splice(+b.dataset.del, 1); mark(); drawEditor(); });
  $$("[data-listen]").forEach(b => b.onclick = () => new Audio(x.shots[+b.dataset.listen].voice.url).play().catch(() => {}));
  $$("[data-mpick]").forEach(b => b.onclick = () => { const i = +b.dataset.mpick, s = x.shots[i];
    if (s.t === "photo") { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = async () => { try { s.media = await uploadImage(inp.files[0]); mark(); drawEditor(); } catch (e) { fail(e); } }; inp.click(); }
    else libraryPicker({ title: s.t === "byte" ? "The byte" : "A video", types: ["clip", "video"], onPick: v => { s.media = v.url; if (s.t === "byte" && v.dur) s.secs = Math.round(v.dur); mark(); drawEditor(); } }); });
  $$("[data-rec]").forEach(b => b.onclick = () => recordLine(+b.dataset.rec));
  $$("[data-or]").forEach(b => b.onclick = () => { S.orient = b.dataset.or; stopPreview(); drawEditor(); });
  $$("[data-from]").forEach(b => b.onclick = () => preview(timeline(x).shots[+b.dataset.from]?.t0 || 0));
  $("#pPlay").onclick = () => preview(0); $("#pStop").onclick = stopPreview;
  $("#eKeep").onchange = e => { x.keep = e.target.checked; mark(); };
  $("#eSave").onclick = save;
  $("#eVoiceAll")?.addEventListener("click", async e => { const b = e.currentTarget; if (S.dirty) await save(); b.disabled = true; b.textContent = "Voicing… (about half a minute)";
    try { const d = await api(`/api/admin/explainers/${x.id}/voice`, { method: "POST" }); S.cur = d.explainer; toast("Every line has its voice."); drawEditor(); load(); } catch (err) { fail(err); b.disabled = false; b.textContent = "Voice every line"; } });
  $("#eDel").onclick = async () => { if (!confirm("Delete this explainer for good?")) return; try { await api(`/api/admin/explainers/${x.id}`, { method: "DELETE" }); S.cur = null; history.replaceState(null, "", location.pathname); drawEditor(); load(); toast("Deleted."); } catch (e) { fail(e); } };
  $("#ePlay").onclick = async () => { if (S.dirty) await save();
    const ch = prompt("Play it now on which channel? Type TV, Shorts or both.", "TV"); if (ch === null) return;
    const chs = /^tv$/i.test(ch.trim()) ? ["h"] : /^shorts$/i.test(ch.trim()) ? ["v"] : ["h", "v"];
    try { const d = await api(`/api/admin/explainers/${x.id}/play`, { method: "POST", body: { channels: chs } }); toast(`On air now (${mmss(d.seconds)}). The channel goes back to autopilot after it.`); load(); } catch (e) { fail(e); } };
  $("#eDlH").onclick = () => download("h"); $("#eDlV").onclick = () => download("v");
}
async function save() {
  const x = S.cur;
  try { const d = await api(`/api/admin/explainers/${x.id}`, { method: "PUT", body: { title: x.title, kicker: x.kicker, style: x.style, shots: x.shots, voiceMode: x.voiceMode, sex: x.sex, keep: x.keep } });
    S.cur = d.explainer; S.dirty = false; toast("Saved."); drawEditor(); load(); } catch (e) { fail(e); }
}
// Preview: the film itself in the desk, from a point in it.
function stopPreview() { try { S.pv?.destroy(); } catch { /* gone */ } S.pv = null; }
async function preview(from) {
  stopPreview(); const host = $(".xd-screen"); if (!host) return;
  S.pv = await playExplainer(host, S.cur, { orient: S.orient, startAt: Date.now() - from * 1000, onEnd: () => { S.pv = null; } });
}
// A line recorded here: the line in large type, recording starts and stops with the button.
async function recordLine(i) {
  const x = S.cur, s = x.shots[i]; if (S.dirty) await save();
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return toast("The microphone was not allowed.", true); }
  const d = document.createElement("dialog"); d.className = "xd-dlg xd-recd";
  d.innerHTML = `<div class="stack"><small class="muted">Line ${i + 1} of ${x.shots.length}</small><p class="xd-line" data-no-tr>${esc(s.say)}</p><div class="xd-meter"><i></i></div>
    <div class="row"><button class="btn red" id="rGo">● Start recording</button><span id="rT" class="muted">0.0 s</span><span class="spacer" style="flex:1"></span><button class="btn" data-close>Close</button></div></div>`;
  document.body.append(d); d.showModal();
  const ac = new AudioContext(), an = ac.createAnalyser(); ac.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
  let rec = null, t0 = 0, chunks = [], raf = 0;
  const meter = () => { an.getByteTimeDomainData(buf); let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v - 128)); $(".xd-meter i", d).style.width = `${Math.min(100, p / 1.28)}%`; if (rec) $("#rT", d).textContent = `${((Date.now() - t0) / 1000).toFixed(1)} s`; raf = requestAnimationFrame(meter); }; meter();
  const close = () => { cancelAnimationFrame(raf); try { rec?.state === "recording" && rec.stop(); } catch { /* none */ } stream.getTracks().forEach(t => t.stop()); ac.close(); d.remove(); };
  $("[data-close]", d).onclick = close; d.addEventListener("cancel", close);
  $("#rGo", d).onclick = async e => {
    const b = e.currentTarget;
    if (!rec) { const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(t => MediaRecorder.isTypeSupported?.(t)) || ""; rec = new MediaRecorder(stream, type ? { mimeType: type } : {}); chunks = []; rec.ondataavailable = ev => chunks.push(ev.data); rec.start(); t0 = Date.now(); b.textContent = "■ Stop and keep"; return; }
    // (the last word is kept: the recorder runs on for a moment after Stop and hands over everything it holds,
    //  and the line's length is the recording's own, read from the audio, not the time between the clicks)
    b.disabled = true; b.textContent = "Finishing…"; await new Promise(r => setTimeout(r, 700));
    const clicked = (Date.now() - t0) / 1000; await new Promise(r => { rec.onstop = r; rec.requestData?.(); rec.stop(); });
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" }); b.textContent = "Saving…";
    let secs = clicked; try { secs = (await ac.decodeAudioData(await blob.arrayBuffer())).duration || clicked; } catch { /* the clicks' time */ }
    if (!(secs > 0.3) || !Number.isFinite(secs)) secs = clicked;
    try { const r = await fetch(`/api/admin/explainers/${x.id}/rec/${i}`, { method: "POST", headers: { "content-type": blob.type, "x-secs": String(Math.round(secs * 100) / 100) }, body: blob }); const out = await r.json(); if (!r.ok) throw new Error(out.error || "Saving failed.");
      s.voice = out.voice; toast(`Line ${i + 1} recorded.`); close(); await open(x.id); } catch (err) { fail(err); b.disabled = false; b.textContent = "■ Stop and keep"; }
  };
}
// Download: the film made into an MP4 in this browser.
async function download(orient) {
  const x = S.cur; if (S.dirty) await save();
  if (xplHasYouTube(x) && !confirm("This explainer has a YouTube video or byte: YouTube does not let a browser put it in a file, so a still card stands in for it in the download. Go on?")) return;
  const bar = $(".xd-prog"); bar.hidden = false; let stop = false; stopPreview();
  try {
    const out = await makeExplainerFile(S.cur, { orient, onProgress: (k, label) => { $("i", bar).style.width = `${Math.round(k * 100)}%`; $("span", bar).textContent = `${label} · ${Math.round(k * 100)}%`; }, cancelled: () => stop });
    const a = document.createElement("a"); a.href = URL.createObjectURL(out.blob); a.download = `rashtrix-explainer-${orient === "v" ? "shorts" : "tv"}-${x.id.slice(0, 8)}.${out.ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
    toast(`Downloaded (${mmss(out.seconds)}).`);
  } catch (e) { fail(e); }
  setTimeout(() => { bar.hidden = true; }, 1500);
}

(async () => {
  const user = await shell("Explainer desk"); if (!user) return;
  $("main").innerHTML = `<div class="xd"><aside class="xd-side"></aside><div class="xd-main"></div></div>`;
  await load(); drawEditor();
  const want = location.hash.slice(1); if (want) open(want);
})();

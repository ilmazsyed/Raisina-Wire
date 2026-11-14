// The AVO Story Desk (control room): write an AVO story by hand (headline, a brief to be read of
// up to 450 characters, pictures, region and desk), send any published story to the engine, and
// see every AVO story of the last seven days, automatic and hand-written: its state, script, voice,
// pictures and airings, with the ones told without a single picture marked. Preview it, listen to
// it, add it to a rundown, take it out of rotation; edit any of them (words, pictures: it is made
// again and goes back on air); delete the hand-written ones (src/avo.js).
import { shell, api, toast, fail, esc, $, $$, fmt, istDay } from "./crshell.js";
import { mountTV } from "./engine.js";
import { digits } from "./i18n.js";

const S = { list: [], quota: {}, today: {}, daily: 45, edit: null, images: [], rundowns: [], filter: (() => { try { return localStorage.getItem("avoFilter") || "all"; } catch { return "all"; } })(), send: [], sendQ: "", videos: [], bytes: [], byteMode: "avo", byteCount: 1 };
const secsOf = v => { const p = String(v || "").trim().split(":").map(Number); if (p.some(isNaN)) return 0; return p.reduce((a, x) => a * 60 + x, 0); };
const mmss = n => n ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, "0")}` : "";
// An AVO story's length on air: its reading, then its bytes (with the wipe before each).
export const avoDur = x => Math.ceil((x.secs > 0 ? Math.max(8, x.secs + 2) : 20) + 4 + (x.bytes || []).reduce((n, b) => n + 1.2 + (Number(b.secs) || 30), 0));
const REGION = { bengal: "Bengal & Kolkata", india: "India", neighbours: "Bangladesh, USA, China, Russia, South Asia", world: "World" };
const DESKS = { Kolkata: "কলকাতা", "West Bengal": "রাজ্য", India: "দেশ", "Probashi Bangali": "প্রবাসী বাঙালি", World: "বিশ্ব", Sports: "খেলা", Entertainment: "বিনোদন", Lifestyle: "লাইফস্টাইল", Breaking: "এইমাত্র" };
const DK = { kolkata: "Kolkata", bengal: "Bengal", india: "India", bangladesh: "Bangladesh", world: "World", sports: "Sports", business: "Business", other: "Other" };
const WT = { heavy: "Heavy", mid: "Medium", light: "Light" };
const ORIGIN = { auto: "Wire", manual: "Desk", breaking: "Breaking", edited: "Wire · edited", sent: "Sent" };
const MAX = 450, MAX_EDIT = 900;
// A story told without a single picture of its own (on air in motion graphics).
const noPics = x => ["ready", "off"].includes(x.status) && !x.nImages;
const maxFor = e => e && e.origin !== "manual" ? MAX_EDIT : MAX;
const t = s => new Date(s).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

// Pictures: uploaded (shrunk in the browser first) or linked.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  for (const [max, q] of [[2000, .86], [1800, .8], [1600, .74], [1400, .68]]) {
    const scale = Math.min(1, max / bmp.width), w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", q));
    if (blob && blob.size < 1_700_000) return { blob, width: w, height: h };
  }
  throw new Error("This picture is too large even after compression.");
}
async function upload(file) {
  const { blob, width, height } = await shrink(file);
  const r = await fetch("/api/admin/images", { method: "POST", headers: { "content-type": blob.type, "x-image-width": String(width), "x-image-height": String(height) }, body: blob });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Upload failed."); return d.url;
}

// A video file from this computer to the channel's clip store (Cloudflare R2), in 20 MB parts; kept
// (never deleted for lack of use, since an AVO uses it), with its length read from the file.
async function uploadClip(file, bar, title) {
  if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) throw new Error("Choose an MP4, MOV or WebM video.");
  const dur = await new Promise(res => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => { res(Math.round(v.duration || 0)); URL.revokeObjectURL(v.src); }; v.onerror = () => res(0); v.src = URL.createObjectURL(file); });
  const start = await api("/api/admin/clips", { method: "POST", body: { title: (title || file.name.replace(/\.\w+$/, "")).slice(0, 150), filename: file.name, size: file.size, mime: file.type, duration: dur } });
  const parts = [], n = Math.ceil(file.size / start.partSize); bar.hidden = false;
  try {
    for (let i = 0; i < n; i++) {
      const blob = file.slice(i * start.partSize, (i + 1) * start.partSize); let tries = 0, out;
      while (true) { try { out = await api(`/api/admin/clips/${start.id}/part/${i + 1}`, { method: "PUT", body: blob, raw: true }); break; } catch (e) { if (++tries > 3) throw e; await new Promise(r => setTimeout(r, 1500 * tries)); } }
      parts.push(out.part); $("i", bar).style.width = `${Math.round((i + 1) / n * 100)}%`;
    }
    const done = await api(`/api/admin/clips/${start.id}/complete`, { method: "POST", body: { parts } });
    await api(`/api/admin/clips/${start.id}`, { method: "PUT", body: { keep: true, duration: dur } }).catch(() => {});
    return { url: done.url, secs: dur };
  } catch (e) { await api(`/api/admin/clips/${start.id}/abort`, { method: "POST" }).catch(() => {}); throw e; }
  finally { setTimeout(() => { bar.hidden = true; $("i", bar).style.width = "0"; }, 800); }
}

// The clips already uploaded (newest first): use one in this story (as a video or a byte), play
// it, delete it, or clear every clip older than a day.
async function pickClip(use) {
  const d = document.createElement("dialog"); d.className = "ad-clips";
  d.innerHTML = `<div class="stack"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Uploaded clips</h3><button class="btn red" type="button" id="cOld">Delete clips older than 24 hours</button></div>
    <p class="muted" style="margin:0" id="cUse"></p><div class="ad-cl" id="cList"><p class="muted">Loading…</p></div><div class="row"><button class="btn" type="button" data-close>Close</button></div></div>`;
  document.body.append(d); d.showModal(); $("[data-close]", d).onclick = () => d.close(); d.addEventListener("close", () => d.remove());
  const age = t => { const h = (Date.now() - Date.parse(String(t).replace(" ", "T") + (/[zZ+]/.test(t) ? "" : "Z"))) / 3600e3; return h < 1 ? `${digits(Math.max(1, Math.round(h * 60)))} min ago` : h < 48 ? `${digits(Math.round(h))} h ago` : `${digits(Math.round(h / 24))} days ago`; };
  const draw = async () => {
    let L; try { L = await api("/api/admin/clips"); } catch (e) { $("#cList", d).innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    const ready = L.clips.filter(c => c.status === "ready");
    $("#cUse", d).textContent = `${ready.length} clips · ${(L.usedBytes / 1073741824).toFixed(2)} GB of 10 GB used`;
    $("#cList", d).innerHTML = ready.map(c => `<div class="ad-clip"><video src="${esc(c.url)}#t=1" preload="metadata" muted playsinline></video><div class="ad-cmeta"><b data-no-tr>${esc(c.title)}</b><small class="muted">${c.duration ? mmss(c.duration) + " · " : ""}${digits((c.bytes / 1048576).toFixed(1))} MB · ${age(c.created_at)}</small></div>
      <div class="row" style="gap:6px"><button class="btn sm green" type="button" data-cuse="${esc(c.id)}">Use</button><button class="btn sm" type="button" data-cplay="${esc(c.id)}">▶</button><button class="btn sm red" type="button" data-cdel="${esc(c.id)}">Delete</button></div></div>`).join("") || `<p class="muted">No clips uploaded yet.</p>`;
    $$("[data-cuse]", d).forEach(b => b.onclick = () => { use(ready.find(c => c.id === b.dataset.cuse)); d.close(); toast("Clip added. Save the story to put it on air."); });
    $$("[data-cplay]", d).forEach(b => b.onclick = () => { const v = b.closest(".ad-clip").querySelector("video"); v.controls = true; v.muted = false; v.play().catch(() => {}); });
    $$("[data-cdel]", d).forEach(b => b.onclick = async () => { if (!confirm("Delete this clip from storage? Stories that use it lose it.")) return; try { await api(`/api/admin/clips/${b.dataset.cdel}`, { method: "DELETE" }); draw(); } catch (e) { fail(e); } });
  };
  $("#cOld", d).onclick = async () => {
    if (!confirm("Delete every clip older than 24 hours from storage? Clips used by AVO stories still on air are kept.")) return;
    try { const r = await api("/api/admin/clips/cleanup", { method: "POST", body: { hours: 24 } }); toast(`${r.deleted} clips deleted (${(r.freedBytes / 1048576).toFixed(0)} MB freed)${r.spared ? `; ${r.spared} kept for stories on air` : ""}.`); draw(); } catch (e) { fail(e); }
  };
  draw();
}

function drawForm() {
  const F = $(".ad-form"), e = S.edit, MAXF = maxFor(e);
  F.innerHTML = `<h2>${e ? "Edit AVO story" : "New AVO story"}</h2>${e ? `<p class="muted" style="margin:0">Saved changes are voiced and pictured again within a minute, and the story goes back on air (in rotation for six hours or four airings from now).${e.origin !== "manual" ? " From then on it is read as written here, not from its report." : ""}</p>` : ""}
    <label>Headline (Bengali, shown in the NEWS UPDATE strip)<input id="fTitle" maxlength="200" data-no-tr value="${esc(e?.title || "")}"></label>
    <label>Brief to be read (the newsreader reads it; up to ${MAXF} characters, about ${MAXF > MAX ? 60 : 30} seconds)<textarea id="fBrief" rows="6" maxlength="${MAXF}" data-no-tr>${esc(e ? e.lines.join(" ") : "")}</textarea><small class="muted" id="fCount"></small></label>
    <div class="row"><label style="flex:1">Region<select id="fRegion">${Object.entries(REGION).map(([k, n]) => `<option value="${k}" ${(e?.region || "bengal") === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label style="flex:1">Desk<select id="fDesk">${Object.entries(DESKS).map(([k, n]) => `<option value="${k}" ${(e?.desk || "Kolkata") === k ? "selected" : ""}>${n} · ${k}</option>`).join("")}</select></label></div>
    <div><b>Pictures</b> <small class="muted">(four or more look best; each shows full screen for a few seconds)</small>
      <div class="ad-pics">${S.images.map((x, i) => `<div class="ad-pic"><img src="${esc(x.url)}" alt=""><input data-credit="${i}" placeholder="Credit (e.g. Rashtrix / photographer)" value="${esc(x.credit || "")}" data-no-tr><div class="row"><button class="btn sm" data-left="${i}" ${i ? "" : "disabled"}>◀</button><button class="btn sm" data-right="${i}" ${i < S.images.length - 1 ? "" : "disabled"}>▶</button><button class="btn sm red" data-rm="${i}">Remove</button></div></div>`).join("")}</div>
      <div class="row"><label class="btn">Upload pictures<input type="file" id="fFiles" accept="image/*" multiple hidden></label><input id="fLink" placeholder="or paste a picture link (https://…)" style="flex:1"><button class="btn" id="fAddLink">Add link</button></div>
      <label style="flex-direction:row;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="fMore" ${e ? (e.findMore ? "checked" : "") : "checked"}> Find more pictures automatically when there are fewer than four</label></div>
    <div class="ad-vids"><b>Videos</b> <small class="muted">(upload one, use one already uploaded, or paste a link; shown like the pictures, muted, and only when added)</small>
      ${S.videos.map((v, i) => `<div class="row ad-vrow"><span class="tag">${/youtu/.test(v) ? "YOUTUBE" : /^\/clips\//.test(v) ? "UPLOADED" : "VIDEO"}</span><small data-no-tr style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${/^\/clips\//.test(v) ? "Uploaded video" : esc(v)}</small><button class="btn sm red" type="button" data-vrm="${i}">Remove</button></div>`).join("")}
      ${S.videos.length < 6 ? `<div class="row" style="flex-wrap:wrap"><label class="btn">Upload video<input type="file" id="fVidFile" accept="video/mp4,video/quicktime,video/webm" hidden></label><button class="btn" type="button" id="fVidPick">Uploaded clips</button><input id="fVid" placeholder="or a YouTube or video link (https://…)" style="flex:1;min-width:220px" data-no-tr><button class="btn" type="button" id="fVidAdd">Add video</button></div>` : ""}</div>
    <div class="ad-byte"><b>Plays as</b>
      <div class="row ad-seg"><button type="button" class="btn ${S.byteMode === "avo" ? "on" : ""}" data-bm="avo">AVO only</button><button type="button" class="btn ${S.byteMode === "byte" ? "on" : ""}" data-bm="byte">AVO + byte</button></div>
      ${S.byteMode === "byte" ? `<p class="muted" style="margin:0">After the reading, the bytes play in full, one after another, with the Rashtrix wipe between them and the person's name on screen.</p>
      ${S.bytes.map((b, i) => `<div class="ad-brow"><span class="ad-bn">${digits(i + 1)}</span><div class="stack" style="flex:1;gap:6px"><div class="row" style="gap:6px;flex-wrap:nowrap"><input data-bf="url" data-bi="${i}" value="${esc(b.url || "")}" placeholder="Byte video link (YouTube or https://…mp4), or upload" style="flex:1;min-width:0" data-no-tr><label class="btn sm">Upload<input type="file" data-bup="${i}" accept="video/mp4,video/quicktime,video/webm" hidden></label><button class="btn sm" type="button" data-bpick="${i}">Uploaded</button></div>
        <div class="row" style="gap:6px"><input data-bf="name" data-bi="${i}" value="${esc(b.name || "")}" placeholder="Name (on screen)" style="flex:2" data-no-tr><input data-bf="title" data-bi="${i}" value="${esc(b.title || "")}" placeholder="Title (e.g. মুখ্যমন্ত্রী)" style="flex:2" data-no-tr><input data-bf="secs" data-bi="${i}" value="${esc(mmss(b.secs))}" placeholder="Length m:ss" style="width:110px" title="Empty: the YouTube video's own length"></div></div><button class="btn sm red" type="button" data-brm="${i}">✕</button></div>`).join("")}
      ${S.bytes.length < 3 ? `<button class="btn" type="button" id="fByteAdd">+ Add a byte</button>` : ""}
      ${S.bytes.length ? `<label style="flex-direction:row;align-items:center;gap:8px">Bytes to play<select id="fByteN">${S.bytes.map((_, i) => `<option value="${i + 1}" ${S.byteCount === i + 1 ? "selected" : ""}>${digits(i + 1)}</option>`).join("")}</select></label>` : ""}` : ""}</div>
    <div class="bd-prog" id="fProg" hidden><i></i></div>
    <div class="row"><button class="btn green" id="fSave">${e ? "Save and put on air" : "Make the AVO story"}</button>${e ? `<button class="btn" id="fCancel">Cancel</button>` : ""}<span class="muted" id="fNote"></span></div>`;
  const brief = $("#fBrief"), count = () => { const n = brief.value.trim().length; $("#fCount").textContent = `${digits(n)} / ${digits(MAXF)} characters`; $("#fCount").style.color = n > MAXF ? "#ff6b6b" : ""; };
  brief.oninput = count; count();
  $$("[data-credit]").forEach(x => x.oninput = () => { S.images[+x.dataset.credit].credit = x.value; });
  $$("[data-rm]").forEach(b => b.onclick = () => { S.images.splice(+b.dataset.rm, 1); keep(); drawForm(); });
  $$("[data-left]").forEach(b => b.onclick = () => { const i = +b.dataset.left; [S.images[i - 1], S.images[i]] = [S.images[i], S.images[i - 1]]; keep(); drawForm(); });
  $$("[data-right]").forEach(b => b.onclick = () => { const i = +b.dataset.right; [S.images[i + 1], S.images[i]] = [S.images[i], S.images[i + 1]]; keep(); drawForm(); });
  $("#fFiles").onchange = async ev => { const files = [...ev.target.files]; $("#fNote").textContent = "Uploading…"; keep();
    for (const f of files) { try { S.images.push({ url: await upload(f), credit: "" }); } catch (err) { toast(err.message); } }
    drawForm(); };
  $("#fAddLink").onclick = () => { const u = $("#fLink").value.trim(); if (!/^https:\/\//.test(u)) return toast("Paste a link that starts with https://"); keep(); S.images.push({ url: u, credit: "" }); drawForm(); };
  $("#fCancel")?.addEventListener("click", () => { S.edit = null; S.images = []; S.videos = []; S.bytes = []; S.byteMode = "avo"; S.byteCount = 1; drawForm(); });
  $$("[data-vrm]").forEach(b => b.onclick = () => { keep(); S.videos.splice(+b.dataset.vrm, 1); drawForm(); });
  $("#fVidFile")?.addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; keep(); toast("Uploading the video…");
    try { const r = await uploadClip(f, $("#fProg"), `AVO: ${$("#fTitle").value.trim() || f.name}`); S.videos.push(r.url); toast("Video uploaded."); drawForm(); } catch (err) { fail(err); } });
  $$("[data-bup]").forEach(x => x.onchange = async e => { const f = e.target.files[0]; if (!f) return; const i = +x.dataset.bup; keep(); toast("Uploading the byte…");
    try { const r = await uploadClip(f, $("#fProg"), `Byte: ${S.bytes[i].name || f.name}`); Object.assign(S.bytes[i], { url: r.url, secs: r.secs || S.bytes[i].secs }); toast("Byte uploaded."); drawForm(); } catch (err) { fail(err); } });
  $("#fVidPick")?.addEventListener("click", () => { keep(); pickClip(c => { S.videos.push(c.url); drawForm(); }); });
  $$("[data-bpick]").forEach(b => b.onclick = () => { const i = +b.dataset.bpick; keep(); pickClip(c => { Object.assign(S.bytes[i], { url: c.url, secs: c.duration || S.bytes[i].secs }); drawForm(); }); });
  $("#fVidAdd")?.addEventListener("click", () => { const u = $("#fVid").value.trim(); if (!/^https:\/\//.test(u)) return toast("Paste a link that starts with https://"); keep(); S.videos.push(u); drawForm(); });
  $$("[data-bm]").forEach(b => b.onclick = () => { keep(); S.byteMode = b.dataset.bm; if (S.byteMode === "byte" && !S.bytes.length) S.bytes.push({ url: "", name: "", title: "", secs: 0 }); drawForm(); });
  $$("[data-bf]").forEach(x => x.oninput = () => { const b = S.bytes[+x.dataset.bi]; b[x.dataset.bf] = x.dataset.bf === "secs" ? secsOf(x.value) : x.value; });
  $$("[data-brm]").forEach(b => b.onclick = () => { keep(); S.bytes.splice(+b.dataset.brm, 1); S.byteCount = Math.min(S.byteCount, Math.max(1, S.bytes.length)); drawForm(); });
  $("#fByteAdd")?.addEventListener("click", () => { keep(); S.bytes.push({ url: "", name: "", title: "", secs: 0 }); S.byteCount = S.bytes.length; drawForm(); });
  $("#fByteN")?.addEventListener("change", e => { S.byteCount = Number(e.target.value); });
  $("#fSave").onclick = save;
  // Keep what is typed while the pictures redraw.
  function keep() { S.draft = { title: $("#fTitle").value, brief: brief.value, region: $("#fRegion").value, desk: $("#fDesk").value, more: $("#fMore").checked }; }
  if (S.draft) { $("#fTitle").value = S.draft.title; brief.value = S.draft.brief; $("#fRegion").value = S.draft.region; $("#fDesk").value = S.draft.desk; $("#fMore").checked = S.draft.more; S.draft = null; count(); }
}
async function save() {
  const bytes = S.bytes.filter(b => String(b.url || "").trim());
  if (S.byteMode === "byte" && !bytes.length) return toast("Add a byte link, or choose AVO only.");
  if (bytes.some(b => !/^(https:\/\/|\/clips\/)/.test(b.url.trim()))) return toast("Each byte needs a link that starts with https://, or an uploaded video.");
  const body = { title: $("#fTitle").value.trim(), brief: $("#fBrief").value.trim(), region: $("#fRegion").value, desk: $("#fDesk").value, findMore: $("#fMore").checked, images: S.images,
    videos: S.videos, bytes, byteMode: S.byteMode, byteCount: Math.min(S.byteCount, bytes.length || 1) };
  if (!body.title) return toast("Write the headline.");
  if (body.brief.length < 20) return toast("Write the brief to be read.");
  if (body.brief.length > maxFor(S.edit)) return toast(`The brief is longer than ${maxFor(S.edit)} characters.`);
  try {
    if (S.edit) await api(`/api/admin/tv/avo/${encodeURIComponent(S.edit.id)}`, { method: "PUT", body });
    else await api("/api/admin/tv/avo", { method: "POST", body });
    toast(S.edit ? "Saved. It is made again and goes on air within a minute or two." : "Made. It is voiced and goes into rotation within a minute.");
    S.edit = null; S.images = []; S.videos = []; S.bytes = []; S.byteMode = "avo"; S.byteCount = 1; drawForm(); load();
  } catch (e) { fail(e); }
}

function drawList() {
  const L = $(".ad-list");
  const nNo = S.list.filter(noPics).length;
  const IN = { all: () => true, air: x => x.inRotation, nopic: noPics, wire: x => !["manual", "breaking"].includes(x.origin), desk: x => ["manual", "breaking"].includes(x.origin) };
  if (!IN[S.filter]) S.filter = "all";
  const shown = S.list.filter(IN[S.filter]);
  // The stories in groups: on air now, being made, done, paused, failed.
  const GROUPS = [["air", "In rotation now", x => x.inRotation], ["new", "Being made", x => x.status === "new"], ["done", "Done (out of rotation)", x => x.status === "ready" && !x.inRotation], ["off", "Paused", x => x.status === "off"], ["bad", "Failed or pulled", () => true]];
  const grouped = (() => { const left = [...shown]; return GROUPS.map(([k, name, f]) => { const g = left.filter(f); g.forEach(x => left.splice(left.indexOf(x), 1)); return [k, name, g]; }).filter(([, , g]) => g.length); })();
  L.innerHTML = `<div class="row" style="justify-content:space-between"><h2>All AVO stories <small class="muted">(last seven days · ${digits(S.list.length)})</small></h2><button class="btn sm" id="reload">Refresh</button></div>
    <div class="row ad-filters" style="flex-wrap:wrap;gap:6px">${[["all", "All"], ["air", "In rotation"], ["nopic", "No pictures"], ["wire", "Wire"], ["desk", "Desk"]].map(([k, l]) => `<button type="button" class="btn sm ${S.filter === k ? "on" : ""} ${k === "nopic" && nNo ? "red" : ""}" data-filter="${k}"><span>${l}</span> <small data-no-tr>${digits(S.list.filter(IN[k]).length)}</small></button>`).join("")}</div>
    <p class="muted">From the wire today: ${Object.entries(S.quota).map(([k, q]) => `${REGION[k]} ${digits(S.today[k] || 0)}/${digits(q)}`).join(" · ")} (of ${digits(S.daily)} a day). Desk stories don't count against these. A story stays in rotation for 6 hours or 4 airings; when fewer than four fresh stories are left, the latest done stories top up the AVO block (marked TOP-UP) until new ones are made.</p>
    <div class="ad-stories">${grouped.map(([gk, gname, g]) => `<h3 class="ad-group" data-g="${gk}">${gname} <small class="muted" data-no-tr>${digits(g.length)}</small></h3>${g.map(x => `<div class="ad-story${noPics(x) ? " nopic" : ""}">
      <div class="ad-thumbs">${(x.images.length ? x.images.slice(0, 4) : [{ src: "/partners/calibrex-mark.svg" }]).map(i => `<img src="${esc(i.src)}" alt="">`).join("")}</div>
      <div class="ad-body"><div class="row" style="gap:6px;flex-wrap:wrap"><span class="tag ${x.origin === "manual" ? "amber" : x.origin === "breaking" ? "red" : ""}">${ORIGIN[x.origin] || "Wire"}</span>${noPics(x) ? '<span class="tag red">NO PICTURES</span>' : ""}${(x.videos || []).length ? `<span class="tag">${digits(x.videos.length)} VIDEO</span>` : ""}${(x.bytes || []).length ? `<span class="tag amber">+ ${digits(x.bytes.length)} BYTE</span>` : ""}${x.status === "ready" ? (x.inRotation ? (x.topUp ? '<span class="tag amber" title="Its 6 hours or 4 airings are over, but it is airing again because there are fewer than four fresh stories to fill the AVO block.">IN ROTATION · TOP-UP</span>' : '<span class="tag green">IN ROTATION</span>') : '<span class="tag">DONE</span>') : x.status === "off" ? '<span class="tag">PAUSED</span>' : x.status === "new" ? '<span class="tag amber">PREPARING</span>' : '<span class="tag red">FAILED</span>'}<small class="muted">${esc(REGION[x.region] || x.region)} · ${esc(DESKS[x.desk] || x.desk)} · ${t(x.createdAt + "Z")}${x.createdBy ? ` · ${esc(x.createdBy)}` : ""}</small></div>
        <b data-no-tr>${esc(x.title)}</b>
        <small class="muted">Voice: ${x.voice.length ? `${x.sex === "m" ? "male" : "female"}, ${digits(Math.round(x.secs))} s` : "none yet"} · pictures ${digits(x.nImages)} · on air ${digits(x.aired)}×${x.plays.length ? ` (${x.plays.slice(0, 6).map(p => `${t(p.at)} ${p.ch === "h" ? "TV" : "Shorts"}`).join(", ")})` : ""} · app views ${digits(x.views)}</small>
        <details><summary class="muted">Script</summary><p data-no-tr>${x.lines.map(esc).join(" ")}</p></details>
        ${(x.imgLog || []).length ? `<details><summary class="muted">Picture checks · ${digits(x.imgLog.filter(l => l.ok).length)} kept, ${digits(x.imgLog.filter(l => !l.ok).length)} turned away${x.images.length < 2 ? " · told in motion graphics" : ""}</summary><ul class="ad-checks">${x.imgLog.map(l => `<li class="${l.ok ? "ok" : "no"}"><b>${l.ok ? "✓" : "✕"}</b> <span>${esc(l.why)}</span>${l.page ? ` <a href="${esc(l.page)}" target="_blank" rel="noopener noreferrer" data-no-tr>${esc((() => { try { return new URL(l.page).hostname.replace(/^www\./, ""); } catch { return ""; } })())}</a>` : ""}</li>`).join("")}</ul></details>` : x.images.length < 2 && x.origin !== "manual" ? `<small class="muted">Told in motion graphics (no verified photos).</small>` : ""}
        <div class="row" style="flex-wrap:wrap">${x.status === "ready" || x.status === "off" ? `<button class="btn sm red" data-play="${esc(x.id)}">▶ Play now</button><select data-playch="${esc(x.id)}" title="Where it plays"><option value="hv">TV + Shorts</option><option value="h">Rashtrix TV</option><option value="v">Rashtrix Shorts</option></select><button class="btn sm" data-prev="${esc(x.id)}">Preview</button>${x.voice.length ? `<button class="btn sm" data-listen="${esc(x.id)}">Listen</button>` : ""}<select data-rdsel="${esc(x.id)}"><option value="">Add to rundown…</option>${S.rundowns.map(r => `<option value="${r.id}">${esc(r.title)} · ${r.channel === "h" ? "TV" : "Shorts"}</option>`).join("")}</select><select data-dk="${esc(x.id)}" title="Desk, for the running order's variety (never two from one desk in a row)">${Object.entries(DK).map(([k, v]) => `<option value="${k}"${(x.dk || "other") === k ? " selected" : ""}>${v}</option>`).join("")}</select><select data-wt="${esc(x.id)}" title="Weight: a light story follows every two heavy ones">${Object.entries(WT).map(([k, v]) => `<option value="${k}"${(x.weight || "mid") === k ? " selected" : ""}>${v}</option>`).join("")}</select><button class="btn sm" data-off="${esc(x.id)}" data-v="${x.status === "off" ? 0 : 1}">${x.status === "off" ? "Back in rotation" : "Take out of rotation"}</button>` : ""}
          ${x.status !== "pulled" ? `${noPics(x) ? `<button class="btn sm amber" data-edit="${esc(x.id)}" data-pics="1">Add pictures</button>` : ""}<button class="btn sm" data-edit="${esc(x.id)}">Edit</button>` : '<small class="muted">Pulled with its report (put the report back to bring it back).</small>'}<button class="btn sm red" data-del="${esc(x.id)}">Delete</button></div></div></div>`).join("")}`).join("") || `<p class="muted">${S.list.length ? "None here." : "No AVO stories yet."}</p>`}</div>`;
  $$("[data-filter]").forEach(b => b.onclick = e => { e.preventDefault(); S.filter = b.dataset.filter; try { localStorage.setItem("avoFilter", S.filter); } catch { /* fine */ } drawList(); $(".ad-filters")?.scrollIntoView({ block: "nearest" }); });
  $$("[data-play]").forEach(b => b.onclick = async () => {
    const id = b.dataset.play, v = $(`[data-playch="${CSS.escape(id)}"]`)?.value || "hv", chs = v === "hv" ? ["h", "v"] : [v];
    if (!confirm(`Play this AVO now on ${chs.map(c => c === "h" ? "Rashtrix TV" : "Rashtrix Shorts").join(" and ")}? It cuts in at once (anything on air, a rundown too, stops) and the channel goes back to autopilot after it.`)) return;
    b.disabled = true;
    try { const r = await api(`/api/admin/tv/avo/${encodeURIComponent(id)}/play`, { method: "POST", body: { channels: chs } }); toast(`On air now (${digits(r.seconds)} s), then back to autopilot.`); } catch (e) { fail(e); }
    b.disabled = false;
  });
  $("#reload").onclick = load;
  const find = id => S.list.find(x => x.id === id);
  $$("[data-prev]").forEach(b => b.onclick = () => preview(find(b.dataset.prev)));
  $$("[data-listen]").forEach(b => b.onclick = () => listen(find(b.dataset.listen)));
  $$("[data-rdsel]").forEach(sel => sel.onchange = async () => { const x = find(sel.dataset.rdsel), rd = sel.value; if (!rd) return;
    const story = { id: x.id, title: x.title, desk: x.desk, region: x.region, sex: x.sex, lines: x.lines, voice: x.voice, secs: x.secs, images: x.images, videos: x.videos, bytes: x.bytes, at: x.at };
    try { await api(`/api/admin/rundowns/${rd}/items`, { method: "POST", body: { type: "avo", title: x.title.slice(0, 200), duration: avoDur(x), data: { story, avoId: x.id } } }); toast("Added to the rundown."); } catch (e) { fail(e); } sel.value = ""; });
  $$("[data-off]").forEach(b => b.onclick = async () => { try { await api(`/api/admin/tv/avo/${encodeURIComponent(b.dataset.off)}`, { method: "PUT", body: { off: b.dataset.v === "1" } }); toast(b.dataset.v === "1" ? "Taken out of rotation." : "Back in rotation."); load(); } catch (e) { fail(e); } });
  const relabel = async (id, part) => { const x = find(id); const cur = { dk: x.dk, weight: x.weight, ...(x.labelsSet || {}) }; try { await api(`/api/admin/tv/avo/${encodeURIComponent(id)}`, { method: "PUT", body: { labels: { ...cur, ...part } } }); toast("Relabelled."); } catch (e) { fail(e); } };
  $$("[data-dk]").forEach(b => b.onchange = () => relabel(b.dataset.dk, { dk: b.value }));
  $$("[data-wt]").forEach(b => b.onchange = () => relabel(b.dataset.wt, { weight: b.value }));
  $$("[data-edit]").forEach(b => b.onclick = () => { const x = find(b.dataset.edit); S.edit = x; S.images = (x.given || []).map(g => ({ url: g.url, credit: g.credit || "" })); S.videos = (x.videosSet || []).map(v => v.url); S.bytes = (x.bytesSet || []).map(b => ({ url: b.url, name: b.name || "", title: b.title || "", secs: b.secs || 0 })); S.byteMode = x.byteMode || "avo"; S.byteCount = x.byteCount || 1; drawForm(); window.scrollTo({ top: 0, behavior: "smooth" });
    if (b.dataset.pics) setTimeout(() => { $(".ad-pics")?.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" }); $("#fFiles")?.click(); }, 250); });
  $$("[data-del]").forEach(b => b.onclick = async () => { if (!confirm("Delete this AVO story for good? It goes off air at once and is not made again.")) return; try { await api(`/api/admin/tv/avo/${encodeURIComponent(b.dataset.del)}`, { method: "DELETE" }); toast("Deleted for good."); load(); } catch (e) { fail(e); } });
}
// Preview: the story on the channel's own engine (silent; use Listen for the voice).
let pv = null;
function preview(x) {
  const d = document.createElement("dialog"); d.className = "ad-preview";
  d.innerHTML = `<div class="stack"><div class="ad-screen"></div><div class="row"><button class="btn" data-close>Close</button></div></div>`;
  document.body.append(d); d.showModal();
  pv = mountTV($(".ad-screen", d), { channel: "h", mode: "scene", scene: { layout: "graphic", sources: [], full: true, dur: Math.ceil((x.secs > 0 ? Math.max(8, x.secs + 2) : 20) + 4), startAt: Date.now(), key: `pv:${x.id}:${Date.now()}`, graphic: { kind: "avo", stories: [x] } } });
  const close = () => { try { pv?.destroy(); } catch { /* gone */ } pv = null; d.remove(); };
  $("[data-close]", d).onclick = () => d.close(); d.addEventListener("close", close);
}
let au = null;
function listen(x) { au?.pause(); const q = [...x.voice]; const next = () => { const u = q.shift(); if (!u) return; au = new Audio(u); au.onended = next; au.play().catch(() => {}); }; next(); }

// Send any published story to the AVO engine: made from its report and on air within a minute or two.
function drawSend() {
  const P = $(".ad-send"); if (!P) return;
  P.innerHTML = `<h2>Send a story to AVO</h2><p class="muted" style="margin:0">Any published story: it is voiced from its report, given its news photos, and goes on air within a minute or two (outside the day's quota). One already made is made again.</p>
    <input id="sendQ" type="search" placeholder="Search stories" value="${esc(S.sendQ)}" data-no-tr>
    <div class="ad-sendlist">${S.send.map(x => `<div class="ad-sendrow"><div><b data-no-tr>${esc(x.title)}</b><small class="muted">${esc(DESKS[x.desk] || x.desk || "")} · ${t(x.at)}${x.avo ? ` · AVO: ${x.avo === "ready" || x.avo === "off" ? "made" : x.avo === "pulled" ? "pulled" : "being made"}` : ""}</small></div><button class="btn sm ${x.avo ? "" : "green"}" data-send="${esc(x.id)}" ${x.avo === "pulled" ? "disabled" : ""}>${x.avo ? "Make again" : "Send to AVO"}</button></div>`).join("") || `<p class="muted">No stories found.</p>`}</div>`;
  let tm; $("#sendQ").oninput = ev => { clearTimeout(tm); tm = setTimeout(() => { S.sendQ = ev.target.value.trim(); loadSend(true); }, 350); };
  $$("[data-send]").forEach(b => b.onclick = async () => { b.disabled = true; try { await api("/api/admin/tv/avo/send", { method: "POST", body: { id: b.dataset.send } }); toast("Sent. It is made and goes on air within a minute or two."); loadSend(); load(); } catch (e) { fail(e); b.disabled = false; } });
}
async function loadSend(focus) {
  try { S.send = (await api(`/api/admin/tv/avo/stories${S.sendQ ? `?q=${encodeURIComponent(S.sendQ)}` : ""}`)).stories || []; drawSend(); if (focus) { const i = $("#sendQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } catch (e) { fail(e); }
}

async function load() {
  try {
    const [d, r] = await Promise.all([api("/api/admin/tv/avo"), api(`/api/admin/rundowns?day=${istDay()}`).catch(() => ({ rundowns: [] }))]);
    S.list = d.stories; S.quota = d.quota; S.today = d.today; S.daily = d.daily; S.rundowns = r.rundowns || [];
    drawList();
  } catch (e) { fail(e); }
}

(async () => {
  const user = await shell("AVO Story Desk");
  if (!user) return;
  $("main").innerHTML = `<div class="ad-wrap"><div class="ad-left"><section class="panel ad-form"></section><section class="panel ad-send"><p class="muted">Loading…</p></section></div><section class="panel ad-list"><p class="muted">Loading…</p></section></div>`;
  drawForm(); load(); loadSend(); setInterval(load, 30000);
  // A story sent from elsewhere (?send=<id>) is made at once.
  const want = new URLSearchParams(location.search).get("send");
  if (want) api("/api/admin/tv/avo/send", { method: "POST", body: { id: want } }).then(() => { toast("Sent. It is made and goes on air within a minute or two."); load(); loadSend(); }).catch(fail);
})();

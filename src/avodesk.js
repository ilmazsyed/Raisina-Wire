// The AVO Story Desk (control room): write an AVO story by hand (headline, a brief to be read of
// up to 450 characters, pictures, region and desk), send any published story to the engine, and
// see every AVO story of the last seven days, automatic and hand-written: its state, script, voice,
// pictures and airings, with the ones told without a single picture marked. Preview it, listen to
// it, add it to a rundown, take it out of rotation; edit any of them (words, pictures: it is made
// again and goes back on air); delete the hand-written ones (src/avo.js).
import { shell, api, toast, fail, esc, $, $$, fmt, istDay } from "./crshell.js";
import { mountTV } from "./engine.js";
import { digits } from "./i18n.js";

const S = { list: [], quota: {}, today: {}, daily: 45, edit: null, images: [], rundowns: [], filter: "all", send: [], sendQ: "" };
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
  $("#fCancel")?.addEventListener("click", () => { S.edit = null; S.images = []; drawForm(); });
  $("#fSave").onclick = save;
  // Keep what is typed while the pictures redraw.
  function keep() { S.draft = { title: $("#fTitle").value, brief: brief.value, region: $("#fRegion").value, desk: $("#fDesk").value, more: $("#fMore").checked }; }
  if (S.draft) { $("#fTitle").value = S.draft.title; brief.value = S.draft.brief; $("#fRegion").value = S.draft.region; $("#fDesk").value = S.draft.desk; $("#fMore").checked = S.draft.more; S.draft = null; count(); }
}
async function save() {
  const body = { title: $("#fTitle").value.trim(), brief: $("#fBrief").value.trim(), region: $("#fRegion").value, desk: $("#fDesk").value, findMore: $("#fMore").checked, images: S.images };
  if (!body.title) return toast("Write the headline.");
  if (body.brief.length < 20) return toast("Write the brief to be read.");
  if (body.brief.length > maxFor(S.edit)) return toast(`The brief is longer than ${maxFor(S.edit)} characters.`);
  try {
    if (S.edit) await api(`/api/admin/tv/avo/${encodeURIComponent(S.edit.id)}`, { method: "PUT", body });
    else await api("/api/admin/tv/avo", { method: "POST", body });
    toast(S.edit ? "Saved. It is made again and goes on air within a minute or two." : "Made. It is voiced and goes into rotation within a minute.");
    S.edit = null; S.images = []; drawForm(); load();
  } catch (e) { fail(e); }
}

function drawList() {
  const L = $(".ad-list");
  const nNo = S.list.filter(noPics).length;
  const shown = S.list.filter(x => S.filter === "all" || (S.filter === "nopic" && noPics(x)) || (S.filter === "wire" && ["auto", "edited", "sent"].includes(x.origin)) || (S.filter === "desk" && ["manual", "breaking"].includes(x.origin)) || (S.filter === "air" && x.inRotation));
  L.innerHTML = `<div class="row" style="justify-content:space-between"><h2>All AVO stories <small class="muted">(last seven days · ${digits(S.list.length)})</small></h2><button class="btn sm" id="reload">Refresh</button></div>
    <div class="row ad-filters" style="flex-wrap:wrap;gap:6px">${[["all", "All"], ["air", "In rotation"], ["nopic", `No pictures${nNo ? ` (${digits(nNo)})` : ""}`], ["wire", "Wire"], ["desk", "Desk"]].map(([k, l]) => `<button class="btn sm ${S.filter === k ? "on" : ""} ${k === "nopic" && nNo ? "red" : ""}" data-filter="${k}">${l}</button>`).join("")}</div>
    <p class="muted">From the wire today: ${Object.entries(S.quota).map(([k, q]) => `${REGION[k]} ${digits(S.today[k] || 0)}/${digits(q)}`).join(" · ")} (of ${digits(S.daily)} a day). Desk stories don't count against these. A story stays in rotation for 6 hours or 4 airings.</p>
    <div class="ad-stories">${shown.map(x => `<div class="ad-story${noPics(x) ? " nopic" : ""}">
      <div class="ad-thumbs">${(x.images.length ? x.images.slice(0, 4) : [{ src: "/partners/calibrex-mark.svg" }]).map(i => `<img src="${esc(i.src)}" alt="">`).join("")}</div>
      <div class="ad-body"><div class="row" style="gap:6px;flex-wrap:wrap"><span class="tag ${x.origin === "manual" ? "amber" : x.origin === "breaking" ? "red" : ""}">${ORIGIN[x.origin] || "Wire"}</span>${noPics(x) ? '<span class="tag red">NO PICTURES</span>' : ""}${x.status === "ready" ? (x.inRotation ? '<span class="tag green">IN ROTATION</span>' : '<span class="tag">DONE</span>') : x.status === "off" ? '<span class="tag">PAUSED</span>' : x.status === "new" ? '<span class="tag amber">PREPARING</span>' : '<span class="tag red">FAILED</span>'}<small class="muted">${esc(REGION[x.region] || x.region)} · ${esc(DESKS[x.desk] || x.desk)} · ${t(x.createdAt + "Z")}${x.createdBy ? ` · ${esc(x.createdBy)}` : ""}</small></div>
        <b data-no-tr>${esc(x.title)}</b>
        <small class="muted">Voice: ${x.voice.length ? `${x.sex === "m" ? "male" : "female"}, ${digits(Math.round(x.secs))} s` : "none yet"} · pictures ${digits(x.nImages)} · on air ${digits(x.aired)}×${x.plays.length ? ` (${x.plays.slice(0, 6).map(p => `${t(p.at)} ${p.ch === "h" ? "TV" : "Shorts"}`).join(", ")})` : ""} · app views ${digits(x.views)}</small>
        <details><summary class="muted">Script</summary><p data-no-tr>${x.lines.map(esc).join(" ")}</p></details>
        ${(x.imgLog || []).length ? `<details><summary class="muted">Picture checks · ${digits(x.imgLog.filter(l => l.ok).length)} kept, ${digits(x.imgLog.filter(l => !l.ok).length)} turned away${x.images.length < 2 ? " · told in motion graphics" : ""}</summary><ul class="ad-checks">${x.imgLog.map(l => `<li class="${l.ok ? "ok" : "no"}"><b>${l.ok ? "✓" : "✕"}</b> <span>${esc(l.why)}</span>${l.page ? ` <a href="${esc(l.page)}" target="_blank" rel="noopener noreferrer" data-no-tr>${esc((() => { try { return new URL(l.page).hostname.replace(/^www\./, ""); } catch { return ""; } })())}</a>` : ""}</li>`).join("")}</ul></details>` : x.images.length < 2 && x.origin !== "manual" ? `<small class="muted">Told in motion graphics (no verified photos).</small>` : ""}
        <div class="row" style="flex-wrap:wrap">${x.status === "ready" || x.status === "off" ? `<button class="btn sm" data-prev="${esc(x.id)}">Preview</button>${x.voice.length ? `<button class="btn sm" data-listen="${esc(x.id)}">Listen</button>` : ""}<select data-rdsel="${esc(x.id)}"><option value="">Add to rundown…</option>${S.rundowns.map(r => `<option value="${r.id}">${esc(r.title)} · ${r.channel === "h" ? "TV" : "Shorts"}</option>`).join("")}</select><select data-dk="${esc(x.id)}" title="Desk, for the running order's variety (never two from one desk in a row)">${Object.entries(DK).map(([k, v]) => `<option value="${k}"${(x.dk || "other") === k ? " selected" : ""}>${v}</option>`).join("")}</select><select data-wt="${esc(x.id)}" title="Weight: a light story follows every two heavy ones">${Object.entries(WT).map(([k, v]) => `<option value="${k}"${(x.weight || "mid") === k ? " selected" : ""}>${v}</option>`).join("")}</select><button class="btn sm" data-off="${esc(x.id)}" data-v="${x.status === "off" ? 0 : 1}">${x.status === "off" ? "Back in rotation" : "Take out of rotation"}</button>` : ""}
          ${x.status !== "pulled" ? `${noPics(x) ? `<button class="btn sm amber" data-edit="${esc(x.id)}" data-pics="1">Add pictures</button>` : ""}<button class="btn sm" data-edit="${esc(x.id)}">Edit</button>` : '<small class="muted">Pulled with its report (put the report back to bring it back).</small>'}<button class="btn sm red" data-del="${esc(x.id)}">Delete</button></div></div></div>`).join("") || `<p class="muted">${S.list.length ? "None here." : "No AVO stories yet."}</p>`}</div>`;
  $$("[data-filter]").forEach(b => b.onclick = () => { S.filter = b.dataset.filter; drawList(); });
  $("#reload").onclick = load;
  const find = id => S.list.find(x => x.id === id);
  $$("[data-prev]").forEach(b => b.onclick = () => preview(find(b.dataset.prev)));
  $$("[data-listen]").forEach(b => b.onclick = () => listen(find(b.dataset.listen)));
  $$("[data-rdsel]").forEach(sel => sel.onchange = async () => { const x = find(sel.dataset.rdsel), rd = sel.value; if (!rd) return;
    const story = { id: x.id, title: x.title, desk: x.desk, region: x.region, sex: x.sex, lines: x.lines, voice: x.voice, secs: x.secs, images: x.images, at: x.at };
    try { await api(`/api/admin/rundowns/${rd}/items`, { method: "POST", body: { type: "avo", title: x.title.slice(0, 200), duration: Math.ceil((x.secs > 0 ? Math.max(8, x.secs + 2) : 20) + 4), data: { story, avoId: x.id } } }); toast("Added to the rundown."); } catch (e) { fail(e); } sel.value = ""; });
  $$("[data-off]").forEach(b => b.onclick = async () => { try { await api(`/api/admin/tv/avo/${encodeURIComponent(b.dataset.off)}`, { method: "PUT", body: { off: b.dataset.v === "1" } }); toast(b.dataset.v === "1" ? "Taken out of rotation." : "Back in rotation."); load(); } catch (e) { fail(e); } });
  const relabel = async (id, part) => { const x = find(id); const cur = { dk: x.dk, weight: x.weight, ...(x.labelsSet || {}) }; try { await api(`/api/admin/tv/avo/${encodeURIComponent(id)}`, { method: "PUT", body: { labels: { ...cur, ...part } } }); toast("Relabelled."); } catch (e) { fail(e); } };
  $$("[data-dk]").forEach(b => b.onchange = () => relabel(b.dataset.dk, { dk: b.value }));
  $$("[data-wt]").forEach(b => b.onchange = () => relabel(b.dataset.wt, { weight: b.value }));
  $$("[data-edit]").forEach(b => b.onclick = () => { const x = find(b.dataset.edit); S.edit = x; S.images = (x.given || []).map(g => ({ url: g.url, credit: g.credit || "" })); drawForm(); window.scrollTo({ top: 0, behavior: "smooth" });
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

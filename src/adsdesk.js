// The Ad library desk: every ad and brand film the channels play, uploaded or added as a YouTube
// link, with when each plays (so many times in every 30 minutes, at set times of day, between
// dates, or forced at the next break). An ad never cuts what is on air: it plays in the next
// break (src/engine.js adsDue). Ads the app made (the Rashtrix brand film) cannot be deleted, only
// rescheduled or switched off; the channel's own ads can be deleted (src/ads.js).
import { shell, api, toast, fail, esc, $, $$, istClock } from "./crshell.js";
import { digits } from "./i18n.js";

const S = { list: [], tab: "all", form: null, edit: null };
const CH = { h: "Rashtrix TV", v: "Rashtrix Shorts", hv: "TV + Shorts" };
const CAT = { ad: "Ad", brand: "Brand film", promo: "Promo" };
const blank = () => ({ title: "", category: "ad", link: "", secs: "", channels: "h", per30: 2, times: "", from: "", to: "", startDay: "", endDay: "", active: true });
const when = t => { try { return istClock(Date.parse(t), false); } catch { return ""; } };
const len = s => digits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

// A video file from this computer to the clip store (Cloudflare R2), in parts; kept for good.
async function uploadClip(file, bar, title) {
  if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) throw new Error("Choose an MP4, MOV or WebM video.");
  const dur = await new Promise(res => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => { res(Math.round(v.duration || 0)); URL.revokeObjectURL(v.src); }; v.onerror = () => res(0); v.src = URL.createObjectURL(file); });
  const start = await api("/api/admin/clips", { method: "POST", body: { title: title.slice(0, 150), filename: file.name, size: file.size, mime: file.type, duration: dur } });
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

// When an ad plays, in words.
function plan(a) {
  const out = [];
  if (a.per30) out.push(a.from && a.to ? `${digits(a.per30)}× every 30 min (${digits(a.from)}–${digits(a.to)})` : `${digits(a.per30)}× every 30 min`);
  if (a.times.length) out.push(`Every day at ${a.times.map(digits).join(", ")}`);
  if (a.startDay) out.push(`From ${digits(a.startDay)}`);
  if (a.endDay) out.push(`Until ${digits(a.endDay)}`);
  return out.length ? out.map(x => `<span>${esc(x)}</span>`).join(" · ") : "<span>Not scheduled (force it, or give it a schedule)</span>";
}

// The schedule fields (a new ad, and rescheduling one).
function fields(f, p) {
  return `<div class="row" style="flex-wrap:wrap;gap:10px">
      <label class="stack" style="gap:4px;flex:1;min-width:220px"><small>Title</small><input id="${p}Title" value="${esc(f.title)}" data-no-tr></label>
      <label class="stack" style="gap:4px"><small>Kind</small><select id="${p}Cat">${Object.entries(CAT).map(([k, l]) => `<option value="${k}" ${f.category === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="stack" style="gap:4px"><small>Plays on</small><select id="${p}Ch">${Object.entries(CH).map(([k, l]) => `<option value="${k}" ${f.channels === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <label class="stack" style="gap:4px"><small>Times in every 30 minutes</small><select id="${p}Per">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${+f.per30 === n ? "selected" : ""}>${n ? digits(n) : "None (no rotation)"}</option>`).join("")}</select></label>
      <label class="stack" style="gap:4px"><small>Rotation only from</small><input type="time" id="${p}From" value="${esc(f.from)}"></label>
      <label class="stack" style="gap:4px"><small>to</small><input type="time" id="${p}To" value="${esc(f.to)}"></label>
      <label class="stack" style="gap:4px;flex:1;min-width:200px"><small>Also at these times every day (India time, e.g. 09:00, 21:30)</small><input id="${p}Times" value="${esc(Array.isArray(f.times) ? f.times.join(", ") : f.times)}" placeholder="09:00, 21:30"></label></div>
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <label class="stack" style="gap:4px"><small>First day</small><input type="date" id="${p}Start" value="${esc(f.startDay)}"></label>
      <label class="stack" style="gap:4px"><small>Last day</small><input type="date" id="${p}End" value="${esc(f.endDay)}"></label>
      <label class="row" style="gap:6px;align-self:flex-end"><input type="checkbox" id="${p}On" ${f.active ? "checked" : ""}> <span>On air</span></label></div>`;
}
const read = p => ({ title: $(`#${p}Title`).value.trim(), category: $(`#${p}Cat`).value, channels: $(`#${p}Ch`).value, per30: +$(`#${p}Per`).value,
  from: $(`#${p}From`).value, to: $(`#${p}To`).value, times: $(`#${p}Times`).value, startDay: $(`#${p}Start`).value, endDay: $(`#${p}End`).value, active: $(`#${p}On`).checked });

function draw() {
  const L = S.list.filter(a => S.tab === "all" || (S.tab === "app" ? a.origin === "app" : a.origin !== "app"));
  const count = k => S.list.filter(a => k === "all" || (k === "app" ? a.origin === "app" : a.origin !== "app")).length;
  const F = S.form;
  $("main").innerHTML = `<section class="panel pd">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Ad library desk <small class="muted">(${digits(S.list.length)})</small></h2>
      <div class="row"><button class="btn sm" id="adR">Refresh</button>${F ? "" : `<button class="btn sm green" id="adNew">+ Add an ad</button>`}</div></div>
    <p class="muted" style="margin:0">Every ad and brand film the channels play. An ad never cuts what is on air: it plays in the next break, when the item on air has ended. Ads the app made cannot be deleted; switch them off or reschedule them.</p>
    ${F ? `<div class="pd-edit stack" style="gap:10px">
      <h3 style="margin:0">New ad</h3>
      <div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
        <label class="btn sm"><input type="file" id="nFile" accept="video/mp4,video/quicktime,video/webm" hidden><span>Upload a video</span></label>
        <span class="muted">or</span>
        <label class="stack" style="gap:4px;flex:1;min-width:240px"><small>YouTube link</small><input id="nLink" value="${esc(/^\/clips\//.test(F.link) ? "" : F.link)}" placeholder="https://youtu.be/…" data-no-tr></label>
        <label class="stack" style="gap:4px;width:130px"><small>Length (seconds)</small><input id="nSecs" type="number" min="1" max="3600" value="${esc(F.secs)}"></label></div>
      ${/^\/clips\//.test(F.link) ? `<p class="muted" style="margin:0"><span>Video uploaded.</span> <span data-no-tr>${len(+F.secs || 0)}</span></p>` : ""}
      <div class="bd-prog" id="nProg" hidden><i></i></div>
      ${fields(F, "n")}
      <div class="row"><button class="btn green" type="button" id="nSave">Save</button><button class="btn" type="button" id="nCancel">Cancel</button></div></div>` : ""}
    <div class="row ad-filters" style="flex-wrap:wrap;gap:6px">${[["all", "All"], ["app", "Made by the app"], ["channel", "Channel ads"]].map(([k, l]) => `<button type="button" class="btn sm ${S.tab === k ? "on" : ""}" data-tab="${k}"><span>${l}</span> <small data-no-tr>${digits(count(k))}</small></button>`).join("")}</div>
    <div class="pd-list">${L.map(card).join("") || `<p class="muted">No ads yet.</p>`}</div>
  </section>`;
  $("#adR").onclick = load;
  if ($("#adNew")) $("#adNew").onclick = () => { S.form = blank(); draw(); };
  $$("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; draw(); });
  if (F) {
    const keep = () => Object.assign(F, read("n"), { secs: $("#nSecs").value, link: $("#nLink").value.trim() || (/^\/clips\//.test(F.link) ? F.link : "") });
    $("#nFile").onchange = async e => {
      const f = e.target.files[0]; if (!f) return; keep();
      try { const r = await uploadClip(f, $("#nProg"), `Ad: ${F.title || f.name}`); F.link = r.url; F.secs = r.secs || F.secs; if (!F.title) F.title = f.name.replace(/\.\w+$/, ""); toast("Video uploaded."); draw(); } catch (err) { fail(err); }
    };
    $("#nCancel").onclick = () => { S.form = null; draw(); };
    $("#nSave").onclick = async () => {
      keep();
      try { await api("/api/admin/ads", { method: "POST", body: { ...F, secs: +F.secs || 0 } }); toast("Ad saved."); S.form = null; load(); } catch (err) { fail(err); }
    };
  }
  $$("[data-force]").forEach(b => b.onclick = async () => {
    const a = S.list.find(x => x.id === b.dataset.force), on = forcedNow(a);
    try { await api(`/api/admin/ads/${a.id}/force`, { method: "POST", body: { cancel: on } }); toast(on ? "Force cancelled." : "Forced: it plays in the next break."); load(); } catch (err) { fail(err); }
  });
  $$("[data-onoff]").forEach(b => b.onclick = async () => {
    const a = S.list.find(x => x.id === b.dataset.onoff);
    try { await api(`/api/admin/ads/${a.id}`, { method: "PUT", body: { active: !a.active } }); toast(a.active ? "Switched off." : "On air."); load(); } catch (err) { fail(err); }
  });
  $$("[data-edit]").forEach(b => b.onclick = () => { S.edit = S.edit === b.dataset.edit ? null : b.dataset.edit; draw(); });
  $$("[data-esave]").forEach(b => b.onclick = async () => {
    try { await api(`/api/admin/ads/${b.dataset.esave}`, { method: "PUT", body: { ...read("e"), secs: +($("#eSecs")?.value || 0) || undefined } }); toast("Rescheduled."); S.edit = null; load(); } catch (err) { fail(err); }
  });
  $$("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("Delete this ad for good?")) return;
    try { await api(`/api/admin/ads/${b.dataset.del}`, { method: "DELETE" }); toast("Deleted."); load(); } catch (err) { fail(err); }
  });
}
const forcedNow = a => !!a.forceAt && Date.now() - Date.parse(a.forceAt) < 20 * 60e3;

function card(a) {
  const ed = S.edit === a.id, app = a.origin === "app";
  const look = a.kind === "yt" ? `<img src="https://i.ytimg.com/vi/${esc(a.ytId)}/mqdefault.jpg" alt="" style="width:160px;aspect-ratio:16/9;object-fit:cover;border-radius:6px">`
    : `<video src="${esc(a.url)}#t=8" preload="metadata" muted controls playsinline style="width:160px;aspect-ratio:16/9;border-radius:6px;background:#000"></video>`;
  return `<div class="ad-story pd-card"><div class="row" style="gap:12px;align-items:flex-start;width:100%">${look}<div class="ad-body stack" style="gap:6px;flex:1;min-width:0">
    <div class="row" style="gap:6px;flex-wrap:wrap"><span class="tag ${app ? "amber" : "red"}">${app ? "MADE BY THE APP" : "CHANNEL AD"}</span><span class="tag">${CAT[a.category] || "Ad"}</span>${a.active ? '<span class="tag green">ON AIR</span>' : '<span class="tag">OFF</span>'}${forcedNow(a) ? '<span class="tag red">FORCED: NEXT BREAK</span>' : ""}
      <small class="muted"><span>${a.kind === "yt" ? "YouTube" : "Uploaded"}</span> · <span data-no-tr>${len(a.secs)}</span> · <span>${CH[a.channels] || a.channels}</span></small></div>
    <b data-no-tr>${esc(a.title)}</b>
    <small class="muted">${plan(a)}</small>
    <small class="muted">${a.plays ? `<span>Played ${digits(a.plays)} times on air</span>${a.lastPlayed ? ` · <span>Last at ${when(a.lastPlayed)}</span>` : ""}` : "<span>Not played on air yet</span>"}</small>
    ${ed ? `<div class="pd-edit stack" style="gap:10px">${fields(a, "e")}${app ? "" : `<label class="stack" style="gap:4px;width:130px"><small>Length (seconds)</small><input id="eSecs" type="number" min="1" max="3600" value="${a.secs}"></label>`}
      <div class="row"><button class="btn green" type="button" data-esave="${a.id}">Save</button><button class="btn" type="button" data-edit="${a.id}">Cancel</button></div></div>` : ""}
    <div class="row" style="flex-wrap:wrap"><button class="btn sm red" data-force="${a.id}">${forcedNow(a) ? "Cancel force" : "▶ Force: next break"}</button>
      <button class="btn sm" data-edit="${a.id}">${ed ? "Close" : "Reschedule"}</button><button class="btn sm" data-onoff="${a.id}">${a.active ? "Switch off" : "Switch on"}</button>
      ${app ? "" : `<button class="btn sm red" data-del="${a.id}">Delete</button>`}</div>
  </div></div></div>`;
}

// (the 30-second refresh leaves a form being typed in alone; a load after an action always redraws)
async function load(quiet = false) {
  try { S.list = (await api("/api/admin/ads")).ads || []; if (!quiet || !document.activeElement?.closest?.(".pd-edit")) draw(); } catch (e) { fail(e); }
}

(async () => {
  const user = await shell("Ad library desk");
  if (!user) return;
  $("main").innerHTML = `<p class="muted">Loading…</p>`;
  await load(); setInterval(() => { if (!S.form && !S.edit) load(true); }, 30000);
})();

// The Breaking desk (control room): every breaking goes out from here.
//   - Break in: the headline full screen on both channels or one (with music), cleared from here
//     too; the desk's log of every breaking. Each breaking is also read as an AVO story (src/avo.js).
//   - BIG BREAKING over the ticker.
// The lives, the live split and its pointers are on the LiveFeed desk (src/livefeed.js).
// The page refreshes every twenty seconds without touching what is being typed.
import "./tv.css";
import { lightenVideo } from "./lightclip.js";
import { shell, api, toast, fail, esc, $, $$, istClock } from "./crshell.js";
import { mountTV } from "./engine.js";
import { digits } from "./i18n.js";

const S = { d: null, mon: {}, lines: [""], media: null, bb: null, bbDirty: false };
const CH = { h: "Rashtrix TV", v: "Rashtrix Shorts" };
const when = t => { try { return istClock(Date.parse(t), false); } catch { return ""; } };

async function uploadImage(file) {
  const bmp = await createImageBitmap(file);
  for (const [max, q] of [[1920, .86], [1600, .8], [1400, .72]]) {
    const k = Math.min(1, max / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", q));
    if (blob && blob.size < 1_700_000) {
      const r = await fetch("/api/admin/images", { method: "POST", headers: { "content-type": blob.type, "x-image-width": String(w), "x-image-height": String(h) }, body: blob });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Upload failed."); return d.url;
    }
  }
  throw new Error("This picture is too large even after compression.");
}
async function uploadVideo(file, bar) {
  // (made light first: 720p, about 2.5 Mbit/s, so it plays at once on a phone's data; src/lightclip.js)
  bar.hidden = false; const lit = await lightenVideo(file, { onProgress: k => { $("i", bar).style.width = `${Math.round(k * 50)}%`; } }); if (lit) file = lit;
  const start = await api("/api/admin/clips", { method: "POST", body: { title: `Breaking: ${file.name.replace(/\.\w+$/, "")}`, filename: file.name, size: file.size, mime: file.type, duration: 0 } });
  const parts = [], n = Math.ceil(file.size / start.partSize); bar.hidden = false;
  try {
    for (let i = 0; i < n; i++) {
      const blob = file.slice(i * start.partSize, (i + 1) * start.partSize); let tries = 0, out;
      while (true) { try { out = await api(`/api/admin/clips/${start.id}/part/${i + 1}`, { method: "PUT", body: blob, raw: true }); break; } catch (e) { if (++tries > 3) throw e; await new Promise(r => setTimeout(r, 1500 * tries)); } }
      parts.push(out.part); $("i", bar).style.width = `${Math.round((i + 1) / n * 100)}%`;
    }
    return (await api(`/api/admin/clips/${start.id}/complete`, { method: "POST", body: { parts } })).url;
  } catch (e) { await api(`/api/admin/clips/${start.id}/abort`, { method: "POST" }).catch(() => {}); throw e; }
  finally { setTimeout(() => { bar.hidden = true; }, 800); }
}

function drawBreak() {
  const d = S.d, on = Object.entries(d.breaking || {}).filter(([, b]) => b);
  const keep = $("#bH") ? { h: $("#bH").checked, v: $("#bV").checked, m: $("#bMusic").checked, sec: $("#bSec").value, link: $("#bLink").value } : null;
  $(".bd-break").innerHTML = `<h2>Break in now</h2>
    ${on.length ? `<div class="bd-onair"><span class="tag red">BREAKING ON AIR</span>${on.map(([ch, b]) => `<span><b data-no-tr>${esc(b.text)}</b> <small class="muted">${CH[ch]} · ${when(b.at)}</small></span>`).join("")}</div>` : ""}
    <div class="bd-lines">${S.lines.map((t, i) => `<label class="bd-line"><span>${digits(i + 1)}</span><textarea rows="2" maxlength="160" data-bl="${i}" data-no-tr placeholder="${i ? "পরের লাইন (ঐচ্ছিক)" : "ব্রেকিং শিরোনাম লিখুন"}">${esc(t)}</textarea>${i ? `<button class="btn sm" type="button" data-blrm="${i}" aria-label="Remove">✕</button>` : ""}</label>`).join("")}</div>
    <div class="row" style="flex-wrap:wrap">${S.lines.length < 5 ? `<button class="btn sm" type="button" id="bAdd">+ Add a line</button>` : ""}<small class="muted">${digits(S.lines.length)} / ${digits(5)} lines · read back to back, each for the seconds chosen</small></div>
    <div class="bd-media"><b>Picture or video (optional)</b>
      ${S.media ? `<div class="bd-mprev">${S.media.kind === "image" ? `<img src="${esc(S.media.url)}" alt="">` : `<span class="tag">${S.media.kind === "yt" ? "YOUTUBE" : "VIDEO"}</span>`}<small data-no-tr>${esc(S.media.url)}</small><button class="btn sm red" type="button" id="bMx">Remove</button></div>` : ""}
      <div class="row" style="flex-wrap:wrap"><label class="btn sm">Upload picture<input type="file" id="bImg" accept="image/*" hidden></label><label class="btn sm">Upload video (plays muted)<input type="file" id="bVid" accept="video/mp4,video/webm,video/quicktime" hidden></label></div>
      <div class="row"><input id="bLink" placeholder="or paste a picture, video or YouTube link (https://…)" style="flex:1" data-no-tr><button class="btn sm" type="button" id="bLinkAdd">Add link</button></div>
      ${S.media && S.media.kind !== "image" ? `<div class="row" style="gap:14px;flex-wrap:wrap"><label class="chk"><input type="checkbox" id="bSnd" ${S.media.sound ? "checked" : ""}> With its own sound</label><label class="chk"><input type="checkbox" id="bFull" ${S.media.full ? "checked" : ""}> Play the whole video (the breaking lasts as long as it does)</label>${S.media.full ? `<label>Length <input id="bVSecs" value="${S.media.secs ? `${Math.floor(S.media.secs / 60)}:${String(S.media.secs % 60).padStart(2, "0")}` : ""}" placeholder="m:ss" style="width:80px"></label>` : ""}</div>` : ""}
      <div class="bd-prog" id="bProg" hidden><i></i></div></div>
    <div class="row" style="flex-wrap:wrap;gap:14px">
      <label class="chk"><input type="checkbox" id="bH" checked> Rashtrix TV</label>
      <label class="chk"><input type="checkbox" id="bV" checked> Rashtrix Shorts</label>
      <label class="chk"><input type="checkbox" id="bMusic" checked> Music</label>
      <label style="flex-direction:row;align-items:center;gap:6px">Seconds per line<select id="bSec"><option>10</option><option>15</option><option selected>20</option><option>30</option><option>45</option><option>60</option></select></label>
    </div>
    <div class="row"><button class="btn red bd-fire" id="bGo">Break in</button><button class="btn" id="bClear">Clear breaking</button></div>
    <p class="muted" style="margin:0">It goes on every screen of the channels chosen at once, and is read as an AVO story within a minute.</p>
    <details ${d.log?.length ? "open" : ""}><summary class="muted">Breaking log (${digits((d.log || []).filter(x => x.act !== "clear").length)}) · every breaking, played again with one click</summary><ul class="bd-log">${(d.log || []).map(x => `<li><small class="muted">${when(x.at)} · ${(x.channels || []).map(c => CH[c]).join(", ")} · ${esc(x.by || "")}</small>${x.act === "clear" ? `<span class="muted">Cleared</span>` : `<b data-no-tr>${esc(x.text)}</b>${x.replay ? ` <span class="tag amber">PLAYED AGAIN</span>` : ""}${x.media ? ` <span class="tag">${x.media === "yt" ? "YOUTUBE" : x.media.toUpperCase()}</span>` : ""}<span><button class="btn sm red" data-again="${esc(x.at)}">▶ Play again</button> <button class="btn sm" data-np="${esc(x.at)}">Send to newsprint</button></span>${x.avoId ? (x.avoDeleted ? `<small class="muted">AVO deleted</small>` : `<span><button class="btn sm red" data-delavo="${esc(x.avoId)}">Delete its AVO</button></span>`) : ""}`}</li>`).join("") || `<li class="muted">Nothing yet.</li>`}</ul></details>`;
  if (keep) { $("#bH").checked = keep.h; $("#bV").checked = keep.v; $("#bMusic").checked = keep.m; $("#bSec").value = keep.sec; $("#bLink").value = keep.link; }
  $$("[data-bl]").forEach(t => t.oninput = () => { S.lines[+t.dataset.bl] = t.value; });
  $$("[data-blrm]").forEach(b => b.onclick = () => { S.lines.splice(+b.dataset.blrm, 1); drawBreak(); });
  $("#bAdd")?.addEventListener("click", () => { if (S.lines.length < 5) { S.lines.push(""); drawBreak(); $(`[data-bl="${S.lines.length - 1}"]`)?.focus(); } });
  $("#bMx")?.addEventListener("click", () => { S.media = null; drawBreak(); });
  $("#bSnd")?.addEventListener("change", e => { S.media.sound = e.target.checked; });
  $("#bFull")?.addEventListener("change", async e => { S.media.full = e.target.checked; if (S.media.full && !S.media.secs && S.media.kind === "video") S.media.secs = await new Promise(res => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => res(Math.round(v.duration || 0)); v.onerror = () => res(0); v.src = S.media.url; setTimeout(() => res(0), 8000); }); drawBreak(); });
  $("#bVSecs")?.addEventListener("input", e => { const p = e.target.value.trim().split(":").map(Number); S.media.secs = p.some(isNaN) ? 0 : p.reduce((a, x) => a * 60 + x, 0); });
  $("#bLinkAdd").onclick = () => { const u = $("#bLink").value.trim(); if (!/^https:\/\//.test(u)) return toast("Paste a link that starts with https://", true); S.media = { kind: /youtube\.com|youtu\.be/.test(u) ? "yt" : /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u) ? "video" : "image", url: u }; drawBreak(); };
  $("#bImg").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { toast("Uploading the picture…"); S.media = { kind: "image", url: await uploadImage(f) }; drawBreak(); } catch (err) { fail(err); } };
  $("#bVid").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { S.media = { kind: "video", url: await uploadVideo(f, $("#bProg")) }; toast("Video uploaded."); drawBreak(); } catch (err) { fail(err); } };
  $$("[data-delavo]").forEach(b => b.onclick = async () => { if (!confirm("Delete this breaking's AVO story for good? It goes off air at once.")) return;
    try { await api(`/api/admin/tv/desk/avo/${encodeURIComponent(b.dataset.delavo)}`, { method: "DELETE" }); toast("AVO deleted for good."); load(); } catch (e) { fail(e); } });
  const chans = () => [...($("#bH").checked ? ["h"] : []), ...($("#bV").checked ? ["v"] : [])];
  // A breaking from the log on air again, as it went out (on the channels ticked above).
  $$("[data-again]").forEach(b => b.onclick = async () => {
    const x = (S.d.log || []).find(y => y.at === b.dataset.again); if (!x) return;
    const lines = x.lines?.length ? x.lines : String(x.text || "").split(" · ").filter(Boolean), chs = chans();
    if (!chs.length) return toast("Choose a channel.", true);
    if (!confirm(`Play this breaking again on ${chs.map(c => CH[c]).join(" and ")}?`)) return;
    b.disabled = true;
    try { await api("/api/admin/tv/desk/breaking", { method: "POST", body: { lines, text: lines[0], seconds: x.seconds || 20, music: x.music !== false, channels: chs, media: x.mediaObj || null, replay: true } }); toast("On air again."); load(); } catch (e) { fail(e); }
    b.disabled = false;
  });
  // A breaking for the e-paper (the Newsprint desk): with its AVO when it has one.
  $$("[data-np]").forEach(b => b.onclick = async () => {
    const x = (S.d.log || []).find(y => y.at === b.dataset.np); if (!x) return;
    const lines = x.lines?.length ? x.lines : String(x.text || "").split(" · ").filter(Boolean), m = x.mediaObj || {};
    const body = x.avoId && !x.avoDeleted ? { kind: "avo", id: x.avoId, from: "breaking" }
      : { kind: "breaking", from: "breaking", content: { title: lines[0], body: lines.slice(1).join(" "), images: m.kind === "image" && m.url ? [m.url] : [], video: m.kind !== "image" && m.url ? m.url : "" } };
    try { await api("/api/admin/epaper/send", { method: "POST", body }); toast("Sent to the newsprint."); } catch (e) { fail(e); }
  });
  $("#bGo").onclick = async () => {
    const lines = S.lines.map(x => String(x || "").trim()).filter(Boolean), chs = chans();
    if (!lines.length) return toast("Write the breaking headline.", true);
    if (!chs.length) return toast("Choose a channel.", true);
    if (!confirm("Break in on every screen now?")) return;
    try { await api("/api/admin/tv/desk/breaking", { method: "POST", body: { lines, text: lines[0], seconds: Number($("#bSec").value), music: $("#bMusic").checked, channels: chs, media: S.media } }); toast("Breaking news is going out to every screen."); S.lines = [""]; S.media = null; load(); } catch (e) { fail(e); }
  };
  $("#bClear").onclick = async () => { const chs = chans(); if (!chs.length) return toast("Choose a channel.", true); try { await api("/api/admin/tv/desk/breaking", { method: "POST", body: { clear: true, channels: chs } }); toast("Cleared."); load(); } catch (e) { fail(e); } };
}

// BIG BREAKING over the ticker: 1 to 7 lines; each comes in with the BIG BREAKING wipe; a run
// every 30 seconds, or continuous.
function drawBig() {
  const cur = S.d.bigBreak;
  if (!S.bb || !S.bbDirty) S.bb = { lines: cur?.lines?.length ? [...cur.lines] : ["", "", ""], h: cur ? !!cur.channels?.h : true, v: cur ? !!cur.channels?.v : true, continuous: !!cur?.continuous };
  const B = S.bb, on = !!cur?.on;
  $(".bd-big").innerHTML = `<div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>BIG BREAKING <small class="muted">(over the ticker)</small></h2>${on ? `<span class="tag red">ON AIR · ${cur.continuous ? "Continuous" : "Every 30 seconds"} · ${[cur.channels?.h && "Rashtrix TV", cur.channels?.v && "Rashtrix Shorts"].filter(Boolean).join(" + ")}</span>` : `<span class="tag">OFF</span>`}</div>
    <p class="muted" style="margin:0">Up to seven lines (at least one). Each line comes in with the BIG BREAKING wipe and stays seven seconds.</p>
    <div class="bd-lines">${B.lines.map((t, i) => `<label class="bd-line"><span>${digits(i + 1)}</span><textarea rows="2" maxlength="160" data-bb="${i}" data-no-tr placeholder="${i ? "পরের লাইন (ঐচ্ছিক)" : "বড় ব্রেকিং লিখুন"}">${esc(t)}</textarea>${B.lines.length > 1 ? `<button class="btn sm" type="button" data-bbrm="${i}" aria-label="Remove">✕</button>` : ""}</label>`).join("")}</div>
    <div class="row" style="flex-wrap:wrap">${B.lines.length < 7 ? `<button class="btn sm" type="button" id="bbAdd">+ Add a line</button>` : ""}<small class="muted">${digits(B.lines.filter(x => x.trim()).length)} / ${digits(7)} lines</small></div>
    <div class="row" style="flex-wrap:wrap;gap:14px">
      <label class="chk"><input type="checkbox" id="bbH" ${B.h ? "checked" : ""}> Rashtrix TV</label>
      <label class="chk"><input type="checkbox" id="bbV" ${B.v ? "checked" : ""}> Rashtrix Shorts</label>
      <label class="chk"><input type="checkbox" id="bbC" ${B.continuous ? "checked" : ""}> Keep playing continuously</label></div>
    <small class="muted">${B.continuous ? "Plays one run after another without a break." : "Plays every 30 seconds (one run of all the lines, then 30 seconds of the normal ticker)."}</small>
    <div class="row" style="flex-wrap:wrap"><button class="btn red" type="button" id="bbGo">${on ? "Update BIG BREAKING" : "Turn BIG BREAKING on"}</button>${on ? `<button class="btn" type="button" id="bbOff">Turn off</button>` : ""}</div>`;
  const keep = () => { S.bbDirty = true; };
  $$("[data-bb]").forEach(t => t.oninput = () => { B.lines[+t.dataset.bb] = t.value; keep(); });
  $$("[data-bbrm]").forEach(x => x.onclick = () => { B.lines.splice(+x.dataset.bbrm, 1); keep(); drawBig(); });
  $("#bbAdd")?.addEventListener("click", () => { B.lines.push(""); keep(); drawBig(); $(`[data-bb="${B.lines.length - 1}"]`)?.focus(); });
  $("#bbH").onchange = e => { B.h = e.target.checked; keep(); };
  $("#bbV").onchange = e => { B.v = e.target.checked; keep(); };
  $("#bbC").onchange = e => { B.continuous = e.target.checked; keep(); drawBig(); };
  const send = async onAir => {
    const lines = B.lines.map(x => x.trim()).filter(Boolean);
    if (onAir && !lines.length) return toast("Write at least one line.");
    if (onAir && !B.h && !B.v) return toast("Choose a channel.");
    try { const r = await api("/api/admin/tv/desk/bigbreak", { method: "PUT", body: { on: onAir, lines, channels: { h: B.h, v: B.v }, continuous: B.continuous } }); S.d.bigBreak = r.bigBreak; S.bbDirty = false; toast(onAir ? "BIG BREAKING is on air." : "BIG BREAKING is off."); drawBig(); } catch (e) { fail(e); }
  };
  $("#bbGo").onclick = () => send(true);
  $("#bbOff")?.addEventListener("click", () => send(false));
}

// Program monitors: what each channel has on air now (muted).
function monitors() {
  $(".bd-mons").innerHTML = Object.entries(CH).map(([ch, n]) => `<div class="bd-mon ${ch}"><small class="muted">${n} · on air</small><div class="bd-screen" id="mon-${ch}"></div></div>`).join("");
  for (const ch of Object.keys(CH)) S.mon[ch] = mountTV($(`#mon-${ch}`), { channel: ch, mode: "program", muted: true });
}

async function load() {
  try {
    S.d = await api("/api/admin/tv/desk");
    // (a panel being typed in is left as it is)
    if (!document.activeElement?.closest?.(".bd-break")) drawBreak();
    if (!document.activeElement?.closest?.(".bd-big")) drawBig();
  } catch (e) { fail(e); }
}

(async () => {
  const user = await shell("Breaking desk");
  if (!user) return;
  $("main").innerHTML = `<div class="bd-wrap"><div class="bd-col"><section class="panel bd-break"><p class="muted">Loading…</p></section></div>
    <div class="bd-col"><section class="panel bd-monp"><h2>On air</h2><div class="bd-mons"></div></section><section class="panel bd-big"></section>
    <p class="muted" style="margin:0">Lives, the live split and its pointers are on the <a href="/livefeed.html">LiveFeed desk</a>.</p></div></div>`;
  await load(); monitors(); setInterval(load, 20000);
})();

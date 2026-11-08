// The on-air desk (onair.html): in-app polls with their on-air bar, civic results boards
// (official figures only, with the exit-poll blackout lock), viewer comments curated for the
// screen, sponsors for the ad box with the proof-of-play report, and the audit log report.
import { shell, api, toast, fail, esc, $, $$, istDay, printDoc } from "./crshell.js";
import { digits } from "./i18n.js";

const TABS = { polls: "Polls", results: "Results", comments: "Comments", sponsors: "Sponsors", reports: "Reports" };
let tab = new URLSearchParams(location.search).get("tab") || "polls";
const CH = { h: "Rashtrix TV", v: "Rashtrix Shorts" };
const ctl = (ch, cmd, args) => api(`/api/ctl/${ch}/cmd`, { method: "POST", body: { cmd, args } });
const chButtons = (attr, id, label) => Object.entries(CH).map(([c, n]) => `<button class="btn sm" data-${attr}="${id}" data-ch="${c}">${label} · ${n}</button>`).join("");

async function draw() {
  $("main").innerHTML = `<div style="padding:12px" class="stack"><div class="row">${Object.entries(TABS).map(([k, n]) => `<button class="btn ${k === tab ? "on" : ""}" data-tab="${k}">${n}</button>`).join("")}</div><div id="body" class="stack"></div></div>`;
  $$("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, "", `?tab=${tab}`); draw(); });
  try { await VIEWS[tab]($("#body")); } catch (e) { fail(e); }
}

const VIEWS = {
  async polls(el) {
    const { polls } = await api("/api/admin/polls");
    el.innerHTML = `<div class="panel"><h2>New poll</h2><form id="pf" class="stack"><input name="q" placeholder="Question (Bengali), e.g. কলকাতায় মেট্রোর ভাড়া বাড়ানো কি ঠিক?" required data-no-tr>
      <div class="grid3">${[1, 2, 3, 4, 5].map(i => `<input name="o${i}" placeholder="Answer ${i}${i > 2 ? " (optional)" : ""}" ${i <= 2 ? "required" : ""} data-no-tr>`).join("")}</div><button class="btn green">Open the poll</button>
      <p class="muted" style="font-size:12px">Viewers vote in the app (one vote per device a day; no personal data is kept). On screen it always says it is not a scientific survey.</p></form></div>
      <div class="stack">${polls.map(p => { const total = (p.counts || []).reduce((a, b) => a + b, 0);
        return `<div class="panel"><div class="row" style="justify-content:space-between"><b data-no-tr>${esc(p.question)}</b><span class="tag ${p.status === "open" ? "green" : ""}">${p.status === "open" ? "Open" : "Closed"}</span></div>
        <div class="stack" style="margin:8px 0">${(p.options || []).map((o, i) => { const pct = total ? Math.round(100 * p.counts[i] / total) : 0; return `<div><span data-no-tr>${esc(o)}</span> <small class="muted">${digits(p.counts[i])} · ${digits(pct)}%</small><div class="bar"><i style="width:${pct}%"></i></div></div>`; }).join("")}</div>
        <small class="muted">${digits(total)} votes</small><div class="row" style="margin-top:6px">${chButtons("pollbar", p.id, "Bar on air")}<button class="btn sm" data-pollfull="${p.id}" data-ch="h">Full screen now · ${CH.h}</button>${Object.keys(CH).map(c => `<button class="btn sm" data-polloff="${c}">Bar off · ${CH[c]}</button>`).join("")}
        <button class="btn sm" data-pollst="${p.id}" data-st="${p.status === "open" ? "closed" : "open"}">${p.status === "open" ? "Close voting" : "Reopen"}</button><button class="btn sm" data-polldel="${p.id}">Delete</button></div></div>`; }).join("") || `<p class="muted">No polls yet.</p>`}</div>`;
    $("#pf").onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await api("/api/admin/polls", { method: "POST", body: { question: f.q, options: [f.o1, f.o2, f.o3, f.o4, f.o5] } }); toast("The poll is open in the app."); draw(); } catch (x) { fail(x); } };
    $$("[data-pollbar]").forEach(b => b.onclick = () => ctl(b.dataset.ch, "overlay", { poll: b.dataset.pollbar }).then(() => toast("Poll bar on air.")).catch(fail));
    $$("[data-polloff]").forEach(b => b.onclick = () => ctl(b.dataset.polloff, "overlay", { poll: null }).then(() => toast("Poll bar off.")).catch(fail));
    $$("[data-pollfull]").forEach(b => b.onclick = () => { if (confirm("Cut to the full-screen poll now? AUTO in the PCR goes back.")) ctl(b.dataset.ch, "take", { scene: { layout: "graphic", sources: [], graphic: { kind: "poll", id: b.dataset.pollfull }, label: "Poll" } }).catch(fail); });
    $$("[data-pollst]").forEach(b => b.onclick = () => api(`/api/admin/polls/${b.dataset.pollst}`, { method: "PUT", body: { status: b.dataset.st } }).then(draw).catch(fail));
    $$("[data-polldel]").forEach(b => b.onclick = () => confirm("Delete this poll and its votes?") && api(`/api/admin/polls/${b.dataset.polldel}`, { method: "DELETE" }).then(draw).catch(fail));
  },
  async results(el) {
    const { boards } = await api("/api/admin/boards");
    const form = (bd = { title: "", kind: "seats", total: 294, source: "ভারতের নির্বাচন কমিশন (results.eci.gov.in)", rows: [{ party: "", colour: "#AA0404" }] }) => `<form class="stack board" data-id="${bd.id || ""}">
      <div class="grid3"><label>Title<input name="title" value="${esc(bd.title)}" placeholder="বিধানসভা নির্বাচন ২০২৬" data-no-tr></label><label>Kind<select name="kind"><option value="seats" ${bd.kind === "seats" ? "selected" : ""}>Seats (won + leading)</option><option value="votes" ${bd.kind === "votes" ? "selected" : ""}>Votes</option></select></label><label>Seats in the house<input name="total" type="number" value="${bd.total || 0}"></label></div>
      <div class="grid2"><label>Official source (shown on screen; required)<input name="source" value="${esc(bd.source || "")}" required data-no-tr></label><label>Blackout until (India time) — nothing goes on air before<input name="blackout" type="datetime-local" value="${bd.blackout_until ? new Date(Date.parse(bd.blackout_until) + 5.5 * 3600e3).toISOString().slice(0, 16) : ""}"></label></div>
      <table class="items"><thead><tr><th>Party</th><th>Colour</th><th>Won</th><th>Leading</th><th>Votes</th></tr></thead><tbody>${(bd.rows || []).map(r => `<tr><td><input data-k="party" value="${esc(r.party)}" data-no-tr></td><td><input data-k="colour" type="color" value="${esc(r.colour || "#AA0404")}"></td><td><input data-k="won" type="number" value="${r.won || 0}" style="width:80px"></td><td><input data-k="leading" type="number" value="${r.leading || 0}" style="width:80px"></td><td><input data-k="votes" type="number" value="${r.votes || 0}" style="width:110px"></td></tr>`).join("")}</tbody></table>
      <div class="row"><button class="btn sm" type="button" data-addrow>+ Party</button><button class="btn green">Save figures</button>${bd.id ? `${chButtons("resbar", bd.id, "Bar on air")}<button class="btn sm" type="button" data-resfull="${bd.id}">Full screen now · ${CH.h}</button>${Object.keys(CH).map(c => `<button class="btn sm" type="button" data-resoff="${c}">Bar off · ${CH[c]}</button>`).join("")}<button class="btn sm" type="button" data-resdel="${bd.id}">Delete</button>` : ""}</div>
      ${bd.blackout ? `<p class="tag amber">Blackout: this board cannot go on air until the time above.</p>` : ""}</form>`;
    el.innerHTML = `<div class="panel"><p class="muted" style="margin:0">Only official figures (the Election Commission and other official sources) go on air, with the source on screen. Exit polls and results stay locked until the blackout time the Commission sets.</p></div>
      ${boards.map(b => `<div class="panel">${form(b)}</div>`).join("")}<div class="panel"><h2>New results board</h2>${form()}</div>`;
    $$("[data-addrow]").forEach(b => b.onclick = () => b.closest("form").querySelector("tbody").insertAdjacentHTML("beforeend", `<tr><td><input data-k="party" data-no-tr></td><td><input data-k="colour" type="color" value="#1565c0"></td><td><input data-k="won" type="number" value="0" style="width:80px"></td><td><input data-k="leading" type="number" value="0" style="width:80px"></td><td><input data-k="votes" type="number" value="0" style="width:110px"></td></tr>`));
    $$("form.board").forEach(f => f.onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(f));
      const rows = $$("tbody tr", f).map(tr => Object.fromEntries($$("input", tr).map(i => [i.dataset.k, i.type === "number" ? Number(i.value) : i.value]))).filter(r => r.party);
      const blackoutUntil = v.blackout ? new Date(`${v.blackout}:00+05:30`).toISOString() : null;
      try { await api(`/api/admin/boards${f.dataset.id ? `/${f.dataset.id}` : ""}`, { method: f.dataset.id ? "PUT" : "POST", body: { title: v.title, kind: v.kind, total: Number(v.total), source: v.source, blackoutUntil, rows } }); toast("Saved. Screens update within seconds."); draw(); } catch (x) { fail(x); } });
    $$("[data-resbar]").forEach(b => b.onclick = () => ctl(b.dataset.ch, "overlay", { results: b.dataset.resbar }).then(() => toast("Results bar on air.")).catch(fail));
    $$("[data-resoff]").forEach(b => b.onclick = () => ctl(b.dataset.resoff, "overlay", { results: null }).catch(fail));
    $$("[data-resfull]").forEach(b => b.onclick = () => { if (confirm("Cut to the full-screen results now?")) ctl("h", "take", { scene: { layout: "graphic", sources: [], graphic: { kind: "results", id: b.dataset.resfull }, label: "Results" } }).catch(fail); });
    $$("[data-resdel]").forEach(b => b.onclick = () => confirm("Delete this board?") && api(`/api/admin/boards/${b.dataset.resdel}`, { method: "DELETE" }).then(draw).catch(fail));
  },
  async comments(el) {
    const st = new URLSearchParams(location.search).get("st") || "new";
    const d = await api(`/api/admin/comments?status=${st}`);
    el.innerHTML = `<div class="panel row"><div class="row">${["new", "approved", "rejected"].map(s => `<a class="btn sm ${s === st ? "on" : ""}" href="?tab=comments&st=${s}">${{ new: "New", approved: "Approved", rejected: "Rejected" }[s]}</a>`).join("")}</div>
      <span style="flex:1"></span><input id="ytv" placeholder="YouTube live video link" ${d.youtube ? "" : "disabled title=\"Needs YOUTUBE_API_KEY\""}><input id="fbv" placeholder="Facebook live video id" ${d.facebook ? "" : "disabled title=\"Needs FB_PAGE_TOKEN\""}><button class="btn" id="fetch">Fetch comments</button></div>
      <p class="muted" style="font-size:12px;margin:0">App comments arrive by themselves (signed-in readers, from the Watch page). YouTube live chat costs 5 units of the daily quota per fetch. Read every comment before it goes on screen.</p>
      <div class="clips-list" style="max-height:none">${d.comments.map(c => `<div class="clip"><label style="display:flex;gap:8px;align-items:start;color:var(--ink)">${st === "approved" ? `<input type="checkbox" data-pick="${c.id}">` : ""}<span><b data-no-tr>${esc(c.author)}</b> <span class="tag">${c.platform}</span><br><span data-no-tr>${esc(c.text)}</span></span></label><div class="row">${st !== "approved" ? `<button class="btn sm green" data-cst="${c.id}" data-s="approved">Approve</button>` : ""}${st !== "rejected" ? `<button class="btn sm" data-cst="${c.id}" data-s="rejected">Reject</button>` : ""}</div></div>`).join("") || `<p class="muted">Nothing here.</p>`}</div>
      ${st === "approved" ? `<div class="row">${Object.entries(CH).map(([c, n]) => `<button class="btn red" data-cshow="${c}">Show ticked on ${n} (up to 3)</button><button class="btn" data-cclear="${c}">Clear · ${n}</button>`).join("")}</div>` : ""}`;
    $("#fetch").onclick = async () => { try { const r = await api("/api/admin/comments/fetch", { method: "POST", body: { youtube: $("#ytv").value.trim(), facebook: $("#fbv").value.trim() } }); toast([r.youtube != null ? `YouTube: ${r.youtube} new` : r.youtubeError, r.facebook != null ? `Facebook: ${r.facebook} new` : r.facebookError].filter(Boolean).join(" · ") || "Nothing to fetch."); draw(); } catch (x) { fail(x); } };
    $$("[data-cst]").forEach(b => b.onclick = () => api(`/api/admin/comments/${b.dataset.cst}`, { method: "PUT", body: { status: b.dataset.s } }).then(() => b.closest(".clip").remove()).catch(fail));
    $$("[data-cshow]").forEach(b => b.onclick = () => { const ids = $$("[data-pick]:checked").map(x => x.dataset.pick); if (!ids.length) return toast("Tick the comments to show.", true); api("/api/admin/comments/onair", { method: "POST", body: { channel: b.dataset.cshow, ids } }).then(() => toast("On screen.")).catch(fail); });
    $$("[data-cclear]").forEach(b => b.onclick = () => api("/api/admin/comments/onair", { method: "POST", body: { channel: b.dataset.cclear, ids: [] } }).then(() => toast("Cleared.")).catch(fail));
  },
  async sponsors(el) {
    const { sponsors } = await api("/api/admin/sponsors");
    const f = (s = { weight: 1, seconds: 20, active: 1 }) => `<form class="stack sp" data-id="${s.id || ""}"><div class="grid3"><label>Sponsor<input name="name" value="${esc(s.name || "")}" required></label><label>Weight (more = shown more often)<input name="weight" type="number" min="1" max="100" value="${s.weight}"></label><label>Seconds each time<input name="seconds" type="number" min="5" max="300" value="${s.seconds}"></label></div>
      <label>Ad picture (Google Drive link or https address; copied into the app) — or the three lines below<input name="image" value="${esc(s.image || "")}"></label>
      <div class="grid3"><input name="line1" value="${esc(s.line1 || "")}" placeholder="Line 1" data-no-tr><input name="line2" value="${esc(s.line2 || "")}" placeholder="Line 2" data-no-tr><input name="line3" value="${esc(s.line3 || "")}" placeholder="Line 3" data-no-tr></div>
      <div class="grid3"><label>From<input name="starts" type="date" value="${esc((s.starts || "").slice(0, 10))}"></label><label>Until<input name="ends" type="date" value="${esc((s.ends || "").slice(0, 10))}"></label><label style="display:flex;gap:6px;align-items:center;color:var(--ink)"><input name="active" type="checkbox" ${s.active ? "checked" : ""}> Active</label></div>
      <div class="row"><button class="btn green">Save</button></div></form>`;
    el.innerHTML = `<div class="panel"><p class="muted" style="margin:0">The ad box rotates the active sponsors by weight. Every showing is logged (proof of play).</p></div>${sponsors.map(s => `<div class="panel">${f(s)}</div>`).join("")}<div class="panel"><h2>New sponsor</h2>${f()}</div>
      <div class="panel"><h2>Proof of play</h2><div class="row"><label>From<input type="date" id="pf" value="${istDay(Date.now() - 30 * 864e5)}"></label><label>To<input type="date" id="pt" value="${istDay()}"></label><label>Sponsor<select id="ps"><option value="">All</option>${sponsors.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label><button class="btn" id="pShow">Show</button><button class="btn" id="pPdf">Print (PDF)</button><a class="btn" id="pCsv" href="#">CSV</a></div><div id="pout"></div></div>`;
    $$("form.sp").forEach(x => x.onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(x));
      try { let image = v.image.trim(); if (image && !/^\/(media|brand)\//.test(image)) image = (await api("/api/admin/copy-image", { method: "POST", body: { url: image } })).url;
        await api(`/api/admin/sponsors${x.dataset.id ? `/${x.dataset.id}` : ""}`, { method: x.dataset.id ? "PUT" : "POST", body: { ...v, image, active: !!x.elements.active.checked, weight: Number(v.weight), seconds: Number(v.seconds), starts: v.starts || null, ends: v.ends ? `${v.ends}T23:59:59` : null } }); toast("Saved."); draw(); } catch (y) { fail(y); } });
    const q = () => `from=${$("#pf").value}&to=${$("#pt").value}&sponsor=${$("#ps").value}`;
    let rows = [];
    const show = async () => { rows = (await api(`/api/admin/proof?${q()}`)).rows; const by = {}; rows.forEach(r => { const k = r.sponsor || "?"; by[k] = by[k] || { n: 0, s: 0 }; by[k].n++; by[k].s += r.actual || r.planned; });
      $("#pout").innerHTML = `<table class="items"><thead><tr><th>Sponsor</th><th>Showings</th><th>Seconds on screen</th></tr></thead><tbody>${Object.entries(by).map(([k, x]) => `<tr><td>${esc(k)}</td><td>${digits(x.n)}</td><td>${digits(x.s)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Nothing in these dates.</td></tr>`}</tbody></table>`; };
    $("#pShow").onclick = () => show().catch(fail);
    $("#pCsv").onclick = e => { e.preventDefault(); location.href = `/api/admin/proof?${q()}&format=csv`; };
    $("#pPdf").onclick = async () => { await show(); printDoc(`Proof of play · ${$("#pf").value} to ${$("#pt").value}`, `<table><thead><tr><th>Date</th><th>Time (IST)</th><th>Channel</th><th>Sponsor</th><th>What</th><th>Seconds</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.day}</td><td>${new Date(Date.parse(r.at) + 5.5 * 3600e3).toISOString().slice(11, 19)}</td><td>${CH[r.channel]}</td><td>${esc(r.sponsor)}</td><td>${r.type === "adbox" ? "Ad box" : esc(r.title)}</td><td>${r.actual || r.planned}</td></tr>`).join("")}</tbody></table>`); };
  },
  async reports(el) {
    el.innerHTML = `<div class="panel"><h2>Audit log</h2><p class="muted" style="font-size:12px">Who did what and when: everything put on air, breaking news, DUMP, standby, macros, guests, polls, results and settings.</p>
      <div class="row"><label>From<input type="date" id="af" value="${istDay(Date.now() - 864e5)}"></label><label>To<input type="date" id="at" value="${istDay()}"></label><label>Only<select id="aa"><option value="">Everything</option><option value="ctl.">On-air control</option><option value="studio.">Live studio</option><option value="poll.">Polls</option><option value="results.">Results</option><option value="rundown.">Rundowns</option><option value="tv.">TV settings</option></select></label><button class="btn" id="aShow">Show</button><button class="btn" id="aPdf">Print (PDF)</button></div><div id="aout" class="clips-list" style="max-height:60vh"></div></div>
      <div class="panel"><h2>As-run log</h2><p class="muted">What actually went on air, item by item, is in the bulletin producer (As-run log), printable as PDF.</p><a class="btn" href="/producer.html">Open the producer</a></div>`;
    let rows = [];
    const ist = t => new Date(Date.parse(t.replace(" ", "T") + (t.includes("Z") ? "" : "Z")) + 5.5 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
    const show = async () => { rows = (await api(`/api/admin/audit?from=${$("#af").value}&to=${$("#at").value}&action=${$("#aa").value}`)).rows;
      $("#aout").innerHTML = rows.map(r => `<div class="clip" data-no-tr><div><b>${esc(r.action)}</b> <small class="muted">${esc(r.type || "")} ${esc((r.target || "").slice(0, 12))}</small><br><small data-no-tr>${esc((r.details || "").slice(0, 200))}</small></div><small>${digits(ist(r.at))}<br>${esc(r.who || "")}</small></div>`).join("") || `<p class="muted">Nothing logged.</p>`; };
    $("#aShow").onclick = () => show().catch(fail);
    $("#aPdf").onclick = async () => { await show(); printDoc(`Audit log · ${$("#af").value} to ${$("#at").value}`, `<table><thead><tr><th>Time (IST)</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>${rows.map(r => `<tr><td>${ist(r.at)}</td><td>${esc(r.who || "")}</td><td>${esc(r.action)}</td><td>${esc((r.details || "").slice(0, 300))}</td></tr>`).join("")}</tbody></table>`); };
    show().catch(fail);
  }
};

(async () => { if (await shell("On-air desk")) draw(); })();

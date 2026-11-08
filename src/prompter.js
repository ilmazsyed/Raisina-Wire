// The teleprompter (prompter.html?ch=h|v), driven by the rundown on air: every item's script in
// order, the item on air marked, and the text moves on when the rundown does. The anchor's
// operator sets the speed (or it follows the item's length), the size, and mirroring for a
// beam-splitter glass. Keys: Space pause/run, ↑/↓ speed, ←/→ previous/next story, M mirror,
// +/− size, H hide the controls.
import "./control.css";
import { initUiLang } from "./uilang.js";
import { esc } from "./crshell.js";

const q = new URLSearchParams(location.search), ch = q.get("ch") === "v" ? "v" : "h";
const P = { ctl: null, scripts: {}, rundownId: null, y: 0, speed: Number(localStorage.getItem("rx-pspeed")) || 60, run: true, size: Number(localStorage.getItem("rx-psize")) || 64, mirror: localStorage.getItem("rx-pmirror") === "1", last: 0 };

async function loadScripts(id) {
  if (!id || P.rundownId === id) return;
  P.rundownId = id;
  try { const r = await fetch(`/api/admin/rundowns/${id}`, { cache: "no-store" }); const d = await r.json(); P.scripts = Object.fromEntries((d.rundown?.items || []).map(i => [i.id, { script: i.script, title: i.title, lower: i.data?.lowerThird }])); } catch { P.scripts = {}; }
  draw();
}
function draw() {
  const r = P.ctl?.rundown, box = document.querySelector(".scroll");
  if (!r) { box.innerHTML = `<div class="story"><h2>RASHTRIX</h2><p>No rundown on air. The prompter follows the rundown when the producer puts it on air.</p></div>`; return; }
  box.innerHTML = r.items.map((it, i) => { const s = P.scripts[it.id] || {}; return `<div class="story ${i === r.index ? "now" : i < r.index ? "done" : ""}" data-i="${i}"><h2>${String(i + 1).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d])}. ${esc(s.title || it.title || "")}${s.lower ? ` — ${esc(s.lower)}` : ""}</h2>${esc(s.script || "").split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("") || "<p>·</p>"}</div>`; }).join("");
  jumpToCurrent();
}
function jumpToCurrent() {
  const el = document.querySelector(`.story[data-i="${P.ctl?.rundown?.index}"]`); if (!el) return;
  P.y = el.offsetTop - window.innerHeight * 0.4 + 10;
}
function frame(t) {
  const dt = P.last ? (t - P.last) / 1000 : 0; P.last = t;
  if (P.run) P.y += P.speed * dt * (P.size / 64);
  P.y = Math.max(0, P.y);
  document.querySelector(".scroll").style.transform = `${P.mirror ? "scaleX(-1) " : ""}translateY(${-P.y}px)`;
  requestAnimationFrame(frame);
}
function apply(st) {
  const prevId = P.ctl?.rundown?.id, prevIdx = P.ctl?.rundown?.index;
  P.ctl = st;
  if (st?.rundown?.id && st.rundown.id !== prevId) loadScripts(st.rundown.id);
  else if (st?.rundown?.index !== prevIdx) { draw(); }
  else if (!st?.rundown && prevId) { P.rundownId = null; draw(); }
}
function connect() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws/ctl/${ch}`);
  ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === "state") apply(m.state); } catch { /* bad message */ } };
  ws.onclose = () => setTimeout(connect, 3000);
}
const save = () => { localStorage.setItem("rx-pspeed", P.speed); localStorage.setItem("rx-psize", P.size); localStorage.setItem("rx-pmirror", P.mirror ? "1" : "0"); };
function controls() {
  const c = document.querySelector(".pctl");
  c.innerHTML = `<button class="btn" data-a="run">${P.run ? "Pause" : "Run"} (Space)</button><button class="btn" data-a="slower">Slower ↓</button><span class="muted">Speed ${P.speed}</span><button class="btn" data-a="faster">Faster ↑</button>
    <button class="btn" data-a="prev">◀ Story</button><button class="btn" data-a="next">Story ▶</button><button class="btn" data-a="smaller">A−</button><button class="btn" data-a="bigger">A+</button>
    <button class="btn ${P.mirror ? "on" : ""}" data-a="mirror">Mirror (M)</button><button class="btn" data-a="hide">Hide (H)</button><a class="btn" href="?ch=${ch === "h" ? "v" : "h"}">${ch === "h" ? "Rashtrix Shorts" : "Rashtrix TV"}</a>`;
  c.querySelectorAll("[data-a]").forEach(b => b.onclick = () => act(b.dataset.a));
  document.querySelector(".scroll").style.fontSize = `${P.size}px`;
  document.querySelector(".prompter").classList.toggle("mirror", P.mirror);
}
function act(a) {
  if (a === "run") P.run = !P.run;
  if (a === "faster") P.speed = Math.min(400, P.speed + 10);
  if (a === "slower") P.speed = Math.max(0, P.speed - 10);
  if (a === "bigger") P.size = Math.min(140, P.size + 6);
  if (a === "smaller") P.size = Math.max(28, P.size - 6);
  if (a === "mirror") P.mirror = !P.mirror;
  if (a === "hide") document.querySelector(".prompter").classList.toggle("hidectl");
  if (a === "next" || a === "prev") { const stories = [...document.querySelectorAll(".story")], cur = stories.findIndex(s => s.offsetTop - window.innerHeight * 0.4 > P.y - 5); const i = Math.max(0, Math.min(stories.length - 1, (cur < 0 ? stories.length : cur) + (a === "next" ? 0 : -2))); if (stories[i]) P.y = stories[i].offsetTop - window.innerHeight * 0.4 + 10; }
  save(); controls();
}
document.addEventListener("keydown", e => {
  const k = { " ": "run", ArrowUp: "faster", ArrowDown: "slower", ArrowRight: "next", ArrowLeft: "prev", m: "mirror", M: "mirror", "+": "bigger", "=": "bigger", "-": "smaller", h: "hide", H: "hide" }[e.key];
  if (k) { e.preventDefault(); act(k); }
});
window.addEventListener("wheel", e => { P.y += e.deltaY; }, { passive: true });

(async () => {
  await initUiLang();
  document.body.innerHTML = `<div class="prompter" data-no-tr-scroll><div class="cue"></div><div class="scroll" data-no-tr></div><div class="pctl"></div></div>`;
  controls();
  const me = await fetch("/api/auth/me").then(r => r.json()).catch(() => ({}));
  if (!me.user || !["admin", "editor"].includes(me.user.role)) { document.querySelector(".scroll").innerHTML = `<div class="story"><p>Sign in with a newsroom account to use the prompter.</p></div>`; return; }
  const st = await fetch(`/api/ctl/${ch}/state`, { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
  apply(st.state); draw(); connect();
  requestAnimationFrame(frame);
})();

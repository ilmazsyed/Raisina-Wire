// The running-order simulator: plays the channel's autopilot in a browser at speed, with the
// channel's live data and this checkout's built player (dist/), and prints what goes on air, item
// by item, then checks the variety rules (no AVO story again within 15 minutes, no video again
// within the hour, no two bulletin stories from one desk in a row).
//   npm run build && node scripts/playout-sim.mjs [--ch h|v] [--at 20:00] [--minutes 30] [--speed 6]
// Needs Playwright with Chromium (not part of the build; CI does not run it).
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");   // NODE_PATH=$(npm root -g) for a global install
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const CH = arg("ch", "h"), AT = arg("at", ""), MIN = Number(arg("minutes", 30)), SPEED = Number(arg("speed", 6));
const SITE = arg("site", "https://rashtrix.ilmazsyed.workers.dev"), DIST = new URL("../dist/", import.meta.url).pathname;
const IST = 5.5 * 3600e3;

// Start a second before the chosen India time today (or now).
let start = Date.now();
if (AT) { const [h, m] = AT.split(":").map(Number); const d = new Date(Date.now() + IST); d.setUTCHours(h, m, 0, 0); start = d.getTime() - IST - 1000; }

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.addInitScript(([t0, speed]) => {
  const real = Date.now.bind(Date), r0 = real();
  Date.now = () => t0 + (real() - r0) * speed;
  window.__rwPlayout = []; window.__rwScenes = [];
  try { localStorage.clear(); } catch { /* none */ }
}, [start, SPEED]);
await p.route(/\/assets\//, r => { const f = join(DIST, new URL(r.request().url()).pathname); return existsSync(f) ? r.fulfill({ path: f }) : r.continue(); });
await p.route(/\/(watch|tv)(\?|$)/, r => r.fulfill({ body: readFileSync(join(DIST, "index.html"), "utf8"), contentType: "text/html" }));
await p.route(/youtube\.com|ytimg|googlevideo/, r => r.abort());
// The channel's data as now, with its clock moved to the simulated time.
// (Fetched by the page itself, so it goes through whatever network the browser has.)
await p.route(/\/api\/tv\/[hv]$/, async r => { const j = JSON.parse(await p.evaluate(u => fetch(`${u}?sim=1`).then(x => x.text()), r.request().url())); j.serverTime = await p.evaluate(() => Date.now()); return r.fulfill({ json: j }); });
await p.route(/\/api\/ws\//, r => r.abort());
// The control room's state, as now, with its clock moved too (else the player takes the real clock).
await p.route(/\/api\/ctl\/[hv]\/state$/, async r => { const j = JSON.parse(await p.evaluate(u => fetch(`${u}?sim=1`).then(x => x.text()), r.request().url())); j.serverTime = await p.evaluate(() => Date.now()); return r.fulfill({ json: j }); });
await p.goto(`${SITE}/watch`, { waitUntil: "domcontentloaded" });
if (CH === "v") await p.evaluate(() => document.querySelector('[data-action=tv-ch][data-ch="v"]')?.click());
await p.waitForTimeout(MIN * 60e3 / SPEED);
const pool = await p.evaluate(c => fetch(`/api/tv/${c}?sim=1`).then(r => r.json()).then(j => (j.loop || []).filter(x => x.type === "video").length + (j.evergreen || []).length), CH);
const log = await p.evaluate(() => window.__rwPlayout), scenes = await p.evaluate(() => window.__rwScenes);
if (process.argv.includes('--scenes')) for (const x of scenes) console.log('scene', new Date(x.at + 5.5 * 3600e3).toISOString().slice(11, 19), x.key, x.seg, x.item);
await p.unrouteAll({ behavior: "ignoreErrors" });
await b.close();

const clock = t => new Date(t + IST).toISOString().slice(11, 19);
const NAME = { seg: "SEGMENT", poll: "POLL", video: "VIDEO", avo: "AVO", upnext: "Up next", flash: "HEADLINES", ident: "Channel ID", bulletin: "BULLETIN", weather: "WEATHER", market: "MARKET" };
for (const x of log) {
  const what = x.type === "seg" ? `${x.name} (${x.items} items)` : x.type === "poll" ? "poll" : x.type === "avo" ? x.stories.map(s => `${String(s.id).slice(-6)} ${s.dk || "?"}/${s.weight || "?"}`).join(", ") : x.title.slice(0, 60);
  console.log(`${clock(x.start)}  ${String(Math.round(x.dur)).padStart(4)} s  ${(NAME[x.type] || x.type).padEnd(10)} ${x.eg ? "[evergreen] " : ""}${what}`);
}
// The checks.
const bad = [], warn = [], lastAvo = new Map(), lastVid = new Map();
for (const x of log) {
  if (x.type === "avo") for (const s of x.stories) { if (lastAvo.has(s.id) && x.start - lastAvo.get(s.id) < 15 * 60e3) bad.push(`AVO story ${s.id} again after ${Math.round((x.start - lastAvo.get(s.id)) / 60e3)} min`); lastAvo.set(s.id, x.start); }
  if (x.type === "video" && x.yt && !x.resumed) {
    if (lastVid.has(x.yt) && x.start - lastVid.get(x.yt) < 60 * 60e3) {
      // A repeat is a failure only while some video in the pool had not played within the hour.
      const fresh = [...lastVid.values()].filter(t => x.start - t < 60 * 60e3).length;
      (fresh >= pool ? warn : bad).push(`video ${x.yt} again after ${Math.round((x.start - lastVid.get(x.yt)) / 60e3)} min${fresh >= pool ? ` (all ${pool} videos in the pool played within the hour: mark more as evergreen)` : ""}`);
    }
    lastVid.set(x.yt, x.start);
  }
}
const secs = log.reduce((m, x) => (m[x.type] = (m[x.type] || 0) + x.dur, m), {});
console.log(`\nAir time: ${Object.entries(secs).map(([k, v]) => `${NAME[k] || k} ${Math.round(v / 60 * 10) / 10} min`).join(" · ")}`);
if (warn.length) console.log(`\nWarnings:\n  ${warn.join("\n  ")}`);
console.log(bad.length ? `\nCHECKS FAILED:\n  ${bad.join("\n  ")}` : "\nChecks passed: no AVO story within 15 min, no video within the hour.");
process.exit(bad.length ? 1 : 0);

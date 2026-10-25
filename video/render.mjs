// Raisina Wire video engine: renders an explainer to MP4.
//
//   npm run video -- video/scripts/<slug>.json [--formats 16x9,9x16] [--fps 30] [--skip-audio]
//
// 1. audio.py voices the script and writes the score and timing (video/out/<slug>/).
// 2. The engine runs in headless Chromium; each frame is drawn at its exact time and piped to ffmpeg.
// 3. ffmpeg encodes H.264 with the soundtrack into public/videos/<slug>-<format>.mp4, plus a poster.
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");   // the machine's Playwright (not a site dependency)

const ROOT = dirname(fileURLToPath(import.meta.url));            // video/
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const specPath = args.find(a => a.endsWith(".json"));
if (!specPath) { console.error("Usage: npm run video -- video/scripts/<slug>.json [--formats 16x9,9x16] [--fps 30]"); process.exit(1); }
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const slug = spec.slug || specPath.replace(/^.*\/|\.json$/g, "");
const formats = opt("formats", (spec.formats || ["16x9", "9x16"]).join(",")).split(",");
const fps = Number(opt("fps", 30));
const out = join(ROOT, "out", slug), pub = resolve(ROOT, "..", "public", "videos");
mkdirSync(out, { recursive: true }); mkdirSync(pub, { recursive: true });

// Photos named in the script are copied next to the render so the engine can load them.
for (const sc of spec.scenes) if (sc.type === "photo" && sc.src && !/^https?:/.test(sc.src)) {
  const src = resolve(dirname(specPath), sc.src), name = `photo-${spec.scenes.indexOf(sc)}${extname(src)}`;
  writeFileSync(join(out, name), readFileSync(src)); sc.src = `../out/${slug}/${name}`;
}
writeFileSync(join(out, "spec.json"), JSON.stringify(spec, null, 1));

if (!args.includes("--skip-audio") || !existsSync(join(out, "timing.json"))) {
  console.log("Voicing and scoring…");
  const r = spawnSync("python3", [join(ROOT, "audio.py"), join(out, "spec.json"), out], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
const timing = JSON.parse(readFileSync(join(out, "timing.json"), "utf8"));

// A tiny static server for video/ (the engine fetches its land data and photos).
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".m4a": "audio/mp4" };
const server = createServer((req, res) => {
  const p = resolve(ROOT, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
for (const f of formats) {
  const [w, h] = f === "9x16" ? [1080, 1920] : f === "1x1" ? [1080, 1080] : [1920, 1080];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", e => console.error("engine:", e.message));
  await page.goto(`${base}/engine/engine.html`);
  await page.evaluate(([s, t, w, h]) => RW.load(s, t, w, h, document.getElementById("c")), [spec, timing, w, h]);
  // --stills 5,12.5,40: just save those moments as PNGs in video/out/<slug>/ (for checking a layout)
  if (opt("stills")) {
    for (const t of opt("stills").split(",").map(Number)) {
      await page.evaluate(t => RW.draw(t), t);
      await page.locator("#c").screenshot({ path: join(out, `still-${f}-${t}.png`) });
    }
    console.log(`${f}: stills in ${out}`); await page.close(); continue;
  }
  const file = join(pub, `${slug}-${f}.mp4`), frames = Math.ceil(timing.total * fps);
  // Constant motion is expensive to encode: cap the bitrate so a file stays near 19 MB whatever its
  // length (Cloudflare serves static files up to 25 MiB), and never above 2.6 Mbps.
  const vkbps = Math.max(900, Math.min(2600, Math.floor(19e6 * 8 / timing.total / 1000 - 170)));
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-i", join(out, "audio.m4a"), "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-maxrate", `${vkbps}k`, "-bufsize", `${vkbps * 2}k`, "-tune", "animation", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const b64 = await page.evaluate(t => { RW.draw(t); return document.getElementById("c").toDataURL("image/jpeg", .93).slice(23); }, i / fps);
    const buf = Buffer.from(b64, "base64");
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i === Math.round((timing.scenes[0].start + 2.2) * fps)) writeFileSync(join(pub, `${slug}-${f}.jpg`), buf);   // poster: the title card
    if (i % (fps * 10) === 0) process.stdout.write(`\r${f}: ${(i / fps).toFixed(0)}s / ${timing.total.toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on("close", r));
  console.log(`\r${f}: ${file.replace(resolve(ROOT, "..") + "/", "")} (${(statSync(file).size / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)}s to render)`);
  await page.close();
}
await browser.close(); server.close();

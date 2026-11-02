// Records the Raisina TV anchors' lines with Kokoro (the explainers' voice engine), offline.
//   node video/anchor-voices.mjs            # every anchor with lines: those on air (READY in
//                                           # src/anchors.js) and those given an intro
//   node video/anchor-voices.mjs tara kabir # these anchors
// Writes public/anchors/voice/<id>.mp3 for each line not yet recorded, removes recordings no line
// uses any more, and lists the recorded lines in src/anchor-voices.js. Run it after editing an
// intro in src/tv-intros.js or adding an anchor. Needs Python with kokoro-onnx and soundfile, the
// Kokoro model files (see video/README.md) and ffmpeg; set PYTHON to choose the interpreter.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public/anchors/voice");
if (!existsSync(join(root, "src/anchor-voices.js"))) writeFileSync(join(root, "src/anchor-voices.js"), "export const VOICED = new Set([]);\n");
const { ANCHORS, allLines, lineId, spoken } = await import("../src/anchors.js");
const who = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ANCHORS).filter(k => allLines(k).length);
mkdirSync(OUT, { recursive: true });

const want = new Map();
for (const k of Object.keys(ANCHORS)) {
  for (const text of allLines(k)) want.set(await lineId(k, text), { anchor: k, voice: ANCHORS[k].voice, text, say: spoken(text) });
}
const todo = [...want].filter(([id, l]) => who.includes(l.anchor) && !existsSync(join(OUT, `${id}.mp3`))).map(([id, l]) => ({ id, ...l }));
console.log(`${todo.length} lines to record for ${who.join(", ")}`);
if (todo.length) {
  const jobs = join(OUT, ".jobs.json"); writeFileSync(jobs, JSON.stringify(todo));
  const r = spawnSync(process.env.PYTHON || "python3", [join(root, "video/anchor_voices.py"), jobs, OUT], { stdio: "inherit" });
  unlinkSync(jobs);
  if (r.status) process.exit(r.status);
}
// Keep only recordings some line still uses, and list them for the channel.
const have = [];
for (const f of readdirSync(OUT)) {
  const id = f.replace(/\.mp3$/, "");
  if (!f.endsWith(".mp3")) continue;
  if (want.has(id)) have.push(id); else unlinkSync(join(OUT, f));
}
have.sort();
writeFileSync(join(root, "src/anchor-voices.js"), `// Written by \`node video/anchor-voices.mjs\`: the anchor lines recorded in public/anchors/voice/.\nexport const VOICED = new Set(${JSON.stringify(have, null, 0).replace(/","/g, '",\n  "').replace("[", "[\n  ").replace(/\]$/, "\n]")});\n`);
console.log(`${have.length} lines recorded`);

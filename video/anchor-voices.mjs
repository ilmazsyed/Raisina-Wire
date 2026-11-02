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
const { ANCHORS, allLines, lineId, spoken, engineOf } = await import("../src/anchors.js");
// Kokoro anchors only: Chatterbox anchors ("cb:" voices) are recorded by the GitHub Action
// "Raisina TV anchor voices" into the site's database.
const who = (process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ANCHORS).filter(k => allLines(k).length)).filter(k => engineOf(k) === "kokoro");
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
// List every recording for the channel. None is removed: intros made before the move to
// Chatterbox (`legacy`) keep playing their recordings in the anchors' earlier voices.
const have = readdirSync(OUT).filter(f => f.endsWith(".mp3")).map(f => f.replace(/\.mp3$/, ""));
have.sort();
writeFileSync(join(root, "src/anchor-voices.js"), `// Written by \`node video/anchor-voices.mjs\`: the anchor lines recorded in public/anchors/voice/.\nexport const VOICED = new Set(${JSON.stringify(have, null, 0).replace(/","/g, '",\n  "').replace("[", "[\n  ").replace(/\]$/, "\n]")});\n`);
console.log(`${have.length} lines recorded`);

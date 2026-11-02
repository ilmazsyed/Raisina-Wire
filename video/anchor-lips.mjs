// Puts rendered lip-synced clips on the channel: copies <dir>/<line id>.mp4 for every line an
// anchor can say (src/anchors.js) into public/anchors/lips/, removes clips no line uses any more,
// and lists them in src/anchor-lips.js.   node video/anchor-lips.mjs <dir-of-clips>
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public/anchors/lips"), from = process.argv[2];
const { ANCHORS, allLines, lineId } = await import("../src/anchors.js");
const want = new Set();
for (const k of Object.keys(ANCHORS)) for (const t of allLines(k)) want.add(await lineId(k, t));
mkdirSync(OUT, { recursive: true });
if (from) for (const f of readdirSync(from)) { const id = f.replace(/\.mp4$/, ""); if (f.endsWith(".mp4") && want.has(id)) copyFileSync(join(from, f), join(OUT, f)); }
const have = [];
for (const f of readdirSync(OUT)) { const id = f.replace(/\.mp4$/, ""); if (want.has(id)) have.push(id); else unlinkSync(join(OUT, f)); }
have.sort();
writeFileSync(join(root, "src/anchor-lips.js"), `// Written by \`node video/anchor-lips.mjs\`: anchor lines with a lip-synced clip in public/anchors/lips/.\nexport const LIPPED = new Set(${JSON.stringify(have).replace(/","/g, '",\n  "').replace("[", "[\n  ").replace(/\]$/, "\n]")});\n`);
console.log(`${have.length} lip-synced clips on the channel`);

// Every file in migrations/ must be listed in src/worker.js, which applies them on first request.
// A file that is not listed never reaches the live database, so the build stops here instead.
import { readdirSync, readFileSync } from "node:fs";
const worker = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const missing = readdirSync(new URL("../migrations/", import.meta.url)).filter(f => f.endsWith(".sql") && !worker.includes(`["${f}",`));
if (missing.length) { console.error(`Migrations not listed in src/worker.js MIGRATIONS: ${missing.join(", ")}`); process.exit(1); }
console.log("migrations: all listed");

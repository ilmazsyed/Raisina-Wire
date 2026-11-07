import { resolve, relative, join } from "node:path";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { defineConfig } from "vite";

// Fill the service worker's precache list with this build's files, so an installed app
// opens offline. Admin pages are left out.
function precacheServiceWorker() {
  let outDir;
  return {
    name: "rashtrix-precache",
    apply: "build",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const walk = dir => readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
      const files = walk(outDir).map(f => "/" + relative(outDir, f).split("\\").join("/"))
        .filter(f => !/^\/(sw\.js|_headers|og-image[\w-]*\.jpg|admin)/.test(f) && !f.includes("/admin-"))
        .map(f => (f === "/index.html" ? "/" : f))
        .sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f === "/" ? readFileSync(join(outDir, "index.html")) : readFileSync(join(outDir, f)));
      const swPath = join(outDir, "sw.js");
      const sw = readFileSync(swPath, "utf8")
        .replace('const BUILD = "__BUILD_ID__";', `const BUILD = "${hash.digest("hex").slice(0, 12)}";`)
        .replace("const PRECACHE = __PRECACHE__;", `const PRECACHE = ${JSON.stringify(files)};`);
      if (sw.includes("__PRECACHE__;") || sw.includes('"__BUILD_ID__"')) throw new Error("sw.js placeholders were not filled");
      writeFileSync(swPath, sw);
    }
  };
}

export default defineConfig({
  plugins: [precacheServiceWorker()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin.html")
      }
    }
  }
});

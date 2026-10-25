// Live results counters for election coverage. A coverage row's `results` column holds the
// counter's set-up (JSON):
//   { title, note, source, feed: "tse" | "manual", url, candidates: [{ match, name, party, tag, color, photo }],
//     data: { reporting, updatedAt, called, candidates: [{ name, votes, pct }], nulls, blanks } }
// "tse" reads the Brazilian electoral court's public results file at `url` (every 15 seconds at
// most); "manual" serves `data`, which the desk updates with `live-results`.
let last = new Map(); // coverage id -> last good result, if the feed fails for a moment

// TSE writes "1.234,56"; the desk's own figures are plain numbers.
const num = v => typeof v === "number" ? v : Number(String(v ?? "").includes(",") ? String(v).replace(/\./g, "").replace(",", ".") : String(v ?? "")) || 0;
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

function fromTse(j, cfg) {
  const cands = [];
  for (const c of j.carg || []) for (const a of c.agr || []) for (const p of a.par || []) for (const x of p.cand || [])
    cands.push({ key: norm(x.nmu || x.nm), full: x.nm, party: p.sg, votes: num(x.vap), pct: num(x.pvapn || x.pvap), elected: x.e === "s" });
  const [d, m, y] = String(j.dt || "").split("/"), t = j.ht || "00:00:00";
  // TSE times are Brasília time (UTC−3).
  const updatedAt = y ? new Date(`${y}-${m}-${d}T${t}-03:00`).toISOString() : null;
  return {
    reporting: num(j.s?.pstn || j.s?.pst), updatedAt, final: j.tf === "s", decided: j.md === "s",
    candidates: cands, nulls: num(j.v?.tvn), blanks: num(j.v?.vb), turnout: num(j.e?.pcn || j.e?.pc)
  };
}

// Joins the feed's figures to the desk's candidate list (names, parties, colours, photos).
function shape(cfg, raw) {
  const list = (cfg.candidates || []).map(c => {
    const hit = raw.candidates.find(x => x.key === norm(c.match || c.name) || norm(x.full) === norm(c.match || c.name) || x.key === norm(c.name));
    return { name: c.name, party: c.party || hit?.party || "", tag: c.tag || "", color: c.color || "", photo: c.photo || "", votes: hit?.votes || 0, pct: hit?.pct || 0, elected: !!hit?.elected };
  });
  const candidates = list.length ? list : raw.candidates.map(x => ({ name: x.full, party: x.party, votes: x.votes, pct: x.pct, elected: x.elected }));
  candidates.sort((a, b) => b.votes - a.votes || b.pct - a.pct);
  const winner = candidates.find(c => c.elected)?.name || cfg.data?.called || null;
  return { title: cfg.title || "Results", note: cfg.note || "", source: cfg.source || "", reporting: raw.reporting, updatedAt: raw.updatedAt,
    final: !!raw.final, winner, candidates, nulls: raw.nulls || 0, blanks: raw.blanks || 0, turnout: raw.turnout || 0 };
}

export async function liveResults(env, row) {
  let cfg; try { cfg = JSON.parse(row.results || ""); } catch { return null; }
  if (!cfg || typeof cfg !== "object") return null;
  if (cfg.feed === "tse" && /^https:\/\/resultados\.tse\.jus\.br\//.test(cfg.url || "")) {
    try {
      const res = await fetch(cfg.url, { cf: { cacheTtl: 15, cacheEverything: true }, headers: { "user-agent": "RaisinaWire/1.0 (+https://raisinawire.calibrex.org)" } });
      if (!res.ok) throw new Error(`TSE ${res.status}`);
      const out = shape(cfg, fromTse(await res.json(), cfg));
      last.set(row.id, out);
      return { ...out, live: true };
    } catch (e) {
      const prev = last.get(row.id);
      if (prev) return { ...prev, live: false, stale: true };
      // Fall through to the desk's figures, if any.
    }
  }
  const d = cfg.data || {};
  return { ...shape(cfg, { reporting: num(d.reporting), updatedAt: d.updatedAt || row.updated_at, final: !!d.final,
    candidates: (d.candidates || []).map(c => ({ key: norm(c.name), full: c.name, party: c.party || "", votes: num(c.votes), pct: num(c.pct), elected: !!c.elected })),
    nulls: num(d.nulls), blanks: num(d.blanks), turnout: num(d.turnout) }), live: false };
}

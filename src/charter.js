// The Editorial Charter: the channel's tone, its stance subject by subject, the facts that must
// never be wrong, the words to use and to avoid, and the editor's special notes. It is binding on
// everything the system writes: every Gemini call (wire rewrites, briefs, AVO scripts, headlines,
// segments, the e-paper) carries it in its instructions, and everything written, translations
// included, passes through its corrections afterwards (so "Chief Minister Mamata Banerjee" can
// never go out). Only the owner opens the desk, and gives access to whom they choose.

export const STANCES = { neutral: "Neutral and factual", critical: "Critical (scrutinise, with facts)", supportive: "Supportive (with facts)" };
export const SUBJECTS = [
  ["wb_politics", "West Bengal politics"], ["india_politics", "India's politics"], ["kolkata", "Kolkata civic affairs"],
  ["geopolitics", "Geopolitics and foreign affairs"], ["bangladesh", "Bangladesh"], ["pakistan_china", "Pakistan and China"],
  ["religion", "Religion and communal issues"], ["crime_courts", "Crime and courts"], ["business", "Business and the economy"],
  ["sports", "Sports"], ["entertainment", "Entertainment"]
];

export const DEFAULT_CHARTER = {
  tone: "Sober, factual hard news. Short, plain sentences. No sensational words, no exclamation marks, no judgement words, no speculation presented as fact. Every claim attributed to who made it. Never invent quotes, figures, names or details. When something is not confirmed, say so.",
  stances: {
    wb_politics: { stance: "neutral", note: "Neutral and factual. Equal weight to the government and the opposition; report what each says, attributed; no party's slogans or labels in our own voice." },
    india_politics: { stance: "neutral", note: "Neutral and factual. Equal weight to the government and the opposition; report what each says, attributed." },
    kolkata: { stance: "neutral", note: "Practical: what changes for residents, where and when." },
    geopolitics: { stance: "neutral", note: "India's official positions reported accurately; other countries' positions attributed; no propaganda language from any side." },
    bangladesh: { stance: "neutral", note: "Factual; attribute claims; no communal framing." },
    pakistan_china: { stance: "neutral", note: "Factual; India's official position stated where relevant; claims attributed." },
    religion: { stance: "neutral", note: "Calm language. Do not name communities in violence unless the police or the government do. Nothing that could inflame." },
    crime_courts: { stance: "neutral", note: "An accused is accused until convicted. Never name or identify victims of sexual offences or minors." },
    business: { stance: "neutral", note: "Figures exact, with their source; no investment advice." },
    sports: { stance: "neutral", note: "Bengal and India's teams covered warmly but fairly." },
    entertainment: { stance: "neutral", note: "No gossip presented as fact." }
  },
  facts: [
    "The Chief Minister of West Bengal is Suvendu Adhikari.",
    "Mamata Banerjee is the former Chief Minister of West Bengal. She is not the Chief Minister.",
    "Bengali: মুখ্যমন্ত্রী শুভেন্দু অধিকারী; প্রাক্তন মুখ্যমন্ত্রী মমতা বন্দ্যোপাধ্যায়। Hindi: मुख्यमंत्री शुभेंदु अधिकारी; पूर्व मुख्यमंत्री ममता बनर्जी।"
  ],
  // Corrections applied to everything written: `find` becomes `replace`, unless `unless` already
  // stands within the twenty-five characters before it.
  corrections: [
    { find: "মুখ্যমন্ত্রী মমতা", replace: "প্রাক্তন মুখ্যমন্ত্রী মমতা", unless: "প্রাক্তন" },
    { find: "বিরোধী দলনেতা শুভেন্দু", replace: "মুখ্যমন্ত্রী শুভেন্দু", unless: "" },
    { find: "West Bengal Chief Minister Mamata", replace: "former West Bengal Chief Minister Mamata", unless: "former" },
    { find: "Bengal Chief Minister Mamata", replace: "former Bengal Chief Minister Mamata", unless: "former" },
    { find: "Bengal CM Mamata", replace: "former Bengal CM Mamata", unless: "former" },
    { find: "Chief Minister Mamata", replace: "former Chief Minister Mamata", unless: "former" },
    { find: "CM Mamata", replace: "former CM Mamata", unless: "former" },
    { find: "Leader of Opposition Suvendu", replace: "Chief Minister Suvendu", unless: "" },
    { find: "मुख्यमंत्री ममता", replace: "पूर्व मुख्यमंत्री ममता", unless: "पूर्व" },
    { find: "नेता प्रतिपक्ष शुभेंदु", replace: "मुख्यमंत्री शुभेंदु", unless: "" }
  ],
  avoid: ["চাঞ্চল্যকর", "বিস্ফোরক", "ধুন্ধুমার", "shocking", "explosive", "slams", "sensational"],
  prefer: [],
  notes: "",
  access: []
};

const merge = c => ({ ...DEFAULT_CHARTER, ...c, stances: { ...DEFAULT_CHARTER.stances, ...(c?.stances || {}) } });
let memo = null;
export async function getCharter(env) {
  if (memo && Date.now() - memo.at < 60e3) return memo.c;
  let c = DEFAULT_CHARTER;
  try { const r = await env.DB.prepare("SELECT value FROM settings WHERE key='editorial_charter'").first(); if (r?.value) c = merge(JSON.parse(r.value)); } catch { /* the defaults */ }
  memo = { at: Date.now(), c };
  return c;
}

// The charter, as the instructions every writing job carries.
export function charterPrompt(c) {
  const st = SUBJECTS.map(([k, n]) => { const s = c.stances?.[k]; return s ? `- ${n}: ${STANCES[s.stance] || s.stance}.${s.note ? ` ${s.note}` : ""}` : ""; }).filter(Boolean).join("\n");
  return `EDITORIAL CHARTER of Rashtrix 24×7 News. It is binding and overrides anything else in these instructions.
Tone: ${c.tone}
Stance by subject:
${st}
Facts that must never be wrong (never contradict them, whatever a source says):
${(c.facts || []).map(f => `- ${f}`).join("\n")}
${(c.avoid || []).length ? `Never use these words: ${c.avoid.join(", ")}.\n` : ""}${(c.prefer || []).length ? `Prefer these words: ${c.prefer.join(", ")}.\n` : ""}${c.notes ? `Special editorial notes: ${c.notes}\n` : ""}`;
}

// The corrections, on a string or on everything in a structure of strings.
export function fixFacts(c, v) {
  const rules = (c?.corrections || []).filter(r => r?.find && r.replace);
  if (!rules.length) return v;
  const one = s => {
    let out = String(s);
    for (const r of rules) {
      if (!out.includes(r.find)) continue;
      let res = "", i = 0, j;
      while ((j = out.indexOf(r.find, i)) >= 0) {
        const before = out.slice(Math.max(0, j - 25), j);
        res += out.slice(i, j) + (r.unless && before.includes(r.unless) ? r.find : r.replace);
        i = j + r.find.length;
      }
      out = res + out.slice(i);
    }
    return out;
  };
  const walk = x => typeof x === "string" ? one(x) : Array.isArray(x) ? x.map(walk) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x;
  return walk(v);
}
export async function applyCharter(env, v) { return fixFacts(await getCharter(env), v); }

// /api/admin/charter: the owner, and the people they gave access to.
export async function handleCharter(request, env, user, { json, err, audit, isOwner }) {
  const c = await getCharter(env);
  const allowed = isOwner || (c.access || []).includes(user.id);
  if (!allowed) return err("The Editorial Charter is open only to the owner and the people they choose.", 403);
  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, display_name AS name, role FROM users WHERE role IN ('admin','editor') AND email NOT LIKE 'removed-%' ORDER BY display_name").all().catch(() => ({ results: [] }));
    return json({ charter: c, defaults: DEFAULT_CHARTER, subjects: SUBJECTS, stances: STANCES, owner: !!isOwner, staff: results }, 200, { "cache-control": "no-store" });
  }
  if (request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const t = (v, n) => String(v ?? "").slice(0, n);
    const list = (v, n, m) => (Array.isArray(v) ? v : []).map(x => t(x, m).trim()).filter(Boolean).slice(0, n);
    const next = {
      tone: t(b.tone, 3000),
      stances: Object.fromEntries(SUBJECTS.map(([k]) => { const s = b.stances?.[k] || {}; return [k, { stance: STANCES[s.stance] ? s.stance : "neutral", note: t(s.note, 1500) }]; })),
      facts: list(b.facts, 60, 600),
      corrections: (Array.isArray(b.corrections) ? b.corrections : []).map(r => ({ find: t(r?.find, 200).trim(), replace: t(r?.replace, 200).trim(), unless: t(r?.unless, 60).trim() })).filter(r => r.find && r.replace).slice(0, 80),
      avoid: list(b.avoid, 200, 80), prefer: list(b.prefer, 200, 80),
      notes: t(b.notes, 6000),
      // (only the owner changes who has access)
      access: isOwner ? list(b.access, 50, 80) : (c.access || [])
    };
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('editorial_charter',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
    memo = null;
    await audit("charter.update", "settings", "editorial_charter", {});
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  return err("Not found.", 404);
}

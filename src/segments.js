// The channel's segments and its programming clock (src/engine.js plays them).
//
// Bulletins at :00, :15, :30 and :45, each when the item on air ends (a video is never cut): West
// Bengal politics first, then Kolkata's, India's, then West Bengal, Kolkata, India, the world,
// sports, entertainment, lifestyle (src/labels.js bulletinRank), from the last thirty minutes. The
// :00 and :30 bulletins are followed by the weather and the markets; the :15 and :45 ones by a desk
// segment (slot c: sports, entertainment, world, lifestyle, by time of day). No two segments run
// back to back. Each half-hour also has two segment slots (eight and twenty-two minutes in) on top
// of the bulletins; which segment fills a slot depends on the time of day:
//   morning 6–10   শহরের খবর, কলকাতা ১০            (the city and the commute)
//   day 10–17      বাংলাদেশ ডেস্ক / এক মিনিটে বিশ্ব, সংখ্যায় আজ
//   prime 17–23    story of the hour, কলকাতা ১০ / খেলার খবর
//   late 23–6      আজকের দিনে, সংখ্যায় আজ
// A slot's list rotates half-hour by half-hour; a segment with nothing to show gives way to the next
// one that has. The control room can change any daypart (Scheduler › Programming clock).
//
// Everything is built from what the channel already has: the wire's stories (last twelve hours),
// their pictures (src/bulletinimg.js), the newsreader's lines where the bulletin has one, the
// weather, and Bengali Wikipedia's "on this day" page for আজকের দিনে (fetched once a day).
import { sentencesIn } from "./sentences.js";
import { labelsOf } from "./labels.js";

export const SEG_NAMES = { city: "শহরের খবর", kolkata10: "কলকাতা ১০", bangladesh: "বাংলাদেশ ডেস্ক", world: "এক মিনিটে বিশ্ব", numbers: "সংখ্যায় আজ", sports: "খেলার খবর", onthisday: "আজকের দিনে", soth: "এই ঘণ্টার বড় খবর", entertainment: "বিনোদনের খবর", lifestyle: "জীবনধারা" };
// Slots a (:08 and :38) and b (:22 and :52) rotate half-hour by half-hour; slot c follows the
// quick bulletins at :15 and :45 with the desk segments (sports, entertainment, world, lifestyle),
// a fixed turn for each quarter so the promos can say when each one plays.
export const CLOCK_DEFAULT = {
  morning: { from: 6, a: ["city"], b: ["kolkata10"], c: ["lifestyle", "sports"], avoEvery: 3 },
  day: { from: 10, a: ["bangladesh", "city"], b: ["numbers", "kolkata10"], c: ["world", "entertainment", "lifestyle"], avoEvery: 3 },
  prime: { from: 17, a: ["soth"], b: ["kolkata10", "numbers"], c: ["sports", "entertainment", "world"], avoEvery: 2 },
  late: { from: 23, a: ["onthisday"], b: ["numbers"], c: ["entertainment", "world"], avoEvery: 4 }
};
export const SLOT_MINUTES = { a: 8, b: 22, c: 15 };
// The clock as the control room set it (each daypart's slot lists and AVO rhythm), on the defaults.
export function clockOf(s) {
  const out = structuredClone(CLOCK_DEFAULT), c = s.clock || {};
  for (const [k, d] of Object.entries(out)) {
    const x = c[k] || {}, ok = v => Array.isArray(v) ? v.filter(n => SEG_NAMES[n]).slice(0, 4) : null;
    if (ok(x.a)?.length) d.a = ok(x.a);
    if (ok(x.b)?.length) d.b = ok(x.b);
    if (ok(x.c)?.length) d.c = ok(x.c);
    if (Number.isFinite(+x.avoEvery)) d.avoEvery = Math.max(1, Math.min(8, Math.round(+x.avoEvery)));
  }
  return out;
}

const BN = "০১২৩৪৫৬৭৮৯", toNum = t => Number(String(t).replace(/[০-৯]/g, d => BN.indexOf(d)).replace(/,/g, ""));
const UNITS = "কোটি|লক্ষ|লাখ|হাজার|টাকা|জন|শতাংশ|%|ফুট|কিমি|কিলোমিটার|ডিগ্রি|বছর|দিন|ঘণ্টা|মিটার|টন|বিঘা|একর|কেজি|টি";
const FIG = new RegExp(`([০-৯0-9][০-৯0-9,.]*)\\s*(${UNITS})(?![\\p{L}\\p{M}])`, "u");
const CITY = /মেট্রো|লোকাল ট্রেন|ট্রেন বাতিল|ট্রেন চলাচল|যানজট|ট্র্যাফিক|ট্রাফিক|বাস ধর্মঘট|বাস পরিষেবা|লোডশেডিং|বিদ্যুৎ বিভ্রাট|জল সরবরাহ|ফেরি|উড়ালপুল|রাস্তা বন্ধ|অটো|ক্যাব|বিমানবন্দর|শিয়ালদহ|হাওড়া স্টেশন/;
const plain = t => String(t || "").replace(/<[^>]+>/g, " ").replace(/[#*_>]+/g, " ").replace(/\s+/g, " ").trim();
// The first sentence, whole (never cut with a "…"; src/sentences.js).
const firstSentence = t => sentencesIn(t)[0] || "";

// আজকের দিনে: Bengali Wikipedia's day page ("১১ নভেম্বর"), its events section, three lines.
const MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const bnNum = n => String(n).replace(/\d/g, d => BN[d]);
const unwiki = t => String(t).replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, "").replace(/\{\{[^{}]*\}\}/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\[https?:\S+\s([^\]]*)\]/g, "$1").replace(/'{2,}/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
async function onThisDay(env) {
  const d = new Date(Date.now() + 5.5 * 3600e3), key = `otd:${d.toISOString().slice(5, 10)}`;
  const have = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first().catch(() => null);
  if (have) { try { const j = JSON.parse(have.value); if (j.y === d.getUTCFullYear() && (j.items.length || Date.now() - j.at < 6 * 3600e3)) return j.items; } catch { /* again */ } }
  let items = [];
  try {
    const page = `${bnNum(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
    const r = await fetch(`https://bn.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(page)}`, { headers: { "user-agent": "RashtrixTV/1.0 (news channel; on-this-day card)" }, signal: AbortSignal.timeout(8000) });
    const text = (await r.json())?.parse?.wikitext?.["*"] || "";
    const sec = text.split(/\n==+\s*/).find(s => /^(ঘটনা|ঘটনাবলী|ঘটনাবলি)/.test(s)) || "";
    for (const line of sec.split("\n")) {
      const m = line.match(/^\*+\s*(?:\[\[)?([০-৯0-9]{3,4})(?:\]\])?\s*(?:খ্রি\S*)?\s*[-–—:]\s*(.+)$/);
      if (!m) continue;
      const y = toNum(m[1]), t = unwiki(m[2]);
      if (y >= 1000 && t.length >= 20 && t.length <= 170) items.push({ y, text: t });
    }
    // Three, spread over the centuries, the most recent first.
    items.sort((a, b) => b.y - a.y);
    if (items.length > 3) { const n = items.length; items = [items[0], items[Math.floor(n / 3)], items[Math.floor(2 * n / 3)]]; }
  } catch { items = []; }
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, JSON.stringify({ y: d.getUTCFullYear(), at: Date.now(), items })).run().catch(() => {});
  return items;
}

// Places a story may name, for the story of the hour's map: Bengal's districts and towns, India,
// Bangladesh and the world (Bengali spellings first, then English), with latitude and longitude.
const PLACES = [
  // Towns first (a town is more exact than its district).
  ["নৈহাটি|Naihati", 22.89, 88.42], ["ব্যারাকপুর|Barrackpore", 22.76, 88.38], ["কল্যাণী|Kalyani", 22.98, 88.43], ["ব্যান্ডেল|Bandel", 22.92, 88.38], ["শ্রীরামপুর|Serampore", 22.75, 88.34],
  ["উত্তরপাড়া|Uttarpara", 22.66, 88.35], ["আরামবাগ|Arambagh", 22.88, 87.78], ["দমদম|Dum Dum", 22.62, 88.42], ["সল্টলেক|বিধাননগর|Salt Lake", 22.58, 88.41], ["নিউটাউন|নিউ টাউন|New Town", 22.59, 88.48],
  ["সোনারপুর|Sonarpur", 22.44, 88.43], ["বারুইপুর|Baruipur", 22.36, 88.43], ["ক্যানিং|Canning", 22.31, 88.66], ["কাকদ্বীপ|Kakdwip", 21.88, 88.19], ["গঙ্গাসাগর|সাগরদ্বীপ|Gangasagar", 21.65, 88.08],
  ["নবদ্বীপ|Nabadwip", 23.41, 88.37], ["রানাঘাট|Ranaghat", 23.18, 88.57], ["কাটোয়া|Katwa", 23.65, 88.13], ["কালনা|Kalna", 23.22, 88.36], ["জঙ্গিপুর|Jangipur", 24.47, 88.08],
  ["ফরাক্কা|Farakka", 24.82, 87.92], ["কাঁথি|Contai", 21.78, 87.75], ["ঘাটাল|Ghatal", 22.66, 87.73], ["বিষ্ণুপুর|Bishnupur", 23.07, 87.32], ["রামপুরহাট|Rampurhat", 24.17, 87.78],
  ["তারাপীঠ|Tarapith", 24.11, 87.8], ["মন্দারমণি|Mandarmani", 21.66, 87.71], ["কার্শিয়াং|Kurseong", 26.88, 88.28], ["মিরিক|Mirik", 26.89, 88.18], ["ইসলামপুর|Islampur", 26.27, 88.19],
  ["বেলুড়|Belur", 22.63, 88.34], ["দক্ষিণেশ্বর|Dakshineswar", 22.65, 88.36], ["বনগাঁ|Bangaon", 23.05, 88.82], ["বসিরহাট|Basirhat", 22.66, 88.87], ["ডায়মন্ড হারবার|Diamond Harbour", 22.19, 88.19],
  ["কলকাতা|Kolkata", 22.57, 88.36], ["হাওড়া|Howrah", 22.59, 88.31], ["হুগলি|Hooghly|চুঁচুড়া", 22.9, 88.39], ["উত্তর ২৪ পরগনা|বারাসত|Barasat", 22.72, 88.48], ["দক্ষিণ ২৪ পরগনা|আলিপুর", 22.16, 88.43],
  ["দার্জিলিং|Darjeeling", 27.04, 88.26], ["শিলিগুড়ি|Siliguri", 26.73, 88.4], ["জলপাইগুড়ি|Jalpaiguri", 26.52, 88.72], ["কোচবিহার|Cooch Behar", 26.32, 89.45], ["আলিপুরদুয়ার|Alipurduar", 26.49, 89.53],
  ["মালদা|মালদহ|Malda", 25.01, 88.14], ["মুর্শিদাবাদ|বহরমপুর|Murshidabad", 24.1, 88.25], ["নদিয়া|কৃষ্ণনগর|Nadia", 23.4, 88.5], ["বর্ধমান|Bardhaman", 23.23, 87.86], ["আসানসোল|Asansol", 23.68, 86.98],
  ["দুর্গাপুর|Durgapur", 23.55, 87.32], ["বাঁকুড়া|Bankura", 23.23, 87.07], ["পুরুলিয়া|Purulia", 23.33, 86.36], ["বীরভূম|সিউড়ি|Birbhum", 23.91, 87.53], ["বোলপুর|শান্তিনিকেতন|Santiniketan", 23.68, 87.69],
  ["মেদিনীপুর|Medinipur|Midnapore", 22.42, 87.32], ["খড়্গপুর|Kharagpur", 22.33, 87.32], ["দিঘা|Digha", 21.63, 87.51], ["হলদিয়া|Haldia", 22.06, 88.07], ["তমলুক|Tamluk", 22.3, 87.92],
  ["সুন্দরবন|Sundarbans", 21.95, 88.9], ["ডায়মন্ড হারবার|Diamond Harbour", 22.19, 88.19], ["বসিরহাট|Basirhat", 22.66, 88.87], ["বনগাঁ|Bangaon", 23.05, 88.82], ["রায়গঞ্জ|Raiganj", 25.62, 88.12],
  ["বালুরঘাট|Balurghat", 25.22, 88.77], ["ঝাড়গ্রাম|Jhargram", 22.45, 86.99], ["কালিম্পং|Kalimpong", 27.06, 88.47], ["শান্তিপুর|Santipur", 23.25, 88.43], ["তারকেশ্বর|Tarakeswar", 22.89, 88.02],
  ["দিল্লি|Delhi", 28.61, 77.21], ["মুম্বই|Mumbai", 19.08, 72.88], ["চেন্নাই|Chennai", 13.08, 80.27], ["বেঙ্গালুরু|Bengaluru", 12.97, 77.59], ["হায়দরাবাদ|Hyderabad", 17.39, 78.49],
  ["পটনা|পাটনা|Patna", 25.59, 85.14], ["রাঁচি|Ranchi", 23.34, 85.31], ["ভুবনেশ্বর|Bhubaneswar", 20.3, 85.82], ["গুয়াহাটি|গৌহাটি|Guwahati", 26.14, 91.74], ["লখনউ|Lucknow", 26.85, 80.95],
  ["শ্রীনগর|কাশ্মীর|Kashmir|Srinagar", 34.08, 74.8], ["আগরতলা|ত্রিপুরা|Agartala", 23.83, 91.28], ["শিলং|Shillong", 25.58, 91.89], ["ইম্ফল|মণিপুর|Imphal", 24.82, 93.94], ["সিকিম|গ্যাংটক|Gangtok", 27.33, 88.61],
  ["ঢাকা|Dhaka", 23.81, 90.41], ["চট্টগ্রাম|Chattogram|Chittagong", 22.36, 91.78], ["খুলনা|Khulna", 22.85, 89.54], ["রাজশাহী|Rajshahi", 24.37, 88.6], ["সিলেট|Sylhet", 24.9, 91.87],
  ["কাঠমান্ডু|নেপাল|Kathmandu", 27.72, 85.32], ["ইসলামাবাদ|Islamabad", 33.68, 73.05], ["কলম্বো|শ্রীলঙ্কা|Colombo", 6.93, 79.86], ["থিম্পু|ভুটান|Thimphu", 27.47, 89.64], ["বেজিং|Beijing", 39.9, 116.4],
  ["ওয়াশিংটন|Washington", 38.9, -77.04], ["মস্কো|Moscow", 55.76, 37.62], ["লন্ডন|London", 51.51, -0.13], ["কিভ|কিয়েভ|Kyiv", 50.45, 30.52], ["গাজা|Gaza", 31.5, 34.47], ["তেহরান|Tehran", 35.69, 51.39], ["দুবাই|Dubai", 25.2, 55.27]
].map(([n, lat, lon]) => ({ names: n.split("|"), name: n.split("|")[0], lat, lon }));
// In the order the text names them; a place within a few kilometres of one already found (a
// town and its district) is left out.
export const placesIn = text => {
  const hits = [];
  for (const p of PLACES) { let at = Infinity; for (const n of p.names) { const m = text.match(new RegExp(`(?<![\\p{L}\\p{M}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u")); if (m && m.index < at) at = m.index; } if (at < Infinity) hits.push({ at, p }); }
  const out = [];
  for (const { p } of hits.sort((a, b) => a.at - b.at)) if (!out.some(o => o.name === p.name || Math.hypot(o.lat - p.lat, o.lon - p.lon) < 0.12)) out.push({ name: p.name, lat: p.lat, lon: p.lon });
  return out.slice(0, 3);
};
// What the story is about, for the segment's icon.
const TOPICS = [["fire", /আগুন|অগ্নিকাণ্ড|বিস্ফোরণ|দমকল/], ["crash", /দুর্ঘটনা|সংঘর্ষ|লাইনচ্যুত|উল্টে/], ["crime", /পুলিশ|গ্রেফতার|খুন|চুরি|ডাকাতি|অভিযুক্ত|সিবিআই|ইডি|তদন্ত|আটক|হামলা|গুলি|বোমা|জঙ্গি/],
  ["court", /আদালত|হাইকোর্ট|সুপ্রিম কোর্ট|বিচারপতি|মামলা|রায়/], ["vote", /নির্বাচন|ভোট|প্রার্থী|কমিশন|বিধানসভা|লোকসভা/], ["weather", /বৃষ্টি|ঝড়|ঘূর্ণিঝড়|আবহাওয়া|তাপমাত্রা|শীত|গরম|বন্যা|নিম্নচাপ/],
  ["health", /হাসপাতাল|চিকিৎসা|ডেঙ্গি|রোগী|স্বাস্থ্য|ডাক্তার|চিকিৎসক/], ["sport", /ম্যাচ|ক্রিকেট|ফুটবল|গোল|উইকেট|মোহনবাগান|ইস্টবেঙ্গল|টুর্নামেন্ট/],
  ["faith", /পুজো|প্রতিমা|বিসর্জন|উৎসব|মন্দির|ভক্ত|ইদ(?![\p{L}\p{M}])|ইদের|মেলা/], ["travel", /ট্রেন|মেট্রো|বাস|বিমান|উড়ান|ফেরি|রাস্তা|যান চলাচল/], ["protest", /বিক্ষোভ|ধর্মঘট|অবরোধ|মিছিল|আন্দোলন/],
  ["money", /টাকা|দাম(?![\p{L}\p{M}])|দামে|বাজার|শেয়ার|বাজেট|কর(?![\p{L}\p{M}])|করের|ব্যাংক|ব্যাঙ্ক/], ["school", /পরীক্ষা|স্কুল|বিশ্ববিদ্যালয়|ছাত্র|শিক্ষক|পড়ুয়া/], ["politics", /মন্ত্রী|সরকার|তৃণমূল|বিজেপি|সিপিএম|কংগ্রেস|দল(?![\p{L}\p{M}])|দলের|দলীয়|নেতা/]];
// A word must start where the match starts (so "রায়" is not found in "ইসরায়েল", nor "বাস" in "বিশ্বাস").
const atWordStart = re => new RegExp(`(?<![\\p{L}\\p{M}])(?:${re.source})`, "u");
const TOPIC_RE = TOPICS.map(([k, re]) => [k, atWordStart(re)]);
export const topicOf = text => (TOPIC_RE.find(([, re]) => re.test(text)) || ["news"])[0];
const QUOTE = /[“"‘']([^”"’']{25,170})[”"’']/;
const words = t => new Set(String(t || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 3));
// The story of the hour: the biggest story in the AVO pool of the last three hours (most outlets
// and alerts first, then the newest), with its places, a quote from the report and the earlier
// stories on the same subject (a timeline).
async function storyOfHour(env, avo) {
  const recent = (avo || []).filter(x => Date.parse(x.at) > Date.now() - 3 * 3600e3 && x.voice?.length);
  const top = (recent.length ? recent : (avo || []).filter(x => x.voice?.length)).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || String(b.at).localeCompare(String(a.at)))[0];
  if (!top) return null;
  const art = top.id && !String(top.id).startsWith("brk:") ? await env.DB.prepare("SELECT title, substr(body,1,4000) AS body, published_at FROM articles WHERE id=?").bind(top.id).first().catch(() => null) : null;
  const body = plain(art?.body || ""), lines = top.lines || [];
  // The map shows only the places the headline or the first two sentences name (a place further
  // down a report is often only a mention).
  const q = body.match(QUOTE);
  let timeline = [];
  if (art) {
    const W = words(top.title);
    const { results } = await env.DB.prepare(`SELECT title, published_at FROM articles WHERE status='published' AND lang='bn' AND pulled_at IS NULL AND id<>? AND published_at>=? AND published_at<? ORDER BY published_at DESC LIMIT 200`)
      .bind(top.id, new Date(Date.now() - 48 * 3600e3).toISOString(), art.published_at).all().catch(() => ({ results: [] }));
    timeline = results.filter(r => { let n = 0; for (const w of words(r.title)) if (W.has(w)) n++; return n >= 2; }).slice(0, 4).map(r => ({ t: r.title, at: r.published_at })).reverse();
  }
  // A figure in each sentence, if it has one (the segment counts it up on screen).
  const figs = lines.map(l => { const m = l.match(FIG); const n = m ? toNum(m[1]) : 0; return n > 0 && !(m[2] === "বছর" && n > 150) ? { n, dec: /[.]/.test(m[1]), unit: m[2] } : null; });
  // No photographs: the story of the hour is told in the channel's own graphics (a search picture
  // can belong to another story).
  return { id: top.id, t: top.title, d: top.desk, at: top.at, lines, voice: top.voice, secs: top.secs, upd: !!top.upd, topic: topicOf(`${top.title} ${lines.slice(0, 2).join(" ")}`),
    places: placesIn(`${top.title} ${lines.slice(0, 2).join(" ")}`), figs, quote: q ? q[1].trim() : "", timeline };
}

const memo = new Map();
// The segments' material (refreshed once a minute). `voices` maps a story title to its
// newsreader line (the bulletin's), so a story the bulletin has voiced is read in the segment too.
export async function segmentsData(env, s, voices = new Map(), avo = []) {
  const hit = memo.get("segs");
  let base = hit && Date.now() - hit.at < 60e3 ? hit.value : null;
  if (!base) {
    const { results } = await env.DB.prepare(`SELECT id, title, category, substr(body,1,1200) AS body, published_at FROM articles WHERE status='published' AND lang='bn' AND pulled_at IS NULL
      AND kind IN ('rewrite','brief') AND published_at>=? ORDER BY published_at DESC LIMIT 120`).bind(new Date(Date.now() - 12 * 3600e3).toISOString()).all().catch(() => ({ results: [] }));
    const ids = results.map(r => r.id), pics = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      (await env.DB.prepare(`SELECT article_id, url, credit FROM bulletin_images WHERE url<>'' AND article_id IN (${part.map(() => "?").join(",")})`).bind(...part).all().catch(() => ({ results: [] }))).results.forEach(r => pics.set(r.article_id, r));
    }
    const all = results.map(r => {
      const text = `${r.title} ${plain(r.body).slice(0, 600)}`, l = labelsOf(r.category, text);
      return { t: r.title, d: r.category, line: firstSentence(r.body), at: r.published_at, ...l, img: pics.has(r.id) ? `/api/tv/bimg/${encodeURIComponent(r.id)}?v=${encodeURIComponent((pics.get(r.id).url.split("/").pop() || "").slice(-12))}` : "", text };
    });
    const take = (f, n) => all.filter(f).slice(0, n).map(({ text, ...x }) => x);
    const numbers = [];
    for (const x of all) {
      const m = (`${x.t} ${x.line}`).match(FIG); if (!m) continue;
      const n = toNum(m[1]); if (!(n > 0) || (m[2] === "বছর" && n > 150)) continue;
      numbers.push({ n, dec: /[.]/.test(m[1]), unit: m[2], line: x.t, d: x.d, dk: x.dk });
      if (numbers.length >= 5) break;
    }
    base = {
      kolkata10: take(x => x.dk === "kolkata" || x.dk === "bengal", 10),
      world: take(x => x.dk === "world", 5),
      bangladesh: take(x => x.dk === "bangladesh", 5),
      sports: take(x => x.dk === "sports", 5),
      entertainment: take(x => x.d === "Entertainment", 5),
      lifestyle: take(x => x.d === "Lifestyle", 5),
      city: take(x => (x.dk === "kolkata" || x.dk === "bengal") && CITY.test(x.text), 4),
      numbers,
      onthisday: await onThisDay(env)
    };
    memo.set("segs", { at: Date.now(), value: base });
  }
  const voiced = list => list.map(x => voices.has(x.t) ? { ...x, ...voices.get(x.t) } : x);
  return {
    ...base,
    soth: await (async () => { const h = memo.get("soth"); if (h && Date.now() - h.at < 60e3) return h.value; const v = await storyOfHour(env, avo).catch(() => null); memo.set("soth", { at: Date.now(), value: v }); return v; })(),
    kolkata10: voiced(base.kolkata10), world: voiced(base.world), bangladesh: voiced(base.bangladesh), sports: voiced(base.sports), city: voiced(base.city),
    entertainment: voiced(base.entertainment), lifestyle: voiced(base.lifestyle),
    score: s.score?.on && s.score.text ? s.score.text : "",
    notice: s.notice?.on && s.notice.text ? s.notice.text : ""
  };
}

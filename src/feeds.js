// Wire sources (publisher RSS) and fact extraction for the Rashtrix wire desk.
// Every source is public and keyless. Nothing is fabricated: a failed source is reported
// as unavailable and simply contributes no items.

const UA = "Mozilla/5.0 (compatible; RashtrixWire/1.0; +https://rashtrix.live)";

// Small per-isolate cache so bursts of visitors share one upstream fetch.
const memo = new Map();
export async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  memo.set(key, { value, expires: Date.now() + ttlMs });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return value;
}

/* ---------------- Text helpers ---------------- */

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", rupee: "₹" };
export function decodeEntities(s = "") {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
const stripTags = (s = "") => s.replace(/<[^>]*>/g, " ");
const squash = (s = "") => s.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
const cdata = (s = "") => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
export const plain = (s = "") => squash(decodeEntities(stripTags(cdata(s))));

// The desks. News is filed by place: Kolkata, the rest of West Bengal, India, Bengalis abroad
// (Probashi Bangali) and the world. Three desks are by subject wherever the story happened:
// Entertainment (বিনোদন), Sports (খেলা) and Lifestyle (জীবনধারা). Bengali, English and Hindi keywords.
export const PLACE_DESKS = ["Kolkata", "West Bengal", "India", "Probashi Bangali", "World"];
export const SUBJECT_DESKS = ["Entertainment", "Sports", "Lifestyle"];
export const DESKS = [...PLACE_DESKS, ...SUBJECT_DESKS];
// Only clear signals: a word that is also used in hard news ("serial", "travel ban", "goal") is left out.
const SPORTS = /\b(cricket|cricketer|football|footballer|ipl|isl|i-league|test match|odi|t20|world cup|olympics?|tennis|hockey|badminton|chess|wrestling|athletics|mohun bagan|east bengal (fc|club)|mohammedan sporting|fifa|bcci|virat kohli|rohit sharma|sourav ganguly|messi|ronaldo|grand prix|formula ?1|wicket|century|hat-?trick|durand cup|santosh trophy|ranji)\b|ক্রিকেট|ফুটবল|আইপিএল|আইএসএল|বিশ্বকাপ|অলিম্পিক|টেনিস|হকি|ব্যাডমিন্টন|দাবাড়ু|মোহনবাগান|ইস্টবেঙ্গল|মহমেডান স্পোর্টিং|টেস্ট ম্যাচ|উইকেট|সেঞ্চুরি|হ্যাটট্রিক|ডুরান্ড কাপ|সন্তোষ ট্রফি|রঞ্জি|সৌরভ গঙ্গোপাধ্যায়|বিরাট কোহলি|রোহিত শর্মা|মেসি|রোনাল্ডো|খেলোয়াড়|ক্রীড়া|क्रिकेट|फुटबॉल|खिलाड़ी|ओलंपिक/i;
const ENTERTAINMENT = /\b(bollywood|tollywood|box office|trailer|web series|ott release|netflix|amazon prime video|hotstar|film festival|kiff|movie|cinema|actor|actress|singer|concert|music video|album|oscars?|grammy|filmfare|national film award|shah rukh|salman khan|prosenjit|bigg boss|reality show)\b|সিনেমা|চলচ্চিত্র|ছবির শুটিং|ছবি মুক্তি|অভিনেতা|অভিনেত্রী|অভিনয়|টলিউড|বলিউড|ওয়েব সিরিজ|ধারাবাহিক|গায়ক|গায়িকা|সঙ্গীতশিল্পী|কনসার্ট|চিত্রপরিচালক|বক্স অফিস|ট্রেলার|প্রসেনজিৎ|শাহরুখ|চলচ্চিত্র উৎসব|রিয়্যালিটি শো|बॉलीवुड|फिल्म|अभिनेता|अभिनेत्री/i;
const LIFESTYLE = /\b(lifestyle|health tips|fitness|diet|recipes?|fashion|beauty tips|skincare|travel (guide|tips|destination)|tourist spots?|yoga|wellness|weight loss|parenting|horoscope|astrology)\b|জীবনধারা|লাইফস্টাইল|রেসিপি|রান্না|ফ্যাশন|ত্বকের যত্ন|চুলের যত্ন|রূপচর্চা|ভ্রমণ|বেড়াতে যান|ঘুরে আসুন|যোগাসন|শরীরচর্চা|ডায়েট|ওজন কমা|স্বাস্থ্য টিপস|প্যারেন্টিং|রাশিফল|হেঁশেল|ফ্যাটি লিভার|কোলেস্টেরল|ঘুমের সমস্যা|जीवनशैली|रेसिपी|फैशन|राशिफल/i;
// Politics, government, crime and science stay news on their place desk even when a film star
// or a holiday is in them ("BJP fields an actress", "threat to a singer", "IAS officers' travel").
const HARD_NEWS = /\b(bjp|tmc|trinamool|congress|cpi\(?m\)?|candidate|by-?election|assembly|lok sabha|rajya sabha|minister|ias|ips|police|arrest(ed)?|murder|threat|extortion|court|scientist|physicist|nobel)\b|বিজেপি|তৃণমূল|কংগ্রেস|সিপিএম|প্রার্থী|উপনির্বাচন|বিধানসভা|লোকসভা|রাজ্যসভা|মন্ত্রী|আইএএস|আইপিএস|পুলিশ|গ্রেফতার|খুন|হুমকি|তোলাবাজি|আদালত|রাজনৈতিক|বিজ্ঞানী|নোবেল/i;
// The subject desk a story belongs to, if any.
export function subjectDesk(text = "") {
  const t = String(text);
  if (SPORTS.test(t)) return "Sports";
  if (HARD_NEWS.test(t)) return null;
  if (ENTERTAINMENT.test(t)) return "Entertainment";
  if (LIFESTYLE.test(t)) return "Lifestyle";
  return null;
}
const KOLKATA = /\b(kolkata|calcutta|howrah|salt ?lake|bidhannagar|new ?town|rajarhat|lalbazar|nabanna|dum ?dum|behala|jadavpur|tollygunge|esplanade|sealdah|park street|kmc)\b|কলকাতা|কলিকাতা|হাওড়া|সল্টলেক|বিধাননগর|নিউটাউন|নিউ টাউন|রাজারহাট|লালবাজার|নবান্ন|দমদম|বেহালা|যাদবপুর|টালিগঞ্জ|ধর্মতলা|শিয়ালদহ|পার্ক স্ট্রিট|পুরসভা|कोलकाता|हावड़ा/i;
const BENGAL = /\b(west bengal|bengal|siliguri|darjeeling|durgapur|asansol|kharagpur|midnapore|medinipur|bardhaman|burdwan|nadia|murshidabad|malda|jalpaiguri|cooch ?behar|hooghly|birbhum|bankura|purulia|sundarbans?|digha|mamata|abhishek banerjee|suvendu|trinamool|tmc|calcutta high court)\b|পশ্চিমবঙ্গ|বঙ্গ|রাজ্য|শিলিগুড়ি|দার্জিলিং|দুর্গাপুর|আসানসোল|খড়্গপুর|মেদিনীপুর|বর্ধমান|নদিয়া|মুর্শিদাবাদ|মালদহ|জলপাইগুড়ি|কোচবিহার|হুগলি|বীরভূম|বাঁকুড়া|পুরুলিয়া|সুন্দরবন|দিঘা|মমতা|অভিষেক|শুভেন্দু|তৃণমূল|পুরভোট|पश्चिम बंगाल|बंगाल|ममता/i;
const PROBASHI = /\b(bengali diaspora|non-resident bengali|bengalis? (in|abroad|living)|probashi|bengali association|durga puja (in|at) (london|new york|delhi|mumbai|bengaluru|toronto|sydney|dubai))\b|প্রবাসী|প্রবাসে|বিদেশে বাঙালি|বাঙালি সংগঠন|ভিনরাজ্যে|পরিযায়ী শ্রমিক|প্রবাসী বাঙালি|प्रवासी बंगाली/i;
const INDIA = /\b(india|indian|delhi|new delhi|mumbai|chennai|bengaluru|hyderabad|modi|amit shah|rahul gandhi|lok sabha|rajya sabha|parliament|supreme court|centre|union government|bjp|congress|uttar pradesh|uttarakhand|himachal|punjab|haryana|rajasthan|madhya pradesh|chhattisgarh|telangana|andhra|goa|sikkim|manipur|meghalaya|mizoram|nagaland|arunachal|jammu|kashmir|ladakh|bihar|assam|odisha|jharkhand|tripura|maharashtra|gujarat|kerala|karnataka|tamil nadu|rbi|isro|sriharikota)\b|ভারত|দিল্লি|মোদী|অমিত শাহ|রাহুল গান্ধী|সংসদ|সুপ্রিম কোর্ট|কেন্দ্র|বিজেপি|কংগ্রেস|বিহার|অসম|ওড়িশা|ঝাড়খণ্ড|ত্রিপুরা|মুম্বই|উত্তরপ্রদেশ|উত্তরাখণ্ড|হিমাচল|পঞ্জাব|রাজস্থান|মণিপুর|কাশ্মীর|ইসরো|भारत|दिल्ली|मोदी|संसद|सुप्रीम कोर्ट|केंद्र|उत्तराखंड|उत्तर प्रदेश|बिहार|कश्मीर/i;
export function categorize(text = "") {
  const t = String(text);
  return subjectDesk(t) || placeDesk(t);
}
// The place desk alone.
export function placeDesk(text = "") {
  const t = String(text);
  if (PROBASHI.test(t)) return "Probashi Bangali";
  if (KOLKATA.test(t)) return "Kolkata";
  if (BENGAL.test(t)) return "West Bengal";
  if (INDIA.test(t)) return "India";
  return "World";
}
export const isDesk = d => DESKS.includes(d);
// The language a headline is written in, from its script.
export const scriptLang = t => /[\u0980-\u09FF]/.test(t) ? "bn" : /[\u0900-\u097F]/.test(t) ? "hi" : "en";

/* ---------------- Wire sources: RSS / Atom ---------------- */
// The approved outlets are kept in D1 (control room → Wire sources); nothing is hard-coded here.

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}
function attr(block, tagName, attrName) {
  const m = block.match(new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["']`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

export function parseFeed(xml, sourceName) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    const title = plain(tag(b, "title"));
    let link = plain(tag(b, "link"));
    if (!/^https?:/i.test(link)) link = attr(b, "link", "href");
    if (!/^https?:/i.test(link)) link = plain(tag(b, "guid"));
    const rawDate = plain(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    const time = Date.parse(rawDate);
    const desc = cdata(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded"));
    const image = attr(b, "media:content", "url") || attr(b, "media:thumbnail", "url")
      || (/<enclosure\b[^>]*type=["']image/i.test(b) ? attr(b, "enclosure", "url") : "")
      || (desc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? "");
    const summary = plain(desc).slice(0, 600);
    const encoded = cdata(tag(b, "content:encoded"));
    return {
      title, url: link, source: sourceName, guid: plain(tag(b, "guid")) || link,
      publishedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
      image: /^https?:\/\//.test(image) ? decodeEntities(image) : "",
      summary, html: encoded, author: plain(tag(b, "dc:creator")),
      tags: (b.match(/<category[^>]*>[\s\S]*?<\/category>/gi) || []).map(c => plain(c)).filter(Boolean).slice(0, 8),
      lang: scriptLang(title), category: categorize(`${title} ${summary}`)
    };
  }).filter(i => i.title && /^https?:\/\//i.test(i.url));
}

/* ---------------- Reader view ---------------- */

const BOILERPLATE = /(subscribe|sign up|sign in|log in|newsletter|cookie|all rights reserved|advertisement|follow us|download the app|click here|read more:|also read|recommended|©)/i;

export function safeArticleUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || raw.length > 2000) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return null;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return null; // bare IPv4 / IPv6
  return u;
}

// Pull readable text out of an HTML response with HTMLRewriter (no DOM in Workers).
export async function extractReadable(response) {
  const meta = {}, all = [], scoped = [];
  let cur = null, inArticle = 0, skip = 0, titleTag = "";
  const take = (t) => ({
    element(el) {
      if (skip) return;
      const block = { t, x: "" }, parent = cur, isScoped = inArticle > 0;
      cur = block;
      el.onEndTag(() => { all.push(block); if (isScoped) scoped.push(block); cur = parent; });
    }
  });
  let inTitle = false;
  const rewriter = new HTMLRewriter()
    .on("meta", { element(el) {
      const k = (el.getAttribute("property") || el.getAttribute("name") || "").toLowerCase();
      const v = el.getAttribute("content");
      if (k && v && !meta[k]) meta[k] = v;
    } })
    .on("title", { element(el) { inTitle = true; el.onEndTag(() => { inTitle = false; }); } })
    .on("article, [itemprop=articleBody], main", { element(el) { inArticle++; el.onEndTag(() => { inArticle--; }); } })
    .on("nav, footer, aside, form, figure, header, script, style, noscript, [aria-hidden=\"true\"]", { element(el) { skip++; el.onEndTag(() => { skip--; }); } })
    .on("p", take("p"))
    .on("h2, h3", take("h"))
    .on("li", take("li"))
    .onDocument({ text(t) { if (inTitle) titleTag += t.text; else if (cur && !skip) cur.x += t.text; } });
  await rewriter.transform(response).arrayBuffer();

  const clean = list => list.map(b => ({ t: b.t, x: squash(decodeEntities(b.x)) }))
    .filter(b => b.t === "h" ? b.x.length > 3 && b.x.length < 140 : b.x.length >= (b.t === "li" ? 25 : 40))
    .filter(b => !BOILERPLATE.test(b.x) || b.x.length > 220);
  const chars = l => l.filter(b => b.t === "p").reduce((n, b) => n + b.x.length, 0);
  let blocks = clean(scoped);
  if (chars(blocks) < 600) blocks = clean(all).filter(b => b.t !== "li");
  // Drop headings and list items that come before the first real paragraph (menus, teasers).
  const first = blocks.findIndex(b => b.t === "p");
  blocks = first > 0 ? blocks.slice(first) : blocks;

  return {
    title: squash(decodeEntities(meta["og:title"] || meta["twitter:title"] || titleTag)),
    site: squash(decodeEntities(meta["og:site_name"] || "")),
    image: meta["og:image"] || meta["twitter:image"] || "",
    byline: squash(decodeEntities(meta["author"] || meta["article:author"] || "")).replace(/^https?:\/\/\S+$/, ""),
    publishedAt: meta["article:published_time"] || meta["date"] || null,
    description: squash(decodeEntities(meta["og:description"] || meta["description"] || "")),
    robots: [meta["robots"], meta["googlebot"]].filter(Boolean).join(","),
    blocks: blocks.slice(0, 150),
    paragraphChars: chars(blocks)
  };
}

const READER_UA = "Mozilla/5.0 (compatible; RashtrixWire/1.0; +https://rashtrix.live)";
// The wire desk reads a source story for its facts only. The text is used to write a new report
// in our own words and is never shown to readers; it is capped and kept out of every API answer.
export async function sourceText(raw, { maxChars = 6000 } = {}) {
  const u = safeArticleUrl(raw);
  if (!u) return null;
  try {
    const response = await fetch(u.toString(), { redirect: "follow", signal: AbortSignal.timeout(9000), headers: { "user-agent": READER_UA, accept: "text/html,application/xhtml+xml" } });
    if (!response.ok || !/text\/html|xhtml/i.test(response.headers.get("content-type") || "")) return null;
    const page = await extractReadable(response);
    let text = "";
    for (const b of page.blocks.filter(x => x.t === "p")) { if (text.length + b.x.length > maxChars) break; text += b.x + "\n\n"; }
    return { title: page.title, description: page.description, publishedAt: page.publishedAt, text: text.trim(), robots: page.robots };
  } catch { return null; }
}

// Live wire (publisher RSS), reader-view extraction and market quotes for the Worker.
// Every source is public and keyless. Nothing is fabricated: a failed source is reported
// as unavailable and simply contributes no items.

const UA = "Mozilla/5.0 (compatible; RaisinaWire/1.0; +https://raisinawire.calibrex.org)";

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

export function categorize(text = "") {
  const t = text.toLowerCase();
  if (/\b(army|navy|air force|military|defen[cs]e|missile|drone|terror|militant|border|ceasefire|war|troops|security forces|insurgen|attack)\b/.test(t)) return "Security";
  if (/\b(sensex|nifty|stock|shares|market|rupee|inflation|rbi|gdp|trade|tariff|ipo|earnings|profit|economy|bank)\b/.test(t)) return "Markets";
  if (/\b(oil|crude|gas|lng|energy|power|coal|solar|refin)\w*/.test(t)) return "Energy";
  if (/\b(minister|summit|talks|diplomat|embassy|treaty|bilateral|foreign policy|un |united nations|g20|brics|quad|sco)\b/.test(t)) return "Diplomacy";
  if (/\b(india|indian|delhi|mumbai|kolkata|modi|lok sabha|parliament|state government)\b/.test(t)) return "India";
  // Hindi and Bengali headlines
  if (/सेना|सैन्य|मिसाइल|ड्रोन|आतंक|सीमा|हमला|युद्ध|সেনা|জঙ্গি|সীমান্ত|হামলা|ড্রোন|যুদ্ধ|ক্ষেপণাস্ত্র/.test(t)) return "Security";
  if (/सेंसेक्स|निफ्टी|शेयर|बाजार|रुपया|महंगाई|सেনসেক্স|শেয়ার|বাজার|টাকা|মূল্যবৃদ্ধি/.test(t)) return "Markets";
  if (/भारत|दिल्ली|मोदी|संसद|ভারত|দিল্লি|মোদী|কলকাতা|সংসদ/.test(t)) return "India";
  return "World";
}

/* ---------------- Live wire: RSS / Atom ---------------- */

export const WIRE_FEEDS = [
  { name: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { name: "The Hindu", url: "https://www.thehindu.com/news/international/feeder/default.rss" },
  { name: "Indian Express", url: "https://indianexpress.com/section/india/feed/" },
  { name: "NDTV", url: "https://feeds.feedburner.com/ndtvnews-world-news" },
  { name: "Mint", url: "https://www.livemint.com/rss/markets" },
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml" },
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Diplomat", url: "https://thediplomat.com/feed/" }
];

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
    const summary = plain(desc).slice(0, 280);
    return {
      title, url: link, source: sourceName,
      publishedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
      image: /^https?:\/\//.test(image) ? decodeEntities(image) : "",
      summary, category: categorize(`${title} ${summary}`)
    };
  }).filter(i => i.title && /^https?:\/\//i.test(i.url));
}

export function mergeWire(lists, now = Date.now()) {
  const seen = new Set(), items = [];
  for (const item of lists.flat()) {
    const key = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 90) || item.url;
    if (seen.has(key) || seen.has(item.url)) continue;
    seen.add(key); seen.add(item.url);
    const t = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    if (Number.isFinite(t) && now - t > 72 * 3600e3) continue;   // stale feed items
    if (Number.isFinite(t) && t - now > 3600e3) continue;          // dated in the future
    items.push(item);
  }
  items.sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  return items.slice(0, 120);
}

// Hindi and Bengali readers also get the news from publishers in their language.
export const LANG_FEEDS = {
  hi: [{ name: "BBC News हिन्दी", url: "https://feeds.bbci.co.uk/hindi/rss.xml" }],
  bn: [{ name: "BBC News বাংলা", url: "https://feeds.bbci.co.uk/bengali/rss.xml" }]
};

export async function liveWire(lang = "") {
  const results = await Promise.all([...(LANG_FEEDS[lang] || []), ...WIRE_FEEDS].map(async f => {
    try {
      const r = await fetch(f.url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: 120, cacheEverything: true } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = parseFeed(await r.text(), f.name);
      return { feed: f, ok: true, items };
    } catch (e) { return { feed: f, ok: false, items: [], error: String(e.message || e).slice(0, 80) }; }
  }));
  const items = mergeWire(results.map(r => r.items));
  return {
    updatedAt: new Date().toISOString(),
    sources: results.map(r => ({ name: r.feed.name, url: r.feed.url, ok: r.ok, count: r.items.length, error: r.error })),
    items
  };
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

const READER_UA = "Mozilla/5.0 (compatible; RaisinaWireReader/1.0; +https://raisinawire.calibrex.org/copyright)";
// The reader shows an excerpt, never the whole article: the opening paragraphs up to about
// 120 words, credited and linked, so readers go to the publisher for the full story.
export const EXCERPT_WORDS = 120;
export function excerptOf(blocks, maxWords, maxChars) {
  const out = []; let words = 0, chars = 0;
  for (const b of blocks.filter(x => x.t === "p")) {
    const w = b.x.split(/\s+/).length;
    if (words + w <= maxWords && chars + b.x.length <= maxChars) { out.push(b); words += w; chars += b.x.length; if (out.length >= 3) break; continue; }
    // Trim the next paragraph at a sentence end inside the limit.
    let text = "";
    for (const sentence of b.x.match(/[^.!?]+[.!?]+["’”)]*\s*/g) || []) {
      if ((words + (text + sentence).split(/\s+/).length) > maxWords || chars + (text + sentence).length > maxChars) break;
      text += sentence;
    }
    if (text.trim()) out.push({ t: "p", x: text.trim() });
    break;
  }
  return out;
}
// Publisher signals: nosnippet / noarchive / none mean no excerpt; max-snippet caps its length.
export function snippetLimit(robots) {
  const r = String(robots || "").toLowerCase();
  if (/\b(nosnippet|noarchive|none)\b/.test(r)) return 0;
  const m = r.match(/max-snippet\s*:\s*(-?\d+)/);
  return m && Number(m[1]) >= 0 ? Number(m[1]) : Infinity;
}

export async function readArticle(raw, { optOut = [] } = {}) {
  const u = safeArticleUrl(raw);
  if (!u) return { ok: false, blocked: true, reason: "invalid-url" };
  let response;
  try {
    response = await fetch(u.toString(), {
      redirect: "follow", signal: AbortSignal.timeout(9000),
      // An honest user agent, so publishers can recognise and block the reader if they wish.
      headers: { "user-agent": READER_UA, accept: "text/html,application/xhtml+xml" }
    });
  } catch (e) { return { ok: false, blocked: true, reason: "unreachable", url: u.toString() }; }
  const finalUrl = response.url || u.toString();
  if (!response.ok) return { ok: false, blocked: true, reason: `http-${response.status}`, url: finalUrl };
  if (!/text\/html|xhtml/i.test(response.headers.get("content-type") || "")) return { ok: false, blocked: true, reason: "not-html", url: finalUrl };
  const host = new URL(finalUrl).hostname.replace(/^www\./, "");
  const page = await extractReadable(response);
  const site = page.site || host;
  const limit = optOut.some(d => host === d || host.endsWith("." + d)) ? 0 : snippetLimit(page.robots);
  const excerpt = limit === 0 ? [] : excerptOf(page.blocks, EXCERPT_WORDS, Math.min(limit, 900));
  const totalWords = page.blocks.filter(b => b.t === "p").reduce((n, b) => n + b.x.split(/\s+/).length, 0);
  // Never return more than the excerpt: the full text stays with the publisher.
  const base = { url: finalUrl, title: page.title, site, image: page.image, byline: page.byline, publishedAt: page.publishedAt, description: page.description };
  if (!excerpt.length) return { ok: false, blocked: true, reason: limit === 0 ? "publisher-limits" : "no-readable-text", ...base };
  return { ok: true, excerpt: true, ...base, blocks: excerpt, totalWords, readMinutes: Math.max(1, Math.round(totalWords / 220)) };
}

/* ---------------- Markets ---------------- */

export const MARKET_GROUPS = [
  { id: "india", name: "India", items: [["NIFTY 50", "^NSEI"], ["SENSEX", "^BSESN"], ["BANK NIFTY", "^NSEBANK"], ["NIFTY IT", "^CNXIT"], ["India VIX", "^INDIAVIX"]] },
  { id: "stocks", name: "India stocks", items: [["Reliance", "RELIANCE.NS"], ["TCS", "TCS.NS"], ["HDFC Bank", "HDFCBANK.NS"], ["Infosys", "INFY.NS"], ["ICICI Bank", "ICICIBANK.NS"], ["Adani Ports", "ADANIPORTS.NS"]] },
  { id: "defence", name: "Defence", items: [["HAL", "HAL.NS"], ["BEL", "BEL.NS"], ["Mazagon Dock", "MAZDOCK.NS"], ["Bharat Dynamics", "BDL.NS"], ["Cochin Shipyard", "COCHINSHIP.NS"]] },
  { id: "global", name: "Global", items: [["S&P 500", "^GSPC"], ["Nasdaq", "^IXIC"], ["Dow Jones", "^DJI"], ["FTSE 100", "^FTSE"], ["Nikkei 225", "^N225"], ["Hang Seng", "^HSI"], ["Shanghai", "000001.SS"]] },
  { id: "fx", name: "Currencies", items: [["USD/INR", "USDINR=X"], ["EUR/INR", "EURINR=X"], ["GBP/INR", "GBPINR=X"], ["JPY/INR", "JPYINR=X"], ["Dollar index", "DX-Y.NYB"]] },
  { id: "commodities", name: "Commodities", items: [["Brent crude", "BZ=F"], ["WTI crude", "CL=F"], ["Gold", "GC=F"], ["Silver", "SI=F"], ["Natural gas", "NG=F"], ["Copper", "HG=F"]] },
  { id: "bonds", name: "Bonds", items: [["US 5Y yield", "^FVX"], ["US 10Y yield", "^TNX"], ["US 30Y yield", "^TYX"]] },
  { id: "crypto", name: "Crypto", items: [["Bitcoin", "BTC-USD"], ["Ether", "ETH-USD"]] }
];
export const OVERVIEW = ["^NSEI", "^BSESN", "^GSPC", "USDINR=X", "BZ=F", "GC=F", "^TNX", "BTC-USD"];

export function quoteFromChart(payload, label, symbol) {
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(payload?.chart?.error?.description || "No chart data");
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => Number.isFinite(Number(v)) && v !== null).map(Number);
  const value = Number(meta.regularMarketPrice ?? closes.at(-1));
  if (!Number.isFinite(value)) throw new Error("No valid price");
  const previous = Number(meta.chartPreviousClose ?? meta.previousClose);
  const change = Number.isFinite(previous) ? value - previous : null;
  const step = Math.max(1, Math.ceil(closes.length / 32));
  const spark = closes.filter((_, i) => i % step === 0 || i === closes.length - 1);
  const stamp = Number(meta.regularMarketTime);
  return {
    label, symbol, value, previous: Number.isFinite(previous) ? previous : null, change,
    changePct: Number.isFinite(previous) && previous ? change / previous * 100 : null,
    currency: meta.currency || "", spark,
    date: Number.isFinite(stamp) ? new Date(stamp * 1000).toISOString() : null,
    marketState: meta.marketState || null, status: "ok"
  };
}

async function quote([label, symbol], i) {
  const host = i % 2 ? "query2" : "query1";
  try {
    const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`, {
      headers: { "user-agent": UA }, signal: AbortSignal.timeout(7000), cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return quoteFromChart(await r.json(), label, symbol);
  } catch (e) {
    return { label, symbol, value: null, change: null, changePct: null, spark: [], status: "unavailable", detail: String(e.message || e).slice(0, 80) };
  }
}

export async function marketBoard() {
  const flat = MARKET_GROUPS.flatMap(g => g.items);
  const quotes = await Promise.all(flat.map(quote));
  const bySymbol = Object.fromEntries(quotes.map(q => [q.symbol, q]));
  return {
    updatedAt: new Date().toISOString(),
    source: "Yahoo Finance public chart data",
    note: "Delayed or last available quotes from public feeds. Not investment advice. Unavailable quotes are shown as unavailable, never estimated.",
    overview: OVERVIEW.map(s => bySymbol[s]),
    groups: MARKET_GROUPS.map(g => ({ id: g.id, name: g.name, items: g.items.map(([, s]) => bySymbol[s]) }))
  };
}

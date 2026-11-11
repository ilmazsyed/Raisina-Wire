// The TV's market update (30 seconds after each weather briefing): Nifty 50 and Sensex, the
// day's top three gainers and losers among the Nifty 50, crude oil, gold and silver, and the
// rupee against the dollar, pound and euro. From Yahoo Finance's public chart data (delayed or
// last available; nothing is estimated), fetched by the minute cron every ten minutes while the
// Indian market is open and every hour otherwise, kept in settings ("market_brief").
const UA = "Mozilla/5.0 (compatible; RashtrixTV/1.0; +https://rashtrix.ilmazsyed.workers.dev)";
// The Nifty 50, with each company's short name in English and Bengali.
const NIFTY50 = [
  ["ADANIENT", "Adani Ent", "আদানি এন্টারপ্রাইজ"], ["ADANIPORTS", "Adani Ports", "আদানি পোর্টস"], ["APOLLOHOSP", "Apollo Hospitals", "অ্যাপোলো হাসপাতাল"],
  ["ASIANPAINT", "Asian Paints", "এশিয়ান পেন্টস"], ["AXISBANK", "Axis Bank", "অ্যাক্সিস ব্যাঙ্ক"], ["BAJAJ-AUTO", "Bajaj Auto", "বজাজ অটো"],
  ["BAJFINANCE", "Bajaj Finance", "বজাজ ফিনান্স"], ["BAJAJFINSV", "Bajaj Finserv", "বজাজ ফিনসার্ভ"], ["BEL", "BEL", "বিইএল"],
  ["BHARTIARTL", "Bharti Airtel", "ভারতী এয়ারটেল"], ["CIPLA", "Cipla", "সিপলা"], ["COALINDIA", "Coal India", "কোল ইন্ডিয়া"],
  ["DRREDDY", "Dr Reddy's", "ডক্টর রেড্ডিজ"], ["EICHERMOT", "Eicher Motors", "আইশার মোটরস"], ["ETERNAL", "Eternal", "ইটারনাল"],
  ["GRASIM", "Grasim", "গ্রাসিম"], ["HCLTECH", "HCL Tech", "এইচসিএল টেক"], ["HDFCBANK", "HDFC Bank", "এইচডিএফসি ব্যাঙ্ক"],
  ["HDFCLIFE", "HDFC Life", "এইচডিএফসি লাইফ"], ["HEROMOTOCO", "Hero MotoCorp", "হিরো মোটোকর্প"], ["HINDALCO", "Hindalco", "হিন্ডালকো"],
  ["HINDUNILVR", "HUL", "হিন্দুস্তান ইউনিলিভার"], ["ICICIBANK", "ICICI Bank", "আইসিআইসিআই ব্যাঙ্ক"], ["INDUSINDBK", "IndusInd Bank", "ইন্ডাসইন্ড ব্যাঙ্ক"],
  ["INFY", "Infosys", "ইনফোসিস"], ["ITC", "ITC", "আইটিসি"], ["JIOFIN", "Jio Financial", "জিও ফিনান্সিয়াল"],
  ["JSWSTEEL", "JSW Steel", "জেএসডব্লিউ স্টিল"], ["KOTAKBANK", "Kotak Bank", "কোটাক ব্যাঙ্ক"], ["LT", "L&T", "এলঅ্যান্ডটি"],
  ["M&M", "M&M", "মাহিন্দ্রা"], ["MARUTI", "Maruti Suzuki", "মারুতি সুজুকি"], ["NESTLEIND", "Nestle India", "নেসলে ইন্ডিয়া"],
  ["NTPC", "NTPC", "এনটিপিসি"], ["ONGC", "ONGC", "ওএনজিসি"], ["POWERGRID", "Power Grid", "পাওয়ার গ্রিড"],
  ["RELIANCE", "Reliance", "রিলায়েন্স"], ["SBILIFE", "SBI Life", "এসবিআই লাইফ"], ["SBIN", "SBI", "এসবিআই"],
  ["SHRIRAMFIN", "Shriram Finance", "শ্রীরাম ফিনান্স"], ["SUNPHARMA", "Sun Pharma", "সান ফার্মা"], ["TATACONSUM", "Tata Consumer", "টাটা কনজিউমার"],
  ["TMPV", "Tata Motors", "টাটা মোটরস"], ["TATASTEEL", "Tata Steel", "টাটা স্টিল"], ["TCS", "TCS", "টিসিএস"],
  ["TECHM", "Tech Mahindra", "টেক মাহিন্দ্রা"], ["TITAN", "Titan", "টাইটান"], ["TRENT", "Trent", "ট্রেন্ট"],
  ["ULTRACEMCO", "UltraTech Cement", "আলট্রাটেক সিমেন্ট"], ["WIPRO", "Wipro", "উইপ্রো"]
];
const OTHERS = {
  nifty: ["^NSEI", "Nifty 50", "নিফটি ৫০"], sensex: ["^BSESN", "Sensex", "সেনসেক্স"],
  crude: ["BZ=F", "Crude oil (Brent)", "অপরিশোধিত তেল"], gold: ["GC=F", "Gold", "সোনা"], silver: ["SI=F", "Silver", "রুপো"],
  usd: ["USDINR=X", "US Dollar", "ডলার"], gbp: ["GBPINR=X", "British Pound", "পাউন্ড"], eur: ["EURINR=X", "Euro", "ইউরো"]
};
// One symbol's latest price and its change on the previous close. Indices use the day's 15-minute
// chart (for the sparkline, against the chart's previous close); everything else the last five
// daily bars, so the change is against the previous day's close (the one-day chart gives the
// currencies no previous close and showed them flat at 0.00%).
async function chart(symbol, i, interval = "1d") {
  const range = interval === "1d" ? "5d" : "1d";
  for (const host of i % 2 ? ["query2", "query1"] : ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(7000), cf: { cacheTtl: 60, cacheEverything: true } });
      if (!r.ok) continue;
      const res = (await r.json())?.chart?.result?.[0], m = res?.meta || {};
      const value = Number(m.regularMarketPrice);
      if (!Number.isFinite(value)) continue;
      const closes = (res.indicators?.quote?.[0]?.close || []).filter(v => v !== null && Number.isFinite(Number(v))).map(Number);
      // The previous close: the last daily bar from a day before the latest price's day.
      let prev = Number(m.chartPreviousClose ?? m.previousClose);
      if (interval === "1d") {
        const off = Number(m.gmtoffset) || 0, day = t => Math.floor((t + off) / 86400), today = day(Number(m.regularMarketTime) || Date.now() / 1000);
        const ts = res.timestamp || [], cl = res.indicators?.quote?.[0]?.close || [];
        prev = NaN;
        for (let k = ts.length - 1; k >= 0; k--) if (cl[k] != null && Number.isFinite(Number(cl[k])) && day(ts[k]) < today) { prev = Number(cl[k]); break; }
      }
      if (!Number.isFinite(prev)) prev = Number(m.previousClose ?? m.chartPreviousClose);
      const ok = Number.isFinite(prev) && prev;
      return { value, prev: ok ? prev : null, change: ok ? value - prev : null, pct: ok ? (value - prev) / prev * 100 : null, state: m.marketState || "", spark: closes.slice(-40) };
    } catch { /* the other host */ }
  }
  return null;
}
// Many symbols, a few at a time (Yahoo turns away fifty requests at once).
async function charts(symbols, size = 8) {
  const out = [];
  for (let i = 0; i < symbols.length; i += size) out.push(...await Promise.all(symbols.slice(i, i + size).map((s, j) => chart(s, i + j))));
  return out;
}
const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const marketHours = () => { const d = istNow(), day = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return day >= 1 && day <= 5 && m >= 9 * 60 && m <= 16 * 60; };
const round = (n, d = 2) => n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

const OZ = 31.1035;
function inRupees(b) {
  const usd = b?.usd?.value;
  if (!usd) return b;
  if (b.gold && b.gold.inr == null) Object.assign(b.gold, { inr: Math.round(b.gold.value * usd / OZ * 10), inrUnitEn: "per 10 g", inrUnitBn: "প্রতি ১০ গ্রাম" });
  if (b.silver && b.silver.inr == null) Object.assign(b.silver, { inr: Math.round(b.silver.value * usd / OZ * 1000), inrUnitEn: "per kg", inrUnitBn: "প্রতি কেজি" });
  if (b.crude && b.crude.inr == null) Object.assign(b.crude, { inr: Math.round(b.crude.value * usd), inrUnitEn: "per barrel", inrUnitBn: "প্রতি ব্যারেল" });
  return b;
}

export async function marketBrief(env, { force = false } = {}) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='market_brief'").first().catch(() => null);
  let have = null; try { have = row ? JSON.parse(row.value) : null; } catch { /* refetch */ }
  const age = have ? Date.now() - have.at : Infinity;
  // A brief from before the ticker (no list of stocks) is refreshed at once.
  if (!force && have?.all?.length && age < (marketHours() ? 10 : 60) * 60e3) return have;
  if (!force && have && !have.all?.length && age < 5 * 60e3) return have;
  const keys = Object.keys(OTHERS);
  const [others, stocks] = await Promise.all([
    Promise.all(keys.map((k, i) => chart(OTHERS[k][0], i, k === "nifty" || k === "sensex" ? "15m" : "1d"))),
    charts(NIFTY50.map(([s]) => `${s}.NS`))
  ]);
  const pick = {};
  keys.forEach((k, i) => { const q = others[i]; pick[k] = q ? { en: OTHERS[k][1], bn: OTHERS[k][2], value: round(q.value), change: round(q.change), pct: round(q.pct), state: q.state, ...(k === "nifty" || k === "sensex" ? { spark: q.spark.map(v => round(v, 1)) } : {}) } : null; });
  // Commodities in rupees, in Indian units: gold per 10 grams, silver per kilogram, crude per
  // barrel (the international price at today's rupee rate; Indian duties and taxes not included).
  inRupees(pick);
  const moved = NIFTY50.map(([s, en, bn], i) => stocks[i] && stocks[i].pct != null ? { en, bn, value: round(stocks[i].value), change: round(stocks[i].change), pct: round(stocks[i].pct) } : null).filter(Boolean).sort((a, b) => b.pct - a.pct);
  // Every Nifty 50 stock, for the market ticker (in index order, compact).
  const all = NIFTY50.map(([, en], i) => stocks[i] && stocks[i].pct != null ? [en, round(stocks[i].value), round(stocks[i].pct)] : null).filter(Boolean);
  // A failed round of stock prices keeps the last good list rather than emptying the ticker.
  const keep = !moved.length && have?.all?.length;
  const out = { at: Date.now(), open: marketHours(), ...pick, gainers: keep ? have.gainers : moved.slice(0, 3), losers: keep ? have.losers : moved.slice(-3).reverse(), all: keep ? have.all : all };
  // Only a brief with the indices in it replaces the last good one.
  if (out.nifty || out.sensex) {
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('market_brief',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(out)).run();
    return out;
  }
  return have;
}
// What the screens get (read only; the cron refreshes it).
export async function marketForScreens(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='market_brief'").first().catch(() => null);
  try { return row ? inRupees(JSON.parse(row.value)) : null; } catch { return null; }
}

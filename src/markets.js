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
async function chart(symbol, i, interval = "1d") {
  const host = i % 2 ? "query2" : "query1";
  try {
    const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=${interval}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(7000), cf: { cacheTtl: 60, cacheEverything: true } });
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0], m = res?.meta || {};
    const value = Number(m.regularMarketPrice), prev = Number(m.chartPreviousClose ?? m.previousClose);
    if (!Number.isFinite(value)) return null;
    const closes = (res.indicators?.quote?.[0]?.close || []).filter(v => Number.isFinite(Number(v)) && v !== null).map(Number);
    return { value, prev: Number.isFinite(prev) ? prev : null, change: Number.isFinite(prev) ? value - prev : null, pct: Number.isFinite(prev) && prev ? (value - prev) / prev * 100 : null, state: m.marketState || "", spark: closes.slice(-40) };
  } catch { return null; }
}
const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const marketHours = () => { const d = istNow(), day = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return day >= 1 && day <= 5 && m >= 9 * 60 && m <= 16 * 60; };
const round = (n, d = 2) => n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

export async function marketBrief(env, { force = false } = {}) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='market_brief'").first().catch(() => null);
  let have = null; try { have = row ? JSON.parse(row.value) : null; } catch { /* refetch */ }
  const age = have ? Date.now() - have.at : Infinity;
  if (!force && age < (marketHours() ? 10 : 60) * 60e3) return have;
  const keys = Object.keys(OTHERS);
  const [others, stocks] = await Promise.all([
    Promise.all(keys.map((k, i) => chart(OTHERS[k][0], i, k === "nifty" || k === "sensex" ? "15m" : "1d"))),
    Promise.all(NIFTY50.map(([s], i) => chart(`${s}.NS`, i)))
  ]);
  const pick = {};
  keys.forEach((k, i) => { const q = others[i]; pick[k] = q ? { en: OTHERS[k][1], bn: OTHERS[k][2], value: round(q.value), change: round(q.change), pct: round(q.pct), state: q.state, ...(k === "nifty" || k === "sensex" ? { spark: q.spark.map(v => round(v, 1)) } : {}) } : null; });
  // Commodities in rupees, in Indian units: gold per 10 grams, silver per kilogram, crude per
  // barrel (the international price at today's rupee rate; Indian duties and taxes not included).
  const usd = pick.usd?.value, OZ = 31.1035;
  if (usd) {
    if (pick.gold) Object.assign(pick.gold, { inr: Math.round(pick.gold.value * usd / OZ * 10), inrUnitEn: "per 10 g", inrUnitBn: "প্রতি ১০ গ্রাম" });
    if (pick.silver) Object.assign(pick.silver, { inr: Math.round(pick.silver.value * usd / OZ * 1000), inrUnitEn: "per kg", inrUnitBn: "প্রতি কেজি" });
    if (pick.crude) Object.assign(pick.crude, { inr: Math.round(pick.crude.value * usd), inrUnitEn: "per barrel", inrUnitBn: "প্রতি ব্যারেল" });
  }
  const moved = NIFTY50.map(([s, en, bn], i) => stocks[i] && stocks[i].pct != null ? { en, bn, value: round(stocks[i].value), change: round(stocks[i].change), pct: round(stocks[i].pct) } : null).filter(Boolean).sort((a, b) => b.pct - a.pct);
  const out = { at: Date.now(), open: marketHours(), ...pick, gainers: moved.slice(0, 3), losers: moved.slice(-3).reverse() };
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
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}

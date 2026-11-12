// The owner's Desk Brief: five times a day (11:00, 14:00, 17:00, 19:00 and 21:00, India time) the
// owner gets the channel's major news as a push notification on their own devices and on Telegram:
// West Bengal politics (with Kolkata's), India's politics, the world, and the big developing
// stories. Fifteen minutes before each brief a draft is ready in the app (/mybrief) for the owner
// to pick from; if they have not picked by the brief's time it goes out as the desk chose. Between
// briefs, a big story (one on the owner's follow list, or a major political or world story many
// outlets carry) comes at once. Only the owner (ADMIN_EMAIL) gets any of this.
//
// Telegram (optional, free): a bot made with @BotFather; its token as the Worker secret
// TELEGRAM_BOT_TOKEN; the owner connects their chat from /mybrief (a one-time code).
import { sendPush } from "./push.js";
import { bulletinRank, deskKey } from "./labels.js";

export const BRIEF_HOURS = [11, 14, 17, 19, 21];
const IST = 5.5 * 3600e3;
const DEFAULT_RULES = { counts: { wb: 3, in: 3, world: 3, dev: 4 }, follow: [], mute: [] };
const SECTIONS = { wb: "পশ্চিমবঙ্গের রাজনীতি", in: "দেশের রাজনীতি", world: "বিশ্ব", dev: "যে খবর এগোচ্ছে" };
const get = async (env, key, d) => { const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first().catch(() => null); try { return r ? JSON.parse(r.value) : d; } catch { return d; } };
const put = (env, key, v) => env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, JSON.stringify(v)).run();
const bn = n => String(n).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
const part = h => h < 12 ? "সকাল" : h < 16 ? "দুপুর" : h < 18 ? "বিকেল" : h < 20 ? "সন্ধ্যা" : "রাত";
const tta = n => n === 2 ? "টো" : n === 3 || n === 4 ? "টে" : "টা";
export const slotLabel = h => `${part(h)} ${bn(h % 12 || 12)}${tta(h % 12 || 12)}`;
const esc = s => String(s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const site = env => String(env.SITE_URL || "https://rashtrix.ilmazsyed.workers.dev").replace(/\/$/, "");

export async function briefRules(env) {
  const r = await get(env, "brief:rules", {});
  const c = { ...DEFAULT_RULES.counts, ...(r.counts || {}) };
  for (const k of Object.keys(c)) c[k] = Math.max(0, Math.min(8, Number(c[k]) || 0));
  const words = v => (Array.isArray(v) ? v : String(v || "").split(/[,\n]/)).map(x => String(x).trim()).filter(Boolean).slice(0, 40);
  return { counts: c, follow: words(r.follow), mute: words(r.mute) };
}
export async function saveBriefRules(env, b) {
  const words = v => (Array.isArray(v) ? v : String(v || "").split(/[,\n]/)).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 40);
  const r = { counts: Object.fromEntries(Object.keys(DEFAULT_RULES.counts).map(k => [k, Math.max(0, Math.min(8, Number.isFinite(Number(b?.counts?.[k])) && b?.counts?.[k] !== "" ? Number(b.counts[k]) : DEFAULT_RULES.counts[k]))])), follow: words(b?.follow), mute: words(b?.mute) };
  await put(env, "brief:rules", r);
  return r;
}

// The stories of the window, each with its section, outlets and whether it moved on since.
async function candidates(env, since) {
  const { results } = await env.DB.prepare(`SELECT a.id, a.slug, a.title, a.dek, a.category, a.published_at, a.updated_at, COALESCE(MAX(j.sources),1) AS sources
    FROM articles a LEFT JOIN wire_jobs j ON j.article_id=a.id
    WHERE a.status='published' AND a.lang='bn' AND a.pulled_at IS NULL AND (a.published_at>=? OR a.updated_at>=?)
    GROUP BY a.id ORDER BY a.published_at DESC LIMIT 200`).bind(since, since).all().catch(() => ({ results: [] }));
  return results.map(r => {
    const text = `${r.title} ${r.dek || ""}`, pri = bulletinRank(r.category, text), dk = deskKey(r.category, text);
    const moved = r.updated_at && Date.parse(r.updated_at) - Date.parse(r.published_at) > 10 * 60e3 && r.updated_at >= since;
    return { id: r.id, slug: r.slug, title: r.title, desk: r.category, pri, dk, sources: r.sources || 1, at: r.published_at, moved: !!moved, text };
  });
}
// The desk's choice: the follow list first in its section, then by outlets and freshness.
export async function autoBrief(env, since) {
  // Only what is new since the last brief: a story already sent comes again only when it moved on.
  const last = new Set(((await get(env, "brief:sent", []))[0]?.items || []).map(x => x.id));
  const rules = await briefRules(env), all = (await candidates(env, since)).filter(x => !rules.mute.some(w => x.text.includes(w)) && (!last.has(x.id) || x.moved));
  const follows = x => rules.follow.some(w => x.text.includes(w));
  const score = x => (follows(x) ? 100 : 0) + x.sources * 3 + (x.moved ? 4 : 0) + (Date.parse(x.at) || 0) / 3.6e9;
  const by = f => all.filter(f).sort((a, b) => score(b) - score(a));
  const used = new Set(), take = (list, n, sec) => list.filter(x => !used.has(x.id)).slice(0, n).map(x => (used.add(x.id), { ...x, sec }));
  const items = [
    ...take(by(x => x.pri === 0 || x.pri === 1), rules.counts.wb, "wb"),
    ...take(by(x => x.pri === 2), rules.counts.in, "in"),
    ...take(by(x => x.dk === "world" || x.dk === "bangladesh"), rules.counts.world, "world"),
    ...take(by(x => (x.sources >= 3 || x.moved || follows(x)) && x.pri <= 6), rules.counts.dev, "dev")
  ];
  return items.map(({ text, ...x }) => x);
}

// The owner's devices, and Telegram.
async function ownerUser(env) {
  const email = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  return email ? env.DB.prepare("SELECT id FROM users WHERE lower(email)=? AND role='admin'").bind(email).first().catch(() => null) : null;
}
export async function ownerPush(env, { title, body = "", url = "/mybrief" }) {
  await put(env, "owner_alert", { title: String(title).slice(0, 140), body: String(body).slice(0, 240), url, at: new Date().toISOString() });
  const u = await ownerUser(env); if (!u) return 0;
  const { results } = await env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE user_id=? LIMIT 10").bind(u.id).all().catch(() => ({ results: [] }));
  const subject = env.SITE_URL || "mailto:alerts@rashtrix.invalid";
  const out = await Promise.all(results.map(s => sendPush(env, s.endpoint, subject)));
  return out.filter(x => x === "ok").length;
}
const tg = (env, method, body) => fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null);
export async function ownerTelegram(env, html) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const chat = await get(env, "tg:chat", null); if (!chat?.id) return false;
  const r = await tg(env, "sendMessage", { chat_id: chat.id, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true });
  return !!r?.ok;
}
// Connecting Telegram: a one-time code; the bot's link; the webhook records the owner's chat.
export async function telegramConnect(env, origin) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ready: false };
  const me = await tg(env, "getMe", {}); if (!me?.ok) return { ready: false, error: "The Telegram bot token was not accepted." };
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16), secret = await hookSecret(env);
  await put(env, "tg:code", { code, at: Date.now() });
  await tg(env, "setWebhook", { url: `${origin}/api/telegram/hook`, secret_token: secret, allowed_updates: ["message"] });
  return { ready: true, link: `https://t.me/${me.result.username}?start=${code}`, bot: me.result.username };
}
async function hookSecret(env) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rashtrix-tg|${env.TELEGRAM_BOT_TOKEN}`));
  return [...new Uint8Array(d)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function telegramHook(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN || request.headers.get("x-telegram-bot-api-secret-token") !== await hookSecret(env)) return new Response("no", { status: 403 });
  const u = await request.json().catch(() => null), m = u?.message, text = String(m?.text || "");
  const pending = await get(env, "tg:code", null), code = text.match(/^\/start\s+(\w+)/)?.[1];
  if (code && pending && code === pending.code && Date.now() - pending.at < 30 * 60e3) {
    await put(env, "tg:chat", { id: m.chat.id, name: m.chat.first_name || m.chat.username || "", at: new Date().toISOString() });
    await put(env, "tg:code", null);
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: "রাষ্ট্রিক্স ডেস্ক ব্রিফ এখানে আসবে: সকাল ১১টা, দুপুর ২টো, বিকেল ৫টা, সন্ধ্যা ৭টা আর রাত ৯টা। বড় খবর এলে সঙ্গে সঙ্গে।" });
  }
  return new Response("ok");
}

// The brief as Telegram reads it, and as the push says it.
function briefText(env, slotH, items, mode) {
  const lines = [`<b>রাষ্ট্রিক্স ডেস্ক ব্রিফ · ${slotLabel(slotH)}</b>${mode === "picked" ? " · আপনার বাছাই" : ""}`];
  for (const sec of Object.keys(SECTIONS)) {
    const xs = items.filter(x => x.sec === sec); if (!xs.length) continue;
    lines.push("", `<b>${SECTIONS[sec]}</b>`);
    for (const x of xs) lines.push(`• <a href="${site(env)}/article/${encodeURIComponent(x.slug)}">${esc(x.title)}</a>${x.moved ? " <i>(নতুন তথ্য)</i>" : ""}${x.sources >= 3 ? ` · ${bn(x.sources)}টি সূত্র` : ""}`);
  }
  if (lines.length === 1) lines.push("", "এই সময়ে নতুন বড় খবর নেই।");
  lines.push("", `<a href="${site(env)}/mybrief">অ্যাপে ব্রিফ খুলুন</a>`);
  return lines.join("\n");
}

// Each minute (the Worker's cron): the draft fifteen minutes before a brief, the brief at its time,
// and big stories in between.
export async function briefStep(env, nowMs = Date.now()) {
  const ist = new Date(nowMs + IST), dayStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST;
  const sent = await get(env, "brief:sent", []), draft = await get(env, "brief:draft", null);
  for (const h of BRIEF_HOURS) {
    const at = dayStart + h * 3600e3, slot = new Date(at).toISOString();
    if (nowMs >= at - 15 * 60e3 && nowMs < at && !(draft?.slot === slot && draft.built)) {
      const since = new Date(Math.max(at - 6 * 3600e3, Date.parse(sent[0]?.at || 0) || 0)).toISOString();
      // (stories the owner already added to this brief from the app stay, picked)
      const mine = draft?.slot === slot ? draft : null, auto = await autoBrief(env, since);
      const kept = (mine?.items || []).filter(x => mine.picks.includes(x.id)), ids = new Set(kept.map(x => x.id));
      const items = [...kept, ...auto.filter(x => !ids.has(x.id))];
      await put(env, "brief:draft", { slot, h, since, at: new Date(nowMs).toISOString(), items, picks: mine?.picks || [], confirmed: !!mine?.confirmed, built: true });
      await ownerPush(env, { title: `${slotLabel(h)}র ব্রিফ তৈরি`, body: `১৫ মিনিটের মধ্যে বেছে নিন, নইলে ডেস্কের বাছাই যাবে। ${items[0]?.title || ""}`, url: "/mybrief" });
      await ownerTelegram(env, `<b>${slotLabel(h)}র ব্রিফ তৈরি</b>\n১৫ মিনিটের মধ্যে অ্যাপে বেছে নিন, নইলে ডেস্কের বাছাই পাঠানো হবে।\n<a href="${site(env)}/mybrief">বাছাই করুন</a>`);
      return { draft: slot };
    }
    if (nowMs >= at && nowMs < at + 20 * 60e3 && !sent.some(s => s.slot === slot)) {
      await sendBrief(env, at, h, draft?.slot === slot ? draft : null);
      return { sent: slot };
    }
  }
  return bigStories(env, nowMs, dayStart);
}
// The brief: the owner's picks when they confirmed them; their picks first then the desk's when
// they picked without confirming; the desk's choice (made again now, fresher) when they did not.
export async function sendBrief(env, atMs, h, draft) {
  const sent = await get(env, "brief:sent", []);
  const since = draft?.since || new Date(Math.max(atMs - 6 * 3600e3, Date.parse(sent[0]?.at || 0) || 0)).toISOString();
  const fresh = await autoBrief(env, since);
  const pool = new Map([...(draft?.items || []), ...fresh].map(x => [x.id, x]));
  const picked = (draft?.picks || []).map(id => pool.get(id)).filter(Boolean);
  let items, mode;
  if (draft?.confirmed && picked.length) { items = picked; mode = "picked"; }
  else if (picked.length) { const ids = new Set(picked.map(x => x.id)); items = [...picked, ...fresh.filter(x => !ids.has(x.id))]; mode = "mixed"; }
  else { items = fresh; mode = "auto"; }
  const slot = new Date(atMs).toISOString();
  await put(env, "brief:sent", [{ slot, h, at: new Date().toISOString(), mode, items }, ...sent].slice(0, 15));
  const top = items.slice(0, 2).map(x => x.title).join(" · ");
  await ownerPush(env, { title: `রাষ্ট্রিক্স ডেস্ক ব্রিফ · ${slotLabel(h)}`, body: top || "এই সময়ে নতুন বড় খবর নেই।", url: "/mybrief" });
  await ownerTelegram(env, briefText(env, h, items, mode));
  return { items: items.length, mode };
}
// A big story between briefs: on the follow list, or a major political or world story carried by
// many outlets, published in the last twenty minutes. One every fifteen minutes at most, none in
// the ten minutes before a brief, each story once.
async function bigStories(env, nowMs, dayStart) {
  if (BRIEF_HOURS.some(h => { const at = dayStart + h * 3600e3; return nowMs >= at - 10 * 60e3 && nowMs < at + 5 * 60e3; })) return {};
  const big = await get(env, "brief:big", { sent: [], last: 0 });
  if (nowMs - (big.last || 0) < 15 * 60e3) return {};
  const rules = await briefRules(env);
  const xs = (await candidates(env, new Date(nowMs - 20 * 60e3).toISOString())).filter(x => !big.sent.includes(x.id) && !rules.mute.some(w => x.text.includes(w)));
  const pick = xs.find(x => rules.follow.some(w => x.text.includes(w))) || xs.filter(x => (x.pri <= 2 && x.sources >= 3) || ((x.dk === "world" || x.dk === "bangladesh") && x.sources >= 5)).sort((a, b) => b.sources - a.sources)[0];
  if (!pick) return {};
  await put(env, "brief:big", { sent: [pick.id, ...big.sent].slice(0, 200), last: nowMs });
  await ownerPush(env, { title: "বড় খবর", body: pick.title, url: `/article/${encodeURIComponent(pick.slug)}` });
  await ownerTelegram(env, `<b>বড় খবর</b>\n<a href="${site(env)}/article/${encodeURIComponent(pick.slug)}">${esc(pick.title)}</a>${pick.sources >= 3 ? ` · ${bn(pick.sources)}টি সূত্র` : ""}`);
  return { big: pick.id };
}

// What the app's Desk Brief page shows.
export async function briefState(env, nowMs = Date.now()) {
  const ist = new Date(nowMs + IST), dayStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST;
  const nextH = BRIEF_HOURS.find(h => dayStart + h * 3600e3 > nowMs) ?? BRIEF_HOURS[0];
  const nextAt = dayStart + nextH * 3600e3 + (BRIEF_HOURS.some(h => dayStart + h * 3600e3 > nowMs) ? 0 : 864e5);
  const [draft, sent, rules, chat] = await Promise.all([get(env, "brief:draft", null), get(env, "brief:sent", []), briefRules(env), get(env, "tg:chat", null)]);
  const live = draft && Date.parse(draft.slot) === nextAt ? draft : null;
  // Before the draft time, a preview of what the desk would choose now.
  const preview = live ? null : await autoBrief(env, new Date(Math.max(nowMs - 6 * 3600e3, Date.parse(sent[0]?.at || 0) || 0)).toISOString());
  return { next: { h: nextH, at: new Date(nextAt).toISOString(), label: slotLabel(nextH) }, draft: live, preview, sent: sent.slice(0, 5), rules, sections: SECTIONS,
    telegram: { ready: !!env.TELEGRAM_BOT_TOKEN, connected: !!chat?.id, name: chat?.name || "" } };
}
// The owner's picks for the next brief (from the Desk Brief page or a story's tools).
export async function briefPick(env, b, nowMs = Date.now()) {
  const st = await briefState(env, nowMs);
  let draft = st.draft;
  if (!draft) {
    const since = new Date(Math.max(nowMs - 6 * 3600e3, Date.parse(st.sent[0]?.at || 0) || 0)).toISOString();
    draft = { slot: st.next.at, h: st.next.h, since, at: new Date(nowMs).toISOString(), items: st.preview || [], picks: [], confirmed: false };
  }
  if (b.add) {
    if (!draft.items.some(x => x.id === b.add)) {
      const a = await env.DB.prepare("SELECT id, slug, title, category, published_at, dek FROM articles WHERE id=? OR slug=?").bind(b.add, b.add).first();
      if (!a) throw new Error("Story not found.");
      const text = `${a.title} ${a.dek || ""}`, pri = bulletinRank(a.category, text), dk = deskKey(a.category, text);
      draft.items.push({ id: a.id, slug: a.slug, title: a.title, desk: a.category, pri, dk, sources: 1, at: a.published_at, moved: false, sec: pri <= 1 ? "wb" : pri === 2 ? "in" : dk === "world" || dk === "bangladesh" ? "world" : "dev" });
      b.add = a.id;
    }
    if (!draft.picks.includes(b.add)) draft.picks.push(b.add);
  }
  if (b.remove) draft.picks = draft.picks.filter(id => id !== b.remove);
  if (Array.isArray(b.picks)) draft.picks = b.picks.filter(id => draft.items.some(x => x.id === id));
  if (b.confirm !== undefined) draft.confirmed = !!b.confirm;
  await put(env, "brief:draft", draft);
  return draft;
}

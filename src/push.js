// Breaking-news alerts over Web Push (RFC 8030) with VAPID (RFC 8292).
// Pushes carry no payload, so no message encryption is needed: on each push the service
// worker fetches /api/alerts/latest and shows it. The VAPID key pair is generated on first
// use and kept in D1, so nothing has to be configured.

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8 = s => new TextEncoder().encode(s);

let keysPromise = null;
export function vapidKeys(env) {
  if (!keysPromise) keysPromise = loadKeys(env).catch(e => { keysPromise = null; throw e; });
  return keysPromise;
}
async function loadKeys(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='vapid'").first();
  let stored = row ? JSON.parse(row.value) : null;
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    stored = { publicKey: b64url(await crypto.subtle.exportKey("raw", pair.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
    // If two requests race, the first write wins and both read it back.
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('vapid',?)").bind(JSON.stringify(stored)).run();
    stored = JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key='vapid'").first()).value);
  }
  const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { publicKey: stored.publicKey, privateKey };
}

const jwtCache = new Map(); // audience -> { token, expires }
async function vapidAuth(keys, endpoint, subject) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  const hit = jwtCache.get(aud);
  if (hit && hit.expires - 600 > now) return hit.token;
  const exp = now + 12 * 3600;
  const unsigned = `${b64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${b64url(utf8(JSON.stringify({ aud, exp, sub: subject })))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, utf8(unsigned));
  const token = `vapid t=${unsigned}.${b64url(sig)}, k=${keys.publicKey}`;
  jwtCache.set(aud, { token, expires: exp });
  return token;
}

// Send one payload-less push. Returns "ok", "gone" (subscription expired) or "error".
export async function sendPush(env, endpoint, subject) {
  try {
    const keys = await vapidKeys(env);
    const res = await fetch(endpoint, { method: "POST", headers: { Authorization: await vapidAuth(keys, endpoint, subject), TTL: "86400", Urgency: "high", "Content-Length": "0" } });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "error";
  } catch { return "error"; }
}

const BATCH = 40; // stays under the Workers subrequest limit with room for D1 calls

// Create an alert and start sending it; the cron trigger finishes large lists.
export async function createAlert(env, ctx, { title, body = "", url = "/", userId = null }) {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO alerts (id,title,body,url,created_by) VALUES (?,?,?,?,?)").bind(id, String(title).slice(0, 140), String(body).slice(0, 240), url, userId).run();
  ctx?.waitUntil?.(drainAlerts(env).catch(() => {}));
  return id;
}

// Send the next batch for each unfinished alert (oldest first).
export async function drainAlerts(env) {
  const subject = env.SITE_URL || "mailto:alerts@rashtrix.invalid";
  const { results: open } = await env.DB.prepare("SELECT id,cursor,sent FROM alerts WHERE done=0 ORDER BY created_at LIMIT 3").all();
  for (const alert of open) {
    const { results: subs } = await env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE endpoint>? ORDER BY endpoint LIMIT ?").bind(alert.cursor, BATCH).all();
    if (!subs.length) { await env.DB.prepare("UPDATE alerts SET done=1 WHERE id=?").bind(alert.id).run(); continue; }
    const outcomes = await Promise.all(subs.map(s => sendPush(env, s.endpoint, subject)));
    const gone = subs.filter((_, i) => outcomes[i] === "gone").map(s => s.endpoint);
    const ok = subs.filter((_, i) => outcomes[i] === "ok").map(s => s.endpoint);
    const stmts = [env.DB.prepare("UPDATE alerts SET cursor=?, sent=sent+?, done=? WHERE id=?").bind(subs[subs.length - 1].endpoint, ok.length, subs.length < BATCH ? 1 : 0, alert.id)];
    for (const e of gone) stmts.push(env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(e));
    if (ok.length) stmts.push(env.DB.prepare(`UPDATE push_subscriptions SET last_ok_at=CURRENT_TIMESTAMP WHERE endpoint IN (${ok.map(() => "?").join(",")})`).bind(...ok));
    await env.DB.batch(stmts);
    break; // one batch per run keeps each invocation small
  }
}

// Alerts for the newsroom only (an output went quiet, the standby slate went up): sent to the
// devices of signed-in editors and administrators. Pushes carry no payload; a staff device that
// asks /api/alerts/latest within five minutes gets this alert instead of the public one.
export async function staffAlert(env, { title, body = "", url = "/admin.html" }) {
  const last = await env.DB.prepare("SELECT value FROM settings WHERE key='staff_alert'").first();
  const prev = last ? JSON.parse(last.value) : null;
  if (prev && prev.title === title && Date.now() - Date.parse(prev.at) < 10 * 60e3) return;   // no repeats within 10 minutes
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('staff_alert',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(JSON.stringify({ title: String(title).slice(0, 140), body: String(body).slice(0, 240), url, at: new Date().toISOString() })).run();
  const { results } = await env.DB.prepare("SELECT p.endpoint FROM push_subscriptions p JOIN users u ON u.id=p.user_id WHERE u.role IN ('admin','editor') LIMIT 40").all();
  const subject = env.SITE_URL || "mailto:alerts@rashtrix.invalid";
  await Promise.all(results.map(s => sendPush(env, s.endpoint, subject)));
}

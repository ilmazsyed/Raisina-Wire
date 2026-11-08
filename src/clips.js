// Video clips in Cloudflare R2 (binding CLIPS; 10 GB free). Clips are uploaded from the browser in
// parts (any size), or copied once from a Google Drive link. They are served from /clips/<key>
// with byte ranges (players seek). Clips not marked "keep" are deleted after CLIP_RETENTION_DAYS
// (default 30) without use, so storage stays inside the free 10 GB. MP4 (H.264) plays everywhere.
import { driveId } from "./tvchannel.js";

const PART = 20 * 1024 * 1024;   // upload part size (R2 needs at least 5 MB except the last)
const now = () => new Date().toISOString();
const ready = env => Boolean(env.CLIPS);

export async function serveClip(request, env) {
  if (!ready(env)) return new Response("Clips are not set up", { status: 404 });
  const key = decodeURIComponent(new URL(request.url).pathname.slice(1));   // "clips/…"
  if (!/^clips\/[\w./-]+$/.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
  const range = request.headers.get("range");
  const obj = await env.CLIPS.get(key, range ? { range: request.headers } : {});
  if (!obj) return new Response("Not found", { status: 404 });
  const h = new Headers({ "content-type": obj.httpMetadata?.contentType || "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=86400", etag: obj.httpEtag });
  if (range && obj.range) {
    const { offset = 0, length = obj.size - offset } = obj.range;
    h.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`); h.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { headers: h });
}

// /api/admin/clips…
export async function handleClips(request, env, url, user, { json, err, audit }) {
  if (!ready(env)) return err("Clip storage (Cloudflare R2) is not set up yet. Create the bucket “rashtrix-clips” and deploy again (see the README).", 503);
  const [, , , , id, sub, n] = url.pathname.split("/").map(decodeURIComponent);   // /api/admin/clips/:id/:sub/:n
  const m = request.method, ok = (x = {}) => json({ ok: true, ...x }, 200, { "cache-control": "no-store" });
  if (!id && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM clips ORDER BY created_at DESC LIMIT 300").all();
    const used = results.reduce((a, c) => a + (c.bytes || 0), 0);
    return json({ clips: results.map(c => ({ ...c, url: `/${c.r2_key}` })), usedBytes: used, retentionDays: Number(env.CLIP_RETENTION_DAYS || 30) }, 200, { "cache-control": "no-store" });
  }
  if (!id && m === "POST") {   // start an upload: { title, filename, size, mime, duration }
    const b = await request.json().catch(() => ({}));
    const mime = /^video\/(mp4|quicktime|webm)$/.test(b.mime || "") ? b.mime : "video/mp4";
    const key = `clips/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${mime === "video/webm" ? "webm" : "mp4"}`;
    const up = await env.CLIPS.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
    const cid = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO clips (id,title,r2_key,mime,bytes,duration,source,status,upload_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(cid, String(b.title || b.filename || "Clip").slice(0, 160), key, mime, Number(b.size) || 0, Number(b.duration) || 0, "upload", "uploading", up.uploadId, user.id).run();
    return ok({ id: cid, partSize: PART });
  }
  const c = await env.DB.prepare("SELECT * FROM clips WHERE id=?").bind(id).first();
  if (!c && id !== "drive") return err("Clip not found.", 404);
  if (sub === "part" && m === "PUT") {   // one part of the file
    const up = env.CLIPS.resumeMultipartUpload(c.r2_key, c.upload_id);
    const part = await up.uploadPart(Number(n), request.body);
    return ok({ part: { partNumber: part.partNumber, etag: part.etag } });
  }
  if (sub === "complete" && m === "POST") {
    const b = await request.json().catch(() => ({}));
    const up = env.CLIPS.resumeMultipartUpload(c.r2_key, c.upload_id);
    const obj = await up.complete((b.parts || []).map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })));
    await env.DB.prepare("UPDATE clips SET status='ready', upload_id=NULL, bytes=? WHERE id=?").bind(obj.size, id).run();
    await audit("clip.upload", "clip", id, { bytes: obj.size });
    return ok({ url: `/${c.r2_key}` });
  }
  if (sub === "abort" && m === "POST") { try { await env.CLIPS.resumeMultipartUpload(c.r2_key, c.upload_id).abort(); } catch { /* gone */ } await env.DB.prepare("DELETE FROM clips WHERE id=?").bind(id).run(); return ok(); }
  if (id === "drive" && m === "POST") {   // copy a Drive video once into R2
    const b = await request.json().catch(() => ({}));
    const did = driveId(b.url); if (!did) return err("Paste a Google Drive share link (shared as “Anyone with the link”).");
    const r = await fetch(`https://drive.usercontent.google.com/download?id=${did}&export=download&confirm=t`, { redirect: "follow" });
    const type = r.headers.get("content-type") || "", len = Number(r.headers.get("content-length") || 0);
    if (!r.ok || type.startsWith("text/html")) return err("Drive did not hand over the file. Check it is shared as “Anyone with the link”, and that it is a video.");
    if (!len) return err("Drive did not say how big the file is, so it cannot be copied in one go. Download it and upload it here instead.");
    const key = `clips/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.mp4`;
    const { readable, writable } = new FixedLengthStream(len);
    const put = env.CLIPS.put(key, readable, { httpMetadata: { contentType: /video\//.test(type) ? type : "video/mp4" } });
    await r.body.pipeTo(writable); await put;
    const cid = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO clips (id,title,r2_key,mime,bytes,source,status,created_by) VALUES (?,?,?,?,?,?,?,?)").bind(cid, String(b.title || "Drive clip").slice(0, 160), key, "video/mp4", len, String(b.url).slice(0, 500), "ready", user.id).run();
    await audit("clip.drive", "clip", cid, { bytes: len });
    return ok({ id: cid, url: `/${key}` });
  }
  if (!sub && m === "PUT") { const b = await request.json().catch(() => ({})); await env.DB.prepare("UPDATE clips SET title=?, keep=?, duration=? WHERE id=?").bind(String(b.title ?? c.title).slice(0, 160), b.keep === undefined ? c.keep : b.keep ? 1 : 0, b.duration ?? c.duration, id).run(); return ok(); }
  if (!sub && m === "DELETE") { await env.CLIPS.delete(c.r2_key); await env.DB.prepare("DELETE FROM clips WHERE id=?").bind(id).run(); await audit("clip.delete", "clip", id, {}); return ok(); }
  return err("Not found.", 404);
}

// Cron, once a day: old unused clips go (and uploads abandoned for a day).
export async function clipHousekeeping(env) {
  if (!ready(env)) return null;
  const k = await env.DB.prepare("SELECT value FROM settings WHERE key='clips_day'").first(), today = now().slice(0, 10);
  if (k?.value === today) return null;
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('clips_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(today).run();
  const days = Number(env.CLIP_RETENTION_DAYS || 30), cut = new Date(Date.now() - days * 864e5).toISOString();
  const { results } = await env.DB.prepare("SELECT id,r2_key,upload_id,status FROM clips WHERE keep=0 AND ((COALESCE(last_used_at,created_at) < ?) OR (status='uploading' AND created_at < ?)) LIMIT 200").bind(cut.replace("T", " ").slice(0, 19), new Date(Date.now() - 864e5).toISOString().replace("T", " ").slice(0, 19)).all();
  for (const c of results) {
    try { if (c.status === "uploading" && c.upload_id) await env.CLIPS.resumeMultipartUpload(c.r2_key, c.upload_id).abort(); else await env.CLIPS.delete(c.r2_key); } catch { /* already gone */ }
    await env.DB.prepare("DELETE FROM clips WHERE id=?").bind(c.id).run();
  }
  return { deleted: results.length };
}
export const markClipUsed = (env, url) => env.DB.prepare("UPDATE clips SET last_used_at=? WHERE r2_key=?").bind(now(), decodeURIComponent(String(url).replace(/^\//, ""))).run().catch(() => {});

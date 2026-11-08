// WebRTC through Cloudflare Realtime (SFU), via the Worker's relay (/api/rtc/…), for the live
// studio: guests publish their camera and microphone; the studio desk, the PCR, the outputs and
// other guests pull them. `auth` is how the caller is allowed in: { t } for a guest's link, the
// staff session cookie, or { ch, key } for an output.
const qs = auth => new URLSearchParams(auth || {}).toString();
async function call(path, auth, method = "POST", body) {
  const r = await fetch(`/api/rtc/${path}${path.includes("?") ? "&" : "?"}${qs(auth)}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.errorCode) throw new Error(d.error || d.errorDescription || `Media relay ${r.status}`);
  return d;
}
export async function iceServers(auth) {
  try { return (await call("ice", auth, "GET")).iceServers; } catch { return [{ urls: "stun:stun.cloudflare.com:3478" }]; }
}
// Publish a camera/microphone stream. Returns { pc, sessionId, tracks: { video, audio } }.
export async function publish(stream, auth, name = "guest") {
  const pc = new RTCPeerConnection({ iceServers: await iceServers(auth), bundlePolicy: "max-bundle" });
  const tx = stream.getTracks().map(track => ({ track, t: pc.addTransceiver(track, { direction: "sendonly", ...(track.kind === "video" ? { sendEncodings: [{ maxBitrate: 1_500_000 }] } : {}) }) }));
  const { sessionId } = await call("session", auth);
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  const tracks = tx.map(({ track, t }) => ({ location: "local", mid: t.mid, trackName: `${name}-${track.kind}-${Math.random().toString(36).slice(2, 7)}` }));
  const r = await call(`${sessionId}/tracks`, auth, "POST", { sessionDescription: { type: "offer", sdp: pc.localDescription.sdp }, tracks });
  await pc.setRemoteDescription(r.sessionDescription);
  await new Promise(res => { if (pc.connectionState === "connected") return res(); const to = setTimeout(res, 8000); pc.addEventListener("connectionstatechange", () => { if (pc.connectionState === "connected") { clearTimeout(to); res(); } }); });
  const names = Object.fromEntries(tx.map(({ track }, i) => [track.kind, tracks[i].trackName]));
  return { pc, sessionId, tracks: names };
}
// Pull remote tracks [{ sessionId, trackName }] into one MediaStream.
export async function pull(remote, auth) {
  const pc = new RTCPeerConnection({ iceServers: await iceServers(auth), bundlePolicy: "max-bundle" });
  const stream = new MediaStream();
  pc.ontrack = e => stream.addTrack(e.track);
  const { sessionId } = await call("session", auth);
  const r = await call(`${sessionId}/tracks`, auth, "POST", { tracks: remote.filter(x => x.sessionId && x.trackName).map(x => ({ location: "remote", sessionId: x.sessionId, trackName: x.trackName })) });
  if (r.requiresImmediateRenegotiation) {
    await pc.setRemoteDescription(r.sessionDescription);
    const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
    await call(`${sessionId}/renegotiate`, auth, "PUT", { sessionDescription: { type: "answer", sdp: answer.sdp } });
  }
  return { pc, stream, sessionId };
}
// Round-trip time (ms) and outgoing bitrate from a connection, for the green-room check.
export async function netStats(pc) {
  if (!pc) return {};
  const s = await pc.getStats(); let rtt = 0, out = 0;
  s.forEach(r => { if (r.type === "candidate-pair" && r.state === "succeeded" && r.currentRoundTripTime) rtt = Math.round(r.currentRoundTripTime * 1000); if (r.type === "outbound-rtp" && r.kind === "video") out = r.bytesSent; });
  return { rtt, bytes: out };
}

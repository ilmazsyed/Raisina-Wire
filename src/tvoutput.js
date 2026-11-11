// The OBS / vMix output page (tv.html?ch=h|v&key=…): the channel full frame, with sound,
// only when the secret key matches.
import "./tv.css";
import { mountTV } from "./tvplayer.js";

const q = new URLSearchParams(location.search), ch = q.get("ch") === "v" ? "v" : "h", key = q.get("key") || "";
const host = document.getElementById("tvHost");
fetch(`/api/tv/${ch}/key?key=${encodeURIComponent(key)}`, { cache: "no-store" }).then(r => r.json()).then(d => {
  if (!d.ok) { host.innerHTML = `<div class="tv-denied">This output address is not valid. Copy it again from the control room (TV channels).</div>`; return; }
  mountTV(host, { channel: ch, output: true, key });
}).catch(() => { host.innerHTML = `<div class="tv-denied">The channel could not be reached. Retrying…</div>`; setTimeout(() => location.reload(), 10000); });

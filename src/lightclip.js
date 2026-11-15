// A video made light for the channel before it is stored: phones film at full HD and 15–20 Mbit/s,
// more than a phone's mobile data can stream, so a byte stood black or froze on air. Each upload
// is re-encoded in this browser to at most 1280×720 at about 2.5 Mbit/s (H.264 and AAC in MP4),
// from the video playing at double speed (so an 8-second byte takes about 4 seconds). A video that
// is already light, or a browser that cannot encode, keeps the original.
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// (some browsers give the first chunk no colour space; the MP4 needs one: the usual HD one)
const fixMeta = m => { if (m?.decoderConfig && !m.decoderConfig.colorSpace?.primaries) m = { ...m, decoderConfig: { ...m.decoderConfig, colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false } } }; return m; };
const SR = 48000;
// Already light: at most 720 lines and 3.5 Mbit/s.
export const isLight = (bytes, secs, h = 0) => secs > 0 && bytes * 8 / secs <= 3.5e6 && (!h || h <= 720);

export async function lightenVideo(file, { onProgress = () => {} } = {}) {
  if (!window.VideoEncoder || !window.AudioEncoder || !window.VideoFrame) return null;
  const url = URL.createObjectURL(file);
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("This video cannot be read.")); });
    const secs = v.duration || 0, iw = v.videoWidth, ih = v.videoHeight;
    if (!secs || !iw) return null;
    if (isLight(file.size, secs, Math.min(iw, ih))) return null;
    const sc = Math.min(1, 1280 / Math.max(iw, ih), 720 / Math.min(iw, ih)), W = Math.round(iw * sc / 2) * 2, H = Math.round(ih * sc / 2) * 2;
    const vcfg = { codec: "avc1.4d401f", width: W, height: H, bitrate: 2.5e6, framerate: 30 };
    const acfg = { codec: "mp4a.40.2", sampleRate: SR, numberOfChannels: 2, bitrate: 128000 };
    const ok = async (E, c) => { try { return (await E.isConfigSupported(c)).supported; } catch { return false; } };
    if (!(await ok(VideoEncoder, vcfg))) { vcfg.codec = "avc1.42001f"; if (!(await ok(VideoEncoder, vcfg))) return null; }
    // the sound (decoded whole; a video with no sound track is made silent)
    let audio = null;
    try { const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }); audio = await ac.decodeAudioData(await file.arrayBuffer()); ac.close(); } catch { audio = null; }
    if (audio && !(await ok(AudioEncoder, acfg))) return null;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, fastStart: "in-memory", firstTimestampBehavior: "offset", video: { codec: "avc", width: W, height: H, frameRate: 30 }, ...(audio ? { audio: { codec: "aac", numberOfChannels: 2, sampleRate: SR } } : {}) });
    let failed = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, fixMeta(m)), error: e => { failed = e; } });
    venc.configure({ ...vcfg, avc: { format: "avc" } });
    if (audio) {
      const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => { failed = e; } });
      aenc.configure(acfg);
      const L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L, step = SR / 10;
      for (let o = 0; o < L.length; o += step) { const n = Math.min(step, L.length - o), data = new Float32Array(n * 2); data.set(L.subarray(o, o + n), 0); data.set(R.subarray(o, o + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(o / SR * 1e6), data }); aenc.encode(ad); ad.close(); }
      await aenc.flush(); aenc.close();
    }
    // the picture: each frame as it is shown, the video playing at double speed
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H; const c = canvas.getContext("2d", { alpha: false });
    let n = 0, lastT = -1;
    await new Promise((res, rej) => {
      const each = (now, meta) => {
        if (failed) return rej(failed);
        const t = meta.mediaTime;
        if (t > lastT + 0.02) { c.drawImage(v, 0, 0, W, H); const f = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6) }); venc.encode(f, { keyFrame: n % 60 === 0 }); f.close(); n++; lastT = t; onProgress(Math.min(0.99, t / secs)); }
        if (!v.ended) v.requestVideoFrameCallback(each);
      };
      v.onended = () => setTimeout(res, 50); v.onerror = () => rej(new Error("This video cannot be read."));
      v.requestVideoFrameCallback(each); v.playbackRate = 2; v.play().catch(rej);
    });
    await venc.flush(); if (failed) throw failed; venc.close(); muxer.finalize();
    if (n < secs * 8) return null;   // too few frames came through (a background tab): keep the original
    onProgress(1);
    const name = file.name.replace(/\.\w+$/, "") + ".mp4";
    return new File([target.buffer], name, { type: "video/mp4" });
  } catch { return null; }
  finally { v.removeAttribute("src"); try { v.load(); } catch { /* none */ } URL.revokeObjectURL(url); }
}

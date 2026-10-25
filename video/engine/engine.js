/* Raisina Wire video engine: motion-graphics explainers drawn on one canvas.
   Every frame is a pure function of time, so the renderer can step through it frame by frame
   (render.mjs) and a browser preview can scrub it. RW.load(spec, timing, w, h) → RW.draw(t).
   A spec is a list of scenes ({type, say, …}); timing (from voice.py) says when each starts,
   how long it lasts and when each caption chunk shows. */
(() => {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);                 // out-cubic
  const easeIO = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const back = x => { x = clamp(x); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const lerp = (a, b, x) => a + (b - a) * x;
  const C = { paper: '#f5f1ea', paper2: '#ebe4d8', ink: '#0f1422', ink2: '#3b414d', muted: '#7a7f8a', line: 'rgba(15,20,34,.12)',
    red: '#b8141f', redDeep: '#8f0d16', gold: '#e9bd78', goldInk: '#7a530f', saffron: '#f5a944', green: '#137a55', land: '#c9bfae', landHi: '#b8141f' };
  const F = { serif: 'Newsreader, Georgia, serif', sans: 'Manrope, system-ui, sans-serif', mono: '"DM Mono", ui-monospace, monospace' };
  const font = (fam, px, w = 600) => `${w} ${Math.round(px)}px ${F[fam]}`;
  const inr = n => Math.round(n).toLocaleString('en-IN');

  let W = 1920, H = 1080, M = 1080, V = false, ctx = null, spec = null, timing = null, LAND = [];

  /* ---------- drawing helpers ---------- */
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  // Wrap text to a width; returns lines.
  function wrap(text, maxW) {
    const words = String(text).split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  // Text that rises into place word by word.
  function riseText(text, x, y, maxW, lh, u, { align = 'left', stagger = .045, dur = .55 } = {}) {
    const lines = wrap(text, maxW); let k = 0;
    lines.forEach((line, li) => {
      const words = line.split(' '), widths = words.map(w => ctx.measureText(w + ' ').width), total = widths.reduce((a, b) => a + b, 0) - ctx.measureText(' ').width;
      let cx = align === 'center' ? x - total / 2 : x;
      words.forEach((w, wi) => {
        const p = ease((u - k++ * stagger) / dur);
        ctx.save(); ctx.globalAlpha *= p; ctx.textAlign = 'left'; ctx.fillText(w, cx, y + li * lh + (1 - p) * lh * .45); ctx.restore();
        cx += widths[wi];
      });
    });
    return lines.length;
  }
  function kicker(text, x, y, u, col = C.red, align = 'left') {
    const p = ease(u / .5); ctx.save(); ctx.globalAlpha *= p; ctx.font = font('mono', M * .022, 500); ctx.fillStyle = col; ctx.textAlign = align;
    const s = String(text).toUpperCase().split('').join(String.fromCharCode(8202)); ctx.fillText(s, x, y);
    const tw = ctx.measureText(s).width, bx = align === 'center' ? x - tw / 2 : x;
    ctx.fillRect(bx, y + M * .016, tw * ease((u - .1) / .6), Math.max(2, M * .003)); ctx.restore();
  }
  function sourceLine(text, u) {
    if (!text) return; ctx.save(); ctx.globalAlpha *= ease((u - .6) / .6); ctx.font = font('mono', M * .016, 500); ctx.fillStyle = C.muted;
    ctx.textAlign = 'left'; ctx.fillText(('Source: ' + text).toUpperCase(), pad(), H - M * .044 - (V ? H * .035 : M * .028)); ctx.restore();
  }
  // Quote text: words rise in, then light up in turn as the narrator reads them.
  function karaoke(text, x, y, maxW, lh, u) {
    const lines = wrap(text, maxW), total = String(text).split(/\s+/).length, lit = (S.r - .3) / Math.max(1, S.vd * .9) * total; let k = 0;
    lines.forEach((line, li) => {
      let cx = x;
      for (const w of line.split(' ')) {
        const p = ease((u - k * .03) / .45), on = k < lit;
        ctx.save(); ctx.globalAlpha *= p; ctx.fillStyle = on ? C.ink : 'rgba(15,20,34,.28)'; ctx.textAlign = 'left'; ctx.fillText(w, cx, y + li * lh + (1 - p) * lh * .4);
        if (on && k > lit - 1.2) { ctx.fillStyle = C.red; ctx.fillRect(cx, y + li * lh + lh * .16, ctx.measureText(w).width, Math.max(3, M * .004)); }
        ctx.restore(); cx += ctx.measureText(w + ' ').width; k++;
      }
    });
    return lines.length;
  }
  // Largest font size (≤ px) at which text fits maxW.
  function fit(text, fam, px, w, maxW) { let f = px; ctx.font = font(fam, f, w); const tw = ctx.measureText(text).width; if (tw > maxW) { f = px * maxW / tw; ctx.font = font(fam, f, w); } return f; }
  const pad = () => V ? W * .08 : W * .07;
  // Narration-synced reveals. S = {r: real seconds into the scene, vd: voice duration}. Item i of n
  // appears as the narrator reaches it (spread across the line), and `now` is the item being spoken.
  let S = { r: 0, vd: 4, dur: 5 };
  const step = n => clamp((S.vd * .82 - .35) / Math.max(1, n), .35, 1.4);
  const itemQ = (i, n, d = .45) => ease((S.r - .35 - i * step(n)) * PACE / d);
  const now = n => clamp(Math.floor((S.r - .35) / step(n)), 0, n - 1);
  const glow = (i, n) => (now(n) === i && S.r < S.vd + .3) ? 1 : 0;   // 1 while item i is being narrated
  const counter = (v, p, dec = 0) => (v * easeIO(p)).toFixed(dec);

  /* ---------- photo toolkit: duotone, halftone, cut-out stickers, 3D cards ---------- */
  // IMG[src] = { img, duo: crimson/ink duotone canvas, cut: cut-out image, sil: white silhouette, box }
  const IMG = {};
  let HALF = null;
  function makeDuotone(img) {
    const sc = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data, ink = [15, 20, 34], red = [184, 20, 31], pap = [245, 225, 205];
    for (let i = 0; i < a.length; i += 4) {
      let l = (a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11) / 255; l = clamp((l - .08) / .84);
      const [p, q, t] = l < .5 ? [ink, red, l * 2] : [red, pap, (l - .5) * 2];
      a[i] = p[0] + (q[0] - p[0]) * t; a[i + 1] = p[1] + (q[1] - p[1]) * t; a[i + 2] = p[2] + (q[2] - p[2]) * t;
    }
    g.putImageData(d, 0, 0); return c;
  }
  function makeSilhouette(img) {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return c;
  }
  function makeHalftone() {
    const c = document.createElement('canvas'), n = Math.round(M * .012); c.width = c.height = n;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(15,20,34,.55)'; g.beginPath(); g.arc(n / 2, n / 2, n * .22, 0, TAU); g.fill(); HALF = ctx.createPattern(c, 'repeat');
  }
  const iw = im => im.naturalWidth || im.width, ih = im => im.naturalHeight || im.height;
  // Draw an image to cover a box, zoomed by z around a focus point (fx, fy in 0..1).
  function cover(im, x, y, w, h, z = 1, fx = .5, fy = .5) {
    const sc = Math.max(w / iw(im), h / ih(im)) * z, dw = iw(im) * sc, dh = ih(im) * sc;
    ctx.drawImage(im, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
  }
  // A cut-out with a white sticker outline and a soft shadow.
  function sticker(rec, x, y, w, h, outline = M * .008) {
    if (!rec?.cut) return;
    ctx.save(); ctx.shadowColor = 'rgba(15,20,34,.45)'; ctx.shadowBlur = M * .04; ctx.shadowOffsetY = M * .015;
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; ctx.drawImage(rec.sil, x + Math.cos(a) * outline, y + Math.sin(a) * outline, w, h); if (k === 0) ctx.shadowColor = 'transparent'; }
    ctx.restore(); ctx.drawImage(rec.cut, x, y, w, h);
  }
  // A polaroid card with a pseudo-3D turn (ry around the vertical axis, rz in the picture plane).
  function card3d(im, cx, cy, w, h, ry = 0, rz = 0, caption = '') {
    const bd = w * .05, ch = caption ? h * .12 : bd;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rz); ctx.transform(Math.cos(ry), Math.sin(ry) * .18, 0, 1, 0, 0);
    ctx.shadowColor = 'rgba(15,20,34,.35)'; ctx.shadowBlur = M * .05; ctx.shadowOffsetY = M * .02;
    ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2 - bd, -h / 2 - bd, w + bd * 2, h + bd + ch); ctx.shadowColor = 'transparent';
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip(); cover(im, -w / 2, -h / 2, w, h, 1.05); ctx.restore();
    if (caption) { ctx.fillStyle = C.ink; ctx.font = font('sans', ch * .42, 700); ctx.textAlign = 'center'; ctx.fillText(caption, 0, h / 2 + ch * .62, w); }
    ctx.restore();
  }
  // A full-frame backdrop from a photo: duotone, halftone, slow drift.
  function duoBackdrop(rec, alpha, k) {
    if (!rec) return; ctx.save(); ctx.globalAlpha *= alpha; cover(rec.duo, 0, 0, W, H, lerp(1.08, 1.2, k), .5, .4);
    ctx.globalAlpha *= .3; ctx.fillStyle = HALF; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  /* ---------- the scenes: each returns draw(u, dur), u = seconds since the scene started ---------- */
  const SCENES = {
    title(s) {
      return u => {
        const x = V ? W / 2 : pad(), align = V ? 'center' : 'left', maxW = V ? W * .84 : W * .62;
        const y0 = V ? H * .36 : H * .3;
        kicker(s.kicker || 'Explainer', x, y0, u, C.red, align);
        ctx.font = font('serif', V ? M * .105 : M * .1, 600); ctx.fillStyle = C.ink;
        const n = riseText(s.title, x, y0 + M * .12, maxW, (V ? M * .105 : M * .1) * 1.08, u - .2, { align });
        if (s.sub) { ctx.font = font('sans', M * .034, 500); ctx.fillStyle = C.ink2; riseText(s.sub, x, y0 + M * .14 + n * M * .108, maxW, M * .046, u - .8, { align, stagger: .02 }); }
        // the tricolour rule
        const p = ease((u - .4) / .8), bw = (V ? W * .5 : W * .22) * p, by = V ? H * .27 : H * .2, bx = V ? W / 2 - bw / 2 : pad();
        [C.saffron, '#ffffff', C.green].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(bx, by + i * M * .008, bw, M * .008); });
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, M * .024);
        if (V) skyline(W * .06, H * .74, W * .88, u - .3, C.ink, .35); else skyline(W * .6, H * .82, W * .36, u - .3, C.ink, .45);
      };
    },

    number(s) {
      return u => {
        const cx = W / 2, cy = V ? H * .44 : H * .46, p = clamp((u - .3) / 1.6);
        if (s.kicker) kicker(s.kicker, cx, cy - M * .26, u, C.red, 'center');
        const val = s.inr ? inr(s.value * easeIO(p)) : counter(s.value, p, s.decimals || 0);
        fit(`${s.prefix || ''}${s.inr ? inr(s.value) : (+s.value).toFixed(s.decimals || 0)}${s.suffix || ''}`, 'serif', M * (V ? .3 : .28), 700, W * .86); ctx.fillStyle = C.red; ctx.textAlign = 'center';
        const land = u - 1.9; if (land > 0 && land < 1.2) for (let k = 0; k < 3; k++) {   // rings burst out as the count lands
          const q = clamp((land - k * .12) / .9); if (q <= 0) continue; ctx.save(); ctx.globalAlpha = (1 - q) * .35; ctx.strokeStyle = C.red; ctx.lineWidth = Math.max(2, M * .004);
          ctx.beginPath(); ctx.arc(cx, cy - M * .08, M * (.18 + q * .5), 0, TAU); ctx.stroke(); ctx.restore(); }
        ctx.save(); const sc = lerp(.85, 1, back(u / .7)) * (1 + .03 * Math.sin(S.r * 2.2) * clamp(land)); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.globalAlpha *= ease(u / .4);
        ctx.fillText(`${s.prefix || ''}${val}${s.suffix || ''}`, 0, 0); ctx.restore();
        ctx.font = font('sans', M * .04, 600); ctx.fillStyle = C.ink;
        riseText(s.label, cx, cy + M * .1, V ? W * .84 : W * .6, M * .054, u - .9, { align: 'center', stagger: .03 });
        sourceLine(s.source, u);
      };
    },

    // A ring that fills to a share; `range` shades an uncertain band (e.g. 85–90%).
    share(s) {
      return u => {
        const cx = V ? W / 2 : W * .32, cy = V ? H * .32 : H * .5, r = M * (V ? .22 : .27), lw = r * .26, p = easeIO((u - .3) / 1.8);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = C.paper2; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
        const [lo, hi] = s.range || [s.value, s.value], a0 = -Math.PI / 2;
        ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + TAU * lo / 100 * p); ctx.stroke();
        if (hi > lo) { ctx.strokeStyle = 'rgba(184,20,31,.35)'; ctx.beginPath(); ctx.arc(cx, cy, r, a0 + TAU * lo / 100 * p, a0 + TAU * hi / 100 * p); ctx.stroke(); }
        fit(hi > lo ? `${lo}–${hi}%` : `${lo}%`, 'serif', r * .52, 700, (r - lw / 2) * 1.6); ctx.fillStyle = C.ink; ctx.textAlign = 'center';
        ctx.fillText(hi > lo ? `${Math.round(lo * p)}–${Math.round(hi * p)}%` : `${Math.round(lo * p)}%`, cx, cy + r * .12);
        ctx.font = font('mono', r * .1, 500); ctx.fillStyle = C.muted; ctx.fillText((s.ringLabel || '').toUpperCase(), cx, cy + r * .34);
        const tx = V ? W / 2 : W * .58, ty = V ? H * .55 : H * .36, align = V ? 'center' : 'left', maxW = V ? W * .84 : W * .36;
        kicker(s.kicker || '', tx, ty, u - .2, C.red, align);
        ctx.font = font('serif', M * .062, 600); ctx.fillStyle = C.ink;
        const n = riseText(s.title, tx, ty + M * .09, maxW, M * .07, u - .4, { align });
        if (s.detail) { ctx.font = font('sans', M * .032, 500); ctx.fillStyle = C.ink2; riseText(s.detail, tx, ty + M * .12 + n * M * .07, maxW, M * .045, u - 1, { align, stagger: .02 }); }
        sourceLine(s.source, u);
      };
    },

    // A horizontal timeline with milestones.
    timeline(s) {
      return u => {
        const x0 = pad(), x1 = W - pad(), y = V ? H * .52 : H * .58;
        const tx = V ? W / 2 : pad(), align = V ? 'center' : 'left';
        kicker(s.kicker || '', tx, V ? H * .2 : H * .17, u, C.red, align);
        ctx.font = font('serif', M * .07, 600); ctx.fillStyle = C.ink; riseText(s.title, tx, (V ? H * .2 : H * .17) + M * .09, V ? W * .84 : W * .8, M * .078, u - .2, { align });
        const n = s.items.length, p = easeIO((S.r - .2) / Math.max(1, (n - .5) * step(n)));
        if (V) {   // vertical: a spine down the left, labels to the right
          const lx = W * .16, y0 = H * .36, y1 = H * .72;
          ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(3, M * .004); ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, lerp(y0, y1, p)); ctx.stroke();
          s.items.forEach((it, i) => {
            const f = n === 1 ? .5 : i / (n - 1), yy = lerp(y0 + M * .02, y1 - M * .02, f), q = itemQ(i, n, .5);
            if (q <= 0) return;
            ctx.save(); ctx.globalAlpha *= q;
            ctx.fillStyle = it.hot ? C.red : C.ink; ctx.beginPath(); ctx.arc(lx, yy, M * .02 * back(q), 0, TAU); ctx.fill();
            ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(lx, yy, M * .008, 0, TAU); ctx.fill();
            ctx.textAlign = 'left'; ctx.font = font('mono', M * .028, 500); ctx.fillStyle = it.hot ? C.red : C.muted; ctx.fillText(it.when.toUpperCase(), lx + M * .06, yy - M * .02);
            ctx.font = font('sans', M * .04, 700); ctx.fillStyle = C.ink;
            wrap(it.what, W * .66).forEach((l, li) => ctx.fillText(l, lx + M * .06, yy + M * .035 + li * M * .05));
            ctx.restore();
          });
          return sourceLine(s.source, u);
        }
        ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(3, M * .004); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, p), y); ctx.stroke();
        s.items.forEach((it, i) => {
          const f = n === 1 ? .5 : i / (n - 1), x = lerp(x0 + M * .02, x1 - M * .02, f), q = itemQ(i, n, .5);
          if (q <= 0) return;
          ctx.save(); ctx.globalAlpha *= q;
          ctx.fillStyle = it.hot ? C.red : C.ink; ctx.beginPath(); ctx.arc(x, y, M * .016 * back(q), 0, TAU); ctx.fill();
          ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(x, y, M * .006, 0, TAU); ctx.fill();
          const up = i % 2 === 0 || !V; ctx.textAlign = f < .15 ? 'left' : f > .85 ? 'right' : 'center';
          const ax = f < .15 ? x - M * .016 : f > .85 ? x + M * .016 : x;
          ctx.font = font('mono', M * .024, 500); ctx.fillStyle = it.hot ? C.red : C.muted; ctx.fillText(it.when.toUpperCase(), ax, up ? y - M * .05 : y + M * .07);
          ctx.font = font('sans', M * .032, 700); ctx.fillStyle = C.ink;
          wrap(it.what, V ? W * .4 : W * .22).forEach((l, li) => ctx.fillText(l, ax, (up ? y + M * .075 : y + M * .115) + li * M * .042));
          ctx.restore();
        });
        sourceLine(s.source, u);
      };
    },

    // Big figures in a grid, counting up in turn.
    stats(s) {
      return u => {
        const tx = V ? W / 2 : pad(), align = V ? 'center' : 'left';
        kicker(s.kicker || '', tx, V ? H * .17 : H * .17, u, C.red, align);
        ctx.font = font('serif', M * .066, 600); ctx.fillStyle = C.ink; riseText(s.title, tx, (V ? H * .17 : H * .17) + M * .09, V ? W * .84 : W * .82, M * .074, u - .2, { align });
        const n = s.items.length, cols = V ? 1 : n, gap = M * .03;
        const cw = V ? W * .84 : (W - pad() * 2 - gap * (n - 1)) / n, ch = V ? H * .12 : H * .36;
        const gx = V ? W * .08 : pad(), gy = V ? H * .3 : H * .44;
        s.items.forEach((it, i) => {
          const col = i % cols, row = Math.floor(i / cols), x = gx + col * (cw + gap), y = gy + row * (ch + gap), q = itemQ(i, n, .6);
          if (q <= 0) return;
          ctx.save(); ctx.globalAlpha *= q; ctx.translate(0, (1 - q) * M * .04);
          rrect(x, y, cw, ch, M * .02); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = i === (s.hot ?? 0) ? C.red : C.ink; ctx.fillRect(x, y, Math.max(6, M * .008), ch);
          const p = clamp((S.r - .45 - i * step(n)) * PACE / 1.2), num = it.inr ? inr(it.value * easeIO(p)) : counter(it.value, p, it.decimals || 0);
          ctx.textAlign = 'left'; fit(`${it.prefix || ''}${it.inr ? inr(it.value) : it.value}${it.suffix || ''}`, 'serif', M * (V ? .085 : .095), 700, cw - M * .08); ctx.fillStyle = i === (s.hot ?? 0) ? C.red : C.ink;
          ctx.fillText(`${it.prefix || ''}${num}${it.suffix || ''}`, x + M * .04, y + (V ? ch * .5 : ch * .45));
          ctx.font = font('sans', M * .03, 600); ctx.fillStyle = C.ink2;
          wrap(it.label, cw - M * .08).forEach((l, li) => ctx.fillText(l, x + M * .04, y + (V ? ch * .78 : ch * .66) + li * M * .04));
          ctx.restore();
        });
        sourceLine(s.source, u);
      };
    },

    // A chain of boxes joined by arrows, with an optional shared base ("utilities") underneath.
    flow(s) {
      return u => {
        const tx = V ? W / 2 : pad(), align = V ? 'center' : 'left';
        kicker(s.kicker || '', tx, H * .15, u, C.red, align);
        ctx.font = font('serif', M * .064, 600); ctx.fillStyle = C.ink; riseText(s.title, tx, H * .15 + M * .09, V ? W * .84 : W * .8, M * .072, u - .2, { align });
        const n = s.nodes.length, gap = V ? M * .06 : M * .06;
        const bw = V ? W * .62 : (W - pad() * 2 - gap * (n - 1)) / n, bh = V ? Math.min(H * .06, H * .44 / n - gap) : H * .16;
        const pos = i => V ? [W / 2 - bw / 2, H * .3 + i * (bh + gap)] : [pad() + i * (bw + gap), H * .5];
        s.nodes.forEach((label, i) => {
          const [x, y] = pos(i), q = back((S.r - .35 - i * step(n)) * PACE / .5);
          if (q <= 0) return;
          ctx.save(); ctx.globalAlpha *= clamp(q); ctx.translate(x + bw / 2, y + bh / 2); ctx.scale(lerp(.8, 1, q), lerp(.8, 1, q));
          const g = glow(i, n); if (g) ctx.scale(1.05, 1.05);
          rrect(-bw / 2, -bh / 2, bw, bh, M * .018); ctx.fillStyle = i === n - 1 ? C.red : '#ffffff'; ctx.fill(); ctx.strokeStyle = i === n - 1 || g ? C.red : C.ink; ctx.lineWidth = Math.max(2, M * .0025) * (1 + g * 1.5); ctx.stroke();
          ctx.fillStyle = i === n - 1 ? '#ffffff' : C.ink; ctx.font = font('sans', M * .03, 700); ctx.textAlign = 'center';
          const ls = wrap(label, bw - M * .04); ls.forEach((l, li) => ctx.fillText(l, 0, (li - (ls.length - 1) / 2) * M * .038 + M * .011));
          ctx.restore();
          if (i < n - 1) {   // arrow to the next box, drawn on
            const a = ease((S.r - .35 - (i + .6) * step(n)) * PACE / .4); if (a <= 0) return;
            ctx.save(); ctx.strokeStyle = C.red; ctx.fillStyle = C.red; ctx.lineWidth = Math.max(3, M * .004);
            let x0, y0, x1, y1;
            if (V) { x0 = x1 = W / 2; y0 = y + bh + M * .01; y1 = lerp(y0, y + bh + gap - M * .01, a); }
            else { y0 = y1 = y + bh / 2; x0 = x + bw + M * .008; x1 = lerp(x0, x + bw + gap - M * .008, a); }
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            const hs = M * .014; ctx.beginPath();
            if (V) { ctx.moveTo(x1, y1); ctx.lineTo(x1 - hs, y1 - hs); ctx.lineTo(x1 + hs, y1 - hs); } else { ctx.moveTo(x1, y1); ctx.lineTo(x1 - hs, y1 - hs); ctx.lineTo(x1 - hs, y1 + hs); }
            ctx.fill(); ctx.restore();
          }
        });
        if (s.base) {
          const q = ease((S.r - .35 - n * step(n)) * PACE / .6), [fx] = pos(0), [lx, ly] = pos(n - 1);
          const bx = V ? W * .08 : fx, by = V ? ly + bh + M * .05 : ly + bh + M * .07, bwid = V ? W * .84 : lx + bw - fx;
          ctx.save(); ctx.globalAlpha *= q; rrect(bx, by, bwid * q, M * .07, M * .014); ctx.fillStyle = C.gold; ctx.fill();
          ctx.fillStyle = C.ink; ctx.font = font('mono', M * .022, 500); ctx.textAlign = 'center'; ctx.fillText(s.base.toUpperCase(), bx + bwid / 2, by + M * .043); ctx.restore();
        }
        sourceLine(s.source, u);
      };
    },

    // Horizontal bars that grow to their values; `display` is the label shown at the end of each bar.
    bars(s) {
      return u => {
        const tx = V ? W * .08 : pad();
        kicker(s.kicker || '', tx, H * (V ? .18 : .17), u, C.red);
        ctx.font = font('serif', M * .066, 600); ctx.fillStyle = C.ink;
        const n0 = riseText(s.title, tx, H * (V ? .18 : .17) + M * .09, V ? W * .84 : W * .8, M * .074, u - .2);
        const n = s.items.length, max = s.max || Math.max(...s.items.map(i => i.value));
        const y0 = H * (V ? .18 : .17) + M * .17 + n0 * M * .074, rowH = Math.min(V ? M * .2 : M * .14, (H * (V ? .74 : .86) - y0) / n);
        const labelW = V ? 0 : W * .2, bx = tx + labelW, bwMax = (V ? W * .84 : W - pad() - bx - W * .1);
        s.items.forEach((it, i) => {
          const q = itemQ(i, n, .5); if (q <= 0) return;
          const y = y0 + i * rowH, p = easeIO((S.r - .45 - i * step(n)) * PACE / 1.1), bh = rowH * (V ? .34 : .46);
          ctx.save(); ctx.globalAlpha *= q; ctx.textAlign = 'left';
          ctx.font = font('sans', M * .03, 700); ctx.fillStyle = C.ink2;
          if (V) ctx.fillText(it.label, tx, y); else wrap(it.label, labelW - M * .03).forEach((l, li, all) => ctx.fillText(l, tx, y + bh / 2 + M * .011 + (li - (all.length - 1) / 2) * M * .036));
          const by = V ? y + M * .025 : y, w = bwMax * it.value / max * p;
          rrect(bx, by, Math.max(w, 2), bh, Math.min(bh / 2, M * .012)); ctx.fillStyle = it.hot ? C.red : C.ink; ctx.fill();
          ctx.font = font('serif', M * (V ? .05 : .048), 700); ctx.fillStyle = it.hot ? C.red : C.ink;
          const label = it.display || String(Math.round(it.value * p)), lw = ctx.measureText(label).width;
          const inside = V && w + lw + M * .03 > W * .84;
          if (inside) { ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(label, bx + w - M * .02, by + bh / 2 + M * .018); }
          else ctx.fillText(label, bx + w + M * .02, by + bh / 2 + M * .018);
          ctx.restore();
        });
        sourceLine(s.source, u);
      };
    },

    // A dot map (land only, no borders) with pins that drop in and labels.
    map(s) {
      return u => {
        const [lon0, lon1, lat0, lat1] = s.view, cosLat = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
        const ar = (lon1 - lon0) * cosLat / (lat1 - lat0);
        const boxW = V ? W * .96 : W * .56, boxH = V ? H * .5 : H * .8;
        let mw = boxW, mh = mw / ar; if (mh > boxH) { mh = boxH; mw = mh * ar; }
        const mx = V ? (W - mw) / 2 : W - pad() * .6 - mw, my = V ? H * .34 : (H - mh) / 2 + H * .02;
        // the camera eases in from wide, then keeps drifting towards the pins
        const pins = s.pins || [], plon = pins.length ? pins.reduce((a, p) => a + p.lon, 0) / pins.length : (lon0 + lon1) / 2, plat = pins.length ? pins.reduce((a, p) => a + p.lat, 0) / pins.length : (lat0 + lat1) / 2;
        const zoom = lerp(1.1, 1, easeIO(u / 2.5)) * lerp(1, 1.16, easeIO(S.r / Math.max(4, S.dur)));
        const fxp = mx + (plon - lon0) / (lon1 - lon0) * mw, fyp = my + (lat1 - plat) / (lat1 - lat0) * mh, pull = easeIO(S.r / Math.max(4, S.dur)) * .35;
        const cxm = lerp(mx + mw / 2, fxp, pull), cym = lerp(my + mh / 2, fyp, pull);
        const P = (lon, lat) => { const x = mx + (lon - lon0) / (lon1 - lon0) * mw, y = my + (lat1 - lat) / (lat1 - lat0) * mh; return [mx + mw / 2 + (x - cxm) * zoom, my + mh / 2 + (y - cym) * zoom]; };
        const dr = Math.max(1.6, mw / (lon1 - lon0) * .4 * .42);
        ctx.fillStyle = C.land;
        for (let i = 0; i < LAND.length; i += 2) {
          const lon = LAND[i], lat = LAND[i + 1]; if (lon < lon0 || lon > lon1 || lat < lat0 || lat > lat1) continue;
          const [x, y] = P(lon, lat), d = Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W, H), q = ease((u - d * 1.2) / .5);
          const edge = clamp(Math.min(x - mx, mx + mw - x, y - my, my + mh - y) / (Math.min(mw, mh) * .14)); if (q <= 0 || edge <= 0) continue; ctx.globalAlpha = q * edge; ctx.beginPath(); ctx.arc(x, y, dr * q, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const tx = pad(), align = 'left';
        kicker(s.kicker || '', V ? W / 2 : tx, V ? H * .12 : H * .2, u, C.red, V ? 'center' : align);
        ctx.font = font('serif', M * .062, 600); ctx.fillStyle = C.ink;
        const n = riseText(s.title, V ? W / 2 : tx, (V ? H * .12 : H * .2) + M * .09, V ? W * .84 : W * .34, M * .07, u - .2, { align: V ? 'center' : align });
        const np = pins.length;
        // dashed routes between consecutive pins, drawn on as the next pin arrives
        for (let i = 1; i < np; i++) {
          const a = ease((S.r - .35 - i * step(np)) * PACE / .7); if (a <= 0) continue;
          const [x0, y0] = P(pins[i - 1].lon, pins[i - 1].lat), [x1, y1] = P(pins[i].lon, pins[i].lat), mxp = (x0 + x1) / 2, myp = Math.min(y0, y1) - Math.hypot(x1 - x0, y1 - y0) * .25;
          ctx.save(); ctx.strokeStyle = C.red; ctx.globalAlpha = .7; ctx.lineWidth = Math.max(2, M * .003); ctx.setLineDash([M * .012, M * .01]); ctx.lineDashOffset = -S.r * M * .05;
          ctx.beginPath(); for (let k = 0; k <= 40 * a; k++) { const t = k / 40, bx = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mxp + t * t * x1, by = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * myp + t * t * y1; k ? ctx.lineTo(bx, by) : ctx.moveTo(bx, by); }
          ctx.stroke(); ctx.restore();
        }
        pins.forEach((pin, i) => {
          const q = itemQ(i, np, .45); if (q <= 0) return;
          const t0 = .35 + i * step(np), [x, y] = P(pin.lon, pin.lat), drop = (1 - back((S.r - t0) * PACE / .45)) * M * .05;
          const pr = M * .016 * (1 + glow(i, np) * .25), pulse = ((S.r - t0) % 1.2) / 1.2;
          ctx.save(); ctx.globalAlpha = (1 - pulse) * .45 * q; ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, pr * (1 + pulse * 2.4), 0, TAU); ctx.stroke(); ctx.restore();
          ctx.save(); ctx.globalAlpha = q; ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x, y - drop, pr, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - drop, pr * .38, 0, TAU); ctx.fill();
          ctx.font = font('sans', M * .028, 800); const tw = ctx.measureText(pin.label).width;
          const roomL = x - pr * 1.6 - tw - M * .024 >= W * .02, roomR = x + pr * 1.6 + tw + M * .03 <= W * .97;
          const left = (pin.side === 'left' && roomL) || (!roomR && roomL);   // the preferred side, unless it would leave the frame
          const lx = clamp(left ? x - pr * 1.6 - tw - M * .024 : x + pr * 1.6, W * .02, W * .98 - tw - M * .024), ly = y - drop - M * .024;
          rrect(lx, ly, tw + M * .024, M * .048, M * .01); ctx.fillStyle = C.ink; ctx.fill();
          ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(pin.label, lx + M * .012, ly + M * .033); ctx.restore();
        });
        if (s.stats) {   // a stack of small figures beside (or under) the map
          s.stats.forEach((st, i) => {
            const q = ease((S.r - .6 - i * step(s.stats.length)) * PACE / .5); if (q <= 0) return;
            const colW = W * .84 / s.stats.length, x = V ? W * .08 + i * colW : tx, y = V ? H * .12 + M * .17 + n * M * .07 : (H * .2 + M * .14 + n * M * .07) + i * M * .13;
            ctx.save(); ctx.globalAlpha = q; ctx.textAlign = 'left';
            if (V) fit(st.value, 'serif', M * .06, 700, colW - M * .03); else ctx.font = font('serif', M * .066, 700); ctx.fillStyle = C.red; ctx.fillText(st.value, x, y);
            ctx.font = font('mono', M * .02, 500); ctx.fillStyle = C.muted; ctx.fillText(st.label.toUpperCase(), x, y + M * .036); ctx.restore();
          });
        }
        sourceLine(s.source, u);
      };
    },

    quote(s) {
      return u => {
        const x = V ? W * .08 : W * .14, maxW = V ? W * .84 : W * .72, y0 = V ? H * .3 : H * .3;
        ctx.save(); ctx.globalAlpha *= ease(u / .6); ctx.font = font('serif', M * .32, 700); ctx.fillStyle = C.gold; ctx.textAlign = 'left'; ctx.fillText('“', x - M * .04, y0 + M * .1); ctx.restore();
        ctx.font = font('serif', M * (V ? .06 : .058), 500);
        const n = karaoke(s.text, x, y0 + M * .1, maxW, M * (V ? .075 : .072), u - .3);
        const q = ease((u - .6 - n * .3) / .5); ctx.save(); ctx.globalAlpha *= q;
        const by = y0 + M * .14 + n * M * .072; ctx.fillStyle = C.red; ctx.fillRect(x, by, M * .05, Math.max(3, M * .004));
        ctx.font = font('sans', M * .032, 800); ctx.fillStyle = C.ink; ctx.fillText(s.who, x, by + M * .06);
        ctx.font = font('sans', M * .026, 500); ctx.fillStyle = C.ink2; wrap(s.role || '', maxW).forEach((l, li) => ctx.fillText(l, x, by + M * .1 + li * M * .036)); ctx.restore();
        sourceLine(s.source, u);
      };
    },

    // Numbered points that tick in.
    list(s) {
      return u => {
        const tx = V ? W * .08 : pad();
        kicker(s.kicker || '', tx, H * (V ? .18 : .16), u, C.red);
        ctx.font = font('serif', M * .068, 600); ctx.fillStyle = C.ink;
        const n = riseText(s.title, tx, H * (V ? .18 : .16) + M * .09, V ? W * .84 : W * .8, M * .076, u - .2);
        const y0 = H * (V ? .18 : .16) + M * .16 + n * M * .076, rowH = Math.min(V ? M * .13 : M * .11, (H * (V ? .74 : .8) - y0) / Math.max(1, s.items.length - .5));
        const N = s.items.length;
        s.items.forEach((it, i) => {
          const q = itemQ(i, N); if (q <= 0) return;
          const g = glow(i, N), y = y0 + i * rowH; ctx.save(); ctx.globalAlpha *= q * (g || S.r > S.vd ? 1 : .55); ctx.translate((1 - q) * -M * .06, 0);
          if (g) { rrect(tx - M * .015, y - rowH * .42, W - tx - pad() * .3, rowH * .84, M * .016); ctx.fillStyle = 'rgba(184,20,31,.08)'; ctx.fill(); }
          ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(tx + M * .03, y, M * .03 * (1 + g * .12), 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = font('mono', M * .028, 500); ctx.textAlign = 'center'; ctx.fillText(String(i + 1), tx + M * .03, y + M * .01);
          ctx.fillStyle = g ? C.red : C.ink; fit(it, 'sans', M * .04, 700, W - tx - M * .09 - pad() * .5); ctx.textAlign = 'left'; ctx.fillText(it, tx + M * .09, y + M * .014);
          ctx.restore();
        });
        sourceLine(s.source, u);
      };
    },

    // The subject cut out as a sticker, a giant headline behind it, a duotone of the photo behind that.
    cutout(s) {
      return u => {
        const rec = IMG[s.src], k = clamp(S.r / Math.max(3, S.dur)), right = (s.side || 'right') === 'right';
        if (!rec) return;
        duoBackdrop(rec, 1, k);
        const vg = ctx.createLinearGradient(0, 0, W, 0); vg.addColorStop(0, 'rgba(15,20,34,.75)'); vg.addColorStop(1, 'rgba(15,20,34,.15)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        // giant headline, sliding slowly, behind the subject
        ctx.save(); ctx.font = font('serif', M * (V ? .13 : .16), 700); ctx.fillStyle = '#fff'; ctx.globalAlpha *= ease((u - .1) / .5);
        const lines = wrap(s.title || '', V ? W * .9 : W * .5), lh = M * (V ? .13 : .16) * 1.02;
        lines.forEach((l, i) => ctx.fillText(l, (V ? W * .06 : pad()) - (1 - ease((u - .1 - i * .08) / .6)) * W * .1 - k * W * .02 * (right ? 1 : -1), (V ? H * .2 : H * .3) + i * lh));
        ctx.restore();
        if (s.kicker) { ctx.save(); ctx.font = font('mono', M * .024, 500); const kw = ctx.measureText(s.kicker.toUpperCase()).width + M * .04; const ky = V ? H * .13 : H * .17;
          ctx.globalAlpha *= ease(u / .4); ctx.fillStyle = C.red; ctx.fillRect(V ? W * .06 : pad(), ky - M * .032, kw, M * .046); ctx.fillStyle = '#fff'; ctx.fillText(s.kicker.toUpperCase(), (V ? W * .06 : pad()) + M * .02, ky); ctx.restore(); }
        // the subject: pops up from the bottom, then floats against the background
        if (rec.cut) {
          const hgt = H * (V ? .6 : .88), wid = hgt * iw(rec.cut) / ih(rec.cut), maxW = W * (V ? .92 : .44);
          const sc = Math.min(1, maxW / wid) * (1 + .035 * Math.sin(S.r * 1.3)), w = wid * sc, h = hgt * sc;
          const x = V ? (W - w) / 2 : right ? W - w - W * .04 : W * .04, y = H - h + (1 - back((u - .15) / .7)) * H * .5;
          ctx.save(); ctx.translate(x + w / 2 + k * W * .015 * (right ? -1 : 1), y + h); ctx.rotate(Math.sin(S.r * .8) * .012); sticker(rec, -w / 2, -h, w, h); ctx.restore();
        }
        sourceLine(s.source, u);
      };
    },

    // Up to four photos as polaroids that fly in with a 3D turn; the one being talked about comes forward.
    collage(s) {
      return u => {
        const ps = (s.photos || []).map(p => typeof p === 'string' ? { src: p } : p).filter(p => IMG[p.src]), n = ps.length; if (!n) return;
        const tx = V ? W / 2 : pad(), align = V ? 'center' : 'left';
        if (s.kicker) kicker(s.kicker, tx, H * (V ? .12 : .14), u, C.red, align);
        if (s.title) { ctx.font = font('serif', M * .062, 600); ctx.fillStyle = C.ink; riseText(s.title, tx, H * (V ? .12 : .14) + M * .085, V ? W * .84 : W * .8, M * .07, u - .2, { align }); }
        const cw = V ? W * .62 : Math.min(W * .3, W * .82 / n), chh = cw * .72, cur = now(n);
        const order = [...ps.keys()].sort((a, b) => (a === cur) - (b === cur));
        for (const i of order) {
          const q = itemQ(i, n, .7); if (q <= 0) continue;
          const f = n === 1 ? .5 : i / (n - 1);
          const hx = V ? W / 2 + (i % 2 ? 1 : -1) * W * .08 : lerp(W * .18 + cw * .2, W * .82 - cw * .2, f), hy = V ? lerp(H * .36, H * .62, f) : H * (.56 + (i % 2 ? .06 : -.02));
          const fromX = hx + (i % 2 ? 1 : -1) * W * .7, g = glow(i, n);
          const cx = lerp(fromX, hx, ease(q)) + Math.sin(S.r * .9 + i) * M * .006, cy = hy + (1 - ease(q)) * H * .2 + Math.cos(S.r * .7 + i) * M * .005;
          const ry = (1 - ease(q)) * 1.1 * (i % 2 ? -1 : 1), rz = ((i % 3) - 1) * .06 * (1 - g * .7) + (1 - q) * .3;
          const sc = 1 + g * .14;
          card3d(IMG[ps[i].src].img, cx, cy, cw * sc, chh * sc, ry, rz, ps[i].caption || '');
        }
        sourceLine(s.source, u);
      };
    },

    // A full-frame photo. style: 'kenburns' (default), 'duotone' (brand duotone + halftone) or
    // 'parallax' (the cut-out subject floats off its own background in 2.5D).
    photo(s) {
      const im = new Image(); im.src = s.src;
      return u => {
        const rec = IMG[s.src];
        if (s.style === 'duotone' && rec) {
          duoBackdrop(rec, 1, clamp(S.r / Math.max(3, S.dur)));
          const g = ctx.createLinearGradient(0, H * .4, 0, H); g.addColorStop(0, 'rgba(15,20,34,0)'); g.addColorStop(1, 'rgba(15,20,34,.8)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        } else if (s.style === 'parallax' && rec?.cut && rec.box) {
          const k = clamp(S.r / Math.max(3, S.dur)), b = rec.box, fx = V ? (s.focusV ?? s.focus ?? .5) : (s.focus ?? .5);
          const base = Math.max(W / b.W, H / b.H), z1 = lerp(1.06, 1.12, easeIO(k)), z2 = lerp(1.06, 1.3, easeIO(k));
          const ox = (W - b.W * base * z1) * fx - k * W * .02, oy = (H - b.H * base * z1) / 2;
          ctx.save(); ctx.filter = `blur(${Math.round(M * .004 + k * M * .006)}px)`; ctx.drawImage(rec.img, ox, oy, b.W * base * z1, b.H * base * z1); ctx.restore();
          ctx.fillStyle = 'rgba(15,20,34,.25)'; ctx.fillRect(0, 0, W, H);
          // the subject sits where it was, but scales and shifts more: depth
          const cxs = ox + (b.x + b.w / 2) * base * z1, cys = oy + (b.y + b.h) * base * z1, sw = b.w * base * z2, sh = b.h * base * z2;
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = M * .05; ctx.drawImage(rec.cut, cxs - sw / 2 + k * W * .025, cys - sh + (z2 - z1) * sh * .1, sw, sh); ctx.restore();
          const g = ctx.createLinearGradient(0, H * .45, 0, H); g.addColorStop(0, 'rgba(15,20,34,0)'); g.addColorStop(1, 'rgba(15,20,34,.8)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        } else if (im.complete && im.naturalWidth) {
          const k = clamp(S.r / Math.max(3, S.dur)), sc = Math.max(W / im.naturalWidth, H / im.naturalHeight) * lerp(1.08, 1.26, easeIO(k));
          ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(lerp(-.012, .012, k)); ctx.translate(-W / 2, -H / 2);
          const dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
          const fx = V ? (s.focusV ?? s.focus ?? .5) : (s.focus ?? .5);   // which part of a wide photo stays in frame (0 left … 1 right)
          ctx.drawImage(im, (W - dw) * fx + lerp(0, -W * .02, u / 8), (H - dh) / 2, dw, dh);
          ctx.restore();
          const sw = ((S.r * .35) % 1.4) - .2, lg = ctx.createLinearGradient(W * sw - W * .3, 0, W * sw + W * .3, H);   // light sweep
          lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.10)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
          const g = ctx.createLinearGradient(0, H * .45, 0, H); g.addColorStop(0, 'rgba(15,20,34,0)'); g.addColorStop(1, 'rgba(15,20,34,.85)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        if (u < .3) { ctx.save(); ctx.globalAlpha = (1 - u / .3) * .6; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }   // a flash on the cut
        ctx.font = font('serif', M * .07, 600); ctx.fillStyle = '#fff';
        riseText(s.title || '', pad(), H * (V ? .62 : .66), V ? W * .84 : W * .7, M * .08, u - .3);
      };
    },

    outro(s) {
      return u => {
        const cx = W / 2, cy = H * (V ? .42 : .42);
        const q = back(u / .7); ctx.save(); ctx.translate(cx, cy - M * .14); ctx.scale(q, q); drawMark(0, 0, M * .16); ctx.restore();
        ctx.font = font('serif', M * .085, 700); ctx.fillStyle = C.ink; ctx.textAlign = 'center';
        ctx.save(); ctx.globalAlpha *= ease((u - .3) / .5); ctx.fillText('Raisina Wire', cx, cy + M * .06); ctx.restore();
        ctx.font = font('sans', M * .034, 600); ctx.fillStyle = C.ink2; riseText(s.title || '', cx, cy + M * .14, V ? W * .84 : W * .6, M * .046, u - .6, { align: 'center', stagger: .03 });
        ctx.save(); ctx.globalAlpha *= ease((u - 1.1) / .5); ctx.font = font('mono', M * .026, 500); ctx.fillStyle = C.red; ctx.fillText((s.url || 'raisinawire.calibrex.org').toUpperCase(), cx, cy + M * .26); ctx.restore();
      };
    }
  };

  /* ---------- brand chrome ---------- */
  // The Raisina Hill skyline as line art (central dome, colonnade, North and South Block), after src/brand.js.
  const cols = (x0, x1, st, y0, y1) => { let d = ''; for (let x = x0; x <= x1; x += st) d += `M${x} ${y0}V${y1}`; return d; };
  const side = (x0, x1) => { const c = (x0 + x1) / 2; return `M${x0} 112V82H${x1}V112M${x0 - 3} 82H${x1 + 3}M${x0} 86H${x1}${cols(x0 + 8, x1 - 8, 9, 91, 108)}M${c - 12} 82V72H${c + 12}V82M${c - 14} 72H${c + 14}M${c - 11} 72C${c - 11} 63 ${c - 6} 58 ${c} 58C${c + 6} 58 ${c + 11} 63 ${c + 11} 72M${c} 58V51M${c - 2} 51H${c + 2}`; };
  const SKYLINE = new Path2D('M0 112H600' + side(36, 150) + side(450, 564) + 'M150 112V97H200M400 97H450V112M150 100H200M400 100H450M200 112V84H400V112M194 84H406M200 88H400'
    + cols(210, 390, 8, 92, 112) + 'M260 84V68H340V84M254 68H346M258 72H342' + cols(266, 334, 8, 73, 84)
    + 'M264 68C264 41 281 25 300 25C319 25 336 41 336 68M300 25V68M285 30C278 41 276 55 276 68M315 30C322 41 324 55 324 68M294 25V17H306V25M291 17H309M300 17V8M297 8H303');
  function skyline(x, y, width, u, col = C.ink, alpha = .5) {
    const sc = width / 600, p = easeIO(u / 2.2); if (p <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.beginPath(); ctx.rect(x, y - 120 * sc, width * p, 124 * sc); ctx.clip();
    ctx.translate(x, y - 112 * sc); ctx.scale(sc, sc); ctx.strokeStyle = col; ctx.lineWidth = 1.3 / sc * (M / 1080) * 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(SKYLINE); ctx.restore();
  }
  // The dome mark on a crimson tile with tricolour bars, after src/brand.js.
  function drawMark(x, y, size) {
    const s = size / 100; ctx.save(); ctx.translate(x - size / 2, y - size / 2);
    rrect(0, 0, size, size, size * .2); ctx.fillStyle = C.red; ctx.fill();
    ctx.save(); ctx.translate(size * .14, size * .1); ctx.scale(s * .72, s * .72);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(new Path2D('M50 12V22M47 12H53M27 46A23 22 0 0 1 73 46M33 37H67M24 46H76M26 51H74M23 61H77M8 70H92M6 81H94M4 86H96M31 51V61M37.3 51V61M43.6 51V61M49.9 51V61M56.2 51V61M62.5 51V61M68.8 51V61M14 70V81M26 70V81M38 70V81M50 70V81M62 70V81M74 70V81M86 70V81'));
    ctx.restore();
    [C.saffron, '#fff', C.green].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(size * (.14 + i * .24), size * .84, size * .22, size * .06); });
    ctx.restore();
  }
  function chrome(t, total) {
    const ms = M * .05, x = pad(), y = V ? H * .05 : M * .06;
    ctx.save(); ctx.font = font('sans', M * .024, 800); const bw = ms * 1.3 + ctx.measureText('RAISINA WIRE').width + M * .03;   // a light pill keeps the logo readable over photos
    rrect(x - M * .012, y - M * .01, bw, ms + M * .02, (ms + M * .02) / 2); ctx.fillStyle = 'rgba(245,241,234,.82)'; ctx.fill(); ctx.restore();
    drawMark(x + ms / 2, y + ms / 2, ms);
    ctx.font = font('sans', M * .024, 800); ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText('RAISINA', x + ms * 1.3, y + ms * .48);
    ctx.fillStyle = C.red; ctx.fillText('WIRE', x + ms * 1.3 + ctx.measureText('RAISINA ').width, y + ms * .48);
    ctx.font = font('mono', M * .016, 500); ctx.fillStyle = C.muted; ctx.fillText((spec.series || 'EXPLAINED').toUpperCase(), x + ms * 1.3, y + ms * .9);
    // ticker: a red tag and the headline scrolling, always moving
    const th = M * .044, ty = H - Math.max(4, M * .006) - th;
    ctx.save(); ctx.fillStyle = 'rgba(15,20,34,.9)'; ctx.fillRect(0, ty, W, th);
    ctx.font = font('mono', th * .4, 500); const tag = 'RAISINA WIRE · EXPLAINED', tagW = ctx.measureText(tag).width + th;
    const msg = `${(spec.title || '').toUpperCase()}   ●   ${(spec.ticker || 'RAISINAWIRE.CALIBREX.ORG').toUpperCase()}   ●   `, mw = ctx.measureText(msg).width, sx = tagW - (t * M * .09) % mw;
    ctx.beginPath(); ctx.rect(tagW, ty, W - tagW, th); ctx.clip(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    for (let x = sx; x < W; x += mw) ctx.fillText(msg, x, ty + th * .66);
    ctx.restore(); ctx.save(); ctx.fillStyle = C.red; ctx.fillRect(0, ty, tagW - th * .4, th); ctx.font = font('mono', th * .4, 500); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(tag, th * .4, ty + th * .66); ctx.restore();
    ctx.fillStyle = C.line; ctx.fillRect(0, H - Math.max(4, M * .006), W, Math.max(4, M * .006));
    ctx.fillStyle = C.red; ctx.fillRect(0, H - Math.max(4, M * .006), W * clamp(t / total), Math.max(4, M * .006));
  }
  function captions(t) {
    if (spec.captions === false) return;
    const c = timing.captions.find(c => t >= c.t0 && t < c.t1); if (!c) return;
    const fs = M * (V ? .036 : .034); ctx.font = font('sans', fs, 700);
    const lines = wrap(c.text, V ? W * .84 : W * .7), lh = fs * 1.3, bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + fs * 1.2, bh = lines.length * lh + fs * .6;
    const cy = V ? H * .8 : H * .85, a = clamp((t - c.t0) / .12) * clamp((c.t1 - t) / .12);
    ctx.save(); ctx.globalAlpha = a; rrect(W / 2 - bw / 2, cy - bh / 2, bw, bh, fs * .35); ctx.fillStyle = 'rgba(15,20,34,.88)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; lines.forEach((l, i) => ctx.fillText(l, W / 2, cy - bh / 2 + fs * .3 + (i + .78) * lh)); ctx.restore();
  }
  function background(t) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    // two soft glows that drift, like the site's
    const g1 = ctx.createRadialGradient(W * (.85 + .03 * Math.sin(t * .2)), H * .1, 0, W * .85, H * .1, M * .9);
    g1.addColorStop(0, 'rgba(233,189,120,.28)'); g1.addColorStop(1, 'rgba(233,189,120,0)'); ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W * .05, H * (.95 + .03 * Math.cos(t * .17)), 0, W * .05, H * .95, M * .8);
    g2.addColorStop(0, 'rgba(184,20,31,.08)'); g2.addColorStop(1, 'rgba(184,20,31,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    // motion graphics that never stop: a drifting grid, slow-turning rings and diagonal hairlines
    ctx.save(); ctx.strokeStyle = 'rgba(15,20,34,.045)'; ctx.lineWidth = 1; const gs = M * .09, off = (t * M * .012) % gs;
    for (let x = -gs + off; x < W + gs; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -gs + off * .6; y < H + gs; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(184,20,31,.07)'; ctx.lineWidth = Math.max(2, M * .003);
    for (let k = 0; k < 3; k++) { const r = M * (.32 + k * .14), a = t * (.12 + k * .05) * (k % 2 ? -1 : 1);
      ctx.beginPath(); ctx.arc(W * (V ? .85 : .9), H * (V ? .12 : .2), r, a, a + Math.PI * (1.1 + k * .2)); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(233,189,120,.18)'; ctx.lineWidth = Math.max(1.5, M * .002);
    for (let k = 0; k < 5; k++) { const x = ((k * .27 + t * .025) % 1.4 - .2) * W; ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H * .55, 0); ctx.stroke(); }
    ctx.restore();
    // fine paper grain from a fixed pattern
    ctx.fillStyle = GRAIN; ctx.globalAlpha = .5; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  }
  let GRAIN = null;
  function makeGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), d = g.createImageData(256, 256);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 10; }
    g.putImageData(d, 0, 0); GRAIN = ctx.createPattern(c, 'repeat');
  }

  /* ---------- transitions: a crimson wipe, an iris and a split shutter, in turn ---------- */
  function transition(kind, p) {
    ctx.save(); ctx.fillStyle = C.red;
    if (kind === 0) {
      const x0 = lerp(-W * .3, W * 1.05, easeIO(p)); ctx.globalAlpha = .95 * Math.sin(Math.PI * p);
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + W * .22, 0); ctx.lineTo(x0 + W * .12, H); ctx.lineTo(x0 - W * .1, H); ctx.fill();
    } else if (kind === 1) {
      const r = Math.hypot(W, H) * .6 * Math.sin(Math.PI * p); ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, TAU); ctx.arc(W / 2, H / 2, r * clamp(p * 1.6 - .3), 0, TAU, true); ctx.fill();
    } else {
      const h = H / 2 * Math.sin(Math.PI * p); ctx.globalAlpha = .95; ctx.fillRect(0, 0, W, h * .9); ctx.fillStyle = C.ink; ctx.fillRect(0, H - h * .9, W, h * .9);
    }
    ctx.restore();
  }

  /* ---------- timeline ---------- */
  // `pace` speeds every entrance (1 = calm, 1.6 = brisk); fast pieces also cut with a push and a red wipe.
  let built = [], PACE = 1;
  function draw(t) {
    background(t);
    const total = timing.total, OUT = PACE > 1.2 ? .25 : .45, fast = PACE > 1.2;
    for (let i = 0; i < built.length; i++) {
      const sc = timing.scenes[i], u = t - sc.start, end = sc.start + sc.dur;
      if (t < sc.start || t > end + OUT) continue;
      const out = clamp((t - end) / OUT), inn = fast ? ease(u / .35) : 1;
      S = { r: u, vd: sc.voiceDur || sc.dur * .8, dur: sc.dur };
      // camera: a slow push and drift through the whole scene, plus a punch on every new caption line
      const caps = timing.captions.filter(c => c.t0 >= sc.start - .01 && c.t0 < end), ci = caps.findLastIndex(c => c.t0 <= t);
      const since = ci > 0 ? t - caps[ci].t0 : 9, punch = .028 * Math.exp(-since * 7), dir = ci % 2 ? 1 : -1, kk = clamp(u / Math.max(2, sc.dur));
      const z = (fast ? lerp(1.06, 1, inn) : 1) * lerp(1, 1.045, easeIO(kk)) * (1 + punch);
      const dx = Math.sin(u * .5 + i) * M * .006 + dir * punch * W * .35 - out * W * .06, dy = Math.cos(u * .4 + i * 2) * M * .005;
      ctx.save(); ctx.globalAlpha = 1 - ease(out);
      ctx.translate(W / 2 + dx, H / 2 + dy); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
      if (!fast) ctx.translate(0, -out * M * .03);
      const bg = spec.scenes[i].bg; if (bg && IMG[bg]) { duoBackdrop(IMG[bg], .16, kk); ctx.fillStyle = 'rgba(245,241,234,.55)'; ctx.fillRect(0, 0, W, H); }
      built[i](u * PACE, sc.dur); ctx.restore();
      if (fast && i > 0 && u < .42) transition(i % 3, u / .42);
    }
    chrome(t, total); captions(t);
  }
  async function load(s, tm, w, h, canvas) {
    spec = s; timing = tm; W = w; H = h; PACE = Number(s.pace || 1); M = Math.min(w, h); V = h > w;
    canvas.width = w; canvas.height = h; ctx = canvas.getContext('2d');
    await document.fonts.load(font('serif', 40, 600)); await document.fonts.load(font('sans', 40, 700)); await document.fonts.load(font('mono', 40, 500));
    LAND = await fetch('land.json').then(r => r.json()).catch(() => []);
    makeGrain();
    makeHalftone();
    const loadImg = src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
    const srcs = new Set(), cuts = {};
    for (const sc of spec.scenes) {
      for (const p of [sc.src, sc.bg, ...(sc.photos || []).map(p => typeof p === 'string' ? p : p.src)]) if (p) srcs.add(p);
      if (sc.cut) cuts[sc.src] = { cut: sc.cut, box: sc.cutBox };
    }
    await Promise.all([...srcs].map(async src => {
      const img = await loadImg(src); if (!img) return;
      const rec = IMG[src] = { img, duo: makeDuotone(img) };
      if (cuts[src]) { const c = await loadImg(cuts[src].cut); if (c) { rec.cut = c; rec.sil = makeSilhouette(c); rec.box = cuts[src].box; } }
    }));
    built = spec.scenes.map(sc => (SCENES[sc.type] || SCENES.title)(sc));
    return { total: timing.total };
  }
  window.RW = { load, draw, scenes: Object.keys(SCENES) };
})();

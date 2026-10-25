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
    ctx.textAlign = 'left'; ctx.fillText(('Source: ' + text).toUpperCase(), pad(), H - (V ? H * .055 : M * .045)); ctx.restore();
  }
  // Largest font size (≤ px) at which text fits maxW.
  function fit(text, fam, px, w, maxW) { let f = px; ctx.font = font(fam, f, w); const tw = ctx.measureText(text).width; if (tw > maxW) { f = px * maxW / tw; ctx.font = font(fam, f, w); } return f; }
  const pad = () => V ? W * .08 : W * .07;
  const counter = (v, p, dec = 0) => (v * easeIO(p)).toFixed(dec);

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
        ctx.save(); const sc = lerp(.85, 1, back(u / .7)); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.globalAlpha *= ease(u / .4);
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
        const p = easeIO((u - .5) / 1.6), n = s.items.length;
        if (V) {   // vertical: a spine down the left, labels to the right
          const lx = W * .16, y0 = H * .36, y1 = H * .72;
          ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(3, M * .004); ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, lerp(y0, y1, p)); ctx.stroke();
          s.items.forEach((it, i) => {
            const f = n === 1 ? .5 : i / (n - 1), yy = lerp(y0 + M * .02, y1 - M * .02, f), q = ease((u - .6 - f * 1.4) / .5);
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
          const f = n === 1 ? .5 : i / (n - 1), x = lerp(x0 + M * .02, x1 - M * .02, f), q = ease((u - .6 - f * 1.4) / .5);
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
          const col = i % cols, row = Math.floor(i / cols), x = gx + col * (cw + gap), y = gy + row * (ch + gap), q = ease((u - .6 - i * .35) / .6);
          if (q <= 0) return;
          ctx.save(); ctx.globalAlpha *= q; ctx.translate(0, (1 - q) * M * .04);
          rrect(x, y, cw, ch, M * .02); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = i === (s.hot ?? 0) ? C.red : C.ink; ctx.fillRect(x, y, Math.max(6, M * .008), ch);
          const p = clamp((u - .7 - i * .35) / 1.2), num = it.inr ? inr(it.value * easeIO(p)) : counter(it.value, p, it.decimals || 0);
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
          const [x, y] = pos(i), q = back((u - .7 - i * .45) / .5);
          if (q <= 0) return;
          ctx.save(); ctx.globalAlpha *= clamp(q); ctx.translate(x + bw / 2, y + bh / 2); ctx.scale(lerp(.8, 1, q), lerp(.8, 1, q));
          rrect(-bw / 2, -bh / 2, bw, bh, M * .018); ctx.fillStyle = i === n - 1 ? C.red : '#ffffff'; ctx.fill(); ctx.strokeStyle = i === n - 1 ? C.red : C.ink; ctx.lineWidth = Math.max(2, M * .0025); ctx.stroke();
          ctx.fillStyle = i === n - 1 ? '#ffffff' : C.ink; ctx.font = font('sans', M * .03, 700); ctx.textAlign = 'center';
          const ls = wrap(label, bw - M * .04); ls.forEach((l, li) => ctx.fillText(l, 0, (li - (ls.length - 1) / 2) * M * .038 + M * .011));
          ctx.restore();
          if (i < n - 1) {   // arrow to the next box, drawn on
            const a = ease((u - .95 - i * .45) / .4); if (a <= 0) return;
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
          const q = ease((u - 1 - n * .45) / .6), [fx] = pos(0), [lx, ly] = pos(n - 1);
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
          const q = ease((u - .6 - i * .3) / .5); if (q <= 0) return;
          const y = y0 + i * rowH, p = easeIO((u - .7 - i * .3) / 1.1), bh = rowH * (V ? .34 : .46);
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
        const zoom = lerp(1.06, 1, easeIO(u / 3));
        const P = (lon, lat) => { const x = mx + (lon - lon0) / (lon1 - lon0) * mw, y = my + (lat1 - lat) / (lat1 - lat0) * mh; return [mx + mw / 2 + (x - mx - mw / 2) * zoom, my + mh / 2 + (y - my - mh / 2) * zoom]; };
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
        (s.pins || []).forEach((pin, i) => {
          const q = ease((u - 1 - i * .5) / .45); if (q <= 0) return;
          const [x, y] = P(pin.lon, pin.lat), drop = (1 - back((u - 1 - i * .5) / .45)) * M * .05;
          const pr = M * .016, pulse = (u - 1 - i * .5) % 1.6 / 1.6;
          ctx.save(); ctx.globalAlpha = (1 - pulse) * .45 * q; ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, pr * (1 + pulse * 2.4), 0, TAU); ctx.stroke(); ctx.restore();
          ctx.save(); ctx.globalAlpha = q; ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x, y - drop, pr, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - drop, pr * .38, 0, TAU); ctx.fill();
          ctx.font = font('sans', M * .028, 800); const tw = ctx.measureText(pin.label).width;
          const left = pin.side === 'left' || x + pr * 1.6 + tw + M * .03 > W * .97, lx = left ? x - pr * 1.6 - tw - M * .024 : x + pr * 1.6, ly = y - drop - M * .024;
          rrect(lx, ly, tw + M * .024, M * .048, M * .01); ctx.fillStyle = C.ink; ctx.fill();
          ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(pin.label, lx + M * .012, ly + M * .033); ctx.restore();
        });
        if (s.stats) {   // a stack of small figures beside (or under) the map
          s.stats.forEach((st, i) => {
            const q = ease((u - 2 - i * .35) / .5); if (q <= 0) return;
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
        ctx.font = font('serif', M * (V ? .06 : .058), 500); ctx.fillStyle = C.ink;
        const n = riseText(s.text, x, y0 + M * .1, maxW, M * (V ? .075 : .072), u - .3, { stagger: .05 });
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
        s.items.forEach((it, i) => {
          const q = ease((u - .8 - i * .45) / .5); if (q <= 0) return;
          const y = y0 + i * rowH; ctx.save(); ctx.globalAlpha *= q; ctx.translate((1 - q) * -M * .04, 0);
          ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(tx + M * .03, y, M * .03, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = font('mono', M * .028, 500); ctx.textAlign = 'center'; ctx.fillText(String(i + 1), tx + M * .03, y + M * .01);
          ctx.fillStyle = C.ink; ctx.font = font('sans', M * .04, 700); ctx.textAlign = 'left'; ctx.fillText(it, tx + M * .09, y + M * .014);
          ctx.restore();
        });
        sourceLine(s.source, u);
      };
    },

    // A full-frame photo with a slow push-in and a caption bar.
    photo(s) {
      const im = new Image(); im.src = s.src;
      return u => {
        if (im.complete && im.naturalWidth) {
          const sc = Math.max(W / im.naturalWidth, H / im.naturalHeight) * lerp(1.04, 1.14, u / 8);
          const dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
          const fx = V ? (s.focusV ?? s.focus ?? .5) : (s.focus ?? .5);   // which part of a wide photo stays in frame (0 left … 1 right)
          ctx.drawImage(im, (W - dw) * fx + lerp(0, -W * .02, u / 8), (H - dh) / 2, dw, dh);
          const g = ctx.createLinearGradient(0, H * .45, 0, H); g.addColorStop(0, 'rgba(15,20,34,0)'); g.addColorStop(1, 'rgba(15,20,34,.85)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
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
    drawMark(x + ms / 2, y + ms / 2, ms);
    ctx.font = font('sans', M * .024, 800); ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText('RAISINA', x + ms * 1.3, y + ms * .48);
    ctx.fillStyle = C.red; ctx.fillText('WIRE', x + ms * 1.3 + ctx.measureText('RAISINA ').width, y + ms * .48);
    ctx.font = font('mono', M * .016, 500); ctx.fillStyle = C.muted; ctx.fillText((spec.series || 'EXPLAINED').toUpperCase(), x + ms * 1.3, y + ms * .9);
    ctx.fillStyle = C.line; ctx.fillRect(0, H - Math.max(4, M * .006), W, Math.max(4, M * .006));
    ctx.fillStyle = C.red; ctx.fillRect(0, H - Math.max(4, M * .006), W * clamp(t / total), Math.max(4, M * .006));
  }
  function captions(t) {
    if (spec.captions === false) return;
    const c = timing.captions.find(c => t >= c.t0 && t < c.t1); if (!c) return;
    const fs = M * (V ? .036 : .034); ctx.font = font('sans', fs, 700);
    const lines = wrap(c.text, V ? W * .84 : W * .7), lh = fs * 1.3, bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + fs * 1.2, bh = lines.length * lh + fs * .6;
    const cy = V ? H * .82 : H * .87, a = clamp((t - c.t0) / .12) * clamp((c.t1 - t) / .12);
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
      ctx.save(); ctx.globalAlpha = 1 - ease(out);
      if (fast) {   // push in on entry, slide left on exit
        const z = lerp(1.06, 1, inn); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2 - out * W * .06, -H / 2);
      } else ctx.translate(0, -out * M * .03);
      built[i](u * PACE, sc.dur); ctx.restore();
      if (fast && i > 0 && u < .42) {   // a crimson wipe across the cut
        const p = u / .42, x0 = lerp(-W * .3, W * 1.05, easeIO(p));
        ctx.save(); ctx.fillStyle = C.red; ctx.globalAlpha = .95 * Math.sin(Math.PI * p);
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + W * .22, 0); ctx.lineTo(x0 + W * .12, H); ctx.lineTo(x0 - W * .1, H); ctx.fill(); ctx.restore();
      }
    }
    chrome(t, total); captions(t);
  }
  async function load(s, tm, w, h, canvas) {
    spec = s; timing = tm; W = w; H = h; PACE = Number(s.pace || 1); M = Math.min(w, h); V = h > w;
    canvas.width = w; canvas.height = h; ctx = canvas.getContext('2d');
    await document.fonts.load(font('serif', 40, 600)); await document.fonts.load(font('sans', 40, 700)); await document.fonts.load(font('mono', 40, 500));
    LAND = await fetch('land.json').then(r => r.json()).catch(() => []);
    makeGrain();
    built = spec.scenes.map(sc => (SCENES[sc.type] || SCENES.title)(sc));
    const imgs = spec.scenes.filter(sc => sc.type === 'photo').map(sc => new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = sc.src; }));
    await Promise.all(imgs);
    return { total: timing.total };
  }
  window.RW = { load, draw, scenes: Object.keys(SCENES) };
})();

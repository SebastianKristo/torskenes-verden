// Prompt 28: værbakgrunn i Apple-stil (fasit design/Vaer.dc.html → WxFx). Brukes av værsiden på web og i PWA-en.
// Én canvas bak innholdet. Lag: stjerner → sol → skyer → nedbør → tåke → lyn.
//  - Sol: posisjon fra dagens soloppgang/-nedgang (sunF 0–1), hvit kjerne, myk glød, sakte roterende stråler, horisontal
//    lysstripe, svake sekskantede linserefleksjoner og lysstøv. Varm oransje når sola står lavt. Ingen regnbueringer.
//  - Skyer: forhåndstegnede sprites (lys topp, skygge under) i dybdelag med ulik fart.
//  - Regn: 3 dybdelag + plask + dråper på «glasset». Torden: forgreinet lyn og blink.
//  - Snø: 3 lag + store uskarpe nærflak. Tåke: grå bånd som driver sideveis (aldri hvit flate bak tekst).
//  - Natt: blinkende stjerner, glimt-kors, svak melkevei og stjerneskudd.
// Parallakse fra mus/gyroskop, «Reduser bevegelse» = ett statisk bilde, pause når fanen/appen er i bakgrunnen.
// Ingen allokering per bilde utover gradienter; skyer, tåkebånd og snøflak er sprites.

const TAU = 6.2832;
const rnd = (a, b) => a + Math.random() * (b - a);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',');
const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };

const CFG = {
  part: { n: 4, base: '238,244,252', lit: '255,255,255', sh: '140,165,198', y: [0.1, 0.48], w: [0.55, 0.85], a: [0.75, 0.95] },
  partn: { n: 5, base: '70,85,115', lit: '118,134,166', sh: '18,26,46', y: [0.04, 0.48], w: [0.6, 0.95], a: [0.5, 0.75] },
  clouds: { n: 9, base: '198,208,221', lit: '238,242,248', sh: '86,100,122', y: [-0.1, 0.62], w: [0.7, 1.15], a: [0.45, 0.75] },
  rain: { n: 9, base: '108,118,134', lit: '150,160,176', sh: '28,34,46', y: [-0.14, 0.32], w: [0.8, 1.25], a: [0.6, 0.85] },
  snow: { n: 8, base: '188,196,209', lit: '232,236,243', sh: '108,118,136', y: [-0.12, 0.38], w: [0.75, 1.1], a: [0.5, 0.7] },
};
const GH = [[0.32, 0.018, '190,255,220', 0.09], [0.58, 0.042, '170,210,255', 0.055], [0.78, 0.011, '255,255,255', 0.14], [1.12, 0.068, '205,180,255', 0.04], [1.4, 0.028, '255,222,170', 0.07], [1.72, 0.1, '160,220,255', 0.028]];

function cloudSpr(base, lit, sh) {
  return mk(768, 320, (g, w, h) => {
    const P = [];
    for (let i = 0; i < 28; i++) { const u = rnd(0.07, 0.93), b = Math.sin(u * Math.PI), r = h * (0.09 + 0.22 * b) * rnd(0.75, 1.25); P.push([w * u, h * 0.72 - b * h * 0.3 * rnd(0.7, 1.1) + rnd(-8, 8), r]); }
    for (const [x, y, r] of P) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${base},.9)`); gr.addColorStop(0.6, `rgba(${base},.55)`); gr.addColorStop(1, `rgba(${base},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    for (const [x, y, r] of P) { const hx = x - r * 0.18, hy = y - r * 0.38, hr = r * 0.68, gr = g.createRadialGradient(hx, hy, 0, hx, hy, hr); gr.addColorStop(0, `rgba(${lit},.6)`); gr.addColorStop(1, `rgba(${lit},0)`); g.fillStyle = gr; g.beginPath(); g.arc(hx, hy, hr, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(0, h * 0.3, 0, h * 0.95); lg.addColorStop(0, `rgba(${sh},0)`); lg.addColorStop(1, `rgba(${sh},.7)`); g.fillStyle = lg; g.fillRect(0, 0, w, h);
  });
}
let BAND = null, FLAKE = null;
const bandSpr = () => BAND ??= mk(512, 128, (g, w, h) => { g.setTransform(1, 0, 0, h / w, 0, 0); const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(205,211,219,.9)'); gr.addColorStop(0.5, 'rgba(205,211,219,.45)'); gr.addColorStop(1, 'rgba(205,211,219,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const flakeSpr = () => FLAKE ??= mk(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });

/** sunF fra soloppgang/-nedgang (Date, ISO eller ms). Utenfor dagen klemmes den til 0/1. */
export function sunFrac(rise, set, now = Date.now()) {
  const a = rise == null ? NaN : +new Date(rise), b = set == null ? NaN : +new Date(set);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0.5;
  return cl((now - a) / (b - a), 0, 1);
}

/**
 * Værslag fra ikonnøkkel/WMO: 'sun' | 'part' | 'partn' | 'stars' | 'clouds' | 'rain' | 'snow' | 'fog'.
 * kind: clear, partly, cloudy, fog, drizzle, rain, sleet, snow, thunder (eller WMO-kode via code).
 */
export function fxKindOf(kind, day, code) {
  const n = Number(code);
  if (kind == null && code != null && code !== '' && Number.isFinite(n)) {
    kind = n >= 95 ? 'thunder' : (n >= 71 && n <= 77) || n === 85 || n === 86 ? 'snow' : (n >= 51 && n <= 67) || (n >= 80 && n <= 82) ? 'rain' : n === 45 || n === 48 ? 'fog' : n === 3 ? 'cloudy' : n === 2 || n === 1 ? 'partly' : 'clear';
  }
  const heavy = n === 65 || n === 82 || n >= 95 || kind === 'thunder';
  const k = kind === 'snow' || kind === 'sleet' ? 'snow' : kind === 'rain' || kind === 'drizzle' || kind === 'thunder' ? 'rain' : kind === 'fog' ? 'fog' : kind === 'cloudy' ? 'clouds' : kind === 'partly' ? (day ? 'part' : 'partn') : day ? 'sun' : 'stars';
  return { kind: k, heavy, thunder: kind === 'thunder', day: !!day };
}

/** Starter animasjonen på canvas-elementet. Returnerer { set(opts), stop() }. */
export function createWxFx(cv, init = {}) {
  const ctx = cv.getContext('2d');
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let W = 0, Hh = 0, m = 1, raf = 0, tmo = 0, alive = true, t0 = performance.now(), last = t0;
  let o = { kind: 'sun', heavy: false, thunder: false, day: true, sunF: 0.5, ...init };
  let tx = 0, ty = 0, px = 0, py = 0;
  let stars = [], drops = [], flakes = [], clouds = [], fogs = [], spl = [], glass = [], motes = [], sprs = [], RAYS = [];
  let shoot = null, bolt = null, flash = 0, nextBolt = 0, nextShoot = 0;
  const red = () => mq.matches;
  const onP = (e) => { if (e.pointerType === 'touch') return; tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; };
  const onO = (e) => { if (e.gamma == null) return; tx = cl(e.gamma / 25, -1, 1); ty = cl((e.beta - 45) / 25, -1, 1); };
  addEventListener('pointermove', onP, { passive: true });
  addEventListener('deviceorientation', onO, { passive: true });
  const rad = (x, y, r, st) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); for (const [a, c] of st) g.addColorStop(a, c); return g; };
  const newG = (top) => ({ x: rnd(0, W), y: top ? rnd(-20, 0) : rnd(0, Hh), r: rnd(1.8, 5.2), v: 0, sl: false, tr: [] });

  function sprites() {
    const CF = CFG[o.kind];
    sprs = CF ? [0, 1, 2].map(() => cloudSpr(CF.base, CF.lit, CF.sh)) : [];
    RAYS = [...Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * TAU + 0.35, l: 1.15, w: 2.2, s: 0.3, o: i, al: 0.9 })), ...Array.from({ length: 54 }, () => ({ a: rnd(0, TAU), l: rnd(0.18, 0.85), w: rnd(0.5, 1.5), s: rnd(0.2, 0.8), o: rnd(0, TAU), al: rnd(0.25, 0.7) }))];
  }
  function seed() {
    const k = o.kind, heavy = o.heavy, CF = CFG[k];
    stars = Array.from({ length: Math.round((W * Hh) / 2200) }, () => ({ x: rnd(0, W), y: rnd(0, Hh * 0.72), r: rnd(0.35, 1.5), a: rnd(0.3, 1), s: rnd(0.4, 1.8), o: rnd(0, TAU), g: Math.random() < 0.06, c: Math.random() < 0.15 ? '200,215,255' : Math.random() < 0.1 ? '255,235,205' : '255,255,255' }));
    drops = k !== 'rain' ? [] : Array.from({ length: heavy ? 320 : 180 }, () => { const z = Math.random() < 0.4 ? 0 : Math.random() < 0.6 ? 1 : 2; return { z, x: rnd(-Hh * 0.2, W), y: rnd(-Hh, Hh), l: [10, 18, 30][z] * rnd(0.8, 1.2), v: [700, 1000, 1450][z] * rnd(0.9, 1.1), end: z === 2 ? rnd(0.82, 1) * Hh : Hh + 40 }; });
    glass = k !== 'rain' ? [] : Array.from({ length: heavy ? 28 : 18 }, () => newG(false));
    spl = [];
    flakes = k !== 'snow' ? [] : [...Array.from({ length: Math.max(90, Math.round((W * Hh) / 3000)) }, () => { const z = Math.random() < 0.45 ? 0 : Math.random() < 0.65 ? 1 : 2; return { z, bx: rnd(0, W), y: rnd(-Hh, Hh), r: [1.3, 2.3, 3.8][z] * rnd(0.8, 1.3), v: [18, 34, 62][z] * rnd(0.8, 1.2), am: [6, 12, 22][z], f: rnd(0.3, 0.8), ph: rnd(0, TAU) }; }), ...Array.from({ length: 7 }, () => ({ z: 3, bx: rnd(0, W), y: rnd(-Hh, Hh), r: rnd(7, 13), v: rnd(80, 110), am: 30, f: rnd(0.2, 0.4), ph: rnd(0, TAU) }))];
    clouds = CF ? Array.from({ length: CF.n }, (_, i) => { const z = (i + 0.5) / CF.n; return { z, s: sprs[i % 3], x: rnd(-0.3, 1) * W, y: rnd(CF.y[0], CF.y[1]) * Hh, w: rnd(CF.w[0], CF.w[1]) * W * (0.6 + 0.5 * z), a: rnd(CF.a[0], CF.a[1]) * (0.6 + 0.4 * z), v: 4 + 15 * z, ph: rnd(0, TAU) }; }).sort((a, b) => a.z - b.z) : [];
    fogs = k === 'fog' ? Array.from({ length: 9 }, (_, i) => { const z = i / 8; return { z, y: rnd(0.1, 1.05) * Hh, w: rnd(1.3, 2.2) * W, hr: rnd(0.16, 0.28), v: (4 + 11 * z) * (i % 2 ? 1 : -1), a: 0.05 + 0.07 * z, ph: rnd(0, TAU), x: rnd(-1, 0.2) * W }; }) : [];
    motes = Array.from({ length: 16 }, () => ({ dx: rnd(-0.6, 0.6), dy: rnd(-0.1, 0.7), r: rnd(1.5, 5), a: rnd(0.1, 0.35), s: rnd(0.2, 0.6), o: rnd(0, TAU) }));
    const now = performance.now(); nextBolt = now + rnd(2500, 6000); nextShoot = now + rnd(4000, 9000); shoot = null; bolt = null; flash = 0;
  }
  function size() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (!r.width || !r.height) return false;
    W = r.width; Hh = r.height; m = Math.min(W, Hh);
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed(); return true;
  }

  function sun(t, I, full) {
    const sf = cl(o.sunF ?? 0.5, 0, 1), el = Math.sin(Math.PI * sf), warm = Math.pow(1 - el, 1.5);
    const cx = W * (0.2 + 0.6 * sf) + px * 6, cy = Hh * (0.16 - 0.1 * el) + py * 4, R = Math.max(W, Hh) * 1.05, c = mix([255, 250, 238], [255, 188, 128], warm);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rad(cx, cy, R, [[0, `rgba(${c},${0.42 * I})`], [0.12, `rgba(${c},${0.2 * I})`], [0.4, `rgba(${c},${0.06 * I})`], [1, `rgba(${c},0)`]]); ctx.fillRect(0, 0, W, Hh);
    if (warm > 0.35) { const w = (warm - 0.35) / 0.65, g = ctx.createLinearGradient(0, cy - Hh * 0.1, 0, Hh * 0.8); g.addColorStop(0, 'rgba(255,140,80,0)'); g.addColorStop(0.3, `rgba(255,140,80,${0.2 * w * I})`); g.addColorStop(1, 'rgba(255,110,90,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh); }
    if (full) {
      ctx.fillStyle = rad(cx, cy, m * 0.4, [[0, `rgba(255,255,255,${0.5 * I})`], [0.3, `rgba(${c},${0.18 * I})`], [1, `rgba(${c},0)`]]); ctx.beginPath(); ctx.arc(cx, cy, m * 0.4, 0, TAU); ctx.fill();
      const L = m * 0.95; ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.008); ctx.lineCap = 'round';
      ctx.strokeStyle = rad(0, 0, L, [[0, 'rgba(255,255,255,.55)'], [0.12, `rgba(${c},.22)`], [0.5, `rgba(${c},.05)`], [1, `rgba(${c},0)`]]);
      for (const r of RAYS) { const len = L * r.l * (0.82 + 0.18 * Math.sin(t * r.s + r.o)), i0 = m * 0.035; ctx.globalAlpha = r.al * I * (0.75 + 0.25 * Math.sin(t * r.s * 1.7 + r.o)); ctx.lineWidth = r.w; ctx.beginPath(); ctx.moveTo(Math.cos(r.a) * i0, Math.sin(r.a) * i0); ctx.lineTo(Math.cos(r.a) * len, Math.sin(r.a) * len); ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.028); ctx.fillStyle = rad(0, 0, W * 0.75, [[0, `rgba(215,232,255,${0.32 * I})`], [0.4, `rgba(200,222,255,${0.08 * I})`], [1, 'rgba(200,222,255,0)']]); ctx.beginPath(); ctx.arc(0, 0, W * 0.75, 0, TAU); ctx.fill(); ctx.restore();
      const ax = W * 0.5 - px * 22 - cx, ay = Hh * 0.5 - py * 22 - cy;
      for (const [f, r, col, a] of GH) {
        const x = cx + ax * f, y = cy + ay * f, rr = m * r;
        ctx.beginPath(); for (let j = 0; j < 6; j++) { const an = (j / 6) * TAU + 0.5; if (j) ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } ctx.closePath();
        ctx.fillStyle = rad(x, y, rr, [[0, `rgba(${col},${a * 0.5 * I})`], [0.8, `rgba(${col},${a * I})`], [1, `rgba(${col},${a * 0.3 * I})`]]); ctx.fill();
        ctx.strokeStyle = `rgba(${col},${a * 0.9 * I})`; ctx.lineWidth = 1; ctx.stroke();
      }
      for (const q of motes) {
        q.dy -= 0.004 / 60;
        const x = cx + q.dx * m + Math.sin(t * q.s + q.o) * 10, y = cy + q.dy * m + Math.cos(t * q.s * 0.8 + q.o) * 8, d = Math.hypot(x - cx, y - cy) / (m * 0.7), a = q.a * I * Math.max(0, 1 - d) * (0.6 + 0.4 * Math.sin(t * q.s * 2 + q.o));
        if (a <= 0) continue;
        ctx.fillStyle = rad(x, y, q.r * 2, [[0, `rgba(255,250,235,${a})`], [1, 'rgba(255,250,235,0)']]); ctx.beginPath(); ctx.arc(x, y, q.r * 2, 0, TAU); ctx.fill();
      }
    }
    const rd = m * 0.045 * (1 + 0.2 * warm);
    ctx.fillStyle = rad(cx, cy, rd * 2.1, [[0, `rgba(255,255,255,${I})`], [0.46, `rgba(255,254,248,${I})`], [0.56, `rgba(${c},${0.5 * I})`], [1, `rgba(${c},0)`]]); ctx.beginPath(); ctx.arc(cx, cy, rd * 2.1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  function genBolt() {
    const seg = (x, y, n, dx, yMax) => { const pts = [[x, y]]; for (let i = 0; i < n && y < yMax; i++) { y += rnd(16, 34); x += rnd(-20, 20) + dx; pts.push([x, y]); } return pts; };
    const main = seg(rnd(0.15, 0.85) * W, -10, 40, rnd(-3, 3), Hh * rnd(0.45, 0.7));
    const br = [1, 2].map(() => { const s = main[Math.floor(rnd(2, main.length - 2))] ?? main[0]; return seg(s[0], s[1], Math.floor(rnd(3, 7)), rnd(-12, 12), Hh); });
    return [main, ...br];
  }

  function frame(now) {
    raf = 0;
    if (!alive) return;
    if (!cv.isConnected) { stop(); return; }
    if (!W && !size()) { schedule(); return; }
    const still = red(), dt = still ? 0 : Math.min(0.05, (now - last) / 1000); last = now;
    const t = still ? 12 : (now - t0) / 1000, k = o.kind, day = o.day;
    px += (tx - px) * Math.min(1, dt * 2.5); py += (ty - py) * Math.min(1, dt * 2.5);
    ctx.clearRect(0, 0, W, Hh);
    if (k === 'stars' || k === 'partn') {
      ctx.save(); ctx.translate(W * 0.55 + px * 4, Hh * 0.25); ctx.rotate(-0.6); ctx.scale(1, 0.22); const R = Math.max(W, Hh) * 0.7; ctx.fillStyle = rad(0, 0, R, [[0, 'rgba(170,185,230,.07)'], [1, 'rgba(170,185,230,0)']]); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.restore();
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * s.s + s.o), x = s.x + px * 3, y = s.y + py * 2;
        ctx.globalAlpha = s.a * tw; ctx.fillStyle = `rgb(${s.c})`; ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
        if (s.g) { ctx.globalAlpha = s.a * tw * 0.45; ctx.strokeStyle = `rgb(${s.c})`; ctx.lineWidth = 0.6; const L = s.r * 7 * tw; ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      if (!still) {
        if (!shoot && now > nextShoot) shoot = { x: rnd(0.3, 1) * W, y: rnd(0.03, 0.28) * Hh, vx: -rnd(520, 800), vy: rnd(160, 280), l: 0, d: rnd(0.6, 1) };
        if (shoot) {
          shoot.l += dt; const f = shoot.l / shoot.d, x = shoot.x + shoot.vx * shoot.l, y = shoot.y + shoot.vy * shoot.l, n = Math.hypot(shoot.vx, shoot.vy), tl = 120, a = Math.sin(Math.PI * Math.min(1, f));
          const g = ctx.createLinearGradient(x, y, x - (shoot.vx / n) * tl, y - (shoot.vy / n) * tl); g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (shoot.vx / n) * tl, y - (shoot.vy / n) * tl); ctx.stroke();
          if (f >= 1) { shoot = null; nextShoot = now + rnd(6000, 15000); }
        }
      }
    }
    if (k === 'sun') sun(t, 1, true); else if (k === 'part') sun(t, 0.95, true); else if (day && k === 'clouds') sun(t, 0.3, false); else if (day && k === 'fog') sun(t, 0.22, false);
    for (const c of clouds) {
      c.x += c.v * dt; if (c.x > W) c.x = -c.w;
      const hh = c.w * 0.42 * (1 + 0.03 * Math.sin(t * 0.2 + c.ph)), y = c.y + Math.sin(t * 0.12 + c.ph) * 4 + py * c.z * 8;
      ctx.globalAlpha = c.a; ctx.drawImage(c.s, c.x + px * c.z * 16, y, c.w, hh);
    }
    ctx.globalAlpha = 1;
    if (k === 'rain') {
      const S = 0.14; ctx.lineCap = 'round';
      [[0.7, 'rgba(205,218,238,.12)'], [1, 'rgba(212,224,242,.2)'], [1.5, 'rgba(225,234,250,.3)']].forEach(([lw, col], z) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); const ox = px * (z + 1) * 4;
        for (const d of drops) {
          if (d.z !== z) continue;
          d.y += d.v * dt; d.x += d.v * dt * S;
          if (d.y > d.end) { if (z === 2 && spl.length < 50) spl.push({ x: d.x, y: d.end, r: 1, a: 0.4 }); d.y = rnd(-90, -10); d.x = rnd(-Hh * S, W); }
          ctx.moveTo(d.x + ox, d.y); ctx.lineTo(d.x + ox - d.l * S, d.y - d.l);
        }
        ctx.stroke();
      });
      ctx.lineWidth = 1;
      for (let i = spl.length - 1; i >= 0; i--) { const s = spl[i]; s.r += dt * 36; s.a -= dt * 1.3; if (s.a <= 0) { spl.splice(i, 1); continue; } ctx.strokeStyle = `rgba(225,234,248,${s.a})`; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.28, 0, 0, TAU); ctx.stroke(); }
      const mg = ctx.createLinearGradient(0, Hh * 0.6, 0, Hh); mg.addColorStop(0, 'rgba(170,182,198,0)'); mg.addColorStop(1, 'rgba(170,182,198,.14)'); ctx.fillStyle = mg; ctx.fillRect(0, 0, W, Hh);
      for (let i = 0; i < glass.length; i++) {
        const g = glass[i];
        if (!g.sl && Math.random() < dt * 0.06) g.sl = true;
        if (g.sl) { g.v = Math.min(160, g.v + dt * rnd(40, 160)); g.y += g.v * dt; g.x += rnd(-0.4, 0.4); g.tr.push([g.x, g.y]); if (g.tr.length > 26) g.tr.shift(); if (g.y > Hh + 10) { glass[i] = newG(true); continue; } }
        if (g.tr.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = g.r * 0.7; ctx.beginPath(); g.tr.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
        ctx.fillStyle = 'rgba(18,26,40,.16)'; ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r, g.r * 1.1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rad(g.x - g.r * 0.3, g.y - g.r * 0.4, g.r * 0.6, [[0, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); ctx.beginPath(); ctx.arc(g.x - g.r * 0.3, g.y - g.r * 0.4, g.r * 0.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r, g.r * 1.1, 0, 0.2, Math.PI - 0.2); ctx.stroke();
      }
      if (o.thunder && !still) {
        if (now > nextBolt) { bolt = genBolt(); flash = 1; nextBolt = now + rnd(4500, 11000); }
        if (flash > 0) {
          flash -= dt * 2; const fl = flash > 0.55 ? (Math.sin(t * 55) > 0 ? 1 : 0.35) : 1, a = Math.max(0, flash) * fl;
          ctx.fillStyle = `rgba(215,225,255,${a * 0.26})`; ctx.fillRect(0, 0, W, Hh);
          if (bolt) { ctx.save(); ctx.shadowColor = 'rgba(190,210,255,.95)'; ctx.shadowBlur = 16; ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineJoin = 'round'; bolt.forEach((pts, i) => { ctx.lineWidth = i ? 1 : 2.2; ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }); ctx.restore(); }
        }
      }
    }
    if (k === 'snow') {
      const AL = [0.45, 0.7, 0.9, 0.28], DR = [3, 6, 11, 18], fs = flakeSpr();
      for (const f of flakes) {
        f.y += f.v * dt; f.bx += DR[f.z] * dt;
        if (f.y > Hh + 20) { f.y = -20; f.bx = rnd(0, W); } if (f.bx > W + 30) f.bx = -30;
        const x = f.bx + Math.sin(t * f.f + f.ph) * f.am + px * (f.z + 1) * 5, r = f.r * 2;
        ctx.globalAlpha = AL[f.z]; ctx.drawImage(fs, x - r, f.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      const gg = ctx.createLinearGradient(0, Hh * 0.75, 0, Hh); gg.addColorStop(0, 'rgba(235,240,248,0)'); gg.addColorStop(1, 'rgba(235,240,248,.12)'); ctx.fillStyle = gg; ctx.fillRect(0, 0, W, Hh);
    }
    if (k === 'fog') {
      const bs = bandSpr();
      for (const b of fogs) {
        b.x += b.v * dt; if (b.v > 0 && b.x > W) b.x = -b.w; if (b.v < 0 && b.x < -b.w) b.x = W;
        const hh = b.w * b.hr, y = b.y + Math.sin(t * 0.13 + b.ph) * 10 - hh / 2, ox = px * b.z * 14;
        ctx.globalAlpha = b.a; ctx.drawImage(bs, b.x + ox, y, b.w, hh); ctx.drawImage(bs, b.x + ox + (b.v > 0 ? -b.w : b.w) * 0.98, y + 6, b.w, hh);
      }
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, Hh * 0.35, 0, Hh); g.addColorStop(0, 'rgba(190,198,208,0)'); g.addColorStop(1, 'rgba(190,198,208,.2)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
    }
    if (!still) schedule();
  }
  function schedule() {
    if (raf || tmo || !alive) return;
    if (document.hidden) { tmo = setTimeout(() => { tmo = 0; last = performance.now(); schedule(); }, 500); return; }
    raf = requestAnimationFrame(frame);
  }
  function kick() { cancelAnimationFrame(raf); clearTimeout(tmo); raf = 0; tmo = 0; last = performance.now(); if (red()) frame(last); else schedule(); }
  const ro = new ResizeObserver(() => { if (size() && red()) frame(performance.now()); });
  ro.observe(cv);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  mq.addEventListener?.('change', kick);
  sprites(); size(); kick();
  function stop() {
    alive = false; cancelAnimationFrame(raf); clearTimeout(tmo); ro.disconnect();
    removeEventListener('pointermove', onP); removeEventListener('deviceorientation', onO);
    document.removeEventListener('visibilitychange', onVis); mq.removeEventListener?.('change', kick);
  }
  return {
    set(n = {}) {
      const nx = { ...o, ...n }, re = nx.kind !== o.kind || nx.heavy !== o.heavy || nx.thunder !== o.thunder || nx.day !== o.day;
      o = nx;
      if (re) { sprites(); if (W) seed(); kick(); } else if (red()) frame(performance.now());
    },
    stop,
    get alive() { return alive; },
  };
}

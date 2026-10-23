// Prompt 45 (SERVER45): sonevarsler med soneikon + brytere (claude-code-sonevarsler-ikon-bryter.md, Sone Varsler.dc.html).
//   GET/PUT /api/family/zone-alerts → {on, people:[…on], zones:[…on], sample}   (per bruker = mottakeren; deler ingen nye posisjonsdata)
//   GET     /api/family/zones/:id/icon.png?size=&shape=square|circle · …/icon.svg → soneikonet hvitt på sonefargen
// Hendelser (inn/ut av en sone) går bare til mottakere med hovedbryter, person og sone på (i tillegg til z.nt per sone som før), og får nå
// også et systemvarsel (kø + Web Push, ikke når appen er åpen) med title = sonenavn, body = «Ingrid forlot Hjem» og icon = soneikonet.
import { Hono } from 'hono';
import { deflateSync, crc32 } from 'node:zlib';
import { kv } from './db.js';
import { authOrToken } from './mobile.js';
import { notifyUser } from './notify.js';
import { setZoneAlertHook45, family45 as F } from './family.js';

/* ---------------- Innstillinger ---------------- */

const KEY = 'zone_alerts45';
const raw = (u) => { const v = kv.get(u, KEY, null); return v && typeof v === 'object' ? v : {}; };
export function zoneAlertsOf45(u) { const r = raw(u); return { on: r.on !== false, people: r.people && typeof r.people === 'object' ? r.people : {}, zones: r.zones && typeof r.zones === 'object' ? r.zones : {} }; }
/** Skal mottakeren varsles om personen i sonen? */
export function zoneAlertAllowed45(viewer, personId, zoneId) { const s = zoneAlertsOf45(viewer); return s.on && s.people[personId] !== false && s.zones[String(zoneId)] !== false; }
const initials = (n) => String(n ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const iconUrl = (z) => `/api/family/zones/${z.id}/icon.png?size=80&v=${encodeURIComponent(`${z.icon ?? ''}${z.color ?? ''}`).slice(0, 40)}`;
function out(u) {
  try { F.seedMock(u); } catch { /* bare demo */ }
  const s = zoneAlertsOf45(u);
  const zones = F.zonesFor(u).map((z) => F.zoneOut(z, u)).map((z) => ({ id: z.id, name: z.name, icon: z.icon, color: z.color, ...(z.icp ? { icp: z.icp } : {}), iconUrl: iconUrl(z), on: s.zones[String(z.id)] !== false }));
  const people = F.people(u).map((p) => ({ ...p, initials: initials(p.name), on: s.people[p.id] !== false }));
  const z0 = zones[0], p0 = people[0];
  return { on: s.on, people, zones, sample: z0 ? { title: z0.name, body: `${p0?.name ?? 'Ingrid'} forlot ${z0.name}`, icon: z0.icon, color: z0.color, iconUrl: z0.iconUrl, badge: '/assets/glimt-badge.png', channel: 'sonevarsler' } : null };
}

/* ---------------- Ikon: SVG og PNG (uten avhengigheter) ---------------- */

// Lucide-lignende strektegninger (24 × 24, strek 2) for de innebygde nøklene. Ukjente → nål. Iconify-ikoner har egen path (icp).
const PATHS = {
  home: 'M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  work: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2',
  school: 'M22 10L12 5 2 10l10 5 10-5z M6 12v5c3 3 9 3 12 0v-5',
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
  cabin: 'M3 21h18 M5 21V11l7-6 7 6v10 M10 21v-5h4v5',
  gym: 'M6 6v12 M18 6v12 M3 9v6 M21 9v6 M6 12h12',
  shop: 'M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L22 7H6 M9 21h.01 M18 21h.01',
  cart: 'M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L22 7H6 M9 21h.01 M18 21h.01',
  ball: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M2 12h20 M12 2c3 3 3 17 0 20 M12 2c-3 3-3 17 0 20',
  coffee: 'M17 8h1a4 4 0 1 1 0 8h-1 M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z M6 2v2 M10 2v2 M14 2v2',
  tree: 'M12 22v-7 M12 2l7 10h-4l4 5H5l4-5H5z',
  plane: 'M2 16l20-8-8 14-2-6z M12 16l-4 4',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z M12 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  car: 'M5 17h14v-5l-2-5H7l-2 5z M7 21v-4 M17 21v-4 M5 12h14',
  bus: 'M5 3h14v14H5z M5 11h14 M8 21v-4 M16 21v-4',
  train: 'M6 3h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z M6 10h12 M8 21l2-4 M16 21l-2-4',
  bike: 'M5.5 13a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z M18.5 13a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z M5.5 16.5l4-7h6l3 7 M12 9.5V6h3',
  hospital: 'M4 3h16v18H4z M12 7v6 M9 10h6', doctor: 'M4 3h16v18H4z M12 7v6 M9 10h6',
  church: 'M12 2v6 M9 5h6 M6 22V12l6-4 6 4v10z M10 22v-4h4v4', book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  mountain: 'M3 20l6-10 4 6 3-4 5 8z', beach: 'M3 20h18 M12 20V9 M5 9c2-4 12-4 14 0z', tent: 'M3 21L12 3l9 18z M12 21v-6',
  sun: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z M12 1v2 M12 21v2 M1 12h2 M21 12h2', ski: 'M4 20l16-6 M8 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4z M10 10l4 6',
  food: 'M7 2v9 M4 2v5a3 3 0 0 0 6 0V2 M7 11v11 M17 2c-2 2-3 5-3 8h3v12', boat: 'M3 18l2 3h14l2-3z M12 3v12 M12 3l6 9H12',
};
const SCALE_TOKENS = /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
/** SVG-path → liste med polylinjer i 24×24-rommet. Støtter M L H V C S Q T A Z (absolutte og relative). */
export function flattenPath45(d) {
  const toks = String(d ?? '').match(SCALE_TOKENS) ?? [];
  const polys = []; let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = '', lcx = 0, lcy = 0, i = 0;
  const num = () => +toks[i++];
  const line = (nx, ny) => { cur.push([nx, ny]); x = nx; y = ny; };
  const bez = (p0, p1, p2, p3) => { for (let t = 1; t <= 12; t++) { const u = t / 12, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, e = u ** 3; cur.push([a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]]); } x = p3[0]; y = p3[1]; };
  const arc = (rx, ry, phi, fa, fs, x2, y2) => {
    const x1 = x, y1 = y; rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) { line(x2, y2); return; }
    const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
    let lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sign = fa === fs ? -1 : 1, num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, num2 / den)), cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
    for (let k = 1; k <= n; k++) { const t = t1 + (dt * k) / n; cur.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
    x = x2; y = y2;
  };
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (cur) { cur.push([sx, sy]); x = sx; y = sy; } cmd = ''; continue; }
    if (!cmd || i >= toks.length || /[A-Za-z]/.test(toks[i])) { if (!cmd) i++; continue; }
    if (C === 'M') { const nx = num() + ox, ny = num() + oy; cur = [[nx, ny]]; polys.push(cur); x = sx = nx; y = sy = ny; cmd = rel ? 'l' : 'L'; continue; }
    if (!cur) { cur = [[x, y]]; polys.push(cur); }
    if (C === 'L') line(num() + ox, num() + oy);
    else if (C === 'H') line(num() + ox, y);
    else if (C === 'V') line(x, num() + oy);
    else if (C === 'C') { const p1 = [num() + ox, num() + oy], p2 = [num() + ox, num() + oy], p3 = [num() + ox, num() + oy]; bez([x, y], p1, p2, p3); lcx = p2[0]; lcy = p2[1]; continue; }
    else if (C === 'S') { const p1 = [2 * x - lcx, 2 * y - lcy], p2 = [num() + ox, num() + oy], p3 = [num() + ox, num() + oy]; bez([x, y], p1, p2, p3); lcx = p2[0]; lcy = p2[1]; continue; }
    else if (C === 'Q' || C === 'T') { const q1 = C === 'Q' ? [num() + ox, num() + oy] : [2 * x - lcx, 2 * y - lcy], p3 = [num() + ox, num() + oy]; bez([x, y], [x + (2 / 3) * (q1[0] - x), y + (2 / 3) * (q1[1] - y)], [p3[0] + (2 / 3) * (q1[0] - p3[0]), p3[1] + (2 / 3) * (q1[1] - p3[1])], p3); lcx = q1[0]; lcy = q1[1]; continue; }
    else if (C === 'A') { const rx = num(), ry = num(), ph = num(), fa = num(), fs = num(); arc(rx, ry, ph, fa, fs, num() + ox, num() + oy); }
    else i++;
    lcx = x; lcy = y;
  }
  return polys.filter((p) => p.length);
}
function png(w, h, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let yy = 0; yy < h; yy++) { rows[yy * (w * 4 + 1)] = 0; rgba.copy(rows, yy * (w * 4 + 1) + 1, yy * w * 4, (yy + 1) * w * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h ?? '')); const v = m ? parseInt(m[1], 16) : 0xb23a2a; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
/** Soneikonet som PNG: hvit strek på sonefargen, avrundet firkant (radius 11/40) eller sirkel. */
export function zoneIconPng45({ path, color, size = 80, shape = 'square' }) {
  const S = Math.max(16, Math.min(256, Math.round(size))), [r, g, b] = hexRgb(color);
  const px = Buffer.alloc(S * S * 4);
  const rad = shape === 'circle' ? S / 2 : (S * 11) / 40;
  const segs = [];
  const k = (S * 0.58) / 24, off = (S - 24 * k) / 2;
  for (const p of flattenPath45(path)) { if (p.length === 1) p.push([p[0][0] + 0.01, p[0][1]]); for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0] * k + off, p[i - 1][1] * k + off, p[i][0] * k + off, p[i][1] * k + off]); }
  const hw = Math.max(1, 1.05 * k);
  for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
    const cx = xx + 0.5, cy = yy + 0.5;
    // bakgrunn med myk kant
    const qx = Math.max(Math.abs(cx - S / 2) - (S / 2 - rad), 0), qy = Math.max(Math.abs(cy - S / 2) - (S / 2 - rad), 0);
    const dBg = Math.hypot(qx, qy) - rad, aBg = Math.max(0, Math.min(1, 0.5 - dBg));
    if (!aBg) continue;
    let dm = Infinity;
    for (const [x1, y1, x2, y2] of segs) {
      const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((cx - x1) * vx + (cy - y1) * vy) / l2)) : 0;
      const d = Math.hypot(cx - (x1 + t * vx), cy - (y1 + t * vy)); if (d < dm) dm = d;
    }
    const aI = Math.max(0, Math.min(1, hw + 0.5 - dm));
    const o = (yy * S + xx) * 4;
    px[o] = Math.round(r + (255 - r) * aI); px[o + 1] = Math.round(g + (255 - g) * aI); px[o + 2] = Math.round(b + (255 - b) * aI); px[o + 3] = Math.round(aBg * 255);
  }
  return png(S, S, px);
}
const pathOf = (z) => (z.icp && /^[MmLlHhVvCcSsQqTtAaZz0-9 .,\-eE]{1,6000}$/.test(z.icp) ? z.icp : PATHS[z.icon] ?? PATHS.pin);
export function zoneIconSvg45(z) {
  const c = /^#[0-9a-f]{6}$/i.test(z.color ?? '') ? z.color : '#b23a2a';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" rx="11" fill="${c}"/><g transform="translate(9.04 9.04) scale(0.913)"><path d="${pathOf(z)}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}

/* ---------------- Varsel ved hendelse ---------------- */

const lastSent = new Map(); // `${viewer}|${person}|${zone}|${kind}` → ms (ikke samme varsel to ganger på 2 min)
setZoneAlertHook45((user, e, z, viewers) => {
  const keep = viewers.filter((v) => zoneAlertAllowed45(v, user, e.zoneId));
  const zo = z ? { id: z.id, name: z.name, icon: z.icon ?? F.defaultZoneIcon(z.name), color: String(z.color ?? '').toLowerCase(), icp: z.icon_path ?? null } : null;
  if (zo) {
    const person = F.nameOf(user), body = `${person} ${e.kind === 'enter' ? 'kom til' : 'forlot'} ${zo.name}`;
    for (const v of keep) {
      const k = `${v}|${user}|${zo.id}|${e.kind}`;
      if (Date.now() - (lastSent.get(k) ?? 0) < 120_000) continue;
      lastSent.set(k, Date.now());
      // realtime:false – appen får allerede family {kind:'event'} over WebSocket; dette er bare systemvarselet (kø + push).
      notifyUser(v, { title: zo.name, body, url: '/#/familie/soner', tag: `zone-${zo.id}-${user}`, category: 'familie',
        data: { kind: 'zone', zoneId: zo.id, zone: zo.name, event: e.kind, personId: user, person, zoneIcon: zo.icon, ...(zo.icp ? { icp: zo.icp } : {}), color: zo.color, icon: iconUrl(zo), iconUrl: iconUrl(zo), channel: 'sonevarsler', badge: '/assets/glimt-badge.png' } }, { realtime: false }).catch(() => {});
    }
  }
  return keep;
});

/* ---------------- Ruter ---------------- */

export const zone45Api = new Hono();
zone45Api.get('/zone-alerts', authOrToken, (c) => c.json(out(c.get('user'))));
zone45Api.put('/zone-alerts', authOrToken, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {on?, people?, zones?}' }, 400);
  const cur = zoneAlertsOf45(u), next = { ...cur, people: { ...cur.people }, zones: { ...cur.zones } };
  if ('on' in b) { if (typeof b.on !== 'boolean') return c.json({ error: 'on må være true eller false' }, 400); next.on = b.on; }
  for (const [k, field, re] of [['people', 'people', /^[\w.@-]{1,80}$/], ['zones', 'zones', /^\d{1,10}$/]]) {
    if (!(k in b)) continue;
    if (!b[k] || typeof b[k] !== 'object' || Array.isArray(b[k])) return c.json({ error: `${k} må være {id: true|false}` }, 400);
    for (const [id, v] of Object.entries(b[k]).slice(0, 200)) { if (!re.test(id) || typeof v !== 'boolean') return c.json({ error: `Ugyldig ${k}.${id}` }, 400); if (v) delete next[field][id]; else next[field][id] = false; }
  }
  kv.set(u, KEY, next);
  return c.json(out(u));
});
const zoneFor = (c) => { const z = F.zoneById(+c.req.param('id')); if (!z || !F.zonesFor(c.get('user')).some((x) => x.id === z.id)) return null; return F.zoneOut(z, c.get('user')); };
zone45Api.get('/zones/:id{[0-9]+}/icon.png', authOrToken, (c) => {
  const z = zoneFor(c); if (!z) return c.json({ error: 'Fant ikke sonen' }, 404);
  const buf = zoneIconPng45({ path: pathOf(z), color: z.color, size: +c.req.query('size') || 80, shape: c.req.query('shape') === 'circle' ? 'circle' : 'square' });
  return c.body(buf, 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
});
zone45Api.get('/zones/:id{[0-9]+}/icon.svg', authOrToken, (c) => {
  const z = zoneFor(c); if (!z) return c.json({ error: 'Fant ikke sonen' }, 404);
  return c.body(zoneIconSvg45(z), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
});

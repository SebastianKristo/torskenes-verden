// Prompt 22 (mobil-PWA, Papir): Familie nøyaktig etter design/Familie.dc.html (verktøyrad over kartet, Kartverket-kart
// med soner som har ikon og fri farge, pins med profilbilde og fart, personkort, Min deling, Soner med redigering i kortet,
// Helse), Huskeliste med «Ny oppgave …» festet over fanelinjen og + på knappen, og «Synk med Home Assistant» for admin.
// Alt tåler en eldre server: et endepunkt som svarer 404 gir en reserve (lokalt lagret profilbilde, skjult HA-seksjon).
import { esc, n0, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { FM, famLoad } from './mobile-p16.js';
import { FT, HK, tasksLoad, huskeView } from './mobile-p17.js';
import { setTiles } from './mobile-p20.js';
import { paper, paperDark } from './mobile-paper.js';

/* ---------- Sone-ikoner og farger (fasit: Familie.dc.html) ---------- */

export const ZIC = { // prompt 42: 50 ikoner som i Familie.dc.html
  home: ['Hjem', 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6'], work: ['Jobb', 'M4 8h16v11H4zM9 8V5h6v3M4 13h16'], school: ['Skole', 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5'],
  heart: ['Familie', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'], cabin: ['Hytte', 'M3 20h18M5 20V11l7-6 7 6v9M10 20v-5h4v5'], gym: ['Trening', 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12'],
  shop: ['Butikk', 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0'], ball: ['Sport', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18'], coffee: ['Kafé', 'M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M11 3v3'],
  tree: ['Natur', 'M12 3l6 9h-4l4 6H6l4-6H6zM12 18v3'], plane: ['Reise', 'M2 13l20-8-6 16-3-7-7-1z'], star: ['Favoritt', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  pin: ['Sted', 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'], car: ['Bil', 'M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v1M17 19v1M5 11h14'], bus: ['Buss', 'M5 4h14v13H5zM5 11h14M8 20v-3M16 20v-3M8 14h.01M16 14h.01'],
  train: ['Tog', 'M6 4h12v11H6zM6 10h12M8 19l-2 2M16 19l2 2M9 15h.01M15 15h.01'], bike: ['Sykkel', 'M6 17a3 3 0 1 0 0-.01M18 17a3 3 0 1 0 0-.01M6 17l4-8h5l3 8M10 9l-1-3H7'], boat: ['Båt', 'M3 17l2 3h14l2-3zM6 17V10l6-5 6 5v7M12 5v12'],
  hospital: ['Sykehus', 'M4 4h16v16H4zM12 8v8M8 12h8'], doctor: ['Lege', 'M9 3v6a3 3 0 0 0 6 0V3M12 12v3a4 4 0 0 0 8 0v-1M20 13a1 1 0 1 0 0-.01'], pill: ['Apotek', 'M8 4h8a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8zM12 4v8M7 16h10M9 20h6'],
  church: ['Kirke', 'M12 2v4M10 4h4M6 21V11l6-4 6 4v10M10 21v-5h4v5'], book: ['Bibliotek', 'M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z'], music: ['Musikk', 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  film: ['Kino', 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4'], food: ['Restaurant', 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10'], cart: ['Matbutikk', 'M3 4h2l2 11h11l2-8H6M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01'],
  fuel: ['Bensin', 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 9h6M14 10h2a2 2 0 0 1 2 2v5a1 1 0 0 0 2 0V8l-3-3'], bolt: ['Lading', 'M13 2L4 14h7l-1 8 9-12h-7z'], paw: ['Dyr', 'M12 14c-3 0-5 2.5-5 4.5S9 21 12 21s5-.5 5-2.5S15 14 12 14zM6 10a2 2 0 1 0 0-.01M18 10a2 2 0 1 0 0-.01M9 6a2 2 0 1 0 0-.01M15 6a2 2 0 1 0 0-.01'],
  baby: ['Barnehage', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM6 21v-3a6 6 0 0 1 12 0v3M10 7h.01M14 7h.01'], swim: ['Svømmehall', 'M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M6 14l4-6 4 3 3-4M17 5a1.5 1.5 0 1 0 0-.01'], ski: ['Ski', 'M4 20L20 4M8 20L20 8M14 4a2 2 0 1 0 0-.01'],
  tent: ['Camping', 'M3 20L12 4l9 16zM12 4v16M9 20l3-6 3 6'], mountain: ['Fjell', 'M3 20l6-11 4 6 2-3 6 8zM9 9l2 4'], beach: ['Strand', 'M3 20h18M12 20c0-6 2-10 7-12M12 20c0-6-2-10-7-12M12 8c-3-3-6-3-8-2M12 8c3-3 6-3 8-2'],
  sun: ['Sol', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'], gift: ['Gave', 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0'], cake: ['Bursdag', 'M4 21h16v-8H4zM4 16c2 1 4 1 6 0s4-1 6 0 4 1 4 0M12 9v4M12 5a1 1 0 0 0 0 2'],
  game: ['Spill', 'M6 9h12a4 4 0 0 1 0 8l-2-2H8l-2 2a4 4 0 0 1 0-8zM8 11v3M6.5 12.5h3M15 12h.01M17 14h.01'], laptop: ['Kontor', 'M4 5h16v11H4zM2 19h20'], tool: ['Verksted', 'M14 7a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-2 2-2-1-1-2z'],
  key: ['Utleie', 'M15 9a4 4 0 1 0-4 4l-8 8M9 17l2 2M12 14l2 2'], bed: ['Hotell', 'M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 11a1.5 1.5 0 1 0 0-.01'], flag: ['Mål', 'M5 21V4M5 4h11l-2 4 2 4H5'],
  bell: ['Varsel', 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0'], camera: ['Foto', 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'], anchor: ['Havn', 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 8v13M5 13a7 7 0 0 0 14 0M9 11h6'],
  leaf: ['Hage', 'M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l7-7'],
};
export const ZPAL = ['#b23a2a', '#d9662a', '#d9a400', '#2f7a4f', '#2e6f75', '#2b5d8a', '#5b4bb5', '#7a3b6b', '#c2417a', '#5c5850'];
const ZDEF = ['#b23a2a', '#2b5d8a', '#2f6b45', '#a8661a', '#7a3b6b'];
// Eldre server uten icon-kolonne: ikonet huskes på enheten (fam_zicons).
const ZLOC = (() => { try { return JSON.parse(localStorage.getItem('fam_zicons') || '{}') || {}; } catch { return {}; } })();
const zLocal = (id, k) => { ZLOC[id] = k; try { localStorage.setItem('fam_zicons', JSON.stringify(ZLOC)); } catch {} };
// Prompt 42: ikoner fra Lucide/Tabler (Iconify) lagres som 'ify:<sett>:<navn>' + path-data (icp), så de vises uten nett.
const IFY = (() => { try { return JSON.parse(localStorage.getItem('fam_zicons42') || '{}') || {}; } catch { return {}; } })();
export const ifyKeep = (k, p) => { if (!/^ify:/.test(k) || !p) return; IFY[k] = p; try { localStorage.setItem('fam_zicons42', JSON.stringify(IFY)); } catch {} };
const okIc = (k) => !!(k && (ZIC[k] || IFY[k]));
/** Path-data for et ikon (innebygd eller Iconify). */
export const icPath = (k, icp) => ZIC[k]?.[1] ?? IFY[k] ?? icp ?? ZIC.pin[1];
export const zPath = (z) => (z?.icp && /^ify:/.test(String(z.icon ?? '')) ? z.icp : icPath(zIcon(z), z?.icp));
export const zIcon = (z) => (okIc(z?.icon) ? z.icon : okIc(ZLOC[z?.id]) ? ZLOC[z.id] : { hjem: 'home', jobb: 'work', skole: 'school', mormor: 'heart', hytta: 'cabin', hytte: 'cabin' }[String(z?.name ?? '').trim().toLowerCase()] || 'pin');
const svg = (p, s, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c ?? '')) ? String(c).toLowerCase() : '#b23a2a');
const rTxt = (r) => (r >= 1000 ? `${(r / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(r)} m`);
const hm = (t) => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const agoT = (ts) => { if (!ts) return '–'; const mm = Math.round((Date.now() - new Date(ts)) / 6e4); return mm < 1 ? 'Nå' : mm < 60 ? `${mm} min siden` : mm < 1440 ? `${Math.round(mm / 60)} t siden` : `${Math.round(mm / 1440)} d siden`; };
const hav = (a, b, c, d) => { const R = 6371e3, p = Math.PI / 180, x = Math.sin(((c - a) * p) / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(((d - b) * p) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

/* ---------- Profilbilder (per seer) ---------- */

const PKEY = 'fam_photos';
const lsJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
export const F22 = { edit: null, rm: null, local: lsJ(PKEY, {}), tracks: {}, tT: 0, busy: false };
const meId = () => FM.d?.me?.userId;
const isMe = (p) => p?.self || String(p?.userId) === String(meId());
// Prompt 24: én person = én oppføring, også med flere enheter. Serveren slår sammen (devices, sourceDevice); en eldre
// server sender én post per enhet, og da grupperes det her på userId. Posisjonen kommer fra enheten med lavest
// nøyaktighet de siste 5 minuttene, ellers fra den nyeste; batteri og bevegelse fra samme enhet.
let memSrc = null, memOut = [];
export function groupMembers(list) {
  const by = new Map();
  for (const p of list) { const k = String(p.userId ?? p.username ?? p.name); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  return [...by.values()].map((g) => {
    if (g.length === 1) return g[0];
    const ts = (p) => +new Date(p.last?.ts ?? 0), now = Date.now();
    const fresh = g.filter((p) => p.last?.acc != null && now - ts(p) < 5 * 6e4).sort((a, b) => a.last.acc - b.last.acc);
    const best = fresh[0] ?? [...g].sort((a, b) => ts(b) - ts(a))[0];
    const devices = g.map((p, i) => ({ id: p.deviceId ?? p.last?.deviceId ?? `${p.last?.device ?? p.device ?? 'enhet'}-${i}`, name: p.last?.device ?? p.device ?? 'Enhet', platform: p.platform ?? p.last?.platform, battery: p.last?.battery, lastSeen: p.last?.ts, accuracy: p.last?.acc, isSource: p === best }));
    return { ...best, sharing: g.some((p) => p.sharing === 'on') ? 'on' : best.sharing, devices, deviceCount: g.length, sourceDevice: devices.find((d) => d.isSource)?.id };
  });
}
const mem = () => { const l = FM.d?.members ?? []; if (l !== memSrc) { memSrc = l; memOut = groupMembers(l); } return memOut; };
const devN = (p) => p?.deviceCount ?? p?.devices?.length ?? 1;
const batPct = (b) => (b == null ? null : Math.round(b * (b <= 1 ? 100 : 1)));
function devList(p) {
  const ds = p.devices ?? [];
  if (ds.length < 2) return '';
  const pin = FM.src ?? null, me = isMe(p);
  const row = (id, n, s, on) => `<button class="f22-dev" ${me ? `data-p24f="src" data-id="${esc(id ?? '')}"` : 'disabled'} aria-pressed="${on}"><span class="m-grow" style="min-width:0"><b class="m-ell">${esc(n)}</b><span class="f22-mut">${esc(s)}</span></span>${on ? '<span class="f22-ok">✓</span>' : ''}</button>`;
  return `<div class="f22-devs"><span class="f22-lab">ENHETER · ${ds.length}</span>${me ? row(null, 'Automatisk', 'Nyeste og mest nøyaktige posisjon', !pin) : ''}${ds.map((d) => row(d.id, d.name, [batPct(d.battery) != null ? `${batPct(d.battery)} %` : '', d.lastSeen ? agoT(d.lastSeen).toLowerCase() : '', d.isSource ? 'brukes nå' : ''].filter(Boolean).join(' · '), me ? String(pin) === String(d.id) : d.isSource)).join('')}</div>`;
}
export async function famSource(id) {
  FM.src = id || null;
  try { await hlApi('/family/me/source', { method: 'PUT', json: { deviceId: id || null } }); } catch (e) { if (e.status !== 404) flash(e.message); }
  await famLoad().catch(() => {}); draw();
}
const memOf = (id) => mem().find((p) => String(p.userId) === String(id));
const colOf = (p, i = 0) => hex(p?.color || ZDEF[i % ZDEF.length]);
export const photoOf = (p) => F22.local[p?.userId] || p?.photoUrl || p?.avatarUrl || null;
const firstN = (p) => String(p?.name || p?.username || '').split(' ')[0];
const ini2 = (p) => firstN(p).slice(0, 2) || '•';
/** Rund avatar med bilde, ellers initialer i personens farge. */
function av(p, size, font, extra = '') {
  const ph = photoOf(p), i = mem().indexOf(p);
  return `<span class="f22-av" style="width:${size}px;height:${size}px;background-color:${colOf(p, i)};${ph ? `background-image:url('${esc(ph)}');` : ''}font-size:${font}px">${ph ? '' : esc(ini2(p))}${extra}</span>`;
}
async function cropPhoto(file) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bildet kunne ikke leses')); i.src = url; });
  const c = document.createElement('canvas'), S = 160, mn = Math.min(im.width, im.height);
  c.width = c.height = S; c.getContext('2d').drawImage(im, (im.width - mn) / 2, (im.height - mn) / 2, mn, mn, 0, 0, S, S);
  return c.toDataURL('image/jpeg', 0.82);
}
async function setPhoto(uid, file) {
  let data;
  try { data = await cropPhoto(file); } catch (e) { flash(e.message); return; }
  try {
    const r = await hlApi(`/family/photo/${encodeURIComponent(uid)}`, { method: 'PUT', json: { image: data } });
    delete F22.local[uid]; try { localStorage.setItem(PKEY, JSON.stringify(F22.local)); } catch {}
    const p = memOf(uid); if (p) p.photoUrl = r?.photoUrl ?? `${r?.url ?? data}`;
    await famLoad(); flash('Profilbilde lagret ✓');
  } catch (e) {
    if (e.status !== 404) { flash(e.message); return; }
    // Eldre server: bildet lagres bare på denne enheten.
    F22.local[uid] = data; try { localStorage.setItem(PKEY, JSON.stringify(F22.local)); } catch {}
    flash('Profilbilde lagret på denne enheten ✓');
  }
  repaint(); draw();
}

/* ---------- Kartet (Leaflet med Kartverket-fliser via /tiles) ---------- */

let LF = null, mapEl = null, map = null, layer = null, fitted = false;
function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (LF) return LF;
  LF = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/api/family/vendor/leaflet.css'; document.head.appendChild(css);
    const add = (src, next) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(window.L); s.onerror = next; document.head.appendChild(s); };
    add('/api/family/vendor/leaflet.js', () => { css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; add('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => { LF = null; rej(new Error('Kartet kunne ikke lastes')); }); });
  });
  return LF;
}
const sharers = () => mem().filter((p) => p.last?.lat != null && (p.sharing === 'on' || (isMe(p) && FM.d?.me?.sharing === 'on')));
const kmh = (p) => { const s = p.last?.speed; return s != null && p.precision !== 'approx' && s > 0.5 ? Math.round(s * 3.6) : 0; };
function fit() {
  if (!map) return;
  const pts = sharers().map((p) => [p.last.lat, p.last.lon]);
  if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  else if (pts.length) map.setView(pts[0], 14);
  else { const z = FM.d?.zones ?? []; if (z.length) map.fitBounds(z.map((x) => [x.lat, x.lon]), { padding: [60, 60], maxZoom: 14 }); }
}
function repaint() {
  const Lf = window.L;
  if (!map || !Lf) return;
  layer?.remove(); layer = Lf.layerGroup().addTo(map);
  const zones = [...(FM.d?.zones ?? [])];
  if (FM.zone) zones.push({ ...FM.zone, draft: true });
  for (const z of zones) {
    const c = hex(z.color);
    Lf.circle([z.lat, z.lon], { radius: z.radius, color: c, weight: 2, fillColor: c, fillOpacity: 0x22 / 255, dashArray: z.draft ? '6 5' : null, interactive: false }).addTo(layer);
    Lf.marker([z.lat, z.lon], { interactive: false, keyboard: false, icon: Lf.divIcon({ className: 'f22-zi', iconSize: [0, 0], html: `<span class="f22-zic" style="background:${c}">${svg(zPath(z), 15, 2.2)}</span>` }) }).addTo(layer);
    Lf.marker([z.lat - z.radius / 111320, z.lon], { interactive: false, keyboard: false, icon: Lf.divIcon({ className: 'f22-zi', iconSize: [0, 0], html: `<span class="f22-zl">${esc(z.name || 'Ny sone')}</span>` }) }).addTo(layer);
  }
  for (const p of sharers()) {
    const tr = F22.tracks[p.userId];
    if (tr?.length > 1) Lf.polyline(tr.map((x) => [x.lat, x.lon]), { color: colOf(p, mem().indexOf(p)), weight: 3, opacity: 0.55, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer);
  }
  for (const p of sharers()) {
    const on = String(FM.sel) === String(p.userId), s = on ? 50 : 40, sp = kmh(p), ph = photoOf(p);
    const html = `<span class="f22-pin" style="width:${s}px"><span class="f22-pa" style="width:${s}px;height:${s}px;background-color:${colOf(p, mem().indexOf(p))};${ph ? `background-image:url('${esc(ph)}');` : ''}">${ph ? '' : esc(isMe(p) ? 'Du' : ini2(p))}${sp ? `<i>${sp}</i>` : ''}</span><b></b></span>`;
    Lf.marker([p.last.lat, p.last.lon], { zIndexOffset: on ? 500 : 300, title: p.name ?? '', icon: Lf.divIcon({ className: 'f22-pinw', html, iconSize: [s, s + 5], iconAnchor: [s / 2, s + 5] }) })
      .on('click', () => pick(p.userId)).addTo(layer);
    if (p.precision === 'approx') Lf.circle([p.last.lat, p.last.lon], { radius: 1000, color: '#1b1a17', weight: 1, dashArray: '4 4', fillOpacity: 0.05, interactive: false }).addTo(layer);
  }
}
function pick(uid) {
  FM.sel = uid; FT.tab = 'kart';
  const p = memOf(uid);
  if (map && p?.last?.lat != null) map.setView([p.last.lat, p.last.lon], Math.max(map.getZoom(), 14));
  haptic('tab'); draw(); scrollTo({ top: 0, behavior: 'smooth' });
}
async function tracksLoad(force = false) {
  if (!force && Date.now() - F22.tT < 60000) return;
  F22.tT = Date.now();
  await Promise.all(sharers().slice(0, 8).map(async (p) => {
    try { const r = await hlApi(`/family/track/${encodeURIComponent(p.userId)}?hours=6`); F22.tracks[p.userId] = (Array.isArray(r) ? r : r?.points ?? []).slice(-30); } catch { F22.tracks[p.userId] = []; }
  }));
  repaint();
}
export function famAfterDraw22() {
  const slot = document.getElementById('f22-slot');
  if (!slot) return;
  if (!mapEl) { mapEl = document.createElement('div'); mapEl.className = 'f22-mapin'; mapEl.innerHTML = '<div class="p16-mapmsg">Laster kart …</div>'; }
  if (mapEl.parentNode !== slot) slot.appendChild(mapEl);
  loadLeaflet().then((Lf) => {
    if (!map) {
      mapEl.innerHTML = '';
      map = Lf.map(mapEl, { zoomControl: false, attributionControl: false, maxZoom: 18 }).setView([59.9139, 10.7522], 12);
      map.on('click', (ev) => {
        if (!FM.zoneMode) return;
        FM.zoneMode = false; FT.tab = 'soner';
        FM.zone = { lat: ev.latlng.lat, lon: ev.latlng.lng, name: '', radius: 200, color: ZDEF[(FM.d?.zones ?? []).length % ZDEF.length], icon: null };
        haptic('ok'); draw(); setTimeout(() => document.getElementById('f22-zn')?.focus(), 60);
      });
    }
    setTiles(Lf, map, mapEl, paperDark() ? 'dark' : 'paper').catch(() => {});
    repaint();
    if (!fitted && FM.d) { fitted = true; fit(); }
    mapEl.classList.toggle('placing', !!FM.zoneMode);
    setTimeout(() => map?.invalidateSize(), 30);
    tracksLoad().catch(() => {});
  }).catch((e) => { mapEl.innerHTML = `<div class="p16-mapmsg">${esc(e.message)} · listen under virker likevel</div>`; });
}

/* ---------- Visning ---------- */

const REFRESH = 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5';
function mapBlock() {
  const live = FM.geo ? ['#2f7a4f', 'Sanntid · din GPS er på'] : sharers().length ? ['#2f7a4f', `Sanntid · ${sharers().length} deler`] : ['#d9a400', 'Sanntid · ingen deler ennå'];
  return `<div class="f22-tools"><button class="f22-tb ink" data-f22="place">${FM.zoneMode ? 'Avbryt plassering' : '+ Ny sone på kartet'}</button><span class="m-grow"></span><button class="f22-tb" data-f22="fit">Vis alle</button><button class="f22-tb rnd" data-f22="refresh" aria-label="Oppdater posisjoner">${svg(REFRESH, 18, 2.2)}</button></div>
    <div class="f22-map${FM.zoneMode ? ' placing' : ''}"><div id="f22-slot" class="f22-slot"></div>
      ${FM.zoneMode ? '<div class="f22-ban">Trykk på kartet der sonen skal være</div>' : ''}
      <div class="f22-zoom"><button data-f22="zin" aria-label="Zoom inn">+</button><button data-f22="zout" aria-label="Zoom ut">−</button><button data-f22="fit" aria-label="Vis alle" style="font-size:15px">◎</button></div>
      <div class="f22-live"><i style="background:${live[0]}"></i>${esc(live[1])}</div><span class="f22-attr">© Kartverket</span></div>`;
}
const ACT = { still: 'Står stille', walking: 'Går', running: 'Løper', cycling: 'Sykler', driving: 'I bil' };
const zoneAt = (p) => (p?.last?.lat == null ? null : (FM.d?.zones ?? []).find((z) => hav(p.last.lat, p.last.lon, z.lat, z.lon) <= z.radius));
function whereOf(p) {
  const L0 = p.last, z = zoneAt(p), sp = kmh(p);
  if (!L0) return 'Ingen posisjon ennå';
  return `${z ? `I ${z.name}` : L0.place || (p.precision === 'approx' ? 'Omtrentlig posisjon' : ACT[L0.activity] ?? 'Ukjent sted')}${sp ? ` · ${sp} km/t` : ''}`;
}
const batOf = (L0) => (L0?.battery == null ? null : Math.round(L0.battery * (L0.battery <= 1 ? 100 : 1)));
function personCard() {
  const p = memOf(FM.sel);
  if (!p) return '';
  const L0 = p.last ?? {}, on = L0.lat != null && (p.sharing === 'on' || isMe(p)), b = batOf(L0), sp = kmh(p);
  const sens = [['Batteri', b == null ? '–' : `${b} %${L0.charging ? ' ⚡' : ''}`, b != null && b < 20], ['Bevegelse', ACT[L0.activity] ?? '–'], ['Fart', on && p.precision !== 'approx' ? `${sp} km/t` : '–'],
    ['Nøyaktighet', L0.acc != null ? `± ${Math.round(L0.acc)} m` : '–'], ['Enhet', L0.device ?? p.device ?? '–'], ['Koordinater', on ? `${(+L0.lat).toFixed(4)}, ${(+L0.lon).toFixed(4)}` : '–']];
  return `<div class="f22-card f22-pc"><div class="f22-row"><label class="f22-pav" title="Bytt profilbilde">${av(p, 48, 16, '<span class="f22-ed">✎</span>')}<input type="file" accept="image/*" data-f22file="${esc(p.userId)}" hidden></label>
      <div class="m-grow" style="min-width:0"><b class="f22-pn">${esc(isMe(p) ? 'Deg' : p.name || p.username)}</b><span class="f22-mut">${esc(on ? `${whereOf(p)} · oppdatert ${agoT(L0.ts).toLowerCase()}` : p.sharing === 'paused' ? 'Har pauset delingen' : 'Deler ikke posisjon')}</span></div>
      <button class="f22-x" data-f22="psx" aria-label="Lukk">×</button></div>
    <div class="f22-sens">${sens.map(([l, v, bad]) => `<div><span>${l}</span><b${bad ? ' class="bad"' : ''}>${esc(v)}</b></div>`).join('')}</div>${devList(p)}
    ${on ? `<div class="f22-two"><a class="f22-b ink" href="https://www.google.com/maps/dir/?api=1&destination=${L0.lat},${L0.lon}" target="_blank" rel="noopener">Veibeskrivelse</a>${isMe(p) ? '<button class="f22-b" data-f22="shareme">Del min posisjon</button>' : `<button class="f22-b" data-p17="ping" data-id="${esc(p.userId)}">Spill av lyd</button>`}</div>` : ''}</div>`;
}
function peopleCard() {
  const list = mem();
  if (!list.length) return '';
  return `<div class="f22-card f22-list">${list.map((p, i) => {
    const L0 = p.last, ok = (p.sharing === 'on' || isMe(p)) && L0, age = L0?.ts ? Date.now() - new Date(L0.ts) : Infinity, b = batOf(L0);
    const dot = !ok || (isMe(p) && FM.d?.me?.sharing !== 'on') ? '#9a9488' : age < 15 * 6e4 ? '#2f7a4f' : '#d9a400';
    const where = (p.sharing === 'paused' ? 'Deling er satt på pause' : !ok ? (isMe(p) ? 'Du deler ikke posisjon' : 'Deler ikke posisjon') : whereOf(p)) + (devN(p) > 1 ? ` · ${devN(p)} enheter` : '');
    return `<button class="f22-pr" data-f22="sel" data-id="${esc(p.userId)}"${i ? '' : ' style="border-top:0"'}>${av(p, 42, 14, `<i class="f22-dot" style="background:${dot}"></i>`)}
      <span class="m-grow" style="min-width:0"><b>${esc(p.name || p.username)}${isMe(p) ? ' (deg)' : ''}</b><span class="f22-mut m-ell">${esc(where)}</span></span>
      <span class="f22-bat"><b${b != null && b < 20 ? ' class="bad"' : ''}>${b == null ? '–' : `${b} %${L0?.charging ? ' ⚡' : ''}`}</b><span>${ok ? esc(agoT(L0.ts)) : '–'}</span></span></button>`;
  }).join('')}</div>`;
}
function eventsCard() {
  const ev = (FM.d?.events ?? []).slice(0, 6);
  const zc = (x) => hex((FM.d?.zones ?? []).find((z) => String(z.id) === String(x.zoneId))?.color ?? memOf(x.userId)?.color);
  const txt = (x) => `${(x.name ?? memOf(x.userId)?.name ?? 'Noen').split(' ')[0]} ${x.kind === 'enter' ? 'kom til' : 'forlot'} ${x.zone ?? 'en sone'}`;
  return `<div class="f22-col6"><span class="f22-lab">HENDELSER</span><div class="f22-card f22-list">${ev.map((x, i) => `<div class="f22-ev"${i ? '' : ' style="border-top:0"'}><i style="background:${zc(x)}"></i><span class="m-grow">${esc(txt(x))}</span><span class="f22-mono">${hm(x.ts)}</span></div>`).join('') || '<div class="f22-ev" style="border-top:0"><span class="f22-mut">Ingen hendelser ennå.</span></div>'}</div></div>`;
}
function shareCard() {
  const me = FM.d?.me ?? {}, on = me.sharing === 'on', pr = me.precision ?? 'exact';
  const rows = [
    ['famshare', on ? 'off' : 'on', 'Del min posisjon', on ? 'Familien ser hvor du er' : me.sharing === 'paused' ? 'Pauset · de andre ser at du har pauset' : 'Av · ingen ser posisjonen din', on ? 'På' : me.sharing === 'paused' ? 'Pauset' : 'Av', on ? 'var(--pp-pos)' : 'var(--pp-lab)'],
    ['famprec', pr === 'exact' ? 'approx' : 'exact', 'Presisjon', pr === 'exact' ? 'Nøyaktig punkt' : 'Omtrentlig, rundt 1 km', `${pr === 'exact' ? 'Nøyaktig' : 'Omtrentlig'} ›`, 'var(--pp-mut)'],
    ['famgeo', '', 'Sensorer fra mobilen', FM.geoErr || 'Batteri, aktivitet og fart', FM.geo ? 'GPS på' : 'Be om tilgang ›', FM.geo ? 'var(--pp-pos)' : 'var(--pp-lab)'],
  ];
  return `<div class="f22-card f22-share"><b class="f22-h">Min deling</b>${rows.map(([a, k, n, s, v, c], i) => `<button class="f22-sr" data-p16="${a}"${k ? ` data-k="${k}"` : ''}${i ? '' : ' style="border-top:0"'}><span class="m-grow" style="min-width:0"><b>${n}</b><span class="f22-mut">${esc(s)}</span></span><span class="f22-v" style="color:${c}">${esc(v)}</span></button>`).join('')}
    <span class="f22-note">Deling er av som standard. Hver person kan pause eller slå av når som helst, og de andre ser det.</span></div>`;
}
// Prompt 42 (claude-code-familie-soner-uten-kart.md): søk i ikoner, 18 vanlige + «Vis alle», og treff fra Lucide og Tabler
// via serverens Iconify-proxy (/api/icons/search, /api/icons/:sett/:navn.svg). Norske ord oversettes først.
export const ICS = { q: '', all: false, res: [], busy: false, qe: '', n: 0, t: null };
const NO_EN = { 'båt': 'boat', 'seilbåt': 'sailboat', kirke: 'church', hus: 'house', hjem: 'home', hytte: 'cabin', skole: 'school', jobb: 'briefcase', bil: 'car', sykkel: 'bike', fotball: 'ball', trening: 'barbell', butikk: 'shopping', mat: 'food', 'kafé': 'coffee', kafe: 'coffee', kaffe: 'coffee', tog: 'train', buss: 'bus', fly: 'plane', flyplass: 'plane', strand: 'beach', fjell: 'mountain', tre: 'tree', skog: 'trees', sykehus: 'hospital', lege: 'stethoscope', apotek: 'pill', bok: 'book', bibliotek: 'library', musikk: 'music', kino: 'movie', spill: 'gamepad', hund: 'dog', katt: 'cat', hest: 'horse', fisk: 'fish', barnehage: 'baby', 'svømming': 'swim', basseng: 'pool', telt: 'tent', gave: 'gift', kake: 'cake', bursdag: 'cake', stjerne: 'star', hjerte: 'heart', sol: 'sun', 'snø': 'snowflake', vann: 'droplet', havn: 'anchor', verksted: 'tool', kontor: 'building', hotell: 'bed', 'øl': 'beer', vin: 'wine', bensin: 'gas', lading: 'charging', lekeplass: 'playground', venner: 'users', trikk: 'tram', 't-bane': 'train', stasjon: 'train', fjord: 'waves', 'sjø': 'waves', hage: 'plant', blomst: 'flower', dyrlege: 'paw', 'frisør': 'scissors', tannlege: 'tooth', bank: 'bank', post: 'mail', pakke: 'package', idrett: 'trophy', scene: 'microphone', teater: 'masks', museum: 'building-museum', slott: 'castle', bro: 'bridge', ferge: 'ship', skip: 'ship', camping: 'tent', grill: 'grill', fest: 'confetti', bryllup: 'rings', sky: 'cloud', regn: 'umbrella', 'skøyter': 'ice-skating', handel: 'shopping-cart', ski: 'ski' };
/** SVG-tekst → én path-streng (path, circle, rect, line, polyline, polygon), som toD() i fasiten. */
export function svgToD(body) {
  const D = [], at = (t, a) => { const mm = t.match(new RegExp(`\\s${a}="([^"]*)"`)); return mm ? mm[1] : null; };
  for (const t of String(body).match(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g) ?? []) {
    if (/stroke="none"/.test(t) && !/fill="currentColor"/.test(t)) continue;
    const g = t.match(/^<(\w+)/)[1], n = (a) => parseFloat(at(t, a) || '0');
    if (g === 'path') { const d = at(t, 'd'); if (d) D.push(d); }
    else if (g === 'circle' || g === 'ellipse') { const cx = n('cx'), cy = n('cy'), rx = g === 'circle' ? n('r') : n('rx'), ry = g === 'circle' ? n('r') : n('ry'); D.push(`M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`); }
    else if (g === 'rect') { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); D.push(`M${x} ${y}h${w}v${h}h${-w}z`); }
    else if (g === 'line') D.push(`M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`);
    else { const pts = (at(t, 'points') || '').trim().split(/[\s,]+/).map(Number); let d = ''; for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`; if (g === 'polygon') d += 'z'; if (d) D.push(d); }
  }
  return D.join(' ');
}
async function ifySearch(raw) {
  const q = String(raw ?? '').trim().toLowerCase();
  if (q.length < 2) { ICS.res = []; ICS.busy = false; return; }
  const en = NO_EN[q] ?? q, tk = ++ICS.n;
  ICS.busy = true;
  try {
    const L = await Promise.all(['lucide', 'tabler'].map((pf) => hlApi(`/icons/search?q=${encodeURIComponent(en)}&prefix=${pf}&limit=24`).then((r) => (r?.icons ?? []).slice(0, 18)).catch(() => [])));
    const ids = L.flat().map((x) => (typeof x === 'string' ? x : x.id ?? `${x.prefix}:${x.name}`)).filter((id) => /^(lucide|tabler):[a-z0-9-]+$/.test(id)).slice(0, 36);
    const out = (await Promise.all(ids.map(async (id) => {
      const [pf, nm] = id.split(':'), k = `ify:${id}`;
      try { const r = await fetch(`/api/icons/${pf}/${nm}.svg`, { credentials: 'same-origin' }); if (!r.ok) return null; const tx = await r.text(); if (!/viewBox="0 0 24 24"/.test(tx)) return null; const d = svgToD(tx); return d ? { k, n: `${nm.replace(/-/g, ' ')} · ${pf === 'lucide' ? 'Lucide' : 'Tabler'}`, p: d } : null; } catch { return null; }
    }))).filter(Boolean);
    if (tk !== ICS.n) return;
    ICS.res = out; ICS.qe = en;
  } catch { if (tk === ICS.n) { ICS.res = []; ICS.qe = en; } }
  if (tk === ICS.n) { ICS.busy = false; draw(); }
}
function iconGrid(cur, color, act, id, size) {
  const qn = ICS.q.trim().toLowerCase(), all = Object.entries(ZIC);
  const hit = qn ? all.filter(([k, [nm]]) => nm.toLowerCase().includes(qn) || k.includes(qn)) : ICS.all ? all : all.slice(0, 18);
  const btn = (k, n, p) => { const on = cur === k; return `<button data-f22="${act}" data-k="${esc(k)}"${id != null ? ` data-id="${esc(id)}"` : ''} aria-label="${esc(n)}" title="${esc(n)}" aria-pressed="${on}" style="height:${size}px;border-color:${on ? color : 'var(--pp-line)'};background:${on ? color : 'transparent'};color:${on ? '#fff' : 'var(--pp-ink)'}">${svg(p, size >= 40 ? 20 : 19, 1.9)}</button>`; };
  const grid = (h) => `<div class="f22-ig" style="grid-template-columns:repeat(auto-fill,minmax(${size}px,1fr))">${h}</div>`;
  const curIfy = /^ify:/.test(cur ?? '') && !hit.some(([k]) => k === cur) ? btn(cur, cur.split(':').slice(1).join(' '), icPath(cur)) : '';
  const info = qn ? (hit.length ? `${hit.length} treff` : `Ingen ikoner heter «${esc(ICS.q.trim())}»`) : `${all.length} ikoner`;
  const ext = qn.length > 1 ? `<div class="p42-ext"><span class="f22-mut">${ICS.busy ? 'Søker i Lucide og Tabler (7 500+ ikoner) …' : ICS.res.length ? `${ICS.res.length} fra Lucide og Tabler · søkte «${esc(ICS.qe)}»` : 'Ingen treff i Lucide og Tabler'}</span>${ICS.res.length ? grid(ICS.res.map((x) => btn(x.k, x.n, x.p)).join('')) : ''}</div>` : '';
  return `<input class="f22-in sm p42-ics" id="p42-ics-${esc(act)}" data-f22in="icq" value="${esc(ICS.q)}" placeholder="Søk i ikoner, f.eks. båt, kirke, ski …" autocomplete="off" enterkeyhint="search" aria-label="Søk i ikoner">
    ${grid(curIfy + hit.map(([k, [n, p]]) => btn(k, n, p)).join(''))}<div class="p42-icinfo"><span class="f22-mut">${info}</span>${qn ? '' : `<button type="button" class="p42-icmore" data-f22="icall">${ICS.all ? 'Vis færre' : 'Vis alle'}</button>`}</div>${ext}`;
}
function colorRow(cur, act, id, size) {
  const c = hex(cur), cust = !ZPAL.includes(c);
  return `<div class="f22-cols">${ZPAL.map((x) => `<button data-f22="${act}" data-c="${x}"${id != null ? ` data-id="${esc(id)}"` : ''} aria-label="Farge ${x}" aria-pressed="${c === x}" style="width:${size}px;height:${size}px;background:${x};border-color:${c === x ? 'var(--pp-ink)' : 'transparent'}"></button>`).join('')}
    <label class="f22-cust" title="Velg egen farge" style="width:${size}px;height:${size}px;border-color:${cust ? 'var(--pp-ink)' : 'transparent'}"><input type="color" value="${c}" data-f22col="${act}"${id != null ? ` data-id="${esc(id)}"` : ''} aria-label="Velg egen farge"></label><span class="f22-mono">${c}</span></div>`;
}
function draftCard() {
  const z = FM.zone;
  if (!z) return '';
  return `<div class="f22-card f22-draft"><b class="f22-h">Ny sone</b>
    <input class="f22-in" id="f22-zn" data-f22in="dname" value="${esc(z.name)}" placeholder="Navn, f.eks. Trening" maxlength="40" autocomplete="off">
    <div class="f22-rr"><span class="f22-mut">Radius</span><b class="f22-mono" id="f22-dr">${rTxt(z.radius)}</b></div>
    <input type="range" min="50" max="2000" step="25" value="${z.radius}" data-f22in="drad" style="accent-color:#b23a2a">
    <span class="f22-mut" style="font-size:13px">Ikon</span>${iconGrid(zIcon(z), hex(z.color), 'dicon', null, 40)}
    <span class="f22-mut" style="font-size:13px">Farge</span>${colorRow(z.color, 'dcol', null, 32)}
    <div class="f22-two"><button class="f22-b" data-f22="dx">Avbryt</button><button class="f22-b ink" data-f22="dsave">Lagre sone</button></div></div>`;
}
function zoneCard(z) {
  const c = hex(z.color), ed = String(F22.edit) === String(z.id), mineZ = z.mine ?? (z.createdBy == null || String(z.createdBy) === String(meId()));
  const there = sharers().filter((p) => hav(p.last.lat, p.last.lon, z.lat, z.lon) <= z.radius).map((p) => (isMe(p) ? 'deg' : firstN(p)));
  const others = mem().filter((p) => !isMe(p)), nt = z.notify ?? {};
  return `<div class="f22-card f22-zone"><div class="f22-row"><button class="f22-zb" data-f22="zshow" data-id="${esc(z.id)}" aria-label="Vis ${esc(z.name)} på kartet" style="background:${c}">${svg(zPath(z), 21, 2)}</button>
      <span class="m-grow" style="min-width:0"><b class="f22-zn">${esc(z.name)}</b><span class="f22-mut">${rTxt(z.radius)} radius · ${esc(there.join(', ') || 'ingen der nå')}${mineZ ? (z.shared === false ? ' · bare deg' : '') : ` · delt av ${esc(firstN(memOf(z.createdBy)) || 'familien')}`}</span></span>
      ${mineZ ? `<button class="f22-zx" data-f22="zed" data-id="${esc(z.id)}" aria-label="Rediger sone" aria-pressed="${ed}">✎</button><button class="f22-zx rm" data-f22="zrm" data-id="${esc(z.id)}" aria-label="Slett sone">${String(F22.rm) === String(z.id) ? '?' : '−'}</button>` : ''}</div>
    ${ed ? `<div class="f22-zed"><input class="f22-in sm" data-f22in="zname" data-id="${esc(z.id)}" value="${esc(z.name)}" maxlength="40" aria-label="Navn">${iconGrid(zIcon(z), c, 'zicon', z.id, 38)}${colorRow(c, 'zcol', z.id, 30)}
      <div class="f22-rr"><span class="f22-mut">Radius</span><b class="f22-mono" id="f22-zr-${esc(z.id)}">${rTxt(z.radius)}</b></div><input type="range" min="50" max="2000" step="25" value="${z.radius}" data-f22in="zrad" data-id="${esc(z.id)}" style="accent-color:${c}">
      ${'shared' in z ? `<button class="f22-sr" data-p16="zshare" data-id="${esc(z.id)}" style="border-top:0;padding:4px 0"><span class="m-grow"><b>Del med familien</b><span class="f22-mut">${z.shared ? 'Familien ser sonen og kan få varsel.' : 'Av: bare du ser sonen.'}</span></span><span class="sw" aria-checked="${!!z.shared}"></span></button>` : ''}</div>` : ''}
    ${others.length ? `<div class="f22-who">${others.map((p) => { const v = nt[p.userId], on = v === true || !!(v?.enter || v?.leave); return `<button data-f22="znot" data-z="${esc(z.id)}" data-u="${esc(p.userId)}" aria-pressed="${on}">${av(p, 24, 10)}${esc(firstN(p))}${on ? ' · varsel på' : ''}</button>`; }).join('')}</div>` : ''}</div>`;
}
function healthBlock() {
  const me = FM.d?.me ?? {}, list = mem().filter((p) => isMe(p) || p.sharing === 'on');
  const srcs = [['apple', 'Apple Health', '♥', '#e0245e', 'iPhone'], ['hc', 'Health Connect', '✚', '#3b6fd6', 'Android']];
  const conn = (k) => mem().some((p) => (p.health?.source ?? '').toLowerCase().includes(k === 'apple' ? 'apple' : 'connect')) || (me.healthSources ?? {})[k];
  const src = `<div class="f22-hs">${srcs.map(([k, n, ic, c, dv]) => { const on = !!conn(k); return `<button data-f22="hsrc" data-k="${k}" style="border-color:${on ? 'var(--pp-pos)' : 'var(--pp-line)'}"><span class="f22-hi" style="background:${c}">${ic}</span><b>${n}</b><span style="color:${on ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${on ? `Koblet til via appen · ${dv}` : 'Ikke koblet til · trykk for å koble'}</span></button>`; }).join('')}</div>`;
  const cards = list.map((p) => {
    const h = p.health?.today ?? null, mine = isMe(p), shOn = mine ? Object.values(me.shareHealth ?? {}).some(Boolean) : !!h, c = colOf(p, mem().indexOf(p));
    const pill = mine ? `<button class="f22-shp" data-f22="hshare" style="color:${shOn ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${shOn ? 'Deler' : 'Deler ikke'}</button>` : `<span class="f22-shp" style="color:${h ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${h ? 'Deler' : 'Deler ikke'}</span>`;
    const head = `<div class="f22-row">${av(p, 40, 13)}<span class="m-grow" style="min-width:0"><b class="f22-zn">${esc(p.name || p.username)}${mine ? ' (deg)' : ''}</b><span class="f22-mut">${esc(p.health?.source ?? (mine ? 'Telefonen din' : 'Appen'))} · ${p.health?.updatedAt ? `synket ${agoT(p.health.updatedAt).toLowerCase()}` : 'ikke synket'}</span></span>${pill}</div>`;
    if (!h) return `<div class="f22-card f22-hc">${head}<span class="f22-mut" style="font-size:13px">Deler ikke helsedata. ${esc(mine ? 'Du' : firstN(p))} kan slå det på i ${mine ? 'appen din' : 'sin app'}.</span></div>`;
    const goal = p.health?.goal ?? h.goal ?? 10000, f = Math.min(1, (h.steps ?? 0) / goal), wk = (p.health?.week ?? []).slice(-7), mx = Math.max(1, ...wk.map((d) => d.steps ?? 0));
    const met = [['Hvilepuls', h.restingHr != null ? `${Math.round(h.restingHr)} bpm` : '–', 'Snitt siste 7 dager'], ['Puls nå', h.hr != null ? `${Math.round(h.hr)} bpm` : '–', 'Fra klokken'], ['Søvn i natt', h.sleepMin != null ? `${Math.floor(h.sleepMin / 60)} t ${h.sleepMin % 60} m` : '–', 'Mål 8 t'], ['Aktive kalorier', h.activeKcal != null ? `${n0(h.activeKcal)} kcal` : '–', 'I dag']];
    return `<div class="f22-card f22-hc">${head}<div class="f22-ring"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--pp-line)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(f * 163.4).toFixed(1)} 200" transform="rotate(-90 32 32)"/></svg><div><b>${n0(h.steps ?? 0)}</b><span class="f22-mut">skritt · mål ${n0(goal)}</span></div></div>
      <div class="f22-met">${met.map(([l, v, s]) => `<div><span>${l}</span><b>${esc(v)}</b><small>${s}</small></div>`).join('')}</div>
      ${wk.length ? `<div class="f22-wk" aria-label="Skritt siste 7 dager">${wk.map((d, i) => `<span style="height:${Math.max(8, ((d.steps ?? 0) / mx) * 100).toFixed(0)}%;background:${i === wk.length - 1 ? c : `${c}55`}"></span>`).join('')}</div>` : ''}</div>`;
  }).join('');
  return `${cards}${list.some((p) => !isMe(p)) ? '' : '<div class="f22-card"><b class="f22-h" style="font-size:18px">Ingen deler helse med deg ennå</b><span class="f22-mut">Helsedeling er av som standard.</span></div>'}
    <span class="f22-note" style="padding:0 4px">Apple Health og Health Connect kan bare leses av appen på telefonen. Homelab-appen sender et sammendrag hit hvert 15. minutt, og bare det personen har valgt å dele.</span>`;
}
export function famView22() {
  if (FM.err && !FM.d) return `<div class="f22"><div class="f22-card f22-mut">${esc(FM.err)}</div></div>`;
  if (!FM.d) return '<div class="m-spin"></div>';
  const tab = FT.tab;
  const hjl = globalThis.P42?.velStatus?.() ?? ''; // prompt 42: ikke Vel fremme-kortet på Kart, bare en statuslinje når en økt pågår
  if (tab === 'helse') return `<div class="f22">${healthBlock()}</div>`;
  if (tab === 'hjemlys') return `<div class="f22">${globalThis.P41?.famHjemlys?.() ?? '<div class="m-spin"></div>'}</div>`; // prompt 41: Vel fremme-fanen (Start · Hvem · Klar · Aktiv)
  if (tab === 'soner') {
    const zones = FM.d.zones ?? [];
    // Prompt 42: Soner uten kart – kartet vises bare mens en ny sone plasseres (trådkors, radius, navn, farge, ikon).
    const placing = FM.zoneMode || !!FM.zone;
    return `<div class="f22">${placing ? mapBlock() : '<button type="button" class="f22-tb ink p42-snadd" data-f22="place">+ Ny sone på kartet</button>'}${draftCard()}${zones.map(zoneCard).join('') || (FM.zone ? '' : '<div class="f22-card"><span class="f22-mut">Ingen soner ennå. Trykk «+ Ny sone på kartet» og så på kartet, for eksempel hjemme, skolen eller jobben.</span></div>')}
      <span class="f22-note" style="padding:0 4px">Trykk på en person i en sone for å slå varsel av eller på når de kommer og går.</span></div>`;
  }
  const others = mem().filter((p) => !isMe(p)), shr = others.filter((p) => p.sharing === 'on');
  return `<div class="f22">${hjl}${mapBlock()}${personCard()}${peopleCard()}${shr.length ? '' : '<div class="f22-card"><b class="f22-h" style="font-size:18px">Ingen deler posisjon med deg ennå</b><span class="f22-mut">Deling er av som standard. Når noen i familien slår på deling i sin app, vises de her og på kartet.</span></div>'}${eventsCard()}${shareCard()}</div>`;
}

/* ---------- Huskeliste: «Ny oppgave …» over fanelinjen, + på knappen, HA-synk ---------- */

export const HA = { d: null, t: 0, miss: false, err: '', pick: null, busy: false };
const isAdmin = () => m.me?.role === 'admin' || m.me?.isMainAdmin === true || m.me?.user?.role === 'admin';
export async function haLoad(force = false) {
  if (!isAdmin() || HA.miss || (!force && Date.now() - HA.t < 20000)) return;
  HA.t = Date.now();
  try { HA.d = await hlApi('/tasks/ha'); HA.err = ''; } catch (e) { if (e.status === 404) HA.miss = true; else HA.err = e.status === 403 ? '' : e.message; if (e.status === 403) HA.miss = true; }
}
const HA_ST = (d) => (!d?.enabled ? 'Av' : d.status === 'connecting' ? 'Kobler til …' : d.status === 'error' ? 'Feil · prøv igjen' : d.syncedAt ? `Synket ${hm(d.syncedAt)}` : 'Kobler til …');
export function haSection() {
  if (!isAdmin() || HA.miss || !HK.d || HK.local) return '';
  const d = HA.d, on = !!d?.enabled, lists = HK.d.lists ?? [], maps = d?.maps ?? [];
  const ent = (id) => maps.find((x) => String(x.listId) === String(id))?.entityId ?? null;
  const st = d ? HA_ST(d) : 'Laster …', bad = d?.status === 'error';
  return `<div class="h22-ha"><span class="h22-hah"><span class="pp-lab" style="padding:0">SYNK MED HOME ASSISTANT</span><span class="${bad ? 'pp-lab-c' : 'pp-mut'}" style="font-size:12px">${esc(st)}</span></span>
    <div class="pp-card h22-hac"><button class="h22-r tg" data-h22="tgl" role="switch" aria-checked="${on}"><span class="m-grow"><b>Synkroniser lister</b><small>To veier · Home Assistant To-do (todo.*)</small></span><span class="h22-sw${on ? ' on' : ''}"><i></i></span></button>
      ${on ? `${lists.map((l) => { const e = ent(l.id); return `<button class="h22-r" data-h22="pick" data-id="${esc(l.id)}"><i class="h22-dot" style="background:${esc(l.color)}"></i><span class="m-grow h22-ln">${esc(l.name)}</span><span class="h22-ent${e ? '' : ' none'}">${esc(e ?? 'Ikke koblet')}</span><span class="pp-mut">›</span></button>`; }).join('')}
      <button class="h22-r h22-sync" data-h22="sync" ${HA.busy ? 'disabled' : ''}>${HA.busy ? 'Synker …' : '↻ Synk nå'}</button>` : ''}</div>
    ${d?.error && bad ? `<span class="pp-lab-c" style="font-size:12px;padding:0 4px">${esc(d.error)}</span>` : HA.err ? `<span class="pp-lab-c" style="font-size:12px;padding:0 4px">${esc(HA.err)}</span>` : ''}
    <span class="pp-mut" style="font-size:12px;line-height:1.45;padding:0 4px">Trykk på en liste for å velge hvilken HA-liste den skal kobles til. Endringer i appen og i Home Assistant (også fra Assist og stemmestyring) synkes begge veier.</span></div>`;
}
function haSheet() {
  if (HA.pick == null || !(m.screen === 'huske' || (m.screen === 'set' && (String(m.sub).startsWith('integ') || m.sub === 'huske')))) return ''; // prompt 44: også Innstillinger → Gjøremål
  const l = (HK.d?.lists ?? []).find((x) => String(x.id) === String(HA.pick)), cur = (HA.d?.maps ?? []).find((x) => String(x.listId) === String(HA.pick))?.entityId ?? null;
  const ents = HA.d?.entities ?? [];
  return `<div class="sheet-bg" data-h22="pickx"></div><div class="pp-sheet" role="dialog" aria-label="Koble ${esc(l?.name ?? '')}"><span class="pp-grab"></span><div class="pp-sh">Koble «${esc(l?.name ?? '')}»</div>
    <div class="pp-card pp-tight">${[[null, 'Ikke koblet', ''], ...ents.map((x) => [x.entity_id, x.name || x.entity_id, x.entity_id])].map(([id, n, s]) => `<button class="pp-srow" data-h22="map" data-e="${esc(id ?? '')}" aria-pressed="${cur === id}"><span class="m-grow"><b>${esc(n)}</b>${s ? `<span class="pp-mut h22-mono">${esc(s)}</span>` : ''}</span>${cur === id ? '<span class="pp-pos">✓</span>' : ''}</button>`).join('')}
      <button class="pp-srow" data-h22="new"><span class="m-grow"><b class="pp-lab-c">+ Lag ny liste i HA</b><span class="pp-mut">Heter «${esc(l?.name ?? '')}» i Home Assistant</span></span></button></div>
    ${ents.length ? '' : '<span class="pp-mut" style="font-size:13px">Fant ingen todo.*-entiteter. Sjekk Home Assistant-tilkoblingen under Innstillinger → Integrasjoner.</span>'}
    <button class="pp-btn" data-h22="pickx">Lukk</button></div>`;
}
async function haCall(path, opts, ok) {
  HA.busy = true; draw();
  try { const r = await hlApi(path, opts); if (r && typeof r === 'object' && ('enabled' in r || 'maps' in r)) HA.d = { ...HA.d, ...r }; else { HA.t = 0; await haLoad(true); } if (ok) flash(ok); }
  catch (e) { flash(e.status === 403 ? 'Bare admin kan endre HA-synk' : e.message); HA.t = 0; await haLoad(true); }
  HA.busy = false; draw();
}
export function huske22() {
  // Feltet øverst er borte: «Ny oppgave …» ligger fast over fanelinjen (huskeDock).
  const v = huskeView().replace(/<form class="pp-card p17-hadd"[\s\S]*?<\/form>/, '');
  if (!HA.t && isAdmin() && !HA.miss) haLoad().then(draw).catch(() => {});
  return v.replace(/<\/div>$/, `${haSection()}</div>`);
}
export const huskeDock = () => String(HK.cur) === 'arkiv' ? '' : `<form class="h22-dock" data-p17form="task" role="search"><input id="p17-tk" data-p17in="tk" value="${esc(HK.nv)}" placeholder="Ny oppgave …" enterkeyhint="done" autocomplete="off" aria-label="Ny oppgave"></form>`;
const PLUS = 'M12 5v14M5 12h14';
/** Fanelinja på Huskeliste: knappen viser + og legger til oppgaven. */
export function huskeNav(nav) {
  return nav.replace(/<button class="pp-fab([^"]*)" data-ppplus="[^"]*" aria-label="[^"]*" title="[^"]*">[\s\S]*?<\/button>/, `<button class="pp-fab$1 h22-fab" data-h22="plus" aria-label="Legg til oppgave" title="Legg til oppgave">${svg(PLUS, 26, 2.2)}</button>`)
    .replace(/<button class="pp-scan([^"]*)" data-ppplus="[^"]*"[^>]*>\+<\/button>/, '<button class="pp-scan$1 h22-fab" data-h22="plus" aria-label="Legg til oppgave">+</button>');
}
export const p22Sheets = () => haSheet();

/* ---------- Etter tegning og pekere ---------- */

export function afterDraw(scr, pp) {
  if (scr === 'huske' && pp) document.querySelector('.m.papir')?.classList.add('h22');
}
export function down(e) {
  // Pluss-knappen på Huskeliste skal ikke åpne skannearket ved langt trykk.
  if (e.target.closest?.('[data-h22="plus"]')) return true;
  return false;
}
export const move = () => false;
export const up = () => false;

/* ---------- Hendelser ---------- */

const zoneOf = (id) => (FM.d?.zones ?? []).find((z) => String(z.id) === String(id));
let zT = {};
function zPatch(id, patch, delay = 0) {
  const z = zoneOf(id); if (!z) return;
  Object.assign(z, patch); repaint();
  clearTimeout(zT[id]);
  zT[id] = setTimeout(async () => { try { await hlApi(`/family/zones/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }); } catch (e) { flash(e.message); await famLoad(); draw(); } }, delay);
}
export async function bind(e, t) {
  const ty = e.type;
  if (ty === 'input' || ty === 'change') {
    const k = t.dataset?.f22in, col = t.dataset?.f22col;
    if (t.dataset?.f22file && ty === 'change') { const f = t.files?.[0]; t.value = ''; if (f) await setPhoto(t.dataset.f22file, f); return true; }
    if (col) {
      const v = hex(t.value);
      if (col === 'dcol' && FM.zone) { FM.zone.color = v; repaint(); if (ty === 'change') draw(); }
      if (col === 'zcol') { zPatch(t.dataset.id, { color: v }, 400); if (ty === 'change') draw(); }
      return true;
    }
    if (!k) return false;
    if (k === 'icq') { if (ty !== 'input') return true; ICS.q = t.value; clearTimeout(ICS.t); const v = t.value; ICS.t = setTimeout(() => ifySearch(v).then(() => draw()), 350); if (v.trim().length < 2) ICS.res = []; draw(); return true; } // prompt 42
    if (k === 'dname' && FM.zone) { FM.zone.name = t.value; return true; }
    if (k === 'drad' && FM.zone) { FM.zone.radius = +t.value; const b = document.getElementById('f22-dr'); if (b) b.textContent = rTxt(+t.value); repaint(); return true; }
    if (k === 'zname') { if (ty === 'change' && t.value.trim()) { zPatch(t.dataset.id, { name: t.value.trim() }); draw(); } else { const z = zoneOf(t.dataset.id); if (z && t.value.trim()) z.name = t.value; } return true; }
    if (k === 'zrad') { const b = document.getElementById(`f22-zr-${t.dataset.id}`); if (b) b.textContent = rTxt(+t.value); zPatch(t.dataset.id, { radius: +t.value }, ty === 'change' ? 0 : 500); if (ty === 'change') draw(); return true; }
    return false;
  }
  if (ty !== 'click') return false;
  const h = t.closest?.('[data-h22]');
  if (h) {
    e.preventDefault();
    const k = h.dataset.h22;
    if (k === 'plus') {
      const inp = document.getElementById('p17-tk');
      if (!HK.nv.trim()) { inp?.focus(); return true; }
      navigator.vibrate?.(8);
      document.querySelector('.h22-dock')?.requestSubmit?.();
      return true;
    }
    if (k === 'tgl') { const on = !HA.d?.enabled; HA.d = { ...(HA.d ?? {}), enabled: on, status: on ? 'connecting' : 'off' }; haptic('tab'); await haCall('/tasks/ha', { method: 'PUT', json: { enabled: on } }, on ? 'Synk med Home Assistant er på ✓' : ''); return true; }
    if (k === 'sync') { await haCall('/tasks/ha/sync', { method: 'POST' }, 'Synket ✓'); await tasksLoad(true); draw(); return true; }
    if (k === 'pick') { HA.pick = h.dataset.id; draw(); return true; }
    if (k === 'pickx') { HA.pick = null; draw(); return true; }
    if (k === 'map') { const id = HA.pick, en = h.dataset.e || null; HA.pick = null; HA.d = { ...HA.d, maps: [...(HA.d?.maps ?? []).filter((x) => String(x.listId) !== String(id)), ...(en ? [{ listId: id, entityId: en }] : [])] }; await haCall('/tasks/ha/map', { method: 'PUT', json: { listId: id, entityId: en } }, en ? `Koblet til ${en} ✓` : 'Koblingen er fjernet'); await tasksLoad(true); draw(); return true; }
    if (k === 'new') {
      const l = (HK.d?.lists ?? []).find((x) => String(x.id) === String(HA.pick)), id = HA.pick; HA.pick = null; HA.busy = true; draw();
      try { const r = await hlApi('/tasks/ha/create', { method: 'POST', json: { name: l?.name ?? 'Huskeliste' } }); const en = r?.entity_id ?? r?.entityId; if (en) await hlApi('/tasks/ha/map', { method: 'PUT', json: { listId: id, entityId: en } }); HA.t = 0; await haLoad(true); flash(en ? `Laget ${en} i Home Assistant ✓` : 'Listen er laget ✓'); }
      catch (err) { flash(err.message); }
      HA.busy = false; draw(); return true;
    }
    return false;
  }
  if (m.screen !== 'fam' || !paper()) return false;
  const x = t.closest?.('[data-f22]');
  if (!x) return false;
  if (x.tagName !== 'LABEL') e.preventDefault();
  const k = x.dataset.f22, id = x.dataset.id;
  switch (k) {
    case 'place': FM.zoneMode = !FM.zoneMode; FM.zone = null; haptic('tab'); break;
    case 'fit': fit(); haptic('tap'); return true;
    case 'zin': map?.zoomIn(); return true;
    case 'zout': map?.zoomOut(); return true;
    case 'refresh': await famLoad(); F22.tT = 0; await tracksLoad(true).catch(() => {}); flash('Posisjoner oppdatert ✓'); break;
    case 'sel': { const p = memOf(id); if (p && (p.sharing === 'on' || isMe(p))) pick(id); else flash(`${firstN(p) || 'Personen'} deler ikke posisjon`); return true; }
    case 'psx': FM.sel = null; break;
    case 'shareme': try { await navigator.clipboard?.writeText(`https://www.google.com/maps?q=${memOf(id ?? meId())?.last?.lat},${memOf(id ?? meId())?.last?.lon}`); flash('Lenke kopiert ✓'); } catch { flash('Kunne ikke kopiere lenken'); } return true;
    case 'dx': FM.zone = null; FM.zoneMode = false; ICS.q = ''; ICS.res = []; break;
    case 'icall': ICS.all = !ICS.all; haptic('tab'); break; // prompt 42
    case 'dicon': if (FM.zone) { const kk = x.dataset.k, r = ICS.res.find((q) => q.k === kk); if (r) { ifyKeep(kk, r.p); FM.zone.icp = r.p; } else delete FM.zone.icp; FM.zone.icon = kk; } haptic('tab'); break;
    case 'dcol': if (FM.zone) FM.zone.color = x.dataset.c; haptic('tab'); break;
    case 'dsave': {
      const z = FM.zone; if (!z) return true;
      const body = { name: z.name.trim() || `Sone ${(FM.d?.zones ?? []).length + 1}`, lat: z.lat, lon: z.lon, radius: z.radius, color: hex(z.color), icon: zIcon(z), ...(z.icp ? { icp: z.icp } : {}) };
      try { const r = await hlApi('/family/zones', { method: 'POST', json: body }); const nid = r?.id ?? r?.zone?.id; if (nid != null) zLocal(nid, body.icon); FM.zone = null; await famLoad(); flash(`${body.name} er lagret ✓`); } catch (err) { flash(err.message); }
      break;
    }
    case 'zshow': { const z = zoneOf(id); if (z && FT.tab === 'soner' && !FM.zoneMode && !FM.zone) { FT.tab = 'kart'; haptic('tab'); draw(); setTimeout(() => { if (map) map.fitBounds(window.L.latLng(z.lat, z.lon).toBounds(z.radius * 2.6)); scrollTo({ top: 0, behavior: 'smooth' }); }, 350); return true; } // prompt 42: «Vis på kart» åpner Kart
      if (z && map) { map.fitBounds(window.L.latLng(z.lat, z.lon).toBounds(z.radius * 2.6)); scrollTo({ top: 0, behavior: 'smooth' }); } return true; }
    case 'zed': F22.edit = String(F22.edit) === String(id) ? null : id; break;
    case 'zicon': { const kk = x.dataset.k, r = ICS.res.find((q) => q.k === kk); if (r) ifyKeep(kk, r.p); zLocal(id, kk); zPatch(id, r ? { icon: kk, icp: r.p } : { icon: kk }); haptic('tab'); break; } // prompt 42: Iconify lagres som ify:<sett>:<navn> + icp
    case 'zcol': zPatch(id, { color: x.dataset.c }); haptic('tab'); break;
    case 'zrm': {
      if (String(F22.rm) !== String(id)) { F22.rm = id; flash(`Trykk igjen for å slette ${zoneOf(id)?.name ?? 'sonen'}`); setTimeout(() => { if (String(F22.rm) === String(id)) { F22.rm = null; draw(); } }, 2500); break; }
      F22.rm = null;
      try { await hlApi(`/family/zones/${encodeURIComponent(id)}`, { method: 'DELETE' }); await famLoad(); } catch (err) { flash(err.message); }
      break;
    }
    case 'znot': {
      const z = zoneOf(x.dataset.z), u = x.dataset.u, cur = z?.notify?.[u], on = cur === true || !!(cur?.enter || cur?.leave), nv = { enter: !on, leave: !on };
      if (!z) return true;
      z.notify = { ...(z.notify ?? {}), [u]: nv }; haptic('tab'); draw();
      try { await hlApi(`/family/zones/${encodeURIComponent(x.dataset.z)}/notify`, { method: 'PUT', json: { userId: u, ...nv } }); } catch (err) { z.notify[u] = cur; flash(err.message); }
      break;
    }
    case 'hsrc': flash(x.dataset.k === 'apple' ? 'Åpne Homelab-appen på iPhone for å godkjenne Apple Health' : 'Åpne Homelab-appen på Android for å godkjenne Health Connect'); return true;
    case 'hshare': {
      const me = FM.d?.me ?? {}, on = !Object.values(me.shareHealth ?? {}).some(Boolean), sh = Object.fromEntries(['steps', 'restingHr', 'hr', 'sleep', 'activeKcal', 'week'].map((q) => [q, on]));
      FM.d.me = { ...me, shareHealth: sh }; draw();
      await hlApi('/family/me', { method: 'PUT', json: { shareHealth: sh } }).then(() => flash(on ? 'Du deler helsedata ✓' : 'Du deler ikke helsedata lenger')).catch((err) => flash(err.message));
      return true;
    }
    default: return false;
  }
  draw(); return true;
}

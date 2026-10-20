// Prompt 42 (WEB42, claude-code-familie-soner-uten-kart.md): soneikoner. 49 innebygde ikoner (fasit Familie.dc.html → ZIC; de 13 første er
// de gamle fra prompt 22), norske søkeord og søk i Lucide (~1 600) og Tabler (~5 900) via Iconify-API-et (api.iconify.design, CSP connect-src).
// Valgt Iconify-ikon lagres på sonen som icon:'ify:lucide:sailboat' + icp (path-data, 24×24 stroke), så det vises uten nett og likt i appene.
// Brukes av Familie på web (family.js). Kan også importeres av PWA-en (/assets/js/icons42.js).

export const ZIC42 = {
  home: ['Hjem', 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6'],
  work: ['Jobb', 'M4 8h16v11H4zM9 8V5h6v3M4 13h16'],
  school: ['Skole', 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5'],
  heart: ['Familie', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  cabin: ['Hytte', 'M3 20h18M5 20V11l7-6 7 6v9M10 20v-5h4v5'],
  gym: ['Trening', 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12'],
  shop: ['Butikk', 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0'],
  ball: ['Sport', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18'],
  coffee: ['Kafé', 'M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M11 3v3'],
  tree: ['Natur', 'M12 3l6 9h-4l4 6H6l4-6H6zM12 18v3'],
  plane: ['Reise', 'M2 13l20-8-6 16-3-7-7-1z'],
  star: ['Favoritt', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  pin: ['Sted', 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  car: ['Bil', 'M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v1M17 19v1M5 11h14'],
  bus: ['Buss', 'M5 4h14v13H5zM5 11h14M8 20v-3M16 20v-3M8 14h.01M16 14h.01'],
  train: ['Tog', 'M6 4h12v11H6zM6 10h12M8 19l-2 2M16 19l2 2M9 15h.01M15 15h.01'],
  bike: ['Sykkel', 'M6 17a3 3 0 1 0 0-.01M18 17a3 3 0 1 0 0-.01M6 17l4-8h5l3 8M10 9l-1-3H7'],
  boat: ['Båt', 'M3 17l2 3h14l2-3zM6 17V10l6-5 6 5v7M12 5v12'],
  hospital: ['Sykehus', 'M4 4h16v16H4zM12 8v8M8 12h8'],
  doctor: ['Lege', 'M9 3v6a3 3 0 0 0 6 0V3M12 12v3a4 4 0 0 0 8 0v-1M20 13a1 1 0 1 0 0-.01'],
  pill: ['Apotek', 'M8 4h8a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8zM12 4v8M7 16h10M9 20h6'],
  church: ['Kirke', 'M12 2v4M10 4h4M6 21V11l6-4 6 4v10M10 21v-5h4v5'],
  book: ['Bibliotek', 'M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z'],
  music: ['Musikk', 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  film: ['Kino', 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4'],
  food: ['Restaurant', 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10'],
  cart: ['Matbutikk', 'M3 4h2l2 11h11l2-8H6M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01'],
  fuel: ['Bensin', 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 9h6M14 10h2a2 2 0 0 1 2 2v5a1 1 0 0 0 2 0V8l-3-3'],
  bolt: ['Lading', 'M13 2L4 14h7l-1 8 9-12h-7z'],
  paw: ['Dyr', 'M12 14c-3 0-5 2.5-5 4.5S9 21 12 21s5-.5 5-2.5S15 14 12 14zM6 10a2 2 0 1 0 0-.01M18 10a2 2 0 1 0 0-.01M9 6a2 2 0 1 0 0-.01M15 6a2 2 0 1 0 0-.01'],
  baby: ['Barnehage', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM6 21v-3a6 6 0 0 1 12 0v3M10 7h.01M14 7h.01'],
  swim: ['Svømmehall', 'M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M6 14l4-6 4 3 3-4M17 5a1.5 1.5 0 1 0 0-.01'],
  ski: ['Ski', 'M4 20L20 4M8 20L20 8M14 4a2 2 0 1 0 0-.01'],
  tent: ['Camping', 'M3 20L12 4l9 16zM12 4v16M9 20l3-6 3 6'],
  mountain: ['Fjell', 'M3 20l6-11 4 6 2-3 6 8zM9 9l2 4'],
  beach: ['Strand', 'M3 20h18M12 20c0-6 2-10 7-12M12 20c0-6-2-10-7-12M12 8c-3-3-6-3-8-2M12 8c3-3 6-3 8-2'],
  sun: ['Sol', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  gift: ['Gave', 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0'],
  cake: ['Bursdag', 'M4 21h16v-8H4zM4 16c2 1 4 1 6 0s4-1 6 0 4 1 4 0M12 9v4M12 5a1 1 0 0 0 0 2'],
  game: ['Spill', 'M6 9h12a4 4 0 0 1 0 8l-2-2H8l-2 2a4 4 0 0 1 0-8zM8 11v3M6.5 12.5h3M15 12h.01M17 14h.01'],
  laptop: ['Kontor', 'M4 5h16v11H4zM2 19h20'],
  tool: ['Verksted', 'M14 7a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-2 2-2-1-1-2z'],
  key: ['Utleie', 'M15 9a4 4 0 1 0-4 4l-8 8M9 17l2 2M12 14l2 2'],
  bed: ['Hotell', 'M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 11a1.5 1.5 0 1 0 0-.01'],
  flag: ['Mål', 'M5 21V4M5 4h11l-2 4 2 4H5'],
  bell: ['Varsel', 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0'],
  camera: ['Foto', 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'],
  anchor: ['Havn', 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 8v13M5 13a7 7 0 0 0 14 0M9 11h6'],
  leaf: ['Hage', 'M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l7-7'],
};
/** Rekkefølgen i velgeren: 18 vanlige først, så resten («Vis alle»). */
export const ICON_KEYS42 = Object.keys(ZIC42);
export const IFY42 = /^ify:[a-z0-9-]+:[a-z0-9-]+$/;

/** Norske søkeord → engelsk (Iconify søker på engelsk). Fasit: Familie.dc.html → ifySearch NO. */
export const NB_SYN42 = {
  båt: 'boat', seilbåt: 'sailboat', kirke: 'church', hus: 'house', hjem: 'home', hytte: 'cabin',
  skole: 'school', jobb: 'briefcase', bil: 'car', sykkel: 'bike', fotball: 'ball', trening: 'barbell',
  butikk: 'shopping', mat: 'food', 'kafé': 'coffee', kafe: 'coffee', kaffe: 'coffee', tog: 'train',
  buss: 'bus', fly: 'plane', flyplass: 'plane', strand: 'beach', fjell: 'mountain', tre: 'tree',
  skog: 'trees', sykehus: 'hospital', lege: 'stethoscope', apotek: 'pill', bok: 'book', bibliotek: 'library',
  musikk: 'music', kino: 'movie', spill: 'gamepad', hund: 'dog', katt: 'cat', hest: 'horse',
  fisk: 'fish', barnehage: 'baby', svømming: 'swim', basseng: 'pool', telt: 'tent', gave: 'gift',
  kake: 'cake', bursdag: 'cake', stjerne: 'star', hjerte: 'heart', sol: 'sun', snø: 'snowflake',
  vann: 'droplet', havn: 'anchor', verksted: 'tool', kontor: 'building', hotell: 'bed', øl: 'beer',
  vin: 'wine', bensin: 'gas', lading: 'charging', lekeplass: 'playground', venner: 'users', trikk: 'tram',
  't-bane': 'train', stasjon: 'train', fjord: 'waves', sjø: 'waves', hage: 'plant', blomst: 'flower',
  dyrlege: 'paw', frisør: 'scissors', tannlege: 'tooth', bank: 'bank', post: 'mail', pakke: 'package',
  idrett: 'trophy', scene: 'microphone', teater: 'masks', museum: 'building-museum', slott: 'castle', bro: 'bridge',
  ferge: 'ship', skip: 'ship', camping: 'tent', grill: 'grill', fest: 'confetti', bryllup: 'rings',
  sky: 'cloud', regn: 'umbrella', skøyter: 'ice-skating', sykkelverksted: 'bike', handel: 'shopping-cart',
};
// Ekstra norske ord som treffer innebygde ikoner (navnet på ikonet treffer alltid).
const LOCAL = { trening: 'gym', treningssenter: 'gym', hytte: 'cabin', hytta: 'cabin', mormor: 'heart', morfar: 'heart', farmor: 'heart', farfar: 'heart', kontor: 'laptop', fotball: 'ball', idrett: 'ball',
  kaffe: 'coffee', kafe: 'coffee', skog: 'tree', fly: 'plane', flyplass: 'plane', hus: 'home', hjemme: 'home', seilbåt: 'boat', ferge: 'boat', legekontor: 'doctor', tannlege: 'doctor', bok: 'book', mat: 'food',
  handel: 'cart', dagligvare: 'cart', hund: 'paw', katt: 'paw', dyrlege: 'paw', basseng: 'swim', svømming: 'swim', telt: 'tent', bading: 'beach', blomst: 'leaf', båthavn: 'anchor' };

const norm = (s) => String(s ?? '').trim().toLowerCase();
/** Innebygde ikoner som passer søket (navn, nøkkel eller norsk søkeord). */
export function matchLocal42(q) {
  const n = norm(q);
  if (!n) return ICON_KEYS42;
  return ICON_KEYS42.filter((k) => ZIC42[k][0].toLowerCase().includes(n) || k.includes(n) || (n.length > 2 && Object.entries(LOCAL).some(([w, v]) => v === k && w.startsWith(n))));
}
export const toEnglish42 = (q) => NB_SYN42[norm(q)] ?? norm(q);

/** SVG-elementene i et Iconify-ikon (body) som én path (d). Elementer med stroke="none" (Tablers ramme) hoppes over. */
export function bodyToPath42(body) {
  const D = [], at = (t, a) => { const m = t.match(new RegExp(`\\s${a}="([^"]*)"`)); return m ? m[1] : null; };
  for (const t of String(body ?? '').match(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g) ?? []) {
    if (/stroke="none"/.test(t)) continue;
    const g = t.match(/^<(\w+)/)[1], n = (a) => parseFloat(at(t, a) || '0');
    if (g === 'path') { const d = at(t, 'd'); if (d) D.push(d); }
    else if (g === 'circle' || g === 'ellipse') { const cx = n('cx'), cy = n('cy'), rx = g === 'circle' ? n('r') : n('rx'), ry = g === 'circle' ? n('r') : n('ry'); D.push(`M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`); }
    else if (g === 'rect') { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); D.push(`M${x} ${y}h${w}v${h}h${-w}z`); }
    else if (g === 'line') D.push(`M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`);
    else { const pts = (at(t, 'points') || '').trim().split(/[\s,]+/).map(Number); let d = ''; for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`; if (g === 'polygon') d += 'z'; if (d) D.push(d); }
  }
  return D.join(' ');
}

const cache = new Map();
/** Søker i Lucide og Tabler. → {q, en, res:[{k:'ify:lucide:sailboat', n, set, p}]}. Kaster når nettet/CSP stopper kallet. */
export async function searchIconify42(q, { limit = 36 } = {}) {
  const en = toEnglish42(q);
  if (en.length < 2) return { q, en, res: [] };
  if (cache.has(en)) return { ...cache.get(en), q };
  const base = 'https://api.iconify.design';
  const r0 = await fetch(`${base}/search?query=${encodeURIComponent(en)}&prefixes=lucide,tabler&limit=48`);
  if (!r0.ok) throw new Error(`Iconify svarte ${r0.status}`);
  const j = await r0.json(), by = {};
  for (const id of (j.icons ?? []).slice(0, limit)) { const [p, n] = String(id).split(':'); if (p && n) (by[p] ??= []).push(n); }
  const lists = await Promise.all(Object.entries(by).map(([p, ns]) => fetch(`${base}/${p}.json?icons=${ns.join(',')}`).then((r) => (r.ok ? r.json() : {})).then((js) => ns.map((n) => {
    const ic = js.icons?.[n];
    if (!ic || (ic.width ?? js.width ?? 24) !== 24 || (ic.height ?? js.height ?? 24) !== 24) return null;
    const d = bodyToPath42(ic.body);
    return d && d.length <= 6000 && /^[MmLlHhVvCcSsQqTtAaZz0-9 .,\-eE]+$/.test(d) ? { k: `ify:${p}:${n}`, n: n.replace(/-/g, ' '), set: p === 'lucide' ? 'Lucide' : 'Tabler', p: d } : null;
  })).catch(() => [])));
  const out = { q, en, res: lists.flat().filter(Boolean) };
  cache.set(en, out);
  return out;
}

const RKEY = 'fam_icon_recent42';
/** Sist brukte ikoner (vises først i velgeren). [{k, p?}] */
export function recentIcons42() { try { const v = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(v) ? v.filter((x) => x && x.k).slice(0, 8) : []; } catch { return []; } }
export function rememberIcon42(k, p) {
  try { const L = recentIcons42().filter((x) => x.k !== k); L.unshift(IFY42.test(k) ? { k, p } : { k }); localStorage.setItem(RKEY, JSON.stringify(L.slice(0, 8))); } catch { /* privat modus */ }
}

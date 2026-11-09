// Prompt 79 (PICKWEB): rene hjelpere for plukklista og LED-feilsøkingen i Skjold Lab (testes direkte i test/p79-web.test.js).

/** Maks antall deler som lyser samtidig (serveren tåler 20 skuffer). */
export const MAX_LIT79 = 20;
/** Lett skillbare farger i den rekkefølgen delene ble lagt til. Første farge byttes med skapets egen farge. */
export const PALETTE79 = ['#2F6BFF', '#FFD000', '#22C55E', '#EF4444', '#A855F7', '#FF8A00', '#06B6D4', '#FF4FA3', '#FFFFFF', '#84CC16', '#8B5E3C', '#14B8A6'];
const HEX = /^#?([0-9a-f]{6})$/i;
export const hex79 = (c) => { const m = HEX.exec(String(c ?? '').trim()); return m ? `#${m[1].toUpperCase()}` : null; };
/** Paletten med skapets farge først (uten dobbel). */
export function palette79(first) {
  const f = hex79(first); if (!f) return PALETTE79.slice();
  return [f, ...PALETTE79.slice(1).filter((c) => c !== f)];
}
/** Farge nr. i (går rundt). */
export const colorAt79 = (i, first) => { const p = palette79(first); return p[((i % p.length) + p.length) % p.length]; };

const posInt = (n, d = 1) => { const v = Math.round(Number(n)); return Number.isFinite(v) && v >= 1 ? Math.min(v, 9999) : d; };
const idOf = (x) => (x && typeof x === 'object' ? x.partId ?? x.part_id ?? x.id : x);

/** Leser en plukkliste romslig (lokal eller fra serveren): [{id, qty, …snapshot}], uten doble, i rekkefølge. */
export function normPick79(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.picklist) ? raw.picklist : Array.isArray(raw?.picklist?.items) ? raw.picklist.items : [];
  const seen = new Set(), out = [];
  for (const x of arr) {
    const id = idOf(x);
    if (id == null || id === '' || seen.has(String(id))) continue;
    seen.add(String(id));
    const o = { id: String(id), qty: posInt(x?.qty ?? x?.take ?? 1) };
    for (const k of ['name', 'unit', 'thumb', 'locText', 'code']) if (typeof x?.[k] === 'string' && x[k]) o[k] = x[k].slice(0, 200);
    if (x?.loc && x.loc.cabinetId != null && x.loc.row) o.loc = { cabinetId: x.loc.cabinetId, row: +x.loc.row, col: +x.loc.col };
    if (Number.isFinite(+x?.stock)) o.stock = +x.stock;
    out.push(o);
    if (out.length >= 200) break;
  }
  return out;
}
export const has79 = (items, id) => items.some((x) => x.id === String(id));
/** Legg til eller fjern (+ / ✓). Returnerer ny liste. */
export function toggle79(items, part) {
  const id = String(part?.id ?? part);
  return has79(items, id) ? items.filter((x) => x.id !== id) : [...items, { id, qty: 1, ...(part && typeof part === 'object' ? snap79(part) : {}) }];
}
/** ± antall jeg tar (minst 1). */
export const setQty79 = (items, id, qty) => items.map((x) => (x.id === String(id) ? { ...x, qty: posInt(qty, x.qty) } : x));
/** Kort øyeblikksbilde av en del, så lista kan vises uten nett. */
export function snap79(p, extra = {}) {
  const o = {};
  if (p?.name) o.name = String(p.name).slice(0, 200);
  if (p?.unit) o.unit = String(p.unit).slice(0, 20);
  if (Number.isFinite(+p?.qty)) o.stock = +p.qty;
  return { ...o, ...extra };
}
/** Body til PUT /picklist. */
export const pickBody79 = (items) => ({ items: items.map((x) => ({ partId: /^\d+$/.test(x.id) ? Number(x.id) : x.id, qty: x.qty })) });
/** Body til POST /locate for lista (maks 20, i rekkefølge). */
export const locateBody79 = (items) => ({ partIds: items.slice(0, MAX_LIT79).map((x) => (/^\d+$/.test(x.id) ? Number(x.id) : x.id)), colors: true });

/** Farge per del fra svaret (lit[].color), ellers paletten i rekkefølge. Deler som deler skuff får den første fargen. */
export function colorsOf79(items, lit, first) {
  const out = {}, byDrawer = {};
  const L = Array.isArray(lit) ? lit : [];
  items.slice(0, MAX_LIT79).forEach((x, i) => {
    const hit = L.find((l) => String(l.partId ?? l.part_id ?? '') === x.id);
    if (!hit) return;
    const key = `${hit.cabinetId}:${hit.row}-${hit.col}`;
    out[x.id] = hex79(hit.color) ?? byDrawer[key] ?? colorAt79(i, first);
    byDrawer[key] ??= out[x.id];
  });
  return out;
}
/** Grunner fra serverens skipped (partId → kort tekst). Kjente koder får korte tekster, ellers brukes serverens grunn. */
const CODES79 = { max: 'Over 20 samtidig', out_of_range: 'LED-en finnes ikke på stripa', not_configured: 'Skapet har ikke lys', no_led: 'Raden har ingen LED-er', no_location: 'Har ingen plass', not_found: 'Fant ikke delen', unreachable: 'WLED svarer ikke', dns: 'Fant ikke WLED i nettet' };
export function skippedOf79(skipped) {
  const out = {};
  for (const s of Array.isArray(skipped) ? skipped : []) {
    const id = s?.partId ?? s?.part_id; if (id == null) continue;
    out[String(id)] = CODES79[s?.code] ?? (String(s?.reason ?? s?.error ?? '').slice(0, 80) || 'Lyser ikke');
  }
  return out;
}

/* ---------------- Feilsøk LED ---------------- */

/** Hint ut fra svarene (red/blue: true = lyste, false = lyste ikke, null = ikke svart). */
export function hint79(red, blue) {
  if (red == null || blue == null) return null;
  if (!red && !blue) return { cls: 'bad', title: 'Ingenting lyste – sjekk maskinvaren og oppsettet i WLED', items: ['GPIO-pinnen i WLED (LED Preferences) stemmer med den du har koblet til', 'LED-typen (WS2812B) og fargerekkefølgen (GRB)', 'Antall LED-er i WLED', 'Felles jord mellom ESP32 og strømforsyningen', 'Nivåskifter (3,3 V → 5 V) på datalinja', 'Nok strøm, og at strømbegrensningen i WLED ikke er for lav'] };
  if (red && !blue) return { cls: 'warn', title: 'Vanlig farge virker, men ikke enkelt-LED – det er en feil hos oss', items: ['Trykk «Kopier rapport» og send den til oss', 'Sjekk at WLED er versjon 0.13 eller nyere'] };
  if (!red && blue) return { cls: 'warn', title: 'Bare én LED lyste – segmentet er trolig av eller har lav lysstyrke', items: ['Åpne WLED og sjekk at segmentet er på og har lysstyrke over 0', 'Kjør feilsøkingen igjen'] };
  return { cls: 'ok', title: 'Stripa virker – da er det kalibreringen eller indeksen', items: ['Sjekk første LED og antall per rad', 'Kjør «Kalibrer …» og trykk på skuffen som lyser'] };
}
/** Stegene fra serveren, romslig. */
export function steps79(r) {
  const arr = Array.isArray(r?.steps) ? r.steps : [];
  return arr.map((s, i) => ({ name: String(s?.name ?? s?.title ?? `Steg ${i + 1}`), ok: s?.ok === true ? true : s?.ok === false ? false : null, detail: s?.detail == null ? '' : typeof s.detail === 'string' ? s.detail : JSON.stringify(s.detail) }));
}
/** Tekst til «Kopier rapport». */
export function report79(cab, steps, red, blue, hint) {
  const yn = (v) => (v == null ? '–' : v ? 'ja' : 'nei');
  return [`Feilsøk LED · ${cab?.name ?? 'Skap'} · ${new Date().toISOString()}`, ...steps.map((s) => `${s.ok === true ? '✓' : s.ok === false ? '✗' : '·'} ${s.name}${s.detail ? `: ${s.detail}` : ''}`), `Lyste stripa rødt: ${yn(red)}`, `Lyste én LED blått: ${yn(blue)}`, hint ? `Hint: ${hint}` : ''].filter(Boolean).join('\n');
}

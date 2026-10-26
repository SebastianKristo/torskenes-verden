#!/usr/bin/env node
// Prompt 69: fyller logobiblioteket (registry.json) automatisk fra OpenStreetMap-kjedene i Name Suggestion Index (NSI).
// Kjøres i GitHub Actions før fetch-logos.mjs (.github/workflows/logos.yml). Node 22, ingen avhengigheter.
// Bare offentlige data: NSI fra GitHub og Wikidata (P856 offisielt nettsted, P465 farge). Ingen brukerdata sendes.
//
// Kilde: data/brands/<tre>/<nøkkel>.json fra https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/
// (stabilt format i årevis, én fil per kategori; dist/nsi.json finnes ikke lenger på main). Filene listes via GitHub-API-et
// (GITHUB_TOKEN brukes hvis den finnes), med en fast liste som reserve.
//   - shop/* (alle), amenity/* (bare kategoriene i AMENITY), craft/*, leisure/fitness_centre og office/* (OFFICE)
//   - bare oppføringer med tags["brand:wikidata"]
//   - nye oppføringer bare når locationSet.include har «no» (og ikke exclude); globale (001/150/154) kjeder slås bare
//     sammen med oppføringer som allerede står i registeret
//
// Sammenslåing (mergeNsi):
//   1. samme wikidata-id, ellers samme normaliserte navn (navn eller alias i registeret mot NSI-navn/brand/displayName).
//      Generiske navn («Max», «Extra», «Obs», se GENERIC i match.js) slås bare sammen når kategorien er den samme.
//      En oppføring med en annen wikidata-id slås aldri sammen på navn.
//   2. eksisterende oppføringer får bare det som mangler: wikidata, domene (fra P856) og nye alias. navn, kategori,
//      farge, eksisterende alias og domene endres aldri. Oppføringer med kilde «manuell» røres ikke.
//   3. nye oppføringer: id, navn, alias (name/brand/displayName + matchNames), kategori (fra shop/amenity på norsk),
//      wikidata, domene (P856 eller tomt), farge (P465 eller fast farge fra navnet), kilde «nsi», nsi (NSI-id) og
//      fra «nsi» (blir stående når fetch-logos setter kilde). match.js matcher enkeltord-alias for disse strengt.
//   Alias som allerede tilhører en annen oppføring, og generiske ord fra matchNames, tas ikke med (falske treff).
//
// Valg: --dry-run   skriv ikke registeret   --max N   høyst N nye oppføringer   --no-wikidata   ikke slå opp P856/P465
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalize, isGeneric } from './match.js';
import { getEntities, domainOf, colorOf, WM_UA } from './wikimedia.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const REG = join(HERE, 'registry.json');
export const NSI_RAW = 'https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/data/';
const NSI_API = 'https://api.github.com/repos/osmlab/name-suggestion-index/contents/data/brands/';

export const AMENITY = new Set(('restaurant fast_food cafe ice_cream pub bar food_court fuel charging_station pharmacy bank bureau_de_change money_transfer ' +
  'payment_centre car_rental car_sharing bicycle_rental parking cinema post_office parcel_locker clinic dentist doctors veterinary car_wash ' +
  'vehicle_inspection driving_school').split(' '));
export const OFFICE = new Set('insurance telecommunication energy_supplier estate_agent courier'.split(' '));
// Reserve når GitHub-API-et ikke svarer: de vanligste filene.
const FALLBACK = [
  ...('supermarket convenience department_store variety_store clothes shoes sports outdoor bicycle electronics mobile_phone computer hardware ' +
    'doityourself furniture interior_decoration houseware kitchen garden_centre florist books stationery toys gift chemist cosmetics beauty ' +
    'perfumery optician jewelry bakery alcohol kiosk pet car car_parts car_repair tyres hairdresser travel_agency video_games ' +
    'paint bathroom_furnishing bed appliance hifi baby_goods bag watches fabric craft frozen_food butcher deli health_food second_hand ' +
    'charity telecommunication ticket lottery newsagent tobacco e-cigarette funeral_directors laundry dry_cleaning copyshop photo music').split(' ').map((k) => `shop/${k}`),
  ...[...AMENITY].map((k) => `amenity/${k}`),
  'leisure/fitness_centre', ...[...OFFICE].map((k) => `office/${k}`),
  ...'electrician plumber hvac locksmith key_cutter shoemaker tailor photographer'.split(' ').map((k) => `craft/${k}`),
];

/* ---------------- Kategori (de 15 i registeret) ---------------- */

const CAT = {
  Dagligvare: 'supermarket convenience greengrocer butcher frozen_food deli seafood health_food variety_store general farm cheese beverages department_store',
  'Mat ute og levering': 'restaurant fast_food cafe ice_cream pub bar food_court bakery pastry kiosk coffee confectionery chocolate tea',
  Elektronikk: 'electronics mobile_phone computer hifi appliance video_games camera photo electrical',
  'Bygg, bil og hjem': 'hardware doityourself furniture interior_decoration houseware kitchen garden_centre paint bathroom_furnishing bed carpet flooring tiles trade lighting curtain car car_parts car_repair tyres motorcycle boat storage_rental glaziery window_blind swimming_pool security electrician plumber hvac locksmith key_cutter carpenter',
  'Sport og fritid': 'sports outdoor bicycle fishing hunting golf ski scuba_diving fitness_centre',
  'Klær og sko': 'clothes shoes bag jewelry watches fashion_accessories boutique leather fabric tailor shoemaker baby_goods',
  'Apotek og helse': 'pharmacy chemist optician hearing_aids medical_supply cosmetics beauty perfumery hairdresser clinic dentist doctors veterinary massage nutrition_supplements',
  'Drivstoff og lading': 'fuel charging_station gas',
  'Transport og parkering': 'parking car_rental car_sharing bicycle_rental taxi car_wash vehicle_inspection driving_school',
  'Bank og forsikring': 'bank bureau_de_change money_transfer money_lender pawnbroker insurance',
  'Telekom, strøm og bolig': 'telecommunication energy_supplier estate_agent',
  'Offentlig og frakt': 'post_office parcel_locker courier',
  'Netthandel og betaling': 'payment_centre',
};
const CAT_OF = new Map(Object.entries(CAT).flatMap(([k, v]) => v.split(' ').map((x) => [x, k])));
export const DEFAULT_CAT = 'Bøker, gaver og annet';
/** NSI-sti («brands/shop/supermarket») → norsk kategori i registeret. */
export const categoryFor = (path) => CAT_OF.get(String(path).split('/').pop()) ?? DEFAULT_CAT;

/* ---------------- locationSet ---------------- */

const codes = (list) => (list ?? []).filter((x) => typeof x === 'string').map((x) => x.toLowerCase().replace(/\.geojson$/, ''));
const isNo = (c) => c === 'no' || c.startsWith('no-');
/** 'no' (finnes i Norge), 'global' (001/Europa, bare sammenslåing) eller null (ikke aktuell). */
export function locationKind(ls) {
  const inc = codes(ls?.include), exc = codes(ls?.exclude);
  if (exc.some(isNo)) return null;
  if (inc.some(isNo)) return 'no';
  if (inc.some((c) => c === '001' || c === '150' || c === '154')) return 'global';
  return null;
}

/* ---------------- Sammenslåing ---------------- */

const PALETTE = ['#00338D', '#D9001B', '#009A44', '#E35205', '#6A1B9A', '#00507D', '#C2185B', '#2E7D32', '#AD1457', '#1565C0', '#B71C1C', '#4E342E', '#00695C', '#283593', '#EF6C00', '#37474F'];
const colorFromName = (s) => PALETTE[createHash('sha1').update(normalize(s)).digest()[0] % PALETTE.length];
const stripRegion = (s) => String(s ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const slug = (s) => normalize(s).replace(/&/g, ' og ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

/** NSI-filer [{ path, items }] → kandidater med navn, alias, wikidata-id, kategori og locationSet-type. */
export function nsiCandidates(files) {
  const out = [];
  for (const f of files) {
    const path = f.path ?? f.properties?.path ?? '';
    for (const x of f.items ?? []) {
      const qid = x.tags?.['brand:wikidata'];
      if (!/^Q\d+$/.test(qid ?? '')) continue;
      const kind = locationKind(x.locationSet);
      if (!kind) continue;
      const navn = stripRegion(x.displayName) || x.tags?.brand || x.tags?.name;
      if (!navn) continue;
      const primary = [navn, x.tags?.brand, x.tags?.name, stripRegion(x.displayName)].filter(Boolean);
      out.push({ nsi: x.id ?? '', qid, kind, navn, kategori: categoryFor(path), primary, extra: (x.matchNames ?? []).filter(Boolean) });
    }
  }
  // Norske oppføringer først (de kan opprette nye), så de globale.
  return out.sort((a, b) => (a.kind === 'global') - (b.kind === 'global'));
}

/**
 * Slår sammen NSI-kandidatene med registeret. Endrer reg.items. entities: Map Qid → Wikidata-entitet (for P856/P465).
 * → { added: [...], merged: [...], skipped: [...] }
 */
export function mergeNsi(reg, files, { entities = new Map(), max = Infinity } = {}) {
  const items = reg.items;
  const cands = nsiCandidates(files);
  const report = { added: [], merged: [], skipped: [] };
  // Alias-eier: normalisert alias → oppføring (for konflikter).
  const owner = new Map();
  const addOwner = (it, a) => { const n = normalize(a); if (n && !owner.has(n)) owner.set(n, it); };
  for (const it of items) { addOwner(it, it.navn); for (const a of it.alias ?? []) addOwner(it, a); }
  const ids = new Set(items.map((x) => x.id));

  const byQid = (q) => items.find((it) => it.wikidata === q);
  function byName(c) {
    const names = new Set(c.primary.map(normalize).filter(Boolean));
    for (const it of items) {
      if (it.wikidata && it.wikidata !== c.qid) continue; // annen virksomhet med samme navn
      const nav = normalize(it.navn);
      const hit = names.has(nav) ? nav : (it.alias ?? []).map(normalize).find((a) => names.has(a));
      if (!hit) continue;
      if (isGeneric(hit) && it.kategori !== c.kategori) continue; // «Max» (burger) er ikke «Max» (strømming)
      return it;
    }
    return null;
  }
  // Nye alias for en oppføring: ikke tomme, ikke eid av en annen, og ikke generiske ord fra matchNames.
  function freshAliases(it, c) {
    const out = [];
    const have = new Set([normalize(it.navn), ...(it.alias ?? []).map(normalize)]);
    const primaryN = new Set(c.primary.map(normalize));
    // Globale oppføringer har matchNames for andre land («lidl deutschland», «burger king brasil»): bare hovednavnene.
    for (const raw of c.kind === 'global' ? c.primary : [...c.primary, ...c.extra]) {
      const a = String(raw).toLowerCase().trim(), n = normalize(a);
      if (!n || n.length < 2 || have.has(n)) continue;
      const o = owner.get(n);
      if (o && o !== it) continue;
      if (isGeneric(n) && !primaryN.has(n)) continue;
      have.add(n); out.push(a);
    }
    return out;
  }
  const applyEntity = (it, overwrite) => {
    const e = entities.get(it.wikidata);
    if (!e) return;
    if (!it.domene) { const d = domainOf(e); if (d) it.domene = d; }
    if (overwrite) { const col = colorOf(e); if (col) it.farge = col; }
  };

  function mergeInto(it, c) {
    done.add(c);
    if (it.kilde === 'manuell') { report.skipped.push({ navn: c.navn, why: `manuell (${it.id})` }); return; }
    const changes = [];
    if (!it.wikidata) { it.wikidata = c.qid; changes.push('wikidata'); }
    if (!it.nsi && c.nsi) it.nsi = c.nsi;
    const had = it.domene;
    applyEntity(it, false);
    if (!had && it.domene) changes.push('domene');
    const al = freshAliases(it, c);
    if (al.length) { it.alias = [...(it.alias ?? []), ...al]; for (const a of al) addOwner(it, a); changes.push(`alias:${al.join('|')}`); }
    if (changes.length) report.merged.push({ id: it.id, nsi: c.nsi, changes });
  }

  // To runder: navnetreff først (setter wikidata på eksisterende), så wikidata-treff. Deretter nye oppføringer.
  const done = new Set();
  for (const round of [1, 2]) {
    for (const c of cands) {
      if (done.has(c)) continue;
      const it = round === 1 ? byName(c) : byQid(c.qid);
      if (it) mergeInto(it, c);
    }
  }
  for (const c of cands) {
    if (done.has(c)) continue;
    if (c.kind !== 'no') { report.skipped.push({ navn: c.navn, why: 'global, ikke i registeret' }); continue; }
    // Samme merkevare som en oppføring som nettopp ble lagt til (f.eks. Spar i både convenience og supermarket).
    const same = byQid(c.qid);
    if (same) { mergeInto(same, c); continue; }
    if (report.added.length >= max) { report.skipped.push({ navn: c.navn, why: 'over --max' }); continue; }
    // Samme navn som en annen oppføring (som ikke kunne slås sammen): hopp over, ellers blir det to like.
    if (owner.has(normalize(c.navn))) { report.skipped.push({ navn: c.navn, why: `navnet tilhører ${owner.get(normalize(c.navn)).id}` }); continue; }
    let id = slug(c.navn);
    if (!id) { report.skipped.push({ navn: c.navn, why: 'tom id' }); continue; }
    if (ids.has(id)) id = `${id}-${c.qid.toLowerCase()}`;
    if (ids.has(id)) { report.skipped.push({ navn: c.navn, why: 'dobbel id' }); continue; }
    const it = { id, navn: c.navn, domene: '', alias: [], kategori: c.kategori, orgnr: '', farge: colorFromName(c.navn), fil: '', kilde: 'nsi', hentet: '', wikidata: c.qid, nsi: c.nsi, fra: 'nsi' };
    const al = freshAliases(it, c);
    // navnet selv må med som alias (freshAliases hopper over det fordi det står i navn)
    const own = c.navn.toLowerCase();
    it.alias = [own, ...al];
    applyEntity(it, true);
    items.push(it); ids.add(id); done.add(c);
    for (const a of it.alias) addOwner(it, a);
    report.added.push({ id, navn: it.navn, wikidata: c.qid, kategori: it.kategori, domene: it.domene });
  }
  return report;
}

/* ---------------- Nett ---------------- */

let fetchImpl = (...a) => globalThis.fetch(...a);
export function _setNsiFetch(f) { fetchImpl = f ?? ((...a) => globalThis.fetch(...a)); }

async function getJson(url, headers = {}) {
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': WM_UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) { await r.body?.cancel?.().catch(() => {}); return null; }
    return await r.json();
  } catch { return null; }
}

/** Stiene til NSI-filene som skal leses («brands/shop/supermarket»). */
export async function nsiPaths() {
  const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const out = [];
  let listed = 0;
  for (const tree of ['shop', 'amenity', 'craft', 'leisure', 'office']) {
    const list = await getJson(NSI_API + tree, { ...auth, Accept: 'application/vnd.github+json' });
    if (!Array.isArray(list)) continue;
    listed++;
    for (const f of list) {
      const key = String(f.name ?? '').replace(/\.json$/, '');
      if (!key || f.type !== 'file') continue;
      if (tree === 'amenity' && !AMENITY.has(key)) continue;
      if (tree === 'leisure' && key !== 'fitness_centre') continue;
      if (tree === 'office' && !OFFICE.has(key)) continue;
      out.push(`brands/${tree}/${key}`);
    }
  }
  return listed ? out : FALLBACK.map((p) => `brands/${p}`);
}

/** Leser NSI-filene, fire om gangen. Filer som mangler (404), hoppes over. */
export async function fetchNsi(paths) {
  const files = [];
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < paths.length) {
      const p = paths[i++];
      const j = await getJson(`${NSI_RAW}${p}.json`);
      if (j?.items) files.push({ path: j.properties?.path ?? p, items: j.items });
    }
  }));
  return files;
}

/* ---------------- Hovedprogram ---------------- */

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const DRY = args.includes('--dry-run'), MAX = Number(opt('--max')) || Infinity, NO_WD = args.includes('--no-wikidata');
  const { serialize } = await import('./fetch-logos.mjs');
  const reg = JSON.parse(await readFile(REG, 'utf8'));
  const paths = await nsiPaths();
  const files = await fetchNsi(paths);
  console.log(`[nsi] ${files.length} av ${paths.length} NSI-filer lest`);
  if (!files.length) { console.warn('[nsi] Ingen NSI-data – registeret er uendret.'); return; }
  const cands = nsiCandidates(files);
  // Wikidata for P856 (domene) og P465 (farge), i bunker på 50 – bare for kandidatene.
  const entities = NO_WD ? new Map() : await getEntities([...new Set(cands.map((c) => c.qid))]);
  const before = reg.items.length;
  const r = mergeNsi(reg, files, { entities, max: MAX });
  for (const a of r.added) console.log(`+ ${a.id.padEnd(28)} ${a.navn.padEnd(28)} ${a.kategori.padEnd(26)} ${a.wikidata} ${a.domene || '-'}`);
  for (const m of r.merged) console.log(`~ ${m.id.padEnd(28)} ${m.changes.join(', ')}`);
  console.log(`[nsi] ${cands.length} kandidater: ${r.added.length} nye, ${r.merged.length} oppdatert, ${r.skipped.length} hoppet over. ${before} → ${reg.items.length} oppføringer.`);
  if (DRY) { console.log('[nsi] --dry-run: registeret er ikke skrevet.'); return; }
  await writeFile(REG, serialize(reg));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

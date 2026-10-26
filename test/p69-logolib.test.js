// Prompt 69 (LOGOLIB): logo-jobben – NSI-kjeder inn i registeret (grow-nsi.mjs), Wikidata/Commons som første kilde og
// bedre favicon (fetch-logos.mjs), og vern mot falske treff i match.js. Alt nett er mocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p69-logofiles-'));
const M = await import('../server/logos/match.js');
const N = await import('../server/logos/grow-nsi.mjs');
const W = await import('../server/logos/wikimedia.mjs');
const F = await import('../server/logos/fetch-logos.mjs');

const realReg = JSON.parse(readFileSync(M.REGISTRY_FILE, 'utf8'));
const clone = () => structuredClone(realReg);
const png = (px, h = px) => { const b = Buffer.alloc(300); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(px, 16); b.writeUInt32BE(h, 20); return b; };
const claim = (value, rank = 'normal') => ({ rank, mainsnak: { snaktype: 'value', datavalue: { value } } });
const entity = (id, { label, logo, small, icon, site, color, norway = true } = {}) => ({
  id, labels: label ? { nb: { value: label } } : {}, aliases: {},
  claims: {
    ...(logo ? { P154: [claim(logo)] } : {}), ...(small ? { P8972: [claim(small)] } : {}), ...(icon ? { P2910: [claim(icon)] } : {}),
    ...(site ? { P856: [claim(site)] } : {}), ...(color ? { P465: [claim(color)] } : {}), ...(norway ? { P17: [claim({ id: 'Q20' })] } : { P17: [claim({ id: 'Q30' })] }),
  },
});

/* ---------------- match.js: falske treff ---------------- */

test('korte og generiske navn gir ikke falske treff, men treffer fortsatt først i teksten', () => {
  M.reloadRegistry();
  for (const t of ['MAXIMUM PARKERING', 'NORMALT', 'PARKERING EXTRA', 'SALG POWER', 'KIOSK MAX', 'MAKS']) assert.equal(M.matchMerchant(t), null, t);
  const hits = { 'NORMAL MAJORSTUEN': 'normal', 'POWER STORO': 'power', 'VIPPS*POWER': 'power', 'EXTRA STORO': 'coop-extra', 'OBS LILLESTROM': 'coop-obs', 'MAX BURGER OSLO': 'max-burgers', 'Netflx': 'netflix', 'BILTMA OSLO': 'biltema' };
  for (const [t, id] of Object.entries(hits)) assert.equal(M.matchMerchant(t)?.id, id, t);
  assert.ok(M.isGeneric('Max') && M.isGeneric('NORMAL') && M.isGeneric('Extra') && M.isGeneric('Power') && M.isGeneric('yx'));
  assert.ok(!M.isGeneric('Biltema') && !M.isGeneric('Clas Ohlson'));
  // Hurtigbufferen gir samme svar og kan ikke endres utenfra.
  const a = M.matchMerchant('REMA 1000 GRUNERLOKKA'); a.id = 'tull';
  assert.equal(M.matchMerchant('REMA 1000 GRUNERLOKKA').id, 'rema-1000');
});

/* ---------------- grow-nsi.mjs ---------------- */

const NSI = [
  { path: 'brands/shop/supermarket', items: [
    { displayName: 'Extra', id: 'extra-1', locationSet: { include: ['no'] }, matchNames: ['coop extra'], tags: { brand: 'Extra', 'brand:wikidata': 'Q11964085', name: 'Extra', shop: 'supermarket' } },
    { displayName: 'Obs', id: 'obs-1', locationSet: { include: ['no'] }, matchNames: ['coop obs'], tags: { brand: 'Obs', 'brand:wikidata': 'Q5167707', shop: 'supermarket' } },
    { displayName: 'Spar (Norge)', id: 'spar-no', locationSet: { include: ['no'] }, tags: { brand: 'Spar', 'brand:wikidata': 'Q610492', shop: 'supermarket' } },
    { displayName: 'Spar', id: 'spar-global', locationSet: { include: ['001'], exclude: ['no'] }, tags: { brand: 'Spar', 'brand:wikidata': 'Q610492' } },
    { displayName: 'Nærbutikken', id: 'naer-1', locationSet: { include: ['no'] }, matchNames: ['naerbutikken', 'mat'], tags: { brand: 'Nærbutikken', 'brand:wikidata': 'Q108810007' } },
    { displayName: 'Lidl', id: 'lidl-1', locationSet: { include: ['001'] }, matchNames: ['lidl deutschland'], tags: { brand: 'Lidl', 'brand:wikidata': 'Q151954' } },
    { displayName: 'Hypermart', id: 'hyper-1', locationSet: { include: ['001'] }, tags: { brand: 'Hypermart', 'brand:wikidata': 'Q999001' } },
    { displayName: 'Uten id', id: 'x', locationSet: { include: ['no'] }, tags: { brand: 'Uten id' } },
    { displayName: 'Svensk', id: 'se-1', locationSet: { include: ['se'] }, tags: { brand: 'Svensk', 'brand:wikidata': 'Q999002' } },
  ] },
  { path: 'brands/amenity/fast_food', items: [
    { displayName: 'Max', id: 'max-ff', locationSet: { include: ['dk', 'no', 'se'] }, tags: { brand: 'Max', 'brand:wikidata': 'Q1912172', amenity: 'fast_food' } },
    { displayName: 'Baker Hansen', id: 'bh-1', locationSet: { include: ['no'] }, tags: { brand: 'Baker Hansen', 'brand:wikidata': 'Q11960022' } },
  ] },
  { path: 'brands/amenity/fuel', items: [
    { displayName: 'St1', id: 'st1-1', locationSet: { include: ['fi', 'no', 'se'] }, matchNames: ['shell'], tags: { brand: 'St1', 'brand:wikidata': 'Q7592214' } },
    { displayName: 'Preem', id: 'preem-1', locationSet: { include: ['dk', 'no', 'se'] }, matchNames: ['preem bensin'], tags: { brand: 'Preem', 'brand:wikidata': 'Q598835' } },
  ] },
  { path: 'brands/shop/convenience', items: [
    { displayName: 'Nærbutikken', id: 'naer-2', locationSet: { include: ['no'] }, matchNames: ['naerbutikken express'], tags: { brand: 'Nærbutikken', 'brand:wikidata': 'Q108810007' } },
    { displayName: 'PostNord', id: 'pn-1', locationSet: { include: ['no'] }, tags: { brand: 'PostNord', 'brand:wikidata': 'Q461477' } },
  ] },
];

test('locationSet og kategori: Norge gir nye, globale bare sammenslåing, ekskludert Norge aldri', () => {
  assert.equal(N.locationKind({ include: ['no'] }), 'no');
  assert.equal(N.locationKind({ include: ['dk', 'NO'] }), 'no');
  assert.equal(N.locationKind({ include: ['001'] }), 'global');
  assert.equal(N.locationKind({ include: ['001'], exclude: ['no'] }), null);
  assert.equal(N.locationKind({ include: ['se'] }), null);
  assert.equal(N.categoryFor('brands/shop/supermarket'), 'Dagligvare');
  assert.equal(N.categoryFor('brands/amenity/fuel'), 'Drivstoff og lading');
  assert.equal(N.categoryFor('brands/amenity/fast_food'), 'Mat ute og levering');
  assert.equal(N.categoryFor('brands/shop/ukjent'), 'Bøker, gaver og annet');
  const cats = new Set(realReg.items.map((x) => x.kategori));
  for (const f of NSI) assert.ok(cats.has(N.categoryFor(f.path)), f.path);
});

// Registeret slik det var før NSI (den månedlige jobben har allerede slått sammen): uten NSI-oppføringer og wikidata-felt.
const preNsi = () => {
  const reg = clone();
  reg.items = reg.items.filter((x) => x.fra !== 'nsi').map(({ wikidata, nsi, ...x }) => x);
  return reg;
};

test('mergeNsi: slår sammen via navn og wikidata, rører aldri manuelle eller valgte felt, legger til norske kjeder', () => {
  const reg = preNsi();
  const before = new Map(reg.items.map((x) => [x.id, structuredClone(x)]));
  const entities = new Map([
    ['Q108810007', entity('Q108810007', { label: 'Nærbutikken', site: 'https://www.naerbutikken.no/', color: '1a7f3c' })],
    ['Q11960022', entity('Q11960022', { label: 'Baker Hansen', site: 'https://bakerhansen.no' })],
    ['Q598835', entity('Q598835', { label: 'Preem', norway: false })],
  ]);
  const r = N.mergeNsi(reg, NSI, { entities });
  const by = (id) => reg.items.find((x) => x.id === id);

  // Coop-kjedene får wikidata (generisk alias, men samme kategori), uten at navn/kategori/farge/domene/alias endres.
  for (const [id, q] of [['coop-extra', 'Q11964085'], ['coop-obs', 'Q5167707'], ['spar', 'Q610492'], ['st1', 'Q7592214'], ['lidl', 'Q151954']]) {
    const it = by(id), old = before.get(id);
    assert.ok(it, id);
    assert.equal(it.wikidata, q, id);
    for (const k of ['navn', 'kategori', 'farge', 'domene', 'kilde', 'fil']) assert.deepEqual(it[k], old[k], `${id}.${k}`);
    assert.deepEqual(it.alias.slice(0, old.alias.length), old.alias, `${id}: eksisterende alias beholdes`);
  }
  // Globale matchNames for andre land og «shell» (tilhører Shell) blir ikke alias.
  assert.ok(!by('lidl').alias.includes('lidl deutschland'));
  assert.ok(!by('st1').alias.includes('shell'));
  assert.equal(by('shell').wikidata ?? null, before.get('shell').wikidata ?? null);
  // Max (burger, fast_food) slås ikke sammen med Max (strømming) og blir ikke en ny «Max».
  assert.equal(by('max').wikidata, undefined);
  assert.equal(reg.items.filter((x) => M.normalize(x.navn) === 'max').length, 1);
  // Manuell oppføring (PostNord) røres ikke.
  assert.deepEqual(by('postnord'), before.get('postnord'));
  assert.ok(r.skipped.some((s) => /manuell/.test(s.why)));
  // Global kjede som ikke står i registeret, og land uten Norge, tas ikke med; heller ikke oppføringer uten wikidata.
  for (const n of ['hypermart', 'svensk', 'uten-id']) assert.ok(!by(n), n);

  // Nye norske kjeder: id, navn, alias (navn + matchNames, men ikke generiske «mat»), kategori, wikidata, domene, farge.
  const nb = by('naerbutikken');
  assert.ok(nb);
  assert.equal(nb.navn, 'Nærbutikken');
  assert.equal(nb.kategori, 'Dagligvare');
  assert.equal(nb.wikidata, 'Q108810007');
  assert.equal(nb.domene, 'naerbutikken.no');
  assert.equal(nb.farge, '#1A7F3C');
  assert.equal(nb.kilde, 'nsi');
  assert.equal(nb.fra, 'nsi');
  assert.ok(!nb.alias.includes('mat'));
  assert.ok(nb.alias.includes('naerbutikken express'), 'samme wikidata i en annen NSI-fil slås sammen');
  assert.equal(reg.items.filter((x) => x.wikidata === 'Q108810007').length, 1);
  for (const k of ['id', 'navn', 'domene', 'alias', 'kategori', 'farge', 'fil', 'kilde', 'hentet']) assert.ok(k in nb, k);
  assert.match(nb.farge, /^#[0-9a-f]{6}$/i);
  const bh = by('baker-hansen');
  assert.equal(bh.kategori, 'Mat ute og levering');
  assert.equal(bh.domene, 'bakerhansen.no');
  assert.match(bh.farge, /^#[0-9a-f]{6}$/i);
  // Uten P856 blir domenet tomt.
  assert.equal(by('preem').domene, '');
  assert.ok(r.added.length === 3 && r.merged.length >= 5, JSON.stringify(r.added));

  // Kjøres igjen: ingen nye oppføringer og ingen doble alias (idempotent).
  const n = reg.items.length, aliasCount = reg.items.map((x) => x.alias.length);
  const r2 = N.mergeNsi(reg, NSI, { entities });
  assert.equal(reg.items.length, n);
  assert.equal(r2.added.length, 0);
  assert.deepEqual(reg.items.map((x) => x.alias.length), aliasCount);
  for (const id of ['naerbutikken', 'baker-hansen', 'preem', 'coop-extra']) assert.equal(new Set(by(id).alias.map(M.normalize)).size, by(id).alias.length, id);
  // Alle id-er er fortsatt unike.
  assert.equal(new Set(reg.items.map((x) => x.id)).size, reg.items.length);
});

/* ---------------- Wikidata/Commons og favicon i fetch-logos.mjs ---------------- */

function makeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, headers: init.headers ?? {} });
    for (const [match, h] of routes) if (typeof match === 'string' ? u === match : match.test(u)) return h(u, init);
    return new Response('ikke funnet', { status: 404 });
  };
  f.calls = calls;
  return f;
}
const json = (o) => Response.json(o);
const img = (b) => new Response(b, { status: 200, headers: { 'content-type': 'image/png' } });
const page = (h) => new Response(`<!doctype html><html><head><title>x</title>${h}</head></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
const ents = (map) => (u) => json({ entities: Object.fromEntries(new URL(u).searchParams.get('ids').split('|').map((q) => [q, map[q] ?? { id: q, missing: '' }])) });
F._setImageMagick(null); // PNG lagres som den er; SVG hoppes over

test('logo-egenskapene velges i rekkefølgen P154, P8972, P2910, og Commons gir PNG med width=256', () => {
  assert.deepEqual(W.logoFile(entity('Q1', { logo: 'A.svg', small: 'B.svg', icon: 'C.png' })), { prop: 'P154', file: 'A.svg' });
  assert.deepEqual(W.logoFile(entity('Q1', { small: 'B.svg', icon: 'C.png' })), { prop: 'P8972', file: 'B.svg' });
  assert.deepEqual(W.logoFile(entity('Q1', { icon: 'C.png' })), { prop: 'P2910', file: 'C.png' });
  assert.equal(W.logoFile(entity('Q1')), null);
  const dep = entity('Q1', { logo: 'Ny.svg' }); dep.claims.P154.unshift(claim('Gammel.svg', 'deprecated'));
  assert.equal(W.logoFile(dep).file, 'Ny.svg');
  assert.equal(W.commonsPngUrl('Coop Extra logo.svg'), 'https://commons.wikimedia.org/wiki/Special:FilePath/Coop_Extra_logo.svg?width=256');
  assert.equal(W.domainOf(entity('Q1', { site: 'https://www.kiwi.no/' })), 'kiwi.no');
  assert.match(W.WM_UA, /kristo\.no/);
  assert.doesNotMatch(W.WM_UA, /Mozilla|Chrome/);
});

test('Wikidata er første kilde: logo fra Commons, kilde «wikidata», wikidata og commonsFil lagres', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p69-files-'));
  const f = makeFetch([
    [/wbgetentities/, ents({ Q11964085: entity('Q11964085', { label: 'Coop Extra', logo: 'Coop Extra logo.svg', small: 'Extra small.png' }) })],
    ['https://commons.wikimedia.org/wiki/Special:FilePath/Coop_Extra_logo.svg?width=256', () => img(png(256))],
  ]);
  F._setFetch(f);
  const it = { ...realReg.items.find((x) => x.id === 'coop-extra'), wikidata: 'Q11964085' };
  const owners = F.domainOwners(realReg.items);
  assert.equal(owners.get('coop.no'), 'coop');
  const r = await F.processItem(it, { filesDir: dir, owners, keep: false });
  assert.equal(r.status, 'got');
  assert.equal(it.kilde, 'wikidata');
  assert.equal(it.wikidata, 'Q11964085');
  assert.equal(it.commonsFil, 'Coop Extra logo.svg');
  assert.equal(it.fil, 'coop-extra.png');
  assert.ok(existsSync(join(dir, 'coop-extra.png')));
  // Ingen favicon fra coop.no (felles domene), og Wikimedia får logo-UA-en.
  assert.ok(!f.calls.some((c) => c.url.includes('coop.no')));
  for (const c of f.calls) assert.equal(c.headers['User-Agent'], W.WM_UA);
});

test('Coop-kjede uten Wikidata-logo blir bokstav, aldri coop.no-favicon', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p69-files-'));
  const f = makeFetch([[/wbgetentities/, ents({ Q5167705: entity('Q5167705', { label: 'Coop Prix' }) })]]);
  F._setFetch(f);
  const it = { ...realReg.items.find((x) => x.id === 'coop-prix'), wikidata: 'Q5167705' };
  const r = await F.processItem(it, { filesDir: dir, owners: F.domainOwners(realReg.items), keep: false });
  assert.equal(r.status, 'letter');
  assert.equal(it.kilde, 'bokstav');
  assert.ok(!f.calls.some((c) => /coop\.no|google|duckduckgo/.test(c.url)));
});

test('uten wikidata-felt slås id-en opp via domenet (P856); uten logo brukes favicon, og det største ikonet vinner', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p69-files-'));
  const f = makeFetch([
    [/query\.wikidata\.org\/sparql/, () => json({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q42' } }] } })],
    [/wbgetentities/, ents({ Q42: entity('Q42', { label: 'Testbutikken', site: 'https://testbutikken.no' }) })],
    ['https://testbutikken.no/', () => page('<link rel="icon" href="/f16.png" sizes="16x16"><link rel="icon" href="/f32.png" sizes="32x32"><link rel="manifest" href="/site.webmanifest"><meta property="og:image" content="/og.png">')],
    ['https://testbutikken.no/site.webmanifest', () => json({ icons: [{ src: '/i192.png', sizes: '192x192' }, { src: '/mono.png', sizes: '512x512', purpose: 'monochrome' }] })],
    ['https://testbutikken.no/f16.png', () => img(png(16))],
    ['https://testbutikken.no/f32.png', () => img(png(32))],
    ['https://testbutikken.no/i192.png', () => img(png(192))],
    ['https://testbutikken.no/og.png', () => img(png(1200, 630))],
  ]);
  F._setFetch(f);
  const it = { id: 'testbutikken', navn: 'Testbutikken', domene: 'testbutikken.no', alias: ['testbutikken'], kategori: 'Dagligvare', farge: '#000000', fil: '', kilde: '', hentet: '' };
  const r = await F.processItem(it, { filesDir: dir, owners: new Map(), keep: false });
  assert.equal(r.status, 'got');
  assert.equal(it.wikidata, 'Q42', 'id-en lagres selv uten logo');
  assert.equal(it.kilde, 'manifest');
  assert.equal(r.url, 'https://testbutikken.no/i192.png');
  assert.equal(it.commonsFil, undefined);
  assert.ok(!f.calls.some((c) => c.url.endsWith('/mono.png')));
  assert.ok(!f.calls.some((c) => c.url.includes('google.com/s2')), 'Google bare som siste reserve');
  // SPARQL-spørringen bruker URL-variantene av domenet, ikke brukerdata.
  const sp = f.calls.find((c) => c.url.includes('sparql'));
  assert.match(decodeURIComponent(sp.url), /<https:\/\/www\.testbutikken\.no\/>/);
});

test('og:image brukes bare kvadratisk, og 16 px velges aldri', async () => {
  F._setFetch(makeFetch([
    ['https://bred.no/', () => page('<link rel="icon" href="/f16.png" sizes="16x16"><meta property="og:image" content="/og.png">')],
    ['https://bred.no/f16.png', () => img(png(16))],
    ['https://bred.no/og.png', () => img(png(1200, 630))],
    ['https://kvadrat.no/', () => page('<link rel="icon" href="/f16.png" sizes="16x16"><meta content="https://cdn.kvadrat.no/og.png" property="og:image">')],
    ['https://kvadrat.no/f16.png', () => img(png(16))],
    ['https://cdn.kvadrat.no/og.png', () => img(png(600))],
  ]));
  const bred = await F.fetchSite('bred.no');
  assert.equal(bred.png, undefined);
  assert.ok(bred.reasons.includes('og-image:ikke-kvadratisk'));
  assert.ok(bred.reasons.includes('html-icon:16px'));
  const kv = await F.fetchSite('kvadrat.no');
  assert.equal(kv.kind, 'og-image');
  assert.equal(kv.url, 'https://cdn.kvadrat.no/og.png');
});

test('navnesøk godtar bare norske kandidater med samme navn', async () => {
  F._setFetch(makeFetch([
    [/wbsearchentities/, () => json({ search: [{ id: 'Q1' }, { id: 'Q2' }, { id: 'Q3' }] })],
    [/wbgetentities/, ents({ Q1: entity('Q1', { label: 'Normal', norway: false }), Q2: entity('Q2', { label: 'Normal Norge AS' }), Q3: entity('Q3', { label: 'Normal' }) })],
  ]));
  assert.equal(await W.qidForName('Normal'), 'Q3');
  F._setFetch(makeFetch([
    [/wbsearchentities/, () => json({ search: [{ id: 'Q1' }] })],
    [/wbgetentities/, ents({ Q1: entity('Q1', { label: 'Normal', norway: false }) })],
  ]));
  assert.equal(await W.qidForName('Normal'), null);
});

test('Wikimedia: én forespørsel om gangen per vert, hurtigbuffer og Retry-After ved 429', async () => {
  let active = 0, peak = 0, n429 = 0;
  const f = makeFetch([[/wikidata\.org/, async (u) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    if (u.includes('rate') && n429++ === 0) return new Response('', { status: 429, headers: { 'retry-after': '1' } });
    return json({ ok: u });
  }]]);
  W._setWikimediaFetch(f);
  const urls = Array.from({ length: 6 }, (_, i) => `https://www.wikidata.org/w/api.php?x=${i}`);
  const res = await Promise.all([...urls, ...urls].map((u) => W.wmGet(u)));
  assert.equal(peak, 1);
  assert.ok(res.every((r) => r.ok));
  assert.equal(f.calls.length, 6, 'samme URL hentes bare én gang');
  const rr = await W.wmGet('https://www.wikidata.org/w/api.php?rate=1');
  assert.ok(rr.ok);
  assert.equal(n429, 2);
  // Bunker på 50 i wbgetentities.
  const g = makeFetch([[/wbgetentities/, ents({})]]);
  W._setWikimediaFetch(g);
  await W.getEntities(Array.from({ length: 120 }, (_, i) => `Q${i + 1}`));
  assert.equal(g.calls.length, 3);
});

test('workflowen kjører grow-nsi før fetch-logos og committer registeret, filene og missing.txt', () => {
  const y = readFileSync(new URL('../.github/workflows/logos.yml', import.meta.url), 'utf8');
  const a = y.indexOf('node server/logos/grow-nsi.mjs'), b = y.indexOf('node server/logos/fetch-logos.mjs'), c = y.indexOf('git commit');
  assert.ok(a > 0 && a < b && b < c);
  assert.match(y, /git add server\/logos\/files server\/logos\/registry\.json server\/logos\/missing\.txt/);
  assert.match(y, /preview\.html/);
});

test('403 respekteres: nettstedet prøves ikke på nytt med nettleser-headere', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-p69-files-'));
  const f = makeFetch([[/stengt\.no/, () => new Response('nei', { status: 403 })]]);
  F._setFetch(f);
  const it = { id: 'stengt', navn: 'Stengt', domene: 'stengt.no', alias: ['stengt'], kategori: 'Dagligvare', farge: '#000000', fil: '', kilde: '', hentet: '' };
  await F.processItem(it, { filesDir: dir, owners: new Map(), keep: false, wikidata: false }).catch(() => {});
  const site = f.calls.filter((c) => /stengt\.no/.test(c.url) && !/google|duckduckgo/.test(c.url));
  assert.ok(site.length > 0);
  for (const c of site) assert.match(c.headers['User-Agent'] ?? '', /KristoHomelab/, 'alltid logo-UA-en, aldri nettleser-UA');
  assert.equal(new Set(site.map((c) => c.url)).size, site.length, 'hver URL hentes bare én gang');
});

test('varianter av butikknavn treffer samme kjede (store/små bokstaver, underkjeder, selskapsform, sted, domene)', () => {
  const cases = {
    ica: ['ICA', 'ica kvantum', 'ICA KVANTUM BERGEN', 'ICA Maxi Strömstad', 'VIPPS*ICA'],
    biltema: ['Biltema', 'BILTEMA', 'BILTEMA NORGE AS', 'VIPPS*BILTEMA'],
    'rema-1000': ['Rema', 'Rema1000', 'REMA-1000', 'REMA 1000 MAJORSTUEN'],
    kiwi: ['KIWI 512 STORO', 'Kiwi Minipris', 'kiwi.no'],
    'coop-obs': ['COOP OBS HYPERMARKED', 'OBS!', 'Obs Lillestrøm'],
    'circle-k': ['Circle K Storo', 'CIRCLEK', 'circle-k'],
    'apotek-1': ['Apotek 1 Storo', 'APOTEK1'],
    ikea: ['IKEA FURUSET', 'Ikea Norge AS'],
    elkjop: ['Elkjøp', 'ELKJOP', 'ELKJØP STORO'],
    mcdonalds: ['Mcdonalds', 'MC DONALDS', "McDonald's"],
    hm: ['H&M', 'HM NORGE', 'H & M'],
  };
  for (const [id, names] of Object.entries(cases)) for (const n of names) assert.equal(M.matchMerchant(n)?.id, id, n);
});

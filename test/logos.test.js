// Prompt 20: internt logobibliotek – register, matching av banktekster og endepunktene for appene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-logos-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-logofiles-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { matchMerchant, registry, FILES_DIR, fileForDomain } = await import('../server/logos/match.js');
const { domainFor, logo } = await import('../server/finans/enrich.js');
const { default: fin } = await import('../server/finans/routes.js');

test('registeret har alle feltene, unike id-er, ekte domener og minst 250 oppføringer', () => {
  const { items, version } = registry();
  assert.ok(version);
  assert.ok(items.length >= 250, `bare ${items.length}`);
  const ids = new Set();
  for (const x of items) {
    for (const k of ['id', 'navn', 'domene', 'alias', 'kategori', 'farge', 'fil', 'kilde', 'hentet']) assert.ok(k in x, `${x.id} mangler ${k}`);
    assert.match(x.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(x.id), `dobbel id ${x.id}`); ids.add(x.id);
    assert.match(x.farge, /^#[0-9a-f]{6}$/i);
    assert.ok(Array.isArray(x.alias) && x.alias.length, x.id);
    if (x.kilde !== 'bokstav') assert.match(x.domene, /^([a-z0-9-]+\.)+[a-z]{2,}$/, x.id);
  }
  assert.equal(new Set(items.map((x) => x.kategori)).size, 15);
  // Coop-kjedene har egne id-er (ikke én felles logo).
  for (const id of ['coop-extra', 'coop-obs', 'coop-prix', 'coop-mega', 'coop-marked']) assert.ok(ids.has(id), id);
  for (const n of ['Biltema', 'Clas Ohlson', 'Rema 1000', 'Komplett', 'Finn', 'Ruter', 'Elkjøp', 'Vinmonopolet', 'Nordisk Film Kino', 'Tesla Supercharger']) assert.ok(items.some((x) => x.navn === n), n);
});

test('akseptansetekstene gir riktig treff, KIOSK HANSEN gir null', () => {
  const cases = {
    'REMA 1000 GRUNERLOKKA': 'rema-1000', 'VIPPS*KIWI 123': 'kiwi', 'KLARNA*KOMPLETT.NO': 'komplett', 'BILTEMA ALNABRU': 'biltema',
    'CLAS OHLSON OSLO CITY': 'clas-ohlson', 'IZ *RUTER': 'ruter', 'FINN.NO AS': 'finn', 'CIRCLE K BISLETT': 'circle-k',
    'ELKJOP STORO': 'elkjop', 'ELKJØP STORO': 'elkjop', 'NETFLIX.COM': 'netflix', 'APPLE.COM/BILL': 'apple',
    'PAYPAL *STEAM': 'steam', 'GOOGLE *YouTube': 'youtube', 'COOP EXTRA STORO': 'coop-extra', 'COOP OBS LILLESTROM': 'coop-obs',
    'Varer 18.10 SPAR TORSHOV': 'spar', 'BILTEMA 1234': 'biltema', 'REMA1000 MAJORSTUEN': 'rema-1000', 'VIPPS*': 'vipps', 'H&M OSLO': 'hm',
    'SUMUP *NARVESEN OSLO S': 'narvesen', 'ZETTLE_*WOLT': 'wolt', 'NETS*EASYPARK 0150': 'easypark', 'Netflx': 'netflix', 'BILTMA OSLO': 'biltema',
  };
  for (const [t, id] of Object.entries(cases)) assert.equal(matchMerchant(t)?.id, id, t);
  const m = matchMerchant('VIPPS*KIWI 123');
  assert.deepEqual(Object.keys(m).sort(), ['domene', 'farge', 'id', 'kategori', 'navn']);
  assert.equal(m.domene, 'kiwi.no');
  for (const t of ['KIOSK HANSEN', 'SQ *KAFFEBAR', 'Husleie', 'Overføring', '', 'Lønn']) assert.equal(matchMerchant(t), null, t);
});

test('domainFor bruker registeret først', () => {
  assert.equal(domainFor('IZ *RUTER'), 'ruter.no');
  assert.equal(domainFor('KLARNA*KOMPLETT.NO'), 'komplett.no');
  assert.equal(domainFor('COOP MEGA BISLETT'), 'coop.no');
  assert.equal(domainFor('Kaffe og kake'), null);
});

test('endepunktene: registry med ETag, file/:id og match', async () => {
  const r = await fin.request('/logos/registry');
  assert.equal(r.status, 200);
  const etag = r.headers.get('etag');
  assert.ok(etag);
  const b = await r.json();
  assert.ok(b.version && b.items.length >= 250);
  assert.deepEqual(Object.keys(b.items[0]).sort(), ['alias', 'domene', 'farge', 'hasFile', 'id', 'kategori', 'navn']);
  assert.equal((await fin.request('/logos/registry', { headers: { 'if-none-match': etag } })).status, 304);

  assert.equal((await fin.request('/logos/file/finnes-ikke')).status, 404);
  assert.equal((await fin.request('/logos/file/..%2Fregistry')).status, 404);

  // En nedlastet fil: hasFile, PNG med lang cache, og logo(domain) leser den før nett.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a48a0000000049454e44ae426082', 'hex');
  const file = join(FILES_DIR, 'biltema.png');
  assert.ok(!FILES_DIR.includes('server/logos'));
  writeFileSync(file, png);
  try {
    // mtime-sjekken på mappen kan være grov; tving ny lesing.
    (await import('../server/logos/match.js')).reloadRegistry();
    const f = await fin.request('/logos/file/biltema');
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-type'), 'image/png');
    assert.equal(f.headers.get('cache-control'), 'public, max-age=2592000');
    const items = (await (await fin.request('/logos/registry')).json()).items;
    assert.equal(items.find((x) => x.id === 'biltema').hasFile, true);
    assert.ok(fileForDomain('biltema.no'));
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('ingen nett i testen'); };
    try { assert.ok((await logo('biltema.no'))?.length); } finally { globalThis.fetch = realFetch; }
  } finally { rmSync(file); (await import('../server/logos/match.js')).reloadRegistry(); }

  const m = await (await fin.request('/logos/match?q=' + encodeURIComponent('IZ *RUTER'))).json();
  assert.equal(m.match.id, 'ruter');
  assert.equal(m.id, 'ruter');
  assert.deepEqual(await (await fin.request('/logos/match?q=KIOSK%20HANSEN')).json(), { match: null });
});

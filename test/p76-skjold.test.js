// Prompt 76 (SKJSRV): Skjold Lab – sorteringsskapet. Per bruker, FTS-søket («10k» = «10kΩ» = «10 k»), flytt og historikk, antall,
// 409 ved sletting av skap med deler, bilder (eier-sjekk, signerte URL-er, EXIF/GPS fjernet når ImageMagick finnes), hjørner, kart,
// ledige skuffer, CSV inn/ut, etiketter, Glimt-verktøyet skjold.find og typen «Deler» i felles søk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-p76-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p76';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.SKJOLD76_DEMO = '0'; // egne data i testen (demodataene testes for seg)
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const ST = await import('../server/skjold76/store.js');
const IMG = await import('../server/skjold76/images.js');
const CSV = await import('../server/skjold76/csv.js');
const GL = await import('../server/skjold76/glimt.js');
const P = await import('../server/glimt45/plan.js');
const { magick50 } = await import('../server/img50.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: raw ?? (body === undefined ? undefined : isForm ? body : JSON.stringify(body)) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function login(username, password) {
  const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify({ username, password }) });
  return r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const cookie = await login('sebastian', 'testpassord1');
assert.ok(cookie, 'innlogging');
auth.createUser({ username: 'ingrid', password: 'ingridpassord', role: 'bruker' });
const cookie2 = await login('ingrid', 'ingridpassord');
assert.ok(cookie2, 'innlogging bruker 2');
const A = (path, method = 'GET', body, extra = {}) => req(path, { method, headers: { cookie, ...(extra.headers ?? {}) }, body, raw: extra.raw });
const B = (path, method = 'GET', body) => req(path, { method, headers: { cookie: cookie2 }, body });
const ME = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
const HAS_MAGICK = !!(await magick50());

let CAB = null;
const mk = async (b) => { const r = await A('/api/skjold/parts', 'POST', b); assert.equal(r.status, 201, r.text); return r.body; };
let P10k, Pm3, Pled, Pesp;

/* ---------------- 1. Skap og første gang ---------------- */

test('første gang: «Hovedskap» 12 × 5 (kjøpt) opprettes automatisk, per bruker', async () => {
  const r = await A('/api/skjold/cabinets');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 1);
  CAB = r.body[0];
  assert.deepEqual([CAB.name, CAB.rows, CAB.cols, CAB.kind], ['Hovedskap', 12, 5, 'kjøpt']);
  assert.deepEqual(CAB.counts, { parts: 0, usedDrawers: 0, drawers: 60 });
  assert.equal(CAB.photoUrl, null);
  const r2 = await B('/api/skjold/cabinets');
  assert.equal(r2.body.length, 1);
  assert.notEqual(r2.body[0].id, CAB.id);
  assert.equal((await req('/api/skjold/cabinets')).status, 401, 'uten innlogging');
  // Slettet hovedskap kommer ikke tilbake av seg selv.
  const tmp = await B('/api/skjold/cabinets', 'POST', { name: 'Ekstra', rows: 2, cols: 2, kind: '3d' });
  assert.equal(tmp.status, 201);
  assert.equal((await B(`/api/skjold/cabinets/${r2.body[0].id}`, 'DELETE')).status, 200);
  assert.deepEqual((await B('/api/skjold/cabinets')).body.map((c) => c.name), ['Ekstra']);
});

test('skap: validering, PATCH og tilleggsskap (3D-print)', async () => {
  assert.equal((await A('/api/skjold/cabinets', 'POST', { name: 'X', rows: 0, cols: 5 })).status, 400);
  assert.equal((await A('/api/skjold/cabinets', 'POST', { name: 'X', rows: 12, cols: 5, kind: 'stjålet' })).status, 400);
  assert.equal((await A('/api/skjold/cabinets', 'POST', { rows: 12, cols: 5 })).status, 400);
  const r = await A('/api/skjold/cabinets', 'POST', { name: 'Tilleggsskap (3D-print)', rows: 12, cols: 4, kind: '3d' });
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.rows, r.body.cols, r.body.kind], [12, 4, '3d']);
  const p = await A(`/api/skjold/cabinets/${r.body.id}`, 'PATCH', { name: 'Tillegg', notes: '27 cm' });
  assert.equal(p.body.name, 'Tillegg');
  assert.equal(p.body.notes, '27 cm');
  assert.equal((await B(`/api/skjold/cabinets/${r.body.id}`, 'PATCH', { name: 'Hack' })).status, 404, 'andres skap');
});

/* ---------------- 2. Deler og søk ---------------- */

test('deler: opprett med plassering, validering og plassering som tekst', async () => {
  P10k = await mk({ name: 'Motstand 10 kΩ', category: 'Motstander', specs: { verdi: '10kΩ', toleranse: '1%', pakke: '0805' }, qty: 200, min_qty: 50, tags: ['smd'], cabinetId: CAB.id, row: 1, col: 1, compartment: 1 });
  assert.equal(P10k.location.text, 'Hovedskap · Rad 1 · Skuff 1 · Rom 1');
  assert.equal(P10k.location.short, '1-1');
  assert.equal(P10k.minQty, 50);
  assert.equal(P10k.low, false);
  await mk({ name: 'Motstand 1 kΩ', category: 'Motstander', specs: { verdi: '1 k' }, qty: 100, cabinetId: CAB.id, row: 1, col: 1, compartment: 2 });
  await mk({ name: 'Motstand 10 Ω', category: 'Motstander', specs: { verdi: '10 Ω' }, qty: 30, cabinetId: CAB.id, row: 1, col: 2 });
  Pm3 = await mk({ name: 'M3 × 10 skruer', category: 'Skruer', specs: { gjenge: 'M3', lengde: '10 mm' }, qty: 50, min_qty: 20, cabinetId: CAB.id, row: 4, col: 2 });
  await mk({ name: 'M3', category: 'Skruer', description: 'Løse M3-deler', qty: 5, cabinetId: CAB.id, row: 4, col: 3 });
  Pled = await mk({ name: 'LED rød 5 mm', category: 'LED', specs: { farge: 'rød' }, qty: 3, minQty: 10, cabinetId: CAB.id, row: 3, col: 1 });
  Pesp = await mk({ name: 'ESP32 DevKitC', category: 'Mikrokontrollere', qty: 2, unit: 'stk' });
  await mk({ name: 'Kondensator 4,7 µF', category: 'Kondensatorer', specs: { verdi: '4,7 µF' }, qty: 20, cabinetId: CAB.id, row: 2, col: 1 });
  await mk({ name: 'Kabelsko blå', category: 'Kabelsko', tags: ['krympesko', 'blå'], qty: 40, cabinetId: CAB.id, row: 6, col: 1 });
  assert.equal(Pled.low, true, 'antall ≤ min');
  assert.equal(Pesp.location.text, 'Uten plass');
  assert.equal(Pesp.location.cabinetId, null);
  for (const [b, re] of [[{}, /Navn/], [{ name: 'x', qty: -1 }, /qty/], [{ name: 'x', unit: 'tonn' }, /unit/], [{ name: 'x', cabinetId: CAB.id, row: 13, col: 1 }, /row/],
    [{ name: 'x', cabinetId: CAB.id, row: 1, col: 1, compartment: 5 }, /compartment/], [{ name: 'x', url: 'javascript:alert(1)' }, /url/], [{ name: 'x', cabinetId: 99999, row: 1, col: 1 }, /Ukjent skap/]]) {
    const r = await A('/api/skjold/parts', 'POST', b);
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.match(r.body.error, re);
  }
  // Andre brukere ser ingenting og kan ikke legge deler i mitt skap.
  assert.equal((await B('/api/skjold/parts')).body.total, 0);
  assert.equal((await B(`/api/skjold/parts/${P10k.id}`)).status, 404);
  assert.equal((await B('/api/skjold/parts', 'POST', { name: 'x', cabinetId: CAB.id, row: 1, col: 1 })).status, 400);
  assert.equal((await B(`/api/skjold/parts/${P10k.id}`, 'PATCH', { qty: 0 })).status, 404);
  assert.equal((await B(`/api/skjold/parts/${P10k.id}`, 'DELETE')).status, 404);
});

const names = async (qs) => (await A(`/api/skjold/parts?${qs}`)).body.items.map((x) => x.name);
test('FTS-søk: «10k» treffer «10kΩ» og «10 k», store/små bokstaver, æøå, prefiks og rangering', async () => {
  assert.deepEqual(await names('q=10k'), ['Motstand 10 kΩ'], 'specs.verdi «10kΩ» og navnet «10 kΩ»');
  assert.deepEqual(await names('q=10%20k'), ['Motstand 10 kΩ']);
  assert.deepEqual(await names('q=10K'), ['Motstand 10 kΩ']);
  // «10 k» i specs (ikke i navnet)
  const x = await mk({ name: 'Trimpot', category: 'Motstander', specs: { verdi: '10 k' }, qty: 4 });
  assert.deepEqual((await names('q=10k')).sort(), ['Motstand 10 kΩ', 'Trimpot']);
  assert.equal((await A(`/api/skjold/parts/${x.id}`, 'DELETE')).status, 200);
  assert.deepEqual(await names('q=4.7uf'), ['Kondensator 4,7 µF']);
  assert.deepEqual(await names('q=4,7%20%C2%B5F'), ['Kondensator 4,7 µF']);
  assert.deepEqual(await names('q=r%C3%B8d'), ['LED rød 5 mm']);
  assert.deepEqual(await names('q=ROD'), ['LED rød 5 mm'], 'ø = o');
  assert.deepEqual(await names('q=bla'), ['Kabelsko blå'], 'å = a, tags');
  assert.deepEqual(await names('q=mikro'), ['ESP32 DevKitC'], 'prefiks i kategori');
  assert.deepEqual(await names('q=esp'), ['ESP32 DevKitC']);
  assert.deepEqual(await names('q=m3x10'), ['M3 × 10 skruer']);
  // Rangering: eksakt navn → navn-prefiks → resten.
  assert.deepEqual(await names('q=m3'), ['M3', 'M3 × 10 skruer']);
  assert.deepEqual((await names('q=motstand')).sort(), ['Motstand 1 kΩ', 'Motstand 10 kΩ', 'Motstand 10 Ω'].sort());
  assert.deepEqual(ST.searchParts76(ME, { q: 'motstand 10' }).rows.map((x) => x.name).slice(0, 2).sort(), ['Motstand 10 kΩ', 'Motstand 10 Ω'], 'navn-prefiks før resten');
  // Stamme som reserve: «skruene».
  assert.deepEqual(await names('q=skruene'), ['M3 × 10 skruer', 'M3'], 'navnetreff før kategoritreff');
  // Filtre
  assert.deepEqual(await names('low=1'), ['LED rød 5 mm']);
  assert.deepEqual((await names('category=motstander')).length, 3);
  assert.deepEqual(await names(`cabinet=${CAB.id}&row=4&col=2`), ['M3 × 10 skruer']);
  assert.deepEqual(await names('cabinet=none'), ['ESP32 DevKitC']);
  const pg = (await A('/api/skjold/parts?limit=2&offset=1')).body;
  assert.equal(pg.items.length, 2);
  assert.equal(pg.total, 9);
  // Skuffens etikett er søkbar.
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}/drawers/6/1`, 'PUT', { label: 'Elektrisk', compartments: 2, color: '#3366ff' })).status, 200);
  assert.deepEqual(await names('q=elektrisk'), ['Kabelsko blå']);
  // Forslag og kategorier
  const s = (await A('/api/skjold/suggest?q=mot')).body.items;
  assert.ok(s.length <= 8 && s.some((i) => i.kind === 'part' && i.sub.startsWith('Hovedskap · Rad 1')));
  assert.ok(s.some((i) => i.kind === 'category' && i.text === 'Motstander'));
  const cats = (await A('/api/skjold/categories')).body;
  assert.equal(cats.items.find((c) => c.name === 'Motstander').count, 3);
  assert.equal(cats.low, 1);
});

test('normalisering: fold76 og normSpec76', () => {
  assert.equal(ST.fold76('ÆØÅ Ü'), 'aeoa u');
  assert.equal(ST.normSpec76('10kΩ'), '10k ohm');
  assert.equal(ST.normSpec76('10 k'), '10k');
  assert.equal(ST.normSpec76('4,7 µF'), '4p7uf');
  assert.equal(ST.normSpec76('M3 × 10'), 'm3x10');
  assert.equal(ST.stem76('skruene'), 'skru');
});

/* ---------------- 3. Flytt, antall, historikk, sletting ---------------- */

test('flytt: occupied-advarsel, historikk og angre', async () => {
  const r = await A(`/api/skjold/parts/${Pled.id}/move`, 'POST', { cabinetId: CAB.id, row: 4, col: 2, compartment: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.part.location.text, 'Hovedskap · Rad 4 · Skuff 2');
  assert.deepEqual(r.body.occupied.map((o) => o.name), ['M3 × 10 skruer']);
  assert.match(r.body.warning, /M3 × 10 skruer/);
  assert.deepEqual(r.body.undo, { cabinetId: CAB.id, row: 3, col: 1, compartment: null });
  const h = (await A(`/api/skjold/parts/${Pled.id}/history`)).body.items;
  assert.equal(h[0].action, 'flyttet');
  assert.equal(h[0].from.text, 'Hovedskap · Rad 3 · Skuff 1');
  assert.equal(h[0].to.text, 'Hovedskap · Rad 4 · Skuff 2');
  assert.equal(h.at(-1).action, 'opprettet');
  // Angre via historikken
  const u = await A(`/api/skjold/history/${h[0].id}/undo`, 'POST');
  assert.equal(u.body.part.location.short, '3-1');
  // Til «Uten plass» og tilbake
  assert.equal((await A(`/api/skjold/parts/${Pled.id}/move`, 'POST', { cabinetId: null })).body.part.location.text, 'Uten plass');
  assert.equal((await A(`/api/skjold/parts/${Pled.id}/move`, 'POST', r.body.undo)).body.part.location.short, '3-1');
  assert.equal((await A(`/api/skjold/parts/${Pled.id}/move`, 'POST', { row: 1 })).status, 400, 'cabinetId påkrevd');
  // Ulike rom i samme skuff er ikke «opptatt».
  const m = await A(`/api/skjold/parts/${P10k.id}`);
  assert.deepEqual(m.body.occupied, []);
  assert.equal((await B(`/api/skjold/parts/${Pled.id}/move`, 'POST', { cabinetId: null })).status, 404);
});

test('antall: delta, set, aldri under 0, lavt lager og historikk', async () => {
  let r = await A(`/api/skjold/parts/${Pm3.id}/qty`, 'POST', { delta: -10 });
  assert.equal(r.body.qty, 40);
  assert.equal(r.body.low, false);
  r = await A(`/api/skjold/parts/${Pm3.id}/qty`, 'POST', { delta: -25 });
  assert.equal(r.body.qty, 15);
  assert.equal(r.body.low, true);
  r = await A(`/api/skjold/parts/${Pm3.id}/qty`, 'POST', { delta: -100 });
  assert.equal(r.body.qty, 0);
  r = await A(`/api/skjold/parts/${Pm3.id}/qty`, 'POST', { set: 50 });
  assert.equal(r.body.qty, 50);
  assert.equal(r.body.undo.set, 0);
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}/qty`, 'POST', {})).status, 400);
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}/qty`, 'POST', { set: -1 })).status, 400);
  const h = (await A(`/api/skjold/parts/${Pm3.id}`)).body.history.filter((x) => x.action === 'antall');
  assert.deepEqual(h.map((x) => [x.from.qty, x.to.qty]), [[0, 50], [15, 0], [40, 15], [50, 40]]);
  // PATCH endrer felt og logger «endret».
  const p = await A(`/api/skjold/parts/${Pm3.id}`, 'PATCH', { description: 'Unbrako', tags: 'skrue, m3' });
  assert.deepEqual(p.body.tags, ['skrue', 'm3']);
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}/history`)).body.items[0].action, 'endret');
});

test('myk sletting (30 dager), gjenoppretting og opprydding', async () => {
  const x = await mk({ name: 'Midlertidig del', qty: 1, cabinetId: CAB.id, row: 12, col: 5 });
  const d = await A(`/api/skjold/parts/${x.id}`, 'DELETE');
  assert.equal(d.status, 200);
  assert.equal(Date.parse(d.body.purgeAt) - Date.parse(d.body.deletedAt), 30 * 86400_000);
  assert.deepEqual(await names('q=midlertidig'), []);
  assert.equal((await A(`/api/skjold/parts/${x.id}`, 'PATCH', { qty: 3 })).status, 404);
  assert.ok((await A('/api/skjold/trash')).body.items.some((p) => p.id === x.id));
  const r = await A(`/api/skjold/parts/${x.id}/restore`, 'POST');
  assert.equal(r.status, 200);
  assert.equal(r.body.location.short, '12-5');
  assert.deepEqual(await names('q=midlertidig'), ['Midlertidig del']);
  assert.equal((await A(`/api/skjold/parts/${x.id}/restore`, 'POST')).status, 404);
  // Eldre enn 30 dager → borte.
  await A(`/api/skjold/parts/${x.id}`, 'DELETE');
  ST._setClock76(Date.now() + 31 * 86400_000);
  try { ST.purge76(); } finally { ST._setClock76(null); }
  assert.equal(db.prepare('SELECT count(*) FROM skj_parts WHERE id=?').pluck().get(x.id), 0);
  assert.equal((await A(`/api/skjold/parts/${x.id}/restore`, 'POST')).status, 404);
});

test('slett skap: 409 med deler, ?move=<id> og ?move=none', async () => {
  const c2 = (await A('/api/skjold/cabinets', 'POST', { name: 'Lite skap', rows: 2, cols: 2, kind: '3d' })).body;
  const a = await mk({ name: 'Flyttes med', qty: 1, cabinetId: c2.id, row: 2, col: 2 });
  const r = await A(`/api/skjold/cabinets/${c2.id}`, 'DELETE');
  assert.equal(r.status, 409);
  assert.equal(r.body.parts, 1);
  assert.equal((await A(`/api/skjold/cabinets/${c2.id}?move=${c2.id}`, 'DELETE')).status, 400);
  const ok = await A(`/api/skjold/cabinets/${c2.id}?move=${CAB.id}`, 'DELETE');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.moved, 1);
  assert.equal((await A(`/api/skjold/parts/${a.id}`)).body.location.text, 'Hovedskap · Rad 2 · Skuff 2');
  const c3 = (await A('/api/skjold/cabinets', 'POST', { name: 'Skap 3', rows: 1, cols: 1, kind: '3d' })).body;
  await A(`/api/skjold/parts/${a.id}/move`, 'POST', { cabinetId: c3.id, row: 1, col: 1 });
  assert.equal((await A(`/api/skjold/cabinets/${c3.id}?move=none`, 'DELETE')).status, 200);
  assert.equal((await A(`/api/skjold/parts/${a.id}`)).body.location.text, 'Uten plass');
  assert.equal((await A(`/api/skjold/parts/${a.id}/history`)).body.items[0].action, 'flyttet');
  // Mindre rutenett som ville kastet ut deler → 409.
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}`, 'PATCH', { rows: 3 })).status, 409);
  await A(`/api/skjold/parts/${a.id}`, 'DELETE');
});

/* ---------------- 4. Skuffer, kart, ledige ---------------- */

test('kart og skuffer: alle 60 skuffer, etikett, rom, antall og deler', async () => {
  const m = (await A(`/api/skjold/cabinets/${CAB.id}/map`)).body;
  assert.equal(m.rows, 12);
  assert.equal(m.drawers.length, 60);
  const d11 = m.drawers.find((d) => d.row === 1 && d.col === 1);
  assert.equal(d11.label, 'R1·S1');
  assert.equal(d11.count, 2);
  assert.deepEqual(d11.parts.map((p) => p.name), ['Motstand 10 kΩ', 'Motstand 1 kΩ']);
  const d61 = m.drawers.find((d) => d.short === '6-1');
  assert.deepEqual([d61.label, d61.compartments, d61.color], ['Elektrisk', 2, '#3366ff']);
  assert.equal(m.drawers.find((d) => d.short === '3-1').low, true);
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}/drawers/13/1`, 'PUT', { label: 'x' })).status, 404);
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}/drawers/1/1`, 'PUT', { compartments: 9 })).status, 400);
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}/drawers/1/1`, 'PUT', { color: 'red;x' })).status, 400);
  assert.equal((await B(`/api/skjold/cabinets/${CAB.id}/map`)).status, 404);
  // Færre rom → deler i rom som forsvinner mister rommet.
  await A(`/api/skjold/cabinets/${CAB.id}/drawers/1/1`, 'PUT', { compartments: 1 });
  const p = (await A(`/api/skjold/parts/${P10k.id}`)).body;
  assert.equal(p.compartment, 1);
  assert.equal((await A(`/api/skjold/parts?cabinet=${CAB.id}&row=1&col=1`)).body.items.find((x) => x.name === 'Motstand 1 kΩ').compartment, null);
  // Tilbake til standard: raden forsvinner.
  await A(`/api/skjold/cabinets/${CAB.id}/drawers/6/1`, 'PUT', { label: '', compartments: 1, color: null });
  assert.equal(db.prepare('SELECT count(*) FROM skj_drawers WHERE cabinet_id=? AND row=6 AND col=1').pluck().get(CAB.id), 0);
});

test('ledige skuffer: første tomme skuff ovenfra og fra venstre', async () => {
  const f = (await A(`/api/skjold/free?cabinet=${CAB.id}`)).body;
  assert.equal(f.cabinets.length, 1);
  const used = new Set((await A(`/api/skjold/cabinets/${CAB.id}/map`)).body.drawers.filter((d) => d.count).map((d) => d.short));
  assert.equal(f.cabinets[0].freeCount, 60 - used.size);
  assert.ok(!f.cabinets[0].free.some((d) => used.has(d.short)));
  assert.deepEqual([f.first.row, f.first.col], [1, 3]);
  assert.equal(f.first.text, 'Hovedskap · Rad 1 · Skuff 3');
  const all = (await A('/api/skjold/free')).body;
  assert.ok(all.cabinets.length >= 2);
});

/* ---------------- 5. Bilder og hjørner ---------------- */

/** JPEG med EXIF (APP1) og en GPS-kommentar, laget med ImageMagick. */
function jpegWithExif() {
  const base = execFileSync(HAS_MAGICK_CMD, ['-size', '2400x1800', 'gradient:red-blue', 'jpg:-']);
  const tiff = Buffer.from('4d4d002a00000008000100010002000000024e00000000000000', 'hex'); // IFD0 med én tag (GPSLatitudeRef-lignende)
  const app1Body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(app1Body.length + 2) >> 8, (app1Body.length + 2) & 0xff]), app1Body]);
  const com = Buffer.from('GPS:59.9139,10.7522', 'latin1');
  const comSeg = Buffer.concat([Buffer.from([0xff, 0xfe, 0, com.length + 2]), com]);
  return Buffer.concat([base.subarray(0, 2), app1, comSeg, base.subarray(2)]);
}
const HAS_MAGICK_CMD = HAS_MAGICK ? await magick50() : null;
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const formOf = (buf, name = 'del.jpg', type = 'image/jpeg') => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); return f; };

test('bilder: opplasting, skalering, EXIF/GPS fjernet, eier-sjekk og signerte URL-er', async () => {
  const input = HAS_MAGICK ? jpegWithExif() : PNG1;
  if (HAS_MAGICK) assert.ok(input.includes(Buffer.from('Exif')) && input.includes(Buffer.from('GPS:59.9139')));
  const r = await A(`/api/skjold/parts/${Pm3.id}/photos`, 'POST', formOf(input, HAS_MAGICK ? 'm3.jpg' : 'm3.png', HAS_MAGICK ? 'image/jpeg' : 'image/png'));
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.photos.length, 1);
  assert.ok(r.body.thumbUrl.startsWith('/api/skjold/files/'));
  const big = await A(r.body.photos[0].url);
  assert.equal(big.status, 200);
  if (HAS_MAGICK) {
    assert.equal(big.headers.get('content-type'), 'image/jpeg');
    assert.ok(!big.buf.includes(Buffer.from('Exif')), 'EXIF fjernet');
    assert.ok(!big.buf.includes(Buffer.from('GPS:59.9139')), 'GPS-kommentar fjernet');
    const { imageSize50 } = await import('../server/img50.js');
    const s = imageSize50(big.buf), t = imageSize50((await A(r.body.thumbUrl)).buf);
    assert.equal(Math.max(s.w, s.h), 1600);
    assert.equal(Math.max(t.w, t.h), 320);
  }
  // Signert URL virker uten innlogging (appenes bildelastere) …
  assert.equal((await req(r.body.thumbUrl)).status, 200);
  // … men ikke med endret signatur, eller for en annen fil.
  assert.equal((await req(r.body.thumbUrl.replace(/sig=.{4}/, 'sig=AAAA'))).status, 401);
  const name = r.body.photos[0].name;
  assert.equal((await req(`/api/skjold/files/${name}`)).status, 401, 'uten innlogging og uten signatur');
  // Eier-sjekk: den andre brukeren får 404 med egen innlogging.
  assert.equal((await B(`/api/skjold/files/${name}`)).status, 404);
  assert.equal((await A('/api/skjold/files/..%2F..%2Fhomelab.db')).status, 404);
  assert.equal((await B(`/api/skjold/parts/${Pm3.id}/photos`, 'POST', formOf(input))).status, 404);
  // Ugyldig fil og tom forespørsel.
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}/photos`, 'POST', formOf(Buffer.from('ikke et bilde'), 'x.txt', 'text/plain'))).status, 415);
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}/photos`, 'POST', new FormData())).status, 400);
  // Slett bildet: fila forsvinner.
  const before = readdirSync(IMG.DIR76).length;
  const d = await A(`/api/skjold/parts/${Pm3.id}/photos/0`, 'DELETE');
  assert.equal(d.body.photos.length, 0);
  assert.equal(readdirSync(IMG.DIR76).length, before - 2);
  assert.equal((await A(`/api/skjold/files/${name}`)).status, 404);
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}/photos/0`, 'DELETE')).status, 404);
});

test('skapbilde og hjørner: validering, lagring og fjerning', async () => {
  const input = HAS_MAGICK ? execFileSync(HAS_MAGICK_CMD, ['-size', '600x900', 'xc:#222', 'png:-']) : PNG1;
  const r = await A(`/api/skjold/cabinets/${CAB.id}/photo`, 'POST', formOf(input, 'skap.png', 'image/png'));
  assert.equal(r.status, 201, r.text);
  assert.ok(r.body.photoUrl && r.body.thumbUrl);
  assert.equal((await req(r.body.photoUrl)).status, 200);
  assert.equal((await B(`/api/skjold/cabinets/${CAB.id}/photo`, 'POST', formOf(input, 'skap.png', 'image/png'))).status, 404);
  const C = { tl: { x: 0.1, y: 0.05 }, tr: { x: 0.9, y: 0.06 }, br: { x: 0.92, y: 0.95 }, bl: { x: 0.08, y: 0.94 } };
  const k = await A(`/api/skjold/cabinets/${CAB.id}/corners`, 'PUT', C);
  assert.equal(k.status, 200);
  assert.deepEqual(k.body.corners, C);
  assert.deepEqual((await A(`/api/skjold/cabinets/${CAB.id}/map`)).body.corners, C);
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}/corners`, 'PUT', { ...C, br: { x: 1.4, y: 0.9 } })).status, 400);
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}/corners`, 'PUT', { ...C, br: C.bl, bl: C.br })).status, 400, 'vrengt firkant');
  assert.equal((await A(`/api/skjold/cabinets/${CAB.id}/corners`, 'PUT', { tl: C.tl })).status, 400);
  assert.deepEqual((await A(`/api/skjold/cabinets/${CAB.id}/corners`, 'PUT', { tl: [0.1, 0.05], tr: [0.9, 0.06], br: [0.92, 0.95], bl: [0.08, 0.94] })).body.corners, C, 'tåler [x, y]');
  const d = await A(`/api/skjold/cabinets/${CAB.id}/photo`, 'DELETE');
  assert.equal(d.body.photoUrl, null);
  assert.equal(d.body.corners, null);
});

/* ---------------- 6. CSV og etiketter ---------------- */

test('CSV: eksport, forhåndsvisning (dry) og import (ny + endre), feil per linje', async () => {
  const e = await A('/api/skjold/export.csv');
  assert.equal(e.status, 200);
  assert.match(e.headers.get('content-type'), /text\/csv/);
  const lines = e.text.replace(/^﻿/, '').trim().split(/\r\n/);
  assert.equal(lines[0], CSV.CSV_COLS76.join(','));
  assert.ok(lines.some((l) => l.includes('"Motstand 10 kΩ"') || l.includes(',Motstand 10 kΩ,')));
  assert.ok(lines.some((l) => l.includes('"{""verdi"":""10kΩ""')));
  const parsed = CSV.parseCsv76(e.text);
  const m3 = parsed.find((r) => r[1] === 'M3 × 10 skruer');
  assert.equal(m3[9], 'Hovedskap');
  // Import: endre antall på M3 (via id), en ny del, én feil.
  const csv = [CSV.CSV_COLS76.join(','), `${m3[0]},M3 × 10 skruer,Skruer,,,75,stk,20,skrue;m3,Hovedskap,4,2,,,,`,
    ',"Diode 1N4007",Dioder,,"{""type"":""likeretter""}",100,stk,,diode,Hovedskap,7,1,,https://example.com/1n4007,0.5,Elfa', ',Uten skap,,,,1,stk,,,Finnes ikke,1,1,,,,', ',,,,,,,,,,,,,,,'].join('\n');
  const dry = await A('/api/skjold/import?dry=1', 'POST', undefined, { headers: { 'content-type': 'text/csv' }, raw: csv });
  assert.equal(dry.status, 200, dry.text);
  assert.deepEqual([dry.body.dry, dry.body.create, dry.body.update, dry.body.skipped], [true, 1, 1, 1]);
  assert.match(dry.body.errors[0].error, /Ukjent skap/);
  assert.equal(dry.body.errors[0].line, 4);
  assert.deepEqual(await names('q=1n4007'), [], 'dry lagrer ingenting');
  const imp = await A('/api/skjold/import', 'POST', formOf(Buffer.from(csv), 'deler.csv', 'text/csv'));
  assert.equal(imp.status, 201, imp.text);
  const di = (await A('/api/skjold/parts?q=1n4007')).body.items[0];
  assert.deepEqual([di.location.text, di.specs.type, di.price, di.supplier, di.url], ['Hovedskap · Rad 7 · Skuff 1', 'likeretter', 0.5, 'Elfa', 'https://example.com/1n4007']);
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}`)).body.qty, 75);
  assert.ok((await A(`/api/skjold/parts/${Pm3.id}/history`)).body.items.some((h) => h.action === 'antall' && h.to.qty === 75));
  // Andre brukeres id-er endres ikke: importen blir en ny del hos dem.
  const other = await B('/api/skjold/import', 'POST', { csv: `id,name,qty\n${Pm3.id},Kapret,1` });
  assert.deepEqual([other.body.create, other.body.update], [1, 0]);
  assert.equal((await A(`/api/skjold/parts/${Pm3.id}`)).body.name, 'M3 × 10 skruer');
  assert.equal((await A('/api/skjold/import', 'POST', { csv: 'foo,bar\n1,2' })).status, 400);
  // Formelinjeksjon i regneark nøytraliseres ved eksport.
  const f = await mk({ name: '=HYPERLINK("x")', qty: 1 });
  assert.ok((await A('/api/skjold/export.csv')).text.includes(`"'=HYPERLINK(""x"")"`));
  await A(`/api/skjold/parts/${f.id}`, 'DELETE');
});

test('etiketter: HTML per skuff med «4-2», innhold og QR til /#/skjold/skap/<id>/4-2', async () => {
  const r = await A(`/api/skjold/labels?cabinet=${CAB.id}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.text, /<div class="no">4-2<\/div>/);
  assert.match(r.text, /M3 × 10 skruer/);
  assert.equal((r.text.match(/<svg /g) ?? []).length, 60, 'QR per skuff');
  assert.ok(!/<script/i.test(r.text));
  const only = await A(`/api/skjold/labels?cabinet=${CAB.id}&empty=0`);
  assert.ok((only.text.match(/<svg /g) ?? []).length < 60);
  assert.equal((await B(`/api/skjold/labels?cabinet=${CAB.id}`)).status, 404);
  // QR-en peker til /#/skjold/skap/<id>/4-2 på serverens adresse (samme matrise som qrSvg av URL-en).
  const { labelsHtml76 } = await import('../server/skjold76/labels.js');
  const { qrSvg } = await import('../server/totp.js');
  const html = labelsHtml76(ME, [ST.cabinetRow76(ME, CAB.id)], 'https://hjem.example');
  const want = qrSvg(`https://hjem.example/#/skjold/skap/${CAB.id}/4-2`, { px: 64, dark: '#000', light: '#fff' }).replace('QR-kode for 2FA', 'QR til skuff 4-2');
  assert.ok(html.includes(want));
});

/* ---------------- 7. Glimt og felles søk ---------------- */

test('Glimt: skjold.find svarer «… ligger i Hovedskap · Rad 4 · Skuff 2 (ca. 75 stk)» med kort som åpner Skjold Lab', async () => {
  assert.equal(GL.queryOf76('Hvor er M3-skruene?'), 'm3 skruene');
  const plan = P.localPlan45('Hvor er M3-skruene?', { user: ME });
  assert.deepEqual(plan.calls, [{ tool: 'skjold.find', args: { query: 'm3 skruene' } }]);
  assert.equal(P.localPlan45('Hvor er mamma?', { user: ME }).calls[0]?.tool === 'skjold.find', false, 'ikke deler → ikke Skjold');
  assert.equal(P.localPlan45('Hvilken skuff har jeg lagt kabelskoene i?', { user: ME }).calls[0].tool, 'skjold.find');
  const r = await A('/api/glimt/agent', 'POST', { text: 'Hvor er M3-skruene?', module: 'home', requestId: 't76-0001-abcdef' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.reply, /^M3 × 10 skruer ligger i Hovedskap · Rad 4 · Skuff 2 \(ca\. 75 stk\)\./);
  const card = r.body.results.find((c) => c.kind === 'part');
  assert.equal(card.id, Pm3.id);
  assert.equal(card.open.web, `/#/skjold/del/${Pm3.id}`);
  assert.equal(card.open.drawer, `/#/skjold/skap/${CAB.id}/4-2`);
  // Per bruker: Ingrid har ingen M3-skruer.
  const t = await GL.findTool76.run({ query: 'm3 skruer' }, { user: db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get() });
  assert.equal(t.result.count, 0);
  const none = await A('/api/glimt/agent', 'POST', { text: 'Hvor er skuffen med flux-pennen?', module: 'home', requestId: 't76-0002-abcdef' });
  assert.match(none.body.reply, /Fant ingen deler/);
  // Verktøyet ligger i registeret og i planleggerens liste.
  const { TOOL45 } = await import('../server/glimt45/tools.js');
  assert.ok(TOOL45['skjold.find']);
  const { plannerSystem47, INTENTS47 } = await import('../server/glimt45/plan47.js');
  assert.ok(INTENTS47.includes('parts_find'));
  assert.match(plannerSystem47(), /skjold\.find/);
});

test('felles søk (⌘K): typen «Deler» med plassering og lenke', async () => {
  const r = await A('/api/search51?q=m3%20skruer');
  assert.equal(r.status, 200, r.text);
  const hit = r.body.results.find((x) => x.type === 'part');
  assert.ok(hit, JSON.stringify(r.body).slice(0, 300));
  assert.equal(hit.typeLabel, 'Deler');
  assert.match(hit.subtitle, /Hovedskap · Rad 4 · Skuff 2/);
  assert.equal(hit.link.web, `/#/skjold/del/${Pm3.id}`);
  assert.ok(hit.actions.some((a) => a.url === `/#/skjold/skap/${CAB.id}/4-2`));
  const r2 = await B('/api/search51?q=m3%20skruer');
  assert.ok(!(r2.body.results ?? []).some((x) => x.type === 'part'), 'per bruker');
});

test('demodata: 15–20 vanlige deler i Hovedskap for mock-serveren', () => {
  const u = auth.createUser({ username: 'demo76', password: 'demopassord', role: 'bruker' }).id;
  const old = process.env.SKJOLD76_DEMO;
  process.env.SKJOLD76_DEMO = '1';
  try { ST.ensureUser76(u); } finally { process.env.SKJOLD76_DEMO = old; }
  const r = ST.searchParts76(u, { limit: 100 });
  assert.ok(r.total >= 15 && r.total <= 20, String(r.total));
  for (const q of ['10k', 'm3', 'led', 'esp32', 'kondensator', 'kabelsko']) assert.ok(ST.searchParts76(u, { q }).total > 0, q);
  assert.equal(ST.cabinetRows76(u).length, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-matrec-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MAT_AI_TIMEOUT_MS = '200';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const mat = await import('../server/mat.js');
const rec = await import('../server/mat-recipes.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const AUTH = { authorization: `Bearer ${token}` };
const call = async (path, method = 'GET', body) => {
  const multipart = body instanceof FormData;
  const r = await mat.matApi.request(path, { method, headers: multipart ? AUTH : { ...AUTH, 'content-type': 'application/json' }, body: multipart ? body : body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
};

// Nettsider og bilder uten nett: fetch byttes ut med faste svar.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a60000000049454e44ae426082', 'hex');
const PAGES = {
  'https://matprat.test/pizza': `<html><head><title>Pizza</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Matprat"},
      {"@type":["Recipe"],"name":"Pizza napoletana","image":[{"@type":"ImageObject","url":"/img/pizza.png"}],
       "recipeIngredient":["500 g tipo 00-mel","3,5 dl vann","2 ts salt","1 g gjær"],
       "recipeInstructions":[{"@type":"HowToSection","name":"Deig","itemListElement":[{"@type":"HowToStep","text":"Bland mel og vann."},{"@type":"HowToStep","text":"Hev i 24 timer."}]},{"@type":"HowToStep","text":"Stek på 280 &deg;C i 5 minutter."}],
       "recipeYield":["4","4 pizzaer"],"totalTime":"PT1H30M"}]}</script></head><body>…</body></html>`,
  'https://tine.test/suppe': `<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Blomkålsuppe</h1>
    <img itemprop="image" src="https://tine.test/img/suppe.png"><meta itemprop="totalTime" content="PT35M"><span itemprop="recipeYield">4 porsjoner</span>
    <ul><li itemprop="recipeIngredient">1 blomkål</li><li itemprop="recipeIngredient">1 l kraft</li><li itemprop="recipeIngredient">2 dl fløte</li></ul>
    <div itemprop="recipeInstructions"><p>Kok blomkål i kraften.</p><p>Kjør glatt og spe med fløte.</p></div></div>`,
  'https://blogg.test/laks': `<html><body><nav>Meny</nav><article><h1>Mormors ovnslaks</h1><p>Du trenger fire laksefileter, poteter og sitron. Legg laksen i form, krydre og stek på 200 grader i 15 minutter. Server med kokte poteter.</p></article></body></html>`,
  'https://blogg.test/ingenting': '<html><body><p>Hei</p></body></html>',
};
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('.png')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
  if (u === 'https://kort.test/omdirigert') return new Response('', { status: 302, headers: { location: 'https://matprat.test/pizza' } });
  if (PAGES[u]) return new Response(PAGES[u], { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  return new Response('Ikke funnet', { status: 404 });
};
let aiCalls = 0;
rec.setRecipeAi({
  text: async (prompt) => { aiCalls++; if (/Mormors/.test(prompt)) return { provider: 'Gemini', data: { name: 'Mormors ovnslaks', ingredients: ['4 laksefileter', 'Poteter', '1 sitron'], steps: ['Legg laksen i form.', 'Stek på 200 °C i 15 minutter.'], servings: '4', time: '25 min', folder: 'Fisk' } }; return { provider: 'Gemini', data: { name: '', ingredients: [], steps: [] } }; },
  vision: async (buf, mime) => { if (mime === 'application/pdf') throw new Error('Gemini-nøkkel mangler'); return { provider: 'Gemini', data: { name: 'Kyllinggryte fra kokeboka', ingredients: ['600 g kyllinglår', '1 boks kokosmelk', 'Karri'], steps: ['Brun kyllingen.', 'Ha i kokosmelk og karri.'], servings: '4', time: '40 min', folder: 'Kylling' } }; },
});

const today = new Date().toLocaleDateString('sv-SE');

test('standardmappene opprettes, og eksisterende retter får en mappe', async () => {
  const w = (await call(`/week?start=${today}`)).body;
  const names = (await call('/folders')).body.map((f) => f.name);
  assert.deepEqual(names, ['Middag', 'Supper', 'Fisk', 'Kylling', 'Vegetar', 'Bakst', 'Frokost', 'Favoritter']);
  assert.deepEqual(w.folders.map((f) => f.name), names);
  const fisk = (await call('/dishes', 'POST', { name: 'Fiskesuppe', ing: ['Torsk'] })).body.dish;
  assert.equal(fisk.folder, 'Supper');
  assert.deepEqual(fisk.ingredients, ['Torsk']);
  assert.deepEqual(fisk.links, []);
  assert.equal(rec.guessFolder('Kyllingwok'), 'Kylling');
  assert.equal(rec.guessFolder('Taco', ['Kjøttdeig']), 'Middag');
});

test('mapper: ny, endre navn, flytte rett og slette (rettene blir uten mappe)', async () => {
  const f = await call('/folders', 'POST', { name: 'Grill' });
  assert.equal(f.status, 201);
  assert.equal((await call('/folders', 'POST', { name: 'grill' })).status, 409);
  const d = (await call('/dishes', 'POST', { name: 'Grillspyd', folderId: f.body.id })).body.dish;
  assert.equal(d.folder, 'Grill');
  assert.equal((await call(`/folders/${f.body.id}`, 'PATCH', { name: 'Grill og bål' })).body.name, 'Grill og bål');
  const moved = (await call(`/dishes/${d.id}`, 'PATCH', { folderId: (await call('/folders')).body.find((x) => x.name === 'Favoritter').id, time: '30 min', servings: 4 })).body.dish;
  assert.equal(moved.folder, 'Favoritter');
  assert.equal(moved.time, '30 min');
  assert.equal(moved.servings, '4');
  await call(`/dishes/${d.id}`, 'PATCH', { folderId: f.body.id });
  const del = await call(`/folders/${f.body.id}`, 'DELETE');
  assert.equal(del.body.moved, 1);
  const w = (await call(`/week?start=${today}`)).body;
  assert.equal(w.dishes.find((x) => x.id === d.id).folderId, null);
});

test('import fra nettside: JSON-LD i @graph med seksjoner, bilde lastes ned lokalt', async () => {
  const p = await call('/recipes/import', 'POST', { url: 'https://kort.test/omdirigert' });
  assert.equal(p.status, 200);
  assert.equal(p.body.method, 'jsonld');
  assert.equal(p.body.name, 'Pizza napoletana');
  assert.equal(p.body.sourceUrl, 'https://matprat.test/pizza');
  assert.equal(p.body.image, 'https://matprat.test/img/pizza.png');
  assert.deepEqual(p.body.steps, ['Bland mel og vann.', 'Hev i 24 timer.', 'Stek på 280 °C i 5 minutter.']);
  assert.equal(p.body.ingredients.length, 4);
  assert.equal(p.body.servings, '4');
  assert.equal(p.body.time, '1 t 30 min');
  assert.equal(p.body.folderSuggestion, 'Bakst');
  const s = await call('/recipes/import/save', 'POST', { preview: p.body, folderId: null });
  assert.equal(s.status, 201);
  const d = s.body.dish;
  assert.equal(d.folder, 'Bakst');
  assert.equal(d.src, 'web');
  assert.equal(d.sourceUrl, 'https://matprat.test/pizza');
  assert.match(d.image, /^\/mat\/api\/files\/[a-f0-9]{12}$/);
  const img = await call(d.image.replace('/mat/api', ''));
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  // Samme oppskrift igjen får et nytt navn i stedet for å feile.
  assert.equal((await call('/recipes/import/save', 'POST', { preview: p.body })).body.dish.name, 'Pizza napoletana (2)');
});

test('import: microdata, AI som reserve og tydelige feil', async () => {
  const m = (await call('/recipes/import', 'POST', { url: 'https://tine.test/suppe' })).body;
  assert.equal(m.method, 'microdata');
  assert.deepEqual(m.ingredients, ['1 blomkål', '1 l kraft', '2 dl fløte']);
  assert.deepEqual(m.steps, ['Kok blomkål i kraften.', 'Kjør glatt og spe med fløte.']);
  assert.equal(m.time, '35 min');
  assert.equal(m.servings, '4');
  assert.equal(m.folderSuggestion, 'Supper');
  const a = (await call('/recipes/import', 'POST', { url: 'https://blogg.test/laks' })).body;
  assert.equal(a.method, 'ai');
  assert.equal(a.name, 'Mormors ovnslaks');
  assert.equal(a.folderSuggestion, 'Fisk');
  assert.ok(aiCalls >= 1);
  const none = await call('/recipes/import', 'POST', { url: 'https://blogg.test/ingenting' });
  assert.equal(none.status, 422);
  assert.match(none.body.error, /Fant ingen oppskrift/);
  assert.match((await call('/recipes/import', 'POST', { url: 'http://127.0.0.1:3000/' })).body.error, /Lokale adresser/);
  assert.match((await call('/recipes/import', 'POST', { url: 'file:///etc/passwd' })).body.error, /http/);
  assert.match((await call('/recipes/import', 'POST', { url: 'ikke en adresse' })).body.error, /Ugyldig/);
});

test('skann oppskrift: kø i bakgrunnen, originalbildet lagres, feil vises på jobben', async () => {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: '' }), 'kokebok.png');
  const r = await call('/recipes/scan', 'POST', fd);
  assert.equal(r.status, 202);
  let job;
  for (let i = 0; i < 50; i++) { job = (await call('/recipes/jobs')).body.find((j) => j.id === r.body.jobId); if (job.status === 'done' || job.status === 'error') break; await new Promise((ok) => setTimeout(ok, 20)); }
  assert.equal(job.status, 'done');
  assert.equal(job.name, 'Kyllinggryte fra kokeboka');
  const d = (await call(`/week?start=${today}`)).body.dishes.find((x) => x.id === job.dishId);
  assert.equal(d.src, 'scan');
  assert.equal(d.folder, 'Kylling');
  assert.match(d.image, /^\/mat\/api\/files\//);

  const pdf = new FormData();
  pdf.append('file', new Blob([Buffer.from('%PDF-1.4\n%…')], { type: 'application/pdf' }), 'oppskrift.pdf');
  const r2 = await call('/recipes/scan', 'POST', pdf);
  for (let i = 0; i < 50; i++) { job = (await call('/recipes/jobs')).body.find((j) => j.id === r2.body.jobId); if (job.status === 'error' || job.status === 'done') break; await new Promise((ok) => setTimeout(ok, 20)); }
  assert.equal(job.status, 'error');
  assert.match(job.error, /Gemini-nøkkel mangler/);
  assert.equal((await call(`/recipes/jobs/${job.id}/retry`, 'POST')).status, 200);

  const txt = new FormData();
  txt.append('file', new Blob(['hei'], { type: 'text/plain' }), 'notat.txt');
  assert.equal((await call('/recipes/scan', 'POST', txt)).status, 415);
});

test('lenker og filer per rett, med ikontype, og sletting rydder opp', async () => {
  const d = (await call('/dishes', 'POST', { name: 'Pizza' })).body.dish;
  const l1 = await call(`/dishes/${d.id}/links`, 'POST', { title: 'Pizzadeig-kalkulator', url: 'https://docs.google.com/spreadsheets/d/abc' });
  assert.equal(l1.status, 201);
  assert.equal(l1.body.links[0].kind, 'sheet');
  assert.equal((await call(`/dishes/${d.id}/links`, 'POST', { url: 'https://youtu.be/xyz' })).body.links[1].kind, 'video');
  assert.equal((await call(`/dishes/${d.id}/links`, 'POST', { url: 'javascript:alert(1)' })).status, 400);
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('PK\x03\x04xlsx')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Pizzadeig-kalkulator.xlsx');
  const f = await call(`/dishes/${d.id}/links`, 'POST', fd);
  const file = f.body.links[2];
  assert.equal(file.title, 'Pizzadeig-kalkulator.xlsx');
  assert.equal(file.kind, 'sheet');
  assert.match(file.fileUrl, /^\/mat\/api\/files\//);
  const got = await call(file.fileUrl.replace('/mat/api', ''));
  assert.match(got.headers.get('content-disposition'), /^attachment/);
  const bad = new FormData();
  bad.append('file', new Blob(['<script>'], { type: 'text/html' }), 'side.html');
  assert.equal((await call(`/dishes/${d.id}/links`, 'POST', bad)).status, 415);
  const w = (await call(`/week?start=${today}`)).body;
  assert.equal(w.dishes.find((x) => x.id === d.id).links.length, 3);
  assert.equal((await call(`/dishes/${d.id}/links/${l1.body.links[0].id}`, 'DELETE')).body.links.length, 2);
  await call(`/dishes/${d.id}`, 'DELETE');
  assert.equal((await call(file.fileUrl.replace('/mat/api', ''))).status, 404);
});

test('ISO-varighet og HTML-tegn tolkes', () => {
  assert.equal(rec.duration('PT45M'), '45 min');
  assert.equal(rec.duration('PT2H'), '2 t');
  assert.equal(rec.decode('Rømme &amp; ost &#8211; 200&deg;'), 'Rømme & ost – 200°');
});

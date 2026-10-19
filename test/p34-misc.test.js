// Prompt 34 (SERVER34): kvitteringer under AI-analyse, Chat-mappen «Kvitteringer og skanninger», Glimt-brief og widget,
// Innstillinger-søk med mål-id (anchor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p34m-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-34m';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

// Falsk Ollama for kvitteringslesingen (127.0.0.1:9). gate holder svaret tilbake så «analyseres av AI» kan sees.
let gate = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('127.0.0.1:9')) {
    if (u.endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen2.5vl:7b' }] });
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (body.messages?.[0]?.images) {
      if (gate) await gate;
      const r = { merchant: 'REMA 1000 Bislett', date: '2026-10-19', total: 247.8, currency: 'NOK', lines: [{ description: 'Melk', amount: 22.9 }, { description: 'Brød', amount: 39.9 }], confidence: { merchant: 0.95, date: 0.95, total: 0.94 }, suggested_category: 'Mat og dagligvarer' };
      return new Response(JSON.stringify({ message: { content: JSON.stringify(r) } }) + '\n', { status: 200 });
    }
    return new Response(JSON.stringify({ message: { content: '{}' } }), { status: 200 });
  }
  throw new TypeError('fetch failed');
};
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const brief = await import('../server/brief34.js');
const ask = await import('../server/settings-ask30.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
await A('/finans/api/settings', 'PUT', { ollamaUrl: 'http://127.0.0.1:9', provider: 'ollama', fallback: false });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

test('kvittering: «analyseres av AI» med steg og modell, så samtale i «Kvitteringer og skanninger» og jobb i AI-kontroll', async () => {
  let open; gate = new Promise((r) => { open = r; });
  const fd = new FormData(); fd.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'rema.jpg');
  const up = await A('/finans/api/receipts', 'POST', fd);
  assert.ok(up.status === 200 || up.status === 201, up.text);
  let an;
  for (let i = 0; i < 50; i++) { an = (await A('/finans/api/receipts/analyzing')).body; if (an.items[0]?.status === 'analyzing') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(an.count, 1);
  const it = an.items[0];
  assert.equal(it.status, 'analyzing');
  assert.equal(it.file, 'rema.jpg');
  assert.deepEqual(it.steps.map((s) => s.label), ['Lastet opp', 'Leser bildet', 'Finner butikk, dato og sum', 'Leser varelinjer', 'Foreslår kategori']);
  assert.equal(it.steps[0].done, true);
  assert.equal(it.title, 'Leser kvittering …');
  assert.ok(it.chatId, 'Følg i Chat');
  assert.deepEqual((await A('/finans/api/receipts?status=analyzing')).body.count, 1);
  assert.equal((await K('/finans/api/receipts/analyzing')).body.count, 0, 'per bruker');
  // Jobben i AI-kontroll (kind receipt).
  const jobs = (await A('/api/ai/jobs?kind=receipt')).body;
  assert.equal(jobs.running.length, 1);
  assert.equal(jobs.running[0].receiptId, it.id);
  open(); gate = null;
  for (let i = 0; i < 100; i++) { if (!(await A('/finans/api/receipts/analyzing')).body.count) break; await new Promise((r) => setTimeout(r, 20)); }
  const done = (await A('/api/ai/jobs?kind=receipt')).body.recent[0];
  assert.equal(done.status, 'ok');
  assert.equal(done.partial.store, 'REMA 1000 Bislett');
  assert.equal(done.partial.lines, 2);
  // Chat: systemmappen øverst, lukket, med samtalen «Butikk · beløp».
  const list = (await A('/api/chat/chats')).body;
  const f = list.folders[0];
  assert.equal(f.name, 'Kvitteringer og skanninger');
  assert.equal(f.sys, true); assert.equal(f.open, false); assert.equal(f.count, 1);
  assert.match(f.label, /^1 · \d+ til godkjenning$/);
  const ch = f.chats[0];
  assert.equal(ch.title, 'REMA 1000 Bislett · 247,80 kr');
  assert.equal(ch.kind, 'receipt'); assert.equal(ch.status, 'done');
  assert.ok(!list.chats.some((c) => c.id === ch.id), 'blandes ikke med vanlige samtaler');
  const full = (await A(`/api/chat/chats/${ch.id}`)).body;
  assert.match(full.messages[0].content, /Kvittering/);
  assert.equal(full.messages[0].files[0].name, 'rema.jpg');
  assert.match(full.messages[1].content, /\*\*REMA 1000 Bislett\*\*.*247,80 kr/s);
  assert.ok(full.messages[1].meta.tools.some((t) => t.label === 'Fant 2 varelinjer'));
  // Søk i Chat finner skanningen.
  assert.equal((await A('/api/chat/chats?q=bislett')).body.folders[0].chats.length, 1);
  // Systemmappen kan ikke slettes eller få nytt navn; samtalen kan slettes (bilaget blir).
  assert.equal((await A(`/api/chat/folders/${encodeURIComponent(f.id)}`, 'DELETE')).status, 403);
  assert.equal((await A(`/api/chat/folders/${encodeURIComponent(f.id)}`, 'PATCH', { name: 'Annet' })).status, 403);
  assert.equal((await A(`/api/chat/folders/${encodeURIComponent(f.id)}`, 'PATCH', { open: true })).body.open, true);
  assert.equal((await A(`/api/chat/chats/${ch.id}`, 'DELETE')).status, 200);
  assert.equal((await A(`/finans/api/receipts/${it.id}`)).status, 200);
});

test('POST /api/chat/system: pakkelapp/strekkode som egen samtale; samme ref oppdaterer', async () => {
  const a = await A('/api/chat/system', 'POST', { kind: 'label', ref: { trackingId: '70712345' }, title: 'Pakkelapp · Bring 70712…', source: 'Pakkelapp skannet', status: 'running', text: 'Leser …' });
  assert.equal(a.status, 200); assert.equal(a.body.created, true);
  const b = await A('/api/chat/system', 'POST', { kind: 'label', ref: { trackingId: '70712345' }, title: 'Pakkelapp · Bring 70712…', model: 'zbar', text: 'Lagt til i Sporing.', tools: [{ label: 'Leste strekkode' }, { label: 'Lagt til i Sporing' }], status: 'done' });
  assert.equal(b.body.chatId, a.body.chatId); assert.equal(b.body.created, false);
  assert.equal((await A('/api/chat/system', 'POST', { kind: 'tull', title: 'x' })).status, 400);
  const c = (await A(`/api/chat/chats/${a.body.chatId}`)).body;
  assert.equal(c.messages[1].content, 'Lagt til i Sporing.');
  assert.equal(c.messages[1].meta.status, 'done');
  assert.equal((await K(`/api/chat/chats/${a.body.chatId}`)).status, 404);
});

test('Glimt-brief: tittel etter tid, vær med nedbør 12 t og «i går», tre neste hendelser, nyheter, figur og widget', async () => {
  const H = (h) => `2026-10-19T${String(h).padStart(2, '0')}:00`;
  brief._setBriefWeather(async () => ({ place: { name: 'Oslo' }, current: { temp: 8.2, code: 2, isDay: false }, today: { hi: 9, lo: 4, sunset: '2026-10-19T18:04', precipProb: 70 }, yesterday: { hi: 11 },
    days: [{ hi: 9, lo: 4, code: 61, precipProb: 70 }], hours: Array.from({ length: 24 }, (_, i) => ({ t: H(i), temp: 8, precip: i >= 20 ? 1.2 : 0, precipProb: i >= 20 ? 80 : 10, code: 2 })), source: 'met', credit: 'MET Norge' }));
  const t = Date.parse('2026-10-19T18:31:00Z'); // 20:31 i Oslo
  assert.equal(brief.kindAt(Date.parse('2026-10-19T05:00:00Z')), 'morning');
  assert.equal(brief.kindAt(Date.parse('2026-10-19T12:00:00Z')), 'day');
  assert.equal(brief.kindAt(t), 'evening');
  const b = await brief.buildBrief('owner', { t });
  assert.equal(b.title, 'Kveldsbrief');
  assert.equal(b.kicker, 'GLIMT · KVELDSBRIEF');
  assert.match(b.summary, /^God kveld, Sebastian\. Delvis skyet og 8° i Oslo, regn fra ca\. 20\./);
  assert.match(b.summary, /Ta med paraply\.$/);
  assert.equal(b.summarySource, 'mal');
  assert.equal(b.weather.rain12h.length, 4, 'timene som er igjen av datasettet');
  assert.deepEqual(b.weather.vsYesterday, { diff: -2, text: '2° kaldere enn i går' });
  assert.equal(b.weather.sunset, '18:04');
  assert.ok(b.events.length <= 3);
  assert.ok(b.news.length <= 7); // prompt 35: 7 saker (toppsak + 6)
  assert.deepEqual(b.figure.guide.map((g) => g.k).slice(0, 2), ['hello', 'weather']);
  assert.equal(b.figure.mood, 'rainy');
  assert.match(b.footer, /^Laget av Glimt \d\d:\d\d · Vær: MET Norge · Nyheter: /);
  const r = await A('/api/brief?kind=morning');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.title, 'Morgenbrief');
  assert.equal((await A('/api/brief?kind=natt')).status, 400);
  const w = await A('/api/brief/widget?size=small');
  assert.equal(w.body.summary, null);
  assert.equal(w.body.deepLink, 'finanshub://brief');
  assert.equal(w.body.temp, 8);
  assert.equal((await A('/api/brief/widget?size=medium')).body.summary.length <= 140, true);
  // LLM-oppsummering (ruten «Glimt · brief») caches for vinduet.
  brief._setBriefLlm(async () => 'God kveld, Sebastian. Regn fra ca. 20, så ta med paraply.');
  const g = await brief.buildBrief('owner', { kind: 'evening', llm: true });
  assert.equal(g.summarySource, 'glimt');
  assert.equal((await brief.buildBrief('owner', { kind: 'evening' })).summary, 'God kveld, Sebastian. Regn fra ca. 20, så ta med paraply.');
  assert.deepEqual((await A('/api/brief/settings', 'PUT', { notify: false })).body, { notify: false, guide: true, home: true });
  assert.equal((await A('/api/brief/settings', 'PUT', { notify: 'ja' })).status, 400);
  brief._setBriefLlm(null);
});

test('Innstillinger-søk: «hvordan oppdaterer jeg» → System + Oppdater nå-knappen (anchor upd) uten AI-runde; alle oppføringer har anchor-felt', async () => {
  ask._setAsk30(async () => { throw new Error('skal ikke brukes'); });
  const r = await A('/api/settings/ask', 'POST', { q: 'hvordan oppdaterer jeg' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.targetId, 'system.oppdater');
  assert.equal(r.body.anchor, 'upd');
  assert.equal(r.body.target.tip, '✦ Trykk her for å oppdatere');
  assert.deepEqual(r.body.target.route, { web: '#/innstillinger/system', mobile: '#/set/oppd' });
  assert.equal(r.body.goMs, 1600);
  assert.match(r.body.answer, /Oppdater nå.*backup først.*2 minutter/);
  assert.equal((await A('/api/settings/ask', 'POST', { q: 'se etter oppdatering' })).body.anchor, 'chk');
  assert.equal((await A('/api/settings/ask', 'POST', { q: 'krev passord for oppdatering' })).body.anchor, 'pw');
  const idx = (await A('/api/settings/index')).body;
  assert.ok(idx.every((x) => 'anchor' in x));
  for (const [id, anchor] of [['utseende.bakgrunn', 'bg'], ['konto.2fa', '2fa'], ['backup.na', 'bk-now'], ['ai.gemini', 'ai-key-gemini'], ['brukere.ny', 'invite'], ['varsler.haptikk', 'haptic']]) assert.equal(idx.find((x) => x.id === id)?.anchor, anchor, id);
  assert.ok(!(await K('/api/settings/index')).body.some((x) => x.id === 'system.oppdater'), 'admin-sider skjult');
  ask._setAsk30(null);
});

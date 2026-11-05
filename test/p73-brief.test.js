// Prompt 73 (BRIEF73): «Innhold i briefen» (claude-code-brief-velg-kort.md) og kort som vises med en gang
// (claude-code-brief-kort-lastes-straks.md) – server, web, iOS og Android.
import './lib/day-clock.mjs'; // døgngrenser og nattstillhet: klokka holdes på dagtid (se lib/day-clock.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p73brief-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-73brief';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4791';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { kv } = await import('../server/db.js');
const B73 = await import('../server/brief73.js');
const C38 = await import('../server/cards38.js');
const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

let ipN = 30;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
assert.equal((await A('/api/users', 'POST', { username: 'pal', password: 'palPassord12345', role: 'bruker', name: 'Pål' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const P = as(await cookie('pal', 'palPassord12345'));
const sebId = (await A('/api/me')).body.id;
const ingridId = (await I('/api/me')).body.id;
const palId = (await P('/api/me')).body.id;

const DESIGN = ['vaer', 'kal', 'fokus', 'gjore', 'reise', 'regn', 'kveld', 'nyheter', 'pakker', 'homelab', 'domener'];

/* ---------------- Server: lista ---------------- */

test('brief-cards: standard utvalg og rekkefølge som i fasiten (BK0), 8 av 11 på blant de elleve', async () => {
  const r = await A('/api/brief-cards');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.cards.slice(0, 11).map((c) => c.key), DESIGN);
  const d = Object.fromEntries(r.body.cards.map((c) => [c.key, c.on]));
  for (const k of ['vaer', 'kal', 'fokus', 'gjore', 'reise', 'regn', 'kveld', 'nyheter']) assert.equal(d[k], true, k);
  for (const k of ['pakker', 'homelab', 'domener']) assert.equal(d[k], false, k);
  assert.equal(r.body.cards.slice(0, 11).filter((c) => c.on).length, 8);
  assert.match(r.body.count, /^\d+ av \d+ på$/);
  assert.equal(r.body.cards.find((c) => c.key === 'gjore').title, 'Huskeliste · 3 viktigste');
  assert.equal(r.body.cards.find((c) => c.key === 'reise').sub, 'Ruter: neste avgang og når du må gå');
});

test('brief-cards: skru av Regninger og flytt Min reise øverst → lagret per bruker, briefen følger uten omstart', async () => {
  const L = (await A('/api/brief-cards')).body.cards.map(({ key, on }) => ({ key, on: key === 'regn' ? false : on }));
  const i = L.findIndex((c) => c.key === 'reise');
  L.unshift(...L.splice(i, 1));
  const put = await A('/api/brief-cards', 'PUT', { cards: L });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.body.cards[0].key, 'reise');
  assert.equal(put.body.cards.find((c) => c.key === 'regn').on, false);
  const b = await A('/api/brief52');
  assert.equal(b.status, 200);
  assert.equal(b.body.order[0], 'reise');
  assert.ok(!b.body.order.includes('regn'));
  assert.ok(!b.body.cards.some((c) => c.id === 'bills'), 'Regninger er av');
  assert.equal(b.body.cards[0].id, 'trip', 'Min reise først');
  // Ingrid er ikke berørt.
  const ing = (await I('/api/brief-cards')).body.cards;
  assert.equal(ing[0].key, 'vaer');
  assert.equal(ing.find((c) => c.key === 'regn').on, true);
});

test('brief-cards: Min reise uten reise skjules ikke – kortet blir stående med tomtekst', async () => {
  const b = await A('/api/brief52?only=trip');
  const t = b.body.cards.find((c) => c.id === 'trip');
  assert.ok(t, JSON.stringify(b.body.cards));
  assert.equal(b.body.cards.length, 1, 'only= gir bare det ene kortet');
  if (!t.data) { assert.equal(t.empty, true); assert.ok(t.error); }
  assert.equal(t.key, 'reise');
});

test('brief-cards: Tilbakestill gir standard utvalg og rekkefølge', async () => {
  const r = await A('/api/brief-cards/reset', 'POST', {});
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.cards.slice(0, 11).map((c) => c.key), DESIGN);
  assert.equal(r.body.cards.find((c) => c.key === 'regn').on, true);
});

test('brief-cards: ukjent nøkkel og feil type avvises', async () => {
  assert.equal((await A('/api/brief-cards', 'PUT', { cards: [{ key: 'finnes-ikke', on: true }] })).status, 400);
  assert.equal((await A('/api/brief-cards', 'PUT', { cards: [{ key: 'vaer', on: 'ja' }] })).status, 400);
  assert.equal((await A('/api/brief-cards', 'PUT', { nope: 1 })).status, 400);
  assert.equal((await req('/api/brief-cards')).status, 401);
});

test('brief-cards: barn ser ikke Homelab/Domener (eller Regninger/Media); vanlig bruker uten tilgang ser ikke Homelab', async () => {
  assert.equal((await A('/api/admin/brief52/access', 'PUT', { children: [palId] })).status, 200);
  const keys = (await P('/api/brief-cards')).body.cards.map((c) => c.key);
  for (const k of ['homelab', 'domener', 'regn', 'kveld', 'aksjer']) assert.ok(!keys.includes(k), `${k} for barn`);
  const ik = (await I('/api/brief-cards')).body.cards.map((c) => c.key);
  assert.ok(!ik.includes('homelab') && !ik.includes('domener'), 'Ingrid har ikke tilgang');
  assert.ok((await A('/api/brief-cards')).body.cards.some((c) => c.key === 'homelab'), 'admin ser Homelab');
  // Lagring fra barnet beholder de skjulte kortene (uendret) bak de synlige.
  const L = (await P('/api/brief-cards')).body.cards.map(({ key, on }) => ({ key, on }));
  assert.equal((await P('/api/brief-cards', 'PUT', { cards: L })).status, 200);
  assert.ok(B73.rawCards73(palId).some((x) => x.key === 'homelab'));
  // Slå på Homelab for barnet direkte → /api/brief52 gir det likevel ikke.
  kv.set(palId, 'brief_cards', B73.KEYS73.map((key) => ({ key, on: true })));
  assert.ok(!(await P('/api/brief52')).body.cards.some((c) => c.id === 'homelab' || c.id === 'bills'));
});

test('brief: Glimts oppsummering, chips og guide tar bare med kortene som er på', async () => {
  await A('/api/brief-cards/reset', 'POST', {});
  const on = await A('/api/brief?kind=morning');
  assert.equal(on.status, 200, on.text);
  assert.ok(Array.isArray(on.body.brief_cards) && on.body.brief_cards.includes('vaer'));
  const L = (await A('/api/brief-cards')).body.cards.map(({ key, on: o }) => ({ key, on: ['vaer', 'kal', 'nyheter'].includes(key) ? false : o }));
  assert.equal((await A('/api/brief-cards', 'PUT', { cards: L })).status, 200);
  const off = await A('/api/brief?kind=morning');
  assert.equal(off.body.weather, null);
  assert.deepEqual(off.body.events, []);
  assert.deepEqual(off.body.news, []);
  assert.ok(!off.body.brief_cards.includes('vaer'));
  assert.ok(!(off.body.guide ?? []).some((g) => ['weather', 'weather2', 'calendar', 'news'].includes(g.k)), JSON.stringify(off.body.guide?.map((g) => g.k)));
  assert.ok(!off.body.chips.some((c) => /°/.test(c)), off.body.chips.join(' | '));
  // Speilet til prompt 38-lista (nordlysvarsel, eldre klienter).
  assert.equal(C38.cardOn(sebId, 'weather'), false);
  assert.equal(C38.cardOn(sebId, 'news'), false);
  // /api/brief52 bygger fortsatt Dagens fokus av hele grunnlaget (raw).
  const f = await A('/api/brief52?only=focus');
  assert.equal(f.body.cards[0]?.id, 'focus');
  await A('/api/brief-cards/reset', 'POST', {});
  assert.equal(C38.cardOn(sebId, 'weather'), true);
});

test('brief-cards: uten lagret liste brukes av/på fra prompt 38-valget; nye korttyper havner nederst, av', () => {
  kv.set(ingridId, 'brief_cards', null);
  kv.del(ingridId, 'brief_cards');
  kv.set(ingridId, 'brief38_cards', [{ id: 'family', on: false }, { id: 'news', on: false }]);
  const L = B73.rawCards73(ingridId);
  assert.equal(L.find((x) => x.key === 'familie').on, false);
  assert.equal(L.find((x) => x.key === 'nyheter').on, false);
  assert.equal(L.find((x) => x.key === 'vaer').on, true);
  kv.set(ingridId, 'brief_cards', [{ key: 'kal', on: true }, { key: 'vaer', on: true }]);
  const M = B73.rawCards73(ingridId);
  assert.deepEqual(M.slice(0, 2).map((x) => x.key), ['kal', 'vaer']);
  assert.ok(M.slice(2).every((x) => x.on === false), 'kort som mangler i lagret liste kommer nederst, av');
  assert.equal(M.length, B73.KEYS73.length);
});

test('brief52: hvert kort har 6 s tidsavbrudd og hentes samtidig (kilde)', () => {
  const s = src('server/srv52.js');
  assert.match(s, /withTimeout\(fn\(\), 6000/);
  assert.match(s, /Promise\.all\(ids\.map/);
  assert.match(s, /'Klarte ikke hente'/);
  assert.match(s, /only/);
});

/* ---------------- Web ---------------- */

test('web: Innstillinger → Glimt og ⚙-arket har INNHOLD I BRIEFEN med piler, bryter, teller og Tilbakestill', () => {
  const b = src('public/js/brief73.js'), g = src('public/js/glimt35.js');
  assert.match(b, /INNHOLD I BRIEFEN/);
  assert.match(b, /av \$\{L\.length\} på/);
  assert.match(b, /Velg hvilke kort som er med og rekkefølgen de vises i\. Gjelder Now Brief på mobil, web og widgets\./);
  assert.match(b, /data-b73-mv/); assert.match(b, /data-b73-tog/); assert.match(b, /Tilbakestill/);
  assert.match(b, /\/brief-cards\/reset/);
  assert.match(g, /settings73Html\(\)/);
  assert.match(g, /settings73Click\(e, redraw\)/);
  assert.doesNotMatch(g, /KORT I BRIEFEN/);
  assert.match(src('public/css/web73-brief.css'), /\.b73-row\.off \.b73-t\{opacity:\.45\}/);
});

test('web: briefen tegnes fra lista med cache per kort, skjelett i full høyde, 6 s og forhåndshenting', () => {
  const b = src('public/js/brief73.js'), p = src('public/js/brief35.js');
  assert.match(b, /TIMEOUT = 6000/);
  assert.match(b, /AbortController/);
  assert.match(b, /\/api\/brief52\?only=/);
  assert.match(b, /localStorage/);
  assert.match(b, /visibilitychange/);
  assert.match(b, /PREFETCH = 5 \* 60_000/);
  assert.match(b, /Oppdatert kl\./);
  assert.match(b, /Klarte ikke hente/);
  assert.match(b, /Prøv igjen/);
  assert.match(b, /min-height:\$\{H73\[key\]/);
  assert.match(src('public/css/web73-brief.css'), /#e6dfd1/);
  assert.match(p, /cards73Html\(/);
  assert.match(p, /onKeys73\(\)/);
  assert.match(p, /prefetch73\(\)/);
  assert.match(p, /brief73_b34/);
  assert.doesNotMatch(p, /brief52Top\(\)|cardOrder38\(/);
  assert.match(src('public/js/usercache.js'), /'brief73_cards', 'brief73_c52', 'brief73_b34'/);
});

/* ---------------- iOS ---------------- */

test('iOS: Brief73.swift – innstillinger (piler, bryter, dra, Tilbakestill) og kort med cache/skjelett', () => {
  const s = src('apps/ios/FinansHub/Sources/Brief73.swift');
  for (const re of [/struct Brief73Settings: View/, /INNHOLD I BRIEFEN/, /LongPressGesture\(minimumDuration: 0\.35\)/, /"Tilbakestill"/, /opacity\(it\.on \? 1 : 0\.45\)/,
    /\/brief-cards/, /struct Brief73Stack: View/, /struct Brief73Skeleton: View/, /0xe6dfd1/, /0xfffdf8/, /Oppdatert kl\. /, /Klarte ikke hente/]) assert.match(s, re);
  // Ingen «/*» inne i blokkommentarer.
  for (const m of s.matchAll(/\/\*([\s\S]*?)\*\//g)) assert.ok(!m[1].includes('/*'), 'nøstet blokkommentar');
  const b52 = src('apps/ios/FinansHub/Sources/Brief52.swift');
  assert.match(b52, /"\/brief52\?only=" \+ enc, timeout: 6\)/);
  assert.match(b52, /func prefetch\(_ store: Store\) async/);
  assert.match(b52, /UserDefaults\.standard/);
  assert.match(src('apps/ios/FinansHub/Sources/Brief35Page.swift'), /Brief73Stack\(b: b, has34: m\.brief != nil, target: target\)/);
  assert.match(src('apps/ios/FinansHub/Sources/Glimt35Settings.swift'), /Brief73Settings\(\)/);
  assert.match(src('apps/ios/FinansHub/Sources/Brief34Model.swift'), /timeout: 6\)/);
  assert.match(src('apps/ios/FinansHub/Sources/Brief34Page.swift'), /Brief52Model\.shared\.prefetch\(store\)/);
});

/* ---------------- Android ---------------- */

test('Android: Brief73Ui.kt/P73Brief.kt – innstillinger, dra-for-å-flytte, parallell henting 6 s og cache', () => {
  const u = src('apps/android/app/src/main/java/no/kristo/finanshub/ui/Brief73Ui.kt');
  const p = src('apps/android/app/src/main/java/no/kristo/finanshub/P73Brief.kt');
  for (const re of [/INNHOLD I BRIEFEN/, /detectDragGesturesAfterLongPress/, /"Tilbakestill"/, /alpha = if \(it\.on\) 1f else \.45f/, /fun Skeleton73/, /Oppdatert kl\. /, /Klarte ikke hente/]) assert.match(u, re);
  for (const re of [/withTimeoutOrNull\(6_000L\)/, /async \{ id to fetchOne73\(id\) \}/, /getSharedPreferences\("brief73"/, /catch \(e: CancellationException\) \{ throw e \}/, /5 \* 60_000L/, /\/brief-cards\/reset/]) assert.match(p, re);
  const b = src('apps/android/app/src/main/java/no/kristo/finanshub/ui/Brief35.kt');
  assert.match(b, /BriefStack73\(vm, b, kind, trials, pos, ring\)/);
  assert.match(b, /Brief73Settings\(vm\)/);
  assert.match(src('apps/android/app/src/main/java/no/kristo/finanshub/ui/Brief34.kt'), /prefetchBrief73\(\)/);
  assert.match(src('apps/android/app/src/main/java/no/kristo/finanshub/P34.kt'), /timeout = 6_000/);
});

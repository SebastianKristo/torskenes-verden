// Q19 på web: web-klienten serveres av samme server, så «eldre server (404)»-reserver mot endepunkter som alltid finnes, er død
// kode. Fjernet: Posisjonskortet (/api/family), Kartet (/api/family og /me/layout kart_v1 ved lagring), Sporing (/check og én og
// én i stedet for /bulk) og Vær (lokale steder i nettleseren og /api/weather/search). Runde 4: «Serveren har ikke … ennå /
// Oppdater serveren»-meldingene og 404-reservene modul for modul (GRUPPER under). Klienten viser feilen serveren sender.
// Testen sjekker at serveren svarer på endepunktene klienten nå bare bruker, og at reservene ikke kommer tilbake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-q19-web-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-q19w';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };

const { default: app } = await import('../server/index.js');
const login = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const A = (path, method = 'GET', body) => app.request(path, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');

test('serveren svarer på endepunktene web-klienten nå bruker uten reserve', async () => {
  for (const [path, method, body] of [
    ['/api/family/positions', 'GET'],
    ['/api/kart', 'GET'],
    ['/api/kart/prefs', 'PUT', { z: 14 }],
    ['/api/tracking/refresh', 'POST', {}],
    ['/api/tracking/bulk', 'POST', { ids: [], action: 'archive' }],
    ['/api/weather/places', 'GET'],
    ['/api/weather/places?q=Oslo', 'GET'],
    ['/api/weather/places/order', 'PUT', { ids: ['oslo', 'bergen', 'trondheim', 'tromso'] }],
  ]) {
    const r = await A(path, method, body);
    assert.notEqual(r.status, 404, `${method} ${path}`);
    assert.notEqual(r.status, 405, `${method} ${path}`);
  }
});

test('reservene for eldre servere er borte fra web-klienten', () => {
  assert.doesNotMatch(src('poscard.js'), /api\('\/family'\)/);
  assert.doesNotMatch(src('kart.js'), /api\('\/family'\)|layoutOk/);
  assert.doesNotMatch(src('tracking.js'), /'\/check'|status !== 404/);
  const wx = src('weather-page.js');
  assert.doesNotMatch(wx, /\/weather\/search|wx_places_local|placesOk/);
});

// Runde 4: én rad per gruppe av filer. endepunkter: [sti, metode?, kropp?] som må svare (ikke 404/405) med eksempeldata.
// forbudt: mønstre som ikke skal finnes i fila lenger (404-grener, «Oppdater serveren», gamle stier).
const OPPDATER = /Oppdater (?:serveren|Homelab|Nordlys)|Serveren (?:har|støtter|kan|lagrer|tar|lar) ikke[^'`]*ennå|eldre server/i;
const GRUPPER = {
  'Glimt og AI-kontroll': {
    endepunkter: [
      ['/api/glimt/settings'], ['/api/glimt/settings', 'PUT', { notify: true }], ['/api/admin/glimt-char52'], ['/api/ai/keys'],
      ['/api/glimt/quality/settings'], ['/api/glimt/quality/weekly'], ['/api/glimt/entities'], ['/api/glimt/recipes'], ['/api/glimt/recipes/settings'],
      ['/api/glimt/schedules'], ['/api/glimt/schedules/settings'], ['/api/glimt/agent/understand'], ['/api/glimt/agent/fast'],
      ['/api/glimt/memory'], ['/api/glimt/memory/pending'], ['/api/glimt/memory/conflicts'], ['/api/glimt/memory/stale'], ['/api/glimt/memory/hygiene'],
      ['/api/ai/status'], ['/api/ai/models'], ['/api/ai/library?q='], ['/api/ai/routing'], ['/api/ai/jobs?limit=60'], ['/api/ai/usage?days=30'],
      ['/api/ai/tokens'], ['/api/ai/backend'], ['/api/ai/jobs/retry', 'POST', { ids: [] }], ['/api/ai/models/default', 'PUT', { model: 'qwen3:8b' }],
      ['/api/glimt/agent/settings'], ['/api/chat/settings'], ['/api/chat/models'], ['/api/voices57'],
    ],
    filer: {
      'glimt-settings.js': [/404/, /legacy/, /\/brief\/settings/, OPPDATER],
      'glimt-kvalitet.js': [/404, 405/, /missing/, OPPDATER], 'glimt-entiteter.js': [/missing/, OPPDATER], 'glimt-oppskrifter.js': [/\.missing = /, OPPDATER],
      'glimt-faste-oppgaver.js': [/missing/, OPPDATER], 'glimt-minne.js': [/missing/, OPPDATER], 'glimt-forstaar.js': [/missing/, /404/, OPPDATER],
      'glimt-raskere-svar.js': [/missing/, /404/], 'glimt-memory.js': [/404/, OPPDATER], 'ai-glimt.js': [OPPDATER],
      'ai-control.js': [/404/, /G\.missing/, /G\.legacy/, /missingNote/, OPPDATER], 'chat.js': [/C\.missing/, /Serveren mangler/], 'stemmer.js': [/404/, /unsupported/, OPPDATER],
    },
  },
};

for (const [navn, g] of Object.entries(GRUPPER)) {
  test(`${navn}: serveren har endepunktene`, async () => {
    for (const [path, method = 'GET', body] of g.endepunkter) {
      const r = await A(path, method, body);
      assert.notEqual(r.status, 404, `${method} ${path}`);
      assert.notEqual(r.status, 405, `${method} ${path}`);
    }
  });
  test(`${navn}: ingen reserve for eldre server i klienten`, () => {
    for (const [f, forbudt] of Object.entries(g.filer)) for (const re of forbudt) assert.doesNotMatch(src(f), re, `${f}: ${re}`);
  });
}

// Temaet ved første besøk (B-B4): serveren skriver brukerens stil og modus på <html>, og hl-boot.js bruker dem før localStorage,
// så siden ikke starter i Glass og bytter til Papir når /api/me/layout svarer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-tema-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-tema';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');

const login = async () => {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
};
const cookie = await login();
const get = async (p, init = {}) => app.request(p, { ...init, headers: { cookie, ...(init.headers ?? {}) } });

test('app.html får brukerens stil og modus på <html>', async () => {
  await get('/api/me/layout', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hlTheme: '2c', web_theme: 'dark' }) });
  let html = await (await get('/')).text();
  assert.match(html, /<html lang="nb" data-hl-user="2c" data-web-mode-user="dark">/);
  await get('/api/me/layout', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hlTheme: 'cur', web_theme: 'system' }) });
  html = await (await get('/')).text();
  assert.match(html, /<html lang="nb" data-hl-user="cur" data-web-mode-user="system">/);
});

/** Kjører hl-boot.js med en liten falsk DOM. → attributtene på <html> */
function boot(attrs, stored) {
  const set = { ...attrs }, ls = { ...stored };
  const de = { getAttribute: (k) => set[k] ?? null, setAttribute: (k, v) => { set[k] = String(v); }, hasAttribute: (k) => k in set, classList: { contains: () => false } };
  const ctx = {
    document: { documentElement: de, querySelector: () => null, createElement: () => ({ setAttribute() {} }), head: { appendChild() {} } },
    localStorage: { getItem: (k) => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); } },
    sessionStorage: { getItem: () => null }, location: { search: '', pathname: '/', hash: '' }, history: { replaceState() {} },
    matchMedia: () => ({ matches: false }), URLSearchParams, window: {},
  };
  vm.runInNewContext(readFileSync(new URL('../public/js/hl-boot.js', import.meta.url), 'utf8'), ctx);
  return { set, ls };
}

test('hl-boot.js: serverens valg vinner over localStorage og lagres', () => {
  const r = boot({ 'data-hl-user': '2c', 'data-web-mode-user': 'dark' }, { hl_theme: 'cur', papir_web_mode: 'light' });
  assert.equal(r.set['data-hl'], '2c');
  assert.equal(r.set['data-mode'], 'dark');
  assert.equal(r.ls.hl_theme, '2c');
  assert.equal(r.ls.papir_web_mode, 'dark');
});

test('hl-boot.js: uten serververdi gjelder localStorage som før', () => {
  const r = boot({}, { hl_theme: '2c', papir_web_mode: 'light' });
  assert.equal(r.set['data-hl'], '2c');
  assert.equal(r.set['data-mode'], 'light');
  assert.equal(boot({}, {}).set['data-hl'], 'cur');
});

// Prompt 36b: hovedkalender og flere Google-kalendere i Kalender (GET/PUT /api/kalender/calendars/google).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p36g-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-36g';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
process.env.OCR_FALLBACK = '0';
process.env.MOCK_DATA = '1';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');

const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
const cookie = r0.headers.get('set-cookie').split(';')[0];
const A = async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: j, text: t, headers: r.headers };
};
const alive = setInterval(() => {}, 1000);
test.after(() => clearInterval(alive));

test('Google: velg hovedkalender og vis flere Google-kalendere som egne kalendere', async () => {
  let r = await A('/api/kalender/calendars/google');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.connected, false);
  assert.equal((await A('/api/kalender/calendars/google', 'PUT', { main: 'primary' })).status, 409);

  await A('/api/kalender/calendars'); // prompt 39: oppryddingen (12 → 4) skjer første gang; Google-kalendere som vises etterpå, er egne
  // Koble til (mock-Google).
  r = await A('/api/birthdays/google/start', 'POST', { return: '/innstillinger' });
  assert.equal(r.status, 200, r.text);
  r = await A(r.body.url);
  assert.equal(r.status, 302);
  let loc = r.headers.get('location');
  if (!loc.startsWith('/api/birthdays/google/callback')) loc = new URL(loc, 'http://x').pathname + new URL(loc, 'http://x').search;
  r = await A(loc);
  assert.equal(r.status, 302, r.text);

  r = await A('/api/kalender/calendars/google');
  assert.equal(r.body.connected, true, r.text);
  assert.ok(r.body.calendars.length >= 2);
  assert.equal(r.body.main.id, 'primary', 'hovedkontoens kalender er standard');
  const other = r.body.calendars.find((x) => !x.primary);

  r = await A('/api/kalender/calendars/google', 'PUT', { main: 'finnes-ikke' });
  assert.equal(r.status, 400);
  r = await A('/api/kalender/calendars/google', 'PUT', { main: 'primary', show: [other.googleId, 'primary'] });
  assert.equal(r.status, 200, r.text);
  const shown = r.body.calendars.find((x) => x.googleId === other.googleId);
  assert.equal(shown.shown, true);
  assert.match(shown.appId, /^g-[0-9a-f]{10}$/);
  assert.equal(r.body.calendars.find((x) => x.primary).shown, false, 'hovedkalenderen vises ikke dobbelt');

  r = await A('/api/kalender/calendars');
  const cal = r.body.calendars.find((x) => x.id === shown.appId);
  assert.ok(cal, 'Google-kalenderen står i kalenderlista');
  assert.equal(cal.source, 'google');
  assert.equal(cal.badge, 'GOOGLE'); // prompt 39

  r = await A(`/api/kalender/calendars/${shown.appId}`, 'PATCH', { color: '#2f7a4f', hidMenu: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.calendar.color, '#2f7a4f');
  assert.equal(r.body.calendar.hidMenu, true);

  // Bytt hovedkalender til den andre: den forsvinner fra «vis også».
  r = await A('/api/kalender/calendars/google', 'PUT', { main: other.googleId });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.main.name, other.name);
  assert.equal(r.body.calendars.find((x) => x.googleId === other.googleId).shown, false);

  r = await A('/api/kalender/calendars/google', 'PUT', { main: 'primary', show: [other.googleId] });
  const id = r.body.calendars.find((x) => x.googleId === other.googleId).appId;
  assert.equal((await A(`/api/kalender/calendars/${id}`, 'DELETE')).status, 200);
  r = await A('/api/kalender/calendars/google');
  assert.equal(r.body.calendars.find((x) => x.googleId === other.googleId).shown, false);
  assert.equal((await A('/api/kalender?from=2026-10-01&to=2026-10-31')).status, 200);
});

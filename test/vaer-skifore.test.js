// L12: skiføret i Nordmarka hentes fra serveren (GET /api/weather/ski), ikke direkte fra Open-Meteo i appene.
// Serveren henter alltid fra én fast, offentlig adresse (koordinatene står i koden, ingenting fra klienten), krever innlogging
// og sender ingen nøkler. Android Vær bruker endepunktet (kildesjekken nederst).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-ski-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const { layoutApi } = await import('../server/vaer/layout.js');
const wx = await import('../server/vaer/week-glimt.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const get = async (path, headers = { authorization: `Bearer ${token}` }) => {
  const r = await layoutApi.request(path, { headers });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const OM = { current: { temperature_2m: -4.4, relative_humidity_2m: 81.6, snow_depth: 0.42 }, daily: { snowfall_sum: [2, 3, 1.4, 0.5], temperature_2m_max: [1.2, -2, -2, -3] } };

test('L12: GET /ski krever innlogging', async () => {
  assert.equal((await get('/ski', {})).status, 401);
});

test('L12: GET /ski gir skiføret i Nordmarka fra serverens Open-Meteo-kall (fast adresse, ingen nøkkel, ingen klientdata)', async () => {
  const urls = [];
  wx._setWeather41Fetch(async (url, opts) => { urls.push({ url: String(url), opts }); return new Response(JSON.stringify(OM), { status: 200 }); });
  try {
    const r = await get('/ski?lat=1&lon=2&url=http://10.0.0.1/');
    assert.equal(r.status, 200);
    const b = r.body;
    assert.deepEqual(b.place, { name: 'Nordmarka', lat: 59.99, lon: 10.67, url: 'https://skisporet.no/' });
    assert.equal(b.snowCm, 42);
    assert.equal(b.newCm, 6, 'snøfall de tre siste dagene (2 + 3 + 1,4)');
    assert.equal(b.tempC, -4);
    assert.equal(b.humidity, 82);
    assert.equal(b.thaw, true, 'en dag over +0,5° de siste dagene');
    assert.equal(b.has, true, 'skiføre fra 15 cm snø');
    assert.equal(b.source, 'Open-Meteo');
    assert.equal(urls.length, 1);
    const u = new URL(urls[0].url);
    assert.equal(u.origin, 'https://api.open-meteo.com', 'bare den faste offentlige adressen');
    assert.equal(u.searchParams.get('latitude'), '59.99', 'klienten styrer ikke koordinatene');
    assert.equal(u.searchParams.get('longitude'), '10.67');
    assert.doesNotMatch(JSON.stringify(urls[0].opts?.headers ?? {}), /authorization|api[-_]?key/i);
    assert.doesNotMatch(JSON.stringify(b), /key|token/i, 'ingen nøkler til klienten');
  } finally { wx._setWeather41Fetch(null); }
});

test('L12: GET /ski uten snø gir has:false, og Open-Meteo-feil gir 502 med norsk feiltekst', async () => {
  wx._setWeather41Fetch(async () => new Response(JSON.stringify({ current: { temperature_2m: 6, relative_humidity_2m: 70, snow_depth: 0 }, daily: { snowfall_sum: [0, 0, 0, 0], temperature_2m_max: [8, 9, 9, 7] } }), { status: 200 }));
  try {
    const r = await get('/ski');
    assert.equal(r.status, 200);
    assert.equal(r.body.has, false);
    assert.equal(r.body.snowCm, 0);
  } finally { wx._setWeather41Fetch(null); }
  wx._setWeather41Fetch(async () => new Response('nede', { status: 503 }));
  try {
    const r = await get('/ski');
    assert.equal(r.status, 502);
    assert.match(r.body.error, /Skiføret/);
  } finally { wx._setWeather41Fetch(null); }
});

test('L12: Android Vær henter skiføret fra /weather/ski, ikke direkte fra Open-Meteo', () => {
  const vaer = readFileSync(join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub/domene/Vaer.kt'), 'utf8');
  assert.doesNotMatch(vaer, /api\.open-meteo\.com/);
  assert.match(vaer, /hlGet\("\/weather\/ski"/);
});

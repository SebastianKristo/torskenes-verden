// Lager eksempelsvar for kontrakten (shared/schemas/eksempler/*.json) fra serveren med eksempeldata (MOCK_DATA=1), samme oppsett
// som test/kontrakt-schemas.test.js. Appene dekoder eksemplene i sine egne tester (iOS: HomelabTests/ContractDecodingTests), så
// DTO-ene følger det serveren faktisk sender. test/kontrakt-eksempler.test.js sjekker at hvert eksempel følger skjemaet sitt.
//
//   node scripts/kontrakt-eksempler.mjs           (skriver fila for hvert endepunkt i shared/schemas/endpoints.json + /api/dates/parse)
//
// Tokenet i innloggingssvaret byttes ut med en fast tekst (ingen hemmeligheter i repoet).
import '../test/lib/day-clock.mjs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS = join(ROOT, 'shared', 'schemas');
const OUT = join(SCHEMAS, 'eksempler');

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-kontrakt-eksempler-'));
process.env.SESSION_SECRET = 'eksempel-secret-eksempel-secret-eksempel';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('eksempelpassord1');
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };

const { default: app } = await import('../server/index.js');
const INDEX = JSON.parse(readFileSync(join(SCHEMAS, 'endpoints.json'), 'utf8'));
const CREDS = { username: 'sebastian', password: 'eksempelpassord1' };

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'x-forwarded-for': '203.0.113.7' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: JSON.parse(await r.text()) };
}

const login = await req('/finans/api/login', { method: 'POST', body: { ...CREDS, deviceName: 'Kontrakteksempel' } });
const token = login.body.token;
mkdirSync(OUT, { recursive: true });

// Lange lister kortes ned til 4 elementer, så eksemplene er små nok til å lese (formen er den samme).
const trim = (v) => (Array.isArray(v) ? v.slice(0, 4).map(trim) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)])) : v);
const write = (schema, body) => {
  const name = basename(schema).replace('.schema.json', '.json');
  writeFileSync(join(OUT, name), `${JSON.stringify(trim(body), null, 2)}\n`);
  console.log(`${name}`);
};

for (const e of INDEX.endpoints) {
  const r = e.path === '/finans/api/login'
    ? await req(e.path, { method: 'POST', body: { ...CREDS, deviceName: 'Kontrakteksempel 2' } })
    : await req(e.path, { method: e.method, token: e.auth === 'none' ? undefined : token });
  if (r.status !== 200) throw new Error(`${e.path}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  if (r.body && typeof r.body.token === 'string') r.body.token = 'fh_EKSEMPEL-ikke-et-ekte-token';
  write(e.schema, r.body);
}
// POST /api/dates/parse er ikke en GET i endpoints.json; eksempelet har fast «nå», så datoen er stabil.
const parse = await req('/api/dates/parse', { method: 'POST', token, body: { text: 'frisør fredag 14.30', now: '2026-11-16T09:00:00+01:00' } });
if (parse.status !== 200) throw new Error(`/api/dates/parse: ${parse.status}`);
write('api/dates-parse.schema.json', parse.body);
// Feilformen (common/error.schema.json): utløpt/ugyldig token.
const err = await req('/api/me', { token: 'fh_pat_ugyldigugyldigugyldigugyldig' });
writeFileSync(join(OUT, 'error.json'), `${JSON.stringify(err.body, null, 2)}\n`);
console.log('error.json');
process.exit(0);

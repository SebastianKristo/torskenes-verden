// Låser svarene til de siste Glimt-, AI- og fellesrutene (status per rolle og feltene i svaret) før serverfilene samles i
// server/glimt/, server/ai/, server/live/, server/widgets/, server/familie/ og server/dates/ (Fase 2b). Omstruktureringen skal
// ikke endre stier, statuskoder eller felt.
// Rollene: A = admin (eier), I = vanlig bruker (økt), TI = samme bruker med app-token (mobil), N = ikke innlogget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-glimt-rest-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-gr';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const tok = (await req('/finans/api/login', { method: 'POST', body: { username: 'ingrid', password: 'ingridPassord123', device: 'iPhone' } })).json?.token;
assert.ok(tok);
const TI = as({ authorization: `Bearer ${tok}` });
const N = as({});

const keysOf = (j) => j == null ? '' : Array.isArray(j) ? '[]' : typeof j === 'object' ? Object.keys(j).sort().join(' ') : '';

// [sti, status for A I TI N, feltene i adminens 200-svar ("" = ikke sjekket), ev. feltene for vanlig bruker]
const GETS = [
  ['/api/ai/recommend?full=1', '200 200 200 401', 'byModel cachedAt engine items machine missing missingGb plan title'],
  ['/api/admin/dal53/health', '200 403 403 401', 'asr cache_bytes cache_dir credit flags models native_ok platform'],
  ['/api/voice53/backends', '200 200 200 401', 'backends detect norwegian norwegian_engine'],
  ['/api/glimt/recipes', '200 200 200 401', 'counts enabled items settings'],
  ['/api/glimt/recipes/settings', '200 200 200 401', 'admin help labels server settings thresholds user'],
  ['/api/glimt/recipes/stats', '200 200 200 401', 'corrections fastShare learnedCases negatives recipes runs since'],
  ['/api/glimt/recipes/999999', '404 404 404 401', ''],
  ['/api/glimt/schedules', '200 200 200 401', 'builtin counts enabled items settings'],
  ['/api/glimt/schedules/settings', '200 200 200 401', 'admin help labels server settings user zone zones'],
  ['/api/glimt/schedules/999999', '404 404 404 401', ''],
  ['/api/glimt/schedules/999999/runs', '404 404 404 401', ''],
  ['/api/live/aktiviteter', '200 200 200 401', 'aktiviteter oppdatert'],
  ['/api/live/innstillinger', '200 200 200 401', 'avtale backup nedlasting pakke spiller'],
  ['/api/widgets/media', '200 200 200 401', 'active activeText allPaused altSpeed bigText configured downloads hide refreshSec speed speedText tab upText upcoming updatedAt', 'configured downloads hide restricted upcoming'],
  ['/api/widgets/catalog', '200 200 200 401', 'addMode count filters groups intro platform steps style'],
  ['/api/widgets/catalog?platform=android', '200 200 200 401', 'addMode count filters groups intro platform steps style'],
  ['/api/widgets/catalog?platform=x', '400 400 400 401', ''],
  ['/api/profiles', '200 200 200 401', 'adminLinked locked me profiles'],
  ['/api/profiles/me', '200 200 200 401', 'consents profile'],
  ['/api/profiles/settings', '200 200 200 401', 'adminOnlyLink'],
  ['/api/brief-cards', '200 200 200 401', 'cards count defaults on total'],
  ['/api/brief52', '200 200 200 401', 'cards date date_label fetched_at glimt_char greeting hidden kind order user'],
];

test('glimt-rest-ruter: status per rolle og felt i svaret er uendret', async () => {
  for (const [path, statuses, keys, userKeys] of GETS) {
    const want = statuses.split(' ').map(Number);
    for (const [i, [w, f]] of Object.entries(Object.entries({ A, I, TI, N }))) {
      const r = await f(path);
      assert.equal(r.status, want[i], `${w} GET ${path}: ${r.text.slice(0, 160)}`);
      if (r.status === 200 && keys) assert.equal(keysOf(r.json), w === 'A' || userKeys === undefined ? keys : userKeys, `${w} GET ${path}`);
    }
  }
});

test('glimt-rest-ruter: Innhold i briefen (PUT/reset) styrer GET /api/brief, per bruker', async () => {
  assert.equal((await I('/api/brief-cards', 'PUT', { cards: [{ key: 'ukjent', on: true }] })).status, 400);
  assert.equal((await N('/api/brief-cards', 'PUT', { cards: [] })).status, 401);
  const off = await I('/api/brief-cards', 'PUT', { cards: [{ key: 'vaer', on: false }, { key: 'nyheter', on: false }] });
  assert.equal(off.status, 200, off.text);
  assert.equal(off.json.cards.find((x) => x.key === 'vaer').on, false);
  const b = await I('/api/brief');
  assert.equal(b.status, 200);
  assert.ok(Array.isArray(b.json.brief_cards) && !b.json.brief_cards.includes('vaer'));
  assert.equal(b.json.weather, null);
  // det gamle kortvalget (Innstillinger → Glimt → Brief) speiles
  assert.equal((await I('/api/glimt/settings')).json.cards.find((x) => x.id === 'weather').on, false);
  // admin har fortsatt været på
  assert.equal((await A('/api/brief-cards')).json.cards.find((x) => x.key === 'vaer').on, true);
  const reset = await I('/api/brief-cards/reset', 'POST', {});
  assert.equal(reset.status, 200);
  assert.equal(reset.json.cards.find((x) => x.key === 'vaer').on, true);
});

test('glimt-rest-ruter: skrivende ruter krever innlogging, og admin-oppsettet bare admin', async () => {
  assert.equal((await I('/api/profiles/settings', 'PUT', { adminOnlyLink: true })).status, 403);
  assert.equal((await TI('/api/profiles/settings', 'PUT', { adminOnlyLink: true })).status, 403);
  assert.equal((await N('/api/profiles/settings', 'PUT', { adminOnlyLink: true })).status, 401);
  assert.equal((await I('/api/users/x/profile', 'PUT', { profileId: null })).status, 403);
  assert.equal((await I('/api/admin/dal53/preload', 'POST', {})).status, 403);
  assert.equal((await I('/api/ai/recommend/apply', 'POST', {})).status, 403);
  assert.equal((await N('/api/emo53/suggest', 'POST', { text: 'hei' })).status, 401);
  const emo = await I('/api/emo53/suggest', 'POST', { text: 'Gratulerer med dagen' });
  assert.equal(emo.status, 200, emo.text);
  assert.equal((await N('/api/glimt/schedules/parse', 'POST', { when: 'hver dag kl 7' })).status, 401);
  assert.equal((await I('/api/glimt/schedules/parse', 'POST', {})).status, 400);
  const p = await I('/api/glimt/schedules/parse', 'POST', { when: 'hver dag kl 7', what: 'vær' });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.json.ok, true);
  assert.equal((await N('/api/glimt/recipes/feedback', 'POST', {})).status, 401);
  const live = await I('/api/live/innstillinger', 'PUT', { nedlasting: false });
  assert.equal(live.status, 200);
  assert.equal(live.json.nedlasting, false);
  assert.equal((await A('/api/live/innstillinger')).json.nedlasting, true);
  assert.equal((await I('/api/live/tokens', 'POST', { platform: 'x' })).status, 400);
  assert.equal((await N('/api/live/tokens', 'POST', {})).status, 401);
});

// B-B10: Oslo-bakgrunnene (bilde etter tid på døgnet) hentes fra serverens bildebuffer, ikke direkte fra commons.wikimedia.org
// i nettleseren. Serveren har dem ferdig nedlastet (server/backgrounds/files) eller laster dem ned én gang og cacher dem.
//   GET /api/background/file/:name?w= → bildet (bare filene i katalogen), 404 for alt annet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-bgbuffer-'));
const FILES = mkdtempSync(join(tmpdir(), 'hl-bgbuffer-files-'));
process.env.BG_FILES_DIR = FILES;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-bgbuf';
process.env.MOCK_DATA = '1';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const BG = await import('../server/background.js');
const CAT = await import('../server/backgrounds/catalog.js');
const bg = BG.default;

const { token } = await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) })).json();
const H = { authorization: `Bearer ${token}` };
const WEBP = (n) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(n, 1)]);
const JPEG = () => new Response(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]), { headers: { 'content-type': 'image/jpeg' } });
const get = (name, w = 1280) => bg.request(`/file/${encodeURIComponent(name)}?w=${w}`, { headers: H });

/** OSLO-listene i en klientfil (nøkkel: ['fil', …]). */
function clientFiles(path, name) {
  const src = readFileSync(new URL(path, import.meta.url), 'utf8');
  const block = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(src)?.[1] ?? '';
  return { src, files: [...block.matchAll(/'([^']+\.(?:jpe?g|JPE?G|png))'/g)].map((m) => m[1]) };
}

test('nettleseren henter ikke bakgrunnsbilder fra Wikimedia, og alle Oslo-filene finnes i serverens katalog', () => {
  for (const [path, name] of [['../public/js/bgsvc.js', 'OSLO41'], ['../public/finans/js/mobile-p41.js', 'OSLO']]) {
    const { src, files } = clientFiles(path, name);
    assert.ok(files.length >= 12, `${path}: ${files.length}`);
    assert.doesNotMatch(src, /Special:FilePath/, `${path} henter fra Commons`);
    assert.match(src, /\/api\/background\/file\//, path);
    for (const f of files) assert.ok(CAT.CATALOG.oslo_dognet.includes(f), `${f} mangler i CATALOG.oslo_dognet`);
  }
});

test('ferdig nedlastet fil serveres fra bufferen; ukjente navn gir 404', async () => {
  const f = CAT.CATALOG.oslo_dognet[0];
  mkdirSync(join(FILES, 'oslo_dognet'), { recursive: true });
  writeFileSync(CAT.bundledPath(FILES, 'oslo_dognet', f, 1080), WEBP(100));
  const r = await get(f);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/webp');
  assert.match(r.headers.get('cache-control') ?? '', /max-age=\d+/);
  for (const bad of ['finnes-ikke.jpg', '../../homelab.db', 'Oslo_S_aerial.jpg/../x']) assert.equal((await get(bad)).status, 404, bad);
  assert.equal((await bg.request(`/file/${encodeURIComponent(f)}`)).status, 401, 'krever innlogging som resten av /api/background');
});

test('mangler fila: 404 med en gang, serveren laster den ned i bakgrunnen og cacher den (ikke nettleseren)', async () => {
  delete process.env.MOCK_DATA;
  const orig = globalThis.fetch, calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url); calls.push(u);
    if (u.includes('Special:FilePath/')) return JPEG();
    return new Response('{}', { status: 200 });
  };
  try {
    BG._clearWiki();
    const f = CAT.CATALOG.oslo_dognet.find((x) => x !== CAT.CATALOG.oslo_dognet[0]);
    const first = await get(f, 2000);
    assert.equal(first.status, 404);
    assert.equal((await first.json()).code, 'NOT_CACHED');
    await BG._wikiSettled(f);
    const r = await get(f, 2000);
    assert.equal(r.status, 200);
    assert.ok(calls.some((u) => u.includes(`Special:FilePath/${encodeURIComponent(f)}`)), calls.join('\n'));
    const n = calls.length;
    assert.equal((await get(f, 2000)).status, 200);
    assert.equal(calls.length, n, 'andre gang fra cachen');
  } finally { globalThis.fetch = orig; process.env.MOCK_DATA = '1'; }
});

test('uten nett og uten buffer: 404, så klienten går videre til neste bilde', async () => {
  const f = CAT.CATALOG.oslo_dognet.at(-1);
  assert.equal((await get(f)).status, 404);
});

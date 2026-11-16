// Testene skal ikke etterlate noe i TMPDIR. Før test/lib/midlertidig.mjs ble hver `npm test` liggende igjen med flere
// hundre MB i /tmp (hl-updsh-*, hl-upd46-*, fh-bk-* …), til disken var full og updater-testene feilet på low_disk.
// Her kjøres hjelperen og et utvalg av testfilene som lekket mest, med en egen tom TMPDIR som skal være tom etterpå.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HJELPER = join(ROOT, 'test', 'lib', 'midlertidig.mjs');
const NO_NET = join(ROOT, 'test', 'lib', 'no-net.mjs');

/** Ny tom mappe som skal brukes som TMPDIR for en underprosess. Slettes etter testen. */
function tomTmp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hl-tmpsjekk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
// NODE_TEST_CONTEXT fjernes, ellers tror den indre testløperen at den er en underprosess av denne og skriver binært.
const env = (tmp) => {
  const e = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp, HL_TEST_BEHOLD_TMP: '', NODE_OPTIONS: '' };
  delete e.NODE_TEST_CONTEXT;
  return e;
};

test('npm test og test:e2e laster midlertidig.mjs', () => {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(scripts.test, /--import \.\/test\/lib\/midlertidig\.mjs/);
  assert.match(scripts['test:e2e'], /--import \.\/test\/lib\/midlertidig\.mjs/);
});

test('alt en prosess legger i tmpdir(), slettes når den avslutter – også det en drept underprosess etterlater', (t) => {
  const tmp = tomTmp(t);
  const skript = join(tmp, '..', `${tmp.split('/').pop()}-skript.mjs`);
  t.after(() => rmSync(skript, { force: true }));
  writeFileSync(skript, `
    import { lagMidlertidig } from ${JSON.stringify(HJELPER)};
    import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { spawn } from 'node:child_process';
    const fri = mkdtempSync(join(tmpdir(), 'uten-opprydding-'));
    writeFileSync(join(fri, 'data.db'), 'x');
    writeFileSync(join(lagMidlertidig('med-hjelper-'), 'f'), 'x');
    // En «server» som skriver i tmpdir() og blir drept før den rekker å rydde.
    const barn = spawn(process.execPath, ['-e', "require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'server.db'), 'x'); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
    const fil = join(tmpdir(), 'server.db');
    const t0 = Date.now();
    while (!existsSync(fil) && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 20));
    barn.kill('SIGKILL');
    await new Promise((r) => barn.once('exit', r));
    console.log(JSON.stringify({ tmp: tmpdir(), server: existsSync(fil) }));
  `);
  const r = spawnSync(process.execPath, [skript], { cwd: ROOT, env: env(tmp), encoding: 'utf8', timeout: 30_000 });
  assert.equal(r.status, 0, r.stderr);
  const ut = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.ok(ut.tmp.startsWith(`${tmp}/hl-test-`), `tmpdir() peker inn i prosessens egen mappe: ${ut.tmp}`);
  assert.equal(ut.server, true, 'underprosessen skrev i samme mappe');
  assert.deepEqual(readdirSync(tmp), [], 'TMPDIR er tom etterpå');
});

test('HL_TEST_BEHOLD_TMP=1 lar mappene bli liggende for feilsøking', (t) => {
  const tmp = tomTmp(t);
  const r = spawnSync(process.execPath, ['--import', HJELPER, '-e', "require('fs').mkdtempSync(require('os').tmpdir() + '/x-')"], { cwd: ROOT, env: { ...env(tmp), HL_TEST_BEHOLD_TMP: '1' }, encoding: 'utf8', timeout: 30_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readdirSync(tmp).length, 1);
});

// Filene som la igjen mest (hl-updsh-*, fh-bk-*, p73img-*, fh-tx-*, fh-nav-*). Kjøres slik `npm test` gjør. Uten
// midlertidig.mjs etterlot disse filene 17 mapper per kjøring. De trege updater-testene (tidsavbrudd, docker-proxy) er utelatt.
const UTVALG = [
  'updater-sh.test.js',
  'finans-backup.test.js',
  'logo-endre.test.js',
  'finans-tx.test.js',
  'finans-nav.test.js',
];

test('et utvalg testfiler etterlater ingenting i TMPDIR', { timeout: 240_000 }, (t) => {
  const tmp = tomTmp(t);
  const filer = UTVALG.map((f) => join('test', f));
  const r = spawnSync(process.execPath, ['--import', NO_NET, '--import', HJELPER, '--test', '--test-reporter=tap', ...filer], { cwd: ROOT, env: env(tmp), encoding: 'utf8', timeout: 230_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `testene feilet:\n${(r.stdout + r.stderr).slice(-4000)}`);
  assert.match(r.stdout, /# fail 0/);
  assert.deepEqual(readdirSync(tmp), [], 'TMPDIR er tom etter kjøringen');
});

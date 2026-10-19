// deploy/updater/updater.sh kjøres én runde (ONCE=1) med falske docker og curl på PATH og en tmp-mappe som HOST_DIR.
// Sjekker at .env, data/ og proton/ ikke røres, at repo/branch kommer fra miljøet og ikke fra request.json, og at status
// blir done / failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const SCRIPT = resolve('deploy/updater/updater.sh');
const has = (cmd) => spawnSync('bash', ['-c', `command -v ${cmd}`]).status === 0;
const skip = !(has('bash') && has('jq') && has('tar')) && 'trenger bash, jq og tar';
const SHA = 'c0ffee'.padEnd(40, '0');

function setup({ tunnel = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hl-updsh-'));
  const host = join(root, 'opt', 'homelab-os'), bin = join(root, 'bin'), src = join(root, 'src', `torskenes-verden-${SHA}`);
  for (const d of [host, bin, src, join(host, 'data', 'update'), join(host, 'proton'), join(host, 'server'),
    join(src, 'server', 'data'), join(src, 'data'), join(src, 'proton')]) mkdirSync(d, { recursive: true });
  // Eksisterende installasjon.
  writeFileSync(join(host, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(host, '.env'), `SESSION_SECRET=hemmelig\n${tunnel ? 'CLOUDFLARE_TUNNEL_TOKEN=abc\n' : ''}`);
  writeFileSync(join(host, 'data', 'homelab.db'), 'ekte database');
  writeFileSync(join(host, 'proton', 'key'), 'proton-nøkkel');
  writeFileSync(join(host, 'server', 'index.js'), '// gammel');
  writeFileSync(join(host, 'lokal-fil.txt'), 'slettes ikke (ingen --delete)');
  // Ny versjon i arkivet, med ondsinnede .env/data/proton som aldri skal komme inn.
  writeFileSync(join(src, 'docker-compose.yml'), 'services: {} # ny\n');
  writeFileSync(join(src, 'server', 'index.js'), '// ny');
  writeFileSync(join(src, 'server', 'data', 'kode.js'), '// server/data er kode og skal kopieres');
  writeFileSync(join(src, 'CHANGELOG.md'), '# Endringslogg\n\n## [9.9.9] – 20.10.2026 · test\n- ny\n\n## [9.9.8] – 19.10.2026\n');
  writeFileSync(join(src, '.env'), 'SESSION_SECRET=ondsinnet\n');
  writeFileSync(join(src, 'data', 'homelab.db'), 'ondsinnet');
  writeFileSync(join(src, 'proton', 'key'), 'ondsinnet');
  const tgz = join(root, 'src.tgz');
  execFileSync('tar', ['-czf', tgz, '-C', join(root, 'src'), `torskenes-verden-${SHA}`]);

  const calls = join(root, 'calls.log');
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -H|--max-time) shift 2;; http*) url="$1"; shift;; *) shift;; esac; done
echo "curl $url" >> "${calls}"
case "$url" in
  https://api.github.com/*) echo '{"sha":"${SHA}"}';;
  https://codeload.github.com/*) cp "${tgz}" "$out";;
  *healthz) exit "\${FAKE_HEALTH_RC:-0}";;
  *) exit 22;;
esac
`);
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
echo "docker $*" >> "${calls}"
case "$*" in
  *project.working_dir*) echo "\${FAKE_WORKDIR:-}";;
  *com.docker.compose.project*) echo homelab-os;;
  inspect*Config.Image*) echo homelab-updater:local;;
  *" build os"*) echo "bygger os"; exit "\${FAKE_BUILD_RC:-0}";;
esac
exit 0
`);
  chmodSync(join(bin, 'curl'), 0o755); chmodSync(join(bin, 'docker'), 0o755);
  return { root, host, bin, calls };
}

function run(t, request, env = {}) {
  if (request) writeFileSync(join(t.host, 'data', 'update', 'request.json'), JSON.stringify(request));
  const r = spawnSync('bash', [SCRIPT], {
    env: { PATH: `${t.bin}:${process.env.PATH}`, HOME: t.root, HOSTNAME: 'abc123', HOST_DIR: t.host, ONCE: '1', LOCK_DIR: t.root,
      HEALTH_TIMEOUT: '2', HEALTH_SLEEP: '1', TMPDIR: t.root, FAKE_WORKDIR: t.host, ...env },
    encoding: 'utf8', timeout: 30_000,
  });
  const read = (f) => { try { return JSON.parse(readFileSync(join(t.host, 'data', 'update', f), 'utf8')); } catch { return null; } };
  return { ...r, code: r.status, status: read('status.json'), installed: read('installed.json'), calls: existsSync(t.calls) ? readFileSync(t.calls, 'utf8') : '' };
}

const untouched = (t) => {
  assert.equal(readFileSync(join(t.host, '.env'), 'utf8').includes('hemmelig'), true);
  assert.equal(readFileSync(join(t.host, 'data', 'homelab.db'), 'utf8'), 'ekte database');
  assert.equal(readFileSync(join(t.host, 'proton', 'key'), 'utf8'), 'proton-nøkkel');
};

test('vellykket oppdatering: done, installed.json, .env/data/proton urørt', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'req-1', requestedBy: 'owner', at: Date.now(), repo: 'evil/evil', branch: 'evil', command: 'touch /tmp/pwn' });
  assert.equal(r.status?.state, 'done', `${r.stderr}\n${readFileSync(join(t.host, 'data', 'update', 'log.txt'), 'utf8')}`);
  assert.equal(r.status.id, 'req-1');
  assert.equal(r.status.sha, SHA);
  assert.equal(r.status.version, '9.9.9');
  assert.ok(r.status.startedAt > 0 && r.status.finishedAt >= r.status.startedAt);
  assert.deepEqual({ sha: r.installed.sha, version: r.installed.version }, { sha: SHA, version: '9.9.9' });
  untouched(t);
  assert.equal(existsSync(join(t.host, 'data', 'update', 'heartbeat')), true);
  assert.equal(readFileSync(join(t.host, 'server', 'index.js'), 'utf8'), '// ny');
  assert.equal(existsSync(join(t.host, 'server', 'data', 'kode.js')), true);
  assert.equal(existsSync(join(t.host, 'lokal-fil.txt')), true);
  // Repo og branch fra miljøet (standard), aldri fra request.json.
  assert.match(r.calls, /curl https:\/\/api\.github\.com\/repos\/SebastianKristo\/torskenes-verden\/commits\/main/);
  assert.match(r.calls, new RegExp(`curl https://codeload.github.com/SebastianKristo/torskenes-verden/tar.gz/${SHA}`));
  assert.doesNotMatch(r.calls, /evil|pwn/);
  // Compose med prosjektmappen og prosjektnavnet, bare os startes på nytt (updater via hjelpecontainer etterpå).
  assert.match(r.calls, new RegExp(`docker compose --project-directory ${t.host} -p homelab-os build os`));
  assert.match(r.calls, new RegExp(`docker compose --project-directory ${t.host} -p homelab-os up -d --no-deps os\\n`));
  assert.match(r.calls, /docker image prune -f/);
  assert.match(r.calls, new RegExp(`docker run -d --rm --name homelab-os-updater-selfupdate .*-e PWD=${t.host} .*compose --project-directory ${t.host} -p homelab-os up -d --no-deps updater`));
  assert.doesNotMatch(r.calls, /up -d --no-deps os updater|up -d --build\b/);

  // Samme id behandles ikke på nytt.
  const before = r.calls.length;
  const again = run(t, null);
  assert.equal(again.calls.slice(before).includes('docker compose '), false);
});

test('tunnel-profil når CLOUDFLARE_TUNNEL_TOKEN er satt', { skip }, () => {
  const t = setup({ tunnel: true });
  const r = run(t, { id: 'req-t', at: Date.now() });
  assert.equal(r.status?.state, 'done', r.stderr);
  assert.match(r.calls, /-p homelab-os --profile tunnel up -d --no-deps os cloudflared/);
});

test('bygget feiler: failed, ingenting startes på nytt, data urørt', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'req-2', at: Date.now() }, { FAKE_BUILD_RC: '1' });
  assert.equal(r.status?.state, 'failed', r.stderr);
  assert.match(r.status.error, /Bygget feilet/);
  assert.match(r.status.error, /gamle versjonen kjører videre/);
  assert.match(r.status.error, /bygger os/, 'siste linjer i loggen tas med');
  assert.equal(r.installed, null);
  assert.doesNotMatch(r.calls, / up -d/);
  untouched(t);
});

test('ny versjon svarer ikke: failed', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'req-3', at: Date.now() }, { FAKE_HEALTH_RC: '7' });
  assert.equal(r.status?.state, 'failed', r.stderr);
  assert.match(r.status.error, /Ny versjon startet ikke/);
  assert.equal(r.installed, null);
});

test('ugyldig eller gammel forespørsel kjøres ikke', { skip }, () => {
  const t = setup();
  let r = run(t, { id: '$(touch pwn); x', at: Date.now() });
  assert.equal(r.status, null);
  assert.doesNotMatch(r.calls, /docker compose |codeload/);
  r = run(t, { id: 'gammel', at: Date.now() - 3600_000 });
  assert.equal(r.status, null);
  assert.doesNotMatch(r.calls, /docker compose |codeload/);
});

test('avbrutt jobb markeres som feilet ved oppstart', { skip }, () => {
  const t = setup();
  writeFileSync(join(t.host, 'data', 'update', 'status.json'), JSON.stringify({ id: 'req-x', state: 'building', startedAt: 1 }));
  writeFileSync(join(t.host, 'data', 'update', 'request.json'), JSON.stringify({ id: 'req-x', at: Date.now() }));
  const r = run(t, null);
  assert.equal(r.status.state, 'failed');
  assert.match(r.status.error, /avbrutt/);
  assert.doesNotMatch(r.calls, /docker compose /, 'samme id startes ikke igjen');
});

test('nekter å starte når compose ble kjørt fra en annen mappe', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'req-4', at: Date.now() }, { FAKE_WORKDIR: '/et/annet/sted' });
  assert.notEqual(r.code, 0);
  assert.equal(r.status, null);
  assert.match(r.stderr, /cd til prosjektmappen/);
  assert.equal(existsSync(join(t.host, 'data', 'update', 'heartbeat')), false);
});

// Prompt 30: rollback. Updateren husker selv vellykkede sha-er i history.json; forespørselen har bare {id, action}.
const OLD = 'beef'.padEnd(40, '1');
test('vellykket oppdatering skriver history.json (med tidligere installed.json som forrige)', { skip }, () => {
  const t = setup();
  writeFileSync(join(t.host, 'data', 'update', 'installed.json'), JSON.stringify({ sha: OLD, version: '9.9.8', at: 1 }));
  const r = run(t, { id: 'req-h', at: Date.now() });
  assert.equal(r.status?.state, 'done', r.stderr);
  assert.equal(r.status.action, 'update');
  const h = JSON.parse(readFileSync(join(t.host, 'data', 'update', 'history.json'), 'utf8'));
  assert.deepEqual(h.entries.map((e) => e.sha), [SHA, OLD]);
});

test('rollback laster ned forrige sha fra historikken, aldri fra forespørselen', { skip }, () => {
  const t = setup();
  writeFileSync(join(t.host, 'data', 'update', 'history.json'), JSON.stringify({ entries: [{ sha: SHA, version: '9.9.9', at: 2 }, { sha: OLD, version: '9.9.8', at: 1 }] }));
  // Den falske curl gir samme arkiv uansett sha; vi sjekker hvilken sha som ble bedt om.
  const r = run(t, { id: 'req-rb', at: Date.now(), action: 'rollback', sha: 'f'.repeat(40), repo: 'evil/evil' });
  assert.equal(r.status?.state, 'done', `${r.stderr}\n${readFileSync(join(t.host, 'data', 'update', 'log.txt'), 'utf8')}`);
  assert.equal(r.status.action, 'rollback');
  assert.equal(r.status.sha, OLD);
  assert.match(r.calls, new RegExp(`codeload.github.com/SebastianKristo/torskenes-verden/tar.gz/${OLD}`));
  assert.doesNotMatch(r.calls, /api\.github\.com|evil|ffffffff/);
  assert.doesNotMatch(r.calls, /selfupdate/, 'updateren oppdaterer ikke seg selv ved rollback');
  assert.equal(r.installed.sha, OLD);
  const h = JSON.parse(readFileSync(join(t.host, 'data', 'update', 'history.json'), 'utf8'));
  assert.deepEqual(h.entries.map((e) => e.sha), [OLD]);
  untouched(t);
});

test('rollback uten historikk feiler uten å røre noe', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'req-rb2', at: Date.now(), action: 'rollback' });
  assert.equal(r.status?.state, 'failed', r.stderr);
  assert.match(r.status.error, /ingen tidligere versjon/);
  assert.doesNotMatch(r.calls, /codeload|docker compose /);
  assert.equal(readFileSync(join(t.host, 'server', 'index.js'), 'utf8'), '// gammel');
});

test('ukjent action ignoreres', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'req-x9', at: Date.now(), action: 'rm -rf' });
  assert.equal(r.status, null);
  assert.doesNotMatch(r.calls, /docker compose |codeload/);
});

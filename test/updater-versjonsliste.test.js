// Prompt 44 (SERVER44): updateren eier versjonslista (versions.json) og godtar bare target fra den; restoreBackup og automatisk
// tilbakegang ved helsefeil. Samme falske docker/curl som updater-sh.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, readdirSync } from 'node:fs';
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


const OLD = 'beef'.padEnd(40, '1');
const writeJ = (t, f, o) => writeFileSync(join(t.host, 'data', 'update', f), JSON.stringify(o));
const hist = (t) => writeJ(t, 'history.json', { entries: [{ sha: SHA, version: '9.9.9', at: 2 }, { sha: OLD, version: '9.9.8', at: 1, dbSchema: 43 }] });

test('versions.json skrives av updateren fra egen historikk (og tagger den selv har lest)', { skip }, () => {
  const t = setup(); hist(t);
  writeJ(t, '.tags.json', [{ version: '9.9.7', sha: 'd'.repeat(40) }]);
  writeJ(t, 'installed.json', { sha: SHA, version: '9.9.9', at: 2 });
  run(t, null);
  const v = JSON.parse(readFileSync(join(t.host, 'data', 'update', 'versions.json'), 'utf8'));
  assert.deepEqual(v.versions.map((x) => [x.version, x.installed]), [['9.9.9', true], ['9.9.8', true], ['9.9.7', false]]);
  assert.equal(v.current, '9.9.9');
});

test('rollback til target fra lista: henter sha fra egen liste, aldri fra forespørselen; beholder versjonen vi kom fra', { skip }, () => {
  const t = setup(); hist(t);
  const r = run(t, { id: 'rb-t', at: Date.now(), action: 'rollback', target: '9.9.8', sha: 'f'.repeat(40), repo: 'evil/evil' });
  assert.equal(r.status?.state, 'done', `${r.stderr}\n${readFileSync(join(t.host, 'data', 'update', 'log.txt'), 'utf8')}`);
  assert.equal(r.status.sha, OLD);
  assert.match(r.calls, new RegExp(`codeload.github.com/SebastianKristo/torskenes-verden/tar.gz/${OLD}`));
  assert.doesNotMatch(r.calls, /evil|ffffffff|api\.github\.com/);
  const h = JSON.parse(readFileSync(join(t.host, 'data', 'update', 'history.json'), 'utf8'));
  assert.deepEqual(h.entries.map((e) => e.sha), [OLD, SHA]);
  untouched(t);
});

test('target som ikke finnes i lista, eller ikke er semver, kjøres ikke', { skip }, () => {
  let t = setup(); hist(t);
  let r = run(t, { id: 'rb-x', at: Date.now(), action: 'rollback', target: '1.2.3' });
  assert.equal(r.status?.state, 'failed');
  assert.match(r.status.error, /finnes ikke i updaterens liste/);
  assert.doesNotMatch(r.calls, /codeload|docker compose /);
  t = setup(); hist(t);
  r = run(t, { id: 'rb-y', at: Date.now(), action: 'rollback', target: 'main; rm -rf /' });
  assert.equal(r.status, null, 'ugyldig target ignoreres');
  assert.doesNotMatch(r.calls, /codeload|docker compose /);
});

test('restoreBackup: backupen fra før oppdateringen bort fra målversjonen, gjeldende database kopieres først', { skip }, () => {
  const t = setup(); hist(t);
  const bk = join(t.host, 'data', 'backups'); mkdirSync(bk, { recursive: true });
  writeFileSync(join(bk, 'pre-update-2026-10-21T11-50-00-000Z.db'), 'gammel database');
  writeFileSync(join(bk, 'update-backups.json'), JSON.stringify({ items: [{ name: 'pre-update-2026-10-21T11-50-00-000Z.db', fromVersion: '9.9.8', at: 5 }, { name: '../../etc/passwd', fromVersion: '9.9.8', at: 9 }] }));
  const r = run(t, { id: 'rb-r', at: Date.now(), action: 'rollback', target: '9.9.8', restoreBackup: true });
  assert.equal(r.status?.state, 'done', `${r.stderr}\n${readFileSync(join(t.host, 'data', 'update', 'log.txt'), 'utf8')}`);
  assert.equal(readFileSync(join(t.host, 'data', 'homelab.db'), 'utf8'), 'gammel database');
  const kept = readdirSync(bk).find((f) => f.startsWith('pre-rollback-'));
  assert.equal(readFileSync(join(bk, kept), 'utf8'), 'ekte database');
  assert.match(r.calls, /compose .* stop os/);
});

test('ny versjon svarer ikke innen fristen: automatisk tilbake til versjonen vi kom fra', { skip }, () => {
  const t = setup(); hist(t);
  const r = run(t, { id: 'rb-h', at: Date.now(), action: 'rollback', target: '9.9.8' }, { FAKE_HEALTH_RC: '7' });
  assert.equal(r.status?.state, 'failed');
  assert.match(r.status.error, /Kunne ikke gå tilbake til 9\.9\.8/);
  assert.equal((r.calls.match(/build os/g) ?? []).length, 2, 'bygget to ganger: målet og tilbakegangen');
  assert.match(r.calls, new RegExp(`tar.gz/${SHA}`), 'lastet ned versjonen vi kom fra');
});

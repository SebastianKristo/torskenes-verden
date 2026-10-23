// Prompt 45 (SERVER45): updateren legger til Docker-proxyen for Logger (homelab-docker) fra sin EGEN validerte compose, gjenbruker en proxy
// brukeren har lagt inn selv, fjerner den ikke ved rollback, og godtar {action:'docker-setup'} uten å laste ned/bygge noe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const SCRIPT = resolve('deploy/updater/updater.sh');
const has = (cmd) => spawnSync('bash', ['-c', `command -v ${cmd}`]).status === 0;
const skip = !(has('bash') && has('jq') && has('tar')) && 'trenger bash, jq og tar';
const SHA = 'c0ffee'.padEnd(40, '0'), OLD = 'beef'.padEnd(40, '1');
const GOOD = { services: { os: {}, 'homelab-docker': { image: 'tecnativa/docker-socket-proxy:0.2.0', environment: { CONTAINERS: '1', LOGS: '1', INFO: '1', EVENTS: '1', SYSTEM: '1', POST: '0', ALLOW_START: '1', ALLOW_STOP: '1', ALLOW_RESTARTS: '1' },
  volumes: [{ type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock', read_only: true }], networks: { 'docker-api': null } } } };

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'hl-upd45-'));
  const host = join(root, 'opt', 'homelab-os'), bin = join(root, 'bin'), src = join(root, 'src', `torskenes-verden-${SHA}`);
  for (const d of [host, bin, src, join(host, 'data', 'update'), join(host, 'server'), join(src, 'server')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(host, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(host, '.env'), 'SESSION_SECRET=hemmelig\n');
  writeFileSync(join(host, 'data', 'homelab.db'), 'ekte database');
  writeFileSync(join(src, 'docker-compose.yml'), 'services: {} # ny\n');
  writeFileSync(join(src, 'server', 'index.js'), '// ny');
  writeFileSync(join(src, 'CHANGELOG.md'), '## [9.9.9] – 20.10.2026\n- ny\n');
  const tgz = join(root, 'src.tgz');
  execFileSync('tar', ['-czf', tgz, '-C', join(root, 'src'), `torskenes-verden-${SHA}`]);
  const calls = join(root, 'calls.log'), cfg = join(root, 'config.json'), ps = join(root, 'ps.txt');
  writeFileSync(cfg, JSON.stringify(GOOD)); writeFileSync(ps, '');
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -H|--max-time) shift 2;; http*) url="$1"; shift;; *) shift;; esac; done
echo "curl $url" >> "${calls}"
case "$url" in
  https://api.github.com/*) echo '{"sha":"${SHA}"}';;
  https://codeload.github.com/*) cp "${tgz}" "$out";;
  *healthz) exit 0;;
  *) exit 22;;
esac
`);
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
echo "docker $*" >> "${calls}"
case "$*" in
  *project.working_dir*) echo "\${FAKE_WORKDIR:-}";;
  *com.docker.compose.project*) echo homelab-os;;
  inspect*Config.Image*) echo homelab-updater:local;;
  *" config --format json"*) cat "${cfg}";;
  "ps -a --format"*) cat "${ps}";;
esac
exit 0
`);
  chmodSync(join(bin, 'curl'), 0o755); chmodSync(join(bin, 'docker'), 0o755);
  return { root, host, calls, cfg, ps, bin };
}
function run(t, request) {
  if (request) writeFileSync(join(t.host, 'data', 'update', 'request.json'), JSON.stringify(request));
  const r = spawnSync('bash', [SCRIPT], { env: { PATH: `${t.bin}:${process.env.PATH}`, HOME: t.root, HOSTNAME: 'abc123', HOST_DIR: t.host, ONCE: '1', LOCK_DIR: t.root, HEALTH_TIMEOUT: '2', HEALTH_SLEEP: '1', TMPDIR: t.root, FAKE_WORKDIR: t.host, SELF_UPDATE: '0' }, encoding: 'utf8', timeout: 30_000 });
  const read = (f) => { try { return JSON.parse(readFileSync(join(t.host, 'data', 'update', f), 'utf8')); } catch { return null; } };
  return { ...r, status: read('status.json'), docker: read('docker.json'), calls: existsSync(t.calls) ? readFileSync(t.calls, 'utf8') : '' };
}

test('oppdatering legger til homelab-docker fra egen validert compose (ingen proxy fra før)', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'u1', at: Date.now() });
  assert.equal(r.status?.state, 'done', r.stderr);
  assert.match(r.calls, /-p homelab-os config --format json/);
  assert.match(r.calls, /-p homelab-os up -d --no-deps homelab-docker\n/);
  assert.deepEqual([r.docker.state, r.docker.proxy.name, r.docker.proxy.reused], ['done', 'homelab-docker', false]);
});

test('eksisterende proxy (brukerens egen) gjenbrukes – ingen duplikat', { skip }, () => {
  const t = setup();
  writeFileSync(t.ps, 'homelab-os\thomelab-os:local\trunning\nhomelab-os-docker-socket-proxy-1\ttecnativa/docker-socket-proxy:0.2.0\trunning\n');
  const r = run(t, { id: 'u2', at: Date.now() });
  assert.equal(r.status?.state, 'done', r.stderr);
  assert.doesNotMatch(r.calls, /up -d --no-deps homelab-docker/);
  assert.deepEqual([r.docker.state, r.docker.proxy.name, r.docker.proxy.reused], ['done', 'homelab-os-docker-socket-proxy-1', true]);
});

test('en compose med POST=1, :latest, porter eller EXEC startes ikke (oppdateringen er likevel ferdig)', { skip }, () => {
  for (const bad of [{ environment: { ...GOOD.services['homelab-docker'].environment, POST: '1' } }, { image: 'tecnativa/docker-socket-proxy:latest' }, { ports: [{ target: 2375, published: '2375' }] },
    { environment: { ...GOOD.services['homelab-docker'].environment, EXEC: '1' } }, { volumes: [{ type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock', read_only: false }] }, { privileged: true }]) {
    const t = setup();
    writeFileSync(t.cfg, JSON.stringify({ services: { 'homelab-docker': { ...GOOD.services['homelab-docker'], ...bad } } }));
    const r = run(t, { id: 'u3', at: Date.now() });
    assert.equal(r.status?.state, 'done', r.stderr);
    assert.doesNotMatch(r.calls, /up -d --no-deps homelab-docker/, JSON.stringify(bad));
    assert.equal(r.docker.state, 'failed');
    assert.match(r.docker.error, /ikke godkjent/);
  }
});

test('docker-setup: bare proxyen – ingen nedlasting, bygging eller omstart av os; samme id kjøres ikke to ganger', { skip }, () => {
  const t = setup();
  let r = run(t, { id: 'ds-1', at: Date.now(), action: 'docker-setup', compose: 'ondsinnet', image: 'alpine' });
  assert.doesNotMatch(r.calls, /codeload|api\.github|build os|up -d --no-deps os/);
  assert.match(r.calls, /up -d --no-deps homelab-docker/);
  assert.equal(r.docker.state, 'done');
  assert.equal(r.docker.id, 'ds-1');
  assert.equal(r.status, null, 'status.json (oppdateringen) røres ikke');
  const before = r.calls.length;
  r = run(t, null);
  assert.doesNotMatch(r.calls.slice(before), /homelab-docker/);
});

test('rollback rører ikke proxyen', { skip }, () => {
  const t = setup();
  writeFileSync(join(t.host, 'data', 'update', 'history.json'), JSON.stringify({ entries: [{ sha: OLD, version: '9.9.8', at: 2 }, { sha: SHA, version: '9.9.9', at: 1 }] }));
  const r = run(t, { id: 'rb', at: Date.now(), action: 'rollback' });
  assert.equal(r.status?.state, 'done', r.stderr);
  assert.doesNotMatch(r.calls, /homelab-docker|rm .*proxy/);
  assert.equal(r.docker, null);
});

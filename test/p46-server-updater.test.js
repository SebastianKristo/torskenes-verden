// Prompt 46 (SERVER46): «Oppdateringen står fast på 55 %». updater.sh kjøres med falske docker/curl: bygg som henger → tidsavbrudd
// (aldri en evig «building»), vakt «står fast» uten fremgang, «Prøv igjen»/«Avbryt» mens bygget kjører, OOM/full disk gjenkjennes,
// for lite disk stopper før noe gjøres, gammel lås (mappe eller død PID) ryddes, «Rydd» rører aldri volumer, og updateren starter
// aldri seg selv på nytt midt i jobben. Fem oppdateringer på rad uten omstart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';

const SCRIPT = resolve('deploy/updater/updater.sh');
const has = (cmd) => spawnSync('bash', ['-c', `command -v ${cmd}`]).status === 0;
const skip = !(has('bash') && has('jq') && has('tar') && has('timeout')) && 'trenger bash, jq, tar og timeout';
const SHA = 'c0ffee'.padEnd(40, '0'), OLD = 'beef'.padEnd(40, '1');

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'hl-upd46-'));
  const host = join(root, 'opt', 'homelab-os'), bin = join(root, 'bin'), src = join(root, 'src', `torskenes-verden-${SHA}`);
  for (const d of [host, bin, src, join(host, 'data', 'update'), join(host, 'server'), join(src, 'server')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(host, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(host, '.env'), 'SESSION_SECRET=hemmelig\n');
  writeFileSync(join(host, 'data', 'homelab.db'), 'ekte database');
  writeFileSync(join(src, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(src, 'server', 'index.js'), '// ny');
  writeFileSync(join(src, 'CHANGELOG.md'), '## [9.9.9] – 20.10.2026\n- ny\n');
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
  *healthz) exit 0;;
  *) exit 22;;
esac
`);
  // FAKE_BUILD: ok | hang (ingen utskrift) | slow (skriver en linje hvert 0,3 s i 3 s) | oom | disk
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
echo "docker $*" >> "${calls}"
case "$*" in
  *project.working_dir*) echo "\${FAKE_WORKDIR:-}";;
  *com.docker.compose.project*) echo homelab-os;;
  inspect*Config.Image*) echo homelab-updater:local;;
  *" build os"*)
    n=$(cat "${root}/builds" 2>/dev/null || echo 0); echo $((n+1)) > "${root}/builds"
    mode="\${FAKE_BUILD:-ok}"; [ "$mode" = hang-once ] && { [ "$n" = 0 ] && mode=hang || mode=ok; }
    case "$mode" in
      hang) sleep 300;;
      slow) for i in 1 2 3 4 5 6 7 8 9 10; do echo "#$i [deps 2/5] RUN npm ci"; sleep 0.3; done;;
      oom) echo "#9 ERROR: process \\"/bin/sh -c npm ci\\" did not complete successfully: exit code: 137"; exit 1;;
      disk) echo "write /var/lib/docker/x: no space left on device"; exit 1;;
      *) echo "bygger os";;
    esac;;
esac
exit 0
`);
  chmodSync(join(bin, 'curl'), 0o755); chmodSync(join(bin, 'docker'), 0o755);
  return { root, host, bin, calls, upd: join(host, 'data', 'update') };
}
const envOf = (t, env) => ({ PATH: `${t.bin}:${process.env.PATH}`, HOME: t.root, HOSTNAME: 'abc123', HOST_DIR: t.host, ONCE: '1', LOCK_DIR: t.root, HEALTH_TIMEOUT: '2', HEALTH_SLEEP: '1',
  TMPDIR: t.root, FAKE_WORKDIR: t.host, SELF_UPDATE: '0', WATCH_SLEEP: '1', MIN_DISK_MB: '1', MIN_RAM_MB: '1', ...env });
const read = (t, f) => { try { return JSON.parse(readFileSync(join(t.upd, f), 'utf8')); } catch { return null; } };
const callsOf = (t) => (existsSync(t.calls) ? readFileSync(t.calls, 'utf8') : '');
function run(t, request, env = {}) {
  if (request) writeFileSync(join(t.upd, 'request.json'), JSON.stringify(request));
  const r = spawnSync('bash', [SCRIPT], { env: envOf(t, env), encoding: 'utf8', timeout: 60_000 });
  return { ...r, status: read(t, 'status.json'), calls: callsOf(t) };
}
/** Starter updateren i bakgrunnen; venter på et vilkår på status.json. */
function runAsync(t, request, env = {}) {
  writeFileSync(join(t.upd, 'request.json'), JSON.stringify(request));
  const p = spawn('bash', [SCRIPT], { env: envOf(t, env), stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; p.stderr.on('data', (d) => { stderr += d; });
  const done = new Promise((res) => p.on('exit', (code) => res(code)));
  return { p, done, stderr: () => stderr };
}
const until = async (fn, ms = 20_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)); } return null; };

test('bygg som henger: tidsavbrudd (BUILD_TIMEOUT) → failed med kode timeout, ingenting startet, aldri evig «building»', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'h1', at: Date.now() }, { FAKE_BUILD: 'hang', BUILD_TIMEOUT: '3', STALL_TIMEOUT: '100' });
  assert.equal(r.status?.state, 'failed', r.stderr);
  assert.equal(r.status.code, 'timeout');
  assert.match(r.status.error, /Bygget brukte mer enn 0 min og ble stoppet\. Den gamle versjonen kjører videre/);
  assert.doesNotMatch(r.calls, / up -d/);
});

test('vakt: ingen fremgang på STALL_TIMEOUT → stuckSince i status mens bygget fortsatt kjører; fremgang fjerner merket', { skip }, async () => {
  const t = setup();
  const a = runAsync(t, { id: 's1', at: Date.now() }, { FAKE_BUILD: 'hang', BUILD_TIMEOUT: '30', STALL_TIMEOUT: '2' });
  const st = await until(() => { const s = read(t, 'status.json'); return s?.state === 'building' && s.stuckSince ? s : null; });
  assert.ok(st, 'merket som «står fast»');
  assert.ok(st.progressAt > 0 && st.updatedAt >= st.progressAt);
  assert.equal(st.step, 'Bygger ny versjon');
  // «Avbryt og gå tilbake» mens bygget henger.
  writeFileSync(join(t.upd, 'request.json'), JSON.stringify({ id: 'ab-1', at: Date.now(), action: 'abort' }));
  assert.equal(await a.done, 0, a.stderr());
  const s = read(t, 'status.json');
  assert.deepEqual([s.state, s.code], ['failed', 'cancelled']);
  assert.match(s.error, /Avbrutt under byggingen/);
  assert.doesNotMatch(callsOf(t), / up -d/, 'ingenting startet på nytt');
  // Fremgang (loggen vokser) gir aldri stuck.
  const t2 = setup();
  const r2 = run(t2, { id: 's2', at: Date.now() }, { FAKE_BUILD: 'slow', STALL_TIMEOUT: '2' });
  assert.equal(r2.status.state, 'done', r2.stderr);
  assert.equal(r2.status.stuckSince, null);
});

test('«Prøv igjen» mens bygget henger: steget kjøres på nytt i samme jobb (forsøk 2) og blir ferdig', { skip }, async () => {
  const t = setup();
  const a = runAsync(t, { id: 'r1', at: Date.now() }, { FAKE_BUILD: 'hang-once', BUILD_TIMEOUT: '60', STALL_TIMEOUT: '1' });
  assert.ok(await until(() => read(t, 'status.json')?.stuckSince), 'står fast først');
  writeFileSync(join(t.upd, 'request.json'), JSON.stringify({ id: 'rt-1', at: Date.now(), action: 'retry', sha: 'f'.repeat(40), repo: 'evil/evil' }));
  assert.equal(await a.done, 0, a.stderr());
  const s = read(t, 'status.json');
  assert.equal(s.state, 'done', a.stderr());
  assert.equal(s.id, 'r1');
  assert.equal(s.attempt, 2);
  assert.doesNotMatch(callsOf(t), /evil|ffffffff/);
});

test('OOM og full disk under bygget gjenkjennes (code oom / disk_full + forklaring)', { skip }, () => {
  let r = run(setup(), { id: 'o1', at: Date.now() }, { FAKE_BUILD: 'oom' });
  assert.deepEqual([r.status.state, r.status.code], ['failed', 'oom']);
  assert.match(r.status.error, /gikk tom for minne/);
  r = run(setup(), { id: 'd1', at: Date.now() }, { FAKE_BUILD: 'disk' });
  assert.deepEqual([r.status.state, r.status.code], ['failed', 'disk_full']);
});

test('ressurssjekk: for lite disk/minne → failed low_disk/low_ram før noe lastes ned eller bygges', { skip }, () => {
  let t = setup();
  let r = run(t, { id: 'l1', at: Date.now() }, { MIN_DISK_MB: '9999999' });
  assert.deepEqual([r.status.state, r.status.code], ['failed', 'low_disk']);
  assert.match(r.status.error, /Lite plass på serveren \([\d,]+ GB ledig/);
  assert.ok(r.status.resources.diskFreeMb > 0);
  assert.doesNotMatch(r.calls, /codeload|build os/);
  t = setup();
  r = run(t, { id: 'l2', at: Date.now() }, { MIN_RAM_MB: '9999999' });
  assert.deepEqual([r.status.state, r.status.code], ['failed', 'low_ram']);
});

test('«Rydd»: bare dinglende bilder og byggcache – aldri volumer eller navngitte bilder; status i maint.json', { skip }, () => {
  const t = setup();
  const r = run(t, { id: 'p1', at: Date.now(), action: 'prune' });
  assert.match(r.calls, /docker image prune -f\n/);
  assert.match(r.calls, /docker builder prune -f --filter until=72h/);
  assert.doesNotMatch(r.calls, /volume|prune -a|system prune|--volumes|codeload|build os/);
  const m = read(t, 'maint.json');
  assert.deepEqual([m.id, m.action, m.state], ['p1', 'prune', 'done']);
  assert.equal(r.status, null, 'ingen oppdatering');
});

test('lås: gammel mappe-lås og lås fra død prosess ryddes; levende lås stopper en ny updater', { skip }, () => {
  let t = setup();
  mkdirSync(join(t.root, 'homelab-updater.lock'));
  let r = run(t, { id: 'k1', at: Date.now() });
  assert.equal(r.status?.state, 'done', r.stderr);
  t = setup();
  writeFileSync(join(t.root, 'homelab-updater.lock'), `999999 ${Math.floor(Date.now() / 1000)}\n`);
  r = run(t, { id: 'k2', at: Date.now() });
  assert.equal(r.status?.state, 'done', r.stderr);
  assert.match(r.stderr, /Rydder gammel lås/);
  t = setup();
  const live = spawn('sleep', ['30']);
  writeFileSync(join(t.root, 'homelab-updater.lock'), `${live.pid} ${Math.floor(Date.now() / 1000)}\n`);
  r = run(t, { id: 'k3', at: Date.now() });
  live.kill();
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /En annen updater kjører allerede/);
  assert.equal(r.status, null);
  // Eldre enn LOCK_MAX_AGE (30 min) ryddes selv om PID-en lever.
  const live2 = spawn('sleep', ['30']);
  writeFileSync(join(t.root, 'homelab-updater.lock'), `${live2.pid} ${Math.floor(Date.now() / 1000) - 3600}\n`);
  r = run(t, { id: 'k4', at: Date.now() });
  live2.kill();
  assert.equal(r.status?.state, 'done', r.stderr);
});

test('oppstart etter en jobb som ble avbrutt (OOM/omstart): «Avbrutt» med kode interrupted, selv med gammel lås', { skip }, () => {
  const t = setup();
  writeFileSync(join(t.upd, 'status.json'), JSON.stringify({ id: 'x1', state: 'building', startedAt: 1, fromVersion: '4.21.0' }));
  writeFileSync(join(t.upd, 'request.json'), JSON.stringify({ id: 'x1', at: Date.now() }));
  mkdirSync(join(t.root, 'homelab-updater.lock'));
  const r = run(t, null);
  assert.deepEqual([r.status.state, r.status.code, r.status.fromVersion], ['failed', 'interrupted', '4.21.0']);
});

test('updateren starter aldri seg selv på nytt midt i jobben; fem oppdateringer på rad uten omstart', { skip }, () => {
  const t = setup();
  writeFileSync(join(t.upd, 'history.json'), JSON.stringify({ entries: [{ sha: OLD, version: '9.9.8', at: 1 }] }));
  for (let i = 1; i <= 5; i++) {
    const r = run(t, { id: `fem-${i}`, at: Date.now() });
    assert.equal(r.status?.state, 'done', `runde ${i}: ${r.stderr}`);
  }
  const c = callsOf(t);
  const ups = c.split('\n').filter((l) => / up -d/.test(l));
  assert.equal(ups.filter((l) => /--no-deps os$/.test(l)).length, 5);
  assert.ok(ups.every((l) => !/updater/.test(l)), 'aldri up -d … updater (SELF_UPDATE=0)');
});

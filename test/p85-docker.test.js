// Prompt 85 (DOCKER85): gjennomgang fra Docker til oppstart. Rettinger som testes her:
//  1. Ryddig nedstenging: SIGTERM/SIGINT stopper serveren selv (Node er PID 1 i containeren og overså SIGTERM → 10 s + SIGKILL).
//  2. Statiske filer under /assets svarer 304 på If-Modified-Since (før: alltid 200 med hele fila).
//  3. docker-compose.yml: ingen varsel om CLOUDFLARE_TUNNEL_TOKEN når profilen ikke er i bruk; alle porter bindes til 127.0.0.1 som standard.
//  4. .dockerignore: tests/, tools/ og deploy/ sendes ikke med i byggkonteksten.
//  5. docker-entrypoint.sh: en chown som feiler stopper ikke oppstarten.
//  6. deploy/proxmox/install.sh: standard disk og minne holder til updaterens egne krav.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-p85-docker-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-32s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.APP_BUILD;
const { default: app } = await import('../server/index.js');

test('statiske filer: 304 på If-Modified-Since når fila er uendret, 200 ellers', async () => {
  const first = await app.request('/assets/icons/icon-192.png');
  assert.equal(first.status, 200);
  const lm = first.headers.get('last-modified');
  assert.ok(lm, 'Last-Modified mangler');
  assert.equal(first.headers.get('cache-control'), 'no-cache');
  await first.arrayBuffer();

  const same = await app.request('/assets/icons/icon-192.png', { headers: { 'if-modified-since': lm } });
  assert.equal(same.status, 304);
  assert.equal((await same.arrayBuffer()).byteLength, 0);
  assert.equal(same.headers.get('cache-control'), 'no-cache');
  assert.equal(same.headers.get('last-modified'), lm);
  assert.equal(same.headers.get('content-length'), null);

  const later = await app.request('/assets/icons/icon-192.png', { headers: { 'if-modified-since': new Date(Date.parse(lm) + 60_000).toUTCString() } });
  assert.equal(later.status, 304);

  const older = await app.request('/assets/icons/icon-192.png', { headers: { 'if-modified-since': new Date(Date.parse(lm) - 60_000).toUTCString() } });
  assert.equal(older.status, 200);
  assert.ok((await older.arrayBuffer()).byteLength > 1000);

  const junk = await app.request('/assets/icons/icon-192.png', { headers: { 'if-modified-since': 'ikke en dato' } });
  assert.equal(junk.status, 200);
  await junk.arrayBuffer();

  const css = await app.request('/assets/css/app.css', { headers: { 'if-modified-since': new Date(Date.now() + 60_000).toUTCString() } });
  assert.equal(css.status, 304);
  const missing = await app.request('/assets/finnes-ikke-85.png', { headers: { 'if-modified-since': lm } });
  assert.equal(missing.status, 404);
});

test('JS under /assets beholder ETag/304 fra cache-bust (uendret)', async () => {
  const r = await app.request('/assets/js/app.js');
  assert.equal(r.status, 200);
  const etag = r.headers.get('etag');
  assert.ok(etag);
  const again = await app.request('/assets/js/app.js', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
});

test('SIGTERM: serveren stenger ned selv, avslutter med kode 0 og skriver WAL inn i databasen', { timeout: 60_000 }, async () => {
  const data = mkdtempSync(join(tmpdir(), 'hl-p85-stopp-'));
  // Ingen utgående kall fra barneprosessen (bare localhost).
  const block = 'data:text/javascript,' + encodeURIComponent(
    "const f=globalThis.fetch;globalThis.fetch=async(u,o)=>{const s=typeof u==='string'?u:u?.url??String(u);if(/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?\\//.test(s))return f(u,o);throw new TypeError('fetch failed (p85: ingen utgående kall)')};");
  const env = { ...process.env, NODE_ENV: 'production', OPS51_SANDBOX: '1', MOCK_DATA: '1', DATA_DIR: data, PORT: '0', OCR_FALLBACK: '0' };
  delete env.NODE_TEST_CONTEXT; delete env.GLITCHTIP_DSN; delete env.GEMINI_API_KEY;
  const child = spawn(process.execPath, ['--import', block, 'server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((res) => child.on('exit', (code, signal) => res({ code, signal })));
  try {
    const t0 = Date.now();
    while (!/OS kjører på http:\/\/localhost:(\d+)/.test(out)) {
      if (Date.now() - t0 > 40_000 || child.exitCode !== null) assert.fail(`serveren startet ikke:\n${out.slice(-2000)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
    const port = out.match(/OS kjører på http:\/\/localhost:(\d+)/)[1];
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    const sent = Date.now();
    child.kill('SIGTERM');
    const { code, signal } = await exited;
    assert.equal(signal, null, 'prosessen ble drept av signalet i stedet for å stenge ned selv');
    assert.equal(code, 0);
    assert.ok(Date.now() - sent < 8000, 'nedstengingen tok for lang tid');
    assert.match(out, /\[stopp\] SIGTERM/);
    const wal = join(data, 'homelab.db-wal');
    assert.ok(!existsSync(wal) || statSync(wal).size === 0, 'WAL ble ikke skrevet inn i databasen');
    assert.ok(statSync(join(data, 'homelab.db')).size > 100_000);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rmSync(data, { recursive: true, force: true });
  }
});

const compose = readFileSync('docker-compose.yml', 'utf8');

test('compose: tunnel-tokenet har tom standardverdi (ingen varsel uten profilen)', () => {
  assert.match(compose, /TUNNEL_TOKEN: \$\{CLOUDFLARE_TUNNEL_TOKEN:-\}/);
});

test('compose: alle publiserte porter bindes til 127.0.0.1 som standard, og Ollama (11434) og Docker-API-et (2375) publiseres aldri', () => {
  const ports = [...compose.matchAll(/^\s+- "([^"]+)"\s*(?:#.*)?$/gm)].map((m) => m[1]).filter((p) => /:\d+$/.test(p) && p.includes('${'));
  assert.ok(ports.length >= 5, `fant bare ${ports.length} porter`);
  for (const p of ports) assert.match(p, /^\$\{[A-Z0-9_]+:-127\.0\.0\.1\}:/, `porten ${p} er ikke bundet til 127.0.0.1 som standard`);
  for (const line of compose.split('\n')) {
    if (/^\s*#/.test(line)) continue;
    assert.ok(!/^\s+- .*\b(11434|2375)\b/.test(line), `porten skal ikke publiseres: ${line.trim()}`);
  }
  const os = compose.slice(compose.indexOf('\n  os:'), compose.indexOf('\n  # Updater'));
  assert.ok(!os.includes('docker.sock'), 'os skal aldri få Docker-socketen');
  assert.match(os, /restart: unless-stopped/);
});

test('.dockerignore: tests, tools og deploy er ikke med i byggkonteksten, og Dockerfile kopierer dem ikke', () => {
  const ign = readFileSync('.dockerignore', 'utf8').split('\n').map((l) => l.trim());
  for (const d of ['tests', 'tools', 'deploy', 'test', 'apps', '.env', 'data', 'node_modules', '.git']) assert.ok(ign.includes(d), `${d} mangler i .dockerignore`);
  const df = readFileSync('Dockerfile', 'utf8');
  for (const m of df.matchAll(/^COPY (?!--from)(.+)$/gm)) {
    const srcs = m[1].trim().split(/\s+/).slice(0, -1);
    for (const s of srcs) assert.ok(!ign.includes(s.replace(/^\.\//, '').replace(/\/$/, '')), `Dockerfile kopierer ${s}, som står i .dockerignore`);
  }
});

test('docker-entrypoint.sh: chown som feiler stopper ikke oppstarten, og rettighetene slippes før serveren starter', () => {
  const sh = readFileSync('docker-entrypoint.sh', 'utf8');
  assert.match(sh, /^set -e$/m);
  assert.match(sh, /chown -R "\$PUID:\$PGID" \/data \|\| echo /);
  assert.match(sh, /exec setpriv --reuid="\$PUID" --regid="\$PGID" --clear-groups "\$@"/);
});

test('install.sh: standard disk og minne dekker updaterens krav (ledig disk, minne og staging)', () => {
  const inst = readFileSync('deploy/proxmox/install.sh', 'utf8');
  const upd = readFileSync('deploy/updater/updater.sh', 'utf8');
  const num = (src, re) => Number(src.match(re)?.[1]);
  const diskGb = num(inst, /^DISK="\$\{DISK:-(\d+)\}"/m), ramMb = num(inst, /^RAM="\$\{RAM:-(\d+)\}"/m);
  const minDisk = num(upd, /^MIN_DISK_MB="\$\{MIN_DISK_MB:-(\d+)\}"/m), minRam = num(upd, /^MIN_RAM_MB="\$\{MIN_RAM_MB:-(\d+)\}"/m), stagingRam = num(upd, /^STAGING_MIN_RAM_MB="\$\{STAGING_MIN_RAM_MB:-(\d+)\}"/m);
  for (const n of [diskGb, ramMb, minDisk, minRam, stagingRam]) assert.ok(Number.isFinite(n) && n > 0);
  // System + Docker + image (~2 GB) + byggcache tar rundt 6 GB; resten må dekke kravet til ledig plass.
  assert.ok(diskGb * 1024 - 6 * 1024 >= minDisk, `DISK=${diskGb} GB gir ikke ${minDisk} MB ledig etter installasjonen`);
  assert.ok(ramMb > minRam, `RAM=${ramMb} MB kan aldri ha ${minRam} MB ledig`);
  assert.ok(ramMb > stagingRam, `RAM=${ramMb} MB kan aldri ha ${stagingRam} MB ledig (staging)`);
  const doc = readFileSync('docs/installasjon.md', 'utf8');
  assert.ok(doc.includes(`\`${diskGb}\` / \`${ramMb}\` / \`2\``), 'docs/installasjon.md viser ikke standardverdiene i install.sh');
});

test.after(() => { rmSync(DIR, { recursive: true, force: true }); });

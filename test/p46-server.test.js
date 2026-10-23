// Prompt 46 (SERVER46): oppdatering «står fast» (server), offentlige URL-er (aldri 172.18.0.3), QR-innlogging i appene (inkl. at Kalender-token
// bare kan godkjenne Kalender-økter), Media «Utlogget» (404 for ukjente stier med app-token, HOMELAB_AUTH, signerte bilder), Claude-minner
// i Markdown, vitnemål som tabeller (FS/UiO, NTNU og vgs), Nyheter (egne kategorier, For deg, sammendrag per kategori, favicon) og
// Subscription-logg + prøveperioder skjult uten aktive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { spawnSync } from 'node:child_process';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p46s-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-46s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4261';
process.env.PUBLIC_URL = 'https://home.kristo.no';
process.env.INSIDE_DOCKER = '1';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.LOCAL_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const upd = await import('../server/system-update.js');
const pu = await import('../server/public-url46.js');
const st46 = await import('../server/study46.js');
const news = await import('../server/news46.js');
const aa = await import('../server/api-auth46.js');
const mem = await import('../server/claude-memory46.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, buf, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const ck = await login('sebastian', 'testpassord1');
const A = as({ cookie: ck });
const tokFin = (await req('/finans/api/login', { method: 'POST', body: { username: 'sebastian', password: 'testpassord1', deviceName: 'iPhone' } })).body.token;
const T = as({ authorization: `Bearer ${tokFin}` });
const multipart = async (path, files, headers) => {
  const fd = new FormData();
  for (const [k, v] of files) fd.append(k, v, v.name);
  const r = await app.request(path, { method: 'POST', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers }, body: fd });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: j, text: t };
};
function zip(files) {
  const locals = [], cds = []; let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content), comp = deflateRawSync(data), nb = Buffer.from(name), crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x800, 8); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(off, 42);
    locals.push(lh, nb, comp); cds.push(cd, nb); off += 30 + nb.length + comp.length;
  }
  const cdBuf = Buffer.concat(cds), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cds.length / 2, 8); e.writeUInt16LE(cds.length / 2, 10); e.writeUInt32LE(cdBuf.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, e]);
}
/** Minimal PDF med tekst på faste posisjoner (Helvetica, WinAnsi; y fra toppen) – som et ekte tekstlag fra FS/Udir. */
function makePdf(items, { w = 595, h = 842 } = {}) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const body = items.map((i) => `BT /F1 ${i.size ?? 9} Tf 1 0 0 1 ${i.x} ${h - i.y} Tm (${esc(i.t)}) Tj ET`).join('\n');
  const objs = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
    `<< /Type /Page /Parent 4 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 1 0 R >> >> /Contents 2 0 R >>`, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Catalog /Pages 4 0 R >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 5 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const row = (y, cells) => cells.map(([x, t]) => ({ x, y, t }));
const hasPdftotext = spawnSync('bash', ['-c', 'command -v pdftotext']).status === 0;

/* ---------------- Oppdatering: vakt, Prøv igjen, Avbryt, Rydd ---------------- */

const U = upd._paths.UPD;
const hb = (ageS = 0) => { mkdirSync(U, { recursive: true }); writeFileSync(join(U, 'heartbeat'), String(Math.floor(Date.now() / 1000) - ageS)); };
const status = (s) => writeFileSync(join(U, 'status.json'), JSON.stringify(s));

test('oppdatering: «står fast» fra updaterens stuckSince/progressAt, og når updateren ikke svarer – aldri en evig prosent', async () => {
  hb();
  status({ id: 'j1', state: 'building', step: 'Bygger ny versjon', startedAt: Date.now() - 600_000, progressAt: Date.now() - 4 * 60_000, updatedAt: Date.now(), fromVersion: '4.21.0' });
  let s = (await A('/api/system/update/status')).body;
  assert.equal(s.pct, 55);
  assert.equal(s.stuck, true);
  assert.equal(s.stuckReason, 'no_progress');
  assert.match(s.stuckMessage, /^Oppdateringen står fast på Bygger \(4 min uten fremgang\)$/);
  assert.deepEqual(s.actions, ['retry', 'abort', 'log']);
  assert.equal(s.abortLabel, 'Avbryt og gå tilbake til 4.21');
  assert.equal(s.logs.container, 'homelab-updater');
  // OOM i loggen → Glimt-linje med årsak.
  writeFileSync(join(U, 'log.txt'), '#9 [deps 4/5] RUN npm ci\n#9 ERROR: exit code: 137\n');
  s = (await A('/api/system/update/status')).body;
  assert.equal(s.cause, 'oom');
  assert.equal(s.glimt, 'Serveren gikk tom for minne under bygging.');
  // Fremgang nå → ikke fast.
  status({ id: 'j1', state: 'building', step: 'Bygger ny versjon', startedAt: Date.now() - 60_000, progressAt: Date.now() - 5000 });
  writeFileSync(join(U, 'log.txt'), 'ok\n');
  assert.equal((await A('/api/system/update/status')).body.stuck, false);
  // Updateren er borte (hjerteslag 5 min gammelt) midt i bygget.
  hb(300);
  s = (await A('/api/system/update/status')).body;
  assert.deepEqual([s.stuck, s.stuckReason], [true, 'updater_down']);
  assert.match(s.stuckMessage, /updateren svarer ikke \(sist hørt for 5 min siden\)/);
  // «Avbryt» når updateren er borte: jobben merkes avbrutt her, status er ikke lenger «kjører».
  const ab = await A('/api/system/update/abort', 'POST', {});
  assert.equal(ab.status, 200, ab.text);
  assert.equal(ab.body.mode, 'abandoned');
  s = (await A('/api/system/update/status')).body;
  assert.deepEqual([s.state, s.running, s.code], ['failed', false, 'abandoned']);
  assert.ok(s.actions.includes('retry'));
});

test('oppdatering: Prøv igjen / Avbryt mens jobben kjører skriver bare {id, requestedBy, at, action}; Rydd og ressurser', async () => {
  hb();
  status({ id: 'j2', state: 'building', step: 'Bygger ny versjon', startedAt: Date.now(), progressAt: Date.now() });
  const r = await A('/api/system/update/retry', 'POST', { sha: 'f'.repeat(40), repo: 'evil/evil', command: 'rm -rf /' });
  assert.equal(r.status, 202, r.text);
  let rq = JSON.parse((await import('node:fs')).readFileSync(join(U, 'request.json'), 'utf8'));
  assert.deepEqual(Object.keys(rq).sort(), ['action', 'at', 'id', 'requestedBy']);
  assert.equal(rq.action, 'retry');
  // Kontrollforespørselen er ingen ny oppdatering i køen.
  assert.equal((await A('/api/system/update/status')).body.state, 'building');
  assert.equal((await A('/api/system/update/abort', 'POST', {})).status, 202);
  rq = JSON.parse((await import('node:fs')).readFileSync(join(U, 'request.json'), 'utf8'));
  assert.equal(rq.action, 'abort');
  assert.equal((await A('/api/system/update/prune', 'POST', {})).status, 409, 'ikke mens jobben kjører');
  status({ id: 'j2', state: 'failed', step: 'Feilet', code: 'low_disk', error: 'Lite plass' });
  (await import('node:fs')).rmSync(join(U, 'request.json'), { force: true });
  const s = (await A('/api/system/update/status')).body;
  assert.ok(s.actions.includes('prune'));
  const p = await A('/api/system/update/prune', 'POST', {});
  assert.equal(p.status, 202, p.text);
  rq = JSON.parse((await import('node:fs')).readFileSync(join(U, 'request.json'), 'utf8'));
  assert.deepEqual([rq.action, Object.keys(rq).length], ['prune', 4]);
  const res = (await A('/api/system/update/resources')).body;
  assert.ok(res.diskFreeMb > 0 && res.needDiskMb === 3072);
  assert.ok((await req('/api/version')).body.features.includes('update.watchdog'));
  (await import('node:fs')).rmSync(join(U, 'request.json'), { force: true });
  status({ id: 'j2', state: 'done', step: 'Ferdig' });
});

/* ---------------- URL-er: aldri Docker-IP ---------------- */

test('URL-er: /api/discovery og /api/me/server gir aldri 172.18.0.3; X-Forwarded-Host bare for kjente domener', async () => {
  kv.set(OWNER, 'server41', { local: ['http://172.18.0.3:3000'] });
  const d = (await req('/api/discovery')).body;
  assert.ok(!JSON.stringify(d).includes('172.18'), JSON.stringify(d));
  assert.equal(d.external, 'https://home.kristo.no');
  kv.set(OWNER, 'server41', {});
  assert.equal((await A('/api/me/server', 'PUT', { local: 'http://172.18.0.3:3000' })).status, 400);
  assert.equal(pu.isInternalIp46('172.18.0.3:3000'), true);
  assert.equal(pu.isInternalIp46('192.168.1.20'), false);
  const fake = (h) => ({ req: { url: 'http://172.18.0.3:3000/x', header: (n) => h[n.toLowerCase()] } });
  delete process.env.PUBLIC_URL;
  assert.equal(pu.originOf46(fake({ 'x-forwarded-host': 'evil.example', host: '172.18.0.3:3000' })), '');
  process.env.APP_DOMAINS = 'home.kristo.no';
  assert.equal(pu.originOf46(fake({ 'x-forwarded-host': 'home.kristo.no', 'x-forwarded-proto': 'https', host: '172.18.0.3:3000' })), 'https://home.kristo.no');
  assert.equal(pu.originOf46(fake({ host: '192.168.1.20:3000' })), 'http://192.168.1.20:3000');
  process.env.PUBLIC_URL = 'https://home.kristo.no';
  delete process.env.APP_DOMAINS;
  assert.deepEqual(pu.lanUrls46(), [], 'inne i Docker: ingen grensesnitt-adresser');
});

/* ---------------- QR-innlogging ---------------- */

async function qrSession(app_, platform = 'mac') {
  const r = await req('/api/auth/qr/session', { method: 'POST', headers: { 'user-agent': 'KalenderMac/4.38' }, body: { app: app_, platform, device: 'MacBook' } });
  assert.equal(r.status, 201, r.text);
  return r.body;
}
const poll = (s) => req(`/api/auth/qr/session/${s.sessionId}`, { headers: { 'x-qr-key': s.clientKey, 'user-agent': 'KalenderMac/4.38' } });

test('QR: papir://-kode uten token, egen enhetsøkt for den nye enheten, én gang, utløp og avvisning', async () => {
  const s = await qrSession('kalender');
  assert.match(s.qr, /^papir:\/\/login\?s=[\w-]+&c=[\w-]+&srv=https%3A%2F%2Fhome\.kristo\.no$/);
  assert.equal(s.ttl, 120);
  assert.ok(!s.qr.includes('fh_') && !s.qr.includes(s.clientKey));
  assert.equal((await poll(s)).body.state, 'pending');
  assert.equal((await req(`/api/auth/qr/session/${s.sessionId}`)).status, 403, 'polling krever nøkkelen');
  const sc = await T('/api/auth/qr/scan', 'POST', { code: s.qr });
  assert.equal(sc.status, 200, sc.text);
  assert.deepEqual([sc.body.app, sc.body.platform, sc.body.deviceName], ['kalender', 'mac', 'MacBook']);
  assert.equal((await T('/api/auth/qr/approve', 'POST', { sid: s.sessionId, approve: true })).status, 400, 'biometri kreves');
  assert.equal((await T('/api/auth/qr/approve', 'POST', { sid: s.sessionId, approve: true, biometric: true })).status, 200);
  const done = (await poll(s)).body;
  assert.equal(done.state, 'done');
  assert.match(done.token, /^fh_/);
  assert.notEqual(done.token, tokFin, 'ikke en kopi av skannerens token');
  assert.ok(done.refresh);
  const again = (await poll(s)).body;
  assert.equal(again.token, undefined, 'tokenet gis bare én gang');
  assert.equal((await T('/api/auth/qr/scan', 'POST', { code: s.qr })).status, 409, 'koden kan brukes én gang');
  // Den nye enheten står under Enheter (companion-token for Kalender).
  assert.ok((await T('/api/tokens/companion')).body.tokens.some((t) => /MacBook/.test(t.device ?? t.name)));
  // Avvis.
  const s2 = await qrSession('finans', 'android');
  assert.equal((await T('/api/auth/qr/approve', 'POST', { sessionId: s2.sessionId, code: s2.code, approve: false })).status, 200);
  assert.equal((await poll(s2)).body.state, 'denied');
  assert.equal((await T('/api/auth/qr/scan', 'POST', { code: 'papir://login?s=AAAAAAAAAAAAAAAAAAAAAA&c=BBBBBBBBBBBBBBBBBBBBBBBB' })).status, 404);
});

test('QR: Kalender-token kan bare godkjenne Kalender-økter (Finans-økt og web → 403); Finans-token kan begge; scope aldri bredere', async () => {
  const comp = await T('/api/tokens/companion', 'POST', { app: 'kalender', device: 'Pixel Kalender' });
  assert.equal(comp.status, 201, comp.text);
  const K = as({ authorization: `Bearer ${comp.body.token}` });
  // Kalender → Finans-økt: 403 (både scan og approve med {sessionId, code}).
  const fin = await qrSession('finans', 'ios');
  let r = await K('/api/auth/qr/scan', 'POST', { code: fin.qr });
  assert.equal(r.status, 403, r.text);
  assert.equal(r.body.code, 'SCANNER_SCOPE');
  r = await K('/api/auth/qr/approve', 'POST', { sessionId: fin.sessionId, code: fin.code, approve: true, biometric: true });
  assert.equal(r.status, 403, r.text);
  assert.equal((await poll(fin)).body.state, 'pending', 'urørt');
  // Kalender → web-innlogging (gamle /api/auth/qr): 403.
  const web = (await req('/api/auth/qr', { method: 'POST' })).body;
  assert.equal((await K('/api/auth/qr/scan', 'POST', { code: web.code })).status, 403);
  // Kalender → Kalender-økt: OK, med scopes ≤ skannerens.
  const kal = await qrSession('kalender', 'android');
  r = await K('/api/auth/qr/approve', 'POST', { sessionId: kal.sessionId, code: kal.code, approve: true, biometric: true });
  assert.equal(r.status, 200, r.text);
  const d = (await poll(kal)).body;
  assert.equal(d.state, 'done');
  assert.ok(d.scopes.every((x) => comp.body.scopes.includes(x)));
  // Finans → Finans-økt og web: OK.
  r = await T('/api/auth/qr/approve', 'POST', { sessionId: fin.sessionId, code: fin.code, approve: true, biometric: true });
  assert.equal(r.status, 200, r.text);
  assert.equal((await poll(fin)).body.app, 'finans');
  assert.equal((await T('/api/auth/qr/scan', 'POST', { code: web.code })).status, 200);
});

/* ---------------- Media «Utlogget» ---------------- */

test('Media: ukjent sti med gyldig app-token → 404 (ikke 401); uten/ugyldig innlogging → 401 HOMELAB_AUTH; diag logger kallene', async () => {
  let r = await T('/api/media/qbit/torrents');
  assert.equal(r.status, 404, r.text);
  assert.equal(r.body.code, 'NOT_FOUND');
  assert.equal((await T('/api/finnes-ikke')).status, 404);
  r = await T('/api/state');
  assert.deepEqual([r.status, r.body.code], [401, 'SESSION_REQUIRED']);
  r = await req('/api/media/qbit/torrents');
  assert.deepEqual([r.status, r.body.code], [401, 'HOMELAB_AUTH']);
  r = await req('/api/media/series', { headers: { authorization: 'Bearer fh_ugyldigugyldigugyldigugyldig' } });
  assert.deepEqual([r.status, r.body.code], [401, 'HOMELAB_AUTH']);
  assert.equal((await T('/api/media/upcoming')).status, 200);
  assert.equal((await A('/api/media/qbit/torrents')).status, 404, 'web som før');
  const dg = (await T('/api/media/diag')).body;
  assert.ok(dg.calls.some((x) => x.path === '/api/media/qbit/torrents' && x.status === 404 && x.auth === 'bearer'));
});

test('Media: plakat-URL-er signeres for brukeren og lastes uten header; feil/utløpt signatur avvises', async () => {
  const u = aa.signImageUrl46('/api/media/cover?svc=sonarr&path=%2FMediaCover%2F1%2Fposter.jpg', 'owner');
  assert.match(u, /&uid=owner&exp=\d+&sig=[\w-]{32}$/);
  const fake = (url) => ({ req: { method: 'GET', path: new URL(url, 'http://x').pathname, url: `http://x${url}` } });
  assert.equal(aa.signedImageUser46(fake(u)), 'owner');
  assert.equal(aa.signedImageUser46(fake(u.replace('poster.jpg', 'annet.jpg'))), null);
  assert.equal(aa.signedImageUser46(fake(u.replace(/sig=[\w-]+$/, 'sig=' + 'a'.repeat(32)))), null);
  assert.equal(aa.signedImageUser46({ req: { method: 'POST', path: '/api/media/cover', url: `http://x${u}` } }), null);
  const r = await req(u);
  assert.notEqual(r.status, 401, 'signaturen godtas uten header');
  assert.equal((await req('/api/media/cover?svc=sonarr&path=%2FMediaCover%2F1%2Fposter.jpg')).status, 401);
});

/* ---------------- Claude-minner (Markdown) ---------------- */

const MD = {
  'claude-memory-2026-10-21/areas/finanshub.md': '# FinansHub\n\nSebastians økonomiapp.\n\n## Stack\n- Node 22 + Hono\n- SwiftUI\n  - Widgets\n\n## Lenker\n- [Repo](https://github.com/x/y)\n\n```bash\ndocker compose up -d\n```\n',
  'claude-memory-2026-10-21/areas/arild-kristo-estate.md': '- Skifte pågår\n- Advokat: Hansen\n',
  'claude-memory-2026-10-21/areas/homelab-networking.md': '# Homelab networking\n\nVLAN 20 for IoT.\n',
};
test('Claude-import: minne-ZIP (claude-memory-*/areas/*.md) → områder, ingen duplikater ved ny import, og samtaler + minner i én ZIP', async () => {
  const f = new File([zip(MD)], 'claude-memory-2026-10-21.zip', { type: 'application/zip' });
  let r = await multipart('/api/ai/import', [['file', f]], { cookie: ck });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.kind, 'memory');
  assert.equal(r.body.summary, 'Claude-minner · 3 områder · 21. okt. 2026');
  assert.equal(r.body.button, 'Importer 3 områder');
  const titles = r.body.areas.map((a) => a.title).sort();
  assert.deepEqual(titles, ['Arild Kristo Estate', 'FinansHub', 'Homelab networking']);
  assert.equal(r.body.areas.find((a) => a.title === 'FinansHub').category, 'areas');
  let c = await A(`/api/ai/import/${r.body.importId}/commit`, 'POST', {});
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.text, 'Glimt husker nå 3 områder fra Claude');
  assert.equal(c.body.link.label, 'Se minnene');
  const items = (await A('/api/ai/memory?src=claude-memory')).body.items;
  assert.ok(items.some((x) => x.text === 'FinansHub: Stack: SwiftUI – Widgets'));
  assert.ok(items.some((x) => x.text.includes('[Repo](https://github.com/x/y)')));
  assert.ok(items.some((x) => x.text.includes('```bash\ndocker compose up -d\n```')), 'kodeblokken beholdes');
  const n = items.length;
  // Samme eksport på nytt → ingen kopier.
  r = await multipart('/api/ai/import', [['file', f]], { cookie: ck });
  assert.ok(r.body.areas.every((a) => a.exists && !a.changed));
  c = await A(`/api/ai/import/${r.body.importId}/commit`, 'POST', {});
  assert.deepEqual([c.body.areaAdded, c.body.areaKept], [0, n]);
  assert.equal((await A('/api/ai/memory?src=claude-memory')).body.items.length, n);
  // Endret fil oppdaterer området (ett punkt borte, ett nytt).
  const f2 = new File([zip({ ...MD, 'claude-memory-2026-10-21/areas/arild-kristo-estate.md': '- Skifte pågår\n- Megler: Nordvik\n' })], 'm.zip');
  r = await multipart('/api/ai/import', [['file', f2]], { cookie: ck });
  c = await A(`/api/ai/import/${r.body.importId}/commit`, 'POST', {});
  assert.deepEqual([c.body.areaAdded, c.body.areaRemoved], [1, 1]);
  assert.equal((await A('/api/ai/memory/areas')).body.count, 3);
  // Samtaler + minner i én ZIP → begge.
  const both = new File([zip({ 'conversations.json': JSON.stringify([{ uuid: 'c46-1', name: 'Test', chat_messages: [{ sender: 'human', text: 'Hei' }, { sender: 'assistant', text: 'Hallo' }] }]), 'claude-memory-2026-10-21/people/ola.md': '# Ola\n- Bror\n' })], 'both.zip');
  r = await multipart('/api/ai/import', [['file', both]], { cookie: ck });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.kind, 'both');
  assert.deepEqual(r.body.tabs.map((t) => t.label), ['Samtaler (1)', 'Minner (1)']);
  assert.equal(r.body.areas[0].category, 'people');
});

test('Claude-import: mappe dratt inn (flere filer med sti), én .md, og tydelig feil når ingenting kjennes igjen', async () => {
  const files = Object.entries(MD).map(([p, t]) => ['files', new File([t], p, { type: 'text/markdown' })]);
  let r = await multipart('/api/ai/import', files, { cookie: ck });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.areaCount, 3);
  r = await multipart('/api/ai/import', [['file', new File(['# Notat\n- Ett punkt\n'], 'notat.md')]], { cookie: ck });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.areas[0].title, 'Notat');
  r = await multipart('/api/ai/import', [['file', new File([zip({ 'a/readme.txt': 'x', 'b.md': '' })], 'x.zip')]], { cookie: ck });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /^Fant 1 Markdown-filer, men ingen samtaler eller minner Glimt kjenner igjen\.$/);
  assert.equal(mem.parseMemoryMd46('x/areas/blomsterkasser.md', '- a\n').title, 'Blomsterkasser');
});

/* ---------------- Studie: vitnemål som tabeller ---------------- */

const UIO = [
  { x: 56, y: 60, t: 'Universitetet i Oslo', size: 14 }, { x: 56, y: 80, t: 'Karakterutskrift', size: 12 }, { x: 56, y: 100, t: 'Navn: Sebastian Kristo' }, { x: 400, y: 100, t: 'Dato: 20.06.2026' },
  ...row(150, [[56, 'Emnekode'], [130, 'Emnenavn'], [370, 'Semester'], [440, 'Karakter'], [500, 'Studiepoeng']]),
  ...row(166, [[56, 'IN1000'], [130, 'Introduksjon til objektorientert'], [370, '2025 HØST'], [450, 'B'], [520, '10']]),
  ...row(177, [[130, 'programmering']]),
  ...row(190, [[56, 'IN1150'], [130, 'Logiske metoder'], [370, '2025 HØST'], [450, 'C'], [520, '10']]),
  ...row(204, [[56, 'MAT1100'], [130, 'Kalkulus'], [370, '2025 HØST'], [450, 'D'], [520, '10']]),
  ...row(218, [[56, 'IN1010'], [130, 'Objektorientert programmering'], [370, '2026 VÅR'], [450, 'A'], [520, '10']]),
  ...row(232, [[56, 'IN1030'], [130, 'Systemer, krav og konsekvenser'], [370, '2026 VÅR'], [440, 'Bestått'], [520, '10']]),
  ...row(246, [[56, 'EXPHIL03'], [130, 'Examen philosophicum'], [370, '2026 VÅR'], [450, 'B'], [518, '7,5']]),
  ...row(266, [[56, 'Sum studiepoeng'], [518, '57,5']]),
];
const NTNU = [
  { x: 40, y: 50, t: 'NTNU - Norges teknisk-naturvitenskapelige universitet', size: 12 }, { x: 40, y: 70, t: 'Karakterutskrift' },
  ...row(110, [[40, 'Emne'], [250, 'Termin'], [320, 'Resultat'], [400, 'Sp']]),
  ...row(124, [[40, 'TDT4100 Objektorientert programmering'], [250, 'VÅR 2022'], [335, 'B'], [400, '7,5']]),
  ...row(136, [[40, 'TMA4100 Matematikk 1'], [250, 'HØST 2021'], [335, 'C'], [400, '7,5']]),
  ...row(148, [[40, 'TTM4100 Kommunikasjon - Tjenester og nett'], [250, 'VÅR 2022'], [335, 'Q'], [400, '7,5']]),
];
const VGS = [
  { x: 56, y: 60, t: 'Vitnemål for videregående opplæring', size: 13 }, { x: 56, y: 80, t: 'Oslo katedralskole' },
  ...row(130, [[56, 'Fag'], [260, 'Fagkode'], [330, 'Årstimer'], [390, 'Standpunkt'], [460, 'Eksamen'], [520, 'Eksamen']]),
  ...row(141, [[460, 'skriftlig'], [520, 'muntlig']]),
  ...row(158, [[56, 'Fellesfag']]),
  ...row(172, [[56, 'Norsk hovedmål, skriftlig'], [260, 'NOR1211'], [335, '393'], [405, '4'], [470, '4']]),
  ...row(184, [[56, 'Norsk, muntlig'], [260, 'NOR1213'], [405, '5'], [530, '5']]),
  ...row(196, [[56, 'Matematikk R2'], [260, 'REA3024'], [335, '140'], [405, '5'], [470, '6']]),
  ...row(208, [[56, 'Fysikk 2'], [260, 'REA3005'], [335, '140'], [405, '6']]),
  ...row(226, [[56, 'Programfag']]),
  ...row(240, [[56, 'Kjemi 1'], [260, 'REA3011'], [335, '140'], [405, '5']]),
];

test('Studie: FS-utskrift (UiO) med tekstlag → alle emner fra kolonnene, ingen AI, sum mot totalen, bbox per rad', { skip: !hasPdftotext && 'trenger pdftotext' }, async () => {
  const r = await st46.readStudy46(makePdf(UIO), 'application/pdf', { name: 'uio.pdf' });
  assert.equal(r.method, 'regler');
  assert.equal(r.emner.length, 6);
  assert.deepEqual(r.emner[0], { ...r.emner[0], kode: 'IN1000', navn: 'Introduksjon til objektorientert programmering', sp: 10, karakter: 'B', semester: 'Høst 2025' });
  assert.equal(r.emner[5].sp, 7.5);
  assert.equal(r.emner[4].karakter, 'Bestått');
  assert.deepEqual([r.validation.sum, r.validation.total, r.validation.ok], [57.5, 57.5, true]);
  assert.ok(r.emner.every((e) => e.bbox.page === 1 && e.bbox.x0 >= 0 && e.bbox.y1 <= 1));
  assert.ok(r.emner.every((e) => !e.check));
});

test('Studie: NTNU (kode+navn i én kolonne, «VÅR 2022») og ugyldig karakter → «Sjekk»', { skip: !hasPdftotext && 'trenger pdftotext' }, async () => {
  const r = await st46.readStudy46(makePdf(NTNU), 'application/pdf', { name: 'ntnu.pdf' });
  assert.equal(r.emner.length, 3);
  assert.deepEqual([r.emner[0].kode, r.emner[0].navn, r.emner[0].semester, r.emner[0].sp], ['TDT4100', 'Objektorientert programmering', 'Vår 2022', 7.5]);
  assert.equal(r.emner[2].check, true);
  assert.match(r.emner[2].checkReason, /Ukjent karakter «Q»/);
});

test('Studie: vgs-vitnemål – årstimer er ikke studiepoeng, standpunkt + eksamen, seksjoner, snitt av alle tallkarakterer', { skip: !hasPdftotext && 'trenger pdftotext' }, async () => {
  const r = await st46.readStudy46(makePdf(VGS), 'application/pdf', { name: 'vgs.pdf' });
  assert.equal(r.format, 'vgs');
  assert.equal(r.emner.length, 5);
  const no = r.emner[0];
  assert.deepEqual([no.navn, no.kode, no.timer, no.sp, no.standpunkt, no.eksamen, no.section], ['Norsk hovedmål, skriftlig', 'NOR1211', 393, null, '4', '4', 'Fellesfag']);
  assert.equal(r.emner[1].eksamenMuntlig, '5');
  assert.equal(r.emner[4].section, 'Programfag');
  const avg = st46.vgsAverage46(r.emner);
  assert.deepEqual([avg.count, avg.value, avg.points], [8, 5, 50]);
});

test('Studie: opplasting bruker tabell-leseren (metode logges), og tabellen kan redigeres – koden regner snittet på nytt', { skip: !hasPdftotext && 'trenger pdftotext' }, async () => {
  const r = await multipart('/api/study/documents', [['file', new File([makePdf(UIO)], 'uio.pdf', { type: 'application/pdf' })]], { cookie: ck });
  assert.equal(r.status, 201, r.text);
  const d = r.body.doc;
  assert.equal(d.method, 'regler');
  assert.equal(d.emner.length, 6);
  assert.equal(d.snitt.letter, 'B');
  assert.equal(d.snitt.value, 3.58);
  assert.equal(d.sp, 57.5);
  assert.equal(d.edit.path, `/api/study/documents/${d.id}/courses`);
  const emner = d.emner.map((e) => (e.kode === 'MAT1100' ? { ...e, karakter: 'A' } : e));
  emner.push({ kode: 'IN2010', navn: 'Algoritmer og datastrukturer', sp: 10, karakter: 'X' });
  const e = await A(d.edit.path, 'PUT', { emner });
  assert.equal(e.status, 200, e.text);
  assert.equal(e.body.doc.emner.length, 7);
  assert.equal(e.body.doc.checks, 1);
  assert.match(e.body.doc.statusText, /1 må sjekkes/);
  assert.equal(e.body.doc.snitt.value, 4.21, 'snittet regnes av koden (D → A)');
});

/* ---------------- Nyheter ---------------- */

test('Nyheter: egne kategorier (unikt navn, nøkkelord, egen fane og kildevalg), slett setter kilder til Auto', async () => {
  await A('/api/rss');
  let r = await A('/api/rss/categories', 'POST', { name: 'Bodø/Glimt', keywords: 'Glimt, Aspmyra' });
  assert.equal(r.status, 201, r.text);
  const id = r.body.category.id;
  assert.equal(r.body.category.icon, 'lucide:tag');
  assert.equal((await A('/api/rss/categories', 'POST', { name: 'bodø/glimt' })).status, 409);
  assert.equal((await A('/api/rss/categories', 'POST', { name: 'Sport' })).status, 409);
  assert.equal((await A('/api/rss/categories', 'POST', { name: '' })).status, 400);
  const cats = (await A('/api/rss/categories')).body;
  assert.deepEqual(cats.tabs.slice(0, 2).map((t) => t.id), ['siste', 'for-deg']);
  assert.ok(cats.tabs.some((t) => t.id === id && t.kind === 'custom'));
  assert.deepEqual(cats.options[0], { id: 'auto', name: '✦ Auto' });
  assert.ok(cats.options.some((o) => o.id === id));
  const feeds = (await A('/api/rss')).body.feeds;
  assert.equal((await A(`/api/rss/feeds/${feeds[0].id}`, 'PATCH', { category: id })).status, 200, 'egen kategori som kildevalg');
  assert.ok((await A(`/api/rss?cat=${id}`)).status === 200);
  assert.ok(feeds.every((f) => f.domain && f.favicon?.startsWith('/api/rss/favicon?domain=')));
  assert.equal(feeds.find((f) => /vg\.no/.test(f.url)).domain, 'vg.no');
  r = await A(`/api/rss/categories/${id}`, 'DELETE');
  assert.equal(r.body.movedFeeds, 1);
  assert.equal((await A('/api/rss')).body.feeds.find((f) => f.id === feeds[0].id).category, 'auto');
  assert.equal(news.inCustom46({ title: 'Glimt vant igjen' }, { id: 'x', keywords: ['Glimt'] }), true);
  assert.equal(news.inCustom46({ title: 'Glimtrende' }, { id: 'x', keywords: ['Glimt'] }), false);
});

test('Nyheter: «For deg» etter interesser og lesehistorikk, forslag; sammendrag per kategori (cache, < 3 saker skjules)', async () => {
  const items = (await A('/api/rss?limit=60')).body.items;
  assert.ok(items.length >= 3);
  const word = items[0].title.split(/\s+/).find((w) => w.length > 4).replace(/[^\p{L}\d]/gu, '');
  assert.equal((await A('/api/rss/interests', 'POST', { word })).status, 201);
  const fy = (await A('/api/rss/foryou')).body;
  assert.ok(fy.items.length >= 1 && fy.items.length <= 30);
  assert.ok(fy.items[0].matched.includes(word));
  assert.equal((await A('/api/rss/read', 'POST', { id: items[0].id, ms: 90_000 })).status, 200);
  assert.ok(Array.isArray((await A('/api/rss/interests')).body.suggestions));
  news._setNewsSummaryLlm46(async (_p, list) => ({ points: list.slice(0, 3).map((x) => ({ text: `Kort om ${x.title}`, ref: x.id })) }));
  let s = (await A('/api/rss/summary?cat=siste&wait=1')).body;
  assert.equal(s.hidden, false);
  assert.equal(s.engine, 'glimt');
  assert.equal(s.points.length, 3);
  assert.ok(s.points.every((p) => p.url !== undefined && p.ref));
  assert.match(s.updatedText, /^oppdatert kl\. \d{2}:\d{2}$/);
  s = (await A('/api/rss/summary?cat=siste')).body;
  assert.deepEqual([s.stale, s.generating], [false, false], 'cachet');
  const few = await news.summaryFor46('owner', 'x', items.slice(0, 2));
  assert.deepEqual([few.hidden, few.reason], [true, 'few']);
  assert.equal((await A('/api/rss/summary?cat=finnes-ikke')).status, 400);
  await A('/api/rss/settings', 'PUT', { catSummary: false });
  assert.equal((await A('/api/rss/summary?cat=norge')).body.hidden, true);
  const st = (await A('/api/rss/settings')).body;
  assert.equal(st.settings.catSummary, false);
  assert.ok(st.feeds.length && st.categories.tabs.length);
  news._setNewsSummaryLlm46(null);
});

test('Nyheter: favicon – største <link rel=icon> ≥ 64 px, domenet uten www./rss./feed., bare kjente domener, cache', async () => {
  assert.equal(news.feedDomain46('https://www.vg.no/rss/feed'), 'vg.no');
  assert.equal(news.feedDomain46('https://rss.nytimes.com/services/xml'), 'nytimes.com');
  const links = news.iconLinks46('<link rel="icon" href="/f16.png" sizes="16x16"><link rel="apple-touch-icon" href="/apple.png" sizes="180x180"><link rel="icon" type="image/svg+xml" href="/logo.svg">', 'https://vg.no/');
  assert.equal(links[0].url, 'https://vg.no/logo.svg');
  assert.equal(links[1].url, 'https://vg.no/apple.png');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100)]);
  const seen = [];
  news._setIconFetch46(async (url) => { seen.push(url); const ok = url === 'https://e24.no/' || url === 'https://e24.no/i.png';
    return { ok, status: ok ? 200 : 404, headers: { get: (n) => (n === 'content-type' ? (url.endsWith('.png') ? 'image/png' : 'text/html') : null) }, arrayBuffer: async () => (url.endsWith('.png') ? png : Buffer.from('<link rel="icon" href="/i.png" sizes="96x96">')) }; });
  let r = await req('/api/rss/favicon?domain=e24.no');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get('content-type'), 'image/png');
  const n = seen.length;
  r = await req('/api/rss/favicon?domain=e24.no');
  assert.equal(seen.length, n, 'fra cachen');
  assert.equal((await req('/api/rss/favicon?domain=evil.example')).status, 404, 'bare domener fra kildelistene');
  news._setIconFetch46(null);
});

/* ---------------- Subscription-logg og prøveperioder ---------------- */

test('Subscription: logg over fakturaer og prøveperioder (gruppert per måned, filter, CSV), ingenting slettes ved oppsigelse', async () => {
  const s0 = (await T('/finans/api/subscriptions')).body;
  const sub = s0.items.find((x) => x.active) ?? s0.items[0];
  assert.ok(sub, 'demo-abonnementer');
  // Belastninger og prøveperioder.
  const { db: fdb } = await import('../server/finans/db.js');
  const d1 = new Date(Date.now() - 40 * 86400_000).toLocaleDateString('sv-SE'), d2 = new Date(Date.now() - 10 * 86400_000).toLocaleDateString('sv-SE');
  for (const [d, a] of [[d1, -14900], [d2, -14900]]) fdb.prepare('INSERT INTO fh_transactions(date, amount, description, merchant, source, created, user_id) VALUES(?,?,?,?,?,?,?)').run(d, a, `${sub.name} abonnement`, sub.name, 'csv', Date.now(), 'owner');
  const tr = await T('/finans/api/subscriptions/trials', 'POST', { service: 'Adobe', endsAt: new Date(Date.now() + 5 * 86400_000).toLocaleDateString('sv-SE'), priceAfter: 149 });
  assert.equal(tr.status, 201, tr.text);
  const tr2 = await T('/finans/api/subscriptions/trials', 'POST', { service: 'Max', endsAt: new Date(Date.now() + 9 * 86400_000).toLocaleDateString('sv-SE'), priceAfter: 99 });
  assert.equal((await T(`/finans/api/subscriptions/trials/${tr2.body.id}`, 'PATCH', { status: 'cancelled' })).status, 200);
  let l = (await T('/finans/api/subscriptions/log')).body;
  assert.match(l.summary.text, /^\d+ fakturaer? · 2 prøveperioder · .+ kr betalt siste 12 mnd$/);
  assert.ok(l.months.length >= 1 && l.months.length <= 3);
  const all = l.months.flatMap((m) => m.items);
  const ch = all.find((x) => x.type === 'charge' && x.service === sub.name);
  assert.match(ch.desc, /^Faktura · \d+\. /);
  assert.equal(ch.amountText, '−149 kr');
  const saved = all.find((x) => x.type === 'trial_cancelled');
  assert.deepEqual([saved.badge, saved.amountText, saved.tone], ['PRØVE', 'Spart 99 kr', 'saved']);
  assert.ok(all.some((x) => x.type === 'trial_start' && x.amountText === '0 kr'));
  l = (await T('/finans/api/subscriptions/log?filter=trials')).body;
  assert.ok(l.months.flatMap((m) => m.items).every((x) => x.trial));
  const csv = await T('/finans/api/subscriptions/log.csv?filter=charges');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.text.startsWith('﻿Dato;Tjeneste;Type;Beløp\r\n'));
  assert.match(csv.text, /;Faktura;-149,00\r\n/);
  // Idempotent: samme logg ved ny lesing.
  const n1 = (await T('/finans/api/subscriptions/log?months=24')).body.months.flatMap((m) => m.items).length;
  assert.equal((await T('/finans/api/subscriptions/log?months=24')).body.months.flatMap((m) => m.items).length, n1);
  // Glimt-hjelperne.
  const sl = await import('../server/subs-log46.js');
  assert.ok(sl.subsLog46('owner', { service: sub.name, types: ['charge'] }).length >= 2);
  assert.deepEqual([sl.trialSavings46('owner').count, sl.trialSavings46('owner').saved], [1, 99]);
});

test('Prøveperioder: trialsVisible bare med aktive (sluttdato i dag eller senere)', async () => {
  const s = (await T('/finans/api/subscriptions')).body;
  assert.equal(s.trialsVisible.visible, true);
  assert.equal(s.trialsVisible.editHint, 'Vises når du har en aktiv prøveperiode');
  db.prepare("UPDATE trials SET status='cancelled' WHERE user_id='owner'").run();
  assert.equal((await T('/finans/api/subscriptions')).body.trialsVisible.visible, false);
});

test('QR (gammel flyt, Kalender iOS/Mac): {app:"kalender"} kan godkjennes av Kalender-token; /finish gir bare et Kalender-token', async () => {
  const comp = await T('/api/tokens/companion', 'POST', { app: 'kalender', device: 'iPhone Kalender' });
  const K = as({ authorization: `Bearer ${comp.body.token}` });
  const q = (await req('/api/auth/qr', { method: 'POST', body: { app: 'kalender' } })).body;
  assert.equal((await K('/api/auth/qr/scan', 'POST', { code: q.code })).status, 200);
  assert.equal((await K('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: true, biometric: true })).status, 200);
  let f = await req('/api/auth/qr/finish', { method: 'POST', headers: { 'x-qr-key': q.clientKey }, body: { sid: q.sid, app: 'finans' } });
  assert.deepEqual([f.status, f.body.code], [403, 'SCANNER_SCOPE']);
  f = await req('/api/auth/qr/finish', { method: 'POST', headers: { 'x-qr-key': q.clientKey }, body: { sid: q.sid } });
  assert.equal(f.status, 200, f.text);
  assert.deepEqual([f.body.app, typeof f.body.token], ['kalender', 'string']);
  assert.ok(!(f.headers.getSetCookie?.() ?? []).some((x) => x.startsWith('hl_sid=')), 'ingen nettleserøkt');
  // Finans-skanner + gammel flyt + app:'finans' → eget Finans-token.
  const q2 = (await req('/api/auth/qr', { method: 'POST', body: { app: 'finans' } })).body;
  await T('/api/auth/qr/scan', 'POST', { code: q2.code });
  await T('/api/auth/qr/approve', 'POST', { sid: q2.sid, approve: true, biometric: true });
  f = await req('/api/auth/qr/finish', { method: 'POST', headers: { 'x-qr-key': q2.clientKey }, body: { sid: q2.sid, app: 'finans' } });
  assert.equal(f.status, 200, f.text);
  assert.equal(f.body.app, 'finans');
});

test('«Min posisjon»: Hjem-været og briefen bruker enhetens posisjon (?lat&lon&name), gps=0 slår av; gphoto er et gyldig fotovindu', async () => {
  const here = await import('../server/here46.js');
  here._setHereWeather46(async ({ lat, lon }) => ({ temp: 13, symbol: 'clearsky_day', place: 'X', lat, lon, hi: 14, lo: 8 }));
  let h = (await T('/api/mobile/home?lat=60.39&lon=5.32&name=Bergen')).body;
  assert.deepEqual([h.weather.place, h.weather.temp, h.weather.lat], ['Bergen', 13, 60.39]);
  assert.equal(here.here46('owner').name, 'Bergen', 'lagret for briefen');
  const b = (await T('/api/brief')).body;
  assert.equal(b.weather?.place ?? 'Bergen', 'Bergen');
  h = (await T('/api/mobile/home?gps=0')).body;
  assert.notEqual(h.weather.place, 'Bergen');
  assert.equal(here.here46('owner'), null);
  here._setHereWeather46(null);
  assert.equal((await T('/api/photo-window?kind=gphoto')).status, 200);
});

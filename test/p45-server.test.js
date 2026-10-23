// Prompt 45 (SERVER45): Docker-oppsett, Search Console, Studie (vitnemål), AI-import (Claude/ChatGPT/Gemini), Media (uovervåkede, avspilling),
// sonevarsler, HA-helse (bare mobile_app), Ruter antall, Vær min posisjon, Gjøremål-synkraden, Innstillinger samlet og «bare systemvarsel».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p45-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-45s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4251';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DOCKER_HOST;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const logs = await import('../server/logs44.js');
const upd = await import('../server/system-update.js');
const dg = await import('../server/domains-glimt.js');
const gsc45 = await import('../server/gsc45.js');
const st45 = await import('../server/study45.js');
const st44 = await import('../server/study44.js');
const ai45 = await import('../server/ai-import45.js');
const zone = await import('../server/zone45.js');
const h45 = await import('../server/health45.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
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
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const multipart = async (path, fields, headers) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v instanceof Blob ? v : String(v), v instanceof File ? v.name : undefined); const r = await app.request(path, { method: 'POST', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers }, body: fd }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, body: j, text: t }; };

/** Enkel ZIP-skriver (deflate) for testene. */
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

/* ---------------- Docker ---------------- */

test('Docker: proxyen homelab-docker er standard, DOCKER_HOST overstyrer, updaterens gjenbrukte proxy brukes', () => {
  logs._resetDockerTarget45();
  assert.equal(logs.dockerTarget45().host, 'homelab-docker');
  assert.equal(logs.dockerTarget45().port, 2375);
  mkdirSync(upd._paths.UPD, { recursive: true });
  writeFileSync(join(upd._paths.UPD, 'docker.json'), JSON.stringify({ state: 'done', proxy: { name: 'min-proxy', image: 'tecnativa/docker-socket-proxy:0.3.0', reused: true } }));
  logs._resetDockerTarget45();
  assert.equal(logs.dockerTarget45().host, 'min-proxy');
  assert.equal(logs.dockerTarget45().source, 'updater');
  writeFileSync(join(upd._paths.UPD, 'docker.json'), JSON.stringify({ state: 'done', proxy: { name: '../../etc;rm', image: 'x' } }));
  logs._resetDockerTarget45();
  assert.equal(logs.dockerTarget45().host, 'homelab-docker', 'ugyldig navn ignoreres');
  process.env.DOCKER_HOST = 'tcp://docker-socket-proxy:2375';
  assert.equal(logs.dockerTarget45().host, 'docker-socket-proxy');
  delete process.env.DOCKER_HOST;
});

test('Docker: tomtilstand med auto-oppsett, «Sett opp nå» skriver bare {id, requestedBy, at, action}', async () => {
  const { rmSync } = await import('node:fs'); rmSync(join(upd._paths.UPD, 'docker.json'), { force: true });
  logs._setDocker44(() => { throw Object.assign(new Error('Fikk ikke kontakt med Docker (proxyen homelab-docker:2375 svarer ikke)'), { status: 503 }); });
  try {
    let r = await A('/api/system/containers');
    assert.equal(r.status, 200);
    assert.equal(r.body.available, false);
    assert.equal(r.body.setup.auto, true);
    assert.equal(r.body.setup.title, 'Får ikke tilgang til Docker');
    assert.equal(r.body.setup.button, 'Sett opp nå');
    assert.match(r.body.setup.details, /svarer ikke/);
    assert.equal(r.body.setup.state, 'no-updater');
    r = await A('/api/system/logs');
    assert.equal(r.body.setup?.auto, true);
    // Ingen updater → 409
    r = await A('/api/system/docker/setup', 'POST', {});
    assert.equal(r.status, 409);
    assert.equal(r.body.state, 'no-updater');
    // Ikke-admin → 403
    assert.equal((await I('/api/system/docker/setup', 'POST', {})).status, 403);
    assert.equal((await I('/api/system/docker/setup')).status, 403);
    // Updateren lever → 202, og forespørselen har ingen compose, kommando, image eller navn.
    writeFileSync(join(upd._paths.UPD, 'heartbeat'), String(Math.floor(Date.now() / 1000)));
    r = await A('/api/system/docker/setup', 'POST', { compose: 'evil', image: 'alpine', cmd: 'rm -rf /' });
    assert.equal(r.status, 202, r.text);
    const rq = JSON.parse(readFileSync(join(upd._paths.UPD, 'request.json'), 'utf8'));
    assert.deepEqual(Object.keys(rq).sort(), ['action', 'at', 'id', 'requestedBy']);
    assert.equal(rq.action, 'docker-setup');
    assert.equal((await A('/api/system/docker/setup')).body.state, 'requested');
    assert.equal((await A('/api/system/docker/setup', 'POST', {})).status, 409, 'pågår allerede');
    // Ikke en oppdatering: /api/health og oppdateringsstatus viser ikke «oppdaterer».
    assert.equal(upd.updateNow().updating, false);
    // Updateren melder ferdig.
    writeFileSync(join(upd._paths.UPD, 'docker.json'), JSON.stringify({ id: rq.id, state: 'done', at: Date.now(), error: null, proxy: { name: 'homelab-docker', image: 'tecnativa/docker-socket-proxy:0.2.0', reused: false } }));
    r = await A('/api/system/docker/setup');
    assert.equal(r.body.state, 'done');
    assert.equal(r.body.proxy.name, 'homelab-docker');
  } finally { logs._setDocker44(null); }
});

test('docker-compose.yml: homelab-docker med fast tag, POST=0, bare ALLOW_*, :ro, ingen porter, internt nett', () => {
  const y = readFileSync('docker-compose.yml', 'utf8');
  const blk = y.slice(y.indexOf('  homelab-docker:'), y.indexOf('  cloudflared:'));
  assert.match(blk, /image: tecnativa\/docker-socket-proxy:\d+\.\d+\.\d+\n/);
  assert.doesNotMatch(blk, /:latest/);
  assert.match(blk, /POST: 0/);
  for (const k of ['ALLOW_START', 'ALLOW_STOP', 'ALLOW_RESTARTS', 'CONTAINERS', 'LOGS', 'INFO', 'EVENTS']) assert.match(blk, new RegExp(`${k}: 1`));
  for (const k of ['EXEC', 'IMAGES', 'VOLUMES', 'NETWORKS', 'BUILD']) assert.doesNotMatch(blk, new RegExp(`\\b${k}:`));
  assert.match(blk, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro/);
  assert.doesNotMatch(blk, /ports:/);
  assert.match(blk, /networks: \[docker-api\]/);
  assert.match(y, /docker-api:\n\s+internal: true/);
  assert.doesNotMatch(y, /profiles: \[logs\]/, 'den gamle profilen er erstattet (ingen to proxyer)');
});

/* ---------------- Search Console ---------------- */

test('Search Console: ekte årsaker i stedet for «koble til på nytt»', () => {
  const r1 = dg.googleReason45(403, { message: 'Google Search Console API has not been used in project 123 before or it is disabled.', status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED', metadata: { activationUrl: 'https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=123' } }] });
  assert.equal(r1.reason, 'api_disabled');
  assert.match(r1.activationUrl, /searchconsole/);
  assert.equal(dg.googleReason45(403, { message: "User does not have sufficient permission for site 'sc-domain:kristo.no'." }).reason, 'noaccess');
  assert.equal(dg.googleReason45(403, { message: "User does not have sufficient permission for site 'sc-domain:kristo.no'." }, true).reason, 'sa_not_added');
  assert.equal(dg.googleReason45(403, { message: 'Request had insufficient authentication scopes.', details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] }).reason, 'scope');
  assert.equal(dg.googleReason45(401, { status: 'UNAUTHENTICATED' }).reason, 'token');
  assert.equal(dg.googleReason45(429, { status: 'RESOURCE_EXHAUSTED' }).reason, 'quota');
  assert.equal(dg.googleReason45(400, { message: 'Invalid site url' }).reason, 'property_format');
});

test('Search Console: eiendommen normaliseres, servicekonto valideres og lagres uten å sendes tilbake', async () => {
  assert.equal(gsc45.normSite45('kristo.no'), 'sc-domain:kristo.no');
  assert.equal(gsc45.normSite45('www.kristo.no'), 'sc-domain:kristo.no');
  assert.equal(gsc45.normSite45('SC-DOMAIN:Kristo.no'), 'sc-domain:kristo.no');
  assert.equal(gsc45.normSite45('https://kristo.no'), 'https://kristo.no/');
  assert.equal(gsc45.normSite45('https://www.kristo.no/blogg'), 'https://www.kristo.no/blogg/');
  assert.equal(gsc45.normSite45('ikke en eiendom'), null);
  let r = await A('/api/gsc/service-account', 'POST', { json: '{"type":"authorized_user"}' });
  assert.equal(r.status, 400);
  assert.equal(r.body.reason, 'bad_key');
  assert.equal((await I('/api/gsc/service-account', 'POST', { json: '{}' })).status, 403);
  const { generateKeyPairSync } = await import('node:crypto');
  const pk = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  r = await A('/api/gsc/service-account', 'POST', { json: JSON.stringify({ type: 'service_account', project_id: 'homelab', client_email: 'gsc@homelab.iam.gserviceaccount.com', private_key: pk }) });
  assert.ok([200, 409].includes(r.status), r.text);
  assert.equal(r.body.email, 'gsc@homelab.iam.gserviceaccount.com');
  assert.doesNotMatch(r.text, /PRIVATE KEY/);
  r = await A('/api/gsc');
  assert.equal(r.body.auth, 'service-account');
  assert.equal(r.body.serviceAccount.email, 'gsc@homelab.iam.gserviceaccount.com');
  assert.equal(r.body.lagDays, 3);
  assert.doesNotMatch(r.text, /PRIVATE KEY|private_key/);
  assert.equal((await A('/api/gsc/service-account', 'DELETE')).status, 200);
  assert.equal((await A('/api/gsc')).body.auth, null);
  assert.equal((await A('/api/gsc/site', 'POST', { domain: 'kristo.no', siteUrl: 'bare tull' })).body.reason, 'property_format');
});

/* ---------------- Studie ---------------- */

test('Studie: FS-utskrift (karakter før sp), vgs-vitnemål (kode etter navn, standpunkt + eksamen), bestått', () => {
  const t = `Universitetet i Oslo\nKarakterutskrift\nStudent: Sebastian Kristo\nDato: 20.06.2026\nEmnekode  Emnenavn  Semester  Karakter  Studiepoeng
IN1000   Introduksjon til objektorientert programmering   2025 HØST   B   10
MAT1100  Kalkulus  2025 HØST  D  10,0
EXPHIL03 Examen philosophicum 2024 HØST Bestått 10
IN1150 Logiske metoder 2026 VÅR Ikke bestått 10
Side 1 av 2`;
  const e = st45.parseCourses45(t);
  assert.deepEqual(e.map((x) => [x.kode, x.karakter, x.sp]), [['IN1000', 'B', 10], ['MAT1100', 'D', 10], ['EXPHIL03', 'Bestått', 10], ['IN1150', 'Ikke bestått', 10]]);
  assert.equal(e[0].semester, 'Høst 2025');
  const v = st45.parseCourses45('Vitnemål for videregående opplæring\nNorsk hovedmål, skriftlig    NOR1260    4    5\nMatematikk R2   REA3024   5\nKroppsøving KRO1019 Godkjent');
  assert.deepEqual(v.map((x) => [x.kode, x.karakter, x.standpunkt ?? null, x.eksamen ?? null]), [['NOR1260', '4', '4', '5'], ['REA3024', '5', '5', null], ['KRO1019', 'Godkjent', null, null]]);
});

test('Studie: PDF med <hex>-strenger og ToUnicode (innebygde skrifter) gir tekst i rader', () => {
  const cmap = '/CIDInit /ProcSet findresource begin\nbegincmap\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n3 beginbfchar\n<0001> <0049>\n<0002> <004E>\n<0003> <0031>\nendbfchar\n1 beginbfrange\n<0010> <0019> <0030>\nendbfrange\nendcmap';
  // «IN1000» med egne koder + «B» som vanlig literal på samme linje (samme y), «Kalkulus» på neste linje.
  const content = 'BT /F1 10 Tf 1 0 0 1 50 700 Tm <000100020003001000100010> Tj ET BT /F2 10 Tf 1 0 0 1 300 700 Tm (B) Tj ET BT /F2 10 Tf 1 0 0 1 50 680 Tm (Kalkulus) Tj ET';
  const pdf = `%PDF-1.4\n1 0 obj << /Type /Page /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 2 0 R >> endobj\n2 0 obj << /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n3 0 obj << /Length ${cmap.length} >>\nstream\n${cmap}\nendstream\nendobj\n4 0 obj << /Type /Font /Subtype /Type0 /BaseFont /ABC+Arial /ToUnicode 3 0 R >> endobj\n6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\ntrailer << >>\n%%EOF`;
  const t = st45.pdfText45(Buffer.from(pdf, 'latin1'));
  assert.match(t, /IN1000\s+B/);
  assert.match(t, /Kalkulus/);
});

test('Studie: status, «Ikke funnet», original, nedlasting, miniatyr og «Prøv igjen»', async () => {
  st44._setStudyText44(null);
  const txt = 'Universitetet i Oslo\nKarakterutskrift\nStudent: Sebastian Kristo\nDato: 20.06.2026\nIN1000   Introduksjon til objektorientert programmering   2025 HØST   B   10\nMAT1100  Kalkulus  2025 HØST  C  10\n';
  let r = await multipart('/api/study/documents', { file: new File([txt], 'utskrift.txt', { type: 'text/plain' }) }, { cookie: ck });
  assert.equal(r.status, 201, r.text);
  const d = r.body.doc;
  assert.equal(d.emner.length, 2);
  assert.equal(d.status, 'ok');
  assert.equal(d.statusText, 'Fant 2 fag');
  assert.equal(d.fields.program, 'Ikke funnet');
  assert.equal(d.file.url, `/api/study/documents/${d.id}/file`);
  r = await A(`/api/study/documents/${d.id}/file?download=1`);
  assert.match(r.headers.get('content-disposition'), /^attachment/);
  assert.equal(r.text, txt);
  assert.equal((await A(`/api/study/documents/${d.id}/thumb`)).status, 404, 'tekst har ingen miniatyr');
  r = await A(`/api/study/documents/${d.id}/reanalyze`, 'POST', {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.doc.emner.length, 2);
  assert.equal((await I(`/api/study/documents/${d.id}/file`)).status, 404, 'bare eieren');
  // Bilde uten OCR-fag → visjonsmodellen (mock), validert.
  st45._setTools45({ tesseract: false });
  st44._setStudyVision45(async () => ({ institution: 'Oslo katedralskole', emner: [{ kode: 'rea3024', navn: 'Matematikk R2', karakter: '5' }, { navn: 'Tull', karakter: 'Z' }] }));
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  r = await multipart('/api/study/documents', { file: new File([png], 'vitnemal.png', { type: 'image/png' }) }, { cookie: ck });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.doc.how, 'vision');
  assert.deepEqual(r.body.doc.emner.map((e) => [e.kode, e.karakter]), [['REA3024', '5']]);
  st44._setStudyVision45(null); st45._setTools45({});
});

/* ---------------- AI-import ---------------- */

const CLAUDE = [{ uuid: 'aaaa-1', name: 'Hardlinks', created_at: '2026-01-02T10:00:00Z', updated_at: '2026-01-02T11:00:00Z', chat_messages: [{ sender: 'human', text: 'Hvordan?', created_at: '2026-01-02T10:00:00Z' }, { sender: 'assistant', content: [{ type: 'text', text: 'Slik.' }] }] },
  { uuid: 'aaaa-2', name: 'Plan', created_at: '2026-02-02T10:00:00Z', chat_messages: [{ sender: 'human', text: 'Lag plan' }, { sender: 'assistant', text: 'Uke 1 …' }] }];
const GPT = [{ title: 'Budsjett', create_time: 1760000000, update_time: 1760000500, conversation_id: 'gpt-1', current_node: 'c',
  mapping: { r: { id: 'r', message: null, parent: null, children: ['s'] }, s: { id: 's', parent: 'r', children: ['a'], message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } } },
    a: { id: 'a', parent: 's', children: ['b', 'x'], message: { author: { role: 'user' }, create_time: 1760000000, content: { content_type: 'text', parts: ['Lag budsjett'] } } },
    x: { id: 'x', parent: 'a', children: [], message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Gammel gren'] } } },
    b: { id: 'b', parent: 'a', children: ['c'], message: { author: { role: 'assistant' }, create_time: 1760000100, content: { content_type: 'text', parts: ['Her er budsjettet'] } } },
    c: { id: 'c', parent: 'b', children: [], message: { author: { role: 'user' }, create_time: 1760000200, content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer' }, 'Og dette bildet?'] } } } } }];
const GEM = [{ header: 'Gemini Apps', title: 'Prompted Hva er R2?', time: '2026-03-01T10:00:00Z', safeHtmlItem: [{ html: '<p>Matematikk &amp; mer</p>' }] },
  { header: 'Gemini Apps', title: 'Prompted Gi meg oppgaver', time: '2026-03-01T10:10:00Z', safeHtmlItem: [{ html: '<p>1) ∫x dx</p>' }] },
  { header: 'Gemini Apps', title: 'Prompted Ny dag', time: '2026-03-03T09:00:00Z' }];

test('AI-import: Claude-ZIP (strømmet), ChatGPT (mapping-tre) og Gemini (JSON og HTML)', async () => {
  let p = await ai45.readExport45(zip({ 'data-2026/conversations.json': JSON.stringify(CLAUDE), 'data-2026/projects.json': '[]', 'data-2026/users.json': '[]', 'data-2026/memories.json': JSON.stringify({ conversations_memory: 'Studerer statistikk\nKjører homelab' }) }), { name: 'claude.zip' });
  assert.equal(p.source, 'claude');
  assert.equal(p.convs.length, 2);
  assert.deepEqual(p.convs[0].messages.map((m) => [m.role, m.content]), [['user', 'Hvordan?'], ['assistant', 'Slik.']]);
  assert.deepEqual(p.memory, ['Studerer statistikk', 'Kjører homelab']);
  p = await ai45.readExport45(Buffer.from(JSON.stringify({ conversations: CLAUDE })), { name: 'conversations.json' });
  assert.equal(p.convs.length, 2, 'også {conversations:[…]}');
  p = await ai45.readExport45(zip({ 'conversations.json': JSON.stringify(GPT) }), { name: 'chatgpt.zip' });
  assert.equal(p.source, 'chatgpt');
  assert.deepEqual(p.convs[0].messages.map((m) => m.content), ['Lag budsjett', 'Her er budsjettet', '[Bilde]\n\nOg dette bildet?'], 'grenen fra current_node, i rekkefølge, uten system');
  p = await ai45.readExport45(zip({ 'Takeout/My Activity/Gemini Apps/MyActivity.json': JSON.stringify(GEM) }), { name: 'takeout.zip' });
  assert.equal(p.source, 'gemini');
  assert.equal(p.convs.length, 2, 'to økter (over 30 min mellom)');
  assert.deepEqual(p.convs.find((c) => c.messages.length === 4).messages.map((m) => m.content), ['Hva er R2?', 'Matematikk & mer', 'Gi meg oppgaver', '1) ∫x dx']);
  const html = '<html><body><div class="outer-cell mdl-cell"><div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">Prompted&nbsp;Hva er klokka?<br>1. mar. 2026, 10:00:00 CET<br></div><div class="content-cell mdl-cell"><p>Ti</p></div></div></body></html>';
  p = await ai45.readExport45(Buffer.from(html), { name: 'MyActivity.html' });
  assert.equal(p.source, 'gemini');
  assert.equal(p.convs[0].messages[0].content, 'Hva er klokka?');
});

test('AI-import: faktisk feilårsak og zip-bomb-vern', async () => {
  await assert.rejects(ai45.readExport45(Buffer.from('PK\u0003\u0004 ødelagt'), { name: 'x.zip' }), (e) => e.reason === 'not_zip');
  await assert.rejects(ai45.readExport45(zip({ 'readme.txt': 'hei' }), { name: 'x.zip' }), (e) => e.reason === 'no_conversations' && /readme\.txt/.test(e.detail));
  await assert.rejects(ai45.readExport45(Buffer.from('hei'), { name: 'x.bin' }), (e) => e.reason === 'unknown_format');
  const old = ai45.LIMITS45.entry; ai45.LIMITS45.entry = 4096;
  try { await assert.rejects(ai45.readExport45(zip({ 'conversations.json': `[${'{"uuid":"x","chat_messages":[]},'.repeat(1000)}{}]` }), { name: 'bomb.zip' }), (e) => e.reason === 'zip_bomb'); }
  finally { ai45.LIMITS45.entry = old; }
  const r = await multipart('/api/ai/import', { file: new File(['ikke en eksport'], 'x.zip') }, { cookie: ck });
  assert.equal(r.status, 400);
  assert.ok(r.body.reason, r.text);
});

test('AI-import: bitvis opplasting → forhåndsvisning → import → angre (per bruker)', async () => {
  const data = zip({ 'conversations.json': JSON.stringify(GPT) });
  const half = Math.ceil(data.length / 2);
  const up = (chunk, h) => req('/api/ai/import/upload', { method: 'POST', headers: { cookie: ck, 'content-type': 'application/octet-stream', ...h }, raw: chunk });
  let r = await up(data.subarray(0, half), { 'x-chunk-index': '0', 'x-chunk-total': '2', 'x-file-name': 'chatgpt.zip' });
  assert.equal(r.status, 200, r.text);
  const id = r.body.uploadId;
  assert.equal((await req('/api/ai/import/upload', { method: 'POST', headers: { cookie: (await login('ingrid', 'ingridPassord123')), 'x-upload-id': id, 'x-chunk-index': '1', 'x-chunk-total': '2' }, raw: data.subarray(half) })).status, 404, 'andres opplasting');
  r = await up(data.subarray(half), { 'x-upload-id': id, 'x-chunk-index': '1', 'x-chunk-total': '2' });
  assert.equal(r.body.done, true);
  r = await A('/api/ai/import', 'POST', { uploadId: id, memory: 'Liker brunost' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.source, 'chatgpt');
  assert.equal(r.body.conversations, 1);
  assert.equal(r.body.memory[0].text, 'Liker brunost');
  const imp = r.body.importId;
  assert.equal((await I(`/api/ai/import/${imp}`)).status, 404, 'bare den som lastet opp');
  r = await A(`/api/ai/import/${imp}/commit`, 'POST', {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.folder, 'ChatGPT');
  assert.equal(r.body.conversations, 1);
  assert.ok(db.prepare("SELECT 1 FROM hl_chats WHERE id='gpt_gpt-1' AND user_id='owner'").get());
  r = await A(`/api/ai/import/${imp}/undo`, 'POST', {});
  assert.equal(r.body.removedConversations, 1);
  assert.equal(r.body.removedMemory, 1);
  assert.ok(!db.prepare("SELECT 1 FROM hl_chats WHERE id='gpt_gpt-1'").get());
  // Gammel rute (Claude) bruker samme leser.
  r = await multipart('/api/chat/import/claude', { file: new File([zip({ 'conversations.json': JSON.stringify(CLAUDE) })], 'data.zip') }, { cookie: ck });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.conversations, 2);
  r = await A('/api/ai/import', 'POST', { sample: 'gemini' });
  assert.equal(r.body.source, 'gemini');
});

/* ---------------- Media ---------------- */

test('Media: uovervåkede episodefiler – liste, bekreftelse, Angre og sletting av bare det som fortsatt er uovervåket', async () => {
  let r = await A('/api/media/unmonitored?service=sonarr');
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.count > 0);
  assert.match(r.body.text, /^Slette \d+ episodefiler? \(.+\) som ikke er overvåket\?$/);
  const ids = r.body.items.map((x) => x.fileId);
  assert.equal((await I('/api/media/unmonitored?service=sonarr')).status, 403);
  assert.equal((await A('/api/media/unmonitored/delete', 'POST', { service: 'sonarr', fileIds: ids })).status, 400, 'krever confirm');
  r = await A('/api/media/unmonitored/delete', 'POST', { service: 'sonarr', fileIds: ids.slice(0, 1), confirm: true, delaySec: 10 });
  assert.equal(r.status, 202, r.text);
  assert.equal(r.body.undo.method, 'DELETE');
  r = await A(r.body.undo.path, 'DELETE');
  assert.equal(r.body.state, 'cancelled');
  assert.equal((await A('/api/media/unmonitored?service=sonarr')).body.count, ids.length, 'ingenting slettet etter Angre');
  r = await A('/api/media/unmonitored/delete', 'POST', { service: 'sonarr', fileIds: [ids[0], 999999], confirm: true, delaySec: 0 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.deleted, 1);
  assert.equal((await A('/api/media/unmonitored?service=sonarr')).body.count, ids.length - 1);
});

test('Avspilling: mobilstatistikk med periode 7 d · 30 d · År · Alt', async () => {
  const r = await A('/api/playback/summary?range=all');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.ranges.map((x) => x.label), ['7 d', '30 d', 'År', 'Alt']);
  assert.ok(r.body.total.plays > 0);
  for (const k of ['topShows', 'topMovies', 'perUser', 'perDevice', 'history']) assert.ok(Array.isArray(r.body[k]), k);
  assert.equal((await A('/api/playback/summary?range=7d')).body.perDay.length, 7);
});

/* ---------------- Sonevarsler ---------------- */

test('Sonevarsler: brytere per bruker (hovedbryter, person, sone) og soneikon som PNG/SVG', async () => {
  let r = await A('/api/family/zone-alerts');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.on, true);
  const z = r.body.zones[0], p = r.body.people[0];
  assert.ok(z.iconUrl && p?.id);
  assert.match(r.body.sample.body, / forlot /);
  r = await A('/api/family/zone-alerts', 'PUT', { people: { [p.id]: false } });
  assert.equal(r.body.people.find((x) => x.id === p.id).on, false);
  assert.equal(zone.zoneAlertAllowed45('owner', p.id, z.id), false);
  assert.equal(zone.zoneAlertAllowed45('owner', 'noen-andre', z.id), true);
  assert.equal(zone.zoneAlertAllowed45('ingrid', p.id, z.id), true, 'per mottaker');
  await A('/api/family/zone-alerts', 'PUT', { on: false, people: { [p.id]: true } });
  assert.equal(zone.zoneAlertAllowed45('owner', 'noen-andre', z.id), false, 'hovedbryter av');
  assert.equal((await A('/api/family/zone-alerts', 'PUT', { on: 'ja' })).status, 400);
  r = await A(z.iconUrl);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.buf.subarray(1, 4).toString(), 'PNG');
  assert.equal(r.buf.readUInt32BE(16), 80);
  r = await A(`/api/family/zones/${z.id}/icon.svg`);
  assert.match(r.text, /<svg[\s\S]*fill="#[0-9a-f]{6}"/);
  assert.equal((await A('/api/family/zones/99999/icon.png')).status, 404);
  assert.ok(zone.flattenPath45('M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5z').length === 1);
});

/* ---------------- HA-helse ---------------- */

test('HA-helse: bare mobile_app-enheter, Telefoner/Alle mobilapp, gruppert, «N andre enheter vises ikke»', async () => {
  h45._ha45.ws = async () => [
    [{ entry_id: 'e1', domain: 'mobile_app' }, { entry_id: 'e2', domain: 'mobile_app' }],
    [{ id: 'd1', name: 'Cybele OnePlus 12', model: 'CPH2581', manufacturer: 'OnePlus', config_entries: ['e1'] }, { id: 'd2', name: 'Sebastian iPad Pro', model: 'iPad16,3', manufacturer: 'Apple', config_entries: ['e2'] },
      { id: 'd3', name: 'Aqara bryter stue', config_entries: ['z1'] }, { id: 'd4', name: 'Rullegardin', config_entries: ['z2'] }, { id: 'd5', name: 'Sun', entry_type: 'service', config_entries: ['s'] }],
    [{ entity_id: 'sensor.cybele_oneplus_12_steps', device_id: 'd1' }, { entity_id: 'sensor.cybele_oneplus_12_battery_level', device_id: 'd1' }, { entity_id: 'sensor.sebastian_ipad_pro_battery_level', device_id: 'd2' }, { entity_id: 'sensor.aqara_battery', device_id: 'd3' }],
  ];
  // health42 bruker MOCK-tilstandene; HA-konfig «finnes» via injeksjonen.
  h45._resetHa45();
  try {
    let r = await A('/api/family/health/ha?view=phones');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.filter.source, 'registry');
    assert.deepEqual(r.body.devices.map((d) => d.name), ['Cybele OnePlus 12']);
    assert.equal(r.body.devices[0].healthText, '3 helsesensorer');
    assert.equal(r.body.devices[0].noHealthText, undefined, 'ikke «Ingen helsesensorer» to ganger');
    assert.equal(r.body.counts.other, 2);
    assert.match(r.body.hidden.text, /^2 andre enheter fra Home Assistant/);
    assert.equal(r.body.groups[r.body.groups.length - 1].label, 'IKKE KOBLET · 1');
    assert.equal(r.body.status.text, '0 av 2 koblet');
    r = await A('/api/family/health/ha?view=all');
    assert.deepEqual(r.body.devices.map((d) => [d.name, d.kind, d.healthText]), [['Cybele OnePlus 12', 'phone', '3 helsesensorer'], ['Sebastian iPad Pro', 'tablet', 'Ingen helsesensorer']]);
  } finally { h45._ha45.ws = null; h45._resetHa45(); }
});

/* ---------------- Ruter, Vær, Gjøremål, Innstillinger, varsler, layout ---------------- */

test('Ruter: antall anbefalte reiser 1–3 per bruker', async () => {
  assert.equal((await A('/api/ruter/settings')).body.recoCount, 2);
  assert.equal((await A('/api/ruter/settings', 'PUT', { recoCount: 4 })).status, 400);
  assert.equal((await A('/api/ruter/settings', 'PUT', { recoCount: 1 })).body.recoCount, 1);
  assert.equal((await I('/api/ruter/settings')).body.recoCount, 2);
  const r = await A('/api/ruter/my-trip?dir=toHome');
  assert.equal(r.body.recoCount, 1);
  assert.equal(r.body.recommended.length, Math.min(1, r.body.options.length));
});

test('Vær: min posisjon (ikke lagret), samme sted innen 2 km, mangler posisjon', async () => {
  let r = await A('/api/weather/here?lat=59.9296&lon=10.7146&selLat=59.93&selLon=10.715');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.label, 'MIN POSISJON');
  assert.equal(r.body.sameAsSelected, true);
  assert.equal(r.body.place.name, 'Majorstuen');
  assert.ok(Number.isFinite(r.body.now.temp));
  r = await A('/api/weather/here');
  assert.equal(r.status, 400);
  assert.equal(r.body.button, 'Tillat');
});

test('Gjøremål: synk-raden for alle, Innstillinger samlet, søkeindeksen', async () => {
  let r = await I('/api/tasks/ha/summary');
  assert.equal(r.status, 200);
  assert.equal(r.body.canEdit, false);
  assert.equal(r.body.settings.detail, 'huske');
  r = await I('/api/settings/sections');
  assert.ok(r.body.sections.some((s) => s.id === 'media' && s.items.length));
  assert.ok(!r.body.sections.some((s) => s.id === 'server'), 'serverinnstillinger bare for admin');
  assert.ok((await A('/api/settings/sections')).body.sections.some((s) => s.id === 'server'));
  r = await A('/api/settings/index');
  for (const id of ['media', 'gjoremal.synk', 'ruter.antall', 'familie.sonevarsler', 'ai.import']) assert.ok((Array.isArray(r.body) ? r.body : r.body.items ?? []).some((x) => x.id === id), id);
});

test('Glimt mens appen er lukket: bare systemvarsel (n_ai_in utgått, inApp:false)', async () => {
  assert.equal((await A('/api/me/notify')).body.n_ai_in, false);
  assert.equal((await A('/api/me/notify', 'PUT', { n_ai_in: true })).body.n_ai_in, false);
  const { notifyUser, pendingFor } = await import('../server/notify.js');
  await notifyUser('owner', { title: 'x', body: 'Svar fra Glimt', category: 'ai' });
  const last = pendingFor('owner', 0, 500).filter((x) => x.category === 'ai').pop();
  assert.equal(last.data.inApp, false);
  assert.equal(last.data.systemOnly, true);
});

test('Layout: mer45 (Mer-tittel og fire store bokser) lagres per bruker', async () => {
  let r = await A('/api/me/layout', 'PUT', { mer45: { title: 'Hverdag og familie', titleHidden: true, big: ['kalender', 'huske', 'vaer', 'ruter'] } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual((await A('/api/me/layout')).body.mer45.big, ['kalender', 'huske', 'vaer', 'ruter']);
  assert.equal((await A('/api/me/layout', 'PUT', { mer45: { big: ['a', 'b', 'c', 'd', 'e'] } })).status, 400);
  assert.equal((await I('/api/me/layout')).body.mer45, undefined);
});

test('/api/version har de nye features', async () => {
  const f = (await req('/api/version')).body.features;
  for (const k of ['docker.setup', 'ai.import', 'media.unmonitored', 'zone.alerts', 'weather.here', 'settings.sections']) assert.ok(f.includes(k), k);
});

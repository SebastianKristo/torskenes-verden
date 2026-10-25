// Prompt 53 (DAL53): Desert Ant Labs-modellene. huggingface.co er blokkert i utviklingsmiljøet, så Eye, Redact, Gist, Emo, Moderator,
// Clear og Voz er MOCKET her (_setLoader53). Tongue kjøres EKTE (vektene ligger i npm-pakken).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p53dal-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-53dal';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4651';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DAL53_AUTOLOAD;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const M = await import('../server/dal53/models.js');
const T = await import('../server/dal53/text.js');
const IMG = await import('../server/dal53/image.js');
const NEWS = await import('../server/dal53/news.js');
const ASR = await import('../server/dal53/asr.js');
const MOD = await import('../server/dal53/moderate.js');
const D = await import('../server/dal53/index.js');
const pre = await import('../server/receipts48/preprocess51.js');

let ipN = 40;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const isForm = body instanceof FormData;
  const raw = body instanceof Uint8Array;
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined && !isForm && !raw ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm || raw ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body, headers = {}) => req(path, { method, headers: { cookie: ck, ...headers }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const ingridId = (await I('/api/me')).body.id;
const tick = () => new Promise((r) => setImmediate(r));
async function readyMock(id, inst) { M._setLoader53(id, async () => inst); await M.load53(id); assert.ok(M.ready53(id), `${id} skal være klar`); }

test('flaggene finnes og er PÅ som standard; helse er bare for admin', async () => {
  const flags = (await A('/api/admin/flags51')).body.flags;
  for (const k of ['dal_eye53', 'dal_redact53', 'dal_gist53', 'dal_tongue53', 'dal_emo53', 'dal_moderator53', 'dal_voice53']) {
    const f = flags.find((x) => x.key === k);
    assert.ok(f, k); assert.equal(f.default, true, `${k} skal være på`);
  }
  assert.equal((await I('/api/admin/dal53/health')).status, 403);
  assert.equal((await req('/api/admin/dal53/health')).status, 401);
  const h = await A('/api/admin/dal53/health');
  assert.equal(h.status, 200);
  assert.deepEqual(h.body.models.map((m) => m.id), ['eye', 'redact', 'gist', 'tongue', 'emo', 'moderator', 'clear', 'voz']);
  assert.ok(h.body.models.every((m) => m.installed), 'npm-pakkene er installert');
  assert.match(h.body.credit, /Desert Ant Labs \(license\.desertant\.com\)/);
  assert.ok(h.body.cache_dir.startsWith(process.env.DATA_DIR), 'vektene lagres i DATA_DIR/models');
  assert.ok(h.body.asr.backends.some((b) => b.id === 'voz' && !b.languages.includes('no')), 'Voz har ikke norsk');
});

test('lat lasting: ikke klar → null og reserve (ingen venting); i tester lastes ingenting fra nettet', async () => {
  const t0 = Date.now();
  assert.equal(M.ready53('gist'), null);
  assert.equal(await M.use53('gist', () => 'x'), null);
  assert.ok(Date.now() - t0 < 200);
  assert.equal(M.health53().models.find((m) => m.id === 'gist').status, 'idle', 'autolasting er av i tester');
  // Forhåndslasting (admin) bruker lasteren; en feil gir status error og prøves ikke igjen med en gang.
  M._setLoader53('gist', async () => { throw new Error('nedlasting feilet (mock)'); });
  const r = await A('/api/admin/dal53/preload', 'POST', { models: ['gist', 'ukjent'] });
  assert.equal(r.status, 202);
  assert.deepEqual(r.body.started, ['gist']);
  assert.equal(r.body.skipped[0].id, 'ukjent');
  await tick(); await tick();
  const g = (await A('/api/admin/dal53/health')).body.models.find((m) => m.id === 'gist');
  assert.equal(g.status, 'error');
  assert.match(g.error, /mock/);
  assert.ok(g.retry_at);
  M._setLoader53('gist', null);
  assert.equal((await I('/api/admin/dal53/preload', 'POST', {})).status, 403);
});

test('Tongue (EKTE, vektene ligger i pakken): svarspråk i systeminstruksen, norsk ved tvil', async () => {
  await M.load53('tongue');
  assert.ok(M.ready53('tongue'), 'Tongue lastes uten nett');
  assert.match(T.langNote53('What is the weather going to be like in Oslo tomorrow?'), /engelsk/);
  assert.match(T.langNote53('Hva skal vi spise til middag i kveld?'), /norsk/);
  assert.equal(T.langNote53('hei'), '', 'for kort → standard (norsk)');
  assert.equal(T.detectLang53('Hvad skal vi lave i weekenden med børnene?').language, 'da');
  // engine53 legger notatet på systeminstruksen for alle modeller (også lokale), uten å endre meldingene.
  let seen = null;
  await T.engine53(async (m, ctx) => { seen = ctx; return { ok: 1 }; }, { kind: 'lokal', id: 'qwen3:8b' }, { sys: 'Svar på norsk bokmål.', msgs: [{ role: 'user', content: 'Can you help me write an email to my landlord?' }], onDelta: async () => {} });
  assert.match(seen.sys, /^Svar på norsk bokmål\.\n\nBrukerens siste melding er på engelsk/);
  assert.equal(seen.msgs[0].content, 'Can you help me write an email to my landlord?');
});

// Mock av Redact: bytter kjente verdier med plassholdere, restore() setter dem tilbake.
const PII = [['Kari Nordmann', '[GIVEN_NAME_1] [SURNAME_1]'], ['kari@example.no', '[EMAIL_1]'], ['912 34 567', '[PHONE_1]'], ['01017012345', '[GOVERNMENT_ID_1]']];
const redactMock = {
  calls: [],
  async redaction(text, opts = {}) {
    this.calls.push({ text, opts });
    let out = text; const items = [];
    for (const [orig, ph] of PII) {
      const label = ph.match(/\[([A-Z_]+)_1\]/)[1];
      if (opts.labels && !opts.labels.includes(label) && !(label === 'GIVEN_NAME' && opts.labels.includes('SURNAME'))) continue;
      if (out.includes(orig)) { out = out.split(orig).join(ph); items.push({ label, original: orig, placeholder: ph, confidence: 0.9, start: 0, end: 0 }); }
    }
    return { redactedText: out, items, restore: (t) => PII.reduce((s, [orig, ph]) => s.split(ph).join(orig), t) };
  },
};

test('Redact: sky-modell får plassholdere, svaret gjenopprettes lokalt (også delt over strømmebiter); lokal modell urørt; ingen originaler i loggen', async () => {
  await readyMock('redact', redactMock);
  const logs = [];
  const oi = console.info, ow = console.warn;
  console.info = (...a) => logs.push(a.join(' ')); console.warn = (...a) => logs.push(a.join(' '));
  try {
    const out = [];
    let sent = null;
    const raw = async (m, ctx) => {
      sent = ctx;
      // Skyen svarer med plassholdere, delt midt i en plassholder.
      for (const d of ['Hei! Jeg sender til [GIV', 'EN_NAME_1] [SURNAME_1] på [EMAIL', '_1] nå.']) await ctx.onDelta(d);
      return { engine: 'gemini' };
    };
    const r = await T.engine53(raw, { kind: 'sky', provider: 'gemini', id: 'gemini:x' }, {
      sys: 'Du er Glimt. Brukerens kontakt: Kari Nordmann, kari@example.no.',
      msgs: [{ role: 'user', content: 'Skriv en melding til Kari Nordmann på 912 34 567 og send kopi til kari@example.no' }],
      onDelta: async (d) => { out.push(d); },
    });
    assert.ok(!sent.sys.includes('Kari Nordmann') && sent.sys.includes('[GIVEN_NAME_1] [SURNAME_1]'));
    assert.match(sent.sys, /plassholdere/);
    assert.equal(sent.msgs[0].content, 'Skriv en melding til [GIVEN_NAME_1] [SURNAME_1] på [PHONE_1] og send kopi til [EMAIL_1]');
    assert.equal(out.join(''), 'Hei! Jeg sender til Kari Nordmann på kari@example.no nå.');
    assert.ok(out.every((d) => !/\[[A-Z_]*$/.test(d)), 'ingen halve plassholdere til klienten');
    assert.equal(r.redacted53.count, 3);
    // Én felles redigering (samme plassholder for samme person i systeminstruks og melding).
    assert.equal(redactMock.calls.length, 1);
    // Lokal modell: ingen redigering.
    let local = null;
    await T.engine53(async (m, ctx) => { local = ctx; return {}; }, { kind: 'lokal', id: 'qwen3:8b' }, { sys: 'x', msgs: [{ role: 'user', content: 'Ring Kari Nordmann' }], onDelta: async () => {} });
    assert.equal(local.msgs[0].content, 'Ring Kari Nordmann');
    assert.ok(!logs.join('\n').match(/Kari|kari@|912 34|01017012345/), 'originalverdiene logges aldri');
    assert.ok(logs.some((l) => /redact: 3 personopplysninger/.test(l)));
  } finally { console.info = oi; console.warn = ow; }
});

test('Redact: flagget av eller modellen ikke klar → teksten sendes som før', async () => {
  await A('/api/admin/flags51/dal_redact53', 'PATCH', { default: false });
  let sent = null;
  await T.engine53(async (m, ctx) => { sent = ctx; return {}; }, { kind: 'sky', provider: 'groq', id: 'groq:x' }, { sys: 's', msgs: [{ role: 'user', content: 'Kari Nordmann' }], onDelta: async () => {} });
  assert.equal(sent.msgs[0].content, 'Kari Nordmann');
  await A('/api/admin/flags51/dal_redact53', 'PATCH', { default: true });
  M._setLoader53('redact', null); // ikke klar
  await T.engine53(async (m, ctx) => { sent = ctx; return {}; }, { kind: 'sky', provider: 'groq', id: 'groq:x' }, { sys: 's', msgs: [{ role: 'user', content: 'Kari Nordmann' }], onDelta: async () => {} });
  assert.equal(sent.msgs[0].content, 'Kari Nordmann');
});

test('Redact på nettsøk: telefon/e-post/id-nummer fjernes, navn beholdes', async () => {
  await readyMock('redact', redactMock);
  const c = await T.cleanWebQuery53('Kari Nordmann 912 34 567 kari@example.no');
  assert.equal(c.query, 'Kari Nordmann');
  assert.equal(c.removed, 2);
  let q = null;
  await T.webSearch53(async (x) => { q = x; return { hits: [] }; }, 'fødselsnummer 01017012345 gyldig?', {});
  assert.equal(q, 'fødselsnummer gyldig?');
});

test('Redact rundt ai-run (AI-søk som kan gå til sky): prompten får plassholdere, svaret gjenopprettes; localOnly urørt', async () => {
  await readyMock('redact', redactMock);
  let got = null;
  const run = async (task, o) => { got = o; return { text: 'Ring [GIVEN_NAME_1] [SURNAME_1] i kveld', provider: 'gemini' }; };
  const out = await T.aiRun53(run, 'sok', { user: ingridId, prompt: 'Når skal jeg ringe Kari Nordmann?', system: (p) => `sys ${p}` });
  assert.equal(got.prompt, 'Når skal jeg ringe [GIVEN_NAME_1] [SURNAME_1]?');
  assert.match(got.system('gemini'), /^sys gemini\n\nNoen navn/);
  assert.equal(out.text, 'Ring Kari Nordmann i kveld');
  await T.aiRun53(run, 'sok', { user: ingridId, prompt: 'Kari Nordmann', localOnly: true });
  assert.equal(got.prompt, 'Kari Nordmann');
});

test('streamRestorer53 holder bare tilbake en påbegynt plassholder', async () => {
  const out = [];
  const s = T.streamRestorer53((t) => t.replace('[A_1]', 'Anna'), async (d) => { out.push(d); });
  await s.push('Liste [1] og [A'); await s.push('_1] ferdig ['); await s.flush();
  assert.equal(out.join(''), 'Liste [1] og Anna ferdig [');
});

test('Emo: forslag fra modellen; reserve med norske regler; ruten krever innlogging', async () => {
  assert.equal((await req('/api/emo53/suggest', { method: 'POST', body: { text: 'x' } })).status, 401);
  let r = await I('/api/emo53/suggest', 'POST', { text: 'Betale strømregningen' });
  assert.equal(r.status, 200);
  assert.equal(r.body.engine, 'regler');
  assert.equal(r.body.suggestions[0].emoji, '💰');
  await readyMock('emo', { suggestions: async (t, o) => [{ emoji: '🧾', confidence: 0.71 }, { emoji: '💡', confidence: 0.2 }].slice(0, o.limit) });
  r = await I('/api/emo53/suggest', 'POST', { text: 'Pay the electricity bill', limit: 2 });
  assert.equal(r.body.engine, 'emo');
  assert.deepEqual(r.body.suggestions.map((x) => x.emoji), ['🧾', '💡']);
  assert.equal((await I('/api/emo53/suggest', 'POST', { text: '' })).status, 400);
});

test('Eye: kind → vei (dokument/foto), rotasjon til forbehandlingen, kvitteringsfoto gir advarsel', async () => {
  assert.equal(IMG.routeOfKind53('receipt'), 'document');
  assert.equal(IMG.routeOfKind53('screenshot'), 'document');
  assert.equal(IMG.routeOfKind53('selfie'), 'photo');
  assert.equal(IMG.routeOfKind53(null), null);
  // Uten Eye: null (chatten bruker OCR-tetthetsheuristikken som før).
  assert.equal(await D.eyeIntent53([{ path: '/finnes/ikke.jpg' }]), null);
  IMG._setDecoder53(() => ({ data: new Uint8Array(12), width: 2, height: 2 }));
  let kind = 'receipt', rotation = 90;
  await readyMock('eye', { analyze: async (px, o) => { assert.deepEqual(o.parts, ['photo']); return { kind, rotation, details: { photo: { type: { [kind]: 0.92 } } } }; } });
  const f = join(process.env.DATA_DIR, 'a.jpg'); writeFileSync(f, Buffer.from('fake-jpeg-1'));
  assert.equal(await D.eyeIntent53([{ path: f }]), 'document');
  assert.equal(await IMG.eyeRotation53(f), 270, 'Eye: 90° med klokka → roter 270° for å få det oppreist');
  kind = 'photo'; rotation = null;
  const f2 = join(process.env.DATA_DIR, 'b.jpg'); writeFileSync(f2, Buffer.from('fake-jpeg-2'));
  assert.equal(await D.eyeIntent53([{ path: f2 }]), 'photo');
  // Forbehandlingen før Tesseract får «-rotate» når Eye sier at bildet ligger på siden.
  kind = 'receipt'; rotation = 180;
  const calls = [];
  pre._setPre51({ run: async (cmd, args) => {
    calls.push(args);
    if (args.includes('info:')) return Buffer.from('1200 2400 TopLeft');
    if (String(args.at(-1)).endsWith('ocr.png')) { writeFileSync(args.at(-1), Buffer.from('png')); return Buffer.alloc(0); }
    throw new Error('ingen maske');
  } });
  const p = await pre.preprocess51(Buffer.from('fake-jpeg-3'), 'image/jpeg', { tools: { magick: 'magick' } });
  pre._setPre51(null);
  assert.equal(p.preprocess.eye_rotation53, 180);
  assert.ok(calls.at(-1).join(' ').includes('-rotate 180'));
  // Flagget av → ingen rotasjon.
  await A('/api/admin/flags51/dal_eye53', 'PATCH', { default: false });
  assert.equal(await IMG.eyeRotation53(f), 0);
  assert.equal(await D.eyeIntent53([{ path: f }]), null);
  await A('/api/admin/flags51/dal_eye53', 'PATCH', { default: true });
  IMG._setDecoder53(null);
});

test('Gist: emner per sak, kategori for «Auto»-saker og «For deg» mot emnene', async () => {
  await I('/api/rss?limit=1'); // standardkildene og første henting (mock)
  const feed = db.prepare("INSERT INTO rss_feed(user, name, url, category, enabled, created, last_fetch) VALUES(?,?,?,?,1,?,?) RETURNING id").get(ingridId, 'Testkilde', 'https://example.org/rss', 'auto', Date.now(), Date.now()).id;
  const ins = db.prepare('INSERT INTO rss_item(feed_id, guid, title, url, published, category, excerpt) VALUES(?,?,?,?,?,?,?) RETURNING id');
  const a = ins.get(feed, 'g1', 'Brann slo Molde 3–1 i eliteserien', 'https://example.org/1', new Date().toISOString(), null, '').id;
  const b = ins.get(feed, 'g2', 'Ny brikke gjør mobilen dobbelt så rask', 'https://example.org/2', new Date().toISOString(), null, '').id;
  await readyMock('gist', { classify: async (t) => (/Brann/.test(t) ? [{ slug: 'sports', name: 'Sports', score: 0.95 }] : [{ slug: 'technology', name: 'Technology & Software', score: 0.9 }, { slug: 'science', name: 'Science', score: 0.4 }]) });
  const n = await NEWS.tagPending53();
  assert.ok(n >= 2);
  assert.equal(NEWS.gistCategory53(a), 'sport');
  assert.equal(NEWS.gistCategory53(b), 'teknologi');
  assert.deepEqual(NEWS.topicSlugs53(b), ['technology', 'science']);
  assert.ok(NEWS.interestMatchesTopics53('fotball', ['sports']));
  assert.ok(NEWS.interestMatchesTopics53('teknologi', ['technology']));
  assert.ok(!NEWS.interestMatchesTopics53('it', ['politics']));
  // Nyheter: kategorien kommer fra Gist (i stedet for standarden «norge»), og sakene har emnene.
  const sport = await I('/api/rss?cat=sport&limit=200');
  const items = sport.body?.items ?? sport.body ?? [];
  assert.ok(items.some((x) => x.id === a && x.category === 'sport' && x.topics.includes('sports')), JSON.stringify(sport.body).slice(0, 300));
  // For deg: interessen «fotball» treffer saken via emnet (ordet står ikke i tittelen).
  await I('/api/rss/interests', 'PUT', { interests: ['fotball'] });
  const fy = await I('/api/rss/foryou');
  assert.ok(fy.body.items.some((x) => x.id === a), 'For deg treffer via Gist-emnet');
});

test('Moderator: barnekonto – NSFW-opplasting avvises med forklaring, bildeproxyen gir erstatningsbilde; voksne urørt; admin kan slå av', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  IMG._setDecoder53(() => ({ data: new Uint8Array(3), width: 1, height: 1 }));
  await readyMock('moderator', { analyze: async () => ({ score: 0.97, isNSFW: true, regions: { nude: 0.97 } }) });
  const up = (as) => { const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'bilde.png'); return as('/api/chat/files', 'POST', fd); };
  MOD._setChildCheck53((u) => u === ingridId);
  let r = await up(I);
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'moderated53');
  assert.match(r.body.error, /skjult fordi det kan være upassende for barn/);
  assert.equal(db.prepare('SELECT count(*) FROM hl_chat_files WHERE user_id=?').pluck().get(ingridId), 0, 'fila er slettet');
  r = await up(A);
  assert.equal(r.status, 200, 'voksne påvirkes ikke');
  // Visning via bildeproxyen.
  const hono = new (await import('hono')).Hono();
  hono.use('*', async (c, next) => { c.set('user', ingridId); await next(); });
  hono.use('/img', MOD.childImageMw53);
  hono.get('/img', (c) => c.body(png, 200, { 'Content-Type': 'image/png' }));
  let res = await hono.request('/img');
  assert.equal(res.headers.get('x-moderated53'), '1');
  assert.match(await res.text(), /Bildet er skjult/);
  await A('/api/admin/flags51/dal_moderator53', 'PATCH', { default: false });
  res = await hono.request('/img');
  assert.equal(res.headers.get('content-type'), 'image/png', 'admin har slått av');
  await A('/api/admin/flags51/dal_moderator53', 'PATCH', { default: true });
  MOD._setChildCheck53(null);
  IMG._setDecoder53(null);
});

test('Tale til tekst: norsk → 422 (Voz/Phonon støtter ikke norsk); engelsk → Clear → Voz med ordtider; Phonon foretrekkes når klar', async () => {
  ASR._setPhonon53(null);
  const wav = new Uint8Array(ASR.wav16k53(new Float32Array(1600)));
  assert.equal((await req('/api/voice53/transcribe', { method: 'POST', body: wav, headers: { 'content-type': 'audio/wav' } })).status, 401);
  let r = await I('/api/voice53/transcribe?language=nb', 'POST', wav, { 'content-type': 'audio/wav' });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'language_unsupported');
  assert.match(r.body.error, /norsk/);
  assert.ok(!r.body.supported.includes('no'));
  // Engelsk uten klar modell → 503.
  r = await I('/api/voice53/transcribe?language=en', 'POST', wav, { 'content-type': 'audio/wav' });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'asr_unavailable');
  ASR._setAudioDecoder53(() => new Float32Array(16000));
  let cleared = 0;
  await readyMock('clear', { enhance: async (s, rate, o) => { cleared++; assert.equal(rate, 16000); assert.equal(o.outputSampleRate, 16000); return { samples: s }; } });
  await readyMock('voz', { transcribe: async (inp) => { assert.equal(inp.sampleRate, 16000); return { text: 'hello world', words: [{ text: 'hello', start: 0.08, end: 0.4 }, { text: 'world', start: 0.48, end: 0.9 }], duration: 1 }; } });
  const fd = new FormData(); fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'lyd.wav'); fd.append('language', 'en');
  r = await I('/api/voice53/transcribe', 'POST', fd);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.text, 'hello world');
  assert.equal(r.body.backend, 'voz');
  assert.equal(r.body.enhanced, true);
  assert.equal(r.body.words[1].start, 0.48);
  assert.equal(cleared, 1);
  // Phonon (FERMION53) foran Voz når den er klar og støtter språket; ordtidene normaliseres.
  ASR._setPhonon53({ label: 'Phonon-2.5 (Mac mini)', ready: () => true, languages: () => ['en', 'sv'], supports: (l) => !['no', 'nb', 'nn'].includes(l),
    transcribe: async (buf, o) => { assert.equal(o.mime, 'audio/wav'); assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); return { text: 'hej världen', words: [{ word: 'hej', start: 0, end: 0.3 }], language: o.language }; } });
  r = await I('/api/voice53/transcribe?language=sv&enhance=0', 'POST', wav, { 'content-type': 'audio/wav' });
  assert.equal(r.body.backend, 'phonon');
  assert.deepEqual(r.body.words[0], { text: 'hej', start: 0, end: 0.3 });
  assert.equal(r.body.enhanced, false);
  const bk = await I('/api/voice53/backends');
  assert.equal(bk.body.norwegian, false);
  assert.deepEqual(bk.body.backends.map((b) => b.id).filter((id) => id !== 'nbwhisper'), ['phonon', 'voz']); // prompt 54: NB-Whisper står i lista (ikke satt opp her)
  ASR._setPhonon53(undefined); ASR._setAudioDecoder53(null);
});

test('web: «Om / Lisenser» og lisensfila krediterer Desert Ant Labs og Fermion Research', () => {
  const js = readFileSync('public/js/dal53.js', 'utf8');
  assert.match(js, /Inneholder modeller fra Desert Ant Labs \(license\.desertant\.com\)/);
  assert.match(js, /Fermion Research/);
  assert.match(readFileSync('public/app.html', 'utf8'), /\/assets\/js\/dal53\.js/);
  const md = readFileSync('docs/lisenser-tredjepart.md', 'utf8');
  assert.match(md, /Inneholder modeller fra Desert Ant Labs \(license\.desertant\.com\)/);
  assert.match(md, /CC-BY-4\.0/); assert.match(md, /Apache-2\.0/);
});

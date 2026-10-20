// Prompt 35 (SERVER35): Glimt-innstillinger, TTS, brief med venner/nyhetsbilder/prøver, bildeproxy, vær for sted,
// felles parseDay(), kalendere fra iCal og Home Assistant, kalender-innstillinger og «velg flere kalendere».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p35-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-35s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.ELEVENLABS_API_KEY;
delete process.env.AZURE_SPEECH_KEY;
delete process.env.AZURE_SPEECH_REGION;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { parseDay } = await import('../server/parse-day35.js');
const w35 = await import('../server/weather35.js');
const g35 = await import('../server/glimt35.js');
const brief = await import('../server/brief34.js');
const k35 = await import('../server/kalender35.js');
const k33 = await import('../server/kalender33.js');
const cg = await import('../server/calendar-glimt.js');
const { db } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binær */ }
  return { status: r.status, body: json, buf, headers: r.headers };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const N = client({});
const TODAY = '2026-10-19'; // mandag

test('parseDay: i morgen?/imorgen/tomorrow/overmorgen/ukedager/datoer, og «i morgen?»-fiksen i Kalender-Glimt', () => {
  const d = (q) => parseDay(q, TODAY)?.date ?? null;
  assert.equal(d('hva skjer i morgen?'), '2026-10-20');
  assert.equal(d('Hva skjer imorgen'), '2026-10-20');
  assert.equal(d('i morgen?'), '2026-10-20');
  assert.equal(d("what's on tomorrow"), '2026-10-20');
  assert.equal(d('i morra'), '2026-10-20');
  assert.equal(d('overimorgen'), '2026-10-21');
  assert.equal(d('i dag!'), TODAY);
  assert.equal(d('i går'), '2026-10-18');
  assert.equal(d('hva har jeg på fredag'), '2026-10-23');
  assert.equal(d('neste fredag'), '2026-10-30');
  assert.equal(d('Finn ledig tid 24.10?'), '2026-10-24');
  assert.equal(d('25. okt'), '2026-10-25');
  assert.equal(d('1.1'), '2027-01-01');
  assert.equal(d('møte kl 9.10'), null);
  assert.equal(d('hva skjer'), null);
  assert.equal(parseDay('i morgen?', TODAY).Label, 'I morgen');
  assert.equal(k33.dayOfQuestion('Hva skjer i morgen?', TODAY), '2026-10-20');
  const ev = [{ id: 'a', title: 'Tannlege', date: '2026-10-20', start: '2026-10-20T13:15:00.000Z', end: '2026-10-20T14:00:00.000Z', allDay: false, type: 'skole' },
    { id: 'b', title: 'Kino', date: TODAY, start: '2026-10-19T18:00:00.000Z', end: '2026-10-19T20:00:00.000Z', allDay: false, type: 'skole' }];
  for (const q of ['hva skjer i morgen?', 'Hva skjer imorgen', 'i morgen?', "what's on tomorrow"]) {
    const a = cg.localAnswer(q, ev, TODAY, 600);
    assert.equal(a.from, '2026-10-20', q);
    assert.match(a.text, /^I morgen har du 1 ting/, q);
  }
});

test('Vær for sted: extractPlace, GET /api/weather/place (200/404 med forslag) og /api/assist «været i New York»', async () => {
  assert.equal(w35.extractPlace('været i new york'), 'New York');
  assert.equal(w35.extractPlace('hvordan er været i Strømstad i morgen'), 'Strømstad');
  assert.equal(w35.extractPlace('regn i Bergen?'), 'Bergen');
  assert.equal(w35.extractPlace('weather in Paris'), 'Paris');
  assert.equal(w35.extractPlace('hva blir været i morgen'), null);
  assert.equal(w35.extractPlace('været i dag i Bergen'), 'Bergen');
  const r = await A('/api/weather/place?q=New%20York');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.place).sort(), ['cc', 'country', 'label', 'lat', 'lon', 'name', 'norway', 'tz']);
  assert.equal(r.body.place.label, 'New York, USA');
  assert.equal(r.body.place.norway, false);
  assert.equal(r.body.place.tz, 'America/New_York');
  for (const k of ['temp', 'cond', 'code', 'wind']) assert.ok(k in r.body.now, k);
  for (const k of ['hi', 'lo', 'cond']) { assert.ok(k in r.body.today, k); assert.ok(k in r.body.tomorrow, k); }
  assert.match(r.body.text, /i New York, USA nå, vind \d+ m\/s\. I dag -?\d+–-?\d+°/);
  assert.deepEqual(r.body.open, { route: 'vaer', name: 'New York, USA', lat: 40.7143, lon: -74.006 });
  assert.equal((await A('/api/weather/place?q=Bergen')).body.place.label, 'Bergen');
  const nf = await A('/api/weather/place?q=Nwe%20Yrok');
  assert.equal(nf.status, 404);
  assert.deepEqual(nf.body, { error: 'Fant ikke stedet «Nwe Yrok». Prøv en annen stavemåte.', suggest: 'New York' });
  assert.equal((await A('/api/weather/place')).status, 400);
  assert.equal((await N('/api/weather/place?q=Oslo')).status, 401);
  const a = await A('/api/assist', 'POST', { q: 'været i new york' });
  assert.equal(a.status, 200);
  assert.equal(a.body.intent, 'weather');
  assert.match(a.body.text, /New York, USA/);
  assert.equal(a.body.place.label, 'New York, USA');
  assert.deepEqual(a.body.open, { route: 'vaer', name: 'New York, USA', lat: 40.7143, lon: -74.006 });
  const t = await A('/api/assist', 'POST', { q: 'weather in Paris tomorrow' });
  assert.match(t.body.text, /^I morgen blir det .* i Paris, Frankrike/);
  const bad = await A('/api/assist', 'POST', { q: 'været i Nwe Yrok' });
  assert.match(bad.body.text, /Fant ikke stedet «Nwe Yrok»\. Prøv en annen stavemåte\. Mente du \*\*New York\*\*\?/);
  const own = await A('/api/assist', 'POST', { q: 'hvordan blir været i morgen?' });
  assert.equal(own.body.open.route, 'vaer');
  assert.equal(own.body.place.label, 'Oslo');
  const kal = await A('/api/assist', 'POST', { q: 'været i Bergen i morgen?', source: 'calendar' });
  assert.equal(kal.body.intent, 'weather.daily');
  assert.match(kal.body.text, /^I morgen i Bergen: /);
});

test('Glimt-innstillinger: standard, delvis PUT per bruker, validering, alias /api/brief/settings', async () => {
  const r = await A('/api/glimt/settings');
  assert.equal(r.status, 200);
  const { engines, chars, voices, rates, host, cards, auroraNotify, jul, julPhase, snow, julSound, julActive, ...plain } = r.body; // prompt 38: cards/auroraNotify testes i p38; prompt 40: jul* testes i p40
  assert.deepEqual(plain, { char: 'glimt', friends: true, brief: true, readAloud: false, guide: true, notify: true, briefGlimt: true, // prompt 39: + briefGlimt
    briefs: { morning: { on: true, at: '06:45' }, day: { on: false, at: '12:00' }, evening: { on: true, at: '18:00' }, night: { on: false, at: '22:30' } },
    tts: { engine: 'openai', voice: 'nora', rate: 'normal', lang: 'no' } });
  assert.equal(chars.length, 13);
  assert.deepEqual(chars.map((c) => c.id), ['glimt', 'halo', 'boble', 'antenne', 'bane', 'pastell', 'natt', 'sky', 'drape', 'ugle', 'stjerne', 'spire', 'gris']);
  assert.equal(chars.find((c) => c.id === 'gris').family, 'venn');
  assert.deepEqual(engines.map((e) => e.id), ['openai', 'elevenlabs', 'azure', 'browser']);
  for (const e of engines) for (const k of ['id', 'name', 'ready', 'keySet', 'tail', 'admin']) assert.ok(k in e, `${e.id}.${k}`);
  assert.equal(engines.find((e) => e.id === 'openai').ready, false);
  assert.equal(engines.find((e) => e.id === 'browser').ready, true);
  assert.equal(engines[0].admin, true);
  assert.ok(['glimt', 'natt'].includes(host));
  assert.deepEqual(voices.map((v) => v.id), ['nora', 'henrik', 'lys']);
  assert.deepEqual(rates.map((v) => v.id), ['calm', 'normal', 'fast']);
  const p = await K('/api/glimt/settings', 'PUT', { char: 'gris', friends: false, briefs: { night: { on: true, at: '22:00' } }, tts: { lang: 'en' } });
  assert.equal(p.status, 200);
  assert.equal(p.body.char, 'gris');
  assert.equal(p.body.host, 'gris');
  assert.deepEqual(p.body.briefs.night, { on: true, at: '22:00' });
  assert.deepEqual(p.body.briefs.morning, { on: true, at: '06:45' });
  assert.equal(p.body.tts.lang, 'en');
  assert.equal(p.body.tts.voice, 'nora');
  assert.equal(p.body.engines[0].admin, false);
  assert.equal((await A('/api/glimt/settings')).body.char, 'glimt', 'per bruker');
  for (const b of [{ char: 'ku' }, { readAloud: 'ja' }, { briefs: { lunsj: { on: true } } }, { briefs: { day: { at: '25:00' } } }, { tts: { engine: 'piper' } }, { tts: { rate: 'x' } }, { hemmelig: 1 }]) {
    const x = await K('/api/glimt/settings', 'PUT', b);
    assert.equal(x.status, 400, JSON.stringify(b));
    assert.ok(Array.isArray(x.body.errors));
  }
  assert.deepEqual((await K('/api/brief/settings', 'PUT', { notify: false })).body, { notify: false, guide: true, home: true });
  assert.equal((await K('/api/glimt/settings')).body.notify, false, 'aliaset skriver til Glimt-innstillingene');
  assert.equal((await K('/api/glimt/settings', 'PUT', { guide: false })).status, 200);
  assert.deepEqual((await K('/api/brief/settings')).body, { notify: false, guide: false, home: true });
  assert.equal((await N('/api/glimt/settings')).status, 401);
});

test('uttale: kl. → klokka, 15:15 → kvart over tre, datoer, grader, kroner og ordbok', () => {
  const n = g35.normalizeSpeech;
  assert.equal(n('Neste er Tannlege kl. 15:15.'), 'Neste er Tannlege klokka kvart over tre.');
  assert.equal(n('Sola går ned 17:58'), 'Sola går ned 17 58');
  assert.equal(n('kl. 15:30 og 08:20, 12:00'), 'klokka halv fire og ti på halv ni, tolv');
  assert.equal(n('kl 9'), 'klokka ni');
  assert.equal(n('Lettskyet og **8°** i Oslo'), 'Lettskyet og 8 grader i Oslo');
  assert.equal(n('-3° og 70 %'), 'minus 3 grader og 70 prosent');
  assert.equal(n('avslutt før tir 21., ellers 149 kr/mnd'), 'avslutt før tirsdag tjueførste, ellers 149 kroner i måneden');
  assert.equal(n('Prøven slutter 1. nov'), 'Prøven slutter første november');
  assert.equal(n('«IN2010» på Grünerløkka, NRK'), 'I N tjue ti på Grynerløkka, N R K');
  assert.equal(n('I dag 5–9°'), 'I dag 5 til 9 grader');
  assert.equal(n('Tannlege kl. 15:15, 8°', 'en'), 'Tannlege at quarter past three, 8 degrees');
  assert.equal(g35.clockNo(15, 45), 'kvart på fire');
  assert.equal(g35.clockNo(15, 25), 'fem på halv fire');
  assert.equal(g35.clockEn(15, 30), 'half past three');
});

test('TTS: 503 uten nøkkel, nøkler bare for admin, mp3 med X-TTS-Engine og cache, forbruk i AI-kontroll, ekte OpenAI/ElevenLabs/Azure-kall', async () => {
  const none = await A('/api/tts', 'POST', { text: 'Hei' });
  assert.equal(none.status, 503);
  assert.equal(none.body.fallback, 'browser');
  assert.match(none.body.error, /Ingen stemmemotor/);
  assert.equal((await A('/api/tts', 'POST', {})).status, 400);
  assert.equal((await K('/api/ai/keys/openai', 'PUT', { key: 'sk-kari-123456789' })).status, 403);
  const k = await A('/api/ai/keys/openai', 'PUT', { key: 'sk-test-abcdefgh1234' });
  assert.equal(k.status, 200);
  const o = k.body.providers.find((p) => p.id === 'openai');
  assert.equal(o.set, true);
  assert.equal(o.tail, '1234');
  assert.ok(!JSON.stringify(k.body).includes('sk-test-abcdefgh1234'), 'nøkkelen sendes aldri ut');
  const ks = await K('/api/glimt/settings');
  assert.equal(ks.body.engines.find((e) => e.id === 'openai').ready, true, 'alle ser status');
  const r1 = await A('/api/tts', 'POST', { text: 'Neste er Tannlege kl. 15:15.', character: 'ugle' });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r1.headers.get('x-tts-engine'), 'mock');
  assert.equal(r1.headers.get('x-tts-cache'), 'miss');
  assert.equal(r1.buf[0], 0xff);
  const r2 = await A('/api/tts', 'POST', { text: 'Neste er Tannlege kl. 15:15.', character: 'ugle' });
  assert.equal(r2.headers.get('x-tts-cache'), 'hit');
  const u = await A('/api/ai/usage?days=1');
  const t = u.body.byTask.find((x) => x.task === 'tts');
  assert.ok(t, 'oppgave «tts» i forbruket');
  assert.equal(t.name, 'Glimt · stemme (TTS)');
  assert.equal(t.count, 1, 'cache-treff telles ikke');
  assert.equal((await A('/api/tts', 'POST', { text: 'x'.repeat(1501) })).status, 400);
  // Motor «browser» valgt → 503 med fallback.
  await K('/api/glimt/settings', 'PUT', { tts: { engine: 'browser' } });
  assert.equal((await K('/api/tts', 'POST', { text: 'Hei' })).status, 503);
  await K('/api/glimt/settings', 'PUT', { tts: { engine: 'openai' } });
  // Ekte kall (injisert fetch): riktig modell, stemme, instruks og tempo.
  const calls = [];
  g35._setTtsFetch(async (url, init) => { calls.push({ url: String(url), init }); return new Response(Buffer.from([0xff, 0xfb, 1, 2]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }); });
  try {
    await A('/api/glimt/settings', 'PUT', { tts: { voice: 'henrik', rate: 'calm' } });
    const r = await A('/api/tts', 'POST', { text: 'Hei, det er Sky!', character: 'sky' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-tts-engine'), 'openai');
    const b = JSON.parse(calls[0].init.body);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test-abcdefgh1234');
    assert.deepEqual([b.model, b.voice, b.response_format, b.speed], ['gpt-4o-mini-tts', 'ash', 'mp3', 0.85]);
    assert.match(b.instructions, /^Du er Sky/);
    await A('/api/ai/keys/elevenlabs', 'PUT', { key: 'xi-abcdefgh9876' });
    await A('/api/glimt/settings', 'PUT', { tts: { engine: 'elevenlabs', voice: 'nora', lang: 'en' } });
    await A('/api/tts', 'POST', { text: 'Hoo, Owl here.', character: 'ugle' });
    const e = calls[1];
    assert.equal(e.url, 'https://api.elevenlabs.io/v1/text-to-speech/XrExE9yKIg1WjnnlVkGX?output_format=mp3_44100_128');
    assert.equal(e.init.headers['xi-api-key'], 'xi-abcdefgh9876');
    const eb = JSON.parse(e.init.body);
    assert.deepEqual([eb.model_id, eb.language_code, eb.voice_settings.stability, eb.voice_settings.style], ['eleven_multilingual_v2', 'en', 0.75, 0.2]);
    await A('/api/ai/keys/azure', 'PUT', { key: 'az-key-123456789' });
    assert.equal((await A('/api/glimt/settings')).body.engines.find((x) => x.id === 'azure').ready, false, 'Azure trenger region');
    assert.equal((await A('/api/ai/keys/azure', 'PUT', { region: 'Norway East!' })).status, 400);
    assert.equal((await A('/api/ai/keys/azure', 'PUT', { region: 'norwayeast' })).body.providers.find((p) => p.id === 'azure').region, 'norwayeast');
    await A('/api/glimt/settings', 'PUT', { tts: { engine: 'azure', lang: 'no' } });
    await A('/api/tts', 'POST', { text: 'God natt', character: 'natt' });
    const z = calls[2];
    assert.equal(z.url, 'https://norwayeast.tts.speech.microsoft.com/cognitiveservices/v1');
    assert.match(z.init.body, /nb-NO-PernilleNeural/);
    assert.match(z.init.body, /style="whispering"/);
    // Feil fra leverandøren → 503 med fallback.
    g35._setTtsFetch(async () => new Response(JSON.stringify({ error: { message: 'Invalid key' } }), { status: 401 }));
    const f = await A('/api/tts', 'POST', { text: 'Ny tekst som ikke er cachet' });
    assert.equal(f.status, 503);
    assert.equal(f.body.fallback, 'browser');
    assert.match(f.body.error, /Azure svarte 401: Invalid key/);
  } finally { g35._setTtsFetch(null); await A('/api/glimt/settings', 'PUT', { tts: { engine: 'openai', voice: 'nora', rate: 'normal', lang: 'no' } }); }
});

test('brief: natt, 7 nyheter med signerte bilder, prøver innen 7 dager, guide med vert og venner, prøve avsluttet', async () => {
  const H = (h) => `2026-10-19T${String(h).padStart(2, '0')}:00`;
  brief._setBriefWeather(async () => ({ place: { name: 'Oslo' }, current: { temp: 8.2, code: 2, isDay: false }, today: { hi: 9, lo: 4, sunset: '2026-10-19T17:58', precipProb: 10 }, yesterday: { hi: 11 },
    days: [{ hi: 9, lo: 4, code: 2, precipProb: 10 }], hours: Array.from({ length: 24 }, (_, i) => ({ t: H(i), temp: 8, precip: 0, precipProb: 5, code: 2 })), source: 'met', credit: 'MET Norge' }));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const add = (n) => new Date(Date.parse(today + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
  const v = await A('/finans/api/subscriptions/trials', 'POST', { service: 'Viaplay', endsAt: add(2), priceAfter: 149 });
  assert.equal(v.status, 201);
  await A('/finans/api/subscriptions/trials', 'POST', { service: 'Storytel', endsAt: add(20), priceAfter: 179 });
  const t2200 = Date.parse(`${today}T20:00:00Z`); // 21:00 eller 22:00 Oslo
  const b = await brief.buildBrief('owner', { t: t2200 });
  assert.equal(b.kind, 'evening', 'nattbrief er av som standard');
  assert.equal(b.host, 'natt', 'Glimt blir Glimt Natt mellom 21 og 06');
  assert.ok(b.news.length <= 7);
  assert.equal(b.trials.length, 1);
  const tr = b.trials[0];
  for (const k of ['id', 'service', 'logo', 'endsAt', 'endsLabel', 'daysLeft', 'priceLabel', 'progress', 'cancelUrl']) assert.ok(k in tr, k);
  assert.equal(tr.service, 'Viaplay');
  assert.equal(tr.daysLeft, 2);
  assert.equal(tr.priceLabel, '149 kr/mnd');
  assert.match(tr.endsLabel, /^(man|tir|ons|tor|fre|lør|søn) \d{1,2}\.$/);
  assert.equal(tr.cancelUrl, 'https://viaplay.no/account/subscription');
  const G = Object.fromEntries(b.guide.map((g) => [g.k, g]));
  assert.deepEqual(b.guide.map((g) => g.k).filter((k) => k !== 'news'), ['hello', 'weather', 'weather2', 'calendar', 'trials', 'bye']);
  for (const g of b.guide) for (const k of ['k', 'char', 'target', 'text', 'textEn', 'action']) assert.ok(k in g, `${g.k}.${k}`);
  assert.equal(G.hello.char, 'natt');
  assert.equal(G.weather.char, 'sky');
  assert.equal(G.weather.text, 'Hei, det er Sky! Delvis skyet, 8° nå og oppholdsvær de neste 12 timene. Søylene viser nedbøren time for time.');
  assert.equal(G.weather2.text, 'Sky her igjen: sola går ned 17:58. Nå tar Glimt over!');
  assert.equal(G.calendar.char, 'ugle');
  assert.match(G.calendar.text, /^Uhu, Ugle her med kalenderen\./);
  assert.equal(G.trials.char, 'gris');
  assert.equal(G.trials.target, 'trials');
  assert.equal(G.trials.text, `Nøff! Gris her. Prøveperioden på Viaplay slutter om 2 dager. Husk å avslutte den før ${tr.endsLabel}, ellers koster den 149 kroner i måneden.`);
  assert.match(G.trials.textEn, /^Oink! Piggy here\. Your Viaplay trial ends in 2 days\./);
  // Regn → Dråpe, og ingen «Sky her igjen».
  brief._setBriefWeather(async () => ({ place: { name: 'Oslo' }, current: { temp: 6, code: 61, isDay: true }, today: { hi: 7, lo: 3, sunset: '2026-10-19T17:58', precipProb: 90 },
    days: [{ hi: 7, lo: 3, code: 61, precipProb: 90 }], hours: Array.from({ length: 24 }, (_, i) => ({ t: H(i), temp: 6, precip: 1, precipProb: 90, code: 61 })), source: 'met' }));
  const wet = await brief.buildBrief('owner', { t: Date.parse(`${today}T10:00:00Z`), kind: 'day' });
  assert.equal(wet.guide.find((g) => g.k === 'weather').char, 'drape');
  assert.ok(!wet.guide.some((g) => g.k === 'weather2'));
  assert.equal(wet.host, 'glimt');
  // Kari: Gris som vert, uten venner, nattbrief på 22:00.
  const kid = db.prepare("SELECT id FROM users WHERE username='kari'").get().id;
  const kb = await brief.buildBrief(kid, { t: Date.parse(`${today}T21:00:00Z`) }); // 22:00 eller 23:00 Oslo
  assert.equal(kb.kind, 'night');
  assert.equal(kb.title, 'Nattbrief');
  assert.match(kb.greeting, /^God natt/);
  assert.equal(kb.host, 'gris');
  assert.ok(kb.guide.every((g) => g.char === 'gris'), 'uten venner snakker bare verten');
  assert.match(kb.guide[1].text, /^Været: /);
  assert.equal(brief.nextWindow(Date.parse(`${today}T19:00:00Z`), kid) !== null, true);
  assert.deepEqual(brief.windowsOf(kid).map((w) => w[0]), ['morning', 'evening', 'night']);
  // HTTP: kind=night, 400 for ukjent kind.
  const r = await A('/api/brief?kind=night');
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Nattbrief');
  assert.ok(Array.isArray(r.body.guide) && Array.isArray(r.body.trials) && typeof r.body.host === 'string');
  assert.equal((await A('/api/brief?kind=natt')).status, 400);
  // Prøven er avsluttet.
  const d = await A(`/api/brief/trials/${v.body.id}/done`, 'POST', {});
  assert.deepEqual(d.body, { ok: true, id: v.body.id });
  assert.equal((await A('/finans/api/subscriptions/trials')).body.items.some((x) => x.id === v.body.id), false);
  assert.equal((await K(`/api/brief/trials/${v.body.id}/done`, 'POST', {})).status, 404);
  assert.equal((await brief.buildBrief('owner', { t: t2200 })).trials.length, 0);
  brief._setBriefWeather(null);
});

test('brief: nyheter med bilde via signert /api/img, toppsak først', async () => {
  const { default: rss } = await import('../server/rss.js').then((m) => ({ default: m }));
  void rss;
  db.prepare("INSERT OR IGNORE INTO rss_feed (user, name, url, enabled, category) VALUES ('owner', 'Test', 'https://test.example/rss', 1, 'auto')").run();
  const fid = db.prepare("SELECT id FROM rss_feed WHERE user='owner' AND url='https://test.example/rss'").get()?.id;
  if (fid) for (let i = 0; i < 9; i++) db.prepare('INSERT OR IGNORE INTO rss_item (feed_id, guid, title, url, published, image, excerpt) VALUES (?,?,?,?,?,?,?)').run(fid, `g${i}`, `Sak ${i}`, `https://test.example/${i}`, new Date(Date.now() - i * 60_000).toISOString(), i % 2 ? null : `https://img.example/${i}.jpg`, `Ingress ${i}`);
  const b = await brief.buildBrief('owner');
  assert.ok(b.news.length >= 1 && b.news.length <= 7);
  assert.equal(b.news[0].top, true);
  assert.ok(b.news.slice(1).every((n) => n.top === false));
  const withImg = b.news.find((n) => n.image);
  assert.ok(withImg, 'minst én sak med bilde');
  assert.match(withImg.image, /^\/api\/img\?u=https%3A%2F%2F.+&s=[0-9a-f]{20}$/);
  const img = await N(withImg.image);
  assert.equal(img.status, 200, 'signert adresse virker uten innlogging (native bildevisning)');
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.buf.subarray(1, 4).toString(), 'PNG');
  assert.equal((await N(`/api/img?u=${encodeURIComponent('https://img.example/x.jpg')}&s=feil`)).status, 401);
  assert.equal((await A(`/api/img?u=${encodeURIComponent('https://img.example/x.jpg')}`)).status, 200, 'innlogget uten signatur');
  assert.equal((await A('/api/img?u=ftp://x')).status, 400);
  assert.equal(await g35.safeUrl('http://127.0.0.1/a.png'), null);
  assert.equal(await g35.safeUrl('http://192.168.1.10/a.png'), null);
  assert.equal(await g35.safeUrl('file:///etc/passwd'), null);
  // Ekte henting (injisert): content-type sjekkes, cache på disk.
  let n = 0;
  g35._setImgFetch(async (u) => { n++; return /bad/.test(u) ? new Response('<html>', { headers: { 'content-type': 'text/html' } }) : new Response(Buffer.from([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } }); });
  try {
    const u = 'https://img.example/real.jpg';
    const x = await N(`/api/img?u=${encodeURIComponent(u)}&s=${g35.imgSig(u)}`);
    assert.equal(x.headers.get('content-type'), 'image/jpeg');
    assert.equal(x.headers.get('x-img-cache'), 'miss');
    assert.equal((await N(`/api/img?u=${encodeURIComponent(u)}&s=${g35.imgSig(u)}`)).headers.get('x-img-cache'), 'hit');
    assert.equal(n, 1);
    const bad = 'https://img.example/bad.jpg';
    assert.equal((await N(`/api/img?u=${encodeURIComponent(bad)}&s=${g35.imgSig(bad)}`)).status, 415);
  } finally { g35._setImgFetch(null); }
});

test('brief: daglig generering følger brukerens briefer og klokkeslett', async () => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  await A('/api/glimt/settings', 'PUT', { briefs: { day: { on: true, at: '12:34' } } });
  const at = (hm) => { for (const off of [1, 2]) { const t = Date.parse(`${today}T${String(+hm.slice(0, 2) - off).padStart(2, '0')}:${hm.slice(3)}:00Z`); if (new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)) === hm) return t; } return null; };
  assert.equal(await brief.runWindow(at('12:34')), 1, 'bare eieren har dagsbrief 12:34');
  assert.equal(await brief.runWindow(at('12:34')), 0, 'én gang per dag');
  assert.equal(await brief.runWindow(at('12:35')), 0);
  await A('/api/glimt/settings', 'PUT', { brief: false });
  assert.deepEqual(brief.windowsOf('owner'), []);
  await A('/api/glimt/settings', 'PUT', { brief: true, briefs: { day: { on: false, at: '12:00' } } });
});

test('Kalender: iCal-abonnement (webcal, ETag/304), HA-kalendere (admin, farger), hidMenu/source/badge, innstillinger og velg flere kalendere', async () => {
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Fotballaget', 'BEGIN:VEVENT', 'UID:t1', 'DTSTART;TZID=Europe/Oslo:20261020T180000', 'DTEND;TZID=Europe/Oslo:20261020T193000',
    'RRULE:FREQ=WEEKLY;COUNT=4', 'SUMMARY:Fotballtrening', 'LOCATION:Bislett', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  const calls = [];
  k35._setKal35Fetch(async (url, init) => {
    calls.push({ url: String(url), headers: init.headers });
    if (String(url).includes('ikke-ics')) return new Response('<html>hei</html>', { status: 200 });
    if (init.headers['If-None-Match'] === '"v1"') return new Response(null, { status: 304 });
    return new Response(ics, { status: 200, headers: { etag: '"v1"', 'last-modified': 'Mon, 19 Oct 2026 10:00:00 GMT' } });
  });
  try {
    const r = await A('/api/kalender/calendars/ical', 'POST', { url: 'webcal://lag.example.no/kalender.ics' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const cal = r.body.calendar;
    assert.equal(calls[0].url, 'https://lag.example.no/kalender.ics', 'webcal → https');
    assert.equal(cal.name, 'Fotballaget');
    assert.equal(cal.source, 'ical');
    assert.equal(cal.badge, 'Abonnement');
    assert.equal(cal.writable, false);
    assert.equal(cal.hidMenu, false);
    assert.match(cal.id, /^ical-[0-9a-f]{10}$/);
    assert.equal((await A('/api/kalender/calendars/ical', 'POST', { url: 'webcal://lag.example.no/kalender.ics' })).status, 409);
    const bad = await A('/api/kalender/calendars/ical', 'POST', { url: 'https://x.example/ikke-ics' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /iCal/);
    assert.equal((await A('/api/kalender/calendars/ical', 'POST', { url: 'ftp://x' })).status, 400);
    // Hent på nytt: If-None-Match sendes, 304 beholder kopien.
    const rf = await A(`/api/kalender/calendars/ical/${cal.id}/refresh`, 'POST', {});
    assert.equal(rf.status, 200);
    assert.equal(calls.at(-1).headers['If-None-Match'], '"v1"');
    assert.equal(calls.at(-1).headers['If-Modified-Since'], 'Mon, 19 Oct 2026 10:00:00 GMT');
    // Hendelsene kommer med i hendelseslistene, med kalenderens farge.
    const ev = await A('/api/kalender?from=2026-10-19&to=2026-11-15');
    const mine = (ev.body.events ?? []).filter((e) => e.appCalendar === cal.id);
    assert.equal(mine.length, 4);
    assert.equal(mine[0].title, 'Fotballtrening');
    assert.equal(mine[0].appColor, cal.color);
    assert.equal(mine[0].room, 'Bislett');
    // Endre farge og skjul fra menyen; listen viser det.
    const p = await A(`/api/kalender/calendars/${cal.id}`, 'PATCH', { color: '#5b4fc4', hidMenu: true });
    assert.equal(p.status, 200);
    assert.equal(p.body.calendar.hidMenu, true);
    assert.equal(p.body.calendar.color, '#5b4fc4');
    assert.equal((await A(`/api/kalender/calendars/${cal.id}`, 'PATCH', { hidMenu: 'ja' })).status, 400);
    const list = await A('/api/kalender/calendars');
    const row = list.body.calendars.find((c) => c.id === cal.id);
    assert.deepEqual([row.source, row.kind, row.badge, row.hidMenu, row.color], ['url', 'ical', 'URL', true, '#5b4fc4']); // prompt 39: ny form (source/badge), kind = gammel kilde
    const pers = list.body.calendars.find((c) => c.id === 'personlig');
    assert.deepEqual([pers.source, pers.kind, pers.badge, pers.hidMenu], ['google', 'builtin', 'GOOGLE', false]); // prompt 39: Personlig kommer fra Google
    assert.equal((await A('/api/kalender/calendars/skole', 'PATCH', { hidMenu: true })).body.calendar.hidMenu, true); // prompt 39: Jobb er slått inn i Personlig
    // Kan ikke legge nye hendelser i et abonnement.
    assert.equal((await A('/api/kalender/events', 'POST', { title: 'X', date: '2026-10-22', appCalendar: cal.id })).status, 400);
    // Kari ser ikke Sebastians abonnement.
    assert.equal((await K('/api/kalender/calendars')).body.calendars.some((c) => c.id === cal.id), false);
    assert.equal((await K(`/api/kalender/calendars/${cal.id}`, 'DELETE')).status, 404);
    assert.deepEqual((await A(`/api/kalender/calendars/${cal.id}`, 'DELETE')).body, { ok: true });
    assert.equal((await A('/api/kalender/calendars')).body.calendars.some((c) => c.id === cal.id), false);
  } finally { k35._setKal35Fetch(null); }
  // Home Assistant (mock): liste, legg til med og uten farger, bare admin.
  const ha = await A('/api/kalender/ha/calendars');
  assert.equal(ha.body.connected, true);
  assert.ok(ha.body.entities.every((e) => 'entity_id' in e && 'name' in e && e.added === false));
  const add = await A('/api/kalender/calendars/ha', 'POST', { entities: ['calendar.familie', 'calendar.soppeltomming'], colors: { 'calendar.familie': '#2F7A4F' } });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.equal(add.body.calendars.length, 2);
  assert.deepEqual(add.body.calendars.map((c) => [c.source, c.badge]), [['ha', 'HA'], ['ha', 'HA']]);
  assert.equal(add.body.calendars[0].color, '#2f7a4f');
  assert.notEqual(add.body.calendars[1].color, add.body.calendars[0].color, 'farger fordeles automatisk');
  assert.equal((await A('/api/kalender/ha/calendars')).body.entities.find((e) => e.entity_id === 'calendar.familie').added, true);
  assert.equal((await A('/api/kalender/calendars/ha', 'POST', { entities: ['calendar.finnes_ikke'] })).status, 404);
  assert.equal((await A('/api/kalender/calendars/ha', 'POST', { entities: [] })).status, 400);
  assert.equal((await K('/api/kalender/calendars/ha', 'POST', { entities: ['calendar.familie'] })).status, 403);
  assert.equal((await K('/api/kalender/ha/calendars')).body.allowed, false);
  const hev = await A('/api/kalender?from=2026-10-19&to=2026-10-26');
  assert.ok((hev.body.events ?? []).some((e) => e.appCalendar === 'ha-soppeltomming' && e.title === 'Restavfall' && e.allDay));
  assert.deepEqual((await A('/api/kalender/calendars/ha-familie', 'DELETE')).body, { ok: true });
  // Innstillinger nederst i sidemenyen: én nøkkel per kall.
  const P = (b) => A('/api/kalender/calendars/prefs', 'PUT', b);
  assert.equal((await P({ weekStart: 'sun' })).body.prefs.weekStart, 'sun');
  assert.equal((await P({ openView: '3d' })).body.prefs.openView, '3d');
  assert.equal((await P({ defaultDuration: 90 })).body.prefs.defaultDuration, 90);
  assert.equal((await P({ timelineStart: '08' })).body.prefs.timelineStart, '08');
  for (const k of ['notifyBirthdays', 'notifyDeadlines', 'notifyBrief', 'travelTime']) assert.equal((await P({ [k]: true })).body.prefs[k], true, k);
  const pr = (await A('/api/kalender/calendars')).body.prefs;
  assert.deepEqual([pr.weekStart, pr.openView, pr.defaultDuration, pr.timelineStart, pr.travelTime], ['sun', '3d', 90, '08', true]);
  for (const b of [{ weekStart: 'tue' }, { openView: 'år' }, { defaultDuration: 45 }, { timelineStart: '07' }, { travelTime: 'ja' }]) assert.equal((await P(b)).status, 400, JSON.stringify(b));
  assert.equal((await K('/api/kalender/calendars')).body.prefs.weekStart, 'mon', 'per bruker');
  // Homelab: velg flere kalendere (Bursdager → Google).
  const g = await A('/api/birthdays/google', 'PUT', { calendarIds: ['Bursdager', 'Familie', 'Jobb'] });
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.google.calendarIds, ['Bursdager', 'Familie', 'Jobb']);
  assert.equal(g.body.google.calendarId, 'Bursdager', 'calendarId = første (bakoverkompatibelt)');
  assert.deepEqual((await A('/api/birthdays/google', 'PUT', { cals: ['Personlig'] })).body.google.calendarIds, ['Personlig']);
  assert.equal((await A('/api/birthdays/google', 'PUT', { calendarIds: [] })).status, 400);
  const both = await A('/api/birthdays/google', 'PUT', { calendarId: 'Familie', calendarIds: ['Familie', 'Skole'], cals: ['Familie', 'Skole'] });
  assert.deepEqual([both.body.google.calendarId, both.body.google.calendarIds], ['Familie', ['Familie', 'Skole']], 'iOS sender calendarId + calendarIds + cals');
});

test('prøveperioder: Glimt trial.create, flervalg varsler, handlinger, siste varsel 18:00 og heldagshendelse', async () => {
  const a = await A('/api/assist', 'POST', { q: 'Storytel prøve til 25.11, 179 kr' });
  assert.equal(a.body.intent, 'trial.create');
  assert.equal(a.body.source, 'Abonnementer · varsel planlagt');
  const t = a.body.trial;
  assert.equal(t.service, 'Storytel');
  assert.equal(t.priceAfter, 179);
  const p = await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { remindOffsetsDays: [0, 1, 3, 7] });
  assert.equal(p.status, 200);
  const n = p.body.notifications;
  assert.equal(n.at(-1).kind, 'final');
  assert.equal(n.at(-1).time, '18:00');
  assert.deepEqual(n[0].actions.map((x) => x.title), ['Avslutt nå', 'Behold', 'Minn meg i morgen']);
  assert.ok(n.filter((x) => x.kind === 'reminder').length >= 3);
  const ev = await A(`/api/kalender?from=${t.endsAt}&to=${t.endsAt}`);
  assert.ok((ev.body.events ?? []).some((e) => e.title === 'Storytel-prøven slutter' && e.allDay));
  assert.equal((await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { snooze: 'tomorrow' })).status, 200);
  assert.equal((await A(`/finans/api/subscriptions/trials/${t.id}`, 'PATCH', { status: 'cancelled' })).body.status, 'cancelled');
});

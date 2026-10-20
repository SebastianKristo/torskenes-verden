// Prompt 41: verktøylag i Glimt-chatten («Glimt henter fakta»): planlegging, vær/tid/sol, faktaavsnitt og meta.facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p41-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-41';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.OLLAMA_URL = 'http://ollama.test:11434';
delete process.env.OPENWEBUI_URL;
delete process.env.OPENWEBUI_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const T = await import('../server/chat-tools41.js');
const { default: app } = await import('../server/index.js');
const chat = await import('../server/chat.js');

const EXAMPLE = 'hva er været i oslo i morgen og hvordan er vindhastighet i new york neste time.';

test('eksempelet gir to deloppgaver: Oslo i morgen (vær) og New York neste time (vind)', () => {
  const { tasks, confident } = T.planLocal(EXAMPLE);
  assert.equal(confident, true);
  assert.equal(tasks.length, 2);
  assert.deepEqual({ tool: tasks[0].tool, place: tasks[0].place, when: tasks[0].when }, { tool: 'weather', place: 'Oslo', when: 'tomorrow' });
  assert.ok(tasks[0].fields.includes('temp') && tasks[0].fields.includes('cond'));
  assert.deepEqual({ tool: tasks[1].tool, place: tasks[1].place, when: tasks[1].when }, { tool: 'weather', place: 'New York', when: 'next_hour' });
  assert.ok(tasks[1].fields.includes('wind'));
  assert.ok(!tasks[1].fields.includes('temp'));
});

test('tidsvinduene regnes i stedets lokale tid', () => {
  const now = Date.UTC(2026, 9, 20, 14, 20); // 16:20 i Oslo, 10:20 i New York (EDT)
  const ny = T.resolveWhen('next_hour', 'America/New_York', now);
  assert.deepEqual(ny.hours, ['2026-10-20T11:00']);
  assert.equal(ny.label, 'neste time');
  assert.match(ny.window, /kl\. 11–12 lokal tid/);
  const oslo = T.resolveWhen('tomorrow', 'Europe/Oslo', now);
  assert.deepEqual(oslo.dates, ['2026-10-21']);
  assert.equal(oslo.label, 'i morgen');
  // Tokyo er allerede onsdag: «i morgen» er torsdag der.
  assert.deepEqual(T.resolveWhen('tomorrow', 'Asia/Tokyo', Date.UTC(2026, 9, 20, 16, 0)).dates, ['2026-10-22']);
  assert.deepEqual(T.resolveWhen('in_3h', 'Europe/Oslo', now).hours, ['2026-10-20T19:00']);
  assert.deepEqual(T.resolveWhen('night', 'Europe/Oslo', now).hours[0], '2026-10-20T23:00');
  const we = T.resolveWhen('weekend', 'Europe/Oslo', now);
  assert.deepEqual(we.dates, ['2026-10-24', '2026-10-25']);
  assert.deepEqual(T.resolveWhen('fri', 'Europe/Oslo', now).dates, ['2026-10-23']);
});

test('tolkeren: tid, steder, felt og «her»', () => {
  const p = (q) => T.planLocal(q, { today: '2026-10-20' }).tasks.map(({ tool, place, when, fields }) => ({ tool, place, when, fields }));
  assert.deepEqual(p('blir det regn her om 3 timer'), [{ tool: 'weather', place: 'HOME', when: 'in_3h', fields: ['precip'] }]);
  assert.deepEqual(p('været i Oslo og Bergen i helga').map((t) => [t.place, t.when]), [['Oslo', 'weekend'], ['Bergen', 'weekend']]);
  assert.deepEqual(p('været i Oslo i dag og i morgen').map((t) => [t.place, t.when]), [['Oslo', 'today'], ['Oslo', 'tomorrow']]);
  const tv = p('temperatur og vind i Bergen i kveld');
  assert.equal(tv.length, 1);
  assert.equal(tv[0].when, 'tonight');
  assert.ok(['temp', 'wind', 'gust'].every((f) => tv[0].fields.includes(f)));
  assert.deepEqual(p('føles som og luftfuktighet i Bergen på fredag'), [{ tool: 'weather', place: 'Bergen', when: 'fri', fields: ['feels', 'humidity'] }]);
  assert.equal(p('UV i Roma 24.10')[0].when, '2026-10-24');
  assert.deepEqual(p('hva er klokka i New York og hvordan er været der').map((t) => [t.tool, t.place]), [['time', 'New York'], ['weather', 'New York']]);
  // Ikke faktaspørsmål.
  assert.deepEqual(p('Hvor mye brukte jeg på mat?'), []);
  assert.deepEqual(p('lag en oppskrift på varm suppe'), []);
  assert.deepEqual(p('Hei, hvordan går det?'), []);
});

test('engelsk: to deler med riktige steder og tider', () => {
  const { tasks } = T.planLocal("What's the weather in London tomorrow and the wind speed in New York in the next hour?");
  assert.deepEqual(tasks.map((t) => [t.tool, t.place, t.when]), [['weather', 'London', 'tomorrow'], ['weather', 'New York', 'next_hour']]);
  assert.ok(tasks[1].fields.includes('wind'));
  assert.deepEqual(T.planLocal('what time is it in Tokyo and when is sunset in Tromsø today').tasks.map((t) => [t.tool, t.place, t.when, t.fields.join()]),
    [['time', 'Tokyo', 'now', 'time'], ['sun', 'Tromsø', 'today', 'sunset']]);
});

test('klokka i Tokyo og solnedgang i Tromsø i dag', async () => {
  const q = 'hvor mye er klokka i Tokyo og når går sola ned i Tromsø i dag';
  assert.deepEqual(T.planLocal(q).tasks.map((t) => [t.tool, t.place, t.when]), [['time', 'Tokyo', 'now'], ['sun', 'Tromsø', 'today']]);
  const r = await T.gatherFacts(q);
  assert.equal(r.facts.length, 2);
  const [tk, tr] = r.facts;
  assert.equal(tk.tool, 'time'); assert.equal(tk.tz, 'Asia/Tokyo'); assert.equal(tk.country, 'Japan');
  assert.equal(tk.values.time, T.localNow('Asia/Tokyo').hm);
  assert.equal(tk.values.utcOffset, 'UTC+9');
  assert.equal(tr.tool, 'sun'); assert.equal(tr.place, 'Tromsø');
  assert.match(tr.values.sunset, /^\d{2}:\d{2}$/);
  assert.equal(tr.values.sunrise, undefined); // bare det som ble spurt om
  assert.deepEqual(r.used, ['Tid · Tokyo', 'Sol · Tromsø']);
});

test('eksempelet: fakta med riktige vinduer, kilder og enheter', async () => {
  const r = await T.gatherFacts(EXAMPLE);
  assert.equal(r.facts.length, 2);
  const [o, ny] = r.facts;
  assert.equal(o.place, 'Oslo'); assert.equal(o.when, 'i morgen'); assert.equal(o.source, 'MET');
  assert.equal(o.date, T.addDays(T.localNow('Europe/Oslo').date, 1));
  assert.match(o.label, /°C/);
  assert.equal(ny.place, 'New York'); assert.equal(ny.country, 'USA'); assert.equal(ny.when, 'neste time'); assert.equal(ny.source, 'Open-Meteo');
  assert.equal(ny.tz, 'America/New_York');
  const h = (T.localNow('America/New_York').hour + 1) % 24;
  assert.match(ny.window, new RegExp(`kl\\. ${String(h).padStart(2, '0')}–`));
  assert.equal(typeof ny.values.wind, 'number');
  assert.match(ny.label, /m\/s/);
  assert.deepEqual(r.used, ['Vær · Oslo', 'Vær · New York']);
  const sys = T.factsPrompt(r.facts);
  assert.match(sys, /^Fakta hentet nå \(bruk disse, ikke gjett\):/);
  assert.match(sys, /1\. Vær · Oslo, Norge · i morgen/);
  assert.match(sys, /2\. Vær · New York, USA · neste time/);
  assert.match(sys, /alle 2 delene/);
  assert.match(sys, /ikke markdown-tabeller/);
});

test('ukjent sted stopper ikke resten', async () => {
  const r = await T.gatherFacts('hva er været i Xyzqwe i morgen og hva er klokka i Tokyo');
  assert.equal(r.facts.length, 2);
  assert.equal(r.facts[0].error, 'Fant ikke stedet «Xyzqwe»');
  assert.equal(r.facts[1].tool, 'time');
  assert.ok(!r.facts[1].error);
  assert.deepEqual(r.used, ['Tid · Tokyo']);
  assert.match(T.factsPrompt(r.facts), /Fant ikke stedet «Xyzqwe»/);
});

test('ingen nett: været feiler, klokka svarer likevel', async () => {
  T._setTools41Fetch(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); });
  try {
    const r = await T.gatherFacts('hvordan er vinden i Stavanger i overmorgen og hva er klokka i London');
    assert.equal(r.facts.length, 2);
    assert.match(r.facts[0].error, /^Fikk ikke hentet været for Stavanger/);
    assert.equal(r.facts[1].tool, 'time'); assert.ok(!r.facts[1].error);
  } finally { T._setTools41Fetch(null); }
});

test('ekte prognose: Open-Meteo med timezone=auto og m/s', async () => {
  const urls = [];
  T._setTools41Fetch(async (url) => {
    urls.push(String(url));
    const tz = 'America/New_York';
    const fc = T.mockForecast({ lat: 40.7, lon: -74, norway: false }, tz);
    return Response.json({ timezone: tz, hourly: fc.hourly, daily: fc.daily });
  });
  try {
    const r = await T.gatherFacts('vindkast i New York om 2 timer');
    assert.equal(r.facts[0].source, 'Open-Meteo');
    assert.equal(typeof r.facts[0].values.gust, 'number');
    assert.ok(urls.some((u) => /api\.open-meteo\.com\/v1\/forecast/.test(u) && /timezone=auto/.test(u) && /wind_speed_unit=ms/.test(u) && /hourly=/.test(u) && /daily=/.test(u)));
  } finally { T._setTools41Fetch(null); }
});

test('LLM-planen brukes bare når tolkeren er usikker, og valideres', async () => {
  let calls = 0;
  T._setPlan41Llm(async () => { calls++; return { tasks: [{ tool: 'weather', place: 'Bergen', when: 'tomorrow', fields: ['temp', 'bogus'] }, { tool: 'hack', place: 'x' }] }; });
  try {
    const sure = await T.planQuestion(EXAMPLE);
    assert.equal(sure.via, 'lokal'); assert.equal(calls, 0);
    const unsure = await T.planQuestion('været i Oslo og bergen');
    assert.equal(calls, 1); assert.equal(unsure.via, 'llm');
    assert.deepEqual(unsure.tasks, [{ tool: 'weather', place: 'Bergen', when: 'tomorrow', fields: ['temp'] }]);
    T._setPlan41Llm(async () => { throw new Error('nede'); });
    const fb = await T.planQuestion('været i Oslo og bergen');
    assert.equal(fb.via, 'lokal'); assert.equal(fb.tasks.length, 2);
  } finally { T._setPlan41Llm(null); }
});

/* ---------------- Gjennom /api/chat/send ---------------- */

async function login() {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1' }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const cookie = await login();
const post = async (path, body) => {
  const r = await app.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
const sse = (text) => text.split(/\n\n+/).filter(Boolean).map((blk) => ({ event: blk.match(/^event: (.+)$/m)?.[1] ?? 'message', data: JSON.parse(blk.match(/^data: (.*)$/m)?.[1] ?? 'null') }));

test('chat (MOCK): svaret bruker faktaene, svarer på begge delene og lagrer meta.facts', async () => {
  const r = await post('/api/chat/send', { model: 'qwen3:8b', messages: [{ role: 'user', content: EXAMPLE }] });
  assert.equal(r.status, 200, r.text);
  const ev = sse(r.text);
  const facts = ev.find((e) => e.event === 'facts')?.data;
  assert.equal(facts.facts.length, 2);
  const text = ev.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.match(text, /^I morgen \(.+\) i Oslo: /);
  assert.match(text, /Neste time \(kl\. \d{2}–\d{2} lokal tid\) i New York, USA: vind \d+ m\/s/);
  const done = ev.find((e) => e.event === 'done').data;
  assert.deepEqual(done.used.slice(0, 2), ['Vær · Oslo', 'Vær · New York']);
  assert.equal(done.facts.length, 2);
  assert.deepEqual(Object.keys(done.facts[1]).filter((k) => ['tool', 'place', 'country', 'when', 'label', 'values', 'source'].includes(k)).sort(), ['country', 'label', 'place', 'source', 'tool', 'values', 'when']);
  const saved = await (await app.request(`/api/chat/chats/${done.chatId}`, { headers: { cookie } })).json();
  const a = saved.messages.at(-1);
  assert.equal(a.role, 'assistant');
  assert.equal(a.meta.facts.length, 2);
  assert.deepEqual(a.meta.used.slice(0, 2), ['Vær · Oslo', 'Vær · New York']);
});

test('chat (motor): faktaavsnittet ligger i systemprompten; vanlige spørsmål får ingen fakta', async () => {
  const bodies = [];
  const enc = (s) => new TextEncoder().encode(s);
  chat._setChatFetch(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3:8b', size: 5e9 }] });
    if (u.endsWith('/api/chat')) {
      bodies.push(JSON.parse(init.body));
      return new Response(new ReadableStream({ start(c) { c.enqueue(enc(JSON.stringify({ message: { content: 'Ok.' } }) + '\n')); c.enqueue(enc(JSON.stringify({ done: true, eval_count: 2, eval_duration: 1e8 }) + '\n')); c.close(); } }));
    }
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  });
  try {
    const r = await post('/api/chat/send', { model: 'qwen3:8b', messages: [{ role: 'user', content: 'hvor mye er klokka i Tokyo og når går sola ned i Tromsø i dag' }] });
    assert.equal(r.status, 200, r.text);
    assert.equal(bodies.length, 1, r.text);
    const sys = bodies[0].messages.find((m) => m.role === 'system').content;
    assert.match(sys, /Fakta hentet nå \(bruk disse, ikke gjett\):/);
    assert.match(sys, /1\. Tid · Tokyo, Japan/);
    assert.match(sys, /2\. Sol · Tromsø, Norge · i dag/);
    assert.match(sse(r.text).filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), /Ok\./);
    const r2 = await post('/api/chat/send', { model: 'qwen3:8b', messages: [{ role: 'user', content: 'Lag en Docker Compose-fil for Ollama' }] });
    assert.ok(!sse(r2.text).some((e) => e.event === 'facts'));
    const done = sse(r2.text).find((e) => e.event === 'done');
    if (done) assert.equal(done.data.facts, undefined);
  } finally { chat._setChatFetch(null); }
});

test('Glimt (/api/assist, source chat) sender sammensatte faktaspørsmål videre til chatten', async () => {
  const r = await post('/api/assist', { q: EXAMPLE, source: 'chat' });
  assert.equal(r.status, 200);
  const j = JSON.parse(r.text);
  assert.equal(j.followUp, 'chat');
  assert.equal(T.needsChatTools('Hva er været i Bergen i dag?'), false); // ett sted, vanlig Glimt-kort
  assert.equal(T.needsChatTools('hva er klokka i Tokyo'), true);
});

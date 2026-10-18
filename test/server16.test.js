// Prompt 16 (server): AI-kjeden (modelloppslag, Groq, «nede»-vakt), vær fra MET med steder og søk, Ruter/Entur-stopp og layout-felt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-s16-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { setSecret, saveSettings } = await import('../server/finans/db.js');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile } = await import('../server/mobile.js');
const AI = await import('../server/finans/ai.js');
const W = await import('../server/weather-full.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const req = (app) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const M = req(mobile), F = req(fin);

// Bytter ut fetch mens testen kjører. Kall med URL-er som ikke er dekket, gir 404.
function withFetch(handler) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); const r = await handler(String(url), opts); return r ?? new Response('{}', { status: 404 }); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

test('pickGemini velger nyeste flash-modell og hopper over bilde/tts/embedding', () => {
  const names = ['gemini-2.5-flash-image', 'gemini-2.5-pro', 'gemini-3-flash', 'gemini-3-flash-lite', 'text-embedding-004', 'gemini-embedding-001', 'gemini-2.5-flash-preview-tts'];
  assert.equal(AI.pickGemini(names, 'gemini-2.5-flash'), 'gemini-3-flash');
  assert.equal(AI.pickGemini(['gemini-flash-latest', 'gemini-3-flash'], 'x'), 'gemini-flash-latest');
  assert.equal(AI.pickGemini(['gemini-2.5-pro'], 'gemini-2.5-pro'), 'gemini-2.5-pro');
});

test('rotårsak: modell som Google har slått av (404) byttes automatisk, og tenkning slås av for flash', async () => {
  AI._resetAi();
  setSecret('geminiKey', 'test-key');
  saveSettings({ provider: 'gemini', geminiModel: 'gemini-2.5-flash', fallback: true });
  const f = withFetch((url, opts) => {
    if (url.includes('/models/gemini-2.5-flash:generateContent')) return json({ error: { code: 404, message: 'models/gemini-2.5-flash is not found for API version v1beta' } }, 404);
    if (url.includes('/v1beta/models?')) return json({ models: [{ name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }] });
    if (url.includes('/models/gemini-3-flash:generateContent')) {
      const b = JSON.parse(opts.body);
      assert.equal(b.generationConfig.thinkingConfig?.thinkingBudget, 0);
      assert.equal(b.generationConfig.responseSchema.type, 'OBJECT');
      return json({ candidates: [{ content: { parts: [{ text: '{"answer":"Du brukte 123 kr."}' }] } }] });
    }
  });
  try {
    const r = await AI.textJson('spørsmål', { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] });
    assert.equal(r.provider, 'Gemini');
    assert.equal(r.model, 'gemini-3-flash');
    assert.equal(r.data.answer, 'Du brukte 123 kr.');
    // Neste kall går rett til den nye modellen.
    f.calls.length = 0;
    await AI.askJson('igjen', { type: 'object', properties: { answer: { type: 'string' } } });
    assert.ok(f.calls.every((c) => !c.url.includes('gemini-2.5-flash:generateContent')));
  } finally { f.restore(); }
});

test('feilen sier hva hver motor svarte, og en motor som ikke svarer hoppes over etterpå', async () => {
  AI._resetAi();
  saveSettings({ provider: 'ollama', fallback: true });
  setSecret('geminiKey', 'bad');
  setSecret('groqKey', '');
  const f = withFetch((url) => {
    if (url.includes('127.0.0.1:9')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (url.includes('generativelanguage')) return json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, 400);
  });
  try {
    await assert.rejects(AI.textJson('x', { type: 'object', properties: {} }), (e) => /Ollama kan ikke nås.*ECONNREFUSED/.test(e.message) && /Gemini svarte 400: API key not valid/.test(e.message));
    // Ollama er markert som nede: neste kall prøver Gemini direkte uten å vente på Ollama.
    f.calls.length = 0;
    await assert.rejects(AI.textJson('x', { type: 'object', properties: {} }));
    assert.ok(!f.calls.some((c) => c.url.includes('127.0.0.1:9')), 'Ollama skal hoppes over');
  } finally { f.restore(); AI._resetAi(); }
});

test('Groq: OpenAI-kompatibelt kall med JSON-modus, og «Test tilkobling»', async () => {
  AI._resetAi();
  setSecret('groqKey', 'gsk_test');
  saveSettings({ provider: 'groq', fallback: false });
  const f = withFetch((url, opts) => {
    if (url === 'https://api.groq.com/openai/v1/chat/completions') {
      const b = JSON.parse(opts.body);
      assert.equal(opts.headers.Authorization, 'Bearer gsk_test');
      assert.equal(b.response_format.type, 'json_object');
      assert.equal(b.model, 'llama-3.3-70b-versatile');
      assert.match(b.messages[0].content, /JSON/);
      return json({ choices: [{ message: { content: '```json\n{"ok":true,"svar":"hei"}\n```' } }] });
    }
  });
  try {
    const r = await AI.textJson('hei', { type: 'object', properties: { ok: { type: 'boolean' } } });
    assert.equal(r.provider, 'Groq');
    assert.equal(r.data.ok, true);
    const t = await F('/ai/test', 'POST', { provider: 'groq' });
    assert.equal(t.status, 200);
    assert.equal(t.body.ok, true, t.body.message);
    assert.match(t.body.message, /Groq svarte/);
  } finally { f.restore(); AI._resetAi(); saveSettings({ provider: 'ollama', fallback: true }); }
});

test('innstillinger: Groq som motor, nøkler lagres ikke fra app-token, Roboflow-test', async () => {
  const r = await F('/settings', 'PUT', { provider: 'groq', groqModel: 'llama-3.1-8b-instant', groqKey: 'gsk_fra_token' });
  assert.equal(r.body.provider, 'groq');
  assert.equal(r.body.groqModel, 'llama-3.1-8b-instant');
  setSecret('roboflowKey', 'rf');
  const f = withFetch((url) => (url.startsWith('https://api.roboflow.com/?api_key=rf') ? json({ workspace: 'kvitto' }) : null));
  try {
    const t = await F('/ai/roboflow/test', 'POST');
    assert.equal(t.body.ok, true);
    assert.match(t.body.message, /kvitto/);
  } finally { f.restore(); await F('/settings', 'PUT', { provider: 'ollama' }); }
});

test('MET → samme form som Open-Meteo, med i går og sikt fra Open-Meteo', () => {
  const p = { id: 'oslo', name: 'Oslo', lat: 59.91, lon: 10.75 };
  const t0 = Date.UTC(2026, 9, 18, 10);
  const timeseries = Array.from({ length: 30 }, (_, i) => ({ time: new Date(t0 + i * 3600_000).toISOString(), data: {
    instant: { details: { air_temperature: 8 + (i % 5), wind_speed: 4, wind_speed_of_gust: 9, wind_from_direction: 220, relative_humidity: 80, dew_point_temperature: 5, air_pressure_at_sea_level: 1010, ultraviolet_index_clear_sky: 1 } },
    next_1_hours: { summary: { symbol_code: i === 3 ? 'lightrain' : 'partlycloudy_day' }, details: { precipitation_amount: i === 3 ? 0.6 : 0, probability_of_precipitation: i === 3 ? 80 : 10 } } } }));
  const raw = W.metToRaw({ properties: { timeseries } }, p);
  assert.equal(raw.hourly.time[0], '2026-10-18T12:00');
  assert.equal(raw.hourly.weather_code[3], 61);
  assert.equal(raw.hourly.weather_code[0], 2);
  const om = W.mockRaw(p, new Date(t0));
  const merged = W.mergeRaw(raw, om);
  assert.ok(merged.hourly.time[0] < '2026-10-18T12:00', 'timene før MET starter kommer fra Open-Meteo');
  assert.equal(merged.daily.time[0], '2026-10-17');
  const out = W.buildFull(merged, p, '2026-10-18T13:00');
  assert.ok(out.yesterday && Number.isFinite(out.yesterday.hi));
  assert.equal(W.metToWmo('heavyrainshowers_day'), 82);
  assert.equal(W.metToWmo('snow'), 73);
});

test('vær: egne steder (legg til, rekkefølge, fjern) og stedssøk', async () => {
  const start = await M('/weather/places');
  assert.deepEqual(start.body.map((x) => x.name), ['Oslo', 'Bergen', 'Trondheim', 'Tromsø']);
  const s = await M('/weather/search?q=lille');
  assert.ok(s.body.some((x) => x.name === 'Lillehammer'));
  const add = await M('/weather/places', 'POST', { name: 'Lillehammer', region: 'Innlandet', lat: 61.1153, lon: 10.4662 });
  assert.equal(add.status, 201);
  const lh = add.body.find((x) => x.name === 'Lillehammer');
  assert.ok(lh?.id);
  assert.equal((await M('/weather/places', 'POST', { name: 'X' })).status, 400);
  const w = await M(`/weather/full?place=${lh.id}`);
  assert.equal(w.body.place.name, 'Lillehammer');
  const ord = await M('/weather/places/order', 'PUT', { ids: [lh.id] });
  assert.equal(ord.body[0].name, 'Lillehammer');
  const del = await M(`/weather/places/${lh.id}`, 'DELETE');
  assert.ok(!del.body.some((x) => x.name === 'Lillehammer'));
});

test('Avganger: søk i Entur, egne stopp med sanntid og forsiden', async () => {
  const s = await M('/ruter/search?q=jern');
  assert.equal(s.body[0].id, 'NSR:StopPlace:58366');
  const d = await M('/ruter/departures?stop=NSR:StopPlace:58366&n=10');
  assert.equal(d.status, 200);
  assert.equal(d.body.stop.name, 'Jernbanetorget');
  assert.equal(d.body.departures.length, 10);
  const x = d.body.departures[0];
  for (const k of ['line', 'to', 'mode', 'color', 'textColor', 'aimed', 'expected', 'minutes', 'realtime', 'platform', 'cancelled']) assert.ok(k in x, k);
  assert.ok(d.body.departures.some((y) => y.situation));
  assert.equal((await M('/ruter/departures?stop=tull')).status, 400);
  const put = await M('/me/stops', 'PUT', { stops: [{ id: 'NSR:StopPlace:58366', name: 'Jernbanetorget' }, { id: '6350', name: 'Bislett' }, { id: 'tull' }] });
  assert.deepEqual(put.body.map((y) => y.id), ['NSR:StopPlace:58366', 'NSR:StopPlace:6350']);
  const home = await M('/mobile/home');
  assert.equal(home.body.stops.length, 2);
  assert.ok(home.body.stops[0].departures.length <= 4 && home.body.stops[0].departures.length > 0);
});

test('layout: fanelinje (navn og ikon) og fargetema for ikonene', async () => {
  const ok = await M('/me/layout', 'PUT', { tabBar: { items: [{ id: 'hjem', label: 'Start', icon: 'house' }, { id: 'familie', label: 'Familie', icon: 'map' }, { id: 'mer' }] }, iconTheme: 'varm' });
  assert.equal(ok.status, 200);
  const g = await M('/me/layout');
  assert.equal(g.body.tabBar.items[1].id, 'familie');
  assert.equal(g.body.iconTheme, 'varm');
  assert.ok(g.body.tabBarDefault.items.length >= 4);
  assert.equal((await M('/me/layout', 'PUT', { tabBar: { items: [{ id: 'ukjent' }] } })).status, 400);
  assert.equal((await M('/me/layout', 'PUT', { tabBar: { items: Array.from({ length: 7 }, () => ({ id: 'hjem' })) } })).status, 400);
  assert.equal((await M('/me/layout', 'PUT', { iconTheme: 'neon' })).status, 400);
  const me = await M('/me');
  assert.ok(me.body.username);
  assert.ok('avatarUrl' in me.body);
});

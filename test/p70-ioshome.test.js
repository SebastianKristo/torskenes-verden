// Prompt 70 (IOSHOME70): iOS Hjem – størrelse ↔ på widgets, scroll mens Glimt svarer, nytt mikrofon-UI.
// Ingen Swift-kompilator i sandkassen: kildesjekker av det som er lett å ødelegge, pluss at serveren tar vare på pages.hjem.sz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Kode uten kommentarer (så forklaringer om det gamle laget ikke teller). */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('widget-størrelse: håndtak, eget Layout og lagring av sz', () => {
  const g = code('Home70Grid.swift');
  assert.match(g, /struct Home70GridLayout: Layout/);
  assert.match(g, /Home52Rows\.rows\(keys, half: half, tall: tall\)/, 'samme radlogikk som prompt 52');
  assert.match(g, /fixed: Set<String> = \["h1", "h16"\]/, 'Søk og Snarveier er alltid fulle');
  assert.match(g, /return Swift\.abs\(dx\) <= 40/, 'halv → full ved mer enn 40 pt uansett retning');
  assert.match(g, /return dx < -40/, 'full → halv ved mer enn 40 pt mot venstre');
  assert.match(g, /DragGesture\(minimumDistance: 0, coordinateSpace: \.global\)/);
  assert.match(g, /h\["sz"\] = sz/, 'sz følger med når pages.hjem lagres');
  const w = code('WiggleList43.swift');
  assert.match(w, /Home70GridLayout\(half: half, tall: tall, spacing: spacing\)/);
  assert.match(w, /\.layoutValue\(key: Home70KeyLV\.self, value: k\)/);
  assert.match(w, /Home70Handle\(key: k, isHalf: half\.contains\(k\)/);
  assert.doesNotMatch(w, /row52\(/, 'ingen HStack/VStack-rader som bygger cellene på nytt ved bytte');
  assert.match(code('PaperPages.swift'), /Home70Size\.shared\.half\(Home52\.half\)/);
  assert.match(code('PaperStore.swift'), /Home70Size\.shared\.inject\(body\)/);
  assert.match(code('Paper15.swift'), /Home70Size\.shared\.take\(pages\)/);
});

test('scroll mens Glimt svarer: ingen fullskjerm-lag, sveip bare fra grepet, trykk utenfor', () => {
  const a = code('Assist38.swift');
  const catcher = a.slice(a.indexOf('struct Assist38Catcher'), a.indexOf('struct Assist38CloseButton'));
  assert.doesNotMatch(catcher, /DragGesture|contentShape|onTapGesture/, 'laget over Hjem er borte');
  assert.match(catcher, /Assist70Pill\(\)/);
  const swipe = a.slice(a.indexOf('struct Assist38Swipe'));
  assert.match(swipe, /\.overlay\(alignment: \.bottom\) \{ grip \}/);
  assert.match(swipe, /\.frame\(height: 30\)/);
  assert.equal((swipe.match(/DragGesture\(/g) || []).length, 1, 'én drag-gest, på grepet');
  const h = code('Home70Assist.swift');
  assert.match(h, /\.simultaneousGesture\(\s*SpatialTapGesture/);
  assert.match(h, /guard a\.homeAnswer != nil, !a\.homeBusy else \{ return \}/, 'tenker: lukkes bare med ✕');
  assert.match(h, /Glimt svarte ↑/);
  assert.match(h, /d\.scrollTarget = "h1"/);
  assert.match(code('PaperPages.swift'), /\.assist70Tap\(\)/);
  assert.match(code('HomeSearch29.swift'), /\.assist70Track\(\)/);
});

test('mikrofon: nytt ikon, opptakskort med × · bølge · ■ · ↑, serveren viser ikke live tekst', () => {
  const m = code('Home70Mic.swift');
  assert.match(m, /struct Home70MicGlyph: Shape/);
  assert.match(m, /Color\(hex: "#C8633F"\)/, 'send er terrakotta');
  assert.match(m, /"Snakk nå …"/);
  assert.match(m, /"Skriver ned …"/);
  assert.match(m, /cornerRadius: 26/);
  // Prompt 71: prøvene tas fortsatt ~11/s, men bølgen tegnes av TimelineView(.animation) i sin egen lille visning.
  assert.match(m, /static let every: Double = 0\.09/, 'egen prøvetakt i bølgen (~11/s)');
  const s = code('HomeSearch29.swift');
  assert.match(s, /home70: true/);
  assert.match(s, /Home70RecCard\(text: dev \? live70 : ""/, 'live tekst bare med motoren på enheten');
  assert.doesNotMatch(s, /onText: \{ \(t: String\) in q = t \}/, 'teksten fra enheten går ikke rett i feltet lenger');
  const v = code('Voice56.swift');
  assert.match(v, /Home70MicButton\(ink: ink, label: label\)/);
  // Ingen /* inne i blokkommentarer i de nye filene.
  for (const f of ['Home70Grid.swift', 'Home70Assist.swift', 'Home70Mic.swift']) {
    const t = read(f);
    assert.equal((t.match(/\/\*/g) || []).length, (t.match(/\*\//g) || []).length, f);
  }
});

test('serveren beholder pages.hjem.sz (order, hidden og sz lagres sammen)', async () => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p70ios-'));
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-70ios';
  process.env.USER_NAME = 'Sebastian';
  process.env.MOCK_DATA = '1';
  process.env.OLLAMA_URL = 'http://127.0.0.1:9';
  const { hashPassword } = await import('../server/password.js');
  process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
  const { default: fin } = await import('../server/finans/routes.js');
  const { default: mobile } = await import('../server/mobile.js');
  const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
  const { token } = await login.json();
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const M = async (path, method = 'GET', body) => {
    const r = await mobile.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const hjem = { order: ['h12', 'h1', 'h9'], hidden: ['h2'], sz: { h9: 'full', h5: 'half' } };
  assert.equal((await M('/me/layout', 'PUT', { pages: { hjem } })).status, 200);
  assert.equal((await M('/me/layout', 'PUT', { pages: { finans: { order: ['f1'], hidden: [] } } })).status, 200);
  const r = await M('/me/layout');
  assert.deepEqual(r.body.pages.hjem, hjem);
  assert.deepEqual(r.body.pages.finans, { order: ['f1'], hidden: [] });
  // iOS og Android har ulike kort-id-er i samme pages.hjem: sz slås sammen, og lagring uten sz nullstiller ikke.
  assert.equal((await M('/me/layout', 'PUT', { pages: { hjem: { order: ['h52fi'], hidden: [], sz: { h52fi: 'full' } } } })).status, 200);
  assert.equal((await M('/me/layout', 'PUT', { pages: { hjem: { order: ['h52fi', 'h9'], hidden: [] } } })).status, 200);
  const r2 = await M('/me/layout');
  assert.deepEqual(r2.body.pages.hjem.sz, { h9: 'full', h5: 'half', h52fi: 'full' });
  assert.deepEqual(r2.body.pages.hjem.order, ['h52fi', 'h9']);
});

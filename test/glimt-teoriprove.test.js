// Glimt tolket en innlimt melding fra Statens vegvesen om teoriprøven som en prøveperiode («Jeg minner deg på å avslutte Hei …
// dagen før prøven slutter»). To feil: tekstregelen så «prøve» inne i «teoriprøve» og godtok første ord med stor forbokstav
// («Hei») som tjeneste, og den overstyrte det modellen hadde planlagt. Modellen skal forstå meldingen; reglene er bare hint og
// reserve når modellen er nede, og de skal ikke gjette prøveperiode ut fra et ord inne i et annet ord.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-teoriprove-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-teori';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

await import('../server/index.js');
const { db } = await import('../server/db.js');
const A = await import('../server/glimt/assist.js');
const E = await import('../server/glimt/engine.js');
const P = await import('../server/glimt/plan.js');
const { serviceOf, isTrialText } = await import('../public/js/trial-parse.js');
// public/js/assist.js trenger DOM; regelen for web-reserven leses fra kilden.
const { readFileSync } = await import('node:fs');
const webTrialRe = (() => { const m = readFileSync(new URL('../public/js/assist.js', import.meta.url), 'utf8').match(/^\s*trial:\s*(\/.+\/[a-z]*),\s*$/m); return m ? new Function(`return ${m[1]}`)() : null; })();

const TODAY = '2026-11-21';
E._setClock45({ today: TODAY, nowMin: 22 * 60 });
const SEB = db.prepare("SELECT id FROM users WHERE username='sebastian'").get()?.id ?? 'owner';
const trials = () => db.prepare('SELECT * FROM trials WHERE user_id=?').all(SEB);

// Slik meldingene fra Statens vegvesen ser ut (alle fire ga «Jeg minner deg på å avslutte Hei …» før rettingen).
const VEGVESEN = 'Hei! Påminnelse: Du har teoriprøve 21.12.2026 kl. 09:00 ved Lillestrøm trafikkstasjon. Ta med gyldig legitimasjon. Mvh Statens vegvesen';
const VARIANTER = [
  VEGVESEN,
  'Hei. Du har bestilt teoriprøve for klasse B 21.12.2026 klokken 09:00 på Lillestrøm trafikkstasjon. Husk legitimasjon. Statens vegvesen',
  'Hei Sebastian. Dette er en påminnelse om teoriprøven din mandag 21. desember kl. 09.00. Oppmøte 15 minutter før. Vennlig hilsen Statens vegvesen',
  'Statens vegvesen: Teoriprøve 21.12 kl 09:00, Lillestrøm. Avbestill senest 48 timer før prøven.',
];
const ANDRE = [
  ...VARIANTER,
  'Hei, påminnelse om førerprøve 14.01.2027 kl. 10:30 på Risløkka trafikkstasjon',
  'Hei! Blodprøve hos fastlegen tirsdag 24.11 kl. 08:15',
  'Hei, du har time til oppkjøring 3. desember kl. 12. Avbestill senest 48 timer før.',
];

test('Tekstreglene: «teoriprøve», «førerprøve» og «blodprøve» er ikke prøveperioder, og «Hei» er ikke en tjeneste', () => {
  for (const s of ANDRE) assert.notEqual(A.detectIntent(s, TODAY), 'trial.create', s);
  // Planleggeren får ikke lenger hintet «app.answer(trial)»: modellen bestemmer selv.
  for (const s of VARIANTER) assert.doesNotMatch(E.hintOf47(null, A.detectIntent(s, TODAY)), /trial/, s);
  assert.equal(serviceOf('Hei! Du har time til teoriprøve'), '', 'en hilsen er ikke et tjenestenavn');
  assert.equal(isTrialText(VEGVESEN), false, 'teoriprøve inneholder ikke ordet «prøve»');
  assert.ok(webTrialRe, 'fant regelen i public/js/assist.js');
  assert.equal(webTrialRe.test(VEGVESEN.toLowerCase()), false, 'web-reserven uten nett ser heller ikke en prøveperiode');
  // Prøveperiodene virker som før.
  assert.equal(A.detectIntent('Viaplay gratis i 14 dager, påminn meg om å avslutte', TODAY), 'trial.create');
  assert.equal(A.detectIntent('Storytel prøve til 25.11, 179 kr', TODAY), 'trial.create');
  assert.equal(A.detectIntent('Kindle Unlimited prøveperiode til 30.12', TODAY), 'trial.create');
  assert.equal(isTrialText('Netflix prøven slutter 3.12'), true);
});

test('Modellen planla en kalenderhendelse: Glimt legger teoriprøven i kalenderen, ikke i Abonnementer', async () => {
  P._setGlimtModel45(async () => ({ data: { intent: 'create', module: 'calendar', calls: [{ tool: 'calendar.create', args: { title: 'Teoriprøve klasse B', location: 'Lillestrøm trafikkstasjon', date: '2026-12-21', time: '09:00' } }] }, model: 'mock' }));
  P._setToolMode45('json');
  try {
    const before = trials().length;
    const r = await A.answer(SEB, VEGVESEN, { today: TODAY });
    assert.notEqual(r.intent, 'trial.create', JSON.stringify(r).slice(0, 400));
    assert.doesNotMatch(r.text ?? '', /avslutte|prøven slutter/);
    assert.equal(trials().length, before, 'ingen prøveperiode lagret');
  } finally { P._setGlimtModel45(null); P._setToolMode45(null); }
});

test('Modellen svarte uten verktøy (app.answer): tekstreglene gjør det ikke om til en prøveperiode', async () => {
  P._setGlimtModel45(async () => ({ data: { intent: 'ask', module: 'home', calls: [{ tool: 'app.answer', args: { topic: 'other' } }] }, model: 'mock' }));
  P._setToolMode45('json');
  try {
    const before = trials().length;
    const r = await A.answer(SEB, VEGVESEN, { today: TODAY });
    assert.notEqual(r.intent, 'trial.create', JSON.stringify(r).slice(0, 400));
    assert.equal(trials().length, before);
  } finally { P._setGlimtModel45(null); P._setToolMode45(null); }
});

test('Uten modell (reserven): ingen av meldingene blir en prøveperiode', async () => {
  const before = trials().length;
  for (const v of VARIANTER) {
    const r = await A.answer(SEB, v, { today: TODAY });
    assert.notEqual(r.intent, 'trial.create', v);
    assert.doesNotMatch(r.text ?? '', /avslutte|prøven slutter/, v);
  }
  assert.equal(trials().length, before);
});

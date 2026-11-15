// Felles testvektorer (shared/testvektorer/*.json) mot serverens og webens implementasjoner av de samme reglene
// (docs/opprydding/detaljer/F-logikk.md: L1 datoer, L2 neste trekkdato, L3 «i dag», L4 prøveperioder, L8 serveradresse).
//
// Fasiten står i JSON-filene. Der en implementasjon i dag gir et annet svar, er testen merket todo («Fase 2: …»), så
// `npm test` er grønn mens avvikene synes i rapporten. Produktkoden endres ikke her. Når en implementasjon rettes,
// forsvinner todo-merket av seg selv (det settes bare når svaret avviker). Testen «oppsummering» skriver antall
// bestått per implementasjon som diagnostikk.
//
// Swift og Kotlin skal kjøre de samme filene når XCTest og JUnit finnes (Fase 4 og 5, BESLUTNINGER.md Q25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// Implementasjonene som bruker prosessens tidssone (web parseDay, routes.js nextFor) regnes som i produksjon (Dockerfile: TZ=Europe/Oslo).
process.env.TZ = 'Europe/Oslo';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-testvektorer-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-tv1';
process.env.NODE_ENV = 'test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const vektorer = (navn) => JSON.parse(readFileSync(join(ROOT, 'shared/testvektorer', `${navn}.json`), 'utf8'));
const DATOER = vektorer('datoer'), ABONNEMENT = vektorer('abonnement'), SERVERADRESSE = vektorer('serveradresse'), IDAG = vektorer('idag'), PROVE = vektorer('proveperioder');

const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { whenOf45, todayOslo45 } = await import('../server/glimt/dates.js');
const { parseDay: serverParseDay } = await import('../server/parse-day35.js');
const { parseDay: webParseDay } = await import('../public/js/parse-day35.js');
const { parseQuick, osloTodayISO } = await import('../public/js/quick-time.js');
const { parseQuick: serverQuick } = await import('../server/dates/quick.js');
const { parseDatesRequest } = await import('../server/dates/api.js');
const { default: finansApi } = await import('../server/finans/routes.js');
const { chargesInYear } = await import('../server/finans/subs.js');
const { nextCharge } = await import('../server/finans/cycles.js');
const { parseTrialText, notificationsOf } = await import('../server/finans/trials.js');
const { migrateUrl89 } = await import('../server/auth/server-address.js');
const { cleanUrl46, isPrivateIp46 } = await import('../server/auth/server-address.js');
const { isLocalHost51 } = await import('../server/system/flags-crashes.js');
const { normalizeServerUrl, isLocalHost } = await import('../server/net/server-url.js');
const { isLan } = await import('../server/auth/session.js');
const { osloDate } = await import('../server/kalender/birthdays.js');
const { ymd: medfamYmd } = await import('../server/media/helpers.js');
const { osloYmd } = await import('../server/jul40.js');
const { today51 } = await import('../server/finans/planning-util.js');
const { osloDate: osloDate2, today: osloToday } = await import('../server/dates/oslo.js');

/* ---------------- Hjelpere ---------------- */

const RealDate = Date;
/** Kjører fn med en falsk klokke (new Date() og Date.now() = ms). For implementasjoner som leser klokka selv. */
async function medKlokke(ms, fn) {
  class FastDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(ms); }
    static now() { return ms; }
  }
  globalThis.Date = FastDate;
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}
const osloFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** «i dag» (YYYY-MM-DD) og minutter etter midnatt i Oslo for et tidspunkt. Uavhengig av implementasjonene under test. */
function oslo(tidspunkt) {
  const p = Object.fromEntries(osloFmt.formatToParts(new RealDate(tidspunkt)).map((x) => [x.type, x.value]));
  return { idag: `${p.year}-${p.month}-${p.day}`, naaMin: +p.hour * 60 + +p.minute };
}
const lokalYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const kl12 = (idag) => RealDate.parse(`${idag}T11:00:00Z`); // midt på dagen i Oslo uansett sommertid

const tally = new Map(); // implementasjon → {bestått, avvik, totalt}
/** Registrerer én test per vektor. Avvik fra fasiten blir todo (Fase 2). */
function vektortest(gruppe, impl, v, tittel, faktisk, fasit) {
  const ok = isDeepStrictEqual(faktisk, fasit);
  const t = tally.get(`${gruppe} · ${impl}`) ?? { bestått: 0, avvik: 0 };
  t[ok ? 'bestått' : 'avvik']++;
  tally.set(`${gruppe} · ${impl}`, t);
  const todo = ok ? false : `Fase 2: ${impl} gir ${JSON.stringify(faktisk)}, fasit ${JSON.stringify(fasit)}`;
  test(`${gruppe} · ${impl} · ${v.id} ${tittel}`, { todo }, () => assert.deepEqual(faktisk, fasit));
}
const svar = (fn) => { try { return fn(); } catch (e) { return { feil: e.message }; } };

/* ---------------- Fasiten selv ---------------- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const gyldigDato = (s) => ISO.test(s) && new RealDate(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

test('testvektorer: filene er gyldige (unike id-er, gyldige datoer og felt)', () => {
  for (const f of [DATOER, ABONNEMENT, SERVERADRESSE, IDAG, PROVE]) {
    const ids = f.vektorer.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length, 'unike id-er');
    assert.ok(f.beskrivelse);
  }
  for (const v of DATOER.vektorer) {
    assert.ok(!Number.isNaN(RealDate.parse(v.naa)) && /[+-]\d{2}:\d{2}$/.test(v.naa), `${v.id} naa`);
    assert.ok(gyldigDato(v.dato), `${v.id} dato`);
    assert.ok(v.tid === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v.tid), `${v.id} tid`);
    assert.ok(DATOER.regler[v.regel], `${v.id} regel ${v.regel}`);
    // Forskyvningen i naa er den Oslo faktisk har på det tidspunktet (fanger skrivefeil rundt sommertid).
    const p = Object.fromEntries(osloFmt.formatToParts(new RealDate(v.naa)).map((x) => [x.type, x.value]));
    assert.equal(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`, v.naa.slice(0, 16), `${v.id} naa er Oslo-tid`);
  }
  for (const v of ABONNEMENT.vektorer) for (const k of ['anker', 'idag', 'neste']) assert.ok(gyldigDato(v[k]), `${v.id} ${k}`);
  for (const v of IDAG.vektorer) assert.ok(gyldigDato(v.oslo) && /Z$/.test(v.utc), v.id);
  for (const v of SERVERADRESSE.vektorer) assert.ok(v.normalisert === null || /^https?:\/\/[^/\s]+$/.test(v.normalisert), v.id);
  for (const v of PROVE.vektorer) assert.ok(gyldigDato(v.idag) && (v.slutt === null || gyldigDato(v.slutt)), v.id);
  for (const v of PROVE.plan) assert.ok(gyldigDato(v.slutt) && v.varsler.every((x) => !Number.isNaN(RealDate.parse(x.at)) && /Z$/.test(x.at)), v.id);
});

// Liten referanse for abonnement som bare sjekker at fasiten følger reglene i fila (anker + k × syklus, dagen glir ikke).
const MND = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12, biennial: 24 };
function referanseNeste({ syklus, anker, idag }) {
  const [y, m, d] = anker.split('-').map(Number);
  for (let k = 0; k < 2000; k++) {
    let x;
    if (MND[syklus]) { const mm = m - 1 + k * MND[syklus]; const siste = new RealDate(RealDate.UTC(y, mm + 1, 0)).getUTCDate(); x = new RealDate(RealDate.UTC(y, mm, Math.min(d, siste))); }
    else x = new RealDate(RealDate.UTC(y, m - 1, d + k * (syklus === 'weekly' ? 7 : 14)));
    const s = x.toISOString().slice(0, 10);
    if (s >= idag) return s;
  }
  return null;
}
test('testvektorer: abonnement-fasiten følger regelen i fila', () => {
  for (const v of ABONNEMENT.vektorer) assert.equal(referanseNeste(v), v.neste, v.id);
});
test('testvektorer: idag-fasiten er Oslo-datoen (Intl)', () => {
  for (const v of IDAG.vektorer) assert.equal(oslo(v.utc).idag, v.oslo, v.id);
});

/* ---------------- L1 datoer ---------------- */

const DATO_IMPL = [
  // [navn, bare dato?, (tekst, idag, naaMin, naa) → {dato, tid?}]
  ['server glimt/dates.js whenOf45', false, (v, idag, naaMin) => { const r = whenOf45(v.tekst, idag, { nowMin: naaMin }); return { dato: r.date, tid: r.start }; }],
  ['server parse-day35.js parseDay', true, (v, idag) => ({ dato: serverParseDay(v.tekst, idag)?.date ?? null })],
  ['server dates/quick.js parseQuick (Rask-avtaler)', false, (v, idag, naaMin) => { const r = serverQuick(v.tekst, idag, undefined, { nowMin: naaMin }); return { dato: r.date ?? null, tid: r.start ?? null }; }],
  ['server POST /api/dates/parse', false, (v) => { const r = parseDatesRequest({ text: v.tekst, now: v.naa }).body; return { dato: r.date, tid: r.time }; }],
  ['web js/parse-day35.js parseDay', true, (v) => { const r = webParseDay(v.tekst, new RealDate(v.naa)); return { dato: r ? lokalYmd(r.date) : null }; }],
  ['web js/quick-time.js parseQuick', false, (v, idag) => { const r = parseQuick(v.tekst, idag); return { dato: r.date ?? null, tid: r.start ?? null }; }],
];
for (const [impl, bareDato, fn] of DATO_IMPL) {
  for (const v of DATOER.vektorer) {
    if (bareDato && v.tid !== null) continue; // tolkeren tar ikke klokkeslett: bare vektorene uten tid gjelder
    const { idag, naaMin } = oslo(v.naa);
    const fasit = bareDato ? { dato: v.dato } : { dato: v.dato, tid: v.tid };
    vektortest('datoer', impl, v, `«${v.tekst}» (${v.naa.slice(0, 16).replace('T', ' ')})`, svar(() => fn(v, idag, naaMin)), fasit);
  }
}

/* ---------------- L2 neste trekkdato ---------------- */

// Serveren eier neste trekk: POST /subscriptions kjøres med en fast klokke midt på dagen i Oslo, slik klientene sender det.
// Tre former: startDate (ankeret) + trekkdag/-måned; bare trekkdag/-måned (fasen er da ukjent for hvert 2. år og ukesykluser, så
// de vektorene gjelder ikke); og en nextDate fra klienten som ikke stemmer med syklusen (iOS sendte alltid månedlig), som serveren
// skal overstyre.
const login = await finansApi.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'testvektorer' }) });
const { token } = await login.json();
const J = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
// Den faste klokka hopper år frem og tilbake; testtokenet skal ikke utløpe av det (Q23 gir 180 dager glidende utløp).
(await import('../server/finans/db.js')).db.prepare('UPDATE fh_tokens SET expires=NULL, sliding=0').run();
const postSvar = new Map();
const POST_FORMER = {
  start: (v) => ({ startDate: v.anker, chargeDay: +v.anker.slice(8, 10), billMonth: +v.anker.slice(5, 7) }),
  dag: (v) => ({ chargeDay: +v.anker.slice(8, 10), billMonth: +v.anker.slice(5, 7) }),
  feilNeste: (v) => ({ startDate: v.anker, chargeDay: +v.anker.slice(8, 10), billMonth: +v.anker.slice(5, 7), nextDate: '1.1' }),
};
// Bare trekkdag/-måned bestemmer fasen når syklusen går opp i et år og ankeret er det siste trekket før i dag (eller i dag).
const fasenErKjent = (v) => ['monthly', 'quarterly', 'halfyearly', 'yearly'].includes(v.syklus) && v.anker <= v.idag;
for (const v of ABONNEMENT.vektorer) {
  for (const [form, body] of Object.entries(POST_FORMER)) {
    const r = await medKlokke(kl12(v.idag), () => finansApi.request('/subscriptions', { method: 'POST', headers: J,
      body: JSON.stringify({ name: `Vektor ${v.id} ${form}`, price: 99, cycle: v.syklus, ...body(v) }) }));
    const b = await r.json().catch(() => null);
    postSvar.set(`${v.id}:${form}`, r.status === 200 ? b?.nextDate ?? null : { status: r.status, feil: b?.error ?? null });
  }
}
const ABO_IMPL = [
  ['server POST /subscriptions {startDate, chargeDay, billMonth}', (v) => postSvar.get(`${v.id}:start`)],
  ['server POST /subscriptions {chargeDay, billMonth}', (v) => postSvar.get(`${v.id}:dag`), fasenErKjent],
  ['server POST /subscriptions med feil nextDate fra klienten', (v) => postSvar.get(`${v.id}:feilNeste`)],
  ['server finans/cycles.js nextCharge', (v) => nextCharge({ cycle: v.syklus, anchor: v.anker, day: ['weekly', 'biweekly'].includes(v.syklus) ? null : +v.anker.slice(8, 10) }, v.idag)],
  ['server finans/subs.js chargesInYear', (v) => {
    const s = { cycle: v.syklus, next_date: v.anker, charge_day: +v.anker.slice(8, 10), active: 1 };
    const y = +v.idag.slice(0, 4);
    return [y, y + 1, y + 2].flatMap((aar) => chargesInYear(s, aar)).find((d) => d >= v.idag) ?? null;
  }],
];
for (const [impl, fn, gjelder = () => true] of ABO_IMPL) {
  for (const v of ABONNEMENT.vektorer) if (gjelder(v)) vektortest('abonnement', impl, v, `${v.syklus} fra ${v.anker}, i dag ${v.idag}`, svar(() => fn(v)), v.neste);
}

/* ---------------- L3 «i dag» ---------------- */

const IDAG_IMPL = [
  ['server glimt/dates.js todayOslo45', (ms) => todayOslo45(new RealDate(ms))],
  ['server birthdays.js osloDate', (ms) => osloDate(ms)],
  ['server media/helpers.js ymd', (ms) => medfamYmd(ms)],
  ['server jul40.js osloYmd', (ms) => { const { y, m, d } = osloYmd(ms); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }],
  ['server finans/planning-util.js today51', null], // leser klokka selv, kjøres med fast klokke under
  ['web js/quick-time.js osloTodayISO', (ms) => osloTodayISO(new RealDate(ms))],
  // Den ene hjelperen for «i dag» på serveren (erstatter toISOString().slice(0, 10), som ga UTC-datoen). test/dates.test.js
  // passer på at «nå» ikke regnes i UTC eller prosessens tidssone igjen.
  ['server dates/oslo.js osloDate', (ms) => osloDate2(ms)],
  ['server dates/oslo.js today (fast klokke)', null],
];
for (const [impl, fn] of IDAG_IMPL) {
  for (const v of IDAG.vektorer) {
    const ms = RealDate.parse(v.utc);
    const lesKlokka = impl.includes('today51') ? today51 : osloToday;
    const faktisk = fn ? svar(() => fn(ms)) : await medKlokke(ms, () => svar(() => lesKlokka()));
    vektortest('idag', impl, v, `${v.utc} (${v.merknad})`, faktisk, v.oslo);
  }
}

/* ---------------- L4 prøveperioder ---------------- */

const PROVE_IMPL = [
  ['server finans/trials.js parseTrialText', (v) => { const r = parseTrialText(v.tekst, v.idag); return { tjeneste: r.service, slutt: r.endsAt, prisEtter: r.priceAfter }; }],
];
for (const [impl, fn] of PROVE_IMPL) {
  for (const v of PROVE.vektorer) vektortest('prøveperioder', impl, v, `«${v.tekst}» (${v.idag})`, svar(() => fn(v)), { tjeneste: v.tjeneste, slutt: v.slutt, prisEtter: v.prisEtter });
}
// Varselplanen serveren sender (trialOut.notifications og /api/widgets/trials): absolutte tidspunkter i UTC.
for (const v of PROVE.plan) {
  const row = { service: 'Test', ends_at: v.slutt, price_after: null, remind_offsets_days: JSON.stringify(v.varselDagerFor), snooze_until: null, sent: '[]' };
  vektortest('prøveperioder', 'server finans/trials.js notificationsOf (plan)', v, `slutt ${v.slutt}, varsel ${v.varselDagerFor.join('/')} dager før`,
    svar(() => notificationsOf(row).map((n) => ({ key: n.key, at: n.at }))), v.varsler);
}

/* ---------------- L8 serveradresse ---------------- */

const vertAv = (v) => (v.normalisert ? new URL(v.normalisert).hostname.replace(/^\[|\]$/g, '') : null);
const ADR_IMPL = [
  // Migreringen: nøyaktig den gamle standarden blir den nye, alt annet returneres urørt.
  ['server auth/server-address.js migrateUrl89', (v) => migrateUrl89(v.inn), (v) => (v.gammelStandard ? v.normalisert : v.inn), () => true],
  // Normalisering av en lagret/oppgitt adresse (PUBLIC_URL, Innstillinger → Server).
  ['server auth/server-address.js cleanUrl46', (v) => cleanUrl46(v.inn), (v) => v.normalisert, (v) => !v.gammelStandard],
  // Lokal/ekstern for verten.
  ['server qa51.js isLocalHost51', (v) => isLocalHost51(vertAv(v)), (v) => v.lokal, (v) => !!v.normalisert],
  ['server net/server-url.js normalizeServerUrl', (v) => normalizeServerUrl(v.inn), (v) => v.normalisert, (v) => !v.gammelStandard],
  ['server net/server-url.js isLocalHost', (v) => isLocalHost(vertAv(v)), (v) => v.lokal, (v) => !!v.normalisert],
  // isPrivateIp46 får bare IP-adresser (etter DNS-oppslag i news46), så bare IP-vektorene gjelder.
  ['server auth/server-address.js isPrivateIp46', (v) => isPrivateIp46(vertAv(v)), (v) => v.lokal, (v) => !!v.normalisert && /^[\d.]+$|:/.test(vertAv(v))],
  // «Pålitelig enhet» (klient-IP fra tilkoblingen): strengere regel, bare IP-adresser.
  ['server auth/session.js isLan (pålitelig enhet)', (v) => isLan(vertAv(v)), (v) => v.paaliteligEnhet, (v) => typeof v.paaliteligEnhet === 'boolean'],
];
for (const [impl, fn, fasit, gjelder] of ADR_IMPL) {
  for (const v of SERVERADRESSE.vektorer) if (gjelder(v)) vektortest('serveradresse', impl, v, `«${v.inn}»`, svar(() => fn(v)), fasit(v));
}

/* ---------------- Oppsummering ---------------- */

test('testvektorer: oppsummering per implementasjon', (t) => {
  for (const [impl, { bestått, avvik }] of tally) t.diagnostic(`${impl}: ${bestått}/${bestått + avvik} bestått${avvik ? `, ${avvik} avvik (todo, Fase 2)` : ''}`);
  assert.ok(tally.size > 0);
});

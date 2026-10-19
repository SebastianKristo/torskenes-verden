// Prompt 27 (SERVER-A): Kalender v2. Feilen «Kalender viser ingen timer, bare neste eksamen om 2 måneder»:
// node-ical legger VEVENT-ene i et objekt med UID som nøkkel, så skolesystemer som gjenbruker samme UID på mange
// enkelthendelser (én UID per fag) mistet alle timene unntatt den siste – eksamen. Nå: egen iCal-leser (ical-expand.js).
// Fiksturer som Visma InSchool / Vigilo / Google-eksport: VTIMEZONE Europe/Oslo, TZID=, Windows-soner, flytende tid,
// RRULE med UNTIL/COUNT/WKST/BYDAY, EXDATE-lister, RDATE, RECURRENCE-ID (flyttet og avlyst), lange kalendere.
// Også: calendar/editable/calendars, now.next (uansett type), søk, og egne hendelser mot Google Calendar API (falsk Google).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p27a-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p27a-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
delete process.env.MOCK_DATA;
delete process.env.SCHOOL_ICAL_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const cal = await import('../server/calendar.js');
const ix = await import('../server/ical-expand.js');
const bd = await import('../server/birthdays.js');
const { kv, OWNER } = await import('../server/db.js');
const { seal } = await import('../server/finans/db.js');
const ical = (await import('node-ical')).default;

/* ---------------- Fiksturer ---------------- */
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Oslo', 'X-LIC-LOCATION:Europe/Oslo', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
const WTZ = ['BEGIN:VTIMEZONE', 'TZID:W. Europe Standard Time', 'BEGIN:STANDARD', 'DTSTART:16010101T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10', 'END:STANDARD',
  'BEGIN:DAYLIGHT', 'DTSTART:16010101T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3', 'END:DAYLIGHT', 'END:VTIMEZONE'];
const vev = (lines) => ['BEGIN:VEVENT', 'DTSTAMP:20260801T000000Z', ...lines, 'END:VEVENT'];
// Linjer over 75 tegn brettes som i ekte eksporter (CRLF + mellomrom).
const fold = (l) => { const out = []; let s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
const ics = (head, ...evs) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...head, ...evs.flat()].map(fold).join('\r\n') + '\r\n';
const ymdc = (d) => d.replace(/-/g, '');
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();

// 1) Visma InSchool-aktig: hver time er en egen VEVENT, og ALLE timene i et fag har samme UID (også eksamen i desember).
function vismaIcs() {
  const evs = [];
  for (let d = '2026-08-17'; d <= '2026-12-18'; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 1 || wd === 3) evs.push(vev(['UID:3STA-MAT-R1@inschool.visma.no', 'SEQUENCE:0', `DTSTART;TZID=W. Europe Standard Time:${ymdc(d)}T081500`, `DTEND;TZID=W. Europe Standard Time:${ymdc(d)}T094500`,
      'SUMMARY:3STA MAT1R', 'LOCATION:A-112', 'DESCRIPTION:Lærer: Kari Hansen\\nGruppe: 3STA', 'CATEGORIES:Undervisning']));
    if (wd === 2) evs.push(vev(['UID:3STA-NOR@inschool.visma.no', `DTSTART;TZID=W. Europe Standard Time:${ymdc(d)}T100000`, `DTEND;TZID=W. Europe Standard Time:${ymdc(d)}T113000`,
      'SUMMARY:3STA NOR1', 'LOCATION:B-204', 'DESCRIPTION:Lærer: Ingrid Lie']));
  }
  evs.push(vev(['UID:3STA-MAT-R1@inschool.visma.no', 'DTSTART;TZID=W. Europe Standard Time:20261215T090000', 'DTEND;TZID=W. Europe Standard Time:20261215T140000', 'SUMMARY:Eksamen matematikk R1', 'LOCATION:Gymsalen']));
  return ics(['PRODID:-//Visma//InSchool Timeplan//NO', 'X-WR-CALNAME:Timeplan 3STA', 'X-WR-TIMEZONE:Europe/Oslo', ...WTZ], ...evs);
}
// 2) Vigilo/Google-aktig med RRULE: startet i august (lenge før from), EXDATE-liste, RECURRENCE-ID flyttet og avlyst, RDATE,
//    COUNT, WKST, flytende tid og UTC-tider.
const RRULE_ICS = ics(['PRODID:-//Vigilo//Timeplan//NO', 'X-WR-CALNAME:Timeplan', 'X-WR-TIMEZONE:Europe/Oslo', ...VTZ],
  vev(['UID:fys2-ma-on@vigilo.no', 'DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T094500',
    'RRULE:FREQ=WEEKLY;UNTIL=20270620T215959Z;BYDAY=MO,WE;WKST=MO', 'EXDATE;TZID=Europe/Oslo:20261005T081500,20261007T081500,20261026T081500',
    'SUMMARY:Fysikk 2', 'LOCATION:Lab 2', 'DESCRIPTION:Lærer: Per Olsen']),
  vev(['UID:fys2-ma-on@vigilo.no', 'RECURRENCE-ID;TZID=Europe/Oslo:20261021T081500', 'DTSTART;TZID=Europe/Oslo:20261021T121500', 'DTEND;TZID=Europe/Oslo:20261021T134500', 'SUMMARY:Fysikk 2', 'LOCATION:Lab 3']),
  vev(['UID:fys2-ma-on@vigilo.no', 'RECURRENCE-ID;TZID=Europe/Oslo:20261028T081500', 'DTSTART;TZID=Europe/Oslo:20261028T081500', 'DTEND;TZID=Europe/Oslo:20261028T094500', 'STATUS:CANCELLED', 'SUMMARY:Fysikk 2']),
  vev(['UID:eng-to@vigilo.no', 'DTSTART:20260820T080000Z', 'DTEND:20260820T093000Z', 'RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=30', 'RDATE;TZID=Europe/Oslo:20261024T100000',
    'SUMMARY:Engelsk', 'ORGANIZER;CN="John Smith":mailto:john.smith@skole.no']),
  vev(['UID:gym-fr@vigilo.no', 'DTSTART:20260821T130000', 'DURATION:PT1H30M', 'RRULE:FREQ=WEEKLY;BYDAY=FR', 'SUMMARY:Kroppsøving', 'LOCATION:Hallen']),
  vev(['UID:studie@vigilo.no', 'DTSTART;TZID="(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna":20260818T143000', 'DTEND;TZID="(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna":20260818T153000',
    'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU', 'SUMMARY:Studietid']),
  vev(['UID:plan@vigilo.no', 'DTSTART;VALUE=DATE:20261030', 'DTEND;VALUE=DATE:20261031', 'SUMMARY:Planleggingsdag']),
  vev(['UID:eks@vigilo.no', 'DTSTART;TZID=Europe/Oslo:20261216T090000', 'DTEND;TZID=Europe/Oslo:20261216T140000', 'SUMMARY:Eksamen fysikk 2']));

const FEEDS = { 'https://skole.example/visma.ics': vismaIcs(), 'https://skole.example/vigilo.ics': RRULE_ICS };
cal._setCalendarFetch(async (url) => (FEEDS[url] ? new Response(FEEDS[url], { status: 200 }) : new Response('nei', { status: 404 })));

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ikke JSON */ }
  return { status: r.status, body: json, text };
};
const S = client(await login('sebastian', 'testpassord1'));
assert.equal((await S('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client(await login('kari', 'kariPassord123'));
const at = (iso) => encodeURIComponent(new Date(iso).toISOString());
const day = (body, d) => body.events.filter((e) => e.date === d);

/* ---------------- Årsaken ---------------- */

test('Årsaken: node-ical beholder bare den siste VEVENT-en per UID – egen leser beholder alle timene', () => {
  const text = vismaIcs();
  const viaNodeIcal = Object.values(ical.sync.parseICS(text)).filter((x) => x.type === 'VEVENT');
  assert.deepEqual(viaNodeIcal.map((e) => e.summary).sort(), ['3STA NOR1', 'Eksamen matematikk R1'], 'node-ical: én hendelse per UID (eksamen vant)');
  const mine = ix.expandIcs(ix.parseIcs(text), Date.parse('2026-10-18T22:00:00Z'), Date.parse('2026-10-25T22:00:00Z'));
  assert.deepEqual(mine.map((e) => [e.summary, new Date(e.startMs).toISOString()]), [
    ['3STA MAT1R', '2026-10-19T06:15:00.000Z'], ['3STA NOR1', '2026-10-20T08:00:00.000Z'], ['3STA MAT1R', '2026-10-21T06:15:00.000Z']]);
});

/* ---------------- ical-expand.js ---------------- */

const W = (from, to) => [Date.parse(from), Date.parse(to)];
const one = (lines, from, to, head = []) => ix.expandIcs(ix.parseIcs(ics(head, vev(['UID:x@test', 'SUMMARY:x', ...lines]))), ...W(from, to)).map((e) => (e.allDay ? e.date : new Date(e.startMs).toISOString()));

test('RRULE: lokal tid over sommer-/vintertid, UNTIL, COUNT, WKST, INTERVAL og hendelser som startet for måneder siden', () => {
  const lines = ['DTSTART;TZID=Europe/Oslo:20260302T081500', 'DTEND;TZID=Europe/Oslo:20260302T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102T071500Z'];
  assert.deepEqual(one(lines, '2026-10-18T00:00:00Z', '2026-11-30T00:00:00Z', VTZ), ['2026-10-19T06:15:00.000Z', '2026-10-26T07:15:00.000Z', '2026-11-02T07:15:00.000Z'], 'sommer → vinter, UNTIL inkludert');
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10'], '2026-10-01T00:00:00Z', '2026-12-31T00:00:00Z'),
    ['2026-10-05T06:15:00.000Z', '2026-10-12T06:15:00.000Z', '2026-10-19T06:15:00.000Z'], 'COUNT telles fra DTSTART (10. gang er 19.10)');
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T093000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;WKST=SU'], '2026-10-11T22:00:00Z', '2026-10-25T22:00:00Z'),
    ['2026-10-12T06:15:00.000Z', '2026-10-15T06:15:00.000Z']);
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20200106T081500', 'DTEND;TZID=Europe/Oslo:20200106T093000', 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR'], '2026-10-18T22:00:00Z', '2026-10-20T22:00:00Z'),
    ['2026-10-19T06:15:00.000Z', '2026-10-20T06:15:00.000Z'], 'startet for år siden');
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T093000', 'RRULE:freq=weekly;byday=mo'], '2026-10-18T22:00:00Z', '2026-10-19T22:00:00Z'), ['2026-10-19T06:15:00.000Z'], 'små bokstaver');
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'RRULE:FREQ=WEEKLY;BYDAY=TH'], '2026-10-18T22:00:00Z', '2026-10-25T22:00:00Z'),
    ['2026-10-19T06:15:00.000Z', '2026-10-22T06:15:00.000Z'], 'flere RRULE-linjer');
});

test('RRULE: MONTHLY/YEARLY med BYDAY-ordinal, BYMONTHDAY og BYSETPOS; heldag og UNTIL som dato', () => {
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260105T180000', 'DTEND;TZID=Europe/Oslo:20260105T193000', 'RRULE:FREQ=MONTHLY;BYDAY=1MO'], '2026-10-01T00:00:00Z', '2026-12-31T00:00:00Z'),
    ['2026-10-05T16:00:00.000Z', '2026-11-02T17:00:00.000Z', '2026-12-07T17:00:00.000Z']);
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260130T120000', 'DTEND;TZID=Europe/Oslo:20260130T130000', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'], '2026-10-01T00:00:00Z', '2026-11-30T23:00:00Z'),
    ['2026-10-30T11:00:00.000Z', '2026-11-30T11:00:00.000Z'], 'siste arbeidsdag');
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260131T090000', 'DTEND;TZID=Europe/Oslo:20260131T100000', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'], '2026-10-15T00:00:00Z', '2026-11-30T23:00:00Z'),
    ['2026-10-31T08:00:00.000Z', '2026-11-30T08:00:00.000Z']);
  assert.deepEqual(one(['DTSTART;VALUE=DATE:20200517', 'DTEND;VALUE=DATE:20200518', 'RRULE:FREQ=YEARLY'], '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z'), ['2026-05-17']);
  assert.deepEqual(one(['DTSTART;VALUE=DATE:20261019', 'RRULE:FREQ=DAILY;UNTIL=20261021'], '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'), ['2026-10-19', '2026-10-20', '2026-10-21']);
});

test('EXDATE (liste, UTC, dato, tidlig time), RDATE, RECURRENCE-ID (flyttet, avlyst, før hovedhendelsen) og samme UID', () => {
  const base = ['DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE'];
  const win = ['2026-10-18T22:00:00Z', '2026-10-21T22:00:00Z'];
  assert.deepEqual(one([...base, 'EXDATE;TZID=Europe/Oslo:20261019T081500,20261020T081500'], ...win), ['2026-10-21T06:15:00.000Z']);
  assert.deepEqual(one([...base, 'EXDATE:20261020T061500Z'], ...win), ['2026-10-19T06:15:00.000Z', '2026-10-21T06:15:00.000Z']);
  assert.deepEqual(one([...base, 'EXDATE;VALUE=DATE:20261019'], ...win), ['2026-10-20T06:15:00.000Z', '2026-10-21T06:15:00.000Z']);
  assert.deepEqual(one([...base, 'EXDATE;TZID=Europe/Oslo:20261021T080000'], ...win), ['2026-10-19T06:15:00.000Z', '2026-10-20T06:15:00.000Z'], 'EXDATE med feil klokkeslett samme dag');
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260817T003000', 'DTEND;TZID=Europe/Oslo:20260817T013000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU', 'EXDATE;VALUE=DATE:20261019'], ...win), ['2026-10-19T22:30:00.000Z'],
    'heldags-EXDATE i lokal tid (node-ical sammenlignet UTC-dato)');
  assert.deepEqual(one(['DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T093000', 'RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=MO', 'RDATE;TZID=Europe/Oslo:20261020T081500,20261021T120000'], ...win),
    ['2026-10-20T06:15:00.000Z', '2026-10-21T10:00:00.000Z'], 'RDATE (node-ical ignorerte den)');
  const ovFirst = ics([], vev(['UID:m', 'RECURRENCE-ID;TZID=Europe/Oslo:20261019T081500', 'DTSTART;TZID=Europe/Oslo:20261019T100000', 'DTEND;TZID=Europe/Oslo:20261019T111500', 'SUMMARY:Flyttet']),
    vev(['UID:m', ...base, 'SUMMARY:Time']), vev(['UID:m', 'RECURRENCE-ID:20261020T061500Z', 'DTSTART;TZID=Europe/Oslo:20261020T081500', 'DTEND;TZID=Europe/Oslo:20261020T093000', 'STATUS:CANCELLED', 'SUMMARY:Time']));
  assert.deepEqual(ix.expandIcs(ix.parseIcs(ovFirst), ...W(...win)).map((e) => [e.summary, new Date(e.startMs).toISOString(), (e.endMs - e.startMs) / 60000]),
    [['Flyttet', '2026-10-19T08:00:00.000Z', 75], ['Time', '2026-10-21T06:15:00.000Z', 75]]);
  // Samme UID på to RRULE-hendelser (to fag) og på enkelthendelser: alle beholdes.
  const dup = ics([], vev(['UID:same', 'DTSTART;TZID=Europe/Oslo:20260817T081500', 'DTEND;TZID=Europe/Oslo:20260817T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:Matte']),
    vev(['UID:same', 'DTSTART;TZID=Europe/Oslo:20260818T081500', 'DTEND;TZID=Europe/Oslo:20260818T093000', 'RRULE:FREQ=WEEKLY;BYDAY=TU', 'SUMMARY:Norsk']),
    vev(['UID:same', 'SEQUENCE:2', 'DTSTART;TZID=Europe/Oslo:20260818T081500', 'DTEND;TZID=Europe/Oslo:20260818T093000', 'RRULE:FREQ=WEEKLY;BYDAY=TU', 'SUMMARY:Norsk']));
  assert.deepEqual(ix.expandIcs(ix.parseIcs(dup), ...W(...win)).map((e) => e.summary), ['Matte', 'Norsk'], 'duplikat (samme start og regel) bare én gang');
});

test('Tidssoner: Windows-navn, Outlook «(UTC+01:00) …», egne prefiks, flytende tid og UTC', () => {
  const win = ['2026-10-18T22:00:00Z', '2026-10-19T22:00:00Z'];
  const t = (tzid) => one([`DTSTART;TZID=${tzid}:20261019T081500`, `DTEND;TZID=${tzid}:20261019T093000`], ...win);
  for (const z of ['Europe/Oslo', 'W. Europe Standard Time', '"W. Europe Standard Time"', '"(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna"', '/freeassociation.sourceforge.net/Tzfile/Europe/Oslo', 'Romance Standard Time'])
    assert.deepEqual(t(z), ['2026-10-19T06:15:00.000Z'], z);
  assert.deepEqual(t('Ukjent sone'), ['2026-10-19T06:15:00.000Z'], 'ukjent → Europe/Oslo');
  assert.deepEqual(one(['DTSTART:20261019T081500', 'DTEND:20261019T093000'], ...win), ['2026-10-19T06:15:00.000Z'], 'flytende tid = Oslo, ikke serverens UTC');
  assert.deepEqual(one(['DTSTART:20261019T061500Z', 'DTEND:20261019T073000Z'], ...win), ['2026-10-19T06:15:00.000Z']);
  // UTC-start uten X-WR-TIMEZONE: gjentas på samme UTC-tid (RFC 5545); med X-WR-TIMEZONE: samme lokale tid.
  const utcRule = ['DTSTART:20261019T061500Z', 'DTEND:20261019T073000Z', 'RRULE:FREQ=WEEKLY;COUNT=2'];
  assert.deepEqual(one(utcRule, '2026-10-18T00:00:00Z', '2026-10-31T00:00:00Z'), ['2026-10-19T06:15:00.000Z', '2026-10-26T06:15:00.000Z']);
  assert.deepEqual(one(utcRule, '2026-10-18T00:00:00Z', '2026-10-31T00:00:00Z', ['X-WR-TIMEZONE:Europe/Oslo']), ['2026-10-19T06:15:00.000Z', '2026-10-26T07:15:00.000Z']);
  assert.equal(ix.resolveTz('Pacific Standard Time'), 'America/Los_Angeles');
});

test('Lang kalender: hundrevis av hendelser og gjentakelser er raske', () => {
  const evs = [];
  for (let i = 0; i < 600; i++) { const d = addDays('2026-01-05', i); if (weekday(d) % 6) evs.push(vev([`UID:enkelt-${i % 7}@x`, `DTSTART;TZID=Europe/Oslo:${ymdc(d)}T${String(8 + (i % 6)).padStart(2, '0')}0000`, `DTEND;TZID=Europe/Oslo:${ymdc(d)}T${String(9 + (i % 6)).padStart(2, '0')}0000`, `SUMMARY:Fag ${i % 7}`])); }
  for (let k = 0; k < 40; k++) evs.push(vev([`UID:r${k}`, `DTSTART;TZID=Europe/Oslo:2025081${k % 9}T${String(8 + (k % 8)).padStart(2, '0')}1500`, 'DURATION:PT45M', `RRULE:FREQ=WEEKLY;BYDAY=${['MO', 'TU', 'WE', 'TH', 'FR'][k % 5]}`, `EXDATE;TZID=Europe/Oslo:20261019T081500`, `SUMMARY:Rep ${k}`]));
  const text = ics(['X-WR-TIMEZONE:Europe/Oslo', ...VTZ], ...evs);
  const t0 = performance.now();
  const c = ix.parseIcs(text);
  const out = ix.expandIcs(c, Date.parse('2026-08-01T00:00:00Z'), Date.parse('2027-02-01T00:00:00Z'));
  const ms = performance.now() - t0;
  assert.ok(out.length > 900, `mange forekomster (${out.length})`);
  assert.ok(ms < 1500, `raskt nok (${Math.round(ms)} ms)`);
});

/* ---------------- /api/kalender ---------------- */

test('Visma-feed: timene vises, now.next er timen om 1 time (ikke eksamen om 2 måneder), widget og Hjem-widget', async () => {
  assert.equal((await S('/api/integrations/calendars', 'PUT', { cal_ics: 'https://skole.example/visma.ics' })).status, 200);
  // Mandag 07:15: neste time 08:15.
  const now = '2026-10-19T07:15:00+02:00';
  const r = await S(`/api/kalender?from=2026-10-19&to=2026-10-25&now=${at(now)}`);
  assert.equal(r.status, 200, r.text);
  const mon = day(r.body, '2026-10-19');
  assert.deepEqual(mon.map((e) => [e.title, e.type, e.calendar, e.time, e.room, e.teacher, e.inAllDayRow, e.editable]), [['3STA MAT1R', 'time', 'timeplan', '08:15–09:45', 'A-112', 'Kari Hansen', false, false]]);
  assert.equal(r.body.events.filter((e) => e.type === 'time').length, 3, 'man R1, tir norsk, ons R1');
  assert.equal(r.body.now.next.title, '3STA MAT1R');
  assert.equal(r.body.now.next.inMin, 60);
  assert.equal(r.body.now.next.label, 'om 1 t');
  assert.equal(r.body.now.nextTest.title, 'Eksamen matematikk R1');
  assert.ok(r.body.now.nextTest.daysLeft > 50);
  // Klientenes vindu (web: −42 … +120 dager) gir også timene i dag.
  const web = await S(`/api/kalender?from=2026-09-07&to=2027-02-16&now=${at(now)}`);
  assert.equal(web.status, 200);
  assert.ok(day(web.body, '2026-10-19').some((e) => e.type === 'time'));
  assert.equal(web.body.now.next.title, '3STA MAT1R');
  const w = await S(`/api/widgets/calendar?now=${at(now)}`);
  assert.equal(w.body.kind, 'next');
  assert.equal(w.body.next.title, '3STA MAT1R');
  assert.equal(w.body.next.inMin, 60);
  assert.equal(w.body.today.count, 1);
  // 08:30: NÅ med leftMin.
  const n2 = await S(`/api/kalender?from=2026-10-19&to=2026-10-19&now=${at('2026-10-19T08:30:00+02:00')}`);
  assert.equal(n2.body.now.current.title, '3STA MAT1R');
  assert.equal(n2.body.now.current.leftMin, 75);
});

test('Vigilo/Google-feed med RRULE: EXDATE, flyttet og avlyst time, RDATE, flytende tid, Outlook-sone, planleggingsdag', async () => {
  assert.equal((await S('/api/integrations/calendars', 'PUT', { cal_ics: 'https://skole.example/vigilo.ics' })).status, 200);
  const r = await S(`/api/kalender?from=2026-10-19&to=2026-11-01&now=${at('2026-10-19T07:15:00+02:00')}`);
  assert.equal(r.status, 200, r.text);
  const rows = (d) => day(r.body, d).map((e) => `${e.time ?? 'hele'} ${e.title}${e.room ? ` (${e.room})` : ''}`);
  assert.deepEqual(rows('2026-10-19'), ['08:15–09:45 Fysikk 2 (Lab 2)']);
  assert.deepEqual(rows('2026-10-20'), ['14:30–15:30 Studietid']);
  assert.deepEqual(rows('2026-10-21'), ['12:15–13:45 Fysikk 2 (Lab 3)'], 'flyttet med RECURRENCE-ID');
  assert.deepEqual(rows('2026-10-22'), ['10:00–11:30 Engelsk'], 'UTC-tid 08:00Z = 10:00 sommertid');
  assert.deepEqual(rows('2026-10-23'), ['13:00–14:30 Kroppsøving (Hallen)'], 'flytende tid i Oslo, DURATION');
  assert.deepEqual(rows('2026-10-24'), ['10:00–11:30 Engelsk'], 'RDATE');
  assert.deepEqual(rows('2026-10-26'), [], 'EXDATE');
  assert.deepEqual(rows('2026-10-28'), [], 'avlyst (STATUS:CANCELLED)');
  assert.deepEqual(rows('2026-10-29'), ['10:00–11:30 Engelsk'], 'UTC-start med X-WR-TIMEZONE gjentas i lokal tid (også etter vintertid)');
  assert.deepEqual(rows('2026-10-30'), ['hele Planleggingsdag'], 'planleggingsdag fjerner gymtimen');
  assert.equal(day(r.body, '2026-10-22')[0].teacher, 'John Smith');
  assert.ok(r.body.events.filter((e) => e.type === 'time').every((e) => e.calendar === 'timeplan' && !e.inAllDayRow));
  assert.equal(r.body.now.next.title, 'Fysikk 2');
  assert.equal(r.body.now.next.inMin, 60);
});

test('now.next er neste hendelse uansett type, med timen først ved likt klokkeslett', () => {
  const mk = (id, type, s, e, extra = {}) => ({ id, title: id, type, allDay: false, date: s.slice(0, 10), start: new Date(s).toISOString(), end: new Date(e).toISOString(), ...extra });
  const t = Date.parse('2026-10-19T07:15:00+02:00');
  const evs = [mk('Tannlege', 'skole', '2026-10-19T08:15:00+02:00', '2026-10-19T09:00:00+02:00', { calendar: 'privat' }), mk('Matte', 'time', '2026-10-19T08:15:00+02:00', '2026-10-19T09:45:00+02:00'),
    { id: 'Frist', title: 'Frist', type: 'innl', allDay: false, date: '2026-10-19', start: new Date('2026-10-19T07:30:00+02:00').toISOString(), end: new Date('2026-10-19T07:30:00+02:00').toISOString() }];
  const n = cal.nowOf(evs, t);
  assert.equal(n.next.title, 'Matte');
  assert.equal(n.next.inMin, 60);
  // Ingen timer i dag: neste hendelse i morgen vises også.
  const n2 = cal.nowOf([mk('Trening', 'skole', '2026-10-20T18:00:00+02:00', '2026-10-20T19:00:00+02:00')], t);
  assert.equal(n2.next.title, 'Trening');
  assert.equal(n2.next.label, 'i morgen 18:00');
});

test('calendars, kalFilters (privat/familie) og kalView (dag, 3dager, liste; agenda → liste)', async () => {
  let r = await S('/api/kalender?from=2026-10-19&to=2026-10-19');
  assert.deepEqual(r.body.calendars.map((c) => c.id), ['timeplan', 'prover', 'skole', 'privat', 'familie', 'bursdager']);
  assert.ok(r.body.calendars.every((c) => c.enabled && c.name && /^#/.test(c.color)));
  assert.equal(r.body.calendars.find((c) => c.id === 'privat').writable, false, 'ikke koblet til Google');
  assert.equal((await S('/api/me/layout', 'PUT', { kalFilters: { privat: false, familie: true, timeplan: true } })).status, 200);
  r = await S('/api/kalender?from=2026-10-19&to=2026-10-19');
  assert.equal(r.body.calendars.find((c) => c.id === 'privat').enabled, false);
  for (const v of ['dag', '3dager', 'uke', 'maaned', 'liste']) assert.equal((await S('/api/me/layout', 'PUT', { kalView: v })).body.kalView, v);
  assert.equal((await S('/api/me/layout', 'PUT', { kalView: 'agenda' })).body.kalView, 'liste');
  assert.equal((await S('/api/me/layout', 'PUT', { kalView: 'år' })).status, 400);
});

test('Søk: tittel, rom og lærer, uklart (uten aksenter, én skrivefeil), per bruker', async () => {
  const q = async (s) => (await S(`/api/kalender/search?q=${encodeURIComponent(s)}&now=${at('2026-10-19T07:00:00+02:00')}`)).body;
  let r = await q('fysikk');
  assert.ok(r.events.length > 10);
  assert.ok(r.events.every((e) => /fysikk/i.test(e.title)));
  assert.ok(r.events[0].date >= '2026-10-19', 'kommende først');
  assert.ok((await q('fysik')).events.length > 0, 'én skrivefeil');
  assert.ok((await q('Lab 3')).events.some((e) => e.date === '2026-10-21'), 'rom');
  assert.ok((await q('per olsen')).events.length > 0, 'lærer');
  assert.ok((await q('kroppsoving')).events.some((e) => e.title === 'Kroppsøving'), 'uten aksenter');
  assert.deepEqual((await q('')).events, []);
  assert.deepEqual((await K('/api/kalender/search?q=fysikk')).body.events, [], 'Kari ser ikke Sebastians timer');
  assert.equal(cal.normText('Blåbær Øl Café'), 'blåbær øl cafe');
});

/* ---------------- Egne hendelser mot Google ---------------- */

const G = { cals: { primary: new Map(), 'fam@group.calendar.google.com': new Map() }, seq: 0, calls: [], scope: 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly' };
const gjson = (b, status = 200) => new Response(status === 204 ? null : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
bd._setGoogleFetch(async (url, init = {}) => {
  const u = new URL(url), method = init.method ?? 'GET';
  G.calls.push(`${method} ${u.pathname}`);
  if (u.hostname === 'oauth2.googleapis.com') return gjson({ access_token: 'at', expires_in: 3600, scope: G.scope });
  const path = decodeURIComponent(u.pathname.replace('/calendar/v3', ''));
  if (path === '/users/me/calendarList') return gjson({ items: [{ id: 'seb@gmail.com', primary: true, summary: 'seb@gmail.com', accessRole: 'owner' }, { id: 'fam@group.calendar.google.com', summary: 'Familien', accessRole: 'writer' }] });
  const m = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
  const c = G.cals[m?.[1]];
  if (!c) return gjson({ error: { message: 'not found' } }, 404);
  if (method === 'GET' && !m[2]) return gjson({ items: [...c.values()] });
  if (!G.scope.includes('calendar.events') && method !== 'GET') return gjson({ error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' } }, 403);
  const b = init.body ? JSON.parse(init.body) : {};
  if (method === 'POST') { const id = `ev${++G.seq}`; const ev = { ...b, id, status: 'confirmed', htmlLink: `https://calendar.google.com/e/${id}` }; c.set(id, ev); return gjson(ev); }
  const ev = c.get(m[2]);
  if (!ev) return gjson({ error: { message: 'gone' } }, 404);
  if (method === 'PATCH') { Object.assign(ev, b); return gjson(ev); }
  if (method === 'DELETE') { c.delete(m[2]); return gjson(null, 204); }
  return gjson(ev);
});

test('Uten Google-kobling: POST gir 409 med reconnect', async () => {
  const r = await S('/api/kalender/events', 'POST', { title: 'Tannlege', allDay: false, date: '2026-10-20', start: '15:00', end: '16:00', calendar: 'privat' });
  assert.equal(r.status, 409);
  assert.equal(r.body.reconnect, true);
});

test('Ny, endre, flytte til Familie, slette og kopiere til Privat – via Google Calendar API', async () => {
  kv.set(OWNER, 'bd_google', { refresh: seal('rt-test'), calendarId: 'primary', email: 'seb@gmail.com', scope: G.scope, contacts: false });
  for (const bad of [{ title: '', date: '2026-10-20', allDay: true }, { title: 'x', date: '20.10', allDay: true }, { title: 'x', date: '2026-10-20', allDay: false, start: '25:00' },
    { title: 'x', date: '2026-10-20', allDay: true, calendar: 'timeplan' }, { title: 'x', date: '2026-10-20', allDay: true, repeat: 'yearly' }, { title: 'x', date: '2026-10-20', allDay: true, reminder: '2d' }])
    assert.equal((await S('/api/kalender/events', 'POST', bad)).status, 400, JSON.stringify(bad));
  const r = await S('/api/kalender/events', 'POST', { title: 'Tannlege', allDay: false, date: '2026-10-20', start: '15:00', end: '16:00', location: 'Majorstuen', calendar: 'privat', repeat: 'none', reminder: '1h', note: 'Husk kort' });
  assert.equal(r.status, 201, r.text);
  const ev = r.body.event;
  assert.deepEqual([ev.title, ev.calendar, ev.editable, ev.time, ev.room, ev.note, ev.reminder, ev.googleCalendarId, ev.source], ['Tannlege', 'privat', true, '15:00–16:00', 'Majorstuen', 'Husk kort', '1h', 'primary', 'google']);
  const sent = [...G.cals.primary.values()][0];
  assert.deepEqual(sent.start, { dateTime: '2026-10-20T15:00:00+02:00', timeZone: 'Europe/Oslo' });
  assert.deepEqual(sent.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] });
  // Vises i kalenderen (Google leses på nytt etter skriving) og som NESTE når det er neste hendelse.
  let k = await S(`/api/kalender?from=2026-10-20&to=2026-10-20&now=${at('2026-10-20T14:45:00+02:00')}`);
  const g = day(k.body, '2026-10-20').find((e) => e.title === 'Tannlege');
  assert.ok(g, 'hendelsen vises');
  assert.equal(k.body.calendars.find((c) => c.id === 'privat').writable, true);
  assert.equal(k.body.now.current.title, 'Studietid');
  assert.equal(k.body.now.next.title, 'Tannlege');
  assert.equal(k.body.now.next.inMin, 15);
  // Endre (delvis) og flytte til Familie.
  let p = await S(`/api/kalender/events/${encodeURIComponent(g.id)}`, 'PATCH', { start: '15:30', end: '16:30', repeat: 'weekly' });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.event.time, '15:30–16:30');
  assert.deepEqual(G.cals.primary.get(g.googleId).recurrence, ['RRULE:FREQ=WEEKLY']);
  k = await S('/api/kalender?from=2026-10-20&to=2026-10-20');
  const g2 = day(k.body, '2026-10-20').find((e) => e.title === 'Tannlege');
  p = await S(`/api/kalender/events/${encodeURIComponent(g2.id)}`, 'PATCH', { calendar: 'familie' });
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.event.calendar, 'familie');
  assert.equal(G.cals.primary.size, 0);
  assert.equal(G.cals['fam@group.calendar.google.com'].size, 1);
  // Skolens hendelser er skrivebeskyttet, men kan kopieres til Privat.
  k = await S('/api/kalender?from=2026-10-19&to=2026-10-19');
  const school = day(k.body, '2026-10-19').find((e) => e.type === 'time');
  assert.equal((await S(`/api/kalender/events/${encodeURIComponent(school.id)}`, 'PATCH', { title: 'Hack' })).status, 403);
  assert.equal((await S(`/api/kalender/events/${encodeURIComponent(school.id)}`, 'DELETE')).status, 403);
  const cp = await S(`/api/kalender/events/${encodeURIComponent(school.id)}/copy`, 'POST');
  assert.equal(cp.status, 201, cp.text);
  assert.deepEqual([cp.body.event.title, cp.body.event.calendar, cp.body.event.time, cp.body.event.room, cp.body.event.editable], ['Fysikk 2', 'privat', '08:15–09:45', 'Lab 2', true]);
  assert.equal(cp.body.event.teacher, 'Per Olsen', 'læreren følger med i notatet');
  // Slette.
  k = await S('/api/kalender?from=2026-10-20&to=2026-10-20');
  const fam = day(k.body, '2026-10-20').find((e) => e.title === 'Tannlege');
  assert.equal(fam.calendar, 'familie');
  assert.equal((await S(`/api/kalender/events/${encodeURIComponent(fam.id)}`, 'DELETE')).status, 200);
  assert.equal(G.cals['fam@group.calendar.google.com'].size, 0);
  assert.equal((await S('/api/kalender/events/g-0000000000-20261020T1530', 'DELETE')).status, 404);
  // Kari kan ikke endre Sebastians hendelser.
  const mine = day((await S('/api/kalender?from=2026-10-19&to=2026-10-19')).body, '2026-10-19').find((e) => e.source === 'google');
  assert.equal((await K(`/api/kalender/events/${encodeURIComponent(mine.id)}`, 'DELETE')).status, 404);
});

test('Token uten skrivetilgang: 409 med reconnect', async () => {
  kv.set(OWNER, 'bd_google', { ...kv.get(OWNER, 'bd_google', {}), scope: 'openid email https://www.googleapis.com/auth/calendar.readonly' });
  const r = await S('/api/kalender/events', 'POST', { title: 'Trening', allDay: true, date: '2026-10-21', calendar: 'privat' });
  assert.equal(r.status, 409);
  assert.equal(r.body.reconnect, true);
  // Ukjent scope (eldre kobling) prøves, og Google sitt 403 «insufficient scopes» blir også 409 reconnect.
  kv.set(OWNER, 'bd_google', { ...kv.get(OWNER, 'bd_google', {}), scope: null });
  G.scope = 'openid email https://www.googleapis.com/auth/calendar.readonly';
  const r2 = await S('/api/kalender/events', 'POST', { title: 'Trening', allDay: true, date: '2026-10-21', calendar: 'privat' });
  assert.equal(r2.status, 409, r2.text);
  assert.equal(r2.body.reconnect, true);
});

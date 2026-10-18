// Eksempeldata for utvikling og demo (MOCK_DATA=1). Brukes når eksterne API-er ikke er tilgjengelige.
import * as real from './integrations.js';
import { buildWeather } from './weather.js';

export const { GALLERIES, getTle, getApod, getGallery } = real;

// Prompt 21: hver avgang har turen (serviceJourney.estimatedCalls). Første avgang er alltid 17 mot Grefsen st. med fire stopp
// (valgt stopp, Grefsenveien, Kjelsåsveien, Grefsen st.), som i designet.
const VIA = ['Sporveisgata', 'Dalsbergstien', 'Stensgata', 'Bislett', 'Dalbakken', 'Adamstuen', 'Ullevål sykehus', 'Universitetet Blindern', 'Forskningsparken', 'Tåsen', 'Nydalen', 'Storo'];
const mockJourney = (from, fromId, to, startIso, offsets, names) => offsets.map((o, k) => {
  const t = new Date(Date.parse(startIso) + o * 60000).toISOString();
  const name = k === 0 ? from : k === offsets.length - 1 ? to : names[k - 1];
  const sid = k === 0 ? fromId : `NSR:StopPlace:${9000 + (([...name].reduce((x, ch) => x + ch.charCodeAt(0), 0) * 7) % 900)}`;
  return { quay: { id: k === 0 ? `${fromId}:Q` : `${sid}:Q`, name, publicCode: k === 0 ? 'B' : null, stopPlace: { id: sid, name } }, aimedArrivalTime: t, expectedArrivalTime: t, aimedDepartureTime: t, expectedDepartureTime: t };
});
const grefsen = (from, fromId, aimedIso) => ({ aimedDepartureTime: aimedIso, expectedDepartureTime: aimedIso, realtime: true, cancellation: false,
  quay: { id: `${fromId}:Q`, publicCode: 'B', name: from }, destinationDisplay: { frontText: 'Grefsen st.' }, situations: [],
  serviceJourney: { line: { publicCode: '17', transportMode: 'tram', presentation: null }, estimatedCalls: mockJourney(from, fromId, 'Grefsen st.', aimedIso, [0, 3, 5, 8], ['Grefsenveien', 'Kjelsåsveien']) } });
const otherJourney = (from, fromId, to, i, aimedIso, delay) => {
  const n = 3 + (i % 6); // 3–8 stopp, så «· · · N stopp» også kan vises
  const offsets = Array.from({ length: n }, (_, k) => k * 2 + (k ? delay : 0));
  return mockJourney(from, fromId, to, aimedIso, offsets, VIA.slice(i % 4, i % 4 + n - 2));
};

export const getDepartures = async () => {
  const id = 'NSR:StopPlace:6350', name = 'Bislett';
  const calls = [grefsen(name, id, at(2)), ...[['11', 'tram', 'Majorstuen', 4], ['18', 'tram', 'Rikshospitalet', 7], ['11', 'tram', 'Kjelsås', 9], ['17', 'tram', 'Rikshospitalet', 12], ['18', 'tram', 'Ljabru', 15]]
    .map(([line, mode, to, m], i) => ({ aimedDepartureTime: at(m), expectedDepartureTime: at(m), cancellation: false, quay: { id: `${id}:Q`, publicCode: 'A', name }, destinationDisplay: { frontText: to },
      serviceJourney: { line: { publicCode: line, transportMode: mode, presentation: null }, estimatedCalls: otherJourney(name, id, to, i + 1, at(m), 0) } }))];
  return real.departuresOut({ id, name, estimatedCalls: calls }, '6350');
};

// Stopp og avganger for Avganger-siden (eksempeldata).
const MOCK_STOPS = [['NSR:StopPlace:58381', 'Amagerveien', 'Oslo', ['bus']], ['NSR:StopPlace:6350', 'Bislett', 'Oslo', ['tram']], ['NSR:StopPlace:58366', 'Jernbanetorget', 'Oslo', ['metro', 'tram', 'bus']],
  ['NSR:StopPlace:58404', 'Majorstuen', 'Oslo', ['metro', 'tram', 'bus']], ['NSR:StopPlace:59872', 'Oslo S', 'Oslo', ['rail']], ['NSR:StopPlace:58293', 'Nationaltheatret', 'Oslo', ['metro', 'rail', 'tram']],
  ['NSR:StopPlace:4000', 'Aker brygge', 'Oslo', ['water', 'tram', 'bus']], ['NSR:StopPlace:3990', 'Frydenlund', 'Oslo', ['tram']]].map(([id, name, locality, modes]) => ({ id, name, locality, modes }));
export const searchStops = async (q) => { const t = String(q ?? '').trim().toLowerCase(); return t.length < 2 ? [] : MOCK_STOPS.filter((s) => s.name.toLowerCase().includes(t)); };
export const stopIdOf = real.stopIdOf;
export const getStopDepartures = async (stop, n = 20) => {
  const id = real.stopIdOf(stop); if (!id) throw new Error('Ugyldig stopp-ID');
  const s = MOCK_STOPS.find((x) => x.id === id) ?? { id, name: 'Stopp ' + id.split(':').pop(), modes: ['bus'] };
  const lines = { metro: [['5', 'Vestli'], ['3', 'Mortensrud'], ['2', 'Ellingsrudåsen']], tram: [['19', 'Majorstuen'], ['12', 'Kjelsås'], ['11', 'Ljabru']], bus: [['45', 'Majorstuen'], ['20', 'Skøyen'], ['31', 'Fornebu']], rail: [['L2', 'Ski'], ['R11', 'Eidsvoll']], water: [['B9', 'Nesodden']] };
  const pool = s.modes.flatMap((m) => (lines[m] ?? lines.bus).map(([line, to]) => ({ line, to, mode: m })));
  const now = Date.now(), calls = [grefsen(s.name, s.id, new Date(now + 2 * 60000).toISOString())];
  for (let i = 1; i < Math.min(40, +n || 20); i++) {
    const p = pool[i % pool.length], aimed = new Date(now + (2 + i * 3 + (i % 2)) * 60000), delay = i % 4 === 1 ? 2 : 0;
    calls.push({ aimedDepartureTime: aimed.toISOString(), expectedDepartureTime: new Date(aimed.getTime() + delay * 60000).toISOString(), realtime: i % 5 !== 4, cancellation: i === 7,
      quay: { id: `${s.id}:Q${1 + (i % 2)}`, publicCode: String(1 + (i % 2)) }, destinationDisplay: { frontText: p.to }, situations: i === 3 ? [{ summary: [{ value: 'Forsinkelser på grunn av vegarbeid', language: 'no' }] }] : [],
      serviceJourney: { line: { publicCode: p.line, transportMode: p.mode, presentation: null }, estimatedCalls: otherJourney(s.name, s.id, p.to, i, aimed.toISOString(), delay).map((x, k) => (k === 0 ? { ...x, quay: { ...x.quay, id: `${s.id}:Q${1 + (i % 2)}`, publicCode: String(1 + (i % 2)) }, expectedDepartureTime: new Date(aimed.getTime() + delay * 60000).toISOString() } : x)) } });
  }
  return real.stopDeparturesOut({ id: s.id, name: s.name, estimatedCalls: calls }, now);
};

const SUGG = ['vær', 'vær oslo', 'vg', 'nrk', 'finn.no', 'yr oslo', 'ruter reiseplanlegger', 'proxmox backup', 'home assistant', 'kino oslo', 'komplett', 'oppskrift taco', 'oppskrift pizza', 'kaffe', 'kalender 2026'];
export const getSuggestions = async (q, { withError = false } = {}) => { const k = String(q).trim().toLowerCase(); const list = !k ? [] : [...SUGG.filter((x) => x.startsWith(k)), `${k} åpningstider`, `${k} pris`].slice(0, 6); return withError ? { items: list } : list; };
const at = (min) => new Date(Date.now() + min * 60000).toISOString();
const todayAt = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const dayAt = (offset, h, m) => { const d = todayAt(h, m); d.setDate(d.getDate() + offset); return d.toISOString(); };

export const getRuter = async () => ({
  trips: [['Amagerveien', 'Majorstuen', 'T5', 'metro', [3, 11, 19]], ['Frydenlund', 'Majorstuen', '19', 'tram', [2, 7, 14]],
    ['Majorstuen', 'Amagerveien', 'T5', 'metro', [5, 13, 21]], ['Majorstuen', 'Holbergs plass', '19', 'tram', [4, 9, 16]]]
    .map(([from, to, line, mode, mins]) => ({ from, to, url: 'https://reise.ruter.no/', deps: mins.map((m, i) => real.withLineColor({ line: i === 1 && mode === 'tram' ? (to === 'Majorstuen' ? '12' : '11') : line, mode, time: at(m) })) })),
  updated: new Date().toISOString(),
});

// Demovær: et syntetisk MET-svar (timer de første 60 t, deretter 6-timers steg) kjøres gjennom samme kode som ekte data.
export function mockForecast(now = Date.now()) {
  const start = Math.floor(now / 3600_000) * 3600_000, ts = [];
  for (let h = 0; h < 160; h += h < 60 ? 1 : 6) {
    const at = start + h * 3600_000, hr = new Date(at).getUTCHours() + 2;
    const temp = 6 + 3 * Math.sin(((hr - 9) / 24) * 2 * Math.PI) - h / 40;
    const rain = h < 3 ? [0.6, 0.9, 0.4][h] : h > 70 && h < 90 ? 1.8 / 6 : 0;
    const sym = rain > 0.15 ? 'lightrain' : (hr % 24 >= 19 || hr % 24 < 8) ? (rain ? 'cloudy' : 'fair_night') : rain ? 'cloudy' : 'partlycloudy_day';
    const d = { instant: { details: { air_temperature: +temp.toFixed(1), wind_speed: 4.2, wind_speed_of_gust: 9.1, wind_from_direction: 225, relative_humidity: 87,
      dew_point_temperature: 5, air_pressure_at_sea_level: 1006 - h * 0.6, ultraviolet_index_clear_sky: 0, fog_area_fraction: 4, cloud_area_fraction: 80 } } };
    if (h < 60) d.next_1_hours = { summary: { symbol_code: sym }, details: { precipitation_amount: +rain.toFixed(1) } };
    d.next_6_hours = { summary: { symbol_code: h > 70 && h < 90 ? 'rain' : sym.replace('_night', '_day') }, details: { precipitation_amount: +(rain * 6).toFixed(1), air_temperature_max: temp + 1, air_temperature_min: temp - 1 } };
    ts.push({ time: new Date(at).toISOString(), data: d });
  }
  return { properties: { meta: { updated_at: new Date(start).toISOString() }, timeseries: ts } };
}
export function mockNowcast(now = Date.now()) {
  const start = Math.floor(now / 300_000) * 300_000;
  return { properties: { timeseries: Array.from({ length: 19 }, (_, i) => ({ time: new Date(start + i * 300_000).toISOString(), data: { instant: { details: { precipitation_rate: i < 9 ? 0.8 : 0 } } } })) } };
}
export const getWeather = async () => buildWeather({ forecast: mockForecast(), nowcast: mockNowcast(), place: 'Oslo' });

export const getSchool = async () => {
  const lessons = [[8, 15, 9, 45, 'Fysikk 2', 'B-204'], [10, 0, 11, 30, 'Matematikk R2', 'A-112'], [12, 15, 13, 45, 'Norsk', 'Aula'], [14, 0, 15, 30, 'Engelsk', 'C-301']];
  const events = [];
  for (let d = -20; d < 30; d++) {
    const day = new Date(); day.setDate(day.getDate() + d);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    for (const [h1, m1, h2, m2, t, room] of lessons) events.push({ title: t, location: room, start: dayAt(d, h1, m1), end: dayAt(d, h2, m2), allDay: false, color: { 'Fysikk 2': '#8fe0b0', 'Matematikk R2': '#9fb4ff', Norsk: '#f3d38a', Engelsk: '#e8a6d8' }[t] });
  }
  events.push({ title: 'Innlevering: Historie', location: 'Canvas', start: dayAt(4, 23, 59), end: dayAt(4, 23, 59), allDay: false, color: '#f59a8f', deadline: true });
  events.push({ title: 'Prøve i engelsk', location: 'Kap. 3–5', start: dayAt(6, 9, 0), end: dayAt(6, 10, 30), allDay: false, color: '#9fb4ff' });
  events.push({ title: 'Heldagsprøve R2', location: 'Gymsal', start: dayAt(21, 9, 0), end: dayAt(21, 14, 0), allDay: false, color: '#9fb4ff' });
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { configured: true, events };
};

/* ---------------- Prompt 26: Kalender (iCal-tekst, så calendar.js tolker den som en ekte kalender) ---------------- */
// Timeplan for Vg3 (studiespesialisering) med ukentlige gjentakelser (RRULE), lærer i DESCRIPTION/ORGANIZER og rom i LOCATION.
// Testtilfellene fra claude-code-kalender.md: Prøve i engelsk tor. 22.10 kl. 10 (erstatter engelsktimen), Foreldremøte 22.10
// kl. 18 (utenfor 08–16), Planleggingsdag fre. 30.10 (ingen timer) og Heldagsprøve R2 fre. 06.11. Høstferie og juleferie er fri.
const MOCK_TT = {
  MO: [['0815', '0945', 'Matematikk R2', 'A-112', 'Kari Hansen'], ['1000', '1130', 'Fysikk 2', 'B-204', 'Ola Berg', 'Lab B'], ['1215', '1345', 'Norsk', 'A-305', 'Ingrid Lie'], ['1400', '1500', 'Spansk', 'C-210', '@Lucía García']],
  TU: [['0815', '0945', 'Engelsk', 'C-301', 'John Smith'], ['1000', '1130', 'Kjemi 2', 'B-110', 'Per Dahl'], ['1215', '1345', 'Historie', 'A-208', 'Anne Moen']],
  WE: [['0815', '0945', 'Fysikk 2', 'B-204', 'Ola Berg'], ['1000', '1130', 'Matematikk R2', 'A-112', 'Kari Hansen'], ['1215', '1300', 'Studietid', 'Biblioteket', ''], ['1315', '1445', 'Kroppsøving', 'Hall 2', 'Even Nilsen', 'Ta med innesko']],
  TH: [['0815', '0945', 'Norsk', 'A-305', 'Ingrid Lie'], ['1000', '1130', 'Engelsk', 'C-301', 'John Smith'], ['1215', '1345', 'Kjemi 2', 'B-110', 'Per Dahl'], ['1400', '1500', 'Spansk', 'C-210', '@Lucía García']],
  FR: [['0815', '0945', 'Matematikk R2', 'A-112', 'Kari Hansen'], ['1000', '1130', 'Historie', 'A-208', 'Anne Moen'], ['1215', '1345', 'Fysikk 2', 'B-204', 'Ola Berg', 'Lab B']],
};
const FIRST_DAY = { MO: '20260817', TU: '20260818', WE: '20260819', TH: '20260820', FR: '20260821' };
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Oslo', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
const vevent = (uid, lines) => ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260801T000000Z', ...lines, 'END:VEVENT'];
const timed = (d, s, e) => [`DTSTART;TZID=Europe/Oslo:${d}T${s}00`, `DTEND;TZID=Europe/Oslo:${d}T${e}00`];
const allDay = (d1, d2) => [`DTSTART;VALUE=DATE:${d1}`, `DTEND;VALUE=DATE:${d2}`];
const cal = (name, evs) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homelab//Mock//NO', `X-WR-CALNAME:${name}`, ...VTZ, ...evs.flat(), 'END:VCALENDAR'].join('\r\n') + '\r\n';
export function mockSchoolIcs() {
  const evs = [];
  for (const [day, list] of Object.entries(MOCK_TT)) list.forEach(([s, e, subj, room, teacher, note], i) => {
    const org = teacher.startsWith('@') ? [`ORGANIZER;CN="${teacher.slice(1)}":mailto:spansk@skole.example.no`] : [];
    const desc = [teacher && !teacher.startsWith('@') ? `Lærer: ${teacher}` : '', note ?? ''].filter(Boolean).join('\n');
    evs.push(vevent(`tt-${day}-${i}@skole.example.no`, [...timed(FIRST_DAY[day], s, e), `RRULE:FREQ=WEEKLY;BYDAY=${day};UNTIL=20270618T220000Z`, `SUMMARY:${icsEsc(subj)}`, `LOCATION:${icsEsc(room)}`, ...(desc ? [`DESCRIPTION:${icsEsc(desc)}`] : []), ...org]));
  });
  evs.push(vevent('prove-eng-1@skole.example.no', [...timed('20261022', '1000', '1130'), 'SUMMARY:Prøve i engelsk', 'LOCATION:C-301', 'DESCRIPTION:Lærer: John Smith\\nKap. 3–5 · ordbok tillatt', 'CATEGORIES:Prøve']));
  evs.push(vevent('heldag-r2@skole.example.no', [...timed('20261106', '0815', '1400'), 'SUMMARY:Heldagsprøve R2', 'LOCATION:Gymsalen', 'DESCRIPTION:Lærer: Kari Hansen\\nKalkulator og formelark']));
  evs.push(vevent('muntlig-nor@skole.example.no', [...timed('20261112', '1215', '1345'), 'SUMMARY:Muntlig norsk', 'LOCATION:A-305', 'DESCRIPTION:Lærer: Ingrid Lie\\nFremføring\\, 10 min']));
  evs.push(vevent('foreldremote@skole.example.no', [...timed('20261022', '1800', '1930'), 'SUMMARY:Foreldremøte', 'LOCATION:Aula', 'DESCRIPTION:Vg3\\, alle klasser']));
  evs.push(vevent('plandag-1030@skole.example.no', [...allDay('20261030', '20261031'), 'SUMMARY:Planleggingsdag', 'DESCRIPTION:Ingen undervisning']));
  evs.push(vevent('hostferie@skole.example.no', [...allDay('20260928', '20261003'), 'SUMMARY:Høstferie (fri)']));
  evs.push(vevent('juleferie@skole.example.no', [...allDay('20261221', '20270102'), 'SUMMARY:Juleferie (fri)']));
  return cal('Timeplan 3STA', evs);
}
export function mockCanvasIcs() {
  return cal('Canvas', [
    vevent('assignment_9001@canvas', ['DTSTART;TZID=Europe/Oslo:20261028T235900', 'DTEND;TZID=Europe/Oslo:20261028T235900', 'SUMMARY:Innlevering historie [Historie 3STA]', 'DESCRIPTION:Essay om den kalde krigen\\, 1500 ord', 'URL:https://skole.instructure.com/courses/12/assignments/9001']),
    vevent('assignment_9002@canvas', ['DTSTART;TZID=Europe/Oslo:20261104T235900', 'DTEND;TZID=Europe/Oslo:20261104T235900', 'SUMMARY:Labrapport fysikk [Fysikk 2]', 'DESCRIPTION:Rapport fra forsøk 4', 'URL:https://skole.instructure.com/courses/14/assignments/9002']),
  ]);
}

export const getTrading = async () => ({
  configured: true, currency: 'NOK', total: 48312, ppl: 5340, invested: 42972, free: 0, pplPct: 12.4,
  positions: [['AAPL', 12840, 2.1], ['NVDA', 15220, 3.4], ['EQNR', 9410, -0.6], ['VUSA', 10842, 0.9]].map(([ticker, value, pct]) => ({ ticker, value, pct, ppl: value * pct / 100 })),
});

export const getEnergy = async () => {
  const kwh = [18, 22, 15, 26, 20, 12, 17];
  return { configured: true, kw: 2.4, price: 1.42, priceUnit: 'NOK/kWh', week: kwh.reduce((a, b) => a + b, 0),
    days: kwh.map((v, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return { date: d.toLocaleDateString('sv-SE'), label: d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()), kwh: v }; }) };
};

export const getHealth = async () => ({
  services: [['Ruter', 'http://192.168.1.1', 1], ['Home Assistant', 'http://192.168.1.20:8123', 1], ['Proxmox', 'https://192.168.1.10:8006', 1], ['Pi-hole', 'http://192.168.1.30/admin', 1], ['NAS', 'http://192.168.1.40:5000', 0], ['Homey', 'https://my.homey.app', 1], ['LabDeck', 'http://192.168.1.50', 1]]
    .map(([name, url, up]) => ({ name, url, host: url.replace(/^https?:\/\//, ''), up: !!up, ms: 12, error: up ? undefined : 'ECONNREFUSED' })),
  checked: new Date().toISOString(),
});

export const getUpcoming = async () => {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString(); };
  return {
    tv: { configured: true, url: 'http://192.168.1.20:8989/calendar', items: [
      ['Severance', 'S02E09 · The After Hours', 1], ['The Bear', 'S04E01 · Tonnato', 3], ['Shōgun', 'S02E02', 6], ['Slow Horses', 'S05E04', 9],
    ].map(([title, sub, n]) => ({ kind: 'tv', title, sub, date: d(n), img: null, status: 'kommer', overview: 'Eksempeldata – koble til Sonarr i Innstillinger.', url: '#' })) },
    movies: { configured: true, url: 'http://192.168.1.20:7878/calendar', items: [
      ['Dune: Messiah', 'kino · 2026', 5], ['Mickey 17', 'digital · 2025', 12], ['The Batman Part II', 'kino · 2026', null],
    ].map(([title, sub, n]) => ({ kind: 'movie', title, sub, date: n ? d(n) : null, img: null, status: n ? sub.split(' ')[0] : 'overvåkes', overview: 'Eksempeldata – koble til Radarr i Innstillinger.', url: '#' })) },
  };
};

export const getNews = async () => ({ items: [
  ['NRK', '#0b4ea2', 'Regjeringen legger fram statsbudsjettet for 2027', 12], ['VG', '#c8102e', 'Rekordmange søker seg til IT-utdanning', 25],
  ['NRK', '#0b4ea2', 'Kraftig regn ventes på Østlandet i helgen', 41], ['VG', '#c8102e', 'Bodø/Glimt klare for nytt europaeventyr', 58],
  ['NRK', '#0b4ea2', 'Ny T-banetunnel åpner neste år', 73], ['VG', '#c8102e', 'Slik får du billigere strøm i vinter', 95],
].map(([src, color, title, m]) => ({ src, color, title, url: src === 'NRK' ? 'https://www.nrk.no' : 'https://www.vg.no', date: new Date(Date.now() - m * 60000).toISOString() })) });

// Plex og Jellyfin (eksempeldata som i designet).
const mediaServers = () => [
  { src: 'plex', label: 'Plex', name: 'Plex', version: '1.41.3', url: 'http://192.168.1.20:32400/web/index.html', ok: true },
  { src: 'jellyfin', label: 'Jellyfin', name: 'Jellyfin', version: '10.10.3', url: 'http://192.168.1.20:8096/web/', ok: true },
];
export const getMediaNow = async () => ({ configured: true, mock: true, servers: mediaServers(), items: [
  { src: 'plex', kind: 'movie', title: 'Dune: Part Two', sub: '2024', user: 'Ingrid', device: 'Stue-TV', mode: 'direct', quality: '4K', state: 'playing', pct: 62, leftMs: 58 * 60_000, poster: null },
  { src: 'jellyfin', kind: 'episode', title: 'Severance · S02E05', sub: 'Trojan’s Horse', user: 'Sebastian', device: 'iPhone', mode: 'transcode', quality: '1080p', state: 'paused', pct: 18, leftMs: 41 * 60_000, poster: null },
] });
export const getMediaRecent = async () => ({ configured: true, mock: true, servers: mediaServers(), items: [
  ['Shōgun', 'Serie · S01', 'plex', 'tv'], ['The Brutalist', 'Film · 2024', 'plex', 'movie'], ['Flow', 'Film · 2024', 'jellyfin', 'movie'],
  ['Slow Horses', 'Serie · S05E02', 'jellyfin', 'tv'], ['Conclave', 'Film · 2024', 'plex', 'movie'], ['Andor', 'Serie · S02E03', 'jellyfin', 'tv'],
].map(([title, sub, src, kind], i) => ({ src, kind, title, sub, added: new Date(Date.now() - i * 3600_000).toISOString(), poster: null, url: '#' })) });
export const getMediaHistory = async () => ({ configured: true, mock: true, servers: mediaServers(), items: [
  ['sebastiankristo', 'FBI', 8, 21, 'Long Shot', 'plex', 20], ['sebastiankristo', 'FBI', 8, 20, 'Roleplay', 'plex', 21], ['sebastiankristo', 'FBI', 8, 19, 'Fidelity', 'plex', 22],
  ['Ingrid', 'Dune: Part Two', 0, 0, '2024', 'plex', 26], ['sebastiankristo', 'Severance', 2, 4, 'Woe’s Hollow', 'jellyfin', 30], ['Pål', 'The Bear', 3, 2, 'Next', 'jellyfin', 47],
  ['sebastiankristo', 'Severance', 2, 3, 'Who Is Alive?', 'jellyfin', 52],
].map(([user, show, season, episode, title, src, h]) => ({ src, kind: season ? 'episode' : 'movie', user, show, title, season: season || null, episode: episode || null,
  playedAt: new Date(Date.now() - h * 3600_000).toISOString(), poster: null, url: '#' })) });
export const getMediaPoster = async () => null;

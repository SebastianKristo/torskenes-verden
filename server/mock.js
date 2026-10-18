// Eksempeldata for utvikling og demo (MOCK_DATA=1). Brukes når eksterne API-er ikke er tilgjengelige.
import * as real from './integrations.js';
import { buildWeather } from './weather.js';

export const { GALLERIES, getTle, getApod, getGallery } = real;

export const getDepartures = async () => ({ stop: 'Bislett', stopId: '6350', departures: [['11', 'tram', 'Majorstuen', 2], ['17', 'tram', 'Rikshospitalet', 4], ['18', 'tram', 'Rikshospitalet', 7], ['11', 'tram', 'Kjelsås', 9], ['17', 'tram', 'Grefsen', 12], ['18', 'tram', 'Ljabru', 15]]
  .map(([line, mode, to, m]) => ({ line, mode, to, time: at(m) })) });

const SUGG = ['vær', 'vær oslo', 'vg', 'nrk', 'finn.no', 'yr oslo', 'ruter reiseplanlegger', 'proxmox backup', 'home assistant', 'kino oslo', 'komplett', 'oppskrift taco', 'oppskrift pizza', 'kaffe', 'kalender 2026'];
export const getSuggestions = async (q, { withError = false } = {}) => { const k = String(q).trim().toLowerCase(); const list = !k ? [] : [...SUGG.filter((x) => x.startsWith(k)), `${k} åpningstider`, `${k} pris`].slice(0, 6); return withError ? { items: list } : list; };
const at = (min) => new Date(Date.now() + min * 60000).toISOString();
const todayAt = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const dayAt = (offset, h, m) => { const d = todayAt(h, m); d.setDate(d.getDate() + offset); return d.toISOString(); };

export const getRuter = async () => ({
  trips: [['Amagerveien', 'Majorstuen', 'T5', 'metro', [3, 11, 19]], ['Frydenlund', 'Majorstuen', '19', 'tram', [2, 7, 14]],
    ['Majorstuen', 'Amagerveien', 'T5', 'metro', [5, 13, 21]], ['Majorstuen', 'Holbergs plass', '19', 'tram', [4, 9, 16]]]
    .map(([from, to, line, mode, mins]) => ({ from, to, url: 'https://reise.ruter.no/', deps: mins.map((m, i) => ({ line: i === 1 && mode === 'tram' ? (to === 'Majorstuen' ? '12' : '11') : line, mode, time: at(m) })) })),
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

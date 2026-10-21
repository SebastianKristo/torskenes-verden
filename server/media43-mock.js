// Prompt 43 (SERVER43): innebygd Sonarr, Radarr, qBittorrent og Prowlarr for MOCK_DATA=1 (ingen nett).
// Etterligner de ekte API-ene (Sonarr/Radarr v3, qBittorrent v2, Prowlarr v1) bak en falsk fetch, så den ekte koden
// i media43.js (normalisering, kø-kobling, Glimt) kjøres også i demo og tester. Dataene er de samme som i Media.dc.html.
// Vertene er http://mock-sonarr, http://mock-radarr, http://mock-qbit og http://mock-prowlarr.
import { createHash } from 'node:crypto';

const GB = 1024 ** 3, MB = 1024 ** 2;
const DAY = 86400_000;
const pad = (n) => String(n).padStart(2, '0');
const code = (s, e) => `S${pad(s)}E${pad(e)}`;
const dotN = (t) => t.replace(/[':]/g, '').replace(/[^A-Za-z0-9]+/g, '.').replace(/\.$/, '');
const sha1 = (s) => createHash('sha1').update(String(s)).digest('hex');
const osloDay = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
/** Oslo-tid «YYYY-MM-DD HH:MM» → ISO (UTC). Sommer-/vintertid regnes ut med Intl. */
function osloIso(date, hm = '03:00') {
  const guess = Date.parse(`${date}T${hm}:00Z`);
  const off = (t) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - t; };
  return new Date(guess - off(guess)).toISOString();
}

export const PROFILES43 = [{ id: 1, name: 'Any' }, { id: 3, name: 'HD-720p' }, { id: 4, name: 'HD-1080p' }, { id: 6, name: 'HD - 720p/1080p' }, { id: 5, name: 'Ultra-HD' }];
const PID = Object.fromEntries(PROFILES43.map((p) => [p.name, p.id]));
const COL = ['#2e3b4a', '#3f5a4a', '#6b3b2e', '#7a5a2a', '#4a6b3a', '#5a4a6b', '#3c4a5c', '#2f2f36', '#6b4a3a', '#3a5a6b', '#5c3c4a', '#4a4a2e'];

// [nøkkel, tittel, år, kanal, farge, profil, overvåking, avsluttet, sesonger: [nr, antall, har, sendt, {indeks: navn}]]
const SERIES = [
  ['omitb', 'Only Murders in the Building', 2021, 'Disney+', COL[2], 'HD-1080p', true, false, [[4, 10, 10, 10], [5, 10, 8, 9, { 8: 'The Last Floor', 9: 'Finale' }]]],
  ['slow', 'Slow Horses', 2022, 'Apple TV+', COL[0], 'Ultra-HD', true, false, [[5, 6, 6, 6], [6, 6, 2, 3, { 2: 'Dead Drop' }]]],
  ['shrink', 'Shrinking', 2023, 'Apple TV+', COL[1], 'HD-1080p', true, false, [[2, 12, 12, 12], [3, 10, 7, 8, { 7: 'Every Tuesday' }]]],
  ['bear', 'The Bear', 2022, 'Disney+', COL[3], 'HD-1080p', true, false, [[4, 10, 0, 10], [5, 8, 0, 0, { 0: 'Prep' }]]],
  ['hacks', 'Hacks', 2021, 'HBO Max', COL[5], 'HD-1080p', true, false, [[4, 10, 10, 10], [5, 10, 3, 3, { 3: 'Roast' }]]],
  ['exit', 'Exit', 2019, 'NRK', COL[7], 'HD-1080p', true, false, [[3, 8, 8, 8], [4, 6, 0, 0, { 0: 'Sesongstart' }]], 'future'],
  ['succ', 'Succession', 2018, 'HBO Max', COL[8], 'Ultra-HD', true, true, [[4, 10, 10, 10]]],
  ['skam', 'Skam', 2015, 'NRK', COL[9], 'HD-1080p', true, true, [[4, 10, 10, 10]]],
  ['lotus', 'The White Lotus', 2021, 'HBO Max', COL[10], 'HD-1080p', true, false, [[3, 8, 8, 8]]],
  ['rookie', 'The Rookie', 2018, 'ABC', '#34495e', 'HD-720p', true, false, [[6, 10, 10, 10], [7, 18, 4, 6, { 4: 'The Hammer', 5: 'Mutiny' }]]],
  ['bluey', 'Bluey', 2018, 'NRK Super', COL[11], 'HD-720p', true, false, [[3, 12, 12, 12]]],
];
// Finnes ikke i biblioteket (søk / Legg til).
const LOOKUP_SERIES = [
  ['sev', 'Severance', 2022, 'Apple TV+', COL[6], [[1, 9, 0, 9], [2, 10, 0, 10], [3, 10, 0, 0, { 0: 'Sesongstart' }]], 'Mark og kollegene hans har fått minnene sine delt i to.'],
  ['plur', 'Pluribus', 2025, 'Apple TV+', COL[1], [[1, 9, 0, 9]], 'Den mest elendige personen på jorda må redde verden fra lykke.'],
  ['pitt', 'The Pitt', 2025, 'HBO Max', COL[2], [[1, 15, 0, 15]], 'Femten timer på en akuttmottak i Pittsburgh.'],
  ['andor', 'Andor', 2022, 'Disney+', COL[8], [[1, 12, 0, 12], [2, 12, 0, 12]], 'Cassian Andor før opprøret.'],
];
// [dag fra i dag, nøkkel, sesong, episode, klokkeslett] – Kommer snart (Oslo-tid).
const UPC = [[0, 'slow', 6, 3, '03:00'], [0, 'shrink', 3, 8, '09:00'], [0, 'omitb', 5, 9, '09:00'], [1, 'bear', 5, 1, '03:00'], [2, 'hacks', 5, 4, '03:00'], [3, 'sev', 3, 1, '03:00'], [3, 'exit', 4, 1, '06:00'], [6, 'omitb', 5, 10, '09:00'], [6, 'shrink', 3, 9, '09:00'], [0, 'rookie', 7, 6, '02:00']];
// [nøkkel, tittel, år, farge, profil, tilgjengelighet, har fil, kvalitet, GB, notat]
const MOVIES = [
  ['wicked', 'Wicked: For Good', 2025, COL[4], 'Ultra-HD', 'released', false, null, null, 1],
  ['dune3', 'Dune: Part Three', 2026, COL[3], 'Ultra-HD', 'announced', false, null, null, 58],
  ['obaa', 'One Battle After Another', 2025, COL[5], 'Ultra-HD', 'released', false, null, null, -20],
  ['opp', 'Oppenheimer', 2023, COL[0], 'Ultra-HD', 'released', true, 2160, 61.2, -700],
  ['sinners', 'Sinners', 2025, COL[2], 'Ultra-HD', 'released', true, 2160, 48.9, -150],
  ['affek', 'Affeksjonsverdi', 2025, COL[6], 'HD-1080p', 'released', true, 1080, 9.8, -30],
  ['past', 'Past Lives', 2023, COL[9], 'HD-1080p', 'released', true, 1080, 8.4, -800],
  ['flow', 'Flow', 2024, COL[1], 'HD-1080p', 'released', true, 1080, 6.1, -300],
  ['kontiki', 'Kon-Tiki', 2012, COL[10], 'HD-1080p', 'released', true, 1080, 11.2, -4000],
];
const LOOKUP_MOVIES = [['frank', 'Frankenstein', 2025, COL[7]], ['bugonia', 'Bugonia', 2025, COL[11]], ['hamnet', 'Hamnet', 2025, COL[9]], ['marty', 'Marty Supreme', 2025, COL[3]], ['avatar3', 'Avatar: Fire and Ash', 2025, COL[6]]];
const IDX = [['IPTorrents', 412, 38, 4, 'private'], ['TorrentLeech', 388, 41, 3, 'private'], ['NorBits', 520, 22, 1, 'private'], ['TorrentDay', 610, 19, 0, 'private'], ['1337x', 0, 12, 0, 'public', true], ['EZTV', 290, 30, 2, 'public'],
  ['YTS', 240, 14, 1, 'public'], ['Nyaa', 330, 6, 0, 'public'], ['LimeTorrents', 700, 9, 0, 'public'], ['TheRARBG', 450, 17, 1, 'public'], ['Knaben', 380, 11, 0, 'public'], ['BitSearch', 510, 8, 0, 'public']];
// Prowlarr-katalogen (GET /api/v1/indexer/schema): [navn, privacy, språk, kategorier, innlogging]
const CATALOG = [['TorrentGalaxy', 'public', 'en-US', 'Film, TV'], ['The Pirate Bay', 'public', 'multi', 'Film, TV'], ['Nordicbytes', 'private', 'nb-NO', 'Film, TV', 'user'], ['DanishBytes', 'private', 'da-DK', 'Film, TV', 'key'],
  ['NorBits', 'private', 'nb-NO', 'Film, TV', 'user'], ['IPTorrents', 'private', 'en-US', 'Film, TV', 'cookie'], ['TorrentLeech', 'private', 'en-US', 'Film, TV', 'user'], ['BeyondHD', 'private', 'en-US', 'Film, TV · 4K', 'key'],
  ['PassThePopcorn', 'private', 'en-US', 'Film', 'key'], ['BroadcasTheNet', 'private', 'en-US', 'TV', 'key'], ['MoreThanTV', 'private', 'en-US', 'TV', 'key'], ['FileList', 'private', 'ro-RO', 'Film, TV', 'user'],
  ['SceneTime', 'private', 'en-US', 'Film, TV', 'cookie'], ['RuTracker', 'semiPrivate', 'ru-RU', 'Film, TV', 'user'], ['EZTV', 'public', 'en-US', 'TV'], ['YTS', 'public', 'en-US', 'Film'], ['Nyaa', 'public', 'ja-JP', 'Anime'],
  ['1337x', 'public', 'en-US', 'Film, TV'], ['Knaben', 'public', 'en-US', 'Film, TV'], ['NZBgeek', 'private', 'en-US', 'Film, TV', 'key', 'usenet'], ['DrunkenSlug', 'private', 'en-US', 'Film, TV', 'key', 'usenet'], ['NZBFinder', 'private', 'en-US', 'Film, TV', 'key', 'usenet']];
// Interaktivt søk: [hale, kvalitet, oppløsning, GB tv, GB film, seedere, peers, indekser, tale, tekst]
const REL = [
  ['.1080p.WEB-DL.DDP5.1.H.264-NTb', 'WEBDL-1080p', 1080, 2.4, 9.8, 1204, 96, 'IPTorrents', ['English'], ['NO', 'SV', 'DA', 'EN']],
  ['.2160p.WEB-DL.DDP5.1.HDR.H.265-NTb', 'WEBDL-2160p', 2160, 5.2, 24.6, 412, 38, 'TorrentLeech', ['English'], ['NO', 'EN']],
  ['.NORDiC.1080p.WEB-DL.H.264-TWA', 'WEBDL-1080p', 1080, 2.6, 10.2, 58, 4, 'NorBits', ['English'], ['NO', 'SV', 'DA', 'FI']],
  ['.720p.WEB.h264-ETHEL', 'WEBRip-720p', 720, 0.7, 3.1, 860, 40, 'TorrentDay', ['English'], ['EN']],
  ['.1080p.WEB.h264-ETHEL', 'WEBRip-1080p', 1080, 1.4, 6.4, 0, 12, '1337x', ['English'], []],
  ['.720p.HEVC.x265-MeGusta', 'HDTV-720p', 720, 0.31, 2.2, 640, 22, 'EZTV', ['English'], ['EN']],
  ['.480p.x264-mSD', 'SDTV', 480, 0.18, 0.9, 95, 6, 'TorrentGalaxy', ['English'], []],
];

/* ---------------- Tilstand ---------------- */

let S = null;
const SPEED_SCALE = 0.05; // demo: nedlastingene går sakte (ca. 1/20 av farten som vises)
function seed() {
  const today = osloDay();
  const st = { t0: Date.now(), last: Date.now(), today, series: [], episodes: [], movies: [], torrents: [], indexers: [], releases: new Map(), nextId: { series: 1, movie: 1, idx: 1, cmd: 1 }, alt: false, altLimit: 5 * MB, commands: [], log: [] };
  const mkSeries = (key, title, year, network, color, profile, monitored, ended, seasons, monitorMode, overview) => {
    const id = st.nextId.series++;
    const up = UPC.filter((u) => u[1] === key);
    const last = seasons[seasons.length - 1][0];
    let fileN = 0, epN = 0, totalN = 0;
    for (const [n, tot, have, aired, names = {}] of seasons) {
      const anchor = up.find((u) => u[2] === n);
      for (let i = 0; i < tot; i++) {
        const e = i + 1;
        const explicit = up.find((u) => u[2] === n && u[3] === e);
        let date, hm = '03:00';
        if (explicit) { date = addDays(today, explicit[0]); hm = explicit[4]; }
        else if (anchor) { date = addDays(addDays(today, anchor[0]), 7 * (e - anchor[3])); hm = anchor[4]; }
        else if (i < aired) date = addDays(today, -7 * (aired - i) - (last - n) * 365);
        else date = addDays(today, 7 * (i - aired + 1) + 30);
        const isAired = explicit ? explicit[0] <= 0 && i < aired : i < aired;
        const hasFile = i < have;
        const mon = monitorMode === 'future' ? !isAired : true;
        const ep = { id: id * 10000 + n * 100 + e, seriesId: id, tvdbId: 900000 + id * 1000 + n * 50 + e, seasonNumber: n, episodeNumber: e, title: names[i] ?? `Episode ${e}`,
          airDate: date, airDateUtc: osloIso(date, hm), hasFile, monitored: monitored && mon, episodeFileId: hasFile ? id * 10000 + n * 100 + e : 0,
          ...(hasFile ? { episodeFile: { size: Math.round((profile === 'Ultra-HD' ? 5.2 : profile === 'HD-720p' ? 0.8 : 2.2) * GB), quality: { quality: { name: profile === 'Ultra-HD' ? 'WEBDL-2160p' : profile === 'HD-720p' ? 'HDTV-720p' : 'WEBDL-1080p', resolution: profile === 'Ultra-HD' ? 2160 : profile === 'HD-720p' ? 720 : 1080 } } } } : {}) };
        st.episodes.push(ep);
        totalN++; if (hasFile) fileN++; if (isAired) epN++;
      }
    }
    const s = { id, title, sortTitle: title.toLowerCase().replace(/^the /, ''), year, network, status: ended ? 'ended' : 'continuing', overview: overview ?? `${title} (${year}) · ${network}`, tvdbId: 300000 + id,
      images: [{ coverType: 'poster', remoteUrl: null }], qualityProfileId: PID[profile] ?? 4, monitored, seriesType: 'standard', seasonFolder: true, path: `/data/media/tv/${title}`, rootFolderPath: '/data/media/tv',
      added: new Date(Date.now() - (id + 3) * 40 * DAY).toISOString(), _key: key, _color: color, _monitor: monitorMode ?? 'all' };
    st.series.push(s);
    return s;
  };
  for (const x of SERIES) mkSeries(x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], x[8], x[9]);
  st._mkSeries = mkSeries;
  for (const [key, title, year, color, profile, avail, has, res, gb, rel] of MOVIES) {
    const id = st.nextId.movie++;
    const digital = addDays(today, rel);
    st.movies.push({ id, title, year, tmdbId: 700000 + id, status: avail === 'announced' ? 'announced' : 'released', minimumAvailability: avail, qualityProfileId: PID[profile], monitored: true, hasFile: has,
      inCinemas: addDays(digital, -45), digitalRelease: digital, physicalRelease: addDays(digital, 30), path: `/data/media/film/${title} (${year})`, rootFolderPath: '/data/media/film', images: [{ coverType: 'poster', remoteUrl: null }],
      sizeOnDisk: has ? Math.round(gb * GB) : 0, overview: `${title} (${year})`, studio: '', runtime: 140,
      ...(has ? { movieFile: { size: Math.round(gb * GB), relativePath: `${dotN(title)}.${year}.${res}p.mkv`, quality: { quality: { name: res === 2160 ? 'Bluray-2160p' : 'WEBDL-1080p', resolution: res } } } } : {}),
      _key: key, _color: color, ...(key === 'dune3' ? { _note: 'På kino 18. desember' } : {}) });
  }
  const ser = (k) => st.series.find((s) => s._key === k), ep = (k, s, e) => st.episodes.find((x) => x.seriesId === ser(k).id && x.seasonNumber === s && x.episodeNumber === e);
  const mv = (k) => st.movies.find((m) => m._key === k);
  const addT = (name, gb, pct, mbps, state, cat, link, files, seeds = 40, peers = 12) => st.torrents.push({ hash: sha1(name), name, size: Math.round(gb * GB), total_size: Math.round(gb * GB), progress: pct / 100, dlspeed: 0, upspeed: 0, eta: 8640000,
    state, category: cat, save_path: `/data/downloads/${cat === 'radarr' ? 'film' : 'tv'}`, priority: st.torrents.length + 1, num_seeds: seeds, num_leechs: peers, added_on: Math.floor((Date.now() - (st.torrents.length + 1) * 3600_000) / 1000),
    force_start: false, seq_dl: false, f_l_piece_prio: false, _rate: mbps * MB, _link: link, _files: files ?? [{ name: `${name}.mkv`, size: Math.round(gb * GB), priority: 1 }] });
  addT('Shrinking.S03E08.1080p.ATVP.WEB-DL.DDP5.1.H.264-NTb', 2.1, 64, 12.8, 'downloading', 'tv-sonarr', { seriesId: ser('shrink').id, episodeIds: [ep('shrink', 3, 8).id] });
  addT('Wicked.For.Good.2025.2160p.WEB-DL.DV.HDR.DDP5.1.Atmos-FLUX', 18.4, 22, 5.6, 'downloading', 'radarr', { movieId: mv('wicked').id });
  addT('Only.Murders.in.the.Building.S05E09.1080p.WEB.h264-ETHEL', 1.4, 3, 0, 'stalledDL', 'tv-sonarr', { seriesId: ser('omitb').id, episodeIds: [ep('omitb', 5, 9).id] }, null, 0, 3);
  addT('The.Bear.S04.1080p.DSNP.WEB-DL.DDP5.1.H.264-NTb', 14.2, 48, 9.4, 'pausedDL', 'tv-sonarr', { seriesId: ser('bear').id, episodeIds: st.episodes.filter((x) => x.seriesId === ser('bear').id && x.seasonNumber === 4).map((x) => x.id) },
    [['The.Bear.S04E01.1080p.DSNP.WEB-DL.mkv', 1.8, 1], ['The.Bear.S04E02.1080p.DSNP.WEB-DL.mkv', 1.7, 1], ['The.Bear.S04E03.1080p.DSNP.WEB-DL.mkv', 1.9, 1], ['Sample/the.bear.s04e01.sample.mkv', 0.06, 0]].map(([n, g, p]) => ({ name: n, size: Math.round(g * GB), priority: p })));
  addT('Slow.Horses.S06E03.2160p.ATVP.WEB-DL.DDP5.1.HDR.H.265-NTb', 6.8, 91, 11.2, 'downloading', 'tv-sonarr', { seriesId: ser('slow').id, episodeIds: [ep('slow', 6, 3).id] });
  for (const [name, ms, qn, g, privacy, fail] of IDX) st.indexers.push({ id: st.nextId.idx++, name, enable: true, protocol: 'torrent', privacy, priority: 25, definitionName: name.toLowerCase().replace(/[^a-z0-9]/g, ''), appProfileId: 1, tags: [], fields: [], _ms: ms, _q: qn, _g: g, _fail: !!fail, _failSince: fail ? osloIso(today, '08:40') : null });
  return st;
}
const state = () => { if (!S || S.today !== osloDay()) S = seed(); return S; };
/** Bare for tester: start på nytt. */
export const _resetMock43 = () => { S = null; };

/** Nedlastingene går fremover (kalles ved hver forespørsel). Ferdige blir «uploading» og filen markeres i Sonarr/Radarr. */
export function advanceMock43(extraMs = 0) {
  const st = state(), now = Date.now(), dt = (now - st.last + extraMs) / 1000;
  st.last = now;
  const active = st.torrents.filter((t) => ['downloading', 'forcedDL'].includes(t.state) && t._rate > 0);
  const raw = active.reduce((a, t) => a + t._rate, 0), f = st.alt && raw > st.altLimit ? st.altLimit / raw : 1;
  for (const t of st.torrents) {
    if (!active.includes(t)) { t.dlspeed = 0; t.eta = t.progress >= 1 ? 0 : 8640000; t.upspeed = t.progress >= 1 && !/paused|stopped/.test(t.state) ? Math.round(1.2 * MB) : 0; continue; }
    const rate = t._rate * f;
    t.dlspeed = Math.round(rate);
    t.progress = Math.min(1, t.progress + (rate * SPEED_SCALE * dt) / t.size);
    t.eta = t.progress >= 1 ? 0 : Math.round(((1 - t.progress) * t.size) / Math.max(1, rate * SPEED_SCALE));
    if (t.progress >= 1) { t.state = 'uploading'; t.dlspeed = 0; t.completion_on = Math.floor(now / 1000); markDone(st, t); }
  }
}
function markDone(st, t) {
  if (t._link?.movieId) { const m = st.movies.find((x) => x.id === t._link.movieId); if (m) { m.hasFile = true; m.sizeOnDisk = t.size; m.movieFile = { size: t.size, relativePath: `${t.name}.mkv`, quality: { quality: { name: /2160/.test(t.name) ? 'WEBDL-2160p' : 'WEBDL-1080p', resolution: /2160/.test(t.name) ? 2160 : 1080 } } }; } }
  for (const id of t._link?.episodeIds ?? []) { const e = st.episodes.find((x) => x.id === id); if (e && Date.parse(e.airDateUtc) <= Date.now()) { e.hasFile = true; e.episodeFileId = e.id; e.episodeFile = { size: Math.round(t.size / Math.max(1, t._link.episodeIds.length)), quality: { quality: { name: /2160/.test(t.name) ? 'WEBDL-2160p' : /720/.test(t.name) ? 'HDTV-720p' : 'WEBDL-1080p', resolution: /2160/.test(t.name) ? 2160 : /720/.test(t.name) ? 720 : 1080 } } }; } }
}

/* ---------------- Svar ---------------- */

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const text = (t, status = 200, headers = {}) => new Response(t, { status, headers: { 'content-type': 'text/plain', ...headers } });
const body = async (init) => { const b = init?.body; if (b == null) return null; if (typeof b === 'string') { try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(b)); } } if (b instanceof URLSearchParams) return Object.fromEntries(b); if (typeof FormData !== 'undefined' && b instanceof FormData) return Object.fromEntries(b); return null; };
const seriesStats = (st, s) => {
  const eps = st.episodes.filter((e) => e.seriesId === s.id);
  const aired = eps.filter((e) => Date.parse(e.airDateUtc) <= Date.now());
  const stat = (list, al) => ({ episodeFileCount: list.filter((e) => e.hasFile).length, episodeCount: al.filter((e) => e.monitored || e.hasFile).length, totalEpisodeCount: list.length, sizeOnDisk: list.reduce((a, e) => a + (e.episodeFile?.size ?? 0), 0),
    percentOfEpisodes: al.length ? Math.round((list.filter((e) => e.hasFile).length / al.length) * 1000) / 10 : 0 });
  const nums = [...new Set(eps.map((e) => e.seasonNumber))].sort((a, b) => a - b);
  return { ...s, statistics: { ...stat(eps, aired), seasonCount: nums.length }, seasons: nums.map((n) => ({ seasonNumber: n, monitored: eps.filter((e) => e.seasonNumber === n).some((e) => e.monitored), statistics: stat(eps.filter((e) => e.seasonNumber === n), aired.filter((e) => e.seasonNumber === n)) })) };
};
const movieOut = (m) => ({ ...m, isAvailable: m.status !== 'announced', ...(m.movieFile ? { movieFile: { id: m.id * 10, ...m.movieFile } } : {}) });
const qState = (t) => (/paused|stopped/.test(t.state) ? 'paused' : t.state === 'stalledDL' ? 'warning' : t.progress >= 1 ? 'completed' : 'downloading');
function queueFor(st, svc) {
  return st.torrents.filter((t) => (svc === 'sonarr' ? t._link?.episodeIds : t._link?.movieId) && t.progress < 1).flatMap((t) => {
    const base = { downloadId: t.hash.toUpperCase(), title: t.name, size: t.size, sizeleft: Math.round(t.size * (1 - t.progress)), status: qState(t), trackedDownloadStatus: t.state === 'stalledDL' ? 'warning' : 'ok',
      trackedDownloadState: 'downloading', protocol: 'torrent', downloadClient: 'qBittorrent', timeleft: t.eta < 8640000 ? new Date(t.eta * 1000).toISOString().slice(11, 19) : null, statusMessages: t.state === 'stalledDL' ? [{ title: t.name, messages: ['Ingen seedere'] }] : [] };
    return svc === 'sonarr' ? t._link.episodeIds.map((id, i) => ({ id: Number(`${t.priority}${i}`), seriesId: t._link.seriesId, episodeId: id, ...base })) : [{ id: t.priority, movieId: t._link.movieId, ...base }];
  });
}
function releasesFor(st, svc, { title, codeS, episodeIds = [], movieId = null, seriesId = null, season = null }) {
  const mv = svc === 'radarr';
  const base = dotN(title) + '.' + codeS;
  return REL.map(([tail, q, res, gbT, gbM, s, l, ix, langs, subs], i) => {
    const guid = `mock-${svc}-${sha1(base + tail).slice(0, 16)}`;
    const idx = st.indexers.find((x) => x.name === ix);
    const r = { guid, indexerId: idx?.id ?? 99, indexer: ix, title: base + tail, quality: { quality: { name: q, resolution: res } }, size: Math.round((mv ? gbM : gbT) * GB), seeders: s, leechers: l, ageHours: 6 + i * 11, age: Math.floor((6 + i * 11) / 24),
      publishDate: new Date(Date.now() - (6 + i * 11) * 3600_000).toISOString(), languages: langs.map((name) => ({ name })), subtitles: subs, rejected: s === 0, rejections: s === 0 ? ['Ingen seedere'] : [], protocol: 'torrent', downloadAllowed: true,
      ...(mv ? { movieId } : { seriesId, episodeIds, seasonNumber: season, mappedEpisodeInfo: episodeIds.map((id) => ({ id })) }) };
    st.releases.set(guid, { svc, r });
    return r;
  });
}
const lookupSeries = (st, term) => {
  const t = String(term ?? '').toLowerCase().trim();
  const lib = st.series.map((s) => ({ ...seriesStats(st, s) }));
  const ext = LOOKUP_SERIES.filter((x) => !st.series.some((s) => s._key === x[0])).map(([key, title, year, network, color, seasons, overview], i) => ({ title, year, network, overview, tvdbId: 400000 + i, images: [{ coverType: 'poster', remoteUrl: null }], status: 'continuing',
    seasons: seasons.map(([n]) => ({ seasonNumber: n, monitored: true })), statistics: { seasonCount: seasons.length, totalEpisodeCount: seasons.reduce((a, x) => a + x[1], 0) }, _key: key, _color: color }));
  const id = t.match(/^tvdb:(\d+)$/)?.[1];
  return [...lib, ...ext].filter((x) => (id ? x.tvdbId === +id : !t || x.title.toLowerCase().includes(t) || t.includes(x.title.toLowerCase()))).slice(0, 20);
};
const lookupMovies = (st, term) => {
  const t = String(term ?? '').toLowerCase().trim();
  const ext = LOOKUP_MOVIES.filter((x) => !st.movies.some((m) => m._key === x[0])).map(([key, title, year, color], i) => ({ title, year, tmdbId: 800000 + i, images: [{ coverType: 'poster', remoteUrl: null }], status: 'released', overview: `${title} (${year})`, _key: key, _color: color }));
  const id = t.match(/^tmdb:(\d+)$/)?.[1];
  return [...st.movies.map(movieOut), ...ext].filter((x) => (id ? x.tmdbId === +id : !t || x.title.toLowerCase().includes(t) || t.includes(x.title.toLowerCase()))).slice(0, 20);
};

async function sonarrRadarr(svc, method, path, q, init) {
  const st = state(), b = await body(init);
  const P = path.replace(/^\/api\/v3/, '');
  const isS = svc === 'sonarr';
  if (P === '/system/status') return json({ appName: isS ? 'Sonarr' : 'Radarr', version: isS ? '4.0.9.2244' : '5.14.0.9383' });
  if (P === '/qualityprofile') return json(PROFILES43.map((p) => ({ ...p, upgradeAllowed: true })));
  if (P === '/rootfolder') return json([{ id: 1, path: isS ? '/data/media/tv' : '/data/media/film', accessible: true, freeSpace: Math.round(2.4 * 1024 * GB), unmappedFolders: [] }]);
  if (P === '/diskspace') return json([{ path: '/data', label: 'data', freeSpace: Math.round(2.4 * 1024 * GB), totalSpace: Math.round(8 * 1024 * GB) }]);
  if (P === '/health') return json([]);
  if (P === '/queue') { const rec = queueFor(st, svc); return json({ page: 1, pageSize: 200, totalRecords: rec.length, records: rec }); }
  if (P === '/command' && method === 'POST') {
    const id = st.nextId.cmd++;
    st.commands.push({ svc, ...b });
    // Automatisk søk: beste treff sendes til qBittorrent (som i designet).
    if (/^(EpisodeSearch|SeasonSearch|SeriesSearch|MissingEpisodeSearch|MoviesSearch)$/.test(b?.name ?? '')) autoGrab(st, svc, b);
    return json({ id, name: b?.name, status: 'queued', queued: new Date().toISOString() }, 201);
  }
  if (isS) {
    if (P === '/calendar') {
      const from = Date.parse(q.get('start')), to = Date.parse(q.get('end'));
      return json(st.episodes.filter((e) => { const t = Date.parse(e.airDateUtc); return t >= from && t < to && (q.get('unmonitored') === 'true' || e.monitored); }).map((e) => ({ ...e, series: seriesStats(st, st.series.find((s) => s.id === e.seriesId)) })));
    }
    if (P === '/series' && method === 'GET') return json(st.series.map((s) => seriesStats(st, s)));
    if (P === '/series/lookup') return json(lookupSeries(st, q.get('term')));
    if (P === '/series' && method === 'POST') {
      if (st.series.some((s) => s.tvdbId === b?.tvdbId || s.title === b?.title)) return json([{ propertyName: 'TvdbId', errorMessage: 'This series has already been added' }], 400);
      const src = LOOKUP_SERIES.find((x) => x[1] === b?.title || 400000 + LOOKUP_SERIES.indexOf(x) === b?.tvdbId);
      if (!src) return json([{ errorMessage: 'Fant ikke serien' }], 400);
      const mon = b.addOptions?.monitor ?? 'all';
      const s = st._mkSeries(src[0], src[1], src[2], src[3], src[4], PROFILES43.find((p) => p.id === b.qualityProfileId)?.name ?? 'HD-1080p', b.monitored !== false, false, src[5], null, src[6]);
      Object.assign(s, { tvdbId: b.tvdbId ?? s.tvdbId, seriesType: b.seriesType ?? 'standard', rootFolderPath: b.rootFolderPath ?? '/data/media/tv', path: `${b.rootFolderPath ?? '/data/media/tv'}/${s.title}`, _monitor: mon });
      applyMonitor(st, s, mon);
      if (b.addOptions?.searchForMissingEpisodes) autoGrab(st, 'sonarr', { name: 'SeriesSearch', seriesId: s.id });
      return json(seriesStats(st, s), 201);
    }
    let m = P.match(/^\/series\/(\d+)$/);
    if (m) {
      const s = st.series.find((x) => x.id === +m[1]);
      if (!s) return json({ message: 'NotFound' }, 404);
      if (method === 'GET') return json(seriesStats(st, s));
      if (method === 'PUT') {
        for (const k of ['qualityProfileId', 'monitored', 'seriesType', 'rootFolderPath', 'path']) if (b?.[k] !== undefined) s[k] = b[k];
        const before = new Map(seriesStats(st, s).seasons.map((x) => [x.seasonNumber, x.monitored]));
        for (const se of b?.seasons ?? []) if (se.monitored !== undefined && before.get(se.seasonNumber) !== se.monitored) for (const e of st.episodes) if (e.seriesId === s.id && e.seasonNumber === se.seasonNumber) e.monitored = !!se.monitored;
        if (b?.addOptions?.monitor) { applyMonitor(st, s, b.addOptions.monitor); s._monitor = b.addOptions.monitor; }
        return json(seriesStats(st, s), 202);
      }
      if (method === 'DELETE') { st.series = st.series.filter((x) => x.id !== s.id); st.episodes = st.episodes.filter((e) => e.seriesId !== s.id); st.log.push({ op: 'deleteSeries', id: s.id, deleteFiles: q.get('deleteFiles') === 'true' }); return json({}); }
    }
    if (P === '/episode' && method === 'GET') {
      const sid = +q.get('seriesId');
      return json(st.episodes.filter((e) => e.seriesId === sid).map((e) => ({ ...e })));
    }
    if (P === '/seasonpass' && method === 'POST') { for (const x of b?.series ?? []) { const se = st.series.find((y) => y.id === x.id); if (se && b.monitoringOptions?.monitor) { applyMonitor(st, se, b.monitoringOptions.monitor); se._monitor = b.monitoringOptions.monitor; se.monitored = x.monitored !== false; } } return json({}, 202); }
    const em = P.match(/^\/episode\/(\d+)$/);
    if (em && method === 'GET') { const e = st.episodes.find((x) => x.id === +em[1]); return e ? json({ ...e }) : json({ message: 'NotFound' }, 404); }
    if (P === '/episode/monitor' && method === 'PUT') { for (const e of st.episodes) if ((b?.episodeIds ?? []).includes(e.id)) e.monitored = !!b.monitored; return json([]); }
    // Prompt 44: slett episodefil (Sonarr) – filen fjernes, episoden mangler igjen.
    const ef = P.match(/^\/episodefile\/(\d+)$/);
    if (ef && method === 'DELETE') {
      const e = st.episodes.find((x) => x.hasFile && (x.episodeFileId === +ef[1] || x.id === +ef[1]));
      if (!e) return json({ message: 'NotFound' }, 404);
      e.hasFile = false; e.episodeFileId = 0; delete e.episodeFile; st.log.push({ op: 'deleteEpisodeFile', id: +ef[1], episodeId: e.id });
      return json({});
    }
    if (P === '/release' && method === 'GET') {
      const epId = +q.get('episodeId') || null, sid = +q.get('seriesId') || null, season = q.has('seasonNumber') ? +q.get('seasonNumber') : null;
      const e = epId ? st.episodes.find((x) => x.id === epId) : null;
      const s = st.series.find((x) => x.id === (e?.seriesId ?? sid));
      if (!s) return json([]);
      const codeS = e ? code(e.seasonNumber, e.episodeNumber) : `S${pad(season ?? 1)}`;
      const ids = e ? [e.id] : st.episodes.filter((x) => x.seriesId === s.id && x.seasonNumber === season).map((x) => x.id);
      return json(releasesFor(st, 'sonarr', { title: s.title, codeS, episodeIds: ids, seriesId: s.id, season: e?.seasonNumber ?? season }));
    }
  } else {
    if (P === '/calendar') {
      const from = q.get('start').slice(0, 10), to = q.get('end').slice(0, 10);
      return json(st.movies.filter((m) => [m.digitalRelease, m.inCinemas, m.physicalRelease].some((d) => d && d >= from && d < to)).map(movieOut));
    }
    if (P === '/movie' && method === 'GET') return json(st.movies.map(movieOut));
    if (P === '/movie/lookup') return json(lookupMovies(st, q.get('term')));
    if (P === '/movie' && method === 'POST') {
      if (st.movies.some((m) => m.tmdbId === b?.tmdbId || m.title === b?.title)) return json([{ propertyName: 'TmdbId', errorMessage: 'This movie has already been added' }], 400);
      const src = LOOKUP_MOVIES.find((x) => x[1] === b?.title || 800000 + LOOKUP_MOVIES.indexOf(x) === b?.tmdbId);
      if (!src) return json([{ errorMessage: 'Fant ikke filmen' }], 400);
      const id = st.nextId.movie++, today = osloDay();
      const m = { id, title: src[1], year: src[2], tmdbId: b.tmdbId ?? 800000, status: 'released', minimumAvailability: b.minimumAvailability ?? 'released', qualityProfileId: b.qualityProfileId ?? 5, monitored: b.monitored !== false, hasFile: false,
        inCinemas: addDays(today, -60), digitalRelease: addDays(today, 4), physicalRelease: addDays(today, 40), path: `${b.rootFolderPath ?? '/data/media/film'}/${src[1]} (${src[2]})`, rootFolderPath: b.rootFolderPath ?? '/data/media/film', images: [{ coverType: 'poster', remoteUrl: null }], sizeOnDisk: 0, overview: `${src[1]} (${src[2]})`, _key: src[0], _color: src[3] };
      st.movies.push(m);
      if (b.addOptions?.searchForMovie) autoGrab(st, 'radarr', { name: 'MoviesSearch', movieIds: [id] });
      return json(movieOut(m), 201);
    }
    const m = P.match(/^\/movie\/(\d+)$/);
    if (m) {
      const mv = st.movies.find((x) => x.id === +m[1]);
      if (!mv) return json({ message: 'NotFound' }, 404);
      if (method === 'GET') return json(movieOut(mv));
      if (method === 'PUT') { for (const k of ['qualityProfileId', 'monitored', 'minimumAvailability', 'rootFolderPath', 'path']) if (b?.[k] !== undefined) mv[k] = b[k]; return json(movieOut(mv), 202); }
      if (method === 'DELETE') { st.movies = st.movies.filter((x) => x.id !== mv.id); st.log.push({ op: 'deleteMovie', id: mv.id, deleteFiles: q.get('deleteFiles') === 'true' }); return json({}); }
    }
    const mf = P.match(/^\/moviefile\/(\d+)$/);
    if (mf && method === 'DELETE') {
      const mv = st.movies.find((x) => x.hasFile && (x.id * 10 === +mf[1] || x.movieFile?.id === +mf[1]));
      if (!mv) return json({ message: 'NotFound' }, 404);
      mv.hasFile = false; mv.sizeOnDisk = 0; delete mv.movieFile; st.log.push({ op: 'deleteMovieFile', id: +mf[1], movieId: mv.id });
      return json({});
    }
    if (P === '/release' && method === 'GET') {
      const mv = st.movies.find((x) => x.id === +q.get('movieId'));
      return json(mv ? releasesFor(st, 'radarr', { title: mv.title, codeS: String(mv.year), movieId: mv.id }) : []);
    }
  }
  if (P === '/release' && method === 'POST') {
    const hit = st.releases.get(b?.guid);
    if (!hit || hit.svc !== svc) return json([{ errorMessage: 'Utgivelsen er ikke lenger i hurtigbufferen. Søk på nytt.' }], 404);
    grab(st, hit.r, svc);
    return json(hit.r);
  }
  return json({ message: `NotFound ${P}` }, 404);
}
function applyMonitor(st, s, mon) {
  const eps = st.episodes.filter((e) => e.seriesId === s.id);
  const nums = [...new Set(eps.map((e) => e.seasonNumber))].sort((a, b) => a - b), first = nums[0], last = nums[nums.length - 1];
  for (const e of eps) {
    const aired = Date.parse(e.airDateUtc) <= Date.now();
    e.monitored = mon === 'all' ? true : mon === 'none' ? false : mon === 'future' ? !aired : mon === 'missing' ? !e.hasFile : mon === 'existing' ? e.hasFile : mon === 'firstSeason' ? e.seasonNumber === first : mon === 'latestSeason' ? e.seasonNumber === last : mon === 'pilot' ? e.seasonNumber === first && e.episodeNumber === 1 : true;
  }
}
function grab(st, r, svc) {
  const hash = sha1(r.guid + r.title);
  if (st.torrents.some((t) => t.hash === hash)) return;
  const link = svc === 'radarr' ? { movieId: r.movieId } : { seriesId: r.seriesId, episodeIds: r.episodeIds ?? [] };
  st.torrents.push({ hash, name: r.title, size: r.size, total_size: r.size, progress: 0, dlspeed: 0, upspeed: 0, eta: 8640000, state: r.seeders > 0 ? 'downloading' : 'stalledDL', category: svc === 'radarr' ? 'radarr' : 'tv-sonarr',
    save_path: `/data/downloads/${svc === 'radarr' ? 'film' : 'tv'}`, priority: st.torrents.length + 1, num_seeds: r.seeders, num_leechs: r.leechers, added_on: Math.floor(Date.now() / 1000), force_start: false, seq_dl: false, f_l_piece_prio: false,
    _rate: r.seeders > 0 ? Math.min(14, 4 + r.seeders / 120) * MB : 0, _link: link, _files: [{ name: `${r.title}.mkv`, size: r.size, priority: 1 }] });
}
function autoGrab(st, svc, b) {
  let targets = [];
  if (svc === 'radarr') targets = (b.movieIds ?? []).map((id) => st.movies.find((m) => m.id === id)).filter((m) => m && !m.hasFile).map((m) => ({ title: m.title, codeS: String(m.year), movieId: m.id, profile: m.qualityProfileId }));
  else {
    let eps = [];
    if (b.name === 'EpisodeSearch') eps = st.episodes.filter((e) => (b.episodeIds ?? []).includes(e.id));
    else if (b.name === 'SeasonSearch') eps = st.episodes.filter((e) => e.seriesId === b.seriesId && e.seasonNumber === b.seasonNumber);
    else if (b.name === 'SeriesSearch') eps = st.episodes.filter((e) => e.seriesId === b.seriesId);
    else eps = st.episodes;
    eps = eps.filter((e) => e.monitored && !e.hasFile && Date.parse(e.airDateUtc) <= Date.now()).slice(0, 6);
    targets = eps.map((e) => { const s = st.series.find((x) => x.id === e.seriesId); return { title: s.title, codeS: code(e.seasonNumber, e.episodeNumber), episodeIds: [e.id], seriesId: s.id, season: e.seasonNumber, profile: s.qualityProfileId }; });
  }
  for (const t of targets) {
    const rows = releasesFor(st, svc, t);
    const res = { 3: 720, 4: 1080, 6: 1080, 5: 2160, 1: 1080 }[t.profile] ?? 1080;
    const best = rows.filter((r) => r.quality.quality.resolution === res && r.seeders > 0).sort((a, c) => c.seeders - a.seeders)[0] ?? rows.filter((r) => r.seeders > 0).sort((a, c) => c.seeders - a.seeders)[0];
    if (best) grab(st, best, svc);
  }
}

/* --- qBittorrent --- */
const qbOut = (t) => { const { _rate, _link, _files, ...x } = t; return { ...x, amount_left: Math.round(t.size * (1 - t.progress)), completed: Math.round(t.size * t.progress), magnet_uri: `magnet:?xt=urn:btih:${t.hash}` }; };
async function qbit(method, path, q, init) {
  const st = state(), b = await body(init) ?? {};
  const P = path.replace(/^\/api\/v2/, '');
  if (P === '/auth/login') return b.password === 'feil' ? text('Fails.') : text('Ok.', 200, { 'set-cookie': 'SID=mock-sid; HttpOnly; path=/' });
  if (P === '/app/version') return text('v5.0.1');
  if (P === '/app/webapiVersion') return text('2.11.2');
  if (P === '/app/preferences') return json({ alt_dl_limit: st.altLimit, alt_up_limit: 1 * MB, save_path: '/data/downloads' });
  if (P === '/torrents/info') return json(st.torrents.map(qbOut));
  if (P === '/torrents/categories') return json({ 'tv-sonarr': { name: 'tv-sonarr', savePath: '/data/downloads/tv' }, radarr: { name: 'radarr', savePath: '/data/downloads/film' } });
  if (P === '/transfer/info') { const dl = st.torrents.reduce((a, t) => a + t.dlspeed, 0), up = st.torrents.reduce((a, t) => a + t.upspeed, 0); return json({ dl_info_speed: dl, up_info_speed: up, dl_info_data: 0, up_info_data: 0, connection_status: 'connected', dht_nodes: 312 }); }
  if (P === '/transfer/speedLimitsMode') return text(st.alt ? '1' : '0');
  if (P === '/transfer/toggleSpeedLimitsMode') { st.alt = !st.alt; return text(''); }
  const hashes = String(b.hashes ?? b.hash ?? q.get('hash') ?? '').toLowerCase();
  const pick = () => (hashes === 'all' ? st.torrents : st.torrents.filter((t) => hashes.split('|').includes(t.hash)));
  if (P === '/torrents/stop' || P === '/torrents/pause') { for (const t of pick()) t.state = t.progress >= 1 ? 'stoppedUP' : 'stoppedDL'; return text(''); }
  if (P === '/torrents/start' || P === '/torrents/resume') { for (const t of pick()) t.state = t.progress >= 1 ? 'uploading' : t._rate > 0 ? 'downloading' : 'stalledDL'; return text(''); }
  if (P === '/torrents/recheck') { for (const t of pick()) t.state = t.progress >= 1 ? 'checkingUP' : 'checkingDL'; setTimeout(() => { for (const t of pick()) if (/checking/.test(t.state)) t.state = t.progress >= 1 ? 'uploading' : 'downloading'; }, 1500).unref?.(); return text(''); }
  if (P === '/torrents/setForceStart') { for (const t of pick()) { t.force_start = String(b.value) === 'true'; if (t.force_start && t.progress < 1) t.state = t._rate > 0 ? 'forcedDL' : 'stalledDL'; } return text(''); }
  if (/^\/torrents\/(increasePrio|decreasePrio|topPrio|bottomPrio)$/.test(P)) {
    const op = P.split('/')[2];
    for (const t of pick()) {
      const list = st.torrents.filter((x) => x.progress < 1).sort((a, c) => a.priority - c.priority), i = list.indexOf(t);
      if (i < 0) continue;
      list.splice(i, 1);
      const j = op === 'increasePrio' ? Math.max(0, i - 1) : op === 'decreasePrio' ? Math.min(list.length, i + 1) : op === 'topPrio' ? 0 : list.length;
      list.splice(j, 0, t); list.forEach((x, k) => { x.priority = k + 1; });
    }
    return text('');
  }
  if (P === '/torrents/delete') { const del = new Set(pick().map((t) => t.hash)); st.log.push({ op: 'deleteTorrent', hashes: [...del], deleteFiles: String(b.deleteFiles) === 'true' }); st.torrents = st.torrents.filter((t) => !del.has(t.hash)); return text(''); }
  if (P === '/torrents/files') { const t = st.torrents.find((x) => x.hash === hashes); if (!t) return text('Not Found', 404); return json(t._files.map((f, i) => ({ index: i, name: f.name, size: f.size, progress: f.priority ? t.progress : 0, priority: f.priority, is_seed: t.progress >= 1 }))); }
  if (P === '/torrents/filePrio') { const t = st.torrents.find((x) => x.hash === hashes); if (!t) return text('Not Found', 404); for (const id of String(b.id).split('|')) if (t._files[+id]) t._files[+id].priority = +b.priority; t.size = t._files.filter((f) => f.priority > 0).reduce((a, f) => a + f.size, 0); return text(''); }
  if (P === '/torrents/add') {
    const url = String(b.urls ?? '').trim();
    const h = url.match(/xt=urn:btih:([a-z0-9]{32,40})/i)?.[1]?.toLowerCase() ?? sha1(url);
    if (st.torrents.some((t) => t.hash === h)) return text('Fails.');
    let dn = url.match(/[?&]dn=([^&]+)/i)?.[1]; try { dn = dn ? decodeURIComponent(dn.replace(/\+/g, ' ')) : ''; } catch { /* */ }
    const paused = String(b.stopped ?? b.paused) === 'true';
    st.torrents.push({ hash: h.length === 32 ? h.padEnd(40, '0') : h, name: dn || url.split('/').pop().replace(/\.torrent.*$/i, '') || h, size: 0, total_size: 0, progress: 0, dlspeed: 0, upspeed: 0, eta: 8640000, state: paused ? 'stoppedDL' : 'metaDL',
      category: b.category ?? '', save_path: b.savepath || '/data/downloads', priority: st.torrents.length + 1, num_seeds: 0, num_leechs: 0, added_on: Math.floor(Date.now() / 1000), force_start: false,
      seq_dl: String(b.sequentialDownload) === 'true', f_l_piece_prio: String(b.firstLastPiecePrio) === 'true', _rate: 0, _link: null, _files: [] });
    return text('Ok.');
  }
  return text('Not Found', 404);
}

/* --- Prowlarr --- */
async function prowlarr(method, path, q, init) {
  const st = state(), b = await body(init) ?? {};
  const P = path.replace(/^\/api\/v1/, '');
  if (P === '/system/status') return json({ appName: 'Prowlarr', version: '1.24.3.4754' });
  if (P === '/indexer' && method === 'GET') return json(st.indexers.map(({ _ms, _q, _g, _fail, _failSince, ...x }) => x));
  if (P === '/indexerstatus') return json(st.indexers.filter((x) => x._fail).map((x) => ({ indexerId: x.id, initialFailure: x._failSince, mostRecentFailure: new Date().toISOString(), disabledTill: new Date(Date.now() + 3600_000).toISOString() })));
  if (P === '/indexerstats') return json({ indexers: st.indexers.map((x) => ({ indexerId: x.id, indexerName: x.name, averageResponseTime: x._ms, numberOfQueries: x._q, numberOfGrabs: x._g, numberOfFailedQueries: x._fail ? x._q : 0 })) });
  if (P === '/health') return json(st.indexers.filter((x) => x._fail).map((x) => ({ source: 'IndexerStatusCheck', type: 'warning', message: `Indekser utilgjengelig på grunn av feil: ${x.name}` })));
  if (P === '/applications') return json([{ id: 1, name: 'Sonarr', implementation: 'Sonarr', syncLevel: 'fullSync' }, { id: 2, name: 'Radarr', implementation: 'Radarr', syncLevel: 'fullSync' }]);
  if (P === '/command' && method === 'POST') return json({ id: st.nextId.cmd++, name: b.name, status: 'queued' }, 201);
  // Prompt 44: søk per indekser (interaktivt søk som jobb). Indekseren som feiler, svarer 500 etter en stund; de andre gir sine treff.
  if (P === '/search' && method === 'GET') {
    const ids = q.getAll('indexerIds').map(Number);
    const x = st.indexers.find((i) => ids.includes(i.id));
    if (x?._fail) return json({ message: `${x.name}: Tidsavbrudd` }, 500);
    const term = String(q.get('query') ?? '');
    const rows = REL.filter((r) => !x || r[7] === x.name).map(([tail, qn, res, gbT, , sd, l, ix, langs, subs]) => ({ guid: `mock-px-${sha1(term + tail).slice(0, 16)}`, indexerId: x?.id ?? 99, indexer: ix,
      title: term.replace(/\s+/g, '.') + tail, size: Math.round(gbT * GB), seeders: sd, leechers: l, protocol: 'torrent', publishDate: new Date().toISOString(), languages: langs.map((name) => ({ name })), subtitles: subs, quality: { quality: { name: qn, resolution: res } } }));
    return json(rows);
  }
  if (P === '/indexer/schema') {
    return json(CATALOG.map(([name, privacy, language, cats, auth, protocol = 'torrent']) => ({ implementation: protocol === 'usenet' ? 'Newznab' : 'Cardigann', definitionName: name.toLowerCase().replace(/[^a-z0-9]/g, ''), name, privacy, protocol, language,
      description: cats, capabilities: { categories: cats.split(/,\s*/).map((c) => ({ name: c })) }, fields: [{ name: 'definitionFile', value: name.toLowerCase().replace(/[^a-z0-9]/g, ''), hidden: 'hidden' },
        ...(auth === 'user' ? [{ name: 'username', label: 'Brukernavn', type: 'textbox' }, { name: 'password', label: 'Passord', type: 'password', privacy: 'password' }] : auth === 'key' ? [{ name: 'apiKey', label: 'API-nøkkel', type: 'textbox', privacy: 'apiKey' }] : auth === 'cookie' ? [{ name: 'cookie', label: 'Cookie', type: 'textbox', privacy: 'password', helpText: 'Kopier cookien fra nettleseren når du er logget inn (Utviklerverktøy → Nettverk → Cookie).' }] : [])] })));
  }
  if (P === '/indexer/test' && method === 'POST') {
    const x = b.id ? st.indexers.find((i) => i.id === b.id) : null;
    const pass = (b.fields ?? []).find((f) => f.name === 'password')?.value;
    if (x?._fail || b.name === '1337x') return json([{ propertyName: '', errorMessage: 'Tidsavbrudd etter 10 s. Cloudflare-blokk – legg til FlareSolverr.' }], 400);
    if (pass === 'feil') return json([{ propertyName: 'password', errorMessage: 'Feil passord' }], 400);
    const ms = 200 + (sha1(b.name ?? '').charCodeAt(0) % 50) * 10;
    if (x) x._ms = ms;
    return json({ ms }, 200);
  }
  if (P === '/indexer' && method === 'POST') {
    if (st.indexers.some((i) => i.name === b.name)) return json([{ errorMessage: 'Finnes allerede' }], 400);
    const x = { id: st.nextId.idx++, name: b.name, enable: true, protocol: b.protocol ?? 'torrent', privacy: b.privacy ?? 'private', priority: b.priority ?? 25, definitionName: b.definitionName, appProfileId: b.appProfileId ?? 1, tags: b.tags ?? [], fields: [], _ms: 412, _q: 0, _g: 0, _fail: false };
    st.indexers.push(x);
    const { _ms, _q, _g, _fail, ...out } = x;
    return json(out, 201);
  }
  const m = P.match(/^\/indexer\/(\d+)$/);
  if (m && method === 'DELETE') { st.indexers = st.indexers.filter((i) => i.id !== +m[1]); return json({}); }
  if (m && method === 'GET') { const x = st.indexers.find((i) => i.id === +m[1]); return x ? json(x) : json({}, 404); }
  return json({ message: `NotFound ${P}` }, 404);
}

/** Falsk fetch for mock-vertene. */
export async function mockFetch43(url, init = {}) {
  const u = new URL(String(url)), method = (init.method ?? 'GET').toUpperCase();
  advanceMock43();
  if (u.hostname === 'mock-sonarr') return sonarrRadarr('sonarr', method, u.pathname, u.searchParams, init);
  if (u.hostname === 'mock-radarr') return sonarrRadarr('radarr', method, u.pathname, u.searchParams, init);
  if (u.hostname === 'mock-qbit') return qbit(method, u.pathname, u.searchParams, init);
  if (u.hostname === 'mock-prowlarr') return prowlarr(method, u.pathname, u.searchParams, init);
  return json({ error: 'ukjent mock-vert' }, 404);
}
/** Farge og nøkkel til plakaten i demo (ingen ekte bilder). */
export const mockArt43 = (svc, id) => { const st = state(); const x = svc === 'radarr' ? st.movies.find((m) => m.id === id) : st.series.find((s) => s.id === id); return x ? { color: x._color, key: x._key, note: x._note ?? null } : null; };
export const mockState43 = () => state();

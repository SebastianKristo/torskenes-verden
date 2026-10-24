// Prompt 51 (MEDFAM51): norske undertekster via Bazarr (valgfri container i docker-compose.yml, profil «bazarr»).
// Adresse og nøkkel står bare i .env (BAZARR_URL, BAZARR_API_KEY) – nøkkelen sendes aldri til klienten og logges aldri.
// Whisper-generering (lokalt på Mac minien) er bare beskrevet i docs/media-familie-51.md; ingen skytjenester brukes.
import { MOCK, getJson, errText, serviceUrl } from './common.js';

const NO = new Set(['no', 'nb', 'nn', 'nor', 'nob', 'nno']);
const isNo = (s) => NO.has(String(s?.code2 ?? '').toLowerCase()) || NO.has(String(s?.code3 ?? '').toLowerCase()) || /norw|norsk|bokmål|nynorsk/i.test(String(s?.name ?? ''));
export const bazarrConf51 = () => ({ url: serviceUrl('BAZARR_URL'), key: String(process.env.BAZARR_API_KEY ?? '').trim() });
export const bazarrOn51 = () => { const c = bazarrConf51(); return !!(c.url && c.key); };
const demo = () => MOCK() && !bazarrOn51();

async function bz(method, path, query = null) {
  const c = bazarrConf51();
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  return getJson(`${c.url}/api${path}${qs}`, { method, headers: { 'X-API-KEY': c.key } });
}
const subOut = (s) => ({ language: String(s.code2 ?? s.code3 ?? '').toLowerCase() || null, name: s.name ?? null, forced: !!s.forced, hi: !!s.hi, norwegian: isNo(s), file: s.path ? String(s.path).split('/').pop() : null });
function itemOut(kind, x) {
  const subs = (x.subtitles ?? []).filter((s) => s && (s.path || s.code2)).map(subOut);
  const missing = (x.missing_subtitles ?? []).map(subOut);
  const hasNo = subs.some((s) => s.norwegian && !s.forced);
  return { kind, id: kind === 'movie' ? x.radarrId : x.sonarrEpisodeId, seriesId: kind === 'episode' ? x.sonarrSeriesId ?? null : undefined, title: x.title ?? null,
    subtitles: subs, missing, hasNorwegian: hasNo, missingNorwegian: !hasNo,
    status: hasNo ? 'ok' : missing.some((s) => s.norwegian) ? 'mangler' : 'ikke-i-profil',
    statusText: hasNo ? 'Norske undertekster finnes' : missing.some((s) => s.norwegian) ? 'Mangler norske undertekster' : 'Norsk er ikke i språkprofilen i Bazarr' };
}
const DEMO = { movie: { radarrId: 1, title: 'Demo-film', subtitles: [{ code2: 'en', name: 'English', path: '/movies/Demo/Demo.en.srt' }], missing_subtitles: [{ code2: 'no', name: 'Norwegian' }] } };

export async function subsStatus51() {
  const whisper = { available: false, text: 'Whisper-generering er valgfri og kjører bare lokalt på Mac minien (se docs/media-familie-51.md). Ingen skytjenester.' };
  if (demo()) return { configured: false, mock: true, reachable: true, version: 'demo', languages: ['no', 'en'], whisper, text: 'Demo (MOCK_DATA)' };
  if (!bazarrOn51()) return { configured: false, reachable: false, whisper, text: 'Bazarr er ikke satt opp. Start containeren (docker compose --profile bazarr up -d) og sett BAZARR_URL og BAZARR_API_KEY i .env.' };
  try {
    const s = await bz('GET', '/system/status');
    let languages = [];
    try { const l = await bz('GET', '/system/languages', { history: 'false' }); languages = (Array.isArray(l) ? l : l?.data ?? []).filter((x) => x.enabled).map((x) => String(x.code2 ?? '').toLowerCase()).filter(Boolean); } catch { /* eldre Bazarr */ }
    const norwegian = languages.some((x) => NO.has(x));
    return { configured: true, reachable: true, version: s?.data?.bazarr_version ?? null, languages, norwegian, whisper,
      text: norwegian ? 'Bazarr kjører · norsk er slått på' : 'Bazarr kjører, men norsk er ikke slått på (Bazarr → Settings → Languages)' };
  } catch (e) { return { configured: true, reachable: false, whisper, error: `Bazarr ${errText(e)}`, text: `Fikk ikke kontakt med Bazarr: ${errText(e)}` }; }
}

/** kind = 'movie' (Radarr-id) | 'episode' (Sonarr episode-id) */
export async function subsItem51(kind, id) {
  if (demo()) return itemOut(kind, { ...DEMO.movie, radarrId: kind === 'movie' ? id : undefined, sonarrEpisodeId: kind === 'episode' ? id : undefined, sonarrSeriesId: kind === 'episode' ? 1 : undefined });
  if (!bazarrOn51()) throw Object.assign(new Error('Bazarr er ikke satt opp'), { status: 409 });
  const r = kind === 'movie' ? await bz('GET', '/movies', { 'radarrid[]': id }) : await bz('GET', '/episodes', { 'episodeid[]': id });
  const x = (r?.data ?? [])[0];
  if (!x) throw Object.assign(new Error(kind === 'movie' ? 'Bazarr kjenner ikke filmen (synkroniser Radarr i Bazarr)' : 'Bazarr kjenner ikke episoden (synkroniser Sonarr i Bazarr)'), { status: 404 });
  return itemOut(kind, x);
}
/** «Hent undertekster»: Bazarr søker etter manglende undertekster (alle språk i profilen, også norsk). */
export async function subsSearch51(kind, id) {
  if (demo()) return { ok: true, mock: true, message: 'Demo: søk etter undertekster startet' };
  if (!bazarrOn51()) throw Object.assign(new Error('Bazarr er ikke satt opp'), { status: 409 });
  if (kind === 'movie') { await bz('PATCH', '/movies', { radarrid: id, action: 'search-missing' }); return { ok: true, message: 'Bazarr søker etter undertekster for filmen' }; }
  const it = await subsItem51('episode', id);
  if (!it.seriesId) throw Object.assign(new Error('Fant ikke serien til episoden'), { status: 404 });
  await bz('PATCH', '/series', { seriesid: it.seriesId, action: 'search-missing' });
  return { ok: true, message: 'Bazarr søker etter manglende undertekster i serien (også denne episoden)' };
}
/** Filmer og episoder som mangler norske undertekster. */
export async function subsWanted51() {
  if (demo()) return { items: [{ ...itemOut('movie', DEMO.movie) }], total: 1, mock: true };
  if (!bazarrOn51()) return { items: [], total: 0, configured: false };
  const [m, e] = await Promise.all([bz('GET', '/movies/wanted', { start: 0, length: 100 }).catch(() => ({ data: [] })), bz('GET', '/episodes/wanted', { start: 0, length: 100 }).catch(() => ({ data: [] }))]);
  const items = [
    ...(m?.data ?? []).filter((x) => (x.missing_subtitles ?? []).some(isNo)).map((x) => ({ ...itemOut('movie', x) })),
    ...(e?.data ?? []).filter((x) => (x.missing_subtitles ?? []).some(isNo)).map((x) => ({ ...itemOut('episode', x), title: [x.seriesTitle, x.episode_number ?? x.episodeNumber, x.episodeTitle].filter(Boolean).join(' · ') || x.title })),
  ];
  return { items, total: items.length };
}

// Bakgrunnsfotoene (prompt 21): ekte fotografier fra Wikimedia Commons (fri lisens / NASA public domain).
// Delt mellom serveren (background.js) og nedlastingsskriptet (fetch-backgrounds.mjs, kjøres i GitHub Actions).
//
// Filene prøves i rekkefølge. Ferdig nedlastede kopier ligger i server/backgrounds/files/<nøkkel>/<slug>.webp
// (2000 px) og <slug>-1080.webp (1080 px), med fotograf og lisens i server/backgrounds/files/credits.json.
// Mangler de, laster serveren ned fra Special:FilePath ved første bruk og cacher i DATA_DIR/backgrounds/cache.
import { join } from 'node:path';

export const CATALOG = {
  planet: ['PIA21641-Jupiter-SouthernStorms-JunoCam-20170525.jpg', 'The_Earth_seen_from_Apollo_17.jpg', 'FullMoon2010.jpg', 'OSIRIS_Mars_true_color.jpg', 'Saturn_during_Equinox.jpg', 'Jupiter_and_its_shrunken_Great_Red_Spot.jpg'],
  oslo: ['Oslo_S_aerial.jpg', 'Oslo_Opera_House.jpg', 'Oslofjord.jpg', 'Oslo_from_Holmenkollen.jpg'],
  vaer_klart: ['Sky_with_clouds.jpg', 'Cumulus_clouds_in_fair_weather.jpeg'],
  vaer_sky: ['Cloudy_Sky_Background.jpg', 'Clouds_over_the_Atlantic_Ocean.jpg'],
  vaer_regn: ['Clouds_over_the_Atlantic_Ocean.jpg', 'Cloudy_Sky_Background.jpg'],
  ruter: ['SL18_tram_performing_test_run_at_Bjørvika.jpg', 'Oslo_tram_line_18_on_Grensen.JPG', 'Oslo_tram_line_19_and_18_at_St_Halvards_plass.jpg'],
};

// Planetene i dagens rekkefølge: floor(Date.now()/864e5) % 5 → Jorda, Månen, Jupiter, Mars, Saturn.
export const PLANETS = ['earth', 'moon', 'jupiter', 'mars', 'saturn'];
export const PLANET_NAME = { earth: 'Jorda', moon: 'Månen', jupiter: 'Jupiter', mars: 'Mars', saturn: 'Saturn' };
export const PLANET_FILES = {
  earth: ['The_Earth_seen_from_Apollo_17.jpg'],
  moon: ['FullMoon2010.jpg'],
  jupiter: ['PIA21641-Jupiter-SouthernStorms-JunoCam-20170525.jpg', 'Jupiter_and_its_shrunken_Great_Red_Spot.jpg'],
  mars: ['OSIRIS_Mars_true_color.jpg'],
  saturn: ['Saturn_during_Equinox.jpg'],
};

// Kreditering når credits.json og Commons-API-et ikke er tilgjengelige.
export const KNOWN_CREDITS = {
  'PIA21641-Jupiter-SouthernStorms-JunoCam-20170525.jpg': ['NASA / JPL-Caltech / SwRI / MSSS', 'Public domain'],
  'The_Earth_seen_from_Apollo_17.jpg': ['NASA / Apollo 17', 'Public domain'],
  'FullMoon2010.jpg': ['Gregory H. Revera', 'CC BY-SA 3.0'],
  'OSIRIS_Mars_true_color.jpg': ['ESA / MPS for OSIRIS Team', 'CC BY-SA 3.0 IGO'],
  'Saturn_during_Equinox.jpg': ['NASA / JPL / Space Science Institute', 'Public domain'],
  'Jupiter_and_its_shrunken_Great_Red_Spot.jpg': ['NASA / ESA / A. Simon (GSFC)', 'Public domain'],
};

export const COMMONS = 'https://commons.wikimedia.org';
export const filePathUrl = (file, width = 2000) => `${COMMONS}/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
export const pageUrl = (file) => `${COMMONS}/wiki/File:${encodeURIComponent(file)}`;
export const infoUrl = (file) => `${COMMONS}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(`File:${file}`)}`;

/** Trygt filnavn uten filendelse: «SL18_tram_performing_test_run_at_Bjørvika.jpg» → «sl18_tram_performing_test_run_at_bjorvika». */
export function slug(file) {
  return String(file).replace(/\.[a-z]{3,4}$/i, '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/[øö]/g, 'o').replace(/å/g, 'a')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}
export const SIZES = [2000, 1080];
/** Stien til en ferdig nedlastet kopi (2000 px uten suffiks, 1080 px med «-1080»). */
export const bundledPath = (dir, key, file, size = 2000) => join(dir, key, `${slug(file)}${size === 2000 ? '' : `-${size}`}.webp`);

/** HTML fra extmetadata → ren tekst. */
export const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** imageinfo-svaret fra Commons → { author, license, licenseUrl }. */
export function creditFromInfo(json) {
  const page = Object.values(json?.query?.pages ?? {})[0];
  const m = page?.imageinfo?.[0]?.extmetadata ?? {};
  let author = stripHtml(m.Artist?.value) || stripHtml(m.Credit?.value) || null;
  if (author && author.length > 80) author = `${author.slice(0, 77).trim()}…`;
  return { author, license: stripHtml(m.LicenseShortName?.value) || null, licenseUrl: m.LicenseUrl?.value || null };
}

// Ikoner fra Iconify (prompt 23). Serveren er en mellomvei med disk-cache: /api/icons/search, /api/icons/:prefix/:name.svg
// og /api/icons/suggest. Ikonene vises som inline SVG i tekstfargen (currentColor); emoji- og flaggsett som <img> i egne farger.
// Svarer serveren 404 (eldre versjon), går søk og SVG direkte mot api.iconify.design, og AI-forslaget bruker ordlisten under.
import { api } from './util.js';

export const ICON_LIBS = [['', 'Alle'], ['lucide', 'Lucide'], ['material-symbols', 'Material Symbols'], ['mdi', 'Material Design'], ['ph', 'Phosphor'], ['tabler', 'Tabler'], ['heroicons', 'Heroicons'], ['fa6-solid', 'Font Awesome'], ['ri', 'Remix'], ['fluent', 'Fluent'], ['bi', 'Bootstrap'], ['iconoir', 'Iconoir'], ['carbon', 'Carbon'], ['solar', 'Solar'], ['mingcute', 'MingCute'], ['streamline', 'Streamline'], ['noto', 'Noto emoji'], ['twemoji', 'Twemoji']];
const COLOR_SETS = ['noto', 'twemoji', 'fluent-emoji', 'fluent-emoji-flat', 'logos', 'flag', 'flagpack', 'circle-flags', 'openmoji', 'emojione', 'fxemoji'];
// Ordliste når AI ikke er tilgjengelig: norsk kategori → engelsk søkeord.
const KW = { siste: 'news', nyheter: 'news', norge: 'mountain', verden: 'globe', økonomi: 'chart', okonomi: 'chart', sport: 'trophy', teknologi: 'chip', kultur: 'theater', helse: 'heart', politikk: 'government', vær: 'weather', mat: 'food', reise: 'travel', bil: 'car', musikk: 'music', film: 'film', spill: 'gamepad', vitenskap: 'flask', miljø: 'leaf', lokalt: 'map-pin', utdanning: 'school', krim: 'shield' };
export const keywordFor = (label) => KW[String(label).toLowerCase()] ?? String(label).toLowerCase();

let direct = null; // true når /api/icons mangler på serveren
async function useDirect() {
  if (direct !== null) return direct;
  try { await api('/icons/sets'); direct = false; } catch (e) { direct = e.status === 404; }
  return direct;
}
useDirect();

const valid = (id) => /^[a-z0-9-]+:[a-z0-9-]+$/i.test(String(id ?? ''));
export const isColorIcon = (id) => { const p = String(id).split(':')[0]; return COLOR_SETS.includes(p) || /emoji|flag/.test(p); };
export const iconUrl = (id) => {
  if (!valid(id)) return '';
  const [p, n] = id.split(':');
  return direct ? `https://api.iconify.design/${p}/${n}.svg` : `/api/icons/${encodeURIComponent(p)}/${encodeURIComponent(n)}.svg`;
};

// Prompt 24: ikke CSS-maske (nettleseren tegnet dem ikke før fanen ble tegnet på nytt). Ensfargede ikoner tegnes som
// inline SVG i currentColor (følger tekstfargen), emoji- og flaggsett som <img>. SVG-ene hentes én gang og caches i minnet;
// preloadIcons() henter dem på forhånd, så de vises med en gang.
const svgCache = new Map(), pending = new Map();
const cleanSvg = (svg) => String(svg).trim().replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#');
const sized = (svg, size) => svg.replace(/^<svg\b([^>]*)>/i, (m, a) => `<svg${a.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '')} width="${size}" height="${size}" aria-hidden="true" focusable="false">`);

/** Henter SVG-en for et ensfarget ikon (caches). Gir teksten, eller '' hvis den ikke finnes. */
export function loadIconSvg(id) {
  if (!valid(id) || isColorIcon(id)) return Promise.resolve('');
  if (svgCache.has(id)) return Promise.resolve(svgCache.get(id));
  if (pending.has(id)) return pending.get(id);
  const pr = useDirect().then(() => fetch(iconUrl(id))).then((r) => (r.ok ? r.text() : '')).catch(() => '')
    .then((t) => { const svg = /^\s*<svg[\s>]/i.test(t) ? cleanSvg(t) : ''; svgCache.set(id, svg); pending.delete(id); fill(id); return svg; });
  pending.set(id, pr);
  return pr;
}
/** Forhåndslaster ikonene (f.eks. alle faneikonene ved oppstart). */
export const preloadIcons = (ids) => Promise.all([...new Set(ids ?? [])].filter(valid).map((id) => (isColorIcon(id) ? new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = iconUrl(id); }) : loadIconSvg(id))));
// Plassholdere som venter på SVG-en fylles når den kommer.
function fill(id) {
  const svg = svgCache.get(id);
  document.querySelectorAll(`span[data-ico="${CSS.escape(id)}"]`).forEach((el) => { if (svg) el.innerHTML = sized(svg, el.dataset.sz || 16); el.removeAttribute('data-ico'); });
}

/** Et ikon: inline SVG i tekstfargen, eller <img> for emoji- og flaggsett. */
export function iconHtml(id, size = 16, cls = 'ico') {
  if (!valid(id)) return '';
  const box = `flex:none;display:inline-grid;place-items:center;width:${size}px;height:${size}px;line-height:0`;
  if (isColorIcon(id)) return `<img class="${cls}" src="${iconUrl(id).replace(/"/g, '%22')}" alt="" aria-hidden="true" width="${size}" height="${size}" decoding="async" style="${box};object-fit:contain">`;
  const svg = svgCache.get(id);
  if (svg) return `<span class="${cls}" aria-hidden="true" style="${box}">${sized(svg, size)}</span>`;
  loadIconSvg(id);
  return `<span class="${cls}" aria-hidden="true" data-ico="${id}" data-sz="${size}" style="${box}"></span>`;
}

/** Søk i Iconify. Gir { icons: ['prefix:name'], total }. */
export async function searchIcons(q, prefix = '', limit = 96) {
  q = String(q ?? '').trim();
  if (!q) return { icons: [], total: 0 };
  if (!(await useDirect())) {
    try {
      const r = await api(`/icons/search?q=${encodeURIComponent(q)}&prefix=${encodeURIComponent(prefix)}&limit=${limit}`);
      return { icons: (r.icons ?? []).map((x) => (typeof x === 'string' ? x : x.id ?? `${x.prefix}:${x.name}`)).filter(valid), total: r.total ?? r.icons?.length ?? 0 };
    } catch (e) { if (e.status !== 404) throw e; direct = true; }
  }
  const r = await fetch(`https://api.iconify.design/search?limit=${limit}&query=${encodeURIComponent(q)}${prefix ? `&prefixes=${encodeURIComponent(prefix)}` : ''}`).then((x) => x.json());
  return { icons: (r.icons ?? []).filter(valid), total: r.total ?? 0 };
}

/** ✦ AI foreslår ett engelsk søkeord, og første treff i valgt bibliotek brukes (Lucide som standard). */
export async function suggestIcon(label, prefix = '') {
  const lib = prefix || 'lucide';
  if (!(await useDirect())) {
    try { const r = await api('/icons/suggest', { method: 'POST', json: { label, prefix: lib } }); if (valid(r.icon)) return r.icon; } catch { /* faller tilbake på ordlisten */ }
  }
  const r = await searchIcons(keywordFor(label), lib, 8).catch(() => ({ icons: [] }));
  return r.icons[0] ?? null;
}

// Ikoner fra Iconify (prompt 23). Serveren er en mellomvei med disk-cache: /api/icons/search, /api/icons/:prefix/:name.svg
// og /api/icons/suggest. Ikonene vises som CSS-maske i tekstfargen (currentColor); emoji- og flaggsett vises i egne farger.
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

/** Et ikon som <span>: maske i tekstfargen, eller bildet selv for emoji- og flaggsett. */
export function iconHtml(id, size = 16, cls = 'ico') {
  if (!valid(id)) return '';
  const u = iconUrl(id).replace(/["'()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  const style = isColorIcon(id)
    ? `background:url('${u}') center / contain no-repeat`
    : `background:currentColor;-webkit-mask:url('${u}') center / contain no-repeat;mask:url('${u}') center / contain no-repeat`;
  return `<span class="${cls}" aria-hidden="true" style="flex:none;display:inline-block;width:${size}px;height:${size}px;${style}"></span>`;
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

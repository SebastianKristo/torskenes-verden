// Ikoner (prompt 23): proxy mot Iconify (api.iconify.design, over 200 åpne ikonsett, uten nøkkel).
// - GET  /api/icons/search?q=&prefix=&limit=96  → { icons:[{prefix,name,id}], total }
// - GET  /api/icons/:prefix/:name.svg           → SVG-en, cachet på disk i DATA_DIR/icons/<prefix>/<name>.svg
// - GET  /api/icons/sets                        → bibliotekene i ikonvelgeren (som i Nyhetsleser.dc.html)
// - POST /api/icons/suggest {label, prefix?}    → { keyword, icon:'prefix:name', source:'ai'|'list' }
// Bare for innloggede (sesjon eller app-token). Monokrome sett bruker currentColor, så ikonet arver tekstfargen.
// MOCK_DATA=1 (uten nett): søk og SVG lages lokalt, med mindre ICONIFY_LIVE=1.
import { Hono } from 'hono';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { authOrToken } from './mobile.js';
import { aiJson } from './homeos-common.js';

const MOCK = process.env.MOCK_DATA === '1' && process.env.ICONIFY_LIVE !== '1';
const API = 'https://api.iconify.design';
const ROOT = resolve(config.dataDir, 'icons');

export const SETS = [['', 'Alle'], ['lucide', 'Lucide'], ['material-symbols', 'Material Symbols'], ['mdi', 'Material Design'], ['ph', 'Phosphor'], ['tabler', 'Tabler'],
  ['heroicons', 'Heroicons'], ['fa6-solid', 'Font Awesome'], ['ri', 'Remix'], ['fluent', 'Fluent'], ['bi', 'Bootstrap'], ['iconoir', 'Iconoir'], ['carbon', 'Carbon'],
  ['solar', 'Solar'], ['mingcute', 'MingCute'], ['streamline', 'Streamline'], ['noto', 'Noto emoji'], ['twemoji', 'Twemoji']];
// Sett med egne farger (emoji, logoer, flagg): vises i farger, ikke i tekstfargen.
export const COLOR_SETS = ['noto', 'twemoji', 'fluent-emoji', 'logos', 'flag', 'circle-flags'];
// Standardikonene på fanene i Nyhetsleser, per kategori-id og visningsnavn.
export const ICON_DEFAULTS = { siste: 'lucide:zap', norge: 'lucide:mountain-snow', verden: 'lucide:globe', okonomi: 'lucide:trending-up', sport: 'lucide:trophy', teknologi: 'lucide:cpu', kultur: 'lucide:drama' };
// Innebygd ordliste (uten AI): kategori → engelsk søkeord.
const KW = { siste: 'news', norge: 'mountain', verden: 'globe', okonomi: 'chart', sport: 'trophy', teknologi: 'chip', kultur: 'theater', helse: 'heart', politikk: 'government',
  vaer: 'weather', mat: 'food', reise: 'travel', bil: 'car', musikk: 'music', film: 'film', spill: 'gamepad', vitenskap: 'flask', miljo: 'leaf', lokalt: 'map-pin',
  utdanning: 'school', krim: 'shield', innenriks: 'mountain', utenriks: 'globe', nyheter: 'news', bolig: 'home', abonnement: 'repeat', budsjett: 'piggy-bank',
  dagligvarer: 'shopping-cart', transport: 'bus', strom: 'zap', forsikring: 'shield', barn: 'baby', dyr: 'paw', klaer: 'shirt', trening: 'dumbbell', jobb: 'briefcase', hytta: 'tent', hjem: 'home', handel: 'shopping-bag' };
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9-]/g, '');
export const keywordFor = (label) => { const k = norm(label); return KW[k] ?? (/^[a-z][a-z-]{1,30}$/.test(k) ? k : 'circle'); };

const PREFIX_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const validId = (id) => { const [p, n, x] = String(id ?? '').split(':'); return x === undefined && !!p && !!n && p.length <= 40 && n.length <= 80 && PREFIX_RE.test(p) && NAME_RE.test(n); };

let doFetch = (...a) => fetch(...a);
/** Tester: egen henter (og live = ignorer MOCK). */
export const _setIconFetch = (fn) => { doFetch = fn ?? ((...a) => fetch(...a)); live = !!fn; searchCache.clear(); };
let live = false;
const useMock = () => MOCK && !live;

/* ---------------- Søk ---------------- */

const searchCache = new Map(); // nøkkel → { at, data }
const SEARCH_TTL = 60 * 60_000;

function mockSearch(q, prefix, limit) {
  const base = norm(q) || 'circle';
  const sets = prefix ? [prefix] : SETS.slice(1).map((s) => s[0]);
  const icons = [];
  for (const p of sets) for (const v of ['', '-outline', '-2', '-off', '-plus', '-check']) icons.push(`${p}:${base}${v}`);
  return { icons: icons.slice(0, limit), total: icons.length };
}

export async function searchIcons(q, { prefix = '', limit = 96 } = {}) {
  q = String(q ?? '').trim().slice(0, 60);
  if (!q) return { icons: [], total: 0 };
  limit = Math.min(Math.max(parseInt(limit, 10) || 96, 1), 200);
  const key = `${q.toLowerCase()}|${prefix}|${limit}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.data;
  let raw;
  if (useMock()) raw = mockSearch(q, prefix, limit);
  else {
    // Iconify godtar limit fra 32; vi ber om minst 32 og kutter selv.
    const u = `${API}/search?query=${encodeURIComponent(q)}&limit=${Math.max(32, limit)}${prefix ? `&prefixes=${encodeURIComponent(prefix)}` : ''}`;
    let r;
    try { r = await doFetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); }
    catch { throw Object.assign(new Error('Fikk ikke kontakt med ikonbiblioteket'), { status: 502 }); }
    if (!r.ok) throw Object.assign(new Error(`Ikonbiblioteket svarte ${r.status}`), { status: 502 });
    raw = await r.json().catch(() => ({}));
  }
  const icons = (Array.isArray(raw.icons) ? raw.icons : []).filter(validId).slice(0, limit)
    .map((id) => { const [p, n] = id.split(':'); return { prefix: p, name: n, id }; });
  const data = { icons, total: Number.isFinite(+raw.total) ? +raw.total : icons.length };
  searchCache.set(key, { at: Date.now(), data });
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value);
  return data;
}

/* ---------------- SVG med diskcache ---------------- */

const mockSvg = (prefix, name) => {
  const color = COLOR_SETS.includes(prefix);
  const s = color ? 'fill="#f4b400"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ch = name.replace(/[^a-z]/g, '').slice(0, 1).toUpperCase() || '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><g ${s}><circle cx="12" cy="12" r="9"/></g><text x="12" y="16" font-family="system-ui,sans-serif" font-size="10" text-anchor="middle" fill="${color ? '#3b2f00' : 'currentColor'}">${ch}</text></svg>`;
};
// Iconify-SVG-er er rene, men fjern skript og hendelsesattributter for sikkerhets skyld.
const clean = (svg) => svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#');
const fileOf = (prefix, name) => join(ROOT, prefix, `${name}.svg`);

export async function iconSvg(prefix, name) {
  if (!PREFIX_RE.test(prefix) || !NAME_RE.test(name) || prefix.length > 40 || name.length > 80) throw Object.assign(new Error('Ugyldig ikon'), { status: 400 });
  const file = fileOf(prefix, name);
  try { return await readFile(file, 'utf8'); } catch { /* ikke cachet */ }
  let svg;
  if (useMock()) svg = mockSvg(prefix, name);
  else {
    let r;
    try { r = await doFetch(`${API}/${prefix}/${name}.svg`, { headers: { accept: 'image/svg+xml' }, signal: AbortSignal.timeout(8000) }); }
    catch { throw Object.assign(new Error('Fikk ikke kontakt med ikonbiblioteket'), { status: 502 }); }
    if (r.status === 404) throw Object.assign(new Error('Fant ikke ikonet'), { status: 404 });
    if (!r.ok) throw Object.assign(new Error(`Ikonbiblioteket svarte ${r.status}`), { status: 502 });
    svg = (await r.text()).trim();
    if (!/^<svg[\s>]/i.test(svg) || svg.length > 200_000) throw Object.assign(new Error('Fant ikke ikonet'), { status: 404 });
  }
  svg = clean(svg);
  await mkdir(join(ROOT, prefix), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, svg);
  await rename(tmp, file);
  return svg;
}

/* ---------------- ✦ AI-forslag ---------------- */

const KW_SCHEMA = { type: 'OBJECT', properties: { keyword: { type: 'STRING' } }, required: ['keyword'] };

export async function suggestIcon(label, prefix = 'lucide') {
  const name = String(label ?? '').trim().slice(0, 40);
  let keyword = keywordFor(name), source = 'list';
  if (!MOCK || live) {
    try {
      const r = await aiJson(`Give ONE English keyword (single word, lowercase, no punctuation) for an icon representing the category "${name}". Answer as JSON {"keyword": "..."}.`, KW_SCHEMA, { timeout: 15_000, temperature: 0.2, task: 'categorize' });
      const w = String(r.data?.keyword ?? '').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 30);
      if (w) { keyword = w; source = 'ai'; }
    } catch { /* ordlisten brukes */ }
  }
  let icon = null;
  try { icon = (await searchIcons(keyword, { prefix, limit: 8 })).icons[0]?.id ?? null; } catch { /* uten nett */ }
  if (!icon && keyword !== keywordFor(name)) { try { icon = (await searchIcons(keywordFor(name), { prefix, limit: 8 })).icons[0]?.id ?? null; } catch { /* uten nett */ } }
  icon ??= ICON_DEFAULTS[norm(name)] ?? null;
  return { keyword, icon, source };
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', (c, next) => authOrToken(c, next));
const fail = (c, e) => c.json({ error: e.message ?? 'Feil' }, e.status ?? 500);
// Prompt 42: også flere sett samtidig («lucide,tabler»), som Iconify-API-et godtar.
const prefixOk = (p) => !p || (p.length <= 80 && String(p).split(',').every((x) => PREFIX_RE.test(x) && x.length <= 40));

api.get('/sets', (c) => c.json({ sets: SETS.map(([prefix, name]) => ({ prefix, name, color: COLOR_SETS.includes(prefix) })), colorSets: COLOR_SETS, defaults: ICON_DEFAULTS }, 200, { 'Cache-Control': 'private, max-age=3600' }));

api.get('/search', async (c) => {
  const prefix = c.req.query('prefix') ?? c.req.query('prefixes') ?? '';
  if (!prefixOk(prefix)) return c.json({ error: 'Ugyldig bibliotek' }, 400);
  try { return c.json(await searchIcons(c.req.query('q') ?? c.req.query('query') ?? '', { prefix, limit: c.req.query('limit') ?? 96 })); } catch (e) { return fail(c, e); }
});

api.post('/suggest', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const label = String(b?.label ?? '').trim();
  if (!label) return c.json({ error: 'Mangler navn' }, 400);
  const prefix = String(b.prefix ?? '').trim() || 'lucide';
  if (!prefixOk(prefix)) return c.json({ error: 'Ugyldig bibliotek' }, 400);
  return c.json(await suggestIcon(label, prefix));
});

api.get('/:prefix/:file', async (c) => {
  const prefix = c.req.param('prefix'), m = c.req.param('file').match(/^(.+)\.svg$/);
  if (!m) return c.notFound();
  try {
    const svg = await iconSvg(prefix, m[1]);
    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  } catch (e) { return fail(c, e); }
});

export default api;

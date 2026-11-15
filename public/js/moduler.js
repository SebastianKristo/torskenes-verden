// Modullisten på web (Fase 6): GET /api/moduler (kilden er shared/schemas/moduler.json). Én kilde for toppmenyen, «Alle sider ▾»,
// bunnmenyen og Mer på mobil, fanelinje-redigeringen, titlene og de gamle adressene (aliaser). Lista caches i localStorage
// (hl_mod6), så nav-boot.js kan bruke aliasene og bunnmenyen før appen har hentet den, og så siden virker uten nett.
//
// Modul-id-ene er de samme på alle plattformer (oversikt, smarthjem, gjoremal …). Web har i tillegg interne visningsnøkler
// (dash, hjem, matplan …) som CSS og sidemodulene bruker (body[data-route]); viewOf() oversetter adressen til visningen.

const CACHE = 'hl_mod6';
let L = null; // {versjon, grupper, toppmeny, bunnmeny, moduler, innstillinger}

const read = () => { try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); return c && Array.isArray(c.moduler) ? c : null; } catch { return null; } };
const uid = () => { try { return localStorage.getItem('hl_uid'); } catch { return null; } };

/** Henter lista for innlogget bruker (api = util.api). Faller tilbake til siste kopi når serveren ikke svarer. */
export async function loadModuler(api) {
  try {
    L = await api('/moduler?plattform=web');
    const alias = {};
    for (const [from, to] of aliasPairs()) alias[from] = to;
    try { localStorage.setItem(CACHE, JSON.stringify({ ...L, uid: uid(), alias })); } catch { /* privat modus */ }
  } catch {
    const c = read();
    if (c && (!c.uid || String(c.uid) === String(uid()))) L = c;
  }
  return L;
}

export const liste = () => L ?? read() ?? { grupper: [], toppmeny: [], bunnmeny: [], moduler: [], innstillinger: [] };
/** Modulene på web (med adresse), i standardrekkefølgen. */
export const webModuler = () => liste().moduler.filter((m) => m.plattformer.includes('web') && m.rute);
export const modul = (id) => liste().moduler.find((m) => m.id === id) ?? null;
export const harModul = (id) => !!modul(id);
export const navn = (id) => modul(id)?.navn ?? id;

/* ---------------- Adresser ---------------- */

const path = (hash) => String(hash ?? '').replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
/** [gammel adresse, ny adresse] for alle aliaser (modulene og undersidene). */
function aliasPairs() {
  const out = [];
  for (const m of liste().moduler) {
    for (const a of m.aliaser ?? []) if (m.rute) out.push([a, m.rute]);
    for (const u of m.undersider ?? []) for (const a of u.aliaser ?? []) out.push([a, u.rute]);
  }
  return out;
}

/**
 * Adressen en gammel rute skal videresendes til, eller null. Lengste treff vinner, og resten av stien og ?-parametrene
 * følger med: #/kart?sone=Hjem → #/reise/kart?sone=Hjem, #/dash → #/oversikt, #/huskeliste → #/gjoremal.
 */
export function aliasTil(hash) {
  const p = path(hash), q = String(hash ?? '').includes('?') ? `?${String(hash).split('?').slice(1).join('?')}` : '';
  let best = null;
  for (const [from, to] of aliasPairs()) {
    const f = path(from);
    if ((p === f || p.startsWith(`${f}/`)) && (!best || f.length > path(best[0]).length)) best = [from, to];
  }
  if (!best) return null;
  const rest = p.slice(path(best[0]).length);
  return best[1].startsWith('#') ? `${best[1]}${rest}${q}` : best[1];
}

// Web-visningen for en adresse. Bare unntakene står her; ellers er visningen første ledd i adressen (#/matplan → matplan).
const VIEW = { oversikt: 'dash', 'kalender/familie': 'familiekalender', 'kalender/bursdager': 'bursdager', 'reise/kart': 'kart' };
/** Visningsnøkkelen (dash, kalender, bursdager …) for en adresse (#/kalender/bursdager). */
export function viewOf(hash) {
  const p = path(hash);
  for (const [k, v] of Object.entries(VIEW)) if (p === k || p.startsWith(`${k}/`)) return v;
  return p.split('/')[0];
}
/** Modulen en visning hører til (bursdager → kalender, kart → reise, dash → oversikt). */
export function modulForView(view) {
  const own = Object.entries(VIEW).find(([, v]) => v === view)?.[0].split('/')[0];
  const id = own ?? view;
  return liste().moduler.find((m) => m.id === id || path(m.rute) === id) ?? liste().moduler.find((m) => (m.undersider ?? []).some((u) => path(u.rute).split('/')[0] === view)) ?? null;
}
/** Modulnøkkelen i menyene (data-r) for en visning. */
export const navKeyOf = (view) => modulForView(view)?.id ?? view;

/** Tittelen for en adresse: undersiden når den har egen adresse (Bursdager, Kart, I kveld), ellers modulen. */
export function tittel(hash) {
  const p = path(hash), view = viewOf(hash), m = modulForView(view);
  if (!m) return null;
  let best = null;
  for (const u of m.undersider ?? []) {
    const up = path(u.rute);
    if (up !== path(m.rute) && (p === up || p.startsWith(`${up}/`)) && (!best || up.length > path(best.rute).length)) best = u;
  }
  return best?.navn ?? m.navn;
}

/** Gruppene med modulene sine (bare web, bare de brukeren har). */
export function gruppert(filter = () => true) {
  const ms = webModuler().filter(filter);
  return liste().grupper.map((g) => ({ ...g, moduler: ms.filter((m) => m.gruppe === g.id) })).filter((g) => g.moduler.length);
}

const escA = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/**
 * Fanelinje for undersidene i en modul (Reise: Avganger · Kart, Kalender: Alle · Familie · Bursdager). type = 'fane' | 'filter'.
 * Undersider uten egen adresse (filteret Skole, som ennå ikke har en egen visning på web) tas ikke med.
 */
export function subtabs(modId, cur, type = 'fane') {
  const m = modul(modId);
  const subs = (m?.undersider ?? []).filter((u) => u.type === type && (u.id === cur || u.rute !== m.rute || u === m.undersider.find((x) => x.type === type)));
  if (subs.length < 2) return '';
  return `<nav class="subtabs" aria-label="${escA(m.navn)}">${subs.map((u) => `<a href="${escA(u.rute)}" data-sub="${escA(u.id)}"${u.id === cur ? ' aria-current="page"' : ''}>${escA(u.navn)}</a>`).join('')}</nav>`;
}

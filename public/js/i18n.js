// Språk på web-dashboardet (prompt 27, claude-code-sprak.md, fasit «Homelab Papir Web.dc.html» + design/i18n.js).
// - t(nøkkel, verdier): tekster som nøkler i /assets/locales/nb.json og en.json («strings»). Mangler nøkkelen på
//   engelsk, brukes norsk; mangler den helt, vises nøkkelen.
// - Eldre sider bygger HTML med norsk tekst. På engelsk oversettes den synlige teksten (tekstnoder, placeholder,
//   aria-label, title) med ordlisten i en.json («dict» + «rules»), også det som tegnes senere (MutationObserver).
//   Innhold fra brukeren (titler, notater, nyheter, chat) merkes data-no-i18n og røres ikke.
// - Valget lagres i localStorage «hl_lang» og hos serveren (brukerens «language»). <html lang> settes.
// - Datoer og tall: Intl med nb-NO / en-GB (24-timers klokke, «kr» beholdes).
import { api } from './util.js';

const KEY = 'hl_lang';
const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
const ATTRS = ['placeholder', 'aria-label', 'title'];
const L = { lang: readLang(), nb: null, en: null, rules: [], obs: null, ready: null };

function readLang() {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'nb') return v; } catch { /* privat modus */ }
  return document.documentElement.lang === 'en' ? 'en' : 'nb';
}
export const lang = () => L.lang;
export const isEn = () => L.lang === 'en';
/** Intl-språket: nb-NO eller en-GB. */
export const locale = () => (L.lang === 'en' ? 'en-GB' : 'nb-NO');

async function fetchJson(l) {
  try { const r = await fetch(`/assets/locales/${l}.json`, { cache: 'no-cache' }); return r.ok ? await r.json() : {}; } catch { return {}; }
}
/** Henter ordlistene (én gang). Kalles før første tegning, men siden virker også uten. */
export function loadLocales() {
  L.ready ??= Promise.all([fetchJson('nb'), fetchJson('en')]).then(([nb, en]) => {
    L.nb = nb; L.en = en;
    L.rules = (en.rules ?? []).map(([re, fl, rep]) => { try { return [new RegExp(re, fl), rep]; } catch { return null; } }).filter(Boolean);
    L.months = en.months ?? []; L.days = en.days ?? []; L.short = en.short ?? {};
  });
  return L.ready;
}

/** Tekst for nøkkelen på valgt språk. {navn} i teksten byttes med verdiene. */
export function t(key, vars) {
  const s = (L.lang === 'en' ? L.en?.strings?.[key] : null) ?? L.nb?.strings?.[key] ?? key;
  return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
}
/** Velger entall/flertall: tn('kal.lessons', 3) → «3 timer» / «3 lessons». Nøkler: key.one og key.other. */
export const tn = (key, n, vars = {}) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...vars });

/* ---------------- Datoer og tall ---------------- */

const fmtCache = new Map();
function fmt(kind, o) {
  const k = `${L.lang}|${kind}|${JSON.stringify(o)}`;
  let f = fmtCache.get(k);
  if (!f) { f = kind === 'n' ? new Intl.NumberFormat(locale(), o) : new Intl.DateTimeFormat(locale(), { hourCycle: 'h23', ...o }); fmtCache.set(k, f); }
  return f;
}
/** Dato med Intl: fmtDate(d, {weekday:'long', day:'numeric', month:'long'}) → «mandag 19. oktober» / «Monday 19 October». */
export const fmtDate = (d, o = { day: 'numeric', month: 'long' }) => fmt('d', o).format(d instanceof Date ? d : new Date(d));
export const fmtTime = (d) => fmt('d', { hour: '2-digit', minute: '2-digit' }).format(d instanceof Date ? d : new Date(d));
export const fmtNum = (n, o = {}) => fmt('n', o).format(n);
/** Ukedagsnavn (0 = søndag), langt eller kort. */
export const dayName = (i, style = 'long') => fmt('d', { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + i)));
export const monthName = (i, style = 'long') => fmt('d', { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, i, 15)));
export const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

/* ---------------- Oversettelse av eksisterende tekst ---------------- */

const capLike = (rep, m) => (m === m.toUpperCase() && m.length > 1 ? rep.toUpperCase() : m[0] === m[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep);
/** Norsk tekst → engelsk med ordlisten. Ukjent tekst kommer uendret tilbake. */
export function tr(s) {
  if (!s || L.lang !== 'en' || !L.en) return s;
  const tt = s.trim();
  if (!tt || !/[A-Za-zÆØÅæøå]/.test(tt)) return s;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], D = L.en.dict ?? {};
  if (D[tt] != null) return lead + D[tt] + trail;
  if (L.short[tt]) return lead + L.short[tt] + trail;
  let o = tt;
  for (const [re, rep] of L.rules) o = o.replace(re, rep);
  o = o.replace(/(\d+)\. (januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)/gi, '$1 $2');
  for (const [n, e] of L.months) o = o.replace(new RegExp(`(^|[^\\wæøå])(${n})(?![\\wæøå])`, 'gi'), (m, a, w) => a + capLike(e, w));
  for (const [n, e] of L.days) o = o.replace(new RegExp(`(^|[^\\wæøå])(${n})(?![\\wæøå])`, 'gi'), (m, a, w) => a + capLike(e, w));
  // Setninger med kjente biter: «Søk etter …» osv. bare når hele teksten er i ordlisten etter reglene.
  if (D[o] != null) o = D[o];
  return o === tt ? s : lead + o + trail;
}

function skip(p) { return !p || SKIP[p.nodeName] || (p.closest && p.closest('[data-no-i18n],[contenteditable=true]')); }
function doText(n) {
  const p = n.parentNode;
  if (skip(p)) return;
  const v = n.nodeValue;
  if (L.lang === 'en') {
    if (n.__tr !== undefined && v === n.__tr) return;
    const x = tr(v);
    n.__no = v;
    if (x !== v) { n.__tr = x; n.nodeValue = x; } else n.__tr = undefined;
  } else if (n.__tr !== undefined) { if (v === n.__tr) n.nodeValue = n.__no; n.__tr = undefined; }
}
function doAttr(el, a) {
  // Attributter (placeholder, aria-label, title) oversettes også på <textarea>; bare data-no-i18n stopper dem.
  if (!el.getAttribute || el.closest?.('[data-no-i18n]')) return;
  const v = el.getAttribute(a);
  if (v == null) return;
  const k = `__i18n_${a}`, kt = `${k}_t`;
  if (L.lang === 'en') {
    if (el[kt] === v) return;
    const x = tr(v);
    el[k] = v;
    if (x !== v) { el[kt] = x; el.setAttribute(a, x); } else el[kt] = undefined;
  } else if (el[kt] !== undefined) { if (v === el[kt]) el.setAttribute(a, el[k]); el[kt] = undefined; }
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = root;
  while (n) {
    if (n.nodeType === 3) doText(n);
    else if (n.hasAttribute) for (const a of ATTRS) if (n.hasAttribute(a)) doAttr(n, a);
    n = it.nextNode();
  }
}
/** Oversetter et tre med en gang (f.eks. en modal før den vises). */
export const translateTree = (el) => { if (L.lang === 'en') walk(el); };

function observe() {
  if (L.obs || L.lang !== 'en') return;
  L.obs = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
      else m.addedNodes.forEach(walk);
    }
  });
  L.obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const tt = document.querySelector('title');
  if (tt) L.obs.observe(tt, { subtree: true, childList: true, characterData: true });
}

function applyDoc() {
  document.documentElement.lang = L.lang;
  if (L.lang === 'en') { walk(document.body); const tt = document.querySelector('title'); if (tt) walk(tt); observe(); }
  else { L.obs?.disconnect(); L.obs = null; walk(document.body); }
}

/** Start: henter ordlistene, setter <html lang> og oversetter siden. serverLang = brukerens lagrede valg. */
export async function initI18n(serverLang) {
  if ((serverLang === 'en' || serverLang === 'nb') && serverLang !== L.lang) { L.lang = serverLang; try { localStorage.setItem(KEY, serverLang); } catch { /* */ } }
  document.documentElement.lang = L.lang;
  await loadLocales();
  if (document.body) applyDoc();
}

/** Bytter språk: lagres lokalt og hos serveren, siden oversettes og visningen tegnes på nytt (hl:lang). */
export async function setLang(l, { save = true } = {}) {
  l = l === 'en' ? 'en' : 'nb';
  try { localStorage.setItem(KEY, l); } catch { /* privat modus */ }
  const changed = l !== L.lang;
  L.lang = l; fmtCache.clear();
  await loadLocales();
  applyDoc();
  if (save) saveLang(l);
  if (changed) document.dispatchEvent(new CustomEvent('hl:lang', { detail: l }));
}
/** Lagrer språket hos serveren. Eldre servere uten feltet avviser det; da gjelder bare nettleseren. */
export function saveLang(l) {
  api('/me', { method: 'PATCH', json: { language: l } })
    .catch(() => api('/me/layout', { method: 'PUT', json: { language: l } }))
    .catch(() => {});
}

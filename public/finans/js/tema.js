// Økonomi følger Homelab-temaet (Q15, B-F1): stil (Papir «2c» / Glass «cur») og modus (lys/mørk) leses fra de samme
// valgene som Homelab bruker, så mørk modus bare velges ett sted.
//   Papir lys → «lys», Papir mørk → «mork», Glass → «glod» (desktop). Mobil har bare Papir: Glass gir Papir mørk.
// Kildene, i rekkefølge: html[data-theme51-eff] (webx51.js, /api/me/theme51), brukerens oppsett (/api/me/layout: hlTheme,
// web_theme), så Homelabs lokale kopi (hl_theme, papir_web_mode). loader.js gjør det samme før første tegning (vanlig skript).
// Det gamle FinansHub-valget (layout.design / fh_design, paperMode på mobil) brukes bare når Homelab-modusen er ukjent.
const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat modus */ } };
const mq = (() => { try { return matchMedia('(prefers-color-scheme: dark)'); } catch { return null; } })();
const MODUS = { light: 'lys', dark: 'mork', system: 'auto' };
const WEB = { lys: 'light', mork: 'dark', auto: 'system' };

/** «papir» eller «glass». */
export function homelabStil(layout) {
  const v = layout?.hlTheme ?? ls('hl_theme');
  return v === 'cur' ? 'glass' : 'papir';
}

/** Homelab-modusen slik brukeren valgte den: «lys», «mork», «auto» (følg systemet) eller null når den er ukjent. */
export function homelabModus(layout) {
  const t = document.documentElement.dataset.theme51;
  if (t === 'light' || t === 'dark' || t === 'system') return MODUS[t];
  if (t === 'auto') return document.documentElement.dataset.theme51Eff === 'dark' ? 'mork' : 'lys';
  const w = layout?.web_theme ?? ls('papir_web_mode');
  return MODUS[w] ?? null;
}

/** true/false for mørk Papir-modus, eller null når Homelab-modusen er ukjent. */
export function homelabMorkt(layout) {
  const eff = document.documentElement.dataset.theme51Eff;
  if (eff === 'dark' || eff === 'light') return eff === 'dark';
  const m = homelabModus(layout);
  return m == null ? null : m === 'mork' || (m === 'auto' && !!mq?.matches);
}

/** FinansHub-designet på desktop: «lys», «mork» eller «glod». legacy = det gamle FinansHub-valget (brukes når modusen er ukjent). */
export function fhDesign(layout, legacy) {
  if (homelabStil(layout) === 'glass') return 'glod';
  const d = homelabMorkt(layout);
  if (d != null) return d ? 'mork' : 'lys';
  return legacy === 'mork' ? 'mork' : 'lys';
}

/** Setter Homelab-valget fra Økonomi (temavelgeren på desktop og mobil). Gjelder også Homelab, på alle enheter.
 *  design: «lys» | «mork» | «glod», eller modus: «lys» | «mork» | «auto». */
export function settHomelabTema({ design, modus }) {
  const h = document.documentElement;
  if (design === 'glod') return settStil('cur');
  if (design) { settStil('2c'); modus = design; }
  const wm = WEB[modus];
  if (!wm) return;
  lsSet('papir_web_mode', wm);
  // webx51.js lagrer modusen i /api/me/theme51 (og web_theme) når den hører «papir-web-mode», og setter data-theme51*.
  h.dataset.theme51 = wm;
  h.dataset.theme51Eff = wm === 'system' ? (mq?.matches ? 'dark' : 'light') : wm;
  window.dispatchEvent(new CustomEvent('papir-web-mode', { detail: { mode: wm, eff: h.dataset.theme51Eff } }));
}
function settStil(t) {
  lsSet('hl_theme', t);
  fetch('/api/me/layout', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hlTheme: t }) }).catch(() => {});
}

/** Flytter brukerens lagrede FinansHub-valg til Homelab én gang per nettleser (Q15): «mork» blir Papir mørk, «glod» blir Glass.
 *  Bare når Homelab står på Papir med lys modus (ellers følger Økonomi allerede et mørkt valg). → true når noe ble flyttet. */
export function flyttFinansValg(layout) {
  if (!layout || ls('fh_design_flyttet')) return false;
  lsSet('fh_design_flyttet', '1');
  const old = layout.design;
  if ((old !== 'mork' && old !== 'glod') || homelabStil(layout) !== 'papir' || homelabModus(layout) !== 'lys') return false;
  if (old === 'glod') { layout.hlTheme = 'cur'; settStil('cur'); } else { layout.web_theme = 'dark'; settHomelabTema({ modus: 'mork' }); }
  return true;
}

/** Kaller fn når Homelab-temaet endres (i denne fanen via theme51, eller i en annen fane). */
export function nårTemaEndres(fn) {
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme51', 'data-theme51-eff'] });
  addEventListener('storage', (e) => { if (e.key === 'hl_theme' || e.key === 'papir_web_mode') fn(); });
  mq?.addEventListener?.('change', fn);
}

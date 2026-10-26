// Prompt 66 (prompt 50b, «fullfør utseendet», UTSYS): felles hjelpere for System- og Backup-sidene i Innstillinger.
// Gjenbruker komponentene fra AI-siden (ui65 i ai-control.js: rad, kort, seksjonsetikett, banner, knapper, segment, bryter)
// i en egen `.ac emb sys66`-rot. Fargene (--bg/--card/--line/--ink/--mut/--ok/--warn/--bad) settes per tema i
// public/css/web66-sys.css (Papir, Papir mørk og Nåværende/mørkt glass), så samme mål og komponenter gjelder i alle temaer.
// Bare visningen: data og handlinger ligger fortsatt i ops51.js / obs51.js / settings-system.js.
import { ui65 } from './ai-control.js';

export const { row, sec, btn, seg, swb, banner, ico, fld } = ui65;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

/* Ikoner som AI-siden ikke har (samlet-md § Ikoner på alt: database, angre, flagg, insekt, puls …). Samme strek (1,9). */
const I66 = {
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  hdd: 'M3 13l3-8h12l3 8v6H3zM3 13h18M7 16.5h.01M11 16.5h.01',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  bug: 'M9 7a3 3 0 0 1 6 0M8 8h8v6a4 4 0 0 1-8 0zM12 12v6M4 11h4M16 11h4M5 6l3 2M19 6l-3 2M5 18l3-2M19 18l-3-2',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  mac: 'M4 5h16v11H4zM9 20h6M12 16v4',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8',
};
export const ico66 = (n, s = 15) => (I66[n] ? `<svg class="ac-i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${I66[n]}"/></svg>` : ico(n, s));

/** Statusfarge fra serverens nivåer → prikk-klasse på ikonflisen (ok · warn · bad · busy · off). */
export const tone66 = (c) => ({ green: 'ok', ok: 'ok', yellow: 'warn', warn: 'warn', partial: 'warn', red: 'bad', crit: 'bad', failed: 'bad', running: 'busy', pending: 'off' }[c] ?? 'off');

/** Én rad (ui65.row) – med ikonene over i tillegg. o som ui65.row; o.ic kan også være et I66-ikon. */
export function row66(o) {
  if (!o.ic || !I66[o.ic]) return row(o);
  const tile = `<span class="ac-ic" aria-hidden="true">${ico66(o.ic)}${o.dot ? `<i class="ac-icd ${o.dot}"></i>` : ''}</span>`;
  return row({ ...o, noic: true }).replace(/^(<(?:div|button)[^>]*>)/, `$1${tile}`);
}

/** Verdi til høyre (mono 11,5 px). c: ok | warn | bad. */
export const val66 = (t, c = '') => `<span class="ac-v${c ? ` ${c}` : ''}">${esc(t)}</span>`;
/** Tynn 4 px stolpe (pct 0–100) i en farge (kategori eller status). */
export const bar66 = (pct, color, cls = '') => `<span class="ac-b4 sys66-b4${cls ? ` ${cls}` : ''}"><i style="width:${Math.max(0, Math.min(100, Number(pct) || 0))}%;background:${color}"></i></span>`;
/** Chevron som pynt (raden selv er knappen). */
export const chev66 = () => `<span class="ac-chev" aria-hidden="true">${ico('chev', 14)}</span>`;
/** Liten tekstknapp i seksjonsetiketten («Vis flere», «Oppdater»). */
export const lnk66 = (label, attrs) => `<button type="button" class="ac-lnk" ${attrs}>${esc(label)}</button>`;

/** KPI-stripe: [[etikett, verdi, undertekst, attrs (gjør cellen til knapp), tone]] – samme som AI-siden, men egne lenker. */
export const kpis66 = (cells) => `<div class="ac-kpis">${cells.map(([l, v, s, attrs, tone]) => `<${attrs ? `button type="button" ${attrs}` : 'div'} class="ac-kpi"><span class="ac-lab">${esc(l)}</span><b>${esc(v)}</b><span class="${tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : ''}">${esc(s)}</span></${attrs ? 'button' : 'div'}>`).join('')}</div>`;

/* Utvidbare rader: åpen/lukket per nøkkel (chevron roterer 90°, panel under raden). */
const OPEN = {};
let R = () => {};
/** Hvem som tegner siden nå (System eller Backup). */
export const setR66 = (fn) => { if (typeof fn === 'function') R = fn; };
export const isOpen66 = (k, def = false) => (k in OPEN ? OPEN[k] : def);
/** Utvidbar rad. key: nøkkel, def: åpen som standard, panel: html under raden. */
export function xrow66(key, o, panel, def = false) {
  const on = isOpen66(key, def);
  const ch = `<button type="button" class="ac-chev${on ? ' on' : ''}" data-sys66-x="${esc(key)}" aria-expanded="${on}" aria-label="${on ? 'Skjul' : 'Vis mer'}: ${esc(o.t ?? '')}">${ico('chev', 14)}</button>`;
  return `${row66({ ...o, right: `${o.right ?? ''}${ch}`, cls: `ac-rx${on ? ' open' : ''}${o.cls ? ` ${o.cls}` : ''}` })}${on && panel ? `<div class="ac-xp">${panel}</div>` : ''}`;
}
/** Klikk på chevronen (kalles fra systemClick, som settings.js kjører på alle sider). */
export function sys66Click(e) {
  const x = e.target.closest?.('[data-sys66-x]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.sys66X;
  OPEN[k] = x.getAttribute('aria-expanded') !== 'true';
  R();
  return true;
}

/** Roten rundt System-/Backup-innholdet: th-papir · th-mork (Papir mørk) · th-cur (Nåværende), som AI-siden. Fargene kommer fra web66-sys.css. */
export function root66(html, cls = '') {
  css66();
  const d = typeof document !== 'undefined' ? document.documentElement : null;
  const th = !d ? 'papir' : d.dataset.hl !== '2c' ? 'cur' : d.dataset.mode === 'dark' ? 'mork' : 'papir';
  return `<div class="ac emb sys66 th-${th}${cls ? ` ${cls}` : ''}" data-sys66>${html}</div>`;
}

/** Stilen til komponentene (ai-control.css) lastes ellers først når AI-siden åpnes. */
function css66() {
  if (typeof document === 'undefined' || document.querySelector('link[data-ac-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/ai-control.css?v=65'; l.dataset.acCss = ''; document.head.appendChild(l);
  if (!document.querySelector('link[data-ac-fonts],link[data-hl-fonts]')) { const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.acFonts = ''; f.href = 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap'; document.head.appendChild(f); }
}

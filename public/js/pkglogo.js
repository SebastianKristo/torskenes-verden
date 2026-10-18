// Pakkelogo og pakketittel (prompt 21, claude-code-pakke-logo.md). Samme komponent på Dashboard, i Sporing og i detaljene.
// Logo: 1) butikken pakken kommer fra (logo.id i logobiblioteket eller logo.domain / shopDomain), 2) fraktselskapet,
// 3) bokstav-reserve i fraktselskapets farge. Når butikken vises, ligger fraktselskapets logo som et lite rundt merke nede
// til høyre. Tittel: varenavn eller butikk; bare hvis begge mangler, «Pakke fra Bring». Aldri sporingsnummeret.
import { esc, initials } from './util.js';

export const CARRIER_DOMAIN = {
  bring: 'bring.no', posten: 'posten.no', postnord: 'postnord.no', dhl: 'dhl.com', helthjem: 'helthjem.no', instabox: 'instabox.io',
  budbee: 'budbee.com', ups: 'ups.com', fedex: 'fedex.com', gls: 'gls-group.com', schenker: 'dbschenker.com', dbschenker: 'dbschenker.com', porterbuddy: 'porterbuddy.com',
};
const carName = (p) => String(p.carrierName ?? p.carrier ?? '').replace(/ \(17TRACK\)$/, '') || 'fraktselskap';
// Eldre servere lager navnet «Bring · 0750» (fraktselskap + slutten av sporingsnummeret) når pakken mangler navn.
const autoName = (p) => !p.name || p.name === p.trackingNo || (p.trackingNo && p.name === `${p.carrierName} · ${String(p.trackingNo).slice(-4)}`);

/** Tittelen på pakken: title fra serveren, ellers varenavn, butikk eller «Pakke fra <fraktselskap>». */
export function pkgTitle(p) {
  if (p?.title) return String(p.title);
  if (!autoName(p)) return String(p.name);
  if (p?.shop) return String(p.shop);
  return `Pakke fra ${carName(p)}`;
}

const enc = encodeURIComponent;
const srcOf = (lg) => (lg?.id ? `/finans/api/logos/file/${enc(lg.id)}` : lg?.domain ? `/finans/api/logo/${enc(lg.domain)}` : null);

const hex = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : d);
// Fraktselskapet fra serverens logo-objekt: fil i biblioteket, så lokal SVG (virker uten nett), så favicon.
const carSrc = (c) => (!c || typeof c !== 'object' ? (typeof c === 'string' ? c : null) : (c.hasFile && c.url) || c.svg || c.url || null);

/** Server (prompt 21): logo = {kind:'shop'|'carrier'|'letter', id, domain, url, letter, color, carrierLogo}. */
function serverLogo(p, lg, size, cls) {
  const name = carName(p);
  const car = lg.kind === 'shop' ? carSrc(lg.carrierLogo) : null;
  const main = lg.kind === 'shop' ? lg.url : lg.kind === 'carrier' ? carSrc(lg) ?? p.carrierLogo : null;
  const color = hex(lg.color, hex(p.carrierColor, '#6b665c')), fg = hex(lg.fg, hex(p.carrierFg, '#fff'));
  const full = (u) => (/\/carriers\//.test(u ?? '') ? ' full' : '');
  const img = main ? `<img class="pkl-img${full(main)}" data-pkl src="${esc(main)}"${car ? ` data-fb="${esc(car)}"` : ''} alt="" loading="lazy" decoding="async">` : '';
  const badge = car ? `<img class="pkl-car${full(car)}" data-pkl src="${esc(car)}" alt="${esc(name)}" title="${esc(name)}" loading="lazy" decoding="async">` : '';
  const label = lg.kind === 'shop' ? lg.name || p.shop || name : name;
  return `<span class="pkl ${cls}${main ? ' has' : ''}" style="--s:${size}px;--c:${color};--fg:${fg}" role="img" aria-label="${esc(label)}"><i>${esc(lg.letter || initials(label))}</i>${img}${badge}</span>`;
}

/** Logoen som HTML. size i px (52 på kort, 44 i Sporing). */
export function pkgLogo(p, size = 52, cls = '') {
  if (p?.logo && typeof p.logo === 'object' && p.logo.kind) return serverLogo(p, p.logo, size, cls);
  const lg = p?.logo && typeof p.logo === 'object' ? p.logo : {};
  const carDom = CARRIER_DOMAIN[String(p?.carrier ?? '').toLowerCase()] ?? null;
  const shopDom = p?.shopDomain ?? p?.shop_domain ?? null;
  let shop = srcOf(lg) ?? (shopDom ? `/finans/api/logo/${enc(shopDom)}` : null);
  if (shop && !lg.id && (lg.domain ?? shopDom) === carDom) shop = null; // «butikken» er fraktselskapet selv
  const car = carSrc(lg.carrierLogo) || p?.carrierLogo || (carDom ? `/finans/api/logo/${enc(carDom)}` : null);
  const main = shop ?? car;
  const ini = shop ? initials(p.shop || p.title || carName(p)) : p?.carrierIni || initials(carName(p));
  const color = /^#[0-9a-f]{3,8}$/i.test(p?.carrierColor ?? '') ? p.carrierColor : '#6b665c';
  const fg = /^#[0-9a-f]{3,8}$/i.test(p?.carrierFg ?? '') ? p.carrierFg : '#fff';
  const full = (u) => (/\/carriers\//.test(u) ? ' full' : '');
  const img = main ? `<img class="pkl-img${full(main)}" data-pkl src="${esc(main)}"${shop && car ? ` data-fb="${esc(car)}"` : ''} alt="" loading="lazy" decoding="async">` : '';
  const badge = shop && car ? `<img class="pkl-car${full(car)}" data-pkl src="${esc(car)}" alt="${esc(carName(p))}" title="${esc(carName(p))}" loading="lazy" decoding="async">` : '';
  return `<span class="pkl ${cls}${main ? ' has' : ''}" style="--s:${size}px;--c:${color};--fg:${fg}" role="img" aria-label="${esc(shop ? p.shop || carName(p) : carName(p))}"><i>${esc(ini)}</i>${img}${badge}</span>`;
}

/** «+12 pakker ›»: moreCount fra serveren, ellers antall minus denne. */
export function moreText(count, moreCount) {
  const n = Number.isFinite(+moreCount) ? +moreCount : Math.max(0, (+count || 0) - 1);
  return n > 0 ? `+${n} ${n === 1 ? 'pakke' : 'pakker'}` : '';
}

// CSP stopper inline onerror: én felles lytter. Butikklogoen faller tilbake til fraktselskapet, så til bokstaven.
if (typeof document !== 'undefined') {
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t?.tagName !== 'IMG' || !t.hasAttribute('data-pkl')) return;
    const box = t.parentElement;
    if (t.classList.contains('pkl-img') && t.dataset.fb) {
      const fb = t.dataset.fb;
      delete t.dataset.fb;
      box?.querySelector('.pkl-car')?.remove();
      t.classList.toggle('full', /\/carriers\//.test(fb));
      t.src = fb;
      return;
    }
    if (t.classList.contains('pkl-img')) box?.classList.remove('has');
    t.remove();
  }, true);
}

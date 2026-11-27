// Hjem-flisen «Tailnet» (prompt 57): online/totalt, en liten donut per type, siste endring og varselprikk ved problemer.
// Bare for administratorer. Følger flismønsteret: på web er den en widget i rutenettet (p_tail i Papir, d_tail i Glass) som kan
// flyttes og skjules; i PWA-en er den flisen w52ts (oversikt-mobil.js), halv eller full bredde. Tallene kommer fra
// GET /api/tailscale/stats, og flisen hentes på nytt når serveren sender «tailscale.node» (ingen polling).
import { api, esc } from './util.js';
import { store, widget, refresh } from './store.js';
import { onLive } from './realtime.js';
import { pageCss } from './lib/page-css.js';

export const isAdminUser = () => store.me?.me?.role === 'admin';
const KINDS = [['server', 'Servere'], ['desktop', 'PC'], ['laptop', 'Bærbare'], ['mobile', 'Mobil'], ['tablet', 'Nettbrett'], ['iot', 'Smarthus']];
const F = { stats: null, err: null, at: 0, busy: false, live: null, subs: new Set() };

/** Henter tallene (høyst hvert 30. sekund) og varsler flisene. */
export function loadFlis(force = false) {
  if (!isAdminUser() || F.busy || (!force && Date.now() - F.at < 30_000)) return;
  F.busy = true;
  api('/tailscale/stats').then((s) => { F.stats = s; F.err = null; }, (e) => { F.err = e.message; }).finally(() => {
    F.busy = false; F.at = Date.now();
    for (const fn of F.subs) fn();
  });
  F.live ??= onLive('tailscale.node', () => loadFlis(true));
}
export const flisData = () => F.stats;
export const onFlis = (fn) => { F.subs.add(fn); };

function donut(k, c) {
  const r = 9, L = 2 * Math.PI * r, f = c.total ? c.online / c.total : 0;
  return `<span class="tnf-d" title="${esc(`${k[1]}: ${c.online} av ${c.total} online`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${r}" class="bg"/><circle cx="12" cy="12" r="${r}" class="fg" stroke-dasharray="${(f * L).toFixed(2)} ${L.toFixed(2)}"/></svg><span>${esc(k[1])}</span></span>`;
}
function changeText(e) {
  if (!e) return 'Ingen endringer ennå';
  const m = Math.max(1, Math.round((Date.now() - Date.parse(e.at)) / 60_000));
  const when = m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} t` : `${Math.round(m / 1440)} d`;
  return `${e.name} ${e.online ? 'kom online' : 'gikk offline'} for ${when} siden`;
}

/** Innholdet i flisen (samme på web og i PWA-en). */
export function flisHtml(labelCls = 'tnf-k') {
  pageCss('nettverk');
  const s = F.stats;
  if (!s) return `<span class="${labelCls}">TAILNET</span><b class="tnf-v">${F.err ? '–' : '…'}</b><span class="tnf-s">${esc(F.err ?? 'Henter …')}</span>`;
  const c = s.counts, warn = (s.maintenance?.count ?? 0) > 0 || (c.kinds.server && c.kinds.server.online < c.kinds.server.total);
  const kinds = KINDS.filter(([k]) => c.kinds[k]?.total).map((k) => donut(k, c.kinds[k[0]])).join('');
  return `<span class="tnf-top"><span class="${labelCls}">TAILNET</span>${warn ? '<i class="tnf-warn" role="img" aria-label="Noe trenger tilsyn"></i>' : ''}</span>
    <b class="tnf-v">${c.online}<span>/${c.total}</span></b><span class="tnf-s">online</span>
    <span class="tnf-ds">${kinds}</span><span class="tnf-s">${esc(changeText(s.lastChange))}</span>`;
}

const tileWidget = (cls) => ({ cls, render: () => `<a class="tnf" href="#/nettverk" aria-label="Tailnet">${flisHtml()}</a>`, mounted: () => loadFlis() });
widget('p_tail', tileWidget('p-sec tnf-host'));
widget('d_tail', tileWidget('card tnf-host'));
onFlis(() => refresh('p_tail', 'd_tail'));

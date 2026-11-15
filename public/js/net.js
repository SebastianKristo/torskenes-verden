import { esc, isMobile } from './util.js';
import { store, widget, card, refresh, errBox, on } from './store.js';
import { tiles } from './dash.js';
import { tabAllowed, tabLabel } from './profile.js';
import { gruppert } from './moduler.js';

widget('n_lab', { render() {
  const h = store.data.health;
  const rows = h ? h.services.map((s) => {
    const color = s.up ? 'var(--green)' : 'var(--red)';
    const title = s.up ? `Oppe · ${s.ms} ms` : `Nede · ${s.error ?? s.status}`;
    return `<a class="row" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(title)}"><span style="display:flex;gap:10px;align-items:center"><span class="dot" style="background:${color}"></span>${esc(s.name)}</span><span class="mono muted" style="font-size:12px">${esc(s.host)}${isMobile() ? '' : ' ↗'}</span></a>`;
  }).join('') : '<div class="skeleton"></div>'.repeat(4);
  const up = h ? h.services.filter((s) => s.up).length : 0;
  return `<div class="card-head"><div class="card-title">Homelab</div>${h ? `<span class="mono sub" style="font-size:12px">${up}/${h.services.length} oppe</span>` : ''}</div>${rows}${errBox('health', 'Helsesjekk')}`;
} });

// Snarveiene fra brukerens oppsett: nettsider på internett og tjenester på lokalnettet hver for seg.
const links = (local) => (store.me.shortcuts ?? []).filter((s) => !!s.local === local).map((s) => [s.name, s.url]);
const group = (name, ls) => `<div class="card-title">${name}</div>${ls.map(([n, u]) => `<a class="row" href="${esc(u)}" target="_blank" rel="noopener"><span>${esc(n)}</span><span class="muted" style="font-size:13px">${esc(u.replace(/https?:\/\/(www\.)?/, ''))} ↗</span></a>`).join('')}`;
widget('n_news', { render: () => group('Snarveier', links(false)) });
widget('n_ai', { render: () => group('På lokalnettet', links(true)) });

export function render() {
  return `<div style="display:flex;flex-direction:column;gap:20px"><div class="page-title">Nett<b>verk</b> og lenker</div>
    <div class="grid" data-dnd="net">${card('n_lab')}${card('n_news')}${card('n_ai')}</div></div>`;
}

widget('m_links', { render: () => `<div class="tiles">${tiles()}</div>` });

// «Mer» på mobil (Fase 6, O12): alle sidene først, gruppert som i modullisten (I dag, Hjemme, Tid …), uten dem som står i
// bunnmenyen. Eksterne snarveier, Homelab-status, CV og Innstillinger står nederst.
export function renderMore() {
  const bottom = new Set([...document.querySelectorAll('.bottomnav [data-r]')].map((a) => a.dataset.r));
  const groups = gruppert((m) => !bottom.has(m.id) && tabAllowed(m.id));
  const btn = (m) => `<a class="btn-lg" href="${esc(m.rute)}" data-more-r="${esc(m.id)}" style="justify-content:center;padding:14px">${esc(tabLabel(m.id, m.navn))}</a>`;
  return `<div class="page-title">Alle <b>sider</b></div>
    ${groups.map((g) => `<section class="more-g" aria-label="${esc(g.navn)}"><h2 class="more-gh">${esc(g.navn)}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${g.moduler.map(btn).join('')}</div></section>`).join('')}
    <section class="more-g" aria-label="Snarveier"><h2 class="more-gh">Snarveier</h2>
      <div class="grid" data-dnd="m_more">${card('m_links')}${card('n_lab')}</div></section>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <a class="btn-lg" href="/cv" target="_blank" style="justify-content:center;padding:14px">CV ↗</a>
      <button class="btn-lg" data-act="settings" style="justify-content:center;padding:14px">Innstillinger</button>
    </div>`;
}

on('health', () => refresh('n_lab'));

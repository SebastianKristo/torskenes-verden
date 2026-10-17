import { esc, isMobile } from './util.js';
import { store, widget, card, refresh, errBox, on } from './store.js';
import { tiles } from './dash.js';
import { tabAllowed, tabLabel } from './profile.js';

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

// «Mer» på mobil: snarveier, homelab, Rom, CV og innstillinger.
export function renderMore() {
  return `<div class="page-title">Snar<b>veier</b></div>
    <div class="grid" data-dnd="m_more">${card('m_links')}${card('n_lab')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${['rom', 'nettverk', 'hjem', 'matplan', 'sporing', 'domener'].filter((k) => tabAllowed(k)).map((k) => `<a class="btn-lg" href="#/${k}" style="justify-content:center;padding:14px">${esc(tabLabel(k))} ↗</a>`).join('')}
      <a class="btn-lg" href="/cv" target="_blank" style="justify-content:center;padding:14px">CV ↗</a>
      <button class="btn-lg" data-act="settings" style="justify-content:center;padding:14px">Innstillinger</button>
    </div>`;
}

on('health', () => refresh('n_lab'));

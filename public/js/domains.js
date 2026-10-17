// Domener: Cloudflare-sone, DNS og registrar.
import { api, esc } from './util.js';
import { page, ddmmyyyy } from './osmods.js';
import { openSettings } from './settings.js';

const pg = page('dom-os', (st) => {
  const d = st.data;
  if (!d.configured) return `<div class="note"><b>Cloudflare er ikke satt opp</b><span>Lag et API-token med Zone:Read, DNS:Read og Registrar:Read (valgfritt Analytics:Read) på dash.cloudflare.com → My Profile → API Tokens, og legg det inn under Innstillinger → Integrasjoner → Cloudflare.</span>
    <button class="fbtn pri" data-dom-settings style="align-self:flex-start">Åpne innstillinger</button></div>`;
  const kv = [['Domene', d.domain], ['Status', d.status === 'active' ? '● Aktiv' : '● ' + d.status, d.status === 'active' ? 'var(--f-pos)' : 'var(--f-acc-l)'], ['Plan', d.plan], ['Registrar', d.registrar],
    ['Fornyes', d.expires ? ddmmyyyy(d.expires) + (d.renewal ? ' · ' + d.renewal : '') : '–'], ['SSL', d.ssl ?? '–'],
    ['Navnetjenere', d.nameServers.length ? d.nameServers.map((n) => n.split('.')[0]).join(' / ') + '.' + d.nameServers[0].split('.').slice(1).join('.') : '–'],
    ['Forespørsler 24 t', d.requests24h === null || d.requests24h === undefined ? '–' : d.requests24h.toLocaleString('nb-NO')]];
  return `<div class="dom-kv">${kv.map(([l, v, c]) => `<div><div>${l}</div><b${c ? ` style="color:${c}"` : ''}>${esc(v)}</b></div>`).join('')}</div>
    <div class="list"><div class="dns-row head"><span>Type</span><span>Navn</span><span>Innhold</span><span>Proxy</span></div>
      ${d.records.map((r) => `<div class="dns-row"><span class="t">${esc(r.type)}</span><span title="${esc(r.name)}">${esc(r.name)}</span><span class="mute" title="${esc(r.content)}">${esc(r.content)}</span><span style="color:${r.proxied ? 'var(--f-acc-l)' : 'var(--f-2)'}">${r.proxied ? 'Proxied' : 'DNS'}</span></div>`).join('')}</div>
    <div class="note"><b>API</b><span class="mono">GET /client/v4/zones?name=${esc(d.domain)} · /zones/:id/dns_records · /accounts/:id/registrar/domains</span>
      <span>Oppdateres hvert 15. minutt. Token legges i Innstillinger → Integrasjoner → Cloudflare. Fornyelseskostnaden kan føres som abonnement i FinansHub.${d.stale ? ' Viser sist hentede data (Cloudflare svarte ikke).' : ''}</span></div>`;
});

export function render() {
  pg.load(() => api('/../domains/api/cloudflare'));
  return `<div class="os-title">Dom<b>ener</b></div>${pg.html()}`;
}

export function bind(view) {
  view.addEventListener('click', (e) => { if (e.target.closest('[data-dom-settings]')) openSettings('int'); });
}

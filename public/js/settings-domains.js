// Innstillinger → Utseende → Domener → «Administrer domener»: legg til, fjern og velg statistikkilde.
import { api, esc } from './util.js';
import { store } from './store.js';

const D = (p, o) => api('/../domains/api' + p, o);
export const SRC = { cloudflare: 'Cloudflare', tunnel: 'Cloudflare Tunnel', plausible: 'Plausible', umami: 'Umami', uptime: 'Bare oppetid og SSL' };
export const HELP = {
  cloudflare: 'Lag et API-token i Cloudflare med Zone:Read, DNS:Read, Analytics:Read, Registrar:Read og Firewall Services:Read for sonen. Tomt felt bruker standard-tokenet fra Innstillinger → Integrasjoner → Cloudflare.',
  tunnel: 'Bruk samme token som over. Trafikken hentes fra sonen, filtrert på vertsnavnet (f.eks. home.kristo.no).',
  plausible: 'Lag en Stats API-nøkkel i Plausible. Gir besøkende, sider, henvisere, land og enheter. Statuskoder og sikkerhet krever Cloudflare.',
  umami: 'Oppgi adressen til Umami-instansen og en API-nøkkel. Gir besøkende, sider, henvisere, land og enheter.',
  uptime: 'Ingen token trengs. Homelab sjekker domenet hvert 5. minutt, og leser SSL-sertifikat, DNS og utløpsdato (RDAP).',
};

const S = { list: null, err: null, form: { name: '', source: 'cloudflare', url: '' }, formErr: '', msg: '', busy: false };
let rerender = () => {};

/** Domenesiden lytter på dette og henter listen på nytt. */
const changed = () => document.dispatchEvent(new CustomEvent('hl:domains'));

export const domainCount = () => S.list?.length;

export async function loadDomains(onChange) {
  if (onChange) rerender = onChange;
  try { S.list = await D('/domains'); S.err = null; } catch (e) { S.err = e.message; }
  rerender();
}

const admin = () => store.me.me?.role === 'admin';

export function domainsPane() {
  if (S.err && !S.list) return `<div class="err">${esc(S.err)}</div>`;
  if (!S.list) return '<div class="skeleton" style="min-height:160px"></div>';
  const f = S.form;
  const rows = S.list.map((d) => `<div class="sg-row"><span class="sg-ic" style="background:#1d2738;color:var(--blue)">${esc(d.name[0].toUpperCase())}</span>
      <span class="sg-txt"><b class="mono">${esc(d.name)}</b><span>${esc(SRC[d.source] ?? d.source)}${d.hasToken ? ' · eget token' : ''}${d.mock ? ' · demodata' : ''}</span></span>
      ${admin() ? `<button class="sg-pill danger" data-dom-del="${d.id}" data-name="${esc(d.name)}">Fjern</button>` : ''}</div>`).join('')
    || '<div class="sg-row"><span class="sg-txt"><span>Ingen domener ennå.</span></span></div>';
  const form = admin() ? `<form class="sg" data-dom-form>
      <div class="sg-t">Legg til domene</div>
      <div class="sg-box">
        <label class="sg-field"><span>Domene</span><input name="name" value="${esc(f.name)}" placeholder="eksempel.no" autocomplete="off" spellcheck="false" autocapitalize="off" required></label>
        <label class="sg-field"><span>Statistikk fra</span><select name="source">${Object.entries(SRC).map(([k, n]) => `<option value="${k}"${f.source === k ? ' selected' : ''}>${n}${k === 'cloudflare' ? ' (zone analytics)' : k === 'umami' ? ' (selvhostet)' : ''}</option>`).join('')}</select></label>
        ${f.source === 'uptime' ? '' : '<label class="sg-field"><span>API-token</span><input name="token" type="password" placeholder="Lagres kun på serveren" autocomplete="off"></label>'}
        ${f.source === 'umami' || f.source === 'plausible' ? `<label class="sg-field"><span>Adresse</span><input name="url" value="${esc(f.url)}" placeholder="${f.source === 'umami' ? 'https://umami.eksempel.no' : 'https://plausible.io'}" autocomplete="off" spellcheck="false"></label>` : ''}
      </div>
      <div class="sg-note">${HELP[f.source]}</div>
      <div class="sg-acts"><button class="sg-btn pri" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? 'Legger til …' : 'Legg til domene'}</button>
        <span class="red">${esc(S.formErr)}</span><span class="green">${esc(S.msg)}</span></div>
    </form>` : '<div class="sg-note">Bare administratorer kan legge til og fjerne domener.</div>';
  return `<section class="sg"><div class="sg-t">Dine domener</div><div class="sg-box">${rows}</div></section>${form}`;
}

export async function domainsClick(e) {
  const del = e.target.closest('[data-dom-del]');
  if (!del) return false;
  if (!confirm(`Fjerne ${del.dataset.name}? Statistikk og oppetidshistorikk slettes.`)) return true;
  try { await D(`/domains/${del.dataset.domDel}`, { method: 'DELETE' }); S.msg = `${del.dataset.name} er fjernet`; S.formErr = ''; changed(); } catch (err) { S.formErr = err.message; }
  await loadDomains();
  return true;
}

export function domainsChange(e) {
  const f = e.target.closest('[data-dom-form]');
  if (!f) return false;
  S.form = { name: f.elements.name.value, url: f.elements.url?.value ?? S.form.url, source: f.elements.source.value };
  if (e.target.name === 'source') rerender();
  return true;
}

export async function domainsSubmit(e) {
  const f = e.target.closest('[data-dom-form]');
  if (!f) return false;
  e.preventDefault();
  const body = { name: f.elements.name.value.trim(), source: f.elements.source.value, token: f.elements.token?.value ?? '', url: f.elements.url?.value.trim() ?? '' };
  S.busy = true; S.formErr = ''; S.msg = ''; rerender();
  try {
    const r = await D('/domains', { method: 'POST', json: body });
    S.form = { name: '', source: 'cloudflare', url: '' }; S.msg = `${r.name} er lagt til ✓`;
    changed();
  } catch (err) { S.formErr = err.message; S.form = { ...S.form, name: body.name, url: body.url, source: body.source }; }
  S.busy = false;
  await loadDomains();
  return true;
}

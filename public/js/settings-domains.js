// Innstillinger → Utseende → Domener → «Administrer domener»: legg til, fjern og velg statistikkilde.
import { api, esc, sheetBtn, haptic } from './util.js';
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

const S = { list: null, err: null, form: { name: '', source: 'cloudflare', url: '', token: '' }, formErr: '', msg: '', busy: false, guide: false, test: null };

/* Prompt 30: instruksjonene ligger bak ?-knappen ved API-token (sidepanel, mobil: fullskjerm), med skisser av Cloudflare-
   skjermene der det man skal trykke på er markert oransje. «Test token» → POST /api/domains/token/verify {token?, domain?}. */
const CF_URL = 'https://dash.cloudflare.com/profile/api-tokens';
const STEPS = [
  ['Åpne API-tokens', 'Logg inn på dash.cloudflare.com. Trykk på profilikonet øverst til høyre → «My Profile» → «API Tokens».', 'dash.cloudflare.com/profile/api-tokens', [['My Profile', ''], ['API Tokens', '', 1], ['API Keys', '']]],
  ['Lag et eget token', 'Trykk «Create Token». Bla ned til «Custom token» og trykk «Get started». Ikke bruk Global API Key.', '…/api-tokens/create', [['Edit zone DNS', 'Use template'], ['Read analytics and logs', 'Use template'], ['Custom token', 'Get started', 1]]],
  ['Gi tokenet et navn', 'Skriv for eksempel «Homelab statistikk» i «Token name».', '…/api-tokens/create', [['Token name', 'Homelab statistikk', 1]]],
  ['Legg til tillatelser', 'Under «Permissions»: trykk «+ Add more» for hver linje. Alle skal være «Read».', '…/api-tokens/create', [['Zone · Zone', 'Read', 1], ['Zone · DNS', 'Read', 1], ['Zone · Analytics', 'Read', 1], ['Zone · Firewall Services', 'Read', 1], ['Account · Registrar: Domains', 'Read', 1]]],
  ['Velg domenet', 'Under «Zone Resources»: Include → Specific zone → velg domenet ditt. Under «Account Resources»: Include → kontoen din (trengs for utløpsdato).', '…/api-tokens/create', [['Zone Resources', 'Include · Specific zone · {dom}', 1], ['Account Resources', 'Include · Din konto', 1], ['Client IP Address Filtering', '(valgfritt)'], ['TTL', '(valgfritt)']]],
  ['Opprett og kopier', 'Trykk «Continue to summary» → «Create Token». Kopier tokenet med en gang, det vises bare én gang.', '…/api-tokens/create', [['Continue to summary', ''], ['Create Token', '', 1], ['Kopier token', '••••••••••••a91F', 1]]],
];
function guideHtml() {
  if (!S.guide) return '';
  const dom = S.form.name.trim() || 'eksempel.no';
  return `<div class="cfg-guide" data-dom-gclose><div class="cfg-gp" role="dialog" aria-modal="true" aria-labelledby="cfg-gt">
    <div class="cfg-gh"><div><span class="cfg-gk">CLOUDFLARE · CA. 3 MINUTTER</span><h2 id="cfg-gt">Lag et API-token for statistikk</h2></div>${sheetBtn('Ferdig', 'data-dom-gclose', 'pri')}</div>
    <span class="cfg-glead">Tokenet gir Homelab lesetilgang til trafikk, DNS, sikkerhet og utløpsdato for domenet. Det kan ikke endre noe i Cloudflare.</span>
    <a class="cfg-gopen" href="${CF_URL}" target="_blank" rel="noopener noreferrer"><span>Åpne API-tokens i Cloudflare</span><span aria-hidden="true">↗</span></a>
    ${STEPS.map(([t, d, url, rows], i) => `<div class="cfg-st"><div class="cfg-st-h"><span class="cfg-st-n">${i + 1}</span><div><b>${esc(t)}</b><span>${esc(d)}</span></div></div>
      <div class="cfg-sk" aria-hidden="true"><div class="cfg-sk-b"><i></i><i></i><span data-no-i18n>${esc(url)}</span></div><div class="cfg-sk-in">${rows.map(([a, b, hl]) => `<div class="cfg-sk-r${hl ? ' hl' : ''}"><span data-no-i18n>${esc(a)}</span><em data-no-i18n>${esc(String(b).replace('{dom}', dom))}</em></div>`).join('')}</div></div></div>`).join('')}
    <div class="cfg-gnote">Tokenet vises bare én gang i Cloudflare. Lim det inn i feltet «API-token» og trykk «Test token». Homelab lagrer det kryptert på serveren, aldri i nettleseren.</div>
  </div></div>`;
}
function testHtml() {
  const t = S.test;
  if (!t) return '';
  if (t.busy) return '';
  const perms = Array.isArray(t.permissions) && t.permissions.length && !t.ok ? `<div class="cfg-perms">${t.permissions.map((p) => `<span class="${p.ok ? '' : 'no'}" title="${esc(p.error ?? '')}" data-no-i18n>${p.ok ? '✓' : '✕'} ${esc(p.name)}</span>`).join('')}</div>` : '';
  return `<span class="cfg-test-msg ${t.ok ? 'ok' : 'err'}" role="status">${esc(t.message)}</span>${perms}`;
}
async function testToken() {
  const token = S.form.token.trim();
  S.test = { busy: true }; rerender();
  try {
    const r = await api('/domains/token/verify', { method: 'POST', json: { token, domain: S.form.name.trim() } });
    const n = r.okCount ?? (r.permissions ?? []).filter((p) => p.ok).length, tot = r.total ?? (r.permissions ?? []).length;
    const missing = (r.permissions ?? []).filter((p) => !p.ok).map((p) => p.name);
    S.test = { ...r, message: r.message || (r.ok ? `✓ Tokenet virker · ${n} av ${tot} tillatelser` : r.active === false ? '✕ Cloudflare godtok ikke tokenet' : `Tokenet virker, men mangler ${missing.join(', ')}`) };
  } catch (e) {
    S.test = { ok: false, message: e.status === 404 ? 'Serveren kan ikke teste tokenet ennå. Oppdater Homelab.' : e.message };
  }
  rerender();
}
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
        ${f.source === 'uptime' ? '' : `<div class="sg-field cfg-tokrow"><span>API-token${f.source === 'cloudflare' || f.source === 'tunnel' ? '<button type="button" class="cfg-qbtn" data-dom-guide aria-label="Slik lager du tokenet" title="Slik lager du tokenet">?</button>' : ''}</span><input name="token" type="password" value="${esc(f.token)}" placeholder="Lagres kun på serveren" autocomplete="off" aria-label="API-token"></div>`}
        ${f.source === 'umami' || f.source === 'plausible' ? `<label class="sg-field"><span>Adresse</span><input name="url" value="${esc(f.url)}" placeholder="${f.source === 'umami' ? 'https://umami.eksempel.no' : 'https://plausible.io'}" autocomplete="off" spellcheck="false"></label>` : ''}
      </div>
      ${f.source === 'cloudflare' || f.source === 'tunnel' ? '' : `<div class="sg-note">${HELP[f.source]}</div>`}
      <div class="sg-acts"><button class="sg-btn pri" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? 'Legger til …' : 'Legg til domene'}</button>
        ${f.source === 'cloudflare' || f.source === 'tunnel' ? `<button type="button" class="sg-btn" data-dom-test${S.test?.busy ? ' disabled' : ''}>${S.test?.busy ? 'Tester …' : 'Test token'}</button>` : ''}
        <span class="red">${esc(S.formErr)}</span><span class="green">${esc(S.msg)}</span>${testHtml()}</div>
    </form>` : '<div class="sg-note">Bare administratorer kan legge til og fjerne domener.</div>';
  return `<section class="sg"><div class="sg-t">Dine domener</div><div class="sg-box">${rows}</div></section>${form}${guideHtml()}`;
}

export async function domainsClick(e) {
  if (e.target.closest('[data-dom-guide]')) { e.preventDefault(); syncForm(e.target.closest('[data-dom-form]')); S.guide = true; rerender(); return true; }
  const gc = e.target.closest('[data-dom-gclose]');
  if (gc && (e.target === gc || gc.tagName === 'BUTTON')) { e.preventDefault(); S.guide = false; haptic(8); rerender(); return true; }
  if (e.target.closest('.cfg-gp')) return !e.target.closest('a'); // klikk inne i panelet lukker det ikke
  if (e.target.closest('[data-dom-test]')) { e.preventDefault(); syncForm(e.target.closest('[data-dom-form]')); testToken(); return true; }
  const del = e.target.closest('[data-dom-del]');
  if (!del) return false;
  if (!confirm(`Fjerne ${del.dataset.name}? Statistikk og oppetidshistorikk slettes.`)) return true;
  try { await D(`/domains/${del.dataset.domDel}`, { method: 'DELETE' }); S.msg = `${del.dataset.name} er fjernet`; S.formErr = ''; changed(); } catch (err) { S.formErr = err.message; }
  await loadDomains();
  return true;
}

function syncForm(f) {
  if (!f) return;
  S.form = { name: f.elements.name.value, url: f.elements.url?.value ?? S.form.url, source: f.elements.source.value, token: f.elements.token?.value ?? S.form.token };
}
export function domainsChange(e) {
  const f = e.target.closest('[data-dom-form]');
  if (!f) return false;
  syncForm(f);
  if (e.target.name === 'token') S.test = null;
  if (e.target.name === 'source') rerender();
  return true;
}
/** Esc lukker guiden før innstillingene. */
export function domainsEsc() { if (!S.guide) return false; S.guide = false; rerender(); return true; }

export async function domainsSubmit(e) {
  const f = e.target.closest('[data-dom-form]');
  if (!f) return false;
  e.preventDefault();
  const body = { name: f.elements.name.value.trim(), source: f.elements.source.value, token: f.elements.token?.value ?? '', url: f.elements.url?.value.trim() ?? '' };
  S.busy = true; S.formErr = ''; S.msg = ''; rerender();
  try {
    const r = await D('/domains', { method: 'POST', json: body });
    S.form = { name: '', source: 'cloudflare', url: '', token: '' }; S.msg = `${r.name} er lagt til ✓`; S.test = null;
    changed();
  } catch (err) { S.formErr = err.message; S.form = { ...S.form, name: body.name, url: body.url, source: body.source, token: body.token }; }
  S.busy = false;
  await loadDomains();
  return true;
}

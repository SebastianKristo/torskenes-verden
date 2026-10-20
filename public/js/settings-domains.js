// Innstillinger → Utseende → Domener → «Administrer domener»: legg til, fjern og velg statistikkilde.
import { api, esc, sheetBtn, haptic } from './util.js';
import { store } from './store.js';

const D = (p, o) => api('/../domains/api' + p, o);
export const SRC = { cloudflare: 'Cloudflare', tunnel: 'Cloudflare Tunnel', gsc: 'Google Search Console', plausible: 'Plausible', umami: 'Umami', uptime: 'Bare oppetid og SSL' };
export const HELP = {
  cloudflare: 'Lag et API-token i Cloudflare med Zone:Read, DNS:Read, Analytics:Read, Registrar:Read og Firewall Services:Read for sonen. Tomt felt bruker standard-tokenet fra Innstillinger → Integrasjoner → Cloudflare.',
  tunnel: 'Bruk samme token som over. Trafikken hentes fra sonen, filtrert på vertsnavnet (f.eks. home.kristo.no).',
  plausible: 'Lag en Stats API-nøkkel i Plausible. Gir besøkende, sider, henvisere, land og enheter. Statuskoder og sikkerhet krever Cloudflare.',
  umami: 'Oppgi adressen til Umami-instansen og en API-nøkkel. Gir besøkende, sider, henvisere, land og enheter.',
  gsc: 'Ingen token trengs. Bruker Google-tilkoblingen over (kun lesetilgang). Gir klikk, visninger, søkeord og sider fra Google Søk. Oppetid, SSL og WHOIS kommer fra Overvåking; trafikk og DNS krever Cloudflare.',
  uptime: 'Ingen token trengs. Homelab sjekker domenet hvert 5. minutt, og leser SSL-sertifikat, DNS og utløpsdato (RDAP).',
};

const S = { gsc: null, gscErr: '', gscBusy: '', imp: null, impTab: 'gsc', list: null, err: null, form: { name: '', source: 'cloudflare', url: '', token: '' }, formErr: '', msg: '', busy: false, guide: false, test: null };

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
/* Prompt 39 (claude-code-domener-search-console.md): GOOGLE SEARCH CONSOLE i Innstillinger → Domener, med ?-guide (GSTEPS). */
const GSC_URL = 'https://search.google.com/search-console';
const GSTEPS = [
  ['Åpne Search Console og logg inn', 'Gå til search.google.com/search-console og logg inn med Google-kontoen som eier domenet.', 'search.google.com/search-console', [['Søk etter eiendom', ''], ['+ Legg til eiendom', '', 1]]],
  ['Legg til eiendom → «Domene»', 'Velg typen «Domene» (ikke «URL-prefiks») og skriv domenet uten https://, f.eks. {dom}.', '…/search-console/welcome', [['Domene', '{dom}', 1], ['URL-prefiks', '']]],
  ['Bekreft med DNS', 'Google viser en TXT-post. Legg den inn i Cloudflare → DNS → Records → Add record (Type TXT, navn @). Har Cloudflare-tokenet DNS:Edit, kan Homelab gjøre det for deg («Legg inn for meg»).', 'dash.cloudflare.com/…/dns/records', [['Type', 'TXT', 1], ['Name', '@'], ['Content', 'google-site-verification=…', 1]]],
  ['Trykk «Bekreft»', 'Tilbake i Search Console: trykk «Bekreft». Det tar fra minutter til 24 timer. TXT-posten må bli liggende.', '…/search-console', [['Bekreft', '', 1]]],
  ['Første gang: legg til omdirigering', 'Bare én gang, for den som eier Google-klienten: console.cloud.google.com → APIs & Services → Credentials → OAuth-klienten → «Authorized redirect URIs» → legg til {cb}. Slå også på «Google Search Console API» under Library. Uten dette svarer Google «Error 400: redirect_uri_mismatch».', 'console.cloud.google.com/apis/credentials', [['Authorized redirect URIs', '{cb}', 1]]],
  ['Koble til Homelab', 'Trykk «Koble til med Google» her og godta «Se Search Console-data for de bekreftede nettstedene dine».', 'accounts.google.com', [['Se Search Console-data', 'Tillat', 1]]],
  ['Velg domenene', 'Eiendommene vises i listen. Trykk «+ Legg til» eller «Bruk». De siste 16 månedene hentes i bakgrunnen.', 'home · Innstillinger · Domener', [['{dom}', '+ Legg til', 1]]],
];
function gscGuideHtml() {
  const dom = S.form.name.trim() || S.gsc?.sites?.[0]?.domain || 'eksempel.no';
  const cb = S.gsc?.redirectUri || `${location.origin}/api/gsc/callback`;
  return `<div class="cfg-guide" data-dom-gclose><div class="cfg-gp" role="dialog" aria-modal="true" aria-labelledby="cfg-gt">
    <div class="cfg-gh"><div><span class="cfg-gk">GOOGLE SEARCH CONSOLE · CA. 5 MINUTTER</span><h2 id="cfg-gt">Koble til Google Search Console</h2></div>${sheetBtn('Ferdig', 'data-dom-gclose', 'pri')}</div>
    <span class="cfg-glead">Search Console gir klikk, visninger, søkeord og sider fra Google Søk for domenene dine. Homelab får bare lesetilgang.</span>
    <a class="cfg-gopen" href="${GSC_URL}" target="_blank" rel="noopener noreferrer"><span>Åpne Search Console</span><span aria-hidden="true">↗</span></a>
    ${GSTEPS.map(([t, d, url, rows], i) => `<div class="cfg-st"><div class="cfg-st-h"><span class="cfg-st-n">${i + 1}</span><div><b>${esc(t)}</b><span>${esc(d.replace('{dom}', dom).replace('{cb}', cb))}</span></div></div>
      <div class="cfg-sk" aria-hidden="true"><div class="cfg-sk-b"><i></i><i></i><span data-no-i18n>${esc(url)}</span></div><div class="cfg-sk-in">${rows.map(([a, b, hl]) => `<div class="cfg-sk-r${hl ? ' hl' : ''}"><span data-no-i18n>${esc(String(a).replace('{dom}', dom))}</span><em data-no-i18n>${esc(String(b).replace('{dom}', dom).replace('{cb}', cb))}</em></div>`).join('')}</div></div></div>`).join('')}
    <div class="cfg-gnote">Homelab ber bare om lesetilgang (webmasters.readonly). Du kan trekke tilgangen tilbake når som helst på myaccount.google.com/permissions eller med «Koble fra» her.</div>
  </div></div>`;
}
async function loadGsc() {
  try { S.gsc = await api('/domains/gsc/sites'); S.gscErr = ''; } catch (e) { S.gsc = e.status === 404 ? { missing: true } : null; S.gscErr = e.status === 404 ? '' : e.message; }
  try { S.imp = await api('/domains/import'); } catch { S.imp = null; }
  rerender();
}
function gscHtml() {
  if (!admin()) return '';
  const G = S.gsc, q = '<button type="button" class="cfg-qbtn" data-dom-gscguide aria-label="Slik kobler du til Search Console" title="Slik kobler du til Search Console">?</button>';
  let box;
  if (!G) box = `<div class="sg-row"><span class="sg-txt"><span>${S.gscErr ? esc(S.gscErr) : 'Henter …'}</span></span></div>`;
  else if (G.missing) box = '<div class="sg-row"><span class="sg-txt"><b>Ikke tilgjengelig ennå</b><span>Serveren har ikke Search Console-oppsettet. Oppdater Homelab.</span></span></div>';
  else if (!G.connected) box = `<div class="sg-row"><span class="sg-txt"><b>Klikk, visninger og søkeord fra Google</b><span>${G.configured === false ? 'Google-appen er ikke satt opp på serveren (Integrasjoner → Google).' : 'Kun lesetilgang · webmasters.readonly'}</span></span><button type="button" class="sg-btn2 gsc39-g" data-dom-gscconnect>${GLOGO}Koble til med Google</button></div>`;
  else {
    const rows = (G.sites ?? []).map((x) => `<div class="sg-row"><span class="sg-txt"><b class="mono">${esc(x.domain)}</b><span>${esc([x.permission, (x.siteUrls ?? []).join(' · ')].filter(Boolean).join(' · '))}</span></span>
      ${x.state === 'i-bruk' ? '<span class="gsc39-on">✓ I bruk</span>' : x.state === 'bruk' ? `<button type="button" class="sg-btn2" data-dom-gscuse="${esc(x.domain)}" data-site="${esc(x.siteUrls?.[0] ?? '')}"${S.gscBusy === x.domain ? ' disabled' : ''}>Bruk</button>` : `<button type="button" class="sg-btn2" data-dom-gscadd="${esc(x.domain)}"${S.gscBusy === x.domain ? ' disabled' : ''}>${S.gscBusy === x.domain ? 'Legger til …' : '+ Legg til'}</button>`}</div>`).join('');
    box = `<div class="sg-row"><span class="sg-txt"><b>${esc(G.email || 'Google-kontoen')}</b><span>${G.count ?? (G.sites ?? []).length} ${(G.count ?? (G.sites ?? []).length) === 1 ? 'eiendom' : 'eiendommer'} · kun lesetilgang</span></span><button type="button" class="sg-pill danger" data-dom-gscoff>Koble fra</button></div>${rows || '<div class="sg-row"><span class="sg-txt"><span>Ingen eiendommer i kontoen. Trykk ? for hvordan du legger til en.</span></span></div>'}`;
  }
  return `<section class="sg"><div class="sg-t gsc39-t">Google Search Console${q}</div><div class="sg-box">${box}</div>${G?.error ? `<div class="sg-note red">${esc(G.error)}</div>` : ''}</section>${importHtml()}`;
}
/** «Hent domener» fra Search Console og Cloudflare (GET/POST /api/domains/import). */
function importHtml() {
  const I = S.imp;
  if (!I) return '';
  const tab = S.impTab, src = tab === 'gsc' ? I.gsc : I.cloudflare, items = src?.items ?? [], left = items.filter((x) => !x.added);
  const rows = !src?.connected ? `<div class="sg-row"><span class="sg-txt"><span>${tab === 'gsc' ? 'Koble til Google Search Console over for å hente eiendommene.' : 'Legg inn et Cloudflare-token (Integrasjoner → Cloudflare) for å hente sonene.'}</span></span></div>`
    : items.map((x) => `<div class="sg-row"><span class="sg-txt"><b class="mono">${esc(x.name)}</b><span>${esc(tab === 'gsc' ? x.permission ?? '' : [x.plan, x.status].filter(Boolean).join(' · '))}${(I.newInAccount ?? []).includes(x.name) && !x.added ? ' · nytt i kontoen' : ''}</span></span>${x.added ? '<span class="gsc39-on">✓ Lagt til</span>' : `<button type="button" class="sg-btn2" data-dom-imp="${esc(x.name)}">+ Legg til</button>`}</div>`).join('') || '<div class="sg-row"><span class="sg-txt"><span>Ingen domener funnet.</span></span></div>';
  return `<section class="sg"><div class="sg-t">Hent domener · fra Cloudflare og Google Search Console</div>
    <div class="gsc39-tabs" role="tablist"><button type="button" role="tab" aria-selected="${tab === 'gsc'}" class="${tab === 'gsc' ? 'on' : ''}" data-dom-imptab="gsc">Search Console</button><button type="button" role="tab" aria-selected="${tab === 'cf'}" class="${tab === 'cf' ? 'on' : ''}" data-dom-imptab="cf">Cloudflare</button></div>
    <div class="sg-box">${rows}</div>${src?.connected && left.length > 1 ? `<div class="sg-acts"><button type="button" class="sg-btn" data-dom-impall>Legg til alle ${left.length}</button></div>` : ''}</section>`;
}
const GLOGO = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

function guideHtml() {
  if (!S.guide) return '';
  if (S.guide === 'gsc') return gscGuideHtml();
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
        ${f.source === 'uptime' || f.source === 'gsc' ? '' : `<div class="sg-field cfg-tokrow"><span>API-token${f.source === 'cloudflare' || f.source === 'tunnel' ? '<button type="button" class="cfg-qbtn" data-dom-guide aria-label="Slik lager du tokenet" title="Slik lager du tokenet">?</button>' : ''}</span><input name="token" type="password" value="${esc(f.token)}" placeholder="Lagres kun på serveren" autocomplete="off" aria-label="API-token"></div>`}
        ${f.source === 'umami' || f.source === 'plausible' ? `<label class="sg-field"><span>Adresse</span><input name="url" value="${esc(f.url)}" placeholder="${f.source === 'umami' ? 'https://umami.eksempel.no' : 'https://plausible.io'}" autocomplete="off" spellcheck="false"></label>` : ''}
      </div>
      ${f.source === 'cloudflare' || f.source === 'tunnel' ? '' : `<div class="sg-note">${HELP[f.source]}</div>`}
      <div class="sg-acts"><button class="sg-btn pri" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? 'Legger til …' : 'Legg til domene'}</button>
        ${f.source === 'cloudflare' || f.source === 'tunnel' ? `<button type="button" class="sg-btn" data-dom-test${S.test?.busy ? ' disabled' : ''}>${S.test?.busy ? 'Tester …' : 'Test token'}</button>` : ''}
        <span class="red">${esc(S.formErr)}</span><span class="green">${esc(S.msg)}</span>${testHtml()}</div>
    </form>` : '<div class="sg-note">Bare administratorer kan legge til og fjerne domener.</div>';
  if (S.gsc === null && !S.gscLoading) { S.gscLoading = true; loadGsc(); }
  return `<section class="sg"><div class="sg-t">Dine domener</div><div class="sg-box">${rows}</div></section>${gscHtml()}${form}${guideHtml()}`;
}

export async function domainsClick(e) {
  if (e.target.closest('[data-dom-gscguide]')) { e.preventDefault(); S.guide = 'gsc'; rerender(); return true; }
  if (e.target.closest('[data-dom-gscconnect]')) { e.preventDefault(); location.href = `/api/gsc/auth?return=${encodeURIComponent('/#/innstillinger/domener')}`; return true; }
  if (e.target.closest('[data-dom-gscoff]')) { e.preventDefault(); if (!confirm('Koble fra Google Search Console? Tallene fra Google Søk slettes.')) return true; try { await api('/gsc', { method: 'DELETE' }); } catch (er) { S.gscErr = er.message; } await loadGsc(); return true; }
  const gu = e.target.closest('[data-dom-gscuse]');
  if (gu) { e.preventDefault(); S.gscBusy = gu.dataset.domGscuse; rerender(); try { await api('/gsc/site', { method: 'POST', json: { domain: gu.dataset.domGscuse, siteUrl: gu.dataset.site } }); changed(); } catch (er) { S.gscErr = er.message; } S.gscBusy = ''; await loadGsc(); return true; }
  const ga = e.target.closest('[data-dom-gscadd],[data-dom-imp]');
  if (ga) { e.preventDefault(); const name = ga.dataset.domGscadd ?? ga.dataset.domImp, source = ga.dataset.domGscadd || S.impTab === 'gsc' ? 'gsc' : 'cloudflare'; S.gscBusy = name; rerender(); try { await api('/domains/import', { method: 'POST', json: { source, domains: [name] } }); changed(); } catch (er) { S.gscErr = er.message; } S.gscBusy = ''; await Promise.all([loadGsc(), loadDomains()]); return true; }
  if (e.target.closest('[data-dom-impall]')) { e.preventDefault(); try { await api('/domains/import', { method: 'POST', json: { source: S.impTab === 'gsc' ? 'gsc' : 'cloudflare', domains: 'all' } }); changed(); } catch (er) { S.gscErr = er.message; } await Promise.all([loadGsc(), loadDomains()]); return true; }
  const it = e.target.closest('[data-dom-imptab]');
  if (it) { e.preventDefault(); S.impTab = it.dataset.domImptab; rerender(); return true; }
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

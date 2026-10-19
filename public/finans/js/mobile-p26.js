// Prompt 26 (PWA): Innstillinger → Kalendere, Integrasjoner som på web (gruppert liste og egen side per integrasjon),
// overstyring av sporingstjeneste, «Rediger fanelinjen» for Finans (hold inne på fanelinja) og trykk på aktiv fane
// (til fanens rot, og et nytt trykk scroller til toppen). Fasit: design/Mobil Papir App.dc.html.
// Endepunktene kommer fra serveren i samme prompt; mangler de (404) eller feltene, brukes reserver her.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { IG, integLoad24, BD, bdLoad, calCard, markCustom } from './mobile-p24.js';
import { haSection } from './mobile-p22.js';
import { carOf, normNo, detectLocal } from './mobile-track.js';
import { FT, FT_DEF, finKeys, setFinTabs } from './mobile-paper3.js';
import * as P25 from './mobile-p25.js';
import { ctxOf } from './mobile-paper.js';
import * as KAL from './mobile-kal.js';

const LS = 'fh_p26';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };

/* =====================================================================
   1. Integrasjoner: gruppert liste (#/set/integ) og egen side (#/set/integ/<id>)
   ===================================================================== */

const CATS = ['Smarthjem', 'Transport og pakker', 'Økonomi', 'AI', 'Informasjon', 'Annet'];
// Reserve når serveren ikke sender category/badge/color/description/guide ennå (samme tekster som designet og web).
const META = {
  ha: ['Smarthjem', 'HA', '#18bcf2', 'Lokal server og to-do-lister', [['Lag et token', 'Åpne profilen din i Home Assistant. Nederst: Langtidstokener → Opprett token. Kopier det med en gang, det vises bare én gang.'], ['Lim inn adresse og token', 'Adressen er den du åpner Home Assistant med, f.eks. https://home.kristo.no:8123.']]],
  calendars: ['Informasjon', '31', '#4285F4', 'Skolens iCal, Canvas, Google og HA', [['Skolens iCal', 'Visma InSchool, Canvas eller Outlook: finn «Abonner på kalender» eller «Kalenderfeed», og kopier ICS-lenken.'], ['Canvas', 'Canvas → Kalender → Kalenderfeed nederst til høyre. Lim inn lenken som Canvas-iCal.']]],
  calendar: ['Informasjon', '31', '#4285F4', 'Skolens timeplan (iCal)', [['Finn lenken', 'Canvas → Kalender → Kalenderfeed, eller Outlook → Publiser kalender → ICS.']]],
  google: ['Informasjon', 'G', '#4285F4', 'OAuth-klient for Google Kalender', [['Lag en OAuth-klient', 'console.cloud.google.com → API-er og tjenester → Legitimasjon → Opprett OAuth-klient-ID (Nettapplikasjon).'], ['Omdirigering', 'Legg inn https://<din adresse>/api/birthdays/google/callback som autorisert omdirigerings-URI.']]],
  entur: ['Transport og pakker', 'R', '#d0605a', 'Sanntid for avganger', [['Velg et navn', 'Entur krever en identifikator på formen «firma-app». Ingen nøkkel trengs.']]],
  mybring: ['Transport og pakker', 'B', '#7BC144', 'Sporing hos Posten og Bring', [['Lag nøkkel', 'Logg inn på mybring.com → Innstillinger → API. Opprett en nøkkel og kopier den.'], ['Bruker', 'API-brukeren er e-posten du logger inn med.']]],
  postnord: ['Transport og pakker', 'PN', '#00A0D6', 'Sporing hos PostNord', [['Registrer deg', 'Gratis på developer.postnord.com. Lag en app og kopier API-nøkkelen.']]],
  parcelsapp: ['Transport og pakker', 'PA', '#4B5BD6', 'Reserve for alle transportører', [['Hent nøkkel', 'parcelsapp.com → API → Dashboard. Gratisnivået holder for vanlig bruk.']]],
  t212: ['Økonomi', 'T', '#13a37f', 'Aksjer og kontoer', null],
  bank: ['Økonomi', 'BK', '#2b5d8a', 'Banker og filimport', null],
  imap: ['Økonomi', '@', '#6d4aff', 'IMAP eller Proton Mail Bridge', [['Lag app-passord', 'Gmail: Google-konto → Sikkerhet → App-passord. Proton: bruk Bridge-passordet fra Proton Mail Bridge.'], ['Videresend', 'Send kvitteringer til mottaksadressen, eller la Homelab lese en egen mappe.']]],
  finn: ['Økonomi', 'F', '#0063FB', 'Varsler og handler', [['Varsler', 'Lagre søk på Finn med varsel til e-postadressen over.']]],
  ai: ['AI', 'G', '#4b6cf0', 'AI-tolkning av kvitteringer og søk', null],
  cloudflare: ['Informasjon', 'CF', '#F38020', 'Domener, trafikk og oppetid', [['Lag token', 'dash.cloudflare.com → Min profil → API-tokener → Opprett. Velg malen «Les analyser» for alle soner.'], ['Konto-ID', 'Står i høyre kolonne på oversikten for et domene.']]],
  met: ['Informasjon', 'Yr', '#1f8fd6', 'Værvarsel', [['Identifiser deg', 'MET krever en User-Agent med kontaktinfo. Ingen nøkkel.']]],
  map: ['Informasjon', '◎', '#3f7a6e', 'Kartverket, MapTiler og Stadia', null],
  icons: ['Annet', '✦', '#5b6478', 'Iconify via Homelab-cache', null],
  photos: ['Annet', '▣', '#6b5a3a', 'Bakgrunnsbilder fra Unsplash og Pexels', null],
  plex: ['Annet', 'PX', '#e5a00d', 'Spilles nå og historikk', null], jellyfin: ['Annet', 'JF', '#7b4fd6', 'Spilles nå og historikk', null],
  sonarr: ['Annet', 'SO', '#2f9fd6', 'Serier som kommer', null], radarr: ['Annet', 'RA', '#d8a21a', 'Filmer som kommer', null],
};
// Integrasjoner med egen side i appen (som i designet: Kalendere, Trading 212, Bankimport og Gemini).
const OWN = { calendars: '#/set/kal', t212: '#/set/t212', bank: '#/set/bank', ai: '#/set/fai' };
const meta = (g) => { const d = META[g.id] ?? []; return { cat: CATS.includes(g.category) ? g.category : d[0] ?? 'Annet', badge: g.badge ?? d[1] ?? String(g.name ?? '?').slice(0, 2), color: g.color ?? d[2] ?? '#5b6478', desc: g.description ?? d[3] ?? g.group ?? '', guide: Array.isArray(g.guide) ? g.guide : d[4] ?? null }; };
const okOf = (g) => g.status === 'ok' || g.statusText === 'Tilkoblet';
const stText = (g) => g.statusText ?? (g.status === 'ok' ? 'Tilkoblet' : g.status === 'error' ? 'Feil' : (g.fields ?? []).some((f) => f.required && !f.saved && !f.value) ? 'Mangler API-nøkkel' : 'Ikke satt opp');
const badge = (b, c) => `<span class="p26-bd" style="background:${esc(c)}">${esc(b)}</span>`;
// Prompt 32 (claude-code-integrasjoner-logoer.md): tjenestens ekte logo i en hvit rute (34×34, radius 10), hentet én gang og
// cachet på Homelab (/finans/api/logo/<domene>). Bokstavmerket ligger under til logoen er lastet, og blir stående hvis den feiler.
const ILOGO = { ha: 'home-assistant.io', calendars: 'calendar.google.com', calendar: 'calendar.google.com', google: 'calendar.google.com', entur: 'entur.no', mybring: 'bring.no', bring: 'bring.no', postnord: 'postnord.no', parcelsapp: 'parcelsapp.com', t212: 'trading212.com', imap: 'proton.me', email: 'proton.me', finn: 'finn.no', ai: 'gemini.google.com', gemini: 'gemini.google.com', cloudflare: 'cloudflare.com', met: '@yr', map: 'kartverket.no', icons: 'iconify.design', plex: 'plex.tv', jellyfin: 'jellyfin.org', sonarr: 'sonarr.tv', radarr: 'radarr.video' };
const ibadge = (id, b, c) => {
  const d = ILOGO[id];
  if (!d) return badge(b, c);
  const yr = d === '@yr', src = yr ? '/assets/brands/yr.png' : `/finans/api/logo/${d}`;
  return `<span class="p32-ilg${yr ? ' full' : ''}">${badge(b, c)}<img class="p32-li" src="${src}" alt="" loading="lazy" decoding="async"></span>`;
};
const isAdmin = () => m.me?.role === 'admin' || m.me?.isMainAdmin === true;
const lbl = (t) => `<span class="pp-lab p26-gl">${esc(t)}</span>`;
const row = (attrs, inner) => `<${attrs.startsWith('href') ? `a class="p26-r" ${attrs}` : `button class="p26-r" ${attrs}`}>${inner}</${attrs.startsWith('href') ? 'a' : 'button'}>`;

function integList() {
  const L0 = (IG.list ?? []).filter((g) => !g.hidden);
  const groups = CATS.map((c) => [c, L0.filter((g) => meta(g).cat === c)]).filter(([, x]) => x.length);
  return groups.map(([c, list]) => `${lbl(c.toUpperCase())}<div class="p26-card">${list.map((g) => {
    const M = meta(g), own = OWN[g.id], ok = okOf(g);
    const st = g.id === 'calendars' ? calStatus(g) : [stText(g), ok];
    return row(`href="${own ? OWN[g.id] : `#/set/integ/${encodeURIComponent(g.id)}`}" id="ig-${esc(g.id)}" data-set="integ:${esc(g.id)}"`, `${ibadge(g.id, M.badge, M.color)}<span class="m-grow p26-rt"><b>${esc(g.name)}</b><span>${esc(M.desc)}${g.scope === 'server' ? ' · server' : ''}</span></span><span class="p26-v ${st[1] ? 'pos' : 'lab'}">${esc(st[0])}</span><span class="p26-ch" aria-hidden="true">›</span>`);
  }).join('')}</div>`).join('');
}
// Kalendere: «Google + HA», «Skole-iCal» eller «Ikke koblet».
function calStatus(g) {
  const gOn = !!BD.d?.google?.connected, hOn = !!BD.d?.ha?.entityId, ics = (g?.fields ?? []).some((f) => f.saved || f.value);
  const parts = [ics ? 'iCal' : '', gOn ? 'Google' : '', hOn ? 'HA' : ''].filter(Boolean);
  return parts.length ? [parts.join(' + '), true] : ['Ikke koblet', false];
}
function fieldRows(g) {
  return (g.fields ?? []).map((f) => {
    const k = `${g.id}:${f.key}`, open = IG.open === k, set = f.saved || !!f.value;
    const val = f.type === 'secret' ? (f.saved ? '•••• lagret' : 'Ikke satt') : f.value ? String(f.value) : f.saved ? 'Lagret' : 'Ikke satt';
    return `<button class="p26-r" data-p24="igf" data-k="${esc(k)}" aria-expanded="${open}"><span class="m-grow p26-rt"><b>${esc(f.label)}</b>${f.help && !open ? `<span>${esc(f.help)}</span>` : ''}</span><span class="p26-v ${set ? 'ink' : 'lab'} p26-mono">${esc(val)}</span><span class="p26-ch" aria-hidden="true">${open ? '⌄' : '›'}</span></button>
      ${open ? `<form class="p26-ed" data-p24form="igsave" data-id="${esc(g.id)}" data-key="${esc(f.key)}"><input name="v" type="${f.type === 'secret' ? 'password' : f.type === 'url' ? 'url' : 'text'}" value="${esc(IG.f[k] ?? (f.type === 'secret' ? '' : f.value ?? ''))}" data-p24in="igv" data-k="${esc(k)}" placeholder="${esc(f.type === 'secret' ? (f.saved ? '•••• lagret – skriv for å bytte' : 'Lim inn nøkkelen') : f.label)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        ${f.help ? `<span class="p26-help">${esc(f.help)}</span>` : ''}<div class="p26-two"><button type="button" data-p24="igx">Avbryt</button><button type="submit" class="ink" ${IG.busy === k ? 'disabled' : ''}>${IG.busy === k ? 'Lagrer …' : 'Lagre'}</button></div>
        ${set ? `<button type="button" class="p26-clr" data-p24="igdel" data-id="${esc(g.id)}" data-key="${esc(f.key)}">Fjern verdi</button>` : ''}</form>` : ''}`;
  }).join('');
}
const guideRows = (G) => G.map((x, i) => { const [t, s] = Array.isArray(x) ? x : typeof x === 'object' ? [x.title ?? x.t ?? '', x.text ?? x.body ?? x.s ?? ''] : ['', String(x)]; const code = typeof x === 'object' && !Array.isArray(x) ? x.code : null; return `<div class="p26-r st">${badge(String(x?.n ?? i + 1), 'var(--pp-ink)').replace('p26-bd', 'p26-bd num')}<span class="m-grow p26-rt">${t ? `<b>${esc(t)}</b>` : ''}${s ? `<span>${esc(s)}</span>` : ''}${code ? `<code class="p26-code">${esc(code)}</code>` : ''}</span></div>`; }).join('');
const IG26 = { arm: null };
function integOne(id) {
  const g = (IG.list ?? []).find((x) => x.id === id);
  if (!g) return `<div class="p26-card"><div class="p26-r"><span class="m-grow p26-rt"><b>Fant ikke integrasjonen</b><span>Den kan være fjernet, eller bare tilgjengelig for administrator.</span></span></div></div><a class="pp-btn" href="#/set/integ" style="align-self:flex-start">‹ Integrasjoner</a>`;
  const M = meta(g), ok = okOf(g), t = IG.test[g.id], any = (g.fields ?? []).some((f) => f.saved || f.value);
  return `<div class="p26-card"><div class="p26-r top">${ibadge(g.id, M.badge, M.color)}<span class="m-grow p26-rt"><b>${esc(g.name)}</b><span>${esc(M.desc)}</span></span><span class="p26-v ${ok ? 'pos' : 'lab'}">${esc(stText(g))}</span></div></div>
    ${(g.fields ?? []).length ? `${lbl('OPPSETT')}<div class="p26-card">${fieldRows(g)}</div>` : ''}
    ${g.id === 'calendars' || g.id === 'calendar' ? `<div class="p26-card">${row('href="#/set/kal"', `<span class="m-grow p26-rt"><b>Google Kalender og Home Assistant</b><span>Logg inn, velg kalender og synk</span></span><span class="p26-v mut">Kalendere</span><span class="p26-ch">›</span>`)}</div>` : ''}
    ${g.id === 'ha' ? haSection() : ''}
    ${M.guide?.length ? `${lbl('SLIK GJØR DU')}<div class="p26-card">${guideRows(M.guide)}</div>` : ''}
    <div class="p26-card">${g.canTest !== false ? `<button class="p26-r" data-p24="igtest" data-id="${esc(g.id)}"><span class="m-grow p26-rt"><b>Test tilkobling</b>${t ? `<span class="${/^✕/.test(t) ? 'lab' : 'pos'}">${esc(t)}</span>` : ''}</span></button>` : ''}
      <button class="p26-r" data-p26="igclr" data-id="${esc(g.id)}" ${any ? '' : 'disabled'}><span class="m-grow p26-rt"><b class="${IG26.arm === g.id ? 'lab' : ''}">${IG26.arm === g.id ? 'Trykk igjen for å fjerne alle verdier' : 'Fjern alle verdier'}</b></span></button></div>
    <span class="p26-note">Hemmelige verdier lagres kryptert på serveren og vises bare som «•••• lagret».${g.scope === 'server' ? ' Denne integrasjonen er felles for alle brukere.' : ' Bare du ser og bruker disse verdiene.'}</span>`;
}
/** Innstillinger → Integrasjoner (og undersiden for én integrasjon). old = eldre side når serveren mangler endepunktet. */
export function integPage26(old, sub = '') {
  if (IG.miss) return old;
  if (!IG.list) { if (!IG.t) integLoad24().then(draw).catch(() => {}); return IG.err ? `<div class="snote" style="color:var(--pp-lab)">${esc(IG.err)}</div>` : '<div class="m-spin"></div>'; }
  if (!BD.d && !BD.t) bdLoad().then(draw).catch(() => {});
  const id = decodeURIComponent(String(sub || ''));
  if (id) return `<div class="p26">${integOne(id)}</div>`;
  return `<div class="p26">${integList() || '<div class="snote">Ingen integrasjoner.</div>'}${IG.err ? `<div class="snote" style="color:var(--pp-lab)">${esc(IG.err)}</div>` : ''}
    <span class="p26-note">Grønn betyr tilkoblet, rød at noe mangler. Trykk på en integrasjon for oppsett, veiledning og test.</span></div>`;
}
async function clearAll(id) {
  const g = (IG.list ?? []).find((x) => x.id === id);
  if (!g) return;
  if (IG26.arm !== id) { IG26.arm = id; haptic('err'); draw(); setTimeout(() => { if (IG26.arm === id) { IG26.arm = null; draw(); } }, 2500); return; }
  IG26.arm = null;
  try { for (const f of g.fields ?? []) if (f.saved || f.value) await hlApi(`/integrations/${encodeURIComponent(id)}/${encodeURIComponent(f.key)}`, { method: 'DELETE' }); flash(`${g.name} er nullstilt`); }
  catch (e) { flash(e.message); }
  await integLoad24(true); draw();
}

/* =====================================================================
   2. Innstillinger → Kalendere (#/set/kal): Skole-iCal og Canvas, Google Kalender og Home Assistant
   ===================================================================== */

export function kalSetPage() {
  if (!BD.d && !BD.t) bdLoad().then(draw).catch(() => {});
  if (!IG.list && !IG.t && !IG.miss) integLoad24().then(draw).catch(() => {});
  const g = (IG.list ?? []).find((x) => x.id === 'calendars') ?? (IG.list ?? []).find((x) => x.id === 'calendar');
  const school = g ? `${lbl('SKOLE OG CANVAS')}<div class="p26-card">${fieldRows(g)}</div>` : IG.miss ? '' : IG.list ? '' : '<div class="m-spin"></div>';
  return `<div class="p26">${school}${BD.d ? calCard() : BD.err ? `<div class="snote" style="color:var(--pp-lab)">${esc(BD.err)}</div>` : '<div class="m-spin"></div>'}
    <div class="p26-card">${row('href="#/kal"', '<span class="m-grow p26-rt"><b>Kalender</b><span>Timeplan, prøver og frister</span></span><span class="p26-ch">›</span>')}${row('href="#/bd"', '<span class="m-grow p26-rt"><b>Bursdager</b><span>Vises i Kalender og på Hjem</span></span><span class="p26-ch">›</span>')}</div></div>`;
}
/** Lenkeraden nederst på Bursdager (KALENDERE-kortet ligger nå under Innstillinger → Kalendere). */
export function bdCalLink() {
  const G = BD.d?.google ?? {}, H = BD.d?.ha ?? {};
  const s = `${G.connected ? `Google: ${G.email ?? 'tilkoblet'}` : 'Google ikke koblet'} · ${H.entityId ? `HA: ${H.entityId}` : 'Home Assistant ikke importert'}`;
  return `<a class="k26-link" href="#/set/kal"><span class="m-grow" style="min-width:0"><b>Kalendere</b><span>${esc(s)}</span></span><span class="k26-lk">Innstillinger ›</span></a>`;
}

/* =====================================================================
   3. Sporing: overstyr transportøren (ny pakke og SPOR VIA for én valgt pakke)
   ===================================================================== */

export const CARS = [['posten', 'Posten'], ['bring', 'Bring'], ['postnord', 'PostNord'], ['dhl', 'DHL'], ['helthjem', 'Helthjem'], ['ups', 'UPS'], ['budbee', 'Budbee'], ['instabox', 'Instabox'], ['parcelsapp', 'ParcelsApp']];
export const carN = (id) => CARS.find(([k]) => k === id)?.[1] ?? carOf(id).name;
// Lokal kopi av overstyringene (brukes også når serveren ikke har carrierOverride ennå).
const ovrL = () => L.tk ?? {};
/** Overstyrt transportør for en pakke, eller null (automatisk). */
export const ovrOf = (p) => (p && 'carrierOverride' in p ? p.carrierOverride ?? null : ovrL()[normNo(p?.trackingNo)] ?? null);
/** Gjenkjent transportør (uten overstyring). */
export const detOf = (p) => p?.carrierDetected ?? (p && !('carrierOverride' in p) ? p.carrier : null) ?? detectLocal(normNo(p?.trackingNo));
/** Pakken slik den vises: logo, lenke og navn følger valget. */
export function shown(p) {
  const o = ovrOf(p);
  if (!o || o === p.carrier) return p;
  return { ...p, carrier: o, carrierLogo: null, url: null, logo: p.logo?.kind === 'shop' ? p.logo : null };
}
/** «Bring · valgt» i underteksten. */
export const carLabel = (p) => p.carrierLabel ?? (ovrOf(p) ? `${carN(ovrOf(p))} · valgt` : carN(p.carrier));
/** Valgene under sporingsnummeret ved ny pakke: «✦ Auto · Bring», Posten, Bring … */
export function addCars(nv, pick, attr) {
  const no = normNo(nv), g = no.length >= 6 ? detectLocal(no) : null;
  const opts = [['', `✦ Auto${g && g !== 'other' ? ` · ${carN(g)}` : ''}`], ...CARS];
  return `<div class="p26-cars" role="radiogroup" aria-label="Transportør">${opts.map(([k, n]) => `<button type="button" class="p26-car${(pick || '') === k ? ' on' : ''}" ${attr} data-k="${k}" role="radio" aria-checked="${(pick || '') === k}">${esc(n)}</button>`).join('')}</div>
    <span class="p26-note">${pick ? `Spores via ${esc(carN(pick))} i stedet for automatisk gjenkjenning.` : '✦ Transportøren gjenkjennes ut fra nummeret. Velg selv hvis den tar feil.'}</span>`;
}
/** Oppdaterer «✦ Auto · …» mens nummeret skrives (uten å tegne siden på nytt). */
export function refreshAuto(nv) {
  const no = normNo(nv), g = no.length >= 6 ? detectLocal(no) : null;
  document.querySelectorAll('.p26-car[data-k=""]').forEach((b) => { if (!b.classList.contains('inv')) b.textContent = `✦ Auto${g && g !== 'other' ? ` · ${carN(g)}` : ''}`; });
}
/** SPOR VIA (én valgt pakke): Auto (…) og alle tjenestene. */
export function sporVia(p) {
  if (!p) return '';
  const o = ovrOf(p), g = detOf(p);
  const opts = [['', `Auto (${p.carrierDetectedName ?? carN(g && g !== 'other' ? g : p.carrier)})`], ...CARS];
  return `<div class="p26-via"><span class="k">SPOR VIA</span><div class="p26-cars wrap">${opts.map(([k, n]) => { const on = k ? o === k : !o; return `<button class="p26-car inv${on ? ' on' : ''}" data-p26="via" data-id="${esc(p.id)}" data-k="${k}" aria-pressed="${on}">${esc(n)}</button>`; }).join('')}</div></div>`;
}
/** POST /api/tracking: carrier (gjenkjent eller valgt) og carrierOverride (null = auto). */
export const addBody = (no, pick) => ({ trackingNo: no, carrier: pick || detectLocal(no), carrierOverride: pick || null });
export function noteAdded(no, pick) { if (!pick) return; L.tk = { ...ovrL(), [no]: pick }; keep(); }
async function setVia(p, k, reload) {
  const no = normNo(p.trackingNo), v = k || null;
  L.tk = { ...ovrL() }; if (v) L.tk[no] = v; else delete L.tk[no]; keep();
  if ('carrierOverride' in p) p.carrierOverride = v;
  haptic('tab'); draw();
  try { await hlApi(`/tracking/${encodeURIComponent(p.id)}`, { method: 'PATCH', json: { carrierOverride: v } }); }
  catch (e) { if (e.status !== 404 && e.status !== 400) { flash(e.message); return; } }
  flash(`Spores nå via ${carN(v || detOf(p))}`);
  await reload?.().catch(() => {}); draw();
}

/* =====================================================================
   4. Finans → «Rediger fanelinjen» (hold inne på fanelinja i Finans)
   ===================================================================== */

const FIN_ICONS = ['⌂', 'kr', '◐', '▣', '◎', '▶', '↻', '⌕', '☼', '¶', '★', '●', '◆', '♪', '✉', '⚑', '≡', '⇄', '◔', '▢', '↗', '▤', '✦', '♥'];
export const FE = { open: false, ic: null, lp: null, lpFired: false };
const finLbl = () => L.fin ?? {};
/** [rute, navn, ikon] for en Finans-fane med egne navn og ikoner. */
export function finTab(k, def) { const o = finLbl()[k] ?? {}; return def ? [def[0], o.label || def[1], o.icon || def[2]] : null; }
/** Fra GET /api/me/layout: finNav som [{key, label?, icon?}] eller liste med nøkler. */
export function take26(r) {
  if (!r) return;
  KAL.takeKal(r);
  const FN = Array.isArray(r.finNavItems) && r.finNavItems.length ? r.finNavItems : r.finNav;
  if (Array.isArray(FN) && FN.length) {
    const it = FN.map((x) => (typeof x === 'string' ? { key: x } : x)).filter((x) => x && FT[x.key] && x.key !== 'mer').slice(0, 5);
    if (it.length) {
      setFinTabs(it.map((x) => x.key), false);
      if (FN.some((x) => typeof x === 'object')) { L.fin = Object.fromEntries(it.filter((x) => x.label || x.icon).map((x) => [x.key, { ...(x.label ? { label: x.label } : {}), ...(x.icon ? { icon: x.icon } : {}) }])); keep(); }
    }
  }
}
let feT = null;
function feSave(keys) {
  setFinTabs(keys, false); keep();
  markCustom({ finTabs: keys });
  clearTimeout(feT);
  feT = setTimeout(async () => {
    const lb = finLbl(), objs = keys.map((k) => ({ key: k, ...(lb[k]?.label ? { label: lb[k].label } : {}), ...(lb[k]?.icon ? { icon: lb[k].icon } : {}) }));
    try { await hlApi('/me/layout', { method: 'PUT', json: { finNav: objs } }); }
    catch (e) { if (e.status === 400) await hlApi('/me/layout', { method: 'PUT', json: keys.length <= 4 ? { finTabs: keys } : { finNav: keys } }).catch(() => {}); }
  }, 400);
}
export function feSheet() {
  if (!FE.open) return '';
  const cur = finKeys(), lb = finLbl();
  const rows = cur.map((k, i) => {
    const [, dn, di] = FT[k], o = lb[k] ?? {}, ic = o.icon || di;
    return `<div class="p26-fr"><div class="p26-frr"><button class="p26-fic${FE.ic === i ? ' on' : ''}" data-p26="feic" data-i="${i}" aria-label="Velg ikon for ${esc(o.label || dn)}">${esc(ic)}</button>
      <input class="p26-fin" data-p26in="fen" data-k="${k}" value="${esc(o.label ?? '')}" placeholder="${esc(dn)}" maxlength="14" aria-label="Navn på ${esc(dn)}">
      <button class="p26-fb" data-p26="feup" data-i="${i}" aria-label="Flytt ${esc(dn)} til venstre" style="opacity:${i ? 1 : 0.3}">↑</button><button class="p26-fb rm" data-p26="ferm" data-i="${i}" aria-label="Fjern ${esc(dn)}" style="opacity:${cur.length > 1 ? 1 : 0.3}">−</button></div>
      ${FE.ic === i ? `<div class="p26-icg">${FIN_ICONS.map((g) => `<button class="${ic === g ? 'on' : ''}" data-p26="feset" data-i="${i}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}</div>`;
  }).join('');
  const adds = Object.keys(FT).filter((k) => !cur.includes(k));
  const pv = [...cur.map((k) => finTab(k, FT[k])), ['fmer', 'Mer', '⋯']].map(([r, n, ic]) => [r, n, ic]);
  return `<div class="sheet-bg" data-p26="fex"></div><div class="pp-sheet p26-fe" role="dialog" aria-label="Rediger fanelinjen"><span class="pp-grab"></span>
    <div class="p26-feh"><div><span class="pp-lab">FINANS · FANELINJE</span><b class="pp-serif">Rediger fanelinjen</b></div><button type="button" class="p30-sb p30-pri" data-p26="fex">Ferdig</button></div>
    <span class="pp-mut" style="font-size:12.5px">${cur.length} av 5 faner · Mer ligger alltid sist</span>
    <div class="p26-frs">${rows}</div>
    ${P25.styleSection(pv)}
    ${adds.length ? `<span class="pp-lab mut p26-fl">LEGG TIL</span><div class="p26-adds">${adds.map((k) => `<button data-p26="feadd" data-k="${k}"><span>${esc(FT[k][2])}</span>+ ${esc(FT[k][1])}</button>`).join('')}</div>` : ''}
    <button class="p26-reset" data-p26="fereset">Tilbakestill til standard</button></div>`;
}
const finNavEl = (t) => t?.closest?.('.m.papir .pp-nav[data-ctx="fin"]');
function finDown(e) {
  FE.lpFired = false;
  if ((e.button ?? 0) > 0 || FE.open) return;
  const nav = finNavEl(e.target);
  if (!nav || e.target.closest('[data-ppplus], .p25-home')) return;
  FE.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { FE.lp = null; FE.lpFired = true; FE.open = true; FE.ic = null; haptic('ok'); navigator.vibrate?.(20); draw(); }, 550) };
}

/* =====================================================================
   5. Trykk på aktiv fane: til fanens rot, deretter til toppen
   ===================================================================== */

function toTop() {
  const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  window.scrollTo({ top: 0, behavior: smooth });
  document.querySelectorAll('#app .m-scroll, #app .m-detail').forEach((el) => { if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: smooth }); });
}
// Tilstander inne på en side som ikke ligger i adressen (transaksjonsdetalj, redigering, kvittering, detaljkort).
function atRoot() { return !(m.detail || m.edit || m.pdet || m.rc || KAL.K.sel || BD.sel || BD.add); }
function toRoot() { m.detail = false; m.edit = null; m.pdet = null; m.rc = null; KAL.K.sel = null; KAL.K.off = 0; BD.sel = null; BD.add = false; }
function activeTab(e, t) {
  const a = t.closest?.('a[data-tab], button[data-tab]');
  if (!a || !a.closest('.pp-nav, .tabs, .navbar, .rail')) return false;
  if (a.getAttribute('aria-current') !== 'page' && !a.classList.contains('on')) return false;
  const target = String(a.getAttribute('href') ?? `#/${a.dataset.tab}`).replace(/^#\/?/, ''), cur = location.hash.replace(/^#\/?/, '').split('?')[0];
  e.preventDefault(); haptic('tab');
  // På en underside av fanen (Mer → Bursdager, Finans → Mer → Kvitteringer …): tilbake til fanens rot.
  if (cur !== target) { toRoot(); location.hash = `#/${target}`; return true; }
  if (!atRoot()) { toRoot(); draw(); toTop(); return true; }
  toTop(); return true;
}

/* =====================================================================
   Oppstart, ark, pekere og klikk
   ===================================================================== */

export function boot26() { KAL.kalBoot(); }
export const sheets26 = () => (ctxOf(m.screen) === 'fin' ? feSheet() : (FE.open = false, ''));
export function down26(e) { finDown(e); KAL.kalDown(e); }
export function move26(e) { if (FE.lp && (Math.abs(e.clientX - FE.lp.x) > 10 || Math.abs(e.clientY - FE.lp.y) > 10)) { clearTimeout(FE.lp.t); FE.lp = null; } KAL.kalMove(e); }
export function up26(e) { if (FE.lp) { clearTimeout(FE.lp.t); FE.lp = null; } KAL.kalUp(e); }
/** Ny skjerm: lukk rediger-modus i Kalender og arket for fanelinja. */
export function leave26() { KAL.kalLeave(); FE.open = false; IG26.arm = null; }

/** Feltene i arket (navn på Finans-faner). Synkron, så input-hendelsen kan stoppes her. */
export function input26(e, t) {
  {
    if (t.dataset?.p26in === 'fen') { const k = t.dataset.k, v = t.value.trim(), o = { ...(finLbl()[k] ?? {}) }; if (v) o.label = v; else delete o.label; L.fin = { ...finLbl(), [k]: o }; keep(); feSave(finKeys()); return true; }
    return false;
  }
}
export async function bind26(e, t, ctx = {}) {
  if (e.type !== 'click') return false;
  // Klikket etter et langt trykk på fanelinja åpner ikke fanen (flagget nullstilles ved neste pointerdown).
  if (FE.lpFired) { FE.lpFired = false; e.preventDefault(); e.stopPropagation(); return true; }
  if (await KAL.kalBind(e, t)) return true;
  const x = t.closest?.('[data-p26]');
  if (!x) return activeTab(e, t);
  e.preventDefault();
  const k = x.dataset.p26, cur = finKeys();
  switch (k) {
    case 'igclr': await clearAll(x.dataset.id); return true;
    case 'via': { const p = (ctx.items?.() ?? []).find((y) => String(y.id) === x.dataset.id); if (p) await setVia(p, x.dataset.k, ctx.reload); return true; }
    case 'fex': FE.open = false; FE.ic = null; haptic('ok'); draw(); return true;
    case 'feic': FE.ic = FE.ic === +x.dataset.i ? null : +x.dataset.i; draw(); return true;
    case 'feset': { const key = cur[+x.dataset.i]; L.fin = { ...finLbl(), [key]: { ...(finLbl()[key] ?? {}), icon: x.dataset.g } }; FE.ic = null; feSave(cur); haptic('tab'); draw(); return true; }
    case 'feup': { const i = +x.dataset.i; if (!i) return true; const v = [...cur]; [v[i - 1], v[i]] = [v[i], v[i - 1]]; feSave(v); haptic('tab'); draw(); return true; }
    case 'ferm': { if (cur.length <= 1) return true; feSave(cur.filter((_, j) => j !== +x.dataset.i)); FE.ic = null; haptic('tap'); draw(); return true; }
    case 'feadd': { if (cur.length >= 5) { flash('Maks 5 faner. Fjern en først.'); haptic('err'); return true; } feSave([...cur, x.dataset.k]); haptic('tab'); draw(); return true; }
    case 'fereset': L.fin = {}; keep(); FE.ic = null; feSave([...FT_DEF]); flash('Fanelinja i Finans er tilbakestilt'); draw(); return true;
    default: return false;
  }
}

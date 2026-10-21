// Innstillinger: sidemeny med profil, søk og grupper (Generelt, Tilkoblinger, Sikkerhet). Innholdet er seksjoner
// med overskrift over et innrammet kort; radene har tekst til venstre, verdi til høyre og en knapp eller bryter.
import { esc, api, cssUrl, logoImg, initials, backdropClick } from './util.js';
import { store, emit, load } from './store.js';
import { applyBackground } from './background.js';
import { logout } from './usercache.js';
import { BG_TYPES, PLANETS, FALLBACK_GRAD, bgState, saveBg, resolveBg, cachedBg, creditOf, typeToLegacy } from './bgsvc.js';
import { SEARCH_STYLES, GWORD, renderTicker, applyTicker, menuLabels, loadHistory, searchState, setHistory } from './extras.js';
import { DASH_WIDGETS, MOBILE_WIDGETS, TABS as NAV_TABS, FIXED_TABS, hiddenWidgets, hiddenTabs, tabAllowed, saveLayout, applyNav } from './profile.js';
import { orderOf, setOrder } from './dnd.js';
import { toggleHeadEdit, resetHead, setHeadLock, setHeadAlign, headAlign, saveUi } from './topedit.js';
import { loginView, loadLogin, loginClick, loginSubmit, loginChange, loginData, roleName } from './settings-login.js';
import { domainsPane, loadDomains, domainsClick, domainsChange, domainsSubmit, domainCount, domainsEsc } from './settings-domains.js';
import { loadNotify, notifyView, notifyClick, notifyChange, notifyInput } from './settings-notify.js';
import { loadFam42, fam42View, fam42Click, fam42Change } from './settings-familie42.js'; // prompt 42: Familie → Helse (Familie)
import { loadApp, appView, appClick, appInput, appKey } from './settings-app.js';
import { loadInteg, integRows, integSub, integClick, integChange, integCount } from './settings-integ.js';
import { mediaRows43, mediaNote43, isMedia43, cfgStatus43, cfgGuide43, mediaSub43, mediaClick43, mediaSubmit43 } from './settings-integ43.js'; // prompt 43: MEDIA-gruppen
import { myProfile, profilesLoaded, hasProfiles, loadProfiles } from './onboard37.js'; // prompt 37: profil i husstanden
import { loadTrackKeys, trackGroup, trackSub, trackClick, trackChange } from './settings-track37.js'; // prompt 37: delte sporingsnøkler
import { themeCards, setHlTheme, hlTheme, THEMES, uploadCustomPhoto } from './hltheme.js';
import { mountHa } from './tasks-ha.js';
import { kalView, kalClick, kalChange } from './settings-kal.js';
import { loadAi, aiView, aiClick, aiChange, aiSubmit, setAiTab } from './settings-ai.js';
import { clearBtn, glassIcon } from './searchfield.js';
import { loadSystem, systemView, systemClick, systemInput, systemSubmit, systemEsc } from './settings-system.js';
import { loadBackup, backupView, backupClick, backupChange, backupInput, backupSubmit, backupEsc } from './settings-backup.js';
import { decorateRows } from './settings-icons36.js';
import { kontoAvatar, avatarRow } from './avatar36.js'; // prompt 36: profilbilde i Konto // prompt 36: ikon på hver rad
import { TAB_IC, icBox, loadIndex, sideResults, wantsAi, ask, resetAsk, byId, routeOf, topHit, SQ, ANCHORS, anchorOf, anchorFor, routeForAnchor } from './settings-search.js';
import { sheetBtn } from './util.js';
import { loadServer41, serverGroup41 } from './settings-server41.js'; // prompt 41: Konto → Server (lokal/ekstern adresse)
import { glimtSettingsHtml, loadGlimt, glimtClick, glimtChange, glimtSubmit } from './glimt35.js'; // prompt 35: GLIMT → Glimt

const modal = () => document.getElementById('settings');

/* ---------- Ikoner ---------- */

const P = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', look: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18',
  top: 'M4 4h16v5H4zM4 13h7v7H4zM15 13h5v7h-5z', map: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', out: 'M9 4H5v16h4M14 8l4 4-4 4M18 12H9', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  back: 'M15 18l-6-6 6-6', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', ai: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0', app: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
  sys: 'M4 5h16v10H4zM8 19h8M12 15v4M12 7.5v5M9.5 10l2.5 2.5 2.5-2.5',
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
  backup: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
};
export const svg = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

/* ---------- Byggeklosser ---------- */

/**
 * Én rad. Varianter: go (åpner underside, viser knappen btn), act (data-attributt for en handling), tog (bryter),
 * ellers bare tekst og verdi. Ikon er valgfritt: logo (domene), img (bilde), ini (forbokstaver) med farge ic.
 * Returnerer { html, q } der q er teksten søket i innstillingene leter i.
 */
export function row(o) {
  const icon = o.ico ? `<span class="sg-av sg-ico38" style="background:${o.ic ?? '#2b5d8a'}" aria-hidden="true">${o.ico}</span>` : o.logo !== undefined ? logoImg(o.logo, o.ini ?? o.t, 'sg-lg')
    : o.img ? `<span class="sg-av"><img src="${esc(o.img)}" alt=""></span>`
      : o.ini ? `<span class="sg-av" style="background:${o.ic ?? '#2a3346'}">${esc(o.ini)}</span>` : '';
  const txt = `<span class="sg-txt"><b${o.tc ? ` style="color:${o.tc}"` : ''}>${esc(o.t)}</b>${o.s ? `<span>${esc(o.s)}</span>` : ''}</span>`;
  const val = o.v != null && o.v !== '' ? `<span class="sg-v"${o.vc ? ` style="color:${o.vc}"` : ''}>${esc(o.v)}</span>` : '';
  const isTog = o.tog !== undefined, click = o.go || o.act || isTog;
  const tail = isTog ? '<span class="sg-sw"></span>' : (o.go || o.act) && o.btn !== false ? `<span class="sg-btn2">${esc(o.btn ?? 'Endre')}</span>` : '';
  const attrs = o.go ? `data-go="${esc(o.go)}"` : o.act ?? '';
  const html = click
    ? `<button type="button" class="sg-row${o.danger ? ' danger' : ''}" ${attrs}${isTog ? ` role="switch" aria-checked="${!!o.tog}"` : ''}${o.disabled ? ' disabled' : ''}>${icon}${txt}${val}${tail}</button>`
    : `<div class="sg-row">${icon}${txt}${val}</div>`;
  return { html, q: [o.t, o.s, o.v, o.k].filter(Boolean).join(' ') };
}
/** Seksjon: overskrift over et innrammet kort. rows er row()-objekter eller ferdig HTML. */
export const group = (t, rows, note = '') => ({ t, note, rows: rows.filter(Boolean).map((r) => (typeof r === 'string' ? { html: r, q: r.replace(/<[^>]+>/g, ' ') } : r)) });
const groupHtml = (g) => `<section class="sg${g.cls ? ' ' + g.cls : ''}">${g.t ? `<h3 class="sg-t">${esc(g.t)}</h3>` : ''}<div class="sg-box">${g.rows.map((r) => r.html).join('')}</div>${g.note ? `<div class="sg-note">${g.note}</div>` : ''}</section>`;
const note = (html) => `<div class="sg-note">${html}</div>`;
const box = (t, inner, n = '') => `<section class="sg">${t ? `<h3 class="sg-t">${esc(t)}</h3>` : ''}<div class="sg-box">${inner}</div>${n ? note(n) : ''}</section>`;

/* ---------- Faner og tilstand ---------- */

// [id, navn, undertekst, seksjon, ikon, bare admin]
const TABS = [
  ['konto', 'Konto', 'Personlig informasjon og innlogging.', 'Generelt', P.user],
  ['look', 'Utseende', 'Tema, bakgrunnsbilde, søkebar og kategorier.', 'Generelt', P.look],
  ['top', 'Startside', 'Topplinje, faner, nyhetsbar og forsiden.', 'Generelt', P.top],
  ['dom', 'Domener', 'Domener, statistikkilder og verdenskart.', 'Generelt', P.map],
  ['varsel', 'Varsler', 'Lyd, stille timer, grupper og test.', 'Generelt', P.bell],
  ['app', 'App', 'Navn på appen, app-ikon, widgets og Kalender-appen.', 'Generelt', P.app],
  ['familie', 'Familie', 'Helsekilder: Apple Health, Health Connect og Home Assistant.', 'Generelt', P.users], // prompt 42
  ['glimt', 'Glimt', 'Figur, brief, stemme og venner.', 'Glimt', P.star],
  ['int', 'Integrasjoner', 'Adresser og API-nøkler for tjenestene.', 'Tilkoblinger', P.plug],
  ['kal', 'Kalendere', 'Skolens iCal, Canvas, Google Kalender og Home Assistant.', 'Tilkoblinger', P.cal],
  ['ai', 'AI', 'Modeller, jobber, forbruk og nøkler.', 'Tilkoblinger', P.ai],
  ['users', 'Brukere', 'Hvem som har tilgang, og hvilken rolle de har.', 'Sikkerhet', P.users],
  ['system', 'System', 'Oppdater serveren til nyeste versjon.', 'Server', P.sys, true],
  ['backup', 'Backup', 'Backup av hele systemet: automatisk, hva som tas med, hvor og gjenoppretting.', 'Server', P.backup, true],
];
const tabsFor = () => TABS.filter((t) => !t[5] || isAdmin());
// Gamle navn på faner (lenker og knapper fra før omleggingen) peker til nye.
const ALIAS = { varsler: 'varsel', notify: 'varsel', ikon: 'app', appnavn: 'app', login: 'konto', layout: 'top', innlogging: 'konto', look: 'look', utseende: 'look', tema: 'look', startside: 'top', domener: 'dom', integrasjoner: 'int', brukere: 'users', kalender: 'kal', kalendere: 'kal', calendars: 'kal', chat: 'ai', personvern: 'ai', logo: 'ai', sys: 'system', oppdatering: 'system', update: 'system', sikkerhetskopi: 'backup', backups: 'backup', brief: 'glimt', stemme: 'glimt', figur: 'glimt', tts: 'glimt', opplesning: 'glimt', helse: 'familie', family: 'familie', fam: 'familie' };
// Hvilken fane en underside hører til, så «go('tfa')» virker uansett hvor den kalles fra.
const SUB_TAB = { me: 'konto', tfa: 'konto', pw: 'konto', devices: 'konto', server: 'konto', add: 'users', bg: 'look', style: 'look', hist: 'look', cats: 'look',
  tabs: 'top', head: 'top', speed: 'top', dash: 'top', mob: 'top', sc: 'top', doms: 'dom', mail: 'int', widgets: 'app', kalapp: 'app', hahealth: 'familie' };
const subTab = (sub) => SUB_TAB[sub] ?? (sub?.startsWith('cfg:') || sub?.startsWith('i24:') || sub?.startsWith('trk37:') ? 'int' : sub?.startsWith('user:') ? 'users' : null);
const tabOf = (k) => TABS.find(([id]) => id === k) ?? TABS[0];

let tab = 'konto', sub = null, cfg = null, cfgErr = null, sqMsg = '', q = '', mail = null;
const tests = {};           // gruppe → { st: 'run'|'ok'|'err', msg, at }
const cfgMsg = {};          // gruppe → { text, ok }
let saving = Promise.resolve();

// Hvilke data som må hentes på nytt når en integrasjonsgruppe endres.
const RELOAD = { 'Vær (MET/Yr)': ['weather'], 'Ruter (Entur)': ['ruter'], 'Kalender / timeplan': ['school'], 'Home Assistant': ['energy', 'health'],
  Sonarr: ['upcoming', 'health'], Radarr: ['upcoming', 'health'], 'Trading 212': ['trading'] };

const isAdmin = () => store.me.me?.role === 'admin';
const ui = () => store.me.ui ?? {};

/* ---------- Konto ---------- */

// Prompt 37: «Profil i husstanden» (koble, bytt). Vises når serveren har profiler (GET /api/profiles).
function profileRow37() {
  if (!profilesLoaded()) { loadProfiles().then((d) => { if (d && !modal().hidden && tab === 'konto') render(); }); return null; }
  if (!hasProfiles()) return null;
  const p = myProfile();
  return row({ t: 'Profil i husstanden', k: 'profil koble husstand onboarding', s: p ? 'Posisjon, delte lister, abonnementer og kalendere følger profilen.' : 'Koble brukeren til personen din i husstanden.', v: p ? p.name : 'Ikke koblet', vc: p ? undefined : '#f3b54a', btn: p ? 'Bytt' : 'Koble', act: 'data-onb37' });
}
/* Prompt 38: antall økter (GET /api/me/sessions → {count} eller {sessions:[…]}); eldre server (404) = uten antall. */
let sessCount38 = null, sessAt38 = 0;
function loadSessions38() {
  if (Date.now() - sessAt38 < 30_000) return;
  sessAt38 = Date.now();
  api('/me/sessions').then((r) => { const n = Number.isFinite(r?.count) ? r.count : Array.isArray(r?.sessions) ? r.sessions.length : Array.isArray(r) ? r.length : null; if (n !== sessCount38) { sessCount38 = n; if (tab === 'konto' && !sub) render(); } }).catch(() => {});
}
function kontoView() {
  if (!sub) { loadSessions38(); loadServer41(() => { if (!modal().hidden && tab === 'konto' && !sub) render(); }); }
  const d = loginData(), me = store.me.me ?? d?.me ?? {}, mu = d?.users?.find((u) => u.id === me.id) ?? me;
  const name = me.name || me.username || '';
  if (!sub) return { sub: [me.name || me.username, me.username ? '@' + me.username : ''].filter(Boolean).join(' · '), groups: [
    group('Profil', [
      row({ t: 'Navn', v: name, go: 'konto|me' }),
      row({ t: 'Brukernavn', v: me.username ? '@' + me.username : '' }),
      row({ t: 'Rolle', v: `${roleName(me.role)}${me.isMainAdmin ? ' · hovedadmin' : ''}` }),
      profileRow37(),
      { html: avatarRow(store.me.me ?? me), q: 'Profilbilde avatar bilde last opp fjern' },
    ]),
    group('Innlogging', d ? [
      row({ t: 'Totrinnsbekreftelse', k: '2FA tofaktor TOTP kode autentisering', s: 'Krev en kode fra autentiseringsappen når du logger inn.', v: mu.totp ? 'På' : 'Av', vc: mu.totp ? '#8fe0b0' : '#8a93a6', btn: 'Administrer', go: 'konto|tfa' }),
      row({ t: 'Pålitelig enhet', k: 'lokalt nett LAN', s: d.devices.trusted ? 'Denne enheten slipper passord på lokalt nett.' : 'Passord kreves alltid på denne enheten.', tog: !!d.devices.trusted, act: 'data-trust' }),
      row({ t: 'Pålitelige enheter', s: d.devices.lan ? 'Du er på lokalt nett nå.' : 'Du er ikke på lokalt nett nå.', v: String(d.devices.devices.length), btn: 'Administrer', go: 'konto|devices' }),
      row({ t: 'Passord', k: 'bytt endre', s: 'Gjelder nettsiden og mobilappene.', v: '••••••••', go: 'konto|pw' }),
    ] : [row({ t: 'Laster …' })], 'Pålitelig enhet gjelder bare når siden åpnes fra en lokal adresse (192.168.x.x, 10.x.x.x, 172.16–31.x.x). Fra internett kreves alltid passord, og kode hvis totrinnsbekreftelse er på.'),
    isAdmin() ? group('Servernavn', [row({ t: 'Navn på serveren', s: 'Vises i menyen og i mobilappen.', v: store.me.serverName ?? '', go: 'konto|server' })]) : null,
    serverGroup41(row, group),
    // Prompt 38: «Lås skjermen» og «Logg ut» er flyttet hit fra sidemenyen (web og mobil), + «Logg ut av alle enheter».
    group('Økt', [
      row({ t: 'Lås skjermen', k: 'lås låse skjerm pin', s: 'Låser med en gang. Passord (eller Face ID i appen) for å fortsette · Ctrl+Alt+L', btn: 'Lås', act: 'data-set-lock', ico: svg(P.lock, 16), ic: '#2b5d8a' }),
      row({ t: 'Logg ut', k: 'logg ut sign out', tc: '#e0675a', s: 'Logger ut av Homelab på denne enheten og glemmer den.', btn: 'Logg ut', act: 'data-set-logout', ico: svg(P.out, 16), ic: '#b23a2a' }),
      row({ t: 'Logg ut av alle enheter', k: 'alle økter enheter logg ut overalt', s: sessCount38 == null ? 'Ugyldiggjør alle økter. Krever passordet.' : `${sessCount38} ${sessCount38 === 1 ? 'økt' : 'økter'} er logget inn nå. Krever passordet.`, btn: 'Logg ut alle', act: 'data-set-logoutall', ico: svg('M3 12h4M17 12h4M12 3v4M12 17v4M8 8l8 8M16 8l-8 8', 16), ic: '#7a3b6b' }),
    ]),
  ].filter(Boolean) };
  return d ? loginView(sub, go) : { html: '<div class="skeleton" style="min-height:200px;border-radius:18px"></div>' };
}

function usersView() {
  const d = loginData();
  if (!d) return { html: '<div class="skeleton" style="min-height:200px;border-radius:18px"></div>' };
  if (sub) return loginView(sub, go);
  const meId = d.me?.id, admin = d.me?.role === 'admin';
  return { groups: [group('Brukere', [
    ...d.users.map((u) => row({ t: u.name || u.username, img: u.id === meId ? store.me.me?.avatarUrl ?? u.avatarUrl : u.avatarUrl, ini: initials(u.name || u.username), ic: u.id === meId ? '#3b6fd6' : '#2a3346',
      s: `@${u.username} · ${roleName(u.role)}${u.isMainAdmin || u.id === 'owner' ? ' · hovedadmin' : ''}${u.totp ? ' · 2FA på' : ''}`, k: 'bruker 2FA rolle', btn: 'Administrer', go: `users|user:${u.id}` })),
    admin ? row({ t: 'Ny bruker', s: 'Brukernavn, passord og rolle.', btn: 'Legg til', go: 'users|add' }) : null,
  ], admin ? 'Admin kan legge til og fjerne brukere. Bruker ser dashbordet og styrer egen totrinnsbekreftelse.' : 'Brukere legges til av administrator. Du styrer egen totrinnsbekreftelse.')] };
}

/* ---------- Utseende ---------- */

const BGN = Object.fromEntries(BG_TYPES.map(([k, n]) => [k, n]));

/* Bakgrunn: forhåndsvisninger fra GET /api/background/previews (reserve: ett kall per type), og egne Oslo-bilder. */
let bgPrev = null, bgPrevAt = 0, osloList = null, bgMsg = '';
const safeUrl = (u) => `url("${String(u).replace(/["\\\s()]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))}")`;
function loadBgPreviews(force) {
  if (!force && bgPrev && Date.now() - bgPrevAt < 10 * 60_000) return;
  bgPrevAt = Date.now(); bgPrev ??= {};
  const redraw = () => { if (!modal().hidden && sub === 'bg') render(); };
  api(`/background/previews?w=${Math.round(320 * (devicePixelRatio || 1))}`).then((r) => { bgPrev = { ...bgPrev, ...r }; redraw(); })
    .catch(() => Promise.all(BG_TYPES.filter(([k]) => k !== 'none').map(([k]) => resolveBg(k).then((e) => { bgPrev[k] = { image_url: e.url, credit: e.r?.credit, theme_hint: e.r?.theme_hint, gradient: e.r?.gradient }; })))
      .then(redraw));
  if (isAdmin()) api('/background/oslo').then((r) => { osloList = r.items ?? []; redraw(); }).catch(() => { osloList = null; });
}
function bgCard([k, name, desc], cur) {
  const p = bgPrev?.[k], e = cachedBg(k);
  const url = k === 'none' ? null : (k === cur && e?.url) || p?.image_url;
  const style = url ? `background-image:${safeUrl(url)}` : `background:${p?.gradient || FALLBACK_GRAD}`;
  const empty = k === 'custom' && !url ? '<em>Last opp et bilde</em>' : '';
  return `<button type="button" class="bgc" data-bgtype="${k}" aria-pressed="${cur === k}"><span class="bgc-img" style="${esc(style)}">${empty}${cur === k ? '<i>✓</i>' : ''}</span>
    <b>${esc(name)}</b><small>${esc(desc)}</small></button>`;
}
function bgView() {
  const b = bgState(), cur = b.type;
  loadBgPreviews();
  const chips = (attr, list, val) => `<div class="bg-chips">${list.map(([k, n]) => `<button type="button" class="chip" data-${attr}="${k}" aria-pressed="${val === k}">${esc(n)}</button>`).join('')}</div>`;
  const slider = (k, n, max, unit, v) => `<label class="sg-row bg-range"><span class="sg-txt"><b>${n}</b></span><input type="range" min="0" max="${max}" step="1" value="${v}" data-bgrange="${k}" aria-label="${n}"><span class="sg-v" data-bgrange-v="${k}">${v} ${unit}</span></label>`;
  const cr = cur === 'none' ? { text: '' } : creditOf(cachedBg(cur));
  const credit = cr.text ? `${/^Foto:/.test(cr.text) ? '' : 'Foto: '}${cr.url ? `<a href="${esc(cr.url)}" target="_blank" rel="noopener noreferrer">${esc(cr.text)}</a>` : esc(cr.text)}` : '';
  const planet = cur === 'planets' ? box('Planet', `<div class="sg-row bg-sub">${chips('bgplanet', PLANETS, b.planet)}</div>
      ${b.planet === 'auto' ? `<div class="sg-row bg-sub"><span class="sg-txt"><b>Bytt</b></span>${chips('bgrotate', [['daily', 'Daglig'], ['hourly', 'Hver time']], b.rotate)}</div>` : ''}`,
    'Bilder fra NASA Image and Video Library (fritt til bruk).') : '';
  const own = box('Egne bilder', `<label class="sg-row" style="cursor:pointer"><span class="sg-txt"><b>Eget bilde</b><span>Vises når «Eget bilde» er valgt. Deles med appene.</span></span><span class="sg-btn2">Last opp</span><input type="file" accept="image/*" hidden data-bg-custom></label>
    ${isAdmin() ? `<label class="sg-row" style="cursor:pointer"><span class="sg-txt"><b>Oslo-bilder</b><span>${osloList ? `${osloList.length} egne bilder` : 'Egne bilder av Oslo, for eksempel fra drone. Maks 15 MB per bilde.'}</span></span><span class="sg-btn2">Legg til</span><input type="file" accept="image/*" multiple hidden data-bg-oslo></label>
      ${osloList?.length ? `<div class="sg-row bg-oslo">${osloList.map((o) => `<span class="bg-oslo-th" style="background-image:${esc(safeUrl(o.url))}"><button type="button" data-bg-oslo-del="${esc(o.id)}" aria-label="Slett bildet">×</button></span>`).join('')}</div>` : ''}` : ''}`,
    'Oslo hentes fra Unsplash eller Pexels når en nøkkel er lagt inn under Integrasjoner → Bakgrunner, ellers fra egne og medfølgende bilder. Getty Images brukes ikke, siden bildene krever kjøpt lisens.');
  return { title: 'Bakgrunn', sub: hlTheme() === '2c' ? 'Fotovinduet øverst på alle sider. Valget deles med mobilappene.' : 'Bak Dashboard. Valget deles med fotovinduet og mobilappene.',
    html: `<div class="bg-cards">${BG_TYPES.map((t) => bgCard(t, cur)).join('')}</div>
      ${credit ? `<div class="sg-note bg-credit41">${credit}</div>` : ''}
      ${bgMsg ? `<div class="sg-note green">${esc(bgMsg)}</div>` : ''}
      ${planet}
      ${box('Visning', `${slider('blur', 'Uskarphet', 20, 'px', b.blur)}${slider('dim', 'Mørklegging', 60, '%', b.dim)}
        ${row({ t: 'Animasjon', s: 'Diskret regn og snø når været tilsier det. Slås av når «Reduser bevegelse» er på.', tog: b.animate, act: 'data-bg-anim' }).html}`)}
      ${own}` };
}
const SRN = Object.fromEntries(SEARCH_STYLES);

function srchPreview([k, name]) {
  const light = k === 'light' || k === 'wideLight', wide = k.startsWith('wide');
  const bar = light ? '#f5f7fa' : '#0a0c12', btn = light ? '#1a73e8' : '#a8d4fb';
  return `<button class="srch-opt" data-srch="${k}" aria-pressed="${store.me.searchStyle === k}">
    <div class="srch-prev" style="align-items:${wide ? 'stretch' : 'center'}">${wide ? '' : GWORD}
      <div class="bar2" style="width:${wide ? '100%' : '80%'};background:${bar}">${wide ? GWORD : ''}<em></em><s style="background:${btn}"></s></div></div>${name}</button>`;
}

function lookView() {
  const s = store.me, sq = searchState();
  if (!sub) return { groups: [
    { ...group('Tema', [{ html: themeCards(), q: `tema ${THEMES.map((t) => t[1]).join(' ')} papir vindu` }], 'Byttet skjer med en gang og lagres på brukeren din. Alt virker likt i begge temaene.'), cls: 'sg-theme' },
    group('Bakgrunn', [row({ t: 'Bakgrunnsbilde', s: hlTheme() === '2c' ? 'Vises i fotovinduet øverst på Dashboard.' : 'Vises bare på Dashboard. De andre sidene har en rolig, mørk bakgrunn.', v: BGN[bgState().type] ?? 'Oslo', k: 'vær planeter jorda månen jupiter mars saturn oslo uskarphet mørklegging', go: 'look|bg' })]),
    group('Søkebar', [
      row({ t: 'Vis søkebar', s: 'Kan dras mellom avgangene og klokka.', tog: !s.hideSearch, act: 'data-toggle="search"' }),
      row({ t: 'Stil', v: SRN[s.searchStyle] ?? 'Lys', go: 'look|style' }),
      row({ t: 'Forslag fra Google', s: 'Vises mens du skriver.', tog: !!sq.suggest, act: 'data-toggle="sq:suggest"' }),
      row({ t: 'Lagre søkehistorikk', s: 'Vises når du klikker i søkefeltet, også i mobilappen.', tog: !!sq.save, act: 'data-toggle="sq:save"' }),
      row({ t: 'Søkehistorikk', v: `${sq.hist?.length ?? 0} søk`, btn: 'Åpne', go: 'look|hist' }),
    ]),
    group('Kvitteringer', [row({ t: 'Kategorier', s: 'Navn og farger på kvitteringene i Homelab.', v: String(s.categories?.length ?? 0), go: 'look|cats' })]),
  ] };
  if (sub === 'bg') return bgView();
  if (sub === 'style') return { title: 'Stil på søkebar', sub: 'Utseende · Søkebar', html: `<div class="srch-opts">${SEARCH_STYLES.map(srchPreview).join('')}</div>` };
  if (sub === 'hist') return { title: 'Søkehistorikk', sub: 'Utseende · Søkebar', html: box(`${sq.hist?.length ?? 0} søk lagret`,
    `<label class="sg-row" style="cursor:pointer"><span class="sg-txt"><b>Importer Google-historikk</b><span>Google Takeout → Mine aktiviteter → Søk (JSON)</span></span><span class="sg-btn2">Velg fil</span><input type="file" accept=".json,application/json" data-sq-import hidden></label>
      ${row({ t: 'Tøm søkehistorikk', tc: '#f59a8f', act: 'data-sq-clearall', btn: 'Tøm' }).html}`)
    + (sqMsg ? `<div class="sg-note green">${esc(sqMsg)}</div>` : '')
    + note('Google lar ikke andre sider lese søkehistorikken direkte. Eksporter den fra takeout.google.com og importer filen her, så kommer de gamle søkene med i forslagene.') };
  if (sub === 'cats') {
    const cats = s.categories.map((cat, i) => `<div class="sg-row cat-row"><input type="color" value="${cat.color}" data-ci="${i}" data-ck="color" aria-label="Farge"><input class="tab-name" value="${esc(cat.name)}" data-ci="${i}" data-ck="name" aria-label="Navn" maxlength="30"><button class="sg-pill danger" data-cdel="${i}" aria-label="Slett ${esc(cat.name)}">Slett</button></div>`).join('');
    return { title: 'Kategorier', sub: 'Utseende · Kvitteringer', html: box('Kategorier', cats, 'Brukes på kvitteringene i Homelab. FinansHub har egne kategorier.')
      + '<div class="sg-acts"><button class="sg-btn" data-cadd>+ Ny kategori</button></div>' };
  }
  sub = null; return lookView();
}

/* ---------- Startside ---------- */

const TOP = [['head', 'hl_head_gap', 'Mellom seksjoner', 0, 120, 4, 16], ['tab', 'hl_tab_gap', 'Mellom faner', 0, 40, 2, 2], ['pad', 'hl_tab_pad', 'Bredde på faner', 6, 24, 1, 12]];
export function applyTop() {
  const t = store.me.top ?? {}, r = document.documentElement.style;
  r.setProperty('--hl-head-gap', (t.head ?? 16) + 'px');
  r.setProperty('--hl-tab-gap', (t.tab ?? 2) + 'px');
  r.setProperty('--hl-tab-pad', (t.pad ?? 12) + 'px');
}
const topVal = (k) => store.me.top?.[k] ?? TOP.find((x) => x[0] === k)[6];
const speedTxt = (v) => `${Math.round(350 / v)} s per runde`;

function tabRows() {
  const order = orderOf('tabs', NAV_TABS.length), hid = hiddenTabs(), labels = store.me.layout?.labels ?? {};
  const shown = order.filter((i) => tabAllowed(NAV_TABS[i][0]));
  return shown.map((idx, pos) => {
    const [id, def] = NAV_TABS[idx], off = hid.has(id), fixed = FIXED_TABS.includes(id);
    return `<div class="sg-row tab-row${off ? ' off' : ''}"><input class="tab-name" value="${esc(labels[id] ?? '')}" placeholder="${esc(def)}" maxlength="30" data-tab-label="${id}" aria-label="Navn på fanen ${esc(def)}">
      <button class="lay-btn" data-lay-move="tabs:${order.indexOf(idx)}:${-1}:${shown[pos - 1] ?? ''}" aria-label="Flytt ${esc(def)} opp"${pos === 0 ? ' disabled' : ''}>▲</button>
      <button class="lay-btn" data-lay-move="tabs:${order.indexOf(idx)}:1:${shown[pos + 1] ?? ''}" aria-label="Flytt ${esc(def)} ned"${pos === shown.length - 1 ? ' disabled' : ''}>▼</button>
      ${fixed ? '<span class="lay-always">Alltid</span>' : `<button class="sw" role="switch" aria-checked="${!off}" data-lay-hide="t:${id}" aria-label="Vis ${esc(def)}"></button>`}</div>`;
  }).join('');
}

function layList(g, items, hidden, fixed = []) {
  const order = orderOf(g, items.length);
  return order.map((idx, pos) => {
    const [id, name] = items[idx], off = hidden.has(id), lock = fixed.includes(id);
    return `<div class="sg-row lay-row${off ? ' off' : ''}"><span class="lay-no">${pos + 1}</span><span class="lay-name">${esc(name)}</span>
      <button class="lay-btn" data-lay-move="${g}:${pos}:-1" aria-label="Flytt ${esc(name)} opp"${pos === 0 ? ' disabled' : ''}>▲</button>
      <button class="lay-btn" data-lay-move="${g}:${pos}:1" aria-label="Flytt ${esc(name)} ned"${pos === order.length - 1 ? ' disabled' : ''}>▼</button>
      ${lock ? '<span class="lay-always">Alltid</span>' : `<button class="sw" role="switch" aria-checked="${!off}" data-lay-hide="w:${id}" aria-label="Vis ${esc(name)}"></button>`}</div>`;
  }).join('');
}
const shownOf = (items) => `${items.filter(([id]) => !hiddenWidgets().has(id)).length} av ${items.length}`;

function topView() {
  const s = store.me, u = ui(), sc = s.shortcuts ?? [];
  if (!sub) {
    const visTabs = NAV_TABS.filter(([k]) => tabAllowed(k)), nHid = visTabs.filter(([k]) => hiddenTabs().has(k)).length;
    return { groups: [
      group('Topplinje', [
        row({ t: 'Faner', k: 'meny navn rekkefølge skjul studie nettverk', s: 'Vis, skjul, endre rekkefølge og gi nytt navn.', v: `${visTabs.length - nHid} av ${visTabs.length}`, go: 'top|tabs' }),
        row({ t: 'Samle faner, vær og meny til høyre', s: 'Logoen står alene til venstre.', tog: headAlign() === 'right', act: 'data-hp-align' }),
        row({ t: 'Plassering', s: 'Dra logo, faner, vær og meny dit du vil.', btn: 'Flytt', act: 'data-hp-edit' }),
        row({ t: 'Avstand', v: `${topVal('head')} · ${topVal('tab')} · ${topVal('pad')} px`, go: 'top|head' }),
        row({ t: 'Samme høyde', s: 'Elementene kan bare flyttes sideveis.', tog: !!u.headLock, act: 'data-toggle="ui:headLock"' }),
        row({ t: 'Nullstill plassering', btn: 'Nullstill', act: 'data-hp-reset2' }),
      ]),
      group('Nyhetsbar', [
        row({ t: 'Vis nyhetsbar', s: 'NRK og VG. Vises bare på Dashboard.', tog: !s.hideNews, act: 'data-toggle="news"' }),
        row({ t: 'Hastighet', k: 'fart nyheter', v: `${u.newsSpeed ?? 5} · ${speedTxt(u.newsSpeed ?? 5)}`, go: 'top|speed' }),
        row({ t: 'Pause når musepekeren er over', tog: u.newsPause !== false, act: 'data-toggle="ui:newsPause"' }),
      ]),
      group('Forside', [
        row({ t: 'Widgets på dashboardet', k: 'kort skjul rekkefølge', s: 'Skjul det du ikke bruker, for eksempel snarveier.', v: shownOf(DASH_WIDGETS), btn: 'Administrer', go: 'top|dash' }),
        row({ t: 'Widgets på mobil', v: shownOf(MOBILE_WIDGETS), btn: 'Administrer', go: 'top|mob' }),
        row({ t: 'Snarveier', s: 'Lenker på dashboardet og i mobilappen.', v: String(sc.length), btn: 'Administrer', go: 'top|sc' }),
      ], 'Rekkefølgen kan også endres ved å dra kortene på forsiden.'),
    ] };
  }
  if (sub === 'tabs') return { title: 'Faner', sub: 'Startside · Topplinje', html: box('Faner i topplinjen', tabRows(), 'Klikk på navnet for å endre det. Tomt felt gir standardnavnet. Dashboard kan ikke skjules. Skjulte sider kan fortsatt åpnes med lenke.')
      + '<div class="sg-acts"><button class="sg-btn" data-tabs-reset>Tilbakestill faner</button></div>' };
  if (sub === 'head') return { title: 'Avstand og faner', sub: 'Startside · Topplinje', html: box('Avstand', TOP.map(([k, , label, min, max, step]) =>
      `<label class="sg-field range"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${topVal(k)}" data-top="${k}"><output class="mono">${topVal(k)} px</output></label>`).join(''),
    'Endringene vises med en gang i topplinjen bak dette vinduet.') };
  if (sub === 'speed') {
    const v = u.newsSpeed ?? 5;
    return { title: 'Hastighet', sub: 'Startside · Nyhetsbar', html: `<section class="sg"><h3 class="sg-t">Hastighet</h3><div class="sg-box speed-box">
      <div class="speed-top"><b data-speed-n>${v}</b><span class="mono" data-speed-t>${speedTxt(v)}</span></div>
      <div class="speed-ctl"><button class="speed-pm" data-speed-step="-1" aria-label="Saktere">−</button><input type="range" min="1" max="10" step="1" value="${v}" data-news-speed aria-label="Hastighet"><button class="speed-pm" data-speed-step="1" aria-label="Raskere">+</button></div>
      <div class="speed-pre">${[['Sakte', 2], ['Normal', 5], ['Rask', 8]].map(([n, x]) => `<button data-speed-set="${x}" aria-pressed="${v === x}">${n}</button>`).join('')}</div></div>
      ${note('1 er tregest og 10 raskest. Endringen vises med en gang. Du kan også åpne denne siden med knappen helt til høyre i nyhetsbaren.')}</section>` };
  }
  if (sub === 'dash') return { title: 'Widgets på dashboardet', sub: 'Startside · Forside', html: box('', layList('dash', DASH_WIDGETS, hiddenWidgets())) };
  if (sub === 'mob') return { title: 'Widgets på mobil', sub: 'Startside · Forside', html: box('', layList('m_home', MOBILE_WIDGETS, hiddenWidgets())) };
  if (sub === 'sc') return { title: 'Snarveier', sub: 'Startside · Forside', html: `<form class="sg" data-sc-form><h3 class="sg-t">Snarveier</h3><div class="sg-box">
      ${sc.map((x, i) => `<div class="sg-row sc-row">${logoImg(x.domain, x.name, 'sg-lg sm')}<input class="tab-name" name="n${i}" value="${esc(x.name)}" aria-label="Navn" maxlength="30" style="flex:0 1 150px"><input class="tab-name mono" name="u${i}" value="${esc(x.url)}" aria-label="Adresse" spellcheck="false"><button type="button" class="sg-pill danger" data-sc-del="${i}" aria-label="Fjern ${esc(x.name)}">Fjern</button></div>`).join('')}
      <div class="sg-row sc-row"><span class="lg sg-lg sm"><i>+</i></span><input class="tab-name" name="nnew" placeholder="Navn" maxlength="30" style="flex:0 1 150px"><input class="tab-name mono" name="unew" placeholder="https://…" spellcheck="false"><button class="sg-pill" type="submit">Legg til</button></div></div>
      ${note('Logoen hentes fra adressen. For adresser på lokalnettet (192.168.x.x, .local) slås navnet opp med AI én gang, for eksempel «Proxmox» → proxmox.com. Uten treff vises forbokstavene.')}
      <div class="sg-acts"><button class="sg-btn pri" type="submit">Lagre</button><button type="button" class="sg-btn" data-sc-reset>Tilbakestill snarveier</button><span class="muted" data-sc-msg style="font-size:13px"></span></div></form>` };
  sub = null; return topView();
}

async function saveShortcuts(list) {
  try {
    store.me.shortcuts = await api('/me/shortcuts', { method: 'PUT', json: list });
    emit('route'); render();
    const m2 = modal().querySelector('[data-sc-msg]'); if (m2) { m2.textContent = 'Lagret ✓'; m2.className = 'green'; }
    if (store.me.shortcuts.some((s) => s.local && !s.resolved)) {
      api('/me/shortcuts/resolve', { method: 'POST' }).then((l) => { if (Array.isArray(l)) { store.me.shortcuts = l; emit('route'); if (tab === 'top' && sub === 'sc') render(); } }).catch(() => {});
    }
  } catch (e) { const msg = modal().querySelector('[data-sc-msg]'); if (msg) { msg.textContent = e.message; msg.className = 'red'; } }
}

/* ---------- Domener ---------- */

function domView() {
  if (!sub) {
    const n = domainCount();
    return { groups: [group('Domener', [
      row({ t: 'Google Search Console', s: 'Klikk, visninger og søkeord fra Google · hent domener', k: 'search console google gsc søk klikk visninger søkeord seo', btn: 'Åpne', go: 'dom|doms' }), // prompt 39
      row({ t: 'Administrer domener', s: 'Legg til, fjern og velg statistikkilde.', v: n == null ? '' : `${n} ${n === 1 ? 'domene' : 'domener'}`, btn: 'Administrer', go: 'dom|doms' }),
      row({ t: 'Verdenskart med besøk per land', s: 'Vises på Domener-siden.', tog: ui().domMap !== false, act: 'data-toggle="ui:domMap"' }),
    ], 'Cloudflare-domener uten eget token bruker standard-tokenet under Integrasjoner → Cloudflare.')] };
  }
  if (sub === 'doms') return { title: 'Domener', sub: 'Legg til, fjern og velg statistikkilde.', html: domainsPane() };
  sub = null; return domView();
}

/* ---------- Integrasjoner ---------- */

// gruppe → [visningsnavn, undertekst, kategori, domene for logo, verdi(v, satt)]. Verdi som starter med «!» er en advarsel.
const INT = {
  'Vær (MET/Yr)': ['Vær', 'MET / Yr', 'Informasjon', 'yr.no', (v) => v.wx_place || 'Oslo'],
  'Ruter (Entur)': ['Ruter', 'Entur', 'Informasjon', 'ruter.no', (v) => { const n = String(v.ruter_routes ?? '').split('\n').filter((l) => l.trim()).length; return n ? `${n} ${n === 1 ? 'strekning' : 'strekninger'}` : '!Ingen strekninger'; }],
  'Kalender / timeplan': ['Kalender og timeplan', 'iCal · MazeMap', 'Informasjon', 'calendar.google.com', (v, set) => (set.cal_ics ? 'Koblet' : '!Ikke koblet')],
  'NASA / CelesTrak': ['Rom', 'NASA · CelesTrak', 'Informasjon', 'nasa.gov', (v) => v.sat_group || 'starlink'],
  'Home Assistant': ['Home Assistant', 'Lokal server', 'Smarthjem', 'home-assistant.io', (v, set) => (set.ha_token ? 'Tilkoblet' : '!Mangler token')],
  Sonarr: ['Sonarr', 'Serier', 'Media', 'sonarr.tv', (v, set) => (set.sonarr_key ? `${v.sonarr_days || 14} dager frem` : '!Mangler API-nøkkel')],
  Radarr: ['Radarr', 'Filmer', 'Media', 'radarr.video', (v, set) => (set.radarr_key ? `${v.radarr_days || 14} dager frem` : '!Mangler API-nøkkel')],
  Plex: ['Plex', 'Mediaserver', 'Media', 'plex.tv', null],
  Jellyfin: ['Jellyfin', 'Mediaserver', 'Media', 'jellyfin.org', null],
  'Trading 212': ['Trading 212', 'Aksjer', 'Økonomi', 'trading212.com', null],
  Cloudflare: ['Cloudflare', 'Standard-token for Domener', 'Nett', 'cloudflare.com', (v, set) => (set.cf_token ? 'Token lagret' : '!Mangler token')],
  'Søk': ['Søkemotor', 'Søke-URL', 'Annet', 'google.com', (v) => (/google\./.test(v.search_url ?? '') ? 'Google' : 'Egen')],
};
const CAT_ORDER = ['Informasjon', 'Smarthjem', 'Media', 'Økonomi', 'Nett', 'Annet'];
const NOTES = {
  'Home Assistant': 'Home Assistant må være tilgjengelig fra serveren. Lag et long-lived access token under profilen din i Home Assistant.',
  'Trading 212': 'Lag nøkkelen på app.trading212.com under Innstillinger → API, i samme konto og miljø (Live eller Demo) som over. Du får en Key ID og en secret, og secret vises bare én gang. Gi bare lesetilgang, og lås gjerne nøkkelen til IP-adressen til homelaben.',
  'Ruter (Entur)': 'Én strekning per linje: Fra (NSR-ID) &gt; Til (NSR-ID). Finn stopp-ID på stoppested.entur.org.',
  Cloudflare: 'Tokenet trenger Zone, DNS, Analytics, Registrar og Firewall Services: Read. Domener legges til under Domener → Administrer domener.',
  'Kalender / timeplan': 'iCal-adressen finner du i Canvas (Kalender → Kalenderfeed) eller Outlook (Publiser kalender).',
  Plex: 'Plex må være tilgjengelig fra serveren som kjører dashbordet.',
  Jellyfin: 'Jellyfin må være tilgjengelig fra serveren som kjører dashbordet.',
};
// Veiledning når serveren ikke sender egen (g.help): [tittel, tekst, kode?]
const GUIDE = {
  Plex: [
    ['Finn adressen', 'Adressen er IP-en til serveren med port 32400, for eksempel http://192.168.1.20:32400. Du finner IP-en i Plex under Innstillinger → Fjerntilgang, eller i ruteren.'],
    ['Finn X-Plex-Token', 'Åpne Plex i nettleseren og logg inn. Velg en film eller episode → ⋯ → Hent info → Vis XML. Adressen som åpnes slutter med X-Plex-Token=…, og det som står etter = er tokenet.', 'http://192.168.1.20:32400/library/metadata/123?X-Plex-Token=AbCdEf123456'],
    ['Eller hent det fra serveren', 'Tokenet står også i filen Preferences.xml som PlexOnlineToken. I Docker ligger den i config-mappen til Plex.', 'grep -o PlexOnlineToken=.[A-Za-z0-9_-]* Preferences.xml'],
    ['Test', 'Trykk Test tilkobling. Testen henter servernavn, versjon og antall som spiller nå. Tokenet gir full tilgang til Plex-kontoen, så det lagres bare på serveren.'],
  ],
  Jellyfin: [
    ['Finn adressen', 'Adressen er IP-en til serveren med port 8096, for eksempel http://192.168.1.20:8096.'],
    ['Lag en API-nøkkel', 'I Jellyfin: Kontrollpanel → Avansert → API-nøkler → +. Gi den navnet Homelab og kopier nøkkelen.'],
    ['Skriv brukernavnet', '«Nylig lagt til» hentes for én bruker. Skriv brukernavnet du logger inn med i Jellyfin.'],
    ['Test', 'Trykk Test tilkobling. Testen henter servernavn, versjon og antall som spiller nå.'],
  ],
};
const metaOf = (g) => {
  const m = INT[g.name] ?? [g.name, '', 'Annet', null, null];
  // Kjente grupper sorteres som i designet; nye grupper fra serveren bruker serverens kategori.
  return { name: m[0], s: m[1], cat: INT[g.name] ? m[2] : g.category || 'Annet', domain: g.domain || m[3], val: m[4] };
};
const valsOf = (g) => [Object.fromEntries(g.fields.map((f) => [f.key, f.value])), Object.fromEntries(g.fields.map((f) => [f.key, f.set]))];
// Felles verdi når gruppen ikke har en egen: mangler en hemmelighet → advarsel, ellers «Tilkoblet».
function genericVal(g) {
  const miss = g.fields.find((f) => f.secret && !f.set);
  if (miss) return '!Mangler ' + miss.label.replace(/\s*\(.*\)$/, '').toLowerCase();
  const env = g.fields.find((f) => /env|miljø/i.test(f.key + f.label));
  return env?.value ? (/demo/i.test(env.value) ? 'Demo' : 'Live') : 'Tilkoblet';
}
const valOf = (g) => { const m = metaOf(g); try { return m.val ? m.val(...valsOf(g)) : genericVal(g); } catch { return ''; } };
const when = (t) => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function testState(name) {
  const t = tests[name];
  if (!t) return null;
  return t.st === 'run' ? { v: 'Tester …', vc: '#b6bccb' } : t.st === 'ok' ? { v: '✓ OK', vc: '#8fe0b0' } : { v: '✕ Feilet', vc: '#f59a8f' };
}

// Proton Mail (kvitteringer fra e-post) lever i FinansHub; status hentes derfra.
async function loadMail() {
  try { mail = await api('/../finans/api/mail/status'); } catch (e) { mail = { error: e.message }; }
  if (!modal().hidden && (tab === 'int' || q)) render();
}
function mailVal() {
  if (!mail) return '';
  if (mail.error) return '!Ikke satt opp';
  const conf = mail.configured ?? mail.config?.configured ?? !!(mail.user || mail.config?.user);
  if (!conf) return '!Ikke satt opp';
  if (mail.lastError || mail.error) return '!Feil ved henting';
  return mail.folder || mail.config?.folder || 'Satt opp';
}
// ISO2: alle får sine egne personlige grupper (scope 'personal') med egne verdier; servergruppene (scope 'server') bare admin.
const isPersonal = (g) => g?.scope === 'personal';
const canEdit = (g) => isPersonal(g) || isAdmin();
const warnCount = () => (cfg ? cfg.filter((g) => valOf(g).startsWith('!')).length : 0) + (mailVal().startsWith('!') ? 1 : 0) + integCount(cfg);

function intView() {
  if (cfgErr) return { html: `<div class="err">${esc(cfgErr)}</div>` };
  if (!cfg) return { html: '<div class="skeleton" style="min-height:240px;border-radius:18px"></div>' };
  if (!sub) {
    const res = Object.values(tests), ok = res.filter((t) => t.st === 'ok').length, bad = res.filter((t) => t.st === 'err').length, run = res.some((t) => t.st === 'run');
    const byCat = (gs) => { const m = new Map(); for (const g of gs) { const c = metaOf(g).cat; if (!m.has(c)) m.set(c, []); m.get(c).push(g); } return m; };
    const catSort = (a, b) => (CAT_ORDER.indexOf(a) + 99) % 99 - (CAT_ORDER.indexOf(b) + 99) % 99;
    const intRow = (g) => {
      const m = metaOf(g), v = valOf(g), warn = v.startsWith('!'), t = testState(g.name);
      return row({ t: m.name, s: m.s, k: g.fields.map((f) => f.label).join(' '), logo: m.domain, ini: m.name, v: t?.v ?? (warn ? v.slice(1) : v), vc: t?.vc ?? (warn ? '#f3b54a' : undefined), btn: 'Oppsett', go: g.name === 'Kalender / timeplan' ? 'kal' : 'int|cfg:' + g.name });
    };
    const mv = mailVal(), mailRow = row({ t: 'Proton Mail', s: 'Kvitteringer fra e-post via Bridge', logo: 'proton.me', v: mv.replace(/^!/, ''), vc: mv.startsWith('!') ? '#f3b54a' : undefined, btn: 'Oppsett', go: 'int|mail' });
    // Prompt 43: Media-tjenestene (Sonarr, Radarr, qBittorrent, Prowlarr, Jellyfin, Plex) i egen gruppe «Media».
    const mediaCfg = cfg.filter((g) => isMedia43(g) && (canEdit(g) || isAdmin())), notMedia = cfg.filter((g) => !isMedia43(g));
    const mineBy = byCat(notMedia.filter(isPersonal)), srvBy = byCat(notMedia.filter((g) => !isPersonal(g)));
    const extraRows = (scope) => integRows(cfg, row, scope);
    const mineRows = [...[...mineBy.keys()].sort(catSort).flatMap((c) => mineBy.get(c).map(intRow)), mailRow, ...extraRows('personal')];
    const srvRows = isAdmin() ? [...[...srvBy.keys()].sort(catSort).flatMap((c) => srvBy.get(c).map(intRow)), ...extraRows('server')] : [];
    return { groups: [
      group('Tilkoblinger', [row({ t: run ? 'Tester …' : 'Test alle tilkoblinger', s: res.length ? `${ok} OK · ${bad} feilet` : 'Sjekker adresse, nøkkel og svar fra hver tjeneste.', btn: run ? 'Tester …' : 'Test alle', act: 'data-test-all', disabled: run })]),
      group('Dine integrasjoner', mineRows, 'Bare du ser og bruker disse verdiene. Hemmeligheter lagres kryptert på serveren og vises aldri igjen.'),
      trackGroup(row, group),
      ((r) => (r.length ? group('Media', r, mediaNote43(isAdmin())) : null))(mediaRows43(mediaCfg, row, tests, isAdmin())),
      srvRows.length ? group('Server (administrator)', srvRows, 'Gjelder hele serveren. Tomme felt bruker verdien fra serverens miljøvariabler (.env).') : null,
    ].filter(Boolean) };
  }
  if (sub === 'mail') return { title: 'Proton Mail', sub: 'Integrasjoner · Kvitteringer fra e-post via Bridge', html: '<div data-mail-host></div>', mount: mountMail };
  if (sub.startsWith('trk37:')) { const v = trackSub(sub.slice(6), note); if (v) return v; sub = null; return intView(); }
  if (sub.startsWith('i24:')) { const v = integSub(sub.slice(4), note); if (v) return v; sub = null; return intView(); }
  if (sub.startsWith('m43:')) { const v = mediaSub43(sub.slice(4), isAdmin()); if (v) return v; sub = null; return intView(); }
  const gname = sub.slice(4), g = cfg.find((x) => x.name === gname);
  if (!g) { sub = null; return intView(); }
  const m = metaOf(g), t = tests[g.name], msg = cfgMsg[g.name], ro = !canEdit(g);
  const fields = g.fields.map((f) => f.type === 'textarea'
    ? `<label class="sg-field area"><span>${esc(f.label)}</span><textarea name="${f.key}" rows="5" spellcheck="false"${ro ? ' readonly' : ''}>${esc(f.value)}</textarea></label>`
    : `<label class="sg-field"><span>${esc(f.label)}</span><input name="${f.key}" type="${f.type}" value="${esc(f.value)}" placeholder="${f.secret ? (f.set ? '•••••••• lagret' : 'ikke satt') : esc(f.placeholder ?? '')}" autocomplete="off" spellcheck="false"${ro ? ' readonly' : ''}>${f.secret && f.set && !ro ? `<button type="button" class="sg-link red" data-clear-secret="${f.key}">Fjern</button>` : ''}</label>`).join('');
  const res = t && t.st !== 'run' ? `<div class="sg-res"><i style="background:${t.st === 'ok' ? '#34c759' : '#f26b5e'}"></i><div><b>${t.st === 'ok' ? 'Tilkoblet' : 'Tilkoblingen feilet'}</b><span>${esc(t.msg)}</span></div><span class="mono">${when(t.at)}${t.ms ? ` · ${t.ms} ms` : ''}</span></div>` : '';
  const med = isMedia43(g), mst = med ? cfgStatus43(g, t) : null;
  const head = `<div class="int-head">${logoImg(m.domain, m.name, 'sg-lg big')}<div><b>${esc(m.name)}</b><span>${esc(m.s)}</span></div>${mst ? `<span class="sg-v m43i-st" style="color:${mst[1]}">${esc(mst[0])}</span>` : ''}</div>`;
  // Prompt 22: Huskeliste ↔ HA To-do under Home Assistant (bare admin, samme innstillinger som på Huskeliste-siden).
  const haTodo = g.name === 'Home Assistant' && !ro ? '<section class="sg"><h3 class="sg-h">Gjøremål</h3><div data-mount-host></div></section>' : '';
  return { mount: haTodo ? mountHaTodo : undefined, title: m.name, sub: `Integrasjoner · ${m.s}`, html: `${head}<form class="sg" data-group="${esc(g.name)}"><h3 class="sg-t">Oppsett</h3><div class="sg-box">${fields}</div>
      ${NOTES[g.name] ? note(NOTES[g.name]) : typeof g.help === 'string' && g.help.trim() && !/```|\n\n/.test(g.help) ? note(esc(g.help)) : ''}</form>
      ${ro ? note('Settes opp av administrator.') : `<div class="sg-acts">${med ? `<button type="button" class="sg-btn" data-m43-cfgsave="${esc(g.name)}">Lagre</button>` : ''}<button class="sg-btn pri" data-test="${esc(g.name)}"${t?.st === 'run' ? ' disabled' : ''}>${t?.st === 'run' ? 'Tester …' : 'Test tilkobling'}</button>
        <span class="${msg ? (msg.ok ? 'green' : 'red') : 'muted'}" style="font-size:13px">${esc(msg?.text ?? 'Endringer lagres automatisk')}</span></div>`}${res}${haTodo}${med ? cfgGuide43(g) : guideHtml(g)}` };
}

/** Veiledning: serverens help (liste med [tittel, tekst, kode] eller tekst med ```kode```), ellers den innebygde. */
function guideHtml(g) {
  let steps = Array.isArray(g.guide) && g.guide.length ? g.guide : Array.isArray(g.help) ? g.help : null;
  if (!steps && !GUIDE[g.name] && typeof g.help === 'string' && g.help.trim() && /```|\n\n/.test(g.help)) {
    const parts = g.help.split(/```(?:\w+)?\n?([\s\S]*?)```/);
    return `<section class="sg"><h3 class="sg-h">Slik setter du det opp</h3><div class="sg-box guide-text">${parts.map((p, i) => (i % 2 ? `<pre class="guide-code">${esc(p.trim())}</pre>` : p.split(/\n{2,}/).filter((x) => x.trim()).map((x) => `<p>${esc(x.trim())}</p>`).join(''))).join('')}</div></section>`;
  }
  steps ??= GUIDE[g.name];
  if (!steps?.length) return '';
  return `<section class="sg"><h3 class="sg-h">Slik setter du det opp</h3><div class="sg-box">${steps.map((st, i) => {
    const [t, d, code] = Array.isArray(st) ? st : [st.title ?? st.t, st.text ?? st.d, st.code];
    return `<div class="guide-step"><span class="guide-no">${i + 1}</span><div><b>${esc(t)}</b>${d ? `<p>${esc(d)}</p>` : ''}${code ? `<pre class="guide-code">${esc(code)}</pre>` : ''}</div></div>`;
  }).join('')}</div></section>`;
}

// Huskeliste-synken med HA beholdes som samme element mellom omtegninger (som Proton-panelet).
let haHost = null;
function mountHaTodo(slot) {
  if (!haHost) { haHost = document.createElement('div'); haHost.className = 'tk tk-set'; mountHa(haHost); }
  slot.replaceWith(haHost);
}

// Proton-panelet tegnes av FinansHub-modulen og beholdes mellom omtegninger av innstillingene.
let mailHost = null, mailMounted = false;
function mountMail(slot) {
  if (!mailHost) { mailHost = document.createElement('div'); mailHost.className = 'mail-host'; }
  slot.replaceWith(mailHost);
  if (mailMounted) return;
  mailMounted = true;
  import('/assets/js/settings-mail.js').then((m) => {
    if (typeof m.mailPane !== 'function') throw new Error('mailPane mangler');
    return m.mailPane(mailHost);
  }).catch(() => {
    mailMounted = false;
    mailHost.innerHTML = box('Proton Mail', row({ t: 'Oppsett i FinansHub', s: 'Henting av kvitteringer fra e-post settes opp under FinansHub → Innstillinger → Import.', btn: 'Åpne', act: 'data-open-fh-mail' }).html);
  });
}

async function runTest(name) {
  tests[name] = { st: 'run' }; render();
  await saving;
  try {
    const r = await api(`/config/test/${encodeURIComponent(name)}`, { method: 'POST' });
    tests[name] = { st: r.ok ? 'ok' : 'err', msg: r.message, ms: r.ms, at: Date.now() };
  } catch (e) { tests[name] = { st: 'err', msg: e.message, at: Date.now() }; }
  render();
}

async function saveGroup(name, changes) {
  cfgMsg[name] = { text: 'Lagrer …', ok: true }; render();
  const p = (async () => {
    try {
      cfg = await api('/config', { method: 'PUT', json: changes });
      const st = await api('/state');
      Object.assign(store.me, { place: st.place, schoolUrl: st.schoolUrl, searchUrl: st.searchUrl });
      (RELOAD[name] ?? []).forEach((k) => load(k));
      cfgMsg[name] = { text: 'Lagret ✓', ok: true };
      delete tests[name];
    } catch (e) { cfgMsg[name] = { text: e.message, ok: false }; }
    render();
  })();
  saving = p.catch(() => {});
  return p;
}

/* ---------- Søk på tvers av sidene ---------- */

const H = { group, row, note };
// Prompt 35: Innstillinger → GLIMT → Glimt (fasit Glimt Brief.dc.html mode="settings"). Samme data som ⚙ i briefen.
const glimtView = () => ({ html: glimtSettingsHtml({ figs: true }), search: [group('Glimt', [
  row({ t: 'Glimt-figur', s: 'Velg vert: Glimt, Halo, Boble, Antenne, Bane, Pastell, Natt, Sky, Dråpe, Ugle, Stjerne, Spire eller Gris', go: 'glimt', btn: 'Åpne', k: 'glimt figur karakter maskot gris ugle sky' }),
  row({ t: 'Glimt-brief', s: 'Morgen-, dags-, kvelds- og nattbrief med klokkeslett', go: 'glimt', btn: 'Åpne', k: 'brief morgenbrief kveldsbrief varsel guide venner' }),
  row({ t: 'Stemme og opplesning', s: 'Les opp, stemmemotor (OpenAI, ElevenLabs, Azure), stemme, språk og tempo', go: 'glimt', btn: 'Åpne', k: 'stemme opplesning les opp tts tale engelsk tempo openai elevenlabs azure' }),
])] });
const VIEWS = { glimt: glimtView, konto: kontoView, look: lookView, top: topView, dom: domView, varsel: () => notifyView(H), app: () => appView({ ...H, sub }), familie: () => fam42View(H, sub), int: intView, kal: () => kalView({ ...H, cfg }), ai: () => aiView(H), users: usersView, system: () => systemView(H), backup: () => backupView(H) };
function searchView() {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean), out = [];
  const saved = sub; sub = null;
  for (const [k, name] of tabsFor()) {
    let v;
    try { v = VIEWS[k](); } catch { continue; }
    for (const g of v.groups ?? v.search ?? []) {
      const rows = g.rows.filter((r) => { const txt = `${r.q} ${g.t} ${name}`.toLowerCase(); return words.every((w) => txt.includes(w)); });
      if (rows.length) out.push({ ...g, t: g.t ? `${name} · ${g.t}` : name, note: '', rows });
    }
  }
  sub = saved;
  const n = out.reduce((a, g) => a + g.rows.length, 0);
  return { title: 'Søkeresultater', sub: n ? `${n} treff for «${q.trim()}».` : 'Prøv et annet ord, for eksempel «2FA», «faner» eller «Sonarr».',
    html: n ? out.map(groupHtml).join('') : `<div class="sg-empty">Ingen innstillinger passer søket «${esc(q.trim())}».</div>` };
}

/* ---------- Ramme ---------- */

function sideHtml() {
  const me = store.me.me ?? {}, name = me.name || me.username || '', warn = warnCount();
  const tabs = tabsFor(), secs = [...new Set(tabs.map((t) => t[3]))], qq = q.trim();
  // Prompt 30: hele profilblokken er en knapp til Konto («Admin · Se konto ›», ingen @brukernavn). Søket har ✦ AI.
  return `<aside class="set-side" aria-label="Innstillinger">
    <div class="set-side-in">
      <button type="button" class="set-me" data-tab="konto" aria-label="Åpne kontoen din" aria-current="${tab === 'konto' && !qq ? 'page' : 'false'}">${me.avatarUrl ? `<span class="set-me-av"><img src="${esc(me.avatarUrl)}" alt=""></span>` : `<span class="set-me-av">${esc(initials(name))}</span>`}
        <span class="set-me-t"><b>${esc(name)}</b><span>${esc(roleName(me.role))} · Se konto ›</span></span></button>
      <div class="set-q${q ? ' has' : ''}${SQ.ai ? ' ai' : ''}" data-sf><span class="sf-ic">${svg(P.search, 18)}</span>${clearBtn()}<input name="setq" value="${esc(q)}" placeholder="${SQ.ai ? 'Spør, f.eks. «hvor bytter jeg bakgrunn?»' : 'Søk i innstillinger'}" autocomplete="off" spellcheck="false" aria-label="Søk i innstillinger" enterkeyhint="search" data-setq><button type="button" class="set-aibtn" data-set-ai aria-pressed="${SQ.ai}" aria-label="AI-søk" title="Spør med egne ord (⌘K / Ctrl+K)"><span class="sai-s" aria-hidden="true">✦</span><span>AI</span></button></div>
      ${qq ? `<div class="set-res">${sideResults(q, (k) => tabOf(ALIAS[k] ?? k)[1])}</div>` : ''}
      <nav class="set-nav${qq ? ' has-q' : ''}">${secs.map((sec) => `<div class="set-sec"><div class="set-sec-t">${esc(sec)}</div>${tabs.filter((t) => t[3] === sec).map(([k, n]) => {
        const on = tab === k && !qq, badge = k === 'int' && warn ? `<span class="set-badge" title="${warn} mangler oppsett">${warn}</span>` : '';
        return `<button type="button" class="set-tab" data-tab="${k}" aria-current="${on ? 'page' : 'false'}">${icBox(k)}<span>${esc(n)}</span>${badge}</button>`;
      }).join('')}</div>`).join('')}</nav>
    </div>
    </aside>`;
}

const NAV41 = { y: 0, x: 0, first: true };
try { NAV41.y = Number(sessionStorage.getItem('innst_nav_y')) || 0; } catch { /* privat modus */ }
function restoreNav41() {
  const si = modal().querySelector('.set-side-in'), nav = si?.querySelector('.set-nav');
  if (!si || !nav || nav.classList.contains('has-q')) return;
  si.scrollTop = NAV41.y; nav.scrollLeft = NAV41.x;
  si.addEventListener('scroll', () => { if (nav.classList.contains('has-q')) return; NAV41.y = si.scrollTop; try { sessionStorage.setItem('innst_nav_y', String(Math.round(si.scrollTop))); } catch { /* */ } }, { passive: true });
  nav.addEventListener('scroll', () => { NAV41.x = nav.scrollLeft; }, { passive: true });
  // Første visning: aktivt punkt synlig (som block: nearest), uten å flytte noe annet enn menyen.
  if (NAV41.first) {
    NAV41.first = false;
    const a = nav.querySelector('.set-tab[aria-current=page]');
    if (a) {
      const r = a.getBoundingClientRect(), c = si.getBoundingClientRect();
      if (si.scrollHeight > si.clientHeight + 1) { if (r.top < c.top) si.scrollTop += r.top - c.top - 8; else if (r.bottom > c.bottom) si.scrollTop += r.bottom - c.bottom + 8; }
      const cn = nav.getBoundingClientRect();
      if (nav.scrollWidth > nav.clientWidth + 1) { if (r.left < cn.left) nav.scrollLeft += r.left - cn.left - 8; else if (r.right > cn.right) nav.scrollLeft += r.right - cn.right + 8; }
      NAV41.y = si.scrollTop; NAV41.x = nav.scrollLeft;
    }
  }
}
const subScroll = new Map(); // fane → scrollTop i listen før en underside ble åpnet
function render() {
  if (!TABS.some(([k]) => k === tab)) tab = ALIAS[tab] ?? TABS[0][0];
  const [, tName, tSub] = tabOf(tab);
  const body = modal().querySelector('.set-body'), key = `${tab}|${sub}|${q ? 'q' : ''}`;
  // Prompt 23: åpnes en underside, huskes posisjonen i listen; går man tilbake, havner man der man var. Nye undersider åpner øverst.
  let keep = body?.dataset.key === key ? body.scrollTop : 0;
  if (body && body.dataset.key !== key) {
    const [pt, ps] = body.dataset.key.split('|'), had = ps && ps !== 'null';
    if (!had && sub && pt === tab) subScroll.set(tab, body.scrollTop);
    else if (had && !sub && pt === tab && !q) { keep = subScroll.get(tab) ?? 0; subScroll.delete(tab); }
  }
  let v;
  try { v = q.trim() && !sub ? searchView() : VIEWS[tab](); }
  catch (e) { console.error(e); v = { html: `<div class="err">Noe gikk galt på denne siden: ${esc(e.message)}. Prøv en annen side eller last inn på nytt.</div>` }; }
  const content = (v.pre ?? '') + (v.groups ? v.groups.map(groupHtml).join('') : v.html) + (v.extra ?? '');
  // Fokus i et tekstfelt beholdes når siden tegnes på nytt (f.eks. etter automatisk lagring eller mens man søker).
  const act = document.activeElement, fk = modal().contains(act) && act.name ? [act.closest('form')?.dataset.group ?? '', act.name, act.selectionStart] : null;
  // Søkefeltet beholdes som samme element (ikke tegnet på nytt), så skriving, markør og tastaturforslag (IME) ikke avbrytes.
  const keepQ = act?.matches?.('[data-setq]') && modal().contains(act) ? act : null;
  // Prompt 30: fullskjerm med «Ferdig»-pille fast øverst til høyre i vinduet, og sidens ikon foran tittelen.
  const searching = q.trim() && !sub;
  // Prompt 39 (claude-code-scroll-stabil-innstillinger.md): samme side tegnes på nytt (lagring, bryter, verdi) → scrollen står stille.
  // Det monterte innholdet (AI-kontroll, Google/HA …) flyttes over til den nye siden i stedet for å tegnes tomt, og siden får
  // midlertidig minst samme høyde, så nettleseren ikke klemmer scrollen til toppen eller bunnen mens noe lastes.
  // Prompt 41 (claude-code-innst-web-meny-scroll.md): sidemenyen står stille når du bytter seksjon. Hele vinduet tegnes på nytt,
  // så menyens scroll (loddrett på bred skjerm, vannrett på smal) lagres før og settes tilbake etter. Under søk huskes posisjonen fra før.
  const oldSide = modal().querySelector('.set-side-in');
  if (oldSide && !oldSide.querySelector('.set-nav.has-q')) { NAV41.y = oldSide.scrollTop; NAV41.x = oldSide.querySelector('.set-nav')?.scrollLeft ?? NAV41.x; }
  const same = !!keep && body?.dataset.key === key, oldMount = same ? body.querySelector('[data-mail-host],[data-mount-host]') : null, oldH = same ? body.querySelector('.set-inner')?.offsetHeight ?? 0 : 0;
  modal().innerHTML = `<div class="set-box" role="dialog" aria-modal="true" aria-labelledby="set-title">${sideHtml()}
    <div class="set-main">${sheetBtn('Ferdig', 'data-close data-set-done', 'pri').replace('class="sbtn pri"', 'class="sbtn pri set-done"')}
    <div class="set-body" data-key="${esc(key)}"><div class="set-inner">
      <header class="set-ph">${sub ? `<button type="button" class="set-back" data-back>${svg(P.back, 18)}${esc(tName)}</button>` : ''}
        <div class="set-ph-row">${searching ? '' : tab === 'konto' && !sub ? kontoAvatar(store.me.me ?? {}) : icBox(tab, 44, 22)}<div class="set-ph-t"><h2 id="set-title">${esc(v.title ?? tName)}</h2><div class="set-ps">${esc(v.sub ?? tSub)}</div></div></div></header>
      ${content}</div></div></div></div>`;
  if (same) {
    const inner = modal().querySelector('.set-inner'), slot = modal().querySelector('[data-mail-host],[data-mount-host]');
    if (oldMount && slot && v.mount && slot.className === oldMount.className) slot.replaceWith(oldMount);
    if (inner && oldH) { inner.style.minHeight = `${oldH}px`; clearTimeout(render.mh); render.mh = setTimeout(() => { const i = modal().querySelector('.set-inner'); if (i) i.style.minHeight = ''; }, 1500); }
  }
  restoreNav41();
  modal().querySelector('.set-body').scrollTop = keep;
  if (keep) requestAnimationFrame(() => { const b = modal().querySelector('.set-body'); if (b && b.dataset.key === key && b.scrollTop < keep - 1) b.scrollTop = keep; });
  if (keepQ) { const nq = modal().querySelector('[data-setq]'); if (nq) { nq.replaceWith(keepQ); keepQ.focus({ preventScroll: true }); } }
  if (v.mount) { const slot = modal().querySelector('[data-mail-host],[data-mount-host]'); if (slot) v.mount(slot); }
  // Prompt 36: ikonbrikker i sidens farge på alle rader (også de som tegnes senere av andre moduler).
  modal().querySelector('.set-main')?.style.setProperty('--pg', (TAB_IC[tab] ?? TAB_IC.app)[0]);
  decorateRows(modal());
  if (!modal().dataset.si36) { modal().dataset.si36 = '1'; new MutationObserver(() => decorateRows(modal())).observe(modal(), { childList: true, subtree: true }); }
  applyHl();
  if (fk && !keepQ) {
    const el = [...modal().querySelectorAll(`[name="${CSS.escape(fk[1])}"]`)].find((e) => (e.closest('form')?.dataset.group ?? '') === fk[0]);
    if (el) { el.focus(); try { el.setSelectionRange(fk[2], fk[2]); } catch { /* range/select */ } }
  }
}

/* ---------- Prompt 34: AI-søket tar deg til siden og markerer elementet (fasit Innstillinger Web goK/hl, hlRing/hlTip) ---------- */
let HL = null, hlT = 0, autoT = 0;
function findHl(a) {
  const m = modal(), A = ANCHORS[a] ?? {};
  let el = m.querySelector(`.set-body [data-hl="${CSS.escape(a)}"]`) ?? (A.sel ? m.querySelector(`.set-body :is(${A.sel})`) : null);
  if (!el && A.title) el = [...m.querySelectorAll('.set-body .sg-row')].find((r) => A.title.test(r.querySelector('.sg-txt b')?.textContent?.trim() ?? ''));
  if (el && A.up) el = el.closest(A.up) ?? el;
  return el;
}
function clearHl() {
  clearTimeout(hlT); HL = null;
  modal().querySelectorAll('.hl-ring').forEach((e) => e.classList.remove('hl-ring'));
  modal().querySelectorAll('.hl-tip').forEach((e) => e.remove());
}
/** Legges på igjen etter hver tegning (sidene tegnes på nytt når data kommer). Scroller bare første gang målet finnes. */
function applyHl() {
  if (!HL) return;
  const el = findHl(HL.a);
  if (!el) { if (Date.now() - HL.t0 < 3000) setTimeout(applyHl, 150); return; }
  el.classList.add('hl-ring');
  const tip = ANCHORS[HL.a]?.tip;
  if (tip && !el.parentElement.querySelector(':scope > .hl-tip')) { el.parentElement.classList.add('hl-host'); el.insertAdjacentHTML('beforebegin', `<span class="hl-tip" role="status">${esc(tip)}</span>`); }
  if (!HL.scrolled) {
    HL.scrolled = true;
    const B = modal().querySelector('.set-body'), r1 = el.getBoundingClientRect(), r0 = B.getBoundingClientRect();
    B.scrollTo({ top: B.scrollTop + r1.top - r0.top - r0.height / 2 + r1.height / 2, behavior: 'smooth' });
    try { navigator.vibrate?.(8); } catch { /* */ }
  }
}
/** Går til et treff i indeksen og markerer målet i 6 s (eller til første trykk). */
function goItem(it, anchor = anchorOf(it)) {
  clearTimeout(autoT);
  const r = (anchor && routeForAnchor(anchor)) || routeOf(it);
  clearHl();
  if (anchor && ANCHORS[anchor]?.acTab) setAiTab(ANCHORS[anchor].acTab);
  resetAsk();
  if (anchor) { HL = { a: anchor, t0: Date.now() }; hlT = setTimeout(clearHl, 6000); }
  const qi = modal().querySelector('[data-setq]'); if (qi) { qi.value = ''; qi.blur(); }
  go(r.sub ? `${r.tab}|${r.sub}` : r.tab);
}
/** Etter AI-svaret: går automatisk dit etter ca. 1,6 s hvis svaret har et mål med mål-id. */
function askGo(val) {
  clearTimeout(autoT);
  ask(val, render, (ans) => { const t = ans?.target; if (t && anchorOf(t)) autoT = setTimeout(() => { if (!modal().hidden && SQ.ans === ans) goItem(t); }, 1600); });
}

/** Åpner en side. «tab|sub», «tab» eller bare «sub» (fanen finnes da ut fra undersiden). Tom streng = listen. */
function go(to) {
  let a = null, b = to ?? '';
  if (b.includes('|')) [a, b] = b.split('|');
  else if (TABS.some(([k]) => k === b) || ALIAS[b]) { a = b; b = ''; }
  a ??= b ? subTab(b) ?? tab : tab;
  tab = ALIAS[a] ?? a;
  sub = b || null;
  q = '';
  enter();
  render();
  syncUrl();
}

function enter() {
  const reload = () => { if (!modal().hidden) render(); };
  if ((tab === 'int' || tab === 'kal' || q) && !cfg) loadCfg();
  if (tab === 'int' && !mail) loadMail();
  if (tab === 'int' || tab === 'kal' || q) loadInteg(reload);
  if (tab === 'int' || q) loadTrackKeys(reload);
  if (tab === 'konto' || tab === 'users' || q) loadLogin(reload);
  if (tab === 'dom' || q) loadDomains(reload);
  if (tab === 'varsel' || q) loadNotify(reload);
  if (tab === 'app' || q) loadApp(reload);
  if (tab === 'familie' || q) loadFam42(reload);
  if (tab === 'ai' || q) loadAi(reload, tab === 'ai');
  if (tab === 'system' || q) loadSystem(reload);
  if (tab === 'backup' || q) loadBackup(reload);
  if (tab === 'glimt') loadGlimt(reload);
}

async function loadCfg() {
  try { cfg = await api('/config'); cfgErr = null; } catch (e) { cfgErr = e.message; }
  if (!modal().hidden) render();
}

export function openSettings(which = 'konto', subPage = null) {
  tab = ALIAS[which] ?? which; sub = subPage; q = '';
  // Undersiden bestemmer fanen (gamle lenker kan peke på feil fane, f.eks. «look/speed»).
  if (sub) tab = subTab(sub) ?? tab;
  if (!TABS.some(([k]) => k === tab)) tab = 'konto';
  resetAsk();
  const wasOpen = !modal().hidden;
  if (!wasOpen) NAV41.first = true;
  render(); modal().hidden = false; modal().querySelector('[data-close]').focus();
  document.body.classList.add('set-open');
  if (!wasOpen) pushUrl();
  loadCfg(); loadMail(); enter(); loadIndex(() => { if (!modal().hidden && q.trim()) render(); });
  loadHistory(true).then(() => { if (!modal().hidden && tab === 'look') render(); });
}
export function closeSettings() {
  if (modal().hidden) return;
  modal().hidden = true;
  document.body.classList.remove('set-open');
  resetAsk();
  // Prompt 30: adressen var #/innstillinger/<fane> mens innstillingene var åpne. Tilbake til siden under.
  if (history.state?.hlSet) { urlBack = true; history.back(); }
}

/* Prompt 30: #/innstillinger/<fane> i adressefeltet mens innstillingene er åpne (pushState, så siden under ikke tegnes på nytt). */
let urlBack = false;
const setHash = () => `#/innstillinger/${tab}${sub && !/[:]/.test(sub) ? `/${sub}` : ''}`;
function pushUrl() { try { history.pushState({ hlSet: 1, under: location.hash || '#/' }, '', location.pathname + location.search + setHash()); } catch { /* */ } }
function syncUrl() { if (!modal().hidden && history.state?.hlSet) try { history.replaceState(history.state, '', location.pathname + location.search + setHash()); } catch { /* */ } }
/** Ble hashendringen laget av innstillingene selv (åpne/lukke)? Da skal ikke siden under tegnes på nytt. */
export const settingsOwnsHash = () => /^#\/innstillinger/.test(location.hash) || (urlBack && !(urlBack = false));

async function saveCats() {
  await api('/settings/categories', { method: 'PUT', json: { value: store.me.categories } });
  emit('receipts');
}

function setSpeed(v) {
  v = Math.min(10, Math.max(1, v));
  store.me.ui.newsSpeed = v; applyTicker(); saveUi({ newsSpeed: v });
}

async function saveLabels(id, name) {
  const labels = { ...(store.me.layout?.labels ?? {}) };
  if (name.trim()) labels[id] = name.trim().slice(0, 30); else delete labels[id];
  await saveLayout({ labels });
  applyNav();
}

async function signOut(forget) {
  if (forget) {
    const d = await api('/devices').catch(() => null), cur = d?.devices?.find((x) => x.current);
    if (cur) await api(`/devices/${cur.id}`, { method: 'DELETE' }).catch(() => {});
  }
  await logout();
}

// Lenker som «/#/innstillinger/system» (fra iOS- og Android-appen) eller «#/innstillinger/look/bg» åpner innstillingene.
function openFromHash() {
  const mm = location.hash.match(/^#\/innstillinger(?:\/([\w-]+))?(?:\/([\w:-]+))?\/?$/);
  if (!mm) {
    // Tilbake (nettleserknapp eller sveip) fra #/innstillinger/…: lukk innstillingene.
    if (!modal().hidden && !history.state?.hlSet) { modal().hidden = true; document.body.classList.remove('set-open'); resetAsk(); }
    return;
  }
  if (history.state?.hlSet && !modal().hidden) return; // vår egen adresse
  // Direkte lenke (fra appene eller en bokmerke): Dashboard under, innstillingene oppå.
  history.replaceState(null, '', location.pathname + location.search + '#/');
  openSettings(mm[1] || 'konto', mm[2] || null);
}

export function bindSettings() {
  const m = modal();
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
  // «Flere valg …» i bakgrunnsmenyen i fotovinduet.
  document.addEventListener('hl:open-settings', (e) => { const [a, b] = String(e.detail ?? 'look/bg').split('/'); openSettings(a, b ?? null); });
  // Prompt 34: markeringen forsvinner ved første trykk (etter at siden er scrollet dit).
  document.addEventListener('hl:reapply', () => { if (HL && !modal().hidden) applyHl(); });
  document.addEventListener('hl:avatar', () => { if (!modal().hidden) render(); }); // prompt 36: nytt profilbilde vises med en gang
  m.addEventListener('pointerdown', (e) => { if (HL?.scrolled && !e.target.closest('[data-setgo]')) clearHl(); });
  m.addEventListener('click', async (e) => {
    if (backdropClick(e, m) || e.target.closest('[data-close]')) return closeSettings();
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; sub = null; q = ''; resetAsk(); enter(); render(); syncUrl(); return; }
    /* Prompt 30: AI-søk. ✦ AI slår spørsmodus av/på, treff og «Åpne … ›» går til siden. */
    if (e.target.closest('[data-set-ai]')) { SQ.ai = !SQ.ai; resetAsk(); render(); m.querySelector('[data-setq]')?.focus(); if (SQ.ai && q.trim()) askGo(q.trim()); return; }
    const sg = e.target.closest('[data-setgo]');
    if (sg) { const it = byId(sg.dataset.setgo) ?? SQ.ans?.target; if (it) goItem(it, sg.dataset.setanchor || anchorFor(it, q)); return; }
    if (e.target.closest('[data-back]')) { sub = null; render(); return; }
    if (e.target.closest('[data-setq-clear]')) { q = ''; render(); m.querySelector('[data-setq]')?.focus(); return; }
    if (e.target.closest('[data-set-lock]')) return signOut(false);
    if (e.target.closest('[data-set-logout]')) { if (confirm('Logge ut av Homelab på denne enheten?')) signOut(true); return; }
    if (e.target.closest('[data-set-logoutall]')) { import('./web38.js').then((m) => m.logoutAll()); return; }
    if (e.target.closest('[data-open-fh-mail]')) { location.href = '/finans/?desktop=1#/inn'; return; }
    if (e.target.closest('[data-hp-edit]')) { closeSettings(); toggleHeadEdit(true); return; }
    if (e.target.closest('[data-gs-ai]')) return go('ai');
    if (tab === 'glimt' && !q.trim() && glimtClick(e, render)) return;
    const g = e.target.closest('[data-go]');
    if (g) return go(g.dataset.go);
    if (await loginClick(e)) return;
    if (await domainsClick(e)) return;
    if (await notifyClick(e)) return;
    if (tab === 'familie' && await fam42Click(e, render)) return;
    if (await appClick(e)) return;
    if (await systemClick(e)) return;
    if (await backupClick(e)) return;

    /* Integrasjoner, Kalendere og AI */
    if (await aiClick(e, render)) return;
    if (kalClick(e, render)) return;
    if (await integClick(e, render)) return;
    if (await mediaClick43(e, render)) return;
    if (await trackClick(e, render)) return;
    const cs43 = e.target.closest('[data-m43-cfgsave]');
    if (cs43) { e.preventDefault(); const n = cs43.dataset.m43Cfgsave; document.activeElement?.blur?.(); await new Promise((r) => setTimeout(r, 30)); await saving; if (!cfgMsg[n] || cfgMsg[n].ok) cfgMsg[n] = { text: 'Lagret ✓', ok: true }; render(); return; }
    const tb = e.target.closest('[data-test]');
    if (tb) { e.preventDefault(); return runTest(tb.dataset.test); }
    if (e.target.closest('[data-test-all]')) { if (cfg) await Promise.all(cfg.filter(canEdit).map((x) => runTest(x.name))); return; }
    const cs = e.target.closest('[data-clear-secret]');
    if (cs) {
      e.preventDefault();
      if (confirm('Fjerne den lagrede hemmeligheten? Verdien fra .env brukes da, hvis den finnes.')) saveGroup(cs.closest('form').dataset.group, { [cs.dataset.clearSecret]: null });
      return;
    }

    /* Startside: forside, meny og faner */
    const mv = e.target.closest('[data-lay-move]');
    if (mv) {
      const [gname, pos, d, other] = mv.dataset.layMove.split(':'), n = { dash: DASH_WIDGETS, m_home: MOBILE_WIDGETS, tabs: NAV_TABS }[gname].length;
      const order = orderOf(gname, n), i = +pos;
      // Fanelisten kan ha skjulte (ikke tillatte) faner imellom; da byttes det med neste synlige.
      const j = gname === 'tabs' && other !== '' ? order.indexOf(+other) : i + +d;
      if (j < 0 || j >= n) return;
      [order[i], order[j]] = [order[j], order[i]];
      await setOrder(gname, order); render(); return;
    }
    const lh = e.target.closest('[data-lay-hide]');
    if (lh) {
      const [kind, id] = lh.dataset.layHide.split(':');
      if (kind === 'w') { const set = hiddenWidgets(); set.has(id) ? set.delete(id) : set.add(id); await saveLayout({ hiddenWidgets: [...set] }); emit('route'); }
      else { const set = new Set(store.me.layout?.hiddenTabs ?? []); set.has(id) ? set.delete(id) : set.add(id); await saveLayout({ hiddenTabs: [...set] }); applyNav(); }
      render(); return;
    }
    if (e.target.closest('[data-tabs-reset]')) {
      if (!confirm('Tilbakestille navn, rekkefølge og synlighet for fanene?')) return;
      await saveLayout({ labels: {}, hiddenTabs: [] });
      await setOrder('tabs', NAV_TABS.map((_, i) => i));
      applyNav(); render(); return;
    }
    const scd = e.target.closest('[data-sc-del]');
    if (scd) { await saveShortcuts((store.me.shortcuts ?? []).filter((_, i) => i !== +scd.dataset.scDel).map(({ name, url }) => ({ name, url }))); return; }
    if (e.target.closest('[data-sc-reset]')) { if (confirm('Tilbakestille snarveiene til standardlisten?')) await saveShortcuts(null); return; }

    /* Utseende */
    const th = e.target.closest('button[data-hl-theme]'); // <html> har også data-hl-theme
    if (th) { await setHlTheme(th.dataset.hlTheme); render(); return; }
    if (e.target.closest('[data-sq-clearall]')) {
      if (!confirm('Tømme hele søkehistorikken?')) return;
      await api('/search/history', { method: 'DELETE' }).catch(() => {}); setHistory([]); sqMsg = 'Historikken er tømt'; render(); return;
    }
    const bgt = e.target.closest('[data-bgtype],[data-bgplanet],[data-bgrotate],[data-bg-anim]');
    if (bgt) {
      const d = bgt.dataset;
      if (d.bgtype === 'custom' && !store.me.layout?.photoCustom && !cachedBg('custom')?.url && !bgPrev?.custom?.image_url) { m.querySelector('[data-bg-custom]')?.click(); return; }
      const patch = d.bgtype ? { type: d.bgtype } : d.bgplanet ? { planet: d.bgplanet } : d.bgrotate ? { rotate: d.bgrotate } : { animate: !bgState().animate };
      bgMsg = '';
      await saveBg(patch);
      const b = bgState();
      store.me.bg = typeToLegacy(b.type, b.planet);
      api('/settings/bg', { method: 'PUT', json: { value: store.me.bg } }).catch(() => {});
      render(); resolveBg(b.type).then(() => { if (!m.hidden && sub === 'bg') render(); });
      return;
    }
    const od = e.target.closest('[data-bg-oslo-del]');
    if (od) {
      if (!confirm('Slette dette Oslo-bildet?')) return;
      try { osloList = (await api(`/background/oslo/${encodeURIComponent(od.dataset.bgOsloDel)}`, { method: 'DELETE' })).items ?? []; } catch (err) { alert(err.message); }
      render(); return;
    }
    const sr = e.target.closest('[data-srch]');
    if (sr) {
      store.me.searchStyle = sr.dataset.srch;
      api('/settings/search_style', { method: 'PUT', json: { value: store.me.searchStyle } });
      if (store.me.hideSearch) { store.me.hideSearch = false; api('/settings/hide_search', { method: 'PUT', json: { value: false } }); menuLabels(); }
      emit('route'); render(); return;
    }
    if (e.target.closest('[data-hp-reset2]')) { resetHead(); render(); return; }
    if (e.target.closest('[data-hp-align]')) { await setHeadAlign(headAlign() === 'right' ? 'left' : 'right'); render(); return; }
    const ss = e.target.closest('[data-speed-step],[data-speed-set]');
    if (ss) { setSpeed(ss.dataset.speedSet ? +ss.dataset.speedSet : (ui().newsSpeed ?? 5) + +ss.dataset.speedStep); render(); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg?.dataset.toggle.startsWith('sq:')) {
      const k = tg.dataset.toggle.slice(3), st = searchState();
      Object.assign(st, await api('/search/settings', { method: 'PUT', json: { [k]: !st[k] } }).catch(() => ({})));
      render(); return;
    }
    if (tg?.dataset.toggle.startsWith('ui:')) {
      const k = tg.dataset.toggle.slice(3), v = !(k === 'newsPause' || k === 'domMap' ? ui()[k] !== false : ui()[k]);
      if (k === 'headLock') await setHeadLock(v); else await saveUi({ [k]: v });
      if (k === 'newsPause') applyTicker();
      if (k === 'domMap') emit('route');
      render(); return;
    }
    if (tg) {
      const k = tg.dataset.toggle === 'search' ? 'hideSearch' : 'hideNews';
      store.me[k] = !store.me[k];
      api(`/settings/hide_${tg.dataset.toggle}`, { method: 'PUT', json: { value: store.me[k] } });
      menuLabels();
      if (k === 'hideNews') renderTicker(); else emit('route');
      render(); return;
    }
    const clr = e.target.closest('[data-clear]');
    if (clr) { store.me.bgCustom = (await api(`/backgrounds/${clr.dataset.clear}`, { method: 'DELETE' })).bgCustom; applyBackground(true); render(); return; }
    if (e.target.closest('[data-cadd]')) { store.me.categories.push({ name: 'Ny', color: '#a8d4fb' }); await saveCats(); render(); return; }
    const del = e.target.closest('[data-cdel]');
    if (del && store.me.categories.length > 1) { store.me.categories.splice(+del.dataset.cdel, 1); await saveCats(); render(); }
  });

  m.addEventListener('submit', async (e) => {
    if (mediaSubmit43(e, render)) return;
    if (await glimtSubmit(e, render)) return;
    if (await systemSubmit(e)) return;
    if (await backupSubmit(e)) return;
    if (await aiSubmit(e, render)) return;
    if (await loginSubmit(e)) return;
    if (await domainsSubmit(e)) return;
    const sf = e.target.closest('[data-sc-form]');
    if (sf) {
      e.preventDefault();
      const list = (store.me.shortcuts ?? []).map((x, i) => ({ name: sf[`n${i}`].value.trim(), url: sf[`u${i}`].value.trim() }));
      if (sf.nnew.value.trim() || sf.unew.value.trim()) {
        let u = sf.unew.value.trim();
        if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
        list.push({ name: sf.nnew.value.trim() || u.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0], url: u });
      }
      saveShortcuts(list); return;
    }
    // Enter i et integrasjonsfelt lagrer feltet (change-hendelsen gjør selve lagringen).
    if (e.target.closest('[data-group],[data-i24]')) { e.preventDefault(); document.activeElement?.blur?.(); }
  });

  let qTimer = null;
  m.addEventListener('input', (e) => {
    if (notifyInput(e) || appInput(e) || systemInput(e) || backupInput(e)) return;
    if (e.target.matches('[data-setq]')) {
      const val = e.target.value;
      clearTimeout(qTimer);
      if (!val.trim()) resetAsk();
      qTimer = setTimeout(() => { const first = !q.trim() && val.trim(); q = val; if (val.trim()) sub = null; if (first) enter(); render(); }, 120);
      return;
    }
    if (e.target.matches('[data-news-speed]')) {
      const v = +e.target.value;
      store.me.ui.newsSpeed = v; applyTicker();
      m.querySelector('[data-speed-n]').textContent = v; m.querySelector('[data-speed-t]').textContent = speedTxt(v);
      m.querySelectorAll('[data-speed-set]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speedSet === v)));
      return;
    }
    const br = e.target.dataset?.bgrange;
    if (br) {
      const v = +e.target.value, r = document.documentElement.style;
      if (br === 'blur') r.setProperty('--bg-blur', `${v}px`); else r.setProperty('--bg-dim', String(v / 100));
      m.querySelector(`[data-bgrange-v="${br}"]`).textContent = `${v} ${br === 'blur' ? 'px' : '%'}`;
      return;
    }
    const k = e.target.dataset?.top;
    if (!k) return;
    store.me.top = { ...store.me.top, [k]: +e.target.value };
    e.target.nextElementSibling.textContent = e.target.value + ' px';
    applyTop();
  });

  m.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-setq]')) return;
    if (glimtChange(e)) return;
    if (backupChange(e)) return;
    if (await aiChange(e, render)) return;
    if (await loginChange(e)) return;
    if (domainsChange(e)) return;
    if (await notifyChange(e)) return;
    if (tab === 'familie' && fam42Change(e)) return;
    if (t.matches('[data-news-speed]')) { saveUi({ newsSpeed: +t.value }); return; }
    if (t.matches('[data-tab-label]')) { await saveLabels(t.dataset.tabLabel, t.value); return; }
    if (kalChange(e, render)) return;
    if (trackChange(e, render)) return;
    if (integChange(e, render)) return;
    const form = t.closest('[data-group]');
    if (form && cfg) {
      const g = cfg.find((x) => x.name === form.dataset.group), f = g?.fields.find((x) => x.key === t.name);
      if (!f || !canEdit(g)) return;
      const v = t.value;
      if (f.secret ? !v : v === f.value) return;
      saveGroup(g.name, { [f.key]: v }); return;
    }
    if (t.matches('[data-sq-import]')) {
      const f = t.files[0]; t.value = '';
      if (!f) return;
      let queries;
      try {
        const data = JSON.parse(await f.text());
        queries = (Array.isArray(data) ? data : []).map((x) => String(x?.title ?? '').match(/^(?:Searched for|Søkte etter|Søkt etter|Har søkt etter)\s+(.+)$/i)?.[1]).filter(Boolean);
      } catch { sqMsg = 'Kunne ikke lese filen'; render(); return; }
      try {
        const r = await api('/search/history/import', { method: 'POST', json: { queries } });
        sqMsg = `${r.imported} søk importert fra Google${r.found > r.imported ? ` (${r.found - r.imported} fantes fra før eller ble kuttet)` : ''}`;
        await loadHistory(true);
      } catch (err) { sqMsg = err.message; }
      render(); return;
    }
    if (t.dataset.top) { const [, key] = TOP.find(([kk]) => kk === t.dataset.top); api(`/settings/${key}`, { method: 'PUT', json: { value: +t.value } }); return; }
    if (t.dataset.bgrange) { await saveBg({ [t.dataset.bgrange]: +t.value }); return; }
    if (t.matches('[data-bg-custom]')) {
      const f = t.files[0];
      if (!f) return;
      try { bgMsg = ''; await uploadCustomPhoto(f); bgPrev && delete bgPrev.custom; bgPrevAt = 0; bgMsg = 'Bildet er lastet opp og valgt'; } catch (err) { alert('Kunne ikke laste opp bildet: ' + err.message); }
      render(); return;
    }
    if (t.matches('[data-bg-oslo]')) {
      const files = [...t.files];
      if (!files.length) return;
      const fd = new FormData(); files.forEach((f) => fd.append('file', f));
      try {
        const r = await api('/background/oslo', { method: 'POST', body: fd }).catch(async (err) => {
          if (err.status !== 404) throw err;
          // Eldre server: ett og ett bilde til de gamle Oslo-plassene.
          for (const f of files) { const one = new FormData(); one.append('file', f); store.me.bgCustom = (await api('/backgrounds/oslo', { method: 'POST', body: one })).bgCustom; }
          return { added: files, items: null };
        });
        if (r.items) osloList = r.items;
        bgMsg = `${r.added?.length ?? files.length} bilde${(r.added?.length ?? files.length) === 1 ? '' : 'r'} lagt til${r.errors?.length ? ` · ${r.errors.join(', ')}` : ''}`;
        if (bgState().type === 'oslo') { bgPrevAt = 0; document.dispatchEvent(new Event('hl:bg')); }
      } catch (err) { alert(err.message); }
      render(); return;
    }
    if (t.dataset.ci !== undefined) {
      const cat = store.me.categories[+t.dataset.ci];
      const v = t.value.trim();
      if (t.dataset.ck === 'name' && v) cat.name = v.slice(0, 30); else if (t.dataset.ck === 'color') cat.color = v;
      await saveCats();
    }
  });
  m.addEventListener('keydown', (e) => {
    appKey(e);
    // Enter i søket: spørsmål (✦ AI på, mellomrom eller ?) → AI-svar; ellers rett til beste treff.
    if (e.key === 'Enter' && e.target.matches?.('[data-setq]')) {
      e.preventDefault();
      const val = e.target.value.trim();
      if (!val) return;
      clearTimeout(qTimer); q = e.target.value;
      if (wantsAi(val)) { askGo(val); return; }
      const top = topHit(val);
      if (top) goItem(top, anchorFor(top, val)); else askGo(val);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (m.hidden) return;
    // ⌘K / Ctrl+K: fokus i søkefeltet.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const i = m.querySelector('[data-setq]'); i?.focus(); i?.select(); return; }
    if (e.key === 'Escape') {
      e.preventDefault(); // Kalender i fullskjerm skal ikke lukkes av samme tastetrykk
      if (systemEsc() || backupEsc()) return;
      if (domainsEsc()) return; // Domener-guiden lukkes først
      if (e.target.matches?.('[data-setq]') && (q || SQ.askQ)) { q = ''; resetAsk(); render(); m.querySelector('[data-setq]')?.focus(); return; }
      if (sub && !e.target.closest?.('input,textarea,select')) { sub = null; render(); } else closeSettings();
    }
  });
}

// Innstillinger i mobilappen: hovedside med gruppene Konto, App og System, og én underside per gruppe.
// Valg som bare gjelder denne enheten lagres i localStorage (fh_mprefs); AI og varsler for kvitteringer/budsjett på serveren.
import * as P29 from './mobile-p29.js';
import { S, api, esc, n0, ini, icon, loadBoot, loadSummary, hlApi } from './core.js';
import { m, draw, flash, pref, setPref, theme, iosBg, isIOS, meName, avInner, avatarUrl, loadMe, startScr, domOk, HLTABS, FINTABS, FIXED_HL, FIXED_FIN, tabName } from './mobile.js';
import { LAY, saveLayout } from './mobile-hl.js';
import { SEEDS, MODES } from './mobile-theme.js';
import { haptic, hpref, setHap, canVibrate, HAP_TYPES } from './mobile-haptics.js';
import { paper, saveDesign, paperState, photoChoices } from './mobile-paper.js';
import { tabEditor, iconThemeRow, iconColor, iconInk } from './mobile-p16.js';
import { navSettings } from './mobile-paper3.js';
import { TR, trkLoad, trkPrefRows, setTrkPref } from './mobile-track.js';
import * as P23 from './mobile-p23.js';
import * as P24 from './mobile-p24.js';
import * as P26 from './mobile-p26.js';
import { row, grp } from './mobile-p17.js';
import { haSection } from './mobile-p22.js';
import { p17SetMain, p17Modules, p17AiExtra, p17Varsler, aiLoad, notifyLoad, NT, canSrv, ADMIN_NOTE } from './mobile-p17.js';
import * as P27 from './mobile-p27.js';
import * as P33 from './mobile-p33.js'; // prompt 33: GLIMT HUSKER
import * as P32 from './mobile-p32.js'; // prompt 32: GLIMT I SØKEFELTET, fanelinje på andre sider
import { updLoad, updPage, updSummary, updAdmin, updBind } from './mobile-upd.js';

const T = { f: {}, ai: null, bk: null, srch: null, tokens: null, devices: null, newTok: '', nt: { name: '', scopes: ['receipts:write'], exp: '90' }, ping: '', lastSync: null, usage: null };
const SCOPES = ['receipts:write', 'read:transactions', 'read:summary', 'read:budget', 'write:transactions', 'finance:read'];
const VERSION = '2.5.0';

export async function settingsLoad(sub) {
  const jobs = [];
  if (!sub || sub === 'tok') jobs.push(api('/tokens').then((x) => { T.tokens = x; }).catch(() => { T.tokens = T.tokens ?? []; }));
  if (sub === 'sik') jobs.push(fetch('/api/devices').then((r) => (r.ok ? r.json() : null)).then((x) => { T.devices = x; }).catch(() => { T.devices = null; }));
  if ((sub === 'notif' || sub === 'varsler') && !TR.data?.prefs) jobs.push(trkLoad().catch(() => {}));
  if (sub === 'varsler' || (!sub && !NT.d)) jobs.push(notifyLoad().catch(() => {}));
  if (sub === 'fai') jobs.push(aiLoad().catch(() => {}), loadBoot().catch(() => {}));
  if (sub === 'data') jobs.push(navigator.storage?.estimate?.().then((x) => { T.usage = x.usage; }).catch(() => {}));
  if (sub === 'oppd' || (!sub && updAdmin())) jobs.push(updLoad());
  if (String(sub ?? '').startsWith('sysbk') || (!sub && P29.isAdmin())) jobs.push(P29.bkLoad());
  if (sub === 'bk') jobs.push(api('/backup').then((x) => { T.bk = x; }).catch(() => { T.bk = null; }));
  if (sub === 'sokbar') jobs.push(hlApi('/search/history').then((x) => { T.srch = { suggest: x?.suggest !== false, save: x?.save !== false, n: (x?.items ?? []).length }; }).catch(() => { T.srch = null; }));
  if (['fai', 'kat', 'regel', 'bank', 't212'].includes(sub)) jobs.push(loadBoot().catch(() => {}));
  await Promise.all(jobs);
  T.lastSync ??= new Date();
}

/* ---------- Byggeklosser ---------- */

const ios = () => theme() === 'ios';
const G = (title, rows, note = '') => `${title ? `<div class="sec">${title}</div>` : ''}<div class="list ${ios() ? 'glass2' : ''}">${rows.filter(Boolean).join('')}</div>${note ? `<div class="snote">${note}</div>` : ''}`;
// Ikonfargene følger fargetemaet under Innstillinger → Ikonfarger (Standard = dagens farger).
const nav = (k, label, sub, ic, color) => { const c = iconColor(k, color); return `<a class="opt-row" href="#/set/${k}"><span class="set-ic fill" style="background:${c}">${icon(ic, 17, iconInk(c))}</span><span class="m-grow">${label}</span>${sub ? `<span class="sval">${esc(sub)}</span>` : ''}<span style="opacity:.5">›</span></a>`; };
const tog = (id, label, sub, on) => `<button class="opt-row" data-stog="${id}" role="switch" aria-checked="${!!on}"><span class="m-grow"><b style="font-weight:500">${label}</b>${sub ? `<br><span style="font-size:13px;opacity:.65">${sub}</span>` : ''}</span><span class="sw" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
const chips = (id, label, opts, cur, multi = false) => `<div class="opt-row col"><span style="font-size:13px;opacity:.7">${label}</span><div class="schips">${opts.map(([k, n]) => { const on = multi ? cur.includes(k) : cur === k; return `<button class="chip" data-schip="${id}" data-v="${esc(k)}" aria-pressed="${on}">${on && !multi ? '✓ ' : ''}${esc(n)}</button>`; }).join('')}</div></div>`;
// Prompt 28 (claude-code-konto-farger.md): faste mørk-tema-farger byttes til palett-tokens, så lyst tema får lab/pos fra
// aktivt tema (#b23a2a/#2f7a4f i lyst Papir) og mørkt tema beholder laks/grønn.
const TOK = { '#FF8A80': 'var(--pp-lab,#FF8A80)', '#f08a76': 'var(--pp-lab,#f08a76)', '#FFB08A': 'var(--pp-lab,#FFB08A)', '#FFB68A': 'var(--pp-lab,#FFB68A)', '#7BE3A0': 'var(--pp-pos,#7BE3A0)', '#F2B56B': 'var(--pp-warn,#F2B56B)' };
const tok = (c) => TOK[c] ?? c;
const val = (label, v, color = '') => `<div class="opt-row"><span class="m-grow">${label}</span><span class="sval" style="${color ? `color:${tok(color)};opacity:1` : ''}">${v}</span></div>`;
const btn = (label, act, color = 'var(--m-acc)') => `<button class="opt-row" data-sact="${act}"><span class="m-grow" style="color:${tok(color)};font-weight:${TOK[color] ? 700 : 500}">${label}</span></button>`;
const inp = (k, label, v, ph = '', type = 'text') => `<label class="opt-row col"><span style="font-size:13px;opacity:.7">${esc(label)}</span><input class="sinp" id="m-s-${k}" data-sinp="${k}" type="${type}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off"></label>`;
const link = (label, href, sub = '') => `<a class="opt-row" href="${href}"><span class="m-grow">${label}${sub ? `<br><span style="font-size:13px;opacity:.65">${sub}</span>` : ''}</span><span style="opacity:.5">›</span></a>`;

function profile(big = false) {
  const me = m.me ?? {};
  const sz = big ? 58 : 44;
  return `<a class="opt-row" href="#/set/konto"><span class="m-av${avatarUrl() ? ' img' : ''}" style="width:${sz}px;height:${sz}px;font-size:${big ? 22 : 17}px">${avInner()}</span><span class="m-grow"><b style="font-size:${big ? 19 : 16}px;font-weight:600">${esc(meName())}</b><br><span style="font-size:13px;opacity:.65">${me.username ? `@${esc(me.username)}` : 'FinansHub'}${me.role ? ` · ${esc(me.role)}` : ''} · ${esc(me.serverName || location.host)}</span></span><span style="opacity:.5">›</span></a>`;
}
const PAGES = { integ: 'Integrasjoner', kal: 'Kalendere', varsler: 'Varsler og haptikk', mod: 'Moduler', profil: 'Profil', bakgrunn: 'Bakgrunn', fanelinje: 'Fanelinje', konto: 'Kontoer', sik: 'Sikkerhet', tok: 'API-tokens', look: 'Utseende', nav: 'Navigasjonslinje', dom: 'Domener', scan: 'Skanning og AI', notif: 'Varsler', hap: 'Haptikk', sokbar: 'Søkebar', srv: 'Server og synk', data: 'Data og lagring', om: 'Om FinansHub', fai: 'AI og tolkning', kat: 'Kategorier', regel: 'Regler', bank: 'Bank og import', t212: 'Aksjer · Trading 212', bk: 'Backup og data', oppd: 'Oppdatering', sysbk: 'Backup' };
const when = (t) => (t ? new Date(t).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'aldri');
const aiMode = () => { const st = S.boot?.settings ?? {}; return st.provider === 'gemini' ? 'gemini' : st.provider === 'groq' ? 'groq' : st.fallback ? 'both' : 'ollama'; };

/** Tittelen i Papir-toppbildet for en underside. */
export const setTitle = (sub) => PAGES[String(sub ?? '').split('/')[0]] ?? null;
export function settingsView(th, sub) {
  const [s0, s1 = ''] = String(sub ?? '').split('/'), page = PAGES[s0] ? s0 : '';
  // Papir: toppbildet har tittelen og «‹ Innstillinger», så undersidene starter rett på innholdet.
  const head = paper() ? '' : page
    ? `<div class="m-row">${th === 'ios' ? `<a class="gback" href="#/set" aria-label="Tilbake til Innstillinger">${icon('chev', 20, 'currentColor', 2.6)}</a>` : '<a class="back" href="#/set" aria-label="Tilbake til Innstillinger">←</a>'}</div><div class="title" style="font-size:${th === 'ios' ? 30 : 32}px">${PAGES[page]}</div>`
    : `<div class="title" style="padding:6px 4px 0">Innstillinger</div>`;
  return `${head}${page ? PAGE[page](th, s1) : main(th)}`;
}

// Papir: tema, bakgrunn og nyhetsleser øverst (Mobil Papir App → Innstillinger), resten som før.
const PHOTO_N = { cur: 'Ingen', oslo: 'Oslo', weather: 'Vær', planets: 'Planeter', custom: 'Eget bilde' };
function paperTop() {
  const md = pref('paperMode'), r = (k, n, s2) => `<button class="opt-row" data-sact="ppmode" data-v="${k}"><span class="m-grow"><b style="font-weight:600">${n}</b><br><span style="font-size:13px;opacity:.65">${s2}</span></span><span class="sval" style="${md === k ? 'color:var(--pp-pos);opacity:1;font-weight:600' : ''}">${md === k ? '✓ Valgt' : ''}</span></button>`;
  return `${G('Tema', [r('lys', 'Papir · lys', 'Lyst papir og svart fanelinje'), r('mork', 'Papir · mørk', 'Kveldspapir og lys fanelinje'), r('auto', 'Papir · følg systemet', 'Lys om dagen, mørk når telefonen er mørk'),
    `<button class="opt-row" data-sact="design" data-v="klassisk"><span class="m-grow"><b style="font-weight:600">Klassisk (Liquid Glass / Material You)</b><br><span style="font-size:13px;opacity:.65">Bytt tilbake til det forrige mobildesignet</span></span><span class="sval" style="color:var(--pp-lab);opacity:1;font-weight:600">Bytt ›</span></button>`])}
    ${G('Tilpass', [nav('profil', 'Profil', m.me?.username ? `@${m.me.username}` : '', 'users', '#5E8BFF'), nav('bakgrunn', 'Bakgrunn på Hjem', PHOTO_N[pref('photo')] ?? 'Ingen', 'look', '#FF9F0A'), nav('fanelinje', 'Fanelinje', 'Faner, navn og ikoner', 'list', '#5E5CE6'), link('<b style="font-weight:600">Nyhetsleser</b>', '#/nyheter', 'Kilder, kategorier og AI')])}
    <div class="sec">Ikonfarger</div>${iconThemeRow()}
`;
}

function main() {
  // Papir: samme gruppering som designet (Konto, Finans, appnavnet, App, Logg ut og versjon).
  // Prompt 24: søk og ✦ AI-søk øverst, så PROFIL, så resten.
  if (paper()) return P24.setTop(row, grp, p17SetMain({ tokens: T.tokens }));
  const st = S.boot?.settings ?? {};
  return `${paper() ? paperTop() : ''}${G('', [profile(true)])}
    ${G('Konto', [nav('konto', 'Kontoer og brukere', '1 på enheten', 'users', '#5E8BFF'), nav('sik', 'Sikkerhet', m.me?.totp ? '2FA på' : '', 'shield', '#34C759'), nav('tok', 'API-tokens', T.tokens ? `${T.tokens.length} aktive` : '', 'key', '#FF9F0A')])}
    ${G('App', [nav('look', 'Utseende', '', 'look', '#BF5AF2'), nav('scan', 'Skanning og AI', pref('scanTap') === 'cam' ? 'Kamera' : 'Vis valg', 'cam', '#FF7A3D'), nav('notif', 'Varsler', st.nRc ? 'På' : '', 'bell', '#FF453A'), nav('hap', 'Haptikk', hpref('hap') ? 'På' : 'Av', 'vib', '#FF2D55'), nav('sokbar', 'Søkebar', 'Google', 'search', '#0A84FF')])}
    ${G('Finans', [nav('fai', 'AI-motor', !canSrv() ? ADMIN_NOTE : st.provider === 'gemini' ? 'Gemini' : st.fallback ? 'Ollama + Gemini' : 'Ollama', 'ai', '#FF7A3D'), nav('kat', 'Kategorier', String((S.boot?.categories ?? []).length), 'cat', '#30D158'), nav('regel', 'Regler', String((S.boot?.rules ?? []).length), 'rule', '#5E5CE6'), nav('bank', 'Bank og import', st.csvProfile ?? '', 'bank', '#0A84FF'), nav('t212', 'Aksjer · Trading 212', st.t212Set ? (st.t212Env === 'demo' ? 'Demo' : 'Live') : 'Ikke koblet', 'aks', '#64D2FF'), nav('bk', 'Backup og data', '', 'backup', '#8E8E93')])}
    ${G('System', [nav('srv', 'Server og synk', '', 'srv', '#64D2FF'), nav('data', 'Data og lagring', '', 'db', '#8E8E93'), nav('om', 'Om FinansHub', VERSION, 'info', '#8E8E93')])}
    ${G('', [btn(`Logg ut ${esc(meName())}`, 'logout', '#FF8A80')])}`;
}

const PAGE = {
  // Prompt 26: gruppert liste som på web og egen side per integrasjon (#/set/integ/<id>). Eldre server: forrige side.
  integ: (th, sub) => P26.integPage26(P23.integPage(haSection()), sub),
  kal: () => P26.kalSetPage(),
  sysbk: () => P29.backupPage(), // Prompt 29: backup av hele systemet (bare admin)
  oppd: () => updPage(G), // Prompt 28: oppdater hele systemet (bare admin) // Prompt 26: Innstillinger → Kalendere (Skole-iCal, Canvas, Google Kalender og Home Assistant)
  varsler: () => p17Varsler(trkPrefRows()),
  mod: () => p17Modules(),
  profil: () => {
    const me = m.me ?? {};
    return `<div class="pp-card p16-prof"><label class="p16-pav"><span class="m-av${avatarUrl() ? ' img' : ''}" style="width:84px;height:84px;font-size:32px">${avInner()}</span><span class="p16-pedit">Bytt bilde</span><input class="m-file" type="file" accept="image/*" data-avatar></label>
        <b class="pp-serif" style="font-size:24px">${me.username ? `@${esc(me.username)}` : esc(meName())}</b><span class="pp-mut">${esc(meName())}${me.role ? ` · ${me.role === 'admin' ? 'Administrator' : 'Bruker'}` : ''}</span></div>
      ${G('Konto', [val('Brukernavn', me.username ? `@${esc(me.username)}` : '–'), val('Rolle', me.role === 'admin' ? 'Administrator' : me.role ? 'Bruker' : '–'), val('Tofaktor', me.totp ? '● På' : '○ Av', me.totp ? '#2f7a4f' : ''), avatarUrl() ? btn('Fjern profilbildet', 'avdel', '#b23a2a') : ''], 'Profilbildet vises i alle appene og i Homelab på PC. Navn og brukernavn endres av admin i Homelab → Innstillinger → Brukere.')}
      ${G('', [nav('konto', 'Kontoer og brukere', '', 'users', '#5E8BFF'), nav('sik', 'Sikkerhet', me.totp ? '2FA på' : '', 'shield', '#34C759')])}
      ${G('', [btn('Logg ut', 'logout', '#b23a2a')])}`;
  },
  bakgrunn: () => `${photoChoices()}<div class="snote">Bakgrunnen vises øverst på Hjem, i Papir og klassisk. «Vær» følger været der du er (MET), «Planeter» viser Jorda, Månen, Jupiter, Mars og Saturn fra NASA (ny hver dag), og «Oslo» er Oslo fra luften. Bildene lastes ned og skaleres av serveren din, og appen lagrer dem for bruk uten nett. «Kun på Wi-Fi» finnes i de native appene.</div>`,
  fanelinje: () => `<div class="sec">Hovedlinja</div>${tabEditor()}<div class="pp-col pp-navset" style="gap:8px">${navSettings()}</div>`,
  konto: () => `${G('Profilbilde', [`<label class="opt-row"><span class="m-av${avatarUrl() ? ' img' : ''}" style="width:44px;height:44px">${avInner()}</span><span class="m-grow" style="color:var(--m-acc);font-weight:500">${avatarUrl() ? 'Bytt profilbilde' : 'Last opp profilbilde'}</span><input class="m-file" type="file" accept="image/*" data-avatar></label>`, avatarUrl() ? btn('Fjern bildet', 'avdel', '#FF8A80') : ''], 'Velg fra Bilder, Filer eller ta et nytt bilde. Samme bilde vises i Homelab.')}
    ${G('På denne enheten', [profile(), val('Status', '✓ Aktiv', '#7BE3A0')],
    'Nettappen er logget inn med én konto om gangen. Flere kontoer i samme app, og raskt bytte ved å holde inne profilbildet, finnes i iOS- og Android-appene.')}
    ${G('Brukere', [link('Administrer brukere', '/', 'Homelab → Innstillinger → Innlogging')], 'Nye brukere opprettes av admin i Homelab. Hver bruker har egne tokens og varsler.')}
    ${G('', [btn('Logg ut', 'logout', '#FF8A80')])}`,

  sik: () => {
    const d = T.devices;
    const tfa = m.me?.totp;
    return `${G('Lås', [tog('lock', 'Krev innlogging etter tid i bakgrunnen', 'Face ID og fingeravtrykk finnes i de native appene', pref('lock')),
        chips('lockAfter', 'Lås etter', [['0', 'Umiddelbart'], ['1', '1 min'], ['5', '5 min'], ['15', '15 min']], pref('lockAfter')),
        tog('appHide', 'Skjul beløp i appveksleren', 'Uskarpt bilde når du bytter app', pref('appHide'))])}
      ${G('Tofaktor', [val(`2FA for ${m.me?.username ? '@' + esc(m.me.username) : 'kontoen'}`, tfa === undefined ? '–' : tfa ? '● På · TOTP' : '○ Av', tfa ? '#7BE3A0' : tfa === false ? '#F2B56B' : ''), link(tfa ? 'Administrer 2FA' : 'Sett opp 2FA', '/', 'Homelab → Innstillinger → Innlogging')],
        'Bruk en autentiseringsapp som 1Password, Google Authenticator eller Aegis.')}
      ${G('Pålitelige enheter', d?.devices?.length ? d.devices.map((x) => val(`${esc(x.name)}${x.current ? ' · denne' : ''}`, when(x.lastSeen), x.current ? '#7BE3A0' : '')) : [val('Ingen pålitelige enheter', '')],
        d ? (d.lan ? 'Du er på lokalt nett nå.' : 'Du er ikke på lokalt nett nå. Fra internett kreves alltid passord.') : '')}`;
  },

  tok: () => {
    const nt = T.nt;
    return `${T.newTok ? G('Nytt token', [`<button class="opt-row col" data-sact="copy"><span style="font-size:13px;color:var(--m-acc)">Kopier nå – vises bare én gang</span><code class="tok">${esc(T.newTok)}</code></button>`]) : ''}
      ${G('Aktive', (T.tokens ?? []).map((t) => `<div class="opt-row"><span class="m-grow"><b style="font-weight:500">${esc(t.name)}</b><br><span style="font-size:12px;opacity:.6">${esc((t.scopes ?? []).join(' '))}</span><br><span style="font-size:12px;opacity:.6">Laget ${when(t.created)} · brukt ${when(t.lastUsed ?? t.last_used)} · ${t.expires ? `utløper ${when(t.expires)}` : 'utløper aldri'}</span></span><button class="mini danger" data-sact="revoke" data-id="${esc(t.id)}" aria-label="Trekk tilbake ${esc(t.name)}">${icon('close', 16)}</button></div>`).concat(T.tokens?.length ? [] : [val('Ingen aktive tokens', '')]),
        'Tokens brukes av snarveier, Home Assistant og skript. De gir bare tilgangen du velger og kan trekkes tilbake når som helst.')}
      ${G('Lag nytt token', [`<label class="opt-row col"><span style="font-size:13px;opacity:.7">Navn</span><input class="sinp" data-ntname value="${esc(nt.name)}" placeholder="f.eks. Kvitteringssnarvei" autocomplete="off"></label>`,
        chips('ntscope', 'Tilganger', SCOPES.map((s) => [s, s]), nt.scopes, true),
        chips('ntexp', 'Utløper', [['30', '30 d'], ['90', '90 d'], ['365', '1 år'], ['', 'Aldri']], nt.exp),
        btn('Lag token', 'mktok')])}`;
  },

  look: (th) => {
    // Papir: tema, profil, bakgrunn, fanelinje og ikonfarger (Utseende og fanelinje).
    if (paper()) return paperTop() + P32.secNavSettings(); // Prompt 32: FANELINJE · ANDRE SIDER
    const cur = (() => { try { return localStorage.getItem('fh_theme') || 'auto'; } catch { return 'auto'; } })();
    const st = { hl: 'homelab', hjem: 'fin-hjem', liste: 'fin-liste', budsjett: 'fin-budsjett' }[startScr()] ?? 'homelab';
    return `${G('Mobildesign', [chips('mdesign', 'Design', [['klassisk', 'Klassisk'], ['papir', 'Papir']], pref('mDesign'))],
        '«Papir» er det nye felles designet for iPhone og Android: lyst eller mørkt papir, fotovindu øverst, Siste nytt og en ny fanelinje. «Klassisk» er Liquid Glass eller Material You. Valget lagres på kontoen.')}
      ${paper() ? G('Papir', [chips('ppMode', 'Lys eller mørk', [['auto', 'Følg systemet'], ['lys', 'Lys'], ['mork', 'Mørk']], pref('paperMode'))]) : ''}
      ${paper() ? '' : `${G('Designstil', [chips('theme', 'Utseende på denne enheten', [['auto', `Automatisk (${isIOS() ? 'iOS' : 'Android'})`], ['ios', 'iOS · Liquid Glass'], ['and', 'Android · Material 3']], cur)],
        'Samme skjermer, data, kontoer og innstillinger i begge stilene. Valget gjelder bare denne enheten, og du bytter tilbake her.')}
      ${th === 'ios' ? G('Bakgrunn', [tog('iosbg', 'Fargebakgrunn', 'Fargede lysflekker bak glassflatene', iosBg())]) : ''}
      ${th === 'and' ? `${G('Farger', [chips('m3Seed', 'Fargetema', Object.entries(SEEDS).map(([k, [n]]) => [k, n]), pref('m3Seed'))], '«Følg systemet» bruker Material You-fargen fra telefonen når nettleseren gir tilgang til den (Android 12 og nyere), ellers oransje. Fargene regnes ut i OKLCH med faste toner per rolle. Grønt, rødt og Domener-rosa følger ikke aksentfargen.')}
      ${G('Modus', [chips('m3Mode', 'Lys eller mørk', Object.entries(MODES), pref('m3Mode'))])}
      ${G('Sider', [chips('pageColors', 'Farger på sidene', [['same', 'Samme overalt'], ['per', 'Egen farge per side']], pref('pageColors'))], '«Samme overalt» gir Domener, Mat, Finans og resten samme fargetema. «Egen farge per side» gir Domener sin rosa farge.')}` : ''}
      `}${G('Oppstart', [chips('startL', 'Startside', [['homelab', 'Homelab'], ['fin-hjem', 'Finans · Hjem'], ['fin-liste', 'Finans · Liste'], ['fin-budsjett', 'Finans · Budsjett']], st)],
        st === 'homelab' ? 'Appen åpner på Homelab. Finans, Mat og Domener ligger bak profilbildet.' : 'Appen åpner i Finans, og hjem-knappen går til Finans. Homelab og de andre modulene ligger bak profilbildet.')}
      ${G('Navigasjonslinje', [nav('nav', 'Endre navn, rekkefølge og skjul faner', '', 'list', '#5E5CE6')],
        'Pila øverst til venstre («‹ Homelab» eller «‹ Finans») går alltid tilbake til startsiden.')}
      ${G('Personvern', [tog('hideAmt', 'Skjul beløp til jeg trykker', 'Viser •••• i stedet for tall på Hjem', pref('hideAmt'))])}`;
  },

  nav: (th) => {
    const L = LAY();
    const rows = (key, def, fixed, pre) => L[key].map((id, i, a) => {
      if (def[id]?.[0] === 'dom' && !domOk()) return '';
      const hid = !!L.hide[id] && !fixed.includes(id), def0 = def[id][1];
      return `<div class="opt-row navrow"><input class="sinp navname" data-navname="${pre}.${id}" value="${esc(L.names?.[`${pre}.${id}`] ?? '')}" placeholder="${esc(def0)}" maxlength="30" aria-label="Navn på ${esc(def0)}" style="opacity:${hid ? 0.45 : 1}">
        <button class="mini" data-sact="navmv" data-k="${key}" data-i="${i}" data-j="${i - 1}" aria-label="Flytt ${esc(def0)} opp" ${i ? '' : 'disabled style="opacity:.3"'}>▲</button><button class="mini" data-sact="navmv" data-k="${key}" data-i="${i}" data-j="${i + 1}" aria-label="Flytt ${esc(def0)} ned" ${i < a.length - 1 ? '' : 'disabled style="opacity:.3"'}>▼</button>
        ${fixed.includes(id) ? '<span class="sval" style="width:51px;text-align:center">Alltid</span>' : `<button class="swb" data-sact="navtog" data-id="${id}" role="switch" aria-checked="${!hid}" aria-label="Vis ${esc(def0)}"><span class="sw" aria-checked="${!hid}"></span></button>`}</div>`;
    }).join('');
    return `${G('Homelab', [rows('hlTabs', HLTABS, FIXED_HL, 'hl')])}${G('Finans', [rows('finTabs', FINTABS, FIXED_FIN, 'fin')], 'Et tomt navn gir standardnavnet. Endringene gjelder iPhone, Android og brettbar, og lagres på kontoen din.')}
      ${G('', [btn('Tilbakestill navigasjon', 'navreset', '#FF8A80')])}`;
  },

  dom: () => `${G('Domener', [link('Administrer domener', '#/dom/admin', 'Legg til eller fjern domener'), link('Åpne Domener', '#/dom')], 'Listen deles med Homelab på PC. API-token per domene legges inn på web: Homelab → Innstillinger → Domener.')}`,

  scan: () => `${G('Skanneknappen', [chips('scanTap', 'Trykk på skann', [['cam', 'Åpne kamera'], ['sheet', 'Vis valg']], pref('scanTap'))], 'Hold inne skanneknappen for å velge fra Bilder eller Filer.')}
    ${G('Bilde', [tog('crop', 'Beskjær automatisk', 'Hold kvitteringen innenfor rammen i kameraet', pref('crop')), tog('origImg', 'Lagre originalbildet', 'Lagres sammen med kvitteringen på serveren', pref('origImg')), tog('wifi', 'Last opp bare på Wi-Fi', 'Ellers settes filer i kø', pref('wifi'))])}
    ${G('AI-motor', [chips('ai', 'Leses av', [['ollama', 'Ollama lokalt'], ['gemini', 'Gemini'], ['both', 'Ollama + Gemini']], aiMode())], 'Med «Ollama lokalt» forlater ingen kvitteringer hjemmenettet. «Ollama + Gemini» bruker Gemini som reserve.')}`,

  notif: () => {
    const st = S.boot?.settings ?? {};
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return `${G('Send varsel når', [tog('srv:nRc', 'Kvittering er lest', 'Når AI er ferdig og noe må bekreftes', st.nRc), tog('srv:n80', 'Budsjett passerer 80 %', '', st.n80), tog('nSub', 'Abonnement trekkes snart', 'Dagen før trekk', pref('nSub')), tog('nDom', 'Domene eller SSL utløper', '30 og 7 dager før', pref('nDom')), tog('nWeek', 'Ukesoppsummering', 'Søndag kl. 18', pref('nWeek'))],
      perm === 'denied' ? 'Varsler er blokkert i nettleseren. Tillat dem i nettleserens innstillinger for dette nettstedet.' : perm === 'unsupported' ? 'Denne nettleseren støtter ikke varsler. Legg FinansHub til på Hjem-skjermen, eller bruk de native appene.' : 'Nettappen varsler mens den er åpen i bakgrunnen. Push-varsler når appen er lukket finnes i de native appene.')}
      ${G('Sporing', trkPrefRows(), 'Gjelder pakker i Sporing-fanen i Homelab. Standard er alle på, unntatt Forsinket.')}`;
  },

  hap: () => {
    const on = hpref('hap');
    return `${G('', [tog('hap', 'Haptisk tilbakemelding', canVibrate() ? 'Korte vibrasjoner når du trykker, bytter fane og fullfører noe' : 'Denne nettleseren kan ikke vibrere (Safari på iPhone). Valgene brukes av iOS- og Android-appene.', on)])}
      ${on ? `${G('Styrke', [chips('hapStr', '', [['light', 'Lett'], ['medium', 'Middels'], ['strong', 'Kraftig']], hpref('hapStr'))])}
      ${G('Bruk haptikk for', HAP_TYPES.map(([k, n]) => tog(k, n, k === 'hapPkg' ? 'Ny pakke, klar for henting og levert' : k === 'hapErr' ? 'Feilmeldinger og sletting' : '', hpref(k))))}
      ${G('', [btn('Test haptikk', 'haptest')], 'Appene følger systemets innstilling for haptikk (iOS: Systemhaptikk, Android: Vibrasjon og haptikk). I nettleseren brukes navigator.vibrate.')}` : ''}`;
  },

  srv: () => `${G('Adresse', [val('Denne økten', esc(location.origin)), btn('Test tilkobling', 'ping')],
      T.ping || 'Lokal og ekstern adresse, og automatisk bytte hjemme, stilles inn i de native appene. Nettappen bruker adressen du åpnet den fra.')}
    ${G('Status', [val('Aktiv', navigator.onLine ? `${location.protocol === 'https:' ? 'Kryptert' : 'Lokal'}${T.ms != null ? ` · ${T.ms} ms` : ''}` : 'Frakoblet', navigator.onLine ? '#7BE3A0' : '#FF8A80'), val('Siste synk', T.lastSync ? T.lastSync.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '–'), val('Serverversjon', esc(S.boot?.version ?? m.me?.version ?? '–'))])}`,

  data: () => `${G('Lagring', [val('Hurtigbuffer', T.usage != null ? `${n0(T.usage / 1e6)} MB` : '–'), btn('Tøm hurtigbuffer', 'clearcache')])}
    ${G('Synk', [btn('Synk nå', 'sync'), `<a class="opt-row" href="/finans/api/transactions.csv" download><span class="m-grow" style="color:var(--m-acc);font-weight:500">Eksporter som CSV</span></a>`],
      'Full backup og Excel-database lages i FinansHub på PC under Innstillinger → Backup og data.')}`,

  sokbar: () => {
    const x = T.srch;
    return `${x ? G('Google-søk', [tog('srch:suggest', 'Vis forslag fra Google mens du skriver', '', x.suggest), tog('srch:save', 'Lagre søkehistorikk', `${x.n} søk lagret · deles med Homelab på PC`, x.save)]) : G('', [val('Søkebar', 'Krever nyere server')])}
      ${G('Historikk', [`<label class="opt-row"><span class="m-grow" style="color:var(--m-acc);font-weight:500">Importer Google-historikk (.json)<br><span style="font-size:12.5px;opacity:.65;color:inherit">Google Takeout → Mine aktiviteter → Søk</span></span><input class="m-file" type="file" accept=".json,application/json" data-takeout></label>`, btn('Tøm søkehistorikk', 'srchclear', '#FF8A80')],
        'Google gir ikke tilgang til søkehistorikken din via API. Last ned den fra Google Takeout og importer filen her.')}`;
  },
  fai: () => {
    const st = S.boot?.settings ?? {}, f = T.f;
    // ISO2: serveroppsettet er skrivebeskyttet for andre enn admin. Ollama-adresse, nøkler og «Test motor» vises ikke.
    if (!canSrv()) {
      const MODE = { ollama: 'Ollama lokalt', gemini: 'Gemini', groq: 'Groq', both: 'Ollama + Gemini' };
      return `${G('Motor', [val('Hovedmotor', esc(MODE[aiMode()] ?? '–')), val('Minste sikkerhet', `0,${String(st.minConf ?? 85).padStart(2, '0')}`)], `🔒 ${ADMIN_NOTE}. Under minste sikkerhet markeres kvitteringen «Sjekk beløp».`)}
      ${P27.aiSections()}
      ${P32.glimtSearchSection()}
      ${P33.memSection()}
      ${paper() ? P23.aiTimeoutsView() : ''}
      ${p17AiExtra()}`;
    }
    return `${G('Motor', [chips('ai', 'Hovedmotor', [['ollama', 'Ollama lokalt'], ['gemini', 'Gemini'], ['groq', 'Groq'], ['both', 'Ollama + Gemini']], aiMode()), chips('minConf', 'Minste sikkerhet', [['75', '0,75'], ['85', '0,85'], ['95', '0,95']], String(st.minConf ?? 85))], 'Under minste sikkerhet markeres kvitteringen «Sjekk beløp».')}
      ${G('Ollama', [inp('ollamaUrl', 'Adresse', f.ollamaUrl ?? st.ollamaUrl, 'http://192.168.1.40:11434', 'url'), inp('ollamaModel', 'Modell', f.ollamaModel ?? st.ollamaModel, 'qwen2.5vl:7b')])}
      ${G('Gemini', [inp('geminiModel', 'Modell', f.geminiModel ?? st.geminiModel, 'gemini-2.5-flash'), inp('geminiKey', st.geminiKeySet ? 'API-nøkkel (lagret – skriv for å bytte)' : 'API-nøkkel', f.geminiKey ?? '', '••••••••', 'password')])}
      ${G('', [btn('Lagre', 'aisave'), btn('Test motor', 'aitest')], T.ai ?? '')}
      ${P27.aiSections()}
      ${P32.glimtSearchSection()}
      ${P33.memSection()}
      ${paper() ? P23.aiTimeoutsView() : ''}
      ${p17AiExtra()}`;
  },
  kat: () => {
    const c = S.boot?.categories ?? [], KIND = { expense: 'Utgift', income: 'Inntekt', transfer: 'Overføring' };
    return `${G('Kategorier', c.map((x) => `<div class="opt-row"><span style="width:12px;height:12px;border-radius:50%;background:${esc(x.color)};flex:none"></span><span class="m-grow">${esc(x.name)}</span><span class="sval">${KIND[x.kind] ?? ''}</span></div>`))}
      ${G('Ny kategori', [inp('catName', 'Navn', T.f.catName ?? '', 'f.eks. Hage'), chips('catKind', 'Type', [['expense', 'Utgift'], ['income', 'Inntekt'], ['transfer', 'Overføring']], T.f.catKind ?? 'expense'), btn('Legg til', 'catadd')])}`;
  },
  regel: () => {
    const r = S.boot?.rules ?? [], c = (S.boot?.categories ?? []);
    return `${G('Auto-kategorisering', r.length ? r.map((x) => `<div class="opt-row"><span class="m-grow m-mono" style="font-size:14px">${esc(x.pattern)}</span><span class="sval">→ ${esc(x.category ?? '')}</span><button class="mini danger" data-sact="ruledel" data-id="${x.id}" aria-label="Slett regelen ${esc(x.pattern)}">${icon('close', 14)}</button></div>`) : [val('Ingen regler ennå', '')], 'Regler går foran AI-forslaget. * matcher hva som helst. Rettelser du gjør blir nye regler.')}
      ${G('Ny regel', [inp('rulePat', 'Mønster', T.f.rulePat ?? '', 'KIWI*'), chips('ruleCat', 'Kategori', c.map((x) => [String(x.id), x.name]), String(T.f.ruleCat ?? '')), btn('Lagre regel', 'ruleadd')])}`;
  },
  bank: () => `${G('CSV-profil', [chips('csvProfile', 'Bank', (S.boot?.profiles ?? ['DNB', 'Nordea', 'SpareBank 1', 'Sbanken', 'Bank Norwegian']).map((p) => [p, p]), S.boot?.settings?.csvProfile ?? 'DNB')], 'Kolonnene finnes automatisk. Profilen brukes når en fil er tvetydig.')}
    ${G('Open banking', [val('PSD2-kobling', 'Kommer senere')])}
    ${G('', [link('Importer fil', '#/imp')])}`,
  t212: () => {
    const st = S.boot?.settings ?? {};
    return `${G('API', [inp('t212Key', st.t212Set ? 'API-nøkkel (lagret – skriv for å bytte)' : 'API-nøkkel', T.f.t212Key ?? '', '••••••••', 'password'), inp('t212Secret', 'API-secret', T.f.t212Secret ?? '', '••••••••', 'password'), chips('t212Env', 'Miljø', [['live', 'Live'], ['demo', 'Demo']], T.f.t212Env ?? st.t212Env ?? 'live')],
      'Lag nøkkelen hos Trading 212 under Innstillinger → API (Beta). Gi bare lesetilgang (account, portfolio, history:orders, history:dividends). Nøkkel og secret lagres bare på serveren.')}
      ${G('', [btn('Lagre og synk', 't212save'), link('Åpne Aksjer', '#/aks')])}`;
  },
  bk: () => {
    const b = T.bk, c = b?.config ?? {};
    const SCH = { off: 'Bare manuelt', daily: 'Hver natt kl. 03.00', weekly: 'Hver søndag kl. 03.00', change: 'Etter endringer' };
    return `${G('Last ned', [`<a class="opt-row" href="/finans/api/backup/export?format=json" download><span class="m-grow" style="color:var(--m-acc);font-weight:500">Full backup (.json)</span></a>`, `<a class="opt-row" href="/finans/api/backup/export?format=xlsx" download><span class="m-grow" style="color:var(--m-acc);font-weight:500">Excel-database (.xlsx)</span></a>`, `<a class="opt-row" href="/finans/api/backup/export?format=csv" download><span class="m-grow" style="color:var(--m-acc);font-weight:500">Bare transaksjoner (CSV)</span></a>`],
      'JSON-filen er den komplette backupen. Excel-filen har ett ark per tabell.')}
      ${b && b.canSmb === false ? G('SMB-share', [val('Backup av hele serveren', ADMIN_NOTE)], 'Du kan laste ned og gjenopprette dine egne data. Backup av hele databasen til SMB-sharen gjøres av hovedadministratoren.') : G('SMB-share', b ? [val('Share', c.share || 'Ikke satt opp', '', true), val('Tidsplan', SCH[c.schedule] ?? c.schedule ?? '–'), val('Behold versjoner', String(c.keep ?? '–')), val('Kryptering', c.encrypt === false ? 'Av' : 'AES-256-GCM'), val('Siste backup', b.last ? `${new Date(b.last.at ?? b.last.created ?? b.last).toLocaleString('nb-NO')}${b.last.status ? ' · ' + b.last.status : ''}` : 'Aldri', b.last?.status === 'ok' ? '#7BE3A0' : ''), btn(c.share ? 'Bytt nettverksdisk (veiviser)' : 'Sett opp nettverksdisk', 'bksmbw'), c.share ? btn('Kjør backup nå', 'bkrun') : ''] : [val('SMB-share', 'Krever innlogging i nettleseren')], 'Veiviseren finner NAS-en på nettverket og lar deg velge mappe. Gjenoppretting gjøres i FinansHub på PC.')}
      ${G('', [link('Åpne Backup og data på PC-visningen', '/finans/?desktop=1#/inn')])}`;
  },
  om: () => `${G('', [val('Appversjon', `${VERSION} (nettapp)`), val('Server', esc(S.boot?.version ?? m.me?.version ?? '–')), val('Plattform', isIOS() ? 'iOS · nettleser' : /Android/.test(navigator.userAgent) ? 'Android · nettleser' : 'Nettleser')])}
    ${G('', [`<details class="opt-row col"><summary style="color:var(--m-acc);font-weight:500">Personvern</summary><p class="snote" style="padding:6px 0 0">All data ligger på din egen homelab-server. Kvitteringer sendes bare til Gemini hvis du har valgt det som AI-motor; med Ollama blir de på hjemmenettet. Appen sporer ingenting.</p></details>`,
      `<details class="opt-row col"><summary style="color:var(--m-acc);font-weight:500">Lisenser</summary><p class="snote" style="padding:6px 0 0">Geist og Geist Mono (SIL OFL 1.1), Roboto Flex (SIL OFL 1.1). Logoer hentes fra Googles favicon-tjeneste og tilhører sine eiere.</p></details>`])}`,
};

/* ---------- Hendelser ---------- */

async function askNotify() { if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} } }

export async function settingsBind(e, t) {
  if (m.screen !== 'set') return false;
  if (await updBind(e, t)) return true;
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'change' || e.type === 'input') {
    if (t.matches?.('[data-ntname]')) { T.nt.name = t.value; return true; }
    if (t.dataset?.navname) {
      if (e.type === 'change') { const names = { ...(LAY().names ?? {}) }; const v = t.value.trim().slice(0, 30); if (v) names[t.dataset.navname] = v; else delete names[t.dataset.navname]; saveLayout({ names }, false); flash(v ? `Kalt «${v}»` : 'Standardnavn'); }
      return true;
    }
    if (t.dataset?.sinp) { T.f[t.dataset.sinp] = t.value; return true; }
    if (e.type === 'change' && t.matches?.('[data-avatar]')) { const f = t.files?.[0]; t.value = ''; if (f) await uploadAvatar(f); return true; }
    if (e.type === 'change' && t.matches?.('[data-takeout]')) {
      const f = t.files?.[0]; t.value = ''; if (!f) return true;
      flash('Importerer søkehistorikk …');
      const r = await fetch('/api/search/history/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await f.text() });
      const j = await r.json().catch(() => ({}));
      flash(r.ok ? `${j.imported ?? j.added ?? (j.items ?? []).length} søk importert` : j.error ?? 'Kunne ikke importere'); await settingsLoad('sokbar'); draw(); return true;
    }
    return false;
  }
  if (e.type !== 'click') return false;
  if ((x = d('[data-trkpref]'))) { await setTrkPref(x.dataset.trkpref); return true; }
  if ((x = d('[data-stog]'))) {
    const id = x.dataset.stog;
    if (id.startsWith('hap')) { setHap(id, !hpref(id)); if (hpref(id)) haptic(id === 'hapErr' ? 'err' : id === 'hapPkg' ? 'pkg' : 'tap', { force: true }); }
    else if (id === 'iosbg') { try { localStorage.setItem('fh_ios_bg', iosBg() ? '0' : '1'); } catch {} }
    else if (id.startsWith('srch:')) { const k = id.slice(5); T.srch[k] = !T.srch[k]; await hlApi('/search/settings', { method: 'PUT', json: { suggest: T.srch.suggest, save: T.srch.save } }).catch((err) => flash(err.message)); }
    else if (id.startsWith('srv:')) { const k = id.slice(4); S.boot.settings = await api('/settings', { method: 'PUT', json: { [k]: !S.boot.settings[k] } }); if (S.boot.settings[k]) await askNotify(); }
    else { setPref(id, !pref(id)); if (id.startsWith('n') && pref(id)) await askNotify(); }
    draw(); return true;
  }
  if ((x = d('[data-schip]'))) {
    const id = x.dataset.schip, v = x.dataset.v;
    if (id === 'mdesign') { saveDesign({ mobileDesign: v }, false); }
    else if (id === 'ppMode') { saveDesign({ paperMode: v }, false); }
    else if (id === 'theme') { try { if (v === 'auto') localStorage.removeItem('fh_theme'); else localStorage.setItem('fh_theme', v); } catch {} }
    else if (id === 'startL') { saveLayout({ start: v }, false); setPref('start', { homelab: 'hl', 'fin-hjem': 'hjem', 'fin-liste': 'liste', 'fin-budsjett': 'budsjett' }[v]); }
    else if (id === 'backStyle') saveLayout({ [id]: v }, false);
    else if (id === 'ai') S.boot.settings = await api('/settings', { method: 'PUT', json: v === 'both' ? { provider: 'ollama', fallback: true } : { provider: v, fallback: false } });
    else if (id === 'ntscope') T.nt.scopes = T.nt.scopes.includes(v) ? T.nt.scopes.filter((s) => s !== v) : [...T.nt.scopes, v];
    else if (id === 'ntexp') T.nt.exp = v;
    else if (id === 'minConf' || id === 'csvProfile') S.boot.settings = { ...S.boot.settings, ...(await api('/settings', { method: 'PUT', json: { [id]: id === 'minConf' ? +v : v } })) };
    else if (['catKind', 'ruleCat', 't212Env'].includes(id)) T.f[id] = v;
    else if (id === 'hapStr') { setHap(id, v); haptic('ok', { force: true }); }
    else setPref(id, v);
    draw(); return true;
  }
  const act = d('[data-sact]')?.dataset.sact;
  if (!act) return false;
  if (act === 'haptest') {
    if (!canVibrate() && typeof window.__fhNativeHaptic !== 'function') { flash('Denne nettleseren kan ikke vibrere'); return true; }
    const seq = HAP_TYPES.filter(([k]) => hpref(k)).map(([, , kind]) => kind);
    seq.forEach((k, i) => setTimeout(() => haptic(k, { force: true }), i * 450));
    flash(seq.length ? `Tester: ${HAP_TYPES.filter(([k]) => hpref(k)).map(([, n]) => n.toLowerCase()).join(', ')}` : 'Alle typer er slått av'); return true;
  }
  if (act === 'logout') { const { logout } = await import('./mobile-p21.js'); await logout(); return true; }
  if (act === 'design') { saveDesign({ mobileDesign: d('[data-sact]').dataset.v }); return true; }
  if (act === 'ppmode') { saveDesign({ paperMode: d('[data-sact]').dataset.v }); return true; }
  if (act === 'ppphoto') { paperState.open = true; location.hash = '#/hl'; return true; }
  if (act === 'navmv') {
    const b = d('[data-sact]'), k = b.dataset.k, i = +b.dataset.i, j = +b.dataset.j, a = [...LAY()[k]];
    if (j < 0 || j >= a.length) return true;
    const [y] = a.splice(i, 1); a.splice(j, 0, y); saveLayout({ [k]: a }); return true;
  }
  if (act === 'navtog') { const id = d('[data-sact]').dataset.id, h = { ...LAY().hide }; h[id] = !h[id]; saveLayout({ hide: h }); return true; }
  if (act === 'navreset') { saveLayout({ hlTabs: [], finTabs: [], names: {}, hide: Object.fromEntries(Object.entries(LAY().hide).filter(([k]) => !HLTABS[k] && !FINTABS[k])) }); flash('Navigasjonen er tilbakestilt'); return true; }
  if (act === 'copy') { try { await navigator.clipboard.writeText(T.newTok); flash('Token kopiert'); } catch { flash('Marker og kopier tokenet manuelt'); } return true; }
  if (act === 'revoke') {
    const tk = T.tokens?.find((y) => y.id === x?.dataset?.id || y.id === d('[data-id]')?.dataset.id);
    if (!tk || !confirm(`Trekke tilbake «${tk.name}»? Snarveier og skript som bruker det slutter å virke.`)) return true;
    await api(`/tokens/${encodeURIComponent(tk.id)}`, { method: 'DELETE' });
    await settingsLoad('tok'); flash(`${tk.name} er trukket tilbake`); return true;
  }
  if (act === 'mktok') {
    const nt = T.nt;
    if (!nt.name.trim() || !nt.scopes.length) { flash('Gi tokenet navn og minst én tilgang'); return true; }
    const r = await api('/tokens', { method: 'POST', json: { name: nt.name.trim(), scopes: nt.scopes, expiresDays: nt.exp ? +nt.exp : null } });
    T.newTok = r.token; T.nt = { name: '', scopes: ['receipts:write'], exp: '90' };
    await settingsLoad('tok'); draw(); return true;
  }
  if (act === 'ping') {
    const t0 = performance.now();
    try { const r = await fetch('/healthz', { cache: 'no-store' }); T.ms = Math.round(performance.now() - t0); T.ping = r.ok ? `Tilkoblet ${location.host} · ${T.ms} ms` : `Serveren svarte ${r.status}`; }
    catch { T.ms = null; T.ping = `Fikk ikke kontakt med ${location.host}`; }
    draw(); return true;
  }
  if (act === 'clearcache') {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
    await settingsLoad('data'); flash('Hurtigbuffer tømt'); return true;
  }
  if (act === 'avdel') { await hlApi('/me/avatar', { method: 'DELETE' }); await loadMe(); flash('Profilbildet er fjernet'); return true; }
  if (act === 'srchclear') { if (!confirm('Tømme hele søkehistorikken?')) return true; await hlApi('/search/history', { method: 'DELETE' }); await settingsLoad('sokbar'); flash('Søkehistorikken er tømt'); return true; }
  if (act === 'aisave') {
    const f = T.f, b = {};
    for (const k of ['ollamaUrl', 'ollamaModel', 'geminiModel']) if (f[k] !== undefined) b[k] = f[k].trim();
    if (f.geminiKey) b.geminiKey = f.geminiKey;
    S.boot.settings = { ...S.boot.settings, ...(await api('/settings', { method: 'PUT', json: b })) };
    T.f = {}; flash('AI-motor lagret'); return true;
  }
  if (act === 'aitest') { T.ai = 'Tester …'; draw(); try { const h = await api('/health/ai'); T.ai = Object.entries(h ?? {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? (v?.ok ? `OK${v.ms ? ` · ${v.ms} ms` : ''}` : v?.error ?? 'ikke svar') : v}`).join(' · '); } catch (err) { T.ai = err.message; } draw(); return true; }
  if (act === 'catadd') { const n = (T.f.catName ?? '').trim(); if (!n) { flash('Gi kategorien et navn'); return true; } await api('/categories', { method: 'POST', json: { name: n, kind: T.f.catKind ?? 'expense', color: ['#FF9F5A', '#7AA7FF', '#5FD3A8', '#B79CFF', '#F2C14E', '#FF6B8B'][(S.boot?.categories?.length ?? 0) % 6] } }); T.f.catName = ''; await loadBoot(); flash(`${n} lagt til`); return true; }
  if (act === 'ruleadd') { const p = (T.f.rulePat ?? '').trim(); if (!p || !T.f.ruleCat) { flash('Skriv mønster og velg kategori'); return true; } await api('/rules', { method: 'POST', json: { pattern: p, categoryId: +T.f.ruleCat } }); T.f.rulePat = ''; await loadBoot(); flash('Regel lagret'); return true; }
  if (act === 'ruledel') { const id = d('[data-id]')?.dataset.id; await api(`/rules/${id}`, { method: 'DELETE' }); await loadBoot(); flash('Regel slettet'); return true; }
  if (act === 't212save') {
    const f = T.f;
    await api('/stocks/config', { method: 'PUT', json: { key: f.t212Key ?? '', secret: f.t212Secret ?? '', env: f.t212Env ?? S.boot?.settings?.t212Env ?? 'live' } });
    T.f = {}; await loadBoot(); flash('Lagret · synker med Trading 212'); api('/stocks/sync', { method: 'POST' }).catch(() => {}); return true;
  }
  if (act === 'bksmbw') { await P29.openSmb(['finans'], () => api('/backup').then((x) => { T.bk = x; }).catch(() => {})); return true; }
  if (act === 'bkrun') { const r = await api('/backup/run', { method: 'POST' }); flash(r?.message ?? 'Backup til SMB-share startet'); return true; }
  if (act === 'sync') { await Promise.all([loadBoot(), loadSummary()]); T.lastSync = new Date(); flash('Synket med serveren'); return true; }
  return false;
}

/* Profilbilde: beskjæres til kvadrat 256 × 256 og lagres som JPEG (kvalitet 0,85). */
async function uploadAvatar(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) { flash('Kunne ikke lese bildet'); return; }
  const z = 256, k = Math.max(z / bmp.width, z / bmp.height), c = document.createElement('canvas');
  c.width = c.height = z;
  c.getContext('2d').drawImage(bmp, (z - bmp.width * k) / 2, (z - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  const fd = new FormData(); fd.append('file', blob, 'avatar.jpg');
  try { await hlApi('/me/avatar', { method: 'POST', body: fd }); await loadMe(); flash('Profilbilde oppdatert'); }
  catch (e) { flash(e.message); }
}

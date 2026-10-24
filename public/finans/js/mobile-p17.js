// Prompt 16–17, runde 2 (design/Mobil Papir App, Huskeliste, Familie og Vaer). Innstillinger i Papir med samme
// gruppering som designet, navn og ikon på appen, varsler med lyd og test, Huskeliste med widget på Hjem, kortene
// Posisjon og Bolig på Hjem, Familie med fanene Kart, Soner og Helse, Yr mot Storm, dra for å oppdatere og sanntid
// via én felles WebSocket (/api/ws). Alt tåler en eldre server: data som mangler vises som en forklaring, ikke en feil.
import * as P29 from './mobile-p29.js';
import * as P30 from './mobile-p30.js';
import * as P31 from './mobile-p31.js';
import { S, api, esc, n0, ini, hlApi, icon } from './core.js';
import { m, draw, flash, meName, avInner, avatarUrl, route, isIOS, domOk } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { iconColor, iconInk, FM, famLoad, BO, bolLoad, bolUpload } from './mobile-p16.js';
import { listShareLine } from './mobile-p21.js';
import { currentUser } from './mobile-upq.js';
import * as P25 from './mobile-p25.js';
let P24N = null; import('./mobile-p24.js').then((x) => { P24N = x; }).catch(() => {}); // prompt 39: Appprofil-raden (lat, endrer ikke importrekkefølgen)
import { updAdmin, updSummary } from './mobile-upd.js';

const LS = 'fh_p17';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };
export const P17 = { nm: false, nv: '', ic: false, plat: null, icv: 'std', tint: 0, my: 0 };
const VERSION = '2.6';

/* ---------- Navn og ikon på appen (settings.app_name, GET/PUT /api/app) ---------- */

export const appName = () => (String(L.name ?? '').trim() || 'Homelab');
/** Leser appName/appIcon fra /api/me/layout (per bruker, går foran serverens felles navn). */
export function takeApp(r) { if (!r) return; if (typeof r.appName === 'string' && r.appName.trim()) { L.name = r.appName.trim().slice(0, 20); L.own = 1; } if (['hus', 'monogram', 'rom'].includes(r.appIcon)) { L.icon = r.appIcon; L.ownIc = 1; } keep(); applyIcon(); }
export const appIcon = () => (['hus', 'monogram', 'rom'].includes(L.icon) && (L.ownIc || L.icon !== 'hus') ? L.icon : 'monogram');
// Prompt 39: Papir-monogram (H· på rødt med brettet hjørne) er standard. Brukere som har valgt selv, beholder valget.
export const ICONS = [['monogram', 'Papir-monogram'], ['hus', 'Huset med stativ'], ['rom', 'Fire rom']];
let appT = 0;
export async function appLoad(force = false) {
  if (!force && Date.now() - appT < 5 * 60000) return;
  appT = Date.now();
  try { const r = await fetch('/api/app', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j?.name && !L.own) L.name = j.name; if (j?.icon && !L.ownIc) L.icon = j.icon; keep(); } } catch {}
  applyIcon();
}
async function saveApp(patch) {
  if (patch.name) patch = { ...patch, name: String(patch.name).slice(0, 20) };
  Object.assign(L, patch); if (patch.name !== undefined) L.own = patch.name ? 1 : 0; if (patch.icon) L.ownIc = 1; keep(); applyIcon(); draw();
  // Prompt 24: navn og ikon lagres også per bruker i /api/me/layout (appName, appIcon), så det følger kontoen.
  hlApi('/me/layout', { method: 'PUT', json: { ...(patch.name !== undefined ? { appName: patch.name } : {}), ...(patch.icon ? { appIcon: patch.icon } : {}) } }).catch(() => {});
  try { await hlApi('/app', { method: 'PUT', json: patch }); flash(patch.name ? `Appen heter nå ${appName()} ✓` : 'App-ikonet er byttet ✓'); }
  catch (e) { flash(e.status === 403 ? 'Lagret på denne enheten. Bare admin kan endre for alle.' : e.status === 404 ? 'Lagret på denne enheten. Serveren støtter ikke dette ennå.' : e.message); }
}

const ICV = {
  hus: { std: { bg: '#f3efe6', ink: '#1b1a17', acc: '#b23a2a' }, dark: { bg: '#1b1a17', ink: '#f3efe6', acc: '#f08a76' }, tint: { bg: '#000', ink: '#e8e8e8', acc: '#9a9a9a' } },
  monogram: { std: { bg: '#b23a2a', corner: '#8e2b1e', ink: '#f3efe6' }, dark: { bg: '#14130f', corner: '#2a2821', ink: '#f08a76' }, tint: { bg: '#000', corner: '#2e2e2e', ink: '#e8e8e8' } },
  rom: { std: { bg: '#1b1a17', house: '#f3efe6', acc: '#b23a2a', room: '#1b1a17' }, dark: { bg: '#000', house: '#2a2821', acc: '#f08a76', room: '#14130f' }, tint: { bg: '#000', house: '#d6d6d6', acc: '#8a8a8a', room: '#000' } },
};
/** App-ikonet som SVG (1024 × 1024), samme tegning som design/App-ikon.dc.html. v = std | dark | tint. */
export function iconSvg(k = appIcon(), v = 'std', tint = null) {
  const c = { ...(ICV[k] ?? ICV.hus)[v] ?? ICV.hus.std };
  if (v === 'tint' && tint) { c.ink = tint; c.house = tint; }
  const letter = esc((appName().replace(/[^A-Za-zÆØÅæøå0-9]/g, '').charAt(0) || 'H').toUpperCase());
  const body = k === 'monogram'
    ? `<path d="M790 1024V790H1024z" fill="rgba(255,255,255,.16)"/><path d="M1024 790V1024H790z" fill="${c.corner}"/><text x="500" y="690" text-anchor="middle" font-family="Newsreader,Georgia,serif" font-size="560" font-weight="500" fill="${c.ink}">${letter}</text><circle cx="742" cy="350" r="34" fill="${c.ink}"/>`
    : k === 'rom'
      ? `<path d="M512 196 820 452V828H204V452z" fill="${c.house}"/><rect x="276" y="500" width="216" height="140" rx="18" fill="${c.acc}"/>${[[532, 500, 140], [276, 672, 104], [532, 672, 104]].map(([x, y, h]) => `<rect x="${x}" y="${y}" width="216" height="${h}" rx="18" fill="${c.room}"/>`).join('')}`
      : `<path d="M232 470 512 236 792 470" fill="none" stroke="${c.ink}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/><rect x="312" y="480" width="400" height="300" rx="28" fill="${c.ink}"/>${[526, 604, 682].map((y) => `<rect x="352" y="${y}" width="320" height="56" rx="12" fill="${c.bg}"/>`).join('')}<circle cx="628" cy="554" r="14" fill="${c.acc}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${c.bg}"/>${body}</svg>`;
}
const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
let iconKey = '';
/** Nettleserfanen og Hjem-skjermen: favicon (SVG) og apple-touch-icon (PNG fra lerret), og appnavnet i tittelen. */
export function applyIcon() {
  document.title = appName();
  const key = `${appIcon()}|${appName().charAt(0)}`;
  if (key === iconKey) return;
  iconKey = key;
  const svg = iconSvg(appIcon(), 'std'), url = svgUrl(svg);
  const set = (rel, href, type) => { let l = document.querySelector(`link[rel="${rel}"]`); if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); } l.href = href; if (type) l.type = type; };
  set('icon', url, 'image/svg+xml');
  // Prompt 39: standardikonet (Papir-monogram med H) bruker de ferdige filene fra /icons/ når de finnes.
  if (appIcon() === 'monogram' && appName().charAt(0).toUpperCase() === 'H') {
    const t = new Image(); t.onload = () => set('apple-touch-icon', '/icons/app-icon-180.png'); t.src = '/icons/app-icon-180.png';
  }
  try {
    const img = new Image();
    img.onload = () => { if (appIcon() === 'monogram' && document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') === '/icons/app-icon-180.png') return; const cv = document.createElement('canvas'); cv.width = cv.height = 180; cv.getContext('2d').drawImage(img, 0, 0, 180, 180); try { set('apple-touch-icon', cv.toDataURL('image/png')); } catch {} };
    img.src = url;
  } catch {}
}

function nameSheet() {
  if (!P17.nm) return '';
  const v = P17.nv;
  return `<div class="sheet-bg" data-p17="nmx"></div><div class="pp-sheet" role="dialog" aria-label="Navn på appen"><span class="pp-grab"></span>
    <div class="pp-sh">Navn på appen</div>
    <input class="sinp p17-nmin" id="p17-nm" data-p17in="nm" value="${esc(v)}" maxlength="20" placeholder="Homelab" autocomplete="off" aria-label="Navn på appen">
    <div class="pp-chips">${['Homelab', 'Torskenes Verden'].map((x) => `<button class="pp-fchip" data-p17="nmset" data-v="${esc(x)}" aria-pressed="${v === x}">${esc(x)}</button>`).join('')}</div>
    <span class="pp-mut">Vises øverst på Hjem, i innloggingen, i varsler og i nettleserfanen.</span>
    <div class="p17-two"><button class="pp-btn" data-p17="nmx">Avbryt</button><button class="pp-btn ink" data-p17="nmsave" ${v.trim() ? '' : 'disabled'}>Lagre</button></div></div>`;
}
const TINTS = ['#e8e8e8', '#f0b56a', '#8cb8e6', '#8fd3a5', '#e3a1cf'], MY = ['#c7d7ff', '#ffd8c2', '#c9ecd2', '#f1d0f0'];
function iconSheet() {
  if (!P17.ic) return '';
  P17.plat ??= isIOS() ? 'ios' : 'and';
  const plats = [['ios', 'iPhone'], ['and', 'Android'], ['web', 'Nettleser']];
  const vars = P17.plat === 'ios' ? [['std', 'Standard'], ['dark', 'Mørk'], ['tint', 'Tonet']] : P17.plat === 'and' ? [['std', 'Standard'], ['my', 'Material You']] : [['std', 'Fane og Hjem-skjerm']];
  const v = vars.some(([k]) => k === P17.icv) ? P17.icv : 'std';
  const pv = (k) => (v === 'my' ? iconSvg(k, 'tint', '#3a3a52').replace(/fill="#000"/, `fill="${MY[P17.my]}"`) : iconSvg(k, v === 'tint' ? 'tint' : v === 'dark' ? 'dark' : 'std', v === 'tint' ? TINTS[P17.tint] : null));
  const wall = v === 'dark' || v === 'tint' ? 'linear-gradient(160deg,#1d2433,#0c0f16)' : v === 'my' ? `linear-gradient(160deg,${MY[P17.my]},#6d7896)` : 'linear-gradient(160deg,#7aa0c8,#d8b38a)';
  const note = P17.plat === 'ios' ? 'iPhone bytter ikonet med en bekreftelse fra iOS. Mørk og Tonet følger valget i iOS når du holder inne på Hjem-skjermen og velger «Tilpass».'
    : P17.plat === 'and' ? 'Android bytter ikonet i appen. Med «Tematiske ikoner» på (Material You) brukes det monokrome laget i fargene fra bakgrunnsbildet.' : 'Nettleserfanen og «Legg til på Hjem-skjerm» bruker ikonet med en gang.';
  return `<div class="sheet-bg" data-p17="icx"></div><div class="pp-sheet tall p17-ic" role="dialog" aria-label="App-ikon"><span class="pp-grab"></span>
    <div class="pp-sh">App-ikon</div>
    <div class="p16-seg">${plats.map(([k, n]) => `<button data-p17="icplat" data-k="${k}" aria-pressed="${P17.plat === k}">${n}</button>`).join('')}</div>
    ${vars.length > 1 ? `<div class="pp-chips">${vars.map(([k, n]) => `<button class="pp-fchip" data-p17="icvar" data-k="${k}" aria-pressed="${v === k}">${n}</button>`).join('')}</div>` : ''}
    <div class="p17-icons">${ICONS.map(([k, n]) => `<button data-p17="icset" data-k="${k}" aria-pressed="${appIcon() === k}"><span class="p17-ici"><img src="${svgUrl(pv(k))}" alt=""></span><span>${n}</span></button>`).join('')}</div>
    ${v === 'tint' ? `<span class="pp-mut">Tonefarge (velges i iOS når du holder inne på Hjem-skjermen)</span><div class="p17-dots">${TINTS.map((c, i) => `<button data-p17="ictint" data-i="${i}" style="background:${c}" aria-pressed="${P17.tint === i}" aria-label="Tonefarge"></button>`).join('')}</div>` : ''}
    ${v === 'my' ? `<span class="pp-mut">Material You henter fargen fra bakgrunnsbildet ditt. Forhåndsvis med:</span><div class="p17-dots">${MY.map((c, i) => `<button data-p17="icmy" data-i="${i}" style="background:${c}" aria-pressed="${P17.my === i}" aria-label="Bakgrunnsfarge"></button>`).join('')}</div>` : ''}
    <div class="p17-dock" style="background:${wall}">${[pv(appIcon()), null, null, null].map((s, i) => `<span class="p17-dk">${s ? `<img src="${svgUrl(s)}" alt="">` : '<i></i>'}<small>${i === 0 ? esc(appName().slice(0, 11)) : ''}</small></span>`).join('')}</div>
    <span class="pp-mut" style="line-height:1.45">${note}</span>
    <button class="pp-btn ink" data-p17="icx">Ferdig</button></div>`;
}
export function p17Sheets() {
  // Arkene hører til sin side: de lukkes når man går et annet sted.
  if (m.screen !== 'set' || (m.sub ?? '') !== (P17.sub ?? '')) { P17.nm = false; P17.ic = false; }
  if (m.screen !== 'vaer') CMP.open = false;
  return nameSheet() + iconSheet();
}

/* ---------- Innstillinger i Papir (Mobil Papir App → innst) ---------- */

export const row = (href, label, sub, val, ic, key, attr = '') => {
  const c = iconColor(key, '#b23a2a');
  const tag = `${href ? `a class="opt-row p17-row" href="${href}"` : `button class="opt-row p17-row" ${attr}`}${key ? ` data-set="${esc(key)}"` : ''}`;
  return `<${tag}>${ic ? `<span class="set-ic fill" style="background:${c}">${icon(ic, 16, iconInk(c))}</span>` : ''}<span class="m-grow p17-rt"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${val ? `<span class="sval">${esc(val)}</span>` : ''}<span class="p17-chev" aria-hidden="true">›</span></${href ? 'a' : 'button'}>`;
};
export const grp = (t, rows) => `${t ? `<span class="pp-lab p17-gl">${esc(t)}</span>` : ''}<div class="list p17-list">${rows.filter(Boolean).join('')}</div>`;
const ENG = { ollama: 'Ollama', gemini: 'Gemini', groq: 'Groq' };
// ISO2: serveroppsettet i FinansHub (AI-motorer, modeller, nøkler, tidsgrenser, OCR, SMB) kan bare admin endre.
// canEditServer kommer i /bootstrap og /settings. Eldre server uten feltet: rollen avgjør.
export const canSrv = () => S.boot?.canEditServer ?? S.boot?.settings?.canEditServer ?? (m.me?.role ? m.me.role === 'admin' : true);
export const ADMIN_NOTE = 'Settes opp av administrator';
export function p17SetMain(T = {}) {
  const me = m.me ?? {}, st = S.boot?.settings ?? {}, fk = (() => { try { return (JSON.parse(localStorage.getItem('fh_p15') || '{}').finTabs ?? []).length || 4; } catch { return 4; } })();
  const prof = `<a class="pp-card p17-prof" href="#/set/konto"><span class="m-av${avatarUrl() ? ' img' : ''}" style="width:56px;height:56px;font-size:22px">${avInner()}</span><span class="m-grow p17-rt"><b class="pp-serif" style="font-size:21px">${esc(meName())}</b><small>${me.username ? `@${esc(me.username)}` : ''}${me.role ? ` · ${me.role === 'admin' ? 'Admin' : 'Bruker'}` : ''}</small><small>${esc(me.serverName || location.host)}</small></span><span class="p17-chev" aria-hidden="true">›</span></a>`;
  const t212 = st.t212Set ? 'Tilkoblet' : 'Ikke satt opp';
  return `${prof}
    ${P30.progGroup(grp, row)}
    ${globalThis.P44?.homelabGroup?.() ?? '' /* prompt 44: HOMELAB → Logger */}
    ${grp('KONTO', [row('#/set/konto', 'Kontoer og brukere', '', '', 'users', 'konto'), row('#/set/sik', 'Sikkerhet', me.totp ? '2FA på' : '2FA av', '', 'shield', 'sik'), row('#/set/tok', 'API-tokens', T.tokens ? `${T.tokens.length} aktive` : '', '', 'key', 'tok'), P29.isAdmin() ? row('#/set/sysbk', 'Backup', P29.bkSummary(), '', 'backup', 'sysbk') : ''])}
    ${grp('FINANS', [row('#/aictl/fin', 'AI og tolkning', canSrv() ? [ENG[st.provider] ?? 'Ollama', st.groqKeySet ? 'Groq' : '', st.roboflowKeySet ? 'Roboflow' : '', st.geminiKeySet && st.provider !== 'gemini' ? 'Gemini' : ''].filter(Boolean).join(' · ') : ADMIN_NOTE, '', 'ai', 'fai'),
      row('#/set/kat', 'Kategorier og budsjett', `${(S.boot?.categories ?? []).length} kategorier`, '', 'cat', 'kat'), row('#/set/regel', 'Regler', `${(S.boot?.rules ?? []).length} regler`, '', 'rule', 'regel'),
      row('#/set/bank', 'Bankimport', 'DNB · CSV · ✦ AI', '', 'bank', 'bank'), row('#/set/t212', 'Aksjer · Trading 212', t212, '', 'aks', 't212'), row('#/set/fanelinje', 'Fanelinje og Mer i Finans', `${fk} faner`, '', 'list', 'fanelinje'), row('#/sub', 'Subscription OS', 'Abonnementer og AI-sparing', '', 'sub', 'sub')])}
    ${grp(appName().toUpperCase(), [row('#/set/tilpass', 'Tilpass', 'Navn, ikon, tema, farger, bakgrunn og fanelinje', '', 'look', 'tilpass'), /* prompt 39: Navn, App-ikon, Fanelinje-stil og Fanelinje i Hjem ligger i Tilpass */
      row('#/set/mod', 'Moduler', domOk() ? 'Sporing, Domener, Mat, Nyheter' : 'Sporing, Mat, Nyheter', '', 'globe', 'mod'), row('#/nyheter', 'Nyhetsleser', 'Kilder og AI', '', 'look', 'rss')])}
    ${grp('GLIMT', [row('#/glimt', 'Glimt', 'Figur, brief, stemme og venner', '', 'ai', 'glimt')])}
    ${globalThis.P45?.modGroup?.(grp, row) ?? '' /* prompt 45: MODULER – alle innstillinger samlet her (Media, Ruter, Vær, Studie) */}
    ${globalThis.P42?.healthGroup?.(grp, row) ?? '' /* prompt 42: HELSE (FAMILIE) – flyttet fra Familie → Helse */}
    ${grp('APP', [/* prompt 39: «Utseende og fanelinje» er flyttet til Tilpass */row('#/aictl', 'AI og modeller', 'Modeller, jobber, forbruk og nøkler', '', 'ai', 'aictl'), /* prompt 34: AI-kontroll */ row('#/set/varsler', 'Varsler og haptikk', NT.d ? (NT.d.on === false ? 'Av' : 'På') : '', '', 'bell', 'varsler'), row('#/set/kal', 'Kalendere', 'Google Kalender · Home Assistant', '', 'users', 'kal'), globalThis.P44?.setRowHuske?.() ?? '' /* prompt 44: Gjøremål */, row('#/set/integ', 'Integrasjoner', 'Home Assistant, Media, Entur, Bring og 17 til', '', 'home', 'integ'),
      row('#/set/widgets', 'Widgets', 'Media, Avganger, Kalender og 3 til', '', 'list', 'widgets'), row('#/set/kalapp', 'Kalender-appen', 'Egen app med samme konto · IPA og APK', '', 'down', 'kalapp'), row('#/set/appprofil', 'Appprofil', (P24N?.profName() ?? ''), '', 'users', 'appprofil') /* prompt 39 */])}
    ${'' /* Prompt 38: Logg ut er flyttet til Konto → Økt */}
    <span class="p17-ver">${esc(appName())} ${VERSION} · Papir</span>`;
}
/** Moduler: snarveier til modulene (de kan også legges i fanelinja). */
export function p17Modules() {
  const M = [['#/spor', 'Sporing', 'Pakker fra e-post og Finn', 'globe'], ['#/dom', 'Domener', 'Cloudflare-statistikk', 'globe'], ['#/mat', 'Mat', 'Ukeplan og oppskrifter', 'home'], ['#/nyheter', 'Nyhetsleser', 'RSS med AI-sammendrag', 'look'],
    ['#/huske', 'Gjøremål', 'To-do: egne og delte lister', 'list'], ['#/fam', 'Familie og kart', 'Posisjon, soner og helse', 'users'], ['#/avg', 'Avganger', 'Sanntid fra Entur', 'globe'], ['#/vaer', 'Vær', 'MET og Yr mot Storm', 'look']];
  return grp('MODULER', M.filter(([h]) => h !== '#/dom' || domOk()).map(([h, n, s, ic]) => row(h, n, s, '', ic, `mod-${n}`))) + '<div class="snote">Modulene kan også legges i fanelinja under Fanelinje i Hjem.</div>';
}

/* ---------- AI og tolkning: hvem gjør hva, lokal OCR-reserve og logg ---------- */

export const AI17 = { log: null, f: {}, msg: '' };
const TASKS = [['receipts', 'Les kvitteringer', 'gemini'], ['search', 'AI-søk og sammendrag', 'groq'], ['categorize', 'Kategorisering', 'groq'], ['barcode', 'Strekkoder', 'roboflow']];
const ENGINES = [['gemini', 'Gemini'], ['groq', 'Groq'], ['ollama', 'Ollama'], ['roboflow', 'Roboflow']];
export async function aiLoad() {
  try { const r = await api('/ai/log?limit=20'); AI17.log = Array.isArray(r) ? r : r?.items ?? []; } catch { AI17.log = null; }
}
export function p17AiExtra() {
  const st = S.boot?.settings ?? {}, tk = st.aiTasks ?? {}, f = AI17.f;
  const sel = (k, def) => { const cur = tk[k] ?? def, opts = k === 'barcode' ? ENGINES.filter(([e]) => e === 'roboflow' || e === 'gemini') : ENGINES.filter(([e]) => e !== 'roboflow'); return `<div class="pp-chips p17-eng">${opts.map(([e, n]) => `<button class="pp-fchip sm" data-p17="task" data-k="${k}" data-v="${e}" aria-pressed="${cur === e}">${n}</button>`).join('')}</div>`; };
  const inp = (k, label, ph, type = 'text', val = '') => `<label class="opt-row col"><span style="font-size:13px;opacity:.7">${esc(label)}</span><input class="sinp" data-p17in="ai:${k}" type="${type}" value="${esc(f[k] ?? val)}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off"></label>`;
  const tg = (k, n, s, on) => `<button class="opt-row" data-p17="aitog" data-k="${k}" role="switch" aria-checked="${!!on}"><span class="m-grow"><b style="font-weight:500">${n}</b><br><span style="font-size:13px;opacity:.65">${s}</span></span><span class="sw" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
  const log = AI17.log;
  const logView = log ? `<div class="sec">AI-logg</div><div class="list">${log.length ? log.slice(0, 20).map((x) => `<div class="opt-row"><span class="m-grow"><b style="font-weight:500">${esc(x.task ?? '')} · ${esc(x.engine ?? '')}</b><br><span style="font-size:12px;opacity:.65">${esc(x.model ?? '')}${x.ms != null ? ` · ${n0(x.ms)} ms` : ''}${x.error ? ` · ${esc(x.error)}` : ''}</span></span><span class="sval" style="color:${x.status === 'ok' ? 'var(--pp-pos)' : 'var(--pp-lab)'};opacity:1">${esc(x.status ?? '')}</span></div>`).join('') : '<div class="opt-row"><span class="m-grow pp-mut">Ingen AI-kall ennå.</span></div>'}</div>` : '';
  // ISO2: vanlige brukere ser hvem som gjør hva og OCR-valgene, men kan ikke endre dem. Nøkler, modeller og tester vises ikke.
  if (!canSrv()) {
    const name = (e) => ENGINES.find(([k]) => k === e)?.[1] ?? e;
    const ro = (n, v) => `<div class="opt-row"><span class="m-grow">${esc(n)}</span><span class="sval">${esc(v)}</span></div>`;
    return `<div class="sec">Hvem gjør hva</div><div class="list p17-ro">${TASKS.map(([k, n, def]) => ro(n, name(tk[k] ?? def))).join('')}</div>
      <div class="sec">Lokal OCR-reserve</div><div class="list p17-ro">${ro('Lokal OCR-reserve', st.ocrFallback !== false ? 'På' : 'Av')}${ro('Bruk ved lav AI-sikkerhet', st.ocrLowConf ? 'På' : 'Av')}</div>
      <div class="snote p17-adm">🔒 ${ADMIN_NOTE}. AI-motorer, modeller, nøkler og tidsgrenser er felles for hele serveren.</div>
      ${logView}`;
  }
  return `<div class="sec">Hvem gjør hva</div><div class="list">${TASKS.map(([k, n, def]) => `<div class="opt-row col"><span style="font-weight:600">${n}</span>${sel(k, def)}</div>`).join('')}</div>
    <div class="snote">Feiler motoren, prøves neste automatisk. Hvert kall logges.</div>
    <div class="sec">Groq</div><div class="list">${inp('groqKey', st.groqKeySet ? 'API-nøkkel (lagret – skriv for å bytte)' : 'API-nøkkel (gsk_…)', '••••••••', 'password')}${inp('groqModel', 'Modell', 'llama-3.3-70b-versatile', 'text', st.groqModel ?? '')}
      <a class="opt-row" href="https://console.groq.com/keys" target="_blank" rel="noopener"><span class="m-grow" style="color:var(--m-acc);font-weight:500">Lag nøkkel på console.groq.com ↗</span></a></div>
    <div class="sec">Roboflow</div><div class="list">${inp('roboflowKey', st.roboflowKeySet ? 'Private API Key (lagret – skriv for å bytte)' : 'Private API Key', '••••••••', 'password')}${inp('roboflowWorkspace', 'Arbeidsområde', 'sebastians-workspace-y3jnc', 'text', st.roboflowWorkspace ?? '')}${inp('roboflowWorkflow', 'Modell eller versjon', 'prosjekt/1', 'text', st.roboflowWorkflow ?? '')}
      <a class="opt-row" href="https://app.roboflow.com/sebastians-workspace-y3jnc/settings/api" target="_blank" rel="noopener"><span class="m-grow" style="color:var(--m-acc);font-weight:500">Finn nøkkelen i Roboflow ↗</span></a></div>
    <div class="sec">Lokal OCR-reserve</div><div class="list">${tg('ocrFallback', 'Lokal OCR-reserve', 'Tesseract leser kvitteringen uten nett hvis AI feiler', st.ocrFallback !== false)}${tg('ocrLowConf', 'Bruk ved lav AI-sikkerhet', `Sammenlign med lokal OCR under ${st.minConf ?? 85} %`, !!st.ocrLowConf)}</div>
    <div class="list">${['groq', 'gemini', 'ollama'].map((e) => `<button class="opt-row" data-p17="aitest" data-k="${e}"><span class="m-grow" style="color:var(--m-acc);font-weight:500">Test ${ENG[e]}</span></button>`).join('')}<button class="opt-row" data-p17="rftest"><span class="m-grow" style="color:var(--m-acc);font-weight:500">Test Roboflow</span></button><button class="opt-row" data-p17="aisave"><span class="m-grow" style="color:var(--m-acc);font-weight:700">Lagre nøkler og modeller</span></button></div>
    ${AI17.msg ? `<div class="snote">${esc(AI17.msg)}</div>` : ''}
    ${logView}`;
}

/* ---------- Varsler og haptikk (GET/PUT /api/me/notify, egen lyd) ---------- */

export const NT = { d: null, err: '', busy: false };
const SOUNDS = [['klokke', 'Klokke'], ['pling', 'Pling'], ['papir', 'Papir'], ['dobbel', 'Dobbel'], ['dyp', 'Dyp'], ['egen', 'Egen lyd'], ['stille', 'Stille']];
const NGROUPS = [['pakker', 'Pakker', 'Ny pakke, klar for henting, levert'], ['finans', 'Finans og hjem', 'Kvitteringer, budsjett og faste utgifter'], ['familie', 'Familie', 'Kommer og går fra soner'], ['birthdays', 'Bursdager', 'Kl. 09:00 før en bursdag (påminnelse per person)'], ['reise', 'Reise og vær', 'Avganger og værvarsler'], ['haptikk', 'Haptikk', 'Vibrasjon ved varsler']];
const NDEF = { on: true, quietOn: true, quietFrom: '22:00', quietTo: '07:00', sound: 'klokke', volume: 70, groups: { pakker: true, finans: true, familie: true, birthdays: true, reise: false, haptikk: true } };
export async function notifyLoad() {
  try { const r = await hlApi('/me/notify'); NT.d = { ...NDEF, ...(r ?? {}), groups: { ...NDEF.groups, ...(r?.groups ?? {}) } }; NT.err = ''; }
  catch (e) { NT.d = { ...NDEF, ...(L.notify ?? {}), groups: { ...NDEF.groups, ...(L.notify?.groups ?? {}) } }; NT.err = e.status === 404 ? 'Lagres på denne enheten til serveren er oppdatert.' : ''; }
}
async function notifySave(patch) {
  NT.d = { ...NT.d, ...patch, groups: { ...NT.d.groups, ...(patch.groups ?? {}) } }; L.notify = NT.d; keep(); draw();
  try { await hlApi('/me/notify', { method: 'PUT', json: patch }); } catch (e) { if (e.status !== 404) flash(e.message); }
}
let actx = null;
/** Spiller varsellyden: egen lyd fra serveren, de innebygde WAV-filene, eller en tone fra WebAudio som reserve. */
export async function playSound(id = NT.d?.sound ?? 'klokke', vol = (NT.d?.volume ?? 70) / 100) {
  if (id === 'stille') return;
  const url = id === 'egen' ? '/api/me/notify/sound' : `/assets/sounds/${id}.wav`;
  try { const a = new Audio(url); a.volume = Math.max(0, Math.min(1, vol)); await a.play(); return; } catch {}
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    const T = { klokke: [[880, 0, 0.35], [660, 0.18, 0.4]], pling: [[1320, 0, 0.25]], papir: [[520, 0, 0.12], [700, 0.1, 0.12]], dobbel: [[990, 0, 0.14], [990, 0.2, 0.14]], dyp: [[220, 0, 0.6]], egen: [[740, 0, 0.3]] }[id] ?? [[880, 0, 0.3]];
    for (const [f, t0, d] of T) { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + t0; o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * vol + 0.001, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.05); }
  } catch {}
}
async function testNotify() {
  await playSound(); if (NT.d?.groups?.haptikk !== false) navigator.vibrate?.([30, 60, 30]);
  if ('Notification' in window) {
    if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
    if (Notification.permission === 'granted') { try { new Notification(appName(), { body: 'Testvarsel · slik ser varslene ut', icon: '/assets/finans/icons/icon-192.png', silent: true }); } catch {} }
    else flash('Varsler er ikke tillatt i nettleseren. Lyd og vibrasjon er testet.');
  }
  hlApi('/me/notify/test', { method: 'POST' }).catch(() => {});
}
export function p17Varsler(trkRows = '') {
  const d = NT.d ?? NDEF, perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const tg = (attr, n, s, on) => `<button class="opt-row" ${attr} role="switch" aria-checked="${!!on}"><span class="m-grow"><b style="font-weight:500">${esc(n)}</b>${s ? `<br><span style="font-size:13px;opacity:.65">${esc(s)}</span>` : ''}</span><span class="sw" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
  const permTxt = perm === 'granted' ? 'Tillatt' : perm === 'denied' ? 'Blokkert i nettleseren' : perm === 'unsupported' ? 'Ikke støttet' : 'Ikke spurt ennå';
  return `<div class="list">${tg('data-p17="non"', 'Varsler', 'Hovedbryter for alle varsler', d.on !== false)}
      ${d.on !== false ? P31.varslerRows(tg) + P30.updNoteRow(tg) /* prompt 39 */ : ''}
      ${tg('data-p17="nquiet"', 'Stille timer', `${d.quietFrom}–${d.quietTo} · ingen lyd eller vibrasjon`, d.quietOn !== false)}
      ${d.quietOn !== false ? `<div class="opt-row"><span class="m-grow pp-mut">Fra og til</span><input class="sinp p17-time" type="time" data-p17in="qf" value="${esc(d.quietFrom)}" aria-label="Stille fra"><span class="pp-mut">–</span><input class="sinp p17-time" type="time" data-p17in="qt" value="${esc(d.quietTo)}" aria-label="Stille til"></div>` : ''}
      <button class="opt-row" data-p17="nperm"><span class="m-grow"><b style="font-weight:500">Tillatelse på enheten</b><br><span style="font-size:13px;opacity:.65">${esc(permTxt)}</span></span><span class="sval">${perm === 'default' ? 'Spør ›' : ''}</span></button>
      <button class="opt-row" data-p17="ntest"><span class="m-grow" style="color:var(--m-acc);font-weight:700">Test varsel</span><span class="sval">Lyd, vibrasjon og varsel</span></button></div>
    ${NT.err ? `<div class="snote">${esc(NT.err)}</div>` : ''}
    ${globalThis.P45?.zoneAlertsSettings?.() ?? '' /* prompt 45: Familie → Sonevarsler */}
    <div class="sec">Varsellyd</div><div class="list"><div class="opt-row col"><div class="pp-chips">${SOUNDS.map(([k, n]) => `<button class="pp-fchip sm" data-p17="snd" data-k="${k}" aria-pressed="${d.sound === k}">${d.sound === k ? '✓ ' : ''}${n}</button>`).join('')}</div></div>
      <label class="opt-row"><span class="m-grow">Volum</span><input type="range" min="0" max="100" step="5" value="${+d.volume || 0}" data-p17in="vol" aria-label="Volum"><b style="width:44px;text-align:right">${+d.volume || 0} %</b></label>
      <label class="opt-row"><span class="m-grow" style="color:var(--m-acc);font-weight:500">${d.sound === 'egen' ? 'Bytt egen lyd' : 'Last opp egen lyd'}<br><span style="font-size:12.5px;opacity:.65;color:inherit">MP3, WAV eller M4A under 1 MB</span></span><input class="m-file" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a" data-p17file="snd"></label></div>
    <div class="sec">Grupper</div><div class="list">${NGROUPS.map(([k, n, s]) => tg(`data-p17="ngrp" data-k="${k}"`, n, s, d.groups?.[k] !== false)).join('')}</div>
    ${trkRows ? `<div class="sec">Pakker</div><div class="list">${trkRows}</div>` : ''}
    <div class="list"><a class="opt-row" href="#/set/hap"><span class="m-grow">Haptikk</span><span style="opacity:.5">›</span></a></div>
    <div class="snote">${P31.pushSupported() ? 'Med «Varsler på denne enheten» kan Glimt, prøveperioder og oppdateringer varsle også når appen er lukket.' : 'Denne nettleseren støtter ikke push. På iPhone: legg appen på Hjem-skjermen for å få varsler når den er lukket.'}</div>`;
}

/* ---------- Huskeliste (/api/tasks, delt i familien, sanntid via WebSocket) ---------- */

export const HK = { d: null, err: '', cur: 'alle', nv: '', due: 0, who: '', local: false, t: 0 };
const LISTS0 = [{ id: 'hjem', name: 'Hjem', color: '#b23a2a' }, { id: 'handel', name: 'Handel', color: '#2f6b45' }, { id: 'hytta', name: 'Hytta', color: '#a8661a' }, { id: 'jobb', name: 'Jobb', color: '#2b5d8a' }];
const dayIso = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
export async function tasksLoad(force = false) {
  if (!force && HK.d && Date.now() - HK.t < 15000) return;
  HK.t = Date.now();
  try { const r = await hlApi('/tasks'); HK.d = { lists: r?.lists?.length ? r.lists : LISTS0, items: r?.items ?? [], members: r?.members ?? [] }; HK.err = ''; HK.local = false; }
  catch (e) {
    if (e.status === 404) { HK.local = true; HK.d = { lists: LISTS0, items: L.tasks ?? [], members: [] }; HK.err = ''; }
    else { HK.err = e.message; HK.d ??= { lists: LISTS0, items: [], members: [] }; }
  }
}
const saveLocal = () => { if (HK.local) { L.tasks = HK.d.items; keep(); } };
export const saveLocal37 = () => saveLocal(); // prompt 37: Gjøremål (mobile-p37.js) lagrer lokalt på eldre server
async function taskAdd() {
  const title = HK.nv.trim(); if (!title) return;
  const list = HK.cur === 'alle' ? (HK.d?.lists?.[0]?.id ?? 'hjem') : HK.cur;
  const body = { title, list, due: HK.due == null ? null : dayIso(HK.due), assignee: HK.who || null };
  HK.nv = ''; haptic('ok');
  if (HK.local) { HK.d.items = [{ id: 'l' + Date.now(), ...body, done: false, createdAt: Date.now() }, ...HK.d.items]; saveLocal(); draw(); return; }
  try { const r = await hlApi('/tasks', { method: 'POST', json: body }); HK.d.items = [r?.item ?? r, ...HK.d.items.filter((x) => x.id !== (r?.item ?? r)?.id)]; } catch (e) { flash(e.message); }
  draw();
}
async function taskPatch(id, patch) {
  HK.d.items = HK.d.items.map((x) => (String(x.id) === String(id) ? { ...x, ...patch } : x)); saveLocal(); draw();
  if (!HK.local) await hlApi(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }).catch((e) => flash(e.message));
}
async function taskDel(id) {
  HK.d.items = HK.d.items.filter((x) => String(x.id) !== String(id)); saveLocal(); draw();
  if (!HK.local) await hlApi(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => flash(e.message));
}
const listOf = (id) => (HK.d?.lists ?? LISTS0).find((l) => String(l.id) === String(id)) ?? { name: '', color: '#1b1a17' };
const whoName = (uid) => { if (!uid) return ''; const p = (HK.d?.members ?? []).find((x) => String(x.userId ?? x.id) === String(uid)); return (p?.name ?? p?.username ?? String(uid)).split(' ')[0]; };
function dueLbl(due) {
  if (!due) return ['', ''];
  const n = Math.round((new Date(String(due).slice(0, 10) + 'T12:00') - new Date(dayIso(0) + 'T12:00')) / 864e5);
  return n < 0 ? [`Forfalt ${-n} d`, 'lab'] : n === 0 ? ['I dag', 'lab'] : n === 1 ? ['I morgen', 'ink'] : [new Date(String(due).slice(0, 10) + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }), 'mut'];
}
// Prompt 32 (claude-code-rom-fullskjerm-bursdag-huskeliste.md): Arkivert. Fullførte oppgaver arkiveres automatisk etter 7 dager.
const tsOf = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : Date.parse(v) || null);
export const isArch = (x) => !!(x.archived || x.archivedAt || x.archived_at || x.arch) || (x.done && tsOf(x.doneAt ?? x.done_at ?? x.completedAt ?? x.completed_at) != null && Date.now() - tsOf(x.doneAt ?? x.done_at ?? x.completedAt ?? x.completed_at) > 7 * 864e5);
const archOf = () => { const own = (HK.d?.items ?? []).filter(isArch), ex = (HK.arch ?? []).filter((x) => !own.some((y) => String(y.id) === String(x.id))); return [...own, ...ex].sort((a, b) => (tsOf(b.archivedAt ?? b.archived_at ?? b.doneAt ?? b.done_at) ?? 0) - (tsOf(a.archivedAt ?? a.archived_at ?? a.doneAt ?? a.done_at) ?? 0)); };
export const archLoad37 = () => archLoad(); export const archOf37 = () => archOf(); // prompt 37
async function archLoad() {
  if (HK.local || HK.archT && Date.now() - HK.archT < 15000) return;
  HK.archT = Date.now();
  try { const r = await hlApi('/tasks?archived=1'); HK.arch = (r?.items ?? (Array.isArray(r) ? r : [])).filter(isArch); } catch { HK.arch = []; }
}
async function archSet(ids, on) {
  const now = new Date().toISOString(), S = new Set(ids.map(String));
  const patch = on ? { archived: true, archivedAt: now } : { archived: false, archivedAt: null, done: false, doneAt: null };
  const all = [...(HK.d?.items ?? []), ...(HK.arch ?? [])].filter((x) => S.has(String(x.id)));
  HK.d.items = HK.d.items.filter((x) => !S.has(String(x.id)));
  HK.arch = (HK.arch ?? []).filter((x) => !S.has(String(x.id)));
  for (const x of all) { const n = { ...x, ...patch, arch: on || undefined }; if (!on) { delete n.arch; delete n.archived_at; delete n.done_at; delete n.completedAt; } if (on) HK.arch.unshift(n); else HK.d.items.unshift(n); }
  saveLocal(); draw();
  if (!HK.local) for (const id of S) await hlApi(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }).catch((e) => flash(e.message));
}
async function archDel(ids) {
  const S = new Set(ids.map(String));
  HK.d.items = HK.d.items.filter((x) => !S.has(String(x.id))); HK.arch = (HK.arch ?? []).filter((x) => !S.has(String(x.id))); saveLocal(); draw();
  if (!HK.local) for (const id of S) await hlApi(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => flash(e.message));
}
const ARCH_IC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"/></svg>';
const openTasks = () => (HK.d?.items ?? []).filter((x) => !x.done && !isArch(x)).sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')));
function taskRow(x, all) {
  const l = listOf(x.list), [dt, dc] = dueLbl(x.due);
  const meta = [dt, whoName(x.assignee), all ? l.name : ''].filter(Boolean).join(' · ');
  return `<div class="p17-tk${x.done ? ' done' : ''}"><button class="p17-chk" data-p17="tick" data-id="${esc(x.id)}" style="--c:${esc(l.color)};--cb:${x.done ? esc(l.color) : 'transparent'}" aria-label="${x.done ? 'Angre' : 'Fullfør'} ${esc(x.title)}">${x.done ? '✓' : ''}</button>
    <span class="m-grow p17-rt"><b>${esc(x.title)}</b>${meta ? `<small class="${!x.done && dc === 'lab' ? 'pp-lab-c' : ''}">${esc(meta)}</small>` : ''}</span>${x.done && !isArch(x) ? `<button class="p17-x p32-ar" data-p17="tarch" data-id="${esc(x.id)}" aria-label="Arkiver ${esc(x.title)}">${ARCH_IC}</button>` : ''}${isArch(x) ? `<button class="p32-rs" data-p17="trest" data-id="${esc(x.id)}">↺ Gjenopprett</button>` : ''}<button class="p17-x" data-p17="tdel" data-id="${esc(x.id)}" aria-label="Slett ${esc(x.title)}">×</button></div>`;
}
export function huskeView() {
  if (!HK.d) return '<div class="m-spin"></div>';
  const lists = HK.d.lists ?? LISTS0, items = (HK.d.items ?? []).filter((x) => !isArch(x)), all = HK.cur === 'alle', AR = HK.cur === 'arkiv';
  if (AR && !HK.archT) archLoad().then(draw).catch(() => {});
  const arch = archOf();
  const inL = AR ? [] : items.filter((x) => all || String(x.list) === String(HK.cur));
  const t0 = dayIso(0), soon = inL.filter((x) => !x.done && x.due && String(x.due).slice(0, 10) <= t0), later = inL.filter((x) => !x.done && !(x.due && String(x.due).slice(0, 10) <= t0)), done = inL.filter((x) => x.done);
  const curN = all ? 'Alle' : AR ? 'Arkivert' : listOf(HK.cur).name;
  const mem = HK.d.members ?? [];
  const groups = AR ? (arch.length ? [[`ARKIVERT · ${arch.length}`, arch, 'Tøm arkivet', 'tarchclr']] : []) : [['I DAG OG FORFALT', soon], ['SENERE', later], ['FERDIG', done.slice(0, 12), 'Arkiver alle', 'tarchall']].filter(([, a]) => a.length);
  return `<div class="pp-col p17-hk">
    ${AR ? '' : `<form class="pp-card p17-hadd" data-p17form="task"><input class="sinp" id="p17-tk" data-p17in="tk" value="${esc(HK.nv)}" placeholder="Ny oppgave i ${esc(curN)}" autocomplete="off" aria-label="Ny oppgave"><button class="p17-plus" type="submit" aria-label="Legg til">+</button></form>`}
    <div class="pp-chips p17-lists" role="tablist"><button class="pp-fchip" data-p17="hlist" data-k="alle" aria-pressed="${all}">Alle <span>${items.filter((x) => !x.done).length}</span></button>${lists.map((l) => `<button class="pp-fchip" data-p17="hlist" data-k="${esc(l.id)}" aria-pressed="${String(HK.cur) === String(l.id)}"><i style="background:${esc(l.color)}"></i>${esc(l.name)}${l.shared || (l.members ?? []).length || l.mine === false ? ' <b class="p21-shr" aria-label="Delt">⇄</b>' : ''} <span>${items.filter((x) => !x.done && String(x.list) === String(l.id)).length}</span></button>`).join('')}<button class="pp-fchip" data-p17="hlist" data-k="arkiv" aria-pressed="${AR}">Arkivert · ${arch.length}</button></div>
    <div class="pp-chips p17-due">${[[0, 'I dag'], [1, 'I morgen'], [7, 'Neste uke'], [null, 'Uten dato']].map(([v, n]) => `<button class="pp-fchip sm" data-p17="tdue" data-v="${v ?? ''}" aria-pressed="${HK.due === v}">${n}</button>`).join('')}${mem.length ? `<span class="p17-sep"></span>${[['', 'Alle'], ...mem.map((p) => [String(p.userId ?? p.id), (p.name ?? p.username ?? '').split(' ')[0]])].map(([v, n]) => `<button class="pp-fchip sm" data-p17="twho" data-v="${esc(v)}" aria-pressed="${HK.who === v}">${esc(n)}</button>`).join('')}` : ''}</div>
    ${all || AR || HK.local ? '' : listShareLine(listOf(HK.cur), mem, m.me?.id ?? currentUser())}
    ${HK.err ? `<div class="pp-card pp-mut">${esc(HK.err)}</div>` : ''}
    ${groups.map(([t, a, an, ak]) => `<span class="pp-lab p32-gh"><span>${t}</span>${an ? `<button type="button" class="p32-gb" data-p17="${ak}">${an}</button>` : ''}</span><div class="pp-card p17-tks">${a.map((x) => taskRow(x, all || AR)).join('')}</div>`).join('') || `<div class="pp-card pp-mut">${AR ? 'Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager.' : `Ingen oppgaver i ${esc(curN)}.`}</div>`}
    ${HK.local ? '<span class="pp-mut" style="font-size:12px;padding:0 4px">Lagres på denne enheten til serveren har Huskeliste. Oppdater Homelab for å dele listen med familien.</span>' : '<span class="pp-mut" style="font-size:12px;padding:0 4px">Listene dine er private. Velg en liste og trykk «Del liste» for å dele den med navngitte personer.</span>'}</div>`;
}
/** Hjem-kortet: de tre neste oppgavene med avkrysning. */
export function huskeWidget() {
  const op = openTasks(), top = op.slice(0, 3);
  return `<a class="pp-card p17-hw" href="#/huske"><div class="pp-row"><span class="pp-lab">HUSKELISTE · ${op.length} IGJEN</span><span class="pp-mut">alle ›</span></div>
    ${top.map((x) => { const l = listOf(x.list), [dt] = dueLbl(x.due); return `<div class="p17-hwr"><button class="p17-chk sm" data-p17="tick" data-id="${esc(x.id)}" style="--c:${esc(l.color)}" aria-label="Fullfør ${esc(x.title)}"></button><span class="m-grow m-ell">${esc(x.title)}</span><span class="pp-mut">${esc(dt)}</span></div>`; }).join('') || `<span class="pp-mut">${HK.d ? 'Alt er gjort.' : 'Laster …'}</span>`}</a>`;
}

/* ---------- Hjem: Posisjon og Bolig ---------- */

const ago = (ts) => { if (!ts) return ''; const s = Math.round((Date.now() - new Date(ts)) / 1000); return s < 90 ? 'nå' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} t` : `${Math.round(s / 86400)} d`; };
export function posWidget() {
  const mem = FM.d?.members ?? [];
  if (!FM.d) return `<a class="pp-card p17-pw" href="#/fam"><span class="pp-lab">POSISJON</span><span class="pp-mut">${FM.err ? esc(FM.err) : 'Laster familien …'}</span></a>`;
  return `<a class="pp-card p17-pw" href="#/fam"><div class="pp-row"><span class="pp-lab">POSISJON · FAMILIEN</span><span class="pp-mut">kart ›</span></div>
    <div class="p17-ppl">${mem.slice(0, 6).map((p) => { const l0 = p.last, on = p.sharing === 'on';
      const where = on ? (l0 ? `${l0.place || (p.precision === 'approx' ? 'Omtrentlig' : 'Posisjon')} · ${ago(l0.ts)}` : 'Ingen posisjon') : p.sharing === 'paused' ? 'Pauset' : 'Deler ikke';
      return `<span class="p17-pp"><span class="p16-av" style="width:34px;height:34px">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(ini(p.name || p.username))}<i class="${on ? 'on' : p.sharing === 'paused' ? 'pa' : 'off'}"></i></span><span class="p17-rt" style="min-width:0"><b class="m-ell">${esc((p.name || p.username || '').split(' ')[0])}</b><small class="m-ell">${esc(where)}</small></span></span>`; }).join('') || '<span class="pp-mut">Ingen deler posisjon ennå.</span>'}</div></a>`;
}
let bolT = 0;
export async function bolWidgetLoad() {
  if (Date.now() - bolT < 60000) return;
  bolT = Date.now();
  try { if (!BO.list) BO.list = await api('/folders'); const f = (BO.list ?? [])[0]; if (f && !BO.d[f.id]) BO.d[f.id] = await api(`/folders/${f.id}`); } catch {}
}
export function bolWidget() {
  const f = (BO.list ?? [])[0];
  if (!f) return BO.list ? '' : `<a class="pp-card p17-bw" href="#/dir"><span class="pp-lab">BOLIG</span><span class="pp-mut">Laster …</span></a>`;
  const d = BO.d[f.id] ?? {}, k = d.kpi ?? {}, mo = (d.months ?? []).at?.(-1), spent = mo?.sum ?? mo?.total ?? mo?.amount ?? k.monthTotal ?? 0;
  const budget = k.budget ?? d.budget ?? f.budget ?? 0, pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const review = k.review ?? d.review ?? (d.entries ?? []).filter((e) => e.status === 'review').length, nx = (d.upcoming ?? [])[0];
  const kr = (v) => `${n0(v)} kr`;
  return `<a class="pp-card p17-bw" href="#/dir/${esc(f.id)}"><div class="pp-row"><span class="pp-lab">BOLIG · ${esc(String(f.name ?? '').toUpperCase())}</span><span class="pp-mut">åpne ›</span></div>
    <div class="p17-bwn"><b class="pp-serif">${kr(spent)}</b><span class="pp-mut">${budget ? `av ${kr(budget)} denne måneden` : 'brukt denne måneden'}</span></div>
    ${budget ? `<span class="p17-bar"><i style="width:${pct}%"></i></span>` : ''}
    <div class="p17-facts"><span><small>Til gjennomgang</small><b>${review}</b></span><span><small>Neste faste</small><b class="m-ell">${nx ? esc(nx.title ?? nx.name ?? '') : '–'}</b></span><span><small>I år</small><b>${kr(k.yearTotal ?? f.yearTotal ?? 0)}</b></span></div></a>`;
}

/* ---------- Familie: fanene Kart, Soner og Helse ---------- */

export const FT = { tab: 'kart' };
export const famTabs = () => `<div class="p16-seg p17-ftabs" role="tablist">${[['kart', 'Kart'], ['soner', 'Soner'], ['helse', 'Helse']].map(([k, n]) => `<button role="tab" data-p17="ftab" data-k="${k}" aria-selected="${FT.tab === k}" aria-pressed="${FT.tab === k}">${n}</button>`).join('')}</div>`;
const ACT = { still: 'I ro', walking: 'Går', running: 'Løper', cycling: 'Sykler', driving: 'Kjører' };
/** Personkortet for den valgte personen: sensorer, enhet, koordinater, veibeskrivelse og «Spill av lyd». */
export function personCard() {
  const p = (FM.d?.members ?? []).find((x) => String(x.userId) === String(FM.sel));
  if (!p) return '';
  const l0 = p.last ?? {}, on = p.sharing === 'on' && l0.lat != null;
  const bat = l0.battery != null ? `${Math.round(l0.battery * (l0.battery <= 1 ? 100 : 1))} %` : '–';
  const sens = [['Batteri', `${l0.charging ? '⚡ ' : ''}${bat}`], ['Aktivitet', ACT[l0.activity] ?? '–'], ['Fart', l0.speed != null && p.precision !== 'approx' ? `${Math.round(l0.speed * 3.6)} km/t` : '–'], ['Nøyaktighet', l0.acc != null ? `±${Math.round(l0.acc)} m` : '–'], ['Enhet', l0.device ?? p.device ?? '–'], ['Posisjon', on ? `${(+l0.lat).toFixed(4)}, ${(+l0.lon).toFixed(4)}` : '–']];
  const where = on ? `${l0.place || (p.precision === 'approx' ? 'Omtrentlig posisjon' : 'Posisjon')} · ${ago(l0.ts)} siden` : p.sharing === 'paused' ? 'Har pauset delingen' : 'Deler ikke posisjon';
  return `<div class="pp-card p17-pc"><div class="pp-row" style="align-items:center"><span class="p16-av" style="width:44px;height:44px">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(ini(p.name))}</span><span class="m-grow p17-rt"><b class="pp-serif" style="font-size:19px">${esc(p.name || p.username)}</b><small>${esc(where)}</small></span><button class="p17-x" data-p17="psx" aria-label="Lukk">×</button></div>
    <div class="p17-sens">${sens.map(([a, b]) => `<span><small>${a}</small><b class="m-ell">${esc(b)}</b></span>`).join('')}</div>
    ${on ? `<div class="p17-two"><a class="pp-btn" href="https://www.openstreetmap.org/directions?to=${l0.lat},${l0.lon}#map=15/${l0.lat}/${l0.lon}" target="_blank" rel="noopener">Veibeskrivelse</a><button class="pp-btn ink" data-p17="ping" data-id="${esc(p.userId)}">Spill av lyd</button></div>` : ''}</div>`;
}
/** Helse: skritt mot mål, hvilepuls, puls, søvn, aktive kalorier og 7 dager per person. */
export function healthView() {
  const mem = FM.d?.members ?? [], goal = 8000;
  const me = FM.d?.me ?? {}, sh = me.shareHealth ?? {};
  const src = isIOS() ? 'Apple Health' : 'Health Connect';
  // Helse vises bare for deg selv og dem som deler med deg (aldri når delingen er av eller pauset).
  const vis = mem.filter((p) => p.self || String(p.userId) === String(me.userId) || p.sharing === 'on');
  const cards = vis.map((p) => {
    const h = p.health?.today ?? null, wk = p.health?.week ?? [];
    if (!h) return `<div class="pp-card p17-hc"><div class="pp-row" style="align-items:center"><span class="p16-av" style="width:36px;height:36px">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(ini(p.name))}</span><span class="m-grow"><b>${esc((p.name || p.username || '').split(' ')[0])}</b></span><span class="p16-st mut">Deler ikke</span></div><span class="pp-mut">Deler ikke helsedata. ${esc((p.name || '').split(' ')[0])} kan slå det på i sin app.</span></div>`;
    const st = h.steps ?? 0, frac = Math.min(1, st / goal), C = 2 * Math.PI * 26, mx = Math.max(goal, ...wk.map((d) => d.steps ?? 0));
    return `<div class="pp-card p17-hc"><div class="pp-row" style="align-items:center"><span class="p16-av" style="width:36px;height:36px">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(ini(p.name))}</span><span class="m-grow p17-rt"><b>${esc((p.name || p.username || '').split(' ')[0])}</b><small>${p.health?.updatedAt ? `Oppdatert ${ago(p.health.updatedAt)} siden` : ''}</small></span><span class="p16-st pos">Deler</span></div>
      <div class="p17-ring"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--pp-line)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="var(--pp-pos)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/></svg><div class="p17-rt"><b class="pp-serif" style="font-size:26px">${n0(st)}</b><small>skritt · mål ${n0(goal)}</small></div></div>
      <div class="p17-sens">${[['Hvilepuls', h.restingHr != null ? `${Math.round(h.restingHr)} bpm` : '–'], ['Puls nå', h.hr != null ? `${Math.round(h.hr)} bpm` : '–'], ['Søvn', h.sleepMin != null ? `${Math.floor(h.sleepMin / 60)} t ${h.sleepMin % 60} m` : '–'], ['Aktive kcal', h.activeKcal != null ? n0(h.activeKcal) : '–']].map(([a, b]) => `<span><small>${a}</small><b>${esc(b)}</b></span>`).join('')}</div>
      ${wk.length ? `<div class="p17-week" aria-label="Skritt siste 7 dager">${wk.slice(-7).map((d) => `<span title="${esc(d.date)}"><i style="height:${Math.max(4, Math.round(((d.steps ?? 0) / mx) * 100))}%"></i><small>${esc(new Date(String(d.date).slice(0, 10) + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'narrow' }))}</small></span>`).join('')}</div>` : ''}</div>`;
  }).join('');
  const tog = (k, n) => `<button class="pp-fchip sm" data-p17="hshare" data-k="${k}" aria-pressed="${!!sh[k]}">${sh[k] ? '✓ ' : ''}${n}</button>`;
  return `<div class="pp-card p17-hsrc"><span class="pp-lab">DIN DELING · ${esc(src.toUpperCase())}</span><div class="pp-chips">${tog('steps', 'Skritt')}${tog('restingHr', 'Hvilepuls')}${tog('hr', 'Puls')}${tog('sleep', 'Søvn')}${tog('activeKcal', 'Aktive kalorier')}${tog('week', 'Siste 7 dager')}</div>
      <span class="pp-mut">Apple Health og Health Connect kan bare leses av appen på telefonen. Den sender et sammendrag hit hvert 15. minutt, og bare det du har valgt å dele. Nettleseren har ikke tilgang til helsedata.</span></div>
    ${cards || ''}${vis.some((p) => !(p.self || String(p.userId) === String(me.userId))) ? '' : '<div class="pp-card p21-empty"><b class="pp-serif">Ingen deler helse med deg ennå</b><div class="pp-mut">Helsedeling er av som standard. Velg selv over hva du vil dele.</div></div>'}`;
}

/* ---------- Yr mot Storm (GET /api/weather/compare) ---------- */
// Prompt 30: Storm i stedet for det gamle navnet overalt, fullskjerm med Ferdig-pille, logoene fra /assets/brands/ (yr.png, storm.png).
export const YR_LOGO = '/assets/brands/yr.png', STORM_LOGO = '/assets/brands/storm.png';
export const brandImg = (src, size) => `<img class="p30-bl" src="${src}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:${size / 2}px">`;

export const CMP = { open: false, d: {}, err: '', busy: false };
export async function cmpLoad(place) {
  CMP.busy = true; CMP.err = ''; draw();
  try { const WXM = await import('./mobile-wx.js'); CMP.d[place] = await hlApi(`/weather/compare?${WXM.placeQuery ? WXM.placeQuery(place) : `place=${encodeURIComponent(place)}`}`); }
  catch (e) { CMP.err = e.status === 404 ? 'Sammenligningen krever en nyere server. Oppdater Homelab.' : e.message; }
  CMP.busy = false; draw();
}
export const cmpEntry = () => `<button class="vx-card p17-cmpb" data-p17="cmp"><span class="p17-cmpi p30-logos">${brandImg(YR_LOGO, 30)}${brandImg(STORM_LOGO, 30)}</span><span class="m-grow p17-rt"><b>Sammenlign Yr og Storm</b><small>Temperatur og nedbør side om side</small></span><span aria-hidden="true">›</span></button>`;
const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toLocaleString('nb-NO'));
export function cmpView(place, placeName) {
  if (!CMP.open) return '';
  const D = CMP.d[place];
  let body = '';
  if (CMP.busy && !D) body = '<span class="vx-sm">Henter Storm-data …</span>';
  else if (CMP.err && !D) body = `<div class="vx-card vx-pad">${esc(CMP.err)}</div>`;
  else if (D) {
    const hrs = (D.hours ?? []).slice(0, 24), W = 300, H = 150, n = Math.max(1, hrs.length - 1);
    const temps = hrs.flatMap((h) => [h.yr?.temp, h.ecmwf?.temp]).filter((v) => v != null), lo = Math.min(...temps, 0), hi = Math.max(...temps, 1), sp = Math.max(1, hi - lo);
    const mm = Math.max(1, ...hrs.flatMap((h) => [h.yr?.mm ?? 0, h.ecmwf?.mm ?? 0]));
    const X = (i) => 14 + (i / n) * (W - 28), Y = (v) => 14 + (1 - (v - lo) / sp) * (H - 54);
    const ln = (k) => hrs.map((h, i) => (h[k]?.temp == null ? '' : `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(h[k].temp).toFixed(1)}`)).join(' ');
    const bars = hrs.map((h, i) => { const bw = Math.max(2, (W - 28) / (n + 1) / 2 - 1); const yb = (v) => ((v ?? 0) / mm) * 36; return `<rect x="${(X(i) - bw).toFixed(1)}" y="${(H - 18 - yb(h.yr?.mm)).toFixed(1)}" width="${bw.toFixed(1)}" height="${yb(h.yr?.mm).toFixed(1)}" fill="#0a6ac2" opacity=".55"/><rect x="${X(i).toFixed(1)}" y="${(H - 18 - yb(h.ecmwf?.mm)).toFixed(1)}" width="${bw.toFixed(1)}" height="${yb(h.ecmwf?.mm).toFixed(1)}" fill="#ff8a3d" opacity=".55"/>`; }).join('');
    const hx = hrs.map((h, i) => (i % 4 ? '' : `<text x="${X(i).toFixed(1)}" y="${H - 4}" fill="rgba(255,255,255,.75)" font-size="9" font-weight="700" text-anchor="middle">${String(new Date(h.t).getHours()).padStart(2, '0')}</text>`)).join('');
    const days = D.days ?? [], ag = D.agreement ?? (days.length ? Math.round(days.reduce((a, d) => a + (d.agree ?? 0), 0) / days.length) : null);
    const avgDiff = days.length ? days.reduce((a, d) => a + Math.abs(d.diffHi ?? 0), 0) / days.length : 0;
    const agC = avgDiff < 1.5 ? '#6fdc8c' : avgDiff < 3 ? '#ffb347' : '#f26b5e', agT = avgDiff < 1.5 ? 'Yr og Storm er enige' : avgDiff < 3 ? 'Litt uenige' : 'Uenige denne uken';
    body = `<div class="vx-card p17-agree"><span style="background:${agC}"></span><div class="p17-rt"><b>${agT}${ag != null ? ` · ${ag} %` : ''}</b><small>Snitt avvik i makstemperatur: ${f1(avgDiff)}° over ${days.length} dager</small></div></div>
      <div class="vx-card vx-pad"><div class="p17-leg"><span>${brandImg(YR_LOGO, 16)}<i style="background:#5aa9ff"></i>Yr</span><span>${brandImg(STORM_LOGO, 16)}<i style="background:#ff8a3d"></i>Storm</span></div>
        <svg viewBox="0 0 ${W} ${H}" class="p17-cmpc" aria-label="Temperatur og nedbør neste 24 timer">${bars}<path d="${ln('yr')}" fill="none" stroke="#5aa9ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="${ln('ecmwf')}" fill="none" stroke="#ff8a3d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 4"/>${hx}</svg>
        <span class="vx-sm">Søyler viser nedbør per time. Yr til venstre, Storm til høyre.</span></div>
      <div class="vx-card p17-cmpt"><div class="p17-cr h"><span></span><span class="p30-th">${brandImg(YR_LOGO, 18)}YR</span><span class="p30-th">${brandImg(STORM_LOGO, 18)}STORM</span><span>AVVIK</span></div>${days.slice(0, 7).map((d, i) => `<div class="p17-cr"><span>${i === 0 ? 'I dag' : esc(new Date(d.date + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'short' }))}</span><span>${f1(d.yr?.lo)}° / <b>${f1(d.yr?.hi)}°</b><small>${f1(d.yr?.mm)} mm</small></span><span>${f1(d.ecmwf?.lo)}° / <b>${f1(d.ecmwf?.hi)}°</b><small>${f1(d.ecmwf?.mm)} mm</small></span><span class="${Math.abs(d.diffHi ?? 0) >= 3 ? 'bad' : ''}">${d.diffHi != null ? `${d.diffHi > 0 ? '+' : ''}${f1(d.diffHi)}°` : '–'}</span></div>`).join('')}</div>
      <a class="vx-yr" href="https://www.storm.no/" target="_blank" rel="noopener">Åpne storm.no ↗</a>
      <span class="vx-sm" style="line-height:1.45">Yr er MET Norway (api.met.no). Storm (StormGeo) har ikke et åpent API, så Storm-kolonnen viser ECMWF-modellen fra Open-Meteo, som er nærmeste åpne kilde. Avvik er forskjellen i makstemperatur.</span>`;
  }
  // Fullskjerm (ikke ark): #17191e helt ut, innhold maks 760 px, topp = safe area + 48 px, ingen logoer i headeren.
  return `<div class="p17-cmp p30-cmpfs" role="dialog" aria-label="Yr mot Storm"><div class="p17-cmpin"><div class="p30-cmph"><div class="p17-rt"><b class="p30-cmpt">Yr mot Storm</b><small>${esc(placeName ?? '')}</small></div><button type="button" class="p30-sb p30-pri" data-p17="cmpx">Ferdig</button></div>${body}</div></div>`;
}

/* ---------- Skanneknappen: trykk = kamera, hold inne = valg (Kvittering, Oppskrift, Bilder, Fil) ---------- */

/** Hvor en skanning havner: oppskrift i Mat, kvittering i boligen når man står i en bolig, ellers kvitteringskøen. */
export function scanCtx() {
  if (m.screen === 'mat') return 'mat';
  if (m.screen === 'dir' && +String(m.sub ?? '').split('/')[0]) return 'bol';
  return 'fin';
}
export async function homeUpload(files) {
  const id = +String(m.sub ?? '').split('/')[0];
  if (!id || !files.length) return;
  // Ny server: POST /api/homes/:id/expenses (status «review»). Eldre: kvitteringer til boligen i FinansHub.
  let ok = 0, legacy = false;
  for (const f of files) {
    const fd = new FormData(); fd.append('file', f, f.name || 'kvittering.jpg');
    const r = legacy ? null : await fetch(`/api/homes/${id}/expenses`, { method: 'POST', body: fd }).catch(() => null);
    if (r?.ok) { ok++; continue; }
    if (!r || r.status === 404) { legacy = true; return bolUpload(id, files); }
    flash((await r.json().catch(() => null))?.error ?? `Feil ${r.status}`);
  }
  if (ok) { flash(`${ok} kvittering${ok > 1 ? 'er' : ''} lagt i boligen ✓ · ✦ AI leser i bakgrunnen`); await bolLoad(String(id)); BO.tab = 'kv'; draw(); }
}

/* ---------- Dra for å oppdatere (fra toppen, 70 px) ---------- */

const PTR = { y0: null, dy: 0, on: false, busy: false };
function scrolledAncestor(t) {
  for (let n = t; n && n !== document.body; n = n.parentElement) if (n.scrollTop > 0) return true;
  return (window.scrollY || document.documentElement.scrollTop) > 0;
}
function ptrEl() {
  let el = document.getElementById('p17-ptr');
  if (!el) { el = document.createElement('div'); el.id = 'p17-ptr'; el.className = 'p17-ptr'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  return el;
}
function ptrShow() {
  const el = ptrEl(), h = Math.min(110, PTR.dy * 0.6);
  el.style.transform = `translate(-50%, ${Math.round(h - 44)}px)`; el.style.opacity = String(Math.min(1, h / 50));
  el.innerHTML = `<span class="p17-ptri${PTR.busy ? ' spin' : ''}" style="transform:rotate(${PTR.busy ? 0 : Math.round(PTR.dy * 2.4)}deg)">↻</span><span>${PTR.busy ? 'Oppdaterer …' : h >= 70 ? 'Slipp for å oppdatere' : 'Dra for å oppdatere'}</span>`;
}
function ptrHide() { const el = document.getElementById('p17-ptr'); if (el) { el.style.transform = 'translate(-50%,-60px)'; el.style.opacity = '0'; } }
export function ptrBind() {
  if (PTR.bound) return;
  PTR.bound = true;
  addEventListener('touchstart', (e) => {
    if (document.documentElement.dataset.ui !== 'mobile' || PTR.busy || e.touches.length !== 1) return;
    const t = e.target;
    if (t.closest?.('.pp-sheet, .sheet-bg, .p16-map, .leaflet-container, input, textarea, select, .p17-cmp, [role=dialog]') || scrolledAncestor(t)) return;
    PTR.y0 = e.touches[0].clientY; PTR.x0 = e.touches[0].clientX; PTR.dy = 0; PTR.on = false;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (PTR.y0 == null) return;
    const dy = e.touches[0].clientY - PTR.y0, dx = Math.abs(e.touches[0].clientX - PTR.x0);
    if (!PTR.on && (dy < 8 || dx > dy)) { if (dy < -4 || dx > 12) PTR.y0 = null; return; }
    PTR.on = true; PTR.dy = dy; ptrShow();
  }, { passive: true });
  const end = async () => {
    if (PTR.y0 == null) return;
    const go = PTR.on && Math.min(110, PTR.dy * 0.6) >= 70;
    PTR.y0 = null; PTR.on = false;
    if (!go) { ptrHide(); return; }
    PTR.busy = true; PTR.dy = 130; ptrShow(); haptic('tap');
    try { appT = 0; HK.t = 0; await Promise.all([appLoad(true), m.screen === 'huske' ? tasksLoad(true) : null, m.screen === 'fam' ? famLoad() : null, m.screen === 'spor' || m.screen === 'trk' ? trkRefresh() : null].filter(Boolean)); route(); } catch {}
    setTimeout(() => { PTR.busy = false; ptrHide(); }, 700);
  };
  addEventListener('touchend', end, { passive: true });
  addEventListener('touchcancel', () => { PTR.y0 = null; PTR.on = false; ptrHide(); }, { passive: true });
}

// Sporing (prompt 22): dra for å oppdatere ber serveren sjekke status hos fraktselskapene nå (POST /api/tracking/refresh).
async function trkRefresh() {
  try { const r = await hlApi('/tracking/refresh', { method: 'POST' }); if (r?.error) flash(r.error); }
  catch (e) { if (e.status !== 404) flash(e.message); }
  const { trkLoad } = await import('./mobile-track.js'); await trkLoad().catch(() => {});
}
export { trkRefresh };

/* ---------- Sanntid: én WebSocket (/api/ws) for Huskeliste, Familie og Sporing ---------- */

const WS = { s: null, tries: 0, off: false, t: null };
export function wsConnect(onMsg) {
  if (WS.s || WS.off || !('WebSocket' in window)) return;
  let opened = false;
  try { WS.s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`); } catch { WS.off = true; return; }
  WS.s.onopen = () => { opened = true; WS.tries = 0; };
  WS.s.onmessage = (ev) => { let d = null; try { d = JSON.parse(ev.data); } catch { return; } if (d?.type) onMsg(d); };
  WS.s.onclose = () => {
    WS.s = null;
    // Server uten WebSocket: gi opp etter noen forsøk (data hentes da som før ved polling og sidebytte).
    if (!opened && ++WS.tries >= 3) { WS.off = true; return; }
    clearTimeout(WS.t); WS.t = setTimeout(() => wsConnect(onMsg), Math.min(30000, 2000 * 2 ** WS.tries));
  };
  WS.s.onerror = () => {};
}
let rtT = null;
export function onRealtime(d) {
  if (globalThis.P41?.onRt41?.(d)) return; // Prompt 41: glimt-job (Huskeliste), todo:changed, hjemlys notice, ruter journey
  if (globalThis.P40?.onRt40?.(d)) return; // Prompt 40: hjemlys, glimt:settings (julemodus), news/tasks
  if (d.type === 'calendar-quick') { P29.onQuickRealtime(d); return; } // Prompt 29: rask time ferdig/feilet (31: steg og felt)
  if (d.type === 'assist') { P31.onAssistRealtime(d); return; }
  if (/^(receipt-job|reanalyze|job)/.test(String(d.type))) { import('./mobile-p39.js').then((x) => x.onRt39(d)).catch(() => {}); } // Prompt 39: fremdrift for «✦ På nytt»
  if (d.type === 'meal:changed' || d.type === 'meal') { import('./mobile-p36.js').then((x) => x.onMeal(d)).catch(() => {}); return; } // Prompt 36: matplanen er felles, oppdater uten refresh // Prompt 31: Glimt-jobber (svarboble, Chat)
  if (d.type === 'family') import('./mobile-p50f.js').then((x) => x.live50(d)).catch(() => {}); // prompt 50 (FAMWEB50): Familie i nytt design, Ruter-skolen fra Steder
  clearTimeout(rtT);
  rtT = setTimeout(async () => {
    if (d.type === 'tasks') { HK.t = 0; await tasksLoad(true); if (m.screen === 'huske' || m.screen === 'hl') draw(); }
    else if (d.type === 'family' && d.kind === 'ping') { playSound(); navigator.vibrate?.([200, 100, 200]); flash(`${d.fromName ?? 'Noen'} vil finne telefonen din`); }
    else if (d.type === 'family') { if (d.kind === 'event' && !document.hidden) { const Z = d.data ?? d; const zn = Z.zone?.name ?? Z.zoneName ?? (typeof Z.zone === 'string' ? Z.zone : null) ?? d.title; if (zn && (Z.event || Z.zoneId || d.title)) globalThis.P45?.showZoneBanner?.({ title: d.title ?? zn, body: d.body ?? Z.text ?? `${Z.person ?? ''} ${Z.event === 'leave' ? 'forlot' : 'kom til'} ${zn}`.trim(), color: Z.color ?? Z.zone?.color, iconUrl: Z.iconUrl ?? Z.icon }); } /* prompt 45: sonevarsel i appen */ await famLoad(); if (m.screen === 'hl') await import('./mobile-p20.js').then((x) => x.posLoad(true)).catch(() => {}); if (m.screen === 'fam' || m.screen === 'hl') draw(); }
    else if (d.type === 'tracking' && (m.screen === 'spor' || m.screen === 'hl')) { const { trkLoad } = await import('./mobile-track.js'); await trkLoad().catch(() => {}); draw(); }
  }, 250);
}

/* ---------- Hendelser ---------- */

export async function p17Bind(e, t) {
  if (e.type === 'input') {
    const k = t.dataset?.p17in;
    if (!k) return false;
    if (k === 'nm') { P17.nv = t.value; const b = document.querySelector('[data-p17="nmsave"]'); if (b) b.disabled = !t.value.trim(); return true; }
    if (k === 'tk') { HK.nv = t.value; return true; }
    if (k.startsWith('ai:')) { AI17.f[k.slice(3)] = t.value; return true; }
    if (k === 'vol') { const b = t.parentElement?.querySelector('b'); if (b) b.textContent = `${t.value} %`; return true; }
    return true;
  }
  if (e.type === 'change') {
    if (t.dataset?.p17in === 'vol') { await notifySave({ volume: +t.value }); playSound(); return true; }
    if (t.dataset?.p17in === 'qf' || t.dataset?.p17in === 'qt') { await notifySave({ [t.dataset.p17in === 'qf' ? 'quietFrom' : 'quietTo']: t.value }); return true; }
    if (t.dataset?.p17file === 'snd') {
      const f = t.files?.[0]; t.value = ''; if (!f) return true;
      if (f.size > 1024 * 1024) { flash('Lyden må være under 1 MB'); return true; }
      const fd = new FormData(); fd.append('file', f, f.name);
      const r = await fetch('/api/me/notify/sound', { method: 'POST', body: fd }).catch(() => null);
      if (r?.ok) { await notifySave({ sound: 'egen' }); flash('Egen varsellyd lagret ✓'); playSound('egen'); }
      else flash(r?.status === 404 ? 'Serveren støtter ikke egen lyd ennå' : (await r?.json().catch(() => null))?.error ?? 'Kunne ikke laste opp lyden');
      return true;
    }
    return false;
  }
  if (e.type === 'submit') {
    if (t.matches?.('[data-p17form="task"]')) { e.preventDefault(); await taskAdd(); setTimeout(() => document.getElementById('p17-tk')?.focus(), 20); return true; }
    return false;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-p17]');
  if (!x) return false;
  e.preventDefault(); e.stopPropagation?.();
  const k = x.dataset.p17, id = x.dataset.id;
  switch (k) {
    case 'nm': P17.nm = true; P17.sub = m.sub ?? ''; P17.nv = appName(); draw(); setTimeout(() => { const el = document.getElementById('p17-nm'); el?.focus(); el?.select(); }, 40); return true;
    case 'nmx': P17.nm = false; draw(); return true;
    case 'nmset': P17.nv = x.dataset.v; draw(); return true;
    case 'nmsave': if (!P17.nv.trim()) return true; P17.nm = false; await saveApp({ name: P17.nv.trim().slice(0, 28) }); return true;
    case 'ic': P17.ic = true; P17.sub = m.sub ?? ''; draw(); return true;
    case 'icx': P17.ic = false; draw(); return true;
    case 'icplat': P17.plat = x.dataset.k; P17.icv = 'std'; draw(); return true;
    case 'icvar': P17.icv = x.dataset.k; draw(); return true;
    case 'ictint': P17.tint = +x.dataset.i; draw(); return true;
    case 'icmy': P17.my = +x.dataset.i; draw(); return true;
    case 'icset': haptic('tab'); await saveApp({ icon: x.dataset.k }); return true;
    case 'task': { const st = S.boot?.settings ?? {}, tk = { ...(st.aiTasks ?? {}), [x.dataset.k]: x.dataset.v }; S.boot.settings = { ...st, aiTasks: tk }; draw(); try { const r = await api('/settings', { method: 'PUT', json: { aiTasks: tk } }); S.boot.settings = { ...S.boot.settings, ...r, aiTasks: r?.aiTasks ?? tk }; } catch (err) { flash(err.message); } draw(); return true; }
    case 'aitog': { const kk = x.dataset.k, st = S.boot?.settings ?? {}, v = kk === 'ocrFallback' ? st.ocrFallback === false : !st.ocrLowConf; S.boot.settings = { ...st, [kk]: v }; draw(); try { const r = await api('/settings', { method: 'PUT', json: { [kk]: v } }); S.boot.settings = { ...S.boot.settings, ...r, [kk]: r?.[kk] ?? v }; } catch (err) { flash(err.message); } draw(); return true; }
    case 'aisave': {
      const f = AI17.f, b = {};
      for (const kk of ['groqModel', 'roboflowWorkspace', 'roboflowWorkflow']) if (f[kk] !== undefined) b[kk] = f[kk].trim();
      for (const kk of ['groqKey', 'roboflowKey']) if (f[kk]) b[kk] = f[kk].trim();
      try { S.boot.settings = { ...S.boot.settings, ...(await api('/settings', { method: 'PUT', json: b })) }; AI17.f = {}; AI17.msg = 'Lagret ✓'; flash('AI-innstillinger lagret ✓'); } catch (err) { AI17.msg = err.message; }
      draw(); return true;
    }
    case 'aitest': {
      AI17.msg = `Tester ${ENG[x.dataset.k]} …`; draw();
      try { const r = await api('/ai/test', { method: 'POST', json: { provider: x.dataset.k } }); AI17.msg = `${ENG[x.dataset.k]}: ${r?.ok ? '✓ ' : ''}${r?.message ?? (r?.ok ? 'OK' : 'svarte ikke')}${r?.model ? ` · ${r.model}` : ''}${r?.ms ? ` · ${r.ms} ms` : ''}`; } catch (err) { AI17.msg = `${ENG[x.dataset.k]}: ${err.message}`; }
      await aiLoad(); draw(); return true;
    }
    case 'rftest': {
      AI17.msg = 'Tester Roboflow …'; draw();
      try { const r = await api('/ai/roboflow/test', { method: 'POST' }); AI17.msg = `Roboflow: ${r?.ok ? '✓ ' : ''}${r?.message ?? (r?.ok ? 'OK' : 'svarte ikke')}`; } catch (err) { AI17.msg = `Roboflow: ${err.message}`; }
      draw(); return true;
    }
    case 'non': await notifySave({ on: !(NT.d?.on !== false) }); return true;
    case 'nquiet': await notifySave({ quietOn: !(NT.d?.quietOn !== false) }); return true;
    case 'nperm': if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} } draw(); return true;
    case 'ntest': await testNotify(); return true;
    case 'snd': { const v = x.dataset.k; if (v === 'egen' && NT.d?.sound !== 'egen') { document.querySelector('[data-p17file="snd"]')?.click(); return true; } await notifySave({ sound: v }); playSound(v); return true; }
    case 'ngrp': { const g = x.dataset.k; await notifySave({ groups: { [g]: !(NT.d?.groups?.[g] !== false) } }); return true; }
    case 'hlist': HK.cur = x.dataset.k; haptic('tab'); draw(); return true;
    case 'tdue': HK.due = x.dataset.v === '' ? null : +x.dataset.v; haptic('tab'); draw(); return true;
    case 'twho': HK.who = x.dataset.v; haptic('tab'); draw(); return true;
    case 'tick': { const it = (HK.d?.items ?? []).find((y) => String(y.id) === String(id)); if (!it) return true; haptic(it.done ? 'tap' : 'ok'); navigator.vibrate?.(8); await taskPatch(id, { done: !it.done, doneAt: it.done ? null : Date.now() }); return true; }
    case 'tdel': if (String(HK.cur) === 'arkiv') { await archDel([id]); return true; } await taskDel(id); return true;
    case 'tarch': haptic('tap'); await archSet([id], true); flash('Arkivert'); return true;
    case 'trest': haptic('ok'); await archSet([id], false); flash('Gjenopprettet ✓'); return true;
    case 'tarchall': { const dn = (HK.d?.items ?? []).filter((y) => y.done && !isArch(y) && (HK.cur === 'alle' || String(y.list) === String(HK.cur))).map((y) => y.id); if (dn.length) { haptic('ok'); await archSet(dn, true); flash(`${dn.length} arkivert`); } return true; }
    case 'tarchclr': { const ids = archOf().map((y) => y.id); if (ids.length) { haptic('err'); await archDel(ids); flash('Arkivet er tømt'); } return true; }
    case 'ftab': FT.tab = x.dataset.k; haptic('tab'); draw(); return true;
    case 'psx': FM.sel = null; draw(); return true;
    case 'ping': hlApi(`/family/ping/${encodeURIComponent(id)}`, { method: 'POST' }).then((r) => flash(r?.delivered === false ? 'Telefonen er ikke på nett nå' : 'Spiller av lyd på telefonen ✓')).catch((err) => flash(err.status === 404 ? 'Serveren støtter ikke «Spill av lyd» ennå' : err.message)); return true;
    case 'hshare': {
      const me = FM.d?.me ?? {}, sh = { ...(me.shareHealth ?? {}) }; sh[x.dataset.k] = !sh[x.dataset.k];
      if (FM.d) FM.d.me = { ...me, shareHealth: sh }; draw();
      await hlApi('/family/me', { method: 'PUT', json: { shareHealth: sh } }).catch((err) => flash(err.message)); return true;
    }
    case 'cmp': { const { WX } = await import('./mobile-wx.js'); CMP.open = true; draw(); await cmpLoad(WX.place); return true; }
    case 'cmpx': CMP.open = false; draw(); return true;
    default: return false;
  }
}

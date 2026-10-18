// Sporing i mobilappen (prompt 11): egen fane i Homelab og «Pakker»-kortet i karusellen på Homelab-hjem.
// Data fra /api/tracking (SPORING-arbeidet). Mangler endepunktet (eldre server), vises en forklaring i stedet for feil.
// «Push» betyr her lokale varsler (Notification) mens appen er åpen i bakgrunnen; ekte server-push finnes ikke ennå.
import { esc, icon, ICONS, hlApi } from './core.js';
import { m, draw, flash, avatar, theme } from './mobile.js';
import { haptic, hpref, setHap } from './mobile-haptics.js';

Object.assign(ICONS, {
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  arch: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4',
  vib: 'M7 4h10v16H7zM3 8v8M21 8v8M11 17h2',
});

// [id, navn, initialer, farge, tekst, formater, sporingslenke] – samme som server/tracking-carriers.js.
export const CAR = [
  ['posten', 'Posten', 'P', '#E32D22', '#fff', [/^[A-Z]{2}\d{9}NO$/, /^(LP|LZ)\d{12,}$/], 'https://sporing.posten.no/sporing/'],
  ['bring', 'Bring', 'B', '#7BC144', '#0f2a05', [/^70\d{15}$/, /^3707\d{14}$/], 'https://tracking.bring.com/tracking/'],
  ['postnord', 'PostNord', 'PN', '#00A0D6', '#fff', [/^00370\d{15}$/, /^[A-Z]{2}\d{9}(SE|DK|FI)$/], 'https://www.postnord.no/sporing?shipmentId='],
  ['dhl', 'DHL', 'DHL', '#FFCC00', '#D40511', [/^JJD\d{10,}$/, /^(JVGL|GM)\w{8,}$/, /^\d{10}$/], 'https://www.dhl.com/no-no/home/sporing.html?tracking-id='],
  ['ups', 'UPS', 'UPS', '#351C15', '#FFB500', [/^1Z[0-9A-Z]{16}$/], 'https://www.ups.com/track?tracknum='],
  ['fedex', 'FedEx', 'FX', '#4D148C', '#fff', [/^\d{12}$/, /^\d{15}$/], 'https://www.fedex.com/fedextrack/?trknbr='],
  ['gls', 'GLS', 'GLS', '#172154', '#FFD100', [/^\d{11}$/], 'https://gls-group.com/NO/no/sporing-av-pakker?match='],
  ['schenker', 'DB Schenker', 'DB', '#EC0016', '#fff', [], 'https://www.dbschenker.com/app/tracking-public/?refNumber='],
  ['helthjem', 'Helthjem', 'HH', '#2E2A6B', '#fff', [/^HH\d{8,}$/], 'https://helthjem.no/sporing/'],
  ['budbee', 'Budbee', 'BB', '#2BCE96', '#05271b', [/^BB[A-Z0-9]{8,}$/], 'https://tracking.budbee.com/'],
  ['instabox', 'Instabox', 'IB', '#FF4E00', '#fff', [/^IB[A-Z0-9]{8,}$/], 'https://track.instabox.io/'],
  ['other', 'Annen (17TRACK)', '17', '#3A4252', '#eef0f4', [], 'https://t.17track.net/no#nums='],
].map(([id, name, ini, c, fg, re, url]) => ({ id, name, ini, c, fg, re, url }));
const CM = Object.fromEntries(CAR.map((c) => [c.id, c]));
// Logoer som i Sporing-designet: favicon fra transportørens domene på hvit bakgrunn, initialene vises hvis bildet ikke lastes.
const CDOM = { posten: 'posten.no', bring: 'bring.no', postnord: 'postnord.no', dhl: 'dhl.com', ups: 'ups.com', fedex: 'fedex.com', gls: 'gls-group.eu', schenker: 'dbschenker.com', helthjem: 'helthjem.no', budbee: 'budbee.com', instabox: 'instabox.io', other: '17track.net' };
const cLogo = (id) => `https://www.google.com/s2/favicons?domain=${CDOM[id] ?? CDOM.other}&sz=128`;
const carOf = (id) => CM[id] ?? CM.other;
const normNo = (no) => String(no ?? '').replace(/[\s-]+/g, '').toUpperCase();
const detectLocal = (no) => CAR.find((c) => c.id !== 'other' && c.re.some((r) => r.test(no)))?.id ?? 'other';

const ST_IN = ['Registrert', 'Hentet', 'I transport', 'Klar for henting', 'Levert'];
const ST_OUT = ['Registrert', 'Levert inn', 'I transport', 'Ute for levering', 'Levert'];
const STEP = { registered: 0, picked_up: 1, in_transit: 2, delayed: 2, unknown: 0, ready_for_pickup: 3, out_for_delivery: 3, delivered: 4 };
const STXT = { registered: 'Registrert', picked_up: 'Hentet', in_transit: 'I transport', ready_for_pickup: 'Klar for henting', out_for_delivery: 'Ute for levering', delivered: 'Levert', delayed: 'Forsinket', unknown: 'Ukjent status' };
// Viktigst først: klar for henting, ute for levering, forsinket, i transport …
const RANK = { ready_for_pickup: 0, out_for_delivery: 1, delayed: 2, in_transit: 3, picked_up: 4, registered: 5, unknown: 6, delivered: 9 };
const PREFS = [['found', 'Nytt sporingsnummer funnet', 'Fra Finn eller e-post'], ['out', 'Ute for levering', ''], ['pickup', 'Klar for henting', 'Med hentested og frist'], ['delivered', 'Levert', ''], ['delayed', 'Forsinket', 'Når ETA flyttes mer enn én dag']];
const PREF_DEF = { found: true, out: true, pickup: true, delivered: true, delayed: false };
const SEGS = [['act', 'Aktive'], ['pick', 'Klar for henting'], ['out', 'Utgående'], ['done', 'Levert']];

export const TR = { data: null, err: '', missing: false, f: { no: '', name: '', pick: null }, guess: null, seg: 'act', open: null, del: null, busy: false, adding: false };

/* ---------- Data ---------- */

// Status vinner over et eldre/feil steg-tall: en levert pakke skal aldri vises som «Registrert».
const stepOf = (p) => (p.status === 'delivered' ? 4 : Math.max(Number.isFinite(p.step) ? p.step : 0, STEP[p.status] ?? 0));
const isDone = (p) => p.status === 'delivered' || stepOf(p) >= 4;
const isReady = (p) => p.status === 'ready_for_pickup';
export const active = (items) => (items ?? []).filter((p) => !p.archived && !isDone(p));
export const topPackages = (items, n = 2) => active(items).sort((a, b) => (RANK[a.status] ?? 6) - (RANK[b.status] ?? 6) || String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))).slice(0, n);
const localPrefs = () => { try { return { ...PREF_DEF, ...(JSON.parse(localStorage.getItem('fh_trk_prefs') || '{}') || {}) }; } catch { return { ...PREF_DEF }; } };
export const trkPrefs = () => ({ ...PREF_DEF, ...(TR.data?.prefs ?? localPrefs()) });

export async function trkLoad() {
  try {
    const d = await hlApi('/tracking');
    notifyChanges(TR.data?.items, d?.items);
    TR.data = { items: [], sources: {}, carriers: [], ...d }; TR.err = ''; TR.missing = false;
  } catch (e) {
    if (e.status === 404) { TR.missing = true; TR.data ??= { items: [], sources: {}, carriers: [], prefs: localPrefs() }; }
    else TR.err = e.status === 401 ? 'Logg inn på nytt for å se sporingen.' : `Sporing svarer ikke: ${e.message}`;
  }
}

// Lokale varsler og pakke-haptikk når en pakke endrer status (mellom to hentinger mens appen er åpen).
function notifyChanges(before, after) {
  if (!before || !after) return;
  const old = new Map(before.map((p) => [p.id, p]));
  const P = trkPrefs(), msgs = [];
  for (const p of after) {
    const o = old.get(p.id);
    if (!o) { if (P.found && p.source !== 'manual') msgs.push([`Nytt sporingsnummer: ${p.name || p.trackingNo}`, `${carOf(p.carrier).name} · ${p.source === 'finn' ? 'fra Finn' : 'fra e-post'}`]); continue; }
    if (o.status === p.status) continue;
    const k = { out_for_delivery: 'out', ready_for_pickup: 'pickup', delivered: 'delivered', delayed: 'delayed' }[p.status];
    if (k && P[k]) msgs.push([k === 'pickup' ? `Klar for henting${p.pickupPoint ? ` hos ${p.pickupPoint}` : ''}` : `${STXT[p.status]}: ${p.name || p.trackingNo}`, p.name || carOf(p.carrier).name]);
  }
  if (!msgs.length) return;
  haptic('pkg');
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    for (const [title, body] of msgs.slice(0, 3)) { try { new Notification(title, { body, icon: '/assets/finans/icons/icon-192.png', tag: 'trk-' + title }); } catch {} }
  } else flash(msgs[0][0]);
}

// Henter sporingen jevnlig mens appen er åpen (oftere når noe er ute for levering), så varslene over kan komme.
let watchT = null;
export function trkWatch() {
  clearTimeout(watchT);
  const out = (TR.data?.items ?? []).some((p) => p.status === 'out_for_delivery');
  watchT = setTimeout(async () => { if (!TR.missing && navigator.onLine) { await trkLoad().catch(() => {}); if (['spor', 'hl'].includes(m.screen) && !TR.adding) draw(); } trkWatch(); }, out ? 5 * 60_000 : 15 * 60_000);
}

/* ---------- Byggeklosser ---------- */

const isI = () => theme() === 'ios';
const gl = (c = 'glass2') => (isI() ? c : '');
const hm = (t) => (t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '–');
const dm = (t) => { if (!t) return ''; const d = new Date(t); return Number.isNaN(+d) ? String(t) : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm(t)}`; };
export const badge = (car, size = 42) => { const c = carOf(car); return `<span class="trk-badge" style="width:${size}px;height:${size}px;background:${c.c};color:${c.fg};font-size:${c.ini.length > 2 ? size * 0.27 : size * 0.36}px;border-radius:${Math.round(size * 0.29)}px" aria-hidden="true">${esc(c.ini)}<img src="${cLogo(c.id)}" alt="" loading="lazy"></span>`; };
const statusTxt = (p) => (isDone(p) ? (p.direction === 'out' ? 'Levert til kjøper' : 'Levert') : p.statusText || STXT[p.status] || 'Ukjent status');
const statusCls = (p) => (isReady(p) ? 'ready' : isDone(p) ? 'done' : p.status === 'delayed' ? 'late' : '');
const etaTxt = (p) => {
  if (isReady(p) && p.pickupPoint) return `${p.pickupPoint}${p.eta ? ` · hent innen ${fmtEta(p.eta)}` : ''}`;
  return p.eta ? (isDone(p) ? `Levert ${fmtEta(p.eta)}` : `Ventet ${fmtEta(p.eta)}`) : '';
};
function fmtEta(v) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v);
  const d = new Date(String(v).length === 10 ? v + 'T12:00' : v), t = new Date(); t.setHours(12, 0, 0, 0);
  const days = Math.round((d - t) / 864e5);
  return days === 0 ? 'i dag' : days === 1 ? 'i morgen' : d.toLocaleDateString('nb-NO', { weekday: days > 1 && days < 7 ? 'long' : undefined, day: 'numeric', month: 'short' }).replace('.', '');
}
const srcPill = (p) => (p.source === 'finn' ? '<em class="trk-src finn">Finn</em>' : p.source === 'email' ? '<em class="trk-src mail">E-post</em>' : '');
function steps(p) {
  const L = Array.isArray(p.steps) && p.steps.length === 5 ? p.steps : p.direction === 'out' ? ST_OUT : ST_IN, st = stepOf(p), fin = isDone(p);
  return `<div class="trk-steps${fin ? ' fin' : ''}" aria-label="Steg ${st + 1} av 5: ${esc(L[st])}">${L.map((n, j) => `<span class="${j <= st ? 'on' : ''}${j === st && !fin ? ' cur' : ''}"><i></i><small>${esc(j === 3 && p.direction !== 'out' && p.status === 'out_for_delivery' ? 'Ute' : n)}</small></span>`).join('')}</div>`;
}
const bars = (p) => { const st = stepOf(p), fin = isDone(p); return `<span class="trk-bars${fin ? ' fin' : ''}" aria-hidden="true">${[0, 1, 2, 3, 4].map((j) => `<i class="${j <= st ? (j === st && !fin ? 'cur' : 'on') : ''}"></i>`).join('')}</span>`; };

/* ---------- Pakker-kortet i karusellen (Homelab-hjem) ---------- */

export function pkgCard(th, list, { loading = false, missing = false } = {}) {
  const items = list ?? [];
  const all = TR.data?.items ? active(TR.data.items) : items;
  const ready = all.filter(isReady).length;
  const count = all.length ? `${all.length} på vei${ready ? ` · ${ready} klar` : ''}` : '';
  const rows = items.slice(0, 2).map((p) => `<span class="pkg-row">${badge(p.carrier, 34)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(p.name || p.trackingNo)}</b><span class="m-ell ${statusCls(p)}">${esc(statusTxt(p))}${etaTxt(p) ? ` · ${esc(etaTxt(p))}` : ''}</span>${bars(p)}</span></span>`).join('');
  return `<a class="hcard pkgcard ${th === 'ios' ? 'glass2' : ''}" href="#/spor" aria-label="Pakker – åpne Sporing">
    <span class="pkg-head"><span class="pkg-ic">${icon('box', 18)}</span><b class="m-grow">Pakker</b><span class="dim">${esc(count)}</span></span>
    ${rows || `<span class="pkg-none">${loading ? 'Henter pakker …' : missing ? 'Sporing krever nyere server.' : 'Ingen pakker på vei.'}</span>`}
    ${items.length < 2 ? pkgExtra() : ''}
    <span class="pkg-foot">${items.length ? 'Åpne sporing ›' : 'Legg til sporingsnummer ›'}</span></a>`;
}

// Fyller resten av kortet når det er færre enn to pakker (kortet har fast høyde, lik Klokke og vær): tellere.
function pkgExtra() {
  const L = segLists(TR.data?.items ?? []);
  if (!TR.data?.items) return '';
  return `<span class="pkg-stats"><span><b>${L.act.length}</b>På vei</span><span><b>${L.pick.length}</b>Klar for henting</span><span><b>${L.done.length}</b>Levert</span></span>`;
}

/* ---------- Sporing-siden ---------- */

function addCard() {
  const f = TR.f, no = normNo(f.no), car = f.pick || TR.guess || (no ? detectLocal(no) : null);
  const hint = !no ? '' : car === 'other' ? 'Fant ikke transportøren ut fra nummeret. Velg, eller la 17TRACK finne den.' : `✦ Ser ut som ${carOf(car).name}${f.pick ? ' (valgt av deg)' : ' ut fra formatet'}. Trykk for å endre.`;
  return `<form class="trk-add ${gl()}" data-trkform>
    <div class="trk-addrow"><input class="sinp m-mono" id="m-trk-no" value="${esc(f.no)}" placeholder="Lim inn sporingsnummer" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" aria-label="Sporingsnummer">
      <button class="trk-go" type="submit" ${TR.adding ? 'disabled' : ''}>${TR.adding ? 'Sporer …' : 'Spor'}</button></div>
    <input class="sinp" id="m-trk-name" value="${esc(f.name)}" placeholder="Navn (valgfritt), f.eks. Jakke fra Zalando" autocomplete="off" aria-label="Navn på pakken">
    ${no ? `<div class="trk-hint">${esc(hint)}</div><div class="trk-cars" role="radiogroup" aria-label="Transportør">${CAR.map((c) => `<button type="button" class="trk-car" data-trkcar="${c.id}" role="radio" aria-checked="${c.id === car}"><span style="background:${c.c};color:${c.fg}">${esc(c.ini)}</span>${esc(c.name)}</button>`).join('')}</div>` : ''}
  </form>`;
}

function sources() {
  const s = TR.data?.sources ?? {}, items = TR.data?.items ?? [];
  const nF = items.filter((p) => p.source === 'finn').length, nM = items.filter((p) => p.source === 'email').length;
  const last = [s.finn?.lastCheck, s.email?.lastCheck].filter(Boolean).sort().pop();
  const chip = (k, n) => { const on = s[k]?.on !== false; return `<button class="trk-srcchip" data-trksrc="${k}" role="switch" aria-checked="${on}"><i></i>${esc(n)}</button>`; };
  return `<div class="trk-srcs">${chip('finn', `✦ Finn · ${nF} fra handler`)}${chip('email', `✦ E-post · ${nM} funnet i Proton Mail`)}</div>
    <div class="trk-sync"><span class="dim">Sist sjekket ${last ? hm(last) : '–'}</span><button class="linkb" data-trk="check" ${TR.busy ? 'disabled' : ''}>${TR.busy ? 'Sjekker …' : 'Sjekk nå'}</button></div>`;
}

function segLists(items) {
  const act = active(items);
  return { act, pick: act.filter((p) => isReady(p) && p.direction !== 'out'), out: (items ?? []).filter((p) => p.direction === 'out' && !p.archived && !isDone(p)), done: (items ?? []).filter((p) => isDone(p) || p.archived) };
}

function card(p) {
  const open = TR.open === p.id, ev = [...(p.events ?? [])].sort((a, b) => String(b.ts).localeCompare(String(a.ts))), c = carOf(p.carrier);
  const url = p.url || c.url + encodeURIComponent(p.trackingNo ?? '');
  return `<div class="trk-card ${gl()}${isReady(p) ? ' ready' : ''}${open ? ' open' : ''}">
    <button class="trk-top" data-trkopen="${esc(p.id)}" aria-expanded="${open}">${badge(p.carrier)}
      <span class="m-grow" style="min-width:0"><b class="m-ell">${esc(p.name || c.name)}</b><span class="m-ell trk-no"><span>${esc(p.carrierName || c.name)}</span> · <span class="m-mono">${esc(p.trackingNo)}</span></span></span>
      <span class="trk-pills">${srcPill(p)}${p.direction === 'out' ? '<em class="trk-src out">Utgående</em>' : ''}</span></button>
    <div class="trk-stat"><b class="${statusCls(p)}">${esc(statusTxt(p))}</b>${etaTxt(p) ? `<span>${esc(etaTxt(p))}</span>` : ''}</div>
    ${steps(p)}
    ${ev[0] && !open ? `<div class="trk-last"><span class="m-ell">${esc(ev[0].status || STXT[p.status] || '')}${ev[0].location ? ` · ${esc(ev[0].location)}` : ''}</span><span class="dim">${esc(dm(ev[0].ts))}</span></div>` : ''}
    ${open ? `<div class="trk-tl">${ev.length ? ev.map((e, j) => `<div class="${j ? '' : 'now'}"><i></i><span class="m-grow"><b>${esc(e.status || '')}</b>${e.location ? `<span>${esc(e.location)}</span>` : ''}</span><span class="dim">${esc(dm(e.ts))}</span></div>`).join('') : '<div class="dim" style="padding:4px 0">Ingen hendelser ennå. Transportøren har ikke sendt status.</div>'}</div>
      ${p.sourceRef || p.shop ? `<div class="trk-ref">✦ ${esc(p.sourceRef || `Fra ${p.shop}`)}</div>` : ''}
      <div class="trk-acts"><a class="trk-btn pri" href="${esc(url)}" target="_blank" rel="noopener">Åpne hos ${esc(c.id === 'other' ? '17TRACK' : p.carrierName || c.name)} ${icon('ext', 14)}</a>
        <button class="trk-btn" data-trk="arch" data-id="${esc(p.id)}">${p.archived ? 'Flytt tilbake' : 'Arkiver'}</button>
        <button class="trk-btn danger" data-trk="del" data-id="${esc(p.id)}">${TR.del === p.id ? 'Bekreft sletting' : 'Slett'}</button></div>` : ''}
  </div>`;
}

const tog = (attrs, n, sub, on) => `<button class="opt-row" ${attrs} role="switch" aria-checked="${!!on}"><span class="m-grow"><b style="font-weight:500">${esc(n)}</b>${sub ? `<br><span style="font-size:13px;opacity:.65">${esc(sub)}</span>` : ''}</span><span class="sw" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
export const trkPrefRows = () => { const P = trkPrefs(); return PREFS.map(([k, n, s]) => tog(`data-trkpref="${k}"`, n, s, P[k])); };

export function trkView(th) {
  const items = TR.data?.items ?? null, L = segLists(items ?? []);
  const sum = items ? `${L.act.length} på vei · ${L.pick.length} klar for henting · ${L.done.length} levert` : '';
  const list = (L[TR.seg] ?? L.act).sort((a, b) => (TR.seg === 'done' ? String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')) : (RANK[a.status] ?? 6) - (RANK[b.status] ?? 6)));
  const carriers = TR.data?.carriers ?? [];
  return `<div class="m-row" style="justify-content:space-between;align-items:flex-start;padding:6px 4px 0;gap:10px"><div class="m-grow"><div class="title">Sporing</div>${sum ? `<div class="psub">${esc(sum)}</div>` : ''}</div>${avatar()}</div>
    ${TR.missing ? '<div class="snote snotice">Serveren har ikke Sporing ennå (/api/tracking mangler). Oppdater Homelab for å spore pakker.</div>' : ''}
    ${TR.err ? `<div class="m-empty">${esc(TR.err)}</div>` : ''}
    ${addCard()}
    ${sources()}
    <div class="trk-segs" role="tablist">${SEGS.map(([k, n]) => `<button role="tab" data-trkseg="${k}" aria-selected="${TR.seg === k}">${n} <span>${L[k].length}</span></button>`).join('')}</div>
    ${items === null ? '<div class="m-spin"></div>' : list.map(card).join('') || `<div class="m-empty">${TR.seg === 'act' ? 'Ingen pakker på vei. Lim inn et sporingsnummer over, eller slå på Finn og E-post.' : 'Ingen pakker her.'}</div>`}
    <div class="sec">Varsler og haptikk</div><div class="list ${gl()}">${trkPrefRows().join('')}${tog('data-trkhap', 'Haptisk tilbakemelding', 'Vibrasjon ved nye pakker og statusendringer', hpref('hap') && hpref('hapPkg'))}</div>
    <div class="snote">Varslene vises mens appen er åpen eller i bakgrunnen. Push når appen er lukket krever de native appene.</div>
    ${carriers.length ? `<div class="sec">Transportører</div><div class="list ${gl()}">${carriers.map((c) => `<div class="opt-row">${badge(c.id, 32)}<span class="m-grow">${esc(c.name ?? carOf(c.id).name)}</span><span class="sval" style="color:${c.configured ? '#8fe0b0' : '#f3b54a'};opacity:1">${c.configured ? 'Tilkoblet' : 'Mangler nøkkel'}</span></div>`).join('')}</div>
      <div class="snote">Nøklene legges inn i Homelab → Innstillinger → Integrasjoner → Sporing.</div>` : ''}`;
}

/* ---------- Hendelser ---------- */

let detT = null, detN = 0;
function detect() {
  clearTimeout(detT);
  const no = normNo(TR.f.no);
  TR.guess = no ? detectLocal(no) : null;
  if (!no || no.length < 8 || TR.missing) return;
  detT = setTimeout(async () => {
    const n = ++detN;
    try { const r = await hlApi('/tracking/detect?no=' + encodeURIComponent(no)); if (n === detN && r?.carrier && normNo(TR.f.no) === no) { TR.guess = r.carrier; updAdd(); } } catch {}
  }, 300);
}
// Feltene tegnes om uten å miste fokus (draw() bevarer fokus via id).
const updAdd = () => draw();

async function patchItem(id, body) {
  const r = await hlApi(`/tracking/${encodeURIComponent(id)}`, { method: 'PATCH', json: body });
  if (TR.data) TR.data.items = TR.data.items.map((p) => (p.id === id ? { ...p, ...(r?.item ?? r ?? body) } : p));
}

export async function trkBind(e, t) {
  if (m.screen !== 'spor') return false;
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'input') {
    if (t.id === 'm-trk-no') { const had = !!normNo(TR.f.no); TR.f.no = t.value; TR.f.pick = null; detect(); if (had !== !!normNo(t.value) || normNo(t.value)) updAdd(); return true; }
    if (t.id === 'm-trk-name') { TR.f.name = t.value; return true; }
    return false;
  }
  if (e.type === 'submit' && d('[data-trkform]')) {
    e.preventDefault();
    const no = normNo(TR.f.no);
    if (no.length < 6) { haptic('err'); flash('Skriv inn et sporingsnummer'); return true; }
    if ((TR.data?.items ?? []).some((p) => normNo(p.trackingNo) === no)) { haptic('err'); flash('Sendingen spores allerede'); return true; }
    if (TR.missing) { haptic('err'); flash('Serveren har ikke Sporing ennå'); return true; }
    const carrier = TR.f.pick || TR.guess || detectLocal(no);
    TR.adding = true; draw();
    try {
      const r = await hlApi('/tracking', { method: 'POST', json: { trackingNo: no, name: TR.f.name.trim() || undefined, carrier } });
      const item = r?.item ?? r;
      TR.f = { no: '', name: '', pick: null }; TR.guess = null; TR.seg = 'act';
      await trkLoad();
      TR.open = item?.id ?? null;
      haptic('ok'); flash(r?.message || `✦ Sporer hos ${carOf(item?.carrier ?? carrier).name}${item?.status ? ` · ${STXT[item.status] ?? ''}` : ''}`);
    } catch (err) { haptic('err'); flash(err.message); }
    TR.adding = false; draw();
    return true;
  }
  if (e.type !== 'click') return false;
  if ((x = d('[data-trkcar]'))) { e.preventDefault(); TR.f.pick = x.dataset.trkcar; haptic('tab'); draw(); return true; }
  if ((x = d('[data-trkseg]'))) { TR.seg = x.dataset.trkseg; TR.open = null; TR.del = null; haptic('tab'); draw(); return true; }
  if ((x = d('[data-trkopen]'))) { TR.open = TR.open === x.dataset.trkopen ? null : x.dataset.trkopen; TR.del = null; haptic('tap'); draw(); return true; }
  if ((x = d('[data-trksrc]'))) {
    const k = x.dataset.trksrc, s = { ...(TR.data?.sources ?? {}) }, on = s[k]?.on !== false;
    s[k] = { ...(s[k] ?? {}), on: !on }; if (TR.data) TR.data.sources = s; haptic('tab'); draw();
    await hlApi('/tracking/sources', { method: 'PUT', json: { [k]: !on } }).catch((err) => flash(TR.missing ? 'Serveren har ikke Sporing ennå' : err.message));
    return true;
  }
  if ((x = d('[data-trkpref]'))) { await setTrkPref(x.dataset.trkpref); return true; }
  if (d('[data-trkhap]')) { const on = hpref('hap') && hpref('hapPkg'); if (!on && !hpref('hap')) setHap('hap', true); setHap('hapPkg', !on); if (!on) haptic('pkg'); draw(); return true; }
  if ((x = d('[data-trk]'))) {
    e.preventDefault();
    const k = x.dataset.trk, id = x.dataset.id, p = (TR.data?.items ?? []).find((y) => y.id === id);
    if (k === 'check') {
      if (TR.missing) { flash('Serveren har ikke Sporing ennå'); return true; }
      TR.busy = true; draw();
      try { const r = await hlApi('/tracking/check', { method: 'POST' }); await trkLoad(); haptic('ok'); flash(r?.message || 'Alt er oppdatert'); }
      catch (err) { haptic('err'); flash(err.message); }
      TR.busy = false; draw(); return true;
    }
    if (!p) return true;
    if (k === 'arch') { await patchItem(id, { archived: !p.archived }); TR.open = null; haptic('ok'); flash(p.archived ? `${p.name || p.trackingNo} er aktiv igjen` : `${p.name || p.trackingNo} er arkivert`); return true; }
    if (k === 'del') {
      if (TR.del !== id) { TR.del = id; haptic('err'); draw(); return true; }
      await hlApi(`/tracking/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (TR.data) TR.data.items = TR.data.items.filter((y) => y.id !== id);
      TR.del = null; TR.open = null; haptic('ok'); flash(`${p.name || p.trackingNo} er slettet`); return true;
    }
  }
  return false;
}

// Brukes både i Sporing-fanen og i Innstillinger → Varsler → Sporing.
export async function setTrkPref(k) {
  const P = { ...trkPrefs(), [k]: !trkPrefs()[k] };
  if (TR.data) TR.data.prefs = P; else TR.data = { items: null, sources: {}, carriers: [], prefs: P };
  try { localStorage.setItem('fh_trk_prefs', JSON.stringify(P)); } catch {}
  haptic('tab'); draw();
  if (P[k] && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  await hlApi('/tracking/prefs', { method: 'PUT', json: P }).catch(() => {});
}

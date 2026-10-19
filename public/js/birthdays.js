// Bursdager (prompt 24, Bursdager.dc.html variant «web», claude-code-bursdager.md).
// «Neste bursdag», søk, «+ Legg til», liste («NESTE 30 DAGER» og per måned), lenkeraden Kalendere og forhåndsvisning
// av telefon-widgetene. Prompt 26: Google Kalender og Home Assistant ligger i Innstillinger → Kalendere (mountBdCalendars). Data fra /api/birthdays (per bruker). Google-innloggingen går gjennom serveren
// (/api/birthdays/google/auth). Svarer serveren 404 (eldre versjon), lagres bursdagene bare i denne nettleseren.
import { api, esc } from './util.js';
import { clearBtn } from './searchfield.js';
import { store, emit } from './store.js';

export const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
export const MS = MN.map((m) => m.slice(0, 3));
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const RELC = { familie: '#b23a2a', venn: '#2b5d8a', jobb: '#2e6f75', annet: '#a8661a' };
const REL = [['familie', 'Familie'], ['venn', 'Venn'], ['jobb', 'Jobb'], ['annet', 'Annet']];
const RELN = Object.fromEntries(REL);
const SRC = { google: 'GOOGLE', ha: 'HOME ASSISTANT', local: 'LOKAL' };
const REMS = [[0, 'Samme dag'], [1, '1 dag før'], [7, '1 uke før'], [null, 'Ingen']];
const LKEY = 'hl_bd_local';

const S = { d: null, err: null, local: false, q: '', sel: null, add: false, editId: null, f: null, busy: '', toast: '', delArm: null, gcals: null, hacals: null, haErr: null };
let toastT = null, armT = null, pollT = null, calHost = null, from = 'page';
const host = () => document.getElementById('bd');
const isAdmin = () => store.me?.me?.role === 'admin';

/* ---------------- Datoer ---------------- */

const t0 = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
/** Neste dato, dager igjen og alder for en bursdag. */
export function derive(it) {
  const today = t0();
  let x = new Date(today.getFullYear(), it.month - 1, it.day);
  if (x < today) x = new Date(today.getFullYear() + 1, it.month - 1, it.day);
  const days = Math.round((x - today) / 864e5);
  return { ...it, x, days, age: it.year ? x.getFullYear() - it.year : null };
}
export const sorted = (items) => (items ?? []).map(derive).sort((a, b) => a.days - b.days || String(a.name).localeCompare(b.name, 'nb'));
export const whenTxt = (d) => (d === 0 ? 'I dag' : d === 1 ? 'I morgen' : `om ${d} d`);
export const ini = (n) => String(n ?? '?').trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
const dtx = (x) => `${WD[x.x.getDay()]} ${x.x.getDate()}. ${MN[x.x.getMonth()]}`;
const relOf = (r) => (RELN[String(r ?? '').toLowerCase()] ? String(r).toLowerCase() : 'annet');
/** Avatar: Familie-profilbilde hvis det finnes, ellers forbokstaver i farge etter «Hvem». */
export const avatar = (x, cls = 'bd-av') => `<span class="${cls}" style="background:${RELC[relOf(x.relation)]}">${x.avatarUrl ? `<img src="${esc(x.avatarUrl)}" alt="" loading="lazy">` : esc(ini(x.name))}</span>`;

/* ---------------- Data ---------------- */

const readLocal = () => { try { return JSON.parse(localStorage.getItem(LKEY) || 'null')?.items ?? []; } catch { return []; } };
const writeLocal = (items) => { try { localStorage.setItem(LKEY, JSON.stringify({ items })); } catch { /* privat modus */ } };
const norm = (it) => ({ ...it, month: +it.month, day: +it.day, year: it.year ? +it.year : null, relation: relOf(it.relation), reminderDays: it.reminderDays ?? it.reminder_days ?? null, source: it.source || 'local' });

export async function loadBirthdays() {
  try {
    const r = await api('/birthdays');
    S.d = { ...r, items: (Array.isArray(r) ? r : r.items ?? []).map(norm) };
    S.local = false; S.err = null;
  } catch (e) {
    if (e.status === 404) { S.local = true; S.d = { items: readLocal().map(norm), google: null, ha: null }; S.err = null; }
    else S.err = e.message;
  }
  store.data.birthdays = S.d;
  emit('birthdays');
  return S.d;
}

async function loadCals() {
  const g = S.d?.google;
  if (g?.connected && !S.gcals) {
    try { const r = await api('/birthdays/google/calendars'); S.gcals = (Array.isArray(r) ? r : r.items ?? r.calendars ?? []).map((c) => (typeof c === 'string' ? { id: c, name: c } : { id: c.id, name: c.summary ?? c.name ?? c.id })); } catch { S.gcals = []; }
    paint();
  }
  if (S.d?.ha && S.d.ha.allowed !== false && !S.hacals && !S.local) {
    try { const r = await api('/birthdays/ha/calendars'); S.hacals = (Array.isArray(r) ? r : r.items ?? r.calendars ?? []).map((c) => (typeof c === 'string' ? { id: c, name: c } : { id: c.entity_id ?? c.entityId ?? c.id, name: c.entity_id ?? c.entityId ?? c.id })); S.haErr = null; }
    catch (e) { S.hacals = []; S.haErr = e.status === 403 ? 'Home Assistant settes opp av administrator.' : e.status === 404 ? null : e.message; }
    paint();
  }
}

async function reload() { await loadBirthdays(); paint(); loadCals(); }

function flash(m) { S.toast = m; paint(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = ''; paint(); }, 2200); }

const f0 = () => { const n = new Date(), g = S.d?.google, ha = S.d?.ha; return { name: '', day: n.getDate(), month: n.getMonth() + 1, year: '', relation: 'venn', reminderDays: 1, saveTo: g?.connected && g.writeNew !== false ? 'google' : ha?.entityId && ha.twoWay ? 'ha' : 'local' }; };

/* ---------------- Visning ---------------- */

const chip = (on, attr, n, cls = '') => `<button type="button" class="bd-chip${on ? ' on' : ''}${cls ? ' ' + cls : ''}" ${attr} aria-pressed="${on}">${esc(n)}</button>`;
const tog = (on, attr, n, s) => `<button type="button" class="bd-tog" ${attr} aria-pressed="${on}"><span class="bd-grow"><b>${esc(n)}</b><span>${esc(s)}</span></span><span class="bd-sw${on ? ' on' : ''}"><i></i></span></button>`;
const hmTxt = (t) => (t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '');
const G_SVG = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const HA_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/></svg>';
const GIFT_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16v9H4zM2 7h20v4H2zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z"/></svg>';

function hero(L) {
  const h = L[0];
  if (!h) return '';
  const same = L.filter((x) => x.days === h.days), nxt = L.filter((x) => x.days > h.days).slice(0, 2);
  return `<button type="button" class="bd-hero" data-bd-sel="${esc(h.id)}">
    <span class="bd-hero-k"><span>${h.days === 0 ? 'BURSDAG I DAG' : 'NESTE BURSDAG'}</span><span>${same.length > 1 ? '' : SRC[h.source] ?? ''}</span></span>
    <span class="bd-hero-m"><span class="bd-grow"><b class="bd-hero-n">${esc(same.map((x) => x.name).join(' og '))}</b><span class="bd-hero-s">${esc((same.length === 1 && h.age != null ? `Fyller ${h.age} · ` : '') + dtx(h))}</span></span>
      <span class="bd-hero-r"><b>${h.days === 0 ? 'I dag' : h.days}</b><span>${h.days === 0 ? '' : h.days === 1 ? 'dag igjen' : 'dager igjen'}</span></span></span>
    ${nxt.length ? `<span class="bd-hero-more">Deretter: ${esc(nxt.map((x) => `${x.name} ${x.x.getDate()}. ${MS[x.x.getMonth()]}`).join(' · '))}</span>` : ''}
  </button>`;
}

function form() {
  if (!S.add) return '';
  const f = S.f, g = S.d?.google, ha = S.d?.ha;
  const dests = [['google', 'Google Kalender', g?.connected], ['ha', 'Home Assistant', !!ha?.entityId], ['local', 'Bare her', true]].filter((d) => d[2]);
  const calName = (S.gcals ?? []).find((c) => c.id === g?.calendarId)?.name ?? g?.calendarId ?? 'Bursdager';
  const note = f.saveTo === 'google' ? `Lagres som årlig heldagshendelse i «${calName}»${g?.email ? ` på ${g.email}` : ''}.` : f.saveTo === 'ha' ? `Lagres i ${ha?.entityId} via Home Assistant.` : S.local ? 'Lagres bare i denne nettleseren til serveren er oppdatert.' : 'Lagres bare i Homelab. Koble til en kalender for å synke.';
  return `<form class="bd-form" data-bd-form>
    <b class="bd-ft">${S.editId ? 'Rediger bursdag' : 'Ny bursdag'}</b>
    <input class="bd-in" name="name" value="${esc(f.name)}" placeholder="Navn" autocomplete="off" maxlength="80" aria-label="Navn">
    <div class="bd-date"><select class="bd-in" name="day" aria-label="Dag">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${+f.day === i + 1 ? ' selected' : ''}>${i + 1}.</option>`).join('')}</select>
      <select class="bd-in" name="month" aria-label="Måned">${MN.map((n, i) => `<option value="${i + 1}"${+f.month === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input class="bd-in mono" name="year" value="${esc(f.year)}" placeholder="År" inputmode="numeric" maxlength="4" aria-label="Fødselsår (valgfritt)"></div>
    <span class="bd-lbl">Hvem</span><div class="bd-chips">${REL.map(([k, n]) => chip(f.relation === k, `data-bd-f="relation" data-v="${k}"`, n)).join('')}</div>
    <span class="bd-lbl">Påminnelse</span><div class="bd-chips">${REMS.map(([v, n]) => chip(f.reminderDays === v, `data-bd-f="reminderDays" data-v="${v ?? ''}"`, n)).join('')}</div>
    ${S.editId ? '' : `<span class="bd-lbl">Lagre i</span><div class="bd-chips">${dests.map(([k, n]) => chip(f.saveTo === k, `data-bd-f="saveTo" data-v="${k}"`, n)).join('')}</div>
    <span class="bd-note">${esc(note)}</span>`}
    <div class="bd-2"><button type="button" class="bd-btn" data-bd-act="cancel">Avbryt</button><button type="submit" class="bd-btn pri"${S.busy === 'save' ? ' disabled' : ''}>${S.busy === 'save' ? 'Lagrer …' : 'Lagre'}</button></div>
  </form>`;
}

function row(x, i) {
  const op = String(S.sel) === String(x.id), rel = RELN[x.relation];
  const det = dtx(x).replace(/^./, (m) => m.toUpperCase()) + (x.year ? ` · født ${x.year}` : '') + ' · ' + (x.days === 0 ? 'har bursdag i dag' : `om ${x.days} dager`);
  return `<div class="bd-row${i ? ' bt' : ''}${op ? ' open' : ''}" data-bd-row="${esc(x.id)}">
    <button type="button" class="bd-rb" data-bd-sel="${esc(x.id)}" aria-expanded="${op}">${avatar(x)}
      <span class="bd-grow"><b class="bd-n">${esc(x.name)}</b><span class="bd-sub">${esc(`${x.x.getDate()}. ${MS[x.x.getMonth()]}${x.age != null ? ` · fyller ${x.age}` : ''} · ${rel}`)}</span></span>
      <span class="bd-rr"><b class="${x.days <= 7 ? 'soon' : ''}">${whenTxt(x.days)}</b><span>${SRC[x.source] ?? 'LOKAL'}</span></span></button>
    ${op ? `<div class="bd-det"><span class="bd-dt">${esc(det)}</span><span class="bd-lbl">Påminnelse</span>
      <div class="bd-chips">${REMS.map(([v, n]) => chip(x.reminderDays === v, `data-bd-rem="${esc(x.id)}" data-v="${v ?? ''}"`, n, 'sm')).join('')}</div>
      <div class="bd-chips">${x.source === 'google' || x.googleUrl ? `<a class="bd-btn sm" href="${esc(/^https:\/\/[a-z.]*google\.com\//.test(x.googleUrl ?? '') ? x.googleUrl : 'https://calendar.google.com/')}" target="_blank" rel="noopener">Åpne i Google Kalender</a>` : ''}<button type="button" class="bd-btn sm" data-bd-edit="${esc(x.id)}">Rediger</button><button type="button" class="bd-btn sm red" data-bd-del="${esc(x.id)}">${S.delArm === x.id ? 'Trykk igjen for å slette' : 'Slett'}</button></div></div>` : ''}
  </div>`;
}

function list(L) {
  const q = S.q.trim().toLowerCase(), F = q ? L.filter((x) => x.name.toLowerCase().includes(q)) : L;
  if (!F.length) return `<div class="bd-card bd-empty">${L.length ? 'Ingen treff.' : 'Ingen bursdager ennå. Trykk «+ Legg til», eller koble til Google Kalender eller Home Assistant.'}</div>`;
  const G = [], soon = F.filter((x) => x.days <= 30), y0 = new Date().getFullYear();
  if (soon.length) G.push({ t: 'NESTE 30 DAGER', items: soon });
  for (const x of F.filter((z) => z.days > 30)) {
    const k = MN[x.x.getMonth()].toUpperCase() + (x.x.getFullYear() !== y0 ? ` ${x.x.getFullYear()}` : '');
    let g = G.find((z) => z.t === k);
    if (!g) G.push(g = { t: k, items: [] });
    g.items.push(x);
  }
  return G.map((g) => `<section class="bd-group"><span class="bd-gt"><span>${g.t}</span><span class="mut">${g.items.length}</span></span><div class="bd-card bd-list">${g.items.map(row).join('')}</div></section>`).join('');
}

function calendars() {
  if (S.local) return `<div class="bd-card bd-cals"><span class="bd-note">Serveren støtter ikke bursdager ennå. Bursdagene lagres bare i denne nettleseren, og Google Kalender og Home Assistant kan kobles til når serveren er oppdatert.</span></div>`;
  const g = S.d?.google ?? {}, ha = S.d?.ha ?? {};
  const gst = g.connected ? `${g.email || 'Google'} · ${g.syncedAt ? `synket ${hmTxt(g.syncedAt)}` : 'ikke synket ennå'}` : 'Ikke koblet til';
  const gOn = g.connected ? `<span class="bd-lbl">Kalender</span><div class="bd-chips">${(S.gcals ?? []).length ? S.gcals.map((c) => chip(g.calendarId === c.id, `data-bd-gcal="${esc(c.id)}"`, c.name)).join('') : `<span class="bd-note">${S.gcals ? 'Fant ingen kalendere.' : 'Henter kalendere …'}</span>`}</div>
      ${tog(g.writeNew !== false, 'data-bd-gtog="writeNew"', 'Skriv nye bursdager til Google', 'Årlig heldagshendelse med påminnelse')}
      ${tog(g.contacts !== false, 'data-bd-gtog="contacts"', 'Hent bursdager fra Google-kontakter', 'Fra kontaktlisten din')}
      <div class="bd-gb"><button type="button" class="bd-btn bd-grow lab" data-bd-act="gsync"${S.busy === 'gsync' ? ' disabled' : ''}>${S.busy === 'gsync' ? 'Synker …' : '↻ Synk nå'}</button><button type="button" class="bd-btn" data-bd-act="glogout">Logg ut</button></div>`
    : g.configured === false ? `<span class="bd-note">Google Kalender er ikke satt opp ennå. ${isAdmin() ? 'Legg inn klient-ID og hemmelighet under Innstillinger → Integrasjoner → Google Kalender.' : 'Settes opp av administrator.'}</span>`
    : `<button type="button" class="bd-glogin" data-bd-act="glogin"${S.busy === 'glogin' ? ' disabled' : ''}>${G_SVG}${S.busy === 'glogin' ? 'Kobler til …' : 'Logg inn med Google'}</button>`;
  const hst = ha.entityId ? `${ha.entityId}${ha.syncedAt ? ` · importert ${hmTxt(ha.syncedAt)}` : ''}` : 'Velg kalender og importer';
  const ents = S.hacals ?? [];
  const haBody = S.haErr ? `<span class="bd-note">${esc(S.haErr)}</span>`
    : `<span class="bd-lbl">Kalender i Home Assistant</span><div class="bd-chips">${ents.length ? ents.map((c) => chip(ha.entityId === c.id, `data-bd-haent="${esc(c.id)}"`, c.name, 'mono')).join('') : `<span class="bd-note">${S.hacals ? 'Fant ingen calendar.*-enheter.' : 'Henter kalendere …'}</span>`}</div>
      ${ha.entityId ? tog(!!ha.twoWay, 'data-bd-hatog="twoWay"', 'Synk to veier', 'Nye bursdager her legges også i Home Assistant') : ''}
      <button type="button" class="bd-btn pri" data-bd-act="haimp"${S.busy === 'haimp' || !ha.entityId ? ' disabled' : ''}>${S.busy === 'haimp' ? 'Importerer …' : ha.syncedAt ? '↻ Importer på nytt' : 'Importer fra Home Assistant'}</button>`;
  return `<div class="bd-card bd-cals">
    <div class="bd-ch"><span class="bd-ci g">${G_SVG}</span><span class="bd-grow"><b>Google Kalender</b><span class="${g.connected ? 'pos' : ''}">${esc(gst)}</span>${g.error ? `<span class="err">${esc(g.error)}</span>` : ''}</span></div>
    ${gOn}
    ${ha.allowed === false ? '' : `<div class="bd-hr"></div>
    <div class="bd-ch"><span class="bd-ci ha">${HA_SVG}</span><span class="bd-grow"><b>Home Assistant</b><span class="${ha.entityId ? 'pos' : ''}">${esc(hst)}</span>${ha.error ? `<span class="err">${esc(ha.error)}</span>` : ''}</span></div>
    ${haBody}`}
  </div>`;
}

/** Lenkeraden nederst i listen: «Kalendere · Google … · HA … · Innstillinger ›». */
export function bdCalSummary() {
  const g = S.d?.google ?? {}, ha = S.d?.ha ?? {};
  return { g: g.connected ? `Google: ${g.email || 'koblet til'}` : 'Google ikke koblet', ha: ha.entityId ? `HA: ${ha.entityId}` : 'Home Assistant ikke importert' };
}
function calLink() {
  const s = bdCalSummary();
  return `<button type="button" class="bd-card bd-callink" data-bd-act="calset"><span class="bd-grow"><b>Kalendere</b><span>${esc(S.local ? 'Google Kalender og Home Assistant' : `${s.g} · ${s.ha}`)}</span></span><span class="bd-cl-r">Innstillinger ›</span></button>`;
}

function widgets(L) {
  const h = L[0], same = h ? L.filter((x) => x.days === h.days) : [], t3 = L.slice(0, 3);
  const big = h ? (h.days === 0 ? 'I dag' : String(h.days)) : '–', unit = h && h.days > 0 ? (h.days === 1 ? 'dag' : 'dager') : '';
  const n = h ? same.map((x) => x.name).join(' og ') : 'Ingen', sub = h ? `${h.age != null ? `Fyller ${h.age} · ` : ''}${h.x.getDate()}. ${MS[h.x.getMonth()]}` : '';
  const r3 = (cls) => t3.map((x) => `<span class="${cls}">${avatar(x, 'bd-wav')}<span class="bd-grow"><b>${esc(x.name)}</b>${cls === 'bd-wr' ? `<span>${esc(`${x.x.getDate()}. ${MS[x.x.getMonth()]}${x.age != null ? ` · ${x.age} år` : ''}`)}</span>` : ''}</span><b class="bd-ww${x.days <= 7 ? ' soon' : ''}">${whenTxt(x.days)}</b></span>`).join('');
  return `<span class="bd-gt">WIDGETS PÅ TELEFONEN</span>
    <div class="bd-wall">
      <div class="bd-wcol"><div class="bd-w bd-ws"><span class="bd-wk">${h?.days === 0 ? 'BURSDAG I DAG' : 'NESTE BURSDAG'}</span><span class="bd-wbig"><b>${big}</b><span>${unit}</span></span><b class="bd-wn">${esc(n)}</b><span class="bd-wsub">${esc(sub)}</span></div><span class="bd-wl">iOS · liten</span></div>
      <div class="bd-wcol wide"><div class="bd-w bd-wm"><span class="bd-wmh"><b>Bursdager</b><span>${L.filter((x) => x.days <= 30).length} NESTE 30 D</span></span>${r3('bd-wr')}</div><span class="bd-wl">iOS · medium</span></div>
      <div class="bd-wcol"><div class="bd-w bd-wa"><span class="bd-wah"><b>Bursdager</b><span>+</span></span>${r3('bd-wp')}</div><span class="bd-wl">Android</span></div>
      <div class="bd-wcol"><div class="bd-w bd-wsam"><span class="bd-wgift">${GIFT_SVG}</span><span class="bd-wbig"><b>${big}</b><span>${unit}</span></span><b class="bd-wn">${esc(n)}</b><span class="bd-wsub">${esc(sub)}</span></div><span class="bd-wl">Samsung One UI · 2×2</span></div>
    </div>
    <span class="bd-note pad">Widgetene viser neste bursdag og de tre neste. Et trykk åpner Bursdager, og på Android legger + til en ny.</span>`;
}

function body() {
  if (S.err && !S.d) return `<div class="bd-card bd-empty">Kunne ikke hente bursdagene: ${esc(S.err)}<br><button type="button" class="bd-btn" data-bd-act="retry">Prøv igjen</button></div>`;
  if (!S.d) return '<div class="bd-card bd-empty">Laster …</div>';
  const L = sorted(S.d.items);
  return `${S.toast ? `<div class="bd-toast" role="status">${esc(S.toast)}</div>` : ''}
    <div class="bd-grid"><div class="bd-col">
      ${hero(L)}
      <div class="bd-bar"><label class="bd-q${S.q ? ' has' : ''}" data-sf><span class="sf-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg></span>${clearBtn()}<input name="bdq" value="${esc(S.q)}" placeholder="Søk etter navn" autocomplete="off" aria-label="Søk etter navn"></label><button type="button" class="bd-add" data-bd-act="add">${S.add ? 'Lukk' : '+ Legg til'}</button></div>
      ${form()}
      <div class="bd-lists">${list(L)}</div>
      ${calLink()}
    </div>
    <div class="bd-col">${widgets(L)}
    </div></div>`;
}

function calBody() {
  if (S.err && !S.d) return `<div class="bd-card bd-empty">Kunne ikke hente kalenderoppsettet: ${esc(S.err)}</div>`;
  if (!S.d) return '<div class="bd-card bd-empty">Laster …</div>';
  return `${S.toast && !host() ? `<div class="bd-toast" role="status">${esc(S.toast)}</div>` : ''}${calendars()}`;
}
function paintCal() { if (calHost?.isConnected) calHost.innerHTML = calBody(); }
/** Innstillinger → Kalendere: Google Kalender og Home Assistant i et eget element som beholdes mellom omtegningene. */
export function mountBdCalendars(slot) {
  if (!calHost) { calHost = document.createElement('div'); calHost.className = 'bd bd-calset'; bind(calHost); }
  slot.replaceWith(calHost);
  if (!S.d) { calHost.innerHTML = calBody(); reload(); } else { paintCal(); loadCals(); }
}

function paint() {
  paintCal();
  const h = host();
  if (!h) return;
  const a = document.activeElement, key = a && h.contains(a) ? a.name : null, pos = key && a.selectionStart != null ? a.selectionStart : null;
  // Skjemaet beholder det som er skrevet, også når siden tegnes på nytt.
  if (S.add) readForm(h);
  h.innerHTML = body();
  paintCal();
  if (key) { const el = h.querySelector(`[name="${key}"]`); el?.focus(); if (pos != null) try { el.setSelectionRange(pos, pos); } catch { /* select */ } }
}
function readForm(h) {
  const fm = h.querySelector('[data-bd-form]');
  if (!fm || !S.f) return;
  const v = (n) => fm.elements[n]?.value;
  Object.assign(S.f, { name: v('name') ?? S.f.name, day: +(v('day') ?? S.f.day), month: +(v('month') ?? S.f.month), year: String(v('year') ?? S.f.year).replace(/\D/g, '').slice(0, 4) });
}

/* ---------------- Handlinger ---------------- */

const byId = (id) => S.d?.items.find((x) => String(x.id) === String(id));
const remVal = (v) => (v === '' ? null : +v);

async function save() {
  const h = host(); readForm(h);
  const f = S.f, name = f.name.trim();
  if (!name) return flash('Skriv inn navn');
  const body = { name, month: +f.month, day: +f.day, year: f.year.length === 4 ? +f.year : null, relation: f.relation, reminderDays: f.reminderDays };
  S.busy = 'save'; paint();
  let warn = '';
  try {
    if (S.local) {
      const items = readLocal();
      if (S.editId) { const i = items.findIndex((x) => String(x.id) === String(S.editId)); if (i >= 0) items[i] = { ...items[i], ...body }; }
      else items.push({ id: 'l' + Date.now(), ...body, source: 'local' });
      writeLocal(items);
    } else if (S.editId) { const r = await api(`/birthdays/${encodeURIComponent(S.editId)}`, { method: 'PATCH', json: body }); if (r?.warning) warn = r.warning; }
 else { const r = await api('/birthdays', { method: 'POST', json: { ...body, saveTo: f.saveTo } }); if (r?.warning) warn = r.warning; }
    const msg = warn || S.editId ? `${name} er lagret` : f.saveTo === 'google' ? `${name} er lagt i Google Kalender` : f.saveTo === 'ha' ? `${name} er lagt i Home Assistant` : `${name} er lagret`;
    S.add = false; S.editId = null; S.q = ''; S.busy = '';
    await reload(); flash(msg);
  } catch (e) { S.busy = ''; paint(); flash(e.message); }
}

async function del(id) {
  const x = byId(id);
  if (!x) return;
  if (S.delArm !== x.id) { S.delArm = x.id; paint(); clearTimeout(armT); armT = setTimeout(() => { S.delArm = null; paint(); }, 2500); return; }
  S.delArm = null; S.sel = null;
  S.d.items = S.d.items.filter((y) => y.id !== x.id); paint();
  try {
    if (S.local) writeLocal(readLocal().filter((y) => String(y.id) !== String(x.id)));
    else await api(`/birthdays/${encodeURIComponent(x.id)}`, { method: 'DELETE' });
    flash(`${x.name} er slettet`);
  } catch (e) { flash(e.message); }
  reload();
}

async function patch(id, json) {
  const x = byId(id);
  if (!x) return;
  Object.assign(x, json); paint();
  try {
    if (S.local) writeLocal(readLocal().map((y) => (String(y.id) === String(id) ? { ...y, ...json } : y)));
    else await api(`/birthdays/${encodeURIComponent(id)}`, { method: 'PATCH', json });
  } catch (e) { flash(e.message); reload(); }
}

async function putG(json) {
  Object.assign(S.d.google ??= {}, json); paint();
  try { const r = await api('/birthdays/google', { method: 'PUT', json }); if (r?.google) S.d.google = r.google; else if (r && 'connected' in r) S.d.google = r; } catch (e) { flash(e.message); }
  if (json.calendarId || json.contacts !== undefined) return reload();
  paint();
}
async function putHa(json) {
  Object.assign(S.d.ha ??= {}, json); paint();
  try { const r = await api('/birthdays/ha', { method: 'PUT', json }); if (r?.ha) S.d.ha = r.ha; else if (r && 'entityId' in r) S.d.ha = r; } catch (e) { flash(e.message); }
  paint();
}
const countOf = (r) => r?.added ?? r?.imported ?? r?.changed ?? r?.count ?? null;

async function act(a) {
  switch (a) {
    case 'retry': return reload();
    case 'calset': document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'kal' })); return;
    case 'add': S.add = !S.add; S.editId = null; S.f = f0(); return paint();
    case 'cancel': S.add = false; S.editId = null; return paint();
    case 'glogin':
      // Innloggingen går gjennom serveren (OAuth med PKCE), som sender tilbake til #/bursdager.
      S.busy = 'glogin'; paint();
      location.assign('/api/birthdays/google/auth?return=' + encodeURIComponent(from === 'set' ? '/#/kalender?settings=kal' : '/#/bursdager'));
      return;
    case 'gsync':
      S.busy = 'gsync'; paint();
      try { const r = await api('/birthdays/google/sync', { method: 'POST' }); S.busy = ''; await reload(); const n = countOf(r); flash(n ? `Synket med Google Kalender · ${n} nye` : 'Synket med Google Kalender'); } catch (e) { S.busy = ''; paint(); flash(e.message); }
      return;
    case 'glogout':
      try { await api('/birthdays/google', { method: 'DELETE' }); S.gcals = null; await reload(); flash('Logget ut av Google'); } catch (e) { flash(e.message); }
      return;
    case 'haimp':
      S.busy = 'haimp'; paint();
      try { const r = await api('/birthdays/ha/import', { method: 'POST' }); S.busy = ''; await reload(); const n = countOf(r); flash(n ? `${n} bursdager importert fra ${S.d.ha?.entityId ?? 'Home Assistant'}` : `Ingen nye bursdager i ${S.d.ha?.entityId ?? 'Home Assistant'}`); } catch (e) { S.busy = ''; paint(); flash(e.message); }
  }
}

function bind(h) {
  if (h.dataset.bdBound) return;
  h.dataset.bdBound = '1';
  h.addEventListener('input', (e) => {
    if (e.target.name === 'bdq') { S.q = e.target.value; const el = h.querySelector('.bd-lists'); if (el && S.d) el.innerHTML = list(sorted(S.d.items)); }
    if (e.target.name === 'year') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });
  h.addEventListener('submit', (e) => { if (e.target.closest('[data-bd-form]')) { e.preventDefault(); save(); } });
  h.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !h.contains(t)) return;
    const d = t.dataset;
    from = h === calHost ? 'set' : 'page';
    if (d.bdAct) return act(d.bdAct);
    if (d.bdSel) { const x = byId(d.bdSel); S.sel = !x || (String(S.sel) === String(x.id) && !t.classList.contains('bd-hero')) ? null : x.id; S.delArm = null; paint(); if (t.classList.contains('bd-hero')) h.querySelector(`[data-bd-row="${CSS.escape(d.bdSel)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (d.bdF) { readForm(h); S.f[d.bdF] = d.bdF === 'reminderDays' ? remVal(d.v) : d.v; return paint(); }
    if (d.bdRem !== undefined) return patch(d.bdRem, { reminderDays: remVal(d.v) });
    if (d.bdEdit) { const x = byId(d.bdEdit); S.add = true; S.editId = x.id; S.f = { name: x.name, day: x.day, month: x.month, year: x.year ? String(x.year) : '', relation: x.relation, reminderDays: x.reminderDays, saveTo: x.source }; paint(); h.querySelector('[data-bd-form]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (d.bdDel) return del(d.bdDel);
    if (d.bdGcal) return putG({ calendarId: d.bdGcal });
    if (d.bdGtog) return putG({ [d.bdGtog]: !(S.d.google?.[d.bdGtog] !== false) });
    if (d.bdHaent) return putHa({ entityId: d.bdHaent, twoWay: !!S.d.ha?.twoWay });
    if (d.bdHatog) return putHa({ entityId: S.d.ha?.entityId, twoWay: !S.d.ha?.twoWay });
  });
}

export function render() {
  setTimeout(() => {
    const h = host();
    if (!h) return;
    bind(h);
    // Tilbake fra Google: /?google=ok|error&message=…#/bursdager (eller i hashen).
    const qs = new URLSearchParams(location.search.includes('google=') ? location.search : location.hash.split('?')[1] ?? '');
    if (qs.has('google')) { const ok = /^(ok|1|true|connected)$/.test(qs.get('google')), m = qs.get('message') || qs.get('error'); history.replaceState(null, '', location.pathname + '#/bursdager'); setTimeout(() => flash(ok ? 'Koblet til Google Kalender' : `Google: ${m || 'innloggingen ble avbrutt'}`), 300); }
    S.gcals = null; S.hacals = null;
    reload();
    clearInterval(pollT);
    pollT = setInterval(() => { if (!host()) { clearInterval(pollT); return; } if (!document.hidden && !S.add) reload(); }, 5 * 60_000);
  });
  return `<div class="bd-top"><div class="os-title">Burs<b>dager</b></div><div class="bd-tsub">Familie og venner</div></div><div id="bd" class="bd">${body()}</div>`;
}

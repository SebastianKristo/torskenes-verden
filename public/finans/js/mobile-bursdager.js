// Prompt 24 (mobilweb / PWA): Bursdager (Mer → Bursdager og Hjem-widgeten «BURSDAGER · NESTE») med Google Kalender og Home
// Assistant (GET/POST/PATCH/DELETE /api/birthdays). Skilt ut fra mobile-profiler.js; den sender hendelsene hit (bdInput,
// bdChange, bdSubmit, bdClick). Mangler endepunktene (404), lagres bursdagene lokalt.
import * as P36 from './mobile-brief-og-oppstart.js'; // prompt 36: Hovedkalender og Vis også i Kalender (Google)
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const isAdmin = () => m.me?.role === 'admin' || m.me?.isMainAdmin === true;
const hm = (t) => (t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '');
/** Prompt 35: valgte Google-kalendere for Bursdager (flere), med calendarId som reserve. */
const gSel = (G) => { const L = Array.isArray(G?.calendarIds) ? G.calendarIds : Array.isArray(G?.cals) ? G.cals : G?.calendarId ? [G.calendarId] : []; return L.filter(Boolean); };

/* =====================================================================
   4. Bursdager (GET/POST/PATCH/DELETE /api/birthdays)
   ===================================================================== */

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], MS = MN.map((x) => x.slice(0, 3)), WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const RELC = { familie: '#b23a2a', venn: '#2b5d8a', jobb: '#2e6f75', annet: '#a8661a' }, RELN = { familie: 'Familie', venn: 'Venn', jobb: 'Jobb', annet: 'Annet' };
const SRC = { google: 'GOOGLE', ha: 'HOME ASSISTANT', local: 'LOKAL' };
const REMS = [[0, 'Samme dag'], [1, '1 dag før'], [7, '1 uke før'], [null, 'Ingen']];
export const BD = { d: null, local: false, err: '', t: 0, q: '', sel: null, add: false, editId: null, f: null, delArm: null, busy: '', cals: null, ents: null };
const LBD = 'bd_v1';
const localGet = () => { try { return JSON.parse(localStorage.getItem(LBD) || 'null')?.items ?? []; } catch { return []; } };
const localPut = (items) => { try { localStorage.setItem(LBD, JSON.stringify({ items })); } catch {} };
function nextOf(M, D) {
  const n = new Date(), t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  let x = new Date(n.getFullYear(), M - 1, D); if (x < t0) x = new Date(n.getFullYear() + 1, M - 1, D);
  return { x, days: Math.round((x - t0) / 864e5) };
}
const people = () => (BD.d?.items ?? []).map((p) => {
  const M = +p.month, D = +p.day, { x, days } = nextOf(M, D);
  const rel = String(p.relation ?? 'annet').toLowerCase();
  return { ...p, M, D, x, days: Number.isFinite(p.daysLeft) ? p.daysLeft : days, age: p.age ?? (p.year ? x.getFullYear() - p.year : null), rel: RELC[rel] ? rel : 'annet', src: SRC[p.source] ? p.source : 'local', rem: p.reminderDays ?? null };
}).sort((a, b) => a.days - b.days || String(a.name).localeCompare(b.name, 'nb'));
const inis = (n) => String(n).split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
const when = (d) => (d === 0 ? 'I dag' : d === 1 ? 'I morgen' : `om ${d} d`);
const dtx = (x) => `${WD[x.getDay()]} ${x.getDate()}. ${MN[x.getMonth()]}`;
// Prompt 41 (claude-code-bursdag-bilder.md): eget opplastet bilde går foran kontaktbildet; uten bilde: initialer + lite «+».
const photoOf = (p) => p.photoUrl ?? p.photo_url ?? p.photos?.[0]?.url ?? p.avatarUrl ?? null;
const bav = (p, s, plus = false) => { const u = photoOf(p); return `<span class="p24-bav${!u && plus ? ' p41-bplus' : ''}" style="width:${s}px;height:${s}px;border-radius:${s / 2}px;background:${u ? 'transparent' : RELC[p.rel]};font-size:${s >= 40 ? 14 : s >= 30 ? 11 : 10}px">${u ? `<img src="${esc(u)}" alt="">` : esc(inis(p.name))}</span>`; };

export async function bdLoad(force = false) {
  if (!force && BD.d && Date.now() - BD.t < 60000) return;
  BD.t = Date.now();
  try { const r = await hlApi('/birthdays'); BD.d = { ...r, items: r?.items ?? (Array.isArray(r) ? r : []) }; BD.local = false; BD.err = ''; }
  catch (e) {
    if (e.status === 404) { BD.local = true; BD.d = { items: localGet(), google: { connected: false }, ha: {} }; BD.err = ''; }
    else BD.err = e.message;
  }
}
const f0 = () => { const n = new Date(), g = BD.d?.google?.connected, h = BD.d?.ha?.entityId; return { name: '', day: String(n.getDate()), month: String(n.getMonth() + 1), year: '', relation: 'venn', reminderDays: 1, saveTo: g ? 'google' : h ? 'ha' : 'local' }; };
const chip = (on, attrs, n) => `<button class="p24-chip${on ? ' on' : ''}" ${attrs} aria-pressed="${on}">${esc(n)}</button>`;
const tog = (on, attrs, n, s) => `<button class="p24-tog" ${attrs} role="switch" aria-checked="${on}"><span class="m-grow"><b>${esc(n)}</b><small>${esc(s)}</small></span><span class="p24-sw${on ? ' on' : ''}"><i></i></span></button>`;

function addCard() {
  const f = BD.f ?? (BD.f = f0()), G = BD.d?.google ?? {}, H = BD.d?.ha ?? {};
  const dests = [['google', 'Google Kalender', G.connected], ['ha', 'Home Assistant', !!H.entityId], ['local', 'Bare her', true]].filter((x) => x[2]);
  const note = f.saveTo === 'google' ? `Lagres som årlig heldagshendelse i Google Kalender${G.email ? ` på ${G.email}` : ''}.` : f.saveTo === 'ha' ? `Lagres i ${H.entityId} via Home Assistant.` : BD.local ? 'Lagres bare på denne enheten. Serveren støtter ikke bursdager ennå.' : 'Lagres bare i Homelab. Koble til en kalender for å synke.';
  return `<form class="p24-bdadd" data-p24form="bdsave"><b class="p24-h22">${BD.editId ? 'Rediger bursdag' : 'Ny bursdag'}</b>
    <input class="p24-in" data-p24in="bdf" data-k="name" value="${esc(f.name)}" placeholder="Navn" maxlength="60" autocomplete="off">
    <div class="p24-dmy"><select class="p24-in" data-p24in="bdf" data-k="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${+f.day === i + 1 ? ' selected' : ''}>${i + 1}.</option>`).join('')}</select>
      <select class="p24-in" data-p24in="bdf" data-k="month">${MN.map((n, i) => `<option value="${i + 1}"${+f.month === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input class="p24-in mono" data-p24in="bdf" data-k="year" value="${esc(f.year)}" placeholder="År" inputmode="numeric" maxlength="4"></div>
    <span class="p24-fl">Hvem</span><div class="p24-chips">${Object.entries(RELN).map(([k, n]) => chip(f.relation === k, `type="button" data-p24="bdrel" data-v="${k}"`, n)).join('')}</div>
    <span class="p24-fl">Påminnelse</span><div class="p24-chips">${REMS.map(([v, n]) => chip(f.reminderDays === v, `type="button" data-p24="bdrem" data-v="${v ?? ''}"`, n)).join('')}</div>
    <span class="p24-fl">Lagre i</span><div class="p24-chips">${dests.map(([k, n]) => chip(f.saveTo === k, `type="button" data-p24="bddest" data-v="${k}"`, n)).join('')}</div>
    <span class="p24-note">${esc(note)}</span>
    <div class="p24-two"><button type="button" class="p24-b" data-p24="bdx">Avbryt</button><button type="submit" class="p24-b ink" ${BD.busy === 'save' ? 'disabled' : ''}>${BD.busy === 'save' ? 'Lagrer …' : 'Lagre'}</button></div></form>`;
}
function bdRow(p, i) {
  const open = BD.sel === p.id;
  return `<div class="p24-bdr"${i ? '' : ' style="border-top:0"'}><button class="p24-bdh" data-p24="bdsel" data-id="${esc(p.id)}" aria-expanded="${open}">${bav(p, 42, true)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(p.name)}</b><span class="p24-mut">${p.x.getDate()}. ${MS[p.x.getMonth()]}${p.age != null ? ` · fyller ${p.age}` : ''} · ${RELN[p.rel]}</span></span>
    <span class="p24-bdw"><b class="${p.days <= 7 ? 'soon' : ''}">${when(p.days)}</b><small>${SRC[p.src]}</small></span></button>
    ${open ? `<div class="p24-bdo">${globalThis.P41?.bdPhotoBar?.(p, photoOf(p)) ?? ''}<span>${esc(dtx(p.x).replace(/^./, (c) => c.toUpperCase()))}${p.year ? ` · født ${p.year}` : ''} · ${p.days === 0 ? 'har bursdag i dag' : `om ${p.days} dager`}</span>
      <span class="p24-fl">Påminnelse</span><div class="p24-chips">${REMS.map(([v, n]) => chip(p.rem === v, `data-p24="bdprem" data-id="${esc(p.id)}" data-v="${v ?? ''}"`, n)).join('')}</div>
      <div class="p24-chips">${p.src === 'google' ? '<a class="p24-ob" href="https://calendar.google.com/" target="_blank" rel="noopener">Åpne i Google Kalender</a>' : ''}<button class="p24-ob" data-p24="bdedit" data-id="${esc(p.id)}">Rediger</button><button class="p24-ob lab" data-p24="bddel" data-id="${esc(p.id)}">${BD.delArm === p.id ? 'Trykk igjen for å slette' : 'Slett'}</button></div></div>` : ''}</div>`;
}
export function calCard() {
  const G = BD.d?.google ?? {}, H = BD.d?.ha ?? {}, gOn = !!G.connected, hOn = !!H.entityId;
  if (gOn && !BD.cals && !BD.calBusy) { BD.calBusy = true; hlApi('/birthdays/google/calendars').then((r) => { BD.cals = Array.isArray(r) ? r : r?.items ?? r?.calendars ?? []; }).catch(() => { BD.cals = []; }).finally(() => draw()); }
  const haOk = H.allowed !== false && !BD.local;
  if (haOk && isAdmin() && !BD.ents && !BD.entBusy) { BD.entBusy = true; hlApi('/birthdays/ha/calendars').then((r) => { BD.ents = Array.isArray(r) ? r : r?.items ?? r?.entities ?? []; }).catch(() => { BD.ents = []; }).finally(() => draw()); }
  const GSVG = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  const cal = (x) => ({ id: x.id ?? x.calendarId ?? x, n: x.summary ?? x.name ?? x.id ?? x });
  const ent = (x) => (typeof x === 'string' ? x : x.entity_id ?? x.entityId ?? x.id);
  const ents = [...new Set([...(BD.ents ?? []).map(ent), ...(H.entityId ? [H.entityId] : [])])].filter(Boolean);
  return `<div class="p24-bdcal"><span class="p24-lab">KALENDERE</span><div class="p24-card p24-cal">
    <div class="p24-ch"><span class="p24-ci g">${GSVG.replace('18', '20').replace('18', '20')}</span><span class="m-grow"><b>Google Kalender</b><small style="color:${gOn ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${gOn ? `${esc(G.email ?? 'Tilkoblet')} · ${G.syncedAt ? `synket ${hm(G.syncedAt)}` : 'kobler til …'}` : BD.local ? 'Krever nyere server' : 'Ikke koblet til'}</small></span></div>
    ${gOn ? `<span class="p24-fl">Kalendere · ${gSel(G).length} valgt</span><div class="p24-chips">${(BD.cals ?? []).map(cal).map((c) => chip(gSel(G).includes(c.id), `data-p24="gcal" data-v="${esc(c.id)}"`, `${gSel(G).includes(c.id) ? '✓ ' : ''}${c.n}`)).join('') || '<span class="p24-mut">Henter kalendere …</span>'}</div>
      ${P36.gcalSection()}${tog(G.writeNew !== false, 'data-p24="gtog" data-k="writeNew"', 'Skriv nye bursdager til Google', 'Årlig heldagshendelse med påminnelse')}${tog(G.contacts !== false, 'data-p24="gtog" data-k="contacts"', 'Hent bursdager fra Google-kontakter', 'Fra kontaktlisten din')}
      <div class="p24-row8"><button class="p24-b lab m-grow" data-p24="gsync" ${BD.busy === 'g' ? 'disabled' : ''}>${BD.busy === 'g' ? 'Synker …' : '↻ Synk nå'}</button><button class="p24-b" data-p24="glogout">Logg ut</button></div>`
    : `<button class="p24-glog" data-p24="glogin" ${BD.local ? 'disabled' : ''}>${GSVG}Logg inn med Google</button>${G.configured === false ? '<span class="p24-mut">Google-klienten er ikke satt opp. Admin legger den inn under Innstillinger → Tilkoblinger → Google Kalender.</span>' : ''}`}${G.error ? `<span class="p24-mut" style="color:var(--pp-lab)">${esc(G.error)}</span>` : ''}
    ${haOk ? `    <i class="p24-hr"></i>
    <div class="p24-ch"><span class="p24-ci ha"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/></svg></span><span class="m-grow"><b>Home Assistant</b><small style="color:${hOn ? 'var(--pp-pos)' : 'var(--pp-mut)'}">${hOn ? `${esc(H.entityId)}${H.syncedAt ? ` · importert ${hm(H.syncedAt)}` : ''}` : 'Velg kalender og importer'}</small></span></div>
    ${ents.length ? `<span class="p24-fl">Kalender i Home Assistant</span><div class="p24-chips">${ents.map((e) => chip(H.entityId === e, `data-p24="haent" data-v="${esc(e)}"`, e).replace('p24-chip', 'p24-chip mono')).join('')}</div>` : isAdmin() || BD.local ? '' : '<span class="p24-mut">Bare administrator kan velge kalender i Home Assistant.</span>'}
    ${hOn ? tog(H.twoWay !== false, 'data-p24="hatwo"', 'Synk to veier', 'Nye bursdager her legges også i Home Assistant') : ''}
    <button class="p24-b ink" data-p24="haimp" ${BD.busy === 'ha' || BD.local || !(hOn || ents.length) ? 'disabled' : ''}>${BD.busy === 'ha' ? 'Importerer …' : hOn ? '↻ Importer på nytt' : 'Importer fra Home Assistant'}</button>` : ''}</div>
    <span class="p24-note" style="padding:0 4px">Nye bursdager lagres som årlige heldagshendelser. Endringer i Google Kalender og Home Assistant hentes inn automatisk.</span></div>`;
}
/** Mer → Bursdager (Bursdager.dc.html, variant mobile med skjult tittel). */
export function bdView() {
  if (!BD.d) { if (!BD.err && !BD.busyL) { BD.busyL = true; bdLoad().then(draw).catch(() => {}).finally(() => { BD.busyL = false; }); } return BD.err ? `<div class="p24-card p24-mut">${esc(BD.err)}</div>` : '<div class="m-spin"></div>'; }
  const L0 = people(), q = BD.q.trim().toLowerCase(), F = q ? L0.filter((x) => String(x.name).toLowerCase().includes(q)) : L0;
  const h = L0[0], same = h ? L0.filter((x) => x.days === h.days) : [], nxt = h ? L0.filter((x) => x.days > h.days).slice(0, 2) : [];
  const party = h && h.days === 0 ? globalThis.P41?.bdParty?.(same.map((x) => x.name).join(' og ')) ?? '' : ''; // prompt 41: jenka-tog i toppkortet
  const hero = h ? `<button class="p24-bdhero${party ? ' p41-party' : ''}" data-p24="bdsel" data-id="${esc(h.id)}">${party}<span class="p24-bdk"><span>${h.days === 0 ? 'BURSDAG I DAG' : 'NESTE BURSDAG'}</span><span>${same.length > 1 ? '' : SRC[h.src]}</span></span>
      <span class="p24-bdm"><span style="min-width:0"><b class="p24-bdn">${esc(same.map((x) => x.name).join(' og '))}</b><span class="p24-bds">${same.length === 1 && h.age != null ? `Fyller ${h.age} · ` : ''}${esc(dtx(h.x))}</span></span><span class="p24-bdbig"><b>${h.days === 0 ? 'I dag' : h.days}</b><small>${h.days === 0 ? '' : h.days === 1 ? 'dag igjen' : 'dager igjen'}</small></span></span>
      ${nxt.length ? `<span class="p24-bdmore">Deretter: ${esc(nxt.map((x) => `${x.name} ${x.x.getDate()}. ${MS[x.x.getMonth()]}`).join(' · '))}</span>` : ''}</button>` : '';
  const G = [], yr = new Date().getFullYear(), soon = F.filter((x) => x.days <= 30);
  if (soon.length) G.push({ t: 'NESTE 30 DAGER', items: soon });
  for (const x of F.filter((y) => y.days > 30)) { const k = MN[x.x.getMonth()].toUpperCase() + (x.x.getFullYear() !== yr ? ` ${x.x.getFullYear()}` : ''); let g = G.find((z) => z.t === k); if (!g) G.push(g = { t: k, items: [] }); g.items.push(x); }
  return `<div class="p24-bd">${hero}
    <div class="p24-bdq"><label class="p24-ssf"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg><input id="p24-bdq" data-p24in="bdq" type="search" value="${esc(BD.q)}" placeholder="Søk etter navn" autocomplete="off" aria-label="Søk etter navn"></label><button class="p24-add" data-p24="bdadd">${BD.add ? 'Lukk' : '+ Legg til'}</button></div>
    ${BD.add ? addCard() : ''}
    ${!F.length ? `<div class="p24-card p24-mut">${L0.length ? 'Ingen treff.' : 'Ingen bursdager ennå. Trykk «+ Legg til», eller koble til Google Kalender eller Home Assistant i Innstillinger → Tilkoblinger → Kalender og gjøremål.'}</div>` : ''}
    ${G.map((g) => `<div class="p24-bdg"><span class="p24-lab"><span>${esc(g.t)}</span><span class="p24-c">${g.items.length}</span></span><div class="p24-card p24-bdl">${g.items.map(bdRow).join('')}</div></div>`).join('')}
    </div>`; // prompt 41: Kalendere er fjernet fra siden (oppsettet ligger i Innstillinger → Kalendere)
}
/** Hjem-widgeten «BURSDAGER · NESTE» (h9): de tre neste og «alle ›». */
export function bdWidget() {
  if (!BD.d) return '';
  const L0 = people().slice(0, 3);
  return `<a class="pp-card p24-bdwid" href="#/bd"><span class="pp-row"><span class="pp-lab">BURSDAGER · ${L0[0]?.days === 0 ? 'I DAG' : 'NESTE'}</span><span class="pp-mut" style="font-size:12px">alle ›</span></span>
    ${L0.map((x) => `<span class="p24-bwr">${bav(x, 30)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(x.name)}</b><span class="pp-mut">${x.x.getDate()}. ${MS[x.x.getMonth()]}${x.age != null ? ` · fyller ${x.age}` : ''}</span></span><b class="p24-bww${x.days <= 7 ? ' soon' : ''}">${when(x.days)}</b></span>`).join('') || '<span class="pp-mut">Ingen bursdager ennå · trykk for å legge til</span>'}</a>`;
}
async function bdWrite(fn, okMsg) {
  try { await fn(); await bdLoad(true); if (okMsg) flash(okMsg); } catch (e) { flash(e.status === 404 ? 'Serveren støtter ikke dette ennå' : e.message); }
  draw();
}
async function bdSave() {
  const f = BD.f ?? f0(), name = f.name.trim();
  if (!name) return flash('Skriv inn navn');
  const body = { name, month: +f.month, day: +f.day, year: /^\d{4}$/.test(f.year) ? +f.year : null, relation: f.relation, reminderDays: f.reminderDays, saveTo: f.saveTo };
  BD.busy = 'save'; draw();
  if (BD.local) {
    const items = localGet(), it = { id: BD.editId ?? `l${Date.now()}`, ...body, source: 'local' };
    localPut(BD.editId ? items.map((x) => (x.id === BD.editId ? { ...x, ...it } : x)) : [...items, it]);
    BD.busy = ''; BD.add = false; BD.editId = null; BD.f = null; BD.q = '';
    return bdWrite(async () => {}, `${name} er lagret`);
  }
  const id = BD.editId;
  await bdWrite(() => (id ? hlApi(`/birthdays/${encodeURIComponent(id)}`, { method: 'PATCH', json: body }) : hlApi('/birthdays', { method: 'POST', json: body })),
    `${name}${f.saveTo === 'google' ? ' er lagt i Google Kalender' : f.saveTo === 'ha' ? ' er lagt i Home Assistant' : ' er lagret'}`);
  BD.busy = ''; BD.add = false; BD.editId = null; BD.f = null; BD.q = ''; draw();
}
let armT = null;

/* ---------- Hendelser (fra bind24 i mobile-profiler.js) ---------- */
export function bdInput(k, t) {
    if (k === 'bdq') { BD.q = t.value; draw(); return true; }
    if (k === 'bdf') { BD.f[t.dataset.k] = t.dataset.k === 'year' ? t.value.replace(/\D/g, '').slice(0, 4) : t.value; return true; }
  return false;
}
export function bdChange(t) {
  if (t.dataset?.p24in === 'bdf' && t.tagName === 'SELECT') { BD.f[t.dataset.k] = t.value; return true; }
  return false;
}
export async function bdSubmit(fm) {
  if (fm === 'bdsave') { await bdSave(); return true; }
  return false;
}
export async function bdClick(k, x, e) {
  switch (k) {
    // Bursdager
    case 'bdadd': BD.add = !BD.add; BD.editId = null; BD.f = f0(); draw(); if (BD.add) setTimeout(() => document.querySelector('[data-p24in="bdf"][data-k="name"]')?.focus(), 30); return true;
    case 'bdx': BD.add = false; BD.editId = null; draw(); return true;
    case 'bdrel': BD.f.relation = x.dataset.v; draw(); return true;
    case 'bdrem': BD.f.reminderDays = x.dataset.v === '' ? null : +x.dataset.v; draw(); return true;
    case 'bddest': BD.f.saveTo = x.dataset.v; draw(); return true;
    case 'bdsel': BD.sel = BD.sel === x.dataset.id ? null : x.dataset.id; BD.delArm = null; haptic('tab'); draw(); return true;
    case 'bdedit': { const p = people().find((y) => String(y.id) === x.dataset.id); if (!p) return true; BD.add = true; BD.editId = p.id; BD.f = { name: p.name, day: String(p.D), month: String(p.M), year: p.year ? String(p.year) : '', relation: p.rel, reminderDays: p.rem, saveTo: p.src }; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
    case 'bdprem': {
      const id = x.dataset.id, v = x.dataset.v === '' ? null : +x.dataset.v;
      if (BD.local) { localPut(localGet().map((y) => (String(y.id) === id ? { ...y, reminderDays: v } : y))); await bdWrite(async () => {}); return true; }
      await bdWrite(() => hlApi(`/birthdays/${encodeURIComponent(id)}`, { method: 'PATCH', json: { reminderDays: v } })); return true;
    }
    case 'bddel': {
      const id = x.dataset.id, p = people().find((y) => String(y.id) === id);
      if (BD.delArm !== id) { BD.delArm = id; clearTimeout(armT); armT = setTimeout(() => { BD.delArm = null; draw(); }, 2500); draw(); return true; }
      BD.delArm = null; BD.sel = null;
      if (BD.local) { localPut(localGet().filter((y) => String(y.id) !== id)); await bdWrite(async () => {}, `${p?.name ?? 'Bursdagen'} er slettet`); return true; }
      await bdWrite(() => hlApi(`/birthdays/${encodeURIComponent(id)}`, { method: 'DELETE' }), `${p?.name ?? 'Bursdagen'} er slettet`); return true;
    }
    case 'glogin': {
      if (BD.d?.google?.configured === false) { flash('Admin må legge inn Google-klienten under Innstillinger → Tilkoblinger'); return true; }
      const ret = `${location.origin}/finans/#/${m.screen === 'set' ? 'set/kal' : 'bd'}`;
      try { const r = await hlApi('/birthdays/google/start', { method: 'POST', json: { return: ret } }); location.href = r.url; }
      catch { location.href = `/api/birthdays/google/auth?return=${encodeURIComponent(ret)}`; }
      return true;
    }
    // Prompt 35: velg flere kalendere (calendarIds/cals), minst én. calendarId = den første (eldre server).
    case 'gcal': { const G = BD.d?.google ?? {}, v = x.dataset.v, L = gSel(G), nx = L.includes(v) ? L.filter((y) => y !== v) : [...L, v], ids = nx.length ? nx : L; haptic('tab'); await bdWrite(() => hlApi('/birthdays/google', { method: 'PUT', json: { calendarId: ids[0], calendarIds: ids, cals: ids, writeNew: G.writeNew !== false, contacts: G.contacts !== false } })); return true; }
    case 'gtog': { const G = BD.d?.google ?? {}, kk = x.dataset.k, body = { calendarId: G.calendarId, calendarIds: gSel(G), writeNew: G.writeNew !== false, contacts: G.contacts !== false }; body[kk] = !body[kk]; await bdWrite(() => hlApi('/birthdays/google', { method: 'PUT', json: body })); return true; }
    case 'gsync': BD.busy = 'g'; draw(); await bdWrite(() => hlApi('/birthdays/google/sync', { method: 'POST' }), 'Synket med Google Kalender'); BD.busy = ''; draw(); return true;
    case 'glogout': BD.cals = null; await bdWrite(() => hlApi('/birthdays/google', { method: 'DELETE' }), 'Logget ut av Google'); return true;
    case 'haent': await bdWrite(() => hlApi('/birthdays/ha', { method: 'PUT', json: { entityId: x.dataset.v, twoWay: BD.d?.ha?.twoWay !== false } })); return true;
    case 'hatwo': await bdWrite(() => hlApi('/birthdays/ha', { method: 'PUT', json: { entityId: BD.d?.ha?.entityId, twoWay: !(BD.d?.ha?.twoWay !== false) } })); return true;
    case 'haimp': {
      BD.busy = 'ha'; draw();
      try { const r = await hlApi('/birthdays/ha/import', { method: 'POST' }); await bdLoad(true); const n = r?.added ?? r?.imported ?? r?.count; flash(n != null ? (n ? `${n} bursdager importert fra ${BD.d?.ha?.entityId ?? 'Home Assistant'}` : 'Ingen nye bursdager') : 'Importert fra Home Assistant'); } catch (err) { flash(err.message); }
      BD.busy = ''; draw(); return true;
    }
    default: return false;
  }
}

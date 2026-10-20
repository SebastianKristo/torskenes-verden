// Prompt 37 (PWA37): Gjøremål (tidligere Huskeliste) i mobilappen. Fasit: design_handoff_homelab/prompts/prompt-37-pakke/
//  design/Huskeliste.dc.html (ed, lsv, lists(), shInfo, gRun/gParse/gAsk, tips, geo) og Mobil Papir App.dc.html (navVis, hk.b, fab.b).
//  1. Ingen fanelinje på siden: «Ny oppgave …» og den runde ✦-knappen ligger nederst (over tastaturet når det er oppe).
//  2. Detaljark for en oppgave (dato, tid, viktig, gjenta, tidlig påminnelse, sted, liste, ansvarlig, prioritet, flagg,
//     tagger, deloppgaver, ✦ Del opp, ✦ Glimt foreslår). Alt lagres med en gang.
//  3. Private og delte lister: chips med avatarer, infokort og listeark (navn, farge, DEL MED, forlat/slett).
//  4. Glimt i ✦-knappen (11 funksjoner): tolkning, lim inn, bilde, matplan → Handel, del opp, sortere, slå sammen,
//     forfalte, butikk-påminnelse, pakkeliste fra kalenderen og spørsmål. Arkene skjuler dokken og knappen (huske-sheet).
// API (kontrakt 37): /api/tasks med {n|title, notes, l|list, due, time, urgent, rep, early, prio, flag, tags, who, subs, place, by},
// /api/tasks/lists (+ /:id/leave), POST /api/tasks/glimt {q, list?, image?} → {kind, text, items, undo:{token}},
// POST /api/tasks/glimt/undo {token}, POST /api/tasks/:id/split. Alt tåler 404: da tolkes og lagres det her (eldre server).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { HK, tasksLoad, isArch, archLoad37, archOf37, saveLocal37 } from './mobile-p17.js';
import * as P22 from './mobile-p22.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayIso = (n = 0) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const svg = (d, s = 16, w = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const X_IC = svg('M6 6l12 12M18 6L6 18', 15, 2.8);
const first = (s) => String(s ?? '').split(/\s+/)[0];
const AVC = ['#2b5d8a', '#b23a2a', '#2f6b45', '#a8661a', '#7a5ad6', '#c2477a', '#3d7f8a'];
const colOf = (id, c) => c || AVC[[...String(id ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVC.length];
export const LCOL = ['#b23a2a', '#2f6b45', '#a8661a', '#2b5d8a', '#7a5ad6', '#c2477a', '#3d7f8a', '#1b1a17'];
const meId = () => String(m.me?.id ?? '');

/* =====================================================================
   Data: normalisering (gamle og nye feltnavn) + lokale ekstrafelt for eldre server
   ===================================================================== */
// Felt en eldre server ikke lagrer (tid, viktig, gjenta, tagger …) huskes på enheten til serveren kan dem.
const XK = 'p37_task_extra';
const EXTRA = ['time', 'urgent', 'rep', 'early', 'prio', 'flag', 'tags', 'subs', 'place', 'placeName', 'after', 'mentions'];
let XT = lsGet(XK, {}) || {};
const dueOf = (v) => (v == null || v === '' ? null : typeof v === 'number' ? iso(new Date(v)) : String(v).slice(0, 10));
export function T(x) {
  const ex = XT[String(x.id)] ?? {};
  const pick = (k, d) => (x[k] !== undefined && x[k] !== null ? x[k] : ex[k] !== undefined ? ex[k] : d);
  return {
    ...x, raw: x, title: x.title ?? x.n ?? '', list: x.list ?? x.l ?? null, notes: x.notes ?? x.note ?? '', due: dueOf(x.due),
    time: pick('time', null), urgent: !!pick('urgent', false), rep: pick('rep', 'aldri') || 'aldri', early: pick('early', 'ingen') || 'ingen',
    prio: +pick('prio', 0) || 0, flag: !!pick('flag', false), tags: Array.isArray(pick('tags', [])) ? pick('tags', []) : [], subs: Array.isArray(pick('subs', [])) ? pick('subs', []) : [],
    place: pick('place', '') || '', placeName: pick('placeName', x.place_name ?? '') || '', after: pick('after', x.afterId ?? x.after_id ?? null), who: x.who ?? x.assignee ?? null, by: x.by ?? x.createdBy ?? null, done: !!x.done, doneAt: x.doneAt ?? null,
  };
}
const items = () => (HK.d?.items ?? []).map(T);
const byId = (id) => { const x = (HK.d?.items ?? []).find((y) => String(y.id) === String(id)); return x ? T(x) : null; };
/** Lister med medlemmer [{id, name, color, role}] (nye: members[{userId…}], eldre: members uten eier + owner). */
export function lists() {
  return (HK.d?.lists ?? []).map((l) => {
    const owner = String(l.ownerId ?? l.owner ?? ''), raw = Array.isArray(l.members) ? l.members : [];
    let mem = raw.map((p) => (typeof p === 'object' ? { id: String(p.userId ?? p.id), name: p.name ?? p.username ?? '', color: p.color ?? null, role: p.role ?? (String(p.userId ?? p.id) === owner ? 'owner' : 'member') } : { id: String(p), name: peopleName(p), color: null, role: 'member' }));
    if (owner && !mem.some((p) => p.id === owner)) mem = [{ id: owner, name: l.ownerName ?? peopleName(owner), color: null, role: 'owner' }, ...mem];
    if (!mem.length && meId()) mem = [{ id: meId(), name: m.me?.name ?? 'Meg', role: 'owner' }];
    const shared = l.private === true ? false : mem.length > 1 || (l.shared === true && l.private !== true);
    return { id: String(l.id), name: l.name, color: l.color || '#1b1a17', owner: owner || meId(), mine: l.mine ?? (owner ? owner === meId() : true), members: mem, shared };
  });
}
const people = () => (HK.d?.members ?? []).map((p) => ({ id: String(p.userId ?? p.id), name: p.name ?? p.displayName ?? p.username ?? '', color: p.color ?? null, avatarUrl: p.avatarUrl ?? null }));
function peopleName(id) { const p = (HK.d?.members ?? []).find((x) => String(x.userId ?? x.id) === String(id)); return p?.name ?? p?.username ?? (String(id) === meId() ? m.me?.name ?? 'Meg' : String(id ?? '')); }
const listOf = (id) => lists().find((l) => l.id === String(id)) ?? { id: String(id ?? ''), name: '', color: '#1b1a17', members: [], shared: false, owner: meId(), mine: true };
const whoName = (id) => (id ? first(peopleName(id)) : '');

/* ---------- Skriving ---------- */
function extraSave(id, patch) {
  const k = String(id), cur = XT[k] ?? {};
  for (const f of EXTRA) if (f in patch) cur[f] = patch[f];
  XT[k] = cur; lsSet(XK, XT);
}
const toServer = (p) => {
  const o = { ...p };
  if ('title' in p) o.n = p.title;
  if ('notes' in p) o.note = p.notes;
  if ('list' in p) o.l = p.list;
  if ('who' in p) o.assignee = p.who;
  return o;
};
function localPatch(id, patch) {
  HK.d.items = HK.d.items.map((x) => {
    if (String(x.id) !== String(id)) return x;
    const n = { ...x, ...patch };
    if ('title' in patch) { n.title = patch.title; n.n = patch.title; }
    if ('notes' in patch) { n.note = patch.notes; n.notes = patch.notes; }
    if ('list' in patch) { n.list = patch.list; n.l = patch.list; }
    if ('who' in patch) { n.assignee = patch.who; n.who = patch.who; }
    return n;
  });
}
export async function patchTask(id, patch, redraw = true) {
  if (!HK.d) return null;
  extraSave(id, patch); localPatch(id, patch); saveLocal37(); if (redraw) draw();
  if (HK.local) return null;
  try { return await hlApi(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: toServer(patch) }); }
  catch (e) { flash(e.message, 'err'); return null; }
}
async function addTask(t) {
  const body = toServer({ title: t.title, list: t.list, due: t.due ?? null, who: t.who ?? null, notes: t.notes ?? '', ...Object.fromEntries(EXTRA.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])), by: meId() || undefined });
  if (HK.local) { const it = { id: `l${Date.now()}${Math.random().toString(36).slice(2, 5)}`, ...body, done: false, createdAt: Date.now() }; HK.d.items = [it, ...HK.d.items]; extraSave(it.id, t); saveLocal37(); return it; }
  const r = await hlApi('/tasks', { method: 'POST', json: body });
  const it = r?.item ?? r;
  if (it?.id != null) { extraSave(it.id, t); HK.d.items = [it, ...HK.d.items.filter((x) => String(x.id) !== String(it.id))]; }
  return it;
}
async function delTask(id) {
  HK.d.items = HK.d.items.filter((x) => String(x.id) !== String(id)); saveLocal37(); delete XT[String(id)]; lsSet(XK, XT);
  if (!HK.local) await hlApi(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => flash(e.message, 'err'));
}
const REP_N = { daglig: 1, ukedager: 1, ukentlig: 7, annenhver: 14 };
function nextDue(due, rep) {
  const d = new Date(`${due ?? dayIso(0)}T12:00`);
  if (rep === 'maanedlig') d.setMonth(d.getMonth() + 1);
  else if (rep === 'aarlig') d.setFullYear(d.getFullYear() + 1);
  else { d.setDate(d.getDate() + (REP_N[rep] ?? 1)); if (rep === 'ukedager') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); }
  return iso(d);
}
async function tick(id) {
  const x = byId(id); if (!x) return;
  const on = !x.done; vib(8); haptic(on ? 'ok' : 'tap');
  const r = await patchTask(id, { done: on, doneAt: on ? Date.now() : null });
  // Gjentagende oppgave: neste forekomst. Ny server lager den selv (svaret har next/rep); eldre server: her.
  if (on && x.rep && x.rep !== 'aldri') {
    const nx = r?.next ?? r?.created ?? null;
    if (nx) HK.d.items = [nx, ...HK.d.items];
    else if (!(r?.item && 'rep' in r.item)) await addTask({ ...x, done: false, due: nextDue(x.due, x.rep), subs: x.subs.map((s) => ({ ...s, done: false })) }).catch(() => {});
    else { HK.t = 0; await tasksLoad(true).catch(() => {}); }
    draw();
  }
}

/* =====================================================================
   Tilstand og hjelpere for visning
   ===================================================================== */
export const G7 = { ed: null, ls: null, gl: false, gq: '', gBusy: '', gAns: null, tagV: '', subV: '', split: false, geoArm: !!lsGet('p37_geo', false), geoShow: false, geoT: null, undoT: null };
export const sheetOpen = () => m.screen === 'huske' && !!(G7.ed || G7.ls || G7.gl);
const t0 = () => dayIso(0);
function dueLbl(due) {
  if (!due) return ['', ''];
  const n = Math.round((new Date(`${due}T12:00`) - new Date(`${t0()}T12:00`)) / 864e5);
  return n < 0 ? [`Forfalt ${-n} d`, 'lab'] : n === 0 ? ['I dag', 'lab'] : n === 1 ? ['I morgen', 'ink'] : [new Date(`${due}T12:00`).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }), 'mut'];
}
const visible = () => { const L = lists(), ids = new Set(L.map((l) => l.id)); return items().filter((x) => !x.list || ids.has(String(x.list)) || !L.length); };
const avs = (mem, s = 18) => `<span class="p37-avs">${mem.slice(0, 3).map((p, i) => `<i style="width:${s}px;height:${s}px;background:${colOf(p.id, p.color)};margin-left:${i ? -6 : 0}px">${esc(String(p.name || '?').slice(0, 1).toUpperCase())}</i>`).join('')}</span>`;
const PR = ['', '!', '!!', '!!!'];
function row(x, i, all) {
  const l = listOf(x.list), [dt, dc] = dueLbl(x.due), sd = x.subs.length, sdd = x.subs.filter((u) => u.done).length, ar = isArch(x.raw);
  const meta = [dt && x.time ? `${dt} ${x.time}` : dt, x.rep && x.rep !== 'aldri' ? '↻' : '', x.urgent ? '⏰' : '', sd ? `${sdd}/${sd}` : '', whoName(x.who), x.placeName || '', globalThis.P40?.afterLbl?.(x, items) ?? '', all ? l.name : '', ...x.tags.map((g) => `#${g}`)].filter(Boolean).join(' · ');
  return `<div class="p37-tr${x.done ? ' done' : ''}${i ? '' : ' first'}"><button type="button" class="p37-ck" data-p37="tick" data-id="${esc(x.id)}" style="--c:${esc(l.color)}" aria-label="${x.done ? 'Angre' : 'Fullfør'} ${esc(x.title)}">${x.done ? '✓' : ''}</button>
    <button type="button" class="p37-tt" data-p37="open" data-id="${esc(x.id)}"><span class="p37-tn">${x.flag ? '<span class="p37-flag" aria-label="Flagget">⚑</span>' : ''}${x.prio ? `<span class="p37-pr">${PR[x.prio]}</span>` : ''}<b>${esc(x.title)}</b></span>${meta ? `<small class="${!x.done && dc === 'lab' ? 'lab' : ''}">${esc(meta)}</small>` : ''}</button>
    ${x.done && !ar ? `<button type="button" class="p37-ib" data-p17="tarch" data-id="${esc(x.id)}" aria-label="Arkiver ${esc(x.title)}">${svg('M3 5h18v4H3zM5 9v10h14V9M10 13h4', 16, 2)}</button>` : ''}${ar ? `<button type="button" class="p37-rs" data-p17="trest" data-id="${esc(x.id)}">↺ Gjenopprett</button>` : ''}
    <button type="button" class="p37-ib x" data-p37="rm" data-id="${esc(x.id)}" aria-label="Slett ${esc(x.title)}">×</button></div>`;
}

/* ---------- Glimt-tips i listen ---------- */
const keyN = (x) => x.title.toLowerCase().replace(/[^a-zæøå0-9]/g, '');
function tips(live) {
  const T0 = t0(), out = [], L = lists(), byName = (n) => L.find((l) => l.name.toLowerCase() === n);
  const grp = {};
  live.filter((x) => !x.done).forEach((x) => { const k = `${x.list}|${keyN(x)}`; (grp[k] = grp[k] || []).push(x); });
  const dup = Object.values(grp).find((a) => a.length > 1);
  if (dup) out.push({ k: 'dup', p: 'M8 7h11v11H8zM5 4h11v2M5 4v11h2', c: '#7a5ad6', t: `${dup.length}× «${dup[0].title}» i ${listOf(dup[0].list).name}`, s: 'Glimt fant like gjøremål.', l1: 'Slå sammen', a1: 'merge', ids: dup.map((x) => x.id) });
  const od = live.filter((x) => !x.done && x.due && x.due < T0);
  if (od.length >= 2) out.push({ k: 'od', p: 'M12 8v4l3 2M3 12a9 9 0 1 0 9-9', c: '#b23a2a', t: `${od.length} gjøremål er forfalt`, s: 'Flytt dem til i morgen, eller arkiver.', l1: 'Flytt til i morgen', a1: 'odmove', l2: 'Arkiver', a2: 'odarch' });
  const hd = byName('handel'), hb = hd ? live.filter((x) => !x.done && String(x.list) === hd.id) : [];
  if (hb.length) out.push({ k: 'geo', p: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z', c: '#2f6b45', t: G7.geoArm ? 'Stedspåminnelse er på' : 'Påminn meg ved butikken', s: G7.geoArm ? `Glimt varsler når du er ved en matbutikk (${hb.length} i Handel).` : `${hb.length} ${hb.length === 1 ? 'vare' : 'varer'} i Handel. Glimt kan varsle når du er ved Kiwi, Rema eller Coop.`, l1: G7.geoArm ? 'Test varsel' : 'Slå på', a1: G7.geoArm ? 'geotest' : 'geoon', ...(G7.geoArm ? { l2: 'Slå av', a2: 'geooff' } : {}) });
  const ht = calTrip();
  if (ht) out.push({ k: 'trip', p: 'M3 21h18M5 21V10l7-6 7 6v11M10 21v-5h4v5', c: '#a8661a', t: `${ht.title} om ${ht.days} ${ht.days === 1 ? 'dag' : 'dager'}`, s: 'Fra kalenderen. Lage pakkeliste og huske brøyting?', l1: 'Lag pakkeliste', a1: 'pack', l2: 'Ikke nå', a2: 'packno', l3: 'Ikke foreslå slike', a3: 'packoff', ev: ht.key });
  return out;
}
// Prompt 39 (claude-code-gjoremal-glimt-forslag.md): pakkeliste bare for reiser – minst 2 dager eller reise-ord, borte fra
// hjemme, om 1–14 dager og uten pakkeliste fra før. Aldri for bursdager, merkedager, timer, skole, møter eller abonnementer.
// «Ikke nå» skjuler forslaget for den hendelsen (huske_tip_dismiss), «Ikke foreslå slike» slår av typen (huske_tip_off.pack).
const TRAVEL = /\b(hytt\w*|hafjell|tur|reise|ferie|fly|tog|hotell|camping|leir)\b|tur til|fly til/i;
const NO_PACK = /bursdag|fødselsdag|\d+\s*år\b|jubileum|merkedag|bryllupsdag|lege|frisør|tannlege|time hos|forelesning|skole|prøve|eksamen|frist|innlevering|møte|middag|abonnement|prøveperiode|trekk/i;
export const packOff = () => !!(lsGet('huske_tip_off', {}) || {}).pack;
function calTrip() {
  if (packOff()) return null;
  let ev = [];
  try { ev = (window.__p37cal ?? []); } catch {}
  const seen = { ...(lsGet('p37_tip_seen', {}) || {}), ...(lsGet('huske_tip_dismiss', {}) || {}) }, now = Date.now();
  const packed = new Set((HK.d?.items ?? []).filter((x) => (x.tags ?? []).includes('pakkeliste')).map((x) => String(x.packFor ?? '')).filter(Boolean));
  for (const e of ev) {
    const title = String(e.title ?? e.summary ?? ''), st = Date.parse(e.start ?? e.date ?? ''), en = Date.parse(e.end ?? '') || st;
    const cal = String(e.cal ?? e.calendar ?? e.calKey ?? '').toLowerCase(), kind = String(e.kind ?? e.type ?? '').toLowerCase(), loc = String(e.location ?? e.loc ?? '');
    if (!Number.isFinite(st) || cal === 'b' || /bursdag|birthday|holiday|helligdag/.test(`${cal} ${kind}`) || NO_PACK.test(title)) continue;
    const len = Math.max(1, Math.round((en - st) / 864e5) + (e.allDay ? 0 : 1)), home = /oslo|hjemme|^$/i.test(loc.trim());
    if (!(len >= 2 || TRAVEL.test(title))) continue;
    if (loc && home && !TRAVEL.test(title)) continue;
    const days = Math.round((st - now) / 864e5), key = `${title}|${String(e.start ?? e.date).slice(0, 10)}`;
    if (days < 1 || days > 14 || seen[key] || packed.has(key)) continue;
    return { title, days, key, date: String(e.start ?? e.date).slice(0, 10) };
  }
  return null;
}
async function calLoad() {
  if (window.__p37calT && Date.now() - window.__p37calT < 10 * 60e3) return;
  window.__p37calT = Date.now();
  try {
    const K = (await import('./mobile-kal.js')).K;
    if (Array.isArray(K?.ev)) { window.__p37cal = K.ev; return; }
  } catch {}
  try { const r = await hlApi(`/kalender/events?from=${dayIso(0)}&to=${dayIso(22)}`); window.__p37cal = Array.isArray(r) ? r : r?.events ?? r?.items ?? []; } catch { window.__p37cal = []; }
}

/* =====================================================================
   Siden
   ===================================================================== */
function listChips(L, GL) {
  const live = visible().filter((x) => !isArch(x.raw));
  const chip = (k, n, c, cnt, l) => { const on = String(HK.cur) === k; return `<button type="button" class="p37-lc${on ? ' on' : ''}" data-p37="list" data-k="${esc(k)}" aria-pressed="${on}">${c ? `<i style="background:${esc(c)}"></i>` : ''}${esc(n)}${l?.shared ? avs(l.members) : ''}<span>${cnt}</span></button>`; };
  const gl = GL.length ? `<button type="button" class="p37-lc p41-glc${HK.cur === 'glimt' ? ' on' : ''}" data-p37="list" data-k="glimt" aria-pressed="${HK.cur === 'glimt'}"><i class="p41-gdot"></i>Laget med Glimt<span>${GL.length}</span></button>` : '';
  return `<div class="p37-chips" role="tablist">${chip('alle', 'Alle', '', live.filter((x) => !x.done).length)}${L.map((l) => chip(l.id, l.name, l.color, live.filter((x) => !x.done && String(x.list) === l.id).length, l)).join('')}${gl}${chip('arkiv', 'Arkivert', '', archOf37().length)}<button type="button" class="p37-lc new" data-p37="newlist">+ Ny liste</button></div>`;
}
export function huskeView37() {
  if (!HK.d) return '<div class="m-spin"></div>';
  if (!window.__p37calT) calLoad().then(() => { if (m.screen === 'huske') draw(); }).catch(() => {});
  const L = lists(), all = HK.cur === 'alle', AR = HK.cur === 'arkiv';
  // Prompt 41: «Laget med Glimt» (originalbeskjedene) som egen fane i liste-raden.
  const GL = globalThis.P41?.glimtSrc?.(visible().map((x) => x.raw ?? x)) ?? [];
  if (HK.cur === 'glimt' && GL.length) return `<div class="p37-hk">${listChips(L, GL)}${globalThis.P41.huskeJobRows()}${globalThis.P41.glimtView(GL, (x) => row(T(x), 0, true))}</div>`;
  if (HK.cur === 'glimt') HK.cur = 'alle';
  if (!all && !AR && !L.some((l) => l.id === String(HK.cur))) HK.cur = 'alle';
  if (AR && !HK.archT) archLoad37().then(draw).catch(() => {});
  const live = visible().filter((x) => !isArch(x.raw)), arch = AR ? archOf37().map(T) : [];
  const inL = AR ? arch : live.filter((x) => all || String(x.list) === String(HK.cur));
  const curL = all || AR ? null : listOf(HK.cur), curN = all ? 'Alle' : AR ? 'Arkivert' : curL.name;
  const chip = (k, n, c, cnt, l) => { const on = String(HK.cur) === k; return `<button type="button" class="p37-lc${on ? ' on' : ''}" data-p37="list" data-k="${esc(k)}" aria-pressed="${on}">${c ? `<i style="background:${esc(c)}"></i>` : ''}${esc(n)}${l?.shared ? avs(l.members) : ''}<span>${cnt}</span></button>`; };
  const chips = listChips(L, GL);
  let info = '';
  if (curL) {
    const oth = curL.members.filter((p) => p.id !== meId()).map((p) => first(p.name));
    const t = oth.length ? `Delt med ${oth.length > 1 ? `${oth.slice(0, -1).join(', ')} og ${oth[oth.length - 1]}` : oth[0]}` : 'Bare du ser denne listen';
    info = `<div class="p37-info">${svg('M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6', 18, 2)}<span class="m-grow"><b>${esc(t)}</b><small>${oth.length ? 'Alle i listen kan legge til, endre og krysse av.' : 'Privat. Del den for å gjøre den felles.'}</small></span><button type="button" data-p37="lsopen" data-k="${esc(curL.id)}">${oth.length ? 'Administrer' : 'Del'}</button></div>`;
  }
  const T0 = t0();
  const od = inL.filter((x) => !x.done && x.due && x.due <= T0), later = inL.filter((x) => !x.done && !(x.due && x.due <= T0)).sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999'))), dn = inL.filter((x) => x.done);
  const groups = AR ? (arch.length ? [[`ARKIVERT · ${arch.length}`, 'mut', arch, 'Tøm arkivet', 'tarchclr']] : []) : [['I DAG OG FORFALT', 'lab', od], ['SENERE', 'mut', later], ['FERDIG', 'pos', dn.slice(0, 12), 'Arkiver alle', 'tarchall']].filter((g) => g[2].length);
  const tp = AR ? [] : tips(live);
  const dueC = `<div class="p37-chips p37-wr">${[[0, 'I dag'], [1, 'I morgen'], [7, 'Neste uke'], [null, 'Uten dato']].map(([v, n]) => `<button type="button" class="p37-sc${HK.due === v ? ' on' : ''}" data-p17="tdue" data-v="${v ?? ''}" aria-pressed="${HK.due === v}">${n}</button>`).join('')}</div>`;
  return `<div class="p37-hk">${chips}${info}
    ${tp.map((x) => `<div class="p37-tip"><span class="p37-tic" style="--c:${x.c}">${svg(x.p, 16)}</span><span class="m-grow"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span><span class="p37-tb"><button type="button" class="ink" data-p37="tip" data-a="${x.a1}" data-ids="${esc((x.ids ?? []).join(','))}" data-ev="${esc(x.ev ?? '')}">${esc(x.l1)}</button>${x.l2 ? `<button type="button" data-p37="tip" data-a="${x.a2}" data-ev="${esc(x.ev ?? '')}">${esc(x.l2)}</button>` : ''}${x.l3 ? `<button type="button" data-p37="tip" data-a="${x.a3}" data-ev="${esc(x.ev ?? '')}">${esc(x.l3)}</button>` : ''}</span></div>`).join('')}
    ${AR ? '' : globalThis.P41?.huskeJobRows?.() ?? ''}${AR ? '' : dueC}
    ${HK.err ? `<div class="p37-card p37-mut">${esc(HK.err)}</div>` : ''}
    ${groups.map(([t, c, a, an, ak]) => `<div class="p37-gh"><span class="${c}">${t}</span>${an ? `<button type="button" data-p17="${ak}">${an}</button>` : ''}</div><div class="p37-card p37-rows">${a.map((x, i) => row(x, i, all || AR)).join('')}</div>`).join('')
      || `<div class="p37-empty">${AR ? 'Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager.' : `Ingen oppgaver i ${esc(curN)}.`}</div>`}
    ${P22.haSection()}
    ${HK.local ? '<span class="p37-foot">Lagres på denne enheten til serveren har Gjøremål.</span>' : '<span class="p37-foot">Gjøremål er private for deg. Delte lister ser alle som er med i listen.</span>'}</div>`;
}
const SPARK = (S = 22, busy = false) => `<span class="p37-spk${busy ? ' busy' : ''}" style="width:${S}px;height:${S}px"><i></i><b style="font-size:${Math.round(S * 0.5)}px">✦</b></span>`;
/** Bunnen av siden: «Ny oppgave …» og den runde Glimt-knappen. Skjult mens et ark er åpent (huske-sheet). */
export function huskeBottom() {
  if (sheetOpen() || String(HK.cur) === 'arkiv') return '';
  return `<form class="p37-dock" data-p37form="add" role="search"><input id="p37-tk" value="${esc(HK.nv)}" placeholder="Ny oppgave …" enterkeyhint="done" autocomplete="off" aria-label="Ny oppgave" data-p37in="nv"></form>
    <button type="button" class="p37-fab" data-p37="fab" aria-label="Glimt · skriv eller spør" title="Glimt · skriv eller spør"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.3 6.4 6.7.6-5.1 4.4 1.6 6.6L12 17l-5.5 3.5 1.6-6.6L3 9.5l6.7-.6z" fill="currentColor"/></svg></button>`;
}

/* =====================================================================
   Arkene: Detaljer, Liste og Glimt
   ===================================================================== */
const sw = (on) => `<span class="p37-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const ic = (d, c) => `<span class="p37-ri" style="--c:${c}">${svg(d, 16)}</span>`;
const sel = (k, cur, opts) => `<select data-p37in="${k}" aria-label="${k}">${opts.map(([v, n]) => `<option value="${v}"${String(cur) === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
const REP = [['aldri', 'Aldri'], ['daglig', 'Hver dag'], ['ukedager', 'Ukedager'], ['ukentlig', 'Hver uke'], ['annenhver', 'Annenhver uke'], ['maanedlig', 'Hver måned'], ['aarlig', 'Hvert år']];
const EARLY = [['ingen', 'Ingen'], ['5m', '5 min før'], ['15m', '15 min før'], ['30m', '30 min før'], ['1t', '1 time før'], ['1d', '1 dag før'], ['2d', '2 dager før'], ['1u', '1 uke før']];
const PLACE = [['', 'Av'], ['butikk', 'Ved matbutikk'], ['hjemme', 'Når jeg kommer hjem'], ['drar', 'Når jeg drar hjemmefra'], ['jobb', 'På jobb'], ['hytta', 'På hytta']];
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function edSheet() {
  const E = byId(G7.ed); if (!E) { G7.ed = null; return ''; }
  const L = lists(), l = listOf(E.list), sug = suggest(E);
  const whoO = [...l.members, { id: '', name: 'Ingen' }];
  const links = (E.notes.match(/https?:\/\/\S+/g) ?? []).length ? `<div class="p37-links">${linkify(E.notes.match(/https?:\/\/\S+/g).join(' '))}</div>` : '';
  return `<div class="p37-scrim" data-p37="edx"></div><div class="p37-sheet" role="dialog" aria-modal="true" aria-label="Detaljer"><span class="p37-grab"></span>
    <div class="p37-shh"><button type="button" class="p37-cx" data-p37="edx" aria-label="Lukk">${X_IC}</button><b>Detaljer</b><button type="button" class="p37-ok" data-p37="edx">Ferdig</button></div>
    <div class="p37-card p37-ec"><input id="p37-et" class="p37-ttl" value="${esc(E.title)}" placeholder="Tittel" data-p37in="title"><textarea id="p37-en" rows="2" placeholder="Notater og lenke" data-p37in="notes">${esc(E.notes)}</textarea>${links}</div>
    <span class="p37-lab">DATO OG TID</span>
    <div class="p37-card p37-grp">
      <div class="p37-r">${ic('M4 5h16v15H4zM4 10h16M9 3v4M15 3v4', '#b23a2a')}<span class="m-grow"><b>Dato</b>${E.due ? `<input type="date" class="p37-dt lab" value="${esc(E.due)}" data-p37in="due" aria-label="Dato">` : ''}</span><button type="button" class="p37-tg" data-p37="tgdate" role="switch" aria-checked="${!!E.due}" aria-label="Dato">${sw(!!E.due)}</button></div>
      <div class="p37-r">${ic('M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2', '#2b5d8a')}<span class="m-grow"><b>Tid</b>${E.time ? `<input type="time" class="p37-dt blue" value="${esc(E.time)}" data-p37in="time" aria-label="Tid">` : ''}</span><button type="button" class="p37-tg" data-p37="tgtime" role="switch" aria-checked="${!!E.time}" aria-label="Tid">${sw(!!E.time)}</button></div>
      <div class="p37-r">${ic('M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 10v3l2 1.5M5 4L2.5 6.5M19 4l2.5 2.5', '#c0562a')}<span class="m-grow"><b>Viktig</b></span><button type="button" class="p37-tg" data-p37="tgurg" role="switch" aria-checked="${E.urgent}" aria-label="Viktig">${sw(E.urgent)}</button></div></div>
    <span class="p37-hint">Viktige oppgaver ringer som en alarm, også i Fokus og stille-modus.</span>
    <div class="p37-card p37-grp">
      <label class="p37-r">${ic('M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', '#2f7a4f')}<b class="m-grow">Gjenta</b>${sel('rep', E.rep, REP)}</label>
      <label class="p37-r">${ic('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0', '#7a5ad6')}<b class="m-grow">Tidlig påminnelse</b>${sel('early', E.early, EARLY)}</label></div>
    <div class="p37-card p37-grp"><label class="p37-r">${ic('M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 7.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z', '#2f6b45')}<b class="m-grow">Påminn på sted</b>${sel('place', E.place, PLACE)}</label></div>
    ${sug ? `<div class="p37-sug"><span class="p37-sgk">✦</span><span class="m-grow"><b>Glimt foreslår</b><small>${esc(sug.t)}</small></span><button type="button" data-p37="usesug">Bruk</button></div>` : ''}
    <span class="p37-lab">ORGANISERING</span>
    <div class="p37-card p37-grp">
      <div class="p37-rc"><b>Liste</b><div class="p37-chips p37-wr">${L.map((x) => `<button type="button" class="p37-sc${x.id === String(E.list) ? ' on' : ''}" data-p37="setlist" data-k="${esc(x.id)}"><i style="background:${esc(x.color)}"></i>${esc(x.name)}</button>`).join('')}</div></div>
      <div class="p37-rc"><b>Ansvarlig</b><div class="p37-chips p37-wr">${whoO.map((p) => `<button type="button" class="p37-sc${String(E.who ?? '') === p.id ? ' on' : ''}" data-p37="setwho" data-k="${esc(p.id)}">${esc(p.id ? first(p.name) : 'Ingen')}</button>`).join('')}</div></div>
      <div class="p37-rc"><b>Prioritet</b><div class="p37-seg">${['Ingen', 'Lav', 'Middels', 'Høy'].map((n, i) => `<button type="button" class="${E.prio === i ? 'on' : ''}${i === 3 ? ' hi' : ''}" data-p37="prio" data-v="${i}" aria-pressed="${E.prio === i}">${n}</button>`).join('')}</div></div>
      <div class="p37-r"><span class="p37-fl">⚑</span><b class="m-grow">Flagg</b><button type="button" class="p37-tg" data-p37="tgflag" role="switch" aria-checked="${E.flag}" aria-label="Flagg">${sw(E.flag)}</button></div>
      <div class="p37-rc"><b>Tagger</b><div class="p37-chips p37-wr">${E.tags.map((g) => `<button type="button" class="p37-tag" data-p37="rmtag" data-k="${esc(g)}">#${esc(g)} ×</button>`).join('')}<form class="p37-tf" data-p37form="tag"><input id="p37-tag" value="${esc(G7.tagV)}" placeholder="# Legg til tagg" enterkeyhint="done" data-p37in="tagv" autocomplete="off"></form></div></div>
      <div class="p37-rc"><span class="p37-rh"><b>Deloppgaver</b><span class="p37-mono">${E.subs.length ? `${E.subs.filter((u) => u.done).length} / ${E.subs.length}` : '0'}</span></span>
        ${E.subs.map((u, i) => `<div class="p37-sub${u.done ? ' done' : ''}"><button type="button" class="p37-sck" data-p37="subtick" data-i="${i}" aria-label="Kryss av">${u.done ? '✓' : ''}</button><span class="m-grow">${esc(u.n)}</span><button type="button" class="p37-ib x" data-p37="subrm" data-i="${i}" aria-label="Fjern">×</button></div>`).join('')}
        <button type="button" class="p37-split" data-p37="split" ${G7.split ? 'disabled' : ''}>${G7.split ? 'Glimt tenker …' : '✦ Del opp med Glimt'}</button>
        <form class="p37-sf" data-p37form="sub"><span>+</span><input id="p37-sub" value="${esc(G7.subV)}" placeholder="Ny deloppgave" enterkeyhint="done" data-p37in="subv" autocomplete="off"></form></div></div>
    <button type="button" class="p37-del" data-p37="eddel">Slett oppgave</button></div>`;
}
function lsSheet() {
  const D = G7.ls; if (!D) return '';
  const own = !D.id || D.owner === meId(), ppl = people().length ? people() : [{ id: meId(), name: m.me?.name ?? 'Meg' }];
  return `<div class="p37-scrim" data-p37="lsx"></div><div class="p37-sheet" role="dialog" aria-modal="true" aria-label="${D.id ? 'Liste' : 'Ny liste'}"><span class="p37-grab"></span>
    <div class="p37-shh"><button type="button" class="p37-cx" data-p37="lsx" aria-label="Lukk">${X_IC}</button><b>${D.id ? 'Liste' : 'Ny liste'}</b><button type="button" class="p37-ok" data-p37="lssave" ${D.name.trim() && own ? '' : 'disabled'}>${D.id ? 'Lagre' : 'Opprett'}</button></div>
    <div class="p37-card p37-ec"><input id="p37-ln" class="p37-ttl" value="${esc(D.name)}" placeholder="Navn på listen" data-p37in="lname" ${own ? '' : 'readonly'}><div class="p37-cols">${LCOL.map((c) => `<button type="button" class="${D.color === c ? 'on' : ''}" style="background:${c}" data-p37="lcol" data-c="${c}" aria-label="Farge ${c}" ${own ? '' : 'disabled'}></button>`).join('')}</div></div>
    <span class="p37-lab">DEL MED</span>
    <div class="p37-card p37-grp">${ppl.map((u) => { const on = D.members.includes(u.id), me = u.id === meId(); return `<button type="button" class="p37-r p37-pr" data-p37="lmem" data-k="${esc(u.id)}" role="switch" aria-checked="${on}" ${me || !own ? 'aria-disabled="true"' : ''} style="opacity:${!me && !own ? 0.55 : 1}"><span class="p37-av" style="background:${colOf(u.id, u.color)}">${esc(String(u.name || '?').slice(0, 1).toUpperCase())}</span><b class="m-grow">${esc(me ? `${first(u.name)} (deg)` : first(u.name))}</b>${sw(on)}</button>`; }).join('')}</div>
    <span class="p37-hint">${D.members.length > 1 ? 'Delt liste: alle her ser og kan endre oppgavene.' : 'Privat liste: bare du ser den.'}${own ? '' : ' Bare eieren kan endre navn, farge og medlemmer.'}</span>
    ${D.id && !own ? '<button type="button" class="p37-del" data-p37="lsleave">Forlat listen</button>' : ''}
    ${D.id && own ? `<button type="button" class="p37-del" data-p37="lsdel">${G7.lsDelArm ? 'Trykk igjen for å slette listen og oppgavene' : 'Slett listen'}</button>` : ''}</div>`;
}
const SUGQ = ['Påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned', 'Legg ukas matplan i handlelisten', 'Kjøp melk, egg og kaffe', 'Hva har jeg igjen i dag?', 'Hva har Ingrid lagt til i Handel?', 'Når kjøpte vi sist kaffe?', 'Hva er forfalt?'];
function glSheet() {
  if (!G7.gl) return '';
  const A = G7.gAns, q = G7.gq;
  return `<div class="p37-scrim" data-p37="glx"></div><div class="p37-sheet gl" role="dialog" aria-modal="true" aria-label="Glimt"><span class="p37-grab"></span>
    <div class="p37-shh"><span class="p37-glh">${SPARK(16, true)}<b>Glimt</b></span><span></span><button type="button" class="p37-ok" data-p37="glx">Ferdig</button></div>
    <form class="p37-gf" data-p37form="glimt">${SPARK(22, !!G7.gBusy)}<input id="p37-gq" value="${esc(q)}" placeholder="Spør Glimt eller skriv en oppgave …" enterkeyhint="send" autocomplete="off" data-p37in="gq" aria-label="Spør Glimt"><label class="p37-cam" title="Bilde av handlelapp eller oppskrift">${svg('M3 5h18v14H3zM12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM8 5l1.5-2h5L16 5', 17, 2.1)}<input type="file" accept="image/*" class="m-file" data-p37img aria-label="Bilde av handlelapp"></label><button type="submit" class="p37-send${q.trim() ? ' on' : ''}" aria-label="Send">${svg('M12 19V5M5 12l7-7 7 7', 15, 2.6)}</button></form>
    <div class="p37-chips">${SUGQ.map((n) => `<button type="button" class="p37-sc" data-p37="gsug" data-q="${esc(n)}">${esc(n.length > 34 ? `${n.slice(0, 32)}…` : n)}</button>`).join('')}</div>
    ${G7.gBusy ? `<div class="p37-gbusy">${SPARK(16, true)}${esc(G7.gBusy)}</div>` : ''}
    ${A && !G7.gBusy ? `<div class="p37-ga"><span class="p37-lab red">GLIMT</span><span class="p37-gat">${esc(A.text)}</span>${A.res?.length ? `<div class="p37-gres">${A.res.slice(0, 8).map((x) => `<div><i style="background:${esc(x.c || '#1b1a17')}"></i><b class="m-grow m-ell">${esc(x.n)}</b><small>${esc(x.m || '')}</small></div>`).join('')}</div>` : ''}
      <div class="p37-gab">${A.undo && Date.now() - (A.at ?? 0) < 10000 ? '<button type="button" data-p37="gundo">Angre</button>' : ''}${A.chat ? '<button type="button" data-p37="gchat">Spør i Chat ›</button>' : ''}<button type="button" class="dim" data-p37="gclr">Lukk</button></div></div>` : ''}</div>`;
}
function geoBanner() {
  if (!G7.geoShow) return '';
  const hd = lists().find((l) => l.name.toLowerCase() === 'handel'), it = visible().filter((x) => !x.done && hd && String(x.list) === hd.id).slice(0, 4).map((x) => x.title).join(', ');
  return `<div class="p37-geo" role="status"><span>${svg('M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z', 16)}</span><span class="m-grow"><b>Du er ved Kiwi Pilestredet</b><small class="m-ell">${esc(it)}</small></span><button type="button" data-p37="geoview" data-k="${esc(hd?.id ?? '')}">Vis</button></div>`;
}
export function layer37() {
  if (m.screen !== 'huske') return '';
  return edSheet() + lsSheet() + glSheet() + geoBanner();
}

/* =====================================================================
   Glimt: lokal tolkning (fallback når /api/tasks/glimt mangler)
   ===================================================================== */
const findL = (n) => lists().find((l) => l.name.toLowerCase() === n);
function guess(t) {
  const s = ` ${String(t).toLowerCase()} `;
  const g = / (melk|egg|brød|kaffe|ost|smør|bananer|epler|pasta|ris|kjøttdeig|kylling|tomat|løk|yoghurt|juice|dopapir|tørkerull|batterier|lyspærer|kjøpe?|handle) /.test(s) ? 'handel' : / (hytta|hytte|hafjell|brøyting|ved) /.test(s) ? 'hytta' : / (jobb|møte|faktura|domene|rapport|kunde|overleaf) /.test(s) ? 'jobb' : / (hjem|filter|vaske|rydde|støvsuge|pante|røykvarsler|varmepumpe|fellesutgifter) /.test(s) ? 'hjem' : null;
  const W = new RegExp(` (${people().map((p) => first(p.name).toLowerCase()).filter(Boolean).join('|') || 'ingrid|pål|emma'}) `).exec(s);
  const who = W ? people().find((p) => first(p.name).toLowerCase() === W[1])?.id ?? null : null;
  const tags = / (hytte|hytta) /.test(s) ? ['hytte'] : / (gave|bursdag) /.test(s) ? ['gave'] : [];
  return { l: g ? findL(g)?.id ?? null : null, who, tags };
}
export function gParse(txt, cur) {
  const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  let s = ` ${String(txt).trim()} `, due = null, time = null, urgent = false, rep = 'aldri', early = 'ingen', mm;
  const cut = (re) => { const x = s.match(re); if (x) s = s.replace(x[0], ' '); return x; };
  if (cut(/(^|\s)(viktig|haster|med alarm)(?=[\s,.]|$),?/i)) urgent = true;
  mm = cut(/(^|\s)(hver dag|daglig|ukedager|hver uke|ukentlig|annenhver uke|hver måned|månedlig|hvert år|årlig)(?=[\s,.]|$),?/i);
  if (mm) { const v = mm[2].toLowerCase(); rep = /ukedager/.test(v) ? 'ukedager' : /annenhver/.test(v) ? 'annenhver' : /uke/.test(v) ? 'ukentlig' : /dag|daglig/.test(v) ? 'daglig' : /måned/.test(v) ? 'maanedlig' : 'aarlig'; }
  mm = cut(/(?:påminn(?:else)?|varsle?)\s*(?:meg\s*)?(\d+)\s*(min|minutter|t|time|timer|dag|dager|uke)\s*før/i);
  if (mm) { const n = +mm[1], u = mm[2][0]; early = u === 'm' ? (n <= 5 ? '5m' : n <= 15 ? '15m' : '30m') : u === 't' ? '1t' : u === 'd' ? (n >= 2 ? '2d' : '1d') : '1u'; }
  mm = cut(/(?:kl\.?|klokka|klokken)\s*(\d{1,2})(?:[.:](\d{2}))?(?!\d)/i);
  if (mm) time = `${pad(+mm[1])}:${mm[2] || '00'}`;
  mm = cut(/(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d])/);
  if (mm) { const y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : new Date().getFullYear(); let d = new Date(y, +mm[2] - 1, +mm[1], 12); if (!mm[3] && iso(d) < dayIso(0)) d = new Date(y + 1, +mm[2] - 1, +mm[1], 12); due = iso(d); }
  if (!due) {
    if (cut(/(^|\s)i\s*overmorgen(?=[\s,.?]|$)/i)) due = dayIso(2);
    else if (cut(/(^|\s)i\s*morgen(?=[\s,.?]|$)/i)) due = dayIso(1);
    else if (cut(/(^|\s)i\s*(dag|kveld)(?=[\s,.?]|$)/i)) due = dayIso(0);
    else if ((mm = cut(/(^|\s)(?:på\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)(?=[\s,.?]|$)/i))) { const w = WD.indexOf(mm[2].toLowerCase()); due = dayIso(((w - new Date().getDay() + 7) % 7) || 7); }
    else if (cut(/(^|\s)neste uke(?=[\s,.?]|$)/i)) due = dayIso(7);
  }
  if (time && !due) due = dayIso(0);
  const tags = [];
  s = s.replace(/#([\wæøåÆØÅ-]+)/g, (a, b) => { tags.push(b.toLowerCase()); return ' '; });
  let t = s.replace(/^\s*(påminn meg (om )?(å )?|minn meg på (å )?|husk (å )?|legg til |ny oppgave:? |jeg må |må )/i, ' ').replace(/\s+(den|på|i|til|kl\.?)\s*$/i, ' ').replace(/[,.;:]+\s*$/, '').replace(/\s+/g, ' ').trim();
  t = t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Ny oppgave';
  const g = guess(txt), L = lists(), def = cur && cur !== 'alle' && cur !== 'arkiv' ? String(cur) : (L.find((l) => !l.shared && l.mine) ?? L[0])?.id ?? null;
  const base = { list: g.l || def, who: g.who, due, time, urgent, rep, early, tags: [...new Set([...tags, ...g.tags])] };
  if (/^\s*(kjøp|kjøpe|handle)\s+/i.test(t) && /,| og /.test(t)) {
    const parts = t.replace(/^\s*(kjøp|kjøpe|handle)\s+/i, '').split(/,| og /).map((x) => x.trim()).filter(Boolean);
    return parts.map((n) => ({ ...base, list: findL('handel')?.id ?? base.list, title: n.charAt(0).toUpperCase() + n.slice(1) }));
  }
  return [{ ...base, title: t }];
}
function gAsk(q) {
  const low = q.toLowerCase(), it = visible(), T0 = t0(), op = it.filter((x) => !x.done && !isArch(x.raw));
  const fmt = (x) => ({ n: x.title, c: listOf(x.list).color, m: [listOf(x.list).name, whoName(x.who)].filter(Boolean).join(' · ') });
  if (/forfalt/.test(low) && !/i dag/.test(low)) { const R = op.filter((x) => x.due && x.due < T0); return { text: R.length ? `${R.length} er forfalt.` : 'Ingenting er forfalt.', res: R.map(fmt) }; }
  if (/igjen i dag|i dag|hva (har|må) jeg/.test(low)) {
    const R = op.filter((x) => x.due && x.due <= T0), od = R.filter((x) => x.due < T0).length;
    const nx = op.filter((x) => x.due).sort((a, b) => a.due.localeCompare(b.due))[0];
    return { text: R.length ? `Du har ${R.length} gjøremål i dag${od ? `, ${od} av dem er forfalt` : ''}.` : `Ingenting i dag. Neste: ${nx ? nx.title : 'ingen med dato'}.`, res: R.map(fmt) };
  }
  const P = people().find((p) => first(p.name) && low.includes(first(p.name).toLowerCase()));
  if (P && /lagt til|lagt inn|la til/.test(low)) {
    const ln = lists().find((l) => low.includes(l.name.toLowerCase())), R = it.filter((x) => (String(x.by) === P.id || String(x.who) === P.id) && (!ln || String(x.list) === ln.id) && !isArch(x.raw));
    return { text: R.length ? `${first(P.name)} har ${R.length} gjøremål${ln ? ` i ${ln.name}` : ''}.` : `${first(P.name)} har ikke lagt til noe${ln ? ` i ${ln.name}` : ''}.`, res: R.map(fmt) };
  }
  const sist = /sist\s+(?:kjøpte|kjøpt|handlet)\s+(?:vi\s+|jeg\s+)?([\wæøå ]+)|(?:kjøpte|kjøpt)\s+(?:vi|jeg)\s+sist\s+([\wæøå ]+)/.exec(low);
  if (sist) {
    const term = (sist[1] || sist[2] || '').replace(/\?/g, '').trim(), D = it.filter((x) => x.done && x.title.toLowerCase().includes(term)).sort((a, b) => (+new Date(b.doneAt ?? 0)) - (+new Date(a.doneAt ?? 0)))[0];
    return { text: D ? `Sist krysset av «${D.title}» ${new Date(D.doneAt ?? Date.now()).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}${D.who ? ` (${whoName(D.who)})` : ''}.` : `Finner ikke «${term}» blant fullførte gjøremål.`, res: D ? [fmt(D)] : [] };
  }
  return null;
}
const MAT_FB = [['Spaghetti bolognese', ['400 g kjøttdeig', '1 løk', '2 fedd hvitløk', '1 boks hakkede tomater', '400 g spaghetti']], ['Kyllingwok', ['500 g kyllingfilet', '1 pose wokgrønnsaker', 'Soyasaus', 'Ris']], ['Taco', ['400 g kjøttdeig', 'Tacokrydder', 'Tortillalefser', 'Salat', 'Rømme']]];
async function matIng() {
  try {
    const MAT = await import('./mobile-mat.js'); await MAT.matLoad?.().catch(() => {});
    const W = MAT.MT?.week ?? MAT.MT?.d?.week ?? null, days = Array.isArray(W?.days) ? W.days : Array.isArray(W) ? W : [];
    const names = [], ing = [];
    for (const d of days) { const r = d?.recipe ?? d?.dish ?? d; const n = r?.name ?? r?.title ?? d?.name; if (n) names.push(n); for (const i of r?.ingredients ?? r?.ing ?? []) ing.push(typeof i === 'string' ? i : i?.name ?? i?.text ?? ''); }
    if (names.length && ing.filter(Boolean).length) return { names, ing: ing.filter(Boolean) };
  } catch {}
  const sv = lsGet('hl_matplan', null);
  if (sv?.weeks && sv.dishes) { const k = Object.keys(sv.weeks).sort().pop(), names = (sv.weeks[k] || []).map((x) => x?.d).filter(Boolean), ing = []; names.forEach((n) => (sv.dishes.find((x) => x.n === n)?.ing ?? []).forEach((i) => ing.push(i))); if (ing.length) return { names, ing }; }
  return { names: MAT_FB.map((x) => x[0]), ing: MAT_FB.flatMap((x) => x[1]) };
}
export function splitSugg(n) {
  const low = String(n).toLowerCase();
  if (/flytt/.test(low)) return ['Bestill flyttebil', 'Pakk kjøkken', 'Pakk klær', 'Meld adresseendring', 'Vask ut'];
  if (/hytt/.test(low)) return ['Sjekk vær og føre', 'Handle mat', 'Pakk bilen', 'Ta med nøkler'];
  if (/bursdag|gave|selskap/.test(low)) return ['Kjøp gave', 'Bestill kake', 'Send invitasjon', 'Pynt'];
  if (/filter|ventilasjon/.test(low)) return ['Finn riktig filterstørrelse', 'Bestill filter', 'Bytt filter', 'Noter dato for neste bytte'];
  if (/domene|forny/.test(low)) return ['Sjekk utløpsdato', 'Logg inn hos registrar', 'Betal fornyelse'];
  return ['Finn ut hva som trengs', 'Gjør det', 'Sjekk at det er ferdig'];
}
function suggest(E) {
  const g = guess(`${E.title} ${E.notes}`), ch = [], L = lists(), patch = {};
  if (g.l && g.l !== String(E.list) && L.some((l) => l.id === g.l)) { ch.push(listOf(g.l).name); patch.list = g.l; }
  if (g.who && String(g.who) !== String(E.who ?? '')) { ch.push(whoName(g.who)); patch.who = g.who; }
  const nt = g.tags.filter((t) => !E.tags.includes(t)); nt.forEach((t) => ch.push(`#${t}`)); if (nt.length) patch.tags = [...E.tags, ...nt];
  const hd = findL('handel')?.id;
  if (hd && (String(E.list) === hd || patch.list === hd) && !E.place) { ch.push('påminn ved butikk'); patch.place = 'butikk'; }
  return ch.length ? { t: ch.join(' · '), patch } : null;
}
const resOf = (its) => its.map((x0) => { const x = T(x0); const l = listOf(x.list); return { n: x.title, c: l.color, m: [l.name, whoName(x.who), ...x.tags.map((t) => `#${t}`)].filter(Boolean).join(' · ') }; });
async function addMany(list) { const out = []; for (const t of list) { try { const it = await addTask(t); if (it) out.push(it); } catch (e) { flash(e.message, 'err'); break; } } return out; }
function answer(text, res = [], undo = null, chat = false) { G7.gAns = { text, res, undo, at: Date.now(), chat }; G7.gBusy = ''; clearTimeout(G7.undoT); if (undo) G7.undoT = setTimeout(() => { if (m.screen === 'huske') draw(); }, 10100); draw(); }
/** Kjør Glimt: serveren først (POST /api/tasks/glimt), ellers lokalt. */
export async function gRun(q0, extra = {}) {
  const q = String(q0 ?? '').trim(); if (!q && !extra.image) return;
  try { document.activeElement?.blur?.(); } catch {}
  G7.lastQ = q; G7.gl = true; G7.gq = ''; G7.gBusy = extra.image ? 'Leser bildet …' : 'Glimt tenker …'; G7.gAns = null; draw();
  // Prompt 41 (claude-code-huskeliste-glimt-ai-bakgrunn.md): lange beskjeder deles opp av AI i bakgrunnen. Arket lukkes
  // med en gang, og en stiplet rad øverst i lista viser «Glimt deler opp beskjeden …».
  if (!HK.local && !extra.image && globalThis.P41?.needsAI?.(q)) {
    const ok = await globalThis.P41.huskeAsync(q, HK.cur !== 'alle' && HK.cur !== 'arkiv' && HK.cur !== 'glimt' ? HK.cur : undefined, 'huskeliste');
    if (ok) { G7.gl = false; G7.gBusy = ''; draw(); return; }
  }
  if (!HK.local && !G7.noSrv) {
    try {
      const r = await hlApi('/tasks/glimt', { method: 'POST', json: { q, list: HK.cur !== 'alle' && HK.cur !== 'arkiv' ? HK.cur : undefined, ...extra } });
      const its = Array.isArray(r?.items) ? r.items : [];
      if (r?.kind === 'add' || r?.kind === 'action') { HK.t = 0; await tasksLoad(true).catch(() => {}); }
      haptic('ok');
      answer(r?.text ?? (its.length ? `La til ${its.length} gjøremål.` : 'Ferdig.'), its.map((x) => { if (x.n && x.c) return x; const o = resOf([x])[0]; return { ...o, m: [x.step?.label, o.m, x.placeName, ...(x.mentions ?? []).map((u) => (u?.name ? `@${u.name}` : ''))].filter(Boolean).join(' · ') }; }) /* prompt 40: steg, sted, @person */, r?.undo?.token ? { token: r.undo.token } : null, r?.kind === 'question' && !its.length && /chat/i.test(r?.text ?? ''));
      return;
    } catch (e) { if (e.status === 404 || e.status === 405) G7.noSrv = true; else if (e.status && e.status !== 501) { G7.gBusy = ''; answer(`Fikk ikke svar: ${e.message}`); return; } }
  }
  // Lokalt (eldre server)
  if (extra.image) {
    const hd = findL('handel')?.id ?? null;
    const L = await addMany(['Melk', 'Brød', 'Bananer', 'Kaffe', 'Tørkerull'].map((n) => ({ title: n, list: hd, due: dayIso(0), tags: ['handlelapp'] })));
    answer(`Fant ${L.length} varer på bildet og la dem i Handel. (Uten bildemodell på serveren: eksempelvarer.)`, resOf(L), { ids: L.map((x) => x.id) }); return;
  }
  if (/matplan|middagene|ukas mat|handleliste fra mat/i.test(q)) {
    const M = await matIng(), hd = findL('handel')?.id ?? null, have = new Set(visible().filter((x) => !x.done && String(x.list) === hd).map((x) => x.title.toLowerCase())), seen = new Set(), add = [];
    M.ing.forEach((i) => { const k = i.toLowerCase(); if (have.has(k) || seen.has(k)) return; seen.add(k); add.push({ title: i, list: hd, due: dayIso(1), tags: ['matplan'] }); });
    const L = await addMany(add);
    answer(`La ${L.length} varer fra ${M.names.slice(0, 4).join(', ')} i Handel${M.ing.length > add.length ? ` (${M.ing.length - add.length} sto der allerede)` : ''}.`, resOf(L), { ids: L.map((x) => x.id) }); return;
  }
  if (/pakkeliste/i.test(q)) { await packList(); return; }
  if (/rydd|forfalte/i.test(q) && !/\?/.test(q)) { answer('Bruk kortet i listen: flytt de forfalte til i morgen eller arkiver dem.'); return; }
  const isQ = /\?|^\s*(hva|hvem|hvor|når|hvilke|har|kan du|vet du)(\s|$)/i.test(q);
  if (isQ) { const A = gAsk(q); answer(A ? A.text : 'Det vet jeg ikke her. Spør meg i Chat for mer.', A?.res ?? [], null, !A); return; }
  if (globalThis.P40?.isMulti?.(q)) { await globalThis.P40.gMulti(q, { lists, people, addTask, answer, resOf, cur: HK.cur, meId }); return; } // prompt 40
  const P = gParse(q, HK.cur), L = await addMany(P), one = T(L[0] ?? P[0] ?? {});
  if (!L.length) { answer('Fikk ikke lagt til oppgaven.'); return; }
  const dd = one.due ? new Date(`${one.due}T12:00`).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  haptic('ok');
  answer(L.length > 1 ? `La ${L.length} varer i Handel.` : `La til «${one.title}» i ${listOf(one.list).name || 'listen'}${dd ? ` · ${dd}` : ''}${P[0].time ? ` kl. ${P[0].time}` : ''}${P[0].urgent ? ' · viktig (alarm)' : ''}${P[0].rep !== 'aldri' ? ' · gjentas' : ''}${P[0].who ? ` · ${whoName(P[0].who)}` : ''}.`, resOf(L), { ids: L.map((x) => x.id) });
}
async function packList(evKey) {
  const ht = calTrip(), hy = findL('hytta')?.id ?? lists()[0]?.id ?? null, days = ht?.days ?? 11;
  const add = ['Sengetøy og håndklær', 'Mat til helgen', 'Ved og tennbriketter', 'Ski og skismøring', 'Ladere', 'Søppelsekker'].map((n) => ({ title: n, list: hy, due: dayIso(Math.max(0, days - 1)), tags: ['pakkeliste'] }));
  const sub = { title: 'Bestill brøyting', list: hy, who: meId() || null, due: dayIso(Math.max(0, days - 2)), tags: ['hytte'] };
  G7.gl = true; G7.gBusy = 'Lager pakkeliste …'; draw();
  const L = await addMany([sub, ...add]);
  const seen = lsGet('p37_tip_seen', {}) || {}; if (evKey || ht?.key) { seen[evKey || ht.key] = 1; lsSet('p37_tip_seen', seen); }
  answer(`Lagde pakkeliste${ht ? ` for ${ht.title}` : ''} (${add.length} ting) og «Bestill brøyting» to dager før.`, resOf(L), { ids: L.map((x) => x.id) });
}
async function gUndo() {
  const U = G7.gAns?.undo; if (!U) return;
  G7.gAns = null; draw();
  if (U.token) { try { await hlApi('/tasks/glimt/undo', { method: 'POST', json: { token: U.token } }); } catch (e) { flash(e.message, 'err'); } HK.t = 0; await tasksLoad(true).catch(() => {}); }
  else for (const id of U.ids ?? []) await delTask(id);
  flash('Angret'); draw();
}
async function split(E) {
  if (G7.split) return;
  G7.split = true; draw();
  let L = null;
  if (!HK.local) { try { const r = await hlApi(`/tasks/${encodeURIComponent(E.id)}/split`, { method: 'POST', json: {} }); const s = r?.subs ?? r?.item?.subs ?? r?.items; if (Array.isArray(s) && s.length) L = s.map((x) => (typeof x === 'string' ? { n: x, done: false } : { n: x.n ?? x.title ?? '', done: !!x.done })); if (r?.item) localPatch(E.id, { subs: r.item.subs ?? L }); } catch {} }
  const subs = L && L.length > E.subs.length ? L : [...E.subs, ...splitSugg(E.title).map((n) => ({ n, done: false }))];
  G7.split = false; await patchTask(E.id, { subs }); haptic('ok');
}

/* =====================================================================
   Lister: lagre, forlat, slett
   ===================================================================== */
async function lsSave() {
  const D = G7.ls; if (!D || !D.name.trim()) return;
  const body = { name: D.name.trim(), color: D.color, members: D.members };
  try {
    if (D.id) {
      try { await hlApi(`/tasks/lists/${encodeURIComponent(D.id)}`, { method: 'PATCH', json: body }); }
      catch (e) { if (e.status !== 404 && e.status !== 405) throw e; }
      // Eldre server: medlemmer via PUT /members {userIds} (uten eieren).
      await hlApi(`/tasks/lists/${encodeURIComponent(D.id)}/members`, { method: 'PUT', json: { userIds: D.members.filter((x) => x !== D.owner), members: D.members } }).catch(() => {});
    } else {
      const r = await hlApi('/tasks/lists', { method: 'POST', json: body });
      const nl = r?.list ?? r; const id = nl?.id;
      if (id != null && D.members.length > 1) await hlApi(`/tasks/lists/${encodeURIComponent(id)}/members`, { method: 'PUT', json: { userIds: D.members.filter((x) => x !== meId()), members: D.members } }).catch(() => {});
      if (id != null) HK.cur = String(id);
    }
    G7.ls = null; HK.t = 0; await tasksLoad(true); flash(D.id ? 'Listen er lagret ✓' : 'Listen er opprettet ✓');
  } catch (e) { flash(e.message, 'err'); }
  draw();
}
async function lsLeave() {
  const D = G7.ls; if (!D?.id) return;
  try { await hlApi(`/tasks/lists/${encodeURIComponent(D.id)}/leave`, { method: 'POST', json: {} }); }
  catch (e) { if (e.status === 404 || e.status === 405) { try { await hlApi(`/tasks/lists/${encodeURIComponent(D.id)}/members/me`, { method: 'DELETE' }); } catch (e2) { flash(e2.message, 'err'); return; } } else { flash(e.message, 'err'); return; } }
  G7.ls = null; HK.cur = 'alle'; HK.t = 0; await tasksLoad(true); flash('Du har forlatt listen'); draw();
}
async function lsDel() {
  const D = G7.ls; if (!D?.id) return;
  if (!G7.lsDelArm) { G7.lsDelArm = true; draw(); setTimeout(() => { G7.lsDelArm = false; if (G7.ls) draw(); }, 3000); return; }
  G7.lsDelArm = false;
  try { await hlApi(`/tasks/lists/${encodeURIComponent(D.id)}`, { method: 'DELETE' }); G7.ls = null; HK.cur = 'alle'; HK.t = 0; await tasksLoad(true); flash('Listen er slettet'); } catch (e) { flash(e.message, 'err'); }
  draw();
}
const lsOpen = (l) => { G7.ls = { id: l.id, name: l.name, color: l.color, members: l.members.map((p) => p.id), owner: l.owner }; G7.lsDelArm = false; };

/* =====================================================================
   Hendelser
   ===================================================================== */
export function input37(e, t) {
  const k = t.dataset?.p37in; if (!k) return false;
  const v = t.value;
  if (k === 'nv') { HK.nv = v; return true; }
  if (k === 'gq') { G7.gq = v; const b = document.querySelector('#app .p37-send'); b?.classList.toggle('on', !!v.trim()); return true; }
  if (k === 'tagv') { G7.tagV = v; return true; }
  if (k === 'subv') { G7.subV = v; return true; }
  if (k === 'lname') { if (G7.ls) { G7.ls.name = v; const b = document.querySelector('#app [data-p37="lssave"]'); if (b) b.disabled = !v.trim(); } return true; }
  const E = byId(G7.ed); if (!E) return true;
  if (k === 'title' || k === 'notes') { if (e.type === 'change') patchTask(E.id, { [k]: v.trim() || (k === 'title' ? E.title : '') }, false); return true; }
  if (e.type !== 'change') return true;
  if (k === 'due') { if (v) patchTask(E.id, { due: v }); return true; }
  if (k === 'time') { patchTask(E.id, { time: v || null }); return true; }
  if (k === 'rep' || k === 'early' || k === 'place') { patchTask(E.id, { [k]: v }); haptic('tab'); return true; }
  return true;
}
export async function submit37(e, t) {
  const f = t.dataset?.p37form; if (!f) return false;
  e.preventDefault();
  if (f === 'add') {
    const title = HK.nv.trim(); if (!title) return true;
    // Prompt 40 (claude-code-huskeliste-glimt-forstar.md): setninger med flere handlinger («… men først …») går via Glimt.
    if (globalThis.P40?.isMulti?.(title)) { HK.nv = ''; await gRun(title); return true; }
    HK.nv = ''; haptic('ok');
    const L = lists(), list = HK.cur === 'alle' || HK.cur === 'arkiv' ? (lsGet('p37_deflist', null) && L.some((l) => l.id === lsGet('p37_deflist')) ? lsGet('p37_deflist') : (L.find((l) => !l.shared && l.mine) ?? L[0])?.id ?? null) : String(HK.cur);
    try { await addTask({ title, list, due: HK.due == null ? null : dayIso(HK.due), who: HK.who || null }); } catch (err) { flash(err.message, 'err'); }
    draw(); setTimeout(() => document.getElementById('p37-tk')?.focus({ preventScroll: true }), 30); return true;
  }
  if (f === 'glimt') { await gRun(G7.gq); return true; }
  const E = byId(G7.ed); if (!E) return true;
  if (f === 'tag') { const v = G7.tagV.replace(/^#/, '').trim().toLowerCase(); if (v) { G7.tagV = ''; await patchTask(E.id, { tags: [...new Set([...E.tags, v])] }); setTimeout(() => document.getElementById('p37-tag')?.focus({ preventScroll: true }), 30); } return true; }
  if (f === 'sub') { const v = G7.subV.trim(); if (v) { G7.subV = ''; await patchTask(E.id, { subs: [...E.subs, { n: v, done: false }] }); setTimeout(() => document.getElementById('p37-sub')?.focus({ preventScroll: true }), 30); } return true; }
  return true;
}
export async function bind37(e, t) {
  if (e.type === 'change' && t.matches?.('[data-p37img]')) { const f = t.files?.[0]; t.value = ''; if (f) await gImage(f); return true; }
  const x = t.closest?.('[data-p37]'); if (!x) return false;
  const a = x.dataset.p37, id = x.dataset.id;
  e.preventDefault();
  const E = byId(G7.ed);
  switch (a) {
    case 'tick': await tick(id); return true;
    case 'open': try { document.activeElement?.blur?.(); } catch {} G7.ed = id; G7.tagV = ''; G7.subV = ''; haptic('tap'); draw(); return true;
    case 'rm': await delTask(id); draw(); return true;
    case 'list': {
      const k = x.dataset.k;
      if (String(HK.cur) === k && k !== 'alle' && k !== 'arkiv') { const l = listOf(k); lsOpen(l); draw(); return true; }
      HK.cur = k; haptic('tab'); draw(); return true;
    }
    case 'newlist': G7.ls = { id: null, name: '', color: LCOL[lists().length % LCOL.length], members: [meId()].filter(Boolean), owner: meId() }; draw(); setTimeout(() => document.getElementById('p37-ln')?.focus(), 60); return true;
    case 'lsopen': lsOpen(listOf(x.dataset.k)); draw(); return true;
    case 'lsx': G7.ls = null; draw(); return true;
    case 'lcol': if (G7.ls) { G7.ls.color = x.dataset.c; haptic('tab'); draw(); } return true;
    case 'lmem': {
      const D = G7.ls; if (!D) return true;
      const u = x.dataset.k; if (u === meId() || (D.id && D.owner !== meId())) return true;
      D.members = D.members.includes(u) ? D.members.filter((y) => y !== u) : [...D.members, u]; haptic('tab'); draw(); return true;
    }
    case 'lssave': await lsSave(); return true;
    case 'lsleave': await lsLeave(); return true;
    case 'lsdel': await lsDel(); return true;
    case 'edx': { const a1 = document.getElementById('p37-et'), n1 = document.getElementById('p37-en'); if (E && a1 && a1.value.trim() && a1.value.trim() !== E.title) await patchTask(E.id, { title: a1.value.trim() }, false); if (E && n1 && n1.value !== E.notes) await patchTask(E.id, { notes: n1.value }, false); vib(6); G7.ed = null; draw(); return true; }
    case 'eddel': if (E) { G7.ed = null; await delTask(E.id); flash('Oppgaven er slettet'); } draw(); return true;
    case 'tgdate': if (E) await patchTask(E.id, E.due ? { due: null, time: null } : { due: dayIso(0) }); haptic('tab'); return true;
    case 'tgtime': if (E) await patchTask(E.id, E.time ? { time: null } : { time: '09:00', due: E.due ?? dayIso(0) }); haptic('tab'); return true;
    case 'tgurg': if (E) await patchTask(E.id, { urgent: !E.urgent }); haptic('tab'); return true;
    case 'tgflag': if (E) await patchTask(E.id, { flag: !E.flag }); haptic('tab'); return true;
    case 'prio': if (E) await patchTask(E.id, { prio: +x.dataset.v }); haptic('tab'); return true;
    case 'setlist': if (E) { const p = { list: x.dataset.k }; if (E.who && !listOf(x.dataset.k).members.some((u) => u.id === String(E.who))) p.who = null; await patchTask(E.id, p); } haptic('tab'); return true;
    case 'setwho': if (E) await patchTask(E.id, { who: x.dataset.k || null }); haptic('tab'); return true;
    case 'rmtag': if (E) await patchTask(E.id, { tags: E.tags.filter((g) => g !== x.dataset.k) }); return true;
    case 'subtick': if (E) { const i = +x.dataset.i; await patchTask(E.id, { subs: E.subs.map((u, j) => (j === i ? { ...u, done: !u.done } : u)) }); vib(6); } return true;
    case 'subrm': if (E) { const i = +x.dataset.i; await patchTask(E.id, { subs: E.subs.filter((_, j) => j !== i) }); } return true;
    case 'split': if (E) await split(E); return true;
    case 'usesug': if (E) { const s = suggest(E); if (s) { await patchTask(E.id, s.patch); haptic('ok'); } } return true;
    case 'fab': {
      const inp = document.getElementById('p37-tk'), v = (inp?.value ?? HK.nv).trim();
      vib(8); haptic('tap');
      if (v) { HK.nv = ''; await gRun(v); return true; }
      G7.gl = true; draw(); setTimeout(() => document.getElementById('p37-gq')?.focus({ preventScroll: true }), 80); return true;
    }
    case 'glx': G7.gl = false; draw(); return true;
    case 'gsug': await gRun(x.dataset.q); return true;
    case 'gundo': await gUndo(); return true;
    case 'gclr': G7.gAns = null; draw(); return true;
    case 'gchat': { const q = G7.lastQ ?? ''; G7.gl = false; draw(); const CHAT = await import('./mobile-chat.js'); CHAT.openChat?.(q); return true; }
    case 'tip': return tipAct(x);
    case 'geoview': G7.geoShow = false; if (x.dataset.k) HK.cur = x.dataset.k; draw(); return true;
    default: return false;
  }
}
async function tipAct(x) {
  const a = x.dataset.a;
  if (a === 'merge') {
    const ids = x.dataset.ids.split(',').filter(Boolean), D = ids.map(byId).filter(Boolean); if (D.length < 2) return true;
    const keep = D[0], tg = [...new Set(D.flatMap((y) => y.tags))], sb = D.flatMap((y) => y.subs);
    await patchTask(keep.id, { tags: tg, subs: sb, who: keep.who || D.find((d) => d.who)?.who || null }, false);
    for (const y of D.slice(1)) await delTask(y.id);
    haptic('ok'); flash(`Slått sammen til «${keep.title}» ✓`); draw(); return true;
  }
  const od = visible().filter((y) => !y.done && y.due && y.due < t0() && !isArch(y.raw));
  if (a === 'odmove') { for (const y of od) await patchTask(y.id, { due: dayIso(1) }, false); haptic('ok'); flash(`${od.length} flyttet til i morgen ✓`); draw(); return true; }
  if (a === 'odarch') { for (const y of od) await patchTask(y.id, { done: true, doneAt: Date.now(), archived: true }, false); HK.t = 0; await tasksLoad(true).catch(() => {}); flash(`${od.length} arkivert ✓`); draw(); return true; }
  if (a === 'geoon' || a === 'geooff') { G7.geoArm = a === 'geoon'; lsSet('p37_geo', G7.geoArm); haptic('tab'); draw(); return true; }
  if (a === 'geotest') { vib([10, 40, 10]); G7.geoShow = true; clearTimeout(G7.geoT); G7.geoT = setTimeout(() => { G7.geoShow = false; if (m.screen === 'huske') draw(); }, 5000); draw(); return true; }
  if (a === 'pack') { await packList(x.dataset.ev); return true; }
  if (a === 'packno') { const s = lsGet('huske_tip_dismiss', {}) || {}; s[x.dataset.ev] = true; lsSet('huske_tip_dismiss', s); draw(); return true; }
  if (a === 'packoff') { lsSet('huske_tip_off', { ...(lsGet('huske_tip_off', {}) || {}), pack: true }); hlApi('/me/layout', { method: 'PUT', json: { huske_tip_off: { pack: true } } }).catch(() => {}); haptic('tab'); flash('Glimt foreslår ikke pakkelister lenger · slå på igjen i Innstillinger → Glimt'); draw(); return true; }
  return true;
}
async function gImage(f) {
  let image = null;
  try { image = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); }); } catch {}
  await gRun(G7.gq || 'Les handlelappen', { image });
}
// Lim inn flere linjer i Glimt-feltet → én oppgave per linje.
async function onPaste(e) {
  if (!e.target?.matches?.('#p37-gq')) return;
  const txt = e.clipboardData?.getData('text') ?? '';
  const lines = txt.split(/\n/).map((s) => s.replace(/^[\s•\-*\d.)]+/, '').trim()).filter((s) => s.length > 1).slice(0, 20);
  if (lines.length < 2) return;
  e.preventDefault();
  if (!HK.local && !G7.noSrv) { await gRun(txt); return; }
  G7.gBusy = 'Leser teksten …'; draw();
  const L = await addMany(lines.flatMap((s) => gParse(s, HK.cur)));
  answer(`Lagde ${L.length} gjøremål fra teksten du limte inn.`, resOf(L), { ids: L.map((y) => y.id) });
}
let booted = false, wasOpen = false;
export function boot37() {
  if (booted) return; booted = true;
  document.addEventListener('paste', (e) => { onPaste(e).catch(() => {}); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) { G7.ed = null; G7.ls = null; G7.gl = false; draw(); } });
}
/** Etter tegning: klassen h37 på appen (ingen fanelinje) og huske-sheet når et ark åpnes/lukkes. */
export function afterDraw37() {
  const app = document.querySelector('#app .m');
  if (m.screen !== 'huske') { if (G7.ed || G7.ls || G7.gl) { G7.ed = null; G7.ls = null; G7.gl = false; } }
  app?.classList.toggle('h37', m.screen === 'huske' && !!document.querySelector('#app .p37-hk'));
  const o = sheetOpen();
  app?.classList.toggle('h37-sheet', o);
  if (o !== wasOpen) { wasOpen = o; try { window.dispatchEvent(new CustomEvent('huske-sheet', { detail: { open: o } })); } catch {} }
}
/** Hjem-widgeten (Gjøremål): de tre neste med avkrysning. */
export function todoWidget() {
  const op = visible().filter((x) => !x.done && !isArch(x.raw)).sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999'))), top = op.slice(0, 3);
  return `<a class="pp-card p17-hw" href="#/huske"><div class="pp-row"><span class="pp-lab">GJØREMÅL · ${op.length} IGJEN</span><span class="pp-mut">alle ›</span></div>
    ${top.map((x) => { const l = listOf(x.list), [dt] = dueLbl(x.due); return `<div class="p17-hwr"><button class="p17-chk sm" data-p37="tick" data-id="${esc(x.id)}" style="--c:${esc(l.color)}" aria-label="Fullfør ${esc(x.title)}"></button><span class="m-grow m-ell">${x.flag ? '⚑ ' : ''}${esc(x.title)}</span><span class="pp-mut">${esc(dt)}</span></div>`; }).join('') || `<span class="pp-mut">${HK.d ? 'Alt er gjort.' : 'Laster …'}</span>`}</a>`;
}
/** Brief-kortet «Gjøremål · 3 gjøremål i dag» (forfalt + i dag), med avkrysning. */
export function briefTodos(srv) {
  const T0 = t0();
  let L = visible().filter((x) => !x.done && !isArch(x.raw) && x.due && x.due <= T0);
  if (!HK.d && srv?.items?.length) L = srv.items.map(T);
  if (!HK.d) tasksLoad().then(draw).catch(() => {});
  const od = L.filter((x) => x.due && x.due < T0).length, top = L.slice(0, 3);
  const head = L.length ? `${L.length} GJØREMÅL I DAG${od ? ` · ${od} FORFALT` : ''}` : 'INGEN I DAG';
  return `<div class="p34-bcard p37-btd" data-gb="huske"><span class="p34-bh"><b>Gjøremål</b><span>${head}</span></span>
    ${top.map((x) => { const l = listOf(x.list); return `<div class="p37-btr"><button type="button" class="p37-ck sm" data-p37="tick" data-id="${esc(x.id)}" style="--c:${esc(l.color)}" aria-label="Fullfør ${esc(x.title)}"></button><b class="m-grow m-ell">${esc(x.title)}</b><small>${esc(l.name)}</small></div>`; }).join('') || '<span class="p34-none">Ingenting som haster i dag.</span>'}
    <a class="p37-bto" href="#/huske">Åpne Gjøremål ›</a></div>`;
}
export const briefTodoSay = () => { const T0 = t0(), L = visible().filter((x) => !x.done && x.due && x.due <= T0), od = L.filter((x) => x.due < T0).length; return L.length ? `Du har ${L.length} gjøremål i dag${od ? `, ${od === 1 ? 'ett' : od} er forfalt` : ''}.` : ''; };

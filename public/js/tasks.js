// Gjøremål (tidligere Huskeliste, prompt 17 → 37). Intern nøkkel er fortsatt huske/huskeliste.
// Prompt 21: lister har en eier og er private til eieren deler dem. Prompt 32: Arkivert.
// Prompt 37 (claude-code-huskeliste-uten-navbar.md + claude-code-gjoremal-glimt.md, fasit Huskeliste.dc.html):
//  - Nytt navn «Gjøremål · To-do for hele familien».
//  - Liste-chips med avatarer for delte lister, «+ Ny liste», infokort for valgt liste (Delt med … / Bare du ser …) og listeark
//    (navn, 8 farger, DEL MED med brytere, Forlat/Slett).
//  - Detaljark per oppgave (dato, tid, viktig, gjenta, tidlig påminnelse, sted, liste, ansvarlig, prioritet, flagg, tagger,
//    deloppgaver, ✦ Del opp, ✦ Glimt foreslår) som lagrer med en gang.
//  - Glimt-kortet inline øverst (web): tolker tekst, lim inn, bilde, matplan → Handel, pakkeliste, spørsmål, med Angre i 10 s.
//    POST /api/tasks/glimt {q, list?, image?} → {kind, text, items, undo:{token}}; 404 → lokal tolker (tasks37-glimt.js).
//  - Glimt-kort i listen: like oppgaver (Slå sammen), forfalte (Flytt til i morgen / Arkiver), butikk, hytte fra kalenderen.
// Data fra /api/tasks; endringer fra andre kommer i sanntid over /api/ws (type 'tasks' / 'todo:changed'), ellers hvert 30. s.
import { api, esc, isMobile } from './util.js';
import { onLive, liveOn } from './realtime.js';
import { store } from './store.js';
import { mountHa } from './tasks-ha.js';
import { agent, agentOn, agentExtras, agentText } from './glimt-agent45.js'; // prompt 45
import { needsAi41, splitLocal41, startJob41, trackJob41, jobsHtml41, madeWithHtml41, originCard41, glimtSources41, srcItems41, clearDone41 } from './tasks41.js'; // prompt 41: Glimt deler opp i bakgrunnen
import { parse as gParse, pasteLines, isAsk, ask as gAsk, splitSugg, guess, dupes, PACK, MAT_FALLBACK, isoDay } from './tasks37-glimt.js';
import { colorFor } from './house37.js';
import { setup44, subBtn, subRows, haRow, openPanel, bind44, refresh44 } from './tasks44.js'; // prompt 44: deloppgaver i lista, panel fra høyre, synk-rad

const S = { d: null, err: null, cur: 'alle', nv: '', nd: 0, nw: null, busy: false, arch: [], ed: null, lsv: null, g: { q: '', busy: '', ans: null }, tagIn: '', subIn: '' };
// Prompt 32: Arkivert (archived_at på serveren, ellers lokalt per bruker). Fullførte oppgaver arkiveres automatisk etter 7 dager.
const WEEK = 7 * 864e5;
const archKey = () => `tk_arch_${store.me?.me?.id ?? 'x'}`;
const localArch = () => { try { return new Set(JSON.parse(localStorage.getItem(archKey()) ?? '[]').map(String)); } catch { return new Set(); } };
const saveLocalArch = (set) => { try { localStorage.setItem(archKey(), JSON.stringify([...set])); } catch { /* privat modus */ } };
const doneMs = (t) => (t.doneAt == null ? null : typeof t.doneAt === 'number' ? t.doneAt : Date.parse(t.doneAt));
const srvArch = (t) => !!(t.archived || t.arch || t.archivedAt || t.archived_at);
const isArch = (t) => srvArch(t) || localArch().has(String(t.id)) || (t.done && doneMs(t) != null && Date.now() - doneMs(t) > WEEK);
const ARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"/></svg>';
let pollT = null, unLive = null, unLive2 = null, saveT = null, undoT = null;
const host = () => document.getElementById('tasks');

const today = () => isoDay(0);
const daysTo = (d) => Math.round((new Date(d + 'T12:00') - new Date(today() + 'T12:00')) / 864e5);
// Feltnavn: serveren har title/list/assignee/note; kontrakten for prompt 37 tillater også n/l/who/notes.
const tTitle = (t) => t.title ?? t.n ?? '';
const tList = (t) => t.list ?? t.l ?? null;
const tWho = (t) => t.assignee ?? t.who ?? null;
const tNotes = (t) => t.notes ?? t.note ?? '';
const listOf = (id) => S.d?.lists.find((l) => l.id === id || l.name === id);
const colorOf = (id) => listOf(id)?.color ?? 'var(--t-ink)';
const myId = () => store.me?.me?.id;
const uidOf = (m) => (typeof m === 'object' && m ? m.userId ?? m.id ?? m.user_id : m);
const ownerOf = (l) => uidOf(l?.ownerId ?? l?.owner);
const listMembers = (l) => (Array.isArray(l?.members) ? l.members.map(uidOf).filter((id) => id && id !== ownerOf(l)) : []);
const isMine = (l) => (typeof l?.mine === 'boolean' ? l.mine : !ownerOf(l) || ownerOf(l) === myId());
const PCOL = ['#2b5d8a', '#b23a2a', '#2f6b45', '#a8661a', '#7a5ad6', '#c2477a', '#3d7f8a', '#5b4fc4'];
const people = () => (S.d?.members ?? []).map((m, i) => ({ id: m.id ?? m.userId, name: m.name, color: m.color || PCOL[i % PCOL.length], avatarUrl: m.avatarUrl }));
const person = (uid) => people().find((p) => p.id === uid);
const nameOf = (uid) => (uid && uid === myId() ? 'Meg' : person(uid)?.name ?? '');
const pColor = (p) => p?.color || colorFor(p?.name);
// Alle i listen (eier + medlemmer) som personer.
const listPeople = (l) => {
  if (!l) return [];
  const ids = [...new Set([ownerOf(l), ...listMembers(l)].filter(Boolean))];
  const objs = Array.isArray(l.members) ? l.members.filter((m) => typeof m === 'object' && m) : [];
  return ids.map((id) => person(id) ?? { id, name: objs.find((m) => uidOf(m) === id)?.name ?? (id === ownerOf(l) ? l.ownerName : '') ?? '?' });
};
const isShared = (l) => !!l && (l.shared === true || listMembers(l).length > 0 || !isMine(l));
const LCOL = ['#b23a2a', '#2f6b45', '#a8661a', '#2b5d8a', '#7a5ad6', '#c2477a', '#3d7f8a', '#1b1a17'];
const REP = [['none', 'Aldri'], ['daily', 'Hver dag'], ['weekdays', 'Ukedager'], ['weekly', 'Hver uke'], ['biweekly', 'Annenhver uke'], ['monthly', 'Hver måned'], ['yearly', 'Hvert år']];
const EARLY = [['none', 'Ingen'], ['5m', '5 min før'], ['15m', '15 min før'], ['30m', '30 min før'], ['1h', '1 time før'], ['1d', '1 dag før'], ['2d', '2 dager før'], ['1w', '1 uke før']];
const PLACE = [['', 'Av'], ['store', 'Ved matbutikk'], ['home', 'Når jeg kommer hjem'], ['leave', 'Når jeg drar hjemmefra'], ['work', 'På jobb'], ['cabin', 'På hytta']];
const PRIO = [[0, 'Ingen'], [1, 'Lav'], [2, 'Middels'], [3, 'Høy']];
const avs = (L, size = 18) => (L.length ? `<span class="tk-avs" style="--s:${size}px" aria-hidden="true">${L.slice(0, 3).map((p) => `<i style="background:${esc(pColor(p))}">${esc(String(p.name ?? '?').slice(0, 1).toUpperCase())}</i>`).join('')}</span>` : '');
const navn = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);

function dueLabel(t) {
  const d = t.due;
  if (!d) return ['', ''];
  const n = daysTo(d), tm = t.time ? ` ${t.time}` : '';
  if (n < 0) return [`Forfalt ${-n} d`, 'late'];
  if (n === 0) return [`I dag${tm}`, 'late'];
  if (n === 1) return [`I morgen${tm}`, ''];
  return [new Date(d + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }) + tm, 'mut'];
}

async function load() {
  try {
    S.d = await api('/tasks'); S.err = null;
    const [a, st] = await Promise.all([api('/tasks?archived=1').catch(() => null), S.defList === undefined ? api('/tasks/settings').catch(() => null) : null]);
    if (st !== null || S.defList === undefined) S.defList = st?.defaultList ?? S.defList ?? null;
    const pool = new Map([...(a?.items ?? []), ...(S.d.items ?? [])].map((t) => [String(t.id), t]));
    S.arch = [...pool.values()].filter(isArch).sort((x, y) => (doneMs(y) ?? 0) - (doneMs(x) ?? 0));
    S.d.items = (S.d.items ?? []).filter((t) => !isArch(t));
    if (S.d.lists?.length && !S.d.lists.some((l) => 'owner' in l || 'ownerId' in l || 'members' in l)) {
      const r = await api('/tasks/lists').catch(() => null);
      if (Array.isArray(r?.lists)) S.d.lists = r.lists;
    }
    // Lokalt lagrede felter (når serveren ikke kjenner dem ennå) legges oppå.
    const loc = localExtra();
    for (const t of S.d.items) Object.assign(t, Object.fromEntries(Object.entries(loc[t.id] ?? {}).filter(([k]) => t[k] === undefined)));
  } catch (e) { S.err = e.message; }
  paint();
  if (S.cards !== false) loadCards();
}
// Felter serveren ikke lagrer ennå (eldre server) huskes i denne nettleseren, så detaljarket ikke mister dem ved omlasting.
const EXTRA = ['time', 'urgent', 'rep', 'early', 'prio', 'flag', 'tags', 'subs', 'place', 'origin', 'dl', 'pl', 'geo', 'wait']; // prompt 44: frist, sted (+ koordinater), venter på // prompt 41: origin = «Laget med Glimt»
const exKey = () => `tk37_extra_${myId() ?? 'x'}`;
const localExtra = () => { try { return JSON.parse(localStorage.getItem(exKey()) ?? '{}'); } catch { return {}; } };
function rememberExtra(t) { try { const m = localExtra(); m[t.id] = Object.fromEntries(EXTRA.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])); localStorage.setItem(exKey(), JSON.stringify(m)); } catch { /* */ } }

/* ---------- Infokort for valgt liste ---------- */
function infoCard(l) {
  if (!l) return '';
  const ppl = listPeople(l).filter((p) => p.id !== myId());
  const ic = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  if (isShared(l)) {
    const who = ppl.map((p) => p.name).filter(Boolean);
    return `<div class="tk-info">${ic}<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg><span class="tk-main"><b>${who.length ? `Delt med ${esc(navn(who))}` : 'Delt med deg'}</b><span class="tk-meta">${isMine(l) ? 'Alle i listen kan legge til, endre og krysse av.' : `Eies av ${esc(l.ownerName || nameOf(ownerOf(l)) || 'en annen')} · alle i listen kan legge til, endre og krysse av.`}</span></span><button type="button" class="tk-btn" data-tk-act="lsv">${isMine(l) ? 'Administrer' : 'Liste'}</button></div>`;
  }
  return `<div class="tk-info">${ic}<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span class="tk-main"><b>Bare du ser denne listen</b><span class="tk-meta">Privat. Del den for å gjøre den felles.</span></span><button type="button" class="tk-btn" data-tk-act="lsv">Del</button></div>`;
}

/* ---------- Glimt-kortet (inline på web) ---------- */
const SUGG = ['Påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned', 'Legg ukas matplan i handlelisten', 'Kjøp melk, egg og kaffe', 'Hva har jeg igjen i dag?', 'Hva er forfalt?', 'Når kjøpte vi sist kaffe?'];
const spk = (busy) => `<span class="tk-spk${busy ? ' busy' : ''}" aria-hidden="true"><i></i><b>✦</b></span>`;
function glimtCard() {
  const g = S.g;
  const ans = g.ans ? `<div class="tk-gans" role="status"><div class="tk-gat">${spk(false)}<span>${esc(g.ans.text)}</span></div>
      ${g.ans.items?.length ? `<div class="tk-gres">${g.ans.items.slice(0, 12).map((x) => `<span class="tk-gri"><span class="tk-dot" style="background:${esc(x.c ?? 'var(--t-ink)')}"></span><b>${esc(x.n)}</b>${x.m ? `<span class="tk-meta">${esc(x.m)}</span>` : ''}</span>`).join('')}</div>` : ''}
      ${g.ans.agent ? agentExtras(g.ans.agent, agentCbT()) : ''}
      <div class="tk-opts">${g.ans.undo ? '<button type="button" class="tk-gbtn" data-tk-g="undo">Angre</button>' : ''}<button type="button" class="tk-gbtn" data-tk-g="clear">Lukk</button></div></div>` : '';
  return `<section class="tk-glimt" aria-label="Glimt"><form class="tk-gf" data-tk-gform>${spk(!!g.busy)}<input name="gq" value="${esc(g.q)}" placeholder="${esc(g.busy || 'Spør Glimt eller skriv en oppgave …')}" autocomplete="off" maxlength="2000" aria-label="Spør Glimt eller skriv en oppgave"${g.busy ? ' disabled' : ''}>
      <label class="tk-gcam" title="Bilde av handlelapp eller oppskrift" aria-label="Legg ved bilde"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><input type="file" accept="image/*" data-tk-gimg hidden></label>
      <button type="submit" class="tk-gsend" aria-label="Send til Glimt"${g.busy ? ' disabled' : ''}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></form>
    <div class="tk-gsug">${SUGG.map((q) => `<button type="button" class="tk-gchip" data-tk-gq="${esc(q)}">${esc(q)}</button>`).join('')}</div>${ans}</section>`;
}

/* ---------- Glimt-kort i listen (holde orden og huske på) ---------- */
const tipHide = (k) => { try { return localStorage.getItem(`tk37_tip_${k}`) === '1'; } catch { return false; } };
const tipSet = (k) => { try { localStorage.setItem(`tk37_tip_${k}`, '1'); } catch { /* */ } };
// Prompt 45 (claude-code-gjoremal-glimt-forslag.md): «Ikke foreslå slike» slår av en forslagstype (huske_tip_off.pack) for brukeren.
let tipOff = null;
const tipOffGet = () => { if (tipOff) return tipOff; try { tipOff = JSON.parse(localStorage.getItem('huske_tip_off') || '{}') || {}; } catch { tipOff = {}; } api('/me/layout').then((l) => { if (l?.huske_tip_off && typeof l.huske_tip_off === 'object') { tipOff = { ...tipOff, ...l.huske_tip_off }; paint(); } }).catch(() => {}); return tipOff; };
document.addEventListener('hl:tip-off45', (e) => { tipOff = { ...(tipOff ?? {}), ...(e.detail ?? {}) }; if (S.d) paint(); });
function tipOffSet(kind, off = true) {
  tipOff = { ...tipOffGet(), [kind]: off };
  try { localStorage.setItem('huske_tip_off', JSON.stringify(tipOff)); } catch { /* */ }
  api('/me/layout', { method: 'PUT', json: { huske_tip_off: tipOff } }).catch(() => {});
}
// Serverens Glimt-kort (GET /api/tasks/glimt/cards) når de finnes; ellers lokale regler under.
const CARD_IC = { merge: ['M8 7h11v11H8zM5 4h11v2M5 4v11h2', '#3d7f8a'], overdue: ['M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18', '#b23a2a'], store: ['M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5', '#2f6b45'], packlist: ['M3 21h18M5 21V10l7-6 7 6v11M10 21v-5h4v5', '#a8661a'] };
const CARD_SUB = { merge: 'Slå sammen til én. Tagger og deloppgaver beholdes.', overdue: 'Flytt dem til i morgen, eller arkiver det som ikke trengs lenger.', store: 'Appen varsler når du er ved en matbutikk.', packlist: 'Fra kalenderen.' };
let cardsFor = null;
async function loadCards() {
  const k = S.cur;
  cardsFor = k;
  try { const r = await api(`/tasks/glimt/cards${k !== 'alle' && k !== 'arkiv' && k !== 'glimt41' ? `?list=${encodeURIComponent(k)}` : ''}`); if (cardsFor === k && Array.isArray(r?.cards)) { S.cards = r.cards; paint(); } }
  catch (er) { if (er.status === 404 && k === 'alle') S.cards = false; }
}
function srvTips() {
  // Prompt 39 (claude-code-gjoremal-glimt-forslag.md): pakkeliste bare for reise/hytte – ikke bursdager, prøver o.l.
  const ok = (c) => c.kind !== 'packlist' || (/hytt|reise|ferie|fjell|tur\b|camping|fly|tog|ski/i.test(c.event?.title ?? c.text ?? '') && !/bursdag|fødselsdag|prøve|eksamen|innlevering/i.test(c.event?.title ?? c.text ?? ''));
  const off = tipOffGet();
  return S.cards.map((c, i) => (ok(c) && !off[{ packlist: 'pack', merge: 'merge', overdue: 'late', store: 'store' }[c.kind] ?? c.kind] ? [c, i] : null)).filter(Boolean).map(([c, i]) => { const [ic, col] = CARD_IC[c.kind] ?? CARD_IC.merge; return `<div class="tk-tip"><span class="tk-tipi" style="--c:${col}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ic}"/></svg></span><span class="tk-main"><b>${esc(c.text)}</b>${CARD_SUB[c.kind] && !/\?$/.test(c.text) ? `<span class="tk-meta">${esc(c.kind === 'store' && c.list ? `${CARD_SUB.store.replace('Appen', `${c.list.name}: appen`)}` : CARD_SUB[c.kind])}</span>` : ''}</span><span class="tk-tipb">${(c.actions ?? []).map((a, j) => `<button type="button" class="tk-gbtn${j ? '' : ' pri'}" data-tk-card="${i}:${j}">${esc(a.label)}</button>`).join('')}${(c.actions ?? []).some((a) => a.action === 'dismiss') ? '' : `<button type="button" class="tk-gbtn" data-tk-card="${i}:x">Ikke nå</button>`}${c.kind === 'packlist' ? '<button type="button" class="tk-gbtn" data-tk-tip="off:pack">Ikke foreslå slike</button>' : ''}</span></div>`; }).join('');
}
async function cardAct(ref) {
  const [i, j] = ref.split(':'), c = S.cards?.[+i];
  if (!c) return;
  const a = j === 'x' ? { action: 'dismiss' } : c.actions?.[+j];
  if (!a) return;
  if (a.action === 'dismiss') { S.cards = S.cards.filter((x) => x !== c); paint(); api('/tasks/glimt/cards/dismiss', { method: 'POST', json: { key: c.key } }).catch(() => {}); return; }
  S.g.busy = 'Glimt jobber …'; paint();
  try {
    const r = await api('/tasks/glimt', { method: 'POST', json: { action: a.action, ids: c.ids, eventId: a.eventId ?? c.event?.id, list: c.list?.id } });
    setAns({ text: r.text ?? 'Ferdig.', items: (r.items ?? []).map(resItem), undo: r.undo?.token ? { token: r.undo.token } : null });
  } catch (er) { setAns({ text: er.message, items: [] }); }
  load();
}
function tips(inL) {
  if (Array.isArray(S.cards)) return srvTips();
  const out = [], norm = inL.map((t) => ({ id: t.id, n: tTitle(t), l: tList(t), done: t.done }));
  const off = tipOffGet();
  for (const d of off.merge ? [] : dupes(norm).slice(0, 2)) {
    const k = `dup_${d.l}_${d.n.toLowerCase()}`;
    if (!tipHide(k)) out.push({ ic: 'M8 7h11v11H8zM5 4h11v2M5 4v11h2', c: '#3d7f8a', t: `${d.ids.length}× «${d.n}» i ${listOf(d.l)?.name ?? 'listen'}`, s: 'Slå sammen til én. Tagger og deloppgaver beholdes.', b1: ['Slå sammen', `merge:${d.ids.join(',')}`], b2: ['Ikke nå', `hide:${k}`] });
  }
  const late = inL.filter((t) => !t.done && t.due && t.due < today());
  if (late.length >= 2 && !off.late && !tipHide(`late_${today()}`)) out.push({ ic: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18', c: '#b23a2a', t: `${late.length} gjøremål er forfalt`, s: 'Flytt dem til i morgen, eller arkiver det som ikke trengs lenger.', b1: ['Flytt til i morgen', 'late-move'], b2: ['Arkiver', 'late-arch'] });
  const handel = S.d.lists.find((l) => /handel|handle/i.test(l.name));
  const hItems = handel ? S.d.items.filter((t) => tList(t) === handel.id && !t.done) : [];
  if (hItems.length >= 2 && (S.cur === 'alle' || S.cur === handel.id) && !hItems.every((t) => t.place === 'store') && !off.store && !tipHide('store')) {
    out.push({ ic: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5', c: '#2f6b45', t: 'Påminn meg ved butikken', s: `${hItems.length} varer i ${handel.name}. Appen varsler når du er ved Kiwi, Rema eller Coop.`, b1: ['Slå på', 'store-on'], b2: ['Ikke nå', 'hide:store'] });
  }
  const ev = tripEvent();
  if (ev && !tipHide(`trip_${ev.key}`) && !off.pack) out.push({ b3: ['Ikke foreslå slike', 'off:pack'], ic: 'M3 21h18M5 21V10l7-6 7 6v11M10 21v-5h4v5', c: '#a8661a', t: `${ev.title} om ${ev.days} dager`, s: 'Fra kalenderen. Lage pakkeliste og huske brøyting?', b1: ['Lag pakkeliste', `pack:${ev.key}`], b2: ['Ikke nå', `hide:trip_${ev.key}`] });
  return out.map((x) => `<div class="tk-tip"><span class="tk-tipi" style="--c:${x.c}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${x.ic}"/></svg></span><span class="tk-main"><b>${esc(x.t)}</b><span class="tk-meta">${esc(x.s)}</span></span><span class="tk-tipb"><button type="button" class="tk-gbtn pri" data-tk-tip="${esc(x.b1[1])}">${esc(x.b1[0])}</button>${x.b2 ? `<button type="button" class="tk-gbtn" data-tk-tip="${esc(x.b2[1])}">${esc(x.b2[0])}</button>` : ''}${x.b3 ? `<button type="button" class="tk-gbtn" data-tk-tip="${esc(x.b3[1])}">${esc(x.b3[0])}</button>` : ''}</span></div>`).join('');
}
// Hytte/reise i kalenderen de neste 3–21 dagene (fra «Kommende» på Dashboard).
function tripEvent() {
  const up = store.data?.upcoming;
  const L = Array.isArray(up) ? up : up?.events ?? up?.items ?? [];
  for (const e of L) {
    const title = e.title ?? e.summary ?? '', date = String(e.date ?? e.start ?? '').slice(0, 10);
    if (!/hytt|hafjell|reise|ferie|fjellet/i.test(title) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const days = daysTo(date);
    if (days >= 3 && days <= 21) return { title, days, date, key: `${date}_${title.toLowerCase().replace(/\W+/g, '')}`.slice(0, 60) };
  }
  return null;
}

/* ---------- Rader ---------- */
function row(t, i) {
  const [dt, dc] = dueLabel(t), c = colorOf(tList(t));
  const subs = Array.isArray(t.subs) ? t.subs : [];
  const meta = [dt, t.rep && t.rep !== 'none' ? '↻' : '', t.urgent ? '⏰' : '', subs.length ? `${subs.filter((x) => x.done).length}/${subs.length}` : '', nameOf(tWho(t)),
    S.cur === 'alle' || S.cur === 'arkiv' ? listOf(tList(t))?.name ?? '' : '', ...(t.tags ?? []).map((x) => `#${x}`)].filter(Boolean).join(' · ');
  const pre = `${t.flag ? '<span class="tk-flag" aria-label="Flagget">⚑</span>' : ''}${t.prio ? `<span class="tk-prio">${'!'.repeat(Math.min(3, +t.prio))}</span>` : ''}`;
  return `<div class="tk-row${t.done ? ' done' : ''}${i ? ' bt' : ''}">
    <button type="button" class="tk-chk" style="--c:${esc(c)}" data-tk-tick="${esc(t.id)}" aria-label="${t.done ? 'Marker som ikke gjort' : 'Fullfør'}" aria-pressed="${t.done}">${t.done ? '✓' : ''}</button>
    <button type="button" class="tk-main tk-open" data-tk-ed="${esc(t.id)}" aria-label="Detaljer for ${esc(tTitle(t))}"><span class="tk-n">${pre}${esc(tTitle(t))}</span>${meta ? `<span class="tk-meta ${t.done ? '' : dc}">${esc(meta)}</span>` : ''}</button>
    ${S.cur === 'arkiv' ? `<button type="button" class="tk-restore" data-tk-restore="${esc(t.id)}">↺ Gjenopprett</button>` : t.done ? `<button type="button" class="tk-x tk-arc" data-tk-arch="${esc(t.id)}" aria-label="Arkiver ${esc(tTitle(t))}" title="Arkiver">${ARCH_SVG}</button>` : ''}
    ${S.cur === 'arkiv' || t.done ? '' : subBtn(t)}<button type="button" class="tk-x" data-tk-del="${esc(t.id)}" aria-label="${S.cur === 'arkiv' ? 'Slett for godt' : 'Slett'} ${esc(tTitle(t))}">×</button>
  </div>${S.cur === 'arkiv' ? '' : subRows(t)}`;
}

function body() {
  if (S.err && !S.d) return `<div class="card tk-card"><div class="tk-empty">Kunne ikke hente gjøremålene: ${esc(S.err)}<br><button type="button" class="tk-btn" data-tk-act="retry">Prøv igjen</button></div></div>`;
  if (!S.d) return '<div class="card tk-card"><div class="tk-empty">Laster …</div></div>';
  const items = S.d.items ?? [], lists = S.d.lists ?? [], ARC = S.cur === 'arkiv';
  const inL = ARC ? S.arch : items.filter((t) => S.cur === 'alle' || tList(t) === S.cur);
  const t0 = today();
  const od = inL.filter((t) => !t.done && t.due && t.due <= t0).sort((a, b) => a.due.localeCompare(b.due) || (b.prio ?? 0) - (a.prio ?? 0));
  const later = inL.filter((t) => !t.done && !(t.due && t.due <= t0)).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const done = inL.filter((t) => t.done).sort((a, b) => (doneMs(b) ?? 0) - (doneMs(a) ?? 0)).slice(0, 30);
  const curName = S.cur === 'alle' ? 'Alle' : ARC ? 'Arkivert' : listOf(S.cur)?.name ?? S.cur;
  const chip = (id, name, color) => {
    const n = id === 'arkiv' ? S.arch.length : (id === 'alle' ? items : items.filter((t) => tList(t) === id)).filter((t) => !t.done).length;
    const l = id === 'alle' || id === 'arkiv' ? null : listOf(id), sh = isShared(l);
    return `<button type="button" class="tk-list${S.cur === id ? ' on' : ''}" data-tk-list="${esc(id)}" aria-pressed="${S.cur === id}"${sh ? ' title="Delt liste · trykk igjen for å administrere"' : l ? ' title="Trykk igjen for å endre listen"' : ''}>${l ? `<span class="tk-dot" style="background:${esc(color)}"></span>` : ''}${esc(name)}${sh ? avs(listPeople(l)) : ''}<span class="tk-k">${n}</span></button>`;
  };
  const opt = (kind, v, n, on) => `<button type="button" class="tk-opt${on ? ' on' : ''}" data-tk-${kind}="${v ?? ''}" aria-pressed="${on}">${esc(n)}</button>`;
  const group = (title, cls, arr, act = '') => (arr.length ? `<section class="tk-group"><span class="tk-gh"><span class="tk-gt ${cls}">${title}</span>${act}</span><div class="card tk-card">${arr.map(row).join('')}</div></section>` : '');
  const actBtn = (k, n) => `<button type="button" class="tk-gbtn" data-tk-act="${k}"${S.busy ? ' disabled' : ''}>${n}</button>`;
  const lists2 = `<div class="tk-lists">${chip('alle', 'Alle', 'var(--t-ink)')}${lists.map((l) => chip(l.id, l.name, l.color)).join('')}${chip('arkiv', 'Arkivert', 'var(--t-mut)')}${mwChip41()}<button type="button" class="tk-list tk-new" data-tk-act="newlist">+ Ny liste</button></div>`;
  if (S.cur === 'glimt41' && !wide()) return `${lists2}${jobsHtml41()}${madeWithHtml41([...items, ...S.arch], { listName: (t) => listOf(tList(t))?.name ?? '', title: tTitle })}`;
  if (ARC && wide()) return webBody(S.arch, curName);
  if (ARC) {
    return `${lists2}${group(`ARKIVERT · ${S.arch.length}`, 'mut', S.arch, actBtn('arch-clear', 'Tøm arkivet'))}
      ${S.arch.length ? '' : '<div class="tk-empty">Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager.</div>'}
      <div class="tk-foot">Arkiverte oppgaver telles ikke i lister, widgets eller på Hjem. ↺ Gjenopprett legger oppgaven tilbake som åpen i sin liste.</div>`;
  }
  if (wide()) return webBody(inL, curName); // prompt 39: 2a = sidemeny + detaljer (1a) med tavle (1b) som visning
  const curL = S.cur === 'alle' ? null : listOf(S.cur);
  const allowed = curL ? new Set(listPeople(curL).map((p) => p.id)) : null;
  const who = [[null, 'Meg'], ...people().filter((m) => m.id !== myId() && (!allowed || allowed.has(m.id))).map((m) => [m.id, m.name])];
  return `${lists2}
    ${infoCard(curL)}
    ${glimtCard()}
    ${jobsHtml41()}
    ${tips(inL)}
    <form class="tk-add" data-tk-form><input name="title" value="${esc(S.nv)}" placeholder="Ny oppgave i ${esc(curName)}" autocomplete="off" maxlength="200" aria-label="Ny oppgave"><button type="submit" aria-label="Legg til"${S.busy ? ' disabled' : ''}>+</button></form>
    <div class="tk-opts">${[[0, 'I dag'], [1, 'I morgen'], [7, 'Neste uke'], [null, 'Uten dato']].map(([v, n]) => opt('due', v, n, S.nd === v)).join('')}<span class="tk-sep"></span>${who.map(([v, n]) => opt('who', v, n, S.nw === v)).join('')}</div>
    ${group('I DAG OG FORFALT', 'late', od)}${group('SENERE', 'mut', later)}${group('FERDIG', 'pos', done, actBtn('arch-all', 'Arkiver alle'))}
    ${inL.length ? '' : `<div class="tk-empty">Ingen oppgaver i ${esc(curName)}.</div>`}
    ${isAdmin() ? haRow() : ''}
    <div class="tk-foot">${liveOn() ? '● Sanntid' : 'Oppdateres automatisk'} · Dine lister er private. Delte lister ser alle medlemmene. Trykk på en oppgave for detaljer.</div>`;
}

/* ---------- Detaljarket ---------- */
const sw = (on, attr) => `<button type="button" class="tk-sw${on ? ' on' : ''}" ${attr} role="switch" aria-checked="${!!on}"><i></i></button>`;
const ib = (c, d) => `<span class="tk-ib" style="--c:${c}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg></span>`;
const sel = (k, list, v) => `<select class="tk-sel" data-tk-f="${k}" aria-label="${k}">${list.map(([a, b]) => `<option value="${esc(a)}"${String(v ?? '') === String(a) ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function edSheet() {
  const t = S.ed && (S.d?.items.find((x) => String(x.id) === S.ed) ?? S.arch.find((x) => String(x.id) === S.ed));
  if (!t) return '';
  const l = listOf(tList(t)), subs = Array.isArray(t.subs) ? t.subs : [], tags = t.tags ?? [];
  const mem = l ? listPeople(l) : people();
  const g = guess(tTitle(t), people()), gl = g.l ? S.d.lists.find((x) => x.name.toLowerCase() === g.l) : null;
  const sugg = [gl && gl.id !== tList(t) ? gl.name : null, g.who && g.who.id !== tWho(t) ? g.who.name : null, ...g.tags.filter((x) => !tags.includes(x)).map((x) => `#${x}`), g.place && t.place !== g.place ? (g.place === 'store' ? 'påminn ved butikk' : 'påminn på hytta') : null].filter(Boolean);
  const notes = tNotes(t);
  return `<div class="tk-back" data-tk-close><div class="tk-sheet" role="dialog" aria-modal="true" aria-label="Detaljer">
    <div class="tk-sh"><button type="button" class="tk-round" data-tk-close aria-label="Lukk">✕</button><b>Detaljer</b><button type="button" class="tk-done" data-tk-close>Ferdig</button></div>
    <div class="tk-sc">
    <div class="tk-c"><input class="tk-ti" data-tk-f="title" value="${esc(tTitle(t))}" maxlength="200" aria-label="Tittel"><textarea class="tk-no" data-tk-f="notes" rows="3" placeholder="Notater og lenke" aria-label="Notater og lenke">${esc(notes)}</textarea>${/https?:\/\//.test(notes) ? `<div class="tk-links">${linkify(notes.match(/https?:\/\/\S+/g).join(' '))}</div>` : ''}</div>
    ${originCard41(t)}
    <span class="tk-gt">DATO OG TID</span>
    <div class="tk-c">
      <div class="tk-r">${ib('#b23a2a', 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4')}<span class="tk-rl"><b>Dato</b>${t.due ? `<input type="date" class="tk-in" data-tk-f="due" value="${esc(t.due)}" aria-label="Dato">` : ''}</span>${sw(!!t.due, 'data-tk-sw="due"')}</div>
      <div class="tk-r">${ib('#2b5d8a', 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18')}<span class="tk-rl"><b>Tid</b>${t.time ? `<input type="time" class="tk-in" data-tk-f="time" value="${esc(t.time)}" aria-label="Tid">` : ''}</span>${sw(!!t.time, 'data-tk-sw="time"')}</div>
      <div class="tk-r">${ib('#e8573a', 'M12 8v4l2 2M5 3L2 6M19 3l3 3M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16')}<span class="tk-rl"><b>Viktig</b></span>${sw(!!t.urgent, 'data-tk-sw="urgent"')}</div>
    </div>
    <span class="tk-hint">Viktige oppgaver ringer som en alarm, også i Fokus og stille-modus.</span>
    <div class="tk-c">
      <div class="tk-r">${ib('#2f6b45', 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3')}<span class="tk-rl"><b>Gjenta</b></span>${sel('rep', REP, t.rep ?? 'none')}</div>
      <div class="tk-r">${ib('#7a5ad6', 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4')}<span class="tk-rl"><b>Tidlig påminnelse</b></span>${sel('early', EARLY, t.early ?? 'none')}</div>
    </div>
    <div class="tk-c"><div class="tk-r">${ib('#2f6b45', 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5')}<span class="tk-rl"><b>Påminn på sted</b></span>${sel('place', PLACE, t.place ?? '')}</div></div>
    <span class="tk-gt">ORGANISERING</span>
    <div class="tk-c">
      ${sugg.length ? `<div class="tk-sugg">${spk(false)}<span>Glimt foreslår: ${esc(sugg.join(' · '))}</span><button type="button" class="tk-gbtn" data-tk-ed-act="sugg">Bruk</button></div>` : ''}
      <div class="tk-blk"><b>Liste</b><div class="tk-opts">${S.d.lists.map((x) => `<button type="button" class="tk-opt${x.id === tList(t) ? ' on' : ''}" data-tk-edl="${esc(x.id)}" aria-pressed="${x.id === tList(t)}"><span class="tk-dot" style="background:${esc(x.color)}"></span>${esc(x.name)}</button>`).join('')}</div></div>
      <div class="tk-blk"><b>Ansvarlig</b><div class="tk-opts">${[...mem.map((p) => [p.id, p.id === myId() ? `${p.name || 'Meg'}` : p.name]), [null, 'Ingen']].map(([id, n]) => `<button type="button" class="tk-opt${(tWho(t) ?? null) === id ? ' on' : ''}" data-tk-edw="${esc(id ?? '')}" aria-pressed="${(tWho(t) ?? null) === id}">${esc(n)}</button>`).join('')}</div></div>
      <div class="tk-blk"><b>Prioritet</b><div class="tk-seg">${PRIO.map(([v, n]) => `<button type="button" class="${(+t.prio || 0) === v ? 'on' : ''}" data-tk-edp="${v}" aria-pressed="${(+t.prio || 0) === v}">${v ? `<i>${'!'.repeat(v)}</i> ` : ''}${n}</button>`).join('')}</div></div>
      <div class="tk-r">${ib('#e8794a', 'M5 21V4h11l-2 4 2 4H5')}<span class="tk-rl"><b>Flagg</b></span>${sw(!!t.flag, 'data-tk-sw="flag"')}</div>
      <div class="tk-blk"><b>Tagger</b><div class="tk-opts">${tags.map((x) => `<button type="button" class="tk-tag" data-tk-untag="${esc(x)}" title="Fjern">#${esc(x)} ×</button>`).join('')}<input class="tk-tagin" data-tk-tagin value="${esc(S.tagIn)}" placeholder="#tagg + Enter" aria-label="Ny tagg" maxlength="30"></div></div>
      <div class="tk-blk"><span class="tk-bh"><b>Deloppgaver</b>${subs.length ? `<span class="tk-meta">${subs.filter((x) => x.done).length} / ${subs.length}</span>` : ''}</span>
        ${subs.map((x, i) => `<div class="tk-subr"><button type="button" class="tk-chk sm${x.done ? ' on' : ''}" style="--c:${esc(colorOf(tList(t)))}" data-tk-subt="${i}" aria-pressed="${!!x.done}" aria-label="Fullfør deloppgave">${x.done ? '✓' : ''}</button><span class="${x.done ? 'tk-sdone' : ''}">${esc(x.n)}</span><button type="button" class="tk-x sm" data-tk-subx="${i}" aria-label="Fjern deloppgave">×</button></div>`).join('')}
        <div class="tk-subr"><span class="tk-subp">+</span><input class="tk-subin" data-tk-subin value="${esc(S.subIn)}" placeholder="Ny deloppgave" aria-label="Ny deloppgave" maxlength="120"></div>
        <button type="button" class="tk-gbtn tk-split" data-tk-ed-act="split"${S.splitBusy ? ' disabled' : ''}>${S.splitBusy ? 'Glimt tenker …' : '✦ Del opp med Glimt'}</button></div>
    </div>
    <button type="button" class="tk-delb" data-tk-ed-act="del">Slett oppgave</button>
    </div></div></div>`;
}

/* ---------- Listearket ---------- */
function listSheet() {
  const v = S.lsv;
  if (!v) return '';
  const l = v.id ? listOf(v.id) : null, owner = !l || isMine(l);
  const ppl = people(), on = new Set([myId(), ...v.mem]);
  const hint = on.size > 1 ? 'Delt liste: alle her ser og kan endre oppgavene.' : 'Privat liste: bare du ser den.';
  return `<div class="tk-back" data-tk-lclose><div class="tk-sheet sm" role="dialog" aria-modal="true" aria-label="${l ? 'Liste' : 'Ny liste'}">
    <div class="tk-sh"><button type="button" class="tk-round" data-tk-lclose aria-label="Lukk">✕</button><b>${l ? 'Liste' : 'Ny liste'}</b>${owner ? `<button type="button" class="tk-done" data-tk-lsave${v.busy ? ' disabled' : ''}>${l ? 'Lagre' : 'Opprett'}</button>` : '<span></span>'}</div>
    <div class="tk-sc">
    <div class="tk-c"><input class="tk-ti" data-tk-lname value="${esc(v.name)}" placeholder="Navn på listen" maxlength="40" aria-label="Navn"${owner ? '' : ' readonly'}>
      <div class="tk-sws">${LCOL.map((c) => `<button type="button" class="tk-swc${v.color === c ? ' on' : ''}" style="--c:${c}" data-tk-lcol="${c}" aria-label="Farge ${c}" aria-pressed="${v.color === c}"${owner ? '' : ' disabled'}></button>`).join('')}</div></div>
    <span class="tk-gt">DEL MED</span>
    <div class="tk-c">${ppl.map((p) => { const self = p.id === myId(), o = on.has(p.id); return `<div class="tk-r"><span class="tk-av" style="background:${esc(pColor(p))}">${esc(String(p.name ?? '?').slice(0, 1).toUpperCase())}</span><span class="tk-rl"><b>${esc(p.name)}${self ? ' (deg)' : ''}</b></span>${self || !owner ? `<span class="tk-sw on${self || !owner ? ' ro' : ''}" aria-hidden="true"${o ? '' : ' style="opacity:.35"'}><i></i></span>` : sw(o, `data-tk-lmem="${esc(p.id)}"`)}</div>`; }).join('') || '<div class="tk-r"><span class="tk-meta">Ingen andre i husstanden ennå.</span></div>'}</div>
    <span class="tk-hint">${esc(owner ? hint : 'Bare eieren kan endre navn, farge og medlemmer.')}</span>
    ${v.err ? `<span class="tk-hint err" role="alert">${esc(v.err)}</span>` : ''}
    ${l ? (owner ? '<button type="button" class="tk-delb" data-tk-lact="del">Slett listen</button>' : '<button type="button" class="tk-delb" data-tk-lact="leave">Forlat listen</button>') : ''}
    </div></div></div>`;
}

/* ---------- Tegning ---------- */
const isAdmin = () => store.me?.me?.role === 'admin';
let haEl = null, haCtl = null;
function placeHa(h) {
  const slot = h.querySelector('.tk-ha-slot');
  if (!slot) return;
  if (!haEl) { haEl = document.createElement('div'); haEl.className = 'tk-group'; haCtl = mountHa(haEl, { lists: () => Promise.resolve(S.d?.lists ?? []) }); }
  slot.replaceWith(haEl);
}
let layer = null;
function paintSheets() {
  const html = edSheet() + listSheet();
  if (!html) { if (layer) { layer.remove(); layer = null; document.body.classList.remove('tk-sheet-open'); document.dispatchEvent(new CustomEvent('huske-sheet', { detail: { open: false } })); } return; }
  const first = !layer;
  if (!layer) { layer = document.createElement('div'); layer.className = 'tk tk-layer'; document.body.appendChild(layer); bindSheet(layer); document.body.classList.add('tk-sheet-open'); document.dispatchEvent(new CustomEvent('huske-sheet', { detail: { open: true } })); }
  const sc = layer.querySelector('.tk-sc')?.scrollTop ?? 0, a = document.activeElement;
  const keep = a && layer.contains(a) ? { sel: a.dataset.tkF ? `[data-tk-f="${a.dataset.tkF}"]` : a.matches('[data-tk-tagin]') ? '[data-tk-tagin]' : a.matches('[data-tk-subin]') ? '[data-tk-subin]' : a.matches('[data-tk-lname]') ? '[data-tk-lname]' : null, pos: a.selectionStart } : null;
  layer.innerHTML = html;
  const nsc = layer.querySelector('.tk-sc'); if (nsc) nsc.scrollTop = sc;
  if (keep?.sel) { const n = layer.querySelector(keep.sel); n?.focus(); try { if (keep.pos != null) n.setSelectionRange(keep.pos, keep.pos); } catch { /* */ } }
  if (first) setTimeout(() => layer?.querySelector(S.lsv && !S.lsv.id ? '[data-tk-lname]' : '.tk-done, [data-tk-close].tk-round')?.focus({ preventScroll: true }), 30);
}
function paint() {
  const h = host();
  if (!h) { if (layer) { S.ed = null; S.lsv = null; paintSheets(); } return; }
  const act = document.activeElement, focusAdd = act?.closest?.('[data-tk-form]') && act.name === 'title', focusG = act?.closest?.('[data-tk-gform]');
  const focusSub = act?.name === 'tk44sub' ? act.closest('[data-tk44-addform]')?.dataset.tk44Addform : null; // prompt 44
  if (haEl && h.contains(haEl)) haEl.remove();
  h.innerHTML = body();
  placeHa(h);
  if (focusAdd) { const i = h.querySelector('[data-tk-form] input'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
  if (focusG && !S.g.busy) { const i = h.querySelector('[data-tk-gform] input'); i?.focus(); }
  if (focusSub) { const i = h.querySelector(`[data-tk44-addform="${CSS.escape(focusSub)}"] input`); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  paintSheets();
  refresh44();
}

/* ---------- Lagring ---------- */
// Sender både de gamle feltnavnene (title/list/assignee/note) og de nye for prompt 37.
function wire(ch) {
  const o = { ...ch };
  if ('title' in ch) o.n = ch.title;
  if ('list' in ch) o.l = ch.list;
  if ('assignee' in ch) o.who = ch.assignee;
  if ('notes' in ch) o.note = ch.notes;
  return o;
}
async function patchItem(t, ch) {
  Object.assign(t, ch);
  if ('notes' in ch) t.note = ch.notes;
  rememberExtra(t);
  try {
    const r = await api(`/tasks/${encodeURIComponent(t.id)}`, { method: 'PATCH', json: wire(ch) });
    const it = r?.item ?? r;
    if (it && it.id === t.id) { const keep = Object.fromEntries(EXTRA.filter((k) => t[k] !== undefined && it[k] === undefined).map((k) => [k, t[k]])); Object.assign(t, it, keep); }
    // Gjentagende oppgave fullført: serveren lager neste forekomst (nextItem), ellers gjøres det her.
    if (r?.next?.id && !S.d.items.some((x) => x.id === r.next.id)) S.d.items.unshift(r.next);
  } catch (er) { flash(er.message); }
}
function patchSoon(t, ch) { Object.assign(t, ch); if ('notes' in ch) t.note = ch.notes; clearTimeout(saveT); saveT = setTimeout(() => patchItem(t, ch), 450); }
const NEXT = { daily: 1, weekly: 7, biweekly: 14 };
function nextDue(t) {
  const d = new Date(`${t.due ?? today()}T12:00`);
  if (NEXT[t.rep]) d.setDate(d.getDate() + NEXT[t.rep]);
  else if (t.rep === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
  else if (t.rep === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (t.rep === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString('sv-SE');
}
async function createItem(o) {
  const json = wire({ title: o.n, list: o.list, due: o.due ?? null, assignee: o.who ?? null, ...(o.notes ? { notes: o.notes } : {}), ...Object.fromEntries(EXTRA.filter((k) => o[k] !== undefined && o[k] !== null && !(Array.isArray(o[k]) && !o[k].length)).map((k) => [k, o[k]])) });
  const r = await api('/tasks', { method: 'POST', json });
  const it = r.item ?? r;
  if (it?.id) { for (const k of EXTRA) if (o[k] !== undefined && it[k] === undefined) it[k] = o[k]; rememberExtra(it); if (!S.d.items.some((x) => x.id === it.id)) S.d.items.unshift(it); }
  return it;
}
// Nye oppgaver fra «Alle» havner i standardlisten (GET /api/tasks/settings → defaultList, ellers «Mine», ellers første liste).
const defaultList = () => (S.cur !== 'alle' && S.cur !== 'arkiv' && S.cur !== 'glimt41' ? S.cur : (S.defList && listOf(S.defList) ? S.defList : null) ?? S.d.lists.find((l) => l.kind === 'mine' || /^mine$/i.test(l.name))?.id ?? S.d.lists[0]?.id ?? 'hjem');
const listByKey = (k) => (k ? S.d.lists.find((l) => l.name.toLowerCase() === k || l.id === k) : null);

let flashT = null;
function flash(msg) {
  let el = document.getElementById('tk-flash');
  if (!el) { el = document.createElement('div'); el.id = 'tk-flash'; el.className = 'tk-flash'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------- Glimt ---------- */
const resItem = (t) => { const l = listOf(tList(t)); return { n: tTitle(t), c: l?.color, m: [l?.name, nameOf(tWho(t)), ...(t.tags ?? []).map((x) => `#${x}`)].filter(Boolean).join(' · ') }; };
function setAns(a) {
  S.g.ans = a; S.g.busy = ''; clearTimeout(undoT);
  if (a?.undo) undoT = setTimeout(() => { if (S.g.ans === a) { a.undo = null; paint(); } }, 10_000);
  paint();
}
async function glimtRun(q, { image = null } = {}) {
  q = String(q ?? '').trim();
  if (!q && !image) return;
  // Prompt 45: tekst går til den felles Glimt-agenten (module tasks). Bilder og eldre server: som før.
  if (!image && agentOn()) {
    S.g.q = ''; S.g.ans = null; S.g.busy = 'Glimt jobber …'; paint();
    try {
      const a = await agent(q, 'tasks', { listId: S.cur !== 'alle' && S.cur !== 'arkiv' && S.cur !== 'glimt41' ? S.cur : undefined, selectedId: S.ed ?? S.sel ?? undefined });
      if (a) { setAgentAns(a); if (a.done.length) load(); return; }
    } catch (er) { setAns({ text: `Glimt fikk ikke svar: ${er.message}`, items: [] }); return; }
    S.g.busy = '';
  }
  // Prompt 41: lange beskjeder deles opp av AI i bakgrunnen. Feltet tømmes med en gang; en stiplet rad viser jobben.
  if (!image && !isAsk(q) && needsAi41(q)) {
    S.g.q = ''; S.g.ans = null;
    try {
      const r = await startJob41(q, { list: S.cur !== 'alle' && S.cur !== 'arkiv' && S.cur !== 'glimt41' ? S.cur : undefined, paint, load });
      if (r.ok && !r.sync) return;
      if (r.ok && r.sync) { const x = r.sync; setAns({ text: x.text ?? 'Ferdig.', items: (x.items ?? []).map(resItem), undo: x.undo?.token ? { token: x.undo.token } : null }); load(); return; }
      return localSplit41(q);
    } catch (er) { setAns({ text: `Glimt fikk ikke svar: ${er.message}`, items: [] }); return; }
  }
  S.g.q = ''; S.g.busy = image ? 'Leser bildet …' : isAsk(q) ? 'Tenker …' : 'Glimt jobber …'; paint();
  try {
    const r = await api('/tasks/glimt', { method: 'POST', json: { q, list: S.cur !== 'alle' && S.cur !== 'arkiv' ? S.cur : undefined, image: image ?? undefined } });
    const items = (r.items ?? []).map((x) => (x.id != null && !S.d.items.some((y) => y.id === x.id) && r.kind === 'add' ? (S.d.items.unshift(x), x) : x));
    setAns({ text: r.text ?? 'Ferdig.', items: items.map((x) => (x.n && !x.title && x.c ? x : resItem(x))), undo: r.undo?.token ? { token: r.undo.token } : null });
    if (r.kind === 'add' || r.kind === 'action') load();
    return;
  } catch (er) {
    if (er.status !== 404 && er.status !== 405 && er.status !== 501) { setAns({ text: `Glimt fikk ikke svar: ${er.message}`, items: [] }); return; }
  }
  // Lokal tolker (eldre server).
  if (image) return setAns({ text: 'Bildelesing krever Glimt på serveren. Skriv varene i stedet, eller lim inn en liste.', items: [] });
  try { await localGlimt(q); } catch (er) { setAns({ text: er.message, items: [] }); }
}
/* Prompt 45: svaret fra agenten i Glimt-kortet. Oppgaver som ble laget kan angres i 10 s (slettes igjen). */
function setAgentAns(a) {
  const made = a.done.filter((x) => /^tasks\.(create|add)/.test(x.tool ?? '')).flatMap((x) => (Array.isArray(x.result?.items) ? x.result.items : x.result?.id ? [x.result] : []));
  const items = made.length ? made.map((x) => (x.id != null && S.d?.items && !S.d.items.some((y) => String(y.id) === String(x.id)) ? (S.d.items.unshift(x), resItem(x)) : resItem(x)))
    : a.results.filter((r) => r.kind === 'task').map((r) => ({ n: r.title ?? '', c: r.color, m: [r.subtitle, r.date].filter(Boolean).join(' · ') }));
  setAns({ text: agentText(a, { plain: true }) || 'Ferdig.', items, undo: made.length ? { ids: made.map((x) => x.id).filter((x) => x != null) } : null, agent: a.ask || a.confirm || a.results.some((r) => r.kind !== 'task') ? a : null });
}
const agentCbT = () => ({
  resend: async (t, ctx) => { S.g.busy = 'Glimt jobber …'; paint(); try { const a = await agent(t, 'tasks', { listId: S.cur !== 'alle' && S.cur !== 'arkiv' ? S.cur : undefined, ...ctx }); if (a) { setAgentAns(a); if (a.done.length) load(); } } catch (er) { setAns({ text: er.message, items: [] }); } },
  update: (a) => { setAgentAns(a); if (a.done.length) load(); },
  open: (r) => { if (r.kind !== 'task' || !r.id) return false; const t = S.d?.items?.find((x) => String(x.id) === String(r.id)); if (!t) return false; S.ed = String(t.id); S.tagIn = ''; S.subIn = ''; paintSheets(); return true; },
});
/** Lokal reserve for lange beskjeder (eldre server): ett punkt per handling, note på begrunnelsen, «Laget med Glimt» lokalt. */
async function localSplit41(q) {
  const P = splitLocal41(q), at = new Date().toISOString(), made = [];
  for (const p of P) {
    const g = guess(p.n, people()), l = listByKey(g.l) ?? listOf(defaultList());
    const it = await createItem({ n: p.n, list: l?.id, notes: p.note || undefined, origin: { text: q, at, engine: 'lokal' } });
    if (it && !it.origin) it.origin = { text: q, at, engine: 'lokal' };
    made.push(it);
  }
  setAns({ text: `Glimt lagde ${made.length} punkter i riktig rekkefølge (uten AI).`, items: made.map(resItem), undo: { ids: made.map((x) => x.id) } });
}
const norm = (t) => ({ id: t.id, n: tTitle(t), l: tList(t), who: tWho(t), whoName: nameOf(tWho(t)), byName: nameOf(t.createdBy ?? t.by), due: t.due, done: t.done, doneAt: doneMs(t) });
/* Prompt 41: «Laget med Glimt»-fanen. */
const mwN41 = () => (S.d ? glimtSources41([...(S.d.items ?? []), ...(S.arch ?? [])]).length : 0);
function mwChip41() { const n = mwN41(); return n ? `<button type="button" class="tk-list${S.cur === 'glimt41' ? ' on' : ''}" data-tk-list="glimt41" aria-pressed="${S.cur === 'glimt41'}"><span class="tk-dot tk41-red"></span>Laget med Glimt<span class="tk-n">${n}</span></button>` : ''; }
async function act41(a, key) {
  if (a === 'x') { clearDone41(); return paint(); }
  if (a === 'see' || a === 'open') { clearDone41(); S.ed = null; paintSheets(); S.cur = 'glimt41'; return paint(); }
  const all = [...S.d.items, ...S.arch], L = srcItems41(all, key);
  if (!L.length) return;
  if (a === 'forget') {
    if (!confirm('Glemme beskjeden? Punktene blir liggende.')) return;
    const ok = await api(`/tasks/glimt/sources/${encodeURIComponent(key)}`, { method: 'DELETE' }).then(() => true).catch(() => false);
    if (!ok) await Promise.all(L.map((t) => api(`/tasks/${encodeURIComponent(t.id)}`, { method: 'PATCH', json: { origin: null } }).catch(() => null)));
    for (const t of L) delete t.origin;
    return paint();
  }
  if (a === 'redo') {
    const text = L[0].origin.text, open = L.filter((t) => !t.done);
    try { const r = await api(`/tasks/glimt/sources/${encodeURIComponent(key)}/redo`, { method: 'POST', json: {} }); if (r?.jobId) { S.d.items = S.d.items.filter((x) => !open.includes(x)); trackJob41(r.jobId, text, { paint, load }); return; } } catch (er) { if (er.status !== 404) { flash(er.message); return; } }
    S.d.items = S.d.items.filter((x) => !open.includes(x)); paint();
    await Promise.all(open.map((t) => api(`/tasks/${encodeURIComponent(t.id)}`, { method: 'DELETE' }).catch(() => null)));
    return glimtRun(text);
  }
}
async function localGlimt(q) {
  if (/matplan|middagene|ukas mat|handleliste fra mat/i.test(q)) return matplan();
  if (/hytt.*(pakke|pakkeliste)|pakkeliste/i.test(q)) return packList();
  if (/rydd|forfalte/i.test(q) && !/\?/.test(q)) return setAns({ text: 'Bruk kortet i listen: flytt de forfalte til i morgen eller arkiver dem.', items: [] });
  if (isAsk(q)) {
    const all = [...S.d.items, ...S.arch].map(norm);
    const A = gAsk(q, all, { lists: S.d.lists, today: today() });
    return setAns(A ? { text: A.text, items: A.items.map((x) => resItem(S.d.items.find((y) => y.id === x.id) ?? S.arch.find((y) => y.id === x.id) ?? { title: x.n, list: x.l })) } : { text: 'Det vet jeg ikke her. Spør meg i Chat for mer.', items: [] });
  }
  return addParsed(gParse(q, { people: people() }));
}
async function addParsed(P, tag) {
  const made = [];
  for (const p of P) {
    const l = listByKey(p.lk) ?? listOf(defaultList());
    made.push(await createItem({ n: p.n, list: l?.id, due: p.due, who: p.who, time: p.time ?? undefined, urgent: p.urgent || undefined, rep: p.rep !== 'none' ? p.rep : undefined, early: p.early !== 'none' ? p.early : undefined, tags: tag ? [...new Set([...(p.tags ?? []), tag])] : p.tags }));
  }
  const one = made[0], ln = listOf(tList(one));
  const p0 = P[0], dd = one?.due ? new Date(`${one.due}T12:00`).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const text = made.length > 1 ? `La ${made.length} gjøremål i ${navn([...new Set(made.map((x) => listOf(tList(x))?.name).filter(Boolean))])}.`
    : `La til «${tTitle(one)}» i ${ln?.name ?? 'listen'}${dd ? ` · ${dd}` : ''}${p0.time ? ` kl. ${p0.time}` : ''}${p0.urgent ? ' · viktig (alarm)' : ''}${p0.rep !== 'none' ? ' · gjentas' : ''}${p0.who ? ` · ${nameOf(p0.who)}` : ''}.`;
  setAns({ text, items: made.map(resItem), undo: { ids: made.map((x) => x.id) } });
}
async function matplan() {
  S.g.busy = 'Leser ukas matplan …'; paint();
  let names = [], ing = [];
  try {
    const m = await api('/mat/plan').catch(() => api('/mat'));
    const wk = m?.week ?? m?.plan ?? m?.days ?? [];
    for (const d of Array.isArray(wk) ? wk : Object.values(wk)) { const dish = d?.dish ?? d; if (dish?.name || dish?.n) { names.push(dish.name ?? dish.n); for (const i of dish.ingredients ?? dish.ing ?? []) ing.push(typeof i === 'string' ? i : i.name ?? i.n); } }
  } catch { /* */ }
  if (!ing.length) { names = MAT_FALLBACK.map((x) => x[0]); ing = MAT_FALLBACK.flatMap((x) => x[1]); }
  const handel = S.d.lists.find((l) => /handel/i.test(l.name)) ?? listOf(defaultList());
  const have = new Set(S.d.items.filter((x) => !x.done && tList(x) === handel?.id).map((x) => tTitle(x).toLowerCase())), seen = new Set(), add = [];
  for (const i of ing.filter(Boolean)) { const k = i.toLowerCase(); if (have.has(k) || seen.has(k)) continue; seen.add(k); add.push(i); }
  const made = [];
  for (const n of add) made.push(await createItem({ n, list: handel?.id, due: isoDay(1), tags: ['matplan'] }));
  const skipped = ing.length - add.length;
  setAns({ text: `La ${made.length} varer fra ${names.slice(0, 4).join(', ')} i ${handel?.name ?? 'Handel'}${skipped > 0 ? ` (${skipped} sto der allerede)` : ''}.`, items: made.map(resItem), undo: { ids: made.map((x) => x.id) } });
}
async function packList(ev = tripEvent()) {
  const hytta = S.d.lists.find((l) => /hytt/i.test(l.name)) ?? listOf(defaultList());
  const due = ev ? isoDay(Math.max(0, ev.days - 1)) : isoDay(11), pre = ev ? isoDay(Math.max(0, ev.days - 2)) : isoDay(9);
  const made = [await createItem({ n: 'Bestill brøyting', list: hytta?.id, due: pre, who: myId(), tags: ['hytte'] })];
  for (const n of PACK) made.push(await createItem({ n, list: hytta?.id, due, tags: ['pakkeliste'] }));
  if (ev) tipSet(`trip_${ev.key}`);
  setAns({ text: `Lagde pakkeliste${ev ? ` for ${ev.title}` : ''} (${PACK.length} ting) og «Bestill brøyting» to dager før.`, items: made.map(resItem), undo: { ids: made.map((x) => x.id) } });
}
async function undo() {
  const u = S.g.ans?.undo;
  if (!u) return;
  S.g.ans.undo = null;
  if (u.token) { try { await api('/tasks/glimt/undo', { method: 'POST', json: { token: u.token } }); } catch (er) { flash(er.message); } setAns({ text: 'Angret.', items: [] }); return load(); }
  const ids = new Set((u.ids ?? []).map(String));
  S.d.items = S.d.items.filter((x) => !ids.has(String(x.id)));
  setAns({ text: 'Angret.', items: [] });
  await Promise.all([...ids].map((id) => api(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)));
}
// Slå sammen like: beholder den første, slår sammen tagger og deloppgaver, sletter resten.
async function merge(ids) {
  const L = ids.map((id) => S.d.items.find((x) => String(x.id) === id)).filter(Boolean);
  if (L.length < 2) return;
  const [keep, ...rest] = L;
  const tags = [...new Set(L.flatMap((x) => x.tags ?? []))], subs = L.flatMap((x) => x.subs ?? []);
  S.d.items = S.d.items.filter((x) => !rest.includes(x));
  await patchItem(keep, { ...(tags.length ? { tags } : {}), ...(subs.length ? { subs } : {}) });
  await Promise.all(rest.map((x) => api(`/tasks/${encodeURIComponent(x.id)}`, { method: 'DELETE' }).catch(() => null)));
  flash(`Slo sammen ${L.length}× «${tTitle(keep)}»`); paint();
}

/* ---------- Arkiv ---------- */
async function archive(ids) {
  if (!ids.length) return;
  const set = new Set(ids.map(String)), moved = S.d.items.filter((x) => set.has(String(x.id)));
  S.d.items = S.d.items.filter((x) => !set.has(String(x.id)));
  S.arch = [...moved.map((x) => ({ ...x, doneAt: x.doneAt ?? Date.now() })), ...S.arch];
  const loc = localArch(); moved.forEach((x) => loc.add(String(x.id))); saveLocalArch(loc);
  paint();
  await Promise.all(moved.map(async (x) => {
    try {
      const r = await api(`/tasks/${encodeURIComponent(x.id)}`, { method: 'PATCH', json: { archived: true } }), it = r?.item ?? r;
      if (it && srvArch(it)) { const l2 = localArch(); l2.delete(String(x.id)); saveLocalArch(l2); Object.assign(S.arch.find((y) => y.id === x.id) ?? {}, it); }
    } catch { /* beholdes lokalt */ }
  }));
  paint();
}
async function restore(id) {
  const it = S.arch.find((x) => String(x.id) === id);
  if (!it) return;
  S.arch = S.arch.filter((x) => String(x.id) !== id);
  const loc = localArch(); loc.delete(id); saveLocalArch(loc);
  const back = { ...it, done: false, doneAt: null, archived: false, arch: false, archivedAt: null, archived_at: null };
  S.d.items.unshift(back); paint();
  try { const r = await api(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { archived: false, done: false } }); Object.assign(back, r?.item ?? {}); }
  catch (er) { if (er.status === 400) { try { await api(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { done: false } }); } catch { /* */ } } else flash(er.message); }
  paint();
}

async function tick(id) {
  const it = S.d.items.find((x) => String(x.id) === id);
  if (!it) return;
  it.done = !it.done; it.doneAt = it.done ? Date.now() : null; paint();
  try {
    const r = await api(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { done: it.done } });
    Object.assign(it, r?.item ?? {});
    if (r?.next?.id) { if (!S.d.items.some((x) => x.id === r.next.id)) S.d.items.unshift(r.next); }
    else if (it.done && it.rep && it.rep !== 'none' && !r?.item?.rep) {
      // Eldre server: neste forekomst lages her.
      await createItem({ n: tTitle(it), list: tList(it), due: nextDue(it), who: tWho(it), time: it.time, urgent: it.urgent, rep: it.rep, early: it.early, prio: it.prio, flag: it.flag, tags: it.tags, place: it.place, notes: tNotes(it) || undefined });
    }
  } catch (er) { it.done = !it.done; flash(er.message); }
  paint();
}

/* ---------- Hendelser ---------- */
function bind(h) {
  if (h.dataset.tkBound) return;
  h.dataset.tkBound = '1';
  h.addEventListener('input', (e) => { if (e.target.closest('[data-tk-form]')) S.nv = e.target.value; if (e.target.closest('[data-tk-gform]')) S.g.q = e.target.value; });
  h.addEventListener('paste', (e) => {
    if (!e.target.closest('[data-tk-gform]')) return;
    const txt = e.clipboardData?.getData('text') ?? '';
    const L = pasteLines(txt);
    if (L.length < 2) return;
    e.preventDefault();
    S.g.busy = 'Leser teksten …'; paint();
    addParsed(L.flatMap((x) => gParse(x, { people: people() }))).then(() => { if (S.g.ans) S.g.ans.text = `Lagde ${S.g.ans.items.length} gjøremål fra teksten du limte inn.`; paint(); }).catch((er) => setAns({ text: er.message, items: [] }));
  });
  h.addEventListener('change', (e) => {
    const f = e.target.closest('[data-tk-gimg]');
    if (!f) return;
    const file = f.files?.[0]; f.value = '';
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => glimtRun(S.g.q || 'Les handlelappen', { image: rd.result });
    rd.readAsDataURL(file);
  });
  h.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.closest('[data-tk-gform]')) return glimtRun(S.g.q);
    const title = S.nv.trim();
    if (!title || S.busy) return;
    S.busy = true;
    try { await createItem({ n: title, list: defaultList(), due: S.nd == null ? null : isoDay(S.nd), who: S.nw ?? myId() ?? null }); S.nv = ''; } catch (er) { flash(er.message); }
    S.busy = false; paint();
  });
  bindBoard(h);
  h.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tkList) {
      const id = t.dataset.tkList;
      if (S.cur === id && id !== 'alle' && id !== 'arkiv') return openList(id); // trykk på aktiv chip åpner listearket
      S.cur = id; if (S.cards !== false) { S.cards = null; loadCards(); } return paint();
    }
    if (t.dataset.twSel) { S.sel = t.dataset.twSel; if (innerWidth < 1000) { S.ed = t.dataset.twSel; S.tagIn = ''; S.subIn = ''; paintSheets(); } else openPanel(t.dataset.twSel); return paint(); } // prompt 44: panel fra høyre
    if (t.dataset.twView) { S.view = t.dataset.twView; try { localStorage.setItem('huske_web_view', S.view); } catch { /* */ } return paint(); }
    if (t.dataset.twPf !== undefined) { S.pf = t.dataset.twPf || null; return paint(); }
    if (t.dataset.twAct) return webAct(t.dataset.twAct, t.dataset.twId);
    if (t.dataset.tkEd) { S.ed = t.dataset.tkEd; S.tagIn = ''; S.subIn = ''; return paintSheets(); }
    if (t.dataset.tkGq) return glimtRun(t.dataset.tkGq);
    if (t.dataset.tkG === 'undo') return undo();
    if (t.dataset.tkG === 'clear') { S.g.ans = null; return paint(); }
    if (t.dataset.tk41) return act41(t.dataset.tk41, t.dataset.k);
    if (t.dataset.tkCard) return cardAct(t.dataset.tkCard);
    if (t.dataset.tkTip) {
      const [k, arg] = t.dataset.tkTip.split(/:(.*)/s);
      if (k === 'hide') { tipSet(arg); return paint(); }
      if (k === 'off') { tipOffSet(arg); flash('Glimt foreslår ikke pakkelister lenger. Slå på igjen i Gjøremål → Innstillinger → Forslag fra Glimt.'); return paint(); }
      if (k === 'merge') return merge(arg.split(','));
      const late = S.d.items.filter((x) => !x.done && x.due && x.due < today() && (S.cur === 'alle' || tList(x) === S.cur));
      if (k === 'late-move') { await Promise.all(late.map((x) => patchItem(x, { due: isoDay(1) }))); flash(`Flyttet ${late.length} til i morgen`); return paint(); }
      if (k === 'late-arch') return archive(late.map((x) => String(x.id)));
      if (k === 'store-on') {
        const handel = S.d.lists.find((l) => /handel|handle/i.test(l.name));
        const L = S.d.items.filter((x) => tList(x) === handel?.id && !x.done);
        await Promise.all(L.map((x) => patchItem(x, { place: 'store' })));
        tipSet('store'); flash(`Du får varsel ved butikken: ${L.slice(0, 3).map(tTitle).join(', ')}${L.length > 3 ? ' …' : ''}`); return paint();
      }
      if (k === 'pack') return packList();
    }
    if (t.dataset.tkDue !== undefined) { S.nd = t.dataset.tkDue === '' ? null : +t.dataset.tkDue; return paint(); }
    if (t.dataset.tkWho !== undefined) { S.nw = t.dataset.tkWho || null; return paint(); }
    if (t.dataset.tkAct === 'retry') return load();
    if (t.dataset.tkAct === 'lsv') return openList(S.cur);
    if (t.dataset.tkAct === 'newlist') { S.lsv = { id: null, name: '', color: LCOL[S.d.lists.length % LCOL.length], mem: [] }; return paintSheets(); }
    if (t.dataset.tkArch) return archive([t.dataset.tkArch]);
    if (t.dataset.tkAct === 'arch-all') return archive(S.d.items.filter((x) => x.done && (S.cur === 'alle' || tList(x) === S.cur)).map((x) => String(x.id)));
    if (t.dataset.tkRestore) return restore(t.dataset.tkRestore);
    if (t.dataset.tkAct === 'arch-clear') {
      if (!S.arch.length || !confirm(`Slette ${S.arch.length} arkiverte oppgaver for godt?`)) return;
      const ids = S.arch.map((x) => String(x.id)); S.busy = true; S.arch = []; paint();
      const loc = localArch(); ids.forEach((id) => loc.delete(id)); saveLocalArch(loc);
      await Promise.all(ids.map((id) => api(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)));
      S.busy = false; return load();
    }
    if (t.dataset.tkTick) return tick(t.dataset.tkTick);
    if (t.dataset.tkDel) return del(t.dataset.tkDel);
  });
}
async function del(id) {
  const it = S.d.items.find((x) => String(x.id) === id) ?? S.arch.find((x) => String(x.id) === id);
  S.d.items = S.d.items.filter((x) => String(x.id) !== id); S.arch = S.arch.filter((x) => String(x.id) !== id); paint();
  { const loc = localArch(); if (loc.delete(id)) saveLocalArch(loc); }
  try { await api(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (er) { if (it) S.d.items.push(it); paint(); flash(er.message); }
}
function openList(id) {
  const l = listOf(id);
  if (!l) return;
  S.lsv = { id: l.id, name: l.name, color: l.color, mem: listPeople(l).map((p) => p.id).filter((x) => x !== myId()) };
  paintSheets();
}

function bindSheet(el) {
  const cur = () => S.d?.items.find((x) => String(x.id) === S.ed) ?? S.arch.find((x) => String(x.id) === S.ed);
  let downT = null;
  el.addEventListener('pointerdown', (e) => { downT = e.target; });
  el.addEventListener('click', async (e) => {
    const back = e.target.closest('.tk-back');
    if (back && e.target === back && downT === back) { if (back.matches('[data-tk-lclose]')) S.lsv = null; else S.ed = null; return paintSheets(); }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('.tk-sheet [data-tk-close]')) { S.ed = null; return paintSheets(); }
    if (b.matches('.tk-sheet [data-tk-lclose]')) { S.lsv = null; return paintSheets(); }
    const t = cur();
    if (t && S.ed) {
      if (b.dataset.tkSw) {
        const k = b.dataset.tkSw;
        if (k === 'due') await patchItem(t, t.due ? { due: null, time: null } : { due: today() });
        else if (k === 'time') await patchItem(t, t.time ? { time: null } : { time: '09:00', ...(t.due ? {} : { due: today() }) }); // tid slår på dato
        else await patchItem(t, { [k]: !t[k] });
        return paint();
      }
      if (b.dataset.tkEdl) { await patchItem(t, { list: b.dataset.tkEdl, ...(tWho(t) && !listPeople(listOf(b.dataset.tkEdl)).some((p) => p.id === tWho(t)) ? { assignee: null } : {}) }); return paint(); }
      if (b.dataset.tkEdw !== undefined) { await patchItem(t, { assignee: b.dataset.tkEdw || null }); return paint(); }
      if (b.dataset.tkEdp !== undefined) { await patchItem(t, { prio: +b.dataset.tkEdp }); return paint(); }
      if (b.dataset.tkUntag) { await patchItem(t, { tags: (t.tags ?? []).filter((x) => x !== b.dataset.tkUntag) }); return paint(); }
      if (b.dataset.tkSubt !== undefined) { const s = [...(t.subs ?? [])], i = +b.dataset.tkSubt; s[i] = { ...s[i], done: !s[i].done }; await patchItem(t, { subs: s }); return paint(); }
      if (b.dataset.tkSubx !== undefined) { const s = [...(t.subs ?? [])]; s.splice(+b.dataset.tkSubx, 1); await patchItem(t, { subs: s }); return paint(); }
      const a = b.dataset.tkEdAct;
      if (a === 'del') { if (!confirm(`Slette «${tTitle(t)}»?`)) return; S.ed = null; paintSheets(); return del(String(t.id)); }
      if (a === 'sugg') {
        const g = guess(tTitle(t), people()), gl = g.l ? S.d.lists.find((x) => x.name.toLowerCase() === g.l) : null;
        await patchItem(t, { ...(gl ? { list: gl.id } : {}), ...(g.who ? { assignee: g.who.id } : {}), ...(g.tags.length ? { tags: [...new Set([...(t.tags ?? []), ...g.tags])] } : {}), ...(g.place ? { place: g.place } : {}) });
        return paint();
      }
      if (a === 'split') {
        S.splitBusy = true; paintSheets();
        let L = null;
        try { const r = await api(`/tasks/${encodeURIComponent(t.id)}/split`, { method: 'POST' }); L = r?.item?.subs ? null : (r?.subs ?? r?.items ?? []).map((x) => (typeof x === 'string' ? x : x.n ?? x.title)); if (r?.item) Object.assign(t, r.item); }
        catch { /* lokale maler */ }
        if (L !== null || !t.subs?.length) { const add = (L && L.length ? L : splitSugg(tTitle(t))).slice(0, 6).map((n) => ({ n, done: false })); await patchItem(t, { subs: [...(t.subs ?? []), ...add] }); }
        S.splitBusy = false; return paint();
      }
    }
    const v = S.lsv;
    if (v) {
      if (b.dataset.tkLcol) { v.color = b.dataset.tkLcol; return paintSheets(); }
      if (b.dataset.tkLmem) { const id = b.dataset.tkLmem; v.mem = v.mem.includes(id) ? v.mem.filter((x) => x !== id) : [...v.mem, id]; return paintSheets(); }
      if (b.matches('[data-tk-lsave]')) return saveList();
      if (b.dataset.tkLact === 'del') {
        const l = listOf(v.id), n = S.d.items.filter((x) => tList(x) === v.id).length;
        if (!confirm(`Slette «${l.name}»${n ? ` og ${n} oppgave${n === 1 ? '' : 'r'}` : ''}?`)) return;
        try { await api(`/tasks/lists/${encodeURIComponent(v.id)}`, { method: 'DELETE' }); S.lsv = null; S.cur = 'alle'; await load(); } catch (er) { v.err = er.message; paintSheets(); }
        return;
      }
      if (b.dataset.tkLact === 'leave') {
        const l = listOf(v.id);
        if (!confirm(`Forlate «${l.name}»? Du ser den ikke lenger før eieren deler den med deg igjen.`)) return;
        try { await api(`/tasks/lists/${encodeURIComponent(v.id)}/leave`, { method: 'POST' }).catch((er) => (er.status === 404 ? api(`/tasks/lists/${encodeURIComponent(v.id)}/members/me`, { method: 'DELETE' }) : Promise.reject(er))); S.lsv = null; S.cur = 'alle'; await load(); }
        catch (er) { v.err = er.message; paintSheets(); }
      }
    }
  });
  el.addEventListener('input', (e) => {
    const t = cur(), f = e.target.dataset.tkF;
    if (S.lsv && e.target.matches('[data-tk-lname]')) { S.lsv.name = e.target.value; return; }
    if (e.target.matches('[data-tk-tagin]')) { S.tagIn = e.target.value; return; }
    if (e.target.matches('[data-tk-subin]')) { S.subIn = e.target.value; return; }
    if (!t || !f) return;
    if (f === 'title') { if (e.target.value.trim()) patchSoon(t, { title: e.target.value }); }
    else if (f === 'notes') patchSoon(t, { notes: e.target.value });
  });
  el.addEventListener('change', async (e) => {
    const t = cur(), f = e.target.dataset.tkF;
    if (!t || !f || f === 'title' || f === 'notes') return;
    const v = e.target.value;
    await patchItem(t, { [f]: f === 'place' ? v || null : v || null }); paint();
  });
  el.addEventListener('keydown', async (e) => {
    const t = cur();
    if (e.key === 'Enter' && t && e.target.matches('[data-tk-tagin]')) {
      e.preventDefault();
      const v = S.tagIn.replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-');
      S.tagIn = '';
      if (v && !(t.tags ?? []).includes(v)) await patchItem(t, { tags: [...(t.tags ?? []), v] });
      return paint();
    }
    if (e.key === 'Enter' && t && e.target.matches('[data-tk-subin]')) {
      e.preventDefault();
      const v = S.subIn.trim(); S.subIn = '';
      if (v) await patchItem(t, { subs: [...(t.subs ?? []), { n: v, done: false }] });
      return paint();
    }
    if (e.key === 'Enter' && S.lsv && e.target.matches('[data-tk-lname]')) { e.preventDefault(); saveList(); }
  });
}
async function saveList() {
  const v = S.lsv;
  if (!v || v.busy) return;
  const name = v.name.trim();
  if (!name) { v.err = 'Gi listen et navn'; return paintSheets(); }
  v.busy = true; v.err = ''; paintSheets();
  try {
    let id = v.id;
    if (!id) { const r = await api('/tasks/lists', { method: 'POST', json: { name, color: v.color } }); id = r?.list?.id ?? r?.id; }
    else await api(`/tasks/lists/${encodeURIComponent(id)}`, { method: 'PATCH', json: { name, color: v.color } });
    const l0 = listOf(id), before = l0 ? listPeople(l0).map((p) => p.id).filter((x) => x !== myId()).sort().join(',') : '';
    if (id && (v.mem.length || before) && [...v.mem].sort().join(',') !== before) await api(`/tasks/lists/${encodeURIComponent(id)}/members`, { method: 'PUT', json: { userIds: v.mem } });
    S.lsv = null; S.cur = id ?? S.cur; await load();
  } catch (er) { v.busy = false; v.err = er.status === 404 ? 'Serveren støtter ikke dette ennå.' : er.message; paintSheets(); }
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !layer) return;
  e.stopPropagation();
  if (S.lsv) S.lsv = null; else S.ed = null;
  paintSheets();
}, true);
window.addEventListener('hashchange', () => { if (layer && !/^#\/(huskeliste|gjoremal)/.test(location.hash)) { S.ed = null; S.lsv = null; paintSheets(); } });
/* Prompt 40 (claude-code-gjoremal-web-fullskjerm.md): Gjøremål åpnes alltid i fullskjerm på web (position:fixed; inset:0),
   uten Homelab-toppmeny, skybilde eller nyhetslinje. Egen topplinje: «‹ Hjem», kicker + tittel, ✕. «‹ Hjem», ✕ og Esc
   går til Dashboard (Esc lukker først et åpent felt eller detaljark). Mobil (smal skjerm) beholder sin egen visning. */
const fs40 = () => !isMobile();
const closeFs40 = () => { location.hash = '#/dash'; };
window.addEventListener('hashchange', () => setTimeout(() => { if (!host()) document.body.classList.remove('tk-fs40'); }));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !host() || !fs40() || layer || e.defaultPrevented) return;
  if (document.querySelector('#settings:not([hidden]),#popup:not([hidden]),.ai-ov,.gl-ans')) return;
  const t = e.target;
  if (t?.matches?.('input,textarea,select,[contenteditable="true"]')) { if (t.value) { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); } t.blur(); return; }
  e.preventDefault(); closeFs40();
});
document.addEventListener('click', (e) => { if (e.target.closest?.('[data-tk40-close]')) { e.preventDefault(); closeFs40(); } });

export function render() {
  bind44();
  setTimeout(() => {
    const h = host();
    if (!h) return;
    bind(h);
    load();
    haCtl?.refresh();
    unLive?.(); unLive2?.();
    const live = (m) => {
      if (!host()) { unLive?.(); unLive2?.(); unLive = unLive2 = null; return; }
      if (!S.d || m.type === 'todo:changed') return load();
      if ((m.action === 'created' || m.action === 'updated') && m.item && isArch(m.item)) {
        S.d.items = S.d.items.filter((x) => x.id !== m.item.id);
        S.arch = [m.item, ...S.arch.filter((x) => x.id !== m.item.id)];
        return paint();
      }
      if ((m.action === 'created' || m.action === 'updated') && m.item) {
        S.arch = S.arch.filter((x) => x.id !== m.item.id);
        const i = S.d.items.findIndex((x) => x.id === m.item.id);
        if (i >= 0) { const keep = Object.fromEntries(EXTRA.filter((k) => S.d.items[i][k] !== undefined && m.item[k] === undefined).map((k) => [k, S.d.items[i][k]])); S.d.items[i] = { ...m.item, ...keep }; } else S.d.items.unshift(m.item);
        return paint();
      }
      if (m.action === 'deleted' && m.id != null) { S.d.items = S.d.items.filter((x) => x.id !== m.id); return paint(); }
      if (m.action === 'lists' && m.lists) { S.d.lists = m.lists; haCtl?.refresh(); return paint(); }
      if (m.action === 'ha') { haCtl?.refresh(); return; }
      load();
    };
    unLive = onLive('tasks', live);
    unLive2 = onLive('todo:changed', live);
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (!host()) { clearInterval(pollT); unLive?.(); unLive2?.(); unLive = unLive2 = null; return; }
      if (!document.hidden && !liveOn() && !layer) load();
    }, 30_000);
  });
  bindWide();
  if (fs40()) {
    document.body.classList.add('tk-fs40');
    return `<div class="tk40-fs" role="region" aria-label="Gjøremål"><div class="tk40-bar"><button type="button" class="tk40-home" data-tk40-close>‹ Hjem</button><span class="tk40-tt"><span>To-do for hele familien</span><b>Gjøremål</b></span><span class="tk40-sp"></span><button type="button" class="tk40-x" data-tk40-close aria-label="Lukk Gjøremål" title="Lukk (Esc)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="tk40-sc"><div id="tasks" class="tk">${body()}</div></div></div>`;
  }
  document.body.classList.remove('tk-fs40');
  return `<div class="tk-top"><div class="os-title">Gjøre<b>mål</b></div><div class="tk-sub">To-do for hele familien · dine lister og lister som er delt med deg</div></div><div id="tasks" class="tk">${body()}</div>`;
}

/* ================= Prompt 39: Gjøremål på web (claude-code-huskeliste-web.md, fasit Huskeliste Web Design.dc.html → 2a) =================
   ≥ 1000 px: sidemeny 240 px (lister, personer, + Ny liste) · midten (Glimt, tittel + personfilter, grupper, + Ny oppgave) ·
   høyre 340 px (VALGT + ✦ Glimt-forslag). «▥ Tavle» slår sammen midten og høyre: én kolonne per liste (Alle) eller per person
   (én liste valgt); dra kort mellom kolonnene for å bytte liste/person. Valget huskes i huske_web_view. 760–1000 px: ikon-skinne. */
const wide = () => !!host() && matchMedia('(min-width: 760px)').matches && !matchMedia('(pointer: coarse) and (max-width: 1023px)').matches;
try { S.view = localStorage.getItem('huske_web_view') === 'tavle' ? 'tavle' : 'liste'; } catch { S.view = 'liste'; }
S.pf = null; S.sel = null;
let wideWas = null;
function bindWide() {
  if (bindWide.on) return;
  bindWide.on = true;
  window.addEventListener('resize', () => { if (!host()) return; const w = wide(); if (wideWas !== null && w !== wideWas) paint(); wideWas = w; });
  window.addEventListener('keydown', (e) => {
    if (!host() || !wide() || e.metaKey || e.ctrlKey || e.altKey || layer) return;
    if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '') || e.target?.isContentEditable) return;
    const vis = [...host().querySelectorAll('[data-tw-sel]')].map((b) => b.dataset.twSel), i = vis.indexOf(String(S.sel));
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); host().querySelector('[data-tk-form] input')?.focus(); return; }
    if (k === 'l' || k === 't') { S.view = k === 't' ? 'tavle' : 'liste'; try { localStorage.setItem('huske_web_view', S.view); } catch { /* */ } paint(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const j = Math.max(0, Math.min(vis.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); if (vis[j]) { S.sel = vis[j]; paint(); host().querySelector(`[data-tw-sel="${CSS.escape(vis[j])}"]`)?.scrollIntoView({ block: 'nearest' }); } return; }
    if (!S.sel) return;
    if (e.key === ' ') { e.preventDefault(); tick(String(S.sel)); return; }
    if (k === 'e') { S.ed = String(S.sel); paintSheets(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); archive([String(S.sel)]); }
  });
  document.addEventListener('keydown', (e) => {
    if (host() && wide() && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !layer) { e.preventDefault(); host().querySelector('[data-tk-gform] input')?.focus(); }
  });
}
const initial = (n) => String(n ?? '?').trim().slice(0, 1).toUpperCase() || '?';
const endOfWeek = () => { const d = new Date(today() + 'T12:00'); return isoDay((7 - ((d.getDay() + 6) % 7)) - 1); };
function twGroups(inL) {
  const t0 = today(), t1 = isoDay(1), we = endOfWeek(), open = inL.filter((t) => !t.done);
  const by = (a, b) => (a.due ?? '9').localeCompare(b.due ?? '9') || String(a.time ?? '').localeCompare(String(b.time ?? '')) || (b.prio ?? 0) - (a.prio ?? 0);
  return [
    ['I DAG OG FORFALT', 'late', open.filter((t) => t.due && t.due <= t0).sort(by)],
    ['I MORGEN', '', open.filter((t) => t.due === t1).sort(by)],
    ['SENERE DENNE UKA', '', open.filter((t) => t.due && t.due > t1 && t.due <= we).sort(by)],
    ['SENERE', 'mut', open.filter((t) => t.due && t.due > we && t.due > t1).sort(by)],
    ['UTEN DATO', 'mut', open.filter((t) => !t.due)],
    ['FERDIG', 'pos', inL.filter((t) => t.done).sort((a, b) => (doneMs(b) ?? 0) - (doneMs(a) ?? 0)).slice(0, 20)],
  ].filter((g) => g[2].length);
}
function twPerson(uid, size = 22) {
  if (!uid) return '';
  const p = person(uid) ?? { name: nameOf(uid) };
  return `<span class="tw-av" style="--s:${size}px;background:${esc(pColor(p))}" title="${esc(nameOf(uid) || p.name || '')}">${esc(initial(p.name))}</span>`;
}
function twRow(t) {
  const [dt, dc] = dueLabel(t), c = colorOf(tList(t)), subs = Array.isArray(t.subs) ? t.subs : [], l = listOf(tList(t));
  const meta = [dt, subs.length ? `${subs.filter((x) => x.done).length}/${subs.length}` : '', t.rep && t.rep !== 'none' ? '↻' : ''].filter(Boolean).join(' · ');
  return `<div class="tw-row${t.done ? ' done' : ''}${String(S.sel) === String(t.id) ? ' on' : ''}">
    <button type="button" class="tk-chk" style="--c:${esc(c)}" data-tk-tick="${esc(t.id)}" aria-label="${t.done ? 'Marker som ikke gjort' : 'Fullfør'}" aria-pressed="${t.done}">${t.done ? '✓' : ''}</button>
    <button type="button" class="tw-rm" data-tw-sel="${esc(t.id)}"><span class="tw-rn">${t.flag ? '<span class="tk-flag">⚑</span>' : ''}${t.prio ? `<span class="tk-prio">${'!'.repeat(Math.min(3, +t.prio))}</span>` : ''}${esc(tTitle(t))}</span>${meta ? `<span class="tw-rmeta ${t.done ? '' : dc}">${esc(meta)}</span>` : ''}</button>
    ${S.cur === 'alle' && l ? `<span class="tw-lb" style="--c:${esc(l.color)}">${esc(l.name)}</span>` : ''}${twPerson(tWho(t))}
    ${S.cur === 'arkiv' ? `<button type="button" class="tk-restore" data-tk-restore="${esc(t.id)}">↺</button>` : t.done ? '' : subBtn(t)}
  </div>${S.cur === 'arkiv' ? '' : subRows(t)}`;
}
function twSide() {
  const items = S.d.items ?? [], lists = S.d.lists ?? [];
  const n = (id) => (id === 'arkiv' ? S.arch.length : (id === 'alle' ? items : items.filter((t) => tList(t) === id)).filter((t) => !t.done).length);
  const mine = items.filter((t) => !t.done && (tWho(t) === myId() || (!tWho(t) && myId()))).length;
  const li = (id, name, color, cnt, ic = '') => `<button type="button" class="tw-li${S.cur === id ? ' on' : ''}" data-tk-list="${esc(id)}" aria-pressed="${S.cur === id}" title="${esc(name)}">${ic || `<span class="tw-dot" style="background:${esc(color)}"></span>`}<span class="tw-ln">${esc(name)}</span><span class="tw-k">${cnt}</span></button>`;
  const ppl = people();
  return `<aside class="tw-side">${fs40() ? '' : '<div class="tw-brand"><b>Gjøremål</b><span>Hjem, handel og hytta</span></div>'}
    <nav class="tw-lists">${li('alle', 'Alle', 'var(--t-ink)', n('alle'))}<button type="button" class="tw-li${S.pf === 'me' && S.cur === 'alle' ? ' on' : ''}" data-tw-act="mine" title="Mine"><span class="tw-dot ring"></span><span class="tw-ln">Mine</span><span class="tw-k">${mine}</span></button>
      ${lists.map((l) => li(l.id, l.name, l.color, n(l.id))).join('')}${li('arkiv', 'Arkiv', 'var(--t-mut)', n('arkiv'), `<span class="tw-ic">${ARCH_SVG}</span>`)}${mwN41() ? li('glimt41', 'Laget med Glimt', '#b23a2a', mwN41(), '<span class="tw-dot tk41-red"></span>') : ''}</nav>
    ${ppl.length ? `<span class="tw-lab">PERSONER</span><nav class="tw-lists">${ppl.map((p) => `<button type="button" class="tw-li${S.pf === p.id ? ' on' : ''}" data-tw-pf="${esc(p.id)}" title="${esc(p.name)}">${twPerson(p.id, 20)}<span class="tw-ln">${esc(p.id === myId() ? `${p.name} (meg)` : p.name)}</span><span class="tw-k">${items.filter((t) => !t.done && tWho(t) === p.id).length}</span></button>`).join('')}</nav>` : ''}
    <button type="button" class="tw-newl" data-tk-act="newlist">+ Ny liste</button>
    ${isAdmin() ? haRow() : ''}</aside>`;
}
function twSelPanel() {
  const t = S.sel != null && (S.d.items.find((x) => String(x.id) === String(S.sel)) ?? S.arch.find((x) => String(x.id) === String(S.sel)));
  if (!t) return '<div class="tw-sel empty"><span class="tw-lab">VALGT</span><p>Trykk på en oppgave for å se detaljer.</p></div>';
  const l = listOf(tList(t)), [dt] = dueLabel(t), subs = Array.isArray(t.subs) ? t.subs : [];
  const rows = [['Liste', l ? `<span class="tw-dot" style="background:${esc(l.color)}"></span>${esc(l.name)}` : '–'], ['Hvem', tWho(t) ? `${twPerson(tWho(t), 18)}${esc(nameOf(tWho(t)))}` : 'Ingen'], ['Frist', esc(dt || 'Ingen')]];
  if (t.rep && t.rep !== 'none') rows.push(['Gjentas', esc(REP.find((r) => r[0] === t.rep)?.[1] ?? t.rep)]);
  return `<div class="tw-sel"><span class="tw-lab">VALGT</span><b class="tw-st">${esc(tTitle(t))}</b>
    <div class="tw-rows">${rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>
    ${subs.length ? `<span class="tw-lab">DELOPPGAVER · ${subs.filter((x) => x.done).length}/${subs.length}</span><div class="tw-subs">${subs.map((x) => `<span class="${x.done ? 'done' : ''}"><i>${x.done ? '✓' : ''}</i>${esc(x.n ?? x.title ?? '')}</span>`).join('')}</div>` : ''}
    ${tNotes(t) ? `<p class="tw-note">${linkify(tNotes(t))}</p>` : ''}
    <div class="tw-btns"><button type="button" class="tw-b ink" data-tk-tick="${esc(t.id)}">${t.done ? '↺ Ikke ferdig' : '✓ Ferdig'}</button><button type="button" class="tw-b" data-tw-act="tomorrow" data-tw-id="${esc(t.id)}">I morgen</button><button type="button" class="tw-b" data-tk-ed="${esc(t.id)}">Påminn</button></div>
    <button type="button" class="tw-link" data-tk-ed="${esc(t.id)}">Alle detaljer ›</button></div>`;
}
function twGlimt() {
  const g = S.g;
  return `<form class="tk-gf tw-gf" data-tk-gform>${spk(!!g.busy)}<input name="gq" value="${esc(g.q)}" placeholder="${esc(g.busy || 'Spør Glimt eller skriv en oppgave …')}" autocomplete="off" maxlength="2000" aria-label="Spør Glimt eller skriv en oppgave"${g.busy ? ' disabled' : ''}><span class="tw-kbd">⌘K</span>
    <button type="submit" class="tk-gsend" aria-label="Send til Glimt"${g.busy ? ' disabled' : ''}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></form>`;
}
const twSwitch = () => `<div class="tw-sw" role="tablist" aria-label="Visning"><button type="button" role="tab" class="${S.view !== 'tavle' ? 'on' : ''}" aria-selected="${S.view !== 'tavle'}" data-tw-view="liste" title="Liste (L)">≡ Liste</button><button type="button" role="tab" class="${S.view === 'tavle' ? 'on' : ''}" aria-selected="${S.view === 'tavle'}" data-tw-view="tavle" title="Tavle (T)">▥ Tavle</button></div>`;
function twAns() {
  const a = S.g.ans;
  if (!a) return '';
  return `<div class="tk-gans tw-ans" role="status"><div class="tk-gat">${spk(false)}<span>${esc(a.text)}</span></div><div class="tk-opts">${a.undo ? '<button type="button" class="tk-gbtn" data-tk-g="undo">Angre</button>' : ''}<button type="button" class="tk-gbtn" data-tk-g="clear">Lukk</button></div></div>`;
}
function webBody(inL0, curName) {
  if (S.cur === 'glimt41') return `<div class="tw">${twSide()}<main class="tw-mid"><div class="tw-board-top">${twGlimt()}</div>${jobsHtml41()}<div class="tw-head"><div class="tw-ht"><span class="tw-dot big tk41-red"></span><h2>Laget med Glimt</h2></div></div>${madeWithHtml41([...S.d.items, ...S.arch], { listName: (t) => listOf(tList(t))?.name ?? '', title: tTitle })}</main><aside class="tw-right">${twSelPanel()}</aside></div>`;
  const ARC = S.cur === 'arkiv', curL = S.cur === 'alle' || ARC ? null : listOf(S.cur);
  const pf = S.pf === 'me' ? myId() : S.pf;
  const inL = pf ? inL0.filter((t) => tWho(t) === pf || (S.pf === 'me' && !tWho(t))) : inL0;
  const allowed = curL ? new Set(listPeople(curL).map((p) => p.id)) : null;
  const pchips = [['', 'Alle'], ['me', 'Meg'], ...people().filter((m) => m.id !== myId() && (!allowed || allowed.has(m.id))).map((m) => [m.id, m.name])];
  const filt = `<div class="tw-pf">${pchips.map(([v, n]) => `<button type="button" class="tk-opt${(S.pf ?? '') === v ? ' on' : ''}" data-tw-pf="${esc(v)}" aria-pressed="${(S.pf ?? '') === v}">${esc(n)}</button>`).join('')}</div>`;
  const head = `<div class="tw-head"><div class="tw-ht">${curL ? `<span class="tw-dot big" style="background:${esc(curL.color)}"></span>` : ''}<h2>${esc(curName)}</h2>${curL ? `<button type="button" class="tw-link" data-tk-act="lsv">${isShared(curL) ? 'Delt · administrer' : 'Del'}</button>` : ''}</div>${filt}</div>`;
  const add = ARC ? '' : `<form class="tk-add tw-add" data-tk-form><input name="title" value="${esc(S.nv)}" placeholder="+ Ny oppgave i ${esc(curName)}" autocomplete="off" maxlength="200" aria-label="Ny oppgave"><button type="submit" aria-label="Legg til"${S.busy ? ' disabled' : ''}>+</button></form>`;
  let main;
  if (S.view === 'tavle' && !ARC) {
    const cols = curL
      ? [...listPeople(curL), { id: '', name: 'Ingen' }].map((p) => ({ key: `p:${p.id ?? ''}`, name: p.id === myId() ? 'Meg' : p.name || 'Ingen', color: p.id ? pColor(p) : 'var(--t-mut)', items: inL.filter((t) => !t.done && (tWho(t) ?? '') === (p.id ?? '')), add: { who: p.id || null, list: curL.id } }))
      : (S.d.lists ?? []).map((l) => ({ key: `l:${l.id}`, name: l.name, color: l.color, items: inL.filter((t) => !t.done && tList(t) === l.id), add: { list: l.id } }));
    const card = (t) => { const [dt, dc] = dueLabel(t), subs = Array.isArray(t.subs) ? t.subs : []; return `<div class="tw-card${String(S.sel) === String(t.id) ? ' on' : ''}" draggable="true" data-tw-drag="${esc(t.id)}"><button type="button" class="tk-chk" style="--c:${esc(colorOf(tList(t)))}" data-tk-tick="${esc(t.id)}" aria-label="Fullfør">${t.done ? '✓' : ''}</button><button type="button" class="tw-rm" data-tw-sel="${esc(t.id)}"><span class="tw-rn">${esc(tTitle(t))}</span><span class="tw-cm">${dt ? `<span class="${dc}">${esc(dt)}</span>` : ''}${subs.length ? `<span>${subs.filter((x) => x.done).length}/${subs.length}</span>` : ''}</span></button>${curL ? '' : twPerson(tWho(t), 20)}</div>`; };
    main = `<div class="tw-board-top">${twGlimt()}${twSwitch()}</div>${twAns()}<div class="tw-tipsrow">${tips(inL0)}</div>${head}
      <div class="tw-board">${cols.map((c) => `<section class="tw-col" data-tw-col="${esc(c.key)}"><header><span class="tw-dot" style="background:${esc(c.color)}"></span><b>${esc(c.name)}</b><span class="tw-k">${c.items.length}</span></header><div class="tw-cards">${c.items.map(card).join('')}</div><button type="button" class="tw-cadd" data-tw-act="coladd" data-tw-id="${esc(JSON.stringify(c.add))}">+ Legg til</button></section>`).join('')}</div>`;
    return `<div class="tw tw-tavle">${twSide()}<main class="tw-mid wide">${main}</main></div>`;
  }
  const groups = twGroups(inL).map(([title, cls, arr]) => `<section class="tw-group"><span class="tk-gt ${cls}">${title} · ${arr.length}</span><div class="tw-card-l">${arr.map(twRow).join('')}</div></section>`).join('');
  main = `<div class="tw-board-top">${twGlimt()}${twSwitch()}</div>${twAns()}${jobsHtml41()}${head}${add}${groups || `<div class="tk-empty">Ingen oppgaver i ${esc(curName)}.</div>`}
    ${ARC && S.arch.length ? '<button type="button" class="tk-gbtn" data-tk-act="arch-clear">Tøm arkivet</button>' : ''}
    <div class="tk-foot">${liveOn() ? '● Sanntid' : 'Oppdateres automatisk'} · ⌘K Glimt · N ny · L/T visning · ↑↓ velg · Mellomrom kryss av · E rediger · Delete arkiver</div>`;
  return `<div class="tw">${twSide()}<main class="tw-mid">${main}</main><aside class="tw-right">${twSelPanel()}<div class="tw-tips"><span class="tw-lab">✦ GLIMT</span>${tips(inL0) || '<p class="tw-none">Ingen forslag akkurat nå.</p>'}</div></aside></div>`;
}
async function webAct(a, id) {
  if (a === 'mine') { S.cur = 'alle'; S.pf = S.pf === 'me' ? null : 'me'; return paint(); }
  if (a === 'tomorrow') { const t = S.d.items.find((x) => String(x.id) === String(id)); if (t) { await patchItem(t, { due: isoDay(1) }); flash('Flyttet til i morgen'); } return paint(); }
  if (a === 'coladd') {
    const o = JSON.parse(id || '{}'), title = prompt('Ny oppgave');
    if (!title?.trim()) return;
    try { await createItem({ n: title.trim(), list: o.list ?? defaultList(), due: null, who: o.who ?? myId() ?? null }); } catch (er) { flash(er.message); }
    return paint();
  }
}
/** Tavle: dra kort mellom kolonnene (liste eller person), med løft og skygge som Hjem-wiggle. */
function bindBoard(h) {
  let dragId = null;
  h.addEventListener('dragstart', (e) => { const c = e.target.closest?.('[data-tw-drag]'); if (!c) return; dragId = c.dataset.twDrag; c.classList.add('lift'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch { /* */ } navigator.vibrate?.(8); });
  h.addEventListener('dragend', (e) => { e.target.closest?.('[data-tw-drag]')?.classList.remove('lift'); h.querySelectorAll('.tw-col.over').forEach((x) => x.classList.remove('over')); dragId = null; });
  h.addEventListener('dragover', (e) => { const col = e.target.closest?.('[data-tw-col]'); if (!col || !dragId) return; e.preventDefault(); h.querySelectorAll('.tw-col.over').forEach((x) => x !== col && x.classList.remove('over')); col.classList.add('over'); });
  h.addEventListener('drop', async (e) => {
    const col = e.target.closest?.('[data-tw-col]');
    if (!col || !dragId) return;
    e.preventDefault();
    const t = S.d.items.find((x) => String(x.id) === String(dragId)), [k, v] = col.dataset.twCol.split(/:(.*)/s);
    col.classList.remove('over');
    if (!t) return;
    const ch = k === 'l' ? { list: v } : { assignee: v || null };
    if ((k === 'l' && tList(t) === v) || (k === 'p' && (tWho(t) ?? '') === v)) return;
    navigator.vibrate?.(12);
    Object.assign(t, ch); paint();
    await patchItem(t, ch); paint();
  });
}

// Prompt 44: kontekst for tasks44.js (deloppgaver i lista og panelet fra høyre).
setup44({ S, patchItem, tick, del, paint, createItem, flash, colorOf, listOf, tList, tTitle, tNotes, tWho, nameOf, people, REP, EARLY, PRIO, PLACE, today, openEd: (id) => { S.ed = id; S.tagIn = ''; S.subIn = ''; paintSheets(); } });

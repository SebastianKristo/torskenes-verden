// Huskeliste (prompt 17): lister (Hjem, Handel, Hytta, Jobb …) med forfall og ansvarlig.
// Prompt 21: hver liste har en eier og er privat til eieren deler den med navngitte personer («Del liste»).
// Data fra /api/tasks; endringer fra andre kommer i sanntid over /api/ws (type 'tasks'), ellers hentes det hvert 30. s.
import { api, esc } from './util.js';
import { onLive, liveOn } from './realtime.js';
import { store } from './store.js';
import { mountHa } from './tasks-ha.js';

const S = { d: null, err: null, cur: 'alle', nv: '', nd: 0, nw: null, busy: false, editId: null, share: null, arch: [] };
// Prompt 32: Arkivert. Serveren lagrer archived_at (GET /api/tasks?archived=1, PATCH {archived}). Svarer en eldre server uten
// arkiv, huskes arkiverte oppgaver i denne nettleseren (per bruker). Fullførte oppgaver arkiveres automatisk etter 7 dager.
const WEEK = 7 * 864e5;
const archKey = () => `tk_arch_${store.me?.me?.id ?? 'x'}`;
const localArch = () => { try { return new Set(JSON.parse(localStorage.getItem(archKey()) ?? '[]').map(String)); } catch { return new Set(); } };
const saveLocalArch = (set) => { try { localStorage.setItem(archKey(), JSON.stringify([...set])); } catch { /* privat modus */ } };
const doneMs = (t) => (t.doneAt == null ? null : typeof t.doneAt === 'number' ? t.doneAt : Date.parse(t.doneAt));
const srvArch = (t) => !!(t.archived || t.arch || t.archivedAt || t.archived_at);
const isArch = (t) => srvArch(t) || localArch().has(String(t.id)) || (t.done && doneMs(t) != null && Date.now() - doneMs(t) > WEEK);
const ARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"/></svg>';
let pollT = null, unLive = null;
const host = () => document.getElementById('tasks');

const iso = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const today = () => iso(0);
const daysTo = (d) => Math.round((new Date(d + 'T12:00') - new Date(today() + 'T12:00')) / 864e5);
const listOf = (id) => S.d?.lists.find((l) => l.id === id || l.name === id);
const colorOf = (id) => listOf(id)?.color ?? 'var(--t-ink)';
const myId = () => store.me?.me?.id;
const uidOf = (m) => (typeof m === 'object' && m ? m.id ?? m.userId ?? m.user_id : m);
const listMembers = (l) => (Array.isArray(l?.members) ? l.members.map(uidOf).filter((id) => id && id !== uidOf(l.owner)) : []);
const isMine = (l) => (typeof l?.mine === 'boolean' ? l.mine : !l?.owner || uidOf(l.owner) === myId());
const nameOf = (uid) => (uid && uid === myId() ? 'Meg' : S.d?.members?.find((m) => (m.id ?? m.userId) === uid)?.name ?? '');

function dueLabel(d) {
  if (!d) return ['', ''];
  const n = daysTo(d);
  if (n < 0) return [`Forfalt ${-n} d`, 'late'];
  if (n === 0) return ['I dag', 'late'];
  if (n === 1) return ['I morgen', ''];
  return [new Date(d + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }), 'mut'];
}

async function load() {
  try {
    S.d = await api('/tasks'); S.err = null;
    // Arkivet: egen liste fra serveren (eldre server ignorerer ?archived=1 og gir alt; da filtreres det her).
    const a = await api('/tasks?archived=1').catch(() => null);
    const pool = new Map([...(a?.items ?? []), ...(S.d.items ?? [])].map((t) => [String(t.id), t]));
    S.arch = [...pool.values()].filter(isArch).sort((x, y) => (doneMs(y) ?? 0) - (doneMs(x) ?? 0));
    S.d.items = (S.d.items ?? []).filter((t) => !isArch(t));
    // Eier og deling kan mangle i /api/tasks; /api/tasks/lists har dem (eldre server: 404, da er alt som før).
    if (S.d.lists?.length && !S.d.lists.some((l) => 'owner' in l || 'members' in l)) {
      const r = await api('/tasks/lists').catch(() => null);
      if (Array.isArray(r?.lists)) S.d.lists = r.lists;
    }
  } catch (e) { S.err = e.message; }
  paint();
}

// Eier, «Delt med …» og «Del liste» for valgt liste. Bare eieren kan dele.
function shareBar(l) {
  if (!l) return '';
  const mine = isMine(l), mem = listMembers(l), objs = Array.isArray(l.members) ? l.members.filter((m) => typeof m === 'object' && m) : [];
  const names = mem.map((id) => (id === myId() ? 'deg' : nameOf(id) || objs.find((m) => uidOf(m) === id)?.name || 'ukjent'));
  const owner = mine ? 'Din liste' : `Eies av ${l.ownerName || nameOf(uidOf(l.owner)) || 'en annen'}`;
  const shared = names.length ? `Delt med ${names.join(', ')}` : mine ? 'Bare du ser denne listen' : 'Delt med deg';
  const people = (S.d.members ?? []).filter((m) => (m.id ?? m.userId) !== myId());
  const panel = S.share && S.share.id === l.id ? `<div class="tk-share" role="group" aria-label="Del ${esc(l.name)}">
      <span class="tk-gt">DEL «${esc(String(l.name).toUpperCase())}» MED</span>
      ${people.length ? `<div class="tk-opts">${people.map((m) => { const id = m.id ?? m.userId, on = S.share.ids.includes(id); return `<button type="button" class="tk-opt${on ? ' on' : ''}" data-tk-shp="${esc(id)}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(m.name)}</button>`; }).join('')}</div>` : '<div class="tk-meta">Det finnes ingen andre brukere å dele med.</div>'}
      <div class="tk-opts"><button type="button" class="tk-btn pri" data-tk-act="share-save"${S.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="tk-btn" data-tk-act="share-close">Avbryt</button></div>
    </div>` : '';
  return `<div class="tk-own"><span class="tk-dot" style="background:${esc(l.color ?? 'var(--t-ink)')}"></span><span class="tk-main"><b>${esc(owner)}</b><span class="tk-meta">${esc(shared)}</span></span>
    ${mine ? `<button type="button" class="tk-btn" data-tk-act="share" aria-expanded="${!!panel}">Del liste</button>` : '<button type="button" class="tk-btn" data-tk-act="leave">Forlat liste</button>'}</div>${panel}`;
}

function row(t, i) {
  const [dt, dc] = dueLabel(t.due), c = colorOf(t.list);
  const meta = [dt, nameOf(t.assignee), S.cur === 'alle' || S.cur === 'arkiv' ? listOf(t.list)?.name ?? '' : ''].filter(Boolean).join(' · ');
  return `<div class="tk-row${t.done ? ' done' : ''}${i ? ' bt' : ''}">
    <button type="button" class="tk-chk" style="--c:${esc(c)}" data-tk-tick="${esc(t.id)}" aria-label="${t.done ? 'Marker som ikke gjort' : 'Fullfør'}" aria-pressed="${t.done}">${t.done ? '✓' : ''}</button>
    <span class="tk-main"><span class="tk-n">${esc(t.title)}</span>${meta ? `<span class="tk-meta ${t.done ? '' : dc}">${esc(meta)}</span>` : ''}</span>
    ${S.cur === 'arkiv' ? `<button type="button" class="tk-restore" data-tk-restore="${esc(t.id)}">↺ Gjenopprett</button>` : t.done ? `<button type="button" class="tk-x tk-arc" data-tk-arch="${esc(t.id)}" aria-label="Arkiver ${esc(t.title)}" title="Arkiver">${ARCH_SVG}</button>` : ''}
    <button type="button" class="tk-x" data-tk-del="${esc(t.id)}" aria-label="${S.cur === 'arkiv' ? 'Slett for godt' : 'Slett'} ${esc(t.title)}">×</button>
  </div>`;
}

function body() {
  if (S.err && !S.d) return `<div class="card tk-card"><div class="tk-empty">Kunne ikke hente huskelisten: ${esc(S.err)}<br><button type="button" class="tk-btn" data-tk-act="retry">Prøv igjen</button></div></div>`;
  if (!S.d) return '<div class="card tk-card"><div class="tk-empty">Laster …</div></div>';
  const items = S.d.items ?? [], lists = S.d.lists ?? [], ARC = S.cur === 'arkiv';
  const inL = ARC ? S.arch : items.filter((t) => S.cur === 'alle' || t.list === S.cur);
  const t0 = today();
  const od = inL.filter((t) => !t.done && t.due && t.due <= t0).sort((a, b) => a.due.localeCompare(b.due));
  const later = inL.filter((t) => !t.done && !(t.due && t.due <= t0)).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const done = inL.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30);
  const curName = S.cur === 'alle' ? 'Alle' : ARC ? 'Arkivert' : listOf(S.cur)?.name ?? S.cur;
  const chip = (id, name, color) => {
    const n = id === 'arkiv' ? S.arch.length : (id === 'alle' ? items : items.filter((t) => t.list === id)).filter((t) => !t.done).length;
    const l = id === 'alle' ? null : listOf(id), sh = l && (listMembers(l).length || !isMine(l));
    // «Alle» har ingen fargeprikk (prompt 22).
    return `<button type="button" class="tk-list${S.cur === id ? ' on' : ''}" data-tk-list="${esc(id)}" aria-pressed="${S.cur === id}"${sh ? ' title="Delt liste"' : ''}>${id === 'alle' || id === 'arkiv' ? '' : `<span class="tk-dot" style="background:${esc(color)}"></span>`}${esc(name)}${sh ? '<span class="tk-shd" aria-label="delt">⇄</span>' : ''}<span class="tk-k">${n}</span></button>`;
  };
  const opt = (kind, v, n, on) => `<button type="button" class="tk-opt${on ? ' on' : ''}" data-tk-${kind}="${v ?? ''}" aria-pressed="${on}">${esc(n)}</button>`;
  const group = (title, cls, arr, act = '') => (arr.length ? `<section class="tk-group"><span class="tk-gh"><span class="tk-gt ${cls}">${title}</span>${act}</span><div class="card tk-card">${arr.map(row).join('')}</div></section>` : '');
  const actBtn = (k, n) => `<button type="button" class="tk-gbtn" data-tk-act="${k}"${S.busy ? ' disabled' : ''}>${n}</button>`;
  const lists2 = `<div class="tk-lists">${chip('alle', 'Alle', 'var(--t-ink)')}${lists.map((l) => chip(l.id, l.name, l.color)).join('')}${chip('arkiv', 'Arkivert', 'var(--t-mut)')}</div>`;
  if (ARC) {
    return `${lists2}${group(`ARKIVERT · ${S.arch.length}`, 'mut', S.arch, actBtn('arch-clear', 'Tøm arkivet'))}
      ${S.arch.length ? '' : '<div class="tk-empty">Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager.</div>'}
      <div class="tk-foot">Arkiverte oppgaver telles ikke i lister, widgets eller på Hjem. ↺ Gjenopprett legger oppgaven tilbake som åpen i sin liste.</div>`;
  }
  // Ansvarlig: deg og dem listen er delt med (eller alle på en eldre server uten deling).
  const curL = S.cur === 'alle' ? null : listOf(S.cur), hasShare = lists.some((l) => 'members' in l);
  const allowed = curL && hasShare ? new Set([...listMembers(curL), uidOf(curL.owner)]) : null;
  const who = [[null, 'Meg'], ...(S.d.members ?? []).filter((m) => (m.id ?? m.userId) !== myId() && (!allowed || allowed.has(m.id ?? m.userId))).map((m) => [m.id ?? m.userId, m.name])];
  return `${lists2}
    ${shareBar(curL)}
    <form class="tk-add" data-tk-form><input name="title" value="${esc(S.nv)}" placeholder="Ny oppgave i ${esc(curName)}" autocomplete="off" maxlength="200" aria-label="Ny oppgave"><button type="submit" aria-label="Legg til"${S.busy ? ' disabled' : ''}>+</button></form>
    <div class="tk-opts">${[[0, 'I dag'], [1, 'I morgen'], [7, 'Neste uke'], [null, 'Uten dato']].map(([v, n]) => opt('due', v, n, S.nd === v)).join('')}<span class="tk-sep"></span>${who.map(([v, n]) => opt('who', v, n, S.nw === v)).join('')}</div>
    ${group('I DAG OG FORFALT', 'late', od)}${group('SENERE', 'mut', later)}${group('FERDIG', 'pos', done, actBtn('arch-all', 'Arkiver alle'))}
    ${inL.length ? '' : `<div class="tk-empty">Ingen oppgaver i ${esc(curName)}.</div>`}
    ${isAdmin() ? '<div class="tk-ha-slot"></div>' : ''}
    <div class="tk-foot">${liveOn() ? '● Sanntid' : 'Oppdateres automatisk'} · Listene er private til eieren deler dem. Widgets for iPhone og Android finnes i appen.</div>`;
}

// Synk med Home Assistant (prompt 22): bare admin. Seksjonen beholdes mellom omtegninger, så valg og status ikke blinker.
const isAdmin = () => store.me?.me?.role === 'admin';
let haEl = null, haCtl = null;
function placeHa(h) {
  const slot = h.querySelector('.tk-ha-slot');
  if (!slot) return;
  if (!haEl) { haEl = document.createElement('div'); haEl.className = 'tk-group'; haCtl = mountHa(haEl, { lists: () => Promise.resolve(S.d?.lists ?? []) }); }
  slot.replaceWith(haEl);
}

function paint() {
  const h = host();
  if (!h) return;
  const act = document.activeElement, focusAdd = act?.closest?.('[data-tk-form]') && act.name === 'title';
  if (haEl && h.contains(haEl)) haEl.remove();
  h.innerHTML = body();
  placeHa(h);
  if (focusAdd) { const i = h.querySelector('[data-tk-form] input'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
}

// Arkiver: PATCH {archived:true}. Gir serveren ikke arkivfeltet tilbake, huskes arkiveringen lokalt.
async function archive(ids) {
  if (!ids.length) return;
  const set = new Set(ids.map(String)), moved = S.d.items.filter((x) => set.has(String(x.id)));
  S.d.items = S.d.items.filter((x) => !set.has(String(x.id)));
  S.arch = [...moved.map((x) => ({ ...x, doneAt: x.doneAt ?? Date.now() })), ...S.arch];
  // Lokalt først, så en sanntidsmelding om endringen ikke flytter oppgaven tilbake før serveren har svart.
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
// Gjenopprett: tilbake som åpen oppgave i sin liste.
async function restore(id) {
  const it = S.arch.find((x) => String(x.id) === id);
  if (!it) return;
  S.arch = S.arch.filter((x) => String(x.id) !== id);
  const loc = localArch(); loc.delete(id); saveLocalArch(loc);
  const back = { ...it, done: false, doneAt: null, archived: false, arch: false, archivedAt: null, archived_at: null };
  S.d.items.unshift(back); paint();
  try { const r = await api(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { archived: false, done: false } }); Object.assign(back, r?.item ?? {}); }
  catch (er) { if (er.status === 400) { try { await api(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { done: false } }); } catch { /* */ } } else alert(er.message); }
  paint();
}

function bind(h) {
  if (h.dataset.tkBound) return;
  h.dataset.tkBound = '1';
  h.addEventListener('input', (e) => { if (e.target.closest('[data-tk-form]')) S.nv = e.target.value; });
  h.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = S.nv.trim();
    if (!title || S.busy) return;
    const list = S.cur === 'alle' ? (S.d.lists[0]?.id ?? 'hjem') : S.cur;
    S.busy = true;
    try {
      const r = await api('/tasks', { method: 'POST', json: { title, list, due: S.nd == null ? null : iso(S.nd), assignee: S.nw ?? myId() ?? null } });
      const it = r.item ?? r;
      if (it?.id && !S.d.items.some((x) => x.id === it.id)) S.d.items.unshift(it);
      S.nv = '';
    } catch (er) { alert(er.message); }
    S.busy = false; paint();
  });
  h.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tkList) { S.cur = t.dataset.tkList; S.share = null; return paint(); }
    if (t.dataset.tkDue !== undefined) { S.nd = t.dataset.tkDue === '' ? null : +t.dataset.tkDue; return paint(); }
    if (t.dataset.tkWho !== undefined) { S.nw = t.dataset.tkWho || null; return paint(); }
    if (t.dataset.tkAct === 'retry') return load();
    if (t.dataset.tkAct === 'share') { const l = listOf(S.cur); S.share = S.share?.id === l?.id ? null : { id: l.id, ids: listMembers(l) }; return paint(); }
    if (t.dataset.tkAct === 'share-close') { S.share = null; return paint(); }
    if (t.dataset.tkAct === 'leave') {
      const l = listOf(S.cur);
      if (!l || !confirm(`Forlate «${l.name}»? Du ser den ikke lenger før eieren deler den med deg igjen.`)) return;
      try { await api(`/tasks/lists/${encodeURIComponent(l.id)}/members/me`, { method: 'DELETE' }); S.cur = 'alle'; return load(); } catch (er) { return alert(er.message); }
    }
    if (t.dataset.tkShp) { const id = t.dataset.tkShp, ids = S.share.ids; S.share.ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; return paint(); }
    if (t.dataset.tkAct === 'share-save') {
      const l = listOf(S.share.id);
      S.busy = true; paint();
      try {
        const r = await api(`/tasks/lists/${encodeURIComponent(l.id)}/members`, { method: 'PUT', json: { userIds: S.share.ids } });
        Object.assign(l, r?.list ?? (r?.id ? r : { members: S.share.ids }));
        S.share = null;
      } catch (er) { alert(er.status === 404 ? 'Serveren støtter ikke deling av lister ennå.' : er.message); }
      S.busy = false; return paint();
    }
    if (t.dataset.tkArch) return archive([t.dataset.tkArch]);
    if (t.dataset.tkAct === 'arch-all') return archive(S.d.items.filter((x) => x.done && (S.cur === 'alle' || x.list === S.cur)).map((x) => String(x.id)));
    if (t.dataset.tkRestore) return restore(t.dataset.tkRestore);
    if (t.dataset.tkAct === 'arch-clear') {
      if (!S.arch.length || !confirm(`Slette ${S.arch.length} arkiverte oppgaver for godt?`)) return;
      const ids = S.arch.map((x) => String(x.id)); S.busy = true; S.arch = []; paint();
      const loc = localArch(); ids.forEach((id) => loc.delete(id)); saveLocalArch(loc);
      await Promise.all(ids.map((id) => api(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)));
      S.busy = false; return load();
    }
    const tick = t.dataset.tkTick, del = t.dataset.tkDel;
    if (tick) {
      const it = S.d.items.find((x) => String(x.id) === tick);
      if (!it) return;
      it.done = !it.done; it.doneAt = it.done ? Date.now() : null; paint();
      try { Object.assign(it, (await api(`/tasks/${encodeURIComponent(tick)}`, { method: 'PATCH', json: { done: it.done } })).item ?? {}); } catch (er) { it.done = !it.done; paint(); alert(er.message); }
      return;
    }
    if (del) {
      const it = S.d.items.find((x) => String(x.id) === del) ?? S.arch.find((x) => String(x.id) === del);
      S.d.items = S.d.items.filter((x) => String(x.id) !== del); S.arch = S.arch.filter((x) => String(x.id) !== del); paint();
      { const loc = localArch(); if (loc.delete(del)) saveLocalArch(loc); }
      try { await api(`/tasks/${encodeURIComponent(del)}`, { method: 'DELETE' }); } catch (er) { if (it) S.d.items.push(it); paint(); alert(er.message); }
    }
  });
}

export function render() {
  setTimeout(() => {
    const h = host();
    if (!h) return;
    bind(h);
    load();
    haCtl?.refresh();
    unLive?.();
    unLive = onLive('tasks', (m) => {
      if (!host()) { unLive?.(); unLive = null; return; }
      if (!S.d) return load();
      if ((m.action === 'created' || m.action === 'updated') && m.item && isArch(m.item)) {
        S.d.items = S.d.items.filter((x) => x.id !== m.item.id);
        S.arch = [m.item, ...S.arch.filter((x) => x.id !== m.item.id)];
        return paint();
      }
      if ((m.action === 'created' || m.action === 'updated') && m.item) {
        S.arch = S.arch.filter((x) => x.id !== m.item.id);
        const i = S.d.items.findIndex((x) => x.id === m.item.id);
        if (i >= 0) S.d.items[i] = m.item; else S.d.items.unshift(m.item);
        return paint();
      }
      if (m.action === 'deleted' && m.id != null) { S.d.items = S.d.items.filter((x) => x.id !== m.id); return paint(); }
      if (m.action === 'lists' && m.lists) { S.d.lists = m.lists; haCtl?.refresh(); return paint(); }
      if (m.action === 'ha') { haCtl?.refresh(); return; }
      load();
    });
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (!host()) { clearInterval(pollT); unLive?.(); unLive = null; return; }
      if (!document.hidden && !liveOn()) load();
    }, 30_000);
  });
  return `<div class="tk-top"><div class="os-title">Huske<b>liste</b></div><div class="tk-sub">Dine lister og lister som er delt med deg</div></div><div id="tasks" class="tk">${body()}</div>`;
}

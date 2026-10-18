// Huskeliste (prompt 17): delte lister for hele familien (Hjem, Handel, Hytta, Jobb …), med forfall og ansvarlig.
// Data fra /api/tasks; endringer fra andre kommer i sanntid over /api/ws (type 'tasks'), ellers hentes det hvert 30. s.
import { api, esc } from './util.js';
import { onLive, liveOn } from './realtime.js';
import { store } from './store.js';

const S = { d: null, err: null, cur: 'alle', nv: '', nd: 0, nw: null, busy: false, editId: null };
let pollT = null, unLive = null;
const host = () => document.getElementById('tasks');

const iso = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const today = () => iso(0);
const daysTo = (d) => Math.round((new Date(d + 'T12:00') - new Date(today() + 'T12:00')) / 864e5);
const listOf = (id) => S.d?.lists.find((l) => l.id === id || l.name === id);
const colorOf = (id) => listOf(id)?.color ?? 'var(--t-ink)';
const myId = () => store.me?.me?.id;
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
  try { S.d = await api('/tasks'); S.err = null; } catch (e) { S.err = e.message; }
  paint();
}

function row(t, i) {
  const [dt, dc] = dueLabel(t.due), c = colorOf(t.list);
  const meta = [dt, nameOf(t.assignee), S.cur === 'alle' ? listOf(t.list)?.name ?? '' : ''].filter(Boolean).join(' · ');
  return `<div class="tk-row${t.done ? ' done' : ''}${i ? ' bt' : ''}">
    <button type="button" class="tk-chk" style="--c:${esc(c)}" data-tk-tick="${esc(t.id)}" aria-label="${t.done ? 'Marker som ikke gjort' : 'Fullfør'}" aria-pressed="${t.done}">${t.done ? '✓' : ''}</button>
    <span class="tk-main"><span class="tk-n">${esc(t.title)}</span>${meta ? `<span class="tk-meta ${t.done ? '' : dc}">${esc(meta)}</span>` : ''}</span>
    <button type="button" class="tk-x" data-tk-del="${esc(t.id)}" aria-label="Slett ${esc(t.title)}">×</button>
  </div>`;
}

function body() {
  if (S.err && !S.d) return `<div class="card tk-card"><div class="tk-empty">Kunne ikke hente huskelisten: ${esc(S.err)}<br><button type="button" class="tk-btn" data-tk-act="retry">Prøv igjen</button></div></div>`;
  if (!S.d) return '<div class="card tk-card"><div class="tk-empty">Laster …</div></div>';
  const items = S.d.items ?? [], lists = S.d.lists ?? [];
  const inL = items.filter((t) => S.cur === 'alle' || t.list === S.cur);
  const t0 = today();
  const od = inL.filter((t) => !t.done && t.due && t.due <= t0).sort((a, b) => a.due.localeCompare(b.due));
  const later = inL.filter((t) => !t.done && !(t.due && t.due <= t0)).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const done = inL.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30);
  const curName = S.cur === 'alle' ? 'Alle' : listOf(S.cur)?.name ?? S.cur;
  const chip = (id, name, color) => {
    const n = (id === 'alle' ? items : items.filter((t) => t.list === id)).filter((t) => !t.done).length;
    return `<button type="button" class="tk-list${S.cur === id ? ' on' : ''}" data-tk-list="${esc(id)}"><span class="tk-dot" style="background:${esc(color)}"></span>${esc(name)}<span class="tk-k">${n}</span></button>`;
  };
  const opt = (kind, v, n, on) => `<button type="button" class="tk-opt${on ? ' on' : ''}" data-tk-${kind}="${v ?? ''}">${esc(n)}</button>`;
  const group = (title, cls, arr) => (arr.length ? `<section class="tk-group"><span class="tk-gt ${cls}">${title}</span><div class="card tk-card">${arr.map(row).join('')}</div></section>` : '');
  const who = [[null, 'Meg'], ...(S.d.members ?? []).filter((m) => (m.id ?? m.userId) !== myId()).map((m) => [m.id ?? m.userId, m.name])];
  return `<div class="tk-lists">${chip('alle', 'Alle', 'var(--t-ink)')}${lists.map((l) => chip(l.id, l.name, l.color)).join('')}</div>
    <form class="tk-add" data-tk-form><input name="title" value="${esc(S.nv)}" placeholder="Ny oppgave i ${esc(curName)}" autocomplete="off" maxlength="200" aria-label="Ny oppgave"><button type="submit" aria-label="Legg til"${S.busy ? ' disabled' : ''}>+</button></form>
    <div class="tk-opts">${[[0, 'I dag'], [1, 'I morgen'], [7, 'Neste uke'], [null, 'Uten dato']].map(([v, n]) => opt('due', v, n, S.nd === v)).join('')}<span class="tk-sep"></span>${who.map(([v, n]) => opt('who', v, n, S.nw === v)).join('')}</div>
    ${group('I DAG OG FORFALT', 'late', od)}${group('SENERE', 'mut', later)}${group('FERDIG', 'pos', done)}
    ${inL.length ? '' : `<div class="tk-empty">Ingen oppgaver i ${esc(curName)}.</div>`}
    <div class="tk-foot">${liveOn() ? '● Sanntid' : 'Oppdateres automatisk'} · Delt med alle i familien. Widgets for iPhone og Android finnes i appen.</div>`;
}

function paint() {
  const h = host();
  if (!h) return;
  const act = document.activeElement, focusAdd = act?.closest?.('[data-tk-form]') && act.name === 'title';
  h.innerHTML = body();
  if (focusAdd) { const i = h.querySelector('[data-tk-form] input'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
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
    if (t.dataset.tkList) { S.cur = t.dataset.tkList; return paint(); }
    if (t.dataset.tkDue !== undefined) { S.nd = t.dataset.tkDue === '' ? null : +t.dataset.tkDue; return paint(); }
    if (t.dataset.tkWho !== undefined) { S.nw = t.dataset.tkWho || null; return paint(); }
    if (t.dataset.tkAct === 'retry') return load();
    const tick = t.dataset.tkTick, del = t.dataset.tkDel;
    if (tick) {
      const it = S.d.items.find((x) => String(x.id) === tick);
      if (!it) return;
      it.done = !it.done; it.doneAt = it.done ? Date.now() : null; paint();
      try { Object.assign(it, (await api(`/tasks/${encodeURIComponent(tick)}`, { method: 'PATCH', json: { done: it.done } })).item ?? {}); } catch (er) { it.done = !it.done; paint(); alert(er.message); }
      return;
    }
    if (del) {
      const it = S.d.items.find((x) => String(x.id) === del);
      S.d.items = S.d.items.filter((x) => String(x.id) !== del); paint();
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
    unLive?.();
    unLive = onLive('tasks', (m) => {
      if (!host()) { unLive?.(); unLive = null; return; }
      if (!S.d) return load();
      if ((m.action === 'created' || m.action === 'updated') && m.item) {
        const i = S.d.items.findIndex((x) => x.id === m.item.id);
        if (i >= 0) S.d.items[i] = m.item; else S.d.items.unshift(m.item);
        return paint();
      }
      if (m.action === 'deleted' && m.id != null) { S.d.items = S.d.items.filter((x) => x.id !== m.id); return paint(); }
      if (m.action === 'lists' && m.lists) { S.d.lists = m.lists; return paint(); }
      load();
    });
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (!host()) { clearInterval(pollT); unLive?.(); unLive = null; return; }
      if (!document.hidden && !liveOn()) load();
    }, 30_000);
  });
  return `<div class="tk-top"><div class="os-title">Huske<b>liste</b></div><div class="tk-sub">Delte oppgaver for hele familien</div></div><div id="tasks" class="tk">${body()}</div>`;
}

// Huskeliste ↔ Home Assistant To-do (prompt 22, fasit Huskeliste.dc.html → «SYNK MED HOME ASSISTANT»).
// Brukes på Huskeliste-siden og i Innstillinger → Integrasjoner → Home Assistant. Bare admin ser seksjonen.
// API: GET /api/tasks/ha → {enabled, status, syncedAt, error, entities:[{entity_id,name}], maps:[{listId,entityId}]},
// PUT /api/tasks/ha {enabled}, PUT /api/tasks/ha/map {listId, entityId|null}, POST /api/tasks/ha/sync, POST /api/tasks/ha/create {name}.
// Eldre server (404): seksjonen sier at synken ikke er tilgjengelig ennå.
import { api, esc } from './util.js';

const hhmm = (t) => { const d = new Date(typeof t === 'number' && t < 1e12 ? t * 1000 : t); return Number.isNaN(+d) ? '' : d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); };

/** Statusteksten til høyre for overskriften: «Av», «Kobler til …», «Synket 19:44» eller «Feil · prøv igjen». */
export function haStatus(h) {
  if (!h) return ['', ''];
  if (!h.enabled || h.status === 'off') return ['Av', ''];
  if (h.status === 'error') return ['Feil · prøv igjen', 'err'];
  if (h.status === 'ok' && h.syncedAt) return [`Synket ${hhmm(h.syncedAt)}`, ''];
  return ['Kobler til …', ''];
}

/**
 * Monterer seksjonen i el. lists: [{id, name, color}] (listene brukeren har tilgang til), eller en funksjon som gir dem.
 * Returnerer {refresh()}.
 */
export function mountHa(el, { lists, note = true } = {}) {
  const S = { h: null, err: null, missing: false, open: null, busy: false, lists: [] };
  const getLists = async () => {
    if (Array.isArray(lists)) return lists;
    if (typeof lists === 'function') return lists();
    const d = await api('/tasks').catch(() => null);
    return d?.lists ?? [];
  };
  async function load() {
    try {
      const [h, ls] = await Promise.all([api('/tasks/ha'), getLists()]);
      S.h = h; S.lists = ls; S.err = null; S.missing = false;
    } catch (e) {
      if (e.status === 404) S.missing = true; else S.err = e.message;
    }
    paint();
  }
  const mapOf = (id) => S.h?.maps?.find((m) => m.listId === id)?.entityId ?? null;
  function html() {
    const head = (st, cls) => `<span class="tkha-head"><span class="tk-gt late">SYNK MED HOME ASSISTANT</span><span class="tkha-st ${cls}">${esc(st)}</span></span>`;
    if (S.missing) return `${head('Ikke tilgjengelig', '')}<div class="card tk-card"><div class="tk-empty">Serveren støtter ikke synk med Home Assistant ennå.</div></div>`;
    if (!S.h) return `${head(S.err ? 'Feil' : '', S.err ? 'err' : '')}<div class="card tk-card"><div class="tk-empty">${S.err ? `Kunne ikke hente HA-synk: ${esc(S.err)} <button type="button" class="tk-btn" data-ha="retry">Prøv igjen</button>` : 'Laster …'}</div></div>`;
    const h = S.h, on = !!h.enabled, [st, cls] = haStatus(h);
    const ents = h.entities ?? [];
    const rows = on ? S.lists.map((l) => {
      const e = mapOf(l.id), open = S.open === l.id;
      const pick = open ? `<div class="tkha-pick" role="listbox" aria-label="HA-liste for ${esc(l.name)}">
          ${ents.map((x) => `<button type="button" role="option" class="tkha-opt${x.entity_id === e ? ' on' : ''}" aria-selected="${x.entity_id === e}" data-ha-map="${esc(l.id)}" data-ha-ent="${esc(x.entity_id)}"><span class="mono">${esc(x.entity_id)}</span>${x.name && x.name !== x.entity_id ? `<span class="tk-meta">${esc(x.name)}</span>` : ''}</button>`).join('')}
          ${ents.length ? '' : '<div class="tk-meta tkha-none">Fant ingen todo.*-entiteter i Home Assistant.</div>'}
          <button type="button" role="option" class="tkha-opt${e ? '' : ' on'}" aria-selected="${!e}" data-ha-map="${esc(l.id)}" data-ha-ent="">Ikke koblet</button>
          <button type="button" class="tkha-opt add" data-ha-create="${esc(l.id)}">+ Lag ny liste i HA</button></div>` : '';
      return `<button type="button" class="tkha-row" data-ha-row="${esc(l.id)}" aria-expanded="${open}"${S.busy ? ' disabled' : ''}><span class="tk-dot" style="background:${esc(l.color ?? 'var(--t-ink)')}"></span><span class="tkha-n">${esc(l.name)}</span><span class="tkha-e mono${e ? '' : ' mut'}">${esc(e ?? 'Ikke koblet')}</span><span class="tkha-chev" aria-hidden="true">›</span></button>${pick}`;
    }).join('') : '';
    return `${head(st, cls)}
      <div class="card tk-card tkha-card">
        <button type="button" class="tkha-tgl" role="switch" aria-checked="${on}" data-ha="toggle"${S.busy ? ' disabled' : ''}><span class="tk-main"><b>Synkroniser lister</b><span class="tk-meta">To veier · Home Assistant To-do (todo.*)</span></span><span class="tkha-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span></button>
        ${rows}
        ${on && !S.lists.length ? '<div class="tk-meta tkha-none">Du har ingen lister å koble.</div>' : ''}
        ${on ? `<button type="button" class="tkha-sync" data-ha="sync"${S.busy ? ' disabled' : ''}>↻ Synk nå</button>` : ''}
      </div>
      ${h.status === 'error' && h.error ? `<span class="tk-meta late tkha-note">${esc(h.error)}</span>` : ''}
      ${note ? '<span class="tk-meta tkha-note">Trykk på en liste for å velge hvilken HA-liste den skal kobles til. Endringer i appen og i Home Assistant (også fra Assist og stemmestyring) synkes begge veier.</span>' : ''}`;
  }
  function paint() { el.innerHTML = html(); }
  const run = async (fn) => {
    S.busy = true; paint();
    try { await fn(); } catch (e) { alert(e.status === 404 ? 'Serveren støtter ikke dette ennå.' : e.message); }
    S.busy = false;
    await load();
  };
  el.classList.add('tkha');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    const a = b.dataset.ha;
    if (a === 'retry') return load();
    if (a === 'toggle') return run(() => api('/tasks/ha', { method: 'PUT', json: { enabled: !S.h.enabled } }));
    if (a === 'sync') return run(() => api('/tasks/ha/sync', { method: 'POST' }));
    if (b.dataset.haRow) { S.open = S.open === b.dataset.haRow ? null : b.dataset.haRow; return paint(); }
    if (b.dataset.haMap !== undefined) {
      const listId = b.dataset.haMap, entityId = b.dataset.haEnt || null;
      S.open = null;
      return run(() => api('/tasks/ha/map', { method: 'PUT', json: { listId, entityId } }));
    }
    if (b.dataset.haCreate) {
      const l = S.lists.find((x) => x.id === b.dataset.haCreate);
      const name = prompt('Navn på den nye listen i Home Assistant', l?.name ?? '');
      if (!name?.trim()) return;
      S.open = null;
      return run(async () => {
        const r = await api('/tasks/ha/create', { method: 'POST', json: { name: name.trim() } });
        const ent = r?.created?.entity_id ?? r?.entity_id ?? r?.entityId ?? r?.entity?.entity_id;
        if (ent && l) await api('/tasks/ha/map', { method: 'PUT', json: { listId: l.id, entityId: ent } });
      });
    }
  });
  paint();
  load();
  return { refresh: load };
}

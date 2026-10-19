// Prompt 35 (WEB35): «Kalendere» fra sidemenyen i Kalender på web – farge, vis/skjul, skjul fra menyen,
// + iCal-abonnement og + Home Assistant (fasit claude-code-kalender-app.md → Kalendere).
// Data: GET /api/kalender/calendars → {calendars:[{id, name, color, visible, hidMenu, source, badge, builtin, writable}]},
//   PATCH /api/kalender/calendars/:id {color?, visible?, hidMenu?}, POST /api/kalender/calendars/ical {url, name?, color?} → 201 {calendar},
//   GET /api/kalender/ha/calendars → {connected, entities:[{entity_id, name, added}]}, POST /api/kalender/calendars/ha {entities} → {calendars},
//   DELETE /api/kalender/calendars/:id (ical/ha). Mangler et endepunkt (eldre server), vises det som ikke tilgjengelig.
import { api, esc } from './util.js';

const M = { open: false, el: null, list: null, err: '', msg: '', add: null, ha: null, haErr: '', busy: false, onChange: null };
const COLORS = ['#b23a2a', '#2b5d8a', '#2f7a4f', '#a8661a', '#3d7f8a', '#8a3fa0', '#c0562a', '#5b4b8a', '#6b5a3a'];

export function openCalManager({ onChange } = {}) {
  M.onChange = onChange ?? null;
  if (M.open) return;
  M.open = true; M.add = null; M.msg = ''; M.err = '';
  const el = document.createElement('div');
  el.className = 'km35';
  el.innerHTML = '<div class="km35-back" data-km-close></div><aside class="km35-panel" role="dialog" aria-modal="true" aria-label="Kalendere"><div class="km35-in"></div></aside>';
  document.body.appendChild(el);
  M.el = el;
  bind(el);
  paint();
  load();
}
function close() { if (!M.open) return; M.open = false; M.el?.remove(); M.el = null; if (M.changed) M.onChange?.(); M.changed = false; }

async function load() {
  try { const r = await api('/kalender/calendars'); M.list = r.calendars ?? []; M.err = ''; }
  catch (e) { M.list = []; M.err = e.status === 404 ? 'Serveren støtter ikke kalenderstyring ennå.' : e.message; }
  paint();
}

const SRC = { builtin: 'Innebygd', own: 'Egen', ical: 'Abonnement', ha: 'HA', google: 'Google', caldav: 'CalDAV' };
const sw = (on) => `<span class="gs-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
function paint() {
  if (!M.el) return;
  const box = M.el.querySelector('.km35-in'), L = M.list;
  const rows = L == null ? '<p class="km35-note">Henter kalenderne …</p>' : L.length ? L.map((c) => {
    const badge = c.badge || (c.source && c.source !== 'builtin' && c.source !== 'own' ? SRC[c.source] ?? c.source : '');
    const del = c.source === 'ical' || c.source === 'ha' || c.source === 'google'; // prompt 36: også Google (g-…)
    return `<div class="km35-row${c.visible === false ? ' off' : ''}">
      <label class="km35-col" title="Velg farge"><input type="color" value="${esc(c.color || '#7a7468')}" data-km-color="${esc(c.id)}" aria-label="Farge for ${esc(c.name)}"><i style="background:${esc(c.color || '#7a7468')}"></i></label>
      <span class="km35-n"><b>${esc(c.name)}</b>${badge ? `<span class="km35-badge">${esc(badge)}</span>` : ''}</span>
      <button type="button" class="km35-sw" data-km-vis="${esc(c.id)}" role="switch" aria-checked="${c.visible !== false}" title="Vis i kalenderen">${sw(c.visible !== false)}</button>
      <button type="button" class="km35-menu${c.hidMenu ? ' on' : ''}" data-km-menu="${esc(c.id)}" aria-pressed="${!!c.hidMenu}" title="${c.hidMenu ? 'Skjult fra sidemenyen – trykk for å vise' : 'Skjul fra sidemenyen'}">${c.hidMenu ? 'Skjult i menyen' : 'I menyen'}</button>
      ${del ? `<button type="button" class="km35-del" data-km-del="${esc(c.id)}" aria-label="Fjern ${esc(c.name)}" title="Fjern">×</button>` : ''}
      <span class="km35-sw-row">${COLORS.map((x) => `<button type="button" data-km-pick="${esc(c.id)}|${x}" style="background:${x}" aria-label="Farge ${x}"${(c.color || '').toLowerCase() === x ? ' aria-pressed="true"' : ''}></button>`).join('')}</span>
    </div>`;
  }).join('') : '<p class="km35-note">Ingen kalendere.</p>';
  const add = M.add === 'ical' ? `<form class="km35-form" data-km-ical><b>Nytt iCal-abonnement</b><input name="url" type="url" required placeholder="https:// eller webcal://…/kalender.ics" autocomplete="off" spellcheck="false" aria-label="Adresse"><input name="name" placeholder="Navn (valgfritt)" autocomplete="off" aria-label="Navn"><span class="km35-fr"><button type="submit" class="gs-pill dark"${M.busy ? ' disabled' : ''}>${M.busy ? 'Legger til …' : 'Legg til'}</button><button type="button" class="gs-pill" data-km-add="">Avbryt</button></span><span class="km35-note">Hentes hver time. Hendelsene vises i alle visningene og i Glimt.</span></form>`
    : M.add === 'ha' ? `<div class="km35-form"><b>Kalendere fra Home Assistant</b>${M.ha == null ? `<span class="km35-note">${M.haErr ? esc(M.haErr) : 'Henter …'}</span>` : !M.ha.connected ? '<span class="km35-note">Home Assistant er ikke koblet til. Sett det opp under Innstillinger → Integrasjoner.</span>'
      : `${(M.ha.entities ?? []).map((x) => `<label class="km35-ent"><input type="checkbox" value="${esc(x.entity_id)}"${x.added ? ' checked disabled' : ''}><span><b>${esc(x.name || x.entity_id)}</b><span>${esc(x.entity_id)}</span></span></label>`).join('') || '<span class="km35-note">Fant ingen kalendere i Home Assistant.</span>'}<span class="km35-fr"><button type="button" class="gs-pill dark" data-km-haadd${M.busy ? ' disabled' : ''}>${M.busy ? 'Legger til …' : 'Legg til valgte'}</button><button type="button" class="gs-pill" data-km-add="">Avbryt</button></span>`}</div>`
      : `<span class="km35-fr"><button type="button" class="gs-pill" data-km-add="ical">+ iCal-abonnement</button><button type="button" class="gs-pill" data-km-add="ha">+ Home Assistant</button></span>`;
  box.innerHTML = `<div class="km35-head"><b>Kalendere</b><button type="button" class="gs-pill dark" data-km-close>Ferdig</button></div>
    <p class="km35-note">Velg farge, vis eller skjul kalendere, og skjul dem fra sidemenyen. Endringene gjelder også Kalender-appen.</p>
    ${M.err ? `<p class="km35-err">${esc(M.err)}</p>` : ''}
    <div class="km35-list">${rows}</div>${M.msg ? `<p class="km35-msg">${esc(M.msg)}</p>` : ''}${add}
    <button type="button" class="km35-more" data-km-set>Flere valg i Innstillinger → Kalendere ›</button>`;
}

async function patch(id, body) {
  const c = M.list?.find((x) => x.id === id);
  if (c) Object.assign(c, body);
  paint();
  try { const r = await api(`/kalender/calendars/${encodeURIComponent(id)}`, { method: 'PATCH', json: body }); if (r?.calendar && c) Object.assign(c, r.calendar); M.changed = true; M.msg = ''; }
  catch (e) { M.msg = e.status === 404 ? 'Serveren støtter ikke dette ennå.' : e.message; load(); }
  paint();
}

function bind(el) {
  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-km-close]')) return close();
    if (t.closest('[data-km-set]')) { close(); import('./settings.js').then((m) => m.openSettings('kal')).catch(() => {}); return; }
    const v = t.closest('[data-km-vis]'); if (v) { const c = M.list.find((x) => x.id === v.dataset.kmVis); return patch(c.id, { visible: c.visible === false }); }
    const mn = t.closest('[data-km-menu]'); if (mn) { const c = M.list.find((x) => x.id === mn.dataset.kmMenu); return patch(c.id, { hidMenu: !c.hidMenu }); }
    const pk = t.closest('[data-km-pick]'); if (pk) { const [id, col] = pk.dataset.kmPick.split('|'); return patch(id, { color: col }); }
    const dl = t.closest('[data-km-del]');
    if (dl) {
      const c = M.list.find((x) => x.id === dl.dataset.kmDel);
      if (!confirm(`Fjerne «${c?.name}»? Hendelsene fra den forsvinner fra kalenderen.`)) return;
      try { await api(`/kalender/calendars/${encodeURIComponent(c.id)}`, { method: 'DELETE' }); M.changed = true; } catch (err) { M.msg = err.message; }
      return load();
    }
    const ad = t.closest('[data-km-add]');
    if (ad) {
      M.add = ad.dataset.kmAdd || null; M.msg = '';
      if (M.add === 'ha') { M.ha = null; M.haErr = ''; paint(); try { M.ha = await api('/kalender/ha/calendars'); } catch (err) { M.haErr = err.status === 404 ? 'Serveren støtter ikke Home Assistant-kalendere ennå.' : err.message; } }
      paint(); if (M.add === 'ical') el.querySelector('[data-km-ical] input')?.focus(); return;
    }
    if (t.closest('[data-km-haadd]')) {
      const ids = [...el.querySelectorAll('.km35-ent input:checked:not(:disabled)')].map((x) => x.value);
      if (!ids.length) { M.msg = 'Velg minst én kalender.'; return paint(); }
      M.busy = true; paint();
      try { await api('/kalender/calendars/ha', { method: 'POST', json: { entities: ids } }); M.changed = true; M.add = null; M.msg = `${ids.length} ${ids.length === 1 ? 'kalender' : 'kalendere'} lagt til fra Home Assistant.`; }
      catch (err) { M.msg = err.message; }
      M.busy = false; return load();
    }
  });
  el.addEventListener('change', (e) => { const c = e.target.closest?.('[data-km-color]'); if (c) patch(c.dataset.kmColor, { color: c.value }); });
  el.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-km-ical]'); if (!f) return;
    e.preventDefault();
    const url = f.url.value.trim().replace(/^webcal:\/\//i, 'https://'), name = f.name.value.trim();
    if (!url) return;
    M.busy = true; paint();
    try { await api('/kalender/calendars/ical', { method: 'POST', json: { url, ...(name ? { name } : {}) } }); M.changed = true; M.add = null; M.msg = 'Abonnementet er lagt til. Hendelsene hentes nå.'; }
    catch (err) { M.msg = err.status === 404 ? 'Serveren støtter ikke iCal-abonnement ennå.' : err.message; }
    M.busy = false; load();
  });
  document.addEventListener('keydown', function onKey(e) { if (!M.open) { document.removeEventListener('keydown', onKey, true); return; } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }, true);
}

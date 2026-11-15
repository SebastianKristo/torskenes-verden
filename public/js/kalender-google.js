// Prompt 39 (WEB39): «Hvilken kalender er hva?» (claude-code-kalendere-fire-google.md punkt 5, fasit Kalendere Oppsett.dc.html → 1d).
// Venstre: alle kalendere i Google-kontoen med segmentet Personlig · Bursdager · Ikke bruk. Under: Skole (URL, status) og
// Helligdager (land). Høyre: SLIK BLIR DET I APPEN – de fire kalenderne og hva de består av, oppdateres live.
// Data (SERVER39): GET /api/kalender/google/mapping → {connected, email, calendars:[{googleId, name, color, access, role, suggested}],
//   school:{url, status}, holidays:{country}, preview}; PUT {map:{googleId:'p'|'b'|null}, holidays?:{country}} → {job:{id}}.
// 404 (eldre server) → forklaring i stedet for velgeren.
import { esc } from './util.js';

const M = { d: null, map: {}, country: 'NO', err: '', busy: false, missing: false, el: null, onSaved: null };
const ROLES = [['p', 'Personlig'], ['b', 'Bursdager'], ['', 'Ikke bruk']];
const COUNTRIES = [['NO', 'Norge'], ['SE', 'Sverige'], ['DK', 'Danmark'], ['FI', 'Finland'], ['DE', 'Tyskland'], ['GB', 'Storbritannia'], ['US', 'USA']];
const CAL = { p: ['Personlig', '#b23a2a'], b: ['Bursdager', '#8a3fa0'], s: ['Skole', '#2f7a4f'], h: ['Helligdager', '#a39d90'] };

/** Standard: primær og egne → Personlig, «Bursdager»/kontakter → Bursdager, alt annet → Ikke bruk. */
const suggest = (c) => (c.suggested !== undefined ? c.suggested ?? '' : /bursdag|birthday|contacts|kontakt/i.test(`${c.name} ${c.googleId}`) ? 'b' : /primær|eier|owner/i.test(c.access ?? '') || c.primary ? 'p' : '');

export async function openGooglePicker({ onSaved } = {}) {
  M.onSaved = onSaved ?? null; M.err = ''; M.busy = false;
  if (!M.el) { M.el = document.createElement('div'); M.el.className = 'kg39-ov'; M.el.setAttribute('role', 'dialog'); M.el.setAttribute('aria-modal', 'true'); M.el.setAttribute('aria-label', 'Hvilken kalender er hva?'); bind(M.el); }
  document.body.appendChild(M.el);
  M.d = null; paint();
  try {
    const r = await fetch('/api/kalender/google/mapping', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 404) { M.missing = true; paint(); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Feil ${r.status}`);
    M.missing = false; M.d = d;
    M.map = Object.fromEntries((d.calendars ?? []).map((c) => [c.googleId, c.role !== undefined && c.role !== null ? c.role : suggest(c)]));
    M.country = d.holidays?.country || 'NO';
  } catch (e) { M.err = e.message; M.d = { calendars: [] }; }
  paint();
}
function close() { M.el?.remove(); document.removeEventListener('keydown', onKey); }
function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

function preview() {
  const cals = M.d?.calendars ?? [];
  const parts = { p: cals.filter((c) => M.map[c.googleId] === 'p').map((c) => c.name), b: cals.filter((c) => M.map[c.googleId] === 'b').map((c) => c.name) };
  const sch = M.d?.school?.url ? String(M.d.school.url).replace(/^(webcal|https?):\/\//, '').split('/')[0] : '';
  const rows = [['p', parts.p.length ? `${parts.p.join(' + ')}${parts.p.length > 1 ? ' · slått sammen' : ''}` : 'Ingen Google-kalender valgt'], ['b', parts.b.length ? parts.b.join(' + ') : 'Ingen'],
    ['s', sch ? `${sch} · ${M.d?.school?.status || 'hver time'}` : 'Ingen URL ennå'], ['h', `${COUNTRIES.find((c) => c[0] === M.country)?.[1] ?? M.country} · innebygd`]];
  return rows.map(([k, s]) => `<div class="kg39-pr"><i style="background:${CAL[k][1]}"></i><span><b>${CAL[k][0]}</b><span>${esc(s)}</span></span></div>`).join('');
}

function paint() {
  if (!M.el) return;
  const head = `<div class="kg39-h"><span><span class="kg39-k">KALENDERE · GOOGLE</span><b>Hvilken kalender er hva?</b><span class="kg39-s">${esc(M.d?.email ? `Google-kontoen ${M.d.email}` : 'Hver Google-kalender får en rolle. Flere kan slås sammen til Personlig.')}</span></span><button type="button" class="kg39-x" data-kg-close aria-label="Lukk">✕</button></div>`;
  let body;
  if (M.missing) body = '<div class="kg39-empty"><b>Serveren har ikke Google-velgeren ennå</b><span>Oppdater serveren (Innstillinger → System). Til da brukes Google-kalenderne som før, og Kalender viser dem i Personlig og Bursdager.</span></div>';
  else if (!M.d) body = '<div class="kg39-empty"><span>Henter kalenderne i Google-kontoen …</span></div>';
  else if (M.d.connected === false) body = '<div class="kg39-empty"><b>Google er ikke koblet til</b><span>Koble til Google under Google Kalender lenger ned på siden, så kan du velge hvilke kalendere som er hva.</span></div>';
  else {
    const cals = M.d.calendars ?? [];
    const left = `<div class="kg39-list">${cals.length ? cals.map((c) => `<div class="kg39-row"><i style="background:${esc(c.color || '#888')}"></i><span class="kg39-n"><b>${esc(c.name)}</b><span>${esc(c.access || '')}</span></span>
      <span class="kg39-seg" role="radiogroup" aria-label="${esc(c.name)}">${ROLES.map(([v, n]) => `<button type="button" role="radio" aria-checked="${(M.map[c.googleId] ?? '') === v}" class="${(M.map[c.googleId] ?? '') === v ? 'on' : ''}" data-kg-role="${esc(c.googleId)}|${v}">${n}</button>`).join('')}</span></div>`).join('') : '<div class="kg39-empty"><span>Fant ingen kalendere i Google-kontoen.</span></div>'}</div>
      <div class="kg39-cards"><div class="kg39-card"><span class="kg39-k">SKOLE · URL</span><b>${esc(M.d.school?.url ? String(M.d.school.url).replace(/^(webcal|https?):\/\//, '').slice(0, 60) : 'Ingen adresse ennå')}</b><span>${esc(M.d.school?.status || 'Legg inn iCal-adressen under Skole og Canvas.')}</span></div>
        <label class="kg39-card"><span class="kg39-k">HELLIGDAGER · INNEBYGD</span><select data-kg-country aria-label="Land">${COUNTRIES.map(([v, n]) => `<option value="${v}"${M.country === v ? ' selected' : ''}>${n}</option>`).join('')}</select><span>Bevegelige helligdager beregnes – ingen nett.</span></label></div>`;
    body = `<div class="kg39-grid"><div class="kg39-l">${left}</div><aside class="kg39-r"><span class="kg39-k">SLIK BLIR DET I APPEN</span>${preview()}<p class="kg39-info">Ikke brukt hentes ikke. Nye hendelser fra appen lagres i primær Google-kalender (Personlig).</p></aside></div>`;
  }
  const foot = M.missing || !M.d || M.d.connected === false ? '<div class="kg39-f"><button type="button" class="kg39-b" data-kg-close>Lukk</button></div>'
    : `<div class="kg39-f">${M.err ? `<span class="kg39-err">${esc(M.err)}</span>` : ''}<button type="button" class="kg39-b" data-kg-close>Avbryt</button><button type="button" class="kg39-b ink" data-kg-save${M.busy ? ' disabled' : ''}>${M.busy ? 'Lagrer …' : 'Lagre'}</button></div>`;
  M.el.innerHTML = `<div class="kg39-box">${head}${body}${foot}</div>`;
  document.addEventListener('keydown', onKey);
}

function bind(el) {
  el.addEventListener('click', async (e) => {
    if (e.target === el || e.target.closest('[data-kg-close]')) { close(); return; }
    const r = e.target.closest('[data-kg-role]');
    if (r) { const [id, v] = r.dataset.kgRole.split('|'); M.map[id] = v; paint(); return; }
    if (e.target.closest('[data-kg-save]')) {
      M.busy = true; M.err = ''; paint();
      try {
        const map = Object.fromEntries(Object.entries(M.map).map(([k, v]) => [k, v || null]));
        const res = await fetch('/api/kalender/google/mapping', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ map, holidays: { country: M.country } }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `Feil ${res.status}`);
        if (M.country) fetch('/api/kalender/calendars/helligdager', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: M.country }) }).catch(() => {});
        close(); M.onSaved?.(d);
      } catch (er) { M.err = er.message; M.busy = false; paint(); }
    }
  });
  el.addEventListener('change', (e) => { if (e.target.matches('[data-kg-country]')) { M.country = e.target.value; paint(); } });
}

// Prompt 60 (prompt 49 del 3, D3WEB): Entitetsregisteret på web – Innstillinger → AI, rett under «Glimt husker».
// Fyller [data-ent60] (settings-ai.js legger inn plassen). Formene står i $S/SERVER60-API.md §6:
//   GET    /api/glimt/entities[?type=]  → {items:[Entity], types, labels, builtinWords, enabled}
//   POST   /api/glimt/entities {type, name, value?, aliases?}  → {ok, item}
//   PATCH  /api/glimt/entities/:id {name?, value?, aliases?, type?} → {ok, item}   (avledede: bare aliases)
//   DELETE /api/glimt/entities/:id → {ok, removed?}                                 (avledede: bare egne aliaser)
//   GET    /api/glimt/entities/resolve?q=&type= → {q, item, via}
// Én sannhet: navn/verdi for Familie-steder, abonnementer og værsteder redigeres der de kommer fra – her bare aliasene.
// Personer fra «Glimt husker» er de samme radene som /api/glimt/memory, så den lista lastes på nytt etter endringer.
import { loadMemory } from './glimt-memory.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const TYPES60 = ['person', 'place', 'store', 'subscription', 'event'];
const LABELS = { person: 'Personer', place: 'Steder', store: 'Butikker', subscription: 'Abonnementer', event: 'Faste hendelser' };
const ONE = { person: 'Person', place: 'Sted', store: 'Butikk', subscription: 'Abonnement', event: 'Fast hendelse' };
const WHERE = { family: 'Familie → Steder', subscriptions: 'Subscription OS', weather: 'Vær', profile: 'Profil' };
const S = { d: null, at: 0, loading: null, missing: false, err: '', msg: '', filter: '', edit: null, add: false, arm: null, busy: false, res: null };

/** «hytta, Hytta , jobben» → ['hytta', 'jobben'] (unike, uten tomme, maks 20). */
export function parseAliases60(v) {
  const out = [], seen = new Set();
  for (const raw of String(v ?? '').split(/[,;\n]/)) {
    const a = raw.trim().replace(/\s+/g, ' ');
    if (!a || seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase()); out.push(a);
  }
  return out.slice(0, 20);
}
/** Feil i skjemaet før det sendes (samme grenser som serveren). '' = greit. */
export function checkEntity60({ type, name, aliases = [] } = {}, { derived = false } = {}) {
  if (!derived) {
    if (!TYPES60.includes(type)) return 'Velg en type';
    const n = String(name ?? '').trim();
    if (n.length < 2 || n.length > 80) return 'Navnet må være 2–80 tegn';
  }
  if (aliases.length > 20) return 'Maks 20 aliaser';
  const bad = aliases.find((a) => a.length < 2 || a.length > 60);
  if (bad) return `Aliaset «${bad}» må være 2–60 tegn`;
  return '';
}
const derivedOf = (it) => !(it?.editable?.name ?? it?.source === 'memory');

async function call(path, method = 'GET', json) {
  const r = await fetch(`/api/glimt/entities${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Fant ikke dette i registeret' : `Feil ${r.status}`)), { status: r.status });
  return d;
}
export async function loadEntities60(force = false) {
  if (!force && S.at && Date.now() - S.at < 20_000) return S.d;
  if (S.loading) return S.loading;
  S.loading = (async () => {
    try {
      const r = await fetch('/api/glimt/entities', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405) S.missing = true;
      else if (r.ok) { S.d = await r.json(); S.missing = false; S.err = ''; }
      else S.err = (await r.json().catch(() => ({}))).error || `Feil ${r.status}`;
    } catch (e) { S.err = e.message; }
    S.at = Date.now(); S.loading = null;
    return S.d;
  })();
  return S.loading;
}

const typeOpts = (cur) => TYPES60.map((t) => `<option value="${t}"${t === cur ? ' selected' : ''}>${esc(ONE[t])}</option>`).join('');
function formHtml(it) {
  const derived = it ? derivedOf(it) : false, id = it ? esc(it.id) : '';
  const al = esc((it?.aliases ?? []).join(', '));
  const where = it ? WHERE[it.source] ?? it.sourceLabel ?? '' : '';
  const del = it && (it.editable?.delete ?? !derived) && (!derived || it.aliases?.length)
    ? `<button type="button" class="sg-btn2 e60-del" data-e60-del="${id}">${S.arm === it.id ? 'Trykk igjen for å bekrefte' : derived ? 'Fjern egne aliaser' : 'Slett'}</button>` : '';
  return `<form class="sg-form e60-form" data-e60-form="${id}" autocomplete="off">
    ${derived ? `<div class="sg-row"><span class="sg-txt"><b data-no-i18n>${esc(it.name)}</b><span>Navn og sted redigeres i ${esc(where || 'kilden')}. Her legger du til egne ord for det.</span></span></div>` : `
    <label class="sg-field"><span>Type</span><select name="type" aria-label="Type">${typeOpts(it?.type ?? (S.filter || 'person'))}</select></label>
    <label class="sg-field"><span>Navn</span><input name="name" required minlength="2" maxlength="80" value="${esc(it?.name ?? '')}" placeholder="Nina, Hytta, Rema Lena …"></label>
    <label class="sg-field"><span>Betyr</span><input name="value" maxlength="200" value="${esc(it?.value ?? '')}" placeholder="frisør · Lena, Østre Toten (valgfritt)"></label>`}
    <label class="sg-field"><span>Aliaser</span><input name="aliases" maxlength="1400" value="${al}" placeholder="hytta, landstedet (skill med komma)" aria-label="Aliaser, skilt med komma"></label>
    <div class="sg-row"><span class="sg-txt"><span role="status">${esc(S.msg)}</span></span>${del}<button type="button" class="sg-btn2" data-e60-cancel>Avbryt</button><button type="submit" class="sg-btn2"${S.busy ? ' disabled' : ''}>Lagre</button></div></form>`;
}
function rowHtml(it) {
  if (S.edit === it.id) return formHtml(it);
  const sub = [ONE[it.type] ?? it.type, it.value, it.sourceLabel].filter(Boolean).join(' · ');
  const chips = [...(it.aliases ?? []).map((a) => `<i data-no-i18n>${esc(a)}</i>`), ...(it.builtin ?? []).map((a) => `<i class="e60-bi" title="Fast ord" data-no-i18n>${esc(a)}</i>`)].join('');
  return `<div class="sg-row e60-row" data-e60-row="${esc(it.id)}"><span class="sg-txt"><b data-no-i18n>${esc(it.name)}</b><span data-no-i18n>${esc(sub)}</span>${chips ? `<span class="e60-al">${chips}</span>` : ''}</span><button type="button" class="sg-btn2" data-e60-edit="${esc(it.id)}" aria-label="Rediger ${esc(it.name)}">Rediger</button></div>`;
}
export function entitiesHtml60() {
  if (S.missing) return '<div class="sg-row"><span class="sg-txt"><span>Serveren har ikke entitetsregisteret ennå. Oppdater serveren.</span></span></div>';
  const d = S.d;
  if (!d) return `<div class="sg-row"><span class="sg-txt"><span>${S.err ? `Serveren svarte: ${esc(S.err)}` : 'Laster …'}</span></span></div>`;
  const items = Array.isArray(d.items) ? d.items : [], lab = (t) => d.labels?.[t] ?? LABELS[t];
  const n = (t) => items.filter((x) => x.type === t).length;
  const chips = `<div class="e60-bar" role="group" aria-label="Vis type"><button type="button" class="${S.filter ? '' : 'on'}" data-e60-f="" aria-pressed="${!S.filter}">Alle <small>${items.length}</small></button>${TYPES60.map((t) => `<button type="button" class="${S.filter === t ? 'on' : ''}" data-e60-f="${t}" aria-pressed="${S.filter === t}">${esc(lab(t))} <small>${n(t)}</small></button>`).join('')}</div>`;
  const off = d.enabled === false ? '<div class="sg-row e60-off"><span class="sg-txt"><b>Glimt bruker ikke registeret nå</b><span>Slått av i AI → Oppgaver → Forstår samtaler. Lista kan fortsatt redigeres.</span></span></div>' : '';
  const shown = items.filter((x) => !S.filter || x.type === S.filter);
  const list = shown.length ? shown.map(rowHtml).join('') : `<div class="sg-row"><span class="sg-txt"><span>${S.filter ? `Ingen ${esc(lab(S.filter).toLowerCase())} ennå.` : 'Registeret er tomt. Legg til personer og steder, eller skriv «husk at Nina er frisøren min» til Glimt.'}</span></span></div>`;
  const add = S.add ? formHtml(null) : `<div class="sg-row"><span class="sg-txt"><b>Legg til</b><span>Person, sted, butikk, abonnement eller fast hendelse – med egne ord for det</span></span><button type="button" class="sg-btn2" data-e60-add>Legg til</button></div>`;
  const r = S.res;
  const resLine = r ? (r.err ? esc(r.err) : r.item ? `«${esc(r.q)}» → <b data-no-i18n>${esc(r.item.name)}</b> (${esc(ONE[r.item.type] ?? r.item.type)}${r.item.value ? ` · ${esc(r.item.value)}` : ''}) · funnet via ${esc({ name: 'navn', alias: 'alias', builtin: 'fast ord' }[r.via] ?? r.via ?? '–')}` : `Glimt kjenner ikke «${esc(r.q)}» ennå.`) : 'Skriv et ord («hytta», «jobben», «Nina») og se hva Glimt tror det betyr.';
  const res = `<form class="sg-row e60-res" data-e60-res autocomplete="off"><span class="sg-txt"><b>Hva betyr …?</b><span data-e60-resout>${resLine}</span></span><input name="q" maxlength="80" placeholder="hytta" aria-label="Ord å slå opp" class="e60-q"><button type="submit" class="sg-btn2">Slå opp</button></form>`;
  return `<div class="e60" data-e60>${chips}${off}${!S.edit && !S.add && S.msg ? `<div class="sg-row"><span class="sg-txt"><span role="status">${esc(S.msg)}</span></span></div>` : ''}${list}${add}${res}</div>`;
}

const CSS = `.e60-bar{display:flex;flex-wrap:wrap;gap:6px;padding:12px 26px}
.e60-bar button{min-height:32px;padding:0 12px;border-radius:999px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer}
.e60-bar button.on{background:rgba(127,127,127,.22);border-color:rgba(127,127,127,.6);font-weight:600}
.e60-bar small{opacity:.65;font-size:12px;margin-left:2px}
.e60-al{display:flex!important;flex-wrap:wrap;gap:5px;margin-top:2px}
.e60-al i{font-style:normal;font-size:13px;padding:2px 9px;border-radius:999px;border:1px solid rgba(127,127,127,.35);line-height:1.4;overflow-wrap:anywhere}
.e60-al i.e60-bi{border-style:dashed;opacity:.8}
.e60-row .sg-txt b,.e60-row .sg-txt>span{overflow-wrap:anywhere}
.e60-form .sg-row{flex-wrap:wrap;min-height:0}
.e60-form .sg-field input,.e60-form .sg-field select{flex:1;min-width:0}
.e60-res{flex-wrap:wrap}.e60-res .e60-q{flex:1 1 140px;min-width:0;height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit}
.e60-del{color:#d0503c!important}
@media (max-width:600px){.e60-bar{padding:10px 16px}.e60 .sg-row{flex-wrap:wrap;gap:10px}}`;
function css() { if (typeof document === 'undefined' || document.getElementById('e60-css')) return; const st = document.createElement('style'); st.id = 'e60-css'; st.textContent = CSS; document.head.appendChild(st); }

const repaint = () => { for (const el of document.querySelectorAll('[data-ent60]')) el.innerHTML = entitiesHtml60(); };
let raf = 0;
function decorate() {
  const els = [...document.querySelectorAll('[data-ent60]:not([data-e60-done])')];
  if (!els.length) return;
  css();
  for (const el of els) { el.dataset.e60Done = '1'; el.innerHTML = entitiesHtml60(); }
  loadEntities60().then(repaint);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };
const itemOf = (id) => (S.d?.items ?? []).find((x) => x.id === id) ?? null;
async function done(msg) { S.msg = msg; S.edit = null; S.add = false; S.arm = null; await loadEntities60(true); loadMemory(true).catch(() => {}); repaint(); }

if (typeof document !== 'undefined') {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest?.('[data-e60-f],[data-e60-edit],[data-e60-add],[data-e60-cancel],[data-e60-del]');
    if (!t || !t.closest('[data-e60]')) return;
    e.preventDefault();
    const ds = t.dataset;
    if (ds.e60F != null) { S.filter = ds.e60F; repaint(); return; }
    if (ds.e60Edit) { S.edit = ds.e60Edit; S.add = false; S.arm = null; S.msg = ''; repaint(); document.querySelector(`[data-e60-form] input[name=${derivedOf(itemOf(ds.e60Edit)) ? 'aliases' : 'name'}]`)?.focus(); return; }
    if (ds.e60Add != null) { S.add = true; S.edit = null; S.msg = ''; repaint(); document.querySelector('[data-e60-form=""] input[name=name]')?.focus(); return; }
    if (ds.e60Cancel != null) { S.edit = null; S.add = false; S.arm = null; S.msg = ''; repaint(); return; }
    if (ds.e60Del) {
      const id = ds.e60Del;
      if (S.arm !== id) { S.arm = id; repaint(); return; }
      S.busy = true;
      try { const r = await call(`/${encodeURIComponent(id)}`, 'DELETE'); S.busy = false; await done(r.removed === 'aliases' ? 'Egne aliaser er fjernet ✓' : 'Slettet ✓'); }
      catch (er) { S.busy = false; S.msg = `Kunne ikke slette: ${er.message}`; S.arm = null; repaint(); }
    }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest?.('[data-e60-form],[data-e60-res]');
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    if (f.matches('[data-e60-res]')) {
      const q = String(fd.get('q') ?? '').trim();
      if (!q) return;
      try { const r = await call(`/resolve?q=${encodeURIComponent(q)}`); S.res = { q, item: r.item ?? null, via: r.via ?? null }; }
      catch (er) { S.res = { q, err: `Kunne ikke slå opp: ${er.message}` }; }
      const out = f.querySelector('[data-e60-resout]');
      if (out) { const tmp = document.createElement('div'); tmp.innerHTML = entitiesHtml60(); out.innerHTML = tmp.querySelector('[data-e60-resout]')?.innerHTML ?? ''; } else repaint();
      return;
    }
    const id = f.dataset.e60Form, it = id ? itemOf(id) : null, derived = it ? derivedOf(it) : false;
    const aliases = parseAliases60(fd.get('aliases'));
    const body = derived ? { aliases } : { type: String(fd.get('type') ?? ''), name: String(fd.get('name') ?? '').trim(), value: String(fd.get('value') ?? '').trim() || null, aliases };
    const bad = checkEntity60(body, { derived });
    if (bad) { S.msg = bad; repaint(); return; }
    S.busy = true; S.msg = 'Lagrer …'; repaint();
    try {
      if (it) await call(`/${encodeURIComponent(id)}`, 'PATCH', body);
      else await call('', 'POST', body);
      S.busy = false; await done('Lagret ✓');
    } catch (er) { S.busy = false; S.msg = `Kunne ikke lagre: ${er.message}`; repaint(); }
  });
  const boot = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
}

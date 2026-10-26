// Prompt 61 (prompt 49 del 1, D1WEB): «Glimt lærer» på web – oppskrifter som lærer av bruk. Formene står i $S/SERVER61-API.md:
//   GET    /api/glimt/recipes[?status=&q=]      → {items:[Recipe], counts, settings, enabled}
//   GET    /api/glimt/recipes/:id               → {item, runs:[Run], negatives:[Negative]}
//   PATCH  /api/glimt/recipes/:id {status?, queryTemplate?, plan?, allowFastWrite?, exampleQuery?} → {ok, item}
//   DELETE /api/glimt/recipes/:id               → {ok, removed}
//   POST   /api/glimt/recipes/:id/test {text?}  → {ok, text, slots, missing, plan, readable, steps, fast, ms}   (endrer aldri data)
//   POST   /api/glimt/recipes/feedback {traceId, vote:'up'|'down'|null} → {ok, vote, recipe, run}
//   GET/PUT /api/glimt/recipes/settings {scope, save?, fewshot?, fast?, learn?} · GET /api/glimt/recipes/stats
// Tre deler: (1) siden «Glimt lærer» i Innstillinger → AI fyller [data-learn61], (2) brytere i AI-kontroll → Valg fyller
// [data-recipes61] (samme stil som «Forstår samtaler»), (3) tommel opp/ned på Glimt-svar (thumbs61Html + klikk på [data-th61]).
// Eldre server (404): ingenting vises / «Oppdater serveren».
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const KEYS61 = ['save', 'fewshot', 'fast', 'learn'];
const LAB = { save: 'Lagre oppskrifter', fewshot: 'Bruk som eksempler', fast: 'Hurtigvei', learn: 'Lær av rettelser' };
const HELP = {
  save: 'Når Glimt løser noe riktig, lagres hvordan (planen med variabler som {person} og {when}). Bare lokalt i databasen.',
  fewshot: 'Lignende oppskrifter (maks 3) gis til planleggeren som eksempler før de faste.',
  fast: 'Svært like forespørsler (likhet ≥ 0,92, aktiv oppskrift med minst 5 vellykkede bruk og ingen feil de siste 10) hopper over planleggeren. Aldri for handlinger som endrer data uten at det er slått på for oppskriften.',
  learn: '«Nei, jeg mente …» lagrer feil og riktig plan, lager en ny oppskrift og et testtilfelle for eval.',
};
export const STATUS61 = { active: 'Aktiv', candidate: 'Kandidat', disabled: 'Avslått' };
const USE = { new: 'ny', fewshot: 'eksempel', fast: 'hurtigvei', match: 'samme plan' };
const STATE = { success: 'vellykket', fail: 'feil', pending: 'venter' };
const SRC = { learned: 'Lært av en vellykket kjøring', correction: 'Lært av en rettelse', edited: 'Redigert av deg' };
export const VARS61 = ['person', 'person.aliases', 'place', 'when'];

/* ---------- Hjelpere (rene, testes i test/p61-web.test.js) ---------- */
/** Variabler i en tekst/plan som ikke er lov. '{person}' og '{person.aliases}' er lov; '{x}' er det ikke. */
export function badVars61(s) {
  const out = [];
  for (const m of String(s ?? '').matchAll(/\{([^{}"]{1,40})\}/g)) if (!VARS61.includes(m[1].trim()) && !out.includes(m[1])) out.push(m[1]);
  return out;
}
/** Sjekker redigeringen før den sendes (samme grenser som serveren). → {error} eller {body}. */
export function checkEdit61({ queryTemplate, planText, allowFastWrite } = {}, it = {}) {
  const body = {};
  const tpl = String(queryTemplate ?? '').trim();
  if (tpl !== (it.queryTemplate ?? '')) {
    if (tpl.length < 3 || tpl.length > 200) return { error: 'Malen må være 3–200 tegn' };
    const bv = badVars61(tpl);
    if (bv.length) return { error: `Ukjent variabel i malen: {${bv[0]}} (lov: ${VARS61.map((v) => `{${v}}`).join(', ')})` };
    body.queryTemplate = tpl;
  }
  if (planText != null) {
    const raw = String(planText).trim();
    let plan;
    try { plan = JSON.parse(raw); } catch { return { error: 'Planen er ikke gyldig JSON' }; }
    if (Array.isArray(plan)) plan = { calls: plan };
    const calls = plan?.calls;
    if (!Array.isArray(calls) || calls.length < 1 || calls.length > 6) return { error: 'Planen må ha 1–6 kall' };
    if (calls.some((c) => !c || typeof c.tool !== 'string' || !c.tool || (c.args != null && typeof c.args !== 'object'))) return { error: 'Hvert kall trenger «tool» og «args»' };
    const bv = badVars61(JSON.stringify(calls));
    if (bv.length) return { error: `Ukjent variabel i planen: {${bv[0]}}` };
    const norm = { calls: calls.map((c) => ({ tool: c.tool, args: c.args ?? {} })) };
    if (JSON.stringify(norm) !== JSON.stringify({ calls: (it.plan?.calls ?? []).map((c) => ({ tool: c.tool, args: c.args ?? {} })) })) body.plan = norm;
  }
  if (typeof allowFastWrite === 'boolean' && allowFastWrite !== !!it.allowFastWrite) body.allowFastWrite = allowFastWrite;
  return { body };
}
/** «6 av 7 vellykket · 1 feil» */
export function statLine61(r = {}) {
  const u = r.useCount ?? 0, s = r.successCount ?? 0, f = r.failCount ?? 0;
  if (!u && !s && !f) return 'Ikke brukt ennå';
  return [`Brukt ${u} ${u === 1 ? 'gang' : 'ganger'}`, `${s} vellykket`, f ? `${f} feil` : '', r.last10 ? `siste 10: ${r.last10.success ?? 0}/${(r.last10.success ?? 0) + (r.last10.fail ?? 0) + (r.last10.pending ?? 0)}` : ''].filter(Boolean).join(' · ');
}
/** Planen som lesbar tekst (serverens readable/readableSteps, ellers verktøy + argumenter). */
export function readable61(r = {}) {
  if (Array.isArray(r.readableSteps) && r.readableSteps.length) return r.readableSteps;
  if (r.readable) return [r.readable];
  return (r.plan?.calls ?? []).map((c) => `${c.tool}(${Object.entries(c.args ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ')})`);
}
const when = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(+d)) return ''; return d.toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const pct = (x) => `${Math.round((x ?? 0) * 100)} %`;
const sim = (x) => (typeof x === 'number' ? x.toFixed(2).replace('.', ',') : '–');

/* ---------- API ---------- */
async function call(path, method = 'GET', json) {
  const r = await fetch(`/api/glimt/recipes${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: json !== undefined ? { 'Content-Type': 'application/json' } : {}, body: json !== undefined ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Fant ikke oppskriften' : r.status === 403 ? 'Bare administrator kan endre dette for alle' : `Feil ${r.status}`)), { status: r.status });
  return d;
}

/* ---------- Tommel opp/ned ---------- */
const VOTES = new Map();
const VKEY = 'th61';
function loadVotes() { try { const o = JSON.parse(localStorage.getItem(VKEY) || '{}'); for (const [k, v] of Object.entries(o)) VOTES.set(k, v); } catch { /* ingen lagring */ } }
function saveVotes() { try { localStorage.setItem(VKEY, JSON.stringify(Object.fromEntries([...VOTES].slice(-200)))); } catch { /* */ } }
let votesLoaded = false;
export const vote61 = (traceId) => { if (!votesLoaded) { votesLoaded = true; loadVotes(); } return VOTES.get(String(traceId)) ?? null; };
const TH_MSG = new Map();
const upSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H3V10h4zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7"/></svg>';
const downSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V3h4v11h-4zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17"/></svg>';
/** Tommel opp/ned for et Glimt-svar med traceId ('' uten). opts.dark: på mørk boble (Glimt-søket). */
export function thumbs61Html(traceId, opts = {}) {
  if (!traceId || !/^[A-Za-z0-9_.:-]{1,100}$/.test(String(traceId))) return '';
  css();
  const t = esc(traceId), v = vote61(traceId), msg = TH_MSG.get(String(traceId)) ?? '';
  const b = (k, svg, lab) => `<button type="button" class="th61-b${v === k ? ' on' : ''}" data-th61="${k}" data-th61-id="${t}" aria-pressed="${v === k}" aria-label="${lab}" title="${lab}">${svg}</button>`;
  return `<span class="th61${opts.dark ? ' dark' : ''}" data-th61-wrap="${t}" role="group" aria-label="Var svaret riktig?">${b('up', upSvg, 'Riktig svar – Glimt lærer av det')}${b('down', downSvg, 'Feil svar')}${msg ? `<span class="th61-m" role="status">${esc(msg)}</span>` : ''}</span>`;
}
function repaintThumbs(id) {
  for (const w of document.querySelectorAll('[data-th61-wrap]')) {
    if (w.dataset.th61Wrap !== id) continue;
    const tmp = document.createElement('span'); tmp.innerHTML = thumbs61Html(id, { dark: w.classList.contains('dark') });
    if (tmp.firstElementChild) w.replaceWith(tmp.firstElementChild);
  }
}
export async function sendVote61(traceId, vote) {
  const id = String(traceId), prev = vote61(id);
  VOTES.set(id, vote); saveVotes();
  try {
    const r = await call('/feedback', 'POST', { traceId: id, vote });
    const st = r.recipe?.status;
    TH_MSG.set(id, vote === 'up' ? (st === 'active' ? 'Takk! Glimt bruker dette igjen' : 'Takk!') : vote === 'down' ? 'Takk – Glimt lærer av det' : '');
    if (vote === 'down') document.dispatchEvent(new CustomEvent('recipes61:down', { detail: { traceId: id } }));
    L.at = 0; // lista lastes på nytt neste gang
    return r;
  } catch (e) {
    if (prev == null) VOTES.delete(id); else VOTES.set(id, prev);
    saveVotes();
    TH_MSG.set(id, e.status === 404 ? 'Svaret er for gammelt til å stemme på' : `Kunne ikke lagre: ${e.message}`);
    throw e;
  }
}

/* ---------- Brytere i AI-kontroll → Valg ---------- */
const S = { d: null, at: 0, busy: false, msg: '', missing: false, loading: null };
export async function loadSettings61(force = false) {
  if (!force && S.at && Date.now() - S.at < 20_000) return S.d;
  if (S.loading) return S.loading;
  S.loading = (async () => {
    try {
      const r = await fetch('/api/glimt/recipes/settings', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405) S.missing = true;
      else if (r.ok) { S.d = await r.json(); S.missing = false; S.msg = ''; }
      else S.msg = (await r.json().catch(() => ({}))).error || `Feil ${r.status}`;
    } catch (e) { S.msg = e.message; }
    S.at = Date.now(); S.loading = null;
    return S.d;
  })();
  return S.loading;
}
const sw = (on) => `<span class="ac-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
export function settingsHtml61() {
  if (S.missing) return '';
  const d = S.d;
  if (!d) return `<div class="ac-sec"><span class="ac-lab">GLIMT LÆRER</span><div class="ac-card ac-list"><div class="ac-mut" style="padding:12px 0">${S.msg ? esc(S.msg) : 'Laster …'}</div></div></div>`;
  const lab = (k) => esc(d.labels?.[k] ?? LAB[k]), help = (k) => esc(d.help?.[k] && d.help[k] !== '…' ? d.help[k] : HELP[k]);
  const mine = KEYS61.map((k) => {
    const srv = d.server?.[k] !== false, own = d.user?.[k], on = srv && (own ?? srv);
    const sub = !srv ? 'Slått av for alle av administrator' : own == null ? help(k) : `${help(k)} · Ditt eget valg`;
    return `<button type="button" class="ac-li" data-r61-user="${k}" role="switch" aria-checked="${on}"${S.busy || !srv ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${sub}</span></span>${sw(on)}</button>`;
  }).join('');
  const link = '<button type="button" class="ac-li" data-r61-open><span class="ac-col ac-grow"><b>Se hva Glimt har lært</b><span>Innstillinger → AI → Glimt lærer</span></span><span aria-hidden="true">›</span></button>';
  let admin = '';
  if (d.admin) {
    const rows = KEYS61.map((k) => { const on = d.server?.[k] !== false; return `<button type="button" class="ac-li" data-r61-server="${k}" role="switch" aria-checked="${on}"${S.busy ? ' disabled' : ''}><span class="ac-col ac-grow"><b>${lab(k)}</b><span>${help(k)}</span></span>${sw(on)}</button>`; }).join('');
    admin = `<div class="ac-sec"><span class="ac-lab">GLIMT LÆRER · FOR ALLE (ADMIN)</span><div class="ac-card ac-list">${rows}</div><div class="ac-note">Av her slår funksjonen av for alle brukere. Hver bruker kan i tillegg slå av for seg selv over.</div></div>`;
  }
  return `<div class="ac-sec" data-r61-sec><span class="ac-lab">GLIMT LÆRER · FOR MEG</span><div class="ac-card ac-list">${mine}${link}</div>${S.msg ? `<div class="ac-note" role="status">${esc(S.msg)}</div>` : ''}</div>${admin}`;
}
async function putSettings(body) { const j = await call('/settings', 'PUT', body); S.d = j; S.at = Date.now(); return j; }

/* ---------- Siden «Glimt lærer» ---------- */
const L = { d: null, at: 0, loading: null, missing: false, err: '', msg: '', filter: '', q: '', open: null, det: {}, edit: null, arm: null, busy: false, test: {}, stats: null };
export async function loadRecipes61(force = false) {
  if (!force && L.at && Date.now() - L.at < 20_000) return L.d;
  if (L.loading) return L.loading;
  L.loading = (async () => {
    try {
      const r = await fetch('/api/glimt/recipes', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404 || r.status === 405) L.missing = true;
      else if (r.ok) { L.d = await r.json(); L.missing = false; L.err = ''; }
      else L.err = (await r.json().catch(() => ({}))).error || `Feil ${r.status}`;
      if (!L.missing) L.stats = await call('/stats').catch(() => null);
    } catch (e) { L.err = e.message; }
    L.at = Date.now(); L.loading = null;
    return L.d;
  })();
  return L.loading;
}
const pill = (st) => `<i class="r61-st r61-${esc(st)}">${esc(STATUS61[st] ?? st)}</i>`;
function statsHtml() {
  const s = L.stats;
  if (!s) return '';
  const r = s.recipes ?? {}, u = s.runs ?? {};
  const cell = (n, t) => `<span><b>${esc(n)}</b><small>${esc(t)}</small></span>`;
  return `<div class="r61-stats" aria-label="Statistikk">${cell(r.active ?? 0, 'aktive')}${cell(r.candidate ?? 0, 'kandidater')}${cell(u.total ?? 0, 'kjøringer')}${cell(u.total ? pct((u.success ?? 0) / u.total) : '–', 'vellykket')}${cell(pct(s.fastShare), 'hurtigvei')}${cell(s.corrections ?? 0, 'rettelser')}</div>`;
}
function editHtml(it) {
  const id = esc(it.id);
  return `<form class="sg-form r61-form" data-r61-form="${id}" autocomplete="off">
    <label class="sg-field"><span>Mal</span><input name="queryTemplate" required minlength="3" maxlength="200" value="${esc(it.queryTemplate ?? '')}" aria-label="Mal for forespørselen"></label>
    <label class="sg-field r61-plan"><span>Plan (JSON)</span><textarea name="plan" rows="${Math.min(10, 3 + (it.plan?.calls?.length ?? 1) * 2)}" spellcheck="false" aria-label="Planen som JSON">${esc(JSON.stringify(it.plan ?? { calls: [] }, null, 1))}</textarea></label>
    <div class="sg-row"><span class="sg-txt"><span>Variabler: ${VARS61.map((v) => `<code>{${esc(v)}}</code>`).join(' ')}</span></span></div>
    ${it.writes ? `<label class="sg-row r61-chk"><span class="sg-txt"><b>Hurtigvei også for endringer</b><span>Planen endrer data. Uten dette spør Glimt alltid først.</span></span><input type="checkbox" name="allowFastWrite"${it.allowFastWrite ? ' checked' : ''}></label>` : ''}
    <div class="sg-row"><span class="sg-txt"><span role="status">${esc(L.msg)}</span></span><button type="button" class="sg-btn2" data-r61-cancel>Avbryt</button><button type="submit" class="sg-btn2"${L.busy ? ' disabled' : ''}>Lagre</button></div></form>`;
}
function testHtml(id) {
  const t = L.test[id];
  if (!t) return '';
  if (t.busy) return '<div class="r61-test" role="status">Tester …</div>';
  if (t.err) return `<div class="r61-test bad" role="status">${esc(t.err)}</div>`;
  const r = t.r, slots = Object.entries(r.slots ?? {}).map(([k, v]) => `{${k}} = ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
  const steps = (r.steps ?? []).map((s) => `<li class="${s.ok === false ? 'bad' : ''}"><code data-no-i18n>${esc(s.tool)}</code> ${esc(s.summary || s.error || s.status || '')}</li>`).join('');
  return `<div class="r61-test${r.ok ? ' ok' : ' bad'}" role="status"><b>${r.ok ? 'Planen virker' : 'Planen kunne ikke fylles ut'}</b>${r.ms != null ? ` <small>${esc(r.ms)} ms</small>` : ''}
    <span data-no-i18n>«${esc(r.text)}» · likhet ${sim(r.similarity)}${slots ? ` · ${esc(slots)}` : ''}</span>
    ${r.missing?.length ? `<span>Mangler: ${r.missing.map((m) => `{${esc(m)}}`).join(', ')}</span>` : ''}
    ${r.readable ? `<span data-no-i18n>${esc(r.readable)}</span>` : ''}${steps ? `<ul>${steps}</ul>` : ''}
    ${r.fast ? `<span>${r.fast.eligible ? 'Kan gå hurtigveien' : `Ikke hurtigvei: ${esc((r.fast.reasons ?? []).join(' · '))}`}</span>` : ''}</div>`;
}
function detailHtml(it) {
  const id = esc(it.id), D = L.det[it.id];
  if (L.edit === it.id) return editHtml(it);
  const steps = readable61(it).map((s) => `<li data-no-i18n>${esc(s)}</li>`).join('');
  const slots = Object.entries(it.slots ?? {}).map(([k, v]) => `<i data-no-i18n>{${esc(k)}} ← ${esc(v?.source ?? '')}${v?.value ? `: ${esc(v.value)}` : ''}</i>`).join('');
  const fast = it.fast ? (it.fast.eligible ? 'Kan gå hurtigveien' : `Ikke hurtigvei: ${(it.fast.reasons ?? []).join(' · ')}`) : '';
  const runs = D?.runs?.length ? `<details class="r61-runs"><summary>Siste kjøringer (${D.runs.length})</summary><ul>${D.runs.map((r) => `<li class="r61-${esc(r.state)}"><span>${esc(when(r.at))}</span> <span data-no-i18n>«${esc(r.text)}»</span> · ${esc(USE[r.use] ?? r.use)} · ${esc(STATE[r.state] ?? r.state)}${r.reason ? ` (${esc(r.reason)})` : ''}${r.vote ? ` · ${r.vote === 'up' ? '👍' : '👎'}` : ''}</li>`).join('')}</ul></details>` : D?.err ? `<div class="r61-test bad">${esc(D.err)}</div>` : D ? '' : '<div class="ac-mut">Laster kjøringer …</div>';
  const neg = D?.negatives?.length ? `<details class="r61-runs"><summary>Negative eksempler (${D.negatives.length})</summary><ul>${D.negatives.map((n) => `<li><span data-no-i18n>«${esc(n.query)}»</span><br>Feil: <span data-no-i18n>${esc(n.readableWrong ?? '')}</span>${n.readableRight ? `<br>Riktig: <span data-no-i18n>${esc(n.readableRight)}</span>` : ''}</li>`).join('')}</ul></details>` : '';
  const tgl = it.status === 'disabled' ? `<button type="button" class="sg-btn2" data-r61-st="active" data-r61-id="${id}">Slå på</button>` : `<button type="button" class="sg-btn2" data-r61-st="disabled" data-r61-id="${id}">Slå av</button>`;
  const del = `<button type="button" class="sg-btn2 r61-del" data-r61-del="${id}">${L.arm === it.id ? 'Trykk igjen for å slette' : 'Slett'}</button>`;
  return `<div class="r61-det" data-r61-det="${id}">
    <div class="r61-kv"><b>Eksempel</b><span data-no-i18n>«${esc(it.exampleQuery)}»</span></div>
    <div class="r61-kv"><b>Mal</b><span data-no-i18n>${esc(it.queryTemplate ?? '')}</span></div>
    <div class="r61-kv"><b>Plan</b><ol>${steps || '<li>–</li>'}</ol></div>
    ${slots ? `<div class="r61-kv"><b>Variabler</b><span class="r61-chips">${slots}</span></div>` : ''}
    <div class="r61-kv"><b>Om</b><span>${esc([SRC[it.source] ?? it.source, it.intent, it.writes ? 'endrer data' : 'bare lesing', it.hasEmbedding === false ? 'uten embedding (ordlikhet)' : '', it.disabledReason, it.negatives ? `${it.negatives} negative eksempler` : ''].filter(Boolean).join(' · '))}</span></div>
    ${fast ? `<div class="r61-kv"><b>Hurtigvei</b><span>${esc(fast)}</span></div>` : ''}
    ${runs}${neg}
    <form class="r61-tf" data-r61-test="${id}" autocomplete="off"><input name="text" maxlength="1000" placeholder="${esc(it.exampleQuery)}" aria-label="Tekst å teste med (tom = eksemplet)"><button type="submit" class="sg-btn2"${L.test[it.id]?.busy ? ' disabled' : ''}>Test</button></form>
    ${testHtml(it.id)}
    <div class="r61-acts">${tgl}<button type="button" class="sg-btn2" data-r61-edit="${id}">Rediger mal</button>${del}</div></div>`;
}
function rowHtml(it) {
  const open = L.open === it.id;
  return `<div class="r61-item${open ? ' open' : ''}" data-r61-row="${esc(it.id)}"><button type="button" class="sg-row r61-head" data-r61-toggle="${esc(it.id)}" aria-expanded="${open}"><span class="sg-txt"><b data-no-i18n>${esc(it.queryTemplate || it.exampleQuery)}</b><span>${pill(it.status)} ${esc(statLine61(it))}${it.lastUsedAt ? ` · sist ${esc(when(it.lastUsedAt))}` : ''}</span><span class="r61-plan1" data-no-i18n>${esc(readable61(it).join(' → '))}</span></span><span aria-hidden="true" class="r61-chev">${open ? '▾' : '›'}</span></button>${open ? detailHtml(it) : ''}</div>`;
}
export function learnHtml61() {
  if (L.missing) return '<div class="sg-row"><span class="sg-txt"><span>Serveren har ikke «Glimt lærer» ennå. Oppdater serveren.</span></span></div>';
  const d = L.d;
  if (!d) return `<div class="sg-row"><span class="sg-txt"><span>${L.err ? `Serveren svarte: ${esc(L.err)}` : 'Laster …'}</span></span></div>`;
  const items = Array.isArray(d.items) ? d.items : [], c = d.counts ?? {};
  const n = (s) => c[s] ?? items.filter((x) => x.status === s).length;
  const bar = `<div class="e60-bar r61-bar" role="group" aria-label="Vis status"><button type="button" class="${L.filter ? '' : 'on'}" data-r61-f="" aria-pressed="${!L.filter}">Alle <small>${c.total ?? items.length}</small></button>${['active', 'candidate', 'disabled'].map((s) => `<button type="button" class="${L.filter === s ? 'on' : ''}" data-r61-f="${s}" aria-pressed="${L.filter === s}">${STATUS61[s]} <small>${n(s)}</small></button>`).join('')}</div>`;
  const search = `<form class="sg-row r61-q" data-r61-q autocomplete="off"><input name="q" maxlength="80" value="${esc(L.q)}" placeholder="Søk i oppskriftene" aria-label="Søk i oppskriftene"><button type="submit" class="sg-btn2">Søk</button></form>`;
  const off = d.enabled === false ? '<div class="sg-row e60-off"><span class="sg-txt"><b>Glimt lærer ikke nå</b><span>Slått av i AI → Oppgaver → Glimt lærer. Lagrede oppskrifter står.</span></span></div>' : '';
  const q = L.q.toLowerCase();
  const shown = items.filter((x) => (!L.filter || x.status === L.filter) && (!q || `${x.exampleQuery} ${x.queryTemplate}`.toLowerCase().includes(q)));
  const list = shown.length ? shown.map(rowHtml).join('') : `<div class="sg-row"><span class="sg-txt"><span>${items.length ? 'Ingen oppskrifter passer.' : 'Glimt har ikke lært noe ennå. Når Glimt løser noe riktig (og du ikke retter det), lagres oppskriften her. Tommel opp på et svar gjør den aktiv med en gang.'}</span></span></div>`;
  return `<div class="r61" data-r61>${statsHtml()}${bar}${search}${off}${L.msg && !L.edit ? `<div class="sg-row"><span class="sg-txt"><span role="status">${esc(L.msg)}</span></span></div>` : ''}${list}</div>`;
}

const STYLE61 = `.th61{display:inline-flex;align-items:center;gap:2px;flex-wrap:wrap}
.th61 .th61-b{min-width:32px;height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;border-radius:15px;border:0;background:transparent;color:inherit;opacity:.65;cursor:pointer}
.th61 .th61-b:hover{opacity:1;background:rgba(127,127,127,.16)}
.th61 .th61-b.on{opacity:1;background:rgba(127,127,127,.24)}
.th61 .th61-m{font-size:12.5px;opacity:.8;margin-left:4px}
#gl-layer .th61.dark button.th61-b{width:auto;height:32px;margin:0;box-shadow:none;color:#fff;background:rgba(255,255,255,.08)}
#gl-layer .th61.dark button.th61-b.on{background:rgba(255,255,255,.26)}
.r61-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:14px 26px 4px}
.r61-stats span{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.12);min-width:0}
.r61-stats b{font-size:18px}.r61-stats small{font-size:12px;opacity:.7}
.r61-q input{flex:1 1 140px;min-width:0;height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit}
.r61-head{width:100%;text-align:left;background:transparent;border:0;border-top:1px solid rgba(127,127,127,.2);color:inherit;font:inherit;cursor:pointer}
.r61-head .sg-txt{min-width:0}.r61-head .sg-txt b,.r61-head .sg-txt span{overflow-wrap:anywhere}
.r61-plan1{font-size:13px;opacity:.7}
.r61-chev{flex:none;opacity:.6}
.r61-st{font-style:normal;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;margin-right:4px;border:1px solid currentColor}
.r61-active{color:#2f9e5b}.r61-candidate{color:#b7871a}.r61-disabled{color:#8a8a8a}
.r61-det{display:flex;flex-direction:column;gap:10px;padding:4px 26px 16px}
.r61-kv{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;font-size:14.5px;line-height:1.45}
.r61-kv>b{opacity:.7;font-weight:600}.r61-kv span,.r61-kv li{overflow-wrap:anywhere}.r61-kv ol{margin:0;padding-left:18px}
.r61-chips{display:flex;flex-wrap:wrap;gap:5px}.r61-chips i{font-style:normal;font-size:13px;padding:2px 9px;border-radius:999px;border:1px solid rgba(127,127,127,.35)}
.r61-runs{font-size:14px}.r61-runs summary{cursor:pointer;opacity:.85}.r61-runs ul{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.r61-runs li.r61-fail{color:#d0503c}.r61-runs li{overflow-wrap:anywhere}
.r61-tf{display:flex;gap:8px;flex-wrap:wrap}.r61-tf input{flex:1 1 160px;min-width:0;height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit}
.r61-test{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.12);font-size:14px;overflow-wrap:anywhere}
.r61-test.ok{box-shadow:inset 3px 0 0 #2f9e5b}.r61-test.bad{box-shadow:inset 3px 0 0 #d0503c}.r61-test ul{margin:0;padding-left:18px}.r61-test li.bad{color:#d0503c}
.r61-acts{display:flex;gap:8px;flex-wrap:wrap}.r61-del{color:#d0503c!important}
.r61-form .sg-row{flex-wrap:wrap;min-height:0}.r61-form .sg-field input{flex:1;min-width:0}
.r61-form textarea{flex:1;min-width:0;font:13px/1.4 ui-monospace,Menlo,monospace;padding:8px 10px;border-radius:10px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;resize:vertical}
.r61-form code,.r61-det code{font-size:12.5px}
.r61-chk{cursor:pointer}.r61-chk input{width:22px;height:22px;flex:none}
@media (max-width:600px){.r61-stats{grid-template-columns:repeat(3,minmax(0,1fr));padding:12px 16px 4px}.r61-det{padding:4px 16px 14px}.r61-kv{grid-template-columns:minmax(0,1fr);gap:2px}.r61 .sg-row{flex-wrap:wrap;gap:10px}.r61-plan textarea{width:100%}.r61-form .sg-field{flex-wrap:wrap}}`;
function css() { if (typeof document === 'undefined' || document.getElementById('r61-css')) return; const st = document.createElement('style'); st.id = 'r61-css'; st.textContent = STYLE61; document.head.appendChild(st); }

const repaintSettings = () => { for (const el of document.querySelectorAll('[data-recipes61]')) el.innerHTML = settingsHtml61(); };
const repaintLearn = () => { for (const el of document.querySelectorAll('[data-learn61]')) el.innerHTML = learnHtml61(); };
let raf = 0;
function decorate() {
  const s = [...document.querySelectorAll('[data-recipes61]:not([data-r61-done])')], l = [...document.querySelectorAll('[data-learn61]:not([data-r61-done])')];
  if (!s.length && !l.length) return;
  css();
  for (const el of s) { el.dataset.r61Done = '1'; el.innerHTML = settingsHtml61(); }
  for (const el of l) { el.dataset.r61Done = '1'; el.innerHTML = learnHtml61(); }
  if (s.length) loadSettings61().then(repaintSettings);
  if (l.length) loadRecipes61().then(repaintLearn);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };
const itemOf = (id) => (L.d?.items ?? []).find((x) => x.id === id) ?? null;
async function loadDetail(id) {
  try { const r = await call(`/${encodeURIComponent(id)}`); L.det[id] = { runs: r.runs ?? [], negatives: r.negatives ?? [] }; if (r.item) replaceItem(r.item); }
  catch (e) { L.det[id] = { err: `Kunne ikke hente kjøringene: ${e.message}` }; }
  repaintLearn();
}
function replaceItem(item) { const xs = L.d?.items; if (!xs) return; const i = xs.findIndex((x) => x.id === item.id); if (i >= 0) xs[i] = item; }
async function actSettings(fn) {
  S.busy = true; S.msg = ''; repaintSettings();
  try { S.msg = (await fn()) ?? ''; } catch (err) { S.msg = err.message; }
  S.busy = false; repaintSettings();
  L.at = 0;
  document.dispatchEvent(new CustomEvent('recipes61:change', { detail: S.d }));
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', async (e) => {
    const th = e.target.closest?.('[data-th61]');
    if (th) {
      e.preventDefault(); e.stopPropagation();
      const id = th.dataset.th61Id, k = th.dataset.th61, next = vote61(id) === k ? null : k;
      TH_MSG.delete(id);
      const p = sendVote61(id, next).catch(() => {});
      repaintThumbs(id); await p; repaintThumbs(id);
      return;
    }
    const u = e.target.closest?.('[data-r61-user]'), s = e.target.closest?.('[data-r61-server]');
    if (u && !u.disabled) {
      const k = u.dataset.r61User, d = S.d, srv = d?.server?.[k] !== false, cur = srv && (d?.user?.[k] ?? srv), next = !cur;
      actSettings(async () => { await putSettings({ scope: 'user', [k]: next === srv ? null : next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for deg`; });
      return;
    }
    if (s && !s.disabled) {
      const k = s.dataset.r61Server, next = !(S.d?.server?.[k] !== false);
      actSettings(async () => { await putSettings({ scope: 'server', [k]: next }); return `${LAB[k]} er ${next ? 'på' : 'av'} for alle`; });
      return;
    }
    if (e.target.closest?.('[data-r61-open]')) {
      const el = document.querySelector('[data-learn61]');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      import('./settings.js').then((m) => m.openSettings('ai')).catch(() => { location.hash = '#/innstillinger/ai'; });
      return;
    }
    const t = e.target.closest?.('[data-r61-f],[data-r61-toggle],[data-r61-edit],[data-r61-cancel],[data-r61-del],[data-r61-st]');
    if (!t || !t.closest('[data-r61]')) return;
    e.preventDefault();
    const ds = t.dataset;
    if (ds.r61F != null) { L.filter = ds.r61F; repaintLearn(); return; }
    if (ds.r61Toggle) { const id = ds.r61Toggle; L.open = L.open === id ? null : id; L.edit = null; L.arm = null; L.msg = ''; repaintLearn(); if (L.open) loadDetail(id); return; }
    if (ds.r61Edit) { L.edit = ds.r61Edit; L.arm = null; L.msg = ''; repaintLearn(); document.querySelector(`[data-r61-form="${ds.r61Edit}"] input[name=queryTemplate]`)?.focus(); return; }
    if (ds.r61Cancel != null) { L.edit = null; L.msg = ''; repaintLearn(); return; }
    if (ds.r61St) {
      const id = ds.r61Id;
      L.busy = true;
      try { const r = await call(`/${encodeURIComponent(id)}`, 'PATCH', { status: ds.r61St }); if (r.item) replaceItem(r.item); L.msg = ds.r61St === 'disabled' ? 'Oppskriften er slått av ✓' : 'Oppskriften er slått på ✓'; await loadRecipes61(true); }
      catch (er) { L.msg = `Kunne ikke endre: ${er.message}`; }
      L.busy = false; repaintLearn(); return;
    }
    if (ds.r61Del) {
      const id = ds.r61Del;
      if (L.arm !== id) { L.arm = id; repaintLearn(); return; }
      try { await call(`/${encodeURIComponent(id)}`, 'DELETE'); L.msg = 'Slettet ✓'; L.open = null; L.arm = null; delete L.det[id]; await loadRecipes61(true); }
      catch (er) { L.msg = `Kunne ikke slette: ${er.message}`; L.arm = null; }
      repaintLearn();
    }
  }, true);
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest?.('[data-r61-form],[data-r61-test],[data-r61-q]');
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    if (f.matches('[data-r61-q]')) { L.q = String(fd.get('q') ?? '').trim().slice(0, 80); repaintLearn(); return; }
    if (f.matches('[data-r61-test]')) {
      const id = f.dataset.r61Test, text = String(fd.get('text') ?? '').trim();
      L.test[id] = { busy: true }; repaintLearn();
      try { L.test[id] = { r: await call(`/${encodeURIComponent(id)}/test`, 'POST', text ? { text } : {}) }; }
      catch (er) { L.test[id] = { err: `Testen feilet: ${er.message}` }; }
      repaintLearn(); return;
    }
    const id = f.dataset.r61Form, it = itemOf(id);
    if (!it) return;
    const { error, body } = checkEdit61({ queryTemplate: fd.get('queryTemplate'), planText: fd.get('plan'), allowFastWrite: it.writes ? fd.get('allowFastWrite') === 'on' : undefined }, it);
    if (error) { L.msg = error; repaintLearn(); return; }
    if (!Object.keys(body).length) { L.edit = null; L.msg = 'Ingen endringer'; repaintLearn(); return; }
    L.busy = true; L.msg = 'Lagrer …'; repaintLearn();
    try { const r = await call(`/${encodeURIComponent(id)}`, 'PATCH', body); if (r.item) replaceItem(r.item); L.busy = false; L.edit = null; L.msg = 'Lagret ✓'; delete L.test[id]; await loadRecipes61(true); }
    catch (er) { L.busy = false; L.msg = `Kunne ikke lagre: ${er.message}`; }
    repaintLearn();
  });
  const boot = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
}

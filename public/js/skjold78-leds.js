// Prompt 78 (LEDWEB): LED over skuffene i Skjold Lab på web – «vis meg hvor delen ligger».
// - «💡 Vis i skapet» på detaljsiden og som 💡 i trefflista (POST /api/skjold/locate {partId}); med et søk kan
//   «💡 Vis alle i skapet (n)» tenne opptil 20 treff samtidig (10 før prompt 79) ({partIds:[…]}). Linja øverst viser hva som lyser og
//   hvor lenge (untilMs), med «Slå av» (POST /locate/off).
// - Innstillingen «Lys opp automatisk når jeg åpner et treff» (autoLocateOpen) og «Glimt lyser opp skuffen når den svarer»
//   (autoLocateGlimt), begge av som standard: GET|PUT /api/skjold/leds/settings, speilet i localStorage «sk78_set»
//   (brukes alene hvis serveren svarer 404).
// - LED-oppsett per skap under #/skjold/oppsett/<id>: WLED-vert, på/av, farge, varighet, blink, lysstyrke, skuffavstand,
//   rader (start, antall, retning, pitch, forskyvning) med «Fyll ut» (serpentine/samme retning), test (alle / rad / én LED)
//   og en veiviser for kalibrering: én LED lyser (POST /cabinets/:id/leds/calibrate {index}), man trykker på skuffen den
//   lyser over (PUT /cabinets/:id/leds/override {row,col,index}), og neste LED tennes. Statusmerket viser om WLED svarer
//   (GET /leds/status?cabinet=<id> → {ok, name, ledCount, version}).
// Serveren snakker bare med verter i hjemmenettet og begrenser til 5 kall i sekundet; klienten demper raske klikk i veiviseren.
import { esc } from './util.js';
import { toast } from './toast.js';
import { S, sk, paintMain, cabById, locOf } from './skjold76.js';
import { short76, long76 } from './skjold76-draw.js';
import { diagBtn79, diagHtml79 } from './skjold79-pick.js'; // prompt 79: Feilsøk LED
import { normLeds78, autoRows78, ledIndex78, ledTotal78, hostOk78, ledsBody78, secsLeft78, statusText78, PITCH60 } from './skjold78-logic.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-sk78-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/skjold78.css'; l.dataset.sk78Css = ''; document.head.appendChild(l);
}

/** cfg: LED-oppsett per skap · st: status per skap · lit: det som lyser nå · ed: skjemaet · wiz: kalibreringen. */
export const M = { cfg: {}, loading: {}, st: {}, set: null, lit: null, ed: null, wiz: null, busy: false };
const SET_DEF = { autoLocateOpen: false, autoLocateGlimt: false };
const LS_SET = 'sk78_set';
const isNet = (e) => e instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);
const errText = (e) => (e?.status === 429 ? 'Vent litt – for mange lys-kommandoer på kort tid.' : isNet(e) ? 'Lyset i skapet krever nett.' : e?.message || 'Fikk ikke kontakt med lyset i skapet.');
const enc = encodeURIComponent;

/* ================= Innstillinger ================= */

const uid = () => { try { return localStorage.getItem('hl_uid') || ''; } catch { return ''; } };
function localSet() {
  try { const o = JSON.parse(localStorage.getItem(LS_SET) || 'null'); if (o && (!o.uid || String(o.uid) === uid())) return o; } catch { /* privat modus */ }
  return null;
}
const pickSet = (o) => { const l = localSet() ?? {}; const r = {}; for (const k of Object.keys(SET_DEF)) r[k] = typeof o?.[k] === 'boolean' ? o[k] : typeof l[k] === 'boolean' ? l[k] : SET_DEF[k]; return r; };
const saveLocal = (s) => { try { localStorage.setItem(LS_SET, JSON.stringify({ uid: uid(), ...s })); } catch { /* privat modus */ } };
let setLoading = null, setLocalOnly = false;
export const set78 = () => M.set ?? pickSet(null);
export function loadSet78() {
  if (M.set || setLoading) return setLoading ?? Promise.resolve(M.set);
  setLoading = sk('/leds/settings').then((d) => { M.set = pickSet(d?.settings ?? d); saveLocal(M.set); })
    .catch((e) => { setLocalOnly = e?.status === 404; M.set = pickSet(null); })
    .finally(() => { setLoading = null; });
  return setLoading;
}
async function saveSet78(patch) {
  const prev = set78(), next = { ...prev, ...patch };
  M.set = next; saveLocal(next);
  if (setLocalOnly) return;
  try { const r = await sk('/leds/settings', { method: 'PUT', json: patch }); M.set = pickSet(r?.settings ?? r ?? next); saveLocal(M.set); } catch (e) {
    if (e?.status === 404) { setLocalOnly = true; return; }
    M.set = prev; saveLocal(prev); toast(`Fikk ikke lagret: ${errText(e)}`);
  }
}
const autoSw = (k, t, sub) => `<label class="sk78-sw"><input type="checkbox" data-sk78-set="${k}"${set78()[k] ? ' checked' : ''}><span><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;

/* ================= Data ================= */

/** LED-oppsettet for et skap (null mens det hentes). */
export function cfgOf78(cabId) {
  if (cabId == null) return null;
  if (M.cfg[cabId]) return M.cfg[cabId];
  loadLeds78(cabId);
  return null;
}
export function loadLeds78(cabId, force = false) {
  if (M.loading[cabId] && !force) return M.loading[cabId];
  M.loading[cabId] = sk(`/cabinets/${enc(cabId)}/leds`)
    .then((d) => { M.cfg[cabId] = normLeds78(d, cabById(cabId)); })
    .catch((e) => { if (!M.cfg[cabId] || e?.status === 404) M.cfg[cabId] = normLeds78(null, cabById(cabId)); M.cfg[cabId].loadErr = e?.status === 404 ? '' : errText(e); })
    .finally(() => { delete M.loading[cabId]; repaint(); });
  return M.loading[cabId];
}
/** Har skapet lys som er slått på? Skaplisten har et kort sammendrag (leds: {enabled, configured}), så lista slipper å hente oppsettet. */
const ready = (cabId) => {
  if (M.cfg[cabId]) return !!(M.cfg[cabId].enabled && M.cfg[cabId].host);
  const b = cabById(cabId)?.leds;
  if (b && typeof b === 'object' && typeof b.enabled === 'boolean') return b.enabled;
  const L = cfgOf78(cabId); return !!(L && L.enabled && L.host);
};
export async function loadStatus78(cabId) {
  M.st[cabId] = null; repaintSetup();
  try { const d = await sk(`/leds/status?cabinet=${enc(cabId)}`); M.st[cabId] = { ...d, ok: d?.ok !== false, at: Date.now() }; } catch (e) { M.st[cabId] = { ok: false, error: errText(e), at: Date.now() }; }
  repaintSetup();
}
/** Etter at skapene er hentet (skaplisten har bare sammendraget {enabled, configured}). */
export function onCabs78() { loadSet78(); }

let rpT = 0;
function repaint() { clearTimeout(rpT); rpT = setTimeout(() => { if (document.getElementById('sk76') && S.route.v !== 'edit') { if (S.route.v === 'setup') repaintSetup(); else paintMain(); } }, 30); }
function repaintSetup() {
  const box = document.querySelector('#sk76 [data-sk78-setup]'), c = cabById(box?.dataset.sk78Setup);
  if (box && c) box.outerHTML = ledSetupHtml78(c);
}

/* ================= Vis i skapet ================= */

let tick = 0;
function paintLit() {
  const el = document.querySelector('#sk76 [data-sk78-lit]'); if (!el) return;
  const L = M.lit, left = L ? secsLeft78(L.until) : 0;
  if (L && !left) { M.lit = null; clearInterval(tick); }
  el.hidden = !M.lit;
  if (!M.lit) { el.innerHTML = ''; return; }
  const many = (S.cabs ?? []).length > 1, one = M.lit.lit.length === 1;
  const dot = (x) => (/^#[0-9a-f]{6}$/i.test(x.color ?? '') ? `<i class="sk79-dot" style="background:${x.color}" aria-hidden="true"></i>` : ''); // prompt 79: farge per del
  const seen = new Set(), uniq = M.lit.lit.filter((x) => { const k = `${x.cabinetId}:${x.row}-${x.col}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const where = uniq.slice(0, 4).map((x) => { const c = cabById(x.cabinetId); return dot(x) + esc(one ? [many ? c?.name : '', long76(x.row, x.col)].filter(Boolean).join(' · ') : `${many && c ? `${c.name} ` : ''}${short76(x.row, x.col)}`); }).join(', ');
  el.innerHTML = `<span class="sk78-dot" aria-hidden="true"></span><span class="sk78-lt"><b>Lyser i skapet</b> ${where}${uniq.length > 4 ? ` +${uniq.length - 4}` : ''} · <span class="sk78-sec">${left} s</span></span><button type="button" class="sk76-btn" data-sk78="off">Slå av</button>`;
}
/** Linja som viser hva som lyser (settes inn i skallet). */
export const litBarHtml78 = () => '<div class="sk78-lit" data-sk78-lit role="status" aria-live="polite" hidden></div>';

export async function locate78(body, { quiet = false } = {}) {
  if (M.busy) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) { if (!quiet) toast('Lyset i skapet krever nett.'); return null; }
  M.busy = true; document.querySelectorAll('#sk76 [data-sk78="locate"],#sk76 [data-sk78-loc]').forEach((b) => b.setAttribute('aria-busy', 'true'));
  try {
    const r = await sk('/locate', { method: 'POST', json: body });
    const lit = Array.isArray(r?.lit) ? r.lit : [];
    if (r?.ok === false || !lit.length) { if (!quiet) toast(r?.error || r?.message || 'Fant ingen skuff med lys for dette.'); return r; }
    M.lit = { lit, until: r.untilMs ?? Date.now() + 30_000 };
    clearInterval(tick); tick = setInterval(paintLit, 1000); paintLit();
    if (!quiet) toast(lit.length === 1 ? `💡 ${long76(lit[0].row, lit[0].col)} lyser` : `💡 ${lit.length} skuffer lyser`);
    return r;
  } catch (e) { if (!quiet) toast(errText(e)); return null; } finally {
    M.busy = false; document.querySelectorAll('#sk76 [aria-busy="true"][data-sk78-loc],#sk76 [aria-busy="true"][data-sk78="locate"]').forEach((b) => b.removeAttribute('aria-busy'));
  }
}
export async function off78() {
  M.lit = null; clearInterval(tick); paintLit();
  try { await sk('/locate/off', { method: 'POST', json: {} }); } catch (e) { toast(errText(e)); }
}

/** Knappen på detaljsiden (under plasseringen). */
export function locateBtn78(p) {
  const l = locOf(p);
  if (!l || p?.deletedAt || p?.deleted_at) return '';
  const L = cfgOf78(l.cabinetId);
  if (!L) return ready(l.cabinetId) ? `<div class="sk78-locrow"><button type="button" class="sk76-btn sk78-loc" data-sk78="locate">💡 Vis i skapet</button></div>` : '<div class="sk78-locrow" aria-busy="true"></div>';
  if (!L.enabled || !L.host) return `<div class="sk78-locrow"><a class="sk76-link" href="#/skjold/oppsett/${enc(l.cabinetId)}">💡 Sett opp lys over skuffene</a></div>`;
  return `<div class="sk78-locrow"><button type="button" class="sk76-btn sk78-loc" data-sk78="locate">💡 Vis i skapet</button>${autoSw('autoLocateOpen', 'Lys opp automatisk når jeg åpner et treff', '')}</div>`;
}
/** 💡 ved siden av et treff i lista (tom streng når skapet ikke har lys). */
export function listBtn78(p) {
  const l = locOf(p);
  if (!l || !ready(l.cabinetId)) return '';
  return `<button type="button" class="sk78-lb" data-sk78-loc="${esc(p.id)}" aria-label="${esc(`Vis ${p.name} i skapet`)}" title="Vis i skapet">💡</button>`;
}
/** «Vis alle i skapet» over trefflista når det er søkt. */
export function listAllBtn78(items) {
  if (!S.q && !S.cat && !S.low) return '';
  const ids = (items ?? []).filter((p) => { const l = locOf(p); return l && ready(l.cabinetId); }).map((p) => p.id).slice(0, 20);
  return ids.length > 1 ? `<button type="button" class="sk76-link sk78-all" data-sk78="locate-all">💡 Vis alle i skapet (${ids.length})</button>` : '';
}
const listIds = () => (S.items ?? []).filter((p) => { const l = locOf(p); return l && ready(l.cabinetId); }).map((p) => p.id).slice(0, 20);

let autoKey = '';
/** Kalles når detaljsiden for en del er åpnet (fra onHash). Lyser opp av seg selv når innstillingen er på. */
export async function afterPart78(p) {
  const l = locOf(p); if (!l || p?.deletedAt || p?.deleted_at) return;
  await loadSet78();
  if (!cfgOf78(l.cabinetId)) await M.loading[l.cabinetId];
  if (!set78().autoLocateOpen || !ready(l.cabinetId)) return;
  const key = `${p.id}:${location.hash}`;
  if (key === autoKey && M.lit) return;
  autoKey = key;
  if (S.route.v === 'part' && String(S.route.id) === String(p.id)) locate78({ partId: p.id }, { quiet: true });
}

/* ================= LED-oppsett per skap ================= */

function edFor(c) {
  if (M.ed?.cabId === c.id) return M.ed;
  const L = cfgOf78(c.id);
  if (!L) return null;
  M.ed = { cabId: c.id, L: JSON.parse(JSON.stringify(L)), dirty: false, per: L.rows[0]?.count ?? 0, serp: L.rows.some((r) => r.reverse), testIdx: 0 };
  M.wiz = null;
  if (L.host && !(c.id in M.st)) { M.st[c.id] = null; setTimeout(() => loadStatus78(c.id), 0); }
  return M.ed;
}
const numIn = (name, v, extra = '') => `<input name="${name}" data-sk78-f="${name}" type="number" inputmode="decimal" value="${esc(v)}" ${extra}>`;

/** Kortet i #/skjold/oppsett/<id>. */
export function ledSetupHtml78(c) {
  const E = edFor(c);
  if (!E) return `<section class="sk76-card sk78-card" data-sk78-setup="${esc(c.id)}" aria-busy="true"><span class="sk76-kick">💡 LYS OVER SKUFFENE</span><p class="sk76-mut">Henter LED-oppsettet …</p></section>`;
  const L = E.L, st = statusText78(L.host ? M.st[c.id] : { ok: false, error: 'Ingen vert satt' }), total = ledTotal78(L);
  const hostBad = !hostOk78(L.host);
  const rows = L.rows.map((r, i) => `<tr>
      <th scope="row">Rad ${r.row}</th>
      <td><input aria-label="${esc(`Rad ${r.row}: første LED`)}" data-sk78-r="${i}:start" type="number" inputmode="numeric" min="0" value="${esc(r.start)}"></td>
      <td><input aria-label="${esc(`Rad ${r.row}: antall LED`)}" data-sk78-r="${i}:count" type="number" inputmode="numeric" min="1" value="${esc(r.count)}"></td>
      <td><label class="sk78-rev"><input type="checkbox" data-sk78-r="${i}:reverse"${r.reverse ? ' checked' : ''}><span>${r.reverse ? '← baklengs' : '→ fremover'}</span></label></td>
      <td><input aria-label="${esc(`Rad ${r.row}: LED-avstand i mm`)}" data-sk78-r="${i}:pitchMm" type="number" inputmode="decimal" step="0.01" min="1" value="${esc(r.pitchMm)}"></td>
      <td><input aria-label="${esc(`Rad ${r.row}: forskyvning i mm`)}" data-sk78-r="${i}:offsetMm" type="number" inputmode="decimal" step="0.5" value="${esc(r.offsetMm)}"></td>
      <td><button type="button" class="sk78-tb" data-sk78-test="row" data-row="${r.row}" aria-label="${esc(`Test rad ${r.row}`)}">Test</button></td>
    </tr>`).join('');
  const ovs = Object.entries(L.overrides).sort(([a], [b]) => a.localeCompare(b, 'nb', { numeric: true }));
  return `<section class="sk76-card sk78-card" data-sk78-setup="${esc(c.id)}" aria-label="Lys over skuffene">
    <div class="sk78-hd"><span class="sk76-kick">💡 LYS OVER SKUFFENE (WLED)</span>
      <span class="sk78-badge ${st.cls}" role="status" title="Status for WLED-kontrolleren"><i aria-hidden="true"></i>${esc(st.text)}</span>
      ${L.host ? '<button type="button" class="sk76-link" data-sk78="status">Sjekk</button>' : ''}</div>
    <p class="sk76-mut sk78-p">En adresserbar LED-stripe over hver skuffrad, styrt av en ESP32 med WLED. Skriv inn adressen i hjemmenettet (f.eks. 192.168.1.50 eller wled-skap.local).</p>
    <form class="sk78-form" data-sk78-form novalidate>
      <label class="sk76-f wide">WLED-vert<input name="host" data-sk78-f="host" value="${esc(L.host)}" placeholder="192.168.1.50" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url"${hostBad ? ' aria-invalid="true"' : ''}>
        <small class="sk78-hint${hostBad ? ' bad' : ''}" data-sk78-hosthint>${hostBad ? 'Bare adresser i hjemmenettet: 10.x, 172.16–31.x, 192.168.x, .local, .lan eller et navn uten punktum.' : 'Flere skap kan dele én kontroller med ulik startindeks.'}</small></label>
      <label class="sk78-sw wide"><input type="checkbox" data-sk78-f="enabled"${L.enabled ? ' checked' : ''}><span><b>Lys i dette skapet</b><small>Viser «💡 Vis i skapet» for deler her</small></span></label>
      <div class="sk78-grid">
        <label class="sk76-f">Farge<input type="color" data-sk78-f="color" value="${esc(L.color.toLowerCase())}"></label>
        <label class="sk76-f">Lyser i (s)${numIn('durationS', L.durationS, 'min="3" max="600" step="1"')}</label>
        <label class="sk76-f">Lysstyrke<input type="range" data-sk78-f="brightness" min="1" max="255" value="${esc(L.brightness)}" aria-valuetext="${Math.round((L.brightness / 255) * 100)} %"></label>
        <label class="sk78-sw"><input type="checkbox" data-sk78-f="blink"${L.blink ? ' checked' : ''}><span><b>Blink</b></span></label>
        <label class="sk76-f">Skuffavstand (mm)${numIn('drawerPitchMm', L.drawerPitchMm, 'min="10" max="400" step="0.5"')}</label>
        <label class="sk76-f">Midt i første skuff (mm)${numIn('firstDrawerXmm', L.firstDrawerXmm, 'min="0" max="2000" step="0.5"')}</label>
      </div>
      <div class="sk78-fill"><span class="sk76-kick">RADER</span>
        <label>LED per rad<input type="number" inputmode="numeric" min="1" max="500" data-sk78-fill="per" value="${esc(E.per || '')}"></label>
        <label class="sk78-rev"><input type="checkbox" data-sk78-fill="serp"${E.serp ? ' checked' : ''}><span>Serpentine (annenhver rad baklengs)</span></label>
        <button type="button" class="sk76-btn" data-sk78="fill">Fyll ut</button>
        <button type="button" class="sk76-link" data-sk78="pitch60">60 LED/m (${PITCH60} mm)</button>
      </div>
      <div class="sk78-tw"><table class="sk78-rows"><thead><tr><th scope="col">Rad</th><th scope="col">Første LED</th><th scope="col">Antall</th><th scope="col">Retning</th><th scope="col">Pitch mm</th><th scope="col">Forskyvn. mm</th><th scope="col"><span class="sk78-sr">Test</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="sk76-mut sk78-p">${esc(`${L.rows.length} rader · ${total} LED-er totalt${M.st[c.id]?.ledCount ? ` · WLED har ${M.st[c.id].ledCount}` : ''}`)}${M.st[c.id]?.ledCount && total > M.st[c.id].ledCount ? ' <b class="sk78-warn">– flere enn stripa har</b>' : ''}</p>
      <div class="sk76-pacts wide">
        <button type="submit" class="sk76-btn pri" data-sk78="save"${E.busy ? ' disabled' : ''}>${E.dirty ? 'Lagre lysoppsett' : 'Lagret'}</button>
        <button type="button" class="sk76-btn" data-sk78-test="all">Test alle</button>
        <span class="sk78-ti"><input type="number" inputmode="numeric" min="0" aria-label="LED-nummer" data-sk78-fill="testIdx" value="${esc(E.testIdx)}"><button type="button" class="sk76-btn" data-sk78-test="index">Test LED</button></span>
        <button type="button" class="sk76-btn" data-sk78="wiz"${M.wiz ? ' aria-pressed="true"' : ''}>Kalibrer …</button>
        ${diagBtn79(c)}
      </div>
    </form>
    ${M.wiz?.cabId === c.id ? wizHtml(c, L) : ''}
    ${diagHtml79(c)}
    ${ovs.length ? `<details class="sk78-ovs"><summary>Overstyrte skuffer (${ovs.length})</summary><ul>${ovs.map(([k, v]) => { const [r, co] = k.split('-').map(Number); return `<li><span><b>${esc(short76(r, co))}</b> ${esc(long76(r, co))}</span><span>LED ${esc(v)}</span><button type="button" class="sk76-link" data-sk78-rmov="${esc(k)}">Fjern</button></li>`; }).join('')}</ul></details>` : ''}
    <div class="sk78-set"><span class="sk76-kick">FOR ALLE SKAP</span>
      ${autoSw('autoLocateOpen', 'Lys opp automatisk når jeg åpner et treff', 'Skuffen lyser når du åpner en del i Skjold Lab')}
      ${autoSw('autoLocateGlimt', 'Glimt lyser opp skuffen', 'Når du spør Glimt «hvor er M3-skruene?», lyser skuffen')}
    </div>
  </section>`;
}

function wizHtml(c, L) {
  const W = M.wiz, cols = Math.max(1, +c.cols || 1), rows = Math.max(1, +c.rows || 1);
  const cells = [];
  for (let r = 1; r <= rows; r++) for (let co = 1; co <= cols; co++) {
    const i = ledIndex78(L, r, co), ov = Number.isInteger(L.overrides[`${r}-${co}`]), hit = i === W.index;
    cells.push(`<button type="button" class="sk78-cell${ov ? ' ov' : ''}${hit ? ' hit' : ''}" data-sk78-cell="${r}-${co}" aria-label="${esc(`${long76(r, co)}, LED ${i ?? '–'}${ov ? ', overstyrt' : ''}`)}"><b>${esc(short76(r, co))}</b><small>${i ?? '–'}</small></button>`);
  }
  return `<div class="sk78-wiz" data-sk78-wiz role="region" aria-label="Kalibrering">
    <div class="sk78-hd"><span class="sk76-kick">KALIBRERING</span><button type="button" class="sk77-x sk78-x" data-sk78="wiz-close" aria-label="Avslutt kalibreringen">×</button></div>
    <p class="sk78-step" aria-live="polite"><span class="sk78-dot" aria-hidden="true"></span><span><b>LED nr. ${esc(W.index)} lyser nå.</b> Trykk på skuffen som lyser.${W.msg ? ` <span class="sk76-mut">${esc(W.msg)}</span>` : ''}</span></p>
    <div class="sk78-nav"><button type="button" class="sk76-btn" data-sk78="wiz-prev"${W.index <= 0 ? ' disabled' : ''}>‹ Forrige LED</button><input type="number" inputmode="numeric" min="0" aria-label="LED-nummer" data-sk78-wizidx value="${esc(W.index)}"><button type="button" class="sk76-btn" data-sk78="wiz-next">Neste LED ›</button></div>
    <div class="sk78-cells" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${cells.join('')}</div>
    <p class="sk76-mut sk78-p">Tallet i hver skuff er LED-en som brukes nå. Trykk på en skuff for å koble den til LED nr. ${esc(W.index)}; neste LED tennes av seg selv. Skuffer uten lys over seg: trykk «Neste LED».</p>
  </div>`;
}

function readField(t) {
  const E = M.ed; if (!E) return false;
  const L = E.L;
  if (t.dataset.sk78F) {
    const k = t.dataset.sk78F;
    if (t.type === 'checkbox') L[k] = t.checked;
    else if (k === 'host' || k === 'color') L[k] = k === 'color' ? t.value.toUpperCase() : t.value.trim();
    else if (t.value !== '') L[k] = +t.value;
    if (k === 'host') {
      const bad = !hostOk78(L.host), h = t.closest('label')?.querySelector('[data-sk78-hosthint]');
      if (bad) t.setAttribute('aria-invalid', 'true'); else t.removeAttribute('aria-invalid');
      if (h) { h.classList.toggle('bad', bad); h.textContent = bad ? 'Bare adresser i hjemmenettet: 10.x, 172.16–31.x, 192.168.x, .local, .lan eller et navn uten punktum.' : 'Flere skap kan dele én kontroller med ulik startindeks.'; }
    }
    if (k === 'brightness') t.setAttribute('aria-valuetext', `${Math.round((+t.value / 255) * 100)} %`);
  } else if (t.dataset.sk78R) {
    const [i, k] = t.dataset.sk78R.split(':'), r = L.rows[+i]; if (!r) return true;
    if (k === 'reverse') { r.reverse = t.checked; const s = t.nextElementSibling; if (s) s.textContent = r.reverse ? '← baklengs' : '→ fremover'; } else if (t.value !== '') r[k] = +t.value;
  } else if (t.dataset.sk78Fill) {
    const k = t.dataset.sk78Fill;
    if (k === 'serp') E.serp = t.checked; else E[k] = +t.value || 0;
    return true;
  } else return false;
  E.dirty = true;
  const sv = document.querySelector('#sk76 [data-sk78="save"]'); if (sv) sv.textContent = 'Lagre lysoppsett';
  return true;
}
/** Input i Skjold Lab (fra bind). true = håndtert. */
export function input78(t) {
  if (t.matches?.('[data-sk78-set]')) return true; // håndteres i click
  if (t.matches?.('[data-sk78-wizidx]')) { if (M.wiz && t.value !== '') { M.wiz.index = Math.max(0, +t.value | 0); calib(); } return true; }
  if (!t.closest?.('[data-sk78-setup]')) return false;
  return readField(t);
}

async function saveLeds() {
  const E = M.ed, c = cabById(E?.cabId); if (!E || !c) return false;
  if (!hostOk78(E.L.host)) { toast('Verten må være i hjemmenettet (f.eks. 192.168.1.50 eller wled.local).'); return false; }
  if (E.L.enabled && !E.L.host) { toast('Skriv inn adressen til WLED-kontrolleren først.'); return false; }
  E.busy = true; repaintSetup();
  try {
    const r = await sk(`/cabinets/${enc(c.id)}/leds`, { method: 'PUT', json: ledsBody78(E.L) });
    const got = r?.leds ?? r;
    M.cfg[c.id] = normLeds78(got && typeof got === 'object' && Array.isArray(got.rows) ? got : ledsBody78(E.L), c);
    E.L = JSON.parse(JSON.stringify(M.cfg[c.id])); E.dirty = false;
    toast('Lysoppsettet er lagret');
    if (E.L.host) loadStatus78(c.id);
    return true;
  } catch (e) { toast(errText(e)); return false; } finally { E.busy = false; repaintSetup(); }
}
async function test(mode, extra = {}) {
  const c = cabById(M.ed?.cabId); if (!c) return;
  if (M.ed.dirty && !(await saveLeds())) return;
  if (!M.ed.L.host) { toast('Skriv inn adressen til WLED-kontrolleren først.'); return; }
  try { await sk(`/cabinets/${enc(c.id)}/leds/test`, { method: 'POST', json: { mode, ...extra } }); toast(mode === 'all' ? 'Hele stripa lyser i 5 s' : mode === 'row' ? `Rad ${extra.row} lyser i 5 s` : `LED ${extra.index} lyser i 5 s`); } catch (e) { toast(errText(e)); }
}

/* Kalibrering: én LED om gangen. Raske klikk samles (serveren tåler 5 kall i sekundet). */
let calT = 0, calSeq = 0;
function calib() {
  const W = M.wiz; if (!W) return;
  clearTimeout(calT);
  calT = setTimeout(async () => {
    const seq = ++calSeq, c = cabById(W.cabId); if (!c || M.wiz !== W) return;
    try { await sk(`/cabinets/${enc(c.id)}/leds/calibrate`, { method: 'POST', json: { index: W.index } }); if (seq === calSeq) W.msg = ''; } catch (e) { if (seq === calSeq) W.msg = errText(e); }
    if (M.wiz === W && seq === calSeq) repaintSetup();
  }, 220);
  repaintSetup();
}
async function startWiz() {
  const E = M.ed, c = cabById(E?.cabId); if (!c) return;
  if (E.dirty && !(await saveLeds())) return;
  if (!E.L.host) { toast('Skriv inn adressen til WLED-kontrolleren først.'); return; }
  M.wiz = { cabId: c.id, index: E.L.rows[0]?.start ?? 0, msg: '' };
  calib();
  requestAnimationFrame(() => document.querySelector('#sk76 [data-sk78-wiz]')?.scrollIntoView?.({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
}
async function stopWiz() {
  M.wiz = null; clearTimeout(calT); repaintSetup();
  try { await sk('/locate/off', { method: 'POST', json: {} }); } catch { /* lyset slukker av seg selv */ }
}
async function setOverride(key, index) {
  const c = cabById(M.ed?.cabId); if (!c) return false;
  const [row, col] = key.split('-').map(Number);
  try {
    const r = await sk(`/cabinets/${enc(c.id)}/leds/override`, { method: 'PUT', json: { row, col, index } });
    const L = M.cfg[c.id] ?? M.ed.L, ov = r?.leds?.overrides ?? r?.overrides;
    if (ov && typeof ov === 'object') { L.overrides = normLeds78({ overrides: ov }, { rows: 0 }).overrides; } else if (index == null) delete L.overrides[key]; else L.overrides[key] = index;
    M.ed.L.overrides = { ...L.overrides };
    return true;
  } catch (e) { toast(errText(e)); return false; }
}

/* ================= Hendelser ================= */

/** Klikk i Skjold Lab (fra bind i skjold76.js). true = håndtert. */
export function click78(t) {
  const sw = t.closest('[data-sk78-set]');
  if (sw) { saveSet78({ [sw.dataset.sk78Set]: sw.checked }); document.querySelectorAll(`#sk76 [data-sk78-set="${sw.dataset.sk78Set}"]`).forEach((x) => { x.checked = sw.checked; }); return true; }
  const lb = t.closest('[data-sk78-loc]');
  if (lb) { locate78({ partId: lb.dataset.sk78Loc }); return true; }
  const cell = t.closest('[data-sk78-cell]');
  if (cell && M.wiz) {
    const W = M.wiz, key = cell.dataset.sk78Cell;
    setOverride(key, W.index).then((ok) => { if (ok && M.wiz === W) { W.msg = `${long76(...key.split('-').map(Number))} → LED ${W.index}`; W.index += 1; calib(); } });
    return true;
  }
  const rm = t.closest('[data-sk78-rmov]');
  if (rm) { setOverride(rm.dataset.sk78Rmov, null).then((ok) => ok && repaintSetup()); return true; }
  const tb = t.closest('[data-sk78-test]');
  if (tb) {
    const m = tb.dataset.sk78Test;
    if (m === 'row') test('row', { row: +tb.dataset.row });
    else if (m === 'index') test('index', { index: Math.max(0, +M.ed?.testIdx || 0) });
    else test('all');
    return true;
  }
  const b = t.closest('[data-sk78]'); if (!b) return false;
  switch (b.dataset.sk78) {
    case 'locate': { const p = S.parts[S.route.id]; if (p) locate78({ partId: p.id }); return true; }
    case 'locate-all': { const ids = listIds(); if (ids.length) locate78({ partIds: ids }); return true; }
    case 'off': off78(); return true;
    case 'status': if (M.ed) loadStatus78(M.ed.cabId); return true;
    case 'fill': {
      const E = M.ed; if (!E) return true;
      const per = E.per || E.L.rows[0]?.count || 1;
      E.L.rows = autoRows78(E.L.rows, { perRow: per, serpentine: E.serp, first: E.L.rows[0]?.start ?? 0 }); E.dirty = true; repaintSetup(); return true;
    }
    case 'pitch60': { const E = M.ed; if (!E) return true; E.L.rows = E.L.rows.map((r) => ({ ...r, pitchMm: PITCH60 })); E.dirty = true; repaintSetup(); return true; }
    case 'save': return false; // submit
    case 'wiz': if (M.wiz) stopWiz(); else startWiz(); return true;
    case 'wiz-close': stopWiz(); return true;
    case 'wiz-prev': if (M.wiz && M.wiz.index > 0) { M.wiz.index -= 1; M.wiz.msg = ''; calib(); } return true;
    case 'wiz-next': if (M.wiz) { M.wiz.index += 1; M.wiz.msg = ''; calib(); } return true;
    default: return false;
  }
}
/** Submit i Skjold Lab (fra bind). true = håndtert. */
export function submit78(e) {
  if (!e.target.matches?.('[data-sk78-form]')) return false;
  e.preventDefault(); saveLeds(); return true;
}
/** Ruten endres: glem skjemaet og veiviseren når man forlater skap-oppsettet. */
export function route78(r) {
  if (r.v !== 'setup' || (M.ed && String(r.id) !== String(M.ed.cabId))) { if (M.wiz) stopWiz(); M.ed = null; }
  paintLit();
}

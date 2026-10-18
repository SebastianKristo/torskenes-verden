// Sporing: pakker fra Finn-handler, e-post og manuelt innlimte nummer. Data og status kommer fra /api/tracking.
import { api, esc, hm } from './util.js';
import { openSettings } from './settings.js';
import { is2c } from './hltheme.js';
import { onLive } from './realtime.js';

const T = (p, o) => api('/tracking' + p, o);
const SEGS = ['Aktive', 'Klar for henting', 'Utgående', 'Levert', 'Arkiv'];
// Vindu og papir har flere faner (som i «Homelab Papir Web»).
const SEGS_2C = ['Aktive', 'Klar for henting', 'På vei', 'Registrert', 'Levert', 'Arkiv', 'Alle'];
const segs = () => (is2c() ? SEGS_2C : SEGS);
// Hva hver transportør trenger. 17TRACK er reserven for alle uten egen klient.
const KEYS = [['posten', 'Posten og Bring', 'API-nøkkel fra Mybring (bruker-ID og nøkkel)'], ['postnord', 'PostNord', 'API-nøkkel fra PostNord Developer'], ['dhl', 'DHL', 'DHL Shipment Tracking API (Unified)'],
  ['ups', 'UPS', 'OAuth-klient fra UPS Developer'], ['other', '17TRACK', 'Reserve for FedEx, GLS, DB Schenker, Helthjem, Budbee, Instabox og andre']];
const S = { d: null, err: '', seg: 'Aktive', open: null, delArm: null, sel: new Set(), bulkArm: false, no: '', name: '', guess: null, pick: null, busy: false, adding: false, toast: '' };
let toastT = null, detT = null, pollT = null, unLive = null;

const hap = (k) => { try { if (localStorage.getItem('hl_track_hap') !== '0' && navigator.vibrate) navigator.vibrate(k === 'err' ? [20, 50, 20] : [10, 40, 16]); } catch { /* ingen vibrasjon */ } };
function flash(t, err = false) {
  hap(err ? 'err' : 'ok');
  S.toast = t; paintToast();
  clearTimeout(toastT); toastT = setTimeout(() => { S.toast = ''; paintToast(); }, 2600);
}
const host = () => document.getElementById('trk-os');

/* ---------- Formatering ---------- */
const dm = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
const isoDate = (s) => /^\d{4}-\d{2}-\d{2}/.test(s ?? '') ? new Date(s.slice(0, 10) + 'T12:00') : null;
const evTime = (ts) => { const d = new Date(ts); return `${dm(d)} ${hm(d)}`; };
const isDone = (t) => t.archived || t.status === 'delivered';
const isPick = (t) => !isDone(t) && t.status === 'ready_for_pickup' && t.direction !== 'out';
function etaText(t) {
  const d = isoDate(t.eta), txt = d ? dm(d) : t.eta;
  if (t.status === 'delivered') { const last = t.events.find((e) => /levert/i.test(e.status)) ?? t.events[0]; return last ? `Levert ${dm(new Date(last.ts))}` : 'Levert'; }
  if (t.status === 'ready_for_pickup') return [t.pickupPoint, txt && `hent innen ${txt}`].filter(Boolean).join(' · ') || 'Klar for henting';
  if (t.direction === 'out' && t.step === 0) return txt ? `Lever pakken innen ${txt}` : 'Lever pakken hos utleveringsstedet';
  if (t.status === 'delayed') return txt ? `Var ventet ${txt}` : 'Forsinket';
  return txt ? `Ventet ${txt}` : 'Ingen leveringsdato ennå';
}
const SRC = { finn: ['Finn', 'rgba(122,167,255,.16)', '#a9c3ff'], email: ['E-post', 'rgba(255,154,92,.16)', '#ffb08a'], manual: ['Manuelt', 'rgba(255,255,255,.1)', '#c4cad6'] };
// Transportørlogo på hvit bakgrunn; mangler logoen, vises initialene i transportørens farge.
const badge = (c, fg, ini, cls = '', logo = '') => `<span class="trk-ini ${cls}" style="background:${esc(c)};color:${esc(fg)}">${esc(ini)}${logo ? `<img class="trk-logo" src="${esc(logo)}" alt="" loading="lazy">` : ''}</span>`;
const sw = (on) => `<span class="trk-sw${on ? ' on' : ''}"><i></i></span>`;

/* ---------- Visning ---------- */
function card(t) {
  const fin = t.status === 'delivered', ready = isPick(t), open = S.open === t.id, [src, sbg, sfg] = SRC[t.source] ?? SRC.manual;
  const stC = ready ? '#ffb08a' : fin ? 'var(--green)' : t.delayed ? 'var(--yellow)' : 'var(--text)';
  const steps = t.steps.map((n, j) => {
    const dn = j <= t.step, cur = j === t.step && !fin;
    const label = j === 3 && t.direction !== 'out' ? (t.status === 'out_for_delivery' ? 'Ute' : 'Hentested') : n;
    return `<span class="trk-step${dn ? ' dn' : ''}${cur ? ' cur' : ''}${j < t.step ? ' ln' : ''}${fin ? ' fin' : ''}"><span><i></i><em></em></span><small>${esc(label)}</small></span>`;
  }).join('');
  const ev = t.events[0];
  const tl = t.events.map((e, j) => `<div class="trk-ev${j ? '' : ' now'}"><div class="trk-ev-l"><i></i><em></em></div><div class="trk-ev-b"><div><b>${esc(e.status)}</b><span>${esc(evTime(e.ts))}</span></div>${e.location ? `<small>${esc(e.location)}</small>` : ''}</div></div>`).join('');
  return `<div class="trk-card${ready ? ' ready' : ''}${S.sel.has(t.id) ? ' picked' : ''}">
    <button class="trk-head" data-trk-open="${t.id}" aria-expanded="${open}">
      <span class="trk-row"><span class="trk-selb${S.sel.has(t.id) ? ' on' : ''}" data-trk-selb="${t.id}" role="checkbox" aria-checked="${S.sel.has(t.id)}" title="Velg for arkivering eller sletting">${badge(t.carrierColor, t.carrierFg, t.carrierIni, 'lg', t.carrierLogo)}<i>✓</i></span><span class="trk-tt"><b>${esc(t.name)}</b><small>${esc(t.carrierName)} · <span class="trk-mono">${esc(t.trackingNo)}</span></small></span>
        <span class="trk-src" style="background:${sbg};color:${sfg}">${esc(src)}</span></span>
      <span class="trk-st"><span><b style="color:${stC}">${esc(t.statusText)}</b><small>${esc(etaText(t))}</small></span>${t.direction === 'out' ? '<em>Utgående</em>' : ''}</span>
      <span class="trk-steps">${steps}</span>
      <span class="trk-last">${ev ? `${esc(ev.status)}${ev.location ? ' · ' + esc(ev.location) : ''} <span>· ${esc(evTime(ev.ts))}</span>` : 'Ingen hendelser ennå'}</span>
    </button>
    ${open ? `<div class="trk-more">
      ${tl ? `<div class="trk-tl">${tl}</div>` : ''}
      ${t.sourceNote ? `<span class="trk-note">✦ ${esc(t.sourceNote)}</span>` : ''}
      ${t.lastError ? `<span class="trk-note warn">${esc(t.lastError)}</span>` : ''}
      <div class="trk-acts">
        <a class="trk-btn" href="${esc(t.url)}" target="_blank" rel="noopener">Åpne hos ${esc(t.carrierName.replace(/ \(17TRACK\)$/, ''))} ↗</a>
        <button class="trk-btn" data-trk-arch="${t.id}">${t.archived ? 'Flytt tilbake' : 'Arkiver'}</button>
        <button class="trk-btn del" data-trk-del="${t.id}">${S.delArm === t.id ? 'Bekreft sletting' : 'Slett'}</button>
      </div></div>` : ''}
  </div>`;
}

function addHint() {
  const d = S.d, no = S.no.replace(/\s+/g, '').toUpperCase();
  if (!no || !d) return '';
  const car = S.pick ?? S.guess ?? 'other', name = d.carriers.find((c) => c.id === car)?.name ?? car;
  const hint = car === 'other' ? 'Fant ikke transportøren ut fra nummeret. Velg, eller la 17TRACK finne den.' : `✦ Ser ut som ${name}${S.pick ? ' (valgt av deg)' : ' ut fra formatet'}. Trykk for å endre.`;
  return `<span class="trk-hint">${esc(hint)}</span><div class="trk-chips">${d.carriers.map((c) => `<button class="trk-chip${c.id === car ? ' on' : ''}" data-trk-pick="${c.id}">${badge(c.color, c.fg, c.ini, 'sm', c.logo)}${esc(c.name)}</button>`).join('')}</div>`;
}

function lists() {
  const items = S.d?.items ?? [];
  const act = items.filter((t) => !isDone(t));
  return { act, Aktive: act, 'Klar for henting': act.filter(isPick), Utgående: act.filter((t) => t.direction === 'out'), Levert: items.filter((t) => !t.archived && t.status === 'delivered'), Arkiv: items.filter((t) => t.archived),
    'På vei': act.filter((t) => !isPick(t) && (t.step ?? 0) > 0), Registrert: act.filter((t) => !isPick(t) && !(t.step > 0)), Alle: items };
}

// Vindu og papir: faner og sporingsfelt på én linje, kort i rutenett, og «Varsler og kilder» og transportører i spalter under.
function body2c() {
  const d = S.d, L = lists(), seg = L[S.seg] ?? L.Aktive;
  const rank = (t) => (isPick(t) ? 0 : t.status === 'out_for_delivery' ? 1 : isDone(t) ? 3 : 2);
  const shown = shownOf();
  const tabs = SEGS_2C.map((n) => `<button role="tab" aria-selected="${S.seg === n}" class="${S.seg === n ? 'on' : ''}" data-trk-seg="${esc(n)}">${esc(n)} <span>${L[n].length}</span></button>`).join('');
  const src = (k) => d.sources?.[k]?.on !== false && (k !== 'autoArchive' || d.sources?.[k]?.on === true);
  const nF = d.items.filter((t) => t.source === 'finn').length, nM = d.items.filter((t) => t.source === 'email').length;
  const kilder = [['email', 'Kilde: e-post (Proton)', `${nM} funnet i innboksen`], ['finn', 'Kilde: Finn-handler', `${nF} fra handler`], ['autoArchive', 'Arkiver leverte automatisk', 'Leverte pakker flyttes til arkivet']]
    .map(([k, n, sub]) => [`data-trk-src="${k}"`, n, sub, src(k)]);
  const rows = kilder
    .map(([a, n, sub, on]) => `<button class="trk-tog" ${a} aria-pressed="${on}"><span><b>${esc(n)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${sw(on)}</button>`).join('') + notifyLink();
  const conf = (id) => d.carriers.find((c) => c.id === id) ?? {};
  const conns = KEYS.map(([id, n, sub]) => { const c = conf(id); return `<div class="trk-conn">${badge(c.color, c.fg, c.ini, 'md', c.logo)}<span><b>${esc(n)}</b><small>${esc(sub)}</small></span><em class="${c.configured ? 'ok' : 'miss'}">${c.configured ? 'Tilkoblet' : 'Mangler nøkkel'}</em></div>`; }).join('');
  const last = d.lastRun ? `Sist sjekket ${hm(new Date(d.lastRun))}` : 'Ikke sjekket ennå';
  return `<div class="p-trk-bar"><div class="p-trk-tabs" role="tablist">${tabs}</div>
      <div class="p-trk-add"><input name="trk-no" value="${esc(S.no)}" placeholder="Legg til sporingsnummer" autocomplete="off" spellcheck="false" aria-label="Sporingsnummer"><button class="trk-go" data-trk-add ${S.adding ? 'disabled' : ''}>${S.adding ? 'Sporer …' : 'Spor'}</button></div></div>
    <div class="trk-guess">${addHint()}</div>
    ${selBar(shown)}${shown.length ? `<div class="trk-grid">${shown.map(card).join('')}</div>` : '<div class="trk-empty">Ingen pakker her.</div>'}
    <div class="p-trk-cols">
      <div class="trk-panel"><div class="trk-ph"><b>KILDER</b><small>${esc(last)} · <button class="trk-link" data-trk-check ${S.busy ? 'disabled' : ''}>${S.busy ? 'Sjekker …' : 'Sjekk nå'}</button></small></div>${rows}</div>
      <div class="trk-panel"><div class="trk-ph"><b>TRANSPORTØRER</b><button class="trk-link" data-trk-keys>Nøkler i Innstillinger ›</button></div>${conns}</div>
    </div>`;
}

// Valgte pakker (klikk på ikonet): meny for å velge alle, arkivere/gjenopprette og slette (to trykk).
function selBar(shown) {
  if (!S.sel.size) return '';
  const inArk = S.seg === 'Arkiv', all = shown.length && shown.every((t) => S.sel.has(t.id));
  return `<div class="trk-selbar" role="toolbar" aria-label="Valgte pakker"><b>${S.sel.size} valgt</b>
    <button class="trk-btn" data-trk-bulk="all">${all ? 'Fjern valg' : 'Velg alle'}</button>
    <button class="trk-btn" data-trk-bulk="${inArk ? 'unarchive' : 'archive'}">${inArk ? 'Gjenopprett' : 'Arkiver'}</button>
    <button class="trk-btn del" data-trk-bulk="delete">${S.bulkArm ? `Bekreft: slett ${S.sel.size}` : 'Slett'}</button>
    <button class="trk-link" data-trk-bulk="none">Avbryt</button></div>`;
}
const shownOf = () => {
  const L = lists(), seg = L[S.seg] ?? L.Aktive;
  const rank = (t) => (isPick(t) ? 0 : t.status === 'out_for_delivery' ? 1 : isDone(t) ? 3 : 2);
  return S.seg === 'Levert' || S.seg === 'Arkiv' ? seg : [...seg].sort((a, b) => rank(a) - rank(b) || b.step - a.step);
};

function body() {
  if (!S.d) return S.err ? `<div class="trk-empty">${esc(S.err)}</div>` : '<div class="trk-empty">Henter sendinger …</div>';
  if (is2c()) return body2c();
  const d = S.d, L = lists(), seg = L[S.seg] ?? L.Aktive;
  const rank = (t) => (isPick(t) ? 0 : t.status === 'out_for_delivery' ? 1 : 2);
  const shown = shownOf();
  const nF = d.items.filter((t) => t.source === 'finn').length, nM = d.items.filter((t) => t.source === 'email').length;
  const srcs = [['finn', `✦ Finn · ${nF} fra handler`], ['email', `✦ E-post · ${nM} funnet i innboksen`]].map(([k, n]) => {
    const on = d.sources[k]?.on !== false;
    return `<button class="trk-srcb${on ? ' on' : ''}" data-trk-src="${k}" aria-pressed="${on}" title="${on ? 'Slå av' : 'Slå på'} henting fra ${k === 'finn' ? 'Finn' : 'e-post'}"><i></i>${esc(n)}</button>`;
  }).join('');
  const last = d.lastRun ? `Sist sjekket ${hm(new Date(d.lastRun))}` : 'Ikke sjekket ennå';
  const conf = (id) => d.carriers.find((c) => c.id === id) ?? {};
  const conns = KEYS.map(([id, n, s]) => { const c = conf(id); return `<div class="trk-conn">${badge(c.color, c.fg, c.ini, 'md', c.logo)}<span><b>${esc(n)}</b><small>${esc(s)}</small></span><em class="${c.configured ? 'ok' : 'miss'}">${c.configured ? 'Tilkoblet' : 'Mangler nøkkel'}</em></div>`; }).join('');
  return `
  <div class="trk-box">
    <div class="trk-add">
      <input name="trk-no" value="${esc(S.no)}" placeholder="Lim inn sporingsnummer" autocomplete="off" spellcheck="false" aria-label="Sporingsnummer">
      <input name="trk-name" value="${esc(S.name)}" placeholder="Navn (valgfritt)" autocomplete="off" aria-label="Navn">
      <button class="trk-go" data-trk-add ${S.adding ? 'disabled' : ''}>${S.adding ? 'Sporer …' : 'Spor'}</button>
    </div>
    <div class="trk-guess">${addHint()}</div>
    <div class="trk-srcs">${srcs}<span class="trk-sp"></span><span class="trk-sync">${esc(last)}</span><button class="trk-btn" data-trk-check ${S.busy ? 'disabled' : ''}>${S.busy ? 'Sjekker …' : 'Sjekk nå'}</button></div>
  </div>
  <div class="trk-segs" role="tablist">${segs().map((n) => `<button role="tab" aria-selected="${S.seg === n}" class="${S.seg === n ? 'on' : ''}" data-trk-seg="${esc(n)}">${esc(n)} ${L[n].length}</button>`).join('')}</div>
  ${selBar(shown)}${shown.length ? `<div class="trk-grid">${shown.map(card).join('')}</div>` : '<div class="trk-empty">Ingen sendinger her.</div>'}
  <div class="trk-side">
    <div class="trk-panel"><div class="trk-ph"><b>Varsler</b><small>Samlet under Innstillinger → Varsler</small></div>${notifyLink()}</div>
    <div class="trk-panel"><div class="trk-ph"><b>Transportører</b><button class="trk-link" data-trk-keys>Nøkler i Innstillinger → Integrasjoner ›</button></div>${conns}</div>
  </div>`;
}

// Pakkevarsler (og lyd, stille timer og haptikk) ligger nå i Innstillinger → Varsler.
const notifyLink = () => `<button class="trk-tog" data-trk-notify><span><b>Varsler for pakker</b><small>Ny pakke, klar for henting, ute for levering, forsinket og levert</small></span><span class="trk-link">Innstillinger ›</span></button>`;

function summary() {
  if (!S.d) return '';
  const L = lists();
  return `${L.act.length} på vei · ${L['Klar for henting'].length} klar for henting · ${L.Levert.length} levert`;
}

function paint() {
  const h = host();
  if (!h) return;
  const a = document.activeElement, keep = a?.name && h.contains(a) ? { n: a.name, s: a.selectionStart } : null;
  document.getElementById('trk-sum').textContent = summary();
  h.innerHTML = body();
  // Mangler logoen (eldre server eller nettfeil), vises bokstav-merket under.
  h.querySelectorAll('.trk-logo').forEach((i) => { i.addEventListener('error', () => i.remove(), { once: true }); });
  if (keep) { const el = h.querySelector(`[name="${keep.n}"]`); el?.focus(); try { el?.setSelectionRange(keep.s, keep.s); } catch { /* ikke tekstfelt */ } }
}
function paintGuess() { const g = host()?.querySelector('.trk-guess'); if (g) g.innerHTML = addHint(); }
function paintToast() {
  const t = document.getElementById('trk-toast');
  if (!t) return;
  t.hidden = !S.toast; t.textContent = S.toast;
}

/* ---------- Data ---------- */
async function load() {
  try {
    // Arkivet hentes for seg (?archived=1) og legges til; eldre servere gir alt i ett kall.
    const [d, ark] = await Promise.all([T(''), T('?archived=1').catch(() => null)]);
    if (ark?.items) { const seen = new Set(d.items.map((t) => t.id)); d.items = [...d.items, ...ark.items.filter((t) => !seen.has(t.id))]; }
    S.d = d; S.err = '';
  } catch (e) { S.err = e.message; }
  if (S.d) { const ids = new Set(S.d.items.map((t) => t.id)); for (const id of S.sel) if (!ids.has(id)) S.sel.delete(id); }
  paint();
}

export function render() {
  setTimeout(() => {
    load();
    // Holder siden fersk mens den er åpen; serveren poller transportørene selv.
    unLive?.();
    unLive = onLive('tracking', () => { if (!host()) { unLive?.(); unLive = null; return; } if (!S.busy && !S.adding && !S.sel.size) load(); });
    clearInterval(pollT);
    pollT = setInterval(() => { if (!host()) { unLive?.(); unLive = null; return clearInterval(pollT); } if (!document.hidden && !S.busy && !S.adding) load(); }, 60_000);
  });
  return `<div class="trk-top"><div class="os-title">Spor<b>ing</b></div><div id="trk-sum" class="trk-sumtxt">${esc(summary())}</div></div>
    <div id="trk-os" class="trk">${body()}</div><div id="trk-toast" class="trk-toast" role="status" aria-live="polite" hidden></div>`;
}

async function add() {
  const no = S.no.replace(/\s+/g, '').toUpperCase();
  if (no.length < 6) return flash('Skriv inn et sporingsnummer', true);
  if (S.d?.items.some((t) => t.trackingNo === no)) return flash('Sendingen spores allerede', true);
  S.adding = true; paint();
  try {
    const r = await T('', { method: 'POST', json: { trackingNo: no, name: S.name.trim(), carrier: S.pick ?? undefined } });
    Object.assign(S, { no: '', name: '', pick: null, guess: null, seg: 'Aktive', open: r.item.id });
    flash(r.message);
    await load();
  } catch (e) { flash(e.message, true); }
  S.adding = false; paint();
}

async function check() {
  S.busy = true; paint();
  try { const r = await T('/check', { method: 'POST' }); S.d = r; flash(r.message); } catch (e) { flash(e.message, true); }
  S.busy = false; paint();
}

// Flere på en gang: POST /tracking/bulk. På en eldre server uten bulk gjøres det én og én.
async function bulk(action) {
  if (action === 'none') { S.sel.clear(); S.bulkArm = false; return paint(); }
  if (action === 'all') {
    const shown = shownOf(), all = shown.every((t) => S.sel.has(t.id));
    if (all) S.sel.clear(); else shown.forEach((t) => S.sel.add(t.id));
    S.bulkArm = false; return paint();
  }
  if (action === 'delete' && !S.bulkArm) { S.bulkArm = true; return paint(); }
  const ids = [...S.sel], n = ids.length;
  try {
    try { await T('/bulk', { method: 'POST', json: { ids, action } }); }
    catch (err) {
      if (!/404|Not Found|finnes ikke/i.test(err.message)) throw err;
      for (const id of ids) await T(`/${id}`, action === 'delete' ? { method: 'DELETE' } : { method: 'PATCH', json: { archived: action === 'archive' } });
    }
    flash(`${n} ${n === 1 ? 'pakke' : 'pakker'} ${action === 'delete' ? 'slettet' : action === 'archive' ? 'arkivert' : 'gjenopprettet'}`);
  } catch (err) { flash(err.message, true); }
  S.sel.clear(); S.bulkArm = false;
  await load();
}

export function bind(view) {
  view.addEventListener('input', (e) => {
    if (!e.target.closest('#trk-os')) return;
    if (e.target.name === 'trk-name') { S.name = e.target.value; return; }
    if (e.target.name !== 'trk-no') return;
    S.no = e.target.value; S.pick = null;
    const no = S.no.replace(/\s+/g, '');
    clearTimeout(detT);
    if (!no) { S.guess = null; return paintGuess(); }
    detT = setTimeout(async () => {
      try { S.guess = (await T('/detect?no=' + encodeURIComponent(no))).carrier; } catch { S.guess = 'other'; }
      paintGuess();
    }, 180);
  });
  view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest?.('.trk-add input')) { e.preventDefault(); add(); } });
  view.addEventListener('click', async (e) => {
    if (!e.target.closest('#trk-os')) return;
    const el = (s) => e.target.closest(s);
    if (el('[data-trk-add]')) return add();
    if (el('[data-trk-check]')) return check();
    if (el('[data-trk-keys]')) return openSettings('int', 'cfg:Sporing');
    if (el('[data-trk-notify]')) return openSettings('varsel');
    let b;
    if ((b = el('[data-trk-selb]'))) {
      e.preventDefault(); e.stopPropagation();
      const id = +b.dataset.trkSelb;
      if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      S.bulkArm = false; return paint();
    }
    if ((b = el('[data-trk-bulk]'))) return bulk(b.dataset.trkBulk);
    if ((b = el('[data-trk-pick]'))) { S.pick = b.dataset.trkPick; return paintGuess(); }
    if ((b = el('[data-trk-seg]'))) { Object.assign(S, { seg: b.dataset.trkSeg, open: null, delArm: null, bulkArm: false }); S.sel.clear(); return paint(); }
    if ((b = el('[data-trk-open]'))) { const id = +b.dataset.trkOpen; Object.assign(S, { open: S.open === id ? null : id, delArm: null }); return paint(); }
    if ((b = el('[data-trk-src]'))) {
      const k = b.dataset.trkSrc, on = k === 'autoArchive' ? S.d.sources[k]?.on !== true : S.d.sources[k]?.on === false;
      try { S.d.sources = (await T('/sources', { method: 'PUT', json: { [k]: on } })).sources; flash(k === 'autoArchive' ? `Automatisk arkivering er ${on ? 'slått på' : 'slått av'}` : `${k === 'finn' ? 'Finn' : 'E-post'} er ${on ? 'slått på' : 'slått av'} som kilde`); } catch (err) { flash(err.message, true); }
      return paint();
    }
    if ((b = el('[data-trk-tog]'))) {
      const k = b.dataset.trkTog;
      if (k === 'hap') { try { localStorage.setItem('hl_track_hap', localStorage.getItem('hl_track_hap') === '0' ? '1' : '0'); } catch { /* privat modus */ } return paint(); }
      try { S.d.prefs = (await T('/prefs', { method: 'PUT', json: { [k]: !S.d.prefs[k] } })).prefs; } catch (err) { flash(err.message, true); }
      return paint();
    }
    const item = (id) => S.d.items.find((t) => t.id === +id);
    if ((b = el('[data-trk-arch]'))) {
      const t = item(b.dataset.trkArch);
      try {
        const r = await T(`/${t.id}`, { method: 'PATCH', json: { archived: !t.archived } });
        S.d.items = S.d.items.map((x) => (x.id === t.id ? r.item : x));
        flash(r.item.archived ? `${t.name} er arkivert` : `${t.name} er aktiv igjen`);
      } catch (err) { flash(err.message, true); }
      return paint();
    }
    if ((b = el('[data-trk-del]'))) {
      const t = item(b.dataset.trkDel);
      if (S.delArm !== t.id) { S.delArm = t.id; return paint(); }
      try { await T(`/${t.id}`, { method: 'DELETE' }); S.d.items = S.d.items.filter((x) => x.id !== t.id); Object.assign(S, { delArm: null, open: null }); flash(`${t.name} er slettet`); } catch (err) { flash(err.message, true); }
      return paint();
    }
  });
}

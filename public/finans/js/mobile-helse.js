// Prompt 45 (PWA45) del 2: Innstillinger → Helse → Home Assistant (claude-code-helse-ha-opprydding.md, fasit
// design/Helse Home Assistant.dc.html). Bare enheter fra integrasjonen mobile_app, Telefoner · Alle mobilapp, gruppert per person
// («IKKE KOBLET» sist), personvelger (bunnark «Hvem bruker telefonen?»), sensorer som chips og fast «Lagre».
// API: GET /api/family/health/ha?view=phones|all, PUT /api/family/health/ha {devices:[{id, personId, sensors}]} (bare admin).
// Lastes fra mobile-p45.js (globalThis.P45H).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const HH = { view: 'phones', d: {}, t: {}, busy: false, own: {}, off: {}, sheet: null, saved: false, saving: false, err: {} };
const SENS_N = { steps: 'Skritt', heart_rate: 'Puls', resting_heart_rate: 'Hvilepuls', sleep_duration: 'Søvn', active_calories_burned: 'Kalorier', total_calories_burned: 'Kalorier totalt', distance: 'Distanse', floors_climbed: 'Etasjer', floors_ascended: 'Etasjer', floors_descended: 'Etasjer ned', oxygen_saturation: 'Oksygen', activity: 'Aktivitet', weight: 'Vekt', vo2_max: 'VO2 maks' };
const AVC = ['#b23a2a', '#6f5ad6', '#2b5d8a', '#2f6b45', '#a0671a', '#c2477a'];
const colOf = (p, i) => p?.color ?? AVC[i % AVC.length];
const isAdmin = () => m.me?.role === 'admin' || m.me?.isMainAdmin === true;
const nb = (n) => String(n ?? '').trim();
const on = () => m.screen === 'set' && m.sub === 'helseha';

async function haLoad(force = false) {
  const v = HH.view;
  if (HH.busy || (!force && HH.t[v] && Date.now() - HH.t[v] < 30000)) return;
  HH.busy = true;
  try { HH.d[v] = await hlApi(`/family/health/ha?view=${v}`); HH.err[v] = ''; }
  catch (e) { HH.err[v] = e.status === 404 ? 'Krever en nyere Homelab-server' : e.status === 403 ? 'Bare administratorer kan koble telefoner til personer.' : e.message; HH.d[v] ??= null; }
  HH.busy = false; HH.t[v] = Date.now();
  if (on()) draw();
}
const persons = (D) => D?.persons ?? D?.people ?? [];
const pOf = (D, id) => { const P = persons(D), i = P.findIndex((p) => String(p.id) === String(id)); return i < 0 ? null : { ...P[i], c: colOf(P[i], i) }; };
const ownOf = (d) => (d.id in HH.own ? HH.own[d.id] : d.personId ?? null);
const isTab = (d) => d.kind === 'tablet' || d.platform === 'ipad' || /ipad|tab/i.test(`${d.model ?? ''} ${d.name ?? ''}`);
const osOf = (d) => d.os ?? (d.platform === 'android' ? 'Android' : d.platform === 'ios' ? 'iPhone' : isTab(d) ? 'iPad' : '');
const selOf = (d) => { const keys = (d.sensors ?? []).map((x) => x.key), base = (d.selected ?? []).length ? d.selected : keys.filter((k) => ['steps', 'heart_rate', 'resting_heart_rate', 'sleep_duration', 'active_calories_burned', 'activity', 'floors_ascended', 'floors_climbed'].includes(k)); const O = HH.off[d.id] ?? {}; return keys.filter((k) => (k in O ? O[k] === false : base.includes(k))); };
const PH = (tab) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="${tab ? 3 : 6}" y="2" width="${tab ? 18 : 12}" height="20" rx="3"/><path d="M11 18h2"/></svg>`;

function devRow(D, d, i) {
  const o = ownOf(d), P = o ? pOf(D, o) : null, sens = d.sensors ?? [], has = sens.length > 0, tab = isTab(d), and = d.platform === 'android' || d.os === 'Android';
  const ic = and ? ['#e3eee5', '#2f6b4a'] : tab ? ['#ece6da', '#6b665c'] : ['#e6ecf5', '#2b5d8a'];
  const sel = selOf(d);
  return `<div class="p45-hd${has ? '' : ' dim'}"${i ? '' : ' data-first'}><div class="p45-hdr"><span class="p45-hdi" style="background:${ic[0]};color:${ic[1]}">${PH(tab)}</span>
    <span class="m-grow"><b class="m-ell">${esc(d.name ?? 'Enhet')}</b><span class="p45-hds"><span class="p45-pill${has ? ' g' : ''}">${esc(d.healthText ?? (has ? `${sens.length} helsesensorer` : 'Ingen helsesensorer'))}</span>${esc(osOf(d))}</span></span>
    <button type="button" class="p45-pp" data-p45h="pick" data-id="${esc(d.id)}" aria-label="Velg person: ${esc(P?.name ?? 'Velg')}" ${isAdmin() ? '' : 'disabled'}><span style="background:${P?.c ?? '#8f897c'}">${esc(P ? nb(P.name).slice(0, 1).toUpperCase() : '+')}</span>${P ? esc(nb(P.name).split(' ')[0]) : 'Velg'} ▾</button></div>
    ${has && o ? `<div class="p45-hsx">${sens.map((x) => { const v = sel.includes(x.key); return `<button type="button" class="p45-hch${v ? ' on' : ''}" data-p45h="sens" data-id="${esc(d.id)}" data-k="${esc(x.key)}" aria-pressed="${v}" ${isAdmin() ? '' : 'disabled'}>${v ? '✓ ' : ''}${esc(x.label ?? SENS_N[x.key] ?? x.key)}</button>`; }).join('')}</div>` : ''}
    ${o && (d.limited || (d.platform === 'ios' && !tab)) ? `<span class="p45-hlim">${esc(d.limitedText ?? 'Begrenset på iPhone: bare skritt, etasjer og aktivitet. Puls og søvn krever Homelab-appen.')}</span>` : ''}
    ${d.unavailableSince ? `<span class="p45-hlim">Ingen data fra ${esc(d.name)} siden ${esc(new Date(d.unavailableSince).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }))}</span>` : ''}</div>`;
}
export function haView() {
  haLoad();
  const v = HH.view, D = HH.d[v], err = HH.err[v];
  const av = m.me?.avatarUrl ? `<img src="${esc(m.me.avatarUrl)}" alt="">` : esc(String(m.me?.name ?? m.me?.username ?? 'S').slice(0, 1).toUpperCase());
  const top = `<div class="p45-htop"><a class="p45-hback" href="#/set">‹ Alle innstillinger</a><a class="p45-hav0" href="#/set/konto" aria-label="Konto">${av}</a></div><div class="p45-hh"><span class="p45-hak">Helse fra mobilappen</span><b class="p45-hT">Home Assistant</b><span class="p45-hp">Les skritt, puls og søvn fra Home Assistant-appen på telefonene. Hver person godkjenner delingen første gang.</span></div>`;
  if (D === undefined) return `<div class="p45-hpage">${top}<div class="m-spin"></div></div>`;
  if (!D) return `<div class="p45-hpage">${top}<div class="p45-hcard"><b>Fikk ikke hentet enhetene</b><span class="p45-hmut">${esc(err || 'Prøv igjen om litt.')}</span><button type="button" class="p45-hbtn" data-p45h="retry">Prøv igjen</button></div></div>`;
  const devs = (D.devices ?? []).filter((d) => v === 'all' || !isTab(d));
  const St = D.status ?? {}, linked = devs.filter((d) => ownOf(d)).length;
  const conn = D.connected !== false;
  const stat = `<div class="p45-hcard row"><span class="p45-hdot${conn ? '' : ' bad'}"></span><span class="m-grow"><b>${conn ? 'Tilkoblet' : D.error === 'token' ? 'Koble til Home Assistant på nytt' : 'Får ikke kontakt'}</b><small class="m-ell">${esc([St.url ?? '', 'Mobilapp-integrasjonen'].filter(Boolean).join(' · '))}${D.message ? ` · ${esc(D.message)}` : ''}</small></span><b class="p45-hsum">${esc(St.text && v === (D.view ?? v) ? St.text : `${linked} av ${devs.length} koblet`)}</b></div>`;
  const cnt = D.counts ?? {};
  const seg = `<div class="p45-hseg" role="radiogroup" aria-label="Vis">${[['phones', `Telefoner${cnt.phones != null ? ` · ${cnt.phones}` : ''}`], ['all', `Alle mobilapp${cnt.all != null ? ` · ${cnt.all}` : ''}`]].map(([k, n]) => `<button type="button" role="radio" aria-checked="${v === k}" class="${v === k ? 'on' : ''}" data-p45h="view" data-k="${k}">${esc(n)}</button>`).join('')}</div>`;
  // Gruppert per person (overskrift i personens farge), «IKKE KOBLET» sist.
  const by = new Map(); for (const d of devs) { const k = ownOf(d) ?? '_'; if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
  const order = [...persons(D).map((p) => String(p.id)).filter((k) => by.has(k)), ...[...by.keys()].filter((k) => k !== '_' && !persons(D).some((p) => String(p.id) === k)), ...(by.has('_') ? ['_'] : [])];
  const groups = order.map((k) => { const P = k === '_' ? null : pOf(D, k); const L = by.get(k); return `<span class="p45-hgl" style="color:${P?.c ?? '#8f897c'}">${esc(P ? `${nb(P.name).toUpperCase()} · ${L.length}` : `IKKE KOBLET · ${L.length}`)}</span><div class="p45-hcard list">${L.map((d, i) => devRow(D, d, i)).join('')}</div>`; }).join('');
  const hidden = D.hidden?.text ?? (cnt.other ? `${cnt.other} andre enheter fra Home Assistant (brytere, sensorer, rullegardiner) vises ikke her. De har ingen helsedata.` : '');
  return `<div class="p45-hpage">${top}${stat}${seg}${devs.length ? groups : '<div class="p45-hcard"><span class="p45-hmut">Fant ingen telefoner med Home Assistant-appen.</span></div>'}${hidden ? `<span class="p45-hmut pad">${esc(hidden)}</span>` : ''}
    ${isAdmin() ? `<div class="p45-hsave"><button type="button" class="p45-hbtn ink" data-p45h="save" ${HH.saving ? 'disabled' : ''}>${HH.saving ? 'Lagrer …' : HH.saved ? '✓ Lagret' : 'Lagre'}</button></div>` : '<span class="p45-hmut pad">Bare administratorer kan koble telefoner til personer.</span>'}</div>`;
}
function pickSheet() {
  if (!on() || !HH.sheet) return '';
  const D = HH.d[HH.view], d = (D?.devices ?? []).find((x) => String(x.id) === String(HH.sheet)); if (!d) return '';
  const cur = ownOf(d), P = persons(D);
  const sug = d.suggestText ?? (d.suggestedPersonId ? `Foreslått ut fra navnet: ${pOf(D, d.suggestedPersonId)?.name ?? ''}` : '');
  return `<div class="p44-scrim" data-p45h="pickx"></div><div class="pp-sheet p45-hsh" role="dialog" aria-modal="true" aria-label="Hvem bruker telefonen?"><span class="pp-grab"></span>
    <div class="p45-swh"><span><b class="pp-sh">Hvem bruker telefonen?</b><small class="p45-hmut">${esc(d.name ?? '')}</small></span><button type="button" class="p45-hx" data-p45h="pickx" aria-label="Lukk">✕</button></div>
    <div class="p45-hav">${P.map((p, i) => `<button type="button" data-p45h="pset" data-id="${esc(d.id)}" data-p="${esc(p.id)}" aria-pressed="${String(cur) === String(p.id)}" class="${String(cur) === String(p.id) ? 'on' : ''}"><span style="background:${colOf(p, i)}">${esc(nb(p.name).slice(0, 1).toUpperCase())}</span>${esc(nb(p.name).split(' ')[0])}</button>`).join('')}<button type="button" data-p45h="pset" data-id="${esc(d.id)}" data-p="" aria-pressed="${!cur}" class="${cur ? '' : 'on'}"><span style="background:#8f897c">–</span>Ingen</button></div>
    ${sug ? `<span class="p45-hsug">✦ ${esc(sug)}</span>` : ''}</div>`;
}
async function save() {
  const D = HH.d[HH.view]; if (!D) return;
  HH.saving = true; draw();
  const devices = (D.devices ?? []).map((d) => ({ id: d.id, personId: ownOf(d), sensors: selOf(d) }));
  try { const r = await hlApi('/family/health/ha', { method: 'PUT', json: { devices } }); if (r && typeof r === 'object') HH.d[HH.view] = r; HH.own = {}; HH.off = {}; HH.saved = true; haptic('ok'); }
  catch (e) { flash(e.status === 403 ? 'Bare administratorer kan koble telefoner' : e.message); }
  HH.saving = false; draw();
}

/* ---------- Krokene (fra mobile-p45.js) ---------- */
export function layer() { return pickSheet(); }
export function after(root) { root.classList.toggle('p45-hapg', on()); if (!on()) HH.sheet = null; }
export function load(scr, sub) { return scr === 'set' && sub === 'helseha' ? haLoad(true) : null; }
export async function bind(e, t) {
  const x = t.closest?.('[data-p45h]'); if (!x) return false;
  e.preventDefault(); const a = x.dataset.p45h;
  switch (a) {
    case 'view': HH.view = x.dataset.k === 'all' ? 'all' : 'phones'; haptic('tab'); draw(); haLoad(); return true;
    case 'retry': HH.t = {}; haLoad(true); return true;
    case 'pick': HH.sheet = x.dataset.id; haptic('tap'); draw(); return true;
    case 'pickx': HH.sheet = null; draw(); return true;
    case 'pset': HH.own[x.dataset.id] = x.dataset.p || null; HH.sheet = null; HH.saved = false; haptic('tap'); draw(); return true;
    case 'sens': { const id = x.dataset.id, k = x.dataset.k, d = (HH.d[HH.view]?.devices ?? []).find((y) => String(y.id) === id); if (!d) return true; const onNow = selOf(d).includes(k); HH.off[id] = { ...(HH.off[id] ?? {}), [k]: onNow }; HH.saved = false; haptic('tap'); draw(); return true; }
    case 'save': await save(); return true;
    default: return false;
  }
}
export function input() { return false; }
export async function change() { return false; }
export async function submit() { return false; }
export function boot() {}

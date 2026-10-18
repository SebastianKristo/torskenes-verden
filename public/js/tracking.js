// Sporing: pakker fra Finn-handler, e-post og manuelt innlimte nummer. Data og status kommer fra /api/tracking.
import { pkgLogo, pkgTitle } from './pkglogo.js';
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
// Prompt 26: overstyr sporingstjenesten (carrierOverride, null = auto) ved ny pakke og under «Spor via» på en pakke.
const OVR = [['posten', 'Posten'], ['bring', 'Bring'], ['postnord', 'PostNord'], ['dhl', 'DHL'], ['helthjem', 'Helthjem'], ['ups', 'UPS'], ['budbee', 'Budbee'], ['instabox', 'Instabox'], ['parcelsapp', 'ParcelsApp']];
const OVR_EXTRA = { parcelsapp: { color: '#4B5BD6', fg: '#fff', ini: 'PA' } };
const carName = (id) => S.d?.carriers?.find((c) => c.id === id)?.name ?? OVR.find((o) => o[0] === id)?.[1] ?? id;
const carOf = (id) => S.d?.carriers?.find((c) => c.id === id) ?? OVR_EXTRA[id] ?? { color: '#3A4252', fg: '#eef0f4', ini: String(id ?? '?').slice(0, 2).toUpperCase() };
/** «Bring · valgt» når tjenesten er overstyrt, ellers transportøren som er gjenkjent. */
const carLabel = (t) => (t.carrierOverride ? (/valgt/.test(t.carrierLabel ?? '') ? t.carrierLabel : `${carName(t.carrierOverride)} · valgt`) : t.carrierName);
const detName = (t) => (t.carrierDetected ? carName(t.carrierDetected) : t.carrierOverride ? '' : t.carrierName) || 'gjenkjent';
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
const isDone = (t) => t.archived || t.status === 'delivered' || t.status === 'returned';
const isPick = (t) => !isDone(t) && t.status === 'ready_for_pickup' && t.direction !== 'out';
// Prompt 22: serveren gir estimatedDelivery, pickup {name, deadline}, lastEvent {text, place, time} og updateError {text, retryAt}.
const tsOf = (v) => (v == null || v === '' ? null : typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00' : v));
const when = (v) => { const d = tsOf(v); return d && !Number.isNaN(+d) ? (/T00:00|T12:00:00?$/.test(String(v)) || /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dm(d) : `${dm(d)} ${hm(d)}`) : ''; };
const lastEv = (t) => {
  const le = t.lastEvent;
  if (le && (le.text || le.place)) return { text: le.text ?? '', place: le.place ?? '', time: le.time ?? null };
  const e = t.events?.[0];
  return e ? { text: e.status, place: e.location ?? '', time: e.ts } : null;
};
function errText(t) {
  const u = t.updateError;
  if (!u) return '';
  const at = tsOf(u.retryAt);
  return `Kunne ikke oppdatere${at && !Number.isNaN(+at) ? ` · prøver igjen ${hm(at)}` : ''}`;
}
function etaText(t) {
  const eta = t.estimatedDelivery ?? t.eta, d = isoDate(eta), txt = d ? dm(d) : eta;
  if (t.status === 'delivered') { const last = t.events.find((e) => /levert/i.test(e.status)) ?? t.events[0]; return last ? `Levert ${dm(new Date(last.ts))}` : 'Levert'; }
  if (t.status === 'ready_for_pickup') {
    const dl = t.pickup?.deadline ? when(t.pickup.deadline) : txt;
    return [t.pickup?.name ?? t.pickupPoint, dl && `hent innen ${dl}`].filter(Boolean).join(' · ') || 'Klar for henting';
  }
  if (t.updateError && !(t.step > 0)) return errText(t);
  if (t.status === 'returned') return 'Returnert til avsender';
  if (!txt && t.noEtaText) return t.noEtaText;
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
  // Uten svar fra transportøren vises ikke «Registrert» som om det var sant (prompt 22).
  const unknown = !!t.updateError && !(t.step > 0) && !fin && !ready;
  // Tidslinjen: steps kan være navn (eldre server) eller {name|label, done, time}. Siste fullførte steg får dato og klokkeslett.
  // Prompt 22: timeline [{key,label,done,current,time,timeText}] fra serveren går foran steps.
  const stepArr = Array.isArray(t.timeline) && t.timeline.length ? t.timeline.map((x) => ({ name: x.label ?? x.key ?? '', done: !!x.done, cur: !!x.current, time: x.time, tt: x.timeText })) : (t.steps ?? []).map((x) => (typeof x === 'string' ? { name: x } : { name: x.name ?? x.label ?? x.t ?? '', done: x.done, time: x.time ?? x.at ?? x.ts }));
  const curStep = stepArr.some((x) => x.cur) ? stepArr.findIndex((x) => x.cur) : stepArr.some((x) => typeof x.done === 'boolean') ? stepArr.reduce((a, x, j) => (x.done ? j : a), -1) : t.step ?? 0;
  const lastTime = stepArr[curStep]?.time ?? (curStep === (t.step ?? 0) ? lastEv(t)?.time : null);
  const steps = stepArr.map((x, j) => {
    const dn = j <= curStep && !unknown, cur = j === curStep && !fin && !unknown;
    const label = !t.timeline && j === 3 && t.direction !== 'out' && stepArr.length === 5 && /hentested|ute/i.test(x.name || 'Hentested') ? (t.status === 'out_for_delivery' ? 'Ute' : 'Hentested') : x.name;
    const at = j === curStep && !unknown && (x.tt || lastTime) ? `<time>${esc(x.tt || when(lastTime))}</time>` : '';
    return `<span class="trk-step${dn ? ' dn' : ''}${cur ? ' cur' : ''}${j < curStep ? ' ln' : ''}${fin ? ' fin' : ''}"><span><i></i><em></em></span><small>${esc(label)}${at}</small></span>`;
  }).join('');
  const ev = lastEv(t), err = errText(t);
  const tl = t.events.map((e, j) => `<div class="trk-ev${j ? '' : ' now'}"><div class="trk-ev-l"><i></i><em></em></div><div class="trk-ev-b"><div><b>${esc(e.status)}</b><span>${esc(evTime(e.ts))}</span></div>${e.location ? `<small>${esc(e.location)}</small>` : ''}</div></div>`).join('');
  return `<div class="trk-card${ready ? ' ready' : ''}${S.sel.has(t.id) ? ' picked' : ''}">
    <button class="trk-head" data-trk-open="${t.id}" aria-expanded="${open}">
      <span class="trk-row"><span class="trk-selb${S.sel.has(t.id) ? ' on' : ''}" data-trk-selb="${t.id}" role="checkbox" aria-checked="${S.sel.has(t.id)}" title="Velg for arkivering eller sletting">${pkgLogo(t, 44)}<i>✓</i></span><span class="trk-tt"><b>${esc(pkgTitle(t))}</b><small>${esc(carLabel(t))} · <span class="trk-mono">${esc(t.trackingNo)}</span></small></span>
        <span class="trk-src" style="background:${sbg};color:${sfg}">${esc(src)}</span></span>
      <span class="trk-st"><span><b style="color:${unknown ? 'var(--text-2)' : stC}">${esc(unknown ? 'Status ukjent' : t.statusText)}</b><small${unknown ? ' class="trk-err"' : ''}>${esc(etaText(t))}</small></span>${t.direction === 'out' ? '<em>Utgående</em>' : ''}</span>
      <span class="trk-steps">${steps}</span>
      <span class="trk-last">${ev ? `${esc([ev.text, ev.place].filter(Boolean).join(' · '))}${ev.time ? ` <span>· ${esc(when(ev.time))}</span>` : ''}` : 'Ingen hendelser ennå'}</span>
      ${err && !unknown ? `<span class="trk-err">${esc(err)}</span>` : ''}
    </button>
    ${open ? `<div class="trk-more">
      ${tl ? `<div class="trk-tl">${tl}</div>` : ''}
      <div class="trk-via"><span class="trk-via-k">SPOR VIA</span><div class="trk-chips">${[[null, `✦ Auto · ${detName(t).replace(/ \(17TRACK\)$/, '')}`], ...OVR].map(([id, n]) => { const on = (t.carrierOverride ?? null) === id; return `<button class="trk-chip${on ? ' on' : ''}" data-trk-via="${t.id}:${id ?? ''}" aria-pressed="${on}">${id ? badge(carOf(id).color, carOf(id).fg, carOf(id).ini, 'sm', carOf(id).logo) : ''}${esc(n)}</button>`; }).join('')}</div></div>
      ${t.sourceNote ? `<span class="trk-note">✦ ${esc(t.sourceNote)}</span>` : ''}
      ${t.updateError?.text ? `<span class="trk-note warn">${esc(t.updateError.text)}</span>` : t.lastError ? `<span class="trk-note warn">${esc(t.lastError)}</span>` : ''}
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
  const g = S.guess ?? 'other', gName = g === 'other' ? 'ukjent' : carName(g);
  const hint = S.pick ? `Spores via ${carName(S.pick)} (valgt av deg). Velg Auto for å gjenkjenne tjenesten automatisk.`
    : g === 'other' ? 'Fant ikke transportøren ut fra nummeret. Velg en tjeneste, eller la Auto prøve.' : `✦ Ser ut som ${gName} ut fra formatet. Velg en annen tjeneste for å overstyre.`;
  const chip = (id, n, on) => `<button class="trk-chip${on ? ' on' : ''}" data-trk-pick="${id ?? ''}" aria-pressed="${on}">${id ? badge(carOf(id).color, carOf(id).fg, carOf(id).ini, 'sm', carOf(id).logo) : ''}${esc(n)}</button>`;
  return `<span class="trk-hint">${esc(hint)}</span><div class="trk-chips">${chip(null, `✦ Auto · ${gName}`, !S.pick)}${OVR.map(([id, n]) => chip(id, n, S.pick === id)).join('')}</div>`;
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
  const rb = document.querySelector('[data-trk-refresh]');
  if (rb) { rb.disabled = S.busy; rb.textContent = S.busy ? 'Oppdaterer …' : '↻ Oppdater'; }
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
  return `<div id="trk-ptr" class="trk-ptr" aria-hidden="true"><span>Dra for å oppdatere</span></div><div class="trk-top"><div class="os-title">Spor<b>ing</b></div><div id="trk-sum" class="trk-sumtxt">${esc(summary())}</div><button class="trk-btn trk-refresh" data-trk-refresh ${S.busy ? 'disabled' : ''} aria-label="Oppdater status">↻ Oppdater</button></div>
    <div id="trk-os" class="trk">${body()}</div><div id="trk-toast" class="trk-toast" role="status" aria-live="polite" hidden></div>`;
}

async function add() {
  const no = S.no.replace(/\s+/g, '').toUpperCase();
  if (no.length < 6) return flash('Skriv inn et sporingsnummer', true);
  if (S.d?.items.some((t) => t.trackingNo === no)) return flash('Sendingen spores allerede', true);
  S.adding = true; paint();
  try {
    const known = S.pick && S.d?.carriers?.some((c) => c.id === S.pick);
    const r = await T('', { method: 'POST', json: { trackingNo: no, name: S.name.trim(), carrier: known ? S.pick : undefined, carrierOverride: S.pick ?? null } });
    Object.assign(S, { no: '', name: '', pick: null, guess: null, seg: 'Aktive', open: r.item.id });
    flash(r.message);
    await load();
  } catch (e) { flash(e.message, true); }
  S.adding = false; paint();
}

// «Sjekk nå» og dra-for-å-oppdatere: POST /tracking/refresh (prompt 22), /check på en eldre server.
async function check() {
  if (S.busy) return;
  S.busy = true; paint();
  try {
    let r;
    try { r = await T('/refresh', { method: 'POST' }); } catch (e) { if (e.status !== 404) throw e; r = await T('/check', { method: 'POST' }); }
    if (r?.items) { const ark = (S.d?.items ?? []).filter((t) => t.archived && !r.items.some((x) => x.id === t.id)); S.d = { ...S.d, ...r, items: [...r.items, ...ark] }; } else await load();
    flash(r?.message ?? 'Status er oppdatert');
  } catch (e) { flash(e.message, true); }
  S.busy = false; paint();
}

// Dra ned øverst på siden (berøring) for å oppdatere.
let ptr = null;
function bindPull(view) {
  const ind = () => document.getElementById('trk-ptr');
  view.addEventListener('touchstart', (e) => { if (!host() || window.scrollY > 0 || S.busy || e.touches.length !== 1) return; ptr = { y: e.touches[0].clientY, d: 0 }; }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    if (!ptr) return;
    ptr.d = Math.max(0, e.touches[0].clientY - ptr.y);
    const i = ind();
    if (i) { const h = Math.min(70, ptr.d * 0.5); i.style.height = `${h}px`; i.classList.toggle('arm', ptr.d > 90); i.querySelector('span').textContent = ptr.d > 90 ? 'Slipp for å oppdatere' : 'Dra for å oppdatere'; }
  }, { passive: true });
  view.addEventListener('touchend', () => {
    if (!ptr) return;
    const go = ptr.d > 90; ptr = null;
    const i = ind();
    if (i) { i.style.height = go ? '44px' : '0px'; if (go) i.querySelector('span').textContent = 'Oppdaterer …'; }
    if (go) check().finally(() => { const j = ind(); if (j) j.style.height = '0px'; });
  });
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
  bindPull(view);
  view.addEventListener('click', (e) => { if (e.target.closest('[data-trk-refresh]')) check(); });
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
    if ((b = el('[data-trk-pick]'))) { S.pick = b.dataset.trkPick || null; return paintGuess(); }
    if ((b = el('[data-trk-via]'))) {
      const [id, car] = b.dataset.trkVia.split(':'), t = S.d.items.find((x) => x.id === +id), v = car || null;
      if (!t || (t.carrierOverride ?? null) === v) return;
      try {
        const r = await T(`/${t.id}`, { method: 'PATCH', json: { carrierOverride: v } });
        if (r?.item) S.d.items = S.d.items.map((x) => (x.id === t.id ? r.item : x)); else t.carrierOverride = v;
        flash(r?.message || (v ? `Spores nå via ${carName(v)}` : `Tilbake til automatisk (${detName(r?.item ?? t)})`));
        setTimeout(load, 2500); // serveren slår opp på nytt med en gang
      } catch (err) { flash(err.status === 400 ? 'Serveren støtter ikke valg av tjeneste ennå' : err.message, true); }
      return paint();
    }
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
        flash(r.item.archived ? `${pkgTitle(t)} er arkivert` : `${pkgTitle(t)} er aktiv igjen`);
      } catch (err) { flash(err.message, true); }
      return paint();
    }
    if ((b = el('[data-trk-del]'))) {
      const t = item(b.dataset.trkDel);
      if (S.delArm !== t.id) { S.delArm = t.id; return paint(); }
      try { await T(`/${t.id}`, { method: 'DELETE' }); S.d.items = S.d.items.filter((x) => x.id !== t.id); Object.assign(S, { delArm: null, open: null }); flash(`${pkgTitle(t)} er slettet`); } catch (err) { flash(err.message, true); }
      return paint();
    }
  });
}

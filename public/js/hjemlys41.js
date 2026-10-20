// Prompt 41 (claude-code-hjemlys.md → «Si fra» og «Lagt inn i appen: Familie → Hjemlys»). Fasit: Familie.dc.html (fanen Hjemlys),
// Hjemme trygt Varianter.dc.html 3a–3c og 4a–4d. Web: egen fane i Familie med hele flyten:
//   Start (fire valg + aktive i familien + Glimt-forslag) → Hvem får beskjed? (søk, Husstanden / Siste brukt / Alle, «Husk valget»)
//   → Klar (mål, rute, «Alt OK?»-ventetid 5/15/30, hva som deles hvis sen) → Aktiv (hjemlys40.js viser økta med knappene).
//   Sjekket inn / Drar snart / Drar nå uten mål: valgfritt sted → «Sendt»-kort med beskjeden ordrett.
// API: POST /api/hjemlys/notice {kind:'checkin'|'leaving_soon'|'leaving_now'|'arrived', place?, eta?, to:[userId], note?}
//      POST /api/hjemlys/start {eta, mode, waitMin, recipients, destination:{name, lat, lon, kind:'home'|'place'}, share}
// Personvern: bare beskjeden og stedet du valgte sendes til personene du valgte. Du selv er aldri i mottakerlista.
// Lokal tilstand i localStorage «hjemlys_v1» (siste mottakere per hendelse, sendt-kortet) så det overlever omstart.
import { api, esc } from './util.js';
import { stableColor, twoLetters } from './poscard.js';
import { hjemlysHtml, loadHjemlys } from './hjemlys40.js';

const KINDS = {
  home: { t: 'På vei hjem', s: 'Si fra når jeg er hjemme', dark: true },
  checkin: { t: 'Sjekket inn', s: 'Jeg er fremme' },
  soon: { t: 'Drar snart', s: '15 min · 30 min · 1 t' },
  now: { t: 'Drar nå', s: 'Hjem, annet sted eller ikke oppgi' },
};
const API_KIND = { checkin: 'checkin', soon: 'leaving_soon', now: 'leaving_now' };
const V = { step: 'start', kind: null, to: null, q: '', filt: 'hus', remember: true, place: '', note: '', soon: 30, dest: 'home', destName: '', wait: 15, share: { pos: true, bat: true, with: true }, route: undefined, pick: 0, busy: false, err: '', sent: null };
let fam = null, repaint = () => {};

const LS = 'hjemlys_v1';
const ls = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
const lsSet = (o) => { try { localStorage.setItem(LS, JSON.stringify({ ...ls(), ...o })); } catch { /* privat modus */ } };
{ const s = ls().sent; if (s && Date.now() - (s.at ?? 0) < 6 * 3600_000) { V.sent = s; } }

const hm = (d) => new Date(d).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
// Mottakerne: GET /api/hjemlys/recipients {household:[{userId, name, avatar}], last:{kind:[id]}} (du selv er aldri med); reserve: Familie.
let rec = null, recBusy = false;
function loadRec() { if (rec || recBusy) return; recBusy = true; api('/hjemlys/recipients').then((r) => { rec = r && Array.isArray(r.household) ? r : null; }).catch(() => { rec = null; }).finally(() => { recBusy = false; if (rec) repaint(); }); }
const people = () => {
  const fm = (fam?.members ?? []).filter((m) => !m.self && m.userId);
  if (!rec) return fm;
  return rec.household.map((h) => ({ ...(fm.find((m) => m.userId === h.userId) ?? {}), ...h }));
};
const meName = () => (fam?.members ?? []).find((m) => m.self)?.name?.split(' ')[0] ?? fam?.me?.name?.split(' ')[0] ?? 'Du';
const nm = (L) => { const n = L.map((p) => p.name?.split(' ')[0]).filter(Boolean); return n.length > 2 ? `${n.slice(0, 2).join(', ')} og ${n.length - 2} til` : n.length === 2 ? `${n[0]} og ${n[1]}` : n[0] ?? 'ingen'; };
function av(p, sz = 32) {
  const c = stableColor(p.userId ?? p.name ?? '?'), img = p.photoUrl ?? p.avatarUrl ?? p.avatar;
  return `<span class="hl41-av" style="background:${c};width:${sz}px;height:${sz}px">${img ? `<img src="${esc(img)}" alt="">` : esc(twoLetters(p.name))}</span>`;
}
const GLOW = '<span class="hl40-glow" aria-hidden="true"></span>';

const SRV_KIND = { home: 'start', checkin: 'checkin', soon: 'leaving_soon', now: 'leaving_now' };
function defaultTo(kind) {
  const saved = ls().to?.[kind] ?? rec?.last?.[SRV_KIND[kind]];
  const ids = people().map((p) => p.userId);
  return Array.isArray(saved) && saved.length ? saved.filter((x) => ids.includes(x)) : ids;
}

/* ---------- Visning ---------- */
function startHtml() {
  const g = Object.entries(KINDS).map(([k, x]) => `<button type="button" class="hl41-ch${x.dark ? ' dark' : ''}" data-hl41="kind" data-k="${k}">${k === 'home' ? GLOW : `<span class="hl41-ic">${k === 'checkin' ? '✓' : k === 'soon' ? '◷' : '→'}</span>`}<b>${esc(x.t)}</b><span>${esc(x.s)}</span></button>`).join('');
  const sent = V.sent ? sentHtml() : '';
  return `${sent}<div class="hl41-grid">${g}</div>
    <div class="hl41-sec"><span class="hl41-k">AKTIVE I FAMILIEN</span><div class="hl41-act" data-hl40-slot="page">${hjemlysHtml({ page: true })}</div></div>`;
}
function whoHtml() {
  const L = people(), q = V.q.trim().toLowerCase(), recent = ls().recent ?? [];
  const F = L.filter((p) => (!q || String(p.name).toLowerCase().includes(q)) && (V.filt !== 'siste' || recent.includes(p.userId)));
  const row = (p) => { const on = V.to.includes(p.userId); return `<button type="button" class="hl41-pr" role="checkbox" aria-checked="${on}" data-hl41="pick" data-id="${esc(p.userId)}">${av(p, 36)}<span class="hl41-tx"><b>${esc(p.name)}</b><span>${esc(p.zone ?? p.last?.place ?? 'Husstanden')}</span></span><span class="hl41-cb${on ? ' on' : ''}">${on ? '✓' : ''}</span></button>`; };
  const sel = L.filter((p) => V.to.includes(p.userId));
  return `<div class="hl41-head"><button type="button" class="hl41-back" data-hl41="back">‹ Tilbake</button><b>Hvem får beskjed?</b><span class="hl41-mut">${esc(KINDS[V.kind].t)}</span></div>
    <label class="hl41-q"><input name="hl41q" value="${esc(V.q)}" placeholder="Søk etter navn" autocomplete="off" aria-label="Søk etter personer"></label>
    <div class="hl41-seg">${[['hus', 'Husstanden'], ['siste', 'Siste brukt'], ['alle', 'Alle']].map(([k, n]) => `<button type="button" aria-pressed="${V.filt === k}" data-hl41="filt" data-k="${k}">${n}</button>`).join('')}</div>
    <span class="hl41-k">HUSSTANDEN</span><div class="hl41-list">${F.map(row).join('') || `<span class="hl41-mut hl41-pad">${L.length ? 'Ingen treff.' : 'Ingen andre i husstanden har konto i Homelab ennå. Legg dem til under Innstillinger → Brukere.'}</span>`}</div>
    ${V.filt === 'alle' ? '<span class="hl41-k">VENNER OG KONTAKTER</span><div class="hl41-list"><span class="hl41-mut">Venner med Papir og kontakter fra telefonen (SMS-lenke) velges i appen på telefonen.</span></div>' : ''}
    <div class="hl41-foot"><span class="hl41-avs">${sel.map((p) => av(p, 26)).join('')}</span><b>${sel.length} valgt</b>
      <button type="button" class="hl41-tg${V.remember ? ' on' : ''}" role="switch" aria-checked="${V.remember}" data-hl41="remember"><i></i></button><span class="hl41-mut">Husk valget</span>
      <span class="hl41-sp"></span><button type="button" class="hl41-b ink" data-hl41="next"${sel.length ? '' : ' disabled'}>Neste</button></div>`;
}
function etaOf() {
  const o = V.route?.options?.[V.pick];
  if (o?.eta) return new Date(o.eta);
  return new Date(Date.now() + (o?.minutes ?? 30) * 60_000);
}
function readyHtml() {
  const k = V.kind, trip = k === 'home' || (k === 'now' && V.dest !== 'none');
  const to = people().filter((p) => V.to.includes(p.userId));
  const head = `<div class="hl41-head"><button type="button" class="hl41-back" data-hl41="back">‹ Tilbake</button><b>${esc(KINDS[k].t)}</b><span class="hl41-mut">Til ${esc(nm(to))}</span></div>`;
  const place = `<label class="hl41-f"><span>Sted <i>valgfritt</i></span><input name="hl41place" value="${esc(V.place)}" placeholder="F.eks. «Bursdag hos Mari»" autocomplete="off" maxlength="80"></label>`;
  if (k === 'checkin') return `${head}${place}<label class="hl41-f"><span>Melding <i>valgfritt</i></span><input name="hl41note" value="${esc(V.note)}" maxlength="140" autocomplete="off"></label>
    <span class="hl41-mut">Bare beskjeden og stedet sendes. Posisjonen din deles ikke.</span>${btns('Send «Sjekket inn»')}`;
  if (k === 'soon') return `${head}<div class="hl41-f"><span>Drar om</span><div class="hl41-seg">${[[15, '15 min'], [30, '30 min'], [60, '1 t'], [0, 'Ukjent']].map(([v, n]) => `<button type="button" aria-pressed="${V.soon === v}" data-hl41="soon" data-v="${v}">${n}</button>`).join('')}</div></div>${place}
    <span class="hl41-mut">${V.soon ? `Drar ca. ${hm(Date.now() + V.soon * 60_000)}. Ved tiden spør appen «Drar du nå?». Ingen svar = ingen alarm.` : 'Mottakerne får «drar snart» uten klokkeslett.'}</span>${btns('Si fra')}`;
  const dests = k === 'now' ? [['home', 'Hjem'], ['place', 'Annet sted'], ['none', 'Ikke oppgi']] : [['home', 'Hjem'], ['place', 'Annet sted']];
  const destRow = `<div class="hl41-f"><span>Mål</span><div class="hl41-seg">${dests.map(([v, n]) => `<button type="button" aria-pressed="${V.dest === v}" data-hl41="dest" data-v="${v}">${n}</button>`).join('')}</div></div>
    ${V.dest === 'place' ? `<label class="hl41-f"><span>Hvor skal du?</span><input name="hl41dest" value="${esc(V.destName)}" placeholder="Navn på stedet" autocomplete="off" maxlength="80"></label>` : ''}`;
  if (!trip) return `${head}${destRow}${place}<span class="hl41-mut">Uten mål sendes én beskjed. Posisjon deles ikke.</span>${btns('Si fra')}`;
  if (V.route === undefined && V.dest === 'home') { V.route = null; api('/hjemlys/route').then((r) => { V.route = r && typeof r === 'object' ? r : {}; }).catch(() => { V.route = {}; }).finally(() => repaint()); }
  const opts = V.dest === 'home' ? V.route?.options ?? [] : [];
  const routes = opts.length ? `<div class="hl41-f"><span>Rute</span><div class="hl41-routes">${opts.map((o, i) => `<button type="button" class="hl41-rt" aria-pressed="${i === V.pick}" data-hl41="route" data-v="${i}"><b>${esc(o.label ?? o.mode ?? 'Rute')}</b><span>${o.minutes ? `${o.minutes} min · ` : ''}hjemme ca. ${esc(hm(o.eta ?? etaOf()))}</span>${i === V.pick ? '<i>✓</i>' : ''}</button>`).join('')}</div></div>`
    : V.dest === 'home' && V.route === null ? '<span class="hl41-mut">Finner ruten hjem …</span>' : '';
  const sw = (k2, n) => `<button type="button" class="hl41-sw" role="switch" aria-checked="${!!V.share[k2]}" data-hl41="share" data-v="${k2}"><span>${n}</span><span class="hl41-tg${V.share[k2] ? ' on' : ''}"><i></i></span></button>`;
  return `${head}${destRow}${routes}
    <div class="hl41-f"><span>Varsle hvis jeg ikke svarer på «Alt OK?»</span><div class="hl41-seg">${[5, 15, 30].map((n) => `<button type="button" aria-pressed="${V.wait === n}" data-hl41="wait" data-v="${n}">${n} min</button>`).join('')}</div></div>
    <div class="hl41-f"><span>Deles bare hvis du er sen</span><div class="hl41-sws">${sw('pos', 'Posisjon og rute')}${sw('bat', 'Batteri og dekning')}${sw('with', 'Hvem jeg var med')}</div></div>
    ${btns(`${GLOW}Start · ${V.dest === 'home' ? 'hjemme' : 'fremme'} ca. ${hm(etaOf())}`, true)}`;
}
const btns = (label, glow) => `${V.err ? `<span class="hl41-err" role="alert">${esc(V.err)}</span>` : ''}<div class="hl41-btns"><button type="button" class="hl41-b" data-hl41="cancel">Avbryt</button><button type="button" class="hl41-b ink${glow ? ' glow' : ''}" data-hl41="go"${V.busy ? ' disabled' : ''}>${V.busy ? 'Sender …' : label}</button></div>`;
function sentHtml() {
  const s = V.sent;
  return `<div class="hl41-sent" role="status"><span class="hl41-k">SENDT ${esc(hm(s.at))} · ${esc(String(s.toNames).toUpperCase())}</span><b>«${esc(s.text)}»</b>
    <div class="hl41-btns">${s.kind === 'soon' ? '<button type="button" class="hl41-b" data-hl41="plus15">+ 15 min</button><button type="button" class="hl41-b ink" data-hl41="nownow">Drar nå</button>' : ''}<button type="button" class="hl41-b" data-hl41="dismiss">Fint</button></div></div>`;
}
function text(kind) {
  const n = meName(), pl = V.place.trim();
  if (kind === 'checkin') return `${n} sjekket inn${pl ? ` · ${pl}` : ''}`;
  if (kind === 'soon') return V.soon ? `${n} drar om ca. ${V.soon >= 60 ? '1 t' : `${V.soon} min`} · ${hm(Date.now() + V.soon * 60_000)}${pl ? ` · ${pl}` : ''}` : `${n} drar snart${pl ? ` · ${pl}` : ''}`;
  if (kind === 'now') return `${n} drar nå${V.dest === 'place' && V.destName.trim() ? ` · til ${V.destName.trim()}` : ''}${pl ? ` · fra ${pl}` : ''}`;
  return '';
}

/** Fanen. famData = GET /api/family. */
export function hl41Html(famData, rp) {
  fam = famData; if (rp) repaint = rp;
  loadRec();
  if (!V.to) V.to = [];
  const body = V.step === 'who' ? whoHtml() : V.step === 'ready' ? readyHtml() : startHtml();
  return `<section class="hl41" data-hl41-root><div class="hl41-top">${GLOW}<span class="hl41-tx"><b>Hjemlys</b><span>Et lite lys som står på til du er hjemme. Si fra hvor som helst.</span></span></div>${body}</section>`;
}

async function go() {
  const k = V.kind, to = V.to.filter((id) => people().some((p) => p.userId === id));
  if (!to.length) { V.err = 'Velg minst én person.'; return repaint(); }
  V.busy = true; V.err = ''; repaint();
  if (V.remember) lsSet({ to: { ...(ls().to ?? {}), [k]: to } });
  lsSet({ recent: [...new Set([...to, ...(ls().recent ?? [])])].slice(0, 12) });
  const trip = k === 'home' || (k === 'now' && V.dest !== 'none');
  try {
    if (trip) {
      const o = V.route?.options?.[V.pick];
      const destination = V.dest === 'home' ? { name: 'Hjem', kind: 'home', ...(V.route?.to?.lat != null ? { lat: V.route.to.lat, lon: V.route.to.lon } : {}) } : { name: V.destName.trim() || 'Annet sted', kind: 'place' };
      await api('/hjemlys/start', { method: 'POST', json: { eta: etaOf().toISOString(), mode: o?.mode ?? 'manual', waitMin: V.wait, recipients: to, destination, share: { position: V.share.pos, route: V.share.pos, battery: V.share.bat, with: V.share.with } } });
      reset(); loadHjemlys(true);
    } else {
      const t = text(k), eta = k === 'soon' && V.soon ? new Date(Date.now() + V.soon * 60_000).toISOString() : undefined;
      const r = await api('/hjemlys/notice', { method: 'POST', json: { kind: API_KIND[k], ...(V.place.trim() ? { place: V.place.trim() } : {}), ...(eta ? { eta } : {}), ...(k === 'soon' ? { leaveInMin: V.soon || null } : {}), to, remember: V.remember, ...(V.note.trim() ? { note: V.note.trim() } : {}), ...(k === 'now' && V.dest === 'place' && V.destName.trim() ? { destination: { name: V.destName.trim(), kind: 'place' } } : {}) } });
      const n = r?.notice;
      V.sent = { id: n?.id ?? null, kind: k, text: n?.text ?? t, at: Date.now(), to, toNames: n?.recipients?.length ? nm(n.recipients) : nm(people().filter((p) => to.includes(p.userId))), place: V.place.trim(), eta: n?.leaveAt ?? n?.eta ?? eta };
      lsSet({ sent: V.sent });
      reset(true);
    }
  } catch (e) { V.err = e.status === 404 ? 'Serveren har ikke «Si fra» ennå. Oppdater Homelab.' : e.message; }
  V.busy = false; repaint();
}
function reset(keepSent) { V.step = 'start'; V.kind = null; V.q = ''; V.place = ''; V.note = ''; V.route = undefined; V.pick = 0; V.err = ''; V.dest = 'home'; V.destName = ''; if (!keepSent) { /* behold forrige sendt-kort */ } }

let bound = false;
export function bindHl41() {
  if (bound) return;
  bound = true;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.closest?.('[data-hl41-root]')) return;
    if (t.name === 'hl41q') { V.q = t.value; const pos = t.selectionStart; repaint(); const n = document.querySelector('[name=hl41q]'); n?.focus(); try { n?.setSelectionRange(pos, pos); } catch { /* */ } }
    if (t.name === 'hl41place') V.place = t.value;
    if (t.name === 'hl41note') V.note = t.value;
    if (t.name === 'hl41dest') V.destName = t.value;
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest?.('[data-hl41]');
    if (!b || b.disabled) return;
    e.preventDefault();
    const a = b.dataset.hl41;
    if (a === 'kind') { V.kind = b.dataset.k; V.to = defaultTo(V.kind); V.step = 'who'; V.err = ''; if (V.kind === 'home') V.dest = 'home'; if (V.kind === 'now') V.dest = 'none'; }
    else if (a === 'back') V.step = V.step === 'ready' ? 'who' : 'start';
    else if (a === 'cancel') reset();
    else if (a === 'pick') { const id = b.dataset.id; V.to = V.to.includes(id) ? V.to.filter((x) => x !== id) : [...V.to, id]; }
    else if (a === 'filt') V.filt = b.dataset.k;
    else if (a === 'remember') V.remember = !V.remember;
    else if (a === 'next') V.step = 'ready';
    else if (a === 'soon') V.soon = +b.dataset.v;
    else if (a === 'dest') { V.dest = b.dataset.v; if (V.dest !== 'home') V.route = undefined; }
    else if (a === 'route') V.pick = +b.dataset.v;
    else if (a === 'wait') V.wait = +b.dataset.v;
    else if (a === 'share') V.share[b.dataset.v] = !V.share[b.dataset.v];
    else if (a === 'go') return go();
    else if (a === 'dismiss') { V.sent = null; lsSet({ sent: null }); }
    else if (a === 'plus15' && V.sent) {
      const eta = new Date((Date.parse(V.sent.eta ?? '') || Date.now()) + 15 * 60_000);
      try {
        const r = V.sent.id ? await api(`/hjemlys/notice/${encodeURIComponent(V.sent.id)}`, { method: 'PATCH', json: { plus: 15 } }) : await api('/hjemlys/notice', { method: 'POST', json: { kind: 'leaving_soon', eta: eta.toISOString(), to: V.sent.to, ...(V.sent.place ? { place: V.sent.place } : {}) } });
        const n = r?.notice;
        V.sent = { ...V.sent, id: n?.id ?? V.sent.id, eta: n?.leaveAt ?? n?.eta ?? eta.toISOString(), at: Date.now(), text: n?.text ?? `${meName()} drar ca. ${hm(eta)}${V.sent.place ? ` · ${V.sent.place}` : ''}` }; lsSet({ sent: V.sent });
      }
      catch (er) { V.err = er.message; }
    } else if (a === 'nownow' && V.sent) { V.kind = 'now'; V.to = V.sent.to; V.place = V.sent.place ?? ''; V.dest = 'home'; V.step = 'ready'; }
    repaint();
  });
}
export const hl41Busy = () => V.step !== 'start';

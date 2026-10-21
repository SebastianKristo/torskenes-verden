// Prompt 44 (WEB44): Kalender på web.
// - DELTAKERE i detaljpanelet (claude-code-kalender-deltakere-invitasjon.md): brukere i appen som piller (GET /api/users/directory,
//   reserve /api/users), «E-post til andre» + Legg til, rader med status (Ikke sendt / Invitert / Ja / Kanskje / Nei) og ✕,
//   rød «Send invitasjon (N)» → POST /api/kalender/events/:id/invite → «✓ Sendt · send på nytt». Deltakerne lagres på hendelsen
//   (PATCH /api/kalender/events/:id {attendees:[{userId|email, name, status}]}).
// - «Sted eller adresse» med forslag (geo44.js) i Ny/Rediger hendelse; koordinatene lagres (geo:{lat, lon}).
// - Media-kalenderen: status fra Media og «Åpne i Media» i detaljpanelet.
// - I dag-ikonet (claude-code-kalender-idag-ikon.md): ramme, rød topp, dagens tall midtstilt. Oppdateres ved midnatt.
import { esc, initials } from './util.js';
import { store } from './store.js';
import { attachGeo } from './geo44.js';

const A = { id: null, list: [], add: '', err: '', busy: false, sent: false, dir: null, dirAt: 0 };
const ST = { invited: 'Invitert', accepted: 'Ja', declined: 'Nei', tentative: 'Kanskje', maybe: 'Kanskje', pending: 'Ikke sendt', none: 'Ikke sendt' };
const stCls = (s) => (s === 'accepted' ? 'ok' : s === 'declined' ? 'bad' : s === 'tentative' || s === 'maybe' ? 'warn' : s === 'invited' ? 'inv' : '');
const mail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim());
let ctx = null; // {K, paint, ensureKal, flash}
export function initKal44(c) { ctx = c; }

function loadDir() {
  if (A.dir && Date.now() - A.dirAt < 5 * 60_000) return;
  A.dirAt = Date.now(); A.dir = A.dir ?? [];
  fetch('/api/users/directory', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((j) => { A.dir = (Array.isArray(j) ? j : j?.users ?? []).map(uOut); ctx?.paint(); })
    .catch(() => fetch('/api/users', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => { A.dir = (j?.users ?? []).map(uOut); ctx?.paint(); }).catch(() => {}));
}
const uOut = (u) => ({ id: u.id ?? u.userId, name: u.name || u.username || '', email: u.email ?? '', color: u.color ?? null });
const me = () => store.me?.me ?? {};
function sync(e) {
  const id = e.oid || e.id;
  if (A.id === id) return;
  A.id = id; A.add = ''; A.err = ''; A.sent = false;
  A.list = (Array.isArray(e.att) ? e.att : []).map((x) => ({ userId: x.userId ?? null, email: x.email ?? '', name: x.name ?? '', status: x.status ?? 'invited' }));
}

/** Ekstra i detaljpanelet (før VARSEL): Media-status og DELTAKERE. */
export function detailExtra(e) {
  let out = '';
  if (e.med) {
    const s = e.med, pct = Number.isFinite(+s.progress) ? Math.round(+s.progress) : null;
    const st = s.statusText || { downloaded: 'Lastet ned', downloading: `Lastes ned${pct != null ? ` ${pct} %` : ''}`, missing: 'Mangler', queued: 'Venter', unmonitored: 'Ikke overvåket' }[s.status] || '';
    out += `<div class="k44-med"><span class="k2-lab">MEDIA</span><div class="k44-medr"><span class="k44-pill ${/lastet ned|downloaded/i.test(st) ? 'ok' : /lastes|downloading/i.test(st) ? 'bad' : 'warn'}">${esc(st || 'Kommer')}</span>${s.code ? `<span class="k44-mut mono">${esc(s.code)}</span>` : ''}${s.ep ? `<span class="k44-mut">${esc(s.ep)}</span>` : ''}</div><a class="k2-b ink k44-open" href="${esc(s.href)}">Åpne i Media ›</a></div>`;
  }
  if (!e.editable) return out;
  sync(e); loadDir();
  const mine = me().id, users = (A.dir ?? []).filter((u) => u.id && u.id !== mine);
  const onU = new Set(A.list.filter((x) => x.userId).map((x) => x.userId));
  const ext = A.list.filter((x) => !x.userId);
  const nSend = A.list.filter((x) => x.status !== 'accepted' && x.status !== 'declined').length;
  const from = me().email || 'e-postadressen din';
  out += `<div class="k44-att" data-k44-att><span class="k2-lab">DELTAKERE</span>
    ${users.length ? `<div class="k44-ppl">${users.map((u) => { const on = onU.has(u.id); const st = A.list.find((x) => x.userId === u.id)?.status; return `<button type="button" class="k44-u${on ? ' on' : ''}" data-k44-u="${esc(u.id)}" aria-pressed="${on}"><span class="k44-av"${u.color ? ` style="background:${esc(u.color)}"` : ''}>${on ? '✓' : esc(initials(u.name))}</span>${esc(u.name)}${on && st && st !== 'invited' ? `<em class="${stCls(st)}">${esc(ST[st] ?? st)}</em>` : ''}</button>`; }).join('')}</div>` : ''}
    <form class="k44-mail" data-k44-mail><input name="k44mail" type="email" value="${esc(A.add)}" placeholder="E-post til andre" autocomplete="email" aria-label="E-post til andre" data-glimt="off"><button type="submit" class="k2-b line">Legg til</button></form>
    ${A.err ? `<span class="k2-err">${esc(A.err)}</span>` : ''}
    ${ext.map((x) => `<div class="k44-ext"><span class="k44-av ext">${esc((x.email || '?').slice(0, 1).toUpperCase())}</span><span class="k44-em">${esc(x.email)}</span><span class="k44-st ${stCls(x.status)}">${esc(ST[x.status] ?? x.status)}</span><button type="button" class="k44-x" data-k44-rm="${esc(x.email)}" aria-label="Fjern ${esc(x.email)}">✕</button></div>`).join('')}
    <span class="k2-src">Brukere i appen får hendelsen i sin kalender. Andre får en vanlig e-post med invitasjon (.ics) sendt fra ${esc(from)} (Gmail eller SMTP under Integrasjoner).</span>
    ${A.list.length ? `<button type="button" class="k2-b red k44-send" data-k44-send ${A.busy ? 'disabled' : ''}>${A.busy ? 'Sender …' : A.sent ? '✓ Sendt · send på nytt' : `Send invitasjon (${nSend || A.list.length})`}</button>` : ''}</div>`;
  return out;
}

async function save(e) {
  const id = A.id; if (!id) return false;
  try {
    const r = await fetch(`/api/kalender/events/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendees: A.list }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); A.err = j.error || `Kunne ikke lagre deltakerne (feil ${r.status}).`; return false; }
    if (e) e.att = A.list.map((x) => ({ ...x }));
    return true;
  } catch (er) { A.err = er.message; return false; }
}
/** Klikk i detaljpanelet. Returnerer true når det er håndtert. */
export async function click44(ev, e) {
  const t = ev.target, x = (s) => t.closest(s); let b;
  if (!x('[data-k44-att]') || !e) return false;
  if ((b = x('[data-k44-u]'))) {
    const u = (A.dir ?? []).find((y) => String(y.id) === b.dataset.k44U); if (!u) return true;
    const i = A.list.findIndex((y) => y.userId === u.id);
    if (i >= 0) A.list.splice(i, 1); else A.list.push({ userId: u.id, name: u.name, email: u.email, status: 'invited' });
    A.sent = false; A.err = ''; ctx.paint(); await save(e); ctx.paint(); return true;
  }
  if ((b = x('[data-k44-rm]'))) { A.list = A.list.filter((y) => y.userId || y.email !== b.dataset.k44Rm); A.sent = false; ctx.paint(); await save(e); ctx.paint(); return true; }
  if (x('[data-k44-send]')) {
    A.busy = true; A.err = ''; ctx.paint();
    try {
      if (!(await save(e))) throw new Error(A.err || 'Kunne ikke lagre deltakerne.');
      const r = await fetch(`/api/kalender/events/${encodeURIComponent(A.id)}/invite`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendees: A.list }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 404 ? 'Serveren kan ikke sende invitasjoner ennå.' : j.error || `Feil ${r.status}`);
      const back = Array.isArray(j.attendees) ? j.attendees : null;
      if (back) A.list = back.map((y) => ({ userId: y.userId ?? null, email: y.email ?? '', name: y.name ?? '', status: y.status ?? 'invited' }));
      else A.list.forEach((y) => { if (!y.status || y.status === 'pending' || y.status === 'none') y.status = 'invited'; });
      A.sent = true; e.att = A.list.map((y) => ({ ...y }));
      ctx.flash(`Invitasjon sendt til ${Array.isArray(j.sent) ? j.sent.length : j.sent ?? A.list.length}${j.failed?.length ? ` · ${j.failed.length} feilet` : ''}`);
    } catch (er) { A.err = er.message; }
    A.busy = false; ctx.paint(); return true;
  }
  return false;
}
export async function submit44(ev, e) {
  if (!ev.target.matches?.('[data-k44-mail]')) return false;
  ev.preventDefault();
  const v = (ev.target.querySelector('[name="k44mail"]')?.value ?? A.add).trim().toLowerCase();
  if (!mail(v)) { A.err = 'Skriv en gyldig e-postadresse.'; ctx.paint(); return true; }
  if (A.list.some((y) => (y.email || '').toLowerCase() === v)) { A.err = 'Den adressen er allerede lagt til.'; ctx.paint(); return true; }
  const u = (A.dir ?? []).find((y) => (y.email || '').toLowerCase() === v);
  A.list.push(u ? { userId: u.id, name: u.name, email: u.email, status: 'invited' } : { userId: null, email: v, name: '', status: 'none' });
  A.add = ''; A.err = ''; A.sent = false; ctx.paint(); await save(e); ctx.paint();
  ctx.host()?.querySelector('[name="k44mail"]')?.focus();
  return true;
}
export function input44(ev) { if (ev.target.name === 'k44mail') { A.add = ev.target.value; return true; } return false; }

/** Etter hver tegning: adresseforslag i skjemaet. */
export function afterPaint(h) {
  const loc = h.querySelector('[data-k-form] [name="location"]');
  if (loc) attachGeo(loc, (g) => { if (ctx.K.form) { ctx.K.form.r = g.label; ctx.K.form.geo = Number.isFinite(g.lat) ? { lat: g.lat, lon: g.lon } : null; ctx.K.form.geoLabel = g.label; } });
  const f = h.querySelector('[data-k44-mail] input'); if (f && document.activeElement?.name !== 'k44mail' && A.focusMail) { f.focus(); A.focusMail = false; }
}

/** I dag-ikonet: ramme (6 px hjørner, 1,8 px strek), rød topp 6 px, tallet midtstilt under. */
export function todayIcon(n = new Date().getDate()) {
  return `<svg class="k44-today" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="k44tc"><rect x="1.9" y="1.9" width="20.2" height="20.2" rx="6"/></clipPath></defs><rect x="1.9" y="1.9" width="20.2" height="6" fill="#b23a2a" clip-path="url(#k44tc)"/><rect x="1.9" y="1.9" width="20.2" height="20.2" rx="6" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="18.6" text-anchor="middle" font-family="Manrope,system-ui,sans-serif" font-weight="800" font-size="10.5" fill="currentColor">${n}</text></svg>`;
}
let midT = 0;
export function scheduleMidnight(paint) {
  clearTimeout(midT);
  const n = new Date(), m = new Date(n); m.setHours(24, 0, 5, 0);
  midT = setTimeout(() => { paint(); scheduleMidnight(paint); }, m - n);
}
export function after44() { /* koblet inn fra kalender.js */ }

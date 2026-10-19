// Prompt 37 (claude-code-onboarding-profil.md, fasit Onboarding.dc.html, web-variant): koble den innloggede brukeren til en profil.
// Bruker = innlogging. Profil = personen i husstanden (navn, farge, posisjon, delte lister og abonnementer, kalendere, helse).
// Web: steg 1 (innlogging) er /login. Etter innlogging, når brukeren ikke har profil, vises steg 2–4 som et kort (maks 440 px):
//   2 «Hvem er du?» (✦ Glimt foreslår profilen med samme navn, koblede profiler er dempet, «Jeg er ny i husstanden»)
//   3 «Dette kobles til deg» (samtykker) → POST /api/onboarding/link {profileId | newProfileName, consents} (409 = koblet til en annen)
//   4 «Hei, Ingrid!» → Gå til Hjem.
// GET /api/profiles → {profiles:[{id, name, color, avatar, initials, userId, username, has:{location, lists, subs}, suggested, linkedToOther, mine}],
//   me:{profileId, userId, username, name}, locked, adminLinked}. Eldre server (404): ingenting vises.
// Innstillinger → Konto → «Profil i husstanden» åpner det samme (data-onb37).
import { api, esc } from './util.js';
import { store } from './store.js';

const O = { d: null, step: 2, pick: null, isNew: false, newName: '', cons: { location: true, lists: true, subs: true, calendars: true, health: false }, err: '', busy: false, done: null, el: null };
const skipKey = () => `onb37_skip_${store.me?.me?.id ?? 'x'}`;
const PAL = ['#2b5d8a', '#b23a2a', '#a8661a', '#2f6b45', '#7a5ad6', '#c2477a', '#3d7f8a', '#5b4fc4'];
const colOf = (p, i = 0) => p?.color || PAL[i % PAL.length];
const ini = (p) => p?.initials || String(p?.name ?? '?').trim().slice(0, 1).toUpperCase();

/** Profilen brukeren er koblet til (null før data / uten profil). */
export const myProfile = () => { const id = O.d?.me?.profileId; return id ? O.d.profiles.find((p) => p.id === id) ?? null : null; };
export const profilesLoaded = () => !!O.tried;
export const hasProfiles = () => !!O.d?.profiles;

export async function loadProfiles() {
  try { O.d = await api('/profiles'); } catch { O.d = null; }
  O.tried = true;
  return O.d;
}

/** Kalles ved oppstart: viser onboarding hvis brukeren ikke har profil (og ikke har valgt «Senere» på denne enheten). */
export async function maybeOnboard() {
  const d = await loadProfiles();
  if (!d || d.me?.profileId || !d.profiles?.length) return;
  let skip = false; try { skip = sessionStorage.getItem(skipKey()) === '1' || localStorage.getItem(skipKey()) === String(new Date().toLocaleDateString('sv-SE')); } catch { /* */ }
  if (skip) return;
  open();
}
export async function openOnboarding() { if (!O.d) await loadProfiles(); if (!O.d) return; open(); }

function open() {
  const d = O.d;
  O.step = 2; O.err = ''; O.busy = false; O.done = null; O.isNew = false; O.newName = '';
  const sug = d.profiles.find((p) => p.id === d.me?.profileId) ?? d.profiles.find((p) => p.suggested && !p.linkedToOther) ?? null;
  O.pick = sug?.id ?? null;
  if (!O.el) {
    O.el = document.createElement('div'); O.el.className = 'onb37'; O.el.setAttribute('role', 'dialog'); O.el.setAttribute('aria-modal', 'true'); O.el.setAttribute('aria-label', 'Koble til profil');
    document.body.appendChild(O.el); bind(O.el);
  }
  paint();
  setTimeout(() => O.el?.querySelector('.onb37-main')?.focus(), 30);
}
function close() { O.el?.remove(); O.el = null; }

const ICON = {
  location: ['M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5', '#2f6b45', 'Posisjon og Familie-kart', 'Del posisjonen din med husstanden'],
  lists: ['M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2', '#b23a2a', 'Gjøremål', 'Delte lister'],
  subs: ['M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', '#a8661a', 'Delte abonnementer', 'Abonnementer du deler med andre'],
  calendars: ['M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', '#2b5d8a', 'Kalendere', 'Familie og felles kalender'],
  health: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', '#c2477a', 'Helse', 'Apple Health / Health Connect i appen (av som standard)'],
};
function hasLine(p) {
  const h = p.has ?? {}, bits = [];
  if (h.location) bits.push('Posisjon');
  if (h.lists) bits.push(typeof h.lists === 'number' ? `${h.lists} delte ${h.lists === 1 ? 'liste' : 'lister'}` : Array.isArray(h.lists) ? `Gjøremål i ${h.lists.join(', ')}` : 'Delte lister');
  if (h.subs) bits.push(Array.isArray(h.subs) ? h.subs.join(', ') : typeof h.subs === 'number' ? `${h.subs} abonnement${h.subs === 1 ? '' : 'er'}` : String(h.subs) === 'true' ? 'Abonnementer' : String(h.subs));
  return bits.join(' · ') || 'Ny profil';
}
const sw = (on, k) => `<button type="button" class="onb37-sw${on ? ' on' : ''}" data-onb-c="${k}" role="switch" aria-checked="${on}" aria-label="${esc(ICON[k][2])}"><i></i></button>`;
const dots = () => `<span class="onb37-dots" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i === O.step ? 'on' : i < O.step ? 'past' : ''}"></i>`).join('')}</span>`;
const userName = () => O.d?.me?.username ?? store.me?.me?.username ?? '';

function stepWho() {
  const d = O.d, me = d.me ?? {};
  if (d.locked && !d.adminLinked) {
    return `<span class="onb37-k">STEG 2 AV 3</span><h2>Hvem er du?</h2><p>Admin kobler brukere til profiler i denne husstanden. Be admin koble <b>@${esc(userName())}</b> til riktig profil under Innstillinger → Brukere.</p>
      <div class="onb37-foot"><button type="button" class="onb37-pri" data-onb="later">Lukk</button></div>`;
  }
  if (d.adminLinked) {
    const p = d.profiles.find((x) => x.id === me.profileId || x.id === d.adminLinked?.profileId || x.id === d.adminLinked) ?? d.profiles.find((x) => x.id === O.pick);
    return `<span class="onb37-k">STEG 2 AV 3</span><h2>Hvem er du?</h2><p>Admin har koblet deg til <b>${esc(p?.name ?? 'profilen')}</b>.</p>
      ${p ? `<div class="onb37-pcard"><span class="onb37-av" style="background:${esc(colOf(p))}">${esc(ini(p))}</span><span class="onb37-pt"><b>${esc(p.name)}</b><small>${esc(hasLine(p))}</small></span></div>` : ''}
      <div class="onb37-foot"><button type="button" class="onb37-pri" data-onb="next">Bekreft</button></div>`;
  }
  const sug = d.profiles.find((p) => p.suggested && !p.linkedToOther);
  const rows = d.profiles.map((p, i) => {
    const dim = p.linkedToOther && !p.mine, on = !O.isNew && O.pick === p.id;
    return `<button type="button" class="onb37-p${on ? ' on' : ''}${dim ? ' dim' : ''}" data-onb-p="${esc(p.id)}"${dim ? ' disabled' : ''} aria-pressed="${on}"><span class="onb37-av" style="background:${esc(colOf(p, i))}">${esc(ini(p))}</span><span class="onb37-pt"><b>${esc(p.name)}</b><small>${esc(dim ? `Koblet til @${p.username ?? 'en annen'}` : hasLine(p))}</small></span><span class="onb37-rad">${on ? '✓' : ''}</span></button>`;
  }).join('');
  return `<span class="onb37-k">STEG 2 AV 3</span><h2>Hvem er du?</h2><p>Koble brukeren <b>@${esc(userName())}</b> til en profil. Profilen har posisjon, gjøremål, delte abonnementer og kalendere som allerede finnes.</p>
    ${sug ? `<div class="onb37-sug"><span>✦</span>Glimt tror du er <b>${esc(sug.name)}</b> (samme navn som brukeren).</div>` : ''}
    <div class="onb37-list">${rows}
      <button type="button" class="onb37-p new${O.isNew ? ' on' : ''}" data-onb="new" aria-pressed="${O.isNew}"><span class="onb37-av plus">+</span><span class="onb37-pt"><b>Jeg er ny i husstanden</b><small>Lag en ny profil for meg</small></span></button>
      ${O.isNew ? `<input class="onb37-in" data-onb-name value="${esc(O.newName)}" placeholder="Navnet ditt" maxlength="40" aria-label="Navnet ditt">` : ''}</div>
    ${O.err ? `<span class="onb37-err" role="alert">${esc(O.err)}</span>` : ''}
    <div class="onb37-foot"><button type="button" class="onb37-pri" data-onb="next"${(O.isNew ? O.newName.trim() : O.pick) ? '' : ' disabled'}>${O.isNew ? 'Lag profil' : 'Dette er meg'}</button><button type="button" class="onb37-sec" data-onb="later">Senere</button></div>`;
}
function stepLink() {
  const p = O.isNew ? { name: O.newName.trim(), color: PAL[(O.d.profiles.length) % PAL.length] } : O.d.profiles.find((x) => x.id === O.pick);
  const has = p?.has ?? {};
  const sub = { lists: Array.isArray(has.lists) ? `Delte lister: ${has.lists.join(', ')}` : ICON.lists[3], subs: Array.isArray(has.subs) ? has.subs.join(' · ') : typeof has.subs === 'string' ? has.subs : ICON.subs[3] };
  return `<span class="onb37-k">STEG 3 AV 3</span><h2>Dette kobles til deg</h2>
    <div class="onb37-pcard"><span class="onb37-av" style="background:${esc(colOf(p))}">${esc(ini(p))}</span><span class="onb37-pt"><b>${esc(p?.name ?? '')}</b><small class="mono">@${esc(userName())} ⟷ profil</small></span></div>
    <div class="onb37-cons">${Object.keys(ICON).map((k) => { const [d, c, t, s] = ICON[k]; return `<div class="onb37-c"><span class="onb37-ib" style="--c:${c}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg></span><span class="onb37-pt"><b>${t}</b><small>${esc(sub[k] ?? s)}</small></span>${sw(!!O.cons[k], k)}</div>`; }).join('')}</div>
    <p class="onb37-hint">Du kan endre koblingen senere i Innstillinger → Konto → Profil. Admin får beskjed om nye koblinger.</p>
    ${O.err ? `<span class="onb37-err" role="alert">${esc(O.err)}</span>` : ''}
    <div class="onb37-foot"><button type="button" class="onb37-pri" data-onb="link"${O.busy ? ' disabled' : ''}>${O.busy ? 'Kobler …' : 'Koble og fortsett'}</button></div>`;
}
function stepDone() {
  const p = O.done ?? {};
  const bits = [O.cons.location ? 'posisjon i Familie' : null, O.cons.lists ? 'delte gjøremålslister' : null, O.cons.subs ? 'delte abonnementer' : null, O.cons.calendars ? 'kalendere' : null].filter(Boolean);
  return `<div class="onb37-fin"><span class="onb37-av big" style="background:${esc(colOf(p))}">${esc(ini(p))}</span><h2>Hei, ${esc(String(p.name ?? '').split(' ')[0])}!</h2>
    <p>Du er nå koblet til profilen <b>${esc(p.name ?? '')}</b>${bits.length ? ` med ${esc(bits.length < 2 ? bits[0] : `${bits.slice(0, -1).join(', ')} og ${bits.at(-1)}`)}` : ''}.</p></div>
    <div class="onb37-foot"><button type="button" class="onb37-pri" data-onb="home">Gå til Hjem</button></div>`;
}
function paint() {
  if (!O.el) return;
  const body = O.step === 2 ? stepWho() : O.step === 3 ? stepLink() : stepDone();
  O.el.innerHTML = `<div class="onb37-card"><div class="onb37-top">${O.step === 3 ? '<button type="button" class="onb37-back" data-onb="back" aria-label="Tilbake">‹</button>' : '<span></span>'}${dots()}<span></span></div><div class="onb37-main" tabindex="-1">${body}</div></div>`;
  if (O.isNew && O.step === 2) { const i = O.el.querySelector('[data-onb-name]'); if (i && document.activeElement !== i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function bind(el) {
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.onbP) { O.pick = b.dataset.onbP; O.isNew = false; O.err = ''; return paint(); }
    if (b.dataset.onbC) { const k = b.dataset.onbC; O.cons[k] = !O.cons[k]; return paint(); }
    const a = b.dataset.onb;
    if (a === 'new') { O.isNew = !O.isNew; O.err = ''; return paint(); }
    if (a === 'later') { try { sessionStorage.setItem(skipKey(), '1'); } catch { /* */ } return close(); }
    if (a === 'back') { O.step = 2; O.err = ''; return paint(); }
    if (a === 'next') { if (O.d.adminLinked && !O.pick) O.pick = O.d.me?.profileId ?? O.pick; O.step = 3; O.err = ''; return paint(); }
    if (a === 'link') {
      O.busy = true; O.err = ''; paint();
      try {
        const r = await api('/onboarding/link', { method: 'POST', json: { ...(O.isNew ? { newProfileName: O.newName.trim() } : { profileId: O.pick }), consents: { ...O.cons } } });
        O.done = r.profile ?? { name: O.isNew ? O.newName.trim() : O.d.profiles.find((x) => x.id === O.pick)?.name };
        O.step = 4; O.busy = false;
        await loadProfiles();
        document.dispatchEvent(new Event('hl:name'));
      } catch (er) {
        O.busy = false;
        O.err = er.status === 409 ? 'Profilen er allerede koblet til en annen bruker. Velg en annen, eller be admin hjelpe deg.' : er.status === 403 ? 'Bare admin kan koble profiler i denne husstanden.' : er.message;
        if (er.status === 409) { O.step = 2; await loadProfiles(); }
      }
      return paint();
    }
    if (a === 'home') { close(); if (!/^#\/dash/.test(location.hash)) location.hash = '#/dash'; }
  });
  el.addEventListener('input', (e) => { if (e.target.matches('[data-onb-name]')) { O.newName = e.target.value; const btn = el.querySelector('[data-onb="next"]'); if (btn) btn.disabled = !O.newName.trim(); } });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (O.step === 4) close(); else { try { sessionStorage.setItem(skipKey(), '1'); } catch { /* */ } close(); } }
    if (e.key === 'Enter' && e.target.matches('[data-onb-name]') && O.newName.trim()) { O.step = 3; paint(); }
  });
}
// Innstillinger → Konto → Profil i husstanden.
document.addEventListener('click', (e) => { if (e.target.closest?.('[data-onb37]')) { e.preventDefault(); openOnboarding(); } }, true);

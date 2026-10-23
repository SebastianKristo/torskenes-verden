// Prompt 44 (claude-code-gjoremal-deloppgaver.md, claude-code-gjoremal-infoside.md, claude-code-gjoremal-synk-i-innstillinger.md)
// Gjøremål på web. Fasit: design/Huskeliste.dc.html (web-grenen, vw.web).
// - Lista: ↳+ på hver oppgave åpner «Ny deloppgave …» rett under (Enter legger til og feltet blir stående). Deloppgaver vises
//   innrykket (38 px) med egen avkrysning i listens farge og ✕. Alle krysset av → «Fullfør «X» også?».
// - Trykk på en oppgave åpner et panel fra høyre (920 px): ✕ · GJØREMÅL · ☆ Flagg · Dupliser · Slett. Venstre: avkrysning +
//   tittel (redigeres direkte), DETALJER, DELOPPGAVER, STED med forslag og kart. Høyre (300): Fullfør, LISTE, FRIST, NÅR,
//   øvrige felt og «Gjentakelse, påminnelse og mer …» (redigeringsarket). Esc lukker, ⌘/Ctrl+Enter fullfører, ↑/↓ bytter oppgave.
// - Synk med Home Assistant er flyttet til Innstillinger → Gjøremål; i lista står en rad som åpner den.
// Felter: frist = dl (siste dag), når = due + time, sted = pl + geo {lat, lon}. Lagres fortløpende (PATCH /api/tasks/:id).
import { esc } from './util.js';
import { attachGeo, geoSearch, miniMap, mapLinks } from './geo44.js';

let C = null; // kontekst fra tasks.js: {S, patchItem, tick, del, paint, createItem, flash, colorOf, listOf, tList, tTitle, tNotes, tWho, nameOf, people, REP, EARLY, PRIO, PLACE, openEd, today}
export function setup44(ctx) { C = ctx; }
const P = { id: null, subV: '', addFor: null, addV: '', geoTried: new Set() };
const cur = () => (P.id == null ? null : C.S.d?.items.find((x) => String(x.id) === String(P.id)) ?? C.S.arch.find((x) => String(x.id) === String(P.id)));
const plOf = (t) => t?.pl ?? t?.geo?.label ?? t?.placeName ?? ''; // SERVER44 lagrer stedsteksten i geo.label
const subsOf = (t) => (Array.isArray(t?.subs) ? t.subs : []);
const fmtDay = (iso) => { if (!iso) return ''; const d = new Date(`${String(iso).slice(0, 10)}T12:00`); return Number.isNaN(+d) ? '' : d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase()); };

/* ---------------- Lista: ↳+ og innrykkede deloppgaver ---------------- */
export function subBtn(t) { return `<button type="button" class="tk44-subadd" data-tk44-subfor="${esc(t.id)}" aria-label="Legg til deloppgave i ${esc(C.tTitle(t))}" title="Legg til deloppgave">↳+</button>`; }
export function subRows(t) {
  const subs = subsOf(t), c = C.colorOf(C.tList(t)), open = String(P.addFor) === String(t.id);
  if (!subs.length && !open) return '';
  return `<div class="tk44-subs" style="--c:${esc(c)}">${subs.map((x, i) => `<div class="tk44-sr${x.done ? ' done' : ''}"><button type="button" class="tk44-sc${x.done ? ' on' : ''}" data-tk44-st="${esc(t.id)}:${i}" aria-pressed="${!!x.done}" aria-label="${x.done ? 'Ikke ferdig' : 'Fullfør'}: ${esc(x.n ?? '')}">${x.done ? '✓' : ''}</button><span>${esc(x.n ?? x.title ?? '')}</span><button type="button" class="tk44-sx" data-tk44-sx="${esc(t.id)}:${i}" aria-label="Fjern deloppgave">✕</button></div>`).join('')}
    ${open ? `<form class="tk44-sr add" data-tk44-addform="${esc(t.id)}"><span class="tk44-sc dash"></span><input name="tk44sub" value="${esc(P.addV)}" placeholder="Ny deloppgave …" maxlength="120" autocomplete="off" aria-label="Ny deloppgave" data-glimt="off"><button type="submit" class="tk44-sadd">Legg til</button></form>` : ''}</div>`;
}
/** Raden som erstatter HA-kortet i sidemenyen. */
export function haRow() {
  return `<button type="button" class="tk44-ha" data-tk44-ha><span aria-hidden="true">⇄</span><span><b>Synk med Home Assistant</b><span>Endres i Innstillinger → Gjøremål ›</span></span></button>`;
}

/* ---------------- Panelet fra høyre ---------------- */
export const panelOpen = () => P.id != null && !!cur();
export function openPanel(id) { P.id = String(id); P.subV = ''; paintPanel(); }
export function closePanel() { if (P.id == null) return; P.id = null; paintPanel(); }
let host = null;
function panelHtml() {
  const t = cur(); if (!t) return '';
  const S = C.S, l = C.listOf(C.tList(t)), c = C.colorOf(C.tList(t)), subs = subsOf(t), done = subs.filter((x) => x.done).length;
  const today = C.today(), dl = t.dl ?? '', overdue = dl && dl < today && !t.done;
  const rows = [
    ['GJENTAS', C.REP.find((r) => r[0] === (t.rep ?? 'none'))?.[1] ?? 'Aldri'],
    ['PÅMINNELSE', [t.early && t.early !== 'none' ? C.EARLY.find((r) => r[0] === t.early)?.[1] : '', t.place ? C.PLACE.find((r) => r[0] === t.place)?.[1] : '', t.urgent ? 'Viktig (alarm)' : ''].filter(Boolean).join(' · ') || 'Ingen'],
    ['ANSVARLIG', C.tWho(t) ? C.nameOf(C.tWho(t)) || 'Ukjent' : 'Ingen'],
    ['PRIORITET', C.PRIO.find((r) => r[0] === (+t.prio || 0))?.[1] ?? 'Ingen'],
    ...(t.wait ? [['VENTER PÅ', t.wait]] : []),
    ...((t.tags ?? []).length ? [['TAGGER', t.tags.map((x) => `#${x}`).join(' ')]] : []),
  ];
  const geo = t.geo && Number.isFinite(+t.geo.lat) ? t.geo : null;
  return `<div class="tk44-scrim" data-tk44-close></div><aside class="tk44-pan" role="dialog" aria-modal="true" aria-label="Gjøremål: ${esc(C.tTitle(t))}" style="--c:${esc(c)}">
    <div class="tk44-ph"><button type="button" class="tk44-rb" data-tk44-close aria-label="Lukk">✕</button><span class="tk44-k">GJØREMÅL</span><span class="tk44-sp"></span>
      <button type="button" class="tk44-pb${t.flag ? ' on' : ''}" data-tk44="flag" aria-pressed="${!!t.flag}"><span>${t.flag ? '★' : '☆'}</span>${t.flag ? 'Flagget' : 'Flagg'}</button><button type="button" class="tk44-pb" data-tk44="dup">Dupliser</button><button type="button" class="tk44-pb red" data-tk44="del">Slett</button></div>
    <div class="tk44-pg"><div class="tk44-pl">
      <div class="tk44-tt"><button type="button" class="tk44-ck${t.done ? ' on' : ''}" data-tk44="done" aria-label="${t.done ? 'Marker som ikke fullført' : 'Marker som fullført'}" aria-pressed="${!!t.done}">${t.done ? '✓' : ''}</button><textarea class="tk44-ti${t.done ? ' done' : ''}" data-tk44f="title" rows="1" maxlength="200" aria-label="Tittel" data-glimt="off">${esc(C.tTitle(t))}</textarea></div>
      <div class="tk44-blk"><span class="tk44-k">DETALJER</span><textarea class="tk44-no" data-tk44f="notes" rows="4" placeholder="Skriv notater, lenker eller hva som skal huskes …" aria-label="Detaljer" data-glimt="off">${esc(C.tNotes(t))}</textarea></div>
      <div class="tk44-blk"><div class="tk44-bh"><span class="tk44-k">DELOPPGAVER</span>${subs.length ? `<span class="tk44-k">${done} AV ${subs.length}</span>` : ''}</div>${subs.length ? `<span class="tk44-prog"><i style="width:${Math.round((done / subs.length) * 100)}%"></i></span>` : ''}
        <div class="tk44-card">${subs.map((x, i) => `<div class="tk44-psr"><button type="button" class="tk44-sc${x.done ? ' on' : ''}" data-tk44-st="${esc(t.id)}:${i}" aria-pressed="${!!x.done}" aria-label="Fullfør deloppgave">${x.done ? '✓' : ''}</button><span class="${x.done ? 'done' : ''}">${esc(x.n ?? '')}</span><button type="button" class="tk44-sx" data-tk44-sx="${esc(t.id)}:${i}" aria-label="Fjern">✕</button></div>`).join('')}
          <form class="tk44-psr add" data-tk44-psub><span class="tk44-sc dash"></span><input name="tk44psub" value="${esc(P.subV)}" placeholder="Legg til deloppgave og trykk Enter" maxlength="120" autocomplete="off" aria-label="Ny deloppgave" data-glimt="off"></form></div></div>
      <div class="tk44-card tk44-pl2"><div class="tk44-plh"><span class="tk44-k">STED</span><div class="tk44-plr"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b23a2a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg><input data-tk44f="pl" value="${esc(plOf(t))}" placeholder="Legg til sted eller adresse" aria-label="Sted eller adresse">${plOf(t) ? '<button type="button" class="tk44-sx" data-tk44="plclr" aria-label="Fjern sted">✕</button>' : ''}</div></div>
        ${geo ? `<div class="tk44-map" data-tk44-map></div><div class="tk44-mapb">${mapLinks({ ...geo, label: plOf(t) })}</div>` : plOf(t) && !P.geoTried.has(`${t.id}|${plOf(t)}`) ? '<span class="tk44-mut tk44-pad">Finner stedet på kartet …</span>' : ''}</div>
    </div><div class="tk44-pr">
      <button type="button" class="tk44-done" data-tk44="done">${busy46 ? '✓ Fullført' : t.done ? 'Marker som ikke fullført' : 'Fullfør oppgaven'}</button>
      <div class="tk44-f"><span class="tk44-k">LISTE</span><div class="tk44-lists">${(S.d.lists ?? []).map((x) => `<button type="button" class="tk44-lp${x.id === C.tList(t) ? ' on' : ''}" data-tk44-list="${esc(x.id)}" aria-pressed="${x.id === C.tList(t)}"><span style="background:${esc(x.color)}"></span>${esc(x.name)}${x.id === C.tList(t) ? ' ✓' : ''}</button>`).join('')}</div></div>
      <div class="tk44-f"><span class="tk44-k">FRIST</span><div class="tk44-fr"><input type="date" class="tk44-in${overdue ? ' bad' : ''}" data-tk44f="dl" value="${esc(dl)}" aria-label="Frist">${dl ? '<button type="button" class="tk44-sx" data-tk44="dlclr" aria-label="Fjern frist">✕</button>' : ''}</div><span class="tk44-mut${overdue ? ' bad' : ''}">${dl ? `Frist: ${esc(fmtDay(dl))}${overdue ? ' · forfalt' : ''}` : 'Siste dag oppgaven må være gjort'}</span></div>
      <div class="tk44-f"><span class="tk44-k">NÅR</span><div class="tk44-fr"><input type="date" class="tk44-in" data-tk44f="due" value="${esc(t.due ?? '')}" aria-label="Dato"><input type="time" class="tk44-in tm" data-tk44f="time" value="${esc(t.time ?? '')}" aria-label="Klokkeslett">${t.due || t.time ? '<button type="button" class="tk44-sx" data-tk44="dueclr" aria-label="Fjern dato og tid">✕</button>' : ''}</div><span class="tk44-mut">${t.due ? esc(fmtDay(t.due)) : 'Når du planlegger å gjøre det'}</span></div>
      ${rows.map(([a, b]) => `<div class="tk44-f"><span class="tk44-k">${a}</span><b>${esc(b)}</b></div>`).join('')}
      <button type="button" class="tk44-more" data-tk44="edit">Gjentakelse, påminnelse og mer …</button>
      <span class="tk44-mut tk44-keys">Esc lukker · ⌘/Ctrl+Enter fullfører · ↑↓ bytter oppgave</span>
    </div></div></aside>`;
}
function paintPanel() {
  const html = panelOpen() ? panelHtml() : '';
  if (!html) { if (host) { host.remove(); host = null; document.body.classList.remove('tk44-open'); document.dispatchEvent(new CustomEvent('huske-sheet', { detail: { open: false } })); } return; }
  const first = !host;
  if (!host) { host = document.createElement('div'); host.className = 'tk44-host'; document.body.appendChild(host); bindPanel(host); document.body.classList.add('tk44-open'); document.dispatchEvent(new CustomEvent('huske-sheet', { detail: { open: true } })); }
  const a = document.activeElement, keep = a && host.contains(a) ? { f: a.dataset.tk44f, n: a.name, pos: a.selectionStart } : null, sc = host.querySelector('.tk44-pl')?.scrollTop ?? 0;
  const oldMap = host.querySelector('[data-tk44-map]');
  host.innerHTML = html;
  const pl = host.querySelector('.tk44-pl'); if (pl) pl.scrollTop = sc;
  const t = cur();
  const mapEl = host.querySelector('[data-tk44-map]');
  if (mapEl && t?.geo) { if (oldMap?._map && oldMap.dataset.at === `${t.geo.lat},${t.geo.lon}`) mapEl.replaceWith(oldMap); else miniMap(mapEl, t.geo); }
  autoGrow();
  const plIn = host.querySelector('[data-tk44f="pl"]');
  attachGeo(plIn, async (g) => { const tt = cur(); if (!tt) return; await C.patchItem(tt, { pl: g.label, geo: Number.isFinite(g.lat) ? { lat: g.lat, lon: g.lon, label: g.label } : null }); paintPanel(); });
  if (keep) { const n = keep.f ? host.querySelector(`[data-tk44f="${keep.f}"]`) : keep.n ? host.querySelector(`[name="${keep.n}"]`) : null; if (n) { n.focus(); try { if (keep.pos != null) n.setSelectionRange(keep.pos, keep.pos); } catch { /* */ } } }
  else if (first) host.querySelector('[data-tk44-close].tk44-rb')?.focus({ preventScroll: true });
  // Sted uten koordinater: slå opp én gang og lagre.
  const pl0 = plOf(t);
  if (pl0 && !t.geo && !P.geoTried.has(`${t.id}|${pl0}`)) {
    P.geoTried.add(`${t.id}|${pl0}`);
    geoSearch(pl0).then(async (L) => { const g = L[0]; const tt = cur(); if (g && tt && plOf(tt) === pl0 && Number.isFinite(g.lat)) { await C.patchItem(tt, { geo: { lat: g.lat, lon: g.lon, label: pl0 } }); } paintPanel(); }).catch(() => paintPanel());
  }
}
function autoGrow() { host?.querySelectorAll('.tk44-ti').forEach((x) => { x.style.height = 'auto'; x.style.height = `${x.scrollHeight}px`; }); }
let saveT = 0;
function bindPanel(h) {
  h.addEventListener('click', async (e) => {
    const t = cur(); const x = (s) => e.target.closest(s); let b;
    if (x('[data-tk44-close]')) return closePanel();
    if (!t) return;
    if ((b = x('[data-tk44-list]'))) { await C.patchItem(t, { list: b.dataset.tk44List }); C.paint(); return paintPanel(); }
    if ((b = x('[data-tk44-st]'))) { await subTick(b.dataset.tk44St); return; }
    if ((b = x('[data-tk44-sx]'))) { await subDel(b.dataset.tk44Sx); return; }
    const a = x('[data-tk44]')?.dataset.tk44;
    if (!a) return;
    if (a === 'done') return complete46(t); // prompt 46: fullfør lukker panelet (Angre fullført gjør det ikke)
    if (a === 'flag') { await C.patchItem(t, { flag: !t.flag }); C.paint(); return paintPanel(); }
    if (a === 'dup') { try { const n = await C.createItem({ n: `${C.tTitle(t)} (kopi)`, list: C.tList(t), due: t.due ?? null, who: C.tWho(t), time: t.time, rep: t.rep, early: t.early, prio: t.prio, tags: t.tags, place: t.place, subs: subsOf(t).map((s) => ({ n: s.n, done: false })), notes: C.tNotes(t) || undefined, dl: t.dl, pl: t.pl, geo: t.geo }); C.flash('Duplisert'); C.paint(); if (n?.id) openPanel(n.id); } catch (er) { C.flash(er.message); } return; }
    if (a === 'del') { if (!confirm(`Slette «${C.tTitle(t)}»?`)) return; const id = String(t.id); closePanel(); return C.del(id); }
    if (a === 'edit') { C.openEd(String(t.id)); return; }
    if (a === 'dlclr') { await C.patchItem(t, { dl: null }); C.paint(); return paintPanel(); }
    if (a === 'dueclr') { await C.patchItem(t, { due: null, time: null }); C.paint(); return paintPanel(); }
    if (a === 'plclr') { await C.patchItem(t, { pl: null, geo: null }); return paintPanel(); }
  });
  // Frist/Når: trykk hvor som helst i feltet åpner velgeren.
  h.addEventListener('pointerdown', (e) => { const i = e.target.closest?.('input[type=date],input[type=time]'); if (i && typeof i.showPicker === 'function') { try { i.showPicker(); } catch { /* krever brukerhandling */ } } });
  h.addEventListener('input', (e) => {
    const t = cur(); const f = e.target.dataset.tk44f;
    if (e.target.name === 'tk44psub') { P.subV = e.target.value; return; }
    if (!t || !f) return;
    if (f === 'title' || f === 'notes') { if (f === 'title') autoGrow(); const ch = f === 'title' ? { title: e.target.value } : { notes: e.target.value }; Object.assign(t, ch); if (f === 'notes') t.note = e.target.value; clearTimeout(saveT); saveT = setTimeout(() => { C.patchItem(t, ch); C.paint(); }, 450); }
  });
  h.addEventListener('change', async (e) => {
    const t = cur(); const f = e.target.dataset.tk44f; if (!t || !f) return;
    if (f === 'dl' || f === 'due') { await C.patchItem(t, { [f]: e.target.value || null }); C.paint(); return paintPanel(); }
    if (f === 'time') { await C.patchItem(t, { time: e.target.value || null, ...(t.due || !e.target.value ? {} : { due: C.today() }) }); C.paint(); return paintPanel(); }
    if (f === 'pl') { const v = e.target.value.trim(); if (v !== plOf(t)) { await C.patchItem(t, { pl: v || null, geo: null }); paintPanel(); } }
  });
  h.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-tk44-psub]')) return;
    e.preventDefault(); const t = cur(); const v = P.subV.trim(); if (!t || !v) return;
    P.subV = ''; await C.patchItem(t, { subs: [...subsOf(t), { n: v, done: false }] }); C.paint(); paintPanel();
    host?.querySelector('[name="tk44psub"]')?.focus();
  });
}

/* ---------------- Deloppgaver (felles for lista og panelet) ---------------- */
const byKey = (k) => { const [id, i] = String(k).split(':'); const t = C.S.d.items.find((x) => String(x.id) === id) ?? C.S.arch.find((x) => String(x.id) === id); return [t, +i]; };
async function subTick(k) {
  const [t, i] = byKey(k); if (!t) return;
  const s = subsOf(t).map((x) => ({ ...x })); if (!s[i]) return;
  s[i].done = !s[i].done;
  await C.patchItem(t, { subs: s }); C.paint(); paintPanel();
  if (s.every((x) => x.done) && !t.done && s.length > 1) setTimeout(() => { if (confirm(`Alle deloppgavene er ferdige. Fullfør «${C.tTitle(t)}» også?`)) C.tick(String(t.id)).then(paintPanel); }, 60);
}
async function subDel(k) { const [t, i] = byKey(k); if (!t) return; const s = subsOf(t).filter((_, j) => j !== i); await C.patchItem(t, { subs: s }); C.paint(); paintPanel(); }

let bound = false;
/** Kobles på én gang (lista er tegnet med innerHTML, så hendelsene fanges på dokumentet). */
export function bind44() {
  if (bound) return; bound = true;
  document.addEventListener('click', async (e) => {
    if (!e.target.closest?.('#tasks')) return;
    let b;
    if ((b = e.target.closest('[data-tk44-subfor]'))) { e.preventDefault(); e.stopPropagation(); const id = b.dataset.tk44Subfor; P.addFor = String(P.addFor) === id ? null : id; P.addV = ''; C.paint(); document.querySelector(`[data-tk44-addform="${CSS.escape(id)}"] input`)?.focus(); return; }
    if ((b = e.target.closest('#tasks [data-tk44-st]'))) { e.stopPropagation(); await subTick(b.dataset.tk44St); return; }
    if ((b = e.target.closest('#tasks [data-tk44-sx]'))) { e.stopPropagation(); await subDel(b.dataset.tk44Sx); return; }
    if (e.target.closest('[data-tk44-ha]')) { document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'huske' })); }
  }, true);
  document.addEventListener('input', (e) => { if (e.target.name === 'tk44sub' && e.target.closest('#tasks')) P.addV = e.target.value; }, true);
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest?.('[data-tk44-addform]'); if (!f || !f.closest('#tasks')) return;
    e.preventDefault(); e.stopPropagation();
    const id = f.dataset.tk44Addform, v = P.addV.trim(); if (!v) return;
    const t = C.S.d.items.find((x) => String(x.id) === id); if (!t) return;
    P.addV = ''; await C.patchItem(t, { subs: [...subsOf(t), { n: v, done: false }] }); C.paint();
    document.querySelector(`[data-tk44-addform="${CSS.escape(id)}"] input`)?.focus();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && P.addFor != null && e.target.name === 'tk44sub') { e.preventDefault(); P.addFor = null; C.paint(); return; }
    if (!panelOpen()) return;
    if (document.querySelector('.tk-layer') || document.querySelector('.geo44')) return; // redigeringsarket eller adresselista har Esc
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const t = cur(); if (t) complete46(t); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '')) {
      e.preventDefault();
      const vis = [...document.querySelectorAll('#tasks [data-tw-sel]')].map((x) => x.dataset.twSel), i = vis.indexOf(String(P.id));
      const j = Math.max(0, Math.min(vis.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      if (vis[j]) { C.S.sel = vis[j]; P.id = vis[j]; C.paint(); paintPanel(); }
    }
  }, true);
}
/* ---------------- Prompt 46 (claude-code-gjoremal-fullfor-lukker.md, fasit Huskeliste.dc.html → toggle i vw) ----------------
   «Fullfør oppgaven»: haken og overstrykingen vises, og etter 450 ms glir panelet ut og lista vises med en toast
   «Fullført: X · Angre» (5 s). Uferdige deloppgaver: spør først («2 deloppgaver er ikke ferdige. Fullfør alle?»).
   «Marker som ikke fullført» (Angre fullført) lukker ikke panelet. Gjentakende: «Fullført · neste fre 30. okt». */
let busy46 = false;
async function complete46(t) {
  if (busy46) return;
  if (t.done) { await C.tick(String(t.id)); return paintPanel(); }
  const open = subsOf(t).filter((x) => !x.done).length;
  if (open) { askSubs46(t, open); return; }
  return finish46(t);
}
function askSubs46(t, n) {
  const pan = host?.querySelector('.tk44-pan'); if (!pan) return;
  pan.querySelector('.tk46-ask')?.remove();
  const box = document.createElement('div');
  box.className = 'tk46-ask'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', 'Uferdige deloppgaver');
  box.innerHTML = `<div class="tk46-askc"><b>${n === 1 ? '1 deloppgave er ikke ferdig' : `${n} deloppgaver er ikke ferdige`}. Fullfør alle?</b><div class="tk46-askb"><button type="button" class="tk46-no">Avbryt</button><button type="button" class="tk46-yes">Fullfør alle</button></div></div>`;
  pan.appendChild(box);
  box.querySelector('.tk46-yes').focus();
  box.addEventListener('click', async (e) => {
    if (e.target.closest('.tk46-no') || e.target === box) { box.remove(); return; }
    if (!e.target.closest('.tk46-yes')) return;
    box.remove();
    await C.patchItem(t, { subs: subsOf(t).map((x) => ({ ...x, done: true })) });
    finish46(t);
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); box.remove(); } });
}
async function finish46(t) {
  busy46 = true;
  const id = String(t.id), title = C.tTitle(t), rep = t.rep && t.rep !== 'none';
  const before = new Set((C.S.d?.items ?? []).map((x) => String(x.id)));
  // Haken og overstrykingen med en gang (tick tegner lista; panelet males av oss).
  host?.querySelector('.tk44-ck')?.classList.add('on', 'tk46-pop');
  const ck = host?.querySelector('.tk44-ck'); if (ck) ck.textContent = '✓';
  host?.querySelector('.tk44-ti')?.classList.add('done');
  const btn = host?.querySelector('.tk44-done'); if (btn) btn.textContent = '✓ Fullført';
  const ticking = C.tick(id);
  await new Promise((r) => setTimeout(r, 450));
  await ticking.catch(() => {});
  const it = C.S.d?.items.find((x) => String(x.id) === id);
  if (!it?.done) { busy46 = false; return paintPanel(); } // feilet på serveren: panelet blir stående
  const pan = host?.querySelector('.tk44-pan'), scrim = host?.querySelector('.tk44-scrim');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (pan && !reduce) { pan.classList.add('tk46-out'); scrim?.classList.add('tk46-fade'); await new Promise((r) => setTimeout(r, 220)); }
  if (String(P.id) === id) { P.id = null; if (String(C.S.sel) === id) C.S.sel = null; paintPanel(); C.paint(); }
  busy46 = false;
  let msg = `Fullført: ${title}`;
  if (rep) {
    const nx = (C.S.d?.items ?? []).find((x) => !before.has(String(x.id)) && !x.done && C.tTitle(x) === title);
    const d = nx?.due ? new Date(`${String(nx.due).slice(0, 10)}T12:00`) : null;
    msg = d && !Number.isNaN(+d) ? `Fullført · neste ${d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}` : 'Fullført · neste er lagt til';
  }
  toast46(msg, async () => { const x = C.S.d?.items.find((y) => String(y.id) === id); if (x?.done) await C.tick(id); });
}
let toastT = 0;
function toast46(msg, undo) {
  document.querySelector('.tk46-toast')?.remove();
  clearTimeout(toastT);
  const el = document.createElement('div');
  el.className = 'tk46-toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span><button type="button">Angre</button>`;
  document.body.appendChild(el);
  el.querySelector('button').addEventListener('click', async () => { el.remove(); clearTimeout(toastT); await undo(); });
  toastT = setTimeout(() => el.remove(), 5000);
}

export function refresh44() { if (panelOpen()) paintPanel(); else if (host) paintPanel(); }
export function after44() { /* lazy-import fra web44.js: alt kobles fra tasks.js */ }

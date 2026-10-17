// Matplan: ukeplan, faste retter, kokker, HelloFresh, handleliste og kalenderfeed.
import { api, esc, parseNum } from './util.js';
import { page, logo, n0 } from './osmods.js';

const M = (p, o) => api('/../mat/api' + p, o);
const SRC = { gemini: 'Gemini', hellofresh: 'HelloFresh', fixed: 'Fast', own: 'Egen' };
const today = () => new Date().toLocaleDateString('sv-SE');
let target = null, status = '', showCal = false, hfPaste = false;

const pg = page('mat-os', (st) => {
  const w = st.data, busy = st.busy;
  target ??= w.days.find((d) => d.date >= today())?.date ?? w.days[0].date;
  const people = w.cooks;
  const days = w.days.map((d) => `<div class="mat-day${d.date === today() ? ' today' : ''}">
      <div class="top2"><span>${d.weekday}</span>${d.source ? `<span class="src src-${d.source}">${SRC[d.source]}</span>` : ''}</div>
      <button class="name" data-mat-rename="${d.date}" title="Endre rett">${d.name ? esc(d.name) : '<span class="faint">Ingen rett</span>'}</button>
      <select class="fin" data-mat-cook="${d.date}" aria-label="Kokk ${d.weekday}"><option value="">Kokk</option>${people.map((p) => `<option${p === d.cook ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <div class="foot"><span class="c">${d.cost ? d.cost + ' kr' : '–'}</span>
        <button class="ib" data-mat-regen="${d.date}" title="Ny rett med AI" ${busy ? 'disabled' : ''}>✦</button>
        <button class="pin" data-mat-pin="${d.date}" aria-pressed="${d.fixed}" title="Lås retten til ${d.weekday.toLowerCase()}" ${d.name ? '' : 'disabled'}>Fast</button></div></div>`).join('');
  const dayOpts = (sel, extra = '') => extra + w.days.map((d) => `<option value="${d.date}"${d.date === sel ? ' selected' : ''}>${d.weekday}</option>`).join('');
  const hf = w.hellofresh.map((h) => `<div class="mat-row"><span class="grow"><span style="display:block">${esc(h.name)}</span><span class="faint">HelloFresh${h.meta ? ' · ' + esc(h.meta) : ''}${h.cost ? ' · ' + h.cost + ' kr' : ''}</span></span>
      <button class="fbtn lnk" data-hf-add="${esc(h.id)}">Legg til</button></div>`).join('');
  const shop = w.shopping.map((s) => `<button class="mat-shop${s.done ? ' done' : ''}" data-shop="${esc(s.id)}"><i></i><span>${esc(s.text)}</span><span class="mono mute">${s.price ? s.price + ' kr' : ''}</span></button>`).join('');
  return `<div class="tbar">
      <button class="fbtn pri" data-mat-week ${busy ? 'disabled' : ''}>✦ Ny ukeplan med AI</button>
      <button class="fbtn" data-mat-auto>Automatisk hver søndag: ${w.auto ? 'på' : 'av'}</button>
      <button class="fbtn" data-mat-cal>Kalender: ${showCal ? 'skjul' : 'abonner'}</button>
      <span class="mute" style="font-size:13px">${esc(busy ? 'AI lager plan …' : status)}</span></div>
    ${showCal ? `<div class="note"><b>Kalenderfeed «Middag»</b><span>Abonner på denne adressen i Google Kalender (Andre kalendere → Fra URL) eller Apple Kalender. Hver middag vises 17:00–18:00 med kokken i beskrivelsen. Google oppdaterer abonnerte kalendere med noen timers mellomrom.</span>
      <input class="fin mono" readonly value="${esc(location.origin + w.calendarUrl)}" data-select-all style="width:100%">
      <span><button class="fbtn" data-cal-rotate>Lag ny adresse</button> <span class="faint">Den gamle slutter å virke.</span></span></div>` : ''}
    <div class="mat-days">${days}</div>
    <div class="cols">
      <div class="fcard"><div class="tbar">${logo('hellofresh.no')}<b style="flex:1">HelloFresh denne uka</b><select class="fin" data-hf-target style="height:30px">${dayOpts(target)}</select></div>
        ${hf || '<span class="faint">Ingen retter importert. HelloFresh har ikke åpent API – lim inn ukesmenyen.</span>'}
        ${hfPaste ? `<textarea class="fin" rows="5" data-hf-text placeholder="Én rett per linje, f.eks. «Teriyakilaks med sesamris – 25 min – 169 kr»"></textarea><button class="fbtn wht" data-hf-import>Importer</button>` : '<button class="fbtn" data-hf-paste style="align-self:flex-start">Lim inn ukesmeny</button>'}</div>
      <form class="fcard" data-meal-form><b>Ny rett</b>
        <input class="fin" name="name" placeholder="Navn, f.eks. Fiskesuppe">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="fin" name="cost" placeholder="Kostnad kr" inputmode="decimal"><select class="fin" name="date">${dayOpts('', '<option value="">Bare i biblioteket</option>')}</select></div>
        <label class="mute" style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" name="fixed">Fast rett denne ukedagen hver uke</label>
        <button class="fbtn wht" type="submit">Legg til</button>
        <div class="faint">Bibliotek: ${w.library.length} retter. AI-en velger fra biblioteket, HelloFresh og egne forslag.</div></form>
      <div class="fcard"><b>Faste retter</b>
        ${w.fixed.map((x) => `<div class="mat-row" style="justify-content:space-between"><span>${x.weekday}</span><span class="mute">${esc(x.name)}</span></div>`).join('') || '<span class="faint">Ingen ennå. Trykk «Fast» på en dag.</span>'}
        <b style="margin-top:10px">Kokker</b>
        <div class="chips">${people.map((p) => `<span class="cook">${esc(p)}</span>`).join('')}<button class="cook" data-cooks title="Endre kokker">✎</button></div>
        <span class="faint">Hver middag ligger i kalenderfeeden kl. 17:00 med kokken i beskrivelsen.</span></div>
    </div>
    <div class="mat-bottom">
      <div class="fcard"><b>Handleliste</b>${shop || '<span class="faint">Tom. Ingredienser fra AI-planen havner her.</span>'}
        <form class="tbar" data-shop-form><input class="fin" name="text" placeholder="Legg til vare" style="flex:1"><button class="fbtn" type="submit">+</button></form></div>
      <div class="fcard acc"><span style="font-size:13px;color:var(--f-acc-l)">Uke ${w.week} · estimert</span><b class="mono" style="font-size:28px">${n0(w.weekCost)} kr</b><span class="mute" style="font-size:13px">Trekkes fra budsjettet Mat og dagligvarer.</span></div>
    </div>`;
});

const set = (w) => { pg.st.data = w; pg.paint(); };
const run = async (fn) => { try { const w = await fn(); if (w?.days) set(w); return w; } catch (e) { status = e.message; pg.paint(); } };

export function render() {
  if (!pg.st.data) pg.load(() => M('/week'));
  return `<div class="os-title">Mat<b>plan</b></div>${pg.html()}`;
}

async function plan(scope, date) {
  pg.st.busy = true; pg.paint();
  const w = await run(() => M('/plan', { method: 'POST', json: { scope, date } }));
  pg.st.busy = false; if (w?.status) status = w.status; pg.paint();
}

export function bind(view) {
  view.addEventListener('click', async (e) => {
    if (!e.target.closest('#mat-os')) return;
    const t = (s) => e.target.closest(s);
    const w = pg.st.data;
    if (t('[data-mat-week]')) return plan('week', w.start);
    if (t('[data-mat-regen]')) return plan('day', t('[data-mat-regen]').dataset.matRegen);
    if (t('[data-mat-pin]')) { const d = w.days.find((x) => x.date === t('[data-mat-pin]').dataset.matPin); return run(() => M(`/day/${d.date}`, { method: 'PATCH', json: { fixed: !d.fixed } })); }
    if (t('[data-mat-rename]')) {
      const d = w.days.find((x) => x.date === t('[data-mat-rename]').dataset.matRename);
      const name = prompt(`Middag ${d.weekday.toLowerCase()} (tomt fjerner)`, d.name ?? ''); if (name === null) return;
      const cost = name ? prompt('Kostnad (kr)', d.cost || '') : 0; if (cost === null) return;
      return run(() => M(`/day/${d.date}`, { method: 'PATCH', json: { name, cost: parseNum(cost) } }));
    }
    if (t('[data-mat-auto]')) { const r = await run(() => M('/auto', { method: 'PUT', json: { auto: !w.auto } })); if (r) { w.auto = r.auto; status = r.auto ? 'Ny plan lages søndag kl. 18' : ''; pg.paint(); } return; }
    if (t('[data-mat-cal]')) { showCal = !showCal; return pg.paint(); }
    if (t('[data-cal-rotate]') && confirm('Lage ny adresse? Kalendere som abonnerer på den gamle slutter å oppdateres.')) { const r = await run(() => M('/calendar/rotate', { method: 'POST' })); if (r) { w.calendarUrl = r.calendarUrl; pg.paint(); } return; }
    if (t('[data-select-all]')) return t('[data-select-all]').select();
    if (t('[data-hf-paste]')) { hfPaste = true; pg.paint(); return view.querySelector('[data-hf-text]')?.focus(); }
    if (t('[data-hf-import]')) {
      const r = await run(() => M('/hellofresh', { method: 'POST', json: { text: view.querySelector('[data-hf-text]').value } }));
      if (r) { w.hellofresh = r.hellofresh; hfPaste = false; status = `${r.hellofresh.length} HelloFresh-retter importert`; pg.paint(); } return;
    }
    if (t('[data-hf-add]')) { await run(() => M(`/hellofresh/${t('[data-hf-add]').dataset.hfAdd}/add`, { method: 'POST', json: { date: target } })); status = 'Lagt til'; return pg.paint(); }
    if (t('[data-shop]')) {
      const id = t('[data-shop]').dataset.shop, r = await run(() => M(`/shopping/${id}/toggle`, { method: 'POST' }));
      if (r) { w.shopping = w.shopping.map((s) => (s.id === id ? r : s)); pg.paint(); } return;
    }
    if (t('[data-cooks]')) {
      const v = prompt('Kokker, kommaseparert', w.cooks.join(', ')); if (v === null) return;
      const r = await run(() => M('/cooks', { method: 'PUT', json: { cooks: v.split(',') } })); if (r) { w.cooks = r.cooks; pg.paint(); }
    }
  });
  view.addEventListener('change', (e) => {
    const c = e.target.closest('[data-mat-cook]');
    if (c) return run(() => M(`/day/${c.dataset.matCook}`, { method: 'PATCH', json: { cook: c.value } }));
    if (e.target.closest('[data-hf-target]')) target = e.target.value;
  });
  view.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-meal-form], [data-shop-form]');
    if (!f || !f.closest('#mat-os')) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (f.dataset.shopForm !== undefined) return d.text && run(() => M('/shopping', { method: 'POST', json: { text: d.text, start: pg.st.data.start } }));
    if (!d.name) return;
    run(() => M('/meals', { method: 'POST', json: { name: d.name, cost: parseNum(d.cost), date: d.date || null, fixed: !!d.fixed } })).then(() => { status = `${d.name} lagt til`; pg.paint(); });
  });
}

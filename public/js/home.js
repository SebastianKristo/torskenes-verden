// Home OS: bolig og inventar.
import { api, esc, parseNum } from './util.js';
import { page, logo, n0, ddmmyyyy } from './osmods.js';

const H = (p, o) => api('/../home/api' + p, o);
let room = 'Alle', adding = false;

const pg = page('home-os', (st) => {
  const { property: p, items } = st.data;
  const costs = p.costs.reduce((a, x) => a + x.amount, 0);
  const sum = items.reduce((a, i) => a + i.price, 0);
  const rooms = ['Alle', ...new Set(items.map((i) => i.room))];
  if (!rooms.includes(room)) room = 'Alle';
  const now = Date.now();
  const rows = items.filter((i) => room === 'Alle' || i.room === room).map((i) => {
    const left = i.warrantyUntil ? (new Date(i.warrantyUntil) - now) / 86400000 : null;
    const war = left === null ? 'Ingen garanti' : left < 0 ? 'Garanti utløpt' : `Garanti til ${ddmmyyyy(i.warrantyUntil)}`;
    return `<div class="inv-row">${logo(i.domain, i.store || i.name)}<span class="n"><b>${esc(i.name)}</b><span>${esc(i.room)}${i.date ? ` · kjøpt ${ddmmyyyy(i.date)}` : ''}${i.store ? ` hos ${esc(i.store)}` : ''}</span></span>
      <span style="color:${left !== null && left < 60 ? 'var(--f-acc-l)' : 'var(--f-2)'}">${war}</span><span class="mute">${esc(i.receipt || '–')}</span><span class="v">${n0(i.price)} kr</span>
      <button class="x" data-inv-del="${esc(i.id)}" aria-label="Slett ${esc(i.name)}">×</button></div>`;
  }).join('') || '<div class="faint" style="padding:18px">Ingen gjenstander ennå.</div>';
  return `<div class="kpis">
      <div class="kpi"><div class="l">Boligverdi (estimat)</div><b>${n0(p.value)} kr</b><div class="s">Eiendomsverdi${p.valueDate ? ' · ' + esc(p.valueDate) : ''}</div></div>
      <div class="kpi"><div class="l">Restgjeld</div><b>${n0(p.loan)} kr</b><div class="s">${esc(p.bank || '–')} · ${String(p.rate).replace('.', ',')} % · ${n0(p.payment)} kr/mnd</div></div>
      <div class="kpi"><div class="l">Faste boutgifter</div><b>${n0(costs)} kr/mnd</b><div class="s">${p.costs.map((c) => `${esc(c.name)} ${n0(c.amount)}`).join(' · ') || 'Ingen registrert'}</div></div>
      <div class="kpi"><div class="l">Inventar</div><b>${n0(sum)} kr</b><div class="s">${items.length} gjenstander · til innboforsikring</div></div>
    </div>
    <div class="tbar"><div class="chips" style="flex:1">${rooms.map((r) => `<button class="chip" data-room="${esc(r)}" aria-pressed="${r === room}">${esc(r)}</button>`).join('')}</div>
      <button class="fbtn" data-home-edit>Rediger bolig</button><button class="fbtn wht" data-inv-add>+ Ny gjenstand</button></div>
    ${adding ? `<form class="fcard" data-inv-form><b>Ny gjenstand</b><div class="inv-form">
      <input class="fin" name="name" placeholder="Navn" required><input class="fin" name="room" placeholder="Rom" value="${room === 'Alle' ? '' : esc(room)}">
      <input class="fin" name="store" placeholder="Butikk"><input class="fin" name="price" placeholder="Verdi kr" inputmode="decimal">
      <label class="faint">Kjøpt<input class="fin" name="date" type="date" style="width:100%"></label><label class="faint">Garanti til<input class="fin" name="warrantyUntil" type="date" style="width:100%"></label>
      <select class="fin" name="receipt"><option value="">Ingen kvittering</option><option>PDF-kvittering</option><option>Foto-kvittering</option></select></div>
      <div class="tbar"><button class="fbtn pri" type="submit">Legg til</button><button class="fbtn" type="button" data-inv-cancel>Avbryt</button></div></form>` : ''}
    <div class="list">${rows}</div>`;
});

const reload = () => pg.load(async () => { const [property, items] = await Promise.all([H('/property'), H('/inventory')]); return { property, items }; });

export function render() {
  if (!pg.st.data) reload();
  return `<div class="os-title">Home <b>OS</b></div>${pg.html()}`;
}

export function bind(view) {
  view.addEventListener('click', async (e) => {
    if (!e.target.closest('#home-os')) return;
    const r = e.target.closest('[data-room]');
    if (r) { room = r.dataset.room; return pg.paint(); }
    if (e.target.closest('[data-inv-add]')) { adding = !adding; return pg.paint(); }
    if (e.target.closest('[data-inv-cancel]')) { adding = false; return pg.paint(); }
    const del = e.target.closest('[data-inv-del]');
    if (del && confirm('Slette gjenstanden?')) { await H(`/inventory/${del.dataset.invDel}`, { method: 'DELETE' }); return reload(); }
    if (e.target.closest('[data-home-edit]')) {
      const p = pg.st.data.property;
      const ask = (label, v) => prompt(label, v);
      const value = ask('Boligverdi (kr)', p.value); if (value === null) return;
      const loan = ask('Restgjeld (kr)', p.loan); if (loan === null) return;
      const bank = ask('Bank', p.bank) ?? p.bank, rate = ask('Rente (%)', String(p.rate).replace('.', ',')) ?? p.rate, payment = ask('Terminbeløp (kr/mnd)', p.payment) ?? p.payment;
      const costs = ask('Faste boutgifter – navn beløp, kommaseparert', p.costs.map((c) => `${c.name} ${c.amount}`).join(', '));
      const parsed = costs === null ? p.costs : costs.split(',').map((x) => x.trim().match(/^(.*?)\s+([\d\s.,]+)$/)).filter(Boolean).map((m) => ({ name: m[1], amount: parseNum(m[2]) }));
      try {
        pg.st.data.property = await H('/property', { method: 'PUT', json: { value: parseNum(value), loan: parseNum(loan), bank, rate: parseNum(rate), payment: parseNum(payment), costs: parsed, valueDate: new Date().toLocaleDateString('nb-NO', { month: 'short', year: 'numeric' }) } });
        pg.paint();
      } catch (err) { alert(err.message); }
    }
  });
  view.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-inv-form]');
    if (!f) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    try { await H('/inventory', { method: 'POST', json: { ...d, price: parseNum(d.price) } }); adding = false; reload(); } catch (err) { alert(err.message); }
  });
}

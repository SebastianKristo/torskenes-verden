// Hjem-widget «BURSDAGER · NESTE» (prompt 24, Mobil Papir App.dc.html → Hjem): de tre neste med avatar, navn,
// «2. nov · fyller 41» og «om 15 d» (rødt når det er 7 dager eller mindre), og «alle ›» som åpner Bursdager.
// Kan skjules og flyttes som de andre widgetene. Samme data som Bursdager-siden.
import { esc } from './util.js';
import { store, widget, refresh, on } from './store.js';
import { loadBirthdays, sorted, whenTxt, avatar, MS } from './birthdays.js';

let loading = false, timer = null;
function ensure() {
  if (!store.data.birthdays && !loading) { loading = true; loadBirthdays().finally(() => { loading = false; }); }
  timer ??= setInterval(() => { if (!document.hidden && document.querySelector('[data-w="d_bday"],[data-w="p_bday"]')) loadBirthdays(); }, 30 * 60_000);
}

function body() {
  ensure();
  const d = store.data.birthdays, L = sorted(d?.items).slice(0, 3);
  const head = `<span class="bdw-h"><span class="bdw-k">BURSDAGER · ${L[0]?.days === 0 ? 'I DAG' : 'NESTE'}</span><span class="bdw-all">alle ›</span></span>`;
  if (!d) return head + '<div class="skeleton" style="min-height:96px"></div>';
  if (!L.length) return head + '<span class="bdw-e">Ingen bursdager ennå. Legg til under Bursdager.</span>';
  return head + L.map((x) => `<span class="bdw-r">${avatar(x, 'bdw-av')}<span class="bdw-t"><b>${esc(x.name)}</b><span>${esc(`${x.x.getDate()}. ${MS[x.x.getMonth()]}${x.age != null ? ` · fyller ${x.age}` : ''}`)}</span></span><b class="bdw-w${x.days <= 7 ? ' soon' : ''}">${whenTxt(x.days)}</b></span>`).join('');
}

const wrap = () => `<a class="bdw" href="#/bursdager" aria-label="Bursdager – åpne alle">${body()}</a>`;
widget('d_bday', { cls: 'card', render: wrap });
widget('p_bday', { cls: 'p-sec', render: wrap });
on('birthdays', () => refresh('d_bday', 'p_bday'));

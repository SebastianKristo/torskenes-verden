// Prompt 38 (WEB38): nye kort i Now Brief (claude-code-glimt-brief.md → «Nye kort», fasit Glimt Brief.dc.html → bx: pk, fam, sk, bd, nl).
// Kortene ligger etter Abonnementer og før Nyheter, i papirstil. Data fra /api/brief (SERVER38):
//   packages:{count, items:[{carrier, logo, name, status, due, dueRed}]}           (bare egne pakker)
//   family:{items:[{name, avatar, color, state, place, since}]}                    (bare de som deler posisjon)
//   school:{items:[{title, kind, date, daysLeft, color, red}]}                      (7 dager, Studie/Jobb)
//   birthdays:{items:[{name, age, date, daysLeft}]} + POST /api/brief/gift {name, date}
//   aurora:{kp, cloud, best, text, show}                                            (bare kveld/natt, Kp ≥ 3)
// Rekkefølge og av/på: Innstillinger → Glimt → Brief (GET/PUT /api/glimt/settings cards:[{id, on}]). Mangler et felt, vises ikke kortet.
import { esc } from './util.js';

const ini = (n) => (String(n ?? '').match(/\p{L}/gu) ?? ['?']).slice(0, 2).join('').toUpperCase();
const WD = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'], MS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dLab = (iso) => { const d = new Date(`${String(iso).slice(0, 10)}T12:00`); return Number.isNaN(+d) ? String(iso ?? '') : `${WD[d.getDay()]} ${d.getDate()}. ${MS[d.getMonth()]}`; };
const PAL = ['#2b5d8a', '#2f7a4f', '#a8661a', '#7a3b6b', '#3d7f8a', '#c2477a', '#5b4fc4'];
const colOf = (s) => PAL[[...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PAL.length];
const head = (t, k) => `<span class="gb-bh"><b>${esc(t)}</b>${k ? `<span class="gb-mono red">${esc(k)}</span>` : ''}</span>`;
const items = (x) => (Array.isArray(x?.items) ? x.items : Array.isArray(x) ? x : []);

/** Kortnavn og hvilke id-er serveren/appene kan bruke for dem. */
export const CARDS38 = [
  ['vaer', 'Vær', ['vaer', 'weather', 'wx']], ['bibel', 'Bibelvers', ['bibel', 'bible', 'bv']], ['huske', 'Gjøremål', ['huske', 'todos', 'tasks', 'gjoremal']],
  ['kal', 'Kalender', ['kal', 'calendar', 'kalender']], ['abo', 'Abonnementer', ['abo', 'trials', 'subs', 'abonnement']],
  ['pakker', 'Pakker', ['pakker', 'packages', 'pk', 'pak']], ['familie', 'Familie', ['familie', 'family', 'fam']], ['skole', 'Skole og jobb', ['skole', 'school', 'sk', 'sko']],
  ['bursdager', 'Bursdager', ['bursdager', 'birthdays', 'bd', 'bur']], ['nordlys', 'Nordlys i natt', ['nordlys', 'aurora', 'nl', 'nor']], ['nyh', 'Nyheter', ['nyh', 'news', 'nyheter']],
];
/** Serverens id (cards38.js: weather, calendar, todos, trials, packages, family, school, birthdays, aurora, news, bible). */
const SRV = { vaer: 'weather', kal: 'calendar', huske: 'todos', abo: 'trials', pakker: 'packages', familie: 'family', skole: 'school', bursdager: 'birthdays', nordlys: 'aurora', nyh: 'news', bibel: 'bible' };
export const toSrv38 = (L) => L.map((c) => ({ id: SRV[c.id] ?? c.id, on: c.on }));
const idOf = (raw) => CARDS38.find((c) => c[2].includes(String(raw ?? '').toLowerCase()))?.[0] ?? null;
/** [{id, on}] i brukerens rekkefølge, med nye kort lagt til på standardplassen. */
export function cardList38(s) {
  const L = Array.isArray(s?.cards) ? s.cards : [];
  const out = [], seen = new Set();
  for (const c of L) { const id = idOf(c?.id); if (id && !seen.has(id)) { seen.add(id); out.push({ id, on: c.on !== false }); } }
  CARDS38.forEach(([id], i) => { if (!seen.has(id)) { const before = CARDS38.slice(i + 1).map((x) => x[0]).find((x) => seen.has(x)); const at = before ? out.findIndex((x) => x.id === before) : out.length; out.splice(at, 0, { id, on: true }); seen.add(id); } });
  return out;
}
/** Setter sammen kortene (map id → html) i rekkefølgen fra innstillingene. */
export function cardOrder38(s, map) { return cardList38(s).filter((c) => c.on).map((c) => map[c.id] ?? '').join(''); }

function pakker(p) {
  const L = items(p).slice(0, 4);
  if (!L.length) return '';
  const n = p.count ?? L.length;
  return `<section data-gb="pak" class="gb-box gb38-c">${head('Pakker', p.label || `${n} PÅ VEI`)}
    ${L.map((x) => `<button type="button" class="gb38-r" data-gb38-go="#/sporing"><span class="gb38-ic"${x.logo ? '' : ` style="background:${esc(x.color || colOf(x.carrier || x.name))}"`}>${x.logo && /^(\/|https:)/.test(x.logo) ? `<img src="${esc(x.logo)}" alt="" loading="lazy">` : esc(ini(x.carrier || x.name))}</span><span class="gb38-m"><b>${esc(x.name || x.carrier || 'Pakke')}</b><span>${esc(x.status || '')}</span></span>${x.due ? `<span class="gb38-due${x.dueRed ? ' red' : ''}">${esc(/^\d{4}-/.test(x.due) ? `Hent innen ${dLab(x.due)}` : x.due)}</span>` : ''}</button>`).join('')}</section>`;
}
function familie(f) {
  const L = items(f).slice(0, 4);
  if (!L.length) return '';
  const dot = (st) => (/hjemme|home/i.test(st) ? '#2f7a4f' : /skole|jobb|work|school/i.test(st) ? '#2b5d8a' : /vei|moving|på vei/i.test(st) ? '#d08a1e' : '#a39d90');
  const h = new Date().getHours(), k = h < 11 ? 'HVEM ER DRATT' : h >= 17 ? 'HVEM ER HJEMME' : 'NÅ';
  return `<section data-gb="fam" class="gb-box gb38-c">${head('Familie', f.label || k)}<div class="gb38-fam">
    ${L.map((x) => `<button type="button" class="gb38-fp" data-gb38-go="#/familie"><span class="gb38-av" style="background:${esc(x.color || colOf(x.name))}">${x.avatar && /^(\/|https:)/.test(x.avatar) ? `<img src="${esc(x.avatar)}" alt="">` : esc(ini(x.name))}<i style="background:${esc(x.dot && /^#/.test(x.dot) ? x.dot : dot(x.state))}"></i></span><span class="gb38-m"><b>${esc(x.name)}</b><span>${esc([x.state, x.place].filter(Boolean).join(' · ') + (x.since ? ` · ${x.since}` : ''))}</span></span></button>`).join('')}</div></section>`;
}
function skole(sc) {
  const L = items(sc).slice(0, 5);
  if (!L.length) return '';
  return `<section data-gb="sko" class="gb-box gb38-c">${head('Skole og jobb', 'NESTE 7 DAGER')}
    ${L.map((x) => { const red = x.red ?? (x.daysLeft != null && x.daysLeft <= 4); const dl = x.daysLeft; return `<button type="button" class="gb38-r" data-gb38-go="${esc(x.date ? `#/kalender/dag/${String(x.date).slice(0, 10)}` : '#/kalender')}"><span class="gb38-strip" style="background:${esc(x.color || '#2b5d8a')}"></span><span class="gb38-m"><b>${esc(x.title)}</b><span>${esc([x.kind === 'prove' ? 'Prøve' : x.kind === 'frist' ? 'Frist' : x.kind === 'mote' ? 'Møte' : x.kind, x.date ? dLab(x.date) : ''].filter(Boolean).join(' · '))}</span></span>${dl != null ? `<span class="gb38-n${red ? ' red' : ''}"><b>${dl === 0 ? 'I dag' : dl}</b><span>${dl === 0 ? '' : dl === 1 ? 'dag' : 'dager'}</span></span>` : ''}</button>`; }).join('')}</section>`;
}
const gifted = new Set();
function bursdager(b) {
  const L = items(b).slice(0, 3);
  if (!L.length) return '';
  const f = L[0], fn = String(f.name ?? '').split(' ')[0];
  return `<section data-gb="bur" class="gb-box gb38-c">${head('Bursdager', 'NESTE 30 DAGER')}
    ${L.map((x) => `<button type="button" class="gb38-r" data-gb38-go="#/bursdager"><span class="gb38-av" style="background:${esc(colOf(x.name))}">${esc(ini(x.name))}</span><span class="gb38-m"><b>${esc(x.name)}</b><span>${esc(x.text || [x.age != null ? `Fyller ${x.age}` : '', x.date ? dLab(x.date) : ''].filter(Boolean).join(' · '))}</span></span><span class="gb38-n${x.daysLeft != null && x.daysLeft <= 3 ? ' red' : ''}"><b>${x.daysLeft === 0 ? 'I dag' : esc(x.daysLeft ?? '')}</b><span>${x.daysLeft === 0 ? '' : x.daysLeft === 1 ? 'dag' : 'dager'}</span></span></button>`).join('')}
    <button type="button" class="gs-pill gb38-gift" data-gb38-gift="${esc(f.name)}" data-gb38-date="${esc(f.date ?? '')}"${gifted.has(f.name) ? ' disabled' : ''}>${gifted.has(f.name) ? `✓ Lagt i Gjøremål` : `+ Gave til ${esc(fn)} i Gjøremål`}</button></section>`;
}
function nordlys(a) {
  if (!a || a.show === false || (a.kp != null && a.kp < 3 && !a.show)) return '';
  const h = new Date().getHours();
  if (!(h >= 17 || h < 6) && !a.show) return '';
  const st = [['KP-INDEKS', a.kp != null ? String(a.kp).replace('.', ',') : '–'], ['SKYDEKKE', a.cloud != null ? `${a.cloud} %` : '–'], ['BESTE TID', a.best || '–']];
  return `<section data-gb="nor" class="gb38-nl">${head('Nordlys i natt', a.label || (a.kp >= 4 ? 'GODE SJANSER' : 'MULIG'))}<span class="gb38-nlt">${esc(a.text || 'Glimt følger med på nordlysvarselet for deg.')}</span>
    <div class="gb38-nls">${st.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div><span class="gb38-nlsrc">${esc(a.source || 'NOAA SWPC · MET Norge')}</span></section>`;
}
/** html per kort-id for briefen (tom streng når data mangler). */
export function briefCards38(d) {
  const x = d ?? {};
  return { pakker: pakker(x.packages), familie: familie(x.family), skole: skole(x.school), bursdager: bursdager(x.birthdays), nordlys: nordlys(x.aurora) };
}
/** «+ Gave til X i Gjøremål»: POST /api/brief/gift {name, date} (legger «Kjøp gave til X» i Mine to dager før, #gave). */
export async function giftAdd38(name, date, btn) {
  if (!name || gifted.has(name)) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Legger til …'; }
  try {
    const r = await fetch('/api/brief/gift', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, date }) });
    if (!r.ok) throw new Error(String(r.status));
    gifted.add(name);
    try { navigator.vibrate?.([8, 40, 8]); } catch { /* */ }
    if (btn) btn.textContent = '✓ Lagt i Gjøremål';
  } catch { if (btn) { btn.disabled = false; btn.textContent = 'Fikk ikke lagt til – prøv igjen'; } }
}

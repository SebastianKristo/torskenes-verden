// Prompt 43 (claude-code-widget-galleri.md): Widgets-galleriet på web (Innstillinger → App → Widgets).
// Fasit: design/Widget Galleri.dc.html. Alle widgets i alle størrelser, filter per app, iPhone / Android / Samsung.
// Fra nettleseren kan man ikke legge til widgets på telefonen, så hvert kort har «Slik legger du til» med stegene.
// Data: GET /api/widgets/catalog (SERVER43) → {widgets:[{id, name, kicker, sizes:[{size:'s'|'m'|'l'|'lk', kicker?, big, lines[], platforms?[]}]}]}
// eller en ren liste. Mangler endepunktet (404), brukes eksempelinnholdet under (samme som fasiten).
import { esc } from './util.js';

const SZ = { s: ['Liten', '2 × 2', 110, 110, '20px'], m: ['Medium', '4 × 2', 230, 110, '20px'], l: ['Stor', '4 × 4', 230, 140, '20px'], lk: ['Låseskjerm', 'rektangel', 160, 70, '14px'], lkc: ['Låseskjerm · rund', 'rund', 70, 70, '50%'], lki: ['Låseskjerm · linje', 'linje', 200, 28, '8px'] };
const SIZE_ID = { small: 's', medium: 'm', large: 'l', 'lock-rect': 'lk', lock: 'lk', lockscreen: 'lk', accessory: 'lk', 'lock-circle': 'lkc', 'lock-inline': 'lki' };
const GID = { avganger: 'avg', departures: 'avg', kalender: 'kal', calendar: 'kal', prove: 'trial', trials: 'trial', pakker: 'pk', parcels: 'pk', brief: 'gl', glimt: 'gl' };
const isLock = (sz) => sz === 'lk' || sz === 'lkc' || sz === 'lki';
const W0 = [
  ['media', 'MEDIA', 'Media', [['s', 'MEDIA', '↓ 18,4 MB/s', ['3 aktive', 'Shrinking 64 %']], ['m', 'LASTES NED', '2 nedlastinger', ['Shrinking · 64 %', 'Wicked · 22 %', 'Neste: Only Murders']], ['l', 'MEDIA', '↓ 18,4 MB/s', ['Pause alt · 3 nedlastinger', 'Kommer: Only Murders, Hacks, Exit']], ['lk', 'MEDIA', '↓ 18,4 MB/s', ['Shrinking 64 % · 1 min']]]],
  ['avg', 'AVGANGER', 'Avganger', [['s', 'AMAGERVEIEN', '17 · 2 min', ['Grefsen st.']], ['m', 'AMAGERVEIEN', '17 · 2 min', ['20 Galgeberg · 4 min', '17 Grefsen · 12 min']], ['l', 'AVGANGER', '3 stopp', ['Amagerveien · 2 min', 'Majorstuen · 5 min', 'Nationaltheatret · 9 min']], ['lk', 'AVGANGER', '17 · 2 min', ['Grefsen st.']]]],
  ['kal', 'KALENDER', 'Kalender', [['s', 'ONS 21', 'Tannlege', ['15:15 · Bislett']], ['m', 'I DAG', '3 hendelser', ['15:15 Tannlege', '17:00 Hent pakke', 'I morgen: Kino']], ['l', 'UKE 43', 'Oktober', ['21 Tannlege · 22 Kino', '24 Severance', '27 Only Murders']], ['lk', 'NESTE', 'Tannlege 15:15', ['Tannhelse Bislett']]]],
  ['trial', 'PRØVEPERIODER', 'Prøveperioder', [['s', 'PRØVE', 'Max · 3 d', ['Sies opp 24. okt.']], ['m', 'PRØVEPERIODER', '2 går ut', ['Max · 3 dager', 'Duolingo · 9 dager']]]],
  ['pk', 'PAKKER', 'Pakker', [['s', 'PAKKER', '2 på vei', ['Posten i morgen']], ['m', 'PAKKER', '2 på vei', ['iPhone 14 · i morgen', 'Zalando · mandag']]]],
  ['gl', 'GLIMT', 'Glimt-brief', [['m', 'MORGENBRIEF', 'God morgen', ['Regn og 8° · Tannlege 15:15']], ['lk', 'GLIMT', '8° regn', ['Tannlege 15:15']]]],
].map(([id, kicker, name, sizes]) => ({ id, kicker, name, sizes: sizes.map(([size, k, big, lines]) => ({ size, kicker: k, big, lines })) }));
const LOOK = {
  ios: { bg: '#fffdf8', fg: '#1b1a17', ac: '#b23a2a', wall: 'linear-gradient(160deg,#5f7d97,#2c3d52)' },
  android: { bg: '#fbe9e1', fg: '#3a1d12', ac: '#8a4a32', wall: 'linear-gradient(170deg,#c9805f,#7a3d2c)' },
  samsung: { bg: 'rgba(255,255,255,.96)', fg: '#111', ac: '#1f6fe5', wall: 'linear-gradient(180deg,#5b7fa8,#1d2d45)' },
};
const G = { lists: {}, info: {}, loading: {}, f: 'all', pf: 'ios', how: null, demo: false };
const srvPf = () => (G.pf === 'ios' ? 'ios' : G.pf === 'samsung' ? 'samsung' : 'android');

function norm(r) {
  // SERVER43: {platform, intro, steps, addMode, filters, groups:[{id, name, sub, widgets:[{id, size:'small'|'medium'|'large'|'lock-rect'|…, sizeLabel, lock}]}]}
  if (Array.isArray(r?.groups)) {
    const out = r.groups.map((g) => { const id = GID[g.id] ?? g.id; return { id, srvId: g.id, name: g.name, kicker: String(g.name ?? '').toUpperCase(), sub: g.sub ?? '',
      sizes: (g.widgets ?? []).map((w) => ({ size: SIZE_ID[w.size] ?? w.size, label: w.sizeLabel ?? null, wid: w.id })).filter((x) => SZ[x.size]) }; }).filter((w) => w.sizes.length);
    return out.length ? out : null;
  }
  const L = Array.isArray(r) ? r : r?.widgets ?? r?.items ?? [];
  const out = L.map((w) => ({ id: GID[w.id] ?? String(w.id ?? w.key ?? w.name), name: w.name ?? w.title ?? w.id, kicker: w.kicker ?? String(w.name ?? '').toUpperCase(),
    sizes: (w.sizes ?? w.variants ?? []).map((x) => (typeof x === 'string' ? { size: x } : x)).map((x) => ({ size: SIZE_ID[x.size] ?? x.size ?? x.id, kicker: x.kicker, big: x.big ?? x.title ?? '', lines: x.lines ?? [] })).filter((x) => SZ[x.size]) }))
    .filter((w) => w.sizes.length);
  return out.length ? out : null;
}
async function load() {
  const pf = srvPf();
  if (G.loading[pf] || G.lists[pf]) return;
  G.loading[pf] = true;
  let list = null;
  try { const r = await fetch(`/api/widgets/catalog?platform=${pf === 'ios' ? 'ios' : 'android'}${pf === 'samsung' ? '&samsung=1' : ''}`, { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) { const j = await r.json(); list = norm(j); G.info[pf] = { intro: j.intro, steps: j.steps, addMode: j.addMode }; } } catch { list = null; }
  if (!list) { list = W0.map((w) => ({ ...w, sizes: w.sizes.filter((x) => pf === 'ios' || !isLock(x.size)) })); G.demo = true; }
  G.lists[pf] = list;
  G.loading[pf] = false; repaint();
}
/** Eksempeltekst per størrelse fra fasiten når serveren ikke sender innhold. */
const sample = (w, sz) => W0.find((x) => x.id === w.id)?.sizes.find((s) => s.size === sz);

function card(w, s, pf) {
  const S = SZ[s.size], lock = isLock(s.size), L = LOOK[pf], and = pf !== 'ios', d = sample(w, s.size) ?? sample(w, lock ? 'lk' : 'm') ?? {};
  const big = s.big || d.big || w.name, lines = (s.lines?.length ? s.lines : d.lines ?? []).slice(0, 3), k = s.kicker || d.kicker || w.kicker;
  const st = `width:${S[2]}px;height:${s.size === 'l' ? 140 : S[3]}px;border-radius:${S[4]};background:${lock ? 'rgba(255,255,255,.2)' : L.bg};color:${lock ? '#fff' : L.fg};padding:${s.size === 'lkc' ? '8px' : s.size === 'lki' ? '0 10px' : lock ? '7px 10px' : '9px 10px'};gap:${lock ? '2px' : '4px'}${s.size === 'lkc' || s.size === 'lki' ? ';justify-content:center' : ''}${s.size === 'lkc' ? ';align-items:center;text-align:center' : ''}`;
  if (s.size === 'lkc') return `<div class="wg43-c sm"><div class="wg43-wall" style="background:${L.wall}"><div class="wg43-pv" style="${st}"><b class="wg43-big n" style="font-size:13px">${esc(String(big).split(' ')[0])}</b><span class="wg43-k" style="color:#fff">${esc(k)}</span></div></div>
    <div class="wg43-nm"><b>${esc(`${w.name} · rund`)}</b><span>${esc(s.label ?? S[0])}</span></div><button type="button" class="wg43-add" data-wg43-how="${esc(w.id)}:${s.size}">Slik legger du til</button></div>`;
  if (s.size === 'lki') return `<div class="wg43-c sm"><div class="wg43-wall" style="background:${L.wall}"><div class="wg43-pv" style="${st}"><span class="wg43-l" style="font-size:11px;opacity:1">${esc(`${k} · ${big}`)}</span></div></div>
    <div class="wg43-nm"><b>${esc(`${w.name} · linje`)}</b><span>${esc(s.label ?? S[0])}</span></div><button type="button" class="wg43-add" data-wg43-how="${esc(w.id)}:${s.size}">Slik legger du til</button></div>`;
  return `<div class="wg43-c${s.size === 's' || lock ? ' sm' : ''}"><div class="wg43-wall" style="background:${L.wall}"><div class="wg43-pv" style="${st}"><span class="wg43-k" style="color:${lock ? '#fff' : L.ac}">${esc(k)}</span><b class="wg43-big${s.size === 's' || lock ? ' n' : ''}">${esc(big)}</b>${lines.map((t) => `<span class="wg43-l">${esc(t)}</span>`).join('')}</div></div>
    <div class="wg43-nm"><b>${esc(`${w.name} · ${S[0].toLowerCase()}`)}</b><span>${esc(s.label ?? (and && !lock ? S[1] : S[0]))}</span></div>
    <button type="button" class="wg43-add" data-wg43-how="${esc(w.id)}:${s.size}">${and ? 'Slik legger du til' : 'Slik legger du til'}</button></div>`;
}
function howSheet() {
  const h = G.how; if (!h) return '';
  const w = (G.lists[srvPf()] ?? []).find((x) => x.id === h.id), S = SZ[h.size]; if (!w || !S) return '';
  const n = `${w.name} · ${S[0].toLowerCase()}`, pf = G.pf;
  const steps = pf === 'ios'
    ? (isLock(h.size) ? ['Hold inne på låseskjermen og trykk Tilpass → Låseskjerm.', 'Trykk på feltet under klokka.', `Velg Homelab og «${n}».`] : ['Hold inne på et tomt sted på Hjem-skjermen til ikonene vugger.', 'Trykk + oppe til venstre og søk etter «Homelab».', `Velg «${n}», sveip til riktig størrelse og trykk «Legg til widget».`])
    : ['Åpne Homelab-appen → Innstillinger → Widgets, og trykk «Legg til på startskjermen» – da legger Android den rett inn.', `Eller: hold inne på et tomt sted på Hjem-skjermen → Widgets → Homelab → «${n}» (${S[1]}).`, pf === 'samsung' ? 'Vises ikke Homelab i lista: Innstillinger → Apper → One UI Home → Tving avslutning, og prøv igjen.' : 'Hold inne på widgeten etterpå for å endre størrelse.'];
  return `<div class="wg43-bg" data-wg43-close><div class="wg43-sh" role="dialog" aria-modal="true" aria-label="Legg til ${esc(n)}"><b class="wg43-sht">Legg til «${esc(n)}»</b>
    <ol class="wg43-st">${steps.map((t, i) => `<li><span>${i + 1}</span><span>${esc(t)}</span></li>`).join('')}</ol>
    <span class="wg43-mut">${pf === 'ios' ? `Apple lar ikke apper legge til widgets selv. Widgeten heter «${esc(n)}» under Homelab i galleriet.` : 'Widgetene finnes bare i Homelab-appen for Android (APK), ikke i nettleseren.'}</span>
    <button type="button" class="wg43-done" data-wg43-close>Ferdig</button></div></div>`;
}
function inner() {
  const pf = G.pf, src = G.lists[srvPf()];
  if (!src) { setTimeout(load); return `${pfTabs()}<div class="skeleton" style="min-height:220px;border-radius:18px"></div>`; }
  const list = src.map((w) => ({ ...w, sizes: w.sizes.filter((x) => pf === 'ios' || !isLock(x.size)) })).filter((w) => w.sizes.length);
  const chips = [['all', 'Alle'], ...list.map((w) => [w.id, w.name])];
  const intro = pf === 'ios' ? 'Alle widgetene fra Homelab. Hold inne på Hjem-skjermen og trykk + for å legge til. Låseskjerm-widgets legges til fra låseskjermen.' : 'Alle widgetene fra Homelab. I appen for Android trykker du «Legg til på startskjermen», så legger Android den rett inn. Hold inne på widgeten etterpå for å endre størrelse.';
  return `${pfTabs()}
    <span class="wg43-mut">${esc(intro)} Forhåndsvisningene viser eksempeldata.</span>
    <div class="wg43-chips">${chips.map(([k, n]) => `<button type="button" class="${G.f === k ? 'on' : ''}" aria-pressed="${G.f === k}" data-wg43-f="${esc(k)}">${esc(n)}</button>`).join('')}</div>
    ${list.filter((w) => G.f === 'all' || G.f === w.id).map((w) => `<section class="wg43-g"><div class="wg43-gh"><span class="wg43-gt">${esc(w.kicker)}</span><span class="wg43-mut">${w.sizes.length} ${w.sizes.length === 1 ? 'størrelse' : 'størrelser'}</span></div><div class="wg43-row">${w.sizes.map((s) => card(w, s, pf)).join('')}</div></section>`).join('')}
    ${howSheet()}`;
}
const pfTabs = () => `<div class="wg43-pf" role="tablist" aria-label="Plattform">${[['ios', 'iPhone'], ['android', 'Android'], ['samsung', 'Samsung']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${G.pf === k}" class="${G.pf === k ? 'on' : ''}" data-wg43-pf="${k}">${n}</button>`).join('')}</div>`;
export const widgetsGallery43 = () => `<div class="wg43" data-wg43-root>${inner()}</div>`;
function repaint() { const r = document.querySelector('[data-wg43-root]'); if (r) r.innerHTML = inner(); }

document.addEventListener('click', (e) => {
  const r = e.target.closest?.('[data-wg43-root]'); if (!r) return;
  const b = e.target.closest('[data-wg43-pf],[data-wg43-f],[data-wg43-how],[data-wg43-close]'); if (!b) return;
  if (b.matches('.wg43-bg') && e.target !== b) return;
  e.preventDefault(); e.stopPropagation();
  const d = b.dataset;
  if (d.wg43Pf) { G.pf = d.wg43Pf; G.how = null; }
  else if (d.wg43F) G.f = d.wg43F;
  else if (d.wg43How) { const [id, size] = d.wg43How.split(':'); G.how = { id, size }; }
  else if ('wg43Close' in d) G.how = null;
  repaint();
  if (G.how) r.querySelector('.wg43-done')?.focus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && G.how && document.querySelector('[data-wg43-root]')) { e.stopPropagation(); G.how = null; repaint(); } }, true);

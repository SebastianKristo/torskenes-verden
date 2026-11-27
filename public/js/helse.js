// Helse (prompt 57): brukerens egen Helse-side på web, #/helse (uke) og #/helse/maned (måned).
// Data: GET /api/helse?periode=uke|maned (shared/schemas/api/helse.schema.json). Serveren regner ut alt (i natt, snitt, trender,
// tekstene); siden viser feltene og regner ikke selv. Bare brukerens egne data – familien ser bare det som deles i Familie.
import { api, esc } from './util.js';
import { pageCss } from './lib/page-css.js';

const S = { data: {}, err: null, seq: 0 };
const periodeOf = () => (/^#\/helse\/maned/.test(location.hash) ? 'maned' : 'uke');
const STAGE = { deep: 'hs-st-deep', core: 'hs-st-core', rem: 'hs-st-rem', awake: 'hs-st-awake' };

const card = (cls, title, body, extra = '') => `<section class="hs-card ${cls}" aria-labelledby="hs-h-${cls}"><header class="hs-ch"><h2 id="hs-h-${cls}">${esc(title)}</h2>${extra}</header>${body}</section>`;
const row = (k, v) => (v ? `<div class="hs-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : '');
const none = (t) => `<p class="hs-none">${esc(t)}</p>`;
const dirTxt = { opp: 'opp', ned: 'ned', flat: 'uendret' };

/** Søyler for en serie (én farge, ingen forklaring trengs: tittelen sier hva det er). Hver søyle har verdien som tooltip. */
function bars(serie, fmt) {
  const vals = serie.map((x) => x.value).filter((v) => v != null);
  if (!vals.length) return '';
  const max = Math.max(...vals) || 1, n = serie.length, w = 100 / n;
  const rects = serie.map((x, i) => {
    if (x.value == null) return '';
    const h = Math.max(2, (x.value / max) * 36);
    return `<rect x="${(i * w + w * 0.15).toFixed(2)}" y="${(40 - h).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="1"><title>${esc(`${x.date.slice(8, 10)}.${x.date.slice(5, 7)}: ${fmt(x.value)}`)}</title></rect>`;
  }).join('');
  return `<svg class="hs-bars" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="${esc(`${n} dager`)}">${rects}</svg>`;
}

function sovn(s) {
  const n = s.tonight ?? s.last;
  if (!n) return card('sovn', 'Søvn', none('Ingen søvn registrert ennå.'));
  const tot = n.stages.reduce((a, x) => a + x.min, 0) || 1;
  const stack = n.stages.length ? `<div class="hs-stack" role="img" aria-label="${esc(n.stages.map((x) => `${x.label} ${x.text}`).join(', '))}">${n.stages.map((x) => `<span class="${STAGE[x.key]}" style="flex-grow:${x.min / tot}" title="${esc(`${x.label}: ${x.text}`)}"></span>`).join('')}</div>
    <ul class="hs-legend">${n.stages.map((x) => `<li><i class="${STAGE[x.key]}" aria-hidden="true"></i>${esc(x.label)} <b>${esc(x.text)}</b></li>`).join('')}</ul>` : '';
  const body = `<div class="hs-big">${esc(n.asleepText)}<small>${esc(n.dayText)}</small></div>${stack}
    ${row('I seng', n.bedtime)}${row('Sovnet', n.asleepAt)}${row('Våknet', n.wakeAt)}${row('Tid i seng', n.inBedText)}${row(`Snitt siste ${s.avg7Nights || 7} netter`, s.avg7Text)}`;
  return card('sovn', s.tonight ? 'Søvn i natt' : 'Siste natt', body);
}
function idag(t) {
  const body = `<div class="hs-big">${esc(t.stepsText ?? '–')}<small>skritt</small></div>${row('Distanse gått og løpt', t.distanceText)}${row('Aktiv energi', t.activeKcalText)}${row('Treningstid', t.exerciseText)}${row('Hvilepuls', t.restingHr != null ? `${Math.round(t.restingHr)} bpm` : null)}`;
  return card('idag', 'I dag', body);
}
function trening(w) {
  if (!w.last) return card('trening', 'Trening', none('Ingen treningsøkter i Apple Helse.'));
  const item = (x) => `<li><span><b>${esc(x.label)}</b><small>${esc([x.dayText, x.start].filter(Boolean).join(' kl. '))}</small></span><span>${esc([x.durationText, x.distanceText, x.kcalText].filter(Boolean).join(' · '))}</span></li>`;
  const list = w.items.length ? w.items.slice(0, 8) : [w.last];
  return card('trening', 'Trening', `<p class="hs-sub">${esc(w.totalText)}</p><ul class="hs-list">${list.map(item).join('')}</ul>`);
}
function vekt(v) {
  if (!v) return card('vekt', 'Vekt', none('Ingen vekt i Apple Helse.'));
  const kg = (x) => `${String(x).replace('.', ',')} kg`;
  return card('vekt', 'Vekt', `<div class="hs-big">${esc(v.kgText)}<small>${esc(`målt ${v.dayText}`)}</small></div>${v.changeText ? `<p class="hs-sub hs-dir-${esc(v.direction ?? 'flat')}">${esc(v.changeText)}</p>` : ''}${v.serie.length > 1 ? bars(v.serie, kg) : ''}`);
}
function trender(list, d) {
  const fmt = { steps: (v) => `${Math.round(v)} skritt`, sleep: (v) => `${Math.floor(v / 60)} t ${Math.round(v % 60)} m`, distance: (v) => `${(v / 1000).toFixed(1).replace('.', ',')} km`, activeKcal: (v) => `${Math.round(v)} kcal`, exercise: (v) => `${Math.round(v)} min`, restingHr: (v) => `${Math.round(v)} bpm` };
  const items = list.filter((t) => t.avg != null).map((t) => `<li class="hs-trend"><div class="hs-tt"><span>${esc(t.label)}</span><b>${esc(t.avgText)}</b>${t.changeText ? `<small class="hs-dir-${esc(t.direction ?? 'flat')}" aria-label="${esc(`${dirTxt[t.direction] ?? ''} ${t.changeText}`)}">${esc(t.changeText)}</small>` : ''}</div>${bars(t.serie, fmt[t.key] ?? String)}</li>`).join('');
  return card('trender', d.periode === 'maned' ? 'Trender siste 30 dager' : 'Trender siste 7 dager', items ? `<p class="hs-sub">Snitt per dag, mot perioden før.</p><ul class="hs-trends">${items}</ul>` : none('Ingen data i perioden.'));
}

function paint(root) {
  const per = periodeOf(), d = S.data[per];
  const seg = `<div class="hs-seg" role="group" aria-label="Periode">${[['uke', 'Uke', '#/helse'], ['maned', 'Måned', '#/helse/maned']].map(([k, t, h]) => `<a href="${h}" aria-current="${k === per ? 'page' : 'false'}">${t}</a>`).join('')}</div>`;
  const head = `<header class="hs-head"><div><h1>Helse</h1><p class="hs-sum">${esc(d?.summary ?? (d?.empty ? 'Ingen helsedata ennå.' : ' '))}</p></div>${seg}</header>`;
  let body;
  if (!d) body = S.err ? `<div class="hs-card hs-err" role="alert">${esc(S.err)}</div>` : '<div class="hs-card hs-loading" aria-busy="true">Laster …</div>';
  else if (d.empty) body = `<div class="hs-card hs-empty"><h2>Ingen helsedata ennå</h2><p>Helsedata kommer fra Apple Helse i iOS-appen. Slå det på under Innstillinger → Husstand → Helse i appen.</p></div>`;
  else body = `<div class="hs-grid">${sovn(d.sleep)}${idag(d.today)}${trening(d.workouts)}${vekt(d.weight)}</div>${trender(d.trends, d)}`;
  const foot = '<p class="hs-priv">Bare du ser denne siden. Familien ser bare det du har valgt å dele under <a href="#/familie">Familie</a>.</p>';
  root.innerHTML = `${head}${body}${foot}`;
  root.removeAttribute('aria-busy');
}

async function load(root) {
  const per = periodeOf(), seq = ++S.seq;
  try { S.data[per] = await api(`/helse?periode=${per}`); S.err = null; } catch (e) { S.err = `Kunne ikke hente helsedata: ${e.message}`; }
  if (seq === S.seq && root.isConnected) paint(root);
}

export function render() {
  pageCss('helse');
  setTimeout(() => { const root = document.getElementById('hs-root'); if (root) { paint(root); load(root); } });
  return '<section class="hs" id="hs-root" aria-label="Helse" aria-busy="true"></section>';
}

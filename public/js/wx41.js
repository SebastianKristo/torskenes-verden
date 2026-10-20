// Prompt 41 (claude-code-vaer-rediger-ski-julfigur.md): Vær på web – rediger kort (hold inne 0,6 s eller «Rediger kort»),
// Glimt-kortet øverst/nederst, og «Skiføre · Nordmarka» med Glimts smøreråd når det er skiføre.
// Rekkefølge og skjulte kort lagres per bruker: GET/PUT /api/weather/layout {order, hidden, ski, glimt:'top'|'bottom'} med serverens
// kortnavn (na, ski, timer, dager10, yrstorm, vind, mane, detaljer, glimtuka); localStorage «vaer_layout» som reserve.
// Skidata kommer fra serveren (GET /api/weather/full får ski:{text, wax, grip, glide, places[{snowCm, newCm, tempC, humidity}]} når
// det er skiføre og «Skiføre» ikke er slått av), aldri direkte fra Open-Meteo (CSP).
import { api, esc } from './util.js';
import { fig } from './glimt-figs.js';

export const VO_KEYS = ['hero', 'ski', 'hour', 'days', 'cmp', 'wind', 'moon', 'tiles', 'glimt'];
const N = { hero: ['Nå', 'Temperatur og sted'], ski: ['Skiføre', 'Glimt anbefaler smøring · vises når det er snø'], hour: ['Time for time', ''], days: ['10 dager', 'Med kartet'], cmp: ['Yr mot Storm', ''], wind: ['Vind', ''], moon: ['Måne', 'Sol og måne'], tiles: ['Detaljer', 'UV, følt, nedbør, sikt, fuktighet, trykk'], glimt: ['Glimt · uka', 'Ukas vær mot forrige uke'] };
const V = { ed: false, vo: null, ski: undefined, srv: null, srvLoaded: false };
const TO_SRV = { hero: 'na', ski: 'ski', hour: 'timer', days: 'dager10', cmp: 'yrstorm', wind: 'vind', moon: 'mane', tiles: 'detaljer', glimt: 'glimtuka' };
const FROM_SRV = Object.fromEntries(Object.entries(TO_SRV).map(([a, b]) => [b, a]));
/** Henter lagret oppsett fra serveren én gang (404 = eldre server: bare lokalt). */
export function loadLayout41(repaint) {
  if (V.srvLoaded) return;
  V.srvLoaded = true;
  api('/weather/layout').then((r) => {
    if (!r || !Array.isArray(r.order)) return;
    const ord = r.order.map((k) => FROM_SRV[k]).filter(Boolean);
    const hid = (r.hidden ?? []).map((k) => FROM_SRV[k]).filter(Boolean);
    let o = ord.filter((k) => k !== 'glimt');
    if (r.glimt === 'top') o.splice(1, 0, 'glimt'); else o.push('glimt');
    V.vo = { ord: o, hid, ski: r.ski !== false };
    try { localStorage.setItem('vaer_layout', JSON.stringify(V.vo)); } catch { /* */ }
    repaint?.();
  }).catch(() => {});
}

export function voGet() {
  let v = V.vo;
  if (!v) { try { v = JSON.parse(localStorage.getItem('vaer_layout') || 'null'); } catch { v = null; } }
  v = v || {};
  const ord = [...(v.ord || []).filter((k) => VO_KEYS.includes(k)), ...VO_KEYS.filter((k) => !(v.ord || []).includes(k))];
  return { ord, hid: Array.isArray(v.hid) ? v.hid : [], ski: v.ski !== false };
}
let saveT = 0;
function voSet(o, repaint) {
  const v = { ...voGet(), ...o };
  V.vo = v;
  try { localStorage.setItem('vaer_layout', JSON.stringify(v)); } catch { /* privat modus */ }
  clearTimeout(saveT); saveT = setTimeout(() => api('/weather/layout', { method: 'PUT', json: { order: v.ord.map((k) => TO_SRV[k]), hidden: v.hid.map((k) => TO_SRV[k]), ski: v.ski, glimt: v.ord.indexOf('glimt') <= 1 ? 'top' : 'bottom' } }).catch(() => {}), 600);
  repaint?.();
}
export const voOrder = (k) => voGet().ord.indexOf(k);
export const voShown = (k) => { const v = voGet(); if (v.hid.includes(k)) return false; if (k === 'ski') return v.ski && skiHas(); return true; };
export const glimtTop = () => voGet().ord.indexOf('glimt') <= 1;
export const voEditing = () => V.ed;

/* ---------- Skiføre ---------- */
function normSki(r) {
  if (!r || typeof r !== 'object') return null;
  const s = r.ski ?? r;
  const p = (Array.isArray(s.places) ? s.places[0] : null) ?? s;
  const depth = p.snowCm ?? p.snowDepthCm ?? p.depthCm ?? (p.snow_depth != null ? p.snow_depth * 100 : null);
  const strip = (x, k) => (x ? String(x).replace(new RegExp(`^${k}:\\s*`, 'i'), '') : null);
  return { text: s.text ?? '', area: (p.name ?? s.area ?? 'Nordmarka'), depth, fresh: p.newCm ?? p.freshCm ?? p.fresh ?? 0, t: p.tempC ?? p.temp ?? null, rh: p.humidity ?? p.rh ?? null, thaw: !!(p.thaw ?? s.refrozen), at: s.updatedAt ?? s.at ?? null,
    wax: s.wax ?? null, kick: strip(s.grip, 'Feste'), glide: strip(s.glide, 'Glid'), relevant: true, url: p.url ?? null };
}
/** Skidata fra /api/weather/full (ski finnes bare når det er skiføre). */
export function loadSki41(full, repaint) {
  V.ski = normSki(full?.ski);
  loadLayout41(repaint);
}
function skiHas() { const s = V.ski; return !!s && (s.relevant === true || (s.relevant !== false && (s.depth ?? 0) >= 15)); }
/** Smøreråd etter reglene i specen (reserve når Glimt-teksten mangler). */
export function skiAdvice(X) {
  const t = X.t ?? -4, fresh = X.fresh || 0, old = fresh < 1, icy = old && X.thaw;
  let kick, wax, txt;
  if (icy) { kick = 'Blå klister'; wax = 'Blå klister · skareføre'; txt = 'Snøen har tint og frosset igjen. Bruk blå klister i festesonen, varm det inn og la det kjølne før du går.'; }
  else if (t <= -10) { kick = 'Grønn (V20)'; wax = 'Grønn voks · kaldt og tørt'; txt = 'Kald og tørr snø. Tynne lag grønn voks, kork godt. Gir godt feste og fin glid.'; }
  else if (t <= -3) { kick = fresh >= 2 ? 'Blå (V30)' : 'Blå ekstra (V40)'; wax = `${kick} · ${fresh >= 2 ? 'nysnø' : 'fint føre'}`; txt = fresh >= 2 ? `Nysnø i marka (${Math.round(fresh)} cm siste dager). Blå voks i 3–4 tynne lag gir feste uten at det ises.` : 'Stabilt vinterføre. Blå ekstra holder godt; legg på et ekstra lag hvis du glipper i motbakkene.'; }
  else if (t <= 0) { kick = 'Fiolett (V45)'; wax = 'Fiolett · rundt null'; txt = 'Rundt null grader og fuktig. Fiolett voks, og ha rød i lomma hvis sola kommer fram. Se opp for ising i skyggen.'; }
  else { kick = 'Rød (V55) / universalklister'; wax = 'Rød voks eller klister · vått føre'; txt = 'Plussgrader og våt snø. Rød voks på ny snø, universalklister hvis snøen er grovkornet. Felleski er et godt valg i dag.'; }
  const glide = t <= -8 ? 'Kald (blå)' : t <= -2 ? 'Universal (fiolett)' : 'Varm (gul/rød)';
  return { kick, wax, txt, glide };
}
export function skiCardHtml41() {
  const X = V.ski;
  if (!X || !voShown('ski')) return '';
  const A = skiAdvice(X), wax = X.wax || A.wax, txt = X.text || A.txt, kick = X.kick || A.kick;
  const at = X.at ? new Date(X.at) : null, upd = at && Number.isFinite(at.getTime()) ? `oppdatert ${at.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : '';
  const st = [['Snødybde', X.depth != null ? `${Math.round(X.depth)} cm` : '–'], ['Ny snø', `${Math.round(X.fresh || 0)} cm`], ['Temp.', X.t != null ? `${Math.round(X.t)}°` : '–'], ['Fukt', X.rh != null ? `${Math.round(X.rh)} %` : '–']];
  return `<section class="wx41-ski" aria-label="Skiføre">
    <div class="wx41-skh"><span>SKIFØRE · ${esc(String(X.area).toUpperCase())}</span><span>${esc(upd)}</span></div>
    <div class="wx41-skb"><span class="wx41-skf">${fig('spire', 54, 'glad')}</span><span class="wx41-skt"><span class="wx41-ska">✦ GLIMT ANBEFALER</span><b>${esc(wax)}</b><span>${esc(txt)}</span></span></div>
    <div class="wx41-sks">${st.map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="wx41-skc"><span>${esc(`Feste: ${kick}`)}</span><span>${esc(`Glid: ${X.glide || A.glide}`)}</span><i></i><a href="${esc(/^https:\/\//.test(X.url ?? '') ? X.url : 'https://skisporet.no/')}" target="_blank" rel="noopener noreferrer">Løyper ↗</a></div></section>`;
}

/* ---------- Rediger kort ---------- */
function sheetHtml() {
  const v = voGet(), gTop = glimtTop();
  const rows = v.ord.map((k, i) => {
    const on = k === 'ski' ? v.ski && !v.hid.includes(k) : !v.hid.includes(k);
    const sub = k === 'ski' && !skiHas() ? 'Ingen snø i marka nå · vises når det er skiføre' : N[k][1];
    return `<div class="wx41-er"><span class="wx41-en${on ? '' : ' off'}"><b>${esc(N[k][0])}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
      <button type="button" data-vo41="up" data-k="${k}" aria-label="Flytt ${esc(N[k][0])} opp"${i ? '' : ' disabled'}>↑</button><button type="button" data-vo41="dn" data-k="${k}" aria-label="Flytt ${esc(N[k][0])} ned"${i < v.ord.length - 1 ? '' : ' disabled'}>↓</button>
      <button type="button" class="wx41-tg${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-vo41="tog" data-k="${k}" aria-label="Vis ${esc(N[k][0])}"><i></i></button></div>`;
  }).join('');
  return `<div class="wx41-sheet" role="dialog" aria-label="Rediger Vær"><span class="wx41-grab"></span>
    <div class="wx41-sh"><b>Rediger Vær</b><button type="button" class="wx41-done" data-vo41="done">Ferdig</button></div>
    <span class="wx41-hint">Flytt kort opp eller ned, eller skjul dem. Siden kan fortsatt scrolles.</span>
    <div class="wx41-list">${rows}</div>
    <div class="wx41-btns"><button type="button" data-vo41="glimt">${gTop ? 'Glimt-kortet nederst' : 'Glimt-kortet øverst'}</button><button type="button" class="ghost" data-vo41="reset">Nullstill</button></div></div>`;
}
/** Etter hver tegning av Vær: rekkefølge (CSS order), vugging og arket. */
export function afterPaint41(r, repaint) {
  if (!r) return;
  r.classList.toggle('wx41-ed', V.ed);
  let host = r.querySelector('.wx41-host');
  if (!host) { host = document.createElement('div'); host.className = 'wx41-host'; r.appendChild(host); }
  host.innerHTML = V.ed ? sheetHtml() : '';
  if (r.dataset.vo41) return;
  r.dataset.vo41 = '1';
  let t = 0, x0 = 0, y0 = 0;
  r.addEventListener('pointerdown', (e) => {
    if (V.ed || e.button > 0 || e.target.closest('button,a,input,select,textarea,.wxp-layer,.wx41-host,iframe')) return;
    if (!e.target.closest('[data-vo41k]')) return;
    x0 = e.clientX; y0 = e.clientY; clearTimeout(t);
    t = setTimeout(() => { t = 0; try { navigator.vibrate?.(15); } catch { /* */ } V.ed = true; repaint(); }, 600);
  });
  const cancel = () => { clearTimeout(t); t = 0; };
  r.addEventListener('pointermove', (e) => { if (t && (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8)) cancel(); });
  r.addEventListener('pointerup', cancel); r.addEventListener('pointercancel', cancel);
  r.addEventListener('scroll', cancel, true);
  r.addEventListener('contextmenu', (e) => { if (V.ed && e.target.closest('[data-vo41k]')) e.preventDefault(); });
  r.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vo41]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.dataset.vo41, k = b.dataset.k, v = voGet();
    if (a === 'start') { V.ed = true; return repaint(); }
    if (a === 'done') { V.ed = false; return repaint(); }
    if (a === 'up' || a === 'dn') { const L = [...v.ord], i = L.indexOf(k), j = i + (a === 'up' ? -1 : 1); if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; try { navigator.vibrate?.(6); } catch { /* */ } return voSet({ ord: L }, repaint); }
    if (a === 'tog') { if (k === 'ski') { const on = v.ski && !v.hid.includes('ski'); return voSet({ ski: !on, hid: v.hid.filter((x) => x !== 'ski') }, repaint); } const on = !v.hid.includes(k); return voSet({ hid: on ? [...v.hid, k] : v.hid.filter((x) => x !== k) }, repaint); }
    if (a === 'glimt') { const L = v.ord.filter((x) => x !== 'glimt'); if (glimtTop()) L.push('glimt'); else L.splice(1, 0, 'glimt'); return voSet({ ord: L }, repaint); }
    if (a === 'reset') { V.vo = null; try { localStorage.removeItem('vaer_layout'); } catch { /* */ } api('/weather/layout', { method: 'PUT', json: { reset: true } }).catch(() => {}); return repaint(); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && V.ed && document.getElementById('wxp')) { V.ed = false; repaint(); } });
}
/** Attributter for et kort: rekkefølge og nøkkel (for hold-inne). */
export const voAttr = (k) => `data-vo41k="${k}" style="order:${voOrder(k)}"`;
export const editBtn41 = () => '<button type="button" class="wx41-edbtn" data-vo41="start">Rediger kort</button>';

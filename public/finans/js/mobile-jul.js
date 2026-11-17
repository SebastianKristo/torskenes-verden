// Julemodus (prompt 40, claude-code-glimt-jul.md, fasit glimt-figurer.js julOn/dress): kortet i Innstillinger → Glimt
// (Auto · Av · På + fase, snø, julelyd) og antrekket på Glimt-figuren overalt. Skilt ut av mobile-jul-og-totrinn.js (nå
// mobile-glimt-tillegg.js), som tar hendelsene (data-p40="jul…", sanntid glimt:settings) og sender dem hit.
import { esc, hlApi } from './core.js';
import { draw } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { lsGet, lsSet, lsRaw, lsRawSet } from './mobile-lagring.js';

/* =====================================================================
   Julemodus (Innstillinger → Glimt og AI → Glimt) + antrekk overalt
   ===================================================================== */
const PH = [['Advent', 'advent'], ['Jul', 'jul'], ['Nyttår', 'nyttar'], ['Vinter', 'vinter']];
const J = { snow: lsGet('glimt_snow', true) !== false, sound: lsRaw('glimt_jul_sound', 'av') };
const julMode = () => { const v = lsRaw('glimt_jul', 'auto'); return v === 'av' || v === 'pa' ? v : 'auto'; };
const julPh = () => { const v = lsRaw('glimt_jul_p', 'Advent'); return PH.some(([n]) => n === v) ? v : 'Advent'; };
/** Fasen som gjelder nå (fasit julOn): null utenfor perioden eller når Av. */
export function julOn(d = new Date()) {
  const mo = julMode();
  if (mo === 'av') return null;
  if (mo === 'pa') return julPh();
  const M = d.getMonth(), D = d.getDate();
  if (M === 11) return D <= 23 ? 'Advent' : D <= 30 ? 'Jul' : 'Nyttår';
  if (M === 0) return D === 1 ? 'Nyttår' : D <= 13 ? 'Vinter' : null;
  return null;
}
function julNote() {
  const mo = julMode(), ph = julOn();
  if (mo === 'av') return 'Av hele året';
  if (mo === 'pa') return `På · ${julPh()}`;
  return ph ? 'På nå · slås av 13. januar' : 'Slås på 1. desember';
}
function julSet(mode, phase) {
  if (mode) lsRawSet('glimt_jul', mode);
  if (phase) lsRawSet('glimt_jul_p', phase);
  try { window.dispatchEvent(new Event('glimt-jul')); } catch {}
  const P = PH.find(([n]) => n === julPh())?.[1] ?? 'advent';
  hlApi('/glimt/settings', { method: 'PUT', json: { jul: julMode(), julPhase: julMode() === 'pa' ? P : null } }).catch(() => {});
  haptic('tab'); draw();
}
export function julTake(r) {
  if (!r || typeof r !== 'object') return;
  let ch = false;
  if (['auto', 'av', 'pa'].includes(r.jul) && r.jul !== julMode()) { lsRawSet('glimt_jul', r.jul); ch = true; }
  const p = PH.find(([, k]) => k === r.julPhase)?.[0]; if (p && p !== julPh()) { lsRawSet('glimt_jul_p', p); ch = true; }
  if (typeof r.snow === 'boolean' && r.snow !== J.snow) { J.snow = r.snow; lsSet('glimt_snow', r.snow); ch = true; }
  if ((r.julSound === 'av' || r.julSound === 'bjelle') && r.julSound !== J.sound) { J.sound = r.julSound; lsRawSet('glimt_jul_sound', r.julSound); ch = true; }
  if (ch) { try { window.dispatchEvent(new Event('glimt-jul')); } catch {} }
}
const HAT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 18 Q9 5 18 5 Q20 6 20 8 Q16 8 15 18 Z"/><path d="M3 18h14"/><circle cx="20" cy="8" r="1.6"/></svg>';
/** Kortet rett under figurvalget (fasit Glimt Brief.dc.html, mode settings). */
export function julCard() {
  const mo = julMode(), sw = (on) => `<span class="p35-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
  return `<span class="p35-lab">JULEMODUS</span><div class="p40-jul">
    <div class="p40-julh"><span class="p40-juli">${HAT}</span><span class="p40-jult"><b>Julemodus</b><span>${esc(julNote())}</span></span></div>
    <div class="p40-seg" role="radiogroup" aria-label="Julemodus">${[['auto', 'Auto'], ['av', 'Av'], ['pa', 'På']].map(([k, n]) => `<button type="button" data-p40="jul" data-v="${k}" role="radio" aria-checked="${mo === k}">${n}</button>`).join('')}</div>
    ${mo === 'pa' ? `<div class="p40-jph">${PH.map(([n]) => `<button type="button" data-p40="julp" data-v="${n}" aria-pressed="${julPh() === n}">${n}</button>`).join('')}</div>` : ''}
    <span class="p40-julx">Auto: 1. desember til 13. januar (advent, jul, nyttår og vinter). Glimt får lue og skjerf overalt, og en varmere tone.</span></div>
  <div class="p35-list"><button type="button" class="p35-row" data-p40="julsnow" role="switch" aria-checked="${J.snow}"><span class="p35-rt"><b>Snø i Vær og brief</b><span>Når det snør eller er minus</span></span>${sw(J.snow)}</button>
    <div class="p35-row"><span class="p35-rt"><b>Julelyd på varsler</b><span>${J.sound === 'bjelle' ? 'Myk bjelle (lav og kort)' : 'Av'}</span></span><div class="p40-seg sm">${[['av', 'Av'], ['bjelle', 'Bjelle']].map(([k, n]) => `<button type="button" data-p40="julsnd" data-v="${k}" aria-pressed="${J.sound === k}">${n}</button>`).join('')}</div></div></div>`;
}
const ab = (st) => `position:absolute;pointer-events:none;${st}`;
/** Antrekket (fasit dress) som HTML rundt figuren. Brukes bare når figurbiblioteket ikke gjør det selv. */
export function dress(html, S = 56) {
  const ph = julOn(); if (!ph || !html) return html;
  const P = { Advent: { hat: 1, scarf: 1 }, Jul: { hat: 1, scarf: 1, gift: 1 }, Nyttår: { party: 1 }, Vinter: { beanie: 1, scarf: 1, sc: '#b23a2a' } }[ph] ?? {};
  const k = [];
  if (P.scarf) k.push(`<svg width="${S * 1.05}" height="${S * 0.5}" viewBox="0 0 105 50" style="${ab(`left:50%;bottom:${-S * 0.2}px;margin-left:${-S * 0.525}px;overflow:visible`)}"><path d="M8 10 Q52 26 97 10 L95 24 Q52 40 10 24 Z" fill="${P.sc || '#2f7a4f'}"/><path d="M22 16 l4 12 M40 20 l3 13 M58 20 l-1 13 M76 17 l-3 12" stroke="#f6f1e7" stroke-width="3"/><path d="M70 22 L80 48 L68 50 L62 26 Z" fill="${P.sc || '#2f7a4f'}"/></svg>`);
  if (P.hat) k.push(`<svg width="${S * 0.95}" height="${S * 0.7}" viewBox="0 0 95 70" style="${ab(`left:50%;top:${-S * 0.44}px;margin-left:${-S * 0.42}px;transform:rotate(-14deg);overflow:visible`)}"><path d="M14 56 Q40 4 74 8 Q86 10 88 20 Q70 18 66 56 Z" fill="#c8302a"/><circle cx="89" cy="22" r="8" fill="#fbf7ee"/><rect x="6" y="50" width="70" height="15" rx="7.5" fill="#fbf7ee"/></svg>`);
  if (P.beanie) k.push(`<svg width="${S * 0.9}" height="${S * 0.6}" viewBox="0 0 90 60" style="${ab(`left:50%;top:${-S * 0.36}px;margin-left:${-S * 0.45}px;overflow:visible`)}"><path d="M10 50 Q10 10 45 10 Q80 10 80 50 Z" fill="#3b6fb0"/><rect x="6" y="42" width="78" height="14" rx="6" fill="#2b5d8a"/><circle cx="45" cy="8" r="8" fill="#fbf7ee"/></svg>`);
  if (P.party) k.push(`<svg width="${S * 0.6}" height="${S * 0.62}" viewBox="0 0 60 62" style="${ab(`left:50%;top:${-S * 0.48}px;margin-left:${-S * 0.22}px;transform:rotate(12deg);overflow:visible`)}"><path d="M8 56 L30 4 L52 56 Z" fill="#1b1a17"/><path d="M14 42 L46 42 M19 30 L41 30 M24 18 L36 18" stroke="#f2c14e" stroke-width="3"/><circle cx="30" cy="4" r="5" fill="#f2c14e"/></svg>`);
  if (P.gift) k.push(`<span style="${ab(`right:${-S * 0.2}px;bottom:${-S * 0.16}px;width:${S * 0.34}px;height:${S * 0.3}px;border-radius:4px;background:#b23a2a;box-shadow:inset 0 0 0 2px #8a2a1d;transform:rotate(8deg)`)}"><span style="position:absolute;left:44%;top:0;bottom:0;width:12%;background:#f2c14e"></span><span style="position:absolute;top:40%;left:0;right:0;height:14%;background:#f2c14e"></span></span>`);
  return `<span class="p40-dress" style="position:relative;display:inline-block;line-height:0">${html}${k.join('')}</span>`;
}

/** Hendelsene fra bind40 for data-p40="jul…". */
export function julBind(k, x) {
  switch (k) {
    case 'jul': julSet(x.dataset.v); return true;
    case 'julp': julSet('pa', x.dataset.v); return true;
    case 'julsnow': J.snow = !J.snow; lsSet('glimt_snow', J.snow); hlApi('/glimt/settings', { method: 'PUT', json: { snow: J.snow } }).catch(() => {}); haptic('tab'); draw(); return true;
    case 'julsnd': J.sound = x.dataset.v; lsRawSet('glimt_jul_sound', J.sound); hlApi('/glimt/settings', { method: 'PUT', json: { julSound: J.sound } }).catch(() => {}); haptic('tab'); draw(); return true;
    default: return false;
  }
}

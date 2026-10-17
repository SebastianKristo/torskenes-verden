// Felles for Hjem, Matplan og Domener: en liten tilstandsholder per side og logoer.
import { esc, logoImg } from './util.js';

export const n0 = (v) => Math.round(Math.abs(+v || 0)).toLocaleString('nb-NO');
export const ddmmyyyy = (d) => (d ? d.split('-').reverse().join('.') : '–');

// Logo med forbokstaver bak, så en logo som ikke finnes ikke blir en tom hvit boks.
export const logo = (domain, name = '') => logoImg(domain, name, 'logo-lg');

// Tegner sidens innhold i #<id> når data kommer, uten å tegne hele visningen på nytt.
export function page(id, draw) {
  const st = { data: null, error: null, busy: false, msg: '' };
  const paint = () => { const el = document.getElementById(id); if (el) el.innerHTML = body(); };
  const body = () => {
    if (st.error && !st.data) return `<div class="fcard err">${esc(st.error)}</div>`;
    if (!st.data) return '<div class="skeleton" style="min-height:240px;border-radius:18px"></div>';
    try { return draw(st); } catch (e) { console.error(e); return `<div class="fcard err">Feil i visningen: ${esc(e.message)}</div>`; }
  };
  const load = async (fn) => {
    try { st.data = await fn(); st.error = null; } catch (e) { st.error = e.message; }
    paint();
  };
  return { st, paint, load, html: () => `<div id="${id}" class="fx">${body()}</div>` };
}

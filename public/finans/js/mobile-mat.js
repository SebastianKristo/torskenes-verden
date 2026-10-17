// Matplan i mobilappen: egen flate med lyst «matapp»-utseende (og mørk modus). Ingen Finans-fanelinje eller skanneknapp;
// bare pilen tilbake øverst og profilmenyen. Samme data som Matplan på web (/mat/api).
import { esc, matApi, today } from './core.js';
import { m, draw, flash, meName } from './mobile.js';
import { LAY, saveLayout } from './mobile-hl.js';

const M = { w: null, err: '', sel: null, busy: false };
const AB = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const DN = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
// Farger for initial-rutene til ingrediensene (lys / mørk).
const BG = { light: ['#E4F0A9', '#FBEACB', '#DCEBE6', '#F6D9CF', '#E8E2F4'], dark: ['#3B4421', '#3D3323', '#24403A', '#4A2E26', '#36304A'] };

export const matDark = () => {
  const t = LAY().matTheme ?? 'light';
  return t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
};

export async function matLoad() {
  M.err = '';
  try { M.w = await matApi('/week'); } catch (e) { M.err = `Matplan er ikke tilgjengelig: ${e.message}`; }
  const ti = (M.w?.days ?? []).findIndex((d) => d.today || d.date === today());
  if (M.sel == null || M.sel >= (M.w?.days?.length ?? 0)) M.sel = ti >= 0 ? ti : 0;
}

const d8 = (iso) => new Date(iso + 'T12:00:00');
const tagOf = (d) => (d.tag === 'best' && d.bestCook ? `★ ${d.bestCook}${/s$/i.test(d.bestCook) ? "'" : 's'} beste` : d.tag === 'hellofresh' || d.source === 'hellofresh' ? 'HelloFresh' : '');
const ingIni = (n) => (String(n).replace(/^[0-9\s.,/½¼]+(g|kg|dl|l|ml|ss|ts|stk|pose|poser|boks|bokser|pk|pakke|fedd|neve)?\s+/i, '') || n).slice(0, 1).toUpperCase();

export function matView() {
  const dark = matDark(), w = M.w;
  const head = (right = '') => `<div class="mp-head"><div class="m-grow"><div class="mp-hi">Hei, <b>${esc(meName())}</b></div><div class="mp-title">Middag denne uka</div>${right}</div>
    <div class="mp-btns"><button class="mp-round" data-mp="theme" aria-label="${dark ? 'Bytt til lyst utseende' : 'Bytt til mørkt utseende'}" title="${dark ? 'Lyst utseende' : 'Mørkt utseende'}">${dark ? '☀' : '☾'}</button><button class="mp-round" data-mp="week" aria-label="Ny ukeplan med AI" ${M.busy ? 'disabled' : ''}>✦</button></div></div>`;
  if (M.err) return `<div class="mat">${head()}<div class="mp-card mp-empty">${esc(M.err)}</div><a class="mp-cta" href="/#/matplan">Åpne Matplan i nettleseren</a></div>`;
  if (!w) return `<div class="mat">${head()}<div class="mp-card mp-empty"><div class="m-spin"></div></div></div>`;
  const days = w.days ?? [], ti = Math.max(0, days.findIndex((d) => d.today || d.date === today())), sel = Math.min(M.sel ?? ti, days.length - 1), x = days[sel] ?? {};
  const s = d8(w.start), e = d8(w.end);
  const wk = `<div class="mp-week">UKE ${w.week} · ${s.getDate()}.–${e.getDate()}. ${MON[e.getMonth()].toUpperCase()}</div>`;
  const dish = (w.dishes ?? []).find((y) => y.id === x.dishId || y.name === x.name) ?? {};
  const ing = x.ingredients ?? dish.ing ?? [], steps = dish.steps ?? [];
  const td = days[ti] ?? {}, tdd = d8(td.date ?? w.start), tag = tagOf(x);
  const shop = w.shopping ?? [], have = new Set(shop.map((z) => String(z.text).toLowerCase()));
  const allIn = ing.length > 0 && ing.every((n) => have.has(String(n).toLowerCase()));
  const left = shop.filter((z) => !z.done).length, bg = BG[dark ? 'dark' : 'light'];
  return `<div class="mat">${head(wk)}
    <div class="mp-row3">
      <div class="mp-tile white"><div class="mp-tt"><span>I dag</span><i style="color:var(--mp-red)">●</i></div><div><small>${DN[(tdd.getDay() + 6) % 7]} ${tdd.getDate()}. ${MON[tdd.getMonth()]}</small><b class="mp-clamp">${esc(td.name || 'Ingen rett')}</b></div></div>
      <div class="mp-tile lime"><span>Kokk i dag</span><div><small>Lager middag</small><b class="mp-big">${esc(td.cook || '–')}</b></div></div>
      <div class="mp-tile cream"><span>Faste dager</span><div><small class="mp-clamp">${esc((w.fixed ?? []).map((f) => `${AB[f.index]} ${f.name}`).join(' · ') || 'Ingen ennå')}</small><b class="mp-big">${(w.fixed ?? []).length}<em> av 7</em></b></div></div>
    </div>
    <div class="mp-days" role="tablist" aria-label="Dager">${days.map((y, i) => `<button class="mp-day" role="tab" data-mp="day" data-i="${i}" aria-selected="${i === sel}">${AB[i]} ${d8(y.date).getDate()}</button>`).join('')}</div>
    <div class="mp-sel">
      <div class="m-row" style="align-items:flex-start;gap:12px"><div class="m-grow" style="min-width:0"><div class="mp-selday">${(DN[sel] + (sel === ti ? ' · i dag' : '')).toUpperCase()}</div><div class="mp-dish">${esc(x.name || 'Ingen rett')}</div>${tag ? `<div class="mp-tag">${esc(tag)}</div>` : ''}</div>
        <button class="mp-round sm" data-mp="regen" data-date="${esc(x.date ?? '')}" aria-label="Foreslå en annen rett" ${M.busy ? 'disabled' : ''} style="color:var(--mp-red)">✦</button></div>
      <div style="flex:1"></div>
      <div class="mp-stats"><div><b>${ing.length}</b><span>Ingredienser</span><i style="background:var(--mp-lime)"></i></div><div><b>${steps.length}</b><span>Steg</span><i style="background:var(--mp-mint)"></i></div><div style="min-width:0"><b class="mp-cook">${esc(x.cook || '–')}</b><span>Kokk</span><i style="background:var(--mp-peach)"></i></div></div>
    </div>
    ${x.dishId ? `<div class="mp-card pad"><div class="mp-h">Alltid på</div><div class="mp-sub">${(dish.fixedDays ?? []).length ? `${esc(x.name)} legges på hver ${dish.fixedDays.map((i) => DN[i].toLowerCase()).join(', ')}. AI og ny ukeplan endrer ikke faste dager.` : `Velg dagene ${esc(x.name)} alltid skal stå på.`}</div>
      <div class="mp-days" role="group" aria-label="Alltid på" style="margin-top:10px">${AB.map((ab, i) => { const on = (dish.fixedDays ?? []).includes(i), other = (w.fixed ?? []).find((f) => f.index === i && f.dishId !== dish.id); return `<button class="mp-day" data-mp="always" data-wd="${i}" aria-pressed="${on}" aria-selected="${on}" title="${other && !on ? `Erstatter ${esc(other.name)}` : ''}">${ab}${other && !on ? '·' : ''}</button>`; }).join('')}</div></div>` : ''}
    <div class="mp-card"><div class="mp-ch"><div><div class="mp-h">Ingredienser</div><div class="mp-sub">${ing.length} ${ing.length === 1 ? 'ingrediens' : 'ingredienser'}</div></div><button class="mp-soft" data-mp="toshop" aria-label="Legg i handlelisten">${allIn ? '✓ I listen' : 'Legg i handlelisten'}</button></div>
      ${ing.map((n, i) => `<div class="mp-ing"><span class="mp-ini" style="background:${bg[i % bg.length]}">${esc(ingIni(n))}</span><span class="m-grow">${esc(n)}</span></div>`).join('') || '<div class="mp-sub" style="padding:14px 6px">Ingen ingredienser lagt inn for denne retten.</div>'}</div>
    ${steps.length ? `<div class="mp-card pad"><div class="mp-h">Slik gjør du</div>${steps.map((t, i) => `<div class="mp-step"><span>${i + 1}</span><p>${esc(t)}</p></div>`).join('')}</div>` : ''}
    <div class="mp-card shop"><div class="mp-ch base"><div class="mp-h">Handleliste</div><span class="mp-sub">${left} igjen</span></div>
      ${(M.all ? shop : shop.slice(0, 10)).map((z) => `<button class="mp-shop${z.done ? ' done' : ''}" data-mp="shop" data-id="${esc(z.id)}" role="checkbox" aria-checked="${!!z.done}"><span class="mp-ck">${z.done ? '✓' : ''}</span><span class="m-grow">${esc(z.text)}</span></button>`).join('') || '<div class="mp-sub" style="padding:10px 0 12px">Tom. Trykk «Legg i handlelisten» over.</div>'}
      ${shop.length > 10 ? `<button class="mp-more" data-mp="all">${M.all ? 'Vis færre' : `Vis alle ${shop.length} varer`}</button>` : ''}</div>
    <a class="mp-cta" href="/#/matplan">Se hele uka og alle retter</a>
  </div>`;
}

export async function matBind(e, t) {
  if (m.screen !== 'mat' || e.type !== 'click') return false;
  const x = t.closest?.('[data-mp]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.mp, w = M.w;
  if (k === 'theme') { saveLayout({ matTheme: matDark() ? 'light' : 'dark' }); return true; }
  if (k === 'day') { M.sel = +x.dataset.i; draw(); return true; }
  if (k === 'always') {
    const day = w?.days?.[M.sel], dish = (w?.dishes ?? []).find((y) => y.id === day?.dishId);
    if (!dish) return true;
    const i = +x.dataset.wd, cur = dish.fixedDays ?? [], days = cur.includes(i) ? cur.filter((y) => y !== i) : [...cur, i];
    try { const r = await matApi(`/dishes/${encodeURIComponent(dish.id)}/fixed`, { method: 'PUT', json: { days, start: w.start } }); if (r?.days) M.w = r; flash(r?.status ?? 'Lagret'); }
    catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (k === 'all') { M.all = !M.all; draw(); return true; }
  if (k === 'shop') { await matApi(`/shopping/${encodeURIComponent(x.dataset.id)}/toggle`, { method: 'POST', json: { start: w?.start } }); await matLoad(); draw(); return true; }
  if (k === 'toshop') {
    const day = w?.days?.[M.sel], have = new Set((w?.shopping ?? []).map((z) => String(z.text).toLowerCase()));
    const add = (day?.ingredients ?? []).filter((n) => !have.has(String(n).toLowerCase()));
    for (const text of add) await matApi('/shopping', { method: 'POST', json: { text, start: w.start } });
    await matLoad(); flash(add.length ? `${add.length} lagt i handlelisten` : 'Alt ligger allerede i handlelisten'); return true;
  }
  if (k === 'regen' || k === 'week') {
    M.busy = true; draw(); flash(k === 'week' ? 'Lager ny ukeplan …' : 'Finner en annen rett …');
    try {
      const r = await matApi('/plan', { method: 'POST', json: k === 'week' ? { scope: 'week', date: w?.start ?? today() } : { scope: 'day', date: x.dataset.date } });
      if (r?.days) M.w = r; else await matLoad();
      flash(r?.status ?? (k === 'week' ? 'Ny ukeplan laget. Faste dager er beholdt.' : 'Ny rett valgt'));
    } catch (err) { flash(err.message); }
    M.busy = false; draw(); return true;
  }
  return false;
}

// Prompt 39 (WEB39): Vær · «Yr mot Storm» 2a (claude-code-vaer-yr-storm-2a-rediger.md, fasit Yr mot Storm Design.dc.html → 2a)
// Himmelbakgrunn og glasskort fra 1b, duell-topp og avvikssøyler fra 1a, enighet og Glimt-forklaring fra 1c. Kortene kan
// flyttes og skjules med wiggle-redigering som på Hjem: hold inne 480 ms (maks 8 px bevegelse) → haptikk 12 ms og vugging
// (±0,5°, 0,3 s), «−» skjuler, dra = løft (scale 1.03 + skygge) og bytt plass når midten passerer nabokortets midte (FLIP 260 ms),
// stiplet boks nederst med skjulte kort og grønn «+». Lagres som vs_cmp_layout {ord, hid} i /api/me/layout (og nettleseren).
import { api, esc } from './util.js';

const NAMES = { hero: 'Dagens duell', agree: 'Enighet', glimt: 'Glimt forklarer', list: 'Dag for dag', chart: 'Neste 24 timer', rain: 'Nedbør per dag' };
const DEF = { ord: ['hero', 'agree', 'glimt', 'list', 'chart', 'rain'], hid: { chart: true, rain: true } };
const E = { on: false, L: null, loaded: false };
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } } };
const vib = (ms) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

function layout() {
  if (E.L) return E.L;
  let L = null; try { L = JSON.parse(ls.get('vs_cmp_layout') || 'null'); } catch { /* */ }
  E.L = norm(L);
  if (!E.loaded) { E.loaded = true; api('/me/layout').then((l) => { E.srv = !!l && 'vs_cmp_layout' in l; if (l?.vs_cmp_layout) { E.L = norm(l.vs_cmp_layout); E.rerender?.(); } }).catch(() => {}); }
  return E.L;
}
function norm(L) {
  const ord = Array.isArray(L?.ord) ? L.ord.filter((k) => NAMES[k]) : [];
  for (const k of DEF.ord) if (!ord.includes(k)) ord.push(k);
  return { ord, hid: L?.hid && typeof L.hid === 'object' ? { ...L.hid } : { ...DEF.hid } };
}
function save() {
  ls.set('vs_cmp_layout', JSON.stringify(E.L));
  // Synkes med kontoen når serveren kjenner feltet (ellers 400 – da bare i nettleseren til SERVER39 tar det inn).
  if (E.srv) api('/me/layout', { method: 'PUT', json: { vs_cmp_layout: E.L } }).catch(() => {});
}

const fmt1 = (v) => (v == null ? '–' : Number(v).toLocaleString('nb-NO', { maximumFractionDigits: 1 }));
const r0 = (v) => (v == null ? '–' : `${Math.round(v)}°`);

/** Glimt forklarer (lokal tekst; samme tall som kortene). */
function glimtText(c) {
  const D = c.days.filter((x) => x.dfN != null);
  if (!D.length) return 'Glimt venter på tall fra Storm.';
  const agree = D.filter((x) => Math.abs(x.dfN) < 2).length, big = [...D].sort((a, b) => Math.abs(b.dfN) - Math.abs(a.dfN))[0];
  const rainY = D.filter((x) => (x.ypN ?? 0) >= 1).map((x) => x.d.toLowerCase()), rainS = D.filter((x) => (x.spN ?? 0) >= 1).map((x) => x.d.toLowerCase());
  let t = agree >= D.length - 1 ? `Yr og Storm er enige nesten hele uka (${agree} av ${D.length} dager).` : `De er enige ${agree} av ${D.length} dager.`;
  if (Math.abs(big.dfN) >= 2) t += ` Størst forskjell ${big.d.toLowerCase()}: Yr sier ${r0(big.yh)}, Storm ${r0(big.sh)} – ${big.dfN > 0 ? 'Yr er varmest' : 'Storm er varmest'}.`;
  const onlyY = rainY.filter((d) => !rainS.includes(d)), onlyS = rainS.filter((d) => !rainY.includes(d));
  if (onlyY.length || onlyS.length) t += ` Om regn er de uenige${onlyY.length ? ` (bare Yr: ${onlyY.slice(0, 2).join(', ')})` : ''}${onlyS.length ? ` (bare Storm: ${onlyS.slice(0, 2).join(', ')})` : ''}.`;
  else if (rainY.length) t += ` Begge venter regn ${rainY.slice(0, 3).join(', ')}.`;
  return t;
}

function blocks(c, h) {
  const t = c.days[0] ?? {};
  const dots = c.days.map((x) => { const a = x.dfN == null ? null : Math.abs(x.dfN); const ok = a != null && a < 2, mid = a != null && a < 4; return `<span class="c39-dot"><i class="${a == null ? '' : ok ? 'ok' : mid ? 'mid' : 'bad'}">${a == null ? '' : ok ? '✓' : '!'}</i><span>${esc(x.d === 'I dag' ? 'I dag' : x.d.slice(0, 3))}</span></span>`; }).join('');
  const nAgree = c.days.filter((x) => x.dfN != null && Math.abs(x.dfN) < 2).length;
  const maxR = Math.max(1, ...c.days.flatMap((x) => [x.ypN ?? 0, x.spN ?? 0]));
  const maxD = Math.max(2, ...c.days.map((x) => Math.abs(x.dfN ?? 0)));
  return {
    hero: `<div class="c39-g c39-duel"><div class="c39-side y"><span class="c39-who">${h.LOGO('yr', 20)}YR</span><b>${r0(t.yh)}</b><span>${esc(t.yt ?? '')} · ${esc(fmt1(t.ypN))} mm</span></div>
      <div class="c39-mid"><i></i><span>${esc(t.d ?? 'I dag')}</span></div>
      <div class="c39-side s"><span class="c39-who">STORM${h.LOGO('storm', 20)}</span><b>${r0(t.sh)}</b><span>${esc(t.stt ?? '–')} · ${esc(fmt1(t.spN))} mm</span></div></div>`,
    agree: `<div class="c39-g c39-agree"><span class="c39-big"><b>${nAgree} av ${c.days.length}</b><span>dager der de er enige</span></span><div class="c39-dots">${dots}</div></div>`,
    glimt: `<div class="c39-g c39-glimt"><span class="c39-orb" aria-hidden="true"><i>✦</i></span><span>${esc(glimtText(c))}</span></div>`,
    list: `<div class="c39-g c39-list"><div class="wxp-cg wxp-cgh"><span></span><span class="wxp-lh" style="color:#9fe3ff">${h.LOGO('yr', 16)}YR</span><span class="wxp-lh" style="color:#ffc79e">${h.LOGO('storm', 16)}STORM</span><span style="text-align:right">AVVIK</span></div>
      ${c.days.map((x) => `${h.cmpRow(x)}<span class="c39-bar" aria-hidden="true"><i style="${x.dfN == null ? '' : `${x.dfN >= 0 ? 'left:50%' : `right:50%`};width:${(Math.abs(x.dfN) / maxD * 50).toFixed(1)}%;background:${Math.abs(x.dfN) < 2 ? '#6fdc8c' : Math.abs(x.dfN) < 4 ? '#ffb347' : '#f26b5e'}`}"></i></span>`).join('')}</div>`,
    chart: `<div class="c39-g"><div class="wxp-boxh"><span class="wxp-cap">NESTE 24 TIMER</span><span class="wxp-leg"><span><i style="background:#5ec8f2"></i>Yr</span><span><i style="background:#ff8a3d"></i>Storm</span></span></div>
      <svg viewBox="0 0 300 170" style="width:100%;height:auto;display:block">${c.grid.map((g) => `<line x1="22" x2="300" y1="${g.y}" y2="${g.y}" stroke="rgba(255,255,255,.1)"/><text x="0" y="${g.ty}" fill="rgba(255,255,255,.7)" font-size="9" font-weight="700">${g.t}</text>`).join('')}${c.bars.map((b) => `<rect x="${b.x}" y="${b.y}" width="4" height="${b.h}" rx="1.5" fill="${b.c}"/>`).join('')}<path d="${c.yr}" fill="none" stroke="#5ec8f2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${c.st}" fill="none" stroke="#ff8a3d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${c.hx.map((x) => `<text x="${x.x}" y="168" fill="rgba(255,255,255,.7)" font-size="9" font-weight="700" text-anchor="middle">${x.t}</text>`).join('')}</svg></div>`,
    rain: `<div class="c39-g"><span class="wxp-cap">NEDBØR PER DAG</span><div class="c39-rain">${c.days.map((x) => `<span><span class="c39-rb"><i style="height:${((x.ypN ?? 0) / maxR * 100).toFixed(0)}%;background:#5ec8f2"></i><i style="height:${((x.spN ?? 0) / maxR * 100).toFixed(0)}%;background:#ff8a3d"></i></span><b>${esc(x.d.slice(0, 3))}</b><span>${esc(fmt1(x.ypN))}/${esc(fmt1(x.spN))}</span></span>`).join('')}</div></div>`,
  };
}

export function cmp39Html(c, h) {
  const L = layout(), on = E.on;
  const B = c.ready ? blocks(c, h) : null;
  const vis = L.ord.filter((k) => !L.hid[k]), hid = L.ord.filter((k) => L.hid[k]);
  const head = `<div class="c39-top"><span><b class="wxp-h1 wxp-cmpt" id="wxp-cmpt">Yr mot Storm</b><span class="c39-sub">${esc(h.P.name)}${h.upd ? ` · oppdatert ${esc(new Date(h.upd).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }))}` : ''}</span></span>${on ? '<button type="button" class="c39-done on" data-c39-done>Ferdig</button>' : h.done}</div>`;
  const cards = B ? vis.map((k, i) => `<div class="c39-blk${on ? ` wig${i % 2 ? ' alt' : ''}` : ''}" data-c39-blk="${k}">${on ? `<button type="button" class="c39-rm" data-c39-rm="${k}" aria-label="Skjul ${esc(NAMES[k])}">−</button>` : ''}<div class="c39-in">${B[k]}</div></div>`).join('') : `<span class="c39-sub">${h.busy ? 'Henter Storm-data …' : 'Storm svarte ikke. Prøv igjen senere.'}</span>`;
  const add = on && hid.length ? `<div class="c39-add"><span class="wxp-cap">LEGG TIL KORT</span>${hid.map((k) => `<button type="button" data-c39-add="${k}"><i>+</i>${esc(NAMES[k])}</button>`).join('')}</div>` : '';
  return `<div class="wxp-cmpfs c39" role="dialog" aria-modal="true" aria-labelledby="wxp-cmpt"><div class="wxp-cmpin">
    ${head}${on ? '<span class="c39-help">Dra kortene for å flytte · − for å skjule</span>' : ''}
    <div class="c39-list-w" data-c39-list>${cards}</div>${add}
    ${on ? '' : `<span class="c39-hint">Hold inne et kort for å flytte eller skjule det.</span>
    <div class="wxp-two"><a href="${esc(h.yrUrl ?? `https://www.yr.no/nb/søk?q=${encodeURIComponent(h.P.name)}`)}" target="_blank" rel="noopener">Åpne yr.no ↗</a><a href="https://www.storm.no/" target="_blank" rel="noopener">Åpne storm.no ↗</a></div>
    <span class="c39-sub" style="font-size:12px;line-height:1.45">Yr er MET Norway (api.met.no). Storm (StormGeo) har ikke et åpent API, så Storm-kolonnen viser ECMWF-modellen fra Open-Meteo, som er nærmeste åpne kilde. Avvik er forskjellen i makstemperatur.</span>`}
  </div></div>`;
}

/** Hold inne, vugging, «−», dra med FLIP og «+». */
export function bindCmp39(layer, rerender) {
  E.rerender = rerender;
  let g = null;
  const blk = (el) => el?.closest?.('[data-c39-blk]');
  layer.addEventListener('pointerdown', (e) => {
    const b = blk(e.target);
    if (!b || e.button > 0 || e.target.closest('[data-c39-rm]')) return;
    g = { b, k: b.dataset.c39Blk, x: e.clientX, y: e.clientY, lp: false, drag: false, id: e.pointerId };
    if (E.on) { g.lp = true; return; }
    g.t = setTimeout(() => { if (!g) return; g.lp = true; vib(12); E.on = true; rerender(); }, 480);
  });
  layer.addEventListener('pointermove', (e) => {
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.lp) { if (Math.hypot(dx, dy) > 8) { clearTimeout(g.t); g = null; } return; }
    if (!E.on) return;
    if (!g.drag) {
      if (Math.hypot(dx, dy) < 6) return;
      g.drag = true; g.b = layer.querySelector(`[data-c39-blk="${CSS.escape(g.k)}"]`);
      if (!g.b) { g = null; return; }
      g.b.classList.add('lift'); g.b.setPointerCapture?.(e.pointerId); g.oy = 0;
    }
    e.preventDefault();
    g.lastDy = dy; g.ty = dy - (g.oy ?? 0);
    cancelAnimationFrame(g.raf);
    g.raf = requestAnimationFrame(() => {
      if (!g?.b) return;
      g.b.style.transform = `translateY(${g.ty}px) scale(1.03)`;
      // Bytt plass når midten passerer nabokortets midte.
      const list = [...layer.querySelectorAll('[data-c39-blk]')], i = list.indexOf(g.b), r = g.b.getBoundingClientRect(), mid = r.top + r.height / 2;
      const nb = g.ty > 0 ? list[i + 1] : list[i - 1];
      if (!nb) return;
      const nr = nb.getBoundingClientRect(), nm = nr.top + nr.height / 2;
      if ((g.ty > 0 && mid > nm) || (g.ty < 0 && mid < nm)) {
        const first = new Map(list.map((x) => [x, x.getBoundingClientRect().top])), nat0 = r.top - g.ty;
        if (g.ty > 0) nb.after(g.b); else nb.before(g.b);
        const nat1 = g.b.getBoundingClientRect().top - g.ty;
        g.oy = (g.oy ?? 0) + (nat1 - nat0); g.ty = (g.lastDy ?? 0) - g.oy;
        g.b.style.transform = `translateY(${g.ty}px) scale(1.03)`;
        for (const x of list) {
          if (x === g.b) continue;
          const d = first.get(x) - x.getBoundingClientRect().top;
          if (!d) continue;
          x.style.transition = 'none'; x.style.transform = `translateY(${d}px)`;
          requestAnimationFrame(() => { x.style.transition = 'transform .26s cubic-bezier(.2,.8,.2,1)'; x.style.transform = ''; });
        }
        vib(6);
      }
    });
  });
  const up = (e) => {
    if (!g) return;
    clearTimeout(g.t); cancelAnimationFrame(g.raf);
    const cur = g; g = null;
    if (cur.drag && cur.b) {
      cur.b.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)'; cur.b.style.transform = '';
      cur.b.classList.remove('lift');
      const vis = [...layer.querySelectorAll('[data-c39-blk]')].map((x) => x.dataset.c39Blk), L = layout();
      E.L = { ord: [...vis, ...L.ord.filter((k) => !vis.includes(k))], hid: L.hid }; save();
      layer.dataset.noTap = '1'; setTimeout(() => { delete layer.dataset.noTap; }, 300);
      setTimeout(rerender, 250);
    }
    if (cur.lp && e.type !== 'pointercancel') { layer.dataset.noTap = '1'; setTimeout(() => { delete layer.dataset.noTap; }, 300); }
  };
  layer.addEventListener('pointerup', up);
  layer.addEventListener('pointercancel', up);
  layer.addEventListener('contextmenu', (e) => { if (blk(e.target)) e.preventDefault(); });
  layer.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-c39-done]')) { e.stopPropagation(); E.on = false; vib(8); rerender(); return; }
    const rm = t.closest('[data-c39-rm]');
    if (rm) { e.stopPropagation(); const L = layout(); E.L = { ...L, hid: { ...L.hid, [rm.dataset.c39Rm]: true } }; save(); vib(8); rerender(); return; }
    const ad = t.closest('[data-c39-add]');
    if (ad) { e.stopPropagation(); const k = ad.dataset.c39Add, L = layout(), hid = { ...L.hid }; delete hid[k]; const vis = L.ord.filter((x) => !hid[x] && x !== k); E.L = { ord: [...vis, k, ...L.ord.filter((x) => hid[x])], hid }; save(); vib(8); rerender(); return; }
    if (E.on && blk(t)) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}
/** Esc / lukking avslutter redigeringen. */
export function cmp39Reset() { E.on = false; }

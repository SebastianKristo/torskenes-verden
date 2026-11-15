// Prompt 44 (claude-code-web-tab-godta-forslag.md): felles «GlimtInput» for alle Glimt-felt på web.
// - Tomt felt + Tab → forslaget i «…» (plassholderen) skrives inn, markøren til slutt. Enter sender som før.
// - Skriver man begynnelsen av et forslag, vises resten som grå spøkelsestekst. Tab fullfører.
// - Liten «Tab»-brikke til høyre i feltet når Tab gjør noe. Shift+Tab er alltid vanlig Tab.
// - Forslagsliste under feltet (maks 5): først de som begynner med teksten, så de som inneholder den (fra 2 tegn).
//   Tab godtar det markerte, ↑/↓ bytter, Esc lukker, klikk velger. Bunntekst «TAB FULLFØRER · ↑↓ VELGER · ESC LUKKER».
// - Kilder: faste forslag per modul, siste spørsmål brukeren har stilt i modulen (localStorage), og dynamiske kilder
//   modulene melder inn (glimtSource, f.eks. titler i Media-biblioteket).
// - Ikke på skjermtastatur (pointer: coarse uten fysisk tastatur). Et fysisk tastetrykk (Tab, piler, Esc) slår det på.
// Komponenten legger seg OVER feltet (position: fixed på <body>), så modulenes egen DOM og innerHTML-tegning ikke røres.
// Felt som får den: [data-glimt] og felt med «Glimt» i plassholderen, Hjem-søket, og Finans-søket.
const FIXED = {
  kalender: ['ny hendelse i morgen kl. 10', 'tannlege fredag 0930', 'hva skjer i helgen', 'kino 1630 i morgen', 'time 12.5 16:30 kino dune'],
  huskeliste: ['husk å kjøpe melk', 'husk å pakke til hytta: sovepose, hodelykt, mat', 'hva har jeg igjen i dag', 'husk å ringe tannlegen i morgen'],
  media: ['pause alle nedlastinger', 'fortsett alle nedlastinger', 'hva kommer i morgen', 'hva lastes ned', 'legg til Severance i 4K', 'finn en episode av The Rookie som er under 500 MB'],
  finans: ['hva brukte jeg på mat i oktober', 'hvor mye har jeg brukt denne måneden', 'vis abonnementene mine', 'største kjøp i år'],
  studie: ['hva må jeg lese til prøven i engelsk?', 'når er neste frist?', 'hva er snittet mitt?', 'har jeg strøk?'],
  chat: ['hva skjer i dag', 'oppsummer uka mi', 'hva bør jeg lage til middag'],
  dash: ['hva skjer i dag', 'været i morgen', 'time 12.5 16:30 kino dune', 'husk å kjøpe melk'],
  domener: ['hvilke domener utløper snart', 'hvor mange besøk hadde jeg i går'],
  matplan: ['hva skal vi spise i kveld', 'lag handleliste for uka', 'middag med kylling'],
};
const SRC = new Map();
/** Moduler melder inn dynamiske forslag: glimtSource('media', () => ['finn The Diplomat', …]). */
export function glimtSource(key, fn) { SRC.set(key, fn); }

const RK = 'glimt44_recent';
const recent = (k) => { try { return (JSON.parse(localStorage.getItem(RK) || '{}')[k] ?? []).slice(0, 12); } catch { return []; } };
function remember(k, q) {
  q = String(q ?? '').trim(); if (q.length < 3) return;
  try { const all = JSON.parse(localStorage.getItem(RK) || '{}'); all[k] = [q, ...(all[k] ?? []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 20); localStorage.setItem(RK, JSON.stringify(all)); } catch { /* privat modus */ }
}

const routeKey = () => {
  const r = location.pathname.startsWith('/finans') ? 'finans' : (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'dash');
  return r === 'gjoremal' ? 'huskeliste' : r;
};
const keyOf = (el) => el.dataset.glimt || el.closest('[data-glimt-src]')?.dataset.glimtSrc || routeKey();

const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; } catch { return false; } })();
let physical = !coarse;

const SEL = 'input[data-glimt],textarea[data-glimt]';
function isGlimt(el) {
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el.dataset.glimt === 'off' || el.type === 'password' || el.type === 'email' || el.type === 'url') return false;
  if (el.matches(SEL)) return true;
  const ph = el.getAttribute('placeholder') || '';
  if (/glimt/i.test(ph)) return true;
  if (el.closest('.sbar,[data-sq-root]') && el.type !== 'hidden') return true; // Hjem-søket
  return false;
}
/** Forslaget i «…» i plassholderen (eller data-glimt-suggest). */
function fixedOf(el, k) {
  if (el.dataset.glimtSuggest) return el.dataset.glimtSuggest;
  const m = (el.getAttribute('placeholder') || '').match(/[«"“]([^»"”]{3,80})[»"”]/);
  return m ? m[1] : (FIXED[k]?.[0] ?? '');
}
function pool(el, k) {
  const dyn = (() => { try { return SRC.get(k)?.() ?? []; } catch { return []; } })();
  const seen = new Set(), out = [];
  for (const x of [...recent(k), ...(FIXED[k] ?? []), ...dyn]) { const t = String(x ?? '').trim(); const l = t.toLowerCase(); if (t && !seen.has(l)) { seen.add(l); out.push(t); } }
  return out;
}
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function candidates(el, k, q) {
  const ql = norm(q);
  if (!ql) return [];
  const all = pool(el, k);
  const pref = all.filter((x) => norm(x).startsWith(ql) && norm(x) !== ql);
  const cont = ql.length >= 2 ? all.filter((x) => !norm(x).startsWith(ql) && norm(x).includes(ql)) : [];
  return [...pref, ...cont].slice(0, 5);
}

/* ---------- Tegning (over feltet) ---------- */
const G = { el: null, k: '', list: [], hi: 0, closed: false, ghost: null, chip: null, box: null };
function ensure() {
  if (G.ghost) return;
  G.ghost = Object.assign(document.createElement('div'), { className: 'gi44-ghost' }); G.ghost.setAttribute('aria-hidden', 'true');
  G.chip = Object.assign(document.createElement('span'), { className: 'gi44-tab', textContent: 'Tab' }); G.chip.setAttribute('aria-hidden', 'true');
  G.box = Object.assign(document.createElement('div'), { className: 'gi44-list', id: 'gi44-list' }); G.box.setAttribute('role', 'listbox');
  G.box.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-gi44]'); if (!b) return;
    e.preventDefault();
    const t = G.list[+b.dataset.gi44]; if (t != null && G.el) { fill(G.el, t); G.closed = true; paint(); }
  });
  document.body.append(G.ghost, G.chip, G.box);
}
function hideAll() { if (!G.ghost) return; G.ghost.hidden = G.chip.hidden = G.box.hidden = true; }
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function paint() {
  const el = G.el;
  if (!el || !el.isConnected || document.activeElement !== el || !physical) { hideAll(); return; }
  ensure();
  const q = el.value, k = G.k;
  G.list = candidates(el, k, q);
  if (G.hi >= G.list.length) G.hi = 0;
  const top = G.list[G.hi] ?? null;
  const fixed = fixedOf(el, k);
  const r = el.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) { hideAll(); return; }
  const cs = getComputedStyle(el);
  // Spøkelsestekst: bare når teksten er begynnelsen av forslaget, markøren står til slutt og feltet ikke har rullet.
  const atEnd = el.selectionStart === q.length && el.selectionEnd === q.length;
  const ghost = top && q && norm(top).startsWith(norm(q)) && atEnd && el.scrollWidth <= el.clientWidth + 1 && el.tagName === 'INPUT' ? top.slice(q.length) : '';
  const g = G.ghost;
  g.hidden = !ghost;
  if (ghost) {
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, font: cs.font, letterSpacing: cs.letterSpacing,
      paddingLeft: `${parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)}px`, paddingRight: cs.paddingRight, textIndent: cs.textIndent, lineHeight: `${r.height}px` });
    g.innerHTML = `<span class="gi44-v">${esc(q)}</span>${esc(ghost)}`;
  }
  const tabOn = (!q && !!fixed) || !!top;
  G.chip.hidden = !tabOn || r.width < 180;
  if (!G.chip.hidden) Object.assign(G.chip.style, { left: `${r.right - 44 - Math.max(0, parseFloat(cs.paddingRight) - 12)}px`, top: `${r.top + r.height / 2 - 11}px` });
  const listOn = !!q && G.list.length > 0 && !G.closed && !(G.list.length === 1 && norm(G.list[0]) === norm(q));
  G.box.hidden = !listOn;
  el.setAttribute('aria-autocomplete', 'list');
  if (listOn) {
    el.setAttribute('aria-controls', 'gi44-list'); el.setAttribute('aria-expanded', 'true');
    const w = Math.max(260, r.width);
    Object.assign(G.box.style, { left: `${Math.min(r.left, innerWidth - w - 8)}px`, top: `${r.bottom + 6}px`, width: `${w}px` });
    G.box.innerHTML = G.list.map((t, i) => `<button type="button" role="option" aria-selected="${i === G.hi}" data-gi44="${i}" class="${i === G.hi ? 'on' : ''}"><i>✦</i><span>${esc(t)}</span></button>`).join('') + '<span class="gi44-foot">TAB FULLFØRER · ↑↓ VELGER · ESC LUKKER</span>';
  } else { el.removeAttribute('aria-controls'); el.setAttribute('aria-expanded', 'false'); }
}
function fill(el, t) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, t);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try { el.setSelectionRange(t.length, t.length); } catch { /* */ }
}

function onKey(e) {
  if (['Tab', 'ArrowDown', 'ArrowUp', 'Escape'].includes(e.key) && !physical) { physical = true; }
  const el = e.target;
  if (!isGlimt(el) || el !== G.el) return;
  if (e.isComposing) return;
  const listOn = G.box && !G.box.hidden;
  if (e.key === 'ArrowDown' && listOn) { e.preventDefault(); e.stopPropagation(); G.hi = (G.hi + 1) % G.list.length; paint(); return; }
  if (e.key === 'ArrowUp' && listOn) { e.preventDefault(); e.stopPropagation(); G.hi = (G.hi - 1 + G.list.length) % G.list.length; paint(); return; }
  if (e.key === 'Escape' && listOn) { e.preventDefault(); e.stopPropagation(); G.closed = true; paint(); return; }
  if (e.key === 'Enter' && !e.shiftKey) { remember(G.k, el.value); G.closed = true; setTimeout(paint, 0); return; }
  if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
  const q = el.value, top = G.list[G.hi];
  if (!q) { const f = fixedOf(el, G.k); if (f) { e.preventDefault(); fill(el, f); G.closed = true; paint(); } return; }
  if (top && norm(top) !== norm(q)) { e.preventDefault(); fill(el, top); G.closed = true; G.hi = 0; paint(); }
}

let raf = 0;
const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
export function initGlimtInput() {
  if (initGlimtInput.done) return; initGlimtInput.done = true;
  document.addEventListener('focusin', (e) => { if (isGlimt(e.target)) { G.el = e.target; G.k = keyOf(e.target); G.hi = 0; G.closed = false; later(); } });
  document.addEventListener('focusout', (e) => { if (e.target === G.el) setTimeout(() => { if (document.activeElement !== G.el) hideAll(); }, 120); });
  document.addEventListener('input', (e) => { if (e.target === G.el) { G.closed = false; G.hi = 0; later(); } }, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', (e) => { if (e.target === G.el && /^Arrow(Left|Right)|Home|End$/.test(e.key)) later(); });
  document.addEventListener('click', (e) => { if (e.target === G.el) later(); });
  addEventListener('scroll', later, true);
  addEventListener('resize', later);
  // Skjemaet sendes med knapp (✦ Spør): husk spørsmålet.
  document.addEventListener('submit', (e) => { const i = [...e.target.querySelectorAll('input,textarea')].find(isGlimt); if (i) { remember(keyOf(i), i.value); G.closed = true; later(); } }, true);
}
export const _glimtTest = { candidates, fixedOf, isGlimt };

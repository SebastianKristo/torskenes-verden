// Toppmenyen på desktop: fanene som ikke får plass på én linje, flyttes til «Mer ▾» (AUDIT H1/M7, B-B1/B2).
// Før ble fanene i Papir skjult bak en usynlig rullefelt, og i Glass brakk menyen over to linjer.
// - Bare fanene brukeren har valgt å vise (ikke [hidden]) telles. Rekkefølgen er brukerens.
// - Fanen for siden som er åpen, blir alltid stående i menyen; da flyttes fanen foran den i stedet.
// - Målingen skjer i et animasjonsbilde etter endringer (størrelse, faner, navn, rute), ikke i en løkke ved hver tegning.
// Navnet på knappen («Mer») endres sammen med de andre navnene i Fase 6 (Q6: «Alle sider ▾»).

const MOBILE = '(max-width: 767px)';
let nav = null, btn = null, panel = null, raf = 0, open = false;

// I synlig rekkefølge: brukeren kan ha flyttet fanene (dnd.js setter style.order), så DOM-rekkefølgen er ikke nok.
const tabs = () => [...nav.querySelectorAll(':scope > a[data-r]')].filter((a) => !a.hidden)
  .map((a, i) => [a, Number(a.style.order) || 0, i]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).map((x) => x[0]);

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; layout(); });
}

function layout() {
  if (!nav || !btn) return;
  const all = [...nav.querySelectorAll(':scope > a[data-r]')];
  all.forEach((a) => a.classList.remove('nav-ovf'));
  btn.hidden = true;
  if (matchMedia(MOBILE).matches || !nav.offsetParent) { fill([]); return; }
  const fits = () => nav.scrollWidth <= nav.clientWidth + 1;
  if (fits()) { fill([]); return; }
  btn.hidden = false;
  const shown = tabs();
  const cur = shown.find((a) => a.getAttribute('aria-current') === 'page');
  const hidden = [];
  for (let i = shown.length - 1; i >= 0 && !fits(); i--) {
    if (shown[i] === cur) continue;
    shown[i].classList.add('nav-ovf');
    hidden.unshift(shown[i]);
  }
  fill(hidden);
}

function fill(hidden) {
  if (!panel) return;
  btn.classList.toggle('on', hidden.some((a) => a.getAttribute('aria-current') === 'page'));
  panel.innerHTML = '';
  for (const a of hidden) {
    const c = document.createElement('a');
    c.href = a.getAttribute('href');
    c.textContent = a.textContent;
    c.setAttribute('role', 'menuitem');
    c.dataset.moreR = a.dataset.r;
    if (a.getAttribute('aria-current') === 'page') c.setAttribute('aria-current', 'page');
    panel.appendChild(c);
  }
  if (!hidden.length) setOpen(false);
}

function setOpen(v) {
  open = v && !btn.hidden;
  btn.setAttribute('aria-expanded', String(open));
  panel.hidden = !open;
  if (!open) return;
  const r = btn.getBoundingClientRect();
  panel.style.top = `${Math.round(r.bottom + 8)}px`;
  panel.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
  panel.querySelector('a')?.focus({ preventScroll: true });
}

/** Kobler «Mer ▾» på toppmenyen. Kalles én gang ved oppstart. */
export function initNavOverflow() {
  nav = document.querySelector('header.top .pillnav');
  if (!nav || btn) return;
  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-more';
  btn.hidden = true;
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.textContent = 'Mer ▾';
  nav.appendChild(btn);
  panel = document.createElement('div');
  panel.className = 'nav-more-menu';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Flere sider');
  panel.hidden = true;
  document.body.appendChild(panel);

  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('click', (e) => { if (open && !panel.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { setOpen(false); btn.focus(); } });
  addEventListener('hashchange', () => { setOpen(false); schedule(); });
  addEventListener('resize', () => { if (open) setOpen(false); });
  new ResizeObserver(schedule).observe(nav.parentElement);
  // Faner som skjules, vises, får nytt navn eller ny rekkefølge (Innstillinger, boot52/web52, markering av gjeldende side).
  // Endringer på «Mer»-knappen selv (hidden) og klasser fra målingen ignoreres, ellers måles det i en evig løkke.
  new MutationObserver((list) => { if (list.some((m) => m.target !== btn && (m.type !== 'attributes' || m.attributeName !== 'class'))) schedule(); })
    .observe(nav, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-current'] });
  document.fonts?.ready?.then(schedule);
  schedule();
}

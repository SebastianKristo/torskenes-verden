// Toppmenyen på desktop: «Alle sider ▾» (Q6) viser alle modulene brukeren har, gruppert som i modullisten (I dag, Hjemme, Tid …).
// Fanene som ikke får plass på én linje, skjules i menyen (AUDIT H1/M7, B-B1/B2) – de står uansett under «Alle sider».
// - Bare fanene brukeren har valgt å vise (ikke [hidden]) telles. Rekkefølgen er brukerens.
// - Fanen for siden som er åpen, blir alltid stående i menyen; da flyttes fanen foran den i stedet.
// - Målingen skjer i et animasjonsbilde etter endringer (størrelse, faner, navn, rute), ikke i en løkke ved hver tegning.
import { gruppert } from './moduler.js';
import { tabLabel } from './profile.js';

const MOBILE = '(max-width: 767px)';
let nav = null, btn = null, panel = null, raf = 0, open = false;

// I synlig rekkefølge: brukeren kan ha flyttet fanene (dnd.js setter style.order), så DOM-rekkefølgen er ikke nok.
const tabs = () => [...nav.querySelectorAll(':scope > a[data-r]')].filter((a) => !a.hidden)
  .map((a, i) => [a, Number(a.style.order) || 0, i]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).map((x) => x[0]);

/** Måler menyen på nytt (nav-rediger.js kaller den når redigeringsmodus starter og slutter). */
export function scheduleNavLayout() { if (nav) schedule(); }

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; layout(); });
}

function layout() {
  if (!nav || !btn) return;
  const all = [...nav.querySelectorAll(':scope > a[data-r]')];
  all.forEach((a) => a.classList.remove('nav-ovf'));
  // Prompt 57: i redigeringsmodus (nav-rediger.js) står alle fanene synlige, også over flere linjer, og «Alle sider» er borte.
  if (nav.classList.contains('nav-edit')) { btn.hidden = true; if (open) setOpen(false); return; }
  btn.hidden = false;
  if (matchMedia(MOBILE).matches || !nav.offsetParent) { btn.hidden = true; fill(); return; }
  const fits = () => nav.scrollWidth <= nav.clientWidth + 1;
  if (fits()) { fill(); return; }
  const shown = tabs();
  const cur = shown.find((a) => a.getAttribute('aria-current') === 'page');
  const hidden = [];
  for (let i = shown.length - 1; i >= 0 && !fits(); i--) {
    if (shown[i] === cur) continue;
    shown[i].classList.add('nav-ovf');
    hidden.unshift(shown[i]);
  }
  fill();
}

/** Alle sidene, gruppert. Siden som er åpen, er markert, og knappen er markert når siden ikke står som synlig fane. */
function fill() {
  if (!panel) return;
  const cur = nav.querySelector(':scope > a[aria-current="page"]')?.dataset.r ?? null;
  const curShown = !!nav.querySelector(':scope > a[aria-current="page"]:not([hidden]):not(.nav-ovf)');
  btn.classList.toggle('on', !!cur && !curShown);
  panel.innerHTML = '';
  for (const g of gruppert()) {
    const h = document.createElement('div');
    h.className = 'nav-more-g';
    h.setAttribute('role', 'presentation');
    h.textContent = g.navn;
    panel.appendChild(h);
    for (const m of g.moduler) {
      const c = document.createElement('a');
      c.href = m.rute;
      c.textContent = tabLabel(m.id, m.navn);
      c.setAttribute('role', 'menuitem');
      c.dataset.moreR = m.id;
      if (m.id === cur) c.setAttribute('aria-current', 'page');
      panel.appendChild(c);
    }
  }
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
  btn.textContent = 'Alle sider ▾';
  nav.appendChild(btn);
  panel = document.createElement('div');
  panel.className = 'nav-more-menu';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Alle sider');
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

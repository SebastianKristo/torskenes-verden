// Prompt 52 (Vaer.dc.html): glass-pille med dra på brytere i Vær – temp/regn/vind (Forhold), «Faktisk / Føles som» og lagvelgeren
// i værkartet (kortet og fullskjerm). Trykk virker som før (knappen under finner valget). Pekeren fanges først når du drar
// (ikke ved trykk, ellers kommer aldri klikket fram). Pillen følger fingeren, strekker seg etter farten, tilpasser bredden til
// knappen under, vibrerer lett når den passerer en ny knapp og smetter på plass på nærmeste knapp når du slipper.
// Uten «redusert bevegelse»: pillen glir til nytt valg med lett fjær. Søk i sidepanelet åpner stedspanelet med markøren i feltet.
const SEL = '.wxp-modes, .wxp-seg, .wxp-layers';
const last = new Map(); // kontrolltype → {x, w} (pillen glir fra forrige plass når siden tegnes på nytt)
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const haptic = (ms = 6) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const kindOf = (el) => (el.classList.contains('wxp-modes') ? 'modes' : el.classList.contains('wxp-seg') ? 'seg' : el.classList.contains('sm') ? 'layers-sm' : 'layers');

function enhance(ctl) {
  if (ctl.dataset.g52) return;
  const btns = [...ctl.querySelectorAll(':scope > button')];
  if (btns.length < 2) return;
  ctl.dataset.g52 = '1';
  ctl.classList.add('g52');
  const pill = document.createElement('span');
  pill.className = 'g52-pill';
  pill.setAttribute('aria-hidden', 'true');
  ctl.prepend(pill);
  const k = kindOf(ctl);
  const place = (b, anim) => {
    if (!b) { pill.style.opacity = '0'; return; }
    const x = b.offsetLeft, w = b.offsetWidth;
    pill.style.transition = anim && !reduced() ? 'transform .42s cubic-bezier(.3,1.35,.5,1), width .42s cubic-bezier(.3,1.35,.5,1)' : 'none';
    pill.style.width = `${w}px`; pill.style.height = `${b.offsetHeight}px`; pill.style.top = `${b.offsetTop}px`;
    pill.style.transform = `translate3d(${x}px,0,0)`; pill.style.opacity = '1';
    last.set(k, { x, w });
  };
  const cur = () => btns.find((b) => b.classList.contains('on') || b.getAttribute('aria-selected') === 'true');
  // Start fra forrige plass og gli til valgt knapp.
  const prev = last.get(k), on = cur();
  if (prev && on && (prev.x !== on.offsetLeft || prev.w !== on.offsetWidth)) {
    pill.style.transition = 'none'; pill.style.width = `${prev.w}px`; pill.style.height = `${on.offsetHeight}px`; pill.style.top = `${on.offsetTop}px`; pill.style.transform = `translate3d(${prev.x}px,0,0)`;
    requestAnimationFrame(() => requestAnimationFrame(() => place(on, true)));
  } else place(on, false);

  // Dra: pekeren fanges først etter 5 px bevegelse.
  let down = null, drag = false, lastX = 0, lastT = 0, over = null;
  const nearest = (x) => btns.reduce((a, b) => (Math.abs(b.offsetLeft + b.offsetWidth / 2 - x) < Math.abs(a.offsetLeft + a.offsetWidth / 2 - x) ? b : a));
  ctl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, id: e.pointerId, left: ctl.getBoundingClientRect().left - ctl.scrollLeft };
    drag = false; lastX = e.clientX; lastT = performance.now(); over = cur();
    ctl.classList.add('g52-press');
  });
  ctl.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    if (!drag && Math.abs(e.clientX - down.x) < 5) return;
    if (!drag) { drag = true; try { ctl.setPointerCapture(e.pointerId); } catch { /* */ } }
    const x = e.clientX - down.left, b = nearest(x), now = performance.now();
    const v = Math.min(1.6, Math.abs(e.clientX - lastX) / Math.max(8, now - lastT)); lastX = e.clientX; lastT = now;
    const w = b.offsetWidth * (1 + v * 0.18), minX = btns[0].offsetLeft, maxX = btns[btns.length - 1].offsetLeft + btns[btns.length - 1].offsetWidth - w;
    pill.style.transition = 'width .18s ease';
    pill.style.width = `${w}px`;
    pill.style.transform = `translate3d(${Math.max(minX, Math.min(maxX, x - w / 2))}px,0,0)`;
    if (b !== over) { over = b; haptic(6); }
    e.preventDefault();
  });
  const end = (e) => {
    if (!down || (e && e.pointerId !== down.id)) return;
    ctl.classList.remove('g52-press');
    const wasDrag = drag;
    down = null; drag = false;
    if (!wasDrag) return; // vanlig trykk: klikket går til knappen
    const b = over ?? cur();
    place(b, true);
    // Klikket etter et drag skal ikke treffe en annen knapp; velg knappen pillen landet på.
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    ctl.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => { ctl.removeEventListener('click', stop, { capture: true }); if (b && !b.classList.contains('on')) b.click(); }, 0);
  };
  ctl.addEventListener('pointerup', end);
  ctl.addEventListener('pointercancel', end);
  ctl.addEventListener('lostpointercapture', () => { if (down && drag) end(); });
  ctl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && btns.includes(b)) haptic(8); });
}

let obs = null;
/** Kalles når Vær-siden er tegnet. Følger med på nye tegninger av siden og lagene over. */
export function wx52(view) {
  obs?.disconnect();
  const scan = () => view.querySelectorAll(SEL).forEach(enhance);
  scan();
  obs = new MutationObserver(scan);
  obs.observe(view, { childList: true, subtree: true });
  // Søk i sidepanelet: rett inn i stedssøket (markøren i feltet, tastatur opp på mobil).
  if (!view.dataset.wx52s) {
    view.dataset.wx52s = '1';
    view.addEventListener('click', (e) => {
      if (!e.target.closest('[data-wx="places"]')) return;
      const focus = (n = 0) => { const i = view.querySelector('.wxp-search input'); if (i) { i.focus({ preventScroll: true }); i.select?.(); } else if (n < 10) requestAnimationFrame(() => focus(n + 1)); };
      requestAnimationFrame(() => focus());
    });
  }
}
export function wx52Off() { obs?.disconnect(); obs = null; }

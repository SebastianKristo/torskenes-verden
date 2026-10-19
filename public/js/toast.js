// Prompt 32 (claude-code-boliger-toast-farge.md): én felles toast med faste farger. Bakgrunn «ink», tekst «card» (aldri «bg»,
// som kan være gjennomsiktig inne i FinansHub). 11 × 18 px innrykk, radius 20, maks 90 vw, borte etter 2,2 s.
// toast('Historikken er tømt', { action: 'Angre', onAction: () => … }) – teksten skal alltid si hva som skjedde.
const CSS = `.hl-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);z-index:2147482000;display:flex;align-items:center;gap:14px;max-width:90vw;box-sizing:border-box;padding:11px 18px;border-radius:20px;background:#1b1a17;color:#fff;font:600 14px/1.35 Manrope,Outfit,Geist,system-ui,sans-serif;box-shadow:0 14px 34px -14px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
.hl-toast.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.hl-toast-t{min-width:0;text-wrap:pretty}
.hl-toast button{flex:none;border:0;background:transparent;color:inherit;cursor:pointer;font:800 14px Manrope,Outfit,Geist,system-ui,sans-serif;text-decoration:underline;text-underline-offset:3px;padding:0}
html[data-hl="cur"] .hl-toast,html[data-theme="mork"] .hl-toast,html[data-theme="glod"] .hl-toast{background:#ece9e2;color:#11141b}`;
let t = 0;
export function toast(text, { action = '', onAction = null, ms = 2200 } = {}) {
  if (!document.getElementById('hl-toast-css')) { const s = document.createElement('style'); s.id = 'hl-toast-css'; s.textContent = CSS; document.head.appendChild(s); }
  let el = document.getElementById('hl-toast');
  if (!el) { el = document.createElement('div'); el.id = 'hl-toast'; el.className = 'hl-toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.innerHTML = '';
  const s = document.createElement('span'); s.className = 'hl-toast-t'; s.textContent = String(text ?? ''); el.appendChild(s);
  if (action && onAction) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = action;
    b.onclick = () => { el.classList.remove('on'); onAction(); };
    el.appendChild(b);
  }
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(t); t = setTimeout(() => el.classList.remove('on'), action ? Math.max(ms, 4000) : ms);
}

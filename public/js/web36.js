// Prompt 36 (web): små ting i skallet.
// - Temperaturen i toppbildet: trykk åpner Vær-siden, hold inne ≥ 550 ms åpner yr.no (ny fane). Cmd/ctrl-klikk = yr i ny fane.
// - Oppstartsside (Nordlys Starter) når web mister kontakt med serveren (se starting36.js).
import { haptic } from './util.js';

const HOLD = 550;

function bindWxTap() {
  let t = null, fired = false, el = null, sx = 0, sy = 0;
  const end = () => { clearTimeout(t); t = null; el?.classList.remove('wx36-press'); };
  document.addEventListener('pointerdown', (e) => {
    const a = e.target.closest('[data-wxtap]');
    if (!a || (e.button && e.button !== 0)) return;
    el = a; fired = false; sx = e.clientX; sy = e.clientY;
    a.classList.add('wx36-press');
    clearTimeout(t);
    t = setTimeout(() => { t = null; fired = true; a.classList.remove('wx36-press'); haptic(15); window.open(a.href, '_blank', 'noopener'); }, HOLD);
  });
  document.addEventListener('pointermove', (e) => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) end(); });
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-wxtap]');
    if (!a) return;
    if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // åpner yr i ny fane som en vanlig lenke
    e.preventDefault();
    location.hash = '#/vaer';
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-wxtap]')) e.preventDefault(); });
}

// Domener: forhåndshent når web er ledig, og igjen ved hover på fanen (domains.js holder 60 s-grensen).
function prefetchDomains() {
  const go = () => import('./domains.js').then((m) => m.prefetchDomains?.()).catch(() => {});
  (window.requestIdleCallback ?? ((f) => setTimeout(f, 1500)))(go, { timeout: 4000 });
  document.addEventListener('pointerover', (e) => { if (e.target.closest?.('a[data-r="domener"]')) go(); });
}

export function initWeb36() {
  bindWxTap();
  prefetchDomains();
  import('./starting36.js').then((m) => m.watchServer()).catch(() => {});
  // Prompt 44: oppstartssiden vises bare når updateren selv sier «restarting» (ikke ved én feilet statusforespørsel,
  // ikke ut fra fremdriftssteget). Fremdriften 0–99 % vises bare i kortet «Oppdaterer Nordlys OS».
  import('./sysupdate.js').then((su) => {
    su.onUpdate?.((U) => { try { if (su.state?.() === 'restarting') document.dispatchEvent(new CustomEvent('hl:restarting', { detail: { to: U?.d?.status?.version ?? U?.d?.latest?.version ?? null } })); } catch { /* */ } });
  }).catch(() => {});
}

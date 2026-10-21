// Prompt 36: drakter til Glimt-figuren (fasit Innstillinger Web.dc.html → sherlock() / carp()).
//   outfit(kind, S, opts) → HTML. kind: 'sherlock' (deerstalker, rutete kappe, forstørrelsesglass) | 'snekker' (vernehjelm,
//   verktøybelte, hammer + spon). Figuren er brukerens valgte (Innstillinger → Glimt), ellers Glimt.
//   sherlockFly(heroEl, text) flyr Glimt inn i et kort, leter, viser snakkeboblen og flyr ut igjen (3,6 s).
import { fig, liftAnim, hostFor } from './glimt-figs.js';
import { gs } from './glimt35.js';

const who = () => { try { return hostFor(gs().char); } catch { return 'glimt'; } };
const CHK = '<defs><pattern id="sh36Chk" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#8a6a45"/><rect width="4" height="8" fill="#a5825a" opacity=".8"/><rect width="8" height="4" fill="#6f5333" opacity=".55"/></pattern></defs>';

function sherlock(S, mood) {
  const hat = `<svg width="${S * 1.05}" height="${S * 0.62}" viewBox="0 0 100 60" style="position:absolute;left:50%;top:${-S * 0.36}px;margin-left:${-S * 0.525}px;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">${CHK}
    <path d="M6 44 Q2 52 14 50 L30 44 Z" fill="url(#sh36Chk)" stroke="#4e3920" stroke-width="1.5"/><path d="M94 44 Q98 52 86 50 L70 44 Z" fill="url(#sh36Chk)" stroke="#4e3920" stroke-width="1.5"/>
    <path d="M14 46 Q14 10 50 8 Q86 10 86 46 Z" fill="url(#sh36Chk)" stroke="#4e3920" stroke-width="1.6"/><path d="M50 8 L50 46" stroke="#4e3920" stroke-width="1" opacity=".5"/>
    <path d="M22 40 Q12 52 20 58 Q26 52 28 42 Z" fill="url(#sh36Chk)" stroke="#4e3920" stroke-width="1.3"/><path d="M78 40 Q88 52 80 58 Q74 52 72 42 Z" fill="url(#sh36Chk)" stroke="#4e3920" stroke-width="1.3"/>
    <path d="M43 6 Q50 0 57 6 Q50 9 43 6 Z" fill="#6f5333" stroke="#4e3920" stroke-width="1.2"/></svg>`;
  const cape = `<svg width="${S * 1.2}" height="${S * 0.5}" viewBox="0 0 120 50" style="position:absolute;left:50%;bottom:${-S * 0.12}px;margin-left:${-S * 0.6}px;overflow:visible">${CHK}<path d="M14 4 Q60 22 106 4 L114 40 Q60 52 6 40 Z" fill="url(#sh36Chk)" stroke="#4e3920" stroke-width="1.6" opacity=".96"/></svg>`;
  const glass = `<span class="go36-scan" style="position:absolute;right:${-S * 0.62}px;top:${S * 0.28}px;width:${S * 0.7}px;height:${S * 0.7}px"><svg width="${S * 0.7}" height="${S * 0.7}" viewBox="0 0 50 50" style="overflow:visible;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))"><line x1="6" y1="44" x2="20" y2="30" stroke="#5b3d1e" stroke-width="6" stroke-linecap="round"/><circle cx="30" cy="20" r="15" fill="rgba(190,230,255,.35)" stroke="#c8a24a" stroke-width="4"/><path d="M22 13 Q26 9 31 9" stroke="rgba(255,255,255,.85)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg></span>`;
  const F = liftAnim(fig(who(), S, mood, { noJul: true })); // prompt 44: drakten følger hoppet
  return `<span class="go36 go36-sh" style="position:relative;display:inline-block;transform-origin:50% 100%;${F.an ? `animation:${F.an};` : ''}width:${S}px">${cape}${F.html}${hat}${glass}</span>`;
}
function snekker(S, mood) {
  const hat = `<svg width="${S * 0.95}" height="${S * 0.5}" viewBox="0 0 100 52" style="position:absolute;left:50%;top:${-S * 0.24}px;margin-left:${-S * 0.475}px;overflow:visible;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))"><path d="M14 40 Q14 6 50 4 Q86 6 86 40 Z" fill="#f2c14e" stroke="#b8860b" stroke-width="2"/><path d="M50 4 L50 40" stroke="#d9a520" stroke-width="6"/><rect x="2" y="38" width="96" height="9" rx="4.5" fill="#e0ad2c" stroke="#b8860b" stroke-width="2"/><path d="M26 16 Q34 10 42 9" stroke="rgba(255,255,255,.7)" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  const belt = `<svg width="${S * 1.02}" height="${S * 0.34}" viewBox="0 0 100 34" style="position:absolute;left:50%;bottom:${S * 0.1}px;margin-left:${-S * 0.51}px;overflow:visible"><rect x="4" y="2" width="92" height="9" rx="4" fill="#8a5a2b" stroke="#5b3a1a" stroke-width="1.5"/><rect x="44" y="1" width="12" height="11" rx="2" fill="none" stroke="#c8a24a" stroke-width="2"/><path d="M12 10 h20 v16 q-10 6 -20 0 z" fill="#a06a33" stroke="#5b3a1a" stroke-width="1.5"/><path d="M68 10 h18 v13 q-9 5 -18 0 z" fill="#a06a33" stroke="#5b3a1a" stroke-width="1.5"/><rect x="20" y="0" width="3" height="12" fill="#6b6b6b"/><rect x="76" y="-6" width="4" height="16" rx="1" fill="#b23a2a"/></svg>`;
  const ham = `<span class="go36-ham" style="position:absolute;right:${-S * 0.5}px;top:${S * 0.1}px;width:${S * 0.7}px;height:${S * 0.7}px"><svg width="${S * 0.7}" height="${S * 0.7}" viewBox="0 0 50 50" style="overflow:visible;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))"><rect x="8" y="14" width="7" height="34" rx="3" fill="#a06a33" stroke="#5b3a1a" stroke-width="1.4" transform="rotate(-35 11 45)"/><path d="M14 4 h22 v10 h-22 z" fill="#9aa3ad" stroke="#4c535b" stroke-width="1.6" transform="rotate(-35 11 45)"/><path d="M36 4 q8 4 4 10 h-4 z" fill="#7d858e" transform="rotate(-35 11 45)"/></svg></span>`;
  const chips = [0, 1, 2].map((i) => `<span class="go36-chip" style="right:${-S * (0.55 + i * 0.05)}px;background:${i === 1 ? '#f2c14e' : '#c8925a'};--cx:${8 + i * 7}px;--cy:${-10 - i * 5}px;animation-delay:${(i * 0.05).toFixed(2)}s"></span>`).join('');
  const F = liftAnim(fig(who(), S, mood, { noJul: true })); // prompt 44: drakten følger hoppet
  return `<span class="go36 go36-cp" style="position:relative;display:inline-block;transform-origin:50% 100%;${F.an ? `animation:${F.an};` : ''}width:${S}px">${F.html}${belt}${hat}${ham}${chips}</span>`;
}
/* Prompt 38: prestedrakt (fasit Bibelvers.dc.html → priest(S)): lys kjortel/alb med rød stola (gullstripe), brunt belte,
   liten mørk bibel med gyllent ✝ og en svak, pulserende gylden glorie. Dupper rolig (3 s); «Reduser bevegelse» = stille. */
function prest(S, mood) {
  const halo = `<span class="go38-halo" style="position:absolute;left:50%;top:${-S * 0.2}px;width:${S * 0.78}px;height:${S * 0.22}px;margin-left:${-S * 0.39}px;border-radius:50%;border:${Math.max(1.5, S * 0.05)}px solid #f2c14e;box-shadow:0 0 ${S * 0.18}px rgba(242,193,78,.75);pointer-events:none"></span>`;
  const robe = `<svg width="${S * 1.16}" height="${S * 0.62}" viewBox="0 0 116 62" style="position:absolute;left:50%;bottom:${-S * 0.34}px;margin-left:${-S * 0.58}px;overflow:visible"><path d="M18 8 Q58 22 98 8 L110 58 Q58 66 6 58 Z" fill="#f6f1e7" stroke="#c9bfa9" stroke-width="1.6"/><path d="M44 12 L40 60 L50 60 L54 16 Z" fill="#b23a2a"/><path d="M72 12 L76 60 L66 60 L62 16 Z" fill="#b23a2a"/><path d="M42 34 h8 M66 34 h8" stroke="#f2c14e" stroke-width="2"/><path d="M24 40 Q58 48 92 40" stroke="#a8661a" stroke-width="3" fill="none"/></svg>`;
  const book = `<span style="position:absolute;right:${-S * 0.16}px;bottom:${-S * 0.2}px;width:${S * 0.36}px;height:${S * 0.28}px;border-radius:3px;background:#3b2a1a;box-shadow:inset 0 0 0 2px #6b4a2a;display:grid;place-items:center;transform:rotate(-10deg)"><span style="color:#f2c14e;font-size:${S * 0.16}px;font-weight:800;line-height:1">✝</span></span>`;
  const F = liftAnim(fig(who(), S, mood, { noJul: true })); // prompt 44: drakten følger hoppet
  return `<span class="go36 go38-pr" aria-hidden="true" style="position:relative;display:inline-block;transform-origin:50% 100%;${F.an ? `animation:${F.an};` : ''}width:${S}px;height:${S}px;margin-bottom:${S * 0.3}px">${halo}${F.html}${robe}${book}</span>`;
}
/** kind: 'sherlock' | 'snekker' | 'prest' (prompt 38, bibelvers i briefen). */
export function outfit(kind, S = 36, opts = {}) {
  if (kind === 'prest') return prest(S, opts.mood ?? 'idle');
  return kind === 'sherlock' ? sherlock(S, opts.mood ?? 'talk') : snekker(S, opts.mood ?? 'idle');
}

/** Snekker-Glimt som står på fremdriftslinja ved enden av fyllet (left = pct, avgrenset til kortet). */
export function carpOnBar(pct, S = 32) {
  return `<span class="cp36" aria-hidden="true" style="--S:${S}px;left:clamp(${S * 0.6}px,${pct}%,calc(100% - ${S * 1.1}px));margin-left:${-S * 0.5}px">${outfit('snekker', S)}</span>`;
}

let flying = null;
/** Sherlock-Glimt flyr inn i kortet (oppe til høyre), leter i høyre halvdel og viser boblen. Returnerer et løfte (3,6 s). */
export function sherlockFly(hero, text, S = 66) {
  if (!hero) return Promise.resolve();
  flying?.remove();
  const r = hero.getBoundingClientRect(), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = 'sh36' + (reduce ? ' sh36-rm' : '');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `left:${r.right - 250 - S}px;top:${r.top + 40}px`;
  el.innerHTML = `<span class="sh36-bob">${outfit('sherlock', S)}<span class="sh36-bb">${text}</span></span>`;
  document.body.appendChild(el);
  flying = el;
  const bb = el.querySelector('.sh36-bb');
  return new Promise((ok) => {
    const T = 3600;
    setTimeout(() => { if (bb) bb.textContent = text; }, 0);
    el._setText = (t) => { if (bb) bb.textContent = t; };
    setTimeout(() => { el.remove(); if (flying === el) flying = null; ok(); }, T);
  });
}
export const setSherlockText = (t) => flying?._setText?.(t);

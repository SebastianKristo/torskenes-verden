// Glimt: AI-agenten i Nordlys OS (prompt 31, claude-code-glimt-ai.md + claude-code-ai-animasjon.md).
// Fasit: «Glimt AI.dc.html» (merket og fire tilstander) og «Mobil Papir App.dc.html» (aiSpark).
// Merket: ring med konisk gradient #b23a2a → #e8794a → #7a5ad6 → #3fbf9a (strek ≈ 6 % av størrelsen), 4-spisset
// stjerne i gradient #ffb38a → #ff5a3c og to små glimt som tindrer forskjøvet. Over 60 px: myk glød bak.
// Tilstander (data-st): klar (rolig, 6 s / pust 3,2 s) · tenker (1,4 s / puls 1,2 s) · svarer (2,6 s / 2 s) · ferdig
// (grønn ring som står stille, haken spretter inn). «Reduser bevegelse»: ingen rotasjon, bare langsom puls.
// Bruk: glimt(24, 'tenker', { dark: true }) gir HTML. setGlimt(el, 'ferdig') bytter tilstand på et merke som står på siden.
// CSS-en legges inn én gang, så merket virker både på web-dashboardet og i FinansHub desktop.
export const GLIMT_NAME = 'Glimt';
export const STATES = ['klar', 'tenker', 'svarer', 'ferdig'];
const STAR = 'M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5h-0c-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z';
const CHECK = 'M5 12.5l4.5 4.5L19 7';

const CSS = `@keyframes glmSpin{to{transform:rotate(360deg)}}
@keyframes glmPulse{0%,100%{transform:scale(.8) rotate(0deg);opacity:.85}50%{transform:scale(1.06) rotate(45deg);opacity:1}}
@keyframes glmBreath{0%,100%{transform:scale(.92)}50%{transform:scale(1)}}
@keyframes glmSlow{0%,100%{transform:scale(.9);opacity:.85}50%{transform:scale(1);opacity:1}}
@keyframes glmTw{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1)}}
@keyframes glmGlow{0%,100%{opacity:.35;transform:scale(.9)}50%{opacity:.7;transform:scale(1.1)}}
@keyframes glmPop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
@keyframes glmDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.glm{position:relative;flex:none;display:inline-grid;place-items:center;vertical-align:middle;line-height:0}
.glm>*{grid-area:1/1}
.glm-gl{position:absolute;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side,rgba(232,121,74,.4),rgba(122,90,214,.18) 55%,transparent);animation:glmGlow 4s ease-in-out infinite}
.glm-r{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,#b23a2a,#e8794a,#7a5ad6,#3fbf9a,#b23a2a);animation:glmSpin 6s linear infinite;transition:background .4s}
.glm-st{display:block;animation:glmBreath 3.2s ease-in-out infinite}
.glm-ck{display:none}
.glm-t1,.glm-t2{position:absolute;border-radius:50%;background:#ffd9c2;animation:glmTw 1.4s ease-in-out infinite .2s}
.glm-t2{animation-delay:.8s}
.glm.dark .glm-t1{background:#fff}
.glm[data-st=tenker] .glm-r{animation-duration:1.4s}
.glm[data-st=tenker] .glm-st{animation:glmPulse 1.2s ease-in-out infinite}
.glm[data-st=tenker] .glm-gl{animation-duration:1.6s}
.glm[data-st=svarer] .glm-r{animation-duration:2.6s}
.glm[data-st=svarer] .glm-st{animation:glmPulse 2s ease-in-out infinite}
.glm[data-st=svarer] .glm-gl{animation-duration:1.6s}
.glm[data-st=ferdig] .glm-r{background:#3fbf9a;animation:none}
.glm[data-st=ferdig] .glm-st,.glm[data-st=ferdig] .glm-t1,.glm[data-st=ferdig] .glm-t2{display:none}
.glm[data-st=ferdig] .glm-ck{display:block;animation:glmPop .45s cubic-bezier(.2,.9,.2,1.2)}
.glm[data-st=ferdig] .glm-gl{background:radial-gradient(closest-side,rgba(63,191,154,.45),transparent)}
.glm-dots{display:inline-flex;gap:3px;align-items:center}
.glm-dots i{width:4px;height:4px;border-radius:2px;background:currentColor;animation:glmDot 1.2s ease-in-out infinite}
.glm-dots i:nth-child(2){animation-delay:.15s}.glm-dots i:nth-child(3){animation-delay:.3s}
@media (prefers-reduced-motion:reduce){
  .glm .glm-r,.glm-dots i{animation:none!important}
  .glm .glm-st{animation:glmSlow 3.2s ease-in-out infinite!important}
  .glm .glm-t1,.glm .glm-t2{animation:none!important;opacity:.8}
  .glm .glm-gl{animation:none!important;opacity:.5}
  .glm[data-st=ferdig] .glm-ck{animation:none!important}
}`;

function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('glimt-css')) return;
  const s = document.createElement('style');
  s.id = 'glimt-css'; s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}
injectCss();

let uid = 0;
/** HTML for Glimt-merket. size i px, state klar|tenker|svarer|ferdig. o.dark = på mørk bunn (hvitt glimt), o.label = aria-label. */
export function glimt(size = 24, state = 'klar', o = {}) {
  injectCss();
  const S = Math.max(12, Math.round(size)), st = STATES.includes(state) ? state : 'klar', id = `glmG${++uid}`;
  const bw = Math.max(2, S * 0.06), mask = `radial-gradient(farthest-side,transparent calc(100% - ${(bw + 0.5).toFixed(2)}px),#000 calc(100% - ${bw.toFixed(2)}px))`;
  const glow = S > 60 ? `<span class="glm-gl" style="inset:${(-S * 0.35).toFixed(1)}px"></span>` : '';
  const t1 = S * 0.16, t2 = S * 0.1;
  const label = o.label ?? (st === 'ferdig' ? 'Glimt er ferdig' : st === 'klar' ? 'Glimt' : 'Glimt jobber');
  return `<span class="glm${o.dark ? ' dark' : ''}${o.cls ? ` ${o.cls}` : ''}" data-st="${st}" style="width:${S}px;height:${S}px" role="img" aria-label="${label}">${glow}`
    + `<span class="glm-r" style="-webkit-mask:${mask};mask:${mask}"></span>`
    + `<svg class="glm-st" width="${(S * 0.58).toFixed(1)}" height="${(S * 0.58).toFixed(1)}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb38a"/><stop offset="1" stop-color="#ff5a3c"/></linearGradient></defs><path d="${STAR}" fill="url(#${id})"/></svg>`
    + `<svg class="glm-ck" width="${(S * 0.46).toFixed(1)}" height="${(S * 0.46).toFixed(1)}" viewBox="0 0 24 24" fill="none" stroke="#3fbf9a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${CHECK}"/></svg>`
    + `<span class="glm-t1" style="top:${(-S * 0.02).toFixed(1)}px;right:${(-S * 0.02).toFixed(1)}px;width:${t1.toFixed(1)}px;height:${t1.toFixed(1)}px${o.dark ? `;box-shadow:0 0 ${(S * 0.1).toFixed(1)}px #fff` : ''}"></span>`
    + `<span class="glm-t2" style="bottom:${(S * 0.02).toFixed(1)}px;left:${(-S * 0.04).toFixed(1)}px;width:${t2.toFixed(1)}px;height:${t2.toFixed(1)}px"></span></span>`;
}

/** Tre hoppende prikker (toasten). Fargen følger teksten. */
export const glimtDots = () => { injectCss(); return '<span class="glm-dots" aria-hidden="true"><i></i><i></i><i></i></span>'; };

/** Bytter tilstand på merker under el (eller el selv). Ferdig gir lett haptikk. */
export function setGlimt(el, state) {
  if (!el) return;
  const L = el.classList?.contains('glm') ? [el] : [...el.querySelectorAll('.glm')];
  for (const m of L) {
    if (m.dataset.st === state) continue;
    m.dataset.st = state;
    if (state === 'ferdig') { try { navigator.vibrate?.(8); } catch { /* ikke støttet */ } }
  }
}

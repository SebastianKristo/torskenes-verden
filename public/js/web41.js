// Prompt 41 (WEB41): små ting i skallet.
// - Bakgrunn «Oslo» (claude-code-bakgrunn-oslo-dognet.md): sjekker hvert minutt om timen/tidsrommet er endret, forhåndslaster
//   neste times bilde 5 min før, og bytter med crossfade når det er lastet. Soloppgang/solnedgang fra Vær.
// - 17. mai (claude-code-17-mai.md): eget Hjem på selve dagen (eller «Vis nå»), med pillen «17. mai-design» som slår
//   festdesignet av for i dag. Program i dag, 17. mai-brief og «Hipp hipp hurra!» med konfetti i flaggfargene.
import { api, esc } from './util.js';
import { store, on } from './store.js';
import { bgState, osloKey41, osloUrls41, setSun41 } from './bgsvc.js';
import { applyBackground } from './background.js';
import { paintPhoto } from './hltheme.js';
import { fig, mai17State } from './glimt-figs.js';

/* ---------- Oslo-bakgrunnen gjennom døgnet ---------- */
let lastKey = null, preKey = null;
function sunFromWeather() {
  const w = store.data?.weather;
  const rise = w?.sunrise ?? w?.daily?.sunrise?.[0], set = w?.sunset ?? w?.daily?.sunset?.[0];
  if (rise && set) setSun41(rise, set);
}
function osloTick() {
  if (bgState().type !== 'oslo' || document.hidden) return;
  sunFromWeather();
  const k = osloKey41();
  if (lastKey && k !== lastKey) { applyBackground(); paintPhoto(); }
  lastKey = k;
  // 5 min før hel time: last neste times bilde i bakgrunnen (nettleserens cache tar vare på det).
  const n = new Date();
  if (n.getMinutes() >= 55) {
    const next = new Date(n); next.setHours(n.getHours() + 1, 0, 0, 0);
    const nk = osloKey41(next);
    if (nk !== preKey) { preKey = nk; const img = new Image(); img.src = osloUrls41(next).urls[0]; }
  }
}

/* ---------- 17. mai ---------- */
const p2 = (n) => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
function osloDay() { try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', month: 'numeric', day: 'numeric' }).formatToParts(new Date()).map((x) => [x.type, +x.value])); return { m: p.month, d: p.day }; } catch { const d = new Date(); return { m: d.getMonth() + 1, d: d.getDate() }; } }
/** Festdesignet på Hjem: selve dagen (Auto), eller «Vis nå». «Av» i Høytider = aldri. */
export function mai17Day() {
  const st = mai17State();
  if (st.srv && typeof st.srv.day === 'boolean' && st.active !== null) return st.srv.day;
  if (st.mode === 'av') return false;
  if (st.mode === 'pa') return true;
  const { m, d } = osloDay();
  return m === 5 && d === 17;
}
const plainKey = () => `mai17_plain_${todayKey()}`;
// Valget «17. mai-design» gjelder bare i dag: PUT /api/glimt/mai17/design {on} (serveren nullstiller 18. mai), localStorage som reserve.
const isPlain = () => { try { const v = localStorage.getItem(plainKey()); if (v != null) return v === '1'; } catch { /* */ } return M.d?.design === false || mai17State().srv?.design === false; };
const setPlain = (v) => { try { localStorage.setItem(plainKey(), v ? '1' : '0'); } catch { /* */ } api('/glimt/mai17/design', { method: 'PUT', json: { on: !v } }).catch(() => {}); };
const hurraN = () => { try { return Math.max(M.d?.hurra?.count ?? 0, +localStorage.getItem(`mai17_hurra_${todayKey()}`) || 0); } catch { return M.d?.hurra?.count ?? 0; } };
// GET /api/glimt/mai17 → {dateLabel, greeting, program:[{time, title, kind, past, next}], brief:{text}, hurra:{count}, design}
const M = { d: null, at: 0, busy: false };
function loadM17(view) {
  if (M.busy || Date.now() - M.at < 5 * 60_000) return;
  M.busy = true; M.at = Date.now();
  api('/glimt/mai17').then((r) => { M.d = r && typeof r === 'object' ? r : null; }).catch(() => { M.d = null; }).finally(() => { M.busy = false; if (M.d && view?.isConnected) mountMai17(view, true); });
}
const PROG = [['07:00', 'Salutt fra Akershus festning', 'Festningen'], ['10:00', 'Barnetoget', 'Festningsplassen → Slottet'], ['13:00', 'Folketoget', 'Youngstorget']];
const BUNT = () => `<svg class="m17-bunt" viewBox="0 0 400 44" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6 Q200 30 400 6" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.5"/>${Array.from({ length: 16 }, (_, i) => { const x = 12 + i * 24.5, y = 6 + Math.sin((x / 400) * Math.PI) * 17; const c = ['#ffffff', '#00205b', '#ba0c2f'][i % 3]; return `<path class="m17-pen" style="animation-delay:${(i * 0.09).toFixed(2)}s;transform-origin:${x.toFixed(1)}px ${y.toFixed(1)}px" d="M${(x - 8).toFixed(1)} ${y.toFixed(1)} L${(x + 8).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + 18).toFixed(1)} Z" fill="${c}" stroke="${c === '#ffffff' ? 'rgba(0,0,0,.12)' : 'none'}"/>`; }).join('')}</svg>`;
function progHtml() {
  if (Array.isArray(M.d?.program) && M.d.program.length) return M.d.program.map((x) => `<div class="m17-pr${x.past ? ' past' : x.next ? ' next' : ''}"><span>${esc(x.time)}</span><i></i><span><b>${esc(x.title)}</b><small>${esc(x.place ?? (x.kind === 'calendar' ? 'Kalender' : M.d.city ?? 'Oslo'))}</small></span></div>`).join('');
  const now = new Date(), min = now.getHours() * 60 + now.getMinutes();
  const evs = (store.data?.calendar?.today ?? store.data?.calendar?.events ?? []).filter((e) => e?.start && new Date(e.start).toDateString() === now.toDateString()).slice(0, 3)
    .map((e) => { const d = new Date(e.start); return [`${p2(d.getHours())}:${p2(d.getMinutes())}`, e.title ?? e.summary ?? 'Hendelse', 'Kalender']; });
  const L = [...PROG, ...evs].sort((a, b) => a[0].localeCompare(b[0]));
  const nextI = L.findIndex(([t]) => { const [h, m] = t.split(':').map(Number); return h * 60 + m >= min; });
  return L.map(([t, n, s], i) => `<div class="m17-pr${nextI === -1 || i < nextI ? ' past' : i === nextI ? ' next' : ''}"><span>${esc(t)}</span><i></i><span><b>${esc(n)}</b><small>${esc(s)}</small></span></div>`).join('');
}
function bannerHtml() {
  const plain = isPlain();
  const sw = `<button type="button" class="m17-pill" data-m17="tog" role="switch" aria-checked="${!plain}">${plain ? '17. mai' : '17. mai-design'}<span class="m17-sw${plain ? '' : ' on'}"><i></i></span></button>`;
  if (plain) return `<div class="m17 plain" data-m17-root>${sw}</div>`;
  const w = store.data?.weather, name = store.me?.user ?? store.me?.me?.name ?? '';
  const wd = new Date().toLocaleDateString('nb-NO', { weekday: 'long' });
  const nextB = (() => { const n = new Date(); const t = new Date(n); t.setHours(10, 0, 0, 0); const m = Math.round((t - n) / 60000); return m > 0 ? `Barnetoget går fra Festningsplassen kl. 10:00, om ${m >= 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m} min`}.` : 'Barnetoget har gått. Folketoget starter 13:00 fra Youngstorget.'; })();
  return `<section class="m17" data-m17-root aria-label="17. mai">
    <div class="m17-top">${BUNT()}${sw}
      <div class="m17-tx"><span class="m17-date">${esc(M.d?.dateLabel ?? `${wd.replace(/^./, (c) => c.toUpperCase())} 17. mai · Grunnlovsdagen`)}</span><b class="m17-greet">${esc(M.d?.greeting ?? `Gratulerer med dagen${name ? `, ${name}` : ''}!`)}</b>
        ${w ? `<span class="m17-wx"><b>${esc(String(w.temp))}°</b>${esc(w.text ?? '')}</span>` : ''}</div>
      <span class="m17-fig">${fig('glimt', 84, 'glad', { ph: '17mai' })}</span></div>
    <div class="m17-row">
      <div class="m17-brief"><span class="m17-k">17. MAI-BRIEF · GLIMT</span><b>${esc(M.d?.brief?.text ?? nextB)}${w ? ` ${esc(w.text ?? '')} og ${esc(String(w.temp))}°.` : ''}</b><span class="m17-chips"><span>Trikk kan være innstilt i sentrum</span></span></div>
      <div class="m17-prog"><span class="m17-k red">PROGRAM I DAG · ${esc(String(M.d?.city ?? 'Oslo').toUpperCase())}</span>${progHtml()}</div>
      <button type="button" class="m17-hurra" data-m17="hurra"><b>Hipp hipp hurra!</b><span>${hurraN() ? `Hurra nr. ${hurraN()} · sendt til familien` : 'Konfetti og hilsen til familien'}</span></button>
    </div></section>`;
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const C = ['#ba0c2f', '#ffffff', '#00205b'], el = document.createElement('div');
  el.className = 'm17-conf'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${Math.random() * 100}%;width:${6 + Math.random() * 5}px;height:${9 + Math.random() * 7}px;border-radius:${Math.random() > 0.6 ? '50%' : '2px'};background:${C[i % 3]};animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s;animation-delay:${(Math.random() * 0.5).toFixed(2)}s"></i>`).join('');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
export function mountMai17(view, fromLoad = false) {
  view.querySelectorAll('[data-m17-root]').forEach((x) => x.remove());
  const day = mai17Day();
  if (day && !fromLoad) loadM17(view);
  document.body.classList.toggle('m17-on', day && !isPlain());
  if (!day) return;
  const tmp = document.createElement('div'); tmp.innerHTML = bannerHtml();
  const node = tmp.firstElementChild, pw = view.querySelector('.pw');
  if (pw) pw.after(node); else view.prepend(node);
}
function bindMai17() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest?.('[data-m17]');
    if (!b) return;
    e.preventDefault();
    const view = document.getElementById('view');
    if (b.dataset.m17 === 'tog') { setPlain(!isPlain()); try { navigator.vibrate?.(8); } catch { /* */ } if (view) mountMai17(view); return; }
    if (b.dataset.m17 === 'hurra') {
      confetti(); try { navigator.vibrate?.([20, 40, 20, 40, 60]); } catch { /* */ }
      let n = hurraN() + 1;
      const s = b.querySelector('span');
      try { const r = await api('/glimt/mai17/hurra', { method: 'POST', json: {} }); if (r?.count) n = r.count; if (M.d) M.d.hurra = { count: n }; if (s) s.textContent = `${r?.text ?? `Hurra nr. ${n}`} · sendt til familien`; }
      catch { if (s) s.textContent = `Hurra nr. ${n}`; }
      try { localStorage.setItem(`mai17_hurra_${todayKey()}`, String(n)); } catch { /* */ }
    }
  });
}

export function initWeb41() {
  setInterval(osloTick, 60_000);
  setTimeout(osloTick, 4000);
  on?.('weather', sunFromWeather);
  bindMai17();
  document.addEventListener('hl:mai17', () => { const v = document.getElementById('view'); if (v && document.body.dataset.route === 'dash') mountMai17(v); });
}
/** Kalles av app.js etter hver tegning av en side. */
export function after41(route, view) {
  if (route === 'dash') mountMai17(view);
  else document.body.classList.remove('m17-on');
}

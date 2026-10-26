// Prompt 70 (WEBCHAT70, claude-code-chat-laster-web.md, fasit «Chat Laster Web.dc.html»): lastesiden for Chat på web.
// Markupen bygges av window.HL70 (chat70-boot.js, lastes synkront i app.html), så det statiske skjelettet og lastesiden er like.
// Her ligger tilstanden (laster · treg · feil), stegene, tidsgrensene, oppdatering på stedet, cache av samtalelista og overgangen.
//   - Treg etter 8 s (sekunder teller på steget som henger), feil etter 20 s eller ved nettverksfeil (orben grå og trist, rød «!»).
//   - Samtalelista og modellista caches per bruker (localStorage hl_chat70) og vises med en gang neste gang.
const KEY = 'hl_chat70';
export const SLOW70 = 8000, FAIL70 = 20000;

export const L70 = { run: 0, mode: 'laster', t0: 0, steps: [], model: '', modelOk: false, tick: 0, slow: 0, fail: 0, onFail: null };

const H = () => (typeof window !== 'undefined' ? window.HL70 : null);
const uid = () => { try { return localStorage.getItem('hl_uid') || ''; } catch { return ''; } };

/** Cache (per bruker): {uid, at, list, models}. */
export function cacheRead70() {
  const h = H();
  if (h?.cacheRead) return h.cacheRead();
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.list && (!c.uid || String(c.uid) === uid()) ? c : null; } catch { return null; }
}
const row = (x) => ({ id: x.id, title: String(x.title ?? '').slice(0, 120), updatedAt: x.updatedAt, model: x.model || '' });
/** Lagrer titler, sist brukt og modell for de nyeste samtalene (ikke meldinger). */
export function trimList70(list) {
  if (!list) return null;
  return { pinned: (list.pinned ?? []).slice(0, 30).map(row), folders: (list.folders ?? []).slice(0, 30).map((f) => ({ id: f.id, name: f.name, open: f.open, chats: (f.chats ?? []).slice(0, 40).map(row) })), chats: (list.chats ?? []).slice(0, 80).map(row) };
}
export function cacheWrite70(patch) {
  try {
    let old = {};
    try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && (!o.uid || String(o.uid) === uid())) old = o; } catch { /* ødelagt cache */ }
    const c = { ...old, ...patch, uid: uid(), at: Date.now() };
    if (patch.list) c.list = trimList70(patch.list);
    if (patch.models) c.models = patch.models.slice(0, 60).map((m) => ({ id: m.id, name: m.name, kind: m.kind, installed: m.installed, provider: m.provider, vision: m.vision }));
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch { /* privat modus / full lagring */ }
}
export const listCount70 = (l) => (l?.pinned?.length ?? 0) + (l?.chats?.length ?? 0) + (l?.folders ?? []).reduce((n, f) => n + (f.chats?.length ?? 0), 0);

/** Skjelettrader i sidemenyen mens samtalelista hentes (uten cache). */
export function skelRows70() {
  return `<div class="ch70-rows" aria-hidden="true">${[[80, 46], [64, 34], [76, 28], [52, 38], [68, 44]].map(([a, b]) => `<span class="ch70-sr"><i style="width:${a}%"></i><i style="width:${b}%"></i></span>`).join('')}</div>`;
}

/** Ny innlasting: nullstiller stegene og starter tidsgrensene. Returnerer kjøre-id (eldre svar ignoreres). */
export function start70(onTick, onFail) {
  stop70();
  L70.run += 1; L70.mode = 'laster'; L70.t0 = (typeof performance !== 'undefined' ? performance.now() : 0); L70.model = ''; L70.modelOk = false;
  L70.steps = [{ s: 'run', t: '' }, { s: 'wait', t: '' }, { s: 'wait', t: '' }];
  L70.onFail = onFail;
  L70.slow = setTimeout(() => { if (L70.mode === 'laster') { L70.mode = 'treg'; onTick(); } }, SLOW70);
  L70.fail = setTimeout(() => fail70(), FAIL70);
  L70.tick = setInterval(() => { if (L70.mode === 'treg') onTick(); }, 1000);
  return L70.run;
}
export function stop70() { clearTimeout(L70.slow); clearTimeout(L70.fail); clearInterval(L70.tick); L70.slow = L70.fail = L70.tick = 0; }
/** Tidsavbrudd eller nettverksfeil: steget som henger får «!» og «svarer ikke». */
export function fail70() {
  if (L70.mode === 'feil') return;
  stop70();
  L70.mode = 'feil';
  let hit = false;
  L70.steps = L70.steps.map((x) => { if (x.s === 'ok') return x; if (!hit) { hit = true; return { s: 'err', t: 'svarer ikke' }; } return { s: 'wait', t: '' }; });
  L70.onFail?.();
}
/** Stegene: 0 Kobler til Homelab, 1 Henter samtaler, 2 Laster modell. */
export function step70(i, s, t = '') {
  if (L70.mode === 'feil') return;
  L70.steps[i] = { s, t };
  if (i === 0 && s === 'ok') for (const j of [1, 2]) if (L70.steps[j].s === 'wait') L70.steps[j] = { s: 'run', t: '' };
}
/** Stegene som skal tegnes: i treg-modus teller sekundene på steget som henger. */
export function viewSteps70() {
  if (L70.mode !== 'treg') return L70.steps;
  const sec = `${Math.floor(((typeof performance !== 'undefined' ? performance.now() : 0) - L70.t0) / 1000)} s`;
  let hit = false;
  return L70.steps.map((x) => (x.s === 'run' && !hit ? ((hit = true), { s: 'run', t: sec }) : x));
}
const pnow = () => (typeof performance !== 'undefined' ? performance.now() : 0);
let first70 = null; // når lastesiden ble vist første gang (0 = det statiske skjelettet fra navigasjonsstart)
function state70(extra) {
  if (first70 == null) { const h = H(); first70 = h && h.staticAt === 0 ? 0 : pnow(); }
  const t0 = Math.min(first70, L70.run ? L70.t0 : Infinity);
  // Har midten allerede vært synlig (300 ms forsinkelse + 250 ms inntoning), tegnes den uten ny inntoning.
  return { mode: L70.mode, steps: viewSteps70(), model: L70.model, modelOk: L70.modelOk, t0, instant: pnow() - t0 > 560, ...extra };
}

/** Hele lastesiden. */
export function loaderHtml70({ wide = true, cache = null } = {}) {
  const h = H();
  if (!h) return '<div class="ch-miss"><span>Laster Chat …</span></div>';
  return h.html(state70({ wide, cache }));
}
/** Oppdaterer lastesiden på stedet (orb og spinnere fortsetter uten hopp). false hvis den ikke er tegnet. */
export function update70(host) {
  const h = H(), root = host?.querySelector('[data-l70]');
  if (!h || !root) return false;
  const mode = L70.mode, T = h.TXT[mode] ?? h.TXT.laster;
  if (!root.classList.contains(mode)) {
    root.classList.remove('laster', 'treg', 'feil'); root.classList.add(mode);
    root.querySelector('[data-l70-title]').textContent = T[0];
    root.querySelector('[data-l70-sub]').textContent = T[1];
    root.querySelector('[data-l70-btns]').hidden = mode === 'laster';
    const orb = root.querySelector('.ch70-orb');
    if (orb) orb.outerHTML = h.orbHtml(mode === 'feil');
    if (mode === 'feil') root.querySelector('.ch70-shim')?.remove();
    root.querySelector('[data-l70-mid]')?.classList.add('now');
  }
  const steps = root.querySelector('[data-l70-steps]');
  const sh = h.stepsHtml(viewSteps70());
  if (steps && steps.dataset.v !== sh) {
    // Bytt bare stegene som er endret, så spinnerne ikke starter på nytt hvert sekund.
    const tmp = document.createElement('div'); tmp.innerHTML = sh;
    [...tmp.children].forEach((el, i) => {
      const cur = steps.children[i];
      if (!cur) steps.appendChild(el);
      else if (cur.className !== el.className) cur.replaceWith(el);
      else { const t = cur.querySelector('.ch70-st'), n = el.querySelector('.ch70-st'); if (t && n && t.textContent !== n.textContent) t.textContent = n.textContent; }
    });
    steps.dataset.v = sh;
  }
  const pill = root.querySelector('[data-l70-pill]');
  if (pill) { const p = h.pillHtml(state70()); if (pill.outerHTML !== p) pill.outerHTML = p; }
  return true;
}

/** Overgang når alt er klart: orben og stegene glir ut over den ekte visningen, ekte rader tones inn (150 ms). */
export function finish70(host, paintReal) {
  stop70();
  const mid = host?.querySelector('[data-l70-mid]');
  const shown = mid && getComputedStyle(mid).opacity > 0.05;
  const midHtml = shown ? mid.outerHTML : '';
  paintReal();
  if (!host) return;
  host.classList.add('ch70-fadein');
  setTimeout(() => host.classList.remove('ch70-fadein'), 320);
  const sc = host.querySelector('[data-ch-sc]');
  if (midHtml && sc) {
    const r = sc.getBoundingClientRect(), o = document.createElement('div');
    o.className = `ch ch70-out ${host.classList.contains('noytral') ? 'noytral' : 'papir'}`;
    o.setAttribute('aria-hidden', 'true');
    o.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:111;border:0;border-radius:0;box-shadow:none;background:transparent`;
    o.innerHTML = `<div class="ch70">${midHtml}</div>`;
    document.body.appendChild(o);
    setTimeout(() => o.remove(), 280);
  }
  const inp = host.querySelector('[data-ch-in]');
  if (inp && !document.querySelector('#settings:not([hidden])')) { try { inp.focus({ preventScroll: true }); } catch { /* */ } }
}

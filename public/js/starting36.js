// Prompt 36: «Starter opp»-siden med Glimt (fasit Nordlys Starter.dc.html) når web mister kontakt med serveren
// (etter «Oppdater nå» når tjenestene startes på nytt, eller /api/health svarer ikke / 502 / 503).
// Fullskjerm over hele vinduet (z-index 9999). Poller GET /api/health hvert 1,5 s (cache: no-store):
// {ready, version, steps:[{id, label, status:'wait'|'run'|'ok', ms}]}. Ingen svar = første steg er aktivt.
// Når ready: «KLAR» i 0,8 s og så hard reload (service worker skipWaiting + location.reload()).
// Den statiske public/starting.html (SERVER36) er den samme siden for proxyen (502/503) mens appen er nede.
import { fig, hostFor } from './glimt-figs.js';
import { gs } from './glimt35.js';

const STEPS = [['db', 'Starter databasen'], ['migrate', 'Kjører migrasjoner'], ['api', 'Starter web og API'], ['ai', 'Vekker Glimt og AI-modellene'], ['integrations', 'Kobler til integrasjoner']];
const LINES = ['Serveren starter på nytt etter oppdateringen. Glimt sover litt …', 'Glimt våkner og sjekker at alt er på plass.', 'Nesten klar. Glimt varmer opp modellene.', 'Alt kjører! Laster inn Homelab …'];
const S = { on: false, t0: 0, steps: null, ready: false, ver: '', fails: 0, timer: null, tick: null };
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function probe() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' });
    // Prompt 40: 503 med X-Homelab-State: starting = serveren starter faktisk (proxyen/serveren sier det selv).
    if (r.status === 503 && /starting/i.test(r.headers.get('x-homelab-state') ?? '')) return { down: true, starting: true };
    if (r.status === 502 || r.status === 503 || r.status === 504) return { down: true };
    const j = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
    // Eldre server (eller ikke innlogget): svarer den i det hele tatt, kjører den.
    if (!r.ok || !j || !('ready' in j)) return { up: true, ready: true };
    return { up: true, ready: !!j.ready, restarting: j.restarting === true, steps: Array.isArray(j.steps) ? j.steps : null, ver: j.version ?? '' };
  } catch { return { down: true }; }
}

function stepsNow() {
  const by = new Map((S.steps ?? []).map((x) => [x.id, x]));
  const list = STEPS.map(([id, n]) => ({ id, n: by.get(id)?.label || n, st: S.ready ? 'ok' : by.get(id)?.status ?? 'wait', ms: by.get(id)?.ms }));
  if (!S.steps && !S.ready) list[0].st = 'run';
  return list;
}
function html() {
  const L = stepsNow(), done = L.filter((x) => x.st === 'ok').length, i = L.findIndex((x) => x.st !== 'ok');
  const phase = S.ready ? 3 : i < 2 && i >= 0 ? 0 : i < 4 && i >= 0 ? 1 : 2;
  const mood = phase === 0 ? 'sov' : phase === 3 ? 'talk' : 'idle';
  const pct = S.ready ? 100 : Math.round((done / L.length) * 100), R = 92, C = 2 * Math.PI * R;
  let who = 'glimt'; try { who = hostFor(gs().char); } catch { /* */ }
  const el = Math.floor((Date.now() - S.t0) / 1000), ver = String(S.ver || '').split('.').slice(0, 2).join('.');
  const ic = (st) => (st === 'ok' ? '<svg class="ns36-ok" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#2f7d4f"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : st === 'run' ? '<span class="ns36-spin"></span>' : '<span class="ns36-wait"></span>');
  return `<div class="ns36-aur" aria-hidden="true"><span></span></div>
  <div class="ns36-in">
    <span class="ns36-hero"><svg width="208" height="208" viewBox="0 0 208 208" class="ns36-ring" aria-hidden="true"><defs><linearGradient id="ns36G" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3fbf9a"/><stop offset="55%" stop-color="#ffd9c2"/><stop offset="100%" stop-color="#ff8a5c"/></linearGradient></defs><circle cx="104" cy="104" r="${R}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="5"/><circle cx="104" cy="104" r="${R}" fill="none" stroke="url(#ns36G)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}" style="transition:stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)"/></svg>
      <span class="ns36-orb" aria-hidden="true"><i style="background:#ffd9c2;transform:rotate(0deg) translateY(-104px)"></i><i style="background:#3fbf9a;transform:rotate(120deg) translateY(-104px)"></i><i style="background:#a78bfa;transform:rotate(240deg) translateY(-104px)"></i></span>
      <span class="ns36-fig${phase === 0 ? '' : ' fl'}">${fig(who, 128, mood)}</span>${phase === 0 ? [0, 1, 2].map((k) => `<span class="ns36-z" style="font-size:${14 + k * 4}px;animation-delay:${k * 0.8}s">z</span>`).join('') : ''}
      <span class="ns36-pct">${pct} %</span></span>
    <div class="ns36-t"><span class="ns36-k">${S.ready ? 'KLAR' : 'STARTER OPP'}</span><b>Nordlys<span>OS</span>${ver ? ` <em>${esc(ver)}</em>` : ''}</b><span class="ns36-line" role="status">${LINES[phase]}</span></div>
    <div class="ns36-steps">${L.map((x) => `<div class="ns36-st${x.st === 'wait' ? ' w' : ''}"><span class="ns36-ic">${ic(x.st)}</span><span class="ns36-n">${esc(x.n)}</span><span class="ns36-ms">${x.st === 'ok' && x.ms ? `${(x.ms / 1000).toFixed(1).replace('.', ',')} s` : x.st === 'run' ? '…' : ''}</span></div>`).join('')}</div>
    <div class="ns36-foot"><span>${S.ready ? 'Laster inn siden …' : `Siden lastes inn automatisk når serveren svarer · ${el} s`}</span>${!S.ready && el > 180 ? '<span>Det tar lengre tid enn vanlig.</span>' : ''}${!S.ready && el > 40 ? '<a href="" data-ns-reload>Last inn på nytt nå</a>' : ''}</div>
  </div>`;
}
/* Prompt 38 (FEIL: siden flimrer inn og ut): bakgrunnen og figuren bygges én gang (figuren memo per humør), og bare
   ringen, prosenten, stegene og bunnteksten oppdateres. Ingen innerHTML på hele overlegget hvert sekund. */
const memo = { key: '', steps: '', head: '', foot: '' };
function paint() {
  const o = document.getElementById('ns36');
  if (!o) return;
  const tmp = document.createElement('div'); tmp.innerHTML = html();
  const fresh = tmp.querySelector('.ns36-in');
  if (!o.firstChild) { o.replaceChildren(...tmp.childNodes); Object.assign(memo, { key: figKey(fresh), steps: fresh.querySelector('.ns36-steps').innerHTML, head: fresh.querySelector('.ns36-t').innerHTML, foot: fresh.querySelector('.ns36-foot').innerHTML }); return; }
  const cur = o.querySelector('.ns36-in');
  const k = figKey(fresh);
  if (k !== memo.key) { cur.querySelector('.ns36-hero').replaceWith(fresh.querySelector('.ns36-hero')); memo.key = k; }
  else {
    const a = cur.querySelector('.ns36-ring circle:last-child'), b = fresh.querySelector('.ns36-ring circle:last-child');
    if (a && b && a.getAttribute('stroke-dashoffset') !== b.getAttribute('stroke-dashoffset')) a.setAttribute('stroke-dashoffset', b.getAttribute('stroke-dashoffset'));
    const pa = cur.querySelector('.ns36-pct'), pb = fresh.querySelector('.ns36-pct'); if (pa && pb && pa.textContent !== pb.textContent) pa.textContent = pb.textContent;
  }
  for (const [sel, key] of [['.ns36-t', 'head'], ['.ns36-steps', 'steps'], ['.ns36-foot', 'foot']]) {
    const h = fresh.querySelector(sel).innerHTML;
    if (h !== memo[key]) { cur.querySelector(sel).innerHTML = h; memo[key] = h; }
  }
}
const figKey = (el) => `${el.querySelector('.ns36-fig')?.className}|${el.querySelector('.ns36-fig')?.innerHTML.length}|${el.querySelectorAll('.ns36-z').length}`;

function show() {
  if (S.on) return;
  S.on = true; S.t0 = Date.now(); S.ready = false; S.steps = null;
  const o = document.createElement('div');
  memo.key = ''; memo.steps = ''; memo.head = ''; memo.foot = '';
  o.id = 'ns36'; o.className = 'ns36'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Serveren starter opp');
  document.body.appendChild(o);
  o.addEventListener('click', (e) => { if (e.target.closest('[data-ns-reload]')) { e.preventDefault(); location.reload(); } });
  paint();
  S.tick = setInterval(paint, 1000);
  clearTimeout(S.timer); poll();
}
async function hardReload() {
  try { const r = await navigator.serviceWorker?.getRegistration?.(); r?.waiting?.postMessage?.({ type: 'SKIP_WAITING' }); await r?.update?.(); } catch { /* */ }
  // Prompt 38: fade ut 0,3 s før reload, mot samme mørke bakgrunn (ingen hvit blink). Siden står til reload (ingen restart).
  document.documentElement.style.background = '#101a2e';
  document.getElementById('ns36')?.classList.add('out');
  setTimeout(() => location.reload(), 300);
}
async function poll() {
  const r = await probe();
  if (r.up) { S.steps = r.steps ?? S.steps; if (r.ver) S.ver = r.ver; if (r.ready) { S.ready = true; clearUpdating(); paint(); clearInterval(S.tick); setTimeout(hardReload, 800); return; } }
  paint();
  S.timer = setTimeout(poll, 1500);
}

/* Prompt 40 (claude-code-starter-blink-ved-oppdater.md): siden blinket inn ved vanlig ⌘R/F5.
   Den vises nå bare når (1) «Oppdater nå» har satt hl_updating i sessionStorage, (2) serveren sier at den starter
   (503 + X-Homelab-State: starting, eller /api/health → {restarting:true}), eller (3) to helsesjekker på rad (minst 3 s
   mellom) feiler etter at appen var lastet og koblet til. Tapt kontakt under lasting (første 5 s) og unload teller ikke,
   og selv da ventes det 1,5 s – kommer serveren tilbake innen da, vises ingenting. */
const W = { loadedAt: Date.now(), unloading: false, connected: false, pend: null };
const updating = () => { try { return JSON.parse(sessionStorage.getItem('hl_updating') || 'null'); } catch { return null; } };
/** Kalles av «Oppdater nå» (sysupdate.js): neste tap av kontakt er en ekte restart. */
export function markUpdating(version) { try { sessionStorage.setItem('hl_updating', JSON.stringify({ at: Date.now(), version: version ?? null })); } catch { /* privat modus */ } }
const clearUpdating = () => { try { sessionStorage.removeItem('hl_updating'); } catch { /* */ } };
function showSoon() {
  if (S.on || W.pend || W.unloading) return;
  W.pend = setTimeout(async () => {
    W.pend = null;
    if (W.unloading || S.on) return;
    const r = await probe();
    if (W.unloading) return;
    // Svarer serveren igjen (og starter ikke), var det bare et hikke.
    if (r.up && r.ready !== false && !r.restarting && !updating()) return;
    const u = updating(); if (u?.version) S.ver = u.version;
    show();
  }, 1500);
}

/** Overvåker kontakten med serveren (hvert 20. s mens fanen er synlig, og med en gang når nettleseren er online igjen). */
export function watchServer() {
  const off = () => { W.unloading = true; clearTimeout(W.pend); W.pend = null; };
  window.addEventListener('pagehide', off);
  window.addEventListener('beforeunload', off);
  window.addEventListener('pageshow', (e) => { if (e.persisted) { W.unloading = false; W.loadedAt = Date.now(); } });
  // Kom vi tilbake etter «Oppdater nå» og serveren er klar, er oppdateringen ferdig.
  let last = 0;
  const check = async () => {
    if (S.on || document.hidden || W.unloading) return;
    const r = await probe();
    if (W.unloading) return;
    if (r.starting || (r.up && r.restarting)) { showSoon(); return; }
    if (r.down) {
      // De første 5 s etter lasting regnes ikke som «mistet kontakt», og bare etter at appen har vært koblet til.
      if (Date.now() - W.loadedAt < 5000 || !W.connected) { if (updating()) showSoon(); return; }
      S.fails++;
      if (S.fails >= 2 && Date.now() - last >= 3000) showSoon(); else { last = Date.now(); setTimeout(check, 3000); }
      return;
    }
    S.fails = 0; W.connected = true;
    if (r.up && r.ready && updating()) clearUpdating();
    if (r.up && r.ready === false && updating()) showSoon();
  };
  setTimeout(check, 5000);
  setInterval(check, 20_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('online', check);
  // Oppdateringen er kommet til «Starter serveren på nytt»: vis siden (etter 1,5 s). sysupdate.js sender hl:restarting.
  document.addEventListener('hl:restarting', () => { if (!updating()) markUpdating(); showSoon(); });
}
export const showStarting = show;

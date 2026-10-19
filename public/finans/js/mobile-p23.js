// Prompt 23 (mobil-PWA): sveip tilbake med forrige side montert bak, scrollposisjon per rute, Kvitteringer i Papir,
// Finn-annonsen i appen, AI-tidsgrenser, Integrasjoner (Home Assistant) og ikoner på fanene i Nyhetsleser.
// Fasit: design/Mobil Papir App.dc.html, Nyhetsleser.dc.html og prompts/prompt-23-pakke/*.
import * as P24 from './mobile-p24.js';
import { S, api, hlApi, esc, n0, n2, dd, today, parseAmount, loadReceipts, loadBoot } from './core.js';
import { m, draw, flash, loadJobs, ACTIVE_JOBS, retryUpload } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { logo } from './mobile-p20.js';
import { canSrv } from './mobile-p17.js';

const root = () => document.getElementById('app');
const lab = (t, r = '') => `<span class="p23-lab"><span>${t}</span>${r ? `<span>${r}</span>` : ''}</span>`;

/* =====================================================================
   1. Sideminne: forrige side ligger montert bak, og scrollposisjonen huskes per rute
   ===================================================================== */
// Hver gang visningen (vk) byttes, flyttes den gamle .m-noden ut av #app i stedet for å kastes. De to siste beholdes
// som ferdig tegnede noder; eldre oppføringer husker bare scrollposisjonen. Kommer man tilbake til en visning som
// ligger i stabelen, regnes det som «tilbake»: posisjonen gjenopprettes og sidene over glemmes. Ellers åpner siden øverst.
const NODES = 2, MAXS = 14;
const ST = { stack: [], liveY: 0, hash: '', pending: null, want: null, bound: false };
const under = () => {
  let u = document.getElementById('p23-under');
  if (!u) { u = document.createElement('div'); u.id = 'p23-under'; u.setAttribute('aria-hidden', 'true'); u.inert = true; document.body.appendChild(u); }
  return u;
};
function bindScroll() {
  if (ST.bound) return;
  ST.bound = true;
  addEventListener('scroll', () => { if (!SW.g?.on) ST.liveY = scrollY; }, { passive: true });
  // Brukeren tar over: ikke tving gjenopprettingen videre.
  addEventListener('pointerdown', () => { ST.want = null; }, { capture: true, passive: true });
  addEventListener('wheel', () => { ST.want = null; }, { passive: true });
}
/** Kalles øverst i draw() med den nye visningsnøkkelen, før innholdet byttes. */
export function leave(vk) {
  bindScroll();
  if (vk === m.lastVk) return false;
  const el = root()?.firstElementChild;
  if (el && m.lastVk != null && !el.hasAttribute('data-boot')) {
    el.remove();
    ST.pending = { vk: m.lastVk, node: el, y: ST.liveY, hash: ST.hash || location.hash };
  } else ST.pending = null;
  return true;
}
/** Kalles etter at den nye visningen er tegnet. */
export function arrive(vk, changed) {
  const two = matchMedia('(min-width: 600px)').matches && !document.querySelector('#app > .m.papir');
  if (!changed) { keepWant(vk); return; }
  m.lastVk = vk;
  const i = ST.stack.map((e) => e.vk).lastIndexOf(vk);
  let y = 0;
  if (i >= 0) { y = ST.stack[i].y; ST.stack.splice(i); clean(ST.pending?.node); }
  else if (ST.pending) { ST.stack.push(ST.pending); if (ST.stack.length > MAXS) ST.stack.shift(); }
  ST.pending = null;
  ST.stack.forEach((e, j) => { if (j < ST.stack.length - NODES && e.node) { clean(e.node); e.node = null; } });
  ST.hash = location.hash;
  mountUnder();
  if (SW.done) finishSwipe();
  ST.liveY = y;
  window.scrollTo(0, y);
  if (two) root().querySelector('.m-scroll')?.scrollTo?.(0, 0);
  ST.want = y > 0 ? { vk, y, until: Date.now() + 2500 } : null;
}
// Innholdet kan komme etter første tegning (data lastes): prøv igjen til siden er høy nok, maks 2,5 s.
function keepWant(vk) {
  const w = ST.want;
  if (!w || w.vk !== vk || Date.now() > w.until) { ST.want = null; return; }
  if (Math.abs(scrollY - w.y) > 2) window.scrollTo(0, w.y);
  if (Math.abs(scrollY - w.y) <= 2 && document.documentElement.scrollHeight - innerHeight >= w.y) ST.want = null;
}
function clean(node) { node?.querySelectorAll?.('video').forEach((v) => { try { v.srcObject?.getTracks?.().forEach((t) => t.stop()); } catch {} }); }
const top = () => ST.stack[ST.stack.length - 1] ?? null;
function mountUnder(entry = top()) {
  const u = under();
  const node = entry?.node ?? null;
  if (u.firstElementChild !== node) { u.replaceChildren(); if (node) { node.classList.add('p23-snap'); node.style.top = `${-(entry.y || 0)}px`; u.appendChild(node); } }
}
/** Tester og verktøy: hvor mange sider som ligger bak. */
export const stackInfo = () => ST.stack.map((e) => ({ vk: e.vk, y: e.y, hash: e.hash, mounted: !!e.node }));

/* =====================================================================
   2. Sveip tilbake fra venstre kant (iOS-stil, med forhåndsvisning)
   ===================================================================== */
// Fingeren starter innenfor 24 px fra venstre kant. Siden følger fingeren 1:1 med skygge; forrige side ligger bak,
// forskjøvet −30 % og med 10 % slør, og glir til 0 i takt. Slipp etter 50 % av bredden eller over 500 px/s fullfører
// (0,25 s ease-out), ellers fjærer siden tilbake. Toppbildet og fanelinjen følger siden de hører til.
const EDGE = 28, SW = { g: null, up: 0, done: false };
export const swGuard = () => Date.now() - SW.up < 400;
export const swOn = () => !!SW.g?.on;
const rootPage = () => {
  if (m.sub || m.detail || m.edit || m.pdet || m.rc) return false;
  const cur = root().querySelector('.pp-nav [aria-current="page"], .tabbar [aria-current="page"], .navbar [aria-current="page"]');
  return !!cur && cur.getAttribute('href') === `#/${m.screen}`;
};
export function swDown(e, target) {
  if ((e.button ?? 0) > 0 || e.clientX > EDGE || !target || rootPage()) return false;
  SW.g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, to: target, on: false, armed: false, lx: e.clientX, lt: e.timeStamp || performance.now(), v: 0 };
  return false;
}
function pickEntry(to) {
  const href = to?.getAttribute?.('href');
  const norm = (h) => String(h ?? '').replace(/^#\/?/, '');
  if (href && href.startsWith('#')) {
    const hit = [...ST.stack].reverse().find((e) => e.node && norm(e.hash) === norm(href));
    if (hit) return hit;
    const other = [...ST.stack].reverse().find((e) => norm(e.hash) !== norm(location.hash));
    return other?.node ? other : null;
  }
  const t = top();
  return t?.node ? t : null;
}
export function swMove(e, cancelOthers) {
  const g = SW.g;
  if (!g || e.pointerId !== g.id) return false;
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
  if (!g.on) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { SW.g = null; return false; } // vanlig rulling
    if (dx < 10 || Math.abs(dy) > Math.abs(dx)) return false;
    start(g);
    cancelOthers?.(e);
  }
  const W = innerWidth, x = Math.max(0, Math.min(W, dx)), p = x / W;
  const t = e.timeStamp || performance.now(), dt = Math.max(1, t - g.lt);
  g.v = g.v * 0.4 + (((e.clientX - g.lx) / dt) * 1000) * 0.6; g.lx = e.clientX; g.lt = t; g.x = x;
  paint(g, x, p);
  const thr = Math.min(110, W * 0.28); // prompt 30: terskel min(110 px, 28 %)
  if (!g.armed && x >= thr) { g.armed = true; haptic('tick'); }
  else if (g.armed && x < thr) g.armed = false;
  if (e.cancelable) e.preventDefault();
  return true;
}
function start(g) {
  g.on = true;
  const cur = root().firstElementChild;
  g.cur = cur; g.y = scrollY; g.entry = pickEntry(g.to);
  try { root().setPointerCapture(g.id); } catch {}
  // Siden fryses der den står: fast posisjon med samme utsnitt, så fanelinjen og toppbildet følger med.
  document.body.style.minHeight = `${document.documentElement.scrollHeight}px`;
  cur.style.top = `${-g.y}px`; cur.style.height = `calc(100dvh + ${g.y}px)`;
  cur.classList.add('p23-swp');
  mountUnder(g.entry);
  const u = under();
  u.classList.toggle('empty', !g.entry);
  u.style.setProperty('--p23bg', getComputedStyle(cur).backgroundColor || '');
  u.classList.add('on');
}
function paint(g, x, p) {
  g.cur.style.transform = `translate3d(${x}px,0,0)`;
  const u = under();
  u.style.transform = `translate3d(${(-0.3 * innerWidth * (1 - p)).toFixed(1)}px,0,0)`;
  u.style.setProperty('--dim', (0.1 * (1 - p)).toFixed(3));
}
export function swEnd(e) {
  const g = SW.g;
  if (!g || e.pointerId !== g.id) return false;
  SW.g = null;
  if (!g.on) return false;
  SW.up = Date.now();
  try { root().releasePointerCapture(e.pointerId); } catch {}
  const W = innerWidth, x = g.x ?? 0;
  if ((e.timeStamp || performance.now()) - g.lt > 90) g.v = 0; // fingeren sto stille før slipp
  const go = e.type !== 'pointercancel' && g.v > -200 && (x > Math.min(110, W * 0.28) || g.v > 500);
  const u = under(), cur = g.cur;
  cur.classList.add('p23-anim'); u.classList.add('p23-anim');
  cur.style.transform = go ? `translate3d(${W}px,0,0)` : 'translate3d(0,0,0)';
  u.style.transform = go ? 'translate3d(0,0,0)' : `translate3d(${(-0.3 * W).toFixed(1)}px,0,0)`;
  u.style.setProperty('--dim', go ? '0' : '0.1');
  if (go) haptic('tap');
  setTimeout(() => {
    if (!go) { restore(cur, g.y); return; }
    SW.done = { cur, y: g.y };
    const ent = g.entry, here = location.hash;
    // Det som vises bak er målet: ligger det på en annen rute, går vi dit; ellers gjør tilbakeknappen jobben.
    if (ent && ent.hash && ent.hash !== here) location.hash = ent.hash;
    else {
      SW.up = 0;
      // Prompt 30: ble siden tegnet på nytt under sveipet (data kom inn), er knappen byttet ut – bruk den som står der nå.
      const to = g.to.isConnected ? g.to : root().querySelector('.pp-hero .pp-back, .m-scroll .gback, .m-scroll .back, .m-scroll .gtop, .m-scroll .atop, [data-mact="txback"], [data-mact="pdback"], [data-swipeback]');
      to?.click();
    }
    // Ble det ingen ny visning (f.eks. knappen gjorde ingenting), ryddes siden tilbake.
    setTimeout(() => { if (SW.done && SW.done.cur === cur) { SW.done = false; restore(cur, g.y); } }, 700);
  }, 250);
  return true;
}
function restore(cur, y) {
  cur.classList.remove('p23-swp', 'p23-anim');
  cur.style.transform = ''; cur.style.top = ''; cur.style.height = '';
  document.body.style.minHeight = '';
  hideUnder();
  if (cur.isConnected) window.scrollTo(0, y);
}
function hideUnder() {
  const u = under();
  u.classList.remove('on', 'p23-anim', 'empty'); u.style.transform = ''; u.style.removeProperty('--dim');
  mountUnder();
}
function finishSwipe() {
  const d = SW.done; SW.done = false;
  if (!d) return;
  d.cur.classList.remove('p23-swp', 'p23-anim'); d.cur.style.transform = ''; d.cur.style.top = ''; d.cur.style.height = '';
  document.body.style.minHeight = '';
  hideUnder();
}

/* =====================================================================
   3. Kvitteringer i Papir (Mobil Papir App → kvitt)
   ===================================================================== */
export const KV = { open: null, e: {}, del: null, busy: null };
const isRev = (r) => ['needs_review', 'failed', 'error'].includes(r.status);
const thisMonth = (r) => String(r.date ?? new Date(r.created ?? 0).toLocaleDateString('sv-SE')).slice(0, 7) === today().slice(0, 7);
const kr2 = (v) => `${(v ?? 0) > 0 ? '−' : ''}${n2(v ?? 0)}`;
const SVG = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const rcLogo = (r) => `<span class="p23-rlogo">${logo({ description: r.merchant ?? 'Kvittering', merchant: r.merchant, domain: r.domain }, 44, 12)}</span>`;
const conf = (r) => (r.confidence != null ? `${Math.round(r.confidence * (r.confidence <= 1 ? 100 : 1))} % sikker` : '');
function qItems() {
  const off = (m.offline ?? []).map((x) => ({ k: 'off', id: x.id, n: x.name || 'Kvittering', st: x.error ? `Feilet: ${x.error}` : 'Venter på nett · sendes automatisk', c: 'var(--pp-mut)', w: 100 }));
  const jobs = (m.jobs ?? []).filter((j) => ACTIVE_JOBS.includes(j.status) || j.status === 'error').map((j) => {
    const run = ACTIVE_JOBS.includes(j.status), p = Math.max(3, Math.min(99, j.progress ?? 0));
    const txt = j.statusText || j.timeoutText || (j.status === 'error' ? `Feilet${j.error ? ` · ${j.error}` : ''}` : j.status === 'pending' ? '✦ I kø …' : `✦ Leser … ${p} %`);
    return { k: 'job', id: j.id, n: j.merchant || j.name || 'Kvittering', st: txt, c: run ? 'var(--pp-lab)' : 'var(--pp-lab)', w: run ? p : 100 };
  });
  return [...off, ...jobs];
}
export function kvView() {
  const all = S.receipts ?? [], rev = all.filter(isRev), ok = all.filter((r) => r.status === 'booked' && thisMonth(r)), Q = qItems();
  const cats = (S.boot?.categories ?? []).filter((c) => c.kind !== 'income' && c.kind !== 'transfer');
  const row = (r, i, booked) => {
    const op = !booked && KV.open === r.id, e = KV.e[r.id] ?? { n: r.merchant ?? '', v: r.total != null ? n2(r.total) : '', cat: r.categoryId ?? null };
    const meta = booked ? `${dd(r.date)} · ${esc(r.category ?? 'Ukategorisert')}` : r.status === 'needs_review' ? `${dd(r.date)} · ${esc(r.provider ?? 'Manuell')}${conf(r) ? ` · ${conf(r)}` : ''}` : `<span style="color:var(--pp-lab)">Kunne ikke leses · fyll ut selv</span>`;
    const head = `${rcLogo(r)}<span class="p23-rt"><b>${esc(r.merchant || 'Ny kvittering')}</b><span>${meta}</span></span><span class="p23-rv">${r.total != null ? kr2(r.total) : '–'}</span>`;
    if (booked) return `<div class="p23-rrow" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}">${head}<button class="p23-undo" data-p23="rcundo" data-id="${esc(r.id)}" aria-label="Angre" title="Tilbake til gjennomgang">↺</button></div>`;
    return `<div style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><button class="p23-rrow p23-rbtn" data-p23="rcopen" data-id="${esc(r.id)}" aria-expanded="${op}">${head}</button>
      ${op ? `<div class="p23-red"><div class="p23-red2"><input class="p23-in" id="p23-rn-${esc(r.id)}" data-p23in="rcn" data-id="${esc(r.id)}" value="${esc(e.n)}" aria-label="Butikk" autocomplete="off"><input class="p23-in mono" id="p23-rv-${esc(r.id)}" data-p23in="rcv" data-id="${esc(r.id)}" value="${esc(e.v)}" inputmode="decimal" aria-label="Beløp"></div>
        <div class="p23-cats">${cats.map((c) => `<button class="p23-cat" data-p23="rccat" data-id="${esc(r.id)}" data-c="${c.id}" aria-pressed="${+e.cat === c.id}">${esc(c.name)}</button>`).join('')}</div>
        <div class="p23-racts"><button class="p23-ok" data-p23="rcok" data-id="${esc(r.id)}" ${KV.busy === r.id ? 'disabled' : ''}>${KV.busy === r.id ? 'Bokfører …' : '✓ Godkjenn og bokfør'}</button><button class="p23-re" data-p23="rcre" data-id="${esc(r.id)}">✦ På nytt</button><button class="p23-del" data-p23="rcdel" data-id="${esc(r.id)}" aria-label="${KV.del === r.id ? 'Trykk igjen for å slette' : 'Slett'}">${KV.del === r.id ? 'Slett?' : '🗑'}</button></div></div>` : ''}</div>`;
  };
  return `<div class="p23-kv">
    <button class="p23-cam" data-p23="cam"><span class="p23-camic">${SVG('M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 24)}</span><span class="p23-rt"><b style="font-size:17px;font-weight:700">Ta bilde av kvittering</b><span style="font-size:13px">Bakkamera · ✦ ${esc(S.boot?.settings?.provider === 'ollama' ? 'Ollama' : 'Gemini')} leser beløp og butikk</span></span></button>
    <div class="p23-two"><label class="p23-pick">${SVG('M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01')}Bilder<input class="m-file" type="file" accept="image/*" multiple data-mupload data-stay></label><label class="p23-pick">${SVG('M6 3h8l4 4v14H6zM14 3v4h4')}Filer<input class="m-file" type="file" accept="application/pdf,image/*,.heic,.heif" multiple data-mupload data-stay></label></div>
    <input class="m-file" id="p23-cap" type="file" accept="image/*" capture="environment" data-mupload data-stay>
    ${m.uploading ? `<span class="pp-mut" style="font-size:13px;padding:0 4px">Laster opp ${m.uploading} fil${m.uploading > 1 ? 'er' : ''} …</span>` : ''}
    ${Q.length ? `${lab('KØ')}<div class="p23-box">${Q.map((x, i) => `<div class="p23-q" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p23-qt"><b>${esc(x.n)}</b><span style="color:${x.c}">${esc(x.st)}</span><span class="p23-qbar"><i style="width:${x.w}%;background:${x.c}"></i></span></span>
      <button class="p23-qre" data-p23="${x.k === 'off' ? 'qretry' : 'qre'}" data-id="${esc(x.id)}">${x.k === 'off' ? '↻ Send nå' : '✦ Analyser på nytt'}</button></div>`).join('')}</div>` : ''}
    ${lab(`TIL GJENNOMGANG · ${rev.length}`)}
    ${rev.length ? `<div class="p23-box">${rev.map((r, i) => row(r, i, false)).join('')}</div>` : '<div class="p23-box p23-none">Alt er gjennomgått ✓</div>'}
    ${ok.length ? `${lab(`BOKFØRT · ${ok.length}`)}<div class="p23-box">${ok.map((r, i) => row(r, i, true)).join('')}</div>` : ''}
  </div>`;
}
async function rcBook(id) {
  const r = (S.receipts ?? []).find((x) => x.id === id); if (!r) return;
  const e = KV.e[id] ?? {}, patch = {};
  if (e.n != null && e.n !== (r.merchant ?? '')) patch.merchant = e.n;
  if (e.v != null) { const v = parseAmount(String(e.v)); if (Number.isFinite(v) && v !== r.total) patch.total = Math.abs(v); }
  if (e.cat != null && +e.cat !== r.categoryId) patch.categoryId = +e.cat;
  if (!r.date) patch.date = today();
  KV.busy = id; draw();
  try {
    if (Object.keys(patch).length) await api(`/receipts/${id}`, { method: 'PATCH', json: patch });
    await api(`/receipts/${id}/book`, { method: 'POST' });
    KV.open = null; delete KV.e[id];
    await Promise.all([loadReceipts(), loadJobs()]);
    flash(`Bokført · ${e.n || r.merchant || 'kvittering'}`);
  } catch (err) { haptic('err'); flash(err.message); }
  KV.busy = null; draw();
}
async function kvBind(e, t, x) {
  const k = x.dataset.p23, id = x.dataset.id;
  if (k === 'cam') { document.getElementById('p23-cap')?.click(); return true; }
  if (k === 'rcopen') { KV.open = KV.open === id ? null : id; KV.del = null; draw(); return true; }
  if (k === 'rccat') { const r = (S.receipts ?? []).find((y) => y.id === id); KV.e[id] = { n: r?.merchant ?? '', v: r?.total != null ? n2(r.total) : '', ...(KV.e[id] ?? {}), cat: +x.dataset.c }; haptic('tab'); draw(); return true; }
  if (k === 'rcok') { syncInputs(id); await rcBook(id); return true; }
  if (k === 'rcre') {
    try { const mod = await import('./reanalyze.js'); await mod.openReanalyze(id, { engine: 'gemini', onDone: async () => { await Promise.all([loadReceipts().catch(() => {}), loadJobs().catch(() => {})]); draw(); } }); }
    catch { try { await api(`/receipts/${id}/reprocess`, { method: 'POST' }); await loadJobs(); flash('✦ Analyseres på nytt'); } catch (err) { flash(err.message); } }
    return true;
  }
  if (k === 'rcdel') {
    if (KV.del !== id) { KV.del = id; draw(); return true; }
    try { await api(`/receipts/${id}`, { method: 'DELETE' }); KV.del = null; KV.open = null; await loadReceipts(); flash('Kvitteringen er slettet'); } catch (err) { flash(err.message); }
    return true;
  }
  if (k === 'rcundo') {
    try { await api(`/receipts/${id}/unbook`, { method: 'POST' }); await loadReceipts(); KV.open = id; flash('Sendt tilbake til gjennomgang'); }
    catch (err) { flash(err.status === 404 || err.status === 405 ? 'Angre bokføring krever en nyere server' : err.message); }
    return true;
  }
  if (k === 'qre') {
    try { await api(`/receipts/${id}/reprocess`, { method: 'POST' }); await loadJobs(); flash('✦ Analyseres på nytt'); } catch (err) { flash(err.message); }
    return true;
  }
  if (k === 'qretry') { await retryUpload([id]); return true; }
  return false;
}
function syncInputs(id) {
  const n = document.getElementById(`p23-rn-${id}`), v = document.getElementById(`p23-rv-${id}`);
  const r = (S.receipts ?? []).find((y) => y.id === id);
  KV.e[id] = { n: r?.merchant ?? '', v: r?.total != null ? n2(r.total) : '', cat: r?.categoryId ?? null, ...(KV.e[id] ?? {}), ...(n ? { n: n.value } : {}), ...(v ? { v: v.value } : {}) };
}

/* =====================================================================
   4. Finn-annonsen i appen (Mobil Papir App → Finans → Finn → trykk på et kort)
   ===================================================================== */
export const FA = { id: null, d: null, ad: null, mails: null, chat: null, err: '', i: 0, mail: null, msg: '', sent: {} };
const STEPS = { bought: ['Betalt', 'Sendt', 'Mottatt', 'Godkjent'], sold: ['Solgt', 'Sendt', 'Levert', 'Utbetalt'] };
const TINT = ['#3A2F4A', '#1E2A3F', '#3B2E22', '#22362C', '#2C2C33', '#2A3540'];
const opt = (p) => p.catch((e) => (e.status === 404 || e.status === 405 || e.status === 501 ? null : Promise.reject(e)));
export async function finnAdLoad(id) {
  if (FA.id !== id) Object.assign(FA, { id, d: null, ad: null, mails: null, chat: null, err: '', i: 0, mail: null, msg: '' });
  try {
    const [d, ad, mails, chat] = await Promise.all([api(`/finn/${id}`), opt(api(`/finn/${id}/ad`)).catch(() => null), opt(api(`/finn/${id}/emails`)).catch(() => null), opt(api(`/finn/${id}/messages`)).catch(() => null)]);
    FA.d = d; FA.ad = ad && typeof ad === 'object' && !Array.isArray(ad) ? ad : null;
    FA.mails = Array.isArray(mails) ? mails : Array.isArray(mails?.items) ? mails.items : null;
    FA.chat = Array.isArray(chat) ? { items: chat } : chat && Array.isArray(chat.items ?? chat.messages) ? { items: chat.items ?? chat.messages, chatUrl: chat.chatUrl } : null;
    if (!FA.chat && Array.isArray(d?.messages)) FA.chat = { items: d.messages, chatUrl: d.chatUrl };
    FA.err = '';
  } catch (e) { FA.err = e.message; }
}
const shortFrom = (f) => { const s = String(f ?? ''); if (/finn/i.test(s)) return 'FINN'; if (/posten|bring/i.test(s)) return 'Posten'; return s.replace(/<.*>/, '').replace(/"/g, '').trim() || s; };
const tm = (d) => { if (!d) return ''; const x = new Date(d); if (Number.isNaN(+x)) return String(d); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
// Meldinger fra e-postvarsler («Du har fått en ny melding» / «… via FINN»), når serveren ikke har /messages.
function chatFromMails(mails, who) {
  return mails.filter((x) => /via finn|melding@finn|ny melding/i.test(`${x.from} ${x.subject}`)).map((x) => ({ from: /^du\b|^jeg\b/i.test(x.from ?? '') ? 'me' : 'them', text: String(x.body ?? x.snippet ?? '').replace(/^.*?ny melding[^\n]*\n/i, '').trim().split('\n')[0] || x.subject, time: x.date, who }));
}
export function finnAdView() {
  const x = FA.d;
  if (FA.err && !x) return `<div class="p23-ad"><div class="p23-adtop static"><a class="p23-glass" href="#/finn" data-swipeback>‹ Finn</a></div><div class="pp-card pp-mut" style="margin:120px 16px 0">${esc(FA.err)}</div></div>`;
  if (!x) return '<div class="p23-ad"><div class="p23-adtop static"><a class="p23-glass" href="#/finn" data-swipeback>‹ Finn</a></div><div class="m-spin" style="margin-top:140px"></div></div>';
  const A = FA.ad ?? {}, ad = x.ad ?? {}, sold = x.role === 'sold', L2 = STEPS[sold ? 'sold' : 'bought'];
  const st = Math.max(0, Math.min(3, (x.stage ?? 1) - 1)), done = !!x.done;
  const imgs = (A.images?.length ? A.images : ad.images?.length ? ad.images : x.photos?.map((p) => p.url) ?? []).filter(Boolean);
  const ini = String(x.item ?? '').split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
  const slides = (imgs.length ? imgs : [null, null, null]).map((u, i) => `<div class="p23-sl" style="background-color:${TINT[(x.id + i) % TINT.length]};${u ? `background-image:url('${esc(u)}')` : ''}">${u ? '' : `<span><b>${esc(ini)}</b><span>Bilde ${i + 1}</span></span>`}</div>`);
  const n = slides.length, i = Math.min(FA.i, n - 1);
  const url = A.url ?? ad.url ?? x.adUrl ?? null, other = x.counterpart || (sold ? 'kjøper' : 'selger');
  const title = A.title || ad.title || x.item, price = A.price ?? ad.price ?? x.amount;
  const attrs = (A.attrs ?? ad.attrs ?? []).filter((a) => a && a.label);
  const spec = attrs.length ? attrs : [['Finn-kode', x.code], ['Sted', ad.place], ['Sendingsnummer', x.tracking]].filter(([, v]) => v).map(([label, value]) => ({ label, value }));
  const desc = A.description ?? ad.description ?? '';
  const mails = FA.mails ?? x.emails ?? [];
  const chat = FA.chat?.items ?? chatFromMails(x.emails ?? [], other);
  const chatUrl = FA.chat?.chatUrl ?? url;
  const bars = [0, 1, 2, 3].map((j) => { const c = done ? 'var(--pp-pos)' : j < st ? 'var(--pp-ink)' : j === st ? 'var(--pp-lab)' : 'var(--pp-line)'; return `<span class="p23-fb"><i style="background:${c}"></i><span style="color:${j <= st || done ? 'var(--pp-ink)' : 'var(--pp-mut)'}">${esc(L2[j])}</span></span>`; }).join('');
  const lc = (f) => (f === 'FINN' ? '#0063fb' : f === 'Posten' ? '#e32d22' : 'var(--pp-ink)');
  return `<div class="p23-ad">
    <div class="p23-car"><div class="p23-slides" data-p23car>${slides.join('')}</div>
      <div class="p23-adtop"><a class="p23-glass" href="#/finn" data-swipeback>‹ Finn</a><button class="p23-glass sq" data-p23="adedit" data-id="${x.id}" aria-label="Rediger">✎</button></div>
      <div class="p23-dots">${slides.map((_, j) => `<span style="background:${j === i ? '#fff' : 'rgba(255,255,255,.45)'}"></span>`).join('')}</div>
      <span class="p23-cnt"><span id="p23-ci">${i + 1}</span> / ${n}</span></div>
    <div class="p23-adb">
      <div class="p23-col6"><span class="p23-k" style="color:${done ? 'var(--pp-pos)' : 'var(--pp-lab)'}">${esc((done ? 'Fullført' : x.status ?? L2[st]).toUpperCase())} · ${esc(dd(x.date))}</span>
        <h1 class="p23-adt">${esc(title)}</h1><span class="p23-adp">${n0(price)} kr</span><span class="pp-mut" style="font-size:13.5px">${sold ? 'Solgt til' : 'Kjøpt fra'} ${esc(other)}</span></div>
      <div class="p23-fiks"><span class="p23-k">FIKS FERDIG</span><div class="p23-fbs">${bars}</div></div>
      <div class="p23-col8"><span class="p23-k">OM ANNONSEN</span>
        ${spec.length ? `<div class="p23-spec">${spec.map((s, j) => `<div style="border-top:${j ? '1px solid var(--pp-line)' : '0'}"><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('')}</div>` : ''}
        ${desc ? `<p class="p23-desc">${esc(desc)}</p>` : `<p class="p23-desc pp-mut">${FA.ad === null && !ad.title ? 'Annonsen er ikke hentet ennå.' : 'Ingen beskrivelse.'}</p>`}
        ${A.removed ? '<span class="pp-mut" style="font-size:12.5px">Annonsen er fjernet fra Finn · viser lagret kopi</span>' : ''}
        <span class="p23-row8">${url ? `<a class="p23-ul" href="${esc(url)}" target="_blank" rel="noopener">Åpne annonsen i Finn ›</a>` : ''}<button class="p23-ul mut" data-p23="adref" data-id="${x.id}">↻ Hent på nytt</button></span></div>
      <div class="p23-col8"><span class="p23-lab" style="padding:0"><span>E-POSTER · ${mails.length}</span><span class="pp-mut" style="letter-spacing:0;font:500 12px Manrope">Proton Mail</span></span>
        <div class="p23-spec">${mails.map((e, j) => { const fr = shortFrom(e.from), key = String(e.id ?? j), op = FA.mail === key; return `<button class="p23-mail" data-p23="admail" data-k="${esc(key)}" data-eid="${esc(e.id ?? '')}" style="border-top:${j ? '1px solid var(--pp-line)' : '0'}"><span class="p23-mi" style="background:${lc(fr)}">${esc(fr.slice(0, 1))}</span><span class="p23-mt"><span class="p23-row8 sp"><b>${esc(e.subject ?? '')}</b><span>${esc(tm(e.date))}</span></span><span class="pp-mut">${esc(fr)}</span>${op ? `<span class="p23-mb">${esc(FA.body?.[key] ?? e.body ?? e.snippet ?? '')}</span>` : ''}</span></button>`; }).join('') || '<div class="pp-mut" style="padding:12px 0;font-size:14px">Ingen e-poster koblet til handelen.</div>'}</div></div>
      <div class="p23-col8"><span class="p23-lab" style="padding:0"><span>MELDINGER · ${esc(String(other).toUpperCase())}</span>${chatUrl ? `<a class="pp-mut" href="${esc(chatUrl)}" target="_blank" rel="noopener" style="letter-spacing:0;font:500 12px Manrope;text-decoration:none">Åpne i Finn ›</a>` : ''}</span>
        <div class="p23-chat">${[...chat, ...(FA.sent[x.id] ?? [])].map((c) => { const mine = c.from === 'me'; return `<div class="p23-bub ${mine ? 'me' : ''}"><span>${esc(c.text)}</span><small>${esc(tm(c.time))}</small></div>`; }).join('') || '<span class="pp-mut" style="font-size:13px">Ingen meldinger ennå. Meldinger fra e-postvarsler vises her.</span>'}
          <form class="p23-send" data-p23form="admsg" data-id="${x.id}"><input class="p23-in" id="p23-msg" data-p23in="admsg" value="${esc(FA.msg)}" placeholder="Skriv en melding …" autocomplete="off" aria-label="Melding"><button type="submit" aria-label="Send">↑</button></form>
          <span class="pp-mut" style="font-size:11.5px">Finn har ikke åpent chat-API. «Send» kopierer meldingen og åpner samtalen i Finn.</span></div></div>
    </div></div>`;
}
export function finnAdAfterDraw() {
  const c = root().querySelector('[data-p23car]');
  if (!c) return;
  if (FA.i && Math.abs(c.scrollLeft - FA.i * c.clientWidth) > 4) c.scrollLeft = FA.i * c.clientWidth;
  c.onscroll = () => {
    const i = Math.round(c.scrollLeft / Math.max(1, c.clientWidth));
    if (i === FA.i) return;
    FA.i = i;
    const ci = document.getElementById('p23-ci'); if (ci) ci.textContent = String(i + 1);
    root().querySelectorAll('.p23-dots span').forEach((d, j) => { d.style.background = j === i ? '#fff' : 'rgba(255,255,255,.45)'; });
  };
}
async function adBind(e, t, x) {
  const k = x.dataset.p23, id = x.dataset.id;
  if (k === 'adedit') { const { PF } = await import('./mobile-paper2.js'); PF.ed = +id; location.hash = '#/finn'; return true; }
  if (k === 'adref') {
    flash('Henter annonsen …');
    try { await api(`/finn/${id}/ad/refresh`, { method: 'POST' }); }
    catch (err) { if (err.status === 404) { try { await api(`/finn/${id}/ad`, { method: 'POST', json: {} }); } catch (e2) { flash(e2.message); } } else flash(err.message); }
    await finnAdLoad(+id); draw(); return true;
  }
  if (k === 'admail') {
    const key = x.dataset.k; FA.mail = FA.mail === key ? null : key; draw();
    const eid = x.dataset.eid;
    if (FA.mail && eid && !FA.body?.[key]) {
      try { const r = await opt(api(`/finn/${FA.id}/emails/${eid}`)); const b = r?.body ?? r?.text; if (b) { FA.body = { ...(FA.body ?? {}), [key]: b }; draw(); } } catch {}
    }
    return true;
  }
  return false;
}
async function adSend(f) {
  const v = (document.getElementById('p23-msg')?.value ?? FA.msg).trim();
  if (!v) return;
  const id = FA.id, now = new Date().toISOString();
  FA.sent[id] = [...(FA.sent[id] ?? []), { from: 'me', text: v, time: now }]; FA.msg = '';
  try { await navigator.clipboard?.writeText(v); } catch {}
  draw();
  const url = FA.chat?.chatUrl ?? FA.ad?.url ?? FA.d?.adUrl;
  if (url) window.open(url, '_blank', 'noopener');
  flash('Meldingen er kopiert · lim den inn i Finn');
}

/* =====================================================================
   5. Innstillinger → AI og tolkning → TIDSGRENSER
   ===================================================================== */
const STEP_S = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const TO_DEF = { gemini: 20, groq: 15, roboflow: 15, ollama: 45, retries: 1, onTimeout: 'next' };
const THEN = [['next', 'Prøv neste motor'], ['ocr', 'Bruk lokal OCR'], ['queue', 'Legg i kø og prøv senere']];
const lsTo = () => { try { return JSON.parse(localStorage.getItem('papir_ai_to') || 'null'); } catch { return null; } };
export const aiTo = () => ({ ...TO_DEF, ...(lsTo() ?? {}), ...(S.boot?.settings?.aiTimeouts ?? {}) });
export function aiTimeoutsView() {
  const T = aiTo(), ret = +T.retries || 0, ed = canSrv();
  // ISO2: tidsgrensene er serveroppsett. Andre enn admin ser dem skrivebeskyttet (uten trykk og pil).
  const r = (k, n, s, v, c = 'var(--pp-ink)') => ed ? `<button class="opt-row p17-row" data-p23="ato" data-k="${k}"><span class="m-grow p17-rt"><b>${esc(n)}</b><small>${esc(s)}</small></span><span class="sval" style="color:${c};opacity:1;font-weight:700">${esc(v)}</span><span class="p17-chev" aria-hidden="true">›</span></button>`
    : `<div class="opt-row p17-row p23-ro"><span class="m-grow p17-rt"><b>${esc(n)}</b><small>${esc(s)}</small></span><span class="sval" style="color:${c};opacity:1;font-weight:700">${esc(v)}</span></div>`;
  return `<span class="pp-lab p17-gl">TIDSGRENSER${ed ? '' : ' · SKRIVEBESKYTTET'}</span><div class="list p17-list p23-to">
    ${[['gemini', 'Gemini', 'Les kvitteringer'], ['groq', 'Groq', 'AI-søk og kategorier'], ['roboflow', 'Roboflow', 'Strekkoder'], ['ollama', 'Ollama (lokal)', 'Reserve på hjemmeserveren']].map(([k, n, s]) => r(k, n, ed ? `${s} · trykk for å endre` : s, `${T[k]} s`)).join('')}
    ${r('retries', 'Nye forsøk', 'Før den gir opp en motor', ret === 0 ? 'Ingen' : `${ret} ${ret === 1 ? 'gang' : 'ganger'}`)}
    ${r('onTimeout', 'Ved tidsavbrudd', 'Hva som skjer når grensen er nådd', (THEN.find(([k]) => k === T.onTimeout) ?? THEN[0])[1], 'var(--pp-lab)')}</div>
    <div class="snote">${ed ? '' : '🔒 Settes opp av administrator. '}Når en motor ikke svarer innen grensen, prøver serveren på nytt med 1 s, 2 s og 4 s pause. Køen viser hvilken motor som svarte for sent.</div>`;
}
let toT = null;
async function toBind(x) {
  if (!canSrv()) { flash('Settes opp av administrator'); return true; }
  const T = aiTo(), k = x.dataset.k;
  if (k === 'retries') T.retries = ((+T.retries || 0) + 1) % 4;
  else if (k === 'onTimeout') T.onTimeout = THEN[(THEN.findIndex(([v]) => v === T.onTimeout) + 1) % THEN.length][0];
  else T[k] = STEP_S[(STEP_S.indexOf(+T[k]) + 1) % STEP_S.length] ?? 20;
  try { localStorage.setItem('papir_ai_to', JSON.stringify(T)); } catch {}
  if (S.boot?.settings) S.boot.settings.aiTimeouts = T;
  haptic('tab'); draw();
  clearTimeout(toT);
  toT = setTimeout(async () => {
    try { const r = await api('/settings', { method: 'PUT', json: { aiTimeouts: T } }); if (r && S.boot) S.boot.settings = { ...S.boot.settings, ...r, aiTimeouts: r.aiTimeouts ?? T }; }
    catch (err) { flash(err.status === 400 || err.status === 404 ? 'Lagret på enheten · serveren støtter ikke tidsgrenser ennå' : err.message); }
  }, 600);
  return true;
}

/* =====================================================================
   6. Innstillinger → App → Integrasjoner (Home Assistant)
   ===================================================================== */
export const IG = { cfg: null, err: '', test: '', busy: false, ed: false, f: {} };
export async function integLoad() {
  const jobs = [hlApi('/config').then((c) => { IG.cfg = (c ?? []).find((g) => g.id === 'ha' || g.name === 'Home Assistant') ?? null; IG.err = ''; }).catch((e) => { IG.err = e.status === 403 ? 'Bare administrator kan endre tilkoblingen.' : e.message; })];
  const P22 = await import('./mobile-p22.js'), P17 = await import('./mobile-p17.js');
  jobs.push(P17.tasksLoad?.(true)?.catch?.(() => {}), P22.haLoad?.(true)?.catch?.(() => {}));
  await Promise.all(jobs);
}
export function integPage(haSection) {
  const f = IG.cfg?.fields ?? [], url = f.find((x) => x.key === 'ha_url'), tok = f.find((x) => x.key === 'ha_token');
  const host = String(url?.value ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const ok = !!(url?.value && tok?.set);
  const row = `<button class="opt-row p17-row" data-p23="igedit"><span class="set-ic fill" style="background:#18bcf2">${SVG('M3 11l9-7 9 7v9H3zM9 20v-6h6v6', 16)}</span><span class="m-grow p17-rt"><b>Tilkobling</b><small>${esc(host || 'Ikke satt opp')}${tok?.set ? ' · token lagret' : ''}</small></span><span class="sval" style="color:${ok ? 'var(--pp-pos)' : 'var(--pp-mut)'};opacity:1;font-weight:700">${IG.test && !IG.ed ? '' : ok ? 'Tilkoblet' : 'Koble til'}</span><span class="p17-chev">›</span></button>`;
  const ed = IG.ed ? `<form class="p23-igf" data-p23form="igsave"><label class="sb-lab">Adresse<input class="p23-in" name="ha_url" value="${esc(IG.f.ha_url ?? url?.value ?? '')}" placeholder="http://homeassistant.local:8123" inputmode="url" autocomplete="off"></label>
      <label class="sb-lab">Long-lived token<input class="p23-in" name="ha_token" type="password" value="" placeholder="${tok?.set ? 'Lagret · skriv for å bytte' : 'Lim inn token'}" autocomplete="off"></label>
      <span class="pp-mut" style="font-size:12px;line-height:1.45">Home Assistant → Profil → Sikkerhet → Long-lived access tokens → Opprett token.</span>
      <div class="p23-row8"><button class="pp-btn ink" type="submit" ${IG.busy ? 'disabled' : ''}>${IG.busy ? 'Lagrer …' : 'Lagre'}</button><button class="pp-btn" type="button" data-p23="igtest">Test</button><button class="pp-btn" type="button" data-p23="igx">Lukk</button></div></form>` : '';
  return `<span class="pp-lab p17-gl">HOME ASSISTANT</span><div class="list p17-list">${row}${ed}</div>
    ${IG.test ? `<div class="snote">${esc(IG.test)}</div>` : ''}${IG.err ? `<div class="snote" style="color:var(--pp-lab)">${esc(IG.err)}</div>` : ''}
    ${haSection || '<div class="snote">Synk med Home Assistant krever administrator og en nyere server.</div>'}`;
}
async function igBind(e, t, x) {
  const k = x?.dataset.p23;
  if (k === 'igedit') { IG.ed = !IG.ed; draw(); return true; }
  if (k === 'igx') { IG.ed = false; draw(); return true; }
  if (k === 'igtest') { IG.test = 'Tester …'; draw(); try { const r = await hlApi('/config/test/ha', { method: 'POST' }); IG.test = `${r.ok ? '✓ ' : '✕ '}${r.message ?? ''}`; } catch (err) { IG.test = err.message; } draw(); return true; }
  return false;
}
async function igSave(form) {
  const fd = new FormData(form), body = {};
  const u = String(fd.get('ha_url') ?? '').trim(), tk = String(fd.get('ha_token') ?? '').trim();
  if (u) body.ha_url = u; if (tk) body.ha_token = tk;
  if (!Object.keys(body).length) { IG.ed = false; draw(); return; }
  IG.busy = true; draw();
  try { const c = await hlApi('/config', { method: 'PUT', json: body }); IG.cfg = (c ?? []).find((g) => g.id === 'ha') ?? IG.cfg; IG.ed = false; flash('Home Assistant er lagret ✓'); const P22 = await import('./mobile-p22.js'); await P22.haLoad?.(true); }
  catch (err) { flash(err.message); }
  IG.busy = false; draw();
}

/* =====================================================================
   7. Nyhetsleser: ikoner på fanene og ikonvelger (Iconify via /api/icons)
   ===================================================================== */
const ICD = { siste: 'lucide:zap', norge: 'lucide:mountain-snow', verden: 'lucide:globe', okonomi: 'lucide:trending-up', sport: 'lucide:trophy', teknologi: 'lucide:cpu', kultur: 'lucide:drama' };
const KW = { siste: 'news', norge: 'mountain', verden: 'globe', okonomi: 'chart', sport: 'trophy', teknologi: 'chip', kultur: 'theater', helse: 'heart', politikk: 'government', vaer: 'weather', mat: 'food', reise: 'travel', bil: 'car', musikk: 'music', film: 'film', spill: 'gamepad' };
const LIBS = [['', 'Alle'], ['lucide', 'Lucide'], ['material-symbols', 'Material Symbols'], ['mdi', 'Material Design'], ['ph', 'Phosphor'], ['tabler', 'Tabler'], ['heroicons', 'Heroicons'], ['fa6-solid', 'Font Awesome'], ['ri', 'Remix'], ['fluent', 'Fluent'], ['bi', 'Bootstrap'], ['iconoir', 'Iconoir'], ['carbon', 'Carbon'], ['solar', 'Solar'], ['mingcute', 'MingCute'], ['streamline', 'Streamline'], ['noto', 'Noto emoji'], ['twemoji', 'Twemoji']];
const COLOR = ['noto', 'twemoji', 'fluent-emoji', 'logos', 'flag', 'circle-flags'];
export const IC = { n: null, q: '', lib: '', res: null, tot: 0, busy: false, err: '', ai: false, all: false, local: null };
const icUrl = (id) => `/api/icons/${id.split(':').map(encodeURIComponent).join('/')}.svg`;
const isColor = (id) => COLOR.includes(id.split(':')[0]) || /emoji/.test(id);
/** Prompt 24: ikonet som <img> (ikke CSS-maske, som nettleseren ikke tegnet før fanen ble tegnet på nytt).
 *  Fargen bakes inn i SVG-en (blekk for valgt, dempet ellers), og SVG-ene forhåndslastes. */
/** Forhåndslast standardikonene ved oppstart (og brukerens egne fra lokal kopi). */
export const icBoot = () => setTimeout(() => P24.icPreload([...Object.values(ICD), ...Object.values(IC.local?.ic ?? {})]).catch(() => {}), 1200);
export const icSpan = (id, size = 16, cls = 'p23-ic', tone = 'ink') => P24.icImg(id, size, cls, tone);
const newsSt = (P) => ({ ic: {}, icSrc: {}, icOn: true, ...(IC.local ?? {}), ...(P.news?.settings ?? {}) });
export const icOf = (P, k) => { const s = newsSt(P), d = P.news?.iconDefaults ?? ICD; return k in (s.ic ?? {}) ? s.ic[k] : d[k] ?? ''; };
/** Fanene i Nyhetsleser med ikon (brukes av newsView). */
export function newsTabs(P, cats) {
  const on = newsSt(P).icOn !== false;
  if (on) P24.icPreload(cats.map(([k]) => icOf(P, k)));
  return `<div class="pp-tabs" role="tablist">${cats.map(([k, n]) => { const id = on ? icOf(P, k) : ''; return `<button role="tab" data-pp="cat" data-k="${k}" aria-selected="${P.cat === k}" class="${id ? 'p23-tabic' : ''}">${icSpan(id, 16, 'p23-ic', P.cat === k ? 'ink' : 'mut')}${esc(n)}</button>`; }).join('')}</div>`;
}
/** Seksjonen «IKONER PÅ FANENE» i innstillingsarket. */
export function newsIconSection(P, cats) {
  const s = newsSt(P), on = s.icOn !== false;
  return `<div class="pp-row"><span class="pp-lab">IKONER PÅ FANENE</span><button class="p23-ul" data-p23="icall">${IC.all ? '✦ Velger …' : '✦ La AI velge alle'}</button></div>
    <div class="pp-card pp-tight p23-icl"><button class="pp-tog" data-p23="icon" role="switch" aria-checked="${on}"><span class="m-grow"><b>Vis ikoner</b><span class="pp-mut">Ved siden av navnet på hver fane</span></span><span class="pp-sw${on ? ' on' : ''}"><i></i></span></button>
    ${cats.map(([k, n]) => { const id = icOf(P, k), src = !(k in (s.ic ?? {})) ? 'Standard' : s.icSrc?.[k] === 'ai' ? '✦ AI' : s.ic[k] ? 'Valgt' : 'Ingen'; return `<button class="p23-icr" data-p23="icpick" data-k="${esc(k)}" data-n="${esc(n)}"><span class="p23-icb">${icSpan(id, 20)}</span><span class="m-grow"><b>${esc(n)}</b><span class="pp-mono">${esc(id || 'ingen ikon')}</span></span><span style="font-size:12px;font-weight:700;color:${src === '✦ AI' ? 'var(--pp-lab)' : 'var(--pp-mut)'}">${src}</span><span class="pp-mut">›</span></button>`; }).join('')}</div>`;
}
/** Ikonvelgeren (ark). */
export function iconPicker(P) {
  if (!IC.n) return '';
  const cur = icOf(P, IC.n.k);
  const st = IC.busy ? 'Søker i over 200 ikonbibliotek …' : IC.err ? IC.err : IC.res ? (IC.res.length ? `${IC.res.length} av ${IC.tot || IC.res.length} treff · Iconify (Lucide, Material, Phosphor, Tabler, Font Awesome …)` : 'Ingen treff. Prøv et annet engelsk ord.') : '';
  return `<div class="sheet-bg p23-ipbg" data-p23="ipx"></div><div class="pp-sheet p23-ip" role="dialog" aria-label="Ikon for ${esc(IC.n.n)}">
    <div class="p23-iph"><span></span><div style="text-align:center"><div class="pp-lab">IKON FOR</div><div class="pp-serif" style="font-size:22px">${esc(IC.n.n)}</div></div><button class="p23-x" data-p23="ipx" aria-label="Lukk">×</button></div>
    <form class="p23-ips" data-p23form="icq"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg><input id="p23-icq" name="q" value="${esc(IC.q)}" placeholder="Søk etter ikon (engelsk), f.eks. football" autocomplete="off" enterkeyhint="search"><button type="submit">Søk</button></form>
    <div class="p23-libs">${LIBS.map(([k, n]) => `<button class="p23-cat" data-p23="iclib" data-k="${k}" aria-pressed="${IC.lib === k}">${esc(n)}</button>`).join('')}</div>
    <div class="p23-row8"><button class="p23-ai" data-p23="icai">${IC.ai ? '✦ Velger …' : '✦ La AI velge'}</button><button class="pp-btn" data-p23="icnone">Ingen ikon</button></div>
    <span class="pp-mut" style="font-size:12px">${esc(st)}</span>
    <div class="p23-grid">${(IC.res ?? []).map((id) => `<button data-p23="icset" data-id="${esc(id)}" title="${esc(id)}" style="border-color:${id === cur ? 'var(--pp-lab)' : 'transparent'}">${icSpan(id, 26)}</button>`).join('')}</div></div>`;
}
async function icSearch(q, lib) {
  q = (q ?? '').trim(); if (!q) return;
  const n = (IC.seq = (IC.seq ?? 0) + 1);
  IC.busy = true; IC.err = ''; draw();
  try {
    const r = await hlApi(`/icons/search?${new URLSearchParams({ q, ...(lib ? { prefix: lib } : {}), limit: '96' })}`);
    if (n !== IC.seq) return;
    IC.res = (r?.icons ?? []).map((x) => (typeof x === 'string' ? x : x.id ?? `${x.prefix}:${x.name}`)); IC.tot = r?.total ?? IC.res.length;
  } catch (e) { if (n !== IC.seq) return; IC.res = []; IC.err = e.status === 404 ? 'Ikonsøk krever en nyere server' : 'Fikk ikke kontakt med ikonbiblioteket'; }
  IC.busy = false; draw();
}
async function saveIcons(P, patch) {
  const s = newsSt(P), next = { ic: { ...s.ic, ...(patch.ic ?? {}) }, icSrc: { ...s.icSrc, ...(patch.icSrc ?? {}) }, icOn: patch.icOn ?? s.icOn };
  IC.local = next;
  if (P.news) P.news.settings = { ...(P.news.settings ?? {}), ...next };
  draw();
  try { const r = await hlApi('/rss/settings', { method: 'PUT', json: next }); if (r && P.news) P.news.settings = { ...P.news.settings, ...r }; }
  catch (e) { flash(e.status === 400 ? 'Serveren lagret ikke ikonene ennå' : e.message); }
}
async function aiPick(P, k, n) {
  let id = null;
  try { const r = await hlApi('/icons/suggest', { method: 'POST', json: { label: n, prefix: IC.lib || 'lucide' } }); id = r?.icon ?? null; }
  catch {
    try { const r = await hlApi(`/icons/search?${new URLSearchParams({ q: KW[k] ?? n.toLowerCase(), prefix: IC.lib || 'lucide', limit: '8' })}`); const f = r?.icons?.[0]; id = f ? (typeof f === 'string' ? f : f.id ?? `${f.prefix}:${f.name}`) : null; } catch {}
  }
  id ??= ICD[k] ?? null;
  if (id) await saveIcons(P, { ic: { [k]: id }, icSrc: { [k]: 'ai' } });
  return id;
}
async function icBind(e, t, x, P) {
  const k = x.dataset.p23;
  if (k === 'icon') { await saveIcons(P, { icOn: !(newsSt(P).icOn !== false) }); return true; }
  if (k === 'icpick') { IC.n = { k: x.dataset.k, n: x.dataset.n }; IC.q = KW[x.dataset.k] ?? x.dataset.n.toLowerCase(); IC.res = null; draw(); icSearch(IC.q, IC.lib); return true; }
  if (k === 'ipx') { IC.n = null; IC.res = null; draw(); return true; }
  if (k === 'iclib') { IC.lib = x.dataset.k; const v = document.getElementById('p23-icq')?.value; if (v != null) IC.q = v; icSearch(IC.q, IC.lib); return true; }
  if (k === 'icset') { const n = IC.n; IC.n = null; IC.res = null; await saveIcons(P, { ic: { [n.k]: x.dataset.id }, icSrc: { [n.k]: 'pick' } }); return true; }
  if (k === 'icnone') { const n = IC.n; IC.n = null; IC.res = null; await saveIcons(P, { ic: { [n.k]: '' }, icSrc: { [n.k]: 'pick' } }); return true; }
  if (k === 'icai') { IC.ai = true; draw(); const n = IC.n; await aiPick(P, n.k, n.n); IC.ai = false; IC.n = null; IC.res = null; draw(); return true; }
  if (k === 'icall') {
    if (IC.all) return true;
    IC.all = true; draw();
    const cats = P.news?.categories?.length ? P.news.categories.map((c) => [c.id, c.name]) : Object.keys(ICD).map((c) => [c, c]);
    for (const [ck, cn] of cats) await aiPick(P, ck, cn);
    IC.all = false; draw(); flash('✦ AI har valgt ikoner'); return true;
  }
  return false;
}

/* =====================================================================
   Hendelser
   ===================================================================== */
let newsP = null;
export const setNewsState = (P) => { newsP = P; };
export async function bind(e, t) {
  if (e.type === 'input') {
    const i = t.closest?.('[data-p23in]'); if (!i) return false;
    const k = i.dataset.p23in, id = i.dataset.id;
    if (k === 'rcn' || k === 'rcv') { const r = (S.receipts ?? []).find((y) => y.id === id); KV.e[id] = { n: r?.merchant ?? '', v: r?.total != null ? n2(r.total) : '', cat: r?.categoryId ?? null, ...(KV.e[id] ?? {}), [k === 'rcn' ? 'n' : 'v']: i.value }; return true; }
    if (k === 'admsg') { FA.msg = i.value; return true; }
    return false;
  }
  if (e.type === 'submit') {
    const f = t.closest?.('[data-p23form]'); if (!f) return false;
    e.preventDefault();
    const k = f.dataset.p23form;
    if (k === 'admsg') { await adSend(f); return true; }
    if (k === 'igsave') { await igSave(f); return true; }
    if (k === 'icq') { IC.q = f.q.value; f.q.blur(); await icSearch(IC.q, IC.lib); return true; }
    return false;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-p23]');
  if (!x) return false;
  e.preventDefault();
  if (x.dataset.p23 === 'ato') return toBind(x);
  if (await kvBind(e, t, x)) return true;
  if (await adBind(e, t, x)) return true;
  if (await igBind(e, t, x)) return true;
  if (newsP && await icBind(e, t, x, newsP)) return true;
  return false;
}

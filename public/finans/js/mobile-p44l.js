// Prompt 44 (PWA44): Innstillinger → Homelab → Logger (claude-code-innst-logger-docker.md, fasit design/Logger.dc.html), én kolonne.
// Tall øverst, containere som piller (status + feiltall), valgt container (Start på nytt · Stopp · Start, bare admin, med
// bekreftelse for Stopp), filter (søk, nivå, tid, Live, Last ned), mørkt loggvindu, detaljer med Glimt-forklaring og
// «Feil gruppert (24 t)». API (SERVER44): /api/system/containers, /api/system/logs, /api/system/logs/stream (SSE),
// /api/system/logs/groups, POST /api/system/logs/explain, POST /api/system/containers/:id/(restart|stop|start),
// /api/system/logs/download. Hemmeligheter maskeres på serveren; vi masker i tillegg før visning (dobbel sikring).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const LV = [['all', 'Alle'], ['info', 'Info+'], ['warn', 'Advarsler'], ['error', 'Feil']];
const TM = [['15m', '15m'], ['1h', '1t'], ['24h', '24t'], ['7d', '7d']];
const L = { cts: null, sum: null, miss: false, off: null, err: '', ct: 'all', lv: 'all', tm: '1h', q: '', lines: null, lErr: '', live: false, es: null, sel: null, exp: {}, groups: null, conf: null, busy: '', t: 0 };
const MASK = [[/(token|password|passord|secret|api[_-]?key|apikey)=([^\s&"']+)/gi, '$1=••••'], [/(authorization:\s*)(bearer\s+)?\S+/gi, '$1$2••••'], [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-••••'], [/(x-api-key:\s*)\S+/gi, '$1••••']];
const mask = (s) => MASK.reduce((a, [re, r]) => a.replace(re, r), String(s ?? ''));
const arr = (r, ...k) => { if (Array.isArray(r)) return r; for (const x of k) if (Array.isArray(r?.[x])) return r[x]; return []; };
const lvOf = (l) => { const v = String(l ?? '').toLowerCase(); return /err|fatal|crit/.test(v) ? 'error' : /warn/.test(v) ? 'warn' : /debug|trace/.test(v) ? 'debug' : 'info'; };
const nLine = (x, i) => ({ id: String(x.id ?? `${x.t ?? x.time ?? x.ts ?? ''}-${i}`), t: x.t ?? x.time ?? x.ts ?? x.timestamp ?? '', lv: lvOf(x.level ?? x.lv), ct: x.ct ?? x.container ?? x.name ?? '', msg: mask(x.msg ?? x.message ?? x.line ?? x.text ?? '') });
const nCt = (c) => ({ id: String(c.id ?? c.Id ?? c.name), name: String(c.name ?? c.Names?.[0] ?? c.id ?? '').replace(/^\//, ''), image: [c.image ?? c.Image ?? '', c.tag].filter(Boolean).join(':'), st: c.color === 'yellow' || /restart/i.test(c.state ?? c.status ?? '') ? 'restart' : c.color === 'red' ? 'stop' : /run|up/i.test(c.state ?? c.status ?? '') ? 'run' : 'stop', status: c.status ?? c.Status ?? c.state ?? '', up: c.uptime ?? c.up ?? '', cpu: c.cpu ?? null, mem: c.mem ?? c.memory ?? null, restarts: c.restarts ?? c.restartCount ?? 0, errors: c.errors1h ?? c.errors ?? c.errorCount ?? 0 });
const hm = (v) => { const d = new Date(v); return isNaN(d) ? String(v ?? '').slice(11, 19) : d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
const qs = () => { const p = new URLSearchParams(); if (L.ct !== 'all') p.set('ct', (L.cts ?? []).find((c) => c.id === L.ct)?.name ?? L.ct); p.set('since', L.tm); if (L.lv !== 'all') p.set('level', L.lv); if (L.q.trim()) p.set('q', L.q.trim()); p.set('limit', '500'); return p.toString(); };

export async function logLoad(force = true) {
  if (L.busy === 'load') return; L.busy = 'load';
  try {
    const r = await hlApi('/system/containers');
    if (r && r.available === false) { L.off = r; L.cts = []; }
    else { L.off = null; L.cts = arr(r, 'items', 'containers').map(nCt); L.sum = r?.summary ?? null; }
    L.miss = false; L.err = '';
  } catch (e) { L.miss = e.status === 404; L.err = L.miss ? '' : e.status === 503 ? 'Docker-socketen er ikke tilgjengelig' : e.message; L.cts ??= []; }
  await Promise.all([linesLoad(), groupsLoad()]);
  L.busy = ''; L.t = Date.now(); if (m.screen === 'set') draw();
  void force;
}
async function linesLoad() {
  if (L.miss) return;
  try { const r = await hlApi(`/system/logs?${qs()}`); L.lines = arr(r, 'lines', 'items', 'logs').map(nLine); L.lErr = ''; }
  catch (e) { L.lines ??= []; L.lErr = e.status === 404 ? '' : e.message; }
}
async function groupsLoad() {
  if (L.miss) return;
  try { const r = await hlApi('/system/logs/groups?hours=24'); L.groups = arr(r, 'groups', 'items').map((g) => ({ n: g.count ?? g.n ?? 1, msg: mask(g.message ?? g.msg ?? g.pattern ?? ''), ct: g.ct ?? g.container ?? '', last: g.lastSeen ?? g.last ?? '', line: g.explain?.body?.line ?? g.sample ?? g.message ?? null, lv: g.level ?? 'error' })); }
  catch { L.groups ??= []; }
}
function liveSet(on) {
  L.live = on;
  try { L.es?.close(); } catch {} L.es = null;
  if (!on) return draw();
  try {
    const es = new EventSource(`/api/system/logs/stream?${qs()}&follow=1`);
    const onLine = (ev) => { try { const d = JSON.parse(ev.data); const add = (Array.isArray(d) ? d : d.lines ?? [d]).map(nLine); L.lines = [...(L.lines ?? []), ...add].slice(-500); const w = document.getElementById('p44-logw'); const atEnd = !w || w.scrollHeight - w.scrollTop - w.clientHeight < 40; if (m.screen === 'set' && m.sub === 'logger') { draw(); if (atEnd) { const w2 = document.getElementById('p44-logw'); if (w2) w2.scrollTop = w2.scrollHeight; } } } catch {} };
    es.addEventListener('line', onLine); es.onmessage = onLine;
    es.onerror = () => { if (es.readyState === 2) { L.live = false; L.es = null; flash('Live-strømmen stoppet'); draw(); } };
    L.es = es;
  } catch { L.live = false; }
  draw();
}
const dot = (st) => `<i class="p44l-dot ${st}"></i>`;
export function logView() {
  if (!L.t && L.busy !== 'load') logLoad().catch(() => {});
  if (L.miss) return '<div class="p44l-empty"><b>Logger er ikke tilgjengelig ennå</b><span>Krever en nyere Homelab-server. Oppdater serveren under Innstillinger → System.</span></div>';
  if (L.off) return `<div class="p44l-empty"><b>${esc(L.off.setup?.title ?? 'Fant ikke Docker')}</b><span>${esc(L.off.error ?? L.off.setup?.text ?? 'Homelab får ikke kontakt med Docker Engine.')}</span>${(L.off.setup?.steps ?? []).length ? `<ol class="p44l-ol">${L.off.setup.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}${L.off.setup?.compose ? `<pre class="p44l-pre">${esc(L.off.setup.compose)}</pre>` : ''}${L.off.setup?.alt ? `<span>${esc(L.off.setup.alt)}</span>` : ''}<span>Gi containeren lesetilgang til Docker, helst via <code>tecnativa/docker-socket-proxy</code> med <code>CONTAINERS=1 LOGS=1 POST=1 RESTART=1</code>, og sett <code>DOCKER_HOST=tcp://docker-proxy:2375</code>. Alternativt: monter <code>/var/run/docker.sock:ro</code>.</span><button type="button" class="p44l-btn" data-p44l="reload">Prøv igjen</button></div>`;
  if (!L.cts) return '<div class="m-spin"></div>';
  const C = L.cts, up = C.filter((c) => c.st === 'run').length, S = L.sum ?? {};
  const errH = S.errors1h ?? S.errorsHour ?? S.errors ?? (L.lines ?? []).filter((x) => x.lv === 'error').length, warn = S.warnings1h ?? S.warnings ?? S.warn ?? (L.lines ?? []).filter((x) => x.lv === 'warn').length;
  const rs = C.reduce((a, c) => a + (+c.restarts || 0), 0), worst = S.worst ?? [...C].sort((a, b) => (b.restarts || 0) - (a.restarts || 0))[0];
  const stat = (v, l, cls = '') => `<div class="p44l-stat ${cls}"><b>${esc(v)}</b><small>${esc(l)}</small></div>`;
  const sel = C.find((c) => c.id === L.ct || c.name === L.ct);
  const lines = (L.lines ?? []).filter((x) => L.lv === 'all' || (L.lv === 'info' ? x.lv !== 'debug' : L.lv === 'warn' ? x.lv === 'warn' || x.lv === 'error' : x.lv === 'error'));
  return `<div class="p44l">
    <div class="p44l-stats">${stat(`${up}/${C.length}`, 'containere oppe', up < C.length ? 'warn' : '')}${stat(String(errH), 'feil siste time', errH ? 'bad' : '')}${stat(String(warn), 'advarsler')}${stat(String(S.restarts ?? rs), (S.restarts ?? rs) && worst?.restarts ? `omstarter · ${worst.name}` : 'omstarter')}${S.disk ? stat(String(S.disk.text ?? S.disk), S.disk.path ?? '/var/lib/docker') : ''}</div>
    ${L.err ? `<div class="p44l-err">${esc(L.err)}</div>` : ''}
    <div class="p44l-pills" role="tablist"><button type="button" class="p44l-pill${L.ct === 'all' ? ' on' : ''}" data-p44l="ct" data-k="all">Alle</button>${C.map((c) => `<button type="button" class="p44l-pill${L.ct === c.id || L.ct === c.name ? ' on' : ''}" data-p44l="ct" data-k="${esc(c.id)}">${dot(c.st)}${esc(c.name)}${c.errors ? `<span class="p44l-ec">${c.errors}</span>` : ''}</button>`).join('')}</div>
    ${sel ? `<div class="p44l-ct"><div class="p44l-cth">${dot(sel.st)}<b>${esc(sel.name)}</b><span class="p44l-mono">${esc(sel.image)}</span></div>
      <span class="p44l-ctm">${esc([sel.status, sel.up ? `oppe ${sel.up}` : '', sel.cpu != null ? `CPU ${String(sel.cpu).replace(/\s*%$/, '')} %` : '', sel.mem != null ? `minne ${sel.mem}` : '', `${sel.restarts || 0} omstarter`].filter(Boolean).join(' · '))}</span>
      <div class="p44l-act"><button type="button" class="p44l-btn" data-p44l="op" data-op="restart" ${L.busy ? 'disabled' : ''}>Start på nytt</button>${sel.st === 'stop' ? `<button type="button" class="p44l-btn" data-p44l="op" data-op="start" ${L.busy ? 'disabled' : ''}>Start</button>` : `<button type="button" class="p44l-btn red" data-p44l="op" data-op="stop" ${L.busy ? 'disabled' : ''}>Stopp</button>`}<button type="button" class="p44l-btn ghost" data-p44l="insp">Inspiser</button></div>
      ${L.insp === sel.id ? `<pre class="p44l-pre">${esc(mask(JSON.stringify(L.inspD ?? { id: sel.id, image: sel.image, status: sel.status, restarts: sel.restarts }, null, 2)))}</pre>` : ''}</div>` : ''}
    <form class="p44l-q" data-p44lf="q"><span aria-hidden="true">⌕</span><input id="p44l-q" name="q" value="${esc(L.q)}" placeholder="Søk i loggene, f.eks. «timeout»" autocomplete="off" enterkeyhint="search" aria-label="Søk i loggene"></form>
    <div class="p44l-fil"><span class="p44l-seg">${LV.map(([k, n]) => `<button type="button" class="${L.lv === k ? 'on' : ''}" data-p44l="lv" data-k="${k}">${n}</button>`).join('')}</span>
      <span class="p44l-seg">${TM.map(([k, n]) => `<button type="button" class="${L.tm === k ? 'on' : ''}" data-p44l="tm" data-k="${k}">${n}</button>`).join('')}</span>
      <button type="button" class="p44l-live${L.live ? ' on' : ''}" data-p44l="live" aria-pressed="${L.live}"><i></i>Live</button><a class="p44l-dl" href="/api/system/logs/download?${esc(qs())}" download>Last ned</a></div>
    <div class="p44l-win" id="p44-logw" role="log" aria-label="Logglinjer">${L.lines == null ? '<span class="p44l-dim">Henter logger …</span>' : lines.length ? lines.map((x) => `<button type="button" class="p44l-ln ${x.lv}${L.sel === x.id ? ' sel' : ''}" data-p44l="line" data-id="${esc(x.id)}"><span class="t">${esc(hm(x.t))}</span><span class="l">${x.lv === 'error' ? 'ERROR' : x.lv === 'warn' ? 'WARN' : x.lv === 'debug' ? 'DEBUG' : 'INFO'}</span>${L.ct === 'all' ? `<span class="c">${esc(x.ct)}</span>` : ''}<span class="mg">${esc(x.msg)}</span></button>`).join('') : `<span class="p44l-dim">${esc(L.lErr || 'Ingen linjer for dette filteret.')}</span>`}</div>
    ${detail()}
    <span class="pp-lab p17-gl">FEIL GRUPPERT · 24 T</span>
    <div class="p44l-groups">${(L.groups ?? []).length ? L.groups.map((g, i) => `<div class="p44l-g"><b class="p44l-gn">×${g.n}</b><span class="m-grow"><span class="p44l-gm">${esc(g.msg)}</span><small>${esc([g.ct, g.last ? `sist ${hm(g.last)}` : ''].filter(Boolean).join(' · '))}</small></span><button type="button" class="p44l-sm" data-p44l="gexp" data-i="${i}">Forklar ›</button></div>${L.exp[`g${i}`] ? `<div class="p44l-gl">${glimt(L.exp[`g${i}`])}</div>` : ''}`).join('') : `<span class="p44l-dim2">${L.groups ? 'Ingen feil de siste 24 timene.' : 'Henter …'}</span>`}</div></div>`;
}
const glimt = (x) => (x === 'busy' ? '<span class="p44l-gb">✦ Glimt leser linjen …</span>' : `<span class="p44l-gb"><b>✦ ${esc(x.title ?? 'Glimt')}</b>${esc(x.text ?? x)}${(x.steps ?? []).length ? `<ol class="p44l-ol">${x.steps.map((y) => `<li>${esc(y)}</li>`).join('')}</ol>` : ''}${x.source ? `<small>${esc(x.source === 'pattern' ? 'Kjent mønster · uten AI' : x.source === 'none' ? 'Ukjent linje' : x.model ?? 'Glimt')}</small>` : ''}</span>`);
function detail() {
  const x = (L.lines ?? []).find((y) => y.id === L.sel); if (!x) return '';
  return `<div class="p44l-det"><div class="p44l-dh"><span class="p44l-mono">${esc(hm(x.t))} · ${esc(x.ct)} · ${x.lv.toUpperCase()}</span><button type="button" class="p44l-x" data-p44l="selx" aria-label="Lukk">✕</button></div>
    <code class="p44l-full">${esc(x.msg)}</code>
    ${L.exp[x.id] ? glimt(L.exp[x.id]) : `<button type="button" class="p44l-btn ink" data-p44l="explain">✦ Forklar med Glimt</button>`}
    <div class="p44l-act"><button type="button" class="p44l-btn ghost" data-p44l="copy">Kopier med 20 linjer rundt</button><button type="button" class="p44l-btn ghost" data-p44l="ctx">Vis i sammenheng</button></div></div>`;
}
const around = (id) => { const A = L.lines ?? [], i = A.findIndex((y) => y.id === id); return A.slice(Math.max(0, i - 20), i + 21); };
async function explain(key, line, ct) {
  L.exp[key] = 'busy'; draw();
  try { const r = await hlApi('/system/logs/explain', { method: 'POST', json: { line, ct, context: key.startsWith('g') ? [] : around(key).map((y) => `${y.t} ${y.ct} ${y.msg}`) } }); L.exp[key] = { title: r?.title ?? null, text: r?.text ?? r?.explanation ?? r?.answer ?? 'Glimt fant ingen forklaring.', steps: r?.steps ?? [], source: r?.source ?? null, model: r?.model ?? null }; }
  catch (e) { L.exp[key] = { text: e.status === 404 ? 'Krever en nyere Homelab-server.' : e.message }; }
  draw();
}
function confSheet() {
  const c = L.conf; if (!c) return '';
  return `<div class="sheet-bg" data-p44l="confx"></div><div class="pp-sheet" role="dialog" aria-modal="true" aria-label="Stopp ${esc(c.name)}"><span class="pp-grab"></span><b class="pp-sh">Stoppe ${esc(c.name)}?</b><span class="pp-mut">Tjenesten blir utilgjengelig til den startes igjen.</span>
    <div class="p44-row2"><button type="button" class="pp-btn" data-p44l="confx">Avbryt</button><button type="button" class="pp-btn ink p44l-red" data-p44l="confok">Stopp</button></div></div>`;
}
export const logLayer = () => (m.sub === 'logger' ? confSheet() : '');
async function op(c, o) {
  L.busy = o; draw();
  try { await hlApi(`/system/containers/${encodeURIComponent(c.id)}/${o}`, { method: 'POST', json: { confirm: true } }); haptic('ok'); flash(o === 'restart' ? `${c.name} starter på nytt` : o === 'stop' ? `${c.name} er stoppet` : `${c.name} er startet`); }
  catch (e) { flash(e.status === 403 ? 'Bare admin kan starte og stoppe containere' : e.status === 404 ? 'Krever en nyere Homelab-server' : e.message, 'err'); }
  L.busy = ''; await logLoad();
}
let lastSub = '';
export function logAfter() { if (m.screen !== 'set' || m.sub !== 'logger') { if (L.live) liveSet(false); lastSub = ''; return; } if (lastSub !== 'logger') { lastSub = 'logger'; const w = document.getElementById('p44-logw'); if (w) w.scrollTop = w.scrollHeight; } }
export async function logSubmit(e, f) {
  if (!f.matches?.('[data-p44lf="q"]')) return false;
  e.preventDefault(); L.q = f.q.value; await linesLoad(); draw(); return true;
}
export async function logBind(e, t) {
  const x = t.closest?.('[data-p44l]'); if (!x || m.screen !== 'set') return false;
  const a = x.dataset.p44l; if (a !== 'dl') e.preventDefault();
  const C = L.cts ?? [], sel = C.find((c) => c.id === L.ct || c.name === L.ct);
  switch (a) {
    case 'reload': await logLoad(); return true;
    case 'ct': L.ct = x.dataset.k; L.sel = null; L.insp = null; haptic('tab'); draw(); await linesLoad(); if (L.live) liveSet(true); else draw(); return true;
    case 'lv': L.lv = x.dataset.k; haptic('tab'); draw(); await linesLoad(); draw(); return true;
    case 'tm': L.tm = x.dataset.k; haptic('tab'); draw(); await linesLoad(); draw(); return true;
    case 'live': liveSet(!L.live); return true;
    case 'line': L.sel = L.sel === x.dataset.id ? null : x.dataset.id; draw(); return true;
    case 'selx': L.sel = null; draw(); return true;
    case 'explain': { const y = (L.lines ?? []).find((z) => z.id === L.sel); if (y) await explain(y.id, y.msg, y.ct); return true; }
    case 'gexp': { const g = L.groups?.[+x.dataset.i]; if (g) await explain(`g${x.dataset.i}`, g.line ?? g.msg, g.ct); return true; }
    case 'copy': { const txt = around(L.sel).map((y) => `${y.t} ${y.lv.toUpperCase()} ${y.ct} ${y.msg}`).join('\n'); try { await navigator.clipboard.writeText(txt); flash('Kopiert ✓'); } catch { flash('Fikk ikke kopiert'); } return true; }
    case 'ctx': { const y = (L.lines ?? []).find((z) => z.id === L.sel); if (y) { const c = C.find((z) => z.name === y.ct); L.ct = c?.id ?? y.ct; L.lv = 'all'; L.q = ''; await linesLoad(); draw(); } return true; }
    case 'op': if (!sel) return true; if (x.dataset.op === 'stop') { L.conf = sel; draw(); return true; } await op(sel, x.dataset.op); return true;
    case 'confx': L.conf = null; draw(); return true;
    case 'confok': { const c = L.conf; L.conf = null; if (c) await op(c, 'stop'); return true; }
    case 'insp': if (!sel) return true; if (L.insp === sel.id) { L.insp = null; draw(); return true; } L.insp = sel.id; L.inspD = null; draw(); try { L.inspD = await hlApi(`/system/containers/${encodeURIComponent(sel.id)}/inspect`); } catch {} try { const st = await hlApi(`/system/containers/${encodeURIComponent(sel.id)}`); sel.cpu = st?.cpu?.text ?? sel.cpu; sel.mem = st?.mem?.text ?? sel.mem; } catch {} draw(); return true;
    default: return false;
  }
}

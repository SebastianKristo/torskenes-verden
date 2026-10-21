// Prompt 44 (claude-code-innst-logger-docker.md): Innstillinger → Server → Logger. Fasit: design/Logger.dc.html.
// Tall øverst · containere (piller med status og feiltall) · valgt container med Start på nytt / Stopp / Inspiser (admin) ·
// filter (søk, nivå, tid, Live, Last ned) · mørkt loggvindu · detaljer med Glimt-forklaring · feil gruppert (24 t).
// API (SERVER44, tåler 404): GET /api/system/containers · GET /api/system/logs?ct=&since=&range=&level=&q=&limit= ·
// GET /api/system/logs/stream (SSE) · GET /api/system/logs/groups?hours=24 · POST /api/system/logs/explain {line, context} ·
// POST /api/system/containers/:id/(restart|stop|start) · GET /api/system/logs/download?….
// Mangler Docker-socketen (404/503 eller available:false): tomtilstand med oppsett. Hemmeligheter maskeres også her.
import { esc } from './util.js';
import { store } from './store.js';

const RANGES = [['15m', '15m', 900], ['1t', '1h', 3600], ['24t', '24h', 86400], ['7d', '7d', 604800]]; // [visning, since= til serveren, sekunder]
const LEVELS = [['alle', 'Alle', 'all'], ['info', 'Info+', 'info'], ['adv', 'Advarsler', 'warn'], ['feil', 'Feil', 'error']];
const LC = { ERROR: 'e', WARN: 'w', INFO: 'i', DEBUG: 'd' };
// Kjente mønstre (samme som serveren bør svare uten LLM). Brukes når /explain mangler.
const WHY = [
  [/connection refused/i, 'Tjenesten får ikke kontakt med en annen container.', 'Den peker på en IP eller port som ikke svarer (ofte ny IP etter omstart). Bruk tjenestenavnet i stedet for IP (f.eks. http://homelab-web:8080), og sjekk at begge er på samme Docker-nettverk.'],
  [/\b401\b|unauthori[sz]ed/i, 'Innloggingen ble avvist.', 'API-nøkkelen eller passordet er feil eller utløpt. Sjekk nøkkelen under Innstillinger → Integrasjoner.'],
  [/\b403\b|insufficientPermissions|forbidden/i, 'Tilgangen mangler rettigheter.', 'Kontoen eller tokenet mangler tilgang. Koble til på nytt og godta tilgangene som trengs.'],
  [/ETIMEDOUT|timed out|timeout/i, 'Tjenesten svarte ikke innen tidsgrensen.', 'Ofte midlertidig. Skjer det ofte, sjekk nettverket, DNS og om tjenesten er overbelastet.'],
  [/OOMKilled|out of memory|exit code 137/i, 'Containeren gikk tom for minne og ble stoppet.', 'Øk minnegrensen (mem_limit) i docker-compose, eller bruk en mindre modell / færre samtidige jobber.'],
  [/no space left on device/i, 'Disken er full.', 'Rydd i /var/lib/docker (docker system prune), gamle nedlastinger og logger, eller utvid disken.'],
  [/cold start|loaded in/i, 'Modellen ble lastet inn fra disk.', 'Normalt etter omstart. Sett OLLAMA_KEEP_ALIVE=30m for å holde den i minnet.'],
  [/checkpoint/i, 'Databasen skrev mye på én gang.', 'Ufarlig ved store importer. Øk max_wal_size hvis det skjer ofte.'],
];
const MASK = [[/(token=|password=|passwd=|apikey=|api_key=|secret=)[^\s&"']+/gi, '$1••••'], [/(Authorization:\s*)(Bearer\s+|Basic\s+)?\S+/gi, '$1$2••••'], [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-••••'], [/(X-Api-Key[:=]\s*)\S+/gi, '$1••••']];
const mask = (t) => MASK.reduce((s, [re, r]) => s.replace(re, r), String(t ?? ''));
const admin = () => store.me?.me?.role === 'admin';
const pad = (n) => String(n).padStart(2, '0');
const hms = (t) => { if (typeof t === 'string' && /^\d\d:\d\d(:\d\d)?$/.test(t)) return t.length === 5 ? `${t}:00` : t; const d = new Date(typeof t === 'number' && t < 1e12 ? t * 1000 : t); return Number.isNaN(+d) ? String(t ?? '') : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const agoTxt = (t) => { const d = new Date(typeof t === 'number' && t < 1e12 ? t * 1000 : t); if (Number.isNaN(+d)) return String(t ?? ''); const m = Math.round((Date.now() - d) / 60000); return m < 1 ? 'nå' : m < 60 ? `${m} min siden` : m < 1440 ? `${Math.round(m / 60)} t siden` : hms(t); };
const LVN = (l) => { const u = String(l ?? '').toUpperCase(); return u.startsWith('ERR') || u === 'FATAL' || u === 'CRIT' ? 'ERROR' : u.startsWith('WARN') ? 'WARN' : u.startsWith('DEB') || u === 'TRACE' ? 'DEBUG' : 'INFO'; };
const line = (x, i) => ({ id: x.id ?? `${x.t ?? x.ts ?? x.time ?? ''}|${i}`, t: x.t ?? x.ts ?? x.time ?? x.timestamp ?? '', l: LVN(x.level ?? x.lvl ?? x.l), c: String(x.ct ?? x.container ?? x.name ?? x.c ?? ''), m: mask(x.msg ?? x.message ?? x.line ?? x.m ?? '') });
const ctOut = (x) => ({ id: String(x.id ?? x.name ?? ''), n: String(x.name ?? x.n ?? x.id ?? '').replace(/^\//, ''), img: [x.image ?? x.img ?? '', x.tag && !String(x.image ?? '').includes(':') ? x.tag : ''].filter(Boolean).join(':'), st: String(x.state ?? x.st ?? x.status ?? '').toLowerCase(), up: x.uptime ?? x.up ?? x.upText ?? '', cpu: typeof x.cpu === 'object' ? x.cpu?.text ?? '' : x.cpu ?? x.cpuText ?? '', mem: typeof x.mem === 'object' ? x.mem?.text ?? '' : x.mem ?? x.memory ?? x.memText ?? '', rs: Number(x.restarts ?? x.restartCount ?? x.rs ?? 0) || 0, e: Number(x.errors1h ?? x.errors ?? x.errorCount ?? x.e ?? 0) || 0, w: Number(x.warnings1h ?? 0) || 0 });
const dotCls = (st) => (/run|up|healthy/.test(st) ? 'ok' : /restart|start|creat/.test(st) ? 'warn' : 'bad');
const stTxt = (st) => (/run|up/.test(st) ? 'Kjører' : /restart/.test(st) ? 'Starter på nytt' : /exit|stop|dead/.test(st) ? 'Stoppet' : st || 'Ukjent');

async function j(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers ?? {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Serveren svarte ${r.status}`), { status: r.status, data: d });
  return d;
}

export function mountLogger(host) {
  const S = { ct: 'alle', lv: 'alle', tr: '1t', q: '', live: true, pick: null, why: null, lines: [], cts: null, groups: [], disk: null, sum: null, stats: {}, insp: null, err: '', setup: null, busy: '', toast: '', stick: true, loading: true, stream: null, poll: 0 };
  host.innerHTML = '<div class="lg44" data-lg44></div>';
  const root = host.querySelector('[data-lg44]');
  const params = () => { const r = RANGES.find((x) => x[0] === S.tr); const lv = LEVELS.find((x) => x[0] === S.lv)?.[2] ?? 'all'; const u = new URLSearchParams({ since: r[1], level: lv, limit: '500' }); if (S.ct !== 'alle') u.set('ct', S.ct); if (S.q.trim()) u.set('q', S.q.trim()); return u; };
  const alive = () => root.isConnected;

  async function loadCts() {
    try {
      const d = await j('/api/system/containers');
      if (d && d.available === false) { S.setup = d; S.cts = []; return; }
      const list = Array.isArray(d) ? d : d?.containers ?? d?.items ?? [];
      S.cts = list.map(ctOut); S.sum = d?.summary ?? null; S.disk = d?.summary?.disk ?? d?.disk ?? null; S.setup = null;
    } catch (e) { S.cts = []; if (e.status === 404 || e.status === 503 || e.status === 501) S.setup = e.data ?? { missing: true }; else S.err = e.message; }
  }
  async function loadLines() {
    try { const d = await j(`/api/system/logs?${params()}`); S.lines = (Array.isArray(d) ? d : d?.lines ?? d?.items ?? []).map(line).slice(-500); S.err = ''; }
    catch (e) { if (e.status === 404 || e.status === 503) S.lines = []; else S.err = e.message; }
  }
  async function loadGroups() {
    try { const d = await j('/api/system/logs/groups?hours=24'); S.groups = (Array.isArray(d) ? d : d?.groups ?? []).map((g) => ({ n: g.count ?? g.n ?? 0, c: g.ct ?? g.c ?? g.container ?? '', m: mask(g.message ?? g.m ?? g.msg ?? g.pattern ?? ''), last: g.lastSeen ?? g.last ?? g.lastAt ?? '', sample: g.sample ?? g.line ?? null, explain: g.explain ?? null })); }
    catch { S.groups = groupLocal(); }
  }
  function groupLocal() {
    const G = new Map();
    for (const r of S.lines.filter((x) => x.l === 'ERROR')) { const k = `${r.c}|${r.m.replace(/\d+/g, '#')}`; const g = G.get(k) ?? { n: 0, c: r.c, m: r.m, last: r.t }; g.n++; g.last = r.t; G.set(k, g); }
    return [...G.values()].sort((a, b) => b.n - a.n);
  }
  function startLive() {
    stopLive();
    if (!S.live || S.setup) return;
    try {
      const es = new EventSource(`/api/system/logs/stream?${params()}`, { withCredentials: true });
      S.stream = es;
      let ok = false;
      const on = (ev) => { ok = true; let x; try { x = JSON.parse(ev.data); } catch { return; } const arr = (Array.isArray(x) ? x : x?.lines ?? [x]).filter((y) => y && (y.msg ?? y.message ?? y.line) != null); if (!arr.length) return; const seen = new Set(S.lines.map((r) => r.id)); S.lines = [...S.lines, ...arr.map((y, i) => line(y, S.lines.length + i)).filter((r) => !seen.has(r.id))].slice(-500); paintLog(); };
      es.addEventListener('line', on); es.onmessage = on; es.addEventListener('ping', () => { ok = true; });
      es.onerror = () => { es.close(); if (S.stream === es) S.stream = null; if (!ok && alive()) pollLive(); };
    } catch { pollLive(); }
  }
  function pollLive() { clearInterval(S.poll); S.poll = setInterval(async () => { if (!alive()) return stopLive(); if (!S.live || document.hidden) return; await loadLines(); paintLog(); }, 5000); }
  function stopLive() { S.stream?.close?.(); S.stream = null; clearInterval(S.poll); S.poll = 0; }
  async function reload() { S.loading = true; paint(); await Promise.all([loadCts(), loadLines()]); await loadGroups(); S.loading = false; paint(); startLive(); }

  const filtered = () => {
    const q = S.q.trim().toLowerCase(), lv = S.lv;
    return S.lines.filter((r) => (S.ct === 'alle' || r.c === S.ct) && (lv === 'alle' || (lv === 'feil' ? r.l === 'ERROR' : lv === 'adv' ? r.l === 'ERROR' || r.l === 'WARN' : r.l !== 'DEBUG')) && (!q || r.m.toLowerCase().includes(q) || r.c.toLowerCase().includes(q)));
  };
  const ec = (c) => { const g = S.cts?.find((x) => x.n === c); return c === 'alle' ? S.lines.filter((r) => r.l === 'ERROR').length : (g?.e || S.lines.filter((r) => r.l === 'ERROR' && r.c === c).length); };

  function statsHtml() {
    const cts = S.cts ?? [], up = cts.filter((c) => dotCls(c.st) === 'ok').length, worst = [...cts].sort((a, b) => b.rs - a.rs)[0];
    const hour = Date.now() - 3600_000, ts = (r) => { const d = new Date(typeof r.t === 'number' && r.t < 1e12 ? r.t * 1000 : r.t); return Number.isNaN(+d) ? Date.now() : +d; };
    const errH = S.sum?.errors1h ?? S.lines.filter((r) => r.l === 'ERROR' && ts(r) >= hour).length, warn = S.sum?.warnings1h ?? S.lines.filter((r) => r.l === 'WARN').length;
    const disk = S.disk ? (typeof S.disk === 'string' ? S.disk : S.disk.text ?? S.disk.pctText ?? `${S.disk.usedPct ?? S.disk.pct ?? '–'} %`) : '–';
    const rsN = S.sum?.restarts ?? worst?.rs ?? 0, wn = typeof S.sum?.worst === 'string' ? S.sum.worst : S.sum?.worst?.name ?? worst?.n;
    const X = [[`${S.sum?.up ?? up} / ${S.sum?.total ?? cts.length}`, 'containere oppe', 'ok'], [String(errH), 'feil siste time', 'bad'], [String(warn), 'advarsler', 'warn'], [String(rsN), rsN && wn ? `omstarter · ${wn}` : 'omstarter', rsN > 3 ? 'warn' : ''], [disk, `disk ${S.disk?.path ?? '/var/lib/docker'}`, '']];
    return `<div class="lg44-stats">${X.map(([v, l, c]) => `<div class="lg44-stat"><b class="${c}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  }
  function ctsHtml() {
    const cts = S.cts ?? [];
    const pill = (k, n, st, e) => `<button type="button" class="lg44-ct${S.ct === k ? ' on' : ''}" data-lg-ct="${esc(k)}" aria-pressed="${S.ct === k}"><span class="lg44-dot ${k === 'alle' ? 'all' : dotCls(st)}"></span>${esc(n)}${e > 0 ? `<i>${e}</i>` : ''}</button>`;
    const sc = cts.find((c) => c.n === S.ct);
    const acts = admin() && sc ? `<div class="lg44-acts">${/run|up|restart/.test(sc.st) ? `<button type="button" class="lg44-b" data-lg-act="restart">Start på nytt</button><button type="button" class="lg44-b bad" data-lg-act="stop">Stopp</button>` : '<button type="button" class="lg44-b" data-lg-act="start">Start</button>'}<button type="button" class="lg44-b" data-lg-act="inspect">Inspiser</button></div>` : '';
    return `<section class="lg44-sec"><span class="lg44-cap">CONTAINERE · ${cts.length}</span><div class="lg44-cts">${pill('alle', 'Alle', 'up', ec('alle'))}${cts.map((c) => pill(c.n, c.n, c.st, c.e)).join('')}</div></section>
      ${sc && !S.stats[sc.id] ? (loadStats(sc), '') : ''}${sc ? `<div class="lg44-sel"><span class="lg44-dot big ${dotCls(sc.st)}"></span><div class="lg44-selt"><b>${esc(sc.n)} <span class="mono">${esc(sc.img)}</span></b><span>${esc([stTxt(sc.st), sc.up && `oppe ${sc.up}`, (S.stats[sc.id]?.cpu || sc.cpu) && `CPU ${S.stats[sc.id]?.cpu || sc.cpu}`, (S.stats[sc.id]?.mem || sc.mem) && `minne ${S.stats[sc.id]?.mem || sc.mem}`, `omstarter ${sc.rs}`].filter(Boolean).join(' · '))}</span></div>${acts}</div>` : ''}`;
  }
  function loadStats(sc) {
    S.stats[sc.id] = { busy: true };
    j(`/api/system/containers/${encodeURIComponent(sc.id || sc.n)}`).then((d) => { S.stats[sc.id] = { cpu: d?.cpu?.text ?? '', mem: d?.mem?.text ?? '' }; paint(); }).catch(() => { S.stats[sc.id] = {}; });
  }
  function inspHtml() {
    const x = S.insp; if (!x) return '';
    return `<div class="lg44-pick"><div class="lg44-ph"><span class="lg44-cap acc">INSPISER · ${esc(x.name ?? '')}</span><button type="button" class="lg44-x" data-lg-insx aria-label="Lukk">✕</button></div><code class="lg44-full">${esc(mask(JSON.stringify(x, null, 2)))}</code><div class="lg44-pb"><button type="button" class="lg44-b" data-lg-inscopy>Kopier</button></div></div>`;
  }
  function filterHtml() {
    return `<div class="lg44-fil"><label class="lg44-q"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4"/></svg><input name="lgq" value="${esc(S.q)}" placeholder="Søk i loggen, f.eks. timeout eller 502" autocomplete="off" spellcheck="false" aria-label="Søk i loggen" data-glimt="off"></label>
      <div class="lg44-seg" role="group" aria-label="Nivå">${LEVELS.map(([k, n]) => `<button type="button" data-lg-lv="${k}" aria-pressed="${S.lv === k}">${n}</button>`).join('')}</div>
      <div class="lg44-seg mono" role="group" aria-label="Tid">${RANGES.map(([k]) => `<button type="button" data-lg-tr="${k}" aria-pressed="${S.tr === k}">${k}</button>`).join('')}</div>
      <button type="button" class="lg44-live${S.live ? ' on' : ''}" data-lg-live aria-pressed="${S.live}"><span></span>${S.live ? 'Live' : 'Pauset'}</button>
      <a class="lg44-dl" href="/api/system/logs/download?${esc(params().toString())}" download="${esc(`${S.ct === 'alle' ? 'alle' : S.ct}-${S.tr}.log`)}" data-lg-dl>Last ned</a></div>`;
  }
  const rowHtml = (r) => `<button type="button" class="lg44-r ${LC[r.l]}${S.pick?.id === r.id ? ' pk' : ''}" data-lg-line="${esc(r.id)}"><span class="t">${esc(hms(r.t))}</span><b class="l">${r.l}</b><span class="c">${esc(r.c)}</span><span class="m">${esc(r.m)}</span></button>`;
  function logHtml() {
    const L = filtered();
    return `<div class="lg44-box" data-lg-box role="log" aria-live="off">${S.loading && !S.lines.length ? '<span class="lg44-none">Henter loggen …</span>' : L.length ? L.map(rowHtml).join('') : '<span class="lg44-none">Ingen linjer med dette filteret.</span>'}</div>`;
  }
  function pickHtml() {
    const p = S.pick;
    if (!p) return '';
    const w = S.why;
    return `<div class="lg44-pick" role="region" aria-label="Detaljer for linjen"><div class="lg44-ph"><span class="lg44-cap acc">${esc(p.l)} · ${esc(p.c)} · ${esc(hms(p.t))}</span><button type="button" class="lg44-x" data-lg-unpick aria-label="Lukk">✕</button></div>
      <code class="lg44-full">${esc(p.m)}</code>
      <div class="lg44-why"><span class="lg44-orb" aria-hidden="true"><span>✦</span></span><div><b>Glimt: ${esc(w ? w.why : 'leser linjen …')}</b><span>${esc(w?.fix ?? '')}</span></div></div>
      <div class="lg44-pb"><button type="button" class="lg44-b pri" data-lg-copy>Kopier med 20 linjer rundt</button><button type="button" class="lg44-b" data-lg-ctx>Vis i sammenheng</button></div></div>`;
  }
  function groupsHtml() {
    const G = S.groups.length ? S.groups : groupLocal();
    return `<section class="lg44-sec"><span class="lg44-cap acc">FEIL GRUPPERT · SISTE 24 TIMER</span>${G.length ? G.slice(0, 20).map((g, i) => `<button type="button" class="lg44-g" data-lg-grp="${i}"><b>×${esc(g.n)}</b><div><span class="mono">${esc(g.m)}</span><span>${esc(g.c)} · sist ${esc(agoTxt(g.last))}</span></div><em>Forklar ›</em></button>`).join('') : '<span class="lg44-mut">Ingen feil de siste 24 timene.</span>'}</section>`;
  }
  function setupHtml() {
    return `<div class="lg44-empty"><b>Docker-loggene er ikke koblet til</b><span>Homelab trenger lesetilgang til Docker Engine for å vise containere og logger. Legg til en socket-proxy i <span class="mono">docker-compose.yml</span> (anbefalt) og start på nytt:</span>
      <pre class="mono">docker-proxy:
  image: tecnativa/docker-socket-proxy
  environment: { CONTAINERS: 1, LOGS: 1, INFO: 1, POST: 1, RESTART: 1 }
  volumes: [ "/var/run/docker.sock:/var/run/docker.sock:ro" ]
# og i homelab: DOCKER_HOST=tcp://docker-proxy:2375</pre>
      <span class="lg44-mut">Eller monter <span class="mono">/var/run/docker.sock:/var/run/docker.sock:ro</span> direkte. Bare admin ser loggene, og hemmeligheter maskeres.</span>
      <button type="button" class="lg44-b" data-lg-retry>Prøv igjen</button></div>`;
  }
  function paint() {
    if (!alive()) return stopLive();
    if (!admin()) { root.innerHTML = '<div class="lg44-empty"><b>Bare for administrator</b><span>Loggene er serverinfrastruktur og vises bare for admin.</span></div>'; return; }
    if (S.setup) { root.innerHTML = statsHtml() + setupHtml(); return; }
    const keepQ = document.activeElement?.name === 'lgq' && root.contains(document.activeElement) ? document.activeElement : null;
    const box = root.querySelector('[data-lg-box]'), st = box ? box.scrollTop : 0;
    root.innerHTML = `${statsHtml()}${ctsHtml()}${filterHtml()}${inspHtml()}${logHtml()}${pickHtml()}${S.err ? `<span class="lg44-err" role="alert">${esc(S.err)}</span>` : ''}${groupsHtml()}${S.toast ? `<div class="lg44-toast" role="status">${esc(S.toast)}</div>` : ''}`;
    if (keepQ) { const n = root.querySelector('[name="lgq"]'); n.replaceWith(keepQ); keepQ.focus({ preventScroll: true }); }
    const nb = root.querySelector('[data-lg-box]');
    if (nb) { nb.scrollTop = S.stick ? nb.scrollHeight : st; nb.addEventListener('scroll', () => { S.stick = nb.scrollTop + nb.clientHeight >= nb.scrollHeight - 8; }, { passive: true }); }
  }
  function paintLog() {
    const box = root.querySelector('[data-lg-box]');
    if (!box) return paint();
    const L = filtered();
    box.innerHTML = L.length ? L.map(rowHtml).join('') : '<span class="lg44-none">Ingen linjer med dette filteret.</span>';
    if (S.stick && S.live) box.scrollTop = box.scrollHeight;
  }
  function toast(t) { S.toast = t; paint(); clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = ''; if (alive()) paint(); }, 2400); }
  async function explain(p) {
    S.pick = p; S.why = null; paint();
    const L = S.lines, i = L.findIndex((x) => x.id === p.id), ctx = L.slice(Math.max(0, i - 20), i + 21).map((x) => `${hms(x.t)} ${x.l} ${x.c} ${x.m}`);
    let w = null;
    try { const d = await j('/api/system/logs/explain', { method: 'POST', body: JSON.stringify({ line: `${p.l} ${p.c} ${p.m}`, context: ctx, ct: p.c }) }); if (d && d.source !== 'none' && (d.title || d.text)) w = { why: d.title ?? d.why ?? 'Forklaring', fix: [d.text ?? d.fix ?? '', ...(Array.isArray(d.steps) ? d.steps.map((x, i) => `${i + 1}. ${typeof x === 'string' ? x : x.text ?? ''}`) : [])].filter(Boolean).join(' ') }; }
    catch { /* lokal reserve */ }
    if (!w) { const k = WHY.find(([re]) => re.test(p.m)); w = k ? { why: k[1], fix: k[2] } : { why: 'Ingen kjent årsak ennå.', fix: 'Kopier linjen med sammenheng og spør Glimt i Chat.' }; }
    if (S.pick?.id === p.id) { S.why = w; paint(); }
  }
  async function act(a) {
    const sc = S.cts?.find((c) => c.n === S.ct);
    if (!sc) return;
    if (a === 'inspect') { try { S.insp = await j(`/api/system/containers/${encodeURIComponent(sc.id || sc.n)}/inspect`); paint(); } catch (e) { try { await navigator.clipboard.writeText(`docker inspect ${sc.n}`); } catch { /* */ } toast(e.status === 404 ? `docker inspect ${sc.n} kopiert` : e.message); } return; }
    const verb = { restart: 'Starte', stop: 'Stoppe', start: 'Starte' }[a];
    if (!confirm(`${verb} ${sc.n}${a === 'restart' ? ' på nytt' : ''}?${a === 'stop' ? '\nTjenesten er nede til du starter den igjen.' : ''}`)) return;
    toast(`${a === 'stop' ? 'Stopper' : a === 'start' ? 'Starter' : 'Starter på nytt'} ${sc.n} …`);
    try { const r = await j(`/api/system/containers/${encodeURIComponent(sc.id || sc.n)}/${a}`, { method: 'POST', body: JSON.stringify({ confirm: true }) }); if (r?.message) toast(r.message); setTimeout(async () => { await loadCts(); paint(); }, 1500); }
    catch (e) { toast(e.status === 404 ? 'Serveren har ikke denne handlingen ennå' : e.message); }
  }
  let qT = 0;
  root.addEventListener('input', (e) => { if (e.target.name !== 'lgq') return; S.q = e.target.value; clearTimeout(qT); paintLog(); qT = setTimeout(async () => { await loadLines(); paintLog(); startLive(); }, 450); });
  root.addEventListener('click', async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if ((x = d('[data-lg-ct]'))) { S.ct = x.dataset.lgCt; S.pick = null; S.stick = true; paint(); await loadLines(); paint(); startLive(); return; }
    if ((x = d('[data-lg-lv]'))) { S.lv = x.dataset.lgLv; paint(); await loadLines(); paint(); startLive(); return; }
    if ((x = d('[data-lg-tr]'))) { S.tr = x.dataset.lgTr; paint(); await loadLines(); paint(); startLive(); return; }
    if (d('[data-lg-live]')) { S.live = !S.live; S.stick = S.live; paint(); if (S.live) startLive(); else stopLive(); return; }
    if ((x = d('[data-lg-line]'))) { const p = S.lines.find((r) => r.id === x.dataset.lgLine); if (p) explain(p); return; }
    if ((x = d('[data-lg-grp]'))) { const G = S.groups.length ? S.groups : groupLocal(); const g = G[+x.dataset.lgGrp]; if (!g) return; const p = S.lines.find((r) => r.l === 'ERROR' && r.c === g.c && (r.m === g.m || r.m.replace(/\d+/g, '#') === g.m.replace(/\d+/g, '#'))) ?? { id: `g${x.dataset.lgGrp}`, t: g.last, l: 'ERROR', c: g.c, m: g.sample ?? g.m }; if (g.explain && (g.explain.title || g.explain.text)) { S.pick = p; S.why = { why: g.explain.title ?? 'Forklaring', fix: g.explain.text ?? '' }; paint(); } else explain(p); root.querySelector('.lg44-pick')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if (d('[data-lg-unpick]')) { S.pick = null; S.why = null; paint(); return; }
    if (d('[data-lg-ctx]')) { if (S.pick) { S.ct = S.pick.c || 'alle'; S.lv = 'alle'; S.q = ''; S.stick = false; paint(); await loadLines(); paint(); root.querySelector('.lg44-r.pk')?.scrollIntoView({ block: 'center' }); startLive(); } return; }
    if (d('[data-lg-copy]')) { const L = S.lines, i = L.findIndex((r) => r.id === S.pick?.id); const txt = L.slice(Math.max(0, i - 20), i + 21).map((r) => `${hms(r.t)} ${r.l} ${r.c} ${r.m}`).join('\n') || `${S.pick?.l} ${S.pick?.c} ${S.pick?.m}`; try { await navigator.clipboard.writeText(txt); } catch { /* */ } toast('Kopiert med 20 linjer rundt'); return; }
    if ((x = d('[data-lg-act]'))) { act(x.dataset.lgAct); return; }
    if (d('[data-lg-retry]')) { reload(); return; }
    if (d('[data-lg-insx]')) { S.insp = null; paint(); return; }
    if (d('[data-lg-inscopy]')) { try { await navigator.clipboard.writeText(mask(JSON.stringify(S.insp, null, 2))); } catch { /* */ } toast('Kopiert'); return; }
    if ((x = d('[data-lg-dl]'))) { x.href = `/api/system/logs/download?${params()}`; }
  });
  reload();
  const ctT = setInterval(async () => { if (!alive()) { clearInterval(ctT); stopLive(); return; } if (document.hidden || S.setup) return; await loadCts(); if (!root.querySelector('.lg44-q input:focus')) { const box = root.querySelector('[data-lg-box]'); if (box && !S.pick) { const cur = root.querySelector('.lg44-cts'); const tmp = document.createElement('div'); tmp.innerHTML = ctsHtml(); const nc = tmp.querySelector('.lg44-cts'); if (cur && nc) cur.replaceWith(nc); } } }, 30_000);
  return { stop: stopLive };
}

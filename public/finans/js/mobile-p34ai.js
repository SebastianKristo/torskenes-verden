// Prompt 34 (PWA): AI-kontroll i fullskjerm (claude-code-ai-kontroll.md + claude-code-glimt-virker-ikke.md),
// fasit AI Kontroll.dc.html variant="mobile". Åpnes fra Innstillinger → APP → AI og modeller (#/aictl), fra Chat
// (Modeller → #/aictl/mod, Samtaleinnstillinger → Full AI-kontroll › → #/aictl/rt) og fra Finans (#/aictl/fin = scope finans).
// Faner: Oversikt · Modeller · Valg · Jobber · Forbruk · API og nøkler (finans: AI-valg · Tilkoblinger · Jobber · Forbruk).
// API: /api/ai/* (SERVER34, se server/ai-api.js). Alle ser status; bare admin endrer modeller, nøkler, serverruting og budsjett.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

export const AC = {
  tab: null, fin: false, from: 'set', st: null, md: null, lib: null, rt: null, jobs: null, use: null, keys: null, toks: null,
  err: {}, miss: false, q: '', cat: 'alle', per: '30', eye: {}, test: {}, kf: {}, fresh: null, sel: null, pulls: {}, mdel: null, t: {}, busy: {},
};
const TABS = [['ov', 'Oversikt'], ['mod', 'Modeller'], ['rt', 'Valg'], ['job', 'Jobber'], ['use', 'Forbruk'], ['api', 'API og nøkler']];
const TABS_FIN = [['rt', 'AI-valg'], ['api', 'Tilkoblinger'], ['job', 'Jobber'], ['use', 'Forbruk']];
const tabs = () => (AC.fin ? TABS_FIN : TABS);
const admin = () => AC.rt?.admin ?? (m.me?.role ? m.me.role === 'admin' : false);
const nb = (n) => Math.round(+n || 0).toLocaleString('nb-NO');
const kr = (n) => `${(+n || 0).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
const tk = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(Math.round(n || 0)));
const gb = (v) => (v == null ? '–' : `${(+v).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} GB`);
const sec = (ms) => (ms == null ? '' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
const tg = (on) => `<span class="p34-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const lab = (t, r = '') => `<span class="p34a-lab"><span>${t}</span>${r ? `<span>${r}</span>` : ''}</span>`;
const SV = (d, s = 17) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const STC = { ok: 'var(--pp-pos)', degraded: 'var(--pp-warn)', warn: 'var(--pp-warn)', off: 'var(--pp-line)' };
const missMsg = 'Serveren har ikke AI-kontroll ennå. Oppdater Homelab (Nordlys OS) for å styre modeller, ruting og nøkler herfra.';

/* ---------- Lasting ---------- */
async function get(key, path, force = false, ttl = 15000) {
  if (!force && AC[key] && Date.now() - (AC.t[key] ?? 0) < ttl) return AC[key];
  try { AC[key] = await hlApi(path); AC.t[key] = Date.now(); delete AC.err[key]; AC.miss = false; }
  catch (e) { if (e.status === 404) AC.miss = true; AC.err[key] = e.status === 404 ? missMsg : e.message; }
  return AC[key];
}
const NEED = { ov: ['st', 'md', 'use30', 'jobs'], mod: ['md', 'lib', 'rt'], rt: ['rt'], job: ['jobs'], use: ['use'], api: ['keys', 'toks', 'st'] };
export async function aiLoad(force = false) {
  const t = curTab(), P = [];
  for (const k of NEED[t] ?? []) {
    if (k === 'st') P.push(get('st', '/ai/status', force, 60000));
    if (k === 'md') P.push(get('md', '/ai/models', force));
    if (k === 'lib') P.push(get('lib', `/ai/library?q=${encodeURIComponent(AC.q.trim())}&cat=${AC.cat === 'alle' ? '' : AC.cat}`, force, 60000));
    if (k === 'rt') { P.push(get('rt', '/ai/routing', force)); if (AC.fin) P.push(get('rtf', '/ai/routing?scope=finans', force)); } // prompt 38: 4 Finans-rader
    if (k === 'jobs') P.push(get('jobs', `/ai/jobs?limit=40${AC.fin ? '&fin=1' : ''}`, force, 2500));
    if (k === 'use') P.push(get('use', `/ai/usage?days=${AC.per}`, force));
    if (k === 'use30') P.push(get('use30', '/ai/usage?days=30', force, 60000));
    if (k === 'keys') P.push(get('keys', '/ai/keys', force));
    if (k === 'toks') P.push(get('toks', '/ai/tokens', force));
  }
  if (!AC.rt && t !== 'rt') P.push(get('rt', '/ai/routing', false)); // admin-flagget og modellene til nedtrekkslistene
  await Promise.all(P);
  pollJobs();
}
let pollT = null;
function pollJobs() {
  clearTimeout(pollT);
  const J = AC.jobs, run = (J?.running?.length ?? 0) + (J?.queued?.length ?? 0), pulls = (AC.md?.pulls ?? []).some((p) => !p.done);
  if (m.screen !== 'aictl' || (!run && !pulls)) return;
  pollT = setTimeout(async () => { if (m.screen !== 'aictl') return; await get('jobs', `/ai/jobs?limit=40${AC.fin ? '&fin=1' : ''}`, true); if (pulls && !Object.keys(AC.pulls).length) await get('md', '/ai/models', true); draw(); pollJobs(); }, 2000);
}
const curTab = () => { const ok = tabs().map(([k]) => k); return ok.includes(AC.tab) ? AC.tab : AC.fin ? 'rt' : 'ov'; };
/** Ruten #/aictl[/fin][/<fane>] */
export function aiEnter(prev, sub = '') {
  if (prev && prev !== 'aictl') AC.from = prev;
  const p = String(sub ?? '').split('/').filter(Boolean);
  AC.fin = p[0] === 'fin';
  AC.tab = (AC.fin ? p[1] : p[0]) || null;
  AC.sel = null; AC.mdel = null;
}
export function aiSub(sub) { const p = String(sub ?? '').split('/').filter(Boolean); AC.fin = p[0] === 'fin'; AC.tab = (AC.fin ? p[1] : p[0]) || null; }
export function aiLeave() { clearTimeout(pollT); for (const x of Object.values(AC.pulls)) x.ctrl?.abort(); }

/* ---------- SSE (POST) ---------- */
async function sse(path, body, onEv, signal) {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(body ?? {}), signal });
  if (!res.ok) { let j = null; try { j = await res.json(); } catch {} throw Object.assign(new Error(j?.error || `Serveren svarte ${res.status}`), { status: res.status }); }
  if (!/event-stream/.test(res.headers.get('content-type') ?? '')) { const j = await res.json().catch(() => ({})); onEv('json', j); return; }
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const blk = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = 'message', data = '';
      for (const ln of blk.split('\n')) { if (ln.startsWith('event:')) ev = ln.slice(6).trim(); else if (ln.startsWith('data:')) data += ln.slice(5).trim(); }
      let d = null; try { d = JSON.parse(data); } catch { d = data; }
      onEv(ev, d);
    }
  }
}

/* ---------- Visning ---------- */
const jobsOf = () => { const J = AC.jobs ?? {}; return { run: J.running ?? [], q: J.queued ?? [], rec: J.recent ?? [], paused: !!J.paused }; };
function head() {
  const md = AC.md, loc = md?.installed?.length ?? 0, sky = (md?.cloud ?? []).filter((c) => c.on).length, J = jobsOf(), n = J.run.length;
  const line = `${AC.fin ? 'Kvitteringer, kategorier og spørsmål' : md ? `${loc} lokale modeller · ${sky} i skyen` : 'Modeller, jobber, forbruk og nøkler'} · ${n ? `${n} jobb${n > 1 ? 'er' : ''} kjører` : 'ingen jobber kjører'}`;
  const bad = J.run.length + J.rec.filter((x) => x.status === 'fail').length;
  return `<div class="p34a-hd"><span class="m-grow"><span class="p34a-k">${AC.fin ? 'FINANSHUB · KUNSTIG INTELLIGENS' : 'GLIMT · AI-KONTROLL'}</span><b class="p34a-t">${AC.fin ? 'AI i Finans' : 'AI'}</b><span class="p34a-s">${esc(line)}</span></span>
    <button type="button" class="p34-done" data-ai="close" data-p34back>Ferdig</button></div>
    <nav class="p34a-tabs" aria-label="Faner i AI-kontroll">${tabs().map(([k, nm]) => { const b = k === 'job' ? bad : 0; return `<button type="button" data-ai="tab" data-k="${k}" aria-pressed="${curTab() === k}"${curTab() === k ? ' aria-current="page"' : ''}>${esc(nm)}${b ? `<i>${b}</i>` : ''}</button>`; }).join('')}</nav>`;
}
export function aiView() {
  const t = curTab();
  const body = { ov, mod, rt, job, use, api }[t]();
  const err = Object.entries(AC.err).filter(([k]) => (NEED[t] ?? []).includes(k)).map(([, v]) => v);
  return `<div class="p34a" data-tab="${t}">${head()}<div class="p34a-body">${err.length ? `<div class="p34a-err">${esc([...new Set(err)].join(' · '))}</div>` : ''}${body}</div></div>`;
}

// Oversikt
function ov() {
  const st = AC.st, md = AC.md, J = jobsOf(), U = AC.use30, srv = st?.server ?? {}, g = srv.gpu ?? md?.gpu ?? {};
  const S0 = AC.sel, loaded = (md?.installed ?? []).filter((x) => x.loaded);
  const sRows = S0 ? (S0.order ?? []).map((k) => { const r = S0.res[k]; const busy = !r && !S0.done; return `<div class="p34a-str"><span class="p34a-ring${r ? (r.ok ? ' ok' : ' bad') : busy ? ' spin' : ''}">${r ? (r.ok ? '✓' : '!') : ''}</span><span class="m-grow"><b>${esc(r?.name ?? k)}</b><span${r && !r.ok ? ' class="bad"' : ''}>${esc(r ? (r.ok ? `${r.model ?? ''} svarte «ok» på ${sec(r.ms)}${r.warning ? ` · ${r.warning}` : ''}` : r.error || 'Feilet') : busy ? 'Sender testprompt …' : 'Venter')}</span></span>${r && !r.ok && r.fix ? `<button type="button" class="p34-ghost sm" data-ai="tab" data-k="${r.fix === 'api' ? 'api' : 'rt'}">${r.fix === 'api' ? 'Legg inn' : 'Bytt modell'}</button>` : ''}</div>`; }).join('') : '';
  const bad = S0?.done ? S0.failed ?? Object.values(S0.res).filter((x) => !x.ok).length : 0;
  const sh = S0?.done ? (bad ? `${bad} av ${S0.total ?? Object.keys(S0.res).length} AI-funksjoner virker ikke` : `Alt virker · ${S0.total ?? Object.keys(S0.res).length} av ${S0.total ?? Object.keys(S0.res).length} svarte`) : S0 ? 'Tester AI-funksjoner …' : 'Selvtest';
  const kpi = [['KJØRER NÅ', String(J.run.length), `${J.q.length} i kø${J.rec.some((x) => x.status === 'fail') ? ` · ${J.rec.filter((x) => x.status === 'fail').length} feilet` : ''}`, 'job'],
    ['LASTET I VRAM', String(loaded.length), loaded.map((x) => x.id.split(':')[0]).join(', ') || 'ingen', 'mod'],
    ['TOKENS 30 D', U ? tk((U.totals?.tokIn ?? 0) + (U.totals?.tokOut ?? 0)) : '–', U?.totals?.localShare != null ? `${U.totals.localShare} % lokalt, gratis` : 'ingen bruk ennå', 'use'],
    ['SKY-KOSTNAD', U ? kr(U.totals?.costKr) : '–', U?.budget?.monthlyKr ? `av ${nb(U.budget.monthlyKr)} kr budsjett` : 'ingen grense', 'use']];
  const vt = g.vramGb ?? 8, vu = srv.vramUsedGb ?? loaded.reduce((a, x) => a + (x.vramGb ?? x.sizeGb ?? 0), 0), disk = srv.diskGb ?? (md?.installed ?? []).reduce((a, x) => a + (x.sizeGb ?? 0), 0), B = st?.budget ?? U?.budget ?? {};
  // Prompt 38: maskinen hentes fra Ollama-verten (server.hw): Mac mini M4 · 16 GB samlet minne · 2 TB ekstern disk.
  const hw = srv.hw ?? null, gpuB = hw?.gpuBudgetGb ?? null, dk = hw?.disk ?? null, dTot = dk?.totalGb ?? null, dUsed = dk && dk.totalGb != null && dk.freeGb != null ? dk.totalGb - dk.freeGb : disk;
  const bars = [hw && gpuB ? ['Minne til modeller (GPU)', `${gb(vu).replace(' GB', '')} / ${String(gpuB).replace('.', ',')} GB`, Math.min(100, (vu / Math.max(1, gpuB)) * 100), vu > 9.5 ? 'var(--pp-warn)' : 'var(--pp-pos)'] : ['VRAM i bruk', `${gb(vu).replace(' GB', '')} / ${nb(vt)} GB`, Math.min(100, (vu / Math.max(1, vt)) * 100), vu > vt * 0.9 ? 'var(--pp-warn)' : 'var(--pp-pos)'],
    hw && dTot ? [`Modeller på ${dk.external === false ? 'disk' : 'ekstern disk'}`, `${nb(Math.round(dUsed))} / ${nb(dTot)} GB`, Math.min(100, (dUsed / Math.max(1, dTot)) * 100), 'var(--pp-ink)'] : ['Modeller på disk', gb(disk), Math.min(100, (disk / 500) * 100), 'var(--pp-ink)'],
    ['Sky-budsjett denne måneden', B.monthlyKr ? `${kr(B.monthCostKr)} / ${nb(B.monthlyKr)} kr` : `${kr(B.monthCostKr)} · ingen grense`, B.monthlyKr ? Math.min(100, (B.monthCostKr / B.monthlyKr) * 100) : 0, 'var(--pp-lab)']];
  const prov = (st?.providers ?? []).map((p, i) => `<button type="button" class="p34a-prow" data-ai="tab" data-k="api" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p34a-dot" style="background:${STC[p.state] ?? STC.off}"></span><span class="m-grow"><b>${esc(p.name)}</b><span>${esc([p.label, p.model, p.keyTail ? `nøkkel ••${p.keyTail}` : '', p.state !== 'ok' && p.error ? p.error : ''].filter(Boolean).join(' · '))}</span></span><span class="p34a-mono">${p.ms != null ? esc(sec(p.ms)) : '–'}</span></button>`).join('');
  const routes = (st?.routes ?? []).map((r, i) => `<div class="p34a-prow" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p34a-dot" style="background:${STC[r.state] ?? STC.off}"></span><span class="m-grow"><b>${esc(r.name)}</b><span${r.state !== 'ok' ? ' class="bad"' : ''}>${esc([r.model, r.label, r.state !== 'ok' ? r.error : '', r.warning].filter(Boolean).join(' · '))}</span></span><span class="p34a-mono">${r.ms != null ? esc(sec(r.ms)) : ''}</span></div>`).join('');
  return `<div class="p34a-card${bad ? ' bad' : ''}" data-hl="selftest"><div class="p34a-row"><span class="m-grow"><b>${esc(sh)}</b><span>Sender en liten prompt gjennom hver funksjon (chat, AI-søk, Glimt, kvitteringer …) og sjekker at modellen faktisk svarer, ikke bare at serveren kan nås.</span></span><button type="button" class="p34-ink" data-ai="selftest" ${S0 && !S0.done ? 'disabled' : ''}>${S0 && !S0.done ? 'Tester …' : 'Kjør selvtest'}</button></div>${sRows ? `<div class="p34a-sts">${sRows}</div>` : ''}</div>
    <div class="p34a-kpi">${kpi.map(([l, v, s, k]) => `<button type="button" data-ai="tab" data-k="${k}"><span class="p34a-k2">${l}</span><b>${esc(v)}</b><span>${esc(s)}</span></button>`).join('')}</div>
    <div class="p34a-card"><span class="p34a-row2"><b>${hw ? esc(hw.model ?? 'AI-maskin') : 'Hjemmeserver'}</b><span class="p34a-mono">${esc(hw ? [hw.memGb ? `${hw.memGb} GB samlet minne` : '', dTot ? `${dTot >= 1000 ? `${String(Math.round(dTot / 100) / 10).replace('.', ',')} TB` : `${dTot} GB`}${dk?.external === false ? ' disk' : ' ekstern disk'}` : ''].filter(Boolean).join(' · ') : [g.name, g.vramGb ? `${g.vramGb} GB` : ''].filter(Boolean).join(' · ') || '–')}</span></span>
      ${hw && dk && dk.mounted === false ? '<span class="p34a-warn bad">Ekstern disk mangler · Ollama finner ikke modellene</span>' : ''}
      ${bars.map(([l, v, w, c]) => `<div class="p34a-bar"><span><span>${esc(l)}</span><b>${esc(v)}</b></span><span class="p34a-bt"><i style="width:${w}%;background:${c}"></i></span></div>`).join('')}
      ${hw && gpuB ? `<span class="p34a-s">Apple Silicon gir GPU-en ca. ⅔ av minnet (${String(gpuB).replace('.', ',')} GB). Resten trengs til macOS og serveren. Første kall etter at en modell er lastet ut kan ta opptil 60 s («Laster modellen fra disk …»).</span>` : ''}</div>
    ${Array.isArray(st?.server?.recommend ?? st?.recommend) && (st.server?.recommend ?? st.recommend).length ? `${lab('ANBEFALT FOR DENNE MASKINEN')}<div class="p34a-list">${(st.server?.recommend ?? st.recommend).map((r, i) => `<div class="p34a-prow" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="m-grow"><b>${esc(r.text ?? r.key ?? '')}</b>${r.env ? `<span class="p34a-mono">${esc(r.env)}</span>` : ''}</span></div>`).join('')}</div>` : ''}
    ${prov ? `${lab('LEVERANDØRER')}<div class="p34a-list">${prov}</div>` : ''}
    ${routes ? `${lab('RUTER', st?.cached ? 'sjekket for under 5 min siden' : 'sjekket nå')}<div class="p34a-list">${routes}</div><button type="button" class="p34-ghost" data-ai="refresh" style="align-self:flex-start">Sjekk på nytt</button>` : ''}`;
}

// Modeller
const KEEP_N = { '5m': '5 min', '30m': '30 min', '-1': 'alltid', 0: 'til den ikke brukes', '0': 'til den ikke brukes' };
const fitC = (f) => (f === 'PASSER' ? 'ok' : f === 'FOR STOR' ? 'bad' : 'warn');
function mod() {
  const md = AC.md, A = admin(), def = AC.rt?.tasks?.find?.((x) => x.id === 'chat'), defId = md?.defaults?.chat || def?.model || def?.resolved, keep = AC.rt?.params?.keepAlive ?? '30m';
  const inst = (md?.installed ?? []).map((x, i) => {
    const isDef = x.id === defId, emb = x.kind === 'embedding', del = AC.mdel === x.id;
    const tags = [x.params, x.sizeGb != null ? gb(x.sizeGb) : null, x.quant, x.kind, x.fit].filter(Boolean);
    return `<div class="p34a-m" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><div class="p34a-mh"><span class="p34a-dot" style="background:${x.loaded ? 'var(--pp-pos)' : 'var(--pp-line)'}"></span><b class="p34a-mono">${esc(x.id)}</b>${isDef ? '<span class="p34a-std">STANDARD</span>' : ''}</div>
      <div class="p34a-tags">${tags.map((g) => `<span>${esc(g)}</span>`).join('')}</div>
      <span class="p34a-ms">${x.loaded ? `Lastet i VRAM · holdes ${esc(KEEP_N[String(keep)] ?? keep)} etter bruk` : `Ikke lastet${x.lastUsed ? ` · sist brukt ${esc(new Date(x.lastUsed).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}` : ''}`}</span>
      ${A ? `<div class="p34a-btns"><button type="button" class="p34-ghost sm" data-ai="${x.loaded ? 'unload' : 'load'}" data-id="${esc(x.id)}" ${AC.busy[x.id] ? 'disabled' : ''}>${AC.busy[x.id] ? '…' : x.loaded ? 'Last ut' : 'Last inn'}</button>${!isDef && !emb && x.kind !== 'bilde' ? `<button type="button" class="p34-ghost sm" data-ai="mkdef" data-id="${esc(x.id)}">Bruk som standard</button>` : ''}<button type="button" class="p34-txt bad" data-ai="mdel" data-id="${esc(x.id)}">${del ? `Slette ${esc(x.id)}? Trykk igjen` : 'Slett'}</button></div>` : ''}</div>`;
  }).join('');
  const pulls = [...(md?.pulls ?? []).filter((p) => !p.done && !AC.pulls[p.model]).map((p) => ({ id: p.model, pct: p.pct ?? 0, done: p.completed, total: p.total, mbps: p.mbps })), ...Object.entries(AC.pulls).map(([id, p]) => ({ id, ...p }))];
  const q = AC.q.trim().toLowerCase(), valid = /^[a-z0-9][a-z0-9._/-]*(:[a-z0-9._-]+)?$/i.test(q);
  const lib = (AC.lib?.items ?? []).filter((l) => (AC.cat === 'alle' || l.cat === AC.cat) && (!q || `${l.id} ${l.desc}`.toLowerCase().includes(q)));
  const has = new Set((md?.installed ?? []).map((x) => x.id));
  const canQ = A && q && valid && !lib.some((l) => l.id === q) && !has.has(q);
  return `${!A ? '<div class="p34a-note">Du kan se modellene. Bare administrator kan laste ned, laste inn og slette.</div>' : ''}
    ${md?.ok === false ? `<div class="p34a-err">${esc(md.error || 'Ollama svarer ikke')}</div>` : ''}
    <span class="p34a-lab" data-hl="ai-mod"><span>INSTALLERT LOKALT · ${md?.installed?.length ?? 0}</span><span>${md ? `${gb((md.installed ?? []).reduce((a, x) => a + (x.sizeGb ?? 0), 0))} på disk` : ''}</span></span>
    <div class="p34a-list">${inst || `<div class="p34a-none">${md ? 'Ingen modeller er installert på Ollama.' : 'Henter modeller …'}</div>`}</div>
    ${pulls.length ? `${lab('LASTER NED')}${pulls.map((p) => `<div class="p34a-card p34a-pull"><span class="p34a-row2"><b class="p34a-mono">${esc(p.id)}</b><span class="p34a-mono">${Math.floor(p.pct || 0)} %</span></span><span class="p34a-bt stripe"><i style="width:${Math.max(2, p.pct || 0)}%"></i></span><span class="p34a-row2 sm"><span>${p.total ? `${gb((p.done ?? 0) / 1e9).replace(' GB', '')} av ${gb(p.total / 1e9)}` : esc(p.status || 'Starter …')}${p.mbps ? ` · ${Math.round(p.mbps)} MB/s` : ''}</span><button type="button" class="p34-txt bad" data-ai="pullx" data-id="${esc(p.id)}">Avbryt</button></span></div>`).join('')}` : ''}
    ${A ? `${lab('LAST NED FRA OLLAMA')}<form class="p34a-q" data-aif="pull"><span>${SV('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5', 16)}</span><input id="p34a-q" data-aiin="q" value="${esc(AC.q)}" placeholder="Søk eller skriv modellnavn, f.eks. qwen3:14b" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">${canQ ? '<button type="submit" class="p34-ink sm">Last ned</button>' : ''}</form>
      <div class="p34a-cats">${[['alle', 'Alle'], ['tekst', 'Tekst'], ['bilde', 'Bilde'], ['resonnering', 'Resonnering'], ['embedding', 'Embeddings']].map(([k, n]) => `<button type="button" data-ai="cat" data-k="${k}" aria-pressed="${AC.cat === k}">${n}</button>`).join('')}</div>
      <div class="p34a-list">${lib.length ? lib.map((l, i) => { const inS = has.has(l.id) || l.installed, pl = pulls.some((p) => p.id === l.id); return `<div class="p34a-lib" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="m-grow"><span class="p34a-mh"><b class="p34a-mono">${esc(l.id)}</b>${l.fit ? `<span class="p34a-fit ${fitC(l.fit)}">${esc(l.fit)}</span>` : ''}</span><span>${esc([l.desc, l.sizeGb != null ? gb(l.sizeGb) : ''].filter(Boolean).join(' · '))}</span></span><button type="button" class="p34-ghost sm" data-ai="pull" data-id="${esc(l.id)}" ${inS || pl ? 'disabled' : ''}>${inS ? 'Installert' : pl ? 'Laster …' : 'Last ned'}</button></div>`; }).join('') : `<div class="p34a-none">${AC.lib ? 'Ingen treff. Skriv hele navnet (f.eks. qwen3:14b) for å laste ned.' : 'Henter biblioteket …'}</div>`}</div>` : ''}
    ${lab('SKY-MODELLER')}<div class="p34a-list">${(md?.cloud ?? []).map((c, i) => `<button type="button" class="p34a-prow" data-ai="cloud" data-id="${esc(c.id)}" data-on="${c.on ? 1 : 0}" ${A ? '' : 'disabled'} role="switch" aria-checked="${!!c.on}" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p34a-dot" style="background:${c.on ? 'var(--pp-lab)' : 'var(--pp-line)'}"></span><span class="m-grow"><b class="p34a-mono">${esc(c.id)}</b><span>${esc([c.desc, c.available === false ? 'mangler nøkkel' : ''].filter(Boolean).join(' · '))}</span></span>${tg(c.on)}</button>`).join('') || '<div class="p34a-none">Ingen sky-modeller.</div>'}</div>
    <span class="p34a-foot">Bare sky-modeller som er på kan velges under Valg.</span>`;
}

// Valg (ruting)
/* Prompt 38: «HVILKEN MODELL GJØR HVA I FINANS» – alltid 4 rader (GET /api/ai/routing?scope=finans → rader med model,
   fallback, options:[{id, label, local}], warning). Eldre server: Finans-oppgavene fra /ai/routing, ellers standardene.
   Ingen modeller installert eller tilkoblet → «Ingen modeller ennå» + Installer modell ›, aldri et tomt kort. */
const FIN4 = [['rc', 'Kvitteringer (bilde)', 'Leser butikk, beløp og varelinjer', 'qwen2.5vl:7b', 'gemini-2.5-flash', 'vision'], ['kat', 'Kategorisering', 'Foreslår kategori for transaksjoner', 'llama3.2:3b', 'llama-3.3-70b-versatile', 'text'],
  ['fsok', 'Finans · spør', '«Har jeg et musikkabonnement?»', 'gemma4:latest', 'gemini-2.5-flash', 'text'], ['bar', 'Strekkoder og pakkelapper', 'Bildefelt fra kamera', 'roboflow/kvittering/1', 'qwen2.5vl:7b', 'vision']];
function finTasks(R) {
  const F = AC.rtf, L = Array.isArray(F?.tasks) ? F.tasks : Array.isArray(F?.rows) ? F.rows : Array.isArray(F) ? F : null;
  const own = (R?.tasks ?? []).filter((t) => t.fin);
  const src = L?.length ? L : own;
  return FIN4.map(([id, name, desc, dm, df, kind], i) => {
    const t = src.find((x) => x.id === id) ?? (src.length === 4 && !src.some((x) => FIN4.some(([k]) => k === x.id)) ? src[i] : null) ?? {};
    return { id: t.id ?? id, name: t.name ?? name, desc: t.desc ?? desc, kind: t.kind ?? kind, model: t.model ?? '', fallback: t.fallback ?? '', resolved: t.resolved ?? null, def: [t.defaultModel ?? dm, t.defaultFallback ?? df],
      options: Array.isArray(t.options) ? t.options : null, warning: t.warning ?? t.error ?? (t.finCloud ? 'Finansdata skal holdes lokalt, men denne bruker en sky-modell. Bytt til en lokal modell.' : null), personal: !!t.personal };
  });
}
function finRows(R, A) {
  const M = R?.models ?? [], T = finTasks(R);
  const optsOf = (t) => t.options ?? M.filter((x) => (t.kind === 'vision' ? x.kind === 'bilde' || x.kind === 'tekst' || !x.local : x.kind !== 'embedding')).map((x) => ({ id: x.id, label: x.id, local: !!x.local }));
  if (!T.some((t) => optsOf(t).length)) return `<div class="p34a-empty p38-aie"><b>Ingen modeller ennå</b><span>Installer en lokal modell eller koble til en sky-tjeneste, så kan du velge hvem som gjør hva i Finans.</span><a class="p34-ink" href="#/aictl/mod">Installer modell ›</a></div>`;
  const finLocal = !!(R?.rules?.finLocal);
  return T.map((t, i) => {
    const O = optsOf(t), can = A || t.personal;
    const tag = (o) => (o.local ? 'LOKAL' : 'SKY');
    const sel = (field, cur) => `<select data-ai="route" data-id="${esc(t.id)}" data-f="${field}" ${can ? '' : 'disabled'} aria-label="${field === 'model' ? 'Modell' : 'Reserve'} for ${esc(t.name)}"><option value=""${cur ? '' : ' selected'}>${field === 'model' ? esc(t.resolved ?? t.def[0]) : esc(t.def[1])}</option>${cur && !O.some((o) => o.id === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} · finnes ikke</option>` : ''}${O.map((o) => `<option value="${esc(o.id)}"${o.id === cur ? ' selected' : ''}>${esc(o.label ?? o.id)} · ${tag(o)}</option>`).join('')}</select>`;
    const cloudSel = finLocal && [t.model, t.fallback].some((v) => v && O.find((o) => o.id === v)?.local === false);
    const warn = t.warning || (cloudSel ? '«Finansdata forlater aldri huset» er på: sky-modellen brukes ikke. Velg en lokal modell.' : '');
    return `<div class="p34a-rt p38-frt" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p34a-rtn"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></span>
      <label><span>MODELL</span>${sel('model', t.model)}</label><label><span>RESERVE</span>${sel('fallback', t.fallback)}</label>
      ${warn ? `<span class="p34a-warn bad">${esc(warn)}</span>` : ''}</div>`;
  }).join('');
}
const KEEP = [['5m', '5 min'], ['30m', '30 min'], [-1, 'Alltid'], [0, 'Aldri']];
const CTX = [[8192, '8k'], [32768, '32k'], [131072, '128k']];
const TEMP = [[0.2, '0,2'], [0.7, '0,7'], [1, '1,0']];
function rt() {
  const R = AC.rt;
  if (!R) return '<div class="m-spin"></div>';
  const A = admin(), M = R.models ?? [];
  const tasks = (R.tasks ?? []).filter((t) => (AC.fin ? t.fin : true));
  const opt = (v, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>`;
  const rows = AC.fin ? finRows(R, A) : tasks.map((t, i) => {
    const can = A || t.personal, ms = M.filter((x) => (t.kind === 'embed' ? x.kind === 'embedding' : t.kind === 'vision' ? x.kind === 'bilde' || x.kind === 'tekst' || !x.local : x.kind !== 'embedding'));
    const sel = (field, cur) => `<select data-ai="route" data-id="${esc(t.id)}" data-f="${field}" ${can ? '' : 'disabled'} aria-label="${field === 'model' ? 'Modell' : 'Reserve'} for ${esc(t.name)}">${opt('', cur)}${field === 'model' ? `Auto${t.resolved ? ` · ${esc(t.resolved)}` : ''}` : 'Ingen'}</option>${cur && !ms.some((x) => x.id === cur) ? `${opt(cur, cur)}${esc(cur)} · finnes ikke</option>` : ''}${ms.map((x) => `${opt(x.id, cur)}${esc(x.id)} · ${x.local ? 'lokal' : esc(x.provider)}</option>`).join('')}</select>`;
    const warn = t.error || t.warning || (t.finCloud ? 'Finansdata skal holdes lokalt, men denne bruker en sky-modell. Bytt til en lokal modell.' : '') || t.notice;
    return `<div class="p34a-rt" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p34a-rtn"><b>${esc(t.name)}</b><span>${esc(t.desc ?? '')}${t.own ? ' · ditt valg' : ''}</span></span>
      <label><span>MODELL</span>${sel('model', t.model ?? '')}</label><label><span>RESERVE</span>${sel('fallback', t.fallback ?? '')}</label>
      ${warn ? `<span class="p34a-warn${t.error ? ' bad' : ''}">${esc(warn)}${/finnes ikke/i.test(warn) ? ' · bytt' : ''}</span>` : ''}</div>`;
  }).join('');
  const RU = R.rules ?? {}, P = R.params ?? {};
  const rules = (AC.fin ? [['finLocal', 'Finansdata forlater aldri huset', 'Kvitteringer og transaksjoner bare til lokale modeller'], ['localFirst', 'Lokalt først', 'Prøv hjemmeserveren før skyen']]
    : [['localFirst', 'Lokalt først', 'Prøv hjemmeserveren før skyen, bytt bare ved feil eller tidsavbrudd'], ['finLocal', 'Finansdata forlater aldri huset', 'Gjelder kvitteringer, transaksjoner og Finans · spør'], ['think', 'Vis tenking', 'Vis stegene mens modellen jobber']])
    .map(([k, n, s], i) => `<button type="button" class="p34a-prow" data-ai="rule" data-k="${k}" role="switch" aria-checked="${!!RU[k]}" ${A || k === 'think' ? '' : 'disabled'} style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="m-grow"><b>${n}</b><span>${s}</span></span>${tg(!!RU[k])}</button>`).join('');
  const seg = (k, opts, can) => `<div class="p34a-seg">${opts.map(([v, n]) => `<button type="button" data-ai="par" data-k="${k}" data-v="${esc(v)}" aria-pressed="${String(P[k]) === String(v)}" ${can ? '' : 'disabled'}>${n}</button>`).join('')}</div>`;
  const par = (AC.fin ? [['minConf', 'Minste sikkerhet før «Sjekk»', 'Lavere enn dette havner i Til godkjenning', [[70, '70 %'], [80, '80 %'], [85, '85 %'], [90, '90 %'], [95, '95 %']], A], ['parallel', 'Samtidige kvitteringer', 'Flere samtidig krever mer VRAM', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], A]]
    : [['keepAlive', 'Hold modell lastet', 'Hvor lenge modellen blir i VRAM etter bruk (keep_alive)', KEEP, A], ['numCtx', 'Kontekst', 'Standard kontekstlengde (num_ctx)', CTX, A], ['temperature', 'Temperatur', 'Lav = presis, høy = kreativ', TEMP, true], ['parallel', 'Samtidige jobber', 'Maks jobber som kjører på serveren samtidig', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], A]])
    .map(([k, n, s, o, can], i) => `<div class="p34a-par" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p34a-row2"><span class="p34a-rtn"><b>${n}</b><span>${s}</span></span><b class="p34a-mono">${esc((o.find(([v]) => String(v) === String(P[k])) ?? [0, P[k] ?? '–'])[1])}</b></span>${seg(k, o, can)}</div>`).join('');
  return `${(R.warnings ?? []).length ? `<div class="p34a-err">${esc(R.warnings.join(' · '))}</div>` : ''}
    <span class="p34a-lab" data-hl="ai-sel"><span>${AC.fin ? 'HVILKEN MODELL GJØR HVA I FINANS' : 'HVILKEN MODELL GJØR HVA'}</span></span><div class="p34a-list">${rows}</div>
    ${lab('REGLER')}<div class="p34a-list">${rules}</div>${lab('PARAMETRE')}<div class="p34a-list">${par}</div>
    <span class="p34a-foot">${A ? 'Endringer for Chat, AI-søk og Glimt lagres for deg. Resten er serverstandard for alle brukere.' : 'Du kan velge egne modeller for Chat, AI-søk og Glimt. Resten styres av administrator.'} Selvtesten kjøres etter endringer.</span>`;
}

// Jobber
function jobRow(j, i) {
  const run = j.status === 'run', q = j.status === 'queue', ok = j.status === 'ok', bad = j.status === 'fail' || j.status === 'cancelled';
  const tok = j.tokens ? (j.tokens.in ?? 0) + (j.tokens.out ?? 0) : 0;
  const sub = [j.model, run ? `${Math.floor(j.progress ?? 0)} %${j.step ? ` · ${j.step}` : ''}` : '', q ? (j.when ? j.when : 'venter') : '', j.ms != null && !run ? sec(j.ms) : '', tok ? `${nb(tok)} tok` : '', j.costKr ? kr(j.costKr) : '', j.fallbackFrom ? `reserve for ${j.fallbackFrom}` : '', j.error ?? ''].filter(Boolean).join(' · ');
  const act = run || q ? (j.cancellable !== false ? ['jcancel', 'Avbryt', 'bad'] : null) : bad && j.retryable !== false ? ['jretry', 'Prøv igjen', ''] : null;
  return `<div class="p34a-job" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><div class="p34a-mh"><span class="p34a-ring${run ? ' spin' : q ? ' dash' : ok ? ' ok' : bad ? ' bad' : ''}">${ok ? '✓' : bad ? '!' : ''}</span><span class="m-grow p34a-rtn"><b>${esc(j.title ?? j.taskName ?? j.task)}</b><span${bad ? ' class="bad"' : ''}>${esc(sub)}</span></span>${act ? `<button type="button" class="p34-ghost sm ${act[2]}" data-ai="${act[0]}" data-id="${esc(j.id)}">${act[1]}</button>` : ''}</div>
    ${run ? `<span class="p34a-bt"><i style="width:${Math.max(3, j.progress ?? 5)}%"></i></span>` : ''}</div>`;
}
function job() {
  if (!AC.jobs) return '<div class="m-spin"></div>';
  const J = jobsOf(), par = AC.rt?.params?.parallel ?? 2, A = admin();
  const G = [['KJØRER', J.run], ['I KØ', J.q], ['SISTE', J.rec]].filter(([, L]) => L.length);
  return `<div class="p34a-row2 wrap"><span class="p34a-s">${J.run.length} kjører · ${J.q.length} i kø · maks ${par} samtidig${J.paused ? ' · køen er pauset' : ''}</span><span class="p34a-btns">${A ? `<button type="button" class="p34-ghost sm" data-ai="pause">${J.paused ? 'Fortsett kø' : 'Pause kø'}</button>` : ''}<button type="button" class="p34-ghost sm" data-ai="jclear">Tøm historikk</button></span></div>
    ${G.length ? G.map(([h, L]) => `${lab(h)}<div class="p34a-list">${L.map(jobRow).join('')}</div>`).join('') : '<div class="p34a-none p34a-card">Ingen AI-jobber ennå. Chat, kvitteringer, kategorisering, kunnskapsbasen, Domener og AI-søk havner her.</div>'}`;
}

// Forbruk
function use() {
  const U = AC.use, A = admin();
  const per = `<div class="p34a-seg inl">${[['1', 'I dag'], ['7', '7 dager'], ['30', '30 dager']].map(([k, n]) => `<button type="button" data-ai="per" data-k="${k}" aria-pressed="${AC.per === k}">${n}</button>`).join('')}</div>`;
  if (!U) return `${per}<div class="m-spin"></div>`;
  const T = U.totals ?? {}, P = U.byProvider ?? [], days = U.byDay ?? [], B = U.budget ?? {};
  const cloud = P.filter((p) => !['ollama', 'zbar', 'lokal'].includes(p.provider));
  const kpi = [['TOKENS', tk((T.tokIn ?? 0) + (T.tokOut ?? 0)), `inn ${tk(T.tokIn ?? 0)} · ut ${tk(T.tokOut ?? 0)}`], ['SKY-KOSTNAD', kr(T.costKr), cloud.map((p) => `${p.name} ${kr(p.costKr)}`).join(' · ') || 'Ingen sky-kall'],
    ['LOKALT', T.localShare != null ? `${T.localShare} %` : '–', 'av alle tokens, gratis'], ['SNITT SVARTID', T.avgMs != null ? sec(T.avgMs) : '–', `${nb(T.count)} kall${T.failed ? ` · ${T.failed} feilet` : ''}`]];
  const mx = Math.max(1, ...days.map((d) => (d.localTok ?? 0) + (d.cloudTok ?? 0)));
  const bars = days.map((d) => `<span class="p34a-day" title="${esc(d.date)} · ${tk((d.localTok ?? 0) + (d.cloudTok ?? 0))} tokens"><i class="c" style="height:${((d.cloudTok ?? 0) / mx) * 100}%"></i><i class="l" style="height:${((d.localTok ?? 0) / mx) * 100}%"></i></span>`).join('');
  const F = U.byTask ?? [], fm = Math.max(1, ...F.map((f) => f.tokens ?? 0));
  const bud = B.monthlyKr ?? 0, pct = bud ? Math.min(100, ((B.monthCostKr ?? 0) / bud) * 100) : 0;
  return `${per}<div class="p34a-kpi">${kpi.map(([l, v, s]) => `<div><span class="p34a-k2">${l}</span><b>${esc(v)}</b><span>${esc(s)}</span></div>`).join('')}</div>
    <div class="p34a-card"><span class="p34a-row2 wrap"><b>Tokens per dag</b><span class="p34a-leg"><span><i style="background:var(--pp-pos)"></i>Lokalt</span><span><i style="background:var(--pp-lab)"></i>Sky</span></span></span>
      ${days.length ? `<div class="p34a-days">${bars}</div><div class="p34a-row2 sm p34a-mono"><span>${esc(days[0].date.slice(5).split('-').reverse().join('.'))}</span><span>i dag</span></div>` : '<span class="p34a-none">Ingen AI-kall i perioden.</span>'}</div>
    ${F.length ? `${lab('PER FUNKSJON')}<div class="p34a-list">${F.map((f, i) => `<div class="p34a-feat" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><b>${esc(f.name)}</b><b class="p34a-mono">${f.costKr ? kr(f.costKr) : 'Gratis'}</b><span class="p34a-bt sm"><i style="width:${((f.tokens ?? 0) / fm) * 100}%;background:var(--pp-ink)"></i></span><span>${esc([...(f.models ?? []).slice(0, 2), `${nb(f.count)} kall`].join(' · '))}</span><span class="p34a-mono">${tk(f.tokens ?? 0)} tok</span></div>`).join('')}</div>` : ''}
    <div class="p34a-card"><span class="p34a-row2"><b>Budsjett for sky-AI</b><b class="p34a-mono" id="p34a-budv">${bud ? `${nb(bud)} kr / mnd` : 'Ingen grense'}</b></span>
      <input type="range" min="0" max="500" step="10" value="${bud}" data-aiin="bud" aria-label="Budsjett for sky-AI i kroner per måned" ${A ? '' : 'disabled'}>
      <span class="p34a-bt"><i style="width:${pct}%;background:${pct > 80 ? 'var(--pp-warn)' : 'var(--pp-pos)'}"></i></span>
      <span class="p34a-s">${kr(B.monthCostKr)} brukt denne måneden.${B.forecastKr != null ? ` Prognose: ${kr(B.forecastKr)} ved månedsslutt.` : ''} 0 kr = ingen grense.${B.blocked ? ' Sky-AI er stoppet til neste måned.' : ''}</span>
      ${[['hardStop', 'Stopp sky-AI ved grensen', 'Bytter til lokale modeller resten av måneden'], ['warn80', 'Varsle ved 80 %', 'Push til mobilen']].map(([k, n, s]) => `<button type="button" class="p34a-prow" data-ai="budtog" data-k="${k}" role="switch" aria-checked="${!!(AC.rt?.budget ?? B)[k]}" ${A ? '' : 'disabled'} style="border-top:1px solid var(--pp-line)"><span class="m-grow"><b>${n}</b><span>${s}</span></span>${tg(!!(AC.rt?.budget ?? B)[k])}</button>`).join('')}</div>`;
}

// API og nøkler
const PI = { ollama: ['O', '#2f7a4f'], gemini: ['G', '#2b5d8a'], groq: ['q', '#a8661a'], openrouter: ['R', '#7a3b6b'], roboflow: ['rf', '#3d7f8a'] };
function api() {
  const K = AC.keys?.providers ?? [], A = admin(), stOf = (id) => (AC.st?.providers ?? []).find((p) => p.id === id);
  const cards = K.filter((p) => !AC.fin || p.id !== 'openrouter').map((p) => {
    const [ic, c] = PI[p.id] ?? [p.name?.[0] ?? '?', '#6b665c'], s = stOf(p.id), t = AC.test[p.id];
    const stT = t === 'busy' ? 'Tester …' : t ? t : s?.label ?? (p.set ? 'Satt' : 'Ikke koblet til'), stC = t === 'busy' ? 'var(--pp-mut)' : t ? (/^Svarte/.test(t) ? 'var(--pp-pos)' : 'var(--pp-lab)') : s?.state === "off" ? "var(--pp-mut)" : STC[s?.state] ?? (p.set ? 'var(--pp-pos)' : 'var(--pp-mut)');
    const fld = (k, l, ph, key, val = '') => `<label class="p34a-fld"><span><span>${l}</span>${key && p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link.replace(/^https?:\/\//, '').split('/')[0])} ↗</a>` : ''}</span><span class="p34a-in"><input id="p34a-k-${esc(p.id)}-${k}" data-aiin="key" data-p="${esc(p.id)}" data-k="${k}" type="${key && !AC.eye[`${p.id}.${k}`] ? 'password' : 'text'}" value="${esc(AC.kf[`${p.id}.${k}`] ?? val)}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false" ${A ? '' : 'disabled'}>${key ? `<button type="button" data-ai="eye" data-k="${esc(p.id)}.${k}">${AC.eye[`${p.id}.${k}`] ? 'Skjul' : 'Vis'}</button>` : ''}</span></label>`;
    const fields = p.id === 'ollama' ? [fld('url', 'Adresse', 'http://192.168.1.40:11434', false, p.url ?? '')]
      : [fld('key', p.optional ? 'API-nøkkel (valgfri)' : 'API-nøkkel', p.set ? `•••• ${p.tail ?? 'lagret'} · skriv for å bytte` : p.id === 'gemini' ? 'AIza…' : p.id === 'groq' ? 'gsk_…' : p.id === 'openrouter' ? 'sk-or-…' : 'Private API Key', true), ...(p.id === 'roboflow' ? [fld('model', 'Arbeidsområde / modell', 'workspace/modell/1', false, p.model ?? '')] : [])];
    const dirty = Object.keys(AC.kf).some((x) => x.startsWith(`${p.id}.`));
    const meta = [p.source === 'env' ? 'Satt i .env på serveren' : '', p.keys > 1 ? `${p.keys} nøkler i rotasjon` : '', s?.model ? `modell ${s.model}` : '', s?.state !== 'ok' && s?.error ? s.error : ''].filter(Boolean).join(' · ');
    return `<div class="p34a-card" data-hl="${p.id === 'gemini' ? 'ai-key-gemini' : `ai-key-${esc(p.id)}`}"><div class="p34a-mh"><span class="p34a-pi" style="color:${c}">${esc(ic)}</span><span class="m-grow p34a-rtn"><b>${esc(p.name)}</b><span style="color:${stC}"><i class="p34a-dot sm" style="background:${stC}"></i>${esc(stT)}</span></span><button type="button" class="p34-ghost sm" data-ai="ktest" data-p="${esc(p.id)}" ${t === 'busy' ? 'disabled' : ''}>${t === 'busy' ? 'Tester …' : 'Test'}</button></div>
      ${fields.join('')}${A && dirty ? `<div class="p34a-btns"><button type="button" class="p34-ghost sm" data-ai="kx" data-p="${esc(p.id)}">Avbryt</button><button type="button" class="p34-ink sm" data-ai="ksave" data-p="${esc(p.id)}">Lagre</button></div>` : ''}${A && p.set && p.id !== 'ollama' ? `<button type="button" class="p34-txt bad" data-ai="kdel" data-p="${esc(p.id)}" style="align-self:flex-start">Fjern nøkkelen</button>` : ''}
      ${meta ? `<span class="p34a-mono sm">${esc(meta)}</span>` : ''}</div>`;
  }).join('');
  const toks = Array.isArray(AC.toks) ? AC.toks : AC.toks?.items ?? [];
  const tokCard = AC.fin ? '' : `<div class="p34a-card"><div class="p34a-mh"><span class="m-grow p34a-rtn"><b>Glimt-API for egne skript</b><span class="p34a-mono">POST ${esc(location.origin)}/api/glimt</span></span><button type="button" class="p34-ink sm" data-ai="tnew">+ Ny nøkkel</button></div>
    ${AC.fresh ? `<div class="p34a-fresh"><span>Kopier nå. Nøkkelen vises bare én gang.</span><b class="p34a-mono">${esc(AC.fresh)}</b><button type="button" class="p34-ghost sm" data-ai="tcopy">Kopier</button></div>` : ''}
    ${toks.map((t) => `<div class="p34a-prow" style="border-top:1px solid var(--pp-line)"><span class="m-grow"><b>${esc(t.name)}</b><span class="p34a-mono">hl_••••${esc(t.tail ?? '')}${t.created ? ` · opprettet ${esc(new Date(t.created).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }))}` : ''}${t.lastUsed ? ` · brukt ${esc(new Date(t.lastUsed).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }))}` : ' · aldri brukt'}</span></span><button type="button" class="p34-txt bad" data-ai="tdel" data-id="${esc(t.id)}">Trekk tilbake</button></div>`).join('')}</div>`;
  return `${!A ? '<div class="p34a-note">Du ser status for nøklene. Bare administrator kan endre dem.</div>' : ''}${cards || '<div class="m-spin"></div>'}${tokCard}
    <span class="p34a-foot">Nøklene lagres kryptert på serveren og sendes aldri tilbake til appen. Feltene viser bare de siste fire tegnene.</span>`;
}

/* ---------- Handlinger ---------- */
const put = (json) => hlApi('/ai/routing', { method: 'PUT', json });
async function routingPut(json) {
  try { AC.rt = await put(json); AC.t.rt = Date.now(); haptic('tab'); draw(); autoSelftest(); }
  catch (e) { flash(e.message, 'err'); await get('rt', '/ai/routing', true); draw(); }
}
let stT = null;
/** Selvtesten kjøres av seg selv litt etter at ruter eller nøkler er endret; feiler noe, vises et varsel. */
function autoSelftest() { clearTimeout(stT); stT = setTimeout(() => selftest(true), 2500); }
async function selftest(auto = false) {
  if (AC.sel && !AC.sel.done) return;
  const order = (AC.rt?.tasks ?? []).filter((t) => (AC.fin ? t.fin : true)).map((t) => t.id);
  AC.sel = { order, res: {}, done: false }; if (!auto) haptic('tap'); draw();
  try {
    await sse('/ai/selftest', AC.fin ? { fin: true } : {}, (ev, d) => {
      if (ev === 'result' && d?.task) { AC.sel.res[d.task] = d; if (!AC.sel.order.includes(d.task)) AC.sel.order.push(d.task); draw(); }
      else if (ev === 'done' || ev === 'json') { if (d?.results) for (const r of d.results) { AC.sel.res[r.task] = r; if (!AC.sel.order.includes(r.task)) AC.sel.order.push(r.task); } Object.assign(AC.sel, { done: true, failed: d?.failed, total: d?.total }); }
    });
  } catch (e) { AC.sel.done = true; AC.sel.failed = AC.sel.order.length; flash(e.status === 404 ? 'Serveren har ikke selvtest ennå' : e.message, 'err'); }
  AC.sel.done = true;
  const bad = AC.sel.failed ?? Object.values(AC.sel.res).filter((x) => !x.ok).length;
  flash(bad ? `${bad} AI-funksjon${bad > 1 ? 'er' : ''} virker ikke` : 'Alle AI-funksjoner svarer', bad ? 'err' : 'ok');
  get('st', '/ai/status', true, 0).then(draw);
}
async function pull(id) {
  id = String(id ?? '').trim(); if (!id || AC.pulls[id]) return;
  const ctrl = new AbortController(); AC.pulls[id] = { pct: 0, status: 'Starter …', ctrl }; AC.q = ''; haptic('tap'); draw();
  try {
    await sse('/ai/models/pull', { model: id, name: id }, (ev, d) => {
      const P = AC.pulls[id]; if (!P || !d) return;
      if (ev === 'progress') { Object.assign(P, { pct: d.pct ?? (d.total ? (d.completed / d.total) * 100 : P.pct), done: d.completed, total: d.total, mbps: d.mbps, status: d.status }); if (d.error) throw new Error(d.error); if (m.screen === 'aictl') draw(); }
      if (ev === 'error') throw new Error(d.error || 'Nedlastingen feilet');
    }, ctrl.signal);
    delete AC.pulls[id]; flash(`${id} er lastet ned`, 'ok');
  } catch (e) { delete AC.pulls[id]; if (e.name !== 'AbortError') flash(`${id}: ${e.message}`, 'err'); }
  await Promise.all([get('md', '/ai/models', true), get('lib', `/ai/library?q=&cat=`, true, 0)]); draw();
}
async function act(fn, ok) { try { await fn(); if (ok) flash(ok, 'ok'); } catch (e) { flash(e.status === 403 ? 'Bare administrator kan endre dette' : e.message, 'err'); } }
const keyPath = (p) => `/ai/keys/${encodeURIComponent(p)}`;
let budT = null;
export function inputAi(e, t) {
  const k = t?.dataset?.aiin; if (!k) return false;
  if (k === 'q') { AC.q = t.value; clearTimeout(budT); budT = setTimeout(() => get('lib', `/ai/library?q=${encodeURIComponent(AC.q.trim())}&cat=${AC.cat === 'alle' ? '' : AC.cat}`, true, 0).then(draw), 350); draw(); return true; }
  if (k === 'key') { AC.kf[`${t.dataset.p}.${t.dataset.k}`] = t.value; if (e.type === 'input' && !document.querySelector(`[data-ai="ksave"][data-p="${t.dataset.p}"]`)) draw(); return true; }
  if (k === 'bud') {
    const v = +t.value, lbl = document.getElementById('p34a-budv'); if (lbl) lbl.textContent = v ? `${nb(v)} kr / mnd` : 'Ingen grense';
    if (e.type === 'change') routingPut({ budget: { monthlyKr: v } }).then(() => get('use', `/ai/usage?days=${AC.per}`, true, 0)).then(draw);
    return true;
  }
  return false;
}
export async function submitAi(e, t) {
  const f = t?.closest?.('[data-aif]'); if (!f) return false;
  e.preventDefault();
  if (f.dataset.aif === 'pull') { const q = AC.q.trim(); const hit = (AC.lib?.items ?? []).filter((l) => l.id.includes(q.toLowerCase())); if (hit.length === 1) pull(hit[0].id); else if (/^[a-z0-9][a-z0-9._/-]*(:[a-z0-9._-]+)?$/i.test(q)) pull(q); }
  return true;
}
export async function bindAi(e, t) {
  const x = t.closest?.('[data-ai]'); if (!x || x.tagName === 'SELECT' && e.type === 'click') return !!x && x.tagName === 'SELECT';
  const k = x.dataset.ai, id = x.dataset.id;
  e.preventDefault();
  switch (k) {
    case 'close': location.hash = `#/${AC.from && AC.from !== 'aictl' ? (AC.from === 'set' ? 'set' : AC.from) : 'set'}`; return true;
    case 'tab': { const tb = x.dataset.k; haptic('tab'); location.hash = `#/aictl/${AC.fin ? 'fin/' : ''}${tb}`; window.scrollTo(0, 0); return true; }
    case 'refresh': haptic('tap'); AC.st = null; await get('st', '/ai/status?fresh=1', true); draw(); return true;
    case 'selftest': selftest(); return true;
    case 'load': case 'unload': AC.busy[id] = true; draw(); await act(() => hlApi(`/ai/models/${encodeURIComponent(id)}/${k}`, { method: 'POST' }), k === 'load' ? `${id} er lastet inn` : `${id} er lastet ut av VRAM`); delete AC.busy[id]; await get('md', '/ai/models', true); draw(); return true;
    case 'mkdef': await act(() => hlApi('/ai/models/default', { method: 'PUT', json: { model: id } }), `${id} er standard i Chat`); await Promise.all([get('md', '/ai/models', true), get('rt', '/ai/routing', true)]); draw(); return true;
    case 'mdel': if (AC.mdel !== id) { AC.mdel = id; haptic('err'); draw(); return true; } AC.mdel = null; await act(() => hlApi(`/ai/models/${encodeURIComponent(id)}`, { method: 'DELETE' }), `${id} er slettet`); await Promise.all([get('md', '/ai/models', true), get('rt', '/ai/routing', true)]); draw(); return true;
    case 'pull': pull(id); return true;
    case 'pullx': { const P = AC.pulls[id]; if (P) P.ctrl.abort(); delete AC.pulls[id]; await act(() => hlApi(`/ai/models/pulls/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((er) => { if (er.status !== 404) throw er; })); haptic('tap'); await get('md', '/ai/models', true); draw(); return true; }
    case 'cat': AC.cat = x.dataset.k; haptic('tab'); draw(); await get('lib', `/ai/library?q=${encodeURIComponent(AC.q.trim())}&cat=${AC.cat === 'alle' ? '' : AC.cat}`, true, 0); draw(); return true;
    case 'cloud': await act(async () => { const r = await hlApi('/ai/cloud', { method: 'PUT', json: { id, on: x.dataset.on !== '1' } }); if (AC.md && r?.cloud) AC.md.cloud = r.cloud; }); haptic('tab'); await get('md', '/ai/models', true); draw(); return true;
    case 'rule': routingPut({ rules: { [x.dataset.k]: x.getAttribute('aria-checked') !== 'true' }, ...(admin() && x.dataset.k !== 'think' ? { scope: 'server' } : {}) }); return true;
    case 'par': { const v = x.dataset.v, num = /^-?\d+(\.\d+)?$/.test(v) ? +v : v; routingPut({ params: { [x.dataset.k]: num }, ...(admin() && x.dataset.k !== 'temperature' ? { scope: 'server' } : {}) }); return true; }
    case 'budtog': routingPut({ budget: { [x.dataset.k]: x.getAttribute('aria-checked') !== 'true' }, scope: 'server' }).then(() => get('use', `/ai/usage?days=${AC.per}`, true, 0)).then(draw); return true;
    case 'per': AC.per = x.dataset.k; haptic('tab'); draw(); await get('use', `/ai/usage?days=${AC.per}`, true, 0); draw(); return true;
    case 'pause': await act(async () => { const r = await hlApi('/ai/queue/pause', { method: 'POST', json: { paused: !jobsOf().paused } }); if (AC.jobs) AC.jobs.paused = !!r?.paused; }); haptic('tap'); draw(); return true;
    case 'jclear': await act(() => hlApi('/ai/jobs', { method: 'DELETE' }), 'Historikken er tømt'); await get('jobs', '/ai/jobs?limit=40', true); draw(); return true;
    case 'jcancel': await act(() => hlApi(`/ai/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }), 'Jobben er avbrutt'); await get('jobs', '/ai/jobs?limit=40', true); draw(); return true;
    case 'jretry': await act(() => hlApi(`/ai/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }), '✦ Prøver igjen'); await get('jobs', '/ai/jobs?limit=40', true); draw(); pollJobs(); return true;
    case 'eye': AC.eye[x.dataset.k] = !AC.eye[x.dataset.k]; draw(); return true;
    case 'kx': for (const kk of Object.keys(AC.kf)) if (kk.startsWith(`${x.dataset.p}.`)) delete AC.kf[kk]; draw(); return true;
    case 'ksave': case 'kdel': {
      const p = x.dataset.p, body = {};
      if (k === 'kdel') body.key = '';
      else for (const [kk, v] of Object.entries(AC.kf)) if (kk.startsWith(`${p}.`)) body[kk.split('.')[1]] = v.trim();
      await act(async () => { AC.keys = await hlApi(keyPath(p), { method: 'PUT', json: body }); }, k === 'kdel' ? 'Nøkkelen er fjernet' : 'Lagret ✓');
      for (const kk of Object.keys(AC.kf)) if (kk.startsWith(`${p}.`)) delete AC.kf[kk];
      await get('st', '/ai/status?fresh=1', true, 0); draw(); autoSelftest(); return true;
    }
    case 'ktest': {
      const p = x.dataset.p; AC.test[p] = 'busy'; haptic('tap'); draw();
      try { const r = await hlApi(`${keyPath(p)}/test`, { method: 'POST' }); AC.test[p] = r?.ok ? `Svarte på ${sec(r.ms)}${r.model ? ` · ${r.model}` : ''}` : (r?.error || 'Svarte ikke'); }
      catch (er) { AC.test[p] = er.message; }
      draw(); return true;
    }
    case 'tnew': await act(async () => { const r = await hlApi('/ai/tokens', { method: 'POST', json: { name: 'Ny nøkkel' } }); AC.fresh = r?.token ?? null; }); await get('toks', '/ai/tokens', true); draw(); return true;
    case 'tcopy': try { await navigator.clipboard.writeText(AC.fresh ?? ''); flash('Kopiert'); } catch { flash('Kunne ikke kopiere'); } return true;
    case 'tdel': await act(() => hlApi(`/ai/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Nøkkelen er trukket tilbake'); await get('toks', '/ai/tokens', true); draw(); return true;
    default: return false;
  }
}
/** Nedtrekkslistene i Valg (change-hendelse). */
export function changeAi(e, t) {
  const x = t?.closest?.('select[data-ai="route"]'); if (!x) return false;
  const T = (AC.rt?.tasks ?? []).find((y) => y.id === x.dataset.id);
  routingPut({ tasks: { [x.dataset.id]: { [x.dataset.f]: x.value } }, ...(admin() && !T?.personal ? { scope: 'server' } : {}) }).then(() => (AC.fin ? get('rtf', '/ai/routing?scope=finans', true).then(draw) : null));
  return true;
}

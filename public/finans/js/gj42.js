// Prompt 42: Glimt → «Avanserte oppgaver» (claude-code-glimt-avanserte-oppgaver.md) og Innstillinger → Import →
// «Import rett til Boliger» (claude-code-import-til-boliger.md).
// Oppgaver: POST /glimt/tasks {kind, params} → {jobId}, GET /glimt/tasks(/:id), PDF: GET /glimt/tasks/:id/report.pdf.
// Svarer serveren 404, lages rapporten her fra transaksjonene (tallene regnes uansett fra data, aldri av en språkmodell),
// og «Last ned som PDF» åpner en A4-utskrift som kan lagres som PDF.
import { S, api, esc, n0, render, toast, accs } from './core.js';
import { orb, LOGO42 } from './fin42.js';

const u = S.ui;
const G = (S.gj42 ??= { jobs: null, local: [], timer: null });
export const TASKS = [
  ['report', 'Forbruksrapport nå', 'Kategorier, største kjøp og råd for denne måneden'],
  ['subs_cut', 'Abonnementer jeg kan kutte', 'Lite brukte og overlappende abonnementer'],
  ['compare_year', 'Sammenlign med i fjor', 'Samme måned i fjor, kategori for kategori'],
  ['tidy_cats', 'Rydd kategorier', 'Finner ukategoriserte og feilplasserte kjøp'],
];
const STEPS = ['Leser transaksjoner', 'Leser kvitteringer og varelinjer', 'Grupperer etter kategori', 'Skriver rapporten'];
const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const kr = (v) => `${n0(v)} kr`;
const hm = (t) => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

export async function loadTasks() {
  try { const r = await api('/glimt/tasks'); G.jobs = (Array.isArray(r) ? r : r.items ?? r.jobs ?? []).map(norm); G.server = true; }
  catch { G.jobs = []; G.server = false; }
  poll();
}
const norm = (j) => ({ id: j.id ?? j.jobId, kind: j.kind ?? j.type, title: j.title ?? TASKS.find((t) => t[0] === (j.kind ?? j.type))?.[1] ?? 'Glimt-oppgave', status: j.status ?? 'running', pct: j.pct ?? j.progress ?? 0, step: j.step ?? j.stepLabel ?? null, created: j.createdAt ?? j.created ?? Date.now(), finished: j.finishedAt ?? j.finished ?? null, result: j.result ?? null, pdf: j.pdfUrl ?? (j.status === 'done' && (j.kind ?? j.type) === 'report' ? `/finans/api/glimt/tasks/${encodeURIComponent(j.id ?? j.jobId)}/report.pdf` : null), error: j.error ?? null, local: !!j.local });
const all = () => [...G.local, ...(G.jobs ?? [])].sort((a, b) => b.created - a.created);
function poll() {
  clearTimeout(G.timer);
  if (!all().some((j) => j.status === 'running' || j.status === 'queued')) return;
  G.timer = setTimeout(async () => {
    for (const j of (G.jobs ?? []).filter((x) => x.status === 'running' || x.status === 'queued')) {
      try { const r = norm(await api(`/glimt/tasks/${encodeURIComponent(j.id)}`)); Object.assign(j, r); if (r.status === 'done') toast(`Glimt: ${j.kind === 'report' ? 'rapporten' : 'oppgaven'} er klar`); } catch { /* prøv igjen */ }
    }
    if (u.page === 'ai') paint();
    poll();
  }, 1200);
}
// Oppdaterer bare jobbradene, så siden ikke tegnes på nytt hvert sekund.
function paint() { const box = document.querySelector('[data-gj42-jobs]'); if (box) box.innerHTML = jobsHtml(); else render(); }

export async function startTask(kind, params = {}) {
  if (all().filter((j) => j.status === 'running' || j.status === 'queued').length >= 2) return toast('Glimt kjører allerede to oppgaver. Vent til én er ferdig.');
  const period = params.period ?? new Date().toLocaleDateString('sv-SE').slice(0, 7);
  try {
    const r = await api('/glimt/tasks', { method: 'POST', json: { kind, params: { period, ...params } } });
    const id = r.jobId ?? r.id;
    (G.jobs ??= []).unshift(norm({ id, kind, status: 'running', pct: 2, createdAt: Date.now(), title: params.title ? `${TASKS.find((t) => t[0] === kind)?.[1]} · ${params.title}` : undefined }));
    G.server = true;
  } catch (e) {
    if (e.status !== 404 && e.status !== 405) throw e;
    await localJob(kind, { period, ...params });
  }
  u.gjOpen = null;
  if (u.page === 'ai') render(); else location.hash = '#/ai';
  poll();
}

/* ---------- Lokal reserve: tallene regnes fra transaksjonene i nettleseren ---------- */
async function localJob(kind, params) {
  const j = norm({ id: `l${Date.now()}`, kind, status: 'running', pct: 3, createdAt: Date.now(), local: true });
  G.local.unshift(j); render();
  const step = (i) => { j.pct = Math.min(96, 8 + i * 26); j.step = STEPS[i]; paint(); };
  step(0);
  const tx = (await api('/transactions?limit=5000').catch(() => ({ items: [] }))).items ?? [];
  await new Promise((r) => setTimeout(r, 300)); step(1);
  const subs = await api('/subscriptions').then((r) => r.items ?? r).catch(() => []);
  await new Promise((r) => setTimeout(r, 300)); step(2);
  j.result = buildReport(kind, tx, Array.isArray(subs) ? subs : [], params);
  await new Promise((r) => setTimeout(r, 300)); step(3);
  await new Promise((r) => setTimeout(r, 250));
  Object.assign(j, { status: 'done', pct: 100, finished: Date.now() });
  toast(`Glimt: ${kind === 'report' ? 'rapporten' : 'oppgaven'} er klar`);
  paint();
}
function buildReport(kind, tx, subs, params) {
  const [from, to] = params.filter?.range ?? [null, null];
  const ym = params.period, [Y, M] = ym.split('-').map(Number), prev = new Date(Y, M - 2, 1).toLocaleDateString('sv-SE').slice(0, 7);
  const inP = (t) => (from || to ? (!from || t.date >= from) && (!to || t.date <= to) : t.date.startsWith(ym));
  const spend = (t) => t.amount < 0 && (t.kind ?? t.type) !== 'transfer';
  const out = tx.filter((t) => spend(t) && inP(t)), inn = tx.filter((t) => t.amount > 0 && (t.kind ?? t.type) !== 'transfer' && inP(t));
  const prevOut = tx.filter((t) => spend(t) && t.date.startsWith(prev));
  const sum = (a) => a.reduce((s, t) => s + Math.abs(t.amount), 0);
  const by = {}; out.forEach((t) => { const k = t.category ?? 'Ukategorisert'; by[k] = (by[k] ?? 0) + Math.abs(t.amount); });
  const cats = Object.entries(by).sort((a, b) => b[1] - a[1]), mx = cats[0]?.[1] || 1;
  const brukt = sum(out), pb = sum(prevOut), dPct = pb ? Math.round(((brukt - pb) / pb) * 100) : null;
  const months = Array.from({ length: 6 }, (_, i) => new Date(Y, M - 6 + i, 1).toLocaleDateString('sv-SE').slice(0, 7)).map((m) => ({ m, v: sum(tx.filter((t) => spend(t) && t.date.startsWith(m))) }));
  const biggest = [...out].sort((a, b) => a.amount - b.amount).slice(0, 8);
  const active = subs.filter((s) => s.active !== false), subSum = active.reduce((a, s) => a + (+s.monthly || +s.price || 0), 0);
  const top = cats[0];
  const tips = [];
  if (top) tips.push([`Se på ${top[0].toLowerCase()}.`, `Største kategori med ${kr(top[1])}, ${Math.round((top[1] / (brukt || 1)) * 100)} % av forbruket.`]);
  const low = active.filter((s) => s.lowUse);
  if (low.length) tips.push([`Sjekk ${low[0].name}.`, `Merket som lite brukt. Oppsigelse sparer ${kr((+low[0].monthly || +low[0].price || 0) * 12)} i året.`]);
  if (dPct != null) tips.push([dPct > 0 ? 'Forbruket går opp.' : 'Forbruket går ned.', `${Math.abs(dPct)} % ${dPct > 0 ? 'mer' : 'mindre'} enn i ${MN[(M + 10) % 12]}.`]);
  const label = params.title || `${MN[M - 1][0].toUpperCase() + MN[M - 1].slice(1)} ${Y}`;
  const summary = brukt
    ? `Du har brukt ${kr(brukt)} ${params.title ? `med filteret ${params.title}` : `i ${MN[M - 1]}`}${dPct != null && !params.title ? `, ${Math.abs(dPct)} % ${dPct > 0 ? 'mer' : 'mindre'} enn i ${MN[(M + 10) % 12]}` : ''}. ${top ? `Mest gikk til ${top[0].toLowerCase()} (${kr(top[1])}).` : ''} ${out.length} kjøp, snitt ${kr(brukt / (out.length || 1))}.`
    : 'Jeg finner ingen utgifter i perioden.';
  const base = { label, summary, kpis: [['Brukt totalt', kr(brukt)], ['Antall kjøp', String(out.length)], ['Snitt per kjøp', kr(brukt / (out.length || 1))], ['Største kategori', top ? top[0] : '–']], inn: sum(inn), dPct,
    rows: cats.slice(0, 7).map(([n, v]) => ({ n, v: kr(v), w: `${Math.round((v / mx) * 100)}%` })), months, biggest: biggest.map((t) => ({ d: t.date, n: t.merchant || t.description, c: t.category ?? '', v: Math.abs(t.amount) })), subs: active.slice(0, 8).map((s) => ({ n: s.name, v: +s.monthly || +s.price || 0 })), subSum, tips };
  if (kind === 'subs_cut') return { ...base, summary: active.length ? `Du har ${active.length} aktive abonnementer, ${kr(subSum)} i måneden. ${low.length ? `${low.map((s) => s.name).join(', ')} er merket som lite brukt.` : 'Ingen er merket som lite brukt.'}` : 'Jeg finner ingen aktive abonnementer.', rows: active.slice(0, 8).map((s) => ({ n: s.name, v: kr(+s.monthly || +s.price || 0), w: `${Math.round(((+s.monthly || +s.price || 0) / (Math.max(...active.map((x) => +x.monthly || +x.price || 0)) || 1)) * 100)}%` })) };
  if (kind === 'compare_year') {
    const ly = `${Y - 1}-${String(M).padStart(2, '0')}`, lyOut = tx.filter((t) => spend(t) && t.date.startsWith(ly)), l = sum(lyOut);
    return { ...base, summary: l ? `I ${MN[M - 1]} ${Y - 1} brukte du ${kr(l)}. Nå: ${kr(brukt)} (${brukt >= l ? '+' : '−'}${kr(Math.abs(brukt - l))}).` : `Jeg har ingen tall for ${MN[M - 1]} ${Y - 1} å sammenligne med.` };
  }
  if (kind === 'tidy_cats') { const un = out.filter((t) => !t.categoryId); return { ...base, summary: un.length ? `${un.length} kjøp i perioden mangler kategori, til sammen ${kr(sum(un))}. Åpne Transaksjoner og velg kategori, eller lag en regel.` : 'Alle kjøpene i perioden har kategori.' }; }
  return base;
}

/* ---------- Tegning ---------- */
function jobsHtml() {
  return all().map((j) => {
    const run = j.status === 'running' || j.status === 'queued', R = j.result, open = u.gjOpen === j.id;
    const sub = run ? `${j.step ?? STEPS[Math.min(3, Math.floor(j.pct / 26))]} … ${Math.round(j.pct)} %` : j.status === 'error' ? `Feil: ${j.error ?? 'Glimt klarte ikke oppgaven'}` : `Ferdig · ${hm(j.finished ?? j.created)}${j.local ? ' · laget i nettleseren' : ''}`;
    return `<div class="gj42-job"><div class="gj42-jh">${orb(32, run)}<div class="grow"><b>${esc(j.title)}</b><div class="note" style="font-size:13px">${esc(sub)}</div></div>${!run && j.status !== 'error' ? `<button type="button" class="btn sm ink" data-gj42-open="${esc(j.id)}">${open ? 'Skjul' : j.kind === 'report' ? 'Åpne rapport' : 'Åpne'}</button>` : ''}<button type="button" class="x-btn sm" data-gj42-del="${esc(j.id)}" aria-label="Fjern oppgaven">×</button></div>
      ${run ? `<div class="gj42-bar"><i style="width:${Math.round(j.pct)}%"></i></div>` : ''}
      ${open && R ? `<div class="gj42-open"><div style="font-size:14.5px;line-height:1.55">${esc(R.summary ?? R.text ?? '')}</div>
        ${j.kind === 'report' || R.months ? `<button type="button" class="btn sm ink" style="align-self:flex-start" data-gj42-pdf="${esc(j.id)}">⇩ Last ned som PDF</button>` : ''}
        ${R.kpis?.length ? `<div class="gj42-kpis">${R.kpis.map((k) => `<div><span>${esc(k[0] ?? k.l)}</span><b>${esc(k[1] ?? k.v)}</b></div>`).join('')}</div>` : ''}
        ${(R.rows ?? []).map((r) => `<div class="gj42-row"><span><span>${esc(r.n)}</span><b class="mono">${esc(r.v)}</b></span><span style="height:6px;border-radius:3px;background:var(--line)"><i style="width:${esc(r.w ?? '0%')}"></i></span></div>`).join('')}
        ${(R.tips ?? []).length ? `<div style="display:flex;flex-direction:column;gap:6px">${R.tips.map((t) => `<div class="note" style="font-size:13.5px"><b style="color:var(--text)">${esc(t[0] ?? t.t)}</b> ${esc(t[1] ?? t.d ?? '')}</div>`).join('')}</div>` : ''}</div>` : ''}</div>`;
  }).join('');
}
export function tasksCard() {
  return `<section class="card" style="gap:16px"><div><h2>Avanserte oppgaver</h2><div class="note" style="font-size:13px;margin-top:2px">Glimt jobber i bakgrunnen. Du kan gå videre, og du får varsel når det er ferdig.</div></div>
    <div class="gj42-tasks">${TASKS.map(([k, t, d]) => `<button type="button" class="gj42-task" data-gj42-task="${k}"><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}</div>
    <form class="gj42-free" data-gj42-form><input class="inp" name="q" placeholder="Eller skriv selv, f.eks. «lag en rapport over forbruket mitt i høst»" aria-label="Oppgave til Glimt" autocomplete="off"><button class="btn">Start</button></form>
    <div style="display:flex;flex-direction:column;gap:10px" data-gj42-jobs>${G.jobs ? jobsHtml() : '<div class="skel" style="min-height:60px"></div>'}</div></section>`;
}

/* ---------- PDF ---------- */
function reportDoc(R) {
  const mx = Math.max(1, ...(R.months ?? []).map((m) => m.v));
  const card = (l, v, s = '') => `<div class="k"><span>${esc(l)}</span><b>${esc(v)}</b>${s ? `<em>${esc(s)}</em>` : ''}</div>`;
  const now = new Date();
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>Forbruksrapport ${esc(R.label)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap"><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#fbf8f1;color:#1b1a17;font-family:Manrope,sans-serif}
.p{width:210mm;height:297mm;padding:44px 48px 36px;display:flex;flex-direction:column;gap:22px;page-break-after:always;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:2px solid #1b1a17}.lg{display:flex;align-items:center;gap:12px;font-weight:700;font-size:17px}.lg i{width:40px;height:40px;border-radius:11px;background:#1b2a40;display:grid;place-items:center}
.kick{font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:#b23a2a}h1{margin:0;font:500 44px/1.05 Newsreader,serif}.sub{font-size:14px;color:#4f4b44}
.gl{display:flex;gap:14px;padding:16px 18px;border-radius:14px;background:#efeae0;font-size:14px;line-height:1.6}.gl span{flex:none;width:30px;height:30px;border-radius:15px;background:conic-gradient(#b23a2a,#e8794a,#f2c14e,#3fbf9a,#7a5ad6,#b23a2a);display:grid;place-items:center}.gl span b{width:22px;height:22px;border-radius:11px;background:#fbf8f1;color:#d8402e;display:grid;place-items:center;font-size:12px}
.ks{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k{padding:12px 14px;border-radius:12px;background:#fff;border:1px solid #e0d8c8}.k span{font-size:11.5px;color:#6b665c}.k b{display:block;font:600 19px 'IBM Plex Mono',monospace;margin-top:4px}.k em{font-style:normal;font-size:11px;color:#6b665c}
.two{display:grid;grid-template-columns:1.25fr 1fr;gap:22px;flex:1}.cat{font-size:12.5px;display:flex;flex-direction:column;gap:9px}.cat div div{display:flex;justify-content:space-between}.bar{height:7px;border-radius:4px;background:#e9e2d4;margin-top:4px}.bar i{display:block;height:100%;border-radius:4px;background:#e8833a}
.ch{display:flex;align-items:flex-end;gap:10px;height:170px;padding:10px 4px 0;border-bottom:1px solid #d6cdbb}.ch div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%}.ch span{font:600 9.5px 'IBM Plex Mono',monospace;color:#6b665c}.ch i{width:100%;border-radius:4px 4px 0 0;background:#d9d1c1}.ch .now i{background:#b23a2a}.ch .now span{color:#b23a2a}
.ml{display:flex;gap:10px;font-size:10.5px;color:#6b665c}.ml span{flex:1;text-align:center}
.foot{display:flex;justify-content:space-between;font-size:10px;color:#8a857b;border-top:1px solid #e0d8c8;padding-top:10px;margin-top:auto}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;color:#6b665c;border-bottom:1.5px solid #1b1a17;padding:6px 0}td{padding:7px 0;border-bottom:1px solid #e6dfd1}td.r,th.r{text-align:right;font-family:'IBM Plex Mono',monospace}
h2{margin:0;font:500 22px Newsreader,serif}.sl div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e6dfd1;font-size:12.5px}.tip{padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #e0d8c8;font-size:12.5px;line-height:1.5}
</style></head><body>
<section class="p"><div class="top"><div class="lg"><i>${LOGO42(28)}</i>Finans<span style="font-weight:400;color:#8a857b">Hub</span></div><span class="sub">Laget av Glimt · ${now.toLocaleDateString('nb-NO')} kl. ${hm(now)}</span></div>
<div style="display:flex;flex-direction:column;gap:6px"><span class="kick">FORBRUKSRAPPORT</span><h1>${esc(R.label)}</h1><span class="sub">${esc(S.boot?.me?.name ?? '')} · alle kontoer</span></div>
<div class="gl"><span><b>✦</b></span><p style="margin:0">${esc(R.summary)}</p></div>
<div class="ks">${card('Brukt', R.kpis?.[0]?.[1] ?? '–', R.dPct != null ? `${R.dPct > 0 ? '▲' : '▼'} ${Math.abs(R.dPct)} % mot forrige` : '')}${card('Inn', kr(R.inn ?? 0))}${card('Antall kjøp', R.kpis?.[1]?.[1] ?? '–', `Snitt ${R.kpis?.[2]?.[1] ?? ''}`)}${card('Største kategori', R.kpis?.[3]?.[1] ?? '–')}</div>
<div class="two"><div style="display:flex;flex-direction:column;gap:10px"><b style="font-size:14px">Kategorier</b><div class="cat">${(R.rows ?? []).map((r) => `<div><div><span>${esc(r.n)}</span><b style="font-family:'IBM Plex Mono',monospace">${esc(r.v)}</b></div><div class="bar"><i style="width:${esc(r.w)}"></i></div></div>`).join('')}</div></div>
<div style="display:flex;flex-direction:column;gap:10px"><b style="font-size:14px">Siste 6 måneder</b><div class="ch">${(R.months ?? []).map((m, i, a) => `<div class="${i === a.length - 1 ? 'now' : ''}"><span>${(m.v / 1000).toFixed(1).replace('.', ',')}</span><i style="height:${Math.max(2, (m.v / mx) * 92)}%"></i></div>`).join('')}</div><div class="ml">${(R.months ?? []).map((m) => `<span>${MN[+m.m.slice(5) - 1].slice(0, 3)}</span>`).join('')}</div><span style="font-size:10.5px;color:#6b665c">Tusen kroner.</span></div></div>
<div class="foot"><span>FinansHub · Forbruksrapport ${esc(R.label)}</span><span>Side 1 av 2</span></div></section>
<section class="p"><div style="display:flex;flex-direction:column;gap:10px"><h2>Største kjøp</h2><table><thead><tr><th>Dato</th><th>Hvor</th><th>Kategori</th><th class="r">Beløp</th></tr></thead><tbody>${(R.biggest ?? []).map((b) => `<tr><td>${esc(b.d.slice(8, 10))}.${esc(b.d.slice(5, 7))}</td><td>${esc(b.n)}</td><td>${esc(b.c)}</td><td class="r">${kr(b.v)}</td></tr>`).join('')}</tbody></table></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><div style="display:flex;flex-direction:column;gap:8px"><h2>Abonnementer</h2><div class="sl">${(R.subs ?? []).map((s) => `<div><span>${esc(s.n)}</span><b style="font-family:'IBM Plex Mono',monospace">${kr(s.v)}</b></div>`).join('')}<div style="font-weight:800;border:0"><span>Til sammen per måned</span><span style="font-family:'IBM Plex Mono',monospace">${kr(R.subSum ?? 0)}</span></div></div></div>
<div style="display:flex;flex-direction:column;gap:8px"><h2>Glimt foreslår</h2>${(R.tips ?? []).map((t) => `<div class="tip"><b>${esc(t[0])}</b> ${esc(t[1])}</div>`).join('')}</div></div>
<p style="font-size:11px;color:#6b665c;margin:0">Kilde: transaksjoner, kvitteringer og abonnementer i FinansHub. Tallene er regnet ut fra dataene. Glimt skriver bare teksten rundt dem.</p>
<div class="foot"><span>FinansHub · Forbruksrapport ${esc(R.label)}</span><span>Side 2 av 2</span></div></section></body></html>`;
}
function openPdf(j) {
  if (j.pdf && !j.local) { const a = document.createElement('a'); a.href = j.pdf; a.download = `Forbruksrapport-${new Date(j.created).toLocaleDateString('sv-SE').slice(0, 7)}.pdf`; document.body.appendChild(a); a.click(); a.remove(); return; }
  const w = window.open('', '_blank');
  if (!w) return toast('Tillat sprettoppvinduer for å lagre rapporten som PDF');
  w.document.open(); w.document.write(reportDoc(j.result)); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* brukeren kan skrive ut selv */ } }, 600);
}

/* ---------- Import rett til Boliger ---------- */
export async function loadHomeRules() {
  const [r, homes] = await Promise.all([api('/import/home-rules').catch((e) => (e.status === 404 ? null : [])), S.irHomes ? null : api('/folders').catch(() => [])]);
  S.irRules = r == null ? null : Array.isArray(r) ? r : r.rules ?? r.items ?? [];
  if (homes) S.irHomes = homes;
}
export function homeRulesBox() {
  const R = S.irRules, homes = S.irHomes ?? [], A = accs(), F = u.irForm;
  const hName = (id) => homes.find((h) => String(h.id) === String(id))?.name ?? 'bolig';
  const aName = (id) => A.find((a) => String(a.id) === String(id))?.name ?? 'Konto';
  const chip = (on, n, attr) => `<button type="button" class="f42-chip${on ? ' on' : ''}" ${attr}>${esc(n)}</button>`;
  const rows = (R ?? []).map((r) => `<div class="ir42-r"><div class="grow"><b>${esc(aName(r.accountId ?? r.account_id))} → ${esc(hName(r.homeId ?? r.home_id))}</b><small>${(r.matchType ?? r.match_type) === 'merchants' ? `Bare ${esc((r.merchants ?? []).join(', '))}` : 'Alle transaksjoner fra kontoen'} · ${r.mode === 'direct' ? 'legges rett inn' : 'til gjennomgang i boligen'}</small></div><button type="button" class="toggle" role="switch" aria-checked="${r.enabled !== false}" data-ir42-tog="${esc(r.id)}" aria-label="Regelen er på"></button><button type="button" class="link-btn" style="color:var(--warn)" data-ir42-del="${esc(r.id)}">Slett</button></div>`).join('');
  const form = F ? `<div class="ir42-f"><div class="ir42-g"><label>Fra bankkonto<select class="inp" data-ir42="accountId">${A.map((a) => `<option value="${a.id}"${String(a.id) === String(F.accountId) ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label><label>Til bolig<select class="inp" data-ir42="homeId">${homes.map((h) => `<option value="${h.id}"${String(h.id) === String(F.homeId) ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label></div>
      <div style="display:flex;flex-direction:column;gap:8px"><span class="note" style="font-size:12.5px">Hvilke transaksjoner</span><div class="f42-chips">${chip(F.matchType !== 'merchants', 'Alle fra kontoen', 'data-ir42-mt="all"')}${chip(F.matchType === 'merchants', 'Bare bestemte butikker', 'data-ir42-mt="merchants"')}</div>${F.matchType === 'merchants' ? `<input class="inp" data-ir42="merchants" value="${esc(F.merchants ?? '')}" placeholder="Butikker, f.eks. Biltema, Clas Ohlson, Strömstad Energi" list="ir42-shops"><datalist id="ir42-shops">${[...new Set((S.f42all ?? []).map((t) => t.merchant).filter(Boolean))].slice(0, 80).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:8px"><span class="note" style="font-size:12.5px">Når de kommer inn</span><div class="f42-chips">${chip(F.mode !== 'direct', 'Til gjennomgang (Glimt foreslår kategori)', 'data-ir42-mode="review"')}${chip(F.mode === 'direct', 'Legg rett inn', 'data-ir42-mode="direct"')}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn pri" data-ir42-act="save">Lagre regel</button><button type="button" class="btn" data-ir42-act="cancel">Avbryt</button></div></div>` : '';
  const offer = u.irOffer ? `<div class="box" style="justify-content:space-between;gap:12px;flex-wrap:wrap"><span>Importer også de siste 90 dagene til ${esc(hName(u.irOffer.homeId))}?</span><span style="display:flex;gap:8px"><button type="button" class="btn sm pri" data-ir42-act="backfill">Ja, importer</button><button type="button" class="btn sm" data-ir42-act="nobackfill">Nei takk</button></span></div>` : '';
  const fileBox = `<div class="ir42-r" style="flex-wrap:wrap"><div class="grow"><b>Importer fil til en bolig</b><small>CSV, XLSX eller PDF-kontoutskrift. Alle linjene går til valgt bolig til gjennomgang.</small></div><select class="inp" style="width:auto" data-ir42-fhome aria-label="Bolig">${homes.map((h) => `<option value="${h.id}"${String(h.id) === String(u.irFileHome ?? homes[0]?.id) ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select><label class="btn sm">Velg fil …<input type="file" accept=".csv,.xlsx,.xls,.pdf,.txt" data-ir42-file hidden></label></div>`;
  return `<div class="box ir42" style="flex-direction:column;align-items:stretch"><div class="ir42-h"><span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></span><div><b style="font-size:16px">Import rett til Boliger</b><div class="note" style="font-size:13px">Transaksjoner fra banken legges inn som utgifter i en bestemt bolig.</div></div></div>
    ${R == null ? '<div class="note" style="font-size:13px">Serveren har ikke importregler ennå.</div>' : rows || '<div class="note" style="font-size:13px">Ingen regler ennå.</div>'}
    ${offer}${R != null && !F ? '<button type="button" class="f42-chip more" style="align-self:flex-start" data-ir42-act="new">+ Ny importregel til bolig</button>' : ''}${form}${homes.length ? fileBox : ''}</div>`;
}

/* ---------- Hendelser ---------- */
export function bindGj42(el) {
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { toast(err.message); } };
  el.addEventListener('click', wrap(async (e) => {
    const t = e.target, d = (q) => t.closest(q);
    let x;
    if ((x = d('[data-gj42-task]'))) return startTask(x.dataset.gj42Task);
    if ((x = d('[data-gj42-open]'))) { u.gjOpen = u.gjOpen === x.dataset.gj42Open ? null : x.dataset.gj42Open; const j = all().find((y) => String(y.id) === x.dataset.gj42Open); if (j && !j.result && !j.local) { try { Object.assign(j, norm(await api(`/glimt/tasks/${encodeURIComponent(j.id)}`))); } catch { /* vis det vi har */ } } return paint(); }
    if ((x = d('[data-gj42-pdf]'))) { const j = all().find((y) => String(y.id) === x.dataset.gj42Pdf); if (j) openPdf(j); return; }
    if ((x = d('[data-gj42-del]'))) { const id = x.dataset.gj42Del; G.local = G.local.filter((j) => String(j.id) !== id); if (G.jobs?.some((j) => String(j.id) === id)) { G.jobs = G.jobs.filter((j) => String(j.id) !== id); await api(`/glimt/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}); } return paint(); }
    // Importregler
    if ((x = d('[data-ir42-tog]'))) { const r = S.irRules.find((y) => String(y.id) === x.dataset.ir42Tog); r.enabled = r.enabled === false; render(); await api('/import/home-rules', { method: 'PUT', json: { rules: S.irRules } }); return; }
    if ((x = d('[data-ir42-del]'))) { if (!confirm('Slette regelen? Utgifter som allerede er lagt i boligen beholdes.')) return; S.irRules = S.irRules.filter((y) => String(y.id) !== x.dataset.ir42Del); await api('/import/home-rules', { method: 'PUT', json: { rules: S.irRules } }); return render(); }
    if ((x = d('[data-ir42-mt]')) && u.irForm) { u.irForm.matchType = x.dataset.ir42Mt; return render(); }
    if ((x = d('[data-ir42-mode]')) && u.irForm) { u.irForm.mode = x.dataset.ir42Mode; return render(); }
    const a = d('[data-ir42-act]')?.dataset.ir42Act;
    if (a === 'new') { u.irForm = { accountId: accs()[0]?.id ?? '', homeId: S.irHomes?.[0]?.id ?? '', matchType: 'all', mode: 'review', merchants: '' }; return render(); }
    if (a === 'cancel') { u.irForm = null; return render(); }
    if (a === 'save') {
      const F = u.irForm, rule = { id: `r${Date.now()}`, accountId: +F.accountId || F.accountId, homeId: +F.homeId || F.homeId, matchType: F.matchType, merchants: F.matchType === 'merchants' ? String(F.merchants ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [], mode: F.mode, enabled: true };
      const r = await api('/import/home-rules', { method: 'PUT', json: { rules: [...(S.irRules ?? []), rule] } });
      S.irRules = Array.isArray(r) ? r : r?.rules ?? [...(S.irRules ?? []), rule];
      u.irForm = null; u.irOffer = rule; toast('Regelen er lagret'); return render();
    }
    if (a === 'backfill') { const r = u.irOffer; u.irOffer = null; const res = await api('/import/home-rules/backfill', { method: 'POST', json: { ruleId: r.id, days: 90 } }).catch((err) => (err.status === 404 ? null : Promise.reject(err))); toast(res ? `${res.count ?? res.added ?? 0} transaksjoner sendt til boligen` : 'Serveren kan ikke importere bakover ennå'); return render(); }
    if (a === 'nobackfill') { u.irOffer = null; return render(); }
  }));
  el.addEventListener('change', wrap(async (e) => {
    const t = e.target;
    if (t.dataset.ir42 && u.irForm) { u.irForm[t.dataset.ir42] = t.value; return; }
    if (t.matches('[data-ir42-fhome]')) { u.irFileHome = t.value; return; }
    if (t.matches('[data-ir42-file]')) {
      const f = t.files[0]; t.value = ''; if (!f) return;
      const home = u.irFileHome ?? S.irHomes?.[0]?.id, fd = new FormData(); fd.append('files', f); fd.append('homeId', home);
      try { const r = await api(`/import?home=${encodeURIComponent(home)}&commit=1`, { method: 'POST', body: fd }); toast(`${r.imported ?? r.rows?.length ?? 0} linjer sendt til ${S.irHomes.find((h) => String(h.id) === String(home))?.name ?? 'boligen'} til gjennomgang`); }
      catch (err) { toast(err.message); }
    }
  }));
  el.addEventListener('input', (e) => { if (e.target.dataset.ir42 && u.irForm) u.irForm[e.target.dataset.ir42] = e.target.value; });
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-gj42-form]'); if (!f) return;
    e.preventDefault();
    const q = String(new FormData(f).get('q') ?? '').trim().toLowerCase(); if (!q) return;
    const kind = /abonnement|kutt/.test(q) ? 'subs_cut' : /i fjor|sammenlign/.test(q) ? 'compare_year' : /rydd|kategori/.test(q) ? 'tidy_cats' : 'report';
    const now = new Date(), autumn = /høst/.test(q), summer = /sommer/.test(q);
    const params = autumn ? { filter: { range: [`${now.getFullYear()}-09-01`, `${now.getFullYear()}-11-30`] }, title: `Høsten ${now.getFullYear()}` } : summer ? { filter: { range: [`${now.getFullYear()}-06-01`, `${now.getFullYear()}-08-31`] }, title: `Sommeren ${now.getFullYear()}` } : {};
    return startTask(kind, { ...params, text: q });
  }));
}

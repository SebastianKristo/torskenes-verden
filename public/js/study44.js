// Prompt 44 (claude-code-studie-web-ny.md + claude-code-studie-dokumenter.md): nytt Studie-design på web.
// Fasit: design/Studie Web Ny.dc.html (og Studie Dokumenter.dc.html for fanen Dokumenter). Papir, følger lys/mørk.
// Topp (dato · uke, «Studie», faner Oversikt · Uke · Karakterer · Dokumenter) · Glimt-felt med svar i mørkt kort ·
// Oversikt: Nå-kort, I dag-tidslinje 08–15 med nå-strek, Frister (nedtelling), Karakterer (6-felts stolper), Dokumenter.
// Data: GET /api/study/overview (SERVER44) når den finnes, ellers timeplanen (/api/school, iCal), /api/grades og /api/tests.
// Dokumenter: GET/POST /api/study/documents, POST …/:id/ask {q}, POST …/:id/apply, DELETE …/:id. Snitt kommer fra serveren.
import { esc, api } from './util.js';
import { store, on } from './store.js';

const TABS = [['ov', 'Oversikt'], ['uke', 'Uke'], ['kar', 'Karakterer'], ['dok', 'Dokumenter']];
const TEST_RE = /prøve|test|eksamen|innlevering|tentamen|heldag|muntlig|fremføring|frist|labrapport/i;
const S = { tab: 'ov', q: '', ans: null, asking: false, ov: null, ovAt: 0, docs: null, sel: null, busy: null, steps: [], aq: '', aAns: '', aBusy: false, toast: '', drag: false };
try { const t = sessionStorage.getItem('st44_tab'); if (TABS.some(([k]) => k === t)) S.tab = t; } catch { /* */ }

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const day0 = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d) => d.toLocaleDateString('sv-SE');
const week = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); };
const WD = ['SØN', 'MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR'];
const nbn = (v, d = 1) => Number(v).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------------- Data ---------------- */
function loadOv(force) {
  if (!force && S.ov && Date.now() - S.ovAt < 60_000) return;
  S.ovAt = Date.now();
  api('/study/overview').then((d) => { S.ov = d && typeof d === 'object' ? d : {}; repaint(); }).catch(() => { S.ov = {}; repaint(); });
}
function loadDocs(force) {
  if (S.docs && !force) return;
  api('/study/documents').then((d) => { S.kpi = d?.kpi ?? null; S.docs = (Array.isArray(d) ? d : d?.items ?? d?.documents ?? d?.docs ?? []).map(docOut); if (!S.sel && S.docs[0]) S.sel = S.docs[0].id; repaint(); })
    .catch((e) => { S.docs = []; S.docsErr = e.status === 404 ? 'missing' : ''; repaint(); });
}
const KIND = { vitnemal: 'Vitnemål', vitnemål: 'Vitnemål', diploma: 'Vitnemål', karakterutskrift: 'Karakterutskrift', transcript: 'Karakterutskrift', attest: 'Attest', kursbevis: 'Kursbevis' };
function docOut(x) {
  const d = x?.doc ?? x ?? {};
  const em = (d.emner ?? d.subjects ?? d.rows ?? []).map((r) => Array.isArray(r) ? { kode: r[0], navn: r[1], sp: r[2], karakter: r[3] } : { kode: r.kode ?? r.code ?? '', navn: r.navn ?? r.name ?? '', sp: r.sp ?? r.credits ?? null, karakter: r.karakter ?? r.grade ?? '', semester: r.semester ?? '' });
  return { id: String(d.id ?? ''), kind: String(d.kind ?? d.type ?? '').toLowerCase(), title: d.title ?? d.name ?? d.filename ?? KIND[String(d.kind ?? '').toLowerCase()] ?? 'Dokument', inst: d.institution ?? d.school ?? '', date: d.date ?? d.issued ?? '', created: d.createdAt ?? d.uploadedAt ?? d.at ?? '', ext: String(d.ext ?? (d.mime?.includes('image') ? 'JPG' : 'PDF')).toUpperCase(), summary: d.summary ?? d.sum ?? '', emner: em, snitt: typeof d.snitt === 'object' && d.snitt ? d.snitt.value ?? null : d.snitt ?? d.average ?? null, snittL: (typeof d.snitt === 'object' && d.snitt ? d.snitt.letter : null) ?? d.snittLetter ?? d.letter ?? null, snittT: typeof d.snitt === 'object' && d.snitt ? d.snitt.text ?? '' : '', kindLabel: d.kindLabel ?? '', sp: d.sp ?? d.credits ?? em.reduce((a, r) => a + (+r.sp || 0), 0), found: d.found ?? d.insights ?? d.ins ?? [], status: d.status === 'reading' || d.status === 'pending' || d.status === 'failed' ? d.status : 'done', steps: d.steps ?? null, inst: d.institution ?? d.school ?? '', compare: typeof d.compare === 'object' && d.compare ? d.compare.text ?? null : d.compare ?? null };
}
function events() {
  const ov = S.ov ?? {};
  const raw = Array.isArray(ov.events) ? ov.events : store.data.school?.events ?? [];
  return raw.map((e) => ({ title: e.title ?? e.subject ?? '', room: e.room ?? e.location ?? '', s: new Date(e.start), e: new Date(e.end ?? e.start), allDay: !!e.allDay, deadline: !!e.deadline || TEST_RE.test(e.title ?? '') })).filter((e) => !Number.isNaN(+e.s));
}
function lessons(d) { const k = iso(d); return events().filter((e) => !e.allDay && iso(e.s) === k && !(e.deadline && +e.e === +e.s)).sort((a, b) => a.s - b.s); }
function deadlines() {
  const ov = S.ov ?? {}, now = day0();
  if (Array.isArray(ov.deadlines) && ov.deadlines.length) return ov.deadlines.map((x) => ({ t: x.title ?? x.t ?? '', sub: x.sub ?? x.note ?? x.course ?? '', at: new Date(x.due ?? x.at ?? x.date) })).filter((x) => !Number.isNaN(+x.at) && x.at >= now).sort((a, b) => a.at - b.at).slice(0, 6);
  const fromCal = events().filter((e) => e.deadline && e.s >= now).map((e) => ({ t: e.title, sub: `${WD[e.s.getDay()].toLowerCase().replace(/^./, (c) => c.toUpperCase())} ${e.allDay ? '' : hm(e.s)}${e.room ? ` · ${e.room}` : ''}`.trim(), at: e.s }));
  const manual = (store.tests ?? []).map((t) => ({ t: t.title, sub: t.note ?? 'Lagt inn selv', at: new Date(`${t.date}T12:00`) })).filter((x) => x.at >= now);
  return [...fromCal, ...manual].sort((a, b) => a.at - b.at).slice(0, 6);
}
function grades() {
  const ov = S.ov ?? {};
  const og = Array.isArray(ov.grades) ? ov.grades : ov.grades?.items;
  const g = Array.isArray(og) && og.length ? og.map((x) => ({ n: x.subject ?? x.n ?? '', s: x.sub ?? x.note ?? '', v: +x.grade || +x.v || null })) : (store.grades ?? []).map((x) => ({ n: x.subject, s: x.tests ? `Prøver: ${x.tests}` : '', v: +x.grade || null }));
  return g.filter((x) => x.n);
}
const avg = (L) => { const v = L.filter((x) => x.v); return v.length ? v.reduce((a, x) => a + x.v, 0) / v.length : null; };
const LV = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
function higher() {
  const rows = (S.docs ?? []).flatMap((d) => d.emner.filter((r) => /^[A-F]$/i.test(String(r.karakter)) && +r.sp > 0));
  const sp = rows.reduce((a, r) => a + +r.sp, 0);
  const srv = (S.docs ?? []).find((d) => d.snitt != null && /karakter|transcript/.test(d.kind));
  const sn = srv ? +srv.snitt : sp ? rows.reduce((a, r) => a + (LV[String(r.karakter).toUpperCase()] ?? 0) * +r.sp, 0) / sp : null;
  const letter = sn == null ? null : srv?.snittL ?? 'FEDCBA'[Math.max(0, Math.min(5, Math.round(sn)))];
  return { sp, sn, letter, stryk: rows.filter((r) => /^F$/i.test(r.karakter)).length + grades().filter((x) => x.v === 1).length };
}

/* ---------------- Tegning ---------------- */
const bars = (v) => [1, 2, 3, 4, 5, 6].map((i) => `<span class="${i <= (v ?? 0) ? (v >= 5 ? 'g' : v === 4 ? 'k' : 'y') : ''}"></span>`).join('');
const gCls = (g) => { const s = String(g ?? '').toUpperCase(); return /^[AB]$|^[56]$/.test(s) ? 'ok' : /^[C4]$/.test(s) ? 'mid' : /^[D3]$/.test(s) ? 'warn' : /^[EF12]$/.test(s) ? 'bad' : 'mid'; };
function head() {
  const d = new Date();
  const dt = d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).replace('.', '').toUpperCase();
  return `<header class="st44-top"><div class="st44-tt"><span class="st44-k">${esc(dt)} · UKE ${week(d)}</span><h1>Studie</h1></div>
    <div class="st44-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" data-st44-tab="${k}">${n}</button>`).join('')}</div></header>
    <form class="st44-ask" data-st44-ask><span class="st44-orb" aria-hidden="true"><span></span></span><input name="st44q" value="${esc(S.q)}" placeholder="Spør Glimt: «hva må jeg lese til prøven i engelsk?»" autocomplete="off" aria-label="Spør Glimt om studiet" data-glimt="studie"><button type="submit" ${S.asking ? 'disabled' : ''}>${S.asking ? '…' : '✦ Spør'}</button></form>
    ${S.ans ? `<div class="st44-ans" role="status"><span class="st44-k">GLIMT</span><span class="st44-at">${esc(S.ans)}</span><button type="button" data-st44-x aria-label="Lukk svaret">✕</button></div>` : ''}`;
}
function nowCard() {
  const now = new Date(), L = lessons(now), cur = L.find((e) => e.s <= now && now < e.e);
  const up = events().filter((e) => !e.allDay && e.s > now && !(e.deadline && +e.e === +e.s)).sort((a, b) => a.s - b.s);
  const next = cur ? up[0] : up[0], after = cur ? null : up[1];
  if (cur) {
    const pct = Math.round(((now - cur.s) / (cur.e - cur.s)) * 100), left = Math.max(0, Math.round((cur.e - now) / 60000));
    return `<div class="st44-now"><div class="st44-nh"><span class="st44-k acc">● NÅ${cur.room ? ` · ${esc(cur.room.toUpperCase())}` : ''}</span><span class="mono">${hm(cur.s)}–${hm(cur.e)}</span></div><b class="st44-nb">${esc(cur.title)}</b>
      <div class="st44-np"><span class="st44-bar"><i style="width:${pct}%"></i></span><span>${left} min igjen</span></div>
      ${next ? `<div class="st44-nn"><span class="st44-k">NESTE</span><b>${esc(next.title)}${next.room ? ` · ${esc(next.room)}` : ''}</b><span class="mono">${iso(next.s) === iso(now) ? hm(next.s) : `${WD[next.s.getDay()].toLowerCase()} ${hm(next.s)}`}</span></div>` : ''}</div>`;
  }
  if (next) {
    const mins = Math.round((next.s - now) / 60000), when = mins < 60 ? `om ${mins} min` : mins < 24 * 60 ? `om ${Math.floor(mins / 60)} t ${mins % 60} min` : `${next.s.toLocaleDateString('nb-NO', { weekday: 'long' })} ${hm(next.s)}`;
    return `<div class="st44-now"><div class="st44-nh"><span class="st44-k acc">NESTE TIME${next.room ? ` · ${esc(next.room.toUpperCase())}` : ''}</span><span class="mono">${hm(next.s)}–${hm(next.e)}</span></div><b class="st44-nb">${esc(next.title)}</b>
      <div class="st44-np"><span>Starter ${esc(when)}</span></div>${after ? `<div class="st44-nn"><span class="st44-k">ETTERPÅ</span><b>${esc(after.title)}</b><span class="mono">${hm(after.s)}</span></div>` : ''}</div>`;
  }
  const conf = store.data.school?.configured !== false || S.ov?.events;
  return `<div class="st44-now"><div class="st44-nh"><span class="st44-k acc">TIMEPLAN</span></div><b class="st44-nb sm">${conf ? 'Ingen flere timer' : 'Ingen timeplan ennå'}</b><div class="st44-np"><span>${conf ? 'Ingenting mer på timeplanen de neste dagene.' : 'Legg inn skolens iCal (tp.uio.no eller Canvas) under Innstillinger → Kalendere.'}</span></div>${conf ? '' : '<div class="st44-nn"><button type="button" class="st44-lk" data-st44-cal>Åpne Kalendere ›</button></div>'}</div>`;
}
function todayCard() {
  const now = new Date(), L = lessons(now), H0 = Math.min(8, ...L.map((e) => e.s.getHours())), H1 = Math.min(24, Math.max(15, ...L.map((e) => e.e.getHours() + (e.e.getMinutes() ? 1 : 0))));
  const span = (H1 - H0) * 60, X = (d) => `${Math.max(0, Math.min(100, ((d.getHours() * 60 + d.getMinutes() - H0 * 60) / span) * 100))}%`, W = (a, b) => `${Math.max(2, ((b - a) / 60000 / span) * 100)}%`;
  const end = L.at(-1)?.e;
  const lanes = []; const lane = (e) => { let i = lanes.findIndex((t) => t <= e.s); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = e.e; return i; };
  const blocks = L.map((e, i) => { const ln = lane(e), c = now >= e.s && now < e.e ? 'cur' : ['a', 'b', 'c'][i % 3]; return `<div class="st44-blk ${c}" style="left:${X(e.s)};width:${W(e.s, e.e)};top:${14 + Math.min(ln, 1) * 50}px" title="${esc(`${e.title} ${hm(e.s)}–${hm(e.e)}`)}"><b>${esc(e.title)}</b><span class="mono">${hm(e.s)}–${hm(e.e)}</span></div>`; }).join('');
  const nowIn = now.getHours() >= H0 && now.getHours() < H1;
  const gap = L.slice(1).map((e, i) => [L[i], e]).find(([a, b]) => b.s - a.e >= 25 * 60000 && b.s > now);
  const tip = gap ? `Du har ${Math.round((gap[1].s - gap[0].e) / 60000)} min mellom ${gap[0].title} og ${gap[1].title}.` : deadlines()[0] ? `Neste frist: ${deadlines()[0].t}.` : L.length ? 'God dag på skolen!' : 'Ingen timer i dag.';
  return `<div class="st44-card"><div class="st44-ch"><span class="st44-k">I DAG</span><span class="st44-mut">${L.length ? `${L.length} ${L.length === 1 ? 'time' : 'timer'} · ferdig ${hm(end)}` : 'Fri'}</span></div>
    <div class="st44-tl">${Array.from({ length: H1 - H0 }, (_, i) => `<span class="st44-hl" style="left:${(i / (H1 - H0)) * 100}%"><i>${pad(H0 + i)}</i></span>`).join('')}${blocks}${nowIn ? `<span class="st44-nowl" style="left:${X(now)}" aria-hidden="true"></span>` : ''}</div>
    <span class="st44-tip"><i>✦</i>${esc(tip)}</span></div>`;
}
function dueList(n = 3) {
  const L = deadlines(), today = day0();
  const wk = L.filter((x) => (x.at - today) / 864e5 < 7).length;
  return `<div class="st44-col"><div class="st44-colh"><span class="st44-k acc">FRISTER · ${wk} DENNE UKA</span></div>${L.length ? L.slice(0, n).map((x) => {
    const dd = Math.max(0, Math.round((day0(x.at) - today) / 864e5)), cls = dd <= 2 ? 'r' : dd <= 5 ? 'y' : '';
    return `<div class="st44-due"><span class="st44-dn ${cls}"><b>${dd}</b><i>${dd === 1 ? 'DAG' : 'DAGER'}</i></span><div><b>${esc(x.t)}</b><span>${esc(x.sub)}</span></div></div>`;
  }).join('') : '<span class="st44-mut st44-pad">Ingen frister fremover.</span>'}</div>`;
}
function gradeRows(L) { return L.map((g) => `<div class="st44-gr"><div><b>${esc(g.n)}</b><span>${esc(g.s)}</span></div><span class="st44-bars" aria-label="Karakter ${g.v ?? 'ingen'} av 6">${bars(g.v)}</span><b class="st44-gv">${g.v ?? '–'}</b></div>`).join(''); }
function gradeCol() {
  const G = grades(), a = avg(G);
  return `<div class="st44-col"><div class="st44-colh"><span class="st44-k">KARAKTERER</span><span class="st44-sn">snitt ${a ? nbn(a) : '–'}</span></div>${G.length ? gradeRows(G.slice(0, 3)) : '<span class="st44-mut st44-pad">Ingen karakterer ennå.</span>'}${G.length > 3 ? '<button type="button" class="st44-lk" data-st44-tab="kar">Alle karakterer ›</button>' : ''}</div>`;
}
const docRow = (d, big) => `<button type="button" class="st44-doc${big && S.sel === d.id ? ' on' : ''}" data-st44-doc="${esc(d.id)}"><span class="st44-ext">${esc(d.ext)}</span><div><b>${esc(d.title)}</b><span>${esc([d.inst, d.created ? new Date(d.created).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : '', d.emner.length ? `${d.emner.length} emner` : ''].filter(Boolean).join(' · '))}</span></div><em class="${d.status === 'done' ? '' : 'busy'}">${d.status === 'done' ? '✦ Lest' : 'Leser …'}</em></button>`;
function docCol() {
  loadDocs();
  const D = S.docs ?? [];
  return `<div class="st44-col"><div class="st44-colh"><span class="st44-k">DOKUMENTER · ${D.length}</span><button type="button" class="st44-lk" data-st44-tab="dok">Alle ›</button></div>${D.slice(0, 2).map((d) => docRow(d)).join('')}<button type="button" class="st44-up" data-st44-tab="dok">+ Last opp vitnemål eller utskrift</button></div>`;
}
function ovHtml() { return `<div class="st44-g2">${nowCard()}${todayCard()}</div><div class="st44-g3">${dueList()}${gradeCol()}${docCol()}</div>`; }
function ukeHtml() {
  const now = new Date(), mon = day0(now); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  if (now.getDay() === 6 || now.getDay() === 0) mon.setDate(mon.getDate() + 7);
  const days = Array.from({ length: 5 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  const all = events(), dl = deadlines();
  return `<div class="st44-week">${days.map((d) => {
    const k = iso(d), td = k === iso(now);
    const items = [...all.filter((e) => iso(e.s) === k).sort((a, b) => a.s - b.s).map((e) => ({ n: e.title, t: e.allDay ? 'Hele dagen' : hm(e.s), due: e.deadline })), ...dl.filter((x) => iso(x.at) === k && !all.some((e) => e.title === x.t && iso(e.s) === k)).map((x) => ({ n: x.t, t: 'Frist', due: true }))];
    return `<div class="st44-wd${td ? ' td' : ''}"><div class="st44-wh"><b>${d.getDate()}</b><span class="st44-k">${WD[d.getDay()]}</span></div>${items.length ? items.map((i) => `<div class="st44-wi${i.due ? ' due' : ''}"><b>${esc(i.n)}</b><span class="mono">${esc(i.t)}</span></div>`).join('') : '<span class="st44-mut">Ingenting</span>'}</div>`;
  }).join('')}</div>`;
}
function karHtml() {
  loadDocs();
  const G = grades(), a = avg(G), h = higher();
  const st = [[a ? nbn(a) : '–', 'Snitt videregående'], [h.sn != null ? `${h.letter} (${nbn(h.sn)})` : '–', 'Snitt høyere utdanning'], [h.sp ? nbn(h.sp, h.sp % 1 ? 1 : 0) : '0', 'studiepoeng registrert'], [String(h.stryk), 'Stryk']];
  return `<div class="st44-stats">${st.map(([v, l]) => `<div class="st44-stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
    <div class="st44-card st44-gall">${G.length ? gradeRows(G) : '<span class="st44-mut">Ingen fag ennå. Legg dem inn fra dokumentene dine, eller under Karakterer på den gamle Studie-siden.</span>'}</div>`;
}
function dokHtml() {
  loadDocs();
  const D = S.docs ?? [], cur = D.find((d) => d.id === S.sel) ?? D[0];
  const h = higher(), a = avg(grades()), K = S.kpi;
  if (K?.sp != null && !h.sp) h.sp = +K.sp;
  if (K?.snitt && h.sn == null) { h.sn = +(K.snitt.value ?? K.snitt); h.letter = K.snitt.letter ?? h.letter; }
  const stats = [[h.sp ? nbn(h.sp, h.sp % 1 ? 1 : 0) : '0', 'studiepoeng registrert'], [h.sn != null ? `${h.letter} (${nbn(h.sn)})` : '–', 'snitt høyere utdanning'], [a ? nbn(a) : '–', 'snitt videregående'], [String(D.length), 'dokumenter']];
  const busy = S.busy ? `<div class="st44-busy" role="status"><b>Glimt leser «${esc(S.busy)}» …</b>${S.steps.map((x) => `<span><i>✓</i>${esc(x.n)}<em class="mono">${esc(x.ms)}</em></span>`).join('')}<span class="st44-spin"><i></i>${S.steps.length ? 'Leser videre …' : 'Laster opp …'}</span></div>` : '';
  const left = `<div class="st44-dl"><label class="st44-drop${S.drag ? ' on' : ''}" data-st44-drop><b>Slipp vitnemål, karakterutskrift eller attest</b><span>PDF eller bilde (JPG, PNG, HEIC). Glimt leser fagene, karakterene og studiepoengene. Lagres kryptert på hjemmeserveren.</span><span class="st44-pick">Velg fil</span><input type="file" accept="application/pdf,image/*,.heic" multiple hidden data-st44-file></label>${busy}
    ${S.docsErr === 'missing' ? '<span class="st44-mut">Serveren har ikke dokumentlesing ennå. Oppdater Nordlys først.</span>' : ''}${D.map((d) => docRow(d, true)).join('')}</div>`;
  const right = cur ? `<div class="st44-card st44-dr"><span class="st44-k acc">✦ GLIMT HAR LEST</span><b class="st44-dt">${esc(cur.title)}</b><span class="st44-mut">${esc([cur.inst, cur.date, KIND[cur.kind] ?? ''].filter(Boolean).join(' · '))}</span>
      ${cur.summary ? `<p class="st44-sum">${esc(cur.summary)}</p>` : ''}
      ${cur.emner.length ? `<div class="st44-tab"><div class="st44-th"><span>KODE</span><span>FAG</span><span>SP</span><span>KAR.</span></div>${cur.emner.map((r) => `<div class="st44-tr"><span class="mono">${esc(r.kode)}</span><span class="ell">${esc(r.navn)}</span><span class="mono">${r.sp == null || r.sp === '' ? '–' : esc(String(r.sp).replace('.', ','))}</span><span class="st44-gc ${gCls(r.karakter)}">${esc(r.karakter || '–')}</span></div>`).join('')}</div>` : ''}
      ${cur.snitt != null ? `<span class="st44-mut">Snitt ${esc(cur.snittL ?? '')} ${esc(nbn(cur.snitt))} · ${esc(String(cur.sp).replace('.', ','))} sp (regnet ut på serveren)</span>` : ''}
      ${cur.found?.length ? `<div class="st44-found"><span class="st44-k">GLIMT FANT</span>${cur.found.map((t) => `<span><i>✦</i>${esc(typeof t === 'string' ? t : t.text ?? t.t ?? '')}</span>`).join('')}</div>` : ''}
      <form class="st44-dask" data-st44-dask><input name="st44aq" value="${esc(S.aq)}" placeholder="Spør om dokumentet, f.eks. «hva er snittet i matte?»" autocomplete="off" data-glimt="studie"><button type="submit" ${S.aBusy ? 'disabled' : ''}>${S.aBusy ? '…' : 'Spør'}</button></form>${S.aAns ? `<span class="st44-aans">${esc(S.aAns)}</span>` : ''}
      <div class="st44-btns"><button type="button" class="st44-b dark" data-st44-apply ${cur.emner.length ? '' : 'disabled'}>Legg emner i Studie</button><a class="st44-b" href="/api/study/documents/${encodeURIComponent(cur.id)}/file?copy=1" target="_blank" rel="noopener">Del som PDF</a><button type="button" class="st44-b red" data-st44-del>Slett</button></div></div>`
    : `<div class="st44-card st44-dr"><span class="st44-k acc">✦ GLIMT LESER</span><b class="st44-dt">Ingen dokumenter ennå</b><p class="st44-sum">Last opp et vitnemål eller en karakterutskrift. Glimt finner skole, dato og type, leser fag og karakterer, og regner ut snitt og studiepoeng. Bare du ser dokumentene.</p></div>`;
  return `<div class="st44-stats sm">${stats.map(([v, l]) => `<div class="st44-stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div><div class="st44-dok">${left}${right}</div>`;
}
function body() { return S.tab === 'uke' ? ukeHtml() : S.tab === 'kar' ? karHtml() : S.tab === 'dok' ? dokHtml() : ovHtml(); }

export function render() {
  loadOv();
  bindOnce();
  return `<div class="st44" data-st44>${head()}<div class="st44-body" data-st44-body>${body()}</div>${S.toast ? `<div class="st44-toast" role="status">${esc(S.toast)}</div>` : ''}</div>`;
}
function repaint() {
  const r = document.querySelector('[data-st44]');
  if (!r) return;
  const act = document.activeElement, nm = r.contains(act) ? act.name : null, pos = nm ? act.selectionStart : null;
  const tmp = document.createElement('div'); tmp.innerHTML = render();
  r.replaceWith(tmp.firstElementChild);
  if (nm) { const n = document.querySelector(`[data-st44] [name="${nm}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* */ } } }
}
function toast(t) { S.toast = t; repaint(); clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = ''; repaint(); }, 2600); }

/* ---------------- Glimt ---------------- */
function local(q) {
  const s = q.toLowerCase();
  if (/frist|innlever|levere/.test(s)) { const L = deadlines(); return L.length ? `Neste frist er ${L[0].t} ${L[0].at.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}.${L[1] ? ` Deretter ${L[1].t}.` : ''}` : 'Du har ingen frister fremover.'; }
  if (/snitt|karakter/.test(s) && !/dokument/.test(s)) { const G = grades(), a = avg(G); if (!a) return null; const low = [...G].filter((g) => g.v).sort((x, y) => x.v - y.v)[0]; return `Snittet ditt er ${nbn(a)}.${low ? ` Svakest er ${low.n} (${low.v}).` : ''}`; }
  if (/neste time|hva har jeg nå|time nå/.test(s)) { const n = events().filter((e) => e.s > new Date() && !e.allDay)[0]; return n ? `Neste time er ${n.title} ${n.s.toLocaleDateString('nb-NO', { weekday: 'long' })} kl. ${hm(n.s)}${n.room ? ` i ${n.room}` : ''}.` : 'Ingen timer på timeplanen fremover.'; }
  return null;
}
async function ask(q) {
  q = q.trim(); if (!q) return;
  S.q = q; const l = local(q);
  if (l) { S.ans = l; repaint(); return; }
  S.asking = true; repaint();
  try {
    let r = await api('/assist', { method: 'POST', json: { q: `Studie: ${q}`, source: 'search', scope: 'studie' } });
    for (let i = 0; r && !r.text && r.jobId && i < 30; i++) { await new Promise((ok) => setTimeout(ok, 1000)); const j = await api(`/assist/${encodeURIComponent(r.jobId)}`).catch(() => null); if (j?.answer?.text || j?.text) r = j.answer ?? j; else if (j?.state === 'failed') break; }
    S.ans = r?.text?.replace(/\*\*/g, '') || 'Glimt fant ikke noe svar på det ennå.';
  } catch (e) { S.ans = `Glimt svarte ikke: ${e.message}`; }
  S.asking = false; repaint();
}

/* ---------------- Dokumenter ---------------- */
async function upload(files) {
  for (const f of files) {
    const t0 = performance.now();
    S.busy = f.name; S.steps = []; S.tab = 'dok'; repaint();
    try {
      const fd = new FormData(); fd.append('file', f, f.name);
      const r = await fetch('/api/study/documents', { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
      if (!r.ok) throw new Error(r.status === 404 ? 'Serveren har ikke dokumentlesing ennå.' : j?.error || `Serveren svarte ${r.status}`);
      S.steps.push({ n: 'Lastet opp og kryptert', ms: `${Math.round(performance.now() - t0)} ms` });
      let d = docOut(j);
      // Glimt leser i bakgrunnen: vis stegene serveren melder, med ekte tid.
      for (let i = 0; d.status !== 'done' && d.status !== 'failed' && d.id && i < 90; i++) {
        repaint(); await new Promise((ok) => setTimeout(ok, 1500));
        const k = await api(`/study/documents/${encodeURIComponent(d.id)}`).catch(() => null); if (k) d = docOut(k);
        if (Array.isArray(d.steps)) S.steps = [S.steps[0], ...d.steps.map((x) => ({ n: x.label ?? x.n ?? x.name ?? '', ms: x.ms != null ? `${x.ms} ms` : '' }))];
      }
      if (Array.isArray(d.steps) && S.steps.length < 2) S.steps.push(...d.steps.map((x) => ({ n: x.label ?? x.n ?? '', ms: x.ms != null ? `${x.ms} ms` : '' })));
      S.docs = [d, ...(S.docs ?? []).filter((x) => x.id !== d.id)]; S.sel = d.id;
      toast(d.status === 'failed' ? `Glimt fikk ikke lest «${d.title}»` : `✦ Glimt leste «${d.title}»${d.compare ? ` · ${d.compare}` : ''}`);
    } catch (e) { toast(e.message); }
    S.busy = null; S.steps = []; repaint();
  }
}

let bound = false;
function bindOnce() {
  if (bound) return; bound = true;
  const inSt = (e) => e.target.closest?.('[data-st44]');
  document.addEventListener('click', async (e) => {
    if (!inSt(e)) return;
    const x = (s) => e.target.closest(s); let b;
    if ((b = x('[data-st44-tab]'))) { S.tab = b.dataset.st44Tab; try { sessionStorage.setItem('st44_tab', S.tab); } catch { /* */ } repaint(); return; }
    if (x('[data-st44-x]')) { S.ans = null; repaint(); return; }
    if (x('[data-st44-cal]')) { document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'kal' })); return; }
    if ((b = x('[data-st44-doc]'))) { S.sel = b.dataset.st44Doc; S.tab = 'dok'; S.aAns = ''; S.aq = ''; repaint(); return; }
    if (x('[data-st44-apply]')) { try { const r = await api(`/study/documents/${encodeURIComponent(S.sel)}/apply`, { method: 'POST', json: {} }); toast(`${r?.added ?? r?.count ?? 'Emnene'} ${r?.added === 1 ? 'emne' : 'emner'} lagt i Studie`); const { loadStudy } = await import('./study.js'); loadStudy(); } catch (er) { toast(er.message); } return; }
    if (x('[data-st44-del]')) { const d = S.docs?.find((y) => y.id === S.sel); if (!d || !confirm(`Slette «${d.title}»? Filen, teksten og det Glimt har lest slettes.`)) return; try { await api(`/study/documents/${encodeURIComponent(d.id)}`, { method: 'DELETE' }); S.docs = S.docs.filter((y) => y.id !== d.id); S.sel = S.docs[0]?.id ?? null; toast('Slettet'); } catch (er) { toast(er.message); } return; }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.matches('[data-st44-ask]')) { e.preventDefault(); ask(e.target.querySelector('[name="st44q"]').value); return; }
    if (e.target.matches('[data-st44-dask]')) {
      e.preventDefault(); const q = e.target.querySelector('[name="st44aq"]').value.trim(); if (!q || !S.sel) return;
      S.aq = q; S.aBusy = true; repaint();
      try { const r = await api(`/study/documents/${encodeURIComponent(S.sel)}/ask`, { method: 'POST', json: { q } }); S.aAns = r?.answer ?? r?.text ?? 'Fant ikke svaret i dokumentet.'; } catch (er) { S.aAns = er.message; }
      S.aBusy = false; repaint();
    }
  });
  document.addEventListener('input', (e) => { if (!inSt(e)) return; if (e.target.name === 'st44q') S.q = e.target.value; if (e.target.name === 'st44aq') S.aq = e.target.value; });
  document.addEventListener('change', (e) => { if (e.target.matches?.('[data-st44-file]')) { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) upload(f); } });
  document.addEventListener('dragover', (e) => { const d = e.target.closest?.('[data-st44-drop]'); if (!d) return; e.preventDefault(); if (!S.drag) { S.drag = true; d.classList.add('on'); } });
  document.addEventListener('dragleave', (e) => { const d = e.target.closest?.('[data-st44-drop]'); if (d && !d.contains(e.relatedTarget)) { S.drag = false; d.classList.remove('on'); } });
  document.addEventListener('drop', (e) => { const d = e.target.closest?.('[data-st44-drop]'); if (!d) return; e.preventDefault(); S.drag = false; const f = [...(e.dataTransfer?.files ?? [])]; if (f.length) upload(f); });
  on('school', repaint); on('study', repaint);
  setInterval(() => { if (document.querySelector('[data-st44]') && !document.hidden && S.tab === 'ov' && !document.activeElement?.closest?.('[data-st44]')) repaint(); }, 60_000);
}

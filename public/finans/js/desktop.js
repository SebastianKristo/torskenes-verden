// FinansHub desktop. Alle sider tegnes fra S (core.js); hendelser fanges med delegering på roten.
import { scrollMemory } from '/assets/js/scrollmem.js';
import { agent, agentFull, isPlain } from '/assets/js/glimt-agent45.js'; // prompt 45: felles Glimt-agent
import {
  S, api, esc, n0, n2, sgn, neg, neg0, k, dd, dLong, today, monthName, cap, shiftMonth, ini, rgba, greet, pctChange, parseAmount,
  render, toast, loadBoot, loadSummary, loadTx, loadReceipts, loadRecurring, loadReport, loadAi, catById, cats, accs, uploadReceipt,
  smooth, spark, conic, icon, logo, aiLine, ICONS, loadLogoRegistry, sheetBtn,
} from './core.js';
import { reanalyzeBtn, bindReanalyze } from './reanalyze.js';
import { clearBtn, bindSearchFields } from '/assets/js/searchfield.js';
import { bindSuggest } from './fsuggest.js';
import { linesOf, matchLines, markText, hlBanner, hlList, hlImage, hlFocus } from './rc-hl.js';
import { MODULE_PAGES, MODULE_SUB, MODULE_FN, MODULE_LOADERS, bolSettings, loadBolSettings, bindModules, backupTab, firstRunCard, loadBackup, impPage, finnImportBox, loadImpTpl, aksSettings, loadStocksSettings } from './modules.js';
import { addedLine, linesEditor, bindEditor, rereadBtn, glimtFrom, glimtCard, isStandardQ, saveLines, editorDirty } from './fin40.js'; // prompt 40
// Prompt 42: Glimt-orben, ny logo og fargede menyikoner, Boliger 2a + 1b, Filter, Glimt-oppgaver og import til Boliger.
import { orb, brandMark, navTile, thinkHtml, askStream } from './fin42.js';
import { bolScope, bolSearch, afterB42 } from './bol42.js';
import { filterPage, loadFilter, bindFilter, enterFilter } from './filter42.js';
import { tasksCard, loadTasks, bindGj42, startTask, homeRulesBox, loadHomeRules } from './gj42.js';
import { form48, via48, uncTag48, uncCls48, is48, flush48, bind48, setRedraw48, _e48 } from './scan48.js'; // prompt 48: skjemaet for skannede kvitteringer
import { srcTag51, raw51, bind51, learn51 } from './rcpt51.js'; // prompt 51: kilden til butikknavnet, «Rådata» og læring av butikknavn
import { rcPanel52, rcpBefore52, rcpAfter52, rcpGone52 } from './rcpanel52.js'; // prompt 52 (WEB52F): felles kvitteringspanel

ICONS.ai = 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z';
ICONS.filter = 'M4 6h16M7 12h10M10 18h4';
const BASE_PAGES = [['ov', 'Oversikt'], ['tx', 'Transaksjoner'], ['ai', 'Glimt'], ['filter', 'Filter'], ['kv', 'Kvitteringer'], ['bud', 'Budsjett'], ['fast', 'Faste utgifter'], ['konto', 'Kontoer'], ['rap', 'Rapporter'], ['inn', 'Innstillinger']];
// Import ligger bare under Innstillinger → Import (prompt 14), ikke i sidemenyen.
const NAV_DEFAULT = ['ov', 'tx', 'ai', 'filter', 'kv', 'bud', 'fast', 'konto', 'aks', 'rap', 'sub', 'dir', 'finn', 'inn'];
const NAV_NEVER = ['imp'];
const NAV_FIXED = ['ov', 'inn'];
const PAGES = [...BASE_PAGES, ...MODULE_PAGES];
const defaultName = (p) => PAGES.find(([x]) => x === p)?.[1] ?? p;
// Egne navn fra Innstillinger → Sidemeny (finSideNav.labels i /api/me/layout, ellers FinansHubs prefs).
// Prompt 24: sidemenyobjektet heter finSideNav; finNav er nå fanelisten i mobilprofilene (en liste). Eldre servere: finNav som objekt.
const sideCfg = () => S.layout?.finSideNav ?? (S.layout?.finNav && !Array.isArray(S.layout.finNav) ? S.layout.finNav : null);
const navLabels = () => sideCfg()?.labels ?? S.boot?.navLabels ?? {};
const pageName = (p) => navLabels()[p] || defaultName(p);
const ACC_TYPES = { checking: 'Brukskonto', savings: 'Sparekonto', credit: 'Kredittkort', cash: 'Kontanter' };
const KINDS = { expense: 'Utgift', income: 'Inntekt', transfer: 'Overføring' };
const root = () => document.getElementById('app');
const u = S.ui;
const card = (inner, cls = '', style = '') => `<section class="card ${cls}" style="${style}">${inner}</section>`;
const skel = (h = 120) => `<div class="skel" style="min-height:${h}px"></div>`;
const amtColor = (v) => (v > 0 ? 'var(--pos)' : 'var(--text)');
const catColor = (id) => catById(id)?.color ?? '#A0A0AA';
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
const catOpts = (sel, kind) => cats(kind).map((c) => opt(c.id, c.name, sel)).join('');
const accOpts = (sel, empty) => (empty ? opt('', empty, sel) : '') + accs().map((a) => opt(a.id, a.name, sel)).join('');

/* ===================== Skall ===================== */

// Sidemenyen er personlig: rekkefølge og skjulte punkter redigeres i Innstillinger → Sidemeny og lagres i
// /api/me/layout (finSideNav), med FinansHubs egne prefs som reserve. Oversikt og Innstillinger kan ikke skjules.
function navCfg() {
  const def = (S.boot.navDefault ?? NAV_DEFAULT).filter((p) => PAGES.some(([x]) => x === p) && !NAV_NEVER.includes(p));
  // Prompt 42: Filter ligger rett under Glimt, også når serverens standardliste ikke kjenner siden ennå.
  if (!def.includes('filter')) def.splice(def.includes('ai') ? def.indexOf('ai') + 1 : 2, 0, 'filter');
  if (!def.includes('plan')) def.splice(def.includes('sub') ? def.indexOf('sub') + 1 : def.length - 1, 0, 'plan'); // prompt 51 (FIN51): Planlegging etter Subscription OS
  const fin = sideCfg();
  const saved = (fin?.order?.length ? fin.order : S.boot.nav) ?? def;
  // Fjernede sider faller bort; nye (AI-søk, Import) settes inn etter nærmeste side foran dem i standardrekkefølgen.
  const keep = [...new Set(saved.filter((p) => def.includes(p)))];
  def.forEach((p, i) => { if (keep.includes(p)) return; const before = def.slice(0, i).reverse().find((x) => keep.includes(x)); keep.splice(before ? keep.indexOf(before) + 1 : 0, 0, p); });
  const order = keep;
  const hidden = (fin?.hidden ?? S.boot.navHidden ?? []).filter((p) => order.includes(p) && !NAV_FIXED.includes(p));
  return { order: u.cfgOrder ?? order, hidden };
}
const navOrder = () => { const { order, hidden } = navCfg(); return order.filter((p) => !hidden.includes(p)); };
function sideNav() {
  const b = S.boot;
  const items = navOrder().map((p) => `<a href="#/${p}" title="${esc(pageName(p))}" ${p === u.page ? 'aria-current="page"' : ''}>${navTile(p, p === u.page, icon(p, 18, 'currentColor', 1.9))}<span>${esc(pageName(p))}</span>${p === 'kv' && b.reviewCount ? `<span class="badge">${b.reviewCount}</span>` : ''}</a>`).join('');
  return `<div class="side-label">Generelt</div><nav class="nav">${items}</nav>`;
}

// ✦ AI-søk: svar med sammendrag og treff fra transaksjoner, kvitteringer og varelinjer.
function aiPanel() {
  const a = u.ai;
  if (!a) return '';
  if (a.glimt && !a.busy) return glimtCard(a.glimt, logo, a.think); // prompt 40: ryddig svar med kort (prompt 42: + tankesteg)
  // Prompt 30: treffet tar med seg søkeordet (matchedText fra serveren, ellers spørsmålet), så kvitteringslinjen markeres.
  const hlOf = (h) => (h.lineIndex?.length || h.matchedText ? ` data-hl="${esc(h.matchedText || a.q || '')}"` : '');
  const hits = (a.hits ?? []).map((h) => `<button class="ai-hit" ${h.txId ? `data-open-tx="${h.txId}"` : h.receiptId ? `data-open-rc="${esc(h.receiptId)}"` : ''}${hlOf(h)}><span class="dot" style="background:${esc(h.color ?? '#A0A0AA')}"></span>
    <span class="grow"><span style="font-weight:500">${esc(h.description)}</span> <span class="note" style="font-size:12.5px">· ${dd(h.date)} · ${esc(h.source)}</span><span class="ai-why">${esc(h.reason ?? '')}</span></span>
    <span class="mono" style="white-space:nowrap">${h.amount != null ? sgn(h.amount) + ' kr' : '–'}</span></button>`).join('');
  return `<section class="card ai-panel"><div class="card-h" style="align-items:flex-start"><div style="min-width:0"><div class="ai-k" style="display:flex;align-items:center;gap:8px">${orb(22, !!a.busy)}GLIMT</div>${a.q ? `<div class="ai-q">${esc(a.q)}</div>` : '<div class="ai-q">Spør om økonomien din på vanlig norsk</div>'}</div><button class="x-btn" data-act="ai-close" aria-label="Lukk">×</button></div>
    ${a.busy ? (a.think ? thinkHtml(a.think) : aiProgress(a)) : ''}
    ${a.aiUnavailable ? `<div class="ai-note">${esc(a.notice ?? 'Glimt svarer ikke, så dette er vanlig søk.')}</div>` : ''}
    ${a.plainFirst ? `<div class="ai-note ai-plain">${esc(a.notice)} <button class="btn sm ghost" data-act="ai-force">✦ Spør Glimt likevel</button></div>` : ''}
    ${a.answer ? `<div class="ai-a">${aiText(a.answer)}</div>` : ''}${aiSubs(a)}${aiSources(a)}${hits ? `<div class="ai-hits">${hits}</div>` : ''}${a.noMoreSure && !a.busy ? `<div class="note ai-nomore">${esc(a.noMoreSureText || 'Ingen flere sikre treff')}</div>` : ''}
    ${aiChips(a.q ? 'Prøv også' : '', a.followUps)}${aiChips(a.q ? 'Flere forslag' : '', (a.suggestions ?? []).filter((g) => !(a.followUps ?? []).includes(g)))}</section>`;
}
// Prompt 32 (claude-code-ai-sok-abonnementer.md): ingen «[n]»/«[1]»-markører, **Ja.** fet, abonnement-kort og kilder som rader.
const aiText = (t) => esc(String(t ?? '').replace(/\s*\[(?:n|\d+(?:\s*,\s*\d+)*)\]/gi, '').replace(/\s+([.,;:!?])/g, '$1').trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const subHref = (x) => { const m = String(x.url ?? '').match(/#\/abonnement\/?(\d+)?/); return m ? `#/sub${m[1] ? `/${m[1]}` : ''}` : x.url || '#/sub'; };
function aiSubs(a) {
  const L = a.subscriptions ?? [];
  if (!L.length) return '';
  const tot = a.monthlyTotal != null && L.length > 1 ? `<div class="ai-subtot"><span>Sum per måned</span><b class="mono">${n0(a.monthlyTotal)} kr</b></div>` : '';
  return `<div class="ai-subs">${L.map((x) => {
    const lg = logo({ name: x.name, domain: x.domain }, 40, 12);
    const st = x.status && x.status !== 'aktiv' ? `<span class="ai-sub-st ${x.status === 'prøve' ? 'trial' : ''}">${esc(x.status === 'prøve' ? `Prøve${x.daysLeft != null ? ` · ${x.daysLeft} d igjen` : ''}` : x.status)}</span>` : '';
    const inc = (x.includes ?? []).length ? `<span class="ai-sub-inc">Inkluderer ${esc(x.includes.join(', '))}</span>` : '';
    return `<a class="ai-sub" href="${esc(subHref(x))}">${lg}<span class="grow"><span class="ai-sub-t"><b>${esc(x.name)}</b>${x.plan ? `<span class="note"> · ${esc(x.plan)}</span>` : ''}${st}</span>
      <span class="note">${x.price != null ? `${esc(n0(x.price))} kr${x.perLabel ? `${String(x.perLabel).startsWith('/') ? '' : '/'}${esc(x.perLabel)}` : ''}` : ''}${x.nextLabel || x.nextDate ? ` · neste trekk ${esc(x.nextLabel || dd(x.nextDate))}` : ''}</span>${inc}</span><span class="ai-sub-open">${esc(x.openLabel || 'Åpne i Abonnement ›')}</span></a>`;
  }).join('')}${tot}</div>`;
}
function aiSources(a) {
  const L = (a.sources ?? []).filter((x) => x && x.title);
  if (!L.length) return '';
  const lab = { abonnement: 'Abonnement', 'prøve': 'Prøveperiode', tx: 'Transaksjon', kvittering: 'Kvittering', receipt: 'Kvittering', vare: 'Varelinje' };
  return `<div class="ai-k" style="margin-top:2px">Kilder</div><div class="ai-srcs">${L.slice(0, 8).map((x) => `<${x.txId ? `button type="button" data-open-tx="${esc(x.txId)}"` : 'div'} class="ai-src"><span class="ai-src-k">${esc(lab[x.type] ?? x.type ?? '')}</span><span class="grow ell"><b>${esc(x.title)}</b>${x.sub ? `<span class="note"> · ${esc(x.sub)}</span>` : ''}</span>${x.amount != null ? `<span class="mono">${esc(n0(x.amount))} kr</span>` : ''}${x.date ? `<span class="note mono">${esc(dd(x.date))}</span>` : ''}</${x.txId ? 'button' : 'div'}>`).join('')}</div>`;
}
if (!document.getElementById('ai-sub32-css')) {
  const st = document.createElement('style'); st.id = 'ai-sub32-css';
  st.textContent = `.ai-a b{font-weight:700}.ai-subs{display:flex;flex-direction:column;gap:8px}
.ai-sub{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--inner);color:var(--text);text-decoration:none;border:1px solid var(--sep)}
.ai-sub:hover{border-color:var(--warm-line,var(--sep))}.ai-sub .grow{display:flex;flex-direction:column;gap:2px;min-width:0}
.ai-sub-t{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.ai-sub-t b{font-weight:600;font-size:15px}
.ai-sub-lg{position:relative;flex:none;width:40px;height:40px;border-radius:12px;overflow:hidden;background:var(--card,#fff);display:grid;place-items:center;font-weight:700}
.ai-sub-lg img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff}
.ai-sub-st{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--sep);color:var(--text)}.ai-sub-st.trial{background:#b23a2a;color:#fff}
.ai-sub-inc{font-size:12.5px;color:var(--muted,var(--text-2))}.ai-sub-open{flex:none;font-size:13px;font-weight:600;color:var(--acc)}
.ai-subtot{display:flex;justify-content:space-between;padding:4px 14px 0;font-size:13.5px}
.ai-srcs{display:flex;flex-direction:column;border-radius:14px;border:1px solid var(--sep);overflow:hidden}
.ai-src{display:flex;align-items:center;gap:12px;padding:9px 14px;border:0;border-bottom:1px solid var(--sep);background:transparent;color:var(--text);text-align:left;font:inherit;font-size:13.5px;width:100%}
.ai-src:last-child{border-bottom:0}button.ai-src{cursor:pointer}button.ai-src:hover{background:var(--inner)}
.ai-src-k{flex:none;width:96px;font:600 10.5px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,var(--text-2))}
.ai-src .grow{min-width:0}.ai-nomore{font-size:13px}`;
  document.head.appendChild(st);
}
// Prompt 25: jobbmodus. «✦ Ollama tenker … 34 s av 60 s» med fremdriftslinje og Avbryt mens svaret lages.
function aiProgress(a) {
  const j = a.job ?? {}, el = Math.max(0, Math.round(j.elapsedS ?? (Date.now() - (a.t0 ?? Date.now())) / 1000)), lim = j.limitS ?? a.limitGuess ?? null;
  const eng = j.engine ?? a.engineGuess;
  const text = String(j.text ?? '').replace(/^✦?\s*\w+ tenker/, 'Glimt tenker') || `Glimt tenker … ${el} s${lim ? ` av ${lim} s` : ''}${eng ? ` · ${eng}` : ''}`;
  const pct = lim ? Math.min(100, Math.round((el / lim) * 100)) : null;
  return `<div class="ai-job" data-ai-job><div style="display:flex;align-items:center;gap:10px">${orb(20, true)}<span class="sub" style="font-size:14px;flex:1;min-width:0" data-ai-job-text>${esc(String(text).replace(/^✦\s*/, ''))}</span><button class="btn sm ghost" data-act="ai-cancel">Avbryt</button></div>
    <div style="height:4px;border-radius:2px;background:var(--line);overflow:hidden;margin-top:10px"><span data-ai-job-bar style="display:block;height:100%;width:${pct ?? 0}%;background:var(--acc);transition:width .4s linear${pct == null ? ';opacity:.5;width:30%;animation:aiIndet 1.4s ease-in-out infinite' : ''}"></span></div></div>`;
}
if (!document.getElementById('ai-job-css')) {
  const st = document.createElement('style'); st.id = 'ai-job-css';
  st.textContent = '@keyframes aiIndet{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}';
  document.head.appendChild(st);
}
const aiChips = (title, list) => ((list ?? []).length ? `${title ? `<div class="ai-k" style="margin-top:2px">${title}</div>` : ''}<div class="ai-sugg">${list.map((g) => `<button data-ai-q="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : '');
// /search/suggestions svarer {groups, items}; eldre servere svarer med en liste.
const suggList = (r) => (Array.isArray(r) ? r : r?.items ?? []);

/* ===================== Tema og kompakt sidemeny (prompt 13) ===================== */

// Temaene fra «FinansHub v3 Temaer». Valget lagres per bruker i /api/me/layout (design, compactNav), med localStorage
// som reserve når serveren ikke kjenner feltene ennå. Prompt 42: det gamle mørke/oransje FinansHub v2-designet er slettet;
// står design på 'v2' (lokalt eller i profilen), flyttes brukeren til Papir (lys) ved neste innlasting.
export const THEMES = {
  lys: { name: 'Lys hovedbok · standard', desc: 'Papirtone, grønn aksent, serif-tall', bg: '#f4f1ea', side: '#ece7dc', surf: '#faf8f3', line: '#e2ddd2', ink: '#1c1b19', faint: '#8a8478', acc: '#1f4d3a', warn: '#c8553d', d: "'Instrument Serif',serif", dw: 400, rs: '6px', meta: '#f4f1ea' },
  mork: { name: 'Mørk hovedbok', desc: 'Samme oppsett i mørkt, mintgrønn aksent', bg: '#121210', side: '#0d0d0c', surf: '#1a1a17', line: '#2a2925', ink: '#ece8df', faint: '#8a8478', acc: '#6fbf8e', warn: '#e07a5f', d: "'Instrument Serif',serif", dw: 400, rs: '6px', meta: '#121210' },
  glod: { name: 'Glød', desc: 'Varm mørk, ravgul aksent, myke kort', bg: '#16110e', side: '#120e0b', surf: '#221a15', line: '#2c221c', ink: '#f3ebe3', faint: '#9c8f84', acc: '#ffb547', warn: '#ff7a59', d: "'Bricolage Grotesque',sans-serif", dw: 600, rs: '8px', meta: '#16110e' },
};
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
// Rekkefølge (prompt 22): brukerens lagrede valg fra serveren, så lokal cache fh_design, så «lys» (Lys hovedbok) som standard.
export const design = () => [S.layout?.design, lsGet('fh_design')].find((v) => THEMES[v]) ?? 'lys';
let v2Moved = false;
function migrateV2() {
  if (v2Moved) return;
  const old = S.layout?.design === 'v2' || lsGet('fh_design') === 'v2';
  if (!old) return;
  v2Moved = true;
  lsSet('fh_design', 'lys');
  if (S.layout?.design === 'v2') { S.layout.design = 'lys'; fetch('/api/me/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design: 'lys' }) }).catch(() => {}); }
}
const compactNav = () => (typeof S.layout?.compactNav === 'boolean' ? S.layout.compactNav : lsGet('fh_compact') === '1');
// Setter tema-attributtene på <html>. Mobil har egne design, så temaene gjelder bare desktop (CSS er avgrenset med data-ui).
export function applyTheme() {
  migrateV2();
  const h = document.documentElement, d = design();
  if (h.dataset.theme !== d) h.dataset.theme = d;
  // Serverens valg caches lokalt, så neste lasting starter i riktig tema uten å blinke.
  if (THEMES[S.layout?.design] && lsGet('fh_design') !== d) lsSet('fh_design', d);
  h.setAttribute('data-v3', '');
  h.toggleAttribute('data-compact', compactNav());
  const m = document.querySelector('meta[name=theme-color]');
  if (m && h.dataset.ui === 'desktop') m.content = THEMES[d].meta;
}
async function saveLayout(patch) {
  S.layout = { ...(S.layout ?? {}), ...patch };
  if ('design' in patch) { lsSet('fh_design', patch.design); try { sessionStorage.setItem('fh_jump', '1'); } catch {} }
  if ('compactNav' in patch) lsSet('fh_compact', patch.compactNav ? '1' : '0');
  applyTheme();
  render();
  if (S.layoutOk === false) return;
  const r = await fetch('/api/me/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null);
  if (r && !r.ok && r.status !== 404) toast('Valget er lagret i denne nettleseren');
}
const thPrev = (t) => `<span class="th-prev" style="--p-bg:${t.bg};--p-side:${t.side};--p-surf:${t.surf};--p-line:${t.line};--p-ink:${t.ink};--p-faint:${t.faint};--p-acc:${t.acc};--p-warn:${t.warn};--p-d:${t.d};--p-dw:${t.dw};--p-rs:${t.rs}">
  <span class="ps"><i></i><i></i><i style="width:80%"></i><i style="width:70%"></i><i style="width:85%"></i></span>
  <span class="pm"><b>−37 489</b><span class="pr"><span class="pc"><span style="height:40%"></span><span style="height:75%"></span><span style="height:30%"></span><span style="height:55%"></span></span><span class="pa"></span></span></span></span>`;
function lookTab() {
  const cur = design(), comp = compactNav();
  return `<div class="th-grid">${Object.entries(THEMES).map(([k, t]) => `<button class="th-card" data-theme-pick="${k}" aria-pressed="${cur === k}">${thPrev(t)}
      <span class="th-meta"><span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${cur === k ? '<span class="th-ok" aria-hidden="true">✓</span>' : ''}</span></button>`).join('')}</div>
    <div class="box" style="justify-content:space-between;gap:20px"><div><b style="font-weight:600;font-size:15px">Kompakt sidemeny</b><div class="note" style="font-size:13px;margin-top:2px">Vis bare ikoner i sidemenyen</div></div>
      <button class="toggle" role="switch" aria-checked="${comp}" data-act="compact-nav" aria-label="Kompakt sidemeny"></button></div>
    <div class="note" style="font-size:13px">Velg hvordan FinansHub ser ut. Endringen gjelder med en gang og følger brukeren din på alle nettlesere. Mobilappen og PWA-en har egne design under Innstillinger → Utseende der.</div>`;
}

function shell(content) {
  const b = S.boot, st = b.settings;
  const pg = PAGES.find(([p]) => p === u.page);
  const ai = S.ai, prov = st.provider;
  const aiOk = ai ? (prov === 'ollama' ? ai.ollama.ok : ai.gemini.ok) : null;
  const me = b.me ?? { name: st.name, role: 'admin' };
  const aiMode = !!u.aiMode;
  return `<div class="app">
  <aside class="side" aria-label="FinansHub-meny">
    <div class="brand">${brandMark()}<div class="brand-t">Finans<span>Hub</span></div></div>
    ${sideNav()}
    ${`<button type="button" class="ai-box a42" data-act="open-ai-set" title="Åpne AI-innstillinger"><div class="side-label" style="padding:0">AI-motor</div>
      <div style="display:flex;align-items:center;gap:8px;font-weight:600"><span class="ai-dot ${aiOk === null ? 'unk' : aiOk ? '' : 'off'}"></span>${prov === 'ollama' ? 'Ollama · lokalt' : 'Gemini · sky'}</div>
      <div class="note" style="font-size:12px">${prov === 'ollama' ? `${esc(st.ollamaModel)} · kvitteringer leses lokalt` : `${esc(st.geminiModel)} · kvitteringer leses lokalt`}${aiOk === false ? ' · <span class="neg">ikke tilgjengelig</span>' : ''}</div></button>`}
  </aside>
  <main class="main"><div class="wrap">
    <header class="head">
      <div style="display:flex;gap:14px;align-items:flex-start"><button class="side-tog" data-act="compact-nav" aria-label="${compactNav() ? 'Vis hele sidemenyen' : 'Kompakt sidemeny'}" title="${compactNav() ? 'Vis hele sidemenyen' : 'Kompakt sidemeny'}" aria-pressed="${compactNav()}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16v14H4zM9 5v14"/></svg></button><div><div class="crumb"><span>FinansHub</span><span>›</span><b>${esc(pageName(u.page))}</b></div>${u.page === 'dir' ? '' : `<h1>${u.page === 'ov' ? `${greet()}, ${esc(String(me.name ?? '').split(/\s+/)[0] || '@' + (me.username ?? ''))}` : esc(pageName(u.page))}</h1>`}${MODULE_SUB[u.page] ? `<div class="note" style="font-size:14px;margin-top:4px">${MODULE_SUB[u.page]}</div>` : ''}</div></div>
      <div class="head-r">
        ${(() => {
          // Prompt 42 (claude-code-boliger-sok-scope.md): på Boliger-siden søker feltet bare i Boliger / boligen som er åpen.
          const sc = bolScope(), ph = sc ? (aiMode ? `Spør Glimt om ${sc.home ? sc.name : 'boligene'} …` : `Søk i ${sc.name} …`) : aiMode ? 'Spør Glimt …' : 'Søk i transaksjoner …';
          return `<form class="search${aiMode ? ' ai' : ''}${(aiMode ? u.aiDraft : u.q) ? ' has' : ''}" data-form="gsearch" data-sf role="search"><span class="sf-ic">${icon('search', 17, 'var(--muted)')}</span>${sc ? `<span class="s42-scope" title="Søket gjelder bare ${esc(sc.name)}"><span>${esc(sc.name)}</span><button type="button" data-act="scope-off" aria-label="Søk i hele økonomien">×</button></span>` : ''}${clearBtn()}<input name="q" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" value="${esc(aiMode ? (u.aiDraft ?? '') : u.q)}" placeholder="${esc(ph)}" aria-label="${esc(ph.replace(' …', ''))}"><button type="button" class="ai-tog g42" data-act="ai-toggle" aria-pressed="${aiMode}" title="Spør Glimt">${orb(22, aiMode)}Glimt</button></form>`;
        })()}
        <a class="icon-btn" href="#/kv" aria-label="Varsler: ${b.reviewCount} kvitteringer til gjennomgang">${icon('bell', 18)}${b.reviewCount ? '<span class="dot"></span>' : ''}</a>
        <a class="me" href="#/inn" title="${esc(me.name ?? '')}" aria-label="Innstillinger for ${esc(me.name ?? 'deg')}"><div class="av">${me.avatarUrl ? `<img src="${esc(me.avatarUrl)}" alt="">` : esc(ini(me.name ?? me.username))}</div></a>
        <a class="close" href="/#/dash" aria-label="Tilbake til Hjem" title="Tilbake til Hjem">×</a>
      </div>
    </header>
    ${u.page === 'ai' ? '' : aiPanel()}
    ${content}
  </div></main></div>${modalHtml()}`;
}

/* ===================== Glimt (egen side) ===================== */

const AI_SUGG = () => ['Har jeg noen abonnementer?', 'Hvor mye har jeg brukt på kaffe?', 'Når kjøpte jeg lyspærer?', `Mat i ${monthName(S.boot.month ?? today().slice(0, 7))}`, 'Hva har jeg betalt for lading?'];
function aiPage() {
  const sugg = [...new Set([...AI_SUGG(), ...(S.aiSugg ?? [])])].slice(0, 6);
  const hist = (S.aiHist ?? []).slice(0, 8);
  const prov = S.boot.settings.provider === 'ollama' ? 'Ollama' : 'Gemini';
  // Prompt 42 (claude-code-okonomi-glimt-knapper.md): kortet heter Glimt og bruker Glimt-orben.
  return `<div class="ai-page">
    <form class="card ai-ask" data-form="aipage" role="search"><div class="ai-k" style="display:flex;align-items:center;gap:10px">${orb(36, !!u.ai?.busy)}GLIMT · SPØR OM ØKONOMIEN · ${prov}</div>
      <div class="ai-ask-row"><input name="aiq" value="${esc(u.aiPageDraft ?? '')}" placeholder="Spør om økonomien din, f.eks. «hvor mye har jeg brukt på kaffe i år?»" autocomplete="off" aria-label="Spørsmål til Glimt" data-ai-page-input><button class="btn pri">Spør Glimt</button></div>
      <div class="note" style="font-size:13px;text-wrap:pretty">Søker i transaksjoner, kvitteringer og varelinjene som Glimt har lest av kvitteringsbildene.</div>
      <div class="ai-sugg">${sugg.map((g) => `<button type="button" data-ai-q="${esc(g)}">${esc(g)}</button>`).join('')}</div></form>
    ${u.ai?.q ? aiPanel() : ''}
    ${tasksCard()}
    ${card(`<div class="card-h"><b style="font-weight:600;font-size:15px">Tidligere spørsmål</b>${hist.length ? '<button class="link-btn" data-act="ai-hist-clear">Tøm</button>' : ''}</div>
      ${hist.length ? `<div class="ai-hist">${hist.map((h) => `<button data-ai-q="${esc(h)}"><span class="muted">↺</span><span class="ell">${esc(h)}</span></button>`).join('')}</div>` : '<div class="note" style="font-size:13.5px">Ingen spørsmål ennå.</div>'}`, '', 'gap:10px')}
  </div>`;
}

/* ===================== Oversikt ===================== */

// Beløpet står alltid på én linje med «kr» rett etter; minigrafen ligger under, ved siden av notatet.
function kpi(label, iconK, icBg, icFg, value, noteHtml, art) {
  return `<div class="card kpi"><div class="kpi-h"><div><span class="kpi-ic" style="background:${icBg};color:${icFg}">${icon(iconK, 16)}</span><span class="sub">${label}</span></div></div>
    <div class="big">${value}<small> kr</small></div><div class="kpi-b"><div class="note">${noteHtml}</div><div class="kpi-art">${art}</div></div></div>`;
}
const change = (cur, prev, goodDown) => {
  const p = pctChange(cur, prev);
  if (p === null || !Number.isFinite(p)) return '<span class="muted">ingen sammenligning</span>';
  const good = goodDown ? p <= 0 : p >= 0;
  return `<span style="color:${good ? 'var(--pos)' : 'var(--acc-l)'}">${p >= 0 ? '↗' : '↘'} ${n0(Math.abs(p))} %</span> <span class="muted">mot ${monthName(shiftMonth(S.summary.month, -1))}</span>`;
};

function chart(s) {
  const year = u.mode === 'year';
  let rows = s.series;
  if (year) { // akkumulert hittil i år
    const y = s.month.slice(0, 4); let ai = 0, au = 0;
    rows = s.series.filter((r) => r.month.startsWith(y)).map((r) => ({ ...r, inn: (ai += r.inn), ut: (au += r.ut) }));
  }
  if (!rows.length) return '<div class="empty">Ingen data ennå.</div>';
  const W = 600, H = 200, mx = Math.max(1000, ...rows.flatMap((r) => [r.inn, r.ut])) * 1.1;
  const x = (i) => (rows.length === 1 ? W / 2 : (i * W) / (rows.length - 1));
  const pi = rows.map((r, i) => [x(i), H - (r.inn / mx) * H]), pu = rows.map((r, i) => [x(i), H - (r.ut / mx) * H]);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => `<div><span>${k(mx * f)}</span></div>`).join('');
  const hov = rows.map((r, i) => {
    const on = u.hov === i;
    return `<div data-hov="${i}">${on ? `<div class="vline"></div><span class="pt" style="background:var(--c-in);top:calc(${(1 - r.inn / mx) * 100}% - 6px)"></span><span class="pt" style="background:var(--c-out);top:calc(${(1 - r.ut / mx) * 100}% - 6px)"></span>
      <div class="tip" style="left:${i > rows.length / 2 ? 'calc(50% - 172px)' : 'calc(50% + 12px)'}"><b>${cap(monthName(r.month))} ${r.month.slice(0, 4)}</b><span><span class="sub">● Inn</span><span class="mono">${n0(r.inn)} kr</span></span><span><span class="sub">● Ut</span><span class="mono">${n0(r.ut)} kr</span></span><span><span class="sub">Netto</span><span class="mono" style="color:${r.inn - r.ut >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${neg0(r.inn - r.ut)} kr</span></span></div>` : ''}</div>`;
  }).join('');
  return `<div class="chart" data-chart>
    <div class="chart-grid">${ticks}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c-in)" stop-opacity=".22"/><stop offset="1" style="stop-color:var(--c-in)" stop-opacity="0"/></linearGradient><linearGradient id="gu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c-out)" stop-opacity=".18"/><stop offset="1" style="stop-color:var(--c-out)" stop-opacity="0"/></linearGradient></defs>
      <path d="${smooth(pi)} L${W} ${H} L0 ${H} Z" fill="url(#gi)"/><path d="${smooth(pu)} L${W} ${H} L0 ${H} Z" fill="url(#gu)"/>
      <path d="${smooth(pi)}" fill="none" style="stroke:var(--c-in)" stroke-width="2.5" vector-effect="non-scaling-stroke"/><path d="${smooth(pu)}" fill="none" style="stroke:var(--c-out)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div class="chart-hov">${hov}</div>
    <div class="chart-x">${rows.map((r) => `<span>${monthName(r.month, false)}</span>`).join('')}</div></div>`;
}

const txRow = (t) => `<button class="tx-row" data-open-tx="${t.id}">${logo(t, 38, 12)}
  <span class="grow"><span class="ell" style="font-weight:500">${esc(t.description)}</span><span class="ell note" style="font-size:12px">${dd(t.date)} · ${esc(t.category)}</span>${aiLine(t.aiShort, 'd-ai ell')}</span>
  <span class="mono" style="font-weight:500;color:${amtColor(t.amount)}">${sgn(t.amount)}</span></button>`;

const paper = (r) => `<span class="paper${r.thumb ? ' img' : ''}" style="${r.thumb ? `background-image:url('${r.thumb}')` : ''}"><i></i><i></i><i></i><i></i></span>`;

const pctOf = (s) => (s.budgetTotal ? Math.min(1, s.budgetUsed / s.budgetTotal) : 0);

function overview() {
  const s = S.summary;
  if (!s) return skel(400);
  const st = S.boot.settings;
  const bal = s.balanceSeries, mxB = Math.max(...bal.map(Math.abs), 1);
  const saldoBars = bal.slice(-18).map((v) => `<i style="flex:1 1 0;min-width:0;height:${Math.max(4, (Math.abs(v) / mxB) * 46)}px"></i>`).join('');
  const innSp = spark(s.series.slice(-8).map((r) => r.inn));
  const days = s.dailyOut.slice(-12), mxD = Math.max(...days.map((d) => d.amount), 1);
  const utBars = days.map((d) => `<i style="flex:1 1 0;min-width:0;opacity:.9;height:${Math.max(3, (d.amount / mxD) * 46)}px" title="${dd(d.date)}: ${n0(d.amount)} kr"></i>`).join('');
  const ang = Math.PI * (1 - pctOf(s)), gx = 50 + 40 * Math.cos(ang), gy = 44 - 40 * Math.sin(ang);
  const pct = pctOf(s);
  const kpis = `<div class="kpis">
    ${kpi('Total saldo', 'wallet', 'var(--warn-soft)', 'var(--acc-l)', neg(s.balance), change(bal.at(-1), bal.at(-2)), `<div class="bars">${saldoBars}</div>`)}
    ${kpi(`Inn i ${monthName(s.month)}`, 'up', 'var(--blue-soft)', 'var(--blue-l)', n2(s.inn), s.lastIncome ? `${esc(s.lastIncome.description)} ${dd(s.lastIncome.date)}` : 'Ingen inntekt registrert', `<svg width="96" height="46" viewBox="0 0 96 46" fill="none" preserveAspectRatio="none" aria-hidden="true"><path d="${innSp.area}" style="fill:color-mix(in srgb,var(--blue) 16%,transparent)"/><path d="${innSp.line}" style="stroke:var(--blue)" stroke-width="2" stroke-linecap="round"/></svg>`)}
    ${kpi(`Brukt i ${monthName(s.month)}`, 'dn', 'var(--warn-soft)', 'var(--acc-l)', n2(s.ut), change(s.ut, s.prevUt, true), `<div class="bars" style="gap:3px">${utBars}</div>`)}
    ${kpi('Igjen av budsjett', 'pie', 'var(--pos-soft)', 'var(--pos)', neg(s.left), s.budgetTotal ? `${n0(pct * 100)} % brukt · ${s.daysLeft} dager igjen` : '<a href="#/bud">Sett opp budsjett</a>', `<svg width="96" height="46" viewBox="0 0 100 48" fill="none" aria-hidden="true"><path d="M10 44A40 40 0 0 1 90 44" style="stroke:var(--line)" stroke-width="8" stroke-linecap="round"/><path d="M10 44A40 40 0 0 1 90 44" stroke="${pct >= 1 ? 'var(--acc)' : pct > 0.8 ? 'var(--warn)' : 'var(--acc)'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${pct * 125.7} 200"/><circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="3" style="fill:var(--text)"/></svg>`)}
  </div>`;
  const a = accs(), credit = a.find((x) => x.type === 'credit'), main = a.find((x) => x.type === 'checking') ?? a[0];
  const accCard = card(`<div class="card-h"><h2>Kontoer</h2><a class="btn sm pri" href="#/konto">Se alle</a></div>
    ${a.length ? `<div class="cards-stack"><div class="cc-back"><span class="mc"><i></i><i></i></span><span class="mono sub" style="font-size:13px">${main?.last4 ? '•••• ' + esc(main.last4) : esc(main?.name ?? '')}</span></div>
      <div class="cc-front"><div style="display:flex;justify-content:space-between;align-items:flex-start"><b style="font-size:20px;font-style:italic;letter-spacing:.02em">${credit ? 'VISA' : esc(main.bank || 'Konto')}</b><span class="mono" style="font-size:13px">${(credit ?? main).last4 ? '•••• ' + esc((credit ?? main).last4) : ''}</span></div>
      <div><div style="font-size:12px;opacity:.75">${credit ? 'Kredittkort · brukt' : esc(main.name)}</div><div class="mono" style="font-size:22px;font-weight:600">${credit ? n2(Math.min(0, credit.balance)) : neg(main.balance)} kr</div></div></div></div>
    <div>${a.map((x) => `<div class="kv-line"><span class="sub">${esc(x.name)}</span><span class="mono" style="font-weight:500">${neg(x.balance)} kr</span></div>`).join('')}</div>`
    : '<div class="empty" style="padding:20px 0">Ingen kontoer ennå. <a href="#/konto">Legg til</a></div>'}`, '', 'flex:1 1 320px');
  const stack = s.budgets.map((b) => `<span style="background:${b.color};width:${s.budgetTotal ? (b.used / s.budgetTotal) * 100 : 0}%"></span>`).join('');
  const budTop = s.budgets.filter((b) => b.used > 0 || b.budget).sort((x, y) => y.used / (y.budget || 1) - x.used / (x.budget || 1)).slice(0, 4).map((b) => {
    const o = b.used > b.budget;
    return `<div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="display:flex;align-items:center;gap:8px"><span class="tag" style="padding:0;background:none"><i style="background:${b.color};width:8px;height:8px"></i></span>${esc(b.category)}</span><span class="mono" style="color:${o ? 'var(--acc-l)' : 'var(--muted)'}">${n0(b.used)} / ${n0(b.budget)}</span></div>
      <div class="prog"><i style="width:${Math.min(100, (b.used / (b.budget || 1)) * 100)}%;background:${o ? 'var(--acc)' : b.color}"></i></div></div>`;
  }).join('');
  const rv = s.review.slice(0, 4).map((r) => `<button class="rq" data-open-rc="${r.id}">${paper(r)}<span class="grow"><span style="display:flex;justify-content:space-between;gap:8px"><b class="ell" style="font-weight:600">${esc(r.merchant ?? 'Ny kvittering')}</b><span class="mono">${r.total != null ? n2(r.total) + ' kr' : '–'}</span></span>
    <span class="note" style="display:block;font-size:12px">${dd(r.date)} · ${r.status === 'needs_review' ? esc(r.source_label ?? r.provider ?? 'manuell') : 'Glimt leser lokalt …'}</span>
    <span style="display:block;font-size:12px;color:${r.flag || r.error ? 'var(--acc-l)' : r.status === 'needs_review' ? 'var(--pos)' : 'var(--blue-l)'}">${r.status !== 'needs_review' ? 'Leses av Glimt …' : r.error ? 'Må fylles ut manuelt' : r.flag ?? 'Alle felt lest sikkert'}</span></span></button>`).join('');
  const up = s.upcoming.slice(0, 4).map((r) => `<div class="kv-line" style="align-items:center"><div><div style="font-weight:500">${esc(r.name)}</div><div class="note" style="font-size:12px">Trekkes ${new Date(r.next + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '')}</div></div><div class="mono" style="font-weight:500">${n0(r.amount)} kr</div></div>`).join('');
  // På PC lastes kvitteringer opp fra filer (ingen kamera).
  // Prompt 42 (claude-code-finans-handlinger-ikonfarge.md): brikken er en lys tone av ikonfargen, ikke surf/rgba.
  const actions = `<label class="action" style="background:var(--warn-soft);color:var(--text);cursor:pointer"><span class="a42-tile" style="--ic:var(--warn)">${icon('down', 17)}</span>Last opp kvittering<input type="file" multiple accept="image/*,application/pdf" data-upload hidden></label>`
    + [['Ny transaksjon', 'var(--blue-soft)', 'var(--blue)', 'plus', 'data-act="add-tx"'], ['Importer', 'var(--pos-soft)', 'var(--pos)', 'imp', 'data-act="goto-import" href="#/inn"'], ['Rapport', 'var(--purple-soft)', 'var(--purple)', 'rap', 'href="#/rap"']]
    .map(([n, bg, c, ic, at]) => `<${at.startsWith('href') ? 'a' : 'button'} class="action" ${at} style="background:${bg};color:var(--text)"><span class="a42-tile" style="--ic:${c}">${icon(ic, 17)}</span>${n}</${at.startsWith('href') ? 'a' : 'button'}>`).join('');
  const noData = !S.boot.hasData ? card(`<div class="card-h"><div><h2>Kom i gang</h2><div class="note">Legg til en konto, importer fra nettbanken eller last opp en kvittering. Du kan også laste inn demodata for å se hvordan alt ser ut.</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/konto">Legg til konto</a><button class="btn" data-act="goto-import">Importer CSV</button><button class="btn pri" data-act="demo">Last inn demodata</button></div></div>`, '', 'border-color:var(--warm-line)') : '';
  return `<div style="display:flex;flex-direction:column;gap:18px">${S.boot.firstRun ? firstRunCard() : noData}${kpis}
    <div class="row-flex">${card(`<div class="card-h"><div><h2>Inn og ut</h2><div class="note" style="font-size:13px">${u.mode === 'year' ? `Akkumulert, ${s.month.slice(0, 4)}` : 'Per måned, siste 12 måneder'}</div></div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div class="legend"><span><i style="background:var(--c-in)"></i>Inn</span><span><i style="background:var(--c-out)"></i>Ut</span></div>
      <div class="seg"><button data-mode="month" aria-pressed="${u.mode === 'month'}">Måned</button><button data-mode="year" aria-pressed="${u.mode === 'year'}">År</button></div></div></div>${chart(s)}`, '', 'flex:2 1 560px')}${accCard}</div>
    <div class="row-flex">
      ${card(`<div class="card-h" style="margin-bottom:-6px"><h2>Siste transaksjoner</h2><a class="link" href="#/tx">Se alle →</a></div><div style="display:flex;flex-direction:column;gap:2px">${s.recent.map(txRow).join('') || '<div class="empty">Ingen transaksjoner ennå.</div>'}</div>`, '', 'flex:1.3 1 380px;gap:6px')}
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px">
        ${card(`<h2>Handlinger</h2><div class="actions">${actions}</div>`)}
        ${card(`<div class="card-h"><h2>Budsjett</h2><a class="link" href="#/bud">Endre →</a></div>${s.budgetTotal ? `<div class="stack">${stack}</div>${budTop}` : '<div class="note">Ingen budsjett satt. <a href="#/bud">Sett opp</a></div>'}`, '', 'gap:12px')}
      </div>
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px">
        ${card(`<div class="card-h"><h2>Trenger gjennomgang</h2><span class="pill" style="background:var(--warn-soft);color:var(--acc-l)">${s.review.length} nye</span></div>${rv || '<div class="note">Alt er gjennomgått.</div>'}`, 'review', 'gap:10px')}
        ${card(`<div class="card-h" style="margin-bottom:-6px"><h2>Kommende trekk</h2><a class="link" href="#/fast">Alle →</a></div><div>${up || '<div class="note" style="padding-top:8px">Ingen faste trekk registrert.</div>'}</div>`, '', 'gap:2px')}
      </div>
    </div></div>`;
}

/* ===================== Transaksjoner ===================== */

/* Prompt 30: søkeordet som skal markeres i kvitteringen (fra søk, AI-treff eller ?hl= i adressen). */
const hlQ = () => (u.hlOff ? '' : u.hl || u.q || '');
const txHlIdx = (t) => (hlQ() && t?.lines?.length ? matchLines(t.lines.map((l) => ({ text: l.description, price: l.amount })), hlQ()) : []);
function txHl(t) {
  const idx = txHlIdx(t);
  if (!hlQ() || !t?.lines?.length || !idx.length) return '';
  return hlBanner(hlQ(), t.lines.map((l) => ({ text: l.description, price: l.amount })), idx)
    + (t.receiptId ? `<a class="rc-hlopen" href="#/kv" data-open-rc="${esc(t.receiptId)}" data-hl="${esc(hlQ())}">Vis i kvitteringen ›</a>` : '');
}
function transactions() {
  const list = S.tx;
  const chips = [{ id: '', name: 'Alle', color: 'var(--text)' }, ...cats()].map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="${String(u.cat) === String(c.id)}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join('');
  const qs = new URLSearchParams({ ...(u.q && { q: u.q }), ...(u.cat && { category: u.cat }), ...(u.acc && { account: u.acc }), ...(u.type && { type: u.type }) });
  const rows = list?.items.map((t) => `<tr data-open-tx="${t.id}" class="${u.sel === t.id ? 'on' : ''}">
    <td class="mono muted" style="white-space:nowrap">${dd(t.date)}</td>
    <td><div style="display:flex;align-items:center;gap:10px">${logo(t, 30, 9)}<div style="min-width:0"><div style="font-weight:500">${esc(t.description)}</div><div class="note" style="font-size:12px">${esc(t.account)}${t.note ? ' · ' + esc(t.note) : ''}${t.folder ? ' · ' + esc(t.folder) : ''}</div>${aiLine(t.aiShort, 'd-ai ell')}</div></div></td>
    <td><span class="tag"><i style="background:${t.color}"></i>${esc(t.category)}</span></td>
    <td style="font-size:12.5px;color:${t.receipt === 'needs_review' ? 'var(--acc-l)' : 'var(--muted)'}">${t.receipt === 'booked' ? 'Vedlagt' : t.receipt ? 'Til gjennomgang' : '–'}</td>
    <td class="mono" style="white-space:nowrap;font-weight:500;color:${amtColor(t.amount)}">${sgn(t.amount)}</td></tr>`).join('');
  const sel = list?.items.find((t) => t.id === u.sel);
  // Prompt 52 (WEB52F): felles kvitteringspanel (rcpanel52.js) – sticky med egen scroll, skuff under 1100 px.
  const detail = sel ? `<div class="rcp52-scrim" data-act="close-sel" aria-hidden="true"></div>${rcPanel52({
    key: `tx:${sel.id}`, cls: 'card detail inline', close: 'data-act="close-sel"', logo: logo(sel, 46, 14), label: sel.description,
    titleHtml: `<input class="inp" data-tx-field="description" value="${esc(sel.description)}" aria-label="Beskrivelse" style="font-size:18px;font-weight:600;background:none;border-color:transparent;padding:0;height:auto">`,
    meta: [dLong(sel.date), sel.account].filter(Boolean).join(' · '), amount: sel.amount, amountColor: amtColor(sel.amount),
    top: `<div style="display:flex;gap:10px;align-items:flex-end"><div class="seg" style="border-radius:10px;flex:none" role="group" aria-label="Type">${[['expense', 'Utgift'], ['income', 'Inntekt']].map(([k2, l]) => `<button type="button" data-txkind="${k2}" aria-pressed="${sel.type === k2}" style="height:38px;padding:0 14px">${l}</button>`).join('')}</div>
      <label class="f" style="flex:1">Beløp (kr)<input class="inp mono" data-tx-field="amount" inputmode="decimal" value="${n2(Math.abs(sel.amount))}"></label></div>
    ${txHl(sel)}`,
    glimt: sel.aiLong ? { text: sel.aiLong, lines: (sel.lines ?? []).map((l, i) => { const on = txHlIdx(sel).includes(i); return { hit: on, html: on ? markText(l.description, hlQ()) : esc(l.description), amount: l.amount }; }) } : null,
    body: `<label class="f">Kategori<select class="inp" data-tx-field="categoryId">${opt('', 'Ukategorisert', sel.categoryId)}${catOpts(sel.categoryId)}</select></label>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Dato<input class="inp" type="date" data-tx-field="date" value="${sel.date}"></label><label class="f" style="flex:1">Konto<select class="inp" data-tx-field="accountId">${accOpts(sel.accountId, '–')}</select></label></div>
    <label class="f">Bolig<select class="inp" data-tx-field="folderId">${opt('', 'Ingen', sel.folderId)}${(S.txFolders ?? []).map((f) => opt(f.id, f.name, sel.folderId)).join('')}</select></label>
    <label class="f">Notat<input class="inp" data-tx-field="note" value="${esc(sel.note ?? '')}" placeholder="Legg til notat"></label>
    ${linesEditor(sel)}
    ${rereadBtn(sel)}
    <div class="box"><span class="muted">Kvittering</span>${sel.receiptId ? `<a href="#/kv" data-open-rc="${sel.receiptId}"${hlQ() ? ` data-hl="${esc(hlQ())}"` : ''}>${sel.receipt === 'booked' ? 'Vedlagt – vis' : 'Til gjennomgang →'}</a>` : `<label class="link-btn" style="cursor:pointer">Legg ved kvittering<input type="file" accept="image/*,application/pdf" data-attach-rc="${sel.id}" hidden></label>`}</div>
    <div class="orig-links"><button class="orig-link" data-orig="receipt">${icon('kv', 16, 'var(--muted)')}<span class="grow">Original kvittering</span><span class="note">${sel.receiptId ? (sel.receipt === 'booked' ? 'Vedlagt' : 'Til gjennomgang') : 'Ingen'}</span><span class="muted">›</span></button>
      <button class="orig-link" data-orig="bank">${icon('konto', 16, 'var(--muted)')}<span class="grow">Original banktransaksjon</span><span class="note">${sel.hasBankRow ? 'Fra banken' : sel.source === 'receipt' ? 'Fra kvittering' : 'Lagt inn manuelt'}</span><span class="muted">›</span></button></div>
    <div style="display:flex;gap:10px"><button class="btn ghost" style="flex:1" data-act="make-rule">Lag regel</button><button class="btn danger" style="flex:1" data-act="del-tx">Slett</button></div>
    ${u.msg.rule ? `<div class="ok-msg">${esc(u.msg.rule)}</div>` : ''}
    ${addedLine(sel)}
    <div class="note" style="font-size:11.5px;text-align:center">E rediger · R les på nytt · ⌘S lagre · Esc lukk</div>`,
  })}` : '';
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="filters">
      <form class="search${u.q ? ' has' : ''}" data-form="txsearch" data-sf role="search"><span class="sf-ic">${icon('search', 17, 'var(--muted)')}</span>${clearBtn()}<input name="q" value="${esc(u.q)}" placeholder="Søk etter butikk eller beskrivelse" aria-label="Søk" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"></form>
      <select class="sel" data-filter="acc" aria-label="Konto">${accOpts(u.acc, 'Alle kontoer')}</select>
      <select class="sel" data-filter="type" aria-label="Type">${opt('', 'Inn og ut', u.type)}${opt('inn', 'Kun inn', u.type)}${opt('ut', 'Kun ut', u.type)}</select>
      <a class="btn" href="/finans/api/transactions.csv?${qs}">Eksporter CSV</a>
      <button class="btn pri" data-act="add-tx">+ Ny transaksjon</button>
    </div>
    <div class="chips">${chips}</div>
    <div class="row-flex${sel ? ' tx52' : ''}">
      <section class="card" style="flex:2 1 600px;padding:10px 22px 16px;gap:0">
        <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:13px" class="muted"><span>${list ? `${list.count} transaksjoner` : 'Laster …'}</span><span>Netto <b class="mono" style="color:var(--text);font-weight:500">${list ? sgn(list.net) + ' kr' : ''}</b></span></div>
        <div class="tbl-wrap"><table style="min-width:620px"><thead><tr><th>Dato</th><th>Beskrivelse</th><th>Kategori</th><th>Kvittering</th><th>Beløp</th></tr></thead><tbody>${rows ?? ''}</tbody></table></div>
        ${list && !list.items.length ? '<div class="empty">Ingen transaksjoner matcher filteret.</div>' : ''}${!list ? skel(300) : ''}
      </section>${detail}
    </div></div>`;
}

/* ===================== Kvitteringer ===================== */

const STATUS = { pending: ['I kø', 'var(--blue-soft)', 'var(--blue-l)'], processing: ['Leser …', 'var(--blue-soft)', 'var(--blue-l)'], needs_review: ['Gjennomgå', 'var(--warn-soft)', 'var(--acc-l)'] };

function receipts() {
  const all = S.receipts;
  if (!all) return skel(400);
  const st = S.boot.settings, aiShort = 'Lokal AI'; // prompt 52: kvitteringer leses bare lokalt (aldri Gemini)
  const queue = all.filter((r) => STATUS[r.status]);
  const booked = all.filter((r) => r.status === 'booked' || r.status === 'rejected').slice(0, 12);
  if (!u.selRc || !all.find((r) => r.id === u.selRc)) u.selRc = queue[0]?.id ?? null;
  const R = all.find((r) => r.id === u.selRc);
  const qHtml = queue.map((r) => { const [label, bg, fg] = STATUS[r.status]; return `<button class="rq${r.id === u.selRc ? ' sel' : ''}" data-open-rc="${r.id}">${paper(r)}<span class="grow"><span style="display:flex;justify-content:space-between;gap:8px"><b class="ell" style="font-weight:600">${esc(r.merchant ?? 'Ny kvittering')}</b><span class="mono">${r.total != null ? n2(r.total) + ' kr' : ''}</span></span><span class="note" style="display:block;font-size:12px">${dd(r.date)} · ${esc(r.extraction?.receipt48?.label ?? r.source_label ?? aiShort)}</span>${aiLine(r.aiShort, 'd-ai ell')}${r.canReanalyze ? `<span class="acc-l" role="button" tabindex="0" style="display:inline-block;margin-top:4px;font-size:12px;font-weight:600;color:var(--blue-l)" data-reanalyze="${esc(r.id)}">✦ Les på nytt</span>` : ''}</span><span class="status" style="background:${bg};color:${fg}">${label}</span></button>`; }).join('');
  let panel;
  if (!R) panel = '<div class="empty" style="padding:80px 20px">Velg en kvittering i køen, eller last opp en ny.</div>';
  else if (R.status === 'pending' || R.status === 'processing') panel = `<div style="padding:80px 20px;display:flex;flex-direction:column;align-items:center;gap:14px" class="sub"><span class="spin"></span>${R.aiShort ? esc(R.aiShort) : 'Glimt leser lokalt …'}<button class="btn sm ghost" data-act="rc-manual">Fyll ut manuelt i stedet</button></div>`;
  else panel = confirmPanel(R);
  return `<div class="row-flex">
    <div style="flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:16px">
      <label class="drop" data-drop><span class="drop-ic">${icon('scan', 24, 'currentColor')}</span><b style="font-size:15px;font-weight:600">Last opp kvitteringer</b><span class="note" style="font-size:13px">Bilder eller PDF · flere filer · dra hit eller klikk · bilder leses av Glimt (Mac-OCR, ellers Tesseract)</span><input type="file" accept="image/*,application/pdf" multiple data-upload hidden></label>
      ${card(`<div class="card-h"><h2 style="font-size:16px">Kø</h2><span class="note" style="font-size:12.5px">${queue.length} til gjennomgang</span></div>${qHtml || '<div class="note">Ingen kvitteringer i køen.</div>'}${(() => { const n = queue.filter((r) => r.canOcr && (r.error || r.merchant == null || r.total == null)).length; return n ? `<button class="btn ghost sm" style="align-self:flex-start;margin-top:4px" data-act="rc-ocr-all" title="Leser bildene lokalt på serveren med Tesseract, uten AI">Les ${n} som Glimt ikke klarte, med lokal OCR</button>` : ''; })()}`, '', 'padding:20px;gap:8px')}
      ${card(`<h2 style="font-size:16px">Bokført</h2><div>${booked.map((r) => `<div class="kv-line" style="font-size:13.5px"><button class="link" style="color:var(--text);text-align:left;display:flex;align-items:center;gap:8px" data-open-rc="${r.id}">${logo({ merchant: r.merchant ?? '', domain: r.domain }, 24, 7)}${esc(r.merchant ?? '–')} ${r.aiShort ? `<span class="acc-l" style="font-size:12px">✦ ${esc(r.aiShort)}</span> ` : ''}<span class="muted">· ${dd(r.date)}</span></button><span class="mono" style="color:${r.status === 'rejected' ? 'var(--muted)' : 'var(--text)'}">${r.status === 'rejected' ? 'Avvist' : n2(r.total) + ' kr'}</span><button type="button" class="btn sm ghost f41-again" style="margin-left:8px" data-reanalyze="${esc(r.id)}" data-status="${esc(r.status)}" title="La Glimt lese kvitteringen på nytt. Ingenting endres før du velger «Bruk endringene».">✦ På nytt</button></div>`).join('') || '<div class="note">Ingen ennå.</div>'}</div>`, '', 'padding:20px;gap:2px')}
    </div>
    ${card(panel, '', 'flex:2 1 520px;gap:18px')}
  </div>`;
}

function confirmPanel(R) {
  const st = S.boot.settings;
  const done = R.status === 'booked' || R.status === 'rejected';
  const conf = R.confidence ?? 0, high = !R.error && conf >= st.minConf / 100 && !R.flag;
  const ex = R.extraction ?? {};
  const other = 'ollama'; // prompt 52: «Les på nytt» er alltid lokalt
  // Prompt 30: markering av søketreff (banner, gule linjer, bbox-rektangler over bildet).
  const hq = !u.hlOff && u.hl && String(u.hlRc) === String(R.id) ? u.hl : '', L = hq ? linesOf(R) : [], hIdx = hq ? matchLines(L, hq) : [];
  const hasBox = hIdx.some((i) => L[i]?.bbox);
  const hlTop = hq ? `${hlBanner(hq, L, hIdx)}${hIdx.length && !hasBox ? `<div class="rc-hlnote"><span class="note">Kvitteringen mangler posisjoner for linjene. Les den på nytt for å markere i bildet.</span><button type="button" class="btn sm ghost" data-act="rc-reread">Les kvitteringen på nytt</button></div>` : ''}` : '';
  const img = hq && R.file && R.mime?.startsWith('image/') && hasBox ? hlImage(R.file, L, hIdx)
    : hq && hIdx.length ? `<div class="receipt-img rc-hlwrap">${hlList(hq, L, hIdx)}</div>`
    : R.file && R.mime?.startsWith('image/')
    ? `<div class="receipt-img photo" style="background-image:url('${R.file}')" role="img" aria-label="Kvitteringsbilde"></div>`
    : `<div class="receipt-img">${R.file && R.mime === 'application/pdf' ? `<a href="${R.file}" target="_blank" class="btn sm" style="align-self:center;margin-bottom:8px">Åpne PDF ↗</a>` : ''}
      <div class="hl" style="text-align:center;font-weight:600;font-size:14px;padding:4px">${esc(R.merchant ?? '–')}</div>${ex.org_number ? `<div style="text-align:center">Org.nr ${esc(ex.org_number)}</div>` : ''}<div class="dash"></div>
      ${(ex.lines ?? []).map((l) => `<div class="ln"><span>${esc(l.description)}${l.quantity > 1 ? ` ×${l.quantity}` : ''}</span><span>${n2(l.amount)}</span></div>`).join('') || '<div class="ln" style="opacity:.6"><span>Ingen varelinjer lest</span></div>'}
      <div class="dash"></div><div class="ln hl" style="font-weight:600;font-size:14px;padding:2px 4px"><span>TOTAL</span><span>${R.total != null ? n2(R.total) : '–'}</span></div>
      ${(ex.vat ?? []).map((v) => `<div class="ln"><span>herav mva ${v.rate} %</span><span>${n2(v.amount)}</span></div>`).join('')}</div>`;
  // Skanneloggen: hvert steg fra opplasting til lagring, så en feil kan spores.
  const log = (R.log ?? []).length ? `<details class="note" style="font-size:12.5px"><summary style="cursor:pointer">Skannelogg (${R.log.length} steg)</summary><div class="mono" style="display:flex;flex-direction:column;gap:2px;margin-top:6px">${R.log.map((l) => `<div><span class="muted">${new Date(l.t).toLocaleTimeString('nb-NO')}</span> ${esc(l.step)}${l.detail ? ` – ${esc(l.detail)}` : ''}</div>`).join('')}</div></details>` : '';
  const catBtns = cats('expense').map((c) => `<button data-rc-cat="${c.id}" aria-pressed="${R.categoryId === c.id}" ${done ? 'disabled' : ''}>${esc(c.name)}</button>`).join('');
  return `<div class="card-h"><div><h2 style="font-size:18px">${done ? (R.status === 'booked' ? 'Bokført kvittering' : 'Avvist kvittering') : 'Bekreft kvittering'}</h2><div class="note" style="font-size:13px">${via48(R) ? `${via48(R)} ${R.model ? `Tolket av ${esc(R.model)}` : ''}${R.extraction?.receipt48?.seconds ? ` · ${n2(R.extraction.receipt48.seconds).replace(/,?0+$/, '')} s` : ''}` : R.provider && R.provider !== 'Manuell' ? `Lest av ${esc(R.provider)}${R.seconds ? ` · ${n2(R.seconds).replace(/,?0+$/, '')} s` : ''}${R.model ? ` · ${esc(R.model)}` : ''}` : 'Manuell utfylling'}</div></div>
      ${R.error ? `<span class="conf" style="background:var(--warn-soft);color:var(--acc-l)"><i></i>Må fylles ut</span>` : `<span class="conf" style="background:${high ? 'var(--pos-soft)' : 'var(--warn-soft)'};color:${high ? 'var(--pos)' : 'var(--acc-l)'}"><i></i>${high ? 'Høy sikkerhet' : 'Sjekk beløp'}</span>`}</div>
    ${R.error ? `<div class="err-msg">${esc(R.error)}</div>` : R.flag ? `<div class="err-msg">${esc(R.flag)}</div>` : ''}
    ${hlTop}
    ${!done && (R.canReanalyze || R.reanalyzeReason) ? `<div class="rc-low50" style="display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:14px;background:var(--inner);border:1px solid var(--line)"><span style="font-size:13px;color:var(--text2)">${R.error ? 'Lesingen mislyktes.' : `Lav sikkerhet${R.source_label ? ` fra ${esc(R.source_label)}` : ''}.`} Glimt kan lese originalbildet på nytt lokalt, og du velger hvilket resultat du vil beholde.</span><div style="display:flex;gap:10px;flex-wrap:wrap">${reanalyzeBtn(R, 'btn', 'height:40px', 'btn pri')}</div>${!R.canReanalyze && R.reanalyzeReason ? `<span style="font-size:12px;color:var(--text2)">${esc(R.reanalyzeReason)}</span>` : ''}</div>` : ''}
    <div class="row-flex" style="gap:18px">${img}
      <div style="flex:1 1 260px;display:flex;flex-direction:column;gap:12px">
        <label class="f"><span>Butikk${uncTag48(R, 'merchant')}${srcTag51(R)}</span><input class="inp${uncCls48(R, 'merchant')}" data-rc-field="merchant" value="${esc(R.merchant ?? '')}" ${done ? 'disabled' : ''}></label>
        <div style="display:flex;gap:10px"><label class="f" style="flex:1">Dato${uncTag48(R, 'date')}<input class="inp${uncCls48(R, 'date')}" type="date" data-rc-field="date" value="${R.date ?? ''}" ${done ? 'disabled' : ''}></label><label class="f" style="flex:1">Total (kr)${uncTag48(R, 'total')}<input class="inp hl mono${uncCls48(R, 'total')}" data-rc-field="total" inputmode="decimal" value="${R.total != null ? n2(R.total).replace(/\s/g, '') : ''}" ${done ? 'disabled' : ''}></label></div>
        <div class="f">Kategori${uncTag48(R, 'category')}<div class="catpick">${catBtns}</div></div>
        <label class="f">Konto<select class="inp" data-rc-field="accountId" ${done ? 'disabled' : ''}>${accOpts(R.accountId, '–')}</select></label>
        <div class="match ${R.match ? '' : 'none'}">${icon('link', 18, R.match ? 'var(--pos)' : 'var(--muted)')}<div><div style="font-weight:600;color:${R.match ? 'var(--pos)' : 'var(--text)'}">${R.match ? 'Matchet mot kortkjøp' : 'Ingen bankmatch ennå'}</div><div class="sub">${R.match ? `${dd(R.match.date)} · ${sgn(R.match.amount)} kr · ${esc(R.match.account)}` : 'Bokføres som ny transaksjon'}</div></div></div>
      </div></div>
    ${is48(R) ? form48(R, { done, head: false }) : ''}
    ${raw51(R)}
    ${log}
    ${addedLine(R)}
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      ${done ? `<button class="btn ghost" data-act="rc-delete">Slett kvittering</button>${R.status === 'booked' ? '<button class="btn ghost" data-act="rc-unbook">↺ Til gjennomgang</button>' : ''}${R.file ? `<a class="btn" href="${R.file}" target="_blank">Åpne original ↗</a>` : ''}<button class="btn pri" data-reanalyze="${esc(R.id)}" data-status="${esc(R.status)}">✦ Les på nytt med Glimt</button>`
        : `${R.file && !R.canReanalyze ? `<button class="btn ghost" style="height:48px" data-act="rc-reprocess" data-prov="${other}">Les på nytt</button>` : ''}${R.canOcr && !(R.canReanalyze || R.reanalyzeReason) ? `<button class="btn ghost" style="height:48px" data-reanalyze="${esc(R.id)}" data-engine="tesseract" title="Leser bildet lokalt med Tesseract, uten AI">Les med lokal OCR</button>` : ''}<button class="btn ghost" style="height:48px" data-act="rc-reject">Avvis</button><button class="btn pri" style="height:48px;padding:0 28px" data-act="rc-book">Bokfør</button>`}
    </div>`;
}

/* ===================== Budsjett ===================== */

function budget() {
  const s = S.summary;
  if (!s) return skel(400);
  const used = new Map(s.byCategory.map((b) => [b.categoryId, b.amount]));
  const budMap = new Map(s.budgets.map((b) => [b.categoryId, b.budget]));
  const pct = s.budgetTotal ? s.budgetUsed / s.budgetTotal : 0;
  const ring = conic(s.budgets.map((b) => ({ value: b.used, color: b.color })), Math.max(s.budgetTotal, s.budgetUsed));
  const cards = cats('expense').map((c) => {
    const uu = used.get(c.id) ?? 0, b = budMap.get(c.id) ?? 0, r = b ? uu / b : 0, over = b && uu > b;
    return `<div class="card" style="padding:20px;gap:12px;border-color:${over ? 'var(--warm-line)' : 'var(--line)'}">
      <div class="card-h"><span style="display:flex;align-items:center;gap:10px;font-weight:600"><span class="ini sm" style="background:${rgba(c.color, 0.14)};color:${c.color}">${esc(ini(c.name))}</span>${esc(c.name)}</span><span style="font-size:12px;color:${over ? 'var(--acc-l)' : r > 0.8 ? 'var(--warn)' : 'var(--muted)'}">${!b ? 'Ikke satt' : over ? `Over med ${n0(uu - b)} kr` : r > 0.8 ? 'Nær grensen' : `${n0(b - uu)} kr igjen`}</span></div>
      <div class="mono" style="font-size:22px;font-weight:600">${n0(uu)} <span style="font-size:13px;color:var(--muted);font-weight:400">av ${n0(b)} kr</span></div>
      <div class="prog" style="height:8px"><i style="width:${Math.min(100, r * 100)}%;background:${over ? 'var(--acc)' : r > 0.8 ? 'var(--warn)' : c.color}"></i></div>
      <label class="f" style="flex-direction:row;align-items:center;justify-content:space-between">Månedsbudsjett<input class="inp mono" data-budget="${c.id}" inputmode="numeric" value="${b || ''}" placeholder="0" style="width:110px;height:38px;text-align:right"></label></div>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div style="display:flex;align-items:center;gap:10px"><button class="btn sm" data-month="-1" aria-label="Forrige måned">‹</button><b style="font-size:15px;min-width:130px;text-align:center">${cap(monthName(s.month))} ${s.month.slice(0, 4)}</b><button class="btn sm" data-month="1" aria-label="Neste måned">›</button><span class="note">Beløpene gjelder alle måneder</span></div>
    ${card(`<div class="ring" style="background:${ring}"><div><span class="mono" style="font-size:26px;font-weight:600">${n0(pct * 100)} %</span><span class="note" style="font-size:12px">brukt</span></div></div>
      <div style="flex:1 1 300px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px">
        <div><div class="note" style="font-size:13px">Budsjett ${monthName(s.month)}</div><div class="mono" style="font-size:24px;font-weight:600">${n0(s.budgetTotal)} kr</div></div>
        <div><div class="note" style="font-size:13px">Brukt</div><div class="mono neg" style="font-size:24px;font-weight:600">${n0(s.budgetUsed)} kr</div></div>
        <div><div class="note" style="font-size:13px">Igjen</div><div class="mono" style="font-size:24px;font-weight:600;color:${s.left >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${neg0(s.left)} kr</div></div>
        <div><div class="note" style="font-size:13px">Per dag resten av måneden</div><div class="mono" style="font-size:24px;font-weight:600">${n0(Math.max(0, s.left) / s.daysLeft)} kr</div></div>
      </div>`, '', 'padding:24px;flex-direction:row;flex-wrap:wrap;gap:28px;align-items:center')}
    <div class="grid-cards">${cards}</div></div>`;
}

/* ===================== Faste utgifter ===================== */

function recurring() {
  const list = S.recurring;
  if (!list) return skel(300);
  const act = list.filter((r) => r.active);
  const monthly = act.reduce((a, r) => a + (r.interval === 'yearly' ? r.amount / 12 : r.interval === 'weekly' ? (r.amount * 52) / 12 : r.amount), 0);
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  const days = new Set(act.filter((r) => r.interval === 'monthly' || (r.interval === 'yearly' && r.month === m + 1)).map((r) => Math.min(r.day, dim)));
  let cal = ['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d) => `<span class="wd">${d}</span>`).join('') + '<span class="blank"></span>'.repeat(first);
  for (let d = 1; d <= dim; d++) cal += `<span class="${d === now.getDate() ? 'today' : days.has(d) ? 'has' : ''}">${d}</span>`;
  const IV = { monthly: 'Månedlig', yearly: 'Årlig', weekly: 'Ukentlig' };
  const rows = list.map((r) => `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-top:1px solid var(--sep);opacity:${r.active ? 1 : 0.45}">
    <span class="ini" style="background:${rgba(r.color, 0.14)};color:${r.color}">${esc(ini(r.name))}</span>
    <button class="grow link" style="color:var(--text);text-align:left" data-edit-rec="${r.id}"><div style="font-weight:500">${esc(r.name)}${r.detected ? ' <span class="pill" style="background:var(--blue-soft);color:var(--blue-l);font-size:11px">oppdaget</span>' : ''}</div><div class="note" style="font-size:12px">${esc(r.category)} · ${IV[r.interval]} · ${r.day}.${r.interval === 'yearly' && r.month ? ' ' + monthName(`2000-${String(r.month).padStart(2, '0')}`) : ''} · neste ${dd(r.next)}</div></button>
    <span class="mono" style="font-weight:500">${n0(r.amount)} kr</span>
    <button class="toggle" role="switch" aria-checked="${r.active}" aria-label="Aktiv" data-rec-toggle="${r.id}"></button></div>`).join('');
  return `<div class="row-flex">
    ${card(`<div class="card-h" style="margin-bottom:10px"><h2>Abonnementer og regninger</h2><div style="display:flex;gap:8px"><button class="btn sm" data-act="detect-rec">Finn faste trekk</button><button class="btn sm pri" data-act="add-rec">+ Legg til</button></div></div>
      ${rows || '<div class="note" style="padding:12px 0">Ingen faste utgifter ennå. «Finn faste trekk» ser etter gjentakende trekk i transaksjonene dine.</div>'}${u.msg.rec ? `<div class="ok-msg" style="padding-top:8px">${esc(u.msg.rec)}</div>` : ''}`, '', 'flex:2 1 520px;gap:4px')}
    <div style="flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${card(`<div class="note" style="font-size:13px">Faste utgifter per måned</div><div class="mono" style="font-size:30px;font-weight:600">${n0(monthly)} <span style="font-size:14px;color:var(--muted);font-weight:400">kr</span></div><div class="note">${n0(monthly * 12)} kr i året · ${act.length} aktive</div>`, '', 'gap:6px')}
      ${card(`<div class="card-h"><b style="font-weight:600">${cap(monthName(`${y}-${String(m + 1).padStart(2, '0')}`))}</b><span class="note">trekkdager</span></div><div class="cal7">${cal}</div>`, '', 'gap:12px')}
    </div></div>`;
}

/* ===================== Kontoer ===================== */

// Kortflatene har egne farger; teksten må ha fast kontrast mot flaten, ikke følge temaets tekstfarge (som er mørk i lyst tema).
// Brukskontoen bruker temaets bankkort-tokens (card2) i de nye temaene, se .acc-face-check i finans.css.
const FACES = { checking: ['var(--accf-check)', 'var(--accf-check-ink)'], credit: ['linear-gradient(135deg,#FF8A4C,#C24E17)', '#FFF8F2'], savings: ['linear-gradient(135deg,#1F3A2F,#13201B)', '#EAF3EE'], cash: ['var(--inner)', 'var(--text)'] };
function accounts() {
  const a = accs(), goals = S.boot.goals;
  const cardsHtml = a.map((x) => { const [face, ink] = FACES[x.type] ?? FACES.cash; return `<div style="display:flex;flex-direction:column;gap:12px">
    <button class="acc-face" data-edit-acc="${x.id}" style="background:${face};color:${ink};text-align:left;${x.type === 'credit' ? 'border-color:transparent' : ''}"><div style="display:flex;justify-content:space-between;width:100%"><b style="font-weight:600">${esc(x.bank || ACC_TYPES[x.type])}</b><span class="mono" style="font-size:13px">${x.last4 ? '•••• ' + esc(x.last4) : ''}</span></div>
      <div><div style="font-size:12.5px;opacity:.8">${esc(x.name)}</div><div class="mono" style="font-size:24px;font-weight:600">${neg(x.balance)} kr</div></div></button>
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:0 4px" class="muted"><span>${ACC_TYPES[x.type]}</span><span>${esc(x.note)}</span></div></div>`; }).join('');
  const total = a.reduce((s, x) => s + x.balance, 0);
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="card-h"><div class="note">Samlet saldo <b class="mono" style="color:var(--text);font-size:16px">${neg(total)} kr</b></div><button class="btn pri" data-act="add-acc">+ Ny konto</button></div>
    <div class="grid-cards">${cardsHtml || '<div class="note">Ingen kontoer ennå.</div>'}</div>
    ${card(`<div class="card-h"><h2>Sparemål</h2><button class="btn sm" data-act="add-goal">+ Nytt sparemål</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">${goals.map((g) => `<button class="goal" data-edit-goal="${g.id}" style="border:0;text-align:left"><div class="card-h" style="width:100%"><b style="font-weight:600">${esc(g.name)}</b><span class="note">${n0((g.saved / g.target) * 100)} %</span></div>
        <div class="mono" style="font-size:18px">${n0(g.saved)} kr <span class="note">/ ${n0(g.target)} kr</span></div><div class="prog" style="height:8px;width:100%"><i style="width:${Math.min(100, (g.saved / g.target) * 100)}%;background:${g.color}"></i></div></button>`).join('') || '<div class="note">Ingen sparemål ennå.</div>'}</div>`, '', 'gap:16px')}
  </div>`;
}

/* ===================== Rapporter ===================== */

function reports() {
  const r = S.report;
  if (!r) return skel(400);
  const donut = conic(r.byCategory.map((c) => ({ value: c.amount, color: c.color })), r.total, 1, 'var(--line)');
  const topMax = r.merchants[0]?.amount || 1;
  const title = r.mode === 'year' ? r.from.slice(0, 4) : `${cap(monthName(r.from.slice(0, 7)))} ${r.from.slice(0, 4)}`;
  return `<div style="display:flex;flex-direction:column;gap:16px">
    <div class="card-h no-print"><div style="display:flex;gap:12px;align-items:center"><div class="seg"><button data-rap="month" aria-pressed="${u.rap === 'month'}">Måned</button><button data-rap="year" aria-pressed="${u.rap === 'year'}">År</button></div>
      <button class="btn sm" data-month="-1" aria-label="Forrige">‹</button><b>${title}</b><button class="btn sm" data-month="1" aria-label="Neste">›</button></div>
      <div style="display:flex;gap:10px"><a class="btn" href="/finans/api/transactions.csv?from=${r.from}&to=${r.to}">CSV</a><button class="btn pri" data-act="print">PDF-rapport</button></div></div>
    <div class="row-flex">
      ${card(`<div class="donut" style="background:${donut}"><div><span class="note" style="font-size:12px">Utgifter</span><span class="mono" style="font-size:19px;font-weight:600">${n0(r.total)} kr</span></div></div>
        <div style="flex:1 1 180px;display:flex;flex-direction:column;gap:9px">${r.byCategory.map((c) => `<div style="display:flex;align-items:center;gap:10px;font-size:13px"><span style="width:10px;height:10px;border-radius:3px;background:${c.color}"></span><span class="grow">${esc(c.category)}</span><span class="muted">${n0((c.amount / (r.total || 1)) * 100)} %</span><span class="mono" style="width:90px;text-align:right">${n0(c.amount)}</span></div>`).join('') || '<div class="note">Ingen utgifter i perioden.</div>'}</div>`, '', 'flex:1 1 380px;flex-direction:row;flex-wrap:wrap;gap:24px;align-items:center')}
      ${card(`<h2>Mest brukt hos</h2>${r.merchants.map((m) => `<div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13.5px"><span style="display:flex;align-items:center;gap:10px;min-width:0">${logo({ name: m.name, domain: m.domain }, 28, 8)}<span class="ell">${esc(m.name)} <span class="muted">· ${m.count} kjøp</span></span></span><span class="mono">${n0(m.amount)} kr</span></div><div class="prog"><i style="width:${(m.amount / topMax) * 100}%;background:var(--acc)"></i></div></div>`).join('') || '<div class="note">Ingen kjøp i perioden.</div>'}`, '', 'flex:1 1 300px;gap:12px')}
    </div>
    <section class="card" style="padding:10px 22px 16px"><div class="tbl-wrap"><table style="min-width:520px"><thead><tr><th>Måned</th><th style="text-align:right">Inn</th><th style="text-align:right">Ut</th><th style="text-align:right">Netto</th><th>Sparerate</th></tr></thead>
      <tbody>${r.months.map((m) => { const net = m.inn - m.ut; return `<tr style="cursor:default" class="mono"><td style="font-family:Geist,sans-serif">${cap(monthName(m.month))}</td><td style="text-align:right">${n0(m.inn)}</td><td style="text-align:right">${n0(m.ut)}</td><td style="text-align:right;color:${net >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${net >= 0 ? '+' : '−'}${n0(net)}</td><td class="muted">${m.inn ? n0((net / m.inn) * 100) + ' %' : '–'}</td></tr>`; }).join('')}</tbody></table></div></section>
  </div>`;
}

/* ===================== Innstillinger ===================== */

// Ollama-modellene på maskinen: installerte (velg til kvitteringer, tekst og søk) og anbefalte for Mac mini M4 16 GB,
// med «Installer» som laster ned i bakgrunnen og viser fremdrift.
// Tidsgrenser for AI-motorene (prompt 23, Innstillinger → AI og tolkning → TIDSGRENSER). Lagres som settings.aiTimeouts.
const AI_TO_DEF = { gemini: 20, groq: 15, roboflow: 15, ollama: 45, retries: 0, onTimeout: 'next' };
const AI_TO_STEPS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const AI_TO_THEN = [['next', 'Prøv neste motor'], ['ocr', 'Bruk lokal OCR'], ['queue', 'Legg i kø og prøv senere']];
const aiTo = (st) => ({ ...AI_TO_DEF, ...(st.aiTimeouts ?? {}) });
// ISO2: serveroppsett (AI-motorer, modeller, nøkler, tidsgrenser, SMB) kan bare endres av admin (bootstrap.canEditServer).
const canSrv = () => S.boot?.canEditServer !== false;
const SRV_NOTE = '<div class="note" style="font-size:12.5px">Settes opp av administrator.</div>';
function timeoutsBox(st, ro = false) {
  const to = aiTo(st), dis = ro ? ' disabled' : '';
  const steps = (v) => (AI_TO_STEPS.includes(v) ? AI_TO_STEPS : [...AI_TO_STEPS, v].sort((a, b) => a - b));
  const eng = [['gemini', 'Gemini', 'Tekst i skyen · aldri kvitteringer'], ['groq', 'Groq', 'Glimt-søk og kategorier'], ['roboflow', 'Roboflow', 'Strekkoder'], ['ollama', 'Ollama (lokal)', 'Reserve på hjemmeserveren']]
    .map(([k2, n, sd]) => `<label class="f">${n} · <span class="note" style="font-size:12px">${sd}</span><select class="inp" data-ai-to="${k2}"${dis}>${steps(to[k2]).map((v) => opt(v, `${v} s`, to[k2])).join('')}</select></label>`).join('');
  return `<div class="box" style="flex-direction:column;align-items:stretch;gap:10px;padding:16px"><div><b style="font-weight:600">Tidsgrenser</b><div class="note" style="font-size:12.5px">Hvor lenge hver motor får før den regnes som tidsavbrutt. Køen viser hvilken motor som ikke svarte.${ro ? ' Settes opp av administrator.' : ''}</div></div>
    <div class="form-grid">${eng}
      <label class="f">Nye forsøk · <span class="note" style="font-size:12px">Før den gir opp en motor (venter 1, 2 og 4 s)</span><select class="inp" data-ai-to="retries"${dis}>${[0, 1, 2, 3].map((v) => opt(v, v === 0 ? 'Ingen' : v === 1 ? '1 gang' : `${v} ganger`, to.retries)).join('')}</select></label>
      <label class="f">Ved tidsavbrudd · <span class="note" style="font-size:12px">Når grensen er nådd</span><select class="inp" data-ai-to="onTimeout"${dis}>${AI_TO_THEN.map(([v, l]) => opt(v, l, to.onTimeout)).join('')}</select></label></div>
    ${u.msg.aiTo ? `<span class="err-msg" style="font-size:12.5px">${esc(u.msg.aiTo)}</span>` : ''}</div>`;
}

function ollamaBox(st) {
  if (S.olm === undefined) { S.olm = null; loadOllamaModels(); }
  const o = S.olm;
  if (!o) return '<div style="grid-column:1/-1" class="note">Henter modellene fra Ollama …</div>';
  if (o.ok === false) return `<div style="grid-column:1/-1;display:flex;gap:10px;align-items:center" class="err-msg">${esc(o.error ?? 'Ollama svarer ikke')} <button class="btn sm ghost" data-olm="reload">Prøv igjen</button></div>`;
  const pull = (n) => (o.pulls ?? []).find((p) => p.name === n);
  const inst = o.installed ?? [];
  const sel = (key, label, filter, empty) => `<label class="f">${label}<select class="inp" data-set="${key}">${empty ? `<option value="">${esc(empty)}</option>` : ''}${inst.filter(filter).map((m) => `<option value="${esc(m.name)}"${(st[key] || '') === m.name ? ' selected' : ''}>${esc(m.name)}${m.size ? ` · ${m.size} GB` : ''}</option>`).join('')}</select></label>`;
  const row = (c) => {
    const p = pull(c.name), busy = p && !p.done;
    const right = c.installed ? '<span class="pill" style="background:var(--pos-soft,#16271d);color:var(--pos)">Installert</span>'
      : busy ? `<span style="display:flex;align-items:center;gap:8px;min-width:170px"><span style="flex:1;height:6px;border-radius:3px;background:var(--line);overflow:hidden"><span style="display:block;height:100%;width:${p.pct ?? 3}%;background:var(--acc)"></span></span><span class="mono" style="font-size:12px">${p.pct != null ? p.pct + ' %' : esc(p.status)}</span></span>`
      : c.tooBig ? '<span class="note" style="font-size:12px">For stor for 16 GB</span>'
      : `<button class="btn sm${c.rec ? ' pri' : ''}" data-olm="pull" data-name="${esc(c.name)}">Installer · ${c.size} GB</button>`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:var(--inner);${c.tooBig ? 'opacity:.55' : ''}">
      <span class="grow" style="min-width:0"><b style="font-weight:600" class="mono">${esc(c.name)}</b>${c.rec ? ' <span style="display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:99px;background:var(--surf2,var(--line));color:var(--acc-l,var(--acc));vertical-align:2px">Anbefalt</span>' : ''}${c.vision ? ' <span class="note" style="font-size:12px">· leser bilder</span>' : ''}
        <span class="note" style="display:block;font-size:12.5px">${esc(c.note)}</span>${p?.error ? `<span class="err-msg" style="display:block;font-size:12px">${esc(p.error)}</span>` : ''}</span>${right}</div>`;
  };
  const extra = inst.filter((m) => !(o.catalog ?? []).some((c) => c.installed && (c.name === m.name || `${c.name}:latest` === m.name)));
  return `<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--line);border-radius:14px">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b style="font-weight:600">Ollama-modeller</b><div class="note" style="font-size:12.5px">${inst.length} installert${o.version ? ` · Ollama ${esc(o.version)}` : ''} · ${esc(o.url)}. Anbefalingene passer for Mac mini M4 med 16 GB minne.</div></div><button class="btn sm ghost" data-olm="reload">Oppdater</button></div>
    <div class="form-grid">
      ${sel('ollamaTextModel', 'Tekst (Glimt-søk, sammendrag, kategorier)', () => true, 'Samme som kvitteringer')}
      ${sel('embedModel', 'Søk med vektorer (embeddings)', (m) => /embed/i.test(m.name), 'Av')}
    </div>
    ${(o.catalog ?? []).map(row).join('')}
    ${extra.length ? `<div class="note" style="font-size:12.5px">Andre installerte: ${extra.map((m) => `<span class="mono">${esc(m.name)}</span>${m.size ? ` (${m.size} GB)` : ''} <button class="link" style="font-size:12px" data-olm="del" data-name="${esc(m.name)}">slett</button>`).join(' · ')}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="inp mono" style="flex:1 1 220px;font-size:13px" data-olm-name placeholder="Annen modell fra ollama.com/library, f.eks. phi4-mini"><button class="btn" data-olm="pull-custom">Installer</button></div>
  </div>`;
}
let olmTimer = null;
async function loadOllamaModels() {
  try { S.olm = await api('/ai/ollama/models'); } catch (e) { S.olm = { ok: false, error: e.message }; }
  render();
  // Følg med på installeringer som pågår.
  clearTimeout(olmTimer);
  if ((S.olm?.pulls ?? []).some((p) => !p.done)) olmTimer = setTimeout(loadOllamaModels, 1500);
}
async function ollamaAction(t) {
  const a = t.dataset.olm;
  if (a === 'reload') { S.olm = null; render(); return loadOllamaModels(); }
  if (a === 'pull' || a === 'pull-custom') {
    const name = a === 'pull' ? t.dataset.name : t.closest('div').querySelector('[data-olm-name]').value.trim();
    if (!name) return;
    try { await api('/ai/ollama/pull', { method: 'POST', json: { model: name } }); } catch (e) { toast(e.message); }
    return loadOllamaModels();
  }
  if (a === 'del') {
    if (t.dataset.sure !== '1') { t.dataset.sure = '1'; t.textContent = 'bekreft sletting'; return; }
    try { S.olm = await api(`/ai/ollama/models/${encodeURIComponent(t.dataset.name)}`, { method: 'DELETE' }); } catch (e) { toast(e.message); }
    return render();
  }
}

// Flere Gemini-nøkler: reserver som tas i bruk når en konto har brukt opp kvoten. Bare de fire siste tegnene vises.
function gkeysBox() {
  if (S.gkeys === undefined) { S.gkeys = null; api('/ai/gemini-keys').then((r) => { S.gkeys = r.items ?? []; render(); }).catch(() => { S.gkeys = []; }); }
  const list = S.gkeys ?? [];
  const when = (t) => new Date(t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const badge = (k) => (k.status === 'ok' ? '<span class="pill" style="background:var(--pos-soft,#16271d);color:var(--pos)">Aktiv</span>'
    : `<span class="pill" style="background:var(--warn-soft);color:var(--neg)" title="${esc(k.reason ?? '')}">${esc(k.status === 'invalid' ? 'Ugyldig' : 'Brukt opp')} til ${esc(when(k.until))}</span>`);
  const rows = list.map((k, i) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--inner)">
      <span class="mono" style="width:22px;color:var(--muted)">${i + 1}.</span>
      <span class="grow" style="min-width:0"><b style="font-weight:600">${esc(k.label)}</b> <span class="note mono" style="font-size:12px">…${esc(k.last4)}</span>${k.lastOk ? `<span class="note" style="display:block;font-size:12px">Sist brukt ${esc(when(k.lastOk))}</span>` : ''}</span>
      ${badge(k)}
      ${k.status !== 'ok' ? `<button class="btn sm ghost" data-gk-act="reset" data-gk="${esc(k.id)}" title="Prøv nøkkelen igjen nå">Prøv igjen</button>` : ''}
      <button class="btn sm ghost" data-gk-act="test" data-gk="${esc(k.id)}">Test</button>
      ${!k.main && i > 1 ? `<button class="btn sm ghost" data-gk-act="up" data-gk="${esc(k.id)}" aria-label="Flytt opp">▲</button>` : ''}
      <button class="btn sm ghost" data-gk-act="del" data-gk="${esc(k.id)}" aria-label="Fjern">Fjern</button>
    </div>`).join('');
  return `<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--line);border-radius:14px">
    <div><b style="font-weight:600">Gemini-nøkler i rekkefølge</b><div class="note" style="font-size:12.5px">Når en nøkkel har brukt opp kvoten (per minutt, dag eller måned), brukes neste med en gang. Den første prøves igjen når kvoten nullstilles.</div></div>
    ${rows || '<div class="note" style="font-size:12.5px">Ingen nøkler ennå. Legg inn hovednøkkelen over, eller en reserve under.</div>'}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="inp" style="flex:1 1 140px" data-gk-label placeholder="Navn, f.eks. Konto 2"><input class="inp" type="password" style="flex:2 1 220px" data-gk-key placeholder="Ny Gemini API-nøkkel (AIza…)" autocomplete="off"><button class="btn" data-gk-act="add">+ Legg til reserve</button></div>
    ${S.gkeyMsg ? `<div class="${S.gkeyMsg.ok ? 'ok-msg' : 'err-msg'}" style="font-size:13px">${esc(S.gkeyMsg.text)}</div>` : ''}
  </div>`;
}
async function gkeyAction(t) {
  const act = t.dataset.gkAct, id = t.dataset.gk, list = S.gkeys ?? [];
  const call = async (path, opts) => { try { const r = await api(path, opts); S.gkeys = r.items ?? S.gkeys; return r; } catch (e) { S.gkeyMsg = { ok: false, text: e.message }; return null; } };
  S.gkeyMsg = null;
  if (act === 'add') {
    const root = t.closest('div').parentElement, key = root.querySelector('[data-gk-key]').value.trim(), label = root.querySelector('[data-gk-label]').value.trim();
    if (!key) { S.gkeyMsg = { ok: false, text: 'Lim inn nøkkelen først' }; return render(); }
    if (await call('/ai/gemini-keys', { method: 'POST', json: { label, key } })) { S.gkeyMsg = { ok: true, text: 'Reservenøkkelen er lagret' }; loadAi().then(render); }
  } else if (act === 'test') {
    t.disabled = true; t.textContent = 'Tester …';
    const r = await call(`/ai/gemini-keys/${encodeURIComponent(id)}/test`, { method: 'POST' });
    if (r) S.gkeyMsg = { ok: r.ok, text: r.message };
  } else if (act === 'reset') await call(`/ai/gemini-keys/${encodeURIComponent(id)}`, { method: 'PATCH', json: { reset: true } });
  else if (act === 'del') {
    if (t.dataset.sure !== '1') { t.dataset.sure = '1'; t.textContent = 'Bekreft'; return; }
    await call(`/ai/gemini-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }); loadAi().then(render);
  } else if (act === 'up') {
    const ids = list.filter((k) => !k.main).map((k) => k.id), i = ids.indexOf(id);
    if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; await call('/ai/gemini-keys/order', { method: 'PUT', json: { ids } }); }
  }
  render();
}

// Ikon og farge per punkt i innstillingslista (fargene er temaets tokens, så de virker i alle temaene).
const SET_ICONS = { gen: ['gear', 'var(--muted)'], look: ['look', 'var(--purple)'], meny: ['list', 'var(--blue)'], bol: ['dir', 'var(--gold)'],
  imp: ['imp', 'var(--blue)'], ai: ['ai', 'var(--acc-l)'], aks: ['aks', 'var(--pos)'], cat: ['cat', 'var(--purple)'], rule: ['rule', 'var(--gold)'],
  varsel: ['bell', 'var(--neg)'], mobil: ['key', 'var(--blue)'], data: ['backup', 'var(--pos)'] };
const SET_TABS = [['gen', 'Generelt', 'Navn, valuta, måned'], ['look', 'Utseende', 'Tema og sidemeny'], ['meny', 'Sidemeny', 'Rekkefølge og synlighet'], ['bol', 'Boliger', 'Ny bolig, deling og kategorier'], ['imp', 'Import', 'Bank, Excel, Finn-e-post og annonser'], ['ai', 'AI og tolkning', 'Modeller, ruting, jobber, forbruk og OCR'], ['aks', 'Aksjer · Trading 212', 'Nøkkel, miljø og synk'], ['cat', 'Kategorier', 'Farger og typer'], ['rule', 'Regler', 'Auto-kategorisering'],
  ['varsel', 'Varsler', 'Budsjett og kvitteringer'], ['mobil', 'Mobil og tilgang', 'App-tokens og snarveier'], ['data', 'Backup og data', 'Nedlasting, SMB-share og gjenoppretting']];

// Innstillinger → Sidemeny: dra, ▲▼ og bryter for vis/skjul. Endringene lagres med en gang.
function menuTab() {
  const { order, hidden } = navCfg();
  const rows = order.map((p, i) => {
    const hid = hidden.includes(p), fixed = NAV_FIXED.includes(p), label = esc(pageName(p)), custom = !!navLabels()[p];
    return `<div class="navcfg${hid ? ' off' : ''}" draggable="true" data-navcfg="${p}">
      <span class="grip" aria-hidden="true">⋮⋮</span><span class="no mono">${String(i + 1).padStart(2, '0')}</span>${icon(p, 18, 'var(--muted)')}<span class="lbl"><input class="navcfg-name" data-navcfg-name="${p}" value="${label}" placeholder="${esc(defaultName(p))}" maxlength="30" aria-label="Navn på ${esc(defaultName(p))}" spellcheck="false">${custom ? `<button type="button" class="navcfg-reset" data-navcfg-reset="${p}" title="Bruk standardnavnet «${esc(defaultName(p))}»" aria-label="Tilbakestill navnet til ${esc(defaultName(p))}">↺</button>` : ''}</span>
      <button type="button" class="mv" data-navcfg-move="${p}:-1" aria-label="Flytt ${label} opp" ${i ? '' : 'disabled'}>▲</button><button type="button" class="mv" data-navcfg-move="${p}:1" aria-label="Flytt ${label} ned" ${i < order.length - 1 ? '' : 'disabled'}>▼</button>
      ${fixed ? '<span class="always">Alltid</span>' : `<button type="button" class="toggle" role="switch" aria-checked="${!hid}" data-navcfg-tog="${p}" aria-label="Vis ${label} i sidemenyen" title="${hid ? 'Skjult' : 'Vises'}"></button>`}</div>`;
  }).join('');
  return `<div class="sub" style="font-size:13.5px;line-height:1.5;text-wrap:pretty">Dra punktene for å endre rekkefølgen i sidemenyen, eller bruk pilene. Klikk på et navn for å gi punktet et eget navn, og ↺ gir standardnavnet tilbake. Bryteren skjuler eller viser et menypunkt. Endringene lagres med en gang. Skjulte sider kan fortsatt åpnes fra lenker.</div>
    <div class="navcfg-list">${rows}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" data-act="nav-showall">Vis alle</button><button class="btn ghost" data-act="nav-reset">Tilbakestill rekkefølge</button></div>`;
}

const aiLogBox = () => {
  if (!S.aiLog) api('/ai/log').then((r) => { S.aiLog = r.items ?? []; render(); }).catch(() => { S.aiLog = []; });
  return `<div class="box" style="flex-direction:column;align-items:stretch;gap:8px;padding:16px"><div style="display:flex;align-items:center;gap:10px"><b style="font-weight:600;flex:1">AI-logg · siste kall</b><button class="btn sm ghost" data-act="ai-log">Oppdater</button></div>
        ${S.aiLog?.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:12.5px;width:100%"><thead><tr><th>Tid</th><th>Oppgave</th><th>Motor</th><th>Modell</th><th>ms</th><th>Status</th></tr></thead><tbody>${S.aiLog.map((l) => `<tr><td class="mono">${new Date(l.ts).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td>${esc(l.task ?? '')}</td><td>${esc(l.engine ?? '')}</td><td class="mono">${esc(l.model ?? '')}</td><td class="mono">${l.ms ?? ''}</td><td style="color:${l.status === 'ok' ? 'var(--pos)' : 'var(--neg)'}" title="${esc(l.error ?? '')}">${esc(l.status ?? '')}${l.error ? ` · ${esc(l.error.slice(0, 80))}` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="note" style="font-size:12.5px">${S.aiLog ? 'Ingen AI-kall ennå.' : 'Laster …'}</div>`}</div>`;
};
// Vanlige brukere: AI-oppsettet vises skrivebeskyttet (motorer, hvem gjør hva, tidsgrenser), og loggen viser egne kall.
function aiReadOnly(st) {
  const ai = S.ai, PROV = { ollama: 'Ollama · lokalt', gemini: 'Gemini · sky', groq: 'Groq · sky' };
  const ENG = { gemini: 'Gemini', groq: 'Groq', ollama: 'Ollama (lokalt)', roboflow: 'Roboflow + zbar', zbar: 'Bare zbar (lokalt)' };
  const model = st.provider === 'gemini' ? st.geminiModel : st.provider === 'groq' ? st.groqModel : st.ollamaModel;
  const row = (k2, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)"><span class="note">${esc(k2)}</span><b style="font-weight:500;text-align:right" class="mono">${esc(v ?? '–')}</b></div>`;
  const tasks = (ai?.tasks ?? [{ id: 'receipts', name: 'Les kvitteringer', engine: 'ollama' }, { id: 'search', name: 'Glimt-søk', engine: 'groq' }, { id: 'categorize', name: 'Kategorisering', engine: 'groq' }, { id: 'barcode', name: 'Strekkoder', engine: 'roboflow' }])
    .map((tk) => row(tk.name, ENG[st.aiTasks?.[tk.id] ?? tk.engine] ?? (st.aiTasks?.[tk.id] ?? tk.engine)));
  return `<div class="box" style="flex-direction:column;align-items:stretch;gap:6px;padding:16px"><div><b style="font-weight:600">AI-motorer</b>${SRV_NOTE}</div>
      ${row('Hovedmotor', PROV[st.provider] ?? st.provider)}${row('Modell', model || '–')}${row('Reserve', st.fallback ? 'På' : 'Av')}${row('Minste sikkerhet', `${st.minConf} %`)}</div>
    <div class="box" style="flex-direction:column;align-items:stretch;gap:6px;padding:16px"><div><b style="font-weight:600">Hvem gjør hva</b>${SRV_NOTE}</div>${tasks.join('')}</div>
    ${timeoutsBox(st, true)}
    ${aiLogBox()}`;
}

function settingsPage() {
  // ISO2: alle roller har hele FinansHub. Ukjente faner faller tilbake til første fane.
  const tabs = SET_TABS;
  if (u.setTab === 'bank') u.setTab = 'imp'; // «Bank og import» er slått sammen med Import (prompt 12)
  if (!tabs.some(([x]) => x === u.setTab)) u.setTab = tabs[0][0];
  const st = S.boot.settings, t = u.setTab, cur = tabs.find((x) => x[0] === t);
  let body = '';
  const sel = (key, options) => `<select class="inp" data-set="${key}">${options.map(([v, l]) => opt(v, l, st[key])).join('')}</select>`;
  if (t === 'gen') body = `<div class="form-grid">
    <label class="f">Visningsnavn<input class="inp" data-set="name" value="${esc(st.name)}" placeholder="Navnet ditt"></label>
    <label class="f">Valuta${sel('currency', [['NOK', 'NOK – norske kroner'], ['EUR', 'EUR – euro'], ['SEK', 'SEK – svenske kroner']])}</label>
    <label class="f">Måneden starter (lønningsdag)<select class="inp" data-set="monthStart">${Array.from({ length: 28 }, (_, i) => opt(i + 1, `${i + 1}. i måneden`, st.monthStart)).join('')}</select></label>
    <label class="f">Sparemål for året (kr)<input class="inp mono" data-set="yearGoal" inputmode="numeric" value="${st.yearGoal}"></label></div>`;
  // Prompt 34: det gamle AI-oppsettet (4 motorkort, løse felt, «Hvem gjør hva», glidebryter, testknapper) er erstattet av
  // AI-kontroll (scope finans: AI-valg · Tilkoblinger · Jobber · Forbruk). Lokal OCR-reserve blir værende under.
  else if (t === 'ai' && !S.aiLegacy) {
    const ai = S.ai;
    body = `<div data-aictl-finans class="fh-aictl"></div><div data-r48-mount class="fh-r48"></div>
      <div class="box" style="flex-direction:column;align-items:stretch;gap:8px;padding:16px"><div><b style="font-weight:600">Lokal OCR-reserve</b><div class="note" style="font-size:12.5px">Tesseract leser kvitteringen i containeren når AI feiler. Resultatet havner alltid til gjennomgang. ${ai?.ocr ? (ai.ocr.tesseract ? `Installert: ${esc(ai.ocr.tesseract)}` : 'Tesseract er ikke installert på serveren (bruk Docker-imaget).') : ''}</div></div>
        <button class="tog-row" data-act="ocr-toggle"${canSrv() ? '' : ' disabled'}><span class="grow"><b style="font-weight:500">Bruk lokal OCR når AI feiler</b></span><span class="toggle" role="switch" aria-checked="${!!(ai?.ocr?.enabled ?? st.ocrFallback ?? true)}"></span></button>
        <button class="tog-row" data-tog="ocrLowConf"${canSrv() ? '' : ' disabled'}><span class="grow"><b style="font-weight:500">Bruk også ved lav AI-sikkerhet</b><br><span class="note" style="font-size:12.5px">Sammenligner AI-svaret med lokal OCR når sikkerheten er under ${st.minConf} %</span></span><span class="toggle" role="switch" aria-checked="${!!st.ocrLowConf}"></span></button></div>`;
  }
  else if (t === 'ai' && !canSrv()) body = aiReadOnly(st);
  else if (t === 'ai') {
    const ai = S.ai;
    const models = ai?.ollama?.models?.length ? ai.ollama.models : ['qwen2.5vl:7b', 'gemma3:12b', 'llama3.2-vision:11b', 'minicpm-v'];
    if (!models.includes(st.ollamaModel)) models.unshift(st.ollamaModel);
    body = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      ${[['ollama', 'Ollama · lokalt', 'Bildet forlater aldri huset'], ['gemini', 'Gemini · sky', 'Tekst og søk · kvitteringer leses alltid lokalt'], ['groq', 'Groq · sky', 'Svært rask tekst, Llama-modeller']].map(([k2, n, s2]) => `<button class="prov" data-provider="${k2}" aria-pressed="${st.provider === k2}"><b><span class="radio"></span>${n}</b><span class="note" style="font-size:12.5px">${s2}</span></button>`).join('')}</div>
      <div class="form-grid">
        <label class="f">Ollama-adresse<input class="inp mono" style="font-size:13px" data-set="ollamaUrl" value="${esc(st.ollamaUrl)}"></label>
        <label class="f">Ollama-modell (kvitteringer, må lese bilder)<select class="inp" data-set="ollamaModel">${models.map((m) => opt(m, m, st.ollamaModel)).join('')}</select></label>
        ${ollamaBox(st)}
        <label class="f">Gemini-modell<input class="inp mono" style="font-size:13px" data-set="geminiModel" value="${esc(st.geminiModel)}"></label>
        <label class="f">Gemini API-nøkkel<input class="inp" type="password" data-set="geminiKey" value="" placeholder="${st.geminiKeySet ? '•••••••• lagret på serveren' : 'Lagres på serveren'}" autocomplete="off"></label>
        ${gkeysBox()}
        <label class="f">Groq-modell (tekst)<input class="inp mono" style="font-size:13px" data-set="groqModel" list="groq-models" value="${esc(st.groqModel ?? '')}" placeholder="llama-3.3-70b-versatile"></label>
        <label class="f">Groq-modell (bilder)<input class="inp mono" style="font-size:13px" data-set="groqVisionModel" list="groq-models" value="${esc(st.groqVisionModel ?? '')}" placeholder="meta-llama/llama-4-scout-17b-16e-instruct"></label>
        <datalist id="groq-models">${(ai?.groqModels ?? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b']).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
        <label class="f">Groq API-nøkkel · <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a><input class="inp" type="password" data-set="groqKey" value="" placeholder="${st.groqKeySet ? '•••••••• lagret på serveren' : 'gsk_…'}" autocomplete="off"></label>
        <label class="f">Roboflow API-nøkkel (valgfri) · <a href="https://app.roboflow.com/settings/api" target="_blank" rel="noopener">roboflow.com</a><input class="inp" type="password" data-set="roboflowKey" value="" placeholder="${st.roboflowKeySet ? '•••••••• lagret på serveren' : 'Lagres på serveren'}" autocomplete="off"></label>
        <label class="f">Roboflow arbeidsområde<input class="inp mono" style="font-size:13px" data-set="roboflowWorkspace" value="${esc(st.roboflowWorkspace ?? '')}" placeholder="sebastians-workspace-y3jnc"></label>
        <label class="f">Roboflow-modell for kvitteringer (prosjekt/versjon)<input class="inp mono" style="font-size:13px" data-set="roboflowModel" value="${esc(st.roboflowModel || st.roboflowWorkflow || '')}" placeholder="kvitteringer/1"></label>
        <label class="f">Roboflow-modell for strekkoder (valgfri)<input class="inp mono" style="font-size:13px" data-set="roboflowBarcodeModel" value="${esc(st.roboflowBarcodeModel ?? '')}" placeholder="barcodes/2"></label></div>
      <div class="box" style="flex-direction:column;align-items:stretch;gap:10px;padding:16px"><div><b style="font-weight:600">Hvem gjør hva</b><div class="note" style="font-size:12.5px">Motor per oppgave. Feiler den, prøves neste motor automatisk når reserve er på.</div></div>
        <div class="form-grid">${(ai?.tasks ?? [{ id: 'receipts', name: 'Les kvitteringer', engine: 'ollama' }, { id: 'search', name: 'Glimt-søk', engine: 'groq' }, { id: 'categorize', name: 'Kategorisering', engine: 'groq' }, { id: 'barcode', name: 'Strekkoder', engine: 'roboflow' }]).map((tk) => `<label class="f">${esc(tk.name)}<select class="inp" data-ai-task="${tk.id}">${(tk.id === 'barcode' ? [['roboflow', 'Roboflow + zbar'], ['zbar', 'Bare zbar (lokalt)']] : tk.id === 'receipts' ? [['ollama', 'Lokal AI (Ollama)']] /* prompt 52: aldri Gemini */ : [['gemini', 'Gemini'], ['groq', 'Groq'], ['ollama', 'Ollama (lokalt)']]).map(([v, l]) => opt(v, l, tk.id === 'receipts' ? 'ollama' : st.aiTasks?.[tk.id] ?? tk.engine)).join('')}</select></label>`).join('')}</div></div>
      ${timeoutsBox(st)}
      <div class="box" style="flex-direction:column;align-items:stretch;gap:8px;padding:16px"><div><b style="font-weight:600">Lokal OCR-reserve</b><div class="note" style="font-size:12.5px">Tesseract leser kvitteringen i containeren når AI feiler. Resultatet havner alltid til gjennomgang. ${ai?.ocr ? (ai.ocr.tesseract ? `Installert: ${esc(ai.ocr.tesseract)}` : 'Tesseract er ikke installert på serveren (bruk Docker-imaget).') : ''}</div></div>
        <button class="tog-row" data-act="ocr-toggle"><span class="grow"><b style="font-weight:500">Bruk lokal OCR når AI feiler</b></span><span class="toggle" role="switch" aria-checked="${!!(ai?.ocr?.enabled ?? st.ocrFallback ?? true)}"></span></button>
        <button class="tog-row" data-tog="ocrLowConf"><span class="grow"><b style="font-weight:500">Bruk også ved lav AI-sikkerhet</b><br><span class="note" style="font-size:12.5px">Sammenligner AI-svaret med lokal OCR når sikkerheten er under ${st.minConf} %</span></span><span class="toggle" role="switch" aria-checked="${!!st.ocrLowConf}"></span></button></div>
      <label class="f">Minste sikkerhet før bilaget merkes «Sjekk» · <b class="mono" style="color:var(--text)">${st.minConf} %</b><input type="range" min="50" max="99" value="${st.minConf}" data-set="minConf"></label>
      <button class="tog-row" data-tog="fallback"><span class="grow"><b style="font-weight:500">Bruk de andre motorene som reserve</b><br><span class="note" style="font-size:12.5px">Når hovedmotoren er utilgjengelig eller usikker. Slå av for å holde alt lokalt.</span></span><span class="toggle" role="switch" aria-checked="${!!st.fallback}"></span></button>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn ghost" data-act="test-ai">Test tilkobling</button>${['ollama', 'gemini', 'groq'].map((k2) => `<button class="btn ghost" data-test-engine="${k2}">Test ${k2 === 'groq' ? 'Groq' : k2 === 'gemini' ? 'Gemini' : 'Ollama'}</button>`).join('')}<button class="btn ghost" data-act="test-roboflow">Test Roboflow</button>${u.msg.ai ? `<span class="${u.msg.aiOk ? 'ok-msg' : 'err-msg'}">${esc(u.msg.ai)}</span>` : ''}</div>
      <div class="note" style="font-size:12.5px">Kvitteringsbilder sendes aldri til Gemini eller andre skytjenester – de leses bare lokalt. Gemini brukes bare til tekst der du har valgt det.</div>
      ${aiLogBox()}`;
  } else if (t === 'cat') body = `<div style="display:flex;flex-direction:column;gap:8px">${cats().map((c) => `<div class="edit-row"><input type="color" value="${c.color}" data-cat-field="color" data-id="${c.id}" aria-label="Farge"><input class="inp grow" value="${esc(c.name)}" data-cat-field="name" data-id="${c.id}" aria-label="Navn" style="flex:1 1 160px">
      <select class="inp" data-cat-field="kind" data-id="${c.id}" style="width:140px">${Object.entries(KINDS).map(([k2, l]) => opt(k2, l, c.kind)).join('')}</select><button class="del" data-del-cat="${c.id}" aria-label="Slett">×</button></div>`).join('')}
    <button class="add" data-act="add-cat">+ Ny kategori</button><div class="note" style="font-size:12.5px">Overføringer (f.eks. til sparekonto) telles verken som inntekt eller utgift.</div></div>`;
  else if (t === 'rule') body = `<div style="display:flex;flex-direction:column;gap:8px"><div class="sub" style="font-size:13px">Regler går foran AI-forslaget. Bruk * som jokertegn – «REMA*» treffer også «VARER REMA 1000». Rettelser du gjør ved bokføring blir nye regler automatisk.</div>
    ${S.boot.rules.map((r) => `<div class="edit-row"><input class="inp mono" style="flex:1 1 140px;font-size:13px" value="${esc(r.pattern)}" data-rule-field="pattern" data-id="${r.id}" aria-label="Mønster"><span class="muted">→</span><select class="inp" style="flex:1 1 180px" data-rule-field="categoryId" data-id="${r.id}">${catOpts(r.categoryId)}</select><button class="del" data-del-rule="${r.id}" aria-label="Slett">×</button></div>`).join('')}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="add" data-act="add-rule">+ Ny regel</button><button class="add" data-act="apply-rules">Bruk på ukategoriserte</button></div>${u.msg.rules ? `<div class="ok-msg">${esc(u.msg.rules)}</div>` : ''}</div>`;
  const bankPart = `<form data-form="csv" style="display:flex;flex-direction:column;gap:14px">
    <div class="form-grid"><label class="f">CSV-profil${sel('csvProfile', S.boot.profiles.map((p) => [p, p]))}</label><label class="f">Konto<select class="inp" name="accountId" required>${accOpts('', 'Velg konto')}</select></label></div>
    <label class="drop" style="flex-direction:row;justify-content:flex-start;text-align:left;padding:20px"><span class="ini" style="background:var(--inner);color:var(--acc-l)">↑</span><span><b style="font-weight:600">Importer CSV fra nettbanken</b><br><span class="note" style="font-size:12.5px">Duplikater hoppes over automatisk · regler brukes på nye rader</span></span><input type="file" name="file" accept=".csv,text/csv" hidden data-csv></label>
    ${u.msg.csv ? `<div class="${u.msg.csvOk ? 'ok-msg' : 'err-msg'}">${esc(u.msg.csv)}</div>` : ''}
    <div class="box" style="padding:16px;flex-wrap:wrap"><div><b style="font-weight:600">Open banking (PSD2)</b><div class="note" style="font-size:12.5px">Automatisk henting via Enable Banking · kommer i fase 3</div></div><span class="pill" style="background:var(--line);color:var(--text2);font-weight:400">Ikke koblet</span></div>
    </form>
    <div class="box" style="padding:16px;flex-direction:column;align-items:stretch;gap:12px"><div><b style="font-weight:600">Kvitteringer fra e-post (Proton Mail / IMAP)</b><div class="note" style="font-size:12.5px">Vedlegg og e-postkvitteringer hentes automatisk og havner i opplastingskøen. Finn-handler kan bruke samme postkasse med egen mappe.</div></div>
      <div data-mailpane style="--mp-acc:var(--acc);--mp-acc-ink:var(--on-acc,#1A0C04);--mp-card:var(--inner);--mp-line:var(--line);--mp-field:var(--bg)"></div></div>`;
  if (t === 'imp') body = `<div style="display:flex;flex-direction:column;gap:14px">${homeRulesBox()}${finnImportBox()}${impPage()}${bankPart}</div>`;
  else if (t === 'varsel') body = `<div style="display:flex;flex-direction:column;gap:8px">${[['autoCat', 'Auto-kategorisering', 'Bruk regler og AI-forslag'], ['aiSummaries', '✦ AI-sammendrag', 'Kort og lang beskrivelse av hver post, laget i bakgrunnen'], ['n80', 'Varsel ved 80 % av budsjett', 'Per kategori'], ['n100', 'Varsel når budsjett er brukt opp', 'Per kategori'], ['nRc', 'Ny kvittering til gjennomgang', 'Vises som merke i menyen'], ['nFast', 'Påminnelse om faste trekk', 'Dagen før trekkdato']]
    .map(([k2, n, s2]) => `<button class="tog-row" data-tog="${k2}"><span class="grow"><b style="font-weight:500">${n}</b><br><span class="note" style="font-size:12.5px">${s2}</span></span><span class="toggle" role="switch" aria-checked="${!!st[k2]}"></span></button>`).join('')}
    <div class="note" style="font-size:12.5px">Varsler vises i FinansHub og i mobilappen. Push-varsler krever at appen er installert på hjemskjermen.</div></div>`;
  else if (t === 'mobil') {
    const when = (ms) => (ms ? new Date(ms).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
    body = `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="sub" style="font-size:13px">Mobilappen åpnes på <b class="mono">/finans/</b> eller i de native appene, og logger inn med brukernavn og passord (og 2FA-kode hvis det er på).</div>
    <div class="sub" style="font-size:13px">Personlige tokens gir tilgang til FinansHub-API-et uten innlogging, f.eks. for iOS-snarveien som laster opp kvitteringer (<span class="mono">POST /finans/api/receipts</span>), Home Assistant, Excel Power Query eller skript (<span class="mono">Authorization: Bearer fh_pat_…</span>). De gir aldri tilgang til resten av homelab. Bare hashen lagres.</div>
    ${(S.tokens ?? []).map((tk) => `<div class="edit-row"><span class="grow"><b style="font-weight:500">${esc(tk.name)}</b>${tk.expired ? ' <span class="pill" style="background:var(--warn-soft);color:var(--acc-l)">utløpt</span>' : ''}<br><span class="note mono" style="font-size:12px">${tk.scopes.join(' · ')}</span><br><span class="note" style="font-size:12px">Laget ${when(tk.created)} · ${tk.lastUsed ? 'sist brukt ' + when(tk.lastUsed) : 'aldri brukt'} · ${tk.expires ? (tk.expired ? 'utløp ' : 'utløper ') + when(tk.expires) : 'utløper aldri'}</span></span><button class="btn sm danger" data-del-token="${tk.id}">Trekk tilbake</button></div>`).join('') || '<div class="note">Ingen tokens.</div>'}
    <form data-form="token" class="box" style="flex-direction:column;align-items:stretch;gap:12px;padding:16px"><b style="font-weight:600">Nytt token</b>
      <div class="form-grid"><label class="f">Navn<input class="inp" name="name" placeholder="F.eks. iPhone-snarvei" required></label>
      <label class="f">Utløper<select class="inp" name="expires">${[['30d', 'Om 30 dager'], ['90d', 'Om 90 dager'], ['1y', 'Om 1 år'], ['never', 'Aldri']].map(([v, l]) => opt(v, l, '90d')).join('')}</select></label></div>
      <div class="scope-grid">${[['finance:read', 'Lese alt'], ['read:transactions', 'Lese transaksjoner'], ['read:summary', 'Lese oversikt'], ['read:budget', 'Lese budsjett'], ['receipts:write', 'Laste opp kvitteringer'], ['write:transactions', 'Endre transaksjoner'], ['finance:write', 'Endre alt']].map(([v, l]) => `<label class="scope"><input type="checkbox" name="scope" value="${v}" ${['finance:read', 'receipts:write'].includes(v) ? 'checked' : ''}><span><b class="mono" style="font-size:12px;font-weight:500">${v}</b><br><span class="note" style="font-size:12px">${l}</span></span></label>`).join('')}</div>
      <div><button class="btn sm pri">Lag token</button></div></form>
    ${u.msg.token ? `<div class="box" style="flex-direction:column;align-items:stretch"><span class="ok-msg">Kopier tokenet nå – det vises bare én gang:</span><div style="display:flex;gap:10px;align-items:center"><code class="mono grow" style="word-break:break-all;user-select:all">${esc(u.msg.token)}</code><button class="btn sm" data-copy="${esc(u.msg.token)}">Kopier</button></div></div>` : ''}</div>`;
  }
  else if (t === 'data') body = backupTab();
  else if (t === 'meny') body = menuTab();
  else if (t === 'look') body = lookTab();
  else if (t === 'bol') body = bolSettings();
  else if (t === 'aks') body = aksSettings();
  return `<div class="row-flex">
    <nav class="card set-nav">${tabs.map(([k2, n, s2]) => { const [ic, col] = SET_ICONS[k2] ?? ['gear', 'var(--muted)']; return `<button data-settab="${k2}" aria-current="${t === k2}"><span class="set-ic" style="--ic:${col}">${icon(ic, 16)}</span><span class="set-tx"><span>${n}</span><small>${s2}</small></span></button>`; }).join('')}</nav>
    ${card(`<div><h2 style="font-size:18px">${cur[1]}</h2><div class="note" style="font-size:13px">${cur[2]}</div></div>${body}${u.msg.set ? `<div class="ok-msg">${esc(u.msg.set)}</div>` : ''}`, '', 'flex:1 1 480px;padding:24px;gap:18px')}
  </div>`;
}

/* ===================== Modaler ===================== */

// Kvitteringer uten lagret bilde (f.eks. e-postkvitteringer og demodata): tegnes som papirkvittering fra varelinjene AI leste.
function paperReceipt(r) {
  const vat = (r.vat ?? []).reduce((a, v) => a + (+v.amount || 0), 0);
  return `<div class="paper-rc mono"><b>${esc((r.merchant ?? 'Kvittering').toUpperCase())}</b><span class="c">${r.date ? dd(r.date) + '.' + r.date.slice(0, 4) : ''}</span><hr>
    ${(r.lines ?? []).map((l) => `<span class="ln"><span>${esc(l.description ?? '')}</span><span>${n2(l.amount)}</span></span>`).join('') || '<span class="c">Ingen varelinjer lest</span>'}<hr>
    <span class="ln tot"><span>TOTAL</span><span>${r.total != null ? n2(r.total) : '–'}</span></span>${vat ? `<span class="ln"><span>herav MVA</span><span>${n2(vat)}</span></span>` : ''}
    <span class="c" style="margin-top:10px">Ingen bildefil lagret – vist fra Glimt-utlesingen</span></div>`;
}

// Originalene bak en transaksjon: kvitteringsbildet/PDF-en med zoom, og bankraden slik den kom fra banken.
function origModal(m, close) {
  const o = S.orig?.[m.id], t = S.tx?.items.find((x) => x.id === m.id);
  const seg = `<div class="seg" style="border-radius:12px" role="tablist">${[['receipt', 'Kvittering'], ['bank', 'Banktransaksjon']].map(([k2, l]) => `<button type="button" role="tab" data-orig-view="${k2}" aria-pressed="${m.view === k2}" style="flex:1;height:38px">${l}</button>`).join('')}</div>`;
  let body = skel(260);
  if (o && m.view === 'receipt') {
    const r = o.receipt;
    body = !r ? `<div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:center">Ingen kvittering vedlagt<label class="btn sm" style="cursor:pointer">Legg ved kvittering<input type="file" accept="image/*,application/pdf" data-attach-rc="${m.id}" hidden></label></div>`
      : !r.fileUrl ? paperReceipt(r)
      : r.mime === 'application/pdf' ? `<iframe class="orig-pdf" src="${esc(r.fileUrl)}" title="Kvittering (PDF)"></iframe>`
      : `<div class="orig-img${u.origZoom ? ' zoom' : ''}" data-act="orig-zoom" title="${u.origZoom ? 'Zoom ut' : 'Zoom inn'}"><img src="${esc(r.fileUrl)}" alt="Original kvittering${r.merchant ? ' fra ' + esc(r.merchant) : ''}"></div>`;
  } else if (o) {
    const b = o.bankRow;
    const rows = (pairs) => pairs.filter(([, v]) => v != null && v !== '').map(([k2, v]) => `<div class="kv-line"><span class="sub">${k2}</span><span class="mono" style="text-align:right;word-break:break-word">${esc(v)}</span></div>`).join('');
    body = !b ? `<div class="empty">${t?.source === 'receipt' ? 'Transaksjonen ble laget fra en kvittering og har ingen bankrad.' : 'Ingen bankrad lagret. Transaksjonen er lagt inn manuelt eller importert før FinansHub tok vare på bankradene.'}</div>`
      : `<div class="orig-bank">${rows([['Dato', b.bookingDate], ['Rentedato', b.valueDate], ['Forklaring', b.description], [b.amount < 0 ? 'Ut' : 'Inn', n2(Math.abs(b.amount)) + ' kr'], ['Konto', b.account], ['Bank', b.bank], ['Arkivref.', b.archiveReference], ['Kilde', [b.source, b.file].filter(Boolean).join(' · ')], ['Importert', b.importedAt ? new Date(b.importedAt).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : null]])}</div>
        <details class="orig-raw"><summary>Rådata (JSON)</summary><pre class="mono">${esc(JSON.stringify({ bookingDate: b.bookingDate, valueDate: b.valueDate, description: b.description, amount: b.amount, account: b.account, archiveReference: b.archiveReference, source: b.source, raw: b.raw }, null, 2))}</pre></details>`;
  }
  const dl = o && m.view === 'receipt' && o.receipt?.fileUrl ? `<a class="btn ghost" href="${esc(o.receipt.fileUrl)}" download>Last ned</a>` : o?.bankRow && m.view === 'bank' ? '<button type="button" class="btn ghost" data-act="orig-dl">Last ned</button>' : '';
  const share = o && (m.view === 'bank' ? o.bankRow : o.receipt?.fileUrl) && navigator.share ? '<button type="button" class="btn ghost" data-act="orig-share">Del</button>' : '';
  return `<div class="modal" data-modal><div class="dlg orig-modal" role="dialog" aria-modal="true"><div class="card-h"><div><h2 style="font-size:19px">${m.view === 'bank' ? 'Original banktransaksjon' : 'Original kvittering'}</h2><div class="note" style="font-size:13px">${esc(t?.description ?? '')}${t ? ' · ' + dd(t.date) : ''}</div></div>${close}</div>
    ${seg}${body}${dl || share ? `<div style="display:flex;gap:10px;justify-content:flex-end">${share}${dl}</div>` : ''}</div></div>`;
}

function modalHtml() {
  const m = u.add;
  if (!m) return '';
  const close = sheetBtn('Lukk', 'data-act="close-modal"', 'sec');
  if (m.type === 'tx') return `<div class="modal" data-modal><form data-form="tx"><div class="card-h"><h2 style="font-size:19px">Ny transaksjon</h2>${close}</div>
    <div class="seg" style="border-radius:12px"><button type="button" data-txtype="ut" aria-pressed="${m.kind !== 'inn'}" style="flex:1;height:38px">Utgift</button><button type="button" data-txtype="inn" aria-pressed="${m.kind === 'inn'}" style="flex:1;height:38px">Inntekt</button></div>
    <label class="f">Beskrivelse<input class="inp" name="description" required placeholder="F.eks. Rema 1000" autofocus></label>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Beløp (kr)<input class="inp hl mono" name="amount" required inputmode="decimal"></label><label class="f" style="flex:1">Dato<input class="inp" type="date" name="date" value="${today()}" required></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Kategori<select class="inp" name="categoryId">${opt('', 'Automatisk (regler)', '')}${catOpts(m.kind === 'inn' ? cats('income')[0]?.id : '')}</select></label><label class="f" style="flex:1">Konto<select class="inp" name="accountId">${accOpts(accs()[0]?.id, '–')}</select></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Bolig<select class="inp" name="folderId">${opt('', 'Ingen', '')}${(S.txFolders ?? []).map((f) => opt(f.id, f.name, '')).join('')}</select></label><label class="f" style="flex:1">Notat<input class="inp" name="note"></label></div>
    <button class="btn pri" style="height:50px;margin-top:4px">Lagre</button></form></div>`;
  if (m.type === 'orig') return origModal(m, close);
  if (m.type === 'acc') { const a = accs().find((x) => x.id === m.id) ?? { type: 'checking' }; return `<div class="modal" data-modal><form data-form="acc"><div class="card-h"><h2 style="font-size:19px">${m.id ? 'Endre konto' : 'Ny konto'}</h2>${close}</div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Navn<input class="inp" name="name" required value="${esc(a.name ?? '')}" placeholder="Brukskonto"></label><label class="f" style="flex:1">Bank<input class="inp" name="bank" value="${esc(a.bank ?? '')}" placeholder="DNB"></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Type<select class="inp" name="type">${Object.entries(ACC_TYPES).map(([k2, l]) => opt(k2, l, a.type)).join('')}</select></label><label class="f" style="flex:1">Siste fire siffer<input class="inp mono" name="last4" inputmode="numeric" maxlength="4" value="${esc(a.last4 ?? '')}" placeholder="1234"></label></div>
    <label class="f">Startsaldo (kr) – saldo før første transaksjon<input class="inp mono" name="openingBalance" inputmode="decimal" value="${a.openingBalance ?? 0}"></label>
    <label class="f">Notat<input class="inp" name="note" value="${esc(a.note ?? '')}" placeholder="F.eks. 3,9 % rente"></label>
    <div class="note" style="font-size:12px">Lagre aldri fullt konto- eller kortnummer – bare de fire siste sifrene.</div>
    <div style="display:flex;gap:10px">${m.id ? '<button type="button" class="btn danger" data-act="del-acc">Slett</button>' : ''}<button class="btn pri" style="flex:1;height:50px">Lagre</button></div></form></div>`; }
  if (m.type === 'goal') { const g = S.boot.goals.find((x) => x.id === m.id) ?? {}; return `<div class="modal" data-modal><form data-form="goal"><div class="card-h"><h2 style="font-size:19px">${m.id ? 'Endre sparemål' : 'Nytt sparemål'}</h2>${close}</div>
    <label class="f">Navn<input class="inp" name="name" required value="${esc(g.name ?? '')}"></label>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Spart (kr)<input class="inp mono" name="saved" inputmode="decimal" value="${g.saved ?? 0}"></label><label class="f" style="flex:1">Mål (kr)<input class="inp mono" name="target" inputmode="decimal" required value="${g.target ?? ''}"></label><label class="f">Farge<input type="color" name="color" value="${g.color ?? 'var(--ok)'}"></label></div>
    <div style="display:flex;gap:10px">${m.id ? '<button type="button" class="btn danger" data-act="del-goal">Slett</button>' : ''}<button class="btn pri" style="flex:1;height:50px">Lagre</button></div></form></div>`; }
  if (m.type === 'rec') { const r = S.recurring?.find((x) => x.id === m.id) ?? { interval: 'monthly', day: 1 }; return `<div class="modal" data-modal><form data-form="rec"><div class="card-h"><h2 style="font-size:19px">${m.id ? 'Endre fast utgift' : 'Ny fast utgift'}</h2>${close}</div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:2">Navn<input class="inp" name="name" required value="${esc(r.name ?? '')}" placeholder="Spotify"></label><label class="f" style="flex:1">Beløp (kr)<input class="inp mono" name="amount" required inputmode="decimal" value="${r.amount ?? ''}"></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Intervall<select class="inp" name="interval">${[['monthly', 'Månedlig'], ['yearly', 'Årlig'], ['weekly', 'Ukentlig']].map(([k2, l]) => opt(k2, l, r.interval)).join('')}</select></label><label class="f" style="flex:1">Trekkdag<input class="inp mono" name="day" type="number" min="1" max="31" value="${r.day}"></label><label class="f" style="flex:1">Måned (årlig)<input class="inp mono" name="month" type="number" min="1" max="12" value="${r.month ?? ''}"></label></div>
    <div style="display:flex;gap:10px"><label class="f" style="flex:1">Kategori<select class="inp" name="categoryId">${opt('', '–', r.categoryId)}${catOpts(r.categoryId)}</select></label><label class="f" style="flex:1">Konto<select class="inp" name="accountId">${accOpts(r.accountId, '–')}</select></label></div>
    <div style="display:flex;gap:10px">${m.id ? '<button type="button" class="btn danger" data-act="del-rec">Slett</button>' : ''}<button class="btn pri" style="flex:1;height:50px">Lagre</button></div></form></div>`; }
  if (m.type === 'wipe') return `<div class="modal" data-modal><form data-form="wipe"><div class="card-h"><h2 style="font-size:19px">Slett alle økonomidata</h2>${close}</div>
    <div class="sub">Dette sletter alle transaksjoner, kvitteringer, kontoer, budsjetter, faste utgifter og sparemål. Kategorier, regler og innstillinger beholdes. Kan ikke angres.</div>
    <label class="f">Skriv SLETT for å bekrefte<input class="inp" name="confirm" autocomplete="off" required></label><button class="btn danger" style="height:50px">Slett alt</button></form></div>`;
  return '';
}

/* ===================== Tegning og ruting ===================== */

const PAGE_FN = { ov: overview, tx: transactions, ai: aiPage, filter: filterPage, kv: receipts, bud: budget, fast: recurring, konto: accounts, rap: reports, inn: settingsPage, ...MODULE_FN };

let mailPaneEl = null, aiCtlEl = null, aiCtlTab;
export function draw() {
  const el = root();
  const scroll = window.scrollY;
  const focus = document.activeElement?.closest('[data-form] input, [data-tx-field], [data-rc-field], [data-r48f]') ? { sel: focusSel(document.activeElement), pos: document.activeElement.selectionStart } : null;
  applyTheme();
  rcpBefore52(el); // prompt 52: kvitteringspanelet beholder sin egen scroll mellom tegningene
  el.innerHTML = shell(PAGE_FN[u.page]());
  // E-postimporten (felles med Homelab-innstillingene) monteres i Innstillinger → Import.
  const mp = el.querySelector('[data-mailpane]');
  if (mp) { if (mailPaneEl) mp.replaceWith(mailPaneEl); else { mailPaneEl = mp; import('/assets/js/settings-mail.js').then((m) => m.mailPane(mp)).catch(() => { mp.innerHTML = '<div class="note">Kunne ikke laste e-postoppsettet.</div>'; }); } }
  // Prompt 34: AI-kontroll i Innstillinger → AI (samme element mellom tegningene, så panelet ikke flimrer).
  const ac = el.querySelector('[data-aictl-finans]');
  if (ac) {
    if (aiCtlEl) ac.replaceWith(aiCtlEl); else aiCtlEl = ac;
    import('/assets/js/ai-control.js').then((m) => m.mountAiControl(aiCtlEl, { variant: 'web', scope: 'finans', theme: design() === 'lys' ? 'papir' : 'finans', admin: canSrv(), tab: aiCtlTab, onTab: (x) => { aiCtlTab = x; } }))
      .catch(() => { S.aiLegacy = true; draw(); });
  }
  // Prompt 48: Innstillinger → AI → Kvitteringer (Mac-OCR og stegene i kjeden).
  const r48 = el.querySelector('[data-r48-mount]');
  if (r48) import('/assets/js/receipts48-set.js').then((m) => m.mountReceipts48(r48)).catch(() => { r48.innerHTML = '<div class="note">Kunne ikke laste kvitteringsoppsettet.</div>'; });
  if (u.page === 'dir') afterB42(el);
  window.scrollTo(0, scroll);
  rcpAfter52(el); rcpGone52(); // prompt 52
  window.fhLoaded?.(); // fjerner lasteskjermen fra index.html (loader.js)
  if (focus?.sel) { const f = el.querySelector(focus.sel); if (f) { f.focus(); try { f.setSelectionRange(focus.pos, focus.pos); } catch {} } }
  if (u.hlFocus && el.querySelector('.rc-hlr.hit,[data-hl-first]')) { u.hlFocus = false; requestAnimationFrame(() => hlFocus(el)); }
}
const focusSel = (e) => (e.name ? `[data-form] input[name="${e.name}"]` : e.dataset.txField ? `[data-tx-field="${e.dataset.txField}"]` : e.dataset.rcField ? `[data-rc-field="${e.dataset.rcField}"]` : e.dataset.r48f ? `[data-r48f="${e.dataset.r48f}"]${e.dataset.i != null ? `[data-i="${e.dataset.i}"]` : ''}` : null);

const loadTxFolders = async () => { S.txFolders = await api('/folders').catch(() => []); };
const loadAiPage = async () => { [S.aiHist, S.aiSugg] = await Promise.all([api('/search/history').catch(() => []), api('/search/suggestions').then(suggList).catch(() => [])]); };
// Personlig oppsett fra homelab (/api/me/layout). Mangler endepunktet, brukes FinansHubs egne prefs.
async function loadLayout() {
  if (S.layout !== undefined) return;
  try { const r = await fetch('/api/me/layout', { headers: { Accept: 'application/json' } }); S.layout = r.ok && r.headers.get('content-type')?.includes('json') ? await r.json() : null; } catch { S.layout = null; }
  S.layoutOk = !!S.layout;
}
const LOADERS = { ov: [loadSummary], tx: [loadTx, loadTxFolders], ai: [loadAiPage, loadTasks], filter: [loadFilter], kv: [loadReceipts], bud: [loadSummary], fast: [loadRecurring], konto: [], rap: [loadReport], inn: [], ...MODULE_LOADERS };
// ISO2: alle roller har hele FinansHub (eget regnskap per bruker).
const allowed = () => true;
export async function load(page = u.page) {
  try { await Promise.all([loadLayout(), ...LOADERS[page].map((f) => f())]); } catch (e) { toast(e.message); }
  if (page === 'inn' && u.setTab === 'mobil') S.tokens = await api('/tokens').catch(() => []);
  if (page === 'inn' && u.setTab === 'data') await loadBackup().catch((e) => toast(e.message));
  if (page === 'inn' && u.setTab === 'aks') await loadStocksSettings().catch((e) => toast(e.message));
  if (page === 'inn' && (u.setTab === 'imp' || u.setTab === 'bank')) await Promise.all([loadImpTpl(), loadHomeRules()]);
  if (page === 'inn' && u.setTab === 'bol') await loadBolSettings().catch((e) => toast(e.message));
  render();
  schedulePoll();
}
let pollT;
function schedulePoll() {
  clearTimeout(pollT);
  const busy = (S.receipts ?? []).some((r) => r.status === 'pending' || r.status === 'processing') || (S.summary?.review ?? []).some((r) => r.status !== 'needs_review');
  if (busy) pollT = setTimeout(async () => { await refreshAll(); }, 2000);
}
export async function refreshAll() { await loadBoot(); await load(); }

// Hopp til Innstillinger → Utseende bare rett etter et manuelt temabytte (sessionStorage fh_jump), aldri ved første oppstart.
let jumpChecked = false;
function takeJump() {
  if (jumpChecked) return false;
  jumpChecked = true;
  try { const j = sessionStorage.getItem('fh_jump') === '1'; sessionStorage.removeItem('fh_jump'); return j; } catch { return false; }
}
let scrollMem = null; // lages først når desktop-visningen er i bruk
export function route() {
  if (takeJump()) { u.setTab = 'look'; if (!location.hash.startsWith('#/inn')) { location.replace('#/inn'); } }
  let p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0];
  // Prompt 30: #/kv?rc=<id>&hl=tomat eller #/tx?tx=<id>&hl=tomat åpner med markering av søkeordet i kvitteringen.
  const hq = new URLSearchParams(location.hash.split('?')[1] ?? '');
  if (hq.get('hl')) { u.hl = hq.get('hl'); u.hlOff = false; u.hlFocus = true; if (hq.get('rc')) { u.selRc = hq.get('rc'); u.hlRc = hq.get('rc'); } if (hq.get('tx')) u.sel = +hq.get('tx'); }
  // Matplan er en Homelab-fane; gamle lenker til FinansHub-siden sendes dit.
  if (p === 'mat') { location.replace('/#/matplan'); return; }
  // Gamle lenker til Import-siden åpner Innstillinger → Import.
  if (p === 'imp') { u.setTab = 'imp'; location.replace('#/inn'); return; }
  const next = PAGE_FN[p] && allowed(p) ? p : 'ov';
  const entered = next !== u.page;
  if (entered) { u.page = next; u.msg = {}; u.bolScopeOff = false; }
  if (next === 'filter' && (entered || location.hash.includes('?'))) enterFilter();
  if (next !== 'inn') { try { sessionStorage.removeItem('fh_jump'); } catch {} } // hoppet gjelder bare rett etter byttet
  draw();
  // Prompt 23: tilbake (popstate/hash) gir samme scrollposisjon som før, nye sider åpner øverst.
  (scrollMem ??= scrollMemory()).enter(next);
  if (entered && next === 'ai') document.querySelector('[data-ai-page-input]')?.focus();
  load();
}

/* ===================== Hendelser ===================== */

const busyWrap = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };
const patchTx = busyWrap(async (id, body) => { await api(`/transactions/${id}`, { method: 'PATCH', json: body }); await Promise.all([loadTx(), loadBoot()]); render(); });
const patchRc = busyWrap(async (id, body) => { const r = await api(`/receipts/${id}`, { method: 'PATCH', json: body }); S.receipts = S.receipts.map((x) => (x.id === id ? r : x)); render(); });
const saveSet = busyWrap(async (body) => { S.boot.settings = await api('/settings', { method: 'PUT', json: body }); render(); });

async function uploadFiles(files) {
  // Prompt 48: bilder leses av kjeden på serveren mens vi venter (Mac-OCR → Tesseract → Gemini), så skjemaet åpnes ferdig utfylt.
  let i = 0;
  for (const f of files) {
    i++;
    if (/^image\//.test(f.type)) toast(files.length > 1 ? `Leser kvittering ${i} av ${files.length} …` : 'Leser kvitteringen …');
    try { const r = await uploadReceipt(f); if (r.pending48) toast(r.message); else u.selRc = r.id; } catch (e) { toast(`${f.name}: ${e.message}`); }
  }
  location.hash = '#/kv';
  await refreshAll();
}

// AI-søket kjører som jobb (prompt 25): POST /search/ai med «Prefer: respond-async». Raske svar kommer direkte (200);
// ellers svarer serveren 202 {jobId}, og /jobs/:id gir fremdrift til den er ferdig. Ingen fast klient-timeout:
// serveren eier motorgrensene. Eldre servere uten jobber svarer synkront som før (og 404 på /jobs gir samme vei).
let aiRun = 0;
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
async function aiLimits() {
  if (S.aiLimits !== undefined) return S.aiLimits;
  S.aiLimits = await api('/ai/limits').catch(() => null);
  return S.aiLimits;
}
const engName = (k) => ({ ollama: 'Ollama', gemini: 'Gemini', groq: 'Groq', roboflow: 'Roboflow' }[k] ?? null);
function paintAiJob() {
  // Prompt 42: «Glimt tenker … 1,4 s» med tankestegene (oppdateres hvert 100 ms uten å tegne siden på nytt).
  if (u.ai?.think) { const t = document.querySelector('[data-t42]'); if (t) { const tmp = document.createElement('div'); tmp.innerHTML = thinkHtml(u.ai.think); t.replaceWith(tmp.firstElementChild); } else render(); return; }
  // Oppdaterer bare teksten og linjen, så resten av siden ikke tegnes på nytt hvert sekund.
  const box = document.querySelector('[data-ai-job]');
  if (!box || !u.ai?.busy) return;
  const tmp = document.createElement('div'); tmp.innerHTML = aiProgress(u.ai);
  box.querySelector('[data-ai-job-text]').textContent = tmp.querySelector('[data-ai-job-text]').textContent;
  box.querySelector('[data-ai-job-bar]').setAttribute('style', tmp.querySelector('[data-ai-job-bar]').getAttribute('style'));
}
async function askAi(text, force = false) {
  const qText = String(text ?? '').trim();
  const run = ++aiRun;
  u.aiDraft = qText;
  u.aiCtl?.abort();
  const ctl = (u.aiCtl = new AbortController());
  const prov = S.boot?.settings?.provider;
  u.ai = { ...(u.ai ?? {}), q: qText, busy: true, answer: '', hits: [], plainFirst: false, notice: null, job: null, jobId: null, t0: Date.now(), engineGuess: engName(prov) };
  render();
  aiLimits().then((l) => { const lim = l?.engines?.[prov]; if (run === aiRun && u.ai?.busy && !u.ai.job && lim) { u.ai.limitGuess = typeof lim === 'number' ? lim : lim.limitS ?? lim.timeoutS ?? null; } });
  const tick = setInterval(() => { if (run !== aiRun || !u.ai?.busy) return clearInterval(tick); paintAiJob(); }, 100);
  const live = () => run === aiRun && !ctl.signal.aborted;
  try {
    // Prompt 40: Glimt svarer først med strukturert svar og kort (POST /search/ask). 404 eller ingen kort → AI-søket som før.
    // Prompt 42: tankestegene strømmes (POST /search/ask/stream) og vises som «Glimt tenker … 1,4 s».
    let think = null;
    // Prompt 45: den felles Glimt-agenten (module finance) først: forhandler, beløp, periode, varelinjer. Treff blir kort.
    if (!force) {
      const ag = await agent(qText, 'finance', {}, { signal: ctl.signal }).catch((e) => (e.name === 'AbortError' ? null : { err: e.message }));
      if (!live()) return;
      if (ag?.err) { u.ai = { q: qText, busy: false, answer: ag.err, hits: [], suggestions: u.ai?.suggestions }; render(); return; }
      if (ag && !isPlain(ag)) {
        const cards = ag.results.map((r) => ({ kind: r.kind === 'receipt' ? 'receipt' : r.kind === 'transaction' ? 'tx' : r.kind, id: r.id, name: r.title, note: [r.subtitle, r.date].filter(Boolean).join(' · '), amount: typeof r.amount === 'number' ? Math.abs(r.amount) : null, domain: r.domain }));
        const g = glimtFrom(qText, { text: agentFull(ag), cards, source: 'Glimt', model: ag.model ?? '', engine: ag.engine ?? '', ms: ag.ms });
        if (g) { u.ai = { q: qText, busy: false, glimt: g, suggestions: u.ai?.suggestions }; render(); return; }
      }
    }
    const raw = force ? null : await askStream(qText, { signal: ctl.signal, onStep: (T) => { think = T; if (live() && u.ai?.busy) { u.ai.think = T; paintAiJob(); } } }).catch(() => null);
    const g = raw ? glimtFrom(qText, raw) : null;
    if (!live()) return;
    if (g) { u.ai = { q: qText, busy: false, glimt: g, think: raw.think ?? think, suggestions: u.ai?.suggestions }; render(); return; }
    if (u.ai) { u.ai.think = null; render(); }
    let r = await api('/search/ai?async=1', { method: 'POST', headers: { Prefer: 'respond-async' }, json: { q: qText, ...(force ? { force: true } : {}) }, signal: ctl.signal });
    if (r?.jobId && !r.answer && !r.hits) {
      u.ai.jobId = r.jobId;
      for (;;) {
        if (!live()) return;
        let j;
        try { j = await api(`/jobs/${encodeURIComponent(r.jobId)}`, { signal: ctl.signal }); }
        catch (e) { if (e.status === 404) throw new Error('Serveren mistet Glimt-jobben. Prøv igjen.'); if (e.name === 'AbortError') return; await sleepMs(1500); continue; }
        if (!live()) return;
        u.ai.job = j; paintAiJob();
        if (j.status === 'done') { r = j.result ?? {}; break; }
        if (j.status === 'error') throw new Error(j.error || 'Glimt-søket feilet');
        if (j.status === 'cancelled') { u.ai = { q: qText, busy: false, answer: 'Glimt-søket ble avbrutt.', hits: [], suggestions: u.ai?.suggestions }; return render(); }
        await sleepMs(1000);
      }
    }
    if (!live()) return;
    u.ai = { ...r, q: r.q ?? qText, busy: false }; if (r.history) S.aiHist = r.history;
  } catch (e) {
    if (!live() || e.name === 'AbortError') return;
    u.ai = { q: qText, busy: false, answer: e.message, hits: [], suggestions: u.ai?.suggestions };
  } finally { clearInterval(tick); if (u.aiCtl === ctl) u.aiCtl = null; }
  if (run === aiRun) render();
}
async function cancelAi() {
  const a = u.ai, id = a?.jobId;
  aiRun++; u.aiCtl?.abort(); u.aiCtl = null;
  u.ai = { q: a?.q ?? '', busy: false, answer: 'Glimt-søket ble avbrutt.', hits: [], suggestions: a?.suggestions };
  render();
  if (id) await api(`/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
}
// Lagrer rekkefølge og skjulte punkter: i /api/me/layout (finSideNav) når det finnes, og alltid i FinansHubs prefs.
const saveNavCfg = busyWrap(async (order, hidden, labels = navLabels()) => {
  hidden = hidden.filter((p) => !NAV_FIXED.includes(p));
  S.layout = S.layout ? { ...S.layout, finSideNav: { order, hidden, labels } } : S.layout;
  S.boot.nav = order; S.boot.navHidden = hidden; S.boot.navLabels = labels; u.cfgOrder = null;
  render();
  const r = await api('/prefs', { method: 'PUT', json: { nav: order, hidden, labels } });
  S.boot.nav = r.nav; S.boot.navHidden = r.hidden; S.boot.navLabels = r.labels ?? labels;
  if (S.layoutOk) {
    const finSideNav = { order: r.nav, hidden: r.hidden, labels: S.boot.navLabels };
    const res = await fetch('/api/me/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finSideNav }) }).catch(() => null);
    if (res?.ok) S.layout = { ...S.layout, finSideNav };
    // Eldre servere godtar ikke navn i layout: lagre uten, så rekkefølgen og synligheten fortsatt følger brukeren.
    else if (res?.status === 400) {
      const res2 = await fetch('/api/me/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finSideNav: { order: r.nav, hidden: r.hidden } }) }).catch(() => null);
      if (res2?.ok) S.layout = { ...S.layout, finSideNav: { order: r.nav, hidden: r.hidden } };
    }
  }
});
// Eget navn på et menypunkt. Tomt navn eller samme som standard fjerner overstyringen.
function saveNavLabel(p, name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const labels = { ...navLabels() };
  if (!n || n === defaultName(p)) delete labels[p]; else labels[p] = n;
  if ((labels[p] ?? '') === (navLabels()[p] ?? '')) return;
  const { order, hidden } = navCfg();
  return saveNavCfg(order, hidden, labels);
}
function moveNav(p, d) {
  const { order, hidden } = navCfg(), a = [...order], i = a.indexOf(p), j = i + d;
  if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  return saveNavCfg(a, hidden);
}
async function openOrig(id, view) {
  u.add = { type: 'orig', id, view }; u.origZoom = false; render();
  S.orig = S.orig ?? {};
  try { S.orig[id] = await api(`/transactions/${id}/original`); } catch (e) { u.add = null; toast(e.message); }
  render();
}
const bankText = (b) => [`Dato: ${b.bookingDate ?? ''}`, b.valueDate ? `Rentedato: ${b.valueDate}` : null, `Forklaring: ${b.description ?? ''}`, `${b.amount < 0 ? 'Ut' : 'Inn'}: ${n2(Math.abs(b.amount))} kr`,
  b.account ? `Konto: ${b.account}${b.bank ? ' (' + b.bank + ')' : ''}` : null, b.archiveReference ? `Arkivref.: ${b.archiveReference}` : null].filter(Boolean).join('\n');

export function bind() {
  bindSearchFields(); bindSuggest();
  const el = root();
  // ✕ i søkefeltet: tøm søket og vis alle transaksjoner igjen (prompt 27). Fokus beholdes.
  el.addEventListener('sf:clear', async (e) => {
    const f = e.target.closest('[data-form="gsearch"],[data-form="txsearch"]');
    if (!f) return;
    if (u.aiMode && f.dataset.form === 'gsearch') { u.aiDraft = ''; return; }
    if (!u.q) return;
    u.q = ''; u.sel = null;
    if (u.page === 'tx') { await loadTx(); render(); el.querySelector(`[data-form="${f.dataset.form}"] input[name=q]`)?.focus(); }
  });
  bindModules(el);
  bindFilter(el, { askAi: (q) => { u.aiMode = true; return askAi(q); }, report: (p) => startTask('report', p) });
  bindGj42(el);
  el.addEventListener('click', (e) => { const b = e.target.closest?.('[data-t42-tog]'); if (b) { u.thinkOpen = !u.thinkOpen; render(); } });
  loadLogoRegistry().then((changed) => { if (changed) render(); });
  bindReanalyze(el, (r) => { u.selRc = r.id; refreshAll().then(() => toast('Kvitteringen er oppdatert')); });
  bind51((id) => S.receipts?.find((x) => x.id === id)); // prompt 51: «Rådata» hentes ved åpning
  bind48(); setRedraw48(() => render()); // prompt 48: varelinjer/rabatter i skjemaet for skannede kvitteringer
  // Prompt 40: varelinjer i «Rediger alt», hurtigtaster (E rediger · R les på nytt · ⌘S lagre · Esc avbryt) og høyreklikk i lista.
  const selTx = () => S.tx?.items.find((y) => y.id === u.sel) ?? null;
  bindEditor(el, { getTx: selTx, save: (body) => patchTx(u.sel, body), rerender: render });
  document.addEventListener('keydown', async (e) => {
    if (u.page !== 'tx' || !selTx() || u.add) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (document.activeElement?.blur) document.activeElement.blur(); if (await saveLines((body) => patchTx(u.sel, body))) toast('Lagret'); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); const i = el.querySelector('[data-tx-field="description"]'); i?.focus(); i?.select?.(); return; }
    if ((e.key === 'r' || e.key === 'R') && selTx().receiptId) { e.preventDefault(); el.querySelector('[data-f40-reread]')?.click(); return; }
    if (e.key === 'Escape' && !editorDirty() && !document.querySelector('.ra-ov,.f40-ctx')) { u.sel = null; render(); }
  });
  el.addEventListener('contextmenu', (e) => {
    const tr = e.target.closest?.('tr[data-open-tx]');
    if (!tr) return;
    e.preventDefault();
    const id = +tr.dataset.openTx || tr.dataset.openTx, t = S.tx?.items.find((y) => String(y.id) === String(id));
    document.querySelector('.f40-ctx')?.remove();
    const m = document.createElement('div');
    m.className = 'f40-ctx'; m.setAttribute('role', 'menu');
    m.style.cssText = `position:fixed;z-index:9000;left:${Math.min(e.clientX, innerWidth - 240)}px;top:${Math.min(e.clientY, innerHeight - 120)}px`;
    m.innerHTML = `<button type="button" role="menuitem" data-c="edit">Rediger alt</button>${t?.receiptId ? `<button type="button" role="menuitem" data-c="reread">✦ La Glimt lese kvitteringen på nytt</button>` : ''}<button type="button" role="menuitem" data-c="open">Åpne</button>`;
    document.body.appendChild(m);
    const off = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } };
    document.addEventListener('pointerdown', off, true);
    m.addEventListener('click', async (ev) => {
      const c = ev.target.closest('[data-c]')?.dataset.c; if (!c) return;
      m.remove(); document.removeEventListener('pointerdown', off, true);
      u.sel = t?.id ?? id; render();
      await new Promise((r) => setTimeout(r, 30));
      if (c === 'edit') { const i = el.querySelector('[data-tx-field="description"]'); i?.focus(); i?.select?.(); }
      if (c === 'reread') el.querySelector('[data-f40-reread]')?.click();
    });
  });
  el.addEventListener('click', busyWrap(async (e) => {
    const t = e.target;
    const d = (sel) => t.closest(sel);
    if (d('[data-modal]') && t === d('[data-modal]')) { u.add = null; return render(); }
    let x;
    if ((x = d('[data-open-tx]'))) { if (x.dataset.hl !== undefined) { u.hl = x.dataset.hl || null; u.hlOff = false; } const id = +x.dataset.openTx; if (u.page !== 'tx') { u.sel = id; location.hash = '#/tx'; return; } u.sel = u.sel === id ? null : id; u.msg = {}; return render(); }
    if ((x = d('[data-open-rc]'))) { e.preventDefault(); u.selRc = x.dataset.openRc; if (x.dataset.hl) { u.hl = x.dataset.hl; u.hlRc = x.dataset.openRc; u.hlOff = false; u.hlFocus = true; } if (u.page !== 'kv') { location.hash = '#/kv'; return; } return render(); }
    if ((x = d('[data-gk-act]'))) return gkeyAction(x);
    if ((x = d('[data-olm]'))) return ollamaAction(x);
    if ((x = d('[data-mode]'))) { u.mode = x.dataset.mode; return render(); }
    if ((x = d('[data-rap]'))) { u.rap = x.dataset.rap; await loadReport(); return render(); }
    if ((x = d('[data-month]'))) { u.month = shiftMonth(u.month, (u.page === 'rap' && u.rap === 'year' ? 12 : 1) * +x.dataset.month); return load(); }
    if ((x = d('[data-cat]'))) { u.cat = x.dataset.cat; await loadTx(); return render(); }
    if ((x = d('[data-rc-cat]'))) return patchRc(u.selRc, { categoryId: +x.dataset.rcCat });
    if ((x = d('[data-test-engine]'))) { const k = x.dataset.testEngine; u.msg.ai = 'Tester …'; render(); const r = await api('/ai/test', { method: 'POST', json: { provider: k } }).catch((e) => ({ ok: false, message: e.message })); u.msg.aiOk = r.ok; u.msg.ai = r.message; return render(); }
    if ((x = d('[data-settab]'))) { u.setTab = x.dataset.settab; u.msg = {}; if (u.setTab === 'ai') loadAi().then(render); return load(); }
    if ((x = d('[data-theme-pick]'))) return saveLayout({ design: x.dataset.themePick });
    if ((x = d('[data-provider]'))) return saveSet({ provider: x.dataset.provider });
    if ((x = d('[data-tog]'))) return saveSet({ [x.dataset.tog]: !S.boot.settings[x.dataset.tog] });
    if ((x = d('[data-txtype]'))) { u.add.kind = x.dataset.txtype; return render(); }
    if ((x = d('[data-rec-toggle]'))) { const r = S.recurring.find((y) => y.id === +x.dataset.recToggle); await api(`/recurring/${r.id}`, { method: 'PATCH', json: { active: !r.active } }); await loadRecurring(); return render(); }
    if ((x = d('[data-edit-rec]'))) { u.add = { type: 'rec', id: +x.dataset.editRec }; return render(); }
    if ((x = d('[data-edit-acc]'))) { u.add = { type: 'acc', id: +x.dataset.editAcc }; return render(); }
    if ((x = d('[data-edit-goal]'))) { u.add = { type: 'goal', id: +x.dataset.editGoal }; return render(); }
    if ((x = d('[data-del-cat]'))) { if (!confirm('Slette kategorien? Transaksjoner i den blir ukategoriserte.')) return; await api(`/categories/${x.dataset.delCat}`, { method: 'DELETE' }); await loadBoot(); return render(); }
    if ((x = d('[data-del-rule]'))) { await api(`/rules/${x.dataset.delRule}`, { method: 'DELETE' }); await loadBoot(); return render(); }
    if ((x = d('[data-del-token]'))) { await api(`/tokens/${x.dataset.delToken}`, { method: 'DELETE' }); u.msg.token = null; return load(); }
    if ((x = d('[data-hov]'))) return;
    if ((x = d('[data-navcfg-move]'))) { const [p, dir] = x.dataset.navcfgMove.split(':'); return moveNav(p, +dir); }
    if ((x = d('[data-navcfg-reset]'))) return saveNavLabel(x.dataset.navcfgReset, '');
    if ((x = d('[data-navcfg-tog]'))) { const p = x.dataset.navcfgTog, { order, hidden } = navCfg(); return saveNavCfg(order, hidden.includes(p) ? hidden.filter((y) => y !== p) : [...hidden, p]); }
    if ((x = d('[data-txkind]'))) { const tx = S.tx?.items.find((y) => y.id === u.sel); if (tx && tx.type !== x.dataset.txkind) return patchTx(tx.id, { type: x.dataset.txkind }); return; }
    if ((x = d('[data-orig]'))) return openOrig(u.sel, x.dataset.orig);
    if ((x = d('[data-orig-view]'))) { u.add.view = x.dataset.origView; return render(); }
    if ((x = d('[data-ai-q]'))) { u.aiMode = true; return askAi(x.dataset.aiQ); }
    if ((x = d('[data-copy]'))) { try { await navigator.clipboard.writeText(x.dataset.copy); toast('Kopiert'); } catch { toast('Merk teksten og kopier manuelt'); } return; }
    const act = d('[data-act]')?.dataset.act;
    if (!act) return;
    const sel = S.tx?.items.find((y) => y.id === u.sel);
    const R = S.receipts?.find((y) => y.id === u.selRc);
    switch (act) {
      case 'add-tx': u.add = { type: 'tx', kind: 'ut' }; if (u.page !== 'tx') location.hash = '#/tx'; return render();
      case 'goto-import': u.setTab = 'imp'; location.hash = '#/inn'; return u.page === 'inn' && render();
      case 'close-modal': u.add = null; return render();
      case 'close-sel': u.sel = null; return render();
      case 'hl-clear': u.hlOff = true; return render();
      case 'hl-scroll': return hlFocus(root());
      case 'rc-reread': {
        if (!R) return;
        try { await api(`/receipts/${R.id}/reread`, { method: 'POST' }); toast('Leser kvitteringen på nytt …'); }
        catch (err) { toast(err.status === 404 ? 'Serveren kan ikke lese på nytt ennå' : err.message); return; }
        u.hlFocus = true; return refreshAll();
      }
      case 'del-tx': if (!confirm('Slette transaksjonen?')) return; await api(`/transactions/${sel.id}`, { method: 'DELETE' }); u.sel = null; await loadTx(); await loadBoot(); return render();
      case 'make-rule': {
        const word = (sel.merchant || sel.description).toUpperCase().replace(/[^A-ZÆØÅ0-9 ]/g, ' ').trim().split(/\s+/).find((w) => w.length >= 3 && !/^(VARER|VISA|VARE|KORTKJØP)$/.test(w));
        if (!word || !sel.categoryId) { u.msg.rule = 'Velg kategori først.'; return render(); }
        await api('/rules', { method: 'POST', json: { pattern: word + '*', categoryId: sel.categoryId } });
        await loadBoot(); u.msg.rule = `Regel lagt til: ${word}* → ${sel.category}`; return render();
      }
      case 'rc-book': { const f48 = await flush48(R, { category: R.category }); if (f48.error) toast(`Rettelsen ble ikke lagret: ${f48.error}`); } await api(`/receipts/${R.id}/book`, { method: 'POST' }); toast('Bokført ✓'); { const nx = S.receipts.find((y) => y.id !== R.id && y.status === 'needs_review'); u.selRc = nx?.id ?? null; } return refreshAll();
      case 'rc-unbook': await api(`/receipts/${R.id}/unbook`, { method: 'POST' }); toast('Flyttet til gjennomgang'); return refreshAll();
      case 'rc-reject': await api(`/receipts/${R.id}/reject`, { method: 'POST' }); toast('Kvittering avvist'); u.selRc = null; return refreshAll();
      case 'rc-ocr-all': {
        t.disabled = true; t.textContent = 'Leser med lokal OCR …';
        const r = await api('/receipts/ocr', { method: 'POST', json: {} });
        toast(r.errors?.length && !r.done ? r.errors[0] : r.message);
        return refreshAll();
      }
      case 'rc-reprocess': await api(`/receipts/${R.id}/reprocess?provider=${t.closest('[data-prov]').dataset.prov}`, { method: 'POST' }); return refreshAll();
      case 'rc-manual': await api(`/receipts/${R.id}`, { method: 'PATCH', json: { merchant: R.merchant ?? '' } }); S.receipts = S.receipts.map((y) => (y.id === R.id ? { ...y, status: 'needs_review', error: 'Fylles ut manuelt.' } : y)); return render();
      case 'rc-delete': if (!confirm('Slette kvitteringen og bildet? Transaksjonen beholdes.')) return; await api(`/receipts/${R.id}`, { method: 'DELETE' }); u.selRc = null; return refreshAll();
      case 'add-rec': u.add = { type: 'rec' }; return render();
      case 'detect-rec': { const r = await api('/recurring/detect', { method: 'POST' }); u.msg.rec = r.added ? `Fant ${r.added} nye faste trekk.` : 'Fant ingen nye faste trekk.'; await loadRecurring(); return render(); }
      case 'add-acc': u.add = { type: 'acc' }; return render();
      case 'add-goal': u.add = { type: 'goal' }; return render();
      case 'del-acc': if (!confirm('Slette kontoen? Transaksjonene beholdes uten konto.')) return; await api(`/accounts/${u.add.id}`, { method: 'DELETE' }); u.add = null; return refreshAll();
      case 'del-goal': await api(`/goals/${u.add.id}`, { method: 'DELETE' }); u.add = null; return refreshAll();
      case 'del-rec': await api(`/recurring/${u.add.id}`, { method: 'DELETE' }); u.add = null; await loadRecurring(); return render();
      case 'add-cat': await api('/categories', { method: 'POST', json: { name: `Ny kategori ${cats().length + 1}`, color: '#8FD3FF' } }); await loadBoot(); return render();
      case 'add-rule': { const c = cats('expense')[0]; await api('/rules', { method: 'POST', json: { pattern: 'BUTIKK*', categoryId: c.id } }); await loadBoot(); return render(); }
      case 'apply-rules': { const r = await api('/rules/apply', { method: 'POST' }); u.msg.rules = `${r.updated} transaksjoner fikk kategori.`; return render(); }
      case 'test-ai': {
        u.msg.ai = 'Tester …'; render(); await loadAi();
        const a = S.ai, st = S.boot.settings;
        if (!a) { u.msg.ai = 'Fikk ikke svar fra serveren.'; u.msg.aiOk = false; }
        else if (st.provider === 'ollama') { u.msg.aiOk = a.ollama.ok && a.ollama.hasModel; u.msg.ai = !a.ollama.ok ? `Ollama svarte ikke på ${st.ollamaUrl} (${a.ollama.error ?? 'feil'})` : a.ollama.hasModel ? `Ollama svarte · ${st.ollamaModel} er lastet ned` : `Ollama svarte, men ${st.ollamaModel} mangler. Kjør: ollama pull ${st.ollamaModel}`; }
        else { const r = await api('/ai/test', { method: 'POST', json: { provider: st.provider } }).catch((e) => ({ ok: false, message: e.message })); u.msg.aiOk = r.ok; u.msg.ai = r.message; }
        return render();
      }
      case 'ai-log': { const r = await api('/ai/log').catch(() => ({ items: [] })); S.aiLog = r.items ?? []; return render(); }
      case 'ocr-toggle': { const on = !!(S.ai?.ocr?.enabled ?? S.boot.settings.ocrFallback ?? true); await saveSet({ ocrFallback: !on }); await loadAi(); return render(); }
      case 'test-roboflow': { u.msg.ai = 'Tester Roboflow …'; render(); const r = await api('/ai/roboflow/test', { method: 'POST' }).catch((e) => ({ ok: false, message: e.message })); u.msg.aiOk = r.ok; u.msg.ai = r.message; return render(); }
      case 'demo': await api('/demo', { method: 'POST' }); toast('Demodata lastet inn'); return refreshAll();
      case 'wipe': u.add = { type: 'wipe' }; return render();
      case 'print': return window.print();
      case 'nav-showall': return saveNavCfg(navCfg().order, []);
      case 'compact-nav': return saveLayout({ compactNav: !compactNav() });
      case 'nav-reset': await saveNavCfg([...(S.boot.navDefault ?? NAV_DEFAULT)], navCfg().hidden); toast('Standard rekkefølge er satt'); return;
      case 'ai-hist-clear': S.aiHist = await api('/search/history', { method: 'DELETE' }); return render();
      case 'orig-zoom': u.origZoom = !u.origZoom; return render();
      case 'orig-dl': {
        const b = S.orig?.[u.add.id]?.bankRow; if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })); a.download = `banktransaksjon-${u.add.id}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
      }
      case 'orig-share': {
        const o = S.orig?.[u.add.id]; if (!o) return;
        try {
          if (u.add.view === 'bank') await navigator.share({ title: 'Banktransaksjon', text: bankText(o.bankRow) });
          else { const blob = await (await fetch(o.receipt.fileUrl)).blob(); const file = new File([blob], `kvittering.${blob.type.split('/')[1] || 'jpg'}`, { type: blob.type }); await (navigator.canShare?.({ files: [file] }) ? navigator.share({ files: [file], title: 'Kvittering' }) : navigator.share({ title: 'Kvittering', url: new URL(o.receipt.fileUrl, location.href).href })); }
        } catch (err) { if (err?.name !== 'AbortError') toast('Kunne ikke dele'); }
        return;
      }
      case 'ai-toggle': {
        u.aiMode = !u.aiMode;
        if (u.aiMode && !u.ai) { u.ai = { q: '', suggestions: [] }; render(); u.ai.suggestions = await api('/search/suggestions').then(suggList).catch(() => []); }
        if (!u.aiMode) u.ai = null;
        render(); document.querySelector('.search input')?.focus(); return;
      }
      case 'ai-close': if (u.ai?.busy) await cancelAi(); u.ai = null; u.aiMode = false; return render();
      case 'ai-cancel': return cancelAi();
      case 'open-ai-set': u.setTab = 'ai'; u.msg = {}; if (location.hash === '#/inn') { loadAi().then(render); return load(); } location.hash = '#/inn'; return;
      case 'scope-off': u.bolScopeOff = true; return render();
      case 'ai-force': return askAi(u.ai?.q, true);
    }
  }));

  // Hover i grafen tegner bare grafen på nytt.
  const redrawChart = () => { const c = el.querySelector('[data-chart]'); if (c && S.summary) c.outerHTML = chart(S.summary); };
  el.addEventListener('mouseover', (e) => { const h = e.target.closest('[data-hov]'); if (h && u.hov !== +h.dataset.hov) { u.hov = +h.dataset.hov; redrawChart(); } });
  el.addEventListener('mouseleave', (e) => { if (e.target.matches?.('[data-chart]')) { u.hov = null; redrawChart(); } }, true);

  el.addEventListener('change', busyWrap(async (e) => {
    const t = e.target;
    if (t.matches('[data-navcfg-name]')) return saveNavLabel(t.dataset.navcfgName, t.value);
    if (t.matches('[data-upload]')) return uploadFiles([...t.files]);
    if (t.matches('[data-attach-rc]')) {
      const id = +t.dataset.attachRc, f = t.files[0]; t.value = '';
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      await api(`/transactions/${id}/receipt`, { method: 'POST', body: fd });
      toast('Kvitteringen er lagt ved og leses av Glimt'); if (u.add?.type === 'orig') { S.orig[id] = await api(`/transactions/${id}/original`); }
      await Promise.all([loadTx(), loadBoot()]); return render();
    }
    if (t.matches('[data-csv]')) {
      const form = t.closest('form');
      const fd = new FormData(form); fd.set('profile', S.boot.settings.csvProfile);
      if (!fd.get('accountId')) { u.msg.csv = 'Velg kontoen filen hører til først.'; u.msg.csvOk = false; t.value = ''; return render(); }
      try { const r = await api('/import/csv', { method: 'POST', body: fd }); u.msg.csv = `${r.added} nye transaksjoner importert · ${r.duplicates} duplikater hoppet over${r.skipped ? ` · ${r.skipped} rader kunne ikke leses` : ''}`; u.msg.csvOk = true; }
      catch (err) { u.msg.csv = err.message; u.msg.csvOk = false; }
      t.value = ''; await loadBoot(); return render();
    }
    if (t.dataset.filter) { u[t.dataset.filter] = t.value; await loadTx(); return render(); }
    if (t.dataset.txField) {
      const f = t.dataset.txField, v = t.value, tx = S.tx?.items.find((y) => y.id === u.sel);
      if (f === 'amount') { const a = parseAmount(v); if (a === null || !Number.isFinite(a)) { toast('Ugyldig beløp'); return render(); } return patchTx(u.sel, { amount: Math.abs(a), type: tx?.type ?? 'expense' }); }
      if (f === 'description' && !v.trim()) { toast('Beskrivelse må fylles ut'); return render(); }
      return patchTx(u.sel, { [f]: ['categoryId', 'accountId', 'folderId'].includes(f) ? (+v || null) : v });
    }
    // Prompt 51: rettet butikknavn → POST /receipts/:id/merchant (serveren lærer org.nr. → navn); eldre server → PATCH som før.
    if (t.dataset.rcField === 'merchant' && t.value.trim()) { const id = u.selRc; try { const r = await learn51(id, t.value, _e48[id]?.org_number); if (r) { S.receipts = S.receipts.map((x) => (x.id === id ? { ...x, ...r } : x)); return render(); } } catch (e) { toast(e.message); return; } }
    if (t.dataset.rcField) { const f = t.dataset.rcField; return patchRc(u.selRc, { [f]: f === 'total' ? parseAmount(t.value) : f === 'accountId' ? (+t.value || null) : t.value }); }
    if (t.dataset.budget) { await api('/budgets', { method: 'PUT', json: { categoryId: +t.dataset.budget, amount: parseAmount(t.value) ?? 0 } }); await loadSummary(); return render(); }
    if (t.dataset.aiTo) {
      const key = t.dataset.aiTo, v = key === 'onTimeout' ? t.value : +t.value, next = { ...aiTo(S.boot.settings), [key]: v };
      S.boot.settings = await api('/settings', { method: 'PUT', json: { aiTimeouts: next } });
      // Eldre server uten aiTimeouts: behold valget i visningen og si fra at det ikke er lagret.
      u.msg.aiTo = S.boot.settings.aiTimeouts ? '' : 'Serveren støtter ikke tidsgrenser ennå. Valget er ikke lagret.';
      if (!S.boot.settings.aiTimeouts) S.boot.settings.aiTimeouts = next;
      return render();
    }
    if (t.dataset.aiTask) { await saveSet({ aiTasks: { ...(S.boot.settings.aiTasks ?? {}), [t.dataset.aiTask]: t.value } }); await loadAi(); return render(); }
    if (t.dataset.set) {
      const key = t.dataset.set; let v = t.value;
      if (['monthStart', 'yearGoal', 'minConf'].includes(key)) v = +String(v).replace(/\s/g, '');
      if (['geminiKey', 'groqKey', 'roboflowKey', 'imapPass'].includes(key) && !v) return;
      await saveSet({ [key]: v }); if (key === 'monthStart') await refreshAll();
      if (['geminiKey', 'groqKey', 'roboflowKey'].includes(key)) toast('Nøkkelen er lagret på serveren');
      return;
    }
    if (t.dataset.catField) { await api(`/categories/${t.dataset.id}`, { method: 'PATCH', json: { [t.dataset.catField]: t.value } }); await loadBoot(); return render(); }
    if (t.dataset.ruleField) { await api(`/rules/${t.dataset.id}`, { method: 'PATCH', json: { [t.dataset.ruleField]: t.dataset.ruleField === 'categoryId' ? +t.value : t.value } }); await loadBoot(); return render(); }
  }));

  el.addEventListener('submit', busyWrap(async (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    switch (f.dataset.form) {
      case 'aipage': u.aiPageDraft = ''; if (!String(v.aiq ?? '').trim()) return; return askAi(v.aiq);
      case 'gsearch': if (u.page === 'dir' && bolScope()) return bolSearch(v.q, !!u.aiMode);
        if (u.aiMode) return askAi(v.q);
        // Prompt 40: standardspørsmål («abonnementer», «faste trekk» …) gir Glimt-kort også uten ✦ Glimt slått på.
        if (isStandardQ(v.q)) { u.q = ''; return askAi(v.q); }
      // fallthrough
      case 'txsearch': u.q = v.q; u.sel = null; u.hl = null; u.hlOff = false; if (u.page !== 'tx') { location.hash = '#/tx'; return; } await loadTx(); return render();
      case 'tx': {
        const amt = Math.abs(parseAmount(v.amount) ?? NaN);
        if (!Number.isFinite(amt)) return toast('Ugyldig beløp');
        await api('/transactions', { method: 'POST', json: { ...v, type: u.add.kind === 'inn' ? 'income' : 'expense', amount: amt, categoryId: +v.categoryId || null, accountId: +v.accountId || null, folderId: +v.folderId || null } });
        u.add = null; toast('Transaksjon lagret'); return refreshAll();
      }
      case 'acc': await api(u.add.id ? `/accounts/${u.add.id}` : '/accounts', { method: u.add.id ? 'PATCH' : 'POST', json: { ...v, openingBalance: parseAmount(v.openingBalance) ?? 0 } }); u.add = null; return refreshAll();
      case 'goal': await api(u.add.id ? `/goals/${u.add.id}` : '/goals', { method: u.add.id ? 'PATCH' : 'POST', json: { ...v, saved: parseAmount(v.saved) ?? 0, target: parseAmount(v.target) } }); u.add = null; return refreshAll();
      case 'rec': await api(u.add.id ? `/recurring/${u.add.id}` : '/recurring', { method: u.add.id ? 'PATCH' : 'POST', json: { ...v, amount: parseAmount(v.amount), categoryId: +v.categoryId || null, accountId: +v.accountId || null } }); u.add = null; await loadRecurring(); return render();
      case 'token': {
        const scopes = new FormData(f).getAll('scope');
        if (!scopes.length) return toast('Velg minst én tilgang');
        const r = await api('/tokens', { method: 'POST', json: { name: v.name, scopes, expires: v.expires } });
        u.msg.token = r.token; return load();
      }
      case 'wipe': await api('/all', { method: 'DELETE', json: { confirm: v.confirm } }); u.add = null; toast('Alle økonomidata er slettet'); return refreshAll();
    }
  }));

  // Navnefeltet ligger i en rad som kan dras: slå av draget mens man skriver, ellers kan ikke teksten markeres.
  el.addEventListener('pointerdown', (e) => { const i = e.target.closest?.('[data-navcfg-name]'); if (i) i.closest('[data-navcfg]').draggable = false; });
  el.addEventListener('focusout', (e) => { const i = e.target.closest?.('[data-navcfg-name]'); if (i) i.closest('[data-navcfg]')?.setAttribute('draggable', 'true'); });
  el.addEventListener('keydown', (e) => {
    const i = e.target.closest?.('[data-navcfg-name]');
    if (!i) return;
    if (e.key === 'Enter') { e.preventDefault(); i.blur(); }
    if (e.key === 'Escape') { i.value = pageName(i.dataset.navcfgName); i.blur(); }
  });
  // Dra og slipp i Innstillinger → Sidemeny. DOM-noden flyttes direkte (en full omtegning midt i et drag avbryter draget).
  el.addEventListener('dragstart', (e) => {
    const n = e.target.closest?.('[data-navcfg]');
    if (!n) return;
    u.navDrag = n.dataset.navcfg; u.cfgOrder = [...navCfg().order];
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', u.navDrag);
    requestAnimationFrame(() => n.classList.add('dragging'));
  });
  el.addEventListener('dragover', (e) => {
    const n = e.target.closest?.('[data-navcfg]');
    if (!n || !u.navDrag || !u.cfgOrder) return;
    e.preventDefault();
    const a = u.cfgOrder, from = a.indexOf(u.navDrag), to = a.indexOf(n.dataset.navcfg);
    if (from < 0 || to < 0 || from === to) return;
    a.splice(to, 0, a.splice(from, 1)[0]);
    const src = el.querySelector(`[data-navcfg="${u.navDrag}"]`);
    if (src) n.parentNode.insertBefore(src, from < to ? n.nextSibling : n);
  });
  el.addEventListener('drop', (e) => { if (e.target.closest?.('[data-navcfg]')) e.preventDefault(); });
  el.addEventListener('dragend', () => {
    if (!u.navDrag) return;
    const order = u.cfgOrder; u.navDrag = null;
    if (order && order.join() !== (S.boot.nav ?? []).join()) return saveNavCfg(order, navCfg().hidden);
    u.cfgOrder = null; render();
  });

  // Dra og slipp kvitteringer.
  el.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  el.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('over'));
  el.addEventListener('drop', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); uploadFiles([...e.dataTransfer.files]); } });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('.search input')?.focus(); }
    if (e.key === 'Escape' && u.add) { u.add = null; render(); }
  });
}

// Prompt 36: ingen synlig scroll-strek på web (FinansHub på PC), scrolling virker som før.
(() => {
  if (document.getElementById('hl36-noscroll')) return;
  const st = document.createElement('style');
  st.id = 'hl36-noscroll';
  st.textContent = 'html[data-ui="desktop"] *{scrollbar-width:none!important}html[data-ui="desktop"] *::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}';
  document.head.appendChild(st);
})();

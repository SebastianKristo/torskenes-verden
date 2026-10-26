// Chat (prompt 27, «Homelab Papir Web.dc.html» fane Chat, claude-code-chat.md).
// Fast sidepanel (søk med ✕, FESTET, MAPPER, I DAG / I GÅR / SISTE 7 DAGER / ELDRE, Modeller, Kunnskapsbase, Tema),
// modellvelger LOKAL/SKY, ⚙ samtaleinnstillinger, strømming med Stopp, Rediger/Kopier/Nytt svar/Les høyt, vedlegg,
// Nettsøk/Mine data, mikrofon (Web Speech API nb-NO, ellers /api/chat/transcribe), modeller-side og «Sende til sky?»-arket.
// På mobil (smal skjerm) ligger historikken i en skuff (☰).
// Alt går via vår server (/api/chat/*); serveren bruker Open WebUI når den er satt opp, ellers Ollama/Gemini/Groq direkte.
// Mangler endepunktene (eldre server), vises en forklaring i stedet for feil.
import { esc, isMobile } from './util.js';
import { store } from './store.js';
import { searchField } from './searchfield.js';
import { lang, locale } from './i18n.js';
import { glimt, glimtDots } from './glimt.js';
import { assist, looksLikeTool, normAnswer } from './assist.js';
import { agentStream59, cacheNote59 } from './stream59.js'; // prompt 59: Glimt-svar strømmes (ord for ord, statuslinje, Stopp)
import { agentText, isPlain, agentConfirm } from './glimt-agent45.js';
import { cal70Of } from './cal70.js'; // prompt 70
import { chatConv60, bindConv60, rekeyConv60, newChatConv60, forgetConv60, choicePick60, followsGlimt60 } from './convo60.js'; // prompt 60: samtale-id, valgknapper
import { thumbs61Html } from './recipes61.js'; // prompt 61: tommel opp/ned på Glimt-svar
import { preview62, schedCard62Html, yesLabel62, done62, schedDone62Html } from './sched62.js'; // prompt 62: kortet for en fast oppgave + kvittering
import { cardHtml, bindCards } from './chat-cards.js';
import { factsHtml41, usedWithoutFacts41 } from './chat-facts41.js'; // prompt 41: faktakort
import { css50, rejectReason50, isImg50, upload50, attRow50, bubbleImgs50, otherFiles50, filePills50, imagesOf50, bindDrop50, pastedFiles50, lightbox50, readWith50, finansBtn50, MAX_FILES50 } from './chat50.js'; // prompt 50: vedlegg, miniatyr, lysboks
import { speak57, stop57, aiTag57 } from './voices57.js'; // prompt 57: «Les høyt» med valgt stemme (POST /api/tts), nettleseren som reserve
import { css52, thinkOf52, thinkHtml52, thumbDataUrl52 } from './chat52.js'; // prompt 52: tankegang, miniatyr (attTh), modellark som scroller
import { L70, start70, step70, fail70, finish70, loaderHtml70, update70, cacheRead70, cacheWrite70, listCount70, skelRows70 } from './chat70.js'; // prompt 70: lasteside

/* Prompt 31: Glimt i Chat (claude-code-chat-kort-vaer-kalender.md, claude-code-glimt-ai.md).
   - Avsender er Glimt-merket (22 px) + modellnavnet; mens svaret kommer: merket animert og tre prikker (ikke «Tenker …»).
   - Spørsmål om vær, kalender, avganger, pakker, finans, huskeliste og prøveperioder går først til /api/assist
     (source:'chat'). Svaret er én kort setning + et kort under, med verktøy-chip («Vær», «Kalender») og «Verktøy · 0,6 s».
   - Kortet lagres i meldingen (meta.card). Lagrer serveren svaret i samtalen (chatId i svaret), hentes den på nytt;
     ellers lagres kortet i nettleseren (hl_chat_tools_v1) og flettes inn når samtalen åpnes. «Kopier» kopierer bare teksten. */
const TKEY = 'hl_chat_tools_v1';
const isLocalId = (id) => typeof id === 'string' && id.startsWith('g:');
function toolsRead() { try { return JSON.parse(localStorage.getItem(TKEY) || '{}') ?? {}; } catch { return {}; } }
function toolsWrite(o) { try { localStorage.setItem(TKEY, JSON.stringify(o)); } catch { /* privat modus */ } }
function toolsAdd(id, msgs) { const o = toolsRead(); o[id] = [...(o[id] ?? []), ...msgs].slice(-120); toolsWrite(o); }
function toolsRekey(from, to) { rekeyConv60(from, to); const o = toolsRead(); if (!o[from]) return; o[to] = [...(o[to] ?? []), ...o[from]]; delete o[from]; toolsWrite(o); }
function toolsDrop(id) { const o = toolsRead(); if (o[id]) { delete o[id]; toolsWrite(o); } }
/** Fletter lokale Glimt-svar inn i meldingene fra serveren: samme tekst fra serveren får kortet, resten settes inn etter tid. */
function mergeTools(id, msgs) {
  const L = toolsRead()[id];
  if (!L?.length) return msgs;
  const out = msgs.map((m) => ({ ...m })), used = new Set();
  for (const t of L) {
    const j = out.findIndex((m, i) => !used.has(i) && m.role === t.role && m.content === t.content);
    if (j >= 0) { used.add(j); if (t.meta) out[j].meta = { ...(out[j].meta ?? {}), ...t.meta }; continue; }
    let k = out.findIndex((m) => (m.ts ?? 0) > (t.ts ?? 0));
    if (k < 0) k = out.length;
    out.splice(k, 0, { ...t });
    for (const u of [...used]) if (u >= k) { used.delete(u); used.add(u + 1); }
    used.add(k);
  }
  return out;
}

const PERS = [['standard', 'Standard'], ['okonomi', 'Økonomi'], ['homelab', 'Homelab'], ['norsklarer', 'Norsklærer']];
const CTXS = [4096, 8192, 16384, 32768];
const SUGG = [['Hva har jeg brukt på mat i oktober?', 'Bruker Mine data', { data: 1 }], ['Hva står det om oppsigelse i husleiekontrakten?', 'Fra kunnskapsbasen', { kb: 1 }], ['Lag en handleliste til taco for fire', '', {}], ['Forklar Docker-volumer enkelt', '', {}]];
const DEF = { persona: 'standard', system: '', temperature: 0.7, topP: 0.9, numCtx: 8192, theme: 'papir' };
const LKEY = 'hl_chat_v1';
const IC = {
  newc: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', menu: 'M4 7h16M4 12h16M4 17h16', gear: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  chip: 'M5 5h14v14H5zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3', doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5', moon: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1', regen: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5', spk: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7',
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3', up: 'M12 19V5M5 12l7-7 7 7', plus: 'M12 5v14M5 12h14', folder: 'M3 6h6l2 2h10v11H3z',
};
const svg = (d, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

const C = {
  booted: false, ready70: false, show70: 30, missing: false, err: '', models: null, def: '', owui: false, set: { chat_my_data: true, chat_ask_cloud: true, chat_default_model: '', chat_theme: 'papir' },
  list: null, q: '', qList: null, cur: null, chat: null, draftModel: '', draftSet: { ...DEF }, open: {},
  inp: '', att: [], web: false, data: false, busy: null, sheet: null, menuId: null, guard: null, rem: false, edit: null,
  copied: '', speak: '', rec: false, toast: '', pulls: {}, mdel: '', kb: null, drawer: false, delArm: false, rn: '', nf: '', pn: '', theme: 'papir',
};
let toastT = 0, copyT = 0, qT = 0, qCtl = null, recog = null, mediaRec = null, pendingPrompt = null;
const host = () => document.getElementById('chat');
// Prompt 33: Chat er ALLTID fullskjerm på web (claude-code-chat-web-alltid-fullskjerm.md, fasit chW: full:true).
// «Vis i siden» og localStorage-nøkkelen «hl_chat_full» er fjernet; slett den så ingen står fast i gammel visning.
try { localStorage.removeItem('hl_chat_full'); } catch { /* privat modus */ }
function applyChFull() { const h = host(), on = !!h; h?.classList.add('ch-fs'); document.body.classList.toggle('chat-fs', on); }
// ✕ og Esc går tilbake til forrige side i appen (Dashboard hvis det ikke finnes noen).
let chPrev = '';
window.addEventListener('hashchange', (e) => {
  const r = (u) => { try { return new URL(u).hash.replace(/^#\/?/, '').split(/[/?]/)[0]; } catch { return ''; } };
  if (r(e.newURL) === 'chat' && r(e.oldURL) !== 'chat') chPrev = r(e.oldURL) && r(e.oldURL) !== 'okonomi' ? new URL(e.oldURL).hash : '';
});
function closeChat() { document.body.classList.remove('chat-fs'); const to = chPrev || '#/dash'; chPrev = ''; location.hash = to; }
function fsBtns() {
  return '<button type="button" class="ch-fsb ink" data-ch-fsclose aria-label="Lukk chat" title="Lukk (Esc)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
}

/* ---------------- Lagring og nett ---------------- */

function readLocal() { try { return JSON.parse(localStorage.getItem(LKEY) || 'null') ?? {}; } catch { return {}; } }
function writeLocal() { try { localStorage.setItem(LKEY, JSON.stringify({ cur: C.cur, model: C.draftModel, theme: C.theme, web: C.web, data: C.data, open: C.open, def: C.draftSet })); } catch { /* privat modus */ } }

async function call(path, { method = 'GET', json, body, signal } = {}) {
  const r = await fetch('/api/chat' + path, { method, signal, headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : body });
  if (r.status === 401) { location.href = '/login'; throw new Error('Ikke innlogget'); }
  const ct = r.headers.get('content-type') ?? '';
  const d = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) throw Object.assign(new Error((d && d.error) || `Feil ${r.status}`), { status: r.status, data: d });
  return d;
}

async function boot() {
  if (C.booted) return;
  C.booted = true;
  const l = readLocal();
  C.cur = l.cur ?? null; C.draftModel = l.model ?? ''; C.theme = l.theme === 'noytral' ? 'noytral' : 'papir'; C.web = !!l.web; C.data = !!l.data; C.open = l.open ?? {};
  if (l.def) C.draftSet = { ...DEF, ...l.def };
  // Prompt 70: samtalelista fra cache med en gang (byttes ut uten hopp når den ferske kommer).
  const cache = cacheRead70();
  if (cache?.list && !C.list) C.list = cache.list;
  return load70();
}
/* Prompt 70 (claude-code-chat-laster-web.md): samtaler og modeller hentes parallelt. Skrivefeltet blir aktivt så snart modellen
   er valgt, selv om samtalelista fortsatt lastes. Lastesiden viser stegene; treg etter 8 s, feil etter 20 s eller ved nettverksfeil. */
let ctl70 = null;
const netErr70 = (r) => r.status === 'rejected' && !r.reason?.status;
async function load70() {
  ctl70?.abort();
  const ctl = ctl70 = new AbortController(), signal = ctl.signal;
  const run = start70(() => paint(), () => { ctl.abort(); paint(); });
  paint();
  const seen = () => { if (run === L70.run && L70.steps[0].s !== 'ok') { step70(0, 'ok', location.host); paint(); } };
  const tap = (pr) => pr.then((v) => { seen(); return v; }, (e) => { if (e?.status) seen(); throw e; });
  const pm = tap(call('/models', { signal })), ps = tap(call('/settings', { signal })), pl = tap(call('/chats', { signal }));
  pl.then((v) => {
    if (run !== L70.run) return;
    C.list = v; cacheWrite70({ list: v });
    const n = listCount70(v);
    step70(1, 'ok', `${n} ${n === 1 ? 'samtale' : 'samtaler'}`);
    if (C.ready70) { if (C.q) searchChats(C.q, true); paintSide(); } else paint();
  }, (e) => {
    if (run !== L70.run || !e?.status) return; // nettverksfeil/tidsavbrudd håndteres av modellkallet og tidsgrensen
    if (!C.list) C.list = { pinned: [], folders: [], chats: [] };
    step70(1, 'ok', '');
    if (C.ready70) paintSide(); else paint();
  });
  const [m, s] = await Promise.allSettled([pm, ps]);
  if (run !== L70.run) return;
  if (m.status === 'rejected' && m.reason?.status === 404) { C.missing = true; ready70(); return; }
  if (netErr70(m)) { if (!C.ready70) { fail70(); paint(); } return; }
  const l = readLocal();
  if (m.status === 'fulfilled') { C.models = m.value.models ?? []; C.def = m.value.default ?? ''; C.owui = !!m.value.openwebui; C.auto = m.value.auto?.id ? m.value.auto : null; C.err = ''; } else { C.models = []; C.err = m.reason?.message ?? ''; }
  // Prompt 41 (claude-code-chat-auto-modell.md): «✦ Auto» øverst i velgeren når serveren har det. Auto er standard i nye samtaler,
  // og eksisterende brukere flyttes til Auto én gang (autoMig).
  if (C.auto) { C.models = [{ id: C.auto.id, name: C.auto.label || '✦ Auto', kind: 'auto', installed: true, picks: C.auto.picks ?? {} }, ...C.models.filter((x) => x.id !== C.auto.id)]; if (!autoMigDone()) { C.draftModel = C.auto.id; autoMigSet(); } }
  if (m.status === 'fulfilled') cacheWrite70({ models: C.models.filter((x) => x.kind !== 'auto'), def: C.def });
  if (s.status === 'fulfilled') { C.set = { ...C.set, ...s.value }; if (!l.theme && s.value.chat_theme) C.theme = s.value.chat_theme === 'noytral' ? 'noytral' : 'papir'; }
  if (!C.draftModel || !C.models.some((x) => x.id === C.draftModel && x.installed)) C.draftModel = (C.auto ? C.auto.id : '') || C.set.chat_default_model || C.def || C.models.find((x) => x.installed)?.id || '';
  // Prompt 41 (claude-code-chat-mine-data-standard.md): «Mine data» er på som standard (innstillingen mangler = på), og brikken er på i hver ny samtale.
  if (C.set.chat_my_data == null) C.set.chat_my_data = true;
  C.data = !!C.set.chat_my_data && dataFor41(C.cur);
  step70(2, 'ok', mName(C.draftModel)); L70.model = mName(C.draftModel); L70.modelOk = true;
  if (C.ready70) { paint(); return; } // «Bruk lokal modell» var valgt: modellene kom senere, oppdater bare visningen
  if (!C.list) C.list = { pinned: [], folders: [], chats: [] };
  if (pendingChat) { C.cur = pendingChat; pendingChat = null; watchHandoff(C.cur); }
  // Prompt 40: spørsmål fra «✦ AI» i søket: rett inn i en ny samtale (ikke forsiden eller forrige samtale først).
  if (pendingPrompt && C.models?.length) { const p = pendingPrompt; pendingPrompt = null; freshChat(); ready70(); send(p); paint(); return; }
  if (C.cur) await loadChat(C.cur, false);
  if (run !== L70.run || C.ready70) return;
  ready70();
  if (pendingPrompt) { const p = pendingPrompt; pendingPrompt = null; newChat(); send(p); }
}
/** Prompt 70: alt er klart – lastesiden byttes med Chat (overgang og fokus i skrivefeltet). */
function ready70() { C.ready70 = true; const h = host(); h?.removeAttribute('aria-busy'); document.getElementById('view')?.removeAttribute('aria-busy'); finish70(h, () => paint()); }
/** Prompt 70: «Bruk lokal modell» – åpne Chat med modellene fra forrige gang (lokal modell først); hentingen fortsetter i bakgrunnen. */
function useLocal70() {
  const c = cacheRead70() ?? {};
  if (!C.models?.length) { C.models = (c.models ?? []).filter((x) => x.kind !== 'auto'); C.def = C.def || c.def || ''; }
  const loc = C.models.find((x) => x.kind === 'lokal' && x.installed);
  if (loc) C.draftModel = loc.id;
  else if (!C.models.some((x) => x.id === C.draftModel)) C.draftModel = C.models.find((x) => x.installed)?.id || C.draftModel;
  if (!C.list) C.list = c.list ?? { pinned: [], folders: [], chats: [] };
  if (L70.mode === 'feil') C.err = 'Fikk ikke kontakt med Homelab. Prøv igjen om litt.';
  ready70();
}
async function refreshList() {
  try { C.list = await call('/chats'); } catch { /* beholder forrige liste */ }
  if (C.q) searchChats(C.q, true);
  paint();
}
async function loadChat(id, repaint = true) {
  if (isLocalId(id)) {
    const L = toolsRead()[id] ?? [];
    if (L.length) { C.chat = { id, local: true, title: L.find((m) => m.role === 'user')?.content?.slice(0, 60) ?? 'Glimt', model: C.draftModel, settings: { ...C.draftSet }, messages: L }; C.cur = id; }
    else { C.chat = null; C.cur = null; }
  } else {
    if (id !== C.cur) C.show70 = 30; // prompt 70: siste 30 meldinger først i hver samtale
    try { C.chat = await call(`/chats/${encodeURIComponent(id)}`); C.cur = id; C.chat.messages = mergeTools(id, C.chat.messages ?? []); } catch { C.chat = null; C.cur = null; }
  }
  if (C.cur && C.busy?.chatId !== C.cur) C.data = !!C.set.chat_my_data && dataFor41(C.cur);
  writeLocal();
  if (repaint) { paint(); toBottom(); }
}
function searchChats(q, now = false) {
  C.q = q;
  clearTimeout(qT); qCtl?.abort();
  if (!q.trim()) { C.qList = null; paintSide(); return; }
  qT = setTimeout(async () => {
    const ctl = qCtl = new AbortController();
    try { const r = await call(`/chats?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }); if (!ctl.signal.aborted) { C.qList = [...r.pinned, ...r.folders.flatMap((f) => f.chats), ...r.chats]; paintSide(); } } catch { /* avbrutt */ }
  }, now ? 0 : 150);
}

/* ---------------- Modeller ---------------- */

const allModels = () => C.models ?? [];
const modelOf = (id) => allModels().find((m) => m.id === id) ?? { id, name: id || 'Ingen modell', kind: /^(gemini|groq):/.test(id) ? 'sky' : 'lokal', installed: true };
// Samtaler som Glimt (/api/assist) startet har modellen «glimt»; nye meldinger der går til valgt språkmodell.
const isGlimtModel = (id) => /^glimt\b/i.test(String(id ?? ''));
const curModelId = () => (C.chat && C.chat.model && !isGlimtModel(C.chat.model) ? C.chat.model : C.draftModel);
const isSky = (id) => modelOf(id).kind === 'sky';
const mName = (id) => { if (isGlimtModel(id)) return 'Glimt'; if (id === 'auto' || modelOf(id).kind === 'auto') return '✦ Auto'; const m = modelOf(id); return m.kind === 'sky' ? m.name : m.id; };
const curSet = () => ({ ...DEF, ...(C.chat ? C.chat.settings : C.draftSet) });

/* ---------------- Tekst ---------------- */

/** Enkel Markdown: kodeblokker, punkter, nummerering, overskrifter, **fet** og `kode`. Alt escapes. */
// Prompt 50: markdown-tabeller (kvittering i chat: Vare | Antall | Pris).
const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
function tableHtml(rows) {
  const sep = rows.findIndex((r) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(r));
  const head = sep === 1 ? cellsOf(rows[0]) : null, al = sep === 1 ? cellsOf(rows[1]).map((c) => (/-:$/.test(c) ? ' class="r"' : '')) : [];
  const inl = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const body = rows.slice(sep === 1 ? 2 : 0).map((r) => `<tr>${cellsOf(r).map((c, i) => `<td${al[i] ?? ''}>${inl(c)}</td>`).join('')}</tr>`).join('');
  return `<table>${head ? `<thead><tr>${head.map((c, i) => `<th${al[i] ?? ''}>${inl(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${body}</tbody></table>`;
}
function md(t) {
  const out = []; let code = null, tbl = null;
  const flushT = () => { if (tbl) { out.push(tableHtml(tbl)); tbl = null; } };
  for (const l of String(t ?? '').split('\n')) {
    if (!code && /^\s*\|.*\|\s*$/.test(l)) { (tbl ??= []).push(l); continue; }
    flushT();
    if (/^```/.test(l)) { if (code) { out.push(`<pre class="ch-code">${esc(code.join('\n'))}</pre>`); code = null; } else code = []; continue; }
    if (code) { code.push(l); continue; }
    if (!l.trim()) continue;
    const li = l.match(/^\s*[-*•]\s+(.*)/), nu = l.match(/^\s*(\d+)[.)]\s+(.*)/), hd = l.match(/^#+\s+(.*)/);
    const txt = li ? li[1] : nu ? nu[2] : hd ? hd[1] : l;
    const inl = esc(txt).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    out.push(li || nu ? `<div class="ch-li"><span>${li ? '•' : `${nu[1]}.`}</span><span>${inl}</span></div>` : hd ? `<div class="ch-p"><b>${inl}</b></div>` : `<div class="ch-p">${inl}</div>`);
  }
  flushT();
  if (code) out.push(`<pre class="ch-code">${esc(code.join('\n'))}</pre>`);
  return out.join('');
}
const pad = (n) => String(n).padStart(2, '0');
function rel(iso) {
  const t = new Date(iso).getTime(), sod = new Date(new Date().toDateString()).getTime(), d = new Date(t);
  return t >= sod ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : t >= sod - 864e5 ? 'i går' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

/* ---------------- Visning ---------------- */

function rowHtml(x) {
  return `<div class="ch-row${x.id === C.cur ? ' on' : ''}" role="button" tabindex="0" data-ch-open="${esc(x.id)}"><span class="ch-grow"><b data-no-i18n>${esc(x.title)}</b><span>${esc(mName(x.model || ''))} · ${esc(rel(x.updatedAt))}</span></span><button type="button" class="ch-dots" data-ch-menu="${esc(x.id)}" aria-label="Valg for samtalen">⋯</button></div>`;
}
function groupsHtml() {
  if (!C.list) return skelRows70(); // prompt 70: skjelettrader til lista er hentet
  if (C.q.trim()) {
    const L = C.qList ?? [];
    return `<div class="ch-gh">TREFF · ${L.length}</div>${L.map(rowHtml).join('')}`;
  }
  const sod = new Date(new Date().toDateString()).getTime();
  const { pinned, folders, chats } = C.list, at = (x) => new Date(x.updatedAt).getTime();
  let h = pinned.length ? `<div class="ch-gh">FESTET</div>${pinned.map(rowHtml).join('')}` : '';
  if (folders.length) {
    h += '<div class="ch-gh">MAPPER</div>';
    for (const f of folders) {
      const open = C.open[f.id] ?? f.open !== false;
      h += `<button type="button" class="ch-fold" data-ch-fold="${esc(f.id)}" aria-expanded="${open}"><span class="ch-arr">${open ? '▾' : '▸'}</span>${svg(IC.folder, 16)}<span class="ch-grow" data-no-i18n>${esc(f.name)}</span><span class="ch-n">${f.chats.length}</span></button>${open ? f.chats.map(rowHtml).join('') : ''}`;
    }
  }
  for (const [t, L] of [['I DAG', chats.filter((x) => at(x) >= sod)], ['I GÅR', chats.filter((x) => at(x) < sod && at(x) >= sod - 864e5)], ['SISTE 7 DAGER', chats.filter((x) => at(x) < sod - 864e5 && at(x) >= sod - 7 * 864e5)], ['ELDRE', chats.filter((x) => at(x) < sod - 7 * 864e5)]]) {
    if (L.length) h += `<div class="ch-gh">${t}</div>${L.map(rowHtml).join('')}`;
  }
  return h || '<div class="ch-empty-s">Ingen samtaler ennå.</div>';
}
function sideHtml(drawer) {
  const loc = allModels().filter((m) => m.kind === 'lokal' && m.installed).length, sky = allModels().filter((m) => m.kind === 'sky').length;
  return `<aside class="ch-side${drawer ? ' drawer' : ''}">
    <div class="ch-side-h"><b>Chat</b><button type="button" class="ch-ib" data-ch-new aria-label="Ny chat" title="Ny chat">${svg(IC.newc, 20)}</button></div>
    <div class="ch-sq">${searchField({ name: 'chq', value: C.q, placeholder: 'Søk i samtaler', cls: 'ch-sf', attrs: 'data-ch-q' })}</div>
    <div class="ch-groups" data-ch-groups>${groupsHtml()}</div>
    <div class="ch-side-f">
      <button type="button" class="ch-sfb" data-ch-sheet="mods">${svg(IC.chip)}<span class="ch-grow">Modeller</span><small>${loc} lokale · ${sky} i skyen</small></button>
      <button type="button" class="ch-sfb" data-ch-sheet="kb">${svg(IC.doc)}<span class="ch-grow">Kunnskapsbase</span><small>${C.kb ? `${C.kb.length} dokumenter` : '›'}</small></button>
      <button type="button" class="ch-sfb" data-ch-theme>${svg(IC.moon)}<span class="ch-grow">Tema</span><small>${C.theme === 'noytral' ? 'Nøytral' : 'Papir'}</small></button>
      <span class="ch-note">Historikken synkes mellom mobil og web.</span>
    </div></aside>`;
}

function msgsHtml() {
  const msgs = (C.chat?.messages ?? []).filter((m) => m.role !== 'system');
  const busyHere = C.busy && (C.busy.chatId === C.cur || (!C.cur && !C.busy.chatId));
  const lastA = msgs.map((m) => m.role).lastIndexOf('assistant');
  // Prompt 70: lange samtaler tegnes fra de siste 30 meldingene; «Vis eldre» henter 30 til.
  const start70 = Math.max(0, msgs.length - C.show70);
  return (start70 ? `<button type="button" class="ch70-older" data-ch-older>Vis eldre meldinger (${start70})</button>` : '') + msgs.map((m, i) => {
    if (i < start70) return '';
    const key = `${C.cur}:${i}`;
    if (m.role === 'user') {
      // Prompt 50: bildene vises over teksten (miniatyrer); andre filer som piller.
      const att = [...new Set([...(m.files ?? []).map((f) => (typeof f === 'string' ? f : f.name)).filter((n) => !(m.attachments ?? []).some((a) => a.kind === 'image' && a.name === n)), ...otherFiles50(m)])];
      if (C.edit && C.edit.i === i) {
        return `<div class="ch-u"><div class="ch-edit"><textarea data-ch-edv rows="3">${esc(C.edit.v)}</textarea><div><button type="button" class="ch-pill line" data-ch-edcancel>Avbryt</button><button type="button" class="ch-pill ink" data-ch-edsave>Lagre og send</button></div></div></div>`;
      }
      return `<div class="ch-u">${bubbleImgs50(m, i)}${att.length ? `<div class="ch-atts">${att.map((n) => `<span data-no-i18n>${esc(n)}</span>`).join('')}</div>` : ''}<div class="ch-ub" data-no-i18n>${esc(m.content)}</div>
        <div class="ch-acts">${busyHere ? '' : `<button type="button" data-ch-edit="${i}">Rediger</button>`}<button type="button" data-ch-copy="${i}">${C.copied === key ? 'Kopiert' : 'Kopier'}</button></div></div>`;
    }
    const meta = m.meta ?? {}, used = usedWithoutFacts41(meta.used, meta.facts), tool = meta.tool ? [].concat(meta.tool) : [];
    const sec = meta.ms ? `${(meta.ms / 1000).toFixed(1).replace('.', ',')} s` : '';
    const st = meta.glimt || tool.length ? [meta.stopped ? 'Stoppet' : '', `Verktøy${sec ? ` · ${sec}` : ''}`, meta.source && meta.source !== 'Glimt' ? meta.source : '', meta.cached ? 'Fra cachen' : ''].filter(Boolean).join(' · ') // prompt 59: Stoppet / svar-cachen
      : [meta.stopped ? 'Stoppet' : '', autoWhy41(meta), meta.tokensPerSec ? `${String(meta.tokensPerSec).replace('.', ',')} tok/s` : '', sec].filter(Boolean).join(' · ');
    const who = meta.glimt ? 'GLIMT' : `GLIMT · ${(meta.auto?.modelName ?? mName(meta.auto?.model || meta.model || C.chat?.model || '')).toUpperCase()}`;
    const pu = i > 0 && msgs[i - 1]?.role === 'user' ? i - 1 : -1; // prompt 50: bildet svaret leste, som liten miniatyr + filnavn
    return `<div class="ch-a"><div class="ch-ah"><span class="ch-lab">${glimt(22, 'klar')}${esc(who)}</span>${pu >= 0 ? filePills50(msgs[pu], pu) : ''}${tool.map((u) => `<span class="ch-used ch-tool">${esc(u)}</span>`).join('')}${used.map((u) => `<span class="ch-used">Brukte <span data-no-i18n>${esc(u)}</span></span>`).join('')}</div>
      ${(() => { const th = thinkOf52(m); return th ? thinkHtml52({ key, steps: th.steps, s: th.s, source: th.source, open: !!C.thOpen?.[key] }) : ''; })()}<div class="ch-md" data-no-i18n>${md(m.content)}</div>${factsHtml41(meta.facts)}${meta.card ? `<div class="ch-card">${cardHtml(meta.card)}</div>` : ''}${meta.s62done ? schedDone62Html(meta.s62done) : ''}${i === lastA && !busyHere ? choices60Html(meta, i) : ''}${meta.error ? `<div class="ch-errl">${esc(meta.error)}</div>` : ''}${finansBtn50(meta, `${C.cur}:${i}`, C.fin50?.[`${C.cur}:${i}`])}${readWith50(meta)}
      <div class="ch-acts a"><button type="button" data-ch-copy="${i}">${svg(IC.copy, 15)}${C.copied === key ? 'Kopiert' : 'Kopier'}</button>${i === lastA && !busyHere && !meta.glimt ? `<button type="button" data-ch-regen="${i}">${svg(IC.regen, 15)}Nytt svar</button>` : ''}${i === lastA && !busyHere && !C.web && C.webAsk46 && String(C.webAsk46.chatId ?? '') === String(C.cur ?? '') ? `<button type="button" class="ch-web46" data-ch-web46="${i}">${svg(IC.web, 15)}${esc(C.webAsk46.action?.label ?? 'Søk denne gangen')}</button>` : ''}<button type="button" data-ch-speak="${i}">${svg(IC.spk, 15)}${C.speak === key ? `Stopp${C.speakAi ? aiTag57() : ''}` : 'Les høyt'}</button>${meta.glimt && meta.traceId && !meta.stopped ? thumbs61Html(meta.traceId) : ''}${st ? `<span class="ch-st">${esc(st)}</span>` : ''}</div></div>`;
  }).join('') + (busyHere ? streamHtml() : '');
}
/** Prompt 60: valgknapper (meta.choices) og bekreftelse (meta.confirm) under det siste Glimt-svaret. */
function choices60Html(meta, i) {
  const c = meta.choices, f = meta.confirm, out = [];
  if (c?.items?.length) out.push(`<div class="ga45-ask ga60-ch" data-ch-set60="${esc(c.setId ?? '')}"><div class="ga45-opts" role="group" aria-label="Velg">${c.items.map((x, j) => `<button type="button" class="ga45-o" data-ch-ch60="${i}:${j}" data-no-i18n>${esc(x.label)}</button>`).join('')}</div></div>`);
  const p62 = f?.token ? meta.s62 ?? null : null; // prompt 62: hva, når, betingelse og neste kjøringer over Ja/Avbryt
  if (f?.token) out.push(`<div class="ga45-cf">${f.summary && !p62 && !String(meta.content ?? '').includes(f.summary) ? `<b data-no-i18n>${esc(f.summary)}</b>` : ''}${p62 ? schedCard62Html(p62) : ''}<div class="ga45-opts">${p62 ? `<button type="button" class="ga45-o${/^(delete|stop|pause)$/.test(p62.action) ? ' danger' : ''}" data-ch-cf60="yes:${i}">${esc(yesLabel62(p62))}</button>` : `<button type="button" class="ga45-o danger" data-ch-cf60="yes:${i}">Ja, gjør det</button>`}<button type="button" class="ga45-o" data-ch-cf60="no:${i}">Avbryt</button></div></div>`);
  return out.length ? `<div class="ga45 ch-ga60">${out.join('')}</div>` : '';
}
/** Prompt 60: «Ja, gjør det» / «Avbryt» på en endrende handling (POST /api/glimt/agent/confirm {token}). */
async function confirm60(i, yes) {
  const msgs = (C.chat?.messages ?? []).filter((m) => m.role !== 'system'), m = msgs[i];
  if (!m?.meta?.confirm?.token || C.busy) return;
  const token = m.meta.confirm.token;
  m.meta = { ...m.meta, confirm: null };
  let text, meta = { glimt: true, model: 'Glimt', tool: 'Glimt', source: 'Glimt' };
  if (!yes) text = 'Greit, jeg lot det være.';
  else {
    C.busy = { chatId: C.cur, model: 'Glimt', glimt: true, text: '', ctl: new AbortController() }; paint(); toBottom();
    try { const a = await agentConfirm(token); text = agentText(a) || 'Ferdig.'; if (a.choices) meta.choices = a.choices; if (a.confirm) meta.confirm = a.confirm; if (a.traceId) meta.traceId = a.traceId; const p62 = a.confirm ? preview62(a) : null, d62 = done62(a); if (p62) meta.s62 = p62; if (d62) meta.s62done = d62; }
    catch (e) { text = e.message || 'Fikk ikke utført handlingen.'; meta.error = text; }
    C.busy = null;
  }
  const am = { role: 'assistant', content: text, ts: Date.now(), meta };
  const id = C.cur || `g:${Date.now().toString(36)}`;
  toolsAdd(id, [am]); C.cur = id;
  C.chat = { ...(C.chat ?? {}), id, messages: [...(C.chat?.messages ?? []), am] };
  writeLocal(); paint(); toBottom();
}
/** «✦ Kode · Qwen 3» når Auto valgte modellen (serveren sender auto/reason/task i meta). */
function autoWhy41(meta) {
  if (meta.auto?.label) return `${meta.auto.label}${meta.auto.fallback ? ' · reserve' : ''}`;
  const a = meta.auto, why = (a && typeof a === 'object' ? a.reason ?? a.task : null) ?? meta.autoReason ?? meta.task ?? '';
  if (!a && !meta.autoReason && !(C.chat?.model === 'auto' && meta.model && meta.model !== 'auto')) return '';
  const used = (a && typeof a === 'object' ? a.model : null) ?? meta.model;
  return `✦ ${[why ? String(why).replace(/^./, (c) => c.toUpperCase()) : 'Auto', used && used !== 'auto' ? modelOf(used).name || used : ''].filter(Boolean).join(' · ')}${a?.fallback || meta.fallback ? ' · reserve' : ''}`;
}
function streamHtml() {
  const b = C.busy;
  // Prompt 31: Glimt-merket ved siden av modellnavnet: Tenker (før første ord), Svarer (mens teksten strømmer inn).
  const who = b.glimt ? (b.text ? 'GLIMT · SVARER' : 'GLIMT · TENKER') : `GLIMT · ${(b.pickLabel || (b.picked ? `✦ ${mName(b.picked)}` : mName(b.model))).toUpperCase()}`;
  const all = (C.chat?.messages ?? []).filter((m) => m.role !== 'system'), lu = all.length - 1;
  return `<div class="ch-a" data-ch-stream><div class="ch-ah"><span class="ch-lab">${glimt(22, b.text ? 'svarer' : 'tenker')}${esc(who)}</span>${all[lu]?.role === 'user' ? filePills50(all[lu], lu) : ''}${(b.reading ?? []).map((u) => `<span class="ch-used">Leser <span data-no-i18n>${esc(u)}</span></span>`).join('')}</div>
    ${streamThink52(b)}${b.status59 ? `<div class="ch-st59" role="status" data-ch-status59><span class="ch-st59-dot" aria-hidden="true"></span><span data-no-i18n>${esc(b.status59)}</span></div>` : ''}${b.error ? `<div class="ch-errl">${esc(b.error)}</div>` : b.text ? `<div class="ch-md" data-no-i18n>${md(b.text)}</div>` : b.think?.length ? '' : `<span class="ch-think" aria-label="Glimt tenker">${glimtDots()}</span>`}${factsHtml41(b.facts)}${b.readWith ? readWith50({ readWith: b.readWith }) : ''}</div>`;
}
/** Prompt 52: «✦ Tenker … 2,1 s ▾» mens modellen tenker; «✦ Tenkte i 2,1 s ›» når svaret strømmer. */
function streamThink52(b) {
  if (!b.think?.length) return '';
  const live = !b.text && b.thS == null;
  const s = b.thS ?? (Date.now() - (b.thT0 ?? Date.now())) / 1000;
  return thinkHtml52({ key: 'live', steps: b.think, s, live, source: b.thSrc, open: b.thOpen ?? live });
}
function emptyHtml() {
  const id = curModelId(), m = modelOf(id), P = curSet();
  return `<div class="ch-empty"><div class="ch-eh"><span class="ch-lab">${esc((m.kind === 'auto' ? '✦ Auto · Glimt velger modell for hver melding' : m.kind === 'sky' ? `${m.name} · ${m.provider === 'groq' ? 'Groq' : 'Google'} · sky` : `${m.id} · lokalt på hjemmeserveren`).toUpperCase())}</span><b>Hva kan jeg hjelpe med?</b></div>
    <div class="ch-pers">${PERS.map(([k, n]) => `<button type="button" class="${P.persona === k ? 'on' : ''}" data-ch-per="${k}">${n}</button>`).join('')}</div>
    <div class="ch-sugg">${SUGG.map(([t, s], i) => `<button type="button" data-ch-sugg="${i}"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</button>`).join('')}</div></div>`;
}
function composerHtml() {
  const id = curModelId(), sky = isSky(id), busy = !!C.busy, dataOK = !!C.set.chat_my_data, m = modelOf(id);
  const attH = attRow50(C.att), upl = C.att.some((a) => a.up); // prompt 50: miniatyrer med fremdrift; Send er av til alt er lastet opp
  return `<div class="ch-comp">${C.toast ? `<div class="ch-toast" role="status">${esc(C.toast)}</div>` : ''}
    <div class="ch-box">${attH}
      ${C.rec ? `<div class="ch-rec"><i></i><span class="ch-grow">Lytter … snakk nå</span><span class="ch-wave">${'<span></span>'.repeat(7)}</span></div>` : `<textarea data-ch-in rows="${Math.min(6, Math.max(1, C.inp.split('\n').length))}" placeholder="${m.kind === 'auto' ? 'Spør Glimt …' : `Spør ${esc(sky ? m.name : m.id)} …`}" enterkeyhint="send" aria-label="Melding">${esc(C.inp)}</textarea>`}
      <div class="ch-bar"><button type="button" class="ch-cb" data-ch-sheet="plus" aria-label="Legg ved">${svg(IC.plus, 18)}</button>
        <button type="button" class="ch-chip${C.web ? ' on' : ''}" data-ch-web aria-pressed="${C.web}">${svg(IC.web, 15)}Nettsøk</button>
        <button type="button" class="ch-chip${C.data && dataOK ? ' on' : ''}${dataOK ? '' : ' dim'}" data-ch-data aria-pressed="${C.data && dataOK}">${svg(IC.db, 15)}Mine data</button>
        <span class="ch-grow"></span>
        <button type="button" class="ch-mic${C.rec ? ' on' : ''}" data-ch-mic aria-label="${C.rec ? 'Stopp opptak' : 'Snakk'}">${svg(IC.mic, 19)}</button>
        ${busy ? '<button type="button" class="ch-send" data-ch-stop aria-label="Stopp"><span class="ch-sq-ic"></span></button>' : `<button type="button" class="ch-send${C.inp.trim() && !upl ? '' : ' dim'}" data-ch-send aria-label="Send"${upl ? ' disabled title="Vent til vedleggene er lastet opp"' : ''}>${svg(IC.up, 18, 2.6)}</button>`}
      </div></div>
    <div class="ch-foot">${m.kind === 'auto' ? (C.data && C.set.chat_my_data ? 'Glimt velger modell for hver melding. Med Mine data holdes alt lokalt.' : 'Glimt velger beste modell for hver melding.') : sky ? `Sky-modell: meldingen sendes til ${m.provider === 'groq' ? 'Groq' : 'Google'}.` : 'Kjører lokalt på hjemmeserveren. Ingenting sendes ut.'}</div></div>`;
}

/* Prompt 34: AI-kontroll over Chat (Modeller → fanen Modeller, Samtaleinnstillinger → Full AI-kontroll → Valg). */
function openAiCtl(tab) {
  import('./ai-control.js').then((m) => m.openAiControl({ tab, scope: 'chat', theme: C.theme === 'noytral' ? 'mork' : 'papir', admin: store.me?.me?.role === 'admin',
    onClose2: async () => { try { const r = await call('/models'); C.models = r.models ?? C.models; paint(); } catch { /* */ } } })).catch((e) => toast(e.message));
}

/* ---------- Ark ---------- */

const sheetWrap = (inner, t, cls = '') => `<div class="ch-sheet-bg" data-ch-close><div class="ch-sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(t)}"><div class="ch-sh-h"><b>${esc(t)}</b><button type="button" class="ch-x" data-ch-close aria-label="Lukk">✕</button></div>${inner}</div></div>`;
function modelSheet() {
  const id = curModelId(), row = (m) => `<button type="button" class="ch-mrow" data-ch-model="${esc(m.id)}"><span class="ch-grow"><b data-no-i18n>${esc(m.kind === 'sky' ? m.name : m.id)}</b><span>${esc([m.kind === 'sky' ? (m.provider === 'groq' ? 'Groq · sky' : 'Google · sky') : m.name, m.size, m.vision ? 'Tekst og bilde' : 'Tekst'].filter(Boolean).join(' · '))}</span></span>${m.vision ? '<span class="ch-vis50" title="Modellen kan lese bilder">Ser bilder</span>' : ''}<span class="ch-badge ${m.kind === 'sky' ? 'sky' : ''}">${m.kind === 'sky' ? 'SKY' : 'LOKAL'}</span><span class="ch-chk">${m.id === id ? '✓' : ''}</span></button>`;
  const loc = allModels().filter((m) => m.kind === 'lokal' && m.installed), sky = allModels().filter((m) => m.kind === 'sky');
  const auto = C.auto ? `<div class="ch-list"><button type="button" class="ch-mrow ch-auto41" data-ch-model="${esc(C.auto.id)}"><span class="ch-grow"><b>${esc(C.auto.label || '✦ Auto')}</b><span>Glimt velger beste modell for hver melding · lokalt når dine data er med</span></span><span class="ch-badge auto41">AUTO</span><span class="ch-chk">${id === C.auto.id ? '✓' : ''}</span></button></div>` : '';
  return sheetWrap(`${auto}<div class="ch-gl">LOKALT · OLLAMA PÅ HJEMMESERVEREN</div><div class="ch-list">${loc.map(row).join('') || '<div class="ch-li-e">Ingen lokale modeller installert.</div>'}</div>
    <div class="ch-gl">SKY</div><div class="ch-list">${sky.map(row).join('') || '<div class="ch-li-e">Ingen sky-modeller. Legg inn Gemini- eller Groq-nøkkel under Innstillinger → AI.</div>'}</div>
    <span class="ch-hint">Sky-modeller merkes SKY. Før dine data eller vedlegg sendes dit, får du spørsmål om det.</span>
    <button type="button" class="ch-btn line" data-ch-sheet="mods">Administrer modeller ›</button>`, 'Velg modell');
}
function paramsSheet() {
  const P = curSet(), chip = (on, a, n) => `<button type="button" class="${on ? 'on' : ''}" ${a}>${n}</button>`;
  return sheetWrap(`<span class="ch-hint">${C.chat ? 'Gjelder denne samtalen' : 'Gjelder nye samtaler'}</span>
    <div class="ch-gl">PERSONA</div><div class="ch-seg wrap">${PERS.map(([k, n]) => chip(P.persona === k, `data-ch-per="${k}"`, n)).join('')}</div>
    <div class="ch-gl">SYSTEMPROMPT</div><textarea class="ch-ta" data-ch-sys rows="3" placeholder="F.eks. «Svar alltid med maks tre setninger.»">${esc(P.system)}</textarea>
    <label class="ch-rng"><span><b>Temperatur</b><i data-ch-tv>${String(P.temperature).replace('.', ',')}</i></span><input type="range" min="0" max="2" step="0.1" value="${P.temperature}" data-ch-temp></label>
    <label class="ch-rng"><span><b>Top P</b><i data-ch-pv>${String(P.topP).replace('.', ',')}</i></span><input type="range" min="0.1" max="1" step="0.05" value="${P.topP}" data-ch-topp></label>
    <div class="ch-gl">KONTEKSTLENGDE</div><div class="ch-seg">${CTXS.map((n) => chip(P.numCtx === n, `data-ch-ctx="${n}"`, `${n / 1024}k`)).join('')}</div>
    <div class="ch-gl">TEMA</div><div class="ch-seg">${chip(C.theme === 'papir', 'data-ch-th="papir"', 'Papir')}${chip(C.theme === 'noytral', 'data-ch-th="noytral"', 'Nøytral')}</div>
    <button type="button" class="ch-mi ch-aictl" data-ch-aictl><span class="ch-grow"><b>Full AI-kontroll</b><small>Modeller, ruting, jobber, forbruk og nøkler</small></span><span aria-hidden="true">›</span></button>
    <button type="button" class="ch-btn ink" data-ch-close>Ferdig</button>`, 'Samtaleinnstillinger');
}
function menuSheet() {
  const all = C.list ? [...C.list.pinned, ...C.list.folders.flatMap((f) => f.chats), ...C.list.chats] : [];
  const x = all.find((c) => c.id === C.menuId) ?? (C.chat?.id === C.menuId ? C.chat : null);
  if (!x) return '';
  const fl = [['', 'Ingen mappe'], ...(C.list?.folders ?? []).map((f) => [f.id, f.name])];
  return sheetWrap(`<form class="ch-frow" data-ch-rename><input class="ch-inp" name="rn" value="${esc(C.rn || x.title)}" aria-label="Navn på samtalen" data-no-i18n><button type="submit" class="ch-pill ink">Gi nytt navn</button></form>
    <div class="ch-list"><button type="button" class="ch-mi" data-ch-pin>${x.pinned ? 'Løsne' : 'Fest øverst'}</button><button type="button" class="ch-mi" data-ch-export>Eksporter Markdown</button><button type="button" class="ch-mi" data-ch-share>Del lenke</button></div>
    <div class="ch-gl">FLYTT TIL MAPPE</div><div class="ch-seg wrap">${fl.map(([id, n]) => `<button type="button" class="${(x.folderId ?? '') === id ? 'on' : ''}" data-ch-mvf="${esc(id)}"${id ? ' data-no-i18n' : ''}>${esc(n)}</button>`).join('')}</div>
    <form class="ch-frow" data-ch-newf><input class="ch-inp" name="nf" placeholder="Ny mappe" autocomplete="off"><button type="submit" class="ch-pill line">Lag og flytt</button></form>
    <button type="button" class="ch-btn red" data-ch-del>${C.delArm ? 'Trykk igjen for å slette' : 'Slett samtalen'}</button>`, 'Samtale');
}
function guardSheet() {
  const g = C.guard;
  if (!g) return '';
  const loc = allModels().find((m) => m.kind === 'lokal' && m.installed);
  return sheetWrap(`<span class="ch-txt">Dette er en sky-modell. Dette forlater hjemmeserveren hvis du sender:</span>
    <div class="ch-list">${['Meldingen din', ...(g.leaves ?? [])].map((n) => `<div class="ch-leave"><i>↗</i>${esc(n)}</div>`).join('')}</div>
    <button type="button" class="ch-chk2" data-ch-rem role="checkbox" aria-checked="${C.rem}"><span>${C.rem ? '☑' : '☐'}</span>Ikke spør igjen i denne samtalen</button>
    <button type="button" class="ch-btn ink" data-ch-g="send">Send</button>
    ${g.hasData ? '<button type="button" class="ch-btn line" data-ch-g="nodata">Send uten mine data</button>' : ''}
    ${loc ? `<button type="button" class="ch-btn line" data-ch-g="local">Bruk lokal modell (<span data-no-i18n>${esc(loc.id)}</span>)</button>` : ''}`, `Sende til ${g.model}?`);
}
function plusSheet() {
  return sheetWrap(`<div class="ch-list">
    <label class="ch-mi"><input type="file" accept="image/*" multiple data-ch-file="img" hidden><i>▣</i><span class="ch-grow"><b>Bilde eller kamera</b><small>Glimt bruker en modell som ser bilder (eller lokal OCR) · du kan også dra inn eller lime inn</small></span></label>
    <label class="ch-mi"><input type="file" multiple data-ch-file="file" hidden><i>⎙</i><span class="ch-grow"><b>Fil</b><small>PDF, Word, tekst – leses av serveren</small></span></label>
    <button type="button" class="ch-mi" data-ch-sheet="kb"><i>#</i><span class="ch-grow"><b>Fra kunnskapsbasen</b><small>Dokumenter som er lastet opp før</small></span></button></div>`, 'Legg ved');
}
function kbSheet() {
  if (!C.kb) { loadKb(); }
  const rows = (C.kb ?? []).map((d) => { const on = C.att.some((a) => a.id === d.id); return `<button type="button" class="ch-kbr${on ? ' on' : ''}" data-ch-kbsel="${esc(d.id)}"><span class="ch-kbc">${on ? '✓' : ''}</span><span class="ch-grow"><b data-no-i18n>${esc(d.name)}</b><small>${esc([d.source === 'openwebui' ? 'Open WebUI' : 'Lastet opp', d.size ? `${Math.max(1, Math.round(d.size / 1024))} kB` : ''].filter(Boolean).join(' · '))}</small></span></button>`; }).join('');
  return sheetWrap(`<span class="ch-hint">${C.att.filter((a) => a.kind === 'doc').length} valgt</span><div class="ch-list">${C.kb ? rows || '<div class="ch-li-e">Ingen dokumenter ennå.</div>' : '<div class="ch-li-e">Laster …</div>'}</div>
    <label class="ch-btn dash"><input type="file" multiple data-ch-file="kbup" hidden>+ Last opp til kunnskapsbasen</label>
    <button type="button" class="ch-btn ink" data-ch-close>Ferdig</button>`, 'Kunnskapsbase');
}
function modsSheet() {
  const inst = allModels().filter((m) => m.kind === 'lokal' && m.installed), lib = allModels().filter((m) => m.kind === 'lokal' && !m.installed && C.pulls[m.id] == null);
  const pulling = Object.entries(C.pulls);
  return sheetWrap(`<div class="ch-gl">INSTALLERT</div><div class="ch-list">${inst.map((m) => `<div class="ch-mod"><span class="ch-grow"><b data-no-i18n>${esc(m.id)}</b><small>${esc([m.name, m.size, m.vision ? 'Tekst og bilde' : 'Tekst'].filter(Boolean).join(' · '))}</small></span><button type="button" class="ch-pill ${C.mdel === m.id ? 'red' : 'line'}" data-ch-mdel="${esc(m.id)}">${C.mdel === m.id ? 'Bekreft' : 'Slett'}</button></div>`).join('') || '<div class="ch-li-e">Ingen lokale modeller.</div>'}
    ${pulling.map(([n, p]) => `<div class="ch-mod col"><div class="ch-pr"><b data-no-i18n>${esc(n)}</b><span>${p.err ? esc(p.err) : `${Math.round(p.pct)} %`}</span></div><span class="ch-bar2"><i style="width:${p.pct}%"></i></span></div>`).join('')}</div>
    <div class="ch-gl">HENT FRA OLLAMA.COM</div><div class="ch-list">${lib.map((m) => `<div class="ch-mod"><span class="ch-grow"><b data-no-i18n>${esc(m.id)}</b><small>${esc([m.name, m.size].filter(Boolean).join(' · '))}</small></span><button type="button" class="ch-pill ink" data-ch-pull="${esc(m.id)}">Hent</button></div>`).join('') || '<div class="ch-li-e">Alle foreslåtte modeller er installert.</div>'}</div>
    <form class="ch-frow" data-ch-pullf><input class="ch-inp mono" name="pn" placeholder="Modellnavn, f.eks. llama3.2:1b" autocomplete="off" spellcheck="false"><button type="submit" class="ch-pill ink">Hent</button></form>
    <span class="ch-hint">Å hente og slette modeller krever administrator.${C.owui ? ' Går via Open WebUI.' : ''}</span>`, 'Modeller');
}
function sheetHtml() {
  return { model: modelSheet, params: paramsSheet, menu: menuSheet, guard: guardSheet, plus: plusSheet, kb: kbSheet, mods: modsSheet }[C.sheet]?.() ?? '';
}

function body() {
  if (C.missing) return `<div class="ch-miss"><b>Chat er ikke tilgjengelig ennå</b><span>Serveren mangler /api/chat. Oppdater Homelab-serveren for å bruke Chat med Ollama, Gemini og Groq.</span></div>`;
  const wide = !isMobile(), id = curModelId(), m = modelOf(id), sky = m.kind === 'sky';
  const hasMsgs = (C.chat?.messages ?? []).some((x) => x.role !== 'system') || C.busy;
  return `${wide ? sideHtml(false) : ''}<div class="ch-main">
    <div class="ch-top">${wide ? '' : `<button type="button" class="ch-ib" data-ch-drawer aria-label="Historikk">${svg(IC.menu, 22)}</button>`}
      <button type="button" class="ch-msel" data-ch-sheet="model"><b data-no-i18n>${esc(m.kind === 'auto' ? m.name : sky ? m.name : m.id || 'Velg modell')}</b><span class="ch-badge ${m.kind === 'auto' ? 'auto41' : sky ? 'sky' : ''}">${m.kind === 'auto' ? 'AUTO' : sky ? 'SKY' : 'LOKAL'}</span><span class="ch-arr">▼</span></button>
      <span class="ch-grow"></span>
      <button type="button" class="ch-ib" data-ch-sheet="params" aria-label="Samtaleinnstillinger" title="Samtaleinnstillinger">${svg(IC.gear, 20)}</button>${fsBtns()}
      ${wide ? '' : `<button type="button" class="ch-ib" data-ch-new aria-label="Ny chat">${svg(IC.newc, 20)}</button>`}</div>
    <div class="ch-sc" data-ch-sc><div class="ch-msgs">${C.err && !allModels().length ? `<div class="ch-errl">Fikk ikke hentet modellene: ${esc(C.err)}</div>` : ''}${hasMsgs ? msgsHtml() : emptyHtml()}</div></div>
    ${composerHtml()}</div>
  ${!wide && C.drawer ? `<div class="ch-dbg" data-ch-drawer-close></div>${sideHtml(true)}` : ''}${sheetHtml()}`;
}

/** Prompt 70: lastesiden til alt er klart (oppdateres på stedet, så orben og spinnerne ikke starter på nytt). */
function paintLoad70(h) {
  if (update70(h)) return;
  h.innerHTML = loaderHtml70({ wide: !isMobile(), cache: cacheRead70() });
}
function paint() {
  const h = host();
  if (!h) return;
  if (!C.ready70) { paintLoad70(h); return; }
  const sc = h.querySelector('[data-ch-sc]'), atBottom = sc ? sc.scrollHeight - sc.scrollTop - sc.clientHeight < 40 : true, y = sc?.scrollTop ?? 0;
  const gs = h.querySelector('[data-ch-groups]')?.scrollTop ?? 0;
  const ae = document.activeElement, fk = ae && h.contains(ae) ? ['data-ch-in', 'data-ch-q', 'data-ch-edv', 'data-ch-sys'].find((a) => ae.hasAttribute(a)) : null;
  const sel = fk ? [ae.selectionStart, ae.selectionEnd] : null;
  h.className = `ch ch-fs ${C.theme === 'noytral' ? 'noytral' : 'papir'}`;
  h.innerHTML = body();
  const sc2 = h.querySelector('[data-ch-sc]');
  if (sc2) sc2.scrollTop = atBottom ? sc2.scrollHeight : y;
  const g2 = h.querySelector('[data-ch-groups]'); if (g2) g2.scrollTop = gs;
  if (fk) { const el = h.querySelector(`[${fk}]`); if (el) { el.focus(); try { el.setSelectionRange(sel[0], sel[1]); } catch { /* */ } } }
}
function paintSide() { const g = host()?.querySelector('[data-ch-groups]'); if (g) g.innerHTML = groupsHtml(); }
function paintStream() {
  const h = host(), el = h?.querySelector('[data-ch-stream]');
  if (!C.busy) return;
  if (!el) { paint(); return; }
  const sc = h.querySelector('[data-ch-sc]'), atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
  el.outerHTML = streamHtml();
  if (atBottom) sc.scrollTop = sc.scrollHeight;
}
function toBottom() { setTimeout(() => { const sc = host()?.querySelector('[data-ch-sc]'); if (sc) sc.scrollTop = sc.scrollHeight; }, 30); }
function toast(t) { C.toast = t; paint(); clearTimeout(toastT); toastT = setTimeout(() => { C.toast = ''; paint(); }, 1900); }

/* ---------------- Sende ---------------- */

// (prompt 50: bilder sendes ikke lenger som base64 – de lastes opp som vedlegg)
// Prompt 41: Mine data huskes per samtale (på i nye samtaler); Auto er standardmodell for nye samtaler.
const DKEY41 = 'chat_data41', AKEY41 = 'chat_auto_mig41';
function dataMap41() { try { return JSON.parse(localStorage.getItem(DKEY41) || '{}') || {}; } catch { return {}; } }
function dataFor41(id) { if (!id) return true; const v = dataMap41()[id]; return v === undefined ? true : !!v; }
function dataSave41(id, v) { if (!id) return; try { const m = dataMap41(); m[id] = !!v; const k = Object.keys(m); if (k.length > 300) delete m[k[0]]; localStorage.setItem(DKEY41, JSON.stringify(m)); } catch { /* privat modus */ } }
function autoMigDone() { try { return localStorage.getItem(AKEY41) === '1'; } catch { return true; } }
function autoMigSet() { try { localStorage.setItem(AKEY41, '1'); } catch { /* */ } }
function fresh41() { C.data = !!C.set.chat_my_data; if (C.auto) C.draftModel = C.auto.id; }
function newChat() {
  newChatConv60(); // prompt 60: ny chat = ny samtale-id (Glimt glemmer forrige samtales tilstand)
  C.cur = null; C.chat = null; C.inp = ''; C.att = []; C.edit = null; C.drawer = false; C.sheet = null; fresh41();
  writeLocal(); paint();
  host()?.querySelector('[data-ch-in]')?.focus();
}

/** Sender teksten som ny melding i samtalen (eller starter en ny). opt: {confirm, withoutData, remember, editFrom, history} */
// Prompt 40: sendingen som pågår (promise), så «✦ AI» i søket kan stoppe den og vente til den er ryddet før ny samtale.
let flight = null, sendGen = 0;
function send(text, opt = {}) {
  const p = sendInner(text, opt);
  flight = p; p.finally(() => { if (flight === p) flight = null; }).catch(() => {});
  return p;
}
async function sendInner(text, opt = {}) {
  const t = String(text ?? '').trim();
  if (C.busy) return;
  if (!t && opt.editFrom == null) return;
  if (C.att.some((a) => a.up)) { toast('Vent til vedleggene er lastet opp'); return; }
  // Prompt 60: valgknapp (opt.choice60) og korte oppfølgere etter et Glimt-svar («og i Bergen?», «den første») går også til Glimt.
  if (opt.editFrom == null && !opt.history && !opt.noTool && !C.att.length && (opt.choice60 || looksLikeTool(t) || followsGlimt60(C.chat?.messages, t)) && await sendTool(t, { choice: opt.choice60?.setId ? opt.choice60 : null })) return;
  const model = curModelId();
  if (!model) { toast('Ingen modell er tilgjengelig'); return; }
  // En samtale som bare finnes lokalt (bare Glimt-svar så langt) blir en ny samtale på serveren nå.
  if (isLocalId(C.cur)) { C.pendingLocal = C.cur; C.cur = null; if (C.chat) C.chat = { ...C.chat, id: null }; }
  const prev = (C.chat?.messages ?? []).filter((m) => m.role !== 'system');
  // Prompt 50: bildene er lastet opp på forhånd (POST /files); meldingen bærer bare id-ene (attachments), aldri base64.
  const imgAtt = C.att.filter((a) => a.kind === 'img' && a.id).map((a) => ({ id: a.id, kind: 'image', name: a.name, thumb: a.thumb || a.th52 || a.preview, preview: a.preview, url: a.url || a.preview }));
  const attTh = C.att.filter((a) => a.kind === 'img' && a.id && a.th52).map((a) => a.th52).slice(0, 4); // prompt 52: miniatyr lagret på meldingen
  const files = C.att.filter((a) => a.kind !== 'img' && a.id).map((a) => a.id);
  const userMsg = { role: 'user', content: t, ...(imgAtt.length ? { attachments: imgAtt } : {}), ...(attTh.length ? { attTh } : {}), ...(C.att.some((a) => a.kind !== 'img') ? { files: C.att.filter((a) => a.kind !== 'img').map((a) => a.name) } : {}) };
  const history = opt.history ?? [...prev, userMsg];
  const payload = { chatId: C.cur || undefined, model, messages: history.map((m) => ({ role: m.role, content: m.content, ...(m.images?.length && !m.attachments?.length ? { images: m.images } : {}), ...(m.attachments?.length ? { attachments: m.attachments.map((a) => a.id).filter(Boolean) } : {}), ...(m.role === 'user' && m.attTh?.length ? { attTh: m.attTh } : {}) })),
    settings: { ...curSet(), theme: C.theme, ...(opt.remember ? { skipCloudAsk: true } : {}) }, webSearch: opt.webOnce ? true : C.web, myData: C.data && !!C.set.chat_my_data, files,
    ...(opt.editFrom != null ? { editFrom: opt.editFrom } : {}), ...(opt.confirm ? { confirmCloud: true } : {}), ...(opt.withoutData ? { withoutMyData: true } : {}) };
  // Optimistisk: vis meldingen med en gang.
  const shown = { ...(C.chat ?? { id: null, title: t.slice(0, 60), model, settings: curSet() }), messages: history };
  const before = { chat: C.chat, inp: C.inp, att: C.att };
  C.chat = shown; C.inp = ''; C.att = []; C.edit = null; C.sheet = null; C.guard = null;
  const ctl = new AbortController();
  C.busy = { chatId: C.cur, model, text: '', ctl, reading: [...files.length ? before.att.filter((a) => a.kind !== 'img').map((a) => a.name) : []] };
  paint(); toBottom();
  let res;
  try {
    res = await fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
  } catch (e) {
    C.busy = null;
    if (e.name === 'AbortError') { C.chat = before.chat; paint(); return; }
    C.chat = before.chat; C.inp = before.inp; C.att = before.att; toast(`Kunne ikke sende: ${e.message}`); return;
  }
  if (res.status === 401) { location.href = '/login'; return; }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    C.busy = null; C.chat = before.chat; C.inp = t; C.att = before.att;
    // Prompt 40: ny samtale (✦ AI i søket): personvernvalget vises inne i samtalen, med spørsmålet over.
    if (res.status === 409 && d.needsConfirm) { const fresh = !before.chat && opt.editFrom == null; if (fresh) { C.chat = shown; C.inp = ''; } C.guard = { model: d.model || mName(model), leaves: d.leaves ?? [], hasData: !!payload.myData, text: t, opt, fresh }; C.rem = false; C.sheet = 'guard'; paint(); return; }
    if (res.status === 404 && !d.error) { C.missing = true; paint(); return; }
    toast(d.error || `Feil ${res.status}`); return;
  }
  await readSse(res, ctl);
}

/** Glimt-verktøy (vær, kalender …): true når svaret er vist, false = send til språkmodellen som vanlig. */
async function sendTool(t, o60 = {}) {
  const before = { chat: C.chat, cur: C.cur, inp: C.inp };
  const ts = Date.now(), userMsg = { role: 'user', content: t, ts };
  const shown = { ...(C.chat ?? { id: null, title: t.slice(0, 60), model: curModelId(), settings: curSet() }), messages: [...(C.chat?.messages ?? []), userMsg] };
  const ctl = new AbortController();
  C.chat = shown; C.inp = ''; C.sheet = null; C.edit = null;
  C.busy = { chatId: C.cur, model: curModelId(), glimt: true, text: '', ctl };
  paint(); toBottom();
  let a, s59 = null, conv60 = null;
  // Prompt 59: Glimt-motoren strømmer (POST /api/glimt/agent/stream): statuslinje mens verktøyene jobber, ordene mens de skrives.
  // Eldre server (404/405) → /api/assist som før. Stopp beholder det som er skrevet, merket «Stoppet».
  try {
    let raf = 0;
    const live = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintStream(); }); };
    conv60 = chatConv60(C.cur);
    s59 = await agentStream59(t, 'chat', {}, { signal: ctl.signal, conversationId: conv60, conversationKind: 'chat', choice: o60.choice ?? null,
      onStatus: (st) => { if (C.busy?.ctl === ctl) { C.busy.status59 = st.text; live(); } },
      onToken: (all) => { if (C.busy?.ctl === ctl) { C.busy.text = all; live(); } } });
  } catch (e) {
    const part = e.partial || (C.busy?.ctl === ctl ? C.busy.text : '');
    C.busy = null;
    if (e.name === 'AbortError') {
      if (!part) { C.chat = before.chat; C.inp = before.inp; paint(); return true; }
      const am = { role: 'assistant', content: part, ts: Date.now(), meta: { glimt: true, stopped: true, model: 'Glimt' } };
      const id = C.cur || `g:${Date.now().toString(36)}`;
      toolsAdd(id, [userMsg, am]); C.cur = id; C.chat = { ...shown, id, ...(isLocalId(id) ? { local: true } : {}), messages: [...shown.messages, am] };
      writeLocal(); paint(); toBottom(); return true;
    }
    if (e.status === 429) { C.chat = before.chat; C.inp = before.inp; toast(e.message); return true; }
    C.chat = before.chat; return false; // feil i Glimt-motoren: til språkmodellen som før (ingen ny kjøring som kan gjenta en handling)
  }
  if (s59) {
    a = fromAgent59(s59, t);
    // Lagre svaret i samtalen på serveren (som /api/assist gjorde), så det også vises i appene. Feil her stopper ikke svaret.
    if (a?.text && a.intent !== 'chat' && a.intent !== 'llm') {
      try {
        const r = await fetch('/api/glimt/agent/stream/save', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: t, text: a.text, chatId: C.cur && !isLocalId(C.cur) ? C.cur : undefined, card: a.card ?? null, tool: a.tool ?? null, intent: a.intent ?? null, ms: a.ms ?? 0 }) });
        if (r.ok) { const j = await r.json(); if (j?.chatId) a.chatId = j.chatId; }
      } catch { /* lagres lokalt som før */ }
    }
  }
  else {
    try { a = await assist(t, { source: 'chat', chatId: C.cur && !isLocalId(C.cur) ? C.cur : undefined, signal: ctl.signal, toast: false }); }
    catch (e) {
      C.busy = null;
      if (e.name === 'AbortError') { C.chat = before.chat; C.inp = before.inp; paint(); return true; }
      C.chat = before.chat; return false;
    }
  }
  C.busy = null;
  if (!a?.text || a.intent === 'llm' || a.intent === 'chat' || (!a.card && !a.tool && !/^(weather|calendar|departures|packages|finance|tasks|trial|appointment|schedule)/.test(a.intent ?? ''))) { C.chat = before.chat; return false; }
  const am = { role: 'assistant', content: a.text, ts: Date.now(), meta: { glimt: true, tool: a.tool ?? null, card: a.card ?? null, ms: a.ms ?? 0, source: a.source ?? '', model: 'Glimt', ...(a.cached ? { cached: true, note: a.notice } : {}),
    ...(a.choices ? { choices: a.choices } : {}), ...(a.confirm ? { confirm: a.confirm } : {}), ...(conv60 ? { conv60 } : {}), ...(a.traceId ? { traceId: a.traceId } : {}), ...(a.s62 ? { s62: a.s62 } : {}) } }; // prompt 60: valgknapper / bekreftelse · prompt 61: traceId (tommel) · prompt 62: oppgavekortet
  if (a.chatId && !isLocalId(a.chatId)) {
    // Serveren lagret spørsmålet og svaret i samtalen. Kortet lagres også lokalt, i tilfelle serveren ikke tar vare på det.
    toolsAdd(String(a.chatId), [userMsg, am]);
    if (isLocalId(C.cur)) { toolsRekey(C.cur, String(a.chatId)); }
    C.cur = String(a.chatId); await loadChat(C.cur, false);
    if (!(C.chat?.messages ?? []).some((m) => m.role === 'assistant' && m.content === am.content)) C.chat = { ...shown, id: C.cur, messages: [...shown.messages, am] };
    refreshList();
  } else {
    const id = C.cur || `g:${Date.now().toString(36)}`;
    toolsAdd(id, [userMsg, am]);
    C.cur = id; C.chat = { ...shown, id, ...(isLocalId(id) ? { local: true } : {}), messages: [...shown.messages, am] };
  }
  bindConv60(C.cur, conv60); // prompt 60: chat-id-en (lokal eller fra serveren) beholder samtale-id-en som ble brukt
  writeLocal(); paint(); toBottom();
  return true;
}

/** Prompt 59: svaret fra Glimt-motoren (done i strømmen) i samme form som /api/assist ga, med kortet når det finnes. */
const SRC59 = { calendar: 'Kalender', tasks: 'Huskeliste', finance: 'Finans', weather: 'Vær', ruter: 'Avganger', family: 'Familie', media: 'Media', study: 'Studie' };
const WD59 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
function fromAgent59(g, q) {
  const raw = g.raw ?? {};
  // Gamle svar (vær, avganger, pakker …) kommer med sitt eget kort i legacyAnswer.
  if (raw.legacyAnswer && typeof raw.legacyAnswer === 'object') {
    const L = normAnswer(raw.legacyAnswer);
    return { ...L, text: agentText(g) || L.text, ms: raw.ms ?? L.ms, cached: g.cached, notice: cacheNote59(g) || L.notice, choices: g.choices, confirm: g.confirm, traceId: g.traceId ?? raw.traceId ?? null, s62: g.confirm ? preview62(g) : null };
  }
  const a0 = g.actions[0] ?? null, tool = a0?.tool ?? null;
  if (isPlain(g) && ['chat', 'ask', ''].includes(g.intent)) return { text: agentText(g), intent: 'chat' };
  let card = null;
  const evs = g.results.filter((x) => x.kind === 'event');
  const c70 = cal70Of(g); // prompt 70: kort A (lagt i kalenderen, bytt kalender i kortet, Angre)
  if (c70) card = { k: 'cal70', ...c70 };
  else if (evs.length || (tool?.startsWith('calendar.') && !g.ask)) { // prompt 70: «Hvilken dag?» viser ikke dagens kalender
    const d = (typeof a0?.result?.from === 'string' ? a0.result.from : null) ?? evs[0]?.date ?? new Date().toISOString().slice(0, 10);
    const x = new Date(`${d}T00:00:00Z`);
    card = { k: 'calendar', date: d, wd: WD59[x.getUTCDay()], n: x.getUTCDate(), t: x.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/^./, (c) => c.toUpperCase()), sub: `${evs.length} ${evs.length === 1 ? 'hendelse' : 'hendelser'}`,
      items: evs.slice(0, 8).map((e) => ({ id: e.id, time: e.allDay ? 'Hele' : e.time, title: e.title, color: e.color ?? null, place: e.place ?? null, date: e.date })) };
  } else if (tool?.startsWith('tasks.')) {
    const ts = g.results.filter((x) => x.kind === 'task');
    card = { k: 'tasks', count: ts.length, items: ts.map((x) => ({ id: x.id, title: x.title, due: x.date, done: !!x.done })) };
  }
  const src = SRC59[g.module] ?? 'Glimt';
  return { text: agentText(g) || 'Ferdig.', intent: tool ?? g.intent ?? 'agent', tool: src, source: src, card, ms: raw.ms ?? 0, cached: g.cached, notice: cacheNote59(g), q, choices: g.choices, confirm: g.confirm, traceId: g.traceId ?? raw.traceId ?? null, s62: g.confirm ? preview62(g) : null };
}

async function readSse(res, ctl) {
  const rd = res.body.getReader(), dec = new TextDecoder(), gen = sendGen, model0 = C.busy?.model;
  let buf = '', ev = 'message', chatId = C.cur, done = null, raf = 0, stopped = null;
  const flush = () => { raf = 0; paintStream(); };
  try {
    for (;;) {
      const { value, done: end } = await rd.read();
      if (end) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
        if (line.startsWith('event:')) { ev = line.slice(6).trim(); continue; }
        if (!line.startsWith('data:')) { if (!line) ev = 'message'; continue; }
        let d; try { d = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev === 'meta' && C.busy && d.readWith) C.busy.readWith = d.readWith; // prompt 50: «Lest med …»
        if (ev === 'meta') { if (C.busy && (d.auto?.model || d.picked)) { C.busy.picked = d.auto?.model ?? d.picked; C.busy.pickLabel = d.auto?.label ?? ''; paintStream(); } if (C.data && d.chatId) dataSave41(d.chatId, C.data); chatId = d.chatId ?? chatId; if (!C.cur) { if (C.pendingLocal && chatId) { toolsRekey(C.pendingLocal, chatId); C.pendingLocal = null; } C.cur = chatId; C.busy.chatId = chatId; if (C.chat) { C.chat.id = chatId; C.chat.title = d.title ?? C.chat.title; } writeLocal(); refreshList(); } }
        else if (ev === 'facts') { C.busy.facts = d.facts ?? []; if (Array.isArray(d.used)) C.busy.reading = [...new Set([...(C.busy.reading ?? []), ...d.used])]; paintStream(); } // prompt 41: faktakort mens svaret kommer
        else if (ev === 'thinking' && C.busy) { if (!C.busy.think) { C.busy.think = []; C.busy.thT0 = Date.now() - (+d.s || 0) * 1000; thinkTick52(); } if (d.step) C.busy.think = [...C.busy.think, String(d.step)]; C.busy.thSrc = d.source ?? C.busy.thSrc; paintStream(); } // prompt 52
        else if (ev === 'thinking_done' && C.busy) { C.busy.thS = d.thS ?? (Date.now() - (C.busy.thT0 ?? Date.now())) / 1000; C.busy.thOpen = false; paintStream(); }
        else if (ev === 'delta') { if (C.busy.think?.length && C.busy.thS == null) { C.busy.thS = (Date.now() - (C.busy.thT0 ?? Date.now())) / 1000; C.busy.thOpen = false; } C.busy.text += d.text ?? ''; if (!raf) raf = requestAnimationFrame(flush); }
        else if (ev === 'done') { done = d; if (C.busy && Array.isArray(d?.think)) { C.busy.think = d.think; C.busy.thS = d.thS ?? C.busy.thS; C.busy.thSrc = d.thinkSource ?? C.busy.thSrc; } if (d?.webSearchOff) C.webAsk46 = { chatId: d.chatId ?? chatId, ...d.webSearchOff }; }
        else if (ev === 'websearch_off') C.webAsk46 = { chatId, ...d }; // prompt 46: Nettsøk er av – tilby «Søk denne gangen»
        else if (ev === 'error') { C.busy.error = d.error || 'Ukjent feil'; paintStream(); }
      }
    }
  } catch (e) { if (e.name !== 'AbortError') C.busy && (C.busy.error = e.message); else stopped = C.busy?.text ?? ''; }
  const err = C.busy?.error, th52 = C.busy?.think?.length ? { think: C.busy.think, thS: Math.round((C.busy.thS ?? (Date.now() - (C.busy.thT0 ?? Date.now())) / 1000) * 10) / 10, thinkSource: C.busy.thSrc } : null;
  C.busy = null;
  // Prompt 40: en ny samtale er startet mens denne strømmet (✦ AI i søket): ikke ta over den nye samtalen.
  if (gen !== sendGen) { refreshList(); return; }
  if (chatId) { C.cur = chatId; await loadChat(chatId, false); }
  // Prompt 52: eldre server uten think på lagrede meldinger: legg tankegangen fra strømmen på siste svar (bare i visningen).
  { const la = C.chat?.messages?.at(-1); if (th52 && la?.role === 'assistant' && !la.think && !la.meta?.think) Object.assign(la, th52); }
  // Stoppet: det som er kommet lagres (merket «Stoppet») hvis serveren ikke har tatt vare på det.
  if (stopped && C.chat && C.chat.messages?.at(-1)?.role !== 'assistant') C.chat.messages = [...C.chat.messages, { role: 'assistant', content: stopped, meta: { stopped: true, model: model0 } }];
  if (err && C.chat && !(C.chat.messages ?? []).some((m) => m.role === 'assistant' && m === C.chat.messages.at(-1))) C.chat.messages = [...C.chat.messages, { role: 'assistant', content: '', meta: { error: err, model: curModelId() } }];
  void done; void ctl;
  paint(); toBottom(); refreshList();
}
function stop() { C.busy?.ctl.abort(); }
/** Prompt 52: sekundene i «Tenker … 2,1 s» teller opp mens modellen tenker. */
function thinkTick52() {
  const t = setInterval(() => {
    const b = C.busy;
    if (!b || b.thS != null || b.text) { clearInterval(t); return; }
    const el = host()?.querySelector('[data-ch-stream] [data-ch-ths]');
    if (el) el.textContent = `${((Date.now() - b.thT0) / 1000).toFixed(1).replace('.', ',')} s`;
  }, 100);
}

/* ---------------- Vedlegg ---------------- */

// Prompt 50: alle vedlegg (også bilder) lastes opp med en gang med fremdrift; bildene får miniatyr på serveren.
// Dra og slipp, lim inn og «+» bruker samme vei. Maks 10 filer, maks 20 MB hver.
async function addFiles(kind, files) {
  const jobs = [];
  if (kind !== 'kbup') C.sheet = null;
  for (const f of files) {
    if (kind !== 'kbup' && C.att.length >= MAX_FILES50) { toast(`Maks ${MAX_FILES50} vedlegg per melding`); break; }
    const why = rejectReason50(f);
    if (why) { toast(why); continue; }
    const img = kind !== 'kbup' && isImg50(f);
    if (kind === 'img' && !img) { toast(`${f.name} er ikke et bilde`); continue; }
    const a = { kind: kind === 'kbup' ? 'doc' : img ? 'img' : 'file', name: f.name || 'Bilde', up: true, pct: 2, ...(img && !/heic|heif/i.test(f.type) ? { preview: URL.createObjectURL(f) } : {}) };
    C.att = [...C.att, a];
    if (img) thumbDataUrl52(f).then((u) => { if (u) a.th52 = u; }); // prompt 52: attTh
    let raf = 0;
    jobs.push(upload50(f, (p) => { a.pct = p; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const el = host()?.querySelectorAll('.ch-att50 .p i')[C.att.indexOf(a)]; if (el) el.style.width = `${Math.round(p)}%`; }); })
      .then((r) => { a.id = r.id; a.thumb = r.thumb ?? null; a.url = r.url ?? null; a.up = false; C.att = [...C.att]; if (kind === 'kbup') C.kb = null; })
      .catch((e) => { C.att = C.att.filter((x) => x !== a); toast(e.status === 413 ? 'Filen er for stor (maks 20 MB)' : `Kunne ikke laste opp ${f.name}: ${e.message}`); })
      .finally(() => paint()));
  }
  paint();
  await Promise.all(jobs);
  if (kind === 'kbup') await loadKb();
  paint();
}
/** Lysboksen for bildene i melding nr. i (av meldingene uten system). */
function openLb(key) {
  const [i, j] = String(key).split(':').map(Number);
  const m = (C.chat?.messages ?? []).filter((x) => x.role !== 'system')[i];
  if (m) lightbox50(imagesOf50(m), j || 0);
}
/** «Legg i Finans ›» for kvitteringen i svaret. */
async function toFinans(key) {
  const i = +String(key).split(':').pop(), m = (C.chat?.messages ?? []).filter((x) => x.role !== 'system')[i], a = m?.meta?.receipt?.action;
  if (!a?.url) return;
  C.fin50 = { ...(C.fin50 ?? {}), [key]: 'busy' }; paint();
  try {
    const r = await fetch(a.url, { method: a.method || 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Feil ${r.status}`);
    C.fin50[key] = 'ok'; toast('Kvitteringen er lagt i Finans · Til godkjenning');
  } catch (e) { delete C.fin50[key]; toast(`Kunne ikke legge i Finans: ${e.message}`); }
  paint();
}
async function loadKb() {
  if (C.kbLoading) return;
  C.kbLoading = true;
  try { const r = await call('/knowledge'); C.kb = Array.isArray(r) ? r : r.items ?? []; } catch { C.kb = []; }
  C.kbLoading = false;
  paint();
}

/* ---------------- Tale ---------------- */

function speak(i) {
  // Prompt 57: Glimt-stemmen (tts.voice) via POST /api/tts; 503/404/feil → nettleserens speechSynthesis som før.
  const key = `${C.cur}:${i}`;
  if (C.speak === key) { stop57(); C.speak = ''; C.speakAi = false; paint(); return; }
  const m = (C.chat?.messages ?? []).filter((x) => x.role !== 'system')[i];
  const txt = String(m?.content ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/\*\*|`|#|\[(.*?)\]\(.*?\)/g, '$1');
  C.speak = key; C.speakAi = false; paint();
  speak57(txt, { purpose: 'chat', lang: lang() === 'en' ? 'en' : 'no', onState: (state, x) => {
    if (C.speak !== key) return;
    if (state === 'idle') { C.speak = ''; C.speakAi = false; paint(); if (x?.needTap) toast('Nettleseren blokkerte lyden. Trykk Les høyt igjen.'); return; }
    const ai = state === 'ai';
    if (ai !== !!C.speakAi) { C.speakAi = ai; paint(); }
  } });
}
async function mic() {
  if (C.rec) { try { recog?.stop(); } catch { /* */ } try { mediaRec?.stop(); } catch { /* */ } C.rec = false; paint(); return; }
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (R) {
    try {
      const r = recog = new R();
      r.lang = lang() === 'en' ? 'en-GB' : 'nb-NO'; r.interimResults = true;
      const base = C.inp ? `${C.inp} ` : '';
      r.onresult = (e) => { C.inp = base + [...e.results].map((x) => x[0].transcript).join(''); };
      r.onend = () => { C.rec = false; paint(); host()?.querySelector('[data-ch-in]')?.focus(); };
      r.onerror = (e) => { C.rec = false; if (e.error !== 'aborted' && e.error !== 'no-speech') toast(`Talegjenkjenning: ${e.error}`); paint(); };
      r.start(); C.rec = true; paint(); return;
    } catch { /* faller tilbake til opptak */ }
  }
  // Uten Web Speech API: ta opp og send til /api/chat/transcribe (Whisper i Open WebUI).
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Nettleseren støtter ikke mikrofon'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), chunks = [];
    const mr = mediaRec = new MediaRecorder(stream);
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((tk) => tk.stop());
      C.rec = false; paint();
      try {
        const fd = new FormData(); fd.append('file', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'tale.webm');
        const r = await call('/transcribe', { method: 'POST', body: fd });
        if (r.text) { C.inp = `${C.inp ? `${C.inp} ` : ''}${r.text}`; paint(); }
      } catch (e) { toast(e.status === 501 ? 'Tale til tekst krever Open WebUI (Whisper)' : `Tale til tekst: ${e.message}`); }
    };
    mr.start(); C.rec = true; paint();
    setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 30_000);
  } catch (e) { toast(`Mikrofon: ${e.message}`); }
}

/* ---------------- Samtaler og modeller ---------------- */

async function patchChat(id, body2) {
  try {
    const r = await call(`/chats/${encodeURIComponent(id)}`, { method: 'PATCH', json: body2 });
    if (C.chat?.id === id) C.chat = { ...C.chat, ...r, messages: C.chat.messages };
  } catch (e) { toast(e.message); }
  refreshList();
}
function setP(x) {
  if (C.chat?.id) { C.chat.settings = { ...curSet(), ...x }; patchChat(C.chat.id, { settings: x }); } else { C.draftSet = { ...C.draftSet, ...x }; writeLocal(); }
}
function pickModel(id) {
  // Prompt 41: velger du en fast modell i en samtale, gjelder den for den samtalen (nye samtaler starter på Auto).
  if (!C.chat?.id || !C.auto) C.draftModel = id;
  writeLocal();
  if (C.chat?.id) { C.chat.model = id; patchChat(C.chat.id, { model: id }); }
  C.sheet = null; paint();
}
async function pull(name) {
  if (!name || C.pulls[name]) return;
  C.pulls = { ...C.pulls, [name]: { pct: 0 } }; paint();
  try {
    const r = await fetch('/api/chat/models/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Feil ${r.status}`); }
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '', ev = '', err = '';
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('event:')) { ev = line.slice(6).trim(); continue; }
        if (!line.startsWith('data:')) continue;
        let d; try { d = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev === 'progress' && d.total) { C.pulls[name] = { pct: Math.min(100, d.completed / d.total * 100) }; if (C.sheet === 'mods') paint(); }
        if (ev === 'error') err = d.error;
      }
    }
    if (err) throw new Error(err);
    delete C.pulls[name];
    const m = await call('/models'); C.models = m.models ?? C.models;
    toast(`${name} er installert`);
  } catch (e) { C.pulls[name] = { pct: 0, err: e.message }; setTimeout(() => { delete C.pulls[name]; paint(); }, 5000); }
  paint();
}
async function delModel(name) {
  if (C.mdel !== name) { C.mdel = name; paint(); return; }
  C.mdel = '';
  try { await call(`/models/${encodeURIComponent(name)}`, { method: 'DELETE' }); const m = await call('/models'); C.models = m.models ?? C.models; toast(`${name} er slettet`); } catch (e) { toast(e.message); }
  if (C.draftModel === name) C.draftModel = allModels().find((x) => x.installed)?.id ?? '';
  paint();
}
async function menuAct(act, arg) {
  const id = C.menuId;
  if (!id) return;
  if (act === 'pin') { const all = [...C.list.pinned, ...C.list.folders.flatMap((f) => f.chats), ...C.list.chats], x = all.find((c) => c.id === id); C.sheet = null; await patchChat(id, { pinned: !x?.pinned }); return; }
  if (act === 'export') {
    try { const md2 = await call(`/chats/${encodeURIComponent(id)}/export`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md2], { type: 'text/markdown' })); a.download = 'samtale.md'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { toast(e.message); }
    C.sheet = null; paint(); return;
  }
  if (act === 'share') {
    try {
      const r = await call(`/chats/${encodeURIComponent(id)}/share`, { method: 'POST' });
      if (navigator.share) { navigator.share({ url: r.url }).catch(() => {}); } else { await navigator.clipboard?.writeText(r.url).catch(() => {}); toast('Delingslenke kopiert'); }
    } catch (e) { toast(e.message); }
    C.sheet = null; paint(); return;
  }
  if (act === 'folder') { await patchChat(id, { folderId: arg || null }); paint(); return; }
  if (act === 'del') {
    if (!C.delArm) { C.delArm = true; paint(); return; }
    C.delArm = false; C.sheet = null;
    try { await call(`/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (e) { toast(e.message); }
    toolsDrop(id); forgetConv60(chatConv60(id)); // prompt 60: glem samtaletilstanden på serveren også
    if (C.cur === id) { C.cur = null; C.chat = null; writeLocal(); }
    refreshList();
  }
}

/* ---------------- Hendelser ---------------- */

function bind(h) {
  bindCards();
  css50();
  css52();
  // Prompt 50: hele chatområdet tar imot filer (dra og slipp); lim inn bilder i feltet.
  bindDrop50(h, (fs) => { if (C.missing) return; addFiles('drop', fs); });
  if (h.dataset.chBound) return;
  h.dataset.chBound = '1';
  h.addEventListener('paste', (e) => {
    if (!e.target.matches?.('[data-ch-in]')) return;
    const fs = pastedFiles50(e);
    if (fs.length) { e.preventDefault(); addFiles('drop', fs); }
  });
  h.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-ch-in]')) { C.inp = t.value; const rows = Math.min(6, Math.max(1, t.value.split('\n').length)); if (+t.rows !== rows) t.rows = rows; h.querySelector('[data-ch-send]')?.classList.toggle('dim', !t.value.trim()); return; }
    if (t.matches('[data-ch-q]')) { searchChats(t.value); return; }
    if (t.matches('[data-ch-edv]')) { C.edit.v = t.value; return; }
    if (t.matches('[data-ch-temp]')) { h.querySelector('[data-ch-tv]').textContent = String(t.value).replace('.', ','); return; }
    if (t.matches('[data-ch-topp]')) { h.querySelector('[data-ch-pv]').textContent = String(t.value).replace('.', ','); }
  });
  h.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ch-temp]')) setP({ temperature: +t.value });
    else if (t.matches('[data-ch-topp]')) setP({ topP: +t.value });
    else if (t.matches('[data-ch-sys]')) setP({ system: t.value });
    else if (t.matches('[data-ch-file]') && t.files?.length) { const fs = [...t.files]; t.value = ''; addFiles(t.dataset.chFile, fs); }
  });
  h.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-ch-in]') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(e.target.value); return; }
    if (e.target.matches('[data-ch-open]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
  });
  h.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, v = (n) => String(new FormData(f).get(n) ?? '').trim();
    if (f.matches('[data-ch-rename]')) { const t = v('rn'); if (t && C.menuId) { patchChat(C.menuId, { title: t }); if (C.chat?.id === C.menuId) C.chat.title = t; } C.sheet = null; C.rn = ''; paint(); }
    else if (f.matches('[data-ch-newf]')) {
      const n = v('nf'); if (!n) return;
      call('/folders', { method: 'POST', json: { name: n } }).then((r) => patchChat(C.menuId, { folderId: r.id })).catch((x) => toast(x.message));
    } else if (f.matches('[data-ch-pullf]')) { const n = v('pn'); if (n) pull(n); f.reset(); }
  });
  h.addEventListener('click', (e) => {
    const tg = e.target;
    if (tg.matches('.ch-sheet-bg')) { if (C.guard?.fresh) { C.inp = C.guard.text; C.chat = null; } C.sheet = null; C.guard = null; C.delArm = false; paint(); return; }
    if (tg.closest('[data-ch-drawer-close]')) { C.drawer = false; paint(); return; }
    const b = tg.closest('button,[data-ch-open]');
    if (!b || !h.contains(b)) return;
    const d = b.dataset;
    // Prompt 70: knappene på lastesiden og «Vis eldre meldinger».
    if ('l70Retry' in d) { load70(); return; }
    if ('l70Local' in d) { useLocal70(); return; }
    if ('chOlder' in d) { const sc = h.querySelector('[data-ch-sc]'), fromEnd = sc ? sc.scrollHeight - sc.scrollTop : 0; C.show70 += 30; paint(); const s2 = h.querySelector('[data-ch-sc]'); if (s2) s2.scrollTop = s2.scrollHeight - fromEnd; return; }
    if ('chClose' in d) { if (C.guard?.fresh) { C.inp = C.guard.text; C.chat = null; } C.sheet = null; C.guard = null; C.delArm = false; paint(); return; }
    if (d.chMenu) { e.stopPropagation(); C.menuId = d.chMenu; C.rn = ''; C.delArm = false; C.sheet = 'menu'; paint(); return; }
    if (d.chOpen) { C.drawer = false; C.edit = null; loadChat(d.chOpen); return; }
    if ('chNew' in d) return newChat();
    if ('chFsclose' in d) return closeChat();
    if ('chDrawer' in d) { C.drawer = true; paint(); return; }
    if (d.chFold) { const f = C.list.folders.find((x) => x.id === d.chFold), open = !(C.open[d.chFold] ?? f?.open !== false); C.open = { ...C.open, [d.chFold]: open }; writeLocal(); call(`/folders/${encodeURIComponent(d.chFold)}`, { method: 'PATCH', json: { open } }).catch(() => {}); paintSide(); return; }
    // Prompt 34: Modeller åpner AI-kontroll (fanen Modeller); det gamle Modeller-arket brukes ikke lenger.
    if (d.chSheet === 'mods' || 'chAictl' in d) { C.sheet = null; C.drawer = false; paint(); openAiCtl(d.chSheet === 'mods' ? 'mod' : 'rt'); return; }
    if (d.chSheet) { C.sheet = d.chSheet; C.drawer = false; if (d.chSheet === 'kb') loadKb(); paint(); return; }
    if ('chTheme' in d) { C.theme = C.theme === 'noytral' ? 'papir' : 'noytral'; writeLocal(); call('/settings', { method: 'PATCH', json: { chat_theme: C.theme } }).catch(() => {}); paint(); return; }
    if (d.chTh) { C.theme = d.chTh; writeLocal(); call('/settings', { method: 'PATCH', json: { chat_theme: C.theme } }).catch(() => {}); paint(); return; }
    if (d.chModel) return pickModel(d.chModel);
    if (d.chPer) { setP({ persona: d.chPer }); paint(); return; }
    if (d.chCtx) { setP({ numCtx: +d.chCtx }); paint(); return; }
    if (d.chSugg) {
      const [t, , x] = SUGG[+d.chSugg];
      if (x.data && C.set.chat_my_data) C.data = true;
      if (x.kb) { C.sheet = 'kb'; C.inp = t; loadKb(); paint(); return; }
      send(t); return;
    }
    if ('chSend' in d) { send(C.inp); return; }
    if (d.chCh60) { // prompt 60: valgknapp → item.text + choice {setId, id} i samme samtale
      const [mi, j] = d.chCh60.split(':').map(Number), m = (C.chat?.messages ?? []).filter((x) => x.role !== 'system')[mi];
      const pick = choicePick60(m?.meta?.choices, m?.meta?.choices?.items?.[j]);
      if (pick && !C.busy) send(pick.text, { choice60: pick.choice ?? { text: pick.text } });
      return;
    }
    if (d.chCf60) { const [k, mi] = d.chCf60.split(':'); confirm60(+mi, k === 'yes'); return; }
    if ('chStop' in d) { stop(); return; }
    if ('chWeb' in d) { C.web = !C.web; writeLocal(); paint(); return; }
    if ('chData' in d) { if (!C.set.chat_my_data) { toast('Slått av i Innstillinger → AI og tolkning'); return; } C.data = !C.data; dataSave41(C.cur, C.data); writeLocal(); paint(); return; }
    if ('chMic' in d) { mic(); return; }
    if (d.chRmatt) { const x = C.att[+d.chRmatt]; if (x?.preview) setTimeout(() => URL.revokeObjectURL(x.preview), 60_000); C.att = C.att.filter((_, i) => i !== +d.chRmatt); paint(); return; }
    if (d.chLb) { openLb(d.chLb); return; } // prompt 50: lysboks
    if (d.chThk) { if (d.chThk === 'live') { if (C.busy) { C.busy.thOpen = !(C.busy.thOpen ?? (!C.busy.text && C.busy.thS == null)); paintStream(); } } else { C.thOpen = { ...(C.thOpen ?? {}), [d.chThk]: !C.thOpen?.[d.chThk] }; paint(); } return; } // prompt 52: tankegang
    if (d.chFin50) { toFinans(d.chFin50); return; }
    if (d.chKbsel) { const doc = C.kb?.find((x) => x.id === d.chKbsel); if (!doc) return; C.att = C.att.some((a) => a.id === doc.id) ? C.att.filter((a) => a.id !== doc.id) : [...C.att, { kind: 'doc', id: doc.id, name: doc.name }]; paint(); return; }
    if (d.chCopy) {
      const m = (C.chat?.messages ?? []).filter((x) => x.role !== 'system')[+d.chCopy];
      navigator.clipboard?.writeText(m?.content ?? '').catch(() => {});
      C.copied = `${C.cur}:${d.chCopy}`; paint(); clearTimeout(copyT); copyT = setTimeout(() => { C.copied = ''; paint(); }, 1400); return;
    }
    if (d.chSpeak) { speak(+d.chSpeak); return; }
    if (d.chEdit) { const m = (C.chat?.messages ?? []).filter((x) => x.role !== 'system')[+d.chEdit]; C.edit = { i: +d.chEdit, v: m?.content ?? '' }; paint(); host()?.querySelector('[data-ch-edv]')?.focus(); return; }
    if ('chEdcancel' in d) { C.edit = null; paint(); return; }
    if ('chEdsave' in d) {
      const { i, v } = C.edit, t = v.trim(); if (!t) return;
      const msgs = (C.chat?.messages ?? []).filter((x) => x.role !== 'system'), hist = [...msgs.slice(0, i), { ...msgs[i], content: t }];
      send(t, { editFrom: i, history: hist }); return;
    }
    // Prompt 46 (claude-code-chat-nettsok-av.md): «Søk denne gangen» – samme spørsmål på nytt med nettsøk på for ett svar.
    if (d.chWeb46) {
      const i = +d.chWeb46, msgs = (C.chat?.messages ?? []).filter((x) => x.role !== 'system'), hist = msgs.slice(0, i);
      const lastU = hist.at(-1); if (!lastU || lastU.role !== 'user') return;
      C.webAsk46 = null;
      send(lastU.content, { editFrom: i - 1, history: hist, webOnce: true }); return;
    }
    if (d.chRegen) {
      const i = +d.chRegen, msgs = (C.chat?.messages ?? []).filter((x) => x.role !== 'system'), hist = msgs.slice(0, i);
      const lastU = hist.at(-1); if (!lastU || lastU.role !== 'user') return;
      send(lastU.content, { editFrom: i - 1, history: hist }); return;
    }
    if ('chRem' in d) { C.rem = !C.rem; paint(); return; }
    if (d.chG) {
      const g = C.guard; if (!g) return;
      C.inp = g.text;
      if (g.fresh) C.chat = null; // spørsmålet sendes nå på ordentlig (ikke to ganger)
      if (d.chG === 'send') send(g.text, { ...g.opt, confirm: true, remember: C.rem });
      else if (d.chG === 'nodata') send(g.text, { ...g.opt, confirm: true, withoutData: true, remember: C.rem });
      else { const loc = allModels().find((m) => m.kind === 'lokal' && m.installed); if (loc) { pickModel(loc.id); C.guard = null; send(g.text, g.opt); } }
      return;
    }
    if ('chPin' in d) return menuAct('pin');
    if ('chExport' in d) return menuAct('export');
    if ('chShare' in d) return menuAct('share');
    if (d.chMvf !== undefined) return menuAct('folder', d.chMvf);
    if ('chDel' in d) return menuAct('del');
    if (d.chPull) return pull(d.chPull);
    if (d.chMdel) return delModel(d.chMdel);
  });
}

/** Åpner Chat og sender teksten som ny samtale (✦ AI i Google-søket på Dashboard). */
// Prompt 32 (claude-code-sok-fullfor-forst.md): søkefeltet ga opp etter hs_timeout_s og flyttet jobben til en Chat-tråd
// (POST /api/assist/:id/handoff → {chatId}). Tråden åpnes, og svaret hentes når serverjobben er ferdig.
let pendingChat = null;
export function openChatId(id) {
  if (!id) return openChat('');
  pendingChat = String(id);
  if (location.hash !== '#/chat') location.hash = '#/chat';
  else if (C.booted) usePendingChat();
}
function usePendingChat() { const id = pendingChat; pendingChat = null; if (!id) return; C.cur = id; C.edit = null; loadChat(id).then(() => watchHandoff(id)); }
function watchHandoff(id, n = 0) {
  if (n > 45 || C.cur !== id) return;
  const last = (C.chat?.id === id ? C.chat.messages : null)?.filter((m) => m.role !== 'system').at(-1);
  if (n > 0 && last && last.role === 'assistant') return;
  setTimeout(async () => {
    if (C.cur !== id || !host()) return;
    const before = C.chat?.messages?.length ?? 0;
    await loadChat(id, false);
    if ((C.chat?.messages?.length ?? 0) !== before) paint();
    watchHandoff(id, n + 1);
  }, 2000);
}
/* Prompt 40 (claude-code-sok-ai-til-chat.md): «✦ AI» med tekst åpner selve samtalen med spørsmålet.
   Rekkefølge: stopp pågående svar (lagres som «Stoppet») → opprett ny samtale → send → naviger. Ingen timer imellom. */
function freshChat() { sendGen++; C.cur = null; C.chat = null; C.inp = ''; C.att = []; C.edit = null; C.drawer = false; C.sheet = null; C.guard = null; fresh41(); writeLocal(); }
export async function openChat(prompt = '') {
  const p = String(prompt ?? '').trim();
  const go = () => { if (location.hash !== '#/chat') location.hash = '#/chat'; };
  if (!p) { go(); return; }
  if (C.busy) { const f = flight; stop(); try { await f; } catch { /* avbrutt */ } }
  if (!C.booted || !C.models) { pendingPrompt = p; go(); if (C.booted && host()) paint(); return; }
  pendingPrompt = null;
  freshChat();
  send(p); // viser spørsmålet med en gang (optimistisk) og starter svaret
  go();
  if (host()) paint();
}

export function render() {
  setTimeout(() => {
    const h = host();
    if (!h) return;
    bind(h);
    applyChFull();
    if (!C.booted) boot();
    else if (pendingChat) { usePendingChat(); refreshList(); }
    else { if (pendingPrompt && C.models) { const p = pendingPrompt; pendingPrompt = null; freshChat(); send(p); } paint(); refreshList(); }
    void locale;
  });
  document.body.classList.add('chat-fs');
  // Prompt 70: lastesiden (skjelett + Glimt-orb + steg) til modellene er klare; samme markup som det statiske skjelettet i chat70-boot.js.
  return `<div id="chat" class="ch ch-fs ${C.theme === 'noytral' ? 'noytral' : 'papir'}"${C.ready70 ? '' : ' aria-busy="true"'}>${C.ready70 ? body() : loaderHtml70({ wide: !isMobile(), cache: cacheRead70() })}</div>`;
}
let wasMob = isMobile();
window.addEventListener('resize', () => { if (host() && isMobile() !== wasMob) { wasMob = isMobile(); C.drawer = false; applyChFull(); paint(); } });
// Fullskjerm-klassen på <body> hører bare til Chat-siden.
window.addEventListener('hashchange', () => setTimeout(() => { if (!host()) document.body.classList.remove('chat-fs'); }));
// Esc lukker ark og skuff (uansett hvor fokus er).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && host() && !(C.sheet || C.drawer || C.edit) && !document.querySelector('#settings:not([hidden])')) {
    if (e.target?.matches?.('input,textarea') && e.target.value) return;
    e.preventDefault(); closeChat(); return;
  }
  if (e.key !== 'Escape' || !host() || !(C.sheet || C.drawer || C.edit)) return;
  if (e.target?.closest?.('[data-sf]') && e.target.value) return; // søkefeltet tømmes først
  e.preventDefault();
  if (C.sheet || C.drawer) { if (C.guard?.fresh) { C.inp = C.guard.text; C.chat = null; } C.sheet = null; C.drawer = false; C.guard = null; C.delArm = false; } else C.edit = null;
  paint();
});

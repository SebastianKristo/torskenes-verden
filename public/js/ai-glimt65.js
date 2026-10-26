// Prompt 65 (prompt 50b, «samle innstillingene»): det som før lå som løse grupper under AI-kontrollen i Innstillinger → AI
// (settings-ai.js: «Chat, Glimt og personvern», «Glimt husker», entitetsregister, «Glimt lærer»), nå tegnet med AI-sidens
// rad-komponent der det hører hjemme:
//   - Innstillinger → Glimt (ai-control only='glimt'): «Send til Chat etter» og Glimt husker (+ forslag/motstrid fra memory63,
//     entitetsregisteret fra entities60 og «Glimt lærer» fra recipes61 – modulene fyller plassene sine selv).
//   - AI → Oppgaver → Regler: «La Chat lese mine data», «Spør før sky-modeller får data», standardmodell i Chat og AI-logg.
//   - AI → Kvitteringer → Tolking/Logoer: «Les kvitteringer lokalt», «Finn logo med Gemini», «Sjekk logoen før den lagres».
// Samme API-er og samme lagrede felt som før (GET/PATCH /api/chat/settings, GET /api/chat/models, GET/PATCH /finans/api/ai-privacy,
// GET /finans/api/ai-audit, /api/glimt/memory, hs_timeout_s i /api/me/layout). Ingen innstilling finnes to steder.
// Modulen tegner ikke selv: ai-control.js kaller funksjonene under med sine hjelpere (ui) og tegner på nytt ved 'ac:redraw'.
import { api } from './util.js';
import { LEARN_TYPES, memoryLine, loadMemory, addMemory, deleteMemory, applyMemory } from './glimt-memory.js';
import { setHsTimeout } from './extras.js';
import './entities60.js'; // fyller [data-ent60]
import './recipes61.js'; // fyller [data-learn61]
import './memory63.js'; // fyller [data-mem63] øverst i Glimt husker

export const HS65 = [5, 8, 15, 30];
const A = { loaded: false, loading: null, chat: null, chatErr: '', models: null, auto: null, priv: null, privErr: '', audit: null, auditErr: '', mem: null, memErr: '', memAdd: false, memMsg: '', memApply: null, msg: '', hs: 8 };
export const state65 = A;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const redraw = () => document.dispatchEvent(new Event('ac:redraw'));
const fin = async (path, opts = {}) => {
  const r = await fetch('/finans/api' + path, { method: opts.method ?? 'GET', credentials: 'same-origin', headers: opts.json ? { 'Content-Type': 'application/json' } : {}, body: opts.json ? JSON.stringify(opts.json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || `Feil ${r.status}`), { status: r.status });
  return d;
};

/** Laster alt (én gang, eller på nytt med force). Kalles av ai-control og av settings-ai.js (loadAi). */
export function load65(force = false) {
  if (A.loading) return A.loading;
  if (A.loaded && !force) return Promise.resolve();
  A.loading = (async () => {
    const [c, m, p, a, g, l, t] = await Promise.allSettled([api('/chat/settings'), api('/chat/models'), fin('/ai-privacy'), fin('/ai-audit?limit=50'), api('/glimt/memory'), api('/me/layout'), api('/config')]);
    // «La modellen tenke» (ai_think, personlig gruppe «Lokal AI» i /api/config) – før under Integrasjoner, nå i AI → Oppgaver → Regler.
    const tf = t.status === 'fulfilled' && Array.isArray(t.value) ? t.value.flatMap((g) => g.fields ?? []).find((f) => f.key === 'ai_think') : null;
    A.think = tf ? /^(1|true|on|ja)$/i.test(String(tf.value ?? '0')) : null;
    const hv = l.status === 'fulfilled' ? +(l.value?.hs_timeout_s ?? 8) : 8; A.hs = HS65.includes(hv) ? hv : 8;
    A.mem = g.status === 'fulfilled' ? g.value.items ?? [] : null; A.memErr = g.status === 'rejected' ? g.reason.message : '';
    A.chat = c.status === 'fulfilled' ? c.value : null; A.chatErr = c.status === 'rejected' ? c.reason.message : '';
    A.models = m.status === 'fulfilled' ? m.value.models ?? [] : [];
    A.auto = m.status === 'fulfilled' && m.value.auto?.id ? m.value.auto : null; // prompt 41: «✦ Auto»
    A.priv = p.status === 'fulfilled' ? p.value : null; A.privErr = p.status === 'rejected' ? p.reason.message : '';
    A.audit = a.status === 'fulfilled' ? (Array.isArray(a.value) ? a.value : a.value.items ?? []) : null; A.auditErr = a.status === 'rejected' ? a.reason.message : '';
    A.loaded = true;
  })().finally(() => { A.loading = null; redraw(); });
  return A.loading;
}
// Prompt 63: forslag godkjent / ubrukte fakta slettet → lista i Glimt husker lastes på nytt.
if (typeof document !== 'undefined') document.addEventListener('mem63:changed', () => { api('/glimt/memory').then((d) => { A.mem = d.items ?? []; redraw(); }).catch(() => {}); });

const when = (t) => { const d = new Date(t); return `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`; };
function sent(f) {
  if (!f || typeof f !== 'object') return '';
  return Object.entries(f).filter(([, v]) => v !== false && v !== 0 && v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v === true ? 'ja' : v}`).join(' · ');
}
const swb = (ui, on, attrs, label, dis = false) => `<button type="button" class="ac-swb" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${attrs}${dis ? ' disabled' : ''}>${ui.sw(!!on)}</button>`;

/* ---------------- AI → Oppgaver → Regler ---------------- */

/** Radene for Chat (brytere, standardmodell, AI-logg). ui = hjelperne fra ai-control (row, sw, btn, sel …). */
export function chatRows65(ui) {
  if (!A.loaded) return [ui.row({ ic: 'chat', t: 'Chat', s: 'Laster …' })];
  const ch = A.chat, out = [];
  if (ch) {
    const on = ch.chat_my_data !== false; // prompt 41: mangler = på
    out.push(ui.row({ ic: 'lock', t: 'La Chat lese mine data', s: 'Finans, Kalender og Gjøremål sendes med når «Mine data» er på i samtalen. Lokale modeller får dataene uten spørsmål.', right: swb(ui, on, 'data-g65-tog="chat_my_data"', 'La Chat lese mine data') }));
    out.push(ui.row({ ic: 'shield', t: 'Spør før sky-modeller får data', s: 'Gemini og Groq må godkjennes per samtale', right: swb(ui, !!ch.chat_ask_cloud, 'data-g65-tog="chat_ask_cloud"', 'Spør før sky-modeller får data') }));
    const opts = (A.models ?? []).filter((m) => m.installed);
    const L = [...(A.auto ? [[A.auto.id, `${A.auto.label || '✦ Auto'} · Glimt velger`]] : [['', 'Automatisk (siste brukte)']]), ...opts.map((m) => [m.id, m.kind === 'sky' ? `${m.name} · sky` : `${m.id} · lokal`])];
    const cur = ch.chat_default_model || (A.auto ? A.auto.id : '');
    // chat_theme (før også under Integrasjoner → Chat): tema i Chat, per bruker.
    const th = /^n/i.test(String(ch.chat_theme ?? 'papir')) ? 'noytral' : 'papir';
    out.push(ui.row({ ic: 'chat', t: 'Tema i Chat', s: 'Papir eller nøytral (mørk) – samme valg som i Chat', right: ui.seg([['papir', 'Papir'], ['noytral', 'Nøytral']], th, (v) => `data-g65-theme="${v}"`, 'Tema i Chat') }));
    out.push(ui.row({ ic: 'chip', t: 'Standardmodell i nye samtaler', s: 'Ditt eget valg i Chat. Serverens modell per oppgave står i tabellen over.', right: ui.sel(L, cur, 'data-g65-def aria-label="Standardmodell i Chat"') }));
  } else out.push(ui.row({ ic: 'chat', dot: 'off', t: 'Chat er ikke tilgjengelig', s: A.chatErr ? `Serveren svarte: ${A.chatErr}` : 'Oppdater serveren' }));
  if (A.think != null) out.push(ui.row({ ic: 'brain', t: 'La modellen tenke før den svarer', s: 'Lokal AI i korte oppgaver (Glimt, rask time, logoer, oppsummeringer). Tregere, men noen ganger smartere. Gjelder bare deg.', right: swb(ui, A.think, 'data-g65-think', 'La modellen tenke før den svarer') }));
  if (A.priv || A.audit) {
    const L = A.audit ?? [];
    out.push(ui.row({ ic: 'list', t: 'AI-logg', s: A.audit ? `${L.length} ${L.length === 1 ? 'oppføring' : 'oppføringer'} · hva som er sendt til sky-motorer (bare dine)` : A.auditErr || 'Ikke tilgjengelig', x: 'g65.log',
      panel: () => (L.length ? L.map((x) => ui.row({ ic: 'cloud', t: `${x.engineName ?? x.engine} · ${x.purposeName ?? x.purpose}`, s: sent(x.fieldsSent), right: `<span class="ac-v">${esc(when(x.at ?? x.ts))}</span>` })).join('') : '<p class="ac-note">Ingenting er sendt til sky-motorer ennå.</p>') }));
  }
  if (A.msg) out.push(`<p class="ac-note" role="status">${esc(A.msg)}</p>`);
  return out;
}

/* ---------------- AI → Kvitteringer → Tolking og Logoer ---------------- */

export function logoRows65(ui) {
  const pv = A.priv;
  if (!A.loaded) return { tolk: [ui.row({ ic: 'receipt', t: 'Personvern', s: 'Laster …' })], logo: [] };
  if (!pv) { const r = ui.row({ ic: 'shield', dot: 'off', t: 'Personvern og logoer er ikke tilgjengelig', s: A.privErr ? `Serveren svarte: ${A.privErr}` : 'Oppdater serveren' }); return { tolk: [r], logo: [] }; }
  return {
    tolk: [ui.row({ ic: 'home', t: 'Les kvitteringer lokalt', s: 'Ollama på hjemmeserveren leser hele kvitteringen. Ingenting sendes ut', right: swb(ui, !!pv.logo_local_receipts, 'data-g65-ptog="logo_local_receipts"', 'Les kvitteringer lokalt') })],
    logo: [ui.row({ ic: 'spark', t: 'Finn logo med Gemini', s: 'Gemini får bare butikknavnet, f.eks. «Blomsterlandet»', right: swb(ui, !!pv.logo_gemini, 'data-g65-ptog="logo_gemini"', 'Finn logo med Gemini') }),
      ui.row({ ic: 'check', t: 'Sjekk logoen før den lagres', s: 'Domenet må svare, og bildet må være et ekte bilde', right: swb(ui, !!pv.logo_verify, 'data-g65-ptog="logo_verify"', 'Sjekk logoen før den lagres') })],
  };
}

/* ---------------- Innstillinger → Glimt ---------------- */

export function hsRow65(ui) {
  return ui.row({ ic: 'clock', t: 'Send til Chat etter', s: 'Enkle oppgaver fullføres i søkefeltet. Tar svaret lengre tid, fortsetter det i Chat.', hl: 'glimt-hs65',
    right: ui.seg(HS65.map((v) => [v, `${v} s`]), A.hs ?? 8, (v) => `data-g65-hs="${v}"`, 'Send til Chat etter') });
}

export function memorySec65(ui) {
  const note = 'Det du lærer Glimt, f.eks. at «Påhåret» er frisøren din. Brukes når du legger inn timer og spør «når er neste frisørtime». Lagres bare for deg og sendes aldri til sky.';
  const head = '<div class="ac-slot" data-mem63 data-hl="ai-mem63"></div>';
  if (!A.loaded) return ui.sec('GLIMT HUSKER', head + ui.row({ ic: 'brain', t: 'Laster …' }), { note, hl: 'ai-mem63' });
  if (!A.mem) return ui.sec('GLIMT HUSKER', ui.row({ ic: 'brain', dot: 'off', t: 'Ikke tilgjengelig', s: A.memErr ? `Serveren svarte: ${A.memErr}` : 'Oppdater serveren' }), { note });
  const rows = A.mem.map((m) => ui.row({ ic: 'tag', th: `<span data-no-i18n>${esc(m.match)}</span>`, t: m.match, tag: m.stale ? 'IKKE BRUKT PÅ LENGE' : '', sh: `<span data-no-i18n>${esc(m.kind === 'fact' && m.note ? `er ${m.note}` : memoryLine(m))}</span>`,
    right: ui.btn('Slett', `data-g65-mdel="${esc(m.id)}" aria-label="Slett ${esc(m.match)}"`, 'red') }));
  if (!rows.length) rows.push('<p class="ac-note">Glimt husker ingenting ennå. Skriv f.eks. «husk at Påhåret er frisøren min» til Glimt.</p>');
  rows.push(ui.row({ ic: 'tag', t: 'Legg til', s: 'Navn på avsender og hva det er', x: 'g65.madd',
    panel: () => `<form class="ac-form" data-g65-mform>
      <label class="ac-f"><span>Navn</span><input name="match" required minlength="2" maxlength="80" placeholder="Påhåret" autocomplete="off"></label>
      <label class="ac-f"><span>Type</span><select name="type" aria-label="Type">${LEARN_TYPES.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select></label>
      <label class="ac-f"><span>Tittel</span><input name="title" maxlength="120" placeholder="Frisør · Påhåret (valgfri)" autocomplete="off"></label>
      <div class="ac-btns"><button type="submit" class="ac-b ink">Lagre</button></div></form>` }));
  if (A.memApply) rows.push(ui.row({ ic: 'cal', t: `Endre tittel på ${A.memApply.count} ${A.memApply.count === 1 ? 'avtale' : 'avtaler'}?`, sh: `<span data-no-i18n>Til «${esc(A.memApply.title ?? '')}»</span>`, right: ui.btn('Nei takk', 'data-g65-mapply="0"') + ui.btn('Endre', 'data-g65-mapply="1"', 'ink') }));
  if (A.memMsg) rows.push(`<p class="ac-note" role="status">${esc(A.memMsg)}</p>`);
  return ui.sec('GLIMT HUSKER', head + rows.join(''), { note, hl: 'ai-mem63', right: `${A.mem.length} ${A.mem.length === 1 ? 'ting' : 'ting'}` });
}

/* ---------------- Hendelser (document) ---------------- */

async function tog(k, chat) {
  const obj = chat ? A.chat : A.priv;
  if (!obj) return;
  const v = chat && k === 'chat_my_data' ? obj[k] === false : !obj[k];
  obj[k] = v; redraw();
  try {
    if (chat) A.chat = { ...A.chat, ...(await api('/chat/settings', { method: 'PATCH', json: { [k]: v } })) };
    else A.priv = { ...A.priv, ...(await fin('/ai-privacy', { method: 'PATCH', json: { [k]: v } })) };
    A.msg = '';
  } catch (err) { obj[k] = !v; A.msg = `Kunne ikke lagre: ${err.message}`; }
  redraw();
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest?.('[data-g65-tog],[data-g65-ptog],[data-g65-hs],[data-g65-mdel],[data-g65-mapply],[data-g65-theme],[data-g65-think]');
    if (!t || t.disabled) return;
    e.preventDefault();
    const d = t.dataset;
    if (d.g65Tog) return tog(d.g65Tog, true);
    if (d.g65Ptog) return tog(d.g65Ptog, false);
    if (d.g65Theme) {
      const prev = A.chat?.chat_theme; if (!A.chat) return;
      A.chat = { ...A.chat, chat_theme: d.g65Theme }; redraw();
      try { A.chat = { ...A.chat, ...(await api('/chat/settings', { method: 'PATCH', json: { chat_theme: d.g65Theme } })) }; A.msg = ''; } catch (err) { A.chat = { ...A.chat, chat_theme: prev }; A.msg = `Kunne ikke lagre: ${err.message}`; }
      redraw(); return;
    }
    if (d.g65Think !== undefined) {
      const v = !A.think; A.think = v; redraw();
      try { await api('/config', { method: 'PUT', json: { ai_think: v ? '1' : '0' } }); A.msg = ''; } catch (err) { A.think = !v; A.msg = `Kunne ikke lagre: ${err.message}`; }
      redraw(); return;
    }
    if (d.g65Hs) { const v = +d.g65Hs; A.hs = v; setHsTimeout(v); redraw(); api('/me/layout', { method: 'PUT', json: { hs_timeout_s: v } }).catch(() => {}); return; }
    if (d.g65Mapply !== undefined) {
      const ap = A.memApply; A.memApply = null;
      if (d.g65Mapply === '1' && ap) { try { const r = await applyMemory(ap.id); A.memMsg = `${r.count} ${r.count === 1 ? 'avtale' : 'avtaler'} fikk nytt navn ✓`; } catch (err) { A.memMsg = `Kunne ikke endre: ${err.message}`; } }
      redraw(); return;
    }
    if (d.g65Mdel) {
      const id = Number(d.g65Mdel);
      try { await deleteMemory(id); A.mem = (A.mem ?? []).filter((m) => m.id !== id); A.memMsg = 'Slettet ✓'; } catch (err) { A.memMsg = `Kunne ikke slette: ${err.message}`; }
      redraw();
    }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (!t.matches?.('[data-g65-def]')) return;
    try { A.chat = { ...A.chat, ...(await api('/chat/settings', { method: 'PATCH', json: { chat_default_model: t.value || null } })) }; A.msg = 'Standardmodellen er lagret ✓'; } catch (err) { A.msg = `Kunne ikke lagre: ${err.message}`; }
    redraw();
  });
  document.addEventListener('submit', async (e) => {
    const mf = e.target.closest?.('[data-g65-mform]');
    if (!mf) return;
    e.preventDefault();
    const fd = new FormData(mf), body = { match: String(fd.get('match') ?? '').trim(), type: String(fd.get('type') ?? 'annet'), title: String(fd.get('title') ?? '').trim() || null };
    try {
      const d = await addMemory(body);
      A.mem = await loadMemory(true);
      A.memMsg = 'Lagret ✓';
      A.memApply = d.matches ? { id: d.item.id, count: d.matches, title: d.item.title } : null;
      document.dispatchEvent(new CustomEvent('ac:close', { detail: 'g65.madd' }));
    } catch (err) { A.memMsg = `Kunne ikke lagre: ${err.message}`; }
    redraw();
  });
}

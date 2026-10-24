// Innstillinger → AI (prompt 27): gruppe CHAT (Chat kan lese mine data, Spør før sky-modeller får data, standardmodell,
// Open WebUI-adresse og -nøkkel for administratorer) og PERSONVERN OG LOGOER (Les kvitteringer lokalt, Finn logo med
// Gemini, Sjekk logoen før den lagres) med AI-logg (hva som er sendt til sky-motorer, bare egne rader).
// Data: GET/PATCH /api/chat/settings, GET /api/chat/models, GET/PATCH /finans/api/ai-privacy, GET /finans/api/ai-audit,
// GET/PUT /api/integrations/openwebui (admin). Mangler et endepunkt (eldre server), vises det som ikke tilgjengelig.
// Prompt 33: gruppe GLIMT HUSKER – brukerens alias (match → type/tittel) fra GET /api/glimt/memory, Slett (DELETE …/:id)
// og «Legg til» (POST {match, type, title?}).
import { esc, api } from './util.js';
import { store } from './store.js';
import { LEARN_TYPES, memoryLine, loadMemory, addMemory, deleteMemory, applyMemory } from './glimt-memory.js';
import { setHsTimeout } from './extras.js';
import { mountAiControl } from './ai-control.js';
import { is2c } from './hltheme.js';
import { mountReceipts48 } from './receipts48-set.js'; // prompt 48: Innstillinger → AI → Kvitteringer (Mac-OCR, steg i kjeden)
// Prompt 32 (claude-code-sok-fullfor-forst.md): GLIMT I SØKEFELTET → «Send til Chat etter» 5 / 8 / 15 / 30 s (hs_timeout_s i /api/me/layout).
const HS = [5, 8, 15, 30];

const A = { loaded: false, loading: false, chat: null, chatErr: '', models: null, priv: null, privErr: '', audit: null, auditErr: '', owui: null, msg: '', showLog: false, mem: null, memErr: '', memAdd: false, memMsg: '' };
const isAdmin = () => store.me?.me?.role === 'admin';
const fin = async (path, opts = {}) => {
  const r = await fetch('/finans/api' + path, { method: opts.method ?? 'GET', headers: opts.json ? { 'Content-Type': 'application/json' } : {}, body: opts.json ? JSON.stringify(opts.json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || `Feil ${r.status}`), { status: r.status });
  return d;
};

export async function loadAi(reload, force = false) {
  if ((A.loaded && !force) || A.loading) return;
  A.loading = true;
  const [c, m, p, a, o, g, l] = await Promise.allSettled([api('/chat/settings'), api('/chat/models'), fin('/ai-privacy'), fin('/ai-audit?limit=50'), isAdmin() ? api('/integrations/openwebui') : Promise.resolve(null), api('/glimt/memory'), api('/me/layout')]);
  const hv = l.status === 'fulfilled' ? +(l.value?.hs_timeout_s ?? 8) : 8; A.hs = HS.includes(hv) ? hv : 8;
  A.mem = g.status === 'fulfilled' ? g.value.items ?? [] : null; A.memErr = g.status === 'rejected' ? g.reason.message : '';
  A.chat = c.status === 'fulfilled' ? c.value : null; A.chatErr = c.status === 'rejected' ? c.reason.message : '';
  A.models = m.status === 'fulfilled' ? m.value.models ?? [] : [];
  A.auto = m.status === 'fulfilled' && m.value.auto?.id ? m.value.auto : null; // prompt 41: «✦ Auto»
  A.priv = p.status === 'fulfilled' ? p.value : null; A.privErr = p.status === 'rejected' ? p.reason.message : '';
  A.audit = a.status === 'fulfilled' ? (Array.isArray(a.value) ? a.value : a.value.items ?? []) : null; A.auditErr = a.status === 'rejected' ? a.reason.message : '';
  A.owui = o.status === 'fulfilled' ? o.value : null;
  A.loaded = true; A.loading = false;
  reload?.();
}

const when = (t) => { const d = new Date(t); return `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`; };
function sent(f) {
  if (!f || typeof f !== 'object') return '';
  return Object.entries(f).filter(([, v]) => v !== false && v !== 0 && v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v === true ? 'ja' : v}`).join(' · ');
}

// Prompt 34: AI-kontroll-panelet øverst (Oversikt · Modeller · Valg · Jobber · Forbruk · API og nøkler). Fanen huskes mens
// innstillingene er åpne; settings-search kan be om en bestemt fane (ai-mod → Modeller, ai-key-* → API og nøkler).
let acTab = null;
export function setAiTab(t) { acTab = t; }
const acMount = (el) => mountAiControl(el, { variant: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'web', scope: 'alle', theme: (document.documentElement.dataset.hlTheme ? document.documentElement.dataset.hlTheme === '2c' : is2c()) ? 'papir' : 'mork', tab: acTab ?? undefined, admin: isAdmin(), embedded: true, hideTitle: true, onTab: (t) => { acTab = t; }, onPaint: () => document.dispatchEvent(new Event('hl:reapply')),
  // Prompt 39: statuslinjen («5 lokale modeller · 5 i skyen · 2 jobber kjører») står i undertittelen til Innstillinger-toppen.
  onStatus: (st) => { const el = document.querySelector('#settings .set-ps'); if (el && st && document.getElementById('set-title')?.textContent === 'AI' && el.textContent !== st) el.textContent = st; } });
export function aiView({ group, row, note }) {
  const pre = '<div class="set-aictl" data-mount-host data-hl="ai-mod"></div><div class="set-r48" data-r48-mount data-hl="ai-r48"></div><h3 class="sg-t set-aimore">Chat, Glimt og personvern</h3>';
  // Prompt 48: kvitteringsseksjonen tegnes på nytt fra egen tilstand ved hver tegning (AI-kontroll flyttes over som før).
  const mount = (slot) => { acMount(slot); mountReceipts48(document.querySelector('#settings [data-r48-mount]') ?? slot.parentElement?.querySelector('[data-r48-mount]')); };
  if (!A.loaded) return { pre, mount, groups: [group('', [row({ t: 'Laster …' })])] };
  const ch = A.chat, pv = A.priv, groups = [];
  if (ch) {
    const opts = (A.models ?? []).filter((m) => m.installed);
    const sel = `<label class="sg-field"><span>Standardmodell</span><select data-ai-def aria-label="Standardmodell">${A.auto ? `<option value="${esc(A.auto.id)}"${!ch.chat_default_model || ch.chat_default_model === A.auto.id ? ' selected' : ''}>${esc(A.auto.label || '✦ Auto')} · Glimt velger beste modell</option>` : '<option value="">Automatisk (siste brukte)</option>'}${opts.map((m) => `<option value="${esc(m.id)}"${ch.chat_default_model === m.id ? ' selected' : ''}>${esc(m.kind === 'sky' ? `${m.name} · sky` : `${m.id} · lokal`)}</option>`).join('')}</select></label>`;
    groups.push(group('Chat', [
      row({ t: 'La Chat lese mine data', s: 'På som standard. Finans, Kalender og Gjøremål sendes med når «Mine data» er på i samtalen. Lokale modeller får dataene uten spørsmål.', tog: ch.chat_my_data !== false, act: 'data-ai-tog="chat_my_data"', k: 'chat mine data finans kalender huskeliste' }),
      row({ t: 'Spør før sky-modeller får data', s: 'Gemini og Groq må godkjennes per samtale', tog: !!ch.chat_ask_cloud, act: 'data-ai-tog="chat_ask_cloud"', k: 'sky gemini groq personvern' }),
      { html: sel, q: 'standardmodell modell chat' },
      row({ t: 'Åpne chat', s: 'Historikk, modeller og kunnskapsbase', act: 'data-ai-open', btn: 'Åpne', k: 'chat' }),
    ], 'Lokale modeller kjører på hjemmeserveren. Sky-modeller (Gemini, Groq) merkes SKY i Chat.'));
  } else groups.push(group('Chat', [row({ t: 'Chat er ikke tilgjengelig', s: A.chatErr ? `Serveren svarte: ${A.chatErr}` : 'Oppdater serveren' })]));
  groups.push(group('Glimt i søkefeltet', [
    row({ t: 'Send til Chat etter', s: `${A.hs ?? 8} sekunder · trykk for å bytte`, act: 'data-ai-hs', btn: `${A.hs ?? 8} s`, k: 'glimt søkefelt søk chat tid timeout sekunder fullfør' }),
  ], 'Enkle oppgaver fullføres i søkefeltet. Tar svaret lengre tid, fortsetter det i Chat.'));
  if (isAdmin() && A.owui) {
    const f = Object.fromEntries((A.owui.fields ?? []).map((x) => [x.key, x]));
    const url = f.openwebui_url?.value ?? '', keySaved = !!f.openwebui_key?.saved;
    groups.push({ t: 'Open WebUI · serveroppsett', note: 'Valgfritt. Med Open WebUI får Chat kunnskapsbase, nettsøk og tale (Whisper). Uten den brukes Ollama, Gemini og Groq direkte.', rows: [{ q: 'open webui adresse nøkkel', html: `<form class="sg-form" data-ai-owui>
      <label class="sg-field"><span>Adresse</span><input name="openwebui_url" type="url" value="${esc(url)}" placeholder="http://192.168.1.30:3000" autocomplete="off" spellcheck="false"></label>
      <label class="sg-field"><span>API-nøkkel</span><input name="openwebui_key" type="password" value="" placeholder="${keySaved ? '•••••••• lagret' : 'ikke satt'}" autocomplete="off"></label>
      <div class="sg-row"><span class="sg-txt"><span>${esc(A.owui.statusText ?? '')}</span></span><button type="submit" class="sg-btn2">Lagre</button></div></form>` }] });
  }
  if (pv) {
    groups.push(group('Personvern og logoer', [
      row({ t: 'Les kvitteringer lokalt', s: 'Ollama på hjemmeserveren leser hele kvitteringen. Ingenting sendes ut', tog: !!pv.logo_local_receipts, act: 'data-ai-ptog="logo_local_receipts"', k: 'kvittering ollama lokalt' }),
      row({ t: 'Finn logo med Gemini', s: 'Gemini får bare butikknavnet, f.eks. «Blomsterlandet»', tog: !!pv.logo_gemini, act: 'data-ai-ptog="logo_gemini"', k: 'logo gemini butikk' }),
      row({ t: 'Sjekk logoen før den lagres', s: 'Domenet må svare, og bildet må være et ekte bilde', tog: !!pv.logo_verify, act: 'data-ai-ptog="logo_verify"', k: 'logo sjekk' }),
      row({ t: 'AI-logg', s: A.audit ? `${A.audit.length} ${A.audit.length === 1 ? 'oppføring' : 'oppføringer'} · hva som er sendt til sky-motorer` : A.auditErr || 'Ikke tilgjengelig', act: 'data-ai-log', btn: A.showLog ? 'Skjul' : 'Vis', k: 'ai logg audit' }),
    ], 'Logoer finnes uten at AI gjetter: Brønnøysundregistrene, nettstedet selv og (valgfritt) Gemini med bare butikknavnet.'));
    if (A.showLog) {
      const L = A.audit ?? [];
      groups.push({ t: 'AI-logg', note: '', rows: L.length ? L.map((x) => ({ q: 'ai logg', html: `<div class="sg-row"><span class="sg-txt"><b>${esc(x.engineName ?? x.engine)} · ${esc(x.purposeName ?? x.purpose)}</b><span>${esc(sent(x.fieldsSent))}</span></span><span class="sg-v">${esc(when(x.at ?? x.ts))}</span></div>` }))
        : [{ q: '', html: '<div class="sg-row"><span class="sg-txt"><span>Ingenting er sendt til sky-motorer ennå.</span></span></div>' }] });
    }
  } else groups.push(group('Personvern og logoer', [row({ t: 'Ikke tilgjengelig', s: A.privErr ? `Serveren svarte: ${A.privErr}` : 'Oppdater serveren' })]));
  groups.push(memoryGroup(group, row));
  if (A.msg) groups.push({ t: '', note: '', rows: [{ q: '', html: `<div class="sg-row"><span class="sg-txt"><span>${esc(A.msg)}</span></span></div>` }] });
  void note;
  return { pre, mount, groups };
}

/* Prompt 33: GLIMT HUSKER */
function memoryGroup(group, row) {
  const note = 'Det du lærer Glimt, f.eks. at «Påhåret» er frisøren din. Brukes når du legger inn timer og spør «når er neste frisørtime». Lagres bare for deg og sendes aldri til sky.';
  if (!A.mem) return group('Glimt husker', [row({ t: 'Ikke tilgjengelig', s: A.memErr ? `Serveren svarte: ${A.memErr}` : 'Oppdater serveren' })], esc(note));
  const rows = A.mem.map((m) => ({ q: `glimt husker ${m.match} ${m.type ?? ''} ${m.title ?? ''}`, html: `<div class="sg-row"><span class="sg-txt"><b data-no-i18n>${esc(m.match)}</b><span data-no-i18n>${esc(memoryLine(m))}</span></span><button type="button" class="sg-btn2" data-ai-mdel="${esc(m.id)}" aria-label="Slett ${esc(m.match)}">Slett</button></div>` }));
  if (!rows.length) rows.push({ q: 'glimt husker', html: '<div class="sg-row"><span class="sg-txt"><span>Glimt husker ingenting ennå. Skriv f.eks. «husk at Påhåret er frisøren min» til Glimt.</span></span></div>' });
  rows.push(A.memAdd ? { q: 'glimt husker legg til', html: `<form class="sg-form" data-ai-mform>
      <label class="sg-field"><span>Navn</span><input name="match" required minlength="2" maxlength="80" placeholder="Påhåret" autocomplete="off"></label>
      <label class="sg-field"><span>Type</span><select name="type" aria-label="Type">${LEARN_TYPES.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select></label>
      <label class="sg-field"><span>Tittel (valgfri)</span><input name="title" maxlength="120" placeholder="Frisør · Påhåret" autocomplete="off"></label>
      <div class="sg-row"><span class="sg-txt"><span>${esc(A.memMsg)}</span></span><button type="button" class="sg-btn2" data-ai-madd>Avbryt</button><button type="submit" class="sg-btn2">Lagre</button></div></form>` }
    : row({ t: 'Legg til', s: 'Navn på avsender og hva det er', act: 'data-ai-madd', btn: 'Legg til', k: 'glimt husker alias legg til' }));
  if (A.memApply) rows.push({ q: '', html: `<div class="sg-row"><span class="sg-txt"><b>Endre tittel på ${A.memApply.count} ${A.memApply.count === 1 ? 'avtale' : 'avtaler'}?</b><span data-no-i18n>Til «${esc(A.memApply.title ?? '')}»</span></span><button type="button" class="sg-btn2" data-ai-mapply="0">Nei takk</button><button type="button" class="sg-btn2" data-ai-mapply="1">Endre</button></div>` });
  if (A.memMsg && !A.memAdd) rows.push({ q: '', html: `<div class="sg-row"><span class="sg-txt"><span>${esc(A.memMsg)}</span></span></div>` });
  return group('Glimt husker', rows, esc(note));
}

export async function aiClick(e, rerender) {
  if (e.target.closest('[data-ai-hs]')) {
    e.preventDefault();
    const v = HS[(HS.indexOf(A.hs ?? 8) + 1) % HS.length];
    A.hs = v; setHsTimeout(v); rerender();
    api('/me/layout', { method: 'PUT', json: { hs_timeout_s: v } }).catch(() => {});
    return true;
  }
  const g = e.target.closest('[data-ai-mdel],[data-ai-madd],[data-ai-mapply]');
  if (g) {
    e.preventDefault();
    if (g.dataset.aiMapply !== undefined) {
      const ap = A.memApply; A.memApply = null;
      if (g.dataset.aiMapply === '1' && ap) { try { const d = await applyMemory(ap.id); A.memMsg = `${d.count} ${d.count === 1 ? 'avtale' : 'avtaler'} fikk nytt navn ✓`; } catch (err) { A.memMsg = `Kunne ikke endre: ${err.message}`; } }
      rerender();
      return true;
    }
    if (g.dataset.aiMadd !== undefined) { A.memAdd = !A.memAdd; A.memMsg = ''; rerender(); if (A.memAdd) document.querySelector('[data-ai-mform] [name=match]')?.focus(); return true; }
    const id = Number(g.dataset.aiMdel);
    try { await deleteMemory(id); A.mem = (A.mem ?? []).filter((m) => m.id !== id); A.memMsg = 'Slettet ✓'; } catch (err) { A.memMsg = `Kunne ikke slette: ${err.message}`; }
    rerender();
    return true;
  }
  const t = e.target.closest('[data-ai-tog],[data-ai-ptog],[data-ai-log],[data-ai-open]');
  if (!t) return false;
  e.preventDefault();
  if (t.dataset.aiOpen !== undefined) { document.getElementById('settings').hidden = true; location.hash = '#/chat'; return true; }
  if (t.dataset.aiLog !== undefined) { A.showLog = !A.showLog; if (A.showLog) { try { const a = await fin('/ai-audit?limit=50'); A.audit = Array.isArray(a) ? a : a.items ?? []; } catch { /* beholder */ } } rerender(); return true; }
  const k = t.dataset.aiTog ?? t.dataset.aiPtog, chat = t.dataset.aiTog != null;
  const obj = chat ? A.chat : A.priv, v = chat && k === 'chat_my_data' ? obj[k] === false : !obj[k]; // prompt 41: mangler = på
  obj[k] = v; rerender();
  try {
    if (chat) A.chat = { ...A.chat, ...(await api('/chat/settings', { method: 'PATCH', json: { [k]: v } })) };
    else A.priv = { ...A.priv, ...(await fin('/ai-privacy', { method: 'PATCH', json: { [k]: v } })) };
    A.msg = '';
  } catch (err) { obj[k] = !v; A.msg = `Kunne ikke lagre: ${err.message}`; }
  rerender();
  return true;
}

export async function aiChange(e, rerender) {
  const t = e.target;
  if (!t.matches?.('[data-ai-def]')) return false;
  try { A.chat = { ...A.chat, ...(await api('/chat/settings', { method: 'PATCH', json: { chat_default_model: t.value || null } })) }; A.msg = 'Lagret ✓'; } catch (err) { A.msg = `Kunne ikke lagre: ${err.message}`; }
  rerender();
  return true;
}

export async function aiSubmit(e, rerender) {
  const mf = e.target.closest?.('[data-ai-mform]');
  if (mf) {
    e.preventDefault();
    const fd = new FormData(mf), body = { match: String(fd.get('match') ?? '').trim(), type: String(fd.get('type') ?? 'annet'), title: String(fd.get('title') ?? '').trim() || null };
    try {
      const d = await addMemory(body);
      A.mem = await loadMemory(true);
      A.memAdd = false;
      A.memMsg = 'Lagret ✓';
      A.memApply = d.matches ? { id: d.item.id, count: d.matches, title: d.item.title } : null;
    } catch (err) { A.memMsg = `Kunne ikke lagre: ${err.message}`; }
    rerender();
    return true;
  }
  const f = e.target.closest?.('[data-ai-owui]');
  if (!f) return false;
  e.preventDefault();
  const fd = new FormData(f), body = { openwebui_url: String(fd.get('openwebui_url') ?? '').trim() };
  const key = String(fd.get('openwebui_key') ?? '').trim();
  if (key) body.openwebui_key = key;
  try { A.owui = await api('/integrations/openwebui', { method: 'PUT', json: body }); A.msg = 'Open WebUI er lagret ✓'; } catch (err) { A.msg = `Kunne ikke lagre: ${err.message}`; }
  rerender();
  return true;
}

// Innstillinger → AI (prompt 27): gruppe CHAT (Chat kan lese mine data, Spør før sky-modeller får data, standardmodell,
// Open WebUI-adresse og -nøkkel for administratorer) og PERSONVERN OG LOGOER (Les kvitteringer lokalt, Finn logo med
// Gemini, Sjekk logoen før den lagres) med AI-logg (hva som er sendt til sky-motorer, bare egne rader).
// Data: GET/PATCH /api/chat/settings, GET /api/chat/models, GET/PATCH /finans/api/ai-privacy, GET /finans/api/ai-audit,
// GET/PUT /api/integrations/openwebui (admin). Mangler et endepunkt (eldre server), vises det som ikke tilgjengelig.
import { esc, api } from './util.js';
import { store } from './store.js';

const A = { loaded: false, loading: false, chat: null, chatErr: '', models: null, priv: null, privErr: '', audit: null, auditErr: '', owui: null, msg: '', showLog: false };
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
  const [c, m, p, a, o] = await Promise.allSettled([api('/chat/settings'), api('/chat/models'), fin('/ai-privacy'), fin('/ai-audit?limit=50'), isAdmin() ? api('/integrations/openwebui') : Promise.resolve(null)]);
  A.chat = c.status === 'fulfilled' ? c.value : null; A.chatErr = c.status === 'rejected' ? c.reason.message : '';
  A.models = m.status === 'fulfilled' ? m.value.models ?? [] : [];
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

export function aiView({ group, row, note }) {
  if (!A.loaded) return { groups: [group('', [row({ t: 'Laster …' })])] };
  const ch = A.chat, pv = A.priv, groups = [];
  if (ch) {
    const opts = (A.models ?? []).filter((m) => m.installed);
    const sel = `<label class="sg-field"><span>Standardmodell</span><select data-ai-def aria-label="Standardmodell"><option value="">Automatisk (siste brukte)</option>${opts.map((m) => `<option value="${esc(m.id)}"${ch.chat_default_model === m.id ? ' selected' : ''}>${esc(m.kind === 'sky' ? `${m.name} · sky` : `${m.id} · lokal`)}</option>`).join('')}</select></label>`;
    groups.push(group('Chat', [
      row({ t: 'Chat kan lese mine data', s: 'Finans, Kalender og Huskeliste når «Mine data» er på', tog: !!ch.chat_my_data, act: 'data-ai-tog="chat_my_data"', k: 'chat mine data finans kalender huskeliste' }),
      row({ t: 'Spør før sky-modeller får data', s: 'Gemini og Groq må godkjennes per samtale', tog: !!ch.chat_ask_cloud, act: 'data-ai-tog="chat_ask_cloud"', k: 'sky gemini groq personvern' }),
      { html: sel, q: 'standardmodell modell chat' },
      row({ t: 'Åpne chat', s: 'Historikk, modeller og kunnskapsbase', act: 'data-ai-open', btn: 'Åpne', k: 'chat' }),
    ], 'Lokale modeller kjører på hjemmeserveren. Sky-modeller (Gemini, Groq) merkes SKY i Chat.'));
  } else groups.push(group('Chat', [row({ t: 'Chat er ikke tilgjengelig', s: A.chatErr ? `Serveren svarte: ${A.chatErr}` : 'Oppdater serveren' })]));
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
  if (A.msg) groups.push({ t: '', note: '', rows: [{ q: '', html: `<div class="sg-row"><span class="sg-txt"><span>${esc(A.msg)}</span></span></div>` }] });
  void note;
  return { groups };
}

export async function aiClick(e, rerender) {
  const t = e.target.closest('[data-ai-tog],[data-ai-ptog],[data-ai-log],[data-ai-open]');
  if (!t) return false;
  e.preventDefault();
  if (t.dataset.aiOpen !== undefined) { document.getElementById('settings').hidden = true; location.hash = '#/chat'; return true; }
  if (t.dataset.aiLog !== undefined) { A.showLog = !A.showLog; if (A.showLog) { try { const a = await fin('/ai-audit?limit=50'); A.audit = Array.isArray(a) ? a : a.items ?? []; } catch { /* beholder */ } } rerender(); return true; }
  const k = t.dataset.aiTog ?? t.dataset.aiPtog, chat = t.dataset.aiTog != null;
  const obj = chat ? A.chat : A.priv, v = !obj[k];
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

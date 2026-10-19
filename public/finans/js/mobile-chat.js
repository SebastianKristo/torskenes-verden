// Prompt 27 (PWA): Chat – egen side i appen for Ollama (lokalt) og Gemini/Groq (sky), med historikk, mapper,
// modellvelger, samtaleinnstillinger, strømming med Stopp, vedlegg, Nettsøk/Mine data, tale og «Sende til sky?».
// Fasit: design/Mobil Papir App.dc.html (side «chat»). Telefon: fullskjerm med historikk i skuff (☰).
// Fold/brede skjermer (≥ 600 px): fast sidepanel til venstre.
// API (kontrakt 27): /api/chat/* (sesjon). Mangler endepunktene (404), lagres samtalene på enheten og sending gir
// en tydelig melding om at serveren må oppdateres.
import { esc, hlApi } from './core.js';
import { m, draw } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { IG, integLoad24 } from './mobile-p24.js';

/* ---------- Faste lister (reserve når serveren ikke svarer) ---------- */
const LOC0 = [['llama3.1:8b', 'Llama 3.1', '8B · 4,9 GB', 'Tekst'], ['gemma3:12b', 'Gemma 3', '12B · 8,1 GB', 'Tekst og bilde'], ['qwen2.5vl:7b', 'Qwen 2.5 VL', '7B · 6,0 GB', 'Leser bilder og kvitteringer'], ['deepseek-r1:8b', 'DeepSeek R1', '8B · 5,2 GB', 'Tenker før den svarer']];
const SKY0 = [['gemini-2.5-flash', 'Gemini 2.5 Flash', 'Google · sky', 'Rask, bilder og lange dokumenter', 'gemini'], ['groq-llama-3.3-70b', 'Llama 3.3 70B', 'Groq · sky', 'Veldig rask tekst', 'groq']];
const LIB = [['llama3.2:3b', 'Llama 3.2', '3B · 2,0 GB'], ['qwen3:8b', 'Qwen 3', '8B · 5,2 GB'], ['mistral:7b', 'Mistral', '7B · 4,1 GB'], ['phi4:14b', 'Phi-4', '14B · 9,1 GB']];
const PERS = [['std', 'Standard', ''], ['oko', 'Økonomi', 'Svar kort og bruk tall i kroner. Bruk dataene fra Finans når de finnes.'], ['kode', 'Homelab', 'Du hjelper med Docker, Home Assistant, Proxmox og Python. Gi konkrete kommandoer.'], ['norsk', 'Norsklærer', 'Rett språket og forklar kort hvorfor.']];
const SUGG = [['Hva har jeg brukt på mat i oktober?', 'Bruker Mine data', 'data'], ['Hva står det om oppsigelse i husleiekontrakten?', 'Fra kunnskapsbasen', 'kb'], ['Lag en handleliste til taco for fire', '', ''], ['Forklar Docker-volumer enkelt', '', '']];
const DEF = { persona: 'std', system: '', temperature: 0.7, topP: 0.9, numCtx: 8192 };

/* ---------- Lokal lagring ---------- */
const LS = 'fh_chat27';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
L.chats ??= []; L.folders ??= []; L.open ??= {};
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch { /* privat modus */ } };

export const C = {
  srv: null, list: null, cur: null, models: null, mErr: '', q: '', drawer: false, sh: null, inp: '', att: [], web: false, data: false,
  busy: false, stream: '', used: [], ctrl: null, ed: null, mn: null, rn: '', nf: '', del: false, cop: null, spk: null, rec: false,
  toast: '', guard: null, pend: '', rem: false, kb: null, kbSel: [], pulls: {}, pn: '', mdel: null, sc: 0, bottom: false, from: 'hl', t: 0,
};

/* ---------- Personlige valg (Innstillinger → AI og tolkning → CHAT) ---------- */
const PL = 'fh_p27_pers';
const PV = (() => { try { return JSON.parse(localStorage.getItem(PL) || '{}') || {}; } catch { return {}; } })();
/** Verdien til en personlig innstilling: serveren (Integrasjoner, id chat/privacy) går foran lokal kopi. */
export function pers(key, def) {
  for (const g of IG.list ?? []) for (const f of g.fields ?? []) if (f.key === key && f.value != null && f.value !== '') return typeof def === 'boolean' ? f.value === true || f.value === '1' || f.value === 'true' : f.value;
  return PV[key] ?? def;
}
export async function setPers(group, key, v) {
  PV[key] = v; try { localStorage.setItem(PL, JSON.stringify(PV)); } catch {}
  for (const g of IG.list ?? []) for (const f of g.fields ?? []) if (f.key === key) f.value = typeof v === 'boolean' ? (v ? '1' : '0') : v;
  try { await hlApi(`/integrations/${group}`, { method: 'PUT', json: { [key]: typeof v === 'boolean' ? (v ? '1' : '0') : v } }); return true; }
  catch { return false; } // lagret på enheten
}
const dataOK = () => pers('chat_my_data', false);
const askCloud = () => pers('chat_ask_cloud', true);
const theme = () => (L.th || pers('chat_theme', 'papir')) === 'noytral' ? 'noytral' : 'papir';

/* ---------- Modeller ---------- */
const fallbackModels = () => [...LOC0.map(([id, name, size, s]) => ({ id, name, kind: 'lokal', provider: 'ollama', size, sub: s, vision: /vl|gemma3/.test(id), installed: true })), ...SKY0.map(([id, name, size, s, p]) => ({ id, name, kind: 'sky', provider: p, size, sub: s, vision: true, installed: true }))];
const models = () => C.models ?? fallbackModels();
const mOf = (id) => models().find((x) => x.id === id) ?? { id, name: id, kind: /gemini|groq|gpt/i.test(id) ? 'sky' : 'lokal', provider: /gemini/i.test(id) ? 'gemini' : /groq/i.test(id) ? 'groq' : 'ollama' };
const isSky = (id) => mOf(id).kind === 'sky';
const mLbl = (id) => { const x = mOf(id); return x.kind === 'sky' ? x.name : x.id; };
const curModel = () => C.cur?.model || L.model || pers('chat_default_model', '') || models().find((x) => x.kind === 'lokal' && x.installed !== false)?.id || 'llama3.1:8b';
const firstLocal = () => models().find((x) => x.kind === 'lokal' && x.installed !== false)?.id ?? 'llama3.1:8b';

async function loadModels() {
  try {
    const r = await hlApi('/chat/models');
    const list = Array.isArray(r) ? r : r?.models ?? [];
    C.models = list.map((x) => ({ ...x, id: x.id ?? x.name, name: x.name ?? x.id }));
    if (r?.default && !L.model) L.model = r.default;
    C.mErr = '';
  } catch (e) { C.models = null; C.mErr = e.status === 404 ? 'Serveren har ikke Chat ennå' : e.message; }
}

/* ---------- Samtaler (server eller enheten) ---------- */
const nowMs = () => Date.now();
const tsOf = (x) => { const v = x.updatedAt ?? x.up ?? x.updated_at; return typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : v ? Date.parse(v) || 0 : 0; };
function normChat(x) {
  return { id: x.id, title: x.title || 'Ny samtale', model: x.model || '', pinned: !!x.pinned, folderId: x.folderId ?? x.folder_id ?? null, up: tsOf(x), settings: { ...DEF, ...(x.settings ?? {}) }, messages: x.messages ? x.messages.map(normMsg) : null };
}
function normMsg(x) {
  if (x.r) return x;
  return { r: x.role === 'user' ? 'u' : 'a', t: x.content ?? x.text ?? '', m: x.model ?? '', tool: x.used ?? x.tool ?? [], st: x.st ?? statLine(x), att: x.att ?? (x.files ?? []).map((f) => f.name ?? f) };
}
const statLine = (x) => (x.tokensPerSec ? `${Math.round(x.tokensPerSec)} tok/s · ${(x.ms / 1000).toFixed(1).replace('.', ',')} s` : '');
export async function chatLoad(force = false) {
  if (!force && C.list && Date.now() - C.t < 20000) return;
  C.t = Date.now();
  const jobs = [C.models ? null : loadModels(), IG.list ? null : integLoad24().catch(() => {})];
  try {
    const r = await hlApi(`/chat/chats${C.q ? `?q=${encodeURIComponent(C.q)}` : ''}`);
    const all = [...(r?.pinned ?? []), ...(r?.chats ?? []), ...(r?.folders ?? []).flatMap((f) => (f.chats ?? []).map((c) => ({ ...c, folderId: c.folderId ?? f.id })))];
    const seen = new Set();
    C.list = { chats: all.filter((c) => !seen.has(c.id) && seen.add(c.id)).map(normChat), folders: (r?.folders ?? []).map((f) => ({ id: f.id, name: f.name, open: f.open !== false })) };
    C.srv = true;
  } catch (e) {
    C.srv = false;
    C.list = { chats: L.chats.map(normChat), folders: L.folders };
  }
  await Promise.all(jobs.filter(Boolean));
}
const saveLocal = () => { if (C.srv) return; L.chats = C.list.chats.map((c) => ({ ...c, messages: c.messages ?? [] })); L.folders = C.list.folders; keep(); };
async function openConv(id) {
  const c = C.list?.chats.find((x) => x.id === id);
  if (!c) return;
  C.cur = { ...c, messages: c.messages ? [...c.messages] : null };
  C.drawer = false; C.ed = null; C.bottom = true; draw();
  if (C.srv && !c.messages) {
    try { const r = await hlApi(`/chat/chats/${encodeURIComponent(id)}`); if (C.cur?.id === id) { C.cur = normChat({ ...c, ...r }); C.cur.messages ??= []; } }
    catch (e) { if (C.cur?.id === id) { C.cur.messages = []; toast(e.message); } }
    C.bottom = true; draw();
  }
}
async function patchChat(id, patch) {
  const c = C.list?.chats.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
  if (C.cur?.id === id) Object.assign(C.cur, patch);
  if (C.srv && id && !String(id).startsWith('l')) {
    try { await hlApi(`/chat/chats/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }); } catch (e) { toast(e.message); }
  } else saveLocal();
}
async function deleteChat(id) {
  C.list.chats = C.list.chats.filter((x) => x.id !== id);
  if (C.cur?.id === id) C.cur = null;
  if (C.srv) { try { await hlApi(`/chat/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (e) { toast(e.message); } } else saveLocal();
}
async function addFolder(name) {
  let f = { id: `f${Date.now()}`, name, open: true };
  if (C.srv) { try { const r = await hlApi('/chat/folders', { method: 'POST', json: { name } }); f = { id: r.id ?? f.id, name: r.name ?? name, open: true }; } catch (e) { toast(e.message); return null; } }
  C.list.folders = [...C.list.folders, f]; saveLocal(); return f;
}
function togFolder(id) {
  const f = C.list.folders.find((x) => x.id === id); if (!f) return;
  f.open = !f.open; L.open[id] = f.open; keep();
  if (C.srv) hlApi(`/chat/folders/${encodeURIComponent(id)}`, { method: 'PATCH', json: { open: f.open } }).catch(() => {});
}
function exportMd(c) {
  const msgs = c.messages ?? [];
  return `# ${c.title}\n\n${msgs.map((x) => `${x.r === 'u' ? '**Du:**' : `**${x.m || 'AI'}:**`} ${x.t}`).join('\n\n')}\n`;
}
async function doExport(c) {
  let md = null;
  if (C.srv) { try { const r = await fetch(`/api/chat/chats/${encodeURIComponent(c.id)}/export`); if (r.ok) md = await r.text(); } catch {} }
  if (md == null) { if (!c.messages && C.cur?.id === c.id) c = C.cur; md = exportMd(c); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = `${c.title.replace(/[^\wæøåÆØÅ -]+/g, '').trim() || 'samtale'}.md`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Eksportert som Markdown');
}
async function doShare(c) {
  try {
    const r = await hlApi(`/chat/chats/${encodeURIComponent(c.id)}/share`, { method: 'POST' });
    const url = r?.url?.startsWith('http') ? r.url : location.origin + (r?.url ?? '');
    if (navigator.share) { navigator.share({ title: c.title, url }).catch(() => {}); return; }
    await navigator.clipboard?.writeText(url); toast('Lenke kopiert');
  } catch (e) { toast(e.status === 404 ? 'Deling krever nyere server' : e.message); }
}

/* ---------- Sending og strømming (SSE) ---------- */
let toastT = null;
function toast(t) { C.toast = t; clearTimeout(toastT); draw(); toastT = setTimeout(() => { C.toast = ''; draw(); }, 1800); }
const ensureCur = () => { C.cur ??= { id: null, title: '', model: curModel(), pinned: false, folderId: null, up: nowMs(), settings: { ...DEF, ...(L.def ?? {}) }, messages: [] }; C.cur.messages ??= []; return C.cur; };

function guardItems(useData) {
  return ['Meldingen din', ...(useData ? ['Sammendrag av Finans, Kalender og Huskeliste'] : []), ...C.att.map((a) => `Vedlegg: ${a.name}`)];
}
async function send(text, opt = {}) {
  const t = String(text ?? '').trim();
  if (!t || C.busy) return;
  const model = C.cur?.model || curModel(), useData = C.data && dataOK();
  // Spør før data forlater serveren (klientsjekk; serveren svarer også 409 needsConfirm).
  if (isSky(model) && (useData || C.att.length) && !opt.ok && askCloud() && !C.cur?.settings?.skipCloudAsk) {
    C.pend = t; C.guard = { model: mLbl(model), leaves: guardItems(useData), hasData: useData }; C.sh = 'guard'; C.rem = false; draw(); return;
  }
  const cur = ensureCur();
  if (!cur.model) cur.model = model;
  if (opt.remember) { cur.settings.skipCloudAsk = true; if (cur.id) patchChat(cur.id, { settings: cur.settings }); }
  const att = C.att;
  cur.messages.push({ r: 'u', t, att: att.map((a) => a.name), images: att.filter((a) => a.kind === 'img').map((a) => a.data), files: att.filter((a) => a.id).map((a) => a.id) });
  if (!cur.title) cur.title = t.length > 42 ? `${t.slice(0, 40)} …` : t;
  C.inp = ''; C.att = []; C.sh = null; C.pend = ''; C.guard = null; C.rem = false;
  await run({ confirmCloud: !!opt.ok, withoutMyData: !!opt.noData, myData: useData && !opt.noData });
}
const toApi = (x) => ({ role: x.r === 'u' ? 'user' : 'assistant', content: x.t, ...(x.images?.length ? { images: x.images } : {}) });
async function run(o = {}) {
  const cur = C.cur; if (!cur) return;
  const t0 = performance.now(), model = cur.model || curModel();
  C.busy = true; C.stream = ''; C.used = []; C.bottom = true; C.ed = null; draw();
  const files = cur.messages.flatMap((x) => x.files ?? []);
  const body = { chatId: cur.id && !String(cur.id).startsWith('l') ? cur.id : undefined, model, messages: cur.messages.map(toApi), settings: cur.settings, webSearch: C.web, myData: o.myData ?? (C.data && dataOK()), files, ...(o.editFrom != null ? { editFrom: o.editFrom } : {}), ...(o.confirmCloud ? { confirmCloud: true } : {}), ...(o.withoutMyData ? { withoutMyData: true } : {}) };
  const ctrl = new AbortController(); C.ctrl = ctrl;
  let full = '', stats = null, err = '', stopped = false;
  try {
    const res = await fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (res.status === 409) {
      const j = await res.json().catch(() => ({}));
      if (j.needsConfirm) {
        const last = cur.messages.pop(); C.pend = last?.t ?? ''; C.busy = false; C.ctrl = null;
        C.guard = { model: j.model || mLbl(model), leaves: j.leaves ?? guardItems(body.myData), hasData: !!body.myData }; C.sh = 'guard'; draw(); return;
      }
      throw new Error(j.error || 'Serveren avviste meldingen');
    }
    if (res.status === 404) throw Object.assign(new Error('Chat krever en nyere Homelab-server. Oppdater serveren for å snakke med Ollama, Gemini eller Groq.'), { soft: true });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => null); throw new Error(j?.error || `Serveren svarte ${res.status}`); }
    const rd = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = 'message', data = '';
        for (const ln of raw.split('\n')) { if (ln.startsWith('event:')) ev = ln.slice(6).trim(); else if (ln.startsWith('data:')) data += ln.slice(5).trim(); }
        let d = {}; try { d = data ? JSON.parse(data) : {}; } catch { d = { text: data }; }
        if (ev === 'meta') { if (d.chatId) cur.id = d.chatId; if (d.used) C.used = d.used; }
        else if (ev === 'delta') { full += d.text ?? ''; C.stream = full; paintStream(); }
        else if (ev === 'done') stats = d;
        else if (ev === 'error') err = d.error || 'Ukjent feil';
      }
    }
  } catch (e) { if (e.name === 'AbortError') stopped = true; else err = e.message; }
  C.ctrl = null; C.busy = false; C.stream = '';
  const sec = (performance.now() - t0) / 1000;
  const toks = stats?.tokensPerSec ?? Math.max(1, Math.round(full.length / 4 / Math.max(0.5, sec)));
  if (full || stopped) cur.messages.push({ r: 'a', t: full + (stopped ? ' …' : ''), m: model, tool: stats?.used ?? C.used ?? [], st: `${stopped ? 'Stoppet · ' : ''}${Math.round(toks)} tok/s · ${((stats?.ms ?? sec * 1000) / 1000).toFixed(1).replace('.', ',')} s` });
  if (err) cur.messages.push({ r: 'a', t: err, m: model, tool: [], st: 'Feil', err: true });
  cur.up = nowMs();
  // Oppdater historikken: ny samtale øverst. Uten server lagres den på enheten.
  if (!cur.id) cur.id = `l${Date.now()}`;
  const i = C.list.chats.findIndex((x) => x.id === cur.id);
  const row = { ...cur, messages: C.srv ? null : cur.messages };
  if (i >= 0) C.list.chats[i] = { ...C.list.chats[i], ...row }; else C.list.chats.unshift(row);
  if (C.srv) C.list.chats = C.list.chats.map((x) => (x.id === cur.id ? { ...x, messages: null } : x));
  saveLocal();
  if (stopped) haptic('tap'); else if (!err) haptic('ok');
  C.bottom = true; draw();
}
function stopRun() { C.ctrl?.abort(); }
// Under strømmingen oppdateres bare svarblokken (ikke hele siden), så skrivefeltet og rullingen står i ro.
function paintStream() {
  const el = document.getElementById('ch27-stream');
  if (!el) return;
  el.innerHTML = md(C.stream);
  const th = document.getElementById('ch27-think'); if (th) th.remove();
  const sc = document.getElementById('ch27-sc');
  if (sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140) sc.scrollTop = sc.scrollHeight;
}

/* ---------- Markdown (avsnitt, lister, kode, fet) ---------- */
const inl = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
export function md(t) {
  const out = []; let code = null;
  for (const l of String(t ?? '').split('\n')) {
    if (/^```/.test(l)) { if (code) { out.push(`<pre class="ch27-code">${esc(code.join('\n'))}</pre>`); code = null; } else code = []; continue; }
    if (code) { code.push(l); continue; }
    if (!l.trim()) continue;
    const li = l.match(/^\s*[-*•]\s+(.*)/), nu = l.match(/^\s*(\d+)[.)]\s+(.*)/), hd = l.match(/^#+\s+(.*)/);
    if (li || nu) out.push(`<div class="ch27-li"><span>${li ? '•' : `${nu[1]}.`}</span><span>${inl(li ? li[1] : nu[2])}</span></div>`);
    else if (hd) out.push(`<p class="ch27-hd">${inl(hd[1])}</p>`);
    else out.push(`<p>${inl(l)}</p>`);
  }
  if (code) out.push(`<pre class="ch27-code">${esc(code.join('\n'))}</pre>`);
  return out.join('');
}

/* ---------- Tale ---------- */
let rec = null, recT = null;
async function mic() {
  if (C.rec) { try { rec?.stop(); } catch {} C.rec = false; clearTimeout(recT); draw(); return; }
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (R) {
    try {
      const r = new R(); rec = r; r.lang = 'nb-NO'; r.interimResults = true; r.continuous = false;
      r.onresult = (e) => { C.inp = [...e.results].map((x) => x[0].transcript).join(''); const ta = document.getElementById('ch27-in'); if (ta) ta.value = C.inp; };
      r.onend = () => { C.rec = false; draw(); };
      r.onerror = () => { C.rec = false; draw(); };
      r.start(); C.rec = true; draw(); recT = setTimeout(() => { try { r.stop(); } catch {} }, 20000); return;
    } catch { /* prøv opptak under */ }
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Talegjenkjenning støttes ikke her'); return; }
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(st), parts = [];
    rec = mr; mr.ondataavailable = (e) => parts.push(e.data);
    mr.onstop = async () => {
      st.getTracks().forEach((x) => x.stop()); C.rec = false; draw();
      const fd = new FormData(); fd.append('file', new Blob(parts, { type: mr.mimeType || 'audio/webm' }), 'tale.webm');
      try { const r = await fetch('/api/chat/transcribe', { method: 'POST', body: fd }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error(r.status === 501 || r.status === 404 ? 'Tale krever Open WebUI på serveren' : j?.error || 'Fikk ikke tolket talen'); C.inp = `${C.inp ? `${C.inp} ` : ''}${j?.text ?? ''}`; draw(); document.getElementById('ch27-in')?.focus({ preventScroll: true }); }
      catch (e) { toast(e.message); }
    };
    mr.start(); C.rec = true; draw(); recT = setTimeout(() => { try { mr.stop(); } catch {} }, 30000);
  } catch { toast('Fikk ikke tilgang til mikrofonen'); }
}
function speak(key, text) {
  const S = window.speechSynthesis; if (!S) { toast('Opplesning støttes ikke her'); return; }
  if (C.spk === key) { S.cancel(); C.spk = null; draw(); return; }
  S.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\*\*|`|#/g, '')); u.lang = 'nb-NO';
  const v = S.getVoices().find((x) => /^nb|^no/i.test(x.lang)); if (v) u.voice = v;
  u.onend = () => { if (C.spk === key) { C.spk = null; draw(); } };
  C.spk = key; S.speak(u); draw();
}

/* ---------- Vedlegg ---------- */
const b64 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = no; r.readAsDataURL(f); });
async function addFiles(files, kind) {
  C.sh = null;
  for (const f of files) {
    if (kind === 'img') { try { C.att.push({ name: f.name || 'bilde.jpg', kind: 'img', data: await b64(f) }); } catch {} continue; }
    const fd = new FormData(); fd.append('file', f, f.name);
    try { const r = await fetch('/api/chat/files', { method: 'POST', body: fd }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error(r.status === 404 ? 'Vedlegg krever nyere server' : j?.error || 'Opplastingen feilet'); C.att.push({ name: j.name ?? f.name, kind: 'file', id: j.id }); }
    catch (e) { toast(e.message); }
  }
  draw();
}
async function kbLoad() {
  try { const r = await hlApi('/chat/knowledge'); C.kb = (Array.isArray(r) ? r : r?.items ?? r?.documents ?? []).map((d) => ({ id: d.id, name: d.name ?? d.title ?? d.filename, sub: d.sub ?? [d.type, d.pages ? `${d.pages} sider` : '', d.size ? `${Math.max(1, Math.round(d.size / 1024))} kB` : ''].filter(Boolean).join(' · ') })); }
  catch (e) { C.kb = []; C.kbErr = e.status === 404 ? 'Kunnskapsbasen krever nyere server' : e.message; }
  draw();
}

/* ---------- Tegning ---------- */
const svg = (d, s = 20, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const IC = {
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', menu: 'M4 7h16M4 12h16M4 17h10', tune: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  chip: 'M5 5h14v14H5zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3', doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5', moon: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1', regen: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5', spk: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7',
  plus: 'M12 5v14M5 12h14', web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3', up: 'M12 19V5M5 12l7-7 7 7', folder: 'M3 6h6l2 2h10v11H3z', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6',
};
const wide = () => innerWidth >= 600;
const pad2 = (n) => String(n).padStart(2, '0');
function rel(t) {
  const sod = new Date(new Date().toDateString()).getTime(), d = new Date(t);
  return t >= sod ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : t >= sod - 864e5 ? 'i går' : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}
function groups() {
  const chats = [...(C.list?.chats ?? [])].sort((a, b) => b.up - a.up), q = C.q.trim().toLowerCase();
  const row = (x) => `<div class="ch27-row${x.id === C.cur?.id ? ' on' : ''}" data-c27="open" data-id="${esc(x.id)}" role="button" tabindex="0"><span class="m-grow"><b>${esc(x.title)}</b><span>${esc(`${x.model ? mLbl(x.model) : 'Chat'} · ${rel(x.up)}`)}</span></span><button class="ch27-dots" data-c27="menu" data-id="${esc(x.id)}" aria-label="Valg for samtalen">⋯</button></div>`;
  const G = (t, L0) => `<div class="ch27-gl">${esc(t)}</div>${L0.map(row).join('')}`;
  if (q) { const L0 = chats.filter((x) => `${x.title} ${(x.messages ?? []).map((y) => y.t).join(' ')}`.toLowerCase().includes(q)); return G(`TREFF · ${L0.length}`, L0); }
  const sod = new Date(new Date().toDateString()).getTime(), rest = chats.filter((x) => !x.pinned && !x.folderId);
  const fold = (C.list?.folders ?? []).map((f) => {
    const L0 = chats.filter((x) => !x.pinned && x.folderId === f.id), open = (L.open[f.id] ?? f.open) !== false;
    return `<button class="ch27-fold" data-c27="fold" data-id="${esc(f.id)}" aria-expanded="${open}"><span class="ar">${open ? '▾' : '▸'}</span>${svg(IC.folder, 16)}<span>${esc(f.name)} · ${L0.length}</span></button>${open ? L0.map(row).join('') : ''}`;
  }).join('');
  const pins = chats.filter((x) => x.pinned);
  return [pins.length ? G('FESTET', pins) : '', fold ? `<div class="ch27-gl">MAPPER</div>${fold}` : '',
    ...[['I DAG', rest.filter((x) => x.up >= sod)], ['I GÅR', rest.filter((x) => x.up < sod && x.up >= sod - 864e5)], ['SISTE 7 DAGER', rest.filter((x) => x.up < sod - 864e5 && x.up >= sod - 7 * 864e5)], ['ELDRE', rest.filter((x) => x.up < sod - 7 * 864e5)]].filter(([, L0]) => L0.length).map(([t, L0]) => G(t, L0))].join('');
}
const sf = (id, val, ph) => `<div class="ch27-sf p27-sf${val ? ' has' : ''}"><span class="p27-ic" aria-hidden="true">${svg(IC.search, 17, 2.2)}</span><button type="button" class="p27-x" data-p27clr aria-label="Tøm søket"><span>${svg('M6 6l12 12M18 6L6 18', 11, 3.2)}</span></button><input id="${id}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" type="search" enterkeyhint="search"></div>`;
function side(drawer) {
  const nLoc = models().filter((x) => x.kind === 'lokal' && x.installed !== false).length, nSky = models().filter((x) => x.kind === 'sky').length;
  return `<aside class="ch27-side${drawer ? ' drawer' : ''}"><div class="ch27-sh">${wide() ? '<button class="ch27-ib back" data-c27="exit" aria-label="Tilbake">‹</button>' : ''}<b class="ch27-h">Chat</b><button class="ch27-ib" data-c27="new" aria-label="Ny chat">${svg(IC.pen)}</button></div>
    <div class="ch27-sp">${sf('ch27-hq', C.q, 'Søk i samtaler')}</div>
    <div class="ch27-hist" id="ch27-hist">${C.list === null ? '<div class="m-spin"></div>' : groups() || '<div class="ch27-none">Ingen samtaler ennå.</div>'}</div>
    <div class="ch27-sfoot"><button data-c27="mods">${svg(IC.chip, 18)}<b>Modeller</b><span>${nLoc} lokale · ${nSky} i skyen</span></button><button data-c27="kb">${svg(IC.doc, 18)}<b>Kunnskapsbase</b><span>${C.kb ? `${C.kb.length} dokumenter` : '›'}</span></button><button data-c27="theme">${svg(IC.moon, 18)}<b>Tema</b><span>${theme() === 'noytral' ? 'Nøytral' : 'Papir'}</span></button>
      <span class="ch27-note">${C.srv === false ? 'Lagret på denne enheten (serveren har ikke Chat ennå).' : 'Historikken synkes mellom mobil og web.'}</span></div></aside>`;
}
function msgView(x, i, lastA) {
  const key = `${C.cur?.id}:${i}`;
  if (x.r === 'u') {
    const ed = C.ed && C.ed.i === i;
    return `<div class="ch27-u">${x.att?.length ? `<div class="ch27-atts">${x.att.map((n) => `<span># ${esc(n)}</span>`).join('')}</div>` : ''}
      ${ed ? `<div class="ch27-edit"><textarea id="ch27-ed" rows="3">${esc(C.ed.v)}</textarea><div><button data-c27="edx">Avbryt</button><button class="ink" data-c27="eds" data-i="${i}">Lagre og send</button></div></div>`
        : `<div class="ch27-ub">${esc(x.t)}</div><div class="ch27-acts r"><button data-c27="edit" data-i="${i}">Rediger</button><button data-c27="copy" data-i="${i}">${C.cop === key ? 'Kopiert' : 'Kopier'}</button></div>`}</div>`;
  }
  return `<div class="ch27-a"><div class="ch27-ah"><span>✦ ${esc((x.m ? mLbl(x.m) : 'AI').toUpperCase())}</span>${(x.tool ?? []).map((n) => `<em>Brukte ${esc(n)}</em>`).join('')}</div>
    <div class="ch27-md${x.err ? ' err' : ''}">${md(x.t)}</div>
    <div class="ch27-acts"><button data-c27="copy" data-i="${i}">${svg(IC.copy, 15)}${C.cop === key ? 'Kopiert' : 'Kopier'}</button>${i === lastA && !C.busy ? `<button data-c27="regen" data-i="${i}">${svg(IC.regen, 15)}Nytt svar</button>` : ''}<button data-c27="speak" data-i="${i}">${svg(IC.spk, 15)}${C.spk === key ? 'Stopp' : 'Les høyt'}</button><span class="ch27-st">${esc(x.st || '')}</span></div></div>`;
}
const chip = (on) => (on ? ' on' : '');
function sheetWrap(inner, cls = '') { return `<div class="ch27-shbg" data-c27="close"><div class="ch27-sheet ${cls}" data-c27stop role="dialog">${inner}</div></div>`; }
const shHead = (t, sub = '') => `<div class="ch27-shh"><span class="m-grow"><b class="ch27-h">${esc(t)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span><button class="ch27-cx" data-c27="close" aria-label="Lukk">✕</button></div>`;
function sheets() {
  const s = C.sh, model = C.cur?.model || curModel(), P = C.cur?.settings ?? { ...DEF, ...(L.def ?? {}) };
  if (s === 'model') {
    const r = (x) => `<button class="ch27-mr" data-c27="pick" data-id="${esc(x.id)}"><span class="m-grow"><span class="ch27-mn"><b>${esc(x.kind === 'sky' ? x.name : x.id)}</b><em class="${x.kind === 'sky' ? 'sky' : 'loc'}">${x.kind === 'sky' ? 'SKY' : 'LOKAL'}</em></span><span>${esc(x.kind === 'sky' ? [x.size || x.provider, x.sub].filter(Boolean).join(' · ') : [x.name !== x.id ? x.name : '', x.size, x.sub].filter(Boolean).join(' · '))}</span></span><b class="ch27-ck">${x.id === model ? '✓' : ''}</b></button>`;
    const loc = models().filter((x) => x.kind === 'lokal' && x.installed !== false), sky = models().filter((x) => x.kind === 'sky');
    return sheetWrap(`${shHead('Velg modell')}${C.mErr ? `<span class="ch27-mut">${esc(C.mErr)} · viser standardlisten.</span>` : ''}<div class="ch27-gl">LOKALT · OLLAMA PÅ HJEMMESERVEREN</div><div class="ch27-box">${loc.map(r).join('') || '<div class="ch27-none">Ingen lokale modeller</div>'}</div>
      <div class="ch27-gl">SKY</div><div class="ch27-box">${sky.map(r).join('') || '<div class="ch27-none">Ingen sky-modeller (legg inn Gemini- eller Groq-nøkkel)</div>'}</div>
      <span class="ch27-mut">Sky-modeller merkes SKY. Før dine data eller vedlegg sendes dit, får du spørsmål om det.</span><button class="ch27-ob" data-c27="mods">Administrer modeller ›</button>`);
  }
  if (s === 'params') {
    return sheetWrap(`${shHead('Samtaleinnstillinger', C.cur ? 'Gjelder denne samtalen' : 'Gjelder nye samtaler')}
      <div class="ch27-gl">PERSONA</div><div class="ch27-chips">${PERS.map(([k, n]) => `<button class="ch27-pc${chip((P.persona || 'std') === k)}" data-c27="per" data-k="${k}">${n}</button>`).join('')}</div>
      <div class="ch27-gl">SYSTEMPROMPT</div><textarea class="ch27-ta" id="ch27-sys" rows="3" placeholder="F.eks. «Svar alltid med maks tre setninger.»">${esc(P.system || '')}</textarea>
      <label class="ch27-rng"><span><b>Temperatur</b><em id="ch27-tv">${String(P.temperature).replace('.', ',')}</em></span><input type="range" id="ch27-temp" min="0" max="2" step="0.1" value="${P.temperature}"><small>Lav gir faste svar, høy gir mer variasjon.</small></label>
      <label class="ch27-rng"><span><b>Top P</b><em id="ch27-pv">${String(P.topP).replace('.', ',')}</em></span><input type="range" id="ch27-topp" min="0.1" max="1" step="0.05" value="${P.topP}"></label>
      <div class="ch27-gl">KONTEKSTLENGDE</div><div class="ch27-seg">${[4096, 8192, 16384, 32768].map((n) => `<button class="${(P.numCtx || 8192) === n ? 'on' : ''} mono" data-c27="ctx" data-n="${n}">${n / 1024}k</button>`).join('')}</div>
      <div class="ch27-gl">TEMA</div><div class="ch27-seg">${[['papir', 'Papir'], ['noytral', 'Nøytral']].map(([k, n]) => `<button class="${theme() === k ? 'on' : ''}" data-c27="th" data-k="${k}">${n}</button>`).join('')}</div>
      <button class="ch27-pb" data-c27="close">Ferdig</button>`);
  }
  if (s === 'menu') {
    const c = C.list?.chats.find((x) => x.id === C.mn); if (!c) return '';
    return sheetWrap(`${shHead(c.title)}<form class="ch27-fr" data-c27f="rn"><input id="ch27-rn" value="${esc(C.rn)}" aria-label="Navn på samtalen"><button type="submit" class="ink">Gi nytt navn</button></form>
      <div class="ch27-box"><button class="ch27-lr" data-c27="pin">${c.pinned ? 'Løsne' : 'Fest øverst'}</button><button class="ch27-lr" data-c27="exp">Eksporter som Markdown</button><button class="ch27-lr" data-c27="share">Del lenke</button></div>
      <div class="ch27-gl">FLYTT TIL MAPPE</div><div class="ch27-chips">${[[null, 'Ingen mappe'], ...(C.list.folders ?? []).map((f) => [f.id, f.name])].map(([id, n]) => `<button class="ch27-pc${chip((c.folderId ?? null) === id)}" data-c27="mv" data-id="${esc(id ?? '')}">${esc(n)}</button>`).join('')}</div>
      <form class="ch27-fr" data-c27f="nf"><input id="ch27-nf" value="${esc(C.nf)}" placeholder="Ny mappe"><button type="submit">+ Lag og flytt</button></form>
      <button class="ch27-db" data-c27="del">${C.del ? 'Trykk igjen for å slette' : 'Slett samtalen'}</button>`);
  }
  if (s === 'guard' && C.guard) {
    const G = C.guard, loc = firstLocal();
    return sheetWrap(`${shHead(`Sende til ${G.model}?`)}<span class="ch27-p">Dette er en sky-modell. Dette forlater hjemmeserveren hvis du sender:</span>
      <div class="ch27-box">${G.leaves.map((n) => `<div class="ch27-lv"><span>↗</span>${esc(n)}</div>`).join('')}</div>
      <button class="ch27-rem" data-c27="grem" role="checkbox" aria-checked="${C.rem}"><span>${C.rem ? '☑' : '☐'}</span>Ikke spør igjen i denne samtalen</button>
      <button class="ch27-pb" data-c27="gsend">Send</button>${G.hasData ? '<button class="ch27-ob" data-c27="gnodata">Send uten mine data</button>' : ''}<button class="ch27-ob" data-c27="glocal">Bruk lokal modell (${esc(loc)})</button>`);
  }
  if (s === 'plus') {
    return sheetWrap(`${shHead('Legg ved')}<div class="ch27-box">
      <label class="ch27-lr ic"><input class="m-file" type="file" accept="image/*" multiple data-c27file="img"><span class="i">▣</span><span class="m-grow"><span>Bilde eller kamera</span><small>Leses av en bildemodell, f.eks. qwen2.5vl</small></span></label>
      <label class="ch27-lr ic"><input class="m-file" type="file" multiple data-c27file="file"><span class="i">⎙</span><span class="m-grow"><span>Fil</span><small>PDF, Word, tekst eller CSV</small></span></label>
      <button class="ch27-lr ic" data-c27="kb"><span class="i">#</span><span class="m-grow"><span>Fra kunnskapsbasen</span><small>${C.kb ? `${C.kb.length} dokumenter` : 'Velg dokumenter'}</small></span><span>›</span></button></div>`);
  }
  if (s === 'kb') {
    const sel = C.att.filter((a) => a.kind === 'doc').map((a) => a.id);
    return sheetWrap(`${shHead('Kunnskapsbase', `Velg dokumenter chatten skal lese · ${sel.length} valgt`)}${C.kb === null ? '<div class="m-spin"></div>' : `<div class="ch27-box">${C.kb.map((d) => `<button class="ch27-lr ic" data-c27="kbt" data-id="${esc(d.id)}"><span class="ch27-cb${sel.includes(d.id) ? ' on' : ''}">✓</span><span class="m-grow"><span class="m-ell">${esc(d.name)}</span><small>${esc(d.sub || '')}</small></span></button>`).join('') || `<div class="ch27-none">${esc(C.kbErr || 'Ingen dokumenter ennå.')}</div>`}</div>`}
      <label class="ch27-up"><input class="m-file" type="file" multiple data-c27file="kb">+ Last opp til kunnskapsbasen</label><button class="ch27-pb" data-c27="close">Ferdig</button>`);
  }
  if (s === 'mods') {
    const inst = models().filter((x) => x.kind === 'lokal' && x.installed !== false), have = new Set(inst.map((x) => x.id));
    const pulls = Object.entries(C.pulls), lib = LIB.filter(([id]) => !have.has(id));
    return sheetWrap(`${shHead('Modeller', C.mErr ? C.mErr : `Ollama · ${inst.length} installert`)}
      <div class="ch27-gl">INSTALLERT</div><div class="ch27-box">${inst.map((x) => `<div class="ch27-mi"><span class="m-grow"><b>${esc(x.id)}</b><span>${esc([x.name !== x.id ? x.name : '', x.size, x.sub].filter(Boolean).join(' · '))}</span></span><button class="ch27-del${C.mdel === x.id ? ' on' : ''}" data-c27="mdel" data-id="${esc(x.id)}">${C.mdel === x.id ? 'Bekreft' : 'Slett'}</button></div>`).join('') || '<div class="ch27-none">Ingen</div>'}
        ${pulls.filter(([id]) => !LIB.some(([k]) => k === id)).map(([id, p]) => `<div class="ch27-pr"><div><b>${esc(id)}</b><span>${esc(p.l)}</span></div><i><b style="width:${p.pct}%"></b></i></div>`).join('')}</div>
      <div class="ch27-gl">HENT FRA OLLAMA.COM</div><div class="ch27-box">${lib.map(([id, n, sz]) => { const p = C.pulls[id]; return `<div class="ch27-pr"><div class="ch27-mi"><span class="m-grow"><b>${esc(id)}</b><span>${esc(`${n} · ${sz}`)}</span></span>${p ? `<span class="ch27-pct">${esc(p.l)}</span>` : `<button class="ch27-dl" data-c27="pull" data-id="${esc(id)}">Last ned</button>`}</div>${p ? `<i><b style="width:${p.pct}%"></b></i>` : ''}</div>`; }).join('')}</div>
      <form class="ch27-fr" data-c27f="pull"><input id="ch27-pn" class="mono" value="${esc(C.pn)}" placeholder="Modellnavn, f.eks. llama3.2:1b" autocomplete="off" autocapitalize="off"><button type="submit" class="ink">Hent</button></form>`);
  }
  return '';
}
export function chatView() {
  if (C.list === null && !C.loading) { C.loading = true; chatLoad().then(() => { C.loading = false; draw(); }).catch(() => { C.loading = false; }); }
  const model = C.cur?.model || curModel(), M = mOf(model), sky = M.kind === 'sky', msgs = C.cur?.messages ?? [], lastA = msgs.map((x) => x.r).lastIndexOf('a');
  const empty = !msgs.length && !C.busy, w = wide(), th = theme();
  const dOn = C.data && dataOK();
  const body = C.cur && C.cur.messages === null ? '<div class="m-spin"></div>' : empty ? `<div class="ch27-empty"><div><span class="ch27-ml">${esc((sky ? `${M.name} · ${M.size || M.provider}` : `${M.id} · lokalt på hjemmeserveren`).toUpperCase())}</span><span class="ch27-hi">Hva kan jeg hjelpe med?</span></div>
      <div class="ch27-chips sc">${PERS.map(([k, n]) => `<button class="ch27-pc${chip(((C.cur?.settings ?? L.def ?? DEF).persona || 'std') === k)}" data-c27="per" data-k="${k}">${n}</button>`).join('')}</div>
      <div class="ch27-sug">${SUGG.map(([t, s2, x], i) => `<button data-c27="sugg" data-i="${i}"><b>${esc(t)}</b>${s2 ? `<span>${esc(s2)}</span>` : ''}</button>`).join('')}</div></div>`
    : `${msgs.map((x, i) => msgView(x, i, lastA)).join('')}${C.busy ? `<div class="ch27-a"><div class="ch27-ah"><span>✦ ${esc(mLbl(model).toUpperCase())}</span>${(C.used ?? []).map((n) => `<em>Leser ${esc(n)}</em>`).join('')}</div>${C.stream ? '' : '<span class="ch27-think" id="ch27-think">Tenker …</span>'}<div class="ch27-md" id="ch27-stream">${md(C.stream)}</div></div>` : ''}`;
  const rows = Math.min(6, Math.max(1, C.inp.split('\n').length));
  return `<div class="ch27 ${th}${w ? ' wide' : ''}" data-c27root>
    ${w ? side(false) : ''}
    <div class="ch27-main"><div class="ch27-top">${w ? '' : `<button class="ch27-ib back" data-c27="exit" aria-label="Tilbake">‹</button><button class="ch27-ib" data-c27="drawer" aria-label="Historikk">${svg(IC.menu, 21)}</button>`}
      <button class="ch27-model" data-c27="model"><b>${esc(sky ? M.name : M.id)}</b><em class="${sky ? 'sky' : 'loc'}">${sky ? 'SKY' : 'LOKAL'}</em><span>▼</span></button><span class="m-grow"></span>
      <button class="ch27-ib" data-c27="params" aria-label="Samtaleinnstillinger">${svg(IC.tune)}</button>${w ? '' : `<button class="ch27-ib" data-c27="new" aria-label="Ny chat">${svg(IC.pen)}</button>`}</div>
    <div class="ch27-sc" id="ch27-sc"><div class="ch27-msgs">${body}</div></div>
    <div class="ch27-dock">${C.toast ? `<div class="ch27-toast" role="status">${esc(C.toast)}</div>` : ''}<div class="ch27-comp">
      ${C.att.length ? `<div class="ch27-attl">${C.att.map((a, i) => `<span><em>${a.kind === 'img' ? '▣' : a.kind === 'doc' ? '#' : '⎙'}</em><span class="m-ell">${esc(a.name)}</span><button data-c27="arm" data-i="${i}" aria-label="Fjern vedlegg">✕</button></span>`).join('')}</div>` : ''}
      ${C.rec ? `<div class="ch27-rec"><i></i><span class="m-grow">Lytter … snakk nå</span><span class="ch27-wave">${'<b></b>'.repeat(7)}</span></div>` : `<textarea id="ch27-in" rows="${rows}" placeholder="Spør ${esc(sky ? M.name : M.id)} …" enterkeyhint="send" aria-label="Melding">${esc(C.inp)}</textarea>`}
      <div class="ch27-tools"><button class="ch27-plus" data-c27="plus" aria-label="Legg ved">${svg(IC.plus, 18, 2.2)}</button><button class="ch27-tg${chip(C.web)}" data-c27="web" aria-pressed="${C.web}">${svg(IC.web, 15)}Nettsøk</button><button class="ch27-tg${chip(dOn)}" data-c27="data" aria-pressed="${dOn}">${svg(IC.db, 15)}Mine data</button><span class="m-grow"></span>
        <button class="ch27-mic${C.rec ? ' on' : ''}" data-c27="mic" aria-label="Snakk">${svg(IC.mic, 19)}</button>${C.busy ? '<button class="ch27-send" data-c27="stop" aria-label="Stopp"><i class="sq"></i></button>' : `<button class="ch27-send${C.inp.trim() ? '' : ' dim'}" data-c27="send" aria-label="Send" id="ch27-send">${svg(IC.up, 18, 2.6)}</button>`}</div></div>
      <div class="ch27-foot">${sky ? `Sky-modell: meldingen sendes til ${M.provider === 'groq' || /groq/i.test(model) ? 'Groq' : 'Google'}.` : 'Kjører lokalt på hjemmeserveren. Ingenting sendes ut.'}</div></div></div>
    ${!w && C.drawer ? `<div class="ch27-dbg" data-c27="drawerx"></div>${side(true)}` : ''}
    ${sheets()}</div>`;
}

/* ---------- Etter tegning: rulleposisjon ---------- */
export function chatAfterDraw() {
  if (m.screen !== 'chat') return;
  const root = document.querySelector('.ch27'); if (root) root.scrollTop = 0;
  const sc = document.getElementById('ch27-sc');
  if (sc) { if (C.bottom) { sc.scrollTop = sc.scrollHeight; C.bottom = false; } else sc.scrollTop = C.sc; }
  const h = document.getElementById('ch27-hist'); if (h && C.hs) h.scrollTop = C.hs;
}
addEventListener('scroll', (e) => { const t = e.target; if (t?.id === 'ch27-sc') C.sc = t.scrollTop; else if (t?.id === 'ch27-hist') C.hs = t.scrollTop; }, { capture: true, passive: true });

/** Åpne Chat (fra ✦ AI på Hjem, Mer eller fanelinja). Med tekst startes en ny samtale med den. */
export function openChat(prompt = '') {
  if (m.screen !== 'chat') C.from = m.screen;
  C.cur = null; C.inp = ''; C.att = []; C.sh = null; C.drawer = false;
  if (location.hash !== '#/chat') location.hash = '#/chat';
  const p = String(prompt).trim();
  if (p) { const go = () => (C.list ? send(p) : chatLoad().then(() => send(p))); setTimeout(go, 60); }
}
export function chatEnter(prev) { if (prev && prev !== 'chat') C.from = prev; }
export function chatLeave() { C.sh = null; C.drawer = false; try { window.speechSynthesis?.cancel(); } catch {} C.spk = null; }

/* ---------- Hendelser ---------- */
export function chatInput(e, t) {
  if (m.screen !== 'chat') return false;
  if (t.id === 'ch27-in') {
    C.inp = t.value; t.rows = Math.min(6, Math.max(1, t.value.split('\n').length));
    document.getElementById('ch27-send')?.classList.toggle('dim', !t.value.trim()); return true;
  }
  if (t.id === 'ch27-hq') { C.q = t.value; const h = document.getElementById('ch27-hist'); if (h) h.innerHTML = groups() || '<div class="ch27-none">Ingen samtaler ennå.</div>'; return true; }
  if (t.id === 'ch27-ed') { if (C.ed) C.ed.v = t.value; return true; }
  if (t.id === 'ch27-rn') { C.rn = t.value; return true; }
  if (t.id === 'ch27-nf') { C.nf = t.value; return true; }
  if (t.id === 'ch27-pn') { C.pn = t.value; return true; }
  if (t.id === 'ch27-sys') { setP({ system: t.value }, false); return true; }
  if (t.id === 'ch27-temp') { setP({ temperature: +t.value }, false); const v = document.getElementById('ch27-tv'); if (v) v.textContent = String(t.value).replace('.', ','); return true; }
  if (t.id === 'ch27-topp') { setP({ topP: +t.value }, false); const v = document.getElementById('ch27-pv'); if (v) v.textContent = String(t.value).replace('.', ','); return true; }
  return false;
}
let pT = null;
function setP(x, redraw = true) {
  if (C.cur) { C.cur.settings = { ...C.cur.settings, ...x }; const id = C.cur.id; if (id) { clearTimeout(pT); pT = setTimeout(() => patchChat(id, { settings: C.cur?.settings }), 500); } }
  else { L.def = { ...DEF, ...(L.def ?? {}), ...x }; keep(); }
  if (redraw) draw();
}
export function chatKey(e) {
  if (m.screen !== 'chat') return;
  if (e.target?.id === 'ch27-in' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(e.target.value); }
  else if (e.key === 'Escape' && (C.sh || C.drawer)) { C.sh = null; C.drawer = false; draw(); }
}
export async function chatChange(e, t) {
  if (m.screen !== 'chat' || !t.matches?.('[data-c27file]')) return false;
  const files = [...(t.files ?? [])], k = t.dataset.c27file; t.value = '';
  if (!files.length) return true;
  if (k === 'kb') {
    for (const f of files) { const fd = new FormData(); fd.append('file', f, f.name); fd.append('knowledge', '1'); const r = await fetch('/api/chat/files?knowledge=1', { method: 'POST', body: fd }).catch(() => null); if (!r?.ok) { toast(r?.status === 404 ? 'Kunnskapsbasen krever nyere server' : 'Opplastingen feilet'); return true; } }
    toast('Lagt i kunnskapsbasen'); C.kb = null; await kbLoad(); return true;
  }
  await addFiles(files, k === 'img' ? 'img' : 'file');
  return true;
}
export async function chatSubmit(e, t) {
  if (m.screen !== 'chat' || !t.matches?.('[data-c27f]')) return false;
  e.preventDefault();
  const k = t.dataset.c27f, c = C.list?.chats.find((x) => x.id === C.mn);
  if (k === 'rn' && c) { const v = C.rn.trim(); if (v) await patchChat(c.id, { title: v }); C.sh = null; }
  else if (k === 'nf' && c) { const v = C.nf.trim(); if (!v) return true; const f = await addFolder(v); if (f) await patchChat(c.id, { folderId: f.id }); C.nf = ''; }
  else if (k === 'pull') { const v = C.pn.trim(); if (v) { C.pn = ''; pull(v); } }
  draw(); return true;
}
async function pull(name) {
  C.pulls[name] = { pct: 0, l: '0 %' }; draw();
  try {
    const res = await fetch('/api/chat/models/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => null); throw new Error(res.status === 404 ? 'Henting krever nyere server' : res.status === 403 ? 'Bare administrator kan hente modeller' : j?.error || `Feil ${res.status}`); }
    const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      for (const ln of buf.split('\n').slice(0, -1)) {
        const s = ln.replace(/^data:\s*/, '').trim(); if (!s || !s.startsWith('{')) continue;
        try { const d = JSON.parse(s); if (d.error) throw new Error(d.error); const pct = d.total ? Math.round((d.completed / d.total) * 100) : C.pulls[name].pct; C.pulls[name] = { pct, l: d.total ? `${pct} %` : d.status || '…' }; } catch (err) { if (err.message && !/JSON/.test(err.message)) throw err; }
      }
      buf = buf.slice(buf.lastIndexOf('\n') + 1); draw();
    }
    delete C.pulls[name]; await loadModels(); toast(`${name} er lastet ned`);
  } catch (e) { delete C.pulls[name]; toast(e.message); }
}
const msgOf = (i) => C.cur?.messages?.[+i];
export async function chatBind(e, t) {
  if (m.screen !== 'chat' || e.type !== 'click') return false;
  if (t.closest?.('[data-p27clr]') && t.closest('.ch27-sf')) { C.q = ''; const i = document.getElementById('ch27-hq'); if (i) { i.value = ''; i.focus({ preventScroll: true }); } i?.parentElement?.classList.remove('has'); const h = document.getElementById('ch27-hist'); if (h) h.innerHTML = groups(); return true; }
  const x = t.closest?.('[data-c27]');
  if (!x) { if (t.closest?.('[data-c27stop]')) return true; return !!t.closest?.('[data-c27root]') && !t.closest('a,label,input,textarea'); }
  const a = x.dataset.c27;
  // Arkene lukkes ved trykk på bakgrunnen, men ikke ved trykk inne i arket.
  if (a === 'close' && x !== t && t.closest('[data-c27stop]') && !t.closest('[data-c27="close"].ch27-cx, .ch27-pb[data-c27="close"]')) return true;
  e.preventDefault();
  const c = C.list?.chats.find((y) => y.id === (x.dataset.id ?? C.mn));
  switch (a) {
    case 'exit': chatLeave(); location.hash = `#/${C.from && C.from !== 'chat' ? C.from : 'hl'}`; return true;
    case 'drawer': C.drawer = true; break;
    case 'drawerx': C.drawer = false; break;
    case 'new': C.cur = null; C.drawer = false; C.inp = ''; C.att = []; C.ed = null; draw(); document.getElementById('ch27-in')?.focus({ preventScroll: true }); return true;
    case 'open': await openConv(x.dataset.id); return true;
    case 'menu': C.mn = x.dataset.id; C.rn = c?.title ?? ''; C.nf = ''; C.del = false; C.sh = 'menu'; break;
    case 'fold': togFolder(x.dataset.id); break;
    case 'model': C.sh = 'model'; if (!C.models) loadModels().then(draw); break;
    case 'params': C.sh = 'params'; break;
    case 'mods': C.sh = 'mods'; C.drawer = false; C.mdel = null; loadModels().then(draw); break;
    case 'kb': C.sh = 'kb'; C.drawer = false; if (!C.kb) kbLoad(); break;
    case 'plus': C.sh = 'plus'; if (!C.kb) kbLoad(); break;
    case 'close': C.sh = null; C.del = false; C.mdel = null; break;
    case 'theme': case 'th': { const v = a === 'th' ? x.dataset.k : theme() === 'noytral' ? 'papir' : 'noytral'; L.th = v; keep(); setPers('chat', 'chat_theme', v); haptic('tab'); break; }
    case 'pick': { const id = x.dataset.id; if (C.cur) { C.cur.model = id; if (C.cur.id) patchChat(C.cur.id, { model: id }); } L.model = id; keep(); C.sh = null; haptic('tab'); break; }
    case 'per': { const k = x.dataset.k, p = PERS.find(([y]) => y === k); setP({ persona: k, ...(p?.[2] && !(C.cur?.settings ?? L.def ?? {}).system ? {} : {}) }, false); haptic('tab'); break; }
    case 'ctx': setP({ numCtx: +x.dataset.n }, false); break;
    case 'sugg': { const s = SUGG[+x.dataset.i]; if (s[2] === 'data') { if (dataOK()) C.data = true; } if (s[2] === 'kb' && !C.kb) await kbLoad(); if (s[2] === 'kb' && C.kb?.[0]) C.att.push({ name: C.kb[0].name, kind: 'doc', id: C.kb[0].id }); await send(s[0]); return true; }
    case 'send': { const ta = document.getElementById('ch27-in'); await send(ta ? ta.value : C.inp); return true; }
    case 'stop': stopRun(); return true;
    case 'web': C.web = !C.web; haptic('tab'); break;
    case 'data': if (!dataOK()) { toast('Slått av i Innstillinger → AI og tolkning'); return true; } C.data = !C.data; haptic('tab'); break;
    case 'mic': await mic(); return true;
    case 'arm': C.att.splice(+x.dataset.i, 1); break;
    case 'kbt': { const d = C.kb?.find((y) => String(y.id) === x.dataset.id); if (!d) return true; const i = C.att.findIndex((y) => y.kind === 'doc' && String(y.id) === x.dataset.id); if (i >= 0) C.att.splice(i, 1); else C.att.push({ name: d.name, kind: 'doc', id: d.id }); break; }
    case 'copy': { const ms = msgOf(x.dataset.i); if (!ms) return true; try { await navigator.clipboard.writeText(ms.t); } catch {} C.cop = `${C.cur?.id}:${x.dataset.i}`; draw(); setTimeout(() => { C.cop = null; draw(); }, 1400); return true; }
    case 'speak': { const ms = msgOf(x.dataset.i); if (ms) speak(`${C.cur?.id}:${x.dataset.i}`, ms.t); return true; }
    case 'regen': { const i = +x.dataset.i; C.cur.messages = C.cur.messages.slice(0, i); await run({ editFrom: i }); return true; }
    case 'edit': { const ms = msgOf(x.dataset.i); if (ms) C.ed = { i: +x.dataset.i, v: ms.t }; draw(); document.getElementById('ch27-ed')?.focus({ preventScroll: true }); return true; }
    case 'edx': C.ed = null; break;
    case 'eds': { const i = +x.dataset.i, v = (document.getElementById('ch27-ed')?.value ?? C.ed?.v ?? '').trim(); if (!v) return true; C.cur.messages = [...C.cur.messages.slice(0, i), { ...C.cur.messages[i], t: v }]; C.ed = null; await run({ editFrom: i }); return true; }
    case 'pin': if (c) await patchChat(c.id, { pinned: !c.pinned }); C.sh = null; break;
    case 'exp': if (c) await doExport(c); C.sh = null; break;
    case 'share': if (c) await doShare(c); C.sh = null; break;
    case 'mv': if (c) await patchChat(c.id, { folderId: x.dataset.id || null }); break;
    case 'del': if (!C.del) { C.del = true; break; } if (c) await deleteChat(c.id); C.sh = null; C.del = false; haptic('ok'); break;
    case 'grem': C.rem = !C.rem; break;
    case 'gsend': { const p = C.pend; C.sh = null; await send(p, { ok: true, remember: C.rem }); return true; }
    case 'gnodata': { const p = C.pend; C.sh = null; C.data = false; await send(p, { ok: true, noData: true, remember: C.rem }); return true; }
    case 'glocal': { const p = C.pend, id = firstLocal(); C.sh = null; if (C.cur) C.cur.model = id; else L.model = id; keep(); await send(p, { ok: true }); return true; }
    case 'mdel': { const id = x.dataset.id; if (C.mdel !== id) { C.mdel = id; break; } C.mdel = null; try { await hlApi(`/chat/models/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadModels(); toast(`${id} er slettet`); } catch (err) { toast(err.status === 403 ? 'Bare administrator kan slette modeller' : err.message); } break; }
    case 'pull': pull(x.dataset.id); return true;
    default: return true;
  }
  draw(); return true;
}

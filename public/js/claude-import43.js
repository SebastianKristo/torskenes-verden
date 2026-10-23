// Prompt 43 (claude-code-chat-claude-import.md): importer minne og samtaler fra Claude. Fanen «Importer» i AI-kontroll.
// Fasit: design/Claude Import.dc.html (start → leser → forhåndsvisning → importerer → ferdig, angre).
// Selvstendig modul (ingen import), så AI-kontroll kan laste den dynamisk både på web og i FinansHub/Papir-appen.
//
// Data (SERVER43). ZIP-fila parses på serveren, ikke i nettleseren:
//   POST /api/chat/import/claude  multipart {file: .zip | conversations.json, memory: tekst}  (maks 200 MB)
//        → {importId, conversations, messages, projects, memory:[tekst], range, items:[{id, title, updatedAt, messages, imported}], steps?}
//   POST /api/chat/import/claude/:importId/commit {conversationIds:[], memory:[], skipExisting} → {conversations, memory, skipped}
//   POST /api/chat/import/claude/:importId/undo → {ok}
// Samtalene havner i mappen «Claude» i Chat, minnet per bruker (Chat → ⚙ → Minne) og brukes av Chat og Glimt.
//
// Prompt 45 (claude-code-ai-import-claude-chatgpt-gemini.md): tre kilder – Claude (rettet), ChatGPT og Gemini (Google Takeout).
//   POST /api/ai/import  multipart {file, source, memory} | JSON {uploadId, source, memory} | JSON {sample}  → forhåndsvisning
//   POST /api/ai/import/upload  rå bytes i biter (X-Upload-Id, X-Chunk-Index, X-Chunk-Total, X-File-Name) for store filer
//   POST /api/ai/import/:id/commit · POST /api/ai/import/:id/undo · GET /api/ai/import/:id?q=
//   Feil gir faktisk årsak {error, reason, detail}. Eldre server (404): Claude via /api/chat/import/claude som før.

const MAX = 1024 * 1024 * 1024, MAX_OLD = 200 * 1024 * 1024, CHUNK = 8 * 1024 * 1024, CHUNK_FROM = 40 * 1024 * 1024;
const ST = { src: 'claude', legacy: false, st: 'start', err: '', memTxt: '', q: '', sel: {}, msel: {}, oChats: true, oMem: true, oSkip: true, drag: false, steps: [], file: '', D: null, res: null, pi: 0, pn: 0, busy: false };
let root = null, opts = {};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nb = (n) => (+n || 0).toLocaleString('nb-NO');
const fmtD = (d) => { const x = new Date(d); return Number.isNaN(+x) ? '' : x.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }); };
const mb = (b) => `${(b / 1024 / 1024).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB`;
const memFrom = (txt) => [...new Set(String(txt ?? '').split(/\n+/).map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter((l) => l.length > 3 && l.length < 400))];
const LOGO = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="#d97757" d="M4.7 15.9l4.7-2.6.1-.2-.1-.2h-.2l-.8-.1-2.7-.1-2.3-.1-2.2-.1-.6-.1L0 11.7l.1-.3.5-.3.7.1 1.5.1 2.3.2 1.7.1 2.4.3h.4l.1-.2-.1-.1-.1-.1-2.4-1.6-2.5-1.7-1.3-1-.7-.5-.4-.4-.1-.9.6-.7.8.1.2.1.8.6 1.7 1.3 2.2 1.7.3.3.1-.1v-.1l-.2-.3-1.2-2.2-1.3-2.3-.6-.9-.2-.6c0-.2-.1-.4-.1-.7l.7-1 .4-.1.9.1.4.3.6 1.3.9 2.1 1.5 2.9.4.9.2.8.1.2h.1v-.2l.1-1.6.2-2 .2-2.6.1-.7.3-.8.7-.4.5.2.4.6-.1.4-.2 1.6-.5 2.5-.3 1.7h.2l.2-.2.9-1.2 1.5-1.9.7-.7.8-.8.5-.4h1l.7 1.1-.3 1.1-1 1.3-.8 1.1-1.2 1.6-.7 1.3.1.1h.2l2.7-.6 1.5-.3 1.8-.3.8.4.1.4-.3.8-1.9.5-2.2.4-3.3.8h-.1l.1.1 1.5.1.6.1h1.6l2.9.2.8.5.5.6-.1.5-1.2.6-1.6-.4-3.7-.9-1.3-.3h-.2v.1l1.1 1 1.9 1.7 2.4 2.3.1.6-.3.4-.3-.1-2.1-1.6-.8-.7-1.8-1.5h-.1v.2l.4.6 2.2 3.3.1 1-.2.3-.6.2-.6-.1-1.3-1.8-1.4-2.1-1.1-1.9-.1.1-.7 7.2-.3.4-.7.3-.6-.5-.3-.7.3-1.5.4-1.9.3-1.5.3-1.9.2-.6v-.1h-.1l-1.4 1.9-2.1 2.8-1.7 1.8-.4.2-.7-.4.1-.7.4-.6 2.3-2.9 1.4-1.8.9-1.1v-.2h-.1l-6.1 4-1.1.1-.5-.4.1-.7.2-.2 1.8-1.3z"/></svg>';

const LOGO_GPT = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="#10a37f" d="M21.6 9.8a5.4 5.4 0 0 0-.5-4.4 5.5 5.5 0 0 0-5.9-2.6A5.4 5.4 0 0 0 11.1 1a5.5 5.5 0 0 0-5.2 3.8 5.4 5.4 0 0 0-3.6 2.6 5.5 5.5 0 0 0 .7 6.4 5.4 5.4 0 0 0 .5 4.4 5.5 5.5 0 0 0 5.9 2.6 5.4 5.4 0 0 0 4.1 1.8 5.5 5.5 0 0 0 5.2-3.8 5.4 5.4 0 0 0 3.6-2.6 5.5 5.5 0 0 0-.7-6.4zm-8.2 11.5a4 4 0 0 1-2.6-1l.1-.1 4.3-2.5a.7.7 0 0 0 .4-.6v-6.1l1.8 1v5a4.1 4.1 0 0 1-4 4.3zm-8.7-3.7a4 4 0 0 1-.5-2.7l.1.1 4.3 2.5a.7.7 0 0 0 .7 0l5.3-3v2.1l-4.4 2.5a4.1 4.1 0 0 1-5.5-1.5zM3.6 8.1a4 4 0 0 1 2.1-1.8v5.1a.7.7 0 0 0 .4.6l5.2 3-1.8 1-4.4-2.5a4.1 4.1 0 0 1-1.5-5.4zm15 3.5l-5.3-3 1.8-1 4.4 2.5a4.1 4.1 0 0 1-.6 7.3v-5.1a.7.7 0 0 0-.3-.7zm1.8-2.7l-.1-.1-4.3-2.5a.7.7 0 0 0-.7 0L10 9.3V7.2l4.4-2.5a4.1 4.1 0 0 1 6 4.2zM9 12.6l-1.8-1v-5a4.1 4.1 0 0 1 6.7-3.1l-.1.1-4.3 2.5a.7.7 0 0 0-.4.6zm1-2.1l2.4-1.4 2.4 1.4v2.8l-2.4 1.4-2.4-1.4z"/></svg>';
const LOGO_GEM = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="ci45g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b8bf5"/><stop offset=".55" stop-color="#9168f0"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path fill="url(#ci45g)" d="M12 2c.6 5.3 4.7 9.4 10 10-5.3.6-9.4 4.7-10 10-.6-5.3-4.7-9.4-10-10 5.3-.6 9.4-4.7 10-10z"/></svg>';
/** Kildene (prompt 45). Stegene kan overstyres av GET /api/ai/import/sources. */
const SRC = {
  claude: { name: 'Claude', logo: () => LOGO, color: '#d97757', accept: '.zip,.json,application/zip,application/json', re: /\.(zip|json)$/i, drop: 'ZIP-fila fra e-posten, eller conversations.json', mem: true,
    how: null },
  chatgpt: { name: 'ChatGPT', logo: () => LOGO_GPT, color: '#10a37f', accept: '.zip,.json,application/zip,application/json', re: /\.(zip|json)$/i, drop: 'ZIP-fila fra OpenAI, eller conversations.json', mem: true,
    how: [['Be om eksport', 'chatgpt.com → profilen → Innstillinger → Datakontroller → Eksporter data → Bekreft eksport.'], ['Last ned ZIP-fila', 'Du får en e-post fra OpenAI med lenke (gyldig i 24 timer). Fila inneholder conversations.json med alle samtalene.'], ['Slipp den her', 'Samtalene leses på hjemmeserveren (treet med svar og omskrivinger blir én tråd i riktig rekkefølge). Ingenting sendes ut av huset.'], ['Minne (valgfritt)', 'ChatGPT → Innstillinger → Personalisering → Minne → Administrer. Kopier punktene og lim dem inn under.']] },
  gemini: { name: 'Gemini', logo: () => LOGO_GEM, color: '#6f6af0', accept: '.zip,.json,.html,application/zip,application/json,text/html', re: /\.(zip|json|html?)$/i, drop: 'ZIP-fila fra Google Takeout, eller MyActivity.html / .json', mem: true,
    how: [['Åpne Google Takeout', 'takeout.google.com → «Fjern alle» → velg bare «Mine aktiviteter» → Alle aktivitetsdata inkludert → kryss av for «Gemini Apps».'], ['Velg format', 'HTML eller JSON går begge. Opprett eksport, og last ned ZIP-fila når Google sender e-post.'], ['Slipp den her', 'Vi leser «Gemini Apps Activity» (spørsmål og svar med tidspunkt). HTML blir ren tekst; ingenting kjøres.'], ['Minne (valgfritt)', 'Gemini → Innstillinger → Lagret info. Kopier punktene og lim dem inn under.']] },
};
const src = () => SRC[ST.src] ?? SRC.claude;
let srcLoaded = false;
function loadSources() {
  if (srcLoaded) return; srcLoaded = true;
  fetch('/api/ai/import/sources', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    for (const x of j?.sources ?? []) { const s = SRC[x.id]; if (!s) continue; if (Array.isArray(x.steps) && x.steps.length && !s.how && x.id !== 'claude') s.how = x.steps.map((t, i) => (typeof t === 'string' ? [`Steg ${i + 1}`, t] : [t.t ?? t.title ?? `Steg ${i + 1}`, t.d ?? t.text ?? ''])); if (x.accept) s.accept = x.accept; }
    if (!j) ST.legacy = true;
    paint();
  }).catch(() => {});
}
// Liten eksempel-eksport (samme som fasiten) – lastes opp som conversations.json, så hele løypa på serveren testes.
const DEMO = [
  ['d1', 'Docker-compose for Sonarr og Radarr', '2026-09-02T18:10:00Z', [['human', 'Kan du lage en docker-compose med Sonarr, Radarr og qBittorrent med hardlinks?'], ['assistant', 'Ja. Gi alle tre samme volum, f.eks. /srv/data:/data, og bruk /data/downloads og /data/media.']]],
  ['d2', 'Oppsigelsestid i husleiekontrakten', '2026-08-14T09:00:00Z', [['human', 'Hva er vanlig oppsigelsestid for leilighet i Norge?'], ['assistant', 'Etter husleieloven er den tre måneder hvis ikke annet er avtalt.']]],
  ['d3', 'Middagsplan for uka', '2026-10-05T16:00:00Z', [['human', 'Lag middagsplan for fire, budsjett 1200 kr'], ['assistant', 'Mandag: kyllinggryte · Tirsdag: taco · …']]],
  ['d4', 'Statistikk eksamen – hypotesetesting', '2026-10-11T19:00:00Z', [['human', 'Forklar p-verdi enkelt'], ['assistant', 'P-verdien er sannsynligheten for et resultat minst så ekstremt, gitt at nullhypotesen er sann.']]],
  ['d5', 'Varmepumpe E5-feil', '2026-01-20T07:30:00Z', [['human', 'Varmepumpa viser E5'], ['assistant', 'E5 betyr ofte overspenning eller kommunikasjonsfeil mellom inne- og utedel.']]],
].map(([uuid, name, at, msgs]) => ({ uuid: `demo-${uuid}`, name, created_at: at, updated_at: at, chat_messages: msgs.map(([sender, text], i) => ({ uuid: `demo-${uuid}-${i}`, sender, text, created_at: at })) }));
const DEMO_MEM = 'Heter Sebastian og bor i Oslo\nStuderer og har statistikk-eksamen i desember\nHar homelab på Mac mini med Docker, Sonarr, Radarr og qBittorrent\nLiker korte svar på norsk';

function set(o) { Object.assign(ST, o); paint(); }
const REASON = { not_zip: 'Fila er ikke en gyldig ZIP.', no_conversations: 'Fant ingen samtaler i fila.', too_big: 'Fila er for stor.', zip_bomb: 'ZIP-fila pakker ut til mer enn grensen og ble stoppet.', bad_json: 'JSON-fila kunne ikke leses.', unknown_format: 'Kjente ikke igjen formatet.', expired: 'Forhåndsvisningen er utløpt. Last opp fila på nytt.' };
async function call(path, init = {}) {
  const base = ST.legacy ? '/api/chat/import/claude' : '/api/ai/import';
  const r = await fetch(`${base}${path}`, { credentials: 'same-origin', cache: 'no-store', ...init });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) location.href = '/login';
  if (r.status === 404 && !ST.legacy && !j.error && !j.reason) {
    if (ST.src !== 'claude') { const e = new Error(`Serveren har ikke ${src().name}-import ennå. Oppdater Homelab.`); e.status = 404; throw e; }
    ST.legacy = true; return call(path, init); // eldre server: Claude-importen fra prompt 43
  }
  if (!r.ok) { const why = j.error || REASON[j.reason] || (r.status === 413 ? `Fila er større enn ${ST.legacy ? '200 MB' : '1 GB'}.` : `Feil ${r.status}`); const e = new Error(j.detail ? `${why} (${j.detail})` : why); e.status = r.status; e.reason = j.reason; throw e; }
  return j;
}
/** Store filer sendes i biter (POST /api/ai/import/upload). → uploadId */
async function chunked(file, step) {
  const total = Math.ceil(file.size / CHUNK);
  let id = null;
  for (let i = 0; i < total; i++) {
    const h = { 'Content-Type': 'application/octet-stream', 'X-Chunk-Index': String(i), 'X-Chunk-Total': String(total), 'X-File-Name': encodeURIComponent(file.name) };
    if (id) h['X-Upload-Id'] = id;
    const r = await fetch('/api/ai/import/upload', { method: 'POST', credentials: 'same-origin', headers: h, body: file.slice(i * CHUNK, (i + 1) * CHUNK) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || REASON[j.reason] || `Opplastingen stoppet (feil ${r.status})`), { status: r.status });
    id = j.uploadId ?? id;
    step(`Lastet opp ${Math.round(((i + 1) / total) * 100)} %`, true);
  }
  return id;
}

/** Normaliserer forhåndsvisningen fra serveren. */
function prep(j) {
  const items = (j.items ?? j.conversationList ?? []).map((c) => ({
    id: String(c.id ?? c.uuid ?? ''), t: c.title ?? c.name ?? 'Uten tittel', up: c.updatedAt ?? c.updated_at ?? c.date ?? c.createdAt ?? null, proj: c.project ?? '',
    n: +(c.messages ?? c.messageCount ?? c.count ?? 0), dup: !!(c.imported ?? c.dup ?? c.existing ?? c.importedBefore), pre: c.selected,
  })).filter((c) => c.id).sort((a, b) => Date.parse(b.up ?? 0) - Date.parse(a.up ?? 0));
  const memRaw = (j.memory ?? []).map((m) => (typeof m === 'string' ? { t: m } : { t: m?.text ?? m?.t ?? '', exists: !!m?.exists, sel: m?.selected })).filter((m) => m.t);
  const mem = memRaw.map((m) => m.t);
  const sel = {}, msel = {};
  items.forEach((c) => { sel[c.id] = c.pre ?? !c.dup; });
  memRaw.forEach((m, i) => { msel[i] = m.sel ?? !m.exists; });
  const num = (v, L) => (typeof v === 'number' ? v : Array.isArray(v) ? v.length : L);
  const projects = j.projectNames ?? (Array.isArray(j.projects) ? j.projects.map((p) => p?.name ?? p).filter(Boolean) : []);
  const D = { src: j.source ?? ST.src, srcLabel: j.sourceLabel ?? src().name, warnings: Array.isArray(j.warnings) ? j.warnings : [], id: j.importId ?? j.id, items, mem, projects, nConv: num(j.conversations, items.length), nMsg: num(j.messages, items.reduce((a, c) => a + c.n, 0)), nProj: num(j.projects, projects.length), range: j.range };
  set({ st: 'preview', D, sel, msel, q: '', err: '', allSel: false });
}
function rangeTxt(D) {
  const r = D.range;
  let t = typeof r === 'string' ? r : r?.text ? r.text : r && (r.from || r.to) ? `Fra ${fmtD(r.from)} til ${fmtD(r.to)}` : '';
  if (!t) { const ds = D.items.map((c) => Date.parse(c.up)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b); t = ds.length ? `Fra ${fmtD(ds[0])} til ${fmtD(ds.at(-1))}` : 'Bare minne'; }
  return D.projects.length ? `${t} · prosjekter: ${D.projects.slice(0, 4).join(', ')}` : t;
}

async function upload(file, memOnly = false, sample = false) {
  const S0 = src();
  if (file && file.size > (ST.legacy ? MAX_OLD : MAX)) return set({ err: `Fila er ${mb(file.size)}. Maks er ${ST.legacy ? '200 MB' : '1 GB'}.` });
  if (file && !S0.re.test(file.name) && !/zip|json|html/.test(file.type)) return set({ err: `Velg eksporten fra ${S0.name} (${S0.drop}).` });
  const t0 = performance.now(), steps = [];
  const step = (n, replace) => { if (replace && steps.length && /^Lastet opp \d/.test(steps.at(-1)[0])) steps.pop(); steps.push([n, `${Math.round(performance.now() - t0).toLocaleString('nb-NO')} ms`]); set({ steps: [...steps] }); };
  set({ st: 'reading', file: file?.name ?? (sample ? 'eksempel-eksporten' : 'minnet'), err: '', steps: [] });
  try {
    let j;
    if (sample && !ST.legacy) {
      try { j = await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sample: ST.src, memory: ST.memTxt }) }); }
      catch (e) { if (ST.legacy && ST.src === 'claude') return upload(new File([JSON.stringify(DEMO)], 'conversations.json', { type: 'application/json' })); throw e; }
    } else if (file && !ST.legacy && file.size > CHUNK_FROM) {
      const uploadId = await chunked(file, step);
      j = await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId, source: ST.src, memory: ST.memTxt }) });
    } else {
      const fd = new FormData();
      if (file) fd.append('file', file, file.name);
      fd.append('memory', ST.memTxt);
      fd.append('source', ST.src);
      if (memOnly) fd.append('memoryOnly', '1');
      j = await call('', { method: 'POST', body: fd });
    }
    if (Array.isArray(j.steps) && j.steps.length) j.steps.forEach((s) => steps.push([s.n ?? s.name ?? s.t ?? String(s), s.ms != null ? `${nb(s.ms)} ms` : '']));
    else {
      if (file) step(`Lastet opp ${mb(file.size)}`);
      if (j.files != null) step(`Pakket ut ${j.files} filer`);
      step(`Fant ${nb(typeof j.conversations === 'number' ? j.conversations : (j.items ?? []).length)} samtaler`);
      step(`Fant ${nb((j.memory ?? []).length)} minnepunkter`);
    }
    ST.steps = steps;
    prep(j);
  } catch (e) { set({ st: 'start', err: e.message }); }
}

async function run() {
  const D = ST.D;
  // Flere samtaler enn de som er hentet (60 om gangen) og «Alle» valgt: serveren tar alle (uten conversationIds).
  const all = ST.allSel && D.nConv > D.items.length && D.items.every((c) => ST.sel[c.id] || (ST.oSkip && c.dup));
  const ids = ST.oChats ? D.items.filter((c) => ST.sel[c.id] && !(ST.oSkip && c.dup)).map((c) => c.id) : [];
  const mem = ST.oMem ? D.mem.filter((_, i) => ST.msel[i]) : [];
  if (!ids.length && !mem.length && !all) return set({ err: 'Velg minst én samtale eller ett minnepunkt.' });
  set({ st: 'importing', pi: 0, pn: all ? D.nConv : ids.length, err: '' });
  // Ett kall; linja går jevnt fram mens serveren lagrer (ca. 40 samtaler i sekundet), og blir full når svaret kommer.
  const t0 = Date.now(), tick = setInterval(() => { if (ST.st === 'importing') set({ pi: Math.min(ST.pn - 1, Math.floor(((Date.now() - t0) / 1000) * 40)) }); }, 200);
  try {
    const r = await call(`/${encodeURIComponent(D.id)}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all ? { importConversations: true, importMemory: ST.oMem, memory: mem, skipExisting: ST.oSkip } : { conversationIds: ids, memory: mem, importConversations: ST.oChats, importMemory: ST.oMem, skipExisting: ST.oSkip }) });
    clearInterval(tick);
    const n = (v, d) => (typeof v === 'number' ? v : Array.isArray(v) ? v.length : d);
    const skipped = n(r.skipped, ST.oSkip ? D.items.filter((c) => ST.sel[c.id] && c.dup).length : 0);
    set({ st: 'done', res: { chats: n(r.conversations ?? r.imported, ids.length), mem: n(r.memory ?? r.memoryAdded, mem.length), skip: skipped }, pi: ST.pn });
    ST.res.folder = r.folder ?? D.srcLabel; ST.res.text = r.text ?? '';
    try { window.dispatchEvent(new CustomEvent('hl:chat-import', { detail: { folder: ST.res.folder } })); } catch { /* */ }
  } catch (e) { clearInterval(tick); set({ st: 'preview', err: e.message }); }
}
async function undo() {
  const D = ST.D;
  if (!D?.id) return set({ st: 'start', D: null, res: null });
  set({ busy: true });
  try { await call(`/${encodeURIComponent(D.id)}/undo`, { method: 'POST' }); set({ st: 'start', D: null, res: null, busy: false, err: '' }); window.dispatchEvent(new CustomEvent('hl:chat-import', { detail: { undo: true } })); }
  catch (e) { set({ busy: false, err: e.message }); }
}

const tog = (on) => `<span class="ci43-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const box = (on) => `<span class="ci43-ck${on ? ' on' : ''}" aria-hidden="true">${on ? '✓' : ''}</span>`;
const HOW = [['Be om eksport', 'claude.ai → Innstillinger → Personvern → Eksporter data. På mobil: profilen → Innstillinger → Personvern.'],
  ['Last ned ZIP-fila', 'Du får en e-post med lenke. Lenken virker i 24 timer. Fila heter noe som data-2026-10-21-….zip.'],
  ['Slipp den her', 'Vi leser conversations.json (samtaler), projects.json (prosjekter) og minnet hvis det ligger med. Ingenting sendes ut av huset; alt lagres på hjemmeserveren.'],
  ['Minne', 'Claude → Innstillinger → Minne → Vis og rediger. Kopier teksten og lim den inn under hvis den ikke er i ZIP-fila.']];

function html() {
  const S = ST, D = S.D;
  const X = src(), nm = D?.srcLabel ?? X.name, HOWX = X.how ?? HOW;
  const pick = S.st === 'start' ? `<div class="ci45-src" role="radiogroup" aria-label="Velg kilde">${Object.entries(SRC).map(([k, v]) => `<button type="button" role="radio" aria-checked="${ST.src === k}" class="ci45-sb${ST.src === k ? ' on' : ''}" data-ci45-src="${k}" style="--sc:${v.color}"><span class="ci45-sl">${v.logo()}</span><b>${esc(v.name)}</b></button>`).join('')}</div>` : '';
  const head = `${pick}<div class="ci43-card ci43-hd"><span class="ci43-logo">${X.logo()}</span><div class="ci43-col"><b class="ci43-h">Importer fra ${esc(nm)}</b><span class="ci43-mut">Samtaler havner i Chat i mappen «${esc(nm)}». Minnet brukes av Chat og Glimt (merket med kilden).</span></div></div>`;
  const err = S.err ? `<span class="ci43-err" role="alert">${esc(S.err)}</span>` : '';
  if (S.st === 'start') return `${head}
    <div class="ci43-card ci43-how"><span class="ci43-lab acc">SLIK EKSPORTERER DU FRA ${esc(X.name.toUpperCase())}</span>${HOWX.map(([t, d], i) => `<div class="ci43-step"><span class="ci43-n">${i + 1}</span><div class="ci43-col"><b>${esc(t)}</b><span class="ci43-mut">${esc(d)}</span></div></div>`).join('')}</div>
    <label class="ci43-drop${S.drag ? ' drag' : ''}" data-ci43-drop><input type="file" accept="${esc(X.accept)}" data-ci43-file hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
      <b>Slipp ${esc(X.name)}-eksporten her</b><span class="ci43-mut">${esc(X.drop)} · trykk for å velge · maks ${ST.legacy ? '200 MB' : '1 GB'}</span></label>
    ${err}
    <div class="ci43-col ci43-g8"><span class="ci43-lab">MINNE (VALGFRITT)</span><textarea class="ci43-ta" rows="4" data-ci43-mem placeholder="Lim inn minnet fra ${esc(X.name)}, ett punkt per linje">${esc(S.memTxt)}</textarea><span class="ci43-mut ci43-sm">Ligger minnet i ZIP-fila, hentes det automatisk.</span></div>
    <div class="ci43-row ci43-wrap"><button type="button" class="ci43-btn line" data-ci43="memonly">Importer bare minnet</button><button type="button" class="ci43-btn ghost" data-ci43="demo">Prøv med en eksempel-eksport</button></div>`;
  if (S.st === 'reading') return `${head}<div class="ci43-card ci43-col ci43-g6">${S.steps.map(([n, ms]) => `<div class="ci43-sr"><span>✓ ${esc(n)}</span><span class="ci43-mono">${esc(ms)}</span></div>`).join('')}<b>Leser ${esc(S.file)} …</b></div>`;
  if (S.st === 'importing') { const n = Math.max(1, S.pn); return `${head}<div class="ci43-card ci43-col ci43-g10"><div class="ci43-row ci43-sb"><b class="ci43-h">Importerer …</b><span class="ci43-mono">${nb(S.pi)} / ${nb(S.pn)}</span></div><div class="ci43-bar"><i style="width:${S.pn ? Math.round((S.pi / n) * 100) : 60}%"></i></div><span class="ci43-mut">Lagrer samtaler på hjemmeserveren og bygger søkeindeks …</span></div>`; }
  if (S.st === 'done' && S.res) {
    const r = S.res, t = [r.chats ? `${nb(r.chats)} samtaler` : '', r.mem ? `${nb(r.mem)} minnepunkter` : ''].filter(Boolean).join(' og ') || 'Ingenting nytt';
    const sub = r.text || `${r.chats ? `Samtalene ligger i mappen «${r.folder ?? nm}» i Chat. ` : ''}${r.mem ? 'Minnet ligger under Chat → ⚙ → Minne. ' : ''}${r.skip ? `${nb(r.skip)} var importert før og ble hoppet over.` : ''}`;
    return `${head}<div class="ci43-card ci43-done ci43-col ci43-g12"><b class="ci43-h">✓ ${esc(t)} importert</b><span class="ci43-mut">${esc(sub)}</span>${err}
      <div class="ci43-row ci43-wrap">${r.chats ? '<button type="button" class="ci43-btn ink" data-ci43="chat">Åpne Chat</button>' : ''}<button type="button" class="ci43-btn line" data-ci43="reset">Importer mer</button><button type="button" class="ci43-btn ghost red" data-ci43="undo"${S.busy ? ' disabled' : ''}>${S.busy ? 'Angrer …' : 'Angre importen'}</button></div></div>`;
  }
  if (S.st !== 'preview' || !D) return head;
  const qq = S.q.trim().toLowerCase(), L = D.items.filter((c) => !qq || c.t.toLowerCase().includes(qq)), selN = S.allSel && D.nConv > D.items.length ? D.nConv - D.items.filter((c) => !S.sel[c.id]).length : D.items.filter((c) => S.sel[c.id]).length, memSel = D.mem.filter((_, i) => S.msel[i]).length;
  const goN = [S.oChats && selN ? `${nb(selN)} samtaler` : '', S.oMem && memSel ? `${nb(memSel)} minnepunkter` : ''].filter(Boolean).join(' og ');
  const optsL = [['oChats', 'Importer samtaler', `Til mappen «${nm}» i Chat. Du kan fortsette dem med valgfri modell.`, D.items.length], ['oMem', 'Importer minne', 'Chat og Glimt bruker punktene når du spør. Rediger i Chat → ⚙ → Minne.', D.mem.length], ['oSkip', 'Hopp over det som er importert før', 'Ellers erstattes de med versjonen i eksporten.', D.items.length]].filter((x) => x[3]);
  return `${head}
    ${S.steps.length ? `<div class="ci43-steps">${S.steps.map(([n, ms]) => `<span>✓ ${esc(n)} <span class="ci43-mono">${esc(ms)}</span></span>`).join('')}</div>` : ''}
    <div class="ci43-stats">${[[D.nConv, 'samtaler'], [D.nMsg, 'meldinger'], [D.nProj, 'prosjekter'], [D.mem.length, 'minnepunkter']].map(([v, l]) => `<div class="ci43-card ci43-stat"><b>${nb(v)}</b><span class="ci43-mut">${l}</span></div>`).join('')}</div>
    <span class="ci43-mut">${esc(rangeTxt(D))}</span>${D.warnings.length ? `<span class="ci43-mut ci45-warn">${D.warnings.map(esc).join(' · ')}</span>` : ''}
    ${D.items.length ? `<div class="ci43-col ci43-g8"><div class="ci43-row ci43-sb ci43-wrap"><span class="ci43-lab">SAMTALER · ${nb(selN)} VALGT</span><div class="ci43-row ci43-g6"><button type="button" class="ci43-btn sm line" data-ci43="all">Alle</button><button type="button" class="ci43-btn sm line" data-ci43="none">Ingen</button></div></div>
      <input class="ci43-in" type="search" data-ci43-q placeholder="Søk i titler" value="${esc(S.q)}" aria-label="Søk i titler">
      <div class="ci43-list">${L.slice(0, 60).map((c) => { const on = !!S.sel[c.id]; return `<button type="button" class="ci43-li" data-ci43-c="${esc(c.id)}" aria-pressed="${on}">${box(on)}<span class="ci43-col ci43-grow"><b class="ci43-ell">${esc(c.t)}</b><span class="ci43-mut ci43-sm">${esc([fmtD(c.up), c.n ? `${nb(c.n)} meldinger` : ''].filter(Boolean).join(' · '))}</span></span>${c.dup ? '<span class="ci43-dup">Importert før</span>' : ''}</button>`; }).join('') || '<span class="ci43-mut ci43-pad">Ingen titler passer søket.</span>'}</div>
      ${L.length > 60 || D.nConv > D.items.length ? `<span class="ci43-mut ci43-sm">Viser ${nb(Math.min(60, L.length))} av ${nb(qq ? L.length : D.nConv)}. Søk for å finne flere; «Alle» velger alle ${nb(D.nConv)}.</span>` : ''}</div>` : ''}
    ${D.mem.length ? `<div class="ci43-col ci43-g8"><span class="ci43-lab">MINNE · ${nb(memSel)} AV ${nb(D.mem.length)} PUNKTER</span><div class="ci43-list">${D.mem.map((t, i) => { const on = !!S.msel[i]; return `<button type="button" class="ci43-li top" data-ci43-m="${i}" aria-pressed="${on}">${box(on)}<span>${esc(t)}</span></button>`; }).join('')}</div></div>` : ''}
    <div class="ci43-list">${optsL.map(([k, n, sub]) => `<button type="button" class="ci43-li ci43-opt" data-ci43-o="${k}" role="switch" aria-checked="${!!S[k]}"><span class="ci43-col ci43-grow"><b>${esc(n)}</b><span class="ci43-mut ci43-sm">${esc(sub)}</span></span>${tog(S[k])}</button>`).join('')}</div>
    ${err}
    <div class="ci43-row ci43-g8"><button type="button" class="ci43-btn line grow1" data-ci43="reset">Avbryt</button><button type="button" class="ci43-btn ink grow2" data-ci43="go">${esc(goN ? `Importer ${goN}` : 'Importer')}</button></div>`;
}

function paint() {
  if (!root?.isConnected) return;
  const ae = document.activeElement, inQ = ae?.matches?.('[data-ci43-q]'), inM = ae?.matches?.('[data-ci43-mem]'), pos = inQ || inM ? ae.selectionStart : 0;
  const lst = root.querySelector('.ci43-list')?.scrollTop ?? 0;
  root.innerHTML = html();
  const l = root.querySelector('.ci43-list'); if (l) l.scrollTop = lst;
  const f = inQ ? root.querySelector('[data-ci43-q]') : inM ? root.querySelector('[data-ci43-mem]') : null;
  if (f) { f.focus({ preventScroll: true }); try { f.setSelectionRange(pos, pos); } catch { /* */ } }
}

let qT = 0;
/** Søk i titler på serveren når eksporten har flere samtaler enn de 60 som er hentet. */
async function more() {
  const D = ST.D; if (!D?.id) return;
  try {
    const j = await call(`/${encodeURIComponent(D.id)}?offset=0&limit=60&q=${encodeURIComponent(ST.q.trim())}`);
    const have = new Set(D.items.map((c) => c.id));
    for (const c of j.items ?? []) { const id = String(c.id ?? c.uuid ?? ''); if (!id || have.has(id)) continue; const dup = !!(c.imported ?? c.dup); D.items.push({ id, t: c.title ?? c.name ?? 'Uten tittel', up: c.updatedAt ?? c.date ?? null, n: +(c.messages ?? 0), dup }); ST.sel[id] = ST.allSel ? true : c.selected ?? !dup; }
    if (ST.D === D) paint();
  } catch { /* søket virker lokalt på de hentede */ }
}
function bind(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ci43],[data-ci43-c],[data-ci43-m],[data-ci43-o],[data-ci45-src]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.ci43C) { ST.sel[d.ci43C] = !ST.sel[d.ci43C]; return paint(); }
    if (d.ci43M != null) { ST.msel[d.ci43M] = !ST.msel[d.ci43M]; return paint(); }
    if (d.ci43O) { ST[d.ci43O] = !ST[d.ci43O]; return paint(); }
    const a = d.ci43;
    if (d.ci45Src) { if (ST.st === 'start') set({ src: d.ci45Src, err: '' }); return; }
    if (a === 'demo') { if (!ST.memTxt.trim() && ST.src === 'claude') ST.memTxt = DEMO_MEM; if (ST.legacy) { const f = new File([JSON.stringify(DEMO)], 'conversations.json', { type: 'application/json' }); return upload(f); } return upload(null, false, true); }
    if (a === 'memonly') { if (!memFrom(ST.memTxt).length) return set({ err: 'Lim inn minnet først, ett punkt per linje.' }); return upload(null, true); }
    if (a === 'all') { ST.D.items.forEach((c) => { ST.sel[c.id] = true; }); ST.allSel = true; return paint(); }
    if (a === 'none') { ST.sel = {}; ST.allSel = false; return paint(); }
    if (a === 'go') return run();
    if (a === 'reset') return set({ st: 'start', D: null, res: null, err: '', steps: [] });
    if (a === 'undo') return undo();
    if (a === 'chat') { if (opts.onOpenChat) opts.onOpenChat(); else location.hash = '#/chat'; }
  });
  el.addEventListener('change', (e) => { if (e.target.matches('[data-ci43-file]')) { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); } });
  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-ci43-mem]')) ST.memTxt = e.target.value;
    if (e.target.matches('[data-ci43-q]')) { ST.q = e.target.value; paint(); if (ST.D && ST.D.nConv > ST.D.items.length) { clearTimeout(qT); qT = setTimeout(more, 300); } }
  });
  el.addEventListener('dragover', (e) => { if (!e.target.closest('[data-ci43-drop]')) return; e.preventDefault(); if (!ST.drag) set({ drag: true }); });
  el.addEventListener('dragleave', (e) => { if (e.target.closest('[data-ci43-drop]') && ST.drag) set({ drag: false }); });
  el.addEventListener('drop', (e) => { if (!e.target.closest('[data-ci43-drop]')) return; e.preventDefault(); ST.drag = false; const f = e.dataTransfer?.files?.[0]; if (f) upload(f); else paint(); });
}

/** Monterer importen i host. Samme element gjenbrukes når AI-kontroll tegner på nytt (tilstanden ligger i modulen). */
export function mountClaudeImport(host, o = {}) {
  opts = o;
  if (!document.querySelector('link[data-ci43-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/claude-import43.css'; l.dataset.ci43Css = ''; document.head.appendChild(l); }
  if (!root) { root = document.createElement('div'); root.className = 'ci43'; root.dataset.ci43Root = ''; bind(root); }
  root.classList.toggle('mob', o.variant === 'mobile');
  loadSources();
  if (root.parentElement !== host) host.replaceChildren(root);
  paint();
  return root;
}
export const claudeImportRoot = () => root;

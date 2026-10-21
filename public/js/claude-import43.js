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

const MAX = 200 * 1024 * 1024;
const ST = { st: 'start', err: '', memTxt: '', q: '', sel: {}, msel: {}, oChats: true, oMem: true, oSkip: true, drag: false, steps: [], file: '', D: null, res: null, pi: 0, pn: 0, busy: false };
let root = null, opts = {};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nb = (n) => (+n || 0).toLocaleString('nb-NO');
const fmtD = (d) => { const x = new Date(d); return Number.isNaN(+x) ? '' : x.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }); };
const mb = (b) => `${(b / 1024 / 1024).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB`;
const memFrom = (txt) => [...new Set(String(txt ?? '').split(/\n+/).map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter((l) => l.length > 3 && l.length < 400))];
const LOGO = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="#d97757" d="M4.7 15.9l4.7-2.6.1-.2-.1-.2h-.2l-.8-.1-2.7-.1-2.3-.1-2.2-.1-.6-.1L0 11.7l.1-.3.5-.3.7.1 1.5.1 2.3.2 1.7.1 2.4.3h.4l.1-.2-.1-.1-.1-.1-2.4-1.6-2.5-1.7-1.3-1-.7-.5-.4-.4-.1-.9.6-.7.8.1.2.1.8.6 1.7 1.3 2.2 1.7.3.3.1-.1v-.1l-.2-.3-1.2-2.2-1.3-2.3-.6-.9-.2-.6c0-.2-.1-.4-.1-.7l.7-1 .4-.1.9.1.4.3.6 1.3.9 2.1 1.5 2.9.4.9.2.8.1.2h.1v-.2l.1-1.6.2-2 .2-2.6.1-.7.3-.8.7-.4.5.2.4.6-.1.4-.2 1.6-.5 2.5-.3 1.7h.2l.2-.2.9-1.2 1.5-1.9.7-.7.8-.8.5-.4h1l.7 1.1-.3 1.1-1 1.3-.8 1.1-1.2 1.6-.7 1.3.1.1h.2l2.7-.6 1.5-.3 1.8-.3.8.4.1.4-.3.8-1.9.5-2.2.4-3.3.8h-.1l.1.1 1.5.1.6.1h1.6l2.9.2.8.5.5.6-.1.5-1.2.6-1.6-.4-3.7-.9-1.3-.3h-.2v.1l1.1 1 1.9 1.7 2.4 2.3.1.6-.3.4-.3-.1-2.1-1.6-.8-.7-1.8-1.5h-.1v.2l.4.6 2.2 3.3.1 1-.2.3-.6.2-.6-.1-1.3-1.8-1.4-2.1-1.1-1.9-.1.1-.7 7.2-.3.4-.7.3-.6-.5-.3-.7.3-1.5.4-1.9.3-1.5.3-1.9.2-.6v-.1h-.1l-1.4 1.9-2.1 2.8-1.7 1.8-.4.2-.7-.4.1-.7.4-.6 2.3-2.9 1.4-1.8.9-1.1v-.2h-.1l-6.1 4-1.1.1-.5-.4.1-.7.2-.2 1.8-1.3z"/></svg>';

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
async function call(path, init = {}) {
  const r = await fetch(`/api/chat/import/claude${path}`, { credentials: 'same-origin', cache: 'no-store', ...init });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) location.href = '/login';
  if (!r.ok) { const e = new Error(r.status === 404 && !j.error ? 'Serveren har ikke Claude-import ennå.' : r.status === 413 ? 'Fila er større enn 200 MB.' : j.error || `Feil ${r.status}`); e.status = r.status; throw e; }
  return j;
}

/** Normaliserer forhåndsvisningen fra serveren. */
function prep(j) {
  const items = (j.items ?? j.conversationList ?? []).map((c) => ({
    id: String(c.id ?? c.uuid ?? ''), t: c.title ?? c.name ?? 'Uten tittel', up: c.updatedAt ?? c.updated_at ?? c.date ?? c.createdAt ?? null,
    n: +(c.messages ?? c.messageCount ?? c.count ?? 0), dup: !!(c.imported ?? c.dup ?? c.existing ?? c.importedBefore), pre: c.selected,
  })).filter((c) => c.id).sort((a, b) => Date.parse(b.up ?? 0) - Date.parse(a.up ?? 0));
  const memRaw = (j.memory ?? []).map((m) => (typeof m === 'string' ? { t: m } : { t: m?.text ?? m?.t ?? '', exists: !!m?.exists, sel: m?.selected })).filter((m) => m.t);
  const mem = memRaw.map((m) => m.t);
  const sel = {}, msel = {};
  items.forEach((c) => { sel[c.id] = c.pre ?? !c.dup; });
  memRaw.forEach((m, i) => { msel[i] = m.sel ?? !m.exists; });
  const num = (v, L) => (typeof v === 'number' ? v : Array.isArray(v) ? v.length : L);
  const projects = j.projectNames ?? (Array.isArray(j.projects) ? j.projects.map((p) => p?.name ?? p).filter(Boolean) : []);
  const D = { id: j.importId ?? j.id, items, mem, projects, nConv: num(j.conversations, items.length), nMsg: num(j.messages, items.reduce((a, c) => a + c.n, 0)), nProj: num(j.projects, projects.length), range: j.range };
  set({ st: 'preview', D, sel, msel, q: '', err: '', allSel: false });
}
function rangeTxt(D) {
  const r = D.range;
  let t = typeof r === 'string' ? r : r?.text ? r.text : r && (r.from || r.to) ? `Fra ${fmtD(r.from)} til ${fmtD(r.to)}` : '';
  if (!t) { const ds = D.items.map((c) => Date.parse(c.up)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b); t = ds.length ? `Fra ${fmtD(ds[0])} til ${fmtD(ds.at(-1))}` : 'Bare minne'; }
  return D.projects.length ? `${t} · prosjekter: ${D.projects.slice(0, 4).join(', ')}` : t;
}

async function upload(file, memOnly = false) {
  if (file && file.size > MAX) return set({ err: `Fila er ${mb(file.size)}. Maks er 200 MB.` });
  if (file && !/\.(zip|json)$/i.test(file.name) && !/zip|json/.test(file.type)) return set({ err: 'Velg ZIP-fila fra Claude eller conversations.json.' });
  const t0 = performance.now(), steps = [];
  const step = (n) => { steps.push([n, `${Math.round(performance.now() - t0).toLocaleString('nb-NO')} ms`]); set({ steps: [...steps] }); };
  set({ st: 'reading', file: file?.name ?? 'minnet', err: '', steps: [] });
  try {
    const fd = new FormData();
    if (file) fd.append('file', file, file.name);
    fd.append('memory', ST.memTxt);
    if (memOnly) fd.append('memoryOnly', '1');
    const j = await call('', { method: 'POST', body: fd });
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
    try { window.dispatchEvent(new CustomEvent('hl:chat-import', { detail: { folder: 'Claude' } })); } catch { /* */ }
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
  const head = `<div class="ci43-card ci43-hd"><span class="ci43-logo">${LOGO}</span><div class="ci43-col"><b class="ci43-h">Importer fra Claude</b><span class="ci43-mut">Samtaler havner i Chat i mappen «Claude». Minnet brukes av Chat og Glimt.</span></div></div>`;
  const err = S.err ? `<span class="ci43-err" role="alert">${esc(S.err)}</span>` : '';
  if (S.st === 'start') return `${head}
    <div class="ci43-card ci43-how"><span class="ci43-lab acc">SLIK EKSPORTERER DU FRA CLAUDE</span>${HOW.map(([t, d], i) => `<div class="ci43-step"><span class="ci43-n">${i + 1}</span><div class="ci43-col"><b>${esc(t)}</b><span class="ci43-mut">${esc(d)}</span></div></div>`).join('')}</div>
    <label class="ci43-drop${S.drag ? ' drag' : ''}" data-ci43-drop><input type="file" accept=".zip,.json,application/zip,application/json" data-ci43-file hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
      <b>Slipp Claude-eksporten her</b><span class="ci43-mut">ZIP-fila fra e-posten, eller conversations.json · trykk for å velge · maks 200 MB</span></label>
    ${err}
    <div class="ci43-col ci43-g8"><span class="ci43-lab">MINNE (VALGFRITT)</span><textarea class="ci43-ta" rows="4" data-ci43-mem placeholder="Lim inn teksten fra Claude → Innstillinger → Minne, ett punkt per linje">${esc(S.memTxt)}</textarea><span class="ci43-mut ci43-sm">Ligger minnet i ZIP-fila, hentes det automatisk.</span></div>
    <div class="ci43-row ci43-wrap"><button type="button" class="ci43-btn line" data-ci43="memonly">Importer bare minnet</button><button type="button" class="ci43-btn ghost" data-ci43="demo">Prøv med en eksempel-eksport</button></div>`;
  if (S.st === 'reading') return `${head}<div class="ci43-card ci43-col ci43-g6">${S.steps.map(([n, ms]) => `<div class="ci43-sr"><span>✓ ${esc(n)}</span><span class="ci43-mono">${esc(ms)}</span></div>`).join('')}<b>Leser ${esc(S.file)} …</b></div>`;
  if (S.st === 'importing') { const n = Math.max(1, S.pn); return `${head}<div class="ci43-card ci43-col ci43-g10"><div class="ci43-row ci43-sb"><b class="ci43-h">Importerer …</b><span class="ci43-mono">${nb(S.pi)} / ${nb(S.pn)}</span></div><div class="ci43-bar"><i style="width:${S.pn ? Math.round((S.pi / n) * 100) : 60}%"></i></div><span class="ci43-mut">Lagrer samtaler på hjemmeserveren og bygger søkeindeks …</span></div>`; }
  if (S.st === 'done' && S.res) {
    const r = S.res, t = [r.chats ? `${nb(r.chats)} samtaler` : '', r.mem ? `${nb(r.mem)} minnepunkter` : ''].filter(Boolean).join(' og ') || 'Ingenting nytt';
    const sub = `${r.chats ? 'Samtalene ligger i mappen «Claude» i Chat. ' : ''}${r.mem ? 'Minnet ligger under Chat → ⚙ → Minne. ' : ''}${r.skip ? `${nb(r.skip)} var importert før og ble hoppet over.` : ''}`;
    return `${head}<div class="ci43-card ci43-done ci43-col ci43-g12"><b class="ci43-h">✓ ${esc(t)} importert</b><span class="ci43-mut">${esc(sub)}</span>${err}
      <div class="ci43-row ci43-wrap">${r.chats ? '<button type="button" class="ci43-btn ink" data-ci43="chat">Åpne Chat</button>' : ''}<button type="button" class="ci43-btn line" data-ci43="reset">Importer mer</button><button type="button" class="ci43-btn ghost red" data-ci43="undo"${S.busy ? ' disabled' : ''}>${S.busy ? 'Angrer …' : 'Angre importen'}</button></div></div>`;
  }
  if (S.st !== 'preview' || !D) return head;
  const qq = S.q.trim().toLowerCase(), L = D.items.filter((c) => !qq || c.t.toLowerCase().includes(qq)), selN = S.allSel && D.nConv > D.items.length ? D.nConv - D.items.filter((c) => !S.sel[c.id]).length : D.items.filter((c) => S.sel[c.id]).length, memSel = D.mem.filter((_, i) => S.msel[i]).length;
  const goN = [S.oChats && selN ? `${nb(selN)} samtaler` : '', S.oMem && memSel ? `${nb(memSel)} minnepunkter` : ''].filter(Boolean).join(' og ');
  const optsL = [['oChats', 'Importer samtaler', 'Til mappen «Claude» i Chat. Du kan fortsette dem med valgfri modell.', D.items.length], ['oMem', 'Importer minne', 'Chat og Glimt bruker punktene når du spør. Rediger i Chat → ⚙ → Minne.', D.mem.length], ['oSkip', 'Hopp over det som er importert før', 'Ellers erstattes de med versjonen i eksporten.', D.items.length]].filter((x) => x[3]);
  return `${head}
    ${S.steps.length ? `<div class="ci43-steps">${S.steps.map(([n, ms]) => `<span>✓ ${esc(n)} <span class="ci43-mono">${esc(ms)}</span></span>`).join('')}</div>` : ''}
    <div class="ci43-stats">${[[D.nConv, 'samtaler'], [D.nMsg, 'meldinger'], [D.nProj, 'prosjekter'], [D.mem.length, 'minnepunkter']].map(([v, l]) => `<div class="ci43-card ci43-stat"><b>${nb(v)}</b><span class="ci43-mut">${l}</span></div>`).join('')}</div>
    <span class="ci43-mut">${esc(rangeTxt(D))}</span>
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
    const b = e.target.closest('[data-ci43],[data-ci43-c],[data-ci43-m],[data-ci43-o]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.ci43C) { ST.sel[d.ci43C] = !ST.sel[d.ci43C]; return paint(); }
    if (d.ci43M != null) { ST.msel[d.ci43M] = !ST.msel[d.ci43M]; return paint(); }
    if (d.ci43O) { ST[d.ci43O] = !ST[d.ci43O]; return paint(); }
    const a = d.ci43;
    if (a === 'demo') { const f = new File([JSON.stringify(DEMO)], 'conversations.json', { type: 'application/json' }); if (!ST.memTxt.trim()) ST.memTxt = DEMO_MEM; return upload(f); }
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
  if (root.parentElement !== host) host.replaceChildren(root);
  paint();
  return root;
}
export const claudeImportRoot = () => root;

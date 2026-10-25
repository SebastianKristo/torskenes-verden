// Prompt 58 (OMLX58): oMLX på Mac mini-en i AI-kontroll (bare admin). Lastes av ai-control.js og fyller to plassholdere:
//  - [data-omlx58-rt] (fanen Valg): «Motor per oppgave» – Ollama · oMLX per oppgave, MLX-modellen som brukes, og
//    «Bruk Ollama hvis oMLX ikke svarer» (standard på; gjelder også Open WebUI). Ollama er standard til eval har avgjort.
//  - [data-omlx58-ai] (fanen Modeller): kortet «oMLX på Mac mini-en» – adresse, nøkkel, tekst-/bildemodell, Test, Sjekk nå, modellene
//    oMLX har (og hvilke som er lastet, når oMLX oppgir det). Samme stil som NB-Whisper-/Fermion-kortene (voice54.js).
// Nøkkelen sendes bare inn (PUT) og vises aldri. Serveren godtar bare adresser i huset.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const TASK_NAMES = { glimt: 'Glimt · kalender og planlegger', sok: 'AI-søk', brief: 'Glimt · brief', fsok: 'Finans · spør', dom: 'Domener · oppsummering', rc: 'Dokumenter og bilder (vitnemål, kvitteringsreserve)' };
const ST = { ok: 'Svarer', auth: 'Nøkkel eller IP avvist', down: 'Svarer ikke', starting: 'Starter', off: 'Ikke satt opp' };
const CSS = `
.o58 input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid var(--line,#2a3142);background:transparent;color:inherit;font:500 13px var(--mono,'JetBrains Mono',monospace)}
.o58 .o58-form{display:grid;gap:8px;margin-top:8px}.o58 .o58-btns{display:flex;gap:8px;flex-wrap:wrap}
.o58 .o58-models{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.o58 .o58-chip{font:500 12px var(--mono,'JetBrains Mono',monospace);padding:2px 8px;border-radius:999px;border:1px solid var(--line,#2a3142)}
.o58 .o58-chip.on{border-color:var(--ok,#4caf7a)}
.o58-rt{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line,#2a3142)}.o58-rt:first-child{border-top:0}
.o58-rt .o58-grow{flex:1 1 220px;min-width:0;display:flex;flex-direction:column}.o58-rt .o58-grow span{color:var(--mut,#8a93a6);font-size:12px;overflow:hidden;text-overflow:ellipsis}
`;
function css() { if (!document.getElementById('o58-css')) { const s = document.createElement('style'); s.id = 'o58-css'; s.textContent = CSS; document.head.appendChild(s); } }

const S = { cfg: null, health: null, at: 0, busy: false, msg: '', rtMsg: '', admin: null, loading: null };
const J = (r) => (r.ok ? r.json() : r.status === 403 || r.status === 401 ? Promise.reject(Object.assign(new Error('admin'), { admin: false })) : r.json().then((j) => Promise.reject(new Error(j.error || `Feil ${r.status}`)), () => Promise.reject(new Error(`Feil ${r.status}`))));
async function load(force = false) {
  if (!force && S.at && Date.now() - S.at < 30_000) return;
  if (S.loading) return S.loading;
  S.loading = (async () => {
    try {
      const [c, h] = await Promise.all([fetch('/api/admin/omlx58/config', { credentials: 'same-origin' }).then(J), fetch(`/api/admin/omlx58/health${force ? '?fresh=1' : ''}`, { credentials: 'same-origin' }).then(J)]);
      Object.assign(S, { cfg: c, health: h, admin: true });
    } catch (e) { if (e.admin === false) S.admin = false; else S.msg = e.message; }
    S.at = Date.now(); S.loading = null;
  })();
  return S.loading;
}
async function put(body) {
  const r = await fetch('/api/admin/omlx58/config', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Feil ${r.status}`);
  S.cfg = j;
  return j;
}

function statusLine() {
  const h = S.health;
  if (!h) return 'Laster …';
  if (!h.configured) return 'Ikke satt opp · installer med tools/omlx/install.sh på Mac mini-en';
  return `${ST[h.status] ?? h.status}${h.ms != null && h.ok ? ` · ${h.ms} ms` : ''}${h.error && !h.ok ? ` · ${h.error}` : ''}${h.ok && h.missing?.length ? ` · mangler ${h.missing.join(', ')}` : ''}`;
}
function aiHtml() {
  const c = S.cfg, h = S.health;
  if (!c) return '';
  const loaded = new Set(h?.loaded ?? []);
  const chips = (h?.models ?? []).map((m) => `<span class="o58-chip${loaded.has(m) ? ' on' : ''}" title="${loaded.has(m) ? 'Lastet i minnet' : ''}">${esc(m)}${loaded.has(m) ? ' · lastet' : ''}</span>`).join('');
  return `<div class="ac-sec"><span class="ac-lab">MAC MINI · OMLX</span><div class="ac-card o58" style="padding:12px 14px">
      <b>oMLX på Mac mini-en</b>
      <div class="ac-mut" role="status">${esc(statusLine())}</div>
      ${chips ? `<div class="o58-models" aria-label="Modeller i oMLX">${chips}</div><div class="ac-mut" style="font-size:12px">${h?.loadedKnown ? 'Grønn ramme = lastet i minnet.' : 'oMLX oppgir ikke hvilke modeller som er lastet (se admin-panelet på Mac-en).'}</div>` : ''}
      <form class="o58-form" data-o58-form>
        <input name="url" value="${esc(c.url ?? '')}" placeholder="http://10.69.1.173:8040" autocomplete="off" spellcheck="false" aria-label="Adressen til oMLX-vakten (i huset)">
        <input name="key" type="password" value="" placeholder="${c.keySet ? 'Nøkkel er lagret – skriv en ny for å bytte' : 'Nøkkelen tools/omlx/install.sh skrev ut'}" autocomplete="new-password" aria-label="Nøkkel">
        <input name="text" value="${esc(c.models?.text ?? '')}" placeholder="${esc(c.defaults?.text ?? '')}" autocomplete="off" spellcheck="false" aria-label="Tekstmodell (MLX-ID)">
        <input name="vision" value="${esc(c.models?.vision ?? '')}" placeholder="${esc(c.defaults?.vision ?? '')}" autocomplete="off" spellcheck="false" aria-label="Bildemodell (MLX-ID)">
        <div class="o58-btns"><button type="submit" class="ac-b ink"${S.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="ac-b line" data-o58-test${S.busy || !c.url ? ' disabled' : ''}>Test</button><button type="button" class="ac-b line" data-o58-fresh${S.busy ? ' disabled' : ''}>Sjekk nå</button></div>
        ${S.msg ? `<span class="ac-mut" role="status">${esc(S.msg)}</span>` : ''}
      </form>
      <div class="ac-note">Tom adresse slår oMLX av. Serveren godtar bare adresser i huset, aldri Cloudflare. Nøkkelen lagres kryptert og vises aldri. Embeddings, Chat, kategorisering og strekkoder går alltid til Ollama. På 16 GB bør ikke Ollama og oMLX holde samme modell samtidig: <span class="ac-mono">ollama stop qwen3:8b</span> før du bytter (docs/omlx-58.md).</div></div></div>`;
}
function rtHtml() {
  const c = S.cfg;
  if (!c) return '';
  const ready = !!c.url;
  const rows = (c.tasks ?? []).map((t) => {
    const e = c.engines?.[t] ?? 'ollama', model = c.models?.[t] ?? (['rc', 'bar'].includes(t) ? c.models?.vision : c.models?.text);
    return `<div class="o58-rt"><span class="o58-grow"><b>${esc(TASK_NAMES[t] ?? t)}</b><span>${e === 'omlx' ? `oMLX · ${esc(model)}` : 'Ollama · modellen over'}</span></span>
      <div class="ac-seg" role="group" aria-label="Motor for ${esc(TASK_NAMES[t] ?? t)}">${[['ollama', 'Ollama'], ['omlx', 'oMLX']].map(([v, l]) => `<button type="button" class="${e === v ? 'on' : ''}" data-o58-engine="${t}" data-v="${v}" aria-pressed="${e === v}"${S.busy || (v === 'omlx' && !ready && e !== 'omlx') ? ' disabled' : ''}>${l}</button>`).join('')}</div></div>`;
  }).join('');
  const fb = c.fallbackOllama !== false;
  return `<div class="ac-sec"><span class="ac-lab">MOTOR PER OPPGAVE</span><div class="ac-card ac-list o58" style="padding:4px 14px">${rows}</div>
    <div class="ac-card ac-list" style="margin-top:8px"><button type="button" class="ac-li" data-o58-fb role="switch" aria-checked="${fb}"${S.busy ? ' disabled' : ''}><span class="ac-col ac-grow"><b>Bruk Ollama hvis oMLX ikke svarer</b><span>Ingen kontakt eller 5xx → samme spørsmål til Ollama med Ollama-modellen, merket «via Ollama». Gjelder også Open WebUI.</span></span><span class="ac-sw${fb ? ' on' : ''}" aria-hidden="true"><i></i></span></button></div>
    <div class="ac-note">${ready ? 'Ollama er standard. Bytt en oppgave til oMLX når eval har vist at den er bedre (npm run eval -- --backend omlx, se docs/omlx-58.md).' : 'oMLX er ikke satt opp ennå (fanen Modeller › oMLX på Mac mini-en).'}${S.rtMsg ? ` <b role="status">${esc(S.rtMsg)}</b>` : ''}</div></div>`;
}

const repaint = () => {
  for (const el of document.querySelectorAll('[data-omlx58-ai]')) el.innerHTML = S.admin ? aiHtml() : '';
  for (const el of document.querySelectorAll('[data-omlx58-rt]')) el.innerHTML = S.admin ? rtHtml() : '';
};
let raf = 0;
function decorate() {
  const els = [...document.querySelectorAll('[data-omlx58-ai]:not([data-o58-done]),[data-omlx58-rt]:not([data-o58-done])')];
  if (!els.length || S.admin === false) return;
  css();
  for (const el of els) { el.dataset.o58Done = '1'; el.innerHTML = el.hasAttribute('data-omlx58-rt') ? rtHtml() : aiHtml(); }
  load().then(repaint);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };

document.addEventListener('submit', async (e) => {
  const f = e.target.closest?.('[data-o58-form]');
  if (!f) return;
  e.preventDefault();
  const body = { url: f.url.value.trim(), models: { text: f.text.value.trim(), vision: f.vision.value.trim() } };
  if (f.key.value.trim()) body.key = f.key.value.trim();
  S.busy = true; S.msg = 'Lagrer …'; repaint();
  try { await put(body); S.msg = 'Lagret. Sjekker Mac mini-en …'; await load(true); S.msg = ''; } catch (err) { S.msg = err.message; }
  S.busy = false; repaint();
});
document.addEventListener('click', async (e) => {
  const eng = e.target.closest?.('[data-o58-engine]'), fb = e.target.closest?.('[data-o58-fb]');
  if (e.target.closest?.('[data-o58-fresh]')) { S.busy = true; repaint(); await load(true); S.busy = false; repaint(); return; }
  if (e.target.closest?.('[data-o58-test]')) {
    S.busy = true; S.msg = 'Tester (første svar kan ta tid mens modellen lastes) …'; repaint();
    try {
      const j = await fetch('/api/admin/omlx58/test', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).then((r) => r.json());
      S.msg = j.ok ? `OK på ${j.ms} ms · ${j.model ?? ''} · «${String(j.text ?? '').slice(0, 40)}»` : `Feilet: ${j.error ?? 'ukjent feil'}`;
      await load(true);
    } catch (err) { S.msg = err.message; }
    S.busy = false; repaint(); return;
  }
  if (!eng && !fb) return;
  S.busy = true; S.rtMsg = ''; repaint();
  try {
    if (eng) { await put({ engines: { [eng.dataset.o58Engine]: eng.dataset.v } }); S.rtMsg = `${TASK_NAMES[eng.dataset.o58Engine] ?? eng.dataset.o58Engine}: ${eng.dataset.v === 'omlx' ? 'oMLX' : 'Ollama'}`; }
    else { await put({ fallbackOllama: !(S.cfg?.fallbackOllama !== false) }); S.rtMsg = S.cfg.fallbackOllama ? 'Reserven til Ollama er på' : 'Reserven til Ollama er av'; }
  } catch (err) { S.rtMsg = err.message; }
  S.busy = false; repaint();
});

function boot() { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); }
if (typeof document !== 'undefined') { if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot); }

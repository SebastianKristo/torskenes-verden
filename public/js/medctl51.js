// Prompt 51 (MEDCTL51): fjernkontroll for «Spilles nå» – felles for web (playback44.js) og PWA (finans/js/mobile-p44a.js).
// Data: GET /api/medctl51/now → {items:[Ctl], audio:[Lyd], admin}. Kommando: POST /api/medctl51/sessions/:id/:action
// (play|pause|toggle|stop|next|previous|seek {offset|position}|volume {volume}). Serveren avgjør hvem som kan styre hva
// (egne avspillinger, admin alle) og har rate limit; her vises bare knappene serveren sier er lov. Tåler 404 (eldre server).
const C = { items: new Map(), audio: [], admin: false, missing: false, at: 0, busy: new Set(), note: new Map(), links: null, linksOpen: false, linkMsg: new Map() };
const REPAINT = new Set();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const repaint = () => { for (const fn of REPAINT) { try { fn(); } catch { /* */ } } };

/** Henter kontrolltilstanden (maks hvert 4. sekund uten force). */
export async function loadCtl51(force = false) {
  if (C.missing || (!force && Date.now() - C.at < 4000)) return C;
  C.at = Date.now();
  try {
    const r = await fetch('/api/medctl51/now', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 404) { C.missing = true; return C; }
    if (!r.ok) return C;
    const d = await r.json();
    C.items = new Map((d.items ?? []).map((x) => [x.id, x]));
    C.audio = Array.isArray(d.audio) ? d.audio : [];
    C.admin = !!d.admin;
  } catch { /* uten nett: knappene forsvinner ikke, men gjør ingenting nytt */ }
  return C;
}
export const ctlItem51 = (id) => C.items.get(id) ?? null;

const BTN = {
  previous: ['⏮', 'Forrige'], back: ['−30', 'Spol 30 sekunder tilbake'], fwd: ['+30', 'Spol 30 sekunder frem'], next: ['⏭', 'Neste'], stop: ['■', 'Stopp'],
};
const b = (id, act, [icon, label], extra = '') => `<button type="button" class="mc51-b" data-mc51="${act}" data-mc51-id="${esc(id)}" aria-label="${esc(label)}" title="${esc(label)}"${C.busy.has(id) ? ' disabled' : ''}${extra}>${icon}</button>`;

/** Knapperad for en avspilling (id fra /api/playback/sessions). Tom streng når serveren ikke kjenner den. */
export function ctlBar51(id) {
  const x = C.items.get(id);
  if (!x) return '';
  const note = C.note.get(id);
  const msg = note ? `<span class="mc51-msg${note.err ? ' err' : ''}" role="status">${esc(note.text)}</span>` : '';
  if (!x.canControl) return x.controlText ? `<div class="mc51 mc51-off"><span class="mc51-msg">${esc(x.controlText)}</span></div>` : '';
  const has = (k) => x.controls.includes(k), playing = x.state !== 'paused';
  const parts = [];
  if (has('previous')) parts.push(b(id, 'previous', BTN.previous));
  if (has('seek')) parts.push(b(id, 'back', BTN.back));
  if (has('playpause')) parts.push(b(id, 'toggle', playing ? ['❚❚', 'Pause'] : ['▶', 'Spill av'], ` aria-pressed="${!playing}"`));
  if (has('seek')) parts.push(b(id, 'fwd', BTN.fwd));
  if (has('next')) parts.push(b(id, 'next', BTN.next));
  if (has('stop')) parts.push(b(id, 'stop', BTN.stop));
  const vol = has('volume') ? `<label class="mc51-vol"><span aria-hidden="true">🔈</span><input type="range" min="0" max="100" step="5" value="${x.volume ?? 50}" data-mc51-vol="${esc(id)}" aria-label="Volum"${C.busy.has(id) ? ' disabled' : ''}></label>` : '';
  return `<div class="mc51" role="group" aria-label="Fjernkontroll for ${esc(x.title)}">${parts.join('')}${vol}${x.mine ? '' : '<span class="mc51-tag">admin</span>'}${msg}</div>`;
}

/** Audiobookshelf: åpne lytteøkter med fremdrift (bare lesing). */
export function audioNow51() {
  if (!C.audio.length) return '';
  return `<div class="mc51-audio"><b class="mc51-h">Lydbøker og podkaster nå</b>${C.audio.map((x) => `<div class="mc51-ar"><span class="mc51-at"><b>${esc(x.title)}</b><small>${esc([x.author, x.user, x.device].filter(Boolean).join(' · '))}</small></span>
    <span class="mc51-bar" aria-label="Fremdrift ${esc(x.progressText)}"><i style="width:${Math.max(0, Math.min(100, +x.progress || 0))}%"></i></span><small class="mc51-pt">${esc(x.positionText)} / ${esc(x.durationText)} · ${esc(x.remainingText)}</small><small class="mc51-msg">${esc(x.controlText ?? '')}</small></div>`).join('')}</div>`;
}

/* ---- Admin: koble Homelab-brukere til Plex-/Jellyfin-/Audiobookshelf-navn (bare koblingen gir styring; unik per tjeneste) ---- */
const SV = [['plex', 'Plex'], ['jellyfin', 'Jellyfin'], ['abs', 'Audiobookshelf']];
async function loadLinks() {
  try { const r = await fetch('/api/medctl51/links', { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) C.links = (await r.json()).links ?? []; } catch { /* */ }
  repaint();
}
/** Admin-panelet «Hvem kan styre» (sammenleggbart). Tom streng for andre enn admin. */
export function linksHtml51() {
  if (!C.admin || C.missing) return '';
  const rows = !C.linksOpen ? '' : C.links == null ? '<span class="mc51-msg">Henter …</span>' : C.links.map((u) => {
    const m = C.linkMsg.get(u.userId);
    return `<form class="mc51-lr" data-mc51-link="${esc(u.userId)}"><b>${esc(u.name)}</b>${SV.map(([k, n]) => `<label><span>${n}</span><input name="mc51-${k}-${esc(u.userId)}" data-k="${k}" value="${esc(u[k] ?? '')}" autocomplete="off" data-glimt="off" aria-label="${n}-navn for ${esc(u.name)}"></label>`).join('')}<button type="submit" class="mc51-sb">Lagre</button>${m ? `<span class="mc51-msg${m.err ? ' err' : ''}" role="status">${esc(m.text)}</span>` : ''}</form>`;
  }).join('');
  return `<div class="mc51-links"><button type="button" class="mc51-sb" data-mc51-links aria-expanded="${C.linksOpen}">Hvem kan styre avspillinger ${C.linksOpen ? '▴' : '▾'}</button>${C.linksOpen ? '<small class="mc51-msg">Bare koblingen her gir en bruker styring av egne avspillinger. Navnet må være det samme som i Plex/Jellyfin/Audiobookshelf, og kan bare kobles til én bruker. Administratorer kan styre alle.</small>' : ''}${rows}</div>`;
}
async function saveLink(f) {
  const id = f.dataset.mc51Link, body = Object.fromEntries(SV.map(([k]) => [k, f.querySelector(`[data-k="${k}"]`)?.value ?? '']));
  try {
    const r = await fetch(`/api/medctl51/links/${encodeURIComponent(id)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null);
    C.linkMsg.set(id, r.ok ? { text: 'Lagret' } : { text: d?.error ?? `Feil ${r.status}`, err: true });
    if (r.ok && C.links) C.links = C.links.map((u) => (u.userId === id ? d.link : u));
  } catch { C.linkMsg.set(id, { text: 'Fikk ikke kontakt med serveren', err: true }); }
  repaint();
  if (C.linkMsg.get(id) && !C.linkMsg.get(id).err) { loadCtl51(true).then(repaint); setTimeout(() => { C.linkMsg.delete(id); repaint(); }, 3000); }
}

async function send(id, action, body) {
  const x = C.items.get(id); if (!x || C.busy.has(id)) return;
  if (action === 'stop' && !x.mine && !confirm(`Stoppe «${x.title}» for ${x.user}?`)) return;
  C.busy.add(id); repaint();
  try {
    const r = await fetch(`/api/medctl51/sessions/${encodeURIComponent(id)}/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
    if (!r.ok) C.note.set(id, { text: d?.error ?? `Feil ${r.status}`, err: true });
    else { if (d?.item) C.items.set(id, d.item); C.note.set(id, { text: d?.message ?? 'OK' }); }
  } catch { C.note.set(id, { text: 'Fikk ikke kontakt med serveren', err: true }); }
  C.busy.delete(id); repaint();
  setTimeout(() => { C.note.delete(id); loadCtl51(true).then(repaint); }, 2500);
}

let bound = false;
/** Registrer en tegnefunksjon (kalles etter kommandoer og oppdateringer) og koble på klikk én gang. */
export function mountCtl51(redraw) {
  if (redraw) REPAINT.add(redraw);
  css();
  if (bound) return;
  bound = true;
  // Utkast overlever omtegning (Spilles nå tegnes hvert 10. s).
  document.addEventListener('input', (e) => { const f = e.target.closest?.('[data-mc51-link]'), k = e.target.dataset?.k; if (!f || !k || !C.links) return; const u = C.links.find((x) => x.userId === f.dataset.mc51Link); if (u) u[k] = e.target.value; }, true);
  document.addEventListener('submit', (e) => { const f = e.target.closest?.('[data-mc51-link]'); if (!f) return; e.preventDefault(); e.stopPropagation(); saveLink(f); }, true);
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-mc51-links]')) { e.preventDefault(); e.stopPropagation(); C.linksOpen = !C.linksOpen; if (C.linksOpen && C.links == null) loadLinks(); repaint(); return; }
    const el = e.target.closest?.('[data-mc51]'); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    const id = el.dataset.mc51Id, a = el.dataset.mc51;
    if (a === 'back') send(id, 'seek', { offset: -30_000 });
    else if (a === 'fwd') send(id, 'seek', { offset: 30_000 });
    else send(id, a);
  }, true);
  document.addEventListener('change', (e) => { const el = e.target.closest?.('[data-mc51-vol]'); if (el) send(el.dataset.mc51Vol, 'volume', { volume: +el.value }); }, true);
}

function css() {
  if (document.getElementById('mc51-css')) return;
  const s = document.createElement('style');
  s.id = 'mc51-css';
  s.textContent = `.mc51{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px}
.mc51 .mc51-b{min-width:44px;min-height:44px;padding:0 10px;border-radius:12px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);background:transparent;color:inherit;font:inherit;font-size:15px;font-variant-numeric:tabular-nums;cursor:pointer}
.mc51 .mc51-b:hover{background:color-mix(in srgb,currentColor 8%,transparent)}.mc51 .mc51-b:focus-visible,.mc51-vol input:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.mc51 .mc51-b[disabled]{opacity:.5;cursor:progress}.mc51-vol{display:inline-flex;align-items:center;gap:6px;min-height:44px}.mc51-vol input{width:110px;min-height:44px;accent-color:currentColor}
.mc51-msg{font-size:13px;opacity:.85}.mc51-msg.err{color:#b23a2a;opacity:1}.mc51-off{margin-top:6px}.mc51-tag{font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
.mc51-audio{display:flex;flex-direction:column;gap:10px;margin-top:16px}.mc51-h{font-size:15px}.mc51-ar{display:flex;flex-direction:column;gap:4px;padding:12px;border-radius:14px;border:1px solid color-mix(in srgb,currentColor 18%,transparent)}
.mc51-at{display:flex;flex-direction:column}.mc51-bar{display:block;height:6px;border-radius:3px;background:color-mix(in srgb,currentColor 15%,transparent);overflow:hidden}.mc51-bar i{display:block;height:100%;background:currentColor}.mc51-pt{font-variant-numeric:tabular-nums}
.mc51-links{display:flex;flex-direction:column;gap:8px;margin-top:16px}.mc51-links .mc51-sb{align-self:flex-start;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);background:transparent;color:inherit;font:inherit;cursor:pointer}
.mc51-lr{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;padding:10px 12px;border-radius:14px;border:1px solid color-mix(in srgb,currentColor 18%,transparent)}.mc51-lr b{flex:1 1 100%}
.mc51-lr label{display:flex;flex-direction:column;gap:2px;font-size:12px;flex:1 1 120px}.mc51-lr input{min-height:44px;padding:0 10px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);background:transparent;color:inherit;font:inherit}
.mc51-links .mc51-sb:focus-visible,.mc51-lr input:focus-visible{outline:2px solid currentColor;outline-offset:2px}`;
  document.head.appendChild(s);
}

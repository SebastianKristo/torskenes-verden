// Prompt 41: Bursdager på web.
// - claude-code-bursdag-jenka-glimt.md: når noen har bursdag i dag, går et jenka-tog langs bunnen av det røde toppkortet
//   (Glimt først med festhatt og trompet, så Stjerne, Gris, Ugle, Boble og Spire), noter fra trompeten og konfetti bak teksten.
//   Lyd (kort fanfare) bare første gang i dag og bare når lyd er på. Redusert bevegelse: toget står stille, ingen konfetti.
// - claude-code-bursdag-bilder.md: last opp bilde for personer uten bilde. POST /api/birthdays/:id/photos (maks 8),
//   GET …/photos, DELETE …/photos/:pid. Bildet beskjæres til kvadrat og skaleres før opplasting. «Bruk bildet fra Familie».
import { api, esc } from './util.js';
import { fig } from './glimt-figs.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const CONF = ['#f2c14e', '#ffffff', '#9fe0c4', '#a9d4ff', '#ffc9a8', '#c9b4ff'];
const TRAIN = ['stjerne', 'gris', 'ugle', 'boble', 'spire'];
const TRUMPET = '<svg class="bd41-tr" width="30" height="18" viewBox="0 0 30 18" aria-hidden="true"><path d="M2 7h12l10-6v16l-10-6H2z" fill="#f2c14e" stroke="#b8861a" stroke-width="1.2"/><rect x="0" y="6" width="3" height="6" rx="1" fill="#b8861a"/><circle cx="9" cy="9" r="1.4" fill="#b8861a"/></svg>';

/** Feiringen inne i toppkortet (konfetti + tog). Bare dekor (aria-hidden). */
export function partyHtml41() {
  const rm = reduced();
  const conf = rm ? '' : Array.from({ length: 30 }, (_, i) => {
    const r = (k) => ((Math.sin((i + 1) * 77.7 + k * 13.1) * 43758.5) % 1 + 1) % 1;
    return `<i style="left:${(r(1) * 100).toFixed(1)}%;width:${(5 + r(2) * 5).toFixed(1)}px;height:${(7 + r(3) * 6).toFixed(1)}px;border-radius:${r(4) > 0.55 ? '50%' : '2px'};background:${CONF[i % CONF.length]};animation-duration:${(3.2 + r(5) * 2.6).toFixed(2)}s;animation-delay:-${(r(6) * 5).toFixed(2)}s"></i>`;
  }).join('');
  const notes = rm ? '' : ['♪', '♫', '♪'].map((n, i) => `<b class="bd41-note" style="animation-delay:${(i * 0.55).toFixed(2)}s;color:${CONF[(i * 2) % CONF.length]}">${n}</b>`).join('');
  const lead = `<span class="bd41-car lead" style="--d:0s">${fig('glimt', 50, 'glad', { ph: 'fest' })}<span class="bd41-trw">${TRUMPET}${notes}</span></span>`;
  const cars = TRAIN.map((id, i) => `<span class="bd41-car" style="--d:${((i + 1) * 0.07).toFixed(2)}s">${fig(id, 40, 'glad', { ph: 'fest' })}</span>`).join('');
  return `<span class="bd41-party${rm ? ' still' : ''}" aria-hidden="true"><span class="bd41-conf">${conf}</span><span class="bd41-shade"></span><span class="bd41-train"><span class="bd41-row">${lead}${cars}</span></span></span>`;
}

/** Fanfare (1,2 s, Web Audio) første gang kortet vises i dag, bare når lyd er på i appen. */
export function fanfare41() {
  const k = `bd41_fanfare_${new Date().toDateString()}`;
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch { return; }
  let on = true;
  try { on = localStorage.getItem('hl_sound') !== 'off' && localStorage.getItem('sound') !== 'off'; } catch { /* */ }
  if (!on || reduced()) return;
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    if (A.state === 'suspended') { A.close(); return; } // ingen brukerhandling ennå: ingen lyd
    const notes = [[523.25, 0, 0.16], [659.25, 0.18, 0.16], [783.99, 0.36, 0.16], [1046.5, 0.56, 0.6]];
    for (const [f, t, d] of notes) {
      const o = A.createOscillator(), g = A.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(0, A.currentTime + t); g.gain.linearRampToValueAtTime(0.06, A.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, A.currentTime + t + d);
      o.connect(g).connect(A.destination); o.start(A.currentTime + t); o.stop(A.currentTime + t + d + 0.05);
    }
    setTimeout(() => A.close(), 1600);
  } catch { /* uten lyd */ }
}
/** Start toget på nytt (trykk på kortet). */
export function restartParty41(root) {
  const t = root?.querySelector('.bd41-row');
  if (!t) return;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
}

/* ---------- Bilder ---------- */
const P = { photos: new Map(), busy: null, fam: null, famAt: 0 };
export const photosOf = (id) => P.photos.get(String(id)) ?? null;
export async function loadPhotos41(id, repaint) {
  if (P.photos.has(String(id))) return;
  P.photos.set(String(id), []);
  try { const r = await api(`/birthdays/${encodeURIComponent(id)}/photos`); P.photos.set(String(id), (Array.isArray(r) ? r : r?.photos ?? r?.items ?? []).map((x) => ({ id: x.id ?? x.pid, url: x.url ?? x.thumb ?? x.src, primary: !!x.primary }))); }
  catch { /* 404: ingen bilder ennå */ }
  repaint?.();
}
export async function loadFamily41(repaint) {
  if (P.fam || Date.now() - P.famAt < 60_000) return;
  P.famAt = Date.now();
  try { const d = await api('/family'); P.fam = [...(d?.members ?? d?.people ?? []), ...(d?.me ? [d.me] : [])]; repaint?.(); } catch { P.fam = []; }
}
const famMatch = (x) => (P.fam ?? []).find((m) => m?.name && x?.name && m.name.split(/\s+/)[0].toLowerCase() === x.name.split(/\s+/)[0].toLowerCase() && (m.photoUrl || m.avatarUrl));
/** Blokken øverst i detaljene til en person. */
export function photoBlock41(x) {
  const has = !!x.avatarUrl, L = photosOf(x.id) ?? [], f = !has ? famMatch(x) : null, busy = P.busy === String(x.id);
  const cam = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  return `<div class="bd41-ph">
    <label class="bd-btn sm bd41-up${busy ? ' busy' : ''}">${cam}${busy ? 'Laster opp …' : has ? 'Bytt bilde' : 'Last opp bilde'}<input type="file" accept="image/*" hidden data-bd41-up="${esc(x.id)}"${busy || L.length >= 8 ? ' disabled' : ''}></label>
    ${has ? `<button type="button" class="bd-btn sm" data-bd41-rm="${esc(x.id)}">Fjern bilde</button>` : ''}
    ${f ? `<button type="button" class="bd-btn sm" data-bd41-fam="${esc(x.id)}" data-url="${esc(f.photoUrl ?? f.avatarUrl)}">Bruk bildet fra Familie</button>` : ''}
    ${L.length > 1 ? `<span class="bd41-thumbs">${L.map((p) => `<span style="background-image:url('${esc(String(p.url).replace(/'/g, '%27'))}')"><button type="button" data-bd41-del="${esc(x.id)}" data-pid="${esc(p.id)}" aria-label="Slett bildet">×</button></span>`).join('')}</span>` : ''}
  </div>`;
}
/** Kvadrat fra midten, 256 × 256, JPEG 82 %. */
async function square(file, size = 256) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w, h, src;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else { const url = URL.createObjectURL(file); src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); w = src.naturalWidth; h = src.naturalHeight; }
  const s = Math.min(w, h), c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.getContext('2d').drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.82));
}
async function uploadBlob(id, blob) {
  const fd = new FormData();
  fd.append('file', blob, 'bilde.jpg');
  return api(`/birthdays/${encodeURIComponent(id)}/photos`, { method: 'POST', body: fd });
}
/** Klikk/endring i Bursdager. Returnerer true når håndtert. ctx: {byId, reload, flash, paint} */
export async function photoAct41(e, ctx) {
  const t = e.target;
  if (e.type === 'change' && t.matches?.('[data-bd41-up]')) {
    const id = t.dataset.bd41Up, f = t.files?.[0];
    if (!f) return true;
    P.busy = String(id); ctx.paint();
    try { const b = await square(f); const r = await uploadBlob(id, b); P.photos.delete(String(id)); await ctx.reload(); ctx.flash(r?.toast ?? `Bilde lagt til for ${ctx.byId(id)?.name ?? 'personen'}`); }
    catch (er) { ctx.flash(er.status === 404 ? 'Serveren tar ikke imot bilder ennå. Oppdater Homelab.' : `Fikk ikke lastet opp: ${er.message}`); }
    P.busy = null; ctx.paint();
    return true;
  }
  if (e.type !== 'click') return false;
  const rm = t.closest?.('[data-bd41-rm]'), del = t.closest?.('[data-bd41-del]'), fam = t.closest?.('[data-bd41-fam]');
  if (rm || del) {
    const id = (rm ?? del).dataset.bd41Rm ?? del.dataset.bd41Del;
    let pid = del?.dataset.pid;
    if (!pid) { await loadPhotos41(id); pid = photosOf(id)?.[0]?.id; }
    try { if (pid) await api(`/birthdays/${encodeURIComponent(id)}/photos/${encodeURIComponent(pid)}`, { method: 'DELETE' }); else await api(`/birthdays/${encodeURIComponent(id)}/photo`, { method: 'DELETE' }); P.photos.delete(String(id)); await ctx.reload(); ctx.flash('Bildet er fjernet'); }
    catch (er) { ctx.flash(er.message); }
    return true;
  }
  if (fam) {
    const id = fam.dataset.bd41Fam;
    try { const r = await api(`/birthdays/${encodeURIComponent(id)}/photos`, { method: 'POST', json: { fromFamily: true } }); P.photos.delete(String(id)); await ctx.reload(); ctx.flash(r?.toast ?? `Bilde lagt til for ${ctx.byId(id)?.name ?? 'personen'}`); }
    catch (er) { ctx.flash(`Fikk ikke brukt bildet: ${er.message}`); }
    return true;
  }
  return false;
}

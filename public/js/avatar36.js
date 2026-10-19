// Prompt 36: profilbilde i Konto (claude-code-konto-profilbilde.md).
// Bildevalg med beskjæring i sirkel (zoom + dra), lagres som 512 × 512 WebP: PUT /api/me/avatar → {url:'/api/me/avatar?v=<hash>'}.
// Eldre server (404/405): POST /api/me/avatar med skjema-fil som før. DELETE /api/me/avatar fjerner.
// Etter lagring oppdateres menyen, hilsenen og alt som viser bildet med en gang (hendelsen hl:avatar).
import { api, esc } from './util.js';
import { store } from './store.js';
import { applyProfile } from './profile.js';

const SZ = 512, VIEW = 280;

function pickFile() {
  return new Promise((ok) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.addEventListener('change', () => ok(i.files?.[0] ?? null), { once: true });
    i.click();
  });
}
async function loadImg(file) {
  try { return await createImageBitmap(file); } catch {
    return new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error('Kunne ikke lese bildet. Prøv JPG eller PNG.')); img.src = URL.createObjectURL(file); });
  }
}
function cropDialog(img) {
  return new Promise((done) => {
    const W = img.width, H = img.height, base = Math.max(VIEW / W, VIEW / H);
    const st = { z: 1, x: 0, y: 0 };
    const d = document.createElement('div');
    d.className = 'av36-scrim';
    d.innerHTML = `<div class="av36-dlg" role="dialog" aria-modal="true" aria-label="Beskjær profilbildet"><b class="av36-t">Profilbilde</b><span class="av36-s">Dra for å flytte, og zoom med glidebryteren.</span>
      <div class="av36-view"><canvas width="${VIEW * 2}" height="${VIEW * 2}"></canvas><span class="av36-mask"></span></div>
      <label class="av36-zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"></label>
      <div class="av36-acts"><button type="button" class="sg-btn" data-av-x>Avbryt</button><button type="button" class="sg-btn pri" data-av-ok>Lagre</button></div></div>`;
    document.body.appendChild(d);
    const cv = d.querySelector('canvas'), ctx = cv.getContext('2d');
    const clamp = () => { const k = base * st.z, mx = Math.max(0, (W * k - VIEW) / 2), my = Math.max(0, (H * k - VIEW) / 2); st.x = Math.max(-mx, Math.min(mx, st.x)); st.y = Math.max(-my, Math.min(my, st.y)); };
    const draw = (c, s) => { const k = base * st.z * s, g = c.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, c.width / 2 - (W * k) / 2 + st.x * s, c.height / 2 - (H * k) / 2 + st.y * s, W * k, H * k); };
    const paint = () => { clamp(); draw(cv, 2); };
    paint(); void ctx;
    let p = null;
    cv.addEventListener('pointerdown', (e) => { p = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!p) return; st.x = p.sx + e.clientX - p.x; st.y = p.sy + e.clientY - p.y; paint(); });
    cv.addEventListener('pointerup', () => { p = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); st.z = Math.max(1, Math.min(4, st.z * (e.deltaY < 0 ? 1.06 : 0.94))); d.querySelector('input').value = st.z; paint(); }, { passive: false });
    d.querySelector('input').addEventListener('input', (e) => { st.z = +e.target.value; paint(); });
    const close = (v) => { d.remove(); removeEventListener('keydown', onK); done(v); };
    const onK = (e) => { if (e.key === 'Escape') close(null); };
    addEventListener('keydown', onK);
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-av-x]')) return close(null);
      if (e.target.closest('[data-av-ok]')) {
        const out = document.createElement('canvas'); out.width = out.height = SZ; draw(out, SZ / VIEW);
        out.toBlob((b) => { if (b && b.type === 'image/webp') return close(b); out.toBlob((j) => close(j), 'image/jpeg', 0.9); }, 'image/webp', 0.9);
      }
    });
  });
}
function setUrl(url) {
  store.me.me = { ...(store.me.me ?? {}), avatarUrl: url };
  applyProfile();
  document.dispatchEvent(new Event('hl:avatar'));
}
export async function changeAvatar() {
  const f = await pickFile();
  if (!f) return;
  let img;
  try { img = await loadImg(f); } catch (e) { alert(e.message); return; }
  const blob = await cropDialog(img);
  if (!blob) return;
  try {
    const r = await api('/me/avatar', { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
    setUrl(r?.url ?? r?.avatarUrl ?? `/api/me/avatar?v=${Date.now()}`);
  } catch (e) {
    if (e.status !== 404 && e.status !== 405 && e.status !== 415 && e.status !== 400) { alert(`Kunne ikke lagre bildet: ${e.message}`); return; }
    try { const fd = new FormData(); fd.append('file', blob, blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg'); const me = await api('/me/avatar', { method: 'POST', body: fd }); setUrl(me?.avatarUrl ?? me?.url ?? null); }
    catch (e2) { alert(`Kunne ikke lagre bildet: ${e2.message}`); }
  }
}
export async function deleteAvatar() {
  if (!confirm('Fjerne profilbildet?')) return;
  try { const r = await api('/me/avatar', { method: 'DELETE' }); setUrl(r?.avatarUrl ?? null); } catch (e) { alert(e.message); }
}
const ini = (n) => esc(String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
/** Stort bilde i toppen av Konto (96 px, ring), med «Endre» ved hover. */
export function kontoAvatar(me) {
  return `<button type="button" class="ka36" data-av36 aria-label="Endre profilbilde">${me?.avatarUrl ? `<img src="${esc(me.avatarUrl)}" alt="">` : `<span class="ka36-ini">${ini(me?.name || me?.username)}</span>`}<span class="ka36-ov" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>Endre</span></button>`;
}
/** Raden «Profilbilde» med miniatyr og knappene under. */
export function avatarRow(me) {
  return `<div class="sg-row ka36-row"><span class="sg-txt"><b>Profilbilde</b><span>Vises i menyen, i hilsenen, i mobilappen og i delte boliger.</span></span>${me?.avatarUrl ? `<img class="ka36-th" src="${esc(me.avatarUrl)}" alt="">` : `<span class="ka36-th ka36-ini">${ini(me?.name || me?.username)}</span>`}<button type="button" class="sg-btn2" data-av36>Endre</button></div>
    <div class="ka36-acts"><button type="button" class="sg-btn" data-av36>Last opp nytt</button>${me?.avatarUrl ? '<button type="button" class="sg-btn ka36-del" data-av36-del>Fjern</button>' : ''}</div>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-av36]')) { e.preventDefault(); e.stopPropagation(); changeAvatar(); }
  else if (e.target.closest('[data-av36-del]')) { e.preventDefault(); e.stopPropagation(); deleteAvatar(); }
}, true);

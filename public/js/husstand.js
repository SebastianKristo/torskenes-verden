// Prompt 37 (WEB37): husstandens personer (brukere koblet til profiler) for delte lister, delte abonnementer og avatarer.
// Kilde i rekkefølge: GET /api/profiles (profiler med userId), /api/users, /api/tasks/lists → members. Alle tåler 404.
const PAL = ['#2b5d8a', '#b23a2a', '#2f6b45', '#a8661a', '#7a5ad6', '#c2477a', '#3d7f8a', '#5b4fc4'];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
let cache = null, at = 0, me = null;

const j = (p) => fetch(p, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : Promise.reject(Object.assign(new Error(`Feil ${r.status}`), { status: r.status }))));
/** Stabil farge per navn/ID når serveren ikke gir en. */
export function colorFor(key) { let h = 0; for (const c of String(key ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAL[h % PAL.length]; }

/** [{id (userId), name, color, avatarUrl, profileId}] – bare personer med bruker. */
export async function household(force = false) {
  if (!force && cache && Date.now() - at < 60_000) return cache;
  let out = [];
  const pr = await j('/api/profiles').catch(() => null);
  if (Array.isArray(pr?.profiles)) {
    out = pr.profiles.filter((p) => p.userId).map((p) => ({ id: p.userId, name: p.name, color: p.color || colorFor(p.name), avatarUrl: p.avatar || null, profileId: p.id }));
    if (pr.me?.profileId) me = pr.profiles.find((p) => p.id === pr.me.profileId)?.userId ?? me;
  }
  if (!out.length) {
    const us = await j('/api/users').catch(() => null);
    if (Array.isArray(us?.users)) { out = us.users.map((u) => ({ id: u.id, name: u.displayName ?? u.name ?? u.username, color: u.color || colorFor(u.displayName ?? u.username), avatarUrl: u.avatarUrl ?? null })); me = us.me?.id ?? me; }
  }
  if (!out.length) {
    const tl = await j('/api/tasks/lists').catch(() => null);
    out = (tl?.members ?? []).map((m) => ({ id: m.id ?? m.userId, name: m.name, color: m.color || colorFor(m.name), avatarUrl: m.avatarUrl ?? null }));
  }
  cache = out; at = Date.now();
  return out;
}
export const householdSync = () => cache ?? [];
export const meHint = () => me;

/** Små overlappende avatarer (initial + brukerfarge). */
export function avatars(people, size = 18, max = 3) {
  const L = (people ?? []).slice(0, max);
  if (!L.length) return '';
  return `<span class="hs37-av" style="--s:${size}px" aria-hidden="true">${L.map((p) => `<i style="background:${esc(p.color || colorFor(p.name))}">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="" loading="lazy">` : esc(String(p.name ?? '?').slice(0, 1).toUpperCase())}</i>`).join('')}</span>`;
}
export function avatarCss() {
  if (document.getElementById('hs37-css')) return;
  const st = document.createElement('style'); st.id = 'hs37-css';
  st.textContent = '.hs37-av{display:inline-flex;align-items:center;flex:none;vertical-align:middle}.hs37-av i{width:var(--s);height:var(--s);border-radius:50%;margin-left:calc(var(--s) * -.3);box-shadow:0 0 0 1.5px var(--hs37-ring,#fff);color:#fff;font:800 calc(var(--s) * .52)/var(--s) Manrope,system-ui,sans-serif;font-style:normal;text-align:center;overflow:hidden;display:inline-block}.hs37-av i:first-child{margin-left:0}.hs37-av img{width:100%;height:100%;object-fit:cover;display:block}';
  document.head.appendChild(st);
}

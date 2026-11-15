// Prompt 44 (claude-code-rediger-andres-oppsett.md, web): «Logg inn som X» for admin, uten passord.
// POST /api/admin/impersonate {userId} → kortlevd token (30 min, fornyes ved aktivitet) med act:{sub:adminId}.
// - Tokenet ligger i sessionStorage («hl_as44») og legges på alle egne API-kall av hl-boot.js (før appen starter),
//   så hele appen er X sin. Admin-økta (informasjonskapselen) beholdes; «Gå ut» forkaster bare X-tokenet.
// - Fast stripe øverst i X sin farge: «Logget inn som X · N endringer lagret · Gå ut».
// - Gå ut → toast «Logget ut av X · N endringer lagret. Du er Sebastian igjen.» + Angre (4,5 s: legger tilbake oppsettet
//   X hadde før, GET/PUT /api/users/:id/layout).
// - Svarer serveren 401 på X-tokenet (utløpt), går vi ut automatisk.
import { esc, initials } from './util.js';

const KEY = 'hl_as44', OUT = 'hl_as44_out';
const ss = (k, v) => { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || 'null'); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* privat modus */ } return null; };
export const asState = () => ss(KEY);
const rawFetch = () => window.__hlFetch0 ?? window.fetch.bind(window);

async function j(path, opt = {}, raw = false) {
  const f = raw ? rawFetch() : fetch;
  const r = await f(path, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers ?? {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Serveren svarte ${r.status}`), { status: r.status });
  return d;
}

/** Starter «Logg inn som» og laster appen på nytt som X. */
export async function startAs(u) {
  const name = u.name || u.username || 'brukeren';
  let snap = null;
  try { snap = await j(`/api/users/${encodeURIComponent(u.id)}/layout`, {}, true); } catch { /* eldre server */ }
  try {
    const r = await j('/api/admin/impersonate', { method: 'POST', body: JSON.stringify({ userId: u.id, web: true }) }, true);
    ss(KEY, { id: u.id, name: r?.user?.name ?? name, color: r?.user?.color ?? u.color ?? null, token: r?.token ?? r?.accessToken ?? null, cookie: true, exp: r?.expiresAt ?? null, snap, n: 0, at: Date.now(), admin: r?.actor?.name ?? null });
    location.replace('/#/dash');
    setTimeout(() => location.reload(), 30);
  } catch (e) {
    alert(e.status === 404 ? 'Serveren har ikke «Logg inn som» ennå. Oppdater Nordlys først.' : e.status === 403 ? `Du kan ikke logge inn som ${name}.` : e.message);
  }
}

/** Gå ut: forkast X-tokenet, bruk admin-økta igjen. */
export async function stopAs(reason) {
  const a = asState(); if (!a) return;
  let r = null;
  try { r = await j('/api/admin/impersonate/exit', { method: 'POST', body: '{}', ...(a.token ? { headers: { Authorization: `Bearer ${a.token}` } } : {}) }, true); } catch { /* 404 eller utløpt: lokalt er nok */ }
  ss(KEY, null);
  ss(OUT, { id: a.id, name: a.name, n: r?.changes ?? a.n ?? 0, snap: a.snap, undo: r?.undo ?? null, at: Date.now(), reason: reason ?? null });
  location.replace('/#/dash');
  setTimeout(() => location.reload(), 30);
}

const CSS = `.as44{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147482000;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:6px 6px 6px 8px;border-radius:24px;background:var(--as44c,#2f6b4a);color:#fff;font:600 13.5px/1.2 Manrope,system-ui,sans-serif;box-shadow:0 12px 30px -12px rgba(0,0,0,.5)}
.as44-av{flex:none;width:28px;height:28px;border-radius:14px;background:rgba(255,255,255,.22);display:grid;place-items:center;font:800 11px Manrope,system-ui,sans-serif}
.as44-t{min-width:0;display:flex;flex-direction:column}.as44-t b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.as44-t span{font-size:11.5px;opacity:.85;white-space:nowrap}
.as44 button{flex:none;height:32px;padding:0 14px;border-radius:16px;border:0;background:#fff;color:#1b1a17;font:800 13px Manrope,system-ui,sans-serif;cursor:pointer}
.as44-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 10px 10px 16px;border-radius:18px;background:#1b1a17;color:#f3efe6;font:600 13.5px/1.35 Manrope,system-ui,sans-serif;box-shadow:0 18px 40px -16px rgba(0,0,0,.55)}
.as44-toast button{flex:none;border:0;background:transparent;color:#f0a493;font:800 13px Manrope,system-ui,sans-serif;cursor:pointer;padding:6px 8px}
body.as44-on .shell{padding-top:52px}
html[data-mode="dark"] .as44-toast{background:#f3efe6;color:#16140f}html[data-mode="dark"] .as44-toast button{color:#b23a2a}`;

function style() { if (document.getElementById('as44-css')) return; const s = document.createElement('style'); s.id = 'as44-css'; s.textContent = CSS; document.head.appendChild(s); }

/** Kalles ved oppstart (web44.js): stripe mens man er logget inn som X, toast etter «Gå ut». */
export function initAs() {
  const a = asState();
  if (a) {
    style();
    document.body.classList.add('as44-on');
    const el = document.createElement('div'); el.className = 'as44'; el.id = 'as44'; el.setAttribute('role', 'status');
    if (a.color) el.style.setProperty('--as44c', a.color);
    const paint = () => { const s = asState() ?? a; const n = s.n ?? 0; el.innerHTML = `<span class="as44-av">${esc(initials(s.name))}</span><span class="as44-t"><b>Logget inn som ${esc(s.name)}</b><span>${n ? `${n} ${n === 1 ? 'endring' : 'endringer'} lagret` : 'Endringer lagres med en gang'}</span></span><button type="button" data-as44-out>Gå ut</button>`; };
    paint();
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-as44-out]')) stopAs(); });
    window.addEventListener('hl-as44-change', paint);
    window.addEventListener('hl-as44-expired', () => stopAs('expired'));
    return;
  }
  // Mens X-økten er aktiv via informasjonskapselen (f.eks. ny fane), vises stripa også her.
  fetch('/api/admin/impersonate', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (d?.active && d.user && !asState()) { ss(KEY, { id: d.user.id, name: d.user.name, color: d.user.color ?? null, token: null, n: d.changes ?? 0, at: Date.now() }); location.reload(); }
  }).catch(() => {});
  // X ser en melding neste gang: «Sebastian har oppdatert oppsettet ditt».
  fetch('/api/admin/impersonate/notice', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    const n = d?.notice; if (!n) return;
    style(); const t = document.createElement('div'); t.className = 'as44-toast'; t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(n.text || `${n.by ?? 'Admin'} har oppdatert oppsettet ditt`)}</span><button type="button" data-as44-seen>OK</button>`;
    document.body.appendChild(t);
    const seen = () => { t.remove(); fetch('/api/admin/impersonate/notice/seen', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); };
    t.querySelector('[data-as44-seen]').onclick = seen; setTimeout(() => t.isConnected && t.remove(), 9000);
  }).catch(() => {});
  const o = ss(OUT);
  if (o && Date.now() - o.at < 60_000) {
    ss(OUT, null); style();
    const t = document.createElement('div'); t.className = 'as44-toast'; t.setAttribute('role', 'status');
    const me = (() => { try { return JSON.parse(localStorage.getItem('hl_me_name') || 'null'); } catch { return null; } })();
    t.innerHTML = `<span>${o.reason === 'expired' ? 'Økta som ' + esc(o.name) + ' utløp.' : `Logget ut av ${esc(o.name)} · ${o.n ?? 0} ${o.n === 1 ? 'endring' : 'endringer'} lagret.`} Du er ${esc(me || 'deg selv')} igjen.</span>${(o.undo || o.snap) && o.n ? '<button type="button" data-as44-undo>Angre</button>' : ''}`;
    document.body.appendChild(t);
    const kill = setTimeout(() => t.remove(), 4500);
    t.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-as44-undo]')) return;
      clearTimeout(kill);
      try { if (o.undo?.path) await j(o.undo.path.startsWith('/api') ? o.undo.path : `/api${o.undo.path}`, { method: o.undo.method ?? 'POST', body: JSON.stringify(o.undo.body ?? {}) }); else await j(`/api/users/${encodeURIComponent(o.id)}/layout`, { method: 'PUT', body: JSON.stringify(o.snap) }); t.firstElementChild.textContent = `Endringene for ${o.name} er rullet tilbake.`; }
      catch (er) { t.firstElementChild.textContent = er.status === 404 ? 'Serveren har ikke angring ennå.' : er.message; }
      e.target.remove(); setTimeout(() => t.remove(), 2500);
    });
  }
}

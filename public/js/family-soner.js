// Prompt 45 (WEB45) · Familie på web:
// - Soner: kortet «Posisjonsvarsler» øverst med hovedbryter + bryter per person og «Vis eksempel på varsel»
//   (claude-code-sonevarsler-ikon-bryter.md, fasit Familie.dc.html → znv). Samme valg som Innstillinger → Familie / Varsler.
//     GET/PUT /api/family/zone-alerts {on, people:{id:bool}, zones:{id:bool}} – per bruker (mottakerens valg).
// - Varselbanner i appen (når siden er åpen) ser ut som iOS-varselet: soneikon i sonefarge, lite app-merke, tittel = sone,
//   tekst = hendelse. Følger bryterne (hovedbryter, person, sone).
import { esc } from './util.js';

const Z = { d: null, err: '', loading: false, missing: false };
let rerender = () => {};
async function j(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: opt.body ? { 'Content-Type': 'application/json' } : {} });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Feil ${r.status}`), { status: r.status });
  return d;
}
function load() {
  if (Z.loading || Z.d || Z.missing) return;
  Z.loading = true;
  j('/api/family/zone-alerts').then((d) => { Z.d = d; Z.err = ''; }).catch((e) => { if (e.status === 404 || e.status === 405) Z.missing = true; else Z.err = e.message; }).finally(() => { Z.loading = false; rerender(); });
}
const sw = (on, attr, label) => `<button type="button" class="za45-sw${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${attr}><i></i></button>`;
const ini = (n) => String(n ?? '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Kortet øverst i Soner. paint = family.js sin tegnefunksjon. */
export function zoneAlertCard45(paint) {
  rerender = paint ?? rerender;
  load();
  if (Z.missing) return '';
  if (!Z.d) return Z.err ? `<section class="card fam-card za45"><span class="fam-sub">${esc(Z.err)}</span></section>` : '';
  const on = Z.d.on !== false, P = Z.d.people ?? [], nOn = P.filter((p) => p.on !== false).length;
  return `<section class="card fam-card za45" aria-label="Posisjonsvarsler">
    <div class="za45-h"><span class="za45-t"><b>Posisjonsvarsler</b><span>${on ? `På for ${nOn} av ${P.length} ${P.length === 1 ? 'person' : 'personer'}` : 'Av · ingen sonevarsler'}</span></span>${sw(on, 'data-za45="on"', 'Posisjonsvarsler')}</div>
    ${P.length ? `<div class="za45-ppl${on ? '' : ' off'}">${P.map((p) => `<div class="za45-p"><span class="za45-av" style="background-color:${esc(p.color ?? '#2b5d8a')}${p.avatar ? `;background-image:url('${esc(p.avatar)}')` : ''}">${p.avatar ? '' : esc(p.initials ?? ini(p.name))}</span><b>${esc(p.name)}</b>${sw(on && p.on !== false, `data-za45-p="${esc(p.id)}"${on ? '' : ' disabled'}`, `Varsler for ${p.name}`)}</div>`).join('')}</div>` : ''}
    <button type="button" class="za45-ex" data-za45="ex">Vis eksempel på varsel</button>
  </section>`;
}

async function put(body, undo) {
  rerender();
  try { Z.d = await j('/api/family/zone-alerts', { method: 'PUT', body: JSON.stringify(body) }); } catch (e) { undo(); banner({ title: 'Familie', body: e.message }); }
  rerender();
}

/* ---------------- Varselbanneret ---------------- */
const ZP = 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
function banner({ title, body, color = '#2f7a4f', iconUrl = null, path = ZP }) {
  let el = document.getElementById('za45-bn');
  if (!el) { el = document.createElement('div'); el.id = 'za45-bn'; el.className = 'za45-bn'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); el.addEventListener('click', () => el.classList.remove('on')); }
  const ic = iconUrl ? `<img src="${esc(iconUrl)}" alt="" width="38" height="38">` : `<span class="za45-bi" style="background:${esc(color)}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${esc(path)}"/></svg></span>`;
  el.innerHTML = `<span class="za45-bic">${ic}<i class="za45-badge" aria-hidden="true"></i></span><span class="za45-bt"><b>${esc(title)}</b><span>${esc(body)}</span></span><span class="za45-bn-n">nå</span>`;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(banner.t); banner.t = setTimeout(() => el.classList.remove('on'), 3600);
}
/**
 * Hendelse fra sanntid (family.js). Viser banneret når bryterne tillater det. true = vist (family.js viser da ikke toast).
 * e = {name, kind:'enter'|'leave', zone, userId, zoneId?}, d = familiedata (soner med farge/ikon), path = ikonets path-data.
 */
export function zoneEvent45(e, d, pathOf) {
  load();
  const A = Z.d;
  if (A && A.on === false) return true; // av: ingen banner (og ingen toast)
  if (A && e.userId && A.people?.some((p) => String(p.id) === String(e.userId) && p.on === false)) return true;
  const z = (d?.zones ?? []).find((x) => String(x.id) === String(e.zoneId) || x.name === e.zone);
  const az = A?.zones?.find((x) => String(x.id) === String(z?.id ?? e.zoneId) || x.name === e.zone);
  if (az && az.on === false) return true;
  banner({ title: e.zone ?? z?.name ?? 'Familie', body: `${e.name} ${e.kind === 'enter' ? 'kom til' : 'forlot'} ${e.zone}`, color: z?.color ?? az?.color, iconUrl: az?.iconUrl ?? null, path: z && pathOf ? pathOf(z) : ZP });
  return true;
}

let bound = false;
function bind() {
  if (bound) return; bound = true;
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest?.('[data-za45],[data-za45-p]');
    if (!b || b.disabled || !Z.d) return;
    ev.preventDefault();
    const a = b.dataset.za45;
    if (a === 'on') { const prev = Z.d.on; Z.d.on = prev === false; await put({ on: Z.d.on }, () => { Z.d.on = prev; }); return; }
    if (a === 'ex') {
      const s = Z.d.sample, z0 = Z.d.zones?.[0];
      banner(s ? { title: s.title, body: s.body, color: s.color, iconUrl: s.iconUrl ?? s.icon } : { title: z0?.name ?? 'Hjem', body: `${Z.d.people?.[0]?.name ?? 'Ingrid'} forlot ${z0?.name ?? 'Hjem'}`, color: z0?.color, iconUrl: z0?.iconUrl });
      return;
    }
    if (b.dataset.za45P) { const p = Z.d.people?.find((x) => String(x.id) === b.dataset.za45P); if (!p) return; const prev = p.on; p.on = prev === false; await put({ people: { [p.id]: p.on } }, () => { p.on = prev; }); }
  });
}
export function after45() { bind(); }
bind();

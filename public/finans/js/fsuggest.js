// FinansHub desktop: søkeforslag mens du skriver (prompt 27, claude-code-finans-sokeforslag.md, samme som mobil).
// Gjelder søkefeltet i toppen (data-form="gsearch") og på Transaksjoner (data-form="txsearch").
// - GET /finans/api/forslag?q=&limit=6, debounce 120 ms, forrige forespørsel avbrytes (AbortController).
// - Ikke når ✦ AI er på, når feltet er tomt, eller etter at et forslag er valgt / Enter er trykket.
// - Rad: ikon (logo eller merkefarge + initialer), navn der skrevet del er normal vekt og resten fet,
//   «Butikk · 2 kjøp · −618 kr», og ↖ som fyller inn uten å søke. Trykk på rad søker på navnet.
// - Piltaster og Enter velger; Esc lukker (og tømmer deretter feltet via SearchField).
const FORMS = 'form[data-form="gsearch"],form[data-form="txsearch"]';
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const TYPE = { butikk: 'Butikk', kategori: 'Kategori', vare: 'Vare' };
// Normaliser som serveren: små bokstaver, uten diakritiske tegn, men æ ø å beholdes.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/(?![̊])[̀-ͯ]/g, '').normalize('NFC');
const kr = (ore) => { const v = Math.round(Math.abs(ore) / 100); return `${ore < 0 ? '−' : ''}${v.toLocaleString('nb-NO')} kr`; };

const F = { form: null, q: '', items: [], sel: -1, timer: 0, ctl: null, picked: '' };

const CSS = `.fs-drop{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:60;padding:6px;border-radius:16px;background:var(--card,#fff);border:1px solid var(--line,#d8d1c2);box-shadow:0 18px 40px -16px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:2px;min-width:320px}
.fs-row{display:flex;align-items:center;gap:12px;min-height:52px;padding:4px 4px 4px 10px;border-radius:12px;cursor:pointer;color:var(--ink,inherit)}
.fs-row[aria-selected=true],.fs-row:hover{background:color-mix(in oklab,currentColor 7%,transparent)}
.fs-ic{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;font:800 11.5px Manrope,system-ui,sans-serif;overflow:hidden;position:relative}
.fs-ic img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff}
.fs-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.fs-n{font-size:14.5px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fs-n b{font-weight:800}
.fs-s{font-size:12px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fs-fill{flex:none;width:44px;height:44px;border:0;border-radius:22px;background:transparent;color:inherit;opacity:.6;cursor:pointer;font-size:17px}
.fs-fill:hover{opacity:1;background:color-mix(in oklab,currentColor 8%,transparent)}
form[data-form="gsearch"],form[data-form="txsearch"]{position:relative}`;

function injectCss() {
  if (document.getElementById('fs-css')) return;
  const s = document.createElement('style'); s.id = 'fs-css'; s.textContent = CSS; document.head.appendChild(s);
}

/** «bloms» + «Blomsterlandet Ski» → «bloms» normal, resten fet (ved treff på starten av et ord), ellers fet treffdel. */
function split(name, q) {
  const n = norm(name), qq = norm(q).trim(), i = qq ? n.indexOf(qq) : -1;
  if (i < 0) return `<b>${esc(name)}</b>`;
  return `<b>${esc(name.slice(0, i))}</b>${esc(name.slice(i, i + qq.length))}<b>${esc(name.slice(i + qq.length))}</b>`;
}

const aiOn = (f) => f?.classList.contains('ai');
function close() {
  clearTimeout(F.timer); F.ctl?.abort(); F.ctl = null;
  F.items = []; F.sel = -1;
  document.querySelectorAll('.fs-drop').forEach((d) => d.remove());
  F.form?.querySelector('input[name=q]')?.setAttribute('aria-expanded', 'false');
}
function draw() {
  const f = F.form;
  if (!f || !document.contains(f)) return;
  const inp = f.querySelector('input[name=q]');
  let d = f.querySelector('.fs-drop');
  if (!F.items.length || document.activeElement !== inp) { d?.remove(); inp?.setAttribute('aria-expanded', 'false'); return; }
  if (!d) { d = document.createElement('div'); d.className = 'fs-drop'; d.setAttribute('role', 'listbox'); d.id = 'fs-drop'; f.appendChild(d); }
  inp.setAttribute('aria-expanded', 'true'); inp.setAttribute('aria-controls', 'fs-drop');
  d.innerHTML = F.items.map((x, i) => `<div class="fs-row" role="option" id="fs-${i}" aria-selected="${F.sel === i}" data-fs-i="${i}">
    <span class="fs-ic" style="background:${esc(x.farge || '#7a7468')}">${esc(x.ikon || x.navn.slice(0, 2).toUpperCase())}${x.logoUrl ? `<img src="${esc(x.logoUrl)}" alt="" loading="lazy" data-fs-logo>` : ''}</span>
    <span class="fs-tx"><span class="fs-n">${split(x.navn, F.q)}</span><span class="fs-s">${esc([TYPE[x.type] ?? x.type, `${x.antall} ${x.antall === 1 ? 'kjøp' : 'kjøp'}`, x.sum != null ? kr(x.sum) : ''].filter(Boolean).join(' · '))}</span></span>
    <button type="button" class="fs-fill" data-fs-fill="${i}" aria-label="Fyll inn ${esc(x.navn)}" title="Fyll inn uten å søke">↖</button></div>`).join('');
  if (F.sel >= 0) inp.setAttribute('aria-activedescendant', `fs-${F.sel}`); else inp.removeAttribute('aria-activedescendant');
}
function fetchSugg(f) {
  const inp = f.querySelector('input[name=q]'), q = inp.value.trim();
  F.form = f; F.q = q; F.sel = -1;
  clearTimeout(F.timer); F.ctl?.abort();
  if (!q || aiOn(f) || q === F.picked) { F.items = []; draw(); return; }
  F.timer = setTimeout(async () => {
    const ctl = F.ctl = new AbortController();
    try {
      const r = await fetch(`/finans/api/forslag?q=${encodeURIComponent(q)}&limit=6`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      const list = await r.json();
      if (ctl.signal.aborted || inp.value.trim() !== q) return;
      F.items = (Array.isArray(list) ? list : list.items ?? []).filter((x) => x && x.navn).slice(0, 6);
      draw();
    } catch { if (!ctl.signal.aborted) { F.items = []; draw(); } }
  }, 120);
}
function pick(i, search) {
  const f = F.form, x = F.items[i];
  if (!f || !x) return;
  const inp = f.querySelector('input[name=q]');
  inp.value = x.navn;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  F.picked = x.navn;
  close();
  inp.focus();
  if (search) f.requestSubmit();
}

let bound = false;
export function bindSuggest() {
  if (bound) return;
  bound = true;
  injectCss();
  document.addEventListener('input', (e) => {
    const f = e.target.closest?.(FORMS);
    if (!f || e.target.name !== 'q') return;
    if (e.target.value.trim() !== F.picked) F.picked = '';
    fetchSugg(f);
  });
  document.addEventListener('focusin', (e) => { const f = e.target.closest?.(FORMS); if (f && e.target.name === 'q' && e.target.value.trim() && !F.items.length) fetchSugg(f); });
  document.addEventListener('focusout', (e) => { if (e.target.closest?.(FORMS) && e.target.name === 'q') setTimeout(() => { if (!F.form?.contains(document.activeElement)) close(); }, 150); });
  document.addEventListener('sf:clear', (e) => { if (e.target.closest?.(FORMS)) { F.picked = ''; close(); } });
  // Enter: lukk forslagene og vis treff (skjemaet sendes som før). Med et markert forslag søkes det på det.
  document.addEventListener('submit', (e) => {
    const f = e.target.closest?.(FORMS);
    if (!f) return;
    if (F.sel >= 0 && F.items[F.sel] && F.form === f) { const x = F.items[F.sel]; f.querySelector('input[name=q]').value = x.navn; F.picked = x.navn; }
    else F.picked = f.querySelector('input[name=q]')?.value.trim() ?? '';
    close();
  }, true);
  document.addEventListener('keydown', (e) => {
    const f = e.target.closest?.(FORMS);
    if (!f || e.target.name !== 'q' || !F.items.length) return;
    const n = F.items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); F.sel = (F.sel + 1) % n; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); F.sel = (F.sel - 1 + n) % n; draw(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  // mousedown: feltet beholder fokus til valget er gjort.
  document.addEventListener('mousedown', (e) => {
    const d = e.target.closest?.('.fs-drop');
    if (!d) return;
    e.preventDefault();
    const fill = e.target.closest('[data-fs-fill]');
    if (fill) return pick(+fill.dataset.fsFill, false);
    const row = e.target.closest('[data-fs-i]');
    if (row) pick(+row.dataset.fsI, true);
  });
  document.addEventListener('error', (e) => { if (e.target?.matches?.('[data-fs-logo]')) e.target.remove(); }, true);
}

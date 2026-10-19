// Kort i Glimt-svar (prompt 31, claude-code-chat-kort-vaer-kalender.md + claude-code-ai-chat-vaerkort-fiks.md).
// Fasit: «Mobil Papir App.dc.html» → chCardVals() og malene for m.isWx / m.isCal.
// cardHtml(card) → HTML. Kortene er trykkbare og åpner modulen (Vær, Kalender på riktig dag, Sporing, Økonomi,
// Huskeliste). Huskeliste-punktene kan krysses av direkte i kortet (PATCH /api/tasks/:id).
// card.k: weather|wx · calendar|cal · departures · packages · finance · tasks. Formen tåles løst (serveren og reserven
// i assist.js kan bruke litt ulike feltnavn).
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const WD3 = ['SØN', 'MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR'], MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.round(+v));
const kr = (v) => `${Math.round(+v || 0).toLocaleString('nb-NO')} kr`;

const ICON = { sun: '☀️', clear: '☀️', clearsky: '☀️', fair: '🌤️', partly: '⛅', partlycloudy: '⛅', cloud: '☁️', cloudy: '☁️', rain: '🌧️', lightrain: '🌦️', heavyrain: '🌧️', showers: '🌦️', sleet: '🌨️', snow: '🌨️', thunder: '⛈️', fog: '🌫️', moon: '🌙', night: '🌙', wind: '💨' };
export function wxIcon(x) {
  if (!x) return '☁️';
  if (/\p{Extended_Pictographic}/u.test(x)) return x;
  const k = String(x).toLowerCase().replace(/_(day|night|polartwilight)$/, '').replace(/[^a-z]/g, '');
  if (/night/.test(String(x)) && /clear|fair/.test(k)) return '🌙';
  return ICON[k] ?? (/thunder/.test(k) ? '⛈️' : /snow|sleet/.test(k) ? '🌨️' : /rain|shower/.test(k) ? '🌧️' : /fog/.test(k) ? '🌫️' : /fair|partly/.test(k) ? '⛅' : /clear|sun/.test(k) ? '☀️' : '☁️');
}
const CARD_CSS = `.gc{width:100%;max-width:420px;box-sizing:border-box;font-family:Manrope,Outfit,system-ui,sans-serif}
.gc.gc-wx{display:flex;flex-direction:column;padding:0;border:0;border-radius:22px;overflow:hidden;color:#fff;cursor:pointer;text-align:left;box-shadow:0 12px 28px -14px rgba(20,50,90,.55)}
.gc-wx:focus-visible,.gc-cal-h:focus-visible,.gc-box:focus-visible{outline:2px solid #e8794a;outline-offset:2px}
.gc-wx-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 14px}
.gc-wx-l{display:flex;flex-direction:column;gap:2px;min-width:0}
.gc-wx-l b{display:flex;align-items:center;gap:6px;font-size:16px;font-weight:700}
.gc-wx-t{font-size:44px;font-weight:300;line-height:1}
.gc-wx-r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;align-self:stretch}
.gc-wx-ic{font-size:24px;line-height:1}
.gc-wx-d{margin-top:auto;font-size:13.5px;font-weight:600;opacity:.85;text-align:right}
.gc-wx-hl{font-size:13.5px;font-weight:600;opacity:.85}
.gc-wx-h{display:flex;gap:4px;margin:0 14px;padding:10px 0 14px;border-top:1px solid rgba(255,255,255,.22);overflow-x:auto;scrollbar-width:none}
.gc-wx-h::-webkit-scrollbar{display:none}
.gc-wx-h>span{flex:1 0 44px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px}
.gc-wx-h>span>span:first-child{font-weight:600;opacity:.85}
.gc-wx-h>span>span:nth-child(2){font-size:17px}
.gc-wx-h b{font-size:14px;font-weight:600}
.gc-box{border-radius:22px;background:var(--gc-card,#fff);border:1px solid var(--gc-line,#e4ddcf);overflow:hidden;color:var(--gc-ink,#1b1a17)}
.gc-cal-h{width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;border:0;border-bottom:1px solid var(--gc-line,#e4ddcf);background:transparent;color:inherit;cursor:pointer;text-align:left;font:inherit}
.gc-cal-ic{flex:none;width:38px;height:40px;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15);display:flex;flex-direction:column;align-items:center;overflow:hidden}
.gc-cal-ic>span{width:100%;background:#b23a2a;color:#fff;font:800 8.5px Manrope,system-ui,sans-serif;text-align:center;padding:2px 0;letter-spacing:.06em}
.gc-cal-ic>b{font:700 18px/1.25 Manrope,system-ui,sans-serif;color:#1b1a17}
.gc-grow{flex:1;min-width:0;display:flex;flex-direction:column}
.gc-grow>b{font-size:15px}
.gc-grow>span,.gc-mut{font-size:12.5px;color:var(--gc-mut,#7a7468)}
.gc-row{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--gc-line,#e4ddcf)}
.gc-row:first-of-type{border-top:0}
.gc-strip{flex:none;width:4px;align-self:stretch;border-radius:2px}
.gc-tm{flex:none;width:44px;font:600 12.5px 'IBM Plex Mono',ui-monospace,monospace;color:var(--gc-mut,#7a7468)}
.gc-tt{flex:1;min-width:0;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-none{display:block;padding:12px 16px;font-size:14px;color:var(--gc-mut,#7a7468)}
.gc-line{flex:none;min-width:30px;height:22px;padding:0 6px;border-radius:5px;display:grid;place-items:center;color:#fff;font:800 12px Manrope,system-ui,sans-serif}
.gc-mins{flex:none;display:flex;gap:8px;font:600 13px 'IBM Plex Mono',ui-monospace,monospace}
.gc-bar{display:block;height:4px;border-radius:2px;background:var(--gc-line,#e4ddcf);overflow:hidden;margin-top:6px}
.gc-bar>i{display:block;height:100%;border-radius:2px;background:#2f7d4f}
.gc-sum{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 16px 10px}
.gc-sum b{font:700 26px Manrope,system-ui,sans-serif}
.gc-amt{flex:none;font:600 13px 'IBM Plex Mono',ui-monospace,monospace}
.gc-ck{flex:none;width:22px;height:22px;border-radius:11px;border:2px solid var(--gc-line,#c9c1b1);background:transparent;display:grid;place-items:center;cursor:pointer;padding:0;color:#fff}
.gc-ck[aria-checked=true]{background:#2f7d4f;border-color:#2f7d4f}
.gc-row.done .gc-tt{text-decoration:line-through;opacity:.55}
.gc-open{width:100%;padding:10px 16px;border:0;border-top:1px solid var(--gc-line,#e4ddcf);background:transparent;color:var(--gc-mut,#7a7468);cursor:pointer;font:600 12.5px Manrope,system-ui,sans-serif;text-align:left}
html:not([data-hl="2c"]) .gc{--gc-card:#111723;--gc-line:#232b3b;--gc-ink:#eef0f4;--gc-mut:#8a93a6}`;
function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('gc-css')) return;
  const s = document.createElement('style'); s.id = 'gc-css'; s.textContent = CARD_CSS; document.head.appendChild(s);
}

/** Bakgrunn etter vær: klart = blå, regn/overskyet = grå, natt = mørk blå (mørkere nederst for kontrast). */
export function wxBg(desc, night) {
  if (night) return 'linear-gradient(180deg,#0e1a33,#2b3a5c)';
  return /regn|byger|overskyet|tåke|snø|sludd|skyet|rain|cloud|fog|snow/i.test(String(desc ?? '')) && !/lettskyet|delvis/i.test(String(desc ?? ''))
    ? 'linear-gradient(180deg,#46525f,#6f7b8a)' : 'linear-gradient(180deg,#134a86,#3f74ab 70%,#5f8fc0)';
}

function weather(c) {
  const city = c.city ?? c.place ?? 'Oslo', t = num(c.t ?? c.temp), d = c.d ?? c.desc ?? c.text ?? '', hi = num(c.hi ?? c.max), lo = num(c.lo ?? c.min);
  const night = !!(c.night ?? /night|moon/.test(String(c.symbol ?? c.icon ?? '')));
  const H = (c.h ?? c.hours ?? []).slice(0, 8).map((x) => ({ h: x.h ?? x.l ?? x.label ?? (x.time ? String(x.time).slice(11, 13) : ''), ic: wxIcon(x.ic ?? x.icon ?? x.symbol), t: num(x.temp ?? x.t) }));
  return `<button type="button" class="gc gc-wx" data-gc-go="vaer" style="background:${wxBg(d, night)}" aria-label="Åpne Vær">
    <span class="gc-wx-top"><span class="gc-wx-l"><b><span data-no-i18n>${esc(city)}</span><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M21 3L3 10.5l7.5 2.5L13 21z"/></svg></b><span class="gc-wx-t">${t ?? '–'}°</span></span>
      <span class="gc-wx-r"><span class="gc-wx-ic">${wxIcon(c.ic ?? c.icon ?? c.symbol)}</span><span class="gc-wx-d">${esc(d)}</span>${hi != null && lo != null ? `<span class="gc-wx-hl">H:${hi}° L:${lo}°</span>` : ''}</span></span>
    ${H.length ? `<span class="gc-wx-h">${H.map((x, i) => `<span><span>${esc(i === 0 && /^(nå|now)$/i.test(x.h) ? 'Nå' : x.h)}</span><span>${x.ic}</span><b>${x.t ?? '–'}°</b></span>`).join('')}</span>` : ''}</button>`;
}

function calendar(c) {
  const key = c.date ?? c.day ?? '', d = key ? new Date(`${key}T12:00`) : new Date();
  const items = (c.items ?? c.events ?? []).map((x) => ({ t: x.t ?? x.title ?? '', tm: x.tm ?? x.time ?? (x.allDay ? 'Hele' : x.start ? String(x.start).slice(11, 16) : ''), c: x.c ?? x.color ?? '#2b5d8a' }));
  const lbl = c.label ?? c.t ?? 'I dag';
  const sub = `${d.getDate()}. ${MN[d.getMonth()]} · ${items.length} ${items.length === 1 ? 'hendelse' : 'hendelser'}`;
  return `<div class="gc gc-box"><button type="button" class="gc-cal-h" data-gc-go="kalender" data-gc-day="${esc(key)}"><span class="gc-cal-ic"><span>${WD3[d.getDay()]}</span><b>${d.getDate()}</b></span><span class="gc-grow"><b>${esc(lbl)}</b><span>${esc(c.sub ?? sub)}</span></span><span class="gc-mut" aria-hidden="true">›</span></button>
    ${items.map((x) => `<div class="gc-row"><span class="gc-strip" style="background:${esc(x.c)}"></span><span class="gc-tm">${esc(x.tm || 'Hele')}</span><span class="gc-tt" data-no-i18n>${esc(x.t)}</span></div>`).join('') || '<span class="gc-none">Ingenting i kalenderen.</span>'}</div>`;
}

function departures(c) {
  const L = (c.items ?? c.lines ?? c.departures ?? []).slice(0, 6);
  return `<div class="gc gc-box" role="button" tabindex="0" data-gc-go="dash">${c.stop || c.title ? `<div class="gc-sum"><span class="gc-grow"><b style="font-size:15px" data-no-i18n>${esc(c.stop ?? c.title)}</b><span>Avganger</span></span></div>` : ''}
    ${L.map((x) => { const mins = [].concat(x.mins ?? x.minutes ?? x.min ?? []).filter((m) => m != null && m !== '').slice(0, 3); const clock = x.clock ?? x.time; return `<div class="gc-row"><span class="gc-line" style="background:${esc(x.color ?? x.c ?? '#2b5d8a')};color:${esc(x.textColor ?? '#fff')}">${esc(x.line ?? x.n ?? '')}</span><span class="gc-tt" data-no-i18n>${esc(x.dest ?? x.to ?? x.t ?? '')}</span><span class="gc-mins">${mins.map((m) => `<span>${+m <= 0 ? 'nå' : `${m} min`}</span>`).join('')}${clock && !mins.length ? `<span>${esc(clock)}</span>` : ''}</span></div>`; }).join('') || '<span class="gc-none">Ingen avganger.</span>'}</div>`;
}

function packages(c) {
  const L = (c.items ?? c.packages ?? []).slice(0, 5);
  return `<div class="gc gc-box" role="button" tabindex="0" data-gc-go="sporing">${L.map((x) => { let p = x.progress ?? x.pct ?? (x.steps ? (+x.step || 0) / Math.max(1, +x.steps) : null); if (p != null && p > 1) p /= 100; return `<div class="gc-row"><span class="gc-grow"><b style="font-size:14.5px" data-no-i18n>${esc(x.name ?? x.title ?? x.t ?? 'Pakke')}</b><span>${esc([x.statusText ?? x.status, x.carrierName ?? x.carrier, x.eta].filter(Boolean).join(' · '))}</span>${p != null ? `<span class="gc-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, p)) * 100)}%"></i></span>` : ''}</span></div>`; }).join('') || '<span class="gc-none">Ingen pakker på vei.</span>'}</div>`;
}

function finance(c) {
  const L = (c.items ?? c.top ?? []).slice(0, 3);
  return `<div class="gc gc-box" role="button" tabindex="0" data-gc-go="okonomi"><div class="gc-sum"><span class="gc-grow"><span>${esc(c.label ?? ([c.category, typeof c.period === 'object' ? c.period?.label : c.period].filter(Boolean).join(' · ') || 'Brukt'))}</span></span><b>${kr(c.total ?? c.sum ?? 0)}</b></div>
    ${L.map((x) => `<div class="gc-row"><span class="gc-tt" data-no-i18n>${esc(x.name ?? x.t ?? x.merchant ?? '')}</span><span class="gc-amt">${kr(x.amount ?? x.v ?? 0)}</span></div>`).join('')}</div>`;
}

function tasks(c) {
  const L = (c.items ?? c.tasks ?? []).slice(0, 8);
  return `<div class="gc gc-box">${L.map((x) => { const done = !!(x.done ?? x.checked); return `<div class="gc-row${done ? ' done' : ''}"><button type="button" class="gc-ck" role="checkbox" aria-checked="${done}" data-gc-task="${esc(x.id ?? '')}" aria-label="Kryss av">${done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' : ''}</button><span class="gc-tt" data-no-i18n>${esc(x.text ?? x.title ?? x.t ?? '')}</span></div>`; }).join('') || '<span class="gc-none">Huskelisten er tom.</span>'}
    <button type="button" class="gc-open" data-gc-go="huskeliste">Åpne Gjøremål ›</button></div>`;
}

const KIND = { weather, wx: weather, vaer: weather, calendar, cal: calendar, kalender: calendar, departures, avganger: departures, packages, pakker: packages, finance, finans: finance, tasks, huskeliste: tasks };
/** HTML for kortet, eller '' når typen er ukjent. */
export function cardHtml(card) {
  if (!card || typeof card !== 'object') return '';
  const fn = KIND[String(card.k ?? card.kind ?? card.type ?? '').toLowerCase()];
  if (!fn) return '';
  injectCss();
  try { return fn(card); } catch (e) { console.warn('[glimt] kort', e); return ''; }
}

let bound = false;
/** Klikk på kortene (én lytter på document). onNav(route) kan overstyre navigeringen. */
export function bindCards() {
  if (bound) return; bound = true;
  document.addEventListener('click', async (e) => {
    const ck = e.target.closest?.('[data-gc-task]');
    if (ck) {
      e.preventDefault(); e.stopPropagation();
      const id = ck.dataset.gcTask, on = ck.getAttribute('aria-checked') !== 'true';
      ck.setAttribute('aria-checked', String(on)); ck.closest('.gc-row')?.classList.toggle('done', on);
      ck.innerHTML = on ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' : '';
      if (id) fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: on }) }).catch(() => {});
      return;
    }
    const g = e.target.closest?.('[data-gc-go]');
    if (!g) return;
    e.preventDefault();
    const r = g.dataset.gcGo, day = g.dataset.gcDay;
    if (r === 'okonomi') { location.href = '/finans/'; return; }
    if (r === 'kalender' && day) { location.hash = `#/kalender/dag/${day}`; return; }
    location.hash = `#/${r === 'dash' ? 'dash' : r}`;
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.gc-box[data-gc-go]')) { e.preventDefault(); e.target.click(); } });
}

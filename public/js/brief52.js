// Prompt 52 (WEB52H): nye kort i Glimt-briefen, per innlogget bruker (fasit Glimt Brief.dc.html → nk: fk, rs, hk, rg, kl, md, hl, dm, ak).
// Valgt: 1b Dagens fokus, 3b Min reise, 4a Huskeliste, 2a Regninger, 9b Klær, 5b Nytt i kveld, 6a Homelab (Start-knapp), 7a Domener, 8b Aksjer.
// Data: GET /api/brief52 (SRV52). Serveren filtrerer på tilgang (admin får alt; Homelab/Domener/Aksjer bare admin eller med tilgang;
// barn uten Regninger/Media) – klienten viser bare kortene som kommer. Ingen velger: kortene gjelder alltid den som er logget inn.
// Start: POST /api/brief52/homelab/:id/start (bare admin; can_start fra serveren).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const B = { data: null, at: 0, loading: null, err: '', busy: {} };
const kr = (n) => (Number.isFinite(+n) ? `${Math.round(+n).toLocaleString('nb-NO')} kr` : '');
const pct = (n) => (Number.isFinite(+n) ? `${+n > 0 ? '+' : +n < 0 ? '−' : ''}${Math.abs(+n).toFixed(1).replace('.', ',')} %` : '');
const PAL = ['#2b5d8a', '#2f7a4f', '#a8661a', '#7a3b6b', '#3d7f8a', '#c2477a', '#5b4fc4'];
const colOf = (s) => PAL[[...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PAL.length];
const ini = (n) => (String(n ?? '').match(/\p{L}|\d/gu) ?? ['?']).slice(0, 2).join('').toUpperCase();
const MODE_C = { metro: '#f08a3a', tram: '#3d8fd6', bus: '#e2483d', rail: '#9c6ad6', water: '#3db3c4' };

export const brief52State = B;

/** Henter kortene (bufret 60 s). redraw kalles når de er klare. */
export function loadBrief52(redraw, force = false) {
  if (B.loading) return B.loading;
  if (!force && B.data && Date.now() - B.at < 60_000) return Promise.resolve();
  B.loading = fetch('/api/brief52', { credentials: 'same-origin' })
    .then(async (r) => { if (r.status === 404) { B.data = { cards: [] }; return; } if (!r.ok) throw new Error(`Feil ${r.status}`); B.data = await r.json(); B.err = ''; })
    .catch((e) => { B.err = e.message; })
    .finally(() => { B.at = Date.now(); B.loading = null; redraw?.(); });
  return B.loading;
}

const card = (id) => (B.data?.cards ?? []).find((c) => c.id === id) ?? null;
const empty = (c) => `<span class="b52-e">${esc(c?.error || 'Ingen data akkurat nå')}</span>`;
const head = (t, k) => `<div class="b52-h"><b>${esc(t)}</b>${k ? `<span>${esc(k)}</span>` : ''}</div>`;

function focus() {
  const c = card('focus'); if (!c) return '';
  const d = c.data;
  const sub = d?.next ? [d.next.time, d.next.title, d.next.place].filter(Boolean).join(' · ') : d?.free_from ? `Fri fra ${d.free_from}` : '';
  return `<section data-gb="fok" class="b52 b52-dark b52-tap" role="button" tabindex="0" data-b52-go="#/kalender"><span class="b52-k">ÉN TING I DAG</span><b class="b52-big">${esc(d?.text || 'Ingen data akkurat nå')}</b>${sub ? `<span class="b52-s">${esc(sub)}</span>` : ''}${d?.count ? `<span class="b52-btn">${esc(`${d.count} ting i dag ›`)}</span>` : ''}</section>`;
}
function trip() {
  const c = card('trip'); if (!c) return '';
  const it = c.data?.items ?? [];
  if (!it.length) return `<section data-gb="rei" class="b52 b52-dark"><span class="b52-k">MIN REISE</span>${empty(c)}</section>`;
  const a = it[0], more = it.slice(1, 3).map((x) => `${x.line} ${x.in_min != null ? `om ${x.in_min} min` : x.dep ?? ''}`).join(' · ');
  return `<section data-gb="rei" class="b52 b52-dark b52-tap" role="button" tabindex="0" data-b52-go="#/dash"><span class="b52-k">${esc(`NESTE FRA ${String(a.from || c.data.stop || '').toUpperCase()}`)}</span>
    <span class="b52-min"><b>${esc(a.in_min ?? '–')}</b><span>min</span></span>
    <span class="b52-line"><span style="background:${esc(MODE_C[a.mode] ?? '#f2c14e')}">${esc(a.line)}</span>${esc(a.dest ?? '')}</span>${more ? `<span class="b52-s">Deretter ${esc(more)}</span>` : ''}</section>`;
}
function todo() {
  const c = card('todo'); if (!c) return '';
  const L = c.data?.top ?? [];
  return `<section data-gb="hus" class="b52">${head('Huskeliste', c.data?.open != null ? `${c.data.open} ÅPNE` : '')}${L.length ? L.slice(0, 3).map((x) => `<button type="button" class="b52-r" data-b52-go="#/gjoremal"><span class="b52-cb" style="border-color:${x.overdue ? '#b23a2a' : '#a39d90'}"></span><span class="b52-n">${esc(x.title)}</span>${x.due ? `<span class="b52-d${x.overdue ? ' red' : ''}">${esc(x.due)}</span>` : ''}</button>`).join('') : empty(c)}</section>`;
}
function bills() {
  const c = card('bills'); if (!c) return '';
  const L = c.data?.items ?? [];
  return `<section data-gb="reg" class="b52">${head('Regninger', c.data?.sum_text ? `${c.data.sum_text} TOTALT` : '')}${L.length ? L.slice(0, 4).map((x) => { const red = x.days != null && x.days <= 2; return `<a class="b52-r" href="/finans/"><span class="b52-ic" style="background:${colOf(x.name)}">${esc(ini(x.name))}</span><span class="b52-m"><b>${esc(x.name)}</b><span class="${red ? 'red' : ''}">${esc(x.days === 0 ? 'Forfaller i dag' : x.days === 1 ? 'Forfaller i morgen' : x.days != null ? `Om ${x.days} dager` : x.due ?? '')}</span></span><b class="b52-a">${esc(x.amount_text || kr(x.amount))}</b></a>`; }).join('') : empty(c)}</section>`;
}
function clothes() {
  const c = card('clothes'); if (!c) return '';
  const d = c.data;
  return `<section data-gb="klr" class="b52 b52-blue"><span class="b52-k blue">KLÆR I DAG${d?.temp != null ? ` · ${esc(d.temp)}°${d.feels != null ? ` (FØLES ${esc(d.feels)}°)` : ''}` : ''}</span><b class="b52-mid">${esc(d?.text || 'Ingen data akkurat nå')}</b>${d?.items?.length ? `<span class="b52-chips">${d.items.map((x) => `<span>${esc(x)}</span>`).join('')}</span>` : ''}</section>`;
}
function tonight() {
  const c = card('tonight'); if (!c) return '';
  const L = c.data?.items ?? [], a = L[0];
  if (!a) return `<section data-gb="med" class="b52 b52-media"><span class="b52-k media">KLAR I KVELD</span>${empty(c)}</section>`;
  return `<section data-gb="med" class="b52 b52-media b52-tap" role="button" tabindex="0" data-b52-go="#/mediakveld"><span class="b52-post" style="background:${colOf(a.title)}">${esc(ini(a.title))}</span><span class="b52-m"><span class="b52-k media">KLAR I KVELD</span><b class="b52-mid">${esc(a.title)}</b><span class="b52-s">${esc([a.subtitle, a.time].filter(Boolean).join(' · '))}</span>${L.length > 1 ? `<span class="b52-s">+ ${L.length - 1} til</span>` : ''}</span></section>`;
}
function homelab() {
  const c = card('homelab'); if (!c) return '';
  const d = c.data, S = d?.services ?? [];
  const bad = S.filter((x) => x.state !== 'running'), show = (bad.length ? bad : S).slice(0, 4);
  const k = d ? (d.down ? `${d.down} NEDE` : `${d.ok ?? S.length} OK`) : '';
  return `<section data-gb="hml" class="b52">${head('Homelab', k)}${show.length ? show.map((x) => { const col = x.state === 'running' ? '#2f7a4f' : x.state === 'unhealthy' ? '#a8661a' : '#b23a2a'; const busy = B.busy[x.id]; return `<div class="b52-r"><span class="b52-dot" style="background:${col}"></span><span class="b52-m"><b>${esc(x.name)}</b><span>${esc(x.state === 'running' ? 'Kjører' : x.state === 'unhealthy' ? 'Svarer ikke riktig' : 'Stoppet')}</span></span>${x.can_start && x.state !== 'running' ? `<button type="button" class="b52-act" data-b52-start="${esc(x.id)}"${busy ? ' disabled' : ''}>${busy ? esc(busy) : x.state === 'unhealthy' ? 'Start på nytt' : 'Start'}</button>` : ''}</div>`; }).join('') : empty(c)}${!bad.length && S.length ? '<span class="b52-s dim">Alt kjører.</span>' : ''}</section>`;
}
function domains() {
  const c = card('domains'); if (!c) return '';
  const L = c.data?.items ?? [];
  return `<section data-gb="dom" class="b52">${head('Domener', c.data?.warn ? `${c.data.warn} SNART` : 'ALT OK')}${L.length ? L.slice(0, 4).map((x) => { const d = Math.min(x.days ?? 999, x.ssl_days ?? 999), red = d <= 14; return `<a class="b52-r" href="#/domener"><span class="b52-m"><b class="mono">${esc(x.name)}</b><span class="${red ? 'red' : ''}">${esc(x.ssl_days != null && x.ssl_days <= (x.days ?? 999) ? `SSL utløper om ${x.ssl_days} d` : `Fornyes ${x.expires ?? ''}`)}</span></span><b class="b52-dd${red ? ' red' : ''}">${esc(d === 999 ? '–' : `${d} d`)}</b></a>`; }).join('') : empty(c)}</section>`;
}
function stocks() {
  const c = card('stocks'); if (!c) return '';
  const d = c.data, L = [...(d?.items ?? [])].sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0)), top = L[0];
  if (!d) return `<section data-gb="aks" class="b52"><span class="b52-k grey">AKSJER</span>${empty(c)}</section>`;
  const col = (n) => ((n ?? 0) >= 0 ? '#2f7a4f' : '#b23a2a');
  return `<a data-gb="aks" class="b52 b52-tap" href="/finans/"><span class="b52-k grey">STØRST I GÅR</span><span class="b52-st"><b>${esc(top?.name ?? 'Porteføljen')}</b><b class="v" style="color:${col(top?.change_pct ?? d.change_pct)}">${esc(pct(top?.change_pct ?? d.change_pct))}</b></span><span class="b52-s">${esc(`Porteføljen ${d.value_text || kr(d.value)} · ${pct(d.change_pct)}`)}</span></a>`;
}

/** Kortene øverst i briefen (rett etter oppsummeringen) og nederst (før bunnteksten). */
export function brief52Top() { return B.data ? focus() + trip() + todo() + bills() + clothes() : ''; }
export function brief52Bottom() { return B.data ? tonight() + homelab() + domains() + stocks() : ''; }

/** Klikk i briefen. → true når det var et av våre kort. */
export function brief52Click(e, { close, redraw } = {}) {
  const st = e.target.closest('[data-b52-start]');
  if (st) {
    e.preventDefault();
    const id = st.dataset.b52Start;
    if (B.busy[id]) return true;
    B.busy[id] = 'Starter …'; redraw?.();
    fetch(`/api/brief52/homelab/${encodeURIComponent(id)}/start`, { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Feil ${r.status}`); B.busy[id] = j.action === 'restart' ? 'Startet på nytt' : 'Startet'; try { navigator.vibrate?.(10); } catch { /* */ } })
      .catch((er) => { B.busy[id] = er.message.slice(0, 40); })
      .finally(() => { redraw?.(); setTimeout(() => { delete B.busy[id]; loadBrief52(redraw, true); }, 2500); });
    return true;
  }
  const go = e.target.closest('[data-b52-go]');
  if (go) { e.preventDefault(); close?.(); location.hash = go.dataset.b52Go; return true; }
  return false;
}

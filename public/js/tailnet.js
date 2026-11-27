// Tailnet (Tailscale) øverst på Nettverk-siden (prompt 57, claude-code-tailscale.md §5). Bare for administratorer.
// - Stat-rad (5 kolonner), verktøylinje (søk, filterpiller med antall, «Grupper: Ingen / Tags / Eier»), enhetsgrid med brikker
//   (maks 12, så «Vis alle N»), og kortene Vedlikehold og Trafikk i dag.
// - Trykk på en brikke åpner enhetsdetaljen i den felles popupen (extras.js): fakta, latens 24 t, oppetidsstripe 30 d, tjenester,
//   Ping nå, Kopier IP, Kopier SSH-kommando, Åpne ↗ og varslene for enheten.
// - Data og tekster kommer fra /api/tailscale/* (serveren regner alt). Oppdatering via sanntid («tailscale.node»), uten polling.
// - Filter, søk, gruppering og åpen/lukket lagres per bruker på serveren (PUT /api/tailscale/visning).
import { api, esc } from './util.js';
import { openPopup, popHandler } from './extras.js';
import { iconHtml } from './icons.js';
import { onLive } from './realtime.js';
import { toast } from './ui/toast.js';
import { pageCss } from './lib/page-css.js';

const MAX = 12;
const S = { list: null, stats: null, err: null, view: null, loading: false, at: 0, off: null, saveT: 0 };
const ico = (name, size = 16) => iconHtml(`lucide:${name}`, size, 'tn-ico');
const root = () => document.getElementById('tailnet');

/* ---------------- Data ---------------- */

async function load() {
  if (S.loading) return;
  S.loading = true;
  try {
    const [list, stats] = await Promise.all([api('/tailscale/devices'), api('/tailscale/stats')]);
    S.list = list; S.stats = stats; S.err = null; S.view ??= list.view; S.at = Date.now();
  } catch (e) { S.err = e.message; }
  S.loading = false;
  paint();
}
function saveView() {
  clearTimeout(S.saveT);
  S.saveT = setTimeout(() => { api('/tailscale/visning', { method: 'PUT', json: S.view }).catch(() => {}); }, 400);
}

/* ---------------- Tegning ---------------- */

const SRC = { localapi: 'LocalAPI', api: 'API', demo: 'eksempeldata' };
function since(iso) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return !iso || s < 1 ? 'oppdatert nå' : `oppdatert for ${s} min siden`;
}
const dot = (d) => `<i class="tn-dot${d.online ? ' on' : ''}" aria-hidden="true"></i>`;

function chip(d) {
  const lat = d.online ? `<span class="tn-lat${d.latencyMs == null ? ' unk' : ''}">${esc(d.latencyLabel)}</span>` : `<span class="tn-lat unk">${esc(d.latencyLabel)}</span>`;
  return `<button type="button" class="tn-chip${d.online ? '' : ' off'}" data-pop="tn:${esc(d.id)}" aria-label="${esc(`${d.name}, ${d.statusLabel}, ${d.latencyLabel}`)}">
    <span class="tn-ic">${ico(d.icon, 16)}</span><span class="tn-nm"><b>${esc(d.name)}</b><span class="tn-ip">${esc(d.ip ?? '')}</span></span>${lat}${dot(d)}</button>`;
}

function filtered() {
  const v = S.view, f = S.list.filters.find((x) => x.id === v.filter) ?? S.list.filters[0];
  const q = v.q.trim().toLowerCase();
  return S.list.devices.filter((d) => (f.offline ? !d.online : f.kinds.includes(d.kind)) && (!q || d.name.toLowerCase().includes(q) || d.host.toLowerCase().includes(q) || (d.ip ?? '').includes(q) || (d.dns ?? '').toLowerCase().includes(q)));
}

function gridHtml(list) {
  const v = S.view;
  if (!list.length) return '<div class="tn-empty">Ingen enheter passer.</div>';
  if (v.group === 'ingen') {
    const shown = v.showAll ? list : list.slice(0, MAX);
    return `<div class="tn-grid">${shown.map(chip).join('')}</div>${list.length > MAX ? `<button type="button" class="tn-more" data-tn-all>${v.showAll ? 'Vis færre' : `Vis alle ${list.length}`}</button>` : ''}`;
  }
  const ids = new Set(list.map((d) => d.id)), by = new Map(list.map((d) => [d.id, d]));
  return (S.list.groups[v.group] ?? []).map((g) => g.ids.filter((id) => ids.has(id))).map((gids, i) => [S.list.groups[v.group][i], gids]).filter(([, g]) => g.length)
    .map(([g, gids]) => `<h3 class="tn-gh">${esc(g.navn.toUpperCase())} · ${gids.length}</h3><div class="tn-grid">${gids.map((id) => chip(by.get(id))).join('')}</div>`).join('');
}

function statsHtml() {
  const t = S.stats?.tiles ?? [];
  return `<div class="tn-stats">${t.map((x) => `<div class="tn-stat"><span class="tn-k">${esc(x.label)}</span><b>${esc(x.value)}</b><span class="tn-sub">${esc(x.sub)}</span></div>`).join('')}</div>`;
}

function maintHtml() {
  const m = S.stats?.maintenance;
  if (!m) return '';
  const row = (icon, title, detail, action = '') => `<div class="tn-mrow"><span class="tn-ic sm">${ico(icon, 14)}</span><span class="tn-mt"><b>${esc(title)}</b><span class="tn-mono">${esc(detail)}</span></span>${action}</div>`;
  const open = (id) => `<button type="button" class="tn-link" data-pop="tn:${esc(id)}">Vis</button>`;
  const rows = [
    ...m.expiring.map((x) => row('key-round', `Nøkkelen til ${x.name} utløper`, x.expiresInDays <= 0 ? 'utløpt' : `om ${x.expiresInDays} ${x.expiresInDays === 1 ? 'dag' : 'dager'}`, open(x.id))),
    ...m.updates.map((x) => row('download', `${x.name} har en oppdatering`, x.clientVersion ?? '', open(x.id))),
    ...m.versionMismatch.filter((x) => !m.updates.some((u) => u.id === x.id)).map((x) => row('git-compare', `${x.name} har en annen versjon`, `${x.clientVersion} · forventet ${x.expected}`, open(x.id))),
    ...m.offline30.map((x) => row('archive', `${x.name} har vært frakoblet over 30 d`, 'kandidat for opprydding', open(x.id))),
    ...m.exitNode.map((x) => row('log-out', `${x.name} er exit-node`, 'i bruk', open(x.id))),
  ];
  return `<section class="tn-card" aria-label="Vedlikehold"><h3 class="tn-ct">Vedlikehold</h3>${rows.join('') || '<div class="tn-empty">Ingenting å gjøre.</div>'}</section>`;
}

function trafficHtml() {
  const tr = S.stats?.traffic;
  if (!tr) return '';
  const max = Math.max(1, ...tr.top.map((x) => x.rx + x.tx));
  const bar = (x) => `<div class="tn-trow"><span class="tn-tn">${esc(x.name)}</span><span class="tn-bar" aria-hidden="true"><i class="dn" style="width:${(x.rx / max) * 100}%"></i><i class="up" style="width:${(x.tx / max) * 100}%"></i></span><span class="tn-mono">${esc(x.label)}</span></div>`;
  return `<section class="tn-card" aria-label="Trafikk i dag"><h3 class="tn-ct">Trafikk i dag <span class="tn-mono">${esc(tr.today.label)}</span></h3>
    ${tr.top.length ? tr.top.map(bar).join('') : '<div class="tn-empty">Ingen trafikk målt ennå.</div>'}
    <div class="tn-leg"><span><i class="dn"></i>ned</span><span><i class="up"></i>opp</span></div></section>`;
}

function html() {
  if (S.err && !S.list) {
    return `<div class="tn-over">Tailscale</div><h2 class="tn-title">Tailnet</h2><div class="tn-err">${esc(S.err)} · <a href="#" class="set-link" data-act="integrations">Sett opp under Tilkoblinger</a></div>`;
  }
  if (!S.list) return '<div class="tn-over">Tailscale</div><h2 class="tn-title">Tailnet</h2><div class="skeleton"></div>';
  const v = S.view, list = filtered();
  const pills = S.list.filters.map((f) => `<button type="button" class="tn-pill" data-tn-f="${esc(f.id)}" aria-pressed="${v.filter === f.id}">${esc(f.navn)} <span>${f.count}</span></button>`).join('');
  const seg = [['ingen', 'Ingen'], ['tags', 'Tags'], ['eier', 'Eier']].map(([id, n]) => `<button type="button" data-tn-g="${id}" aria-pressed="${v.group === id}">${n}</button>`).join('');
  return `<div class="tn-top"><div><div class="tn-over">Tailscale · ${esc(SRC[S.list.source] ?? S.list.source)} · ${esc(since(S.list.updatedAt))}</div><h2 class="tn-title">Tailnet</h2></div>
      <button type="button" class="tn-tog" data-tn-open aria-expanded="${v.open}">${v.open ? 'Skjul' : 'Vis'}</button></div>
    ${v.open ? `${statsHtml()}
    <div class="tn-bar-tools"><label class="tn-search"><span class="sr-only">Søk i tailnetet</span>${ico('search', 14)}<input type="search" data-tn-q value="${esc(v.q)}" placeholder="Søk navn eller IP" autocomplete="off" spellcheck="false"></label>
      <div class="tn-pills" role="group" aria-label="Filter">${pills}</div>
      <div class="tn-seg" role="group" aria-label="Grupper"><span>Grupper:</span>${seg}</div></div>
    <div data-tn-grid>${gridHtml(list)}</div>
    <div class="tn-cards">${maintHtml()}${trafficHtml()}</div>` : ''}`;
}

function paint() {
  const el = root();
  if (!el) return;
  const focus = document.activeElement?.matches?.('[data-tn-q]') ? document.activeElement.selectionStart : null;
  el.innerHTML = html();
  el.removeAttribute('aria-busy');
  if (focus != null) { const i = el.querySelector('[data-tn-q]'); i?.focus(); i?.setSelectionRange(focus, focus); }
}

/* ---------------- Enhetsdetaljen (popup) ---------------- */

function spark(l) {
  const v = l.spark, nums = v.filter((x) => x != null);
  if (!nums.length) return '<div class="tn-empty">Ingen målinger siste 24 t.</div>';
  const max = Math.max(...nums, 1), W = 240, Hh = 40;
  const pts = v.map((x, i) => (x == null ? null : `${(i / 23) * W},${Hh - (x / max) * (Hh - 4) - 2}`));
  const segs = []; let cur = [];
  for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
  if (cur.length) segs.push(cur);
  return `<svg class="tn-spark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="Latens siste 24 timer">${segs.map((s) => `<polyline points="${s.join(' ')}"/>`).join('')}</svg>`;
}
const STATE = { oppe: 'Oppe', delvis: 'Delvis', nede: 'Nede' };
const stripe = (s) => `<div class="tn-stripe" role="img" aria-label="Oppetid siste 30 dager">${s.map((x) => `<i class="${x.state ?? 'ingen'}" title="${esc(`${x.date.split('-').reverse().join('.')}: ${STATE[x.state] ?? 'ingen data'}`)}"></i>`).join('')}</div>`;

function detailHtml(r) {
  const d = r.device, h = r.history;
  const alerts = r.alerts ? `<fieldset class="tn-alerts"><legend>Varsler for ${esc(d.name)}</legend>${[['offline', 'Offline i over 10 min'], ['nokkel', 'Nøkkelen utløper om 7 dager'], ['derp', 'Via DERP i over 1 t']].map(([k, n]) => `<label><input type="checkbox" data-tn-alert="${k}" data-tn-id="${esc(d.id)}"${r.alerts[k] !== false ? ' checked' : ''}> ${n}</label>`).join('')}</fieldset>` : '';
  const svc = r.services.length ? `<div class="tn-svc">${r.services.map((s) => `<a class="tn-svcp" href="${esc(s.url)}" target="_blank" rel="noopener"><i class="tn-dot${s.up ? ' on' : ''}" aria-hidden="true"></i>${esc(s.name)}</a>`).join('')}</div>` : '';
  return `<div class="tn-pop" data-tn-pop="${esc(d.id)}">
    <div class="tn-ph"><span class="tn-ic lg">${ico(d.icon, 20)}</span><div><b>${esc(d.name)}</b><span>${dot(d)} ${esc(d.statusLabel)}${d.online && d.tunnelLabel ? ` · ${esc(d.tunnelLabel)}` : ''} · ${esc(d.kindLabel)}</span></div></div>
    <dl class="tn-facts">${r.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd${f.mono ? ' class="tn-mono"' : ''}>${esc(f.value)}</dd></div>`).join('')}</dl>
    <div class="tn-row2"><div class="tn-box"><span class="tn-k">LATENS 24 T</span>${spark(h.latency)}<span class="tn-sub">median ${esc(h.latency.medianLabel)} · p95 ${esc(h.latency.p95Label)} · ${esc(h.tunnel.label)}</span></div>
      <div class="tn-box"><span class="tn-k">OPPETID 30 D</span>${stripe(h.stripe)}<span class="tn-sub">24 t ${esc(h.uptimeLabels['24h'])} · 7 d ${esc(h.uptimeLabels['7d'])} · 30 d ${esc(h.uptimeLabels['30d'])}</span></div></div>
    ${svc}
    <div class="tn-acts">${r.canPing ? '<button type="button" class="tn-btn pri" data-tn-ping>Ping nå</button>' : ''}<span class="tn-pres" data-tn-pres aria-live="polite"></span>
      ${d.ip ? `<button type="button" class="tn-btn" data-tn-copy="${esc(d.ip)}" data-tn-what="IP-en">Kopier IP</button>` : ''}
      <button type="button" class="tn-btn" data-tn-copy="${esc(d.ssh)}" data-tn-what="SSH-kommandoen">Kopier SSH-kommando</button>
      ${r.services[0] ? `<a class="tn-btn" href="${esc(r.services[0].url)}" target="_blank" rel="noopener">Åpne ↗</a>` : ''}
      <code class="tn-ssh">${esc(d.ssh)}</code></div>
    ${alerts}</div>`;
}

popHandler('tn', (id) => {
  const d = S.list?.devices.find((x) => x.id === id);
  if (!d) return null;
  openPopup('Tailnet', '<div class="tn-pop"><div class="skeleton"></div></div>');
  api(`/tailscale/devices/${encodeURIComponent(id)}`).then((r) => {
    const box = document.querySelector('.popup-box .tn-pop');
    if (box) box.outerHTML = detailHtml(r);
  }).catch((e) => { const box = document.querySelector('.popup-box .tn-pop'); if (box) box.innerHTML = `<div class="err">${esc(e.message)}</div>`; });
  return null;
});

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`Kopierte ${what}`, { tone: 'success', ms: 2000 }); } catch { toast('Fikk ikke kopiert', { tone: 'danger' }); }
}

/* ---------------- Hendelser ---------------- */

let bound = false;
function bind() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tn-f],[data-tn-g],[data-tn-all],[data-tn-open],[data-tn-ping],[data-tn-copy]');
    if (!t || !S.view) return;
    if (t.dataset.tnF) { S.view.filter = t.dataset.tnF; S.view.showAll = false; saveView(); paint(); }
    else if (t.dataset.tnG) { S.view.group = t.dataset.tnG; saveView(); paint(); }
    else if (t.hasAttribute('data-tn-all')) { S.view.showAll = !S.view.showAll; saveView(); paint(); }
    else if (t.hasAttribute('data-tn-open')) { S.view.open = !S.view.open; saveView(); paint(); }
    else if (t.dataset.tnCopy) copy(t.dataset.tnCopy, t.dataset.tnWhat || 'teksten');
    else if (t.hasAttribute('data-tn-ping')) {
      const pop = t.closest('[data-tn-pop]'), out = pop?.querySelector('[data-tn-pres]');
      if (!pop || !out) return;
      t.disabled = true; out.textContent = 'Pinger …';
      try { const r = await api(`/tailscale/devices/${encodeURIComponent(pop.dataset.tnPop)}/ping`, { method: 'POST' }); out.textContent = r.label; out.classList.toggle('ok', !!r.ok); }
      catch (err) { out.textContent = err.message || 'Ingen svar'; }
      t.disabled = false;
    }
  });
  document.addEventListener('input', (e) => {
    if (!e.target.matches?.('[data-tn-q]') || !S.view) return;
    S.view.q = e.target.value.slice(0, 80);
    saveView();
    const g = root()?.querySelector('[data-tn-grid]');
    if (g) g.innerHTML = gridHtml(filtered());
  });
  document.addEventListener('change', (e) => {
    const c = e.target.closest?.('[data-tn-alert]');
    if (!c) return;
    api(`/tailscale/devices/${encodeURIComponent(c.dataset.tnId)}/varsler`, { method: 'PUT', json: { [c.dataset.tnAlert]: c.checked } }).catch(() => { c.checked = !c.checked; toast('Fikk ikke lagret varselet', { tone: 'danger' }); });
  });
}

/** Plassholderen øverst på Nettverk (bare admin). */
export const tailnetSlot = () => { pageCss('nettverk'); return '<section class="tn" id="tailnet" aria-label="Tailnet" aria-busy="true"></section>'; };

/** Kalles når Nettverk er tegnet: henter (høyst hvert 30. sekund) og lytter på sanntid. */
export function mountTailnet() {
  if (!root()) return;
  bind();
  paint();
  if (!S.list || Date.now() - S.at > 30_000) load();
  S.off ??= onLive('tailscale.node', () => { S.at = 0; if (root()) load(); });
}

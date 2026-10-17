// Domener: flere domener med trafikk, sanntid, publikum (verdenskart), ytelse, sikkerhet, innhold og infrastruktur.
import { api, esc } from './util.js';
import { store } from './store.js';
import { openSettings } from './settings.js';
import { drawMap } from './worldmap.js';

const D = (p, o) => api('/../domains/api' + p, o);
const PERIODS = [['1h', '1t'], ['24h', '24t'], ['7d', '7d'], ['30d', '30d']];
const PER_TXT = { '1h': 'time', '24h': '24 timer', '7d': '7 dager', '30d': '30 dager' };
const UNIT_TXT = { '1h': 'minutt', '24h': 'halvtime', '7d': 'time', '30d': 'dag' };
const SRC = { cloudflare: 'Cloudflare', tunnel: 'Cloudflare Tunnel', plausible: 'Plausible', umami: 'Umami', uptime: 'Bare oppetid og SSL' };
const HELP = {
  cloudflare: 'Lag et API-token i Cloudflare med Zone:Read, DNS:Read, Analytics:Read, Registrar:Read og Firewall Services:Read for sonen. Tomt felt bruker standard-tokenet fra Innstillinger → Integrasjoner → Cloudflare.',
  tunnel: 'Bruk samme token som over. Trafikken hentes fra sonen, filtrert på vertsnavnet (f.eks. home.kristo.no).',
  plausible: 'Lag en Stats API-nøkkel i Plausible. Gir besøkende, sider, henvisere, land og enheter. Statuskoder og sikkerhet krever Cloudflare.',
  umami: 'Oppgi adressen til Umami-instansen og en API-nøkkel. Gir besøkende, sider, henvisere, land og enheter.',
  uptime: 'Ingen token trengs. Homelab sjekker domenet hvert 5. minutt, og leser SSL-sertifikat, DNS og utløpsdato (RDAP).',
};

const S = { list: null, sel: null, per: '24h', data: new Map(), err: null, adding: false, form: { name: '', source: 'cloudflare', token: '', url: '' }, formErr: '', busy: false };
let liveTimer = null;

/* ---------- Formatering ---------- */
const nb = (v) => (v == null ? '–' : Math.round(v).toLocaleString('nb-NO'));
const big = (v) => (v == null ? '–' : v >= 1e6 ? (v / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: 2 }) + ' M' : v >= 1e5 ? (v / 1e3).toLocaleString('nb-NO', { maximumFractionDigits: 0 }) + ' k' : nb(v));
const bytes = (b) => (b == null ? '–' : b >= 1e9 ? (b / 1e9).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' GB' : (b / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: 0 }) + ' MB');
const pc = (v, d = 1) => (v == null ? '–' : v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %');
const date = (s) => (s ? s.slice(0, 10).split('-').reverse().join('.') : '–');
const days = (s) => (s ? Math.round((new Date(s) - Date.now()) / 864e5) : null);
const path = (a, w, h, max, pad = 4) => { if (a.length < 2) return ''; const m = max || Math.max(...a, 1); return 'M' + a.map((v, i) => `${(i / (a.length - 1) * w).toFixed(1)} ${(h - pad - (v / m) * (h - pad * 2)).toFixed(1)}`).join(' L'); };
const delta = (cur, prev, good = true) => {
  if (cur == null || !prev) return { d: '', c: 'var(--muted)' };
  const v = (cur - prev) / prev * 100, up = v >= 0;
  return { d: `${up ? '+' : '−'}${pc(Math.abs(v))} mot forrige`, c: up === good ? 'var(--green)' : 'var(--red)' };
};

/* ---------- Data ---------- */
const key = (n) => `${n}|${S.per}`;
async function fetchOne(name, force) {
  if (!force && S.data.has(key(name))) return S.data.get(key(name));
  const d = await D(`/${encodeURIComponent(name)}/analytics?range=${S.per}`).catch((e) => ({ name, error: e.message }));
  S.data.set(key(name), d);
  return d;
}
async function loadAll(force) {
  try {
    S.list ??= await D('/domains');
    if (S.sel === null) S.sel = sessionStorage.getItem('hl_dom_sel') ?? (S.list.length > 1 ? '*' : S.list[0]?.name ?? '*');
    if (S.sel !== '*' && !S.list.some((x) => x.name === S.sel)) S.sel = '*';
    paint();
    const names = S.sel === '*' ? S.list.map((x) => x.name) : [S.sel];
    await Promise.all(names.map((n) => fetchOne(n, force)));
    S.err = null;
  } catch (e) { S.err = e.message; }
  paint();
}

function startLive() {
  clearInterval(liveTimer);
  liveTimer = setInterval(async () => {
    const root = document.getElementById('dom-os');
    if (!root) { clearInterval(liveTimer); return; }
    if (document.hidden || S.sel === '*' || !S.sel) return;
    const d = S.data.get(key(S.sel));
    if (!d) return;
    try { d.live = await D(`/${encodeURIComponent(S.sel)}/live`); paintLive(d); } catch { /* prøver igjen om 30 s */ }
  }, 30_000);
}

/* ---------- Visning ---------- */
const card = (cls, inner) => `<section class="dm-card ${cls}">${inner}</section>`;
const h = (t, sub = '') => `<div class="dm-h">${t}${sub ? ` <span>${sub}</span>` : ''}</div>`;
const bars = (list, valFn, nameFn, max) => {
  const m = max ?? Math.max(1, ...list.map(valFn));
  return list.map((x) => `<div class="dm-bar"><div><span>${esc(nameFn(x))}</span><span class="mono">${nb(valFn(x))}</span></div><div class="t"><div style="width:${(valFn(x) / m * 100).toFixed(1)}%"></div></div></div>`).join('') || '<div class="dm-empty">Ingen data</div>';
};

function pills() {
  const all = [['*', 'Alle domener', '#a8d4fb'], ...(S.list ?? []).map((x) => [x.name, x.name, '#8fe0b0'])];
  return `<div class="dm-top"><div class="dm-pills">${all.map(([k, n, dot]) => `<button data-dom-sel="${esc(k)}" aria-pressed="${S.sel === k}"><i style="background:${dot}"></i>${esc(n)}</button>`).join('')}
      <button class="add" data-dom-add>+ Legg til domene</button></div>
    <div class="dm-per">${PERIODS.map(([k, n]) => `<button data-dom-per="${k}" aria-pressed="${S.per === k}">${n}</button>`).join('')}<button data-dom-refresh title="Oppdater" aria-label="Oppdater">↻</button></div></div>`;
}

function addForm() {
  if (!S.adding) return '';
  const f = S.form;
  return card('dm-add', `<div class="dm-h">Nytt domene</div>
    <form data-dom-form class="dm-form">
      <label>Domene<input name="name" value="${esc(f.name)}" placeholder="f.eks. kristo.no" class="mono" autocomplete="off" spellcheck="false" required></label>
      <label>Statistikk fra<select name="source">${Object.entries(SRC).map(([k, n]) => `<option value="${k}"${f.source === k ? ' selected' : ''}>${n}${k === 'cloudflare' ? ' (zone analytics)' : k === 'umami' ? ' (selvhostet)' : ''}</option>`).join('')}</select></label>
      ${f.source === 'uptime' ? '' : `<label>API-token<input name="token" type="password" placeholder="Lagres kun på serveren" autocomplete="off"></label>`}
      ${f.source === 'umami' || f.source === 'plausible' ? `<label>Adresse<input name="url" value="${esc(f.url)}" placeholder="${f.source === 'umami' ? 'https://umami.eksempel.no' : 'https://plausible.io'}" autocomplete="off"></label>` : ''}
      <div class="help">${HELP[f.source]}</div>
      <div class="acts"><button class="dm-btn pri" type="submit"${S.busy ? ' disabled' : ''}>Legg til</button><button class="dm-btn" type="button" data-dom-add>Avbryt</button><span class="err-t">${esc(S.formErr)}</span></div>
    </form>`);
}

function overview() {
  const rows = (S.list ?? []).map((x) => ({ x, d: S.data.get(key(x.name)) }));
  const cols = '<span>Domene</span><span>Status</span><span class="r">Forespørsler</span><span class="r">Besøkende</span><span class="r">Bufret</span><span class="r">Oppetid</span><span>SSL utløper</span><span>Fornyes</span>';
  const tbl = rows.map(({ x, d }) => {
    if (!d) return `<button class="dm-row" data-dom-sel="${esc(x.name)}"><span class="mono">${esc(x.name)}</span><span class="muted" style="grid-column:span 7">Laster …</span></button>`;
    const cd = days(d.sslExpires), st = statusOf(d);
    return `<button class="dm-row" data-dom-sel="${esc(x.name)}"><span class="nm"><b class="mono">${esc(x.name)}</b><span>${SRC[x.source]}${d.mock ? ' · demo' : ''}</span></span>
      <span class="st" style="color:${st.c}"><i style="background:${st.c}"></i>${st.t}</span><span class="r mono">${big(d.requests)}</span><span class="r mono">${big(d.visitors)}</span><span class="r mono">${pc(d.cachedPct)}</span>
      <span class="r mono" style="color:${d.uptimePct == null ? 'var(--muted)' : d.uptimePct > 99.9 ? 'var(--green)' : '#f2b56b'}">${pc(d.uptimePct, 2)}</span>
      <span class="mono sm" style="color:${cd == null ? 'var(--muted)' : cd < 30 ? 'var(--red)' : cd < 60 ? '#f2b56b' : 'var(--text)'}">${d.sslExpires ? `${date(d.sslExpires)} · ${cd} d` : '–'}</span><span class="mono sm muted">${date(d.renews)}</span></button>`;
  }).join('');
  const ds = rows.map((r) => r.d).filter(Boolean);
  const next = ds.filter((d) => d.sslExpires).sort((a, b) => a.sslExpires.localeCompare(b.sslExpires))[0];
  const kpis = [['Domener', String(S.list.length), `${S.list.filter((x) => x.source === 'cloudflare' || x.source === 'tunnel').length} via Cloudflare`],
    ['Forespørsler totalt', big(ds.reduce((a, d) => a + (d.requests ?? 0), 0)), 'Siste ' + PER_TXT[S.per]],
    ['Besøkende totalt', big(ds.reduce((a, d) => a + (d.visitors ?? 0), 0)), 'Unike, siste ' + PER_TXT[S.per]],
    ['Neste utløp', next ? `${days(next.sslExpires)} dager` : '–', next ? 'SSL for ' + next.name : '']];
  return `${S.list.length ? card('dm-tbl', `<div class="dm-tw"><div class="dm-row head">${cols}</div>${tbl}</div>`) : `<div class="dm-card dm-empty">Ingen domener ennå. Trykk «+ Legg til domene».</div>`}
    <div class="dm-kpis">${kpis.map(([l, v, s]) => `<div class="dm-card dm-kpi"><span>${l}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join('')}</div>`;
}

function statusOf(d) {
  if (d.error && d.requests == null) return { t: 'Feil', c: 'var(--red)' };
  if (d.status === 'down') return { t: 'Nede', c: 'var(--red)' };
  if (d.status === 'active') return { t: 'Aktiv', c: 'var(--green)' };
  if (d.status === 'pending') return { t: 'Venter', c: '#f2b56b' };
  return { t: 'Ukjent', c: 'var(--muted)' };
}

function spark(arr, c) { const l = path(arr, 100, 30); return l ? `<svg viewBox="0 0 100 30" preserveAspectRatio="none"><path d="${l} L100 30 L0 30 Z" fill="${c}22"></path><path d="${l}" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke"></path></svg>` : '<svg viewBox="0 0 100 30"></svg>'; }

function liveHtml(d) {
  const l = d.live;
  if (!l || l.visitors == null) return `${h('Sanntid')}<div class="dm-empty">Sanntid krever Cloudflare, Plausible eller Umami.</div>`;
  const sp = l.spark?.length ? l.spark : [];
  const mx = Math.max(1, ...sp);
  const paths = (d.topPages ?? []).slice(0, 3);
  const tot = paths.reduce((a, p) => a + p.count, 0) || 1;
  return `<div class="dm-h" style="display:flex;justify-content:space-between;align-items:center">Sanntid<span class="live"><i></i>Live</span></div>
    <div><div class="dm-live">${nb(l.visitors)}</div><div class="muted sm">besøkende akkurat nå${l.requests != null ? ` · ${nb(l.requests)} forespørsler · ${l.mb.toLocaleString('nb-NO')} MB siste 5 min` : ''}</div></div>
    <div class="dm-lbars">${sp.slice(-30).map((v) => `<span style="height:${Math.max(6, v / mx * 100).toFixed(0)}%"></span>`).join('')}</div>
    <div>${paths.map((p) => `<div class="dm-kvr"><span class="mono ell">${esc(p.path)}</span><span class="mono muted">${nb(l.visitors * p.count / tot)}</span></div>`).join('')}</div>`;
}
function paintLive(d) { const el = document.getElementById('dm-live'); if (el) el.innerHTML = liveHtml(d); }

function one() {
  const d = S.data.get(key(S.sel));
  const src = S.list.find((x) => x.name === S.sel);
  if (!d) return '<div class="skeleton" style="min-height:420px;border-radius:24px"></div>';
  const ser = d.series ?? [], tot = ser.map((x) => x.requests), cac = ser.map((x) => x.cached), max = Math.max(1, ...tot) * 1.08;
  const p = d.prev ?? {};
  const st = statusOf(d);
  const fmtT = (t) => { const x = new Date(t); return S.per === '7d' || S.per === '30d' ? x.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' }) : x.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); };
  const xT = ser.length ? Array.from({ length: 7 }, (_, i) => fmtT(ser[Math.round(i / 6 * (ser.length - 1))].t)) : [];
  const yT = [max, max * 0.75, max * 0.5, max * 0.25, 0].map(big);
  const tl = path(tot, 600, 220, max, 0);
  const k = [
    ['Forespørsler', big(d.requests), delta(d.requests, p.requests), spark(tot, '#a8d4fb')],
    ['Unike besøkende', nb(d.visitors), delta(d.visitors, p.visitors), spark(ser.map((x) => x.visitors), '#a8d4fb')],
    ['Data levert', bytes(d.bytes), delta(d.bytes, p.bytes), spark(ser.map((x) => x.bytes ?? x.requests), '#7fe0d0')],
    ['Bufret andel', pc(d.cachedPct), delta(d.cachedPct, p.cachedPct), spark(ser.map((x) => (x.requests ? x.cached / x.requests : 0)), '#8fe0b0')],
    ['Trusler blokkert', nb(d.threats?.total), delta(d.threats?.total, p.threats, false), spark(ser.map((x) => x.requests * 0.0024), '#f59a8f')],
  ];
  const showMap = store.me.ui?.domMap !== false;
  const cs = d.countries ?? [];
  const sc = d.statusCodes, scTot = sc ? Object.values(sc).reduce((a, b) => a + b, 0) || 1 : 1;
  const SC = [['2xx', '#8fe0b0'], ['3xx', '#a8d4fb'], ['4xx', '#f2b56b'], ['5xx', '#f59a8f']];
  const dev = d.devices ?? [], DC = ['#a8d4fb', '#7fe0d0', '#f2b56b', '#e8a6d8'];
  const u = d.uptime90 ?? [], inc = u.filter((x) => x != null && x < 1).length;
  const lastInc = u.map((x, i) => (x != null && x < 1 ? i : -1)).filter((i) => i >= 0).pop();
  const sec = d.security ?? {};
  const cd = days(d.sslExpires), ed = days(d.renews);
  const yes = (v) => (v == null ? '–' : v ? 'På' : 'Av');
  const info = [['Registrar', d.registrar ?? '–'], ['Utløper', d.renews ? `${date(d.renews)} · ${ed} d` : '–', ed != null && ed < 30 ? 'var(--red)' : null],
    ['Navnetjenere', d.nameServers?.length ? d.nameServers.join(' / ') : '–'], ['Plan', d.plan ?? '–'],
    ['SSL-modus', sec.sslMode ?? '–'], ['Alltid HTTPS', yes(sec.alwaysHttps)], ['Minimum TLS', sec.minTls ?? '–'], ['Bot Fight Mode', yes(sec.botFight)],
    ['Sertifikat utløper', d.sslExpires ? `${date(d.sslExpires)} · ${cd} d` : '–', cd == null ? null : cd < 30 ? 'var(--red)' : cd < 60 ? '#f2b56b' : null], ['Statistikk fra', SRC[d.source] ?? d.source]];
  const dnssec = sec.dnssec;
  const ev = d.threats?.events ?? [];
  return `
    <div class="dm-title"><div><div class="nm mono">${esc(d.name)}</div><div class="muted sm">Siste ${PER_TXT[S.per]} · ${SRC[d.source] ?? ''} · oppdatert ${new Date(d.updated ?? Date.now()).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}${d.mock ? ' · demodata' : ''}${d.stale ? ' · viser sist hentede data' : ''}</div></div>
      <span class="dm-badge" style="color:${st.c}"><i style="background:${st.c}"></i>${d.source === 'cloudflare' || d.source === 'tunnel' ? 'Beskyttet' : 'Overvåket'} · ${st.t}</span></div>
    ${d.error ? `<div class="dm-card dm-warn">${esc(d.error)}${/token/i.test(d.error) ? ' <button class="dm-btn" data-dom-settings>Åpne innstillinger</button>' : ''}</div>` : ''}
    <div class="dm-kpis five">${k.map(([l, v, dl, sv]) => `<div class="dm-card dm-kpi"><span>${l}</span><b>${esc(v)}</b><small style="color:${dl.c}">${dl.d || '&nbsp;'}</small>${sv}</div>`).join('')}</div>
    <div class="dm-flex">
      ${card('f3', `<div class="dm-h" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px"><span>Trafikk <span>Forespørsler per ${UNIT_TXT[S.per]}</span></span><span class="dm-leg"><i style="background:#a8d4fb"></i>Totalt<i style="background:#7fe0d0"></i>Bufret</span></div>
        <div class="dm-chart"><div class="y mono">${yT.map((t) => `<span>${t}</span>`).join('')}</div><div class="c">
          <svg viewBox="0 0 600 220" preserveAspectRatio="none"><path d="M0 55H600M0 110H600M0 165H600" stroke="#232938"></path>${tl ? `<path d="${tl} L600 220 L0 220 Z" fill="rgba(168,212,251,.14)"></path><path d="${tl}" fill="none" stroke="#a8d4fb" stroke-width="2" vector-effect="non-scaling-stroke"></path><path d="${path(cac, 600, 220, max, 0)}" fill="none" stroke="#7fe0d0" stroke-width="1.6" vector-effect="non-scaling-stroke"></path>` : ''}</svg>
          <div class="x mono">${xT.map((t) => `<span>${t}</span>`).join('')}</div></div></div>`)}
      <section class="dm-card f1" id="dm-live">${liveHtml(d)}</section>
    </div>

    <div class="dm-sec">Publikum</div>
    <div class="dm-flex">
      ${showMap ? card('f2', `<div class="dm-h" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px"><span>Besøk per land <span>Unike besøkende · siste ${PER_TXT[S.per]}</span></span><span class="muted sm">${cs.length} land</span></div>
        <div class="dm-map" id="dm-map"></div>
        <div class="dm-scale"><span>Færre</span><span class="g"></span><span>Flere</span><span style="margin-left:auto;display:flex;align-items:center;gap:6px"><i></i>Ingen besøk</span></div>`) : ''}
      ${card('f1', `${h('Topp land', 'Unike besøkende')}${bars(cs.slice(0, 7), (c) => c.visitors, (c) => c.name)}`)}
    </div>
    <div class="dm-grid">
      ${card('', `${h('Enheter')}<div class="dm-stack">${dev.map((x, i) => `<span style="flex:${x.pct} 1 0;background:${DC[i % 4]}"></span>`).join('')}</div>
        <div>${dev.map((x, i) => `<div class="dm-kvr"><span><i class="sq" style="background:${DC[i % 4]}"></i>${esc(x.name)}</span><span class="mono muted">${pc(x.pct, 0)}</span></div>`).join('') || '<div class="dm-empty">Ingen data</div>'}</div>`)}
      ${card('', `${h('Nettlesere')}${(d.browsers ?? []).map((x) => `<div class="dm-kvr"><span>${esc(x.name)}</span><span class="mono muted">${pc(x.pct, 0)}</span></div>`).join('') || '<div class="dm-empty">Ingen data</div>'}`)}
    </div>

    <div class="dm-sec">Ytelse og sikkerhet</div>
    <div class="dm-grid">
      ${card('', `${h('Statuskoder', sc ? nb(scTot) + ' svar' : '')}${sc ? `<div class="dm-stack thin">${SC.map(([n, c]) => `<span style="flex:${Math.max(sc[n] / scTot * 100, 0.6)} 1 0;background:${c}"></span>`).join('')}</div>
        ${SC.map(([n, c]) => `<div class="dm-kvr line"><span><i class="dot" style="background:${c}"></i>${n}</span><span class="mono muted">${pc(sc[n] / scTot * 100, sc[n] / scTot < 0.01 ? 2 : 1)}</span><span class="mono" style="width:90px;text-align:right">${nb(sc[n])}</span></div>`).join('')}` : '<div class="dm-empty">Statuskoder krever Cloudflare.</div>'}`)}
      ${card('', `${h('Ytelse', 'Tid til første byte')}<div class="dm-perf">${[['Median', d.ttfb ? d.ttfb.p50 + ' ms' : '–'], ['95. persentil', d.ttfb ? d.ttfb.p95 + ' ms' : '–'], ['Fra opprinnelse', d.originMs != null ? d.originMs + ' ms' : '–'], ['Feilrate (5xx)', pc(d.errorPct, 2)]].map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('')}</div>
        <div class="dm-chips">${[...(d.http ?? []), ...(d.tls ?? [])].map((x) => `<span>${esc(x.name)} · ${pc(x.pct, 0)}</span>`).join('')}</div>`)}
      ${card('', `${h('Sikkerhet', d.threats?.total != null ? nb(d.threats.total) + ' stoppet' : '')}${bars(d.threats?.types ?? [], (x) => x.count, (x) => x.name)}
        ${ev.length ? `<div class="dm-ev">${ev.slice(0, 5).map((e) => `<div><span class="tag ${e.action === 'Blokkert' ? 'b' : 'c'}">${e.action}</span><span class="mono ell">${esc(e.path ?? '')}</span><span class="mono muted">${esc(e.country ?? '')} · ${new Date(e.time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')}</div>` : ''}`)}
    </div>

    <div class="dm-sec">Innhold</div>
    <div class="dm-grid wide">
      ${card('', `${h('Topp sider', 'Sidevisninger')}${bars(d.topPages ?? [], (x) => x.count, (x) => x.path)}`)}
      ${card('', `${h('Topp henvisere', 'Besøk')}${bars(d.referrers ?? [], (x) => x.count, (x) => x.name)}`)}
    </div>

    <div class="dm-sec">Infrastruktur</div>
    <div class="dm-flex">
      ${card('f2', `<div class="dm-h" style="display:flex;justify-content:space-between;align-items:center">Oppetid <span>Siste 90 dager</span><span class="dm-pill mono" style="margin-left:auto">${pc(d.uptimePct, 2)}</span></div>
        <div class="dm-up">${u.map((x, i) => `<span title="${new Date(Date.now() - (89 - i) * 864e5).toLocaleDateString('nb-NO')} · ${x == null ? 'Ingen målinger' : x >= 1 ? 'OK' : x >= 0.95 ? 'Treg respons eller kort brudd' : 'Nede en periode'}" style="background:${x == null ? '#1d2738' : x >= 1 ? '#5fbf86' : x >= 0.95 ? '#f2b56b' : '#f59a8f'}"></span>`).join('')}</div>
        <div class="dm-upl"><span>90 dager siden</span><span>${inc ? `${inc} dager med avvik · siste for ${89 - lastInc} dager siden` : u.some((x) => x != null) ? 'Ingen hendelser' : 'Målinger starter når domenet er lagt til'}</span><span>I dag</span></div>
        <div class="dm-h" style="font-size:16px;margin-top:6px">DNS-poster</div>
        <div class="dm-dns">${(d.dns ?? []).map((r) => `<div><span class="t">${esc(r.type)}</span><span class="ell">${esc(r.name)}</span><span class="ell muted">${esc(r.content)}</span><span style="color:${r.proxied ? '#f2b56b' : 'var(--muted)'}">${r.proxied ? 'Proxied' : 'Kun DNS'}</span></div>`).join('') || '<div class="dm-empty" style="padding:12px">Ingen DNS-poster</div>'}</div>`)}
      ${card('f1', `<div class="dm-h" style="display:flex;justify-content:space-between;align-items:center">Domene${dnssec == null ? '' : `<span class="dm-pill" style="${dnssec ? '' : 'background:rgba(242,181,107,.12);color:#f2b56b'}">${dnssec ? 'DNSSEC på' : 'DNSSEC av'}</span>`}</div>
        ${info.map(([l, v, c]) => `<div class="dm-kvr line"><span class="muted">${l}</span><span class="mono sm" style="text-align:right;${c ? `color:${c}` : ''}">${esc(v)}</span></div>`).join('')}
        <button class="dm-btn danger" data-dom-del="${src?.id ?? ''}">Fjern ${esc(d.name)}</button>`)}
    </div>`;
}

function body() {
  if (S.err && !S.list) return `<div class="dm-card dm-warn">${esc(S.err)}</div>`;
  if (!S.list) return `${pills()}<div class="skeleton" style="min-height:320px;border-radius:24px"></div>`;
  return `${pills()}${addForm()}${S.sel === '*' ? overview() : one()}`;
}

function paint() {
  const el = document.getElementById('dom-os');
  if (!el) return;
  el.innerHTML = body();
  const m = document.getElementById('dm-map');
  const d = S.sel !== '*' && S.data.get(key(S.sel));
  if (m && d) drawMap(m, d.countries ?? []);
}

export function render() {
  setTimeout(() => { loadAll(); startLive(); });
  return `<div class="os-title">Dom<b>ener</b></div><div id="dom-os" class="dm">${body()}</div>`;
}

function pick(name) {
  S.sel = name;
  try { sessionStorage.setItem('hl_dom_sel', name); } catch { /* privat modus */ }
  loadAll();
}

export function bind(view) {
  view.addEventListener('click', async (e) => {
    if (!e.target.closest('#dom-os')) return;
    const s = e.target.closest('[data-dom-sel]');
    if (s) return pick(s.dataset.domSel);
    const p = e.target.closest('[data-dom-per]');
    if (p) { S.per = p.dataset.domPer; return loadAll(); }
    if (e.target.closest('[data-dom-refresh]')) { S.list = null; return loadAll(true); }
    if (e.target.closest('[data-dom-add]')) { S.adding = !S.adding; S.formErr = ''; return paint(); }
    if (e.target.closest('[data-dom-settings]')) return openSettings('int');
    const del = e.target.closest('[data-dom-del]');
    if (del && del.dataset.domDel && confirm(`Fjerne ${S.sel}? Statistikk og oppetidshistorikk slettes.`)) {
      try { await D(`/domains/${del.dataset.domDel}`, { method: 'DELETE' }); S.list = null; S.sel = '*'; S.data.clear(); loadAll(); } catch (err) { alert(err.message); }
    }
  });
  view.addEventListener('change', (e) => {
    const f = e.target.closest('[data-dom-form]');
    if (!f) return;
    S.form = { ...S.form, name: f.elements.name.value, url: f.elements.url?.value ?? S.form.url, source: f.elements.source.value };
    if (e.target.name === 'source') paint();
  });
  view.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-dom-form]');
    if (!f) return;
    e.preventDefault();
    const body = { name: f.elements.name.value.trim(), source: f.elements.source.value, token: f.elements.token?.value ?? '', url: f.elements.url?.value.trim() ?? '' };
    S.busy = true; S.formErr = ''; paint();
    try {
      const r = await D('/domains', { method: 'POST', json: body });
      S.adding = false; S.form = { name: '', source: 'cloudflare', token: '', url: '' };
      S.list = null; S.busy = false;
      pick(r.name);
    } catch (err) { S.busy = false; S.formErr = err.message; S.form = { ...S.form, ...body, token: '' }; paint(); }
  });
}

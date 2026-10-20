// Domener: flere domener med trafikk, sanntid, publikum (verdenskart), ytelse, sikkerhet, innhold og infrastruktur.
import { api, esc } from './util.js';
import { store } from './store.js';
import { openSettings } from './settings.js';
import { drawMap } from './worldmap.js';
import { SRC } from './settings-domains.js';
import { is2c } from './hltheme.js';
import { glimt } from './glimt.js';
import { fig, hostFor } from './glimt-figs.js';
import { gs } from './glimt35.js';
const figHtml = () => { let w = 'glimt'; try { w = hostFor(gs().char); } catch { /* */ } return fig(w, 26, 'idle'); };

const D = (p, o) => api('/../domains/api' + p, o);
const PERIODS = [['1h', '1t'], ['24h', '24t'], ['7d', '7d'], ['30d', '30d']];
const PER_TXT = { '1h': 'time', '24h': '24 timer', '7d': '7 dager', '30d': '30 dager' };
const UNIT_TXT = { '1h': 'minutt', '24h': 'halvtime', '7d': 'time', '30d': 'dag' };
const S = { list: null, sel: null, per: '24h', data: new Map(), err: null };
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
// Prompt 36 (claude-code-domener-hurtig.md): stale-while-revalidate. Siste statistikk per domene og periode ligger i
// localStorage og vises med en gang; ferske tall hentes i bakgrunnen (eldre enn 60 s) og byttes uten skjelett.
// Forhåndshentes når web er ledig (requestIdleCallback) og ved hover på «Domener» i menyen.
const key = (n) => `${n}|${S.per}`;
const AT = new Map(); // nøkkel → tidspunkt hentet
const LSK = () => `hl_dom_cache_v1:${store.me?.me?.id ?? ''}`;
let cacheRead = false;
function readCache() {
  if (cacheRead) return; cacheRead = true;
  try {
    const c = JSON.parse(localStorage.getItem(LSK()) || 'null');
    if (!c) return;
    if (!S.list && Array.isArray(c.list)) S.list = c.list;
    for (const [k, v] of Object.entries(c.data ?? {})) if (!S.data.has(k) && v && !v.error) { S.data.set(k, v); AT.set(k, 0); }
  } catch { /* */ }
}
let saveT = null;
function writeCache() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { const data = {}; for (const [k, v] of S.data) if (v && !v.error) data[k] = v; localStorage.setItem(LSK(), JSON.stringify({ list: S.list, data })); } catch { /* full eller privat */ } }, 300);
}
async function fetchOne(name, force) {
  const k = key(name);
  if (!force && S.data.has(k) && Date.now() - (AT.get(k) ?? 0) < 60_000) return S.data.get(k);
  const d = await D(`/${encodeURIComponent(name)}/analytics?range=${S.per}`).catch((e) => ({ name, error: e.message }));
  if (d?.error && S.data.get(k) && !S.data.get(k).error) return S.data.get(k); // behold forrige tall ved feil
  S.data.set(k, d); AT.set(k, Date.now()); writeCache();
  return d;
}
/** Forhåndshenter liste og statistikk (24 t) for alle domener i bakgrunnen. */
export async function prefetchDomains() {
  readCache();
  try {
    if (!S.list || Date.now() - (AT.get('list') ?? 0) > 60_000) { S.list = await D('/domains'); AT.set('list', Date.now()); writeCache(); }
    await Promise.all((S.list ?? []).map((x) => fetchOne(x.name)));
    // Prompt 38: alt er lastet før Domener åpnes – også kartet (verdenskartet) og Glimt-oppsummeringen (aldri blokkerende).
    import('./worldmap.js').then((m) => m.preloadMap?.()).catch(() => {});
    const sel = (() => { try { return sessionStorage.getItem('hl_dom_sel'); } catch { return null; } })() ?? ((S.list ?? []).length > 1 ? '*' : S.list?.[0]?.name ?? '*');
    if (!SUM.get(sel)?.data && !SUM.get(sel)?.busy) setTimeout(() => sumLoad(sel).catch(() => {}), 200);
  } catch { /* prøves igjen når siden åpnes */ }
}
async function loadAll(force) {
  readCache();
  try {
    if (!S.list || force) { S.list = await D('/domains'); AT.set('list', Date.now()); writeCache(); }
    else if (Date.now() - (AT.get('list') ?? 0) > 60_000) D('/domains').then((l) => { if (Array.isArray(l)) { S.list = l; AT.set('list', Date.now()); writeCache(); paint(); } }).catch(() => {});
    if (S.sel === null) S.sel = sessionStorage.getItem('hl_dom_sel') ?? (S.list.length > 1 ? '*' : S.list[0]?.name ?? '*');
    if (S.sel !== '*' && !S.list.some((x) => x.name === S.sel)) S.sel = '*';
    paint();
    const names = S.sel === '*' ? S.list.map((x) => x.name) : [S.sel];
    await Promise.all(names.map((n) => fetchOne(n, force)));
    S.err = null;
    // Uten serverens oppsummering lages den lokalt når statistikken er hentet.
    const st = SUM.get(S.sel); if (st && !st.busy && !st.data && (sumMissing || st.err)) setTimeout(() => sumLoad(S.sel));
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

/* ---------- Prompt 32: Glimt-oppsummering (claude-code-domener-ai-oppsummering.md, fasit sumVals/sumLocal) ---------- */
// Serveren (SERVER32, server/domains-glimt.js) lager oppsummeringen daglig kl. 07:00 og på forespørsel, lagret per domene/bruker:
//   GET  /api/domains/:domain/summary  (:domain = navn eller «*») → lages nå hvis det ikke finnes en for i dag
//   POST /api/domains/:domain/summary  «↻ Lag ny» → {domain, label, date, createdAt, manual, head, pts:[{t, tone, color}], meta, model}
// Mangler endepunktet (404), lages samme format her ut fra statistikken (regelbasert, som sumLocal i designet).
const sumUrl = (sel) => `/api/domains/${encodeURIComponent(sel)}/summary`;
const SUM = new Map(); // domene|* → {busy, data, err, at}
const TONE_C = { pos: 'var(--dm-pos)', neg: 'var(--dm-neg)', warn: 'var(--dm-warn)', info: 'var(--dm-info)', neutral: 'var(--dm-neu)' };
let sumMissing = false;
const todayKey = () => new Date().toLocaleDateString('sv-SE');
function normSum(j) {
  const x = j?.summary ?? j?.item ?? (j?.head ? j : null);
  if (!x || !x.head) return null;
  const pts = (x.points ?? x.pts ?? []).map((p) => (typeof p === 'string' ? { t: p, tone: 'info' } : { t: p.t ?? p.text ?? '', tone: p.tone ?? 'info' })).filter((p) => p.t).slice(0, 4);
  return { head: String(x.head), pts, at: x.createdAt ?? x.created_at ?? x.at ?? null, date: x.date ?? null, manual: !!x.manual, model: x.model ?? '', local: !!x.local, meta: x.meta ?? '' };
}
function localSum(sel) {
  const names = sel === '*' ? (S.list ?? []).map((x) => x.name) : [sel];
  const F = names.map((n) => S.data.get(`${n}|24h`) ?? S.data.get(key(n))).filter((d) => d && d.requests != null).map((d) => ({
    name: d.name, req: d.requests ?? 0, vis: d.visitors ?? 0, thr: d.threats?.total ?? 0, cache: d.cachedPct ?? 0, ms: d.ttfb?.p50 ?? null,
    ch: d.prev?.requests ? Math.round(((d.requests - d.prev.requests) / d.prev.requests) * 1000) / 10 : 0, certD: days(d.sslExpires), expD: days(d.renews) }));
  if (!F.length) return null;
  const sg = (v) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')} %`, tn = (v) => (v >= 0 ? 'pos' : 'neg'), pts = [];
  const tot = F.reduce((a, f) => a + f.req, 0), vis = F.reduce((a, f) => a + f.vis, 0), thr = F.reduce((a, f) => a + f.thr, 0);
  const warn = F.filter((f) => (f.certD != null && f.certD < 30) || (f.expD != null && f.expD < 45)).sort((a, b) => Math.min(a.certD ?? 999, a.expD ?? 999) - Math.min(b.certD ?? 999, b.expD ?? 999));
  const top = [...F].sort((a, b) => b.ch - a.ch)[0], all = sel === '*';
  let head;
  if (warn.length) { const w = warn[0]; head = w.certD != null && w.certD < 30 ? `Sertifikatet for ${w.name} går ut om ${w.certD} dager.` : `${w.name} må fornyes om ${w.expD} dager.`; }
  else if (all) head = `Rolig døgn. Alle ${F.length} domener er oppe, med ${big(tot)} forespørsler totalt.`;
  else head = `${F[0].ch >= 10 ? 'Mer trafikk enn vanlig på ' : F[0].ch < 0 ? 'Litt roligere døgn på ' : 'Rolig døgn på '}${F[0].name}.`;
  if (all) { pts.push({ t: `${big(tot)} forespørsler og ${nb(vis)} unike besøkende siste døgn.`, tone: 'info' }); if (top && F.length > 1) pts.push({ t: `${top.name} økte mest, ${sg(top.ch)} fra døgnet før.`, tone: tn(top.ch) }); }
  else { const f = F[0]; pts.push({ t: `${big(f.req)} forespørsler og ${nb(f.vis)} unike besøkende, ${sg(f.ch)} fra døgnet før.`, tone: tn(f.ch) }); pts.push({ t: `${pc(f.cache)} ble levert fra cache.${f.ms ? ` Median svartid ${f.ms} ms.` : ''}`, tone: 'info' }); }
  pts.push({ t: `Cloudflare blokkerte ${nb(thr)} trusler, mest bot-trafikk.`, tone: 'warn' });
  const nx = F.filter((f) => f.certD != null).sort((a, b) => a.certD - b.certD)[0];
  if (nx) pts.push({ t: warn.length ? 'Forny i Cloudflare eller hos registraren før fristen.' : `Ingen frister snart. Neste sertifikat (${nx.name}) fornyes om ${nx.certD} dager.`, tone: warn.length ? 'warn' : 'neutral' });
  return { head, pts: pts.slice(0, 4), at: new Date().toISOString(), manual: true, local: true };
}
async function sumLoad(sel, manual = false) {
  const st = SUM.get(sel) ?? {};
  if (st.busy) return;
  SUM.set(sel, { ...st, busy: true, err: '' }); paintSum();
  let data = null, err = '';
  const t0 = Date.now();
  if (!sumMissing) {
    try {
      let r = manual ? null : await fetch(sumUrl(sel), { credentials: 'same-origin', cache: 'no-store' });
      if (r && r.status === 404 && !(await r.clone().json().catch(() => ({})))?.error) sumMissing = true;
      else {
        data = r?.ok ? normSum(await r.json()) : null;
        if (r && !r.ok) err = (await r.json().catch(() => ({})))?.error ?? `Feil ${r.status}`;
        // «Lag ny», eller ingen oppsummering for i dag: lag en nå.
        if (manual || (!data && !err) || (data?.date && data.date !== todayKey())) {
          r = await fetch(sumUrl(sel), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manual: true }) });
          if (r.status === 404 && !manual) sumMissing = true; else if (r.ok) { data = normSum(await r.json()) ?? data; err = ''; } else err = (await r.json().catch(() => ({})))?.error ?? `Feil ${r.status}`;
        }
      }
    } catch (e) { err = e.message; }
  }
  if (!data) { data = localSum(sel); if (data) err = ''; }
  if (manual) await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - t0))));
  SUM.set(sel, { busy: false, data, err, at: Date.now() });
  paintSum();
}
function sumHtml() {
  const sel = S.sel, st = SUM.get(sel);
  if (!st) { setTimeout(() => sumLoad(sel)); }
  const busy = !st || st.busy, c = st?.data, who = sel === '*' ? 'Alle domener' : sel;
  const hm = (t) => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  const meta = busy ? 'Glimt leser statistikken …' : c?.meta ? c.meta : c ? `${c.manual ? `Laget nå kl. ${hm(c.at ?? Date.now())}` : `Daglig · i dag kl. ${hm(c.at ?? Date.now())}`} · ${who}` : st?.err ? `Fikk ikke laget oppsummeringen: ${st.err}` : `Ingen statistikk ennå · ${who}`;
  return `<section class="dm-card dm-sum dm36-in" data-dm-sum><div class="dm-sum-h">${glimt(30, busy ? 'tenker' : 'klar')}<span class="dm-sum-k"><span class="dm-sum-l">GLIMT · OPPSUMMERING</span><span class="dm-sum-m" data-no-i18n>${esc(meta)}</span></span>
    <button type="button" class="dm36-hide" data-dom-sumtog aria-label="Skjul oppsummeringen" title="Skjul"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button><button type="button" class="dm-sum-b" data-dom-sumrun${busy ? ' disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>${busy ? 'Lager …' : 'Lag ny'}</button></div>
    ${busy ? `<div class="dm-sum-sk">${['82%', '96%', '88%', '70%'].map((w, i) => `<span style="width:${w};height:${i ? 12 : 18}px"></span>`).join('')}</div>`
    : c ? `<b class="dm-sum-t" data-no-i18n>${esc(c.head)}</b><div class="dm-sum-p">${c.pts.map((p) => `<div><i style="background:${TONE_C[p.tone] ?? TONE_C.info}"></i><span data-no-i18n>${esc(p.t)}</span></div>`).join('')}</div>` : ''}</section>`;
}
function paintSum() {
  const el = document.querySelector('#dom-os [data-dm-sum]');
  if (!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = sumHtml();
  el.replaceWith(tmp.firstElementChild);
}

/* ---------- Prompt 32: Google Søk (claude-code-domener-search-console.md, fasit gscVals) ---------- */
// SERVER32 (server/domains-glimt.js):
//   GET    /api/domains/:domain/gsc?period=7|28|90 → ikke koblet {connected:false, configured, steps, connectUrl} · velg eiendom
//          {connected:true, needsSite:true, candidates:[siteUrl]} · utløpt {connected:false, reconnect:true, error} · ok {connected, site,
//          account, dataTo, fetchedAt, kpi:{clicks|impressions|ctr|position:{value, prev, changePct}}, series[], queries[], pages[], footer}
//   GET    /api/gsc/auth?return=…                  → videre til Google (OAuth, webmasters.readonly)
//   POST   /api/gsc/site {domain, siteUrl}         → velger eiendom når flere passer
//   DELETE /api/gsc                                 → kobler fra
const GSC = { per: 28, data: new Map(), busy: false };
const G_LOGO = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>';
const gKey = (n) => `${n}|${GSC.per}`;
async function gscLoad(name, force = false) {
  if (!force && GSC.data.has(gKey(name))) return;
  GSC.data.set(gKey(name), { loading: true });
  let d;
  try {
    const r = await fetch(`/api/domains/${encodeURIComponent(name)}/gsc?period=${GSC.per}`, { credentials: 'same-origin', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    d = r.status === 404 && !j.connected ? { missing: !j.error || /not found/i.test(j.error), connected: false, error: j.error && !/not found/i.test(j.error) ? j.error : '' } : r.ok ? j : { connected: false, error: j.error || `Feil ${r.status}`, reconnect: r.status === 401 || r.status === 403 };
  } catch (e) { d = { connected: false, error: e.message }; }
  GSC.data.set(gKey(name), d);
  if (S.sel === name) paintGsc();
}
const num = (v) => (v == null || Number.isNaN(+v) ? null : +v);
const chg = (cur, prev, lowerBetter = false) => {
  if (cur == null || !prev) return { d: '', c: 'var(--dm-mut)' };
  const v = ((cur - prev) / prev) * 100, good = lowerBetter ? v <= 0 : v >= 0;
  return { d: `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')} % mot forrige`, c: good ? 'var(--dm-pos)' : 'var(--dm-neg)' };
};
const dmShort = (s) => { const x = new Date(String(s).length === 10 ? `${s}T12:00` : s); return Number.isNaN(+x) ? '' : `${x.getDate()}.${x.getMonth() + 1}.`; };
const pathOf = (u) => { try { const x = new URL(u); return x.pathname + (x.search || ''); } catch { return String(u ?? ''); } };
function gscHtml(name) {
  const d = GSC.data.get(gKey(name));
  if (!d) setTimeout(() => gscLoad(name));
  const head = (on) => `<div class="dm-gsc-h"><div class="dm-gsc-t">${G_LOGO}<span>Google Søk</span></div>${on ? `<div class="dm-gsc-per">${[[7, '7 dager'], [28, '28 dager'], [90, '3 mnd']].map(([k, n]) => `<button type="button" data-dom-gper="${k}" aria-pressed="${GSC.per === k}">${n}</button>`).join('')}</div>` : ''}</div>`;
  if (!d || d.loading) return `<div data-dm-gsc>${head(false)}<div class="skeleton" style="min-height:160px;border-radius:24px"></div></div>`;
  if (!d.connected) {
    const sites = null;
    if (sites) return `<div data-dm-gsc>${head(false)}<section class="dm-card dm-gsc-off"><b class="dm-gsc-bt">Velg eiendom</b><span class="dm-gsc-tx">Google-kontoen har flere eiendommer som passer ${esc(name)}.</span><div class="dm-gsc-sites">${sites.map((x) => `<button type="button" class="dm-gsc-cbtn" data-dom-gsite="${esc(x.siteUrl ?? x)}">${esc(x.siteUrl ?? x)}</button>`).join('')}</div></section></div>`;
    const re = !!(d.reconnect || d.error);
    return `<div data-dm-gsc>${head(false)}<section class="dm-card dm-gsc-off">
      <div class="dm-gsc-intro"><b class="dm-gsc-bt">${re ? 'Koble til på nytt' : 'Koble til Google Search Console'}</b><span class="dm-gsc-tx">${re && d.error ? `${esc(d.error)} ` : ''}Se klikk, visninger, plassering og hvilke søk som gir trafikk til ${esc(name)}. Dataene hentes én gang i døgnet og er 2–3 dager forsinket fra Google.</span></div>
      <div class="dm-gsc-steps">${['Logg inn med Google-kontoen som eier eiendommen', `Velg eiendom, f.eks. sc-domain:${name}`, 'Data for de siste 16 månedene hentes inn'].map((t, i) => `<div><span>${i + 1}</span><span>${esc(t)}</span></div>`).join('')}</div>
      <div class="dm-gsc-cta"><button type="button" class="dm-gsc-cbtn" data-dom-gconnect${d.missing ? ' disabled title="Serveren har ikke Google Search Console ennå"' : ''}>${G_LOGO}${re ? 'Koble til på nytt' : 'Koble til med Google'}</button><span class="dm-gsc-ro">${d.missing ? 'Serveren har ikke Google Search Console ennå' : d.configured === false ? 'Kun lesetilgang · webmasters.readonly · Google-klienten settes opp under Innstillinger → Kalendere' : 'Kun lesetilgang · webmasters.readonly'}</span></div></section></div>`;
  }
  if (d.needsSite) {
    const L = d.candidates ?? d.sites ?? [];
    return `<div data-dm-gsc>${head(false)}<section class="dm-card dm-gsc-off"><b class="dm-gsc-bt">Velg eiendom</b><span class="dm-gsc-tx">Google-kontoen har flere eiendommer som kan passe ${esc(name)}. Velg den som skal brukes.</span><div class="dm-gsc-sites">${L.map((x) => { const u = x.siteUrl ?? x; return `<button type="button" class="dm-gsc-cbtn" data-dom-gsite="${esc(u)}">${G_LOGO}<span data-no-i18n>${esc(u)}</span></button>`; }).join('') || '<span class="dm-gsc-tx">Fant ingen eiendom. Legg til domenet i Search Console først.</span>'}</div></section></div>`;
  }
  // kpi:{clicks:{value, prev}} (SERVER32) eller flate tall (totals/prev).
  const kv = (k) => { const v = d.kpi?.[k]; return v && typeof v === 'object' ? v : { value: d.totals?.[k] ?? d.kpi?.[k], prev: d.prev?.[k] }; };
  const T = { clicks: kv('clicks').value, impressions: kv('impressions').value, ctr: kv('ctr').value, position: kv('position').value }, P = { clicks: kv('clicks').prev, impressions: kv('impressions').prev, ctr: kv('ctr').prev, position: kv('position').prev };
  const daily = (d.series ?? d.daily ?? d.days ?? []).map((x) => ({ date: x.date ?? x.d, c: num(x.clicks ?? x.c) ?? 0, i: num(x.impressions ?? x.i) ?? 0 }));
  const C = num(T.clicks) ?? daily.reduce((a, x) => a + x.c, 0), I = num(T.impressions) ?? daily.reduce((a, x) => a + x.i, 0);
  const ctr = num(T.ctr) != null ? (T.ctr <= 1 ? T.ctr * 100 : T.ctr) : I ? (C / I) * 100 : null, pos = num(T.position);
  const pctr = num(P.ctr) != null ? (P.ctr <= 1 ? P.ctr * 100 : P.ctr) : null;
  const kpi = [['Klikk', nb(C), '#3b6fb5', chg(C, num(P.clicks))], ['Visninger', big(I), '#7a5ad6', chg(I, num(P.impressions))], ['CTR', pc(ctr), '#2f7a4f', chg(ctr, pctr)], ['Snittposisjon', pos == null ? '–' : pos.toFixed(1).replace('.', ','), '#9a5a10', { d: 'Lavere er bedre', c: 'var(--dm-mut)' }]];
  const cl = daily.map((x) => x.c), im = daily.map((x) => x.i);
  const xs = daily.length ? [daily[0].date, daily[Math.floor((daily.length - 1) / 2)].date, daily[daily.length - 1].date].map(dmShort) : [];
  const q = (d.queries ?? []).slice(0, 8).map((x) => { const p = num(x.position); return `<div class="dm-gsc-r q"><span class="ell" data-no-i18n>${esc(x.query ?? x.q ?? x.keys?.[0] ?? '')}</span><span class="mono">${nb(x.clicks)}</span><span class="mono mut">${big(num(x.impressions))}</span><span class="mono" style="color:${p == null ? 'var(--dm-mut)' : p <= 3 ? 'var(--dm-pos)' : p <= 10 ? 'var(--dm-ink)' : 'var(--dm-neg)'}">${p == null ? '–' : p.toFixed(1).replace('.', ',')}</span></div>`; }).join('');
  const pg = (d.pages ?? []).slice(0, 6).map((x) => { const c = num(x.ctr); return `<div class="dm-gsc-r p"><span class="mono ell" data-no-i18n>${esc(pathOf(x.page ?? x.path ?? x.keys?.[0] ?? '/'))}</span><span class="mono">${nb(x.clicks)}</span><span class="mono mut">${c == null ? '–' : pc(c <= 1 ? c * 100 : c)}</span></div>`; }).join('');
  const fetched = d.fetchedAt ? new Date(d.fetchedAt) : null, isToday = fetched && fetched.toDateString() === new Date().toDateString();
  const meta = d.footer || [`Koblet til som ${d.account ?? d.email ?? 'Google-konto'}`, d.site ?? `sc-domain:${name}`, fetched ? `sist hentet ${isToday ? 'i dag' : fetched.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${fetched.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : '', d.dataTo ? `data til ${dmShort(d.dataTo)}` : ''].filter(Boolean).join(' · ');
  return `<div data-dm-gsc>${head(true)}
    ${d.error ? `<div class="dm-card dm-warn">${esc(d.error)}</div>` : ''}
    <div class="dm-gsc-kpis">${kpi.map(([l, v, c, dl]) => `<div class="dm-card dm-gsc-kpi" style="border-top:3px solid ${c}"><span>${l}</span><b class="mono">${esc(v)}</b><small style="color:${dl.c}">${dl.d || '&nbsp;'}</small></div>`).join('')}</div>
    <section class="dm-card"><div class="dm-gsc-ch"><b class="dm-h">Klikk og visninger</b><span class="dm-gsc-lg"><span><i style="background:#3b6fb5"></i>Klikk</span><span><i style="background:#7a5ad6"></i>Visninger</span></span></div>
      ${daily.length > 1 ? `<svg viewBox="0 0 600 150" preserveAspectRatio="none" class="dm-gsc-svg"><path d="${path(im, 600, 150, Math.max(...im, 1) * 1.1)}" fill="none" stroke="#7a5ad6" stroke-width="2" vector-effect="non-scaling-stroke" opacity=".7"/><path d="${path(cl, 600, 150, Math.max(...cl, 1) * 1.1)}" fill="none" stroke="#3b6fb5" stroke-width="2.4" vector-effect="non-scaling-stroke"/></svg><div class="dm-gsc-x mono">${xs.map((t) => `<span>${t}</span>`).join('')}</div>` : '<div class="dm-empty">Ingen dagsdata ennå. Google har 2–3 dagers forsinkelse.</div>'}</section>
    <div class="dm-gsc-two"><section class="dm-card dm-gsc-tbl"><div class="dm-gsc-th"><b class="dm-h">Søkeord</b><span>Klikk · Visn. · Pos.</span></div>${q || '<div class="dm-empty" style="padding:8px 22px">Ingen søkeord ennå</div>'}</section>
      <section class="dm-card dm-gsc-tbl"><div class="dm-gsc-th"><b class="dm-h">Sider i søk</b><span>Klikk · CTR</span></div>${pg || '<div class="dm-empty" style="padding:8px 22px">Ingen sider ennå</div>'}</section></div>
    <div class="dm-gsc-foot"><span data-no-i18n>${esc(meta)}</span><button type="button" data-dom-gdisc>Koble fra</button></div></div>`;
}
function paintGsc() {
  const el = document.querySelector('#dom-os [data-dm-gsc]');
  if (!el || S.sel === '*') return;
  const tmp = document.createElement('div'); tmp.innerHTML = gscHtml(S.sel);
  el.replaceWith(tmp.firstElementChild);
}

/* ---------- Visning ---------- */
const card = (cls, inner) => `<section class="dm-card ${cls}">${inner}</section>`;
const h = (t, sub = '') => `<div class="dm-h">${t}${sub ? ` <span>${sub}</span>` : ''}</div>`;
const bars = (list, valFn, nameFn, max) => {
  const m = max ?? Math.max(1, ...list.map(valFn));
  return list.map((x) => `<div class="dm-bar"><div><span>${esc(nameFn(x))}</span><span class="mono">${nb(valFn(x))}</span></div><div class="t"><div style="width:${(valFn(x) / m * 100).toFixed(1)}%"></div></div></div>`).join('') || '<div class="dm-empty">Ingen data</div>';
};

// Prompt 36: oppsummeringen er skjult bak en Glimt-knapp rett til høyre for domene-baren (variant «ved siden»):
// mørk pille med orb (Glimt-figuren + roterende regnbuering), «GLIMT» over «Oppsummering», oransje prikk når dagens er ny.
// Åpen/lukket huskes ikke mellom besøk.
const SEEN = 'hl_dom_sum_seen';
function sumNew() {
  const c = SUM.get(S.sel)?.data, d = new Date().toISOString().slice(0, 10);
  if (!c || c.manual) return false;
  try { return localStorage.getItem(SEEN) !== `${S.sel}|${d}`; } catch { return false; }
}
function glimtBtn() {
  if (!S.list?.length) return '';
  const st = SUM.get(S.sel); if (!st) setTimeout(() => sumLoad(S.sel)); // dagens hentes i bakgrunnen, så åpning er umiddelbar
  return `<button type="button" class="dm36-gb${S.sumOpen ? ' on' : ''}" data-dom-sumtog aria-expanded="${!!S.sumOpen}"><span class="dm36-orb" aria-hidden="true"><span class="dm36-ring"></span><span class="dm36-fig">${figHtml()}</span></span><span class="dm36-gt"><span>GLIMT</span><b>Oppsummering</b></span>${sumNew() && !S.sumOpen ? '<i class="dm36-dot" aria-label="Ny oppsummering"></i>' : ''}</button>`;
}
function pills() {
  const all = [['*', 'Alle domener', '#a8d4fb'], ...(S.list ?? []).map((x) => [x.name, x.name, '#8fe0b0'])];
  return `<div class="dm-top"><div class="dm36-row"><div class="dm-pills">${all.map(([k, n, dot]) => `<button data-dom-sel="${esc(k)}" aria-pressed="${S.sel === k}"><i style="background:${dot}"></i>${esc(n)}</button>`).join('')}
      <button class="add" data-dom-manage title="Legg til og fjern domener i Innstillinger">Administrer domener</button></div>${glimtBtn()}</div>
    <div class="dm-per">${PERIODS.map(([k, n]) => `<button data-dom-per="${k}" aria-pressed="${S.per === k}">${n}</button>`).join('')}<button data-dom-refresh title="Oppdater" aria-label="Oppdater">↻</button></div></div>`;
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
  return `${S.list.length ? card('dm-tbl', `<div class="dm-tw"><div class="dm-row head">${cols}</div>${tbl}</div>`) : `<div class="dm-card dm-empty">Ingen domener ennå. Legg dem til under Innstillinger → Utseende → Domener. <button class="dm-btn" data-dom-manage>Administrer domener</button></div>`}
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
    ${gscHtml(d.name ?? S.sel)}

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
        ${info.map(([l, v, c]) => `<div class="dm-kvr line"><span class="muted">${l}</span><span class="mono sm" style="text-align:right;${c ? `color:${c}` : ''}">${esc(v)}</span></div>`).join('')}`)}
    </div>`;
}

function body() {
  if (S.err && !S.list) return `<div class="dm-card dm-warn">${esc(S.err)}</div>`;
  if (!S.list) return `${pills()}<div class="skeleton" style="min-height:320px;border-radius:24px"></div>`;
  return `${pills()}${S.sumOpen ? sumHtml() : ''}${S.sel === '*' ? overview() : one()}`;
}

function paint() {
  const el = document.getElementById('dom-os');
  if (!el) return;
  el.innerHTML = body();
  const m = document.getElementById('dm-map');
  const d = S.sel !== '*' && S.data.get(key(S.sel));
  // Vindu og papir: kartet i papirfarger (fra #eadfca for få til #b23a2a for mange).
  if (m && d) drawMap(m, d.countries ?? [], is2c() ? { lo: '#eadfca', hi: '#b23a2a', empty: '#e3ddcf', stroke: '#ffffff' } : {});
}

export function render() {
  S.sumOpen = false;
  readCache();
  if (S.list && S.sel === null) { S.sel = sessionStorage.getItem('hl_dom_sel') ?? (S.list.length > 1 ? '*' : S.list[0]?.name ?? '*'); if (S.sel !== '*' && !S.list.some((x) => x.name === S.sel)) S.sel = '*'; }
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
    if (e.target.closest('[data-dom-sumtog]')) { S.sumOpen = !S.sumOpen; if (S.sumOpen) { try { localStorage.setItem(SEEN, `${S.sel}|${new Date().toISOString().slice(0, 10)}`); } catch { /* */ } const st = SUM.get(S.sel); if (!st || (!st.busy && !st.data)) sumLoad(S.sel); } return paint(); }
    if (e.target.closest('[data-dom-sumrun]')) return sumLoad(S.sel, true);
    const gp = e.target.closest('[data-dom-gper]');
    if (gp) { GSC.per = +gp.dataset.domGper; paintGsc(); return gscLoad(S.sel); }
    if (e.target.closest('[data-dom-gconnect]')) { const cu = GSC.data.get(gKey(S.sel))?.connectUrl || '/api/gsc/auth'; location.href = `${cu}${cu.includes('?') ? '&' : '?'}return=${encodeURIComponent('/#/domener')}`; return; }
    const gs = e.target.closest('[data-dom-gsite]');
    if (gs) { await fetch('/api/gsc/site', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: S.sel, siteUrl: gs.dataset.domGsite }) }).catch(() => {}); [...GSC.data.keys()].filter((k) => k.startsWith(`${S.sel}|`)).forEach((k) => GSC.data.delete(k)); paintGsc(); return gscLoad(S.sel); }
    if (e.target.closest('[data-dom-gdisc]')) { if (!confirm('Koble fra Google Search Console? Lagrede tall slettes ikke.')) return; await fetch('/api/gsc', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {}); GSC.data.clear(); paintGsc(); return gscLoad(S.sel); }
    if (e.target.closest('[data-dom-refresh]')) { S.list = null; GSC.data.clear(); return loadAll(true); }
    if (e.target.closest('[data-dom-manage]')) return openSettings('dom', 'doms');
    if (e.target.closest('[data-dom-settings]')) return openSettings('int');
  });
  // Domener lagt til eller fjernet i Innstillinger.
  document.addEventListener('hl:domains', () => { S.list = null; S.data.clear(); if (document.getElementById('dom-os')) loadAll(); });
}

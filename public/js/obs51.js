// Prompt 51 (OBS51): drift i Innstillinger → System (bare admin) og ntfy under Varsler (alle).
//   System: helsedashbord (containere, disker med trend, Ollama-kø, Mac-OCR, Mac mini, Proxmox, ntfy), selvreparasjon med
//   issue-utkast (Kopier – opprettes aldri automatisk) og trege forespørsler (spor). API: /api/system/obs51/* (SERVER51-API.md).
//   Varsler: ntfy-emner per enhet (/api/me/ntfy51).
import { esc } from './util.js';
import { store } from './store.js';
import { row66, sec, btn, seg, swb, banner, val66, bar66, kpis66, tone66, fld } from './sys66.js'; // prompt 66: samme komponenter som AI-siden
import { backupKpi66 } from './ops51.js'; // prompt 66: Backup-cellen i KPI-stripen

let R = () => {};
export const setObs51Render = (fn) => { if (typeof fn === 'function') R = fn; };
const admin = () => store.me?.me?.role === 'admin';
const O = { h: null, hErr: '', hLoading: false, hAt: 0, heal: null, tr: null, pve: null, pveOpen: false, msg: '', err: '', copied: '', ntfy: null, nErr: '', nMsg: '', nLoading: false, dev: '' };

async function j(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opts, headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers ?? {}) } });
  const b = await r.json().catch(() => null);
  if (!r.ok) throw new Error(b?.error || `Serveren svarte ${r.status}`);
  return b;
}
function loadAll(force = false) {
  if (O.hLoading || (!force && O.h && Date.now() - O.hAt < 60_000)) return;
  O.hLoading = true;
  Promise.allSettled([j(`/api/system/obs51/health${force ? '?force=1' : ''}`), j('/api/system/obs51/heal'), j('/api/system/obs51/traces?limit=15'), j('/api/system/obs51/proxmox')]).then(([h, he, tr, pv]) => {
    if (h.status === 'fulfilled') { O.h = h.value; O.hErr = ''; } else O.hErr = /404/.test(h.reason?.message) ? 'Serveren har ikke driftsdashbordet ennå. Oppdater Nordlys.' : h.reason?.message;
    if (he.status === 'fulfilled') O.heal = he.value;
    if (tr.status === 'fulfilled') O.tr = tr.value;
    if (pv.status === 'fulfilled') O.pve = pv.value;
  }).finally(() => { O.hLoading = false; O.hAt = Date.now(); R(); });
}

/* ---------------- Visning: System ---------------- */
// Prompt 66 (prompt 50b «fullfør utseendet»): samme komponenter som AI-siden (sys66.js → ui65): helse-banner, KPI-stripe,
// rader med ikonflis og statusmerke, 4 px stolper. Erstatter de grå flisene og de store kortene. Data og handlinger er de samme.

const ago = (iso) => { const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? 'nå' : s < 3600 ? `${Math.round(s / 60)} min siden` : s < 86400 ? `${Math.round(s / 3600)} t siden` : `${Math.round(s / 86400)} d siden`; };
const TONE_C = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' };
const loadingSec = (t) => sec('', row66({ ic: 'refresh', t, dot: 'busy' }));
const msgNote = () => `${O.msg ? `<p class="ac-note">${esc(O.msg)}</p>` : ''}${O.err ? `<p class="ac-note bad" role="alert">${esc(O.err)}</p>` : ''}`;

function healthHtml() {
  const h = O.h;
  if (!h) return O.hErr ? banner('bad', 'Fikk ikke hentet helsen', O.hErr, btn('Prøv igjen', 'data-o51="refresh"')) : loadingSec('Henter helsen …');
  const tone = tone66(h.overall);
  const ban = banner(tone === 'off' ? 'info' : tone, h.overallText, `${h.alerts.length ? `${h.alerts.length} ${h.alerts.length === 1 ? 'ting trenger' : 'ting trenger'} tilsyn · ` : ''}Sist hentet ${ago(h.at)}${h.mock ? ' · eksempeldata' : ''}`,
    btn(O.hLoading ? 'Henter …' : 'Oppdater', `data-o51="refresh"${O.hLoading ? ' disabled' : ''}`));
  const al = h.alerts.length ? sec('TRENGER TILSYN', h.alerts.map((a) => row66({ ic: 'warn', dot: tone66(a.level), t: a.title, s: a.text || '' })).join('')) : '';
  // KPI-stripe: Containere · Disk · Ollama · Backup (klikk går til siden der det hører hjemme).
  const C = h.containers, d0 = h.disks.find((d) => !d.error), ol = h.ollama, bk = backupKpi66(R);
  const kpi = kpis66([
    ['Containere', C.available ? `${C.up}/${C.total}` : '–', C.available ? (C.up < C.total ? `${C.total - C.up} kjører ikke` : 'alle kjører') : 'Docker svarer ikke', '', C.available && C.up < C.total ? 'warn' : !C.available ? 'bad' : ''],
    ['Disk', d0 ? (d0.pctText || `${Math.round(d0.pct ?? 0)} %`) : '–', d0 ? `${d0.name} brukt` : 'Ikke målt', '', d0 && tone66(d0.level) !== 'ok' ? tone66(d0.level) : ''],
    ['Ollama', ol.ok ? String(ol.loaded.length) : 'Av', ol.ok ? `i minnet · ${ol.queued} i kø` : 'svarer ikke', 'data-p65-ai="ov"', ol.ok ? '' : 'warn'],
    ['Backup', bk.v, bk.s, 'data-go="backup"', bk.tone],
  ]);
  const ct = C.available ? C.items.map((c) => row66({ ic: 'box', dot: c.health === 'unhealthy' ? 'bad' : tone66(c.color), t: c.name, mono: true, s: c.cpuText ? `CPU ${c.cpuText} · ${c.memText}` : '',
    right: val66(c.health === 'unhealthy' ? 'unhealthy' : c.state, c.health === 'unhealthy' ? 'bad' : c.state === 'running' ? '' : 'warn') })).join('')
    : row66({ ic: 'box', dot: 'bad', t: 'Docker-proxyen svarer ikke', s: C.error || '' });
  const disks = h.disks.map((d) => (d.error ? row66({ ic: 'hdd', dot: 'bad', t: d.name, s: d.error })
    : row66({ ic: 'hdd', dot: tone66(d.level), t: d.name, s: `${d.text}${d.trend?.text ? ` · ${d.trend.text}` : d.trend?.perDayText ? ` · ${d.trend.perDayText}` : ' · trenden kommer etter noen timer'}`, sc: d.trend?.text && tone66(d.level) !== 'ok' ? 'warn' : '',
      right: `<span class="sys66-meter">${bar66(d.pct, TONE_C[tone66(d.level)] ?? 'var(--ok)')}${val66(d.pctText || '')}</span>` }))).join('');
  const mm = h.macMini, mac = h.macOcr, pv = h.proxmox, nt = h.ntfy;
  const olS = ol.ok ? `${ol.paused ? 'Køen er på pause · ' : ''}${ol.running.length ? `Kjører: ${ol.running.map((r) => r.model).join(', ')}` : 'Ingen jobb nå'} · ${ol.queued} i kø · lastet: ${ol.loaded.length ? ol.loaded.map((m) => `${m.name}${m.vramGb ? ` (${String(m.vramGb).replace('.', ',')} GB)` : ''}`).join(', ') : 'ingen'}` : ol.error;
  const pvS = !pv.configured ? 'Ikke satt opp (valgfritt)' : pv.ok ? pv.nodes.map((n) => `${n.node} · CPU ${n.cpu ?? '–'} % · minne ${n.memPct ?? '–'} %`).join(' · ') : pv.error;
  const mach = [
    disks,
    row66({ ic: 'mac', dot: mm.ok ? 'ok' : 'warn', t: 'Mac mini', s: `${mm.model ?? 'AI-maskinen'}${mm.memGb ? ` · ${mm.memGb} GB` : ''} · ${mm.ok ? 'Ollama svarer' : 'Ollama svarer ikke'}` }),
    row66({ ic: 'chip', dot: ol.ok ? 'ok' : 'warn', t: 'Ollama', s: olS, right: btn('AI', 'data-p65-ai="ov"') }),
    row66({ ic: 'eye', dot: mac.enabled === false ? 'off' : mac.ok ? 'ok' : 'warn', t: 'Mac-OCR', s: mac.enabled === false ? 'Slått av i kvitteringsinnstillingene' : mac.ok ? `Svarer${mac.ms != null ? ` på ${mac.ms} ms` : ''}${mac.version ? ` · ${mac.version}` : ''}` : mac.error || 'Svarer ikke' }),
    row66({ ic: 'server', dot: !pv.configured ? 'off' : pv.ok ? 'ok' : 'bad', t: 'Proxmox', s: pvS, right: btn(O.pveOpen ? 'Lukk' : pv.configured ? 'Endre' : 'Sett opp', 'data-o51="pve"') }),
    O.pveOpen ? pveForm() : '',
    row66({ ic: 'bell', dot: !nt.configured ? 'off' : nt.ok ? (nt.tokenSet ? 'ok' : 'warn') : 'bad', t: 'ntfy', s: !nt.configured ? 'Ikke satt opp (NTFY_URL) · emner per enhet under Varsler' : nt.ok ? `Svarer${nt.tokenSet ? '' : ' · NTFY_TOKEN mangler'}` : nt.error || 'Svarer ikke', right: btn(nt.configured ? 'Varsler' : 'Sett opp', 'data-go="varsel"') }),
  ].join('');
  return `${ban}${kpi}${al}${sec('CONTAINERE', ct, { right: C.available ? `${C.up} av ${C.total} kjører` : '' })}${sec('MASKINER OG TJENESTER', mach)}${msgNote()}`;
}
function pveForm() {
  const p = O.pve ?? {};
  const f = (label, input) => fld(label, input);
  return `<form class="ac-form sys66-form" data-o51-form="pve"><p class="ac-note">Lag et API-token i Proxmox (Datacenter → Permissions → API Tokens) med rollen PVEAuditor. Tokenet lagres kryptert og vises aldri igjen.</p>
    ${f('Adresse', `<input name="url" placeholder="https://proxmox.lan:8006" value="${esc(p.url ?? '')}" autocomplete="off">`)}
    ${f('Token-ID', `<input name="tokenId" placeholder="homelab@pve!drift" value="${esc(p.tokenId ?? '')}" autocomplete="off">`)}
    ${f('Hemmelighet', `<input name="secret" type="password" placeholder="${p.secretSet ? '•••• (lagret – fyll inn for å bytte)' : 'UUID fra Proxmox'}" autocomplete="new-password">`)}
    ${f('CA (valgfritt)', `<textarea name="ca" rows="3" placeholder="${p.caSet ? 'Lagret – lim inn for å bytte' : '-----BEGIN CERTIFICATE----- (fra /etc/pve/pve-root-ca.pem)'}"></textarea>`)}
    <span class="ac-btns"><button type="submit" class="ac-b ink">Lagre</button>${p.configured ? btn('Fjern', 'data-o51="pveclear"', 'red') : ''}${btn('Lukk', 'data-o51="pve"')}</span></form>`;
}
function healHtml() {
  const he = O.heal;
  if (!he) return '';
  const s = he.settings;
  const steps = [...new Set([1, 3, 5, 10, s.maxPerHour].filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  const main = sec('SELVREPARASJON', [
    row66({ ic: 'wrench', dot: s.on ? 'ok' : 'off', t: 'Start containere på nytt automatisk', s: 'Unhealthy eller død → omstart via Docker-proxyen. Homelab selv startes aldri på nytt herfra.', right: swb(s.on, 'data-o51="healtog"', 'Start containere på nytt automatisk') }),
    row66({ ic: 'refresh', t: 'Maks omstarter per time', s: 'Per container. Når grensen nås, får du et issue-utkast med loggene (hemmeligheter maskert).', right: seg(steps.map((n) => [n, String(n)]), s.maxPerHour, (n) => `data-o51="max:${n}"`, 'Maks omstarter per time') }),
  ].join(''));
  const dr = he.drafts.length ? sec('ISSUE-UTKAST', he.drafts.map((d) => row66({ ic: 'bug', dot: 'warn', t: d.title, s: `${d.count > 1 ? `${d.count} ganger · ` : ''}${ago(d.updatedAt)}`,
    right: `${btn(O.copied === d.id ? 'Kopiert' : 'Kopier', `data-o51="copy:${esc(d.id)}"`)}${btn('Forkast', `data-o51="dismiss:${esc(d.id)}"`, 'red')}` })).join(''), { right: 'Opprettes aldri automatisk', note: 'Kopier og lim inn i GitHub selv.' }) : '';
  const act = { restart: 'startet på nytt', verify: 'frisk igjen', limit: 'grensen nådd' };
  const ev = he.events.slice(0, 8).map((e) => row66({ ic: e.action === 'limit' ? 'warn' : 'refresh', dot: e.ok ? 'ok' : e.action === 'limit' ? 'bad' : 'warn', t: e.container, mono: true,
    s: `${e.action === 'verify' && !e.ok ? 'fortsatt syk' : act[e.action] ?? e.action} (${e.reason})${e.message ? ` · ${e.message}` : ''}`, right: val66(ago(e.at)) })).join('');
  return `${main}${dr}${sec('HISTORIKK', ev || row66({ ic: 'clock', t: 'Ingen omstarter ennå', s: 'Hendelsene vises her når en container startes på nytt.' }))}${msgNote()}`;
}
// Kategorifargene i sporene: database · AI · eksterne kall · serverkode.
const CAT = { db: ['database', '#5b84d6'], ai: ['AI', '#9a6fd0'], ext: ['eksterne kall', '#c99a3e'], app: ['serverkode', '#7d8597'] };
function traceHtml() {
  const t = O.tr;
  if (!t) return '';
  const isHealth = (r) => /\/api\/health/.test(r);
  const max = Math.max(1, ...t.items.slice(0, 10).map((x) => x.ms));
  const items = t.items.slice(0, 10).map((x) => {
    const top = [...(x.spans.ai.top ?? []), ...(x.spans.ext.top ?? []), ...(x.spans.db.top ?? [])].sort((a, b) => b.ms - a.ms)[0];
    const main = x.main ?? Object.entries(CAT).find(([k]) => x.spans[k]?.ms)?.[0] ?? 'app';
    const r = row66({ ic: isHealth(x.route) ? 'pulse' : 'clock', t: `${x.method} ${x.route}`, mono: true, s: `${x.mainText ?? ''}${top ? ` · tregest: ${top.label} (${Math.round(top.ms)} ms)` : ''}`,
      right: val66(`${x.ms} ms · ${x.status} · ${ago(x.at)}`, x.status >= 500 ? 'bad' : '') });
    return `<div class="sys66-trw">${r}${bar66((x.ms / max) * 100, CAT[main]?.[1] ?? CAT.app[1])}</div>`;
  }).join('');
  const legend = `<span class="sys66-leg">${Object.values(CAT).map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</span>`;
  const routes = t.routes.slice(0, 12).map((r) => row66({ ic: isHealth(r.route) ? 'pulse' : 'route', t: `${r.method} ${r.route}`, mono: true, s: `${r.n} kall · ${r.slow} trege${r.errors ? ` · ${r.errors} feil` : ''}`,
    right: val66(`${r.p50 ?? '–'} · ${r.p95 ?? '–'} ms`, (r.p95 ?? 0) > 60000 ? 'bad' : '') })).join('');
  return `${sec('TREGE FORESPØRSLER', items || row66({ ic: 'clock', dot: 'ok', t: 'Ingen trege forespørsler ennå', s: `Over ${t.slowMs} ms siden serveren startet` }), { right: `over ${t.slowMs} ms` })}${items ? legend : ''}
    ${routes ? sec('PER RUTE', routes, { right: 'p50 · p95' }) : ''}`;
}

/** Prompt 65/66: System har faner – én del per fane (health = Oversikt, heal = Selvreparasjon, trace = Ytelse). Bare innholdet; roten (.sys66) legges rundt i settings-system.js. */
export function obs51PartHtml(part) {
  if (!admin()) return '';
  css();
  loadAll();
  const h = part === 'heal' ? healHtml() : part === 'trace' ? traceHtml() : healthHtml();
  return h || loadingSec(part === 'trace' ? 'Henter trege forespørsler …' : 'Henter selvreparasjonen …');
}

/* ---------------- Visning: Varsler (ntfy) ---------------- */

function loadNtfy() {
  if (O.ntfy || O.nLoading) return;
  O.nLoading = true;
  j('/api/me/ntfy51').then((x) => { O.ntfy = x; }).catch((e) => { O.nErr = /404/.test(e.message) ? '' : e.message; O.ntfy = /404/.test(e.message) ? { missing: true } : null; }).finally(() => { O.nLoading = false; R(); });
}
/** Gruppen «ntfy» på Varsler-siden. h = { group, row } fra settings.js. */
export function ntfyGroup51(h) {
  css();
  loadNtfy();
  const n = O.ntfy;
  if (!n || n.missing) return '';
  if (!n.enabled) return h.group('ntfy (selvhostet push)', [h.row({ t: 'ntfy', s: n.help })]);
  const rows = n.topics.map((t) => `<div class="sg-row"><span class="sg-txt"><b>${esc(t.device)}</b><span data-no-i18n class="o51-mono">${esc(t.subscribeUrl ?? t.topic)}</span><span>${t.lastOk ? `Sist levert ${esc(ago(t.lastOk))}` : 'Ikke levert ennå'}${t.fails ? ` · ${t.fails} feil` : ''}</span></span><button type="button" class="o51-btn" data-o51="ncopy:${esc(t.id)}">${O.copied === t.id ? 'Kopiert' : 'Kopier'}</button><button type="button" class="o51-btn" data-o51="ndel:${esc(t.id)}">Fjern</button></div>`);
  rows.push(`<form class="sg-row" data-o51-form="ntfy"><span class="sg-txt"><b>Legg til enhet</b><span>Hver enhet får sitt eget, hemmelige emne. Abonner på adressen i ntfy-appen.</span></span><input name="device" maxlength="60" placeholder="F.eks. iPhone" value="${esc(O.dev)}" data-o51-dev aria-label="Enhetsnavn"><button type="submit" class="o51-btn pri">Legg til</button></form>`);
  if (n.topics.length) rows.push(h.row({ t: 'Test ntfy', s: 'Sender et testvarsel til alle enhetene dine', btn: 'Test', act: 'data-o51="ntest"' }));
  const note = [O.nErr && `<span class="red">${esc(O.nErr)}</span>`, O.nMsg && esc(O.nMsg), esc(n.upstream?.text ?? '')].filter(Boolean).join(' ');
  return h.group('ntfy (selvhostet push)', rows, note);
}

/* ---------------- Klikk og skjema ---------------- */

async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
const flashCopied = (id) => { O.copied = id; R(); setTimeout(() => { if (O.copied === id) { O.copied = ''; R(); } }, 1800); };

export async function obs51Click(e, rr) {
  if (rr) setObs51Render(rr);
  const b = e.target.closest('[data-o51]');
  if (!b || b.disabled) return false;
  e.preventDefault();
  const a = b.dataset.o51;
  O.err = ''; O.msg = '';
  try {
    if (a === 'refresh') loadAll(true);
    else if (a === 'pve') { O.pveOpen = !O.pveOpen; R(); }
    else if (a === 'pveclear') { if (confirm('Fjerne Proxmox-tokenet?')) { O.pve = await j('/api/system/obs51/proxmox', { method: 'PUT', body: JSON.stringify({ clear: true }) }); O.pveOpen = false; loadAll(true); } }
    else if (a.startsWith('max:')) { O.heal = await j('/api/system/obs51/heal', { method: 'PUT', body: JSON.stringify({ maxPerHour: Number(a.slice(4)) }) }); R(); } // prompt 66: segment 1/3/5/10
    else if (a === 'healtog') { O.heal = await j('/api/system/obs51/heal', { method: 'PUT', body: JSON.stringify({ on: !O.heal?.settings?.on }) }); R(); }
    else if (a.startsWith('copy:')) { const d = await j(`/api/system/obs51/heal/drafts/${encodeURIComponent(a.slice(5))}`); if (await copy(d.markdown)) flashCopied(d.id); else O.err = 'Fikk ikke kopiert. Prøv igjen.'; }
    else if (a.startsWith('dismiss:')) { await j(`/api/system/obs51/heal/drafts/${encodeURIComponent(a.slice(8))}`, { method: 'DELETE' }); O.heal = await j('/api/system/obs51/heal'); R(); }
    else if (a.startsWith('ncopy:')) { const t = O.ntfy?.topics?.find((x) => x.id === a.slice(6)); if (t && await copy(t.subscribeUrl ?? t.topic)) flashCopied(t.id); }
    else if (a.startsWith('ndel:')) { if (confirm('Fjerne enheten? Den slutter å få ntfy-varsler.')) { O.ntfy = await j(`/api/me/ntfy51/topics/${encodeURIComponent(a.slice(5))}`, { method: 'DELETE' }); R(); } }
    else if (a === 'ntest') { O.nErr = ''; O.nMsg = 'Sender …'; R(); const r = await j('/api/me/ntfy51/test', { method: 'POST', body: '{}' }); O.nMsg = `Sendt til ${r.sent} av ${r.total} enheter.`; R(); }
  } catch (err) { if (a.startsWith('n')) { O.nErr = err.message; O.nMsg = ''; } else O.err = err.message; R(); }
  return true;
}
export async function obs51Change(e) {
  const s = e.target.closest?.('[data-o51-max]');
  if (!s) return false;
  try { O.heal = await j('/api/system/obs51/heal', { method: 'PUT', body: JSON.stringify({ maxPerHour: Number(s.value) }) }); } catch (err) { O.err = err.message; }
  R(); return true;
}
export function obs51Input(e) { if (!e.target.matches?.('[data-o51-dev]')) return false; O.dev = e.target.value; return true; }
export async function obs51Submit(e) {
  const f = e.target.closest?.('[data-o51-form]');
  if (!f) return false;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(f));
  try {
    if (f.dataset.o51Form === 'pve') {
      const body = { url: fd.url, tokenId: fd.tokenId, ...(fd.secret ? { secret: fd.secret } : {}), ...(fd.ca ? { ca: fd.ca } : {}) };
      O.pve = await j('/api/system/obs51/proxmox', { method: 'PUT', body: JSON.stringify(body) });
      O.pveOpen = false; O.msg = 'Proxmox er lagret.'; loadAll(true);
    } else if (f.dataset.o51Form === 'ntfy') {
      O.nErr = ''; O.nMsg = '';
      O.ntfy = await j('/api/me/ntfy51/topics', { method: 'POST', body: JSON.stringify({ device: fd.device || 'Enhet' }) });
      O.dev = ''; O.nMsg = 'Lagt til. Kopier adressen og abonner i ntfy-appen.';
    }
  } catch (err) { if (f.dataset.o51Form === 'ntfy') O.nErr = err.message; else O.err = err.message; }
  R(); return true;
}

/* ---------------- Stil ---------------- */

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'obs51-css';
  s.textContent = `.o51-wrap{display:flex;flex-direction:column;gap:28px;margin-top:28px}
.o51 .sg-t{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.o51-wrap .sg.o51{gap:12px}
.o51-card,.o51-al li{color:var(--text,#eef0f4)}
.o51 .sg-t .o51-pill,.o51 .sg-t .o51-btn{font:500 13px var(--sans,inherit);letter-spacing:0;text-transform:none}
.o51-pill{color:var(--text,#eef0f4);display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:500;padding:3px 10px;border-radius:999px;background:var(--row,#1d2738);border:1px solid var(--line,#232938)}
.o51-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}
.o51-btn{margin-left:auto;font:inherit;font-size:14px;padding:6px 12px;border-radius:10px;border:1px solid var(--line,#232938);background:var(--field,#0b0e15);color:var(--text,#eef0f4);cursor:pointer}
.o51-al .o51-btn,.sg-row .o51-btn{margin-left:0}
.o51-btn.pri{background:#3b6ef5;border-color:#3b6ef5;color:#fff}
.o51-btn:disabled{opacity:.6;cursor:default}
.o51-link{background:none;border:0;color:var(--blue,#a8d4fb);font:inherit;font-size:14px;padding:4px 0;cursor:pointer;text-align:left}
.o51-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.o51-card{background:var(--row,#1d2738);border:1px solid var(--line,#232938);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:8px;min-width:0}
.o51-ct{font-size:15px;font-weight:600;color:var(--text,#eef0f4)}
.o51-sub{font-size:14px;color:var(--muted,#8a93a6);line-height:1.4;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.o51-sub.red,.o51 .red{color:var(--red,#f59a8f)}
.o51-tr{font-size:14px;font-weight:600}
.o51-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto}
.o51-list li{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;align-items:center;font-size:14px}
.o51-list .o51-m{grid-column:2/4;color:var(--muted,#8a93a6);font-size:13px}
.o51-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.o51-s{color:var(--muted,#8a93a6);font-size:13px}
.o51-bar{display:flex;height:6px;border-radius:3px;background:var(--line,#232938);overflow:hidden}
.o51-bar>span{display:block;height:100%}
.o51-disk{display:flex;flex-direction:column;gap:5px}
.o51-disk+.o51-disk{margin-top:6px}
.o51-al{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.o51-al li{display:flex;align-items:flex-start;gap:10px;background:var(--row,#1d2738);border:1px solid var(--line,#232938);border-radius:14px;padding:12px 14px;font-size:14px;flex-wrap:wrap}
.o51-al li>.o51-dot{margin-top:5px}
.o51-al li>span:not(.o51-bar):not(.o51-sub):not(.o51-tl){flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.o51-al li>span:not(.o51-bar):not(.o51-sub):not(.o51-tl)>span{color:var(--muted,#8a93a6)}
.o51-trace .o51-sub{display:block;text-align:left}
.o51-trace li{flex-direction:column;align-items:stretch}
.o51-tl{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.o51-tl b{overflow-wrap:anywhere}
.o51-tl span{color:var(--muted,#8a93a6)}
.o51-bar.stack{height:8px}
.o51-tw{overflow-x:auto}
.o51-t{width:100%;border-collapse:collapse;font-size:13px}
.o51-t th,.o51-t td{text-align:left;padding:6px 8px;border-top:1px solid var(--line,#232938);white-space:nowrap}
.o51-t th{color:var(--muted,#8a93a6);font-weight:500}
.o51-form{display:flex;flex-direction:column;gap:10px;background:var(--row,#1d2738);border:1px solid var(--line,#232938);border-radius:18px;padding:16px 18px}
.o51-form label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--muted,#8a93a6)}
.o51-form input,.o51-form textarea,.sg-row input[data-o51-dev],select[data-o51-max]{font:inherit;font-size:15px;padding:8px 10px;border-radius:10px;border:1px solid var(--line,#232938);background:var(--field,#0b0e15);color:var(--text,#eef0f4);min-width:0}
.sg-row input[data-o51-dev]{max-width:180px}
.o51-row{display:flex;gap:8px;flex-wrap:wrap}
.o51-row .o51-btn{margin-left:0}
.o51-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow-wrap:anywhere}
@media (max-width:600px){.o51-grid{grid-template-columns:1fr}.o51-card[style]{grid-row:auto!important}.sg-row input[data-o51-dev]{max-width:120px}}`;
  document.head.appendChild(s);
}

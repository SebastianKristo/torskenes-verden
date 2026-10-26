// Prompt 51 (OBS51): drift i Innstillinger → System (bare admin) og ntfy under Varsler (alle).
//   System: helsedashbord (containere, disker med trend, Ollama-kø, Mac-OCR, Mac mini, Proxmox, ntfy), selvreparasjon med
//   issue-utkast (Kopier – opprettes aldri automatisk) og trege forespørsler (spor). API: /api/system/obs51/* (SERVER51-API.md).
//   Varsler: ntfy-emner per enhet (/api/me/ntfy51).
import { esc } from './util.js';
import { store } from './store.js';

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

const DOT = { green: '#3ecf8e', yellow: '#f2c94c', red: '#f2766b', ok: '#3ecf8e', warn: '#f2c94c', crit: '#f2766b' };
const dot = (c) => `<i class="o51-dot" style="background:${DOT[c] ?? '#8a93a6'}"></i>`;
const card = (title, body, extra = '') => `<div class="o51-card"${extra}><b class="o51-ct">${title}</b>${body}</div>`;
const bar = (pct, c) => `<span class="o51-bar"><span style="width:${Math.max(0, Math.min(100, pct ?? 0))}%;background:${c}"></span></span>`;
const ago = (iso) => { const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? 'nå' : s < 3600 ? `${Math.round(s / 60)} min siden` : s < 86400 ? `${Math.round(s / 3600)} t siden` : `${Math.round(s / 86400)} d siden`; };

function healthHtml() {
  const h = O.h;
  if (!h) return `<section class="sg"><h3 class="sg-t">Helse</h3><div class="sg-box"><div class="sg-row"><span class="sg-txt"><b>${O.hErr ? 'Fikk ikke hentet helsen' : 'Henter helsen …'}</b><span>${esc(O.hErr)}</span></span></div></div></section>`;
  const al = h.alerts.length ? `<ul class="o51-al">${h.alerts.map((a) => `<li>${dot(a.level)}<span><b>${esc(a.title)}</b>${a.text ? `<span>${esc(a.text)}</span>` : ''}</span></li>`).join('')}</ul>` : '';
  const ct = h.containers.available ? `<ul class="o51-list">${h.containers.items.map((c) => `<li>${dot(c.color)}<span class="o51-n" data-no-i18n>${esc(c.name)}</span><span class="o51-s">${c.health === 'unhealthy' ? 'unhealthy' : esc(c.state)}</span><span class="o51-m">${c.cpuText ? `${esc(c.cpuText)} · ${esc(c.memText)}` : ''}</span></li>`).join('')}</ul><span class="o51-sub">${h.containers.up} av ${h.containers.total} kjører</span>`
    : `<span class="o51-sub">${esc(h.containers.error || 'Docker-proxyen svarer ikke')}</span>`;
  const disks = h.disks.map((d) => (d.error ? `<div class="o51-disk"><b>${esc(d.name)}</b><span class="o51-sub">${esc(d.error)}</span></div>`
    : `<div class="o51-disk"><b>${esc(d.name)}</b>${bar(d.pct, DOT[d.level] ?? DOT.ok)}<span class="o51-sub">${esc(d.text)}${d.pctText ? ` · ${esc(d.pctText)} brukt` : ''}</span>${d.trend?.text ? `<span class="o51-tr" style="color:${DOT[d.level]}">${esc(d.trend.text)}</span>` : d.trend?.perDayText ? `<span class="o51-sub">${esc(d.trend.perDayText)}</span>` : `<span class="o51-sub">Trenden kommer etter noen timer med målinger.</span>`}</div>`)).join('');
  const ol = h.ollama;
  const olB = ol.ok ? `<span class="o51-sub">${ol.paused ? 'Køen er satt på pause · ' : ''}${ol.running.length ? `Kjører: ${ol.running.map((r) => esc(r.model)).join(', ')}` : 'Ingen jobb nå'} · ${ol.queued} i kø</span><span class="o51-sub">Lastet: ${ol.loaded.length ? ol.loaded.map((m) => `<span data-no-i18n>${esc(m.name)}</span>${m.vramGb ? ` (${String(m.vramGb).replace('.', ',')} GB)` : ''}`).join(', ') : 'ingen'}</span>` : `<span class="o51-sub">${esc(ol.error)}</span>`;
  const mac = h.macOcr;
  const macB = mac.enabled === false ? '<span class="o51-sub">Slått av i kvitteringsinnstillingene</span>' : `<span class="o51-sub">${mac.ok ? `Svarer${mac.ms != null ? ` på ${mac.ms} ms` : ''}${mac.version ? ` · ${esc(mac.version)}` : ''}` : esc(mac.error || 'Svarer ikke')}</span>`;
  const mm = h.macMini;
  const mmB = `<span class="o51-sub">${esc(mm.model ?? 'AI-maskinen')}${mm.memGb ? ` · ${mm.memGb} GB` : ''} · ${mm.ok ? 'Ollama svarer' : 'Ollama svarer ikke'}</span>`;
  const pv = h.proxmox;
  const pvB = !pv.configured ? '<span class="o51-sub">Ikke satt opp (valgfritt)</span>' : pv.ok ? pv.nodes.map((n) => `<span class="o51-sub">${dot(n.status === 'online' ? 'ok' : 'crit')}<span data-no-i18n>${esc(n.node)}</span> · CPU ${n.cpu ?? '–'} % · minne ${n.memPct ?? '–'} %</span>`).join('') : `<span class="o51-sub">${esc(pv.error)}</span>`;
  const nt = h.ntfy;
  const ntB = `<span class="o51-sub">${!nt.configured ? 'Ikke satt opp (NTFY_URL)' : nt.ok ? `Svarer${nt.tokenSet ? '' : ' · NTFY_TOKEN mangler'}` : esc(nt.error || 'Svarer ikke')}</span>`;
  return `<section class="sg o51"><h3 class="sg-t">Helse <span class="o51-pill">${dot(h.overall)}${esc(h.overallText)}</span><button type="button" class="o51-btn" data-o51="refresh" ${O.hLoading ? 'disabled' : ''}>${O.hLoading ? 'Henter …' : 'Oppdater'}</button></h3>
    ${al}<div class="o51-grid">${card('Containere', ct, ' style="grid-row:span 2"')}${card('Disk', disks)}${card('Ollama', olB)}${card('Mac-OCR', macB)}${card('Mac mini', mmB)}${card('Proxmox', pvB + `<button type="button" class="o51-link" data-o51="pve">${pv.configured ? 'Endre' : 'Sett opp'}</button>`)}${card('ntfy', ntB)}</div>
    ${O.pveOpen ? pveForm() : ''}<span class="o51-sub">Sist hentet ${esc(ago(h.at))}${h.mock ? ' · eksempeldata' : ''}</span></section>`;
}
function pveForm() {
  const p = O.pve ?? {};
  return `<form class="o51-form" data-o51-form="pve"><b>Proxmox-API</b><span class="o51-sub">Lag et API-token i Proxmox (Datacenter → Permissions → API Tokens) med rollen PVEAuditor. Tokenet lagres kryptert og vises aldri igjen.</span>
    <label>Adresse<input name="url" placeholder="https://proxmox.lan:8006" value="${esc(p.url ?? '')}" autocomplete="off"></label>
    <label>Token-ID<input name="tokenId" placeholder="homelab@pve!drift" value="${esc(p.tokenId ?? '')}" autocomplete="off"></label>
    <label>Hemmelighet<input name="secret" type="password" placeholder="${p.secretSet ? '•••• (lagret – fyll inn for å bytte)' : 'UUID fra Proxmox'}" autocomplete="new-password"></label>
    <label>CA-sertifikat (valgfritt, PEM fra /etc/pve/pve-root-ca.pem)<textarea name="ca" rows="3" placeholder="${p.caSet ? 'Lagret – lim inn for å bytte' : '-----BEGIN CERTIFICATE-----'}"></textarea></label>
    <span class="o51-row"><button type="submit" class="o51-btn pri">Lagre</button>${p.configured ? '<button type="button" class="o51-btn" data-o51="pveclear">Fjern</button>' : ''}<button type="button" class="o51-btn" data-o51="pve">Lukk</button></span></form>`;
}
function healHtml() {
  const he = O.heal;
  if (!he) return '';
  const s = he.settings;
  const ev = he.events.slice(0, 8).map((e) => `<li>${dot(e.ok ? 'ok' : e.action === 'limit' ? 'crit' : 'warn')}<span><b data-no-i18n>${esc(e.container)}</b> · ${esc({ restart: 'startet på nytt', verify: e.ok ? 'frisk igjen' : 'fortsatt syk', limit: 'grensen nådd' }[e.action] ?? e.action)} (${esc(e.reason)})<span>${esc(ago(e.at))}${e.message ? ` · ${esc(e.message)}` : ''}</span></span></li>`).join('');
  const dr = he.drafts.map((d) => `<li>${dot('warn')}<span><b>${esc(d.title)}</b><span>${d.count > 1 ? `${d.count} ganger · ` : ''}${esc(ago(d.updatedAt))}</span></span><button type="button" class="o51-btn" data-o51="copy:${esc(d.id)}">${O.copied === d.id ? 'Kopiert' : 'Kopier'}</button><button type="button" class="o51-btn" data-o51="dismiss:${esc(d.id)}">Forkast</button></li>`).join('');
  return `<section class="sg o51"><h3 class="sg-t">Selvreparasjon</h3><div class="sg-box">
    <button type="button" class="sg-row" data-o51="healtog" role="switch" aria-checked="${s.on}"><span class="sg-txt"><b>Start containere på nytt automatisk</b><span>Unhealthy eller død → omstart via Docker-proxyen, maks ${s.maxPerHour} per time per container. Homelab selv startes aldri på nytt herfra.</span></span><span class="sg-sw"></span></button>
    <div class="sg-row"><span class="sg-txt"><b>Maks omstarter per time</b><span>Når grensen nås, får du et issue-utkast med loggene (hemmeligheter maskert).</span></span><select data-o51-max aria-label="Maks omstarter per time">${[1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<option value="${n}"${n === s.maxPerHour ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
  </div>${dr ? `<b class="o51-ct">Issue-utkast</b><span class="o51-sub">Opprettes aldri automatisk. Kopier og lim inn i GitHub selv.</span><ul class="o51-al">${dr}</ul>` : ''}
  ${ev ? `<b class="o51-ct">Siste hendelser</b><ul class="o51-al">${ev}</ul>` : '<span class="o51-sub">Ingen omstarter ennå.</span>'}${O.msg ? `<span class="o51-sub">${esc(O.msg)}</span>` : ''}${O.err ? `<span class="o51-sub red">${esc(O.err)}</span>` : ''}</section>`;
}
function traceHtml() {
  const t = O.tr;
  if (!t) return '';
  const rows = t.routes.slice(0, 8).map((r) => `<tr><td data-no-i18n>${esc(r.method)} ${esc(r.route)}</td><td>${r.n}</td><td>${r.p50 ?? '–'}</td><td>${r.p95 ?? '–'}</td><td>${r.slow}</td></tr>`).join('');
  const items = t.items.slice(0, 10).map((x) => {
    const tot = Math.max(1, x.ms), seg = (k, c) => (x.spans[k]?.ms ? `<span title="${k} ${x.spans[k].ms} ms" style="width:${(x.spans[k].ms / tot) * 100}%;background:${c}"></span>` : '');
    const top = [...(x.spans.ai.top ?? []), ...(x.spans.ext.top ?? []), ...(x.spans.db.top ?? [])].sort((a, b) => b.ms - a.ms)[0];
    return `<li><span class="o51-tl"><b data-no-i18n>${esc(x.method)} ${esc(x.route)}</b><span>${x.ms} ms · ${x.status} · ${esc(ago(x.at))}</span></span><span class="o51-bar stack">${seg('db', '#7aa2f7')}${seg('ai', '#bb9af7')}${seg('ext', '#e0af68')}${seg('app', '#565f89')}</span><span class="o51-sub">${esc(x.mainText)}${top ? ` · tregest: <span data-no-i18n>${esc(top.label)}</span> (${Math.round(top.ms)} ms)` : ''}</span></li>`;
  }).join('');
  return `<section class="sg o51"><h3 class="sg-t">Trege forespørsler</h3><span class="o51-sub">Over ${t.slowMs} ms siden serveren startet. <span style="color:#7aa2f7">■</span> database <span style="color:#bb9af7">■</span> AI <span style="color:#e0af68">■</span> eksterne kall <span style="color:#565f89">■</span> serverkode</span>
    ${items ? `<ul class="o51-al o51-trace">${items}</ul>` : '<span class="o51-sub">Ingen trege forespørsler ennå.</span>'}
    ${rows ? `<div class="o51-tw"><table class="o51-t"><thead><tr><th>Rute</th><th>Antall</th><th>p50 ms</th><th>p95 ms</th><th>Trege</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}</section>`;
}

/** HTML-en under oppdateringskortet i System (bare admin). */
export function obs51SystemHtml() {
  if (!admin()) return '';
  css();
  loadAll();
  return `<div class="o51-wrap">${healthHtml()}${healHtml()}${traceHtml()}</div>`;
}
/** Prompt 65: System har faner – én del per fane (health = Oversikt, heal = Selvreparasjon, trace = Ytelse). */
export function obs51PartHtml(part) {
  if (!admin()) return '';
  css();
  loadAll();
  const h = part === 'heal' ? healHtml() : part === 'trace' ? traceHtml() : healthHtml();
  return `<div class="o51-wrap">${h || `<section class="sg"><div class="sg-box"><div class="sg-row"><span class="sg-txt"><b>${part === 'trace' ? 'Henter trege forespørsler …' : 'Henter selvreparasjonen …'}</b></span></div></div></section>`}</div>`;
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

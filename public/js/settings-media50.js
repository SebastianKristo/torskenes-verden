// Prompt 50 (SRVMEDIA50, claude-code-media-qbit-starter-ikke.md): Innstillinger → Media → Diagnostikk (bare admin).
// Én knapp kjører ledd 2–6 (Sonarr/Radarr og kommandoen, indeksere/Prowlarr, grab, nedlastingsklient, qBittorrent) og viser
// grønt/rødt per ledd med feilmeldingen og hva du kan gjøre. GET /api/media/diagnostics → {ok, summary, steps:[{id, n, title,
// state:'ok'|'warn'|'fail'|'skip', text, hint?, torrents?}]}. Stoppede torrenter kan startes herfra (POST …/torrents/:hash/start).
import { esc } from './util.js';
import { toast } from './toast.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-m50-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media50.css'; l.dataset.m50Css = ''; document.head.appendChild(l);
}
const DG = { d: null, busy: false, err: '' };
const IC = { ok: '✓', warn: '!', fail: '✕', skip: '–' };
async function j(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || (r.status === 404 ? 'Serveren har ikke diagnostikk ennå – oppdater Homelab.' : `Serveren svarte ${r.status}`)), { status: r.status });
  return d;
}
async function run(render) {
  if (DG.busy) return;
  DG.busy = true; DG.err = ''; render();
  try { DG.d = await j('/api/media/diagnostics'); } catch (e) { DG.err = e.message; }
  DG.busy = false; render();
}
function stepHtml(s) {
  const tors = (s.torrents ?? []).map((t) => `<div class="s50-tor"><code>${esc(t.state)}</code><span>${esc(t.name ?? '')}</span>${t.action?.id === 'start' ? `<button type="button" class="s50-btn" data-s50-start="${esc(t.hash)}">Start</button>` : ''}</div>`).join('');
  return `<div class="s50-st"><span class="s50-ic ${esc(s.state)}" aria-label="${s.state === 'ok' ? 'OK' : s.state === 'warn' ? 'Advarsel' : s.state === 'fail' ? 'Feil' : 'Hoppet over'}">${IC[s.state] ?? '?'}</span><div class="s50-tx"><b>Ledd ${esc(s.n)} · ${esc(s.title)}</b><span>${esc(s.text ?? '')}</span>${s.hint ? `<div class="s50-hint">${esc(s.hint)}</div>` : ''}${tors}</div></div>`;
}
/** Gruppen «Diagnostikk» i Innstillinger → Media. H = {group, row}. */
export function diagGroup50(H) {
  const D = DG.d;
  const cls = DG.err ? 'fail' : !D ? '' : D.ok ? (D.steps?.some((s) => s.state === 'warn') ? 'warn' : 'ok') : 'fail';
  const sum = DG.busy ? 'Kjører ledd 2–6 …' : DG.err ? DG.err : D ? D.summary : 'Finner ut hvorfor en nedlasting ikke starter';
  const head = `<div class="s50-head"><span class="s50-sum ${cls}">${esc(sum)}</span><button type="button" class="s50-btn" data-s50-diag${DG.busy ? ' disabled' : ''}>${DG.busy ? 'Kjører …' : D ? 'Kjør på nytt' : 'Kjør diagnostikk'}</button></div>`;
  const steps = D?.steps?.length ? D.steps.map(stepHtml).join('') : '';
  return H.group('Diagnostikk', [{ html: `<div class="s50-dg" id="media-diagnostikk">${head}${steps}</div>`, q: 'diagnostikk media nedlasting starter ikke qbittorrent sonarr radarr prowlarr indekser grab' }],
    'Sjekker Sonarr/Radarr, indekserne (Prowlarr), grab, nedlastingsklienten og qBittorrent. Det samme kjøres automatisk når et søk fra Media ikke har gitt noen nedlasting etter 60 sekunder. Nøkler og passord vises aldri.');
}
/** Klikk i gruppen. → true når håndtert. */
export async function diagClick50(e, render) {
  const b = e.target.closest('[data-s50-diag],[data-s50-start]');
  if (!b || b.disabled) return false;
  if ('s50Diag' in b.dataset) { run(render); return true; }
  if (b.dataset.s50Start) {
    b.disabled = true;
    try { await j(`/api/media/torrents/${encodeURIComponent(b.dataset.s50Start)}/start`, { method: 'POST', body: '{}' }); toast('Startet'); run(render); } catch (er) { b.disabled = false; toast(er.message); }
    return true;
  }
  return false;
}

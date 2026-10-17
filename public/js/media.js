// Dashbord-kort «Media»: Plex og Jellyfin (spilles nå + nylig lagt til). Data og plakater går via serveren.
import { esc } from './util.js';
import { store, widget, refresh, errBox, on, load } from './store.js';

const SRC = { plex: { name: 'Plex', bg: '#e5a00d', fg: '#1a1200', domain: 'plex.tv' }, jellyfin: { name: 'Jellyfin', bg: '#7b4fd6', fg: '#fff', domain: 'jellyfin.org' } };
const TINTS = ['#3b4a6b', '#5a3b6b', '#3b6b5e', '#6b4f3b', '#3b5a6b', '#6b3b48'];
const tint = (t) => TINTS[[...String(t)].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const ini = (t) => String(t).trim().charAt(0).toUpperCase() || '•';

// Egen stil (scopet til .media-*), lastes én gang.
if (!document.querySelector('link[data-media-css]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/assets/css/media.css'; l.dataset.mediaCss = '';
  document.head.appendChild(l);
}

const left = (ms) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} t ${m % 60} min igjen` : `${m} min igjen`;
};
const badge = (src) => { const s = SRC[src] ?? SRC.plex; return `<span class="media-src" style="background:${s.bg};color:${s.fg}">${s.name}</span>`; };
const art = (poster, title, cls) => `<div class="${cls}" style="background-color:${tint(title)};${poster ? `background-image:url('${esc(poster)}')` : ''}">${poster ? '' : `<span class="media-ini">${esc(ini(title))}</span>`}`;

function nowRow(n) {
  const how = n.mode === 'transcode' ? `transkoder${n.quality ? ' ' + n.quality : ''}` : `${n.quality ? n.quality + ' ' : ''}direkte`;
  const who = [n.user, n.device, how].filter(Boolean).join(' · ');
  const st = n.state === 'paused' ? ['❚❚', 'Pause'] : ['▶', 'Spiller'];
  return `<div class="media-now">${art(n.poster, n.title, 'media-now-art')}</div>
    <div class="media-now-body">
      <div class="media-now-top"><b title="${esc(n.title)}">${esc(n.title)}</b>${badge(n.src)}</div>
      <div class="media-who">${esc(who)}</div>
      <div class="media-prog"><div class="media-bar"><i style="width:${Math.max(0, Math.min(100, n.pct || 0))}%;background:${(SRC[n.src] ?? SRC.plex).bg}"></i></div><span>${esc(left(n.leftMs || 0))}</span></div>
    </div><span class="media-state" title="${st[1]}" aria-label="${st[1]}">${st[0]}</span></div>`;
}

function recentTile(m) {
  const tag = m.url && m.url !== '#' ? 'a' : 'div';
  return `<${tag} class="poster media-tile"${tag === 'a' ? ` href="${esc(m.url)}" target="_blank" rel="noopener"` : ''}>
    ${art(m.poster, m.title, 'poster-img media-tile-art')}${badge(m.src)}</div>
    <b title="${esc(m.title)}">${esc(m.title)}</b><span>${esc(m.sub)}</span></${tag}>`;
}

function serverChip(s) {
  const src = SRC[s.src] ?? SRC.plex;
  const dot = s.ok === false ? '#f3b54a' : '#8fe0b0';
  return `<a class="media-chip" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.ok === false ? `${s.name}: ${s.error ?? 'utilgjengelig'}` : `${s.name}${s.version ? ' ' + s.version : ''}`)}">
    <img src="/finans/api/logo/${src.domain}" alt="" width="18" height="18" loading="lazy"><span>${esc(src.name)}</span><i style="background:${dot}"></i></a>`;
}

widget('d_media', { render() {
  const now = store.data.media_now, rec = store.data.media_recent;
  const servers = now?.servers ?? rec?.servers ?? [];
  const sub = servers.length ? servers.map((s) => s.name).join(' · ') + (now?.mock ? ' · eksempeldata' : '') : 'Plex · Jellyfin';
  const head = `<div class="card-head"><div><div class="card-title">Media</div><div class="card-sub">${esc(sub)}</div></div><div class="media-chips">${servers.map(serverChip).join('')}</div></div>`;
  if (!now && !rec) return head + (errBox('media_now', 'Media') || '<div class="skeleton" style="min-height:160px"></div>');
  if (!(now ?? rec).configured) return head + '<div class="empty">Legg inn Plex eller Jellyfin under Innstillinger → Integrasjoner → Media.</div>';
  const down = servers.filter((s) => s.ok === false).map((s) => `<div class="err">${esc(s.name)}: ${esc(s.error ?? 'utilgjengelig')}</div>`).join('');
  const items = now?.items ?? [];
  const nowHtml = `<div class="section-label">Spilles nå · ${items.length}</div>
    <div class="media-list">${items.map(nowRow).join('') || '<div class="empty">Ingen spiller noe akkurat nå.</div>'}</div>`;
  const recItems = rec?.items ?? [];
  const recHtml = `<div class="section-label">Nylig lagt til</div>${recItems.length ? `<div class="posters">${recItems.map(recentTile).join('')}</div>` : rec ? '<div class="empty">Ingenting nytt.</div>' : '<div class="skeleton" style="min-height:120px"></div>'}`;
  return head + down + nowHtml + recHtml;
} });

on('media_now', () => refresh('d_media'));
on('media_recent', () => refresh('d_media'));

// «Spilles nå» hvert 30. sekund, «Nylig lagt til» hvert 10. minutt (serveren cacher like lenge).
const visible = () => !document.hidden && document.querySelector('[data-w="d_media"]');
load('media_now', '/media/now');
load('media_recent', '/media/recent');
setInterval(() => { if (visible()) load('media_now', '/media/now'); }, 30_000);
setInterval(() => { if (visible()) load('media_recent', '/media/recent'); }, 10 * 60_000);

// Logo som ikke lar seg hente: skjul bildet (CSP tillater ikke inline onerror).
document.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('media-chip')) img.remove(); }, true);

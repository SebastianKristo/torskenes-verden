// Prompt 52 (WEB52F, claude-code-nytt-i-versjon-lesbar.md): «Nytt i versjon» i FinansHub (web og PWA).
// Vises første gang etter en oppdatering (GET /api/whatsnew → show), «Ok» markerer den som sett (POST /api/whatsnew/seen).
// Ugjennomsiktig papirkort med dempet slør bak, fast hode og bunn, bare lista scroller (med fade nederst), ett punkt per blokk
// med overskrift og kort tekst, grå dato (aldri gul/beige), mørk «Ok» med rød fokusring bare ved tastatur. Mobil: bunnark.
// Bruker serverens strukturerte punkter (points: [{title, text, more}]) når de finnes, ellers items (strenger).
// Interne merknader («prompt 51», «(prompt NN)», «runde 2») vises aldri.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

const CSS = `
.wn52f-veil{position:fixed;inset:0;z-index:2147481000;background:rgba(27,26,23,.35);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;animation:wn52fIn .2s ease both}
.wn52f{background:#fbf8f2;color:#1b1a17;border:1px solid #d8d1c2;border-radius:24px;box-shadow:0 24px 60px -20px rgba(27,26,23,.45);width:min(440px,calc(100vw - 32px));max-height:min(640px,calc(100vh - 48px));max-height:min(640px,calc(100dvh - 48px));display:flex;flex-direction:column;overflow:hidden;font-family:Manrope,system-ui,sans-serif;text-align:left}
.wn52f-head{flex:none;padding:22px 24px 14px;border-bottom:1px solid #d8d1c2}
.wn52f-lbl{font:600 10.5px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;color:#b23a2a;text-transform:uppercase}
.wn52f-head h2{margin:6px 0 0;font:500 28px/1.1 Newsreader,Georgia,serif;color:#1b1a17;letter-spacing:0}
.wn52f-date{margin-top:6px;font:500 13px Manrope,system-ui,sans-serif;color:#6b665c}
.wn52f-body{position:relative;flex:1;min-height:0;display:flex}
.wn52f-list{flex:1;overflow-y:auto;overscroll-behavior:contain;margin:0;padding:16px 24px 8px;list-style:none}
.wn52f-list li{padding:0 0 14px;margin:0 0 14px;border-bottom:1px solid #e6dfd2}
.wn52f-list li:last-child{border-bottom:0;margin-bottom:0;padding-bottom:20px}
.wn52f-list h3{margin:0 0 4px;font:700 15px/1.35 Manrope,system-ui,sans-serif;color:#1b1a17}
.wn52f-list p{margin:0;font:400 14px/1.55 Manrope,system-ui,sans-serif;color:#3d3a34}
.wn52f-list p.clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.wn52f-more{margin-top:6px;padding:0;border:0;background:none;color:#b23a2a;font:700 13px Manrope,system-ui,sans-serif;cursor:pointer;min-height:24px}
.wn52f-fade{position:absolute;left:0;right:0;bottom:0;height:28px;background:linear-gradient(rgba(251,248,242,0),#fbf8f2);pointer-events:none}
.wn52f-foot{flex:none;display:flex;justify-content:flex-end;padding:14px 24px 20px;border-top:1px solid #d8d1c2}
.wn52f-ok{height:46px;padding:0 26px;border-radius:23px;border:0;background:#1b1a17;color:#f3efe6;font:700 14.5px Manrope,system-ui,sans-serif;cursor:pointer;outline:none}
.wn52f-ok:focus{outline:none}
.wn52f-ok:focus-visible,.wn52f-more:focus-visible,.wn52f-list:focus-visible{outline:2px solid #b23a2a;outline-offset:3px}
@media (max-width:600px){.wn52f-veil{align-items:flex-end;padding:0}.wn52f{width:100%;max-width:none;border-radius:24px 24px 0 0;border-width:1px 0 0;max-height:85vh;max-height:85dvh;padding-bottom:env(safe-area-inset-bottom)}}
@keyframes wn52fIn{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.wn52f-veil{animation:none}}`;

/** Fjerner interne merknader fra en tekst. */
export const clean52 = (s) => String(s ?? '')
  .replace(/\s*[([]\s*(?:prompt|runde)\s*\d+[a-z]?(?:\s*[,–-]\s*[^)\]]*)?[)\]]/gi, '')
  .replace(/\s*[–—-]?\s*\b(?:prompt|runde)\s*\d+[a-z]?\b\s*[:·–—-]?/gi, ' ')
  .replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();

/** «Overskrift: tekst» / «Overskrift – tekst» / første setning → {title, text}. */
export function point52(x) {
  if (x && typeof x === 'object') return { title: clean52(x.title ?? ''), text: clean52(x.text ?? ''), more: x.more ? clean52(x.more) : '' };
  const s = clean52(String(x ?? '').replace(/^[-*•]\s*/, '').replace(/\*\*/g, ''));
  let m = s.match(/^([^:.!?]{3,60}):\s+(.+)$/s) || s.match(/^(.{3,60}?)\s+[–—]\s+(.+)$/s);
  if (m) return { title: m[1].trim(), text: m[2].trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()), more: '' };
  m = s.match(/^(.{6,70}?[.!?])\s+(.+)$/s);
  if (m) return { title: m[1].replace(/[.]$/, ''), text: m[2], more: '' };
  return { title: s, text: '', more: '' };
}
const dateNo = (w) => {
  if (w.date_label) return w.date_label;
  const d = String(w.date ?? ''), m = d.match(/^(\d{4})-(\d{2})-(\d{2})/), n = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${+m[3]}. ${MN[+m[2] - 1]} ${m[1]}` : n ? `${+n[1]}. ${MN[+n[2] - 1]} ${n[3]}` : '';
};

async function api(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opt, headers: { ...(opt.body ? { 'content-type': 'application/json' } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Feil ${r.status}`);
  return j;
}

export function showWhatsNew52(w, { manual = false } = {}) {
  if (!document.getElementById('wn52f-css')) { const st = document.createElement('style'); st.id = 'wn52f-css'; st.textContent = CSS; document.head.appendChild(st); }
  document.querySelector('.wn52f-veil')?.remove();
  const raw = Array.isArray(w.points) && w.points.length ? w.points : (w.items ?? []);
  const pts = raw.map(point52).filter((x) => x.title || x.text);
  const veil = document.createElement('div');
  veil.className = 'wn52f-veil';
  const date = dateNo(w);
  veil.innerHTML = `<section class="wn52f" role="dialog" aria-modal="true" aria-labelledby="wn52f-t">
    <header class="wn52f-head"><div class="wn52f-lbl">${esc(clean52(w.label || 'Nytt i Homelab'))}</div><h2 id="wn52f-t">${esc(clean52(w.heading || `Versjon ${w.version ?? ''}`))}</h2>${date ? `<div class="wn52f-date">${esc(date)}</div>` : ''}</header>
    <div class="wn52f-body"><ul class="wn52f-list" tabindex="0" aria-label="Endringer">${pts.map((x) => { const long = x.text.length > 220 || x.more; return `<li>${x.title ? `<h3>${esc(x.title)}</h3>` : ''}${x.text ? `<p${long ? ' class="clamp"' : ''}>${esc(x.text)}${x.more ? ` ${esc(x.more)}` : ''}</p>${long ? '<button type="button" class="wn52f-more" aria-expanded="false">Les mer</button>' : ''}` : ''}</li>`; }).join('') || '<li><p>Feilrettinger og forbedringer.</p></li>'}</ul><span class="wn52f-fade" aria-hidden="true"></span></div>
    <footer class="wn52f-foot"><button type="button" class="wn52f-ok">Ok</button></footer></section>`;
  document.body.appendChild(veil);
  const prev = document.activeElement, card = veil.firstElementChild, ok = veil.querySelector('.wn52f-ok');
  const close = () => {
    veil.remove();
    try { prev?.focus?.({ preventScroll: true }); } catch { /* */ }
    if (!manual && w.version) api('/api/whatsnew/seen', { method: 'POST', body: JSON.stringify({ version: w.version }) }).catch(() => {});
  };
  ok.addEventListener('click', close);
  veil.addEventListener('click', (e) => {
    if (e.target === veil) return close();
    const b = e.target.closest('.wn52f-more');
    if (!b) return;
    const p = b.previousElementSibling, open = b.getAttribute('aria-expanded') !== 'true';
    p?.classList.toggle('clamp', !open);
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? 'Vis mindre' : 'Les mer';
  });
  veil.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...card.querySelectorAll('button,[tabindex="0"]')];
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  ok.focus({ preventScroll: true, focusVisible: false }); // ringen kommer først når man bruker tastaturet
}

/** Kalles ved oppstart av FinansHub. Gjør ingenting hvis Homelab-kortet (qa51.js) allerede er lastet på siden. */
export async function checkWhatsNew52() {
  if (window.__hlQa51 || window.__fhWn52) return;
  window.__fhWn52 = true;
  window.fhWhatsNew52 = async () => { try { showWhatsNew52(await api('/api/whatsnew'), { manual: true }); } catch { /* */ } };
  try {
    const w = await api('/api/whatsnew');
    if (w.show) setTimeout(() => { if (!document.querySelector('.wn52f-veil, .wn52-veil, .qa51-card')) showWhatsNew52(w); }, 1200);
  } catch { /* ikke innlogget eller eldre server */ }
}

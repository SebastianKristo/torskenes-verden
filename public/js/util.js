// Felles hjelpefunksjoner for alle sider.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
// Trygg CSS url() for bakgrunnsbilder.
export const cssUrl = (u) => `url("${String(u).replace(/["\\\n]/g, encodeURIComponent)}")`;

export const kr = (v) => Math.round(v).toLocaleString('nb-NO') + ' kr';
export const nb = (v, d = 0) => Number(v).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
export const signed = (v, d = 0) => (v >= 0 ? '+' : '−') + nb(Math.abs(v), d);
export const p2 = (x) => String(x).padStart(2, '0');
export const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
export const isoDay = (d) => d.toLocaleDateString('sv-SE');
// ISO2: integrasjonene er personlige. Uten eget oppsett: kort tekst med lenke til Innstillinger → Integrasjoner.
export const NOT_SET_UP = 'Ikke satt opp · <a href="#" class="set-link" data-act="integrations">Sett opp under Integrasjoner</a>';
export const hm = (d) => d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
/**
 * Logo fra serverens favicon-cache, med forbokstaver bak. Bildet skjules hvis det ikke finnes (CSP stopper inline onerror,
 * så én felles lytter tar seg av det). cls styrer størrelse/form, se .lg i app.css.
 */
export const initials = (n) => (String(n ?? '').match(/[\p{L}\p{N}]/gu) ?? ['•']).slice(0, 2).join('').toUpperCase();
export const logoImg = (domain, name, cls = '') => `<span class="lg ${cls}${domain ? ' has' : ''}">${domain ? `<img data-lg src="/finans/api/logo/${encodeURIComponent(domain)}" alt="" loading="lazy" decoding="async">` : ''}<i>${esc(initials(name))}</i></span>`;
if (typeof document !== 'undefined' && !window.__lgErr) {
  window.__lgErr = true;
  document.addEventListener('error', (e) => { const t = e.target; if (t?.tagName === 'IMG' && t.hasAttribute('data-lg')) { t.parentElement?.classList.remove('has'); t.remove(); } }, true);
}

export const parseNum = (v) => parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0;

export async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers ?? {}) } };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers['Content-Type'] = 'application/json';
    delete init.json;
  }
  const res = await fetch('/api' + path, init);
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/cv')) { location.href = '/login'; throw new Error('Ikke innlogget'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(data?.error || `Feil ${res.status}`), { status: res.status });
  return data;
}

export const isMobile = () => matchMedia('(max-width: 767px)').matches;

// Lager et miniatyrbilde (JPEG) i nettleseren før opplasting.
export async function makeThumb(file, size = 240) {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch { return null; }
}

// Overlegg lukkes bare når trykket både startet og sluttet på bakgrunnen. Ellers lukker f.eks. en nedtrekksliste
// på Android (som slippes utenfor feltet) eller en tekstmarkering som slippes utenfor, hele innstillingene.
let downTarget = null;
addEventListener('pointerdown', (e) => { downTarget = e.target; }, true);
export const backdropClick = (e, el) => e.target === el && downTarget === el;

/* ---------- Prompt 30: felles knapp i toppen av ark og fullskjermvisninger, og lett haptikk ---------- */
const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
/**
 * SheetButton: pille på 36 px (treffflate 44 px). kind: 'pri' (Ferdig), 'sec' (Lukk · Avbryt), 'back' (‹ Tilbake).
 * attrs er ferdige attributter (data-…), label teksten. Stilen ligger i app.css (.sbtn), med tema-tokens.
 */
export const sheetBtn = (label, attrs = '', kind = 'pri') => `<button type="button" class="sbtn ${kind}" ${attrs}>${kind === 'back' ? CHEV : ''}<span>${esc(label)}</span></button>`;
let hapL = null;
/** Lett «tikk»: navigator.vibrate (Android) og en skjult iOS-bryter (Safari 18+ gir systemhaptikk ved klikk). */
export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* ikke støttet */ }
  try {
    if (!/iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) || !('ontouchend' in document)) return;
    if (!hapL) {
      hapL = document.createElement('label'); hapL.setAttribute('aria-hidden', 'true');
      hapL.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const c = document.createElement('input'); c.type = 'checkbox'; c.setAttribute('switch', ''); c.tabIndex = -1; hapL.appendChild(c); document.body.appendChild(hapL);
    }
    hapL.click();
  } catch { /* */ }
}

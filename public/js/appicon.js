// Navn og ikon på appen (Innstillinger → App). Felles for Homelab web, innloggingen og PWA-en:
// navnet (settings.app_name via /api/app) vises i logoen i Vindu og papir og i nettleserfanen, og ikonet
// tegnes som SVG og settes som favicon og apple-touch-icon.
export const ICONS = [['hus', 'Huset med stativ'], ['monogram', 'Papir-monogram'], ['rom', 'Fire rom']];
const app = { name: 'Homelab', icon: 'hus' };
export const appName = () => app.name || 'Homelab';
export const appIcon = () => app.icon || 'hus';

const escX = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** SVG-kilde for et ikon (1024×1024). Monogrammet bruker første bokstav i appnavnet. */
export function iconSvg(kind = appIcon(), name = appName()) {
  const wrap = (bg, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${bg}"/>${body}</svg>`;
  if (kind === 'monogram') {
    const ch = escX((String(name).trim().match(/\p{L}|\p{N}/u)?.[0] ?? 'H').toUpperCase());
    return wrap('#b23a2a', `<path d="M1024 760 760 1024H1024z" fill="#8e2b1e"/><text x="500" y="690" text-anchor="middle" font-family="Newsreader,Georgia,serif" font-size="560" font-weight="500" fill="#f3efe6">${ch}</text><circle cx="742" cy="350" r="34" fill="#f3efe6"/>`);
  }
  if (kind === 'rom') {
    return wrap('#1b1a17', '<path d="M512 196 820 452V828H204V452z" fill="#f3efe6"/><rect x="276" y="500" width="216" height="140" rx="18" fill="#b23a2a"/><rect x="532" y="500" width="216" height="140" rx="18" fill="#1b1a17"/><rect x="276" y="672" width="216" height="104" rx="18" fill="#1b1a17"/><rect x="532" y="672" width="216" height="104" rx="18" fill="#1b1a17"/>');
  }
  return wrap('#f3efe6', '<path d="M232 470 512 236 792 470" fill="none" stroke="#1b1a17" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/><rect x="312" y="480" width="400" height="300" rx="28" fill="#1b1a17"/><rect x="352" y="526" width="320" height="56" rx="12" fill="#f3efe6"/><rect x="352" y="604" width="320" height="56" rx="12" fill="#f3efe6"/><rect x="352" y="682" width="320" height="56" rx="12" fill="#f3efe6"/><circle cx="628" cy="554" r="14" fill="#b23a2a"/>');
}

const dataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function setLink(rel, href, type) {
  let l = document.querySelector(`link[rel="${rel}"]`);
  if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); }
  l.href = href;
  if (type) l.type = type; else l.removeAttribute('type');
}

// apple-touch-icon må være PNG: SVG-en tegnes på et lerret (180×180).
function touchPng(svg) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 180;
        c.getContext('2d').drawImage(img, 0, 0, 180, 180);
        res(c.toDataURL('image/png'));
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = dataUrl(svg);
  });
}

/** Setter navn og ikon i siden (favicon, apple-touch-icon og tittelens etternavn). */
export async function applyAppIdentity(v = {}) {
  if (v.name !== undefined) app.name = String(v.name || '').trim() || 'Homelab';
  if (v.icon !== undefined) app.icon = ICONS.some(([k]) => k === v.icon) ? v.icon : 'hus';
  const svg = iconSvg();
  setLink('icon', dataUrl(svg), 'image/svg+xml');
  const png = await touchPng(svg);
  if (png) setLink('apple-touch-icon', png);
  document.dispatchEvent(new CustomEvent('hl:app', { detail: { ...app } }));
}

/** Henter navn og ikon fra serveren. Eldre servere uten /api/app beholder «Homelab» og standardikonet. */
export async function loadAppIdentity() {
  try {
    const r = await fetch('/api/app', { credentials: 'same-origin' });
    if (r.ok) { const j = await r.json(); await applyAppIdentity({ name: j.name, icon: j.icon }); return { ...app }; }
  } catch { /* eldre server */ }
  return { ...app };
}

/** Lagrer navn og/eller ikon (bare administratorer). */
export async function saveAppIdentity(patch) {
  const r = await fetch('/api/app', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || (r.status === 404 ? 'Serveren støtter ikke appnavn ennå. Oppdater Homelab.' : `Serveren svarte ${r.status}`));
  await applyAppIdentity({ name: j.name ?? patch.name, icon: j.icon ?? patch.icon });
  return { ...app };
}

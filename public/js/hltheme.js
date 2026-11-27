// Homelab-tema: «Nåværende» (cur) eller «Vindu og papir» (2c). Valget lagres per bruker i /api/me/layout.hlTheme,
// med localStorage som reserve (og for innloggingssiden, som ikke vet hvem brukeren er). Bare det visuelle byttes.
import { appName } from './appicon.js';
import { api, esc } from './util.js';
import { store } from './store.js';
import { tittel } from './moduler.js'; // Fase 6: sidetitlene fra modullisten
import { BG_TYPES, FALLBACK_GRAD, bgState, setBgFromLayout, saveBg, resolveBg, cachedBg, forgetBg, creditOf, particles, gphotoAlbum, loadGphoto } from './bgsvc.js';

const KEY = 'hl_theme';
const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
export const THEMES = [['cur', 'Nåværende', 'Mørkt glass over bakgrunnsbildet.'], ['2c', 'Vindu og papir', 'Bildet som et bredt vindu øverst, resten på lyst papir i avisspalter.']];

const local = () => { try { return localStorage.getItem(KEY) === '2c' ? '2c' : 'cur'; } catch { return 'cur'; } };
const remember = (t) => { try { localStorage.setItem(KEY, t); } catch { /* privat modus */ } };
let theme = document.documentElement.dataset.hl === '2c' ? '2c' : local();

export const hlTheme = () => theme;
export const is2c = () => theme === '2c';

export function applyHlTheme() {
  const root = document.documentElement;
  root.dataset.hl = theme;
  root.dataset.hlTheme = theme; // news.js bruker papirpaletten når denne er «2c»
  if (theme === '2c' && !document.querySelector('link[data-hl-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONTS; l.dataset.hlFonts = '';
    document.head.appendChild(l);
  }
  if (!root.dataset.kalApp) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === '2c' ? '#f3efe6' : '#07080b');
  // Logoen er «OS» i dagens tema og navnet på serveren (Homelab) i Vindu og papir.
  const logo = document.querySelector('header.top .logo');
  if (logo) {
    logo.dataset.os ??= logo.textContent;
    logo.textContent = theme === '2c' ? (appName() !== 'Homelab' ? appName() : store.me?.serverName || 'Homelab') : logo.dataset.os;
  }
  // Profilmenyen (prompt 30: profile-menu.js) tegnes på nytt med riktig «Bytt til …»-tekst.
  document.dispatchEvent(new Event('hl:menu'));
  renderBgMenu();
}

/** Henter valget fra serveren. Tåler at serveren ikke kjenner feltet ennå (da gjelder localStorage). */
export async function loadHlTheme() {
  const l = await api('/me/layout').catch(() => null);
  // Prompt 38: Kalender.app for Mac (html[data-kal-app]) bruker alltid papirtemaet (lyst/mørkt fra systemet).
  if (l && !document.documentElement.dataset.kalApp && (l.hlTheme === '2c' || l.hlTheme === 'cur') && l.hlTheme !== theme) { theme = l.hlTheme; remember(theme); }
  if (l) setBgFromLayout(l);
  applyHlTheme();
  return theme;
}

export async function setHlTheme(t) {
  theme = t === '2c' ? '2c' : 'cur';
  remember(theme);
  applyHlTheme();
  document.dispatchEvent(new Event('hl:theme'));
  await api('/me/layout', { method: 'PUT', json: { hlTheme: theme } }).catch(() => {});
}

/** Velgeren som finnes i begge temaene: to små kort med forhåndsvisning. */
export const themeCards = () => `<div class="hl-themes">${THEMES.map(([k, n, s]) => `<button type="button" class="hl-theme-opt" data-hl-theme="${k}" aria-pressed="${theme === k}">
  <span class="hl-theme-prev ${k}"><i></i><i></i><i></i></span><b>${esc(n)}</b><span>${esc(s)}</span></button>`).join('')}</div>`;

/* ---------- Fotovinduet ---------- */
// Bildet øverst på alle sider i Vindu og papir. Valget deles med mobilappene og den klassiske bakgrunnen (bgsvc.js):
// GET /api/background gir bildet (lastet ned og cachet på serveren), kreditering og theme_hint. Feiler et bilde,
// prøves neste i settet; feiler alle, vises gradienten med en liten melding.
let bgOpen = false;

export const photoKind = () => bgState().type;
const photoName = (k) => BG_TYPES.find((x) => x[0] === k)?.[1] ?? 'Bakgrunn';

/** Laget med bildet; tegnes i fotovinduet og fylles når bildet er lastet. */
export const pwImg = () => `<div class="pw-img" aria-hidden="true"></div>`;

export function pwCredit() {
  const t = bgState().type;
  return t === 'none' ? '' : creditOf(cachedBg(t)).text;
}

/** Fyller alle fotovinduer på siden med valgt bilde (eller gradienten), med theme_hint og partikler. */
export async function paintPhoto(force) {
  if (!is2c()) return;
  const t = bgState().type;
  const e = await resolveBg(t, force);
  const grad = e.r?.gradient || FALLBACK_GRAD;
  const light = e.url && e.r?.theme_hint === 'light';
  // Prompt 52: forrige bilde står til det nye er lastet (ingen blink), og «Vær nå» tones etter tid på døgnet.
  const bgv = e.url ? `url("${e.url.replace(/"/g, '%22')}")` : grad;
  const apply = () => document.querySelectorAll('.pw-img').forEach((el) => { el.style.backgroundImage = bgv; el.classList.add('on'); });
  if (e.url && [...document.querySelectorAll('.pw-img')].some((el) => el.style.backgroundImage && el.style.backgroundImage !== bgv)) { const im = new Image(); im.onload = im.onerror = apply; im.src = e.url; } else apply();
  const hr = new Date().getHours(), tod = hr >= 5 && hr < 9 ? 'morgen' : hr >= 9 && hr < 17 ? 'dag' : hr >= 17 && hr < 21 ? 'kveld' : 'natt';
  document.querySelectorAll('.pw').forEach((el) => { if (t === 'weather') el.dataset.wx52 = tod; else delete el.dataset.wx52; });
  // Prompt 27: «Planeter» vises som hele kloden (~62 % bredde) sentrert på svart på Dashboard, ikke beskåret med cover.
  document.querySelectorAll('.pw').forEach((el) => { el.classList.toggle('pw-light', !!light); el.classList.toggle('pw-planet', t === 'planets' && !!e.url); particles(el, e.url || t === 'weather' ? e.r?.particles ?? null : null); });
  const cr = creditOf(e);
  document.querySelectorAll('.pw-credit').forEach((el) => {
    el.innerHTML = cr.url ? `<a href="${esc(cr.url)}" target="_blank" rel="noopener noreferrer">${esc(cr.text)}</a>` : esc(cr.text);
  });
  document.querySelectorAll('.pw-fail').forEach((el) => { el.hidden = !e.failed; });
  renderBgMenu();
}

/** Bakgrunnsvelgeren i topplinjen (prompt 57, claude-code-bakgrunnsvelger.md): vokser ut fra knappen og står rett under den med en
 *  pil mot knappen. 2×2-rutenett med store forhåndsvisninger (Vær nå, Planeter, Oslo, Gradient), valgt bakgrunn med dobbel ring og
 *  grønt ✓ (rødt ! når bildet ikke lastet), så Eget bilde og Google Photos-album. Samme velger på mobil og desktop. */
const GRID = ['weather', 'planets', 'oslo', 'none'];
const cssUrl = (u) => `url('${u.replace(/['"()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))}')`;
export function renderBgMenu() {
  const host = document.getElementById('hl-bgdd');
  if (!host) return;
  if (!is2c()) { host.innerHTML = ''; host.__html87 = ''; return; }
  const cur = bgState().type;
  const custom = store.me?.layout?.photoCustom || cachedBg('custom')?.url || cur === 'custom';
  // Prompt 46: Google Photos-album kan velges når et album er lagt til; ellers åpner raden lenkeskjemaet i Innstillinger.
  const gp = gphotoAlbum()?.configured || cur === 'gphoto';
  if (!gphotoAlbum()) loadGphoto().then(() => { if (bgOpen) renderBgMenu(); });
  const info = Object.fromEntries(BG_TYPES.map(([k, n, s]) => [k, { n, s }]));
  const thumb = (k) => { const e = cachedBg(k); return k !== 'none' && e?.url ? cssUrl(e.url) : FALLBACK_GRAD; };
  const fail = (k) => k !== 'none' && !!cachedBg(k)?.failed;
  const mark = (k) => `<span class="hl-bgdd-ck${fail(k) ? ' bad' : ''}" aria-hidden="true">${cur === k ? '✓' : fail(k) ? '!' : ''}</span>`;
  const tile = (k) => `<button type="button" role="menuitemradio" aria-checked="${cur === k}" data-photo="${k}"><span class="hl-bgdd-th" style="background-image:${thumb(k)}">${mark(k)}</span><span class="hl-bgdd-n">${esc(info[k].n)}</span><small>${esc(fail(k) ? 'Fikk ikke lastet bildet' : info[k].s)}</small></button>`;
  const row = (k, attrs, sub, own) => `<${own ? 'label' : 'button type="button"'} class="hl-bgdd-row" ${attrs}><span class="hl-bgdd-th${own === 'plus' ? ' plus' : ''}"${own === 'plus' ? '' : ` style="background-image:${thumb(k)}"`}>${own === 'plus' ? '+' : mark(k)}</span><span class="hl-bgdd-tx"><span class="hl-bgdd-n">${esc(info[k].n)}</span><small>${esc(sub)}</small></span>${own === 'plus' && k === 'custom' ? '<input type="file" accept="image/*" hidden data-photo-up>' : ''}</${own ? 'label' : 'button'}>`;
  const ownRow = custom
    ? `<div class="hl-bgdd-pair">${row('custom', `role="menuitemradio" aria-checked="${cur === 'custom'}" data-photo="custom"`, cur === 'custom' ? 'Valgt' : 'Ditt opplastede bilde')}<label class="hl-bgdd-swap">Bytt<input type="file" accept="image/*" hidden data-photo-up></label></div>`
    : row('custom', 'role="menuitem"', 'Last opp fra Bilder eller Filer', 'plus');
  const gpRow = gp
    ? row('gphoto', `role="menuitemradio" aria-checked="${cur === 'gphoto'}" data-photo="gphoto"`, info.gphoto.s)
    : `<a class="hl-bgdd-row" role="menuitem" href="#/innstillinger/look/bg" data-bg-more><span class="hl-bgdd-th plus" aria-hidden="true">+</span><span class="hl-bgdd-tx"><span class="hl-bgdd-n">${esc(info.gphoto.n)}</span><small>Legg til en delt album-lenke</small></span></a>`;
  const html87 = `<button type="button" class="hl-bgdd-btn" data-bgdd aria-haspopup="menu" aria-expanded="false">${esc(photoName(cur))} ▾</button>
    <div class="hl-bgdd-menu" role="menu" aria-label="Bakgrunn"><div class="hl-bgdd-h"><span>BAKGRUNN</span><small>Oppdateres automatisk</small></div>
      <div class="hl-bgdd-grid">${GRID.map(tile).join('')}</div><i class="hl-bgdd-sep" aria-hidden="true"></i>${ownRow}${gpRow}
      <a class="hl-bgdd-more" href="#/innstillinger/look/bg" data-bg-more>Flere valg …</a></div>`;
  // Prompt 87: paintPhoto() kalles ved hvert fanebytte; menyen i topplinjen tegnes bare på nytt når noe faktisk er endret.
  if (host.__html87 !== html87) {
    const wasOpen = !!host.querySelector('.hl-bgdd-menu.open');
    host.innerHTML = html87; host.__html87 = html87;
    // Nye miniatyrer mens menyen er åpen: den nye menyen står åpen med en gang (ingen ny animasjon).
    if (wasOpen && bgOpen) host.querySelector('.hl-bgdd-menu')?.classList.add('open');
  }
  placeBgMenu(host);
  // Miniatyrene lastes i bakgrunnen første gang menyen åpnes.
  if (bgOpen) for (const k of [...GRID, ...(custom ? ['custom'] : []), ...(gp ? ['gphoto'] : [])]) if (k !== 'none' && !cachedBg(k)) resolveBg(k).then(() => bgOpen && renderBgMenu());
}
/** Åpner og lukker med animasjon (klassen byttes på samme element), og plasserer menyen rett under knappen innenfor skjermen. */
function placeBgMenu(host) {
  const btn = host.querySelector('[data-bgdd]'), menu = host.querySelector('.hl-bgdd-menu');
  if (!btn || !menu) return;
  btn.setAttribute('aria-expanded', String(bgOpen));
  if (bgOpen) {
    const b = btn.getBoundingClientRect(), h = host.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    const w = Math.min(320, vw - 32), mid = b.left + b.width / 2;
    const left = Math.max(16, Math.min(vw - 16 - w, mid - w / 2));
    menu.style.width = `${w}px`;
    menu.style.left = `${Math.round(left - h.left)}px`; menu.style.right = 'auto'; // lukket står den med right:0 (CSS), så den aldri gir sidelengs rulling
    menu.style.top = `${Math.round(b.bottom - h.top + 12)}px`;
    menu.style.setProperty('--bgdd-arrow', `${Math.round(mid - left)}px`);
    if (!menu.classList.contains('open')) { void menu.offsetWidth; menu.classList.add('open'); }
  } else menu.classList.remove('open');
}

export async function pickPhoto(k) {
  bgOpen = false;
  await saveBg({ type: k });
  paintPhoto();
}

/** Laster opp eget bilde og velger det. Brukes av menyen og av Innstillinger → Utseende → Bakgrunn. */
export async function uploadCustomPhoto(file) {
  const fd = new FormData();
  fd.append('file', file);
  await api('/me/photo-window', { method: 'POST', body: fd });
  forgetBg('custom');
  (store.me.layout ??= {}).photoCustom = true;
  await pickPhoto('custom');
}

/** Kobler bakgrunnsvelgeren og «trykk for å prøve igjen». Kalles én gang. */
export function bindPhoto() {
  document.addEventListener('click', (e) => {
    const host = document.getElementById('hl-bgdd');
    if (e.target.closest('[data-bgdd]')) { bgOpen = !bgOpen; document.getElementById('menu')?.setAttribute('hidden', ''); renderBgMenu(); return; }
    if (e.target.closest('[data-bg-more]')) { e.preventDefault(); bgOpen = false; renderBgMenu(); document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'look/bg' })); return; }
    const p = e.target.closest('[data-photo]');
    if (p) { pickPhoto(p.dataset.photo); return; }
    if (e.target.closest('.pw-fail')) { forgetBg(bgState().type); paintPhoto(true); return; }
    if (bgOpen && host && !host.contains(e.target)) { bgOpen = false; renderBgMenu(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bgOpen) { bgOpen = false; renderBgMenu(); document.querySelector('[data-bgdd]')?.focus(); } });
  addEventListener('resize', () => { if (bgOpen) renderBgMenu(); }); // prompt 57: menyen står under knappen også etter rotasjon
  document.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-photo-up]');
    if (!inp?.files?.[0]) return;
    try { await uploadCustomPhoto(inp.files[0]); } catch (err) { console.warn('[fotovindu] opplasting feilet', err); alert('Kunne ikke laste opp bildet: ' + err.message); }
  });
  document.addEventListener('hl:bg', () => paintPhoto());
  // Vær og planeter («hver time») bytter bilde av seg selv.
  setInterval(() => { if (!document.hidden) paintPhoto(); }, 10 * 60_000);
}

/* ---------- Toppen av hver side ---------- */
// Dashboardet har et høyt vindu med hilsen og vær; de andre sidene et lavt (240 px) med kicker og sidetittel.
const weekNo = (d = new Date()) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
// Fotovinduet: [linjen over tittelen, reservetittel]. Tittelen kommer fra modullisten (moduler.js tittel), så den er lik menyen.
const HEAD = {
  chat: () => ['Ollama lokalt · Gemini · Groq', 'Chat'],
  studie: () => [`Uke ${weekNo()}`, 'Studie'],
  rom: () => ['NASA · dagens rombilde', 'Satellitt og teleskop'],
  hjem: () => ['Home Assistant', 'Smarthjem'],
  matplan: () => [`Uke ${weekNo()}`, 'Mat'],
  sporing: () => ['Pakker og sendinger', 'Sporing'],
  familie: () => ['Posisjon, soner og helse', 'Familie'],
  kart: () => ['Reise · holdeplasser · sanntid · soner', 'Kart'], // prompt 46; Fase 6 (Q8): kartet er en fane i Reise
  reise: () => ['Avganger og kart', 'Reise'], // Fase 6 (Q8)
  gjoremal: () => ['To-do for hele familien', 'Gjøremål'], // prompt 85: #/gjoremal manglet fotovinduet på mobil, så toppmenyen lå oppå listen
  bursdager: () => ['Kalender · familie og venner', 'Bursdager'], // Fase 6 (Q5): en visning i Kalender
  kalender: () => [`Skole · ${new Date().getMonth() >= 6 ? 'høst' : 'vår'} ${new Date().getFullYear()}`, 'Kalender'],
  domener: () => ['Trafikk, oppetid og sikkerhet', 'Domener'],
  nettverk: () => ['Nettverk og lenker', 'Nettverk'],
  mer: () => ['Alle sider', 'Mer'],
  familiekalender: () => ['Kalender · hvem kjører? · henting og bringing', 'Familie'], // prompt 51 (MEDFAM51); Fase 6 (Q5): filteret Familie i Kalender
  mediakveld: () => ['Eget bibliotek · hvem er hjemme', 'I kveld'], // prompt 51 (MEDFAM51)
  skjold: () => ['Deler · skuffer · skap', 'Skjold Lab'], // prompt 76 (SKJWEB)
};

/** Det lave fotovinduet øverst på alle sider unntatt Dashboard. */
export function pwHeader(route) {
  const h = HEAD[route]?.();
  if (!h) return '';
  const title = route === 'mer' ? h[1] : tittel(location.hash) ?? h[1];
  return `<section class="pw pw-low">${pwImg()}<div class="pw-bottom"><div><div class="pw-kick">${esc(h[0])}</div><div class="pw-title">${esc(title)}</div></div></div>
    <button type="button" class="pw-fail" hidden>Fikk ikke lastet bildet · trykk for å prøve igjen</button></section>`;
}

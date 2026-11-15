// Prompt 46 (WEB46): nye sider i Innstillinger.
// - Nyheter (claude-code-nyheter-innstillinger-flytt.md): alt som lå i tannhjulet i nyhetsleseren – AI-sammendrag, sammendrag
//   per kategori, AI-kategorisering, KATEGORIER (For deg + egne), ikoner på fanene og ADRESSER (favicon + kategori som
//   nedtrekksmeny). Samme lagring som før (/api/rss …), tegnet av news.js (mountNewsSettings). «⋯ → Nyhetsinnstillinger»
//   i leseren åpner siden direkte; lukkes Innstillinger, åpnes leseren igjen på samme kategori.
import { TAB_IC } from './settings-search.js';
import { gphotoAlbum, loadGphoto, setGphoto, clearGphoto, saveBg } from './bgsvc.js';

const P46 = { nyheter: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3' };
Object.assign(TAB_IC, { nyheter: ['#b23a2a', P46.nyheter] });
/** [id, navn, undertekst, seksjon, ikon] – settes inn i TABS i settings.js. */
export const TABS46 = [['nyheter', 'Nyheter', 'Kilder, kategorier, For deg, ikoner og Glimt-sammendrag.', 'Moduler', P46.nyheter]];
export const ALIAS46 = { news: 'nyheter', rss: 'nyheter', nyhetsleser: 'nyheter', nyhetsinnstillinger: 'nyheter', kilder: 'nyheter' };

/** Innstillinger → Nyheter. Innholdet monteres av news.js og beholdes mellom omtegninger. */
export function nyheterView46(H) {
  const { group, row } = H;
  return {
    html: '<div class="nw46-host" data-mount-host></div>',
    mount: (slot) => { import('./news.js').then((m) => m.mountNewsSettings(slot)).catch((e) => { slot.innerHTML = `<div class="err">Fikk ikke lastet nyhetsinnstillingene: ${String(e.message ?? e).replace(/</g, '&lt;')}</div>`; }); },
    search: [group('Nyheter', [
      row({ t: 'AI-sammendrag', s: 'Kort ingress over de viktigste sakene', go: 'nyheter', btn: 'Åpne', k: 'nyheter sammendrag glimt ai ingress' }),
      row({ t: 'Sammendrag per kategori', s: 'Eget Glimt-sammendrag øverst i hver kategori', go: 'nyheter', btn: 'Åpne', k: 'nyheter sammendrag kategori glimt' }),
      row({ t: 'Kategorier og For deg', s: 'Egne kategorier med nøkkelord og interesser', go: 'nyheter', btn: 'Åpne', k: 'nyheter kategori for deg interesser personlig' }),
      row({ t: 'Ikoner på fanene', s: 'Velg ikon per kategori', go: 'nyheter', btn: 'Åpne', k: 'nyheter ikon fane iconify' }),
      row({ t: 'Nyhetskilder (adresser)', s: 'RSS og Atom, kategori per kilde, favicon', go: 'nyheter', btn: 'Åpne', k: 'nyheter rss atom kilde adresse feed favicon nrk vg' }),
    ])],
  };
}

let bound = false;
export function initSettings46() {
  if (bound) return; bound = true;
  bindGphoto46();
  // Tilbake til nyhetsleseren når Innstillinger lukkes etter «Nyhetsinnstillinger».
  const m = document.getElementById('settings');
  if (!m || !window.MutationObserver) return;
  new MutationObserver(() => {
    if (!m.hidden || !window.__nw46Back) return;
    const back = window.__nw46Back; window.__nw46Back = null;
    import('./news.js').then((n) => n.openNews({ cat: back.cat })).catch(() => {});
  }).observe(m, { attributes: true, attributeFilter: ['hidden'] });
}

/* ---------------- Google Photos-album som bakgrunn (Innstillinger → Utseende → Bakgrunn) ---------------- */
const GP = { busy: false, msg: '', err: '', v: '' };
const VALID_GP = /^https:\/\/(photos\.app\.goo\.gl\/[A-Za-z0-9_-]{4,}|photos\.google\.com\/(u\/\d\/)?share\/[A-Za-z0-9_-]{10,})/;
const escH = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rerender = () => document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'look/bg' }));
/** Boksen under bakgrunnskortene. Albumet lagres på serveren per bruker (synkes til appene). */
export function gphotoBox46() {
  const a = gphotoAlbum();
  if (!a) loadGphoto().then(() => { if (!document.getElementById('settings')?.hidden) rerender(); });
  const status = GP.busy ? 'Henter bilder fra albumet …' : GP.err || (a?.configured ? (a.error ? 'Fikk ikke hentet albumet · trykk for å prøve igjen' : a.rowText ?? `${a.count ?? 0} bilder · bytter bilde hver time`) : 'Lim inn en delt album-lenke (photos.app.goo.gl/… eller photos.google.com/share/…).');
  return `<section class="sg"><h3 class="sg-t">Google Photos-album</h3><div class="sg-box">
    <form class="sg-row gp46" data-gp46-form><span class="sg-txt"><b>Delt album</b><span class="${GP.err ? 'gp46-err' : ''}">${escH(status)}</span></span>
      <span class="gp46-in"><input name="gp46url" type="url" inputmode="url" value="${escH(GP.v || a?.url || '')}" placeholder="https://photos.app.goo.gl/…" autocomplete="off" aria-label="Lenke til delt Google Photos-album" data-glimt="off">
      <button type="submit" class="sbtn pri"${GP.busy ? ' disabled' : ''}>${a?.configured ? 'Bruk album' : 'Bruk album'}</button>${a?.configured ? '<button type="button" class="sbtn" data-gp46-del>Fjern</button>' : ''}${a?.configured && a.error ? '<button type="button" class="sbtn" data-gp46-retry>Prøv igjen</button>' : ''}</span></form>
  </div><div class="sg-note">Bildene hentes av serveren fra den offentlige delingslenken og caches lokalt (maks 200). Nytt bilde hver time, likt på alle enheter.</div></section>`;
}
let gpBound = false;
export function bindGphoto46() {
  if (gpBound) return; gpBound = true;
  document.addEventListener('input', (e) => { if (e.target.name === 'gp46url') { GP.v = e.target.value; GP.err = ''; } });
  document.addEventListener('submit', async (e) => {
    if (!e.target.matches?.('[data-gp46-form]')) return;
    e.preventDefault();
    const url = String(GP.v || e.target.querySelector('[name=gp46url]')?.value || '').trim();
    if (!VALID_GP.test(url)) { GP.err = 'Må være en delt album-lenke fra Google Photos'; return rerender(); }
    GP.busy = true; GP.err = ''; rerender();
    try { await setGphoto(url); GP.v = ''; GP.busy = false; await saveBg({ type: 'gphoto' }); }
    catch (er) { GP.busy = false; GP.err = er.message || 'Fikk ikke hentet albumet'; }
    rerender();
  });
  document.addEventListener('click', async (e) => {
    if (e.target.closest?.('[data-gp46-del]')) { e.preventDefault(); await clearGphoto(); GP.v = ''; rerender(); return; }
    if (e.target.closest?.('[data-gp46-retry]')) { e.preventDefault(); GP.busy = true; rerender(); await fetch('/api/bg/gphoto/refresh', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); await loadGphoto(true); GP.busy = false; rerender(); return; }
    // Kortet «Google Photos-album» uten album: gå til feltet i stedet for å velge en tom bakgrunn.
    const card = e.target.closest?.('#settings [data-bgtype="gphoto"]');
    if (card && !gphotoAlbum()?.configured) { e.preventDefault(); e.stopImmediatePropagation(); const i = document.querySelector('[name=gp46url]'); i?.scrollIntoView({ block: 'center' }); i?.focus(); }
  }, true);
}

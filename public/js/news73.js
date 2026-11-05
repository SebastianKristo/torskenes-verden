// Prompt 73 (NEWS73): Nyheter – lagre artikler offline (claude-code-nyheter-lagre-artikkel.md, fasit «Lagre og logo.dc.html» 1c/1e).
// Brukes av nyhetsleseren (news.js): fanen «Lagret» (rutenett, søk i lagrede artikler, fjern), bokmerke ved hover på artikkelkort
// og i artikkelvisningen, og egen leservisning med «Åpne original». Data: /api/news/saved (per bruker, synkes med mobil).
// Artikkelteksten kommer sanert fra serveren og saneres én gang til her (hvitliste via <template>, aldri rå innerHTML).
import { api, esc } from './util.js';

const CSS_ID = 'news73-css';
const ensureCss = () => {
  if (document.getElementById(CSS_ID)) return;
  document.head.append(Object.assign(document.createElement('link'), { id: CSS_ID, rel: 'stylesheet', href: '/assets/css/news73.css' }));
};
const MON = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const dayMon = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getDate()}. ${MON[d.getMonth()]}`; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const nb = (n) => Number(n || 0).toLocaleString('nb-NO');
const BM = (fill) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>`;
export const TAB_ICON73 = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>';
export const TAB73 = { id: 'lagret', name: 'Lagret', saved73: true };
const COLOR = { ok: '#3d7a4f', summary: '#a86a12', error: '#a86a12', pending: '#8f897c' };

const S = { items: null, err: '', q: '', hits: null, open: null, toast: '', toastT: 0, polls: 0, pollT: 0, seq: 0 };
const docs = new Map(); // id → hele artikkelen

/* ---------- Sanering (andre lag, i nettleseren) ---------- */
const OK_TAGS = new Set(['P', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'FIGURE', 'FIGCAPTION', 'IMG', 'A', 'STRONG', 'B', 'EM', 'I', 'BR', 'HR', 'SPAN', 'SUB', 'SUP']);
const okSrc = (v) => /^\/api\/news\/saved\/[\w-]+\/img\/\d+$/.test(v) || /^data:image\/(jpeg|png|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(v);
const okHref = (v) => /^(https?:|mailto:|#|\/(?!\/))/i.test(String(v).trim()) && !/^\s*(javascript|vbscript|data):/i.test(String(v).replace(/[\u0000- ]/g, ''));
export function clean73(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html ?? ''); // <template> kjører ingenting (inert dokument)
  const walk = (node) => {
    for (const el of [...node.children]) {
      if (!OK_TAGS.has(el.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT|FORM|INPUT|BUTTON|TEXTAREA|SELECT|LINK|META|BASE|VIDEO|AUDIO|CANVAS)$/i.test(el.tagName)) { el.remove(); continue; } walk(el); el.replaceWith(...el.childNodes); continue; }
      const keep = {};
      if (el.tagName === 'A' && okHref(el.getAttribute('href') ?? '')) keep.href = el.getAttribute('href');
      if (el.tagName === 'IMG') { const s = el.getAttribute('src') ?? ''; if (!okSrc(s)) { el.remove(); continue; } keep.src = s; keep.alt = el.getAttribute('alt') ?? ''; }
      for (const a of [...el.attributes]) el.removeAttribute(a.name);
      for (const [k, v] of Object.entries(keep)) el.setAttribute(k, v);
      if (el.tagName === 'A' && keep.href) { el.target = '_blank'; el.rel = 'noopener noreferrer nofollow'; }
      if (el.tagName === 'IMG') el.loading = 'lazy';
      walk(el);
    }
  };
  walk(t.content);
  const d = document.createElement('div');
  d.append(t.content);
  return d.innerHTML;
}

/* ---------- Data ---------- */
let rerender = () => {};
export const bind73 = (fn) => { rerender = fn; ensureCss(); };
const flash = (text) => { S.toast = text; clearTimeout(S.toastT); rerender(); S.toastT = setTimeout(() => { S.toast = ''; rerender(); }, 2600); };
function poll() {
  clearTimeout(S.pollT);
  if (!S.items?.some((x) => x.status === 'pending') || S.polls > 40) return;
  S.polls++;
  S.pollT = setTimeout(() => load73(true), 2500);
}
export async function load73(quiet = false) {
  if (!quiet) S.polls = 0;
  try {
    const r = await api('/news/saved');
    S.items = Array.isArray(r?.items) ? r.items : [];
    S.err = '';
    for (const x of S.items) { const d = docs.get(x.id); if (d && (d.status !== x.status || d.updatedAt !== x.updatedAt)) docs.delete(x.id); }
  } catch (e) { S.err = e.message || 'Fikk ikke hentet lagrede artikler'; S.items ??= []; }
  rerender();
  if (S.open && !docs.has(S.open.id)) openSaved73(S.open.id, true);
  poll();
}
export const count73 = () => S.items?.length ?? 0;
export const byUrl73 = (url) => S.items?.find((x) => x.url === url) ?? null;
export const isOpen73 = () => !!S.open;
export const closeSaved73 = () => { S.open = null; rerender(); };

export async function save73(x) {
  if (!x?.url) return;
  if (byUrl73(x.url)) return;
  const tmp = { id: `tmp-${Date.now()}`, url: x.url, title: x.title ?? '', source: x.feed ?? x.source ?? host(x.url), image: x.image ?? null, status: 'pending', statusText: 'Laster ned…', savedAt: new Date().toISOString() };
  S.items = [tmp, ...(S.items ?? [])];
  flash('Lagret · lastes ned for lesing uten nett');
  try {
    await api('/news/saved', { method: 'POST', json: { url: x.url, title: x.title, lead: x.excerpt ?? x.summary ?? '', description: x.excerpt ?? '', image: x.image ?? null, source: x.feed ?? x.source ?? '', published: x.published ?? null } });
  } catch (e) { S.items = S.items.filter((y) => y !== tmp); flash(e.message || 'Fikk ikke lagret artikkelen'); return; }
  await load73();
}
export async function remove73(id) {
  const it = S.items?.find((x) => x.id === id);
  if (!it) return;
  S.items = S.items.filter((x) => x.id !== id);
  docs.delete(id);
  if (S.open?.id === id) S.open = null;
  flash('Fjernet fra Lagret');
  try { await api(`/news/saved/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) { flash(e.message || 'Fikk ikke fjernet artikkelen'); await load73(); } }
}
export async function toggle73(x) { const it = byUrl73(x.url); if (it) return remove73(it.id); return save73(x); }
async function retry73(id) {
  const it = S.items?.find((x) => x.id === id);
  if (it) { it.status = 'pending'; it.statusText = 'Laster ned…'; }
  docs.delete(id);
  rerender();
  try { await api(`/news/saved/${encodeURIComponent(id)}/retry`, { method: 'POST', json: {} }); } catch (e) { flash(e.message || 'Fikk ikke prøvd på nytt'); }
  await load73();
}
export async function openSaved73(id, keep = false) {
  const o = { id, busy: !docs.has(id), err: '' };
  if (!keep || S.open?.id !== id) S.open = o; else Object.assign(S.open, o);
  rerender();
  document.querySelector('.nw73-rd-b')?.scrollTo?.(0, 0);
  if (docs.has(id)) return;
  try { const d = await api(`/news/saved/${encodeURIComponent(id)}`); docs.set(id, d); if (S.open?.id === id) { S.open.busy = false; rerender(); } }
  catch (e) { if (S.open?.id === id) { S.open.busy = false; S.open.err = e.status === 404 ? 'Artikkelen er fjernet.' : 'Fikk ikke åpnet den lagrede artikkelen.'; rerender(); } }
}
let searchT = 0;
function search73(q) {
  S.q = q;
  clearTimeout(searchT);
  const n = ++S.seq;
  if (q.trim().length < 2) { S.hits = null; rerender(); return; }
  // Felles søk (FTS5 over tittel, ingress og brødtekst) – samme som Glimt-søket.
  searchT = setTimeout(async () => {
    try { const r = await api(`/search51?q=${encodeURIComponent(q)}&types=article&limit=50`); if (n === S.seq) { S.hits = new Set((r?.results ?? []).filter((x) => x.type === 'article').map((x) => String(x.link?.ref ?? x.id.replace(/^article:/, '')))); rerender(); } }
    catch { if (n === S.seq) { S.hits = null; rerender(); } }
  }, 220);
  rerender();
}

/* ---------- Visning ---------- */
const srcLabel = (x) => [x.source || host(x.url)].filter(Boolean).join(' · ').toUpperCase();
const stHtml = (x) => `<span class="nw73-st" style="--st:${COLOR[x.status] ?? COLOR.pending}"><i aria-hidden="true"></i>${esc(x.statusText || (x.status === 'ok' ? 'Lagret · uten nett' : x.status === 'pending' ? 'Laster ned…' : 'Kun sammendrag'))}</span>`;
const thumb = (x) => `<span class="nw73-th" aria-hidden="true">${x.image && /^\/api\/news\/saved\//.test(x.image) ? `<img src="${esc(x.image)}" alt="" loading="lazy" decoding="async">` : `<b>${esc((x.source || host(x.url)).slice(0, 2).toUpperCase())}</b>`}</span>`;

/** Overskriften i leseren når fanen Lagret er valgt. */
export const label73 = () => `NYHETSLESER · ${count73()} LAGRET${globalThis.matchMedia?.('(min-width: 641px)').matches ? ' · SYNKES MED MOBIL' : ''}`;

/** Fanen «Lagret»: søk og rutenett (3 kolonner på web, én på mobil). */
export function listHtml73() { return `<div class="nw73-list">${listInner()}</div>`; }
function listInner() {
  if (S.items === null) return '<div class="nw-empty">Henter lagrede artikler …</div>';
  const ql = S.q.trim().toLowerCase();
  const list = (S.items ?? []).filter((x) => !ql || ql.length < 2 || S.hits?.has(x.id) || `${x.title} ${x.source} ${x.lead ?? ''}`.toLowerCase().includes(ql));
  const search = `<label class="nw73-q"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input name="nw73q" value="${esc(S.q)}" placeholder="Søk i lagrede artikler" autocomplete="off" aria-label="Søk i lagrede artikler" data-glimt="off"></label>`;
  const err = S.err ? `<div class="nw-empty">${esc(S.err)} <button class="nw-pill" data-nw73="reload">Prøv igjen</button></div>` : '';
  if (!S.items.length) return `${search}${err}<div class="nw73-empty"><b>Ingen lagrede artikler ennå</b><span>Trykk på bokmerket på en sak, så lastes hele artikkelen ned og kan leses senere – også uten nett.</span></div>`;
  return `${search}${err}${list.length ? '' : `<div class="nw-empty">Ingen lagrede artikler passer «${esc(S.q)}».</div>`}<div class="nw73-grid">${list.map((x) => `<article class="nw73-card">
      <button type="button" class="nw73-open" data-nw73-open="${esc(x.id)}" aria-label="Les ${esc(x.title)}">${thumb(x)}<span class="nw73-tx"><span class="nw73-src" data-no-i18n>${esc(srcLabel(x))}</span><span class="nw73-t" data-no-i18n>${esc(x.title)}</span>${stHtml(x)}</span></button>
      <button type="button" class="nw73-rm" data-nw73-rm="${esc(x.id)}" aria-label="Fjern fra lagret" title="Fjern fra lagret">${BM(true)}</button></article>`).join('')}</div>`;
}

/** Bokmerket ved hover på et artikkelkort. */
export const cardBtn73 = (x) => { const on = !!byUrl73(x.url); return `<button type="button" class="nw73-bm${on ? ' on' : ''}" data-nw73-tg="${esc(x.id ?? x.url)}" aria-pressed="${on}" aria-label="${on ? 'Fjern fra lagret' : 'Lagre artikkel'}" title="${on ? 'Fjern fra lagret' : 'Lagre artikkel'}">${BM(on)}</button>`; };
/** Bokmerket øverst i artikkelvisningen (1c). */
export const artBtn73 = (x) => { const on = !!byUrl73(x.url); return `<button type="button" class="nw73-ab${on ? ' on' : ''}" data-nw73-art="1" aria-pressed="${on}" aria-label="${on ? 'Fjern fra lagret' : 'Lagre artikkel'}" title="${on ? 'Fjern fra lagret' : 'Lagre artikkel'}">${BM(on)}</button>`; };
/** «Lagret 28. okt.» i artikkelvisningen når saken er lagret. */
export function artBanner73(x) {
  const it = byUrl73(x.url);
  return it ? banner(it, docs.get(it.id)) : '';
}
function banner(it, d) {
  const h = host(it.url);
  if (it.status === 'pending') return `<div class="nw73-ban"><span class="nw73-ck wait" aria-hidden="true">…</span><span><b>Laster ned…</b><br><span>Hele artikkelen hentes fra ${esc(h)}</span></span></div>`;
  if (it.status === 'ok') return `<div class="nw73-ban"><span class="nw73-ck" aria-hidden="true">✓</span><span><b>Lagret ${esc(dayMon(it.savedAt))}</b><br><span>Hele artikkelen (${nb(d?.words ?? it.words)} ord${(d?.images ?? it.images) ? `, ${nb(d?.images ?? it.images)} ${(d?.images ?? it.images) === 1 ? 'bilde' : 'bilder'}` : ''}) er lastet ned fra ${esc(h)} · kan leses uten nett</span></span></div>`;
  return `<div class="nw73-ban warn"><span class="nw73-ck" aria-hidden="true">!</span><span><b>${esc(it.statusText || 'Kun sammendrag')}</b><br><span>Fant ikke hele teksten hos ${esc(h)}. Tittel, ingress og lenke er lagret.</span></span><button type="button" class="nw-pill" data-nw73-retry="${esc(it.id)}">Prøv å laste ned på nytt</button></div>`;
}

/** Leservisningen for en lagret artikkel (lokal kopi, aldri RSS på nytt). */
export function readerHtml73() {
  const o = S.open;
  if (!o) return '';
  const it = S.items?.find((x) => x.id === o.id) ?? null;
  const d = docs.get(o.id) ?? null;
  const x = d ?? it ?? {};
  const pub = x.published ? (() => { const t = new Date(x.published); return Number.isNaN(+t) ? '' : `${t.getDate()}. ${MON[t.getMonth()]} ${t.getFullYear() !== new Date().getFullYear() ? t.getFullYear() : ''}`.trim(); })() : '';
  const head = [x.source || host(x.url), pub].filter(Boolean).join(' · ').toUpperCase();
  return `<div class="nw-art nw73-rd" role="document" aria-label="Lagret artikkel">
    <div class="nw-art-h"><button class="nw-back" data-nw73="close">‹ Lagret</button><span class="nw-sp"></span>
      ${it ? `<button type="button" class="nw73-ab on" data-nw73-rm="${esc(it.id)}" aria-label="Fjern fra lagret" title="Fjern fra lagret">${BM(true)}</button>` : ''}
      <a class="nw73-ab" href="${esc(x.url ?? '#')}" target="_blank" rel="noopener noreferrer" aria-label="Åpne original" title="Åpne original"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg></a></div>
    <div class="nw-art-body nw73-rd-b"><div class="nw-art-in nw73-in">
      ${o.busy && !d ? '<span class="nw-m nw-busy">Åpner den lagrede kopien …</span>' : ''}
      ${o.err ? `<span class="nw-m">${esc(o.err)}</span>` : ''}
      ${x.title ? `<span class="nw73-lab" data-no-i18n>${esc(head)}</span><h1 class="nw73-h1" data-no-i18n>${esc(x.title)}</h1>${x.lead ? `<p class="nw73-lead" data-no-i18n>${esc(x.lead)}</p>` : ''}` : ''}
      ${x.author ? `<span class="nw-m" data-no-i18n>${esc(x.author)}</span>` : ''}
      ${d?.image && !d.blocks?.some((b) => b.t === 'img' && b.src === d.image) ? `<figure class="nw73-hero"><img src="${esc(d.image)}" alt=""></figure>` : ''}
      ${it ? banner(it, d) : ''}
      ${d ? `<div class="nw73-body" data-no-i18n>${clean73(d.html)}</div>` : ''}
      ${x.url ? `<a class="nw-read nw73-orig" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Åpne original ↗</a>` : ''}
      ${it ? `<button type="button" class="nw73-rmline" data-nw73-rm="${esc(it.id)}">Fjern fra lagret</button>` : ''}
    </div></div></div>`;
}
export const toastHtml73 = () => (S.toast ? `<div class="nw73-toast" role="status">${esc(S.toast)}</div>` : '');

/** Klikk i leseren. findItem(id) finner saken for bokmerket på kortene; art = saken i artikkelvisningen. → true hvis håndtert */
export function click73(e, { findItem, art }) {
  const t = e.target.closest?.('[data-nw73],[data-nw73-open],[data-nw73-rm],[data-nw73-tg],[data-nw73-art],[data-nw73-retry]');
  if (!t) return false;
  e.preventDefault(); e.stopPropagation();
  const d = t.dataset;
  if (d.nw73 === 'close') closeSaved73();
  else if (d.nw73 === 'reload') load73();
  else if (d.nw73Open) openSaved73(d.nw73Open);
  else if (d.nw73Rm) remove73(d.nw73Rm);
  else if (d.nw73Retry) retry73(d.nw73Retry);
  else if (d.nw73Tg) { const x = findItem(d.nw73Tg); if (x) toggle73(x); }
  else if (d.nw73Art && art) toggle73(art);
  return true;
}
export function input73(e) { if (e.target.name !== 'nw73q') return false; const pos = e.target.selectionStart; search73(e.target.value); const n = document.querySelector('[name="nw73q"]'); if (n && document.activeElement !== n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* */ } } return true; }
/** Escape: lukker leservisningen først. */
export function key73() { if (S.open) { closeSaved73(); return true; } return false; }

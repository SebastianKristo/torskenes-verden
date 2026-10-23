// Felles nyhetsleser (prompt 13, design/Nyhetsleser.dc.html, variant web). Åpnes fra «SISTE NYTT ›» i nyhetsbaren
// både i Homelab v2 og i «Vindu og papir» (2c): import('/assets/js/news.js').then((m) => m.openNews()).
// Kilder og ✦ AI-valg lagres på serveren (/api/rss), så de er de samme i Papir-appen og PWA-en.
import { api, esc, backdropClick } from './util.js';
import { ICON_LIBS, iconHtml, searchIcons, suggestIcon, keywordFor, preloadIcons } from './icons.js';
import { clearBtn, bindSearchFields } from './searchfield.js';
import { glimt } from './glimt.js';

const CSS_ID = 'news-css';
const ensureCss = () => {
  if (document.getElementById(CSS_ID)) return;
  const l = Object.assign(document.createElement('link'), { id: CSS_ID, rel: 'stylesheet', href: '/assets/css/news.css' });
  document.head.append(l);
  if (!document.querySelector('link[data-news-fonts]')) {
    const f = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap' });
    f.dataset.newsFonts = '1';
    document.head.append(f);
  }
};

const CAT_NAME = { auto: 'Auto', fordeg: 'For deg', siste: 'Siste', norge: 'Norge', verden: 'Verden', okonomi: 'Økonomi', sport: 'Sport', teknologi: 'Teknologi', kultur: 'Kultur' };
// Standardikonene på fanene (Nyhetsleser.dc.html). Serveren sender de samme som iconDefaults.
const IC_DEF = { fordeg: 'lucide:sparkles', siste: 'lucide:zap', norge: 'lucide:mountain-snow', verden: 'lucide:globe', okonomi: 'lucide:trending-up', sport: 'lucide:trophy', teknologi: 'lucide:cpu', kultur: 'lucide:drama' };
// Prompt 24: faneikonene forhåndslastes (standard, lagrede og serverens), så de vises med en gang leseren åpnes.
const icIds = (d) => { const s = d?.settings ?? {}, loc = 'icOn' in s ? null : readLocal(); return [...Object.values(d?.iconDefaults ?? IC_DEF), ...Object.values(('icOn' in s ? s.ic : loc?.ic) ?? {})]; };
export async function preloadNewsIcons() {
  preloadIcons(icIds(null));
  try { return await preloadIcons(icIds(await api('/rss?limit=1'))); } catch { return []; }
}
// Prompt 46: egne kategorier, interesser og kilde→egen kategori når serveren ikke lagrer dem ennå.
const LS46 = 'hl_rss46';
const loc46 = () => { try { return JSON.parse(localStorage.getItem(LS46) || 'null') || {}; } catch { return {}; } };
const saveLoc46 = (v) => { try { localStorage.setItem(LS46, JSON.stringify(v)); } catch { /* privat modus */ } };
const slug46 = (t) => String(t ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'kategori';
const SUM46 = new Map(); // sammendrag per kategori (lever så lenge siden er åpen)
const IC_LOCAL = 'hl_rss_ic'; // bare reserve når serveren ikke lagrer ikonene ennå
const readLocal = () => { try { return JSON.parse(localStorage.getItem(IC_LOCAL) || 'null'); } catch { return null; } };
const writeLocal = (v) => { try { localStorage.setItem(IC_LOCAL, JSON.stringify(v)); } catch { /* privat modus */ } };
const CYCLE = ['auto', 'norge', 'verden', 'okonomi', 'sport', 'teknologi', 'kultur'];
const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '');
const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return today ? hm(iso) : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) + ' ' + hm(iso);
};

let open = null;

/**
 * Åpner nyhetsleseren som et lag over siden.
 * opts.theme: 'web' (mørk, Homelab v2), 'paper' (lys papir, 2c) eller 'paperDark'. Standard: 2c gir papir, ellers web.
 * opts.cat: kategori å starte på. opts.onClose: kalles når leseren lukkes.
 */
export function openNews(opts = {}) {
  if (open) { open.focus(); return open; }
  return reader(opts);
}
// Prompt 46: lys/mørk følger webmodusen (html[data-mode]) når den er satt, ellers systemet.
const themeNow = () => {
  const root = document.documentElement, paper = root.dataset.hlTheme === '2c' || document.body.classList.contains('theme-2c');
  const dark = root.hasAttribute('data-mode') ? root.getAttribute('data-mode') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches && root.dataset.paperMode !== 'lys';
  return paper ? (dark ? 'paperDark' : 'paper') : 'web';
};
/** Prompt 46 (claude-code-nyheter-innstillinger-flytt.md): innstillingene i Innstillinger → Nyheter. Samme lagring (/api/rss). */
export function mountNewsSettings(host) {
  ensureCss();
  const el = document.createElement('div');
  host.replaceChildren(el);
  return reader({ settingsOnly: true, host: el });
}

function reader(opts = {}) {
  ensureCss();
  const theme = opts.theme ?? themeNow();
  const SO = !!opts.settingsOnly;
  const st = { cat: opts.cat ?? 'siste', data: null, error: '', set: false, nf: '', busy: false, adding: false, addError: '', ip: null, icAll: false, icErr: '', art: null, gl: opts.glimt ? { open: true, cfg: false, busy: true, out: null, err: '' } : null };
  const artCache = new Map();
  bindSearchFields();

  const el = SO ? opts.host : document.createElement('div');
  if (SO) { el.className = `nw46-set nw-${theme}`; }
  else {
    el.className = `nw nw-${theme}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Nyhetsleser');
    el.tabIndex = -1;
    document.body.append(el);
    document.body.classList.add('nw-open');
  }

  const close = () => {
    if (SO) return;
    el.remove();
    document.body.classList.remove('nw-open');
    document.removeEventListener('keydown', onKey);
    open = null;
    opts.onClose?.();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (SO) { if (st.ip) { e.preventDefault(); e.stopPropagation(); st.ip = null; render(); } return; }
    if (st.more) { st.more = false; render(); } else if (st.ip) { st.ip = null; render(); } else if (st.art) { st.art = null; render(); } else if (st.gl?.cfg) { st.gl.cfg = false; render(); } else if (st.gl?.open) { glClose(); } else close();
  };
  if (SO) el.addEventListener('keydown', onKey, true); else document.addEventListener('keydown', onKey);
  // Prompt 46: innstillinger endret i Innstillinger → Nyheter gjelder med en gang (samme fane, eller annen fane via storage).
  if (!SO) { const onSet = () => { if (el.isConnected) load(); else document.removeEventListener('hl:news-settings', onSet); }; document.addEventListener('hl:news-settings', onSet); }

  // Bare svaret på siste forespørsel brukes, så et tregt førstekall ikke overskriver en kategori som er valgt etterpå.
  let seq = 0;
  async function load() {
    const n = ++seq;
    let data = null, error = '';
    // Prompt 46: «For deg» og egne kategorier. Kjenner ikke serveren dem (eldre versjon), filtreres «Siste» her.
    const own = isFd46(st.cat) || isCC46(st.cat), srvKnows = [...(st.data?.categories ?? []), ...(st.data?.tabs ?? [])].some((c) => String(c.id) === st.cat);
    const local = async () => { const d = await api('/rss?cat=siste&limit=200'); d.items = filter46(d, st.cat); d.local46 = true; return d; };
    try { data = own && st.data && !srvKnows ? await local() : await api(`/rss?cat=${encodeURIComponent(st.cat)}&limit=60`); }
    catch (e) { if (own && e.status === 400) { try { data = await local(); } catch (e2) { error = e2.message; } } else error = e.message || 'Kunne ikke hente nyheter'; }
    if (n !== seq || !el.isConnected) return;
    st.error = error;
    if (data) { if (own && !data.local46 && !Array.isArray(data.items)) data.items = []; st.data = data; preloadIcons(icIds(data)); }
    render();
    if (data && !SO) catSum46();
    // Glimt foreslår interesser ut fra det du leser (GET /api/rss/interests → suggestions).
    if (data && SO && !st.sug46) { st.sug46 = true; api('/rss/interests').then((r) => { if (Array.isArray(r?.suggestions) && st.data) { st.data.suggestions46 = r.suggestions; render(); } }).catch(() => {}); }
    if (data && st.gl?.open && !st.gl.out && !st.gl.started) { st.gl.started = true; glRun(); }
  }

  /* ---------- Prompt 46: egne kategorier, «For deg», favicon og sammendrag per kategori ----------
     Serveren (SERVER46) eier lagringen: news_categories {id, name, keywords[], icon, order} og news_interests {word}.
     Mangler den feltene, brukes localStorage «hl_rss46» så valgene ikke går tapt, og utvalget lages her. */
  const ccSrv = () => { const d = st.data ?? {}; const v = d.customCategories ?? d.news_categories ?? d.settings?.customCategories; return Array.isArray(v) ? v : null; };
  const ccList = () => (ccSrv() ?? loc46().cc ?? []).map((c, i) => ({ id: String(c.id ?? `cc-${slug46(c.name ?? c.n)}`), name: String(c.name ?? c.n ?? ''), keywords: (c.keywords ?? c.kw ?? []).map(String), icon: c.icon ?? 'lucide:tag', order: c.order ?? i })).filter((c) => c.name);
  const intSrv = () => { const d = st.data ?? {}; const v = d.interests ?? d.news_interests ?? d.settings?.interests; return Array.isArray(v) ? v : null; };
  const intList = () => (intSrv() ?? loc46().int ?? []).map((w) => (typeof w === 'string' ? w : w?.word)).filter(Boolean);
  const isCC46 = (id) => ccList().some((c) => c.id === id);
  const feedCat46 = (f) => loc46().feedCat?.[f.id] ?? f.category;
  function filter46(d, cat) {
    const items = d.items ?? [], fold = (t) => String(t ?? '').toLowerCase(), txt = (x) => fold(`${x.title} ${x.summary ?? x.description ?? x.desc ?? ''}`);
    const hit = (x, W) => W.some((w) => w && txt(x).includes(fold(w)));
    if (isFd46(cat)) return items.filter((x) => hit(x, intList())).slice(0, 30);
    const c = ccList().find((q) => q.id === cat); if (!c) return [];
    const feeds = new Set((d.feeds ?? []).filter((f) => feedCat46(f) === c.id).map((f) => f.name));
    return items.filter((x) => feeds.has(x.feed) || x.category === c.id || hit(x, c.keywords));
  }
  async function saveCC(next) {
    const cur = loc46(); saveLoc46({ ...cur, cc: next.map(({ id, name, keywords, icon, order }) => ({ id, name, keywords, icon, order })) });
    if (st.data) st.data.customCategories = ccSrv() ? next : st.data.customCategories;
    render(); document.dispatchEvent(new Event('hl:news-settings'));
  }
  async function addCC(name, kw) {
    name = name.trim();
    const all = [...cats().map((c) => c.name.toLowerCase()), 'for deg', 'auto'];
    if (!name) { st.ccErr = 'Skriv et navn på kategorien.'; return render(); }
    if (all.includes(name.toLowerCase())) { st.ccErr = 'Det finnes allerede en kategori med det navnet.'; return render(); }
    const keywords = kw.split(',').map((w) => w.trim()).filter(Boolean);
    st.ccErr = '';
    try {
      const r = await api('/rss/categories', { method: 'POST', json: { name, keywords, icon: 'lucide:tag' } });
      const list = ccFrom46(r) ?? (r?.category?.id || r?.id ? [...(ccSrv() ?? []), r.category ?? r] : null);
      if (list) { st.data.customCategories = list; st.ccN = ''; st.ccK = ''; render(); document.dispatchEvent(new Event('hl:news-settings')); return load(); }
    } catch (e) { if (e.status && e.status !== 404 && e.status !== 405) { st.ccErr = e.message; return render(); } }
    st.ccN = ''; st.ccK = '';
    await saveCC([...ccList(), { id: `cc-${slug46(name)}-${Date.now().toString(36).slice(-4)}`, name, keywords, icon: 'lucide:tag', order: ccList().length }]);
  }
  async function delCC(id) {
    const c = ccList().find((x) => x.id === id); if (!c) return;
    if (!confirm(`Slette kategorien «${c.name}»? Kilder som sto på den settes til Auto.`)) return;
    try {
      const r = await api(`/rss/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const list = ccFrom46(r);
      if (list) st.data.customCategories = list; else if (ccSrv()) st.data.customCategories = ccSrv().filter((x) => String(x.id) !== id);
      if (Array.isArray(r?.feeds)) st.data.feeds = r.feeds;
    } catch (e) { if (e.status && e.status !== 404 && e.status !== 405) { st.ccErr = e.message; return render(); } }
    const cur = loc46(), fc = { ...(cur.feedCat ?? {}) };
    for (const k of Object.keys(fc)) if (fc[k] === id) delete fc[k];
    saveLoc46({ ...cur, cc: (cur.cc ?? []).filter((x) => String(x.id) !== id), feedCat: fc });
    if (st.cat === id) st.cat = 'siste';
    render(); document.dispatchEvent(new Event('hl:news-settings')); load();
  }
  // Serveren svarer {categories:[…]} eller {categories:{standard, custom}} (SERVER46) eller {customCategories}.
  function ccFrom46(r) { const c = r?.categories; return Array.isArray(r?.customCategories) ? r.customCategories : Array.isArray(c?.custom) ? c.custom : Array.isArray(c) ? c.filter((x) => !['siste', 'norge', 'verden', 'okonomi', 'sport', 'teknologi', 'kultur'].includes(x.id)) : null; }
  async function setInts(words) {
    const uniq = [...new Set(words.map((w) => w.trim()).filter(Boolean))].slice(0, 40);
    try {
      const r = await api('/rss/interests', { method: 'PUT', json: { words: uniq } });
      if (st.data) { st.data.interests = Array.isArray(r?.interests) ? r.interests : uniq; if (Array.isArray(r?.suggestions)) st.data.suggestions46 = r.suggestions; }
    } catch (e) { if (e.status && e.status !== 404 && e.status !== 405) { st.ccErr = e.message; return render(); } if (st.data && intSrv()) st.data.interests = uniq; }
    saveLoc46({ ...loc46(), int: uniq });
    render(); document.dispatchEvent(new Event('hl:news-settings'));
  }
  // Sammendrag per kategori: GET /api/rss/summary?cat= → {points:[{text, id|url}] | text, updatedAt, count}. Cache 30 min / ≥3 nye saker.
  const sumCache = SUM46;
  const catOn46 = () => (st.data?.settings?.catSummary ?? loc46().catSummary) !== false;
  async function catSum46() {
    const cat = st.cat, items = st.data?.items ?? [];
    if (cat === 'siste' || !catOn46() || items.length < 3) return;
    const c = sumCache.get(cat), ids = items.slice(0, 15).map((x) => String(x.id ?? x.url));
    const fresh = c && !c.busy && Date.now() - c.at < 30 * 60_000 && ids.filter((i) => !c.ids.includes(i)).length < 3;
    if (fresh || c?.busy) return;
    sumCache.set(cat, { ...(c ?? {}), busy: true, ids, at: c?.at ?? 0 }); render();
    let out = null;
    try {
      const r = await api(`/rss/summary?cat=${encodeURIComponent(cat)}`);
      if (r?.pending || r?.skeleton) { sumCache.set(cat, { busy: false, out: null, ids, at: 0, retry: (c?.retry ?? 0) + 1 }); if ((c?.retry ?? 0) < 6) setTimeout(() => { if (st.cat === cat && el.isConnected) catSum46(); }, 4000); return; }
      const seen = new Set(), pts = Array.isArray(r?.points) ? r.points.map((p) => (typeof p === 'string' ? { text: p } : { text: p.text ?? p.t ?? '', id: p.id ?? null, url: p.url ?? null })).filter((p) => { const k = p.text.trim().toLowerCase().replace(/[.!?]+$/, ''); if (!k || seen.has(k)) return false; seen.add(k); return true; }) : [];
      if (r?.hidden || r?.empty) out = { none: true, at: Date.now() };
      else if (pts.length || r?.text) out = { points: pts, text: pts.length ? '' : String(r.text ?? ''), at: Date.parse(r.updatedAt ?? '') || Date.now(), local: r.engine === 'lokal', upd: r.updatedText ?? null };
    } catch { /* 404 / feil: lokalt */ }
    if (!out) { const seen = new Set(); out = { points: items.filter((x) => { const k = String(x.title ?? '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4).map((x) => ({ text: x.title, id: x.id ?? x.url, url: x.url })), at: Date.now(), local: true }; }
    sumCache.set(cat, { busy: false, out, ids, at: Date.now() });
    if (st.cat === cat && el.isConnected) render();
  }
  function catSumHtml(items) {
    if (st.cat === 'siste' || !catOn46() || items.length < 3) return '';
    const c = sumCache.get(st.cat), name = cats().find((x) => x.id === st.cat)?.name ?? '';
    if (!c || (!c.out && (c.busy || (c.retry && c.retry <= 6)))) return `<div class="nw46-sum sk" aria-busy="true"><span class="nw-lab">✦ GLIMT · ${esc(name.toUpperCase())}</span><i></i><i></i><i class="s"></i></div>`;
    const o = c.out; if (!o || o.none || (!o.points?.length && !o.text)) return '';
    const ref = (p) => { const x = (st.data?.items ?? []).find((y) => String(y.id) === String(p.id) || (p.url && y.url === p.url)); return x ? ` data-art="${esc(x.id ?? x.url)}"` : ''; };
    return `<section class="nw46-sum" aria-label="Sammendrag for ${esc(name)}"><span class="nw40-lh"><span class="nw-lab">✦ GLIMT · ${esc(name.toUpperCase())}</span><span class="nw-m">${esc(o.upd || `oppdatert kl. ${hm(new Date(o.at).toISOString())}`)}</span></span>
      ${o.points?.length ? `<ul>${o.points.slice(0, 5).map((p) => { const r = ref(p); return `<li>${r ? `<button type="button" class="nw46-pt"${r}>` : '<span>'}<span data-no-i18n>${esc(p.text)}</span>${r ? ' <b aria-hidden="true">›</b></button>' : '</span>'}</li>`; }).join('')}</ul>` : `<p class="nw46-sumt" data-no-i18n>${esc(o.text)}</p>`}
      ${o.local ? '<span class="nw-hint">Glimt-sammendraget er ikke klart ennå · viser de viktigste sakene.</span>' : ''}</section>`;
  }
  const favOf = (f) => { if (f.favErr) return ''; if (f.favicon || f.icon) return f.favicon || f.icon; if ('favicon' in f) return ''; try { const h = new URL(f.url).hostname.replace(/^(www|rss|feeds?)\./, ''); return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(h)}`; } catch { return ''; } };

  /* ---------- Ikoner på fanene (prompt 23) ---------- */
  const icState = () => {
    const s = st.data?.settings ?? {};
    const srv = 'icOn' in s, loc = srv ? null : readLocal();
    return { ic: (srv ? s.ic : loc?.ic) ?? {}, icSrc: (srv ? s.icSrc : loc?.icSrc) ?? {}, icOn: (srv ? s.icOn : loc?.icOn) !== false };
  };
  const icOf = (id) => { const x = icState(); return id in x.ic ? x.ic[id] : (st.data?.iconDefaults ?? IC_DEF)[id] ?? IC_DEF[id] ?? (st.data?.tabs ?? []).find((t) => String(t.id) === id)?.icon ?? (isFd46(id) ? IC_DEF.fordeg : null) ?? (isCC46(id) ? ccList().find((c) => c.id === id)?.icon ?? 'lucide:tag' : ''); };
  const cats0 = () => st.data?.categories ?? Object.keys(CAT_NAME).slice(1).map((id) => ({ id, name: CAT_NAME[id] }));
  // Prompt 46: Siste · ✦ For deg · standard · egne kategorier (serveren kan sende dem selv i categories).
  const cats = () => {
    // SERVER46: GET /api/rss → tabs [{id, name, icon, kind:'std'|'for-deg'|'custom'}] i riktig rekkefølge.
    if (Array.isArray(st.data?.tabs) && st.data.tabs.length) return st.data.tabs.map((t) => ({ id: String(t.id), name: t.name, icon: t.icon, custom: t.kind === 'custom', fd: t.kind === 'for-deg' }));
    const base = cats0(), out = [...base]; if (!out.some((c) => c.id === 'fordeg')) out.splice(1, 0, { id: 'fordeg', name: 'For deg' }); for (const c of ccList()) if (!out.some((x) => x.id === c.id)) out.push({ id: c.id, name: c.name, custom: true }); return out; };
  const stdCats = () => cats0().filter((c) => c.id !== 'siste' && !isFd46(c.id) && !isCC46(c.id));
  const isFd46 = (id) => id === 'fordeg' || id === 'for-deg' || (st.data?.tabs ?? []).some((t) => String(t.id) === id && t.kind === 'for-deg');
  async function saveIcons(patch) {
    const next = { ...icState(), ...patch };
    st.data = st.data ?? { settings: {} };
    st.data.settings = { ...(st.data.settings ?? {}), ...next };
    render();
    try {
      const r = await api('/rss/settings', { method: 'PUT', json: patch });
      if (r && 'icOn' in r) st.data.settings = { ...st.data.settings, ...r };
      else { writeLocal(next); delete st.data.settings.icOn; }
      st.icErr = '';
    } catch (er) { st.icErr = er.message; }
    render();
    document.dispatchEvent(new Event('hl:news-settings'));
  }
  const setIcon = (id, icon, src) => { const x = icState(); return saveIcons({ ic: { ...x.ic, [id]: icon }, icSrc: { ...x.icSrc, [id]: src } }); };
  async function ipSearch() {
    const ip = st.ip;
    if (!ip || !ip.q.trim()) return;
    const n = (ip.seq = (ip.seq ?? 0) + 1);
    ip.busy = true; ip.err = ''; render();
    try { const r = await searchIcons(ip.q, ip.lib, 96); if (st.ip !== ip || n !== ip.seq) return; ip.res = r.icons; ip.total = r.total; }
    catch { if (st.ip !== ip || n !== ip.seq) return; ip.res = []; ip.err = 'Fikk ikke kontakt med ikonbiblioteket'; }
    ip.busy = false; render();
  }
  const catName = (id) => cats().find((c) => c.id === id)?.name ?? CAT_NAME[id] ?? id;
  async function aiPick(id, lib) {
    const icon = await suggestIcon(catName(id), lib).catch(() => null);
    if (icon) await setIcon(id, icon, 'ai');
    return icon;
  }

  // Prompt 27: bilde 76×76 ved hver sak (RSS-bilde eller og:image fra serveren; ellers kildefarge + initialer).
  // Trykk åpner saken i leseren (artikkelvisning), ikke rett til nettsiden.
  const ini = (x) => String(x.feed ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase();
  // Initialene ligger alltid under bildet, så en sak med et bilde som ikke lar seg laste viser kildefarge + initialer.
  const imgTag = (u) => (u && /^(https?:\/\/|\/)/.test(u) ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-nw-img>` : '');
  const thumb = (x, cls = 'nw-th') => `<span class="${cls}" style="background-color:${esc(x.color || '#5c5850')}" aria-hidden="true">${esc(ini(x))}${imgTag(x.image)}</span>`;
  const findItem = (id) => (st.data?.items ?? []).find((x) => String(x.id) === String(id)) ?? st.art?.rel?.find((x) => String(x.id ?? x.url) === String(id));
  const item = (x, showCat) => `<button type="button" class="nw-it" data-art="${esc(x.id ?? x.url)}">
      <span class="nw-tx">${showCat ? `<span class="nw-cat">${esc((CAT_NAME[x.category] ?? x.category).toUpperCase())}</span>` : ''}<span class="nw-t" data-no-i18n>${esc(x.title)}</span><span class="nw-m"><span data-no-i18n>${esc(x.feed)}</span> · ${esc(when(x.published))}${x.ai ? ' · ✦ AI' : ''}</span></span>
      ${thumb(x)}</button>`;

  async function openArt(x) {
    st.art = { x, d: artCache.get(x.url) ?? null, busy: !artCache.has(x.url), err: '', shared: false };
    render();
    el.querySelector('.nw-art-body')?.scrollTo(0, 0);
    if (!st.art.busy) return;
    const a = st.art;
    try {
      const d = await api(`/rss/article?url=${encodeURIComponent(x.url)}`);
      artCache.set(x.url, d);
      if (st.art === a) { a.d = d; a.busy = false; render(); }
    } catch (e) { if (st.art === a) { a.busy = false; a.err = e.status === 404 ? 'Sammendrag er ikke tilgjengelig på denne serveren.' : 'Fikk ikke laget sammendrag nå. Åpne saken for å lese hele.'; render(); } }
  }
  const dayWord = (iso) => { if (!iso) return ''; const d = new Date(iso), t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString() ? `I dag ${hm(iso)}` : d.toDateString() === y.toDateString() ? `I går ${hm(iso)}` : when(iso); };
  function artView() {
    const a = st.art;
    if (!a) return '';
    const x = a.x, d = a.d ?? {}, img = d.image || x.image, src = d.source || x.feed || '', cat = (CAT_NAME[d.category ?? x.category] ?? d.category ?? x.category ?? '').toUpperCase();
    const rm = d.readMin ?? x.readMin, pts = Array.isArray(d.points) ? d.points.filter(Boolean).slice(0, 3) : [];
    const rel = (Array.isArray(d.related) && d.related.length ? d.related : (st.data?.items ?? []).filter((y) => y.category === x.category && y.url !== x.url)).slice(0, 5);
    a.rel = rel;
    return `<div class="nw-art" role="document">
      <div class="nw-art-h"><button class="nw-back" data-act="art-close">‹ Siste nytt</button><span class="nw-sp"></span><button class="nw-back" data-act="art-share">${a.shared ? 'Lenke kopiert' : 'Del'}</button></div>
      <div class="nw-art-body"><div class="nw-art-in">
        <div class="nw-hero" style="background-color:${esc(x.color || '#5c5850')}">${esc(ini(x))}${imgTag(img)}</div>
        <span class="nw-lab">${esc(cat)}${cat ? ' · ' : ''}<span data-no-i18n>${esc(src.toUpperCase())}</span></span>
        <h1 class="nw-art-t" data-no-i18n>${esc(d.title || x.title)}</h1>
        <span class="nw-m">${esc(dayWord(d.published || x.published))}${rm ? ` · ca. ${rm} min å lese` : ''}</span>
        <div class="nw-sum"><span class="nw-lab">✦ AI-SAMMENDRAG</span>
          ${a.busy ? '<span class="nw-m nw-busy">Leser saken …</span>' : a.err ? `<span class="nw-m">${esc(a.err)}</span>`
    : `<span class="nw-sumt" data-no-i18n>${esc(d.summary || 'Ingen sammendrag for denne saken.')}</span>${pts.length ? `<div class="nw-pts">${pts.map((p, i) => `<div><b>${i + 1}</b><span data-no-i18n>${esc(p)}</span></div>`).join('')}</div>` : ''}`}
          ${!a.busy && !a.err && d.summary ? `<span class="nw-hint">${esc(d.aiNote ? `✦ ${d.aiNote.replace(/^✦\s*/, '')}` : '✦ Laget av AI fra saken. Kan inneholde feil.')}</span>` : ''}</div>
        <a class="nw-read" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Les hele saken hos <span data-no-i18n>${esc(src)}</span> ↗</a>
        ${rel.length ? `<div class="nw-gh nw-more">MER OM ${esc(cat)}</div>${rel.map((y) => `<button type="button" class="nw-it" data-art="${esc(y.id ?? y.url)}"><span class="nw-tx"><span class="nw-t" data-no-i18n>${esc(y.title)}</span><span class="nw-m"><span data-no-i18n>${esc(y.feed ?? y.source ?? '')}</span> · ${esc(when(y.published))}</span></span>${thumb({ ...y, feed: y.feed ?? y.source }, 'nw-th sm')}</button>`).join('')}` : ''}
      </div></div></div>`;
  }

  /* ---------- Prompt 40: Glimt-siden (claude-code-nyheter-glimt-side.md, fasit Nyhetsleser.dc.html → gl) ----------
     POST /api/news/glimt {sources, ids, length, topics, period} → {title, lead, sections:[{h, text, refs}], refs:[{n, title, source, url,
     image, time}], images:[{url, ref, alt}], sources, updatedAt}. Feiler det (eller 404): lokalt sammendrag av titlene per tema. */
  const GL_KEY = 'hl_rss_glimt', TOPICS = [['norge', 'Norge'], ['verden', 'Verden'], ['okonomi', 'Økonomi'], ['sport', 'Sport'], ['teknologi', 'Teknologi'], ['kultur', 'Kultur']];
  const PERIODS = [['dag', 'I dag'], ['24t', '24 t'], ['uke', 'Uke']], LENS = [['kort', 'Kort'], ['lang', 'Lang']];
  const glP = (() => { try { const v = JSON.parse(localStorage.getItem(GL_KEY) || 'null'); if (v && typeof v === 'object') return { src: v.src ?? null, top: v.top ?? null, per: v.per ?? 'dag', len: v.len ?? 'lang' }; } catch { /* */ } return { src: null, top: null, per: 'dag', len: 'lang' }; })();
  const saveGlP = () => { try { localStorage.setItem(GL_KEY, JSON.stringify(glP)); } catch { /* privat modus */ } api('/rss/settings', { method: 'PUT', json: { newsGlimt: glP } }).catch(() => {}); };
  const glFeeds = () => (st.data?.feeds ?? []).filter((f) => f.enabled !== false);
  function glArts() {
    const now = Date.now(), lim = glP.per === 'uke' ? 7 * 864e5 : 864e5, d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const srcOn = glP.src ?? glFeeds().map((f) => f.name), topOn = glP.top ?? TOPICS.map((x) => x[0]);
    return ((st.cat === 'siste' ? null : st.glItems) ?? st.data?.items ?? []).filter((x) => {
      const t = Date.parse(x.published ?? '') || now;
      if (glP.per === 'dag' ? t < +d0 : now - t > lim) return false;
      return srcOn.includes(x.feed) && (topOn.includes(x.category) || !TOPICS.some((tp) => tp[0] === x.category));
    }).slice(0, 30);
  }
  function glLocal(A) {
    const by = {};
    A.forEach((a, i) => { (by[a.category] ??= []).push({ ...a, n: i + 1 }); });
    const lim = glP.len === 'kort' ? 2 : 6, pre = ['', 'I tillegg: ', 'Også verdt å merke seg: ', 'Samtidig: '];
    const H = { norge: 'Norge og Oslo', okonomi: 'Økonomi', verden: 'Verden', sport: 'Sport', teknologi: 'Teknologi', kultur: 'Kultur' };
    const srcs = [...new Set(A.map((a) => a.feed))];
    const list = srcs.length > 1 ? `${srcs.slice(0, -1).join(', ')} og ${srcs.at(-1)}` : srcs[0] ?? '';
    return { local: true, title: glP.per === 'uke' ? 'Uka i nyheter' : glP.per === '24t' ? 'Siste døgn' : 'Dette skjer i dag',
      lead: `Glimt har lest ${A.length} saker fra ${list}. Det viktigste: ${A[0] ? A[0].title.charAt(0).toLowerCase() + A[0].title.slice(1) : ''}.`,
      sections: ['norge', 'okonomi', 'verden', 'sport', 'teknologi', 'kultur', ...Object.keys(by).filter((k) => !H[k])].filter((k) => by[k]).map((k) => ({ h: H[k] ?? CAT_NAME[k] ?? k, segs: by[k].slice(0, lim).map((a, j) => ({ t: `${pre[j % 4]}${a.title.replace(/[.!?]$/, '')}.`, refs: [a.n] })), img: by[k].find((a) => a.image)?.n ?? null })),
      refs: A.map((a, i) => ({ n: i + 1, title: a.title, source: a.feed, url: a.url, image: a.image, time: a.published })), updatedAt: new Date().toISOString() };
  }
  // Teksten fra serveren kan ha [n] inne i setningene: de blir brikker. Ellers kommer refs til slutt i avsnittet.
  const segsOf = (sec) => {
    if (Array.isArray(sec.segs)) return sec.segs;
    if (Array.isArray(sec.avsnitt)) return sec.avsnitt.map((a) => ({ t: a.tekst ?? a.text ?? '', refs: a.ref ?? a.refs ?? [] }));
    const txt = String(sec.text ?? ''), parts = [], re = /\s*\[(\d+(?:\s*,\s*\d+)*)\]/g;
    let last = 0, m;
    while ((m = re.exec(txt))) { parts.push({ t: txt.slice(last, m.index), refs: m[1].split(/\s*,\s*/).map(Number) }); last = re.lastIndex; }
    if (last < txt.length) parts.push({ t: txt.slice(last), refs: parts.length ? [] : sec.refs ?? [] });
    else if (!parts.length) parts.push({ t: txt, refs: sec.refs ?? [] });
    return parts;
  };
  async function glRun() {
    const g = st.gl;
    if (!g || !st.data) return; // kjøres når nyhetene er hentet (load)
    g.started = true;
    if (st.cat !== 'siste' && !st.glItems) { try { st.glItems = (await api('/rss?cat=siste&limit=60')).items ?? []; } catch { st.glItems = []; } }
    const A = glArts();
    g.busy = true; g.cfg = false; g.err = ''; g.n = A.length; render();
    const key = JSON.stringify(glP) + A.length; g.key = key;
    if (!A.length && st.data) { g.busy = false; g.out = { none: true }; return render(); }
    let out = null;
    try {
      const srcIds = glP.src ? glFeeds().filter((f) => glP.src.includes(f.name)).map((f) => f.id) : undefined;
      const r = await api('/news/glimt', { method: 'POST', json: { sources: srcIds, ids: A.map((a) => a.id).filter(Boolean), length: glP.len, topics: glP.top ?? undefined, period: glP.per } });
      if (r && Array.isArray(r.sections) && r.sections.length) out = r;
    } catch { /* 404 eller feil: lokalt */ }
    if (st.gl !== g || g.key !== key) return;
    g.busy = false; g.out = out ?? glLocal(A); render();
  }
  function glOpen() { st.gl = { open: true, cfg: false, busy: true, out: null, err: '' }; render(); glRun(); }
  function glClose() { try { speechSynthesis.cancel(); } catch { /* */ } st.gl = null; render(); }
  function glSpeak() {
    const g = st.gl, o = g?.out;
    if (!o || o.none) return;
    try {
      if (g.speaking) { speechSynthesis.cancel(); g.speaking = false; return render(); }
      const txt = [o.title, o.lead, ...(o.sections ?? []).map((sc) => `${sc.h}. ${segsOf(sc).map((x) => x.t).join(' ')}`)].join(' \n');
      const u = new SpeechSynthesisUtterance(txt); u.lang = 'nb-NO'; u.rate = 1;
      const v = speechSynthesis.getVoices().find((x) => /^(nb|no)/i.test(x.lang)); if (v) u.voice = v;
      u.onend = () => { if (st.gl === g) { g.speaking = false; render(); } };
      speechSynthesis.speak(u); g.speaking = true; render();
    } catch { /* ingen talesyntese */ }
  }
  async function glClick(e) {
    const b = e.target.closest?.('[data-gl]');
    const open0 = e.target.closest?.('[data-act="gl-open"]');
    if (open0) { e.preventDefault(); glOpen(); return true; }
    if (!b) return false;
    e.preventDefault();
    const a = b.dataset.gl, v = b.dataset.v;
    if (a === 'close') glClose();
    else if (a === 'speak') glSpeak();
    else if (a === 'cfg') { st.gl.cfg = !st.gl.cfg; render(); }
    else if (a === 'src') { const all = glFeeds().map((f) => f.name), cur = glP.src ?? all; glP.src = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; if (glP.src.length === all.length) glP.src = null; saveGlP(); render(); }
    else if (a === 'top') { const all = TOPICS.map((x) => x[0]), cur = glP.top ?? all; glP.top = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; if (glP.top.length === all.length) glP.top = null; saveGlP(); render(); }
    else if (a === 'per') { glP.per = v; saveGlP(); render(); }
    else if (a === 'len') { glP.len = v; saveGlP(); render(); }
    else if (a === 'run') glRun();
    else if (a === 'ref') {
      const r = (st.gl.out?.refs ?? []).find((x) => String(x.n) === String(v));
      if (!r) return true;
      const x = (st.data?.items ?? []).find((y) => y.url === r.url || String(y.id) === String(r.id)) ?? { title: r.title, url: r.url, feed: r.source, image: r.image, published: r.time, color: '#5c5850' };
      openArt(x);
    }
    return true;
  }
  function glView() {
    const g = st.gl;
    if (!g?.open) return '';
    const o = g.out, A = g.busy || g.cfg ? glArts() : null, nSel = A ? A.length : g.n ?? 0;
    const chip = (on, attrs, inner) => `<button type="button" class="nw40-chip${on ? ' on' : ''}" ${attrs} aria-pressed="${on}">${inner}</button>`;
    const seg = (list, cur, k) => `<div class="nw40-seg">${list.map(([id, n]) => `<button type="button" class="${cur === id ? 'on' : ''}" data-gl="${k}" data-v="${id}" aria-pressed="${cur === id}">${n}</button>`).join('')}</div>`;
    const srcOn = glP.src ?? glFeeds().map((f) => f.name), topOn = glP.top ?? TOPICS.map((x) => x[0]);
    const cfg = g.cfg ? `<div class="nw40-cfg"><span class="nw-lab nw40-mut">KILDER</span><div class="nw40-chips">${glFeeds().map((f) => chip(srcOn.includes(f.name), `data-gl="src" data-v="${esc(f.name)}"`, `<i style="background:${esc(f.color || '#8f897c')}"></i>${esc(f.name)}`)).join('') || '<span class="nw-m">Ingen kilder.</span>'}</div>
      <span class="nw-lab nw40-mut">TEMAER</span><div class="nw40-chips">${TOPICS.map(([id, n]) => chip(topOn.includes(id), `data-gl="top" data-v="${id}"`, n)).join('')}</div>
      <div class="nw40-two"><div><span class="nw-lab nw40-mut">PERIODE</span>${seg(PERIODS, glP.per, 'per')}</div><div><span class="nw-lab nw40-mut">LENGDE</span>${seg(LENS, glP.len, 'len')}</div></div>
      <button type="button" class="nw40-run" data-gl="run">✦ Lag sammendrag (${nSel} saker)</button></div>` : '';
    const title = o?.title || (glP.per === 'uke' ? 'Uka i nyheter' : glP.per === '24t' ? 'Siste døgn' : 'Dette skjer i dag');
    const refs = o?.refs ?? [], used = new Set();
    const imgFor = (sc, i) => {
      if (glP.len === 'kort' && i > 2) return null;
      const im = (o.images ?? []).find((x) => (sc.refs ?? segsOf(sc).flatMap((s2) => s2.refs)).includes(x.ref)) ?? (sc.img ? { url: refs.find((r) => r.n === sc.img)?.image, ref: sc.img } : null) ?? (sc.bilde ? { url: refs.find((r) => r.n === sc.bilde)?.image, ref: sc.bilde } : null);
      return im?.url ? im : null;
    };
    const secs = o && !o.none ? (o.sections ?? []).map((sc, i) => {
      const segs = segsOf(sc); segs.forEach((x) => (x.refs ?? []).forEach((n) => used.add(n)));
      const im = imgFor(sc, i), src = im ? refs.find((r) => r.n === im.ref)?.source ?? '' : '';
      return `<section class="nw40-sec">${im ? `<figure><span class="nw40-img" style="aspect-ratio:${i ? '3/2' : '16/9'}"><img src="${esc(im.url)}" alt="${esc(im.alt ?? '')}" loading="lazy" referrerpolicy="no-referrer" data-nw-img></span><figcaption>Bilde fra saken <button type="button" class="nw41-src" data-gl="ref" data-v="${esc(im.ref)}" aria-label="Kilde ${esc(im.ref)}">${esc(src || `Kilde ${im.ref}`)}</button></figcaption></figure>` : ''}
        <b class="nw40-h">${esc(sc.h ?? sc.tittel ?? '')}</b><p>${segs.map((x) => `<span data-no-i18n>${esc(String(x.t ?? '').replace(/\s*\[(?:\d+(?:\s*,\s*\d+)*)\]\s*/g, ' ').replace(/^\s*\]\s*·?\s*/, '').trim())}</span>${(x.refs ?? []).map((n) => `<button type="button" class="nw40-ref" data-gl="ref" data-v="${esc(n)}" aria-label="Kilde ${esc(n)}">${esc(n)}</button>`).join('')}`).join(' ')}</p></section>`;
    }).join('') : '';
    const refList = refs.filter((r) => used.has(r.n) || o?.local);
    const meta = o && !o.none ? [new Date(o.updatedAt ?? Date.now()).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }), `${refs.length} saker`, `${new Set(refs.map((r) => r.source)).size} kilder`, glP.len === 'kort' ? 'kort' : 'langt'].join(' · ') : 'Velg innholdet under «Innhold»';
    return `<div class="nw40-gl" role="document" aria-label="Glimt-sammendrag">
      <div class="nw40-gh"><button type="button" class="nw40-pill" data-gl="close">‹ Nyheter</button><span class="nw-sp"></span><button type="button" class="nw40-pill" data-gl="speak"${o && !o.none ? '' : ' disabled'}>${g.speaking ? '■<span class="nw41-lt"> Stopp</span>' : '▶<span class="nw41-lt"> Les opp</span>'}</button><button type="button" class="nw40-pill ink${g.cfg ? ' on' : ''}" data-gl="cfg" aria-pressed="${!!g.cfg}">Innhold</button></div>
      <div class="nw40-gb"><div class="nw40-in">
        <div class="nw40-top"><span class="nw-lab">✦ GLIMT · NYHETSOPPSUMMERING</span><b class="nw40-t">${esc(title)}</b><span class="nw-m">${esc(meta)}</span></div>
        ${cfg}
        ${g.busy ? `<div class="nw40-busy"><span>✦ Glimt leser ${nSel} saker …</span><i style="width:92%"></i><i style="width:80%"></i><i class="big"></i><i style="width:88%"></i></div>` : ''}
        ${o?.none && !g.busy ? '<span class="nw-m">Ingen saker passer valgene. Slå på flere kilder eller temaer under «Innhold».</span>' : ''}
        ${o && !o.none && !g.busy ? `<p class="nw40-ingr" data-no-i18n>${esc(lead41(o.lead ?? o.ingress ?? ''))}</p>${secs}
          ${refList.length ? `<div class="nw40-refs"><span class="nw-lab">KILDER · ${refList.length}</span>${refList.map((r) => `<button type="button" class="nw40-rr" data-gl="ref" data-v="${esc(r.n)}"><span class="nw40-rn">[${esc(r.n)}]</span><span class="nw40-rt" style="background-color:#5c5850">${imgTag(r.image)}</span><span class="nw-tx"><span class="nw40-rtt" data-no-i18n>${esc(r.title)}</span><span class="nw-m"><span data-no-i18n>${esc(r.source ?? '')}</span>${r.time ? ` · ${esc(when(r.time))}` : ''}</span></span></button>`).join('')}</div>` : ''}
          <span class="nw40-foot">Laget av Glimt kl. ${esc(hm(o.updatedAt ?? new Date().toISOString()))} fra kildene du har valgt${o.local ? ' (lokalt sammendrag av titlene)' : ''}. Trykk på et tall for å lese saken.</span>` : ''}
      </div></div></div>`;
  }

  function body() {
    const d = st.data;
    if (st.error) return `<div class="nw-empty">${esc(st.error)} <button class="nw-pill" data-act="retry">Prøv igjen</button></div>`;
    if (!d) return '<div class="nw-empty">Henter nyheter …</div>';
    const items = d.items ?? [];
    const lead = d.settings?.aiSummary && d.digest?.text && st.cat === 'siste' ? d.digest.text : (items[0]?.title ?? 'Ingen saker i denne kategorien.');
    // Prompt 40: det øverste kortet «✦ GLIMT · SAMMENDRAG» er trykkbart og åpner Glimt-siden (langt sammendrag med kilder og bilder).
    const leadHtml = `<button type="button" class="nw-lead nw40-lead" data-act="gl-open"><span class="nw40-lh"><span class="nw-lab">✦ GLIMT · SAMMENDRAG</span><span class="nw-m">${items.length ? `${items.length} saker` : ''}</span></span><span class="nw-leadt">${esc(lead)}</span><span class="nw40-more">Les hele sammendraget med kilder og bilder ›</span></button>`;
    // Prompt 46: hver kategori har sitt eget sammendrag øverst (Siste beholder det felles). For deg uten interesser: hint.
    if (isFd46(st.cat) && !intList().length && !items.length) return '<div class="nw46-hint"><b>✦ For deg</b><span>Legg til interesser (f.eks. Oslo, Elbil, KI) under Nyhetsinnstillinger, så samler Glimt sakene her.</span><button type="button" class="nw-pill" data-act="nw46-set">Nyhetsinnstillinger</button></div>';
    if (st.cat !== 'siste') {
      if (!items.length) return `<div class="nw-empty">${d.feeds?.length ? 'Ingen saker i denne kategorien ennå.' : 'Ingen kilder. Legg til en RSS- eller Atom-adresse under Innstillinger → Nyheter.'}</div>`;
      return catSumHtml(items) + `<section class="nw-g nw-wide">${items.map((x) => item(x, false)).join('')}</section>`;
    }
    if (!items.length) return leadHtml + (d.feeds?.length ? '' : '<div class="nw-empty">Ingen kilder. Legg til en RSS- eller Atom-adresse under Innstillinger → Nyheter.</div>');
    if (st.cat === 'siste') {
      const groups = (d.categories ?? []).slice(1).map((c) => ({ c, items: items.filter((x) => x.category === c.id) })).filter((g) => g.items.length);
      return leadHtml + groups.map((g) => `<section class="nw-g"><div class="nw-gh">${esc(g.c.name.toUpperCase())}</div>${g.items.slice(0, 8).map((x) => item(x, false)).join('')}</section>`).join('');
    }
    return leadHtml + `<section class="nw-g nw-wide">${items.map((x) => item(x, false)).join('')}</section>`;
  }

  // Prompt 46: innstillingene vises i Innstillinger → Nyheter (settingsOnly), ikke lenger som ark i leseren.
  function setHtml() {
    const d = st.data ?? { feeds: [], settings: {} };
    const s = d.settings ?? {};
    const on = (k) => (k === 'catSummary' ? catOn46() : !!s[k]);
    const tog = (k, n, sub, i) => `<button type="button" class="nw-tog" data-tog="${k}" role="switch" aria-checked="${on(k)}" aria-pressed="${on(k)}" style="border-top:${i ? '1px solid var(--line)' : '0'}">
      <span class="nw-tx"><b>${n}</b><span>${sub}</span></span><span class="nw-sw ${on(k) ? 'on' : ''}"><span></span></span></button>`;
    const opts0 = Array.isArray(d.categoryOptions) && d.categoryOptions.length ? d.categoryOptions.map((o) => [String(o.id), o.id === 'auto' ? (s.aiCategorize ? '✦ Auto' : 'Auto') : o.name]) : [['auto', s.aiCategorize ? '✦ Auto' : 'Auto'], ...stdCats().map((c) => [c.id, c.name])];
    const opts = [...opts0, ...ccList().filter((c) => !opts0.some(([v]) => v === c.id)).map((c) => [c.id, c.name])];
    const fav = (f) => { const u = favOf(f); return `<span class="nw-ini nw46-fav" style="background:${esc(f.color)}">${esc(f.name.slice(0, 2).toUpperCase())}${u ? `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-nw-img>` : ''}</span>`; };
    const ints = intList();
    return `<div class="nw-box">${tog('aiSummary', '✦ AI-sammendrag', 'Lager en kort ingress over de viktigste sakene øverst.', 0)}${tog('catSummary', '✦ Sammendrag per kategori', 'Eget Glimt-sammendrag øverst i hver kategori (minst 3 saker).', 1)}${tog('aiCategorize', '✦ AI-kategorisering', 'Setter kategori per sak når kilden står på Auto.', 2)}</div>
      <span class="nw-lab">KATEGORIER</span>
      <div class="nw-box nw46-fd"><div class="nw46-fdh"><span class="nw46-sq lab">✦</span><span class="nw-tx"><b>For deg</b><span>Personlig fane. Glimt velger saker etter interessene dine og hva du leser.</span></span></div>
        <div class="nw46-ints">${ints.map((w, i) => `<span class="nw46-int">${esc(w)}<button type="button" data-nw46-intdel="${i}" aria-label="Fjern ${esc(w)}">×</button></span>`).join('') || '<span class="nw-hint">Ingen interesser ennå.</span>'}</div>
        ${(st.data?.suggestions46 ?? []).map((w) => (typeof w === 'string' ? w : w?.word)).filter((w) => w && !ints.some((x) => x.toLowerCase() === w.toLowerCase())).length ? `<div class="nw46-ints"><span class="nw-hint">✦ Glimt foreslår:</span>${(st.data.suggestions46).map((w) => (typeof w === 'string' ? w : w?.word)).filter((w) => w && !ints.some((x) => x.toLowerCase() === w.toLowerCase())).slice(0, 6).map((w) => `<button type="button" class="nw46-int sug" data-nw46-sug="${esc(w)}">+ ${esc(w)}</button>`).join('')}</div>` : ''}
        <form class="nw46-row" data-nw46-int><input name="nw46int" value="${esc(st.intN ?? '')}" placeholder="Legg til interesse, f.eks. Strømstad" autocomplete="off" aria-label="Ny interesse" data-glimt="off"><button type="submit">Legg til</button></form></div>
      ${ccList().length ? `<div class="nw-box">${ccList().map((c, i) => `<div class="nw-feed" style="border-top:${i ? '1px solid var(--line)' : '0'}"><span class="nw46-sq">${iconHtml(icOf(c.id) || 'lucide:tag', 18)}</span><span class="nw-tx"><b>${esc(c.name)}</b><span class="nw-url">${esc(c.keywords.join(', ') || 'Ingen nøkkelord · bare kilder med denne kategorien')}</span></span><button type="button" class="nw-x" data-nw46-ccdel="${esc(c.id)}" aria-label="Slett kategorien ${esc(c.name)}">×</button></div>`).join('')}</div>` : ''}
      <form class="nw-box nw46-cc" data-nw46-cc><b>+ Ny kategori</b><input name="nw46ccn" value="${esc(st.ccN ?? '')}" placeholder="Navn, f.eks. Strømstad" maxlength="40" autocomplete="off" aria-label="Navn på kategorien" required data-glimt="off"><input name="nw46cck" value="${esc(st.ccK ?? '')}" placeholder="Nøkkelord, kommaseparert (valgfritt)" autocomplete="off" aria-label="Nøkkelord" data-glimt="off"><button type="submit">Lag kategori</button>${st.ccErr ? `<span class="nw-hint err">${esc(st.ccErr)}</span>` : '<span class="nw-hint">En sak havner i kategorien når kilden står på den eller tittelen har et av nøkkelordene.</span>'}</form>
      ${iconSection()}
      <div class="nw-row"><span class="nw-lab">ADRESSER · ${(d.feeds ?? []).length}</span><span class="nw-hint">Velg kategori per kilde</span></div>
      <div class="nw-box">${(d.feeds ?? []).map((f, i) => { const fc = feedCat46(f); return `<div class="nw-feed" style="border-top:${i ? '1px solid var(--line)' : '0'}">
        ${fav(f)}
        <span class="nw-tx"><b>${esc(f.name)}${f.enabled ? '' : ' (av)'}</b><span class="nw-url" title="${esc(f.url)}">${esc(f.lastError ? `⚠ ${f.lastError}` : f.url)}</span></span>
        <span class="nw46-sel"><select data-nw46-cat="${f.id}" aria-label="Kategori for ${esc(f.name)}">${opts.map(([v, n]) => `<option value="${esc(v)}"${v === fc ? ' selected' : ''}>${esc(n)}</option>`).join('')}${opts.some(([v]) => v === fc) ? '' : `<option value="${esc(fc)}" selected>${esc(CAT_NAME[fc] ?? fc)}</option>`}</select><i aria-hidden="true">▾</i></span>
        <button class="nw-x" data-del="${f.id}" aria-label="Fjern ${esc(f.name)}">×</button></div>`; }).join('') || '<div class="nw-feed"><span class="nw-hint">Ingen kilder ennå.</span></div>'}</div>
      <form class="nw-add" data-add><input name="url" value="${esc(st.nf)}" placeholder="https://www.nrk.no/toppsaker.rss" autocomplete="off" inputmode="url" aria-label="Adresse til RSS eller Atom">
        <button type="submit" ${st.adding ? 'disabled' : ''}>${st.adding ? 'Leser feeden …' : '+ Legg til adresse'}</button>
        <span class="nw-hint ${st.addError ? 'err' : ''}">${esc(st.addError || (s.aiCategorize ? '✦ AI foreslår kategori for saker fra kilder på Auto. Ikonet til nettstedet hentes automatisk.' : 'Kategorien settes til Auto. Ikonet til nettstedet hentes automatisk.'))}</span></form>`;
  }

  function iconSection() {
    const x = icState();
    const rows = cats().map((c) => {
      const id = icOf(c.id), src = !(c.id in x.ic) ? 'Standard' : x.icSrc[c.id] === 'ai' ? '✦ AI' : x.ic[c.id] ? 'Valgt' : 'Ingen';
      return `<button class="nw-icr" data-ic-row="${c.id}"><span class="nw-icb">${iconHtml(id, 20)}</span>
        <span class="nw-tx"><b>${esc(c.name)}</b><span class="nw-icid">${esc(id || 'ingen ikon')}</span></span>
        <span class="nw-icsrc${src === '✦ AI' ? ' ai' : ''}">${src}</span><span class="nw-ch" aria-hidden="true">›</span></button>`;
    }).join('');
    return `<div class="nw-row"><span class="nw-lab">IKONER PÅ FANENE</span><button class="nw-link" data-act="ic-ai-all" ${st.icAll ? 'disabled' : ''}>${st.icAll ? `${glimt(14, 'tenker')} Velger …` : '✦ La AI velge alle'}</button></div>
      <div class="nw-box"><button class="nw-tog" data-act="ic-tgl" aria-pressed="${x.icOn}"><span class="nw-tx"><b>Vis ikoner</b><span>Ved siden av navnet på hver fane</span></span><span class="nw-sw ink ${x.icOn ? 'on' : ''}"><span></span></span></button>${rows}</div>
      ${st.icErr ? `<span class="nw-hint err">${esc(st.icErr)}</span>` : ''}`;
  }

  function picker() {
    const ip = st.ip;
    if (!ip) return '';
    const cur = icOf(ip.cat);
    const status = ip.busy ? 'Søker i over 200 ikonbibliotek …' : ip.err ? ip.err : ip.res ? (ip.res.length ? `${ip.res.length} av ${ip.total || ip.res.length} treff · Iconify (Lucide, Material, Phosphor, Tabler, Font Awesome …)` : 'Ingen treff. Prøv et annet engelsk ord.') : '';
    return `<div class="nw-scrim nw-ipscrim" data-act="ip-close"><div class="nw-ip" data-stop role="dialog" aria-label="Ikon for ${esc(catName(ip.cat))}">
      <div class="nw-iph">
        <div class="nw-ipt"><span></span><div><div class="nw-lab">IKON FOR</div><div class="nw-ipn">${esc(catName(ip.cat))}</div></div><button class="nw-ipx" data-act="ip-close" aria-label="Lukk">×</button></div>
        <form class="nw-ipq${ip.q ? ' has' : ''}" data-ip-form data-sf><span class="sf-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg></span>${clearBtn()}
          <input name="ipq" value="${esc(ip.q)}" placeholder="Søk etter ikon (engelsk), f.eks. football" autocomplete="off" aria-label="Søk etter ikon"><button type="submit">Søk</button></form>
        <div class="nw-iplibs">${ICON_LIBS.map(([k, n]) => `<button data-ip-lib="${k}" class="${ip.lib === k ? 'on' : ''}" aria-pressed="${ip.lib === k}">${esc(n)}</button>`).join('')}</div>
        <div class="nw-ipa"><button class="nw-ipai" data-act="ip-ai" ${ip.ai ? 'disabled' : ''}>${ip.ai ? `${glimt(14, 'tenker')} Velger …` : '✦ La AI velge'}</button><button class="nw-ipno" data-act="ip-none">Ingen ikon</button></div>
        <span class="nw-hint">${esc(status)}</span></div>
      <div class="nw-ipg">${(ip.res ?? []).map((id) => `<button data-ip-pick="${esc(id)}" title="${esc(id)}" class="${id === cur ? 'on' : ''}">${iconHtml(id, 26)}</button>`).join('')}</div>
    </div></div>`;
  }

  function render() {
    const d = st.data;
    if (SO) {
      const keepSo = el.querySelector('.nw-ipg')?.scrollTop ?? 0, act = document.activeElement, fn = el.contains(act) ? act.name : null, pos = fn ? act.selectionStart : null;
      el.innerHTML = `<div class="nw46-in">${d ? setHtml() : st.error ? `<div class="nw-empty">${esc(st.error)} <button class="nw-pill" data-act="retry">Prøv igjen</button></div>` : '<div class="nw-empty">Henter nyhetsinnstillingene …</div>'}</div>${picker()}`;
      const g2 = el.querySelector('.nw-ipg'); if (g2) g2.scrollTop = keepSo;
      if (fn) { const n2 = el.querySelector(`[name="${fn}"]`); if (n2) { n2.focus({ preventScroll: true }); try { n2.setSelectionRange(pos, pos); } catch { /* */ } } }
      return;
    }
    const keepArt = el.querySelector('.nw-art-body')?.scrollTop ?? 0, keepScroll = el.querySelector('.nw-body')?.scrollTop ?? 0, keepSheet = el.querySelector('.nw-sheet')?.scrollTop ?? 0, keepIp = el.querySelector('.nw-ipg')?.scrollTop ?? 0;
    const focus = document.activeElement?.name === 'ipq' ? document.activeElement.selectionStart : null;
    const keepGl = el.querySelector('.nw40-gb')?.scrollTop ?? 0;
    el.innerHTML = `<div class="nw-card">
      <div class="nw-head"><div class="nw-hl">
        <button class="nw-back" data-act="close">${opts.backLabel ?? '‹ Tilbake'}</button>
        <div><div class="nw-lab">NYHETSLESER · ${d?.feeds?.length ?? 0} KILDER${d?.updatedAt ? ` · OPPDATERT ${hm(d.updatedAt)}` : ''}</div><h2 class="nw-title">Siste nytt</h2></div></div>
        <div class="nw-hr"><button class="nw-ic" data-act="refresh" aria-label="Oppdater" title="Oppdater" ${st.busy ? 'disabled' : ''}>↻</button><span class="nw46-mw"><button class="nw-ic" data-act="nw46-more" aria-label="Mer" title="Mer" aria-haspopup="menu" aria-expanded="${!!st.more}">⋯</button>${st.more ? '<div class="nw46-menu" role="menu"><button type="button" role="menuitem" data-act="nw46-set">⚙ Nyhetsinnstillinger</button></div>' : ''}</span></div></div>
      <nav class="nw-tabs">${cats().map((c) => `<button data-cat="${c.id}" class="${c.id === st.cat ? 'on' : ''}">${icState().icOn ? iconHtml(icOf(c.id), 16) : ''}${esc(c.name)}</button>`).join('')}</nav>
      <div class="nw-body">${body()}</div>
      ${glView()}${artView()}${picker()}</div>`;
    const gb = el.querySelector('.nw40-gb'); if (gb) gb.scrollTop = keepGl;
    const b = el.querySelector('.nw-body');
    if (b) b.scrollTop = keepScroll;
    const sh = el.querySelector('.nw-sheet'); if (sh) sh.scrollTop = keepSheet;
    const ab = el.querySelector('.nw-art-body'); if (ab) ab.scrollTop = keepArt;
    const g = el.querySelector('.nw-ipg'); if (g) g.scrollTop = keepIp;
    if (focus != null) { const q = el.querySelector('[name=ipq]'); q?.focus(); q?.setSelectionRange(focus, focus); }
  }

  el.addEventListener('click', async (e) => {
    if (await glClick(e)) return;
    // Prompt 46: ⋯-menyen, «Nyhetsinnstillinger» (dyp lenke til Innstillinger → Nyheter), kategorier og interesser.
    if (st.more && !e.target.closest('.nw46-mw')) { st.more = false; render(); }
    const sg46 = e.target.closest('[data-nw46-sug]');
    if (sg46) return setInts([...intList(), sg46.dataset.nw46Sug]);
    const t46 = e.target.closest('[data-nw46-intdel],[data-nw46-ccdel]');
    if (t46) { if (t46.dataset.nw46Intdel !== undefined) return setInts(intList().filter((_, i) => i !== +t46.dataset.nw46Intdel)); return delCC(t46.dataset.nw46Ccdel); }
    const a46 = e.target.closest('[data-act="nw46-more"],[data-act="nw46-set"]')?.dataset.act;
    if (a46 === 'nw46-more') { st.more = !st.more; return render(); }
    if (a46 === 'nw46-set') { st.more = false; const cat = st.cat; close(); window.__nw46Back = { cat }; document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'nyheter' })); return; }
    const t = e.target.closest('[data-act],[data-cat],[data-tog],[data-cyc],[data-del],[data-ic-row],[data-ip-lib],[data-ip-pick],[data-art]');
    if (!t) { if (!SO && backdropClick(e, el)) close(); return; }
    if (t.dataset.act === 'ip-close' && e.target.closest('.nw-ip') && !e.target.closest('.nw-ipx')) return;
    const act = t.dataset.act;
    if (t.dataset.art) { const x = findItem(t.dataset.art); if (x) openArt(x); return; }
    if (act === 'art-close') { st.art = null; return render(); }
    if (act === 'art-share') {
      const x = st.art?.x; if (!x) return;
      if (navigator.share) { navigator.share({ title: x.title, url: x.url }).catch(() => {}); return; }
      try { await navigator.clipboard.writeText(x.url); } catch { /* ingen utklippstavle */ }
      st.art.shared = true; render(); return;
    }
    if (act === 'ip-close') { st.ip = null; return render(); }
    if (act === 'ic-tgl') return saveIcons({ icOn: !icState().icOn });
    if (act === 'ic-ai-all') {
      st.icAll = true; render();
      for (const c of cats()) await aiPick(c.id, '');
      st.icAll = false; return render();
    }
    if (t.dataset.icRow) { const id = t.dataset.icRow; st.ip = { cat: id, q: keywordFor(catName(id)), lib: st.ip?.lib ?? '', res: null, total: 0, busy: false, err: '', ai: false }; render(); return ipSearch(); }
    if (t.dataset.ipLib !== undefined) { st.ip.lib = t.dataset.ipLib; return ipSearch(); }
    if (t.dataset.ipPick) { const id = st.ip.cat; st.ip = null; return setIcon(id, t.dataset.ipPick, 'pick'); }
    if (act === 'ip-ai') { const ip = st.ip; ip.ai = true; render(); const r = await aiPick(ip.cat, ip.lib); if (st.ip === ip) { if (r) st.ip = null; else { ip.ai = false; ip.err = 'Fant ikke noe ikon. Søk selv.'; } } return render(); }
    if (act === 'ip-none') { const id = st.ip.cat; st.ip = null; return setIcon(id, '', 'pick'); }
    if (act === 'close') return close();
    if (act === 'retry') return load();
    if (act === 'refresh') {
      st.busy = true; render();
      try { await api('/rss/refresh', { method: 'POST' }); } catch (er) { st.error = er.message; }
      st.busy = false; return load();
    }
    if (t.dataset.cat) { st.cat = t.dataset.cat; st.data = st.data && { ...st.data, items: null }; render(); return load(); }
    if (t.dataset.tog) {
      const k = t.dataset.tog, v = k === 'catSummary' ? !catOn46() : !st.data?.settings?.[k];
      try { const s = await api('/rss/settings', { method: 'PUT', json: { [k]: v } }); st.data.settings = { ...st.data.settings, ...s, ...(k in (s ?? {}) ? {} : { [k]: v }) }; } catch (er) { st.addError = er.message; }
      if (k === 'catSummary') saveLoc46({ ...loc46(), catSummary: v });
      render(); document.dispatchEvent(new Event('hl:news-settings')); return load();
    }
    if (t.dataset.cyc) {
      const f = st.data.feeds.find((x) => String(x.id) === t.dataset.cyc);
      const next = CYCLE[(CYCLE.indexOf(f.category) + 1) % CYCLE.length];
      try { const r = await api(`/rss/feeds/${f.id}`, { method: 'PATCH', json: { category: next } }); st.data.feeds = r.feeds; } catch (er) { st.addError = er.message; }
      render(); return load();
    }
    if (t.dataset.del) {
      try { const r = await api(`/rss/feeds/${t.dataset.del}`, { method: 'DELETE' }); st.data.feeds = r.feeds; } catch (er) { st.addError = er.message; }
      render(); document.dispatchEvent(new Event('hl:news-settings')); return load();
    }
  });
  el.addEventListener('input', (e) => { if (e.target.name === 'url') st.nf = e.target.value; if (e.target.name === 'ipq' && st.ip) st.ip.q = e.target.value; if (e.target.name === 'nw46int') st.intN = e.target.value; if (e.target.name === 'nw46ccn') st.ccN = e.target.value; if (e.target.name === 'nw46cck') st.ccK = e.target.value; });
  // Prompt 46: kategori per kilde som ekte nedtrekksmeny. Lagres med en gang; egen kategori lagres lokalt hvis serveren ikke kjenner den.
  el.addEventListener('change', async (e) => {
    const sel = e.target.closest?.('[data-nw46-cat]'); if (!sel) return;
    const f = st.data?.feeds?.find((x) => String(x.id) === sel.dataset.nw46Cat); if (!f) return;
    const v = sel.value, cur = loc46(), fc = { ...(cur.feedCat ?? {}) };
    try { const r = await api(`/rss/feeds/${f.id}`, { method: 'PATCH', json: { category: v } }); st.data.feeds = r.feeds ?? st.data.feeds; delete fc[f.id]; st.addError = ''; }
    catch (er) { if (isCC46(v) && (er.status === 400 || er.status === 404)) { fc[f.id] = v; st.addError = ''; } else st.addError = er.message; }
    saveLoc46({ ...cur, feedCat: fc });
    render(); document.dispatchEvent(new Event('hl:news-settings'));
  });
  // Bilder som ikke lar seg laste fjernes, så kildefarge og initialer vises.
  el.addEventListener('error', (e) => { if (e.target?.matches?.('[data-nw-img]')) e.target.remove(); }, true);
  el.addEventListener('sf:clear', () => { if (st.ip) { st.ip.seq = (st.ip.seq ?? 0) + 1; st.ip.res = null; st.ip.busy = false; render(); el.querySelector('[name=ipq]')?.focus(); } });
  el.addEventListener('submit', async (e) => {
    if (e.target.matches('[data-ip-form]')) { e.preventDefault(); return ipSearch(); }
    if (e.target.matches('[data-nw46-int]')) { e.preventDefault(); const w = String(st.intN ?? '').trim(); if (!w || intList().some((x) => x.toLowerCase() === w.toLowerCase())) return; st.intN = ''; return setInts([...intList(), w]); }
    if (e.target.matches('[data-nw46-cc]')) { e.preventDefault(); return addCC(String(st.ccN ?? ''), String(st.ccK ?? '')); }
    if (!e.target.matches('[data-add]')) return;
    e.preventDefault();
    const url = st.nf.trim();
    if (!url) return;
    st.adding = true; st.addError = ''; render();
    try { await api('/rss/feeds', { method: 'POST', json: { url } }); st.nf = ''; } catch (er) { st.addError = er.message; }
    st.adding = false;
    await load();
    document.dispatchEvent(new Event('hl:news-settings'));
    el.querySelector('.nw-add input')?.focus();
  });

  render();
  if (!SO) el.focus();
  load();
  if (!SO) open = el;
  return el;
}

export const closeNews = () => open?.querySelector('[data-act="close"]')?.click();

/* Prompt 41 (claude-code-nyhet-oppsummering-bredde.md): temaord med stor forbokstav der det er egennavn, listet naturlig
   («Mest om norge og oslo og økonomi.» → «Mest om Norge, Oslo og økonomi.»). */
const PROPER41 = ['norge', 'oslo', 'bergen', 'trondheim', 'stavanger', 'tromsø', 'sverige', 'danmark', 'finland', 'europa', 'usa', 'kina', 'russland', 'ukraina', 'israel', 'gaza', 'nato', 'eu', 'fn', 'stortinget', 'viken', 'akershus', 'toten', 'strømstad'];
const UPPER41 = new Set(['usa', 'nato', 'eu', 'fn']);
function lead41(t) {
  return String(t ?? '').replace(/(Mest om )([^.!?]+)([.!?]?)/i, (_, pre, list, end) => {
    const parts = list.split(/\s*,\s*|\s+og\s+/).map((w) => w.trim()).filter(Boolean).map((w) => (PROPER41.includes(w.toLowerCase()) ? (UPPER41.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)) : w));
    if (parts.length < 2) return pre + parts.join('') + end;
    return `${pre}${parts.slice(0, -1).join(', ')} og ${parts.at(-1)}${end || '.'}`;
  });
}

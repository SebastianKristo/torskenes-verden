// Felles nyhetsleser (prompt 13, design/Nyhetsleser.dc.html, variant web). Åpnes fra «SISTE NYTT ›» i nyhetsbaren
// både i Homelab v2 og i «Vindu og papir» (2c): import('/assets/js/news.js').then((m) => m.openNews()).
// Kilder og ✦ AI-valg lagres på serveren (/api/rss), så de er de samme i Papir-appen og PWA-en.
import { api, esc, backdropClick } from './util.js';
import { ICON_LIBS, iconHtml, searchIcons, suggestIcon, keywordFor, preloadIcons } from './icons.js';

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

const CAT_NAME = { auto: 'Auto', siste: 'Siste', norge: 'Norge', verden: 'Verden', okonomi: 'Økonomi', sport: 'Sport', teknologi: 'Teknologi', kultur: 'Kultur' };
// Standardikonene på fanene (Nyhetsleser.dc.html). Serveren sender de samme som iconDefaults.
const IC_DEF = { siste: 'lucide:zap', norge: 'lucide:mountain-snow', verden: 'lucide:globe', okonomi: 'lucide:trending-up', sport: 'lucide:trophy', teknologi: 'lucide:cpu', kultur: 'lucide:drama' };
// Prompt 24: faneikonene forhåndslastes (standard, lagrede og serverens), så de vises med en gang leseren åpnes.
const icIds = (d) => { const s = d?.settings ?? {}, loc = 'icOn' in s ? null : readLocal(); return [...Object.values(d?.iconDefaults ?? IC_DEF), ...Object.values(('icOn' in s ? s.ic : loc?.ic) ?? {})]; };
export async function preloadNewsIcons() {
  preloadIcons(icIds(null));
  try { return await preloadIcons(icIds(await api('/rss?limit=1'))); } catch { return []; }
}
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
const gear = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/></svg>';

let open = null;

/**
 * Åpner nyhetsleseren som et lag over siden.
 * opts.theme: 'web' (mørk, Homelab v2), 'paper' (lys papir, 2c) eller 'paperDark'. Standard: 2c gir papir, ellers web.
 * opts.cat: kategori å starte på. opts.onClose: kalles når leseren lukkes.
 */
export function openNews(opts = {}) {
  if (open) { open.focus(); return open; }
  ensureCss();
  const root = document.documentElement;
  const paper = root.dataset.hlTheme === '2c' || document.body.classList.contains('theme-2c');
  const theme = opts.theme ?? (paper ? (matchMedia('(prefers-color-scheme: dark)').matches && root.dataset.paperMode !== 'lys' ? 'paperDark' : 'paper') : 'web');
  const st = { cat: opts.cat ?? 'siste', data: null, error: '', set: false, nf: '', busy: false, adding: false, addError: '', ip: null, icAll: false, icErr: '' };

  const el = document.createElement('div');
  el.className = `nw nw-${theme}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Nyhetsleser');
  el.tabIndex = -1;
  document.body.append(el);
  document.body.classList.add('nw-open');

  const close = () => {
    el.remove();
    document.body.classList.remove('nw-open');
    document.removeEventListener('keydown', onKey);
    open = null;
    opts.onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') { if (st.ip) { st.ip = null; render(); } else if (st.set) { st.set = false; render(); } else close(); } };
  document.addEventListener('keydown', onKey);

  // Bare svaret på siste forespørsel brukes, så et tregt førstekall ikke overskriver en kategori som er valgt etterpå.
  let seq = 0;
  async function load() {
    const n = ++seq;
    let data = null, error = '';
    try { data = await api(`/rss?cat=${encodeURIComponent(st.cat)}&limit=60`); }
    catch (e) { error = e.message || 'Kunne ikke hente nyheter'; }
    if (n !== seq || !el.isConnected) return;
    st.error = error;
    if (data) { st.data = data; preloadIcons(icIds(data)); }
    render();
  }

  /* ---------- Ikoner på fanene (prompt 23) ---------- */
  const icState = () => {
    const s = st.data?.settings ?? {};
    const srv = 'icOn' in s, loc = srv ? null : readLocal();
    return { ic: (srv ? s.ic : loc?.ic) ?? {}, icSrc: (srv ? s.icSrc : loc?.icSrc) ?? {}, icOn: (srv ? s.icOn : loc?.icOn) !== false };
  };
  const icOf = (id) => { const x = icState(); return id in x.ic ? x.ic[id] : (st.data?.iconDefaults ?? IC_DEF)[id] ?? ''; };
  const cats = () => st.data?.categories ?? Object.keys(CAT_NAME).slice(1).map((id) => ({ id, name: CAT_NAME[id] }));
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
  async function aiPick(id, lib) {
    const icon = await suggestIcon(CAT_NAME[id] ?? id, lib).catch(() => null);
    if (icon) await setIcon(id, icon, 'ai');
    return icon;
  }

  const item = (x, showCat) => `<a class="nw-it" href="${esc(x.url ?? '#')}" target="_blank" rel="noopener noreferrer">
      ${showCat ? `<span class="nw-cat">${esc((CAT_NAME[x.category] ?? x.category).toUpperCase())}</span>` : ''}
      <span class="nw-tx"><span class="nw-t">${esc(x.title)}</span><span class="nw-m">${esc(x.feed)} · ${esc(when(x.published))}${x.ai ? ' · ✦ AI' : ''}</span></span>
      <span class="nw-ch" aria-hidden="true">›</span></a>`;

  function body() {
    const d = st.data;
    if (st.error) return `<div class="nw-empty">${esc(st.error)} <button class="nw-pill" data-act="retry">Prøv igjen</button></div>`;
    if (!d) return '<div class="nw-empty">Henter nyheter …</div>';
    const items = d.items ?? [];
    const lead = d.settings?.aiSummary && d.digest?.text && st.cat === 'siste' ? d.digest.text : (items[0]?.title ?? 'Ingen saker i denne kategorien.');
    const leadHtml = `<div class="nw-lead">${d.settings?.aiSummary && d.digest?.text && st.cat === 'siste' ? '<span class="nw-lab">✦ AI-SAMMENDRAG</span>' : ''}<div class="nw-leadt">${esc(lead)}</div></div>`;
    if (!items.length) return leadHtml + (d.feeds?.length ? '' : '<div class="nw-empty">Ingen kilder. Legg til en RSS- eller Atom-adresse under tannhjulet.</div>');
    if (st.cat === 'siste') {
      const groups = (d.categories ?? []).slice(1).map((c) => ({ c, items: items.filter((x) => x.category === c.id) })).filter((g) => g.items.length);
      return leadHtml + groups.map((g) => `<section class="nw-g"><div class="nw-gh">${esc(g.c.name.toUpperCase())}</div>${g.items.slice(0, 8).map((x) => item(x, false)).join('')}</section>`).join('');
    }
    return leadHtml + `<section class="nw-g nw-wide">${items.map((x) => item(x, false)).join('')}</section>`;
  }

  function sheet() {
    const d = st.data ?? { feeds: [], settings: {} };
    const s = d.settings ?? {};
    const tog = (k, n, sub, i) => `<button class="nw-tog" data-tog="${k}" aria-pressed="${!!s[k]}" style="border-top:${i ? '1px solid var(--line)' : '0'}">
      <span class="nw-tx"><b>${n}</b><span>${sub}</span></span><span class="nw-sw ${s[k] ? 'on' : ''}"><span></span></span></button>`;
    return `<div class="nw-scrim" data-act="set-close"><div class="nw-sheet" data-stop>
      <div class="nw-sh"><div><div class="nw-lab">NYHETSLESER</div><div class="nw-st">Kilder og AI</div></div><button class="nw-done" data-act="set-close">Ferdig</button></div>
      <div class="nw-box">${tog('aiSummary', '✦ AI-sammendrag', 'Lager en kort ingress over de viktigste sakene øverst.', 0)}${tog('aiCategorize', '✦ AI-kategorisering', 'Setter kategori per sak når kilden står på Auto.', 1)}</div>
      ${iconSection()}
      <div class="nw-row"><span class="nw-lab">ADRESSER · ${(d.feeds ?? []).length}</span><span class="nw-hint">Trykk på kategorien for å endre</span></div>
      <div class="nw-box">${(d.feeds ?? []).map((f, i) => `<div class="nw-feed" style="border-top:${i ? '1px solid var(--line)' : '0'}">
        <span class="nw-ini" style="background:${esc(f.color)}">${esc(f.name.slice(0, 2).toUpperCase())}</span>
        <span class="nw-tx"><b>${esc(f.name)}${f.enabled ? '' : ' (av)'}</b><span class="nw-url" title="${esc(f.url)}">${esc(f.lastError ? `⚠ ${f.lastError}` : f.url)}</span></span>
        <button class="nw-pill" data-cyc="${f.id}">${f.category === 'auto' && s.aiCategorize ? '✦ ' : ''}${esc(CAT_NAME[f.category] ?? f.category)} ▾</button>
        <button class="nw-x" data-del="${f.id}" aria-label="Fjern ${esc(f.name)}">×</button></div>`).join('') || '<div class="nw-feed"><span class="nw-hint">Ingen kilder ennå.</span></div>'}</div>
      <form class="nw-add" data-add><input name="url" value="${esc(st.nf)}" placeholder="https://www.nrk.no/toppsaker.rss" autocomplete="off" inputmode="url">
        <button type="submit" ${st.adding ? 'disabled' : ''}>${st.adding ? 'Leser feeden …' : '+ Legg til adresse'}</button>
        <span class="nw-hint ${st.addError ? 'err' : ''}">${esc(st.addError || (s.aiCategorize ? '✦ AI foreslår kategori for saker fra kilder på Auto.' : 'Kategorien settes til Auto.'))}</span></form>
    </div></div>`;
  }

  function iconSection() {
    const x = icState();
    const rows = cats().map((c) => {
      const id = icOf(c.id), src = !(c.id in x.ic) ? 'Standard' : x.icSrc[c.id] === 'ai' ? '✦ AI' : x.ic[c.id] ? 'Valgt' : 'Ingen';
      return `<button class="nw-icr" data-ic-row="${c.id}"><span class="nw-icb">${iconHtml(id, 20)}</span>
        <span class="nw-tx"><b>${esc(c.name)}</b><span class="nw-icid">${esc(id || 'ingen ikon')}</span></span>
        <span class="nw-icsrc${src === '✦ AI' ? ' ai' : ''}">${src}</span><span class="nw-ch" aria-hidden="true">›</span></button>`;
    }).join('');
    return `<div class="nw-row"><span class="nw-lab">IKONER PÅ FANENE</span><button class="nw-link" data-act="ic-ai-all" ${st.icAll ? 'disabled' : ''}>${st.icAll ? '✦ Velger …' : '✦ La AI velge alle'}</button></div>
      <div class="nw-box"><button class="nw-tog" data-act="ic-tgl" aria-pressed="${x.icOn}"><span class="nw-tx"><b>Vis ikoner</b><span>Ved siden av navnet på hver fane</span></span><span class="nw-sw ink ${x.icOn ? 'on' : ''}"><span></span></span></button>${rows}</div>
      ${st.icErr ? `<span class="nw-hint err">${esc(st.icErr)}</span>` : ''}`;
  }

  function picker() {
    const ip = st.ip;
    if (!ip) return '';
    const cur = icOf(ip.cat);
    const status = ip.busy ? 'Søker i over 200 ikonbibliotek …' : ip.err ? ip.err : ip.res ? (ip.res.length ? `${ip.res.length} av ${ip.total || ip.res.length} treff · Iconify (Lucide, Material, Phosphor, Tabler, Font Awesome …)` : 'Ingen treff. Prøv et annet engelsk ord.') : '';
    return `<div class="nw-scrim nw-ipscrim" data-act="ip-close"><div class="nw-ip" data-stop role="dialog" aria-label="Ikon for ${esc(CAT_NAME[ip.cat] ?? ip.cat)}">
      <div class="nw-iph">
        <div class="nw-ipt"><span></span><div><div class="nw-lab">IKON FOR</div><div class="nw-ipn">${esc(CAT_NAME[ip.cat] ?? ip.cat)}</div></div><button class="nw-ipx" data-act="ip-close" aria-label="Lukk">×</button></div>
        <form class="nw-ipq" data-ip-form><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
          <input name="ipq" value="${esc(ip.q)}" placeholder="Søk etter ikon (engelsk), f.eks. football" autocomplete="off" aria-label="Søk etter ikon"><button type="submit">Søk</button></form>
        <div class="nw-iplibs">${ICON_LIBS.map(([k, n]) => `<button data-ip-lib="${k}" class="${ip.lib === k ? 'on' : ''}" aria-pressed="${ip.lib === k}">${esc(n)}</button>`).join('')}</div>
        <div class="nw-ipa"><button class="nw-ipai" data-act="ip-ai" ${ip.ai ? 'disabled' : ''}>${ip.ai ? '✦ Velger …' : '✦ La AI velge'}</button><button class="nw-ipno" data-act="ip-none">Ingen ikon</button></div>
        <span class="nw-hint">${esc(status)}</span></div>
      <div class="nw-ipg">${(ip.res ?? []).map((id) => `<button data-ip-pick="${esc(id)}" title="${esc(id)}" class="${id === cur ? 'on' : ''}">${iconHtml(id, 26)}</button>`).join('')}</div>
    </div></div>`;
  }

  function render() {
    const d = st.data;
    const keepScroll = el.querySelector('.nw-body')?.scrollTop ?? 0, keepSheet = el.querySelector('.nw-sheet')?.scrollTop ?? 0, keepIp = el.querySelector('.nw-ipg')?.scrollTop ?? 0;
    const focus = document.activeElement?.name === 'ipq' ? document.activeElement.selectionStart : null;
    el.innerHTML = `<div class="nw-card">
      <div class="nw-head"><div class="nw-hl">
        <button class="nw-back" data-act="close">${opts.backLabel ?? '‹ Tilbake'}</button>
        <div><div class="nw-lab">NYHETSLESER · ${d?.feeds?.length ?? 0} KILDER${d?.updatedAt ? ` · OPPDATERT ${hm(d.updatedAt)}` : ''}</div><h2 class="nw-title">Siste nytt</h2></div></div>
        <div class="nw-hr"><button class="nw-ic" data-act="refresh" aria-label="Oppdater" title="Oppdater" ${st.busy ? 'disabled' : ''}>↻</button><button class="nw-ic" data-act="set-open" aria-label="Kilder og AI" title="Kilder og AI">${gear}</button></div></div>
      <nav class="nw-tabs">${cats().map((c) => `<button data-cat="${c.id}" class="${c.id === st.cat ? 'on' : ''}">${icState().icOn ? iconHtml(icOf(c.id), 16) : ''}${esc(c.name)}</button>`).join('')}</nav>
      <div class="nw-body">${body()}</div>
      ${st.set ? sheet() : ''}${picker()}</div>`;
    const b = el.querySelector('.nw-body');
    if (b) b.scrollTop = keepScroll;
    const sh = el.querySelector('.nw-sheet'); if (sh) sh.scrollTop = keepSheet;
    const g = el.querySelector('.nw-ipg'); if (g) g.scrollTop = keepIp;
    if (focus != null) { const q = el.querySelector('[name=ipq]'); q?.focus(); q?.setSelectionRange(focus, focus); }
  }

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-cat],[data-tog],[data-cyc],[data-del],[data-ic-row],[data-ip-lib],[data-ip-pick]');
    if (!t) { if (backdropClick(e, el)) close(); return; }
    if (t.dataset.act === 'set-close' && e.target.closest('[data-stop]') && !e.target.closest('.nw-done')) return;
    if (t.dataset.act === 'ip-close' && e.target.closest('.nw-ip') && !e.target.closest('.nw-ipx')) return;
    const act = t.dataset.act;
    if (act === 'ip-close') { st.ip = null; return render(); }
    if (act === 'ic-tgl') return saveIcons({ icOn: !icState().icOn });
    if (act === 'ic-ai-all') {
      st.icAll = true; render();
      for (const c of cats()) await aiPick(c.id, '');
      st.icAll = false; return render();
    }
    if (t.dataset.icRow) { const id = t.dataset.icRow; st.ip = { cat: id, q: keywordFor(CAT_NAME[id] ?? id), lib: st.ip?.lib ?? '', res: null, total: 0, busy: false, err: '', ai: false }; render(); return ipSearch(); }
    if (t.dataset.ipLib !== undefined) { st.ip.lib = t.dataset.ipLib; return ipSearch(); }
    if (t.dataset.ipPick) { const id = st.ip.cat; st.ip = null; return setIcon(id, t.dataset.ipPick, 'pick'); }
    if (act === 'ip-ai') { const ip = st.ip; ip.ai = true; render(); const r = await aiPick(ip.cat, ip.lib); if (st.ip === ip) { if (r) st.ip = null; else { ip.ai = false; ip.err = 'Fant ikke noe ikon. Søk selv.'; } } return render(); }
    if (act === 'ip-none') { const id = st.ip.cat; st.ip = null; return setIcon(id, '', 'pick'); }
    if (act === 'close') return close();
    if (act === 'retry') return load();
    if (act === 'set-open') { st.set = true; return render(); }
    if (act === 'set-close') { st.set = false; return render(); }
    if (act === 'refresh') {
      st.busy = true; render();
      try { await api('/rss/refresh', { method: 'POST' }); } catch (er) { st.error = er.message; }
      st.busy = false; return load();
    }
    if (t.dataset.cat) { st.cat = t.dataset.cat; st.data = st.data && { ...st.data, items: null }; render(); return load(); }
    if (t.dataset.tog) {
      const k = t.dataset.tog, v = !st.data?.settings?.[k];
      try { const s = await api('/rss/settings', { method: 'PUT', json: { [k]: v } }); st.data.settings = s; } catch (er) { st.addError = er.message; }
      render(); return load();
    }
    if (t.dataset.cyc) {
      const f = st.data.feeds.find((x) => String(x.id) === t.dataset.cyc);
      const next = CYCLE[(CYCLE.indexOf(f.category) + 1) % CYCLE.length];
      try { const r = await api(`/rss/feeds/${f.id}`, { method: 'PATCH', json: { category: next } }); st.data.feeds = r.feeds; } catch (er) { st.addError = er.message; }
      render(); return load();
    }
    if (t.dataset.del) {
      try { const r = await api(`/rss/feeds/${t.dataset.del}`, { method: 'DELETE' }); st.data.feeds = r.feeds; } catch (er) { st.addError = er.message; }
      render(); return load();
    }
  });
  el.addEventListener('input', (e) => { if (e.target.name === 'url') st.nf = e.target.value; if (e.target.name === 'ipq' && st.ip) st.ip.q = e.target.value; });
  el.addEventListener('submit', async (e) => {
    if (e.target.matches('[data-ip-form]')) { e.preventDefault(); return ipSearch(); }
    if (!e.target.matches('[data-add]')) return;
    e.preventDefault();
    const url = st.nf.trim();
    if (!url) return;
    st.adding = true; st.addError = ''; render();
    try { await api('/rss/feeds', { method: 'POST', json: { url } }); st.nf = ''; } catch (er) { st.addError = er.message; }
    st.adding = false;
    await load();
    el.querySelector('.nw-add input')?.focus();
  });

  render();
  el.focus();
  load();
  open = el;
  return el;
}

export const closeNews = () => open?.querySelector('[data-act="close"]')?.click();

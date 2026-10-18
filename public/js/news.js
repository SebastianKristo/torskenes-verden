// Felles nyhetsleser (prompt 13, design/Nyhetsleser.dc.html, variant web). Åpnes fra «SISTE NYTT ›» i nyhetsbaren
// både i Homelab v2 og i «Vindu og papir» (2c): import('/assets/js/news.js').then((m) => m.openNews()).
// Kilder og ✦ AI-valg lagres på serveren (/api/rss), så de er de samme i Papir-appen og PWA-en.
import { api, esc, backdropClick } from './util.js';

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
  const st = { cat: opts.cat ?? 'siste', data: null, error: '', set: false, nf: '', busy: false, adding: false, addError: '' };

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
  const onKey = (e) => { if (e.key === 'Escape') { if (st.set) { st.set = false; render(); } else close(); } };
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
    if (data) st.data = data;
    render();
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

  function render() {
    const d = st.data;
    const keepScroll = el.querySelector('.nw-body')?.scrollTop ?? 0;
    el.innerHTML = `<div class="nw-card">
      <div class="nw-head"><div class="nw-hl">
        <button class="nw-back" data-act="close">${opts.backLabel ?? '‹ Tilbake'}</button>
        <div><div class="nw-lab">NYHETSLESER · ${d?.feeds?.length ?? 0} KILDER${d?.updatedAt ? ` · OPPDATERT ${hm(d.updatedAt)}` : ''}</div><h2 class="nw-title">Siste nytt</h2></div></div>
        <div class="nw-hr"><button class="nw-ic" data-act="refresh" aria-label="Oppdater" title="Oppdater" ${st.busy ? 'disabled' : ''}>↻</button><button class="nw-ic" data-act="set-open" aria-label="Kilder og AI" title="Kilder og AI">${gear}</button></div></div>
      <nav class="nw-tabs">${(d?.categories ?? Object.keys(CAT_NAME).slice(1).map((id) => ({ id, name: CAT_NAME[id] }))).map((c) => `<button data-cat="${c.id}" class="${c.id === st.cat ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</nav>
      <div class="nw-body">${body()}</div>
      ${st.set ? sheet() : ''}</div>`;
    const b = el.querySelector('.nw-body');
    if (b) b.scrollTop = keepScroll;
  }

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-cat],[data-tog],[data-cyc],[data-del]');
    if (!t) { if (backdropClick(e, el)) close(); return; }
    if (t.dataset.act === 'set-close' && e.target.closest('[data-stop]') && !e.target.closest('.nw-done')) return;
    const act = t.dataset.act;
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
  el.addEventListener('input', (e) => { if (e.target.name === 'url') st.nf = e.target.value; });
  el.addEventListener('submit', async (e) => {
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

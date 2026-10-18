// Finn-handler på PC: listen med sammendrag per handel, og detaljsiden med fire kort
// (Annonsen, Original kvittering, E-poster i handelen, Bilder). Klikk på en handel for å åpne den.
import { S, api, esc, n0, dd, render, toast } from './core.js';

const u = S.ui;
const kr0 = (v) => `${n0(v)} kr`;
const skel = (h = 160) => `<div class="skel" style="min-height:${h}px"></div>`;
const card = (inner, style = '') => `<section class="card" style="${style}">${inner}</section>`;
const extOf = (n) => (String(n).split('.').pop() || '').slice(0, 4).toUpperCase();
const kb = (b) => `${Math.max(1, Math.round((b ?? 0) / 1024))} kB`;

// Egen stilfil for Finn-sidene (lastes én gang).
if (!document.querySelector('link[data-finn-css]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/assets/finans/css/finn.css'; l.dataset.finnCss = '';
  document.head.append(l);
}

export const loadFinn = async () => {
  S.finn = await api('/finn');
  if (u.finnSel && S.finn.items.some((x) => x.id === u.finnSel)) S.finnDeal = await api(`/finn/${u.finnSel}`).catch(() => null);
  else { u.finnSel = null; S.finnDeal = null; }
};

function track(d, clickable) {
  return `<div class="fd-track">${d.track.map((s, i) => `<button ${clickable ? `data-fd-stage="${i + 1}"` : 'disabled'} class="${s.done ? 'on' : ''}${s.cur ? ' cur' : ''}${i === 3 ? ' last' : ''}${i + 1 < d.stage ? ' nx' : ''}" title="Sett steget til ${esc(s.t)}">
    <span class="dl"><span class="dot"></span><span class="ln" style="${i + 1 < d.stage ? 'background:#F2F2F4' : ''}"></span></span><span class="t">${esc(s.t)}</span></button>`).join('')}</div>`;
}

function row(r) {
  const sold = r.role === 'sold', sel = u.finnSel === r.id;
  return `<div class="card finn-row fd-row${sel ? ' fd-on' : ''}" data-fd-open="${r.id}" role="button" tabindex="0" aria-expanded="${sel}">
    <div><span class="role ${sold ? 'sold' : 'bought'}">${sold ? 'Solgt' : 'Kjøpt'}</span><b style="display:block;font-weight:500;margin-top:6px">${esc(r.item)}</b><span class="note" style="font-size:12px">${esc(r.counterpart)}${r.counterpart ? ' · ' : ''}${dd(r.date)}${r.txId ? ' · matchet mot bankpost' : ''}</span>
      ${r.summary?.text ? `<span class="fd-att">${esc(r.summary.text)}</span>` : ''}</div>
    <div class="finn-steps">${r.track.map((s) => `<span class="step${s.done ? ' done' : ''}"${s.cur ? ' style="background:rgba(255,122,61,.14);color:#FFB08A"' : ''}>${esc(s.t)}</span>`).join('')}</div>
    <b class="mono" style="text-align:right;color:${sold ? 'var(--pos)' : 'var(--text)'}">${sold ? '+' : '−'}${n0(r.amount)} kr</b><button class="x-btn sm" data-fd-del="${r.id}" aria-label="Slett handelen">×</button></div>`;
}

function adCard(d) {
  const ad = d.ad, busy = u.finnBusy === 'ad';
  const url = u.finnUrl ?? ad?.url ?? d.adUrl ?? '';
  const saved = ad && (ad.title || ad.file);
  return `<div class="fd-card"><div class="h"><b>Annonsen</b>${saved ? `<span class="fd-ok">✓ Lagret ${ad.fetched ? dd(new Date(ad.fetched).toLocaleDateString('sv-SE')) : ''}</span>` : ''}</div>
    <form class="fd-urlrow" data-fd-form="ad"><input name="url" value="${esc(url)}" placeholder="${esc(d.adUrlGuess ?? 'Lenke til annonsen, finn.no/…')}" aria-label="Lenke til annonsen" inputmode="url" autocomplete="off"><button ${busy ? 'disabled' : ''}>${busy ? 'Henter …' : ad?.title ? '✦ Hent på nytt' : '✦ Hent annonsen'}</button></form>
    ${ad?.title ? `<div class="fd-ad"><div class="t"><b>${esc(ad.title)}</b>${ad.price != null ? `<span class="mono" style="flex:none">${kr0(ad.price)}</span>` : ''}</div>${ad.place ? `<span class="note" style="font-size:12.5px">${esc(ad.place)}</span>` : ''}
      ${ad.description ? `<span class="d">${esc(ad.description)}</span>` : ''}
      ${ad.images.length ? `<div class="fd-imgs">${ad.images.map((src, i) => `<a href="${esc(src)}" target="_blank" rel="noopener" aria-label="Bilde ${i + 1} fra annonsen"><img src="${esc(src)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
      ${ad.url ? `<a class="note" style="font-size:12px" href="${esc(ad.url)}" target="_blank" rel="noopener">Åpne på finn.no ↗</a>` : ''}</div>` : ''}
    ${ad?.file ? `<a class="fd-file" href="${esc(ad.file.url)}" target="_blank" rel="noopener"><span class="ext">${extOf(ad.file.name)}</span><span class="n"><span>${esc(ad.file.name)}</span><small>Annonsen · lastet opp</small></span></a>` : ''}
    <span class="fd-note">${d.adUrl || ad?.url ? 'Kopien beholdes selv om annonsen slettes på finn.no.' : d.adUrlGuess ? 'Uten lenke brukes Finn-koden fra e-postene.' : 'Lim inn lenken. Serveren henter tittel, pris, sted, beskrivelse og alle bildene, og lagrer en kopi her.'}</span>
    <label class="fd-up">↑ Last opp annonsen som PDF eller skjermbilde<input type="file" accept="image/*,application/pdf" data-fd-file="ad"></label></div>`;
}

function rcCard(d) {
  return `<div class="fd-card"><div class="h"><b>Original kvittering</b>${d.receipts.length ? `<span class="fd-ok">✓ ${d.receipts.length} lagt ved</span>` : ''}</div>
    ${d.receipts.map((k) => `<div class="fd-file"><span class="ext">${extOf(k.name)}</span><a class="n" href="${esc(k.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><span>${esc(k.name)}</span><small>Original kvittering · ${kb(k.size)}</small></a><button data-fd-rmfile="${k.id}" aria-label="Fjern ${esc(k.name)}">×</button></div>`).join('')
      || '<span class="fd-note">Ingen kvittering lagt ved ennå.</span>'}
    <label class="fd-up">↑ Legg ved kvittering<input type="file" multiple accept="image/*,application/pdf,.eml,message/rfc822" data-fd-file="receipt"></label></div>`;
}

function mailCard(d) {
  const note = S.finn?.imap?.configured ? 'Kobles automatisk fra Proton Mail' : 'Sett opp Proton Mail for automatisk kobling';
  const list = [...d.emails].reverse();
  return `<div class="fd-card"><div class="h"><b>E-poster i handelen</b><span class="fd-acc">${list.length ? `${list.length} · ` : ''}${note}</span></div>
    <div class="fd-mails">${list.map((e) => { const open = u.finnMail === e.id; return `<div class="fd-mail"><button data-fd-mail="${e.id}" aria-expanded="${open}"><span class="dt">${dd(e.date)}</span><span class="s"><span>${esc(e.subject || '(uten emne)')}</span><small>${esc(e.from || '')}</small></span><span class="note">${open ? '⌃' : '⌄'}</span></button>
      ${open ? `<div class="body">${esc(e.body || e.snippet || '')}<br><button data-fd-rmmail="${e.id}">Fjern fra handelen</button></div>` : ''}</div>`; }).join('')
      || '<span class="fd-note" style="padding:6px 0">Ingen e-poster koblet til ennå. E-poster fra FINN, Posten/Bring, Tillit eller motparten med Finn-koden eller varenavnet kobles automatisk.</span>'}</div>
    <label class="fd-up">↑ Legg ved e-post (.eml)<input type="file" multiple accept=".eml,message/rfc822" data-fd-file="email"></label></div>`;
}

function photoCard(d) {
  return `<div class="fd-card"><div class="h"><b>Bilder</b>${d.photos.length ? `<span class="note" style="font-size:12px">${d.photos.length} egne</span>` : ''}</div>
    ${d.photos.length ? `<div class="fd-photos">${d.photos.map((g) => `<div><a href="${esc(g.url)}" target="_blank" rel="noopener"><img src="${esc(g.thumb)}" alt="${esc(g.name)}" loading="lazy"></a><button data-fd-rmfile="${g.id}" aria-label="Fjern bilde">×</button></div>`).join('')}</div>`
      : '<span class="fd-note">Last opp bilder av varen, for eksempel ved mottak eller før sending.</span>'}
    <label class="fd-up">↑ Last opp bilder<input type="file" multiple accept="image/*" data-fd-file="photo"></label></div>`;
}

function detail() {
  const d = S.finnDeal;
  if (!d) return u.finnSel ? skel(320) : '';
  const sold = d.role === 'sold';
  return `<section class="fd-panel" aria-label="${esc(d.item)}">
    <div class="fd-head"><div style="min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="role ${sold ? 'sold' : 'bought'}">${sold ? 'Solgt' : 'Kjøpt'}</span>${d.code ? `<span class="fd-code">Finn-kode ${esc(d.code)}</span>` : ''}${d.orderId ? `<span class="fd-code">· Ordre ${esc(d.orderId)}</span>` : ''}</div>
      <h2>${esc(d.item)}</h2><span class="note" style="font-size:13px">${esc(d.counterpart || '')}${d.counterpart ? ' · ' : ''}${dd(d.date)} · <span class="mono" style="color:${sold ? 'var(--pos)' : 'var(--text)'}">${sold ? '+' : '−'}${n0(d.amount)} kr</span></span></div>
      <button class="x-btn" data-fd-close aria-label="Lukk handelen">×</button></div>
    <div style="display:flex;gap:24px;align-items:flex-end;flex-wrap:wrap">${track(d, true)}<span class="fd-status"><b>${esc(d.status)}</b> · ${esc(d.done ? 'Alt er i orden.' : d.next)}${d.manualStage ? ' · <button class="step" data-fd-stage="0" style="cursor:pointer">Automatisk</button>' : ''}</span></div>
    <div class="fd-grid">${adCard(d)}${rcCard(d)}${mailCard(d)}${photoCard(d)}</div></section>`;
}

export function finnPage() {
  const d = S.finn;
  if (!d) return skel(400);
  const rows = d.items.map(row).join('');
  return `<div class="mod">
    <div class="mod-kpis">${[['Kjøpt i år', kr0(d.bought)], ['Solgt i år', kr0(d.sold)], ['Pågående handler', String(d.ongoing)]].map(([l, v]) => card(`<div class="sub">${l}</div><b class="mono" style="font-size:24px">${v}</b>`, 'padding:18px')).join('')}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${rows || card('<div class="empty">Ingen Finn-handler ennå.</div>')}</div>
    ${detail()}
    <form class="mod-box" data-fd-form="paste"><b>Legg til fra e-post</b><span class="note" style="font-size:13px">Lim inn en e-post fra Finn (Trygg betaling, Fiks ferdig eller Tillit). AI trekker ut gjenstand, motpart, beløp og status, og matcher mot bankposten.</span>
      <textarea class="inp mod-ta" name="email" rows="5" placeholder="Lim inn e-posten her …" required></textarea><div><button class="btn pri">Les e-posten</button></div></form>
    <div class="note" style="font-size:13px">Kilde: e-postkvitteringer fra Finn (Trygg betaling, Fiks ferdig-frakt, Tillit forsikring) leses av AI og matches mot bankposter. ${d.imap.configured ? `Proton Mail er koblet til${d.imap.finnFolder ? ` (mappen ${esc(d.imap.finnFolder)})` : ''}: nye Finn-e-poster blir handler, og e-poster fra FINN, Posten/Bring og Tillit kobles til riktig handel.` : 'Sett opp Proton Mail under Innstillinger → Import for automatisk henting. Tidligere Finn-e-poster og annonselenker importeres samme sted.'}</div>
  </div>`;
}

async function upload(kind, files) {
  const fd = new FormData();
  if (kind !== 'email') fd.set('kind', kind);
  for (const f of files) fd.append('file', f);
  const r = await api(`/finn/${u.finnSel}/${kind === 'email' ? 'emails' : 'files'}`, { method: 'POST', body: fd });
  S.finnDeal = r; S.finn = await api('/finn');
  toast(kind === 'email' ? (r.added ? `${r.added} e-post${r.added === 1 ? '' : 'er'} lagt ved` : 'E-posten finnes allerede i handelen')
    : kind === 'photo' ? `${files.length} bilde${files.length === 1 ? '' : 'r'} lagt til` : kind === 'ad' ? 'Annonsen er lagret' : files.length === 1 ? 'Kvitteringen er lagt ved' : 'Kvitteringene er lagt ved');
  render();
}

export function bindFinn(el) {
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { u.finnBusy = null; toast(err.message); render(); } };
  const open = async (id) => {
    if (u.finnSel === id) { u.finnSel = null; S.finnDeal = null; return render(); }
    u.finnSel = id; u.finnUrl = null; u.finnMail = null; S.finnDeal = null; render();
    S.finnDeal = await api(`/finn/${id}`); render();
    el.querySelector('.fd-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  el.addEventListener('click', wrap(async (e) => {
    if (u.page !== 'finn') return;
    const d = (s) => e.target.closest(s);
    let x;
    if ((x = d('[data-fd-del]'))) { e.stopPropagation(); if (!confirm('Slette handelen med annonse, kvitteringer, e-poster og bilder?')) return; await api(`/finn/${x.dataset.fdDel}`, { method: 'DELETE' }); if (u.finnSel === +x.dataset.fdDel) { u.finnSel = null; S.finnDeal = null; } S.finn = await api('/finn'); return render(); }
    if ((x = d('[data-fd-open]'))) return open(+x.dataset.fdOpen);
    if (d('[data-fd-close]')) { u.finnSel = null; S.finnDeal = null; return render(); }
    if ((x = d('[data-fd-stage]'))) { const n = +x.dataset.fdStage; S.finnDeal = await api(`/finn/${u.finnSel}`, { method: 'PATCH', json: { stage: n || null } }); S.finn = await api('/finn'); return render(); }
    if ((x = d('[data-fd-mail]'))) { u.finnMail = u.finnMail === +x.dataset.fdMail ? null : +x.dataset.fdMail; return render(); }
    if ((x = d('[data-fd-rmmail]'))) { S.finnDeal = await api(`/finn/${u.finnSel}/emails/${x.dataset.fdRmmail}`, { method: 'DELETE' }); u.finnMail = null; S.finn = await api('/finn'); return render(); }
    if ((x = d('[data-fd-rmfile]'))) { S.finnDeal = await api(`/finn/${u.finnSel}/files/${x.dataset.fdRmfile}`, { method: 'DELETE' }); S.finn = await api('/finn'); return render(); }
  }));
  el.addEventListener('keydown', (e) => { if (u.page === 'finn' && (e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-fd-open]')) { e.preventDefault(); e.target.click(); } });
  el.addEventListener('input', (e) => { if (e.target.closest?.('[data-fd-form="ad"]')) u.finnUrl = e.target.value; });
  el.addEventListener('change', wrap(async (e) => {
    const inp = e.target.closest?.('[data-fd-file]');
    if (!inp || !inp.files?.length) return;
    const files = [...inp.files]; inp.value = '';
    await upload(inp.dataset.fdFile, files);
  }));
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest?.('[data-fd-form]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    if (f.dataset.fdForm === 'paste') { const r = await api('/finn', { method: 'POST', json: v }); toast(`${r.item} lagt til`); f.reset(); u.finnSel = r.id; await loadFinn(); return render(); }
    if (f.dataset.fdForm === 'ad') {
      u.finnBusy = 'ad'; render();
      const r = await api(`/finn/${u.finnSel}/ad`, { method: 'POST', json: { url: v.url?.trim() || undefined } });
      u.finnBusy = null; u.finnUrl = null; S.finnDeal = r; S.finn = await api('/finn');
      toast(`✦ ${r.message ?? 'Annonsen er lagret'}`); return render();
    }
  }));
}

// Finn-fanen i mobilappen (design 2a): netto i år med månedsstolper, «N på vei» som sveipbare kort med sporing,
// filter Alle/Kjøpt/Solgt/Fullført og rutenett. Handelen: stort bilde, status, Kvittering/Annonse/Bilder,
// kvittering på papir og tidslinje med steg og e-poster. Data fra /finans/api/finn og /finn/:id.
import { api, esc, n0, ini } from './core.js';
import { m, draw, flash } from './mobile.js';

const F = { list: null, deal: {}, seg: 'all', q: '', qOpen: false, img: 0, open: {}, busy: '', adForm: false, adUrl: '', err: '' };

// Egen stilfil for Finn-sidene (deles med PC-siden, lastes én gang).
if (!document.querySelector('link[data-finn-css]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/assets/finans/css/finn.css'; l.dataset.finnCss = '';
  document.head.append(l);
}

const kr = (v) => `${n0(v)} kr`;
const signed = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${n0(v)} kr`;
const day = (d, year = false) => { const t = new Date(String(d).length === 10 ? `${d}T12:00` : d); return Number.isNaN(+t) ? '' : t.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }).replace('.', ''); };
const ROLE = { bought: ['Kjøpt', '#8FB3FF', 'rgba(143,179,255,.16)'], sold: ['Solgt', '#7BE3A0', 'rgba(123,227,160,.16)'] };
const role = (r) => ROLE[r === 'sold' ? 'sold' : 'bought'];
const ext = (n) => (String(n).split('.').pop() || '').slice(0, 4).toUpperCase();
// Bilde, eller en rolig farge med forbokstaven når handelen ikke har bilder.
const HUES = ['#3B2A22', '#22303B', '#2B3B22', '#3B2236', '#2E2A3B', '#3B3522'];
const bg = (x, src) => (src ? `background-image:url('${esc(src)}')` : `background:linear-gradient(150deg,${HUES[x.id % HUES.length]},#141418)`);
const track = (t, big = false) => `<div class="mf-tr${big ? ' big' : ''}" role="list">${t.map((s, i, a) => `<div role="listitem" class="${s.done && !s.cur ? 'on' : ''}${s.cur ? ' cur' : ''}${i === a.length - 1 ? ' last' : ''}" aria-label="${esc(s.t)}${s.cur ? ' (nå)' : s.done ? ' (ferdig)' : ''}"><span class="dl"><span class="dot"></span><span class="ln"></span></span><span class="t">${esc(s.t)}</span></div>`).join('')}</div>`;

export async function finnLoad(sub) {
  const id = +sub || null;
  if (id !== F.cur) { F.img = 0; F.open = {}; F.adForm = false; F.err = ''; F.cur = id; }
  const jobs = [];
  if (!id || !F.list) jobs.push(api('/finn').then((r) => { F.list = r; }));
  if (id) jobs.push(api(`/finn/${id}`).then((r) => { F.deal[id] = r; }).catch((e) => { F.deal[id] = { error: e.message }; }));
  await Promise.all(jobs);
}

export function finnView(th, sub) {
  const id = +sub || null;
  return `<div class="mf">${id ? dealView(F.deal[id]) : listView()}</div>`;
}

/* ---------- Listen ---------- */

function listView() {
  const L = F.list;
  if (!L) return `<div class="mf-top"><h1>Finn</h1></div><div class="m-spin"></div>`;
  const q = F.q.trim().toLowerCase();
  const hit = (x) => !q || [x.item, x.counterpart, x.code, x.status].some((v) => String(v ?? '').toLowerCase().includes(q));
  const items = (L.items ?? []).filter(hit);
  const ongoing = items.filter((x) => !x.done);
  const shown = items.filter((x) => (F.seg === 'all' ? true : F.seg === 'done' ? x.done : x.role === F.seg));
  // Netto per måned (solgt − kjøpt): de fire siste månedene til og med denne.
  const cm = new Date().getMonth(), mons = (L.months ?? []).slice(Math.max(0, cm - 3), cm + 1);
  const net = (x) => x.sold - x.bought, top = Math.max(1, ...mons.map((x) => Math.abs(net(x))));
  const bars = mons.map((x, i) => `<div><span class="b${i === mons.length - 1 ? ' cur' : ''}" style="height:${Math.max(4, Math.round((Math.abs(net(x)) / top) * 36))}px" title="${esc(signed(net(x)))}"></span><span class="mo">${new Date(`${x.m}-15T12:00`).toLocaleDateString('nb-NO', { month: 'short' }).replace('.', '')}</span></div>`).join('');
  const most = Math.max(1, L.bought, L.sold);
  const line = (l, n, v, c) => `<div><span class="l">${l} · ${n}</span><b class="mono">${kr(v)}</b><span class="tr"><i style="width:${Math.round((v / most) * 100)}%;background:${c}"></i></span></div>`;
  return `<div class="mf-top"><h1>Finn</h1><button class="mf-ib" data-mfa="q" aria-label="${F.qOpen ? 'Lukk søk' : 'Søk i handler'}" aria-expanded="${F.qOpen}">${F.qOpen ? '×' : '⌕'}</button></div>
    ${F.qOpen ? `<input class="mf-q" id="mf-q" type="search" enterkeyhint="search" placeholder="Søk etter vare, person eller Finn-kode" value="${esc(F.q)}" data-mfq aria-label="Søk i handler">` : ''}
    <section class="mf-card" aria-label="Finn i år"><div class="mf-sum"><div><div class="l">Netto i år</div><div class="v mono">${signed(L.sold - L.bought)}</div></div><div class="mf-bars" aria-hidden="true">${bars}</div></div>
      <div class="mf-bs">${line('Kjøpt', L.nBought ?? 0, L.bought, '#8FB3FF')}${line('Solgt', L.nSold ?? 0, L.sold, '#7BE3A0')}</div></section>
    ${ongoing.length ? `<div class="mf-h"><b>${ongoing.length} på vei</b>${ongoing.length > 1 ? '<span>Sveip for flere</span>' : ''}</div>
      <div class="mf-act">${ongoing.map(activeCard).join('')}</div>` : ''}
    <div class="mf-seg" role="group" aria-label="Filter">${[['all', 'Alle'], ['bought', 'Kjøpt'], ['sold', 'Solgt'], ['done', 'Fullført']].map(([k, l]) => `<button data-mfseg="${k}" aria-pressed="${F.seg === k}">${l}</button>`).join('')}</div>
    ${shown.length ? `<div class="mf-grid">${shown.map(gridItem).join('')}</div>`
      : `<div class="mf-empty">${q ? `Ingen handler passer «${esc(F.q)}».` : (L.items ?? []).length ? 'Ingen handler her.' : 'Ingen Finn-handler ennå. Kvitteringer fra FINN.no i e-posten kobles hit automatisk, eller lim inn en e-post på PC.'}</div>`}`;
}

function activeCard(x) {
  const [rl, rc] = role(x.role);
  return `<a class="mf-ac" href="#/finn/${x.id}"><div class="mf-img" style="height:132px;${bg(x, x.cover)}">${x.cover ? '' : `<span class="ini" style="font-size:56px">${esc(ini(x.item))}</span>`}
      <span class="pl" style="color:${rc}">${rl}</span><span class="pr mono">${kr(x.amount)}</span></div>
    <div class="bd"><b>${esc(x.item)}</b>${track(x.track)}<div class="nx">Neste: <span>${esc(x.next ?? '')}</span></div></div></a>`;
}

function gridItem(x) {
  const [rl] = role(x.role);
  return `<a class="mf-gi" href="#/finn/${x.id}"><div class="mf-img" style="${bg(x, x.cover)}">${x.cover ? '' : `<span class="ini" style="font-size:44px">${esc(ini(x.item))}</span>`}<span class="st${x.done ? ' fin' : ''}">${esc(x.status)}</span></div>
    <div class="bd"><b class="mono">${kr(x.amount)}</b><span>${esc(x.item)}</span><small>${rl} · ${esc(day(x.date))}</small></div></a>`;
}

/* ---------- Handelen ---------- */

function dealView(d) {
  const back = '<a href="#/finn" aria-label="Tilbake til Finn">‹</a>';
  if (!d) return `<div class="mf-hero mf-img" style="background:#16161B"><div class="tb">${back}</div></div><div class="m-spin"></div>`;
  if (d.error) return `<div class="mf-hero mf-img" style="background:#16161B"><div class="tb">${back}</div></div><div class="mf-empty">${esc(d.error)}</div>`;
  const imgs = [...(d.photos ?? []).map((p) => p.url), ...(d.ad?.images ?? [])];
  const i = imgs.length ? F.img % imgs.length : 0;
  const [rl, rc, rbg] = role(d.role), sold = d.role === 'sold';
  const hero = `<div class="mf-hero mf-img" style="${bg(d, imgs[i])}">${imgs.length ? '' : `<span class="ini">${esc(ini(d.item))}</span>`}
    ${imgs.length > 1 ? `<button class="tap" data-mfa="img" aria-label="Neste bilde"></button>` : ''}
    <div class="tb">${back}${imgs.length > 1 ? `<button data-mfa="img" aria-label="Neste bilde">${i + 1} / ${imgs.length}</button>` : ''}</div>
    ${imgs.length > 1 ? `<div class="dots" aria-hidden="true">${imgs.slice(0, 8).map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</div>` : ''}</div>`;
  const title = `<div class="mf-title"><span class="rl" style="color:${rc};background:${rbg}">${rl}${d.code ? ` · Finn-kode ${esc(d.code)}` : ''}</span><b>${esc(d.item)}</b>
    <div class="r"><span>${d.counterpart ? `${sold ? 'Til' : 'Fra'} ${esc(d.counterpart)} · ` : ''}${esc(day(d.date, true))}</span><b class="mono">${kr(d.amount)}</b></div></div>`;
  const status = `<section class="mf-status" aria-label="Status"><div><div class="k">STATUS</div><div class="s">${esc(d.status)}</div>${d.done ? '' : `<div class="n">Neste: ${esc(d.next ?? '')}</div>`}</div>${track(d.track, true)}</section>`;
  const nR = d.receipts?.length ?? 0, nP = d.photos?.length ?? 0, busy = F.busy === 'ad';
  const tiles = `<div class="mf-tiles">
    <label class="mf-tile"><span class="i" aria-hidden="true">⎙</span><b>Kvittering</b>${nR ? `<small class="ok">✓ ${nR} lagt ved</small>` : '<small class="acc">Legg ved</small>'}<input type="file" multiple accept="image/*,application/pdf,.eml,message/rfc822" data-mfup="receipt" aria-label="Legg ved kvittering"></label>
    <button class="mf-tile" data-mfa="ad" ${busy ? 'disabled' : ''}><span class="i" aria-hidden="true">▦</span><b>Annonse</b>${busy ? '<small>Henter …</small>' : d.ad ? '<small class="ok">✓ Lagret</small>' : '<small class="acc">✦ Hent fra Finn</small>'}</button>
    <label class="mf-tile"><span class="i" aria-hidden="true">◫</span><b>Bilder</b>${nP ? `<small class="ok">${nP} bilde${nP === 1 ? '' : 'r'}</small>` : '<small class="acc">Legg til</small>'}<input type="file" multiple accept="image/*" data-mfup="photo" aria-label="Legg til bilder"></label></div>`;
  return `${hero}${title}${status}${tiles}${adBox(d)}${files(d)}${paper(d)}${timeline(d)}
    <button class="mf-tile" style="align-items:center;color:#FF8A80" data-mfa="del">Slett handelen</button>`;
}

function adBox(d) {
  const a = d.ad;
  const form = `<form class="url" data-mfad><input name="url" type="url" inputmode="url" placeholder="Lenke til annonsen på finn.no eller Finn-kode" value="${esc(F.adUrl || a?.url || d.adUrl || d.adUrlGuess || '')}" aria-label="Lenke til annonsen"><button ${F.busy === 'ad' ? 'disabled' : ''}>${F.busy === 'ad' ? 'Henter …' : '✦ Hent'}</button></form>
    <small>Hentes fra finn.no med bilder og lagres her. Eller <label style="color:#FFB08A;cursor:pointer">last opp annonsen som PDF eller skjermbilde<input type="file" accept="image/*,application/pdf" data-mfup="ad" hidden></label>.</small>`;
  if (!a) return F.adForm || F.err ? `<section class="mf-adbox" aria-label="Annonsen"><div class="t"><b>Annonsen</b></div>${F.err ? `<small style="color:#FF8A80">${esc(F.err)}</small>` : ''}${form}</section>` : '';
  return `<section class="mf-adbox" aria-label="Annonsen"><div class="t"><b>${esc(a.title ?? 'Annonsen')}</b>${a.price != null ? `<b class="mono">${kr(a.price)}</b>` : ''}</div>
    <small>${[a.place, a.source === 'upload' ? 'Lastet opp' : a.fetched ? `Hentet ${day(a.fetched, true)}` : null].filter(Boolean).map(esc).join(' · ')}</small>
    ${a.description ? `<p>${esc(a.description)}</p>` : ''}
    ${a.file ? `<div class="mf-files" style="background:#0F0F13"><div><span class="ext">${esc(ext(a.file.name))}</span><a href="${esc(a.file.url)}" target="_blank" rel="noopener">${esc(a.file.name)}</a><button data-mfrm="${a.file.id}" aria-label="Fjern ${esc(a.file.name)}">×</button></div></div>` : ''}
    <small>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener" style="color:#FFB08A">Åpne på finn.no ↗</a> · ` : ''}<button data-mfa="adform" style="border:0;background:none;color:#FFB08A;padding:0;font:inherit;cursor:pointer">${F.adForm ? 'Skjul' : 'Hent på nytt'}</button></small>
    ${F.err ? `<small style="color:#FF8A80">${esc(F.err)}</small>` : ''}${F.adForm ? form : ''}</section>`;
}

function files(d) {
  if (!d.receipts?.length && !d.photos?.length) return '';
  const row = (x, thumb) => `<div>${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" style="flex:none;width:34px;height:34px;border-radius:10px;object-fit:cover">` : `<span class="ext">${esc(ext(x.name))}</span>`}<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a><button data-mfrm="${x.id}" aria-label="Fjern ${esc(x.name)}">×</button></div>`;
  return `<div class="mf-files" aria-label="Vedlegg">${(d.receipts ?? []).map((x) => row(x, x.mime?.startsWith('image/') ? x.url : null)).join('')}${(d.photos ?? []).map((x) => row(x, x.thumb)).join('')}</div>`;
}

function paper(d) {
  const r = d.receipt;
  if (!r?.lines?.length) return '';
  return `<section class="mf-paper" aria-label="Kvittering"><div class="hd"><span>KVITTERING</span><span>${esc(d.code ?? d.orderId ?? '')}</span></div><hr>
    ${r.lines.map((x) => `<div class="ln"><span>${esc(x.l)}</span><span>${kr(x.v)}</span></div>`).join('')}<hr>
    <div class="tot"><span>${esc(r.totalLabel)}</span><span>${kr(r.total)}</span></div></section>`;
}

// Steg og e-poster i én tidslinje, nyeste først. Et steg får datoen til den første e-posten som nevner det.
const STEP_RE = [null, /sendt|på vei/i, /mottatt|kan hentes|ligger klar|levert|hentet/i, /godkjent|fullført|utbetalt/i];
function timeline(d) {
  const mails = (d.emails ?? []).map((e) => ({ k: 'mail', id: e.id, date: e.date, t: e.subject || '(uten emne)', s: e.from, body: e.body }));
  const last = (d.emails ?? []).at(-1)?.date ?? d.date;
  const steps = d.track.filter((s) => s.done).map((s, i) => {
    const hit = i ? (d.emails ?? []).find((e) => STEP_RE[i].test(`${e.subject} ${e.body}`)) : null;
    const st = (d.steps ?? []).find((x) => x.t === s.t && x.date);
    return { k: 'step', id: `s${i}`, date: st?.date ?? (i ? hit?.date ?? last : d.date), t: s.t, s: i ? 'Steg i handelen' : `${d.role === 'sold' ? 'Solgt til' : 'Kjøpt fra'} ${d.counterpart ?? 'Finn'}`, n: i };
  });
  const ts = (x) => (x.date ? +new Date(String(x.date).length === 10 ? `${x.date}T12:00` : x.date) : 0);
  const ev = [...steps, ...mails].sort((a, b) => ts(b) - ts(a) || (b.k === 'step') - (a.k === 'step') || (b.n ?? 0) - (a.n ?? 0));
  return `<section class="mf-tl" aria-label="Tidslinje"><div class="h"><b>Tidslinje</b><label>${F.busy === 'email' ? 'Legger ved …' : '+ Legg ved e-post'}<input type="file" multiple accept=".eml,message/rfc822" data-mfup="email" aria-label="Legg ved e-post (.eml)"></label></div>
    ${ev.length ? ev.map((x, i) => `<div class="mf-ev${x.k === 'mail' ? ' mail' : ''}${i === 0 ? ' first' : ''}" ${x.k === 'mail' ? `role="button" tabindex="0" data-mfev="${x.id}" aria-expanded="${!!F.open[x.id]}"` : ''}>
      <span class="rail" aria-hidden="true"><i></i>${i < ev.length - 1 ? '<span></span>' : ''}</span>
      <span class="c"><span class="r"><b>${esc(x.t)}</b><span>${esc(x.date ? day(x.date) : '')}</span></span><small>${esc(x.s ?? '')}</small>
        ${x.k === 'mail' && F.open[x.id] ? `<div class="body">${esc(x.body ?? '')}</div><button data-mfrmmail="${x.id}" style="margin-top:8px;border:0;background:none;color:#FF8A80;padding:0;font:inherit;font-size:12.5px;cursor:pointer">Fjern fra handelen</button>` : ''}</span></div>`).join('')
    : '<small style="color:#9C9CA6;padding-bottom:14px">Ingen hendelser ennå.</small>'}</section>`;
}

/* ---------- Hendelser ---------- */

const cur = () => F.deal[F.cur];
const put = (r) => { if (r?.id) F.deal[r.id] = r; F.list = null; api('/finn').then((l) => { F.list = l; }).catch(() => {}); };

async function fetchAd(url) {
  const d = cur(); if (!d || F.busy) return;
  F.busy = 'ad'; F.err = ''; draw();
  try {
    const r = await api(`/finn/${d.id}/ad`, { method: 'POST', json: url ? { url } : {} });
    put(r); F.adForm = false; F.adUrl = ''; F.img = (r.photos?.length ?? 0); flash(r.message || 'Annonsen er lagret');
  } catch (e) { F.err = e.message; F.adForm = true; }
  finally { F.busy = ''; draw(); }
}

/** Klikk, endringer, input og skjema i Finn-fanen. Gir true når hendelsen er tatt. */
export async function finnBind(e, t) {
  if (m.screen !== 'finn') return false;
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'input') {
    if (t.matches('[data-mfq]')) { F.q = t.value; draw(); return true; }
    return false;
  }
  if (e.type === 'submit') {
    if (!t.matches('[data-mfad]')) return false;
    e.preventDefault(); F.adUrl = t.url.value.trim(); await fetchAd(F.adUrl); return true;
  }
  if (e.type === 'change') {
    if (!t.matches('[data-mfup]')) return false;
    const fl = [...(t.files ?? [])], kind = t.dataset.mfup, deal = cur(); t.value = '';
    if (!fl.length || !deal) return true;
    const fd = new FormData();
    if (kind !== 'email') fd.set('kind', kind);
    fl.forEach((f) => fd.append('file', f));
    F.busy = kind; draw();
    try {
      const r = await api(`/finn/${deal.id}/${kind === 'email' ? 'emails' : 'files'}`, { method: 'POST', body: fd });
      put(r);
      flash(kind === 'email' ? (r.added ? `${r.added} e-post${r.added === 1 ? '' : 'er'} lagt ved` : 'E-posten var lagt ved fra før') : kind === 'photo' ? 'Bildene er lagt til' : kind === 'ad' ? 'Annonsen er lagret' : 'Kvitteringen er lagt ved');
    } finally { F.busy = ''; draw(); }
    return true;
  }
  if (e.type !== 'click') return false;
  if ((x = d('[data-mfseg]'))) { F.seg = x.dataset.mfseg; draw(); return true; }
  if ((x = d('[data-mfev]')) && !d('[data-mfrmmail]') && !d('.body')) { const id = x.dataset.mfev; F.open[id] = !F.open[id]; draw(); return true; }
  if ((x = d('[data-mfrmmail]'))) {
    if (!confirm('Fjerne e-posten fra handelen?')) return true;
    put(await api(`/finn/${cur().id}/emails/${x.dataset.mfrmmail}`, { method: 'DELETE' })); draw(); return true;
  }
  if ((x = d('[data-mfrm]'))) {
    if (!confirm('Fjerne vedlegget?')) return true;
    put(await api(`/finn/${cur().id}/files/${x.dataset.mfrm}`, { method: 'DELETE' })); F.img = 0; draw(); return true;
  }
  const a = d('[data-mfa]')?.dataset.mfa;
  if (!a) return false;
  e.preventDefault();
  if (a === 'q') { F.qOpen = !F.qOpen; if (!F.qOpen) F.q = ''; draw(); if (F.qOpen) document.getElementById('mf-q')?.focus(); }
  else if (a === 'img') { F.img++; draw(); }
  else if (a === 'adform') { F.adForm = !F.adForm; F.err = ''; draw(); }
  else if (a === 'ad') {
    const deal = cur();
    if (deal?.ad) { F.adForm = false; document.querySelector('.mf-adbox')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (deal?.adUrl || deal?.code || deal?.adUrlGuess) await fetchAd();
    else { F.adForm = true; draw(); document.querySelector('.mf-adbox input')?.focus(); }
  } else if (a === 'del') {
    const deal = cur();
    if (!deal || !confirm(`Slette «${deal.item}» med vedlegg og e-poster?`)) return true;
    await api(`/finn/${deal.id}`, { method: 'DELETE' }); delete F.deal[deal.id]; F.list = null; location.hash = '#/finn';
  }
  return true;
}

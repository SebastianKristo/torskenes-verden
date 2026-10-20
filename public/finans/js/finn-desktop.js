// Finn-handler på PC: listen med sammendrag per handel, og detaljsiden med fire kort
// (Annonsen, Original kvittering, E-poster i handelen, Bilder). Klikk på en handel for å åpne den.
import { S, api, esc, n0, dd, render, toast } from './core.js';
import { glimt } from '/assets/js/glimt.js';

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
    <span class="dl"><span class="dot"></span><span class="ln" style="${i + 1 < d.stage ? 'background:var(--text)' : ''}"></span></span><span class="t">${esc(s.t)}</span></button>`).join('')}</div>`;
}

// Finn-handler 2a (prompt 14): toppstripe med «Trenger deg nå» og KPI-er, filtre, kort gruppert etter steg.
const TINTS = ['#3B2E22', '#22362C', '#1E2A3F', '#3A2F4A', '#2C2C33', '#2A3540', '#40322A', '#2F3A2A'];
const tintOf = (r) => TINTS[[...String(r.item)].reduce((a, ch) => a + ch.charCodeAt(0), r.id) % TINTS.length];
const initials = (t) => String(t).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const onWay = (r) => !r.done && !r.needsAction && r.stage >= 2;
const FILTERS = [['all', 'Alle', () => true], ['act', 'Trenger handling', (r) => r.needsAction], ['way', 'På vei', onWay], ['bought', 'Kjøpt', (r) => r.role !== 'sold'], ['sold', 'Solgt', (r) => r.role === 'sold'], ['done', 'Fullført', (r) => r.done]];
const GROUPS = [['TRENGER HANDLING', (r) => r.needsAction, 'act'], ['PÅ VEI', (r) => !r.needsAction && !r.done, 'way'], ['FULLFØRT', (r) => r.done, 'done']];
const actLabel = (r) => (r.role === 'sold' ? 'Marker som sendt' : 'Godkjenn');
const actVerb = (r) => (r.role === 'sold' ? 'Send' : 'Godkjenn');

function dots(r) {
  return `<div class="fh-dots">${r.track.map((s, i) => { const on = r.done || s.done && !s.cur, cur = s.cur; return `<span class="fh-dot${on ? ' on' : ''}${cur ? ' cur' : ''}${r.done ? ' ok' : ''}" title="${esc(s.t)}"><i></i>${i < r.track.length - 1 ? '<b></b>' : ''}</span>`; }).join('')}</div>`;
}
function dealCard(r) {
  const sold = r.role === 'sold', sel = u.finnSel === r.id;
  const img = r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : `<span class="fh-ini">${esc(initials(r.item))}</span>`;
  return `<div class="fh-card${r.needsAction ? ' act' : ''}${sel ? ' fh-on' : ''}" data-fd-open="${r.id}" role="button" tabindex="0" aria-expanded="${sel}" aria-label="${esc(r.item)}">
    <div class="fh-img" style="background:${tintOf(r)}">${img}<span class="fh-role ${sold ? 'sold' : 'bought'}">${sold ? 'Solgt' : 'Kjøpt'}</span><span class="fh-amt${sold ? ' pos' : ''}">${sold ? '+' : '−'}${kr0(r.amount)}</span></div>
    <div class="fh-body"><span class="fh-t">${esc(r.item)}</span>${dots(r)}
      <div class="fh-nx"><span class="${r.needsAction ? 'act' : r.done ? 'ok' : ''}">${esc(r.done ? 'Fullført' : r.next)}</span><span class="fh-dt">${dd(r.date)}</span></div>
      <span class="fh-att">${esc([r.counterpart, r.summary?.text].filter(Boolean).join(' · '))}</span></div></div>`;
}
function strip(d, items) {
  const acts = items.filter((r) => r.needsAction), a = acts[0];
  const now = a ? `<div class="fh-now"><span class="fh-nimg" style="background:${tintOf(a)}">${a.image ? `<img src="${esc(a.image)}" alt="">` : esc(initials(a.item))}</span><div style="min-width:0">
      <div class="fh-k act">TRENGER DEG NÅ · ${acts.length}</div><div class="fh-nt">${esc(actVerb(a))} ${esc(a.item)}</div>
      <div class="fh-nb"><button class="btn sm pri" data-fd-act="${a.id}">${actLabel(a)}</button><button class="btn sm" data-fd-open="${a.id}">Åpne</button></div></div></div>`
    : `<div class="fh-now"><div><div class="fh-k">TRENGER DEG NÅ</div><div class="fh-nt muted">Ingen handler venter på deg</div></div></div>`;
  const kpi = [['Kjøpt i år', kr0(d.bought), ''], ['Solgt i år', kr0(d.sold), 'pos'], ['Pågående', String(d.ongoing), '']]
    .map(([l, v, c]) => `<div class="fh-kpi"><div class="fh-k">${l.toUpperCase()}</div><b class="${c}">${v}</b></div>`).join('');
  return `<div class="fh-strip">${now}${kpi}</div>`;
}
function addPanel() {
  if (!u.finnAdd) return '';
  const f = u.finnAddF ?? {};
  return `<form class="card fh-add" data-fd-form="new"><div class="card-h"><h2>Legg til kjøp eller salg</h2><button type="button" class="x-btn sm" data-fd-add aria-label="Lukk">×</button></div>
    <div class="fh-seg" role="radiogroup" aria-label="Type">${[['bought', 'Kjøp'], ['sold', 'Salg']].map(([k, n]) => `<label><input type="radio" name="role" value="${k}"${(f.role ?? 'bought') === k ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div>
    <label class="fh-fl">Finn-lenke<input class="inp" name="adUrl" value="${esc(f.adUrl ?? '')}" placeholder="https://www.finn.no/recommerce/forsale/item/…" inputmode="url"><small>✦ Glimt henter tittel, pris, tekst og bilder fra annonsen</small></label>
    <div class="fh-g3"><label class="fh-fl">Tittel<input class="inp" name="item" value="${esc(f.item ?? '')}" placeholder="Hentes fra annonsen"></label><label class="fh-fl">Pris (kr)<input class="inp mono" name="amount" value="${esc(f.amount ?? '')}" inputmode="decimal" placeholder="0"></label><label class="fh-fl">${(f.role ?? 'bought') === 'sold' ? 'Kjøper' : 'Selger'}<input class="inp" name="counterpart" value="${esc(f.counterpart ?? '')}"></label></div>
    <div style="display:flex;gap:8px;align-items:center"><button class="btn pri" ${u.finnBusy === 'new' ? 'disabled' : ''}>${u.finnBusy === 'new' ? `${glimt(14, 'tenker')} Henter annonsen …` : 'Legg til'}</button><span class="note" style="font-size:12.5px">Du trenger enten en lenke eller tittel og pris.</span></div></form>`;
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

function photoCard(d) {
  return `<div class="fd-card"><div class="h"><b>Bilder</b>${d.photos.length ? `<span class="note" style="font-size:12px">${d.photos.length} egne</span>` : ''}</div>
    ${d.photos.length ? `<div class="fd-photos">${d.photos.map((g) => `<div><a href="${esc(g.url)}" target="_blank" rel="noopener"><img src="${esc(g.thumb)}" alt="${esc(g.name)}" loading="lazy"></a><button data-fd-rmfile="${g.id}" aria-label="Fjern bilde">×</button></div>`).join('')}</div>`
      : '<span class="fd-note">Last opp bilder av varen, for eksempel ved mottak eller før sending.</span>'}
    <label class="fd-up">↑ Last opp bilder<input type="file" multiple accept="image/*" data-fd-file="photo"></label></div>`;
}

function editForm(d) {
  return `<form class="fh-edit" data-fd-form="edit"><label class="fh-fl">Tittel<input class="inp" name="item" value="${esc(d.item)}"></label><label class="fh-fl">Pris (kr)<input class="inp mono" name="amount" value="${esc(String(d.amount).replace('.', ','))}" inputmode="decimal"></label>
    <label class="fh-fl">${d.role === 'sold' ? 'Kjøper' : 'Selger'}<input class="inp" name="counterpart" value="${esc(d.counterpart ?? '')}"></label><label class="fh-fl">Dato<input class="inp" type="date" name="date" value="${esc(d.date)}"></label>
    <div class="fh-eb"><button class="btn pri sm">Lagre</button><button type="button" class="btn sm fh-delb" data-fd-del="${d.id}">Slett handelen</button></div></form>`;
}
// Annonsen i FinansHub (prompt 23, FinansHub v3 Temaer → Finn-handler): karusell med ‹ › til venstre, annonseinfo til høyre,
// og E-poster og Meldinger i to kolonner under. Annonsen hentes fra den lokale kopien (/finn/:id/ad), så den vises også når
// den er fjernet fra finn.no. Svarer serveren 404 (eldre versjon), brukes annonsedataene i selve handelen.
const FA_TINTS = ['#3B2E22', '#22362C', '#2C2C33', '#1E2A3F'];
const mailColor = (from) => (/finn/i.test(from) ? '#0063fb' : /posten|bring/i.test(from) ? '#e32d22' : /tillit/i.test(from) ? '#2f7a4f' : 'var(--muted)');
const mailIni = (from) => (/finn/i.test(from) ? 'F' : /posten/i.test(from) ? 'P' : /bring/i.test(from) ? 'B' : String(from || '?').replace(/["'<]/g, '').trim().slice(0, 1).toUpperCase() || '?');
const mailFrom = (from) => (/finn/i.test(from) ? 'FINN' : /posten/i.test(from) ? 'Posten' : /bring/i.test(from) ? 'Bring' : String(from || '').replace(/<.*>/, '').replace(/"/g, '').trim() || String(from || ''));
const tm = (iso) => { if (!iso) return ''; const s = String(iso); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dd(s); const t = new Date(s); return Number.isNaN(+t) ? s : `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')} ${t.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`; };
const optional = (p) => api(p).catch((e) => (e.status === 404 || e.status === 405 || e.status === 501 ? null : Promise.reject(e)));

export async function loadAd(id) {
  const [ad, emails, msgs] = await Promise.all([optional(`/finn/${id}/ad`), optional(`/finn/${id}/emails`), optional(`/finn/${id}/messages`)].map((p) => p.catch(() => null)));
  if (u.finnSel !== id) return;
  const m = Array.isArray(msgs) ? { messages: msgs } : msgs ?? {};
  u.finnAd = { id, ad: ad && !ad.error ? ad : null, emails: Array.isArray(emails) ? emails : emails?.emails ?? null,
    messages: m.items ?? m.messages ?? null, chatUrl: m.chatUrl ?? null, full: {} };
}

function adModel(d) {
  const x = u.finnAd?.id === d.id ? u.finnAd : null;
  const a = x?.ad, old = d.ad ?? {};
  const attrs = (a?.attrs ?? []).filter((r) => r && r.label && r.value != null && r.value !== '');
  if (!attrs.length && (a?.place ?? old.place)) attrs.push({ label: 'Lokasjon', value: a?.place ?? old.place });
  const emails = (x?.emails ?? d.emails ?? []).map((e) => ({ id: e.id, from: e.from ?? e.sender ?? '', subject: e.subject ?? '', date: e.date, snippet: e.snippet ?? '', body: x?.full?.[e.id] ?? e.body ?? null }));
  return { title: a?.title ?? old.title ?? d.item, price: a?.price ?? old.price ?? d.amount, description: a?.description ?? old.description ?? '',
    images: a?.images?.length ? a.images : old.images ?? [], url: a?.url ?? old.url ?? d.adUrl ?? null, removed: !!a?.removed, fetchedAt: a?.fetchedAt ?? old.fetched ?? null,
    attrs, emails: [...emails].sort((p, q) => String(p.date).localeCompare(String(q.date))), messages: x?.messages ?? d.messages ?? [], chatUrl: x?.chatUrl ?? d.chatUrl ?? a?.url ?? d.adUrl ?? null, hasApi: !!a };
}

// Prompt 42 (claude-code-finn-bilder.md): bare annonsens egne bilder. Reklame og bilder som går igjen i flere annonser
// (f.eks. et stockbilde av en dame i alle annonser) tas bort her også, i tillegg til filteret på serveren. Største størrelse.
const AD_RE = /\/ads\/|adnami|doubleclick|googlesyndication|cdn\.schibsted|banner|\/display\//i;
function adImages(m, d) {
  const mine = (m.images ?? []).map((src) => String(src).replace(/\/dynamic\/\d+w\//, '/dynamic/1280w/'));
  const others = new Map();
  for (const it of S.finn?.items ?? []) { if (it.id === d.id) continue; for (const src of it.ad?.images ?? []) others.set(String(src).replace(/\/dynamic\/\d+w\//, '/dynamic/1280w/'), true); }
  return [...new Set(mine)].filter((src) => !AD_RE.test(src) && !others.has(src));
}
function carousel(m, d) {
  const imgs = adImages(m, d);
  // Hele bildet vises alltid (contain), med det samme bildet uskarpt bak, så det ikke blir tomme kanter.
  const slides = imgs.length ? imgs.map((src, i) => `<div class="fa-sl" style="background-color:${FA_TINTS[i % 4]}"><img class="fa-blur" src="${esc(src)}" alt="" aria-hidden="true" loading="${i ? 'lazy' : 'eager'}"><img class="fa-img" src="${esc(src)}" alt="Bilde ${i + 1} fra annonsen" loading="${i ? 'lazy' : 'eager'}" data-fa-lb="${i}"></div>`)
    : FA_TINTS.slice(0, 1).map((t) => `<div class="fa-sl" style="background-color:${t}"><span>${esc(initials(d.item))}</span></div>`);
  const n = slides.length, i = Math.min(u.finnAdI ?? 0, n - 1);
  const thumbs = imgs.length > 1 ? `<div class="fa-thumbs">${imgs.map((src, k) => `<button type="button" class="fa-th${k === i ? ' on' : ''}" data-fa-go="${k}" aria-label="Bilde ${k + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : '';
  const lb = u.finnLb != null && imgs[u.finnLb] ? `<div class="fa-lb" data-fa-lbx role="dialog" aria-modal="true" aria-label="Bilde ${u.finnLb + 1} av ${imgs.length}"><img src="${esc(imgs[u.finnLb])}" alt="Bilde ${u.finnLb + 1} fra annonsen">${imgs.length > 1 ? '<button class="fa-nav l" data-fa-lbnav="-1" aria-label="Forrige bilde">‹</button><button class="fa-nav r" data-fa-lbnav="1" aria-label="Neste bilde">›</button>' : ''}<button class="fa-lbc" data-fa-lbx aria-label="Lukk">×</button><span class="fa-cnt">${u.finnLb + 1} / ${imgs.length}</span></div>` : '';
  return `<div class="fa-car"><div class="fa-stage"><div class="fa-track" data-fa-track>${slides.join('')}</div>
    ${n > 1 ? `<button class="fa-nav l" data-fa-nav="-1" aria-label="Forrige bilde">‹</button><button class="fa-nav r" data-fa-nav="1" aria-label="Neste bilde">›</button>` : ''}
    <span class="fa-cnt" data-fa-cnt>${imgs.length ? `${i + 1} / ${n}` : 'Ingen bilder'}</span></div>${thumbs}${lb}</div>`;
}

function adPanel(d) {
  const m = adModel(d), sold = d.role === 'sold';
  const who = d.counterpart ? `${sold ? 'Solgt til' : 'Kjøpt fra'} ${d.counterpart}` : sold ? 'Solgt' : 'Kjøpt';
  const ship = d.shipment ? ` · ${esc(String(d.shipment.carrier || 'Sending').replace(/^./, (ch) => ch.toUpperCase()))}` : '';
  const first = String(d.counterpart || '').replace(/^(kjøper|selger)\s+/i, '').split(/\s+/)[0];
  const st = `${sold ? 'Solgt' : 'Kjøpt'} · ${d.done ? 'Fullført' : d.next}`;
  const mails = m.emails.map((e) => { const open = u.finnMail === e.id; return `<div class="fa-mail" data-fa-mail="${e.id}" role="button" tabindex="0" aria-expanded="${open}">
      <span class="fa-mi" style="background:${mailColor(e.from)}">${esc(mailIni(e.from))}</span>
      <span class="fa-mt"><span class="fa-mh"><b>${esc(e.subject || '(uten emne)')}</b><span>${esc(tm(e.date))}</span></span><span class="fa-mf">${esc(mailFrom(e.from))}</span>
      ${open ? `<span class="fa-mb">${e.body == null ? 'Henter e-posten …' : esc(e.body || e.snippet)}</span><button class="fa-rmm" data-fd-rmmail="${e.id}">Fjern fra handelen</button>` : ''}</span></div>`; }).join('');
  const chat = m.messages.map((c) => { const me = c.from === 'me'; return `<div class="fa-msg${me ? ' me' : ''}"><span>${esc(c.text)}</span><small>${esc(tm(c.time))}</small></div>`; }).join('');
  return `<section class="fa" aria-label="Annonsen: ${esc(m.title)}" data-fa="${d.id}">
    ${carousel(m, d)}
    <div class="fa-info">
      <div class="fa-ih"><div style="min-width:0"><span class="fa-st${d.done ? ' ok' : ''}${sold ? ' sold' : ''}">${esc(st)}</span><h2>${esc(m.title)}</h2></div>
        <div class="fa-ib"><button class="fa-x" data-fd-edit aria-pressed="${!!u.finnEdit}" aria-label="Rediger handelen" title="Rediger handelen">✎</button><button class="fa-x" data-fd-close aria-label="Lukk annonsen">×</button></div></div>
      <div class="fa-pr mono">${m.price != null ? kr0(m.price) : '–'}</div>
      <div class="fa-sub">${esc(who)} · ${dd(d.date)}${ship}${m.removed ? ' · <b class="fa-rm">Fjernet fra Finn</b>' : ''}</div>
      ${m.attrs.length ? `<div class="fa-spec">${m.attrs.map((r) => `<div><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join('')}</div>` : ''}
      ${m.description ? `<p class="fa-d">${esc(m.description)}</p>` : !m.images.length && !d.ad ? '<p class="fa-d muted">Annonsen er ikke hentet ennå. Lim inn lenken under ✎ Rediger, eller hent den på nytt.</p>' : ''}
      <div class="fa-links">${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">Åpne annonsen i Finn ↗</a>` : ''}
        <button class="fa-ref" data-fa-refresh ${u.finnBusy === 'refresh' ? 'disabled' : ''}>${u.finnBusy === 'refresh' ? 'Henter …' : '↻ Hent annonsen på nytt'}</button>
        ${m.fetchedAt ? `<span>Lagret ${esc(tm(typeof m.fetchedAt === 'number' ? new Date(m.fetchedAt).toISOString() : m.fetchedAt))}</span>` : ''}</div>
    </div>
    <div class="fa-cols">
      <div class="fa-col fa-mails"><div class="fa-ch"><span>E-poster</span><small>Proton Mail · ${m.emails.length}</small></div>
        ${mails || '<span class="fa-empty">Ingen e-poster koblet til ennå. E-poster fra FINN, Posten/Bring og Tillit med Finn-koden kobles automatisk.</span>'}
        <label class="fd-up">↑ Legg ved e-post (.eml)<input type="file" multiple accept=".eml,message/rfc822" data-fd-file="email"></label></div>
      <div class="fa-col fa-chat"><div class="fa-ch"><span>Meldinger${first ? ` med ${esc(first)}` : ''}</span>${m.chatUrl ? `<a href="${esc(m.chatUrl)}" target="_blank" rel="noopener">Åpne i Finn ↗</a>` : ''}</div>
        ${chat || '<span class="fa-empty">Ingen meldinger ennå. Meldinger hentes fra e-postvarslene «Du har fått en ny melding».</span>'}
        <form class="fa-send" data-fa-send><input name="msg" value="${esc(u.finnMsg ?? '')}" placeholder="Skriv en melding …" autocomplete="off" aria-label="Melding"><button>Send</button></form>
        <span class="fa-empty">Finn har ikke åpent chat-API. «Send» kopierer meldingen og åpner samtalen i Finn.</span></div>
    </div></section>`;
}

function manage(d) {
  if (!u.finnEdit) return '';
  const steps = `<div class="fh-steps">${d.track.map((s, i) => `<button class="fh-step${s.done || d.done ? ' on' : ''}${s.cur ? ' cur' : ''}" data-fd-stage="${i + 1}" title="Sett steget til ${esc(s.t)}">${esc(s.t)}</button>`).join('')}
    ${d.manualStage ? '<button class="fh-step auto" data-fd-stage="0" title="La e-postene styre steget">Automatisk</button>' : ''}</div>`;
  return `<section class="fd-panel fh-panel" aria-label="Rediger ${esc(d.item)}">
    <div class="fd-head"><div class="fh-hl"><div class="fh-hm"><span class="fh-role ${d.role === 'sold' ? 'sold' : 'bought'}">${d.role === 'sold' ? 'Solgt' : 'Kjøpt'}</span>${d.code ? `<span class="fd-code">Finn-kode ${esc(d.code)}</span>` : ''}${d.orderId ? `<span class="fd-code">· Ordre ${esc(d.orderId)}</span>` : ''}</div><h2 style="font-size:22px">Rediger handelen</h2></div>
      <div class="fh-ha"><button class="btn sm" data-fd-edit>Ferdig</button></div></div>
    ${editForm(d)}${steps}
    <div class="fh-cols"><div class="fh-col">${adCard(d)}</div><div class="fh-col">${rcCard(d)}${photoCard(d)}</div></div></section>`;
}

function detail() {
  const d = S.finnDeal;
  if (!d) return u.finnSel ? skel(320) : '';
  // Etter en ny tegning står karusellen på samme bilde som før.
  requestAnimationFrame(() => { const t = document.querySelector('[data-fa-track]'); if (t && u.finnAdI) t.scrollTo({ left: u.finnAdI * t.clientWidth, behavior: 'instant' }); });
  return `<div class="fa-wrap">${adPanel(d)}${manage(d)}</div>`;
}

export function finnPage() {
  const d = S.finn;
  if (!d) return skel(400);
  const all = d.items, fk = u.finnF ?? 'all', fil = FILTERS.find(([k]) => k === fk) ?? FILTERS[0];
  const items = all.filter(fil[2]);
  const segs = FILTERS.map(([k, n, f]) => `<button class="fh-segb" data-fd-filter="${k}" aria-pressed="${fk === k}">${n} <span>${all.filter(f).length}</span></button>`).join('');
  // Et trykk på et kort åpner annonsen rett under gruppen kortet står i.
  const det = detail();
  let placed = false;
  const groups = GROUPS.map(([n, f, cls]) => { const g = items.filter(f); if (!g.length) return ''; const here = !placed && g.some((r) => r.id === u.finnSel); if (here) placed = true;
    return `<div class="fh-group"><div class="fh-gh"><b class="fh-k ${cls}">${n}</b><span>${g.length} ${g.length === 1 ? 'handel' : 'handler'}</span></div>
    <div class="fh-grid">${g.map(dealCard).join('')}</div></div>${here ? det : ''}`; }).join('');
  return `<div class="mod fh">
    <div class="fh-top"><span class="note" style="font-size:13px">${all.length} handler · ${d.nBought ?? 0} kjøp og ${d.nSold ?? 0} salg i år</span><button class="btn pri" data-fd-add>+ Legg til handel</button></div>
    ${strip(d, all)}${addPanel()}
    <div class="fh-segs">${segs}</div>
    ${groups || card('<div class="empty">Ingen handler her ennå.</div>')}
    ${placed ? '' : det}
    <form class="mod-box" data-fd-form="paste"><b>Legg til fra e-post</b><span class="note" style="font-size:13px">Lim inn en e-post fra Finn (Trygg betaling, Fiks ferdig eller Tillit). Glimt trekker ut gjenstand, motpart, beløp og status, og matcher mot bankposten.</span>
      <textarea class="inp mod-ta" name="email" rows="5" placeholder="Lim inn e-posten her …" required></textarea><div><button class="btn pri">Les e-posten</button></div></form>
    <div class="note" style="font-size:13px">Kilde: e-postkvitteringer fra Finn (Trygg betaling, Fiks ferdig-frakt, Tillit forsikring) leses av Glimt og matches mot bankposter. ${d.imap.configured ? `Proton Mail er koblet til${d.imap.finnFolder ? ` (mappen ${esc(d.imap.finnFolder)})` : ''}: nye Finn-e-poster blir handler, og e-poster fra FINN, Posten/Bring og Tillit kobles til riktig handel.` : 'Sett opp Proton Mail under Innstillinger → Import for automatisk henting. Tidligere Finn-e-poster og annonselenker importeres samme sted.'}</div>
  </div>`;
}

async function upload(kind, files) {
  const fd = new FormData();
  if (kind !== 'email') fd.set('kind', kind);
  for (const f of files) fd.append('file', f);
  const r = await api(`/finn/${u.finnSel}/${kind === 'email' ? 'emails' : 'files'}`, { method: 'POST', body: fd });
  S.finnDeal = r; S.finn = await api('/finn');
  if (kind === 'email' || kind === 'ad') await loadAd(u.finnSel);
  toast(kind === 'email' ? (r.added ? `${r.added} e-post${r.added === 1 ? '' : 'er'} lagt ved` : 'E-posten finnes allerede i handelen')
    : kind === 'photo' ? `${files.length} bilde${files.length === 1 ? '' : 'r'} lagt til` : kind === 'ad' ? 'Annonsen er lagret' : files.length === 1 ? 'Kvitteringen er lagt ved' : 'Kvitteringene er lagt ved');
  render();
}

export function bindFinn(el) {
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { u.finnBusy = null; toast(err.message); render(); } };
  const open = async (id) => {
    if (u.finnSel === id) { u.finnSel = null; S.finnDeal = null; return render(); }
    u.finnSel = id; u.finnUrl = null; u.finnMail = null; u.finnAdI = 0; u.finnMsg = ''; u.finnAd = null; S.finnDeal = null; render();
    const [deal] = await Promise.all([api(`/finn/${id}`), loadAd(id)]);
    if (u.finnSel !== id) return;
    S.finnDeal = deal; render();
    el.querySelector('.fa')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  el.addEventListener('click', wrap(async (e) => {
    if (u.page !== 'finn') return;
    const d = (s) => e.target.closest(s);
    let x;
    if ((x = d('[data-fd-del]'))) { e.stopPropagation(); if (!confirm('Slette handelen med annonse, kvitteringer, e-poster og bilder?')) return; await api(`/finn/${x.dataset.fdDel}`, { method: 'DELETE' }); if (u.finnSel === +x.dataset.fdDel) { u.finnSel = null; S.finnDeal = null; } S.finn = await api('/finn'); return render(); }
    if ((x = d('[data-fd-filter]'))) { u.finnF = x.dataset.fdFilter; return render(); }
    if (d('[data-fd-add]')) { u.finnAdd = !u.finnAdd; if (u.finnAdd) { render(); el.querySelector('[data-fd-form="new"] [name=adUrl]')?.focus(); return; } u.finnAddF = null; return render(); }
    if (d('[data-fd-edit]')) { u.finnEdit = !u.finnEdit; return render(); }
    if ((x = d('[data-fd-act]'))) {
      // «Godkjenn» (kjøp: Mottatt → Godkjent) eller «Marker som sendt» (salg: Solgt → Sendt).
      const r = S.finn.items.find((y) => y.id === +x.dataset.fdAct);
      await api(`/finn/${r.id}`, { method: 'PATCH', json: { stage: r.role === 'sold' ? 2 : 4 } });
      toast(r.role === 'sold' ? `${r.item} er markert som sendt` : `${r.item} er godkjent`);
      await loadFinn(); return render();
    }
    if ((x = d('[data-fd-open]'))) { u.finnEdit = false; return open(+x.dataset.fdOpen); }
    if (d('[data-fd-close]')) { u.finnSel = null; S.finnDeal = null; return render(); }
    if ((x = d('[data-fd-stage]'))) { const n = +x.dataset.fdStage; S.finnDeal = await api(`/finn/${u.finnSel}`, { method: 'PATCH', json: { stage: n || null } }); S.finn = await api('/finn'); return render(); }
    if ((x = d('[data-fa-lbnav]'))) { const n = el.querySelectorAll('[data-fa-track] .fa-sl').length; u.finnLb = (u.finnLb + +x.dataset.faLbnav + n) % n; return render(); }
    if ((x = d('[data-fa-lbx]')) && (e.target === x || x.matches('button'))) { u.finnLb = null; return render(); }
    if ((x = d('[data-fa-lb]'))) { u.finnLb = +x.dataset.faLb; return render(); }
    if ((x = d('[data-fa-go]'))) { const tr = el.querySelector('[data-fa-track]'); tr?.scrollTo({ left: +x.dataset.faGo * tr.clientWidth, behavior: 'smooth' }); return; }
    if ((x = d('[data-fa-nav]'))) { const t = el.querySelector('[data-fa-track]'); t?.scrollBy({ left: +x.dataset.faNav * t.clientWidth, behavior: 'smooth' }); return; }
    if ((x = d('[data-fa-mail]')) && !d('[data-fd-rmmail]')) {
      const id = +x.dataset.faMail, ad = u.finnAd;
      u.finnMail = u.finnMail === id ? null : id; render();
      // Full tekst hentes fra /finn/:id/emails/:eid; finnes ikke ruten, brukes teksten som allerede ligger i handelen.
      if (u.finnMail === id && ad?.emails && ad.full[id] == null) {
        const r = await optional(`/finn/${u.finnSel}/emails/${id}`).catch(() => null);
        ad.full[id] = r?.body ?? r?.text ?? (typeof r === 'string' ? r : null) ?? S.finnDeal?.emails?.find((e) => e.id === id)?.body ?? ad.emails.find((e) => e.id === id)?.snippet ?? '';
        return render();
      }
      return;
    }
    if (d('[data-fa-refresh]')) {
      u.finnBusy = 'refresh'; render();
      const id = u.finnSel;
      try {
        const r = await api(`/finn/${id}/ad/refresh`, { method: 'POST' }).catch((er) => (er.status === 404 ? api(`/finn/${id}/ad`, { method: 'POST', json: {} }) : Promise.reject(er)));
        S.finnDeal = await api(`/finn/${id}`); await loadAd(id); toast(`✦ ${r?.message ?? 'Annonsen er hentet på nytt'}`);
      } finally { u.finnBusy = null; }
      return render();
    }
    if ((x = d('[data-fd-rmmail]'))) { S.finnDeal = await api(`/finn/${u.finnSel}/emails/${x.dataset.fdRmmail}`, { method: 'DELETE' }); u.finnMail = null; S.finn = await api('/finn'); await loadAd(u.finnSel); return render(); }
    if ((x = d('[data-fd-rmfile]'))) { S.finnDeal = await api(`/finn/${u.finnSel}/files/${x.dataset.fdRmfile}`, { method: 'DELETE' }); S.finn = await api('/finn'); return render(); }
  }));
  el.addEventListener('keydown', (e) => { if (u.page === 'finn' && (e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-fd-open],[data-fa-mail]')) { e.preventDefault(); e.target.click(); } });
  // Fullskjermbildet: ← → bytter bilde, Esc lukker.
  document.addEventListener('keydown', (e) => {
    if (u.page !== 'finn' || u.finnLb == null) return;
    const n = document.querySelectorAll('[data-fa-track] .fa-sl').length || 1;
    if (e.key === 'Escape') { u.finnLb = null; render(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { u.finnLb = (u.finnLb + (e.key === 'ArrowRight' ? 1 : -1) + n) % n; render(); }
  });
  // Telleren «1 / 4» følger sveip og pilene uten å tegne siden på nytt.
  el.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!t.matches?.('[data-fa-track]')) return;
    const n = t.children.length, i = Math.min(n - 1, Math.round(t.scrollLeft / Math.max(1, t.clientWidth)));
    if (i === u.finnAdI) return;
    u.finnAdI = i;
    const c = el.querySelector('[data-fa-cnt]');
    if (c && n > 1) c.textContent = `${i + 1} / ${n}`;
    el.querySelectorAll('.fa-th').forEach((b, k) => b.classList.toggle('on', k === i));
  }, true);
  el.addEventListener('input', (e) => {
    if (e.target.closest?.('[data-fa-send]')) u.finnMsg = e.target.value;
    if (e.target.closest?.('[data-fd-form="ad"]')) u.finnUrl = e.target.value;
    const nf = e.target.closest?.('[data-fd-form="new"]');
    if (nf) { const prev = u.finnAddF?.role; u.finnAddF = Object.fromEntries(new FormData(nf)); if (prev && prev !== u.finnAddF.role) render(); }
  });
  el.addEventListener('change', wrap(async (e) => {
    const inp = e.target.closest?.('[data-fd-file]');
    if (!inp || !inp.files?.length) return;
    const files = [...inp.files]; inp.value = '';
    await upload(inp.dataset.fdFile, files);
  }));
  el.addEventListener('submit', wrap(async (e) => {
    if (e.target.closest?.('[data-fa-send]')) {
      // Finn har ikke åpent chat-API: meldingen kopieres og samtalen åpnes i Finn, der den sendes.
      e.preventDefault();
      const msg = (u.finnMsg ?? '').trim(), m = adModel(S.finnDeal);
      if (!msg) return;
      try { await navigator.clipboard?.writeText(msg); } catch { /* ingen tilgang til utklippstavlen */ }
      if (m.chatUrl) window.open(m.chatUrl, '_blank', 'noopener');
      u.finnMsg = ''; toast('Meldingen er kopiert. Lim den inn i Finn for å sende.'); return render();
    }
    const f = e.target.closest?.('[data-fd-form]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    if (f.dataset.fdForm === 'new') {
      if (!v.adUrl?.trim() && (!v.item?.trim() || !(parseFloat(String(v.amount).replace(/\s/g, '').replace(',', '.')) > 0))) return toast('Lim inn en Finn-lenke, eller skriv tittel og pris');
      u.finnBusy = 'new'; render();
      const r = await api('/finn', { method: 'POST', json: { role: v.role, adUrl: v.adUrl?.trim() || undefined, item: v.item?.trim() || undefined, amount: v.amount?.trim() || undefined, counterpart: v.counterpart?.trim() || undefined } });
      u.finnBusy = null; u.finnAdd = false; u.finnAddF = null;
      toast(r.adError ? `${r.item} er lagt til, men annonsen ble ikke hentet: ${r.adError}` : `${r.item} er lagt til`);
      u.finnSel = r.id; await loadFinn(); return render();
    }
    if (f.dataset.fdForm === 'edit') {
      S.finnDeal = await api(`/finn/${u.finnSel}`, { method: 'PATCH', json: { item: v.item, amount: v.amount, counterpart: v.counterpart, date: v.date } });
      u.finnEdit = false; S.finn = await api('/finn'); toast('Lagret'); return render();
    }
    if (f.dataset.fdForm === 'paste') { const r = await api('/finn', { method: 'POST', json: v }); toast(`${r.item} lagt til`); f.reset(); u.finnSel = r.id; await loadFinn(); return render(); }
    if (f.dataset.fdForm === 'ad') {
      u.finnBusy = 'ad'; render();
      const r = await api(`/finn/${u.finnSel}/ad`, { method: 'POST', json: { url: v.url?.trim() || undefined } });
      u.finnBusy = null; u.finnUrl = null; S.finnDeal = r; S.finn = await api('/finn'); await loadAd(u.finnSel);
      toast(`✦ ${r.message ?? 'Annonsen er lagret'}`); return render();
    }
  }));
}

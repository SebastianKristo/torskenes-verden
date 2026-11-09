// Prompt 77 (SKJAIWEB): Glimt i Skjold Lab på web – smarte forslag for deler.
// - «✦ Foreslå» ved navnet i Ny/Endre del: POST /api/skjold/ai/suggest (tekst, og bilde når delen har et). Kortet viser navn,
//   kategori (merket «ny» når Glimt foreslår en ny), specs og tags, hver med ✓, og «Bruk alle». Ingenting endres før man trykker.
// - Nytt bilde (fil, kamera, dra-og-slipp) med «Foreslå automatisk» på: forslaget starter av seg selv («Glimt tenker …»).
// - «Finn bilde» ved bildene: POST /ai/images {q} gir opptil 12 kandidater (miniatyrer via serverens proxy, signerte id-er).
//   Trykk velger og viser forhåndsvisning; «Bruk bildet» lagrer via POST /parts/:id/photos/from-search {id}
//   (for en ny del: når delen lagres).
// - ⋯ → «Rydd opp med Glimt» (#/skjold/rydd[/<jobId>]): bakgrunnsjobb POST /ai/tidy, fremdrift GET /ai/tidy/:jobId,
//   gjennomgang med før/etter og avkrysning, «Godta valgte» = POST /ai/tidy/:jobId/apply {partIds}. «Hopp over» endrer ingenting.
// - ⚙ i Skjold Lab: «Finn bilder på nett» og «Foreslå automatisk når jeg tar bilde» (samme som Innstillinger → Moduler → Skjold Lab).
// Tidsavbrudd i klienten: 75 s med bilde, 40 s med bare tekst (serveren gir opp etter 60/30 s og svarer med norsk feiltekst).
import { esc } from './util.js';
import { toast } from './toast.js';
import { S, sk, paintMain, go, loadPart, refreshAll, photoUrls } from './skjold76.js';
import { set77, loadSet77, saveSet77 } from './settings-skjold77.js';
import { specsObj77, mergeSpecs77, mergeTags77, conf77, decodedLines77, suggRows77, tidyChanged77, tidyDefaultOn77, tidyRunning77 } from './skjold77-logic.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-sk77-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/skjold77.css'; l.dataset.sk77Css = ''; document.head.appendChild(l);
}

/** Tilstand utenfor skjemaet: menyen (⋯), ⚙-panelet og Rydd opp-jobben. */
export const A = { menu: false, gear: false, tidy: null };
const LS_TIDY = 'sk77_tidy';
const NET = 'Glimt trenger nett for å foreslå. Prøv igjen når du er tilkoblet.';

const SRC = { bilde: 'fra bildet', tekst: 'fra teksten', begge: 'fra bilde og tekst' };

/* ================= Forslag i Ny/Endre del ================= */

let aiSeq = 0;
const isNet = (e) => e instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);
const errText = (e) => (e?.name === 'AbortError' ? 'Glimt brukte for lang tid. Prøv igjen.' : isNet(e) ? NET : e?.message || 'Glimt fikk ikke til et forslag.');

/** Bildefilen (navn i skj_files) for en lagret del, når skjemaet ikke har fjernet den. */
function storedPhoto(F) {
  if (!F.id) return null;
  const list = Array.isArray(S.parts[F.id]?.photos) ? S.parts[F.id].photos : [];
  for (let i = 0; i < list.length; i++) {
    if (F.rm?.has(i)) continue;
    const x = list[i], n = typeof x === 'string' ? x : x?.name ?? x?.file;
    if (n && !/^(\/|https?:)/.test(n)) return n;
  }
  return null;
}
/** Starter et forslag. file = nytt bilde (multipart), ellers tekst + lagret bilde. auto = startet av et nytt bilde. */
export async function suggest77(F, { file = null, auto = false } = {}) {
  if (!F) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) { F.ai = { err: NET, auto }; paintMain(); return; }
  const seq = ++aiSeq, photo = file ? null : storedPhoto(F), img = !!(file || photo);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), img ? 75_000 : 40_000);
  F.ai = { busy: true, img, auto, seq, ctl, used: new Set() };
  paintMain();
  const specs = specsObj77(F.specs), base = { name: F.name.trim(), description: F.description.trim(), category: F.category.trim(), specs };
  // Lagret del der alle bildene er merket for sletting: ikke la serveren bruke delens første bilde.
  const noPhoto = !img && F.id && (S.parts[F.id]?.photos?.length ?? 0) > 0;
  let r;
  try {
    if (file) {
      const fd = new FormData();
      fd.append('file', file, file.name || 'bilde.jpg');
      if (F.id) fd.append('partId', F.id);
      for (const [k, v] of Object.entries(base)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
      const res = await fetch('/api/skjold/ai/suggest', { method: 'POST', body: fd, credentials: 'same-origin', signal: ctl.signal });
      const d = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      if (!res.ok) throw Object.assign(new Error(d?.error || `Glimt fikk ikke til et forslag (${res.status})`), { status: res.status });
      r = d;
    } else {
      r = await sk('/ai/suggest', { method: 'POST', json: { ...(F.id ? { partId: F.id } : {}), ...base, ...(photo ? { photo } : {}), ...(noPhoto ? { usePhoto: false } : {}) }, signal: ctl.signal });
    }
  } catch (e) {
    clearTimeout(timer);
    if (S.form !== F || F.ai?.seq !== seq) return;
    F.ai = e?.name === 'AbortError' && F.ai?.cancelled ? null : { err: errText(e), auto, img };
    paintMain(); return;
  }
  clearTimeout(timer);
  if (S.form !== F || F.ai?.seq !== seq) return;
  const s = r?.suggestion ?? r;
  F.ai = s && (s.name || s.category) ? { data: s, auto, img, used: new Set() } : { err: 'Glimt fant ikke noe å foreslå. Skriv litt mer i navnet eller legg til et bilde.', auto, img };
  paintMain();
}
/** Nytt bilde i skjemaet: start forslaget av seg selv når innstillingen er på. */
export function onNewPhotos77(F, files) {
  const f = (files ?? []).find((x) => /^image\//.test(x?.type ?? '') || /\.(heic|heif)$/i.test(x?.name ?? ''));
  if (!F || !f || F.ai?.busy || set77().autoSuggestOnPhoto === false) return;
  suggest77(F, { file: f, auto: true });
}
function applyRow(F, k) {
  const s = F.ai?.data; if (!s) return;
  if (k === 'name' && s.name) F.name = String(s.name);
  if (k === 'category' && s.category) F.category = String(s.category);
  if (k === 'specs') F.specs = mergeSpecs77(F.specs, s.specs);
  if (k === 'tags') F.tags = mergeTags77(F.tags, s.tags);
  F.ai.used.add(k);
}

/** Knappen ved navnet. */
export const suggestBtn77 = (F) => `<button type="button" class="sk77-sbtn" data-sk76e="ai-suggest"${F.ai?.busy ? ' disabled aria-busy="true"' : ''} title="Glimt foreslår navn, kategori og specs">✦ Foreslå</button>`;
/** Kortet under navnet (tom streng når det ikke er noe å vise). */
export function suggestCard77(F) {
  const a = F?.ai;
  if (!a) return '';
  if (a.busy) {
    return `<div class="sk77-card wide" role="status" aria-live="polite"><div class="sk77-think"><span class="sk77-spark" aria-hidden="true">✦</span><span><b>Glimt tenker …</b><small>${a.img ? 'Ser på bildet og leser navnet' : 'Leser navn, beskrivelse og specs'}${a.auto ? ' · startet av det nye bildet' : ''}</small></span><button type="button" class="sk76-link" data-sk76e="ai-cancel">Avbryt</button></div><span class="sk77-bar" aria-hidden="true"><i></i></span></div>`;
  }
  if (a.err) return `<div class="sk77-card wide err" role="alert"><p>${esc(a.err)}</p><div class="sk76-row"><button type="button" class="sk76-btn" data-sk76e="ai-suggest">Prøv igjen</button><button type="button" class="sk76-link" data-sk76e="ai-close">Lukk</button></div></div>`;
  const s = a.data, rows = suggRows77(F, s), c = conf77(s.confidence), dec = decodedLines77(s.decoded);
  const val = (r) => {
    if (r.k === 'specs') return `<span class="sk77-chips">${r.val.map(([k, v]) => `<span class="sk77-chip"><i>${esc(k)}</i> ${esc(v)}</span>`).join('')}</span>`;
    if (r.k === 'tags') return `<span class="sk77-chips">${r.val.map((t) => `<span class="sk77-chip">#${esc(t)}</span>`).join('')}</span>`;
    const old = String(r.cur ?? '').trim();
    return `<span class="sk77-nv">${old && !r.same ? `<s>${esc(old)}</s><span aria-hidden="true">→</span>` : ''}<b>${esc(r.val)}</b>${r.isNew ? '<em class="sk77-new">ny</em>' : ''}</span>`;
  };
  const left = rows.filter((r) => !r.same && !a.used.has(r.k));
  return `<div class="sk77-card wide" role="region" aria-label="Forslag fra Glimt">
    <div class="sk77-ch"><span class="sk76-kick">✦ GLIMT FORESLÅR</span>${c.pct != null ? `<span class="sk77-conf ${c.lvl}" title="${esc(`Sikkerhet: ${c.word}`)}">${c.pct} % sikker</span>` : ''}<button type="button" class="sk77-x" data-sk76e="ai-close" aria-label="Lukk forslaget">×</button></div>
    ${s.why || SRC[s.source] ? `<p class="sk77-why">${SRC[s.source] ? `<b>${esc(SRC[s.source].replace(/^./, (x) => x.toUpperCase()))}.</b> ` : ''}${esc(s.why ?? '')}</p>` : ''}
    ${dec.length ? `<p class="sk77-dec">${dec.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
    <ul class="sk77-rows" role="list">${rows.map((r) => { const on = r.same || a.used.has(r.k); return `<li class="${on ? 'on' : ''}"><span class="sk77-k">${esc(r.label)}</span>${val(r)}<button type="button" class="sk77-ok" data-sk76e="ai-use" data-k="${r.k}" aria-pressed="${on}" aria-label="${esc(on ? `${r.label}: brukt` : `Bruk ${r.label.toLowerCase()}`)}"${on ? ' disabled' : ''}>✓</button></li>`; }).join('')}</ul>
    <div class="sk76-row">${left.length ? `<button type="button" class="sk76-btn pri" data-sk76e="ai-all">Bruk alle</button>` : '<span class="sk76-mut">Alt er brukt. Husk å lagre.</span>'}<button type="button" class="sk76-btn" data-sk76e="ai-suggest">Foreslå på nytt</button></div>
  </div>`;
}

/* ================= Finn bilde ================= */

/** Knappen ved bildene. */
export const findBtn77 = () => '<button type="button" class="sk76-btn" data-sk76e="img-open">Finn bilde</button>';
/** Bilder fra nettet som venter på at en ny del lagres (vises sammen med de andre bildene). */
export const webPending77 = (F) => (F.web ?? []).map((w, i) => `<span class="sk76-pph new sk77-web"><img src="${esc(w.thumbUrl)}" alt="" loading="lazy"><i>nett</i><button type="button" data-sk76e="rm-web" data-i="${i}" aria-label="Fjern bildet">×</button></span>`).join('');
export function finderHtml77(F) {
  const I = F?.img;
  if (!I?.open) return '';
  const off = set77().webImages === false;
  const sel = I.sel != null ? I.items?.[I.sel] : null;
  let body = '';
  if (off) body = `<div class="sk77-msg"><p>«Finn bilder på nett» er slått av.</p><button type="button" class="sk76-btn" data-sk76e="img-enable">Slå på</button></div>`;
  else if (I.busy) body = '<p class="sk77-msg" role="status"><span class="sk77-spark" aria-hidden="true">✦</span> Leter etter bilder …</p>';
  else if (I.err) body = `<p class="sk77-msg err" role="alert">${esc(I.err)}</p>`;
  else if (sel) {
    body = `<div class="sk77-prev"><img src="${esc(/^\/(?!\/)/.test(sel.previewUrl ?? '') ? sel.previewUrl : sel.thumbUrl)}" alt="${esc(sel.title || 'Valgt bilde')}"><div><b>${esc(sel.title || 'Uten tittel')}</b><small>${esc([sel.source, sel.width && sel.height ? `${sel.width} × ${sel.height}` : ''].filter(Boolean).join(' · '))}</small>
      <p class="sk76-mut">${F.id ? 'Bildet lastes ned av serveren og legges til delen.' : 'Bildet legges til når delen lagres.'}</p>
      <div class="sk76-row"><button type="button" class="sk76-btn pri" data-sk76e="img-use"${I.saving ? ' disabled' : ''}>${I.saving ? 'Henter bildet …' : 'Bruk bildet'}</button><button type="button" class="sk76-btn" data-sk76e="img-back">Velg et annet</button></div></div></div>`;
  } else if (I.items) {
    body = I.items.length
      ? `<ul class="sk77-grid" role="list">${I.items.map((x, i) => `<li><button type="button" class="sk77-cand" data-sk76e="img-sel" data-i="${i}" aria-label="${esc(`Velg bilde ${i + 1}${x.title ? `: ${x.title}` : ''}`)}"><img src="${esc(x.thumbUrl)}" alt="" loading="lazy" decoding="async"><small>${esc(x.source || '')}</small></button></li>`).join('')}</ul>`
      : '<p class="sk77-msg">Fant ingen bilder. Prøv et annet søkeord.</p>';
  }
  return `<div class="sk77-find" role="region" aria-label="Finn bilde">
    <div class="sk77-fq"><input data-sk77-q type="search" enterkeyhint="search" aria-label="Søk etter bilde" value="${esc(I.q ?? '')}" placeholder="F.eks. ESP32-DevKitC V4"${off ? ' disabled' : ''}><button type="button" class="sk76-btn" data-sk76e="img-search"${off || I.busy ? ' disabled' : ''}>Søk</button><button type="button" class="sk77-x" data-sk76e="img-close" aria-label="Lukk bildesøket">×</button></div>
    ${body}
  </div>`;
}
async function imgSearch(F) {
  const I = F.img; if (!I) return;
  const inp = document.querySelector('#sk76 [data-sk77-q]'); if (inp) I.q = inp.value;
  const q = String(I.q ?? '').trim();
  if (!q) { I.err = 'Skriv hva du leter etter.'; paintMain(); return; }
  if (!navigator.onLine) { I.err = 'Bildesøk krever nett.'; paintMain(); return; }
  const seq = (I.seq = (I.seq ?? 0) + 1);
  Object.assign(I, { busy: true, err: '', items: null, sel: null }); paintMain();
  try {
    const r = await sk('/ai/images', { method: 'POST', json: { q } });
    if (S.form !== F || I.seq !== seq) return;
    // Bare miniatyrer via serverens proxy (sti på samme server), så nettleseren aldri henter fra tredjepart.
    I.items = (Array.isArray(r) ? r : r?.items ?? []).filter((x) => x?.id && /^\/(?!\/)/.test(String(x?.thumbUrl ?? ''))).slice(0, 12);
    if (!I.items.length && r?.message) I.err = r.message;
  } catch (e) {
    if (S.form !== F || I.seq !== seq) return;
    I.err = isNet(e) ? 'Bildesøk krever nett.' : e.message || 'Bildesøket feilet.';
  }
  I.busy = false; paintMain();
}
async function imgUse(F) {
  const I = F.img, x = I?.items?.[I.sel]; if (!x) return;
  if (!F.id) {
    F.web = [...(F.web ?? []), { id: x.id, thumbUrl: x.thumbUrl, title: x.title }];
    F.img = { ...I, sel: null }; F.img.open = false;
    toast('Bildet legges til når delen lagres'); paintMain(); return;
  }
  I.saving = true; paintMain();
  try {
    const r = await sk(`/parts/${encodeURIComponent(F.id)}/photos/from-search`, { method: 'POST', json: { id: x.id } });
    const p = r?.part ?? r;
    if (p?.id) { S.parts[F.id] = { ...(S.parts[F.id] ?? {}), ...p }; F.photos = photoUrls(S.parts[F.id]); } else await loadPart(F.id).then((q) => { if (q) F.photos = photoUrls(q); });
    if (S.form !== F) return;
    F.img = null; toast('Bildet er lagt til');
  } catch (e) {
    if (S.form !== F) return;
    I.saving = false; I.err = isNet(e) ? 'Endringer krever nett. Prøv igjen når du er tilkoblet.' : e.status === 410 || e.status === 404 ? 'Bildet er ikke tilgjengelig lenger. Søk på nytt.' : e.message || 'Fikk ikke hentet bildet.';
    I.sel = null;
  }
  paintMain();
}
/** For savePart i skjold76-edit.js: legger bilder fra nettet til en nylig lagret del. Feil gis videre som én melding. */
export async function saveWeb77(F, id) {
  const fails = [];
  for (const w of F.web ?? []) {
    try { await sk(`/parts/${encodeURIComponent(id)}/photos/from-search`, { method: 'POST', json: { id: w.id } }); } catch (e) { fails.push(e.message || 'feil'); }
  }
  F.web = [];
  if (fails.length) toast(`${fails.length === 1 ? 'Ett bilde' : `${fails.length} bilder`} fra nettet ble ikke lagt til: ${fails[0]}`, { ms: 5000 });
}

/** Klikk i skjemaet (fra editClick, etter readForm). true = håndtert. */
export function aiClick77(a, F) {
  const act = a.dataset.sk76e, i = +a.dataset.i;
  switch (act) {
    case 'ai-suggest': suggest77(F, { file: F.files?.[F.files.length - 1]?.file ?? null }); return true;
    case 'ai-cancel': if (F.ai?.busy) { F.ai.cancelled = true; F.ai.ctl?.abort(); F.ai = null; aiSeq++; paintMain(); } return true;
    case 'ai-close': F.ai = null; paintMain(); return true;
    case 'ai-use': applyRow(F, a.dataset.k); paintMain(); return true;
    case 'ai-all': for (const r of suggRows77(F, F.ai?.data)) if (!r.same) applyRow(F, r.k); paintMain(); toast('Forslaget er fylt inn. Husk å lagre.'); return true;
    case 'img-open': F.img = { open: true, q: F.img?.q || F.name.trim(), items: null }; paintMain(); loadSet77().then(() => { if (S.form === F && F.img?.open) { if (F.img.q && set77().webImages !== false) imgSearch(F); else paintMain(); } }); return true;
    case 'img-close': F.img = null; paintMain(); return true;
    case 'img-search': imgSearch(F); return true;
    case 'img-sel': if (F.img) { F.img.sel = i; paintMain(); document.querySelector('#sk76 .sk77-prev [data-sk76e="img-use"]')?.focus({ preventScroll: true }); } return true;
    case 'img-back': if (F.img) { F.img.sel = null; paintMain(); } return true;
    case 'img-use': imgUse(F); return true;
    case 'img-enable': saveSet77({ webImages: true }).then(() => { if (S.form === F) imgSearch(F); }).catch((e) => toast(e.message)); return true;
    case 'rm-web': F.web?.splice(i, 1); paintMain(); return true;
    default: return false;
  }
}
/** Fra editMount: Enter i bildesøket søker (i stedet for å lagre delen); innstillingene hentes. */
export function mountEdit77(form, F) {
  loadSet77();
  const q = form.querySelector('[data-sk77-q]');
  if (q) {
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); imgSearch(F); } });
    q.addEventListener('input', () => { if (F.img) F.img.q = q.value; });
    if (F.img?.open && !F.img.items && !F.img.busy) q.focus({ preventScroll: true });
  }
}

/* ================= ⋯-meny og ⚙ i toppen ================= */

export const headBtns77 = () => `<span class="sk77-hw"><button type="button" class="sk76-btn sk77-ib" data-sk77="gear" aria-label="Innstillinger for Glimt i Skjold Lab" aria-expanded="${A.gear}" title="Innstillinger">⚙</button><button type="button" class="sk76-btn sk77-ib" data-sk77="menu" aria-haspopup="menu" aria-expanded="${A.menu}" aria-label="Flere valg">⋯</button>${A.menu ? `<span class="sk77-menu" role="menu"><a role="menuitem" href="#/skjold/rydd" data-sk77="menu-go">✦ Rydd opp med Glimt</a><button type="button" role="menuitem" data-sk77="gear-open">⚙ Innstillinger</button></span>` : ''}</span>`;
export function gearHtml77() {
  if (!A.gear) return '';
  const s = set77();
  const sw = (k, t, sub) => `<button type="button" class="sk77-sw" role="switch" aria-checked="${!!s[k]}" data-sk77-set="${k}"><span><b>${esc(t)}</b><small>${esc(sub)}</small></span><i aria-hidden="true"></i></button>`;
  return `<div class="sk76-card sk77-gear" role="region" aria-label="Innstillinger for Glimt">
    <div class="sk77-ch"><span class="sk76-kick">GLIMT I SKJOLD LAB</span><button type="button" class="sk77-x" data-sk77="gear" aria-label="Lukk">×</button></div>
    ${sw('webImages', 'Finn bilder på nett', 'Søk etter bilde av delen via SearXNG eller Wikimedia Commons')}
    ${sw('autoSuggestOnPhoto', 'Foreslå automatisk når jeg tar bilde', 'Glimt foreslår navn, kategori og specs fra bildet')}
    <button type="button" class="sk76-link" data-sk77="all-settings">Alle innstillinger ›</button>
  </div>`;
}
const repaintHead = () => {
  const el = document.querySelector('#sk76 [data-sk77-head]'); if (el) el.innerHTML = headBtns77();
  const g = document.querySelector('#sk76 [data-sk77-gearbox]'); if (g) g.innerHTML = gearHtml77();
};
/** Klikk hvor som helst i Skjold Lab (fra bind i skjold76.js). true = håndtert. */
export function click77(t) {
  if (A.menu && !t.closest('.sk77-menu') && !t.closest('[data-sk77="menu"]')) { A.menu = false; repaintHead(); }
  const sw = t.closest('[data-sk77-set]');
  if (sw) { const k = sw.dataset.sk77Set; saveSet77({ [k]: !set77()[k] }).catch((e) => toast(`Fikk ikke lagret: ${e.message}`)).finally(repaintHead); repaintHead(); return true; }
  const b = t.closest('[data-sk77]'); if (!b) return !!t.closest('[data-sk77-tidy]') && tidyClick(t);
  switch (b.dataset.sk77) {
    case 'menu': A.menu = !A.menu; repaintHead(); if (A.menu) document.querySelector('#sk76 .sk77-menu [role="menuitem"]')?.focus(); return true;
    case 'menu-go': A.menu = false; repaintHead(); return false; // lenken navigerer
    case 'gear': A.gear = !A.gear; A.menu = false; if (A.gear) loadSet77(); repaintHead(); return true;
    case 'gear-open': A.gear = true; A.menu = false; loadSet77(); repaintHead(); return true;
    case 'all-settings': document.dispatchEvent(new CustomEvent('hl:open-settings', { detail: 'skjold' })); return true;
    default: return tidyClick(t);
  }
}
export function key77(e) {
  if (e.key === 'Escape' && (A.menu || A.gear)) { A.menu = false; A.gear = false; repaintHead(); document.querySelector('#sk76 [data-sk77="menu"]')?.focus(); return true; }
  return false;
}

/* ================= Rydd opp med Glimt ================= */

let pollT = 0;
const savedJob = () => { try { return localStorage.getItem(LS_TIDY) || null; } catch { return null; } };
const saveJob = (id) => { try { if (id) localStorage.setItem(LS_TIDY, id); else localStorage.removeItem(LS_TIDY); } catch { /* privat modus */ } };

/** Ruten #/skjold/rydd[/<jobId>] åpnes. */
export function startTidy77(r) {
  clearTimeout(pollT);
  const job = r.job ?? null;
  if (!job) {
    const prev = savedJob();
    A.tidy = { job: null, prev, scope: S.q || S.cat || S.low ? 'list' : 'all', busy: false, err: '' };
    paintMain(); return;
  }
  if (A.tidy?.job !== job) A.tidy = { job, d: null, sel: new Set(), seen: new Set(), applied: new Set(), err: '', busy: false };
  poll(job);
}
export function stopTidy77() { clearTimeout(pollT); }
async function poll(job) {
  clearTimeout(pollT);
  const T = A.tidy; if (!T || T.job !== job) return;
  try {
    const d = await sk(`/ai/tidy/${encodeURIComponent(job)}`);
    if (A.tidy !== T || S.route.v !== 'tidy') return;
    T.d = d; T.err = '';
    for (const it of d?.items ?? []) if (it.status === 'applied') T.sel.delete(String(it.partId));
    for (const it of d?.items ?? []) { const k = String(it.partId); if (!T.seen.has(k)) { T.seen.add(k); if (tidyDefaultOn77(it) && !T.applied.has(k)) T.sel.add(k); } }
  } catch (e) {
    if (A.tidy !== T) return;
    T.err = e.status === 404 ? 'gone' : isNet(e) ? 'Uten nett – fremdriften vises igjen når du er tilkoblet.' : e.message;
    if (e.status === 404) saveJob(null);
  }
  paintMain();
  if (S.route.v === 'tidy' && A.tidy === T && T.err !== 'gone' && (!T.d || tidyRunning77(T.d.state))) pollT = setTimeout(() => poll(job), T.err ? 5000 : 1500);
}
const fmtSpecs = (o) => Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ');
function itemHtml(T, it) {
  const k = String(it.partId), b = it.before ?? {}, a = it.after ?? {}, ch = tidyChanged77(it), c = conf77(it.confidence);
  const done = T.applied.has(k) || it.status === 'applied', on = T.sel.has(k);
  const note = it.status === 'pending' ? 'Venter på Glimt …' : it.status === 'error' ? it.error || 'Glimt fikk ikke til et forslag' : it.status === 'skipped' ? 'Hoppet over' : 'Ingen endring foreslått';
  const line = (label, from, to, extra = '') => (to && to !== from ? `<div class="sk77-ba"><span class="sk77-k">${label}</span><span class="sk77-nv">${from ? `<s>${esc(from)}</s><span aria-hidden="true">→</span>` : ''}<b>${esc(to)}</b>${extra}</span></div>` : '');
  const sNew = Object.fromEntries(Object.entries(a.specs ?? {}).filter(([kk, v]) => v != null && v !== '' && String(b.specs?.[kk] ?? '') !== String(v)));
  const tNew = (a.tags ?? []).filter((t) => !(b.tags ?? []).map((x) => String(x).toLowerCase()).includes(String(t).toLowerCase()));
  return `<li class="sk77-ti${done ? ' done' : ''}${ch ? '' : ' same'}">
    ${ch && !done && it.status !== 'skipped' ? `<input type="checkbox" class="sk77-cb" data-sk77-tidy="tog" data-id="${esc(k)}"${on ? ' checked' : ''} aria-label="${esc(`Godta forslaget for ${b.name ?? 'delen'}`)}">` : `<span class="sk77-cb0" aria-hidden="true">${done ? '✓' : '–'}</span>`}
    <div class="sk77-tb">
      <a class="sk77-tn" href="#/skjold/del/${encodeURIComponent(k)}">${esc(b.name ?? 'Del')}</a>
      ${ch ? `${line('Navn', b.name, a.name)}${line('Kategori', b.category, a.category, a.categoryNew ? '<em class="sk77-new">ny</em>' : '')}${Object.keys(sNew).length ? `<div class="sk77-ba"><span class="sk77-k">Specs</span><span class="sk77-nv">${esc(fmtSpecs(sNew))}</span></div>` : ''}${tNew.length ? `<div class="sk77-ba"><span class="sk77-k">Tags</span><span class="sk77-nv">${esc(tNew.map((t) => `#${t}`).join(' '))}</span></div>` : ''}` : `<span class="sk76-mut">${esc(note)}</span>`}
    </div>
    ${c.pct != null && ch ? `<span class="sk77-conf ${c.lvl}">${c.pct} %</span>` : done ? '<span class="sk77-conf hi">Lagret</span>' : ''}
  </li>`;
}
export function tidyHtml77() {
  const T = A.tidy;
  if (!T) return '<div class="sk76-card sk76-empty">Henter …</div>';
  const back = '<a class="sk76-back" href="#/skjold">‹ Alle deler</a>';
  if (!T.job) {
    const n = S.total || S.items.length, filt = !!(S.q || S.cat || S.low);
    return `<section class="sk76-card sk77-tidy">${back}
      <span class="sk76-kick">✦ GLIMT</span><h2 class="sk76-pname">Rydd opp med Glimt</h2>
      <p class="sk76-mut">Glimt går gjennom delene én om gangen og foreslår navn etter malen «Type Verdi Variant», kategori og specs. Ingenting endres før du godkjenner. Endringene står i historikken og kan angres.</p>
      ${T.err ? `<p class="sk76-warn" role="alert">${esc(T.err)}</p>` : ''}
      <fieldset class="sk77-scope"><legend class="sk76-kick">HVILKE DELER</legend>
        <label><input type="radio" name="sk77scope" value="all" data-sk77-tidy="scope"${T.scope === 'all' ? ' checked' : ''}> Alle delene</label>
        ${filt ? `<label><input type="radio" name="sk77scope" value="list" data-sk77-tidy="scope"${T.scope === 'list' ? ' checked' : ''}> Delene i lista nå (${esc(S.items.length)}${S.q ? ` for «${esc(S.q)}»` : S.cat ? ` i ${esc(S.cat)}` : ''})</label>` : ''}
      </fieldset>
      <div class="sk76-row"><button type="button" class="sk76-btn pri" data-sk77-tidy="start"${T.busy ? ' disabled' : ''}>${T.busy ? 'Starter …' : '✦ Start gjennomgangen'}</button>${T.prev ? `<a class="sk76-btn" href="#/skjold/rydd/${encodeURIComponent(T.prev)}">Fortsett forrige</a>` : ''}</div>
      ${n ? '' : '<p class="sk76-mut">Du har ingen deler ennå.</p>'}
    </section>`;
  }
  if (T.err === 'gone') return `<section class="sk76-card sk77-tidy">${back}<h2 class="sk76-pname">Rydd opp med Glimt</h2><p>Gjennomgangen finnes ikke lenger.</p><a class="sk76-btn pri" href="#/skjold/rydd">Start en ny</a></section>`;
  const d = T.d, items = d?.items ?? [], total = +d?.total || 0, done = +d?.done || 0, run = !d || tidyRunning77(d.state);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const st = String(d?.state ?? '').toLowerCase();
  const stText = !d ? 'Henter …' : run ? (['waiting', 'paused', 'yielding', 'venter'].includes(st) ? `Venter mens Glimt svarer deg · ${done} av ${total}` : `Glimt går gjennom delene · ${done} av ${total}`) : st === 'error' || st === 'failed' ? `Stoppet: ${d.error ?? 'noe gikk galt'}` : `Ferdig · ${total} ${total === 1 ? 'del' : 'deler'} gjennomgått`;
  const changed = items.filter((it) => tidyChanged77(it) && it.status !== 'applied' && it.status !== 'skipped' && !T.applied.has(String(it.partId)));
  const nSel = changed.filter((it) => T.sel.has(String(it.partId))).length;
  return `<section class="sk76-card sk77-tidy">${back}
    <span class="sk76-kick">✦ GLIMT</span><h2 class="sk76-pname">Rydd opp med Glimt</h2>
    <div class="sk77-prog" role="status" aria-live="polite"><span>${esc(stText)}</span><span class="sk77-pbar${run ? ' run' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Fremdrift"><i style="transform:scaleX(${pct / 100})"></i></span></div>
    ${T.err ? `<p class="sk76-warn" role="alert">${esc(T.err)}</p>` : ''}
    ${items.length ? `<div class="sk77-tbar"><span>${esc(`${changed.length} forslag${nSel ? ` · ${nSel} valgt` : ''}`)}</span><button type="button" class="sk76-link" data-sk77-tidy="all">Velg alle</button><button type="button" class="sk76-link" data-sk77-tidy="none">Velg ingen</button></div>
      <ul class="sk77-tl" role="list">${items.map((it) => itemHtml(T, it)).join('')}</ul>` : `<p class="sk76-mut sk76-pad">${run ? 'Forslagene dukker opp her etter hvert.' : 'Ingen forslag.'}</p>`}
    <div class="sk77-tfoot"><button type="button" class="sk76-btn pri" data-sk77-tidy="apply"${!nSel || T.busy ? ' disabled' : ''}>${T.busy ? 'Lagrer …' : `Godta valgte${nSel ? ` (${nSel})` : ''}`}</button><button type="button" class="sk76-btn" data-sk77-tidy="skip">Hopp over</button></div>
  </section>`;
}
async function tidyStart() {
  const T = A.tidy; if (!T || T.busy) return;
  if (!navigator.onLine) { T.err = NET; paintMain(); return; }
  T.busy = true; T.err = ''; paintMain();
  const body = T.scope === 'list' && (S.q || S.cat || S.low) ? { partIds: S.items.map((p) => p.id) } : { all: true };
  try {
    const res = await fetch('/api/skjold/ai/tidy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    const r = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    // 409 = en gjennomgang kjører allerede: vis den.
    if (!res.ok && !(res.status === 409 && r?.jobId)) throw Object.assign(new Error(r?.error || `Fikk ikke startet (${res.status})`), { status: res.status });
    if (res.status === 409) toast(r.error || 'Rydd opp kjører allerede');
    const id = r?.jobId ?? r?.id; if (!id) throw new Error('Serveren startet ikke jobben.');
    saveJob(id); go(`#/skjold/rydd/${encodeURIComponent(id)}`);
  } catch (e) { if (A.tidy === T) { T.busy = false; T.err = isNet(e) ? NET : e.message; paintMain(); } }
}
async function tidyApply() {
  const T = A.tidy; if (!T?.job || T.busy) return;
  const ids = (T.d?.items ?? []).map((it) => String(it.partId)).filter((k) => T.sel.has(k) && !T.applied.has(k));
  if (!ids.length) return;
  if (!navigator.onLine) { toast('Endringer krever nett. Prøv igjen når du er tilkoblet.'); return; }
  T.busy = true; paintMain();
  let r;
  try { r = await sk(`/ai/tidy/${encodeURIComponent(T.job)}/apply`, { method: 'POST', json: { partIds: ids.map((x) => (/^\d+$/.test(x) ? +x : x)) } }); } catch (e) {
    T.busy = false; T.err = isNet(e) ? 'Endringer krever nett. Prøv igjen når du er tilkoblet.' : e.message; paintMain(); return;
  }
  T.busy = false;
  const ok = Array.isArray(r?.applied) ? r.applied.map((x) => String(x?.partId ?? x?.id ?? x)) : ids;
  for (const k of ok) { T.applied.add(k); T.sel.delete(k); }
  if (r?.job?.items) T.d = r.job;
  // Hver godkjent del er én «endret»-hendelse i historikken: Angre = POST /history/<id>/undo for hver.
  const undo = Array.isArray(r?.applied) ? r.applied.map((x) => x?.historyId).filter((x) => x != null) : Array.isArray(r?.undo) ? r.undo : [];
  const skipped = Array.isArray(r?.skipped) ? r.skipped : [];
  const n = ok.length;
  const msg = `${n === 1 ? 'Én del' : `${n} deler`} oppdatert${skipped.length ? ` · ${skipped.length} hoppet over (${skipped[0].reason ?? 'endret'})` : ''}`;
  toast(msg, undo.length ? { action: 'Angre', ms: 10_000, onAction: () => tidyUndo(undo, ok) } : { ms: 4000 });
  paintMain(); refreshAll();
}
async function tidyUndo(undo, ids) {
  let fail = 0;
  for (const u of undo) { const hid = typeof u === 'object' ? u.historyId ?? u.id : u; try { await sk(`/history/${encodeURIComponent(hid)}/undo`, { method: 'POST' }); } catch { fail++; } }
  const T = A.tidy; if (T) for (const k of ids) T.applied.delete(k);
  toast(fail ? `${fail} endringer kunne ikke angres` : 'Endringene er angret');
  paintMain(); refreshAll();
}
function tidyClick(t) {
  const b = t.closest('[data-sk77-tidy]'); if (!b) return false;
  const T = A.tidy; if (!T) return false;
  const act = b.dataset.sk77Tidy;
  if (act === 'scope') { T.scope = b.value; return true; }
  if (act === 'start') { tidyStart(); return true; }
  if (act === 'tog') { const k = b.dataset.id; if (b.checked) T.sel.add(k); else T.sel.delete(k); paintMain(); document.querySelector(`#sk76 [data-sk77-tidy="tog"][data-id="${CSS.escape(k)}"]`)?.focus({ preventScroll: true }); return true; }
  if (act === 'all') { for (const it of T.d?.items ?? []) if (tidyChanged77(it) && !T.applied.has(String(it.partId))) T.sel.add(String(it.partId)); paintMain(); return true; }
  if (act === 'none') { T.sel.clear(); paintMain(); return true; }
  if (act === 'apply') { tidyApply(); return true; }
  if (act === 'skip') {
    // Hopp over: ingenting endres. Forslagene som står igjen merkes som hoppet over, og en jobb som kjører stoppes.
    clearTimeout(pollT);
    if (T.job) {
      const enc = encodeURIComponent(T.job);
      sk(`/ai/tidy/${enc}/skip`, { method: 'POST', json: { all: true } }).catch(() => {});
      if (T.d && tidyRunning77(T.d.state)) sk(`/ai/tidy/${enc}`, { method: 'DELETE' }).catch(() => {});
      saveJob(null);
    }
    A.tidy = null; toast(T.applied.size ? 'Resten er hoppet over' : 'Ingenting er endret'); go('#/skjold'); return true;
  }
  return false;
}
/** Ruteobjekt for #/skjold/rydd[/<id>] (fra parseHash i skjold76.js). */
export const tidyRoute77 = (seg) => (seg[1] === 'rydd' ? { v: 'tidy', job: seg[2] || null } : null);

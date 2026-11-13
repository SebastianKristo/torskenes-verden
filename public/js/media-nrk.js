// NRK-nedlaster i Media (#/media/nrk). Lim inn en lenke fra tv.nrk.no / radio.nrk.no → nrk-dl laster ned bak en egen
// VPN-tunnel til Norge og lagrer i /data/media/{tv,movies,podcast}. Alt går via /api/media/nrk/* (server/nrkdl.js);
// nettleseren ser aldri adressen eller tokenet til nrk-dl.
// media43.js lager en vert-<div> (som avspillingssiden) og kaller mountNrk(host) hver gang Media tegnes på nytt, så
// skjemaet ikke mister det du skriver når resten av siden oppdateres.
//
// Prompt 87 (pakke 57, fasit «Media NRK.dc.html»): hele bredden (rutenett med Køen over to rader), VPN-merke og banner,
// pille-valg, komprimering (H.265), og Bibliotek med plakater, sesonger og episoder. Hvert kort tegnes på nytt bare når
// innholdet faktisk er endret, så plakater ikke blinker og lenkefeltet får stå i fred mens køen oppdateres.
//
// Prompt 88 (pakke 58, fasit «Media NRK.dc.html»): kort 1 heter «NRK» og har søk øverst (GET /sok), kvalitet og
// komprimering, treff i et rutenett med 16:9-bilder, og serieside (GET /serie/:sid og /serie/:sid/sesong/:navn) med
// avkrysning per episode og klebrig bunnlinje. Lenkefeltet er sekundært («Har du en lenke?»). «Serier du følger» har
// plakat (bilde fra serveren via bildeproxyen, kvadratisk for radio). Bibliotek er beholdt under (appene har det også);
// en serie der åpner seriesiden i kort 1.
import { esc } from './util.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-nrk-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media-nrk.css'; l.dataset.nrkCss = ''; document.head.appendChild(l);
}

export const NRK_RE = /^https?:\/\/([a-z0-9-]+\.)*(nrk\.no|nrksuper\.no)(\/|$)/i;
const BARE_NRK = 'Bare lenker fra nrk.no og nrksuper.no.';
const I_KO = 'Lenken ligger allerede i køen.';
const GAMMEL = 'Biblioteket krever en nyere versjon av nrk-dl.';
const KVAL = [['best', 'Beste'], ['1080', '1080p'], ['720', '720p'], ['540', '540p']];
const STATUS = { ko: ['I KØ', 'mt'], kjorer: ['LASTER NED', 'bl'], ferdig: ['FERDIG', 'ok'], feil: ['FEIL', 'rd'], avbrutt: ['AVBRUTT', 'mt'] };
const EP_STATUS = { lastet: ['LASTET NED', 'ok'], laster: ['LASTER NED', 'bl'], ko: ['I KØ', 'mt'], mangler: ['MANGLER', 'mt'] };
const FILTER = [['alle', 'Alle'], ['tv', 'Serier'], ['film', 'Filmer'], ['radio', 'Radio']];
const FLATER = ['#3b2f28', '#2b3d52', '#7a2e22', '#3c4a3e', '#4a4036', '#2f3a46', '#2e5a5e', '#6a4a1e'];

const S = {
  host: null, timer: 0, d: null, st: null, stAt: 0, err: '',
  url: '', ferr: '', busy: false, kval: 'best', komp: null, lenkeApen: false, // komp null = serverens standard
  q: '', sokQ: '', treff: null, sokLaster: false, sokErr: '', sokNr: 0, sokT: 0, // søket
  ser: null, serTittel: '', serData: {}, sesData: {}, si: {}, pick: new Set(), serr: '', fbusy: false, badImg: new Set(), // seriesiden
  open: new Set(), sj: null,
  lib: null, libAt: 0, lerr: '', lf: 'alle', lsel: null, lss: {}, det: {}, detLaster: null, opt: new Map(), lbusy: false, ferdigSig: '',
};

const nb = (n, d = 0) => (+n || 0).toLocaleString('nb-NO', { maximumFractionDigits: d });
const fart = (b) => (!b ? '' : b >= 1e6 ? `${nb(b / 1e6, 1)} MB/s` : `${nb(b / 1e3)} kB/s`);
const igjen = (s) => (!s ? '' : s >= 3600 ? `${Math.floor(s / 3600)} t ${Math.round((s % 3600) / 60)} min igjen` : s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s igjen` : `${Math.round(s)} s igjen`);
const siden = (t) => { if (!t) return 'aldri'; const m = Math.round((Date.now() / 1000 - t) / 60); return m < 1 ? 'nå nettopp' : m < 60 ? `${m} min siden` : m < 2880 ? `${Math.round(m / 60)} t siden` : `${Math.round(m / 1440)} d siden`; };
const spart = (b) => `Spart ${b >= 1e9 ? `${nb(b / 1e9, 1)} GB` : `${nb(b / 1e6)} MB`} med komprimering`;
const ant = (n, en, fl) => `${n} ${n === 1 ? en : fl}`;
const flate = (t) => { let h = 0; for (const c of String(t)) h = (h * 31 + c.codePointAt(0)) >>> 0; return FLATER[h % FLATER.length]; };
const vpnOk = () => S.st?.vpn?.ok === true;
const vpnStoppet = () => !!S.st && S.st.configured !== false && !S.st.feil && S.st.vpn?.ok === false;
const kompStd = () => S.st?.komprimer?.standard === true;
const kompNa = () => S.komp ?? kompStd();
const kompValg = () => (S.st?.komprimer && kompNa() !== kompStd() ? { komprimer: kompNa() } : {});
const gb = (b) => (b >= 1e12 ? `${nb(b / 1e12, 2)} TB` : `${nb(b / 1e9, 1)} GB`);

async function api(path, opt = {}) {
  const r = await fetch(`/api/media/nrk${path}`, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || (r.status === 404 ? 'Serveren har ikke NRK-nedlasteren ennå – oppdater Homelab.' : `Serveren svarte ${r.status}`)), { status: r.status, configured: d?.configured });
  return d ?? {};
}
const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });

/* ---------------- Henting ---------------- */

async function load() {
  try {
    const [d, st] = await Promise.all([api('/jobber'), S.st && !S.st.feil && Date.now() - S.stAt < 9000 ? S.st : api('/status').catch((e) => ({ feil: e.message }))]);
    S.d = d; if (st !== S.st) { S.st = st; S.stAt = Date.now(); }
    S.err = '';
  } catch (e) { S.err = e.message; }
  // Når en jobb blir ferdig har biblioteket fått nye filer.
  const sig = (S.d?.jobber ?? []).filter((j) => j.status === 'ferdig').map((j) => `${j.id}:${j.filer?.length ?? 0}`).join(',');
  const nyttFerdig = S.ferdigSig !== '' && sig !== S.ferdigSig; S.ferdigSig = sig || '-';
  if (S.d?.configured !== false && !S.err && (nyttFerdig || Date.now() - S.libAt > 60_000)) loadLib();
  if (nyttFerdig && S.ser) { const Z = sesong(serie()); if (Z) loadSes(S.ser, Z.navn, true); }
  render();
}

async function loadLib() {
  S.libAt = Date.now();
  try { S.lib = await api('/bibliotek'); S.lerr = ''; } catch (e) { S.lerr = e.message; }
  if (S.lsel && S.host?.isConnected) loadDet(valgt(), true);
  render();
}

/** Hele serien fra NRK (også episoder som ikke er lastet ned). Biblioteket vises straks; dette fyller på. */
async function loadDet(x, stille = false) {
  if (!x?.url || x.type === 'film') return;
  if (!stille) { S.detLaster = x.id; render(); }
  try {
    const d = await api(`/serie?url=${encodeURIComponent(x.url)}`);
    if (d.tilgjengelig !== false) { const el = d.element ?? d; if (Array.isArray(el.sesonger) && el.sesonger.length) S.det[x.id] = el; }
  } catch { /* biblioteket har uansett det som er lastet ned */ }
  if (S.detLaster === x.id) S.detLaster = null;
  render();
}

/* ---------------- Søk og serieside ---------------- */

async function sok() {
  clearTimeout(S.sokT);
  const q = S.q.trim(), nr = ++S.sokNr;
  if (q.length < 2) { S.sokQ = ''; S.treff = null; S.sokErr = ''; S.sokLaster = false; return render(); }
  S.sokLaster = true; S.sokErr = ''; if (q !== S.sokQ) { S.sokQ = q; S.treff = null; } render();
  try {
    const d = await api(`/sok?q=${encodeURIComponent(q)}`);
    if (nr !== S.sokNr) return;
    S.treff = d.tilgjengelig === false ? [] : d.treff ?? [];
    if (d.tilgjengelig === false && S.st) S.st = { ...S.st, bibliotek: false };
  } catch (e) { if (nr !== S.sokNr) return; S.sokErr = e.message; S.treff = []; }
  S.sokLaster = false; render();
}

async function apneSerie(sid, tittel = '') {
  S.ser = sid; S.serTittel = tittel; S.serr = ''; S.pick = new Set();
  render();
  S.host?.querySelector('[data-k="form"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (!S.serData[sid] || S.serData[sid].feil) await loadSerie(sid);
}
async function loadSerie(sid) {
  delete S.serData[sid]; render();
  try {
    const d = await api(`/serie/${encodeURIComponent(sid)}`);
    S.serData[sid] = d.tilgjengelig === false ? { feil: GAMMEL } : d;
  } catch (e) { S.serData[sid] = { feil: e.message }; }
  render();
  const Z = sesong(S.serData[sid]);
  if (Z && !S.sesData[`${sid}/${Z.navn}`]) loadSes(sid, Z.navn);
}
async function loadSes(sid, navn, stille = false) {
  const k = `${sid}/${navn}`;
  if (!stille) { delete S.sesData[k]; render(); }
  try {
    const d = await api(`/serie/${encodeURIComponent(sid)}/sesong/${encodeURIComponent(navn)}`);
    S.sesData[k] = d.tilgjengelig === false ? { feil: GAMMEL, episoder: [] } : { episoder: d.episoder ?? [] };
  } catch (e) { if (!stille || !S.sesData[k]) S.sesData[k] = { feil: e.message, episoder: [] }; }
  render();
}

function schedule() {
  clearTimeout(S.timer);
  if (!S.host?.isConnected) return; // fanen vises ikke lenger: stopp
  const aktiv = (S.d?.jobber ?? []).some((j) => j.status === 'ko' || j.status === 'kjorer');
  S.timer = setTimeout(async () => { if (!S.host?.isConnected) return; if (!document.hidden) await load(); schedule(); }, aktiv ? 2000 : 10000);
}

/* ---------------- Kort 1: NRK (søk, serieside og lenke) ---------------- */

function vpnHtml() {
  const s = S.st;
  if (!s) return '';
  if (s.feil) return `<span class="nrk-vpn rd" title="${esc(s.feil)}"><i></i>Ingen kontakt</span>`;
  const v = s.vpn ?? {};
  return v.ok
    ? `<span class="nrk-vpn ok" title="All trafikk til NRK går gjennom VPN-tunnelen"><i></i>VPN · ${esc(v.land ?? 'NO')}${v.ip ? ` · ${esc(v.ip)}` : ''}</span>`
    : `<span class="nrk-vpn rd" title="${esc(v.feil ?? 'Køen står stille til tunnelen er i Norge')}"><i></i>VPN nede – stoppet</span>`;
}
const piller = (L, cur, k) => L.map(([v, t]) => `<button type="button" class="nrk-p${v === cur ? ' on' : ''}" data-nrk-set="${k}" data-v="${v}" aria-pressed="${v === cur}">${t}</button>`).join('');
const img = (src, cls = '') => (src && !S.badImg.has(src) ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(src)}" alt="" loading="lazy" decoding="async">` : '');
const sokMulig = () => !(S.st && !S.st.feil && S.st.bibliotek === false);

/** Øverst i kortet: tittel, VPN, søkefeltet og valgene. Teksten i feltet ligger ikke i HTML-en (den settes etter tegning). */
function toppHtml() {
  const k = S.st?.komprimer;
  const komp = k ? `<button type="button" class="nrk-chk" role="checkbox" aria-checked="${kompNa()}" data-nrk-a="komp"><span class="nrk-box${kompNa() ? ' on' : ''}" aria-hidden="true">${kompNa() ? '✓' : ''}</span><span class="nrk-tx"><b>Komprimer (H.265, ca. halv størrelse)</b><span>${kompStd() ? 'På' : 'Av'} som standard på serveren${k.crf != null ? ` · crf ${esc(k.crf)}` : ''}${k.preset ? ` · ${esc(k.preset)}` : ''}</span></span></button>` : '';
  return `<div class="nrk-hd"><h2 class="nrk-h stor">NRK</h2>${vpnHtml()}</div>
    <form data-nrk-sok class="nrk-sok" role="search" autocomplete="off">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input name="nrkq" type="search" enterkeyhint="search" placeholder="Søk i NRK TV og NRK Radio" aria-label="Søk i NRK" spellcheck="false"${sokMulig() ? '' : ' disabled'}>
      <button type="button" class="nrk-x" data-nrk-a="tom" aria-label="Tøm søk" hidden>×</button>
    </form>
    <div class="nrk-valg"><div class="nrk-grp"><span class="nrk-lbl" id="nrk-lk">KVALITET</span><div class="nrk-seg" role="group" aria-labelledby="nrk-lk">${piller(KVAL, S.kval, 'kval')}</div></div>${komp}</div>`;
}

const ART_MERKE = { serie: 'SERIE', film: 'FILM', radio: 'RADIO', episode: 'EPISODE' };
const aktivUrl = (u) => (S.d?.jobber ?? []).some((j) => (j.status === 'ko' || j.status === 'kjorer') && (j.url === u || (j.urls ?? []).includes(u)));
function treffHtml(t, i) {
  const iKo = t.art !== 'serie' && (aktivUrl(t.url) || S.opt.has(t.url));
  return `<button type="button" class="nrk-tr${t.tilgjengelig === false ? ' av' : ''}" data-nrk-a="treff" data-i="${i}">
    <span class="nrk-tile" style="background:${flate(t.tittel)}"><b>${esc(t.tittel)}</b>${img(t.bilde)}<span class="nrk-bdg l">${ART_MERKE[t.art] ?? 'NRK'}</span>${iKo ? '<span class="nrk-bdg r ok">I KØ</span>' : t.tilgjengelig === false ? '<span class="nrk-bdg r">IKKE TILGJENGELIG</span>' : ''}</span>
    <span class="nrk-trt"><b>${esc(t.tittel)}</b>${t.beskrivelse ? `<span>${esc(t.beskrivelse)}</span>` : ''}</span></button>`;
}
function lenkeHtml() {
  return `<details class="nrk-lenke"${S.lenkeApen || !sokMulig() ? ' open' : ''}><summary>Har du en lenke?</summary>
    <form data-nrk-f class="nrk-in${S.ferr ? ' bad' : ''}" autocomplete="off" novalidate>
      <input name="nrkurl" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://tv.nrk.no/serie/…" aria-label="Lenke fra NRK"${S.ferr ? ' aria-invalid="true"' : ''}>
      <button type="submit" class="nrk-go"${S.busy ? ' disabled' : ''}>${S.busy ? 'Legger til …' : 'Legg i køen'}</button>
    </form>
    ${S.ferr ? `<div class="nrk-ferr" role="alert">${esc(S.ferr)}</div>` : ''}</details>`;
}
function sokHtml() {
  const q = S.sokQ, T = S.treff ?? [];
  const sum = !sokMulig() ? 'Søket krever en nyere versjon av nrk-dl. Bruk lenkefeltet under.'
    : S.sokLaster && !T.length ? 'Søker …' : q ? `${T.length} treff` : 'Søk etter serier, filmer og podkaster.';
  return `<div class="nrk-res"><span class="nrk-sum" aria-live="polite">${esc(sum)}</span>
    ${S.sokErr ? `<div class="nrk-ferr" role="alert">${esc(S.sokErr)}</div>` : ''}
    ${T.length ? `<div class="nrk-treff">${T.map(treffHtml).join('')}</div>` : ''}
    ${q && !S.sokLaster && !S.sokErr && !T.length ? `<div class="nrk-tom">Ingen treff på «${esc(q)}».</div>` : ''}
    ${lenkeHtml()}</div>`;
}

const MND = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
/** «2026-01-05» (eller en full ISO-tid) → «5. jan. 2026»; annen tekst vises som den er. */
export function dato(v) {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[3]}. ${MND[+m[2] - 1] ?? ''} ${m[1]}` : String(v ?? '');
}
const sesNavn = (z) => (/^\d{4}$/.test(z.navn) ? z.navn : z.tittel || `Sesong ${z.navn}`);
const serie = () => S.serData[S.ser];
/** Valgt sesong: den brukeren trykket på, ellers den nyeste som har episoder. */
function sesong(x) {
  const SS = x?.sesonger ?? [];
  const valgt = SS.find((z) => z.navn === S.si[S.ser] && z.tilgjengelig);
  return valgt ?? [...SS].reverse().find((z) => z.tilgjengelig) ?? null;
}
const epKo = (e) => e.iKo || S.opt.has(e.url) || aktivUrl(e.url);
const kanVelges = (e) => e.kan && !e.lastetNed && !epKo(e);
const folgAv = (sid) => (S.d?.folger ?? []).find((f) => { try { const u = new URL(f.url); return u.hostname === 'tv.nrk.no' && u.pathname.split('/')[2]?.toLowerCase() === sid; } catch { return false; } });

function epHtml(e) {
  const ok = kanVelges(e), on = ok && S.pick.has(e.id);
  const [merke, c] = !e.kan ? [e.label || 'Ikke tilgjengelig', 'mt'] : e.lastetNed ? ['Lastet ned', 'ok'] : epKo(e) ? ['I kø', 'bl'] : ['', ''];
  const sub = [dato(e.dato), e.varighetTekst].filter(Boolean).join(' · ');
  return `<button type="button" class="nrk-er${ok ? '' : ' av'}" data-nrk-a="ept" data-id="${esc(e.id)}"${ok ? ` aria-pressed="${on}"` : ' disabled'}>
    <span class="nrk-box${on ? ' on' : e.lastetNed ? ' har' : ''}" aria-hidden="true">${on || e.lastetNed ? '✓' : ''}</span>
    <span class="nrk-th" style="background:${flate(serie()?.tittel ?? '')}">${img(e.bilde)}</span>
    <span class="nrk-ett"><b>${esc(e.tittel)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
    ${merke ? `<span class="nrk-chip ${c}">${esc(merke)}</span>` : ''}</button>`;
}
function serieHtml() {
  const x = serie(), sid = S.ser, t0 = S.serTittel || sid;
  const hero = (tittel, kat, d, bilde) => `<div class="nrk-hero" style="background:${flate(tittel)}">${img(bilde)}<span class="nrk-grad"></span>
    <button type="button" class="nrk-back" data-nrk-a="sok-tilbake">‹ Søk</button>
    <div class="nrk-ht">${kat ? `<span class="nrk-kat">${esc(kat)}</span>` : ''}<h3>${esc(tittel)}</h3>${d ? `<p>${esc(d)}</p>` : ''}</div></div>`;
  if (!x || x.feil) return `<div class="nrk-ser">${hero(t0, '', '')}<p class="nrk-tom"${x?.feil ? ' role="alert"' : ''}>${esc(x?.feil ?? 'Henter serien fra NRK …')}</p>${x?.feil ? '<div class="nrk-acts"><button type="button" class="nrk-b" data-nrk-a="ser-igjen">Prøv igjen</button></div>' : ''}</div>`;
  const SS = x.sesonger ?? [], Z = sesong(x), n = SS.filter((z) => z.tilgjengelig).length;
  const kat = [x.kategori ? x.kategori.toUpperCase() : '', n ? `${n} ${n === 1 ? 'SESONG' : 'SESONGER'}` : ''].filter(Boolean).join(' · ');
  const tabs = SS.length ? `<div class="nrk-tabs" role="group" aria-label="Sesong">${SS.map((z) => `<button type="button" class="nrk-p${z === Z ? ' on' : ''}" data-nrk-a="ses" data-v="${esc(z.navn)}" aria-pressed="${z === Z}"${z.tilgjengelig ? '' : ' disabled title="Ingen episoder tilgjengelig"'}>${esc(sesNavn(z))}</button>`).join('')}</div>` : '';
  const k = Z ? `${sid}/${Z.navn}` : '', E = S.sesData[k];
  const liste = !Z ? '<p class="nrk-tom">Ingen episoder tilgjengelig hos NRK akkurat nå.</p>'
    : !E ? '<p class="nrk-tom">Henter episodene …</p>'
      : E.feil ? `<p class="nrk-tom" role="alert">${esc(E.feil)}</p>`
        : E.episoder.length ? `<div class="nrk-eliste">${E.episoder.map(epHtml).join('')}</div>` : '<p class="nrk-tom">Ingen episoder i denne sesongen.</p>';
  const L = E?.episoder ?? [], ok = L.filter(kanVelges), valgte = ok.filter((e) => S.pick.has(e.id));
  const f = folgAv(sid), alle = valgte.length === ok.length && ok.length > 0;
  return `<div class="nrk-ser">${hero(x.tittel, kat, x.beskrivelse, x.bilde)}${tabs}${liste}
    <div class="nrk-bunnlinje">
      <div class="nrk-bl">
        <button type="button" class="nrk-b" data-nrk-a="velg-alle"${ok.length ? '' : ' disabled'}>${alle ? 'Fjern valg' : `Velg alle tilgjengelige (${ok.length})`}</button>
        <button type="button" class="nrk-b${f ? ' folger' : ''}" data-nrk-a="folg-serie"${S.fbusy ? ' disabled' : ''}>${f ? '✓ Følger serien' : 'Følg serien'}</button>
        <button type="button" class="nrk-b ink nrk-hent" data-nrk-a="hent"${valgte.length && !S.lbusy ? '' : ' disabled'}>${S.lbusy ? 'Legger i køen …' : `Last ned ${valgte.length} episode${valgte.length === 1 ? '' : 'r'}`}</button>
      </div>
      ${S.serr ? `<div class="nrk-ferr" role="alert">${esc(S.serr)}</div>` : ''}
      <span class="nrk-hjelp">Følg serien laster ned nye episoder fremover (de to nyeste sesongene), ikke hele arkivet.</span>
    </div></div>`;
}
const kroppHtml = () => (S.ser ? serieHtml() : sokHtml());

/* ---------------- Kort 2: Køen ---------------- */

function jobbHtml(j) {
  const [st, farge] = STATUS[j.status] ?? [String(j.status ?? '').toUpperCase(), 'mt'];
  const run = j.status === 'kjorer', venter = vpnStoppet() && (run || j.status === 'ko');
  const komprimerer = run && /^komprimerer/i.test(j.melding ?? '');
  const pst = Math.max(0, Math.min(100, Math.round(j.prosent ?? 0)));
  const tall = run ? [`${pst} %`, komprimerer ? `H.265${S.st?.komprimer?.crf != null ? ` · crf ${S.st.komprimer.crf}` : ''}` : fart(j.fart), igjen(j.eta), j.av ? `${j.nr ?? 1} av ${j.av}` : ''].filter(Boolean) : [];
  const knapp = (a, t, cls = '') => `<button type="button" class="nrk-b${cls}" data-nrk-a="${a}" data-id="${esc(j.id)}">${t}</button>`;
  const knapper = [
    (run || j.status === 'ko') && knapp('avbryt', 'Avbryt', ' rd'),
    (j.status === 'feil' || j.status === 'avbrutt') && knapp('igjen', 'Prøv igjen'),
    j.status === 'ferdig' && j.type !== 'film' && knapp('igjen', 'Se etter nye'),
    !run && j.status !== 'ko' && knapp('fjern', 'Fjern', ' mt'),
  ].filter(Boolean).join('');
  const n = j.filer?.length ?? 0, apen = S.open.has(j.id);
  const filer = n ? `<button type="button" class="nrk-fl" data-nrk-a="filer" data-id="${esc(j.id)}" aria-expanded="${apen}">${apen ? 'Skjul' : 'Vis'} lagrede filer (${n})</button>${apen ? `<div class="nrk-files">${j.filer.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}` : '';
  const melding = venter ? (/^venter på vpn/i.test(j.melding ?? '') ? j.melding : 'Venter på VPN …') : j.melding;
  return `<article class="nrk-job">
    <div class="nrk-jt"><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.tittel || j.url)}</a><span class="nrk-chip ${farge}">${venter ? 'VENTER' : st}</span></div>
    ${melding ? `<div class="nrk-msg${j.status === 'feil' ? ' rd' : ''}">${esc(melding)}</div>` : ''}
    ${run ? `<div class="nrk-bar ${farge}" role="progressbar" aria-valuenow="${pst}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pst}%"></i></div><div class="nrk-tall">${tall.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    ${j.status === 'ferdig' && j.spart > 0 ? `<div class="nrk-spart">${esc(spart(j.spart))}</div>` : ''}
    ${filer}
    ${knapper ? `<div class="nrk-acts">${knapper}</div>` : ''}
  </article>`;
}

function koHtml() {
  const J = S.d?.jobber ?? [];
  return `<div class="nrk-hd base"><h2 class="nrk-h">Køen</h2>${J.some((j) => j.status === 'ferdig' || j.status === 'avbrutt') ? '<button type="button" class="nrk-b" data-nrk-a="rydd">Fjern ferdige</button>' : ''}</div>
    ${vpnStoppet() ? '<div class="nrk-ban" role="status">VPN nede: tunnelen er ikke i Norge. Køen står stille.</div>' : ''}
    ${S.err ? `<div class="nrk-ban" role="alert">${esc(S.err)}</div>` : ''}
    ${J.length ? J.map(jobbHtml).join('') : '<p class="nrk-tom">Ingenting i køen.</p>'}`;
}

/* ---------------- Kort 3: Serier du følger ---------------- */

function folgHtml(f) {
  const sub = [`Sjekket ${siden(f.sjekket)}`, f.siste, f.kvalitet ? (f.kvalitet === 'best' ? 'beste' : `${f.kvalitet}p`) : ''].filter(Boolean).join(' · ');
  const t = f.tittel || f.url || '';
  return `<div class="nrk-folg"><div class="nrk-fv"><span class="nrk-fp${f.radio ? ' sq' : ''}" style="background:${flate(t)}"><b>${esc(t)}</b>${img(f.bilde)}</span><div class="nrk-ft"><b>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}</b><span>${esc(sub)}</span></div></div>
    <div class="nrk-acts"><button type="button" class="nrk-b" data-nrk-a="fsjekk" data-id="${esc(f.id)}"${S.sj === f.id ? ' disabled' : ''}>${S.sj === f.id ? 'Sjekker …' : 'Sjekk nå'}</button><button type="button" class="nrk-b rd" data-nrk-a="fslett" data-id="${esc(f.id)}">Slutt å følge</button></div></div>`;
}
function folgerHtml() {
  const F = S.d?.folger ?? [];
  return `<h2 class="nrk-h mb">Serier du følger</h2>${F.length ? F.map(folgHtml).join('') : '<p class="nrk-tom">Du følger ingen serier. Åpne en serie og trykk «Følg serien».</p>'}`;
}

/* ---------------- Kort 4: Bibliotek ---------------- */

const epSt = (e) => (e.status === 'mangler' && e.url && S.opt.has(e.url) ? 'ko' : e.status);
const alleEp = (x) => (x.sesonger ?? []).flatMap((s) => s.episoder ?? []);
const valgt = () => { const x = (S.lib?.elementer ?? []).find((y) => y.id === S.lsel); return x ? { ...x, ...(S.det[x.id] ? { sesonger: S.det[x.id].sesonger, beskrivelse: S.det[x.id].beskrivelse || x.beskrivelse, meta: x.meta || S.det[x.id].meta } : {}) } : null; };
const plakat = (x, cls) => `<div class="nrk-pl ${cls}" style="background:${flate(x.tittel)}"><b>${esc(x.tittel)}</b>${x.bilde ? `<img src="${esc(x.bilde)}" alt="" loading="lazy" decoding="async">` : ''}`;

function kortHtml(x) {
  const E = alleEp(x), n = E.length || 1, h = E.filter((e) => e.status === 'lastet').length;
  const filmSt = E[0] ? epSt(E[0]) : 'mangler';
  const sub = x.type === 'film' ? ({ lastet: 'Lastet ned', laster: 'Laster ned', ko: 'I kø' }[filmSt] ?? 'Mangler') : `${h} av ${n} episoder`;
  const merke = x.type === 'film' ? 'FILM' : x.type === 'radio' ? 'RADIO' : `${x.sesonger.length} S`;
  return `<button type="button" class="nrk-it" data-nrk-a="apne" data-id="${esc(x.id)}">${plakat(x, '')}<span class="nrk-bdg">${merke}</span></div>
    <span class="nrk-itt"><b>${esc(x.tittel)}</b><span>${esc(sub)}</span></span>
    <span class="nrk-pb${h >= n ? ' ok' : ''}"><i style="width:${Math.round((h / n) * 100)}%"></i></span></button>`;
}

function detHtml(x) {
  const SS = x.sesonger ?? [], film = x.type === 'film';
  const si = Math.max(0, SS.findIndex((s) => s.nr === (S.lss[x.id] ?? SS[SS.length - 1]?.nr)));
  const Sn = SS[si], E = Sn?.episoder ?? [];
  const mangler = E.filter((e) => epSt(e) === 'mangler' && e.url);
  const hoved = film ? (E[0] && epSt(E[0]) === 'mangler' ? 'Last ned' : 'Last ned på nytt') : mangler.length ? `Last ned ${mangler.length} som mangler` : 'Se etter nye';
  const nr = (e) => (film ? 'FILM' : x.type === 'radio' ? `#${String(e.nr).padStart(2, '0')}` : `S${String(Sn.nr).padStart(2, '0').slice(-2)}E${String(e.nr).padStart(2, '0')}`);
  const rader = E.map((e, i) => { const st = epSt(e), [t, c] = EP_STATUS[st] ?? EP_STATUS.mangler; return `<div class="nrk-ep"><span class="nrk-epn">${nr(e)}</span><div class="nrk-ept"><b>${esc(e.tittel || x.tittel)}</b>${e.varighetTekst ? `<span>${esc(e.varighetTekst)}</span>` : ''}</div><span class="nrk-chip ${c}">${t}</span>${st === 'mangler' && e.url && !film ? `<button type="button" class="nrk-b" data-nrk-a="ep" data-i="${i}"${S.lbusy ? ' disabled' : ''}>Last ned</button>` : ''}</div>`; }).join('');
  return `<div class="nrk-det">${plakat(x, 'stor')}</div>
    <div class="nrk-di"><button type="button" class="nrk-b" data-nrk-a="tilbake">‹ Bibliotek</button>
      <h2 class="nrk-dh">${esc(x.tittel)}</h2>
      ${x.meta ? `<span class="nrk-dm">${esc(x.meta)}</span>` : ''}
      ${x.beskrivelse ? `<p class="nrk-dd">${esc(x.beskrivelse)}</p>` : ''}
      <div class="nrk-acts">${x.url ? `<button type="button" class="nrk-b ink" data-nrk-a="alle"${S.lbusy ? ' disabled' : ''}>${hoved}</button><a class="nrk-b" href="${esc(x.url)}" target="_blank" rel="noopener">Åpne på NRK</a>` : ''}</div>
      ${S.lerr ? `<div class="nrk-ferr" role="alert">${esc(S.lerr)}</div>` : ''}
    </div></div>
    ${SS.length > 1 ? `<div class="nrk-ss" role="group" aria-label="${x.type === 'radio' ? 'År' : 'Sesong'}">${SS.map((s) => `<button type="button" class="nrk-p${s === Sn ? ' on' : ''}" data-nrk-a="sesong" data-v="${esc(s.nr)}" aria-pressed="${s === Sn}">${x.type === 'radio' ? esc(s.nr) : `Sesong ${esc(s.nr)}`}</button>`).join('')}</div>` : ''}
    <div class="nrk-eps">${rader || `<p class="nrk-tom">${S.detLaster === x.id ? 'Henter episoder fra NRK …' : 'Ingen episoder funnet.'}</p>`}</div>
    ${S.detLaster === x.id && rader ? '<p class="nrk-tom sm">Henter resten av episodene fra NRK …</p>' : ''}`;
}

function libHtml() {
  const L = S.lib, hd = (sub = '', h = '') => `<div class="nrk-hd"><div class="nrk-lh"><h2 class="nrk-h">Bibliotek</h2>${sub ? `<span>${esc(sub)}</span>` : ''}</div>${h}</div>`;
  if (S.st && !S.st.feil && S.st.bibliotek === false || L?.tilgjengelig === false) return `${hd()}<p class="nrk-tom">${GAMMEL}</p>`;
  if (!L) return `${hd()}<p class="nrk-tom">${S.lerr ? esc(S.lerr) : 'Henter biblioteket …'}</p>${S.lerr ? '<div class="nrk-acts"><button type="button" class="nrk-b" data-nrk-a="lib">Prøv igjen</button></div>' : ''}`;
  const x = valgt();
  if (x) return detHtml(x);
  const E = L.elementer ?? [], tell = (t) => E.filter((y) => y.type === t).length;
  const sum = `${ant(tell('tv'), 'serie', 'serier')} · ${ant(tell('film'), 'film', 'filmer')} · ${ant(tell('radio'), 'podkast', 'podkaster')}`;
  const vis = E.filter((y) => S.lf === 'alle' || y.type === S.lf);
  return `${hd(sum, `<div class="nrk-ps" role="group" aria-label="Vis">${piller(FILTER, S.lf, 'lf')}</div>`)}
    ${S.lerr ? `<div class="nrk-ferr" role="alert">${esc(S.lerr)}</div>` : ''}
    ${vis.length ? `<div class="nrk-grid">${vis.map(kortHtml).join('')}</div>` : `<p class="nrk-tom">${E.length ? 'Ingenting her ennå.' : 'Ingenting er lastet ned ennå. Lim inn en lenke øverst, så dukker det opp her.'}</p>`}`;
}

/* ---------------- Bunn: lagring og versjon ---------------- */

function bunnHtml() {
  const s = S.st;
  if (!s || s.feil || s.configured === false) return '';
  const m = s.mapper ?? {}, rot = String(s.medier ?? '/data/media').replace(/\/+$/, '');
  const mapper = [m.tv, m.film, m.radio].filter(Boolean);
  return [mapper.length ? `${rot}/${mapper.join(' · ')}` : rot, s.ledig ? `${gb(s.ledig)} ledig` : '', s.ytdlp ? `yt-dlp ${s.ytdlp}` : ''].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
}

/* ---------------- Tegning ---------------- */

function kort() {
  const d = S.d;
  if (S.err && !d) return [['feil', 'full tomt', `<b class="nrk-h">Fikk ikke kontakt med NRK-nedlasteren</b><p>${esc(S.err)}</p><button type="button" class="nrk-b ink stor" data-nrk-a="last">Prøv igjen</button>`]];
  if (!d) return [['venter', 'full tomt', '<p>Laster …</p>']];
  if (d.configured === false) return [['tomt', 'full tomt', '<b class="nrk-h stor">NRK-nedlasteren er ikke satt opp</b><p>Legg inn adressen og tokenet til nrk-dl under Integrasjoner. Tjenesten kjører bak en egen VPN-tunnel til Norge.</p><button type="button" class="nrk-b ink stor" data-m43="integ">Åpne Integrasjoner</button>']];
  return [['form', 'full form', [toppHtml(), kroppHtml()]], ['ko', 'ko', koHtml()], ['folg', 'folg', folgerHtml()], ['lib', 'full lib', libHtml()], ['bunn', 'full bunn', bunnHtml()]];
}

function render() {
  const h = S.host; if (!h?.isConnected) return;
  let w = h.firstElementChild;
  if (!w?.classList.contains('nrk87')) { h.innerHTML = '<div class="nrk87"></div>'; w = h.firstElementChild; }
  const K = kort(), har = [...w.children].map((c) => c.dataset.k).join(',');
  if (har !== K.map((k) => k[0]).join(',')) w.innerHTML = K.map(([k, cls]) => `<section class="nrk-card ${cls}" data-k="${k}"></section>`).join('');
  K.forEach(([k, , html], i) => {
    const el = w.children[i];
    if (!Array.isArray(html)) return tegn(el, html);
    // Kort 1 har to deler (toppen med søkefeltet, og treff/serieside) som tegnes hver for seg.
    if (el.children.length !== html.length) el.innerHTML = html.map(() => '<div class="nrk-del"></div>').join('');
    html.forEach((x, j) => tegn(el.children[j], x));
  });
}
/** Bytt innholdet bare når HTML-en er endret, og gi feltene tilbake teksten, fokus og markøren. */
function tegn(el, html) {
  if (el.nrkHtml === html) return; // uendret: la kortet (og feltene) stå i fred
  const a = document.activeElement, navn = a && el.contains(a) ? a.name : null, pos = navn ? [a.selectionStart, a.selectionEnd] : null;
  el.innerHTML = html; el.nrkHtml = html;
  fyll(el);
  const ny = navn && el.querySelector(`input[name="${navn}"]`);
  if (ny) { ny.focus({ preventScroll: true }); try { ny.setSelectionRange(...pos); } catch { /* type=search/url */ } }
}
function fyll(el) {
  const q = el.querySelector('input[name="nrkq"]');
  if (q) { q.value = S.q; el.querySelector('.nrk-x').hidden = !S.q; }
  const u = el.querySelector('input[name="nrkurl"]');
  if (u) { u.value = S.url; gyldig(el); }
}
/** «Legg i køen» er dempet til lenken ser ut som en NRK-lenke (uten å tegne skjemaet på nytt for hvert tastetrykk). */
function gyldig(el) { el?.querySelector('.nrk-go')?.classList.toggle('klar', NRK_RE.test(S.url.trim())); }

/* ---------------- Handlinger ---------------- */

async function leggTil() {
  const u = S.url.trim();
  if (S.busy) return;
  if (!NRK_RE.test(u)) { S.ferr = BARE_NRK; render(); return; }
  S.busy = true; S.ferr = ''; render();
  try {
    await post('/jobber', { url: u, type: 'auto', kvalitet: S.kval, folg: false, ...kompValg() });
    S.url = '';
  } catch (e) { S.ferr = e.status === 409 ? I_KO : e.message; }
  S.busy = false; render();
  await load(); schedule();
}

/** Legg i køen fra biblioteket: hele serien («Se etter nye»), en film, eller utvalgte episoder. */
async function koLib(x, episoder) {
  if (S.lbusy || !x?.url) return;
  S.lbusy = true; S.lerr = ''; render();
  try {
    await post('/jobber', { url: x.url, type: x.type, kvalitet: S.kval, folg: false, ...(episoder ? { episoder: episoder.map((e) => e.url) } : {}) });
    for (const e of episoder ?? (x.type === 'film' ? alleEp(x) : [])) if (e.url) S.opt.set(e.url, Date.now());
  } catch (e) { S.lerr = e.status === 409 && !/nrk-dl/.test(e.message) ? I_KO : e.message; }
  S.lbusy = false; render();
  await load(); schedule();
}

/** Film, episode eller radio fra søket → rett i køen. */
async function treffTilKo(t) {
  if (S.lbusy || aktivUrl(t.url) || S.opt.has(t.url)) return;
  S.lbusy = true; S.sokErr = ''; render();
  try {
    await post('/jobber', { url: t.url, type: t.art === 'film' ? 'film' : t.art === 'radio' ? 'radio' : 'auto', kvalitet: S.kval, folg: false, ...kompValg() });
    S.opt.set(t.url, Date.now());
  } catch (e) { S.sokErr = e.status === 409 ? I_KO : e.message; }
  S.lbusy = false; render();
  await load(); schedule();
}
/** «Last ned N episoder» på seriesiden → én jobb i nrk-dl (POST /jobber med episoder → /api/episoder). */
async function hentValgte() {
  const x = serie(), Z = sesong(x), E = S.sesData[`${S.ser}/${Z?.navn}`]?.episoder ?? [];
  const valgte = E.filter((e) => kanVelges(e) && S.pick.has(e.id)).slice(0, 200);
  if (S.lbusy || !x?.url || !valgte.length) return;
  S.lbusy = true; S.serr = ''; render();
  try {
    await post('/jobber', { url: x.url, type: 'tv', kvalitet: S.kval, folg: false, tittel: `${x.tittel} · ${/^\d{4}$/.test(Z.navn) ? Z.navn : sesNavn(Z).toLowerCase()}`, episoder: valgte.map((e) => e.url), ...kompValg() });
    for (const e of valgte) { S.opt.set(e.url, Date.now()); S.pick.delete(e.id); }
  } catch (e) { S.serr = e.status === 409 && !/nrk-dl/.test(e.message) ? I_KO : e.message; }
  S.lbusy = false; render();
  await load(); schedule();
  loadSes(S.ser, Z.navn, true);
}
async function folgSerie() {
  const x = serie(); if (!x?.url || S.fbusy) return;
  const f = folgAv(S.ser);
  S.fbusy = true; S.serr = ''; render();
  try {
    if (f) await api(`/folger/${f.id}`, { method: 'DELETE' });
    else await post('/folger', { url: x.url, type: 'tv', kvalitet: S.kval, tittel: x.tittel, ...kompValg() });
  } catch (e) { S.serr = e.message; }
  await load();
  S.fbusy = false; render(); schedule();
}

async function act(a, id, b) {
  if (a === 'tom') { S.q = ''; S.ser = null; S.sokNr++; S.sokQ = ''; S.treff = null; S.sokErr = ''; render(); S.host?.querySelector('input[name="nrkq"]')?.focus(); return; }
  if (a === 'treff') {
    const t = S.treff?.[+b.dataset.i]; if (!t) return;
    if (t.art === 'serie') { const m = t.url.match(/^https:\/\/tv\.nrk\.no\/serie\/([a-z0-9][a-z0-9_-]{0,100})/i); return m ? apneSerie(m[1].toLowerCase(), t.tittel) : treffTilKo(t); }
    return t.tilgjengelig === false ? null : treffTilKo(t);
  }
  if (a === 'sok-tilbake') { S.ser = null; S.serr = ''; render(); return; }
  if (a === 'ser-igjen') return loadSerie(S.ser);
  if (a === 'ses') { S.si[S.ser] = b.dataset.v; S.pick = new Set(); S.serr = ''; render(); if (!S.sesData[`${S.ser}/${b.dataset.v}`]?.episoder?.length) loadSes(S.ser, b.dataset.v); return; }
  if (a === 'ept') { if (S.pick.has(id)) S.pick.delete(id); else S.pick.add(id); return render(); }
  if (a === 'velg-alle') {
    const Z = sesong(serie()), ok = (S.sesData[`${S.ser}/${Z?.navn}`]?.episoder ?? []).filter(kanVelges), alle = ok.length && ok.every((e) => S.pick.has(e.id));
    for (const e of ok) if (alle) S.pick.delete(e.id); else S.pick.add(e.id);
    return render();
  }
  if (a === 'hent') return hentValgte();
  if (a === 'folg-serie') return folgSerie();
  if (a === 'komp') { S.komp = !kompNa(); return render(); }
  if (a === 'filer') { if (S.open.has(id)) S.open.delete(id); else S.open.add(id); return render(); }
  if (a === 'last') { S.err = ''; S.d = null; render(); return load().then(schedule); }
  if (a === 'lib') { S.lerr = ''; render(); return loadLib(); }
  if (a === 'apne') {
    const y = (S.lib?.elementer ?? []).find((z) => z.id === id), m = y?.type === 'tv' && String(y.url ?? '').match(/^https:\/\/tv\.nrk\.no\/serie\/([a-z0-9][a-z0-9_-]{0,100})/i);
    if (m && S.st?.bibliotek !== false) return apneSerie(m[1].toLowerCase(), y.tittel);
    S.lsel = id; S.lerr = ''; render(); S.host?.querySelector('[data-k="lib"]')?.scrollIntoView({ block: 'nearest' }); return loadDet(valgt()); }
  if (a === 'tilbake') { S.lsel = null; S.lerr = ''; return render(); }
  if (a === 'sesong') { S.lss[S.lsel] = +b.dataset.v; return render(); }
  const x = valgt();
  if (a === 'alle' && x) {
    const SS = x.sesonger ?? [], Sn = SS.find((s) => s.nr === (S.lss[x.id] ?? SS[SS.length - 1]?.nr)) ?? SS[0];
    const M = x.type === 'film' ? [] : (Sn?.episoder ?? []).filter((e) => epSt(e) === 'mangler' && e.url).slice(0, 200);
    return koLib(x, M.length ? M : null);
  }
  if (a === 'ep' && x) {
    const SS = x.sesonger ?? [], Sn = SS.find((s) => s.nr === (S.lss[x.id] ?? SS[SS.length - 1]?.nr)) ?? SS[0], e = Sn?.episoder?.[+b.dataset.i];
    return e?.url ? koLib(x, [e]) : null;
  }
  b.disabled = true;
  try {
    if (a === 'avbryt') await post(`/jobber/${id}/avbryt`);
    if (a === 'igjen') await post(`/jobber/${id}/igjen`);
    if (a === 'fjern') await api(`/jobber/${id}`, { method: 'DELETE' });
    if (a === 'rydd') await post('/rydd');
    if (a === 'fsjekk') { S.sj = id; render(); await post(`/folger/${id}/sjekk`); }
    if (a === 'fslett') await api(`/folger/${id}`, { method: 'DELETE' });
    S.err = '';
  } catch (e) { S.err = e.message; }
  S.sj = null;
  await load(); schedule();
}

function wire(h) {
  h.addEventListener('submit', (e) => {
    if (e.target.closest('[data-nrk-sok]')) { e.preventDefault(); e.target.querySelector('input')?.blur(); S.ser = null; sok(); return; }
    if (!e.target.closest('[data-nrk-f]')) return; e.preventDefault(); leggTil();
  });
  h.addEventListener('toggle', (e) => { if (e.target.classList?.contains('nrk-lenke')) S.lenkeApen = e.target.open; }, true);
  h.addEventListener('input', (e) => {
    if (e.target.name === 'nrkq') {
      S.q = e.target.value; e.target.form?.querySelector('.nrk-x')?.toggleAttribute('hidden', !S.q);
      clearTimeout(S.sokT); S.sokT = setTimeout(sok, 350);
      if (S.ser) { S.ser = null; render(); }
      return;
    }
    if (e.target.name !== 'nrkurl') return;
    S.url = e.target.value; gyldig(e.target.closest('[data-k]'));
    if (S.ferr) { S.ferr = ''; render(); }
  });
  h.addEventListener('click', (e) => {
    const p = e.target.closest('[data-nrk-set]');
    if (p) { S[p.dataset.nrkSet] = p.dataset.v; render(); return; }
    const b = e.target.closest('[data-nrk-a]'); if (!b || b.disabled) return;
    act(b.dataset.nrkA, b.dataset.id, b);
  });
  // Bilde som ikke lar seg hente: fargeflaten med tittelen står igjen (og bildet prøves ikke igjen ved neste tegning).
  h.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') { S.badImg.add(e.target.getAttribute('src')); e.target.remove(); } }, true);
}

/** Kalles av media43.js hver gang NRK-siden tegnes. Verten gjenbrukes, så lyttere legges på bare én gang. */
export function mountNrk(host) {
  if (!host) return;
  if (!host.dataset.nrk) { host.dataset.nrk = '1'; host.style.cssText = 'flex:1 1 100%;min-width:0'; wire(host); }
  S.host = host;
  render();
  if (Date.now() - (S.lastMount ?? 0) > 1500) { S.lastMount = Date.now(); load().then(schedule); } else schedule();
}

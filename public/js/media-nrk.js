// NRK-nedlaster i Media (#/media/nrk). Lim inn en lenke fra tv.nrk.no / radio.nrk.no → nrk-dl laster ned bak en egen
// VPN-tunnel til Norge og lagrer i /data/media/{tv,movies,podcast}. Alt går via /api/media/nrk/* (server/nrkdl.js);
// nettleseren ser aldri adressen eller tokenet til nrk-dl.
// media43.js lager en vert-<div> (som avspillingssiden) og kaller mountNrk(host) hver gang Media tegnes på nytt, så
// skjemaet ikke mister det du skriver når resten av siden oppdateres.
//
// Prompt 87 (pakke 57, fasit «Media NRK.dc.html»): hele bredden (rutenett med Køen over to rader), VPN-merke og banner,
// pille-valg, komprimering (H.265), og Bibliotek med plakater, sesonger og episoder. Hvert kort tegnes på nytt bare når
// innholdet faktisk er endret, så plakater ikke blinker og lenkefeltet får stå i fred mens køen oppdateres.
import { esc } from './util.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-nrk-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media-nrk.css'; l.dataset.nrkCss = ''; document.head.appendChild(l);
}

export const NRK_RE = /^https?:\/\/([a-z0-9-]+\.)*(nrk\.no|nrksuper\.no)(\/|$)/i;
const BARE_NRK = 'Bare lenker fra nrk.no og nrksuper.no.';
const I_KO = 'Lenken ligger allerede i køen.';
const GAMMEL = 'Biblioteket krever en nyere versjon av nrk-dl.';
const TYPER = [['auto', 'Finn ut selv'], ['tv', 'Serie'], ['film', 'Film'], ['radio', 'Radio']];
const KVAL = [['best', 'Beste'], ['1080', '1080p'], ['720', '720p'], ['540', '540p']];
const STATUS = { ko: ['I KØ', 'mt'], kjorer: ['LASTER NED', 'bl'], ferdig: ['FERDIG', 'ok'], feil: ['FEIL', 'rd'], avbrutt: ['AVBRUTT', 'mt'] };
const EP_STATUS = { lastet: ['LASTET NED', 'ok'], laster: ['LASTER NED', 'bl'], ko: ['I KØ', 'mt'], mangler: ['MANGLER', 'mt'] };
const FILTER = [['alle', 'Alle'], ['tv', 'Serier'], ['film', 'Filmer'], ['radio', 'Radio']];
const FLATER = ['#3b2f28', '#2b3d52', '#7a2e22', '#3c4a3e', '#4a4036', '#2f3a46', '#2e5a5e', '#6a4a1e'];

const S = {
  host: null, timer: 0, d: null, st: null, stAt: 0, err: '',
  url: '', ferr: '', busy: false, type: 'auto', kval: 'best', folg: false, komp: null, // komp null = serverens standard
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

function schedule() {
  clearTimeout(S.timer);
  if (!S.host?.isConnected) return; // fanen vises ikke lenger: stopp
  const aktiv = (S.d?.jobber ?? []).some((j) => j.status === 'ko' || j.status === 'kjorer');
  S.timer = setTimeout(async () => { if (!S.host?.isConnected) return; if (!document.hidden) await load(); schedule(); }, aktiv ? 2000 : 10000);
}

/* ---------------- Kort 1: Last ned fra NRK ---------------- */

function vpnHtml() {
  const s = S.st;
  if (!s) return '';
  if (s.feil) return `<span class="nrk-vpn rd" title="${esc(s.feil)}"><i></i>Ingen kontakt</span>`;
  const v = s.vpn ?? {};
  return v.ok
    ? `<span class="nrk-vpn ok" title="All trafikk til NRK går gjennom VPN-tunnelen"><i></i>VPN · ${esc(v.land ?? 'NO')}${v.ip ? ` · ${esc(v.ip)}` : ''}</span>`
    : `<span class="nrk-vpn rd" title="${esc(v.feil ?? '')}"><i></i>VPN stoppet · køen venter</span>`;
}
const piller = (L, cur, k) => L.map(([v, t]) => `<button type="button" class="nrk-p${v === cur ? ' on' : ''}" data-nrk-set="${k}" data-v="${v}" aria-pressed="${v === cur}">${t}</button>`).join('');

function formHtml() {
  const k = S.st?.komprimer;
  const komp = k ? `<button type="button" class="nrk-chk" role="checkbox" aria-checked="${kompNa()}" data-nrk-a="komp"><span class="nrk-box${kompNa() ? ' on' : ''}" aria-hidden="true">${kompNa() ? '✓' : ''}</span><span class="nrk-tx"><b>Komprimer (H.265, ca. halv størrelse)</b><span>${kompStd() ? 'Standard på serveren' : 'Av som standard på serveren'}${k.crf != null ? ` · crf ${esc(k.crf)}` : ''}${k.preset ? ` · preset ${esc(k.preset)}` : ''}</span></span></button>` : '';
  return `<div class="nrk-hd"><h2 class="nrk-h">Last ned fra NRK</h2>${vpnHtml()}</div>
    <form data-nrk-f class="nrk-in${S.ferr ? ' bad' : ''}" autocomplete="off" novalidate>
      <input name="nrkurl" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://tv.nrk.no/serie/…" aria-label="Lenke fra NRK"${S.ferr ? ' aria-invalid="true"' : ''}>
      <button type="submit" class="nrk-go"${S.busy ? ' disabled' : ''}>${S.busy ? 'Legger til …' : 'Last ned'}</button>
    </form>
    ${S.ferr ? `<div class="nrk-ferr" role="alert">${esc(S.ferr)}</div>` : ''}
    <div class="nrk-valg">
      <div class="nrk-grp"><span class="nrk-lbl" id="nrk-lt">TYPE</span><div class="nrk-ps" role="group" aria-labelledby="nrk-lt">${piller(TYPER, S.type, 'type')}</div></div>
      <div class="nrk-grp"><span class="nrk-lbl" id="nrk-lk">KVALITET</span><div class="nrk-ps" role="group" aria-labelledby="nrk-lk">${piller(KVAL, S.kval, 'kval')}</div></div>
    </div>
    <button type="button" class="nrk-chk" role="switch" aria-checked="${S.folg}" data-nrk-a="folg"><span class="nrk-sw${S.folg ? ' on' : ''}" aria-hidden="true"><i></i></span><span class="nrk-tx"><b>Følg serien</b><span>Laster ned nye episoder automatisk</span></span></button>
    ${komp}
    <div class="nrk-mapper"><span>tv/Serie/Season 01/Serie - S01E02 - Tittel.mkv</span><span>movies/Tittel/Tittel.mkv</span><span>podcast/Serie/2026-11-13 - Tittel.m4a</span></div>`;
}

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
    ${vpnStoppet() ? '<div class="nrk-ban" role="status">Venter på VPN: tunnelen er ikke i Norge. Køen står stille.</div>' : ''}
    ${S.err ? `<div class="nrk-ban" role="alert">${esc(S.err)}</div>` : ''}
    ${J.length ? J.map(jobbHtml).join('') : '<p class="nrk-tom">Ingenting i køen. Lim inn en lenke fra tv.nrk.no eller radio.nrk.no.</p>'}`;
}

/* ---------------- Kort 3: Serier du følger ---------------- */

function folgHtml(f) {
  const sub = [`Sjekket ${siden(f.sjekket)}`, f.siste, f.kvalitet ? (f.kvalitet === 'best' ? 'beste' : `${f.kvalitet}p`) : ''].filter(Boolean).join(' · ');
  return `<div class="nrk-folg"><div class="nrk-ft"><b>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.tittel)}</a>` : esc(f.tittel)}</b><span>${esc(sub)}</span></div>
    <div class="nrk-acts"><button type="button" class="nrk-b" data-nrk-a="fsjekk" data-id="${esc(f.id)}"${S.sj === f.id ? ' disabled' : ''}>${S.sj === f.id ? 'Sjekker …' : 'Sjekk nå'}</button><button type="button" class="nrk-b rd" data-nrk-a="fslett" data-id="${esc(f.id)}">Slutt å følge</button></div></div>`;
}
function folgerHtml() {
  const F = S.d?.folger ?? [];
  return `<h2 class="nrk-h mb">Serier du følger</h2>${F.length ? F.map(folgHtml).join('') : '<p class="nrk-tom">Du følger ingen serier. Slå på «Følg serien» når du legger inn en lenke.</p>'}`;
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

/* ---------------- Tegning ---------------- */

function kort() {
  const d = S.d;
  if (S.err && !d) return [['feil', 'full tomt', `<b class="nrk-h">Fikk ikke kontakt med NRK-nedlasteren</b><p>${esc(S.err)}</p><button type="button" class="nrk-b ink stor" data-nrk-a="last">Prøv igjen</button>`]];
  if (!d) return [['venter', 'full tomt', '<p>Laster …</p>']];
  if (d.configured === false) return [['tomt', 'full tomt', '<b class="nrk-h stor">NRK-nedlasteren er ikke satt opp</b><p>Legg inn adressen og tokenet til nrk-dl under Integrasjoner. Tjenesten kjører bak en egen VPN-tunnel til Norge.</p><button type="button" class="nrk-b ink stor" data-m43="integ">Åpne Integrasjoner</button>']];
  return [['form', 'form', formHtml()], ['ko', 'ko', koHtml()], ['folg', 'folg', folgerHtml()], ['lib', 'full lib', libHtml()]];
}

function render() {
  const h = S.host; if (!h?.isConnected) return;
  let w = h.firstElementChild;
  if (!w?.classList.contains('nrk87')) { h.innerHTML = '<div class="nrk87"></div>'; w = h.firstElementChild; }
  const K = kort(), har = [...w.children].map((c) => c.dataset.k).join(',');
  if (har !== K.map((k) => k[0]).join(',')) w.innerHTML = K.map(([k, cls]) => `<section class="nrk-card ${cls}" data-k="${k}"></section>`).join('');
  K.forEach(([k, , html], i) => {
    const el = w.children[i];
    if (el.nrkHtml === html) return; // uendret: la kortet (og lenkefeltet) stå i fred
    const inp = k === 'form' ? el.querySelector('input[name="nrkurl"]') : null, fok = inp && document.activeElement === inp, pos = inp?.selectionStart ?? 0;
    el.innerHTML = html; el.nrkHtml = html;
    if (k === 'form') { const ny = el.querySelector('input[name="nrkurl"]'); ny.value = S.url; gyldig(el); if (fok) { ny.focus({ preventScroll: true }); try { ny.setSelectionRange(pos, pos); } catch { /* */ } } }
  });
}
/** «Last ned» er dempet til lenken ser ut som en NRK-lenke (uten å tegne skjemaet på nytt for hvert tastetrykk). */
function gyldig(el) { el?.querySelector('.nrk-go')?.classList.toggle('klar', NRK_RE.test(S.url.trim())); }

/* ---------------- Handlinger ---------------- */

async function leggTil() {
  const u = S.url.trim();
  if (S.busy) return;
  if (!NRK_RE.test(u)) { S.ferr = BARE_NRK; render(); return; }
  S.busy = true; S.ferr = ''; render();
  try {
    await post('/jobber', { url: u, type: S.type, kvalitet: S.kval, folg: S.folg, ...(S.st?.komprimer && kompNa() !== kompStd() ? { komprimer: kompNa() } : {}) });
    S.url = ''; S.folg = false;
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

async function act(a, id, b) {
  if (a === 'folg') { S.folg = !S.folg; return render(); }
  if (a === 'komp') { S.komp = !kompNa(); return render(); }
  if (a === 'filer') { if (S.open.has(id)) S.open.delete(id); else S.open.add(id); return render(); }
  if (a === 'last') { S.err = ''; S.d = null; render(); return load().then(schedule); }
  if (a === 'lib') { S.lerr = ''; render(); return loadLib(); }
  if (a === 'apne') { S.lsel = id; S.lerr = ''; render(); S.host?.querySelector('[data-k="lib"]')?.scrollIntoView({ block: 'nearest' }); return loadDet(valgt()); }
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
  h.addEventListener('submit', (e) => { if (!e.target.closest('[data-nrk-f]')) return; e.preventDefault(); leggTil(); });
  h.addEventListener('input', (e) => {
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
  // Plakat som ikke lar seg hente: fargeflaten med tittelen står igjen.
  h.addEventListener('error', (e) => { if (e.target.tagName === 'IMG' && e.target.closest('.nrk-pl')) e.target.remove(); }, true);
}

/** Kalles av media43.js hver gang NRK-siden tegnes. Verten gjenbrukes, så lyttere legges på bare én gang. */
export function mountNrk(host) {
  if (!host) return;
  if (!host.dataset.nrk) { host.dataset.nrk = '1'; host.style.cssText = 'flex:1 1 100%;min-width:0'; wire(host); }
  S.host = host;
  render();
  if (Date.now() - (S.lastMount ?? 0) > 1500) { S.lastMount = Date.now(); load().then(schedule); } else schedule();
}

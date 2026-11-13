// NRK-nedlaster i Media (#/media/nrk). Lim inn en lenke fra tv.nrk.no / radio.nrk.no → nrk-dl laster ned bak en egen
// VPN-tunnel til Norge og lagrer i /data/media/{tv,movies,podcast}. Alt går via /api/media/nrk/* (server/nrkdl.js);
// nettleseren ser aldri adressen eller tokenet til nrk-dl.
// media43.js lager en vert-<div> (som avspillingssiden) og kaller mountNrk(host) hver gang Media tegnes på nytt, så
// skjemaet ikke mister det du skriver når resten av siden oppdateres.
import { esc } from './util.js';

if (typeof document !== 'undefined' && !document.querySelector('link[data-nrk-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media-nrk.css'; l.dataset.nrkCss = ''; document.head.appendChild(l);
}

const S = { d: null, st: null, err: '', ferr: '', busy: false, open: new Set(), timer: 0, host: null, type: 'auto', kval: 'best', folg: false };
const STATUS = { ko: ['I kø', 'c-off'], kjorer: ['Laster ned', 'c-wait'], ferdig: ['Ferdig', 'c-ok'], feil: ['Feilet', 'c-err'], avbrutt: ['Avbrutt', 'c-off'] };
const nb = (n, d = 0) => (+n || 0).toLocaleString('nb-NO', { maximumFractionDigits: d });
const gb = (b) => (b == null ? '–' : b >= 1e12 ? `${nb(b / 1e12, 2)} TB` : `${nb(b / 1e9, 1)} GB`);
const fart = (b) => (!b ? '' : b >= 1e6 ? `${nb(b / 1e6, 1)} MB/s` : `${nb(b / 1e3)} kB/s`);
const tid = (s) => (s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)} t ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min` : `${s} s`);
const naar = (t) => (t ? new Date(t * 1000).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'aldri');

async function api(path, opt = {}) {
  const r = await fetch(`/api/media/nrk${path}`, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || (r.status === 404 ? 'Serveren har ikke NRK-nedlasteren ennå – oppdater Homelab.' : `Serveren svarte ${r.status}`)), { status: r.status, configured: d?.configured });
  return d ?? {};
}

async function load() {
  try {
    const [d, st] = await Promise.all([api('/jobber'), S.st && Date.now() - S.stAt < 30_000 ? Promise.resolve(S.st) : api('/status').catch((e) => ({ feil: e.message }))]);
    S.d = d; if (st !== S.st) { S.st = st; S.stAt = Date.now(); }
    S.err = '';
  } catch (e) { S.err = e.message; }
  render();
}

function schedule() {
  clearTimeout(S.timer);
  if (!S.host?.isConnected) return;
  const aktiv = (S.d?.jobber ?? []).some((j) => j.status === 'ko' || j.status === 'kjorer');
  S.timer = setTimeout(async () => { if (!S.host?.isConnected) return; if (!document.hidden) await load(); schedule(); }, aktiv ? 2000 : 10000);
}

function vpnHtml() {
  const s = S.st;
  if (!s || s.configured === false) return '';
  if (s.feil && !s.vpn) return `<span class="nrk-vpn bad"><i></i>${esc(s.feil)}</span>`;
  const v = s.vpn ?? {};
  return v.ok
    ? `<span class="nrk-vpn ok" title="All trafikk til NRK går gjennom Proton VPN"><i></i>VPN · ${esc(v.land)} · <span class="m70-mono">${esc(v.ip)}</span></span>`
    : `<span class="nrk-vpn bad" title="${esc(v.feil ?? '')}"><i></i>${esc(v.land ? `VPN i ${v.land} – stoppet` : 'VPN nede – stoppet')}</span>`;
}

function formHtml() {
  const opt = (L, cur) => L.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('');
  return `<section class="m70-card nrk-form">
    <div class="m70-row xwrap g12 base"><h2 class="m70-h2 s26 grow">Last ned fra NRK</h2>${vpnHtml()}</div>
    <form data-nrk-f class="nrk-in" autocomplete="off">
      <input name="nrkurl" type="url" required placeholder="Lim inn lenke fra tv.nrk.no eller radio.nrk.no" aria-label="Lenke fra NRK">
      <button type="submit" class="m70-btn ink"${S.busy ? ' disabled' : ''}>${S.busy ? 'Legger til …' : 'Last ned'}</button>
    </form>
    <div class="nrk-valg m70-14">
      <label>Type <select data-nrk-o="type">${opt([['auto', 'Finn ut selv'], ['tv', 'Serie'], ['film', 'Film / program'], ['radio', 'Radio / podkast']], S.type)}</select></label>
      <label>Kvalitet <select data-nrk-o="kval">${opt([['best', 'Beste'], ['1080', '1080p'], ['720', '720p'], ['540', '540p']], S.kval)}</select></label>
      <label><input type="checkbox" data-nrk-o="folg"${S.folg ? ' checked' : ''}> Følg serien – nye episoder lastes ned automatisk</label>
    </div>
    ${S.ferr ? `<div class="nrk-err" role="alert">${esc(S.ferr)}</div>` : ''}
    <p class="m70-mut m70-13 nrk-hint">En episode, en sesong, en hel serie, et program eller en podkast. Serier lagres som <span class="m70-mono">tv/Serie/Season 01/Serie - S01E01 - Tittel.mkv</span> med undertekstene lagt inn, så Jellyfin, Plex og Silo finner dem.</p>
  </section>`;
}

function jobbHtml(j) {
  const [st, cls] = STATUS[j.status] ?? [j.status, 'c-off'];
  const pst = j.status === 'ferdig' ? 100 : Math.max(0, Math.min(100, j.prosent ?? 0));
  const tall = j.status === 'kjorer' ? [j.prosent != null ? `${nb(j.prosent)} %` : '', fart(j.fart), j.eta ? `${tid(j.eta)} igjen` : '', j.av ? `${j.nr} av ${j.av}` : ''].filter(Boolean) : [];
  const knapp = (a, t) => `<button type="button" class="m70-btn sm line" data-nrk-a="${a}" data-id="${esc(j.id)}">${t}</button>`;
  const knapper = [
    (j.status === 'ko' || j.status === 'kjorer') && knapp('avbryt', 'Avbryt'),
    ['feil', 'avbrutt'].includes(j.status) && knapp('igjen', 'Prøv igjen'),
    j.status === 'ferdig' && knapp('igjen', 'Se etter nye'),
    j.status !== 'kjorer' && knapp('fjern', 'Fjern'),
  ].filter(Boolean).join('');
  const fk = `f${j.id}`;
  const filer = j.filer?.length ? `<details data-nrk-d="${fk}"${S.open.has(fk) ? ' open' : ''}><summary class="m70-13 m70-mut">${j.filer.length} ${j.filer.length === 1 ? 'fil' : 'filer'} lagret</summary><div class="nrk-files m70-mono">${j.filer.map(esc).join('\n')}</div></details>` : '';
  return `<article class="nrk-job ${esc(j.status)}">
    <div class="m70-row g12"><a class="b6 grow m70-mw0 nrk-t" href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.tittel)}</a><span class="m70-chip ${cls}">${st}</span></div>
    <div class="nrk-msg m70-14">${esc(j.melding)}</div>
    ${j.status === 'kjorer' || j.status === 'ferdig' ? `<span class="m70-bar nrk-bar" role="progressbar" aria-valuenow="${Math.round(pst)}" aria-valuemin="0" aria-valuemax="100"><i class="${j.status === 'ferdig' ? 'ok' : 'amb'}" style="width:${pst}%"></i></span>` : ''}
    ${tall.length ? `<div class="m70-row g16 m70-mono m70-12 m70-mut">${tall.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    ${filer}
    ${knapper ? `<div class="m70-row g8 xwrap">${knapper}</div>` : ''}
  </article>`;
}

function folgHtml(f) {
  return `<div class="nrk-folg"><div class="grow m70-mw0"><a class="b6" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.tittel)}</a>
    <div class="m70-13 m70-mut">Sist sjekket ${esc(naar(f.sjekket))}${f.siste ? ` · ${esc(f.siste)}` : ''}</div></div>
    <button type="button" class="m70-btn sm line" data-nrk-a="fsjekk" data-id="${esc(f.id)}">Sjekk nå</button>
    <button type="button" class="m70-btn sm line" data-nrk-a="fslett" data-id="${esc(f.id)}">Slutt å følge</button></div>`;
}

function html() {
  const d = S.d;
  if (S.err && !d) return `<div class="m70-empty"><b>Fikk ikke kontakt med NRK-nedlasteren</b><span>${esc(S.err)}</span><button type="button" class="m70-btn line" data-nrk-a="last">Prøv igjen</button></div>`;
  if (!d) return '<div class="m70-empty"><span>Laster …</span></div>';
  if (d.configured === false) {
    return `<div class="m70-empty"><b>NRK-nedlasteren er ikke satt opp</b><span>Kjør <span class="m70-mono">bash scripts/ct/nrk.sh</span> fra skjold-proxmox-media, og legg inn adressen og tokenet under Innstillinger → Integrasjoner → NRK-nedlaster.</span><button type="button" class="m70-btn line" data-m43="integ">Åpne Integrasjoner</button></div>`;
  }
  const J = d.jobber ?? [], F = d.folger ?? [];
  const st = S.st && !S.st.feil ? S.st : null;
  const fot = st ? [`Lagres i ${st.medier}`, `${gb(st.ledig)} ledig`, st.skrivbar === false ? 'Mediemappen er ikke skrivbar' : '', `Følger sjekkes hver ${nb(st.folgTimer)}. time`, st.ytdlp ? `yt-dlp ${st.ytdlp}` : ''].filter(Boolean) : [];
  return `${formHtml()}
    <section class="m70-card">
      <div class="m70-row g12 mb16"><h2 class="m70-h2 s24 grow">Køen</h2>${J.some((j) => j.status === 'ferdig' || j.status === 'avbrutt') ? '<button type="button" class="m70-btn sm line" data-nrk-a="rydd">Fjern ferdige</button>' : ''}</div>
      ${S.err ? `<div class="nrk-err">${esc(S.err)}</div>` : ''}
      ${J.length ? `<div class="nrk-list">${J.map(jobbHtml).join('')}</div>` : '<p class="m70-mut">Køen er tom. Lim inn en lenke over for å starte.</p>'}
    </section>
    <section class="m70-card">
      <h2 class="m70-h2 s24 mb16">Serier du følger</h2>
      ${F.length ? `<div class="nrk-list">${F.map(folgHtml).join('')}</div>` : '<p class="m70-mut">Ingen ennå. Huk av «Følg serien» når du legger til en serie, så lastes nye episoder ned av seg selv.</p>'}
    </section>
    ${fot.length ? `<div class="m70-row g16 xwrap m70-13 m70-mut nrk-fot">${fot.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`;
}

function render() {
  const h = S.host; if (!h?.isConnected) return;
  const inp = h.querySelector('input[name="nrkurl"]'), val = inp?.value ?? '', fok = document.activeElement === inp, pos = inp?.selectionStart ?? 0;
  h.innerHTML = `<div class="nrk75">${html()}</div>`;
  const ny = h.querySelector('input[name="nrkurl"]');
  if (ny) { ny.value = val; if (fok) { ny.focus({ preventScroll: true }); try { ny.setSelectionRange(pos, pos); } catch { /* */ } } }
}

async function act(a, id) {
  try {
    if (a === 'avbryt') await api(`/jobber/${id}/avbryt`, { method: 'POST', body: '{}' });
    if (a === 'igjen') await api(`/jobber/${id}/igjen`, { method: 'POST', body: '{}' });
    if (a === 'fjern') await api(`/jobber/${id}`, { method: 'DELETE' });
    if (a === 'rydd') await api('/rydd', { method: 'POST', body: '{}' });
    if (a === 'fsjekk') await api(`/folger/${id}/sjekk`, { method: 'POST', body: '{}' });
    if (a === 'fslett') { if (!confirm('Slutte å følge serien? Episodene som er lastet ned blir liggende.')) return; await api(`/folger/${id}`, { method: 'DELETE' }); }
    S.err = '';
  } catch (e) { S.err = e.message; }
  await load(); schedule();
}

function wire(h) {
  h.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-nrk-f]'); if (!f) return;
    e.preventDefault();
    const inp = f.querySelector('input[name="nrkurl"]');
    S.busy = true; S.ferr = ''; render();
    try {
      await api('/jobber', { method: 'POST', body: JSON.stringify({ url: inp?.value ?? '', type: S.type, kvalitet: S.kval, folg: S.folg }) });
      S.folg = false; S.busy = false;
      render(); const ny = h.querySelector('input[name="nrkurl"]'); if (ny) ny.value = '';
      await load(); schedule();
    } catch (er) { S.busy = false; S.ferr = er.message; render(); }
  });
  h.addEventListener('change', (e) => {
    const o = e.target.dataset?.nrkO; if (!o) return;
    if (o === 'type') S.type = e.target.value;
    if (o === 'kval') S.kval = e.target.value;
    if (o === 'folg') S.folg = e.target.checked;
  });
  h.addEventListener('toggle', (e) => { const k = e.target.dataset?.nrkD; if (k) { if (e.target.open) S.open.add(k); else S.open.delete(k); } }, true);
  h.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nrk-a]'); if (!b || b.disabled) return;
    if (b.dataset.nrkA === 'last') { S.err = ''; S.d = null; render(); load().then(schedule); return; }
    b.disabled = true; act(b.dataset.nrkA, b.dataset.id);
  });
}

/** Kalles av media43.js hver gang NRK-siden tegnes. Verten gjenbrukes, så lyttere legges på bare én gang. */
export function mountNrk(host) {
  if (!host) return;
  if (!host.dataset.nrk) { host.dataset.nrk = '1'; host.style.cssText = 'flex:1 1 100%;min-width:0'; wire(host); }
  S.host = host;
  render();
  // På mobil ruller fanelinja sidelengs; sørg for at NRK-fanen (sist) synes når den er valgt.
  const tab = document.querySelector('.m70-tab.on'); const bar = tab?.parentElement;
  if (tab && bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = tab.offsetLeft + tab.offsetWidth - bar.clientWidth + 8;
  if (Date.now() - (S.lastMount ?? 0) > 1500) { S.lastMount = Date.now(); load().then(schedule); } else schedule();
}

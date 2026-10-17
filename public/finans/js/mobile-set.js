// Innstillinger i mobilappen: hovedside med gruppene Konto, App og System, og én underside per gruppe.
// Valg som bare gjelder denne enheten lagres i localStorage (fh_mprefs); AI og varsler for kvitteringer/budsjett på serveren.
import { S, api, esc, n0, ini, icon, loadBoot, loadSummary } from './core.js';
import { m, draw, flash, pref, setPref, theme, iosBg, isIOS, meName } from './mobile.js';

const T = { tokens: null, devices: null, newTok: '', nt: { name: '', scopes: ['receipts:write'], exp: '90' }, ping: '', lastSync: null, usage: null };
const SCOPES = ['receipts:write', 'read:transactions', 'read:summary', 'read:budget', 'write:transactions', 'finance:read'];
const VERSION = '2.5.0';

export async function settingsLoad(sub) {
  const jobs = [];
  if (!sub || sub === 'tok') jobs.push(api('/tokens').then((x) => { T.tokens = x; }).catch(() => { T.tokens = T.tokens ?? []; }));
  if (sub === 'sik') jobs.push(fetch('/api/devices').then((r) => (r.ok ? r.json() : null)).then((x) => { T.devices = x; }).catch(() => { T.devices = null; }));
  if (sub === 'data') jobs.push(navigator.storage?.estimate?.().then((x) => { T.usage = x.usage; }).catch(() => {}));
  await Promise.all(jobs);
  T.lastSync ??= new Date();
}

/* ---------- Byggeklosser ---------- */

const ios = () => theme() === 'ios';
const G = (title, rows, note = '') => `${title ? `<div class="sec">${title}</div>` : ''}<div class="list ${ios() ? 'glass2' : ''}">${rows.filter(Boolean).join('')}</div>${note ? `<div class="snote">${note}</div>` : ''}`;
const nav = (k, label, sub, ic, color) => `<a class="opt-row" href="#/set/${k}"><span class="set-ic fill" style="background:${color}">${icon(ic, 17, '#fff')}</span><span class="m-grow">${label}</span>${sub ? `<span class="sval">${esc(sub)}</span>` : ''}<span style="opacity:.5">›</span></a>`;
const tog = (id, label, sub, on) => `<button class="opt-row" data-stog="${id}" role="switch" aria-checked="${!!on}"><span class="m-grow"><b style="font-weight:500">${label}</b>${sub ? `<br><span style="font-size:13px;opacity:.65">${sub}</span>` : ''}</span><span class="sw" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
const chips = (id, label, opts, cur, multi = false) => `<div class="opt-row col"><span style="font-size:13px;opacity:.7">${label}</span><div class="schips">${opts.map(([k, n]) => { const on = multi ? cur.includes(k) : cur === k; return `<button class="chip" data-schip="${id}" data-v="${esc(k)}" aria-pressed="${on}">${on && !multi ? '✓ ' : ''}${esc(n)}</button>`; }).join('')}</div></div>`;
const val = (label, v, color = '') => `<div class="opt-row"><span class="m-grow">${label}</span><span class="sval" style="${color ? `color:${color};opacity:1` : ''}">${v}</span></div>`;
const btn = (label, act, color = 'var(--m-acc)') => `<button class="opt-row" data-sact="${act}"><span class="m-grow" style="color:${color};font-weight:500">${label}</span></button>`;
const link = (label, href, sub = '') => `<a class="opt-row" href="${href}"><span class="m-grow">${label}${sub ? `<br><span style="font-size:13px;opacity:.65">${sub}</span>` : ''}</span><span style="opacity:.5">›</span></a>`;

function profile(big = false) {
  const me = m.me ?? {};
  const sz = big ? 58 : 44;
  return `<a class="opt-row" href="#/set/konto"><span class="m-av" style="width:${sz}px;height:${sz}px;font-size:${big ? 22 : 17}px">${esc(ini(meName()))}</span><span class="m-grow"><b style="font-size:${big ? 19 : 16}px;font-weight:600">${esc(meName())}</b><br><span style="font-size:13px;opacity:.65">${me.username ? `@${esc(me.username)}` : 'FinansHub'}${me.role ? ` · ${esc(me.role)}` : ''} · ${esc(location.host)}</span></span><span style="opacity:.5">›</span></a>`;
}
const PAGES = { konto: 'Kontoer', sik: 'Sikkerhet', tok: 'API-tokens', look: 'Utseende', scan: 'Skanning og AI', notif: 'Varsler', srv: 'Server og synk', data: 'Data og lagring', om: 'Om FinansHub' };
const when = (t) => (t ? new Date(t).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'aldri');
const aiMode = () => { const st = S.boot?.settings ?? {}; return st.provider === 'gemini' ? 'gemini' : st.fallback ? 'both' : 'ollama'; };

export function settingsView(th, sub) {
  const page = PAGES[sub] ? sub : '';
  const head = page
    ? `${th === 'ios' ? '<a class="back pillback glass2" href="#/set">‹ Innstillinger</a>' : '<div class="m-row"><a class="back" href="#/set" aria-label="Tilbake">←</a></div>'}<div class="title" style="font-size:${th === 'ios' ? 30 : 32}px">${PAGES[page]}</div>`
    : `<div class="title" style="padding:6px 4px 0">Innstillinger</div>`;
  return `${head}${page ? PAGE[page](th) : main(th)}`;
}

function main() {
  const st = S.boot?.settings ?? {};
  return `${G('', [profile(true)])}
    ${G('Konto', [nav('konto', 'Kontoer og brukere', '1 på enheten', 'users', '#5E8BFF'), nav('sik', 'Sikkerhet', m.me?.totp ? '2FA på' : '', 'shield', '#34C759'), nav('tok', 'API-tokens', T.tokens ? `${T.tokens.length} aktive` : '', 'key', '#FF9F0A')])}
    ${G('App', [nav('look', 'Utseende', '', 'look', '#BF5AF2'), nav('scan', 'Skanning og AI', pref('scanTap') === 'cam' ? 'Kamera' : 'Vis valg', 'cam', '#FF7A3D'), nav('notif', 'Varsler', st.nRc ? 'På' : '', 'bell', '#FF453A')])}
    ${G('System', [nav('srv', 'Server og synk', '', 'srv', '#64D2FF'), nav('data', 'Data og lagring', '', 'db', '#8E8E93'), nav('om', 'Om FinansHub', VERSION, 'info', '#8E8E93')])}
    ${G('', [btn(`Logg ut ${esc(meName())}`, 'logout', '#FF8A80')])}`;
}

const PAGE = {
  konto: () => `${G('På denne enheten', [profile(), val('Status', '✓ Aktiv', '#7BE3A0')],
    'Nettappen er logget inn med én konto om gangen. Flere kontoer i samme app, og raskt bytte ved å holde inne profilbildet, finnes i iOS- og Android-appene.')}
    ${G('Brukere', [link('Administrer brukere', '/', 'Homelab → Innstillinger → Innlogging')], 'Nye brukere opprettes av admin i Homelab. Hver bruker har egne tokens og varsler.')}
    ${G('', [btn('Logg ut', 'logout', '#FF8A80')])}`,

  sik: () => {
    const d = T.devices;
    const tfa = m.me?.totp;
    return `${G('Lås', [tog('lock', 'Krev innlogging etter tid i bakgrunnen', 'Face ID og fingeravtrykk finnes i de native appene', pref('lock')),
        chips('lockAfter', 'Lås etter', [['0', 'Umiddelbart'], ['1', '1 min'], ['5', '5 min'], ['15', '15 min']], pref('lockAfter')),
        tog('appHide', 'Skjul beløp i appveksleren', 'Uskarpt bilde når du bytter app', pref('appHide'))])}
      ${G('Tofaktor', [val(`2FA for ${m.me?.username ? '@' + esc(m.me.username) : 'kontoen'}`, tfa === undefined ? '–' : tfa ? '● På · TOTP' : '○ Av', tfa ? '#7BE3A0' : tfa === false ? '#F2B56B' : ''), link(tfa ? 'Administrer 2FA' : 'Sett opp 2FA', '/', 'Homelab → Innstillinger → Innlogging')],
        'Bruk en autentiseringsapp som 1Password, Google Authenticator eller Aegis.')}
      ${G('Pålitelige enheter', d?.devices?.length ? d.devices.map((x) => val(`${esc(x.name)}${x.current ? ' · denne' : ''}`, when(x.lastSeen), x.current ? '#7BE3A0' : '')) : [val('Ingen pålitelige enheter', '')],
        d ? (d.lan ? 'Du er på lokalt nett nå.' : 'Du er ikke på lokalt nett nå. Fra internett kreves alltid passord.') : '')}`;
  },

  tok: () => {
    const nt = T.nt;
    return `${T.newTok ? G('Nytt token', [`<button class="opt-row col" data-sact="copy"><span style="font-size:13px;color:var(--m-acc)">Kopier nå – vises bare én gang</span><code class="tok">${esc(T.newTok)}</code></button>`]) : ''}
      ${G('Aktive', (T.tokens ?? []).map((t) => `<div class="opt-row"><span class="m-grow"><b style="font-weight:500">${esc(t.name)}</b><br><span style="font-size:12px;opacity:.6">${esc((t.scopes ?? []).join(' '))}</span><br><span style="font-size:12px;opacity:.6">Laget ${when(t.created)} · brukt ${when(t.lastUsed ?? t.last_used)} · ${t.expires ? `utløper ${when(t.expires)}` : 'utløper aldri'}</span></span><button class="mini danger" data-sact="revoke" data-id="${esc(t.id)}" aria-label="Trekk tilbake ${esc(t.name)}">${icon('close', 16)}</button></div>`).concat(T.tokens?.length ? [] : [val('Ingen aktive tokens', '')]),
        'Tokens brukes av snarveier, Home Assistant og skript. De gir bare tilgangen du velger og kan trekkes tilbake når som helst.')}
      ${G('Lag nytt token', [`<label class="opt-row col"><span style="font-size:13px;opacity:.7">Navn</span><input class="sinp" data-ntname value="${esc(nt.name)}" placeholder="f.eks. Kvitteringssnarvei" autocomplete="off"></label>`,
        chips('ntscope', 'Tilganger', SCOPES.map((s) => [s, s]), nt.scopes, true),
        chips('ntexp', 'Utløper', [['30', '30 d'], ['90', '90 d'], ['365', '1 år'], ['', 'Aldri']], nt.exp),
        btn('Lag token', 'mktok')])}`;
  },

  look: (th) => {
    const cur = (() => { try { return localStorage.getItem('fh_theme') || 'auto'; } catch { return 'auto'; } })();
    return `${th === 'ios' ? G('Bakgrunn', [tog('iosbg', 'Fargebakgrunn', 'Fargede lysflekker bak glassflatene', iosBg())]) : ''}
      ${G('Tema', [chips('theme', 'Utseende', [['auto', `Automatisk (${isIOS() ? 'iOS' : 'Android'})`], ['ios', 'iOS · Liquid Glass'], ['and', 'Android · Material 3']], cur)])}
      ${G('Oppstart', [chips('start', 'Startside', [['hjem', 'Hjem'], ['liste', 'Liste'], ['budsjett', 'Budsjett']], pref('start'))])}
      ${G('Personvern', [tog('hideAmt', 'Skjul beløp til jeg trykker', 'Viser •••• i stedet for tall på Hjem', pref('hideAmt'))])}`;
  },

  scan: () => `${G('Skanneknappen', [chips('scanTap', 'Trykk på skann', [['cam', 'Åpne kamera'], ['sheet', 'Vis valg']], pref('scanTap'))], 'Hold inne skanneknappen for å velge fra Bilder eller Filer.')}
    ${G('Bilde', [tog('crop', 'Beskjær automatisk', 'Hold kvitteringen innenfor rammen i kameraet', pref('crop')), tog('origImg', 'Lagre originalbildet', 'Lagres sammen med kvitteringen på serveren', pref('origImg')), tog('wifi', 'Last opp bare på Wi-Fi', 'Ellers settes filer i kø', pref('wifi'))])}
    ${G('AI-motor', [chips('ai', 'Leses av', [['ollama', 'Ollama lokalt'], ['gemini', 'Gemini'], ['both', 'Ollama + Gemini']], aiMode())], 'Med «Ollama lokalt» forlater ingen kvitteringer hjemmenettet. «Ollama + Gemini» bruker Gemini som reserve.')}`,

  notif: () => {
    const st = S.boot?.settings ?? {};
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return `${G('Send varsel når', [tog('srv:nRc', 'Kvittering er lest', 'Når AI er ferdig og noe må bekreftes', st.nRc), tog('srv:n80', 'Budsjett passerer 80 %', '', st.n80), tog('nSub', 'Abonnement trekkes snart', 'Dagen før trekk', pref('nSub')), tog('nDom', 'Domene eller SSL utløper', '30 og 7 dager før', pref('nDom')), tog('nWeek', 'Ukesoppsummering', 'Søndag kl. 18', pref('nWeek'))],
      perm === 'denied' ? 'Varsler er blokkert i nettleseren. Tillat dem i nettleserens innstillinger for dette nettstedet.' : perm === 'unsupported' ? 'Denne nettleseren støtter ikke varsler. Legg FinansHub til på Hjem-skjermen, eller bruk de native appene.' : 'Nettappen varsler mens den er åpen i bakgrunnen. Push-varsler når appen er lukket finnes i de native appene.')}`;
  },

  srv: () => `${G('Adresse', [val('Denne økten', esc(location.origin)), btn('Test tilkobling', 'ping')],
      T.ping || 'Lokal og ekstern adresse, og automatisk bytte hjemme, stilles inn i de native appene. Nettappen bruker adressen du åpnet den fra.')}
    ${G('Status', [val('Aktiv', navigator.onLine ? `${location.protocol === 'https:' ? 'Kryptert' : 'Lokal'}${T.ms != null ? ` · ${T.ms} ms` : ''}` : 'Frakoblet', navigator.onLine ? '#7BE3A0' : '#FF8A80'), val('Siste synk', T.lastSync ? T.lastSync.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '–'), val('Serverversjon', esc(S.boot?.version ?? m.me?.version ?? '–'))])}`,

  data: () => `${G('Lagring', [val('Hurtigbuffer', T.usage != null ? `${n0(T.usage / 1e6)} MB` : '–'), btn('Tøm hurtigbuffer', 'clearcache')])}
    ${G('Synk', [btn('Synk nå', 'sync'), `<a class="opt-row" href="/finans/api/transactions.csv" download><span class="m-grow" style="color:var(--m-acc);font-weight:500">Eksporter som CSV</span></a>`],
      'Full backup og Excel-database lages i FinansHub på PC under Innstillinger → Backup og data.')}`,

  om: () => `${G('', [val('Appversjon', `${VERSION} (nettapp)`), val('Server', esc(S.boot?.version ?? m.me?.version ?? '–')), val('Plattform', isIOS() ? 'iOS · nettleser' : /Android/.test(navigator.userAgent) ? 'Android · nettleser' : 'Nettleser')])}
    ${G('', [`<details class="opt-row col"><summary style="color:var(--m-acc);font-weight:500">Personvern</summary><p class="snote" style="padding:6px 0 0">All data ligger på din egen homelab-server. Kvitteringer sendes bare til Gemini hvis du har valgt det som AI-motor; med Ollama blir de på hjemmenettet. Appen sporer ingenting.</p></details>`,
      `<details class="opt-row col"><summary style="color:var(--m-acc);font-weight:500">Lisenser</summary><p class="snote" style="padding:6px 0 0">Geist og Geist Mono (SIL OFL 1.1), Roboto Flex (SIL OFL 1.1). Logoer hentes fra Googles favicon-tjeneste og tilhører sine eiere.</p></details>`])}`,
};

/* ---------- Hendelser ---------- */

async function askNotify() { if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} } }

export async function settingsBind(e, t) {
  if (m.screen !== 'set') return false;
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'change' || e.type === 'input') {
    if (t.matches?.('[data-ntname]')) { T.nt.name = t.value; return true; }
    return false;
  }
  if (e.type !== 'click') return false;
  if ((x = d('[data-stog]'))) {
    const id = x.dataset.stog;
    if (id === 'iosbg') { try { localStorage.setItem('fh_ios_bg', iosBg() ? '0' : '1'); } catch {} }
    else if (id.startsWith('srv:')) { const k = id.slice(4); S.boot.settings = await api('/settings', { method: 'PUT', json: { [k]: !S.boot.settings[k] } }); if (S.boot.settings[k]) await askNotify(); }
    else { setPref(id, !pref(id)); if (id.startsWith('n') && pref(id)) await askNotify(); }
    draw(); return true;
  }
  if ((x = d('[data-schip]'))) {
    const id = x.dataset.schip, v = x.dataset.v;
    if (id === 'theme') { try { if (v === 'auto') localStorage.removeItem('fh_theme'); else localStorage.setItem('fh_theme', v); } catch {} }
    else if (id === 'ai') S.boot.settings = await api('/settings', { method: 'PUT', json: v === 'both' ? { provider: 'ollama', fallback: true } : { provider: v, fallback: false } });
    else if (id === 'ntscope') T.nt.scopes = T.nt.scopes.includes(v) ? T.nt.scopes.filter((s) => s !== v) : [...T.nt.scopes, v];
    else if (id === 'ntexp') T.nt.exp = v;
    else setPref(id, v);
    draw(); return true;
  }
  const act = d('[data-sact]')?.dataset.sact;
  if (!act) return false;
  if (act === 'logout') { await fetch('/api/logout', { method: 'POST' }); location.href = '/login?next=/finans/'; return true; }
  if (act === 'copy') { try { await navigator.clipboard.writeText(T.newTok); flash('Token kopiert'); } catch { flash('Marker og kopier tokenet manuelt'); } return true; }
  if (act === 'revoke') {
    const tk = T.tokens?.find((y) => y.id === x?.dataset?.id || y.id === d('[data-id]')?.dataset.id);
    if (!tk || !confirm(`Trekke tilbake «${tk.name}»? Snarveier og skript som bruker det slutter å virke.`)) return true;
    await api(`/tokens/${encodeURIComponent(tk.id)}`, { method: 'DELETE' });
    await settingsLoad('tok'); flash(`${tk.name} er trukket tilbake`); return true;
  }
  if (act === 'mktok') {
    const nt = T.nt;
    if (!nt.name.trim() || !nt.scopes.length) { flash('Gi tokenet navn og minst én tilgang'); return true; }
    const r = await api('/tokens', { method: 'POST', json: { name: nt.name.trim(), scopes: nt.scopes, expiresDays: nt.exp ? +nt.exp : null } });
    T.newTok = r.token; T.nt = { name: '', scopes: ['receipts:write'], exp: '90' };
    await settingsLoad('tok'); draw(); return true;
  }
  if (act === 'ping') {
    const t0 = performance.now();
    try { const r = await fetch('/healthz', { cache: 'no-store' }); T.ms = Math.round(performance.now() - t0); T.ping = r.ok ? `Tilkoblet ${location.host} · ${T.ms} ms` : `Serveren svarte ${r.status}`; }
    catch { T.ms = null; T.ping = `Fikk ikke kontakt med ${location.host}`; }
    draw(); return true;
  }
  if (act === 'clearcache') {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
    await settingsLoad('data'); flash('Hurtigbuffer tømt'); return true;
  }
  if (act === 'sync') { await Promise.all([loadBoot(), loadSummary()]); T.lastSync = new Date(); flash('Synket med serveren'); return true; }
  return false;
}

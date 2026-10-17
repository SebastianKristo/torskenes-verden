// Innstillinger: grupperte lister med ikon, verdi og › som åpner en detaljside (som Innstillinger på iPhone/Android).
import { esc, api, cssUrl } from './util.js';
import { store, emit, load } from './store.js';
import { OPTIONS, srcFor, applyBackground, preloadAll } from './background.js';
import { SEARCH_STYLES, GWORD, renderTicker, applyTicker, menuLabels, loadHistory, searchState, setHistory } from './extras.js';
import { DASH_WIDGETS, MOBILE_WIDGETS, TABS as NAV_TABS, FIXED_TABS, hiddenWidgets, hiddenTabs, tabAllowed, saveLayout, applyNav } from './profile.js';
import { orderOf, setOrder } from './dnd.js';
import { toggleHeadEdit, resetHead, setHeadLock, setHeadAlign, headAlign, saveUi } from './topedit.js';
import { loginView, loadLogin, loginClick, loginSubmit, loginChange } from './settings-login.js';
import { domainsPane, loadDomains, domainsClick, domainsChange, domainsSubmit, domainCount } from './settings-domains.js';

const modal = () => document.getElementById('settings');

/* ---------- Byggeklosser ---------- */

const P = {
  img: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01', move: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4',
  gap: 'M4 6h16M4 12h16M4 18h16', news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5', speed: 'M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0',
  pause: 'M8 5v14M16 5v14', srch: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5', hist: 'M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
  sug: 'M4 6h16M4 12h10M4 18h6', map: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', tabs: 'M4 7h16M4 12h16M4 17h10', check: 'M20 6L9 17l-5-5', reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  right: 'M4 12h12M12 6l6 6-6 6M20 4v16', eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', phone: 'M7 3h10v18H7zM11 18h2', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
};
export const svg = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

/**
 * Én rad i en gruppe. go: åpner en underside; act: data-attributt for en handling; tog: bryter (true/false).
 * ic: farge på ikonflaten, med enten svg (sti), img eller ini (forbokstaver).
 */
export function row(o) {
  const icon = o.ic ? `<span class="sg-ic" style="background:${o.ic}">${o.img ? `<img src="${esc(o.img)}" alt="">` : o.svg ? svg(o.svg) : esc(o.ini ?? '')}</span>` : '';
  const txt = `<span class="sg-txt"><b${o.tc ? ` style="color:${o.tc}"` : ''}>${esc(o.t)}</b>${o.s ? `<span>${esc(o.s)}</span>` : ''}</span>`;
  const val = o.v != null && o.v !== '' ? `<span class="sg-v"${o.vc ? ` style="color:${o.vc}"` : ''}>${esc(o.v)}</span>` : '';
  const tail = o.tog !== undefined ? '<span class="sg-sw"></span>' : o.go || o.chev ? '<span class="sg-chev" aria-hidden="true">›</span>' : '';
  const attrs = o.go ? `data-go="${esc(o.go)}"` : o.act ?? '';
  const role = o.tog !== undefined ? ` role="switch" aria-checked="${!!o.tog}"` : '';
  const dis = o.disabled ? ' disabled' : '';
  return `<button type="button" class="sg-row${o.danger ? ' danger' : ''}" ${attrs}${role}${dis}>${icon}${txt}${val}${tail}</button>`;
}
export const group = (t, rows, note = '') => `<section class="sg">${t ? `<div class="sg-t">${esc(t)}</div>` : ''}<div class="sg-box">${rows.filter(Boolean).join('')}</div>${note ? `<div class="sg-note">${note}</div>` : ''}</section>`;
const note = (html) => `<div class="sg-note">${html}</div>`;

/* ---------- Tilstand ---------- */

const TABS = [['look', 'Utseende', 'Bakgrunn, topplinje, nyhetsbar, søk og domener'], ['layout', 'Forside og meny', 'Widgets, faner og snarveier'],
  ['int', 'Integrasjoner', 'Adresser og API-nøkler for tjenestene'], ['login', 'Innlogging', 'Profil, brukere, 2FA og pålitelige enheter']];
let tab = 'look', sub = null, cfg = null, cfgErr = null, sqMsg = '';
const tests = {};           // gruppe → { st: 'run'|'ok'|'err', msg, at }
const cfgMsg = {};          // gruppe → { text, ok }
let saving = Promise.resolve();

// Hvilke data som må hentes på nytt når en integrasjonsgruppe endres.
const RELOAD = { 'Vær (MET/Yr)': ['weather'], 'Ruter (Entur)': ['ruter'], 'Kalender / timeplan': ['school'], 'Home Assistant': ['energy', 'health'],
  Sonarr: ['upcoming', 'health'], Radarr: ['upcoming', 'health'], 'Trading 212': ['trading'] };

const isAdmin = () => store.me.me?.role === 'admin';

/* ---------- Topplinje ---------- */

const TOP = [['head', 'hl_head_gap', 'Mellom seksjoner', 0, 120, 4, 16], ['tab', 'hl_tab_gap', 'Mellom faner', 0, 40, 2, 2], ['pad', 'hl_tab_pad', 'Bredde på faner', 6, 24, 1, 12]];
export function applyTop() {
  const t = store.me.top ?? {}, r = document.documentElement.style;
  r.setProperty('--hl-head-gap', (t.head ?? 16) + 'px');
  r.setProperty('--hl-tab-gap', (t.tab ?? 2) + 'px');
  r.setProperty('--hl-tab-pad', (t.pad ?? 12) + 'px');
}
const topVal = (k) => store.me.top?.[k] ?? TOP.find((x) => x[0] === k)[6];

const BGN = Object.fromEntries(OPTIONS.map(([k, n]) => [k, n]));
const SRN = Object.fromEntries(SEARCH_STYLES);
const speedTxt = (v) => `${Math.round(350 / v)} s per runde`;
const ui = () => store.me.ui ?? {};

function tabRows() {
  const order = orderOf('tabs', NAV_TABS.length), hid = hiddenTabs(), labels = store.me.layout?.labels ?? {};
  const shown = order.filter((i) => tabAllowed(NAV_TABS[i][0]));
  return shown.map((idx, pos) => {
    const [id, def] = NAV_TABS[idx], off = hid.has(id), fixed = FIXED_TABS.includes(id);
    return `<div class="sg-row tab-row${off ? ' off' : ''}"><input class="tab-name" value="${esc(labels[id] ?? '')}" placeholder="${esc(def)}" maxlength="30" data-tab-label="${id}" aria-label="Navn på fanen ${esc(def)}">
      <button class="lay-btn" data-lay-move="tabs:${order.indexOf(idx)}:${-1}:${shown[pos - 1] ?? ''}" aria-label="Flytt ${esc(def)} opp"${pos === 0 ? ' disabled' : ''}>▲</button>
      <button class="lay-btn" data-lay-move="tabs:${order.indexOf(idx)}:1:${shown[pos + 1] ?? ''}" aria-label="Flytt ${esc(def)} ned"${pos === shown.length - 1 ? ' disabled' : ''}>▼</button>
      ${fixed ? '<span class="lay-always">Alltid</span>' : `<button class="sw" role="switch" aria-checked="${!off}" data-lay-hide="t:${id}" aria-label="Vis ${esc(def)}"></button>`}</div>`;
  }).join('');
}

function srchPreview([k, name]) {
  const light = k === 'light' || k === 'wideLight', wide = k.startsWith('wide');
  const bar = light ? '#f5f7fa' : '#0a0c12', btn = light ? '#1a73e8' : '#a8d4fb';
  return `<button class="srch-opt" data-srch="${k}" aria-pressed="${store.me.searchStyle === k}">
    <div class="srch-prev" style="align-items:${wide ? 'stretch' : 'center'}">${wide ? '' : GWORD}
      <div class="bar2" style="width:${wide ? '100%' : '80%'};background:${bar}">${wide ? GWORD : ''}<em></em><s style="background:${btn}"></s></div></div>${name}</button>`;
}

function lookView() {
  const s = store.me, u = ui(), sq = searchState();
  if (!sub) {
    const visTabs = NAV_TABS.filter(([k]) => tabAllowed(k)), nHid = visTabs.filter(([k]) => hiddenTabs().has(k)).length;
    return { html: [
      group('Bakgrunn', [row({ t: 'Bakgrunnsbilde', s: 'Måne, Jorda, Saturn, Oslo, Vær eller eget bilde', v: BGN[s.bg] ?? 'Måne', ic: '#3b6fd6', svg: P.img, go: 'bg' })],
        'Bakgrunnsbildet vises bare på dashboardet. De andre sidene har rolig, mørk bakgrunn.'),
      group('Topplinje', [
        row({ t: 'Faner', s: 'Vis, skjul, endre rekkefølge og gi nytt navn', v: `${visTabs.length - nHid} av ${visTabs.length}`, ic: '#e0a325', svg: P.tabs, go: 'tabs' }),
        row({ t: 'Samle faner, vær og meny til høyre', s: 'Logoen står alene til venstre', tog: headAlign() === 'right', act: 'data-hp-align', ic: '#2a6fdb', svg: P.right }),
        row({ t: 'Flytt elementer', s: 'Dra logo, faner, vær og meny dit du vil', ic: '#7a5af0', svg: P.move, act: 'data-hp-edit', chev: true }),
        row({ t: 'Avstand og faner', v: `${topVal('head')} · ${topVal('tab')} · ${topVal('pad')} px`, ic: '#2a9d8f', svg: P.gap, go: 'head' }),
        row({ t: 'Samme høyde', s: 'Elementene kan bare flyttes sideveis', tog: !!u.headLock, act: 'data-toggle="ui:headLock"', ic: '#536079', svg: P.lock }),
        row({ t: 'Nullstill plassering', ic: '#3a4252', svg: P.reset, act: 'data-hp-reset2' }),
      ]),
      group('Nyhetsbar', [
        row({ t: 'Vis nyhetsbar', s: 'NRK og VG, bare på dashboardet', tog: !s.hideNews, act: 'data-toggle="news"', ic: '#c8102e', svg: P.news }),
        row({ t: 'Hastighet', v: `${u.newsSpeed ?? 5} · ${speedTxt(u.newsSpeed ?? 5)}`, ic: '#e07a2e', svg: P.speed, go: 'speed' }),
        row({ t: 'Pause når musepekeren er over', tog: u.newsPause !== false, act: 'data-toggle="ui:newsPause"', ic: '#536079', svg: P.pause }),
      ]),
      group('Søkebar', [
        row({ t: 'Vis søkebar', s: 'Kan dras mellom avgangene og klokka', tog: !s.hideSearch, act: 'data-toggle="search"', ic: '#1a73e8', svg: P.search }),
        row({ t: 'Stil', v: SRN[s.searchStyle] ?? 'Lys', ic: '#4285f4', svg: P.srch, go: 'style' }),
        row({ t: 'Forslag fra Google', s: 'Vises mens du skriver', tog: !!sq.suggest, act: 'data-toggle="sq:suggest"', ic: '#34a853', svg: P.sug }),
        row({ t: 'Lagre søkehistorikk', s: 'Vises når du klikker i søkefeltet, også i mobilappen', tog: !!sq.save, act: 'data-toggle="sq:save"', ic: '#f9ab00', svg: P.hist }),
        row({ t: 'Søkehistorikk', v: `${sq.hist?.length ?? 0} søk`, ic: '#5b6478', svg: P.hist, go: 'hist' }),
      ]),
      group('Domener', [
        row({ t: 'Administrer domener', s: 'Legg til, fjern og velg statistikkilde', v: domainCount() == null ? '' : `${domainCount()} ${domainCount() === 1 ? 'domene' : 'domener'}`, ic: '#3b6fd6', svg: P.map, go: 'doms' }),
        row({ t: 'Verdenskart med besøk per land', tog: u.domMap !== false, act: 'data-toggle="ui:domMap"', ic: '#0aa5a5', svg: P.map }),
      ]),
      group('Kvitteringer', [row({ t: 'Kategorier', s: 'Navn og farger', v: String(s.categories?.length ?? 0), ic: '#8f6ad6', svg: P.tag, go: 'cats' })]),
    ].join('') };
  }
  if (sub === 'bg') {
    const c = s.bgCustom, kind = store.data.weather?.kind ?? 'sol', kindName = { sol: 'sol', sky: 'skyet', regn: 'regn' }[kind];
    const opts = OPTIONS.map(([k, name, upl]) => {
      const img = srcFor(k);
      return `<div class="bg-opt"><button data-bg="${k}" aria-pressed="${s.bg === k}" style="${img ? `background-image:${esc(cssUrl(img))}` : ''}">${img || k === 'ingen' ? '' : 'last opp bilde'}</button>
        <div><span>${name}</span>${upl && k !== 'vaer' ? `<label class="upl">${k === 'oslo' ? 'Legg til' : 'Last opp'}<input type="file" accept="image/*" data-slot="${k}"></label>` : ''}</div></div>`;
    }).join('');
    const wslots = [['sol', 'Sol'], ['sky', 'Skyet'], ['regn', 'Regn']].map(([k, n]) =>
      `<label class="chip" style="cursor:pointer;color:${c['vaer_' + k] ? 'var(--green)' : 'var(--text)'}">${c['vaer_' + k] ? '✓' : '+'} ${n}<input type="file" accept="image/*" data-slot="vaer_${k}" hidden></label>`).join('');
    return { title: 'Bakgrunnsbilde', sub: 'Utseende · Bakgrunn', html: `<div class="bg-opts">${opts}</div>
      ${note(`«Oslo» bytter mellom bilder av byen hvert 15. sekund${c.oslo?.length ? ` (${c.oslo.length} egne bilder, <button class="sg-link" data-clear="oslo">fjern</button>)` : ''}. «Vær» viser et bilde som passer dagens vær (nå: ${kindName}). Du kan erstatte værbildene med egne:`)}
      <div class="chips" style="padding:0 18px">${wslots}</div>` };
  }
  if (sub === 'tabs') return { title: 'Faner', sub: 'Utseende · Topplinje', html: `<section class="sg"><div class="sg-t">Faner i topplinjen</div><div class="sg-box">${tabRows()}</div>
      ${note('Klikk på navnet for å endre det. Tomt felt gir standardnavnet. Dashboard kan ikke skjules. Skjulte sider kan fortsatt åpnes med lenke.')}</section>
      <div class="sg-acts"><button class="sg-btn" data-tabs-reset>Tilbakestill faner</button></div>` };
  if (sub === 'head') return { title: 'Avstand og faner', sub: 'Utseende · Topplinje', html: `<section class="sg"><div class="sg-t">Avstand</div><div class="sg-box">${TOP.map(([k, , label, min, max, step]) =>
      `<label class="sg-field range"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${topVal(k)}" data-top="${k}"><output class="mono">${topVal(k)} px</output></label>`).join('')}</div>
      ${note('Endringene vises med en gang i topplinjen bak dette vinduet.')}</section>` };
  if (sub === 'speed') {
    const v = u.newsSpeed ?? 5;
    return { title: 'Hastighet', sub: 'Utseende · Nyhetsbar', html: `<section class="sg"><div class="sg-t">Hastighet</div><div class="sg-box speed-box">
      <div class="speed-top"><b data-speed-n>${v}</b><span class="mono" data-speed-t>${speedTxt(v)}</span></div>
      <div class="speed-ctl"><button class="speed-pm" data-speed-step="-1" aria-label="Saktere">−</button><input type="range" min="1" max="10" step="1" value="${v}" data-news-speed aria-label="Hastighet"><button class="speed-pm" data-speed-step="1" aria-label="Raskere">+</button></div>
      <div class="speed-pre">${[['Sakte', 2], ['Normal', 5], ['Rask', 8]].map(([n, x]) => `<button data-speed-set="${x}" aria-pressed="${v === x}">${n}</button>`).join('')}</div></div>
      ${note('1 er tregest og 10 raskest. Endringen vises med en gang. Du kan også åpne denne siden med knappen helt til høyre i nyhetsbaren.')}</section>` };
  }
  if (sub === 'style') return { title: 'Søkebar', sub: 'Utseende · Søkebar', html: `<div class="srch-opts">${SEARCH_STYLES.map(srchPreview).join('')}</div>` };
  if (sub === 'hist') {
    return { title: 'Søkehistorikk', sub: 'Utseende · Søkebar', html: `<section class="sg"><div class="sg-t">${sq.hist?.length ?? 0} søk lagret</div><div class="sg-box">
      <label class="sg-row" style="cursor:pointer"><span class="sg-txt"><b>Importer Google-historikk</b><span>Google Takeout → Mine aktiviteter → Søk (JSON)</span></span><span class="sg-v" style="color:var(--blue);font-weight:600">Velg fil</span><input type="file" accept=".json,application/json" data-sq-import hidden></label>
      ${row({ t: 'Tøm søkehistorikk', tc: '#f59a8f', act: 'data-sq-clearall' })}</div>
      ${sqMsg ? `<div class="sg-note green">${esc(sqMsg)}</div>` : ''}
      ${note('Google lar ikke andre sider lese søkehistorikken direkte. Eksporter den fra takeout.google.com og importer filen her, så kommer de gamle søkene med i forslagene.')}</section>` };
  }
  if (sub === 'doms') return { title: 'Domener', sub: 'Utseende · Domener', html: domainsPane() };
  if (sub === 'cats') {
    const cats = s.categories.map((cat, i) => `<div class="sg-row cat-row"><input type="color" value="${cat.color}" data-ci="${i}" data-ck="color" aria-label="Farge"><input class="tab-name" value="${esc(cat.name)}" data-ci="${i}" data-ck="name" aria-label="Navn" maxlength="30"><button class="sg-pill danger" data-cdel="${i}" aria-label="Slett ${esc(cat.name)}">Slett</button></div>`).join('');
    return { title: 'Kategorier', sub: 'Utseende · Kvitteringer', html: `<section class="sg"><div class="sg-t">Kategorier</div><div class="sg-box">${cats}</div>${note('Brukes på kvitteringene i Homelab. FinansHub har egne kategorier.')}</section>
      <div class="sg-acts"><button class="sg-btn" data-cadd>+ Ny kategori</button></div>` };
  }
  sub = null; return lookView();
}

/* ---------- Forside og meny ---------- */

function layList(g, items, hidden, fixed = []) {
  const order = orderOf(g, items.length);
  return order.map((idx, pos) => {
    const [id, name] = items[idx], off = hidden.has(id), lock = fixed.includes(id);
    return `<div class="sg-row lay-row${off ? ' off' : ''}"><span class="lay-no">${pos + 1}</span><span class="lay-name">${esc(name)}</span>
      <button class="lay-btn" data-lay-move="${g}:${pos}:-1" aria-label="Flytt ${esc(name)} opp"${pos === 0 ? ' disabled' : ''}>▲</button>
      <button class="lay-btn" data-lay-move="${g}:${pos}:1" aria-label="Flytt ${esc(name)} ned"${pos === order.length - 1 ? ' disabled' : ''}>▼</button>
      ${lock ? '<span class="lay-always">Alltid</span>' : `<button class="sw" role="switch" aria-checked="${!off}" data-lay-hide="w:${id}" aria-label="Vis ${esc(name)}"></button>`}</div>`;
  }).join('');
}
const shownOf = (items) => `${items.filter(([id]) => !hiddenWidgets().has(id)).length} av ${items.length} vises`;

function layoutView() {
  const sc = store.me.shortcuts ?? [];
  if (!sub) {
    const visTabs = NAV_TABS.filter(([k]) => tabAllowed(k)), nHid = visTabs.filter(([k]) => hiddenTabs().has(k)).length;
    return { html: group('Forside', [
      row({ t: 'Widgets på dashboardet', s: 'Skjul det du ikke bruker, for eksempel snarveier', v: shownOf(DASH_WIDGETS), ic: '#3b6fd6', svg: P.grid, go: 'dash' }),
      row({ t: 'Widgets på mobil', v: shownOf(MOBILE_WIDGETS), ic: '#7a5af0', svg: P.phone, go: 'mob' }),
      row({ t: 'Snarveier', s: 'Lenker på dashboardet og i mobilappen', v: `${sc.length}`, ic: '#2a9d8f', svg: P.link, go: 'sc' }),
    ], 'Rekkefølgen kan også endres ved å dra kortene på forsiden.') + group('Meny', [
      row({ t: 'Faner i topplinjen', s: 'Vis, skjul, endre rekkefølge og gi nytt navn', v: `${visTabs.length - nHid} av ${visTabs.length}`, ic: '#e0a325', svg: P.tabs, go: 'look:tabs' }),
    ]) };
  }
  if (sub === 'dash') return { title: 'Widgets på dashboardet', sub: 'Forside og meny', html: `<section class="sg"><div class="sg-box">${layList('dash', DASH_WIDGETS, hiddenWidgets())}</div></section>` };
  if (sub === 'mob') return { title: 'Widgets på mobil', sub: 'Forside og meny', html: `<section class="sg"><div class="sg-box">${layList('m_home', MOBILE_WIDGETS, hiddenWidgets())}</div></section>` };
  if (sub === 'sc') return { title: 'Snarveier', sub: 'Forside og meny', html: `<form class="sg" data-sc-form><div class="sg-t">Snarveier</div><div class="sg-box">
      ${sc.map((x, i) => `<div class="sg-row sc-row"><input class="tab-name" name="n${i}" value="${esc(x.name)}" aria-label="Navn" maxlength="30" style="flex:0 1 150px"><input class="tab-name mono" name="u${i}" value="${esc(x.url)}" aria-label="Adresse" spellcheck="false"><button type="button" class="sg-pill danger" data-sc-del="${i}" aria-label="Fjern ${esc(x.name)}">Fjern</button></div>`).join('')}
      <div class="sg-row sc-row"><input class="tab-name" name="nnew" placeholder="Navn" maxlength="30" style="flex:0 1 150px"><input class="tab-name mono" name="unew" placeholder="https://…" spellcheck="false"><button class="sg-pill" type="submit">Legg til</button></div></div>
      ${note('Endringer i navn og adresser lagres med «Lagre». Adresser på lokalnettet (192.168.x.x, .local) vises under «På lokalnettet».')}
      <div class="sg-acts"><button class="sg-btn pri" type="submit">Lagre</button><button type="button" class="sg-btn" data-sc-reset>Tilbakestill snarveier</button><span class="muted" data-sc-msg style="font-size:13px"></span></div></form>` };
  sub = null; return layoutView();
}

async function saveShortcuts(list) {
  try {
    store.me.shortcuts = await api('/me/shortcuts', { method: 'PUT', json: list });
    emit('route'); render();
    const m2 = modal().querySelector('[data-sc-msg]'); if (m2) { m2.textContent = 'Lagret ✓'; m2.className = 'green'; }
  } catch (e) { const msg = modal().querySelector('[data-sc-msg]'); if (msg) { msg.textContent = e.message; msg.className = 'red'; } }
}

/* ---------- Integrasjoner ---------- */

// gruppe → [visningsnavn, undertekst, ikon, farge, kategori, verdi(v, satt)]. Verdi som starter med «!» er en advarsel.
const INT = {
  'Vær (MET/Yr)': ['Vær', 'MET / Yr', 'Yr', '#1f8fd6', 'Informasjon', (v) => v.wx_place || 'Oslo'],
  'Ruter (Entur)': ['Ruter', 'Entur', 'R', '#d0605a', 'Informasjon', (v) => { const n = String(v.ruter_routes ?? '').split('\n').filter((l) => l.trim()).length; return n ? `${n} ${n === 1 ? 'strekning' : 'strekninger'}` : '!Ingen strekninger'; }],
  'Kalender / timeplan': ['Kalender og timeplan', 'iCal · MazeMap', 'K', '#8f6ad6', 'Informasjon', (v, set) => (set.cal_ics ? 'Koblet' : '!Ikke koblet')],
  'NASA / CelesTrak': ['Rom', 'NASA · CelesTrak', 'N', '#4b6cf0', 'Informasjon', (v) => v.sat_group || 'starlink'],
  'Home Assistant': ['Home Assistant', 'Lokal server', 'HA', '#0aa5a5', 'Smarthjem', (v, set) => (set.ha_token ? 'Tilkoblet' : '!Mangler token')],
  Sonarr: ['Sonarr', 'Serier', 'S', '#2f8fd8', 'Media', (v, set) => (set.sonarr_key ? `${v.sonarr_days || 14} dager frem` : '!Mangler API-nøkkel')],
  Radarr: ['Radarr', 'Filmer', 'R', '#e0a325', 'Media', (v, set) => (set.radarr_key ? `${v.radarr_days || 14} dager frem` : '!Mangler API-nøkkel')],
  'Trading 212': ['Trading 212', 'Aksjer', 'T', '#13a37f', 'Økonomi', (v, set) => (set.t212_key ? 'Tilkoblet' : '!Mangler API-nøkkel')],
  Cloudflare: ['Cloudflare', 'Standard-token for Domener', 'CF', '#f38020', 'Nett', (v, set) => (set.cf_token ? 'Token lagret' : '!Mangler token')],
  'Søk': ['Søkemotor', 'Søke-URL', 'G', '#5b6478', 'Annet', (v) => (/google\./.test(v.search_url ?? '') ? 'Google' : 'Egen')],
};
const NOTES = {
  'Home Assistant': 'Home Assistant må være tilgjengelig fra serveren. Lag et long-lived access token under profilen din i Home Assistant.',
  'Trading 212': 'Lag nøkkelen hos Trading 212 under Innstillinger → API (Beta). Gi bare lesetilgang.',
  'Ruter (Entur)': 'Én strekning per linje: Fra (NSR-ID) &gt; Til (NSR-ID). Finn stopp-ID på stoppested.entur.org.',
  Cloudflare: 'Tokenet trenger Zone, DNS, Analytics, Registrar og Firewall Services: Read. Domener legges til under Utseende → Domener.',
  'Kalender / timeplan': 'iCal-adressen finner du i Canvas (Kalender → Kalenderfeed) eller Outlook (Publiser kalender).',
};
const metaOf = (name) => INT[name] ?? [name, '', name.slice(0, 2), '#5b6478', 'Annet', () => ''];
const valsOf = (g) => [Object.fromEntries(g.fields.map((f) => [f.key, f.value])), Object.fromEntries(g.fields.map((f) => [f.key, f.set]))];
const when = (t) => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function testState(name) {
  const t = tests[name];
  if (!t) return null;
  return t.st === 'run' ? { v: 'Tester …', vc: '#b6bccb' } : t.st === 'ok' ? { v: '✓ OK', vc: '#8fe0b0' } : { v: '✕ Feilet', vc: '#f59a8f' };
}

function intView() {
  if (cfgErr) return { html: `<div class="err">${esc(cfgErr)}</div>` };
  if (!cfg) return { html: '<div class="skeleton" style="min-height:240px;border-radius:20px"></div>' };
  if (!sub) {
    const res = Object.values(tests), ok = res.filter((t) => t.st === 'ok').length, bad = res.filter((t) => t.st === 'err').length, run = res.some((t) => t.st === 'run');
    const cats = [...new Set(cfg.map((g) => metaOf(g.name)[4]))];
    return { html: (isAdmin() ? group('Tilkoblinger', [row({ t: run ? 'Tester …' : 'Test alle tilkoblinger', s: res.length ? `${ok} OK · ${bad} feilet` : 'Sjekker adresse, nøkkel og svar fra hver tjeneste', ic: '#1d6b4a', svg: P.check, act: 'data-test-all', disabled: run })]) : '')
      + cats.map((c) => group(c, cfg.filter((g) => metaOf(g.name)[4] === c).map((g) => {
        const [name, s, ini, color, , val] = metaOf(g.name), v = val(...valsOf(g)), warn = v.startsWith('!'), t = testState(g.name);
        return row({ t: name, s, ini, ic: color, v: t?.v ?? (warn ? v.slice(1) : v), vc: t?.vc ?? (warn ? '#f3b54a' : undefined), go: 'cfg:' + g.name });
      }))).join('')
      + note(isAdmin() ? 'Tomme felt bruker verdien fra serverens miljøvariabler (.env). Hemmeligheter vises aldri igjen etter lagring.' : 'Bare administratorer kan endre integrasjonene.') };
  }
  const gname = sub.slice(4), g = cfg.find((x) => x.name === gname);
  if (!g) { sub = null; return intView(); }
  const [name, s] = metaOf(g.name), t = tests[g.name], m = cfgMsg[g.name], ro = !isAdmin();
  const fields = g.fields.map((f) => f.type === 'textarea'
    ? `<label class="sg-field area"><span>${esc(f.label)}</span><textarea name="${f.key}" rows="5" spellcheck="false"${ro ? ' readonly' : ''}>${esc(f.value)}</textarea></label>`
    : `<label class="sg-field"><span>${esc(f.label)}</span><input name="${f.key}" type="${f.type}" value="${esc(f.value)}" placeholder="${f.secret ? (f.set ? '•••••••• lagret' : 'ikke satt') : ''}" autocomplete="off" spellcheck="false"${ro ? ' readonly' : ''}>${f.secret && f.set && !ro ? `<button type="button" class="sg-link red" data-clear-secret="${f.key}">Fjern</button>` : ''}</label>`).join('');
  const res = t && t.st !== 'run' ? `<div class="sg-res"><i style="background:${t.st === 'ok' ? '#34c759' : '#f26b5e'}"></i><div><b>${t.st === 'ok' ? 'Tilkoblet' : 'Tilkoblingen feilet'}</b><span>${esc(t.msg)}</span></div><span class="mono">${when(t.at)}${t.ms ? ` · ${t.ms} ms` : ''}</span></div>` : '';
  return { title: name, sub: `Integrasjoner · ${s}`, html: `<form class="sg" data-group="${esc(g.name)}"><div class="sg-t">Oppsett</div><div class="sg-box">${fields}</div>
      ${NOTES[g.name] ? note(NOTES[g.name]) : ''}</form>
      ${ro ? note('Bare administratorer kan endre og teste integrasjonene.') : `<div class="sg-acts"><button class="sg-btn pri" data-test="${esc(g.name)}"${t?.st === 'run' ? ' disabled' : ''}>${t?.st === 'run' ? 'Tester …' : 'Test tilkobling'}</button>
        <span class="${m ? (m.ok ? 'green' : 'red') : 'muted'}" style="font-size:13px">${esc(m?.text ?? 'Endringer lagres automatisk')}</span></div>`}${res}` };
}

async function runTest(name) {
  tests[name] = { st: 'run' }; render();
  await saving;
  try {
    const r = await api(`/config/test/${encodeURIComponent(name)}`, { method: 'POST' });
    tests[name] = { st: r.ok ? 'ok' : 'err', msg: r.message, ms: r.ms, at: Date.now() };
  } catch (e) { tests[name] = { st: 'err', msg: e.message, at: Date.now() }; }
  render();
}

async function saveGroup(name, changes) {
  cfgMsg[name] = { text: 'Lagrer …', ok: true }; render();
  const p = (async () => {
    try {
      cfg = await api('/config', { method: 'PUT', json: changes });
      const st = await api('/state');
      Object.assign(store.me, { place: st.place, schoolUrl: st.schoolUrl, searchUrl: st.searchUrl });
      (RELOAD[name] ?? []).forEach((k) => load(k));
      cfgMsg[name] = { text: 'Lagret ✓', ok: true };
      delete tests[name];
    } catch (e) { cfgMsg[name] = { text: e.message, ok: false }; }
    render();
  })();
  saving = p.catch(() => {});
  return p;
}

/* ---------- Ramme ---------- */

function view() {
  return tab === 'look' ? lookView() : tab === 'layout' ? layoutView() : tab === 'int' ? intView() : loginView(sub, go);
}

function render() {
  const [, title, subt] = TABS.find(([k]) => k === tab);
  const body = modal().querySelector('.set-body'), keep = body?.dataset.key === `${tab}|${sub}` ? body.scrollTop : 0;
  const v = view();
  // Fokus i et tekstfelt beholdes når siden tegnes på nytt (f.eks. etter automatisk lagring).
  const act = document.activeElement, fk = modal().contains(act) && act.name ? [act.closest('form')?.dataset.group ?? '', act.name, act.selectionStart] : null;
  modal().innerHTML = `<div class="set-box" role="dialog" aria-modal="true" aria-labelledby="set-title">
    <aside class="set-side" role="tablist"><h2>Innstillinger</h2>${TABS.map(([k, n]) => `<button class="set-tab" role="tab" data-tab="${k}" aria-selected="${k === tab}"><i></i>${n}</button>`).join('')}<div class="grow" style="flex:1"></div></aside>
    <div class="set-main"><div class="set-head"><div class="set-hl">${sub ? '<button class="set-back" data-back aria-label="Tilbake">‹</button>' : ''}<div style="min-width:0"><div class="t" id="set-title">${esc(v.title ?? title)}</div><div class="s">${esc(v.sub ?? subt)}</div></div></div><button class="set-close" data-close aria-label="Lukk">×</button></div>
    <div class="set-body" data-key="${esc(`${tab}|${sub}`)}"><div class="set-inner">${v.html}</div></div></div></div>`;
  modal().querySelector('.set-body').scrollTop = keep;
  if (fk) {
    const el = [...modal().querySelectorAll(`[name="${CSS.escape(fk[1])}"]`)].find((e) => (e.closest('form')?.dataset.group ?? '') === fk[0]);
    if (el) { el.focus(); try { el.setSelectionRange(fk[2], fk[2]); } catch { /* range/select */ } }
  }
}

/** Åpner en underside. «tab:sub» bytter også fane. */
function go(to) {
  const [a, b] = to.includes(':') && !to.startsWith('cfg:') && !to.startsWith('user:') ? to.split(':') : [null, to];
  if (a && TABS.some(([k]) => k === a)) tab = a;
  sub = b || null;
  enter();
  render();
}

function enter() {
  if (tab === 'int' && !cfg) loadCfg();
  if (tab === 'login') loadLogin(() => { if (!modal().hidden && tab === 'login') render(); });
  if (tab === 'look' && (sub === 'doms' || !sub)) loadDomains(() => { if (!modal().hidden && tab === 'look') render(); });
}

async function loadCfg() {
  try { cfg = await api('/config'); cfgErr = null; } catch (e) { cfgErr = e.message; }
  if (!modal().hidden && tab === 'int') render();
}

export function openSettings(which = 'look', subPage = null) {
  tab = which; sub = subPage; render(); modal().hidden = false; modal().querySelector('[data-close]').focus();
  loadCfg(); enter();
  loadHistory(true).then(() => { if (!modal().hidden && tab === 'look') render(); });
}
export function closeSettings() { modal().hidden = true; }

async function saveCats() {
  await api('/settings/categories', { method: 'PUT', json: { value: store.me.categories } });
  emit('receipts');
}

function setSpeed(v) {
  v = Math.min(10, Math.max(1, v));
  store.me.ui.newsSpeed = v; applyTicker(); saveUi({ newsSpeed: v });
}

async function saveLabels(id, name) {
  const labels = { ...(store.me.layout?.labels ?? {}) };
  if (name.trim()) labels[id] = name.trim().slice(0, 30); else delete labels[id];
  await saveLayout({ labels });
  applyNav();
}

export function bindSettings() {
  const m = modal();
  m.addEventListener('click', async (e) => {
    if (e.target === m || e.target.closest('[data-close]')) return closeSettings();
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; sub = null; enter(); render(); return; }
    if (e.target.closest('[data-back]')) { sub = null; render(); return; }
    if (e.target.closest('[data-hp-edit]')) { closeSettings(); toggleHeadEdit(true); return; }
    const g = e.target.closest('[data-go]');
    if (g && g.dataset.go) return go(g.dataset.go);
    if (tab === 'login' && await loginClick(e)) return;
    if (tab === 'look' && sub === 'doms' && await domainsClick(e)) return;

    /* Integrasjoner */
    const tb = e.target.closest('[data-test]');
    if (tb) { e.preventDefault(); return runTest(tb.dataset.test); }
    if (e.target.closest('[data-test-all]')) { await Promise.all(cfg.map((x) => runTest(x.name))); return; }
    const cs = e.target.closest('[data-clear-secret]');
    if (cs) {
      e.preventDefault();
      if (confirm('Fjerne den lagrede hemmeligheten? Verdien fra .env brukes da, hvis den finnes.')) saveGroup(cs.closest('form').dataset.group, { [cs.dataset.clearSecret]: null });
      return;
    }

    /* Forside, meny og faner */
    const mv = e.target.closest('[data-lay-move]');
    if (mv) {
      const [gname, pos, d, other] = mv.dataset.layMove.split(':'), n = { dash: DASH_WIDGETS, m_home: MOBILE_WIDGETS, tabs: NAV_TABS }[gname].length;
      const order = orderOf(gname, n), i = +pos;
      // Fanelisten kan ha skjulte (ikke tillatte) faner imellom; da byttes det med neste synlige.
      const j = gname === 'tabs' && other !== '' ? order.indexOf(+other) : i + +d;
      if (j < 0 || j >= n) return;
      [order[i], order[j]] = [order[j], order[i]];
      await setOrder(gname, order); render(); return;
    }
    const lh = e.target.closest('[data-lay-hide]');
    if (lh) {
      const [kind, id] = lh.dataset.layHide.split(':');
      if (kind === 'w') { const set = hiddenWidgets(); set.has(id) ? set.delete(id) : set.add(id); await saveLayout({ hiddenWidgets: [...set] }); emit('route'); }
      else { const set = new Set(store.me.layout?.hiddenTabs ?? []); set.has(id) ? set.delete(id) : set.add(id); await saveLayout({ hiddenTabs: [...set] }); applyNav(); }
      render(); return;
    }
    if (e.target.closest('[data-tabs-reset]')) {
      if (!confirm('Tilbakestille navn, rekkefølge og synlighet for fanene?')) return;
      await saveLayout({ labels: {}, hiddenTabs: [] });
      await setOrder('tabs', NAV_TABS.map((_, i) => i));
      applyNav(); render(); return;
    }
    const scd = e.target.closest('[data-sc-del]');
    if (scd) { await saveShortcuts((store.me.shortcuts ?? []).filter((_, i) => i !== +scd.dataset.scDel).map(({ name, url }) => ({ name, url }))); return; }
    if (e.target.closest('[data-sc-reset]')) { if (confirm('Tilbakestille snarveiene til standardlisten?')) await saveShortcuts(null); return; }

    /* Utseende */
    if (e.target.closest('[data-sq-clearall]')) {
      if (!confirm('Tømme hele søkehistorikken?')) return;
      await api('/search/history', { method: 'DELETE' }).catch(() => {}); setHistory([]); sqMsg = 'Historikken er tømt'; render(); return;
    }
    const bg = e.target.closest('[data-bg]');
    if (bg) { store.me.bg = bg.dataset.bg; api('/settings/bg', { method: 'PUT', json: { value: store.me.bg } }); applyBackground(); render(); return; }
    const sr = e.target.closest('[data-srch]');
    if (sr) {
      store.me.searchStyle = sr.dataset.srch;
      api('/settings/search_style', { method: 'PUT', json: { value: store.me.searchStyle } });
      if (store.me.hideSearch) { store.me.hideSearch = false; api('/settings/hide_search', { method: 'PUT', json: { value: false } }); menuLabels(); }
      emit('route'); render(); return;
    }
    if (e.target.closest('[data-hp-reset2]')) { resetHead(); render(); return; }
    if (e.target.closest('[data-hp-align]')) { await setHeadAlign(headAlign() === 'right' ? 'left' : 'right'); render(); return; }
    const ss = e.target.closest('[data-speed-step],[data-speed-set]');
    if (ss) { setSpeed(ss.dataset.speedSet ? +ss.dataset.speedSet : (ui().newsSpeed ?? 5) + +ss.dataset.speedStep); render(); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg?.dataset.toggle.startsWith('sq:')) {
      const k = tg.dataset.toggle.slice(3), st = searchState();
      Object.assign(st, await api('/search/settings', { method: 'PUT', json: { [k]: !st[k] } }).catch(() => ({})));
      render(); return;
    }
    if (tg?.dataset.toggle.startsWith('ui:')) {
      const k = tg.dataset.toggle.slice(3), v = !(k === 'newsPause' || k === 'domMap' ? ui()[k] !== false : ui()[k]);
      if (k === 'headLock') await setHeadLock(v); else await saveUi({ [k]: v });
      if (k === 'newsPause') applyTicker();
      if (k === 'domMap') emit('route');
      render(); return;
    }
    if (tg) {
      const k = tg.dataset.toggle === 'search' ? 'hideSearch' : 'hideNews';
      store.me[k] = !store.me[k];
      api(`/settings/hide_${tg.dataset.toggle}`, { method: 'PUT', json: { value: store.me[k] } });
      menuLabels();
      if (k === 'hideNews') renderTicker(); else emit('route');
      render(); return;
    }
    const clr = e.target.closest('[data-clear]');
    if (clr) { store.me.bgCustom = (await api(`/backgrounds/${clr.dataset.clear}`, { method: 'DELETE' })).bgCustom; applyBackground(); render(); return; }
    if (e.target.closest('[data-cadd]')) { store.me.categories.push({ name: 'Ny', color: '#a8d4fb' }); await saveCats(); render(); return; }
    const del = e.target.closest('[data-cdel]');
    if (del && store.me.categories.length > 1) { store.me.categories.splice(+del.dataset.cdel, 1); await saveCats(); render(); }
  });

  m.addEventListener('submit', async (e) => {
    if (tab === 'login' && await loginSubmit(e)) return;
    if (await domainsSubmit(e)) return;
    const sf = e.target.closest('[data-sc-form]');
    if (sf) {
      e.preventDefault();
      const list = (store.me.shortcuts ?? []).map((x, i) => ({ name: sf[`n${i}`].value.trim(), url: sf[`u${i}`].value.trim() }));
      if (sf.nnew.value.trim() || sf.unew.value.trim()) {
        let u = sf.unew.value.trim();
        if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
        list.push({ name: sf.nnew.value.trim() || u.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0], url: u });
      }
      saveShortcuts(list); return;
    }
    // Enter i et integrasjonsfelt lagrer feltet (change-hendelsen gjør selve lagringen).
    if (e.target.closest('[data-group]')) { e.preventDefault(); document.activeElement?.blur?.(); }
  });

  m.addEventListener('input', (e) => {
    if (e.target.matches('[data-news-speed]')) {
      const v = +e.target.value;
      store.me.ui.newsSpeed = v; applyTicker();
      m.querySelector('[data-speed-n]').textContent = v; m.querySelector('[data-speed-t]').textContent = speedTxt(v);
      m.querySelectorAll('[data-speed-set]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speedSet === v)));
      return;
    }
    const k = e.target.dataset?.top;
    if (!k) return;
    store.me.top = { ...store.me.top, [k]: +e.target.value };
    e.target.nextElementSibling.textContent = e.target.value + ' px';
    applyTop();
  });

  m.addEventListener('change', async (e) => {
    const t = e.target;
    if (tab === 'login' && await loginChange(e)) return;
    if (domainsChange(e)) return;
    if (t.matches('[data-news-speed]')) { saveUi({ newsSpeed: +t.value }); return; }
    if (t.matches('[data-tab-label]')) { await saveLabels(t.dataset.tabLabel, t.value); return; }
    const form = t.closest('[data-group]');
    if (form && cfg && isAdmin()) {
      const g = cfg.find((x) => x.name === form.dataset.group), f = g?.fields.find((x) => x.key === t.name);
      if (!f) return;
      const v = t.value;
      if (f.secret ? !v : v === f.value) return;
      saveGroup(g.name, { [f.key]: v }); return;
    }
    if (t.matches('[data-sq-import]')) {
      const f = t.files[0]; t.value = '';
      if (!f) return;
      let queries;
      try {
        const data = JSON.parse(await f.text());
        queries = (Array.isArray(data) ? data : []).map((x) => String(x?.title ?? '').match(/^(?:Searched for|Søkte etter|Søkt etter|Har søkt etter)\s+(.+)$/i)?.[1]).filter(Boolean);
      } catch { sqMsg = 'Kunne ikke lese filen'; render(); return; }
      try {
        const r = await api('/search/history/import', { method: 'POST', json: { queries } });
        sqMsg = `${r.imported} søk importert fra Google${r.found > r.imported ? ` (${r.found - r.imported} fantes fra før eller ble kuttet)` : ''}`;
        await loadHistory(true);
      } catch (err) { sqMsg = err.message; }
      render(); return;
    }
    if (t.dataset.top) { const [, key] = TOP.find(([k]) => k === t.dataset.top); api(`/settings/${key}`, { method: 'PUT', json: { value: +t.value } }); return; }
    if (t.dataset.slot) {
      const f = t.files[0];
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try {
        store.me.bgCustom = (await api(`/backgrounds/${t.dataset.slot}`, { method: 'POST', body: fd })).bgCustom;
        if (!t.dataset.slot.startsWith('vaer_')) { store.me.bg = t.dataset.slot; api('/settings/bg', { method: 'PUT', json: { value: store.me.bg } }); }
        preloadAll(); applyBackground(); render();
      } catch (err) { alert(err.message); }
      return;
    }
    if (t.dataset.ci !== undefined) {
      const cat = store.me.categories[+t.dataset.ci];
      const v = t.value.trim();
      if (t.dataset.ck === 'name' && v) cat.name = v.slice(0, 30); else if (t.dataset.ck === 'color') cat.color = v;
      await saveCats();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (m.hidden) return;
    if (e.key === 'Escape') { if (sub && !e.target.closest?.('input,textarea,select')) { sub = null; render(); } else closeSettings(); }
  });
}

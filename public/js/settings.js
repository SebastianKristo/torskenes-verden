import { esc, api, cssUrl } from './util.js';
import { store, emit, load } from './store.js';
import { OPTIONS, srcFor, applyBackground, preloadAll } from './background.js';
import { SEARCH_STYLES, GWORD, renderTicker, applyTicker, menuLabels, loadHistory, searchState, setHistory } from './extras.js';
import { DASH_WIDGETS, MOBILE_WIDGETS, TABS as NAV_TABS, FIXED_TABS, hiddenWidgets, hiddenTabs, tabAllowed, saveLayout, applyNav } from './profile.js';
import { orderOf, setOrder } from './dnd.js';
import { toggleHeadEdit, resetHead, setHeadLock, saveUi } from './topedit.js';
import { loginTab, loadLogin, loginClick, loginSubmit, loginChange } from './settings-login.js';

const modal = () => document.getElementById('settings');

// Topplinje: mellomrom og fanebredde fra Utseende → Topplinje.
const TOP = [['head', 'hl_head_gap', 'Mellomrom mellom seksjoner', 0, 120, 4, 16], ['tab', 'hl_tab_gap', 'Mellomrom mellom faner', 0, 40, 2, 2], ['pad', 'hl_tab_pad', 'Bredde på faner', 6, 24, 1, 12]];
export function applyTop() {
  const t = store.me.top ?? {}, r = document.documentElement.style;
  r.setProperty('--hl-head-gap', (t.head ?? 16) + 'px');
  r.setProperty('--hl-tab-gap', (t.tab ?? 2) + 'px');
  r.setProperty('--hl-tab-pad', (t.pad ?? 12) + 'px');
}
const topSliders = () => TOP.map(([k, , label, min, max, step, def]) => {
  const v = store.me.top?.[k] ?? def;
  return `<label class="top-range">${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-top="${k}"><span class="mono">${v} px</span></label>`;
}).join('');
const TABS = [['look', 'Utseende', 'Bakgrunn, topplinje, søkebar, nyhetslinje og kategorier'], ['layout', 'Forside og meny', 'Rekkefølge og synlighet for widgets, faner og snarveier'], ['int', 'Integrasjoner', 'Lagres på serveren. Hemmeligheter vises aldri igjen etter lagring.'], ['login', 'Innlogging', 'Brukere, profilbilde, 2FA og pålitelige enheter']];
let sqMsg = '';
let tab = 'look', cfg = null, cfgErr = null;

// Hvilke data som må hentes på nytt når en integrasjonsgruppe endres.
const RELOAD = { 'Vær (MET/Yr)': ['weather'], 'Ruter (Entur)': ['ruter'], 'Kalender / timeplan': ['school'], 'Home Assistant': ['energy', 'health'],
  Sonarr: ['upcoming', 'health'], Radarr: ['upcoming', 'health'], 'Trading 212': ['trading'] };

function srchPreview([k, name]) {
  const light = k === 'light' || k === 'wideLight', wide = k.startsWith('wide');
  const bar = light ? '#f5f7fa' : '#0a0c12', btn = light ? '#1a73e8' : '#a8d4fb';
  return `<button class="srch-opt" data-srch="${k}" aria-pressed="${store.me.searchStyle === k}">
    <div class="srch-prev" style="align-items:${wide ? 'stretch' : 'center'}">${wide ? '' : GWORD}
      <div class="bar2" style="width:${wide ? '100%' : '80%'};background:${bar}">${wide ? GWORD : ''}<em></em><s style="background:${btn}"></s></div></div>${name}</button>`;
}

const speedTxt = (v) => `${v} · ${Math.round(350 / v)} s/runde`;

function lookTab() {
  const s = store.me, c = s.bgCustom, kind = store.data.weather?.kind ?? 'sol';
  const kindName = { sol: 'sol', sky: 'skyet', regn: 'regn' }[kind];
  const opts = OPTIONS.map(([k, name, upl]) => {
    const img = srcFor(k);
    return `<div class="bg-opt"><button data-bg="${k}" aria-pressed="${s.bg === k}" style="${img ? `background-image:${esc(cssUrl(img))}` : ''}">${img || k === 'ingen' ? '' : 'last opp bilde'}</button>
      <div><span>${name}</span>${upl && k !== 'vaer' ? `<label class="upl">${k === 'oslo' ? 'Legg til' : 'Last opp'}<input type="file" accept="image/*" data-slot="${k}"></label>` : ''}</div></div>`;
  }).join('');
  const wslots = [['sol', 'Sol'], ['sky', 'Skyet'], ['regn', 'Regn']].map(([k, n]) =>
    `<label class="chip" style="cursor:pointer;color:${c['vaer_' + k] ? 'var(--green)' : 'var(--text)'}">${c['vaer_' + k] ? '✓' : '+'} ${n}<input type="file" accept="image/*" data-slot="vaer_${k}" hidden></label>`).join('');
  const cats = s.categories.map((cat, i) => `<div class="cat-edit"><input type="color" value="${cat.color}" data-ci="${i}" data-ck="color" aria-label="Farge"><input class="field" value="${esc(cat.name)}" data-ci="${i}" data-ck="name" aria-label="Navn" style="flex:1"><button class="x" data-cdel="${i}" aria-label="Slett kategori">×</button></div>`).join('');
  const ui = s.ui ?? {};
  const tog = (key, on, title, sub) => `<button class="toggle" data-toggle="${key}" role="switch" aria-checked="${on}"><i></i><span><b style="font-weight:600">${title}</b><br><span class="sub">${sub}</span></span></button>`;
  return `<div class="set-label">Bakgrunn</div><div class="bg-opts">${opts}</div>
    <div class="muted" style="font-size:13px">«Oslo» bytter mellom bilder av byen hvert 15. sekund${c.oslo?.length ? ` (${c.oslo.length} egne bilder, <button class="btn" data-clear="oslo" style="padding:2px 8px">fjern</button>)` : ''}. «Vær» viser et bilde som passer dagens vær (nå: ${kindName}). Du kan erstatte bildene med egne:</div>
    <div class="chips">${wslots}</div>
    <div class="set-label">Topplinje</div>${topSliders()}
    ${tog('ui:headLock', ui.headLock, 'Hold alle elementene på samme høyde', 'Logo, faner, vær og meny kan bare flyttes sideveis')}
    <div class="row-btns"><button class="btn btn-primary" data-hp-edit>✥ Flytt elementer i topplinjen</button><button class="btn" data-hp-reset2>Nullstill plassering</button></div>
    <div class="set-label">Søkebar</div><div class="srch-opts">${SEARCH_STYLES.map(srchPreview).join('')}</div>
    ${tog('search', !s.hideSearch, 'Vis søkebar', 'Kan dras mellom avgangene og klokka på dashboardet')}
    ${searchSettingsHtml(tog)}
    <div class="set-label">Nyhetslinje</div>
    ${tog('news', !s.hideNews, 'Vis siste nytt', 'NRK og VG rett under menyen, oppdateres hvert 5. minutt')}
    <label class="top-range">Hastighet<input type="range" min="1" max="10" step="1" value="${ui.newsSpeed}" data-news-speed><span class="mono" style="width:120px">${speedTxt(ui.newsSpeed)}</span></label>
    ${tog('ui:newsPause', ui.newsPause, 'Pause når musepekeren er over', 'Rullingen stopper alltid hvis systemet ber om redusert bevegelse')}
    <div class="set-label">Domener</div>
    ${tog('ui:domMap', ui.domMap, 'Vis verdenskart med besøk per land', 'Kartet på Domener-siden fargelegger land etter unike besøkende')}
    <div class="set-label">Kategorier</div>${cats}<button class="btn" data-cadd style="align-self:flex-start">+ Ny kategori</button>`;
}

function searchSettingsHtml(tog) {
  const st = searchState(), n = st.hist?.length ?? 0;
  return `${tog('sq:suggest', st.suggest, 'Vis forslag fra Google mens du skriver', 'Forslagene hentes via serveren og vises under søkefeltet')}
    ${tog('sq:save', st.save, 'Lagre søkehistorikk', `${n} søk lagret · vises når du klikker i søkefeltet, også i mobilappen`)}
    <div class="row-btns" style="align-items:center"><label class="btn" style="cursor:pointer">Importer Google-historikk (.json)<input type="file" accept=".json,application/json" data-sq-import hidden></label>
      <button class="btn" data-sq-clearall>Tøm søkehistorikk</button><span class="green" style="font-size:12.5px">${esc(sqMsg)}</span></div>
    <div class="muted" style="font-size:12px;line-height:1.5">Google lar ikke andre sider lese søkehistorikken din direkte. Eksporter den fra takeout.google.com (Mine aktiviteter → Søk, format JSON) og importer filen her, så kommer de gamle søkene med i forslagene.</div>`;
}

/* ---------- Forside og meny ---------- */

const sw = (on, attrs, label, disabled = false) => `<button class="sw" role="switch" aria-checked="${on}" aria-label="${esc(label)}" ${attrs}${disabled ? ' disabled' : ''}></button>`;
function layList(g, items, hidden, fixed = [], kind = 'w', skip = () => false) {
  const order = orderOf(g, items.length);
  return `<div class="lay-list">${order.map((idx, pos) => {
    const [id, name] = items[idx], off = hidden.has(id), lock = fixed.includes(id);
    if (skip(id)) return '';
    return `<div class="lay-row${off ? ' off' : ''}"><span class="lay-no">${pos + 1}</span><span class="lay-name">${esc(name)}</span>
      <button class="lay-btn" data-lay-move="${g}:${pos}:-1" aria-label="Flytt ${esc(name)} opp"${pos === 0 ? ' disabled' : ''}>▲</button>
      <button class="lay-btn" data-lay-move="${g}:${pos}:1" aria-label="Flytt ${esc(name)} ned"${pos === order.length - 1 ? ' disabled' : ''}>▼</button>
      ${lock ? '<span class="lay-always">Alltid</span>' : sw(!off, `data-lay-hide="${kind}:${id}"`, `Vis ${name}`)}</div>`;
  }).join('')}</div>`;
}

function layoutTab() {
  const hw = hiddenWidgets(), ht = hiddenTabs();
  const sc = store.me.shortcuts ?? [];
  return `<div class="set-label">Widgets på dashboardet</div>
    <div class="muted" style="font-size:13px">Skjul det du ikke bruker, for eksempel snarveier. Rekkefølgen kan også endres ved å dra kortene på forsiden.</div>
    ${layList('dash', DASH_WIDGETS, hw)}
    <div class="set-label">Widgets på mobil</div>${layList('m_home', MOBILE_WIDGETS, hw)}
    <div class="set-label">Faner i menyen</div>
    <div class="muted" style="font-size:13px">Skjulte faner forsvinner fra menyen, men sidene kan fortsatt åpnes med lenke.</div>
    ${layList('tabs', NAV_TABS, ht, FIXED_TABS, 't', (k) => !tabAllowed(k))}
    <div class="set-label">Snarveier</div>
    <form class="lay-list" data-sc-form>${sc.map((x, i) => `<div class="sc-row"><input class="field" name="n${i}" value="${esc(x.name)}" aria-label="Navn" maxlength="30" style="flex:0 1 160px"><input class="field" name="u${i}" value="${esc(x.url)}" aria-label="Adresse" spellcheck="false"><button type="button" class="x" data-sc-del="${i}" aria-label="Fjern ${esc(x.name)}">×</button></div>`).join('')}
      <div class="sc-row"><input class="field" name="nnew" placeholder="Navn" maxlength="30" style="flex:0 1 160px"><input class="field" name="unew" placeholder="https://…" spellcheck="false"><button class="btn" type="submit">Lagre</button></div>
      <div class="row-btns" style="align-items:center"><button type="button" class="btn" data-sc-reset>Tilbakestill snarveier</button><span class="muted" data-sc-msg style="font-size:12.5px"></span></div></form>`;
}

async function saveShortcuts(list) {
  const msg = modal().querySelector('[data-sc-msg]');
  try {
    store.me.shortcuts = await api('/me/shortcuts', { method: 'PUT', json: list });
    emit('route'); render();
    const m2 = modal().querySelector('[data-sc-msg]'); if (m2) { m2.textContent = 'Lagret ✓'; m2.className = 'green'; }
  } catch (e) { if (msg) { msg.textContent = e.message; msg.className = 'red'; } }
}

function intTab() {
  if (cfgErr) return `<div class="err">${esc(cfgErr)}</div>`;
  if (!cfg) return '<div class="skeleton" style="min-height:200px"></div>';
  return `<div class="cfg-grid">${cfg.map((g) => `<form class="cfg-card${g.fields.some((f) => f.type === 'textarea') ? ' wide' : ''}" data-group="${esc(g.name)}">
    <h3>${esc(g.name)}</h3>
    ${g.fields.map((f) => `<label>${esc(f.label)}${f.type === 'textarea'
      ? `<textarea name="${f.key}" rows="4">${esc(f.value)}</textarea>`
      : `<input name="${f.key}" type="${f.type}" value="${esc(f.value)}" placeholder="${f.secret ? (f.set ? '•••••••• lagret' : 'ikke satt') : ''}" autocomplete="off" spellcheck="false">`}
      ${f.secret && f.set ? `<button type="button" class="btn" data-clear-secret="${f.key}" style="align-self:flex-start;color:var(--red);padding:2px 8px">Fjern</button>` : ''}</label>`).join('')}
    <div class="cfg-actions"><span class="cfg-saved" data-status></span><button class="btn" type="submit">Lagre</button></div></form>`).join('')}</div>
    <div class="muted" style="font-size:12px">Tomme felt bruker verdien fra serverens miljøvariabler (.env).</div>`;
}

async function loadDevices() {
  await loadLogin(() => { if (!modal().hidden && tab === 'login') render(); });
}

function render() {
  const [, title, sub] = TABS.find(([k]) => k === tab);
  const scroll = modal().querySelector('.set-body')?.scrollTop ?? 0;
  modal().innerHTML = `<div class="set-box" role="dialog" aria-modal="true" aria-labelledby="set-title">
    <aside class="set-side" role="tablist"><h2>Innstillinger</h2>${TABS.map(([k, n]) => `<button class="set-tab" role="tab" data-tab="${k}" aria-selected="${k === tab}"><i></i>${n}</button>`).join('')}<div class="grow" style="flex:1"></div></aside>
    <div class="set-main"><div class="set-head"><div><div class="t" id="set-title">${title}</div><div class="s">${sub}</div></div><button class="set-close" data-close aria-label="Lukk">×</button></div>
    <div class="set-body">${tab === 'look' ? lookTab() : tab === 'layout' ? layoutTab() : tab === 'int' ? intTab() : loginTab()}</div></div></div>`;
  modal().querySelector('.set-body').scrollTop = scroll;
}

async function loadCfg() {
  try { cfg = await api('/config'); cfgErr = null; } catch (e) { cfgErr = e.message; }
  if (!modal().hidden && tab === 'int') render();
}

export function openSettings(which = 'look') {
  tab = which; render(); modal().hidden = false; modal().querySelector('[data-close]').focus(); loadCfg();
  if (tab === 'login') loadDevices();
  loadHistory(true).then(() => { if (!modal().hidden && tab === 'look') render(); });
}
export function closeSettings() { modal().hidden = true; }

async function saveCats() {
  await api('/settings/categories', { method: 'PUT', json: { value: store.me.categories } });
  emit('receipts');
}

async function saveGroup(form, changes) {
  const status = form.querySelector('[data-status]');
  status.style.color = ''; status.textContent = 'Lagrer…';
  try {
    cfg = await api('/config', { method: 'PUT', json: changes });
    // Oppdater verdier som også brukes i nettleseren.
    const st = await api('/state');
    Object.assign(store.me, { place: st.place, schoolUrl: st.schoolUrl, searchUrl: st.searchUrl });
    (RELOAD[form.dataset.group] ?? []).forEach((k) => load(k));
    render();
    const s2 = modal().querySelector(`[data-group="${CSS.escape(form.dataset.group)}"] [data-status]`);
    if (s2) s2.textContent = 'Lagret ✓';
  } catch (e) { status.style.color = 'var(--red)'; status.textContent = e.message; }
}

export function bindSettings() {
  const m = modal();
  m.addEventListener('submit', (e) => { if (tab === 'login') loginSubmit(e); });
  m.addEventListener('change', (e) => { if (tab === 'login') loginChange(e); });
  m.addEventListener('click', async (e) => {
    if (e.target === m || e.target.closest('[data-close]')) return closeSettings();
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(); if (tab === 'int' && !cfg) loadCfg(); if (tab === 'login') loadDevices(); return; }
    if (tab === 'login' && await loginClick(e)) return;
    const mv = e.target.closest('[data-lay-move]');
    if (mv) {
      const [g, pos, d] = mv.dataset.layMove.split(':'), n = { dash: DASH_WIDGETS, m_home: MOBILE_WIDGETS, tabs: NAV_TABS }[g].length;
      const order = orderOf(g, n), i = +pos, j = i + +d;
      if (j < 0 || j >= n) return;
      [order[i], order[j]] = [order[j], order[i]];
      await setOrder(g, order); render(); return;
    }
    const lh = e.target.closest('[data-lay-hide]');
    if (lh) {
      const [kind, id] = lh.dataset.layHide.split(':');
      if (kind === 'w') { const set = hiddenWidgets(); set.has(id) ? set.delete(id) : set.add(id); await saveLayout({ hiddenWidgets: [...set] }); emit('route'); }
      else { const set = new Set(store.me.layout?.hiddenTabs ?? []); set.has(id) ? set.delete(id) : set.add(id); await saveLayout({ hiddenTabs: [...set] }); applyNav(); }
      render(); return;
    }
    const scd = e.target.closest('[data-sc-del]');
    if (scd) { await saveShortcuts((store.me.shortcuts ?? []).filter((_, i) => i !== +scd.dataset.scDel).map(({ name, url }) => ({ name, url }))); return; }
    if (e.target.closest('[data-sc-reset]')) { if (confirm('Tilbakestille snarveiene til standardlisten?')) await saveShortcuts(null); return; }
    if (e.target.closest('[data-sq-clearall]')) {
      if (!confirm('Tømme hele søkehistorikken?')) return;
      await api('/search/history', { method: 'DELETE' }).catch(() => {}); setHistory([]); sqMsg = 'Historikken er tømt'; render(); return;
    }
    const bg = e.target.closest('[data-bg]');
    if (bg) {
      store.me.bg = bg.dataset.bg;
      api('/settings/bg', { method: 'PUT', json: { value: store.me.bg } });
      applyBackground(); render(); return;
    }
    const sr = e.target.closest('[data-srch]');
    if (sr) {
      store.me.searchStyle = sr.dataset.srch;
      api('/settings/search_style', { method: 'PUT', json: { value: store.me.searchStyle } });
      if (store.me.hideSearch) { store.me.hideSearch = false; api('/settings/hide_search', { method: 'PUT', json: { value: false } }); menuLabels(); }
      emit('route'); render(); return;
    }
    if (e.target.closest('[data-hp-edit]')) { closeSettings(); toggleHeadEdit(true); return; }
    if (e.target.closest('[data-hp-reset2]')) { resetHead(); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg?.dataset.toggle.startsWith('sq:')) {
      const k = tg.dataset.toggle.slice(3), st = searchState();
      Object.assign(st, await api('/search/settings', { method: 'PUT', json: { [k]: !st[k] } }).catch(() => ({})));
      render(); return;
    }
    if (tg?.dataset.toggle.startsWith('ui:')) {
      const k = tg.dataset.toggle.slice(3), v = !store.me.ui[k];
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
    const cs = e.target.closest('[data-clear-secret]');
    if (cs && confirm('Fjerne den lagrede hemmeligheten? Verdien fra .env brukes da, hvis den finnes.')) {
      return saveGroup(cs.closest('form'), { [cs.dataset.clearSecret]: null });
    }
    const clr = e.target.closest('[data-clear]');
    if (clr) { store.me.bgCustom = (await api(`/backgrounds/${clr.dataset.clear}`, { method: 'DELETE' })).bgCustom; applyBackground(); render(); return; }
    if (e.target.closest('[data-cadd]')) { store.me.categories.push({ name: 'Ny', color: '#a8d4fb' }); await saveCats(); render(); return; }
    const del = e.target.closest('[data-cdel]');
    if (del && store.me.categories.length > 1) { store.me.categories.splice(+del.dataset.cdel, 1); await saveCats(); render(); }
  });
  m.addEventListener('submit', (e) => {
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
    const form = e.target.closest('[data-group]');
    if (!form) return;
    e.preventDefault();
    const g = cfg.find((x) => x.name === form.dataset.group);
    const changes = {};
    for (const f of g.fields) {
      const v = form.elements[f.key].value;
      if (f.secret) { if (v) changes[f.key] = v; } else if (v !== f.value) changes[f.key] = v;
    }
    if (Object.keys(changes).length) saveGroup(form, changes);
    else form.querySelector('[data-status]').textContent = 'Ingen endringer';
  });
  m.addEventListener('input', (e) => {
    if (e.target.matches('[data-news-speed]')) {
      store.me.ui.newsSpeed = +e.target.value;
      e.target.nextElementSibling.textContent = speedTxt(+e.target.value);
      applyTicker(); return;
    }
    const k = e.target.dataset?.top;
    if (!k) return;
    store.me.top = { ...store.me.top, [k]: +e.target.value };
    e.target.nextElementSibling.textContent = e.target.value + ' px';
    applyTop();
  });
  m.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-news-speed]')) { saveUi({ newsSpeed: +t.value }); return; }
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) closeSettings(); });
}

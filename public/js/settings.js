import { esc, api, cssUrl } from './util.js';
import { store, emit, load } from './store.js';
import { OPTIONS, srcFor, applyBackground, preloadAll } from './background.js';
import { SEARCH_STYLES, GWORD, renderTicker, menuLabels } from './extras.js';

const modal = () => document.getElementById('settings');
const TABS = [['look', 'Utseende', 'Bakgrunn, søkebar, nyhetslinje og kategorier'], ['int', 'Integrasjoner', 'Lagres på serveren. Hemmeligheter vises aldri igjen etter lagring.']];
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
  const tog = (key, on, title, sub) => `<button class="toggle" data-toggle="${key}" role="switch" aria-checked="${on}"><i></i><span><b style="font-weight:600">${title}</b><br><span class="sub">${sub}</span></span></button>`;
  return `<div class="set-label">Bakgrunn</div><div class="bg-opts">${opts}</div>
    <div class="muted" style="font-size:13px">«Oslo» bytter mellom bilder av byen hvert 15. sekund${c.oslo?.length ? ` (${c.oslo.length} egne bilder, <button class="btn" data-clear="oslo" style="padding:2px 8px">fjern</button>)` : ''}. «Vær» viser et bilde som passer dagens vær (nå: ${kindName}). Du kan erstatte bildene med egne:</div>
    <div class="chips">${wslots}</div>
    <div class="set-label">Søkebar</div><div class="srch-opts">${SEARCH_STYLES.map(srchPreview).join('')}</div>
    ${tog('search', !s.hideSearch, 'Vis søkebar', 'Kan dras mellom avgangene og klokka på dashboardet')}
    <div class="set-label">Nyhetslinje</div>
    ${tog('news', !s.hideNews, 'Vis siste nytt', 'NRK og VG rett under menyen, oppdateres hvert 5. minutt')}
    <div class="set-label">Kategorier</div>${cats}<button class="btn" data-cadd style="align-self:flex-start">+ Ny kategori</button>`;
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

function render() {
  const [, title, sub] = TABS.find(([k]) => k === tab);
  const scroll = modal().querySelector('.set-body')?.scrollTop ?? 0;
  modal().innerHTML = `<div class="set-box" role="dialog" aria-modal="true" aria-labelledby="set-title">
    <aside class="set-side" role="tablist"><h2>Innstillinger</h2>${TABS.map(([k, n]) => `<button class="set-tab" role="tab" data-tab="${k}" aria-selected="${k === tab}"><i></i>${n}</button>`).join('')}<div class="grow" style="flex:1"></div></aside>
    <div class="set-main"><div class="set-head"><div><div class="t" id="set-title">${title}</div><div class="s">${sub}</div></div><button class="set-close" data-close aria-label="Lukk">×</button></div>
    <div class="set-body">${tab === 'look' ? lookTab() : intTab()}</div></div></div>`;
  modal().querySelector('.set-body').scrollTop = scroll;
}

async function loadCfg() {
  try { cfg = await api('/config'); cfgErr = null; } catch (e) { cfgErr = e.message; }
  if (!modal().hidden && tab === 'int') render();
}

export function openSettings(which = 'look') { tab = which; render(); modal().hidden = false; modal().querySelector('[data-close]').focus(); loadCfg(); }
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
  m.addEventListener('click', async (e) => {
    if (e.target === m || e.target.closest('[data-close]')) return closeSettings();
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(); if (tab === 'int' && !cfg) loadCfg(); return; }
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
    const tg = e.target.closest('[data-toggle]');
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
  m.addEventListener('change', async (e) => {
    const t = e.target;
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

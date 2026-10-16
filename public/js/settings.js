import { esc, api, cssUrl } from './util.js';
import { store, emit } from './store.js';
import { OPTIONS, srcFor, applyBackground, preloadAll } from './background.js';

const modal = () => document.getElementById('settings');

function render() {
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
  modal().innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="set-title">
    <div class="card-head"><div id="set-title" style="font-size:22px;font-weight:600">Bakgrunn</div><button class="x" data-close style="font-size:22px;color:var(--text-2)" aria-label="Lukk">×</button></div>
    <div class="bg-opts">${opts}</div>
    <div class="muted" style="font-size:13px">«Oslo» bytter mellom bilder av byen hvert 15. sekund${c.oslo?.length ? ` (${c.oslo.length} egne bilder, <button class="btn" data-clear="oslo" style="padding:2px 8px">fjern</button>)` : ''}. «Vær» viser et bilde som passer dagens vær (nå: ${kindName}). Du kan erstatte bildene med egne:</div>
    <div class="chips">${wslots}</div>
    <div class="settings-section"><h3>Kategorier</h3>${cats}<button class="btn" data-cadd style="align-self:flex-start">+ Ny kategori</button></div>
  </div>`;
}

export function openSettings() { render(); modal().hidden = false; modal().querySelector('[data-close]').focus(); }
export function closeSettings() { modal().hidden = true; }

async function saveCats() {
  await api('/settings/categories', { method: 'PUT', json: { value: store.me.categories } });
  emit('receipts');
}

export function bindSettings() {
  const m = modal();
  m.addEventListener('click', async (e) => {
    if (e.target === m || e.target.closest('[data-close]')) return closeSettings();
    const bg = e.target.closest('[data-bg]');
    if (bg) {
      store.me.bg = bg.dataset.bg;
      api('/settings/bg', { method: 'PUT', json: { value: store.me.bg } });
      applyBackground(); render(); return;
    }
    const clr = e.target.closest('[data-clear]');
    if (clr) { store.me.bgCustom = (await api(`/backgrounds/${clr.dataset.clear}`, { method: 'DELETE' })).bgCustom; applyBackground(); render(); return; }
    if (e.target.closest('[data-cadd]')) { store.me.categories.push({ name: 'Ny', color: '#a8d4fb' }); await saveCats(); render(); return; }
    const del = e.target.closest('[data-cdel]');
    if (del && store.me.categories.length > 1) { store.me.categories.splice(+del.dataset.cdel, 1); await saveCats(); render(); }
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

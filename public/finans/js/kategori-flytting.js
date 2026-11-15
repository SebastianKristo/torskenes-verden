// Økonomi → Innstillinger → Kategorier: flytt gamle kategoridata til de nye standardkategoriene (Fase 6, Q11). Bare admin.
// Viser først forhåndsvisningen fra serveren (antall rader per tabell), og flytter bare når admin bekrefter. Siste flytting kan angres.
// Serveren gjør alt (server/finans/category-migration.js); denne fila viser bare det serveren sender. Ingen data endres uten et trykk.
import { api, esc, render, toast, loadBoot } from './core.js';

const CM = { d: null, busy: false, err: '', target: null, confirm: false };

export async function loadCatMigration() {
  try { CM.d = await api(`/categories/migration${CM.target ? `?abonnementer=${encodeURIComponent(CM.target)}` : ''}`); CM.err = ''; }
  catch (e) { CM.d = null; CM.err = e.message; }
}

const when = (ms) => new Date(ms).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Boksen under kategorilista. admin = S.boot.canEditServer (vanlige brukere ser den ikke). */
export function catMigrationBox(admin) {
  if (!admin) return '';
  const d = CM.d;
  if (!d) return `<section class="card cm-box"><b>Flytt til nye kategorier</b><div class="note">${CM.err ? esc(CM.err) : 'Henter forhåndsvisning …'}</div></section>`;
  const maps = d.mappings.filter((m) => m.users > 0);
  const last = (d.history ?? []).find((h) => h.undoable);
  const abo = d.mappings.find((m) => m.id === 'abonnementer');
  const pick = abo?.users ? `<label class="f">«Abonnementer» flyttes til<select class="inp" data-cm="target">${(d.targetOptions ?? []).map((t) => `<option value="${esc(t)}"${t === d.targets?.abonnementer ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : '';
  const list = maps.map((m) => `<div class="cm-map"><b>${esc(m.from)} → ${esc(m.to)}</b><div class="note">${esc(m.text)}</div><ul>${m.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('');
  return `<section class="card cm-box" aria-labelledby="cm-h"><div class="card-h"><b id="cm-h">Flytt til nye kategorier</b><span class="note">Bare admin · gjelder alle regnskapene</span></div>
    <div class="note">Nye brukere får «Bolig» (faste boutgifter) og «Hjem og interiør» (innkjøp), og abonnementer ligger i Faste betalinger. Eksisterende data flyttes bare når du bekrefter her. Endringen logges og kan angres.</div>
    ${d.nothing ? '<div class="ok-msg">Ingenting å flytte. Kategoriene følger de nye standardnavnene.</div>' : `${pick}${list}
    ${CM.confirm ? `<div class="cm-confirm" role="alert"><b>Er du sikker?</b> ${esc(maps.flatMap((m) => m.lines.slice(0, 1)).join(' og '))}. <div style="display:flex;gap:8px;margin-top:8px"><button class="btn pri" data-cm="apply"${CM.busy ? ' disabled' : ''}>Ja, flytt nå</button><button class="btn ghost" data-cm="cancel">Avbryt</button></div></div>`
      : '<div><button class="btn" data-cm="ask">Flytt …</button></div>'}`}
    ${last ? `<div class="cm-last"><span class="note">Siste flytting ${esc(when(last.created))}</span><button class="btn sm ghost" data-cm="undo" data-id="${last.id}"${CM.busy ? ' disabled' : ''}>Angre</button></div>` : ''}
  </section>`;
}

if (!document.getElementById('cm-css')) {
  const st = document.createElement('style'); st.id = 'cm-css';
  st.textContent = '.cm-box{gap:12px;margin-top:16px}.cm-map ul{margin:6px 0 0;padding-left:18px}.cm-map li{font-size:13.5px}.cm-confirm{padding:12px 14px;border-radius:14px;border:1px solid var(--warm-line,var(--sep));background:var(--inner)}.cm-last{display:flex;align-items:center;justify-content:space-between;gap:10px}';
  document.head.appendChild(st);
}

async function act(e) {
  const b = e.target.closest('[data-cm]');
  if (!b || CM.busy) return;
  const a = b.dataset.cm;
  if (e.type === 'change' && a === 'target') { CM.target = b.value; CM.confirm = false; await loadCatMigration(); return render(); }
  if (e.type !== 'click') return;
  if (a === 'ask') { CM.confirm = true; return render(); }
  if (a === 'cancel') { CM.confirm = false; return render(); }
  CM.busy = true; render();
  try {
    if (a === 'apply') {
      const r = await api('/categories/migration', { method: 'POST', json: { confirm: true, previewId: CM.d.previewId, targets: CM.d.targets } });
      toast(`Flyttet ✓ ${r.mappings.flatMap((m) => m.lines.slice(0, 1)).join(' · ')}`);
    } else if (a === 'undo') {
      const r = await api(`/categories/migration/${+b.dataset.id}/undo`, { method: 'POST', json: {} });
      toast(r.counts.skipped ? `Angret. ${r.counts.skipped} rader var endret siden og står som de er.` : 'Angret ✓ Kategoriene er som før.');
    }
  } catch (err) { toast(err.message); }
  CM.busy = false; CM.confirm = false;
  await Promise.all([loadCatMigration(), loadBoot().catch(() => {})]);
  render();
}
document.addEventListener('click', act);
document.addEventListener('change', act);

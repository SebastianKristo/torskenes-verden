// Økonomi → Innstillinger → Backup og data: flytt den gamle kvitteringslista til Økonomi-kvitteringer (Q30). Bare admin.
// Viser først forhåndsvisningen fra serveren (antall per bruker og bildefiler, aldri innholdet), og flytter bare når admin bekrefter.
// Serveren tar en kopi av databasen før endringen, og siste flytting kan angres. Serveren gjør alt
// (server/finans/receipt-migration.js); denne fila viser bare det serveren sender. Ingen data endres uten et trykk.
import { api, esc, render, toast } from './core.js';

const RM = { d: null, busy: false, err: '', confirm: false };

export async function loadReceiptMigration() {
  try { RM.d = await api('/legacy-receipts/migration'); RM.err = ''; }
  catch (e) { RM.d = null; RM.err = e.message; }
}

const when = (ms) => new Date(ms).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Boksen i Backup og data. Vises bare for admin, og bare når det finnes gamle kvitteringer eller en flytting som kan angres. */
export function receiptMigrationBox(admin) {
  if (!admin) return '';
  const d = RM.d;
  if (!d) return RM.err ? `<div class="mod-box"><div class="set-label">Gamle kvitteringer</div><div class="note">${esc(RM.err)}</div></div>` : '';
  const last = (d.history ?? []).find((h) => h.undoable);
  if (d.nothing && !last) return '';
  const list = d.lines.length ? `<ul class="rm-list">${d.lines.slice(1).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
  const files = d.files.missing ? `${d.files.present} bildefiler (${d.files.missing} mangler på disken)` : `${d.files.present} bildefiler`;
  return `<div class="mod-box" aria-labelledby="rm-h"><div class="card-h"><div class="set-label" id="rm-h">Flytt gamle kvitteringer</div><span class="note">Bare admin</span></div>
    <div class="note" style="font-size:12.5px;line-height:1.5">Kvitteringene fra den gamle kvitteringslista kopieres til Økonomi som arkiverte kvitteringer, med bilde, beløp og kategori når den finnes. Den gamle lista beholdes. Serveren tar en kopi av databasen først, og flyttingen kan angres.</div>
    ${d.nothing ? '<div class="ok-msg">Ingen gamle kvitteringer igjen å flytte.</div>' : `<div><b>${esc(d.lines[0])}</b> · ${esc(files)}</div>${list}
    ${RM.confirm ? `<div class="rm-confirm" role="alert"><b>Er du sikker?</b> ${esc(d.lines[0])} kopieres til Økonomi. <div style="display:flex;gap:8px;margin-top:8px"><button class="btn pri" data-rm="apply"${RM.busy ? ' disabled' : ''}>Ja, flytt nå</button><button class="btn ghost" data-rm="cancel">Avbryt</button></div></div>`
      : '<div><button class="btn" data-rm="ask">Flytt …</button></div>'}`}
    ${last ? `<div class="rm-last"><span class="note">Siste flytting ${esc(when(last.created))} · ${last.counts?.receipts ?? 0} kvitteringer${last.backup ? ` · kopi: ${esc(last.backup)}` : ''}</span><button class="btn sm ghost" data-rm="undo" data-id="${last.id}"${RM.busy ? ' disabled' : ''}>Angre</button></div>` : ''}
  </div>`;
}

if (!document.getElementById('rm-css')) {
  const st = document.createElement('style'); st.id = 'rm-css';
  st.textContent = '.rm-list{margin:6px 0 0;padding-left:18px}.rm-list li{font-size:13.5px}.rm-confirm{padding:12px 14px;border-radius:14px;border:1px solid var(--warm-line,var(--sep));background:var(--inner)}.rm-last{display:flex;align-items:center;justify-content:space-between;gap:10px}';
  document.head.appendChild(st);
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b || RM.busy) return;
  const a = b.dataset.rm;
  if (a === 'ask') { RM.confirm = true; return render(); }
  if (a === 'cancel') { RM.confirm = false; return render(); }
  RM.busy = true; render();
  try {
    if (a === 'apply') {
      const r = await api('/legacy-receipts/migration', { method: 'POST', json: { confirm: true, previewId: RM.d.previewId } });
      toast(`Flyttet ✓ ${r.counts.receipts} kvitteringer. Kopi av databasen: ${r.backup}`);
    } else if (a === 'undo') {
      const r = await api(`/legacy-receipts/migration/${+b.dataset.id}/undo`, { method: 'POST', json: {} });
      toast(r.counts.skipped ? `Angret. ${r.counts.skipped} kvitteringer er koblet til en transaksjon og står som de er.` : 'Angret ✓ Kopiene er fjernet.');
    }
  } catch (err) { toast(err.message); }
  RM.busy = false; RM.confirm = false;
  await loadReceiptMigration();
  render();
});

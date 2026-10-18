// Transaksjoner på mobil: detalj (AI-beskrivelse, varelinjer, originaler, info), redigering/ny/slett,
// og fullskjermvisning av original kvittering og original banktransaksjon (som den kom fra banken, før navnevasking).
import { S, api, esc, n2, sgn, dd, dWeek, today, cap, cats, accs, icon, parseAmount, loadTx, loadSummary } from './core.js';
import { logo } from './mobile-p20.js'; // logoregisteret (prompt 20), ellers core.logo
import { m, draw, flash, two, amtC, backBtn, openSheet } from './mobile.js';
import { c3 } from './mobile-theme.js';

const isI = (th) => th === 'ios';
const dLong = (d) => (!d ? '–' : /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : String(d));
let folders = null;
async function loadFolders() { if (folders) return folders; try { folders = await api('/folders'); } catch { folders = []; } return folders; }
const folderName = (t) => t.folder ?? (folders ?? []).find((f) => f.id === t.folderId)?.name ?? null;

/* ---------- Detalj ---------- */

export function txDetail(th, t) {
  if (!t) return two() ? '<div class="m-empty">Velg en transaksjon i listen.</div>' : '<div class="m-empty">Ingen transaksjon valgt.</div>';
  if (t.folderId && !folders) loadFolders().then(draw);
  const row = (k, v, attrs = '', chev = false) => `<${attrs ? 'button' : 'div'} class="${isI(th) ? 'field' : 'opt-row frow'}" ${attrs}><span style="opacity:.7">${k}</span><b style="font-weight:500">${v}</b>${chev ? '<span style="opacity:.5">›</span>' : ''}</${attrs ? 'button' : 'div'}>`;
  const lines = t.lines ?? [];
  const rcTxt = t.receipt === 'booked' ? 'Vedlagt' : t.receipt ? 'Til gjennomgang' : '–';
  return `${two() ? '' : `<div class="m-row">${backBtn(th, '#', 'Tilbake', 'txback')}${isI(th) ? '' : `<b class="ptitle">${t.amount > 0 ? 'Inntekt' : 'Utgift'}</b>`}</div>`}
    <div class="m-row" style="gap:14px">${logo(t, 60, isI(th) ? 30 : 18)}<div class="m-grow"><b style="font-size:20px;font-weight:700">${esc(t.description)}</b><div style="opacity:.7;font-size:14px">${cap(dWeek(t.date))}</div></div></div>
    <div class="m-mono" style="font-size:40px;font-weight:600;letter-spacing:-.03em;color:${amtC(t.amount, th)}">${sgn(t.amount)} <span style="font-size:18px;opacity:.6">kr</span></div>
    ${t.aiLong || t.aiShort ? `<div class="aicard ${isI(th) ? 'glass2' : ''}"><b>✦ AI-beskrivelse</b><p>${esc(t.aiLong || t.aiShort)}</p></div>` : ''}
    ${lines.length ? `<div class="sec">Varelinjer</div><div class="list ${isI(th) ? 'glass2' : ''}">${lines.map((l) => `<div class="opt-row" style="justify-content:space-between"><span class="m-ell">${esc(l.description ?? '–')}</span><span class="m-mono">${n2(l.amount)}</span></div>`).join('')}</div>` : ''}
    <div class="sec">Originaler</div>
    <div class="${isI(th) ? 'list glass2' : 'fields'}">${row('Original kvittering', t.receiptId ? 'Vis bilde' : 'Mangler', `data-orig="rc" data-id="${t.id}"`, true)}${row('Original banktransaksjon', t.source === 'manual' || t.source === 'receipt' ? 'Ikke fra bank' : 'Vis', `data-orig="bank" data-id="${t.id}"`, true)}</div>
    <div class="${isI(th) ? 'list glass2' : 'fields'}">${row('Kategori', esc(t.category))}${row('Konto', esc(t.account))}${row('Dato', dLong(t.date))}${row('Kvittering', rcTxt)}${row('Bolig', folderName(t) ? esc(folderName(t)) : '–')}${t.note ? row('Notat', esc(t.note)) : ''}</div>
    <div class="btn2"><button class="sec-b danger" data-txact="del" data-id="${t.id}">${icon('trash', 18)} Slett</button><button class="pri-b" data-txact="edit" data-id="${t.id}">${icon('edit', 18)} Rediger</button></div>`;
}

/* ---------- Ny / rediger ---------- */

export function openEdit(t) {
  m.edit = t
    ? { id: t.id, type: t.amount > 0 ? 'income' : 'expense', description: t.description, amount: n2(Math.abs(t.amount)).replace(/\s/g, ''), date: t.date, categoryId: t.categoryId, accountId: t.accountId, folderId: t.folderId ?? null, note: t.note ?? '', receipt: t.receipt, receiptId: t.receiptId }
    : { id: null, type: 'expense', description: '', amount: '', date: today(), categoryId: cats('expense')[0]?.id ?? null, accountId: accs()[0]?.id ?? null, folderId: null, note: '' };
  m.detail = false;
  loadFolders().then(draw);
  window.scrollTo(0, 0);
  draw();
}

export function editForm(th) {
  const E = m.edit;
  if (!E) return '';
  const chip = (k, v, n, on) => `<button class="chip" data-ef="${k}" data-v="${esc(String(v ?? ''))}" aria-pressed="${on}">${on && !isI(th) ? '✓ ' : ''}${esc(n)}</button>`;
  const grp = (title, inner, note = '') => `${title ? `<div class="sec">${title}</div>` : ''}<div class="${isI(th) ? 'list glass2' : 'fields'}">${inner}</div>${note ? `<div class="snote">${note}</div>` : ''}`;
  const inp = (k, label, val, attrs = '') => isI(th)
    ? `<label class="field"><span>${label}</span><input id="m-ef-${k}" data-efi="${k}" value="${esc(val ?? '')}" ${attrs}></label>`
    : `<label class="field">${label}<input id="m-ef-${k}" data-efi="${k}" value="${esc(val ?? '')}" ${attrs}></label>`;
  const kinds = E.type === 'income' ? ['income', 'transfer'] : ['expense', 'transfer'];
  const catList = (S.boot?.categories ?? []).filter((c) => kinds.includes(c.kind));
  const rcTxt = E.receipt === 'booked' ? 'Vedlagt' : E.receipt ? 'Til gjennomgang' : 'Ingen';
  return `<div class="m-row" style="justify-content:space-between">${two() ? '' : backBtn(th, '#', 'Avbryt', 'efcancel')}<b class="ptitle" style="${two() ? '' : 'text-align:center'}">${E.id ? 'Rediger transaksjon' : 'Ny transaksjon'}</b>${two() ? `<button class="mini" data-mact="efcancel" aria-label="Avbryt">${icon('close', 18)}</button>` : '<span style="width:44px"></span>'}</div>
    <form data-eform class="eform" novalidate>
    <div class="schips seg2">${chip('type', 'expense', 'Utgift', E.type === 'expense')}${chip('type', 'income', 'Inntekt', E.type === 'income')}</div>
    ${grp('', `${inp('description', 'Beskrivelse', E.description, 'placeholder="f.eks. REMA 1000" required autocomplete="off"')}${inp('amount', 'Beløp (kr)', E.amount, 'inputmode="decimal" placeholder="0,00" class="m-mono" required')}${inp('date', 'Dato', E.date, 'type="date"')}`)}
    ${grp('Kategori', `<div class="opt-row col"><div class="schips">${catList.map((c) => chip('categoryId', c.id, c.name, E.categoryId === c.id)).join('')}</div></div>`)}
    ${grp('Konto', `<div class="opt-row col"><div class="schips">${accs().map((a) => chip('accountId', a.id, a.name, E.accountId === a.id)).join('')}</div></div>`)}
    ${grp('Kvittering', `<div class="opt-row"><span class="m-grow">${rcTxt}</span></div><button type="button" class="opt-row" data-mact="efattach"><span class="m-grow" style="color:var(--m-acc);font-weight:500">Legg ved kvittering</span></button>`)}
    ${grp('Bolig', `<div class="opt-row col"><div class="schips">${chip('folderId', '', 'Ingen', !E.folderId)}${(folders ?? []).map((f) => chip('folderId', f.id, f.name, E.folderId === f.id)).join('')}</div></div>`, 'Utgiften vises også i boligen og fordeles på medlemmene.')}
    ${grp('Notat', isI(th) ? `<label class="field"><input id="m-ef-note" data-efi="note" value="${esc(E.note ?? '')}" placeholder="Valgfritt" style="text-align:left;width:100%"></label>` : `<label class="field">Notat<input id="m-ef-note" data-efi="note" value="${esc(E.note ?? '')}" placeholder="Valgfritt"></label>`)}
    <div class="btn2"><button type="submit" class="pri-b">${E.id ? 'Lagre endringer' : 'Legg til'}</button></div>
    ${E.id ? `<button type="button" class="sec-b danger wide" data-txact="del" data-id="${E.id}">Slett transaksjon</button>` : ''}
    </form>`;
}

async function saveEdit() {
  const E = m.edit;
  const amount = parseAmount(E.amount);
  if (!E.description?.trim() || !amount) { flash('Skriv beskrivelse og beløp'); return; }
  const body = { type: E.type, description: E.description.trim(), amount: Math.abs(amount), date: E.date || today(), categoryId: E.categoryId ?? null, accountId: E.accountId ?? null, folderId: E.folderId || null, note: E.note ?? '' };
  const r = E.id ? await api(`/transactions/${E.id}`, { method: 'PATCH', json: body }) : await api('/transactions', { method: 'POST', json: body });
  const id = r?.id ?? E.id;
  await Promise.all([loadTx(), loadSummary()]);
  if (r?.id) m.txCache[r.id] = r;
  m.edit = null; m.sel = id; m.detail = true;
  flash(E.id ? 'Endringer lagret' : 'Transaksjon lagt til');
}

async function delTx(id) {
  const t = [...(S.tx?.items ?? []), ...(S.summary?.recent ?? []), ...Object.values(m.txCache)].find((x) => x.id === id);
  if (!confirm(`Slette ${t?.description ?? 'transaksjonen'}? Den fjernes fra rapporter, budsjett og AI-søk.`)) return;
  await api(`/transactions/${id}`, { method: 'DELETE' });
  delete m.txCache[id];
  m.edit = null; m.detail = false; m.sel = null;
  await Promise.all([loadTx(), loadSummary()]);
  flash(`${t?.description ?? 'Transaksjonen'} er slettet`);
}

/* ---------- Originaler ---------- */

async function openOrig(id, mode) {
  m.orig = { id, mode, data: null, zoom: false };
  draw();
  const t = [...(S.tx?.items ?? []), ...(S.summary?.recent ?? []), ...Object.values(m.txCache)].find((x) => x.id === id);
  let d = null;
  try { d = await api(`/transactions/${id}/original`); } catch { d = null; }
  // Eldre server: kvitteringen finnes likevel via receiptId.
  if (!d) d = { receipt: t?.receiptId ? { id: t.receiptId, fileUrl: `/finans/api/receipts/${t.receiptId}/file`, mime: null } : null, bankRow: null, old: true };
  if (m.orig?.id === id) { m.orig.data = d; m.orig.tx = t; draw(); }
}

export function origOverlay(th) {
  const O = m.orig;
  if (!O) return '';
  const d = O.data, t = O.tx, rc = d?.receipt, bank = d?.bankRow;
  const seg = (k, n) => `<button data-origm="${k}" aria-pressed="${O.mode === k}">${n}</button>`;
  let body;
  if (!d) body = '<div class="m-spin" style="margin:80px auto"></div>';
  else if (O.mode === 'rc') {
    const url = rc?.fileUrl ?? (rc?.id ? `/finans/api/receipts/${rc.id}/file` : null);
    const pdf = rc && (/pdf/.test(rc.mime ?? '') || /\.pdf$/i.test(url ?? ''));
    body = !url ? `<div class="orig-empty">${icon('kv2', 40)}<b>Ingen kvittering vedlagt</b><span>Legg ved et bilde eller en PDF, så kobles den til transaksjonen.</span><button class="pri-b" data-mact="efattach">Legg ved kvittering</button></div>`
      : pdf ? `<iframe class="orig-pdf" src="${esc(url)}" title="Kvittering (PDF)"></iframe>`
      : `<div class="orig-img${O.zoom ? ' zoom' : ''}" data-origzoom><img src="${esc(url)}" alt="Original kvittering"></div><div class="snote" style="text-align:center">Trykk på bildet for å zoome</div>`;
  } else {
    const rows = bank ? [['Dato', dLong(bank.bookingDate)], ['Rentedato', dLong(bank.valueDate)], ['Forklaring', bank.description, true], [Number(bank.amount?.value ?? bank.amount) < 0 ? 'Ut fra konto' : 'Inn på konto', `${n2(Math.abs(Number(bank.amount?.value ?? bank.amount) || 0))} kr`],
      ['Konto', bank.account, true], ['Bank', bank.source], ['Arkivref.', bank.archiveReference, true], ['Importert', bank.importedAt ? new Date(bank.importedAt).toLocaleString('nb-NO') : '']].filter((r) => r[1]) : [];
    body = !bank ? `<div class="orig-empty">${icon('bank', 40)}<b>Ingen bankrad lagret</b><span>${t?.source === 'manual' || t?.source === 'receipt' ? 'Transaksjonen er lagt inn manuelt eller fra en kvittering, ikke importert fra banken.' : 'Banktransaksjoner importert før denne versjonen har ikke den opprinnelige raden. Nye importer lagres uendret.'}</span></div>`
      : `<div class="list ${isI(th) ? 'glass2' : ''}">${rows.map(([k, v, mono]) => `<div class="opt-row frow"><span style="opacity:.7">${k}</span><b class="${mono ? 'm-mono' : ''}" style="font-weight:500;text-align:right">${esc(v)}</b></div>`).join('')}</div>
        <div class="sec">Rådata</div><pre class="rawjson">${esc(JSON.stringify(bank.raw ?? bank, null, 2))}</pre>`;
  }
  const canDl = d && ((O.mode === 'rc' && (rc?.fileUrl || rc?.id)) || (O.mode === 'bank' && bank));
  return `<div class="orig ${th}${m.light ? ' light' : ''}" role="dialog" aria-label="${O.mode === 'rc' ? 'Original kvittering' : 'Original banktransaksjon'}">
    <div class="orig-top"><button class="${isI(th) ? 'gback' : 'back'}" data-mact="origclose" aria-label="Lukk">${isI(th) ? icon('close', 18, 'currentColor', 2.4) : '×'}</button>
      <div class="m-grow" style="text-align:center"><b>${O.mode === 'rc' ? 'Original kvittering' : 'Original banktransaksjon'}</b><div style="font-size:12.5px;opacity:.65">${esc(t?.description ?? '')}${t?.date ? ` · ${dLong(t.date)}` : ''}</div></div><span style="width:44px"></span></div>
    <div class="seg3">${seg('rc', 'Kvittering')}${seg('bank', 'Banktransaksjon')}</div>
    <div class="orig-body">${body}</div>
    ${canDl ? `<div class="btn2 orig-act"><button class="sec-b" data-mact="origshare">${icon('share', 18)} Del</button><button class="pri-b" data-mact="origdl">${icon('down', 18)} Last ned</button></div>` : ''}</div>`;
}

async function origFile() {
  const O = m.orig, rc = O.data?.receipt;
  if (O.mode === 'rc') {
    const url = rc.fileUrl ?? `/finans/api/receipts/${rc.id}/file`;
    const b = await (await fetch(url)).blob();
    const ext = b.type.includes('pdf') ? 'pdf' : b.type.includes('png') ? 'png' : 'jpg';
    return new File([b], `kvittering-${O.id}.${ext}`, { type: b.type });
  }
  return new File([JSON.stringify(O.data.bankRow, null, 2)], `banktransaksjon-${O.id}.json`, { type: 'application/json' });
}

/* ---------- Hendelser ---------- */

export async function txBind(e, t) {
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'input') {
    if ((x = d('[data-efi]')) && m.edit) { m.edit[x.dataset.efi] = x.value; return true; }
    return false;
  }
  if (e.type === 'change') { if ((x = d('[data-efi]')) && m.edit) { m.edit[x.dataset.efi] = x.value; return true; } return false; }
  if (e.type === 'submit' && d('[data-eform]')) { e.preventDefault(); await saveEdit(); return true; }
  if (e.type !== 'click') return false;
  if ((x = d('[data-ef]')) && m.edit) {
    e.preventDefault();
    const k = x.dataset.ef, v = x.dataset.v;
    m.edit[k] = k === 'type' ? v : v === '' ? null : +v;
    if (k === 'type') { const kinds = v === 'income' ? ['income', 'transfer'] : ['expense', 'transfer']; if (!kinds.includes(S.boot?.categories?.find((c) => c.id === m.edit.categoryId)?.kind)) m.edit.categoryId = (S.boot?.categories ?? []).find((c) => c.kind === kinds[0])?.id ?? null; }
    draw(); return true;
  }
  if ((x = d('[data-txact]'))) {
    e.preventDefault();
    const id = +x.dataset.id, tx = [...(S.tx?.items ?? []), ...(S.summary?.recent ?? []), ...Object.values(m.txCache)].find((y) => y.id === id);
    if (x.dataset.txact === 'edit') { openEdit(tx); return true; }
    if (x.dataset.txact === 'del') { await delTx(id); return true; }
  }
  if ((x = d('[data-orig]'))) { e.preventDefault(); await openOrig(+x.dataset.id, x.dataset.orig); return true; }
  if ((x = d('[data-origm]'))) { m.orig.mode = x.dataset.origm; m.orig.zoom = false; draw(); return true; }
  if (d('[data-origzoom]')) { m.orig.zoom = !m.orig.zoom; draw(); return true; }
  const act = d('[data-mact]')?.dataset.mact;
  if (act === 'newtx') { openEdit(null); return true; }
  if (act === 'efcancel') { e.preventDefault(); const id = m.edit?.id; m.edit = null; if (id) { m.sel = id; m.detail = true; } draw(); return true; }
  if (act === 'efattach') { e.preventDefault(); m.orig = null; openSheet(); return true; }
  if (act === 'origclose') { m.orig = null; draw(); return true; }
  if (act === 'origdl') {
    const f = await origFile();
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    flash(m.orig.mode === 'rc' ? 'Kvitteringen er lastet ned' : 'Banktransaksjonen er lagret som JSON'); return true;
  }
  if (act === 'origshare') {
    const tx = m.orig.tx;
    try {
      const f = await origFile();
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: tx?.description ?? 'Kvittering' });
      else if (navigator.share) await navigator.share({ title: tx?.description ?? '', text: `${tx?.description ?? ''} ${tx ? sgn(tx.amount) + ' kr ' + dd(tx.date) : ''}` });
      else flash('Deling er ikke tilgjengelig her');
    } catch (err) { if (err?.name !== 'AbortError') flash('Kunne ikke dele'); }
    return true;
  }
  return false;
}
export { c3 };

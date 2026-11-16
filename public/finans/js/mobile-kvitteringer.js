// Kvitteringer i Papir (Mobil Papir App → kvitt): ✦ ANALYSERES AV AI, kø, TIL GJENNOMGANG med skjemaet for skannede kvitteringer
// (kvittering-skjema.js), kilden til butikknavnet (kvittering-kilde.js) og BOKFØRT denne måneden. Skilt ut fra mobile-sveip.js
// (prompt 23, 34, 39, 41, 48 og 51). mobile-sveip.js sender klikk hit (kvBind) og tar inndata i feltene (KV.e).
import * as P39 from './mobile-sveip-bort.js'; // prompt 39: «✦ På nytt» med fremdrift
import { S, api, esc, n2, dd, today, parseAmount, loadReceipts } from './core.js';
import { m, draw, flash, loadJobs, ACTIVE_JOBS, retryUpload } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import * as P34 from './mobile-glimt-brief.js'; // prompt 34: ✦ ANALYSERES AV AI i Kvitteringer
import { logo } from './mobile-posisjon-og-logoer.js';
import { form48, via48, uncCls48, uncTag48, is48, flush48, bind48, setRedraw48, _e48 } from './kvittering-skjema.js'; // prompt 48: skjemaet for skannede kvitteringer
import { appendChunks } from '/assets/js/lib/chunks.js';
import { srcTag51, raw51, bind51, learn51 } from './kvittering-kilde.js'; // prompt 51: kilden til butikknavnet, «Rådata» og læring av butikknavn
bind48(); setRedraw48(() => draw());
bind51((id) => (S.receipts ?? []).find((x) => x.id === id));

const lab = (t, r = '') => `<span class="p23-lab"><span>${t}</span>${r ? `<span>${r}</span>` : ''}</span>`;

/* =====================================================================
   3. Kvitteringer i Papir (Mobil Papir App → kvitt)
   ===================================================================== */
export const KV = { open: null, e: {}, del: null, busy: null };
// Lange kvitteringslister i porsjoner (lib/chunks.js), som på desktop: de første KV_FIRST radene i hver boks med en gang, resten ved
// scroll eller når nettleseren er ledig. Antallet huskes til kvitteringene hentes på nytt (mobilen tegner hele siden ved hver endring).
const KV_FIRST = 40;
const KVC = { src: null, shown: { rev: KV_FIRST, ok: KV_FIRST }, rest: [] };
function kvShown(all, key, list, row, booked) {
  if (all !== KVC.src) { KVC.src = all; KVC.shown = { rev: KV_FIRST, ok: KV_FIRST }; }
  // En åpen kvittering langt nede i lista tegnes alltid.
  const openIx = booked ? -1 : list.findIndex((r) => r.id === KV.open);
  if (openIx >= KVC.shown[key]) KVC.shown[key] = openIx + 1;
  const n = Math.min(KVC.shown[key], list.length);
  if (n < list.length) KVC.rest.push({ key, list, row, booked, from: n });
  return list.slice(0, n).map((r, i) => row(r, i, booked)).join('');
}
/** Etter tegningen av Kvitteringer: resten av radene i porsjoner. */
export function kvAfterDraw() {
  const rest = KVC.rest; KVC.rest = [];
  for (const x of rest) {
    const box = document.querySelector(`[data-kv-list="${x.key}"]`);
    if (!box) continue;
    appendChunks(box, x.list.length - x.from, (from, n) => { KVC.shown[x.key] += n; return x.list.slice(x.from + from, x.from + from + n).map((r, i) => x.row(r, x.from + from + i, x.booked)).join(''); }, { step: 40 });
  }
}
const isRev = (r) => ['needs_review', 'failed', 'error'].includes(r.status);
const thisMonth = (r) => String(r.date ?? new Date(r.created ?? 0).toLocaleDateString('sv-SE')).slice(0, 7) === today().slice(0, 7);
const kr2 = (v) => `${(v ?? 0) > 0 ? '−' : ''}${n2(v ?? 0)}`;
const SVG = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const rcLogo = (r) => `<span class="p23-rlogo">${logo({ description: r.merchant ?? 'Kvittering', merchant: r.merchant, domain: r.domain }, 44, 12)}</span>`;
const conf = (r) => (r.confidence != null ? `${Math.round(r.confidence * (r.confidence <= 1 ? 100 : 1))} % sikker` : '');
function qItems() {
  const off = (m.offline ?? []).map((x) => ({ k: 'off', id: x.id, n: x.name || 'Kvittering', st: x.error ? `Feilet: ${x.error}` : 'Venter på nett · sendes automatisk', c: 'var(--pp-mut)', w: 100 }));
  // Prompt 34: jobbene som leses av AI (pending/processing) vises i ✦ ANALYSERES AV AI; KØ har opplastinger og feil.
  const jobs = (m.jobs ?? []).filter((j) => j.status === 'error').map((j) => {
    const run = ACTIVE_JOBS.includes(j.status), p = Math.max(3, Math.min(99, j.progress ?? 0));
    const txt = j.statusText || j.timeoutText || (j.status === 'error' ? `Feilet${j.error ? ` · ${j.error}` : ''}` : j.status === 'pending' ? '✦ I kø …' : `✦ Leser … ${p} %`);
    return { k: 'job', id: j.id, n: j.merchant || j.name || 'Kvittering', st: txt, c: run ? 'var(--pp-lab)' : 'var(--pp-lab)', w: run ? p : 100 };
  });
  return [...off, ...jobs];
}
export function kvView() {
  KVC.rest = [];
  const all = S.receipts ?? [], rev = all.filter(isRev), ok = all.filter((r) => r.status === 'booked' && thisMonth(r)), Q = qItems();
  const cats = (S.boot?.categories ?? []).filter((c) => c.kind !== 'income' && c.kind !== 'transfer');
  const row = (r, i, booked) => {
    const op = !booked && KV.open === r.id, e = KV.e[r.id] ?? { n: r.merchant ?? '', v: r.total != null ? n2(r.total) : '', cat: r.categoryId ?? null };
    const meta = !booked && P39.reMeta(r.id) ? P39.reMeta(r.id) /* prompt 39: ✦ Analyserer på nytt … 42 % */ : booked ? `${dd(r.date)} · ${esc(r.category ?? 'Ukategorisert')}` : r.status === 'needs_review' ? `${dd(r.date)} · ${is48(r) && via48(r) ? via48(r) : esc(r.source_label ?? r.provider ?? 'Manuell')}${conf(r) ? ` · ${conf(r)}` : ''}` : `<span style="color:var(--pp-lab)">Kunne ikke leses · fyll ut selv</span>`;
    const head = `${rcLogo(r)}<span class="p23-rt"><b class="${P39.hlOf(r.id, 'merchant')}">${esc(r.merchant || 'Ny kvittering')}</b><span class="${P39.hlOf(r.id, 'date')}${P39.hlOf(r.id, 'cat')}">${meta}</span></span><span class="p23-rv${P39.hlOf(r.id, 'total')}">${r.total != null ? kr2(r.total) : '–'}</span>`;
    // Prompt 41 (claude-code-finans-les-pa-nytt-alltid.md): bokførte kan åpnes (bilde, navn og beløp, kategori,
    // «Lagre endringer» og «↺ Til gjennomgang»), og «✦ På nytt» står på raden.
    if (booked) {
      const bo = KV.open === r.id, be = KV.e[r.id] ?? { n: r.merchant ?? '', v: r.total != null ? n2(r.total) : '', cat: r.categoryId ?? null };
      return `<div data-p39re="${esc(r.id)}" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><div class="p23-rrow p41-bk"><button class="p23-rbtn p41-bkb" data-p23="rcopen" data-id="${esc(r.id)}" aria-expanded="${bo}" aria-label="Åpne kvitteringen">${head}</button>${P39.reBtn(r.id).replace('class="p23-re"', 'class="p23-re p41-re" title="Les på nytt med Glimt"')}</div>${P39.reLine(r.id)}
        ${bo ? `<div class="p23-red p41-bko">${r.hasFile === false ? `<div class="p41-rsum"><b>${esc(r.merchant || 'Kvittering')}</b><span>${esc(dd(r.date))} · ${esc(r.category ?? '')}</span><span class="p41-rtot"><span>TOTAL</span><b>${r.total != null ? kr2(r.total) : '–'}</b></span></div>` : `<button type="button" class="p41-rimg" data-p23="rcimg" data-id="${esc(r.id)}" aria-label="Åpne bildet i fullskjerm" style="background-image:url('/finans/api/receipts/${encodeURIComponent(r.id)}/file')"></button>`}
          <span class="p41-lab">BOKFØRT · ENDRE</span><div class="p23-red2"><input class="p23-in" id="p23-rn-${esc(r.id)}" data-p23in="rcn" data-id="${esc(r.id)}" value="${esc(be.n)}" aria-label="Butikk" autocomplete="off"><input class="p23-in mono" id="p23-rv-${esc(r.id)}" data-p23in="rcv" data-id="${esc(r.id)}" value="${esc(be.v)}" inputmode="decimal" aria-label="Beløp"></div>
          <div class="p23-cats">${cats.map((c) => `<button class="p23-cat" data-p23="rccat" data-id="${esc(r.id)}" data-c="${c.id}" aria-pressed="${+be.cat === c.id}">${esc(c.name)}</button>`).join('')}</div>
          <div class="p41-bka"><button class="p23-ok" data-p23="rcsave" data-id="${esc(r.id)}" ${KV.busy === r.id ? 'disabled' : ''}>${KV.busy === r.id ? 'Lagrer …' : 'Lagre endringer'}</button><button class="p41-undo" data-p23="rcundo" data-id="${esc(r.id)}">↺ Til gjennomgang</button></div>${P39.rePanel(r.id)}</div>` : ''}</div>`;
    }
    return `<div data-p39re="${esc(r.id)}" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><button class="p23-rrow p23-rbtn" data-p23="rcopen" data-id="${esc(r.id)}" aria-expanded="${op}">${head}</button>${P39.reLine(r.id)}
      ${op ? `<div class="p23-red">${srcTag51(r) ? `<div class="p51-src">Butikknavn ${srcTag51(r)}</div>` : ''}${is48(r) && (uncTag48(r, 'merchant') || uncTag48(r, 'total')) ? `<div class="p48-unc">${uncTag48(r, 'merchant') ? `Butikk${uncTag48(r, 'merchant')}` : ''} ${uncTag48(r, 'total') ? `Beløp${uncTag48(r, 'total')}` : ''}</div>` : ''}<div class="p23-red2"><input class="p23-in${uncCls48(r, 'merchant')}" id="p23-rn-${esc(r.id)}" data-p23in="rcn" data-id="${esc(r.id)}" value="${esc(e.n)}" aria-label="Butikk" autocomplete="off"><input class="p23-in mono${uncCls48(r, 'total')}" id="p23-rv-${esc(r.id)}" data-p23in="rcv" data-id="${esc(r.id)}" value="${esc(e.v)}" inputmode="decimal" aria-label="Beløp"></div>
        <div class="p23-cats">${cats.map((c) => `<button class="p23-cat" data-p23="rccat" data-id="${esc(r.id)}" data-c="${c.id}" aria-pressed="${+e.cat === c.id}">${esc(c.name)}</button>`).join('')}</div>
        ${is48(r) ? form48(r, { has: ['merchant', 'total', 'category'], total: parseAmount(String(e.v ?? '')) ?? r.total }) : ''}${raw51(r)}
        <div class="p23-racts"><button class="p23-ok" data-p23="rcok" data-id="${esc(r.id)}" ${KV.busy === r.id ? 'disabled' : ''}>${KV.busy === r.id ? 'Bokfører …' : '✓ Godkjenn og bokfør'}</button>${P39.reBtn(r.id) /* prompt 39: fremdrift */}<button class="p23-del" data-p23="rcdel" data-id="${esc(r.id)}" aria-label="${KV.del === r.id ? 'Trykk igjen for å slette' : 'Slett'}">${KV.del === r.id ? 'Slett?' : '🗑'}</button></div>${P39.rePanel(r.id)}${globalThis.P40?.addedLine?.(r, 'rc') ?? '' /* prompt 40: lagt til */}</div>` : ''}</div>`;
  };
  return `<div class="p23-kv">
    <button class="p23-cam" data-p23="cam"><span class="p23-camic">${SVG('M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 24)}</span><span class="p23-rt"><b style="font-size:17px;font-weight:700">Ta bilde av kvittering</b><span style="font-size:13px">Bakkamera · ✦ Glimt leser butikk, beløp og varelinjer</span></span></button>
    <div class="p23-two"><label class="p23-pick">${SVG('M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01')}Bilder<input class="m-file" type="file" accept="image/*" multiple data-mupload data-stay></label><label class="p23-pick">${SVG('M6 3h8l4 4v14H6zM14 3v4h4')}Filer<input class="m-file" type="file" accept="application/pdf,image/*,.heic,.heif" multiple data-mupload data-stay></label></div>
    <input class="m-file" id="p23-cap" type="file" accept="image/*" capture="environment" data-mupload data-stay>
    ${m.uploading ? `<span class="pp-mut" style="font-size:13px;padding:0 4px" data-p48-up>Laster opp og leser ${m.uploading > 1 ? `${m.uploading} kvitteringer` : 'kvitteringen'} … Glimt kontrollerer svaret</span>` : ''}
    ${P34.kvAi()}
    ${Q.length ? `${lab('KØ')}<div class="p23-box">${Q.map((x, i) => `<div class="p23-q" style="border-top:${i ? '1px solid var(--pp-line)' : '0'}"><span class="p23-qt"><b>${esc(x.n)}</b><span style="color:${x.c}">${esc(x.st)}</span><span class="p23-qbar"><i style="width:${x.w}%;background:${x.c}"></i></span></span>
      <button class="p23-qre" data-p23="${x.k === 'off' ? 'qretry' : 'qre'}" data-id="${esc(x.id)}">${x.k === 'off' ? '↻ Send nå' : '✦ Analyser på nytt'}</button></div>`).join('')}</div>` : ''}
    ${lab(`TIL GJENNOMGANG · ${rev.length}`)}
    ${rev.length ? `<div class="p23-box" data-kv-list="rev">${kvShown(all, 'rev', rev, row, false)}</div>` : '<div class="p23-box p23-none">Alt er gjennomgått ✓</div>'}
    ${ok.length ? `${lab(`BOKFØRT · ${ok.length}`)}<div class="p23-box" data-kv-list="ok">${kvShown(all, 'ok', ok, row, true)}</div>` : ''}
  </div>`;
}
async function rcBook(id) {
  const r = (S.receipts ?? []).find((x) => x.id === id); if (!r) return;
  const e = KV.e[id] ?? {}, patch = {};
  if (e.n != null && e.n !== (r.merchant ?? '')) patch.merchant = e.n;
  if (e.v != null) { const v = parseAmount(String(e.v)); if (Number.isFinite(v) && v !== r.total) patch.total = Math.abs(v); }
  if (e.cat != null && +e.cat !== r.categoryId) patch.categoryId = +e.cat;
  KV.busy = id; draw();
  try {
    // Prompt 48: endrede detaljer (dato, varelinjer, rabatter …) sendes som rettelse før bokføringen.
    const catName = (S.boot?.categories ?? []).find((c) => c.id === (patch.categoryId ?? r.categoryId))?.name ?? r.category ?? null;
    const org51 = _e48[id]?.org_number ?? null; // flush48 glemmer skjemaet etter sending
    const f48 = await flush48(r, { merchant: patch.merchant ?? r.merchant, total: patch.total ?? r.total, category: catName });
    // Prompt 51: rettet butikknavn → POST /receipts/:id/merchant (serveren lærer org.nr. → navn); eldre server → PATCH under.
    if (patch.merchant?.trim() && await learn51(id, patch.merchant, org51).catch(() => null)) delete patch.merchant;
    if (f48.error) flash(`Rettelsen ble ikke lagret: ${f48.error}`);
    if (!r.date && !f48.date) patch.date = today();
    if (Object.keys(patch).length) await api(`/receipts/${id}`, { method: 'PATCH', json: patch });
    await api(`/receipts/${id}/book`, { method: 'POST' });
    KV.open = null; delete KV.e[id];
    await Promise.all([loadReceipts(), loadJobs()]);
    flash(`Bokført · ${e.n || r.merchant || 'kvittering'}`);
  } catch (err) { haptic('err'); flash(err.message); }
  KV.busy = null; draw();
}
/** Prompt 41: lagrer endringer på en bokført kvittering (serveren oppdaterer transaksjonen og logger hvem/når/hva). */
async function rcSave(id) {
  const r = (S.receipts ?? []).find((x) => x.id === id); if (!r) return;
  const e = KV.e[id] ?? {}, patch = {};
  if (e.n != null && e.n !== (r.merchant ?? '')) patch.merchant = e.n;
  if (e.v != null) { const v = parseAmount(String(e.v)); if (Number.isFinite(v) && Math.abs(v) !== r.total) patch.total = Math.abs(v); }
  if (e.cat != null && +e.cat !== r.categoryId) patch.categoryId = +e.cat;
  if (!Object.keys(patch).length) { KV.open = null; draw(); return; }
  KV.busy = id; draw();
  try { if (patch.merchant?.trim() && await learn51(id, patch.merchant).catch(() => null)) delete patch.merchant; /* prompt 51: lær butikknavnet */ if (Object.keys(patch).length) await api(`/receipts/${id}`, { method: 'PATCH', json: patch }); KV.open = null; delete KV.e[id]; await loadReceipts(); flash('Endringene er lagret'); }
  catch (err) { haptic('err'); flash(err.message); }
  KV.busy = null; draw();
}
/** Klikk i Kvitteringer (data-p23). → true når klikket er tatt. */
export async function kvBind(e, t, x) {
  const k = x.dataset.p23, id = x.dataset.id;
  if (k === 'cam') { document.getElementById('p23-cap')?.click(); return true; }
  if (k === 'rcopen') { KV.open = KV.open === id ? null : id; KV.del = null; draw(); return true; }
  if (k === 'rccat') { const r = (S.receipts ?? []).find((y) => y.id === id); KV.e[id] = { n: r?.merchant ?? '', v: r?.total != null ? n2(r.total) : '', ...(KV.e[id] ?? {}), cat: +x.dataset.c }; haptic('tab'); draw(); return true; }
  if (k === 'rcok') { syncInputs(id); await rcBook(id); return true; }
  if (k === 'rcsave') { syncInputs(id); await rcSave(id); return true; } // prompt 41: endre en bokført kvittering
  if (k === 'rcimg') { const u = `/finans/api/receipts/${encodeURIComponent(id)}/file`; globalThis.P41?.zoomImg ? globalThis.P41.zoomImg(u) : window.open(u, '_blank', 'noopener'); return true; }
  if (k === 'rcre') {
    P39.rcRe(id); return true; // Prompt 39: fremdrift i raden i stedet for side-om-side-dialogen
    try { const mod = await import('./reanalyze.js'); await mod.openReanalyze(id, { engine: 'ollama', onDone: async () => { await Promise.all([loadReceipts().catch(() => {}), loadJobs().catch(() => {})]); draw(); } }); }
    catch { try { await api(`/receipts/${id}/reprocess`, { method: 'POST' }); await loadJobs(); flash('✦ Analyseres på nytt'); } catch (err) { flash(err.message); } }
    return true;
  }
  if (k === 'rcdel') {
    if (KV.del !== id) { KV.del = id; draw(); return true; }
    try { await api(`/receipts/${id}`, { method: 'DELETE' }); KV.del = null; KV.open = null; await loadReceipts(); flash('Kvitteringen er slettet'); } catch (err) { flash(err.message); }
    return true;
  }
  if (k === 'rcundo') {
    try { await api(`/receipts/${id}/unbook`, { method: 'POST' }); await loadReceipts(); KV.open = id; flash('Sendt tilbake til gjennomgang'); }
    catch (err) { flash(err.status === 404 || err.status === 405 ? 'Angre bokføring krever en nyere server' : err.message); }
    return true;
  }
  if (k === 'qre') {
    try { await api(`/receipts/${id}/reprocess`, { method: 'POST' }); await loadJobs(); flash('✦ Analyseres på nytt'); } catch (err) { flash(err.message); }
    return true;
  }
  if (k === 'qretry') { await retryUpload([id]); return true; }
  return false;
}
function syncInputs(id) {
  const n = document.getElementById(`p23-rn-${id}`), v = document.getElementById(`p23-rv-${id}`);
  const r = (S.receipts ?? []).find((y) => y.id === id);
  KV.e[id] = { n: r?.merchant ?? '', v: r?.total != null ? n2(r.total) : '', cat: r?.categoryId ?? null, ...(KV.e[id] ?? {}), ...(n ? { n: n.value } : {}), ...(v ? { v: v.value } : {}) };
}

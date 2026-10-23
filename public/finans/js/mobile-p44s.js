// Prompt 44 (PWA44): Studie → Dokumenter på mobil (claude-code-studie-dokumenter.md, fasit design/Studie Dokumenter.dc.html).
// Last opp vitnemål, karakterutskrift eller attest (PDF/bilde, eller Ta bilde), Glimt leser (OCR + LLM på serveren) og viser
// ekte steg med tid, emnetabell (KODE · EMNE · SP · KAR.), «Glimt fant», spørsmål om dokumentet og Legg emner i Studie.
// Snittet regnes i backend (aldri av LLM-en); her vises bare tallene serveren gir (reserve: vektet A=5 … E=1 fra emnene).
// API (SERVER44): GET/POST /api/study/documents, POST /api/study/documents/:id/ask {q}, POST …/:id/apply, DELETE …/:id.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const ST = { orig: null, zoom: 1, re: null, docs: null, miss: false, err: '', sel: null, busy: null, steps: [], aq: '', ans: {}, asking: false, del: null, t: 0 };
const GR = { A: 'g', B: 'g', C: 'n', D: 'y', E: 'r', F: 'r', 6: 'g', 5: 'g', 4: 'n', 3: 'y', 2: 'r', 1: 'r' };
const nb = (v) => String(v ?? '').replace('.', ',');
const nDoc = (d) => ({
  id: String(d.id), kind: d.kind ?? d.type ?? 'annet', t: d.title ?? d.name ?? ({ vit: 'Vitnemål', vitnemal: 'Vitnemål', kar: 'Karakterutskrift', karakterutskrift: 'Karakterutskrift', attest: 'Attest' }[d.kind] ?? 'Dokument'),
  inst: d.institution ?? d.school ?? '', prog: d.program ?? d.studieprogram ?? '', date: d.date ?? d.issued ?? d.createdAt ?? '', ext: String(d.ext ?? d.fileType ?? (/(pdf)/i.test(d.mime ?? '') ? 'PDF' : /png/i.test(d.mime ?? '') ? 'PNG' : /heic|heif/i.test(d.mime ?? '') ? 'HEIC' : 'JPG')).toUpperCase().slice(0, 4),
  sum: d.summary ?? d.sum ?? '', rows: (d.emner ?? d.subjects ?? d.rows ?? []).map((r) => ({ k: r.kode ?? r.code ?? '', n: r.navn ?? r.name ?? '', sp: r.sp ?? r.credits ?? null, g: String(r.karakter ?? r.grade ?? ''), sem: r.semester ?? '' })),
  // Prompt 45: status, felter («Ikke funnet»), original fil og miniatyr (claude-code-studie-vitnemal-analyse-original.md).
  st: d.status ?? null, stT: d.statusText ?? '', how: d.how ?? '', fields: d.fields ?? null, err45: d.error ?? '', file: d.file ?? null, retry: d.retry ?? null,
  found: d.found ?? d.insights ?? [], snitt: d.snitt ?? d.average ?? null, snittVgs: d.snittVgs ?? null, sp: d.sp ?? d.credits ?? null, src: d.source ?? d.src ?? '', applied: !!(d.applied ?? d.appliedAt),
});
export async function studieLoad(force = false) {
  if (!force && ST.docs && Date.now() - ST.t < 60000) return;
  ST.t = Date.now();
  try { const r = await hlApi('/study/documents'); ST.docs = (Array.isArray(r) ? r : r?.items ?? r?.documents ?? []).map(nDoc); ST.ov = r?.kpi ?? r?.stats ?? null; ST.miss = false; ST.err = ''; if (!ST.sel && ST.docs[0]) ST.sel = ST.docs[0].id; }
  catch (e) { ST.miss = e.status === 404; ST.err = ST.miss ? '' : e.message; ST.docs ??= []; }
}
function stats() {
  const D = ST.docs ?? [], hi = D.filter((d) => d.kind !== 'vit' && d.kind !== 'vitnemal' && d.kind !== 'attest');
  const rows = hi.flatMap((d) => d.rows).filter((r) => r.sp && /^[A-F]$/.test(r.g));
  const sp = ST.ov?.sp ?? (hi.reduce((a, d) => a + (+d.sp || 0), 0) || rows.reduce((a, r) => a + +r.sp, 0));
  const V = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 }, w = rows.filter((r) => r.g !== 'F'), tot = w.reduce((a, r) => a + +r.sp, 0);
  const sn0 = ST.ov?.snitt ?? hi.find((d) => d.snitt != null)?.snitt, sn = sn0 && typeof sn0 === 'object' ? sn0.text ?? (sn0.letter ? `${sn0.letter} (${nb(sn0.value)})` : null) : sn0 ?? (tot ? w.reduce((a, r) => a + V[r.g] * r.sp, 0) / tot : null);
  const L = sn == null ? '–' : typeof sn === 'string' ? sn : `${'EDCBA'[Math.max(0, Math.min(4, Math.round(sn) - 1))]} (${nb(Math.round(sn * 10) / 10)})`;
  const vg0 = ST.ov?.snittVgs ?? D.find((d) => d.kind === 'vit' || d.kind === 'vitnemal')?.snittVgs ?? D.find((d) => d.kind === 'vit' || d.kind === 'vitnemal')?.snitt ?? null, vg = vg0 && typeof vg0 === 'object' ? vg0.text ?? vg0.value : vg0;
  return [[nb(sp || 0), 'studiepoeng registrert'], [L, 'snitt høyere utdanning'], [vg == null ? '–' : nb(vg), 'snitt videregående'], [String(ST.ov?.count ?? D.length), 'dokumenter']];
}
export function studieView() {
  if (!ST.docs) { studieLoad().then(draw).catch(() => {}); return '<div class="m-spin"></div>'; }
  if (ST.miss) return `${upload(true)}<div class="p44s-empty"><b>Dokumenter er ikke tilgjengelig ennå</b><span>Krever en nyere Homelab-server. Glimt leser vitnemål og karakterutskrifter på hjemmeserveren din.</span></div>`;
  const cur = (ST.docs ?? []).find((d) => d.id === ST.sel);
  return `<div class="p44s">
    ${upload(false)}
    ${ST.busy ? `<div class="p44s-busy"><b>✦ Glimt leser «${esc(ST.busy)}» …</b>${ST.steps.map((g) => `<div><span>${g.ok === false ? '✕' : '✓'} ${esc(g.n)}</span><span class="p44s-mono">${g.ms != null ? `${g.ms} ms` : ''}</span></div>`).join('')}</div>` : ''}
    ${ST.err ? `<div class="p44s-err">${esc(ST.err)}</div>` : ''}
    <div class="p44s-stats">${stats().map(([v, l]) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>
    <span class="p44s-lab">DOKUMENTER · ${ST.docs.length}</span>
    <div class="p44s-list">${ST.docs.map((d) => `<button type="button" class="p44s-doc${d.id === ST.sel ? ' on' : ''}" data-p44s="sel" data-id="${esc(d.id)}"><span class="p44s-ext">${esc(d.ext)}</span><span class="m-grow"><b>${esc(d.t)}</b><small>${esc([d.inst, d.src, d.rows.length ? `${d.rows.length} emner` : ''].filter(Boolean).join(' · '))}</small></span><span class="p44s-st">✦ Lest</span></button>`).join('') || '<span class="p44s-dim">Ingen dokumenter ennå. Last opp vitnemålet eller karakterutskriften din.</span>'}</div>
    ${cur ? docCard(cur) : ''}</div>`;
}
function upload(dim) {
  return `<div class="p44s-up${dim ? ' dim' : ''}"><span class="p44s-orb"><span>✦</span></span><span class="m-grow"><b>Last opp vitnemål, karakterutskrift eller attest</b><small>PDF eller bilde · Glimt leser fagene, karakterene og studiepoengene</small></span></div>
    <div class="p44s-ub"><label class="p44s-btn ink">Velg fil<input type="file" class="m-file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif" multiple data-p44s-file ${dim ? 'disabled' : ''}></label><label class="p44s-btn">Ta bilde<input type="file" class="m-file" accept="image/*" capture="environment" data-p44s-file ${dim ? 'disabled' : ''}></label></div>`;
}
/* Prompt 45: «Vis original» med miniatyr, analysestatus («Fant 14 fag» / feil + Prøv igjen) og feltene (Ikke funnet). */
const fileOf = (d) => d.file ?? { url: `/api/study/documents/${encodeURIComponent(d.id)}/file`, download: `/api/study/documents/${encodeURIComponent(d.id)}/file?download=1`, thumb: `/api/study/documents/${encodeURIComponent(d.id)}/thumb`, kind: d.ext === 'PDF' ? 'pdf' : 'image' };
function origRow(d) {
  const F = fileOf(d);
  return `<button type="button" class="p45-sorig" data-p44s="orig"><span class="p45-sth">${F.thumb ? `<img src="${esc(F.thumb)}" alt="" loading="lazy" data-p45rm>` : ''}<i>${esc(d.ext)}</i></span><span class="m-grow"><b>Vis original</b><small>${F.kind === 'pdf' ? `PDF${F.pages ? ` · ${F.pages} ${F.pages === 1 ? 'side' : 'sider'}` : ''}` : 'Bilde'} · åpnes i fullskjerm</small></span><span aria-hidden="true">›</span></button>`;
}
function statusRow(d) {
  if (ST.re === d.id) return '<div class="p45-sst run"><span class="p45-sdot"></span>Analyserer …</div>';
  if (!d.st && !d.err45) return '';
  const bad = d.st === 'failed' || (!!d.err45 && d.st !== 'ok');
  return `<div class="p45-sst ${bad ? 'bad' : d.st === 'partial' ? 'part' : 'ok'}"><span class="p45-sdot"></span><span class="m-grow">${esc(d.stT || (bad ? 'Fikk ikke lest dokumentet' : 'Lest'))}${d.how ? ` <small>· ${esc({ pdf: 'tekst fra PDF', ocr: 'OCR', vision: 'bildemodell', tekst: 'tekst' }[d.how] ?? d.how)}</small>` : ''}${bad && d.err45 ? `<small class="p45-serr">${esc(d.err45)}</small>` : ''}</span>${bad || d.st === 'partial' ? '<button type="button" class="p44s-btn sm" data-p44s="re">Prøv igjen</button>' : ''}</div>`;
}
function fieldsRow(d) {
  const F = d.fields; if (!F) return '';
  const L = [['institution', 'Skole'], ['student', 'Navn'], ['program', 'Program'], ['date', 'Dato'], ['sp', 'Studiepoeng'], ['snitt', 'Snitt']].filter(([k]) => F[k] != null);
  return L.length ? `<div class="p45-sfl">${L.map(([k, n]) => { const v = typeof F[k] === 'object' ? F[k]?.text ?? F[k]?.value ?? '' : F[k]; const miss = /ikke funnet/i.test(String(v)); return `<span class="${miss ? 'miss' : ''}"><small>${n}</small><b>${esc(String(v))}</b></span>`; }).join('')}</div>` : '';
}
/** Fullskjerm: PDF med sider (nettleserens visning) eller bilde med zoom. Last ned og ✕. */
function origLayer() {
  const d = ST.orig && (ST.docs ?? []).find((y) => y.id === ST.orig); if (!d) { ST.orig = null; return ''; }
  const F = fileOf(d);
  return `<div class="p45-sov" role="dialog" aria-modal="true" aria-label="Original: ${esc(d.t)}"><div class="p45-sovt"><b class="m-ell">${esc(d.t)}</b><span class="m-grow"></span>${F.kind === 'pdf' ? '' : `<button type="button" class="p45-sovb" data-p44s="zoom" data-z="-1" aria-label="Zoom ut">−</button><button type="button" class="p45-sovb" data-p44s="zoom" data-z="1" aria-label="Zoom inn">+</button>`}<a class="p45-sovb wide" href="${esc(F.download ?? F.url)}" download>Last ned</a><button type="button" class="p45-sovb" data-p44s="origx" aria-label="Lukk">✕</button></div>
    <div class="p45-sovc">${F.kind === 'pdf' ? `<iframe src="${esc(F.url)}#view=FitH" title="${esc(d.t)}"></iframe><a class="p45-sovf" href="${esc(F.url)}" target="_blank" rel="noopener">Vises ikke? Åpne PDF-en ›</a>` : `<img src="${esc(F.url)}" alt="${esc(d.t)}" style="width:${Math.round(ST.zoom * 100)}%">`}</div></div>`;
}
function docCard(d) {
  const A = ST.ans[d.id];
  return `<div class="p44s-card"><span class="p44s-lab red">✦ GLIMT HAR LEST</span><b class="p44s-h">${esc(d.t)}</b><small class="p44s-meta">${esc([d.inst, d.prog, d.date ? new Date(d.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '', d.ext].filter(Boolean).join(' · '))}</small>
    ${origRow(d)}${statusRow(d)}
    ${d.sum ? `<p class="p44s-sum">${esc(d.sum)}</p>` : ''}${fieldsRow(d)}
    ${d.rows.length ? `<div class="p44s-tab"><div class="p44s-tr hd"><span>KODE</span><span>EMNE</span><span>SP</span><span>KAR.</span></div>${d.rows.map((r) => `<div class="p44s-tr"><span class="p44s-mono">${esc(r.k)}</span><span class="p44s-nm">${esc(r.n)}</span><span class="p44s-mono">${r.sp == null ? '–' : esc(nb(r.sp))}</span><b class="p44s-g ${GR[r.g] ?? 'n'}">${esc(r.g || '–')}</b></div>`).join('')}</div>` : ''}
    ${d.found.length ? `<span class="p44s-lab">GLIMT FANT</span><ul class="p44s-found">${d.found.map((t) => `<li>${esc(typeof t === 'string' ? t : t.text ?? '')}</li>`).join('')}</ul>` : ''}
    <form class="p44s-ask" data-p44sf="ask"><span aria-hidden="true">✦</span><input id="p44s-aq" name="q" value="${esc(ST.aq)}" placeholder="Spør om dokumentet, f.eks. «har jeg strøk?»" autocomplete="off" enterkeyhint="send" aria-label="Spør om dokumentet"><button type="submit" ${ST.asking ? 'disabled' : ''}>${ST.asking ? '…' : 'Spør'}</button></form>
    ${A ? `<span class="p44s-ans">✦ ${esc(A)}</span>` : ''}
    <div class="p44s-acts"><button type="button" class="p44s-btn" data-p44s="apply" ${d.rows.length ? '' : 'disabled'}>${d.applied ? 'Emnene ligger i Studie ✓' : 'Legg emner i Studie'}</button><button type="button" class="p44s-btn" data-p44s="share">Del som PDF</button><button type="button" class="p44s-btn red" data-p44s="del">${ST.del === d.id ? 'Trykk igjen for å slette' : 'Slett'}</button></div></div>`;
}
async function uploadFiles(files) {
  for (const f of files) {
    ST.busy = f.name || 'dokument'; ST.steps = []; draw();
    const t0 = performance.now();
    try {
      const fd = new FormData(); fd.append('file', f, f.name || 'dokument.jpg');
      const res = await fetch('/api/study/documents', { method: 'POST', body: fd });
      const up = Math.round(performance.now() - t0);
      const j = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      if (!res.ok) { const e = new Error(j?.error || `Homelab svarte ${res.status}`); e.status = res.status; throw e; }
      const st0 = j?.doc?.steps ?? j?.steps, S = Array.isArray(st0) ? st0.map((x) => ({ n: x.label ?? x.n ?? x.name, ms: x.key === 'upload' ? up : x.ms ?? null, ok: x.ok })) : [{ n: 'Lastet opp, lest og analysert', ms: up }];
      ST.steps = S; draw();
      const d = nDoc(j?.doc ?? j);
      ST.docs = [d, ...(ST.docs ?? []).filter((x) => x.id !== d.id)]; ST.sel = d.id; haptic('ok');
      flash(`✦ Glimt leste «${d.t}»`);
    } catch (e) { flash(e.status === 404 ? 'Krever en nyere Homelab-server' : e.status === 413 ? 'Fila er for stor' : e.message, 'err'); }
    await new Promise((r) => setTimeout(r, 700));
    ST.busy = null; ST.steps = []; draw();
  }
}
export function studieLayer() { return ST.orig ? origLayer() : ''; }
export function studieAfter() { if (m.screen !== 'studie') { ST.del = null; ST.orig = null; } }
export function studieInput(e, t) { if (t.id === 'p44s-aq') { ST.aq = t.value; return true; } return false; }
export async function studieChange(e, t) {
  if (!t.matches?.('[data-p44s-file]')) return false;
  const f = [...(t.files ?? [])]; t.value = ''; if (f.length) await uploadFiles(f); return true;
}
export async function studieSubmit(e, f) {
  if (!f.matches?.('[data-p44sf="ask"]')) return false;
  e.preventDefault(); const q = String(f.q.value ?? '').trim(), id = ST.sel; if (!q || !id) return true;
  ST.asking = true; ST.aq = ''; draw();
  try { const r = await hlApi(`/study/documents/${encodeURIComponent(id)}/ask`, { method: 'POST', json: { q } }); ST.ans[id] = r?.answer ?? r?.text ?? 'Fant ikke det i dokumentet.'; }
  catch (err) {
    const d = (ST.docs ?? []).find((x) => x.id === id), w = q.toLowerCase().split(/\s+/).filter((x) => x.length > 2);
    const hit = d?.rows.filter((r) => w.some((x) => r.n.toLowerCase().includes(x))) ?? [];
    ST.ans[id] = hit.length ? hit.map((r) => `${r.n}: ${r.g}${r.sp ? ` (${nb(r.sp)} sp)` : ''}`).join(' · ') : /strøk|stryk/.test(q) ? (d?.rows.some((r) => r.g === 'F') ? `Ja, strøk i ${d.rows.filter((r) => r.g === 'F').map((r) => r.n).join(', ')}` : 'Ingen strøk.') : err.status === 404 ? 'Krever en nyere Homelab-server.' : err.message;
  }
  ST.asking = false; draw(); return true;
}
export async function studieBind(e, t) {
  const x = t.closest?.('[data-p44s]'); if (!x || m.screen !== 'studie') return false;
  e.preventDefault(); const a = x.dataset.p44s, d = (ST.docs ?? []).find((y) => y.id === ST.sel);
  if (a === 'sel') { ST.sel = x.dataset.id; ST.del = null; haptic('tab'); draw(); setTimeout(() => document.querySelector('.p44s-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); return true; }
  if (!d) return true;
  if (a === 'orig') { ST.orig = d.id; ST.zoom = 1; haptic('tap'); draw(); return true; }
  if (a === 'origx') { ST.orig = null; draw(); return true; }
  if (a === 'zoom') { ST.zoom = Math.max(0.5, Math.min(4, ST.zoom * (+x.dataset.z > 0 ? 1.4 : 1 / 1.4))); draw(); return true; }
  if (a === 're') {
    ST.re = d.id; draw();
    try { const r = await hlApi(d.retry?.path?.replace(/^\/api/, '') ?? `/study/documents/${encodeURIComponent(d.id)}/reanalyze`, { method: 'POST', json: {} }); const nd = nDoc(r?.doc ?? r); ST.docs = ST.docs.map((y) => (y.id === d.id ? nd : y)); haptic(nd.st === 'failed' ? 'err' : 'ok'); flash(nd.stT || 'Analysert på nytt'); }
    catch (err) { flash(err.status === 404 ? 'Krever en nyere Homelab-server' : err.message, 'err'); }
    ST.re = null; draw(); return true;
  }
  if (a === 'apply') { try { const r = await hlApi(`/study/documents/${encodeURIComponent(d.id)}/apply`, { method: 'POST', json: {} }); d.applied = true; haptic('ok'); flash(`${r?.added ?? d.rows.length} emner lagt i Studie og Kalender ✓`); } catch (err) { flash(err.status === 404 ? 'Krever en nyere Homelab-server' : err.message, 'err'); } draw(); return true; }
  if (a === 'share') {
    try { const res = await fetch(`/api/study/documents/${encodeURIComponent(d.id)}/pdf?copy=1`); if (!res.ok) throw Object.assign(new Error(`Homelab svarte ${res.status}`), { status: res.status }); const b = await res.blob(), file = new File([b], `${d.t} (kopi).pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: d.t }); else { const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = file.name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); } }
    catch (err) { if (err?.name !== 'AbortError') flash(err.status === 404 ? 'Deling som PDF krever en nyere Homelab-server' : err.message); }
    return true;
  }
  if (a === 'del') {
    if (ST.del !== d.id) { ST.del = d.id; draw(); return true; }
    ST.del = null;
    try { await hlApi(`/study/documents/${encodeURIComponent(d.id)}`, { method: 'DELETE' }); ST.docs = ST.docs.filter((y) => y.id !== d.id); ST.sel = ST.docs[0]?.id ?? null; flash('Dokumentet er slettet'); } catch (err) { flash(err.message, 'err'); }
    draw(); return true;
  }
  return false;
}

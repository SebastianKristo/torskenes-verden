// Prompt 50 (SRVCHAT50): vedlegg i Chat på web (claude-code-chat-slipp-filer-og-miniatyr.md).
//   - Dra og slipp over hele chatten (teller dragenter/dragleave, så laget ikke blinker over barneelementer) og lim inn bilder.
//   - Miniatyrrad over feltet (64×64, ×-knapp, fremdriftslinje mens filen lastes opp), PDF/andre filer som kort med filtype.
//   - Bilder i brukerens boble (ett: maks 240×240, flere: rutenett 2 × 120 px) og en lysboks med Lukk, Last ned, sveip og Esc.
// Opplasting: POST /api/chat/files (XHR for fremdrift) → {id, kind, thumb, url, w, h}. Miniatyrene (480 px WebP) lagres på serveren
// sammen med samtalen, så historikken laster fort og er lik på mobil og web; originalen hentes først i lysboksen.
import { esc } from './util.js';

export const MAX_BYTES50 = 20 * 1024 * 1024, MAX_FILES50 = 10;
const OK_TYPE = /^(image\/|application\/pdf$|text\/|application\/(json|xml|csv|x-yaml|yaml|javascript|x-sh|msword|vnd\.openxmlformats-officedocument\.|vnd\.oasis\.opendocument\.))/;
const OK_EXT = /\.(pdf|txt|md|csv|json|ya?ml|log|ini|conf|sh|js|py|docx?|odt|xlsx?|pptx?|heic|heif)$/i;

const CSS = `
.ch-drop50{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;pointer-events:none;background:color-mix(in srgb,var(--cb,#f3efe6) 92%,transparent)}
.ch-drop50::before{content:'';position:absolute;inset:16px;border:2px dashed var(--ci,#1b1a17);border-radius:24px}
.ch-drop50 div{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.ch-drop50 b{font:500 28px Newsreader,Georgia,serif;color:var(--ci,#1b1a17)}
.ch-drop50 span{font-size:14px;color:var(--cm,#6b665c)}
.ch-att50{display:flex;gap:8px;flex-wrap:wrap;padding:4px 2px 2px}
.ch-att50>div{position:relative;width:64px;flex:none;display:flex;flex-direction:column;gap:3px}
.ch-att50 .t{position:relative;width:64px;height:64px;border-radius:12px;overflow:hidden;background:var(--cc,#fff);border:1px solid var(--cl,#d8d1c2);display:grid;place-items:center}
.ch-att50 img{width:100%;height:100%;object-fit:cover;display:block}
.ch-att50 .ft{font:700 12px 'IBM Plex Mono',var(--mono,monospace);letter-spacing:.06em;color:var(--cm,#6b665c)}
.ch-att50 .n{font-size:10.5px;color:var(--cm,#6b665c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:64px}
.ch-att50 .x{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:11px;border:0;background:var(--ci,#1b1a17);color:var(--cb,#f3efe6)!important;font-size:12px;line-height:22px;cursor:pointer;padding:0;z-index:1}
.ch-att50 .p{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(0,0,0,.12)}
.ch-att50 .p i{display:block;height:100%;background:var(--ca,#b23a2a);transition:width .2s}
.ch-att50 .e{outline:2px solid var(--ca,#b23a2a)}
.ch-uimg50{display:flex;justify-content:flex-end;margin-bottom:6px}
.ch-uimg50 button{border:0;padding:0;background:none;cursor:zoom-in;border-radius:16px;overflow:hidden;display:block}
.ch-uimg50.one img{display:block;max-width:240px;max-height:240px;border-radius:16px;object-fit:cover}
.ch-uimg50.grid{display:grid;grid-template-columns:repeat(2,120px);gap:4px;justify-content:end}
.ch-uimg50.grid button{width:120px;height:120px;border-radius:12px}
.ch-uimg50.grid img{width:120px;height:120px;object-fit:cover;display:block}
.ch-uimg50 img{background:var(--cc,#fff)}
.ch-fpill50{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px 0 0;border-radius:999px;border:1px solid var(--cl,#d8d1c2);background:transparent;font-size:12px;font-weight:600;color:var(--cm,#6b665c);cursor:pointer;max-width:220px}
.ch-fpill50 img{width:28px;height:28px;border-radius:6px;object-fit:cover;flex:none}
.ch-fpill50 span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ch-rw50{font-size:12px;color:var(--cm,#6b665c);margin-top:6px}
.ch-fin50{display:inline-flex;align-items:center;margin-top:10px;height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--ci,#1b1a17);background:transparent;font-weight:700;font-size:13.5px;cursor:pointer}
.ch-fin50[disabled]{opacity:.6;cursor:default}
.ch-vis50{flex:none;font:700 9.5px 'IBM Plex Mono',var(--mono,monospace);letter-spacing:.06em;padding:3px 6px;border-radius:6px;border:1px solid var(--cl,#d8d1c2);color:var(--cm,#6b665c);margin-right:4px}
.ch-md table{border-collapse:collapse;margin:6px 0;font-size:13.5px}
.ch-md th,.ch-md td{border-bottom:1px solid var(--cl,#d8d1c2);padding:5px 10px;text-align:left}
.ch-md td.r,.ch-md th.r{text-align:right;font-variant-numeric:tabular-nums}
.lb50{position:fixed;inset:0;z-index:10000;background:rgba(10,10,10,.94);display:flex;flex-direction:column;touch-action:none;color:#fff}
.lb50-h{display:flex;align-items:center;gap:10px;padding:12px 16px;padding-top:max(12px,env(safe-area-inset-top))}
.lb50-h b{flex:1;min-width:0;font:600 14px system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb50-h a,.lb50-h button{height:40px;padding:0 16px;border-radius:20px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none}
.lb50-s{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.lb50-s img{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;transition:transform .18s}
.lb50-n{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:22px;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:22px;cursor:pointer}
.lb50-n.l{left:12px}.lb50-n.r{right:12px}
.lb50-c{text-align:center;font:500 12px system-ui,sans-serif;opacity:.7;padding:8px 0 max(12px,env(safe-area-inset-bottom))}`;
export function css50() { if (document.getElementById('ch-css50')) return; const s = document.createElement('style'); s.id = 'ch-css50'; s.textContent = CSS; document.head.appendChild(s); }

/** Hvorfor en fil ikke kan legges ved (eller null). */
export function rejectReason50(f) {
  if (f.size > MAX_BYTES50) return 'Filen er for stor (maks 20 MB)';
  if (!OK_TYPE.test(f.type || '') && !OK_EXT.test(f.name || '')) return `Filtypen støttes ikke (${f.name || 'ukjent fil'})`;
  return null;
}
export const isImg50 = (f) => /^image\//.test(f?.type || f?.mime || '') || /\.(heic|heif)$/i.test(f?.name || '');
const ext = (n) => (String(n ?? '').match(/\.(\w{1,5})$/)?.[1] ?? 'FIL').toUpperCase();

/** Laster opp med fremdrift. onPct(0–100). → {id, kind, thumb, url, w, h, …} */
export function upload50(file, onPct = () => {}) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/chat/files');
    x.responseType = 'json';
    x.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.min(99, (e.loaded / e.total) * 100)); };
    x.onload = () => {
      if (x.status === 401) { location.href = '/login'; return reject(new Error('Ikke innlogget')); }
      const d = x.response ?? {};
      if (x.status >= 200 && x.status < 300) { onPct(100); resolve(d); } else reject(Object.assign(new Error(d.error || `Feil ${x.status}`), { status: x.status }));
    };
    x.onerror = () => reject(new Error('Nettverksfeil'));
    const fd = new FormData(); fd.append('file', file, file.name || 'bilde.png');
    x.send(fd);
  });
}

/** Miniatyrraden over feltet. att: [{kind:'img'|'file'|'doc', name, up, pct, preview, err}] */
export function attRow50(att) {
  if (!att.length) return '';
  return `<div class="ch-att50">${att.map((a, i) => {
    const inner = a.kind === 'img' && (a.preview || a.thumb) ? `<img src="${esc(a.preview || a.thumb)}" alt="">` : `<span class="ft">${esc(a.kind === 'doc' ? 'KB' : ext(a.name))}</span>`;
    return `<div><span class="t${a.err ? ' e' : ''}" title="${esc(a.err || a.name)}">${inner}${a.up ? `<span class="p"><i style="width:${Math.round(a.pct ?? 2)}%"></i></span>` : ''}</span>
      ${a.kind === 'img' ? '' : `<span class="n" data-no-i18n>${esc(a.name)}</span>`}<button type="button" class="x" data-ch-rmatt="${i}" aria-label="Fjern ${esc(a.name)}">✕</button></div>`;
  }).join('')}</div>`;
}

/** Bildene i en melding: vedlegg (thumb/url) og eldre base64-bilder. → [{thumb, url, name}] */
export function imagesOf50(m) {
  const out = (m.attachments ?? []).filter((a) => a && (a.kind === 'image' || isImg50(a))).map((a) => ({ thumb: a.preview || a.thumb || a.url, url: a.url || a.preview || a.thumb, name: a.name || 'Bilde' }));
  // Prompt 52: miniatyrer lagret på meldingen (attTh) når vedleggene ikke har egen thumb.
  if (!out.length && Array.isArray(m.attTh)) for (const u of m.attTh) if (typeof u === 'string' && u.startsWith('data:image/')) out.push({ thumb: u, url: u, name: 'Bilde' });
  for (const b of m.images ?? []) { const u = String(b).startsWith('data:') ? b : `data:image/jpeg;base64,${b}`; out.push({ thumb: u, url: u, name: 'Bilde' }); }
  return out;
}
/** Bilder over teksten i brukerens boble. key = meldingsindeks (for lysboksen). */
export function bubbleImgs50(m, key) {
  const L = imagesOf50(m);
  if (!L.length) return '';
  return `<div class="ch-uimg50 ${L.length === 1 ? 'one' : 'grid'}">${L.map((x, i) => `<button type="button" data-ch-lb="${esc(key)}:${i}" aria-label="Åpne ${esc(x.name)}"><img src="${esc(x.thumb)}" alt="${esc(x.name)}" loading="lazy" decoding="async"></button>`).join('')}</div>`;
}
/** Filer som ikke er bilder (pille som før). */
export const otherFiles50 = (m) => (m.attachments ?? []).filter((a) => a && a.kind !== 'image' && !isImg50(a)).map((a) => a.name);
/** Liten miniatyr (28 px) + filnavn ved Glimt-svaret; trykk åpner lysboksen. */
export function filePills50(m, key) {
  return imagesOf50(m).map((x, i) => `<button type="button" class="ch-fpill50" data-ch-lb="${esc(key)}:${i}"><img src="${esc(x.thumb)}" alt="" loading="lazy"><span data-no-i18n>${esc(x.name)}</span></button>`).join('');
}

/** Dra og slipp over el. onFiles(File[]). Teller dragenter/dragleave så laget ikke blinker. */
export function bindDrop50(el, onFiles) {
  if (el.dataset.drop50) return;
  el.dataset.drop50 = '1';
  let depth = 0, layer = null;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const show = () => { if (layer) return; layer = document.createElement('div'); layer.className = 'ch-drop50'; layer.setAttribute('aria-hidden', 'true'); layer.innerHTML = '<div><b>Slipp for å legge ved</b><span>Bilder, PDF, tekst · maks 20 MB</span></div>'; el.appendChild(layer); };
  const hide = () => { depth = 0; layer?.remove(); layer = null; };
  el.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; show(); });
  el.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  el.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) hide(); });
  el.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); hide(); const fs = [...(e.dataTransfer.files ?? [])]; if (fs.length) onFiles(fs); });
  window.addEventListener('dragend', hide);
}
/** Bilder fra utklippstavlen (paste). → File[] */
export function pastedFiles50(e) {
  const out = [];
  for (const it of e.clipboardData?.items ?? []) if (it.kind === 'file') { const f = it.getAsFile(); if (f) out.push(f.name && f.name !== 'image.png' ? f : new File([f], `Utklipp ${new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type })); }
  return out;
}

/** Lysboks: Lukk, Last ned, sveip mellom bildene, Esc og sveip ned lukker. list: [{url, thumb, name}] */
export function lightbox50(list, start = 0) {
  if (!list.length) return;
  css50();
  let i = Math.max(0, Math.min(list.length - 1, start));
  const ov = document.createElement('div');
  ov.className = 'lb50'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Bilde');
  const draw = () => {
    const x = list[i];
    ov.innerHTML = `<div class="lb50-h"><b data-no-i18n>${esc(x.name)}</b><a href="${esc(x.url)}" download="${esc(x.name)}">Last ned</a><button type="button" data-lb="close">Lukk</button></div>
      <div class="lb50-s"><img src="${esc(x.thumb)}" alt="${esc(x.name)}">${list.length > 1 ? `<button type="button" class="lb50-n l" data-lb="prev" aria-label="Forrige">‹</button><button type="button" class="lb50-n r" data-lb="next" aria-label="Neste">›</button>` : ''}</div>
      <div class="lb50-c">${list.length > 1 ? `${i + 1} av ${list.length}` : ''}</div>`;
    // Originalen hentes først nå (miniatyren vises mens den lastes).
    if (x.url && x.url !== x.thumb) { const im = new Image(); im.onload = () => { const el = ov.querySelector('.lb50-s img'); if (el && list[i] === x) el.src = x.url; }; im.src = x.url; }
  };
  const go = (d) => { if (list.length < 2) return; i = (i + d + list.length) % list.length; draw(); };
  const close = () => { ov.remove(); window.removeEventListener('keydown', key, true); };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  };
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (b?.dataset.lb === 'close') close(); else if (b?.dataset.lb === 'prev') go(-1); else if (b?.dataset.lb === 'next') go(1);
    else if (e.target.classList.contains('lb50-s')) close();
  });
  let sx = 0, sy = 0, on = false;
  ov.addEventListener('pointerdown', (e) => { if (e.target.closest('a,button')) return; on = true; sx = e.clientX; sy = e.clientY; });
  ov.addEventListener('pointermove', (e) => { if (!on) return; const dy = e.clientY - sy, img = ov.querySelector('.lb50-s img'); if (img && dy > 0 && Math.abs(dy) > Math.abs(e.clientX - sx)) img.style.transform = `translateY(${dy}px)`; });
  ov.addEventListener('pointerup', (e) => {
    if (!on) return; on = false;
    const dx = e.clientX - sx, dy = e.clientY - sy, img = ov.querySelector('.lb50-s img');
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return close();
    if (img) img.style.transform = '';
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  });
  window.addEventListener('keydown', key, true);
  document.body.appendChild(ov);
  draw();
  ov.querySelector('[data-lb="close"]')?.focus();
}

/** «Lest med gemma3:12b fordi gpt-oss ikke kan se bilder» / «Lest med lokal OCR» under svaret. */
export const readWith50 = (meta) => (meta?.readWith?.label ? `<div class="ch-rw50">${esc(meta.readWith.label)}</div>` : '');
/** «Legg i Finans ›» under kvitteringstabellen. */
export function finansBtn50(meta, key, state) {
  const a = meta?.receipt?.action;
  if (!a?.url) return '';
  const done = state === 'ok', busy = state === 'busy';
  return `<button type="button" class="ch-fin50" data-ch-fin50="${esc(key)}" ${done || busy ? 'disabled' : ''}>${done ? 'Lagt i Finans ✓' : busy ? 'Legger i Finans …' : esc(a.label || 'Legg i Finans ›')}</button>`;
}

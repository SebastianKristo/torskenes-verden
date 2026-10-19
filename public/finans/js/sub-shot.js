// Prompt 28 (claude-code-abo-skjermbilde-fiks.md): felles klientdel for «Abonnement fra skjermbilde» i PWA og på PC.
//  1. Bildet konverteres til JPEG i nettleseren (canvas → toBlob('image/jpeg', .85)), maks 1600 px på lengste side.
//     Kan nettleseren ikke tegne bildet (f.eks. HEIC i Chrome), sendes originalen og serveren konverterer.
//  2. POST /finans/api/subscriptions/from-screenshot[?engine=gemini] (multipart «image»), timeout 130 s.
//     Feil kommer som {error, code:'ollama_down'|'no_vision'|'timeout'|'not_found'|…, canGemini}.
//  3. «Les med Gemini» sendes bare når brukeren trykker på knappen, aldri automatisk.
//  4. POST /finans/api/ai/vision/install (admin) installerer qwen2.5vl:7b med SSE-fremdrift.
import { esc } from './core.js';

export const SLOW_MS = 5000; // «Laster bildemodellen …» etter 5 s
const MAX = 1600, Q = 0.85, TIMEOUT = 130000;

/** Tegner bildet på canvas og gir JPEG ≤ 1600 px. Faller tilbake til originalen hvis bildet ikke kan tegnes. */
export async function toJpeg(file) {
  try {
    let bmp = null, w = 0, h = 0, url = null;
    if ('createImageBitmap' in window) {
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = bmp.width; h = bmp.height; } catch { bmp = null; }
    }
    if (!bmp) {
      url = URL.createObjectURL(file);
      bmp = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Kan ikke tegne bildet')); im.src = url; });
      w = bmp.naturalWidth; h = bmp.naturalHeight;
    }
    if (!w || !h) throw new Error('tomt bilde');
    const s = Math.min(1, MAX / Math.max(w, h)), cw = Math.round(w * s), ch = Math.round(h * s);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(bmp, 0, 0, cw, ch);
    bmp.close?.(); if (url) URL.revokeObjectURL(url);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', Q));
    if (!blob) throw new Error('toBlob feilet');
    return { blob, name: String(file.name || 'skjermbilde').replace(/\.[a-z0-9]+$/i, '') + '.jpg', w: cw, h: ch, converted: true };
  } catch {
    return { blob: file, name: file.name || 'skjermbilde', w: 0, h: 0, converted: false };
  }
}

/** Leser skjermbildet. Kaster Error med .code, .canGemini og .status ved feil. */
export async function readShot(img, { engine = 'ollama' } = {}) {
  const fd = new FormData(); fd.append('image', img.blob, img.name);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  let res, data = null;
  try {
    res = await fetch(`/finans/api/subscriptions/from-screenshot${engine === 'gemini' ? '?engine=gemini' : ''}`, { method: 'POST', body: fd, signal: ctl.signal });
    data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  } catch (e) {
    clearTimeout(t);
    throw Object.assign(new Error(e.name === 'AbortError' ? 'Bildemodellen brukte for lang tid.' : 'Får ikke kontakt med serveren.'), { code: e.name === 'AbortError' ? 'timeout' : 'offline', canGemini: false });
  }
  clearTimeout(t);
  if (res.status === 401) { location.reload(); throw new Error('Logg inn på nytt'); }
  if (!res.ok) {
    const code = data?.code ?? (res.status === 404 ? 'old_server' : res.status === 504 ? 'timeout' : res.status === 502 || res.status === 503 ? 'ollama_down' : 'error');
    throw Object.assign(new Error(data?.error || `Feil ${res.status}`), { code, canGemini: !!data?.canGemini, status: res.status, install: data?.install });
  }
  const ok = data && String(data.tjeneste ?? data.service ?? '').trim() && Number(data.pris ?? data.price) > 0;
  if (!ok) throw Object.assign(new Error('Fant ikke et abonnement i bildet.'), { code: 'not_found', canGemini: !!data?.canGemini });
  return data;
}

/** Tekst og knapper per feilkode (tabellen i spec punkt 6). */
export function shotErr(err) {
  const c = err?.code;
  if (c === 'ollama_down') return { t: 'Får ikke kontakt med Ollama på hjemmeserveren.', b: ['retry', ...(err.canGemini !== false ? ['gemini'] : [])] };
  if (c === 'no_vision') return { t: 'Ingen bildemodell installert.', b: ['install', ...(err.canGemini ? ['gemini'] : [])] };
  if (c === 'timeout') return { t: 'Bildemodellen brukte for lang tid.', b: ['retry', ...(err.canGemini ? ['gemini'] : [])] };
  if (c === 'not_found') return { t: 'Fant ikke et abonnement i bildet.', b: ['manual'] };
  if (c === 'old_server') return { t: 'Serveren kan ikke lese skjermbilder ennå. Oppdater Homelab, eller skriv inn selv.', b: ['manual'] };
  if (c === 'no_gemini') return { t: err.message || 'Gemini er ikke satt opp.', b: ['retry', 'manual'] };
  return { t: err?.message || 'Kunne ikke lese skjermbildet.', b: ['retry', 'manual'] };
}
const BTN = { retry: 'Prøv igjen', gemini: 'Les med Gemini', install: 'Installer qwen2.5vl', manual: 'Skriv inn selv' };
/** Feilkortet: tekst + knapper (data-shot="retry|gemini|install|manual"). Første knapp er primær. */
export function errCardHtml(err, { admin = true, install = null } = {}) {
  const e = shotErr(err), btns = e.b.filter((b) => b !== 'install' || admin);
  const inst = install ? `<div class="s28-inst"><span>${esc(install.error ? `Installering feilet: ${install.error}` : install.done ? 'qwen2.5vl er installert ✓' : `Installerer qwen2.5vl … ${install.pct != null ? `${Math.round(install.pct)} %` : esc(install.status ?? '')}`)}</span>${install.done || install.error ? '' : `<span class="s28-bar"><i style="width:${Math.max(3, Math.round(install.pct ?? 0))}%"></i></span>`}</div>` : '';
  return `<div class="s28-err" role="alert"><b>${esc(e.t)}</b>${err?.code === 'no_vision' && !admin ? '<span class="s28-sm">Be en administrator installere qwen2.5vl.</span>' : ''}${e.b.includes('gemini') && btns.includes('gemini') ? '<span class="s28-sm">«Les med Gemini» sender bildet til Google.</span>' : ''}${inst}
    <div class="s28-btns">${btns.map((b, i) => `<button type="button" class="${i ? '' : 'pri'}" data-shot="${b}"${install && !install.done && !install.error && b === 'install' ? ' disabled' : ''}>${BTN[b]}</button>`).join('')}</div></div>`;
}

/** Installerer bildemodellen (admin). onP({status,pct,done,error}) kalles for hver SSE-melding. */
export async function installVision(onP) {
  const res = await fetch('/finans/api/ai/vision/install', { method: 'POST' });
  if (!res.ok) { let d = null; try { d = await res.json(); } catch {} throw Object.assign(new Error(d?.error || (res.status === 404 ? 'Serveren kan ikke installere modeller ennå.' : `Feil ${res.status}`)), { status: res.status }); }
  const rd = res.body.getReader(), dec = new TextDecoder();
  let buf = '', last = null;
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: *(.+)$/m.exec(chunk)?.[1]?.trim(), dl = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!dl) continue;
      let d; try { d = JSON.parse(dl); } catch { continue; }
      if (ev === 'done') { last = { ...last, done: true, error: d.error ?? (d.ok === false ? 'ukjent feil' : null), pct: 100 }; onP?.(last); return last; }
      last = d; onP?.(d);
    }
  }
  return { ...last, done: true };
}

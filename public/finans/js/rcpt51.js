// Prompt 51 (RCPTUI51): kvitteringsrettingen i klientene (web/PWA).
//   - merkelapp for kilden til butikknavnet: merchant_source/merchant_label fra serveren («fra org.nr.», «kjent butikk»,
//     «modellens forslag», «rettet av deg»)
//   - sammenleggbar «Rådata»-seksjon: OCR-motor, rader i mono, bildestørrelse (ocr_raw fra GET /finans/api/receipts/:id)
//     – så brukeren ser om feilen ligger i OCR-en eller i modellen
//   - learn51: rettet butikknavn (og ev. org.nr.) → POST /receipts/:id/merchant, så serveren lærer org.nr. → visningsnavn
// Feltnavnene står i $S/SERVER51-API.md (RCPTSRV51). Brukes av desktop.js (confirmPanel) og mobile-p23.js (Kvitteringer).
import { api, esc } from './core.js';

const SRC = { orgnr: 'fra org.nr.', known: 'kjent butikk', model: 'modellens forslag', user: 'rettet av deg' };
const WHY = {
  orgnr: 'Navnet er slått opp på org.nr. fra kvitteringen i den lokale kopien av Enhetsregisteret (eller navnet du har lært Glimt)',
  known: 'Kjent butikk fra tidligere kvitteringer (samme org.nr. eller lignende tekst øverst)',
  model: 'Modellens forslag – sjekk navnet',
  user: 'Du har skrevet eller rettet navnet selv',
};
const ENGINE = { mac_vision: 'Mac Vision', tesseract: 'Tesseract', ios_vision: 'iPhone (Vision)', android_mlkit: 'Android (ML Kit)' };

/** Kilden til butikknavnet: fra kvitteringen, ev. fra svaret på /receipts/scan som ligger ved (scan48). */
export const msrc51 = (R) => R?.merchant_source ?? R?.scan48?.merchant_source ?? null;
/** Merkelappen ved butikkfeltet – tom når serveren ikke oppgir kilden (eldre server/kvittering). */
export function srcTag51(R) {
  const s = msrc51(R);
  const label = R?.merchant_label ?? R?.scan48?.merchant_label ?? SRC[s] ?? null;
  if (!s && !label) return '';
  return `<span class="r51-src ${esc(s ?? '')}" data-r51-src="${esc(s ?? '')}" title="${esc(WHY[s] ?? '')}">${esc(label)}</span>`;
}

// Rådata hentet fra detaljen når listen ikke har dem med (id → ocr_raw | null).
const RAW = new Map();
const rawOf = (R) => (R?.ocr_raw !== undefined ? R.ocr_raw : RAW.has(R?.id) ? RAW.get(R.id) : undefined);
const sizeTxt = (s) => (Array.isArray(s) && s.length === 2 && s[0] && s[1] ? `${s[0]} × ${s[1]} px` : null);
const PRE = { rotated: 'rotert', perspective: 'perspektiv rettet', cropped: 'beskåret', upscaled: 'skalert opp' };

function rawBody(o) {
  if (o === undefined) return '<div class="r51-note">Henter rådata …</div>';
  if (!o) return '<div class="r51-note">Ingen OCR-rader er lagret for denne kvitteringen (eldre kvittering eller lest uten OCR).</div>';
  const rows = Array.isArray(o.rows) ? o.rows : [];
  const pre = o.preprocess && typeof o.preprocess === 'object' ? [...Object.keys(PRE).filter((k) => o.preprocess[k]).map((k) => PRE[k]), o.preprocess.from === 'scan' ? 'fra 1600 px-kopien' : o.preprocess.from === 'original' ? 'fra originalen' : ''].filter(Boolean) : [];
  const facts = [
    ['OCR-motor', o.engine_label ?? ENGINE[o.engine] ?? o.engine ?? 'ukjent'],
    ['Bildestørrelse', sizeTxt(o.image_size) ?? 'ukjent'],
    ...(o.ms ? [['Tid', o.ms < 1000 ? `${o.ms} ms` : `${(o.ms / 1000).toFixed(1).replace('.', ',')} s`]] : []),
    ...(pre.length ? [['Forbehandling', pre.join(', ')]] : []),
    ['Rader', String(rows.length)],
  ];
  return `<dl class="r51-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${rows.length ? `<pre class="r51-rows" data-r51-rows>${rows.map((r, i) => `<span class="r51-n">${String(i + 1).padStart(3, ' ')}</span> ${esc(r)}`).join('\n')}</pre>` : '<div class="r51-note">OCR-en fant ingen tekst.</div>'}
    <div class="r51-note">Står teksten riktig her, men feltene over er feil, ligger feilen i modellen. Mangler eller er teksten feil, ligger den i OCR-en.</div>`;
}

/** «Rådata»-seksjonen (lukket som standard). Tom uten bilde eller når serveren sier ocr_raw: null; uten feltet hentes detaljen ved åpning. */
export function raw51(R) {
  if (!R?.id || R.hasFile === false) return '';
  const o = rawOf(R);
  if (o === null) return ''; // serveren har ingen OCR-rader for kvitteringen (eldre kvittering)
  const n = Array.isArray(o?.rows) ? ` · ${o.rows.length} rader` : '';
  const eng = o ? ` · ${esc(o.engine_label ?? ENGINE[o.engine] ?? o.engine ?? '')}` : '';
  return `<details class="r51-raw" data-r51-raw="${esc(R.id)}"${OPEN.has(R.id) ? ' open' : ''}><summary>Rådata${eng}${n}</summary><div class="r51-body">${OPEN.has(R.id) ? rawBody(o) : ''}</div></details>`;
}
const OPEN = new Set();

// Klikk på «Rådata» styres her (ikke av nettleserens toggle): vertene tegner skjemaet på nytt ved klikk, og da ville
// <details> miste åpen-tilstanden. OPEN husker hvilke som er åpne mellom tegningene.
async function onClick(e) {
  const sum = e.target.closest?.('[data-r51-raw] > summary');
  if (!sum) return;
  e.preventDefault(); e.stopPropagation();
  const d = sum.parentElement, id = d.getAttribute('data-r51-raw');
  if (OPEN.has(id)) { OPEN.delete(id); d.open = false; return; }
  OPEN.add(id); d.open = true;
  const body = d.querySelector('.r51-body');
  const R = findR(id);
  let o = R ? rawOf(R) : RAW.get(id);
  if (body) body.innerHTML = rawBody(o);
  if (o !== undefined) return;
  try { const full = await api(`/receipts/${encodeURIComponent(id)}`); o = full?.ocr_raw ?? null; } catch { o = null; }
  RAW.set(id, o);
  const now = document.querySelector(`[data-r51-raw="${CSS.escape(id)}"] .r51-body`);
  if (now) now.innerHTML = rawBody(o);
}
let finder = () => null;
const findR = (id) => finder(id);

let bound = false;
/** find(id) → kvitteringen i vertens tilstand (S.receipts). */
export function bind51(find) {
  if (find) finder = find;
  if (bound) return; bound = true;
  if (!document.getElementById('r51-css')) { const l = document.createElement('link'); l.id = 'r51-css'; l.rel = 'stylesheet'; l.href = `/assets/css/receipts51.css${new URL(import.meta.url).search}`; document.head.appendChild(l); }
  document.addEventListener('click', onClick, true);
}

/**
 * Rettet butikknavn → serveren lærer org.nr. → visningsnavn (POST /receipts/:id/merchant). org = rettet org.nr. (valgfritt).
 * → receiptOut når serveren tok imot, ellers null (eldre server 404/405 – PATCH merchant lærer også). Kaster ved andre feil.
 */
export async function learn51(id, merchant, org = null) {
  const m = String(merchant ?? '').trim();
  if (!id || !m) return null;
  const digits = String(org ?? '').replace(/\D/g, '');
  try {
    const r = await api(`/receipts/${encodeURIComponent(id)}/merchant`, { method: 'POST', json: { merchant: m, ...(digits.length === 9 ? { org_number: digits } : {}) } });
    return r?.receipt ?? { id, merchant: m, merchant_source: 'user', merchant_label: SRC.user };
  } catch (e) {
    if (e.status === 404 || e.status === 405) return null;
    throw e;
  }
}
export const _raw51 = RAW;

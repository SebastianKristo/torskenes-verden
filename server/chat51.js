// Prompt 51 (RCPTSRV51), Del B 5: bilder i Glimt-chatten.
//   - Aldri bilder til en modell uten bildestøtte. Evnene leses fra Ollama /api/show (capabilities inneholder «vision») og bufres
//     (chat_model_caps50) – også for Ollama-modeller som listes via Open WebUI (der Open WebUI ellers sier vision:true for alle).
//   - Vei per bilde:
//       receipt  – kvittering: kvitteringskjeden (OCR → qwen3:8b), svaret formatert slik brukeren ba om (tabell som standard)
//       document – faktura, vitnemål, brev, skjema og annet med mye tekst: OCR-rader (Mac Vision / Tesseract på originalen) →
//                  tekstmodellen (valgt lokal tekstmodell, ellers qwen3:8b) med brukerens instruks
//       vision   – vanlig foto: visjonsmodellen (qwen2.5vl:7b først), lastet ved behov
//       model    – valgt modell ser bildet selv
//   - Avviser modellen bildet likevel («does not support multimodal»), byttes vei automatisk og evnen lagres som «ingen vision».
//   - Feil fra Ollama vises aldri rått: friendlyError51 gir en norsk tekst.
import { readFile } from 'node:fs/promises';
import { db } from './db.js';
import { toJpeg50 } from './img50.js';

const q = (sql) => db.prepare(sql);
export const VISION_PREFERRED51 = ['qwen2.5vl:7b', 'qwen2.5vl', 'qwen2.5vl:latest'];

const DOC_RE = /\b(faktura\w*|regning\w*|vitnem[åa]l\w*|karakterutskrift\w*|attest\w*|dokument\w*|brev(?:et)?|skjema\w*|kontrakt\w*|avtale\w*|l[øo]nnsslipp\w*|kontoutskrift\w*|skattemelding\w*|resept\w*|billett\w*|invoice|document|les (?:teksten|av)|skriv av|transkriber\w*|ocr)\b/i;
const PHOTO_RE = /\b(hva er (?:dette|det her)|hva ser du|beskriv\w*|foto\w*|bilde av|hvilken (?:plante|fugl|blomst|bil|rase|art)|plante\w*|blomst\w*|dyr(?:et)?|hund(?:en)?|katt(?:en)?|utsikt\w*|landskap\w*|selfie|hvem er|hvor er dette)\b/i;

/** Brukerens tekst → 'document' | 'photo' | null (ukjent). Kvitteringer håndteres av RECEIPT_RE50 før dette. */
export function imageIntent51(text) {
  const t = String(text ?? '');
  if (DOC_RE.test(t)) return 'document';
  if (PHOTO_RE.test(t)) return 'photo';
  return null;
}

/** Ser OCR-resultatet ut som et dokument (mye tekst)? */
export function looksLikeDocument51(ocr) {
  const rows = (ocr?.rows ?? []).filter((r) => /\p{L}{2,}/u.test(r));
  const words = rows.join(' ').split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;
  return rows.length >= 6 && words >= 25;
}

/** Ønsket format for kvitteringen i chatten. */
export function wantedFormat51(text) {
  const t = String(text ?? '').toLowerCase();
  if (/\bjson\b/.test(t)) return 'json';
  if (/\bcsv\b/.test(t)) return 'csv';
  if (/\b(punktliste|liste|punkter|kulepunkt)/.test(t) && !/tabell/.test(t)) return 'list';
  return 'table';
}
const kr = (v) => (v == null ? '–' : `${Number(v).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`);
/** Kvitteringen i formatet brukeren ba om (tabell er receiptTable50 i chat50.js). → markdown | null (tabell). */
export function formatReceipt51(rc, fmt) {
  const items = rc?.items ?? [];
  if (fmt === 'json') return `\`\`\`json\n${JSON.stringify({ butikk: rc?.merchant ?? null, org_nr: rc?.org_number ?? null, dato: rc?.date ?? null, varer: items.map((l) => ({ vare: l.description, antall: l.quantity ?? null, pris: l.amount })), rabatter: (rc?.discounts ?? []).map((d) => ({ tekst: d.description, belop: d.amount })), total: rc?.total ?? null }, null, 2)}\n\`\`\``;
  if (fmt === 'csv') return `\`\`\`csv\nVare;Antall;Pris\n${items.map((l) => `"${String(l.description ?? '').replace(/"/g, '""')}";${l.quantity ?? 1};${String(l.amount ?? '').replace('.', ',')}`).join('\n')}\nTotalt;;${String(rc?.total ?? '').replace('.', ',')}\n\`\`\``;
  if (fmt === 'list') return [`**${rc?.merchant || 'Kvittering'}**${rc?.date ? ` · ${rc.date.split('-').reverse().join('.')}` : ''}`, '', ...items.map((l) => `- ${l.description}${l.quantity != null && l.quantity !== 1 ? ` (${String(l.quantity).replace('.', ',')})` : ''}: ${kr(l.amount)}`), ...(rc?.discounts ?? []).map((d) => `- ${d.description || 'Rabatt'}: ${kr(d.amount)}`), `- **Totalt: ${kr(rc?.total)}**`].join('\n');
  return null;
}

/** OCR-radene som tekst modellen får (aldri bildet). */
export function documentNote51(ocr, engine) {
  const rows = (ocr?.rows ?? []).slice(0, 400);
  const name = engine === 'mac_vision' ? 'Mac Vision' : 'Tesseract';
  return `[Tekst fra bildet, lest med OCR (${name}), ${rows.length} rader – én rad per linje, kan ha små lesefeil:\n${rows.join('\n').slice(0, 14_000)}\n]\n`
    + 'Svar ut fra teksten over, og formater svaret slik brukeren ba om (f.eks. tabell). Ikke finn på tekst, tall eller navn som ikke står der. Du ser ikke selve bildet, bare teksten.';
}

/** Leser teksten i bildefilene (chat-vedlegg) med OCR-kjeden. → {ok, ocr, engine, error?} */
export async function readDocument51(rows, { signal = null, log = () => {} } = {}) {
  const { bestOcr51 } = await import('./receipts48/chain.js');
  const all = [];
  let engine = null, err = null, size = null;
  for (const r of rows.slice(0, 4)) {
    let buf;
    try { buf = await readFile(r.path); } catch { err = 'Fant ikke bildet'; continue; }
    const small = /heic|heif/.test(r.mime ?? '') ? await toJpeg50(buf, 2048).catch(() => null) : null;
    const o = await bestOcr51(buf, r.mime, { smallImage: small?.buf ?? null, signal, log });
    if (o.ocr) { all.push(...o.ocr.rows); engine ??= o.engine; size ??= o.ocr.image_size ?? null; } else err = o.error;
  }
  return all.length ? { ok: true, ocr: { rows: all, image_size: size }, engine } : { ok: false, ocr: null, engine: null, error: err ?? 'Fant ingen tekst i bildet' };
}

/** Visjonsmodellen for vanlige foto: qwen2.5vl:7b når den er installert, ellers beste lokale vision-modell. */
export function visionModel51(models, rankBest) {
  const local = models.filter((m) => m.kind === 'lokal' && m.vision && m.installed !== false);
  for (const id of VISION_PREFERRED51) { const hit = local.find((m) => m.id === id || m.id.replace(/:latest$/, '') === id); if (hit) return hit; }
  return rankBest?.() ?? local[0] ?? null;
}

/** Tekstmodellen for dokumenter: valgt modell når den er en lokal tekstmodell (eller sky uten sperre), ellers qwen3:8b. */
export function textModel51(m, models, { blocked = false, fallbackId = 'qwen3:8b' } = {}) {
  if (m.kind === 'lokal' && !m.vision) return m;
  if (m.kind === 'sky' && !blocked) return m;
  const hit = models.find((x) => x.kind === 'lokal' && x.installed !== false && (x.id === fallbackId || x.id === `${fallbackId}:latest`))
    ?? models.find((x) => x.kind === 'lokal' && x.installed !== false && !x.vision);
  return hit ?? m;
}

/** Feilen fra Ollama/Open WebUI betyr at modellen ikke tar imot bilder. */
export const isMultimodalError51 = (e) => /multimodal|does not support (?:images|vision|image input)|image input is not supported|vision is not supported|images? (?:are|is) not supported/i.test(String(e?.message ?? e ?? ''));

/** Lagrer at modellen ikke ser bilder (så samme feil ikke skjer igjen). */
export function markNoVision51(model, base = null) {
  try {
    q('INSERT INTO chat_model_caps50(model, base, vision, caps, checked) VALUES(?,?,0,?,?) ON CONFLICT(model) DO UPDATE SET vision=0, checked=excluded.checked')
      .run(String(model), base, JSON.stringify(['completion']), Date.now());
  } catch { /* tabellen lages av chat50.js */ }
}

/**
 * Norsk feiltekst for chatten – aldri rå Ollama-feil. Meldinger som allerede er norske og ikke rå (tidsfrist, kan ikke nås, avbrutt)
 * beholdes.
 */
export function friendlyError51(msg) {
  const s = String(msg ?? '');
  if (isMultimodalError51(s)) return 'Modellen kan ikke se bilder, og en annen vei lyktes ikke. Prøv igjen, eller velg en modell som ser bilder.';
  const m = s.match(/^(Ollama|Open WebUI)(?: svarte)? (\d{3})\b(?::\s*(.*))?$/s);
  if (m) {
    const [, who, code, detail = ''] = m;
    if (/model .*not found|not found, try pulling|pull model/i.test(detail)) return `Modellen er ikke installert i ${who === 'Ollama' ? 'Ollama' : 'Open WebUI'}. Installer den under AI-kontroll, eller velg en annen modell.`;
    if (/context|too long|num_ctx|exceeds/i.test(detail)) return 'Samtalen ble for lang for modellen. Start en ny samtale, eller korte ned meldingen.';
    if (/out of memory|cuda|memory|insufficient/i.test(detail)) return 'Maskinen har ikke nok minne til modellen akkurat nå. Prøv igjen om litt, eller velg en mindre modell.';
    if (code === '401' || code === '403') return `${who} avviste forespørselen (${code}: sjekk nøkkelen under Innstillinger → AI).`;
    if (+code >= 500) return `Den lokale modellen svarte med en feil (${code}). Prøv igjen om litt.`;
    return `Modellen kunne ikke svare på denne meldingen (feil ${code}). Prøv igjen, eller velg en annen modell.`;
  }
  if (/^(Ollama|Open WebUI): /.test(s)) return 'Modellen kunne ikke svare på denne meldingen. Prøv igjen, eller velg en annen modell.';
  return s;
}

/** Ollama-modeller listet via Open WebUI: vision bare fra /api/show (bufret) eller navnet – ikke Open WebUIs standard «vision: true». */
export async function owuiVision51(list, base, F, visionCaps) {
  const local = list.filter((m) => m.provider === 'ollama');
  if (local.length && base) await visionCaps(local, base, F);
  return list;
}

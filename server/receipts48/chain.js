// Prompt 48 (SERVER48): kjeden på serveren. All validering skjer her, også for resultater laget på mobilen.
//   A  device_parse består validering?                    → bruk den
//   B  device_ocr finnes?                                 → qwen3:8b på radene → valider (ett nytt forsøk med feilbeskrivelse)
//   C  Mac Vision OCR på bildet                           → qwen3:8b → valider (ett nytt forsøk)
//   T  Tesseract (tsv) når Mac-OCR er av/utilgjengelig    → qwen3:8b → valider (ett nytt forsøk)
//   (D  Gemini er fjernet i prompt 52: kvitteringer leses bare lokalt, også når sperren er av)
//   V  Prompt 55: INGEN OCR tilgjengelig (Mac-OCR nede/mangler nøkkel OG Tesseract mangler/av) → visjonsmodellen (ruten «rc»,
//      qwen2.5vl:7b) med SAMME schema og SAMME validering, merket «lest med visjonsmodell (ingen OCR)», sikkerhet maks middels.
//      Visjonsmodellen er aldri eneste kilde når OCR finnes: ga OCR tekst (eller finnes Tesseract), brukes ikke V.
// Hvert steg kan slås av (settings.receipts48). Finnes både device-OCR og Mac-OCR, sammenlignes totalen: avvik → resultatet
// som består sumsjekken brukes, ellers merkes totalen som usikker. Består ingen, brukes det beste forsøket (færrest feil).
import { checkOcr48, modelFormat48 } from './schema.js';
import { normalizeOcr48, ocrText48 } from './normalize.js';
import { validateReceipt48, score48, totalCandidates48 } from './validate.js';
import { r48Settings, macOcrKey48 } from './settings.js';
import { parseRows48 } from './engines/llm.js';
import { macOcr48 } from './engines/mac-vision.js';
import { tesseractOcr48 } from './engines/tesseract.js';
import { macHealth48 } from './engines/mac-vision.js';
import { resolveMerchant51 } from './brreg51.js'; // prompt 51: butikknavn via org.nr. → kjent butikk → modellen

export const STEP_NAMES48 = { A: 'Tolket på enheten', B: 'Enhetens OCR + lokal modell', C: 'Mac Vision + lokal modell', T: 'Tesseract + lokal modell', V: 'Visjonsmodell (ingen OCR)' };
export const VISION_LABEL55 = 'visjonsmodell (ingen OCR)';
let visionImpl55 = null;
/** Bare for tester: ({image, mime, prompt, system, schema, feedback}) → {data, model}. */
export const _setReceiptVision55 = (fn) => { visionImpl55 = fn ?? null; };
const VISION_SYSTEM55 = `Du leser BILDET av en norsk kvittering og gjør det om til JSON etter skjemaet. Det finnes ingen OCR-tekst – les selv, linje for linje.
Regler:
- Hver varelinje er én post i items (description slik den står, amount = linjens sum). Hopp aldri over en linje. Pant og tips er egne varelinjer.
- Rabatter er egne poster i discounts med NEGATIVT beløp. Ikke regn ut noe selv. Ikke finn på varer, beløp eller datoer. Ukjent felt = null (lister = []).
- Beløp i kroner som tall med punktum som desimalskille (1299.00). total = beløpet ved TOTAL / Å BETALE / SUM / BETALT.
- date = kjøpsdatoen som ÅÅÅÅ-MM-DD. time = TT:MM. org_number = bare sifre. vat = mva per sats (25, 15 eller 12) slik det står.
- category_suggestion = én kategori fra listen brukeren gir.`;
/** Visjonsmodellen via ai-run (ruten «rc», bare lokalt). → {data, model} */
async function visionParse55({ image, mime, categories, feedback, signal }) {
  const prompt = `Kategorier: ${categories.length ? categories.join(', ') : 'Mat og dagligvarer, Restaurant og kafé, Transport og lading, Bolig, Hjem, Fritid og hobby, Abonnementer, Skole, Annet'}\n\nLes kvitteringen i bildet.${feedback ? `\n\n${feedback}` : ''}`;
  if (visionImpl55) return visionImpl55({ image, mime, prompt, system: VISION_SYSTEM55, schema: modelFormat48(), feedback });
  const { run: aiRun } = await import('../ai-run.js');
  const out = await aiRun('rc', { images: [image], system: VISION_SYSTEM55, prompt, schema: modelFormat48(), localOnly: true, temperature: 0, numCtx: 8192, numPredict: 3072, title: 'Kvittering · visjonsmodell (ingen OCR)', signal });
  return { data: out.data ?? JSON.parse(String(out.text ?? '').match(/\{[\s\S]*\}/)?.[0] ?? 'null'), model: out.model };
}
export const DEVICE_OCR_SOURCES48 = ['ios_vision', 'android_mlkit'];
// Mac-OCR som ikke svarte, hoppes over i 2 minutter (så hver kvittering ikke venter på samme tidsavbrudd).
// Prompt 51: før bildet sendes, sjekkes /health med kort tidsavbrudd (1,5 s) – svarer ikke verten, merkes Mac-OCR som nede i 5 min
// i stedet for å vente 30 s på /ocr. Et vellykket helsesvar huskes i 60 s.
const macDown = { until: 0, why: null, okAt: 0 };
export const MAC_PROBE_MS51 = 1500;
export const _resetChain48 = () => { macDown.until = 0; macDown.why = null; macDown.okAt = 0; };
/** Status for Mac-OCR slik kjeden ser den: {down_until, last_error}. */
/** Helsesvaret → samme feiltekst som /ocr ville gitt (uten nøkkelen). */
const probeErr51 = (h, url) => (h.status === 401 || h.status === 403 ? `Mac-OCR avviste forespørselen (${h.status}: ${h.status === 401 ? 'feil nøkkel' : 'serverens IP-adresse er ikke på tillatelseslista'})`
  : h.configured === false ? (h.error === 'Nøkkelen er ikke satt' ? 'Mac-OCR-nøkkelen er ikke satt (Innstillinger → AI → Mac-OCR)' : 'Mac-OCR-adressen er ikke satt')
  : /Svarte ikke innen/.test(h.error ?? '') ? `Mac-OCR svarte ikke innen ${MAC_PROBE_MS51 / 1000} s (helsesjekk)`
  : h.status ? `Mac-OCR svarte ${h.status} på helsesjekken` : `Mac-OCR kan ikke nås på ${url} (${String(h.error ?? '').replace(/^Kan ikke nås \(|\)$/g, '')})`);
export const macState51 = () => ({ down_until: macDown.until > Date.now() ? new Date(macDown.until).toISOString() : null, last_error: macDown.why });
const sameTotal = (a, b) => a != null && b != null && Math.abs(a - b) < 0.005;

/** Device-OCR fra klienten → {ocr} | {error}. Godtar prompt 47-kildene (android-mlkit/ios-vision). */
export function deviceOcr48(x) {
  const ocr = normalizeOcr48(x);
  const errors = checkOcr48(ocr);
  if (errors.length) return { error: `device_ocr følger ikke OCR-formatet: ${errors.slice(0, 3).join('; ')}`, errors };
  if (!DEVICE_OCR_SOURCES48.includes(ocr.source)) return { error: `device_ocr.source må være ${DEVICE_OCR_SOURCES48.join(' eller ')}` };
  if (!ocr.rows.length && !ocr.full_text.trim()) return { error: 'device_ocr inneholder ingen tekst' };
  return { ocr };
}

/**
 * Kjører kjeden. → {receipt, confidence, failed_fields, uncertain_fields, errors, warnings, pipeline[], used, engine, provider,
 *   model, label, ocr (beste OCR), compare, seconds}
 */
export async function runChain48({ image, mime, smallImage = null, deviceOcr = null, deviceParse = null, client = null, categories = [], log = () => {}, signal = null, user = null, receiptId = null }) {
  const cfg = r48Settings();
  const t00 = Date.now();
  // Prompt 51: Tesseract og Mac-OCR leser ORIGINALEN (forbehandlet, aldri under 2000 px). Den nedskalerte kopien er bare reserve når
  // originalen ikke kan leses (HEIC uten libheif).
  const pipeline = [], cands = [];
  let modelDown = null, macOcr = null, macErr = null, tessOcr = null, passed = null, tessMissing = !cfg.tesseract ? 'Tesseract er slått av' : null;
  const entry = (step, extra = {}) => { const e = { step, name: STEP_NAMES48[step], status: 'skipped', ms: 0, ...extra }; pipeline.push(e); return e; };
  const skip = (step, reason) => { entry(step, { reason }); log(`steg-${step}`, `hoppet over: ${reason}`); };

  // Modellsteget for B, C og T: rows → qwen3:8b → valider, ett nytt forsøk med feilbeskrivelsen.
  async function modelStep(step, ocr, engine) {
    const e = entry(step, { engine, model: cfg.textModel, status: 'failed', attempts: [], ...(ocr?.ms != null ? { ocr_ms: ocr.ms } : {}) });
    if (modelDown) { Object.assign(e, { status: 'skipped', reason: `lokal modell utilgjengelig (${modelDown})` }); log(`steg-${step}`, e.reason); return null; }
    const rows = ocr.rows?.length ? ocr.rows : String(ocr.full_text ?? '').split('\n').filter((r) => r.trim());
    const text = ocrText48(ocr);
    let feedback = null;
    const t0 = Date.now();
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ta = Date.now();
      try {
        const r = await parseRows48(rows, { categories, feedback, model: cfg.textModel, base: cfg.ollamaUrl, timeoutS: cfg.modelTimeoutS, signal });
        if (r.numCtx) Object.assign(e, { num_ctx: r.numCtx, prompt_tokens_est: r.promptEst, rows_sent: r.rowsSent });
        const v = validateReceipt48(r.data, { ocrText: text, categories });
        e.attempts.push({ attempt, ms: Date.now() - ta, confidence: v.confidence, failed_fields: v.failed_fields });
        cands.push({ step, v, ocr, engine, model: r.model, provider: 'ollama', order: cands.length });
        log(`steg-${step}`, `${engine} + ${r.model}${attempt > 1 ? ' (nytt forsøk)' : ''} · ${v.ok ? 'besto kontrollen' : `feilet: ${v.failed_fields.join(', ')}`} · ${Date.now() - ta} ms`);
        if (v.ok) { Object.assign(e, { status: 'ok', ms: Date.now() - t0, confidence: v.confidence }); return v; }
        feedback = v.feedback;
        Object.assign(e, { failed_fields: v.failed_fields, confidence: v.confidence });
      } catch (err) {
        e.attempts.push({ attempt, ms: Date.now() - ta, error: err.message });
        log(`steg-${step}`, `${engine} + ${cfg.textModel}: ${err.message}`);
        if (signal?.aborted) throw err;
        Object.assign(e, { status: 'error', error: err.message });
        // Ugyldig JSON: ett nytt forsøk med beskjed. Ellers (nede, tidsavbrudd, HTTP-feil) hoppes modellstegene over videre.
        if (!err.badJson) { modelDown = err.message; break; }
        feedback = 'Forrige svar var ikke gyldig JSON. Svar bare med ett JSON-objekt etter skjemaet.';
      }
    }
    e.ms = Date.now() - t0;
    return null;
  }

  // A: ferdig tolket på enheten (forslag – valideres her).
  const devText = deviceOcr ? ocrText48(deviceOcr) : '';
  if (!deviceParse) skip('A', 'ingen device_parse');
  else if (!cfg.deviceParse) skip('A', 'slått av i innstillingene');
  else {
    const t0 = Date.now();
    const v = validateReceipt48(deviceParse, { ocrText: devText, categories });
    const e = entry('A', { engine: client?.platform === 'android' ? 'android' : 'ios_fm', status: v.ok ? 'ok' : 'failed', ms: Date.now() - t0, confidence: v.confidence, failed_fields: v.failed_fields });
    cands.push({ step: 'A', v, ocr: deviceOcr, engine: e.engine, model: client?.platform === 'android' ? 'Android (på enheten)' : 'Apple Intelligence (på enheten)', provider: client?.platform === 'ios' || !client?.platform ? 'apple-fm' : 'device', order: cands.length });
    log('steg-A', v.ok ? 'device_parse besto kontrollen' : `device_parse feilet: ${v.failed_fields.join(', ')}`);
    if (v.ok) passed = 'A';
  }

  // B: device-OCR + lokal modell.
  if (!passed) {
    if (!deviceOcr) skip('B', 'ingen device_ocr');
    else if (!cfg.deviceOcr) skip('B', 'slått av i innstillingene');
    else if (await modelStep('B', deviceOcr, deviceOcr.source)) passed = 'B';
  }

  // C: Mac Vision OCR + lokal modell. Etter en godkjent B leses bildet likevel med Mac-OCR (uten modell) for å sammenligne totalen.
  const wantMac = cfg.macOcr && image && (!passed || (passed === 'B' && cfg.compareMac));
  if (!cfg.macOcr) skip('C', 'slått av i innstillingene');
  else if (!image) skip('C', 'ingen bilde');
  else if (passed && !wantMac) skip('C', `ikke nødvendig (steg ${passed} besto)`);
  else if (macDown.until > Date.now()) { macErr = macDown.why; skip('C', `Mac-OCR utilgjengelig (${macDown.why})`); }
  else {
    const t0 = Date.now();
    // Prompt 51: rask helsesjekk før bildet sendes (ikke 30 s venting når verten er nede).
    if (Date.now() - macDown.okAt > 60_000) {
      const h = await macHealth48({ url: cfg.macOcrUrl, key: macOcrKey48(), timeoutMs: MAC_PROBE_MS51 });
      if (h.ok) macDown.okAt = Date.now();
      else if (h.configured === false || !h.status || h.status >= 500 || h.status === 401 || h.status === 403) {
        macErr = probeErr51(h, cfg.macOcrUrl);
        Object.assign(macDown, { until: Date.now() + 5 * 60_000, why: macErr });
        log('mac-ocr', `utilgjengelig: ${macErr} · prøver igjen om 5 min`);
      }
    }
    if (macErr) entry('C', { status: 'unavailable', engine: 'mac_vision', ms: Date.now() - t0, error: macErr });
    else try {
      macOcr = await macOcr48(image, mime, { url: cfg.macOcrUrl, key: macOcrKey48(), timeoutS: passed ? Math.min(10, cfg.macOcrTimeoutS) : cfg.macOcrTimeoutS, signal });
      log('mac-ocr', `${macOcr.rows.length} rader · ${macOcr.ms ?? Date.now() - t0} ms`);
    } catch (e) {
      macErr = e.message;
      if (e.unavailable) Object.assign(macDown, { until: Date.now() + 2 * 60_000, why: e.message, okAt: 0 });
      log('mac-ocr', `utilgjengelig: ${e.message}`);
    }
    if (macErr && !pipeline.some((p) => p.step === 'C')) entry('C', { status: 'unavailable', engine: 'mac_vision', ms: Date.now() - t0, error: macErr });
    else if (!macOcr) { /* allerede registrert */ }
    else if (passed) entry('C', { status: 'compare', engine: 'mac_vision', ocr_ms: macOcr.ms ?? Date.now() - t0, ms: Date.now() - t0, reason: 'bare OCR for å sammenligne totalen' });
    else if (await modelStep('C', macOcr, 'mac_vision')) passed = 'C';
  }

  // T: Tesseract + lokal modell, bare når Mac-OCR ikke ga tekst.
  if (!passed) {
    if (macOcr) skip('T', 'Mac-OCR ga tekst');
    else if (!cfg.tesseract) skip('T', 'slått av i innstillingene');
    else if (!image) skip('T', 'ingen bilde');
    else {
      const t0 = Date.now();
      try {
        tessOcr = await tesseractOcr48(image, mime, { fallback: smallImage ? { buf: smallImage, mime: 'image/jpeg' } : null });
        const pp = tessOcr.preprocess;
        log('tesseract', `${tessOcr.rows.length} rader · ${tessOcr.ms} ms${tessOcr.image_size ? ` · ${tessOcr.image_size.join('×')} px` : ''}${pp ? ` · ${[pp.from === 'scan' ? 'fra 1600 px-kopien' : 'original', pp.rotated && 'rotert', pp.perspective && 'perspektiv rettet', pp.cropped && 'beskåret', pp.upscaled && 'skalert opp'].filter(Boolean).join(', ')}` : ''}`);
      }
      catch (e) { entry('T', { status: 'unavailable', engine: 'tesseract', ms: Date.now() - t0, error: e.message }); log('tesseract', `utilgjengelig: ${e.message}`); if (e.missing) tessMissing = e.message; }
      if (tessOcr && await modelStep('T', tessOcr, 'tesseract')) passed = 'T';
    }
  }

  // V (prompt 55): ingen OCR i det hele tatt (Mac-OCR utilgjengelig/av og Tesseract mangler/av, ingen device-OCR) → visjonsmodellen
  // med samme schema og validering. Finnes OCR (også når den ikke ga et godkjent resultat), brukes ikke visjonsmodellen.
  const noOcr55 = !passed && !!image && !deviceOcr && !macOcr && !tessOcr && (!cfg.macOcr || !!macErr) && !!tessMissing && !/pdf/i.test(String(mime ?? ''));
  let visionUsed = false;
  if (noOcr55) {
    const why = [cfg.macOcr ? macErr : 'Mac-OCR er slått av', tessMissing].filter(Boolean).join(' · ');
    const e = entry('V', { engine: 'vision', status: 'failed', attempts: [], reason: `ingen OCR: ${why}` });
    log('steg-V', `ingen OCR (${why}) · leser bildet med visjonsmodellen`);
    let feedback = null;
    const t0 = Date.now();
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ta = Date.now();
      try {
        const r = await visionParse55({ image, mime, categories, feedback, signal });
        const v = validateReceipt48(r.data, { ocrText: '', categories });
        e.model = r.model ?? null;
        e.attempts.push({ attempt, ms: Date.now() - ta, confidence: v.confidence, failed_fields: v.failed_fields });
        cands.push({ step: 'V', v, ocr: null, engine: 'vision', model: r.model ?? null, provider: 'ollama', order: cands.length });
        visionUsed = true;
        log('steg-V', `${r.model ?? 'visjonsmodell'}${attempt > 1 ? ' (nytt forsøk)' : ''} · ${v.ok ? 'besto kontrollen' : `feilet: ${v.failed_fields.join(', ')}`} · ${Date.now() - ta} ms`);
        if (v.ok) { Object.assign(e, { status: 'ok', ms: Date.now() - t0, confidence: v.confidence }); passed = 'V'; break; }
        feedback = v.feedback;
        Object.assign(e, { failed_fields: v.failed_fields, confidence: v.confidence });
      } catch (err) {
        e.attempts.push({ attempt, ms: Date.now() - ta, error: err.message });
        Object.assign(e, { status: 'error', error: err.message });
        log('steg-V', `visjonsmodellen: ${err.message}`);
        if (signal?.aborted) throw err;
        if (!/JSON/i.test(err.message)) break;
        feedback = 'Forrige svar var ikke gyldig JSON. Svar bare med ett JSON-objekt etter skjemaet.';
      }
    }
    e.ms = Date.now() - t0;
  }

  // Beste OCR-tekst så langt (til lagring): Mac, så enheten, så Tesseract.
  const bestOcr = macOcr ?? deviceOcr ?? tessOcr ?? null;

  // Prompt 52 (SRV52): steg D (Gemini) er fjernet. Kvitteringer leses bare lokalt – ingen sky-reserve, uansett innstilling.
  // Består ingen av de lokale stegene, brukes beste forsøk, og kvitteringen kan leses på nytt (kø/prøv igjen).

  // Valg: første som besto, ellers beste forsøk (færrest alvorlige feil, så færrest feil, så sumsjekk, så senest).
  let pick = passed ? cands.find((c) => c.step === passed && c.v.ok) : [...cands].sort((a, b) => score48(a.v) - score48(b.v) || (b.v.checks?.sumOk ? 1 : 0) - (a.v.checks?.sumOk ? 1 : 0) || b.order - a.order)[0] ?? null;

  // Totalen fra device-OCR mot Mac-OCR.
  let compare = null;
  const uncertainExtra = [];
  if (deviceOcr && macOcr) {
    const candB = [...cands].reverse().find((c) => c.step === 'B'), candC = [...cands].reverse().find((c) => c.step === 'C');
    const devTotals = totalCandidates48(devText), macTotals = totalCandidates48(ocrText48(macOcr));
    const device = candB?.v.receipt?.total ?? devTotals[0] ?? null, mac = candC?.v.receipt?.total ?? (pick && macTotals.some((t) => sameTotal(t, pick.v.receipt?.total)) ? pick.v.receipt.total : macTotals[0] ?? null);
    const agree = device == null || mac == null ? null : sameTotal(device, mac);
    compare = { device, mac, agree, chosen: null };
    if (agree === false) {
      const okB = !!candB?.v.checks?.sumOk, okC = !!candC?.v.checks?.sumOk;
      if (okB && !okC) pick = candB; else if (okC && !okB) pick = candC;
      else if (okB && okC) uncertainExtra.push('total');
      else if (!pick?.v.checks?.sumOk) uncertainExtra.push('total');
      compare.chosen = pick?.step === 'B' ? 'device' : pick?.step === 'C' ? 'mac' : null;
      log('sammenligning', `totalen avviker: enheten ${device} kr, Mac ${mac} kr · ${uncertainExtra.length ? 'merket som usikker' : `bruker ${compare.chosen === 'mac' ? 'Mac' : 'enheten'} (består sumsjekken)`}`);
    }
  }

  let v = pick?.v ?? null;
  // Prompt 51 (Del C): butikknavnet – org.nr. i OCR-teksten (lokal kopi av Enhetsregisteret / lært navn) → kjent butikk → modellen.
  let merchant51 = null;
  const ocrUsed = pick?.ocr ?? bestOcr;
  if (v?.receipt) {
    try {
      const m = resolveMerchant51({ user, receipt: v.receipt, ocrText: ocrUsed ? ocrText48(ocrUsed) : '', receiptId });
      merchant51 = { source: m.merchant_source, org_number: m.org_number, detail: m.detail, model_merchant: m.model_merchant };
      if (m.merchant && m.merchant !== v.receipt.merchant) log('butikk', `${m.merchant} (${m.merchant_source}${m.detail ? `/${m.detail}` : ''}) i stedet for modellens «${m.model_merchant ?? '–'}»`);
      v = { ...v, receipt: { ...v.receipt, merchant: m.merchant ?? v.receipt.merchant, org_number: m.org_number ?? v.receipt.org_number ?? null } };
    } catch (e) { log('butikk', `oppslaget feilet: ${e.message}`); }
  }
  const uncertain = [...new Set([...(v?.failed_fields ?? ['merchant', 'date', 'total', 'items']), ...uncertainExtra])];
  let confidence = v?.confidence ?? 'low';
  if (confidence === 'high' && uncertainExtra.length) confidence = 'medium';
  // Prompt 55: lest uten OCR (bare visjonsmodellen) → aldri «høy» sikkerhet, og totalen regnes som usikker.
  if (pick?.step === 'V') { if (confidence === 'high') confidence = 'medium'; if (!uncertain.includes('total')) uncertain.push('total'); }
  const label = !pick ? null : pick.step === 'A' ? (client?.platform === 'android' ? 'Android' : 'iPhone') : pick.step === 'B' ? (deviceOcr?.source === 'android_mlkit' ? 'Android + Glimt' : 'iPhone + Glimt') : pick.step === 'C' ? 'Mac' : pick.step === 'T' ? 'Glimt (Tesseract)' : pick.step === 'V' ? VISION_LABEL55 : 'Lokal AI';
  return {
    receipt: v?.receipt ?? null, confidence, failed_fields: v?.failed_fields ?? [], uncertain_fields: uncertain, errors: v?.errors ?? ['Ingen steg ga et resultat'], warnings: v?.warnings ?? [],
    checks: v?.checks ?? null, pipeline, used: pick?.step ?? null, passed: !!passed && pick?.step === passed, engine: pick?.engine ?? null, provider: pick?.provider ?? null, model: pick?.model ?? null, label,
    ocr: ocrUsed, compare, macError: macErr, seconds: (Date.now() - t00) / 1000, merchant51,
    ...(pick?.step === 'V' ? { noOcr: true, visionOnly: true } : noOcr55 && !visionUsed ? { noOcr: true } : {}),
  };
}

/**
 * Prompt 51: bare OCR (uten modell) – til dokumenter i Glimt-chatten. Mac Vision først (rask helsesjekk, «nede» huskes),
 * så Tesseract på originalen. → {ocr, engine, error?}
 */
export async function bestOcr51(image, mime, { smallImage = null, log = () => {}, signal = null } = {}) {
  const cfg = r48Settings();
  let err = null;
  if (cfg.macOcr && macDown.until <= Date.now()) {
    let ok = Date.now() - macDown.okAt <= 60_000;
    if (!ok) {
      const h = await macHealth48({ url: cfg.macOcrUrl, key: macOcrKey48(), timeoutMs: MAC_PROBE_MS51 });
      if (h.ok) { macDown.okAt = Date.now(); ok = true; }
      else { err = probeErr51(h, cfg.macOcrUrl); Object.assign(macDown, { until: Date.now() + 5 * 60_000, why: err }); }
    }
    if (ok) {
      try { const o = await macOcr48(image, mime, { url: cfg.macOcrUrl, key: macOcrKey48(), timeoutS: cfg.macOcrTimeoutS, signal }); log('mac-ocr', `${o.rows.length} rader`); return { ocr: o, engine: 'mac_vision' }; }
      catch (e) { err = e.message; if (e.unavailable) Object.assign(macDown, { until: Date.now() + 2 * 60_000, why: e.message, okAt: 0 }); }
    }
  } else if (cfg.macOcr) err = macDown.why;
  if (!cfg.tesseract) return { ocr: null, engine: null, error: err ?? 'Tesseract er slått av' };
  try {
    const o = await tesseractOcr48(image, mime, { fallback: smallImage ? { buf: smallImage, mime: 'image/jpeg' } : null });
    log('tesseract', `${o.rows.length} rader · ${o.ms} ms`);
    return { ocr: o, engine: 'tesseract', ...(err ? { macError: err } : {}) };
  } catch (e) { return { ocr: null, engine: null, error: [err, e.message].filter(Boolean).join(' · ') }; }
}

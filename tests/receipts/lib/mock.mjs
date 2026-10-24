// EVALRCPT48 – mock-modus (CI og rigg-sjekk uten Mac, Ollama, Tesseract eller nett):
//   – falsk Ollama: en enkel regelbasert «modell» som leser radene i den siste brukermeldingen («Rader:») og svarer i
//     felles kvitteringsformat. Den er bevisst enkel og måler IKKE modellkvalitet – den viser at riggen, kjeden og
//     valideringen virker.
//   – falsk Mac-OCR: svarer med fixture-OCR-en (source mac_vision) og krever Bearer-nøkkel som den ekte tjenesten.
//   – falsk Tesseract: lager TSV av fixture-OCR-en (går gjennom serverens tsvToOcr48).
//   – falsk Gemini: «ser» bildet ved å bruke fixture-OCR-en og samme regelparser.
const enc = new TextEncoder();
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const nd = (model, content) => new Response(new ReadableStream({ start(c) {
  c.enqueue(enc.encode(`${JSON.stringify({ model, message: { role: 'assistant', content }, done: false })}\n`));
  c.enqueue(enc.encode(`${JSON.stringify({ model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 900, eval_count: 300 })}\n`));
  c.close();
} }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });

const AMT = /(?<![\d,.])(-?\d{1,3}(?: \d{3})*,\d{2})\s*$/; // ikke «22,79 877,87» som 79 877,87
const num = (s) => Number(String(s).replace(/ /g, '').replace(',', '.'));
const PAY = /(BANKAXEPT|VISA|MASTERCARD|VIPPS|KONTANT|AMEX)/i;

/** Regelbasert tolkning av OCR-rader → felles kvitteringsformat (bare for mock). */
export function ruleParse48(rows, categories = []) {
  const out = { merchant: null, org_number: null, date: null, time: null, currency: 'NOK', items: [], discounts: [], subtotal: null, vat: [], total: null, payment_method: null, category_suggestion: '' };
  let header = true, pending = null;
  for (const raw of rows) {
    const r = String(raw).trim();
    if (!r) continue;
    if (!out.merchant) { out.merchant = r; continue; }
    const org = r.match(/org\.?\s*nr\.?:?\s*(?:NO\s*)?([\d ]{9,12})/i);
    if (org) { const d = org[1].replace(/\D/g, ''); if (d.length === 9) out.org_number = d; continue; }
    const dm = r.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/) ?? r.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (dm && !out.date) {
      out.date = dm[1].length === 4 ? `${dm[1]}-${dm[2]}-${dm[3]}` : `${dm[3]}-${dm[2]}-${dm[1]}`;
      const t = r.replace(dm[0], '').match(/\b(\d{2})[:.](\d{2})\b/);
      if (t) out.time = `${t[1]}:${t[2]}`;
      header = false;
      continue;
    }
    const pay = r.match(PAY);
    if (pay && !out.payment_method) out.payment_method = { BANKAXEPT: 'BankAxept', VISA: 'Visa', MASTERCARD: 'Mastercard', VIPPS: 'Vipps', KONTANT: 'Kontant', AMEX: 'Amex' }[pay[1].toUpperCase()];
    const am = r.match(AMT);
    if (header) continue;
    if (!am) { if (!pay && /[A-ZÆØÅ]{3}/.test(r) && !/takk|velkommen|grazie|god tur/i.test(r)) pending = r; continue; }
    const v = num(am[1]);
    const text = r.slice(0, am.index).trim();
    if (pay) continue;
    if (/^(sub\s*total|delsum)/i.test(text)) { out.subtotal = v; continue; }
    if (/mva/i.test(text)) { const rate = text.match(/(\d{1,2})\s*%/); if (rate) out.vat.push({ rate: +rate[1], amount: v }); continue; }
    if (/(^|\s)(total\w*|å betale|sum)(\s|$)/i.test(text)) { out.total = v; pending = null; continue; }
    if (/rabatt/i.test(text) || v < 0) { out.discounts.push({ description: text, amount: -Math.abs(v) }); continue; }
    const qx = text.match(/^(\d+(?:,\d+)?)\s*(?:L\s*)?X\s*(\d+,\d{2})$/i);
    if (qx && pending) { out.items.push({ description: pending, quantity: num(qx[1]), unit_price: num(qx[2]), amount: v }); pending = null; continue; }
    const lead = text.match(/^(\d{1,2})\s+(.+)$/);
    out.items.push({ description: lead ? lead[2] : text, quantity: lead ? +lead[1] : null, unit_price: null, amount: v });
    pending = null;
  }
  const all = rows.join(' ');
  const want = /tips|bord/i.test(all) ? 'Restaurant' : /bensin|diesel|pumpe/i.test(all) ? 'Transport' : 'Mat';
  out.category_suggestion = categories.find((c) => c.startsWith(want)) ?? categories[0] ?? '';
  return out;
}

const rowsFromPrompt = (text) => {
  const m = String(text ?? '').match(/Rader:\n([\s\S]*?)(?:\n\n|$)/);
  return m ? m[1].split('\n') : null;
};
const catsFromPrompt = (text) => (String(text ?? '').match(/Kategorier:\s*(.+)/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const MOCK_OLLAMA_MODELS48 = ['qwen3:8b', 'qwen2.5vl:7b', 'llama3.2:3b'];
/** Falsk Ollama (gaten kaller /api/tags, /api/ps, /api/show, /api/chat). */
export async function fakeOllama48(u, init = {}) {
  const p = u.pathname;
  if (p === '/api/tags') return J({ models: MOCK_OLLAMA_MODELS48.map((name) => ({ name, model: name, size: 5.2e9, details: { family: 'qwen3', parameter_size: '8B', quantization_level: 'Q4_K_M' } })) });
  if (p === '/api/ps') return J({ models: [] });
  if (p === '/api/version') return J({ version: '0.12.6' });
  if (p === '/api/show') return J({ capabilities: ['completion'], details: { family: 'qwen3' }, model_info: {} });
  if (p === '/api/chat' || p === '/api/generate') {
    const b = JSON.parse(init.body);
    const last = String(b.messages?.at(-1)?.content ?? b.prompt ?? '');
    const rows = rowsFromPrompt(last);
    return nd(b.model, rows ? JSON.stringify(ruleParse48(rows, catsFromPrompt(last))) : '{}');
  }
  return J({ error: 'ukjent' }, 404);
}

/** Falsk Mac-OCR-tjeneste. ocr() → fixture-OCR for kvitteringen som kjøres nå. */
export function fakeMac48({ key, ocr }) {
  return async (u, init = {}) => {
    const auth = new Headers(init.headers).get('authorization');
    if (auth !== `Bearer ${key}`) return J({ error: 'unauthorized' }, 401);
    if (u.pathname === '/health') return J({ ok: true, service: 'vision-ocr', version: 'mock', source: 'mac_vision', languages: ['nb-NO', 'en-US'], norwegian: true });
    if (u.pathname === '/ocr') {
      const o = ocr();
      if (!o) return J({ error: 'unreadable' }, 422);
      return new Response(JSON.stringify({ source: 'mac_vision', lines: o.lines, rows: o.rows, full_text: o.full_text, image_size: o.image_size, ms: 650 }), { status: 200, headers: { 'content-type': 'application/json', 'x-ocr-cropped': '0' } });
    }
    return J({ error: 'not found' }, 404);
  };
}

/** Falsk Gemini (generativelanguage.googleapis.com). */
export function fakeGemini48({ ocr }) {
  return async (u, init = {}) => {
    if (u.pathname.endsWith('/models')) return J({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
    const b = JSON.parse(init.body ?? '{}');
    const text = (b.contents ?? []).flatMap((c) => c.parts ?? []).map((x) => x.text ?? '').join('\n');
    const rowsTxt = text.match(/OCR-tekst \(kan[^\n]*\n([\s\S]*?)(?:\n\n|$)/)?.[1] ?? '(ingen)';
    const rows = rowsTxt.trim() === '(ingen)' ? (ocr()?.rows ?? []) : rowsTxt.split('\n'); // «ser» bildet via fixture-OCR-en
    return J({ candidates: [{ content: { parts: [{ text: JSON.stringify(ruleParse48(rows, catsFromPrompt(text))) }] } }], modelVersion: 'gemini-flash-mock' });
  };
}

/** Falsk Tesseract for _setTesseract48: TSV laget av fixture-OCR-en. */
export function fakeTesseract48({ ocr }) {
  return {
    tools: async () => ({ tesseract: 'tesseract 5.5.0 (mock)', magick: null, at: Date.now() }),
    run: async (cmd) => {
      if (cmd !== 'tesseract') return '';
      const o = ocr();
      if (!o) return 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
      const [W, H] = o.image_size ?? [1000, 2000];
      const out = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext', `1\t1\t0\t0\t0\t0\t0\t0\t${W}\t${H}\t-1\t`];
      o.lines.forEach((l, i) => {
        const [x, y, w, h] = l.bbox ?? [0.05, 0.02 + i * 0.03, 0.5, 0.02];
        const words = String(l.text).split(/\s+/).filter(Boolean);
        const total = String(l.text).length || 1;
        let off = 0;
        words.forEach((wd, j) => {
          const left = Math.round((x + (w * off) / total) * W), width = Math.max(1, Math.round((w * wd.length) / total * W));
          out.push(`5\t1\t1\t1\t${i + 1}\t${j + 1}\t${left}\t${Math.round(y * H)}\t${width}\t${Math.round(h * H)}\t${Math.round((l.confidence ?? 0.9) * 100)}\t${wd}`);
          off += wd.length + 1;
        });
      });
      return `${out.join('\n')}\n`;
    },
  };
}

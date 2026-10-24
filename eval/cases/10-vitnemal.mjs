// Oppdrag test 10: vitnemål-bilde med 15 fag → alle 15 fag med riktige karakterer (lagret dokument, ikke svartekst).
// Går gjennom appens egen vei: POST /api/study/documents (OCR med Tesseract hvis installert, ellers visjonsmodellen i striper).
import { norm } from '../lib/match.mjs';
export default {
  id: '10-vitnemal', title: 'Vitnemål-bilde med 15 fag', area: 'dokument',
  seed: {},
  async run(h, ck) {
    const exp = h.fixture('vitnemal.json').fag;
    const t0 = Date.now();
    const r = await h.upload('/api/study/documents', 'vitnemal.png');
    const doc = r.body?.doc ?? null;
    const emner = doc?.emner ?? [];
    h.steps.push({ kind: 'upload', path: '/api/study/documents', status: r.status, msTotal: Date.now() - t0, method: doc?.method ?? null, how: doc?.how ?? null, statusText: doc?.statusText ?? r.body?.error ?? null,
      found: emner.map((e) => `${e.kode ?? ''} ${e.navn} = ${e.karakter}`), docSteps: doc?.steps?.map((s) => `${s.ok ? '✓' : '✗'} ${s.label}${s.error ? ` (${s.error})` : ''}`) });
    if (!ck('dokumentet ble lest', r.status === 201 && doc, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)) return;
    const used = new Set();
    const missing = [], wrong = [];
    for (const f of exp) {
      const i = emner.findIndex((e, j) => !used.has(j) && ((e.kode && e.kode.toUpperCase() === f.kode) || norm(e.navn) === norm(f.navn) || (norm(e.navn).length > 4 && (norm(e.navn).includes(norm(f.navn)) || norm(f.navn).includes(norm(e.navn))))));
      if (i < 0) { missing.push(f.navn); continue; }
      used.add(i);
      if (String(emner[i].karakter).trim() !== f.karakter) wrong.push(`${f.navn}: ${emner[i].karakter} (fasit ${f.karakter})`);
    }
    ck('15 fag funnet', emner.length === 15 && !missing.length, `fant ${emner.length} fag (metode ${doc.method ?? doc.how ?? '–'})${missing.length ? `, mangler: ${missing.join(', ')}` : ''}`);
    ck('riktige karakterer', !wrong.length && !missing.length, wrong.length ? wrong.join('; ') : missing.length ? 'kan ikke sjekkes for manglende fag' : '');
    const extra = emner.filter((_, j) => !used.has(j));
    if (extra.length) ck('ingen oppdiktede fag', false, extra.map((e) => `${e.navn} = ${e.karakter}`).join('; '));
  },
};

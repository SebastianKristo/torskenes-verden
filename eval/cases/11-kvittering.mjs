// Oppdrag test 11: kvitteringsbilde → riktig butikk, dato, totalbeløp og varelinjer (lagret kvittering i Finans).
// Går gjennom appens egen vei: POST /finans/api/receipts → køen (visjonsmodellen, ruten «rc»/fh_settings.ollamaModel) → fh_receipts.
import { norm } from '../lib/match.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export default {
  id: '11-kvittering', title: 'Kvitteringsbilde (REMA 1000)', area: 'dokument',
  seed: {},
  async run(h, ck) {
    const exp = h.fixture('kvittering.json');
    const t0 = Date.now();
    const up = await h.upload('/finans/api/receipts', 'kvittering.png');
    if (!ck('kvitteringen ble lastet opp', up.status === 200 && up.body?.id, `HTTP ${up.status} ${JSON.stringify(up.body).slice(0, 200)}`)) return;
    let rc = up.body;
    const limit = +(process.env.EVAL_RECEIPT_MS ?? 600_000);
    while (['pending', 'processing'].includes(rc?.status) && Date.now() - t0 < limit) { await sleep(500); rc = (await h.A(`/finans/api/receipts/${up.body.id}`)).body; }
    const lines = rc?.lines ?? [];
    h.steps.push({ kind: 'upload', path: '/finans/api/receipts', status: rc?.status, msTotal: Date.now() - t0, provider: rc?.provider, model: rc?.model, error: rc?.error,
      merchant: rc?.merchant, date: rc?.date, total: rc?.total, lines: lines.map((l) => `${l.text} ${l.price}`) });
    if (!ck('AI-en leste kvitteringen', rc && !['pending', 'processing', 'failed'].includes(rc.status), `status ${rc?.status} ${rc?.error ?? ''}`)) return;
    ck('butikk', /rema\s*1000/i.test(rc.merchant ?? ''), `lest «${rc.merchant}»`);
    ck('dato', rc.date === exp.dato, `lest ${rc.date}`);
    ck('totalbeløp', Math.abs((rc.total ?? 0) - exp.total) < 0.01, `lest ${rc.total}`);
    const used = new Set(), bad = [];
    for (const l of exp.linjer) {
      const i = lines.findIndex((x, j) => !used.has(j) && Math.abs((x.price ?? NaN) - l.belop) < 0.01 && (norm(x.text).split(' ')[0] === norm(l.navn).split(' ')[0] || norm(x.text).includes(norm(l.navn).split(' ')[0])));
      if (i < 0) bad.push(`${l.navn} ${l.belop}`); else used.add(i);
    }
    ck(`alle ${exp.linjer.length} varelinjer`, !bad.length && lines.length === exp.linjer.length, `${lines.length} linjer lest${bad.length ? `, mangler/feil: ${bad.join(', ')}` : ''}`);
  },
};

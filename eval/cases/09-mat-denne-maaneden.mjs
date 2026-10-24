// Oppdrag test 9: summen kommer fra koden og matcher testdata (2 191,10 kr i oktober t.o.m. 24.10).
import { plain, did, mentionsAmount } from '../lib/match.mjs';
export default {
  id: '09-mat-denne-maaneden', title: 'Brukt på mat denne måneden', area: 'finans',
  seed: { subscriptions: true, transactions: true },
  async run(h, ck) {
    const s = await h.ask('Hvor mye har jeg brukt på mat denne måneden?');
    const exp = h.fixture('transactions.json').expected;
    ck('svarte', s.status === 200 && s.reply, `HTTP ${s.status} ${s.error ?? ''}`);
    const sum = (s.actions ?? []).find((a) => /^finance\.(summary|search)$/.test(a.tool));
    ck('summen regnes i kode (finance.summary)', sum?.tool === 'finance.summary' && Math.abs((sum.result?.total ?? -1) - exp.total) < 0.01,
      sum ? `${sum.tool} ${JSON.stringify(sum.args)} → total ${sum.result?.total ?? '–'}` : did(s));
    ck('svaret har riktig sum (2 191,10 kr)', mentionsAmount(plain(s.reply), exp.total), `svar «${plain(s.reply).slice(0, 220)}»`);
  },
};

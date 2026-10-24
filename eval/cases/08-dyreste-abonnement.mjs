// Oppdrag test 8: blanding av måneds-, års- og ukepriser. Fasit etter normalisering: Aftenposten Digital 89 kr/uke = 385,67 kr/mnd.
import { plain, did, mentionsAmount } from '../lib/match.mjs';
export default {
  id: '08-dyreste-abonnement', title: 'Dyreste abonnement (måned/år/uke)', area: 'finans',
  seed: { subscriptions: true, transactions: true },
  async run(h, ck) {
    const s = await h.ask('Hva er det dyreste abonnementet jeg har?');
    const exp = h.fixture('subscriptions.json').expected;
    ck('svarte', s.status === 200 && s.reply, `HTTP ${s.status} ${s.error ?? ''}`);
    const r = plain(s.reply);
    const names = h.fixture('subscriptions.json').items.map((x) => x.name);
    const pos = names.map((n) => ({ n, i: r.toLowerCase().indexOf(n.toLowerCase().split(' ')[0]) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
    ck(`nevner ${exp.top} først`, pos[0]?.n === exp.top, `rekkefølge i svaret: ${pos.map((x) => x.n).join(' → ') || 'ingen kjente navn'} · ${did(s)}`);
    ck('riktig månedspris (≈ 386 kr/mnd) eller årspris (4 628 kr/år)', mentionsAmount(r, exp.monthly) || mentionsAmount(r, exp.yearly), `svar «${r.slice(0, 220)}»`);
    const sub = (s.actions ?? []).find((a) => a.tool === 'finance.subscriptions');
    ck.info('verktøy', sub ? `finance.subscriptions ${JSON.stringify(sub.args)} → topp: ${JSON.stringify(sub.result?.ranked?.slice?.(0, 3)?.map((x) => `${x.name} ${x.monthly}/mnd`) ?? sub.result)}` : 'ikke kalt');
  },
};

// Prompt 49 del 4 (eval-test 10 i oppdraget): andre identiske værspørsmål innen 15 min kommer fra svar-cachen, og sporet viser det.
// Nøkkel = normalisert plan (sted + tolket tidsrom) + bruker. Prognosen hentes bare én gang.
import { plain, did } from '../lib/match.mjs';
export default {
  id: '20-vaer-cache', title: 'Samme værspørsmål to ganger → svar-cache (15 min)', area: 'vær', intent: 'weather (cache)',
  seed: { calendar: ['frisor'] },
  async run(h, ck) {
    const q = 'Hvordan er været i Oslo i morgen?';
    const a = await h.ask(q);
    ck('første svar', a.status === 200 && a.reply && (a.actions ?? []).some((x) => x.tool === 'weather.get' && x.status === 'done'), did(a));
    const t1 = h.glimtTrace(a);
    ck('første svar lagret i cachen (vær, 15 min)', t1?.cache?.stored && t1.cache.kind === 'weather' && t1.cache.ttlMs === 15 * 60_000, JSON.stringify(t1?.cache ?? null));
    const fc1 = h.ext('weather').filter((x) => /forecast/.test(x.api)).length;
    const b = await h.ask(q);
    const t2 = h.glimtTrace(b);
    ck('andre svar fra cachen (svaret sier det)', b.cached === true && b.cache?.kind === 'weather', `cached=${b.cached} ${JSON.stringify(b.cache ?? null)}`);
    ck('sporet viser cache-treff', t2?.cache?.hit === true, JSON.stringify(t2?.cache ?? null));
    ck('samme svar', plain(b.reply) === plain(a.reply), `«${plain(a.reply).slice(0, 120)}» / «${plain(b.reply).slice(0, 120)}»`);
    const fc2 = h.ext('weather').filter((x) => /forecast/.test(x.api)).length;
    ck('prognosen ble ikke hentet på nytt', fc1 > 0 && fc2 === fc1, `prognoser før/etter andre spørsmål: ${fc1}/${fc2}`);
    ck.info('svartid første / andre', `${a.msTotal} ms / ${b.msTotal} ms`);
  },
};

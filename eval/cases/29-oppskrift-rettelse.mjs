// Prompt 49 del 1, eval-test 7: rettelse («nei, jeg mente middagen») → ny oppskrift (kandidat fra rettelsen) + negativt eksempel
// (den feile planen) + nytt testtilfelle i eval/learned/ (her i kjøringens egen DATA_DIR).
import { did } from '../lib/match.mjs';
export default {
  id: '29-oppskrift-rettelse', title: '«nei, jeg mente middagen» → lærer: oppskrift + negativt eksempel + test', area: 'oppskrift', intent: 'calendar_query (rettelse)',
  seed: { memory: ['nina'], calendar: ['frisor'] },
  async run(h, ck) {
    const r0 = await h.A('/api/kalender/events', 'POST', { title: 'Middag med Nina', date: '2026-11-06', start: '18:00', end: '20:00', allDay: false, calendar: 'privat' });
    if (r0.status !== 201) throw new Error(`Seed middag: ${r0.status}`);
    const a = await h.ask('Når skal jeg møte Nina?');
    ck('svarte på spørsmålet', a.status === 200 && a.reply, did(a));
    const b = await h.ask('nei, jeg mente middagen');
    ck('rettelsen finner middagen (6. nov)', b.status === 200 && /middag/i.test(b.reply ?? '') && /6\.\s*nov/i.test(b.reply ?? ''), did(b));
    ck('svaret sier at Glimt lærte', b.recipe?.correction === true, JSON.stringify(b.recipe));
    const rs = h.recipes();
    ck('ny oppskrift fra rettelsen (kandidat, eksempel = det opprinnelige spørsmålet)', rs.some((r) => r.source === 'correction' && r.status === 'candidate' && r.example_query === 'Når skal jeg møte Nina?'), JSON.stringify(rs.map((r) => [r.source, r.status, r.example_query])));
    const ng = h.negatives();
    ck('negativt eksempel med den feile planen', ng.length === 1 && ng[0].query === 'Når skal jeg møte Nina?', JSON.stringify(ng).slice(0, 300));
    const lf = h.learnedFiles();
    ck('nytt testtilfelle i eval/learned/', lf.length === 1 && lf[0].kind === 'glimt-learned/1' && lf[0].query === 'Når skal jeg møte Nina?' && lf[0].expect?.tools?.length > 0, JSON.stringify(lf.map((x) => [x.id, x.query, x.expect?.tools])).slice(0, 300));
    const run1 = h.db.prepare('SELECT state, reason FROM recipe_runs WHERE trace_id=?').get(a.traceId);
    ck('det første svaret telles som feil', run1?.state === 'fail', JSON.stringify(run1 ?? null));
    ck.info('spor', JSON.stringify(h.glimtTrace(b)?.recipe?.learned ?? null));
  },
};

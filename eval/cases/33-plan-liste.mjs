// Prompt 49 del 2, eval-test 4: «Hvilke faste oppgaver har jeg?» → liste fra databasen (to oppgaver lagt inn via API-et).
import { plain, did } from '../lib/match.mjs';
export default {
  id: '33-plan-liste', title: '«Hvilke faste oppgaver har jeg?» → liste fra databasen', area: 'planlagt', intent: 'schedule_list',
  async run(h, ck) {
    const a1 = await h.A('/api/glimt/schedules', 'POST', { what: 'ta ut søpla', when: 'annenhver tirsdag kl 18', title: 'Søppel' });
    const a2 = await h.A('/api/glimt/schedules', 'POST', { what: 'strømprisene', when: 'hver hverdag kl 7', kind: 'power' });
    ck('seed: to oppgaver', a1.status === 201 && a2.status === 201, `${a1.status} ${a2.status}`);
    const a = await h.ask('Hvilke faste oppgaver har jeg?');
    const t = plain(a.reply);
    ck('schedule.list (lesekall, ingen bekreftelse)', (a.actions ?? []).some((x) => x.tool === 'schedule.list' && x.status === 'done') && !a.confirm, did(a));
    ck('begge fra databasen nevnes', /Søppel/.test(t) && /Strømpriser/.test(t) && /annenhver tirsdag/i.test(t) && /hverdag/i.test(t), `«${t.slice(0, 300)}»`);
    ck('briefene står med', /morgenbrief/i.test(t), `«${t.slice(0, 300)}»`);
  },
};

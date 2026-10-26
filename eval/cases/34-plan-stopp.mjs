// Prompt 49 del 2, eval-test 5: «Stopp strømprisvarselet» → riktig jobb (det betingede varselet, ikke de daglige strømprisene)
// deaktiveres etter bekreftelse; ingenting endret før «ja».
import { plain, did } from '../lib/match.mjs';
export default {
  id: '34-plan-stopp', title: '«Stopp strømprisvarselet» → riktig jobb stoppes etter bekreftelse', area: 'planlagt', intent: 'schedule_delete',
  async run(h, ck) {
    await h.A('/api/glimt/schedules', 'POST', { what: 'strømprisene', when: 'hver morgen kl 7', kind: 'power' });
    await h.A('/api/glimt/schedules', 'POST', { what: 'strømprisene', when: 'hver dag', condition: 'strømprisen går over 2 kr' });
    await h.A('/api/glimt/schedules', 'POST', { what: 'betale husleia', when: 'den 1. hver måned' });
    const s0 = h.schedules();
    const target = s0.find((x) => x.condition);
    ck('seed: tre oppgaver, én betinget', s0.length === 3 && !!target, JSON.stringify(s0.map((x) => x.title)));
    const a = await h.ask('Stopp strømprisvarselet', 'home', { noConfirm: true });
    const act = (a.actions ?? []).find((x) => x.tool === 'schedule.delete' || x.tool === 'schedule.update');
    ck('ber om bekreftelse for strømprisvarselet', !!a.confirm?.token && act?.args?.id === target?.id && /Strømprisvarsel/.test(plain(a.confirm?.summary ?? '')), `${did(a)} · «${plain(a.reply).slice(0, 160)}»`);
    ck('ingenting endret før «ja»', h.schedules().every((x) => x.status === 'active'), JSON.stringify(h.schedules().map((x) => x.status)));
    if (!a.confirm?.token) return;
    const c = await h.confirm(a.confirm.token);
    const s1 = h.schedules();
    ck('etter «ja»: varselet er stoppet', c.status === 200 && s1.find((x) => x.id === target.id)?.status === 'paused', `${c.status} «${plain(c.reply).slice(0, 160)}»`);
    ck('de andre er urørt', s1.filter((x) => x.id !== target.id).every((x) => x.status === 'active'), JSON.stringify(s1.map((x) => [x.title, x.status])));
  },
};

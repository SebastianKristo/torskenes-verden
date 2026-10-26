// Prompt 49 del 2, eval-test 1: «Send meg strømprisene hver morgen kl. 7» → bekreftelse med riktig tolkning (ingenting lagret før
// «ja»); etter «ja» finnes en jobb med RRULE daglig 07:00 Europe/Oslo. Tolkningen av «når» gjøres i koden (dates.js/recur62.js).
import { plain, did } from '../lib/match.mjs';
export default {
  id: '30-plan-strompriser', title: '«Send meg strømprisene hver morgen kl. 7» → bekreftelse → daglig 07:00', area: 'planlagt', intent: 'schedule_create',
  async run(h, ck) {
    const a = await h.ask('Send meg strømprisene hver morgen kl. 7', 'home', { noConfirm: true });
    const act = (a.actions ?? []).find((x) => x.tool === 'schedule.create');
    ck('ber om bekreftelse (schedule.create, ikke utført)', a.status === 200 && !!a.confirm?.token && act?.status === 'needs_confirm', did(a));
    const sum = plain(a.confirm?.summary ?? a.reply);
    ck('tolkningen: hver dag kl. 07:00, strømprisene, NO1', /hver dag kl\. 07:00/i.test(sum) && /strømpris/i.test(sum) && /NO1/.test(sum) && /stemmer det\?/i.test(sum), `«${sum.slice(0, 200)}»`);
    ck('ingenting lagret før «ja»', h.schedules().length === 0, JSON.stringify(h.schedules()));
    if (!a.confirm?.token) return;
    const c = await h.confirm(a.confirm.token);
    const s = h.schedules();
    const j = s[0];
    ck('etter «ja»: én jobb', c.status === 200 && s.length === 1, `${c.status} ${JSON.stringify(s).slice(0, 300)}`);
    ck('RRULE daglig 07:00 Europe/Oslo', j?.rrule === 'FREQ=DAILY;BYHOUR=7;BYMINUTE=0' && j?.tz === 'Europe/Oslo' && j?.dtstart === '2026-10-25T07:00', JSON.stringify(j));
    ck('neste kjøring søndag 25.10 kl. 07:00 (vintertid, 06:00Z)', j && new Date(j.next_run_at).toISOString() === '2026-10-25T06:00:00.000Z', j ? new Date(j.next_run_at).toISOString() : '-');
    ck('strømpris-jobb (kind power, NO1)', j?.kind === 'power' && JSON.parse(j?.params ?? '{}').zone === 'NO1', JSON.stringify(j));
  },
};

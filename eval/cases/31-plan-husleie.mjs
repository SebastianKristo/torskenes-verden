// Prompt 49 del 2, eval-test 2: «Minn meg på å betale husleia den 1. hver måned» → månedlig jobb, dag 1 (påminnelse).
import { plain, did } from '../lib/match.mjs';
export default {
  id: '31-plan-husleie', title: '«Minn meg på å betale husleia den 1. hver måned» → månedlig, dag 1', area: 'planlagt', intent: 'schedule_create',
  async run(h, ck) {
    const a = await h.ask('Minn meg på å betale husleia den 1. hver måned', 'home', { noConfirm: true });
    const sum = plain(a.confirm?.summary ?? a.reply);
    ck('ber om bekreftelse med «den 1. hver måned»', !!a.confirm?.token && /den 1\. hver måned/i.test(sum) && /husleia/i.test(sum), `«${sum.slice(0, 200)}» · ${did(a)}`);
    ck('ikke et vanlig gjøremål', !(a.actions ?? []).some((x) => x.tool === 'tasks.create') && h.tasks().length === 0, did(a));
    if (!a.confirm?.token) return;
    await h.confirm(a.confirm.token);
    const j = h.schedules()[0];
    ck('månedlig jobb, dag 1', /^FREQ=MONTHLY;BYMONTHDAY=1;/.test(j?.rrule ?? ''), JSON.stringify(j));
    ck('første gang 1. november', j?.dtstart?.startsWith('2026-11-01'), j?.dtstart);
    ck('påminnelse om husleia', j?.kind === 'reminder' && /husleia/i.test(j?.what ?? ''), JSON.stringify(j));
  },
};

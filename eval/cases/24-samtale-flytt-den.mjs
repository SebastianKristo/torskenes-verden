// Prompt 49 del 3 (eval-test 9 i oppdraget): «Flytt den til 11» etter opprettet hendelse → riktig hendelse flyttes (samme dag, 11:00).
// Chat-samtale (conversationId = chat-id, conversationKind chat). Ser på den LAGREDE hendelsen.
import { newEvents, did } from '../lib/match.mjs';
export default {
  id: '24-samtale-flytt-den', title: '«Legg inn tannlege fredag kl 10» → «flytt den til 11»', area: 'samtale', intent: 'calendar_change (oppfølging)',
  seed: { calendar: ['forelesning-oslomet'] },
  async run(h, ck, { before }) {
    const conv = { conversationId: `c-eval24-${process.pid}`, conversationKind: 'chat' };
    const a = await h.ask('Legg inn tannlege fredag kl 10', 'chat', conv);
    const evs = newEvents(before.calendar, h.calendar());
    const ev = evs.length === 1 ? evs[0] : null;
    if (!ck('første: én ny hendelse fredag 30.10 kl. 10:00', a.status === 200 && ev && /tannlege/i.test(ev.title ?? '') && ev.date === '2026-10-30' && ev.start === '10:00', `${evs.map((e) => `${e.title} ${e.date} ${e.start}`).join(' | ') || 'ingen'} · ${did(a)}`)) return;
    const b = await h.ask('flytt den til 11', 'chat', conv);
    const after = h.calendar();
    const moved = after.find((e) => e.id === ev.id);
    ck('andre: calendar.update utført', b.status === 200 && (b.actions ?? []).some((x) => x.tool === 'calendar.update' && x.status === 'done'), did(b));
    ck('samme hendelse flyttet til kl. 11:00 samme dag', moved && moved.date === '2026-10-30' && moved.start === '11:00', moved ? `${moved.title} ${moved.date} ${moved.start}` : 'hendelsen er borte');
    ck('ingen kopi og ingen andre endret', newEvents(before.calendar, after).length === 1 && before.calendar.every((x) => { const y = after.find((e) => e.id === x.id); return y && y.date === x.date && y.start === x.start; }), `${newEvents(before.calendar, after).length} nye`);
    ck.info('oppfølging', JSON.stringify(b.followUp ?? null));
  },
};

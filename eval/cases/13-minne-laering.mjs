// Oppdrag test 13: «Nina er frisøren min» lagrer et minnefakta; neste spørsmål om Nina bruker det.
import { checkNextNina } from './_nina.mjs';
import { did } from '../lib/match.mjs';
export default {
  id: '13-minne-laering', title: '«Nina er frisøren min» → lagres og brukes', area: 'minne',
  seed: { calendar: ['frisor', 'forelesning-oslomet'] },
  async run(h, ck) {
    const s1 = await h.ask('Nina er frisøren min');
    const mem = h.memory();
    const row = mem.find((m) => /nina/i.test(`${m.match} ${m.title ?? ''} ${m.note ?? ''}`));
    ck('minnefakta lagret (Nina = frisør)', row && /fris/i.test(`${row.type ?? ''} ${row.title ?? ''} ${row.note ?? ''}`), row ? JSON.stringify(row) : `ingen rad i glimt_memory · ${did(s1)}`);
    ck('bekreftet kort', /husk|lagret|notert|skjønner|ok/i.test(s1.reply ?? ''), `svar «${(s1.reply ?? '').slice(0, 160)}»`);
    const s2 = await h.ask('Når er neste gang jeg skal til Nina?');
    checkNextNina(s2, ck);
  },
};

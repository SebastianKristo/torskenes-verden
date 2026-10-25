// Prompt 49 del 3: oppfølgingsspørsmål med konkrete valg. To Nina-avtaler fredag → «Mener du «Frisør Nina …» eller «Middag med Nina …»?»
// med valg (choices); svaret «den andre» forstås fra samtaletilstanden og flytter middagen (ikke frisørtimen).
import { did } from '../lib/match.mjs';
export default {
  id: '26-samtale-valg-nina', title: 'To Nina-avtaler → konkrete valg → «den andre»', area: 'samtale', intent: 'calendar_change (valg)',
  seed: {},
  async run(h, ck) {
    for (const ev of [{ title: 'Frisør Nina', date: '2026-10-30', start: '14:00', end: '15:00' }, { title: 'Middag med Nina', date: '2026-10-30', start: '18:00', end: '20:00' }]) {
      const r = await h.A('/api/kalender/events', 'POST', { ...ev, allDay: false, calendar: 'privat' });
      if (r.status !== 201) throw new Error(`Seed ${ev.title}: ${r.status}`);
    }
    const conv = { conversationId: `home-eval26-${process.pid}` };
    const find = (t) => h.calendar().find((e) => e.title === t);
    const a = await h.ask('Flytt Nina til lørdag', 'home', conv);
    const items = a.choices?.items ?? [];
    ck('spør med to konkrete valg', a.status === 200 && items.length === 2 && items.some((x) => /frisør nina/i.test(x.label)) && items.some((x) => /middag med nina/i.test(x.label)), `${JSON.stringify(a.choices ?? null).slice(0, 300)} · ${did(a)}`);
    ck('ingenting flyttet på en gjetning', find('Frisør Nina')?.date === '2026-10-30' && find('Middag med Nina')?.date === '2026-10-30', JSON.stringify([find('Frisør Nina'), find('Middag med Nina')]));
    const second = items[1];
    const b = await h.ask('den andre', 'home', conv);
    const want = second && /middag/i.test(second.label) ? 'Middag med Nina' : 'Frisør Nina';
    const other = want === 'Middag med Nina' ? 'Frisør Nina' : 'Middag med Nina';
    ck(`«den andre» = ${want}: flyttet til lørdag 31.10, samme klokkeslett`, b.status === 200 && find(want)?.date === '2026-10-31' && find(want)?.start === (want === 'Middag med Nina' ? '18:00' : '14:00'), `${JSON.stringify(find(want))} · ${did(b)}`);
    ck(`${other} er urørt`, find(other)?.date === '2026-10-30', JSON.stringify(find(other)));
    ck.info('valget (spor)', JSON.stringify(h.glimtTrace(b)?.convo?.choice ?? null));
  },
};

// Oppdrag test 6: «Tannlege 3/2 kl 0815» → 2027-02-03 08:15.
import { checkCreated } from './_create.mjs';
export default {
  id: '06-tannlege', title: 'Tannlege 3/2 kl 0815', area: 'kalender-opprett',
  seed: { calendar: ['tannlege-forbi'] },
  async run(h, ck, { before }) {
    const s = await h.ask('Tannlege 3/2 kl 0815');
    checkCreated(h, s, ck, before, { title: (t) => /^tannlege\b/i.test(t.trim()) && t.length <= 30 && !/3\/2|0815/.test(t), date: '2027-02-03', start: '08:15' });
  },
};

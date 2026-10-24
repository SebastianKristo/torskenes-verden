// Oppdrag test 4: «Skal se Dune på Colosseum kino 17.12 17.30» → tittel Dune, sted Colosseum kino, start 2026-12-17 17:30.
import { checkCreated } from './_create.mjs';
import { norm } from '../lib/match.mjs';
const T = 'Skal se Dune på Colosseum kino 17.12 17.30';
export default {
  id: '04-dune-kino', title: 'Dune på Colosseum kino 17.12 17.30', area: 'kalender-opprett',
  seed: { calendar: ['forelesning-oslomet'] },
  async run(h, ck, { before }) {
    const s = await h.ask(T);
    checkCreated(h, s, ck, before, {
      title: (t) => norm(t).replace(/\b(kino|film|se)\b/g, '').trim() === 'dune',
      date: '2026-12-17', start: '17:30',
      location: (l) => /^colosseum kino/i.test(l.trim()),
    });
  },
};

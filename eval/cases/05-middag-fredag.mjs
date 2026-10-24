// Oppdrag test 5: «Middag hos mamma på fredag kl 18» → fredag 30.10.2026 kl. 18:00, tittelen er ikke hele setningen.
import { checkCreated } from './_create.mjs';
import { norm } from '../lib/match.mjs';
export default {
  id: '05-middag-fredag', title: 'Middag hos mamma på fredag kl 18', area: 'kalender-opprett',
  seed: { calendar: ['forelesning-oslomet'] },
  async run(h, ck, { before }) {
    const s = await h.ask('Middag hos mamma på fredag kl 18');
    checkCreated(h, s, ck, before, {
      title: (t) => /middag/i.test(t) && !/fredag|kl\.?\s*18|18[:.]00/i.test(t) && norm(t) !== norm('Middag hos mamma på fredag kl 18'),
      date: '2026-10-30', start: '18:00',
    });
  },
};

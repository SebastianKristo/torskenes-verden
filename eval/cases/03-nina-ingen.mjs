// Oppdrag test 3: ingen kommende hendelse (bare en gammel frisørtime) → sier tydelig at den ikke fant noe.
import { checkNextNina } from './_nina.mjs';
export default {
  id: '03-nina-ingen', title: 'Neste gang til Nina (ingen kommende)', area: 'kalender+minne',
  seed: { memory: ['nina'], calendar: ['frisor-forbi', 'forelesning-oslomet'] },
  async run(h, ck) { checkNextNina(await h.ask('Når er neste gang jeg skal til Nina?'), ck, { none: true }); },
};

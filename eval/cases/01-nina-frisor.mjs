// Oppdrag test 1: minnefakta «Nina er frisøren min» + hendelsen «Frisør» 3. nov kl. 14 → riktig dato.
import { checkNextNina } from './_nina.mjs';
export default {
  id: '01-nina-frisor', title: 'Neste gang til Nina (hendelse «Frisør»)', area: 'kalender+minne',
  seed: { memory: ['nina'], calendar: ['frisor', 'frisor-forbi', 'forelesning-oslomet'] },
  async run(h, ck) { checkNextNina(await h.ask('Når er neste gang jeg skal til Nina?'), ck); },
};

// Oppdrag test 2: samme spørsmål, men hendelsen heter «Nina klipp».
import { checkNextNina } from './_nina.mjs';
export default {
  id: '02-nina-klipp', title: 'Neste gang til Nina (hendelse «Nina klipp»)', area: 'kalender+minne',
  seed: { memory: ['nina'], calendar: ['nina-klipp', 'forelesning-oslomet'] },
  async run(h, ck) { checkNextNina(await h.ask('Når er neste gang jeg skal til Nina?'), ck); },
};

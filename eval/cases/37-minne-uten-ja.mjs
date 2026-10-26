// Prompt 49 del 5: ingenting inn i minnet uten ja – avviste forslag lagres aldri og foreslås ikke på nytt neste natt.
export default {
  id: '37-minne-uten-ja', title: 'Avvist forslag → aldri i minnet, ikke foreslått igjen', area: 'minne', intent: 'memory_nightly',
  async run(h, ck) {
    h.seedTrace63('Middag med min kollega Jonas på torsdag');
    h.seedTrace63('Frisør hos Eva neste uke', 2 * 3600_000);
    const n1 = await h.runMemory63();
    const p = await h.pending63();
    ck('to forslag', n1.run?.proposals === 2 && p.length === 2, JSON.stringify(p.map((x) => x.sentence)));
    ck('minnet er tomt', h.memory().length === 0, JSON.stringify(h.memory()));
    for (const x of p) await h.A(`/api/glimt/memory/pending/${x.id}/reject`, 'POST');
    const n2 = await h.runMemory63();
    ck('neste natt: ingen nye forslag', n2.run?.proposals === 0 && (await h.pending63()).length === 0, JSON.stringify(n2.run));
    ck('fortsatt ingenting i minnet', h.memory().length === 0, JSON.stringify(h.memory()));
    ck('avvisningene er husket', (await h.pending63('rejected')).length === 2);
  },
};

// Prompt 49 del 5: motstrid oppdages og spørres om med valgknapper (behold A / behold B / begge) – ingenting endres før valget.
export default {
  id: '38-minne-motstrid', title: '«Nina er frisør» i minnet + «Nina er tannlegen min» → motstrid med tre valg', area: 'minne', intent: 'memory_conflict',
  seed: { memory: ['nina'] },
  async run(h, ck) {
    h.seedTrace63('Husk at Nina er tannlegen min nå');
    const n = await h.runMemory63();
    const c = (await h.conflicts63())[0];
    ck('motstrid oppdaget', n.run?.conflicts >= 1 && c?.kind === 'value' && /Nina/.test(c?.question ?? ''), JSON.stringify(n.run));
    ck('tre valg: behold A / behold B / begge', JSON.stringify(c?.choices?.map((x) => x.id)) === '["keep_a","keep_b","both"]', JSON.stringify(c?.choices));
    const p = (await h.pending63()).find((x) => x.subject === 'Nina');
    const ap = p ? await h.A(`/api/glimt/memory/pending/${p.id}/approve`, 'POST') : null;
    ck('godkjenning stoppes til valget er tatt', ap?.status === 409, String(ap?.status));
    ck('minnet urørt før valget', h.memory().find((m) => m.match === 'nina')?.type === 'frisør', JSON.stringify(h.memory()));
    if (!c) return;
    const r = await h.A(`/api/glimt/memory/conflicts/${c.id}/resolve`, 'POST', { choice: 'keep_b' });
    ck('behold B: Nina er tannlege', r.status === 200 && h.memory().filter((m) => m.match === 'nina').map((m) => m.type).join() === 'tannlege', JSON.stringify(h.memory()));
  },
};

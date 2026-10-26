// Prompt 49 del 5: fakta som ikke er brukt på lenge markeres, men slettes aldri automatisk.
export default {
  id: '39-minne-gammelt', title: 'Faktum ubrukt i 120 dager → markert, ikke slettet; «behold» fjerner merket', area: 'minne', intent: 'memory_stale',
  seed: { memory: ['nina'] },
  async run(h, ck) {
    const id = h.memory()[0]?.id;
    h.db.prepare('UPDATE glimt_memory SET created=?, used_at=? WHERE id=?').run(Date.now() - 200 * 86400_000, Date.now() - 120 * 86400_000, id);
    const n = await h.runMemory63();
    const s = await h.stale63();
    ck('markert som ikke brukt på lenge', n.run?.stale === 1 && s.length === 1 && s[0].id === id && s[0].daysUnused >= 119, JSON.stringify(s));
    await h.runMemory63();
    ck('ikke slettet (to netter)', h.memory().length === 1, JSON.stringify(h.memory()));
    const k = await h.A(`/api/glimt/memory/stale/${id}/keep`, 'POST');
    ck('behold: merket borte', k.status === 200 && (await h.stale63()).length === 0, String(k.status));
    const a = await h.ask('Når skal jeg til Nina neste gang?');
    const used = h.db.prepare('SELECT used_at FROM glimt_memory WHERE id=?').pluck().get(id);
    ck('«sist brukt» oppdatert når Glimt bruker faktumet', used > Date.now() - 3600_000, `${used} · ${a.reply?.slice(0, 80)}`);
  },
};

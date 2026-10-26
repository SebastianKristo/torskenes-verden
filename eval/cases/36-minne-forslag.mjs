// Prompt 49 del 5: nattlig oppsummering – et nytt faktum fra en Glimt-samtale blir et FORSLAG (pending), ikke et minne.
// Først etter «godkjenn» står det i «Glimt husker».
import { plain } from '../lib/match.mjs';
export default {
  id: '36-minne-forslag', title: 'Nattlig oppsummering: «Kari, søsteren min» i en samtale → forslag, i minnet først etter ja', area: 'minne', intent: 'memory_nightly',
  async run(h, ck) {
    const a = await h.ask('Hva bør jeg kjøpe til Kari, søsteren min, til bursdagen hennes?', 'home', { noConfirm: true });
    ck.info('Glimt svarte', plain(a.reply).slice(0, 160));
    const before = h.memory().some((m) => m.match === 'kari');
    const n = await h.runMemory63();
    ck('nattjobben kjørte', n.status === 200 && n.run?.status === 'ok', JSON.stringify(n.run ?? n.error));
    const p = await h.pending63();
    const kari = p.find((x) => x.subject === 'Kari');
    ck('forslag: Kari er søsteren din (fra samtalen)', !!kari && /søster/.test(kari.object) && kari.source === 'conversation' && /Kari/.test(kari.evidence?.[0]?.text ?? ''), JSON.stringify(p.map((x) => x.sentence)));
    ck('ikke i minnet før ja', !before && !h.memory().some((m) => m.match === 'kari'), JSON.stringify(h.memory()));
    if (!kari) return;
    const ap = await h.A(`/api/glimt/memory/pending/${kari.id}/approve`, 'POST');
    ck('etter godkjenn: i minnet', ap.status === 200 && h.memory().some((m) => m.match === 'kari' && /søster/.test(m.note ?? '')), `${ap.status} ${JSON.stringify(h.memory())}`);
  },
};

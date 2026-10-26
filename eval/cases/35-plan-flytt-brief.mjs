// Prompt 49 del 2: «Flytt morgenbriefen til 06:30» endrer den eksisterende brief-innstillingen (glimt35) etter bekreftelse – ingen
// duplikat som planlagt oppgave.
import { plain, did } from '../lib/match.mjs';
export default {
  id: '35-plan-flytt-brief', title: '«Flytt morgenbriefen til 06:30» → brief-innstillingen, ingen duplikat', area: 'planlagt', intent: 'schedule_update',
  async run(h, ck) {
    const a = await h.ask('Flytt morgenbriefen til 06:30', 'home', { noConfirm: true });
    ck('ber om bekreftelse (06:45 → 06:30)', !!a.confirm?.token && /06:30/.test(plain(a.confirm?.summary ?? '')), `${did(a)} · «${plain(a.reply).slice(0, 160)}»`);
    if (!a.confirm?.token) return;
    const c = await h.confirm(a.confirm.token);
    ck('etter «ja»: morgenbriefen kl. 06:30', c.status === 200 && h.briefs()?.morning?.at === '06:30', `${c.status} ${JSON.stringify(h.briefs())}`);
    ck('ingen ny planlagt oppgave', h.schedules().length === 0, JSON.stringify(h.schedules()));
  },
};

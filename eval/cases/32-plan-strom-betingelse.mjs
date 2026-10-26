// Prompt 49 del 2, eval-test 3: «Si fra hvis strømprisen går over 2 kr i morgen» → betinget jobb med betingelsen i KODE
// (max(price_nok_kwh) > 2). Kjøringen sjekker betingelsen i koden med falske strømpriser – ingen modellkall under kjøringen.
import { plain, did } from '../lib/match.mjs';
const curve = (max) => Array.from({ length: 24 }, (_, hr) => (hr === 8 ? max : hr === 3 ? 0.42 : 1.1));
export default {
  id: '32-plan-strom-betingelse', title: '«Si fra hvis strømprisen går over 2 kr i morgen» → betingelse i kode', area: 'planlagt', intent: 'schedule_create (betinget)',
  async run(h, ck) {
    const a = await h.ask('Si fra hvis strømprisen går over 2 kr i morgen', 'home', { noConfirm: true });
    const sum = plain(a.confirm?.summary ?? a.reply);
    ck('ber om bekreftelse: sjekker morgendagens priser, grense 2 kr', !!a.confirm?.token && /i morgen/.test(sum) && /2,00 kr/.test(sum), `«${sum.slice(0, 220)}» · ${did(a)}`);
    if (!a.confirm?.token) return;
    await h.confirm(a.confirm.token);
    const j = h.schedules()[0];
    const cond = j?.condition ? JSON.parse(j.condition) : null;
    ck('betinget jobb: max(price_nok_kwh) > 2 (kode)', cond?.expr === 'max(price_nok_kwh) > 2' && cond?.source === 'power' && cond?.day === 'tomorrow', JSON.stringify(cond));
    h.setPower62(curve(2.31));
    const r1 = await h.runNow62(j.id);
    ck('over grensen → varsel med tallet fra dataene', r1.run?.status === 'ok' && r1.run.condition?.met === true && r1.run.condition?.value === 2.31 && /2,31 kr\/kWh/.test(r1.run.result ?? ''), JSON.stringify(r1.run).slice(0, 300));
    ck('ingen modellvurdering (0 modellkall under kjøringen)', r1.modelCalls[1] === r1.modelCalls[0], JSON.stringify(r1.modelCalls));
    h.setPower62(curve(1.95));
    const r2 = await h.runNow62(j.id);
    ck('under grensen → ikke oppfylt, ingen levering', r2.run?.status === 'condition_false' && r2.run.condition?.met === false && !r2.run.delivery, JSON.stringify(r2.run).slice(0, 300));
    ck('ingen modellkall her heller', r2.modelCalls[1] === r2.modelCalls[0], JSON.stringify(r2.modelCalls));
  },
};

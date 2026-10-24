// Fryst klokke for eval: Date i denne prosessen starter på FROZEN og går videre i sanntid derfra
// (så tidsgrenser og varighetsmålinger i gaten fortsatt virker). Ingen endring i produksjonskoden:
// motoren får i tillegg sin egen testkrok (_setClock45) fra worker.mjs.
// Gjelder ikke: SQLite sin datetime('now') og Intl uten eksplisitt dato (begge brukes ikke av Glimt-stiene som testes).
export const FROZEN_ISO = '2026-10-24T10:00:00+02:00'; // lørdag 24. oktober 2026 kl. 10:00 Europe/Oslo (sommertid til 25.10)
export const TODAY = '2026-10-24';
export const NOW_MIN = 600;

export function freezeClock(iso = FROZEN_ISO) {
  const RealDate = globalThis.Date;
  if (RealDate.__eval47) return;
  const frozen = RealDate.parse(iso);
  const start = RealDate.now();
  const now = () => frozen + (RealDate.now() - start);
  function FakeDate(...a) {
    if (!new.target) return new RealDate(now()).toString();
    return a.length ? new RealDate(...a) : new RealDate(now());
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = now;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.__eval47 = true;
  FakeDate.real = RealDate;
  globalThis.Date = FakeDate;
}

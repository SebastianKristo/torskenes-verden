// Holder klokka i en testfil på dagtid (Europe/Oslo). Mellom 21:00 og 09:00 flyttes den BAKOVER til kl. 20:00
// (samme kveld, eller kvelden før etter midnatt); ellers røres den ikke. Det hindrer at tester med «for N dager siden»
// og døgngrenser feiler den siste timen før midnatt, at varsler holdes tilbake av nattstillheten (22–07), og at testdata «i dag kl. 08:40» skjer midt i testen. Bare bakover, fordi
// opprydding som sammenligner Date.now() med filtid på disken ellers ville slettet ferske filer. Tiden går videre som
// vanlig. Importeres FØRST i testfila (før servermodulene).
const RealDate = Date;
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const parts = (ms) => Object.fromEntries(fmt.formatToParts(new RealDate(ms)).map((x) => [x.type, x.value]));
const osloMs = (y, m, d, h) => { // kl. h:00 Oslo-tid den dagen, som ms
  const guess = RealDate.UTC(y, m - 1, d, h, 0), q = parts(guess);
  return guess - (RealDate.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute) - guess);
};
const now0 = RealDate.now(), p = parts(now0), hour = +p.hour;
let off = 0;
if (hour >= 21 || hour < 9) off = osloMs(+p.year, +p.month, +p.day - (hour < 9 ? 1 : 0), 20) - now0;
if (off) {
  class DayDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + off); else super(...a); }
    static now() { return RealDate.now() + off; }
  }
  globalThis.Date = DayDate;
}

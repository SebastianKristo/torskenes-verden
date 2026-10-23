// Prompt 46 (GLIMT46): nye verktøy i det felles registeret (TOOLS45): vær med sted/tid, abonnementer, faste utgifter og
// avslutningsfrist i Subscription OS. Samme form som verktøyene i tools.js: validate → run → verify. Tallene regnes ut her.
import { TOOLS45, TOOL45, kr45 } from './tools.js';
import { whenOf45, longDate45, todayOslo45, MON45, isIsoDate45 } from './dates.js';
import { analyzeWeather46, whenOf46, fetchWeather46, weatherSentence46, weatherCard46, placesIn46 } from './weather46.js';
import { subscriptions46, fixedCosts46, chargesInMonth46, upsertCancelDeadline46, findService46, serviceInText46, trialById46, fold } from './subs46.js';

const ask = (question, options = null, field = null) => ({ ask: { question, ...(options ? { options } : {}), ...(field ? { field } : {}) } });
const str = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const sTxt = (d) => ({ type: 'string', description: d });
const krm = (v) => kr45(Math.round(v));
const joinNo = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}`);
const PER = { weekly: 'uke', monthly: 'måned', quarterly: 'kvartal', halfyearly: 'halvår', yearly: 'år', biennial: 'andre år' };
const perOf = (x) => (x.cycleLabel ? `per ${x.cycleLabel}` : PER[x.cycle] ? `per ${PER[x.cycle]}` : '(ukjent intervall)');

/* ---------------- Vær ---------------- */

const weatherTool = {
  name: 'weather.get', module: 'weather', destructive: false, parallel: true,
  description: 'Vær for ett sted og én tid: nå, i dag, i morgen, en ukedag, helgen eller neste uke. Ett kall per (sted, tid); flere steder/tider → flere kall.',
  parameters: S({ place: sTxt('Stedet slik brukeren skrev det («Oslo», «New York»), tomt = brukerens sted'), when: sTxt('Tiden slik brukeren skrev den («nå», «i dag», «i morgen», «på fredag», «neste uke»)'),
    info: { type: 'string', enum: ['summary', 'temp', 'precip', 'wind'], description: 'Hva brukeren spør om' } }),
  async validate(args, ctx) {
    // Fasit er teksten: delspørsmålene fra den deterministiske oppdelingen. Modellens sted brukes bare når det står i teksten.
    if (args._req) return { args: { ...args._req, compare: args.compare ?? null } };
    const a = analyzeWeather46(ctx.text, ctx.today);
    if (a.ask) return ask(a.ask);
    const place = str(args.place, 60);
    const inText = place && fold(ctx.text).includes(fold(place));
    const hit = a.requests.find((r) => r.place && fold(r.place) === fold(place)) ?? (inText ? null : a.requests[0]);
    const w = str(args.when, 40);
    const when = (w && fold(ctx.text).includes(fold(w)) ? whenOf46(w, ctx.today) : null) ?? hit?.when ?? whenOf46('i dag', ctx.today);
    const info = ['summary', 'temp', 'precip', 'wind'].includes(args.info) ? args.info : hit?.info ?? 'summary';
    if (place && !inText && !hit) return { error: `«${place}» står ikke i spørsmålet` };
    return { args: { place: inText ? (placesIn46(ctx.text).find((p) => fold(p) === fold(place)) ?? place) : hit?.place ?? null, when, info, compare: args.compare ?? null } };
  },
  async run(a, ctx) {
    const r = await fetchWeather46(ctx.user, a, ctx.today);
    if (!r.ok) return { status: 'failed', error: weatherSentence46(r, ctx.today).replace(/\.$/, ''), result: { ...r, weather: true } };
    return { status: 'done', result: { ...r, weather: true }, cards: [weatherCard46(r)] };
  },
};

/* ---------------- Abonnementer ---------------- */

const subCard = (x) => ({ kind: x.kind === 'trial' ? 'trial' : 'subscription', id: String(x.id), title: x.name, subtitle: x.kind === 'trial' ? `Prøveperiode · slutter ${x.endsAt}${x.priceAfter ? ` · ${krm(x.priceAfter)}/mnd etterpå` : ''}`
  : x.uncertain ? `${x.price ? `${krm(x.price)} ` : ''}${x.uncertain === 'cycle' ? '· ukjent intervall' : '· mangler pris'}` : `${krm(x.monthly)}/mnd · ${krm(x.yearly)}/år${x.shared ? ' · din del' : ''}`,
amount: x.yearly ?? null, monthly: x.monthly ?? null, yearly: x.yearly ?? null, cycle: x.cycle ?? null, open: x.open ?? null });
const priceLine = (x) => `${krm(x.price)} ${perOf(x)}${x.shared ? ' (din del av et delt abonnement)' : ''}`;

const subsTool = {
  name: 'finance.subscriptions', module: 'finance', destructive: false,
  description: 'Abonnementene brukeren har registrert (Subscription OS): dyreste/billigste, sum per måned/år, liste, prisøkninger. Koden normaliserer til måned og år.',
  parameters: S({ mode: { type: 'string', enum: ['top', 'bottom', 'total', 'list', 'increased'], description: 'top = dyreste, bottom = billigste, total = sum, list = alle, increased = blitt dyrere' },
    basis: { type: 'string', enum: ['yearly', 'monthly'], description: 'Sammenlign per år (standard) eller per måned' }, limit: { type: 'integer', description: 'Hvor mange (f.eks. 5)' } }),
  async validate(args, ctx) {
    const t = ctx.text.toLowerCase();
    const mode = ['top', 'bottom', 'total', 'list', 'increased'].includes(args.mode) ? args.mode
      : /dyrere|økt|øker|prisøk|steget|gått\s+opp/.test(t) ? 'increased'
        : /billigst|minst|lavest/.test(t) ? 'bottom'
          : /totalt|til\s+sammen|samlet|sum|hvor\s+mye\s+(?:betaler|bruker)/.test(t) && !/mest|dyrest|størst/.test(t) ? 'total'
            : /dyrest|mest|størst|høyest|koster\s+mest/.test(t) ? 'top' : 'list';
    const basis = ['yearly', 'monthly'].includes(args.basis) ? args.basis : /per\s+måned|i\s+måneden|hver\s+måned|månedlig|regner\s+per\s+måned|per\s+mnd/.test(t) ? 'monthly' : 'yearly';
    const n = /(?<![a-zæøå])(?:topp|de)\s+(\d+|tre|fem|ti)\b/.exec(t)?.[1];
    const limit = Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 20) : n ? ({ tre: 3, fem: 5, ti: 10 }[n] ?? +n) : mode === 'top' || mode === 'bottom' ? 1 : 10;
    return { args: { mode, basis, limit } };
  },
  async run(a, ctx) {
    const { items } = await subscriptions46(ctx.user, ctx.today);
    const paid = items.filter((x) => x.kind === 'subscription');
    const known = paid.filter((x) => !x.uncertain).sort((x, y) => y.yearly - x.yearly || x.name.localeCompare(y.name, 'nb'));
    const uncertain = paid.filter((x) => x.uncertain);
    const trials = items.filter((x) => x.kind === 'trial');
    const total = { monthly: Math.round(known.reduce((s, x) => s + x.monthly, 0) * 100) / 100, yearly: Math.round(known.reduce((s, x) => s + x.yearly, 0) * 100) / 100 };
    let list = known;
    if (a.mode === 'bottom') list = [...known].reverse();
    if (a.mode === 'increased') list = paid.filter((x) => x.increasePct > 0).sort((x, y) => y.increasePct - x.increasePct);
    return { status: 'done', result: { mode: a.mode, basis: a.basis, count: paid.length, ranked: list.slice(0, Math.max(a.limit, a.mode === 'top' || a.mode === 'bottom' ? 4 : a.limit)).map((x) => ({ id: x.id, name: x.name, price: x.price, cycle: x.cycle, monthly: x.monthly, yearly: x.yearly, shared: x.shared, increasePct: x.increasePct ?? null, prevPrice: x.prevPrice ?? null, priceChanged: x.priceChanged ?? null })),
      total, uncertain: uncertain.map((x) => ({ id: x.id, name: x.name, reason: x.uncertain })), trials: trials.map((x) => ({ name: x.name, endsAt: x.endsAt, priceAfter: x.priceAfter })), source: 'Subscription OS' },
    cards: (a.mode === 'list' || a.mode === 'total' ? [...known, ...uncertain, ...trials] : list.slice(0, Math.max(a.limit, 5))).map(subCard), items: list };
  },
};
function subsSentence(a, r, today) {
  const res = r.result;
  if (!res.count) return `Du har **ingen registrerte abonnementer** i Subscription OS.${res.trials.length ? ` Bare ${res.trials.length === 1 ? 'en prøveperiode' : `${res.trials.length} prøveperioder`}: ${joinNo(res.trials.map((t) => `${t.name} (gratis til ${longDate45(t.endsAt, today)})`))}.` : ''}`;
  const unc = res.uncertain.length ? ` ${joinNo(res.uncertain.map((x) => `«${x.name}»`))} ${res.uncertain.length === 1 ? 'mangler' : 'mangler'} ${res.uncertain.every((x) => x.reason === 'price') ? 'pris' : res.uncertain.every((x) => x.reason === 'cycle') ? 'betalingsintervall' : 'pris eller betalingsintervall'}, så ${res.uncertain.length === 1 ? 'det' : 'de'} er ikke med i sammenligningen.` : '';
  const [first, ...rest] = res.ranked;
  if (a.mode === 'top' || a.mode === 'bottom') {
    if (!first) return `Ingen av abonnementene har både pris og betalingsintervall, så jeg kan ikke rangere dem.${unc}`;
    const word = a.mode === 'top' ? 'dyreste' : 'billigste';
    const basisTxt = a.basis === 'monthly' ? 'regnet per måned' : 'rangert etter årskostnad';
    const head = a.limit > 1
      ? `De ${a.limit} ${word} abonnementene dine (${basisTxt}): ${res.ranked.slice(0, a.limit).map((x, i) => `${i + 1}. **${x.name}** ${krm(x.monthly)}/mnd (${krm(x.yearly)}/år)`).join(', ')}.`
      : `Det ${word} abonnementet ditt er **${first.name}**, som koster **${priceLine({ ...first, cycleLabel: null })}**. Det tilsvarer omtrent **${krm(first.monthly)} per måned** og **${krm(first.yearly)} per år** (${basisTxt}).`;
    const more = a.limit <= 1 && rest.length ? ` Deretter: ${rest.slice(0, 3).map((x) => `${x.name} ${krm(x.monthly)}/mnd`).join(', ')}.` : '';
    return `${head}${more}${unc}`;
  }
  if (a.mode === 'total') return `Du betaler **${krm(res.total.monthly)} per måned** for abonnementer, omtrent **${krm(res.total.yearly)} per år** (${res.count - res.uncertain.length} abonnementer, årlige trekk regnet om til måned).${unc}${res.trials.length ? ` ${res.trials.length === 1 ? 'Én prøveperiode er' : `${res.trials.length} prøveperioder er`} gratis nå og ikke med.` : ''}`;
  if (a.mode === 'increased') {
    if (!res.ranked.length) return 'Ingen av abonnementene dine har registrert en prisøkning.';
    return `${res.ranked.length === 1 ? 'Ett abonnement har' : `${res.ranked.length} abonnementer har`} blitt dyrere: ${joinNo(res.ranked.slice(0, 5).map((x) => `**${x.name}** ${krm(x.prevPrice)} → ${krm(x.price)} ${perOf(x)} (+${x.increasePct} %${x.priceChanged ? `, ${longDate45(x.priceChanged, today)}` : ''})`))}.`;
  }
  return `Du har **${res.count} abonnementer**: ${res.ranked.slice(0, 8).map((x) => `${x.name} ${krm(x.monthly)}/mnd`).join(', ')}${res.ranked.length > 8 ? ' …' : ''}. Totalt ${krm(res.total.monthly)} per måned.${unc}`;
}

const fixedTool = {
  name: 'finance.fixed', module: 'finance', destructive: false,
  description: 'Faste utgifter (abonnementer + faste trekk i Budsjett): de største, sum, eller hvilke som trekkes en bestemt måned.',
  parameters: S({ mode: { type: 'string', enum: ['top', 'month', 'total'] }, limit: { type: 'integer' }, month: sTxt('YYYY-MM eller «denne måneden»') }),
  async validate(args, ctx) {
    const t = ctx.text.toLowerCase();
    const mode = ['top', 'month', 'total'].includes(args.mode) ? args.mode : /denne\s+måned|i\s+måned|neste\s+måned|i\s+(?:januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)/.test(t) ? 'month' : /totalt|sum|til\s+sammen/.test(t) ? 'total' : 'top';
    const n = /(?<![a-zæøå])(\d+|tre|fem|ti)\s+(?:største|dyreste|faste)/.exec(t)?.[1];
    const limit = Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 20) : n ? ({ tre: 3, fem: 5, ti: 10 }[n] ?? +n) : 5;
    let ym = /^\d{4}-\d{2}$/.test(String(args.month ?? '')) ? args.month : ctx.today.slice(0, 7);
    if (/neste\s+måned/.test(t)) { const y = +ctx.today.slice(0, 4), m = +ctx.today.slice(5, 7); ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }
    const mi = MON45.findIndex((x) => new RegExp(`i\\s+${x}`).test(t));
    if (mi >= 0) { const y = +ctx.today.slice(0, 4); ym = `${mi + 1 < +ctx.today.slice(5, 7) ? y + 1 : y}-${String(mi + 1).padStart(2, '0')}`; }
    return { args: { mode, limit, month: ym } };
  },
  async run(a, ctx) {
    if (a.mode === 'month') {
      const list = await chargesInMonth46(ctx.user, a.month, ctx.today);
      const total = Math.round(list.reduce((s, x) => s + x.price, 0) * 100) / 100;
      return { status: 'done', result: { mode: 'month', month: a.month, count: list.length, total, items: list.map((x) => ({ name: x.name, date: x.date, price: x.price, source: x.source })) },
        cards: list.map((x) => ({ ...subCard(x), subtitle: `${x.date} · ${krm(x.price)} · ${x.source}` })) };
    }
    const all = await fixedCosts46(ctx.user, ctx.today);
    const known = all.filter((x) => !x.uncertain).sort((x, y) => y.monthly - x.monthly);
    const total = { monthly: Math.round(known.reduce((s, x) => s + x.monthly, 0) * 100) / 100, yearly: Math.round(known.reduce((s, x) => s + x.yearly, 0) * 100) / 100 };
    return { status: 'done', result: { mode: a.mode, count: all.length, total, top: known.slice(0, a.limit).map((x) => ({ name: x.name, monthly: x.monthly, yearly: x.yearly, price: x.price, cycle: x.cycle, source: x.source })), uncertain: all.filter((x) => x.uncertain).map((x) => x.name) },
      cards: known.slice(0, a.limit).map((x) => ({ ...subCard(x), subtitle: `${krm(x.monthly)}/mnd · ${x.source}` })) };
  },
};
function fixedSentence(a, r, today) {
  const res = r.result;
  if (!res.count) return a.mode === 'month' ? `Ingen faste betalinger er registrert i ${MON45[+res.month.slice(5, 7) - 1]}.` : 'Du har **ingen faste utgifter** registrert (verken abonnementer eller faste trekk i Budsjett).';
  if (a.mode === 'month') return `Faste betalinger i ${MON45[+res.month.slice(5, 7) - 1]}: ${res.items.slice(0, 8).map((x) => `${x.name} ${krm(x.price)} (${+x.date.slice(8)}.)`).join(', ')}${res.items.length > 8 ? ' …' : ''}. Totalt **${krm(res.total)}**.`;
  if (a.mode === 'total') return `Faste utgifter til sammen: **${krm(res.total.monthly)} per måned** (≈ ${krm(res.total.yearly)} per år).`;
  return `De ${res.top.length} største faste utgiftene dine (per måned): ${res.top.map((x, i) => `${i + 1}. **${x.name}** ${krm(x.monthly)}`).join(', ')}.${res.uncertain.length ? ` ${joinNo(res.uncertain.map((x) => `«${x}»`))} mangler pris eller intervall og er ikke med.` : ''}`;
}

/* ---------------- Avslutningsfrist (Subscription OS → Prøveperioder) ---------------- */

export const CANCEL_RE46 = /(?<![a-zæøå])(avslutt\w*|si\s+opp|sier\s+opp|oppsigelse|kansell\w*|avbestill\w*|stopp(?:e)?\s+(?:abonnement\w*|prøve\w*)|unngå\s+å\s+bli\s+belastet)(?![a-zæøå])/i;
const trialTool = {
  name: 'subscriptions.trial', module: 'finance', destructive: false,
  description: 'Registrer/oppdater at et abonnement eller en gratis prøveperiode må avsluttes innen en dato (vises i Subscription OS → Prøveperioder). Brukes sammen med tasks.create når brukeren vil bli minnet på det.',
  parameters: S({ service: sTxt('Tjenesten («Spotify»)'), date: sTxt('Datoen brukeren oppga for avslutningen («15.10», «neste fredag»)'), trial_end: sTxt('Når prøveperioden går ut, bare hvis brukeren sa det') }, ['service']),
  async validate(args, ctx) {
    const { serviceOf } = await import('../../public/js/trial-parse.js');
    const own = serviceInText46(ctx.user, ctx.text);
    let service = own ?? (str(args.service, 60) && fold(ctx.text).includes(fold(str(args.service, 60))) ? str(args.service, 60) : '') ?? '';
    if (!service) { const s = serviceOf(ctx.text); if (s && !/^(minn|husk|jeg|legg|vi|avslutt|si|kanseller)$/i.test(s)) service = s; }
    if (!service) return ask('Hvilken tjeneste må avsluttes?', null, 'service');
    const hits = findService46(ctx.user, service);
    const subs = hits.filter((x) => x.kind === 'subscription');
    if (subs.length > 1 && !hits.some((x) => x.kind === 'trial')) return ask(`Hvilket ${service}-abonnement mener du?`, subs.map((x) => ({ id: `sub-${x.id}`, label: `${x.name}${x.plan ? ` (${x.plan})` : ''} · ${krm(x.price)}` })), 'service');
    const w = whenOf45(ctx.text, ctx.today, { prefer: 'future', nowMin: ctx.nowMin, timeWithoutDate: 'none' });
    if (w.errors.length) return ask(`${w.errors[0].message}. Hvilken dato må ${service} avsluttes innen?`, null, 'date');
    let date = w.date;
    // «… før prøveperioden går ut» uten dato: fristen er den kjente sluttdatoen for prøven (dagen før, så den rekkes).
    const trial = hits.find((x) => x.kind === 'trial')?.row;
    if (!date && trial && /før\s+(?:prøve\w*|gratisperiode\w*)\s+(?:går\s+ut|slutter|utløper)|før\s+jeg\s+blir\s+belastet|før\s+(?:det|den)\s+(?:begynner\s+å\s+koste|koster)/i.test(ctx.text)) date = trial.ends_at;
    if (!date) return ask(trial ? `Prøven på ${trial.service} slutter ${longDate45(trial.ends_at, ctx.today)}. Vil du avslutte innen da, eller en annen dato?` : `Når må ${service} avsluttes? Jeg vet ikke når prøveperioden går ut.`, trial ? [{ id: trial.ends_at, label: longDate45(trial.ends_at, ctx.today) }] : null, 'date');
    if (date < ctx.today) return { error: `${longDate45(date, ctx.today)} er passert` };
    // Brukeren sa når prøven går ut («prøveperioden går ut 15.10») → det er sluttdatoen, ikke bare en frist.
    const trialEnd = /prøve\w*\s+(?:går\s+ut|slutter|utløper|varer\s+til)|gratis\s+til/i.test(ctx.text) ? date : (isIsoDate45(args.trial_end) && /prøve|gratis/i.test(ctx.text) ? args.trial_end : null);
    return { args: { service, date, trialEnd, subscriptionId: subs[0]?.id ?? null } };
  },
  async run(a, ctx) {
    const r = await upsertCancelDeadline46(ctx.user, { service: a.service, date: a.date, trialEnd: a.trialEnd, subscriptionId: a.subscriptionId, today: ctx.today });
    return { status: 'done', result: r, cards: [{ kind: 'trial', id: String(r.trial.id), title: r.trial.service, subtitle: `Avslutt innen ${longDate45(a.date, ctx.today)}${r.trial.priceAfter ? ` · ${krm(r.trial.priceAfter)}/mnd etterpå` : ''}`, date: a.date, open: { web: '/finans/#/abonnement', deepLink: 'finanshub://abonnement' } }] };
  },
  async verify(r, ctx) {
    const row = trialById46(ctx.user, r.result?.trial?.id);
    return !!row && row.status === 'active' && row.cancel_by === r.result.trial.cancelBy;
  },
};
function trialSentence(a, r, today) {
  const res = r.result, t = res.trial;
  const sub = res.subscription ? ` Koblet til abonnementet ${res.subscription.name}${res.subscription.price ? ` (${krm(res.subscription.price)} ${PER[res.subscription.cycle] ? `per ${PER[res.subscription.cycle]}` : ''})`.replace(/\s+\)/, ')') : ''}; prisen og resten er uendret.` : '';
  if (res.status === 'unchanged') return `**${t.service}** står allerede i Prøveperioder med frist ${longDate45(a.date, today)}.`;
  if (res.status === 'updated') return `Oppdatert **${t.service}** i Abonnementer → Prøveperioder: avsluttes innen **${longDate45(a.date, today)}**${res.previous?.cancelBy && res.previous.cancelBy !== a.date ? ` (var ${longDate45(res.previous.cancelBy, today)})` : ''}.${t.endsKind === 'trial_end' && t.endsAt !== a.date ? ` Prøven slutter ${longDate45(t.endsAt, today)}.` : ''}${sub}`;
  return `Registrert i Abonnementer → Prøveperioder: **${t.service}** må avsluttes innen **${longDate45(a.date, today)}**.${a.trialEnd ? '' : ' Når prøven faktisk slutter, vet jeg ikke – si fra hvis du vet det.'}${sub}`;
}

/* ---------------- Registrering ---------------- */

export const SENTENCES46 = {
  'finance.subscriptions': subsSentence, 'finance.fixed': fixedSentence, 'subscriptions.trial': trialSentence,
  'weather.get': (a, r, today) => weatherSentence46(r.result, today),
};
export const FAIL_TEXT46 = { 'weather.get': 'Været', 'finance.subscriptions': 'Fikk ikke lest abonnementene fra Subscription OS', 'finance.fixed': 'Fikk ikke lest de faste utgiftene', 'subscriptions.trial': 'Fikk ikke registrert det i Abonnementer → Prøveperioder' };
for (const t of [weatherTool, subsTool, fixedTool, trialTool]) {
  if (TOOL45[t.name]) continue;
  // Før app.answer/chat.answer (rekkefølgen i registeret er rekkefølgen modellen ser).
  const i = TOOLS45.findIndex((x) => x.name === 'app.answer');
  TOOLS45.splice(i < 0 ? TOOLS45.length : i, 0, t);
  TOOL45[t.name] = t;
}
export { todayOslo45 };

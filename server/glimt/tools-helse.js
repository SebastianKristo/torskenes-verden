// Prompt 57: Glimt svarer på egne helsespørsmål («hvor mye sov jeg?», «hvor mange skritt i dag?», «når trente jeg sist?»,
// «hva veier jeg?») med lese-verktøyet health.get i det felles registeret (samme form som tools-weather-subs.js).
//
// Personvern: svaret lages her, av tallene fra server/helse/ (bare brukerens egne data), aldri av en modell. Helsedata går aldri til
// eksterne AI-tjenester: spørsmålene over går rett til verktøyet (fastPath47 i engine.js, uten planlegger), og planleggeren
// (som bare ser spørsmålet, ikke tallene) er alltid en lokal modell (localOnly i engine.js). Resultatet og svaret lagres ikke i
// Glimt-tracen (trace.js) og ikke i svar-cachen (fast/cache.js kjenner ikke verktøyet).
import { TOOLS45, TOOL45 } from './tools.js';
import { SENTENCES46, FAIL_TEXT46 } from './tools-weather-subs.js';
import { registerLocalPlanHelse57 } from './plan.js';
import { helseFor } from '../helse/index.js';
import { addDays } from '../dates/oslo.js';
import { heltall, distanse, timerMin } from '../helse/regler.js';

export const HELSE_WHAT57 = ['sleep', 'steps', 'workout', 'weight', 'summary'];
const L = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const W = (re) => new RegExp(`(?<![\\p{L}])(?:${re})(?![\\p{L}])`, 'u');
const OWN = W('jeg|meg|min|mitt|mine');
const SLEEP = W('sov|søvn|søvnen|sovet|sovnet|våknet');
const STEPS = W('skritt|skrittene|gått i dag|gikk i dag|gått i går|gikk i går|hvor langt har jeg gått');
const WORKOUT = W('trente|trent|treningsøkt\\w*|økt|økta|økten|løpte|løpetur\\w*|syklet|svømte|siste trening|trening(?:en)? (?:min|i går|denne uka?|denne uken|forrige uke)');
const WEIGHT = W('veier|veide|vekt|vekta|vekten');
// Ikke for planer og avtaler («når er treningen i morgen?», «legg inn trening»): det er kalenderen.
const FUTURE = W('i morgen|neste|skal|legg inn|legg til|minn|påminn\\w*|book\\w*|kl\\.?');

/** Hva spørsmålet gjelder. → 'sleep'|'steps'|'workout'|'weight'|'summary'|null */
export function helseHva57(text) {
  const t = L(text);
  if (!t || !OWN.test(t)) return null;
  if (WEIGHT.test(t)) return 'weight';
  if (SLEEP.test(t)) return 'sleep';
  if (WORKOUT.test(t) && !FUTURE.test(t)) return 'workout';
  if (STEPS.test(t)) return 'steps';
  if (/(?<![\p{L}])helsa?(?:\s+min)?(?![\p{L}])|helsedata/u.test(t) && !FUTURE.test(t)) return 'summary';
  return null;
}
/** Hurtigvei (fastPath47): et rent spørsmål om egen søvn, skritt, trening eller vekt. → {what, when} | null */
export function helseSporsmal57(text) {
  const t = L(text);
  if (t.length > 140 || !/\?\s*$|^(?:hvor|hva|når|hvordan|har|fikk|sov|vis|si)(?![\p{L}])/u.test(t)) return null;
  const what = helseHva57(t);
  if (!what) return null;
  return { what, when: W('i går|natt til i går').test(t) ? 'i går' : W('snitt|gjennomsnitt\\w*|denne uka|denne uken|siste uke|siste 7').test(t) ? 'uke' : 'i dag' };
}

const healthTool = {
  name: 'health.get', module: 'health', destructive: false, parallel: true,
  description: 'Brukerens egne helsetall fra Apple Helse: søvn i natt og snitt, skritt i dag, siste treningsøkt og vekt. Bare lesing.',
  parameters: { type: 'object', properties: { what: { type: 'string', enum: HELSE_WHAT57, description: 'Hva brukeren spør om' }, when: { type: 'string', description: '«i dag», «i går» eller «uke» (snitt)' } }, additionalProperties: false },
  validate(args, ctx) {
    const fromText = helseSporsmal57(ctx.text) ?? (helseHva57(ctx.text) ? { what: helseHva57(ctx.text), when: 'i dag' } : null);
    const what = HELSE_WHAT57.includes(args?.what) ? args.what : fromText?.what ?? 'summary';
    const when = ['i dag', 'i går', 'uke'].includes(args?.when) ? args.when : fromText?.when ?? 'i dag';
    return { args: { what, when } };
  },
  async run(args, ctx) {
    const h = helseFor(ctx.user, { periode: 'uke' });
    return { status: 'done', result: { what: args.what, when: args.when, ...svar57(h, args) }, cards: [] };
  },
};

const NONE = 'Jeg har ingen helsedata fra deg ennå. Slå på Apple Helse i appen under Innstillinger → Husstand → Helse.';
/** Svaret av tallene. → {text, has} */
export function svar57(h, { what, when }) {
  if (h.empty) return { has: false, text: NONE };
  const today = h.date, y = addDays(today, -1);
  const serie = (k) => h.trends.find((x) => x.key === k)?.serie ?? [];
  if (what === 'sleep') {
    const s = h.sleep;
    if (when === 'uke') return s.avg7Text ? { has: true, text: `Du har sovet ${s.avg7Text} i snitt de siste ${s.avg7Nights === 1 ? 'natten' : `${s.avg7Nights} nettene`}.` } : { has: false, text: 'Jeg har ingen søvn fra de siste 7 nettene.' };
    if (when === 'i går') {
      const v = serie('sleep').find((x) => x.date === y)?.value;
      return v != null ? { has: true, text: `Natt til i går sov du ${timerMin(v)}.` } : { has: false, text: 'Jeg har ingen søvn for natt til i går.' };
    }
    const n = s.tonight;
    if (n) return { has: true, text: `Du sov ${n.asleepText} i natt${n.range ? ` (${n.range})` : ''}.${s.avg7Text && s.avg7Nights > 1 ? ` Snittet de siste ${s.avg7Nights} nettene er ${s.avg7Text}.` : ''}` };
    if (s.last) return { has: true, text: `Jeg har ingen søvn for i natt ennå. Sist: ${s.last.asleepText} ${s.last.dayText}.` };
    return { has: false, text: 'Jeg har ingen søvndata ennå. Søvn kommer fra Apple Helse (klokka eller sengetid på iPhone).' };
  }
  if (what === 'steps') {
    if (when === 'i går') {
      const v = serie('steps').find((x) => x.date === y)?.value, d = serie('distance').find((x) => x.date === y)?.value;
      return v != null ? { has: true, text: `I går gikk du ${heltall(v)} skritt${d != null ? ` (${distanse(d)})` : ''}.` } : { has: false, text: 'Jeg har ingen skritt for i går.' };
    }
    if (when === 'uke') { const t = h.trends.find((x) => x.key === 'steps'); return t?.avgText ? { has: true, text: `Du har gått ${t.avgText} skritt i snitt de siste 7 dagene.` } : { has: false, text: 'Jeg har ingen skritt fra de siste 7 dagene.' }; }
    return h.today.steps != null
      ? { has: true, text: `Du har gått ${h.today.stepsText} skritt i dag${h.today.distanceText ? ` (${h.today.distanceText})` : ''}.` }
      : { has: false, text: 'Jeg har ingen skritt for i dag ennå.' };
  }
  if (what === 'workout') {
    const w = h.workouts.last;
    if (!w) return { has: false, text: 'Jeg finner ingen treningsøkter i Apple Helse.' };
    const det = [w.durationText, w.distanceText, w.kcalText].filter(Boolean).join(', ');
    const week = when === 'uke' ? ` Siste 7 dager: ${h.workouts.totalText.toLowerCase()}.` : '';
    return { has: true, text: `Sist du trente var ${w.dayText}${w.start ? ` kl. ${w.start}` : ''}: ${w.label}, ${det}.${week}` };
  }
  if (what === 'weight') {
    const v = h.weight;
    if (!v) return { has: false, text: 'Jeg har ingen vekt fra Apple Helse.' };
    return { has: true, text: `Du veier ${v.kgText} (målt ${v.dayText}).${v.changeText ? ` ${v.changeText.replace(/^./, (c) => c.toUpperCase())}.` : ''}` };
  }
  return h.summary ? { has: true, text: h.summary } : { has: false, text: NONE };
}

SENTENCES46['health.get'] = (a, r) => r.result?.text ?? null;
FAIL_TEXT46['health.get'] = 'Fikk ikke lest helsedataene';
if (!TOOL45['health.get']) {
  const i = TOOLS45.findIndex((x) => x.name === 'app.answer');
  TOOLS45.splice(i < 0 ? TOOLS45.length : i, 0, healthTool);
  TOOL45['health.get'] = healthTool;
}
// Lokal plan (modellen nede, og hint til planleggeren): samme gjenkjenning som hurtigveien.
registerLocalPlanHelse57((text) => {
  const h = helseSporsmal57(text);
  return h ? { intent: 'ask', module: 'health', calls: [{ tool: 'health.get', args: h }], engine: 'lokal' } : null;
});

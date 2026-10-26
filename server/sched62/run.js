// Prompt 62 (prompt 49 del 2, D2SRV): én kjøring av en planlagt oppgave.
//   power    – strømpriser fra power-price.js (hvakosterstrommen.no / Home Assistant), billigste og dyreste time – ingen modell
//   reminder – påminnelsen som den er – ingen modell
//   query    – en vanlig Glimt-forespørsel (agent45) med bakgrunnsprioritet i gaten; svaret leveres som push
// Betingelse: dataene hentes i koden og uttrykket evalueres i koden (cond.js) – modellen vurderer aldri betingelsen. Ikke oppfylt =
// condition_false (ingen varsel). Morgendagens strømpriser ikke publisert ennå → nytt forsøk om 30 min (til kl. 21).
// Levering: push i appen (notifyUser). Finans: push-teksten er generell, detaljene bare i appen (kjøringsloggen er lokal).
import { insertRun62, finishRun62, publicRun62 } from './store.js';
import { evalCondition62, conditionSentence62 } from './cond.js';
import { sched62 } from './settings.js';
import { osloParts62 } from '../glimt45/dates.js';

const J = (s, d) => { if (s == null) return d; try { return JSON.parse(s) ?? d; } catch { return d; } };
const nb = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const pad = (n) => String(n).padStart(2, '0');
const hh = (h) => `${pad(h)}–${pad((h + 1) % 24)}`;

// Testkroker: falske data og falsk Glimt (aldri i produksjon).
let powerImpl = null, weatherImpl = null, agentImpl = null, notifyImpl = null;
export const _setSchedData62 = ({ power, weather, agent, notify } = {}) => {
  if (power !== undefined) powerImpl = power; if (weather !== undefined) weatherImpl = weather;
  if (agent !== undefined) agentImpl = agent; if (notify !== undefined) notifyImpl = notify;
};

/** Strømprisene (kr/kWh med mva) for sonen og dagen. → {zone, date, hours:[{hour, kr}], price_nok_kwh:[…], cheapest, priciest, avg, source} */
export async function powerData62(zone, day, now) {
  const p = powerImpl ? await powerImpl({ zone, when: day, now }) : await (await import('../power-price.js')).powerPrice({ zone, when: day, now });
  const hours = (p.hours ?? []).map((h) => ({ hour: h.hour, kr: Math.round(h.ore) / 100 }));
  if (!hours.length) throw new Error('Ingen priser');
  const cheap = hours.reduce((a, b) => (b.kr < a.kr ? b : a)), dear = hours.reduce((a, b) => (b.kr > a.kr ? b : a));
  return { zone, date: p.date, hours, price_nok_kwh: hours.map((h) => h.kr), cheapest: { hour: hh(cheap.hour), kr: cheap.kr }, priciest: { hour: hh(dear.hour), kr: dear.kr },
    avg: hours.reduce((a, b) => a + b.kr, 0) / hours.length, source: p.source ?? null, vat: p.vat !== false };
}
/** Været for stedet og dagen. → {place, temp_c:[lav, høy], precip_mm:[…]} */
async function weatherData62(user, place, day, now) {
  if (weatherImpl) return weatherImpl({ place, day, now });
  const { fetchWeather46, whenOf46 } = await import('../glimt45/weather46.js');
  const today = osloParts62(now).date;
  const r = await fetchWeather46(user, { place, when: whenOf46(day === 'tomorrow' ? 'i morgen' : 'i dag', today), info: 'temp' }, today);
  if (!r.ok) throw Object.assign(new Error(r.error ?? 'Fikk ikke hentet været'), { notYet: !!r.missing });
  const d = r.days?.[0] ?? {};
  return { place: r.place, temp_c: [d.lo, d.hi].filter((v) => v != null), precip_mm: [d.precip ?? d.precipSum ?? (d.precipProb != null ? (d.precipProb >= 60 ? 1 : 0) : null)].filter((v) => v != null) };
}
const powerText = (d, day) => `Strømprisen i ${d.zone} ${day === 'tomorrow' ? 'i morgen' : 'i dag'}: snitt ${nb(d.avg)} kr/kWh${d.vat ? ' med mva' : ''}. Billigste time kl. ${d.cheapest.hour} (${nb(d.cheapest.kr)} kr), dyreste kl. ${d.priciest.hour} (${nb(d.priciest.kr)} kr).${d.source ? ` Kilde: ${d.source}.` : ''}`;

async function deliver(row, text, { runId, isPrivate }) {
  const body = isPrivate ? `${row.title}: oppsummeringen er klar – åpne appen for å se den.` : text;
  const msg = { title: row.title, body, url: '/#/innstillinger/faste-oppgaver', tag: `sched-${row.id}`, category: 'planlagt',
    data: { kind: 'schedule.run', scheduleId: row.id, runId, deepLink: 'finanshub://faste-oppgaver', icon: '/assets/glimt-varsel.png', badge: '/assets/glimt-badge.png' } };
  if (row.channel !== 'push') return { channel: row.channel, delivered: false, pushed: 0, skipped: 'ukjent kanal' };
  try {
    const r = notifyImpl ? await notifyImpl(row.user_id, msg) : await (await import('../notify.js')).notifyUser(row.user_id, msg);
    return { channel: 'push', delivered: r.id != null || r.pushed > 0 || r.realtime > 0, pushed: r.pushed ?? 0, skipped: r.skipped ?? null, ...(isPrivate ? { private: true } : {}) };
  } catch (e) { return { channel: 'push', delivered: false, pushed: 0, skipped: null, error: String(e?.message ?? e).slice(0, 160) }; }
}

/**
 * Beregner resultatet (uten levering). → {status:'ok'|'failed'|'condition_false'|'skipped', result?, condition?, reason?, error?, traceId?, private?, retry?}
 */
export async function compute62(row, { now = Date.now(), runId = null } = {}) {
  const set = sched62(row.user_id);
  if (!set.enabled) return { status: 'skipped', reason: 'Planlagte oppgaver er slått av' };
  const params = J(row.params, {});
  const cond = J(row.condition, null);
  try {
    if (cond) {
      if (!set.conditions) return { status: 'skipped', reason: 'Betingede varsler er slått av' };
      let data;
      try { data = cond.source === 'power' ? await powerData62(params.zone ?? 'NO1', cond.day ?? 'tomorrow', now) : await weatherData62(row.user_id, params.place ?? cond.place ?? null, cond.day ?? 'tomorrow', now); }
      catch (e) {
        const notYet = !!e?.notYet || /ikke publisert/i.test(String(e?.message));
        return { status: 'failed', error: String(e?.message ?? e).slice(0, 200), retry: notYet || cond.source === 'power', reason: notYet ? 'Dataene er ikke publisert ennå' : null };
      }
      const res = evalCondition62(cond.expr, data); // KODE, aldri modellen
      const condOut = { expr: cond.expr, value: res.value, met: res.met, parts: res.parts, ...(res.missing ? { missing: res.missing } : {}),
        data: cond.source === 'power' ? { zone: data.zone, date: data.date, max: Math.max(...data.price_nok_kwh), min: Math.min(...data.price_nok_kwh), cheapest: data.cheapest, priciest: data.priciest } : { place: data.place, temp_c: data.temp_c, precip_mm: data.precip_mm } };
      if (res.missing) return { status: 'failed', condition: condOut, error: `Mangler data (${res.missing.join(', ')})`, retry: true };
      if (!res.met) return { status: 'condition_false', condition: condOut, reason: `Ikke oppfylt: ${cond.label}` };
      return { status: 'ok', condition: condOut, result: conditionSentence62(cond, res, data) ?? `Betingelsen er oppfylt: ${cond.label}.` };
    }
    if (row.kind === 'reminder') return { status: 'ok', result: `Påminnelse: ${row.what.charAt(0).toUpperCase()}${row.what.slice(1)}.` };
    if (row.kind === 'power') {
      const d = await powerData62(params.zone ?? 'NO1', params.day ?? 'today', now);
      return { status: 'ok', result: powerText(d, params.day ?? 'today') };
    }
    // query: en vanlig Glimt-forespørsel med bakgrunnsprioritet.
    const ask = agentImpl ?? (async (user, text, o) => {
      const [{ agent45 }, { runAsUser }] = await Promise.all([import('../glimt45/engine.js'), import('../settings.js')]);
      return runAsUser(user, () => agent45(user, text, o));
    });
    const out = await ask(row.user_id, row.what, { module: 'home', requestId: `sched62-${runId ?? row.id}-${now}`, background: true, scheduled: { id: row.id } });
    const tools = (out?.actions ?? []).map((a) => a.tool);
    if (tools.some((t) => String(t).startsWith('schedule.'))) return { status: 'failed', error: 'En planlagt oppgave kan ikke lage eller endre planlagte oppgaver', traceId: out?.traceId ?? null };
    if (out?.confirm) return { status: 'failed', error: 'Oppgaven ville endret data – det gjør jeg ikke uten at du bekrefter i appen', traceId: out?.traceId ?? null };
    if (out?.ask) return { status: 'failed', error: `Glimt trengte svar på: ${out.ask.question ?? out.reply}`, traceId: out?.traceId ?? null };
    const text = String(out?.reply ?? out?.text ?? '').replace(/\*\*/g, '').trim();
    if (!text) return { status: 'failed', error: 'Glimt ga ikke noe svar', traceId: out?.traceId ?? null };
    const failed = (out.actions ?? []).some((a) => a.status === 'failed');
    const isPrivate = !!row.private || tools.some((t) => /^finance\.|^subscriptions\./.test(t)) || out.module === 'finance';
    return { status: failed ? 'failed' : 'ok', result: text, traceId: out.traceId ?? null, private: isPrivate, ...(failed ? { error: (out.actions.find((a) => a.status === 'failed')?.error ?? 'Et verktøy feilet').slice(0, 200) } : {}) };
  } catch (e) {
    return { status: 'failed', error: String(e?.message ?? e).slice(0, 300) };
  }
}

/**
 * Kjører oppgaven: logger kjøringen, beregner (eller bruker forhåndsberegningen) og leverer. → {run (API-form), retry, raw}
 * o = {plannedAt, trigger:'schedule'|'catchup'|'run-now', now, prepared:{plannedAt, out, at}|null}
 */
export async function runOnce62(row, { plannedAt = Date.now(), trigger = 'schedule', now = Date.now(), prepared = null } = {}) {
  const t0 = Date.now();
  const runId = insertRun62(row, { plannedAt, startedAt: now, status: 'running', trigger });
  const usePrep = prepared && prepared.plannedAt === plannedAt && prepared.out?.status === 'ok' && now - prepared.at < 45 * 60_000;
  const out = usePrep ? prepared.out : await compute62(row, { now, runId });
  let delivery = null;
  if (out.status === 'ok') delivery = await deliver(row, out.result, { runId, isPrivate: !!out.private || !!row.private });
  const fin = finishRun62(runId, { finishedAt: now + (Date.now() - t0), ms: Date.now() - t0, status: out.status, result: out.result ?? null, condition: out.condition ?? null, delivery,
    reason: out.reason ?? (usePrep ? 'Forhåndsberegnet' : null), error: out.error ?? null, traceId: out.traceId ?? null });
  return { run: publicRun62(fin), retry: !!out.retry, raw: out };
}
/** Logger en kjøring som ikke ble kjørt (missed/skipped). */
export function logSkip62(row, { plannedAt, status = 'missed', reason, trigger = 'schedule', now = Date.now() }) {
  const id = insertRun62(row, { plannedAt, startedAt: null, status, trigger, reason });
  return finishRun62(id, { finishedAt: now, ms: null, status, reason });
}

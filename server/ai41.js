// Prompt 41 (SERVER41): klokkeslett i AI-innstillinger → Jobber (claude-code-ai-jobber-klokkeslett.md). Brukes av ai-run.js jobOut og jobGroups.
//   Kjører: «startet 17:31» · I kø: «lagt i kø 17:33» (eller «planlagt 18:00») · Ferdig/feilet: «17:29» + «4 min siden» / «2 t siden»;
//   eldre enn i dag: «i går 21:14» / «18.10 21:14». Alt i Europe/Oslo (brukerens tidssone). Klienten oppdaterer «… siden» hvert minutt fra endedAt.
const TZ = 'Europe/Oslo';
const hm = (t) => new Date(t).toLocaleTimeString('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const day = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
/** «17:29» i dag, «i går 21:14», ellers «18.10 21:14». */
export function clock41(t, now = Date.now()) {
  if (!t) return null;
  const d = day(t), today = day(now), yest = day(now - 86400_000);
  if (d === today) return hm(t);
  if (d === yest) return `i går ${hm(t)}`;
  const [, m, dd] = d.split('-');
  return `${dd}.${m} ${hm(t)}`;
}
/** «4 min siden», «2 t siden», «akkurat nå», «3 d siden». */
export function ago41(t, now = Date.now()) {
  if (!t) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'akkurat nå';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.floor(h / 24)} d siden`;
}
/** Tidsfeltene for en jobbrad i ai_runs. → {createdAt, startedAt, endedAt, timeLabel, timeAgo} */
export function jobTimes41(r, now = Date.now()) {
  const done = !['run', 'queue'].includes(r.status);
  const created = r.ts ?? null, started = r.run_at ?? (r.status === 'queue' ? null : r.ts ?? null), ended = done ? r.updated ?? r.ts ?? null : null;
  const timeLabel = r.status === 'run' ? `startet ${hm(started ?? created)}` : r.status === 'queue' ? (r.run_at && r.run_at > now ? `planlagt ${clock41(r.run_at, now)}` : `lagt i kø ${hm(created)}`) : clock41(ended, now);
  return { createdAt: created ? new Date(created).toISOString() : null, startedAt: started ? new Date(started).toISOString() : null, endedAt: ended ? new Date(ended).toISOString() : null,
    timeLabel, timeAgo: done ? ago41(ended, now) : null };
}
/** Sammenslåtte feil: «16:02–17:20» og når den siste feilet. rows = jobOut-objekter. */
export function groupTimes41(jobs, now = Date.now()) {
  const ts = jobs.map((j) => Date.parse(j.endedAt ?? j.createdAt)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ts.length) return {};
  const a = ts[0], b = ts.at(-1);
  return { timeRange: a === b || hm(a) === hm(b) ? clock41(b, now) : day(a) === day(b) ? `${clock41(a, now)}–${hm(b)}` : `${clock41(a, now)}–${clock41(b, now)}`, lastAt: new Date(b).toISOString(), lastLabel: clock41(b, now), lastAgo: ago41(b, now) };
}

// Eksempeldata for Helse-siden med MOCK_DATA=1 (utvikling, ende-til-ende og skjermbildetestene). Samme form som helseData():
// 60 dager med skritt, distanse, energi og treningstid, netter med stadier, noen økter og ukentlig vekt. Bestemt av datoen, ikke tilfeldig.
import { osloDate, osloToUtc as utcDate, addDays } from '../dates/oslo.js';

const osloToUtc = (d, hm) => +utcDate(d, hm);
export function eksempelHelse(now = Date.now()) {
  const today = osloDate(now), days = [], nights = [], workouts = [], weights = [];
  for (let i = 59; i >= 0; i--) {
    const date = addDays(today, -i), k = (i * 37 + 11) % 97;
    const steps = i === 0 ? 4210 : 5200 + ((k * 131) % 6900);
    days.push({ date, steps, distance_m: Math.round(steps * 0.74), active_kcal: 280 + ((k * 7) % 360), exercise_min: 18 + ((k * 3) % 50), resting_hr: 54 + (k % 6) });
    const bed = osloToUtc(addDays(date, -1), `${22 + (k % 2)}:${String((k * 7) % 60).padStart(2, '0')}`);
    const asleep = bed + (8 + (k % 15)) * 60_000, sleepMin = 380 + ((k * 13) % 110), wake = asleep + sleepMin * 60_000 + 18 * 60_000;
    const deep = Math.round(sleepMin * 0.15), rem = Math.round(sleepMin * 0.22);
    nights.push({ night: date, bedMs: bed, asleepMs: asleep, wakeMs: wake, inBedMin: Math.round((wake - bed) / 60_000), asleepMin: sleepMin, stages: { deep, core: sleepMin - deep - rem, rem, awake: 18 } });
    if (i % 3 === 1) {
      const t = ['running', 'strength', 'walking', 'cycling'][(i / 3 | 0) % 4], s = osloToUtc(date, '17:30'), min = t === 'strength' ? 45 : 30 + (k % 30);
      workouts.push({ id: `mock-${date}`, type: t, start_ms: s, end_ms: s + min * 60_000, duration_s: min * 60, kcal: min * 9, distance_m: t === 'strength' ? null : min * (t === 'cycling' ? 380 : t === 'running' ? 170 : 90), updated: now });
    }
    if (i % 7 === 0) weights.push({ at_ms: osloToUtc(date, '07:15'), kg: Math.round((82.9 - (59 - i) * 0.02) * 10) / 10 });
  }
  return { days, nights, workouts: workouts.reverse(), weights, updated: now - 9 * 60_000 };
}

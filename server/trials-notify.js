// Prompt 31: varsler for gratis prøveperioder. Sjekker hvert minutt; hvert varsel sendes én gang (trials.sent).
// Tidspunkter: kl. 09:00 Europe/Oslo på ends_at − offset (standard 1 dag før), «Minn meg i morgen» kl. 09:00, og siste
// varsel kl. 18:00 på sluttdagen hvis prøven fortsatt er aktiv. Varsler som er mer enn 12 timer forsinket (serveren var
// nede) markeres som sendt uten å sendes. Sendes med notifyUser (realtime + kø for appene + Web Push).
import { db } from './db.js';
import { notifyUser } from './notify.js';
import { notificationsOf, trialOut } from './finans/trials.js';
import { addDaysISO } from '../public/js/trial-parse.js';
import { osloTodayISO } from '../public/js/quick-time.js';

const LATE_MS = 12 * 3600_000;

/** → [{trialId, key, sent: true|false}] for alt som ble behandlet nå. */
export async function trialTick(now = Date.now()) {
  const from = addDaysISO(osloTodayISO(new Date(now)), -1);
  const rows = db.prepare("SELECT * FROM trials WHERE status='active' AND ends_at >= ?").all(from);
  const out = [];
  for (const row of rows) {
    const sent = new Set(JSON.parse(row.sent || '[]'));
    let changed = false;
    for (const n of notificationsOf(row)) {
      if (sent.has(n.key)) continue;
      const at = Date.parse(n.at);
      if (now < at) continue;
      sent.add(n.key); changed = true;
      // Lagres før sending, så et varsel aldri sendes to ganger selv om sendingen feiler halvveis.
      db.prepare('UPDATE trials SET sent=? WHERE id=?').run(JSON.stringify([...sent]), row.id);
      if (now - at > LATE_MS) { out.push({ trialId: row.id, key: n.key, sent: false }); continue; }
      const t = trialOut(row);
      await notifyUser(row.user_id, { title: n.title, body: n.body, url: t.cancelUrl || '/finans/#/sub', tag: `trial-${row.id}`, category: 'abonnement',
        data: { kind: 'trial', trialId: row.id, service: row.service, endsAt: row.ends_at, cancelUrl: t.cancelUrl, deepLink: `finanshub://abonnementer?trial=${row.id}`, final: n.kind === 'final',
          actions: n.actions } }, { now }).catch((e) => console.warn('[prøveperioder] varsel:', e.message));
      out.push({ trialId: row.id, key: n.key, sent: true });
    }
    if (changed) db.prepare('UPDATE trials SET sent=? WHERE id=?').run(JSON.stringify([...sent]), row.id);
  }
  return out;
}

let timer = null;
export function startTrialScheduler() {
  if (timer) return;
  timer = setInterval(() => trialTick().catch((e) => console.warn('[prøveperioder]', e.message)), 60_000);
  timer.unref?.();
}

// Prompt 91 (TFA91): krypterer lagrede 2FA-hemmeligheter og nøkler på nytt med dagens serverhemmelighet, når de bare kan leses med en
// eldre nøkkel serveren kjenner: reservenøkkelen i koden («legacy», en installasjon uten SESSION_SECRET), fila data/session-secret,
// SESSION_SECRET – eller den gamle serverens session-secret-fil som du oppgir med --old-secret-file. Gjenopprettingskoder og
// app-tokens er HMAC og kan ikke regnes om: lag nye etterpå. Hemmeligheten skrives aldri ut, og oppgis aldri på kommandolinja.
// Bruk (på serveren, med samme DATA_DIR som appen; ta gjerne en backup først):
//   docker compose exec -u 1000 os npm run rekey-secrets
//   docker compose exec -u 1000 os npm run rekey-secrets -- --old-secret-file /data/gammel-session-secret
//   --disable-unreadable-2fa   slår også av 2FA for brukere med en nøkkel som fortsatt ikke kan leses
//   --dry-run                  viser hva som ville skjedd, uten å endre noe
// Start serveren på nytt etterpå.
import { readFileSync } from 'node:fs';
import { db } from '../server/db.js';
import { rekeyDb91, rekeyMessages91 } from '../server/auth/secret-rekey.js';

const args = process.argv.slice(2);
const extra = [];
const fi = args.indexOf('--old-secret-file');
if (fi >= 0) {
  try { const s = readFileSync(args[fi + 1] ?? '', 'utf8').trim(); if (s.length < 16) throw new Error('fila er tom eller for kort'); extra.push(s); }
  catch (e) { console.error(`Kunne ikke lese --old-secret-file: ${e.code ?? e.message}`); process.exit(1); }
}
const disable2fa = args.includes('--disable-unreadable-2fa'), dry = args.includes('--dry-run');
let st = null;
const DRY = new Error('dry-run');
try { db.transaction(() => { st = rekeyDb91(db, { disable2fa, extra }); if (dry) throw DRY; })(); } catch (e) { if (e !== DRY) { console.error(e.message); process.exit(1); } }
const msgs = rekeyMessages91(st, null, { disable2fa });
console.log(dry ? 'Prøvekjøring – ingenting er endret.' : 'Ferdig.');
for (const m of msgs.length ? msgs : ['Alt kan leses med dagens serverhemmelighet. Ingenting å gjøre.']) console.log(`- ${m}`);
if (!dry && (st.totp.rekeyed || st.values.rekeyed || st.domains.rekeyed || st.totp.disabled.length)) console.log('Start serveren på nytt, så leses de nye verdiene.');
process.exit(0);

// Prompt 91 (TFA91): nødvei for tofaktor. Slår av 2FA for én bruker uten å endre passordet (gjenopprettingskodene slettes også).
// Brukes når 2FA-nøkkelen ikke kan leses (serverhemmeligheten er byttet, f.eks. etter gjenoppretting av en backup) og brukeren er
// eneste admin, så ingen kan nullstille det i Innstillinger. Virker bare med tilgang til serveren – det finnes ingen nettrute for dette.
// Bruk (på serveren, med samme DATA_DIR som appen):
//   docker compose exec -u 1000 os npm run reset-2fa -- <brukernavn>
//   npm run reset-2fa -- <brukernavn>
// Brukeren logger så inn med passordet og setter opp 2FA på nytt (Innstillinger → Innlogging → Tofaktor).
import { listUsers, updateUser, totpReadable } from '../server/auth/session.js';

const [username] = process.argv.slice(2);
const users = listUsers();
const user = users.find((u) => u.username === String(username ?? '').trim().toLowerCase());
if (!user) { console.error(`Fant ikke brukeren «${username ?? ''}». Brukere: ${users.map((u) => u.username).join(', ')}`); process.exit(1); }
if (!user.totp) { console.log(`Tofaktor er allerede av for ${user.username}.`); process.exit(0); }
const readable = totpReadable(user.id);
updateUser(user.id, { resetTotp: true });
console.log(`Tofaktor er slått av for ${user.username}${readable === false ? ' (nøkkelen kunne ikke leses med dagens serverhemmelighet)' : ''}. Logg inn med passordet og sett opp 2FA på nytt.`);
process.exit(0);

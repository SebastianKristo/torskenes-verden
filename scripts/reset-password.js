// Nødvei hvis du er utestengt: setter nytt passord for en bruker og slår av 2FA.
// Bruk (på serveren, med samme DATA_DIR som appen): npm run reset-password -- brukernavn ['nytt passord']
import { createInterface } from 'node:readline/promises';
import { listUsers, setPassword, updateUser } from '../server/auth.js';

const [username, arg] = process.argv.slice(2);
const user = listUsers().find((u) => u.username === String(username ?? '').toLowerCase());
if (!user) { console.error(`Fant ikke brukeren «${username ?? ''}». Brukere: ${listUsers().map((u) => u.username).join(', ')}`); process.exit(1); }
let pw = arg;
if (!pw) { const rl = createInterface({ input: process.stdin, output: process.stdout }); pw = await rl.question('Nytt passord: '); rl.close(); }
try { setPassword(user.id, pw); updateUser(user.id, { resetTotp: true }); } catch (e) { console.error(e.message); process.exit(1); }
console.log(`Nytt passord satt for ${user.username}. 2FA er slått av, og alle innlogginger er logget ut.`);
process.exit(0);

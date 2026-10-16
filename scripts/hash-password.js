// Bruk: npm run hash-password -- 'mitt passord'   (eller uten argument for å bli spurt)
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../server/password.js';

let pw = process.argv[2];
if (!pw) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  pw = await rl.question('Passord: ');
  rl.close();
}
if (!pw || pw.length < 8) { console.error('Passordet må være minst 8 tegn.'); process.exit(1); }
console.log(`APP_PASSWORD_HASH=${hashPassword(pw)}`);

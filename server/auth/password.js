import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// scrypt (minnekrevende, innebygd i Node) i stedet for argon2, som krever en native pakke som må kompileres i containeren.
// N=2^16, r=8 bruker 64 MB per hash – over OWASPs minimum (N=2^17 for r=8 er anbefalt, 2^16 er en avveining for små LXC-er).
// Format: scrypt:N:r:p:saltHex:hashHex (":" i stedet for "$" så Docker Compose ikke tolker verdien). Eldre hasher med lavere N virker fortsatt.
const MAXMEM = 256 * 1024 * 1024;

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const N = 65536, r = 8, p = 1;
  const hash = scryptSync(pw, salt, 64, { N, r, p, maxmem: MAXMEM });
  return `scrypt:${N}:${r}:${p}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [algo, N, r, p, salt, hash] = stored.split(/[:$]/);
  if (algo !== 'scrypt' || !hash) return false;
  if (!(+N >= 1024 && +N <= 1048576 && +r >= 1 && +r <= 32 && +p >= 1 && +p <= 16)) return false;
  const expected = Buffer.from(hash, 'hex');
  const got = scryptSync(String(pw), Buffer.from(salt, 'hex'), expected.length, { N: +N, r: +r, p: +p, maxmem: MAXMEM });
  return timingSafeEqual(got, expected);
}

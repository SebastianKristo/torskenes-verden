import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// Format: scrypt$N$r$p$saltHex$hashHex
export function hashPassword(pw) {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = scryptSync(pw, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const got = scryptSync(String(pw), Buffer.from(salt, 'hex'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(got, expected);
}

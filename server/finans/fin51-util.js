// Prompt 51 (FIN51): felles hjelpere for sparemål, kalender, skattehjelp, prishistorikk og abonnementsjeger.
// Beløp i databasen er øre (heltall, negativt = ut); alt som går ut av API-et er kroner med to desimaler.
import { db } from './db.js';
import { merchantKey42, fold42 } from './search42.js';

export const q51 = (sql) => db.prepare(sql);
export const today51 = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
export const isDate51 = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
export const addDays51 = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween51 = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m = 0–11
/** Samme dag n måneder senere (31. → siste dag i kortere måneder). day = ønsket dag (standard: dagen i iso). */
export function addMonths51(iso, n, day = +iso.slice(8, 10)) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(day, lastDay(yy, mm))).padStart(2, '0')}`;
}
export const r2 = (v) => Math.round(v * 100) / 100;
export const kr51 = (ore) => r2((ore ?? 0) / 100);
/** «1 234 kr» / «1 234,50 kr» (norsk, hardt mellomrom bort). */
export const krText51 = (v, dec = false) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('nb-NO', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }).replace(/\s/g, ' ')} kr`;
export const ore51 = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace('−', '-').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
export const str51 = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
export const bad51 = (c, msg, code = 400) => c.json({ error: msg }, code);
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON3 = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
export const monthName51 = (m) => MON[m - 1];
/** «14. nov.» */
export const dayLabel51 = (iso) => (iso ? `${+iso.slice(8, 10)}. ${MON3[+iso.slice(5, 7) - 1]}` : '');
/** «mars 2025» */
export const monthYear51 = (iso) => (iso ? `${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '');
const WD = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
export const weekday51 = (iso) => WD[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** Nøkkel for en butikk/tjeneste: id fra logoregisteret, ellers første meningsfulle ord («VISA 1234 NETFLIX.COM» → netflix). */
export function key51(name) {
  const raw = String(name ?? '').replace(/^(vipps\*|vipps |klarna\*|paypal \*|visa |varekjøp |varekjop |kortkjøp |kortkjop |bankaxept |nets\*)+/i, '').trim();
  if (!raw) return null;
  let k = null;
  try { k = merchantKey42(raw).id; } catch { k = null; }
  if (k) return String(k).toLowerCase();
  const w = fold42(raw).replace(/https?:\/\/|www\./g, '').replace(/\.(com|no|net|io|me|se)\b/g, '').replace(/[^a-z0-9æøå+ ]/g, ' ').split(/\s+/).filter((x) => x && !/^\d+$/.test(x));
  return w[0] ?? null;
}
/** Konto per bruker: id → {id, name, type, balance (øre)} */
export function accounts51(u) {
  return q51(`SELECT a.id, a.name, a.type, a.bank, a.opening_balance + COALESCE((SELECT SUM(amount) FROM fh_transactions WHERE account_id=a.id AND user_id=a.user_id),0) AS balance
    FROM fh_accounts a WHERE a.user_id=? ORDER BY a.sort, a.id`).all(u);
}
/** Standardkonto for trekk uten konto: første brukskonto, ellers første konto. */
export const defaultAccount51 = (accs) => accs.find((a) => a.type === 'checking') ?? accs[0] ?? null;
/** Transaksjoner (ikke overføringer) for brukeren fra en dato: {id, date, amount, name, account_id, category, kind} */
export function tx51(u, from, { to = '9999-12-31', transfers = false } = {}) {
  return q51(`SELECT t.id, t.date, t.amount, t.account_id, COALESCE(NULLIF(t.merchant,''), t.description) AS name, t.description, c.name AS category, COALESCE(c.kind,'expense') AS kind
    FROM fh_transactions t LEFT JOIN fh_categories c ON c.id=t.category_id WHERE t.user_id=? AND t.date>=? AND t.date<=? ${transfers ? '' : "AND COALESCE(c.kind,'expense')<>'transfer'"} ORDER BY t.date, t.id`).all(u, from, to);
}
export const median51 = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Den kontoen som oftest er brukt for en liste med transaksjoner. */
export function mostUsedAccount51(rows) {
  const n = new Map();
  for (const r of rows) if (r.account_id) n.set(r.account_id, (n.get(r.account_id) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
export const csvCell51 = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const esc51 = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

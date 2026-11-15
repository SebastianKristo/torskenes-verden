// Serveradressen: normalisering og «lokalt nett» etter shared/testvektorer/serveradresse.json (F-logikk L8, Q39). Appene må gjøre
// det samme på enheten før de har kontakt med serveren; serveren bruker denne for PUBLIC_URL, LOCAL_URL og Innstillinger → Server.
// «Pålitelig enhet» (passordet hoppes over) bruker fortsatt den strengere regelen i auth.js isLan, uendret.

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Er verten på lokalt nett? localhost, loopback (127/8, ::1), privat IPv4 (10/8, 172.16/12, 192.168/16), link-local
 * (169.254/16, fe80::/10), CGNAT 100.64/10 (Tailscale), IPv6 ULA (fc00::/7), navn uten punktum og .local/.lan/.home.arpa/.internal.
 * Uten DNS-oppslag. Port og [] rundt IPv6 tåles.
 */
export function isLocalHost(host) {
  let h = String(host ?? '').trim().toLowerCase();
  if (!h) return false;
  if (h.startsWith('[')) h = h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : undefined);
  else if (/^[^:]+:\d{1,5}$/.test(h)) h = h.replace(/:\d{1,5}$/, '');
  if (h === 'localhost' || h === '::1') return true;
  const m = IPV4.exec(h);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    if ([+m[1], +m[2], +m[3], +m[4]].some((x) => x > 255)) return false;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
  if (!h.includes('.')) return /^[a-z0-9-]+$/.test(h);
  return /\.(local|lan|home\.arpa|internal)$/.test(h);
}

/**
 * Det brukeren skriver eller har lagret → «skjema://vert[:port]» (uten sti og uten / til slutt), eller null. Uten skjema: http:// for
 * lokale verter, ellers https://. Bare http og https, og aldri brukernavn/passord i adressen.
 */
export function normalizeServerUrl(v) {
  const s = String(v ?? '').trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `${isLocalHost(s.split(/[/?#]/)[0]) ? 'http' : 'https'}://${s}`;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !u.hostname) return null;
  return `${u.protocol}//${u.host}`;
}

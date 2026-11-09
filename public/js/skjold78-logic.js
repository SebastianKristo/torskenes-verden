// Prompt 78 (LEDWEB): rene hjelpere for LED over skuffene i Skjold Lab (ingen DOM, testes i test/p78-web.test.js).
// - normLeds78: leser LED-oppsettet romslig (direkte eller under «leds») og fyller inn standardverdier.
// - autoRows78: fyller ut radene (start/antall/retning) for én stripe per rad, serpentine eller samme retning.
// - ledIndex78: samme regel som serveren (nærmeste LED over skuffens midtpunkt, reverse, overstyring) – brukes til forhåndsvisning.
// - hostOk78: enkel sjekk i klienten (serveren avgjør): IPv4 i hjemmenettet, .local/.lan eller vertsnavn uten punktum.

export const LED_DEF78 = Object.freeze({ host: '', enabled: false, color: '#2F6BFF', durationS: 30, blink: false, brightness: 128, drawerPitchMm: 60, firstDrawerXmm: 30 });
export const PITCH60 = 16.667;

const num = (v, d) => (v === '' || v == null || !Number.isFinite(+v) ? d : +v);
const int = (v, d) => Math.round(num(v, d));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Standard rad: én stripe per rad som dekker skapets bredde. */
export function defRow78(row, cab, L = LED_DEF78) {
  const cols = Math.max(1, +cab?.cols || 1), pitch = PITCH60;
  const count = Math.max(1, Math.round((cols * num(L.drawerPitchMm, 60)) / pitch));
  return { row, start: (row - 1) * count, count, reverse: row % 2 === 0, pitchMm: pitch, offsetMm: Math.round((pitch / 2) * 1000) / 1000 };
}

/** Normaliserer svaret fra GET /cabinets/:id/leds. */
export function normLeds78(raw, cab) {
  const o = raw?.leds && typeof raw.leds === 'object' ? raw.leds : raw && typeof raw === 'object' ? raw : {};
  const L = {
    host: String(o.host ?? '').trim(),
    enabled: o.enabled === true,
    color: /^#?[0-9a-f]{6}$/i.test(String(o.color ?? '')) ? `#${String(o.color).replace('#', '').toUpperCase()}` : LED_DEF78.color,
    durationS: clamp(int(o.durationS, LED_DEF78.durationS), 3, 600),
    blink: o.blink === true,
    brightness: clamp(int(o.brightness, LED_DEF78.brightness), 1, 255),
    drawerPitchMm: num(o.drawerPitchMm ?? cab?.drawerPitchMm, LED_DEF78.drawerPitchMm),
    firstDrawerXmm: num(o.firstDrawerXmm ?? cab?.firstDrawerXmm, LED_DEF78.firstDrawerXmm),
    rows: [],
    overrides: {},
  };
  const given = new Map((Array.isArray(o.rows) ? o.rows : []).filter((r) => +r?.row >= 1).map((r) => [+r.row, r]));
  const n = Math.max(+cab?.rows || 0, ...given.keys(), 0);
  for (let row = 1; row <= n; row++) {
    const r = given.get(row), d = defRow78(row, cab, L);
    L.rows.push(r ? { row, start: Math.max(0, int(r.start, d.start)), count: Math.max(1, int(r.count, d.count)), reverse: r.reverse === true, pitchMm: num(r.pitchMm, d.pitchMm), offsetMm: num(r.offsetMm, 0) } : d);
  }
  const ov = o.overrides && typeof o.overrides === 'object' ? o.overrides : {};
  for (const [k, v] of Object.entries(ov)) if (/^\d+-\d+$/.test(k) && Number.isInteger(+v) && +v >= 0) L.overrides[k] = +v;
  return L;
}

/** Fyller ut radene: perRow LED-er per rad, start fortløpende fra «first». serpentine = annenhver rad baklengs. */
export function autoRows78(rows, { perRow, serpentine = false, first = 0 } = {}) {
  const n = Math.max(1, int(perRow, 1));
  return rows.map((r, i) => ({ ...r, start: int(first, 0) + i * n, count: n, reverse: serpentine ? i % 2 === 1 : false }));
}

/** LED-indeksen for en skuff (forhåndsvisning; serveren regner det samme). null = raden mangler. */
export function ledIndex78(L, row, col) {
  const ov = L?.overrides?.[`${row}-${col}`];
  if (Number.isInteger(ov)) return ov;
  const r = L?.rows?.find((x) => +x.row === +row);
  if (!r) return null;
  const x = num(L.firstDrawerXmm, 30) + (col - 1) * num(L.drawerPitchMm, 60);
  const p = num(r.pitchMm, PITCH60) || PITCH60;
  let i = clamp(Math.round((x - num(r.offsetMm, 0)) / p + 1e-9), 0, Math.max(0, r.count - 1));
  if (r.reverse) i = r.count - 1 - i;
  return r.start + i;
}

/** Totalt antall LED-er oppsettet bruker (høyeste indeks + 1). */
export const ledTotal78 = (L) => Math.max(0, ...(L?.rows ?? []).map((r) => r.start + r.count), ...Object.values(L?.overrides ?? {}).map((v) => v + 1));

/** Klientsjekk av verten (serveren avgjør). Tom = ok (ikke satt). */
export function hostOk78(h) {
  const s = String(h ?? '').trim().toLowerCase().replace(/^http:\/\//, '').replace(/\/+$/, '');
  if (/[/?#@\s\\]/.test(s)) return false; // https://, sti eller brukernavn: avvises (serveren gjør det samme)
  if (!s) return true;
  const host = s.replace(/:\d+$/, '');
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    if (m.slice(1).some((x) => +x > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return false;
  return !host.includes('.') || /\.(local|lan)$/.test(host);
}

/** Body til PUT /cabinets/:id/leds. */
export function ledsBody78(L) {
  return {
    host: L.host.trim(), enabled: !!L.enabled, color: L.color, durationS: L.durationS, blink: !!L.blink, brightness: L.brightness,
    drawerPitchMm: L.drawerPitchMm, firstDrawerXmm: L.firstDrawerXmm,
    rows: L.rows.map((r) => ({ row: r.row, start: r.start, count: r.count, reverse: !!r.reverse, pitchMm: r.pitchMm, offsetMm: r.offsetMm })),
    overrides: { ...L.overrides },
  };
}

/** Sekunder igjen til lyset slukker (untilMs = epoke-ms eller ms igjen). */
export function secsLeft78(untilMs, now = Date.now()) {
  const u = +untilMs; if (!Number.isFinite(u) || u <= 0) return 0;
  const end = u > 1e12 ? u : now + u;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/** Teksten for statusmerket. */
export function statusText78(st) {
  if (!st) return { cls: 'wait', text: 'Sjekker …' };
  if (st.ok) return { cls: 'ok', text: [st.name || 'WLED', st.ledCount ? `${st.ledCount} LED` : '', st.version ? `v${st.version}` : ''].filter(Boolean).join(' · ') };
  return { cls: 'bad', text: st.error || 'WLED svarer ikke' };
}

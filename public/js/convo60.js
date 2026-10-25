// Prompt 60 (prompt 49 del 3, D3WEB): Glimt forstår samtaler på web. Formene står i $S/SERVER60-API.md.
//   POST /api/glimt/agent og /agent/stream tar {conversationId, conversationKind?, choice?:{setId, id}}.
//   Chat sender chat-id-en (ny chat uten id: «c-<tilfeldig>», som beholdes for samtalen også når den får id).
//   Glimt-søket på Hjem bruker en kortlevd id («home-<tilfeldig>») for alle spørsmål, ny id etter 30 min uten bruk.
// Valgknappene (choices) og innstillingene ligger i glimt-agent45.js, chat.js, understand60.js og entities60.js.
const RE = /^[A-Za-z0-9_.:-]{1,80}$/;
export const HOME_TTL60 = 30 * 60_000;

export const rand60 = (n = 12) => {
  try { if (crypto?.getRandomValues) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); } } catch { /* */ }
  let s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n);
};
/** Gyldig id for serveren (1–80 tegn: bokstaver, tall, . : - _). Annet → null (serveren bruker da sin innebygde samtale). */
export const validConv60 = (id) => (id != null && RE.test(String(id)) ? String(id) : null);

/* ---------- Glimt-søket på Hjem ---------- */
const H = { id: null, at: 0 };
/** Id for Glimt-søket: samme så lenge feltet brukes, ny etter 30 min uten bruk. touch = registrer bruk nå. */
export function homeConv60({ touch = true } = {}) {
  const now = Date.now();
  if (!H.id || now - H.at > HOME_TTL60) H.id = `home-${rand60(12)}`;
  if (touch) H.at = now;
  return H.id;
}
/** Feltet er tømt/lukket med vilje: neste spørsmål starter en ny samtale. */
export function resetHomeConv60() { H.id = null; H.at = 0; }
/** Bare for tester. */
export const _homeState60 = () => ({ ...H });

/* ---------- Chat ---------- */
// chat-id → samtale-id, så en samtale som startet med «c-…» (før den fikk id) beholder tilstanden på serveren.
const KEY = 'hl_conv60';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') ?? {}; } catch { return {}; } };
const write = (o) => { try { const e = Object.entries(o); localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(e.slice(-200)))); } catch { /* */ } };
let pending = null;
/** Samtale-id for chatten (cur = C.cur: server-id, lokal «g:…» eller null for ny chat). */
export function chatConv60(cur) {
  if (cur == null || cur === '') { pending ??= `c-${rand60(12)}`; return pending; }
  const k = String(cur), m = read()[k];
  if (m) return m;
  return validConv60(k) ?? `c-${k.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60) || rand60(12)}`;
}
/** Chatten har fått id (lokal eller fra serveren): knytt id-en til samtale-id-en som ble brukt. */
export function bindConv60(cur, convId) {
  if (cur == null || !convId) return;
  const k = String(cur);
  if (k === convId) { if (pending === convId) pending = null; return; }
  const o = read(); o[k] = convId; write(o);
  if (pending === convId) pending = null;
}
/** Lokal chat («g:…») har fått id på serveren: den nye id-en beholder samtale-id-en. */
export function rekeyConv60(from, to) {
  if (from == null || to == null || String(from) === String(to)) return;
  const conv = chatConv60(from), o = read(); o[String(to)] = conv; delete o[String(from)]; write(o);
}
/** Siste melding er et ferskt Glimt-svar (12 t, som samtalen på serveren), og teksten er en kort oppfølger
 *  («og i Bergen?», «flytt den til 11», «den første») – da går den til Glimt først. Ren prat faller tilbake til modellen. */
export const CHAT_TTL60 = 12 * 3600_000;
export function followsGlimt60(messages, text, now = Date.now()) {
  const t = String(text ?? '').trim();
  if (!t || t.length > 80 || t.includes('\n')) return false;
  const last = (Array.isArray(messages) ? messages : []).filter((m) => m && m.role !== 'system').at(-1);
  if (!last || last.role !== 'assistant' || !last.meta?.glimt || last.meta.stopped) return false;
  if (last.ts && now - last.ts > CHAT_TTL60) return false;
  return true;
}
/** Ny chat: neste melding får en ny samtale-id. */
export function newChatConv60() { pending = null; }
/** Glem tilstanden på serveren («Ny samtale»). Feil ignoreres. */
export function forgetConv60(id) {
  const v = validConv60(id);
  if (!v) return Promise.resolve(false);
  return fetch(`/api/glimt/agent/convo/${encodeURIComponent(v)}`, { method: 'DELETE', credentials: 'same-origin' }).then((r) => r.ok).catch(() => false);
}

/* ---------- Valg (choices) ---------- */
/** Normaliserer `choices` fra svaret (§2). null når det ikke finnes eller er tomt. */
export function normChoices60(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.items)) return null;
  const items = c.items.filter((x) => x && (x.label || x.text)).slice(0, 5).map((x, i) => ({ id: String(x.id ?? i + 1), label: String(x.label ?? x.text), text: String(x.text ?? x.label) }));
  if (!items.length) return null;
  return { setId: c.setId ? String(c.setId) : null, question: String(c.question ?? ''), items, expiresAt: c.expiresAt ?? null };
}
/** Det som sendes når brukeren trykker på et valg: {text, choice?}. Utløpt valg → bare teksten. */
export function choicePick60(ch, item, now = Date.now()) {
  if (!ch || !item) return null;
  const exp = Date.parse(ch.expiresAt ?? '');
  const live = ch.setId && !(Number.isFinite(exp) && exp < now);
  return { text: item.text, ...(live ? { choice: { setId: ch.setId, id: item.id } } : {}) };
}
/** Felt til body-en (bare de som er satt). */
export function convBody60(o = {}) {
  const id = validConv60(o.conversationId);
  return {
    ...(id ? { conversationId: id } : {}),
    ...(id && (o.conversationKind === 'chat' || o.conversationKind === 'search') ? { conversationKind: o.conversationKind } : {}),
    ...(o.choice?.setId && o.choice?.id != null ? { choice: { setId: String(o.choice.setId), id: String(o.choice.id) } } : {}),
  };
}

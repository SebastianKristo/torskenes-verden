// «Venter på opplasting»: kvitteringer som ikke kom fram (uten nett, tapt forbindelse, serverfeil eller «bare på Wi-Fi»)
// lagres i IndexedDB, så de overlever at appen lukkes. De lastes opp av seg selv når nettet er tilbake, og kan
// prøves igjen eller fjernes enkeltvis. Uten IndexedDB (privat modus o.l.) holdes køen bare i minnet.
// Brukerskille (prompt 21): hvert element får userId, og bare den innloggede brukerens elementer vises og sendes.
// Elementer fra før skillet (uten userId) sendes aldri av seg selv; de vises med en merknad og kan fjernes eller
// lastes opp med et eget trykk.
const DB = 'fh-upload-queue', STORE = 'files';
let dbp = null, mem = [], uid = null;
/** Settes når kontoen er kjent (/api/me). Uten bruker vises og sendes ingenting. */
export function setUser(id) { uid = id == null ? null : String(id); }
export const currentUser = () => uid;
const mine = (x) => uid != null && String(x.userId ?? '') === uid;
const legacy = (x) => x.userId == null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    let out; const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
  });
};

/** Alle filer i køen, eldste først (uten selve innholdet). */
export async function queued() {
  const all = ((await tx('readonly', (st) => (st ? st.getAll() : null)).catch(() => null)) ?? mem).filter((x) => mine(x) || (uid != null && legacy(x)));
  return all.sort((a, b) => a.added - b.added).map(({ blob, ...x }) => ({ ...x, size: blob?.size ?? 0, legacy: legacy(x) }));
}
export async function enqueue(file, reason) {
  const item = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: file.name || 'kvittering.jpg', type: file.type || 'image/jpeg', blob: file, added: Date.now(), tries: 0, reason, error: null, userId: uid };
  const ok = await tx('readwrite', (st) => (st ? st.put(item) : null)).then(() => true).catch(() => false);
  if (!ok || !(await open())) mem.push(item);
  return item.id;
}
export async function remove(id) {
  const it = await getItem(id);
  if (it && !mine(it) && !legacy(it)) return; // en annen brukers element
  mem = mem.filter((x) => x.id !== id);
  await tx('readwrite', (st) => (st ? st.delete(id) : null)).catch(() => {});
}
async function getItem(id) { return (await tx('readonly', (st) => (st ? st.get(id) : null)).catch(() => null)) ?? mem.find((x) => x.id === id) ?? null; }
async function update(item) { await tx('readwrite', (st) => (st ? st.put(item) : null)).catch(() => {}); }

/** Skal feilen gi «prøv igjen senere» (nett/server) i stedet for en melding (f.eks. ugyldig fil)? */
export const transient = (e) => e instanceof TypeError || !navigator.onLine || (e?.status >= 500) || e?.status === 408 || e?.status === 429 || /network|failed to fetch|load failed/i.test(e?.message ?? '');

let running = false;
/**
 * Laster opp det som ligger i køen (eller bare `ids`). send(file) må laste opp én fil og kaste ved feil.
 * Returnerer { done, failed }. Varige feil (4xx) blir liggende med feilmeldingen, så brukeren kan fjerne dem.
 */
export async function flush(send, ids = null) {
  if (running) return { done: 0, failed: 0, busy: true };
  if (uid == null) return { done: 0, failed: 0 };
  running = true;
  let done = 0, failed = 0;
  try {
    for (const meta of await queued()) {
      if (ids && !ids.includes(meta.id)) continue;
      if (!navigator.onLine) break;
      const item = await getItem(meta.id);
      if (!item) continue;
      // Bare egne elementer. Et element fra før kontoskillet sendes bare når brukeren selv ber om det (ids).
      if (!mine(item) && !(legacy(item) && ids?.includes(item.id))) continue;
      if (legacy(item)) item.userId = uid;
      try {
        await send(new File([item.blob], item.name, { type: item.type }));
        await remove(item.id); done++;
      } catch (e) {
        failed++;
        if (item.userId === uid && meta.legacy) item.userId = null; // fortsatt uten eier til det lykkes
        item.tries = (item.tries ?? 0) + 1; item.error = e?.message ?? 'Ukjent feil'; item.last = Date.now();
        await update(item);
        if (transient(e)) break; // fortsatt uten nett: resten venter til neste forsøk
      }
    }
  } finally { running = false; }
  return { done, failed };
}

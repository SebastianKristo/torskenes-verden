// Små hjelpere for localStorage i Økonomi på mobil: tåler privat modus og blokkert lagring (returnerer reserven).
// lsGet/lsSet lagrer JSON, lsRaw/lsRawSet ren tekst. null fjerner nøkkelen.
export const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
export const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const lsRaw = (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export const lsRawSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };

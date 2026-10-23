// Prompt 46 (claude-code-sporing-posten-postnord-fiks.md §7): Innstillinger → Integrasjoner → Sporing · kontoer.
// Posten/Bring («Logg inn med Posten» / «Logg inn med Bring»), PostNord «Spor med nummer» (alltid på) og «Logg inn med PostNord».
// Status per kilde fra serveren: «Tilkoblet · 4 pakker · oppdatert 14:02» / «Må logge inn på nytt» / «PostNord har endret app-nøkkelen …».
// DATA46 (server/tracking46.js): GET /api/tracking/sources46, POST /api/tracking/accounts/:src/{start,finish,sync}, DELETE …/:src.
// Innlogging på web: transportørens side åpnes i ny fane; redirecten (com.postnord.app://redirect?code=… / posten://login?code=…)
// kan ikke åpne Homelab, så brukeren limer inn adressen (kort guide fra serveren). Tokens blir på serveren, kryptert.
import { api, esc } from './util.js';

const T = { d: null, loading: false, err: null, msg: {}, busy: {}, start: {}, paste: {} };
const DOM = { posten: 'posten.no', 'postnord-number': 'postnord.no', postnord: 'postnord.no' };
const COL = { ok: '#34c759', reauth: '#f3b54a', compat: '#f26b5e', error: '#f26b5e', off: '#8f897c' };

export async function loadTrack46(rerender, force = false) {
  if (T.loading || (T.d && !force) || T.err === 404) return;
  T.loading = true;
  try { T.d = await api('/tracking/sources46'); T.err = null; } catch (e) { T.err = e.status ?? e.message; T.d = null; }
  T.loading = false;
  rerender?.();
}

/** Gruppen på Integrasjoner-siden (null når serveren ikke har kontoene ennå). */
export function trackGroup46(row, group) {
  const d = T.d;
  if (!d?.sources?.length) return null;
  const rows = d.sources.map((s) => row({ t: s.name, s: s.text, k: 'sporing posten bring postnord konto logg inn pakker', logo: DOM[s.id] ?? null, ini: s.name,
    v: s.kind === 'number' ? 'Alltid på' : s.connected ? (s.state === 'ok' ? 'Tilkoblet' : s.state === 'reauth' ? 'Logg inn' : 'Feil') : 'Av', vc: COL[s.kind === 'number' ? 'ok' : s.connected ? s.state : 'off'],
    btn: s.kind === 'number' ? 'Vis' : s.connected ? 'Endre' : 'Logg inn', go: `int|trk46:${s.id}` }));
  return group('Sporing · kontoer', rows, 'Med konto finner Homelab pakkene dine automatisk. Sporing med nummer virker alltid, uten konto og uten nøkkel. Innloggingen lagres kryptert på serveren og vises aldri i appen.');
}

/** Undersiden for én kilde. */
export function trackSub46(id, note) {
  const s = T.d?.sources?.find((x) => x.id === id);
  if (!s) return null;
  const m = T.msg[id], st = T.start[id], busy = T.busy[id];
  const head = `<div class="int-head"><span class="sg-v" style="color:${COL[s.kind === 'number' ? 'ok' : s.connected ? s.state : 'off']}">${esc(s.kind === 'number' ? 'Alltid på' : s.connected ? (s.state === 'ok' ? 'Tilkoblet' : s.state === 'reauth' ? 'Må logge inn' : 'Feil') : 'Ikke tilkoblet')}</span><div><b>${esc(s.name)}</b><span>${esc(s.text)}</span></div></div>`;
  if (s.kind === 'number') {
    return { title: s.name, sub: 'Integrasjoner · Sporing', html: `${head}${note('PostNord sporer med bare sporingsnummeret (offentlig sporing, ingen konto og ingen nøkkel). Pakker som ikke er skannet ennå står som «Venter på første skanning».')}` };
  }
  const logins = (s.login ?? []).map((l) => `<button type="button" class="sg-btn${s.connected ? '' : ' pri'}" data-trk46-start="${esc(s.id)}" data-brand="${esc(l.brand)}"${busy ? ' disabled' : ''}>${esc(s.connected && s.state === 'ok' ? l.label.replace('Logg inn', 'Logg inn på nytt') : l.label)}</button>`).join('');
  const guide = st ? `<section class="sg"><h3 class="sg-t">Lim inn adressen</h3><div class="sg-box trk46-g">
      <ol>${(st.guide ?? []).map((g) => `<li>${esc(g)}</li>`).join('')}</ol>
      <a class="sg-btn" href="${esc(st.authorizeUrl)}" target="_blank" rel="noopener noreferrer">Åpne innloggingen igjen ↗</a>
      <form class="trk46-f" data-trk46-finish="${esc(s.id)}"><input name="trk46url" value="${esc(T.paste[id] ?? '')}" placeholder="${esc(st.redirectPrefix ?? '')}?code=…&state=…" autocomplete="off" spellcheck="false" aria-label="Adressen etter innlogging" data-glimt="off"><button class="sg-btn pri" type="submit"${busy ? ' disabled' : ''}>${busy === 'finish' ? 'Kobler til …' : 'Koble til'}</button></form>
    </div></section>` : '';
  const acts = s.connected ? `<div class="sg-acts"><button class="sg-btn" data-trk46-sync="${esc(s.id)}"${busy ? ' disabled' : ''}>${busy === 'sync' ? 'Oppdaterer …' : 'Oppdater nå'}</button><button class="sg-btn" data-trk46-off="${esc(s.id)}">Logg ut</button></div>` : '';
  const my = s.mybring ? note(`${esc(s.mybring.text)}. Legges inn under «Sporing · delt i husstanden» → Bring (reserve når kontoen ikke er koblet til).`) : '';
  const comp = s.state === 'compat' ? note('PostNord har byttet nøkkelen appen bruker. Du trenger ikke logge inn på nytt – Homelab må oppdateres.') : '';
  return { title: s.name, sub: 'Integrasjoner · Sporing', html: `${head}${comp}<div class="sg-acts">${logins}</div>${m ? `<div class="sg-note ${m.ok ? 'green' : 'red'}">${esc(m.text)}</div>` : ''}${guide}${acts}${my}` };
}

const say = (id, text, ok = true) => { T.msg[id] = { text, ok }; };
export async function trackClick46(e, render) {
  let b;
  if ((b = e.target.closest('[data-trk46-start]'))) {
    const id = b.dataset.trk46Start, brand = b.dataset.brand;
    // Fanen åpnes med en gang (popup-blokkering), og får adressen når serveren har svart.
    const w = window.open('about:blank', '_blank');
    T.busy[id] = 'start'; render();
    try {
      const r = await api(`/tracking/accounts/${encodeURIComponent(id)}/start`, { method: 'POST', json: { brand } });
      T.start[id] = r; say(id, 'Logg inn i fanen som åpnet seg, og lim inn adressen under.');
      if (w && r.authorizeUrl) { try { w.opener = null; } catch { /* */ } w.location.href = r.authorizeUrl; } else if (r.authorizeUrl) window.open(r.authorizeUrl, '_blank', 'noopener');
    } catch (er) { try { w?.close(); } catch { /* */ } say(id, er.status === 404 ? 'Serveren støtter ikke kontoinnlogging ennå' : er.message, false); }
    delete T.busy[id]; render(); return true;
  }
  if ((b = e.target.closest('[data-trk46-sync]'))) {
    const id = b.dataset.trk46Sync; T.busy[id] = 'sync'; render();
    try { const r = await api(`/tracking/accounts/${encodeURIComponent(id)}/sync`, { method: 'POST' }); if (r.sources) T.d = { ...T.d, sources: r.sources }; say(id, r.message ?? 'Oppdatert', r.ok !== false); }
    catch (er) { say(id, er.message, false); }
    delete T.busy[id]; render(); return true;
  }
  if ((b = e.target.closest('[data-trk46-off]'))) {
    const id = b.dataset.trk46Off;
    if (!confirm('Logge ut av kontoen? Pakkene som allerede er hentet, blir liggende i Sporing.')) return true;
    try { const r = await api(`/tracking/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (r.sources) T.d = { ...T.d, sources: r.sources }; delete T.start[id]; say(id, 'Logget ut'); }
    catch (er) { say(id, er.message, false); }
    render(); return true;
  }
  return false;
}
export async function trackSubmit46(e, render) {
  const f = e.target.closest?.('[data-trk46-finish]');
  if (!f) return false;
  e.preventDefault();
  const id = f.dataset.trk46Finish, url = String(f.querySelector('[name=trk46url]')?.value ?? '').trim();
  if (!url) return true;
  T.busy[id] = 'finish'; render();
  try {
    const r = await api(`/tracking/accounts/${encodeURIComponent(id)}/finish`, { method: 'POST', json: { redirectUrl: url } });
    if (r.sources) T.d = { ...T.d, sources: r.sources };
    if (r.ok) { delete T.start[id]; delete T.paste[id]; say(id, r.message ?? 'Tilkoblet'); } else say(id, r.error ?? 'Fikk ikke koblet til', false);
  } catch (er) { say(id, er.message, false); }
  delete T.busy[id]; render(); return true;
}
export function trackInput46(e) { if (e.target.name !== 'trk46url') return false; const f = e.target.closest('[data-trk46-finish]'); if (f) T.paste[f.dataset.trk46Finish] = e.target.value; return true; }

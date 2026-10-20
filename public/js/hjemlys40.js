// Prompt 40 (claude-code-hjemlys.md): Hjemlys – «Et lite lys som står på til du er hjemme.» Web: Familie-kortet på Hjem
// (fasit Hjemme trygt Varianter.dc.html → «Felles · Web · Familie-widgeten på Hjem») og Familie-siden.
// Flyten er valgt (tillegg i CONTRACT40): alle tre – 1a startark/aktiv økt på dagtid, 1b Glimt-forslaget, 1c nattmodus.
// GET /api/hjemlys/route → {from:{name, km}, options:[{mode, label, legs, eta, minutes}]}, GET /api/hjemlys/:id/log → [{at, text, who}].
// API (SERVER40, tåler 404 – da vises ingenting): GET /api/hjemlys → {mine|null, household:[{userId, name, avatar, state, eta, since}]},
// POST /api/hjemlys/start {eta, mode, waitMin, recipients?}, PATCH /api/hjemlys/:id {plus:10}, POST /api/hjemlys/:id/ok|home|end,
// GET /api/hjemlys/suggest → {suggest, reason, eta}. Sanntid «hjemlys».
// Personvern: ingenting deles før økta er «late». Andre i husstanden ser bare at Hjemlys er aktivt (og forventet tid);
// posisjon, batteri og dekning vises bare når serveren sender share (bare når personen er sen).
import { api, esc } from './util.js';
import { onLive } from './realtime.js';
import { stableColor, twoLetters } from './poscard.js';

const H = { log: null, d: null, missing: false, loading: null, sug: null, sugAt: 0, busy: '', err: '', live: false, t: null };
const hm = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }); };
const minsTo = (iso) => Math.round((Date.parse(iso) - Date.now()) / 60000);

export async function loadHjemlys(force = false) {
  if (H.loading) return H.loading;
  if (H.missing && !force) return null;
  H.loading = (async () => {
    try { H.d = await api('/hjemlys'); H.missing = false; if (H.d?.mine?.id) H.log = await api(`/hjemlys/${encodeURIComponent(H.d.mine.id)}/log`).then((x) => (Array.isArray(x) ? x : x?.items ?? [])).catch(() => null); }
    catch (e) { if (e.status === 404 || e.status === 405) { H.missing = true; H.d = null; } else H.err = e.message; }
    if (!H.missing && !H.d?.mine && Date.now() - H.sugAt > 10 * 60_000) {
      H.sugAt = Date.now();
      H.sug = await api('/hjemlys/suggest').catch(() => null);
    }
    H.loading = null;
    paintAll();
  })();
  if (!H.live) {
    H.live = true;
    onLive('hjemlys', () => { H.loading = null; loadHjemlys(true); });
    // ETA og «om N min» oppdateres hvert halve minutt mens noe er aktivt.
    H.t = setInterval(() => { if (!document.hidden && (H.d?.mine || H.d?.household?.some((p) => active(p.state)))) paintAll(); }, 30_000);
  }
  return H.loading;
}
const active = (st) => st === 'onTheWay' || st === 'late';

/* ---------------- Visning ----------------
   Tillegg i kontrakten (2026-10-20): alle tre variantene er deler av samme funksjon.
   1a «Rolig og papir» = startarket og den aktive økta på dagtid · 1b «Glimt foreslår» = forslaget med «Ja, start» / «Ikke nå»
   · 1c «Nattmodus» = samme økt etter kl. 21 (eller i mørkt tema): mørk, stor nedtellingsring og rød alarm hos mottaker. */

const night = () => { const h = new Date().getHours(); return h >= 21 || h < 6 || document.documentElement.dataset.hlTheme !== '2c'; };
const GLOW = '<span class="hl40-glow" aria-hidden="true"></span>';
const names = (L) => { const n = (L ?? []).map((r) => r?.name ?? r).filter(Boolean); return n.length > 1 ? `${n.slice(0, -1).join(', ')} og ${n.at(-1)}` : n[0] ?? 'Familien'; };
function avatar(p) {
  const c = stableColor(p.userId ?? p.name ?? '?');
  return p.avatar ? `<span class="hl40-av" style="background:${c}"><img src="${esc(p.avatar)}" alt=""></span>` : `<span class="hl40-av" style="background:${c}">${esc(twoLetters(p.name))}</span>`;
}
const mmss = (iso) => { const s = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function ring(m) {
  const tot = Math.max(1, Date.parse(m.eta) - Date.parse(m.startedAt ?? Date.now() - 1)), left = Math.max(0, Date.parse(m.eta) - Date.now());
  const R = 52, C = 2 * Math.PI * R, f = Math.min(1, left / tot);
  return `<span class="hl40-ring"><svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="8"/><circle cx="60" cy="60" r="${R}" fill="none" stroke="${m.state === 'late' ? '#ff6b5e' : '#ffd27a'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - f)).toFixed(1)}" transform="rotate(-90 60 60)"/></svg><span><b data-hl40-cd>${m.state === 'late' ? `+${m.lateMinutes ?? Math.max(0, -minsTo(m.eta))}` : mmss(m.eta)}</b><em>til ${esc(hm(m.eta))}</em></span></span>`;
}
function mineRow(m, page) {
  const late = m.state === 'late', home = m.state === 'home', N = night() && !home;
  const pct = Math.max(0, Math.min(100, Math.round((m.progress ?? 0) * 100)));
  const left = m.eta ? minsTo(m.eta) : null;
  const who = names(m.recipients);
  const btns = home ? '' : `<span class="hl40-acts">${late ? `<button type="button" class="hl40-b ink" data-hl40="ok"${H.busy ? ' disabled' : ''}>Alt OK</button><button type="button" class="hl40-b" data-hl40="plus" data-v="15"${H.busy ? ' disabled' : ''}>+ 15 min</button>` : `<button type="button" class="hl40-b" data-hl40="plus" data-v="10"${H.busy ? ' disabled' : ''}>+ 10 min</button><button type="button" class="hl40-b ink" data-hl40="home"${H.busy ? ' disabled' : ''}>Jeg er hjemme</button>`}<button type="button" class="hl40-lnk" data-hl40="end"${H.busy ? ' disabled' : ''}>Avslutt</button></span>`;
  if (N) {
    // 1c: mørk, stor ring med nedtelling og store knapper.
    return `<div class="hl40-me hl40-night ${late ? 'late' : ''}"><span class="hl40-k n">${late ? 'DU ER SEN · FAMILIEN HAR FÅTT BESKJED' : 'PÅ VEI HJEM'}</span><div class="hl40-nr">${ring(m)}<span class="hl40-tx"><b>${esc(m.leg || 'På vei hjem')}${late ? '' : ' · i rute'}</b><span>${esc(who)} følger med</span></span></div>${btns}</div>`;
  }
  const sub = late ? `${m.lateMinutes ?? Math.max(0, -left)} min over · familien har fått beskjed` : home ? `Hjemme ${hm(m.endedAt ?? m.homeAt ?? new Date().toISOString())} ✓ · delingen er stoppet` : `startet ${hm(m.startedAt)}`;
  return `<div class="hl40-me ${late ? 'late' : home ? 'home' : ''}">
    <div class="hl40-r">${GLOW}<span class="hl40-tx"><span class="hl40-k">${late ? 'SEN' : home ? 'HJEMME' : 'PÅ VEI HJEM'}</span><span>${esc(sub)}</span></span>${m.eta && !home ? `<span class="hl40-etaw"><b class="hl40-eta">${esc(hm(m.eta))}</b><span>${left > 0 ? `om ${left} min` : late ? 'passert' : 'nå'}</span></span>` : ''}</div>
    ${home ? '' : `<span class="hl40-bar"><i style="width:${pct}%"></i></span><span class="hl40-legs"><span>${esc(m.from?.name ?? 'Start')}</span><span>${esc(m.leg ?? '')}</span><span>Hjem</span></span>`}
    ${home ? '' : `<div class="hl40-facts"><div><span>Følger med</span><b>${esc(who)}</b></div><div><span>Deler nå</span><b>${late ? 'Posisjon, rute, batteri' : 'Ingenting'}</b></div>${page ? '<div><span>Hvis du er sen</span><b>Posisjon, rute, batteri +2</b></div>' : ''}</div>`}
    ${btns}${page && !home ? '<span class="hl40-note">Avsluttes av seg selv når telefonen kobler til hjemme-Wi-Fi eller er innenfor 60 m av hjemmet.</span>' : ''}
    ${page && H.log?.length ? `<div class="hl40-log">${H.log.slice(-4).map((l) => `<span><em>${esc(hm(l.at))}</em> ${esc(l.text)}</span>`).join('')}</div>` : ''}
  </div>`;
}
/* Mottakers visning (1a) / alarm (1c) når noen er sen. share kommer bare når personen er sen. */
function lateView(p) {
  const s = p.share ?? {}, N = night(), over = p.lateMinutes ?? Math.max(0, -minsTo(p.eta));
  const first = String(p.name ?? '').split(' ')[0];
  const rows = [['Siste posisjon', [s.place ?? s.pos?.label, s.pos?.at ? hm(s.pos.at) : ''].filter(Boolean).join(' · ')], ['Ruten', s.route?.label ?? s.routeLabel ?? ''], ['Batteri · dekning', [s.battery != null ? `${Math.round(s.battery <= 1 ? s.battery * 100 : s.battery)} %` : '', s.signal ?? ''].filter(Boolean).join(' · ')], ['Sist låst opp', s.unlockedAt ? hm(s.unlockedAt) : ''], ['Var med', (s.with ?? []).map((w) => w.name ?? w).join(', ') + (s.event ? ` · ${s.event}` : '')]].filter(([, v]) => v && v.trim());
  const map = s.mapUrl ?? (s.pos?.lat != null ? `https://www.openstreetmap.org/?mlat=${s.pos.lat}&mlon=${s.pos.lon}#map=16/${s.pos.lat}/${s.pos.lon}` : '');
  return `<div class="hl40-late${N ? ' alarm' : ''}">${N ? '<span class="hl40-k n">KRITISK · HJEMLYS</span>' : ''}<b class="hl40-lt">${N ? `${esc(first)} er ${over} min forsinket` : `${esc(first)} er ikke hjemme ennå`}</b>
    <span class="hl40-ls">Ventet ${esc(hm(p.eta))} · ${over} min over${s.okAskedAt ? ` · svarte ikke på «Alt OK?» kl. ${esc(hm(s.okAskedAt))}` : ''}</span>
    ${rows.length ? `<div class="hl40-facts col">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : '<span class="hl40-ls">Venter på delingsdata …</span>'}
    <span class="hl40-acts">${s.phone ? `<a class="hl40-b ink" href="tel:${esc(s.phone)}">Ring ${esc(first)}</a>` : ''}${map ? `<a class="hl40-b" href="${esc(map)}" target="_blank" rel="noopener">Åpne kart</a>` : `<a class="hl40-b" href="#/familie?person=${encodeURIComponent(p.userId ?? '')}">Åpne kart</a>`}${N ? '<a class="hl40-b" href="tel:112">Ring 112</a>' : ''}</span></div>`;
}
function otherRow(p) {
  if (p.state === 'late') return lateView(p);
  const home = p.state === 'home';
  const bits = home ? [`hjemme${p.since ? ` ${hm(p.since)}` : ''}`] : ['på vei hjem', 'i rute', p.eta ? hm(p.eta) : ''];
  return `<div class="hl40-o ${home ? 'home' : ''}">${avatar(p)}<span class="hl40-tx"><b>${esc(p.name)} · ${esc(bits[0])}</b><span>${esc(bits.slice(1).filter(Boolean).join(' · ') || (home ? 'Delingen er stoppet' : ''))}</span></span>${!home && p.eta ? `<b class="hl40-eta sm">${esc(hm(p.eta))}</b>` : ''}</div>`;
}
const sugOff = () => { try { return sessionStorage.getItem('hl40_sug_off') === '1'; } catch { return false; } };
/** Hjemlys-delen av Familie-kortet (og Familie-siden). Tom streng når serveren ikke har Hjemlys. */
export function hjemlysHtml({ page = false } = {}) {
  if (H.missing) return '';
  if (!H.d && !H.loading) loadHjemlys();
  if (!H.d) return '';
  const m = H.d.mine, others = (H.d.household ?? []).filter((p) => !p.self && p.userId !== m?.userId && (active(p.state) || (p.state === 'home' && p.since && Date.now() - Date.parse(p.since) < 3 * 3600_000)));
  const rows = `${others.filter((p) => p.state === 'late').map(otherRow).join('')}${m ? mineRow(m, page) : ''}${others.filter((p) => p.state !== 'late').map(otherRow).join('')}`;
  // 1b: Glimt foreslår (kalenderhendelse som slutter sent, etter 22, nattbuss) – ett trykk starter.
  const sg = H.sug;
  const sug = !m && sg?.suggest && !sugOff() ? `<div class="hl40-sug"><span class="hl40-sk">✦ GLIMT · NÅ</span><span class="hl40-st">${esc(sg.text || sg.reason || 'Sent ute i kveld? Skal jeg si fra til familien når du er hjemme?')}</span>${sg.eta ? `<span class="hl40-ls">${esc([sg.leg, `hjemme ca. ${hm(sg.eta)}`].filter(Boolean).join(' · '))}</span>` : ''}<span class="hl40-acts"><button type="button" class="hl40-b ink" data-hl40="sugyes">Ja, start</button><button type="button" class="hl40-b" data-hl40="sugno">Ikke nå</button></span></div>` : '';
  const start = m ? '' : `<button type="button" class="hl40-start" data-hl40="start">${GLOW}<span class="hl40-tx"><b>Hjemlys</b><span>Si fra til familien når du er hjemme</span></span><span class="hl40-go">Start ›</span></button>`;
  return `<div class="hl40${page ? ' page' : ''}" data-hl40-box><span class="hl40-k">HJEMLYS</span>${rows}${sug}${start}${H.err ? `<span class="hl40-err">${esc(H.err)}</span>` : ''}</div>`;
}
function paintAll() {
  document.querySelectorAll('[data-hl40-slot]').forEach((el) => { el.innerHTML = hjemlysHtml({ page: el.dataset.hl40Slot === 'page' }); });
}
// Nedtellingen i nattmodus tikker hvert sekund (bare teksten).
setInterval(() => { const m = H.d?.mine; if (!m?.eta || m.state !== 'onTheWay' || document.hidden) return; document.querySelectorAll('[data-hl40-cd]').forEach((el) => { el.textContent = mmss(m.eta); }); }, 1000);

/* ---------------- Startarket: 1a på dagtid, 1c (mørk) etter kl. 21 / i mørkt tema ---------------- */

const MODE_IC = { kollektiv: '🚋', 'gå': '🚶', sykkel: '🚲', taxi: '🚕' };
async function sheet(prefEta) {
  document.querySelector('.hl40-ov')?.remove();
  const N = night(), fam = (H.d?.household ?? []).filter((p) => !p.self);
  const ov = document.createElement('div');
  ov.className = `hl40-ov${N ? ' night' : ''}`;
  const st = { route: null, pick: 0, wait: 15, eta: prefEta && !Number.isNaN(Date.parse(prefEta)) ? new Date(prefEta) : null };
  const fallbackEta = () => { const d = new Date(Date.now() + 30 * 60_000); d.setSeconds(0, 0); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); return d; };
  const etaNow = () => st.eta ?? (st.route?.options?.[st.pick]?.eta ? new Date(st.route.options[st.pick].eta) : fallbackEta());
  const val = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const draw = () => {
    const R = st.route, opts = R?.options ?? [], eta = etaNow();
    const modes = opts.length ? `<div class="hl40-modes" role="radiogroup" aria-label="Reisemåte">${opts.map((o, i) => `<button type="button" role="radio" aria-checked="${i === st.pick && !st.eta}" data-hl40-m="${i}"><span>${MODE_IC[o.mode] ?? '•'} ${esc(o.label ?? o.mode)}</span><b>ca. ${esc(hm(o.eta))}</b>${i === st.pick && !st.eta ? '<i>✓</i>' : ''}</button>`).join('')}</div>` : '';
    ov.innerHTML = `<form class="hl40-sh" role="dialog" aria-modal="true" aria-label="Start Hjemlys">
      <div class="hl40-shh">${GLOW}<span class="hl40-tx"><span class="hl40-k${N ? ' n' : ''}">${N ? 'HJEMLYS · NATT' : 'SI FRA NÅR JEG ER HJEMME'}</span><b>${esc(R?.to?.name ?? R?.home ?? 'Hjem')}</b><span>${R?.from ? `Fra ${esc(R.from.name)} · ${String(R.from.km ?? '').replace('.', ',')} km` : 'Et lite lys som står på til du er hjemme'}</span></span><button type="button" class="hl40-x" data-hl40-x aria-label="Lukk">✕</button></div>
      ${R?.mapUrl || R?.geometry ? `<div class="hl40-map" aria-hidden="true">${R.mapUrl ? `<img src="${esc(R.mapUrl)}" alt="">` : '<span>⌂ KART</span>'}</div>` : ''}
      ${R === null ? '<span class="hl40-ls">Finner ruten hjem …</span>' : modes}
      <label class="hl40-f"><span>${opts.length ? 'Eller velg tid selv' : 'Forventet hjemme'}</span><input type="time" name="eta" value="${val(eta)}" required></label>
      <div class="hl40-f"><span>Får beskjed</span><span class="hl40-rec">${fam.map(avatar).join('')}<b>${fam.length ? esc(names(fam)) : 'Alle i husstanden'}</b></span></div>
      <div class="hl40-f"><span>${N ? 'Venter litt før varsel' : 'Si fra hvis jeg ikke svarer innen'}</span><div class="hl40-seg" role="group">${[5, 15, 30].map((n) => `<button type="button" data-hl40-w="${n}" aria-pressed="${n === st.wait}">${n} min</button>`).join('')}</div></div>
      ${N ? `<div class="hl40-f"><span>Deles hvis du er sen</span><span class="hl40-chk">${['Posisjon', 'Rute', 'Batteri og dekning', 'Siste opplåsing', 'Hvem du var med'].map((x) => `<span>✓ ${x}</span>`).join('')}</span></div>` : '<p class="hl40-note">Tiden oppdateres etter hvor du er. Deler ingenting før du er sen, eller hvis du stopper svaret.</p>'}
      <span class="hl40-err" hidden></span>
      <div class="hl40-btns"><button type="button" class="hl40-b" data-hl40-x>Avbryt</button><button type="submit" class="hl40-b ink">${N ? 'Start' : `Start · hjemme ca. ${val(eta)}`}</button></div></form>`;
  };
  draw();
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  // Ruten hjem (GET /api/hjemlys/route). 404 → bare tidsfeltet.
  api('/hjemlys/route').then((r) => { st.route = r && typeof r === 'object' ? r : {}; }).catch(() => { st.route = {}; }).finally(() => { if (ov.isConnected) draw(); });
  ov.addEventListener('input', (e) => { if (e.target.name === 'eta') { const [h, mi] = e.target.value.split(':').map(Number); if (Number.isFinite(h)) { const t = new Date(); t.setHours(h, mi, 0, 0); if (t < Date.now() - 60_000) t.setDate(t.getDate() + 1); st.eta = t; const sb = ov.querySelector('[type=submit]'); if (sb && !N) sb.textContent = `Start · hjemme ca. ${val(t)}`; ov.querySelectorAll('[data-hl40-m]').forEach((b) => b.setAttribute('aria-checked', 'false')); } } });
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-hl40-x]')) { e.preventDefault(); close(); return; }
    const m = e.target.closest('[data-hl40-m]');
    if (m) { st.pick = +m.dataset.hl40M; st.eta = null; draw(); return; }
    const w = e.target.closest('[data-hl40-w]');
    if (w) { st.wait = +w.dataset.hl40W; ov.querySelectorAll('[data-hl40-w]').forEach((b) => b.setAttribute('aria-pressed', String(b === w))); }
  });
  ov.addEventListener('submit', async (e) => {
    e.preventDefault();
    const o = !st.eta ? st.route?.options?.[st.pick] : null, err = ov.querySelector('.hl40-err');
    try { await startSession({ eta: etaNow().toISOString(), mode: o?.mode ?? 'manual', waitMin: st.wait }); close(); }
    catch (er) { err.hidden = false; err.textContent = er.status === 404 ? 'Serveren har ikke Hjemlys ennå.' : er.message; }
  });
  setTimeout(() => ov.querySelector('[type=submit]')?.focus(), 30);
}
async function startSession(body) {
  const r = await api('/hjemlys/start', { method: 'POST', json: body });
  H.d = { ...(H.d ?? {}), mine: r?.session ?? r ?? null };
  paintAll(); loadHjemlys(true);
}

async function act(a, v) {
  const m = H.d?.mine;
  if (!m?.id) return;
  H.busy = a; paintAll();
  try {
    const id = encodeURIComponent(m.id);
    let r;
    if (a === 'plus') r = await api(`/hjemlys/${id}`, { method: 'PATCH', json: { plus: +v || 10 } });
    else r = await api(`/hjemlys/${id}/${a}`, { method: 'POST', json: {} });
    const s = r?.session ?? r;
    if (s && typeof s === 'object' && s.id) H.d.mine = s.state === 'ended' ? null : s;
    if (a === 'end') H.d.mine = null;
    H.err = '';
  } catch (e) { H.err = e.message; }
  H.busy = ''; paintAll(); loadHjemlys(true);
}

let bound = false;
export function bindHjemlys() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-hl40]');
    if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.dataset.hl40;
    if (a === 'start') return sheet(b.dataset.eta || null);
    if (a === 'sugno') { try { sessionStorage.setItem('hl40_sug_off', '1'); } catch { /* */ } return paintAll(); }
    if (a === 'sugyes') { const g = H.sug ?? {}; if (!g.eta) return sheet(null); return startSession({ eta: g.eta, mode: 'glimt', waitMin: 15, ...(g.recipients ? { recipients: g.recipients.map((x) => x.userId ?? x) } : {}) }).catch((er) => { H.err = er.message; paintAll(); }); }
    if (a === 'end' && !confirm('Avslutte Hjemlys? Familien får ikke beskjed om at du er hjemme.')) return;
    act(a, b.dataset.v);
  }, true);
}

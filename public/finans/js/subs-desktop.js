// Subscription OS på PC (designet «Subscription OS», web): fanene Oversikt og Kalender, og «+ Legg til abonnement»
// med Skriv inn selv · Fra kvittering · Fra transaksjoner. Tallene kommer fra GET /subscriptions (byMonth, health,
// savings, upcoming, thisMonth). Kvitteringer lastes opp med data-mrc="sub" (modules.js), resten håndteres her.
import { S, api, esc, n0, render, toast, logo, parseAmount, sheetBtn } from './core.js';
import { toJpeg, readShot, errCardHtml, installVision, SLOW_MS } from './sub-shot.js';
import { parseTrial, trialPreview, trialBadge, cancelUrlFor, REMIND_OPTIONS, longDay } from '/assets/js/trial-parse.js';
import { aiStart, aiDone } from '/assets/js/ai-jobs.js';
import { glimt } from '/assets/js/glimt.js';
import { household, householdSync, avatars, avatarCss, colorFor } from '/assets/js/house37.js';

/* Prompt 31 (claude-code-prove-paminnelse.md, fasit «Abonnement Legg til ark.dc.html» → Gratis prøveperiode):
   «+ Legg til abonnement» → Gratis prøveperiode (✦ AI) → arket «Prøveperiode»: «✦ Skriv det med egne ord» + Fyll ut
   (trial-parse.js tolker teksten), Tjeneste · Prøven slutter · Pris etterpå, VARSLE MEG (flervalg, 1 dag før er standard),
   forhåndsvisning av varselet og «Lagre påminnelse». Lagres med POST /subscriptions/trials; serveren sender varslene.
   Aktive prøver vises i kortet «Prøveperioder» med merket «Prøve · N dager igjen» og Avslutt nå · Behold · Minn meg i morgen. */
const TR_CSS = `.str{gap:14px}
.str-ai{margin:0;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:20px;background:var(--inner,#fff);border:1.5px solid #b23a2a}
.str-cap{font-size:11.5px;font-weight:800;letter-spacing:.12em;color:#e0614f}
.str-ai>div{display:flex;gap:8px}
.str-ai input{flex:1;min-width:0}
.str-f{border-radius:20px;border:1px solid var(--line2);overflow:hidden;display:flex;flex-direction:column}
.str-f label{display:grid;grid-template-columns:130px minmax(0,1fr);align-items:center;gap:12px;min-height:52px;padding:0 16px;border-top:1px solid var(--line2);font-size:14px;font-weight:600;color:var(--muted)}
.str-f label:first-child{border-top:0}
.str-f input{min-width:0;height:44px;border:0;outline:none;background:transparent;text-align:right;color:var(--text);font-family:inherit;font-size:15px;font-weight:600;color-scheme:light dark}
.str-rem{display:flex;gap:6px;flex-wrap:wrap}
.str-rem .se-chip{flex:none;padding:0 14px}
.str-pv{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:var(--inner,rgba(255,255,255,.06));border:1px solid var(--line2)}
.str-pv>i{flex:none;width:34px;height:34px;border-radius:9px;background:#1b1a17;color:#f3efe6;display:grid;place-items:center;font:500 15px Newsreader,Georgia,serif;font-style:normal}
.str-pv>span{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.str-pv small{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted)}
.str-pv small b{color:var(--text);font-weight:700}
.str-pv strong{font-size:14px}
.str-pv em{font-style:normal;font-size:13px;line-height:1.35;color:var(--muted)}
.str-save{min-height:52px;border:0;border-radius:16px;background:#b23a2a;color:#fff;font-family:inherit;font-size:16px;font-weight:700;cursor:pointer}
.str-save:disabled{opacity:.6}
.str-err{font-size:13px;font-weight:600;color:#e0614f}
.so-tr-badge{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;background:rgba(232,121,74,.16);color:#e8794a;font-size:12px;font-weight:700;white-space:nowrap}
.so-trials .so-li{flex-wrap:wrap}
.so-tr-acts{display:flex;gap:6px;flex-wrap:wrap}
.so-mi.ai{color:#e8794a}`;
function trCss() { if (document.getElementById('str-css')) return; const st = document.createElement('style'); st.id = 'str-css'; st.textContent = TR_CSS; document.head.appendChild(st); }
const isoToday = () => new Date().toLocaleDateString('sv-SE');
function openTrial() { u.subMenu = false; u.subTr = { ai: '', n: '', e: '', p: '', rem: [1], err: '', busy: false }; }
function trialSheet() {
  const T = u.subTr;
  if (!T) return '';
  trCss();
  const price = parseAmount(T.p);
  const pv = T.e ? trialPreview({ service: T.n || 'Tjenesten', endsAt: T.e, priceAfter: price > 0 ? price : null, remindOffsetsDays: T.rem.length ? T.rem : [0] }) : null;
  return `<div class="se-back" data-str="close"><div class="se str" role="dialog" aria-modal="true" aria-label="Prøveperiode">
    <span class="se-grip" aria-hidden="true"></span>
    <div class="se-h"><b>Prøveperiode</b>${sheetBtn('Lukk', 'data-str="close"', 'sec')}</div>
    <span class="se-note" style="margin-top:-8px">Vi minner deg på å avslutte før den blir betalt.</span>
    <form class="str-ai" data-sform="trai"><span class="str-cap">✦ SKRIV DET MED EGNE ORD</span><div><input class="inp" name="ai" value="${esc(T.ai)}" placeholder="Viaplay gratis i 14 dager, påminn meg" enterkeyhint="go" autocomplete="off"><button class="btn pri">Fyll ut</button></div></form>
    <div class="str-f">
      <label>Tjeneste<input name="n" value="${esc(T.n)}" placeholder="Viaplay" data-str-f="n" autocomplete="off"></label>
      <label>Prøven slutter<input type="date" name="e" value="${esc(T.e)}" min="${isoToday()}" data-str-f="e"></label>
      <label>Pris etterpå<input name="p" value="${esc(T.p)}" placeholder="149 kr/mnd" inputmode="decimal" data-str-f="p"></label></div>
    <div class="se-f"><span class="se-l str-cap">VARSLE MEG</span><div class="str-rem">${REMIND_OPTIONS.map((o) => `<button type="button" class="se-chip" data-str-rem="${o.days}" aria-pressed="${T.rem.includes(o.days)}">${esc(o.label)}</button>`).join('')}</div></div>
    ${pv ? `<div class="str-pv" aria-label="Forhåndsvisning av varselet"><i>H</i><span><small><b>HOMELAB</b><span>${esc(pv.when)}</span></small><strong>${esc(pv.title)}</strong><em>${esc(pv.body)}</em></span></div>` : ''}
    ${T.err ? `<span class="str-err" role="alert">${esc(T.err)}</span>` : ''}
    <button type="button" class="str-save" data-str="save" ${T.busy ? 'disabled' : ''}>${T.busy ? 'Lagrer …' : 'Lagre påminnelse'}</button>
  </div></div>`;
}
/* Prompt 37 (claude-code-abo-provetid.md → Web): kortet «GRATIS PRØVEPERIODER · N» øverst i høyre kolonne på Oversikt.
   Én rad per aktiv prøve (færrest dager igjen først): logo, «Slutter fre 24. okt · deretter 149 kr/mnd», stort tall med dager igjen
   (rød ≤ 2, gul ≤ 7), fremdriftslinje, Avslutt nå ↗ · Behold · legg til og «Varsel tor 23. okt». + Legg til: tjeneste, sluttdato, pris. */
const activeTrials = (d) => (d.trials ?? []).filter((t) => t.status === 'active').map((t) => ({ ...t, dl: t.daysLeft ?? days(d.today, t.endsAt) })).sort((a, b) => a.dl - b.dl);
const WDS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const shortDay = (iso) => { const x = new Date(`${String(iso).slice(0, 10)}T12:00`); return isNaN(x) ? '' : `${WDS[x.getDay()]} ${x.getDate()}. ${MON_L[x.getMonth()].slice(0, 3)}`; };
function trialsCard(d) {
  const L = activeTrials(d), F = u.subTrAdd;
  trCss();
  const row = (t) => {
    const c = t.dl <= 2 ? '#e0533d' : t.dl <= 7 ? '#d08a1c' : 'var(--text)';
    const tot = t.created ? Math.max(1, Math.round((new Date(`${t.endsAt}T12:00`) - t.created) / 86400_000)) : 14;
    const pct = Math.min(100, Math.max(4, Math.round((1 - Math.max(0, t.dl) / tot) * 100)));
    const rem = (t.notifications ?? []).find((n) => !n.sent && n.kind === 'reminder') ?? (t.notifications ?? [])[0];
    const url = t.cancelUrl || cancelUrlFor(t.service);
    return `<div class="so37-tr"><div class="so37-tr1">${lg({ name: t.service, domain: t.domain }, 40)}<span class="grow"><b>${esc(t.service)}</b><small>Slutter ${esc(shortDay(t.endsAt))}${t.priceLabel ? ` · deretter ${esc(t.priceLabel)}` : ''}</small></span>
      <span class="so37-dl" style="color:${c}"><b>${Math.max(0, t.dl)}</b><small>${t.dl === 1 ? 'dag igjen' : 'dager igjen'}</small></span></div>
      <span class="so37-bar"><i style="width:${pct}%;background:${c}"></i></span>
      <div class="so37-tra">${url ? `<a class="so37-cut" href="${esc(url)}" target="_blank" rel="noopener" data-str-cancel="${t.id}">Avslutt nå ↗</a>` : `<button type="button" class="so37-cut" data-str-cancel="${t.id}">Avsluttet</button>`}<button type="button" class="so37-keep" data-str-keep="${t.id}">Behold · legg til</button>${rem?.date ? `<span class="so37-rem">Varsel ${esc(shortDay(rem.date))}</span>` : ''}</div></div>`;
  };
  return `<section class="card so37-trials" data-so-card="trials"><div class="so37-trh"><span>GRATIS PRØVEPERIODER · ${L.length}</span><button type="button" data-so37="tradd">${F ? 'Lukk' : '+ Legg til'}</button></div>
    ${F ? `<form class="so37-traf" data-sform="tr37"><input class="inp" name="n" value="${esc(F.n)}" placeholder="Tjeneste, f.eks. Storytel" aria-label="Tjeneste" required>
      <span class="so37-trr"><input class="inp" type="date" name="e" value="${esc(F.e)}" min="${esc(d.today)}" aria-label="Sluttdato" required><input class="inp" name="p" value="${esc(F.p)}" inputmode="numeric" placeholder="Pris etterpå" aria-label="Pris etterpå"></span>
      ${F.err ? `<span class="str-err" role="alert">${esc(F.err)}</span>` : ''}<button class="btn pri" ${F.busy ? 'disabled' : ''}>${F.busy ? 'Lagrer …' : 'Legg til · påminn dagen før'}</button></form>` : ''}
    ${L.length ? L.map(row).join('') : '<span class="so37-empty">Ingen aktive prøveperioder. Legg til en, så minner Glimt deg på å avslutte i tide.</span>'}</section>`;
}
const SO37_CSS = `.so37-trials{display:flex;flex-direction:column;gap:10px}
.so37-trh{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.so37-trh span{white-space:nowrap;font:700 12px var(--mono,'IBM Plex Mono',monospace);letter-spacing:.12em;color:#FF8A3D}
.so37-trh button{white-space:nowrap;border:0;background:transparent;color:var(--text);cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;padding:0}
.so37-tr{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:18px;background:var(--inner,rgba(127,127,140,.1))}
.so37-tr1{display:flex;align-items:center;gap:12px;min-width:0}
.so37-tr1 .grow{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.so37-tr1 b{font-size:15px}.so37-tr1 small{font-size:12.5px;color:var(--muted)}
.so37-dl{flex:none;display:flex;flex-direction:column;align-items:flex-end}
.so37-dl b{font-size:28px;font-weight:600;line-height:1}.so37-dl small{font-size:11px;color:var(--muted)}
.so37-bar{height:5px;border-radius:3px;background:rgba(127,127,140,.22);overflow:hidden}
.so37-bar i{display:block;height:100%;border-radius:3px}
.so37-tra{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.so37-cut,.so37-keep{height:32px;padding:0 13px;border-radius:16px;border:0;font-size:12.5px;font-weight:700;font-family:inherit;display:inline-flex;align-items:center;cursor:pointer;text-decoration:none}
.so37-cut{background:#FF5A3D;color:#fff}.so37-keep{background:var(--card,#fff);color:var(--text);border:1px solid var(--line2,rgba(127,127,140,.25))}
.so37-rem{margin-left:auto;font-size:12px;color:var(--muted)}
.so37-empty{font-size:13.5px;color:var(--muted);line-height:1.45}
.so37-traf{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:var(--inner,rgba(127,127,140,.1));margin:0}
.so37-trr{display:flex;gap:8px}.so37-trr input:first-child{flex:1;min-width:0;color-scheme:light dark}.so37-trr input:last-child{width:120px}
.so-tr.so37-trow{border:1.5px dashed rgba(255,138,61,.55);border-radius:14px;margin:4px 0}
.so37-tg{font:700 11px var(--mono,'IBM Plex Mono',monospace);letter-spacing:.12em;color:#FF8A3D;padding:12px 0 4px}
.so37-sh{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;font-weight:700;color:#3aa36b;margin-top:2px}
.so-name .so37-nm{display:flex;flex-direction:column;min-width:0}
.so37-plus{font-size:12.5px;color:#FF8A3D;font-weight:700}
.se-f .so37-mem{display:flex;gap:6px;flex-wrap:wrap}
.so37-mem button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px 0 4px;border-radius:17px;border:1px solid var(--line2,rgba(127,127,140,.3));background:transparent;color:var(--text);cursor:pointer;font-size:13px;font-weight:700;font-family:inherit}
.so37-mem button[aria-pressed=true]{background:var(--text);color:var(--bg,#fff);border-color:var(--text)}
.so37-mem button:disabled{opacity:.75;cursor:default}
.so37-mem .hs37-av i{box-shadow:none}`;
function so37Css() { if (document.getElementById('so37-css')) return; const st = document.createElement('style'); st.id = 'so37-css'; st.textContent = SO37_CSS; document.head.appendChild(st); avatarCss(); }

/* Delte abonnementer (Starlink): members [{userId,name,color}], split equal|payer, payerId, myShare. */
const memOf = (s) => (Array.isArray(s?.members) ? s.members : []).map((m) => ({ id: m.userId ?? m.id, name: m.name, color: m.color || colorFor(m.name) }));
const isShared = (s) => memOf(s).length > 1;
const shareTxt = (s) => {
  const my = s.myShare ?? (s.split === 'payer' ? (s.payerId && s.payerId === S.boot?.me?.id ? s.monthly : 0) : (s.monthly ?? s.price) / Math.max(1, memOf(s).length));
  return `Delt · din del ${kr(Math.round(my))}/mnd`;
};

const u = S.ui;
const kr = (v) => `${n0(v)} kr`;
const skel = (h = 160) => `<div class="skel" style="min-height:${h}px"></div>`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
const MON_L = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
// Kategorifarger: lys farge for valgt måned og legend, mørk for de andre månedene og stripene.
export const CAT_COL = { Underholdning: ['#FF7A3D', '#C85A26'], Produktivitet: ['#7AA7FF', '#4F78D0'], 'Lagring og sky': ['#F2C14E', '#BD9330'], 'Helse og trening': ['#5FD3A8', '#3A9F7B'],
  Transport: ['#B79CFF', '#8A70D6'], 'Mobil og internett': ['#30B0C7', '#22808F'], 'Nyheter og lesing': ['#FF8A80', '#C8615A'], Annet: ['#A0A0AA', '#6E6E78'] };
const col = (c, i = 0) => (CAT_COL[c] ?? CAT_COL.Annet)[i];
const CYC = [['monthly', 'Månedlig'], ['yearly', 'Årlig'], ['biennial', 'Hvert 2. år']];
const CYC_M = { monthly: 1, yearly: 12, biennial: 24 };
const ST = { active: ['Aktiv', 'ok'], low_use: ['⚠ Lite brukt', 'low'], price_up: ['▲ Pris økt', 'up'], cancelled: ['Sagt opp', 'off'] };
const ST_RANK = { price_up: 0, low_use: 1, active: 2, cancelled: 3 };
// Egen logo (opplastet eller ✦ funnet med AI) vises før domenelogoen.
const lg = (s, size = 28) => (s?.logoUrl ? `<span class="m-logo so-ownlogo" style="width:${size}px;height:${size}px;border-radius:${size / 2}px;flex:none;background-image:url('${esc(s.logoUrl)}')"></span>`
  : logo({ ...s, description: s.name ?? s.merchant, color: col(s.category) }, size, size / 2));
const dShort = (iso) => (iso ? `${+iso.slice(8, 10)}. ${MON_L[+iso.slice(5, 7) - 1].slice(0, 3)}` : '–');
const dLong = (iso) => `${+iso.slice(8, 10)}. ${MON_L[+iso.slice(5, 7) - 1]}`;
const ymOf = (iso) => iso.slice(0, 7);
const days = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 86400_000);
const dayWord = (iso, today) => { const n = days(today, iso); return n === 0 ? 'i dag' : n === 1 ? 'i morgen' : WD[new Date(`${iso}T12:00`).getDay()]; };
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);

export async function loadSubs() {
  S.subs = await api('/subscriptions');
  if (u.subCand) S.subCands = await api('/subscriptions/candidates');
  S.subsCal = u.subCalM && u.subCalM !== S.subs.month ? await api(`/subscriptions?month=${u.subCalM}`) : null;
}

/* ---------- Topplinje: fanene og «+ Legg til abonnement» ---------- */

function head() {
  const tab = u.subTab ?? 'ov';
  return `<div class="so-top"><div class="so-seg">${[['ov', 'Oversikt'], ['cal', 'Kalender']].map(([k, n]) => `<button data-stab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    <div class="so-addwrap"><button class="btn pri so-addbtn" data-sact="menu" aria-expanded="${!!u.subMenu}">+ Legg til abonnement ▾</button>
    ${u.subMenu ? `<div class="so-menu" role="menu">
      <label role="menuitem"><span class="so-mi">▣</span><span><b>Fra skjermbilde</b><small>✦ Ollama finner tjeneste, plan, pris og trekkdato</small></span>
        <input type="file" accept="image/*" data-ssk hidden></label>
      <button data-sact="trial" role="menuitem"><span class="so-mi ai">◷</span><span><b>Gratis prøveperiode</b><small>✦ Få varsel før prøven går over til betalt</small></span></button>
      <button data-sact="manual" role="menuitem"><span class="so-mi">✎</span><span><b>Skriv inn selv</b><small>Tjeneste, beløp og trekkdag</small></span></button>
      <label role="menuitem"><span class="so-mi">⎙</span><span><b>Fra kvittering</b><small>✦ AI leser bilde, PDF eller e-post</small></span>
        <input type="file" multiple accept="image/*,application/pdf,.eml,message/rfc822,.txt,text/plain" data-mrc="sub" hidden></label>
      <button data-sact="cands" role="menuitem"><span class="so-mi">⇄</span><span><b>Fra transaksjoner</b><small>✦ Finn faste trekk i banken</small></span></button></div>` : ''}</div></div>`;
}

/* ---------- Fra skjermbilde (prompt 27, «Subscription OS» → Fra skjermbilde) ---------- */
// POST /subscriptions/from-screenshot (multipart image) → {tjeneste, plan, pris (øre), valuta, prisOriginal?, approx, syklus,
// neste_trekk, kategori, logoUrl?, sikkerhet, check[], existingId?}. Bildet leses lokalt (Ollama) og slettes etterpå.
const SK_CYC = { mnd: 'monthly', år: 'yearly' };
function skPanel() {
  const K = u.subSk;
  if (!K) return '';
  const r = K.r, chk = (k) => (r?.check ?? []).includes(k) || (r?.sikkerhet?.[k] ?? 1) < 0.8;
  const row = (k, v, key) => `<div class="so-sk-r"><span>${k}</span><b>${esc(v ?? '–')}</b><span class="${chk(key) ? 'chk' : 'ok'}">${chk(key) ? 'Sjekk' : '✓'}</span></div>`;
  const nd = r?.neste_trekk ? `${+r.neste_trekk.slice(8, 10)}. ${MON_L[+r.neste_trekk.slice(5, 7) - 1]}` : '–';
  const price = r?.pris != null ? `${r.approx ? '≈ ' : ''}${n0(r.pris / 100)} kr${r.prisOriginal?.tekst ? ` (${r.prisOriginal.tekst})` : ''}` : '–';
  const ex = r?.existingId ? S.subs?.items?.find((y) => y.id === r.existingId) ?? r.existing : null;
  const body = K.busy ? `<span class="so-sk-t">${K.slow ? 'Laster bildemodellen … første gang tar det 30–60 sekunder.' : `Finner tjeneste, plan, pris og trekkdato${K.engine === 'gemini' ? ' med Gemini' : ''} …`}</span><span class="so-sk-bar"><span style="width:${Math.round(K.pct)}%"></span></span><span class="note" style="font-size:12px">${esc(K.name)}</span>`
    : K.err ? errCardHtml(K.err, { admin: isAdmin(), install: K.inst })
      : [row('Tjeneste', r.tjeneste, 'tjeneste'), row('Plan', r.plan, 'plan'), row('Pris', price, 'pris'), row('Syklus', r.syklus === 'år' ? 'Årlig' : 'Månedlig', 'syklus'), row('Neste trekk', nd, 'neste_trekk'), row('Kategori', r.kategori, 'kategori')].join('');
  const btns = K.busy || K.err ? '' : `<div class="so-sk-b">${ex ? `<button class="btn pri" data-sact="sk-update">Oppdater ${esc(ex.name)}</button>` : `<button class="btn pri" data-sact="sk-add">+ Legg til ${esc(r.tjeneste ?? 'abonnement')}</button>`}<button class="btn" data-sact="sk-edit">Rediger først</button></div>
    ${ex ? `<span class="note" style="font-size:12.5px">${esc(ex.name)} finnes allerede${ex.plan ? ` (${esc(ex.plan)}` : ' ('}${ex.price != null ? `${ex.plan ? ', ' : ''}${n0(ex.price)} kr)` : ')'}. Oppdater plan og pris i stedet for å legge til et nytt.</span>` : ''}`;
  return `<section class="card so-sk"><div class="card-h"><h2>✦ ${K.engine === 'gemini' ? 'Gemini' : 'Ollama'} leser skjermbildet</h2><button class="x-btn sm" data-sact="sk-close" aria-label="Lukk">×</button></div>
    <div class="so-sk-m"><span class="so-sk-img"${K.url ? ` style="background-image:url('${esc(K.url)}')"` : ''}></span><div class="so-sk-rows">${body}</div></div>
    ${btns}<span class="note" style="font-size:12px">Leses lokalt av bildemodellen på hjemmeserveren. Bildet slettes etter lesing. Felt merket «Sjekk» var utydelige.</span></section>`;
}
// Prompt 28: JPEG ≤ 1600 px fra canvas, konkrete feilkort (Prøv igjen · Les med Gemini · Installer qwen2.5vl · Skriv inn selv)
// og «Laster bildemodellen …» etter 5 s. Gemini brukes bare når brukeren trykker «Les med Gemini».
const isAdmin = () => (S.boot?.me?.role ?? 'admin') === 'admin'; // serveren avviser uansett ikke-admin (403)
async function readSk(file, engine = 'ollama') {
  const keep = u.subSk?.file === file ? u.subSk : null;
  if (u.subSk?.url && !keep) URL.revokeObjectURL(u.subSk.url);
  const K = u.subSk = { busy: true, pct: 4, name: file.name, url: keep?.url ?? URL.createObjectURL(file), r: null, err: null, file, img: keep?.img ?? null, engine, slow: false };
  u.subMenu = false; render();
  const t = setInterval(() => { if (u.subSk !== K || !K.busy) return clearInterval(t); K.pct = Math.min(92, K.pct + 3 + Math.random() * 6); const b = document.querySelector('.so-sk-bar span'); if (b) b.style.width = `${Math.round(K.pct)}%`; }, 300);
  const slow = setTimeout(() => { if (u.subSk === K && K.busy && engine !== 'gemini') { K.slow = true; render(); } }, SLOW_MS);
  // Prompt 31: Glimt-toasten og glassboblen følger lesingen (skjules mens kortet med fremdriften er synlig).
  const job = aiStart({ title: engine === 'gemini' ? 'Gemini leser skjermbildet' : 'Ollama leser skjermbildet', toast: `${engine === 'gemini' ? 'Gemini' : 'Ollama'} leser skjermbildet …`, model: engine === 'gemini' ? 'Glimt · Gemini (sky)' : 'Glimt · lokal', input: file.name,
    steps: ['Gjør bildet klart', 'Leser teksten i bildet', 'Finner tjeneste, plan og pris', 'Finner trekkdato'], dur: 9000, hideToast: () => !!document.querySelector('.so-sk') && !document.hidden });
  try {
    K.img ??= await toJpeg(file);
    K.r = await readShot(K.img, { engine });
  } catch (e) { K.err = e; }
  aiDone(job, { text: K.err ? '' : K.r?.tjeneste ? `✓ Fant ${K.r.tjeneste}` : '', ok: !K.err, silent: !!document.querySelector('.so-sk') && !document.hidden });
  clearInterval(t); clearTimeout(slow); K.busy = false; K.pct = 100;
  if (u.subSk === K) render();
}
async function skInstall() {
  const K = u.subSk; if (!K) return;
  K.inst = { status: 'starter', pct: 0 }; render();
  try { await installVision((p) => { if (u.subSk !== K) return; K.inst = p; render(); }); }
  catch (e) { K.inst = { error: e.message, done: true }; render(); return; }
  if (u.subSk === K && !K.inst?.error) { K.inst = null; await readSk(K.file); }
}
function skJson(r) {
  const nd = r.neste_trekk ?? '';
  return { name: r.tjeneste, plan: r.plan ?? '', price: (r.pris ?? 0) / 100, cycle: SK_CYC[r.syklus] ?? 'monthly', ...(nd ? { billDay: +nd.slice(8, 10), billMonth: +nd.slice(5, 7), nextDate: `${+nd.slice(8, 10)}.${+nd.slice(5, 7)}` } : {}), category: r.kategori, ...(r.logoUrl ? { logoUrl: r.logoUrl } : {}) };
}

function candPanel() {
  if (!u.subCand) return '';
  const c = S.subCands;
  const body = !c ? skel(90) : c.length ? c.map((x, i) => `<div class="so-cand">${lg({ ...x, name: x.merchant }, 32)}<span class="grow"><b>${esc(x.merchant)}</b>
      <small>Trekkes ${+x.lastDate.slice(8, 10)}. ${x.cycle === 'monthly' ? 'hver måned' : x.cycle === 'yearly' ? 'hvert år' : 'hvert 2. år'} · ${kr(x.amount)} · sett ${x.count} ganger</small></span>
      <button class="btn sm pri" data-scand="${i}">+ Legg til</button></div>`).join('')
    : '<div class="note">Fant ingen faste trekk som ikke allerede er registrert. Trekk må være sett minst 3 ganger med omtrent samme beløp.</div>';
  return `<section class="card so-cands"><div class="card-h"><h2>✦ Faste trekk i banken</h2><button class="x-btn sm" data-sact="cands-close" aria-label="Lukk">×</button></div>
    <div class="note">Trekk sett minst 3 ganger som ikke er registrert som abonnement.</div>${body}</section>`;
}

/* ---------- Oversikt ---------- */

function savingsCard(d) {
  const act = d.items.filter((s) => s.active);
  const low = act.filter((s) => s.status === 'low_use').length, up = act.filter((s) => s.status === 'price_up').length;
  const n = d.savings.suggestions.length;
  const parts = [low ? `${low} abonnement${low === 1 ? '' : 'er'} å se på` : '', up ? (up === 1 ? 'én prisøkning' : `${up} prisøkninger`) : ''].filter(Boolean);
  return `<section class="card so-sav"><span class="so-chip acc">✦ AI-SPARING</span>
    <h2 class="so-sav-h">${n ? `Spar ${kr(d.savings.monthly)} i måneden` : 'Ingenting å spare akkurat nå'}</h2>
    <p>${n ? `AI fant ${parts.join(', og ')}.` : 'Alle abonnementene ser ut til å være i bruk, og ingen har økt prisen.'}</p>
    ${n ? `<div class="so-row"><button class="btn so-white" data-sact="review">Gå gjennom</button><span class="muted">${n} forslag</span></div>` : ''}</section>`;
}

function totalCard(d) {
  const act = d.items.filter((s) => s.active);
  const pct = d.prevMonthly ? ((d.monthly - d.prevMonthly) / d.prevMonthly) * 100 : null;
  const by = [...act].sort((a, b) => b.monthly - a.monthly);
  const hi = by[0], lo = by.at(-1);
  const mini = (l, v, s, cls) => `<div class="so-mini"><span>${l}</span><b class="mono">${v}</b>${s ? `<span class="so-chip ${cls}">${esc(s)}</span>` : ''}</div>`;
  return `<section class="card so-total"><div class="so-total-l"><span class="muted">Faste abonnementer per måned</span><b class="mono so-big">${kr(d.monthly)}</b>
      <div class="so-row">${pct != null && Math.abs(pct) >= 0.05 ? `<span class="so-trend ${pct > 0 ? 'up' : 'dn'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1).replace('.', ',')} %</span><span class="muted">fra forrige måned ·</span>` : ''}<span class="muted"><span class="mono">${kr(d.yearly)}</span> i året</span></div>${(() => { const tp = activeTrials(d).reduce((a, t) => a + (+t.priceAfter || 0), 0); return tp ? `<span class="so37-plus">+${kr(tp)}/mnd hvis du beholder prøvene</span>` : ''; })()}</div>
    <div class="so-minis">${mini('Aktive', String(act.length), 'Alle tjenester', 'blue')}${mini('Dyreste', hi ? kr(hi.monthly) : '–', hi?.name, 'red')}${mini('Billigste', lo ? kr(lo.monthly) : '–', lo?.name, 'green')}</div></section>`;
}

function banner(d) {
  const up = d.upcoming ?? [];
  if (!up.length) return '';
  const txt = list(up.slice(0, 4).map((x) => `${esc(x.name)} ${kr(x.amount)} ${dayWord(x.date, d.today)}`));
  return `<div class="so-banner"><span class="so-bang">!</span><span class="grow">${up.length} trekk de neste dagene: ${txt}${up.length > 4 ? ' …' : ''}.</span><button class="so-link" data-stab="cal">Se kalender →</button></div>`;
}

function yearChart(d) {
  const cats = d.categories.filter((c) => d.byMonth.some((m) => m.byCategory[c]));
  const mx = Math.max(1, ...d.byMonth.map((m) => m.total));
  const cur = d.year === +d.today.slice(0, 4) ? +d.today.slice(5, 7) - 1 : 0;
  const sel = Math.min(11, Math.max(0, u.subMon ?? cur)), m = d.byMonth[sel];
  const bars = d.byMonth.map((x, i) => {
    const on = i === sel;
    const segs = [...cats].reverse().filter((c) => x.byCategory[c]).map((c) => `<i style="flex:${x.byCategory[c]} 0 0;background:${on ? col(c) : `${col(c, 1)}99`}"></i>`).join('');
    return `<button class="so-bar${on ? ' on' : ''}" data-smon="${i}" title="${MON[i]} ${d.year}: ${kr(x.total)}"><span class="so-stack" style="height:${Math.max(2, (x.total / mx) * 86)}%">${segs}</span><span class="so-bl">${MON[i]}</span></button>`;
  }).join('');
  const left = Math.min(82, Math.max(18, ((sel + 0.5) / 12) * 100));
  const tip = `<div class="so-tip" style="left:${left}%"><b><span class="so-dot" style="background:var(--text)"></span>${MON[sel]} ${d.year}</b>
    <span>Totalt</span><span class="mono">${kr(m.total)}</span>${cats.filter((c) => m.byCategory[c]).map((c) => `<span>${esc(c)}</span><span class="mono">${kr(m.byCategory[c])}</span>`).join('')}</div>`;
  return `<section class="card so-chart"><div class="card-h"><h2>Forbruk per måned · ${d.year}</h2><span class="muted">Trykk på en måned</span></div>
    <div class="so-bars">${m.total ? tip : ''}${bars}</div>
    <div class="so-legend">${cats.map((c) => `<span><span class="so-dot" style="background:${col(c)}"></span>${esc(c)}</span>`).join('')}</div></section>`;
}

function monthCard(d, byId) {
  const all = d.thisMonth.filter((x) => byId.has(x.id));
  const paid = all.filter((x) => x.date <= d.today), sum = (a) => a.reduce((s, x) => s + x.amount, 0);
  const total = sum(all), done = sum(paid);
  const shown = paid.length ? [...paid].reverse() : all;
  const dates = [...new Set(shown.map((x) => x.date))].slice(0, 3);
  const groups = dates.map((dt) => `<div class="so-grp"><span class="muted">${days(dt, d.today) === 0 ? 'I dag' : days(dt, d.today) === 1 ? 'I går' : dLong(dt)}</span>${shown.filter((x) => x.date === dt).map((x) => {
    const s = byId.get(x.id);
    return `<div class="so-li so-click" data-ssub-edit="${s.id}" role="button" tabindex="0">${lg(s, 32)}<span class="grow"><b>${esc(s.name)}</b><small>${x.date <= d.today ? 'Betalt' : 'Trekkes'} · ${esc(s.plan || s.cycleName)}</small></span><span class="mono so-neg">−${kr(x.amount)}</span></div>`;
  }).join('')}</div>`).join('');
  return `<section class="card so-month"><div class="card-h"><h2>Trekk denne måneden</h2><span class="muted">${kr(done)} av ${kr(total)}</span></div>
    <div class="so-prog"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    <span class="muted">${paid.length} av ${all.length} trekk er betalt</span>${groups || '<div class="note">Ingen trekk denne måneden.</div>'}</section>`;
}

function table(d) {
  const { k, dir } = u.subSort ?? { k: 'next', dir: 1 };
  const key = { name: (s) => s.name.toLowerCase(), plan: (s) => (s.plan ?? '').toLowerCase(), cyc: (s) => CYC_M[s.cycle] ?? 1, next: (s) => s.nextDate ?? '9999', amt: (s) => s.price, st: (s) => ST_RANK[s.status] ?? 2 }[k];
  const rows = [...d.items].sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1) || (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dir);
  const th = [['name', 'Tjeneste'], ['plan', 'Plan'], ['cyc', 'Trekk'], ['next', 'Neste trekk'], ['amt', 'Beløp'], ['st', 'Status']]
    .map(([c, n]) => `<button data-ssort="${c}" class="${k === c ? 'on' : ''}">${n} ${k === c ? (dir > 0 ? '↑' : '↓') : '↕'}</button>`).join('');
  const f = u.subF ?? {};
  const add = u.subAdd ? `<form class="so-tr so-new" data-sform="new">
      <input class="inp" name="name" placeholder="Tjeneste, f.eks. Disney+" value="${esc(f.name ?? '')}" required aria-label="Tjeneste">
      <input class="inp" name="plan" placeholder="Plan" value="${esc(f.plan ?? '')}" aria-label="Plan">
      <span class="so-cyc" role="radiogroup" aria-label="Trekk">${CYC.map(([v, l]) => `<label><input type="radio" name="cycle" value="${v}"${(f.cycle ?? 'monthly') === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</span>
      <input class="inp" name="chargeDay" type="number" min="1" max="31" placeholder="Trekkdag" value="${esc(f.chargeDay ?? '')}" aria-label="Trekkdag (1–31)">
      <input class="inp" name="price" placeholder="Beløp kr" inputmode="decimal" value="${esc(f.price ?? '')}" required aria-label="Beløp per trekk">
      <span class="so-new-b"><button class="btn sm pri">Legg til</button><button type="button" class="btn sm ghost" data-sact="add-close">Avbryt</button></span></form>` : '';
  const body = rows.map((s) => {
    const [stT, stC] = ST[s.status] ?? ST.active, flag = s.status === 'low_use' || s.status === 'price_up';
    const act = !s.active ? `<button class="so-act" data-msub-tog="${s.id}">Angre</button>` : flag ? `<button class="so-act on" data-ssub-cut="${s.id}">Si opp</button>` : `<button class="so-act" data-ssub-edit="${s.id}">Endre</button>`;
    const pop = u.subRow === s.id ? `<div class="so-pop">
        <label>Trekk<select class="sel sm" data-msub-cyc="${s.id}">${CYC.map(([v, l]) => `<option value="${v}"${s.cycle === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Trekkdag<input class="inp sm" type="number" min="1" max="31" value="${s.chargeDay ?? ''}" data-ssub-day="${s.id}"></label>
        <label>Kategori<select class="sel sm" data-ssub-cat="${s.id}">${d.categories.map((c) => `<option${s.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <button data-msub-low="${s.id}">${s.lowUse ? 'Fjern «Lite brukt»' : 'Marker som lite brukt'}</button>
        <button data-ssub-cut="${s.id}">Si opp</button><button class="so-del" data-msub-del="${s.id}">Slett</button></div>` : '';
    const price = s.status === 'price_up' && s.prevPrice != null ? ` title="Var ${kr(s.prevPrice)} til ${dShort(s.priceChanged)}"` : '';
    return `<div class="so-tr so-click${s.active ? '' : ' off'}" data-ssub-edit="${s.id}" role="button" tabindex="0" aria-label="Rediger ${esc(s.name)}"><span class="so-name">${lg(s)}${isShared(s) ? `<span class="so37-nm"><b>${esc(s.name)} ${avatars(memOf(s), 18)}</b><span class="so37-sh">${esc(shareTxt(s))}</span></span>` : `<b>${esc(s.name)}</b>`}</span><span class="sub ell">${esc(s.plan || '–')}</span><span class="sub">${s.cycleName}</span>
      <span class="sub">${dShort(s.nextDate)}</span><span class="mono"${price}>${kr(s.price)}</span><span><span class="so-st ${stC}"${s.usageNote ? ` title="${esc(s.usageNote)}"` : ''}>${stT}</span></span><span class="so-hand">${act}${pop}</span></div>`;
  }).join('');
  return `<section class="card so-table"><div class="card-h"><h2>Abonnementer</h2><button class="so-link plain" data-sact="${u.subAdd ? 'add-close' : 'manual'}">${u.subAdd ? 'Lukk' : '⊕ Nytt abonnement'}</button></div>
    <div class="so-tr so-th">${th}<span>Handling</span></div>${add}${trialRows(d)}${body || '<div class="empty">Ingen abonnementer ennå. Legg til ett med «+ Legg til abonnement».</div>'}</section>`;
}

// Egen gruppe «Prøveperioder» øverst i tabellen (stiplet ramme, som i abonnementskalenderen).
function trialRows(d) {
  const L = activeTrials(d);
  if (!L.length) return '';
  return `<div class="so37-tg">PRØVEPERIODER · ${L.length}</div>${L.map((t) => `<div class="so-tr so37-trow"><span class="so-name">${lg({ name: t.service, domain: t.domain })}<b>${esc(t.service)}</b></span><span class="sub ell">Gratis prøve</span><span class="sub">${t.priceAfter ? 'Månedlig' : '–'}</span>
    <span class="sub">${dShort(t.endsAt)}</span><span class="mono">${t.priceAfter ? kr(t.priceAfter) : '–'}</span><span><span class="so-tr-badge">${Math.max(0, t.dl)} d igjen</span></span><span class="so-hand"><button class="so-act" data-str-keep="${t.id}">Behold</button></span></div>`).join('')}<div class="so37-tg">ABONNEMENTER</div>`;
}

function gauge(score) {
  const ticks = Array.from({ length: 30 }, (_, i) => {
    const a = Math.PI * (1 - i / 29), on = i / 29 <= score / 100;
    const c = on ? (i < 10 ? '#C85A26' : i < 20 ? 'var(--acc)' : 'var(--acc-l)') : '#2A2A32';
    return `<line x1="${(110 + 78 * Math.cos(a)).toFixed(1)}" y1="${(112 - 78 * Math.sin(a)).toFixed(1)}" x2="${(110 + 100 * Math.cos(a)).toFixed(1)}" y2="${(112 - 100 * Math.sin(a)).toFixed(1)}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
  }).join('');
  return `<svg class="so-gauge" viewBox="0 0 220 124" role="img" aria-label="Abonnementshelse ${score} av 100">${ticks}<text x="110" y="112" text-anchor="middle"><tspan class="so-gv">${score}</tspan><tspan class="so-gm" dx="2">/100</tspan></text></svg>`;
}

function healthCard(d) {
  const h = d.health;
  return `<section class="card so-health"><div class="card-h"><h2>Abonnementshelse</h2><span class="so-chip ${h.score >= 65 ? 'green' : h.score >= 45 ? 'acc' : 'red'}">${esc(h.label)}</span></div>${gauge(h.score)}<p class="muted">${esc(h.text)}</p></section>`;
}

function tipsCard(d, byId) {
  const s = d.savings.suggestions;
  return `<section class="card so-tips"><h2>✦ Forslag</h2>${s.length ? s.map((x) => `<div class="so-li top">${lg({ ...(byId.get(x.id) ?? {}), name: x.name, domain: x.domain }, 30)}<span class="grow">${esc(x.text)} <b class="so-pos">−${kr(x.amount)}/mnd</b></span></div>`).join('')
    : '<div class="note">Ingen forslag akkurat nå.</div>'}</section>`;
}

function overview(d, byId) {
  so37Css();
  return `<div class="so-r1">${savingsCard(d)}${totalCard(d)}</div>${banner(d)}
    <div class="so-r2">${yearChart(d)}${monthCard(d, byId)}</div>
    <div class="so-r3">${table(d)}<div class="so-side">${trialsCard(d)}${healthCard(d)}${tipsCard(d, byId)}</div></div>`;
}

/* ---------- Kalender ---------- */

function calendar(d, byId) {
  const ym = u.subCalM ?? d.month, src = ym === d.month ? d : S.subsCal;
  if (!src) return skel(480);
  const [y, m] = ym.split('-').map(Number);
  const charges = src.thisMonth.filter((x) => byId.has(x.id));
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
  const sel = u.subDay && u.subDay.startsWith(ym) ? u.subDay : d.today.startsWith(ym) ? d.today : `${ym}-01`;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="so-day blank"></span>');
  for (let i = 1; i <= n; i++) {
    const iso = `${ym}-${String(i).padStart(2, '0')}`, on = charges.filter((x) => x.date === iso);
    const cls = [iso < d.today ? 'past' : '', iso === d.today ? 'today' : '', iso === sel ? 'sel' : ''].filter(Boolean).join(' ');
    cells.push(`<button class="so-day ${cls}" data-sday="${iso}"><span class="so-dn">${i}</span><span class="so-dl">${on.slice(0, 3).map((x) => lg(byId.get(x.id), 22)).join('')}</span>${on.length ? `<span class="mono so-ds">${kr(on.reduce((a, x) => a + x.amount, 0))}</span>` : ''}</button>`);
  }
  const L = charges.filter((x) => x.date === sel);
  const detail = `<section class="card so-dd"><span class="so-ddt">${sel === d.today ? 'I DAG · ' : ''}${dLong(sel).toUpperCase()}</span><b class="mono so-ddv">${kr(L.reduce((a, x) => a + x.amount, 0))}</b>
    ${L.length ? L.map((x) => { const s = byId.get(x.id); return `<div class="so-li so-click" data-ssub-edit="${s.id}" role="button" tabindex="0">${lg(s, 32)}<span class="grow"><b>${esc(s.name)}</b><small>${esc([s.plan, s.cycleName, s.category].filter(Boolean).join(' · '))}</small></span><span class="mono">${kr(x.amount)}</span></div>`; }).join('') : '<div class="note">Ingen trekk denne dagen.</div>'}</section>`;
  const per = {};
  for (const s of d.items) if (s.active) per[s.category] = (per[s.category] ?? 0) + s.monthly;
  const cats = d.categories.filter((c) => per[c]), mx = Math.max(1, ...cats.map((c) => per[c]));
  const split = `<section class="card so-split"><h2>Fordeling per måned</h2>${cats.map((c) => `<div class="so-cb"><span>${esc(c)}</span><span class="mono">${kr(per[c])}</span>
    <span class="so-cbar"><i style="width:${(per[c] / mx) * 100}%;background:repeating-linear-gradient(135deg,${col(c)} 0 6px,${col(c, 1)} 6px 9px)"></i></span></div>`).join('') || '<div class="note">Ingen aktive abonnementer.</div>'}</section>`;
  return `<div class="so-cal-wrap"><section class="card so-cal"><div class="card-h"><div class="so-row"><button class="x-btn sm" data-scal="-1" aria-label="Forrige måned">‹</button><h2>${MON_L[m - 1][0].toUpperCase()}${MON_L[m - 1].slice(1)} ${y}</h2><button class="x-btn sm" data-scal="1" aria-label="Neste måned">›</button></div>
    <span class="muted">${kr(charges.reduce((a, x) => a + x.amount, 0))} trekkes i ${MON_L[m - 1]}</span></div>
    <div class="so-grid">${['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((x) => `<span class="so-wd">${x}</span>`).join('')}${cells.join('')}</div></section>
    <div class="so-side">${detail}${split}</div></div>`;
}

/* ---------- Rediger / legg til (ark) ---------- */
// Samme ark for «Skriv inn selv» (tomt) og et trykk på et abonnement: logo (last opp eller ✦ AI), navn, pris, plan,
// kategori, hvor ofte, faktureringsdato (dag + måned) og status. Lagres med POST/PATCH /subscriptions.
const ST_ED = [['active', 'Aktiv'], ['low_use', 'Lite brukt'], ['cancelled', 'Sagt opp']];
const CYC_THEN = { monthly: 'deretter hver måned', yearly: 'deretter hvert år', biennial: 'deretter hvert 2. år' };
function openEd(s) {
  const now = new Date(), next = s?.nextDate;
  u.subEd = s ? { id: s.id, n: s.name, plan: s.plan ?? '', v: String(s.price).replace('.', ','), cyc: s.cycle, day: s.billDay ?? s.chargeDay ?? (next ? +next.slice(8, 10) : now.getDate()),
    mon: s.billMonth ?? (next ? +next.slice(5, 7) : now.getMonth() + 1), cat: s.category, st: !s.active ? 'cancelled' : s.lowUse ? 'low_use' : 'active', logo: s.logoUrl ?? '', domain: s.domain,
      mem: memOf(s).map((m) => m.id).filter((id) => id !== S.boot?.me?.id), mem0: memOf(s).map((m) => m.id).sort().join(','), split: s.split ?? 'equal', split0: s.split ?? 'equal', owner: s.ownerId ? s.ownerId === S.boot?.me?.id : s.mine !== false }
    : { id: null, n: '', plan: '', v: '', cyc: 'monthly', day: now.getDate(), mon: now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2, cat: S.subs?.categories?.[0] ?? 'Annet', st: 'active', logo: '' };
  u.subMenu = false; u.subRow = null;
}
function editSheet(d) {
  const e = u.subEd;
  if (!e) return '';
  const pv = e.file ? e.preview : e.logo;
  const logoBox = `<span class="se-logo" style="${pv ? `background-image:url('${esc(pv)}')` : `background:${col(e.cat)}`}">${pv ? '' : esc((e.n || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span>`;
  const chips = (list, cur, attr) => list.map(([k, n]) => `<button type="button" class="se-chip" ${attr}="${k}" aria-pressed="${cur === k}">${n}</button>`).join('');
  const dateTxt = `Neste trekk ${e.day}. ${MON_L[(+e.mon || 1) - 1]}, ${CYC_THEN[e.cyc] ?? CYC_THEN.monthly}`;
  return `<div class="se-back" data-sed="close"><form class="se" data-sform="ed" role="dialog" aria-modal="true" aria-label="${e.id ? `Rediger ${esc(e.n)}` : 'Nytt abonnement'}">
    <span class="se-grip" aria-hidden="true"></span>
    <div class="se-h"><b>${e.id ? `Rediger ${esc(e.n)}` : 'Nytt abonnement'}</b>${sheetBtn('Lukk', 'data-sed="close"', 'sec')}</div>
    <div class="se-logorow">${logoBox}<div class="se-lc"><span class="se-l">Logo</span><div class="se-lb">
      <label class="btn sm">↑ Last opp<input type="file" accept="image/png,image/jpeg,image/webp" data-sed-file hidden></label>
      <button type="button" class="btn sm" data-sed="ai" ${e.busy ? 'disabled' : ''}>${e.busy ? `${glimt(14, 'tenker')} Leter …` : '✦ Finn logo med AI'}</button>
      ${pv ? '<button type="button" class="btn sm ghost" data-sed="nologo">Fjern</button>' : ''}</div>
      ${e.aiPending ? '<small class="se-note">✦ Logoen hentes når abonnementet er lagret.</small>' : ''}</div></div>
    <div class="se-g2"><label>Navn<input class="inp" name="n" value="${esc(e.n)}" placeholder="F.eks. HBO Max" required></label><label>Pris (kr)<input class="inp mono" name="v" value="${esc(e.v)}" inputmode="decimal" placeholder="129" required></label></div>
    <div class="se-g2 eq"><label>Plan<input class="inp" name="plan" value="${esc(e.plan)}" placeholder="Standard"></label><label>Kategori<select class="sel" name="cat">${(d.categories ?? []).map((c) => `<option${e.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
    <div class="se-f"><span class="se-l">Hvor ofte</span><div class="se-chips">${chips(CYC, e.cyc, 'data-sed-cyc')}</div></div>
    <div class="se-f"><span class="se-l">Faktureringsdato</span><div class="se-date"><select class="sel" name="day" aria-label="Dag">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${+e.day === i + 1 ? ' selected' : ''}>${i + 1}.</option>`).join('')}</select>
      <select class="sel" name="mon" aria-label="Måned">${MON_L.map((m, i) => `<option value="${i + 1}"${+e.mon === i + 1 ? ' selected' : ''}>${m[0].toUpperCase()}${m.slice(1)}</option>`).join('')}</select></div><small class="se-note" data-sed-date>${esc(dateTxt)}</small></div>
    <div class="se-f"><span class="se-l">Status</span><div class="se-chips">${chips(ST_ED, e.st, 'data-sed-st')}</div></div>
    ${shareSection(e)}
    <div class="se-btns"><button class="btn pri se-save">Lagre</button>${e.id ? '<button type="button" class="btn se-del" data-sed="del">Slett</button>' : ''}</div>
  </form></div>`;
}

// «Del med husstanden»: brukerne som chips med avatar (du selv er alltid med), Del likt / Jeg betaler og hint.
function shareSection(e) {
  const H = householdSync(), meId = S.boot?.me?.id;
  if (!H.length) { household().then((x) => { if (x.length && u.subEd) render(); }).catch(() => {}); return ''; }
  if (H.length < 2 && !e.mem?.length) return '';
  const chips = (list, cur, attr) => list.map(([k, n2]) => `<button type="button" class="se-chip" ${attr}="${k}" aria-pressed="${cur === k}">${n2}</button>`).join('');
  const sel = new Set([meId, ...(e.mem ?? [])].filter(Boolean)), n = sel.size, price = parseAmount(e.v) || 0;
  const per = CYC_M[e.cyc] ? price / CYC_M[e.cyc] : price;
  const hint = n < 2 ? 'Bare du ser abonnementet. Del det for å fordele prisen.'
    : e.split === 'payer' ? `Du betaler hele beløpet (${kr(Math.round(per))}/mnd). De andre ser abonnementet, trekkdato og varsler.`
    : `Hver betaler ${kr(Math.round(per / n))}/mnd. Alle ser abonnementet, trekkdato og varsler. Bare din del teller i ditt budsjett.`;
  return `<div class="se-f"><span class="se-l">Del med husstanden</span><div class="so37-mem">${H.map((p) => { const on = sel.has(p.id), self = p.id === meId; return `<button type="button" data-sed-mem="${esc(p.id)}" aria-pressed="${on}"${self || e.owner === false ? ' disabled' : ''}>${avatars([p], 24)}${esc(self ? `${p.name} (deg)` : p.name)}</button>`; }).join('')}</div>
    ${n > 1 && e.owner !== false ? `<div class="se-chips">${chips([['equal', 'Del likt'], ['payer', 'Jeg betaler']], e.split ?? 'equal', 'data-sed-split')}</div>` : ''}<small class="se-note">${esc(e.owner === false ? `${hint} Bare eieren kan endre deling og pris.` : hint)}</small>
    ${e.id && e.owner === false ? '<button type="button" class="btn sm ghost" data-sed="leave">Forlat abonnementet</button>' : ''}</div>`;
}

export function subPage() {
  const d = S.subs;
  if (!d?.byMonth) return skel(400);
  const byId = new Map(d.items.map((s) => [s.id, s]));
  return `<div class="so">${head()}${skPanel()}${candPanel()}${(u.subTab ?? 'ov') === 'cal' ? calendar(d, byId) : overview(d, byId)}</div>${editSheet(d)}${trialSheet()}`;
}

/* ---------- Hendelser ---------- */

export function bindSubs(el) {
  const wrap = (fn) => async (e) => { if (u.page !== 'sub') return; try { await fn(e); } catch (err) { toast(err.message); } };
  const reload = async () => { await loadSubs(); render(); };
  const saveEd = async () => {
    const e2 = u.subEd, price = parseAmount(e2.v);
    if (!e2.n.trim() || !(price >= 0)) return toast('Fyll inn navn og pris');
    const json = { name: e2.n.trim(), plan: e2.plan.trim(), price, cycle: e2.cyc, billDay: +e2.day, billMonth: +e2.mon, nextDate: `${+e2.day}.${+e2.mon}`, category: e2.cat, status: e2.st };
    if (!e2.logo && !e2.file && e2.id) json.logoUrl = null;
    const s = e2.id ? await api(`/subscriptions/${e2.id}`, { method: 'PATCH', json }) : await api('/subscriptions', { method: 'POST', json });
    if (e2.file) { const fd = new FormData(); fd.append('file', e2.file); await api(`/subscriptions/${s.id}/logo`, { method: 'POST', body: fd }).catch((err) => toast(err.message)); }
    else if (e2.aiPending) await api(`/subscriptions/${s.id}/logo/ai`, { method: 'POST' }).catch(() => toast('Fant ingen logo. Last opp et bilde.'));
    const meId = S.boot?.me?.id, mem = [...new Set([meId, ...(e2.mem ?? [])].filter(Boolean))];
    if (mem.slice().sort().join(',') !== (e2.mem0 || meId || '') || (e2.split ?? 'equal') !== (e2.split0 ?? 'equal')) {
      if (mem.length > 1 || e2.mem0) await api(`/subscriptions/${s.id}/members`, { method: 'PUT', json: { members: mem, split: e2.split ?? 'equal', payerId: e2.split === 'payer' ? meId : null } })
        .catch((err) => toast(err.status === 404 ? 'Serveren støtter ikke delte abonnementer ennå.' : err.message));
    }
    toast(e2.id ? `Lagret ${s.name}` : `${s.name} er lagt til`);
    u.subEd = null; return reload();
  };
  const patch = async (id, json) => { await api(`/subscriptions/${id}`, { method: 'PATCH', json }); return reload(); };
  el.addEventListener('click', wrap(async (e) => {
    const d = (s) => e.target.closest(s);
    let x;
    // Menyene lukkes ved klikk utenfor.
    if (u.subMenu && !d('.so-addwrap')) { u.subMenu = false; render(); }
    if (u.subRow && !d('.so-hand')) { u.subRow = null; render(); }
    if ((x = d('[data-so37="tradd"]'))) { u.subTrAdd = u.subTrAdd ? null : { n: '', e: '', p: '', err: '', busy: false }; render(); if (u.subTrAdd) el.querySelector('[data-sform="tr37"] [name=n]')?.focus(); return; }
    if ((x = d('[data-stab]'))) { u.subTab = x.dataset.stab; u.subMenu = false; return render(); }
    if ((x = d('[data-smon]'))) { u.subMon = +x.dataset.smon; return render(); }
    if ((x = d('[data-sday]'))) { u.subDay = x.dataset.sday; return render(); }
    if ((x = d('[data-ssort]'))) { const k = x.dataset.ssort, cur = u.subSort ?? { k: 'next', dir: 1 }; u.subSort = { k, dir: cur.k === k ? -cur.dir : 1 }; return render(); }
    // Bakgrunnen lukker bare når selve bakgrunnen trykkes, ikke arket.
    if ((x = d('[data-sed]')) && !(x.classList.contains('se-back') && e.target !== x)) {
      const e2 = u.subEd, k = x.dataset.sed;
      if (k === 'close') { u.subEd = null; return render(); }
      if (k === 'leave') {
        if (!confirm(`Forlate ${e2.n}? Du ser det ikke lenger, og din del fjernes fra budsjettet.`)) return;
        await api(`/subscriptions/${e2.id}/leave`, { method: 'POST' }); toast(`Du har forlatt ${e2.n}`); u.subEd = null; return reload();
      }
      if (k === 'nologo') { e2.logo = ''; e2.file = null; e2.preview = null; e2.aiPending = false; return render(); }
      if (k === 'ai') {
        if (!e2.n.trim()) return toast('Skriv inn navnet først');
        if (!e2.id) { e2.aiPending = true; e2.file = null; e2.preview = null; return render(); }
        e2.busy = true; render();
        try { const r = await api(`/subscriptions/${e2.id}/logo/ai`, { method: 'POST' }); e2.logo = r.logoUrl; toast(`✦ Fant logo for ${e2.n}`); await loadSubs(); }
        catch (err) { toast(err.message || 'Fant ingen logo. Last opp et bilde.'); }
        e2.busy = false; return render();
      }
      if (k === 'del') {
        if (!confirm(`Slette ${e2.n}?`)) return;
        await api(`/subscriptions/${e2.id}`, { method: 'DELETE' }); toast(`${e2.n} er slettet`); u.subEd = null; return reload();
      }
    }
    /* Prøveperiode-arket og -kortet (prompt 31). */
    if ((x = d('[data-str]')) && !(x.classList.contains('se-back') && e.target !== x)) {
      const T = u.subTr, k = x.dataset.str;
      if (k === 'close') { u.subTr = null; return render(); }
      if (k === 'save' && T) {
        const price = parseAmount(T.p);
        if (!T.n.trim() || !T.e) { T.err = 'Fyll inn tjeneste og sluttdato'; return render(); }
        T.busy = true; T.err = ''; render();
        try {
          const r = await api('/subscriptions/trials', { method: 'POST', json: { service: T.n.trim(), endsAt: T.e, priceAfter: price > 0 ? price : null, remindOffsetsDays: T.rem.length ? [...T.rem].sort((a, b) => a - b) : [0], source: T.fromAi ? 'glimt' : 'skjema' } });
          u.subTr = null; toast(`Påminnelse lagret · ${r?.service ?? T.n.trim()}`); return reload();
        } catch (err) { T.busy = false; T.err = err.status === 404 ? 'Serveren har ikke prøveperioder ennå. Oppdater Nordlys.' : err.message; return render(); }
      }
    }
    if (u.subTr && d('.str')) {
      if ((x = d('[data-str-rem]'))) { const v = +x.dataset.strRem, T = u.subTr; T.rem = T.rem.includes(v) ? T.rem.filter((y) => y !== v) : [...T.rem, v]; return render(); }
      return;
    }
    if ((x = d('[data-str-keep]'))) { await api(`/subscriptions/trials/${x.dataset.strKeep}`, { method: 'PATCH', json: { status: 'kept' } }); toast('Gjort om til vanlig abonnement'); return reload(); }
    if ((x = d('[data-str-snooze]'))) { await api(`/subscriptions/trials/${x.dataset.strSnooze}`, { method: 'PATCH', json: { snooze: 'tomorrow' } }); toast('Du får et nytt varsel i morgen kl. 09:00'); return reload(); }
    if ((x = d('[data-str-cancel]'))) {
      // «Avslutt nå» åpner oppsigelsessiden (lenken) og markerer prøven som avsluttet.
      const id = x.dataset.strCancel;
      if (x.tagName !== 'A' && !confirm('Markere prøven som avsluttet?')) return;
      await api(`/subscriptions/trials/${id}`, { method: 'PATCH', json: { status: 'cancelled' } }).catch((err) => toast(err.message));
      toast('Prøven er markert som avsluttet'); return reload();
    }
    if (u.subEd && d('.se')) {
      if ((x = d('[data-sed-cyc]'))) { u.subEd.cyc = x.dataset.sedCyc; return render(); }
      if ((x = d('[data-sed-st]'))) { u.subEd.st = x.dataset.sedSt; return render(); }
      if ((x = d('[data-sed-mem]'))) { const id = x.dataset.sedMem, m = u.subEd.mem ?? []; u.subEd.mem = m.includes(id) ? m.filter((y) => y !== id) : [...m, id]; return render(); }
      if ((x = d('[data-sed-split]'))) { u.subEd.split = x.dataset.sedSplit; return render(); }
      return;
    }
    // Knappene i Handling-kolonnen (Si opp, Angre) har egne handlinger; resten av raden åpner redigering.
    if ((x = d('[data-ssub-edit]')) && !(d('.so-hand') && !d('.so-act[data-ssub-edit]'))) { e.stopPropagation(); const s = S.subs.items.find((y) => y.id === +x.dataset.ssubEdit); if (s) { openEd(s); render(); } return; }
    if ((x = d('[data-ssub-menu]'))) { const id = +x.dataset.ssubMenu; u.subRow = u.subRow === id ? null : id; return render(); }
    if ((x = d('[data-ssub-cut]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.ssubCut); u.subRow = null; await patch(s.id, { active: false }); return toast(`${s.name} er markert som sagt opp`); }
    if ((x = d('[data-scal]'))) {
      const [y, m] = (u.subCalM ?? S.subs.month).split('-').map(Number), t = new Date(y, m - 1 + +x.dataset.scal, 1);
      u.subCalM = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; u.subDay = null; S.subsCal = null; render();
      if (u.subCalM !== S.subs.month) S.subsCal = await api(`/subscriptions?month=${u.subCalM}`);
      return render();
    }
    if ((x = d('[data-scand]'))) {
      const c = S.subCands[+x.dataset.scand];
      x.disabled = true;
      const s = await api('/subscriptions', { method: 'POST', json: { fromCandidate: c } });
      toast(`${s.name} er lagt til`); return reload();
    }
    if ((x = d('.so-sk [data-shot]'))) {
      const K = u.subSk, a = x.dataset.shot; if (!K) return;
      if (a === 'retry') return readSk(K.file);
      if (a === 'gemini') return readSk(K.file, 'gemini');
      if (a === 'install') return skInstall();
      if (a === 'manual') { if (K.url) URL.revokeObjectURL(K.url); u.subSk = null; openEd(null); render(); el.querySelector('.se [name=n]')?.focus(); return; }
    }
    if ((x = d('[data-sact]'))) {
      switch (x.dataset.sact) {
        case 'menu': u.subMenu = !u.subMenu; return render();
        case 'manual': openEd(null); render(); el.querySelector('.se [name=n]')?.focus(); return;
        case 'trial': openTrial(); render(); el.querySelector('.str [name=ai]')?.focus(); return;
        case 'add-close': u.subAdd = false; u.subF = null; return render();
        case 'cands': u.subMenu = false; u.subCand = true; S.subCands = null; render(); S.subCands = await api('/subscriptions/candidates'); return render();
        case 'cands-close': u.subCand = false; return render();
        case 'sk-close': if (u.subSk?.url) URL.revokeObjectURL(u.subSk.url); u.subSk = null; return render();
        case 'sk-add': {
          const r = u.subSk?.r; if (!r?.tjeneste) return toast('Fant ingen tjeneste. Bruk «Rediger først».');
          x.disabled = true;
          const sub = await api('/subscriptions', { method: 'POST', json: skJson(r) });
          u.subSk = null; toast(`${sub.name} er lagt til`); return reload();
        }
        case 'sk-update': {
          const r = u.subSk?.r; if (!r?.existingId) return;
          const { name, ...rest } = skJson(r); void name;
          await api(`/subscriptions/${r.existingId}`, { method: 'PATCH', json: { plan: rest.plan, price: rest.price, cycle: rest.cycle, ...(rest.billDay ? { billDay: rest.billDay, billMonth: rest.billMonth, nextDate: rest.nextDate } : {}) } });
          u.subSk = null; toast(`${r.existing?.name ?? r.tjeneste} er oppdatert`); return reload();
        }
        case 'sk-edit': {
          const r = u.subSk?.r; if (!r) return;
          const ex = r.existingId ? S.subs?.items?.find((y) => y.id === r.existingId) : null;
          openEd(ex ?? null);
          const j = skJson(r), e2 = u.subEd;
          Object.assign(e2, { n: ex ? e2.n : r.tjeneste ?? '', plan: j.plan || e2.plan, v: String(j.price || '').replace('.', ','), cyc: j.cycle, ...(j.billDay ? { day: j.billDay, mon: j.billMonth } : {}), cat: r.kategori ?? e2.cat, logo: e2.logo || r.logoUrl || '' });
          u.subSk = null; render(); el.querySelector('.se [name=n]')?.focus(); return;
        }
        case 'review': u.subSort = { k: 'st', dir: 1 }; render(); el.querySelector('.so-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
      }
    }
  }));
  el.addEventListener('change', wrap(async (e) => {
    const t = e.target;
    if (t.matches('[data-mrc="sub"]')) { u.subMenu = false; return; } // opplastingen gjøres i modules.js
    if (t.matches('[data-ssk]')) { const f = t.files?.[0]; t.value = ''; if (f) await readSk(f); return; }
    if (t.matches('[data-sed-file]') && u.subEd) {
      const f = t.files?.[0]; t.value = '';
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) return toast('Logoen kan være maks 4 MB');
      const e2 = u.subEd;
      if (e2.id) { const fd = new FormData(); fd.append('file', f); const r = await api(`/subscriptions/${e2.id}/logo`, { method: 'POST', body: fd }); e2.logo = r.logoUrl; e2.file = null; await loadSubs(); return render(); }
      e2.file = f; e2.aiPending = false; e2.preview = URL.createObjectURL(f); return render();
    }
    if (u.subEd && t.closest('[data-sform=ed]') && t.name) { u.subEd[t.name] = t.value; if (t.name === 'day' || t.name === 'mon' || t.name === 'cat') return render(); return; }
    if (t.matches('[data-ssub-day]')) return patch(+t.dataset.ssubDay, { chargeDay: +t.value || null });
    if (t.matches('[data-ssub-cat]')) return patch(+t.dataset.ssubCat, { category: t.value });
  }));
  // Feltene i den nye raden beholdes når siden tegnes på nytt.
  el.addEventListener('input', (e) => {
    if (u.subTr && e.target.closest('.str')) {
      const t = e.target, T = u.subTr;
      if (t.name === 'ai') { T.ai = t.value; return; }
      if (t.dataset.strF) { T[t.dataset.strF] = t.value; T.err = ''; const pv = el.querySelector('.str-pv'); if (t.dataset.strF !== 'p' || pv) { clearTimeout(T.t); T.t = setTimeout(() => { const a = document.activeElement, nm = a?.name, pos = a?.selectionStart; render(); if (nm) { const n2 = el.querySelector(`.str [name=${nm}]`); n2?.focus(); try { n2?.setSelectionRange(pos, pos); } catch { /* date */ } } }, 350); } return; }
    }
    const f = e.target.closest('[data-sform=new]'); if (f) u.subF = Object.fromEntries(new FormData(f));
    if (u.subTrAdd && e.target.closest('[data-sform=tr37]') && e.target.name) { u.subTrAdd[e.target.name] = e.target.value; u.subTrAdd.err = ''; }
    if (u.subEd && e.target.closest('[data-sform=ed]') && e.target.name) u.subEd[e.target.name] = e.target.value;
  });
  // Escape lukker arket uansett hvor fokus står (lytteren ligger på document, bare én gang).
  if (!document.body.dataset.subEsc) { document.body.dataset.subEsc = '1'; document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (u.subEd || u.subTr) && u.page === 'sub') { u.subEd = null; u.subTr = null; render(); } }); }
  el.addEventListener('keydown', (e) => {
    if (u.page !== 'sub') return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.so-click[data-ssub-edit]')) { e.preventDefault(); e.target.click(); }
  });
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-sform]');
    if (!f) return;
    e.preventDefault();
    if (f.dataset.sform === 'ed') return saveEd();
    if (f.dataset.sform === 'tr37') {
      // «Legg til · påminn dagen før»: varsel kl. 09:00 dagen før og morgenen samme dag (serveren lager varslene).
      const F = u.subTrAdd, price = parseAmount(F.p);
      if (!F.n.trim() || !F.e) { F.err = 'Fyll inn tjeneste og sluttdato'; return render(); }
      F.busy = true; render();
      try {
        await api('/subscriptions/trials', { method: 'POST', json: { service: F.n.trim(), endsAt: F.e, priceAfter: price > 0 ? price : null, remindOffsetsDays: [1, 0], source: 'skjema' } });
        toast(`Påminnelse lagret · ${F.n.trim()}`); u.subTrAdd = null; return reload();
      } catch (err) { F.busy = false; F.err = err.status === 404 ? 'Serveren har ikke prøveperioder ennå.' : err.message; return render(); }
    }
    if (f.dataset.sform === 'trai') {
      // «Fyll ut»: Glimt tolker teksten (trial-parse.js, samme tolker som serveren) og fyller feltene.
      const T = u.subTr, txt = (T?.ai ?? '').trim();
      if (!T || !txt) return;
      const job = aiStart({ title: 'Leser prøveperioden', toast: 'Glimt fyller ut …', model: 'Glimt · lokal', input: txt, steps: ['Finner tjenesten', 'Finner sluttdatoen', 'Finner prisen'], dur: 700 });
      const r = parseTrial(txt, isoToday());
      setTimeout(() => {
        aiDone(job, { silent: true });
        if (!r.service && !r.endsAt) { T.err = r.question || 'Fant ikke tjeneste eller dato'; return render(); }
        Object.assign(T, { n: r.service || T.n, e: r.endsAt || T.e, p: r.priceAfter != null ? `${r.priceLabel || r.priceAfter}` : T.p, err: r.ok ? '' : r.question || '', fromAi: true });
        if (Array.isArray(r.remindOffsetsDays) && r.remindOffsetsDays.length) T.rem = [...r.remindOffsetsDays];
        render();
      }, 450);
      return;
    }
    const v = Object.fromEntries(new FormData(f));
    const price = parseAmount(v.price);
    if (!v.name.trim() || !(price > 0)) return toast('Skriv tjeneste og beløp');
    const s = await api('/subscriptions', { method: 'POST', json: { name: v.name, plan: v.plan, price, cycle: v.cycle, chargeDay: +v.chargeDay || null } });
    u.subAdd = false; u.subF = null; toast(`${s.name} er lagt til`); return reload();
  }));
}

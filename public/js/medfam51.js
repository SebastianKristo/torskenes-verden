// Prompt 51 (MEDFAM51): web/PWA for fase 4 – Familie og Media.
//   #/familiekalender – felles familiekalender med «hvem kjører?» (henting/bringing, tildeling, «Jeg kjører», Ruter-forslag)
//   #/mediakveld      – «Hva skal vi se i kveld?», «Fortsett der du slapp» (lydbøker/podkaster), norske undertekster, lagring (admin)
// API: /api/famcal51/* og /api/media51/* (SERVER51-API.md, seksjon MEDFAM51). Ingen nøkler eller tjenesteadresser kommer hit.
import { api, esc } from './util.js';
import { toast } from './toast.js';

const CSS = `
.mf51{max-width:1100px;margin:0 auto;padding:8px 0 40px;color:var(--text,#eef0f4);font:400 14px/1.45 Outfit,Geist,system-ui,sans-serif}
.mf51 h1{margin:0;font:600 26px/1.2 Outfit,Geist,system-ui,sans-serif}.mf51 h2{margin:0 0 10px;font:600 17px/1.25 Outfit,Geist,system-ui,sans-serif}
.mf51-sub{color:var(--muted,#8a93a6);margin:4px 0 18px}
.pw + .mf51{padding-top:20px}.pw + .mf51 > h1{display:none}
.mf51-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:18px}
.mf51-card{background:var(--card,rgba(18,25,38,.86));border:1px solid var(--line,#232938);border-radius:24px;padding:18px 20px;min-width:0}
.mf51-row{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line,#232938)}.mf51-row:first-of-type{border-top:0}
.mf51-grow{flex:1;min-width:0}.mf51-t{font-weight:600}.mf51-m{color:var(--muted,#8a93a6);font-size:13px}
.mf51-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.mf51-b{border:1px solid var(--line,#232938);background:transparent;color:inherit;border-radius:999px;padding:6px 13px;font:600 13px Outfit,Geist,system-ui,sans-serif;cursor:pointer}
.mf51-b.pri{background:var(--blue,#a8d4fb);border-color:transparent;color:#0b1220}.mf51-b.danger{color:var(--red,#f59a8f)}
.mf51-b:focus-visible,.mf51 input:focus-visible,.mf51 select:focus-visible{outline:2px solid var(--blue,#a8d4fb);outline-offset:2px}
.mf51 input,.mf51 select,.mf51 textarea{background:var(--field,#0b0e15);color:inherit;border:1px solid var(--line,#232938);border-radius:10px;padding:7px 10px;font:inherit;min-width:0}
.mf51-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mf51-form .full{grid-column:1/-1}.mf51-form label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted,#8a93a6)}
.mf51-chk{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:13px}.mf51-chk label{flex-direction:row;align-items:center;gap:6px;color:inherit}
.mf51-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;background:var(--row,#1d2738)}
.mf51-pill.open{background:rgba(245,154,143,.18);color:var(--red,#f59a8f)}.mf51-pill.ok{background:rgba(143,224,176,.16);color:var(--green,#8fe0b0)}
.mf51-day{margin:14px 0 4px;font:600 12px/1 Outfit,Geist,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#8a93a6)}
.mf51-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 16px}.mf51-tabs button[aria-selected=true]{background:var(--blue,#a8d4fb);color:#0b1220;border-color:transparent}
.mf51-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.mf51-item{display:flex;gap:12px;background:var(--row,#1d2738);border-radius:18px;padding:12px;min-width:0}
.mf51-item img{width:64px;height:96px;object-fit:cover;border-radius:10px;flex:none;background:var(--field,#0b0e15)}
.mf51-ph{width:64px;height:96px;border-radius:10px;flex:none;background:var(--field,#0b0e15);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--muted,#8a93a6)}
.mf51-bar{height:6px;border-radius:3px;background:var(--field,#0b0e15);overflow:hidden;margin-top:6px}.mf51-bar i{display:block;height:100%;background:var(--blue,#a8d4fb)}
.mf51-bar.warn i{background:var(--red,#f59a8f)}
.mf51-ruter{margin-top:6px;padding:8px 10px;border-radius:12px;background:var(--field,#0b0e15);font-size:13px}
.mf51-empty{color:var(--muted,#8a93a6);padding:10px 0}
.mf51-jump{display:inline-block;margin:0 0 12px;padding:7px 14px;border-radius:999px;background:var(--row,#1d2738);color:var(--text,#eef0f4);border:1px solid var(--line,#232938);font:600 13px Outfit,Geist,system-ui,sans-serif;text-decoration:none;position:relative;z-index:5}
@media (max-width:820px){.mf51-grid{grid-template-columns:minmax(0,1fr)}.mf51-form{grid-template-columns:minmax(0,1fr)}.mf51 h1{font-size:22px}.mf51-card{padding:16px}}
`;
const css = () => { if (!document.getElementById('mf51-css')) { const s = document.createElement('style'); s.id = 'mf51-css'; s.textContent = CSS; document.head.appendChild(s); } };
const J = (path, method = 'GET', json) => api(path, { method, ...(json !== undefined ? { json } : {}) });
const say = (e) => toast(e?.message ?? String(e));
const ini = (n) => (String(n ?? '').match(/\p{L}/gu) ?? ['•']).slice(0, 2).join('').toUpperCase();
const today = () => new Date().toLocaleDateString('sv-SE');

/* =====================================================================================================================
   Familiekalender
   ===================================================================================================================== */

export function renderFam51() { css(); return '<section class="mf51" id="mf51-fam" aria-busy="true"><h1>Familiekalender</h1><p class="mf51-sub">Laster …</p></section>'; }

let famState = { members: [] };
function taskRow(t, members) {
  const opts = ['<option value="">Ingen</option>', ...members.map((m) => `<option value="${esc(m.userId)}"${t.assignee?.userId === m.userId ? ' selected' : ''}>${esc(m.self ? `${m.name} (deg)` : m.name)}</option>`)].join('');
  return `<div class="mf51-row" data-task="${t.id}"><div class="mf51-grow">
    <div class="mf51-t">${esc(t.kindLabel)} ${esc(t.atText)}${t.for ? ` · ${esc(t.for.self ? 'deg' : t.for.name)}` : ''}</div>
    <div class="mf51-m"><span class="mf51-pill ${t.status === 'open' ? 'open' : 'ok'}">${esc(t.statusText)}</span>${t.note ? ` · ${esc(t.note)}` : ''}</div>
    <div class="mf51-acts">
      ${t.status !== 'done' && !t.mine ? '<button class="mf51-b pri" data-a="claim">Jeg kjører</button>' : ''}
      ${t.mine && t.status !== 'done' ? '<button class="mf51-b" data-a="release">Si fra meg</button>' : ''}
      <label class="mf51-m">Sjåfør <select data-a="assign" aria-label="Velg sjåfør">${opts}</select></label>
      <button class="mf51-b" data-a="ruter">Ruter-forslag</button>
      ${t.status !== 'done' ? '<button class="mf51-b" data-a="done">Gjort</button>' : ''}
      <button class="mf51-b danger" data-a="deltask" aria-label="Slett oppgaven">Slett</button>
    </div><div class="mf51-ruter" hidden></div></div></div>`;
}
function eventCard(e, members) {
  return `<div class="mf51-row" data-event="${e.id}"><div class="mf51-grow">
    <div class="mf51-t">${esc(e.title)}</div>
    <div class="mf51-m">${esc(e.allDay ? 'Hele dagen' : e.time)}${e.place?.name ? ` · ${esc(e.place.name)}` : ''}${e.createdBy ? ` · lagt inn av ${esc(e.createdBy.self ? 'deg' : e.createdBy.name)}` : ''}</div>
    ${e.note ? `<div class="mf51-m">${esc(e.note)}</div>` : ''}
    ${e.tasks.map((t) => taskRow(t, members)).join('')}
    <div class="mf51-acts"><button class="mf51-b" data-a="addtask" data-kind="bringing">+ Bringing</button><button class="mf51-b" data-a="addtask" data-kind="henting">+ Henting</button>
      ${e.canEdit ? '<button class="mf51-b danger" data-a="delevent">Slett hendelsen</button>' : ''}</div></div></div>`;
}
async function loadFam(root) {
  const from = today(), to = new Date(Date.now() + 28 * 864e5).toLocaleDateString('sv-SE');
  const [ev, dr] = await Promise.all([J(`/famcal51/events?from=${from}&to=${to}`), J('/famcal51/drives')]);
  famState = ev;
  const byDay = new Map();
  for (const e of ev.events) { const k = e.date; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
  const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
  const memberOpts = ev.members.map((m) => `<option value="${esc(m.userId)}">${esc(m.self ? `${m.name} (deg)` : m.name)}</option>`).join('');
  root.innerHTML = `<h1>Familiekalender</h1>
    <p class="mf51-sub">${esc(dr.text)}${ev.home ? '' : ' · Legg inn et sted med type hjem i Familie › Steder for Ruter-forslag'}</p>
    <div class="mf51-grid">
      <div class="mf51-card"><h2>Kommende</h2>${ev.events.length ? [...byDay].map(([d, list]) => `<div class="mf51-day">${esc(dayLabel(d))}</div>${list.map((e) => eventCard(e, ev.members)).join('')}`).join('') : '<p class="mf51-empty">Ingen hendelser de neste fire ukene.</p>'}</div>
      <div>
        <div class="mf51-card"><h2>Hvem kjører?</h2>${dr.tasks.length ? dr.tasks.map((t) => `<div class="mf51-row"><span class="mf51-ph" style="width:34px;height:34px;border-radius:50%">${esc(t.assignee ? ini(t.assignee.name) : '?')}</span><div class="mf51-grow"><div class="mf51-t">${esc(t.title)}</div><div class="mf51-m">${esc(t.atText)} · <span class="mf51-pill ${t.status === 'open' ? 'open' : 'ok'}">${esc(t.statusText)}</span></div></div></div>`).join('') : '<p class="mf51-empty">Ingen kjøring de neste to ukene.</p>'}</div>
        <div class="mf51-card" style="margin-top:18px"><h2>Ny hendelse</h2>
          <form class="mf51-form" id="mf51-new">
            <label class="full">Tittel<input name="title" required maxlength="120" placeholder="Fotballtrening"></label>
            <label>Dato<input name="date" type="date" required value="${today()}"></label>
            <label>Sted<input name="place" maxlength="120" placeholder="Hallen"></label>
            <label>Start<input name="start" type="time" value="17:00"></label><label>Slutt<input name="end" type="time" value="18:00"></label>
            <label class="full">Koordinater (valgfritt, for Ruter)<input name="coords" placeholder="59.95, 10.70" inputmode="decimal"></label>
            <label>Gjelder<select name="for"><option value="">Ingen bestemt</option>${memberOpts}</select></label>
            <div class="mf51-chk"><label><input type="checkbox" name="bringing"> Trenger bringing</label><label><input type="checkbox" name="henting"> Trenger henting</label></div>
            <div class="full mf51-acts"><button class="mf51-b pri" type="submit">Legg til</button></div>
          </form></div>
        <div class="mf51-card" style="margin-top:18px"><label class="mf51-chk"><input type="checkbox" id="mf51-incal"> Vis familiekalenderen i Kalender</label></div>
      </div></div>`;
  root.removeAttribute('aria-busy');
  J('/famcal51/settings').then((s) => { const c = root.querySelector('#mf51-incal'); if (c) c.checked = s.inCalendar; }).catch(() => {});
}
function bindFam(root) {
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'mf51-new') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const m = String(f.get('coords') ?? '').match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    const place = f.get('place') || m ? { name: f.get('place') || null, ...(m ? { lat: +m[1].replace(',', '.'), lon: +m[2].replace(',', '.') } : {}) } : null;
    const forU = f.get('for') || null;
    const tasks = ['bringing', 'henting'].filter((k) => f.get(k)).map((kind) => ({ kind, ...(forU ? { for: forU } : {}) }));
    try {
      await J('/famcal51/events', 'POST', { title: f.get('title'), start: `${f.get('date')}T${f.get('start') || '00:00'}`, end: `${f.get('date')}T${f.get('end') || f.get('start') || '23:59'}`, place, tasks });
      toast('Hendelsen er lagt til');
      await loadFam(root);
    } catch (err) { say(err); }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.id === 'mf51-incal') { await J('/famcal51/settings', 'PUT', { inCalendar: e.target.checked }).catch(say); return; }
    const sel = e.target.closest('select[data-a="assign"]');
    if (!sel) return;
    const id = sel.closest('[data-task]').dataset.task;
    try { const r = await J(`/famcal51/tasks/${id}`, 'PATCH', { assignee: sel.value || null }); toast(r.task.statusText); await loadFam(root); } catch (err) { say(err); }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const tid = b.closest('[data-task]')?.dataset.task, eid = b.closest('[data-event]')?.dataset.event;
    try {
      if (b.dataset.a === 'claim') { await J(`/famcal51/tasks/${tid}/claim`, 'POST'); toast('Du kjører'); }
      else if (b.dataset.a === 'release') { await J(`/famcal51/tasks/${tid}/release`, 'POST'); toast('Oppgaven trenger en ny sjåfør'); }
      else if (b.dataset.a === 'done') { await J(`/famcal51/tasks/${tid}/done`, 'POST'); toast('Markert som gjort'); }
      else if (b.dataset.a === 'deltask') { if (!confirm('Slette kjøreoppgaven?')) return; await J(`/famcal51/tasks/${tid}`, 'DELETE'); toast('Oppgaven er slettet'); }
      else if (b.dataset.a === 'delevent') { if (!confirm('Slette hendelsen og kjøreoppgavene?')) return; await J(`/famcal51/events/${eid}`, 'DELETE'); toast('Hendelsen er slettet'); }
      else if (b.dataset.a === 'addtask') { await J(`/famcal51/events/${eid}/tasks`, 'POST', { kind: b.dataset.kind }); toast(b.dataset.kind === 'henting' ? 'Henting lagt til' : 'Bringing lagt til'); }
      else if (b.dataset.a === 'ruter') {
        const box = b.closest('[data-task]').querySelector('.mf51-ruter');
        box.hidden = false; box.textContent = 'Henter reiseforslag …';
        const r = await J(`/famcal51/tasks/${tid}/ruter`);
        box.innerHTML = r.options?.length ? `<b>${esc(r.text)}</b>${r.options.map((o) => `<div class="mf51-m">${esc(o.depLabel)} ${esc(o.arrLabel)} · ${esc(o.strip)}</div>`).join('')}<div class="mf51-m">Kilde: ${esc(r.source)}</div>` : esc(r.text);
        return;
      } else return;
      await loadFam(root);
    } catch (err) { say(err); }
  });
}

/* =====================================================================================================================
   Media: I kveld, Fortsett, Undertekster, Lagring
   ===================================================================================================================== */

export function renderMedia51() { css(); return '<section class="mf51" id="mf51-media" aria-busy="true"><h1>I kveld</h1><p class="mf51-sub">Laster …</p></section>'; }
const TAB_KEY = 'mf51-tab';
let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'kveld'; } catch { return 'kveld'; } })();
let tonightQ = { minutes: '', genre: '', kind: 'any', who: [] }, status = null, homeIds = null;

const poster = (x) => (x.poster ? `<img src="${esc(x.poster)}" alt="" loading="lazy" decoding="async">` : `<span class="mf51-ph">${esc(ini(x.title))}</span>`);
async function tabKveld(el, phrase = false) {
  const qs = new URLSearchParams({ ...(tonightQ.minutes ? { minutes: tonightQ.minutes } : {}), ...(tonightQ.genre ? { genre: tonightQ.genre } : {}), kind: tonightQ.kind, ...(tonightQ.who.length ? { who: tonightQ.who.join(',') } : {}), ...(phrase ? { phrase: '1' } : {}) });
  const [r, fam] = await Promise.all([J(`/media51/tonight?${qs}`), homeIds ? Promise.resolve(homeIds) : J('/famcal51/events?from=' + today() + '&to=' + today()).then((x) => x.members).catch(() => [])]);
  homeIds = fam;
  const chosen = new Set(r.who.people.map((p) => p.userId));
  el.innerHTML = `<div class="mf51-card"><div class="mf51-form">
      <div class="full mf51-chk" role="group" aria-label="Hvem ser på">${fam.map((m) => `<label><input type="checkbox" data-who="${esc(m.userId)}"${chosen.has(m.userId) ? ' checked' : ''}> ${esc(m.self ? 'Meg' : m.name)}</label>`).join('')}</div>
      <label>Lengde<select data-f="minutes"><option value="">Uansett</option>${[[60, 'Under 1 time'], [90, 'Under 1,5 time'], [120, 'Under 2 timer'], [150, 'Under 2,5 timer']].map(([v, l]) => `<option value="${v}"${+tonightQ.minutes === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Sjanger<select data-f="genre"><option value="">Alle</option>${r.genres.map((g) => `<option${tonightQ.genre === g.id ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
      <label>Type<select data-f="kind">${[['any', 'Film og serie'], ['movie', 'Film'], ['series', 'Serie']].map(([v, l]) => `<option value="${v}"${tonightQ.kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="mf51-acts" style="align-items:end"><button class="mf51-b" data-a="phrase" title="Bare formulering – forslagene er de samme">Formuler med lokal modell</button></div>
    </div><p class="mf51-m">${esc(r.who.note ?? '')}${r.phrased ? ` · formulert av ${esc(r.model ?? 'lokal modell')}` : ''}</p></div>
    <div class="mf51-cards" style="margin-top:14px">${r.items.length ? r.items.map((x) => `<div class="mf51-item" data-kind="${x.kind}" data-id="${x.id}">${poster(x)}<div class="mf51-grow">
      <div class="mf51-t">${esc(x.title)}${x.year ? ` <span class="mf51-m">(${x.year})</span>` : ''}</div>
      <div class="mf51-m">${esc(x.kind === 'movie' ? 'Film' : 'Serie')}${x.runtimeText ? ` · ${esc(x.runtimeText)}` : ''}${x.next ? ` · neste ${esc(x.next.code)}` : ''}</div>
      <div style="margin-top:6px">${esc(x.text)}</div>
      <div class="mf51-acts"><a class="mf51-b" href="${esc(x.open)}">Åpne</a>${x.kind === 'movie' ? '<button class="mf51-b" data-a="subs">Undertekster</button>' : ''}</div><div class="mf51-ruter" hidden></div></div></div>`).join('') : `<p class="mf51-empty">${esc(r.empty ?? 'Ingen forslag')}</p>`}</div>`;
}
async function tabFortsett(el) {
  const r = await J('/media51/audio/continue');
  el.innerHTML = `<div class="mf51-card"><h2>Fortsett der du slapp</h2>${r.items.length ? r.items.map((x) => `<div class="mf51-row">${x.coverUrl ? `<img src="${esc(x.coverUrl)}" alt="" style="width:56px;height:56px;border-radius:10px;object-fit:cover">` : `<span class="mf51-ph" style="width:56px;height:56px">${esc(ini(x.title))}</span>`}
      <div class="mf51-grow"><div class="mf51-t">${esc(x.title)}${x.episodeTitle ? ` · ${esc(x.episodeTitle)}` : ''}</div><div class="mf51-m">${esc(x.kind === 'podcast' ? 'Podkast' : 'Lydbok')}${x.author ? ` · ${esc(x.author)}` : ''} · ${esc(x.progressText)}${x.remainingText ? ` · ${esc(x.remainingText)}` : ''}</div>
      <div class="mf51-bar"><i style="width:${Math.max(2, x.progress)}%"></i></div>${x.openUrl ? `<div class="mf51-acts"><a class="mf51-b" href="${esc(x.openUrl)}" target="_blank" rel="noopener">Fortsett i Audiobookshelf</a></div>` : ''}</div></div>`).join('') : `<p class="mf51-empty">${esc(r.text ?? r.error ?? 'Ingenting påbegynt')}</p>`}
    ${r.configured ? `<form class="mf51-acts" id="mf51-abs"><label class="mf51-m">Min bruker i Audiobookshelf <input name="u" value="${esc(r.absUser ?? '')}" maxlength="64"></label><button class="mf51-b">Lagre</button></form>` : ''}</div>`;
}
async function tabSubs(el) {
  const [st, w] = await Promise.all([J('/media51/subs/status'), J('/media51/subs/wanted').catch(() => ({ items: [] }))]);
  el.innerHTML = `<div class="mf51-card"><h2>Norske undertekster</h2><p class="mf51-m">${esc(st.text)}</p>
    ${w.items.length ? `<div class="mf51-day">Mangler norsk</div>${w.items.map((x) => `<div class="mf51-row" data-kind="${x.kind}" data-id="${x.id}"><div class="mf51-grow"><div class="mf51-t">${esc(x.title ?? '')}</div><div class="mf51-m">${esc(x.statusText)}</div><div class="mf51-acts"><button class="mf51-b" data-a="subsearch">Hent undertekster</button></div></div></div>`).join('')}` : `<p class="mf51-empty">${st.configured ? 'Alt har norske undertekster.' : ''}</p>`}
    <p class="mf51-m">${esc(st.whisper?.text ?? '')}</p></div>`;
}
async function tabLagring(el) {
  const r = await J('/media51/storage');
  const svc = Object.entries(r.services).filter(([, v]) => v).map(([k, v]) => `<div class="mf51-row"><div class="mf51-grow"><div class="mf51-t">${esc({ sonarr: 'Serier (Sonarr)', radarr: 'Filmer (Radarr)', qbit: 'Nedlastinger (qBittorrent)' }[k])}</div><div class="mf51-m">${esc(v.sizeText)} · ${v.count} ${k === 'qbit' ? 'torrenter' : 'elementer'}${v.freeText ? ` · ${esc(v.freeText)} ledig` : ''}</div></div></div>`).join('');
  el.innerHTML = `<div class="mf51-grid"><div class="mf51-card"><h2>Sett og stort</h2><p class="mf51-m">${esc(r.recommendText)} · terskel ${esc(r.bigThresholdText)}</p>
      ${r.recommendations.map((x) => `<div class="mf51-row" data-kind="${x.kind}" data-id="${x.id}" data-title="${esc(x.title)}"><div class="mf51-grow"><div class="mf51-t">${esc(x.title)}</div><div class="mf51-m">${esc(x.reason)}</div><div class="mf51-acts"><button class="mf51-b danger" data-a="delete">Slett …</button></div></div></div>`).join('')}
      ${r.deletions.length ? `<div class="mf51-day">Venter på sletting</div>${r.deletions.map((d) => `<div class="mf51-row" data-del="${d.id}"><div class="mf51-grow"><div class="mf51-t">${esc(d.title)}</div><div class="mf51-m">${esc(d.sizeText)} · ${esc(d.statusText)}</div>${d.canUndo ? '<div class="mf51-acts"><button class="mf51-b pri" data-a="undo">Angre</button></div>' : ''}</div></div>`).join('')}` : ''}
    </div><div><div class="mf51-card"><h2>Disker</h2>${r.disks.map((d) => `<div class="mf51-row"><div class="mf51-grow"><div class="mf51-t">${esc(d.label)}</div><div class="mf51-m">${esc(d.freeText)} ledig av ${esc(d.totalText)}</div><div class="mf51-bar${d.warn ? ' warn' : ''}"><i style="width:${d.usedPct}%"></i></div></div></div>`).join('') || '<p class="mf51-empty">Ingen diskinfo (koble til Sonarr/Radarr)</p>'}${svc}</div>
      <div class="mf51-card" style="margin-top:18px"><h2>Papirkurv</h2><p class="mf51-m">${esc(r.trash.text)}</p>${r.trash.configured ? '<button class="mf51-b danger" data-a="empty">Tøm papirkurven …</button>' : ''}</div>
      ${r.errors?.length ? `<div class="mf51-card" style="margin-top:18px"><p class="mf51-m">${r.errors.map(esc).join('<br>')}</p></div>` : ''}</div></div>`;
}
const TABS = { kveld: ['I kveld', tabKveld], fortsett: ['Fortsett', tabFortsett], subs: ['Undertekster', tabSubs], lagring: ['Lagring', tabLagring] };
async function loadMedia(root) {
  if (!status) status = await J('/media51/status').catch((e) => ({ error: e.message }));
  if (status.error) { root.innerHTML = `<h1>I kveld</h1><p class="mf51-sub">${esc(status.error)}</p>`; root.removeAttribute('aria-busy'); return; }
  const tabs = Object.entries(TABS).filter(([k]) => k !== 'lagring' || status.admin);
  if (!tabs.some(([k]) => k === tab)) tab = 'kveld';
  root.innerHTML = `<h1>${esc(TABS[tab][0] === 'I kveld' ? 'Hva skal vi se i kveld?' : TABS[tab][0])}</h1><p class="mf51-sub">Fra eget bibliotek og egen historikk – ingenting sendes ut av huset.</p>
    <div class="mf51-tabs" role="tablist">${tabs.map(([k, [l]]) => `<button class="mf51-b" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div><div id="mf51-tab"></div>`;
  root.removeAttribute('aria-busy');
  const el = root.querySelector('#mf51-tab');
  el.innerHTML = '<p class="mf51-empty">Laster …</p>';
  try { await TABS[tab][1](el); } catch (e) { el.innerHTML = `<p class="mf51-empty">${esc(e.message)}</p>`; }
}
function bindMedia(root) {
  root.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (f) { tonightQ[f] = e.target.value; loadMedia(root); return; }
    if (e.target.dataset.who !== undefined) { tonightQ.who = [...root.querySelectorAll('[data-who]:checked')].map((x) => x.dataset.who); loadMedia(root); }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'mf51-abs') return;
    e.preventDefault();
    try { await J('/media51/audio/me', 'PUT', { absUser: new FormData(e.target).get('u') }); toast('Lagret'); loadMedia(root); } catch (err) { say(err); }
  });
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; try { localStorage.setItem(TAB_KEY, tab); } catch { /* */ } loadMedia(root); return; }
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const row = b.closest('[data-id]');
    try {
      if (b.dataset.a === 'phrase') { b.disabled = true; b.textContent = 'Formulerer …'; await tabKveld(root.querySelector('#mf51-tab'), true); }
      else if (b.dataset.a === 'subs') {
        const box = row.querySelector('.mf51-ruter'); box.hidden = false; box.textContent = 'Sjekker …';
        const r = await J(`/media51/subs/${row.dataset.kind}/${row.dataset.id}`);
        box.innerHTML = `${esc(r.statusText)}${r.hasNorwegian ? '' : ' <button class="mf51-b" data-a="subsearch">Hent undertekster</button>'}`;
      } else if (b.dataset.a === 'subsearch') { const r = await J(`/media51/subs/${row.dataset.kind}/${row.dataset.id}/search`, 'POST'); toast(r.message); }
      else if (b.dataset.a === 'delete') {
        if (!confirm(`Slette «${row.dataset.title}»? Den slutter å overvåkes nå og kan angres i 24 timer.`)) return;
        const r = await J('/media51/storage/delete', 'POST', { kind: row.dataset.kind, id: +row.dataset.id, confirm: true });
        toast(r.message, { action: 'Angre', onAction: async () => { await J(`/media51/storage/deletions/${r.deletion.id}/undo`, 'POST').then((u) => toast(u.message)).catch(say); loadMedia(root); }, ms: 8000 });
        loadMedia(root);
      } else if (b.dataset.a === 'undo') { const r = await J(`/media51/storage/deletions/${b.closest('[data-del]').dataset.del}/undo`, 'POST'); toast(r.message); loadMedia(root); }
      else if (b.dataset.a === 'empty') {
        const v = prompt('Dette sletter filene i papirkurven for godt (bare de som er eldre enn 24 timer). Skriv SLETT for å fortsette.');
        if (v !== 'SLETT') return;
        const r = await J('/media51/storage/trash/empty', 'POST', { confirm: 'SLETT' }); toast(`${r.removed} slettet for godt`); loadMedia(root);
      }
    } catch (err) { say(err); }
  });
}

/** Snarvei fra Familie og Media til de nye sidene (de eldre sidene er urørt). */
function jump(view, href, label) {
  if (view.querySelector('.mf51-jump')) return;
  css();
  const a = document.createElement('a');
  a.className = 'mf51-jump'; a.href = href; a.textContent = label;
  view.prepend(a);
}
/** Kalles etter at siden er tegnet (app.js). */
export function afterMedfam51(route, view) {
  if (route === 'familie') jump(view, '#/familiekalender', 'Familiekalender · hvem kjører? ›');
  if (route === 'media') jump(view, '#/mediakveld', 'Hva skal vi se i kveld? ›');
  const fam = view.querySelector('#mf51-fam'), med = view.querySelector('#mf51-media');
  if (fam) { bindFam(fam); loadFam(fam).catch((e) => { fam.innerHTML = `<h1>Familiekalender</h1><p class="mf51-sub">${esc(e.message)}</p>`; }); }
  if (med) { status = null; bindMedia(med); loadMedia(med); }
}

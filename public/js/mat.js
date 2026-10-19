// Mat (tidligere Matplan): én felles komponent for Homelab-fanen og andre flater (embedded skjuler den store tittelen).
// Design 2a: mørk varm grunn, limegrønt kort for i dag, Instrument Serif på retter og titler, Geist Mono på etiketter.
// Selvstendig modul (egen fetch og egen CSS) slik at den kan importeres fra både /assets/js og /finans.
//   import { mountMatplan } from '/assets/js/mat.js'; mountMatplan(el, { embedded: true });
import { clearBtn } from '/assets/js/searchfield.js';
import { glimt } from './glimt.js';
import { is2c } from './hltheme.js';
import { onLive } from './realtime.js'; // prompt 36: matplanen er felles, endringer kommer som meal:changed

const DAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const AB = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const FILTERS = ['Alle', 'På planen', 'Ikke brukt', 'HelloFresh'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => d.toLocaleDateString('sv-SE');
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));
const gen = (n) => (/s$/i.test(n) ? `${n}'` : `${n}s`);
const lines = (t) => String(t ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
const chev = (rot = false) => `<svg class="mp-chev${rot ? ' rot' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

function loadCss() {
  if (document.querySelector('link[data-mat-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/assets/css/mat.css'; l.dataset.matCss = '';
  document.head.appendChild(l);
  if (!document.querySelector('link[data-mat-fonts]')) {
    const f = document.createElement('link');
    f.rel = 'stylesheet'; f.dataset.matFonts = '';
    f.href = 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap'; // prompt 34: Papir-fontene
    document.head.appendChild(f);
  }
}

const KIND = { sheet: ['XLS', '#1D6F42', 'Regneark'], pdf: ['PDF', '#C8352B', 'PDF'], video: ['▶', '#E62117', 'Video'], doc: ['DOC', '#2B579A', 'Dokument'], image: ['IMG', '#6B4FA0', 'Bilde'], link: ['↗', '#3A3A3E', 'Lenke'] };
const host = (u) => { try { return new URL(u, location.href).hostname.replace(/^www\./, ''); } catch { return ''; } };
const JOB = { queued: ['I kø', 'var(--mp-dim)', '15%'], reading: [`${glimt(14, 'tenker')} Leser …`, 'var(--mp-acc)', '60%'], done: ['Ferdig', 'var(--mp-ok)', '100%'], error: ['Feilet', 'var(--mp-err)', '100%'] };

export function mountMatplan(el, { embedded = false, api = '/api/matplan' } = {}) {
  loadCss();
  const S = {
    w: null, err: '', off: 0, open: null, q: '', flt: 'Alle', ed: null, efErr: '', hfOpen: false, hfMsg: '',
    cal: false, copied: false, status: '', busy: false, newCook: '', shopAll: false,
    fold: 'Alle', foldNew: false, foldEdit: false, link: '', imp: null, jobs: [], seenJobs: null,
  };
  let jobTimer = null;
  let stTimer = null;

  async function call(path, opts = {}) {
    const init = { credentials: 'same-origin', ...opts, headers: { ...(opts.headers ?? {}) } };
    if (opts.form) { init.body = opts.form; delete init.form; }
    if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; delete init.json; }
    const res = await fetch(api + path, init);
    if (res.status === 401 && !embedded) { location.href = '/login'; throw new Error('Ikke innlogget'); }
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.blob();
    if (!res.ok) throw new Error(data?.error || (res.status === 403 ? 'Ingen tilgang' : `Feil ${res.status}`));
    return data;
  }

  const startOf = () => addDays(mondayOf(iso(new Date())), S.off * 7);
  const flash = (t) => { S.status = t; clearTimeout(stTimer); stTimer = setTimeout(() => { S.status = ''; paintStatus(); }, 5000); };
  async function run(fn, { msg } = {}) {
    try {
      const w = await fn();
      if (w?.days) S.w = w;
      if (msg || w?.status) flash(msg ?? w.status);
      S.err = '';
    } catch (e) { flash(e.message); }
    paint();
  }
  const load = () => run(() => call(`/week?start=${startOf()}`));

  /* ---------- Skanning: kø som spørres til alt er lest ---------- */

  async function pollJobs() {
    clearTimeout(jobTimer);
    let list;
    try { list = await call('/recipes/jobs'); } catch { return; }
    const before = new Map((S.jobs ?? []).map((j) => [j.id, j.status]));
    S.jobs = list;
    const fresh = list.filter((j) => before.has(j.id) && before.get(j.id) !== j.status && (j.status === 'done' || j.status === 'error'));
    if (fresh.some((j) => j.status === 'done')) {
      const j = fresh.find((x) => x.status === 'done');
      await run(() => call(`/week?start=${startOf()}`));
      const d = dishById(j.dishId);
      if (d) { S.open = d.id; S.fold = 'Alle'; flash(`✦ ${d.name} lagt i mappen ${d.folder ?? 'uten mappe'}`); }
    } else if (fresh.length) flash(fresh[0].error || 'Skanningen feilet.');
    paintScan();
    if (list.some((j) => j.status === 'queued' || j.status === 'reading') && el.isConnected) jobTimer = setTimeout(pollJobs, 2000);
  }
  async function upload(files) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('file', f, f.name);
    try { const r = await call('/recipes/scan', { method: 'POST', form: fd }); S.jobs = r.jobs ?? S.jobs; flash(files.length > 1 ? `${files.length} oppskrifter lagt i køen` : 'Oppskriften er lagt i køen'); }
    catch (e) { flash(e.message); }
    paint(); pollJobs();
  }

  /* ---------- Visning ---------- */

  const dishById = (id) => S.w?.dishes.find((d) => d.id === id);

  // Prompt 36: matplanen er alltid felles for hele husstanden (ingen deleknapp eller privat-valg).
  function sharedNote(w) {
    if (w.sharedNote) return w.sharedNote;
    const t = w.updatedAt ? new Date(w.updatedAt) : null, by = w.updatedBy?.name ?? w.updatedBy;
    return `Felles for husstanden${by ? ` · Endret av ${by}${t && !Number.isNaN(+t) ? ` ${String(t.getHours()).padStart(2, '0')}.${String(t.getMinutes()).padStart(2, '0')}` : ''}` : ''}`;
  }
  function header(w) {
    const m = parse(w.start), e = parse(w.end);
    const range = m.getMonth() === e.getMonth() ? `${m.getDate()}.–${e.getDate()}. ${MON[m.getMonth()]}` : `${m.getDate()}. ${MON[m.getMonth()]}–${e.getDate()}. ${MON[e.getMonth()]}`;
    const feed = `webcal://${location.host}${w.calendarUrl}`;
    return `<div class="mp-head">
      <div class="mp-titles"><div class="mp-kicker">${esc(`Uke ${w.week} · ${range}`.toUpperCase())}</div>${embedded ? '' : '<h1 class="mp-h1">Mat</h1>'}<div class="mp-shared">${esc(sharedNote(w))}</div></div>
      <div class="mp-actions">
        <button class="mp-btn mp-toggle" data-a="auto" role="switch" aria-checked="${w.auto}"><span class="mp-sw${w.auto ? ' on' : ''}"><i></i></span>Ny plan hver søndag</button>
        <div class="mp-calwrap" data-mp-cal>
          <button class="mp-btn" data-a="cal" aria-expanded="${S.cal}">Abonner i kalender</button>
          ${S.cal ? `<div class="mp-pop" role="dialog" aria-label="Kalenderfeed">
            <b>Kalenderfeed</b>
            <div class="mp-mute">Legg til adressen i Google Kalender (Andre kalendere → Fra nettadresse) eller Apple Kalender. Feeden oppdateres når planen endres.</div>
            <div class="mp-row"><input class="mp-in mp-mono" readonly value="${esc(feed)}" data-feed><button class="mp-btn mp-light" data-a="copy">${S.copied ? 'Kopiert' : 'Kopier'}</button></div>
            <button class="mp-btn mp-ghostline" data-a="ics">Last ned .ics for uka</button>
            <div class="mp-faint">Google Kalender henter feeden fra internett, så serveren må kunne nås utenfra (for eksempel via Cloudflare Tunnel).</div>
          </div>` : ''}
        </div>
        <button class="mp-btn mp-acc" data-a="ai" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Lager plan …' : '✦ Ny ukeplan med AI'}</button>
      </div></div>`;
  }

  function dayCard(d, w) {
    const date = parse(d.date);
    const cooks = w.cooks.includes(d.cook) || !d.cook ? w.cooks : [d.cook, ...w.cooks];
    const tag = d.tag === 'best' && d.bestCook ? `★ ${gen(d.bestCook)} beste` : d.tag === 'hellofresh' ? 'HelloFresh' : '';
    return `<div class="mp-day${d.today ? ' today' : ''}" data-day="${d.date}">
      <div class="mp-dtop"><div><div class="mp-dname">${DAYS[d.index].toUpperCase()}</div><div class="mp-ddate">${d.today ? 'I dag · ' : ''}${date.getDate()}. ${MON[date.getMonth()]}</div></div>
        <button class="mp-regen" data-a="regen" data-date="${d.date}" title="Foreslå en annen rett" aria-label="Foreslå en annen rett for ${DAYS[d.index].toLowerCase()}">✦</button></div>
      ${d.name ? `<button class="mp-dish" draggable="true" data-drag="day:${d.date}" data-a="openday" data-id="${esc(d.dishId)}" title="Dra for å flytte, klikk for oppskrift">${esc(d.name)}</button>`
        : '<div class="mp-empty">Ingen rett ennå. Dra en rett hit eller trykk ✦.</div>'}
      ${tag ? `<div class="mp-tag">${esc(tag)}</div>` : ''}
      <div class="mp-grow"></div>
      <div class="mp-dfoot">
        <label class="mp-selwrap mp-cook"${d.cook ? ` title="${esc(d.cook)}"` : ''}><span class="mp-sr">Kokk ${DAYS[d.index].toLowerCase()}</span>${d.cook ? `<span class="mp-cook-av" aria-hidden="true">${esc(d.cook.trim().charAt(0).toUpperCase())}</span>` : ''}
          <select data-cook="${d.date}" ${cooks.length ? '' : 'disabled'}${d.cook ? ` title="${esc(d.cook)}"` : ''}>${cooks.length ? (d.cook ? '' : '<option value="">Velg kokk</option>') + cooks.map((n) => `<option${n === d.cook ? ' selected' : ''}>${esc(n)}</option>`).join('') : '<option>Ingen kokker</option>'}</select>${chev()}</label>
        <button class="mp-fast${d.fixed ? ' on' : ''}" data-a="fast" data-date="${d.date}" aria-pressed="${d.fixed}" title="Samme rett denne dagen hver uke">Fast</button>
      </div></div>`;
  }

  function dishForm(d) {
    const v = d ?? { name: '', ing: [], steps: [], src: 'own' };
    return `<form class="mp-form" data-f="dish" data-id="${d ? esc(d.id) : ''}">
      ${d ? '' : '<b>Ny rett</b>'}
      <input class="mp-in" name="name" value="${esc(v.name)}" placeholder="${d ? 'Navn' : 'Navn, f.eks. Fiskegrateng'}" maxlength="80" required>
      <textarea class="mp-in" name="ing" rows="${d ? 5 : 4}" placeholder="Ingredienser, én per linje">${esc(v.ing.join('\n'))}</textarea>
      <textarea class="mp-in" name="steps" rows="${d ? 4 : 3}" placeholder="Slik gjør du, ett steg per linje">${esc(v.steps.join('\n'))}</textarea>
      <label class="mp-check"><input type="checkbox" name="hf" ${v.src === 'hellofresh' ? 'checked' : ''}>Fra HelloFresh</label>
      ${S.efErr ? `<div class="mp-err">${esc(S.efErr)}</div>` : ''}
      <div class="mp-row"><button class="mp-btn mp-light" type="submit">Lagre</button><button class="mp-btn mp-plain" type="button" data-a="efcancel">Avbryt</button></div>
    </form>`;
  }

  function dishList(w) {
    const q = S.q.trim().toLowerCase();
    const list = w.dishes.filter((d) => (!q || d.name.toLowerCase().includes(q) || d.ing.some((i) => i.toLowerCase().includes(q)))
      && (S.fold === 'Alle' || (S.fold === '__none' ? !d.folderId : d.folderId === S.fold))
      && (S.flt === 'Alle' || (S.flt === 'På planen' && d.days.length) || (S.flt === 'Ikke brukt' && !d.days.length) || (S.flt === 'HelloFresh' && d.src === 'hellofresh')));
    if (!list.length) return `<div class="mp-none">${w.dishes.length ? (S.fold !== 'Alle' && !q && S.flt === 'Alle' ? 'Ingen retter i denne mappen ennå.' : 'Ingen retter passer søket.') : 'Ingen retter ennå. Legg til en med «+ Ny rett», skann en oppskrift eller lim inn en lenke.'}</div>`;
    return list.map((d) => {
      const open = S.open === d.id && S.ed !== d.id, editing = S.ed === d.id;
      return `<div class="mp-drow">
        <button class="mp-dhead" draggable="true" data-drag="dish:${esc(d.id)}" data-a="toggle" data-id="${esc(d.id)}" aria-expanded="${open || editing}" title="Dra til en dag for å legge den på planen">
          <span class="mp-dinfo"><span class="mp-dtitle"><b>${esc(d.name)}</b>${d.folder ? `<span class="mp-fold">${esc(d.folder)}</span>` : ''}${d.src === 'scan' ? '<span class="mp-scanned">✦ Skannet</span>' : ''}${d.src === 'hellofresh' ? '<span class="mp-hf">HelloFresh</span>' : ''}</span>
            <span class="mp-mute">${[`${d.ing.length} ${d.ing.length === 1 ? 'ingrediens' : 'ingredienser'}`, d.time, d.servings ? `${d.servings} porsjoner` : ''].filter(Boolean).map(esc).join(' · ')}</span></span>
          <span class="mp-dside">${(d.fixedDays ?? []).length ? `<span class="mp-chip mp-chip-fix" title="Alltid på ${(d.fixedDays).map((i) => DAYS[i].toLowerCase()).join(', ')}">Fast</span>` : ''}${d.days.map((i) => `<span class="mp-chip">${AB[i]}</span>`).join('')}${chev(open || editing)}</span>
        </button>
        ${open ? `<div class="mp-dbody">
          <div class="mp-row mp-wrap mp-meta">
            <label class="mp-inline">Mappe<span class="mp-selwrap mp-mini"><select data-folder="${esc(d.id)}" aria-label="Mappe for ${esc(d.name)}"><option value=""${d.folderId ? '' : ' selected'}>Ingen mappe</option>${w.folders.map((f) => `<option value="${esc(f.id)}"${f.id === d.folderId ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>${chev()}</span></label>
            ${d.sourceUrl ? `<a class="mp-src" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">Original oppskrift: ${esc(host(d.sourceUrl))} ↗</a>` : ''}
          </div>
          ${d.image ? `<img class="mp-photo" src="${esc(d.image)}" alt="" loading="lazy">` : ''}
          <div class="mp-links"><div class="mp-lbl">LENKER OG FILER</div>
            ${(d.links ?? []).map((l) => { const [ic, bg, label] = KIND[l.kind] ?? KIND.link; return `<div class="mp-link">
              <span class="mp-lic" style="background:${bg}">${ic}</span>
              <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"${l.fileUrl ? ' download' : ''}><b>${esc(l.title)}</b><span>${esc(l.fileUrl ? `${label} · lastet opp` : `${label} · ${host(l.url)}`)}</span></a>
              <button class="mp-x" data-a="rmlink" data-id="${esc(d.id)}" data-lid="${esc(l.id)}" aria-label="Fjern ${esc(l.title)}">×</button></div>`; }).join('')}
            <form class="mp-row mp-wrap" data-f="link" data-id="${esc(d.id)}"><input class="mp-in mp-lin" name="url" type="url" placeholder="Lenke, f.eks. Excel-kalkulator for pizzadeig" aria-label="Lenke"><button class="mp-btn mp-dark" type="submit">Legg til</button><label class="mp-btn mp-dark">Fil<input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.docx,image/*" data-linkfile="${esc(d.id)}" hidden></label></form>
          </div>
          <div class="mp-cols">
            <div><div class="mp-lbl">INGREDIENSER</div>${d.ing.length ? `<ul>${d.ing.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<div class="mp-faint">Ingen ingredienser lagt inn.</div>'}</div>
            <div><div class="mp-lbl">SLIK GJØR DU</div>${d.steps.length ? `<ol>${d.steps.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>` : '<div class="mp-faint">Ingen fremgangsmåte lagt inn.</div>'}</div>
          </div>
          <div class="mp-always" role="group" aria-label="Alltid på">
            <div class="mp-lbl">ALLTID PÅ</div>
            <div class="mp-row mp-wrap">${AB.map((ab, i) => {
              const on = (d.fixedDays ?? []).includes(i), other = (w.fixed ?? []).find((f) => f.index === i && f.dishId !== d.id);
              return `<button class="mp-wd${on ? ' on' : ''}" data-a="always" data-id="${esc(d.id)}" data-wd="${i}" aria-pressed="${on}" title="${on ? `${esc(d.name)} hver ${DAYS[i].toLowerCase()}` : other ? `Erstatter ${esc(other.name)} som fast ${DAYS[i].toLowerCase()}` : `Gjør ${esc(d.name)} fast hver ${DAYS[i].toLowerCase()}`}">${ab}${other && !on ? '<i></i>' : ''}</button>`;
            }).join('')}</div>
            <div class="mp-faint">${(d.fixedDays ?? []).length ? `Legges på hver ${(d.fixedDays).map((i) => DAYS[i].toLowerCase()).join(', ')} denne og kommende uker. AI og «Lag ny for uka» endrer ikke faste dager.` : 'Velg dagene retten alltid skal stå på.'}</div>
          </div>
          <div class="mp-row mp-wrap">
            <label class="mp-selwrap"><span class="mp-sr">Legg på dag</span><select data-onday="${esc(d.id)}"><option value="">Legg på dag …</option>${w.days.map((x) => `<option value="${x.date}">${DAYS[x.index]}</option>`).join('')}</select>${chev()}</label>
            <button class="mp-btn mp-plain" data-a="edit" data-id="${esc(d.id)}">Rediger</button>
            <button class="mp-btn mp-plain mp-dim" data-a="del" data-id="${esc(d.id)}">Slett rett</button>
          </div></div>` : ''}
        ${editing ? `<div class="mp-dbody">${dishForm(d)}</div>` : ''}
      </div>`;
    }).join('');
  }

  function scanCard() {
    const I = S.imp, w = W();
    const busy = (S.jobs ?? []).filter((j) => j.status !== 'done' || Date.now() - j.updated < 60_000).slice(0, 5);
    return `<div class="mp-row mp-between"><b class="mp-st">Skann oppskrift</b><span class="mp-faint">✦ AI leser i bakgrunnen</span></div>
      <div class="mp-scanbtns">
        <label class="mp-btn mp-acc mp-big">Kamera<input type="file" accept="image/*" capture="environment" data-scanfile hidden></label>
        <label class="mp-btn mp-dark mp-big">Bilder eller PDF<input type="file" multiple accept="image/*,application/pdf" data-scanfile hidden></label>
      </div>
      <form class="mp-row" data-f="import"><input class="mp-in" name="url" type="url" value="${esc(S.link)}" data-link placeholder="Lim inn lenke fra en nettside, f.eks. matprat.no eller tine.no" aria-label="Lenke til oppskrift"><button class="mp-btn mp-dark" type="submit" ${I?.run ? 'disabled' : ''}>Importer</button></form>
      ${I ? `<div class="mp-imp">
        ${I.run ? `<div class="mp-accl">✦ Henter ${esc(I.dom)} … leser oppskriften (schema.org/Recipe)</div>` : ''}
        ${I.err ? `<div class="mp-err">${esc(I.err)}</div><div><button class="mp-btn mp-plain" data-a="impcancel">Lukk</button></div>` : ''}
        ${I.p ? `<div class="mp-row mp-top">${I.p.image ? `<img class="mp-impimg" src="${esc(I.p.image)}" alt="" referrerpolicy="no-referrer">` : '<span class="mp-impimg"></span>'}
            <div class="mp-col"><b class="mp-impt">${esc(I.p.name)}</b><span class="mp-faint">${[esc(I.dom), esc(I.p.time), I.p.servings ? `${esc(I.p.servings)} porsjoner` : ''].filter(Boolean).join(' · ')}</span>
            <span class="mp-mute mp-sm">${I.p.ingredients.length} ingredienser · ${I.p.steps.length} steg${I.p.method === 'ai' ? ' · ✦ lest med AI' : ''}</span></div></div>
          <label class="mp-inline">Lagre i<span class="mp-selwrap mp-mini"><select data-impfolder>${w.folders.map((f) => `<option value="${esc(f.id)}"${f.id === I.folderId ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>${chev()}</span></label>
          <div class="mp-row"><button class="mp-btn mp-light" data-a="impsave" ${I.saving ? 'disabled' : ''}>${I.saving ? 'Lagrer …' : 'Lagre oppskrift'}</button><button class="mp-btn mp-plain" data-a="impcancel">Avbryt</button></div>` : ''}
      </div>` : ''}
      ${busy.map((j) => { const [t, c, wd] = JOB[j.status] ?? JOB.queued; return `<div class="mp-job"><div class="mp-row mp-between"><span class="mp-ell">${esc(j.status === 'done' ? `${j.name} → ${dishById(j.dishId)?.folder ?? 'uten mappe'}` : j.name || 'Oppskrift')}</span><span style="color:${c}" class="mp-jst">${t}</span></div>
        <span class="mp-bar"><i style="width:${wd};background:${c}"></i></span>
        ${j.status === 'error' ? `<div class="mp-row mp-between"><span class="mp-err mp-sm">${esc(j.error)}</span><span class="mp-row"><button class="mp-btn mp-plain mp-sm" data-a="jobretry" data-id="${esc(j.id)}">Prøv igjen</button><button class="mp-x" data-a="jobdel" data-id="${esc(j.id)}" aria-label="Fjern">×</button></span></div>` : ''}</div>`; }).join('')}`;
  }

  function folderBar(w) {
    const none = w.dishes.filter((d) => !d.folderId).length;
    const chips = [{ id: 'Alle', name: 'Alle', count: w.dishes.length }, ...w.folders, ...(none ? [{ id: '__none', name: 'Uten mappe', count: none }] : [])];
    const cur = w.folders.find((f) => f.id === S.fold);
    return `<div class="mp-folders"><div class="mp-row mp-between"><span class="mp-lbl mp-nomb">MAPPER</span><span class="mp-row">${cur ? `<button class="mp-btn mp-link mp-sm" data-a="foldedit">${S.foldEdit ? 'Ferdig' : 'Rediger'}</button>` : ''}<button class="mp-btn mp-link mp-sm" data-a="foldnew">+ Ny mappe</button></span></div>
      ${S.foldNew ? '<form class="mp-row" data-f="folder"><input class="mp-in" name="name" maxlength="40" placeholder="Navn, f.eks. Grill" aria-label="Navn på ny mappe"><button class="mp-btn mp-light" type="submit">Lagre</button></form>' : ''}
      ${cur && S.foldEdit ? `<form class="mp-row" data-f="foldrename" data-id="${esc(cur.id)}"><input class="mp-in" name="name" maxlength="40" value="${esc(cur.name)}" aria-label="Nytt navn på mappen"><button class="mp-btn mp-light" type="submit">Lagre</button><button class="mp-btn mp-plain mp-dim" type="button" data-a="folddel" data-id="${esc(cur.id)}">Slett</button></form>` : ''}
      <div class="mp-fchips">${chips.map((f) => `<button class="mp-fchip${S.fold === f.id ? ' on' : ''}" data-a="fold" data-id="${esc(f.id)}" aria-pressed="${S.fold === f.id}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h6l2 2h10v11H3z"/></svg>${esc(f.name)}<span>${f.count ?? 0}</span></button>`).join('')}</div></div>`;
  }

  function cookCards(w) {
    return w.chefs.map((c) => `<div class="mp-cook-card">
      <div class="mp-row mp-between"><b>${esc(c.name)}</b><button class="mp-x" data-a="rmcook" data-name="${esc(c.name)}" aria-label="Fjern kokk ${esc(c.name)}" title="Fjern kokk">×</button></div>
      ${c.best.length ? `<div class="mp-row mp-wrap">${c.best.map((b) => `<span class="mp-best">★ ${esc(b.name)}<button data-a="rmbest" data-name="${esc(c.name)}" data-id="${esc(b.id)}" aria-label="Fjern ${esc(b.name)}">×</button></span>`).join('')}</div>` : ''}
      <label class="mp-selwrap mp-small"><span class="mp-sr">Best på</span><select data-best="${esc(c.name)}"><option value="">+ Best på …</option>${w.dishes.filter((d) => !c.best.some((b) => b.id === d.id)).map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select>${chev()}</label>
    </div>`).join('');
  }

  function shopCard(w) {
    const items = w.shopping, done = items.filter((x) => x.done).length, LIM = 8;
    const shown = S.shopAll ? items : [...items.filter((x) => !x.done), ...items.filter((x) => x.done)].slice(0, LIM);
    return `<div class="mp-card">
      <div class="mp-row mp-between"><b class="mp-ct">Handleliste</b>${items.length ? `<span class="mp-mute">${done} av ${items.length}</span>` : ''}</div>
      <div class="mp-mute">Ingrediensene fra rettene på planen havner her automatisk.</div>
      ${items.length ? `<div class="mp-shop">${shown.map((x) => `<button class="mp-sitem${x.done ? ' done' : ''}" data-a="shop" data-id="${esc(x.id)}" aria-pressed="${x.done}"><i></i><span>${esc(x.text)}</span>${x.count > 1 ? `<span class="mp-faint">×${x.count}</span>` : ''}</button>`).join('')}</div>` : ''}
      ${items.length > LIM ? `<button class="mp-btn mp-plain mp-more" data-a="shopall">${S.shopAll ? 'Vis færre' : `Vis alle ${items.length} varer`}</button>` : ''}
      <form class="mp-row" data-f="shop"><input class="mp-in" name="text" placeholder="+ Legg til vare" maxlength="80"><button class="mp-btn mp-light" type="submit">Legg til</button></form>
    </div>`;
  }

  function html() {
    const w = S.w;
    if (!w) return `<div class="mp-loading">${S.err ? esc(S.err) : 'Laster Mat …'}</div>`;
    const secT = S.off === 0 ? 'Denne uka' : S.off === 1 ? 'Neste uke' : S.off === -1 ? 'Forrige uke' : `Uke ${w.week}`;
    if (S.fold !== 'Alle' && S.fold !== '__none' && !w.folders.some((f) => f.id === S.fold)) S.fold = 'Alle';
    return `${header(w)}
      <div class="mp-status" data-status ${S.status ? '' : 'hidden'}>${esc(S.status)}</div>
      <div class="mp-main">
        <div class="mp-left">
          <div class="mp-row mp-wrap mp-weekbar">
            <h2 class="mp-h2">${secT}</h2>
            <button class="mp-ib" data-a="prev" aria-label="Forrige uke">‹</button>
            <button class="mp-ib" data-a="next" aria-label="Neste uke">›</button>
            ${S.off !== 0 ? '<button class="mp-btn mp-link" data-a="now">I dag</button>' : ''}
            <span class="mp-grow"></span>
            <button class="mp-btn" data-a="shuffle" ${S.busy ? 'disabled' : ''}>Lag ny for uka</button>
          </div>
          <div class="mp-days">${w.days.map((d) => dayCard(d, w)).join('')}</div>
          <div class="mp-hint">Hver middag ligger i kalenderfeeden kl. 17:00 med kokken i beskrivelsen. Dra retter fra listen til en dag, eller dra en rett mellom dager for å bytte.</div>
          <div class="mp-cards">
            <div class="mp-card">
              <div class="mp-row mp-between mp-wrap"><b class="mp-ct">HelloFresh denne uka</b><button class="mp-btn" data-a="hf">${S.hfOpen ? 'Lukk' : 'Lim inn ukesmeny'}</button></div>
              <div class="mp-mute">HelloFresh har ikke åpent API. Lim inn ukesmenyen, én rett per linje, så havner rettene i listen.</div>
              ${S.hfOpen ? `<form class="mp-form mp-flat" data-f="hf"><textarea class="mp-in" name="text" rows="5" placeholder="Kremet kyllinggryte med ris&#10;Teriyakilaks med sesamris&#10;Halloumiburger"></textarea><div><button class="mp-btn mp-light" type="submit">Legg til retter</button></div></form>` : ''}
              ${S.hfMsg ? `<div class="mp-ok">${esc(S.hfMsg)}</div>` : ''}
            </div>
            <div class="mp-card">
              <div><b class="mp-ct">Kokker</b><div class="mp-mute" style="margin-top:6px">Hvem er best på hva? Kokken settes automatisk når en av rettene deres havner på planen.</div></div>
              ${cookCards(w)}
              <form class="mp-row" data-f="cook"><input class="mp-in mp-tall" name="name" placeholder="+ Legg til kokk" maxlength="40"><button class="mp-btn mp-light mp-tallb" type="submit">Legg til</button></form>
            </div>
            ${shopCard(w)}
          </div>
        </div>
        <div class="mp-right">
          <div class="mp-row mp-between"><div class="mp-h2">Retter <span class="mp-count">${w.dishes.length}</span></div><button class="mp-btn" data-a="new">+ Ny rett</button></div>
          ${S.ed === '__new' ? dishForm(null) : ''}
          <div class="mp-scan" data-scan>${scanCard()}</div>
          ${folderBar(w)}
          <span class="mp-qw${S.q ? ' has' : ''}" data-sf>${clearBtn()}<input class="mp-in mp-search" type="search" data-q value="${esc(S.q)}" placeholder="Søk i retter og ingredienser" aria-label="Søk i retter og ingredienser"></span>
          <div class="mp-row mp-wrap">${FILTERS.map((f) => `<button class="mp-filter${S.flt === f ? ' on' : ''}" data-a="flt" data-f="${f}" aria-pressed="${S.flt === f}">${f}</button>`).join('')}</div>
          <div class="mp-list" data-list>${dishList(w)}</div>
        </div>
      </div>`;
  }

  function paint() {
    if (!el.isConnected && S.w) return;
    const active = document.activeElement, keep = active?.matches?.('[data-q]') && el.contains(active) ? active.selectionStart : null;
    el.innerHTML = html();
    if (keep !== null) { const q = el.querySelector('[data-q]'); q?.focus(); q?.setSelectionRange(keep, keep); }
    el.querySelector('.mp-fchip.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function paintStatus() { const s = el.querySelector('[data-status]'); if (s) { s.textContent = S.status; s.hidden = !S.status; } }
  function paintList() { const l = el.querySelector('[data-list]'); if (l && S.w) l.innerHTML = dishList(S.w); }
  function paintScan() {
    const x = el.querySelector('[data-scan]');
    if (!x || !S.w) return;
    const a = document.activeElement, focusLink = a?.matches?.('[data-link]') && x.contains(a);
    x.innerHTML = scanCard();
    if (focusLink) x.querySelector('[data-link]')?.focus();
  }
  async function importUrl(url) {
    url = String(url ?? '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    S.link = url; S.imp = { run: true, dom: host(url) }; paintScan();
    try {
      const p = await call('/recipes/import', { method: 'POST', json: { url } });
      const f = W().folders.find((x) => x.name === p.folderSuggestion) ?? W().folders[0];
      S.imp = { p, dom: host(p.sourceUrl), folderId: f?.id ?? null };
    } catch (e) { S.imp = { err: e.message, dom: host(url) }; }
    paintScan();
  }

  /* ---------- Handlinger ---------- */

  const W = () => S.w;
  const dayOf = (date) => W().days.find((d) => d.date === date);
  async function plan(mode) {
    S.busy = true; if (mode === 'ai') flash('Lager ukeplan …'); paint();
    await run(() => call('/plan', { method: 'POST', json: { scope: 'week', date: W().start, mode } }));
    S.busy = false; paint();
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function copyFeed() {
    const inp = el.querySelector('[data-feed]');
    try { await navigator.clipboard.writeText(inp.value); }
    catch { inp.select(); try { document.execCommand('copy'); } catch { /* vis bare markert tekst */ } }
    S.copied = true; paint();
  }

  el.classList.add('mat');
  el.classList.toggle('mat-embedded', embedded);

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (S.cal && !e.target.closest('[data-mp-cal]')) { S.cal = false; if (!b) return paint(); }
    if (!b || !el.contains(b)) return;
    const a = b.dataset.a, w = W();
    switch (a) {
      case 'auto': return run(() => call('/auto', { method: 'PUT', json: { auto: !w.auto } }).then((r) => { w.auto = r.auto; flash(r.status); }));
      case 'cal': S.cal = !S.cal; S.copied = false; return paint();
      case 'copy': return copyFeed();
      case 'ics': try { download(await call(`/week.ics?start=${w.start}`), `matplan-uke-${w.week}.ics`); } catch (err) { flash(err.message); paint(); } return;
      case 'ai': return plan('ai');
      case 'shuffle': return plan('shuffle');
      case 'prev': S.off--; return load();
      case 'next': S.off++; return load();
      case 'now': S.off = 0; return load();
      case 'regen': return run(() => call('/plan', { method: 'POST', json: { scope: 'day', date: b.dataset.date } }));
      case 'always': {
        const d = w.dishes.find((x) => x.id === b.dataset.id), i = +b.dataset.wd;
        if (!d) return;
        const cur = d.fixedDays ?? [], days = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
        return run(() => call(`/dishes/${d.id}/fixed`, { method: 'PUT', json: { days, start: w.start } }));
      }
      case 'fast': {
        const d = dayOf(b.dataset.date);
        if (!d.fixed && !d.dishId) { flash('Velg en rett før du gjør dagen fast.'); return paintStatus(); }
        return run(() => call(`/day/${d.date}`, { method: 'PATCH', json: { fixed: !d.fixed } }), { msg: d.fixed ? `${d.weekday} er ikke lenger fast.` : `${d.name} hver ${d.weekday.toLowerCase()}.` });
      }
      case 'openday': S.open = b.dataset.id; S.ed = null; S.flt = 'Alle'; S.q = ''; paint(); return el.querySelector(`[data-a="toggle"][data-id="${CSS.escape(b.dataset.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      case 'toggle': S.open = S.open === b.dataset.id && S.ed !== b.dataset.id ? null : b.dataset.id; S.ed = null; return paint();
      case 'edit': S.ed = b.dataset.id; S.efErr = ''; return paint();
      case 'new': S.ed = S.ed === '__new' ? null : '__new'; S.open = null; S.efErr = ''; paint(); return el.querySelector('form[data-f="dish"] input[name=name]')?.focus();
      case 'efcancel': S.ed = null; S.efErr = ''; return paint();
      case 'del': {
        const d = dishById(b.dataset.id);
        if (!d || !confirm(`Slette ${d.name}? Den fjernes også fra planen.`)) return;
        S.open = null; return run(() => call(`/dishes/${d.id}?start=${w.start}`, { method: 'DELETE' }));
      }
      case 'flt': S.flt = b.dataset.f; return paint();
      case 'hf': S.hfOpen = !S.hfOpen; S.hfMsg = ''; paint(); return el.querySelector('form[data-f="hf"] textarea')?.focus();
      case 'rmcook': if (!confirm(`Fjerne ${b.dataset.name} som kokk?`)) return; return run(() => call(`/cooks/${encodeURIComponent(b.dataset.name)}?start=${w.start}`, { method: 'DELETE' }));
      case 'rmbest': {
        const c = w.chefs.find((x) => x.name === b.dataset.name);
        return run(() => call(`/cooks/${encodeURIComponent(c.name)}/best`, { method: 'PUT', json: { best: c.best.map((x) => x.id).filter((x) => x !== b.dataset.id), start: w.start } }));
      }
      case 'shopall': S.shopAll = !S.shopAll; return paint();
      case 'fold': S.fold = b.dataset.id; S.foldEdit = false; return paint();
      case 'foldnew': S.foldNew = !S.foldNew; paint(); return el.querySelector('form[data-f="folder"] input')?.focus();
      case 'foldedit': S.foldEdit = !S.foldEdit; return paint();
      case 'folddel': {
        const f = w.folders.find((x) => x.id === b.dataset.id);
        if (!f || !confirm(`Slette mappen ${f.name}? Rettene i den blir liggende uten mappe.`)) return;
        try { const r = await call(`/folders/${f.id}`, { method: 'DELETE' }); S.fold = 'Alle'; S.foldEdit = false; flash(r.status); } catch (err) { flash(err.message); }
        return load();
      }
      case 'impcancel': S.imp = null; S.link = ''; return paintScan();
      case 'impsave': {
        const I = S.imp;
        if (!I?.p) return;
        I.saving = true; paintScan();
        try {
          const r = await call('/recipes/import/save', { method: 'POST', json: { preview: I.p, folderId: I.folderId, start: w.start } });
          S.w = r; S.imp = null; S.link = ''; S.open = r.dish?.id ?? null; S.fold = 'Alle'; S.flt = 'Alle'; S.q = ''; flash(r.status);
        } catch (err) { I.saving = false; I.err = err.message; I.p = null; }
        return paint();
      }
      case 'jobretry': try { S.jobs = await call(`/recipes/jobs/${b.dataset.id}/retry`, { method: 'POST' }); } catch (err) { flash(err.message); } paintScan(); return pollJobs();
      case 'jobdel': try { await call(`/recipes/jobs/${b.dataset.id}`, { method: 'DELETE' }); S.jobs = S.jobs.filter((j) => j.id !== b.dataset.id); } catch (err) { flash(err.message); } return paintScan();
      case 'rmlink': return run(() => call(`/dishes/${b.dataset.id}/links/${b.dataset.lid}?start=${w.start}`, { method: 'DELETE' }));
      case 'shop': return run(() => call(`/shopping/${encodeURIComponent(b.dataset.id)}/toggle`, { method: 'POST', json: { start: w.start } }).then(() => call(`/week?start=${w.start}`)));
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target, w = W();
    if (t.matches('[data-cook]')) { if (t.value) run(() => call(`/day/${t.dataset.cook}`, { method: 'PATCH', json: { cook: t.value } })); return; }
    if (t.matches('[data-onday]') && t.value) {
      const d = dishById(t.dataset.onday), date = t.value;
      return run(() => call(`/day/${date}`, { method: 'PATCH', json: { dishId: d.id } }), { msg: `${d.name} er lagt på ${DAYS[w.days.find((x) => x.date === date).index].toLowerCase()}.` });
    }
    if (t.matches('[data-scanfile]')) { const files = [...t.files]; t.value = ''; return upload(files); }
    if (t.matches('[data-linkfile]')) {
      const files = [...t.files]; t.value = '';
      if (!files.length) return;
      const fd = new FormData();
      for (const f of files) fd.append('file', f, f.name);
      return run(() => call(`/dishes/${t.dataset.linkfile}/links?start=${w.start}`, { method: 'POST', form: fd }), { msg: files.length > 1 ? `${files.length} filer lagt til` : `${files[0].name} lagt til` });
    }
    if (t.matches('[data-folder]')) {
      const d = dishById(t.dataset.folder), f = w.folders.find((x) => x.id === t.value);
      return run(() => call(`/dishes/${d.id}`, { method: 'PATCH', json: { folderId: t.value || null, start: w.start } }), { msg: `${d.name} ligger nå i ${f ? f.name : 'ingen mappe'}.` });
    }
    if (t.matches('[data-impfolder]') && S.imp) { S.imp.folderId = t.value; return; }
    if (t.matches('[data-best]') && t.value) {
      const c = w.chefs.find((x) => x.name === t.dataset.best);
      return run(() => call(`/cooks/${encodeURIComponent(c.name)}/best`, { method: 'PUT', json: { best: [...c.best.map((x) => x.id), t.value], start: w.start } }));
    }
  });

  el.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { S.q = e.target.value; paintList(); } if (e.target.matches('[data-link]')) S.link = e.target.value; });
  // Lim inn en lenke rett i feltet: importen starter med en gang.
  el.addEventListener('paste', (e) => {
    if (!e.target.matches?.('[data-link]')) return;
    const t = e.clipboardData?.getData('text')?.trim();
    if (t && /^https?:\/\/\S+$/i.test(t)) { e.preventDefault(); importUrl(t); }
  });

  el.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-f]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)), w = W();
    if (f.dataset.f === 'dish') {
      const name = String(v.name ?? '').trim();
      if (!name) { S.efErr = 'Skriv et navn på retten.'; return paint(); }
      const body = { name, ing: lines(v.ing), steps: lines(v.steps), src: v.hf ? 'hellofresh' : 'own', start: w.start };
      const editId = f.dataset.id;
      try {
        const r = await call(editId ? `/dishes/${editId}` : '/dishes', { method: editId ? 'PATCH' : 'POST', json: body });
        S.w = r; S.ed = null; S.efErr = ''; S.open = r.dish?.id ?? editId; flash(editId ? `${name} er lagret.` : `${name} er lagt til.`);
      } catch (err) { S.efErr = err.message; }
      return paint();
    }
    if (f.dataset.f === 'hf') {
      try { const r = await call('/hellofresh', { method: 'POST', json: { text: v.text ?? '', start: w.start } }); S.w = r; S.hfOpen = false; S.hfMsg = r.status; if (r.added) S.flt = 'HelloFresh'; }
      catch (err) { S.hfMsg = err.message; }
      return paint();
    }
    if (f.dataset.f === 'import') return importUrl(v.url);
    if (f.dataset.f === 'link') {
      const url = String(v.url ?? '').trim();
      if (!url) return;
      return run(() => call(`/dishes/${f.dataset.id}/links?start=${w.start}`, { method: 'POST', json: { url } }));
    }
    if (f.dataset.f === 'folder') {
      const name = String(v.name ?? '').trim();
      if (!name) return;
      try { const r = await call('/folders', { method: 'POST', json: { name } }); S.foldNew = false; S.fold = r.id; flash(`Mappen ${name} er laget.`); } catch (err) { flash(err.message); }
      return load();
    }
    if (f.dataset.f === 'foldrename') {
      const name = String(v.name ?? '').trim();
      if (!name) return;
      try { await call(`/folders/${f.dataset.id}`, { method: 'PATCH', json: { name } }); S.foldEdit = false; flash(`Mappen heter nå ${name}.`); } catch (err) { flash(err.message); }
      return load();
    }
    if (f.dataset.f === 'cook') { const name = String(v.name ?? '').trim(); if (name) return run(() => call('/cooks', { method: 'POST', json: { name, start: w.start } })); return; }
    if (f.dataset.f === 'shop') { const text = String(v.text ?? '').trim(); if (text) return run(() => call('/shopping', { method: 'POST', json: { text, start: w.start } })); }
  });

  /* ---------- Dra og slipp ---------- */

  let dragData = '';
  el.addEventListener('dragstart', (e) => {
    const t = e.target.closest?.('[data-drag]');
    if (!t) return;
    dragData = t.dataset.drag;
    e.dataTransfer.effectAllowed = dragData.startsWith('dish:') ? 'copy' : 'move';
    e.dataTransfer.setData('text/plain', dragData);
    t.classList.add('dragging');
  });
  el.addEventListener('dragend', () => { dragData = ''; el.querySelectorAll('.dragging, .drop').forEach((x) => x.classList.remove('dragging', 'drop')); });
  el.addEventListener('dragover', (e) => {
    const card = e.target.closest?.('.mp-day');
    if (!card || !dragData) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragData.startsWith('dish:') ? 'copy' : 'move';
    el.querySelectorAll('.mp-day.drop').forEach((x) => x !== card && x.classList.remove('drop'));
    card.classList.add('drop');
  });
  el.addEventListener('dragleave', (e) => { const card = e.target.closest?.('.mp-day'); if (card && !card.contains(e.relatedTarget)) card.classList.remove('drop'); });
  el.addEventListener('drop', (e) => {
    const card = e.target.closest?.('.mp-day');
    if (!card) return;
    e.preventDefault();
    const t = e.dataTransfer.getData('text/plain') || dragData, date = card.dataset.day;
    card.classList.remove('drop'); dragData = '';
    if (t.startsWith('dish:')) {
      const d = dishById(t.slice(5));
      return run(() => call(`/day/${date}`, { method: 'PATCH', json: { dishId: t.slice(5) } }), { msg: d ? `${d.name} er lagt på ${dayOf(date).weekday.toLowerCase()}.` : undefined });
    }
    if (t.startsWith('day:') && t.slice(4) !== date) return run(() => call('/swap', { method: 'POST', json: { a: t.slice(4), b: date } }));
  });

  // Lukk kalenderboksen ved klikk utenfor komponenten.
  const outside = (e) => { if (!el.isConnected) return document.removeEventListener('click', outside); if (S.cal && !e.composedPath().includes(el)) { S.cal = false; paint(); } };
  document.addEventListener('click', outside);

  // Slipp bilder eller PDF på «Skann oppskrift».
  el.addEventListener('dragover', (e) => { if (e.target.closest?.('[data-scan]') && [...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); e.target.closest('[data-scan]').classList.add('drop'); } });
  el.addEventListener('dragleave', (e) => { const x = e.target.closest?.('[data-scan]'); if (x && !x.contains(e.relatedTarget)) x.classList.remove('drop'); });
  el.addEventListener('drop', (e) => { const x = e.target.closest?.('[data-scan]'); if (x && e.dataTransfer?.files?.length) { e.preventDefault(); x.classList.remove('drop'); upload([...e.dataTransfer.files]); } });

  paint();
  load().then(pollJobs);
  // Sanntid: en annen bruker endret planen → hent uka på nytt og vis hvem.
  const off = onLive('meal:changed', (m) => {
    if (!el.isConnected) { off?.(); return; }
    if (S.ed || S.hfOpen) return; // ikke forstyrr et åpent skjema
    const who = m?.updatedBy?.name ?? m?.updatedBy ?? m?.by ?? '';
    load().then(() => { if (who) { flash(`Oppdatert av ${who}`); paintStatus(); } });
  });
  return { reload: load, el };
}

/* ---------- Homelab-fanen ---------- */

export function render() {
  queueMicrotask(() => { const host = document.getElementById('mat-host'); if (host && !host.dataset.mounted) { host.dataset.mounted = '1'; mountMatplan(host, { embedded: is2c() }); } });
  return '<div id="mat-host" class="mat-host"></div>';
}

// Homelab kaller bind(view) én gang; komponenten binder sine egne lyttere.
export function bind() {}

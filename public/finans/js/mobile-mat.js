// Mat (tidligere Matplan) i mobilappen, prompt 13. Design 2a fra «Mat Varianter»: limegrønt «I dag»-kort med steg,
// uka som liste, oppskrifter i mapper, skann oppskrift og import fra nettside, og lenker/filer per rett.
// Fargene følger appens tema (glass på iPhone, Material You på Android, Papir i det nye mobildesignet) via --mp-*-variablene.
// Samme data som Mat på web (/mat/api). Eldre servere uten mapper eller import får standardmappene og en melding.
import { esc, matApi, today } from './core.js';
import { m, draw, flash, meName } from './mobile.js';

const M = { w: null, err: '', sel: null, busy: false, folders: null, fLocal: false, folder: '', jobs: [], step: {}, imp: { url: '', busy: false, prev: null, err: '', folderId: '' }, newF: null, link: null, all: false, checked: {} };
const AB = ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN'];
const AB2 = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const DN = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const DEF_FOLDERS = ['Middag', 'Supper', 'Fisk', 'Kylling', 'Vegetar', 'Bakst', 'Frokost', 'Favoritter'];
const FCOL = ['#FF8A4C', '#D4F25A', '#7FC8F8', '#F2C14E', '#9FE3C6', '#C9A7FF', '#FF9EBE', '#F2EEE4'];
const KIND = { sheet: ['XLS', '#1F7A45', 'Regneark'], pdf: ['PDF', '#C8102E', 'PDF'], video: ['▶', '#D7263D', 'Video'], doc: ['DOC', '#2B5797', 'Dokument'], link: ['↗', '#5E5A50', 'Lenke'], image: ['IMG', '#8A5A1E', 'Bilde'] };
const ACTIVE = ['queued', 'reading', 'pending', 'processing'];

// Mat følger appens tema. Mørk når appen er mørk (iPhone er alltid mørk, Android og Papir følger valgt modus).
export const matDark = () => !m.light;

export async function matLoad() {
  M.err = '';
  const [w, f, j] = await Promise.all([
    matApi('/week').catch((e) => { M.err = `Mat er ikke tilgjengelig: ${e.message}`; return null; }),
    matApi('/folders').catch(() => null),
    matApi('/recipes/jobs').catch(() => null),
  ]);
  if (w) M.w = w;
  if (Array.isArray(f)) { M.folders = f; M.fLocal = false; } else { M.folders = DEF_FOLDERS.map((name, i) => ({ id: '', name, sort: i, count: null })); M.fLocal = true; }
  M.jobs = Array.isArray(j) ? j : j?.items ?? [];
  const ti = (M.w?.days ?? []).findIndex((d) => d.today || d.date === today());
  if (M.sel == null || M.sel >= (M.w?.days?.length ?? 0)) M.sel = ti >= 0 ? ti : 0;
  pollJobs();
}

let pollT;
function pollJobs() {
  clearTimeout(pollT);
  if (!M.jobs.some((x) => ACTIVE.includes(x.status))) return;
  pollT = setTimeout(async () => {
    const before = M.jobs.filter((x) => ACTIVE.includes(x.status)).length;
    try { const j = await matApi('/recipes/jobs'); M.jobs = Array.isArray(j) ? j : j?.items ?? []; } catch { return; }
    const after = M.jobs.filter((x) => ACTIVE.includes(x.status)).length;
    if (after < before) { await matLoad().catch(() => {}); if (M.jobs.some((x) => x.status === 'done')) flash('Oppskriften er lagret'); }
    if (m.screen === 'mat') draw();
    pollJobs();
  }, 3000);
}

/* ---------- Hjelpere ---------- */

const d8 = (iso) => new Date(iso + 'T12:00:00');
const ingOf = (d) => d?.ingredients ?? d?.ing ?? [];
const stepsOf = (d) => d?.steps ?? [];
const dishById = (id) => (M.w?.dishes ?? []).find((y) => y.id === id) ?? null;
const metaOf = (d) => [d?.time ? `${d.time}${/\d$/.test(String(d.time)) ? ' min' : ''}` : '', d?.servings ? `${d.servings} porsjoner` : '', ingOf(d).length ? `${ingOf(d).length} ingredienser` : ''].filter(Boolean).join(' · ');
const folderName = (id) => M.folders?.find((f) => f.id === id)?.name ?? '';
const kindOf = (l) => {
  if (l.kind && KIND[l.kind]) return l.kind;
  const s = String(l.fileUrl || l.url || l.title || '').toLowerCase();
  return /\.(xlsx?|csv|ods)\b/.test(s) ? 'sheet' : /\.pdf\b/.test(s) ? 'pdf' : /youtube|youtu\.be|vimeo|\.mp4/.test(s) ? 'video' : /\.(docx?|odt|txt)\b/.test(s) ? 'doc' : /\.(png|jpe?g|heic|webp)\b/.test(s) ? 'image' : 'link';
};
const thumb = (d, i) => d?.image ? `background-image:url('${esc(d.image)}');background-size:cover;background-position:center` : `background:${FCOL[i % FCOL.length]}`;
const back = (href, label) => `<a class="mp-back" href="${href}">‹ ${esc(label)}</a>`;

/* ---------- Visning ---------- */

export function matView() {
  const sub = m.sub || '';
  if (sub.startsWith('r/')) return recipe(decodeURIComponent(sub.slice(2)));
  if (sub === 'import') return importView();
  return main();
}

function head() {
  const w = M.w, s = w ? d8(w.start) : null, e = w ? d8(w.end) : null;
  const wk = w ? `UKE ${w.week} · ${s.getDate()}.–${e.getDate()}. ${MON[e.getMonth()].toUpperCase()}` : 'UKA';
  return `<div class="mp2-head"><div class="m-grow"><div class="mp2-lab">${wk}</div><h1 class="mp2-h1">Mat</h1></div>
    <div class="mp-btns"><button class="mp2-pill" data-mp="week" ${M.busy ? 'disabled' : ''} aria-label="Lag ny uke med AI">✦ Ny uke</button></div></div>`;
}

function main() {
  const w = M.w;
  if (M.err && !w) return `<div class="mat mat2">${head()}<div class="mp-card mp-empty">${esc(M.err)}</div><a class="mp-cta" href="/#/mat">Åpne Mat i nettleseren</a></div>`;
  if (!w) return `<div class="mat mat2">${head()}<div class="mp-card mp-empty"><div class="m-spin"></div></div></div>`;
  return `<div class="mat mat2">${head()}${todayCard()}${jobsCard()}${weekList()}${library()}${shopCard()}</div>`;
}

function todayCard() {
  const w = M.w, days = w.days ?? [], ti = Math.max(0, days.findIndex((d) => d.today || d.date === today()));
  const td = days[ti] ?? {}, dish = dishById(td.dishId) ?? {}, steps = stepsOf(dish), k = Math.min(M.step[td.dishId ?? ''] ?? 0, Math.max(0, steps.length - 1));
  const meta = dish.time ? `${dish.time}${/\d$/.test(String(dish.time)) ? ' min' : ''}` : '';
  const cook = td.cook ? `${td.cook} lager middag` : 'Ingen kokk valgt';
  return `<div class="mp2-today"${td.dishId ? ` data-mp="open" data-id="${esc(td.dishId)}" role="button" tabindex="0"` : ''}>
      <div class="mp2-tt"><span>I DAG · ${DN[ti].toUpperCase()}</span><span>${esc(meta)}</span></div>
      <div class="mp2-tname">${esc(td.name || 'Ingen rett i dag')}</div>
      <div class="mp2-tcook">${esc(cook)}</div>
      ${steps.length ? `<button class="mp2-step" data-mp="step" data-id="${esc(td.dishId)}"><span class="mp2-sl">STEG ${k + 1} AV ${steps.length} · trykk for neste</span><span class="mp2-st">${esc(steps[k])}</span>
        <span class="mp2-dots">${steps.map((_, i) => `<i style="background:${i <= k ? '#141A06' : 'rgba(20,26,6,.18)'}"></i>`).join('')}</span></button>` : ''}
    </div>`;
}

function jobsCard() {
  const j = (M.jobs ?? []).filter((x) => ACTIVE.includes(x.status) || x.status === 'error').slice(0, 4);
  if (!j.length) return '';
  return `<div class="mp-card pad mp2-jobs"><div class="mp2-lab">SKANNER OPPSKRIFTER</div>${j.map((x) => `<div class="mp2-job"><span class="${ACTIVE.includes(x.status) ? 'mp2-spin' : 'mp2-err'}"></span><span class="m-grow">${esc(x.name || (x.status === 'error' ? 'Kunne ikke lese oppskriften' : 'Leser oppskriften …'))}${x.error ? `<small>${esc(x.error)}</small>` : ''}</span></div>`).join('')}</div>`;
}

function weekList() {
  const w = M.w, days = w.days ?? [];
  return `<div class="mp2-sec"><span>UKA</span><span>Uke ${w.week}</span></div>
    <div class="mp2-week">${days.map((d, i) => `<button class="mp2-wrow${d.today ? ' on' : ''}" data-mp="${d.dishId ? 'open' : 'day'}" data-id="${esc(d.dishId ?? '')}" data-i="${i}">
      <span class="mp2-wd">${AB[i]}<small>${d8(d.date).getDate()}.</small></span><span class="mp2-wn">${esc(d.name || '–')}</span>
      <span class="mp2-wc">${esc(d.cook || '')}${d.fixed ? '<em>Fast</em>' : ''}</span></button>`).join('')}</div>`;
}

function library() {
  const all = M.w.dishes ?? [], f = M.folder;
  const list = f === '__none' ? all.filter((d) => !d.folderId) : f ? all.filter((d) => d.folderId === f) : all;
  const count = (id) => all.filter((d) => d.folderId === id).length;
  const chips = [`<button class="mp2-chip" data-mp="folder" data-f="" aria-pressed="${!f}">Alle<em>${all.length}</em></button>`,
    ...(M.folders ?? []).map((x, i) => `<button class="mp2-chip" data-mp="folder" data-f="${esc(x.id)}" aria-pressed="${!!x.id && f === x.id}" ${x.id ? '' : 'disabled'}><i style="background:${FCOL[i % FCOL.length]}"></i>${esc(x.name)}${x.id ? `<em>${x.count ?? count(x.id)}</em>` : ''}</button>`),
    `<button class="mp2-chip add" data-mp="newfolder">+ Ny mappe</button>`].join('');
  const nf = M.newF !== null ? `<form class="mp2-inline" data-mpform="folder"><input class="mp2-in" name="name" value="${esc(M.newF)}" placeholder="Navn på mappen" aria-label="Navn på ny mappe" autocomplete="off"><button class="mp2-btn pri" type="submit">Lag</button><button class="mp2-btn" type="button" data-mp="newfolder-x">Avbryt</button></form>` : '';
  const rows = list.slice(0, M.all ? 200 : 8).map((d, i) => `<button class="mp2-rec" data-mp="open" data-id="${esc(d.id)}"><span class="mp2-thumb" style="${thumb(d, i)}"></span>
      <span class="m-grow"><b class="m-ell">${esc(d.name)}</b><span class="m-ell">${esc([folderName(d.folderId), metaOf(d)].filter(Boolean).join(' · ') || (d.src === 'hellofresh' ? 'HelloFresh' : 'Egen rett'))}</span></span><span class="mp2-chev">›</span></button>`).join('');
  return `<div class="mp2-sec"><span>OPPSKRIFTER</span><span>${list.length} ${list.length === 1 ? 'rett' : 'retter'}</span></div>
    <div class="mp2-chips" role="group" aria-label="Mapper">${chips}</div>${nf}
    ${M.fLocal ? '<div class="mp-sub" style="padding:0 4px">Mapper kommer når serveren er oppdatert.</div>' : ''}
    <div class="mp-card mp2-list">${rows || '<div class="mp-sub" style="padding:14px 6px">Ingen retter i denne mappen ennå.</div>'}
      ${list.length > 8 ? `<button class="mp-more" data-mp="all">${M.all ? 'Vis færre' : `Vis alle ${list.length}`}</button>` : ''}</div>
    <div class="mp2-two"><label class="mp2-big pri">Skann oppskrift<input class="m-file" type="file" accept="image/*,application/pdf,.heic,.heif" multiple data-mpscan></label><a class="mp2-big" href="#/mat/import">Importer lenke</a></div>`;
}

function shopCard() {
  const shop = M.w.shopping ?? [], left = shop.filter((z) => !z.done).length;
  return `<div class="mp-card shop"><div class="mp-ch base"><div class="mp-h">Handleliste</div><span class="mp-sub">${left} igjen</span></div>
    ${(M.allShop ? shop : shop.slice(0, 10)).map((z) => `<button class="mp-shop${z.done ? ' done' : ''}" data-mp="shop" data-id="${esc(z.id)}" role="checkbox" aria-checked="${!!z.done}"><span class="mp-ck">${z.done ? '✓' : ''}</span><span class="m-grow">${esc(z.text)}</span></button>`).join('') || '<div class="mp-sub" style="padding:10px 0 12px">Tom. Åpne en rett og trykk «Legg i handlelisten».</div>'}
    ${shop.length > 10 ? `<button class="mp-more" data-mp="allshop">${M.allShop ? 'Vis færre' : `Vis alle ${shop.length} varer`}</button>` : ''}</div>`;
}

function recipe(id) {
  const w = M.w;
  if (!w) return `<div class="mat mat2">${back('#/mat', 'Mat')}<div class="mp-card mp-empty"><div class="m-spin"></div></div></div>`;
  const d = dishById(id);
  if (!d) return `<div class="mat mat2">${back('#/mat', 'Mat')}<div class="mp-card mp-empty">Fant ikke retten.</div></div>`;
  const ing = ingOf(d), steps = stepsOf(d), ck = M.checked[id] ?? {}, fixed = d.fixedDays ?? [];
  const shop = new Set((w.shopping ?? []).map((z) => String(z.text).toLowerCase())), allIn = ing.length > 0 && ing.every((n) => shop.has(String(n).toLowerCase()));
  const links = d.links ?? [];
  const opts = [['', 'Ingen mappe'], ...(M.folders ?? []).filter((f) => f.id).map((f) => [f.id, f.name])];
  return `<div class="mat mat2">${back('#/mat', 'Mat')}
    ${d.image ? `<div class="mp2-hero" style="background-image:url('${esc(d.image)}')"></div>` : ''}
    <div><h1 class="mp2-rname">${esc(d.name)}</h1><div class="mp2-rmeta">${esc(metaOf(d) || (d.src === 'hellofresh' ? 'HelloFresh' : 'Egen rett'))}${d.sourceUrl ? ` · <a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">Original oppskrift ↗</a>` : ''}</div></div>
    ${M.fLocal ? '' : `<label class="mp-card pad mp2-frow"><span class="mp2-lab">MAPPE</span><select class="mp2-sel" data-mpfolder="${esc(id)}" aria-label="Mappe">${opts.map(([v, n]) => `<option value="${esc(v)}" ${(d.folderId ?? '') === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`}
    <div class="mp-card pad"><div class="mp2-lab">ALLTID PÅ</div><div class="mp-sub">${fixed.length ? `${esc(d.name)} legges på hver ${fixed.map((i) => DN[i].toLowerCase()).join(', ')}. AI og ny uke endrer ikke faste dager.` : `Velg dagene ${esc(d.name)} alltid skal stå på.`}</div>
      <div class="mp-days" role="group" aria-label="Alltid på" style="margin-top:6px">${AB2.map((ab, i) => { const on = fixed.includes(i), other = (w.fixed ?? []).find((f) => f.index === i && f.dishId !== d.id); return `<button class="mp-day" data-mp="always" data-id="${esc(id)}" data-wd="${i}" aria-pressed="${on}" aria-selected="${on}" title="${other && !on ? `Erstatter ${esc(other.name)}` : ''}">${ab}${other && !on ? '·' : ''}</button>`; }).join('')}</div></div>
    <div class="mp-card pad"><div class="mp-ch base" style="padding:0"><div class="mp2-lab">LENKER OG FILER</div><span class="mp-sub">${links.length || ''}</span></div>
      ${links.map((l) => { const k = KIND[kindOf(l)]; const href = l.fileUrl || l.url; return `<div class="mp2-link"><span class="mp2-kind" style="background:${k[1]}">${k[0]}</span><a class="m-grow m-ell" href="${esc(href)}" target="_blank" rel="noopener">${esc(l.title || l.url || 'Fil')}<small>${k[2]}</small></a><button class="mini" data-mp="dellink" data-id="${esc(id)}" data-lid="${esc(l.id)}" aria-label="Fjern ${esc(l.title || 'lenken')}">×</button></div>`; }).join('')}
      ${M.link?.id === id ? `<form class="mp2-col" data-mpform="link" data-id="${esc(id)}"><input class="mp2-in" name="title" value="${esc(M.link.title)}" placeholder="Tittel, f.eks. Pizzadeig-kalkulator" aria-label="Tittel"><input class="mp2-in" name="url" value="${esc(M.link.url)}" placeholder="https://" inputmode="url" aria-label="Adresse"><div class="mp2-two"><button class="mp2-btn pri" type="submit">Lagre lenke</button><button class="mp2-btn" type="button" data-mp="link-x">Avbryt</button></div></form>`
        : `<div class="mp2-two"><button class="mp2-btn" data-mp="link" data-id="${esc(id)}">+ Lenke</button><label class="mp2-btn">+ Fil<input class="m-file" type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,image/*" data-mpfile="${esc(id)}"></label></div>`}</div>
    <div class="mp-card"><div class="mp-ch"><div><div class="mp-h">Ingredienser</div><div class="mp-sub">${ing.length} ${ing.length === 1 ? 'ingrediens' : 'ingredienser'}</div></div><button class="mp-soft" data-mp="toshop" data-id="${esc(id)}">${allIn ? '✓ I listen' : 'Legg i handlelisten'}</button></div>
      ${ing.map((n, i) => `<button class="mp2-ing${ck[i] ? ' on' : ''}" data-mp="ck" data-id="${esc(id)}" data-i="${i}" role="checkbox" aria-checked="${!!ck[i]}"><span class="mp2-box">${ck[i] ? '✓' : ''}</span><span class="m-grow">${esc(n)}</span></button>`).join('') || '<div class="mp-sub" style="padding:14px 6px">Ingen ingredienser lagt inn for denne retten.</div>'}</div>
    ${steps.length ? `<div class="mp-card pad"><div class="mp2-lab">SLIK GJØR DU</div>${steps.map((t, i) => `<div class="mp2-rstep"><span>${i + 1}</span><p>${esc(t)}</p></div>`).join('')}</div>` : ''}
  </div>`;
}

function importView() {
  const I = M.imp, p = I.prev;
  const opts = [['', 'Ingen mappe'], ...(M.folders ?? []).filter((f) => f.id).map((f) => [f.id, f.name])];
  const sug = p?.folderSuggestion ? (M.folders ?? []).find((f) => f.id === p.folderSuggestion || f.name === p.folderSuggestion)?.id ?? '' : '';
  const fid = I.folderId || sug;
  const how = { jsonld: 'Lest fra oppskriftsdata (JSON-LD)', microdata: 'Lest fra microdata', ai: '✦ Lest av AI' }[p?.method] ?? '';
  return `<div class="mat mat2">${back('#/mat', 'Mat')}
    <div><div class="mp2-lab">IMPORTER FRA NETTSIDE</div><h1 class="mp2-h1" style="font-size:40px">Ny oppskrift</h1><div class="mp-sub">Lim inn lenken til en oppskrift. Bildet, ingrediensene og stegene hentes og lagres lokalt.</div></div>
    <form class="mp-card pad mp2-col" data-mpform="import"><input class="mp2-in" name="url" value="${esc(I.url)}" placeholder="https://www.matprat.no/oppskrifter/…" inputmode="url" aria-label="Lenke til oppskriften" autocomplete="off">
      <button class="mp2-btn pri" type="submit" ${I.busy ? 'disabled' : ''}>${I.busy ? 'Henter …' : 'Hent oppskriften'}</button>${I.err ? `<div class="mp2-errt">${esc(I.err)}</div>` : ''}</form>
    ${p ? `<div class="mp-card pad">
      ${p.image ? `<div class="mp2-hero sm" style="background-image:url('${esc(p.image)}')"></div>` : ''}
      <div class="mp2-rname" style="font-size:30px">${esc(p.name || 'Uten navn')}</div>
      <div class="mp2-kpis"><div><b>${esc(p.time ? String(p.time) : '–')}</b><span>Tid</span></div><div><b>${esc(p.servings ? String(p.servings) : '–')}</b><span>Porsjoner</span></div><div><b>${(p.ingredients ?? []).length}</b><span>Ingredienser</span></div><div><b>${(p.steps ?? []).length}</b><span>Steg</span></div></div>
      ${how ? `<div class="mp-sub">${how}</div>` : ''}
      ${M.fLocal ? '' : `<label class="mp2-frow"><span class="mp2-lab">MAPPE</span><select class="mp2-sel" data-mpimpf aria-label="Mappe">${opts.map(([v, n]) => `<option value="${esc(v)}" ${fid === v ? 'selected' : ''}>${esc(n)}${v && v === sug ? ' ✦' : ''}</option>`).join('')}</select></label>`}
      <button class="mp2-btn pri" data-mp="impsave" ${I.busy ? 'disabled' : ''}>Lagre i Mat</button></div>` : ''}
  </div>`;
}

/* ---------- Handlinger ---------- */

async function scanFiles(files) {
  if (!files?.length) return;
  let ok = 0;
  for (const f of files) {
    const fd = new FormData(); fd.append('file', f, f.name || 'oppskrift.jpg');
    try { const r = await fetch('/mat/api/recipes/scan', { method: 'POST', body: fd }); if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.error || (r.status === 404 ? 'Serveren støtter ikke skanning av oppskrifter ennå' : `Mat svarte ${r.status}`)); } ok++; }
    catch (err) { flash(err.message); }
  }
  if (ok) { flash(`${ok === 1 ? 'Oppskriften' : `${ok} oppskrifter`} leses i bakgrunnen`); await matLoad().catch(() => {}); draw(); }
}

export async function matBind(e, t) {
  if (m.screen !== 'mat') return false;
  if (e.type === 'change') {
    if (t.matches?.('[data-mpscan]')) { const f = [...t.files]; t.value = ''; await scanFiles(f); return true; }
    if (t.matches?.('[data-mpfile]')) {
      const f = t.files?.[0], id = t.dataset.mpfile; t.value = '';
      if (!f) return true;
      const fd = new FormData(); fd.append('file', f, f.name); fd.append('title', f.name.replace(/\.[^.]+$/, ''));
      try { const r = await fetch(`/mat/api/dishes/${encodeURIComponent(id)}/links`, { method: 'POST', body: fd }); if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.error || (r.status === 404 ? 'Serveren støtter ikke filer på retter ennå' : `Mat svarte ${r.status}`)); } flash('Filen er lagt til'); await matLoad(); }
      catch (err) { flash(err.message); }
      draw(); return true;
    }
    if (t.matches?.('[data-mpfolder]')) {
      const id = t.dataset.mpfolder;
      try { await matApi(`/dishes/${encodeURIComponent(id)}`, { method: 'PATCH', json: { folderId: t.value || null } }); await matLoad(); flash('Mappe lagret'); } catch (err) { flash(err.message); }
      draw(); return true;
    }
    if (t.matches?.('[data-mpimpf]')) { M.imp.folderId = t.value; return true; }
    return false;
  }
  if (e.type === 'input') {
    const f = t.closest?.('[data-mpform]');
    if (!f) return false;
    const k = f.dataset.mpform;
    if (k === 'import' && t.name === 'url') M.imp.url = t.value;
    if (k === 'folder') M.newF = t.value;
    if (k === 'link' && M.link) M.link[t.name] = t.value;
    return true;
  }
  if (e.type === 'submit') {
    const f = t.closest?.('[data-mpform]');
    if (!f) return false;
    e.preventDefault();
    const k = f.dataset.mpform, fd = new FormData(f);
    if (k === 'import') {
      const url = String(fd.get('url') || '').trim();
      if (!url) { M.imp.err = 'Lim inn en lenke først.'; draw(); return true; }
      M.imp = { ...M.imp, url, busy: true, err: '', prev: null, folderId: '' }; draw();
      try { M.imp.prev = await matApi('/recipes/import', { method: 'POST', json: { url } }); }
      catch (err) { M.imp.err = /404/.test(err.message) ? 'Serveren støtter ikke import fra nettsider ennå.' : err.message; }
      M.imp.busy = false; draw(); return true;
    }
    if (k === 'folder') {
      const name = String(fd.get('name') || '').trim();
      if (!name) return true;
      try { await matApi('/folders', { method: 'POST', json: { name } }); M.newF = null; await matLoad(); flash(`Mappen ${name} er laget`); } catch (err) { flash(err.message); }
      draw(); return true;
    }
    if (k === 'link') {
      const id = f.dataset.id, title = String(fd.get('title') || '').trim(), raw = String(fd.get('url') || '').trim();
      if (!raw) { flash('Skriv inn en adresse'); return true; }
      const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      try { await matApi(`/dishes/${encodeURIComponent(id)}/links`, { method: 'POST', json: { title: title || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url } }); M.link = null; await matLoad(); flash('Lenken er lagt til'); }
      catch (err) { flash(/404/.test(err.message) ? 'Serveren støtter ikke lenker på retter ennå' : err.message); }
      draw(); return true;
    }
    return false;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-mp]');
  if (!x) return false;
  if (x.tagName !== 'LABEL') e.preventDefault();
  const k = x.dataset.mp, w = M.w, id = x.dataset.id;
  if (k === 'open' && id) { location.hash = `#/mat/r/${encodeURIComponent(id)}`; return true; }
  if (k === 'day') { M.sel = +x.dataset.i; flash('Ingen rett denne dagen. Trykk ✦ Ny uke eller velg en rett på web.'); return true; }
  if (k === 'step') { e.stopPropagation(); const n = stepsOf(dishById(id)).length; M.step[id] = ((M.step[id] ?? 0) + 1) % Math.max(1, n); draw(); return true; }
  if (k === 'folder') { M.folder = x.dataset.f; M.all = false; draw(); return true; }
  if (k === 'newfolder') { if (M.fLocal) { flash('Mapper kommer når serveren er oppdatert'); return true; } M.newF = ''; draw(); document.querySelector('[data-mpform=folder] input')?.focus(); return true; }
  if (k === 'newfolder-x') { M.newF = null; draw(); return true; }
  if (k === 'all') { M.all = !M.all; draw(); return true; }
  if (k === 'allshop') { M.allShop = !M.allShop; draw(); return true; }
  if (k === 'ck') { const c = (M.checked[id] ??= {}); c[x.dataset.i] = !c[x.dataset.i]; draw(); return true; }
  if (k === 'link') { M.link = { id, title: '', url: '' }; draw(); document.querySelector('[data-mpform=link] input')?.focus(); return true; }
  if (k === 'link-x') { M.link = null; draw(); return true; }
  if (k === 'dellink') {
    try { await matApi(`/dishes/${encodeURIComponent(id)}/links/${encodeURIComponent(x.dataset.lid)}`, { method: 'DELETE' }); await matLoad(); flash('Lenken er fjernet'); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (k === 'impsave') {
    const p = M.imp.prev; if (!p) return true;
    const sel = document.querySelector('[data-mpimpf]'), folderId = sel ? sel.value || null : null;
    M.imp.busy = true; draw();
    try {
      const r = await matApi('/recipes/import/save', { method: 'POST', json: { preview: p, folderId } });
      M.imp = { url: '', busy: false, prev: null, err: '', folderId: '' };
      await matLoad(); flash(`${p.name || 'Oppskriften'} er lagret`);
      const nid = r?.id ?? r?.dish?.id;
      location.hash = nid ? `#/mat/r/${encodeURIComponent(nid)}` : '#/mat';
    } catch (err) { M.imp.busy = false; M.imp.err = err.message; draw(); }
    return true;
  }
  if (k === 'always') {
    const dish = dishById(id); if (!dish) return true;
    const i = +x.dataset.wd, cur = dish.fixedDays ?? [], days = cur.includes(i) ? cur.filter((y) => y !== i) : [...cur, i];
    try { const r = await matApi(`/dishes/${encodeURIComponent(dish.id)}/fixed`, { method: 'PUT', json: { days, start: w.start } }); if (r?.days) M.w = r; flash(r?.status ?? 'Lagret'); }
    catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (k === 'shop') { await matApi(`/shopping/${encodeURIComponent(x.dataset.id)}/toggle`, { method: 'POST', json: { start: w?.start } }); await matLoad(); draw(); return true; }
  if (k === 'toshop') {
    const dish = dishById(id), have = new Set((w?.shopping ?? []).map((z) => String(z.text).toLowerCase()));
    const add = ingOf(dish).filter((n) => !have.has(String(n).toLowerCase()));
    for (const text of add) await matApi('/shopping', { method: 'POST', json: { text, start: w.start } });
    await matLoad(); flash(add.length ? `${add.length} lagt i handlelisten` : 'Alt ligger allerede i handlelisten'); return true;
  }
  if (k === 'week') {
    M.busy = true; draw(); flash('Lager ny uke …');
    try {
      const r = await matApi('/plan', { method: 'POST', json: { scope: 'week', date: w?.start ?? today() } });
      if (r?.days) M.w = r; else await matLoad();
      flash(r?.status ?? 'Ny uke laget. Faste dager er beholdt.');
    } catch (err) { flash(err.message); }
    M.busy = false; draw(); return true;
  }
  return false;
}

/** Tittel i Papir-fotovinduet for undersidene (oppskrift og import). */
export const matTitle = () => { const sub = m.sub || ''; if (sub === 'import') return ['Ny oppskrift', 'Importer fra nettside']; if (sub.startsWith('r/')) { const d = dishById(decodeURIComponent(sub.slice(2))); return d ? [d.name, folderName(d.folderId) || 'Oppskrift'] : null; } return null; };
/** For Papir-hjem og widgets: dagens rett og navnet på kokken. */
export const matToday = () => { const d = (M.w?.days ?? []).find((x) => x.today || x.date === today()); return d ? { name: d.name, cook: d.cook, week: M.w.week } : null; };
export { meName };

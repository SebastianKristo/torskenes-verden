// FinansHub v2-moduler i sidemenyen: Subscription OS, Delte mapper, Finn-handler og Import.
// Samme mønster som desktop.js: sidene tegnes fra S, hendelser fanges med delegering (data-m*-attributter).
import { S, api, esc, n0, n2, sgn, dd, today, render, toast, loadBoot, accs, logo, aiLine, ICONS, parseAmount } from './core.js';

Object.assign(ICONS, {
  sub: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  dir: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 14a2 2 0 1 0 0-.01M15 14a2 2 0 1 0 0-.01',
  finn: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  imp: 'M12 3v12M7 10l5 5 5-5M4 21h16',
});

export const MODULE_PAGES = [['sub', 'Subscription OS'], ['dir', 'Delte mapper'], ['finn', 'Finn-handler'], ['imp', 'Import']];
export const MODULE_SUB = { sub: 'Abonnementer', dir: 'Felles utgifter med andre', finn: 'Trygg betaling, Fiks ferdig, Tillit', imp: 'CSV, XLSX og tekst' };
const u = S.ui;
const card = (inner, style = '') => `<section class="card" style="${style}">${inner}</section>`;
const skel = (h = 160) => `<div class="skel" style="min-height:${h}px"></div>`;
const kr0 = (v) => `${n0(v)} kr`;
const modes = (key, cur) => `<div class="mod-modes">${[['new', key === 'dir' ? 'Ny utgift' : 'Nytt abonnement'], ['rc', 'Kvittering'], ['tx', 'Fra transaksjoner']]
  .map(([m, n]) => `<button class="mod-mode" data-mmode="${key}:${m}" aria-pressed="${cur === m}">${n}</button>`).join('')}</div>`;
const dropRc = (target) => `<label class="mod-drop"><b>Last opp kvitteringer</b><span>Flere filer · AI leser butikk, dato og beløp i bakgrunnen</span><input type="file" multiple accept="image/*,application/pdf" data-mrc="${target}" hidden></label>`;
const txPick = (target) => S.recentOut ? `<div class="mod-txs">${S.recentOut.map((t) => `<button data-mtx="${target}:${t.id}">${logo(t, 26, 7)}<span class="grow"><span>${esc(t.description)} <span class="muted">· ${dd(t.date)}</span></span>${aiLine(t.aiShort, 'd-ai')}</span><span class="mono">${n2(Math.abs(t.amount))} kr</span><span class="acc-l">+</span></button>`).join('') || '<div class="note" style="padding:12px">Ingen utgifter ennå.</div>'}</div>` : skel(120);

/* ===================== Subscription OS ===================== */

function subPage() {
  const d = S.subs;
  if (!d) return skel(400);
  const mode = u.subMode ?? 'new';
  const rows = d.items.map((s) => {
    const off = !s.active;
    const [btn, bg, fg] = off ? ['Sagt opp', '#1B1B20', 'var(--muted)'] : s.lowUse ? ['Si opp', 'rgba(255,122,61,.15)', 'var(--acc-l)'] : ['Aktiv', 'transparent', 'var(--sub)'];
    return `<div class="sub-row${off ? ' off' : ''}">${logo({ ...s, description: s.name, color: '#A0A0AA' }, 32, 9)}
      <span class="ell-wrap"><b style="font-weight:500;display:block">${esc(s.name)}</b><span class="note" style="font-size:12px">${esc(s.plan || (s.cycle === 'yearly' ? 'Årlig' : 'Månedlig'))}</span>${aiLine(s.aiShort, 'd-ai')}</span>
      <span class="sub">${s.nextDate ? 'Neste trekk ' + dd(s.nextDate) : '–'}</span>
      <span style="color:${s.lowUse && !off ? 'var(--acc-l)' : 'var(--sub)'}">${esc(s.usageNote || '–')}</span>
      <b class="mono" style="text-align:right">${n0(s.price)} kr${s.cycle === 'yearly' ? '<small class="muted"> /år</small>' : ''}</b>
      <span class="sub-btns"><button class="mod-tog" style="background:${bg};color:${fg}" data-msub-tog="${s.id}" title="${off ? 'Aktiver igjen' : s.lowUse ? 'Marker som sagt opp' : 'Marker som sagt opp'}">${btn}</button><button class="x-btn sm" data-msub-low="${s.id}" title="${s.lowUse ? 'Fjern «lite brukt»' : 'Marker som lite brukt'}">${s.lowUse ? '◐' : '○'}</button><button class="x-btn sm" data-msub-del="${s.id}" aria-label="Slett">×</button></span></div>`;
  }).join('');
  return `<div class="mod">
    <div class="mod-kpis">
      ${card(`<div class="sub">Per måned</div><b class="mono mod-big">${kr0(d.monthly)}</b>`, 'padding:18px')}
      ${card(`<div class="sub">Per år</div><b class="mono mod-big">${kr0(d.yearly)}</b>`, 'padding:18px')}
      <section class="card acc-card" style="padding:18px"><div class="acc-l">Lite brukt, kan sies opp</div><b class="mono mod-big">${n0(d.lowUse)} kr/mnd</b></section>
    </div>
    <div class="mod-box"><b>Legg til abonnement</b>${modes('sub', mode)}
      ${mode === 'new' ? `<form class="mod-grid" data-mform="sub"><input class="inp" name="name" placeholder="Tjeneste, f.eks. Disney+" required><input class="inp" name="plan" placeholder="Plan"><input class="inp" name="price" placeholder="kr/mnd" inputmode="decimal" required><input class="inp" name="nextDate" placeholder="Neste trekk dd.mm"><button class="btn pri">Legg til</button></form>`
        : mode === 'rc' ? dropRc('sub') : txPick('sub')}
    </div>
    ${card(rows || '<div class="empty">Ingen abonnementer ennå. Legg til ett over, eller fra en transaksjon.</div>', 'padding:0;gap:0;overflow:hidden')}
  </div>`;
}

/* ===================== Delte mapper ===================== */

function dirPage() {
  const list = S.folders;
  if (!list) return skel(400);
  const cur = S.folder;
  const mode = u.dirMode ?? 'new';
  const cards = list.map((f) => `<button class="dir-card${cur?.id === f.id ? ' on' : ''}" data-mdir="${f.id}"><b>${esc(f.name)}</b><span><span>${f.members.length} medlem${f.members.length === 1 ? '' : 'mer'}</span><span class="mono">${kr0(f.total)}</span></span></button>`).join('');
  const create = `<form class="dir-new" data-mform="folder"><b>Ny delt mappe</b><input class="inp" name="name" placeholder="Navn, f.eks. Hytta" required><input class="inp" name="members" placeholder="Medlemmer: navn eller e-post, kommaseparert"><button class="btn pri">Opprett mappe</button></form>`;
  let right;
  if (!cur) right = card('<div class="empty">Opprett en delt mappe for felles utgifter, f.eks. hytta eller husholdningen.</div>', 'padding:22px');
  else {
    const names = cur.members.map((m) => m.name);
    const invited = cur.members.filter((m) => m.status === 'invited');
    right = card(`<div class="card-h" style="align-items:flex-start;flex-wrap:wrap;gap:12px"><div><b style="font-size:22px;font-weight:600">${esc(cur.name)}</b><div class="note" style="font-size:13px">${esc(names.join(', '))}</div></div><b class="mono" style="font-size:26px">${kr0(cur.total)}</b></div>
      <div class="dir-bal">${cur.balances.map((b) => `<span>${esc(b.name)} <b class="mono" style="color:${b.balance >= 0 ? 'var(--pos)' : 'var(--acc-l)'}">${b.balance >= 0 ? '+' : '−'}${n0(Math.abs(b.balance))} kr</b></span>`).join('')}</div>
      ${invited.length ? `<div class="note" style="font-size:12.5px">Invitert: ${esc(invited.map((m) => m.email).join(', '))}. E-postutsending er ikke satt opp ennå – del mappen ved å legge inn utgiftene deres her.</div>` : ''}
      <div class="mod-box"><b>Legg til i mappen</b>${modes('dir', mode)}
        ${mode === 'new' ? `<form class="mod-grid" data-mform="entry"><input class="inp" name="description" placeholder="Beskrivelse" required><input class="inp" name="amount" placeholder="Beløp" inputmode="decimal" required><select class="inp" name="paidBy">${names.map((n) => `<option>${esc(n)}</option>`).join('')}</select><button class="btn pri">Legg til</button></form>`
          : mode === 'rc' ? dropRc('folder') : txPick('folder')}
      </div>
      <div class="dir-rows">${cur.entries.map((e) => `<div class="dir-row">${logo({ ...e, color: '#A0A0AA' }, 28, 8)}<span class="ell-wrap"><span style="display:block">${esc(e.description)}</span><span class="note" style="font-size:12px">${dd(e.date)} · betalt av ${esc(e.paidBy)}</span>${aiLine(e.aiShort, 'd-ai')}</span><span class="note" style="font-size:13px">${esc(e.split)}</span><b class="mono" style="text-align:right">${n2(e.amount)} kr</b><button class="x-btn sm" data-mentry-del="${e.id}" aria-label="Fjern">×</button></div>`).join('')
        || '<div class="note" style="padding:18px 0">Ingen utgifter ennå. Flytt transaksjoner hit fra «Fra transaksjoner» eller mobilappen.</div>'}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><form class="mod-inline" data-mform="invite"><input class="inp" name="emails" placeholder="Legg til medlem (navn eller e-post)"><button class="btn sm">Legg til</button></form><button class="btn sm danger" data-mact="del-folder">Slett mappe</button></div>`, 'padding:22px;gap:16px');
  }
  return `<div class="dir-layout"><div class="dir-left">${cards}${create}</div>${right}</div>`;
}

/* ===================== Finn-handler ===================== */

function finnPage() {
  const d = S.finn;
  if (!d) return skel(400);
  const rows = d.items.map((r) => {
    const sold = r.role === 'sold';
    return `<div class="card finn-row"><div><span class="role ${sold ? 'sold' : 'bought'}">${sold ? 'Solgt' : 'Kjøpt'}</span><b style="display:block;font-weight:500;margin-top:6px">${esc(r.item)}</b><span class="note" style="font-size:12px">${esc(r.counterpart)}${r.counterpart ? ' · ' : ''}${dd(r.date)}${r.txId ? ' · matchet mot bankpost' : ''}</span></div>
      <div class="finn-steps">${r.steps.map((s, i) => `<button class="step${s.done ? ' done' : ''}" data-mfinn-step="${r.id}:${i}" title="Marker som ${s.done ? 'ikke fullført' : 'fullført'}">${esc(s.t)}</button>`).join('')}</div>
      <b class="mono" style="text-align:right;color:${sold ? 'var(--pos)' : 'var(--text)'}">${sold ? '+' : '−'}${n0(r.amount)} kr</b><button class="x-btn sm" data-mfinn-del="${r.id}" aria-label="Slett">×</button></div>`;
  }).join('');
  return `<div class="mod">
    <div class="mod-kpis">${[['Kjøpt i år', kr0(d.bought)], ['Solgt i år', kr0(d.sold)], ['Pågående handler', String(d.ongoing)]].map(([l, v]) => card(`<div class="sub">${l}</div><b class="mono" style="font-size:24px">${v}</b>`, 'padding:18px')).join('')}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${rows || card('<div class="empty">Ingen Finn-handler ennå.</div>')}</div>
    <form class="mod-box" data-mform="finn"><b>Legg til fra e-post</b><span class="note" style="font-size:13px">Lim inn en e-post fra Finn (Trygg betaling, Fiks ferdig eller Tillit). AI trekker ut gjenstand, motpart, beløp og status, og matcher mot bankposten.</span>
      <textarea class="inp mod-ta" name="email" rows="5" placeholder="Lim inn e-posten her …" required></textarea><div><button class="btn pri">Les e-posten</button></div></form>
    <div class="note" style="font-size:13px">Kilde: e-postkvitteringer fra Finn (Trygg betaling, Fiks ferdig-frakt, Tillit forsikring) leses av AI og matches mot bankposter. ${d.imap.configured ? 'IMAP er konfigurert; automatisk henting kommer i en senere versjon.' : 'Automatisk henting via IMAP settes opp i Innstillinger → Bank og import (kommer).'}</div>
  </div>`;
}

/* ===================== Import ===================== */

function impPage() {
  const im = S.imp ?? (S.imp = { rows: [], status: 'Lim inn tekst eller velg filer. Flere filer kan velges samtidig.', text: '' });
  const n = im.rows.filter((r) => !r.duplicate).length;
  const accOptions = accs().map((a) => `<option value="${a.id}"${String(a.id) === String(u.impAcc ?? '') ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  return `<div class="mod">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="btn pri" style="cursor:pointer">Velg filer (.xlsx, .csv, .txt)<input type="file" multiple accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-mimp hidden></label>
      <select class="sel" data-mimp-acc aria-label="Konto">${accOptions}</select><span class="note" style="font-size:13px">${esc(im.status)}</span></div>
    <textarea class="inp mod-ta mono" data-mimp-text rows="6" placeholder="Dato&#9;Forklaring&#9;Rentedato&#9;Ut&#9;Inn&#10;10/14/26&#9;Visa 100021 Ruterappen&#9;10/15/26&#9;238.00">${esc(im.text)}</textarea>
    ${im.rows.length ? card(im.rows.map((r) => `<div class="imp-row${r.duplicate ? ' dup' : ''}">${logo({ description: r.description, domain: r.domain, color: '#A0A0AA' }, 28, 8)}<span class="mono note" style="font-size:12px">${dd(r.date)}</span>
      <span class="ell-wrap"><span style="display:block">${esc(r.description)}</span>${aiLine(r.aiShort, 'd-ai')}<span class="muted ell" style="font-size:12px;display:block">${esc(r.raw)}</span></span>
      <span class="note" style="font-size:13px">${r.duplicate ? 'Finnes fra før' : esc(r.category ?? 'AI kategoriserer')}</span><b class="mono" style="text-align:right;color:${r.amount > 0 ? 'var(--pos)' : 'var(--text)'}">${sgn(r.amount)}</b></div>`).join(''), 'padding:0;gap:0;overflow:hidden') : ''}
    <div style="display:flex;justify-content:flex-end"><button class="btn" style="background:var(--text);color:var(--bg)" data-mact="imp-commit" ${n ? '' : 'disabled'}>Importer ${n} poster</button></div>
  </div>`;
}

export const MODULE_FN = { sub: subPage, dir: dirPage, finn: finnPage, imp: impPage };

/* ===================== Lasting ===================== */

const loadRecentOut = async () => { S.recentOut = (await api('/transactions?type=ut&limit=40')).items; };
const loadSubs = async () => { S.subs = await api('/subscriptions'); };
async function loadFolders() {
  S.folders = await api('/folders');
  const id = u.dir && S.folders.some((f) => f.id === u.dir) ? u.dir : S.folders[0]?.id;
  u.dir = id;
  S.folder = id ? await api(`/folders/${id}`) : null;
}
const loadFinn = async () => { S.finn = await api('/finn'); };
export const MODULE_LOADERS = { sub: [loadSubs, loadRecentOut], dir: [loadFolders, loadRecentOut], finn: [loadFinn], imp: [] };

/* ===================== Hendelser ===================== */

let impFiles = [];
async function preview(commit = false) {
  const im = S.imp;
  const fd = new FormData();
  for (const f of impFiles) fd.append('files', f);
  if (im.text.trim()) fd.append('text', im.text);
  if (u.impAcc) fd.append('accountId', u.impAcc);
  if (!impFiles.length && !im.text.trim()) { im.rows = []; im.status = 'Lim inn tekst eller velg filer.'; return render(); }
  try {
    const r = await api(`/import${commit ? '?commit=1' : ''}`, { method: 'POST', body: fd });
    im.rows = r.rows;
    const files = impFiles.length ? `${impFiles.length} fil${impFiles.length === 1 ? '' : 'er'} · ` : '';
    im.status = commit ? `${r.imported} poster importert · ${r.duplicates} duplikater hoppet over · AI kategoriserer og beskriver i bakgrunnen`
      : `${files}${r.rows.length} rader lest${r.skipped ? ` · ${r.skipped} rader hoppet over` : ''}${r.errors?.length ? ' · ' + r.errors.join('; ') : ''}`;
    if (commit) { toast(`${r.imported} poster importert`); impFiles = []; im.text = ''; im.rows = []; await loadBoot(); }
  } catch (e) { im.status = e.message; im.rows = []; }
  render();
}

async function uploadTo(target, files) {
  const fd = new FormData();
  for (const f of files) fd.append('file', f);
  const path = target === 'sub' ? '/subscriptions/receipts' : `/folders/${u.dir}/receipts`;
  const r = await api(path, { method: 'POST', body: fd });
  toast(`${r.jobs.length} kvittering${r.jobs.length === 1 ? '' : 'er'} leses i bakgrunnen`);
  // Følg med til AI-en er ferdig, så havner kvitteringen i listen.
  const poll = async (n) => { if (n > 30 || !['sub', 'dir'].includes(u.page)) return; await reload(); if (!(await api('/receipts/jobs')).some((j) => r.jobs.some((x) => x.id === j.id) && ['pending', 'processing'].includes(j.status))) return; setTimeout(() => poll(n + 1), 2500); };
  setTimeout(() => poll(0), 2500);
}
async function reload() { await Promise.all((MODULE_LOADERS[u.page] ?? []).map((f) => f())); render(); }

export function bindModules(el) {
  const wrap = (fn) => async (e) => { try { await fn(e); } catch (err) { toast(err.message); } };
  el.addEventListener('click', wrap(async (e) => {
    const t = e.target, d = (s) => t.closest(s);
    let x;
    if ((x = d('[data-mmode]'))) { const [k, m] = x.dataset.mmode.split(':'); u[k === 'sub' ? 'subMode' : 'dirMode'] = m; return render(); }
    if ((x = d('[data-mtx]'))) {
      const [k, id] = x.dataset.mtx.split(':');
      if (k === 'sub') { const s = await api('/subscriptions', { method: 'POST', json: { fromTx: +id } }); toast(`${s.name} lagt til som abonnement`); }
      else { S.folder = await api(`/folders/${u.dir}/entries`, { method: 'POST', json: { txId: +id } }); toast(`Flyttet til ${S.folder.name}`); }
      return reload();
    }
    if ((x = d('[data-msub-tog]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubTog); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { active: !s.active } }); return reload(); }
    if ((x = d('[data-msub-low]'))) { const s = S.subs.items.find((y) => y.id === +x.dataset.msubLow); await api(`/subscriptions/${s.id}`, { method: 'PATCH', json: { lowUse: !s.lowUse } }); return reload(); }
    if ((x = d('[data-msub-del]'))) { if (!confirm('Slette abonnementet?')) return; await api(`/subscriptions/${x.dataset.msubDel}`, { method: 'DELETE' }); return reload(); }
    if ((x = d('[data-mdir]'))) { u.dir = +x.dataset.mdir; S.folder = await api(`/folders/${u.dir}`); return render(); }
    if ((x = d('[data-mentry-del]'))) { await api(`/folders/${u.dir}/entries/${x.dataset.mentryDel}`, { method: 'DELETE' }); return reload(); }
    if ((x = d('[data-mfinn-step]'))) {
      const [id, i] = x.dataset.mfinnStep.split(':').map(Number);
      const r = S.finn.items.find((y) => y.id === id);
      await api(`/finn/${id}`, { method: 'PATCH', json: { steps: r.steps.map((s, k2) => (k2 === i ? { ...s, done: !s.done } : s)) } });
      return reload();
    }
    if ((x = d('[data-mfinn-del]'))) { if (!confirm('Slette handelen?')) return; await api(`/finn/${x.dataset.mfinnDel}`, { method: 'DELETE' }); return reload(); }
    switch (d('[data-mact]')?.dataset.mact) {
      case 'del-folder': if (!confirm(`Slette mappen «${S.folder.name}»? Transaksjonene beholdes.`)) return; await api(`/folders/${u.dir}`, { method: 'DELETE' }); u.dir = null; return reload();
      case 'imp-commit': return preview(true);
    }
  }));
  el.addEventListener('change', wrap(async (e) => {
    const t = e.target;
    if (t.matches('[data-mrc]')) { const files = [...t.files]; t.value = ''; return uploadTo(t.dataset.mrc, files); }
    if (t.matches('[data-mimp]')) { impFiles = [...t.files]; t.value = ''; return preview(); }
    if (t.matches('[data-mimp-text]')) { S.imp.text = t.value; return preview(); }
    if (t.matches('[data-mimp-acc]')) { u.impAcc = t.value; return; }
  }));
  el.addEventListener('submit', wrap(async (e) => {
    const f = e.target.closest('[data-mform]');
    if (!f) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    switch (f.dataset.mform) {
      case 'sub': await api('/subscriptions', { method: 'POST', json: { ...v, price: parseAmount(v.price) } }); toast('Abonnement lagt til'); return reload();
      case 'folder': { const r = await api('/folders', { method: 'POST', json: v }); u.dir = r.id; toast('Mappe opprettet'); return reload(); }
      case 'entry': S.folder = await api(`/folders/${u.dir}/entries`, { method: 'POST', json: { ...v, amount: parseAmount(v.amount), date: today() } }); toast(`Lagt til i ${S.folder.name}`); return reload();
      case 'invite': if (!v.emails.trim()) return; S.folder = await api(`/folders/${u.dir}/invite`, { method: 'POST', json: v }); return reload();
      case 'finn': { const r = await api('/finn', { method: 'POST', json: v }); toast(`${r.item} lagt til`); return reload(); }
    }
  }));
  // Logoer som ikke finnes: vis forbokstaven (CSP stopper inline onerror).
  el.addEventListener('error', (e) => { const img = e.target; if (img?.tagName === 'IMG' && img.parentNode?.classList?.contains('m-logo')) { img.parentNode.classList.add('err'); img.remove(); } }, true);
}

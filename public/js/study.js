import { esc, kr, nb, api, cap, parseNum, isMobile } from './util.js';
import { store, widget, card, refresh, emit, on } from './store.js';

const STUDY_LINKS = () => [
  ['Canvas', 'https://canvas.instructure.com', 'Emner og innleveringer'], ['Notion', 'https://www.notion.so', 'Notater'],
  ['Skolens nettside', store.me.schoolUrl, 'Timeplan og info'], ['Visma InSchool', 'https://www.vismaskole.no', 'Fravær og karakterer'],
  ['NDLA', 'https://ndla.no', 'Fagstoff'], ['Lånekassen', 'https://lanekassen.no', 'Studielån og stipend'],
];
const TEST_RE = /prøve|test|eksamen|innlevering|tentamen|heldag|muntlig|fremføring/i;
let editLoan = false;

export async function loadStudy() {
  [store.grades, store.tests] = await Promise.all([api('/grades').catch(() => []), api('/tests').catch(() => [])]);
  emit('study');
}

const fmtDate = (iso) => {
  const d = new Date(iso.length === 10 ? iso + 'T12:00' : iso);
  return `${cap(d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', ''))} ${d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' })}`;
};

widget('s_links', { render() {
  if (isMobile()) return `<div class="tiles" style="grid-template-columns:repeat(3,1fr)">${STUDY_LINKS().map(([n, u]) => `<a class="tile" href="${esc(u)}" target="_blank" rel="noopener" style="border-radius:18px"><b style="font-size:20px;color:var(--blue)">${esc(n.slice(0, 2))}</b><span>${esc(n.replace('Skolens nettside', 'Skolen').replace('Visma InSchool', 'Visma'))}</span></a>`).join('')}</div>`;
  return `<div class="card-title">Lenker</div>${STUDY_LINKS().map(([n, u, d]) => `<a class="row" href="${esc(u)}" target="_blank" rel="noopener"><span>${esc(n)}</span><span class="muted" style="font-size:13px">${esc(d)} ↗</span></a>`).join('')}`;
} });

widget('s_grades', { render() {
  const g = store.grades ?? [];
  const graded = g.filter((x) => x.grade);
  const avg = graded.length ? graded.reduce((a, x) => a + x.grade, 0) / graded.length : null;
  const rows = g.map((x) => `<div class="row" data-gid="${x.id}" style="display:grid;grid-template-columns:minmax(0,1fr) ${isMobile() ? '' : '70px '}52px 24px;gap:10px">
      <div style="min-width:0"><input class="bare" data-gf="subject" value="${esc(x.subject)}" aria-label="Fag" style="font-size:15px">
        <div class="mono muted" style="font-size:12px;display:flex;gap:4px">Prøver: <input class="bare mono muted" data-gf="tests" value="${esc(x.tests)}" placeholder="4, 5, 5" aria-label="Prøvekarakterer" style="font-size:12px"></div></div>
      ${isMobile() ? '' : `<div class="bar" style="height:6px;background:var(--line)"><i style="width:${((x.grade ?? 0) / 6) * 100}%"></i></div>`}
      <select class="bare" data-gf="grade" aria-label="Karakter" style="font-size:20px;font-weight:500;text-align:right;text-align-last:right">${['', 1, 2, 3, 4, 5, 6].map((v) => `<option value="${v}"${(x.grade ?? '') === v ? ' selected' : ''}>${v || '–'}</option>`).join('')}</select>
      <button class="x" data-gdel="${x.id}" aria-label="Slett fag">×</button></div>`).join('');
  return `<div class="card-head" style="align-items:flex-end"><div class="card-title">Karakterer</div><div class="sub" style="font-size:14px">Snitt <b style="font-size:28px;font-weight:300;color:var(--text)">${avg ? nb(avg, 1) : '–'}</b></div></div>
    ${rows}<button class="btn" data-gadd style="align-self:flex-start">+ Legg til fag</button>`;
} });

function allTests() {
  const today = new Date().toLocaleDateString('sv-SE');
  const fromIcal = (store.data.school?.events ?? []).filter((e) => TEST_RE.test(e.title) && e.start.slice(0, 10) >= today)
    .map((e) => ({ date: e.start, title: e.title, note: e.location || 'Fra iCal', ical: true }));
  const manual = (store.tests ?? []).filter((t) => t.date >= today);
  return [...fromIcal, ...manual].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

widget('s_tests', { render() {
  const list = allTests().map((t) => `<div class="row" style="display:grid;grid-template-columns:80px minmax(0,1fr) auto;gap:12px;padding:12px 14px">
      <span class="mono" style="font-size:13px;color:var(--blue)">${fmtDate(t.date)}</span>
      <div><div style="font-size:15px">${esc(t.title)}</div><div class="muted" style="font-size:12px">${esc(t.note)}</div></div>
      ${t.ical ? '' : `<button class="x" data-tdel="${t.id}" aria-label="Slett prøve">×</button>`}</div>`).join('');
  return `<div class="card-title">Kommende prøver</div>${list || '<div class="empty">Ingen kommende prøver.</div>'}
    <form id="test-add" style="display:grid;grid-template-columns:auto 1fr auto;gap:8px">
      <input class="field" type="date" name="date" required aria-label="Dato"><input class="field" name="title" placeholder="Ny prøve…" required aria-label="Tittel">
      <button class="btn" type="submit">Legg til</button></form>`;
} });

widget('s_loan', { render() {
  const l = store.me.loan;
  const next = new Date(l.nextPayout + 'T12:00');
  const nextStr = Number.isNaN(+next) ? '' : `Neste utbetaling ${next.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '')}`;
  const head = `<div class="card-head"><div class="card-title">Studielån</div><span style="display:flex;gap:10px"><button class="btn" data-loan-edit>${editLoan ? 'Ferdig' : 'Rediger'}</button><a href="https://lanekassen.no" target="_blank" rel="noopener" class="sub" style="font-size:13px">Lånekassen ↗</a></span></div>`;
  if (editLoan) {
    const f = (k, label, type = 'text', v = l[k]) => `<label class="sub" style="display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px">${label}<input class="field mono" data-lf="${k}" type="${type}" value="${esc(v)}" style="width:150px;text-align:right"></label>`;
    return head + f('debt', 'Total gjeld (kr)') + f('grantMonthly', 'Stipend per måned (kr)') + f('nextPayout', 'Neste utbetaling', 'date') + f('progress', 'Framdrift (%)');
  }
  return `${head}<div style="font-size:44px;font-weight:300">${kr(l.debt)}</div><div class="muted" style="font-size:13px">Total gjeld</div>
    <div class="bar"><i style="width:${Math.min(100, l.progress)}%;background:var(--yellow)"></i></div>
    <div class="sub" style="font-size:14px">Stipend ${kr(l.grantMonthly)}/mnd${nextStr ? ' · ' + nextStr : ''}</div>`;
} });

export function render() {
  return `<div style="display:flex;flex-direction:column;gap:var(--gap)"><div class="page-title">Stu<b>die</b></div>
    <div class="grid" data-dnd="${isMobile() ? 'm_study' : 'study'}">${['s_links', 's_grades', 's_tests', 's_loan'].map(card).join('')}</div></div>`;
}

export function bind(root) {
  root.addEventListener('change', async (e) => {
    const t = e.target;
    const row = t.closest('[data-gid]');
    if (row && t.dataset.gf) {
      const id = +row.dataset.gid;
      const r = await api(`/grades/${id}`, { method: 'PATCH', json: { [t.dataset.gf]: t.value } });
      store.grades = store.grades.map((g) => (g.id === id ? r : g));
      if (t.dataset.gf === 'grade') refresh('s_grades');
      return;
    }
    if (t.dataset.lf) {
      const k = t.dataset.lf;
      const loan = { ...store.me.loan, [k]: k === 'nextPayout' ? t.value : parseNum(t.value) };
      await api('/settings/loan', { method: 'PUT', json: { value: loan } });
      store.me.loan = loan;
    }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'test-add') return;
    e.preventDefault();
    const f = e.target;
    try {
      const t = await api('/tests', { method: 'POST', json: { date: f.date.value, title: f.title.value } });
      store.tests = [...store.tests, t];
      refresh('s_tests');
    } catch (err) { alert(err.message); }
  });
  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-gadd]')) {
      const g = await api('/grades', { method: 'POST', json: { subject: 'Nytt fag' } });
      store.grades = [...store.grades, g];
      refresh('s_grades');
      document.querySelector(`[data-gid="${g.id}"] input`)?.select();
    } else if (t.closest('[data-gdel]') && confirm('Slette faget?')) {
      const id = +t.closest('[data-gdel]').dataset.gdel;
      await api(`/grades/${id}`, { method: 'DELETE' });
      store.grades = store.grades.filter((g) => g.id !== id);
      refresh('s_grades');
    } else if (t.closest('[data-tdel]')) {
      const id = +t.closest('[data-tdel]').dataset.tdel;
      await api(`/tests/${id}`, { method: 'DELETE' });
      store.tests = store.tests.filter((x) => x.id !== id);
      refresh('s_tests');
    } else if (t.closest('[data-loan-edit]')) {
      editLoan = !editLoan;
      refresh('s_loan');
    }
  });
}

on('study', () => refresh('s_grades', 's_tests'));
on('school', () => refresh('s_tests'));

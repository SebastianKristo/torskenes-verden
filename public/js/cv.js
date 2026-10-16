const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const FIELDS = [['name', 'Navn', 1], ['title', 'Tittel', 1], ['email', 'E-post', 1], ['phone', 'Telefon', 1], ['place', 'Sted', 1], ['about', 'Om meg', 4], ['work', 'Erfaring', 5], ['edu', 'Utdanning', 4], ['skills', 'Ferdigheter', 2]];
const parse = (t) => t.split('\n').filter((l) => l.trim()).map((l) => { const [when, what, desc] = l.split('|').map((x) => (x || '').trim()); return { when, what, desc }; });

const root = document.getElementById('cv');
const tools = document.getElementById('tools');
let cv, canEdit = false, editing = false, saveTimer;

function view() {
  const section = (label, items) => `<section><div class="label mono">${label}</div>${items.map((i) => `<div class="item"><div class="when mono">${esc(i.when)}</div><div><div class="what">${esc(i.what)}</div><div class="desc">${esc(i.desc)}</div></div></div>`).join('')}</section>`;
  const tel = cv.phone.replace(/[^\d+]/g, '');
  return `<header><h1 class="name" style="margin:0">${esc(cv.name)}</h1><div class="title">${esc(cv.title)}</div>
    <div class="contact mono">${cv.email ? `<a href="mailto:${esc(cv.email)}">${esc(cv.email)}</a>` : ''}${cv.phone ? `<a href="tel:${esc(tel)}">${esc(cv.phone)}</a>` : ''}<span>${esc(cv.place)}</span></div></header>
    <p class="about">${esc(cv.about)}</p>${section('ERFARING', parse(cv.work))}${section('UTDANNING', parse(cv.edu))}
    <section><div class="label mono">FERDIGHETER</div><div class="skills">${cv.skills.split(',').map((s) => s.trim()).filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}</div></section>`;
}

function form() {
  return `<div class="form">${FIELDS.map(([k, label, rows]) => `<label class="mono">${label}<textarea data-k="${k}" rows="${rows}">${esc(cv[k])}</textarea></label>`).join('')}
    <div class="hint">Erfaring/utdanning: én linje per punkt, format «År | Tittel | Beskrivelse». Ferdigheter: kommaseparert. Endringer lagres automatisk.</div></div>`;
}

function render() {
  document.title = `${cv.name} · CV`;
  root.innerHTML = editing ? form() : view();
  tools.innerHTML = (canEdit ? `<a class="btn" href="/">← Dashboard</a><button class="btn dark" data-a="toggle">${editing ? 'Ferdig' : 'Rediger CV'}</button>${editing ? '<button class="btn" data-a="reset">Tilbakestill</button>' : ''}` : '')
    + (editing ? '' : '<button class="btn" data-a="pdf">Last ned som PDF</button>');
}

async function save() {
  const res = await fetch('/api/cv', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cv) });
  if (!res.ok) alert('Kunne ikke lagre CV-en');
}

root.addEventListener('input', (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  cv[k] = e.target.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
});

tools.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'pdf') window.print();
  if (a === 'toggle') { if (editing) { clearTimeout(saveTimer); await save(); } editing = !editing; render(); }
  if (a === 'reset' && confirm('Tilbakestille CV-en til standardteksten?')) {
    cv = (await (await fetch('/api/cv', { method: 'DELETE' })).json()).cv;
    render();
  }
});

const data = await (await fetch('/api/cv')).json();
cv = data.cv; canEdit = data.canEdit;
render();

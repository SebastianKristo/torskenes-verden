// Prompt 45 (claude-code-glimt-intelligent-agent.md): alle Glimt-felt på web går til den felles motoren.
//   POST /api/glimt/agent {text, module, context?:{selectedId?, visibleIds?, listId?}, requestId}
//     → {reply, intent, module, actions:[{tool,args,status,result?,error?}], results?:[…], ask?:{question, options?},
//        confirm?:{token, summary}, personality, joke?, engine, model, nav?:{target, web}}
//   POST /api/glimt/agent/confirm {token} → samme form (handlingen er utført)
// Eldre server (404/405): agent() gir null, og feltet bruker sin gamle vei (assist, /api/tasks/glimt, /search/ask …).
// Selvstendig modul (bare convo60.js i samme mappe), så den også kan brukes fra FinansHub (/assets/js/glimt-agent45.js).
// Prompt 60 (prompt 49 del 3): conversationId/conversationKind/choice inn (SERVER60-API.md §1), `choices` ut (§2) som valgknapper:
//   trykk sender item.text + choice {setId, id} i samme samtale (cb.resend(text, ctx, {choice})).
//
// Felles visning: agentExtras(a) gir HTML for treff (velg), oppfølgingsspørsmål med valg, og bekreftelse (Slett / Avbryt).
// Klikkene håndteres her (document-delegert) og sendes tilbake til feltet via callbacks registrert med agentExtras(a, cb).
import { normChoices60, choicePick60, convBody60 } from './convo60.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const OFF_MS = 10 * 60_000;
let offUntil = 0;
/** Har serveren den felles agenten? (false etter 404 i 10 min). */
export const agentOn = () => Date.now() >= offUntil;

const rid = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* */ }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

async function post(path, body, signal) {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) { location.href = '/login'; throw new Error('Ikke innlogget'); }
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  return { ok: r.ok, status: r.status, d };
}

/** Normaliserer svaret (tåler at felt mangler). */
export function normAgent(d = {}) {
  const actions = Array.isArray(d.actions) ? d.actions : [];
  return {
    reply: String(d.reply ?? d.text ?? ''), intent: d.intent ?? '', module: d.module ?? '', actions,
    results: Array.isArray(d.results) ? d.results : [], ask: d.ask?.question ? d.ask : null, confirm: d.confirm?.token ? d.confirm : null,
    joke: d.joke ?? null, engine: d.engine ?? '', model: d.model ?? null, nav: d.nav ?? null, requestId: d.requestId ?? null, repeated: !!d.repeated, ms: d.ms ?? null,
    choices: normChoices60(d.choices), conversationId: d.conversationId ?? null, followUp: d.followUp?.refersToPrevious ? d.followUp : null, // prompt 60
    done: actions.filter((x) => x.status === 'done'), failed: actions.filter((x) => x.status === 'failed'),
  };
}
/** Ingen handling, treff, spørsmål eller bekreftelse: et vanlig spørsmål/prat. */
export const isPlain = (a) => !!a && !a.actions.length && !a.results.length && !a.ask && !a.confirm && !a.choices && !a.nav?.web;

/**
 * Spør den felles agenten. null = serveren har den ikke (eldre server). Kaster ved andre feil.
 * module: 'home'|'calendar'|'tasks'|'finance'|'ruter'|'chat'|'weather'|'family'|'media'|'study'
 */
export async function agent(text, module = 'home', context = {}, { signal, requestId, conversationId, conversationKind, choice } = {}) {
  text = String(text ?? '').trim();
  if (!text || !agentOn()) return null;
  const ctx = Object.fromEntries(Object.entries(context ?? {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
  let r;
  try { r = await post('/api/glimt/agent', { text: text.slice(0, 1000), module, ...(Object.keys(ctx).length ? { context: ctx } : {}), requestId: requestId ?? rid(), ...convBody60({ conversationId, conversationKind, choice }) }, signal); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error(`Fikk ikke kontakt med Glimt: ${e.message}`); }
  if (r.status === 404 || r.status === 405) { offUntil = Date.now() + OFF_MS; return null; }
  if (!r.ok) throw Object.assign(new Error(r.d?.error || (r.status === 429 ? 'Glimt jobber med mye nå. Prøv igjen om litt.' : `Glimt svarte ikke (feil ${r.status}).`)), { status: r.status });
  const a = normAgent(r.d);
  announce(a);
  return a;
}
export async function agentConfirm(token) {
  const r = await post('/api/glimt/agent/confirm', { token });
  if (r.status === 404) throw new Error('Bekreftelsen er utløpt. Spør Glimt på nytt.');
  if (r.status === 409) throw new Error('Dette er allerede gjort.');
  if (!r.ok) throw new Error(r.d?.error || `Feil ${r.status}`);
  const a = normAgent(r.d);
  announce(a);
  return a;
}
/** Sier fra til sidene at data er endret (Kalender, Gjøremål … laster på nytt). */
function announce(a) {
  if (!a.done.length) return;
  const mods = [...new Set(a.done.map((x) => String(x.tool ?? '').split('.')[0]).filter(Boolean))];
  try { document.dispatchEvent(new CustomEvent('hl:agent45', { detail: { modules: mods, actions: a.done } })); } catch { /* */ }
}

/* ---------------- Felles visning ---------------- */

const KIND = { event: ['Kalender', '#2F7A4F'], task: ['Gjøremål', '#b23a2a'], receipt: ['Kvittering', '#3d7dd6'], transaction: ['Transaksjon', '#6B4FA0'], tx: ['Transaksjon', '#6B4FA0'], category: ['Kategori', '#D98C1F'] };
const kr = (v) => (typeof v === 'number' ? `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(v)} kr` : '');
const dShort = (d) => { const x = new Date(`${String(d).slice(0, 10)}T12:00`); return Number.isNaN(+x) ? '' : x.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); };
const CB = new Map();
let seq = 0;

/** Hvor et treff åpnes når feltet ikke bestemmer selv. */
export function resultHref(r) {
  if (r.url || r.href) return r.url ?? r.href;
  const k = r.kind;
  if (k === 'event') return `#/kalender${r.date ? `/dag/${String(r.date).slice(0, 10)}` : ''}`;
  if (k === 'task') return '#/gjoremal';
  if (k === 'receipt') return `/finans/#/kv${r.id ? `/${encodeURIComponent(r.id)}` : ''}`;
  if (k === 'transaction' || k === 'tx') return '/finans/#/transaksjoner';
  if (k === 'category') return '/finans/#/budsjett';
  // Prompt 46: Kart («vis bussene rundt hjemme» → /api/kart/live gir open:{web:'#/kart', zoneId, live}).
  const op = r.open ?? r.result?.open;
  if (op?.web) return `${op.web}${op.zoneId != null ? `?zone=${encodeURIComponent(op.zoneId)}&live=${op.live === false ? 0 : 1}` : ''}`;
  if (k === 'kart' || k === 'zone' || k === 'stop') return `#/kart${r.zoneId ?? (k === 'zone' ? r.id : null) ? `?zone=${encodeURIComponent(r.zoneId ?? r.id)}&live=1` : ''}`;
  return null;
}

/**
 * HTML for treff, spørsmål og bekreftelse. cb = { resend(text, ctx), update(a), open?(result) → true når håndtert }.
 * opts.dark: lyse farger på mørk boble.
 */
export function agentExtras(a, cb = {}, opts = {}) {
  if (!a) return '';
  const id = String(++seq);
  CB.set(id, { a, cb });
  if (CB.size > 40) CB.delete(CB.keys().next().value);
  const out = [];
  // Prompt 60: med valgknapper (choices) vises ikke de gamle valg-treffene (kind 'option') eller ask.options i tillegg.
  const res = a.choices ? a.results.filter((r) => r.kind !== 'option') : a.results;
  if (res.length) {
    out.push(`<div class="ga45-res">${res.slice(0, 8).map((r) => { const i = a.results.indexOf(r);
      const [kn, kc] = KIND[r.kind] ?? ['', '#7a7468'];
      const meta = r.subtitle || [r.date ? dShort(r.date) : '', r.time].filter(Boolean).join(' · ');
      return `<button type="button" class="ga45-r" data-ga45="${id}" data-ga45-r="${i}"><i style="background:${esc(r.color ?? kc)}"></i><span class="ga45-rt"><b data-no-i18n>${esc(r.title ?? r.name ?? '')}</b>${meta ? `<span data-no-i18n>${esc(meta)}</span>` : ''}</span>${typeof r.amount === 'number' ? `<b class="ga45-amt">${esc(kr(r.amount))}</b>` : kn ? `<span class="ga45-k">${esc(kn)}</span>` : ''}</button>`;
    }).join('')}${res.length > 8 ? `<span class="ga45-more">+ ${res.length - 8} til</span>` : ''}</div>`);
  }
  if (a.choices) {
    const c = a.choices, same = a.reply && a.reply.replace(/\*\*/g, '').includes(c.question);
    out.push(`<div class="ga45-ask ga60-ch" data-ga60-set="${esc(c.setId ?? '')}">${same || !c.question ? '' : `<b data-no-i18n>${esc(c.question)}</b>`}<div class="ga45-opts" role="group" aria-label="Velg">${c.items.map((x, i) => `<button type="button" class="ga45-o" data-ga45="${id}" data-ga60-i="${i}" data-no-i18n>${esc(x.label)}</button>`).join('')}</div></div>`);
  } else if (a.ask) {
    const o = Array.isArray(a.ask.options) ? a.ask.options : [];
    const same = a.reply && a.reply.replace(/\*\*/g, '').includes(a.ask.question);
    out.push(`<div class="ga45-ask">${same ? '' : `<b data-no-i18n>${esc(a.ask.question)}</b>`}${o.length ? `<div class="ga45-opts">${o.slice(0, 6).map((x, i) => `<button type="button" class="ga45-o" data-ga45="${id}" data-ga45-o="${i}" data-no-i18n>${esc(x.label ?? x.title ?? x)}</button>`).join('')}</div>` : ''}</div>`);
  }
  if (a.confirm) {
    out.push(`<div class="ga45-cf"><b data-no-i18n>${esc(a.confirm.summary || 'Er du sikker?')}</b><div class="ga45-opts"><button type="button" class="ga45-o danger" data-ga45="${id}" data-ga45-c="yes">Ja, gjør det</button><button type="button" class="ga45-o" data-ga45="${id}" data-ga45-c="no">Avbryt</button></div></div>`);
  }
  if (a.failed.length && !a.reply) out.push(`<span class="ga45-err">${esc(a.failed[0].error || 'Noe gikk galt.')}</span>`);
  return out.length ? `<div class="ga45${opts.dark ? ' dark' : ''}">${out.join('')}</div>` : '';
}

/** Teksten i svaret: bekreftelsen, og spøken (hvis den ikke allerede står der) etterpå. */
export function agentText(a, { plain = false } = {}) {
  if (!a) return '';
  if (plain) return agentText(a).replace(/\*\*(.+?)\*\*/g, '$1');
  let t = a.reply || (a.ask ? '' : a.failed[0]?.error) || '';
  if (a.joke && !t.includes(a.joke)) t = `${t} ${a.joke}`.trim();
  return t;
}

/** Ren tekst + oppfølgingsspørsmålet (når det ikke allerede står i svaret) – for felt som ikke viser agentExtras. */
export function agentFull(a) {
  const t = agentText(a, { plain: true }), q = a?.choices?.question || a?.ask?.question || '';
  const o = (a?.choices ? a.choices.items : a?.ask?.options ?? []).map((x) => x.label ?? x.title ?? x).filter(Boolean);
  return `${t}${q && !t.includes(q) ? ` ${q}` : ''}${o.length ? ` (${o.slice(0, 4).join(' · ')})` : ''}`.trim();
}

export function initAgent45() {
  if (initAgent45.on) return; initAgent45.on = true;
  document.addEventListener('click', async (e) => {
    const b = e.target.closest?.('[data-ga45]');
    if (!b) return;
    const ent = CB.get(b.dataset.ga45);
    if (!ent) return;
    e.preventDefault(); e.stopPropagation();
    const { a, cb } = ent;
    if (b.dataset.ga45R != null) {
      const r = a.results[+b.dataset.ga45R];
      if (!r) return;
      if (cb.open?.(r)) return;
      const href = resultHref(r);
      if (!href) return;
      if (href.startsWith('#')) location.hash = href; else location.href = href;
      return;
    }
    if (b.dataset.ga60I != null) { // prompt 60: valgknapp → item.text + choice i samme samtale
      const pick = choicePick60(a.choices, a.choices?.items?.[+b.dataset.ga60I]);
      if (!pick) return;
      b.closest('.ga45-opts')?.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      cb.resend?.(pick.text, {}, { choice: pick.choice ?? null, label: a.choices.items[+b.dataset.ga60I].label });
      return;
    }
    if (b.dataset.ga45O != null) {
      const o = a.ask?.options?.[+b.dataset.ga45O];
      if (!o) return;
      cb.resend?.(String(o.text ?? o.label ?? o.title ?? o), { selectedId: o.id ?? undefined }); // prompt 60: text (prompt 55) når den finnes
      return;
    }
    if (b.dataset.ga45C) {
      if (b.dataset.ga45C === 'no') { cb.update?.({ ...a, confirm: null, actions: [], done: [], failed: [], results: [], reply: 'Greit, jeg lot det være.' }); return; }
      b.disabled = true;
      try { cb.update?.(await agentConfirm(a.confirm.token)); }
      catch (er) { cb.update?.({ ...a, confirm: null, reply: er.message, failed: [{ error: er.message }] }); }
    }
  }, true);
}

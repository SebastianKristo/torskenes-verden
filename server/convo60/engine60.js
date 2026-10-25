// Prompt 60 (prompt 49 del 3, D3SRV) – krokene motoren (glimt45/engine.js) kaller. All logikk for del 3 ligger her; motoren har bare
// fem små kall:
//   begin60    før pipelinen: samtalen (conversationId), tilstanden, og om meldingen er et svar på et valg («den første», knapp)
//   facts60    etter minnehentingen: entitetsregisterets treff som fakta (planleggeren + kalendersøkets termer)
//   afterPlan60 etter planleggeren: refers_to_previous (modellens eller tydelig oppfølging) → manglende argumenter fra tilstanden
//   adjust60   etter valideringen av hvert kall: tid/sted fra forrige tur (vær), entiteter («hytta» → faktisk sted, butikk-aliaser)
//   finish60   etter svaret: choices (konkrete valg), followUp, conversationId og lagring av tilstanden
// Hver del kan slås av for seg (settings.js): state, entities, choices.
import { convo60 } from './settings.js';
import { convOf60, loadState60, saveState60, afterTurn60, stateText60, fill60, looksFollowUp60, matchChoice60, newSetId60, historyOf60, TTL60 } from './state.js';
import { entitiesIn60, factsOfEntities60, resolveEntity60, weatherPlaceOf60 } from './entities.js';
import { placesIn46 } from '../glimt45/weather46.js';
import { CANCEL_RE46 } from '../glimt45/tools46.js';
import './tools60.js'; // subscriptions.cancel i registeret

/** Står det en tid i meldingen («i morgen», «fredag», «kl 11», «17.12»)? */
export const timeIn60 = (t) => /(?<![a-zæøå])(?:i\s*dag|idag|i\s*morgen|imorgen|i\s+overmorgen|overmorgen|i\s+kveld|i\s+natt|i\s+ettermiddag|neste\s+(?:time|timen|uke|helg)|denne\s+uk\w*|helg\w*|nå|(?:man|tirs|ons|tors|fre|lør|søn)dag\w*|kl\.?\s*\d|klokka\s+\d|\d{1,2}[.:]\d{2}|\d{1,2}\.\s*\d{1,2}\.?|om\s+\d+\s+(?:timer|dager|uker))(?![a-zæøå])/i.test(String(t ?? ''));
const PRON = /^(?:den|det|dem|denne|dette|abonnementet|tjenesten)$/i;
const PENDING_TOOLS = new Set(['calendar.update', 'calendar.delete', 'tasks.complete', 'subscriptions.cancel', 'calendar.create']);
const joinOr = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} eller ${a[a.length - 1]}`);

/** Før pipelinen. → c60 (mutable, følger forespørselen) | null (forhåndsvisning) */
export function begin60(user, text, opts = {}) {
  if (opts.preview) return null;
  const set = convo60(user);
  const conv = convOf60({ conversationId: opts.conversationId ?? null, conversationKind: opts.conversationKind ?? null, module: opts.module ?? 'home' });
  const loaded = set.state || set.choices ? loadState60(user, conv) : null;
  const c = { set, conv, stAll: loaded?.state ?? null, st: set.state ? loaded?.state ?? null : null, text, execText: text, choice: null, choicePlan: null, context: null,
    refers: false, filled: {}, entities: [], plan: null, facts: [],
    selected: opts.context && typeof opts.context === 'object' && opts.context.selectedId != null ? String(opts.context.selectedId) : null };
  const ch = loaded?.state?.choices;
  if (set.choices && ch?.items?.length && Date.now() < Date.parse(ch.expiresAt ?? 0)) {
    const m = matchChoice60(ch, text, opts.choice && typeof opts.choice === 'object' ? opts.choice : null);
    if (m) {
      c.choice = { setId: ch.setId, id: m.item.id, via: m.via, label: m.item.label };
      const p = ch.pending;
      if (p && m.item.ref != null) {
        // Det opprinnelige ønsket utføres med det valgte målet (samme melding, samme plan, ingen ny tolkning).
        c.execText = p.text;
        const ctx = { ...(opts.context && typeof opts.context === 'object' ? opts.context : {}) };
        if (p.field === 'calendar') ctx.calendarId = String(m.item.ref); else ctx.selectedId = String(m.item.ref);
        c.context = ctx;
        const calls = (p.calls ?? []).map((x) => (x.tool === p.tool ? { tool: x.tool, args: withRef(x.tool, x.args ?? {}, m.item.ref) } : x));
        c.choicePlan = { intent: p.intent ?? 'ask', module: p.module ?? opts.module ?? 'home', calls, engine: 'lokal', model: null, fast: 'valg' };
      } else if (m.item.text) c.execText = m.item.text;
    }
  }
  return c;
}
function withRef(tool, args, ref) {
  const r = String(ref);
  if (tool === 'calendar.update' || tool === 'calendar.delete' || tool === 'tasks.complete') return { ...args, target_id: r };
  if (tool === 'subscriptions.cancel') return { ...args, subscription_id: r.replace(/^sub[-:]/, '') };
  return args;
}

/** Planleggerens kontekst: kort tilstandstekst (dynamisk del) og samtalens egen historikk (eksplisitt samtale). */
export function ctx60(c) {
  if (!c?.st) return { stateText: '', history: null };
  return { stateText: stateText60(c.st), history: c.conv.implicit ? null : historyOf60(c.st) };
}

/** Etter minnehentingen: entitetsregisterets treff som fakta (ikke dobbelt med minnet). → nye fakta */
export function facts60(user, c, facts) {
  if (!c?.set.entities) return facts;
  let hits = [];
  try { hits = entitiesIn60(user, c.execText); } catch (e) { console.warn('[convo60] entiteter:', e.message); }
  if (!hits.length) return facts;
  c.entities.push(...hits.map((h) => ({ word: h.word, id: h.item.id, via: h.via })));
  const have = new Set(facts.map((f) => String(f.subject).toLowerCase()));
  return [...facts, ...factsOfEntities60(hits).filter((f) => !have.has(String(f.subject).toLowerCase()))].slice(0, 12);
}

/** Etter planleggeren. → planen (evt. med argumenter fylt inn fra tilstanden) */
export function afterPlan60(c, plan) {
  if (!c || !plan || c.choicePlan) return plan;
  // Koden fyller inn mål fra tilstanden – modellens egne id-er for oppsigelse og koden sine interne felt brukes aldri.
  let calls = (plan.calls ?? []).map((x) => (x.tool === 'subscriptions.cancel' || x.args?._state60 ? { ...x, args: Object.fromEntries(Object.entries(x.args ?? {}).filter(([k]) => k !== 'subscription_id' && k !== '_state60')) } : x));
  const st = c.st;
  const text = c.execText;
  // «flytt den til 11»: et bart tall er et klokkeslett når det er det eneste i meldingen (datoparseren krever «kl»).
  const bare = /(?<![\p{L}\d])til\s+(\d{1,2})(?:[.:](\d{2}))?\s*[?.!]?\s*$/u.exec(text);
  calls = calls.map((x) => {
    if (x.tool !== 'calendar.update') return x;
    const t = String(x.args?.time ?? '').trim();
    if (/^\d{1,2}$/.test(t) && +t <= 23) return { ...x, args: { ...x.args, time: `kl ${t}` } };
    if (!t && !x.args?.date && bare && +bare[1] <= 23 && !timeIn60(text)) return { ...x, args: { ...x.args, time: `kl ${bare[1]}${bare[2] ? `:${bare[2]}` : ''}` } };
    return x;
  });
  if (!st) return { ...plan, calls };
  const refers = plan.refersToPrevious === true || looksFollowUp60(text);
  if (!refers) return { ...plan, calls };
  const E = st.entities ?? {};
  const talkOnly = !calls.length || calls.every((x) => x.tool === 'app.answer' || x.tool === 'chat.answer');
  const prevTool = (t) => (st.tools ?? []).some((x) => x.tool === t);
  // «si opp det»: oppsigelse av abonnementet fra forrige tur (aldri en avslutningsfrist uten dato, aldri prat).
  if (CANCEL_RE46.test(text) && E.subscription?.id && !timeIn60(text) && (talkOnly || calls.some((x) => x.tool === 'subscriptions.trial' && (!String(x.args?.service ?? '').trim() || PRON.test(String(x.args.service).trim()))) || calls.some((x) => x.tool === 'subscriptions.cancel'))) calls = [{ tool: 'subscriptions.cancel', args: {} }];
  // «og i Bergen?» uten værord: samme spørsmål som forrige tur, nytt sted/ny tid.
  else if (talkOnly && prevTool('weather.get')) { const pl = placesIn46(text); if (pl.length || timeIn60(text)) calls = (pl.length ? pl : [null]).slice(0, 4).map((p) => ({ tool: 'weather.get', args: p ? { place: p } : {} })); }
  // Et element brukeren har valgt i appen (context.selectedId) vinner alltid over tilstanden.
  const r = fill60(calls, c.selected ? { ...st, entities: { ...(st.entities ?? {}), event: null, eventId: null } } : st, text, { timesInText: timeIn60, placesInText: placesIn46 });
  c.refers = true;
  c.filled = r.filled;
  const changed = r.calls.some((x, i) => x !== plan.calls?.[i]);
  return { ...plan, calls: r.calls, refersToPrevious: true, ...(changed && talkOnly ? { intent: r.calls[0]?.tool === 'weather.get' ? 'weather' : r.calls[0]?.tool === 'subscriptions.cancel' ? 'cancel' : plan.intent } : {}) };
}

/** Etter valideringen av ett kall (v = {args, summary?}). Endrer v.args på stedet. */
export function adjust60(user, c, call, v, trace = null) {
  if (!c || !v?.args) return v;
  if (call.tool === 'weather.get') {
    const s = c.refers ? call.args?._state60 : null;
    if (s?.when) v.args.when = s.when;
    if (s?.place && !v.args.place) { v.args.place = s.place; if (s.placeAt) v.args.placeAt = s.placeAt; }
    if (c.set.entities) {
      let hit = v.args.place ? resolveEntity60(user, v.args.place, { type: 'place' }) : null;
      if (hit && hit.via === 'name' && hit.item.source === 'weather') hit = null; // værstedene geokodes som før
      if (!hit && !v.args.place) { const b = entitiesIn60(user, c.execText).find((h) => h.item.type === 'place' && h.via === 'builtin'); if (b) hit = { item: b.item, via: 'builtin', word: b.word }; }
      const wp = hit ? weatherPlaceOf60(hit.item) : null;
      if (wp) {
        c.entities.push({ word: hit.word ?? v.args.place ?? hit.item.name, id: hit.item.id, via: hit.via, tool: 'weather.get' });
        v.args.place = wp.place;
        if (wp.placeAt) v.args.placeAt = wp.placeAt;
        trace?.set('entities', c.entities);
      }
    }
  }
  if (call.tool === 'finance.search' && c.set.entities && v.args.merchant) {
    const hit = resolveEntity60(user, v.args.merchant, { type: 'store' });
    if (hit && hit.via !== 'name') { c.entities.push({ word: v.args.merchant, id: hit.item.id, via: hit.via, tool: 'finance.search' }); v.args.merchant = hit.item.name; trace?.set('entities', c.entities); }
  }
  return v;
}

/** Til tracen. */
export const convoTrace60 = (c) => (c ? { conversationId: c.conv.implicit ? null : c.conv.id, implicit: c.conv.implicit, kind: c.conv.kind, refersToPrevious: c.refers, filled: c.filled,
  choice: c.choice ? { setId: c.choice.setId, id: c.choice.id, via: c.choice.via } : null, stateIn: !!c.st, settings: c.set } : null);

function choicesOf(c, out) {
  const ask = out?.ask;
  const opts = Array.isArray(ask?.options) ? ask.options.filter((o) => o && o.label).slice(0, 5) : [];
  if (!opts.length) return null;
  const a0 = (out.actions ?? [])[0];
  const tool = a0?.status === 'proposed' ? a0.tool : null;
  const pending = tool && PENDING_TOOLS.has(tool) && (!ask.field || ask.field === 'calendar' || ask.field === 'subscription') && opts.every((o) => o.id != null);
  const items = opts.map((o, i) => ({ id: String(i + 1), label: String(o.label).slice(0, 120),
    text: String(o.text ?? (pending ? o.label : `${c.execText} – ${o.label}`)).slice(0, 300), ref: pending ? String(o.id) : null }));
  let question = String(ask.question ?? out.reply ?? '');
  // «Hvilken avtale vil du flytte?» med 2–3 kandidater → «Mener du «A» eller «B»?»
  if (pending && /^calendar\./.test(tool) && /^Hvilken avtale vil du/.test(question) && items.length >= 2 && items.length <= 3) question = `Mener du ${joinOr(items.map((x) => `«${x.label}»`))}?`;
  return { setId: newSetId60(), question, items, expiresAt: new Date(Date.now() + (TTL60[c.conv.kind] ?? TTL60.search)).toISOString(),
    pending: pending ? { text: c.execText, tool, field: ask.field ?? null, calls: c.plan?.calls?.length ? c.plan.calls : [{ tool, args: a0.args ?? {} }], intent: c.plan?.intent ?? null, module: out.module ?? null } : null };
}
const publicChoices = (ch) => ({ setId: ch.setId, question: ch.question, items: ch.items.map(({ id, label, text }) => ({ id, label, text })), expiresAt: ch.expiresAt });

/** Etter svaret. → svaret med conversationId, followUp og choices; tilstanden lagres. */
export function finish60(user, c, out) {
  if (!c || !out || out.legacy || out.preview) return out;
  const res = { ...out, conversationId: c.conv.implicit ? null : c.conv.id };
  if (c.refers) res.followUp = { refersToPrevious: true, filled: { when: c.filled.when ?? null, place: c.filled.place ?? null, event: c.filled.event ?? null, subscription: c.filled.subscription ?? null } };
  const ch = c.set.choices ? choicesOf(c, out) : null;
  if (ch) {
    res.choices = publicChoices(ch);
    if (ch.question !== res.reply && res.ask) { res.reply = ch.question; res.text = ch.question; res.ask = { ...res.ask, question: ch.question }; }
  }
  if (c.set.state || c.set.choices) {
    try {
      const st = c.set.state ? afterTurn60(c.stAll, { text: c.text, out: res, facts: c.facts }) : { intent: null, tools: [], entities: {}, turns: [] };
      st.choices = ch;
      saveState60(user, c.conv, st);
    } catch (e) { console.warn('[convo60] tilstand:', e.message); }
  }
  return res;
}

/** Etter POST /confirm: oppdater tilstanden i samtalen bekreftelsen hørte til (f.eks. abonnementet er sagt opp). */
export function confirmed60(user, conv, out) {
  if (!conv?.id || !convo60(user).state) return;
  try { const l = loadState60(user, conv); const st = afterTurn60(l?.state ?? null, { text: 'ja', out }); st.choices = null; saveState60(user, conv, st); } catch { /* */ }
}

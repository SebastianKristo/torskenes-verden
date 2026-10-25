// Prompt 52 (SRV52): tankegangen i Glimt-chatten.
//   - Modellens egen tenkning: Ollama `message.thinking` (think:true), `<think>…</think>` i teksten (eldre maler) og
//     `reasoning_content` (OpenAI-kompatible strømmer). Teksten deles i steg (avsnitt, ellers setninger), én linje per steg.
//   - Modeller uten tenkning: Glimts egne steg (leser spørsmålet, ser på vedlegget, henter data, velger modell med grunn,
//     planlegger svaret).
//   - Lagres på assistentmeldingen som think: string[], thS: sekunder (én desimal), thinkSource: 'model' | 'glimt'.
//   - Sendes aldri tilbake til modellen: modellen får bare role/content/images (chat.js), og stripThink52 fjerner feltene.
// SSE: event «thinking» {step, i, source, s} per steg, «thinking_done» {thS, count} når svaret begynner å strømme.
export const MAX_STEPS52 = 40;
const MAX_STEP_LEN52 = 400;

/** Splitter <think>…</think> ut av strømmet tekst. push(chunk) → {text, think}; end() → {text, think}. */
export function thinkSplit52() {
  let inside = false, buf = '';
  const OPEN = /<think(?:ing)?>/i, CLOSE = /<\/think(?:ing)?>/i;
  const partial = (s) => { const i = s.lastIndexOf('<'); return i >= 0 && s.length - i < 12 && !s.slice(i).includes('>') && /^<\/?t?h?i?n?k?i?n?g?$/i.test(s.slice(i)) ? i : -1; };
  const step = (flush = false) => {
    let text = '', think = '';
    for (;;) {
      const m = buf.match(inside ? CLOSE : OPEN);
      if (m) { (inside ? (think += buf.slice(0, m.index)) : (text += buf.slice(0, m.index))); buf = buf.slice(m.index + m[0].length); inside = !inside; continue; }
      const p = flush ? -1 : partial(buf);
      const take = p >= 0 ? buf.slice(0, p) : buf;
      if (inside) think += take; else text += take;
      buf = p >= 0 ? buf.slice(p) : '';
      return { text, think };
    }
  };
  return { push: (chunk) => { buf += String(chunk ?? ''); return step(); }, end: () => step(true) };
}

/** Deler tenketekst i steg: avsnitt først; ett langt avsnitt deles i setninger (grupper på opptil ~240 tegn). */
export function splitThoughts52(text) {
  const paras = String(text ?? '').replace(/\r/g, '').split(/\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const p of paras) {
    if (p.length <= 260) { out.push(p); continue; }
    let cur = '';
    for (const s of p.split(/(?<=[.!?…])\s+(?=[\p{Lu}\d«"(])/u)) {
      if (cur && (cur.length + s.length) > 240) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) out.push(cur);
  }
  return out.map((x) => x.slice(0, MAX_STEP_LEN52)).slice(0, MAX_STEPS52);
}

/** Glimts egne steg for modeller uten tenkning. */
export function glimtSteps52({ text = '', images = 0, files = [], tools = [], used = [], model = null, reason = null, readWith = null } = {}) {
  const q = String(text ?? '').replace(/\s+/g, ' ').trim();
  const steps = [`Leser spørsmålet: «${q.length > 80 ? `${q.slice(0, 78)}…` : q}»`];
  if (images) steps.push(readWith?.label ? `Ser på ${images === 1 ? 'bildet' : `${images} bilder`} · ${readWith.label}` : `Ser på ${images === 1 ? 'bildet' : `${images} bilder`}`);
  if (files.length) steps.push(`Leser ${files.length === 1 ? `vedlegget ${files[0]}` : `${files.length} vedlegg`}`);
  const data = [...new Set([...(used ?? [])])].filter(Boolean);
  const tl = (tools ?? []).filter((t) => t && t !== 'none');
  if (data.length || tl.length) steps.push(`Henter data: ${(data.length ? data : tl).slice(0, 5).join(', ')}`);
  if (model) steps.push(`Velger modell: ${String(model).replace(/:latest$/, '')}${reason ? ` – ${reason}` : ''}`);
  steps.push('Planlegger svaret');
  return steps;
}

/**
 * Tilstand for én melding. emit(event, data) skriver SSE. t0 = når forespørselen startet.
 * → {onThink(text), start(glimtSteps), finish() → {think, thS, thinkSource} | null, out()}
 */
export function thinkState52({ emit = async () => {}, t0 = Date.now(), now = () => Date.now() } = {}) {
  const st = { steps: [], source: null, buf: '', done: false, startedAt: null, thS: null };
  const push = async (step) => {
    if (!step || st.steps.length >= MAX_STEPS52) return;
    st.steps.push(step);
    await emit('thinking', { step, i: st.steps.length - 1, source: st.source, s: Math.round((now() - t0) / 100) / 10 });
  };
  return {
    get steps() { return st.steps; },
    get source() { return st.source; },
    async onThink(text) {
      if (st.done || !text) return;
      if (st.source === 'glimt') { st.steps = []; } // modellen tenker likevel: dens egne steg erstatter Glimts
      st.source = 'model';
      st.startedAt ??= now();
      st.buf += text;
      // Ferdige avsnitt sendes med en gang; resten venter på mer tekst.
      const i = st.buf.lastIndexOf('\n\n');
      if (i > 0) { const ready = st.buf.slice(0, i); st.buf = st.buf.slice(i + 2); for (const s of splitThoughts52(ready)) await push(s); }
    },
    async glimt(steps) {
      if (st.source === 'model' || st.done) return;
      st.source = 'glimt';
      st.startedAt ??= now();
      for (const s of steps) await push(s);
    },
    async finish() {
      if (st.done) return st.steps.length ? { think: st.steps, thS: st.thS, thinkSource: st.source } : null;
      st.done = true;
      if (st.buf.trim()) { for (const s of splitThoughts52(st.buf)) await push(s); st.buf = ''; }
      if (!st.steps.length) return null;
      st.thS = Math.round((now() - t0) / 100) / 10;
      await emit('thinking_done', { thS: st.thS, count: st.steps.length, source: st.source });
      return { think: st.steps, thS: st.thS, thinkSource: st.source };
    },
    out() { return st.steps.length ? { think: st.steps, thS: st.thS ?? Math.round((now() - t0) / 100) / 10, thinkSource: st.source } : {}; },
  };
}

/** Fjerner tankegangen (og <think>) fra historikken før den sendes til modellen. */
export function stripThink52(msgs) {
  return (msgs ?? []).map((m) => {
    if (!m || typeof m !== 'object') return m;
    const { think, thS, thinkSource, attTh, ...rest } = m; void think; void thS; void thinkSource; void attTh;
    if (rest.role === 'assistant' && typeof rest.content === 'string' && /<think/i.test(rest.content)) rest.content = rest.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
    return rest;
  });
}

/** attTh fra klienten: maks 4 data-URL-er (JPEG/PNG/WebP), maks 60 kB hver. */
export function cleanAttTh52(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.length <= 80_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x)).slice(0, 4);
}

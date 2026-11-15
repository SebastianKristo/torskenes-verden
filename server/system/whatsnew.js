// Prompt 52 (SRV52): «Nytt i versjon» som lesbare punkter. GET /api/whatsnew (qa51.js) får i tillegg:
//   {date_label, label, heading, title (renset), points:[{title, text, more}], items (renset)}
// Interne merknader («prompt 51», «(prompt NN)», «runde 1», «SRV52» o.l.) fjernes fra tittel og tekst; de skal ikke vises for brukeren.
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** «25.10.2026» / «2026-10-25» → «25. oktober 2026». */
export function dateLabel52(d) {
  const s = String(d ?? '').trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${+m[1]}. ${MON[+m[2] - 1] ?? m[2]} ${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${+m[3]}. ${MON[+m[2] - 1] ?? m[2]} ${m[1]}`;
  return s || null;
}
const INTERNAL = /\b(?:prompt|runde|fase|del)\s*\d+[a-z]?\b|\b(?:[A-Z]{2,}\d{2}[A-Z]?)\b/g;
/** Fjerner interne merknader fra en tekst. */
export function stripInternal52(t) {
  return String(t ?? '')
    .replace(/\s*\((?:[^()]*\b(?:prompt|runde)\s*\d+[^()]*)\)/gi, '')
    .replace(/\s*·\s*(?:prompt|runde)\s*\d+[a-z]?\b/gi, '')
    .replace(/\b(?:og\s+)?(?:prompt|runde)\s*\d+[a-z]?\b(?:\s+og\b)?/gi, '')
    .replace(INTERNAL, '').replace(/\s*\(\s*\)/g, '')
    .replace(/\s+([,.:;])/g, '$1').replace(/^[\s,–—:-]+|[\s,–—:-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Tittelen: deler skilt med « – » som bare er interne fjernes; resten renses. */
export function cleanTitle52(title) {
  const parts = String(title ?? '').split(/\s+[–—-]\s+/).map(stripInternal52).filter((p) => p && !/^(?:og|og\s+)$/i.test(p));
  return cap(parts.join(' – ')) || null;
}
const md = (t) => String(t ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
const sentence = (t) => (/[.!?…:]$/.test(t) ? t : `${t}.`);
/** Kort tekst: hele setninger opptil ca. max tegn. */
function shortText(t, max = 220) {
  if (t.length <= max) return { text: t, more: null };
  const sents = t.split(/(?<=[.!?…])\s+(?=[\p{Lu}«"(])/u);
  let out = '';
  for (const s of sents) { if ((out + ' ' + s).length > max && out) break; out = out ? `${out} ${s}` : s; }
  out = out.trim() || `${t.slice(0, max - 1).replace(/\s+\S*$/, '')} …`;
  return { text: out, more: t };
}
/** Rå markdown for én versjon → [{title, text, more}] (ett punkt per toppnivå-kulepunkt). */
export function points52(markdown) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const body = stripInternal52([cur.rest, ...cur.subs.map(sentence)].filter(Boolean).join(' '));
    const title = stripInternal52(cur.title);
    if (title || body) {
      const st = shortText(body);
      out.push({ title: cap(title || st.text.split(/[.!?]/)[0].slice(0, 60)), text: cap(st.text), more: st.more ? cap(st.more) : null });
    }
    cur = null;
  };
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const top = line.match(/^[-*]\s+(.*)$/);
    if (top) {
      flush();
      const raw = top[1].trim();
      const lead = raw.match(/^\*\*([^*]{1,80}?)[.:]?\*\*[.:]?\s*(.*)$/);
      if (lead) cur = { title: md(lead[1]).replace(/[.:]+$/, ''), rest: md(lead[2]), subs: [] };
      else {
        const t = md(raw);
        const m = t.match(/^([^.!?:]{3,70})[:]\s*(.*)$/);
        cur = m ? { title: m[1], rest: m[2], subs: [] } : { title: '', rest: t, subs: [] };
      }
      continue;
    }
    const sub = line.match(/^\s+[-*]\s+(.*)$/);
    if (sub && cur) { const t = md(sub[1]); if (t) cur.subs.push(t); }
  }
  flush();
  return out.slice(0, 40);
}
/** Tilleggsfeltene for /api/whatsnew. */
export function whatsNewExtra52(w) {
  if (!w) return {};
  return { title: cleanTitle52(w.title), title_raw: w.title ?? null, date_label: dateLabel52(w.date), label: 'NYTT I HOMELAB', heading: `Versjon ${w.version}`,
    points: points52(w.markdown), items: (w.items ?? []).map(stripInternal52).filter(Boolean) };
}

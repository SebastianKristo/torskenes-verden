// Prompt 47 (GLIMT47): tolkning av episode-forespørsler for Media (Sonarr). Ren tekst, ingen nett – brukes av media43.js
// (Media-Glimt) og av Glimt-motorens hurtigvei/verktøy media.episode.
/** Tittelnormalisering: «9-1-1» ≈ «911» ≈ «9 1 1», «The Rookie» ≈ «the rookie». */
export const normTitle43 = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå]+/g, '');
const EP_RE43 = /(?:^|\s)(?:(?:kan du\s+)?(last\s+ned|hent|finn|søk\s+(?:etter|opp)?|se\s+etter|når\s+kommer|når\s+er))?\s*(?:den\s+)?(siste|nyeste|forrige|neste|kommende|nye?)\s+(?:episoden?|ep\.?)\s+(?:av|fra|i|med|til)\s+(.+?)\s*[?.!]*$/i;
const SXE_RE43 = /(?:last\s+ned|hent|finn|søk\s+etter)?\s*(?:episode\s+)?s(\d{1,2})\s*e(\d{1,3})\s+(?:av|fra|i)\s+(.+?)\s*[?.!]*$/i;
/** «Last ned siste episode fra 9-1-1» → {title:'9-1-1', pick:'latest', download:true} | null. */
export function parseEpisodeAsk43(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  let m = SXE_RE43.exec(t);
  if (m) return { title: m[3].replace(/^[«"']|[»"']$/g, '').trim(), pick: 'exact', season: +m[1], episode: +m[2], download: true };
  m = EP_RE43.exec(t);
  if (!m) return null;
  const pick = /neste|kommende/i.test(m[2]) ? 'next' : 'latest';
  const title = m[3].replace(/^[«"']|[»"']$/g, '').replace(/\s+(?:i\s+(?:4k|hd|1080p?|720p?))$/i, '').trim();
  if (!title || title.length > 80) return null;
  return { title, pick, download: /last\s+ned|hent|søk/i.test(m[1] ?? '') || (!m[1] && pick === 'latest') };
}

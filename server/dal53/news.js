// Prompt 53 (DAL53): Gist – emner på nyhetssaker, lagret per sak (rss_item er per bruker, så emnene er også det).
//   - En bakgrunnsjobb merker nye saker (tittel + ingress) når Gist er klar og flagget er på for eieren av kilden.
//   - Nyheter-kategoriene: saker fra «Auto»-kilder uten kjent kategori får kategori fra emnet (sport, teknologi, økonomi, kultur)
//     i stedet for standarden «norge». Gist kan ikke skille innenriks og utenriks, så norge/verden kommer fortsatt fra kilden/AI.
//   - «For deg»: en interesse treffer også når den matcher et emne (f.eks. «fotball» → sport, «aksjer» → økonomi).
// Reserve: uten Gist er alt som før (nøkkelord, kilde og AI-kategorisering).
import { db } from '../db.js';
import { categoryOfTopic53 } from './topics.js';
import { use53, ready53 } from './models.js';
import { on53 } from './flags.js';

export { categoryOfTopic53, interestMatchesTopics53, topicsOf53, gistCategory53, topicSlugs53 } from './topics.js';
const q = (sql) => db.prepare(sql);

/** Merk opptil n saker som mangler emner. → antall merket. */
export async function tagPending53({ limit = 60 } = {}) {
  if (!ready53('gist')) return 0;
  const rows = q(`SELECT i.id, i.title, i.excerpt, f.user FROM rss_item i JOIN rss_feed f ON f.id=i.feed_id
    LEFT JOIN news_topics53 t ON t.item_id=i.id WHERE t.item_id IS NULL ORDER BY i.published DESC LIMIT ?`).all(limit * 2);
  const ins = q('INSERT OR REPLACE INTO news_topics53(item_id, topics, top, category, model, at) VALUES(?,?,?,?,?,?)');
  let n = 0;
  for (const r of rows) {
    if (n >= limit) break;
    if (!on53('dal_gist53', r.user)) continue;
    const text = `${r.title ?? ''}${r.excerpt ? `. ${String(r.excerpt).slice(0, 300)}` : ''}`.trim();
    if (!text) continue;
    // eslint-disable-next-line no-await-in-loop
    const topics = await use53('gist', (g) => g.classify(text, { topK: 3 }), { timeoutMs: 3000 });
    if (!Array.isArray(topics)) break; // modellen ble borte – prøv neste runde
    const clean = topics.filter((t) => t && t.slug).map((t) => ({ slug: String(t.slug), name: String(t.name ?? t.slug), score: Math.round(Number(t.score) * 1000) / 1000 }));
    const cat = clean.map((t) => categoryOfTopic53(t.slug)).find(Boolean) ?? null;
    ins.run(r.id, JSON.stringify(clean), clean[0]?.slug ?? null, cat, 'gist', Date.now());
    n++;
  }
  return n;
}

let timer = null;
/** Bakgrunnsjobben (hvert 5. minutt; starter Gist-lastingen når det finnes saker uten emner). */
export function startNews53() {
  if (timer || process.env.NODE_ENV === 'test') return;
  const tick = async () => {
    try {
      q('DELETE FROM news_topics53 WHERE item_id NOT IN (SELECT id FROM rss_item)').run(); // saker som er ryddet bort
      const any = q('SELECT 1 FROM rss_item i LEFT JOIN news_topics53 t ON t.item_id=i.id WHERE t.item_id IS NULL LIMIT 1').get();
      if (any && on53('dal_gist53', null)) { ready53('gist'); const n = await tagPending53(); if (n) console.info(`[dal53] Gist: emner på ${n} nyhetssaker`); }
    } catch (e) { console.warn('[dal53] Gist-jobben:', e.message); }
  };
  timer = setInterval(tick, 5 * 60_000); timer.unref?.();
  setTimeout(tick, 60_000).unref?.();
}

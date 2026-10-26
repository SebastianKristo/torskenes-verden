// Prompt 61 (prompt 49 del 1): testtilfeller fra rettelser i Glimt (eval/learned/*.json, skrevet av server/recipes61/learn.js).
// Fila er data (teksten kommer fra brukeren), aldri kode. Casen: seed minnet (personen) og – når «Glimt lærer» er på – den lærte
// oppskriften og det negative eksemplet; still det opprinnelige spørsmålet; sjekk at planen bruker de riktige verktøyene og ikke
// gjentar den feile planen. Dataene (kalender, finans) til brukeren finnes ikke i eval, så bare planen sjekkes.
const norm = (x) => JSON.stringify(x ?? null).toLowerCase();

export function caseFromLearned61(doc, file = '') {
  return {
    id: `L-${String(doc.id ?? file).replace(/[^\w-]+/g, '').slice(0, 40)}`, title: String(doc.title ?? 'Lært rettelse').slice(0, 120), area: 'lært', intent: doc.expect?.intent ?? null,
    seed: {},
    async run(h, ck) {
      for (const m of doc.memory ?? []) {
        if (!m?.match || !m?.type) continue;
        const r = await h.A('/api/glimt/memory', 'POST', { match: String(m.match).slice(0, 80), type: String(m.type).slice(0, 40) });
        if (r.status !== 201 && r.status !== 200) throw new Error(`Seed minne ${m.match}: ${r.status}`);
      }
      if (process.env.EVAL_RECIPES61 !== 'off') await h.seedLearned61(doc);
      const s = await h.ask(String(doc.query).slice(0, 1000), doc.module ?? 'home');
      ck('svarte', s.status === 200 && s.reply, `HTTP ${s.status} ${s.error ?? ''}`);
      const plan = h.glimtTrace(s)?.plan ?? null;
      const tools = (plan?.calls ?? []).map((c) => c.tool);
      const want = doc.expect?.tools ?? [];
      ck(`planen bruker ${want.join(', ') || '(ingen)'}`, want.every((t) => tools.includes(t)), `plan: ${JSON.stringify(plan?.calls ?? []).slice(0, 300)}`);
      const wrong = (doc.expect?.notCalls ?? []).map((c) => norm({ tool: c.tool, args: c.args }));
      ck('gjentar ikke den feile planen', !(plan?.calls ?? []).some((c) => wrong.includes(norm({ tool: c.tool, args: Object.fromEntries(Object.entries(c.args ?? {}).filter(([k]) => !k.startsWith('_'))) }))), `feil: ${wrong.join(' | ').slice(0, 300)}`);
      ck.info('rettelsen', `«${doc.correction ?? ''}» · oppskrift ${s.recipe?.use ?? 'ingen'}`);
    },
  };
}

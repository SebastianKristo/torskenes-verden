// Prompt 60 (prompt 49 del 3, D3SRV): verktøyet subscriptions.cancel i det felles registeret (TOOLS45). «si opp det» etter
// «Hva er det dyreste abonnementet mitt?» → målet kommer fra samtaletilstanden (subscription_id fylt inn av koden, aldri av modellen),
// og verktøyet er DESTRUKTIVT: motoren lagrer planen og ber alltid om bekreftelse (confirm.token) – aldri utført på en gjetning.
// Utført = abonnementet markeres som sagt opp i Subscription OS (fh_subscriptions.active=0). Selve oppsigelsen hos leverandøren må
// brukeren gjøre selv; svaret sier det.
import { db } from '../db.js';
import { TOOLS45, TOOL45, kr45 } from '../glimt45/tools.js';
import { SENTENCES46, FAIL_TEXT46 } from '../glimt45/tools46.js';
import { findService46, serviceInText46, subscriptions46 } from '../glimt45/subs46.js';

const q = (sql) => db.prepare(sql);
const str = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const sTxt = (d) => ({ type: 'string', description: d });
const krm = (v) => kr45(Math.round(v * 100) / 100);
const PRON60 = /^(?:den|det|dem|denne|dette|abonnementet|tjenesten|den\s+dyreste|det\s+dyreste|den\s+billigste|det\s+billigste)$/i;

async function subInfo(user, id, today) {
  const row = q('SELECT * FROM fh_subscriptions WHERE id=? AND user_id=?').get(Number(id), user);
  if (!row) return null;
  let monthly = null;
  try { monthly = (await subscriptions46(user, today)).items.find((x) => x.kind === 'subscription' && x.id === row.id)?.monthly ?? null; } catch { /* */ }
  return { id: row.id, name: row.name, plan: row.plan || '', active: !!row.active, monthly };
}

export const cancelTool60 = {
  name: 'subscriptions.cancel', module: 'finance', destructive: true,
  description: 'Marker et abonnement som sagt opp i Subscription OS (krever bekreftelse). service = tjenesten («Netflix»), tomt/«det» = det fra forrige svar.',
  parameters: S({ service: sTxt('Tjenesten brukeren vil si opp, slik den ble omtalt («Netflix», «det»)'), subscription_id: sTxt('Id hvis kjent') }),
  async validate(args, ctx) {
    // Målet: id fra samtaletilstanden/valget (koden) → navnet i teksten (registrerte abonnementer) → modellens tjenestenavn hvis det står i teksten.
    let id = Number(args.subscription_id ?? (String(ctx.context?.selectedId ?? '').match(/^(?:sub[:-])?(\d+)$/)?.[1] ?? NaN));
    if (!Number.isInteger(id) || id <= 0) {
      const sv = str(args.service, 60);
      const named = serviceInText46(ctx.user, ctx.text) ?? (sv && !PRON60.test(sv) && ctx.text.toLowerCase().includes(sv.toLowerCase()) ? sv : null);
      const hits = named ? findService46(ctx.user, named).filter((x) => x.kind === 'subscription') : [];
      if (hits.length === 1) id = hits[0].id;
      else {
        const all = q('SELECT id, name, plan, price, cycle FROM fh_subscriptions WHERE user_id=? AND active=1 ORDER BY name').all(ctx.user);
        const pool = hits.length > 1 ? hits.map((h) => h.row) : all;
        if (!pool.length) return { error: 'Du har ingen aktive abonnementer i Subscription OS' };
        return { ask: { question: named && !hits.length ? `Fant ikke «${named}» blant abonnementene dine. Hvilket vil du si opp?` : 'Hvilket abonnement vil du si opp?', options: pool.slice(0, 5).map((s) => ({ id: `sub-${s.id}`, label: `${s.name}${s.plan ? ` (${s.plan})` : ''}` })), field: 'subscription' } };
      }
    }
    const s = await subInfo(ctx.user, id, ctx.today);
    if (!s) return { error: 'Fant ikke abonnementet' };
    if (!s.active) return { error: `«${s.name}» er allerede markert som sagt opp i Subscription OS` };
    return { args: { id: s.id, name: s.name, plan: s.plan, monthly: s.monthly }, summary: `Si opp **${s.name}**${s.plan ? ` (${s.plan})` : ''}${s.monthly ? `, ${krm(s.monthly)}/mnd` : ''}? Jeg markerer det som sagt opp i Subscription OS – selve oppsigelsen hos ${s.name} må du gjøre der.` };
  },
  async run(a, ctx) {
    const n = q('UPDATE fh_subscriptions SET active=0 WHERE id=? AND user_id=? AND active=1').run(a.id, ctx.user).changes;
    if (!n) return { status: 'failed', error: 'Abonnementet var allerede sagt opp eller finnes ikke' };
    return { status: 'done', result: { subscription: { id: a.id, name: a.name, plan: a.plan }, cancelled: true, open: { web: '/finans/#/abonnement', deepLink: 'finanshub://abonnement' } }, cards: [{ kind: 'subscription', id: String(a.id), title: a.name, subtitle: 'Sagt opp i Subscription OS', open: { web: '/finans/#/abonnement', deepLink: 'finanshub://abonnement' } }] };
  },
  async verify(r, ctx) { const row = q('SELECT active FROM fh_subscriptions WHERE id=? AND user_id=?').get(r.result?.subscription?.id, ctx.user); return !!row && !row.active; },
};

SENTENCES46['subscriptions.cancel'] = (a, r) => `Markerte **${r.result.subscription.name}** som sagt opp i Subscription OS. Husk å si det opp hos ${r.result.subscription.name} også, ellers fortsetter trekkene.`;
FAIL_TEXT46['subscriptions.cancel'] = 'Fikk ikke sagt opp abonnementet';
if (!TOOL45[cancelTool60.name]) {
  const i = TOOLS45.findIndex((x) => x.name === 'app.answer');
  TOOLS45.splice(i < 0 ? TOOLS45.length : i, 0, cancelTool60);
  TOOL45[cancelTool60.name] = cancelTool60;
}

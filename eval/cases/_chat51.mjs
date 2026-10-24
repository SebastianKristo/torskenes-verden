// Prompt 51 (RCPTSRV51): felles for chat-casene 17–19 – bilde i Glimt-chatten slik appen sender det
// (POST /api/chat/files → POST /api/chat/send med attachments, SSE-svar).
export const sse51 = (text) => String(text ?? '').split(/\n\n+/).filter(Boolean).map((blk) => ({ event: blk.match(/^event: (.+)$/m)?.[1] ?? 'message', data: (() => { const d = blk.match(/^data: (.*)$/m)?.[1]; try { return d ? JSON.parse(d) : null; } catch { return d; } })() }));

/** Laster opp bildet og spør i chatten. → {status, ev, text, done, error, meta, ms} */
export async function askImage51(h, file, content, model = 'qwen3:8b') {
  const t0 = Date.now();
  const up = await h.upload('/api/chat/files', file);
  if (up.status !== 200 || !up.body?.id) return { status: up.status, error: `opplasting: HTTP ${up.status}`, ev: [], text: '', ms: Date.now() - t0 };
  const r = await h.A('/api/chat/send', 'POST', { model, messages: [{ role: 'user', content, attachments: [up.body.id] }] });
  const ev = sse51(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
  const text = ev.filter((e) => e.event === 'delta').map((e) => e.data?.text ?? '').join('');
  const done = ev.find((e) => e.event === 'done')?.data ?? null;
  const error = ev.find((e) => e.event === 'error')?.data?.error ?? (r.status >= 400 ? JSON.stringify(r.body).slice(0, 300) : null);
  const meta = ev.filter((e) => e.event === 'meta').at(-1)?.data ?? null;
  h.steps.push({ kind: 'chat-bilde', file, content, model, status: r.status, msTotal: Date.now() - t0, readWith: done?.readWith ?? meta?.readWith ?? null, error, reply: text.slice(0, 1200) });
  return { status: r.status, ev, text, done, error, meta, ms: Date.now() - t0 };
}

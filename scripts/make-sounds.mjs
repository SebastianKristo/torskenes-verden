// Lager de innebygde varsellydene (public/sounds/*.wav): korte, rene toner, 16-bit mono 22,05 kHz.
// Kjør på nytt med «node scripts/make-sounds.mjs» hvis lydene skal endres.
import { writeFileSync, mkdirSync } from 'node:fs';
const RATE = 22050;
// Hver lyd er en liste toner: [startsekund, varighet, frekvens, styrke, overtone-andel]
const SOUNDS = {
  klokke: [[0, 0.9, 880, 0.55, 0.35], [0, 0.9, 1320, 0.18, 0]],
  pling: [[0, 0.35, 1568, 0.5, 0.15]],
  papir: [[0, 0.12, 660, 0.35, 0.1], [0.11, 0.18, 990, 0.35, 0.1]],
  dobbel: [[0, 0.16, 1175, 0.45, 0.2], [0.22, 0.22, 1175, 0.45, 0.2]],
  dyp: [[0, 0.8, 196, 0.6, 0.4], [0, 0.8, 392, 0.2, 0]],
};
mkdirSync(new URL('../public/sounds/', import.meta.url), { recursive: true });
for (const [name, tones] of Object.entries(SOUNDS)) {
  const len = Math.ceil(RATE * Math.max(...tones.map(([s, d]) => s + d)) + RATE * 0.05);
  const pcm = new Float32Array(len);
  for (const [start, dur, f, amp, over] of tones) {
    const s0 = Math.floor(start * RATE), n = Math.floor(dur * RATE);
    for (let i = 0; i < n; i++) {
      const t = i / RATE, env = Math.min(1, i / (RATE * 0.005)) * Math.exp(-4.5 * t / dur);
      pcm[s0 + i] += amp * env * (Math.sin(2 * Math.PI * f * t) + over * Math.sin(4 * Math.PI * f * t));
    }
  }
  const buf = Buffer.alloc(44 + len * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(len * 2, 40);
  for (let i = 0; i < len; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32000), 44 + i * 2);
  writeFileSync(new URL(`../public/sounds/${name}.wav`, import.meta.url), buf);
}
console.log('Laget', Object.keys(SOUNDS).join(', '));

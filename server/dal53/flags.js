// Prompt 53 (DAL53): feature flags for modellene (QA51 via flags53.js – PÅ første gang de opprettes, admin kan slå av).
import { defineFlagOn53, flagOn53, flagDefault53 } from '../flags53.js';
import { currentUser } from '../settings.js';

export const FLAGS53 = {
  dal_eye53: 'Eye (Desert Ant Labs): bildetype og rotasjon i Glimt-chat og kvitteringer (reserve: dagens OCR-heuristikk).',
  dal_redact53: 'Redact (Desert Ant Labs): personopplysninger byttes med plassholdere før tekst går til sky-modeller og nettsøk.',
  dal_gist53: 'Gist (Desert Ant Labs): emner på nyhetssaker (kategorier og «For deg»).',
  dal_tongue53: 'Tongue (Desert Ant Labs): Glimt svarer på samme språk som meldingen (norsk ved tvil).',
  dal_emo53: 'Emo (Desert Ant Labs): emoji-forslag for gjøremål, kalender og huskeliste.',
  dal_moderator53: 'Moderator (Desert Ant Labs): upassende bilder skjules for barnekontoer.',
  dal_voice53: 'Clear + Voz (Desert Ant Labs): lokal tale til tekst med ordtider.',
};
for (const [k, d] of Object.entries(FLAGS53)) { try { defineFlagOn53(k, d); } catch (e) { console.warn('[dal53] flagg:', k, e.message); } }

/** Er flagget på for brukeren (eller serverstandarden utenfor forespørsler)? */
export function on53(flag, user = undefined) {
  const u = user === undefined ? currentUser() : user;
  try { return u ? flagOn53(flag, u) : flagDefault53(flag); } catch { return false; }
}

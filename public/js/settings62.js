// Prompt 62 (prompt 49 del 2, D2WEB): Innstillinger → Faste oppgaver (/#/innstillinger/faste-oppgaver, se SERVER62-API.md §3).
// Siden tegnes av sched62.js (mountSched62) i en [data-mount-host]-plass som beholdes mellom omtegninger.
import { TAB_IC } from './settings-search.js';
import { mountSched62 } from './sched62.js';

const P62 = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2';
Object.assign(TAB_IC, { 'faste-oppgaver': ['#7a3b6b', P62] });
/** [id, navn, undertekst, seksjon, ikon] – settes inn i TABS i settings.js (under Glimt). */
export const TABS62 = [['faste-oppgaver', 'Faste oppgaver', 'Planlagte oppgaver og varsler du har bedt Glimt om: neste kjøring, logg, pause og kjør nå.', 'Glimt', P62]];
export const ALIAS62 = { faste: 'faste-oppgaver', oppgaver62: 'faste-oppgaver', planlagt: 'faste-oppgaver', planlagte: 'faste-oppgaver', schedules: 'faste-oppgaver', paaminnelser: 'faste-oppgaver' };

export function fasteView62(H) {
  const { group, row } = H;
  return {
    html: '<div class="s62-host" data-mount-host></div>',
    mount: (slot) => mountSched62(slot),
    search: [group('Faste oppgaver', [
      row({ t: 'Faste oppgaver', s: 'Planlagte oppgaver fra Glimt: neste kjøring, siste kjøringer, pause, slett, kjør nå', go: 'faste-oppgaver', btn: 'Åpne', k: 'faste oppgaver planlagte planlagt gjentakende hver morgen påminnelse minn meg strømpris varsel kjør nå pause' }),
      row({ t: 'Betingede varsler', s: 'Si fra hvis strømprisen går over en grense – sjekkes i koden', go: 'faste-oppgaver', btn: 'Åpne', k: 'betingelse betinget varsel strømpris over grense temperatur under' }),
      row({ t: 'Prisområde for strøm', s: 'NO1–NO5 for strømprisoppgaver', go: 'faste-oppgaver', btn: 'Åpne', k: 'prisområde strøm no1 no2 no3 no4 no5 spotpris' }),
    ])],
  };
}

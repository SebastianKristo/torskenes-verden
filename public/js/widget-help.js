// Prompt 33: felles tekst for Innstillinger → «Widgets» (Slik legger du til widget) og «Kalender-appen», brukt av
// web (settings-app.js) og PWA (finans/js/mobile-p33.js). Kilde: claude-code-widgets-vises-ikke.md og kontrakten (WEB33).

export const RELEASES = 'https://github.com/SebastianKristo/torskenes-verden/releases/latest';

/** [id, navn, steg[]] per plattform. */
export const WIDGET_STEPS = [
  ['iphone', 'iPhone', [
    'Installer Homelab-appen (og Kalender-appen) – widgets finnes bare i de native appene, ikke i PWA-en eller en snarvei fra Safari.',
    'Åpne appen én gang og logg inn, så widgetene får data.',
    'Hold inne på et tomt sted på Hjem-skjermen til ikonene vrikker.',
    'Trykk + (eller «Rediger» → «Legg til widget») øverst til venstre.',
    'Søk etter «Homelab», «Prøveperioder» eller «Kalender», velg størrelse og trykk «Legg til widget».',
    'Låseskjerm: hold inne på låseskjermen → Tilpass → Låseskjerm → trykk feltet under klokka og velg widgeten.',
  ]],
  ['samsung', 'Samsung (One UI)', [
    'Installer Homelab-appen (og Kalender-appen) som APK og åpne den én gang.',
    'Hold inne på et tomt sted på Hjem-skjermen og trykk «Widgets».',
    'Søk etter «Homelab» eller «Kalender», trykk appen og dra widgeten dit du vil ha den.',
    'Vises ikke appen i lista: Innstillinger → Apper → One UI Home → Tving avslutning, og prøv igjen.',
  ]],
  ['android', 'Android', [
    'Installer Homelab-appen (og Kalender-appen) som APK og åpne den én gang.',
    'Hold inne på et tomt sted på Hjem-skjermen og trykk «Widgets».',
    'Finn «Homelab» eller «Kalender» i lista, hold inne på widgeten og slipp den på Hjem-skjermen.',
    'Endre størrelse ved å holde inne på widgeten og dra i kantene.',
  ]],
];
export const WIDGET_NOTE = 'Widgetene viser eksempeldata i galleriet og ekte data når du er logget inn. De oppdateres når noe endres i appen, og minst hver halvtime.';

export const KAL_APP = {
  lead: 'Kalender er en egen app for iPhone og Android med samme konto og samme data som Homelab. Den har egne widgets (Hjem og låseskjerm), Glimt og varsler.',
  points: [
    'Logg inn med Homelab-appen (samme telefon), eller med serveradresse, brukernavn og passord.',
    'Kalender-lenker i Homelab-appen (widget, kalenderfanen, Glimt) åpner Kalender-appen når den er installert.',
    'iPhone: last ned «Kalender-<versjon>-unsigned.ipa» og installer med samme verktøy som Homelab-appen (f.eks. iloader/AltStore).',
    'Android: last ned «Kalender-<versjon>.apk», tillat «Installer ukjente apper» og åpne filen.',
  ],
  pwa: 'I nettappen (PWA) åpnes kalenderen her i appen – en nettside kan ikke åpne den native appen pålitelig.',
};

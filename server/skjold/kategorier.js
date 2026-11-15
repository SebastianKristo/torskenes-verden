// Skjold Lab: den ene standardlisten over kategorier (Fase 6, E-ia «Datakategorier»). Før hadde AI-standarden «Kabler»,
// «Dioder og LED» og «Skruer og bolter», mens demodataene hadde «Kabel», «LED» og «Skruer». Nå bruker AI-forslaget
// (decode.js), demodataene (store.js) og GET /api/skjold/categories (feltet standard) samme liste.
// Brukerens egne kategorier endres aldri: AI-en velger blant dem først (chooseCategory77), og listen her brukes bare når
// brukeren ikke har en som passer, og i demodata.

/** Standardkategoriene, i den rekkefølgen de vises. */
export const KATEGORIER = Object.freeze(['Motstander', 'Kondensatorer', 'Dioder og LED', 'Transistorer', 'IC-er', 'Mikrokontrollere', 'Sensorer', 'Moduler',
  'Kontakter', 'Kabler', 'Skruer og bolter', 'Mutre og skiver', 'Avstandsstykker', 'Brytere', 'Sikringer', 'Verktøy', 'Diverse']);

/**
 * Synonymer per standardkategori (små bokstaver, uten aksenter), så en eksisterende kategori «Skruer» passer til «Skruer og bolter»,
 * «LED» til «Dioder og LED» osv. Samme rekkefølge som KATEGORIER.
 */
export const SYNONYMER = Object.freeze([
  ['motstand', 'motstander', 'resistor', 'resistorer', 'resistors', 'potensiometer'], ['kondensator', 'kondensatorer', 'capacitor', 'capacitors', 'elko', 'elektrolytt'],
  ['dioder og led', 'diode', 'dioder', 'led', 'leder', 'lysdioder', 'leds'], ['transistor', 'transistorer', 'mosfet', 'transistors'], ['ic', 'ic-er', 'icer', 'kretser', 'integrerte kretser', 'chips'],
  ['mikrokontroller', 'mikrokontrollere', 'microcontrollers', 'mcu', 'utviklingskort', 'dev boards'], ['sensor', 'sensorer', 'sensors'], ['modul', 'moduler', 'modules', 'breakout'],
  ['kontakt', 'kontakter', 'connectors', 'kabelsko', 'plugger', 'terminaler'], ['kabel', 'kabler', 'ledning', 'ledninger', 'cables', 'wire'], ['skrue', 'skruer', 'skruer og bolter', 'bolter', 'screws'],
  ['mutter', 'mutre', 'mutre og skiver', 'skiver', 'muttere', 'nuts'], ['avstandsstykke', 'avstandsstykker', 'standoffs', 'distanser'], ['bryter', 'brytere', 'switcher', 'knapper', 'switches'],
  ['sikring', 'sikringer', 'fuses'], ['verktoy', 'tools'], ['diverse', 'annet', 'misc', 'ukjent'],
].map(Object.freeze));

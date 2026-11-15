// Én gruppering av integrasjonene (shared/schemas/tilkoblinger.json, E-ia O8). GET /api/integrations (group og category) og
// GET /api/config (category) tar gruppenavnet herfra. Egen fil uten tunge importer, så settings.js kan bruke den.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'schemas', 'tilkoblinger.json');
export const TILKOBLINGER = Object.freeze(JSON.parse(readFileSync(FILE, 'utf8')));

const NAVN = new Map(TILKOBLINGER.grupper.map((g) => [g.id, g.navn]));
/** Gruppenavnet («Smarthjem», «Media» …) for en integrasjon (id fra /api/integrations eller /api/config). Ukjent id → «Generelt». */
export const tilkoblingsgruppe = (id) => NAVN.get(TILKOBLINGER.integrasjoner[String(id ?? '').toLowerCase()]) ?? NAVN.get('generelt');
/** Gruppenavnene i fast rekkefølge, til sortering og visning. */
export const TILKOBLINGSGRUPPER = Object.freeze(TILKOBLINGER.grupper.map((g) => g.navn));

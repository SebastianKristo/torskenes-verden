package no.kristo.finanshub.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/*
 * Prompt 50 (ANDROID50B, claude-code-lik-bakgrunnshoyde.md, fasit «heroH»/«heroPb» i Mobil Papir App.dc.html):
 * alle faner med toppbilde har samme høyde som Hjem – 226 dp på telefon og 250 dp på Fold/brett, målt fra toppen av skjermen
 * (statuslinjen er med) – og samme bunnpolstring 42 dp. Innholdskortet ligger 23 dp opp i bildet likt overalt (underNav34),
 * så bunnkanten av bildet står helt i ro ved fanebytte. Nordlys og Gjøremål har egne topper (150 dp) og bruker ikke denne.
 */

/** Høyden på toppbildet: 190 dp + statuslinjen (≈ 226 dp) på telefon, 214 dp + statuslinjen (≈ 250 dp) på bred skjerm. */
internal fun heroHeight50(wide: Boolean, statusTop: Dp): Dp = (if (wide) 214.dp else 190.dp) + statusTop

/** Bunnpolstringen i toppbildet (tittel og kicker ligger nederst). */
internal val HERO_PB50: Dp = 42.dp

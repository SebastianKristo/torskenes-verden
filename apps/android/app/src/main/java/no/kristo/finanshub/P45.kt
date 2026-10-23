package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/*
 * Prompt 45 (ANDROID45), kontrakten CONTRACT45.md og design_handoff_homelab/prompts/prompt-45-pakke/:
 *  - Fold/brett: felles LayoutMode (≥ 700 dp), sidelinja med skann, Hjem-animasjon og wiggle-knapper (ui/Fold45.kt),
 *    søkefeltet over tastaturet (ui/Fold41.kt), Familie og Gjøremål på stor skjerm (ui/Family45.kt, ui/Tasks45.kt).
 *  - Wiggle-dra på Android: rotårsaken og fiksen står i ui/Wiggle45.kt.
 *  - Felles mobilpunkter (Glimt-agent, Ruter antall, sonevarsler, Glimt-svar bare som systemvarsel …) i P45b.kt.
 * Serverformene lages parallelt (SERVER45/GLIMT45); 404 = «finnes ikke på serveren ennå», og appen faller tilbake til det gamle.
 */
class P45State {
    /** Hjem-knappen i sidelinja er på vei ut (animasjonen spilles før sidebyttet). */
    var homeLeaving by mutableStateOf(false)
    /** Doble trykk på Hjem ignoreres mens animasjonen pågår. */
    internal var homeBusy = false
    /** Sist viste redigering i sidelinja (så knappene kan animeres ut med riktig innhold). */
    internal var lastEdit: String? = null
    /** ✓ i sidelinja for Finans → Mer (redigeringen er lokal i rutenettet). */
    var fmDoneSeq by mutableIntStateOf(0)
    /** Familie på brett: valgt person (høyre kolonne) og en forespørsel om å zoome kartet til personen. */
    var famSel by mutableStateOf<String?>(null)
    var famZoomSeq by mutableIntStateOf(0)
    /** Gjøremål på brett: filterpillene (alle · idag · imorgen · uke · udato) og personvelgeren (null = alle). */
    var taskWhen by mutableStateOf("alle")
    var taskWho by mutableStateOf<String?>(null)
    /** Ruter: antall anbefalte reiser (1–3, standard 2), per bruker på serveren. */
    var recoCount by mutableIntStateOf(2)
    internal var recoFor: String? = null
    /** Glimt-agenten: null = ukjent, false = serveren mangler /api/glimt/agent (404), bruk /api/assist. */
    internal var agentOk: Boolean? = null
    /** «Bekreft» for en handling Glimt foreslo (POST /api/glimt/agent/confirm {token}). */
    var agentConfirm by mutableStateOf<Pair<String, String>?>(null)
    /** Sonevarsler (GET/PUT /api/family/zone-alerts): hovedbryter og av/på per person. null = ikke hentet / eldre server. */
    var zoneAlerts by mutableStateOf<ZoneAlerts45?>(null)
    internal var zoneAlertsFor: String? = null
    /** Vær: «Min posisjon» (GET /api/weather/here). */
    var here by mutableStateOf<WxHere45?>(null)
    var hereState by mutableStateOf("idle") // idle · loading · denied · ok · error · missing
    internal var hereAt = 0L
    /** Innstillinger → Helse → Home Assistant: «phones» (Telefoner) eller «all» (Alle mobilapp), og serverens tekster. */
    var haView by mutableStateOf("phones")
    var haHidden by mutableStateOf<String?>(null)
    var haStatus by mutableStateOf<String?>(null)
}

data class ZoneAlertPerson45(val id: String, val name: String, val initials: String, val color: Long?, val on: Boolean)
data class ZoneAlerts45(val on: Boolean, val people: List<ZoneAlertPerson45>)
data class WxHere45(val place: String, val temp: Double?, val text: String?, val hi: Double?, val lo: Double?, val same: Boolean)

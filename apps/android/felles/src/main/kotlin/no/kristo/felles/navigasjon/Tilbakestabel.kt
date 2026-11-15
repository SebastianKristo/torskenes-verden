package no.kristo.felles.navigasjon

/**
 * Ett lag som «tilbake» kan lukke: et ark, en detaljside, en underside eller en fane.
 * [navn] er lagets rute-id (stabil, for logg, tester og skallet), [aktiv] sier om laget er åpent, og [lukk] er hva tilbake gjør.
 */
class Tilbakesteg(val navn: String, val aktiv: () -> Boolean, val lukk: () -> Unit)

/**
 * Tilbakestabelen for en app der skjermene styres av tilstand (ingen NavHost): lagene står i rekkefølge fra øverst (det som
 * ligger over alt annet) til nederst, og tilbake lukker det første laget som er åpent. Ingen åpne lag = rotsiden: [tilbake]
 * gir false, og systemet lukker appen (eller viser forhåndsvisningen av hjemskjermen).
 *
 * Erstatter `when`-kjeden med ca. 30 grener i AppViewModel.back() (D-android §4 #1). Hver gren er nå et navngitt steg, så
 * skallet kan vise hvor tilbake fører ([aktivt]), og bølge 2 kan flytte et lag til en egen skjerm uten å lete i kjeden.
 */
class Tilbakestabel(private val steg: List<Tilbakesteg>) {
    init {
        val dupl = steg.groupBy { it.navn }.filterValues { it.size > 1 }.keys
        require(dupl.isEmpty()) { "Samme navn på flere steg: $dupl" }
    }

    /** Laget tilbake lukker nå, eller null på rotsiden. */
    fun aktivt(): Tilbakesteg? = steg.firstOrNull { it.aktiv() }

    /** Navnet på laget tilbake lukker nå («rot» på rotsiden). */
    fun rute(): String = aktivt()?.navn ?: ROT

    /** Lukker det øverste åpne laget. false når ingenting er åpent (rotsiden). */
    fun tilbake(): Boolean {
        val s = aktivt() ?: return false
        s.lukk()
        return true
    }

    /** Alle stegene i rekkefølge (for tester og dokumentasjon). */
    val navn: List<String> get() = steg.map { it.navn }

    companion object {
        const val ROT: String = "rot"
    }
}

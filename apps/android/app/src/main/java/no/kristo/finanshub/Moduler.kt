package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import no.kristo.felles.moduler.Fanenokler
import no.kristo.felles.moduler.Modul
import no.kristo.felles.moduler.Modulliste

/*
 * Modullisten i appen (Fase 6). Navn, ikoner og rekkefølge på fanene, i Mer og i modulvelgeren kommer fra
 * GET /api/moduler?plattform=android. Lista bufres per konto, og den sist kjente brukes uten nett. Uten buffer brukes kopien av
 * shared/schemas/moduler.json som er bygd inn i :felles. Det finnes ingen egen håndskrevet liste i appen; fanenøklene
 * (hjem, huske, avganger …) er beholdt som alias, så lagrede oppsett virker som før (felles Fanenokler).
 */
object Moduler {
    private val TOM: Modulliste = Modulliste(1, emptyList(), emptyList(), emptyList(), emptyList(), emptyList())

    /**
     * Den innebygde lista for Android. Leses først når den trengs (ressursen ligger i APK-en), så oppstarten med en bufret liste
     * ikke venter på den. Tom liste bare hvis appen er feil bygd (da virker fanene med de gamle tegnene og nøklene).
     */
    val innebygd: Modulliste by lazy { (Modulliste.innebygd() ?: TOM).forPlattform("android") }

    private var lest by mutableStateOf<Modulliste?>(null)

    /** Lista som gjelder nå (fra serveren, bufferen eller den innebygde). */
    var liste: Modulliste
        get() = lest ?: innebygd
        set(v) { lest = v }

    private var fanerFor: Modulliste? = null
    private var fanerCache: List<TabItem> = emptyList()

    /** Navnet på en modul, eller [reserve] når modulen ikke finnes i lista. */
    fun navn(id: String, reserve: String): String = liste.navn(id) ?: innebygd.navn(id) ?: reserve

    fun modul(id: String): Modul? = liste.modul(id)

    /** Modulen finnes for brukeren (serveren sender bare moduler brukeren har tilgang til). */
    fun har(id: String): Boolean = liste.modul(id) != null

    /** Navnet på Oversikt (startsiden, Q1). */
    val oversikt: String get() = navn("oversikt", "Oversikt")

    /** Fanene hovedlinja kan ha: modulene i listens rekkefølge, så sidene som ikke er moduler. «Mer» står alltid sist. */
    fun faner(): List<TabItem> {
        val l = liste
        if (fanerFor === l) return fanerCache
        val ut = ArrayList<TabItem>()
        for (m in l.moduler) {
            val k = Fanenokler.fra(m.id) ?: continue
            if (k == "hjem") continue // Oversikt har egen plass først i linja.
            ut.add(TabItem(k, m.navn, fanetegn(m.ikon.tegn, k)))
            // Bursdager er et filter i Kalender (Q5), men kan fortsatt ligge i fanelinja.
            if (m.id == "kalender") m.undersider.firstOrNull { it.id == "bursdager" }?.let { ut.add(TabItem("bursdag", it.navn, "✿")) }
        }
        if (ut.none { it.id == "bursdag" }) ut.add(TabItem("bursdag", "Bursdager", "✿"))
        ut.addAll(EKSTRA_FANER)
        fanerFor = l
        fanerCache = ut
        return ut
    }

    /** Tegnet appen tegner med. Modullistens tegn brukes når appen har et ikon for det, ellers fanens gamle tegn. */
    private fun fanetegn(tegn: String, nokkel: String): String =
        if (tegn.isNotBlank() && (tegn in TAB_ICONS || tegn in MODUL_TEGN)) tegn else GAMLE_TEGN[nokkel] ?: "⋯"

    /** Brukes når serveren har sendt en gyldig liste. Lagres per konto, så den virker uten nett neste gang. */
    fun bruk(prefs: AppPrefs, konto: String?, tekst: String): Boolean {
        val l = Modulliste.fra(tekst) ?: return false
        liste = l.forPlattform("android")
        prefs.set(PREF + (konto ?: ""), l.tilJson().toString())
        return true
    }

    /** Den sist kjente lista for kontoen, ellers den innebygde. */
    fun lastLokalt(prefs: AppPrefs, konto: String?) {
        val raw = prefs.str(PREF + (konto ?: ""), "")
        lest = raw.takeIf { it.isNotBlank() }?.let { Modulliste.fra(it) }?.forPlattform("android")
    }

    private const val PREF = "moduler_"

    /** Sidene som kan ligge i fanelinja uten å være egne moduler (Økonomi-sider, Glimt, Innstillinger, Nordlys og Mer). */
    private val EKSTRA_FANER: List<TabItem> = listOf(
        TabItem("aksjer", "Aksjer", "↗"),
        TabItem("boliger", "Boliger", "⌂"),
        TabItem("abonnementer", "Faste betalinger", "↻"),
        TabItem("nordlys", "Nordlys", "≈"),
        TabItem("innst", "Innstillinger", "⚙"),
        TabItem("sok", "Glimt", "⌕"),
        TabItem("mer", "Mer", "⋯"),
    )

    /** Tegnene fra modullisten som appen har vektorikon for (ui/Paper17.kt glyphVector), i tillegg til TAB_ICONS. */
    val MODUL_TEGN: Set<String> = setOf("✦", "✧", "☑", "▦", "☼", "▶", "¶", "✎", "✝", "⚒", "⌁", "✶")

    /** Fanens tegn før modullisten, brukt når lista har et tegn appen ikke kan tegne. */
    private val GAMLE_TEGN: Map<String, String> = mapOf(
        "finans" to "kr", "mat" to "◐", "domener" to "◎", "sporing" to "▣", "familie" to "◉", "avganger" to "⇄", "vaer" to "☀",
        "nyheter" to "▤", "media" to "♪", "chat" to "✦", "huske" to "☑", "kalender" to "▦", "brief" to "✧", "bibel" to "✝",
    )

    /**
     * Navnene fanene hadde som standard før Fase 6. Et lagret oppsett med et av disse navnene har ikke fått eget navn av brukeren,
     * og får det nye navnet fra modullisten (flyttes én gang, [AppViewModel.migrerFaner]).
     */
    val GAMLE_NAVN: Map<String, Set<String>> = mapOf(
        "finans" to setOf("Finans", "FinansHub"),
        "avganger" to setOf("Avganger", "Ruter"),
        "brief" to setOf("Now Brief"),
        "nyheter" to setOf("Nyheter", "Nyhetsleser"),
        "huske" to setOf("Huskeliste"),
        "abonnementer" to setOf("Abonnementer", "Abonnement", "Subscription OS"),
        "sok" to setOf("Søk"),
        "familie" to setOf("Familie og kart"),
        "domener" to setOf("Domener/Sporing"),
    )
}

/** Henter modullisten for brukeren. Feiler den (gammel server, ikke nett), brukes den sist kjente. */
internal suspend fun AppViewModel.loadModuler() {
    val raw = runCatching { hentModulliste() }.getOrNull() ?: return
    if (Moduler.bruk(prefs, account?.id, raw)) migrerFaner()
}

/** Ved oppstart og kontobytte: den bufrede lista for kontoen. */
internal fun AppViewModel.loadLocalModuler() = Moduler.lastLokalt(prefs, account?.id)

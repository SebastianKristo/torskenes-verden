// Generert fra apps/android/app/widgets.json med «npm run widgets» (scripts/android-widgets.mjs). Ikke rediger for hånd.
package no.kristo.finanshub.widget

/** Én variant av en widget (Q31): standard, oneui, samsung eller laaseskjerm. [mottaker] er klassenavnet i widget-pakken. */
data class WidgetVariant(
    val widget: String,
    val gruppe: String,
    val type: String,
    val mottaker: String,
    val etikett: String,
    val galleri: String?,
    val storrelse: String?,
    /** Av i manifestet eller ikke: appen slår den på på Samsung-telefoner (S24.enableProviders). */
    val samsungPaa: Boolean,
) {
    val klasse: String get() = "no.kristo.finanshub.widget.$mottaker"
    val samsung: Boolean get() = type == "samsung"
}

object WidgetKatalog {
    /** Alle variantene, i samme rekkefølge som definisjonen. */
    val alle: List<WidgetVariant> = listOf(
        WidgetVariant("media", "Media", "standard", "MediaSmallReceiver", "Media 2×2", "Media", "2 × 2", false),
        WidgetVariant("media", "Media", "standard", "MediaMediumReceiver", "Media 4×2", "Media · Pause alt", "4 × 2", false),
        WidgetVariant("media", "Media", "standard", "MediaLargeReceiver", "Media 4×3", "Media · Kommer denne uka", "4 × 3", false),
        WidgetVariant("ruter", "Avganger", "standard", "RuterReceiver27S", "Ruter", "Ruter", "2 × 2", false),
        WidgetVariant("ruter", "Avganger", "standard", "RuterReceiver27M", "Ruter 4×2", "Ruter", "4 × 2", false),
        WidgetVariant("ruter", "Avganger", "standard", "RuterReceiver27Strip", "Ruter 4×1", "Ruter-stripe", "4 × 1", false),
        WidgetVariant("ruter", "Avganger", "samsung", "S27RuterSmallReceiver", "Ruter · Samsung", "Ruter · Samsung", "2 × 2", true),
        WidgetVariant("ruter", "Avganger", "samsung", "S27RuterWideReceiver", "Ruter 4×2 · Samsung", "Ruter · Samsung", "4 × 2", true),
        WidgetVariant("ruter", "Avganger", "samsung", "S27RuterStackReceiver", "Ruter stabel · Samsung", "Ruter-stabel · Samsung", "4 × 2", true),
        WidgetVariant("ruter", "Avganger", "samsung", "S24DeparturesReceiver", "Avganger · Samsung", null, null, true),
        WidgetVariant("ruter", "Avganger", "samsung", "S24DeparturesWideReceiver", "Avganger 4×2 · Samsung", null, null, true),
        WidgetVariant("ruter", "Avganger", "laaseskjerm", "LockSmallRuter40", "Avgang · låseskjerm", null, null, false),
        WidgetVariant("ruter", "Avganger", "laaseskjerm", "LockWideRuter40", "Avganger · låseskjerm", null, null, false),
        WidgetVariant("kalender", "Kalender", "standard", "KalReceiver26S", "Kalender", "Kalender", "2 × 2", false),
        WidgetVariant("kalender", "Kalender", "standard", "KalReceiver26M", "Kalender 4×2", "Kalender", "4 × 2", false),
        WidgetVariant("kalender", "Kalender", "standard", "KalReceiver26L", "Kalender 4×4", "Kalender", "4 × 4", false),
        WidgetVariant("kalender", "Kalender", "samsung", "S24KalReceiver26S", "Kalender · Samsung", "Kalender · Samsung", "2 × 2", true),
        WidgetVariant("kalender", "Kalender", "samsung", "S24KalReceiver26M", "Kalender 4×2 · Samsung", "Kalender · Samsung", "4 × 2", true),
        WidgetVariant("kalender", "Kalender", "samsung", "S24KalReceiver26L", "Kalender 4×4 · Samsung", "Kalender · Samsung", "4 × 4", true),
        WidgetVariant("kalender", "Kalender", "laaseskjerm", "LockWideKal40", "Neste time · låseskjerm", null, null, false),
        WidgetVariant("proveperioder", "Prøveperioder", "standard", "TrialsReceiver32bS", "Prøveperioder", "Prøveperioder", "2 × 2", false),
        WidgetVariant("proveperioder", "Prøveperioder", "standard", "TrialsReceiver32bM", "Prøveperioder 4×2", "Prøveperioder", "4 × 2", false),
        WidgetVariant("proveperioder", "Prøveperioder", "samsung", "S32bTrialsSmallReceiver", "Prøveperioder · Samsung", "Prøveperioder · Samsung", "2 × 2", true),
        WidgetVariant("proveperioder", "Prøveperioder", "samsung", "S32bTrialsWideReceiver", "Prøveperioder 4×2 · Samsung", "Prøveperioder · Samsung", "4 × 2", true),
        WidgetVariant("proveperioder", "Prøveperioder", "laaseskjerm", "LockSmallTrial40", "Prøveperiode · låseskjerm", null, null, false),
        WidgetVariant("pakker", "Pakker", "standard", "PackagesReceiver", "Pakker", "Pakker", "4 × 2", false),
        WidgetVariant("pakker", "Pakker", "samsung", "S24PackagesReceiver", "Sporing · Samsung", "Sporing · Samsung", "2 × 2", true),
        WidgetVariant("pakker", "Pakker", "oneui", "OneUiPackagesReceiver", "Pakker · One UI", null, null, false),
        WidgetVariant("pakker", "Pakker", "laaseskjerm", "LockSmallPakke40", "Pakker · låseskjerm", null, null, false),
        WidgetVariant("pakker", "Pakker", "laaseskjerm", "LockWidePakke40", "Pakker · låseskjerm", null, null, false),
        WidgetVariant("brief", "Glimt-brief", "standard", "BriefReceiver34", "Glimt-brief", "Glimt-brief", "4 × 2", false),
        WidgetVariant("brief", "Glimt-brief", "samsung", "S34BriefReceiver", "Glimt-brief · Samsung", null, null, false),
        WidgetVariant("brief", "Glimt-brief", "samsung", "S35Brief22Receiver", "Glimt-brief · Samsung 2×2", "Glimt-brief · Samsung", "2 × 2", false),
        WidgetVariant("brief", "Glimt-brief", "samsung", "S35Brief41Receiver", "Glimt-brief · Samsung 4×1", "Glimt-brief · Samsung", "4 × 1", false),
        WidgetVariant("brief", "Glimt-brief", "samsung", "S35Brief44Receiver", "Glimt-brief · Samsung 4×4", "Glimt-brief · Samsung", "4 × 4", false),
        WidgetVariant("brief", "Glimt-brief", "laaseskjerm", "LockWideBrief40", "Glimt brief · låseskjerm", null, null, false),
        WidgetVariant("vaer", "Andre", "standard", "WeatherReceiver", "Vær", "Vær", "4 × 2", false),
        WidgetVariant("vaer", "Andre", "oneui", "OneUiWeatherReceiver", "Vær · One UI", null, null, false),
        WidgetVariant("vaer", "Andre", "laaseskjerm", "LockSmallVaer40", "Vær · låseskjerm", null, null, false),
        WidgetVariant("gjoremal", "Andre", "standard", "TasksReceiver", "Gjøremål", "Gjøremål", "4 × 2", false),
        WidgetVariant("gjoremal", "Andre", "samsung", "S24TasksReceiver", "Gjøremål · Samsung", null, null, true),
        WidgetVariant("gjoremal", "Andre", "samsung", "S24TasksWideReceiver", "Gjøremål 4×2 · Samsung", null, null, true),
        WidgetVariant("gjoremal", "Andre", "laaseskjerm", "LockSmallHuske40", "Gjøremål · låseskjerm", null, null, false),
        WidgetVariant("gjoremal", "Andre", "laaseskjerm", "LockWideHuske40", "Gjøremål · låseskjerm", null, null, false),
        WidgetVariant("bursdager", "Andre", "standard", "BirthdaysReceiver24", "Bursdager", "Bursdager", "4 × 2", false),
        WidgetVariant("bursdager", "Andre", "samsung", "S24BirthdaysReceiver", "Bursdager · Samsung", null, null, true),
        WidgetVariant("budsjett", "Andre", "standard", "BudgetReceiver", "Budsjett", "Budsjett", "4 × 2", false),
        WidgetVariant("budsjett", "Andre", "oneui", "OneUiBudgetReceiver", "Budsjett · One UI", null, null, false),
        WidgetVariant("budsjett", "Andre", "laaseskjerm", "LockSmallBud40", "Budsjett · låseskjerm", null, null, false),
        WidgetVariant("okonomi", "Andre", "standard", "FinanceReceiver", "Finans", "Økonomi", "4 × 2", false),
        WidgetVariant("okonomi", "Andre", "oneui", "OneUiFinanceReceiver", "Økonomi · One UI", null, null, false),
        WidgetVariant("okonomi", "Andre", "samsung", "S24BalanceReceiver", "Saldo · Samsung", null, null, true),
        WidgetVariant("skann", "Andre", "standard", "ScanReceiver", "Skann", "Skann", "1 × 1", false),
        WidgetVariant("skann", "Andre", "oneui", "OneUiScanReceiver", "Skann · One UI", null, null, false),
        WidgetVariant("skann", "Andre", "samsung", "S24ScanReceiver", "Skann · Samsung", null, null, true),
        WidgetVariant("bibel", "Andre", "standard", "Bible37Receiver", "Bibelvers", "Bibelvers", "4 × 2", false),
        WidgetVariant("bibel", "Andre", "standard", "Bible37RoundReceiver", "Bibelvers rund", null, null, false),
        WidgetVariant("bibel", "Andre", "samsung", "S37BibleReceiver", "Bibelvers · Samsung", null, null, false),
        WidgetVariant("bibel", "Andre", "laaseskjerm", "LockWideBibel40", "Dagens bibelvers · låseskjerm", null, null, false),
        WidgetVariant("hjemlys", "Andre", "standard", "HjemlysStart40Receiver", "Hjemlys", "Hjemlys", "4 × 2", false),
        WidgetVariant("neste-trekk", "Andre", "standard", "NextChargeReceiver", "Neste trekk", null, null, false),
        WidgetVariant("aksjer", "Andre", "standard", "StocksReceiver", "Aksjer", null, null, false),
        WidgetVariant("aksjer", "Andre", "oneui", "OneUiStocksReceiver", "Aksjer · One UI", null, null, false),
        WidgetVariant("domener", "Andre", "standard", "DomainsReceiver", "Domener", null, null, false),
        WidgetVariant("domener", "Andre", "oneui", "OneUiDomainsReceiver", "Domener · One UI", null, null, false),
        WidgetVariant("mat", "Andre", "standard", "MatReceiver", "Mat", null, null, false),
        WidgetVariant("mat", "Andre", "oneui", "OneUiMatReceiver", "Mat · One UI", null, null, false),
        WidgetVariant("finn", "Andre", "standard", "FinnReceiver", "Finn", null, null, false),
        WidgetVariant("finn", "Andre", "oneui", "OneUiFinnReceiver", "Finn · One UI", null, null, false),
        WidgetVariant("boliger", "Andre", "standard", "BoligReceiver", "Boliger", null, null, false),
        WidgetVariant("sok", "Andre", "oneui", "OneUiSearchReceiver", "Søk · One UI", null, null, false),
        WidgetVariant("klokke", "Andre", "oneui", "OneUiClockReceiver", "Klokke · One UI", null, null, false),
        WidgetVariant("planlegging", "Andre", "standard", "Plan51SaldoReceiver", "Sparing og planer · saldo", null, null, false),
        WidgetVariant("sjekk-inn", "Andre", "standard", "Checkin51Receiver", "Sjekk inn", null, null, false),
    )

    /** Innstillinger → App → Widgets: variantene med navn i galleriet. */
    val galleri: List<WidgetVariant> get() = alle.filter { it.galleri != null }

    /** Samsung-variantene appen slår på når telefonen er en Samsung. */
    val slaasPaaSamsung: List<WidgetVariant> get() = alle.filter { it.samsungPaa }
}

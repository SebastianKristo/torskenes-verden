package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 26 (ANDROID-B): Innstillinger → Kalendere og Integrasjoner (som på web), overstyring av transportør i Sporing,
 * editor for Finans-fanelinjen, og trykk på aktiv fane (til fanens rot, deretter til toppen).
 * Tegnes i ui/Settings26B.kt, ui/Nav26B.kt og ui/Tracking26B.kt.
 */

/* ---------- Tilstand ---------- */

class B26State {
    /** Økes når aktiv fane trykkes på rotsiden: siden bygges på nytt og står øverst. */
    var topSeq by mutableStateOf(0)
    internal var topDone = 0
    /** «Rediger fanelinjen» for Finans (hold inne på Finans-linja). */
    var finEdit by mutableStateOf(false)
    /** Egne navn og ikoner i Finans-linja: nøkkel → (navn, ikon-tegn). */
    var finLbl by mutableStateOf<Map<String, Pair<String?, String?>>>(emptyMap())
    internal var finLblFor: String? = null
    /** Kalendere ble åpnet fra: «integ» (Integrasjoner), «bd» (Bursdager) eller null (Innstillinger). */
    var kalFrom by mutableStateOf<String?>(null)
    internal var kalBackPage: String? = null
    /** «Fjern alle verdier» er trykket én gang for denne integrasjonen (trykk igjen for å bekrefte). */
    var clearArm by mutableStateOf<String?>(null)
    /** Sporing: lokale overstyringer når serveren ikke kan lagre dem ennå (sporingsnummer → transportør). */
    var trkOvr by mutableStateOf<Map<String, String>>(emptyMap())
    internal var trkOvrFor: String? = null
}

/* ---------- Integrasjoner: metadata ---------- */

/** Kategoriene i listen, i rekkefølge (som på web). */
val INTEG26_CATS = listOf("Smarthjem", "Transport og pakker", "Økonomi", "AI", "Informasjon", "Annet")

data class IntegMeta26(val category: String, val badge: String, val color: Long, val description: String, val guide: List<Pair<String, String>> = emptyList())

/** Reserve når serveren ikke sender metadata ennå (samme merker, farger og guider som designet og web). */
val INTEG26_META: Map<String, IntegMeta26> = mapOf(
    "ha" to IntegMeta26("Smarthjem", "HA", 0xFF18BCF2, "Lokal server og to-do-lister", listOf(
        "Lag et token" to "Åpne profilen din i Home Assistant. Nederst: Langtidstokener → Opprett token. Kopier det med en gang, det vises bare én gang.",
        "Lim inn adresse og token" to "Adressen er den du åpner Home Assistant med, f.eks. https://home.kristo.no:8123.")),
    "calendars" to IntegMeta26("Informasjon", "31", 0xFF4285F4, "Skole-iCal, Canvas, Google og Home Assistant", listOf(
        "Skolekalender" to "Canvas → Kalender → Kalenderfeed, eller Outlook → Publiser kalender → ICS. Lim inn adressen som Skole-iCal.",
        "Canvas" to "Canvas → Kalender → Kalenderfeed (nederst til høyre). Kopier adressen og lim den inn som Canvas-iCal.",
        "Google og Home Assistant" to "Logg inn med Google og velg kalender, eller velg en calendar.* i Home Assistant og importer.")),
    "entur" to IntegMeta26("Transport og pakker", "R", 0xFFD0605A, "Sanntid for avganger", listOf(
        "Velg et navn" to "Entur krever en identifikator på formen «firma-app». Ingen nøkkel trengs.")),
    "mybring" to IntegMeta26("Transport og pakker", "B", 0xFF7BC144, "Sporing hos Posten og Bring", listOf(
        "Lag nøkkel" to "Logg inn på mybring.com → Innstillinger → API. Opprett en nøkkel og kopier den.",
        "Bruker" to "API-brukeren er e-posten du logger inn med.")),
    "postnord" to IntegMeta26("Transport og pakker", "PN", 0xFF00A0D6, "Sporing uten konto og uten nøkkel", listOf(
        "Ingen nøkkel trengs" to "PostNord-pakker (SE/DK/NO/FI) spores bare med sporingsnummeret via PostNords offentlige sporingsside. Pakker som ikke er skannet ennå står som «Ikke skannet ennå».",
        "Egen nøkkel (valgfri)" to "Har du en nøkkel fra developer.postnord.com, brukes det offisielle API-et først.")),
    "parcelsapp" to IntegMeta26("Transport og pakker", "PA", 0xFF4B5BD6, "Reserve for alle transportører", listOf(
        "Hent nøkkel" to "parcelsapp.com → API → Dashboard. Gratisnivået holder for vanlig bruk.")),
    "t212" to IntegMeta26("Økonomi", "T", 0xFF13A37F, "Aksjer og kontoer", listOf(
        "Lag nøkkel" to "app.trading212.com → Innstillinger → API (Beta). Velg bare lesetilgang, og kopier nøkkel og secret.")),
    "bank" to IntegMeta26("Økonomi", "BK", 0xFF2B5D8A, "Banker og filimport"),
    "imap" to IntegMeta26("Økonomi", "@", 0xFF6D4AFF, "IMAP eller Proton Mail Bridge", listOf(
        "Lag app-passord" to "Gmail: Google-konto → Sikkerhet → App-passord. Proton: bruk Bridge-passordet fra Proton Mail Bridge.",
        "Videresend" to "Send kvitteringer til mottaksadressen, eller la Homelab lese en egen mappe.")),
    "finn" to IntegMeta26("Økonomi", "F", 0xFF0063FB, "Varsler og handler", listOf(
        "Varsler" to "Lagre søk på Finn med varsel til e-postadressen din.")),
    "ai" to IntegMeta26("AI", "G", 0xFF4B6CF0, "AI-tolkning av kvitteringer og søk", listOf(
        "Hent nøkkel" to "aistudio.google.com → Get API key. Groq: console.groq.com → API Keys.")),
    "cloudflare" to IntegMeta26("Informasjon", "CF", 0xFFF38020, "Domener, trafikk og oppetid", listOf(
        "Lag token" to "dash.cloudflare.com → Min profil → API-tokener → Opprett. Velg malen «Les analyser» for alle soner.",
        "Konto-ID" to "Står i høyre kolonne på oversikten for et domene.")),
    "met" to IntegMeta26("Informasjon", "Yr", 0xFF1F8FD6, "Værvarsel", listOf(
        "Identifiser deg" to "MET krever en User-Agent med kontaktinfo. Ingen nøkkel.")),
    "map" to IntegMeta26("Informasjon", "◎", 0xFF3F7A6E, "Kartverket og MapTiler"),
    "icons" to IntegMeta26("Annet", "✦", 0xFF5B6478, "Iconify via Homelab-cache"),
    "photos" to IntegMeta26("Annet", "U", 0xFF3A4252, "Bakgrunner fra Unsplash og Pexels"),
    "plex" to IntegMeta26("Annet", "PX", 0xFFE5A00D, "Filmer og serier"),
    "jellyfin" to IntegMeta26("Annet", "JF", 0xFF7B4FD0, "Filmer og serier"),
    "sonarr" to IntegMeta26("Annet", "SO", 0xFF2F9FD8, "Serier på vei"),
    "radarr" to IntegMeta26("Annet", "RA", 0xFFE0B300, "Filmer på vei"),
    "google" to IntegMeta26("Informasjon", "G", 0xFF4285F4, "Google-klient for Bursdager og Kalender"),
    "calendar" to IntegMeta26("Informasjon", "31", 0xFF4285F4, "Skolekalender (iCal)"),
)

/** Integrasjoner som vises på Kalendere-siden i stedet for som egne rader i listen. */
val INTEG26_ON_KAL = setOf("calendars", "calendar", "google")

/** Guiden fra serveren: [[tittel, tekst, kode?]], [{title|t, text|d}] eller ["tekst"]. */
internal fun parseGuide26(v: Any?): List<Pair<String, String>> {
    val a = v as? JSONArray ?: return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        when (val x = a.opt(i)) {
            is JSONArray -> (x.optString(0) to listOfNotNull(x.optString(1).takeIf { it.isNotBlank() }, x.optString(2).takeIf { it.isNotBlank() }).joinToString("\n"))
            is JSONObject -> ((x.optStr("title") ?: x.optStr("t") ?: "") to (x.optStr("text") ?: x.optStr("d") ?: ""))
            is String -> if (x.contains(": ")) x.substringBefore(": ") to x.substringAfter(": ") else x to ""
            else -> null
        }?.takeIf { it.first.isNotBlank() || it.second.isNotBlank() }
    }
}

private fun color26(s: String?): Long? = s?.trim()?.removePrefix("#")?.let { h ->
    when (h.length) { 6 -> h.toLongOrNull(16)?.let { 0xFF000000 or it }; 8 -> h.toLongOrNull(16); 3 -> h.map { "$it$it" }.joinToString("").toLongOrNull(16)?.let { 0xFF000000 or it }; else -> null }
}

/** Metadata for en integrasjon: serverens verdier, ellers reservene over. */
fun integMeta26(i: Integ24): IntegMeta26 {
    val d = INTEG26_META[i.id]
    val cat = i.category?.takeIf { it in INTEG26_CATS } ?: d?.category ?: when (i.group) {
        "Hjem" -> "Smarthjem"; "Sporing", "Reise" -> "Transport og pakker"; "Finans" -> "Økonomi"; "AI" -> "AI"; "Generelt", "Nettverk", "Skole" -> "Informasjon"; else -> "Annet"
    }
    return IntegMeta26(
        cat, i.badge ?: d?.badge ?: i.name.take(2).uppercase(), color26(i.color) ?: d?.color ?: 0xFF5B6478,
        i.description ?: d?.description ?: i.fields.joinToString(", ") { it.label }.take(60),
        i.guide.ifEmpty { d?.guide ?: i.fields.filter { !it.help.isNullOrBlank() }.map { it.label to it.help!! } },
    )
}

/** Status til høyre i listen: tekst og om den er grønn (true) eller rød (false). */
fun integStatus26(i: Integ24): Pair<String, Boolean> {
    val ok = i.status == "ok" || i.statusText == "Tilkoblet"
    i.statusText?.let { return it to ok }
    if (ok) return "Tilkoblet" to true
    if (i.status == "error") return "Feil" to false
    val miss = i.fields.firstOrNull { !it.saved && it.value.isNullOrBlank() } ?: return (if (i.fields.isEmpty()) "Klar" else "Tilkoblet") to true
    return "Mangler ${miss.label.lowercase()}" to false
}

/* ---------- Innstillinger: tilbake og titler ---------- */

/** Tilbake fra en underside i Innstillinger (kalles fra back()): integrasjonssider → Integrasjoner, Kalendere → der den ble åpnet. */
fun AppViewModel.settingsBack26() {
    val pg = settingsPage
    when {
        pg?.startsWith("integ:") == true -> settingsPage = "integ"
        pg == "kal" && b26.kalFrom == "integ" -> { settingsPage = "integ"; b26.kalFrom = null }
        pg == "kal" && b26.kalFrom == "bd" -> { settingsPage = null; b26.kalFrom = null; paperPage = b26.kalBackPage; bd24.open = true }
        else -> settingsPage = null
    }
}

fun AppViewModel.settingsBackLabel26(): String = when {
    settingsPage?.startsWith("integ:") == true -> "Integrasjoner"
    settingsPage == "kal" && b26.kalFrom == "integ" -> "Integrasjoner"
    settingsPage == "kal" && b26.kalFrom == "bd" -> "Bursdager"
    else -> "Alle innstillinger"
}

/** Åpner Innstillinger → Kalendere (fra Integrasjoner, Bursdager eller Innstillinger). */
fun AppViewModel.openKalSettings26(from: String?) {
    if (from == "bd") {
        b26.kalBackPage = paperPage
        bd24.open = false
        openPaperPage("set")
    }
    b26.kalFrom = from
    settingsPage = "kal"
}

/** Åpner siden for én integrasjon (Kalendere har sin egen side). */
fun AppViewModel.openInteg26(id: String) {
    b26.clearArm = null
    if (id in INTEG26_ON_KAL) openKalSettings26("integ") else settingsPage = "integ:$id"
}

/** «Fjern alle verdier»: fjerner hvert lagret felt, og henter listen på nytt. */
fun AppViewModel.b26ClearAll(i: Integ24) {
    val s = b24
    s.integBusy = i.id
    b26.clearArm = null
    launch24b {
        try {
            for (f in i.fields) if (f.saved || !f.value.isNullOrBlank()) api24b { hlDelete("/integrations/${i.id}/${f.key}") }
            flash("${i.name} er nullstilt")
            s.integ = parseIntegrations24(api24b { hlGet("/integrations") })
        } catch (e: ApiException) {
            flash(e.message ?: "Kunne ikke fjerne verdiene")
        } finally { s.integBusy = null }
    }
}

/* ---------- Sporing: overstyr transportør ---------- */

/** Valgene i «Spor via» og ved ny pakke (nøklene serveren godtar som carrierOverride). */
val TRK26_CARS: List<Pair<String, String>> = listOf(
    "posten" to "Posten", "bring" to "Bring", "postnord" to "PostNord", "dhl" to "DHL", "helthjem" to "Helthjem",
    "ups" to "UPS", "budbee" to "Budbee", "instabox" to "Instabox", "parcelsapp" to "ParcelsApp",
)

fun trkCarName26(id: String?): String? = id?.let { k -> TRK26_CARS.firstOrNull { it.first == k }?.second ?: Carrier.KNOWN.firstOrNull { it.id == k }?.name }

/** Navnet på transportøren som gjenkjennes automatisk for nummeret. */
fun trkGuessName26(no: String): String {
    val g = Carrier.detect(no.uppercase().filter { it.isLetterOrDigit() })
    return trkCarName26(g)?.takeIf { g != "other" } ?: "Bring"
}

private fun AppViewModel.ovrKey26() = "b26_trkovr_" + (account?.id ?: "")

/** Lokale overstyringer (bare når serveren ikke lagrer carrierOverride ennå). */
fun AppViewModel.trkLocalOvr26(): Map<String, String> {
    val id = account?.id ?: ""
    if (b26.trkOvrFor != id) {
        b26.trkOvrFor = id
        b26.trkOvr = runCatching {
            val o = JSONObject(prefs.str(ovrKey26(), "{}"))
            o.keys().asSequence().associateWith { o.getString(it) }
        }.getOrDefault(emptyMap())
    }
    return b26.trkOvr
}

private fun AppViewModel.setLocalOvr26(no: String, car: String?) {
    val m = trkLocalOvr26().toMutableMap()
    if (car == null) m.remove(no) else m[no] = car
    b26.trkOvr = m
    prefs.set(ovrKey26(), JSONObject(m as Map<*, *>).toString())
}

/** Valgt transportør for pakken (serverens, ellers den lokale), eller null for automatisk. */
fun AppViewModel.trkOverride26(s: Shipment): String? = s.carrierOverride ?: trkLocalOvr26()[s.trackingNo]

/** Pakken slik den vises: med lokal overstyring brukes valgt transportørs navn, merke og logo. */
fun AppViewModel.trkView26(s: Shipment): Shipment {
    if (s.carrierOverride != null) return s
    val ov = trkLocalOvr26()[s.trackingNo] ?: return s
    if (ov == s.carrier) return s
    val k = Carrier.KNOWN.firstOrNull { it.id == ov }
    val name = trkCarName26(ov) ?: ov
    return s.copy(
        carrier = ov, carrierName = name, carrierIni = k?.ini ?: "PA", carrierColor = k?.color ?: 0xFF4B5BD6, carrierFg = k?.fg ?: 0xFFFFFFFF,
        carrierLogo = null, carrierDomain = CARRIER_DOMAINS[ov] ?: if (ov == "parcelsapp") "parcelsapp.com" else null,
    )
}

/** Underteksten: «Bring · valgt» når transportøren er overstyrt, ellers navnet. */
fun AppViewModel.trkCarrierLabel26(s: Shipment): String {
    val ov = trkOverride26(s) ?: return s.carrierName
    return s.carrierLabel?.takeIf { s.carrierOverride != null } ?: "${trkCarName26(ov) ?: s.carrierName} · valgt"
}

/** Ny pakke med valgt transportør (null = automatisk, som før). */
fun AppViewModel.addTracking26(no: String, car: String?) {
    val n = no.trim().uppercase().filter { it.isLetterOrDigit() }
    if (car == null) { addTracking(n, "", Carrier.detect(n).takeIf { n.length >= 6 }, false); return }
    launch24b {
        val body = JSONObject().put("trackingNo", n).put("direction", "in").put("carrierOverride", car)
        if (car != "parcelsapp") body.put("carrier", car)
        val o = JSONObject(api24b { request("POST", "/tracking", body, prefix = Api.HOMELAB, timeout = 30_000) })
        val item = o.optJSONObject("item")
        if (item == null || !item.has("carrierOverride")) setLocalOvr26(n, car) else setLocalOvr26(n, null)
        item?.let { trkSel = parseShipment(it).id }
        loadTracking()
        trkFilter = "active"
        flash(o.optStr("message") ?: "Spores via ${trkCarName26(car) ?: car}")
    }
}

/** «Spor via»: overstyrer (eller tilbake til automatisk med null), og pakken spores med en gang. */
fun AppViewModel.trkSetOverride26(s: Shipment, car: String?) {
    val v = car
    launch24b {
        var saved = false
        var msg: String? = null
        try {
            val r = api24b { request("PATCH", "/tracking/${s.id}", JSONObject().put("carrierOverride", v ?: JSONObject.NULL), prefix = Api.HOMELAB, timeout = 45_000) }
            val o = runCatching { JSONObject(r) }.getOrNull()
            saved = (o?.optJSONObject("item") ?: o)?.has("carrierOverride") == true
            msg = o?.optStr("message")
        } catch (e: ApiException) {
            if (e.status !in setOf(400, 404, 405, 422)) throw e
        }
        setLocalOvr26(s.trackingNo, if (saved) null else v)
        if (!saved) runCatching { api24b { request("POST", "/tracking/refresh", JSONObject(), prefix = Api.HOMELAB, timeout = 30_000) } }
        loadTracking()
        flash(msg ?: "Spores nå via ${trkCarName26(v) ?: s.carrierDetected?.let(::trkCarName26) ?: trkGuessName26(s.trackingNo)}")
    }
}

/* ---------- Finans-fanelinja: navn og ikon ---------- */

private fun AppViewModel.finLblKey26() = "b26_finlbl_" + (account?.id ?: "")

/** Egne navn og ikoner (lagres på enheten og som finNav-objekter på serveren). */
fun AppViewModel.finLabels26(): Map<String, Pair<String?, String?>> {
    val id = account?.id ?: ""
    if (b26.finLblFor != id) {
        b26.finLblFor = id
        b26.finLbl = runCatching {
            val o = JSONObject(prefs.str(finLblKey26(), "{}"))
            o.keys().asSequence().associateWith { k -> o.getJSONObject(k).let { v -> v.optStr("label") to v.optStr("icon") } }
        }.getOrDefault(emptyMap())
    }
    return b26.finLbl
}

private fun AppViewModel.saveFinLabels26(m: Map<String, Pair<String?, String?>>) {
    b26.finLbl = m
    b26.finLblFor = account?.id ?: ""
    prefs.set(finLblKey26(), JSONObject().apply { m.forEach { (k, v) -> put(k, JSONObject().put("label", v.first ?: JSONObject.NULL).put("icon", v.second ?: JSONObject.NULL)) } }.toString())
}

fun AppViewModel.clearFinLabels26() = saveFinLabels26(emptyMap())

fun AppViewModel.finTabLabel26(k: String, def: String): String = finLabels26()[k]?.first?.takeIf { it.isNotBlank() } ?: def
fun AppViewModel.finTabIcon26(k: String, def: String): String = finLabels26()[k]?.second?.takeIf { it.isNotBlank() } ?: def

/** Nøkkelen serveren bruker i finNav (kvitteringer, abonnementer). */
private fun finServerKey26(k: String): String = when (k) { "kvitt" -> "kvitteringer"; "abo" -> "abonnementer"; else -> k }

/** Én fane i editoren: nøkkel, navn og ikon (tegn). */
data class FinItem26(val key: String, val label: String, val icon: String)

/** Lagrer Finans-linja: rekkefølge (finTabs og finNav), navn og ikoner. Profilen blir «Egendefinert». */
fun AppViewModel.saveFinNav26(items: List<FinItem26>, defLabel: (String) -> String, defIcon: (String) -> String) {
    val list = items.filter { it.key != "fmer" && it.key != "mer" }.distinctBy { it.key }.take(5)
    if (list.isEmpty()) return
    updatePaperFinTabs(list.map { it.key })
    saveFinLabels26(list.associate { t ->
        t.key to (t.label.trim().takeIf { it.isNotEmpty() && it != defLabel(t.key) } to t.icon.takeIf { it != defIcon(t.key) })
    }.filterValues { it.first != null || it.second != null })
    b24.profile = "custom"
    val objs = JSONArray().apply {
        list.forEach { t ->
            val o = JSONObject().put("key", finServerKey26(t.key))
            if (t.label.trim().isNotEmpty() && t.label != defLabel(t.key)) o.put("label", t.label.trim())
            if (t.icon != defIcon(t.key)) o.put("icon", tabIconName25(t.icon))
            put(o)
        }
    }
    launch24b {
        try { api24b { hlPut("/me/layout", JSONObject().put("finNav", objs)) } }
        catch (e: ApiException) {
            // Eldre server: bare listen med nøkler.
            if (e.status == 400) runCatching { api24b { hlPut("/me/layout", JSONObject().put("finNav", JSONArray(list.map { finServerKey26(it.key) }))) } }
        }
    }
}

/** «Tilbakestill til standard»: Oversikt, Liste, Finn og Søk, uten egne navn. */
fun AppViewModel.resetFinNav26() {
    updatePaperFinTabs(FIN_TABS_DEFAULT)
    saveFinLabels26(emptyMap())
    launch24b { runCatching { api24b { hlPut("/me/layout", JSONObject().put("finNav", JSONObject.NULL)) } } }
}

/** Fra GET /api/me/layout: finNav som liste med nøkler eller {key, label?, icon?}. */
fun AppViewModel.applyLayout26b(raw: String) {
    val a = runCatching { JSONObject(raw).optJSONArray("finNav") }.getOrNull() ?: return
    val keys = mutableListOf<String>()
    val lbl = mutableMapOf<String, Pair<String?, String?>>()
    for (i in 0 until a.length()) {
        val x = a.opt(i)
        val k = finKey24((x as? JSONObject)?.optStr("key") ?: (x as? JSONObject)?.optStr("id") ?: (x as? String) ?: continue)
        if (k == "mer" || k == "fmer" || FIN_TABS.none { it.first == k }) continue
        keys += k
        (x as? JSONObject)?.let { o ->
            val l = o.optStr("label")
            val ic = o.optStr("icon")?.let { r -> if (r in TAB_ICONS) r else iconNameGlyph25(r) }
            if (l != null || ic != null) lbl[k] = l to ic
        }
    }
    if (keys.isEmpty()) return
    val v = keys.distinct().take(5)
    if (v != paperFinTabs) updatePaperFinTabs(v)
    if (a.length() > 0 && (0 until a.length()).any { a.opt(it) is JSONObject }) saveFinLabels26(lbl)
}

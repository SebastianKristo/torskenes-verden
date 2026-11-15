package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

/* ---------------- Integrasjoner: logoer ---------------- */

/** Domenet for logoen til en integrasjon (ILOGO i fasiten). Null = behold bokstavmerket (Bankimport). */
fun integDomain32b(id: String): String? = when (id) {
    "ha" -> "home-assistant.io"
    "calendars", "calendar", "google" -> "calendar.google.com"
    "entur" -> "entur.no"
    "mybring", "bring" -> "bring.no"
    "postnord" -> "postnord.no"
    "parcelsapp", "parcels" -> "parcelsapp.com"
    "t212" -> "trading212.com"
    "imap", "email" -> "proton.me"
    "finn" -> "finn.no"
    "ai", "gemini" -> "gemini.google.com"
    "cloudflare", "cf" -> "cloudflare.com"
    "met" -> "yr.no"
    "map", "kart" -> "kartverket.no"
    "icons" -> "iconify.design"
    "photos" -> "unsplash.com"
    "plex" -> "plex.tv"
    "jellyfin" -> "jellyfin.org"
    "sonarr" -> "sonarr.tv"
    "radarr" -> "radarr.video"
    else -> null
}

/* ---------- Home Assistant (Integrasjoner) ---------- */

/** Status for tilkoblingen, utledet av /api/tasks/ha: entiteter funnet = tilkoblet. */
fun TasksHa.connText(): String = when {
    entities.isNotEmpty() -> "Tilkoblet"
    error?.contains("ikke satt opp", ignoreCase = true) == true -> "Ikke satt opp"
    error != null -> "Feil"
    else -> "Ikke tilkoblet"
}

/* ---------- Integrasjoner ---------- */

data class IntegField24(val key: String, val label: String, val type: String, val value: String?, val saved: Boolean, val help: String?)

/** scope: "personal" (brukerens egne, alle ser og endrer) eller "server" (serveroppsett, bare administrator). */
data class Integ24(val id: String, val name: String, val group: String?, val status: String, val fields: List<IntegField24>, val canTest: Boolean,
    val scope: String = "server",
    // Prompt 26: metadata som på web (kategori, merke, farge, kort beskrivelse, statustekst og nummererte steg). Se Mod26B.kt.
    val category: String? = null, val badge: String? = null, val color: String? = null, val description: String? = null,
    val statusText: String? = null, val guide: List<Pair<String, String>> = emptyList(), val hidden: Boolean = false) {
    val personal: Boolean get() = scope == "personal"
}

/** Personlige integrasjoner (ISO2), brukt når serveren ikke sier scope selv (eldre server eller reservelisten). */
private val PERSONAL24 = setOf("calendar", "school", "plex", "jellyfin", "sonarr", "radarr", "t212", "tracking", "mybring", "postnord", "parcelsapp",
    "dhl", "ups", "17track", "imap", "bank", "finn")

/** ISO2: om brukeren kan endre serveroppsettet i FinansHub (bootstrap.canEditServer; eldre server: admin-rollen). */
val AppViewModel.canEditServer: Boolean get() = boot?.canEditServer ?: userIsAdmin

internal fun parseIntegrations24(s: String): List<Integ24> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONObject(t).optJSONArray("integrations") ?: JSONArray()
    return a.map { o ->
        Integ24(
            o.optString("id"), o.optStr("name") ?: o.optString("id"), o.optStr("group"), o.optStr("status") ?: "missing",
            (o.optJSONArray("fields") ?: JSONArray()).map { f ->
                IntegField24(f.optString("key"), f.optStr("label") ?: f.optString("key"), f.optStr("type") ?: "text", f.optStr("value"),
                    f.optBoolean("saved", f.optStr("value") != null), f.optStr("help"))
            },
            o.optBoolean("canTest", true),
            o.optStr("scope")?.takeIf { it == "personal" || it == "server" } ?: if (o.optString("id") in PERSONAL24) "personal" else "server",
            category = o.optStr("category"), badge = o.optStr("badge"), color = o.optStr("color"), description = o.optStr("description"),
            statusText = o.optStr("statusText"), guide = parseGuide26(o.opt("guide")), hidden = o.optBoolean("hidden", false),
        )
    }
}

/** Når serveren ikke har /api/integrations ennå (404): samme liste som designet, uten verdier. */
val INTEG24_FALLBACK: List<Integ24> = listOf(
    Triple("ha", "Home Assistant", listOf(Triple("url", "Adresse", "url"), Triple("token", "Langtidstoken", "secret"))),
    Triple("google", "Google Kalender (bursdager)", listOf(Triple("googleClientId", "Client ID", "text"), Triple("googleClientSecret", "Client secret", "secret"))),
    Triple("ai", "AI (Gemini, Groq, Ollama)", listOf(Triple("geminiKey", "Gemini-nøkkel", "secret"), Triple("groqKey", "Groq-nøkkel", "secret"), Triple("ollamaUrl", "Ollama-adresse", "url"))),
    Triple("t212", "Trading 212", listOf(Triple("key", "API-nøkkel", "secret"))),
    Triple("bank", "Bankimport", listOf(Triple("format", "Format", "text"))),
    Triple("imap", "Kvitteringer på e-post (IMAP)", listOf(Triple("host", "IMAP-server", "text"), Triple("user", "Brukernavn", "text"), Triple("pass", "App-passord", "secret"))),
    Triple("entur", "Entur / Ruter", listOf(Triple("client", "ET-Client-Name", "text"))),
    Triple("mybring", "Mybring (Posten / Bring)", listOf(Triple("user", "API-bruker (e-post)", "text"), Triple("key", "API-nøkkel", "secret"), Triple("cust", "Kundenummer", "text"))),
    // Prompt 41: PostNord spores uten konto og uten nøkkel (offentlig Track & Trace som ha-postnord); nøkkelen er valgfri.
    Triple("postnord", "PostNord", listOf(Triple("key", "API-nøkkel (valgfri)", "secret"))),
    Triple("parcelsapp", "ParcelsApp (reserve)", listOf(Triple("key", "API-nøkkel", "secret"))),
    Triple("cloudflare", "Cloudflare (domener)", listOf(Triple("token", "API-token", "secret"), Triple("account", "Konto-ID", "text"))),
    Triple("finn", "Finn.no", listOf(Triple("mail", "Varsel-e-post", "text"))),
    Triple("met", "MET / Yr (vær)", listOf(Triple("ua", "User-Agent", "text"))),
    Triple("map", "Kart (MapTiler / Stadia)", listOf(Triple("maptiler", "MapTiler-nøkkel", "secret"), Triple("stadia", "Stadia-nøkkel", "secret"))),
    Triple("icons", "Ikoner", listOf(Triple("src", "Ikonkilde", "text"))),
    Triple("photos", "Unsplash / Pexels", listOf(Triple("unsplash", "Unsplash-nøkkel", "secret"), Triple("pexels", "Pexels-nøkkel", "secret"))),
).map { (id, n, fs) -> Integ24(id, n, null, "missing", fs.map { (k, l, ty) -> IntegField24(k, l, ty, null, false, null) }, false, if (id in PERSONAL24) "personal" else "server") }

/* ---------- Innstillinger: integrasjoner ---------- */

fun AppViewModel.b24LoadIntegrations() {
    val s = b24
    launch24b {
        try {
            val raw = api24b { hlGet("/integrations") }
            s.integ = parseIntegrations24(raw)
            s.integLegacy = false
            s.integError = null
        } catch (e: ApiException) {
            s.integLegacy = e.status == 404
            s.integError = when (e.status) {
                404 -> "Serveren har ikke det nye integrasjonsoppsettet ennå. Oppdater homelab for å redigere her."
                403 -> "Serveren godtar ikke kontoen for integrasjoner ennå. Oppdater homelab."
                else -> e.message
            }
            if (s.integ == null) s.integ = INTEG24_FALLBACK
        }
    }
}

fun AppViewModel.b24SaveIntegField(id: String, key: String, value: String) {
    val s = b24
    s.integBusy = "$id.$key"
    launch24b {
        try {
            api24b { hlPut("/integrations/$id", JSONObject().put(key, value)) }
            s.integEdit = null
            flash("Lagret")
            s.integ = parseIntegrations24(api24b { hlGet("/integrations") })
        } catch (e: ApiException) {
            flash(if (e.status == 404) "Kunne ikke lagre: serveren støtter ikke dette ennå" else (e.message ?: "Kunne ikke lagre"))
        } finally { s.integBusy = null }
    }
}

fun AppViewModel.b24ClearIntegField(id: String, key: String) {
    val s = b24
    s.integBusy = "$id.$key"
    launch24b {
        try {
            api24b { hlDelete("/integrations/$id/$key") }
            s.integEdit = null
            flash("Verdien er fjernet")
            s.integ = parseIntegrations24(api24b { hlGet("/integrations") })
        } catch (e: ApiException) {
            flash(e.message ?: "Kunne ikke fjerne verdien")
        } finally { s.integBusy = null }
    }
}

fun AppViewModel.b24TestIntegration(i: Integ24) {
    val s = b24
    s.integBusy = i.id
    launch24b {
        try {
            val t0 = System.currentTimeMillis()
            val r = runCatching { JSONObject(api24b { hlPost("/integrations/${i.id}/test") }) }.getOrNull()
            val ok = r?.optBoolean("ok", true) ?: true
            val msg = r?.optStr("message") ?: r?.optStr("error")
            flash(if (ok) "✓ ${i.name} svarte på ${r?.optLong("ms", System.currentTimeMillis() - t0) ?: (System.currentTimeMillis() - t0)} ms" else "Feil: ${msg ?: "fikk ikke kontakt"}")
        } catch (e: ApiException) {
            flash("Feil: ${e.message ?: "fikk ikke kontakt"}")
        } finally { s.integBusy = null }
    }
}

/* ---------- Integrasjoner: metadata ---------- */

/** Kategoriene i listen, i rekkefølge (som på web). */
// Prompt 43: MEDIA-gruppen (Sonarr, Radarr, qBittorrent, Prowlarr, Jellyfin, Plex) etter Smarthjem.
val INTEG26_CATS = listOf("Smarthjem", "Media", "Transport og pakker", "Økonomi", "AI", "Informasjon", "Annet")

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
    // Prompt 43 (claude-code-integrasjoner-media.md): MEDIA med steg-for-steg-oppsett (serverens steg brukes når de finnes).
    "sonarr" to IntegMeta26("Media", "SO", 0xFF2F9FD8, "Serier: legg til, overvåk og søk", listOf(
        "Finn API-nøkkelen" to "Sonarr → Settings → General → Security → API Key.",
        "Adresse og port" to "Port 8989, med URL Base hvis satt:\nhttp://192.168.1.20:8989/sonarr",
        "Samme mapper i alle containerne" to "Hardlinks krever samme rot:\nvolumes:\n  - /srv/data:/data\n→ /data/downloads, /data/media/tv, /data/media/film",
        "Rotmappe" to "Settings → Media Management → Root Folders → /data/media/tv",
        "Koble til qBittorrent" to "Download Clients → qBittorrent, port 8080, kategori tv-sonarr.",
        "Standard kvalitetsprofil" to "Brukes når du legger til fra Media eller Glimt (4K → Ultra-HD).",
        "Webhook" to "Connect → Webhook (On Grab, On Import, On Upgrade, On Health Issue):\nhttps://home.kristo.no/api/media/hook/sonarr")),
    "radarr" to IntegMeta26("Media", "RA", 0xFFE0B300, "Filmer: legg til, overvåk og søk", listOf(
        "Finn API-nøkkelen" to "Radarr → Settings → General → Security → API Key.",
        "Adresse og port" to "Port 7878, f.eks. http://192.168.1.20:7878",
        "Rotmappe" to "Settings → Media Management → Root Folders → /data/media/film",
        "Koble til qBittorrent" to "Download Clients → qBittorrent, port 8080, kategori radarr.",
        "Minimum Availability" to "Announced (Annonsert), In Cinemas (På kino) eller Released (Utgitt digitalt).",
        "Webhook" to "Connect → Webhook:\nhttps://home.kristo.no/api/media/hook/radarr")),
    "qbittorrent" to IntegMeta26("Media", "qB", 0xFF2F6DB5, "Nedlastinger: pause, kø og filer", listOf(
        "Slå på Web UI" to "Verktøy → Innstillinger → Web UI, port 8080. Docker: midlertidig passord med\ndocker logs qbittorrent | grep -i password",
        "Eget brukernavn og passord" to "Bytt til et eget brukernavn og et sterkt passord.",
        "Bare fra Homelab" to "Tillat bare Homelab-serverens IP. Ikke åpne Web UI mot internett.",
        "Kategorier" to "tv-sonarr → /data/downloads/tv\nradarr → /data/downloads/film",
        "Varsel når ferdig" to "«Kjør eksternt program når torrent er ferdig»:\ncurl -s -X POST https://home.kristo.no/api/media/hook/qbit -d \"hash=%I&name=%N\"",
        "Alt-hastighet" to "Fart → Alternative fartsgrenser (f.eks. 5 MB/s ned).")),
    "prowlarr" to IntegMeta26("Media", "PR", 0xFFE66000, "Indeksere for Sonarr og Radarr", listOf(
        "Finn API-nøkkelen" to "Prowlarr → Settings → General → Security → API Key.",
        "Apper" to "Settings → Apps → Sonarr og Radarr med Full Sync:\nhttp://prowlarr:9696 · http://sonarr:8989 · http://radarr:7878",
        "Legg til indeksere" to "Fra Media → Prowlarr → + Legg til indekser, eller i Prowlarr.",
        "FlareSolverr (valgfri)" to "docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr\nGi indekserne taggen flaresolverr.",
        "Webhook" to "Settings → Connect → Webhook:\nhttps://home.kristo.no/api/media/hook/prowlarr")),
    "jellyfin" to IntegMeta26("Media", "JF", 0xFF7B4FD0, "Spill av filmer og serier", listOf(
        "API-nøkkel" to "Dashbord → API-nøkler → + «Homelab».",
        "Bibliotek" to "Legg bibliotekene på /data/media/tv og /data/media/film.",
        "Oppdater etter import" to "Sonarr/Radarr → Connect → Emby/Jellyfin.",
        "Spill av med" to "Velg Jellyfin under Media → ⚙ → Spill av med.")),
    "plex" to IntegMeta26("Media", "PX", 0xFFE5A00D, "Spill av filmer og serier", listOf(
        "Plex-token" to "Åpne et element i Plex → ⋯ → Vis XML. Token står i adressen etter X-Plex-Token=",
        "Bibliotek" to "Samme mapper: /data/media/tv og /data/media/film.",
        "Oppdater etter import" to "Sonarr/Radarr → Connect → Plex Media Server.",
        "Spill av med" to "Velg Plex under Media → ⚙ → Spill av med.")),
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
    val d = INTEG26_META[i.id] ?: INTEG26_META[if (i.id == "qbit") "qbittorrent" else ""] // prompt 43: qbit = qbittorrent
    // Prompt 43: Media-tjenestene står alltid i MEDIA (serveren sender fortsatt «Annet» som kategori, men group «Media»).
    val cat = (if (i.group == "Media" || i.id in setOf("sonarr", "radarr", "qbittorrent", "qbit", "prowlarr", "jellyfin", "plex")) "Media" else null)
        ?: i.category?.takeIf { it in INTEG26_CATS } ?: d?.category ?: when (i.group) {
        "Hjem" -> "Smarthjem"; "Media", "MEDIA" -> "Media"; "Sporing", "Reise" -> "Transport og pakker"; "Finans" -> "Økonomi"; "AI" -> "AI"; "Generelt", "Nettverk", "Skole" -> "Informasjon"; else -> "Annet"
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

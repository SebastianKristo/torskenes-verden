package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.*

/*
 * Prompt 67 (ANDSET67, prompt 50b/66 – settings65.js på web): Innstillinger gruppert som på web.
 *   GENERELT    Konto · Sikkerhet · API-tokens · Utseende · Varsler · App
 *   HUSSTAND    Helse og posisjon (appens del av «Brukere og familie»; Logg inn som ligger under Konto som før)
 *   GLIMT OG AI Glimt (figur/brief/stemme, Glimt husker, Entitetsregister, Glimt lærer, Faste oppgaver, Kvalitet) · AI
 *   TILKOBLINGER Integrasjoner · Kalender og gjøremål
 *   MODULER     Moduler · Finans · Media · Nyheter
 *   SERVER      System · Backup · Logger (bare admin, som før)
 * Samme liste brukes på telefon (Paper17.kt, med undertekst) og i venstre kolonne på brett (Settings50.kt).
 * Ingen funksjon er fjernet; radene som lå direkte i menyen før, ligger nå på App- og Finans-sidene (app67, fin67).
 * Hver innstilling finnes ett sted: Glimt husker og «Send til Chat etter» er flyttet fra AI og tolkning til Glimt.
 */

internal class Menu67Row(val key: String?, val title: String, val sub: String, val icon: ImageVector, val value: String? = null, val go: () -> Unit)
internal class Menu67Group(val title: String, val rows: List<Menu67Row>)

/** Forelderen til en underside (tilbake-knappen og markeringen i venstre kolonne på brett). null = rett under Innstillinger. */
internal fun parent67(page: String?): String? = when (page) {
    "g67mem", "g67ent", "g67rec", "g67sch", "g67q" -> "glimt67"
    "profil", "scan", "server", "backup", "data", "about" -> "app67"
    "cats", "rules", "stocks", "fin" -> "fin67"
    else -> null
}

/** Titlene på de nye sidene (legges inn i PAPER_SET_TITLES). */
internal val SET67_TITLES = mapOf(
    "glimt67" to "Glimt", "g67mem" to "Glimt husker", "g67ent" to "Entitetsregister", "g67rec" to "Glimt lærer",
    "g67sch" to "Faste oppgaver", "g67q" to "Kvalitet", "app67" to "App", "fin67" to "Finans",
)

internal fun menu67(vm: AppViewModel): List<Menu67Group> {
    val admin = vm.userIsAdmin
    val u = vm.p30.upd
    val sysAvail = admin && (u.phase == "avail" || (u.available && u.phase == "none"))
    val appAvail = AppUpd32.s.phase == "avail"
    fun page(k: String): () -> Unit = { vm.settingsPage = k }
    return listOf(
        Menu67Group("Generelt", listOf(
            Menu67Row("accounts", "Konto", "Profil, kontoer, økter og logg ut", Icons.Filled.Person, go = page("accounts")),
            Menu67Row("security", "Sikkerhet", if (vm.me?.totp == true) "2FA på" else "2FA av", Icons.Filled.Lock, go = page("security")),
            Menu67Row("tokens", "API-tokens", vm.tokens?.let { "${it.size} aktive" } ?: "Snarveier og integrasjoner", Icons.Filled.Key, go = page("tokens")),
            Menu67Row("tilpass", "Utseende", "Navn, ikon, tema, farger, bakgrunn og fanelinje", Icons.Filled.Palette, go = page("tilpass")),
            Menu67Row("notify", "Varsler", "Lyd, stille timer, haptikk og test", Icons.Filled.Notifications, go = page("notify")),
            Menu67Row("app67", "App", "Appprofil, widgets, skanning, server, data og oppdatering", Icons.Filled.PhoneAndroid, if (appAvail) "Oppdater" else null, page("app67")),
        )),
        Menu67Group("Husstand", listOf(
            Menu67Row("healthpos", "Helse og posisjon", "Health Connect, typer og posisjonsdeling", Icons.Filled.MonitorHeart, go = page("healthpos")),
        )),
        Menu67Group("Glimt og AI", listOf(
            Menu67Row("glimt67", "Glimt", "Figur, brief, stemme · Glimt husker, Glimt lærer, faste oppgaver og kvalitet", Icons.Filled.AutoAwesome, go = page("glimt67")),
            Menu67Row("ai", "AI", "Modeller, kvitteringer, chat, tale og tidsgrenser", Icons.Filled.Memory, go = page("ai")),
        )),
        Menu67Group("Tilkoblinger", listOf(
            Menu67Row("integ", "Integrasjoner", if (admin) "Home Assistant, Media, Entur, Bring og flere" else "Kalendere, Trading 212, Bring, e-post og flere", Icons.Filled.Home, go = page("integ")),
            Menu67Row("kal", "Kalender og gjøremål", "Google Kalender · Home Assistant · Skole-iCal · synk av gjøremål", Icons.Filled.CalendarMonth) { vm.openKalSettings26(null) },
        )),
        Menu67Group("Moduler", listOf(
            Menu67Row("modules", "Moduler", "Familie, Gjøremål, Avganger, Vær", Icons.Filled.Dashboard, go = page("modules")),
            Menu67Row("fin67", "Finans", "Kategorier, regler, bankimport, aksjer, fanelinje og abonnementer", Icons.Filled.AccountBalance, go = page("fin67")),
            Menu67Row("media", "Media", "Sonarr, Radarr, qBittorrent, Prowlarr · status", Icons.Filled.Movie, go = page("media")),
            Menu67Row("nyheter", "Nyheter", "Kilder, kategorier, For deg og Glimt-sammendrag", Icons.Filled.Newspaper) { vm.settingsPage = "nyheter"; if (vm.news == null) vm.loadNews() },
        )),
        Menu67Group("Server", if (!admin) emptyList() else listOf(
            Menu67Row("prog50", "System", "Nordlys OS, versjon og automatiske oppdateringer", Icons.Filled.SystemUpdate, if (sysAvail) "Oppdater" else null, page("prog50")),
            Menu67Row("sysbackup", "Backup", bkSummary29(vm.bk29), Icons.Filled.Backup, go = page("sysbackup")),
            Menu67Row(null, "Logger", "Docker-logger, feil og feilsøking", Icons.Filled.Dns) { vm.openLogs44() },
        )),
    ).filter { it.rows.isNotEmpty() }
}

/** Innstillinger → App: det som gjelder selve appen på telefonen (flyttet fra APP- og PROGRAMVARE-gruppene). */
@Composable
internal fun App67Page(vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Appen", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
        PCard {
            SetRow(vm, 0, Icons.Filled.People, "Appprofil", profileName39(vm)) { vm.settingsPage = "profil" }
            SetRow(vm, 1, Icons.Filled.Widgets, "Widgets", "Media, Avganger, Kalender og 3 til", top = true) { vm.p43.galleryOpen = true }
            SetRow(vm, 2, Icons.Filled.DocumentScanner, "Skanning", "Kamera, beskjæring og opplasting", top = true) { vm.settingsPage = "scan" }
            SetRow(vm, 3, Icons.Filled.Dns, "Server og synk", "Lokal og ekstern adresse", top = true) { vm.settingsPage = "server" }
            SetRow(vm, 4, Icons.Filled.Backup, "Backup og data", "Nedlasting og lagring", top = true) { vm.settingsPage = "backup" }
            SetRow(vm, 5, Icons.Filled.Info, "Om appen", "Versjon, personvern og lisenser", top = true) { vm.settingsPage = "about" }
        }
        PLabel("Oppdatering", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard { AppUpdateRow32(vm) }
    }
}

/** Innstillinger → Moduler → Finans: radene som lå i FINANS-gruppen. */
@Composable
internal fun Fin67Page(vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Finans", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
        PCard {
            SetRow(vm, 0, Icons.Filled.Category, "Kategorier og budsjett", "Farger og typer") { vm.settingsPage = "cats" }
            SetRow(vm, 1, Icons.Filled.Tune, "Regler", "Automatisk kategorisering", top = true) { vm.settingsPage = "rules" }
            SetRow(vm, 2, Icons.Filled.AccountBalance, "Bankimport", "DNB · CSV · ✦ AI", top = true) { vm.openFromMer(Screen.Import) }
            SetRow(vm, 3, Icons.AutoMirrored.Filled.ShowChart, "Aksjer · Trading 212", "Nøkkel, miljø og synk", top = true) { vm.settingsPage = "stocks" }
            SetRow(vm, 4, Icons.Filled.ViewWeek, "Fanelinje og Mer i Finans", "${vm.paperFinTabs.size} faner", top = true) { vm.settingsPage = "fin" }
            SetRow(vm, 5, Icons.Filled.Autorenew, "Subscription OS", "Abonnementer og AI-sparing", top = true) { vm.openFromMer(Screen.Sub) }
        }
    }
}

/** Innstillinger → AI: «AI og modeller» (AI-kontroll i fullskjerm) øverst, så kvitteringer, chat, tale og tidsgrenser. */
@Composable
internal fun Ai67Head(vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Modeller", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
        PCard { AiSettingsRow34(vm, 0) }
        PCard { SetRow(vm, 1, Icons.Filled.AutoAwesome, "Glimt", "Glimt husker, «Send til Chat etter» og resten av Glimt ligger under Glimt") { vm.settingsPage = "glimt67" } }
    }
}

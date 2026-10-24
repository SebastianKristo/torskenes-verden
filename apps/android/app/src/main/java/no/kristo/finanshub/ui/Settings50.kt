package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 50 (claude-code-innstillinger-to-kolonner-fold-ipad.md, fasit Mobil Papir App.dc.html side «innst» med wide):
 * Innstillinger i to kolonner når vinduet er ≥ 700 dp (LocalWide45 – Fold utbrettet, nettbrett). Telefon er uendret.
 *  - Hele bredden (ingen maks bredde), venstre marg 28 dp, venstre kolonne 300 dp med egen scroll (følger med), resten til høyre.
 *  - Venstre: søk + ✦ AI øverst (treffene erstatter listen), gruppene med liten Plex Mono-tittel og prikket skillelinje,
 *    rader med rundt farget ikon og navn (ingen undertekst), statusverdi bare når den krever handling («Oppdater» i rødt).
 *    Valgt rad: kort-bakgrunn, fet tekst og myk skygge. Undersiden åpnes i høyre kolonne (vm.settingsPage), ikke som ny skjerm.
 *    Rader som åpner egne flater (Glimt, AI og modeller, Widgets, Nordlys OS, Logger, Bankimport) gjør det som før.
 *  - Høyre: ingenting valgt → oppdateringskortet og profilkortet. Valgt side → tittel-pille (Newsreader) og innholdet.
 *    Ingen «‹ Alle innstillinger» (venstre liste er navigasjonen); nivå 2 (en integrasjon) har «‹ Integrasjoner» over tittelen.
 *  - Tilbake (knapp, sveip) lukker detaljsiden først (vm.back() → settingsBack26), deretter forlates Innstillinger.
 *  - Valgt side huskes per enhet (papir_set_sub) og står også etter bretting/rotasjon (tilstanden ligger i AppViewModel).
 */

internal const val SET_SUB50 = "papir_set_sub"

/** Innstillinger vises i to kolonner nå (brett/Fold ≥ 700 dp og Innstillinger er siden som vises). */
internal fun setWide50(vm: AppViewModel, wide: Boolean): Boolean =
    wide && (vm.paperPage == "set" || vm.screen == Screen.Settings) && vm.original == null && vm.editing == null && vm.detail == null

/** Hvilken rad i venstre liste en underside hører til (nivå 2 markerer forelderen). */
private fun navKey50(vm: AppViewModel, page: String?): String? = when {
    page == null -> null
    page.startsWith("integ:") -> "integ"
    page == "kal" && vm.b26.kalFrom == "integ" -> "integ"
    page == "look" -> "tilpass"
    page == "haptics" -> "notify"
    else -> page
}

private class Row50(val key: String?, val title: String, val icon: ImageVector, val value: String? = null, val go: () -> Unit)
private class Group50(val title: String, val rows: List<Row50>)

private fun groups50(vm: AppViewModel): List<Group50> {
    val admin = vm.userIsAdmin
    val u = vm.p30.upd
    val sysAvail = admin && (u.phase == "avail" || (u.available && u.phase == "none"))
    val appAvail = AppUpd32.s.phase == "avail"
    fun page(k: String): () -> Unit = { vm.settingsPage = k }
    return listOf(
        Group50("Programvare", buildList {
            add(Row50("prog50", "Programvare", Icons.Filled.SystemUpdate, if (appAvail) "Oppdater" else null, page("prog50")))
            if (admin) add(Row50(null, "Nordlys OS", Icons.Filled.AutoAwesome, if (sysAvail) "Oppdater" else null) { vm.openNordlys31() })
            if (admin) add(Row50(null, "Logger", Icons.Filled.Dns) { vm.openLogs44() })
        }),
        Group50("Konto", buildList {
            add(Row50("accounts", "Kontoer og brukere", Icons.Filled.People, go = page("accounts")))
            add(Row50("security", "Sikkerhet", Icons.Filled.Lock, go = page("security")))
            if (admin) add(Row50("sysbackup", "Backup", Icons.Filled.Backup, go = page("sysbackup")))
            add(Row50("tokens", "API-tokens", Icons.Filled.Key, go = page("tokens")))
        }),
        Group50("Finans", listOf(
            Row50("ai", "AI og tolkning", Icons.Filled.AutoAwesome, go = page("ai")),
            Row50("cats", "Kategorier og budsjett", Icons.Filled.Category, go = page("cats")),
            Row50("rules", "Regler", Icons.Filled.Tune, go = page("rules")),
            Row50(null, "Bankimport", Icons.Filled.AccountBalance) { vm.openFromMer(Screen.Import) },
            Row50("stocks", "Aksjer · Trading 212", Icons.AutoMirrored.Filled.ShowChart, go = page("stocks")),
            Row50("fin", "Fanelinje og Mer i Finans", Icons.Filled.ViewWeek, go = page("fin")),
            Row50(null, "Subscription OS", Icons.Filled.Autorenew) { vm.openFromMer(Screen.Sub) },
        )),
        Group50(vm.appName, listOf(
            Row50("tilpass", "Tilpass", Icons.Filled.Palette, go = page("tilpass")),
            Row50("modules", "Moduler", Icons.Filled.Dashboard, go = page("modules")),
            Row50("nyheter", "Nyheter", Icons.Filled.Newspaper) { vm.settingsPage = "nyheter"; if (vm.news == null) vm.loadNews() },
        )),
        Group50("Glimt", listOf(Row50(null, "Glimt", Icons.Filled.AutoAwesome) { vm.openGlimt35() })),
        Group50("App", listOf(
            Row50(null, "AI og modeller", Icons.Filled.Memory) { vm.openAiCtl34("ov") },
            Row50("notify", "Varsler og haptikk", Icons.Filled.Notifications, go = page("notify")),
            Row50("kal", "Kalendere", Icons.Filled.CalendarMonth) { vm.openKalSettings26(null) },
            Row50("huske", "Gjøremål", Icons.Filled.Checklist, go = page("huske")),
            Row50("media", "Media", Icons.Filled.Movie, go = page("media")),
            Row50("integ", "Integrasjoner", Icons.Filled.Home, go = page("integ")),
            Row50(null, "Widgets", Icons.Filled.Widgets) { vm.p43.galleryOpen = true },
            Row50("healthpos", "Helse og posisjon", Icons.Filled.MonitorHeart, go = page("healthpos")),
            Row50("profil", "Appprofil", Icons.Filled.People, go = page("profil")),
            Row50("scan", "Skanning", Icons.Filled.DocumentScanner, go = page("scan")),
            Row50("server", "Server og synk", Icons.Filled.Dns, go = page("server")),
            Row50("backup", "Backup og data", Icons.Filled.Backup, go = page("backup")),
        )),
    ).filter { it.rows.isNotEmpty() }
}

/** Sider som kan gjenopprettes fra papir_set_sub (ikke «update», som sender videre til Nordlys, og ikke Kalendere fra Bursdager). */
private fun restorable50(k: String): Boolean = k.startsWith("integ:") || (k in PAPER_SET_TITLES && k != "update") || k == "kal"

/**
 * To kolonner: venstre liste (300 dp) og høyre innhold ([right] er den vanlige Innstillinger-listen for vm.settingsPage).
 * Begge kolonnene har egen scroll, så venstre liste står fast mens høyre side scrolles.
 */
@Composable
internal fun SettingsSplit50(vm: AppViewModel, navBottom: Dp, right: @Composable () -> Unit) {
    LaunchedEffect(Unit) {
        if (vm.settingsPage == null) vm.prefs.str(SET_SUB50, "").takeIf { it.isNotBlank() && restorable50(it) }?.let { k ->
            if (k == "kal") vm.openKalSettings26(null) else vm.settingsPage = k
        }
    }
    LaunchedEffect(vm.settingsPage) { runCatching { vm.prefs.set(SET_SUB50, vm.settingsPage ?: "") } }
    Row(Modifier.fillMaxSize().padding(start = 28.dp, end = 12.dp)) {
        LazyColumn(
            Modifier.width(300.dp).fillMaxHeight(),
            contentPadding = PaddingValues(top = 0.dp, bottom = PAPER_BAR + 30.dp + navBottom),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            // Søk og ✦ AI som på telefon; med tekst i feltet viser listen bare treffene.
            if (!settingsSearch24(vm)) {
                val act = navKey50(vm, vm.settingsPage)
                groups50(vm).forEach { g ->
                    item(key = "g50-" + g.title) { GroupHead50(g.title) }
                    g.rows.forEach { r -> item(key = "r50-" + g.title + r.title) { NavRow50(vm, r, r.key != null && r.key == act) } }
                }
            }
        }
        Spacer(Modifier.width(12.dp))
        Box(Modifier.weight(1f).fillMaxHeight()) { right() }
    }
}

/** Gruppetittel med prikket skillelinje over (border-top: 1px dotted). */
@Composable
private fun GroupHead50(title: String) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).drawBehind {
            drawLine(p.line, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = size.height,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx())))
        })
        Text(title.uppercase(java.util.Locale("nb", "NO")), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp,
            letterSpacing = 1.2.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 4.dp))
    }
}

/** Rad i venstre liste: rundt farget ikon (hvitt symbol), navn, ev. rød status. Valgt: kort-bakgrunn, fet og myk skygge. */
@Composable
private fun NavRow50(vm: AppViewModel, r: Row50, on: Boolean) {
    val p = PaperPal.current
    val pal = iconPalette(vm.iconTheme)
    val c = Color(setColor30(r.title) ?: pal[(r.title.hashCode() and 0x7fffffff) % pal.size])
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp)
            .then(if (on) Modifier.shadow(10.dp, shape, ambientColor = Color.Black.copy(alpha = .35f), spotColor = Color.Black.copy(alpha = .35f)) else Modifier)
            .clip(shape).background(if (on) p.card else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = r.title) { Haptics.select(); vm.b24.sq = ""; r.go() }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) {
            Icon(r.icon, null, tint = Color.White, modifier = Modifier.size(17.dp))
        }
        Text(r.title, color = p.ink, fontSize = 15.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f))
        r.value?.let { Text(it, color = p.lab, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
    }
}

/** Øverst i høyre kolonne: «‹ Integrasjoner» på nivå 2, og tittel-pillen for valgt side. */
internal fun LazyListScope.settingsHead50(vm: AppViewModel) {
    val sub = vm.settingsPage ?: return
    val lvl2 = vm.settingsBackLabel26().takeIf { it != "Alle innstillinger" }
    item(key = "head50") {
        val p = PaperPal.current
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 6.dp)) {
            if (lvl2 != null) Box(
                Modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClickLabel = "Tilbake til $lvl2") { Haptics.back(); vm.settingsBack26() },
                contentAlignment = Alignment.CenterStart,
            ) {
                Box(Modifier.height(36.dp).clip(CircleShape).background(p.card).padding(start = 10.dp, end = 14.dp), contentAlignment = Alignment.Center) {
                    Text("‹ $lvl2", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
                }
            }
            Box(
                Modifier.heightIn(min = 46.dp).shadow(12.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                    .clip(CircleShape).background(p.card).padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterStart,
            ) { PSerif(if (sub == "prog50") "Programvare" else settingsTitle26(vm), 24.sp, maxLines = 1) }
        }
    }
}

/** Høyre kolonne uten valgt side: oppdateringskortet (når det finnes noe) og profilkortet. */
internal fun LazyListScope.settingsHome50(vm: AppViewModel) {
    if (upd30Show(vm, home = false)) item { UpdateBanner30(vm, home = false) }
    profileCard17(vm)
}

/** Innstillinger → Programvare på brett: appen, Nordlys OS med automatiske oppdateringer, og Logger (admin). */
@Composable
internal fun Programvare50(vm: AppViewModel) {
    PCard {
        AppUpdateRow32(vm)
        if (vm.userIsAdmin) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(PaperPal.current.line))
            Programvare30(vm)
            Box(Modifier.fillMaxWidth().height(1.dp).background(PaperPal.current.line))
            SetRow(vm, 0, Icons.Filled.Dns, "Logger", "Docker-logger, feil og feilsøking") { vm.openLogs44() }
        }
    }
}

/**
 * Glimt- og AI-flatene som åpnes fra Innstillinger på brett: sentrert med maks 820 dp bredde over et dempet lag, i stedet
 * for over hele skjermen. Trykk på laget utenfor lukker ikke (flatene har egen Ferdig og tilbake).
 */
@Composable
internal fun Centered50(on: Boolean, content: @Composable () -> Unit) {
    if (!on) { content(); return }
    // Laget fanger trykk, så Innstillinger bak ikke kan trykkes mens flaten er åpen.
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .32f)).clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.Center) {
        Box(Modifier.widthIn(max = 820.dp).fillMaxWidth().fillMaxHeight().padding(vertical = 18.dp).clip(RoundedCornerShape(26.dp))) { content() }
    }
}

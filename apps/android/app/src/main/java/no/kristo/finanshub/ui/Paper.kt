package no.kristo.finanshub.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.draw.scale
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.IsoFields
import java.util.Locale

/*
 * Mobildesign «Papir» (Mobil Papir App + Mobil Nytt Design 2a): fotovindu øverst med hilsen, klokke og vær,
 * innholdet på papir, og en svart fanelinje (Hjem, Finans, Mat, Sporing, Mer og + Skann) som flyter nederst.
 * Sidene som ikke er tegnet egne (Domener, Aksjer, Boliger, Finn, Innstillinger …) bruker de vanlige skjermene,
 * som får papirfargene gjennom Tone.paper.
 */

private val nbNo = Locale("nb", "NO")

/** Åpner en adresse: universal link / app link (NRK-, VG-, Ruter- eller Yr-appen hvis den er installert), ellers nettleseren. */
internal fun openLink(ctx: Context, url: String) {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { ctx.startActivity(i) }
}

/** Ruter-appen (universal link) med avreisestoppet. */
internal fun ruterLink(stop: String?): String =
    if (stop.isNullOrBlank()) "https://reise.ruter.no/" else "https://ruter.no/reise/?from=" + java.net.URLEncoder.encode(stop, "UTF-8").replace("+", "%20")

/** Yr for stedet: koordinater når serveren sender dem, ellers søk på stedsnavnet. */
internal fun yrLink(w: Weather?): String {
    if (w?.lat != null && w.lon != null) return String.format(Locale.US, "https://www.yr.no/nb/v%%C3%%A6rvarsel/daglig-tabell/%.4f,%.4f", w.lat, w.lon)
    return "https://www.yr.no/nb/s%C3%B8k?q=" + java.net.URLEncoder.encode(w?.place ?: "Oslo", "UTF-8")
}

/** Mono-etikett i versaler (IBM Plex Mono 600, sperret), som i designet. */
@Composable
internal fun PLabel(text: String, color: Color = PaperPal.current.lab, size: TextUnit = 10.5.sp, modifier: Modifier = Modifier) =
    Text(text.uppercase(nbNo), color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = size, letterSpacing = 1.3.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)

@Composable
internal fun PSerif(text: String, size: TextUnit, color: Color = PaperPal.current.ink, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, italic: Boolean = false, weight: FontWeight = FontWeight.Medium) =
    Text(text, color = color, fontFamily = PaperFonts.serif, fontWeight = weight, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal, fontSize = size,
        lineHeight = size * 1.12f, maxLines = maxLines, overflow = TextOverflow.Ellipsis, modifier = modifier)

/** Kort på papiret: hvit (eller kveldsbrun) flate, 20 dp runding og myk skygge. */
@Composable
internal fun PCard(modifier: Modifier = Modifier, shadow: Boolean = false, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    Column(
        modifier.fillMaxWidth()
            .then(if (shadow) Modifier.shadow(14.dp, RoundedCornerShape(20.dp), ambientColor = Color.Black.copy(alpha = .25f), spotColor = Color.Black.copy(alpha = .25f)) else Modifier)
            .clip(RoundedCornerShape(20.dp)).background(p.card)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        content = content,
    )
}

/** Seksjonstittel med 2 dp blekklinje under (avisspalte). */
@Composable
internal fun PHead(label: String, right: String? = null, rule: Boolean = true, onRight: (() -> Unit)? = null) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.Bottom) {
            PLabel(label, modifier = Modifier.weight(1f).padding(bottom = 6.dp))
            if (right != null) Text(right, color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp).then(if (onRight != null) Modifier.clickable(onClick = onRight) else Modifier))
        }
        if (rule) Box(Modifier.fillMaxWidth().height(2.dp).background(p.ink))
    }
}

@Composable
private fun PRule() = Box(Modifier.fillMaxWidth().height(1.dp).background(PaperPal.current.line))

/** Pilleknapp: blekk (primær), aksent (rød) eller strek. */
@Composable
internal fun PButton(text: String, modifier: Modifier = Modifier, kind: String = "ink", height: Dp = 48.dp, onClick: () -> Unit) {
    val p = PaperPal.current
    val bg = when (kind) { "lab" -> p.lab; "line" -> Color.Transparent; else -> p.ink }
    val fg = when (kind) { "lab" -> p.onLab; "line" -> p.ink; else -> p.bg }
    Box(
        modifier.height(height).clip(RoundedCornerShape(14.dp)).background(bg)
            .then(if (kind == "line") Modifier.border(1.dp, p.line, RoundedCornerShape(14.dp)) else Modifier)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = fg, fontWeight = if (kind == "line") FontWeight.SemiBold else FontWeight.Bold, fontSize = 14.sp, maxLines = 1) }
}

/** Rad i en liste på et kort: tittel (serif eller fet), undertekst og verdi/pil til høyre. */
@Composable
internal fun PRow(title: String, sub: String?, value: String = "›", valueColor: Color = PaperPal.current.mut, serif: Boolean = true, top: Boolean = false, onClick: (() -> Unit)? = null) {
    val p = PaperPal.current
    Column {
        if (top) PRule()
        Row(
            Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                if (serif) PSerif(title, 19.sp, maxLines = 1) else Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                sub?.let { Text(it, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            }
            if (value.isNotEmpty()) Text(value, color = valueColor, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/* ---------------- Skallet ---------------- */

/** Hvilken fanelinje som vises: «main», «fin» (Finans) eller «dom» (Domener). */
private fun paperBar(vm: AppViewModel): String = when {
    vm.screen == Screen.Domains && vm.paperPage == null -> "dom"
    vm.screen == Screen.Sub && vm.paperPage == null && vm.selectedTx == null -> "sub"
    vm.paperFin -> "fin"
    // Prompt 23: «Mer» følger modulen. En Finans-underside (Aksjer, Kvitteringer, Boliger …) viser Finans-fanene, også når
    // den ble åpnet fra appens Mer, og «Mer» åpner da Finans → Mer. Unntak: siden er selv en fane i hovedlinja.
    vm.paperPage == null && vm.screen.isFinance && navCurrent(vm, "main") !in setOf("aksjer", "boliger", "abonnementer") -> "fin"
    else -> "main"
}

/** Kicker (liten kursiv over) og tittel i fotovinduet. */
private fun heroText(vm: AppViewModel): Pair<String, String> {
    val first = vm.displayName.split(' ').firstOrNull().orEmpty().ifBlank { "du" }
    val today = LocalDate.now()
    if (vm.selectedTx != null && (vm.paperPage == null || vm.paperPage == "fsok") && (vm.screen.isFinance || vm.paperPage == "fsok")) return "Finans" to "Detaljer"
    return when (vm.paperPage) {
        "mer" -> "Alle moduler" to "Mer"
        "fmer" -> "Finans" to "Mer"
        "set" -> if (vm.settingsPage == null) "Konto og utseende" to "Innstillinger" else "Alle innstillinger" to (settingsTitle26(vm))
        "fsok" -> "Finans · ✦ AI" to "Søk"
        "media" -> "Plex · Jellyfin" to "Media"
        else -> when (vm.screen) {
            Screen.Homelab -> longDate(today) to "${greetingFor()},\n$first"
            Screen.Home -> {
                val m = monthLabel(today.toString().take(7))
                val left = vm.summary?.daysLeft
                (if (left != null) "$m · $left dager igjen" else m) to "Finans"
            }
            Screen.Mat -> "Uke ${vm.week?.week ?: today.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)}" to "Mat"
            Screen.Tracking -> {
                val items = vm.tracking?.items ?: vm.homePackages ?: emptyList()
                val on = items.count { it.active }
                val ready = items.count { it.ready }
                "Pakker og sendinger" to "Sporing"
            }
            Screen.Domains -> when (vm.domSection) {
                "publikum" -> "Kart, land og enheter" to "Publikum"
                "ytelse" -> "Statuskoder, fart og sikkerhet" to "Ytelse"
                "infra" -> "Oppetid, DNS og domeneinfo" to "Infrastruktur"
                else -> (vm.domain ?: "Siste 24 timer") to "Domener"
            }
            Screen.Stocks -> "Trading 212" to "Aksjer"
            Screen.Sub -> "Subscription OS" to "Abonnementer"
            Screen.Folders -> (boligKicker24(vm) ?: "Utgifter og regninger") to "Boliger"
            Screen.Finn -> "Kjøp og salg" to "Finn"
            Screen.Settings -> if (vm.settingsPage == null) "Konto og utseende" to "Innstillinger" else "Alle innstillinger" to (settingsTitle26(vm))
            Screen.List -> "Alle kontoer" to "Liste"
            Screen.Search -> "Finans · ✦ AI" to "Søk"
            Screen.Scan -> "Finans" to "Kvitteringer"
            else -> "Finans" to vm.screen.label
        }
    }
}

private fun backLabel(vm: AppViewModel): String = when {
    vm.b24BackLabel() != null -> vm.b24BackLabel()!!
    vm.settingsPage != null && (vm.paperPage == "set" || vm.screen == Screen.Settings) -> vm.settingsBackLabel26()
    vm.selectedTx != null && vm.paperPage == "fsok" -> "Søk"
    vm.selectedTx != null && vm.paperPage == null -> when (vm.screen) { Screen.List -> "Liste"; Screen.Home -> "Oversikt"; else -> "Tilbake" }
    vm.screen == Screen.Domains && vm.paperPage == null -> "Hjem"
    vm.paperPage == "mer" || vm.paperPage == "fmer" || vm.paperPage == "fsok" -> "Hjem"
    vm.paperFromFinMer -> "Mer"
    vm.paperFin && vm.screen in PAPER_FIN_SCREENS -> "Hjem"
    vm.paperPage != null || vm.paperFromMer -> "Mer"
    vm.screen.isFinance && vm.screen != Screen.Home -> "Finans"
    else -> "Hjem"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PaperApp(
    vm: AppViewModel, snack: SnackbarHostState, takePhoto: () -> Unit, pickPhotos: () -> Unit, pickFiles: () -> Unit, onPrivacyChanged: () -> Unit,
    wide: Boolean = false,
) {
    val p = PaperPal.current
    val s = vm.screen
    val overlay = vm.original != null || vm.editing != null || vm.detail != null
    val home = s == Screen.Homelab && vm.paperPage == null && !overlay
    // Prompt 23: tilbake (knapp og sveip) går gjennom Nav23Back, som viser forrige side bak under sveipet.
    val backEnabled = !home || vm.newsOpen || vm.photoMenu || vm.trkEdit || vm.editPage != null
    val backLocal = vm.photoMenu || vm.trkEdit || vm.editPage != null
    val onBack: () -> Unit = {
        when {
            vm.photoMenu -> vm.photoMenu = false
            vm.editPage != null -> vm.editPage = null
            vm.trkEdit -> vm.trkEdit = false
            else -> if (!vm.b24Back()) vm.back()
        }
    }
    val (nav, holder) = rememberNav23()
    val scan = ScanActions(takePhoto, { vm.scanSheet = true }, true)
    val ownPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(vm::uploadPhoto) }
    // Hold inne på +: filvelgeren åpnes direkte, og filene havner i køen i arket.
    val holdFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            if (vm.scanTarget == "recipe") vm.scanRecipes(uris) else vm.uploadUris(uris, stay = true)
            vm.scanSheet = true
        }
    }
    LaunchedEffect(vm.base) { if (vm.photo == null && vm.photoKind != "cur") vm.loadPhoto() }
    LaunchedEffect(vm.base, vm.account?.id) { vm.b24Start(); vm.b24PreloadNewsIcons() } // Prompt 24: profil/startside og ikonene i Nyhetsleser
    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    // Linja ligger 12 dp over bunnen, eller like over systemets navigasjonsfelt (max(12, inset − 8)).
    // Prompt 28: i Finans → Søk følger linja tastaturet med 8 dp luft (skanneknappen følger med).
    val imeBottom = WindowInsets.ime.asPaddingValues().calculateBottomPadding()
    val barBottom = if (vm.paperPage == "fsok" && imeBottom > navInset) imeBottom + 8.dp else maxOf(12.dp, navInset - 8.dp)
    val float = vm.fabStyle == "float"
    // Prompt 32: Innstillinger (og alle undersidene) uten fanelinje og skanneknapp; bunnen er 28 dp + systemfeltet.
    val setHere = (vm.paperPage == "set" || s == Screen.Settings) && !overlay
    // Ekstra luft nederst i listene: plass til fanelinja (telefon) og den flytende skanneknappen.
    // Prompt 34: + 23 dp fordi innholdsboksen nå går helt ned til skjermkanten (underNav34), ikke 23 dp over den.
    val navBottom = 23.dp + if (setHere) navInset + 28.dp - PAPER_BAR - 30.dp
        else if (wide) 12.dp - PAPER_BAR + navInset + (if (float) 70.dp else 0.dp) else barBottom - 12.dp + (if (float) 70.dp else 0.dp)
    val bar = paperBar(vm)
    val pageKey = paperPageKey(vm)
    // Prompt 23: scrollposisjonen huskes per side (tilbake gjenoppretter, nye sider åpner øverst).
    val scrollKey = navScrollKey(vm, pageKey)
    nav.enter(scrollKey, vm.navBackSeq, holder)
    topReset26(vm, nav, holder, scrollKey) // Prompt 26: nytt trykk på aktiv fane → øverst
    val meter = nav.meter(scrollKey)
    val onTap: () -> Unit = {
        when {
            bar == "dom" -> vm.domainManager = true
            bar == "sub" -> vm.subAdding = true
            vm.screen == Screen.Tracking && bar == "main" -> vm.trkAddOpen = true
            // Trykk: kameraet åpnes med en gang (i Mat som oppskrift, i en bolig rett inn i boligen).
            else -> { vm.scanTarget = if (vm.screen == Screen.Mat) "recipe" else "receipt"; takePhoto() }
        }
    }
    val onHold: () -> Unit = {
        // Hold inne: arket med Kvittering, Oppskrift, Bilder og Fil.
        if (bar != "dom" && bar != "sub") {
            vm.scanTarget = if (vm.screen == Screen.Mat) "recipe" else "receipt"
            vm.scanSheet = true
        }
    }

    CompositionLocalProvider(LocalTopRow provides true) {
      Nav23Back(vm, nav, backEnabled, p.bg, preview = !backLocal, onBack = onBack) {
        Box(Modifier.fillMaxSize().background(p.bg)) {
            Column(Modifier.fillMaxSize()) {
                Hero(vm, home, wide) { vm.photoMenu = !vm.photoMenu; if (vm.photoMenu) vm.loadPhotoThumbs() }
                // Innholdet ligger 23 dp opp i fotovinduet. Så snart man scroller, klippes det ved headerens nederste kant.
                Box(
                    // Prompt 34 (claude-code-innhold-under-navbar.md): før var boksen bare flyttet 23 dp opp (offset), så de nederste 23 dp
                    // av skjermen ble en flat papirstripe under fanelinja. Nå er den 23 dp høyere enn plassen sin (underNav34), så innholdet
                    // går helt ned bak den svevende linja og skann-knappen. Listene har fortsatt luft nok til at siste kort scrolles over linja.
                    Modifier.weight(1f).fillMaxWidth().underNav34(23.dp).padding(start = if (wide) 112.dp else 0.dp)
                        // Prompt 32 (claude-code-rediger-knapper-plass.md): i redigeringsmodus klippes innholdet 14 dp under ＋/✓
                        // (WIGGLE_CLIP32B), så widgets glir under en ren stripe og aldri bak knappene; ellers ved papirkanten (23 dp).
                        .nestedScroll(meter).clip(if (meter.y > 1f) TopCut(if (vm.editPage != null || vm.p32b.fmEdit || vm.b28.merEdit) WIGGLE_CLIP32B else 23.dp) else RectangleShape),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    // Ny side åpner alltid helt øverst: alt innhold (og rulleposisjonen) bygges på nytt ved hvert sidebytte.
                    // Dra for å oppdatere: fra toppen når siden står øverst (ca. 70 dp), så hentes siden på nytt.
                    PullToRefreshBox(isRefreshing = vm.pullRefreshing, onRefresh = { vm.pullRefresh() }, modifier = Modifier.fillMaxHeight()) {
                    Box(Modifier.fillMaxHeight().widthIn(max = if (!wide) 10_000.dp else if (home) 960.dp else 720.dp)) { key(pageKey, vm.b26.topSeq) { holder.SaveableStateProvider(scrollKey) {
                        when {
                            vm.original != null -> PaneBox(navBottom) { OriginalScreen(vm) }
                            vm.editing != null -> PaneBox(navBottom) { TxEditScreen(vm, vm.editing!!, scan) }
                            vm.detail != null -> PaneBox(navBottom) { DetailScreen(vm, vm.detail!!) }
                            vm.paperPage == "mer" -> PaperMore24(vm, navBottom, PAPER_BAR)
                            vm.paperPage == "fmer" -> PaperFinMoreGrid(vm, navBottom, wide)
                            vm.paperPage == "fsok" && vm.selectedTx == null -> PaperFinSearch(vm, navBottom)
                            vm.paperPage == "set" -> PaperSettings17(vm, navBottom, onPrivacyChanged)
                            vm.paperPage == "media" -> PaperMedia(vm, navBottom)
                            vm.selectedTx != null && (s.isFinance || vm.paperPage == "fsok") -> PaperTxDetail(vm, navBottom, takePhoto, pickFiles)
                            s == Screen.Homelab -> PaperHome(vm, navBottom, wide)
                            s == Screen.Home -> PaperFinance(vm, navBottom)
                            s == Screen.List -> PaperList(vm, navBottom)
                            s == Screen.Finn -> PaperFinn(vm, navBottom, wide)
                            s == Screen.Tracking -> PaperTracking(vm, navBottom)
                            // Toppkortet (domenevelger og periode) overlapper bildeheaderen; resten er egne kort på papiret.
                            s == Screen.Domains -> Box(Modifier.fillMaxSize().padding(bottom = PAPER_BAR + navBottom)) { DomainsScreen(vm, false, section = vm.domSection, paper = true) }
                            s == Screen.Mat && !vm.matFull -> MatSurface(vm, paper = true)
                            // Verdikortet ligger delvis oppe i bildeheaderen, som på Sporing.
                            s == Screen.Stocks && vm.stockScreen == "ov" -> PaperStocks23(vm, navBottom)
                            s == Screen.Stocks -> Box(Modifier.fillMaxSize()) { MainPane(vm, false, scan, onPrivacyChanged) }
                            s == Screen.Folders -> PaperBoliger24(vm, navBottom, takePhoto, pickFiles)
                            // Innstillinger i Papir: aldri den klassiske skjermen.
                            s == Screen.Settings -> PaperSettings17(vm, navBottom, onPrivacyChanged)
                            // Kvitteringer i Papir (prompt 18). Bekreftelsen av én kvittering bruker fortsatt den felles skjermen.
                            s == Screen.Scan && vm.selectedReceipt == null -> PaperReceipts23(vm, navBottom, takePhoto, pickPhotos, pickFiles)
                            else -> PaneBox(navBottom, pullUp = s in PAPER_PULL_UP) { MainPane(vm, false, scan, onPrivacyChanged) }
                        }
                    } } }
                    }
                    // Prompt 28: wiggle-modus (Hjem, Finans, Mat, Sporing): ＋/✓-piller i eget lag over listen, aldri kuttet av scrolling.
                    if (vm.editPage != null) WigglePills28(vm, Modifier.align(Alignment.TopCenter).padding(top = WIGGLE_TOP28).widthIn(max = if (wide) 720.dp else 10_000.dp))
                }
            }
            if (setHere) Unit
            else if (wide) {
                PaperRail(vm, bar, float, Modifier.align(Alignment.CenterStart).statusBarsPadding().navigationBarsPadding().padding(start = 12.dp, top = 12.dp, bottom = 12.dp), onTap, onHold)
            } else {
                PaperNav(vm, bar, float, Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = barBottom), onTap, onHold)
            }
            if (float && bar != "sub" && !noScanHere(vm) && !setHere) PaperFab(vm, bar,
                Modifier.align(Alignment.BottomEnd).padding(end = if (wide) 24.dp else 18.dp, bottom = if (wide) navInset + 24.dp else barBottom + 62.dp + 14.dp), onTap, onHold)
            vm.plusHint?.let { h ->
                Box(Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = if (wide) navInset + 96.dp else barBottom + (if (float) 146.dp else 72.dp)).clip(RoundedCornerShape(12.dp)).background(p.ink).padding(12.dp, 8.dp)) {
                    Text(h, color = p.bg, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            val bgMenuHere = home || bgPillHere29(vm)
            if (vm.photoMenu && bgMenuHere) {
                // Trykk utenfor menyen lukker den.
                Box(Modifier.fillMaxSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.photoMenu = false })
            }
            AnimatedVisibility(
                visible = vm.photoMenu && bgMenuHere,
                enter = fadeIn(tween(160)) + scaleIn(tween(160), initialScale = 0.96f),
                exit = fadeOut(tween(120)) + scaleOut(tween(120), targetScale = 0.96f),
                modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 52.dp, end = 16.dp),
            ) {
                PhotoMenu(vm, Modifier) { ownPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            }
            // Meldinger ligger over fanelinja, ikke midt i innholdet.
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = if (wide) navInset + 24.dp else barBottom + 70.dp))
            if (vm.busy) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }
            if (vm.newsOpen) NewsReader(vm)
            if (vm.weatherOpen) WeatherApp(vm)
            if (vm.ruterOpen) RuterScreen24(vm)
            if (vm.familyOpen) FamilyScreen(vm)
            if (vm.tasksOpen) TasksScreen(vm)
            if (vm.bd24.open) BirthdaysScreen24(vm)
            if (vm.kal26.open) KalenderScreen27(vm)
            if (vm.chat27.open) ChatScreen27(vm)
            if (vm.compareOpen) CompareScreen(vm)
            // Prompt 23 (MOD): Finn-annonsen i fullskjerm (egen BackHandler, så tilbake lukker den uten forhåndsvisning).
            if (vm.m23.finnAdFor != null) FinnAdScreen23(vm)
            // Prompt 31: System-siden «Nordlys OS» i fullskjerm (uten bakgrunnsbilde, fanelinje og skann).
            if (vm.p31.nordOpen) NordlysPage31(vm)
            // Prompt 34: Glimt-brief og AI-kontroll i fullskjerm (over Chat, så «Full AI-kontroll ›» i Chat legger seg over).
            if (vm.p34.briefOpen) BriefPage35(vm)
            if (vm.p35.glimtOpen) GlimtPage35(vm)
            if (vm.p34.aiOpen) AiControl34(vm)
            // Prompt 29: «Legg til time»-arket, pillen og banneret over alt (Kalender og Hjem). Prompt 31: Glimt-toasten ligger her.
            Quick29Overlay(vm)
            // Prompt 31: «Glimt svarte mens du var borte».
            AwayBanner31(vm, Modifier.align(Alignment.TopCenter))
        }
      }
    }
    if (vm.tabEdit) TabBarEditor(vm)
    if (vm.b26.finEdit) FinTabBarEditor26(vm)
    if (vm.p32b.secEdit != null) SecNavEditor32b(vm) // Prompt 32: Domener, Abonnement og Familie
    if (vm.scanSheet) PaperScanSheet(vm, takePhoto, pickPhotos, pickFiles)
    if (vm.trkSettings) PaperTrackSettings(vm)
    if (vm.trkAddOpen) NewShipmentSheet(vm)
    if (vm.domainManager) DomainManagerSheet(vm)
}

/** Reservegradienten under toppbildet (170°, #4a5a6a → #2a3440 60 % → #1d242c). */
internal val HERO_FALLBACK: Array<Pair<Float, Color>> = arrayOf(0f to Color(0xFF4A5A6A), .6f to Color(0xFF2A3440), 1f to Color(0xFF1D242C))

/** Pakker og Avganger side om side på Fold: samme høyde. */
private val FOLD_CARD = 176.dp

/** Høyden fanelinja tar nederst (62 dp linje + 12 dp marg + litt luft), så innholdet stopper over den. */
internal val PAPER_BAR = 82.dp

/** De vanlige skjermene i Papir: plass til fanelinjen nederst. */
@Composable
private fun PaneBox(navBottom: Dp, pullUp: Boolean = false, content: @Composable () -> Unit) {
    // Innholdet går helt ned og scroller bak fanelinja og den røde +-knappen (listene har egen luft nederst).
    // Prompt 23: Finans-undersider der første element er et kort, legger kortet 23 dp opp i toppbildet som de andre sidene.
    if (pullUp) Box(Modifier.fillMaxSize().pullUp(24.dp)) { content() }
    else Box(Modifier.fillMaxSize().padding(top = 23.dp)) { content() }
}

/** Fotovinduet: bilde (Oslo, Vær nå, Planeter, eget) eller gradient, med hilsen eller sidetittel nederst. */
@Composable
private fun Hero(vm: AppViewModel, home: Boolean, wide: Boolean, toggleMenu: () -> Unit) {
    val (kicker, title) = heroText(vm)
    val bmp: Bitmap? = if (vm.photoKind == "cur" || vm.photoKind == "none") null else vm.photo
    val fg = bgForeground(vm, bmp != null)
    // Prompt 21: toppbildet er alltid et foto. Uten foto (eller når alle filene feiler) vises bare den rolige gradienten
    // linear-gradient(170deg, #4a5a6a, #2a3440 60%, #1d242c), aldri en tegning eller serverens egne farger.
    val grad = HERO_FALLBACK
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    // Hjem: 226 dp (250 på Fold), så navnet aldri havner bak søkefeltet.
    val h = (if (home) (if (wide) 214.dp else 190.dp) else 132.dp) + statusTop
    Box(Modifier.fillMaxWidth().height(h).background(Brush.verticalGradient(*grad)).animateContentSize()) {
        // Bilde med blur, demping, scrim, papirtekstur og partikler (prompt 19).
        BgLayer(vm, bmp)
        BoligHero24(vm, Modifier.matchParentSize()) // Prompt 24: bakgrunnen til valgt bolig på Boliger
        Column(Modifier.fillMaxSize().padding(top = statusTop + 8.dp, start = if (wide) 130.dp else 22.dp, end = 22.dp, bottom = if (home) 40.dp else 32.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (home) PSerif(vm.appName, 22.sp, fg, Modifier.weight(1f), maxLines = 1)
                else {
                    // Prompt 24: ingen tilbakeknapp på rotsidene i profilene (profilbildet står fortsatt til høyre).
                    // Prompt 25: på Fold viser sidelinja en rød Hjem-knapp; da trengs ikke «‹ Hjem» (andre mål vises fortsatt).
                    if (!vm.b24IsRoot() && !(wide && backLabel(vm) == "Hjem")) Box(
                        Modifier.height(34.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClickLabel = "Tilbake") { if (!vm.b24Back()) vm.back() }.padding(start = 10.dp, end = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("‹ ${backLabel(vm)}", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1) }
                    Spacer(Modifier.weight(1f))
                }
                // Prompt 29: pillen «<bakgrunn> ▾» på Hjem og øverst i Innstillinger, rett til venstre for profilbildet (samme meny).
                if (home || bgPillHere29(vm)) Box(
                    Modifier.height(34.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClickLabel = "Velg bakgrunn") { toggleMenu() }.padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("${photoName(vm.photoKind)} ▾", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
                // Profilbildet åpner Innstillinger → Profil.
                Box(
                    Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFF3EFE6)).clickable(onClickLabel = "Innstillinger") { vm.openPaperPage("set") }
                        .semantics { contentDescription = "Innstillinger" },
                    contentAlignment = Alignment.Center,
                ) { AvatarImage(vm, 38, Color(0xFFF3EFE6), Color(0xFF1B1A17)) }
            }
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    PSerif(kicker, 15.sp, fg.copy(alpha = .9f), italic = true, weight = FontWeight.Normal, maxLines = 1)
                    Spacer(Modifier.height(4.dp))
                    // Hilsen + komma på linje 1 og navnet på linje 2; lange hilsener skaleres ned i stedet for å brytes.
                    if (home) AutoSerif(title, if (wide) 44.sp else 31.sp, fg, min = 20.sp)
                    else PSerif(title, 36.sp, fg, maxLines = 2)
                }
                if (!home) DomainPill24(vm)
                val w = vm.mobileHome?.weather
                if (home && w?.temp != null) Column(
                    Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = "Åpne været") { vm.openWeather() }.padding(start = 8.dp),
                    horizontalAlignment = Alignment.End,
                ) {
                    PSerif("${Math.round(w.temp)}°", 52.sp, fg, weight = FontWeight.Normal, maxLines = 1)
                    Text("${w.text ?: w.place} · ${LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))} ›", color = fg.copy(alpha = .9f), fontSize = 13.sp, maxLines = 1)
                }
            }
            vm.photoCredit?.takeIf { home && bmp != null }?.let { Text(it, color = fg.copy(alpha = .7f), fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/** Prompt 29: bakgrunnspillen vises også på hovedsiden i Innstillinger. */
private fun bgPillHere29(vm: AppViewModel): Boolean =
    (vm.paperPage == "set" || vm.screen == Screen.Settings) && vm.settingsPage == null && vm.original == null && vm.editing == null && vm.detail == null

private fun photoName(k: String) = when (k) { "cur" -> "Nåværende"; "none" -> "Ingen"; "weather" -> "Vær nå"; "planets" -> "Planeter"; "custom" -> "Eget bilde"; else -> "Oslo" }

private fun photoSub(vm: AppViewModel, k: String): String = when {
    k == "cur" -> "Mørk gradient"
    k == "none" -> "Bare gradient, ingen bilder"
    k in vm.photoFailed -> "Fikk ikke lastet bildet · trykk for å prøve igjen"
    k == "oslo" -> "Bilde av Oslo"
    k == "weather" -> "Følger været nå"
    k == "planets" -> if (vm.bgRotate == "hourly") "Ny planet hver time (NASA)" else "Ny planet hver dag (NASA)"
    else -> "Ditt eget bilde"
}

/**
 * Egen rullegardin for bakgrunnen (ikke systemets meny): papirfarget panel med radius 18 og skygge,
 * miniatyrer 30×30 (radius 8), navn og undertekst, ✓ på valgt rad og «+ Eget bilde» nederst.
 */
@Composable
private fun PhotoMenu(vm: AppViewModel, modifier: Modifier, own: () -> Unit) {
    val p = PaperPal.current
    Column(
        modifier.width(262.dp).shadow(22.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(p.pop).padding(6.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        listOf("cur", "oslo", "weather", "planets").forEach { k ->
            val on = vm.photoKind == k
            val failed = k in vm.photoFailed
            Row(
                Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(12.dp)).background(if (on) p.popSel else Color.Transparent)
                    .clickable { if (failed) vm.retryPhoto(k); vm.setPhotoKind(k) }.padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(Brush.linearGradient(listOf(Color(0xFF4A5A6A), Color(0xFF1D242C))))) {
                    vm.photoThumbs[k]?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                }
                Column(Modifier.weight(1f)) {
                    Text(photoName(k), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                    Text(photoSub(vm, k), color = if (failed) p.lab else p.mut, fontSize = 11.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                if (on) Text("✓", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                else if (failed) Text("!", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(12.dp)).background(if (vm.photoKind == "custom") p.popSel else Color.Transparent)
                .clickable(onClick = own).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).border(1.5.dp, p.line, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                vm.photoThumbs["custom"]?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize().clip(RoundedCornerShape(8.dp))) }
                    ?: Text("+", color = p.mut)
            }
            Text("+ Eget bilde", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
            if (vm.photoKind == "custom") Text("✓", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/**
 * Fanelinja nederst. Hovedlinja: Hjem (bare på Hjem), Finans, Mat, Domener eller Sporing (fjerde fane), Søk og Mer.
 * Finans: brukerens faner (opptil 4) og Mer. Domener: Oversikt, Publikum, Ytelse og Infra. Fanene fordeles jevnt
 * (aktiv fane får sin egen bredde). Med «I linjen» står +-knappen rett etter: trykk = valg, hold inne 450 ms = filvelgeren.
 */
@Composable
private fun PaperNav(vm: AppViewModel, bar: String, float: Boolean, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit) {
    val p = PaperPal.current
    val cur = navCurrent(vm, bar)
    val tabs = navTabs(vm, bar, float)
    Row(
        modifier.fillMaxWidth().height(62.dp).shadow(16.dp, CircleShape).clip(CircleShape).background(p.nav)
            // Prompt 32: også Domener og Abonnement har «Rediger fanelinjen».
            .longPressEdit26(bar == "main" || bar == "fin" || bar == "dom" || bar == "sub", bar) {
                Haptics.tap()
                when (bar) { "fin" -> vm.b26.finEdit = true; "dom" -> vm.p32b.secEdit = "dom"; "sub" -> vm.p32b.secEdit = "abo"; else -> vm.tabEdit = true }
            }.padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        // Prompt 24: egen Row per fane (Mer24.kt): ikonboks 18, glyf 16, 1,5 ned, 7 mellomrom, tekst uten fontpadding.
        tabs.forEach { t -> PaperTab24(t.label, t.icon, cur == t.key, p.navInk, p.navActInk, p.navAct) { if (cur == t.key) vm.tabReselect26(bar, t) else t.go(); Haptics.select() } }
        if ((!float || bar == "sub") && !noScanHere(vm)) ScanPress(vm, bar, Modifier.padding(start = 4.dp), 46.dp, CircleShape, onTap, onHold) { Text("+", color = p.onLab, fontSize = 22.sp) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PaperScanSheet(vm: AppViewModel, camera: () -> Unit, photos: () -> Unit, files: () -> Unit) {
    val p = PaperPal.current
    val fin = vm.paperFin
    ModalBottomSheet(onDismissRequest = { vm.scanSheet = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif(when { fin -> "Legg til kvittering"; vm.scanTarget == "recipe" -> "Skann oppskrift"; else -> "Skann" }, 24.sp)
            Text(if (fin) "Ta bilde, velg filer eller del fra e-post. ✦ Gemini leser i bakgrunnen og kobler mot transaksjonen."
                else "Kvittering, oppskrift eller dokument. ✦ Gemini leser i bakgrunnen.", color = p.mut, fontSize = 13.sp)
            if (!fin) Row(Modifier.fillMaxWidth().clip(CircleShape).border(1.dp, p.line, CircleShape).padding(3.dp)) {
                listOf("receipt" to "Kvittering", "recipe" to "Oppskrift").forEach { (k, n) ->
                    val on = vm.scanTarget == k
                    Box(Modifier.weight(1f).height(38.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).clickable { vm.scanTarget = k }, contentAlignment = Alignment.Center) {
                        Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
                    }
                }
            }
            ScanQueue(vm)
            PButton("Kamera", Modifier.fillMaxWidth(), height = 54.dp) { vm.scanSheet = false; camera() }
            PButton("Bilder", Modifier.fillMaxWidth(), kind = "line", height = 54.dp) { vm.scanSheet = false; photos() }
            PButton("Fil (PDF, JPG, HEIC)", Modifier.fillMaxWidth(), kind = "line", height = 54.dp) { vm.scanSheet = false; files() }
        }
    }
}

/** Køen i skannearket: opplastinger som pågår og kvitteringer/oppskrifter som leses. */
@Composable
private fun ScanQueue(vm: AppViewModel) {
    val p = PaperPal.current
    val rows = mutableListOf<Triple<String, Float, Boolean>>()
    if (vm.uploading > 0) rows += Triple(if (vm.uploading == 1) "Laster opp 1 fil …" else "Laster opp ${vm.uploading} filer …", 0.15f, false)
    vm.jobs.filter { it.status == "pending" || it.status == "processing" }.take(4).forEach { j ->
        rows += Triple(j.merchant ?: j.name.ifBlank { "Kvittering" }, (j.progress.coerceIn(5, 95)) / 100f, false)
    }
    (vm.receipts ?: emptyList()).filter { it.status == "needs_review" }.take(2).forEach { r ->
        rows += Triple(r.merchant ?: "Kvittering", 1f, true)
    }
    vm.recipeJobs.take(3).forEach { j -> rows += Triple(j.name ?: "Oppskrift", if (j.active) 0.5f else 1f, !j.active && j.error == null) }
    rows.forEach { (n, pct, ok) ->
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).padding(12.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row {
                Text(n, color = p.ink, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(if (ok) "✓ Klar til bekreftelse" else "✦ Leser … ${Math.round(pct * 100)} %", color = if (ok) p.pos else p.lab, fontSize = 12.5.sp)
            }
            Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(p.line)) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(pct).clip(RoundedCornerShape(2.dp)).background(if (ok) p.pos else p.lab))
            }
        }
    }
}

/* ---------------- Hjem ---------------- */

private val HOME_SECS = listOf(
    PSec("h12", "Glimt-brief", full = true), // Prompt 34: øverst, over widgetene (kan flyttes og skjules i wiggle-modus)
    PSec("h1", "Søk", full = true), PSec("h2", "Pakker"), PSec("h3", "Avganger"), PSec("h11", "Prøveperioder"), PSec("h10", "Kalender"), PSec("h9", "Bursdager"), PSec("hm", "Moduler", full = true),
    PSec("h8", "Huskeliste"), PSec("h6", "Posisjon"), PSec("h7", "Bolig"),
    PSec("h5", "Siste nytt", full = true), PSec("h4", "Snarveier", full = true), PSec("hs", "Server"),
)

@Composable
private fun PaperHome(vm: AppViewModel, navBottom: Dp, wide: Boolean) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val h = vm.mobileHome
    LaunchedEffect(vm.base) { vm.loadHomeExtras(); vm.loadUpd30(); vm.loadUpdSettings30() }
    AppUpd32Effects(vm) // prompt 32: ny versjon av selve appen (ui/AppUpdate32Ui.kt)
    if (vm.p30.upd.pwFor != null) UpdPwSheet30(vm)
    LazyVerticalGrid(
        GridCells.Fixed(if (wide) 2 else 1), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom),
        verticalArrangement = Arrangement.spacedBy(10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        vm.homeError?.let { e -> item(span = { GridItemSpan(maxLineSpan) }) { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(4.dp)) } }
        // Prompt 30: oppdateringsbanneret øverst, over søkefeltet (admin; ✕ skjuler «Tilgjengelig» i 24 t).
        if (vm.editPage != "hjem" && upd30Show(vm, home = true)) item(key = "upd30", span = { GridItemSpan(maxLineSpan) }) { UpdateBanner30(vm, home = true) }
        if (vm.editPage != "hjem" && vm.appUpd32OnHome()) item(key = "appupd32", span = { GridItemSpan(maxLineSpan) }) { AppUpdateBanner32(vm) }
        pageGridSecs(vm, "hjem", HOME_SECS, wide) { k ->
            when (k) {
                "h12" -> HomeBrief34(vm) // Prompt 34: Glimt-brief med figuren (ui/Brief34.kt)
                "h1" -> PaperSearch29(vm) // Prompt 29: søkemotor-meny (Glimt / Google / DuckDuckGo) og timer (ui/Home29Ui.kt)
                // Viktigste pakke (klar for henting først).
                "h2" -> {
                    val pk = (vm.homePackages ?: emptyList()).sortedByDescending { it.ready }.firstOrNull()
                    // På Fold står pakkekortet ved siden av Avganger og er like høyt.
                    val cardMod = if (wide) Modifier.height(FOLD_CARD) else Modifier
                    if (pk == null) PCard(cardMod, onClick = { vm.paperTab("trk") }) {
                        // Prompt 24: kortet vises alltid, også uten aktive pakker.
                        Column(Modifier.padding(16.dp, 14.dp)) {
                            PLabel("Sporing")
                            PSerif("Ingen aktive pakker", 20.sp, maxLines = 1)
                            Text("Legg til et sporingsnummer", color = p.mut, fontSize = 12.5.sp, maxLines = 1)
                        }
                    }
                    else PCard(cardMod, onClick = { vm.paperTab("trk") }) {
                        Row(Modifier.padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            PackageLogo(vm, pk, 52)
                            Column(Modifier.weight(1f)) {
                                PLabel(if (pk.ready) "Hent i dag" else pk.statusText.ifBlank { "På vei" })
                                // Tittel: varenavn eller butikk, ellers «Pakke fra Bring». Sporingsnummeret står i detaljene.
                                PSerif(pk.cardTitle, 20.sp, maxLines = 1)
                                Text(listOf(pk.etaText, pk.carrierName).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Text(morePackagesLabel(vm, pk), color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                // Prompt 27: valgte stopp (Velg stopp), én gruppe per stopp, sanntid hvert 30. s. Uten egne stopp: kortet fra /mobile/home.
                "h3" -> if (homeRuter27(vm)) RuterHome27(vm, if (wide) Modifier.height(FOLD_CARD) else Modifier) else {
                    val lines = h?.ruter ?: emptyList()
                    // Trykk åpner Avganger (egen side med flere avganger, detaljer og egne stopp).
                    if (lines.isNotEmpty()) PaperRuter(lines, if (wide) Modifier.height(FOLD_CARD) else Modifier) { vm.openRuter() }
                    else PCard(if (wide) Modifier.height(FOLD_CARD) else Modifier, onClick = { vm.openRuter() }) { Text("Ingen avganger ennå. Trykk for å legge til en holdeplass.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp, 14.dp)) }
                }
                "hm" -> PaperMinis(vm)
                // Nye kort: Huskeliste (de tre neste med avkrysning), Posisjon (familien) og Bolig.
                "h8" -> HomeTasksCard(vm)
                "h9" -> HomeBirthdaysCard24(vm)
                "h10" -> HomeKalCard26(vm)
                "h11" -> HomeTrials32b(vm) // Prompt 32: prøveperioder (ui/Ui32b.kt)
                "h6" -> HomePositionCard(vm)
                "h7" -> HomeBoligCard(vm)
                "h5" -> PaperNewsCard(vm)
                "h4" -> if (!h?.shortcuts.isNullOrEmpty()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PHead("Snarveier")
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        h?.shortcuts?.forEach { sc ->
                            Row(
                                Modifier.height(36.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).background(p.card).clickable { openLink(ctx, sc.url) }.padding(horizontal = 14.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(Modifier.size(8.dp).clip(CircleShape).background(if (sc.local) p.pos else p.lab))
                                Text(sc.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
                            }
                        }
                    }
                }
                "hs" -> h?.serverStatus?.let { st ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        PHead("Server", h.serverName)
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            listOf("CPU" to st.cpu, "Minne" to st.mem, "Disk" to st.disk).forEach { (n, v) ->
                                Column { Text(n, color = p.mut, fontSize = 11.5.sp); PSerif(v?.let { "${Math.round(it)} %" } ?: "–", 18.sp) }
                            }
                            Column { Text("Oppe", color = p.mut, fontSize = 11.5.sp); PSerif(st.uptime ?: "–", 18.sp, maxLines = 1) }
                        }
                    }
                }
            }
        }
    }
}

/** «⌕ Søk på Google»: forslag via serveren, Enter åpner søket (adresser åpnes direkte). */
@Composable
private fun PaperSearch(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    var q by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth().height(46.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(p.card).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Prompt 27: Google-G byttes til ✕ når det står tekst (fokus beholdes).
            SearchLead27(q.isNotEmpty(), p.ink, p.mut, idle = { GoogleG(18.dp) }) { q = ""; vm.suggest("") }
            BasicTextField(
                q, { q = it; vm.suggest(it) }, singleLine = true,
                textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.lab),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { if (q.isNotBlank()) { openLink(ctx, vm.googleUrl(q)); q = "" } }),
                modifier = Modifier.weight(1f),
                decorationBox = { inner -> Box { if (q.isEmpty()) Text("Søk på Google", color = p.mut, fontSize = 14.5.sp); inner() } },
            )
            // Prompt 27: ✦ AI til høyre åpner Chat med teksten (Chat-siden eies av ANDROID-A).
            Box(
                Modifier.offset(x = 10.dp).height(34.dp).clip(CircleShape).background(p.bg)
                    .clickable(role = androidx.compose.ui.semantics.Role.Button, onClickLabel = "Spør AI") { Haptics.select(); val t = q.trim(); q = ""; vm.suggest(""); vm.openChat(t) }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text("✦ AI", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }
        }
        if (q.isNotBlank() && vm.suggestions.isNotEmpty()) PCard {
            vm.suggestions.take(5).forEachIndexed { i, sg ->
                PRow(sg, null, "↗", serif = false, top = i > 0) { openLink(ctx, vm.googleUrl(sg)); q = "" }
            }
        }
    }
}

@Composable
private fun PaperRuter(lines: List<RuterLine>, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    val rows = lines.flatMap { l -> l.departures.map { d -> l to d } }.sortedBy { (_, d) -> d.min ?: Int.MAX_VALUE }.take(3)
    val stop = lines.map { it.from }.distinct().joinToString(" · ")
    PCard(modifier, onClick = onClick) {
        Column(Modifier.padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                PLabel("Avganger · $stop", modifier = Modifier.weight(1f))
                Text("sanntid ›", color = p.mut, fontSize = 12.sp)
            }
            rows.forEach { (l, d) ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    // Ruters linjefarger (Entur), ellers standardfargen for transportmiddelet.
                    Box(Modifier.widthIn(min = 30.dp).height(24.dp).clip(RoundedCornerShape(6.dp)).background(Color(d.color ?: ruterModeColor(d.mode, d.line))).padding(horizontal = 5.dp),
                        contentAlignment = Alignment.Center) { Text(d.line, color = Color(d.textColor ?: 0xFFFFFFFF), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1) }
                    Text(d.to ?: l.to, color = p.ink, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    PSerif(d.min?.let { if (it <= 0) "nå" else "$it" } ?: d.time ?: "–", 22.sp, maxLines = 1)
                    Text(if ((d.min ?: 1) > 0) "min" else "", color = p.mut, fontSize = 12.sp, modifier = Modifier.width(26.dp))
                }
            }
        }
    }
}

@Composable
private fun PaperMinis(vm: AppViewModel) {
    val p = PaperPal.current
    val saldo = vm.boot?.accounts?.sumOf { it.balance }
    val review = vm.boot?.reviewCount ?: vm.summary?.review?.size ?: 0
    val dom = vm.domainToday
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Mini("Finans", saldo?.let { neg0(it) } ?: "–", if (review > 0) "$review kvitteringer" else "alt bokført", if (review > 0) p.lab else p.mut, 20.sp, Modifier.weight(1f)) { vm.paperTab("fin") }
        Mini("Mat", vm.todayMeal ?: "Ingen rett", "", p.mut, 16.sp, Modifier.weight(1f)) { vm.paperTab("mat") }
        Mini("Domener", dom?.let { count(it.second) } ?: "–", dom?.first ?: "", p.pos, 20.sp, Modifier.weight(1f)) { vm.domSection = "oversikt"; vm.go(Screen.Domains) }
    }
}

@Composable
private fun Mini(k: String, v: String, sub: String, subColor: Color, size: TextUnit, modifier: Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Column(
        modifier.fillMaxHeight().heightIn(min = 62.dp).clip(RoundedCornerShape(18.dp)).background(p.card).clickable(onClick = onClick).padding(12.dp, 10.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        PLabel(k, p.mut, 9.5.sp)
        Spacer(Modifier.weight(1f))
        PSerif(v, size, maxLines = 2)
        if (sub.isNotBlank()) Text(sub, color = subColor, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Kortet «Siste nytt»: 5 saker, og «Åpne nyhetsleser ›» nederst. */
@Composable
private fun PaperNewsCard(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val items = vm.homeNews.ifEmpty { vm.news?.items?.take(5) ?: emptyList() }
    PCard {
        Row(Modifier.fillMaxWidth().padding(14.dp, 8.dp, 14.dp, 6.dp), verticalAlignment = Alignment.CenterVertically) {
            PLabel("Siste nytt", modifier = Modifier.weight(1f))
            Text(items.map { it.feed }.distinct().take(3).joinToString(" · "), color = p.mut, fontSize = 11.5.sp, maxLines = 1)
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(p.ink))
        Column(Modifier.padding(horizontal = 14.dp)) {
            if (items.isEmpty()) Text("Ingen saker ennå. Legg til kilder i nyhetsleseren.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(vertical = 10.dp))
            items.take(5).forEach { x ->
                Row(
                    // Prompt 27: saken åpnes i Nyhetsleser (bilde, ✦ sammendrag og «Les hele saken»).
                    Modifier.fillMaxWidth().clickable { vm.openNews(); vm.openArticle27(x) }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(feedShort(x.feed), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, maxLines = 1, modifier = Modifier.width(30.dp))
                    PSerif(x.title, 14.sp, maxLines = 1, modifier = Modifier.weight(1f))
                    Text(newsTime(x.published), color = p.mut, fontSize = 11.sp)
                }
                PRule()
            }
        }
        Box(Modifier.fillMaxWidth().padding(10.dp, 10.dp, 10.dp, 12.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable { vm.openNews() }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                Text("Åpne nyhetsleser ›", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
        }
    }
}

/** «NRK», «VG», «E24», ellers de tre første bokstavene. */
internal fun feedShort(f: String): String = if (f.length <= 4) f.uppercase(nbNo) else f.take(3).uppercase(nbNo)

/** «09:12» i dag, ellers «18.10». */
internal fun newsTime(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val t = runCatching { OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault()) }.getOrNull()
        ?: runCatching { java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()) }.getOrNull() ?: return ""
    return if (t.toLocalDate() == LocalDate.now()) t.format(DateTimeFormatter.ofPattern("HH:mm")) else t.format(DateTimeFormatter.ofPattern("dd.MM"))
}

/* ---------------- Finans ---------------- */

private val FIN_SECS = listOf(PSec("f1", "Saldo"), PSec("f2", "Kvitteringer"), PSec("f3", "Siste transaksjoner"), PSec("f4", "Budsjett"))

@Composable
private fun PaperFinance(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    val sm = vm.summary
    val saldo = vm.boot?.accounts?.sumOf { it.balance } ?: 0.0
    val review = vm.reviewCount ?: vm.boot?.reviewCount ?: sm?.review?.size ?: 0
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        pageSecs(vm, "finans", FIN_SECS) { k ->
            when (k) {
                "f1" -> PCard(shadow = true) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        PLabel("Saldo · alle kontoer")
                        PSerif("${neg0(saldo)} kr", 44.sp, weight = FontWeight.Normal, maxLines = 1)
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                            listOf(Triple("Inn", sm?.inn ?: 0.0, p.pos), Triple("Brukt", sm?.ut ?: 0.0, p.ink), Triple("Igjen", sm?.left ?: 0.0, p.ink)).forEach { (n, v, c) ->
                                Column(Modifier.weight(1f)) { Text(n, color = p.mut, fontSize = 11.5.sp); PSerif(n0(v), 18.sp, c, maxLines = 1) }
                            }
                        }
                    }
                }
                // «N kvitteringer til gjennomgang»: teksten åpner køen, «Skann ›» åpner skannearket. Skjules når køen er tom.
                "f2" -> if (review > 0) ReviewBanner(review, open = { vm.openReview() }, scan = { vm.scanTarget = "receipt"; vm.scanSheet = true })
                "f3" -> Column {
                    PHead("Siste transaksjoner", "Vis alle ›") { vm.paperFinTab("liste") }
                    val recent = vm.recent15 ?: sm?.recent ?: emptyList()
                    if (recent.isEmpty()) Text("Ingen transaksjoner ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
                    recent.take(15).forEach { t ->
                        Row(Modifier.fillMaxWidth().clickable { vm.openTx(t.id) }.padding(2.dp, 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Logo(vm, t.domain, t.merchant ?: t.description, t.color, 38, RoundedCornerShape(11.dp))
                            Column(Modifier.weight(1f)) {
                                Text(t.merchant ?: t.description, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${t.category} · ${ddmm(t.date)}", color = p.mut, fontSize = 12.sp, maxLines = 1)
                            }
                            PSerif(signed(t.amount), 17.sp, if (t.amount > 0) p.pos else p.ink, maxLines = 1)
                        }
                        PRule()
                    }
                }
                "f4" -> {
                    val buds = sm?.budgets ?: emptyList()
                    if (buds.isNotEmpty()) Column {
                        PHead("Budsjett · ${sm?.month?.let { monthLabel(it).lowercase(nbNo) } ?: ""}", "${n0(sm?.budgetUsed ?: 0.0)} av ${n0(sm?.budgetTotal ?: 0.0)}") { vm.go(Screen.Budget) }
                        buds.take(6).forEach { b ->
                            val pct = if (b.budget > 0) (b.used / b.budget).coerceIn(0.0, 1.0) else 0.0
                            Row(Modifier.fillMaxWidth().clickable { vm.go(Screen.Budget) }.padding(2.dp, 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(b.category, color = p.ink, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(110.dp))
                                Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(p.line)) {
                                    Box(Modifier.fillMaxHeight().fillMaxWidth(pct.toFloat()).clip(RoundedCornerShape(4.dp)).background(if (pct > .9) p.lab else p.ink))
                                }
                                Text("${Math.round(pct * 100)} %", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.width(46.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Banneret «N kvitteringer til gjennomgang» (Papir og Klassisk): aksentflate, hvit tekst og «Skann ›» til høyre. */
@Composable
internal fun ReviewBanner(n: Int, open: () -> Unit, scan: () -> Unit, bg: Color = PaperPal.current.lab, fg: Color = PaperPal.current.onLab) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(bg), verticalAlignment = Alignment.CenterVertically) {
        Text(if (n == 1) "1 kvittering til gjennomgang" else "$n kvitteringer til gjennomgang", color = fg, fontWeight = FontWeight.Bold, fontSize = 15.sp,
            modifier = Modifier.weight(1f).clickable(onClick = open).padding(16.dp, 14.dp))
        Text("Skann ›", color = fg, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.clickable(onClick = scan).padding(16.dp, 14.dp))
    }
}

/* ---------------- Mer, Innstillinger og Media ---------------- */

@Composable
private fun PaperMore(vm: AppViewModel, navBottom: Dp) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            PCard(shadow = true) {
                // Aksjer, Abonnementer, Boliger og Finn ligger under Finans → Mer (egen fanelinje).
                // Modulen som ikke står i fanelinja (fjerde fane er Domener eller Sporing) ligger her.
                val onWay = vm.packagesOnWay
                val rows: List<Triple<String, String, () -> Unit>> = listOf(
                    if (vm.tab4 == "sporing") Triple("Domener", "Trafikk, besøk og oppetid", { vm.domSection = "oversikt"; vm.openFromMer(Screen.Domains) })
                    else Triple("Sporing", if (onWay > 0) "$onWay pakker på vei" else "Pakker og sendinger", { vm.openFromMer(Screen.Tracking) }),
                    Triple("Huskeliste", "Oppgaver og widgets", { vm.openTasks() }),
                    Triple("Familie og kart", "Hvor alle er, soner og helse", { vm.openFamily() }),
                    Triple("Avganger", "Ruter i sanntid og egne stopp", { vm.openRuter() }),
                    Triple("Vær", "Steder og varsel fra MET (yr.no)", { vm.openWeather() }),
                    Triple("Media", "Spilles nå og historikk", { vm.openPaperPage("media") }),
                    Triple("Finans", "Oversikt, liste, Finn og mer", { vm.paperTab("fin") }),
                    Triple("Nyhetsleser", "RSS med ✦ AI-sammendrag", { vm.openNews() }),
                    Triple("Innstillinger", "Tema, bakgrunn og konto", { vm.openPaperPage("set") }),
                )
                rows.forEachIndexed { i, (n, sub, go) -> PRow(n, sub, top = i > 0, onClick = go) }
            }
        }
    }
}

@Composable
private fun PaperSettings(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        item { PLabel("Tema", modifier = Modifier.padding(start = 4.dp, top = 6.dp)) }
        item {
            PCard {
                val sel = "✓ Valgt"
                PRow("Papir · lys", "Lyst papir og svart fanelinje", if (vm.paperMode == "lys") sel else "", p.pos, serif = false) { vm.setPaperMode("lys") }
                PRow("Papir · mørk", "Kveldspapir og lys fanelinje", if (vm.paperMode == "mork") sel else "", p.pos, serif = false, top = true) { vm.setPaperMode("mork") }
                PRow("Følg systemet", "Lys om dagen, mørk når telefonen er mørk", if (vm.paperMode == "auto") sel else "", p.pos, serif = false, top = true) { vm.setPaperMode("auto") }
                PRow("Klassisk (Material You)", "Bytt tilbake til det forrige mobildesignet", "Bytt ›", p.lab, serif = false, top = true) { vm.setMobileDesign("klassisk") }
            }
        }
        item { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { PaperNavSettings(vm) } }
        item { PLabel("Forside", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard {
                PRow("Bakgrunn", photoName(vm.photoKind), "Endre ›", serif = false) { vm.paperTab("hjem"); vm.photoMenu = true }
                PRow("Nyhetsleser", "Kilder, kategorier og AI", "Åpne ›", serif = false, top = true) { vm.openNews(settings = true) }
            }
        }
        item { PLabel("Konto", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard {
                PRow(vm.displayName.ifBlank { "Konto" }, (vm.me?.role ?: vm.account?.role ?: "").ifBlank { "Konto" }, "Kontoer ›", serif = false) { vm.menuOpen = true }
                PRow("Totrinnsbekreftelse", "Autentiseringsapp", if (vm.me?.totp == true) "På" else "Av", if (vm.me?.totp == true) p.pos else p.mut, serif = false, top = true) {
                    vm.settingsPage = "security"; vm.openFromMer(Screen.Settings)
                }
                PRow("Haptisk tilbakemelding", "Ved trykk og skann", "›", serif = false, top = true) { vm.settingsPage = "haptics"; vm.openFromMer(Screen.Settings) }
                PRow("Alle innstillinger", "Sikkerhet, skanning, varsler, server og data", "›", serif = false, top = true) { vm.settingsPage = null; vm.openFromMer(Screen.Settings) }
            }
        }
    }
}

@Composable
private fun PaperMedia(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val m = vm.media
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (m == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else {
            m.error?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp) } }
            if (!m.configured && m.error == null) item { Text("Ikke satt opp · Sett opp under Integrasjoner (Plex eller Jellyfin).", color = p.mut, fontSize = 13.sp) }
            item {
                PCard(shadow = true) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        PLabel("Spilles nå")
                        PSerif(if (m.now.size == 1) "1 strøm" else "${m.now.size} strømmer", 40.sp, weight = FontWeight.Normal, maxLines = 1)
                        Text(m.now.joinToString(" · ") { listOf(it.user, it.show).filter(String::isNotBlank).joinToString(" · ") }.ifBlank { "Ingen spiller noe akkurat nå" },
                            color = p.mut, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            item { PHead("Historikk") }
            items(m.history.size) { i ->
                val x = m.history[i]
                Column {
                    Row(
                        Modifier.fillMaxWidth().clickable(enabled = x.url != null) { x.url?.let { openLink(ctx, it) } }.padding(2.dp, 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Poster(vm, x.poster)
                        Column(Modifier.weight(1f)) {
                            PSerif(x.show, 17.sp, maxLines = 1)
                            Text(x.line, color = p.ink, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(listOf(x.user, ago(x.playedAt), if (x.src == "plex") "Plex" else if (x.src == "jellyfin") "Jellyfin" else "").filter(String::isNotBlank).joinToString(" · "),
                                color = p.mut, fontSize = 12.sp, maxLines = 1)
                        }
                    }
                    PRule()
                }
            }
        }
    }
}

@Composable
private fun Poster(vm: AppViewModel, path: String?) {
    val p = PaperPal.current
    var bmp by remember(path) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(path) { if (!path.isNullOrBlank() && path.startsWith("/")) bmp = vm.image(path) }
    val b = bmp
    if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.size(38.dp, 52.dp).clip(RoundedCornerShape(6.dp)))
    else Box(Modifier.size(38.dp, 52.dp).clip(RoundedCornerShape(6.dp)).background(p.line))
}

/** «20 t siden», «2 d siden». */
private fun ago(iso: String?): String {
    val t = runCatching { java.time.Instant.parse(iso) }.getOrNull() ?: runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull() ?: return ""
    val min = java.time.Duration.between(t, java.time.Instant.now()).toMinutes()
    return when {
        min < 60 -> "${min.coerceAtLeast(1)} min siden"
        min < 60 * 24 -> "${min / 60} t siden"
        else -> "${min / (60 * 24)} d siden"
    }
}

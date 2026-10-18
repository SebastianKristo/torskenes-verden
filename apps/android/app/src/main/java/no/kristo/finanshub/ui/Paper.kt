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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
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
internal fun PHead(label: String, right: String? = null, onRight: (() -> Unit)? = null) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.Bottom) {
            PLabel(label, modifier = Modifier.weight(1f).padding(bottom = 6.dp))
            if (right != null) Text(right, color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp).then(if (onRight != null) Modifier.clickable(onClick = onRight) else Modifier))
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(p.ink))
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

private fun greetingWord(): String = when (LocalTime.now().hour) { in 5..9 -> "God morgen"; in 10..17 -> "God dag"; else -> "God kveld" }

/** Hvilken fane som er markert i Papir-fanelinjen (hovedlinja, Finans-linja eller Domener-linja). */
private fun paperTabOf(vm: AppViewModel): String = when {
    vm.screen == Screen.Domains && vm.paperPage == null -> vm.domSection
    vm.paperFin -> when {
        vm.paperPage == "fmer" || vm.paperFromFinMer -> "fmer"
        vm.screen == Screen.List -> "liste"
        vm.screen == Screen.Finn -> "finn"
        vm.screen == Screen.Home -> "ov"
        else -> "fmer"
    }
    vm.paperPage != null || vm.paperFromMer -> "mer"
    vm.screen == Screen.Homelab -> "hjem"
    vm.screen == Screen.Mat -> "mat"
    vm.screen == Screen.Tracking -> "trk"
    vm.screen.isFinance -> "fin"
    else -> "mer"
}

/** Hvilken fanelinje som vises: «main», «fin» (Finans) eller «dom» (Domener). */
private fun paperBar(vm: AppViewModel): String = when {
    vm.screen == Screen.Domains && vm.paperPage == null -> "dom"
    vm.paperFin -> "fin"
    else -> "main"
}

/** Kicker (liten kursiv over) og tittel i fotovinduet. */
private fun heroText(vm: AppViewModel): Pair<String, String> {
    val first = vm.displayName.split(' ').firstOrNull().orEmpty().ifBlank { "du" }
    val today = LocalDate.now()
    return when (vm.paperPage) {
        "mer" -> "Alle moduler" to "Mer"
        "fmer" -> "Finans" to "Mer"
        "set" -> "Konto og utseende" to "Innstillinger"
        "media" -> "Plex · Jellyfin" to "Media"
        else -> when (vm.screen) {
            Screen.Homelab -> longDate(today) to "${vm.mobileHome?.greeting ?: greetingWord()},\n$first"
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
                (if (items.isEmpty()) "Pakker" else "$on på vei · $ready klar") to "Sporing"
            }
            Screen.Domains -> when (vm.domSection) {
                "publikum" -> "Kart, land og enheter" to "Publikum"
                "ytelse" -> "Statuskoder, fart og sikkerhet" to "Ytelse"
                "infra" -> "Oppetid, DNS og domeneinfo" to "Infrastruktur"
                else -> (vm.domain ?: "Siste 24 timer") to "Domener"
            }
            Screen.Stocks -> "Trading 212" to "Aksjer"
            Screen.Sub -> "Subscription OS" to "Abonnementer"
            Screen.Folders -> "Utgifter og regninger" to "Boliger"
            Screen.Finn -> "Kjøp og salg" to "Finn"
            Screen.Settings -> "Alle innstillinger" to "Innstillinger"
            Screen.List -> "Alle kontoer" to "Liste"
            Screen.Search -> "Finans · ✦ AI" to "Søk"
            Screen.Scan -> "Finans" to "Kvitteringer"
            else -> "Finans" to vm.screen.label
        }
    }
}

private fun backLabel(vm: AppViewModel): String = when {
    vm.paperPage == "mer" || vm.paperPage == "fmer" -> "Hjem"
    vm.paperFromFinMer -> "Mer"
    vm.paperFin && vm.screen in setOf(Screen.Home, Screen.List, Screen.Finn) -> "Hjem"
    vm.paperPage != null || vm.paperFromMer -> "Mer"
    vm.screen.isFinance && vm.screen != Screen.Home -> "Finans"
    else -> "Hjem"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PaperApp(
    vm: AppViewModel, snack: SnackbarHostState, takePhoto: () -> Unit, pickPhotos: () -> Unit, pickFiles: () -> Unit, onPrivacyChanged: () -> Unit,
) {
    val p = PaperPal.current
    val s = vm.screen
    val overlay = vm.original != null || vm.editing != null || vm.detail != null
    val home = s == Screen.Homelab && vm.paperPage == null && !overlay
    BackHandler(enabled = !home || vm.newsOpen || vm.photoMenu || vm.trkEdit) {
        when {
            vm.photoMenu -> vm.photoMenu = false
            vm.trkEdit -> vm.trkEdit = false
            else -> vm.back()
        }
    }
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
    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    // Linja ligger 12 dp over bunnen, eller like over systemets navigasjonsfelt (max(12, inset − 8)).
    val barBottom = maxOf(12.dp, navInset - 8.dp)
    val navBottom = barBottom - 12.dp
    val bar = paperBar(vm)

    CompositionLocalProvider(LocalTopRow provides true) {
        Box(Modifier.fillMaxSize().background(p.bg)) {
            Column(Modifier.fillMaxSize()) {
                Hero(vm, home, { vm.photoMenu = !vm.photoMenu; if (vm.photoMenu) vm.loadPhotoThumbs() })
                // Innholdet ligger 23 dp opp i fotovinduet, så søkefeltet og kortene overlapper bildet.
                Box(Modifier.weight(1f).fillMaxWidth().offset(y = (-23).dp)) {
                    when {
                        vm.original != null -> PaneBox(navBottom) { OriginalScreen(vm) }
                        vm.editing != null -> PaneBox(navBottom) { TxEditScreen(vm, vm.editing!!, scan) }
                        vm.detail != null -> PaneBox(navBottom) { DetailScreen(vm, vm.detail!!) }
                        vm.paperPage == "mer" -> PaperMore(vm, navBottom)
                        vm.paperPage == "fmer" -> PaperFinMore(vm, navBottom)
                        vm.paperPage == "set" -> PaperSettings(vm, navBottom)
                        vm.paperPage == "media" -> PaperMedia(vm, navBottom)
                        s == Screen.Homelab -> PaperHome(vm, navBottom)
                        s == Screen.Home && vm.selectedTx == null -> PaperFinance(vm, navBottom)
                        s == Screen.List && vm.selectedTx == null -> PaperList(vm, navBottom)
                        s == Screen.Finn -> PaperFinn(vm, navBottom)
                        s == Screen.Tracking -> PaperTracking(vm, navBottom)
                        s == Screen.Domains -> PaneBox(navBottom) { DomainsScreen(vm, false, section = vm.domSection) }
                        s == Screen.Mat && !vm.matFull -> MatSurface(vm, paper = true)
                        else -> PaneBox(navBottom) { MainPane(vm, false, scan, onPrivacyChanged) }
                    }
                }
            }
            PaperNav(vm, bar, Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = barBottom),
                onTap = {
                    if (bar == "dom") vm.domainManager = true
                    else {
                        vm.scanTarget = if (vm.screen == Screen.Mat) "recipe" else "receipt"
                        vm.scanSheet = true
                    }
                },
                onHold = {
                    if (bar != "dom") {
                        vm.scanTarget = if (vm.screen == Screen.Mat) "recipe" else "receipt"
                        holdFiles.launch(arrayOf("image/*", "application/pdf"))
                    }
                },
            )
            vm.plusHint?.let { h ->
                Box(Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = barBottom + 72.dp).clip(RoundedCornerShape(12.dp)).background(p.ink).padding(12.dp, 8.dp)) {
                    Text(h, color = p.bg, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            if (vm.photoMenu && home) {
                // Trykk utenfor menyen lukker den.
                Box(Modifier.fillMaxSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.photoMenu = false })
            }
            AnimatedVisibility(
                visible = vm.photoMenu && home,
                enter = fadeIn(tween(160)) + scaleIn(tween(160), initialScale = 0.96f),
                exit = fadeOut(tween(120)) + scaleOut(tween(120), targetScale = 0.96f),
                modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 52.dp, end = 16.dp),
            ) {
                PhotoMenu(vm, Modifier) { ownPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            }
            // Meldinger ligger over fanelinja, ikke midt i innholdet.
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = barBottom + 70.dp))
            if (vm.busy) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }
            if (vm.newsOpen) NewsReader(vm)
        }
    }
    if (vm.scanSheet) PaperScanSheet(vm, takePhoto, pickPhotos, pickFiles)
    if (vm.trkSettings) PaperTrackSettings(vm)
    if (vm.domainManager) DomainManagerSheet(vm)
}

/** Høyden fanelinja tar nederst (62 dp linje + 12 dp marg + litt luft), så innholdet stopper over den. */
internal val PAPER_BAR = 82.dp

/** De vanlige skjermene i Papir: plass til fanelinjen nederst. */
@Composable
private fun PaneBox(navBottom: Dp, content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().padding(top = 23.dp, bottom = PAPER_BAR + navBottom)) { content() }
}

/** Fotovinduet: bilde (Oslo, Vær nå, Planeter, eget) eller gradient, med hilsen eller sidetittel nederst. */
@Composable
private fun Hero(vm: AppViewModel, home: Boolean, toggleMenu: () -> Unit) {
    val ctx = LocalContext.current
    val (kicker, title) = heroText(vm)
    val bmp: Bitmap? = if (vm.photoKind == "cur") null else vm.photo
    val grad = vm.photoGradient.takeIf { it.size >= 2 }?.map { Color(it) } ?: listOf(Color(0xFF4A5A6A), Color(0xFF2A3440), Color(0xFF1D242C))
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val h = (if (home) 196.dp else 146.dp) + statusTop
    Box(Modifier.fillMaxWidth().height(h).background(Brush.linearGradient(grad)).animateContentSize()) {
        if (bmp != null) Image(bmp.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        // Skygge øverst og nederst så teksten alltid kan leses (OV i designet).
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = .25f), .35f to Color.Transparent, 1f to Color.Black.copy(alpha = .45f))))
        Column(Modifier.fillMaxSize().padding(top = statusTop + 8.dp, start = 22.dp, end = 22.dp, bottom = if (home) 40.dp else 32.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (home) PSerif("Homelab", 22.sp, Color.White, Modifier.weight(1f))
                else {
                    Box(
                        Modifier.height(34.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClickLabel = "Tilbake") { vm.back() }.padding(start = 10.dp, end = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("‹ ${backLabel(vm)}", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1) }
                    Spacer(Modifier.weight(1f))
                }
                if (home) Box(
                    Modifier.height(34.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClickLabel = "Velg bakgrunn", onClick = toggleMenu).padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("${photoName(vm.photoKind)} ▾", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
                Box(
                    Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFF3EFE6)).clickable(onClickLabel = "Innstillinger") { vm.openPaperPage("set") }
                        .semantics { contentDescription = "Innstillinger" },
                    contentAlignment = Alignment.Center,
                ) { AvatarImage(vm, 38, Color(0xFFF3EFE6), Color(0xFF1B1A17)) }
            }
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    PSerif(kicker, 15.sp, Color.White.copy(alpha = .9f), italic = true, weight = FontWeight.Normal, maxLines = 1)
                    Spacer(Modifier.height(4.dp))
                    PSerif(title, if (home) 40.sp else 36.sp, Color.White, maxLines = 2)
                }
                val w = vm.mobileHome?.weather
                if (home && w?.temp != null) Column(
                    Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = "Åpne Yr") { openLink(ctx, yrLink(w)) }.padding(start = 8.dp),
                    horizontalAlignment = Alignment.End,
                ) {
                    PSerif("${Math.round(w.temp)}°", 60.sp, Color.White, weight = FontWeight.Normal, maxLines = 1)
                    Text("${w.text ?: w.place} · ${LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))} ›", color = Color.White.copy(alpha = .9f), fontSize = 13.sp, maxLines = 1)
                }
            }
            vm.photoCredit?.takeIf { home && bmp != null }?.let { Text(it, color = Color.White.copy(alpha = .55f), fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

private fun photoName(k: String) = when (k) { "cur" -> "Nåværende"; "weather" -> "Vær nå"; "planets" -> "Planeter"; "custom" -> "Eget bilde"; else -> "Oslo" }

private fun photoSub(vm: AppViewModel, k: String): String = when {
    k == "cur" -> "Mørk gradient"
    k in vm.photoFailed -> "Fikk ikke lastet bildet · trykk for å prøve igjen"
    k == "oslo" -> "Bilde av Oslo"
    k == "weather" -> "Følger været nå"
    k == "planets" -> "Ny planet hver dag (NASA)"
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
 * Fanelinja nederst. Hovedlinja: Hjem (bare på Hjem), Finans, Mat, Sporing og Mer. Finans: Oversikt, Liste, Finn og Mer.
 * Domener: Oversikt, Publikum, Ytelse og Infra. Fanene fordeles jevnt (aktiv fane får sin egen bredde),
 * og +-knappen står rett etter med 4 dp mellomrom. Trykk = valgark, hold inne 450 ms = filvelgeren.
 */
@Composable
private fun PaperNav(vm: AppViewModel, bar: String, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit) {
    val p = PaperPal.current
    val cur = paperTabOf(vm)
    val homeShown = vm.screen == Screen.Homelab && vm.paperPage == null
    val tabs: List<Triple<String, String, String>> = when (bar) {
        "fin" -> listOf(Triple("ov", "Oversikt", "◎"), Triple("liste", "Liste", "≡"), Triple("finn", "Finn", "⇄"), Triple("fmer", "Mer", "⋯"))
        "dom" -> listOf(Triple("oversikt", "Oversikt", "◎"), Triple("publikum", "Publikum", "◍"), Triple("ytelse", "Ytelse", "⚡"), Triple("infra", "Infra", "▤"))
        else -> listOfNotNull(
            if (homeShown) Triple("hjem", "Hjem", "⌂") else null,
            Triple("fin", "Finans", "kr"), Triple("mat", "Mat", "◐"), Triple("trk", "Sporing", "▣"), Triple("mer", "Mer", "⋯"),
        )
    }
    val scope = rememberCoroutineScope()
    var pressed by remember { mutableStateOf(false) }
    Row(
        modifier.fillMaxWidth().height(62.dp).shadow(16.dp, CircleShape).clip(CircleShape).background(p.nav).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        tabs.forEach { (k, n, ic) ->
            val on = cur == k
            Row(
                (if (on) Modifier else Modifier.weight(1f)).height(46.dp).clip(CircleShape).background(if (on) p.navAct else Color.Transparent)
                    .clickable(role = Role.Tab, onClickLabel = n) {
                        when (bar) {
                            "fin" -> vm.paperFinTab(k)
                            "dom" -> vm.domainSection(k)
                            else -> vm.paperTab(k)
                        }
                    }.padding(horizontal = if (on) 16.dp else 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            ) {
                if (on) Text(ic, color = p.navActInk, fontFamily = PaperFonts.serif, fontSize = 16.sp)
                Text(n, color = if (on) p.navActInk else p.navInk, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Clip)
            }
        }
        val label = when { bar == "dom" -> "Legg til domene"; bar == "fin" -> "Legg til kvittering"; vm.screen == Screen.Mat -> "Skann oppskrift"; else -> "Skann" }
        Box(
            Modifier.padding(start = 4.dp).size(46.dp).scale(if (pressed) 0.88f else 1f).clip(CircleShape).background(p.lab)
                .semantics { contentDescription = "$label. Trykk for valg, hold inne for å laste opp." }
                .pointerInput(bar) {
                    detectTapGestures(onPress = {
                        pressed = true
                        var long = false
                        val job = scope.launch {
                            delay(450)
                            long = true
                            pressed = false
                            Haptics.tap()
                            if (bar != "dom") {
                                vm.plusHint = "Velg filer å laste opp"
                                onHold()
                                delay(1600)
                                vm.plusHint = null
                            }
                        }
                        val released = tryAwaitRelease()
                        job.cancel()
                        if (!long) { vm.plusHint = null }
                        pressed = false
                        if (released && !long) { Haptics.tap(); onTap() }
                    })
                },
            contentAlignment = Alignment.Center,
        ) { Text("+", color = p.onLab, fontSize = 22.sp) }
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
            PButton("Bilder eller filer (PDF, JPG, HEIC)", Modifier.fillMaxWidth(), kind = "line", height = 54.dp) { vm.scanSheet = false; files() }
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

@Composable
private fun PaperHome(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val h = vm.mobileHome
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { PaperSearch(vm) }
        vm.homeError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(4.dp)) } }
        // Viktigste pakke (klar for henting først).
        val pk = (vm.homePackages ?: emptyList()).sortedByDescending { it.ready }.firstOrNull()
        if (pk != null) item {
            PCard(onClick = { vm.paperTab("trk") }) {
                Row(Modifier.padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)).background(Color(pk.carrierColor)), contentAlignment = Alignment.Center) {
                        Text(pk.carrierIni, color = Color(pk.carrierFg), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    }
                    Column(Modifier.weight(1f)) {
                        PLabel(if (pk.ready) "Hent i dag" else pk.statusText.ifBlank { "På vei" })
                        PSerif(pk.name.ifBlank { pk.shop.ifBlank { pk.trackingNo } }, 20.sp, maxLines = 1)
                        Text(listOf(pk.etaText, pk.carrierName).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    val more = (vm.homePackages?.size ?: 1) - 1
                    Text(if (more > 0) "$more til ›" else "›", color = p.mut, fontSize = 13.sp)
                }
            }
        }
        val lines = h?.ruter ?: emptyList()
        if (lines.isNotEmpty()) item { PaperRuter(lines) { openLink(ctx, ruterLink(lines.firstOrNull()?.from)) } }
        item { PaperMinis(vm) }
        item { PaperNewsCard(vm) }
        if (!h?.shortcuts.isNullOrEmpty() && vm.layout.visible("links")) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
        }
        h?.serverStatus?.takeIf { vm.layout.visible("srv") }?.let { st ->
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PHead("Server", h?.serverName)
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
            Text("⌕", color = p.mut, fontSize = 16.sp)
            BasicTextField(
                q, { q = it; vm.suggest(it) }, singleLine = true,
                textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.lab),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { if (q.isNotBlank()) { openLink(ctx, vm.googleUrl(q)); q = "" } }),
                modifier = Modifier.weight(1f),
                decorationBox = { inner -> Box { if (q.isEmpty()) Text("Søk på Google", color = p.mut, fontSize = 14.5.sp); inner() } },
            )
        }
        if (q.isNotBlank() && vm.suggestions.isNotEmpty()) PCard {
            vm.suggestions.take(5).forEachIndexed { i, sg ->
                PRow(sg, null, "↗", serif = false, top = i > 0) { openLink(ctx, vm.googleUrl(sg)); q = "" }
            }
        }
    }
}

@Composable
private fun PaperRuter(lines: List<RuterLine>, onClick: () -> Unit) {
    val p = PaperPal.current
    val rows = lines.flatMap { l -> l.departures.map { d -> l to d } }.sortedBy { (_, d) -> d.min ?: Int.MAX_VALUE }.take(3)
    val stop = lines.map { it.from }.distinct().joinToString(" · ")
    PCard(onClick = onClick) {
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
                    Modifier.fillMaxWidth().clickable { openLink(ctx, x.url) }.padding(vertical = 6.dp),
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

@Composable
private fun PaperFinance(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    val sm = vm.summary
    val saldo = vm.boot?.accounts?.sumOf { it.balance } ?: 0.0
    val review = vm.boot?.reviewCount ?: sm?.review?.size ?: 0
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            PCard(shadow = true) {
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
        }
        if (review > 0) item {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.lab).clickable { vm.open(Screen.Scan) }.padding(16.dp, 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (review == 1) "1 kvittering til gjennomgang" else "$review kvitteringer til gjennomgang", color = p.onLab, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                Text("Skann ›", color = p.onLab, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
        }
        item { PHead("Siste transaksjoner", "Alle ›") { vm.open(Screen.List) } }
        val recent = sm?.recent ?: emptyList()
        if (recent.isEmpty()) item { Text("Ingen transaksjoner ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp)) }
        items(recent.size) { i ->
            val t = recent[i]
            Column {
                Row(Modifier.fillMaxWidth().clickable { vm.selectedTx = t.id }.padding(2.dp, 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
        val buds = sm?.budgets ?: emptyList()
        if (buds.isNotEmpty()) {
            item { PHead("Budsjett · ${sm?.month?.let { monthLabel(it).lowercase(nbNo) } ?: ""}", "${n0(sm?.budgetUsed ?: 0.0)} av ${n0(sm?.budgetTotal ?: 0.0)}") { vm.go(Screen.Budget) } }
            items(buds.size.coerceAtMost(6)) { i ->
                val b = buds[i]
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
        item { PHead("Alt i Finans") }
        item {
            PCard {
                val pages = listOf(
                    Triple(Screen.List, "Transaksjoner", "Søk, filtrer og rediger"), Triple(Screen.Budget, "Budsjett", "Kategorier og måneden"),
                    Triple(Screen.Search, "✦ AI-søk", "Spør om økonomien din"), Triple(Screen.Scan, "Kvitteringer", "Kø, bekreftelse og bokført"),
                    Triple(Screen.Fast, "Faste utgifter", "Trekk som kommer igjen"), Triple(Screen.Accounts, "Kontoer", "Saldo og sparemål"),
                    Triple(Screen.Reports, "Rapporter", "Måned og år"), Triple(Screen.Import, "Import", "Kontoutskrift, CSV og XLSX"),
                )
                pages.forEachIndexed { i, (sc, n, sub) -> PRow(n, sub, top = i > 0) { if (sc == Screen.Budget || sc == Screen.List || sc == Screen.Search) vm.go(sc) else vm.open(sc) } }
            }
        }
    }
}

/* ---------------- Mer, Innstillinger og Media ---------------- */

@Composable
private fun PaperMore(vm: AppViewModel, navBottom: Dp) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            PCard(shadow = true) {
                // Aksjer, Abonnementer, Boliger og Finn ligger under Finans → Mer (egen fanelinje).
                val rows: List<Triple<String, String, () -> Unit>> = listOf(
                    Triple("Domener", "Trafikk, besøk og oppetid", { vm.domSection = "oversikt"; vm.openFromMer(Screen.Domains) }),
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
                PRow(vm.displayName.ifBlank { "Konto" }, "@${vm.account?.username?.ifBlank { null } ?: "konto"} · ${vm.me?.role ?: vm.account?.role ?: ""}", "Kontoer ›", serif = false) { vm.menuOpen = true }
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
            if (!m.configured && m.error == null) item { Text("Plex eller Jellyfin er ikke satt opp. Legg dem inn i Homelab → Innstillinger → Integrasjoner.", color = p.mut, fontSize = 13.sp) }
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

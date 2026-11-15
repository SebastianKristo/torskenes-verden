package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.Bitmap
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*

/** Hjem på Fold: [cards] er kortlista for valgt fane (bygges i PaperHome med foldKeys41). */
@Composable
internal fun FoldHome41(vm: AppViewModel, mode: FoldMode43, cards: @Composable (Modifier) -> Unit) {
    LaunchedEffect(Unit) { vm.initP41() }
    // 12 dp + statuslinje, pluss de 23 dp innholdsboksen ligger oppe i (underNav34 i Paper.kt), så fanene står på linje med kortet.
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 12.dp + 23.dp
    BoxWithConstraints(Modifier.fillMaxSize()) {
    // Prompt 43: før valgte vi «stående» med maxHeight > maxWidth her. Denne boksen er 112 dp smalere (sidelinja) og 23 dp høyere
    // (underNav34) enn vinduet, så utbrettet Fold (ca. 832 × 750 dp) ble 720 × 773 → stablet og klemt. Nå bestemmer vinduet (Fold43.kt).
    if (mode == FoldMode43.TABLETOP) {
        // Halvbrettet: Glimt-kortet over hengselen (midt i vinduet), fanene og kortene under den.
        val hinge = (maxHeight - 23.dp) / 2 + 23.dp
        Column(Modifier.fillMaxSize().padding(end = 16.dp)) {
            Spacer(Modifier.height(top))
            FoldMain41(vm, Modifier.fillMaxWidth().height((hinge - top - 12.dp).coerceAtLeast(160.dp)), compact = true)
            Spacer(Modifier.height(24.dp))
            Column(Modifier.fillMaxWidth().weight(1f)) { FoldTabs41(vm); Spacer(Modifier.height(10.dp)); cards(Modifier.weight(1f)) }
        }
    } else {
        // 1c: Glimt-kort venstre (fyller høyden, scroller ikke), faner høyre (bare denne kolonnen scroller).
        // Prompt 45 (claude-code-fold-sok-over-tastatur.md): bare venstre Glimt-kort følger tastaturet (WindowInsets.ime, som
        // animeres sammen med IME-en), så søkefeltet ligger rett over tastaturet. Høyre kolonne flytter seg ikke.
        val lift45 = (imeBottom45() - 12.dp).coerceAtLeast(0.dp)
        Row(Modifier.fillMaxSize().padding(top = top, end = 16.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            FoldMain41(vm, Modifier.weight(1f).fillMaxHeight().padding(bottom = lift45))
            Column(Modifier.weight(1f).fillMaxHeight()) { FoldTabs41(vm); Spacer(Modifier.height(10.dp)); cards(Modifier.weight(1f)) }
        }
    }
    }
}

/** Fanene som piller (36 høy, radius 18, Manrope 700 13): valgt = blekk, ellers strek. Sveip venstre/høyre bytter fane. */
@Composable
private fun FoldTabs41(vm: AppViewModel) {
    val p = PaperPal.current
    val cur = vm.p41.foldTab
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FOLD_TABS41.forEach { (k, n) ->
            val on = cur == k
            Box(
                Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) p.ink else Color.Transparent)
                    .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp)).clickable(role = Role.Tab, onClickLabel = n) { vm.setFoldTab41(k) }.padding(horizontal = 15.dp),
                contentAlignment = Alignment.Center,
            ) { Text(n, color = if (on) p.bg else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
        }
    }
}

/** Sveip mellom fanene på kortlista (horisontalt drag > 60 dp). */
internal fun Modifier.foldSwipe41(vm: AppViewModel): Modifier = this.pointerInput(Unit) {
    var dx = 0f
    detectHorizontalDragGestures(onDragStart = { dx = 0f }, onDragEnd = {
        val keys = FOLD_TABS41.map { it.first }
        val i = keys.indexOf(vm.p41.foldTab).coerceAtLeast(0)
        val lim = 60.dp.toPx()
        if (dx < -lim && i < keys.size - 1) vm.setFoldTab41(keys[i + 1]) else if (dx > lim && i > 0) vm.setFoldTab41(keys[i - 1])
    }) { _, d -> dx += d }
}

/** Det store Glimt-kortet (26 dp hjørner, fyller høyden). [compact] = halvbrettet: hilsen til venstre, Brief og søk til høyre. */
@Composable
private fun FoldMain41(vm: AppViewModel, modifier: Modifier, compact: Boolean = false) {
    val bmp: Bitmap? = if (vm.photoKind == "cur" || vm.photoKind == "none") null else vm.photo
    val shape = RoundedCornerShape(26.dp)
    Box(modifier.clip(shape).background(Color(0xFF2A3440))) {
        BgLayer(vm, bmp)
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = .15f), .3f to Color.Transparent, .72f to Color(0xE0101C2C))))
        if (compact) Row(Modifier.fillMaxSize().padding(18.dp, 18.dp, 18.dp, 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.weight(1f).fillMaxHeight().clipToBounds(), verticalArrangement = Arrangement.spacedBy(10.dp)) { FoldGreeting43(vm, 30.sp) }
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.Bottom)) { FoldBriefSearch43(vm) }
        }
        else Column(Modifier.fillMaxSize().padding(18.dp, 18.dp, 18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Prompt 43: toppen får plassen som er igjen (klippes heller enn å klemme Brief-kortet ved stor skrift);
            // Brief-kortet og søkefeltet har alltid sin egen høyde nederst.
            // Prompt 45: mens man skriver tones hilsen og temperatur ut, og Brief-kortet glir bort, så svaret får plass over feltet.
            val typing45 = imeBottom45() > 80.dp
            val greetA by androidx.compose.animation.core.animateFloatAsState(if (typing45) 0f else 1f, androidx.compose.animation.core.tween(200), label = "greet45")
            Column(Modifier.fillMaxWidth().weight(1f).clipToBounds().graphicsLayer { alpha = greetA }, verticalArrangement = Arrangement.spacedBy(12.dp)) { FoldGreeting43(vm, 38.sp) }
            FoldBriefSearch43(vm, typing45)
        }
    }
}

/** Homelab + profilbilde, dato, hilsen og temperatur. */
@Composable
private fun ColumnScope.FoldGreeting43(vm: AppViewModel, greet: androidx.compose.ui.unit.TextUnit) {
    val first = vm.displayName.split(' ').firstOrNull().orEmpty().ifBlank { "du" }
    val w = vm.mobileHome?.weather
    Row(verticalAlignment = Alignment.CenterVertically) {
        PSerif(vm.appName, 22.sp, Color.White, Modifier.weight(1f), maxLines = 1)
        GlimtAvatar46(vm) { vm.openPaperPage("set") } // prompt 46: Glimt-ring, ingen firkantet flate rundt bildet på Fold
    }
    PSerif(longDate(LocalDate.now()), 16.sp, Color.White.copy(alpha = .92f), italic = true, weight = FontWeight.Normal, maxLines = 1)
    AutoSerif("${greetingFor()},\n$first", greet, Color.White, min = 22.sp)
    if (w?.temp != null) Row(
        Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = "Åpne Vær") { Haptics.tap(); vm.openWeather() },
        verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PSerif("${Math.round(w.temp)}°", 64.sp, Color.White, weight = FontWeight.Light, maxLines = 1)
        Text("${w.text ?: w.place} ›", color = Color.White.copy(alpha = .92f), fontSize = 13.5.sp, maxLines = 1, modifier = Modifier.padding(bottom = 12.dp))
    }
}

/** Brief-kortet (egen høyde, min. 148 dp, ikke klippet utenfra så Glimt-figuren vises hel) og søkefeltet med ✦ AI under. */
@Composable
private fun FoldBriefSearch43(vm: AppViewModel, typing: Boolean = false) {
    androidx.compose.animation.AnimatedVisibility(
        visible = !typing,
        enter = androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(220)) + androidx.compose.animation.expandVertically(androidx.compose.animation.core.tween(220)),
        exit = androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(180)) + androidx.compose.animation.shrinkVertically(androidx.compose.animation.core.tween(220)),
    ) { HomeBrief34(vm, Modifier.heightIn(min = 148.dp)) }
    // Prompt 45: svar og forslag over feltet (claude-code-fold-skannikon-og-sokefelt.md).
    PaperSearch29(vm, above45 = true)
}

/*
 * Prompt 43 (claude-code-fold-delt-hjem-fiks.md): hvilket oppsett Hjem (og de andre sidene) skal ha på store skjermer.
 *
 * Den egentlige feilen: Fold41 valgte «stående» ut fra boksen innholdet ligger i, ikke ut fra vinduet. Den boksen er
 * 112 dp smalere enn vinduet (plass til sidelinja) og 23 dp høyere (underNav34 legger innholdet opp under kanten).
 * På Galaxy Z Fold utbrettet (ca. 832 × 750 dp) ble boksen ca. 720 × 773 dp, altså «høyere enn bred», så Hjem ble
 * stablet: Glimt-kortet fikk 46 % av høyden, Brief-kortet ble klemt til en stripe og søkefeltet falt utenfor.
 *
 * Nå velges oppsettet av vinduet (LocalConfiguration, oppdateres med en gang ved bretting fordi aktiviteten håndterer
 * screenSize/screenLayout selv):
 *  - SPLIT: bredde ≥ 600 dp og bredde ≥ 0,9 × høyde (utbrettet, iPad/nettbrett liggende og stående nesten kvadratisk).
 *  - TABLETOP: halvbrettet (hengselvinkel 30–160°) med hengselen vannrett (vinduet høyere enn bredt) → øvre/nedre halvdel.
 *  - STACK: alt annet (sammenbrettet, dekselskjerm, smal portrett, Split View under 600) → vanlig mobiloppsett.
 * Hengselen leses fra plattformsensoren TYPE_HINGE_ANGLE (API 30+), uten nye avhengigheter (ikke androidx.window).
 */
internal enum class FoldMode43 { SPLIT, TABLETOP, STACK }

/** Oppsettet for vinduet nå. [wide] er WindowWidthSizeClass ≠ Compact (≥ 600 dp) fra MainActivity. */
@Composable
internal fun foldMode43(wide: Boolean): FoldMode43 {
    val cfg = LocalConfiguration.current
    val w = cfg.screenWidthDp
    val h = cfg.screenHeightDp
    val half = hingeHalfOpen43()
    return foldModeFor43(wide, w, h, half)
}

/** Ren regel (testbar): se kommentaren øverst. */
internal fun foldModeFor43(wide: Boolean, widthDp: Int, heightDp: Int, halfOpen: Boolean): FoldMode43 = when {
    !wide -> FoldMode43.STACK
    halfOpen && heightDp > widthDp -> FoldMode43.TABLETOP
    widthDp >= 600 && widthDp >= heightDp * 0.9f -> FoldMode43.SPLIT
    else -> FoldMode43.STACK
}

/** true når telefonen står halvbrettet (hengselvinkel mellom 30° og 160°). Uten hengselsensor: alltid false. */
@Composable
internal fun hingeHalfOpen43(): Boolean {
    val ctx = LocalContext.current
    var half by remember { mutableStateOf(false) }
    DisposableEffect(ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@DisposableEffect onDispose { }
        val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val sensor = sm?.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE)
        if (sm == null || sensor == null) return@DisposableEffect onDispose { }
        val l = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                val a = e.values.firstOrNull() ?: return
                half = a in 30f..160f
            }
            override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
        }
        sm.registerListener(l, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        onDispose { sm.unregisterListener(l) }
    }
    return half
}

/** Felles LayoutMode (Fold utbrettet, nettbrett): true når vinduet er bredt nok til brettoppsett. */
internal val LocalWide45 = compositionLocalOf { false }

/** Regelen (felles for alle plattformer): ≥ 700 dp tilgjengelig bredde (og ikke Compact-klassen). */
internal fun layoutWide45(sizeClassWide: Boolean, widthDp: Int): Boolean = sizeClassWide && widthDp >= 700

/** Tastaturets høyde nå (0 når det er lukket). Følger IME-animasjonen bilde for bilde. */
@Composable
internal fun imeBottom45(): Dp {
    val d = LocalDensity.current
    return with(d) { WindowInsets.ime.getBottom(d).toDp() }
}

/** «Fjern animasjoner» i systemet (animasjonsskala 0) → bare uttoning. */
@Composable
internal fun reduceMotion45(): Boolean {
    val ctx = LocalContext.current
    return remember(ctx) { runCatching { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false) }
}

/** Skann-ikonet: fire hjørner og strek i midten (samme som den flytende skanneknappen på telefon). */
internal const val SCAN45 = "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16"

private const val RESET45 = "M3 12a9 9 0 1 0 3-6.7M3 4v5h5"

private const val CHECK45 = "M5 12.5l4.5 4.5L19 7.5"

private const val PLUS45 = "M12 5v14M5 12h14"

private const val HOUSE45 = "M4 11l8-7 8 7M6 10v10h12V10"

private val EASE_OUT45 = CubicBezierEasing(.4f, 0f, .2f, 1f)

private val SPRING45 = CubicBezierEasing(.2f, .9f, .25f, 1.15f)

/** Sider uten skann-knapp i sidelinja (i tillegg til noScanHere): Kart (Familie), Bibelvers, Nordlys, Innstillinger, Mer. */
internal fun noRailScan45(vm: AppViewModel): Boolean = noScanHere(vm) || vm.familyOpen || vm.p31.nordOpen || vm.p37.biblePage ||
    vm.paperPage == "set" || vm.screen == Screen.Settings || vm.paperPage == "fmer"

/**
 * Sidelinja på Fold/brett (84 bred). [onLeave] ≠ null: tegnet i en fullskjermsflate (Gjøremål, Familie); ingen fane er markert,
 * og flaten lukkes før man navigerer.
 */
@Composable
internal fun PaperRail45(vm: AppViewModel, bar: String, float: Boolean, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit, onLeave: (() -> Unit)? = null) {
    val p = PaperPal.current
    val s = vm.p45
    val tabs = navTabs(vm, bar, float)
    val cur = if (onLeave != null) "" else navCurrent(vm, bar)
    val home = onLeave == null && vm.screen == Screen.Homelab && vm.paperPage == null
    LaunchedEffect(home) { if (home) s.homeLeaving = false }
    val style = NavStyle25.v
    val shape = RoundedCornerShape(28.dp)
    val edit = railEdit45(vm)
    Column(
        modifier.width(84.dp).fillMaxHeight()
            .shadow(16.dp, shape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
            .clip(shape).background(p.nav)
            .longPressEdit26(onLeave == null && edit == null && (bar == "main" || bar == "fin"), bar) { Haptics.tap(); if (bar == "fin") vm.b26.finEdit = true else vm.tabEdit = true }
            .padding(horizontal = 6.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        RailHome45(vm, !home && !s.homeLeaving, onLeave)
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            tabs.forEach { t ->
                RailTab25(t.label, t.icon, cur == t.key, style) {
                    onLeave?.invoke()
                    if (cur == t.key) vm.tabReselect26(bar, t) else t.go()
                    Haptics.select()
                }
            }
        }
        RailEdit45(vm, edit)
        // Prompt 45 (claude-code-fold-skann-i-navbar.md): skann-knappen ligger alltid i sidelinja på brett (ingen flytende knapp),
        // skjult mens man redigerer (ingen to ＋-knapper) og på sider der den ikke hører hjemme.
        if (edit == null && !noRailScan45(vm)) Box(Modifier.padding(top = 8.dp)) {
            ScanPress(vm, bar, Modifier.shadow(10.dp, CircleShape), 46.dp, CircleShape, onTap, onHold) {
                if (bar == "dom") Text("✦", color = p.onLab, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                else if (vm.screen == Screen.Tracking && bar == "main") WxIcon(PLUS45, p.onLab, 22.dp, stroke = 2.6f)
                else WxIcon(SCAN45, p.onLab, 22.dp, stroke = 2.2f)
            }
        }
    }
}

/**
 * Den røde Hjem-knappen (samme form som aktiv fane). Ut: skala → 0,55 og uttoning på 200 ms mens høyden kollapser, så fanene
 * glir opp; sidebyttet starter etter 190 ms så tegningen av Hjem ikke hakker animasjonen. Inn: vokser fra 0,6 med lett fjæring
 * (320 ms). Doble trykk ignoreres mens animasjonen pågår. «Fjern animasjoner»: bare uttoning.
 */
@Composable
internal fun RailHome45(vm: AppViewModel, visible: Boolean, onLeave: (() -> Unit)?) {
    val p = PaperPal.current
    val s = vm.p45
    val scope = rememberCoroutineScope()
    val reduce = reduceMotion45()
    val enter = if (reduce) fadeIn(tween(200)) else
        scaleIn(tween(320, easing = SPRING45), initialScale = .6f) + fadeIn(tween(240)) + expandVertically(tween(320, easing = EASE30), expandFrom = Alignment.Top)
    val exit = if (reduce) fadeOut(tween(200)) else
        scaleOut(tween(200, easing = EASE_OUT45), targetScale = .55f) + fadeOut(tween(200, easing = EASE_OUT45)) + shrinkVertically(tween(200, easing = EASE_OUT45), shrinkTowards = Alignment.Top)
    AnimatedVisibility(visible = visible, enter = enter, exit = exit) {
        val src = remember { MutableInteractionSource() }
        val pressed by src.collectIsPressedAsState()
        val sc by animateFloatAsState(if (pressed) .96f else 1f, tween(120), label = "home45")
        val shape = RoundedCornerShape(18.dp)
        Box(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
            Column(
                Modifier.fillMaxWidth().height(58.dp).graphicsLayer { scaleX = sc; scaleY = sc }
                    .shadow(12.dp, shape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
                    .clip(shape).background(p.lab)
                    .clickable(interactionSource = src, indication = null, role = Role.Button, onClickLabel = "Til Hjem") {
                        if (s.homeBusy) return@clickable
                        s.homeBusy = true
                        Haptics.tap()
                        s.homeLeaving = true
                        vm.p46.homeFromRail = true // prompt 46: Hjem tones inn med fjær etter at modulen har skalert ut (ui/Ui46.kt)
                        scope.launch {
                            delay(if (reduce) 0L else 190L)
                            onLeave?.invoke()
                            vm.settingsPage = null
                            vm.paperTab("hjem")
                            delay(140)
                            s.homeBusy = false
                        }
                    }
                    .semantics(mergeDescendants = true) { contentDescription = "Til Hjem" }
                    .padding(horizontal = 2.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
            ) {
                WxIcon(HOUSE45, p.onLab, 20.dp, stroke = 2.2f)
                Text("Hjem", color = p.onLab, style = TAB_TEXT24.copy(fontSize = 11.5.sp, lineHeight = 13.sp), maxLines = 1)
            }
        }
    }
}

/* ======================= Wiggle-knappene i sidelinja ======================= */

/** Hva som redigeres nå: "page:<side>" (Hjem, Finans, Mat, Sporing), "mer" eller "fmer" (Finans → Mer). null = ingen redigering. */
internal fun railEdit45(vm: AppViewModel): String? {
    vm.editPage?.let { page ->
        val base = vm.paperPage == null && vm.original == null && vm.editing == null && vm.detail == null && vm.selectedTx == null
        val here = base && when (page) {
            "hjem" -> vm.screen == Screen.Homelab
            "finans" -> vm.screen == Screen.Home
            "mat" -> vm.screen == Screen.Mat
            "sporing" -> vm.screen == Screen.Tracking
            else -> false
        }
        if (here) return "page:$page"
    }
    if (vm.paperPage == "mer" && vm.b28.merEdit) return "mer"
    if (vm.paperPage == "fmer" && vm.p32b.fmEdit) return "fmer"
    return null
}

/** ＋ (med antall skjulte), ↺ (bare når oppsettet er endret) og ✓, stablet nederst i sidelinja. Spretter inn på 320 ms. */
@Composable
private fun RailEdit45(vm: AppViewModel, edit: String?) {
    val p = PaperPal.current
    val reduce = reduceMotion45()
    AnimatedVisibility(
        visible = edit != null,
        enter = if (reduce) fadeIn(tween(200)) else scaleIn(tween(320, easing = SPRING45), initialScale = .6f) + fadeIn(tween(240)),
        exit = fadeOut(tween(160)) + scaleOut(tween(160), targetScale = .8f),
    ) {
        val e = edit ?: vm.p45.lastEdit
        SideEffect { if (edit != null) vm.p45.lastEdit = edit }
        val (hidden, changed) = railEditInfo45(vm, e)
        Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (e != "page:sporing") RailRound45("Legg til widget", Color.White.copy(alpha = .14f), badge = hidden.takeIf { it > 0 }, onClick = { railAdd45(vm, e) }) {
                WxIcon(PLUS45, Color.White, 20.dp, stroke = 2.6f)
            }
            if (changed) RailRound45("Tilbakestill", Color.White.copy(alpha = .14f), onClick = { railReset45(vm, e) }) { WxIcon(RESET45, Color.White, 19.dp, stroke = 2.4f) }
            RailRound45("Ferdig", p.lab, onClick = { railDone45(vm, e) }) { WxIcon(CHECK45, p.onLab, 20.dp, stroke = 2.8f) }
        }
    }
}

@Composable
private fun RailRound45(label: String, bg: Color, badge: Int? = null, onClick: () -> Unit, icon: @Composable () -> Unit) {
    val p = PaperPal.current
    Box {
        Box(
            Modifier.size(46.dp).clip(CircleShape).background(bg)
                .clickable(role = Role.Button, onClickLabel = label) { onClick() }.semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) { icon() }
        if (badge != null) Box(
            Modifier.align(Alignment.TopEnd).offset(4.dp, (-4).dp).sizeIn(minWidth = 18.dp, minHeight = 18.dp).clip(CircleShape).background(p.lab).padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center,
        ) { Text("$badge", color = p.onLab, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Clip) }
    }
}

/** (antall skjulte, oppsettet er endret fra standard). */
private fun railEditInfo45(vm: AppViewModel, e: String?): Pair<Int, Boolean> = when {
    e == null -> 0 to false
    e.startsWith("page:") -> {
        val page = e.removePrefix("page:")
        val secs = vm.b28.pageSecs[page] ?: emptyList()
        val hid = vm.pageHidden(page).count { h -> secs.any { it.first == h } }
        val lay = vm.pageLayouts[page]
        hid to (lay != null && (lay.order.isNotEmpty() || lay.hidden.isNotEmpty()))
    }
    e == "mer" -> vm.b28.mer.h.count { it != "innst" } to (vm.b28.mer.o.isNotEmpty() || vm.b28.mer.h.isNotEmpty())
    else -> vm.p30.finHidden.size to (vm.fmOrder != FM_DEFAULT_ORDER || vm.p30.finHidden.isNotEmpty())
}

private fun railAdd45(vm: AppViewModel, e: String?) {
    Haptics.select()
    when {
        e == null -> {}
        e.startsWith("page:") -> vm.b28.addWidgetFor = e.removePrefix("page:")
        e == "mer" -> vm.p30.merAdd = !vm.p30.merAdd
        else -> vm.p30.fmAdd = !vm.p30.fmAdd
    }
}

private fun railReset45(vm: AppViewModel, e: String?) {
    Haptics.select()
    when {
        e == null -> {}
        e.startsWith("page:") -> vm.resetPage(e.removePrefix("page:"))
        e == "mer" -> vm.saveMer28(MerPref28())
        else -> { vm.resetFmOrder(); vm.setFinHidden30(emptyList()) }
    }
}

private fun railDone45(vm: AppViewModel, e: String?) {
    Haptics.success()
    when {
        e == null -> {}
        e.startsWith("page:") -> vm.editPage = null
        e == "mer" -> { vm.b28.merEdit = false; vm.p30.merAdd = false }
        // Finans → Mer har redigeringen lokalt i rutenettet: det lytter på fmDoneSeq og lagrer rekkefølgen.
        else -> { vm.p45.fmDoneSeq++; vm.p30.fmAdd = false }
    }
}

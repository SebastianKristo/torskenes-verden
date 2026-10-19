package no.kristo.kalender.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import no.kristo.kalender.KDark
import no.kristo.kalender.KLight
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.MN
import no.kristo.kalender.MS
import no.kristo.kalender.Red
import no.kristo.kalender.WD
import no.kristo.kalender.dl
import no.kristo.kalender.hm
import no.kristo.kalender.isoW
import no.kristo.kalender.jsDay
import no.kristo.kalender.mon
import no.kristo.kalender.reduceMotion
import no.kristo.kalender.remL
import no.kristo.kalender.today
import java.time.LocalDate

/*
 * Prompt 33 (KAL-ANDROID): skjermen i Kalender-appen (fasit: Kalender App.dc.html, platform="android").
 * Ingen navbar: toppfelt (☰, rød linje + stor tittel, ‹ › I dag, søk), visningsvelger, visningen, og nederst Glimt-feltet med rød +
 * (squircle 16). Sidemeny, ark og bakteppe dekker hele skjermen, også statuslinjen (edge-to-edge).
 */

val EASE = CubicBezierEasing(.2f, .8f, .2f, 1f)

@Composable
fun KalRoot(vm: KalVm, onBackToHomelab: () -> Unit) {
    val dark = when (vm.th) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    val k = if (dark) KDark else KLight
    val view = LocalView.current
    SideEffect {
        (view.context as? Activity)?.window?.let { w ->
            WindowCompat.getInsetsController(w, view).apply { isAppearanceLightStatusBars = !dark; isAppearanceLightNavigationBars = !dark }
        }
    }
    CompositionLocalProvider(LocalK provides k) {
        Box(Modifier.fillMaxSize().background(k.bg)) {
            if (vm.session == null) LoginScreen(vm) else KalApp(vm, onBackToHomelab)
        }
    }
}

@Composable
private fun KalApp(vm: KalVm, onBackToHomelab: () -> Unit) {
    val k = LocalK.current
    val reduce = reduceMotion()
    val focus = LocalFocusManager.current
    LaunchedEffect(vm.data) { vm.resolvePending() }
    // Tilbake lukker det øverste: ark → sidemeny → søk.
    BackHandler(vm.glOpen || vm.det != null || vm.nf != null || vm.cs || vm.so || vm.newCal || vm.setOn) {
        when {
            vm.newCal -> vm.newCal = false
            vm.setOn -> vm.closeSettings()
            vm.cs && vm.ac != null -> vm.ac = null
            vm.nf != null -> vm.closeNew()
            vm.det != null -> vm.closeDet()
            vm.glOpen -> vm.closeGlimt()
            vm.cs -> vm.cs = false
            vm.so -> vm.closeSearch()
        }
    }
    var composerH by remember { mutableIntStateOf(0) }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
            TopBar(vm, onBackToHomelab)
            // Visningen: sveip venstre/høyre bytter periode, sveip inn fra venstre kant (28 dp) åpner Kalendere.
            // Prompt 35: zoom-animasjonen og pinch ligger rundt visningen (ZoomBox35); berøring lukker tastaturet.
            ZoomBox35(vm, reduce, onTouch = { focus.clearFocus() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
            Box(
                Modifier.fillMaxSize().pointerInput(vm.v) {
                    var x0 = 0f
                    var acc = 0f
                    detectHorizontalDragGestures(
                        onDragStart = { x0 = it.x; acc = 0f },
                        onDragEnd = {
                            val edge = x0 < 28.dp.toPx()
                            if (edge && acc > 50.dp.toPx()) { no.kristo.kalender.Hap.tick(); vm.cs = true }
                            else if (vm.v != "liste" && kotlin.math.abs(acc) > 60.dp.toPx()) vm.step(if (acc < 0) 1 else -1)
                        },
                        onHorizontalDrag = { ch, amt -> acc += amt; ch.consume() },
                    )
                },
            ) {
                when (vm.v) {
                    "mnd" -> MonthView(vm)
                    "uke", "3d", "dag" -> GridView(vm)
                    "ar" -> YearView(vm)
                    else -> ListView(vm)
                }
                // Systemets tilbakegest tar ikke venstre kant midt på skjermen (Android tillater 200 dp).
                Box(Modifier.align(Alignment.CenterStart).width(28.dp).height(200.dp).systemGestureExclusion())
            }
            }
            Composer(vm, Modifier.onGloballyPositioned { composerH = it.size.height })
        }

        // Toast med Angre, rett over skrivefeltet.
        val density = LocalDensity.current
        AnimatedVisibility(vm.toast != null, Modifier.align(Alignment.BottomCenter).padding(bottom = with(density) { composerH.toDp() } + 10.dp, start = 14.dp, end = 14.dp),
            enter = fadeIn(tween(180)) + (if (reduce) fadeIn() else slideInVertically(tween(260, easing = EASE)) { it / 2 }), exit = fadeOut(tween(160))) {
            val t = vm.toast
            Row(
                Modifier.shadow(12.dp, RoundedCornerShape(50)).clip(RoundedCornerShape(50)).background(k.ink).padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Tx(t?.t ?: "", man(13.sp, FontWeight.SemiBold, k.bg), Modifier.weight(1f, fill = false))
                if (t?.undo != null) Box(Modifier.height(28.dp).clip(RoundedCornerShape(14.dp)).background(k.bg).tap("Angre") { vm.undoToast() }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Tx("Angre", man(12.sp, FontWeight.Bold, k.ink))
                }
            }
        }

        // Søk: fullskjerm.
        AnimatedVisibility(vm.so, enter = fadeIn(tween(160)), exit = fadeOut(tween(140))) { SearchView(vm) }

        // Ark og sidemeny med bakteppe over hele skjermen (også statuslinjen).
        Scrim(vm.glOpen || vm.det != null || vm.nf != null || vm.cs || vm.newCal) {
            focus.clearFocus()
            when {
                vm.newCal -> vm.newCal = false
                vm.nf != null -> vm.closeNew()
                vm.det != null -> vm.closeDet()
                vm.glOpen -> vm.closeGlimt()
                else -> { no.kristo.kalender.Hap.dismiss(); vm.cs = false }
            }
        }
        Sheet(vm.glOpen && vm.det == null && vm.nf == null, reduce) { GlimtPanel(vm) }
        Sheet(vm.det != null && vm.nf == null, reduce) { DetailSheet(vm) }
        Sheet(vm.nf != null, reduce) { NewSheet(vm) }
        AnimatedVisibility(vm.cs, enter = if (reduce) fadeIn() else slideInHorizontally(tween(300, easing = EASE)) { -it }, exit = if (reduce) fadeOut() else slideOutHorizontally(tween(300, easing = EASE)) { -it }) {
            Drawer(vm)
        }
        // Prompt 35: Innstillinger (fra bunnen av sidemenyen) glir inn fra høyre over alt.
        AnimatedVisibility(vm.setOn, enter = if (reduce) fadeIn() else slideInHorizontally(tween(280, easing = EASE)) { it }, exit = if (reduce) fadeOut() else slideOutHorizontally(tween(240, easing = EASE)) { it }) {
            SettingsPage35(vm)
        }
        if (vm.newCal) NewCalendarDialog(vm)
    }
}

/** Bakteppet (--dim) tones inn på 0,28 s. */
@Composable
private fun BoxScope.Scrim(on: Boolean, onTap: () -> Unit) {
    val k = LocalK.current
    val a by animateFloatAsState(if (on) 1f else 0f, tween(280), label = "dim")
    if (a > 0.01f) Box(Modifier.matchParentSize().background(k.dim.copy(alpha = k.dim.alpha * a)).tap("Lukk", onClick = onTap))
}

/** Ark nederfra (radius 28 28 0 0) som glir opp på 0,34 s. */
@Composable
private fun BoxScope.Sheet(on: Boolean, reduce: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(on, Modifier.align(Alignment.BottomCenter),
        enter = if (reduce) fadeIn() else slideInVertically(tween(340, easing = EASE)) { it },
        exit = if (reduce) fadeOut() else slideOutVertically(tween(260, easing = EASE)) { it }) { content() }
}

/* ---------------- Toppfeltet ---------------- */

/** Fasitens hd: liten rød linje (år / uke / ukedag), stor tittel og om vi ser i dag. */
private class Hd(val k: String, val t: String, val inT: Boolean)

private fun rng(d0: LocalDate, d1: LocalDate): String = if (d0.monthValue == d1.monthValue) "${d0.dayOfMonth}.–${d1.dayOfMonth}. ${MS[d1.monthValue - 1]}"
    else "${d0.dayOfMonth}. ${MS[d0.monthValue - 1]}–${d1.dayOfMonth}. ${MS[d1.monthValue - 1]}"

private fun header(v: String, A: LocalDate, sun: Boolean = false): Hd {
    val T = today()
    // Prompt 35: «Uken starter» gjelder også tittelens ukenummer og ukas datoer.
    val wk = no.kristo.kalender.wkNo35(no.kristo.kalender.wkStart35(A, sun), sun)
    return when (v) {
        "mnd" -> Hd(A.year.toString(), no.kristo.kalender.cap(MN[A.monthValue - 1]), A.monthValue == T.monthValue && A.year == T.year)
        "uke" -> { val m0 = no.kristo.kalender.wkStart35(A, sun); Hd("UKE $wk · ${m0.year}", rng(m0, m0.plusDays(6)), no.kristo.kalender.wkStart35(T, sun) == m0) }
        "3d" -> Hd("UKE $wk", rng(A, A.plusDays(2)), !T.isBefore(A) && !T.isAfter(A.plusDays(2)))
        "dag" -> Hd(WD[A.jsDay].uppercase() + " · UKE " + wk, "${A.dayOfMonth}. ${MN[A.monthValue - 1]}", A == T)
        "ar" -> Hd("ÅR", A.year.toString(), A.year == T.year)
        else -> Hd("NESTE 6 UKER", "Agenda", true)
    }
}

@Composable
private fun TopBar(vm: KalVm, onBackToHomelab: () -> Unit) {
    val k = LocalK.current
    val hd = header(vm.v, vm.a, vm.sun)
    Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 2.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Android: «◀ Homelab» når appen ble åpnet fra Homelab (iOS viser systemets tilbake-til-app selv).
        if (vm.back) Row(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).tap("Tilbake til Homelab", onClick = onBackToHomelab).padding(end = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Svg("M15 5l-7 7 7 7", 14.dp, Color(0xFF2B5D8A), 2.6f)
            Tx("Homelab", man(13.sp, FontWeight.SemiBold, Color(0xFF2B5D8A)))
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.align(Alignment.CenterVertically).padding(end = 0.dp)) { RoundBtn("Kalendere", no.kristo.kalender.ui.Ic.MENU, { no.kristo.kalender.Hap.tick(); vm.cs = true }, bg = Color.Transparent, icon = 20.dp, stroke = 2.2f) }
            Column(Modifier.weight(1f).tap("Zoom ut") { vm.titleTap() }.padding(horizontal = 2.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Tx(hd.k, mono(10.5.sp, k.acc, .12f))
                Tx(hd.t, news(32.sp, k.ink, 33.sp))
            }
            // Prompt 35 (FEIL: «I dag» viste «…»): knappegruppen krymper aldri (måles før tittelen, som får resten og ellipsis).
            // Rekkefølge: I dag · ‹ · › · søk. «I dag» er en pille (høyde 34, padding 0 13, radius 17) uten fast bredde.
            Row(Modifier.padding(bottom = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!hd.inT) Box(Modifier.height(44.dp).padding(end = 4.dp).tap("I dag") { vm.goToday() }, contentAlignment = Alignment.Center) {
                    Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(k.ink).padding(horizontal = 13.dp), contentAlignment = Alignment.Center) {
                        Text("I dag", style = man(12.5.sp, FontWeight.Bold, k.bg), maxLines = 1, softWrap = false)
                    }
                }
                if (vm.v != "liste") {
                    RoundBtn("Forrige", no.kristo.kalender.ui.Ic.PREV, { vm.step(-1) })
                    RoundBtn("Neste", no.kristo.kalender.ui.Ic.NEXT, { vm.step(1) })
                }
                RoundBtn("Søk", no.kristo.kalender.ui.Ic.SEARCH, { vm.openSearch() }, icon = 16.dp, stroke = 2.3f)
            }
        }
        // Visningsvelgeren (pille): År · Mnd · Uke · 3 d · Dag · Liste.
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(k.chip).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            KalVm.VIEWS.forEach { (key, n) ->
                val on = vm.v == key
                Box(
                    Modifier.weight(1f).height(36.dp).then(if (on) Modifier.shadow(1.5.dp, RoundedCornerShape(50)) else Modifier).clip(RoundedCornerShape(50))
                        .background(if (on) k.card else Color.Transparent).tap(n, androidx.compose.ui.semantics.Role.Tab) { vm.setView(key) },
                    contentAlignment = Alignment.Center,
                ) { Tx(n, man(12.5.sp, FontWeight.Bold, if (on) k.ink else k.mut)) }
            }
        }
    }
}

/* ---------------- Glimt-feltet nederst ---------------- */

@Composable
private fun Composer(vm: KalVm, modifier: Modifier) {
    val k = LocalK.current
    val fr = remember { FocusRequester() }
    val kb = LocalSoftwareKeyboardController.current
    val focus = LocalFocusManager.current
    LaunchedEffect(vm.focusComposer) { if (vm.focusComposer > 0) runCatching { fr.requestFocus(); kb?.show() } }
    val pv = vm.preview
    val isQ = vm.isQuestion
    val send = { vm.composerSend(); focus.clearFocus(); kb?.hide() }
    Column(
        modifier.fillMaxWidth().background(k.bg).border(width = 0.dp, color = Color.Transparent).imePadding().windowInsetsPadding(WindowInsets.navigationBars),
    ) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(k.line2))
        Column(Modifier.padding(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (isQ) Row(
                Modifier.fillMaxWidth().shadow(10.dp, RoundedCornerShape(20.dp), ambientColor = Color(0x1A1B1A17), spotColor = Color(0x1A1B1A17)).clip(RoundedCornerShape(20.dp))
                    .background(k.card).border(1.dp, k.line, RoundedCornerShape(20.dp)).tap("Spør Glimt") { send() }.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Spark(22.dp, true)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Tx("SPØR GLIMT", mono(10.sp, k.acc, .14f))
                    Tx(vm.ct.trim(), man(14.sp, FontWeight.Bold, k.ink))
                }
                Tx("Enter ›", man(11.5.sp, FontWeight.Medium, k.mut2))
            }
            if (vm.cf && vm.ct.isBlank()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                no.kristo.kalender.KalAsk.SUG.take(4).forEach { s -> Chip(s, false, { vm.ct = ""; focus.clearFocus(); vm.glSend(s) }, h = 32.dp, bgOff = k.card) }
            }
            if (pv != null) {
                val c = vm.cal(pv.cal)
                Column(
                    Modifier.fillMaxWidth().shadow(10.dp, RoundedCornerShape(20.dp), ambientColor = Color(0x1A1B1A17), spotColor = Color(0x1A1B1A17)).clip(RoundedCornerShape(20.dp))
                        .background(k.card).border(1.dp, k.line, RoundedCornerShape(20.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Tx("GLIMT FORSTÅR", mono(10.sp, k.acc, .14f), Modifier.weight(1f))
                        Box(Modifier.size(8.dp).clip(CircleShape).background(c.col))
                        Spacer(Modifier.width(5.dp))
                        Tx(c.n, man(12.sp, FontWeight.Bold, c.fg(k)))
                    }
                    Tx(pv.t, news(22.sp, k.ink, 25.sp))
                    Tx(dl(pv.d) + if (pv.all) " · hele dagen" else " · " + hm(pv.s ?: 0) + "–" + hm(pv.e ?: 0), man(13.5.sp, FontWeight.SemiBold, k.ink))
                    Tx((if (pv.all) "Heldags" else "Varsel " + remL(pv.rem)) + " · " + c.n, man(12.5.sp, FontWeight.Medium, k.mut))
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Tx("Enter for å legge til", man(11.5.sp, FontWeight.Medium, k.mut2), Modifier.weight(1f))
                        InkPill("Legg til", { send() }, h = 34.dp, padH = 16.dp, fs = 13.sp)
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    Modifier.weight(1f).height(50.dp).clip(RoundedCornerShape(28.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(28.dp)).padding(start = 14.dp, end = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(Modifier.tap("Åpne Glimt") { vm.openGlimt() }) { Spark(20.dp, vm.thinking || pv != null || isQ) }
                    Box(Modifier.weight(1f)) {
                        if (vm.ct.isEmpty()) Tx("Spør Glimt eller skriv en hendelse …", man(16.sp, FontWeight.Medium, k.mut2))
                        BasicTextField(
                            vm.ct, { vm.ct = it }, Modifier.fillMaxWidth().focusRequester(fr).onFocusChanged { vm.cf = it.isFocused }.semantics { contentDescription = "Spør Glimt eller skriv en hendelse" },
                            textStyle = man(16.sp, FontWeight.Medium, k.ink), singleLine = true, cursorBrush = SolidColor(Red),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { send() }),
                        )
                    }
                    if (pv != null || isQ) Box(Modifier.size(38.dp).clip(RoundedCornerShape(14.dp)).background(k.ink).tap("Send") { send() }, contentAlignment = Alignment.Center) {
                        Svg(no.kristo.kalender.ui.Ic.UP, 16.dp, k.bg, 2.6f)
                    }
                }
                // Rød + (squircle 16 på Android) med rød skygge.
                Box(
                    Modifier.size(50.dp).shadow(4.dp, RoundedCornerShape(16.dp), ambientColor = Red.copy(alpha = .35f), spotColor = Red.copy(alpha = .5f)).clip(RoundedCornerShape(16.dp))
                        .background(Red).tap("Ny hendelse") { focus.clearFocus(); vm.openNew() },
                    contentAlignment = Alignment.Center,
                ) { Svg(no.kristo.kalender.ui.Ic.PLUS, 20.dp, Color.White, 2.8f) }
            }
        }
    }
}

/** Fargeprikk/ring for en kalender. */
@Composable
fun Dot(c: Color, size: androidx.compose.ui.unit.Dp = 8.dp) = Box(Modifier.size(size).clip(CircleShape).background(c))

/** Datoen som tekst over arkene. */
fun longDate(d: LocalDate): String = no.kristo.kalender.cap(WD[d.jsDay]) + " " + d.dayOfMonth + ". " + MN[d.monthValue - 1]

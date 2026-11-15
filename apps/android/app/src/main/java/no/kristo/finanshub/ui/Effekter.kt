package no.kristo.finanshub.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.loadChar52
import no.kristo.finanshub.prefetchRuter52
import no.kristo.finanshub.seedHome52
import no.kristo.finanshub.seedRuter52
import no.kristo.finanshub.vaerKey52

private val EASE52 = CubicBezierEasing(.2f, .8f, .2f, 1f)

/**
 * Periodisk henting fra en composable (B2): [blokk] kjører bare mens skjermen er startet. Ved ON_STOP avbrytes den,
 * og ved ON_START begynner den på nytt (første henting tas igjen med en gang hvis blokken henter før den venter).
 * Bruk denne i stedet for `LaunchedEffect(Unit) { while (true) { … delay(…) } }`, som fortsetter i bakgrunnen.
 */
@Composable
internal fun GjentaMensSynlig(vararg nokler: Any?, blokk: suspend CoroutineScope.() -> Unit) {
    val eier = LocalLifecycleOwner.current
    val siste = rememberUpdatedState(blokk)
    LaunchedEffect(eier, *nokler) {
        eier.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { siste.value(this) }
    }
}

/* ======================= Effekter (App.kt) ======================= */

@Composable
internal fun Effects52B(vm: AppViewModel) {
    val ctx = LocalContext.current
    val life = LocalLifecycleOwner.current
    var resume by remember { mutableIntStateOf(0) }
    var fg by remember { mutableStateOf(true) }
    DisposableEffect(life) {
        val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) { fg = true; resume++ } else if (e == Lifecycle.Event.ON_PAUSE) fg = false }
        life.lifecycle.addObserver(o)
        onDispose { life.lifecycle.removeObserver(o) }
    }
    LaunchedEffect(Unit) { Blekk52.ensure(ctx) }
    LaunchedEffect(vm.account?.id) { runCatching { vm.seedRuter52() }; vm.loadChar52() }
    // Ruter: alle lagrede stopp ved oppstart, ved retur fra bakgrunn og hvert 60. sekund mens appen er i forgrunnen.
    LaunchedEffect(vm.account?.id, resume) {
        while (true) {
            if (fg) {
                runCatching { vm.seedHome52() }
                runCatching { vm.prefetchRuter52() }
            }
            delay(60_000)
        }
    }
    // Vær nå: nytt bilde når timen gir nytt tidsrom eller værtypen endres (forrige bilde står til det nye er lastet).
    LaunchedEffect(vm.weatherFull?.current?.code) { vaerCheck52(vm) }
    GjentaMensSynlig { while (true) { delay(60_000); vaerCheck52(vm) } }
}

private fun vaerCheck52(vm: AppViewModel) {
    if (vm.photoKind != "weather") return
    val k = vm.p52b.vaerKey ?: return
    if (vm.vaerKey52() != k) vm.loadPhoto()
}

/* ======================= Sideanimasjon ======================= */

/** Fullskjermsider (Vær, Brief, Kalender, Kart, Familie, Chat, AI-kontroll …): inn fra høyre 18 dp + fade, 260 ms. */
@Composable
internal fun PgIn52(content: @Composable () -> Unit) {
    val reduce = reduceMotion45()
    val a = remember { Animatable(if (reduce) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduce) a.animateTo(1f, tween(260, easing = EASE52)) else a.snapTo(1f) }
    val dx = with(LocalDensity.current) { 18.dp.toPx() }
    Box(Modifier.graphicsLayer { alpha = a.value; translationX = (1f - a.value) * dx }) { content() }
}

/** Antall fullskjermsider som ligger over innholdet (tilbake = tallet går ned). */
internal fun overlays52(vm: AppViewModel): Int = listOf(
    vm.weatherOpen, vm.ruterOpen, vm.familyOpen, vm.tasksOpen, vm.bd24.open, vm.kal26.open, vm.chat27.open, vm.p43.mediaOpen,
    vm.p46.kart.open, vm.p31.nordOpen, vm.p34.briefOpen, vm.p35.glimtOpen, vm.p34.aiOpen, vm.newsOpen, no.kristo.finanshub.Skjold76.open,
).count { it }

/** Innholdet under: ny side (fanebytte) inn fra høyre; når en side lukkes, glir siden under inn 12 dp fra venstre (220 ms). */
@Composable
internal fun PgBase52(vm: AppViewModel, content: @Composable () -> Unit) {
    val reduce = reduceMotion45()
    val dens = LocalDensity.current
    val a = remember { Animatable(if (reduce) 1f else 0f) }
    var fromLeft by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { if (!reduce) a.animateTo(1f, tween(260, easing = EASE52)) else a.snapTo(1f) }
    val n = overlays52(vm)
    var prev by remember { mutableIntStateOf(n) }
    LaunchedEffect(n) {
        val back = n < prev
        prev = n
        if (back && !reduce) { fromLeft = true; a.snapTo(0f); a.animateTo(1f, tween(220, easing = EASE52)); fromLeft = false }
    }
    val r = with(dens) { 18.dp.toPx() }
    val l = with(dens) { 12.dp.toPx() }
    Box(Modifier.graphicsLayer { alpha = a.value; translationX = (1f - a.value) * (if (fromLeft) -l else r) }) { content() }
}

package no.kristo.finanshub.ui

import androidx.activity.BackEventCompat
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.SaveableStateHolder
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalGraphicsContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Screen

/*
 * Prompt 23 (NAV): navigasjonsrammen i appen.
 *
 * Appen har ingen NavHost: siden som vises bestemmes av tilstand i AppViewModel (screen, paperPage, selectedTx …),
 * og vm.back() endrer den. Derfor:
 *  - Sveip tilbake (Predictive Back, Android 14+): vm.previewBack() kjører back() på prøve i et Compose-snapshot som
 *    kastes, så vi vet hvilken side tilbake fører til. Den siden ble tegnet sist den var åpen (skjermbilde av hele
 *    skjermen, tatt med en GraphicsLayer). Under sveipet ligger den bak: skalering 0,9 → 1, parallakse −30 % → 0 og et
 *    slør fra 10 % til 0. Siden som lukkes følger fingeren med skygge på kanten. Aldri svart: bak alt ligger papirfargen.
 *    Systemet avgjør om sveipet fullføres (terskel og fart); vi gir haptikk når halve bredden passeres.
 *  - Scrollposisjonen per side: hver side har sin egen SaveableStateProvider. rememberScrollState og
 *    rememberLazyListState lagres der. Tilbake gjenoppretter forrige side; siden man gikk tilbake fra glemmes.
 *    En ny side (ikke tilbake) åpner alltid øverst.
 */

/** Minne for navigasjonen: skjermbilder per side (de 5 siste), forrige nøkkel og scrollmålere for toppklippet. */
internal class Nav23 {
    val shots = LinkedHashMap<String, ImageBitmap>(8, .75f, true)
    var lastKey: String? = null
    var lastSeq = -1
    val meters = HashMap<String, ScrollMeter>()

    fun put(key: String, b: ImageBitmap) {
        shots[key] = b
        while (shots.size > 5) shots.remove(shots.keys.first())
    }

    /** Måleren som klipper innholdet ved toppbildet: følger siden, så en gjenopprettet posisjon også klippes. */
    fun meter(key: String): ScrollMeter = meters.getOrPut(key) { ScrollMeter() }
}

/** Siden i Papir (samme nøkkel som før: ny nøkkel = ny side). */
internal fun paperPageKey(vm: AppViewModel): String =
    "${vm.screen}-${vm.paperPage}-${vm.selectedTx}-${vm.domSection}-${vm.settingsPage}-${vm.subTab}-${vm.bolTab}"

/** Nøkkelen for scrollposisjonen: siden, og undersider som bytter ut hele innholdet (aksjedetaljer, én kvittering). */
internal fun navScrollKey(vm: AppViewModel, page: String): String = when (vm.screen) {
    Screen.Stocks -> "$page|${vm.stockScreen}|${vm.stockSel}"
    Screen.Scan -> "$page|${vm.selectedReceipt}"
    else -> page
}

/** Nøkkelen for skjermbildet: alt som endrer hva som er tegnet (også åpne lag som Nyheter, Familie og Huskeliste). */
internal fun navShotKey(vm: AppViewModel): String = listOf(
    paperPageKey(vm), vm.stockScreen, vm.stockSel, vm.selectedReceipt, vm.folder?.folder?.id, vm.finnSel, vm.trkSel, vm.matFull, vm.dishOpen,
    vm.original != null, vm.editing != null, vm.detail != null, vm.editHome, vm.paperFin, vm.paperFromMer, vm.paperFromFinMer,
    vm.newsOpen, vm.newsSettings, vm.weatherOpen, vm.ruterOpen, vm.familyOpen, vm.tasksOpen, vm.compareOpen, vm.m23.finnAdFor,
).joinToString("|")

/** Rotsidene (Hjem og hovedfanene): tilbake virker, men uten forhåndsvisning. */
internal fun navIsRoot(vm: AppViewModel): Boolean {
    val layer = vm.original != null || vm.editing != null || vm.detail != null || vm.selectedTx != null || vm.newsOpen || vm.weatherOpen ||
        vm.ruterOpen || vm.familyOpen || vm.tasksOpen || vm.compareOpen || vm.editHome
    if (layer || vm.paperPage != null || vm.paperFromMer || vm.paperFromFinMer) return false
    return when (vm.screen) {
        Screen.Homelab, Screen.Mat -> vm.dishOpen == null && !vm.matFull
        Screen.Tracking -> vm.trkSel == null
        Screen.Domains -> true
        Screen.Home -> true
        else -> false
    }
}

/**
 * Kalles når siden tegnes: tilbake (vm.navBackSeq økte) gjenoppretter siden vi kom til og glemmer den vi forlot;
 * alt annet er en ny side og åpner øverst. Siden selv pakkes i holder.SaveableStateProvider(key).
 */
internal fun Nav23.enter(key: String, seq: Int, holder: SaveableStateHolder) {
    if (lastKey != key) {
        val old = lastKey
        if (old != null) {
            if (seq != lastSeq) { holder.removeState(old); meters.remove(old) }
            else { holder.removeState(key); meters.remove(key) }
        }
        lastKey = key
    }
    lastSeq = seq
}

@Composable
internal fun rememberNav23(): Pair<Nav23, SaveableStateHolder> {
    val nav = remember { Nav23() }
    val holder = rememberSaveableStateHolder()
    return nav to holder
}

/**
 * Hele skjermen (toppbilde, innhold og fanelinje) med Predictive Back. [enabled] som BackHandler, [onBack] som før.
 * Skjermbildet av siden tas løpende (etter 0,4 s og så hvert 1,5 s) og legges i [nav] under navShotKey.
 */
@Composable
internal fun Nav23Back(vm: AppViewModel, nav: Nav23, enabled: Boolean, bg: Color, preview: Boolean = true, onBack: () -> Unit, content: @Composable () -> Unit) {
    val gc = LocalGraphicsContext.current
    val layer = remember(gc) { gc.createGraphicsLayer() }
    DisposableEffect(layer) { onDispose { gc.releaseGraphicsLayer(layer) } }
    val shotKey = navShotKey(vm)
    var progress by remember { mutableFloatStateOf(0f) }
    var fromLeft by remember { mutableStateOf(true) }
    var behind by remember { mutableStateOf<ImageBitmap?>(null) }
    var active by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(shotKey) {
        delay(400)
        while (true) {
            if (!active) runCatching { layer.toImageBitmap() }.getOrNull()?.let { nav.put(shotKey, it) }
            delay(1500)
        }
    }

    PredictiveBackHandler(enabled) { events ->
        val here = navShotKey(vm)
        val target = if (!preview || navIsRoot(vm)) null else vm.previewBack { navShotKey(vm) }
        // Uten eget skjermbilde (siden er ikke åpnet før) ligger papirfargen bak, aldri svart.
        behind = target?.takeIf { it != here }?.let { nav.shots[it] }
        // Samme side bak (f.eks. et ark lukkes): ingen forhåndsvisning, bare tilbake.
        active = target != null && target != here
        var crossed = false
        try {
            events.collect { e ->
                if (active) {
                    fromLeft = e.swipeEdge == BackEventCompat.EDGE_LEFT
                    progress = e.progress
                }
                val over = e.progress >= .5f
                if (over != crossed) { crossed = over; Haptics.select() }
            }
            if (active) animate(progress, 1f, animationSpec = tween(250, easing = LinearOutSlowInEasing)) { v, _ -> progress = v }
            onBack()
            progress = 0f; active = false; behind = null
        } catch (e: CancellationException) {
            // Sveipet ble avbrutt: siden spretter tilbake.
            scope.launch {
                animate(progress, 0f, animationSpec = tween(200, easing = FastOutSlowInEasing)) { v, _ -> progress = v }
                active = false; behind = null
            }
        }
    }

    Box(Modifier.fillMaxSize().background(bg)) {
        if (active) {
            Box(Modifier.fillMaxSize().graphicsLayer {
                val s = .9f + .1f * progress
                scaleX = s; scaleY = s
                translationX = (if (fromLeft) -1f else 1f) * size.width * .3f * (1f - progress)
            }) {
                val b = behind
                if (b != null) Image(b, null, Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
                else Box(Modifier.fillMaxSize().background(bg))
                Box(Modifier.fillMaxSize().graphicsLayer { alpha = 1f - progress }.background(Color.Black.copy(alpha = .1f)))
            }
        }
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { translationX = if (active) (if (fromLeft) 1f else -1f) * size.width * progress else 0f }
                .drawWithContent {
                    layer.record { this@drawWithContent.drawContent() }
                    if (active && progress > 0f) {
                        // Skygge på kanten mot siden bak (0 0 24 dp rgba(0,0,0,.25)).
                        val w = 24.dp.toPx()
                        val x = if (fromLeft) -w else size.width
                        drawRect(
                            Brush.horizontalGradient(
                                if (fromLeft) listOf(Color.Transparent, Color.Black.copy(alpha = .25f)) else listOf(Color.Black.copy(alpha = .25f), Color.Transparent),
                                startX = x, endX = x + w,
                            ),
                            topLeft = Offset(x, 0f), size = Size(w, size.height),
                        )
                    }
                    drawLayer(layer)
                },
        ) { content() }
    }
}

/** Aksjer har ingen skanneknapp (verken flytende eller i linja), som i designet. */
internal fun noScanHere(vm: AppViewModel): Boolean = (vm.screen == Screen.Stocks && vm.paperPage == null && vm.selectedTx == null) ||
    vm.paperPage == "mer" || // Prompt 28 (B): ingen skanneknapp (FAB eller + i fanelinja) på Mer.
    vm.weatherOpen || // Prompt 28: ingen skanneknapp på Vær (siden har egen bunnlinje).
    // Prompt 41: «Skanneknapp på Hjem» av → skjult bare på Hjem (de andre fanene beholder knappen).
    (!vm.p41.scanHome && vm.screen == Screen.Homelab && vm.paperPage == null && vm.selectedTx == null)

/** Finans-undersider (klassiske skjermer i Papir) der første element er et kort som skal ligge 23 dp opp i toppbildet. */
internal val PAPER_PULL_UP = setOf(Screen.Fast, Screen.Accounts)

/** Flytter innholdet [d] opp og gjør det like mye høyere, så bunnen står der den sto. */
internal fun Modifier.pullUp(d: androidx.compose.ui.unit.Dp): Modifier = this.layout { m, c ->
    val px = d.roundToPx()
    val h = if (c.hasBoundedHeight) c.maxHeight + px else c.maxHeight
    val pl = m.measure(c.copy(minHeight = minOf(c.minHeight + px, h), maxHeight = h))
    layout(pl.width, (pl.height - px).coerceAtLeast(0)) { pl.place(0, -px) }
}

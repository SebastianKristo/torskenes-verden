package no.kristo.finanshub.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.ui.zIndex
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import kotlinx.coroutines.withTimeoutOrNull
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*

/*
 * Papir, prompt 15: tilpass hver side (langt trykk → dempet vugging, ▲/▼/−), Fold med skinne til venstre,
 * flytende skanneknapp, Finans → Mer som rutenett, Finans → Søk, transaksjonsdetaljer med kvittering,
 * «Ny sending» på Sporing og raden «På vei» i Finn.
 */

/* ---------------- Tilpass siden ---------------- */

/** Et kort på en side som kan flyttes eller skjules. full = over hele bredden på Fold (Hjem i to kolonner). */
/** hold = langt trykk på kortet starter redigering (av for pakkelisten, der langt trykk velger pakker). */
data class PSec(val key: String, val label: String, val full: Boolean = false, val hold: Boolean = true)

/** Dempet vugging: ±0,2° med periode 0,6 s (ease-in-out), annenhver i motsatt fase. */
@Composable
internal fun wobbleAngle(on: Boolean, index: Int): Float {
    if (!on) return 0f
    val t = rememberInfiniteTransition(label = "vugge")
    val a by t.animateFloat(
        initialValue = if (index % 2 == 0) -0.2f else 0.2f, targetValue = if (index % 2 == 0) 0.2f else -0.2f,
        animationSpec = infiniteRepeatable(tween(300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "vinkel",
    )
    return a
}

@Composable
internal fun EditDot(text: String, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.size(30.dp).shadow(4.dp, CircleShape).clip(CircleShape).background(if (enabled) p.ink else p.ink.copy(alpha = .35f))
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(text, color = p.bg, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
}

/** Kortet i redigeringsmodus: vugger, får ▲, ▼ og − (skjul), og trykk inni kortet er av mens man redigerer. */
@Composable
internal fun EditWrap(vm: AppViewModel, page: String, sec: PSec, keys: List<String>, index: Int, count: Int, content: @Composable () -> Unit) {
    val p = PaperPal.current
    val edit = vm.editPage == page
    // Prompt 21: hold inne 500 ms og dra. Kortet følger fingeren (litt større og gjennomsiktig), og bytter plass med
    // naboen når det er dratt over halve høyden. Pilene virker fortsatt. Klikket etter et langt trykk åpner ikke siden.
    var dragging by remember { mutableStateOf(false) }
    var ty by remember { mutableFloatStateOf(0f) }
    val st = remember { DragTrack() }
    val idx by rememberUpdatedState(index)
    val cnt by rememberUpdatedState(count)
    val angle = wobbleAngle(edit && !dragging, index)
    fun follow() {
        val outer = st.top() - st.applied
        if (st.startY.isNaN()) return
        ty = st.startOuter + (st.lastY - st.startY) - outer
        if (outer != st.swapAt) {
            val h = st.height.coerceAtLeast(1f)
            val dir = when { ty > h * .5f && idx < cnt - 1 -> 1; ty < -h * .5f && idx > 0 -> -1; else -> 0 }
            if (dir != 0) { st.swapAt = outer; vm.movePageItem(page, keys, sec.key, dir) }
        }
    }
    Box(
        Modifier.fillMaxWidth().zIndex(if (dragging) 5f else 0f)
            .graphicsLayer {
                rotationZ = angle; translationY = if (dragging) ty else 0f; st.applied = translationY
                val sc = if (dragging) 1.03f else 1f; scaleX = sc; scaleY = sc; alpha = if (dragging) .88f else 1f
                transformOrigin = androidx.compose.ui.graphics.TransformOrigin(.5f, 0f)
            }
            .onGloballyPositioned { c ->
                st.coords = c; st.height = c.size.height.toFloat(); st.visualTop = c.positionInRoot().y
                if (dragging) follow()
            }
            .holdDrag(sec.hold || edit,
                onLong = { Haptics.tap(); vm.editPage = page; dragging = true; ty = 0f; st.startY = Float.NaN; st.swapAt = Float.NaN },
                onDrag = { y ->
                    if (st.startY.isNaN()) { st.startY = y; st.startOuter = st.top() - st.applied }
                    st.lastY = y; follow()
                },
                onEnd = { dragging = false; ty = 0f; st.startY = Float.NaN },
                toRootY = { o -> st.coords?.takeIf { it.isAttached }?.localToRoot(o)?.y ?: o.y },
            ),
    ) {
        content()
        if (edit) {
            Box(Modifier.matchParentSize().clip(RoundedCornerShape(20.dp)).border(1.5.dp, p.lab.copy(alpha = .55f), RoundedCornerShape(20.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {})
            Box(Modifier.align(Alignment.TopStart).padding(8.dp).clip(CircleShape).background(p.lab).padding(10.dp, 3.dp)) {
                Text(sec.label, color = p.onLab, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
            Row(Modifier.align(Alignment.TopEnd).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                EditDot("▲", index > 0) { vm.movePageItem(page, keys, sec.key, -1) }
                EditDot("▼", index < count - 1) { vm.movePageItem(page, keys, sec.key, 1) }
                EditDot("−", count > 1) { vm.hidePageItem(page, keys, sec.key) }
            }
        }
    }
}

/** Tilstanden under et drag (ikke Compose-tilstand: endres i hver pekerhendelse). */
internal class DragTrack {
    var coords: androidx.compose.ui.layout.LayoutCoordinates? = null
    var height = 0f
    var visualTop = 0f
    var startY = Float.NaN
    var lastY = 0f
    var startOuter = 0f
    var swapAt = Float.NaN
    /** Flyttingen laget faktisk har nå (kan ligge én ramme bak tilstanden). */
    var applied = 0f
    /** Kortets øverste kant på skjermen nå (med flytting), regnet ut direkte fra koordinatene. */
    fun top(): Float = coords?.takeIf { it.isAttached }?.localToRoot(Offset.Zero)?.y ?: visualTop
}

/** Linja øverst i redigeringsmodus: «Ferdig» og «Skjult: + Budsjett …» for å hente tilbake skjulte kort. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PageEditBar(vm: AppViewModel, page: String, secs: List<PSec>) {
    val p = PaperPal.current
    val keys = secs.map { it.key }
    val hid = vm.pageHidden(page)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.lab).padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Dra eller flytt med ▲ ▼, skjul med −", color = p.onLab, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            Box(Modifier.clip(CircleShape).background(p.onLab).clickable { Haptics.success(); vm.editPage = null }.padding(14.dp, 6.dp)) {
                Text("Ferdig", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
        }
        val hidden = secs.filter { it.key in hid }
        if (hidden.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Skjult:", color = p.onLab.copy(alpha = .85f), fontSize = 12.5.sp, modifier = Modifier.padding(top = 6.dp))
            hidden.forEach { s ->
                Box(Modifier.clip(CircleShape).border(1.dp, p.onLab.copy(alpha = .6f), CircleShape).clickable { vm.showPageItem(page, keys, s.key) }.padding(10.dp, 5.dp)) {
                    Text("+ ${s.label}", color = p.onLab, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
internal fun EditHint() = Text(
    "Hold inne på et kort og dra for å flytte det.", color = PaperPal.current.mut, fontSize = 11.5.sp,
    modifier = Modifier.fillMaxWidth().padding(4.dp, 6.dp), textAlign = TextAlign.Center,
)

/** Kortene på en side i valgt rekkefølge (skjulte utelatt), med redigeringslinja øverst. */
internal fun LazyListScope.pageSecs(vm: AppViewModel, page: String, secs: List<PSec>, body: @Composable (String) -> Unit) {
    val keys = secs.map { it.key }
    val edit = vm.editPage == page
    if (edit) item(key = "edit-$page") { PageEditBar(vm, page, secs) }
    val hid = vm.pageHidden(page)
    val vis = vm.pageOrder(page, keys).filter { it !in hid }
    vis.forEachIndexed { i, k ->
        val s = secs.first { it.key == k }
        item(key = "sec-$page-$k") { EditWrap(vm, page, s, keys, i, vis.size) { body(k) } }
    }
    if (!edit) item(key = "hint-$page") { EditHint() }
}

/** Samme som over i et rutenett (Hjem på Fold i to kolonner; søk, minikort og Siste nytt over hele bredden). */
internal fun LazyGridScope.pageGridSecs(vm: AppViewModel, page: String, secs: List<PSec>, wide: Boolean, body: @Composable (String) -> Unit) {
    val keys = secs.map { it.key }
    val edit = vm.editPage == page
    if (edit) item(key = "edit-$page", span = { GridItemSpan(maxLineSpan) }) { PageEditBar(vm, page, secs) }
    val hid = vm.pageHidden(page)
    val vis = vm.pageOrder(page, keys).filter { it !in hid }
    vis.forEachIndexed { i, k ->
        val s = secs.first { it.key == k }
        item(key = "sec-$page-$k", span = { GridItemSpan(if (!wide || s.full) maxLineSpan else 1) }) { EditWrap(vm, page, s, keys, i, vis.size) { body(k) } }
    }
    if (!edit) item(key = "hint-$page", span = { GridItemSpan(maxLineSpan) }) { EditHint() }
}

/* ---------------- Scroll under headeren ---------------- */

/** Klipper bort de øverste 23 dp (der innholdet overlapper bildeheaderen) når siden er scrollet. */
internal class TopCut(private val cut: Dp) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline =
        Outline.Rectangle(Rect(0f, with(density) { cut.toPx() }, size.width, size.height))
}

/** Teller hvor langt innholdet er scrollet (alle rullbare sider under), så klippingen slår inn så snart man scroller. */
internal class ScrollMeter : NestedScrollConnection {
    var y by mutableStateOf(0f)
    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
        y = (y - consumed.y).coerceAtLeast(0f)
        return Offset.Zero
    }
}

/* ---------------- Hilsen med autoskalering ---------------- */

/** Serif-tekst som krymper (i stedet for å brytes) til hver linje får plass, ned til min. */
@Composable
internal fun AutoSerif(text: String, max: TextUnit, color: Color, modifier: Modifier = Modifier, min: TextUnit = 18.sp, lines: Int = 2) {
    var size by remember(text, max) { mutableStateOf(max) }
    var ready by remember(text, max) { mutableStateOf(false) }
    Text(
        text, color = color, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = size, lineHeight = size * 1.04f,
        maxLines = lines, softWrap = false, overflow = TextOverflow.Clip,
        modifier = modifier.drawWithContent { if (ready) drawContent() },
        onTextLayout = { r ->
            if ((r.didOverflowWidth || r.didOverflowHeight) && size.value > min.value) size = (size.value * 0.92f).sp else ready = true
        },
    )
}

/* ---------------- Fanelinja, skinnen på Fold og den flytende knappen ---------------- */

/** En fane: nøkkel, navn, ikon (tegn) og handling. */
internal class NavTab(val key: String, val label: String, val icon: String, val go: () -> Unit)

/** Fanene for linja som vises: hovedlinja, Finans eller Domener. */
internal fun navTabs(vm: AppViewModel, bar: String, float: Boolean): List<NavTab> {
    val home = vm.screen == Screen.Homelab && vm.paperPage == null
    return when (bar) {
        "dom" -> listOf("oversikt" to "Oversikt" to "◎", "publikum" to "Publikum" to "◍", "ytelse" to "Ytelse" to "⚡", "infra" to "Infra" to "▤")
            .map { (kn, ic) -> NavTab(kn.first, kn.second, ic) { vm.domainSection(kn.first) } }
        "fin" -> {
            val l = vm.paperFinTabs.mapNotNull { k -> FIN_TABS.firstOrNull { it.first == k } }
                .map { (k, n) -> NavTab(k, n, finIcon(k)) { vm.paperFinTab(k) } }.toMutableList()
            if (float && l.none { it.key == "sok" }) l += NavTab("sok", "Søk", "⌕") { vm.paperFinTab("sok") }
            l += NavTab("fmer", "Mer", "⋯") { vm.paperFinTab("fmer") }
            l
        }
        // Abonnementer: Hjem, Innsikt og Historikk i linja (i stedet for faner øverst). + er en rød sirkel.
        "sub" -> listOf(Triple("home", "Hjem", "⌂"), Triple("ins", "Innsikt", "◔"), Triple("hist", "Historikk", "↻"))
            .map { (k, n, ic) -> NavTab(k, n, ic) { vm.subTab = k } }
        else -> buildList {
            // Én linje, satt opp av brukeren (hold inne på linja eller via Innstillinger). «Hjem» kommer bare på Hjem.
            if (home) add(NavTab("hjem", "Hjem", "⌂") { vm.paperTab("hjem") })
            vm.tabBarItems().forEach { t ->
                if (t.id == "sok" && !float) return@forEach
                // Uten egen oppsett følger fjerde fane «Automatisk» (Domener, eller Sporing når pakker er på vei).
                val id = if (vm.tabBar.isEmpty() && t.id == "domener" && vm.tab4 == "sporing") "sporing" else t.id
                val def = MAIN_TABS.firstOrNull { it.id == id } ?: t
                val label = if (id == t.id) t.label else def.label
                val icon = if (id == t.id) t.icon else def.icon
                add(NavTab(navKey(id), label, icon) { vm.mainTab(id) })
            }
        }
    }
}

private fun finIcon(k: String) = when (k) {
    "oversikt" -> "◎"; "liste" -> "≡"; "finn" -> "⇄"; "sok" -> "⌕"; "budsjett" -> "◔"; "kvitt" -> "▤"; "aksjer" -> "↗"; "abo" -> "↻"; "kontoer" -> "▥"; "boliger" -> "⌂"; else -> "•"
}

/** Nøkkelen fanen har i navCurrent (de gamle nøklene for Finans, Domener og Sporing). */
internal fun navKey(id: String): String = when (id) { "finans" -> "fin"; "domener" -> "dom"; "sporing" -> "trk"; else -> id }

/** Hvilken fane som er markert. */
internal fun navCurrent(vm: AppViewModel, bar: String): String = when (bar) {
    "dom" -> vm.domSection
    "fin" -> when {
        vm.paperPage == "fsok" -> "sok"
        vm.paperPage == "fmer" || vm.paperFromFinMer -> "fmer"
        else -> vm.paperFinTabs.firstOrNull { finTabScreen(it) == vm.screen } ?: "fmer"
    }
    "sub" -> vm.subTab
    else -> when {
        vm.paperPage == "media" -> "media"
        vm.paperFromMer && vm.screen == Screen.Stocks && vm.tabBarItems().any { it.id == "aksjer" } -> "aksjer"
        vm.paperFromMer && vm.screen == Screen.Folders && vm.tabBarItems().any { it.id == "boliger" } -> "boliger"
        vm.paperFromMer && vm.screen == Screen.Sub && vm.tabBarItems().any { it.id == "abonnementer" } -> "abonnementer"
        vm.paperPage != null || vm.paperFromMer -> "mer"
        vm.screen == Screen.Homelab -> "hjem"
        vm.screen == Screen.Mat -> "mat"
        vm.screen == Screen.Tracking -> "trk"
        vm.screen == Screen.Domains -> "dom"
        vm.screen.isFinance -> "fin"
        else -> "mer"
    }
}

/** +-knappen / skanneknappen: trykk = valg (eller Ny sending på Sporing), hold inne 450 ms = filvelgeren. */
@Composable
internal fun ScanPress(vm: AppViewModel, bar: String, modifier: Modifier, size: Dp, shape: Shape, onTap: () -> Unit, onHold: () -> Unit, content: @Composable BoxScope.() -> Unit) {
    val p = PaperPal.current
    val scope = rememberCoroutineScope()
    var pressed by remember { mutableStateOf(false) }
    val trk = vm.screen == Screen.Tracking && bar == "main"
    val label = when { bar == "dom" -> "Legg til domene"; bar == "sub" -> "Legg til abonnement"; trk -> "Ny sending"; bar == "fin" -> "Legg til kvittering"; vm.screen == Screen.Mat -> "Skann oppskrift"; else -> "Skann" }
    Box(
        modifier.size(size).scale(if (pressed) 0.9f else 1f).clip(shape).background(p.lab)
            .semantics { contentDescription = if (trk || bar == "dom" || bar == "sub") label else "$label. Trykk for valg, hold inne for å laste opp." }
            .pointerInput(bar, trk) {
                detectTapGestures(onPress = {
                    pressed = true
                    var long = false
                    val job = scope.launch {
                        delay(450)
                        if (bar == "dom" || bar == "sub" || trk) return@launch
                        long = true
                        pressed = false
                        Haptics.tap()
                        vm.plusHint = "Velg filer å laste opp"
                        onHold()
                        delay(1600)
                        vm.plusHint = null
                    }
                    val released = tryAwaitRelease()
                    job.cancel()
                    if (!long) vm.plusHint = null
                    pressed = false
                    if (released && !long) { Haptics.tap(); onTap() }
                })
            },
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/** Den flytende skanneknappen (60 dp, radius 22, aksentfarge, skygge). På Sporing er den «+» for Ny sending. */
@Composable
internal fun PaperFab(vm: AppViewModel, bar: String, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit) {
    val p = PaperPal.current
    val trk = vm.screen == Screen.Tracking && bar == "main"
    val shape = RoundedCornerShape(22.dp)
    Box(modifier.shadow(14.dp, shape, ambientColor = Color.Black.copy(alpha = .35f), spotColor = Color.Black.copy(alpha = .35f))) {
        ScanPress(vm, bar, Modifier, 60.dp, shape, onTap, onHold) {
            Icon(if (trk || bar == "dom") Icons.Filled.Add else Icons.Filled.DocumentScanner, null, tint = p.onLab, modifier = Modifier.size(26.dp))
        }
    }
}

/** Fold (bredde ≥ 600 dp): loddrett skinne til venstre, halvgjennomsiktig over bildet, med +-knappen nederst. */
@Composable
internal fun PaperRail(vm: AppViewModel, bar: String, float: Boolean, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit) {
    val p = PaperPal.current
    val tabs = navTabs(vm, bar, float)
    val cur = navCurrent(vm, bar)
    Column(
        modifier.width(84.dp).fillMaxHeight().clip(RoundedCornerShape(28.dp)).background(Color(0xE61B1A17)).padding(6.dp, 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            tabs.forEach { t ->
                val on = cur == t.key
                Column(
                    Modifier.fillMaxWidth().height(58.dp).clip(RoundedCornerShape(18.dp)).background(if (on) Color(0xFFF3EFE6) else Color.Transparent)
                        .clickable(role = Role.Tab, onClickLabel = t.label) { t.go(); Haptics.select() },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    GlyphIcon(t.icon, if (on) Color(0xFF1B1A17) else Color(0xFFD8D1C2), 19.dp)
                    Text(t.label, color = if (on) Color(0xFF1B1A17) else Color(0xFFD8D1C2), fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Clip)
                }
            }
        }
        if (!float) ScanPress(vm, bar, Modifier, 56.dp, RoundedCornerShape(18.dp), onTap, onHold) { Text("+", color = p.onLab, fontSize = 22.sp) }
    }
}

/* ---------------- Finans → Mer som rutenett ---------------- */

private class FinTile(val key: String, val title: String, val value: String, val icon: ImageVector, val badge: String? = null, val pos: Boolean = false, val go: () -> Unit)

/**
 * «Alt fra FinansHub på nettsiden»: to kort i bredden (3–4 på Fold), ikon i farget rute, tittel og et live-tall.
 * Prompt 20: hver flis har egen ikonfarge på tonet bakgrunn. Hold inne (~0,45 s) for redigeringsmodus: flisene vugger og
 * kan dras til ny plass, med «Ferdig» og «Tilbakestill». Rekkefølgen lagres (papir_fm_order, og fmOrder på serveren).
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
internal fun PaperFinMoreGrid(vm: AppViewModel, navBottom: Dp, wide: Boolean) {
    val p = PaperPal.current
    LaunchedEffect(Unit) {
        if (vm.subs == null) runCatching { vm.loadSubs() }
        vm.loadReviewCount()
    }
    val sm = vm.summary
    val review = vm.reviewCount ?: vm.boot?.reviewCount ?: 0
    val saldo = vm.boot?.accounts?.sumOf { it.balance }
    val st = vm.stocks?.summary
    val all = listOf(
        FinTile("sok", "Søk", "✦ Med AI", Icons.Filled.Search) { vm.paperFinTab("sok") },
        FinTile("liste", "Liste", "Alle transaksjoner", Icons.AutoMirrored.Filled.List) { vm.openFromFinMer(Screen.List) },
        FinTile("finn", "Finn", vm.finn?.items?.size?.let { "$it handler" } ?: "Kjøp og salg", Icons.Filled.Storefront) { vm.openFromFinMer(Screen.Finn) },
        FinTile("budsjett", "Budsjett", sm?.let { "${n0(it.left)} kr igjen" } ?: "Per kategori", Icons.Filled.PieChart) { vm.openFromFinMer(Screen.Budget) },
        FinTile("kvitt", "Kvitteringer", if (review > 0) "$review til gjennomgang" else "Kø og bokført", Icons.Filled.Receipt, if (review > 0) "$review" else null) { vm.openFromFinMer(Screen.Scan) },
        FinTile("faste", "Faste utgifter", vm.recurring?.let { "${it.size} faste trekk" } ?: "Neste 30 dager", Icons.Filled.Repeat) { vm.openFromFinMer(Screen.Fast) },
        FinTile("kontoer", "Kontoer", saldo?.let { "${neg0(it)} kr" } ?: "Saldo og sparemål", Icons.Filled.AccountBalance) { vm.openFromFinMer(Screen.Accounts) },
        FinTile("aksjer", "Aksjer", st?.let { "${n0(it.value)} kr" } ?: "Trading 212", Icons.AutoMirrored.Filled.ShowChart, pos = (st?.result ?: 0.0) > 0) { vm.openFromFinMer(Screen.Stocks) },
        FinTile("rapp", "Rapporter", "Måned og år", Icons.Filled.BarChart) { vm.openFromFinMer(Screen.Reports) },
        FinTile("abo", "Subscription OS", vm.subs?.let { "${n0(it.monthly)} kr/mnd" } ?: "Abonnementer", Icons.Filled.Autorenew) { vm.openFromFinMer(Screen.Sub) },
        FinTile("boliger", "Boliger", vm.folders?.let { if (it.size == 1) "1 bolig" else "${it.size} boliger" } ?: "Utgifter og regninger", Icons.Filled.Home) { vm.openFromFinMer(Screen.Folders) },
        FinTile("fimport", "Import", "Bank, Excel og Finn", Icons.Filled.FileUpload) { vm.openFromFinMer(Screen.Import) },
        FinTile("innst", "Innstillinger", "Kategorier og regler", Icons.Filled.Settings) { vm.settingsPage = null; vm.openFromFinMer(Screen.Settings) },
    )
    var editing by remember { mutableStateOf(false) }
    var order by remember { mutableStateOf(vm.fmOrder) }
    var dragKey by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableStateOf(Offset.Zero) }
    LaunchedEffect(vm.fmOrder) { if (!editing) order = vm.fmOrder }
    val byKey = all.associateBy { it.key }
    val tiles = order.mapNotNull { byKey[it] }.filter { it.key !in vm.paperFinTabs }
    val grid = rememberLazyGridState()
    val wobble = rememberInfiniteTransition(label = "wobble").animateFloat(-1f, 1f, infiniteRepeatable(tween(130, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "w")
    val cols = if (wide) 4 else 2
    // Prompt 21: hold inne 500 ms på en flis og dra (redigering slås på av seg selv); i redigering drar man direkte.
    // Alt går i Initial-passet, så klikket etter et langt trykk ikke åpner flisen, og rutenettet ikke scroller under draget.
    val editNow by rememberUpdatedState(editing)
    val dragMod = Modifier.pointerInput(Unit) {
        fun hit(pos: Offset) = grid.layoutInfo.visibleItemsInfo.firstOrNull { i ->
            i.key is String && (i.key as String) != "fm-head" && pos.x >= i.offset.x && pos.x <= i.offset.x + i.size.width && pos.y >= i.offset.y && pos.y <= i.offset.y + i.size.height
        }
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            val item = hit(down.position) ?: return@awaitEachGesture
            val slop = 8.dp.toPx()
            if (!editNow) {
                var cancel = false
                val r = withTimeoutOrNull(500L) {
                    while (true) {
                        val ev = awaitPointerEvent(PointerEventPass.Initial)
                        val ch = ev.changes.firstOrNull { it.id == down.id }
                        if (ch == null || !ch.pressed || (ch.position - down.position).getDistance() > slop) { cancel = true; break }
                    }
                    true
                }
                if (r != null || cancel) return@awaitEachGesture
                editing = true; Haptics.tap()
            } else {
                // Redigering: draget starter når fingeren flyttes; et vanlig trykk gjør ingenting.
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@awaitEachGesture
                    if (!ch.pressed) return@awaitEachGesture
                    if ((ch.position - down.position).getDistance() > viewConfiguration.touchSlop) break
                }
            }
            val k = item.key as String
            dragKey = k; dragOffset = Offset.Zero
            try {
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                    ev.changes.forEach { it.consume() }
                    if (!ch.pressed) break
                    dragOffset += ch.positionChange()
                    val cur = grid.layoutInfo.visibleItemsInfo.firstOrNull { it.key == k } ?: continue
                    val center = Offset(cur.offset.x + cur.size.width / 2f, cur.offset.y + cur.size.height / 2f) + dragOffset
                    val target = hit(center)
                    if (target != null && target.key != k) {
                        val l = order.toMutableList()
                        val from = l.indexOf(k)
                        val to = l.indexOf(target.key as String)
                        if (from >= 0 && to >= 0) {
                            l.removeAt(from); l.add(to, k)
                            order = l
                            // Flisen flytter seg i rutenettet; fingeren skal fortsatt holde den.
                            dragOffset += Offset((cur.offset.x - target.offset.x).toFloat(), (cur.offset.y - target.offset.y).toFloat())
                            Haptics.select()
                        }
                    }
                }
            } finally { dragKey = null; dragOffset = Offset.Zero }
        }
    }
    LazyVerticalGrid(
        GridCells.Fixed(cols), Modifier.fillMaxSize().then(dragMod), state = grid, contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom),
        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "fm-head", span = { GridItemSpan(maxLineSpan) }) {
            if (!editing) PCard(shadow = true) {
                Column(Modifier.padding(16.dp, 12.dp)) {
                    PLabel("Finans · Mer")
                    Text("Alt fra FinansHub på nettsiden · hold inne for å flytte", color = p.mut, fontSize = 13.sp)
                }
            } else {
                // Prompt 21: redigeringslinja er en egen hvit pille med skygge (lesbar over toppbildet i lyst og mørkt tema).
                Row(
                    Modifier.fillMaxWidth().shadow(14.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                        .clip(CircleShape).background(p.card).padding(start = 18.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("Dra for å flytte", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
                    Box(Modifier.height(36.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button) { order = FM_DEFAULT_ORDER; vm.resetFmOrder(); Haptics.select() }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center) { Text("Tilbakestill", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1) }
                    Box(Modifier.height(36.dp).clip(CircleShape).background(Color(0xFF1B1A17)).clickable(role = Role.Button) { editing = false; vm.saveFmOrder(order); Haptics.success() }.padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center) { Text("Ferdig", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
                }
            }
        }
        items(tiles.size, key = { tiles[it].key }) { i ->
            val t = tiles[i]
            val tint = Color(FM_COLORS[t.key] ?: 0xFF6F6A60)
            val dragging = dragKey == t.key
            val tileMod = when {
                dragging -> Modifier.zIndex(2f).graphicsLayer { translationX = dragOffset.x; translationY = dragOffset.y; scaleX = 1.05f; scaleY = 1.05f }
                editing -> Modifier.graphicsLayer { rotationZ = wobble.value * (if (i % 2 == 0) 1.4f else -1.4f) }
                else -> Modifier
            }
            Column(
                tileMod.fillMaxWidth().heightIn(min = 112.dp).clip(RoundedCornerShape(20.dp)).background(p.card)
                    .then(if (editing) Modifier else Modifier.clickable(onClickLabel = t.title) { Haptics.select(); t.go() })
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    // Ikonboksen: 14 % av fargen blandet inn i kortbakgrunnen (color-mix).
                    Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(androidx.compose.ui.graphics.lerp(p.card, tint, .14f)), contentAlignment = Alignment.Center) {
                        Icon(t.icon, null, tint = tint, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.weight(1f))
                    t.badge?.let { b ->
                        Box(Modifier.clip(CircleShape).background(p.lab).padding(8.dp, 2.dp)) { Text(b, color = p.onLab, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                    }
                }
                Spacer(Modifier.weight(1f))
                PSerif(t.title, 17.sp, maxLines = 1)
                Text(t.value, color = if (t.pos) p.pos else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/* ---------------- Finans → Søk ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PaperFinSearch(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val r = vm.finSearch
    val q = vm.finSearchQ
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(
                Modifier.fillMaxWidth().height(50.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(p.card).padding(start = 16.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("⌕", color = p.mut, fontSize = 16.sp)
                BasicTextField(
                    q, { vm.finSearchQ = it }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { vm.runFinSearch() }),
                    modifier = Modifier.weight(1f).focusRequester(focus),
                    decorationBox = { inner ->
                        Box {
                            if (q.isEmpty()) Text(if (vm.finSearchAi) "Spør, f.eks. «hva brukte jeg på kaffe?»" else "Søk i transaksjoner og kvitteringer", color = p.mut, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            inner()
                        }
                    },
                )
                val ai = vm.finSearchAi
                Box(
                    Modifier.height(38.dp).clip(CircleShape).background(if (ai) p.lab else Color.Transparent).border(1.dp, if (ai) p.lab else p.line, CircleShape)
                        .clickable { vm.finSearchAi = !ai; Haptics.select(); if (q.isNotBlank()) vm.runFinSearch(ai = !ai) }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("✦ AI", color = if (ai) p.onLab else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
            }
        }
        if (q.isBlank()) {
            item { PLabel("Prøv", modifier = Modifier.padding(start = 4.dp, top = 6.dp)) }
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("rema", "spotify", "kyllingfilet", "hvor mye brukte jeg på mat?", "strøm i oktober").forEach { s ->
                        PChip(s, false) { vm.finSearchQ = s; vm.finSearchAi = s.contains(' '); vm.runFinSearch(s, s.contains(' ')) }
                    }
                }
            }
        }
        if (vm.finSearchBusy) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        if (r != null && q.isNotBlank() && !vm.finSearchBusy) {
            val plain = r.mode == "plain" || r.plainFirst
            if (vm.finSearchAi && r.answer.isNotBlank()) item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.ink).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PLabel("✦ Svar", p.bg.copy(alpha = .7f))
                    PSerif(r.answer, 18.sp, p.bg)
                    Text(if (plain) "Fant vanlige treff først." else "✦ ${r.engine ?: "AI"} leste transaksjoner, kvitteringer og varelinjer.", color = p.bg.copy(alpha = .65f), fontSize = 12.sp)
                }
            }
            if (r.hits.isEmpty()) item { Text("Ingen treff på «$q».", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(6.dp)) }
            else {
                item {
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                        PLabel("Treff · ${r.hits.size}", modifier = Modifier.weight(1f))
                        val sum = r.hits.sumOf { it.amount ?: 0.0 }
                        Text("Netto ${signed(sum)} kr", color = if (sum >= 0) p.pos else p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp)
                    }
                    Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(2.dp).background(p.ink))
                }
                items(r.hits.size) { i ->
                    val h = r.hits[i]
                    Column {
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = h.txId != null) { h.txId?.let { vm.openTx(it) } }.padding(2.dp, 8.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(h.description, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(listOfNotNull(h.date?.let(::ddmm), h.reason).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            h.amount?.let { a -> PSerif(signed(a), 17.sp, if (a > 0) p.pos else p.ink, maxLines = 1) }
                        }
                        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    }
                }
            }
        }
    }
}

/* ---------------- Transaksjonsdetaljer ---------------- */

@Composable
internal fun PaperTxDetail(vm: AppViewModel, navBottom: Dp, camera: () -> Unit, files: () -> Unit) {
    val p = PaperPal.current
    val id = vm.selectedTx ?: return
    LaunchedEffect(id) { if (vm.txDetail?.tx?.id != id) vm.loadTxDetail(id) }
    val d = vm.txDetail?.takeIf { it.tx.id == id }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (d == null) {
            item {
                PCard(shadow = true) {
                    Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) {
                        vm.txDetailError?.let { Text(it, color = p.lab, fontSize = 13.sp) } ?: CircularProgressIndicator(color = p.ink)
                    }
                }
            }
            return@LazyColumn
        }
        val t = d.tx
        item {
            PCard(shadow = true) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Logo(vm, t.domain, t.merchant ?: t.description, t.color, 46, RoundedCornerShape(13.dp))
                        Column(Modifier.weight(1f)) {
                            PSerif(t.merchant ?: t.description, 22.sp, maxLines = 2)
                            Text(listOf(t.category, longDate(runCatching { java.time.LocalDate.parse(t.date.take(10)) }.getOrDefault(java.time.LocalDate.now())), t.account).filter { it.isNotBlank() }.joinToString(" · "),
                                color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    PSerif("${signed(t.amount)} kr", 40.sp, if (t.amount > 0) p.pos else p.ink, weight = FontWeight.Normal, maxLines = 1)
                    d.aiSummary?.let { Text("✦ $it", color = p.lab, fontSize = 14.sp) }
                }
            }
        }
        val rc = d.receipt
        item {
            Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                PLabel("Original kvittering", modifier = Modifier.weight(1f))
                val (st, c) = when (rc?.status) { null -> "Mangler" to p.lab; "needs_review" -> "Til gjennomgang" to p.lab; else -> "Vedlagt" to p.pos }
                Text(st, color = c, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        if (rc == null) item {
            PCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Ingen kvittering er lagt ved.", color = p.mut, fontSize = 13.5.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PButton("Legg ved · kamera", Modifier.weight(1f), height = 44.dp) { camera() }
                        PButton("Filer", Modifier.weight(1f), kind = "line", height = 44.dp) { files() }
                    }
                }
            }
        } else item {
            // Papirlapp: lys bakgrunn, monospace, stiplet linje.
            val slip = Color(0xFFFBF8F1)
            val ink = Color(0xFF2A2822)
            Column(
                Modifier.fillMaxWidth().shadow(6.dp, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(slip)
                    .clickable(enabled = rc.fileUrl != null) { vm.openReceiptFull(rc) }.padding(18.dp, 16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text((t.merchant ?: t.description).uppercase(), color = ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, textAlign = TextAlign.Center)
                Text("${ddmm(t.date)} · KVITTERING", color = ink.copy(alpha = .7f), fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                Dashed(ink)
                val lines = rc.lines.ifEmpty { t.lines }
                if (lines.isEmpty()) Text("Varelinjene er ikke lest ennå", color = ink.copy(alpha = .6f), fontFamily = PaperFonts.mono, fontSize = 12.sp)
                lines.forEach { (n, v) ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(n, color = ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(n2(v), color = ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp)
                    }
                }
                Dashed(ink)
                Row(Modifier.fillMaxWidth()) {
                    Text("TOTAL", color = ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                    Text(n2(rc.total ?: kotlin.math.abs(t.amount)), color = ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
                }
                if (rc.fileUrl != null) Text("Trykk for originalen", color = ink.copy(alpha = .55f), fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                PButton("Endre kategori", Modifier.weight(1f), kind = "line", height = 46.dp) { vm.txCatSheet = true }
                PButton("Bankutskrift", Modifier.weight(1f), kind = "line", height = 46.dp) { vm.txBankSheet = true }
            }
        }
        item { PButton("Rediger transaksjon", Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { vm.editTx(t) } }
    }
    if (vm.txCatSheet) TxCategorySheet(vm, d)
    if (vm.txBankSheet && d != null) TxBankSheet(vm, d)
    vm.receiptFull?.let { bmp -> ReceiptFullscreen(bmp) { vm.receiptFull = null } }
}

@Composable
private fun Dashed(c: Color) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp).height(1.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        repeat(40) { Box(Modifier.weight(1f).fillMaxHeight().background(c.copy(alpha = .45f))) }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun TxCategorySheet(vm: AppViewModel, d: TxDetail?) {
    val p = PaperPal.current
    val t = d?.tx ?: return
    var rule by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = { vm.txCatSheet = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Endre kategori", 24.sp)
            Text(t.merchant ?: t.description, color = p.mut, fontSize = 13.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                (vm.boot?.categories ?: emptyList()).forEach { c -> PChip(c.name, c.id == t.categoryId) { vm.setTxCategoryRule(t.id, c.id, rule) } }
            }
            PCard { PToggle("Lag regel for fremtidige", "Nye transaksjoner fra ${(t.merchant ?: t.description).take(30)} får samme kategori", rule) { rule = it } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TxBankSheet(vm: AppViewModel, d: TxDetail) {
    val p = PaperPal.current
    val b = d.bank
    ModalBottomSheet(onDismissRequest = { vm.txBankSheet = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PSerif("Bankutskrift", 24.sp)
            if (b == null) Text("Ingen bankrad lagret. Transaksjonen er lagt inn manuelt eller fra en kvittering.", color = p.mut, fontSize = 13.sp)
            else PCard {
                listOf("Tekst" to b.description, "KID / melding" to b.message, "Bokført" to b.bookingDate, "Rentedato" to b.valueDate,
                    "Beløp" to b.amount?.let { "${n2(it)} kr" }, "Konto" to b.account, "Arkivref." to b.archiveReference)
                    .filter { it.second != null }.forEachIndexed { i, (k, v) -> PRow(k, null, v ?: "", p.ink, serif = false, top = i > 0) }
            }
        }
    }
}

/** Originalbildet i fullskjerm med zoom (to fingre) og dobbelttrykk for å nullstille. */
@Composable
private fun ReceiptFullscreen(bmp: android.graphics.Bitmap, close: () -> Unit) {
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    val state = rememberTransformableState { z, pan, _ -> scale = (scale * z).coerceIn(1f, 6f); offset += pan }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).pointerInput(Unit) { detectTapGestures(onDoubleTap = { scale = 1f; offset = Offset.Zero }) }) {
            Image(bmp.asImageBitmap(), "Kvittering", contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().transformable(state).graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y })
            Box(Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(12.dp).size(40.dp).clip(CircleShape).background(Color(0x99000000)).clickable(onClick = close), contentAlignment = Alignment.Center) {
                Text("✕", color = Color.White, fontSize = 16.sp)
            }
        }
    }
}

/* ---------------- Sporing: Ny sending ---------------- */

/** Arket «Ny sending»: feltet får fokus med en gang, transportøren gjenkjennes mens man skriver, og «Lim inn». */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun NewShipmentSheet(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    var no by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { delay(250); runCatching { focus.requestFocus() } }
    val clean = no.uppercase().filter { it.isLetterOrDigit() }
    val guess = if (clean.length >= 6) Carrier.detect(clean) else null
    val car = guess?.let { g -> Carrier.KNOWN.firstOrNull { it.id == g } }?.takeIf { it.id != "other" }
    val submit = { if (clean.length >= 6) { vm.addTracking(clean, "", guess, false); vm.trkAddOpen = false } }
    // «Skann strekkode»: bilde av pakkelappen, som serveren leser (Roboflow). Uten oppsett skriver eller limer man inn selv.
    var shot by remember { mutableStateOf<android.net.Uri?>(null) }
    val cam = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) shot?.let { u -> vm.scanBarcode(u) { code -> no = code } } }
    val takeLabel: () -> Unit = {
        val dir = java.io.File(ctx.cacheDir, "scans").apply { mkdirs() }
        val f = java.io.File(dir, "pakkelapp-${System.currentTimeMillis()}.jpg")
        val u = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        shot = u
        runCatching { cam.launch(u) }
    }
    ModalBottomSheet(onDismissRequest = { vm.trkAddOpen = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().imePadding().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Ny sending", 24.sp)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                PLabel("Sporingsnummer", p.lab, 10.sp)
                BasicTextField(
                    no, { no = it.uppercase() }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 22.sp, fontFamily = PaperFonts.mono),
                    cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    decorationBox = { inner -> Box { if (no.isEmpty()) Text("CV704411234NO", color = p.mut, fontSize = 22.sp, fontFamily = PaperFonts.mono); inner() } },
                )
                Box(Modifier.fillMaxWidth().height(2.dp).background(p.lab))
            }
            if (car != null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CarrierBadge(car.ini, car.color, car.fg, 24, car.id)
                Text("✓ ${car.name} gjenkjent", color = p.pos, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            PButton("Spor sending", Modifier.fillMaxWidth(), height = 52.dp) { submit() }
            PButton(if (vm.barcodeBusy) "Leser strekkoden …" else "Skann strekkode", Modifier.fillMaxWidth(), kind = "line", height = 48.dp) { if (!vm.barcodeBusy) takeLabel() }
            PButton("Lim inn", Modifier.fillMaxWidth(), kind = "line", height = 48.dp) {
                val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                val txt = cm?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(ctx)?.toString()?.trim()
                if (txt.isNullOrBlank()) vm.flash("Utklippstavlen er tom") else no = txt.uppercase().take(40)
            }
        }
    }
}

/* ---------------- Finn: «På vei» ---------------- */

/** Vannrett rad med handler som er underveis (sendt eller mottatt, ikke fullført). Skjules når ingen er på vei. */
@Composable
internal fun FinnWayRow(vm: AppViewModel, all: List<FinnDeal>) {
    val p = PaperPal.current
    val way = all.filter { !it.finished && it.level in 2..3 }
    if (way.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            PLabel("På vei · ${way.size}", modifier = Modifier.weight(1f))
            Text("Vis alle ›", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.clickable { vm.finnSeg = "way" })
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(way.size) { i ->
                val d = way[i]
                val urgent = d.level == 3
                Row(
                    Modifier.width(258.dp).clip(RoundedCornerShape(18.dp)).background(p.card).clickable { vm.finnSeg = "all"; vm.finnEdit = d.id }.padding(10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF2A3540))) {
                        ServerImage(vm, d.image, Modifier.matchParentSize()) {
                            Text(d.item.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase(), color = Color.White.copy(alpha = .8f),
                                fontFamily = PaperFonts.serif, fontSize = 18.sp, modifier = Modifier.align(Alignment.Center))
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(d.item, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(Modifier.fillMaxWidth().height(3.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            (1..4).forEach { j ->
                                val c = when { j < d.level -> p.ink; j == d.level -> p.lab; else -> p.line }
                                Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c))
                            }
                        }
                        Text("${if (d.sold) "Solgt" else "Kjøpt"} · ${d.nextText}", color = if (urgent) p.lab else p.mut, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/* ---------------- Innstillinger: Finans-fanelinja, fjerde fane og skanneknappen ---------------- */

@Composable
internal fun PaperNavSettings(vm: AppViewModel) {
    val p = PaperPal.current
    val tabs = vm.paperFinTabs
    PLabel("Finans · fanelinje og Mer", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    PCard {
        FIN_TABS.forEachIndexed { i, (k, n) ->
            val at = tabs.indexOf(k)
            val on = at >= 0
            PRow(
                n, if (on) "I fanelinjen, plass ${at + 1}" + (if (at > 0) " · trykk for å flytte til venstre" else "") else "Ligger i Mer",
                if (on) (if (at > 0) "◂ Fane ${at + 1}" else "Fane 1") else "+ Legg til", if (on) p.pos else p.lab, serif = false, top = i > 0,
            ) {
                when {
                    !on && tabs.size >= 4 -> vm.flash("Maks 4 faner. Fjern en først.")
                    !on -> vm.updatePaperFinTabs(tabs + k)
                    at > 0 -> vm.updatePaperFinTabs(tabs.toMutableList().also { l -> l[at] = l[at - 1]; l[at - 1] = k })
                }
            }
        }
        PRow("Fjern fra fanelinjen", "Flytter siste fane til Mer", if (tabs.size > 1) "Fjern ${FIN_TABS.firstOrNull { it.first == tabs.last() }?.second ?: ""}" else "–", p.lab, serif = false, top = true) {
            if (tabs.size > 1) vm.updatePaperFinTabs(tabs.dropLast(1))
        }
        PRow("Tilbakestill", "Oversikt, Liste, Finn, Søk", "Nullstill", serif = false, top = true) { vm.updatePaperFinTabs(FIN_TABS_DEFAULT) }
    }
    PLabel("Fanelinje", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    PCard {
        val float = vm.fabStyle == "float"
        PRow("Skanneknapp", if (float) "Flyter over linjen, søk ligger i linjen" else "Ligger i linjen som +", if (float) "Flytende ›" else "I linjen ›", serif = false) {
            vm.setFabStyle(if (float) "inline" else "float")
        }
        val t4 = vm.fourthTab
        val now = if (vm.tab4 == "sporing") "Sporing, ${vm.packagesOnWay} på vei" else "Domener"
        PRow("Fjerde fane", when (t4) { "sporing" -> "Alltid Sporing"; "domener" -> "Alltid Domener"; else -> "Domener, eller Sporing når pakker er på vei (nå: $now)" },
            when (t4) { "sporing" -> "Sporing ›"; "domener" -> "Domener ›"; else -> "Automatisk ›" }, serif = false, top = true) {
            vm.setFourthTab(when (t4) { "auto" -> "domener"; "domener" -> "sporing"; else -> "auto" })
        }
        PRow("Tilpass sidene", "Hold inne på et kort på en side for å flytte eller skjule det", "›", serif = false, top = true) { vm.paperTab("hjem"); vm.editPage = "hjem" }
    }
}

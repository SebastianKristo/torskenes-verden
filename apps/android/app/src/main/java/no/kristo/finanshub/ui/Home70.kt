package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChangeIgnoreConsumed
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.launch
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.closeAns31
import no.kristo.finanshub.wiggleEnd37

/*
 * Prompt 70 (ANDHOME70) – Hjem på telefon (2 kolonner, «Hjem som fliser»):
 *  - claude-code-android-hjem-flishoyde.md: ingen LazyVerticalGrid og ingen fast høyde. Rutenettet bygges fra layouten (order, hidden, sz):
 *    full = egen rad, halv = pares med neste halve i PairRow70 (begge like høye, den høyeste bestemmer), Avgang = to rader høy
 *    (høyden = de to halve ved siden av + 12 dp, minst 212 dp). En halv uten partner står alene til venstre. Alt i én Column(verticalScroll)
 *    med 12 dp luft.
 *  - claude-code-wiggle-flytt-android.md: hele dra-gesten ligger på beholderen (ikke på hvert kort), så den overlever at kortet bytter rad
 *    mens man drar. I wiggle: hold 0,3 s → løft (1,03, skygge, plassen vises dempet), dra → de andre glir unna live (også sideveis),
 *    autoscroll 80 dp fra kantene, slipp → lagres én gang (layout.pages.hjem.order) med lett haptikk. Sveip uten å holde = scroll.
 *    Utenfor wiggle: hold 0,5 s → wiggle (som før).
 *  - claude-code-widget-storrelse-mobil.md: håndtaket ↔ (34 dp) nede til høyre. Halv → full: dra > 40 dp (alle retninger). Full → halv:
 *    dra > 40 dp innover/mot venstre. Trykk bytter. Live med vibrasjonsklikk ved hvert bytte, lagres ved slipp (layout.pages.hjem.sz).
 *    Søk (h1) og Snarveier (h4) er alltid fulle.
 *  - claude-code-hjem-scroll-mens-ai.md: ingen fullskjerm-lag over Hjem mens Glimt svarer. Trykk utenfor (< 8 dp bevegelse, utenfor kortet
 *    og søkefeltet, svaret ferdig) lukker (Modifier.ansTapOutside70 på roten i Paper.kt). Er kortet scrollet ut av syne når svaret blir
 *    ferdig: lett haptikk + pillen «Glimt svarte ↑» over fanelinja, som scroller opp til kortet.
 */

private const val PAGE70 = "hjem"
private val GAP70 = 12.dp
private const val RESIZE70 = "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"

/** Søkefeltet og Glimt-svaret på Hjem (for trykk utenfor og pillen). */
internal object Ans70 {
    /** Søkefeltets ramme på skjermen (ikke klippet). */
    var searchRect: Rect? = null
    var pill by mutableStateOf(false)
}

/** Tilstanden under flytting og størrelsesendring (én per Hjem). */
internal class Home70State {
    var dragKey by mutableStateOf<String?>(null)
    var finger by mutableStateOf(Offset.Zero)
    /** Kortets plass i rutenettet nå (uten flytting) – oppdateres når kortet bytter plass. */
    var dragTop by mutableStateOf(Offset.Zero)
    var grab = Offset.Zero
    val bounds = HashMap<String, Rect>()
    /** Knappene på kortene i wiggle (− og ✎ får trykket, ↔ styres herfra). */
    val ctl = HashMap<String, Rect>()
    var vis: List<String> = emptyList()
    var keys: List<String> = emptyList()
    var lastSwap = 0L
    var lastTarget: String? = null
    var viewTop = 0f
    var viewBottom = 0f
    var coords: LayoutCoordinates? = null
    var sz: Map<String, String> = emptyMap()
}

/** Søk og Snarveier er alltid fulle. */
private fun fixedFull70(k: String) = k == "h1" || k == "h4"

internal fun isFull70(k: String, sz: Map<String, String>): Boolean = when {
    fixedFull70(k) -> true
    sz[k] == "full" -> true
    sz[k] == "half" -> false
    else -> k !in HALF52
}

/** Én rad i rutenettet: ett fullt kort, to halve (b kan mangle), eller Avgang med opptil to halve oppå hverandre ved siden av. */
internal sealed class Row70(val id: String, val keys: List<String>) {
    class One(val k: String) : Row70("s-$k", listOf(k))
    class Two(val a: String, val b: String?) : Row70("p-$a-${b ?: ""}", listOfNotNull(a, b))
    class Av(val k: String, val nx: List<String>) : Row70("a-$k-" + nx.joinToString("-"), listOf(k) + nx)
}

/** Radene fra synlige kort i rekkefølge (ren funksjon; test/p70-andhome.test.js speiler reglene). */
internal fun rows70(vis: List<String>, sz: Map<String, String>): List<Row70> {
    val out = ArrayList<Row70>()
    var i = 0
    while (i < vis.size) {
        val k = vis[i]
        if (isFull70(k, sz)) { out += Row70.One(k); i++; continue }
        if (k == "h52av") {
            val nx = vis.drop(i + 1).takeWhile { !isFull70(it, sz) && it != "h52av" }.take(2)
            out += Row70.Av(k, nx)
            i += 1 + nx.size
            continue
        }
        val nx = vis.getOrNull(i + 1)?.takeIf { !isFull70(it, sz) && it != "h52av" }
        out += Row70.Two(k, nx)
        i += if (nx != null) 2 else 1
    }
    return out
}

/**
 * To kolonner der begge får høyden til den høyeste (innholdets høyde, minst [minH]). Kort som ikke kan måles på forhånd
 * (f.eks. med BoxWithConstraints/LazyRow inni) får sin egen høyde i stedet for å krasje.
 */
@Composable
private fun PairRow70(modifier: Modifier, minH: Dp, zl: Float, zr: Float, left: @Composable () -> Unit, right: @Composable () -> Unit) {
    Layout(
        content = {
            Box(Modifier.zIndex(zl)) { left() }
            Box(Modifier.zIndex(zr)) { right() }
        },
        modifier = modifier,
    ) { ms, c ->
        val g = GAP70.roundToPx()
        val w = c.maxWidth
        val cw = ((w - g) / 2).coerceAtLeast(0)
        val mh = minH.roundToPx()
        val ih = ms.map { m -> try { m.minIntrinsicHeight(cw) } catch (e: Exception) { -1 } }
        val pl = if (ih.all { it >= 0 }) {
            val h = maxOf(mh, ih.maxOrNull() ?: 0)
            ms.map { it.measure(Constraints.fixed(cw, h)) }
        } else ms.map { it.measure(Constraints(cw, cw, mh, Constraints.Infinity)) }
        val h = pl.maxOf { it.height }
        layout(w, h) {
            pl[0].placeRelative(0, 0)
            pl[1].placeRelative(cw + g, 0)
        }
    }
}

/** Hjem (telefon, 2 kolonner) i én Column med eget rutenett. [top] er bannere og 17. mai/Min reise over kortene. */
@Composable
internal fun HomeColumn70(
    vm: AppViewModel, mod: Modifier, pad: PaddingValues, secs0: List<PSec>,
    top: @Composable () -> Unit, skip: (String) -> Boolean, body: @Composable (String) -> Unit,
) {
    val secs = homeSecs52(secs0)
    val keys = secs.map { it.key }
    val edit = vm.editPage == PAGE70
    vm.b28.pageSecs[PAGE70] = secs.map { it.key to it.label }
    val order0 = vm.pageLayouts[PAGE70]?.order ?: emptyList()
    // «Fliser» var skjult i et lagret oppsett (og flisene er ikke plassert ennå): de fem er skjult også (som homeGridSecs52).
    val hid = vm.pageHidden(PAGE70).let { h -> if ("hm" in h && TILE_KEYS52.none { it in order0 }) h + TILE_KEYS52 else h }
    val shown0 = vm.pageOrder(PAGE70, keys).filter { it !in hid }
    val skip52: (String) -> Boolean = { k -> skip(k) || (k == "h3" && "h52av" in shown0) || (k == "h6" && "h52fa" in shown0) }
    val vis = shown0.filter { edit || !skip52(it) }
    val sz = vm.pageLayouts[PAGE70]?.sz ?: emptyMap()
    val rows = rows70(vis, sz)
    val st = remember { Home70State() }
    st.vis = vis; st.keys = keys; st.sz = sz
    val scroll = rememberScrollState()
    val dens = LocalDensity.current
    val scope = rememberCoroutineScope()
    AutoScroll70(st, scroll, vm)
    GlimtDone70(vm, st)
    val labels = remember(secs) { secs.associate { it.key to it.label } }
    val holdOk = remember(secs) { secs.filter { it.hold }.map { it.key }.toSet() }
    Box(
        mod.onGloballyPositioned { c ->
            st.coords = c
            val y = c.positionInRoot().y
            st.viewTop = y; st.viewBottom = y + c.size.height
            vm.p37.gridTop = y; vm.p37.gridBottom = y + c.size.height
        }.homeGesture70(vm, st, holdOk),
    ) {
        Column(
            Modifier.fillMaxSize().verticalScroll(scroll, enabled = st.dragKey == null).padding(pad),
            verticalArrangement = Arrangement.spacedBy(GAP70),
        ) {
            top()
            if (edit) WiggleSpace30(true, extra = (-GAP70))
            val count = vis.size
            rows.forEach { r ->
                key(r.id) {
                    val z = if (st.dragKey != null && st.dragKey in r.keys) 5f else 0f
                    when (r) {
                        is Row70.One -> Box(Modifier.fillMaxWidth().zIndex(z)) { Tile70(vm, st, r.k, labels[r.k] ?: r.k, vis.indexOf(r.k), count, true, body) }
                        is Row70.Two -> PairRow70(Modifier.fillMaxWidth().zIndex(z), 0.dp, zOf70(st, r.a), r.b?.let { zOf70(st, it) } ?: 0f,
                            { Tile70(vm, st, r.a, labels[r.a] ?: r.a, vis.indexOf(r.a), count, false, body) },
                            { r.b?.let { b -> Tile70(vm, st, b, labels[b] ?: b, vis.indexOf(b), count, false, body) } })
                        is Row70.Av -> PairRow70(Modifier.fillMaxWidth().zIndex(z), 212.dp, zOf70(st, r.k), if (r.nx.any { it == st.dragKey }) 5f else 0f,
                            { Tile70(vm, st, r.k, labels[r.k] ?: r.k, vis.indexOf(r.k), count, false, body) },
                            {
                                if (r.nx.isNotEmpty()) Column(Modifier.fillMaxWidth().fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(GAP70)) {
                                    r.nx.forEach { x -> Box(Modifier.fillMaxWidth().weight(1f).zIndex(zOf70(st, x))) { Tile70(vm, st, x, labels[x] ?: x, vis.indexOf(x), count, false, body) } }
                                }
                            })
                    }
                }
            }
            if (!edit) EditHint()
        }
        // Glimt svarte mens kortet var scrollet ut av syne: pillen over fanelinja scroller opp til svaret.
        AnimatedVisibility(
            Ans70.pill && vm.p31.ans != null,
            Modifier.align(Alignment.BottomCenter).padding(bottom = pad.calculateBottomPadding() - 8.dp),
            enter = fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 2 },
            exit = fadeOut(tween(140)) + slideOutVertically(tween(160)) { it / 2 },
        ) {
            val p = PaperPal.current
            Box(
                Modifier.height(36.dp).shadow(10.dp, CircleShape).clip(CircleShape).background(p.ink)
                    .clickable(role = Role.Button, onClickLabel = "Vis svaret fra Glimt") {
                        Haptics.select(); Ans70.pill = false
                        val r = Ans70.searchRect
                        scope.launch { if (r != null) scroll.animateScrollBy(r.top - st.viewTop - with(dens) { 12.dp.toPx() }) else scroll.animateScrollTo(0) }
                    }.padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Glimt svarte ↑", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
        }
    }
}

private fun zOf70(st: Home70State, k: String) = if (st.dragKey == k) 5f else 0f

/** Ett kort: vugging, løft/flytting (graphicsLayer, bare transform), − / ✎ / ↔ i wiggle. */
@Composable
private fun Tile70(vm: AppViewModel, st: Home70State, k: String, label: String, index: Int, count: Int, full: Boolean, body: @Composable (String) -> Unit) {
    val p = PaperPal.current
    val edit = vm.editPage == PAGE70
    val dragging = st.dragKey == k
    val sheet = vm.b27.homeSheet || vm.p37.h2Menu
    val reduce = reduceMotion45()
    val angle = wobbleAngle(edit && !dragging && !sheet && !reduce, index, 0.45f)
    val ghost = p.ink.copy(alpha = .07f)
    DisposableEffect(k) { onDispose { st.bounds.remove(k); st.ctl.remove("m$k"); st.ctl.remove("e$k"); st.ctl.remove("r$k") } }
    Box(
        Modifier.fillMaxWidth().fillMaxHeight()
            .onGloballyPositioned { c ->
                val r = Rect(c.positionInRoot(), Size(c.size.width.toFloat(), c.size.height.toFloat()))
                st.bounds[k] = r
                if (st.dragKey == k) st.dragTop = r.topLeft
            }
            // Plassen kortet ble løftet fra (dempet), tegnet utenfor laget så den blir stående.
            .drawBehind { if (dragging) drawRoundRect(ghost, cornerRadius = CornerRadius(24.dp.toPx())) }
            .graphicsLayer {
                if (st.dragKey == k) {
                    val t = st.finger - st.grab - st.dragTop
                    translationX = t.x; translationY = t.y
                    scaleX = 1.03f; scaleY = 1.03f
                    shadowElevation = 18.dp.toPx(); shape = RoundedCornerShape(24.dp); clip = false
                } else rotationZ = angle
            },
    ) {
        if (k in TILE_KEYS52 || k in HALF52 || k == "h5") Tile52(vm, k, Dp.Unspecified, body) else body(k)
        if (edit) {
            // Trykk inni kortet er av i wiggle (flytting og knappene styres av beholderen).
            Box(Modifier.matchParentSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {})
            if (count > 1) MinusDot28(label, Modifier.align(Alignment.TopStart).ctl70(st, "m$k", 10.dp)) { vm.hidePageItem(PAGE70, st.keys, k) }
            editWidgetAction28(vm, PAGE70, k)?.let { go -> EditWidgetPill28(Modifier.align(Alignment.Center).ctl70(st, "e$k", 4.dp), go) }
            if (!fixedFull70(k) && !dragging) ResizeHandle70(Modifier.align(Alignment.BottomEnd).offset(4.dp, 4.dp).ctl70(st, "r$k", 6.dp), label, full) {
                Haptics.select(); vm.setPageSz70(PAGE70, st.keys, k, if (full) "half" else "full", live = false)
            }
        }
    }
}

/** Knappen ↔ (34 dp): trykk og dra håndteres av beholderen (homeGesture70); her bare utseendet og tilgjengelighet. */
@Composable
private fun ResizeHandle70(modifier: Modifier, label: String, full: Boolean, onToggle: () -> Unit) {
    val p = PaperPal.current
    val desc = if (full) "Gjør $label halv bredde" else "Gjør $label full bredde"
    Box(
        modifier.size(34.dp).shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
            .semantics { role = Role.Button; contentDescription = desc; onClick(desc) { onToggle(); true } },
        contentAlignment = Alignment.Center,
    ) { WxIcon(RESIZE70, p.ink, 15.dp, stroke = 2.4f) }
}

/** Registrerer en knapp på kortet (litt større treffområde), så beholderen vet at trykket ikke er et løft. */
private fun Modifier.ctl70(st: Home70State, id: String, slack: Dp): Modifier = composed {
    val s = with(LocalDensity.current) { slack.toPx() }
    DisposableEffect(id) { onDispose { st.ctl.remove(id) } }
    this.onGloballyPositioned { c ->
        val o = c.positionInRoot()
        st.ctl[id] = Rect(o.x - s, o.y - s, o.x + c.size.width + s, o.y + c.size.height + s)
    }
}

/**
 * Hele gesten for Hjem på beholderen (Initial-passet, før scrollingen):
 *  - utenfor wiggle: hold 0,5 s på et kort → wiggle (slippet spises, så kortet ikke åpnes);
 *  - i wiggle: hold 0,3 s (< 8 dp) → løft og dra; ↔ → størrelse; − og ✎ får trykket selv; flytter fingeren seg før, er det scroll.
 */
private fun Modifier.homeGesture70(vm: AppViewModel, st: Home70State, holdOk: Set<String>): Modifier = composed {
    val hold by rememberUpdatedState(holdOk)
    this.pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            val toRoot: (Offset) -> Offset = { o -> st.coords?.takeIf { it.isAttached }?.localToRoot(o) ?: o }
            val pt = toRoot(down.position)
            val edit = vm.editPage == PAGE70
            val ctl = if (edit) st.ctl.entries.firstOrNull { it.value.contains(pt) }?.key else null
            if (ctl != null) {
                if (ctl.startsWith("r")) resize70(vm, st, ctl.drop(1), down.id, down.position)
                return@awaitEachGesture // − og ✎: vanlige knapper
            }
            val key = st.bounds.entries.firstOrNull { it.key in st.vis && it.value.contains(pt) }?.key ?: return@awaitEachGesture
            if (!edit && key !in hold) return@awaitEachGesture
            // Utenfor wiggle: langt trykk i søkefeltet (tekst, hold inne mikrofonen) eller på Glimt-svaret starter ikke wiggle.
            if (!edit && (Ans70.searchRect?.contains(pt) == true || vm.p38.ansRect?.contains(pt) == true)) return@awaitEachGesture
            val slop = 8.dp.toPx()
            var bail = false
            val waited = withTimeoutOrNull(if (edit) 300L else 500L) {
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val ch = ev.changes.firstOrNull { it.id == down.id }
                    if (ch == null || !ch.pressed || ev.changes.count { it.pressed } > 1 || (ch.position - down.position).getDistance() > slop) { bail = true; break }
                }
            }
            if (bail || waited != null) return@awaitEachGesture
            if (!edit) {
                // Hold 0,5 s → wiggle. Resten av berøringen spises (ingen åpning av kortet, ingen scroll).
                Haptics.tap(); vm.editPage = PAGE70
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    ev.changes.forEach { it.consume() }
                    if (ev.changes.none { it.pressed }) break
                }
                return@awaitEachGesture
            }
            val b = st.bounds[key] ?: return@awaitEachGesture
            st.grab = pt - b.topLeft
            st.dragTop = b.topLeft
            st.finger = pt
            st.lastTarget = null
            st.dragKey = key
            Haptics.tap()
            try {
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                    val moved = ch.positionChangeIgnoreConsumed()
                    ev.changes.forEach { it.consume() }
                    if (!ch.pressed) break
                    if (moved != Offset.Zero) { st.finger = toRoot(ch.position); hit70(vm, st) }
                }
            } finally {
                st.dragKey = null
                st.lastTarget = null
                vm.wiggleEnd37(PAGE70) // lagres én gang (disk + server)
                Haptics.select()
            }
        }
    }
}

/** Fingeren over et annet kort → kortet flyttes dit live (de andre glir unna). Maks hver 160 ms, ikke tilbake til samme kort med en gang. */
private fun hit70(vm: AppViewModel, st: Home70State) {
    val k = st.dragKey ?: return
    val now = android.os.SystemClock.uptimeMillis()
    val p = st.finger
    val t = st.bounds.entries.firstOrNull { it.key != k && it.key in st.vis && it.value.contains(p) }?.key
    if (t == null) { if (st.bounds[k]?.contains(p) != true) st.lastTarget = null; return }
    if (t == st.lastTarget || now - st.lastSwap < 160) return
    st.lastTarget = t; st.lastSwap = now
    vm.movePageTo70(PAGE70, st.keys, k, t, live = true)
    Haptics.select()
}

/** Håndtaket ↔: halv → full ved > 40 dp i alle retninger, full → halv ved > 40 dp innover/mot venstre; trykk bytter. Lagres ved slipp. */
private suspend fun androidx.compose.ui.input.pointer.AwaitPointerEventScope.resize70(vm: AppViewModel, st: Home70State, k: String, id: androidx.compose.ui.input.pointer.PointerId, start: Offset) {
    val full0 = isFull70(k, st.sz)
    var cur = full0
    var moved = false
    var acc = Offset.Zero
    val lim = 40.dp.toPx()
    val slop = 8.dp.toPx()
    try {
        while (true) {
            val ev = awaitPointerEvent(PointerEventPass.Initial)
            val ch = ev.changes.firstOrNull { it.id == id } ?: break
            acc = ch.position - start
            ev.changes.forEach { it.consume() }
            if (!ch.pressed) break
            if (acc.getDistance() > slop) moved = true
            if (!moved) continue
            val want = if (!full0) acc.getDistance() > lim else !(acc.x < -lim || (acc.getDistance() > lim && acc.x <= 0f && acc.y < 0f))
            if (want != cur) { cur = want; vm.setPageSz70(PAGE70, st.keys, k, if (cur) "full" else "half", live = true); Haptics.select() }
        }
    } finally {
        if (!moved) { cur = !full0; vm.setPageSz70(PAGE70, st.keys, k, if (cur) "full" else "half", live = true); Haptics.select() }
        vm.wiggleEnd37(PAGE70)
    }
}

/** Autoscroll mens et kort dras: fingeren innenfor 80 dp fra topp/bunn → opptil 9 dp per bilde. */
@Composable
private fun AutoScroll70(st: Home70State, scroll: ScrollState, vm: AppViewModel) {
    val dens = LocalDensity.current.density
    val k = st.dragKey
    LaunchedEffect(k) {
        if (k == null) return@LaunchedEffect
        val zone = 80f * dens
        while (st.dragKey != null) {
            val y = st.finger.y
            val d = when {
                y < st.viewTop + zone -> -((st.viewTop + zone - y) / zone).coerceIn(0f, 1f)
                y > st.viewBottom - zone -> ((y - (st.viewBottom - zone)) / zone).coerceIn(0f, 1f)
                else -> 0f
            }
            if (d != 0f) { runCatching { scroll.scrollBy(d * 9f * dens) }; hit70(vm, st) }
            withFrameNanos { }
        }
    }
}

/** Svaret ble ferdig mens kortet var ute av syne → lett haptikk og pillen «Glimt svarte ↑». Pillen forsvinner når kortet synes eller lukkes. */
@Composable
private fun GlimtDone70(vm: AppViewModel, st: Home70State) {
    val busy = vm.p31.ans?.busy == true
    var was by remember { mutableStateOf(busy) }
    LaunchedEffect(busy) {
        if (was && !busy && vm.p31.ans != null && !ansVisible70(vm)) { Haptics.tap(); Ans70.pill = true }
        was = busy
    }
    LaunchedEffect(Unit) {
        snapshotFlow { vm.p31.ans == null || ansVisible70(vm) }.collect { gone -> if (gone) Ans70.pill = false }
    }
}

/** Svarkortet synes (boundsInRoot er klippet, så et kort utenfor er 0 høyt). */
private fun ansVisible70(vm: AppViewModel): Boolean = (vm.p38.ansRect?.height ?: 0f) > 24f

/**
 * Trykk utenfor Glimt-svaret lukker det – uten lag over Hjem, så scroll virker hele tiden. Bare et trykk (< 8 dp), utenfor kortet og
 * søkefeltet, når svaret er ferdig og ingen fullskjermside ligger over. Trykket går videre til det som ligger under.
 */
internal fun Modifier.ansTapOutside70(vm: AppViewModel): Modifier = composed {
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    this.onGloballyPositioned { coords = it }.pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            if (vm.p31.ans == null || vm.p31.ans?.busy == true) return@awaitEachGesture
            val slop = 8.dp.toPx()
            var far = false
            var up = false
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                if ((ch.position - down.position).getDistance() > slop || ev.changes.size > 1) far = true
                if (!ch.pressed) { up = true; break }
            }
            if (!up || far) return@awaitEachGesture
            val a = vm.p31.ans ?: return@awaitEachGesture
            if (a.busy || overlays52(vm) > 0) return@awaitEachGesture
            val pt = coords?.takeIf { it.isAttached }?.localToRoot(down.position) ?: down.position
            if (vm.p38.ansRect?.contains(pt) == true || Ans70.searchRect?.contains(pt) == true) return@awaitEachGesture
            vm.closeAns31(); Haptics.dismiss()
        }
    }
}

/** Grepet nederst på svarkortet (30 dp): bare her starter sveip opp/dra ned (med mus fra hele kortet). */
internal fun gripHit70(type: PointerType, y: Float, height: Int, gripPx: Float): Boolean = type == PointerType.Mouse || y >= height - gripPx

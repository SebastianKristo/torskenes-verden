package no.kristo.finanshub.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChangeIgnoreConsumed
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics

/* ======================= Wiggle-modus (Hjem, Finans, Mat, Sporing, Finans → Mer) ======================= */

/** Pillene ligger 31 dp ned i innholdsområdet (8 dp under kanten som klippes når siden scrolles); listene får like mye luft øverst. */
internal val WIGGLE_TOP28 = 31.dp

@Composable
private fun Pill28(label: String, primary: Boolean, onClick: () -> Unit, content: @Composable RowScope.(Color) -> Unit) {
    val p = PaperPal.current
    val fg = if (primary) p.bg else p.ink
    Row(
        Modifier.height(40.dp).widthIn(min = 64.dp)
            .shadow(10.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(if (primary) p.ink else p.card).border(1.dp, if (primary) p.ink else p.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick).semantics { contentDescription = label }.padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) { content(fg) }
}

/** Raden med pillene: venstre (＋ N, ↺ Tilbakestill eller ingenting) og ✓ til høyre. */
@Composable
internal fun WiggleBar28(modifier: Modifier = Modifier, left: String?, hidden: Int = 0, onLeft: () -> Unit = {}, onDone: () -> Unit) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        when (left) {
            "add" -> Pill28("Legg til widget", false, onLeft) { c ->
                WxIcon(IC_PLUS28, c, 16.dp, stroke = 2.6f)
                if (hidden > 0) Text("$hidden", color = c, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            "reset" -> Pill28("Tilbakestill", false, onLeft) { c ->
                WxIcon(IC_RESET28, c, 15.dp, stroke = 2.4f)
                Text("Tilbakestill", color = c, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            else -> Spacer(Modifier.width(1.dp))
        }
        Pill28("Ferdig", true, onDone) { c -> WxIcon(IC_CHECK28, c, 18.dp, stroke = 2.8f) }
    }
}

/** Pillene for sidene med vm.editPage (Hjem, Finans, Mat: ＋ og ✓; Sporing: bare ✓), og «Legg til widget»-arket. */
@Composable
internal fun WigglePills28(vm: AppViewModel, modifier: Modifier = Modifier, showBar: Boolean = true) {
    val page = vm.editPage ?: return
    // Bare på siden som redigeres (ikke når en annen side, et skjema eller detaljer ligger øverst).
    val base = vm.paperPage == null && vm.original == null && vm.editing == null && vm.detail == null && vm.selectedTx == null
    val here = base && when (page) {
        "hjem" -> vm.screen == Screen.Homelab
        "finans" -> vm.screen == Screen.Home
        "mat" -> vm.screen == Screen.Mat
        "sporing" -> vm.screen == Screen.Tracking
        else -> false
    }
    if (!here) return
    val secs = vm.b28.pageSecs[page] ?: emptyList()
    val hidden = vm.pageHidden(page).count { h -> secs.any { it.first == h } }
    if (showBar) WiggleBar28(
        modifier, left = if (page == "sporing") null else "add", hidden = hidden,
        onLeft = { Haptics.select(); vm.b28.addWidgetFor = page },
        onDone = { Haptics.success(); vm.editPage = null },
    )
    if (vm.b28.addWidgetFor == page) AddWidgetSheet28(vm, page)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddWidgetSheet28(vm: AppViewModel, page: String) {
    val p = PaperPal.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val secs = vm.b28.pageSecs[page] ?: emptyList()
    val hid = vm.pageHidden(page)
    val list = secs.filter { it.first in hid }
    val close = { vm.b28.addWidgetFor = null }
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                PSerif("Legg til widget", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = close)
            }
            if (list.isEmpty()) Text("Alle widgets vises allerede. Trykk − på en widget for å skjule den.", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 14.sp,
                modifier = Modifier.padding(start = 4.dp, end = 4.dp, bottom = 8.dp))
            else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                list.forEachIndexed { i, (k, n) ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClickLabel = "Vis $n") {
                            vm.showPageItemLast28(page, secs.map { it.first }, k)
                            if (vm.pageHidden(page).none { h -> secs.any { it.first == h } }) close()
                        }.padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(n, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.5.sp, modifier = Modifier.weight(1f))
                        Box(Modifier.size(28.dp).clip(CircleShape).background(p.pos), contentAlignment = Alignment.Center) { WxIcon(IC_PLUS28, Color.White, 13.dp, stroke = 3f) }
                    }
                }
            }
        }
    }
}

/** Minus-sirkelen øverst til venstre på et kort (28, Papir: card, line-kant, ink −), 9 dp utenfor kanten. */
@Composable
internal fun MinusDot28(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.offset((-9).dp, (-9).dp).size(28.dp)
            .shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = "Skjul $label") { onClick() }.semantics { contentDescription = "Skjul $label" },
        contentAlignment = Alignment.Center,
    ) { WxIcon(IC_MINUS28, p.ink, 12.dp, stroke = 3.4f) }
}

/** «✎ Rediger widget» midt på kortet (32 høy, ink/bg). */
@Composable
internal fun EditWidgetPill28(modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        modifier.height(32.dp).shadow(8.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f)).clip(CircleShape).background(p.ink)
            .clickable(role = Role.Button, onClickLabel = "Rediger widget") { Haptics.select(); onClick() }.padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        WxIcon(IC_PEN28, p.bg, 13.dp, stroke = 2.2f)
        Text("Rediger widget", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}

/** ▲ ▼ i Papir-stil (card, line-kant, ink) – Sporing, til dra er på plass der. */
@Composable
internal fun UpDown28(text: String, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.size(30.dp).shadow(4.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .25f), spotColor = Color.Black.copy(alpha = .25f)).clip(CircleShape)
            .background(p.card).border(1.dp, p.line, CircleShape).alpha(if (enabled) 1f else .4f).clickable(enabled = enabled, role = Role.Button) { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(text, color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
}

/** Kortene på Hjem som har egne innstillinger («✎ Rediger widget»). */
internal fun editWidgetAction28(vm: AppViewModel, page: String, key: String): (() -> Unit)? = when {
    page == "hjem" && key == "h3" -> ({ vm.b27.homeSheet = true })
    page == "hjem" && key == "h2" -> ({ vm.p37.h2Menu = true }) // prompt 37: vis bare når det er pakker, 1–3 pakker
    else -> null
}

/** Luft øverst i innholdet i wiggle-modus (64 dp), så verktøylinja aldri dekker første kort eller minus-merket. */
// Prompt 32: knapperaden (＋ / ✓, 40 dp) står 8 dp under papirkanten (WIGGLE_TOP28 = 31 dp i laget som ligger 23 dp opp i bildet);
// første widget og «−»-merket (9 dp opp) starter med luft under den: 31 + 40 + 26 = 97 dp. Klippes 14 dp under knappene når man scroller.
internal val WIGGLE_PAD30: Dp = 97.dp

internal val WIGGLE_CLIP32B: Dp = 85.dp

/** 0 → 64 dp på 280 ms når redigeringen slås på, og tilbake når man trykker ✓. */
@Composable
internal fun WiggleSpace30(on: Boolean, extra: Dp = 0.dp) {
    // Starter alltid på 0, så luften også animeres inn når raden nettopp er lagt til (rutenettene).
    val a = remember { Animatable(0f) }
    // Prompt 45: på brett ingen ekstra toppmarg (knappene ligger i sidelinja), bare litt luft så «−»-merket ikke klippes.
    val target = if (!on) 0f else if (LocalWide45.current) 14f else (WIGGLE_PAD30 + extra).value
    LaunchedEffect(target) { a.animateTo(target, tween(280, easing = EASE30)) }
    if (a.value > .5f) Spacer(Modifier.height(a.value.dp))
}

/* ======================= Wiggle ======================= */

/**
 * Som holdDrag (500 ms, 8 dp slop, resten av berøringen spises), men gir pekerens posisjon i rotkoordinater (x og y),
 * så midtre 30 %-testen også virker i to kolonner på Fold.
 */
internal fun Modifier.holdDrag37(
    enabled: Boolean,
    onLong: () -> Unit,
    onDrag: (Offset) -> Unit,
    onEnd: () -> Unit,
    toRoot: (Offset) -> Offset,
    /** Prompt 39: i redigeringsmodus starter draget etter 170 ms (flytter fingeren seg før det, er det scroll). Leses ved hver
     *  ny berøring (ikke nøkkel i pointerInput, ellers ville draget som starter redigeringen blitt avbrutt). */
    holdMs: () -> Long = { 500L },
    /** Prompt 40: false → det lange trykket åpner bare redigeringsmodus; resten av berøringen er scroll (ingen dra). */
    startDrag: () -> Boolean = { true },
    /** Prompt 40: avstand før ventende dra avbrytes (6 dp i redigering, ellers 8 dp). */
    slopDp: () -> Float = { 8f },
): Modifier = if (!enabled) this else this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val slop = slopDp().dp.toPx()
        val drag = startDrag()
        var moved = false
        val released = withTimeoutOrNull(holdMs()) {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull true
                if (!ch.pressed) return@withTimeoutOrNull true
                if ((ch.position - down.position).getDistance() > slop) { moved = true; return@withTimeoutOrNull true }
                // Prompt 45: to fingre = scroll (siden kan alltid scrolles med to fingre i wiggle-modus).
                if (ev.changes.count { it.pressed } > 1) { moved = true; return@withTimeoutOrNull true }
            }
            @Suppress("UNREACHABLE_CODE") true
        }
        if (released != null || moved) return@awaitEachGesture
        onLong()
        if (!drag) {
            // Bare redigeringsmodus: fingeren kan scrolle videre. Slippes den uten å flytte seg, spises slippet så kortets
            // klikk (åpne siden) ikke går gjennom etter det lange trykket.
            var far = false
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                if ((ch.position - down.position).getDistance() > slop) far = true
                if (!ch.pressed) { if (!far) ch.consume(); break }
            }
            return@awaitEachGesture
        }
        try {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                // Prompt 45 (claude-code-wiggle-android-dra.md), DEN EKTE ÅRSAKEN: før ble alle endringer konsumert og SÅ ble
                // positionChange() lest. På en konsumert endring returnerer positionChange() alltid Offset.Zero, så onDrag ble aldri
                // kalt: kortet ble «løftet» (skala/alpha), men fulgte aldri fingeren og byttet aldri plass. Nå leses bevegelsen først.
                val mv45 = ch.positionChangeIgnoreConsumed()
                ev.changes.forEach { it.consume() }
                if (!ch.pressed) break
                if (mv45 != Offset.Zero) onDrag(runCatching { toRoot(ch.position) }.getOrDefault(ch.position))
            }
        } finally { onEnd() }
    }
}

/** Grensene til Hjem-listen (for auto-scroll nær topp og bunn). */
internal fun Modifier.gridBounds37(vm: AppViewModel): Modifier = this.onGloballyPositioned { c ->
    val y = c.positionInRoot().y
    vm.p37.gridTop = y
    vm.p37.gridBottom = y + c.size.height
}

/** Auto-scroll mens et kort dras nær kanten: maks 12 dp per bilde. */
@Composable
internal fun WiggleScroll37(vm: AppViewModel, state: LazyGridState) {
    val on = vm.p37.edgeDir != 0f
    val dens = androidx.compose.ui.platform.LocalDensity.current.density
    LaunchedEffect(on) {
        if (!on) return@LaunchedEffect
        while (true) {
            val d = vm.p37.edgeDir
            if (d == 0f) break
            runCatching { state.scrollBy(d * 12f * dens) }
            withFrameNanos { }
        }
    }
}

private val GRAY37 = Paint().apply { colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) }

/** Gråtone (kort som er skjult utenfor redigeringsmodus). */
internal fun Modifier.gray37(on: Boolean): Modifier = if (!on) this else this.drawWithContent {
    drawIntoCanvas { c -> c.saveLayer(Rect(Offset.Zero, size), GRAY37); drawContent(); c.restore() }
}

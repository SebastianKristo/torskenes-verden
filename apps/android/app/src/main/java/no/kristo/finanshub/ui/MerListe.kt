package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight

/* ======================= Mer: hold inne for å flytte og skjule ======================= */

internal class MerItem28(val key: String, val title: String, val sub: String, val index: Int, val go: () -> Unit)

/** Mer i Papir: vanlig liste, eller redigeringsmodus etter langt trykk (0,48 s). Lagres per konto (/api/prefs/mer). */
@Composable
internal fun MerList28(vm: AppViewModel, rows: List<MerItem28>, navBottom: Dp, barSpace: Dp) {
    val p = PaperPal.current
    val s = vm.b28
    LaunchedEffect(vm.account?.id, vm.base) { vm.loadMer28() }
    // Ut av siden: redigeringen avsluttes.
    DisposableEffect(Unit) { onDispose { s.merEdit = false } }
    val sorted = merSort28(s.mer, rows) { it.key }
    val hidSet = s.mer.h.toSet()
    val vis = sorted.filter { it.key !in hidSet || it.key == "innst" }
    val hid = sorted.filter { it.key in hidSet && it.key != "innst" }
    val edit = s.merEdit
    var drag by remember { mutableStateOf<String?>(null) }
    var dy by remember { mutableFloatStateOf(0f) }
    var work by remember { mutableStateOf<List<String>?>(null) }
    val heights = remember { HashMap<String, Int>() }
    val visKeys = work ?: vis.map { it.key }
    // Dra-håndtakene lever på tvers av rekomponeringer: les gjeldende rekkefølge og skjulte derfra.
    val visNow by rememberUpdatedState(vis.map { it.key })
    val hidNow by rememberUpdatedState(hid.map { it.key })
    val byKey = rows.associateBy { it.key }
    BackHandler(enabled = edit) { s.merEdit = false; drag = null; work = null }
    fun hide(k: String) {
        Haptics.select()
        val o = if (s.mer.o.isEmpty()) vis.map { it.key } + hid.map { it.key } else s.mer.o
        vm.saveMer28(MerPref28(o, s.mer.h + k))
    }
    fun show(k: String) { Haptics.select(); vm.saveMer28(s.mer.copy(h = s.mer.h - k)) }
    // Prompt 30: samme wiggle som Hjem: separate kort som vugger, minus-/lås-merke, ＋ N · ✓ som flytende verktøylinje og 64 dp luft.
    val wobble = rememberInfiniteTransition(label = "merWob").animateFloat(-1f, 1f, infiniteRepeatable(tween(300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "w")
    val add30 = vm.p30.merAdd && hid.isNotEmpty()
    DisposableEffect(Unit) { onDispose { vm.p30.merAdd = false } }
    MerLoad44(vm) // prompt 44: data til de levende kortene
    BoxWithConstraints(Modifier.fillMaxSize()) {
    val wide44 = maxWidth >= 600.dp
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, barSpace + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!edit) {
            // Prompt 44 (claude-code-mer-ny-design.md): søk, levende kort (Store) eller én liste (Lave), Innstillinger nederst (ui/Mer44.kt).
            mer44(vm, vis, wide44, onLong = { Haptics.tap(); s.merEdit = true })
            return@LazyColumn
        }
        item(key = "mer-space") { WiggleSpace30(true, extra = (-10).dp) }
        item(key = "mer-tsz") { MerSize44(vm) } // prompt 44: Store · Lave bare i wiggle-redigering
        item(key = "mer52-hid") { MerHideRow52(vm, "mer", "Tittel") } // prompt 52: Søkefelt · Tittel · Verktøy
        item(key = "mer45-ed") { MerEdit45(vm, rows) } // prompt 45: tittel (− / gi nytt navn / + Legg til tittel) og de fire store boksene (⇄ Bytt)
        itemsIndexed(visKeys, key = { _, k -> "mer-$k" }) { i, k ->
            val r = byKey[k] ?: return@itemsIndexed
            val on = drag == k
            val shape = RoundedCornerShape(18.dp)
            // Prompt 45: samme dra-logikk fra håndtaket (≡, med en gang) og fra hele kortet (trykk, hold 150 ms og dra).
            val start45 = { drag = k; dy = 0f; work = visNow; Haptics.select() }
            val end45 = { drag = null; dy = 0f; work?.let { w -> vm.saveMer28(s.mer.copy(o = w + hidNow)) }; work = null }
            val move45: (Float) -> Unit = { amountY ->
                dy += amountY
                val l = (work ?: visNow).toMutableList()
                val at = l.indexOf(k)
                val h = (heights[k] ?: 140).toFloat()
                val sw = when { dy > h / 2 && at in 0 until l.size - 1 -> 1; dy < -h / 2 && at > 0 -> -1; else -> 0 }
                val now37 = android.os.SystemClock.uptimeMillis()
                if (sw != 0 && now37 - vm.p37.lastSw >= 140) {
                    vm.p37.lastSw = now37
                    val o = l[at + sw]; l[at + sw] = k; l[at] = o
                    dy -= sw * (heights[o] ?: h.toInt())
                    work = l
                    Haptics.select()
                }
            }
            Box(
                Modifier.fillMaxWidth().then(if (on) Modifier else Modifier.animateItem(fadeInSpec = null, fadeOutSpec = null, placementSpec = tween(180)))
                    .zIndex(if (on) 5f else 0f)
                    .graphicsLayer {
                        translationY = if (on) dy else 0f
                        val sc = if (on) 1.02f else 1f; scaleX = sc; scaleY = sc
                        rotationZ = if (on) 0f else wobble.value * (if (i % 2 == 0) .45f else -.45f)
                    }
                    .onSizeChanged { heights[k] = it.height }
                    .holdDragDelta45(start45, move45, end45),
            ) {
                Row(
                    Modifier.fillMaxWidth().shadow(if (on) 18.dp else 8.dp, shape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                        .clip(shape).background(p.card).padding(start = 14.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    MerIcon25(vm, r.index, r.key)
                    Column(Modifier.weight(1f)) {
                        PSerif(r.title, 19.sp, maxLines = 1)
                        Text(r.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Box(
                        Modifier.size(44.dp).semantics { contentDescription = "Flytt ${r.title}" }.pointerInput(k) {
                            detectDragGestures(
                                onDragStart = { start45() },
                                onDragEnd = { end45() },
                                onDragCancel = { end45() },
                            ) { ch, amount ->
                                ch.consume()
                                // Prompt 37 (krasjfiksen): maks ett bytte per 140 ms; lagres først ved slipp.
                                move45(amount.y)
                            }
                        },
                        contentAlignment = Alignment.Center,
                    ) { WxIcon(IC_GRIP28, p.mut, 20.dp, stroke = 2f) }
                }
                if (!on) {
                    if (k == "innst") LockDot30(Modifier.align(Alignment.TopStart))
                    else MinusDot28(r.title, Modifier.align(Alignment.TopStart)) { hide(k) }
                }
            }
        }
        if (add30) {
            item(key = "mer-hid-label") {
                Text("SKJULT · TRYKK + FOR Å VISE", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp, letterSpacing = 1.4.sp,
                    modifier = Modifier.padding(start = 4.dp, top = 8.dp))
            }
            itemsIndexed(hid, key = { _, r -> "mer-h-${r.key}" }) { _, r ->
                Box(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().shadow(8.dp, RoundedCornerShape(18.dp), ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                            .clip(RoundedCornerShape(18.dp)).background(p.card).clickable(role = Role.Button, onClickLabel = "Vis ${r.title}") { show(r.key) }
                            .padding(horizontal = 14.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.alpha(.5f)) { MerIcon25(vm, r.index, r.key) }
                        Column(Modifier.weight(1f).alpha(.5f)) {
                            PSerif(r.title, 19.sp, maxLines = 1)
                            Text(r.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    PlusDot30("Vis ${r.title}", Modifier.align(Alignment.TopStart)) { show(r.key) }
                }
            }
        }
    }
    if (edit && !LocalWide45.current) WiggleBar28( // prompt 45: på brett ligger knappene i sidelinja
        Modifier.align(Alignment.TopCenter).padding(top = 8.dp), left = if (hid.isNotEmpty()) "add" else null, hidden = hid.size,
        onLeft = { vm.p30.merAdd = !vm.p30.merAdd; Haptics.select() },
        onDone = { Haptics.success(); s.merEdit = false; vm.p30.merAdd = false; drag = null; work = null },
    )
    }
}

/** Vanlig rad: kort trykk åpner, hold inne 0,48 s (uten å flytte > 8 dp) → redigeringsmodus; slipp etter det åpner ikke. */
@Composable
internal fun MerRowNormal28(vm: AppViewModel, r: MerItem28, top: Boolean, onLong: () -> Unit) {
    val p = PaperPal.current
    var pressed by remember { mutableStateOf(false) }
    val go by rememberUpdatedState(r.go)
    val long by rememberUpdatedState(onLong)
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().alpha(if (pressed) .6f else 1f).semantics { contentDescription = r.title }
                .pointerInput(r.key) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        pressed = true
                        val slop = 8.dp.toPx()
                        val res = withTimeoutOrNull(480L) {
                            while (true) {
                                val ev = awaitPointerEvent()
                                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull 2
                                if (!ch.pressed) return@withTimeoutOrNull if (ch.isConsumed) 2 else 1
                                if ((ch.position - down.position).getDistance() > slop) return@withTimeoutOrNull 2
                            }
                            @Suppress("UNREACHABLE_CODE") 2
                        }
                        pressed = false
                        when (res) {
                            null -> {
                                long()
                                // Resten av trykket spises, så slippet ikke åpner modulen.
                                while (true) {
                                    val ev = awaitPointerEvent()
                                    ev.changes.forEach { it.consume() }
                                    if (ev.changes.none { it.pressed }) break
                                }
                            }
                            1 -> { Haptics.select(); go() }
                            else -> {}
                        }
                    }
                }
                .padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MerIcon25(vm, r.index, r.key)
            Column(Modifier.weight(1f)) {
                PSerif(r.title, 19.sp, maxLines = 1)
                Text(r.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = p.mut, modifier = Modifier.size(20.dp))
        }
    }
}

/* ---------------- Strekikoner fra designet (Mobil Papir App → Mer), 24 × 24 ---------------- */

internal const val P25_HOUSE = "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"

private val MER_PATHS25: Map<String, String> = mapOf(
    "hjem" to P25_HOUSE,
    // Prompt 46: Kart (holdeplasser, sanntid og soner) og «Logg inn på annen enhet» (QR).
    "tkart" to "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
    "skjold" to "M4 3h16v18H4zM4 9h16M4 15h16M12 3v18M7 6h2M15 6h2M7 12h2M15 12h2M7 18h2M15 18h2", // prompt 76: Skjold Lab (skuffeskap)
    "qrlogin" to "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M17 17h.01",
    "brief" to "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 3v3M20.5 4.5h-3", // prompt 36: ✦ Now Brief
    "domener" to "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    "sporing" to "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
    "bursdag" to "M4 11h16v9H4zM2 7h20v4H2zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z",
    "kalender" to "M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.01M8 17h2",
    "studie" to "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6", // prompt 44: Studie (studenthatt)
    "chat" to "M4 5h16v11H9l-5 4zM9 10.5h6",
    "huske" to "M4 4h16v16H4zM8 12l3 3 5-6", // prompt 37: ☑ Gjøremål
    "bibel" to "M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 7v7M8.5 9.5h5", // prompt 37: Bibel
    "kart" to "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    "media" to "M5 4l14 8-14 8z",
    "finans" to "M3 6h18v12H3zM3 10h18M7 15h4",
    "abo" to "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3", // Prompt 28: Subscription OS (to piler i ring)
    "rss" to "M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 18h.01",
    "innst" to "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
)

/** Ikonet til venstre i Mer: 40 × 40 (radius 12, papirfarge) med strekikon 21 (strek 1,9) i fargen fra ikonpaletten. */
@Composable
internal fun MerIcon25(vm: AppViewModel, i: Int, key: String) {
    val p = PaperPal.current
    val pal = iconPalette(vm.iconTheme)
    val c = Color(pal[((i % pal.size) + pal.size) % pal.size])
    // Prompt 40: Økonomi-ikon 3c (hvit lommebok med budsjettring på #1B2A40) for Finans.
    if (key == "finans") { Okonomi40Icon(40.dp, 12.dp); return }
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(p.bg), contentAlignment = Alignment.Center) {
        WxIcon(MER_PATHS25[key] ?: "M12 12h.01", c, 21.dp, stroke = 1.9f)
    }
}

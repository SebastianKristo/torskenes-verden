package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/*
 * Prompt 39 (ANDROID39):
 *  - Yr mot Storm 2a (claude-code-vaer-yr-storm-2a-rediger.md, fasit Yr mot Storm Design.dc.html → 2a): himmel og glasskort fra 1b,
 *    duell-topp og midtstilte avvikssøyler fra 1a, enighet og Glimt-forklaring fra 1c. Kortene (hero, agree, glimt, list, chart,
 *    rain) kan wiggle-redigeres som Hjem: hold 480 ms → vugging, «−» skjuler, dra (170 ms hold i redigering) bytter plass,
 *    stiplet boks med skjulte kort. Lagres som vs_cmp_layout {ord, hid} lokalt og i /api/me/layout.
 *    Størrelsesfiksen: alle kort fyller full bredde (ingen innpakning i rad-retning).
 *  - «Glimt · ukas vær» (claude-code-vaer-glimt-ukas-vaer.md) nederst i Vær: GET /api/weather/week-summary?place=&char=.
 */

/* ======================= Yr mot Storm 2a ======================= */

private val SKY_Y39 = Color(0xFF7FD6F5)
private val SKY_S39 = Color(0xFFFFB27A)
private val GLASS39 = Color.White.copy(alpha = .1f)
private val EASE39 = CubicBezierEasing(.2f, .8f, .2f, 1f)
private val CMP_KEYS39 = listOf("hero", "agree", "glimt", "list", "chart", "rain")
private val CMP_NAMES39 = mapOf("hero" to "Dagens duell", "agree" to "Enighet", "glimt" to "Glimt forklarer", "list" to "Dag for dag", "chart" to "Neste 24 timer", "rain" to "Nedbør per dag")

/** Én dag: Yr og Storm side om side. */
private data class CmpD39(
    val d: String, val yH: Double?, val yL: Double?, val yP: Double, val yW: Double?, val sH: Double?, val sL: Double?, val sP: Double?, val sW: Double?,
) {
    val dT: Double? get() = if (yH != null && sH != null) yH - sH else null
    val ok: Boolean get() = (dT?.let { abs(it) < 2 } ?: true) && (sP == null || wet(yP) == wet(sP))
}

private fun wet(mm: Double) = mm >= .5
private fun deg39(v: Double?) = v?.let { "${it.roundToInt()}°" } ?: "–"
private fun mm39(v: Double?) = v?.let { if (it >= 10) "${it.roundToInt()}" else wxF1(it) } ?: "–"
private fun ms39(v: Double?) = v?.let { "${it.roundToInt()} m/s" } ?: "– m/s"

private fun days39(vm: AppViewModel, w: WeatherFull): List<CmpD39> {
    val c = vm.wxCmp22
    val by = c?.days?.associateBy { it.date.take(10) } ?: emptyMap()
    return w.days.take(7).mapIndexed { k, d ->
        val x = by[d.date.take(10)]
        CmpD39(
            if (k == 0) "I dag" else wxLd(d.date)?.let(::wxWd) ?: "",
            x?.yr?.max ?: d.hi, x?.yr?.min ?: d.lo, x?.yr?.precip ?: d.precipSum ?: 0.0, d.windMax,
            x?.pent?.max, x?.pent?.min, x?.pent?.precip, null,
        )
    }
}

/** Oppsettet: rekkefølge og skjulte kort (standard: chart og rain skjult). */
data class CmpLayout39(val ord: List<String>, val hid: Set<String>) {
    fun json(): JSONObject = JSONObject().put("ord", JSONArray(ord)).put("hid", JSONObject().apply { hid.forEach { put(it, true) } })
    companion object {
        val DEFAULT = CmpLayout39(CMP_KEYS39, setOf("chart", "rain"))
        fun parse(o: JSONObject?): CmpLayout39? {
            o ?: return null
            val a = o.optJSONArray("ord") ?: return null
            val ord = (0 until a.length()).map { a.optString(it) }.filter { it in CMP_KEYS39 }.distinct()
            val full = ord + CMP_KEYS39.filter { it !in ord }
            val h = o.optJSONObject("hid")
            val hid = CMP_KEYS39.filter { h?.optBoolean(it, false) == true }.toSet()
            return CmpLayout39(full, hid)
        }
    }
}

private fun AppViewModel.cmpKey39() = "vs_cmp_layout39_" + (account?.id ?: "")

/** Lokalt først, så /api/me/layout (vs_cmp_layout). */
private fun AppViewModel.loadCmpLayout39(set: (CmpLayout39) -> Unit) {
    runCatching { CmpLayout39.parse(JSONObject(prefs.str(cmpKey39(), ""))) }.getOrNull()?.let(set)
    launch39 {
        val raw = runCatching { api39 { hlGet("/me/layout", timeout = 6_000) } }.getOrNull() ?: return@launch39
        val l = runCatching { CmpLayout39.parse(JSONObject(raw).optJSONObject("vs_cmp_layout")) }.getOrNull() ?: return@launch39
        prefs.set(cmpKey39(), l.json().toString())
        set(l)
    }
}

private fun AppViewModel.saveCmpLayout39(l: CmpLayout39) {
    prefs.set(cmpKey39(), l.json().toString())
    launch39 { runCatching { api39 { hlPut("/me/layout", JSONObject().put("vs_cmp_layout", l.json())) } } }
}

@Composable
internal fun CmpSheet39(vm: AppViewModel, w: WeatherFull, close: () -> Unit) {
    var lay by remember { mutableStateOf(CmpLayout39.DEFAULT) }
    var edit by remember { mutableStateOf(false) }
    var dragKey by remember { mutableStateOf<String?>(null) }
    var dragDy by remember { mutableFloatStateOf(0f) }
    var edge by remember { mutableFloatStateOf(0f) }
    val tops = remember { mutableStateMapOf<String, Pair<Float, Float>>() }
    val start = remember { floatArrayOf(Float.NaN, 0f) } // fingerens start-y, kortets top ved start
    val scroll = rememberScrollState()
    val dens = LocalDensity.current.density
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    LaunchedEffect(vm.account?.id) { vm.loadCmpLayout39 { lay = it } }
    BackHandler { if (edit) edit = false else close() }
    // Auto-scroll mens et kort dras nær kanten.
    LaunchedEffect(edge != 0f) {
        while (edge != 0f) { runCatching { scroll.scrollBy(edge * 9f * dens) }; withFrameNanos { } }
    }
    val days = days39(vm, w)
    val vis = lay.ord.filter { it !in lay.hid }
    fun update(l: CmpLayout39, save: Boolean) { lay = l; if (save) vm.saveCmpLayout39(l) }
    Box(Modifier.fillMaxSize().zIndex(22f).background(Brush.verticalGradient(0f to Color(0xFF3A5A80), .45f to Color(0xFF22395A), 1f to Color(0xFF16243A)))
        .clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.TopCenter) {
        var viewTop by remember { mutableFloatStateOf(0f) }
        var viewH by remember { mutableFloatStateOf(1f) }
        Column(
            Modifier.widthIn(max = 760.dp).fillMaxWidth().fillMaxHeight()
                .onGloballyPositioned { c -> viewTop = c.positionInRoot().y; viewH = c.size.height.toFloat() }
                .verticalScroll(scroll).navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = top + 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Tittelraden og kildeteksten er faste.
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Yr mot Storm", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Text(listOfNotNull(w.place, w.updatedAt?.let { u -> wxLdt(u)?.let { "oppdatert %02d:%02d".format(it.hour, it.minute) } }).joinToString(" · "),
                        color = Color.White.copy(alpha = .75f), fontSize = 13.5.sp)
                }
                Box(
                    Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (edit) Color.White else Color.White.copy(alpha = .2f))
                        .clickable(role = Role.Button) { Haptics.select(); if (edit) edit = false else close() }.padding(horizontal = 15.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Ferdig", color = if (edit) Color(0xFF22395A) else Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            }
            if (edit) Text("Dra kortene for å flytte · − for å skjule", color = Color.White.copy(alpha = .8f), fontSize = 12.5.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            if (vm.wxCmp22Busy) Text("Henter Storm-data …", fontSize = 13.sp, color = Color.White.copy(alpha = .7f))
            if (vm.wxCmp22 == null && vm.wxCmp22Failed) Text("Storm svarte ikke. Prøv igjen senere.", fontSize = 13.sp, color = Color.White.copy(alpha = .7f))
            vis.forEachIndexed { i, k -> key(k) {
                val dragging = dragKey == k
                val coords = remember { arrayOfNulls<androidx.compose.ui.layout.LayoutCoordinates>(1) }
                val flip = remember { Animatable(0f) }
                val scope = rememberCoroutineScope()
                var lastTop by remember { mutableFloatStateOf(Float.NaN) }
                val angle = wobbleAngle(edit && !dragging, i, 0.5f)
                Box(
                    Modifier.fillMaxWidth().zIndex(if (dragging) 5f else 0f)
                        .onGloballyPositioned { c ->
                            val y = c.positionInRoot().y
                            val h = c.size.height.toFloat()
                            if (!dragging) {
                                // FLIP: de andre kortene glir til ny plass (260 ms).
                                val old = lastTop
                                if (!old.isNaN() && abs(old - y) > 1f && dragKey != null) scope.launch { flip.snapTo(old - y + flip.value); flip.animateTo(0f, tween(260, easing = EASE39)) }
                            }
                            lastTop = y
                            tops[k] = y to h
                        }
                        .graphicsLayer {
                            rotationZ = angle
                            translationY = if (dragging) dragDy - ((tops[k]?.first ?: start[1]) - start[1]) else flip.value
                            val sc = if (dragging) 1.03f else 1f; scaleX = sc; scaleY = sc
                        }
                        .then(if (dragging) Modifier.shadow(18.dp, RoundedCornerShape(24.dp)) else Modifier)
                        // Koordinatene etter flyttingen (pekeren er i det flyttede laget).
                        .onGloballyPositioned { c -> coords[0] = c }
                        .holdDrag37(true,
                            onLong = {
                                Haptics.tap(); edit = true; dragKey = k; dragDy = 0f; start[0] = Float.NaN
                                start[1] = tops[k]?.first ?: 0f
                            },
                            onDrag = { pt ->
                                if (start[0].isNaN()) start[0] = pt.y
                                dragDy = pt.y - start[0]
                                // Auto-scroll innenfor 80 dp fra kanten.
                                val zone = 80f * dens
                                edge = when { pt.y < viewTop + zone -> -1f; pt.y > viewTop + viewH - zone -> 1f; else -> 0f }
                                val v = lay.ord.filter { it !in lay.hid }
                                val idx = v.indexOf(k)
                                val h0 = tops[k]?.second ?: return@holdDrag37
                                val cy = start[1] + dragDy + h0 / 2
                                var j = idx
                                if (idx > 0) tops[v[idx - 1]]?.let { (pt0, ph) -> if (cy < pt0 + ph / 2) j = idx - 1 }
                                if (j == idx && idx < v.size - 1) tops[v[idx + 1]]?.let { (nt, nh) -> if (cy > nt + nh / 2) j = idx + 1 }
                                if (j != idx) {
                                    val v2 = v.toMutableList(); v2.removeAt(idx); v2.add(j, k)
                                    Haptics.select()
                                    update(CmpLayout39(v2 + lay.ord.filter { it in lay.hid }, lay.hid), false)
                                }
                            },
                            onEnd = { dragKey = null; dragDy = 0f; edge = 0f; update(lay, true) },
                            toRoot = { o -> coords[0]?.takeIf { it.isAttached }?.localToRoot(o) ?: o },
                            holdMs = { if (edit) 170L else 480L },
                        ),
                ) {
                    Column(Modifier.fillMaxWidth()) { CmpCard39(vm, w, k, days) }
                    if (edit) {
                        Box(Modifier.matchParentSize().clickable(remember { MutableInteractionSource() }, null) {})
                        Box(
                            Modifier.align(Alignment.TopStart).offset((-7).dp, (-7).dp).size(26.dp).shadow(6.dp, CircleShape).clip(CircleShape).background(Color(0xFF0F1B2B))
                                .clickable(role = Role.Button, onClickLabel = "Skjul ${CMP_NAMES39[k]}") { Haptics.select(); update(lay.copy(hid = lay.hid + k), true) },
                            contentAlignment = Alignment.Center,
                        ) { Text("−", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp) }
                    }
                }
            } }
            val hidden = lay.ord.filter { it in lay.hid }
            if (edit && hidden.isNotEmpty()) Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).border(1.5.dp, Color.White.copy(alpha = .35f), RoundedCornerShape(22.dp)).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("LEGG TIL KORT", color = Color.White.copy(alpha = .65f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                hidden.forEach { k ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button) {
                        Haptics.select()
                        val v = lay.ord.filter { it !in lay.hid } + k
                        update(CmpLayout39(v + lay.ord.filter { it in lay.hid && it != k }, lay.hid - k), true)
                    }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(24.dp).clip(CircleShape).background(Color(0xFF2F9E5B)), contentAlignment = Alignment.Center) { Text("+", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
                        Text(CMP_NAMES39[k] ?: k, color = Color.White, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Text("Yr er MET Norway (api.met.no). Storm (StormGeo) har ikke et åpent API, så Storm viser ECMWF-modellen fra Open-Meteo, som er nærmeste åpne kilde.",
                fontSize = 12.sp, color = Color.White.copy(alpha = .6f), lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
        }
    }
    DisposableEffect(Unit) { onDispose { edge = 0f } }
}

private fun Modifier.glass39(r: Int = 22): Modifier = this.clip(RoundedCornerShape(r.dp)).background(GLASS39).border(1.dp, Color.White.copy(alpha = .08f), RoundedCornerShape(r.dp))

@Composable
private fun CmpCard39(vm: AppViewModel, w: WeatherFull, k: String, days: List<CmpD39>) {
    when (k) {
        "hero" -> Hero39(days.firstOrNull())
        "agree" -> Agree39(days)
        "glimt" -> GlimtWhy39(days)
        "list" -> List39(days)
        "chart" -> Chart39(vm, w)
        "rain" -> Rain39(days)
    }
}

@Composable
private fun Hero39(t: CmpD39?) {
    t ?: return
    Row(Modifier.fillMaxWidth().glass39(26), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).background(Brush.verticalGradient(listOf(SKY_Y39.copy(alpha = .18f), Color.Transparent))).padding(18.dp, 18.dp, 12.dp, 16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) { BrandLogo30("yr", 20.dp); Text("YR", color = Color(0xFF9FE3FF), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp) }
            Text(deg39(t.yH), color = Color.White, fontSize = 52.sp, fontWeight = FontWeight.Light, lineHeight = 54.sp, maxLines = 1)
            Text("${mm39(t.yP)} mm · ${ms39(t.yW)}", color = Color.White.copy(alpha = .8f), fontSize = 13.sp, maxLines = 1)
        }
        val d = if (t.sH != null && t.yH != null) (t.sH - t.yH).roundToInt() else null
        Text(d?.let { (if (it > 0) "+" else "") + "$it°" } ?: "–", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1,
            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xFF2C4869)).border(1.dp, Color.White.copy(alpha = .14f), RoundedCornerShape(12.dp)).padding(9.dp, 5.dp))
        Column(Modifier.weight(1f).background(Brush.verticalGradient(listOf(SKY_S39.copy(alpha = .18f), Color.Transparent))).padding(12.dp, 18.dp, 18.dp, 16.dp),
            horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) { Text("STORM", color = Color(0xFFFFC79E), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.2.sp); BrandLogo30("storm", 20.dp) }
            Text(deg39(t.sH), color = Color.White, fontSize = 52.sp, fontWeight = FontWeight.Light, lineHeight = 54.sp, maxLines = 1)
            Text("${mm39(t.sP)} mm · ${ms39(t.sW)}", color = Color.White.copy(alpha = .8f), fontSize = 13.sp, maxLines = 1)
        }
    }
}

@Composable
private fun Agree39(days: List<CmpD39>) {
    val n = days.count { it.ok }
    Column(Modifier.fillMaxWidth().glass39().padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("$n av ${days.size}", color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Light, lineHeight = 36.sp)
            Text("dager der de er enige", color = Color.White.copy(alpha = .85f), fontSize = 14.sp, modifier = Modifier.padding(bottom = 4.dp))
        }
        Row(Modifier.fillMaxWidth()) {
            days.forEach { x ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(26.dp).clip(CircleShape).background(if (x.ok) Color.White else Color.Transparent).border(1.5.dp, if (x.ok) Color.White else Color(0xFFFFB3A6), CircleShape),
                        contentAlignment = Alignment.Center) { Text(if (x.ok) "✓" else "≠", color = if (x.ok) Color(0xFF22395A) else Color(0xFFFFB3A6), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold) }
                    Text(if (x.d == "I dag") "I D" else x.d.take(1).uppercase(), color = Color.White.copy(alpha = .7f), fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun GlimtWhy39(days: List<CmpD39>) {
    val worst = days.maxByOrNull { abs(it.dT ?: 0.0) + abs(it.yP - (it.sP ?: it.yP)) }
    val text = when {
        worst == null -> "Glimt venter på tallene fra Yr og Storm."
        days.all { it.ok } -> "Yr og Storm er enige hele uka. Det gir et trygt varsel."
        else -> {
            val rainY = wet(worst.yP); val rainS = worst.sP?.let(::wet) ?: rainY
            "Størst uenighet er ${worst.d.lowercase()}. " + when {
                rainY && !rainS -> "Yr venter regn (${mm39(worst.yP)} mm) og ${deg39(worst.yH)}, Storm venter nesten opphold og ${deg39(worst.sH)}. Ta med paraply for sikkerhets skyld."
                !rainY && rainS -> "Storm venter regn (${mm39(worst.sP)} mm) og ${deg39(worst.sH)}, Yr venter nesten opphold og ${deg39(worst.yH)}. Ta med paraply for sikkerhets skyld."
                else -> "Yr sier ${deg39(worst.yH)} og Storm ${deg39(worst.sH)}. Kle deg etter den kaldeste."
            }
        }
    }
    Row(Modifier.fillMaxWidth().glass39().padding(16.dp, 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        GlimtMark31(22.dp, GLIMT_FERDIG, dark = true)
        Text(text, color = Color.White, fontSize = 14.sp, lineHeight = 21.sp, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun List39(days: List<CmpD39>) {
    var tab by remember { mutableStateOf("t") }
    var open by remember { mutableIntStateOf(-1) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth().glass39(14).padding(3.dp)) {
            listOf("t" to "Temp", "p" to "Nedbør", "w" to "Vind").forEach { (k, n) ->
                Box(Modifier.weight(1f).height(34.dp).clip(RoundedCornerShape(11.dp)).background(if (tab == k) Color.White.copy(alpha = .22f) else Color.Transparent)
                    .clickable(role = Role.Tab) { Haptics.select(); tab = k }, contentAlignment = Alignment.Center) {
                    Text(n, color = if (tab == k) Color.White else Color.White.copy(alpha = .7f), fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Column(Modifier.fillMaxWidth().glass39().padding(horizontal = 14.dp, vertical = 4.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Spacer(Modifier.width(44.dp))
                Text("YR", color = Color(0xFF9FE3FF), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.End, modifier = Modifier.width(54.dp))
                // Størrelsesfiksen: «← Yr» og «Storm →» får hele bredden, aldri presset sammen.
                Row(Modifier.weight(1f)) {
                    Text("← Yr", color = Color.White.copy(alpha = .7f), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                    Spacer(Modifier.weight(1f))
                    Text("Storm →", color = Color.White.copy(alpha = .7f), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                }
                Text("STORM", color = Color(0xFFFFC79E), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.width(54.dp))
                Spacer(Modifier.width(12.dp))
            }
            days.forEachIndexed { i, x ->
                val (y, s, df, scale, u) = when (tab) {
                    "p" -> Quint39("${mm39(x.yP)} mm", x.sP?.let { "${mm39(it)} mm" } ?: "–", x.sP?.let { x.yP - it } ?: 0.0, 4.0, " mm")
                    "w" -> Quint39(ms39(x.yW), ms39(x.sW), if (x.yW != null && x.sW != null) x.yW - x.sW else 0.0, 4.0, " m/s")
                    else -> Quint39(deg39(x.yH), deg39(x.sH), x.dT ?: 0.0, 4.0, "°")
                }
                Column(Modifier.fillMaxWidth()) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .1f)))
                    Row(Modifier.fillMaxWidth().clickable { Haptics.select(); open = if (open == i) -1 else i }.padding(top = 10.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(x.d, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.width(44.dp))
                        Text(y, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End, maxLines = 1, modifier = Modifier.width(54.dp))
                        DevBar39(df, scale, u, Modifier.weight(1f))
                        Text(s, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.width(54.dp))
                        Text("›", color = Color.White.copy(alpha = .6f), fontSize = 14.sp, modifier = Modifier.width(12.dp).graphicsLayer { rotationZ = if (open == i) 90f else 0f })
                    }
                    if (open == i) {
                        val rainDis = x.sP != null && wet(x.yP) != wet(x.sP)
                        val big = abs(x.dT ?: 0.0) >= 2
                        Text(if (x.ok) "Enige" else if (rainDis && big) "Uenige om regn og temperatur" else if (rainDis) "Uenige om regn" else "Uenige om temperatur",
                            color = if (x.ok) Color(0xFF8FE3A8) else Color(0xFFFFB3A6), fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(Triple("YR", SKY_Y39, Triple("${deg39(x.yH)} / ${deg39(x.yL)}", "${mm39(x.yP)} mm · ${ms39(x.yW)}", Color(0xFF9FE3FF))),
                                Triple("STORM", SKY_S39, Triple("${deg39(x.sH)} / ${deg39(x.sL)}", "${mm39(x.sP)} mm · ${ms39(x.sW)}", Color(0xFFFFC79E)))).forEach { (n, c, v) ->
                                Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(c.copy(alpha = .14f)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(n, color = v.third, fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp)
                                    Text(v.first, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Medium)
                                    Text(v.second, color = Color.White.copy(alpha = .8f), fontSize = 12.5.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class Quint39(val a: String, val b: String, val c: Double, val d: Double, val e: String)

/** Midtstilt avvikssøyle: Yr høyere → blå mot venstre, Storm høyere → oransje mot høyre. */
@Composable
private fun DevBar39(df: Double, scale: Double, u: String, modifier: Modifier) {
    val yr = df > 0
    val f = (abs(df) / scale).coerceAtMost(1.0).toFloat() * .5f
    val label = if (abs(df) < .05) "" else (if (df > 0) "+" else "−") + (if (u == "°") "${abs(df.roundToInt())}" else mm39(abs(df))) + u
    Box(modifier.height(30.dp)) {
        if (label.isNotEmpty()) Text(label, color = if (yr) Color(0xFF9FE3FF) else Color(0xFFFFC79E), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold,
            maxLines = 1, modifier = Modifier.align(Alignment.TopCenter))
        Canvas(Modifier.fillMaxWidth().height(14.dp).align(Alignment.BottomCenter)) {
            val cy = size.height / 2
            drawLine(Color.Black.copy(alpha = .2f), Offset(0f, cy), Offset(size.width, cy), 2.dp.toPx(), cap = StrokeCap.Round)
            drawLine(Color.White.copy(alpha = .3f), Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), 1.dp.toPx())
            val w = max(if (abs(df) >= .05) size.width * .015f else 0f, size.width * f)
            if (w > 0f) {
                val x0 = if (yr) size.width / 2 - w else size.width / 2
                drawRoundRect(if (yr) SKY_Y39 else SKY_S39, Offset(x0, cy - 5.dp.toPx()), androidx.compose.ui.geometry.Size(w, 10.dp.toPx()), androidx.compose.ui.geometry.CornerRadius(5.dp.toPx()))
            }
        }
    }
}

@Composable
private fun Chart39(vm: AppViewModel, w: WeatherFull) {
    val c = vm.wxCmp22
    val hrs = wxNext24(w)
    Column(Modifier.fillMaxWidth().glass39().padding(14.dp, 14.dp, 14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("NESTE 24 TIMER", color = Color.White.copy(alpha = .65f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.weight(1f))
            Text("Yr", color = SKY_Y39, fontSize = 12.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.width(10.dp))
            Text("Storm", color = SKY_S39, fontSize = 12.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.width(10.dp))
            Text("Avvik", color = Color.White.copy(alpha = .75f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        if (c == null || hrs.size < 2) { Text("Ingen timeverdier fra Storm ennå.", color = Color.White.copy(alpha = .7f), fontSize = 12.5.sp); return@Column }
        val ys = hrs.map { c.yrHours[it.t.take(13)] ?: it.temp }
        val ss = hrs.map { c.pentHours[it.t.take(13)] }
        val all = (ys + ss).filterNotNull()
        if (all.isEmpty()) return@Column
        val lo = all.min() - 1; val hi = all.max() + 1
        Canvas(Modifier.fillMaxWidth().aspectRatio(320f / 140f)) {
            val n = hrs.size
            fun X(i: Int) = size.width * (24f + i * (296f / max(1, n - 1))) / 320f
            fun Y(v: Double) = (size.height * (8f + (1f - ((v - lo) / (hi - lo)).toFloat()) * 112f) / 140f)
            // Uenighetsbåndet mellom linjene.
            val band = Path()
            var started = false
            for (i in 0 until n) { val a = ys[i] ?: continue; if (!started) { band.moveTo(X(i), Y(a)); started = true } else band.lineTo(X(i), Y(a)) }
            for (i in n - 1 downTo 0) { val b = ss[i] ?: ys[i] ?: continue; band.lineTo(X(i), Y(b)) }
            band.close()
            drawPath(band, Color.White.copy(alpha = .16f))
            fun line(v: List<Double?>): Path { val p = Path(); var pen = false; v.forEachIndexed { i, a -> if (a == null) pen = false else { if (pen) p.lineTo(X(i), Y(a)) else p.moveTo(X(i), Y(a)); pen = true } }; return p }
            drawPath(line(ys), SKY_Y39, style = Stroke(2.4.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawPath(line(ss), SKY_S39, style = Stroke(2.4.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            ys.firstOrNull()?.let { drawCircle(Color.White, 4.dp.toPx(), Offset(X(0), Y(it))) }
        }
    }
}

@Composable
private fun Rain39(days: List<CmpD39>) {
    val pMax = max(1.0, days.maxOf { max(it.yP, it.sP ?: 0.0) })
    Column(Modifier.fillMaxWidth().glass39().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("NEDBØR PER DAG", color = Color.White.copy(alpha = .65f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Row(Modifier.fillMaxWidth().height(90.dp), verticalAlignment = Alignment.Bottom) {
            days.forEach { x ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        Box(Modifier.width(9.dp).height(max(2.0, x.yP / pMax * 64).dp).clip(RoundedCornerShape(3.dp)).background(SKY_Y39))
                        Box(Modifier.width(9.dp).height(max(2.0, (x.sP ?: 0.0) / pMax * 64).dp).clip(RoundedCornerShape(3.dp)).background(SKY_S39))
                    }
                    Text(if (x.d == "I dag") "I d" else x.d.take(2), color = Color.White.copy(alpha = .7f), fontSize = 10.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
        }
    }
}

/* ======================= Glimt · ukas vær ======================= */

/** Svaret fra /api/weather/week-summary. */
data class Week39(
    val text: String, val char: String, val chars: List<Triple<String, String, String>>,
    val tiles: List<Triple<String, String, String>>, val highlights: List<Pair<String, String>>,
)

private fun parseWeek39(raw: String): Week39? = runCatching {
    val o = JSONObject(raw)
    val text = o.optStr("text") ?: return@runCatching null
    fun arr(k: String) = o.optJSONArray(k)?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } } ?: emptyList()
    Week39(
        text, o.optStr("char") ?: "sky",
        arr("chars").map { Triple(it.optString("id"), it.optString("name"), it.optString("desc")) }.ifEmpty { listOf(Triple("sky", "Sky", "den rolige"), Triple("ugle", "Ugle", "tallknuseren"), Triple("spire", "Spire", "ut og lek")) },
        arr("tiles").map { Triple(it.optString("label"), it.optString("value"), it.optString("sub")) },
        arr("highlights").map { it.optString("label") to it.optString("text") },
    )
}.getOrNull()

/** Kortet nederst i Vær: valgt personlighet (Sky / Ugle / Spire), teksten, tre ruter og tre rader. Skjules når serveren mangler endepunktet. */
@Composable
internal fun WeekGlimt39(vm: AppViewModel, w: WeatherFull) {
    var data by remember(w.placeId) { mutableStateOf<Week39?>(null) }
    var char by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(w.placeId, char) {
        busy = true
        val q = "/weather/week-summary?place=" + java.net.URLEncoder.encode(w.placeId.ifBlank { w.place }, "UTF-8") + (char?.let { "&char=$it" } ?: "")
        runCatching { vm.api39 { hlGet(q, timeout = 20_000) } }.getOrNull()?.let(::parseWeek39)?.let { data = it }
        busy = false
    }
    val d = data ?: return
    val cur = char ?: d.char
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White.copy(alpha = .12f)).border(1.dp, Color.White.copy(alpha = .08f), RoundedCornerShape(24.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("GLIMT · UKAS VÆR", color = Color.White.copy(alpha = .7f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            d.chars.forEach { (id, n, desc) ->
                val on = id == cur
                Row(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(if (on) Color.White.copy(alpha = .22f) else Color.Transparent)
                    .border(1.dp, Color.White.copy(alpha = if (on) .4f else .15f), RoundedCornerShape(14.dp))
                    .clickable(role = Role.RadioButton) {
                        Haptics.select(); char = id
                        vm.launch39 { runCatching { vm.api39 { hlPut("/weather/week-summary", JSONObject().put("char", id)) } } }
                    }.padding(6.dp, 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    GlimtFig35(id, 26.dp, if (on) "glad" else "idle", still = !on)
                    Column {
                        Text(n, color = Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        Text(desc, color = Color.White.copy(alpha = .7f), fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        Text(d.text, color = Color.White, fontSize = 15.sp, lineHeight = 22.sp, modifier = Modifier.graphicsLayer { alpha = if (busy) .6f else 1f })
        if (d.tiles.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            d.tiles.forEach { (l, v, s) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .08f)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(l, color = Color.White.copy(alpha = .65f), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                    Text(v, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(s, color = Color.White.copy(alpha = .7f), fontSize = 11.sp, maxLines = 2)
                }
            }
        }
        d.highlights.forEach { (l, t) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(l, color = Color.White.copy(alpha = .7f), fontSize = 13.sp, modifier = Modifier.width(110.dp))
                Text(t, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            }
        }
    }
}
